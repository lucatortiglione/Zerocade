"""Dalle fonti ai prompt validi: NVdB e ItAoA, filtri, verbali, scarti e revisione LLM (con fixture)."""
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
import zipfile

from filter_prompts import build
from prompt_inventory import import_source, initialize_inventory, records
from review_prompts import after_new_words, import_decisions, llm_review, pending
from sqlite_prompt_runtime import CACHE, SQLite

ZIPF = {'gatto': 4.5, 'fare': 6.2, 'acciuga': 2.6, 'abbassato': 3.4, 'flimk': 4.0, 'abbassare': 3.5}


def source(key, kind, **extra):
    return {'id': key, 'name': 'Fixture '+key, 'kind': kind, 'url': 'https://example.invalid/'+key,
            'license': 'Fixture tecnica', 'attribution': 'Test', **extra}


def entry(word, pos, gloss):
    return json.dumps({'word': word, 'lang_code': 'it', 'pos': pos, 'senses': [{'glosses': [gloss]}]})


def xlsx(path: Path, rows: list[list]):
    """Un .xlsx minimo: foglio 1 descrittivo, foglio 2 con i dati in celle inlineStr e numeriche."""
    def cell(ref, value):
        if isinstance(value, (int, float)): return f'<c r="{ref}"><v>{value}</v></c>'
        return f'<c r="{ref}" t="inlineStr"><is><t>{value}</t></is></c>'
    sheet = ''.join(f'<row r="{i}">' + ''.join(cell(f'{chr(65+j)}{i}', v) for j, v in enumerate(r)) + '</row>'
                    for i, r in enumerate(rows, 1))
    ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
    with zipfile.ZipFile(path, 'w') as book:
        book.writestr('xl/worksheets/sheet1.xml', f'<worksheet {ns}><sheetData/></worksheet>')
        book.writestr('xl/worksheets/sheet2.xml', f'<worksheet {ns}><sheetData>{sheet}</sheetData></worksheet>')


class SourceParserTests(unittest.TestCase):
    def test_nvdb_and_itaoa_rows(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            (d/'nvdb.txt').write_text('gatto s.m.\nabbandonato p.pass., agg., s.m.\n', encoding='utf-8')
            rows = list(records(d/'nvdb.txt', source('nvdb-de-mauro-2016', 'nvdb_text', list_name='NVdB 2016')))
            self.assertEqual([(r['prompt'], r['role'], r['details']['basic_vocabulary']) for r in rows],
                             [('gatto', 'lemma', 'NVdB 2016'), ('abbandonato', 'lemma', 'NVdB 2016')])
            xlsx(d/'aoa.xlsx', [['Ita_Word', 'WordClass', 'M_AoA'], ['gatto', 'n', 2.56], ['correre', 'v', 3.92]])
            rows = list(records(d/'aoa.xlsx', source('itaoa-montefinese-2019', 'xlsx_table', sheet=2, word_column='Ita_Word',
                                                    pos_column='WordClass', pos_map={'n': 'noun', 'v': 'verb'},
                                                    value_columns={'M_AoA': 'aoa_mean'})))
            self.assertEqual([(r['prompt'], r['pos'], r['details']['aoa_mean']) for r in rows],
                             [('gatto', 'noun', 2.56), ('correre', 'verb', 3.92)])


@unittest.skipUnless((CACHE/'sqlite3.exe').exists(), 'Runtime ufficiale non installato; i test non scaricano eseguibili')
class ReviewPipelineTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        d = self.dir = Path(self.tmp.name)
        self.raw, self.filtered, self.valid = d/'prompt_raw.sqlite3', d/'prompt_filtrati.sqlite3', d/'prompt_validi.sqlite3'
        db = SQLite(self.raw); initialize_inventory(db)
        (d/'wiki.jsonl').write_text('\n'.join([
            entry('gatto', 'noun', 'piccolo felino domestico'), entry('fare', 'verb', 'realizzare qualcosa'),
            entry('acciuga', 'noun', 'piccolo pesce di mare'), entry('abbassato', 'adj', 'attributo araldico'),
            entry('flimk', 'noun', 'parola straniera inventata')]), encoding='utf-8')
        (d/'morph.txt').write_text('gatto\tgatto\tNOUN-M:s\nfare\tfare\tVER:inf+pres\nfacendo\tfare\tVER:ger+pres\n'
                                    'abbassato\tabbassare\tVER:part+past+s+m\nacciuga\tacciuga\tNOUN-F:s\n', encoding='latin-1')
        (d/'nvdb.txt').write_text('gatto s.m.\nacciuga s.f.\n', encoding='utf-8')
        xlsx(d/'aoa.xlsx', [['Ita_Word', 'WordClass', 'M_AoA'], ['gatto', 'n', 2.56]])
        for key, kind, path, extra in [
                ('kaikki-itwiktionary', 'wiktextract', 'wiki.jsonl', {}), ('morphit-fixture', 'morphit', 'morph.txt', {}),
                ('nvdb-de-mauro-2016', 'nvdb_text', 'nvdb.txt', {}),
                ('itaoa-montefinese-2019', 'xlsx_table', 'aoa.xlsx', {'sheet': 2, 'word_column': 'Ita_Word', 'pos_column': 'WordClass',
                                                                     'pos_map': {'n': 'noun'}, 'value_columns': {'M_AoA': 'aoa_mean'}})]:
            self.assertEqual(import_source(db, source(key, kind, **extra), d/path)['status'], 'IMPORTED')
        self.db = db

    def build(self):
        return build(self.raw, self.filtered, None, zipf=lambda w: ZIPF.get(w, 0.0))

    def test_filters_then_review_then_validated_database(self):
        result = self.build()
        self.assertEqual(result['rejection_reasons'], {'solo_participio': 1, 'prestito_non_in_lista': 1})
        f = sqlite3.connect(self.filtered)
        rows = {p: (n, a, json.loads(fl)) for p, n, a, fl in f.execute('SELECT prompt, nvdb, aoa, flags FROM filtered_prompts')}
        f.close()
        self.assertEqual(set(rows), {'gatto', 'fare', 'acciuga'})
        self.assertEqual(rows['gatto'][:2], (1, 2.56))
        self.assertIn('familiare_per_nvdb', rows['acciuga'][2])  # Zipf 2,6: la salva il vocabolario di base.
        # L'ordine di revisione mette prima le parole di base imparate da piccoli.
        self.assertEqual([c['prompt'] for c in pending(self.raw, self.filtered)], ['gatto', 'acciuga', 'fare'])

        decisions = [
            {'prompt': 'gatto', 'decision': 'verified', 'pos': 'NOUN', 'sense': 'Piccolo felino domestico',
             'category_id': '046', 'prompt_rationale': 'Senso dominante: il gatto di casa, evoca fusa e croccantini.',
             'category_rationale': 'Animale domestico per eccellenza: ambito della cura degli animali.'},
            {'prompt': 'fare', 'decision': 'rejected', 'reason': 'Verbo troppo generico'},
        ]
        with self.assertRaisesRegex(ValueError, 'non è tra i candidati'):
            import_decisions([{'prompt': 'abbassato', 'decision': 'rejected', 'reason': 'Participio'}], 'Test',
                             raw=self.raw, filtered=self.filtered, destination=self.valid)
        result = import_decisions(decisions, 'Revisore di prova', raw=self.raw, filtered=self.filtered, destination=self.valid)
        # prompt_validi.sqlite3 accoglie solo prompt con parole associate: «gatto» non ha ancora un bacino.
        self.assertEqual((result['verified'], result['rejected_or_deferred'], result['valid_prompts']), (1, 1, 0))
        v = sqlite3.connect(self.valid)
        self.assertEqual(v.execute('SELECT count(*) FROM validated_prompts').fetchone()[0], 0)
        v.close()
        record = json.loads(self.db.run("SELECT v.record_json FROM prompt_validation_heads h JOIN prompt_validations v "
                                        "ON v.id = h.validation_id WHERE h.prompt = 'gatto';", rows=True)[0]['record_json'])
        # Le voci valide come prompt sono copiate in prompt_filtrati.sqlite3, con senso e categoria del verbale.
        self.build()
        f = sqlite3.connect(self.filtered)
        self.assertEqual(f.execute("SELECT pos, category_id, reviewer, passes_automatic_filters FROM validated_prompts "
                                   "WHERE prompt = 'gatto'").fetchone(), ('NOUN', '046', 'Revisore di prova', 1))
        self.assertEqual(dict(f.execute('SELECT prompt, state FROM review_state')), {'gatto': 'VALIDATO', 'acciuga': 'DA_RIVEDERE'})
        f.close()
        self.assertEqual(record['review']['reviewer'], 'Revisore di prova')
        self.assertFalse(record['review']['human_review'])
        self.assertIn('Nuovo vocabolario di base', record['review']['familiarity_rationale'])
        self.assertEqual({e['source_id'] for e in record['evidence']},
                         {'kaikki-itwiktionary', 'nvdb-de-mauro-2016', 'itaoa-montefinese-2019'})
        self.assertEqual(self.db.run("SELECT decision FROM inventory_term_decisions WHERE prompt = 'fare';", rows=True),
                         [{'decision': 'DISCARDED'}])
        self.assertEqual([c['prompt'] for c in pending(self.raw, self.filtered)], ['acciuga'])

        # Revisione con un LLM finto: stesso percorso di verbali e copia.
        fake = lambda c, endpoint, model: {
            'prompt': c['prompt'], 'decision': 'verified', 'pos': 'NOUN', 'sense': 'Piccolo pesce azzurro di mare',
            'category_id': '003', 'prompt_rationale': 'Pesce azzurro comune: evoca alici, pizza e mare.',
            'category_rationale': 'Pesce come alimento: ambito dei prodotti ittici.', 'reason': ''}
        result = llm_review(None, raw=self.raw, filtered=self.filtered, destination=self.valid, decide=fake)
        self.assertEqual((result['reviewed'], result['failed']), (1, []))
        self.assertEqual(pending(self.raw, self.filtered), [])
        # Al prossimo filtro la parola scartata non torna tra i candidati.
        self.build()
        self.assertEqual({c['prompt'] for c in pending(self.raw, self.filtered)}, set())
        Path(result['decisions_file']).unlink()

    def test_refresh_hook_never_touches_the_real_databases_from_a_test_collection(self):
        self.assertIsNone(after_new_words(self.raw))

    def test_discarded_database_keeps_stage_reason_and_separates_deferrals(self):
        from discarded_prompt_database import sync_discarded
        from inventory_updates import decide_term
        self.build()
        discarded = self.dir/'prompt_scartati.sqlite3'
        def entries():
            db = sqlite3.connect(discarded)
            try:
                return {p:(reason,stage) for p,reason,stage in db.execute(
                    'SELECT prompt,reason,stage FROM discarded_prompts')}
            finally:
                db.close()
        rows = entries()
        self.assertEqual(rows['abbassato'],('solo_participio','AUTOMATIC_FILTER'))
        self.assertEqual(rows['flimk'],('prestito_non_in_lista','AUTOMATIC_FILTER'))
        self.assertEqual(rows['facendo'][0],'nessuna_prova_di_lemma')
        self.assertNotIn('gatto',rows)
        before = self.db.run('SELECT count(*) AS n FROM inventory_terms;',rows=True)
        decide_term(self.db,'gatto','DISCARDED','Scarto esplicito usato solo nella fixture','Test')
        decide_term(self.db,'fare','DEFERRED','Da rivedere nella fixture','Test')
        sync_discarded(self.raw,self.filtered,discarded)
        rows = entries()
        self.assertEqual(rows['gatto'],('Scarto esplicito usato solo nella fixture','EDITORIAL_DECISION'))
        self.assertNotIn('fare',rows)
        self.assertEqual(before,self.db.run('SELECT count(*) AS n FROM inventory_terms;',rows=True))
        # Una riconsiderazione toglie lo scarto corrente; lo storico resta nella raccolta.
        decide_term(self.db,'gatto','INTEGRATED','Riconsiderazione nella fixture','Test')
        sync_discarded(self.raw,self.filtered,discarded)
        self.assertNotIn('gatto',entries())

    def test_discarded_database_never_labels_new_unfiltered_words_as_discarded(self):
        from discarded_prompt_database import sync_discarded
        self.build()
        discarded = self.dir/'prompt_scartati.sqlite3'
        before = discarded.read_bytes()
        self.db.run("INSERT INTO inventory_terms(prompt,is_single_word,has_lemma_evidence,has_inflected_evidence,"
                    "has_proper_name_evidence,has_it_dictionary_evidence,review_status) "
                    "VALUES ('nuovaparola',1,1,0,0,1,'COLLECTED');")
        with self.assertRaisesRegex(ValueError,'Raccolta cambiata'):
            sync_discarded(self.raw,self.filtered,discarded)
        self.assertEqual(discarded.read_bytes(),before)


if __name__ == '__main__':
    unittest.main()

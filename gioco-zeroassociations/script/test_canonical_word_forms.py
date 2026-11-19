"""Criteri scelti dall'utente: genere attestato (16/11/2026) e lemma al posto delle forme flesse (17/11/2026)."""
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

from canonical_word_forms import FamilyEvidence, detect_canonical, features, select_families
from test_normalize_words import make


def form(gender, number):
    return {'gender': set(gender.split()), 'number': set(number.split()), 'sources': {'fixture'}}


class PluralOfExcludedFormTests(unittest.TestCase):
    def test_the_plural_follows_its_singular_when_the_feminine_gives_way_to_the_masculine(self):
        evidence=FamilyEvidence({'massaio','massaia','massaie'})
        def add(source,kind,word,lemma,role,pos,details=None):
            evidence.add(source,kind,{'prompt':word,'lemma':lemma,'role':role,'pos':pos,'details':details or {}})
        add('morphit-048-mirror','morphit','massaia','massaia','lemma','NOUN-F:s')
        add('morphit-048-mirror','morphit','massaie','massaia','inflected_form','NOUN-F:p')
        add('morphit-048-mirror','morphit','massaio','massaio','lemma','NOUN-M:s')
        # Un'altra fonte dà come lemma di massaie il maschile: le letture sono in conflitto e la parola restava.
        add('flex-it-nouns','flex_it','massaie','massaio','inflected_form','NOUN',{'gender':'femm','number':'plur'})
        add('flex-it-nouns','flex_it','massaia','massaio','inflected_form','NOUN',{'gender':'femm','number':'sing'})
        add('kaikki-enwiktionary-it','wiktextract','massaia','massaia','lemma','noun',
            {'entry_tags':['feminine','singular'],'forms':[{'form':'massaie','tags':['feminine','plural']}]})
        selected=evidence.finish(lambda w:0.0)
        self.assertEqual(selected['massaia'],['massaio'])
        self.assertEqual(selected['massaie'],['massaio'])
        self.assertNotIn('massaio',selected)
        # Anche con le frequenze reali (massaia 2,5 contro massaio 1,15) il maschile vince: il femminile resta solo senza maschile.
        common=evidence.finish({'massaio':1.15,'massaia':2.5,'massaie':2.3}.get)
        self.assertEqual(common,{'massaia':['massaio'],'massaie':['massaio']})
        self.assertNotIn('massaio',common)


class MostCommonLemmaTests(unittest.TestCase):
    def test_a_plural_only_lemma_never_replaces_the_singular(self):
        evidence=FamilyEvidence({'cuffia','cuffie'})
        for word,lemma,pos in [('cuffia','cuffia','NOUN-F:s'),('cuffie','cuffia','NOUN-F:p'),('cuffie','cuffie','NOUN-F:p')]:
            evidence.add('morphit-048-mirror','morphit',{'prompt':word,'lemma':lemma,'role':'lemma' if word==lemma else 'inflected_form','pos':pos,'details':{}})
        selected=evidence.finish({'cuffia':3.36,'cuffie':3.92}.get)
        self.assertNotIn('cuffia',selected)


class OrthographicPluralTests(unittest.TestCase):
    def test_unattested_regular_plurals_leave_the_place_to_the_singular(self):
        words={'mazzinianesimo','mazzinianesimi','farmacista','farmacisti','religioni','religione','monaci','monaco','tesi','teso','sistemi'}
        selected=FamilyEvidence(words).finish(lambda w:{'tesi':4.5,'teso':3.9}.get(w,0.0))
        self.assertEqual(selected['mazzinianesimi'],['mazzinianesimo'])
        self.assertEqual(selected['farmacisti'],['farmacista'])
        self.assertEqual(selected['religioni'],['religione'])
        self.assertEqual(selected['monaci'],['monaco'])
        self.assertNotIn('tesi',selected)        # il singolare apparente è molto meno frequente
        self.assertNotIn('sistemi',selected)     # senza 'sistemo' nella raccolta
        self.assertNotIn('mazzinianesimo',selected)

    def test_words_with_morphological_attestation_are_not_guessed(self):
        evidence=FamilyEvidence({'mazzinianesimo','mazzinianesimi'})
        evidence.add('morphit-048-mirror','morphit',{'prompt':'mazzinianesimi','lemma':'mazzinianesimi','role':'lemma','pos':'NOUN-M:s','details':{}})
        self.assertNotIn('mazzinianesimi',evidence.finish(lambda w:0.0))


class CanonicalTests(unittest.TestCase):
    def test_morphological_number_has_priority_over_contextual_mistag(self):
        evidence=FamilyEvidence({'stoviglia','stoviglie'})
        for word,pos in [('stoviglia','NOUN-F:s'),('stoviglie','NOUN-F:p')]:
            evidence.add('morphit-048-mirror','morphit',{
                'prompt':word,'lemma':'stoviglia','role':'lemma' if word=='stoviglia' else 'inflected_form',
                'pos':pos,'details':{}})
        evidence.add('ud-fixture','conllu',{'prompt':'stoviglie','lemma':'stoviglia','role':'inflected_form',
                     'pos':'NOUN','details':{'features':'Gender=Fem|Number=Sing'}})
        evidence.add('morphit-048-mirror','morphit',{'prompt':'stoviglie','lemma':'stoviglie','role':'lemma','pos':'NOUN-F:p','details':{}})
        selected=evidence.finish({'stoviglia':1.4,'stoviglie':3.15}.__getitem__)
        # Il plurale ha una voce propria ed è nettamente più comune (3,15 contro 1,4): è la forma tenuta, il singolare esce (regola del 18/11/2026).
        self.assertEqual(selected,{'stoviglia':['stoviglie']})
        self.assertEqual(selected.evidence['stoviglia']['rule'],'common_plural')

    def test_dictionary_comparatives_do_not_replace_positive_degree(self):
        evidence=FamilyEvidence({'buono','buoni','migliore','migliori'})
        evidence.add('kaikki-itwiktionary','wiktextract',{
            'prompt':'buono','lemma':'buono','role':'lemma','pos':'adj',
            'details':{'entry_tags':['masculine','singular'],'forms':[
                {'form':'buoni','tags':['masculine','plural']},
                {'form':'migliore','tags':['comparative','masculine','singular']},
                {'form':'migliori','tags':['comparative','masculine','plural']}]}})
        for word,pos in [('migliore','ADJ:comp+m+s'),('migliori','ADJ:comp+m+p')]:
            evidence.add('morphit-048-mirror','morphit',{
                'prompt':word,'lemma':'buono','role':'inflected_form','pos':pos,'details':{}})
        selected=evidence.finish({'buono':6,'buoni':5,'migliore':4,'migliori':8}.__getitem__)
        self.assertNotIn('buono',selected)
        # Il comparativo resta una famiglia distinta, rappresentata dal maschile singolare anche se meno frequente.
        self.assertEqual(selected['migliori'],['migliore'])
        self.assertEqual(selected['buoni'],['buono'])

    def test_the_lemma_wins_whatever_the_frequency(self):
        family = {('stoviglia','NOUN'): {'stoviglia': form('Fem','Sing'), 'stoviglie': form('Fem','Plur')}}
        selected = select_families(family, set(), lambda w: {'stoviglia':1.4,'stoviglie':3.15}[w])
        self.assertEqual(selected, {'stoviglie':['stoviglia']})
        self.assertEqual(selected.evidence['stoviglie']['rule'], 'inflected_form')
        self.assertEqual(select_families(family, set(), lambda w: 2), {'stoviglie':['stoviglia']})

    def test_a_variant_without_gender_or_number_is_not_an_inflected_form(self):
        family = {('obiettivo','NOUN'): {'obiettivo': form('Masc','Sing'), 'obbiettivo': {'gender':set(),'number':set(),'sources':{'fixture'}},
                                        'obiettivi': form('Masc','Plur')}}
        self.assertEqual(select_families(family, set(), lambda w: 3), {'obiettivi':['obiettivo']})

    def test_the_masculine_is_kept_whenever_it_exists_whatever_the_frequency(self):
        family = {('bello','ADJ'): {'bello':form('Masc','Sing'), 'bella':form('Fem','Sing')}}
        self.assertEqual(select_families(family, set(), lambda w: 5.3 if w=='bella' else 5), {'bella':['bello']})
        self.assertEqual(select_families(family, set(), lambda w: 9 if w=='bella' else 1), {'bella':['bello']})  # anche se il femminile è più comune
        massaio = {('massaio','NOUN'): {'massaio':form('Masc','Sing'), 'massai':form('Masc','Plur'),
                                        'massaia':form('Fem','Sing'), 'massaie':form('Fem','Plur')}}
        selected = select_families(massaio, set(), {'massaio':1.15,'massai':1.9,'massaia':2.5,'massaie':2.3}.get)
        self.assertEqual(selected, {'massaia':['massaio'],'massai':['massaio'],'massaie':['massaio']})
        self.assertEqual(selected.evidence['massaia']['rule'], 'feminine_with_masculine')
        # Il femminile resta solo se un maschile equivalente non esiste.
        female_only = {('casa','NOUN'): {'casa':form('Fem','Sing'), 'case':form('Fem','Plur')}}
        self.assertEqual(select_families(female_only, set(), lambda w: 6 if w=='casa' else 4), {'case':['casa']})

    def test_forms_with_conflicting_lemma_readings_are_reduced_to_the_present_lemma(self):
        # funeste: aggettivo funesto per alcune fonti, nome funesta per altre; raccolti: anche forma del verbo raccogliere.
        known = {'funesto','funesta','funeste','funesti','raccolto','raccolti','raccogliere','motore','motori','motorio'}
        evidence = FamilyEvidence(known)
        def add(source, kind, word, lemma, role, pos):
            evidence.add(source, kind, {'prompt': word, 'lemma': lemma, 'role': role, 'pos': pos, 'details': {}})
        for word, lemma, pos in (('funesto','funesto','ADJ:pos+m+s'),('funesti','funesto','ADJ:pos+m+p'),('funesta','funesto','ADJ:pos+f+s'),('funeste','funesto','ADJ:pos+f+p')):
            add('morphit-048-mirror','morphit',word,lemma,'lemma' if word==lemma else 'inflected_form',pos)
        add('morphit-048-mirror','morphit','funesta','funesta','lemma','NOUN-F:s')
        add('morphit-048-mirror','morphit','funeste','funesta','inflected_form','NOUN-F:p')
        add('morphit-048-mirror','morphit','raccolto','raccolto','lemma','ADJ:pos+m+s')
        add('morphit-048-mirror','morphit','raccolti','raccolto','inflected_form','ADJ:pos+m+p')
        add('morphit-048-mirror','morphit','raccolti','raccogliere','inflected_form','VER:part+past+p+m')
        for word, lemma, pos in (('motore','motore','NOUN-M:s'),('motori','motore','NOUN-M:p')):
            add('morphit-048-mirror','morphit',word,lemma,'lemma' if word==lemma else 'inflected_form',pos)
        add('morphit-048-mirror','morphit','motori','motorio','inflected_form','ADJ:pos+m+p')
        selected = evidence.finish(lambda w: 3)
        self.assertEqual(selected.get('funeste'), ['funesto'])
        self.assertEqual(selected.get('funesti'), ['funesto'])
        self.assertEqual(selected.get('raccolti'), ['raccolto'])
        self.assertIn('motori', selected)
        for lemma in ('funesto','raccolto','motore'):
            self.assertNotIn(lemma, selected)

    def test_gender_is_chosen_before_number_and_ambiguous_readings_stay(self):
        family = {('bello','ADJ'): {'bello':form('Masc','Sing'), 'belli':form('Masc','Plur'),
                                   'bella':form('Fem','Sing'), 'belle':form('Fem','Plur')}}
        scores = {'bello':5,'belli':4,'bella':5.2,'belle':6}
        selected = select_families(family, set(), scores.__getitem__)
        self.assertEqual(selected, {'bella':['bello'],'belle':['bello'],'belli':['bello']})
        self.assertEqual(selected.evidence['bella']['rule'], 'feminine_with_masculine')
        self.assertNotIn('bella',select_families(family, {'bella'}, scores.__getitem__))

    def test_gender_change_in_plural_is_an_inflected_form_of_the_lemma(self):
        family = {('uovo','NOUN'): {'uovo':form('Masc','Sing'), 'uova':form('Fem','Plur'), 'uovi':form('Masc','Plur')}}
        selected = select_families(family, set(), {'uova':5,'uovo':3,'uovi':1}.__getitem__)
        self.assertEqual(selected, {'uova':['uovo'],'uovi':['uovo']})
        self.assertEqual(selected.evidence['uova']['rule'], 'inflected_form')

    def test_a_feminine_lemma_with_a_masculine_equivalent_gives_way_to_it(self):
        family = {('infermiera','NOUN'): {'infermiera':form('Fem','Sing'), 'infermiere':form('Masc','Sing'), 'infermieri':form('Masc','Plur')}}
        selected = select_families(family, set(), lambda w: 3)
        self.assertEqual(selected['infermiera'], ['infermiere'])
        self.assertEqual(selected['infermieri'], ['infermiere'])

    def test_a_lemma_seen_elsewhere_only_as_a_verb_form_stays_as_the_replacement(self):
        # "ali" plurale di "ala"; "ala" compare come lemma della famiglia ma, come riga propria, solo da forma verbale.
        evidence = FamilyEvidence({'ala','ali','alare'})
        evidence.add('morphit-048-mirror','morphit',{'prompt':'ali','lemma':'ala','role':'inflected_form','pos':'NOUN-F:p','details':{}})
        # Una riga con source_scope=explicit_lemma segna la forma verbale ma non registra la lettura: "ala" non risulta ambigua.
        evidence.add('morphit-048-mirror','morphit',{'prompt':'ala','lemma':'alare','role':'inflected_form','pos':'VER:ind+pres+3+s',
                                                     'details':{'source_scope':'explicit_lemma'}})
        selected = evidence.finish(lambda w: 3)
        self.assertEqual(selected.get('ali'), ['ala'])
        self.assertNotIn('ala', selected)
        for word, target in selected.items():
            self.assertFalse(target and target[0] in selected, word)

    def test_verbs_with_clitic_particles_are_not_infinitives(self):
        from canonical_word_forms import is_infinitive
        self.assertTrue(is_infinitive('morphit-048-mirror', 'VER:inf+pres', {}))
        self.assertFalse(is_infinitive('morphit-048-mirror', 'VER:inf+pres+gliela', {}))
        evidence = FamilyEvidence({'offrire', 'offrirgliela', 'offrendogliene', 'offrendoci'})
        evidence.add('morphit-048-mirror', 'morphit', {'prompt': 'offrirgliela', 'lemma': 'offrire', 'role': 'inflected_form',
                                                       'pos': 'VER:inf+pres+gliela', 'details': {}})
        evidence.add('morphit-048-mirror', 'morphit', {'prompt': 'offrire', 'lemma': 'offrire', 'role': 'lemma',
                                                       'pos': 'VER:inf+pres', 'details': {}})
        # Wiktionary inglese le dà come lemma verbale con tag «compound-of», senza form_of.
        for word in ('offrirgliela', 'offrendogliene', 'offrendoci'):
            evidence.add('kaikki-enwiktionary-it', 'wiktextract', {'prompt': word, 'lemma': word, 'role': 'lemma', 'pos': 'verb',
                         'details': {'senses': [{'tags': ['compound-of'], 'glosses': ['compound of ...']}], 'entry_tags': []}})
        selected = evidence.finish(lambda w: 3)
        self.assertEqual(selected.get('offrirgliela'), ['offrire'])
        self.assertIn('offrendogliene', selected)
        self.assertIn('offrendoci', selected)
        self.assertNotIn('offrire', selected)

    def test_participle_adjective_noun_with_gerund_and_truncated_infinitive_are_reduced_to_lemmas(self):
        known = {'specializzare', 'specializzato', 'specializzata', 'specializzati', 'specializzate', 'specializzando',
                 'specializzanda', 'specializzandi', 'specializzar'}
        evidence = FamilyEvidence(known)
        def add(source, kind, word, lemma, role, pos, details=None):
            evidence.add(source, kind, {'prompt': word, 'lemma': lemma, 'role': role, 'pos': pos, 'details': details or {}})
        # aggettivo specializzato e le sue flessioni, che per Morph-it sono anche participi di specializzare
        for word, pos, vpos in (('specializzato', 'ADJ:pos+m+s', 'VER:part+past+s+m'), ('specializzata', 'ADJ:pos+f+s', 'VER:part+past+s+f'),
                                ('specializzati', 'ADJ:pos+m+p', 'VER:part+past+p+m'), ('specializzate', 'ADJ:pos+f+p', 'VER:part+past+p+f')):
            add('morphit-048-mirror', 'morphit', word, 'specializzato', 'inflected_form' if word != 'specializzato' else 'lemma', pos)
            add('morphit-048-mirror', 'morphit', word, 'specializzare', 'inflected_form', vpos)
        # Wiktionary italiano: il participio senza etichetta
        add('kaikki-itwiktionary', 'wiktextract', 'specializzata', 'specializzare', 'inflected_form', 'verb',
            {'entry_tags': ['form-of'], 'senses': [{'tags': ['form-of'], 'form_of': [{'word': 'specializzare'}]}]})
        # nome specializzando, che è anche gerundio di specializzare
        for word, gender, number in (('specializzando', 'masculine', 'singular'), ('specializzandi', 'masculine', 'plural'),
                                     ('specializzanda', 'feminine', None)):
            tags = [gender] + ([number] if number else [])
            add('kaikki-enwiktionary-it', 'wiktextract', word, 'specializzando', 'lemma' if word == 'specializzando' else 'inflected_form', 'noun',
                {'entry_tags': [], 'senses': [{'tags': tags, 'form_of': [] if word == 'specializzando' else [{'word': 'specializzando'}]}]})
        add('morphit-048-mirror', 'morphit', 'specializzando', 'specializzare', 'inflected_form', 'VER:ger+pres')
        # infinito troncato
        add('morphit-048-mirror', 'morphit', 'specializzar', 'specializzare', 'inflected_form', 'VER:inf+pres')
        add('morphit-048-mirror', 'morphit', 'specializzare', 'specializzare', 'lemma', 'VER:inf+pres')
        selected = evidence.finish(lambda w: 3)
        for word in ('specializzata', 'specializzati', 'specializzate'):
            self.assertEqual(selected.get(word), ['specializzato'], word)
        self.assertEqual(selected.get('specializzandi'), ['specializzando'])
        self.assertEqual(selected.get('specializzanda'), ['specializzando'])
        self.assertEqual(selected.get('specializzar'), ['specializzare'])
        for lemma in ('specializzato', 'specializzando', 'specializzare'):
            self.assertNotIn(lemma, selected)

    def test_reflexive_infinitives_give_way_to_the_simple_infinitive_unless_essentially_pronominal(self):
        known = {'lavare', 'lavarsi', 'offrire', 'offrirsi', 'accorgersi', 'tradurre', 'tradursi', 'persi', 'pere', 'perdere'}
        evidence = FamilyEvidence(known)
        for word, lemma in (('lavare', 'lavare'), ('lavarsi', 'lavarsi'), ('offrire', 'offrire'), ('offrirsi', 'offrirsi'),
                            ('accorgersi', 'accorgersi'), ('tradurre', 'tradurre'), ('tradursi', 'tradursi')):
            evidence.add('liita-lemma-bank', 'liita_ttl', {'prompt': word, 'lemma': lemma, 'role': 'lemma', 'pos': 'verb', 'details': {}})
        # «persi» è un participio di perdere e «pere» un nome: la forma in -rsi non è un infinito riflessivo.
        evidence.add('morphit-048-mirror', 'morphit', {'prompt': 'persi', 'lemma': 'perdere', 'role': 'inflected_form',
                                                       'pos': 'VER:part+past+m+p', 'details': {}})
        evidence.add('morphit-048-mirror', 'morphit', {'prompt': 'pere', 'lemma': 'pera', 'role': 'inflected_form',
                                                       'pos': 'NOUN-F:p', 'details': {}})
        selected = evidence.finish(lambda w: 3)
        self.assertEqual(selected.get('lavarsi'), ['lavare'])
        self.assertEqual(selected.get('offrirsi'), ['offrire'])
        self.assertEqual(selected.get('tradursi'), ['tradurre'])
        self.assertEqual(selected.evidence['lavarsi']['rule'], 'reflexive_infinitive')
        self.assertNotIn('accorgersi', selected)
        self.assertNotIn('lavare', selected)
        self.assertNotEqual(selected.get('persi'), ['pere'])

    def test_feature_tags_and_database_links_do_not_use_word_endings(self):
        self.assertEqual(features('morphit-048-mirror','ADJ:pos+f+s',{}), ({'Fem'},{'Sing'}))
        self.assertEqual(features('unimorph-ita','ADJ',{'features':'ADJ;FEM;PL'}), ({'Fem'},{'Plur'}))
        self.assertEqual(features('ud-isdt-train','NOUN',{'features':'Gender=Masc|Number=Sing'}), ({'Masc'},{'Sing'}))
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)/'raw.sqlite3'; make(path)
            with closing(sqlite3.connect(path)) as con, con:
                for tag, pos in enumerate(['NOUN-F:s','NOUN-F:p','ADJ:pos+m+s','ADJ:pos+f+s','VER:pres+ind+2+s'],1):
                    con.execute('INSERT INTO raw__inventory_attestation_pos VALUES (?,?)',(tag,pos))
                rows = [('stoviglia','stoviglia',1),('stoviglie','stoviglia',2),
                        ('bello','bello',3),('bella','bello',4),('banca','banca',1),
                        ('banco','banco',0),('voli','volo',0),('voli','volare',5)]
                for word, lemma, tag in rows:
                    con.execute("INSERT INTO raw__inventory_attestation_rows_json VALUES (0,?,'',0,?,?,?,'{}')",(word,tag,word,lemma))
                for word in {v for row in rows for v in row[:2]}:
                    con.execute('INSERT INTO raw__inventory_terms VALUES (?,1)',(word,))
            scores = {'stoviglia':1.4,'stoviglie':3.15,'bello':6,'bella':5.2,'voli':1,'volo':4}
            selected = detect_canonical(path, frequency=lambda w: scores.get(w,2))
            self.assertEqual(selected['stoviglie'], ['stoviglia'])
            self.assertEqual(selected['bella'], ['bello'])
            self.assertNotIn('banca',selected)
            self.assertNotIn('voli',selected)


class HomographTests(unittest.TestCase):
    def build(self):
        known = {'parto','parta','parte','parti','menta','mente','menti','mento','stoviglia','stoviglie','sposo','sposa'}
        evidence = FamilyEvidence(known)
        def add(source, kind, word, lemma, role, pos, details=None):
            evidence.add(source, kind, {'prompt': word, 'lemma': lemma, 'role': role, 'pos': pos, 'details': details or {}})
        m = 'morphit-048-mirror'
        # parte: nome (lemma a sé) e plurale femminile dell'aggettivo parto
        add(m,'morphit','parte','parte','lemma','NOUN-F:s'); add(m,'morphit','parti','parte','inflected_form','NOUN-F:p')
        add(m,'morphit','parto','parto','lemma','NOUN-M:s'); add(m,'morphit','parti','parto','inflected_form','NOUN-M:p')
        for word, pos, number in (('parto','ADJ:pos+m+s','singular'),('parta','ADJ:pos+f+s','singular'),('parte','ADJ:pos+f+p','plural')):
            add('kaikki-enwiktionary-it','wiktextract',word,'parto','lemma' if word=='parto' else 'inflected_form','adj',
                {'entry_tags':[],'senses':[{'tags':['feminine' if word!='parto' else 'masculine',number],'form_of':[] if word=='parto' else [{'word':'parto'}]}]})
        # mente: nome e plurale di menta; stoviglie: plurale con voce propria, singolare raro
        add(m,'morphit','menta','menta','lemma','NOUN-F:s'); add(m,'morphit','mente','menta','inflected_form','NOUN-F:p')
        add(m,'morphit','mente','mente','lemma','NOUN-F:s'); add(m,'morphit','menti','mente','inflected_form','NOUN-F:p')
        add(m,'morphit','mento','mento','lemma','NOUN-M:s')
        add(m,'morphit','stoviglia','stoviglia','lemma','NOUN-F:s'); add(m,'morphit','stoviglie','stoviglia','inflected_form','NOUN-F:p')
        add(m,'morphit','stoviglie','stoviglie','lemma','NOUN-F:p')
        # sposa: femminile singolare di sposo, con voce propria: non è un omografo (femminile singolare)
        add(m,'morphit','sposo','sposo','lemma','NOUN-M:s'); add(m,'morphit','sposa','sposo','inflected_form','NOUN-F:s')
        add(m,'morphit','sposa','sposa','lemma','NOUN-F:s')
        return evidence

    def test_a_lemma_that_is_also_a_plural_of_a_rarer_lemma_is_a_homograph_and_stays(self):
        frequency = {'parto':4.33,'parta':3.4,'parte':6.18,'parti':5.21,'menta':3.67,'mente':5.2,'menti':4.18,'mento':3.74,
                     'stoviglia':1.4,'stoviglie':3.15,'sposo':3.98,'sposa':4.55}.get
        evidence = self.build()
        selected = evidence.finish(frequency)
        self.assertEqual(evidence.homographs, {'parte','mente'})
        for word in ('parte','mente','parto','menta','mento'):
            self.assertNotIn(word, selected)
        for word in ('parti','menti'):
            self.assertIn(word, selected)
        # stoviglie è un plurale più comune (singolare raro), non un omografo; sposa è un femminile singolare, non un omografo
        self.assertNotIn('stoviglie', evidence.homographs)
        self.assertNotIn('sposa', evidence.homographs)
        self.assertEqual(selected['stoviglia'], ['stoviglie'])
        self.assertEqual(selected['sposa'], ['sposo'])

    def test_audit_reports_residues_homographs_and_reference_checks(self):
        frequency = {'parto':4.33,'parta':3.4,'parte':6.18,'parti':5.21,'menta':3.67,'mente':5.2,'menti':4.18,'mento':3.74,
                     'stoviglia':1.4,'stoviglie':3.15,'sposo':3.98,'sposa':4.55}.get
        evidence = self.build()
        selected = evidence.finish(frequency)
        audit = evidence.audit(selected)
        self.assertEqual(audit['homographs_kept']['words'], ['mente', 'parte'])
        self.assertEqual(audit['common_plurals']['total'], 1)
        self.assertEqual(audit['reference_checks']['failed'], [])
        self.assertTrue(audit['ok'])
        self.assertEqual(audit['residual_inflected_forms']['total'], 2)   # parte e mente: plurali di parto/menta con lemma presente
        self.assertEqual(audit['residual_inflected_forms']['by_reason'], {'omografo': 2})
        self.assertIn('inflected_form', audit['removed_by_rule'])
        # un controllo di riferimento non conforme rende il risultato non ok
        evidence.REFERENCE_CHECKS = {'parte': 'excluded'}
        broken = evidence.audit(selected)
        self.assertEqual(broken['reference_checks']['failed'], ['parte'])
        self.assertFalse(broken['ok'])


class SuperlativeTests(unittest.TestCase):
    def test_regular_superlatives_give_way_to_the_adjective_but_irregular_ones_stay(self):
        known = {'onesto','onesta','onesti','oneste','onestissimo','onestissima','onestissimi','onestissime',
                 'buono','ottimo','ottima','ottimi','ottime','antico','antichissimo','antichissima','felice','felicissimo'}
        evidence = FamilyEvidence(known)
        def add(source, kind, word, lemma, role, pos):
            evidence.add(source, kind, {'prompt': word, 'lemma': lemma, 'role': role, 'pos': pos, 'details': {}})
        m = 'morphit-048-mirror'
        for word, pos in (('onesto','ADJ:pos+m+s'),('onesta','ADJ:pos+f+s'),('onesti','ADJ:pos+m+p'),('oneste','ADJ:pos+f+p'),
                          ('onestissimo','ADJ:sup+m+s'),('onestissima','ADJ:sup+f+s'),('onestissimi','ADJ:sup+m+p'),('onestissime','ADJ:sup+f+p')):
            add(m,'morphit',word,'onesto','lemma' if word=='onesto' else 'inflected_form',pos)
        for word, pos in (('buono','ADJ:pos+m+s'),('ottimo','ADJ:sup+m+s'),('ottima','ADJ:sup+f+s'),('ottimi','ADJ:sup+m+p'),('ottime','ADJ:sup+f+p')):
            add(m,'morphit',word,'buono','lemma' if word=='buono' else 'inflected_form',pos)
        for word, lemma, pos in (('antico','antico','ADJ:pos+m+s'),('antichissimo','antico','ADJ:sup+m+s'),('antichissima','antico','ADJ:sup+f+s'),
                                 ('felice','felice','ADJ:pos+m+s'),('felicissimo','felice','ADJ:sup+m+s')):
            add(m,'morphit',word,lemma,'lemma' if word==lemma else 'inflected_form',pos)
        selected = evidence.finish(lambda w: 3)
        for word in ('onestissimo','onestissima','onestissimi','onestissime'):
            self.assertEqual(selected.get(word), ['onesto'], word)
        self.assertEqual(selected.get('antichissimo'), ['antico'])
        self.assertEqual(selected.get('felicissimo'), ['felice'])
        self.assertEqual(selected.evidence['onestissimo']['rule'], 'regular_superlative')
        self.assertNotIn('onesto', selected)
        self.assertNotIn('ottimo', selected)     # superlativo irregolare di buono: parola a sé
        self.assertEqual(FamilyEvidence.regular_superlatives('ricco'), {'riccissimo','ricchissimo'})

    def test_every_regular_superlative_with_its_base_in_the_collection_is_removed(self):
        known = {'saggio','saggissimo','saggissima','aiuto','aiutissimo','alticcio','alticchissimo','alticchissime','bene','benissimo',
                 'felice','felicissima','ricco','ricchissimi','ottimo','massimo','pessimo','campionissimo','amplissimo'}
        selected = FamilyEvidence(known).finish(lambda w: 3)   # nessuna prova morfologica: solo l'ortografia
        expected = {'saggissimo':'saggio','saggissima':'saggio','aiutissimo':'aiuto','alticchissimo':'alticcio','alticchissime':'alticcio',
                    'benissimo':'bene','felicissima':'felice','ricchissimi':'ricco'}
        for word, base in expected.items():
            self.assertEqual(selected.get(word), [base], word)
        for word in ('saggio','aiuto','ottimo','massimo','pessimo'):   # basi e superlativi irregolari restano
            self.assertNotIn(word, selected)
        # senza la base nella raccolta la forma resta (campionissimo: nessun campione/campiono; amplissimo: nessun amplo)
        self.assertNotIn('campionissimo', selected)
        self.assertNotIn('amplissimo', selected)
    def test_common_words_that_only_look_like_forms_of_another_word_stay(self):
        known = {'tenero','tenera','teneri','tenere','sole','solo','sola','sole','cane','cano','persona','delatore','rosa','roso'}
        evidence = FamilyEvidence(known)
        def add(source, kind, word, lemma, role, pos, details=None):
            evidence.add(source, kind, {'prompt': word, 'lemma': lemma, 'role': role, 'pos': pos, 'details': details or {}})
        m, kk = 'morphit-048-mirror', 'kaikki-itwiktionary'
        # tenere: infinito di tenere e plurale femminile di tenero
        add(m,'morphit','tenere','tenere','lemma','VER:inf+pres'); add(m,'morphit','tenero','tenero','lemma','ADJ:pos+m+s')
        add(m,'morphit','tenera','tenero','inflected_form','ADJ:pos+f+s'); add(m,'morphit','tenere','tenero','inflected_form','ADJ:pos+f+p')
        # cane: nome maschile (tre fonti) e plurale femminile dell'aggettivo cano; rosa: nome e femminile di roso
        for source,kind in ((m,'morphit'),(kk,'wiktextract'),('kaikki-enwiktionary-it','wiktextract')):
            add(source,kind,'cane','cane','lemma','NOUN-M:s' if kind=='morphit' else 'noun',{} if kind=='morphit' else {'entry_tags':['masculine','singular'],'senses':[{'tags':['masculine','singular']}]})
            add(source,kind,'rosa','rosa','lemma','NOUN-F:s' if kind=='morphit' else 'noun',{} if kind=='morphit' else {'entry_tags':['feminine','singular'],'senses':[{'tags':['feminine','singular']}]})
        add(m,'morphit','cano','cano','lemma','ADJ:pos+m+s'); add(m,'morphit','cane','cano','inflected_form','ADJ:pos+f+p')
        add(m,'morphit','roso','roso','lemma','ADJ:pos+m+s'); add(m,'morphit','rosa','roso','inflected_form','ADJ:pos+f+s')
        frequency = {'tenere':5.0,'tenero':3.8,'cane':4.9,'cano':2.9,'rosa':4.8,'roso':2.1}.get
        selected = evidence.finish(lambda w: frequency(w, 3))
        for word in ('tenere','cane','rosa'):
            self.assertNotIn(word, selected, word)

    def test_a_feminine_much_more_common_than_its_alleged_masculine_is_a_word_of_its_own(self):
        # persona/delatore: la voce di persona elenca delatore come suo maschile
        family = {('persona','NOUN'): {'persona': form('Fem','Sing'), 'delatore': form('Masc','Sing')}}
        scores = {'persona':5.6,'delatore':2.3}
        self.assertNotIn('persona', select_families(family, set(), scores.__getitem__))   # persona resta: non è una variante femminile
        # massaia/massaio: stessa struttura, ma il divario (1,35) è quello di una vera coppia: vince il maschile
        pair = {('massaio','NOUN'): {'massaio': form('Masc','Sing'), 'massaia': form('Fem','Sing')}}
        self.assertEqual(select_families(pair, set(), {'massaio':1.15,'massaia':2.5}.__getitem__), {'massaia':['massaio']})


if __name__ == '__main__':
    unittest.main()

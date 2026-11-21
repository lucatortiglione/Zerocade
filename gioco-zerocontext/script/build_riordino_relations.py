"""Build Riordino's small lexical index. Reads dictionary sources only, never evaluation cases."""
from collections import Counter, defaultdict
from contextlib import closing
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import zipfile

ROOT = Path(__file__).resolve().parents[2]
GAME = ROOT / 'gioco-zerocontext'
OUT = ROOT / 'apps/server/src/context-relations.json'
WORD = r"[a-zàèéìòù]+"
ARTICLE = r"(?:(?:un[ao]?|i|gli|le|il|la) |(?:l|un)')?"
OF = r"(?:di |d'|del |dello |della |dei |degli |delle |dell')"
BY = r"(?:da |dal |dallo |dalla |dai |dagli |dalle |dall')"
TOOL = re.compile(r"^(?:piccol[oa] |antic[oa] )?(?:attrezz[oa]|strumento|utensile|arnese|apparecchio|dispositivo|macchina)\b")
PART = re.compile(r"^(?:parte|porzione|elemento|componente|organo|estremità|sezione|segmento)\b")
AGENT = re.compile(r"^(?:(?:persona|colui|colei|lavoratore|artigiano|operaio|addetto|professionista) che |chi )")
OPERATOR = re.compile(r"(?:usat[oaie]|utilizzat[oaie]|impiegat[oaie]|adoperat[oaie]) " + BY + ARTICLE + f"({WORD})")
PURPOSE = re.compile(r"(?:per |serve (?:a|ad) |permette di )(" + WORD + r"(?:are|ere|ire))\b")
WHOLE = re.compile(OF + ARTICLE + f"({WORD})")
COMPONENT = re.compile(r"(?:compost[oa]|costituit[oa]|format[oa]|munit[oa]|dotat[oa]) (?:da |di )" + ARTICLE + f"({WORD})")
GENERIC = set('persona cosa parte genere tipo specie forma oggetto strumento modo uomo donna essere tale altro membro mezzo corpo'.split())


def dictionary_relations(definitions, words, lemmas):
    for head, text in definitions:
        text = text.lower().replace('’', "'").strip()
        tool = TOOL.match(text)
        if tool:
            for person in OPERATOR.findall(text):
                yield from edge(lemmas.get(person, person), head, 'strumento', words)
            for verb in PURPOSE.findall(text):
                yield from edge(head, verb, 'azione', words)
                yield from edge(verb, head, 'strumento', words)
        if PART.match(text):
            # The first complement of the part (not later examples or dependent clauses).
            m = WHOLE.search(text.split(',')[0].split(' che ')[0][:85])
            if m:
                yield from edge(lemmas.get(m[1], m[1]), head, 'parte', words)
        for component in COMPONENT.findall(text):
            yield from edge(head, lemmas.get(component, component), 'parte', words)
        agent = AGENT.match(text)
        if agent:
            m = re.match(WORD, text[agent.end():])
            if m:
                verb = lemmas.get(m[0], '')
                if verb.endswith(('are', 'ere', 'ire')):
                    yield from edge(head, verb, 'azione', words)


def edge(secret, clue, kind, words):
    if secret != clue and secret in words and clue in words and secret not in GENERIC and clue not in GENERIC:
        yield secret, clue, kind


def meronyms(table, archive, words):
    names = defaultdict(set)
    for line in table.read_text(encoding='utf8').splitlines():
        fields = line.split('\t')
        if len(fields) == 3 and fields[1] == 'ita:lemma' and fields[2] in words:
            names[fields[0]].add(fields[2])
    with zipfile.ZipFile(archive) as wn:
        for line in wn.read('wordnet/data.noun').decode().splitlines():
            if not line or not line[0].isdigit():
                continue
            fields = line.split('|', 1)[0].split()
            start = 4 + 2 * int(fields[3], 16)
            for i in range(int(fields[start])):
                symbol, offset, pos, _ = fields[start+1+4*i:start+5+4*i]
                if symbol == '%p':
                    for secret in names.get(fields[0]+'-n', ()):
                        for part in names.get(offset+'-'+pos, ()):
                            yield from edge(secret, part, 'parte', words)


def selective_clues(edges, max_secrets):
    edges = set(edges)
    coverage = Counter(word for _, word in {(s, w) for s, w, _ in edges})
    result = defaultdict(list)
    for secret, word, kind in sorted(edges, key=lambda e: (e[0], coverage[e[1]], e[1], e[2])):
        if coverage[word] <= max_secrets and all(other != word for other, _ in result[secret]):
            result[secret].append([word, kind])
    return dict(result)


def build():
    cache = GAME / '.cache'
    words = set((GAME / 'data/vocab.txt').read_text(encoding='utf8').splitlines())
    forms = defaultdict(set)
    for line in (cache / 'morphit_048.txt').read_text(encoding='utf8').splitlines():
        fields = line.split('\t')
        if len(fields) == 3 and fields[2].startswith(('NOUN', 'VER')):
            forms[fields[0]].add(fields[1])
    lemmas = {w: next(iter(values)) for w, values in forms.items() if len(values) == 1}
    archive = next((cache/'wordnet').glob('*/wordnet.zip'))
    table = next((cache/'wordnet').glob('*/wn-data-ita.tab'))
    edges = set(meronyms(table, archive, words))
    file = ROOT/'database/parole_ita_raw.sqlite3'
    with closing(sqlite3.connect(file.as_uri()+'?mode=ro', uri=True)) as db:
        snapshot, sha = db.execute("""SELECT n.n, s.sha256 FROM raw__inventory_snapshots s
            JOIN raw__inventory_snapshot_numbers n ON n.snapshot_id=s.id WHERE source_key='kaikki-itwiktionary'
            ORDER BY acquired_at DESC LIMIT 1""").fetchone()
        definitions = db.execute("""SELECT r.prompt, gloss.value FROM raw__inventory_attestation_rows r
            JOIN raw__inventory_attestation_roles role ON role.n=r.role AND role.role='lemma'
            JOIN raw__inventory_attestation_pos pos ON pos.n=r.pos AND pos.pos='noun'
            LEFT JOIN raw__inventory_attestation_details d ON d.n=r.details
            JOIN json_each(coalesce(r.own_details,d.doc),'$.senses') s
            JOIN json_each(s.value,'$.glosses') gloss WHERE r.snapshot=? AND gloss.type='text'""", (snapshot,))
        edges.update(dictionary_relations(((w, g) for w, g in definitions if w in words), words, lemmas))
        # Curated associations are available for the presenter hint only. They overlap
        # with the quality evaluator's gold, so must never enter the ranking graph.
        curated = [(s,w,k) for s,w,k in db.execute("""SELECT s.prompt,a.word,a.relation
            FROM validi__senses s JOIN validi__associations a ON a.sense_id=s.id
            WHERE a.relation IN ('parte','azione','strumento')""") if s in words and w in words and s!=w]
    plurals = json.loads((ROOT/'packages/shared/src/contextPlurals.json').read_text(encoding='utf8'))['plurals']
    def filtered(rows):
        return ((s,w,k) for s,w,k in rows if w not in plurals.get(s, ()))
    sources = {
        'glosses': f'Contributori Wikizionario / Kaikki, https://kaikki.org/itwiktionary/Italiano/, CC BY-SA 4.0, SHA-256 {sha}',
        'morphology': 'Morph-it! 0.4.8, Marco Baroni / Eros Zanchetta, CC BY-SA 2.0, https://docs.sslmit.unibo.it/doku.php?id=resources:morph-it',
        'meronyms': 'Princeton WordNet 3.0; Italian lemmas from MultiWordNet (Pianta, Bentivogli, Girardi 2002), CC BY 3.0, https://omwn.org/',
        'derivation': 'Directed lemma pairs extracted from noun definitions and part meronyms, filtered by coverage. The ranking index is shared under CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/).',
        'hints': 'ZeroAssociazioni, validi__associations, materiale editoriale del progetto',
        'files': {f.name: hashlib.sha256(f.read_bytes()).hexdigest() for f in [archive,table]},
    }
    with zipfile.ZipFile(archive) as wn:
        sources['wordnet_license'] = wn.read('wordnet/LICENSE').decode().strip()
    output = {'sources': sources, 'ranking': selective_clues(filtered(edges), max_secrets=12),
              'hints': selective_clues(filtered(curated), max_secrets=12)}
    OUT.write_text(json.dumps(output, ensure_ascii=False, separators=(',', ':'))+'\n', encoding='utf8')
    print(OUT, len(output['ranking']), 'voci lessicali;', len(output['hints']), 'voci editoriali')


if __name__ == '__main__':
    build()

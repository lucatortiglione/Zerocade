"""Schede editoriali di ZeroTaboo v2.2 (LINEE_GUIDA_CARTE_ZEROTABOO_v2.2.md): schema, matcher, controlli, database.

    python schede.py ingest BOZZA.json [...]   bozze del generatore (formato di prompt_ideazione@2.2.0) -> data/schede-v2.2/
    python schede.py check [--write]          ricalcola i controlli automatici (§5.3) di tutte le schede
    python schede.py report                   riepilogo per categoria: stati, livelli P, difficoltà, tag comici
    python schede.py export                   CSV con BOM per la revisione dell'editor

Il database si costruisce con `mazzo.py import`, che carica anche le schede v2.2 accanto al mazzo v3 in uso (§6.5: il
mazzo in uso non si tocca). Le schede generate restano `draft`, `auto_checked` o `rejected`: blind test, revisione
dell'editor e revisioni di piattaforma sono passi successivi (§5.1, §5.2). Nessuna dipendenza esterna.
"""
from __future__ import annotations

import argparse
import csv
from datetime import datetime
from difflib import SequenceMatcher
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import sys
import unicodedata

HERE = Path(__file__).resolve().parent.parent
ROOT = HERE.parent
DATA = HERE / 'data'
SCHEMA_FILE = DATA / 'schema-carta-v2.2.json'
CATALOG_FILE = DATA / 'catalogo-v2.2.json'
CARDS_DIR = DATA / 'schede-v2.2'
EXCEPTIONS_FILE = DATA / 'blocklist-eccezioni-v2.2.json'
BLOCKLIST_FILE = ROOT / 'gioco-parole' / 'lexicon' / 'blocklist_it.txt'
V3_SOURCE = DATA / 'mazzo-v3.0.json'
RULES = HERE / 'ZEROTABOO.md'
# Lessico con frequenze (parole__words: forme flesse maiuscole senza accenti, Zipf). Serve ad A-005: un prefisso con `*`
# non deve catturare parole comuni estranee (§2.3, "buc*" catturerebbe "bucce"). Non contiene lemmi.
GIOCHI_DB = ROOT / 'database' / 'giochi.sqlite3'
COMMON_ZIPF = 3.5

VALIDATOR_VERSION = '2.2.0'
VALIDATOR = f'validatore@{VALIDATOR_VERSION}'
SAFETY_CODES = frozenset({'S-001', 'S-003', 'P-001'})  # §1.6, §5.3: un FAIL di sicurezza porta a `rejected`, senza riscritture
DIFFICULTY = {'easy': 1, 'medium': 2, 'hard': 3}
STATUSES = ['draft', 'auto_checked', 'blind_tested', 'repair_once', 'approved', 'active', 'rejected', 'temporarily_disabled', 'retired']
RELATIONS = ['sinonimo', 'iperonimo', 'iponimo', 'parte', 'luogo', 'azione_tipica', 'oggetto_associato', 'persona_tipica', 'conseguenza', 'contesto']
HUMOR_TAGS = ['dettaglio_specifico', 'dissonanza', 'personaggio_situato', 'escalation', 'contrasto', 'personificazione', 'figuraccia', 'assurdo_coerente']


# ---- Interprete minimo di JSON Schema: solo le parole chiave usate da schema-carta-v2.2.json ----

class SchemaValidator:
    """type, const, enum, pattern, min/maxLength, minimum/maximum, min/maxItems, uniqueItems, items, required, properties,
    additionalProperties, propertyNames, $ref locale, allOf, if/then, format date-time. Una parola chiave sconosciuta è un errore."""

    KNOWN = {'$schema', '$id', 'title', '$defs', '$ref', 'type', 'const', 'enum', 'pattern', 'minLength', 'maxLength', 'minimum',
             'maximum', 'minItems', 'maxItems', 'uniqueItems', 'items', 'required', 'properties', 'additionalProperties',
             'propertyNames', 'allOf', 'if', 'then', 'format'}

    def __init__(self, schema: dict):
        self.root = schema
        self._patterns: dict[str, re.Pattern] = {}
        self._check_keywords(schema)

    def _check_keywords(self, node) -> None:
        if isinstance(node, dict):
            unknown = set(node) - self.KNOWN
            if unknown:
                raise ValueError(f'Parole chiave dello schema non gestite: {sorted(unknown)}')
            for key, value in node.items():
                if key in ('properties', '$defs'):
                    for sub in value.values():
                        self._check_keywords(sub)
                elif key in ('items', 'additionalProperties', 'propertyNames', 'if', 'then') and isinstance(value, dict):
                    self._check_keywords(value)
                elif key == 'allOf':
                    for sub in value:
                        self._check_keywords(sub)

    def errors(self, instance) -> list[str]:
        out: list[str] = []
        self._validate(instance, self.root, '$', out)
        return out

    def _resolve(self, ref: str) -> dict:
        if not ref.startswith('#/'):
            raise ValueError(f'Riferimento non locale: {ref}')
        node = self.root
        for part in ref[2:].split('/'):
            node = node[part]
        return node

    def _pattern(self, p: str) -> re.Pattern:
        if p not in self._patterns:
            # In ECMA-262 `$` chiude la stringa; in Python accetterebbe anche un a capo finale.
            self._patterns[p] = re.compile(p[:-1] + r'\Z' if p.endswith('$') else p)
        return self._patterns[p]

    @staticmethod
    def _is(value, kind: str) -> bool:
        return {'object': isinstance(value, dict), 'array': isinstance(value, list), 'string': isinstance(value, str),
                'integer': isinstance(value, int) and not isinstance(value, bool),
                'number': isinstance(value, (int, float)) and not isinstance(value, bool),
                'boolean': isinstance(value, bool), 'null': value is None}[kind]

    def _validate(self, x, s: dict, path: str, out: list[str]) -> None:
        if '$ref' in s:
            self._validate(x, self._resolve(s['$ref']), path, out)
        if 'type' in s and not self._is(x, s['type']):
            out.append(f'{path}: atteso {s["type"]}')
            return
        if 'const' in s and x != s['const']:
            out.append(f'{path}: deve valere {s["const"]!r}')
        if 'enum' in s and not any(x == e and type(x) is type(e) for e in s['enum']):
            out.append(f'{path}: {x!r} non è fra {s["enum"]}')
        if isinstance(x, str):
            if len(x) < s.get('minLength', 0):
                out.append(f'{path}: più corto di {s["minLength"]} caratteri')
            if 'maxLength' in s and len(x) > s['maxLength']:
                out.append(f'{path}: più lungo di {s["maxLength"]} caratteri')
            if 'pattern' in s and not self._pattern(s['pattern']).search(x):
                out.append(f'{path}: {x!r} non rispetta {s["pattern"]}')
            if s.get('format') == 'date-time':
                try:
                    if datetime.fromisoformat(x).tzinfo is None:
                        out.append(f'{path}: data senza fuso orario')
                except ValueError:
                    out.append(f'{path}: data non valida')
        if self._is(x, 'number'):
            if 'minimum' in s and x < s['minimum']:
                out.append(f'{path}: minore di {s["minimum"]}')
            if 'maximum' in s and x > s['maximum']:
                out.append(f'{path}: maggiore di {s["maximum"]}')
        if isinstance(x, list):
            if len(x) < s.get('minItems', 0):
                out.append(f'{path}: meno di {s["minItems"]} elementi')
            if 'maxItems' in s and len(x) > s['maxItems']:
                out.append(f'{path}: più di {s["maxItems"]} elementi')
            if s.get('uniqueItems'):
                keys = [json.dumps(v, sort_keys=True, ensure_ascii=False) for v in x]
                if len(set(keys)) != len(keys):
                    out.append(f'{path}: elementi duplicati')
            if isinstance(s.get('items'), dict):
                for i, v in enumerate(x):
                    self._validate(v, s['items'], f'{path}[{i}]', out)
        if isinstance(x, dict):
            for key in s.get('required', []):
                if key not in x:
                    out.append(f'{path}: manca «{key}»')
            props = s.get('properties', {})
            for key, value in x.items():
                if 'propertyNames' in s:
                    self._validate(key, s['propertyNames'], f'{path}.<{key}>', out)
                if key in props:
                    self._validate(value, props[key], f'{path}.{key}', out)
                elif s.get('additionalProperties') is False:
                    out.append(f'{path}: campo non previsto «{key}»')
                elif isinstance(s.get('additionalProperties'), dict):
                    self._validate(value, s['additionalProperties'], f'{path}.{key}', out)
        for sub in s.get('allOf', []):
            self._validate(x, sub, path, out)
        if 'if' in s:
            probe: list[str] = []
            self._validate(x, s['if'], path, probe)
            if not probe and 'then' in s:
                self._validate(x, s['then'], path, out)


# ---- Appendice A — matcher di riferimento, copiato dalle linee guida (soglie [I] da tarare) ----

NEGATIONS = {"non", "mai", "nessuno", "nessuna", "niente", "nulla", "senza"}
STOPWORDS = {"il", "lo", "la", "i", "gli", "le", "l", "un", "uno", "una", "che",
             "e", "di", "a", "da", "in", "con", "per", "su"}
NEG_WINDOW = 3          # token prima del gruppo di polarità in cui cercare la negazione
ACCEPT_SIM = 0.90       # somiglianza minima con una frase accettata
DOUBT_SIM = 0.80        # sotto ACCEPT_SIM ma sopra questa soglia -> arbitraggio
COUNTER_SIM = 0.92      # somiglianza con un controesempio -> rifiuto
DEFAULT_MAX_TOKENS = 10


def normalize(text: str) -> list[str]:
    text = unicodedata.normalize("NFKD", text.lower())
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = re.sub(r"[^a-z0-9\s]", " ", text)        # apostrofi, punteggiatura, emoji
    text = re.sub(r"(.)\1{2,}", r"\1", text)         # "viaaaa" -> "via", "tuttiii" -> "tutti"
    return text.split()


def _content(tokens):
    return [t for t in tokens if t not in STOPWORDS]


def _negs(tokens):
    return sorted(t for t in tokens if t in NEGATIONS)


def _similar(a, b):
    return SequenceMatcher(None, " ".join(a), " ".join(b)).ratio()


def _hit(token, entry):
    return token.startswith(entry[:-1]) if entry.endswith("*") else token == entry


def _find(tokens, group):
    for i, t in enumerate(tokens):
        if any(_hit(t, e) for e in group):
            return i
    return None


def _negated(tokens, idx):
    return any(t in NEGATIONS for t in tokens[max(0, idx - NEG_WINDOW):idx])


def evaluate(message: str, av: dict) -> tuple[str, str]:
    """Valuta un messaggio della chat contro answer_validation di una carta."""
    tokens = normalize(message)
    if not tokens:
        return "IGNORED", "vuoto"
    if len(tokens) > av.get("max_tokens", DEFAULT_MAX_TOKENS):
        return "IGNORED", "troppo lungo"
    content, negs = _content(tokens), _negs(tokens)

    # 1. Controesempi espliciti
    for ce in av.get("rejected_counterexamples", []):
        ce_tok = normalize(ce)
        if _negs(ce_tok) == negs and _similar(content, _content(ce_tok)) >= COUNTER_SIM:
            return "REJECT", "controesempio"

    # 2. Frasi accettate (la somiglianza conta solo a parità di negazioni)
    best = 0.0
    for p in av.get("accepted_phrases", []):
        p_tok = normalize(p)
        if _negs(p_tok) == negs:
            best = max(best, _similar(content, _content(p_tok)))
    if best >= ACCEPT_SIM:
        return "ACCEPT", "frase accettata"

    # 3. Nuclei con vincolo di polarità
    partial = polarity_fail = False
    for core in av.get("cores", []):
        pos = [_find(tokens, g) for g in core["groups"]]
        if all(p is not None for p in pos):
            rule = core.get("negation", "any")
            if rule != "any":
                is_neg = _negated(tokens, pos[core["polarity_group"]])
                if (rule == "required") != is_neg:
                    polarity_fail = True
                    continue
            return "ACCEPT", "nucleo"
        if any(p is not None for p in pos):
            partial = True
    if polarity_fail:
        return "REJECT", "polarità"

    # 4. Casi dubbi -> arbitraggio dello streamer
    if best >= DOUBT_SIM:
        return "DOUBT", "simile a frase accettata"
    return "NO_MATCH", "parziale" if partial else ""


# ---- Radici: lemma e varianti morfologiche (FAIL), stemmer come segnalatore (REVIEW) (§2.2) ----

# Parole non piene: articoli, preposizioni (anche articolate), congiunzioni, pronomi atoni. Non contano come radici della risposta.
FUNCTION_WORDS = STOPWORDS | NEGATIONS | {
    'del', 'dello', 'della', 'dei', 'degli', 'delle', 'al', 'allo', 'alla', 'ai', 'agli', 'alle', 'dal', 'dallo', 'dalla', 'dai',
    'dagli', 'dalle', 'nel', 'nello', 'nella', 'nei', 'negli', 'nelle', 'sul', 'sullo', 'sulla', 'sui', 'sugli', 'sulle', 'col', 'coi',
    'tra', 'fra', 'o', 'ma', 'se', 'si', 'ti', 'mi', 'ci', 'vi', 'ne', 'me', 'te', 'ce', 've', 'piu', 'come', 'quando', 'dove',
    'suo', 'sua', 'suoi', 'sue', 'tuo', 'tua', 'tuoi', 'tue', 'mio', 'mia', 'miei', 'mie', 'chi', 'cui', 'ad', 'ed', 'od', 'd', 'c',
    's', 'n', 'm', 't', 'v', 'e', 'al', 'po', 'io', 'tu', 'lui', 'lei', 'noi', 'voi', 'loro', 'gli', 'lo', 'ha', 'ho', 'hai', 'hanno',
    # preposizioni articolate elise: "all'uscita", "dell'ex", "nell'armadio" diventano "all uscita", "dell ex", ...
    'all', 'dell', 'nell', 'sull', 'dall', 'coll', 'quell', 'bell', 'sant',
}
# Desinenze flessive (nomi, aggettivi, verbi): due parole con lo stesso tema e due di queste desinenze sono forme dello stesso lemma.
ENDINGS = ('', 'o', 'a', 'i', 'e', 'are', 'ere', 'ire', 'arsi', 'ersi', 'irsi', 'ando', 'endo', 'ato', 'ata', 'ati', 'ate', 'uto', 'uta',
           'uti', 'ute', 'ito', 'ita', 'iti', 'ite', 'iamo', 'ano', 'ono', 'ava', 'avo', 'avi', 'avano', 'eva', 'evo', 'evi', 'evano', 'iva',
           'ivo', 'ivi', 'ivano', 'era', 'ero', 'ira', 'iro', 'isce', 'isco', 'isci', 'iscono', 'ai', 'ei', 'ii',
           # futuro e condizionale (andrai, resteranno, andrebbe), congiuntivo imperfetto, participio presente
           'emo', 'ete', 'anno', 'erai', 'eremo', 'erete', 'eranno', 'irai', 'iremo', 'irete', 'iranno', 'esti', 'ebbe', 'emmo',
           'este', 'ebbero', 'erei', 'eresti', 'erebbe', 'erebbero', 'irei', 'irebbe', 'irebbero', 'assi', 'asse', 'assero',
           'essi', 'esse', 'essero', 'issi', 'isse', 'issero', 'ante', 'anti', 'ente', 'enti')


def content_words(text: str) -> list[str]:
    return [t for t in normalize(text) if t not in FUNCTION_WORDS and len(t) >= 3 and not t.isdigit()]


def _velar(stem: str) -> str:
    # bianco/bianchi, lago/laghi: la h di "chi", "ghi", "che", "ghe" fa parte della grafia, non del tema.
    return stem[:-1] if stem.endswith(('ch', 'gh')) else stem


VOWEL_ENDINGS = frozenset({'', 'o', 'a', 'i', 'e'})


def same_lemma(a: str, b: str) -> bool:
    """Forme flesse dello stesso lemma (tutta/tutti, rompe/rompere, uscire/uscita): conflitto certo.
    Un tema di 3 lettere basta solo con desinenze vocaliche di nomi e aggettivi (casa/case, mano/mani); con le desinenze
    verbali ne servono 4, altrimenti salute/salire sembrerebbero lo stesso lemma. È un'approssimazione senza dizionario:
    parte/partita risultano ancora uguali (un falso FAIL che l'editor può superare con una riparazione)."""
    if a == b:
        return len(a) >= 3
    for ea in ENDINGS:
        if not a.endswith(ea):
            continue
        sa = _velar(a[:len(a) - len(ea)])
        if len(sa) < 3:
            continue
        for eb in ENDINGS:
            if b.endswith(eb) and _velar(b[:len(b) - len(eb)]) == sa:
                if len(sa) >= 4 or (ea in VOWEL_ENDINGS and eb in VOWEL_ENDINGS):
                    return True
    return False


def similar_root(a: str, b: str) -> bool:
    """Lo stemmer di mazzo.py: prefisso comune di almeno 4 lettere che copre il 60 % della parola più corta. Solo un sospetto."""
    p = 0
    while p < len(a) and p < len(b) and a[p] == b[p]:
        p += 1
    return p >= 4 and p >= 0.6 * min(len(a), len(b))


def root_conflict(word: str, others: list[str]) -> tuple[str, str] | None:
    """('lemma', parola) se `word` è una forma di una delle `others`; ('stemmer', parola) se lo segnala solo lo stemmer."""
    weak = None
    for o in others:
        if same_lemma(word, o):
            return 'lemma', o
        if weak is None and similar_root(word, o):
            weak = ('stemmer', o)
    return weak


def answer_hash(answer: str) -> str:
    """sha256 della risposta normalizzata (token del matcher uniti da uno spazio), primi 16 caratteri esadecimali."""
    return hashlib.sha256(' '.join(normalize(answer)).encode('utf-8')).hexdigest()[:16]


# ---- Dati di contorno: catalogo, blocklist, risposte del mazzo v3 ----

def load_json(path: Path):
    return json.loads(path.read_text(encoding='utf-8'))


def load_catalog(path: Path = CATALOG_FILE) -> dict:
    return load_json(path)


def load_schema(path: Path = SCHEMA_FILE) -> SchemaValidator:
    return SchemaValidator(load_json(path))


def load_blocklist(path: Path = BLOCKLIST_FILE) -> tuple[set[str], list[str]]:
    exact: set[str] = set()
    prefixes: list[str] = []
    for line in path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        if line.endswith('*'):
            prefixes.append(line[:-1].lower())
        else:
            exact.add(line.lower())
    return exact, prefixes


def load_exceptions(path: Path = EXCEPTIONS_FILE) -> set[str]:
    """Eccezioni documentate alla corrispondenza per prefisso (§5.3): {"parola": {"prefisso", "motivo", "data"}}."""
    if not path.exists():
        return set()
    data = load_json(path)
    for word, why in data.get('eccezioni', {}).items():
        if not {'prefisso', 'motivo', 'data'} <= set(why):
            raise SystemExit(f'Eccezione «{word}» senza prefisso, motivo o data')
    return set(data.get('eccezioni', {}))


def load_common_words(path: Path = GIOCHI_DB) -> list[str] | None:
    """Le forme comuni (Zipf >= COMMON_ZIPF) di giochi.sqlite3, in minuscolo e ordinate; None se il file non c'è."""
    if not path.exists():
        return None
    db = sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True)
    try:
        rows = db.execute("SELECT word FROM parole__words WHERE zipf >= ? AND tier = 'main'", (COMMON_ZIPF,)).fetchall()
    finally:
        db.close()
    return sorted({w.lower() for w, in rows if w.isalpha()})


def prefix_captures(prefix: str, common: list[str]) -> list[str]:
    import bisect
    i = bisect.bisect_left(common, prefix)
    out = []
    while i < len(common) and common[i].startswith(prefix):
        out.append(common[i])
        i += 1
    return out


def v3_answers() -> dict[str, str]:
    """Bersagli del mazzo v3.0 (fonte JSON) e v3.2 (ZEROTABOO.md §8): hash -> codice. Servono a D-001 e D-002."""
    out: dict[str, str] = {}
    if V3_SOURCE.exists():
        for k in load_json(V3_SOURCE)['cards']:
            out[answer_hash(k['target'])] = f'v3:{k["card_id"]}:{k["target"]}'
    if RULES.exists():
        for m in re.finditer(r'^\| `([A-L][0-9][0-9])` \| \*\*(.+?)\*\*', RULES.read_text(encoding='utf-8'), re.M):
            out.setdefault(answer_hash(m.group(2)), f'v3:{m.group(1)}:{m.group(2)}')
    return out


class Context:
    """Tutto ciò che serve ai controlli, caricato una volta."""

    def __init__(self, catalog: dict | None = None, schema: SchemaValidator | None = None, checks: bool = True):
        self.catalog = catalog or load_catalog()
        self.schema = schema or load_schema()
        self.categories = {c['category_id']: c for c in self.catalog['categories']}
        self.modes = {m['mode_id'] for m in self.catalog['modes']}
        # L'import nel database usa solo schema e catalogo; blocklist, mazzo v3 e lessico servono ai controlli.
        self.block_exact, self.block_prefixes = load_blocklist() if checks else (set(), [])
        self.exceptions = load_exceptions() if checks else set()
        self.v3 = v3_answers() if checks else {}
        self.common = load_common_words() if checks else None


# ---- Controlli automatici (§5.3) ----

def _texts(card: dict) -> list[tuple[str, str]]:
    av = card.get('answer_validation', {})
    out = [('risposta', card.get('canonical_answer', '')), ('premessa', card.get('scene_premise', ''))]
    out += [('taboo', t.get('word', '')) for t in card.get('taboo', [])]
    out += [('spiegazione', e) for e in card.get('explanations', [])]
    out += [('frase accettata', p) for p in av.get('accepted_phrases', [])]
    out += [('controesempio', p) for p in av.get('rejected_counterexamples', [])]
    return out


def check_card(card: dict, ctx: Context, others: dict[str, str]) -> list[dict]:
    """Esiti codificati PASS/REVIEW/FAIL. `others`: answer_hash -> descrizione delle altre carte (v2.2 e v3), per D-001/D-002."""
    results: list[dict] = []

    def add(code: str, outcome: str, detail: str = '') -> None:
        r = {'code': code, 'outcome': outcome}
        if detail:
            r['detail'] = detail[:300]
        results.append(r)

    # Z-001: schema, catalogo e regole di forma che lo schema non esprime.
    problems = ctx.schema.errors(card)
    cat = ctx.categories.get(card.get('category_id'))
    if cat is None:
        problems.append(f'categoria «{card.get("category_id")}» assente dal catalogo')
    elif isinstance(card.get('spice_level'), int) and card['spice_level'] > cat['max_spice']:
        problems.append(f'spice_level {card["spice_level"]} oltre il massimo {cat["max_spice"]} della categoria')
    for mode in card.get('mode_compatibility', {}):
        if mode not in ctx.modes:
            problems.append(f'modalità «{mode}» assente dal catalogo')
    if card.get('humor_primary') not in card.get('humor_tags', []):
        problems.append('humor_primary non compare in humor_tags (§3.4)')
    add('Z-001', 'FAIL' if problems else 'PASS', '; '.join(problems))
    if problems and not isinstance(card.get('taboo'), list):
        return results

    answer = card.get('canonical_answer', '')
    taboo = [t.get('word', '') for t in card.get('taboo', []) if isinstance(t, dict)]
    av = card.get('answer_validation', {}) if isinstance(card.get('answer_validation'), dict) else {}
    accepted = av.get('accepted_phrases', [])
    counters = av.get('rejected_counterexamples', [])
    cores = av.get('cores', [])
    answer_words = content_words(answer)

    # S-001 / S-002: blocklist (parola esatta FAIL; prefisso REVIEW salvo eccezione documentata).
    hard, soft = [], []
    for where, text in _texts(card):
        for tok in normalize(text):
            if tok in ctx.block_exact:
                hard.append(f'{where}: {tok}')
            elif tok not in ctx.exceptions and any(tok.startswith(p) for p in ctx.block_prefixes):
                soft.append(f'{where}: {tok}')
    add('S-001', 'FAIL' if hard else 'PASS', ', '.join(sorted(set(hard))))
    if soft:
        add('S-002', 'REVIEW', ', '.join(sorted(set(soft))))
    else:
        add('S-002', 'PASS')
    add('S-003', 'FAIL' if card.get('category_id') == 'scuola' and card.get('spice_level', 0) >= 2 else 'PASS')

    # T-001..T-003: i cinque Taboo.
    keys = [' '.join(normalize(w)) for w in taboo]
    add('T-001', 'PASS' if len(taboo) == 5 and len(set(keys)) == 5 and '' not in keys else 'FAIL', f'{len(set(keys))} Taboo distinti')
    strong, weak = [], []
    for w in taboo:
        for tok in content_words(w):
            hit = root_conflict(tok, answer_words)
            if hit:
                (strong if hit[0] == 'lemma' else weak).append(f'«{w}» ~ {hit[1]}')
    add('T-002', 'FAIL' if strong else 'REVIEW' if weak else 'PASS', ', '.join(strong + weak))
    relations = {t.get('relation') for t in card.get('taboo', []) if isinstance(t, dict)}
    add('T-003', 'PASS' if len(relations) >= 3 else 'REVIEW', f'{len(relations)} tipi di relazione')

    # A-001..A-005: risposta e validazione.
    words = normalize(answer)
    add('A-001', 'REVIEW' if len(words) > 6 else 'PASS', f'{len(words)} parole')
    if any(t in NEGATIONS for t in words) and not any(c.get('negation') in ('required', 'forbidden') for c in cores):
        add('A-002', 'FAIL', 'negazione nella risposta senza un nucleo con vincolo di polarità')
    else:
        add('A-002', 'PASS')
    add('A-003', 'PASS' if len(accepted) >= 3 and len(counters) >= 3 and len(cores) >= 1 else 'FAIL',
        f'{len(accepted)} frasi accettate, {len(counters)} controesempi, {len(cores)} nuclei')
    wrong = []
    for p in [answer] + list(accepted):  # anche la risposta canonica, scritta in chat, deve essere accettata
        verdict = evaluate(p, av)[0]
        if verdict != 'ACCEPT':
            wrong.append(f'«{p}» → {verdict}')
    for p in counters:
        if evaluate(p, av)[0] == 'ACCEPT':
            wrong.append(f'controesempio «{p}» → ACCEPT')
    add('A-004', 'FAIL' if wrong else 'PASS', '; '.join(wrong))
    short = [f for c in cores for g in c.get('groups', []) for f in g if f.endswith('*') and len(f) - 1 < 3]
    if short:
        add('A-005', 'FAIL', ', '.join(short))
    elif ctx.common is None:
        add('A-005', 'PASS', 'prefissi lunghi abbastanza; catture non verificate (giochi.sqlite3 assente)')
    else:
        # Le parole comuni catturate da un prefisso, se non sono forme di una parola prevista dalla carta (§2.3).
        intended = set(content_words(answer)) | {t for p in accepted for t in content_words(p)}
        intended |= {f for c in cores for g in c.get('groups', []) for f in g if not f.endswith('*')}
        stray = []
        for c in cores:
            for g in c.get('groups', []):
                for f in g:
                    if f.endswith('*'):
                        # Le forme flesse del tema stesso (usc* -> uscire, uscita) sono previste; il resto è una cattura estranea.
                        own = intended | {f[:-1]}
                        caught = [w for w in prefix_captures(f[:-1], ctx.common)
                                  if w not in own and not any(same_lemma(w, i) for i in own)]
                        if caught:
                            stray.append(f'{f} cattura ' + ', '.join(caught[:6]) + ('…' if len(caught) > 6 else ''))
        add('A-005', 'REVIEW' if stray else 'PASS', '; '.join(stray))

    # X-001: ogni spiegazione senza Taboo (anche flessi) e senza radici della risposta; ne servono due pulite.
    clean = 0
    notes = []
    for i, text in enumerate(card.get('explanations', []), 1):
        toks = normalize(text)
        fail, review = [], []
        for w in taboo:
            wt = content_words(w) or normalize(w)
            if len(wt) > 1:  # una locuzione vieta la sequenza, non le singole parole (§2.2, regola 5)
                for s in range(len(toks) - len(wt) + 1):
                    if all(same_lemma(toks[s + j], wt[j]) for j in range(len(wt))):
                        fail.append(f'Taboo «{w}»')
                        break
            elif wt:
                for tok in toks:
                    if same_lemma(tok, wt[0]):
                        fail.append(f'Taboo «{w}» ({tok})')
                        break
                    if similar_root(tok, wt[0]):
                        review.append(f'Taboo «{w}»? ({tok})')
                        break
        for tok in toks:
            if tok in FUNCTION_WORDS or len(tok) < 3:
                continue
            hit = root_conflict(tok, answer_words)
            if hit:
                (fail if hit[0] == 'lemma' else review).append(f'radice della risposta «{hit[1]}» ({tok})')
        if fail:
            notes.append(f'spiegazione {i}: ' + ', '.join(fail))
        else:
            clean += 1
            if review:
                notes.append(f'spiegazione {i} (sospetto): ' + ', '.join(review))
    outcome = 'FAIL' if clean < 2 else 'REVIEW' if notes else 'PASS'
    add('X-001', outcome, '; '.join(notes))

    # D-001 / D-002: duplicati (hash identico) e somiglianza. D-002 qui è un proxy lessicale, non un confronto di embedding.
    own = answer_hash(answer)
    dup = others.get(own)
    add('D-001', 'FAIL' if dup else 'PASS', f'stessa risposta di {dup}' if dup else '')
    mine = set(answer_words)
    close = []
    if mine:
        for h, desc in others.items():
            theirs = set(content_words(desc.rsplit(':', 1)[-1]))
            if h != own and theirs and len(mine & theirs) / len(mine | theirs) >= 0.5:
                close.append(desc)
    add('D-002', 'REVIEW' if close else 'PASS',
        ('vicina a ' + ', '.join(close[:5]) if close else 'nessuna sovrapposizione') + ' (proxy lessicale, nessun embedding)')

    # M-001: senza una modalità `excellent` la carta resta nel pool normale (§4.3).
    excellent = any(v.get('rating') == 'excellent' for v in card.get('mode_compatibility', {}).values() if isinstance(v, dict))
    add('M-001', 'PASS' if excellent else 'REVIEW', '' if excellent else 'nessuna modalità excellent: fuori dal pool dinamico')
    tiktok = card.get('platform_reviews', {}).get('tiktok', {})
    add('P-001', 'FAIL' if card.get('spice_level') == 3 and tiktok.get('status') == 'approved' else 'PASS')
    return results


def outcome_status(checks: list[dict]) -> str:
    """Stato dopo il validatore (§5.2): FAIL di sicurezza -> rejected; altro FAIL -> resta draft; nessun FAIL -> auto_checked."""
    fails = {c['code'] for c in checks if c['outcome'] == 'FAIL'}
    if fails & SAFETY_CODES:
        return 'rejected'
    return 'draft' if fails else 'auto_checked'


# ---- Schede: file sorgente per categoria ----

def now() -> str:
    return datetime.now().astimezone().isoformat(timespec='seconds')


def card_files(folder: Path = CARDS_DIR) -> list[Path]:
    return sorted(folder.glob('*.json')) if folder.exists() else []


def load_card_files(folder: Path = CARDS_DIR) -> list[dict]:
    return [load_json(p) for p in card_files(folder)]


def all_cards(files: list[dict]) -> list[dict]:
    return [c for f in files for c in f['cards']]


def write_card_file(data: dict, folder: Path = CARDS_DIR) -> Path:
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f'{data["category_id"]}.json'
    data['cards'].sort(key=lambda c: c['card_id'])
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    return path


GENERATOR_FIELDS = {'canonical_answer', 'scene_premise', 'category_rationale', 'taboo', 'explanations', 'answer_validation',
                    'humor_primary', 'humor_tags', 'behavior_tags', 'spice_level', 'difficulty', 'mode_compatibility', 'failure_modes'}


def build_card(candidate: dict, slot: dict, card_id: str, created_at: str) -> tuple[dict, list[str]]:
    """Da un candidato del generatore a una scheda v2.2 in `draft`. Il generatore non dichiara mai idonea una carta (§5.1)."""
    extra = set(candidate) - GENERATOR_FIELDS
    if extra:
        raise SystemExit(f'{candidate.get("canonical_answer")}: campi non previsti dal prompt {sorted(extra)}')
    card = {
        'schema_version': '2.2', 'card_id': card_id, 'card_version': 1,
        'canonical_answer': candidate['canonical_answer'], 'answer_hash': answer_hash(candidate['canonical_answer']),
        'scene_premise': candidate['scene_premise'], 'category_id': slot['category_id'],
    }
    if candidate.get('category_rationale'):
        card['category_rationale'] = candidate['category_rationale']
    av = dict(candidate['answer_validation'])
    av.setdefault('max_tokens', DEFAULT_MAX_TOKENS)
    card.update({
        'difficulty': candidate['difficulty'], 'spice_level': candidate['spice_level'], 'taboo': candidate['taboo'],
        'explanations': candidate['explanations'], 'answer_validation': av,
        'humor_primary': candidate['humor_primary'], 'humor_tags': candidate['humor_tags'],
        'behavior_tags': candidate.get('behavior_tags', []), 'mode_compatibility': candidate['mode_compatibility'],
        'platform_reviews': {'twitch': {'status': 'needs_review'}, 'tiktok': {'status': 'needs_review'}},
        'editorial_status': 'draft', 'repair_count': 0,
        'status_history': [{'status': 'draft', 'at': created_at, 'by': slot['generator_model'],
                            'note': f'Generata con {slot["prompt_version"]}, lotto {slot["batch"]}'}],
        'checks': [],
        'provenance': {'source': 'ai', 'generator_model': slot['generator_model'],
                       'prompt_versions': {'ideazione': slot['prompt_version'].split('@')[-1]},
                       'validator_version': VALIDATOR_VERSION, 'created_at': created_at},
    })
    return card, list(candidate.get('failure_modes', []))


def apply_checks(card: dict, ctx: Context, others: dict[str, str], at: str) -> None:
    """Registra gli esiti e, per una carta ancora in `draft`, la transizione del validatore (§5.2)."""
    card['checks'] = check_card(card, ctx, others)
    if card['editorial_status'] != 'draft':
        return
    status = outcome_status(card['checks'])
    if status != 'draft':
        fails = [c['code'] for c in card['checks'] if c['outcome'] == 'FAIL']
        reviews = [c['code'] for c in card['checks'] if c['outcome'] == 'REVIEW']
        note = f'FAIL di sicurezza: {", ".join(fails)}' if status == 'rejected' else (
            f'Nessun FAIL; REVIEW: {", ".join(reviews)}' if reviews else 'Nessun FAIL né REVIEW')
        card['editorial_status'] = status
        card['status_history'].append({'status': status, 'at': at, 'by': VALIDATOR, 'note': note})


def others_for(card: dict, cards: list[dict], v3: dict[str, str]) -> dict[str, str]:
    out = dict(v3)
    for c in cards:
        if c is not card and c['card_id'] != card['card_id']:
            out.setdefault(c['answer_hash'], f'{c["card_id"]}:{c["canonical_answer"]}')
    return out


def ingest(paths: list[Path], ctx: Context, folder: Path = CARDS_DIR) -> list[str]:
    files = {f['category_id']: f for f in load_card_files(folder)}
    existing = all_cards(list(files.values()))
    by_hash = {c['answer_hash']: c for c in existing}
    next_id = max((int(c['card_id'][4:]) for c in existing), default=0) + 1
    at = now()
    touched: list[dict] = []
    log: list[str] = []
    for path in paths:
        batch = load_json(path)
        slot = batch['slot']
        cat = slot['category_id']
        if cat not in ctx.categories:
            raise SystemExit(f'{path.name}: categoria «{cat}» assente dal catalogo')
        data = files.setdefault(cat, {'schema_version': '2.2', 'category_id': cat, 'cards': [], 'failure_modes': {}, 'self_rejected': []})
        for cand in batch['candidates']:
            h = answer_hash(cand['canonical_answer'])
            old = by_hash.get(h)
            if old is not None and old['category_id'] != cat:
                raise SystemExit(f'{cand["canonical_answer"]}: già presente come {old["card_id"]} in {old["category_id"]}')
            if old is not None and old['editorial_status'] not in ('draft', 'auto_checked', 'rejected'):
                raise SystemExit(f'{old["card_id"]}: già oltre il validatore ({old["editorial_status"]}), non si rigenera')
            card_id = old['card_id'] if old else f'ztb_{next_id:06d}'
            if old is None:
                next_id += 1
            card, modes = build_card(cand, slot, card_id, old['provenance']['created_at'] if old else at)
            data['cards'] = [c for c in data['cards'] if c['card_id'] != card_id] + [card]
            data['failure_modes'][card_id] = modes
            by_hash[h] = card
            touched.append(card)
        seen = {(r['canonical_answer'], r['batch']) for r in data['self_rejected']}
        for r in batch.get('self_rejected', []):
            if (r['canonical_answer'], slot['batch']) not in seen:
                data['self_rejected'].append({'canonical_answer': r['canonical_answer'], 'reason': r['reason'], 'batch': slot['batch']})
    cards = all_cards(list(files.values()))
    for card in touched:
        apply_checks(card, ctx, others_for(card, cards, ctx.v3), at)
    for data in files.values():
        write_card_file(data, folder)
    for card in touched:
        bad = [f'{c["code"]} {c["outcome"]}' for c in card['checks'] if c['outcome'] != 'PASS']
        log.append(f'{card["card_id"]} {card["category_id"]:<11} {card["editorial_status"]:<12} {card["canonical_answer"]}'
                   + (f'  [{"; ".join(bad)}]' if bad else ''))
    return log


def lint(paths: list[Path], ctx: Context) -> list[str]:
    """I controlli su bozze non ancora acquisite, senza scrivere nulla: il generatore li usa come correttore di bozze."""
    existing = all_cards(load_card_files())
    out: list[str] = []
    drafts = []
    for path in paths:
        batch = load_json(path)
        for i, cand in enumerate(batch['candidates']):
            card, _ = build_card(cand, batch['slot'], f'ztb_{900000 + len(drafts):06d}', now())
            drafts.append(card)
    pool = existing + drafts
    for card in drafts:
        others = others_for(card, [c for c in pool if c['answer_hash'] != card['answer_hash'] or c is card], ctx.v3)
        dups = [c for c in drafts if c is not card and c['answer_hash'] == card['answer_hash']]
        checks = check_card(card, ctx, others)
        if dups:
            checks.append({'code': 'D-001', 'outcome': 'FAIL', 'detail': 'duplicata nel lotto'})
        bad = [f'{c["code"]} {c["outcome"]}: {c.get("detail", "")}' for c in checks if c['outcome'] != 'PASS']
        if bad:
            out.append(f'{card["category_id"]} {card["canonical_answer"]}\n    ' + '\n    '.join(bad))
    tags: dict[str, dict[str, int]] = {}
    for card in drafts:
        tags.setdefault(card['category_id'], {}).setdefault(card['humor_primary'], 0)
        tags[card['category_id']][card['humor_primary']] += 1
    for cat, counts in tags.items():
        total = sum(counts.values())
        for tag, n in counts.items():
            if n > 0.4 * total:  # §3.4: più del 40 % dello stesso tag prevalente -> lotto in revisione per varietà
                out.append(f'{cat}: il tag {tag} è prevalente in {n} carte su {total} (oltre il 40 %)')
    return out


# ---- Database: tabelle normalizzate accanto al mazzo v3 (le crea mazzo.py import) ----

DB_SCHEMA = '''
CREATE TABLE categorie_v22 (n INTEGER PRIMARY KEY, category_id TEXT NOT NULL UNIQUE, codice TEXT NOT NULL UNIQUE, nome TEXT NOT NULL,
                        tipo TEXT NOT NULL, stato TEXT NOT NULL, max_piccante INTEGER NOT NULL CHECK (max_piccante BETWEEN 0 AND 3),
                        derivata INTEGER NOT NULL CHECK (derivata IN (0, 1)), descrizione TEXT) STRICT;
CREATE TABLE modalita  (n INTEGER PRIMARY KEY, mode_id TEXT NOT NULL UNIQUE, famiglia TEXT NOT NULL, suggerimento TEXT NOT NULL,
                        rischio TEXT, stato TEXT NOT NULL) STRICT;
CREATE TABLE relazioni (n INTEGER PRIMARY KEY, nome TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE tag_comici (n INTEGER PRIMARY KEY, nome TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE stati_editoriali (n INTEGER PRIMARY KEY, nome TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE difficolta (n INTEGER PRIMARY KEY CHECK (n BETWEEN 1 AND 3), nome TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE schede    (n INTEGER PRIMARY KEY, card_id TEXT NOT NULL UNIQUE CHECK (card_id GLOB 'ztb_[0-9][0-9][0-9][0-9][0-9][0-9]'),
                        versione INTEGER NOT NULL CHECK (versione >= 1), risposta TEXT NOT NULL, answer_hash TEXT, premessa TEXT NOT NULL,
                        categoria INTEGER NOT NULL REFERENCES categorie_v22(n), motivazione_categoria TEXT,
                        difficolta INTEGER NOT NULL REFERENCES difficolta(n), piccante INTEGER NOT NULL CHECK (piccante BETWEEN 0 AND 3),
                        umorismo INTEGER NOT NULL REFERENCES tag_comici(n), stato INTEGER NOT NULL REFERENCES stati_editoriali(n),
                        riparazioni INTEGER CHECK (riparazioni BETWEEN 0 AND 1), max_token INTEGER CHECK (max_token BETWEEN 3 AND 20),
                        origine TEXT NOT NULL CHECK (origine IN ('manual', 'ai', 'migrated')), modello TEXT, validatore TEXT,
                        creata TEXT NOT NULL, migrata_da TEXT) STRICT;
CREATE INDEX schede_hash ON schede(answer_hash);
CREATE INDEX schede_categoria ON schede(categoria, stato);
CREATE TABLE scheda_taboo (scheda INTEGER NOT NULL REFERENCES schede(n), posizione INTEGER NOT NULL CHECK (posizione BETWEEN 1 AND 5),
                        parola INTEGER NOT NULL REFERENCES parole(n), relazione INTEGER NOT NULL REFERENCES relazioni(n),
                        PRIMARY KEY (scheda, posizione)) STRICT, WITHOUT ROWID;
CREATE TABLE scheda_spiegazioni (scheda INTEGER NOT NULL REFERENCES schede(n), posizione INTEGER NOT NULL, testo TEXT NOT NULL,
                        PRIMARY KEY (scheda, posizione)) STRICT, WITHOUT ROWID;
-- accettata = 1: accepted_phrases; 0: rejected_counterexamples.
CREATE TABLE scheda_frasi (scheda INTEGER NOT NULL REFERENCES schede(n), accettata INTEGER NOT NULL CHECK (accettata IN (0, 1)),
                        posizione INTEGER NOT NULL, testo TEXT NOT NULL, PRIMARY KEY (scheda, accettata, posizione)) STRICT, WITHOUT ROWID;
CREATE TABLE scheda_nuclei (scheda INTEGER NOT NULL REFERENCES schede(n), nucleo INTEGER NOT NULL,
                        negazione TEXT NOT NULL CHECK (negazione IN ('required', 'forbidden', 'any')), gruppo_polarita INTEGER,
                        PRIMARY KEY (scheda, nucleo)) STRICT, WITHOUT ROWID;
CREATE TABLE scheda_forme (scheda INTEGER NOT NULL, nucleo INTEGER NOT NULL, gruppo INTEGER NOT NULL, posizione INTEGER NOT NULL,
                        forma TEXT NOT NULL, PRIMARY KEY (scheda, nucleo, gruppo, posizione),
                        FOREIGN KEY (scheda, nucleo) REFERENCES scheda_nuclei(scheda, nucleo)) STRICT, WITHOUT ROWID;
CREATE TABLE scheda_tag (scheda INTEGER NOT NULL REFERENCES schede(n), posizione INTEGER NOT NULL, tag INTEGER NOT NULL REFERENCES tag_comici(n),
                        PRIMARY KEY (scheda, posizione)) STRICT, WITHOUT ROWID;
CREATE TABLE scheda_comportamenti (scheda INTEGER NOT NULL REFERENCES schede(n), posizione INTEGER NOT NULL, tag TEXT NOT NULL,
                        PRIMARY KEY (scheda, posizione)) STRICT, WITHOUT ROWID;
CREATE TABLE scheda_modalita (scheda INTEGER NOT NULL REFERENCES schede(n), modalita INTEGER NOT NULL REFERENCES modalita(n),
                        valutazione TEXT NOT NULL CHECK (valutazione IN ('excellent', 'usable', 'avoid')), motivo TEXT NOT NULL,
                        PRIMARY KEY (scheda, modalita)) STRICT, WITHOUT ROWID;
CREATE TABLE scheda_piattaforme (scheda INTEGER NOT NULL REFERENCES schede(n),
                        piattaforma TEXT NOT NULL CHECK (piattaforma IN ('twitch', 'tiktok', 'youtube', 'kick')),
                        stato TEXT NOT NULL CHECK (stato IN ('needs_review', 'approved', 'blocked')), revisionata_il TEXT, revisore TEXT,
                        policy TEXT, motivo TEXT, PRIMARY KEY (scheda, piattaforma)) STRICT, WITHOUT ROWID;
CREATE TABLE scheda_controlli (scheda INTEGER NOT NULL REFERENCES schede(n), posizione INTEGER NOT NULL, codice TEXT NOT NULL,
                        esito TEXT NOT NULL CHECK (esito IN ('PASS', 'REVIEW', 'FAIL')), dettaglio TEXT,
                        PRIMARY KEY (scheda, posizione)) STRICT, WITHOUT ROWID;
CREATE TABLE scheda_storia (scheda INTEGER NOT NULL REFERENCES schede(n), posizione INTEGER NOT NULL, stato TEXT NOT NULL, il TEXT NOT NULL,
                        da TEXT NOT NULL, nota TEXT, PRIMARY KEY (scheda, posizione)) STRICT, WITHOUT ROWID;
CREATE TABLE scheda_prompt (scheda INTEGER NOT NULL REFERENCES schede(n), ruolo TEXT NOT NULL, versione TEXT NOT NULL,
                        PRIMARY KEY (scheda, ruolo)) STRICT, WITHOUT ROWID;
CREATE TABLE scheda_blind_test (scheda INTEGER PRIMARY KEY REFERENCES schede(n), modello TEXT NOT NULL, prompt TEXT NOT NULL,
                        eseguito_il TEXT NOT NULL, esito_spiegazioni TEXT NOT NULL CHECK (esito_spiegazioni IN ('pass', 'review', 'fail')),
                        esito_solo_taboo TEXT NOT NULL CHECK (esito_solo_taboo IN ('pass', 'review', 'fail', 'not_applicable'))) STRICT;
-- prova 0: test solo-Taboo; 1, 2, ...: una spiegazione per prova.
CREATE TABLE scheda_blind_tentativi (scheda INTEGER NOT NULL REFERENCES scheda_blind_test(scheda), prova INTEGER NOT NULL,
                        posizione INTEGER NOT NULL, testo TEXT NOT NULL, PRIMARY KEY (scheda, prova, posizione)) STRICT, WITHOUT ROWID;
CREATE TABLE scheda_revisione (scheda INTEGER PRIMARY KEY REFERENCES schede(n), revisore TEXT NOT NULL, il TEXT NOT NULL,
                        risolvibilita INTEGER NOT NULL CHECK (risolvibilita BETWEEN 1 AND 3), aggancio INTEGER NOT NULL CHECK (aggancio BETWEEN 1 AND 3),
                        strategie INTEGER NOT NULL CHECK (strategie BETWEEN 1 AND 3), improvvisazione INTEGER NOT NULL CHECK (improvvisazione BETWEEN 1 AND 3),
                        decisione TEXT NOT NULL CHECK (decisione IN ('approve', 'repair_once', 'reject')), note TEXT) STRICT;
-- failure_modes del generatore: non fanno parte della scheda (§6.2), servono all'editor.
CREATE TABLE scheda_rischi (scheda INTEGER NOT NULL REFERENCES schede(n), posizione INTEGER NOT NULL, testo TEXT NOT NULL,
                        PRIMARY KEY (scheda, posizione)) STRICT, WITHOUT ROWID;
-- self_rejected del generatore (§5.7: i motivi di esclusione si registrano).
CREATE TABLE scarti_generazione (n INTEGER PRIMARY KEY, categoria INTEGER NOT NULL REFERENCES categorie_v22(n), risposta TEXT NOT NULL,
                        motivo TEXT NOT NULL, lotto TEXT NOT NULL) STRICT;
-- Scheda di runtime (§6.1): solo le carte `active`, nella forma che legge il bot.
CREATE VIEW schede_runtime AS
 SELECT s.card_id, s.versione AS card_version, s.risposta AS canonical_answer, c.category_id, c.codice AS display_code,
        d.nome AS difficulty, s.piccante AS spice_level,
        (SELECT json_group_array(p.testo) FROM (SELECT p.testo FROM scheda_taboo t JOIN parole p ON p.n = t.parola
                                                 WHERE t.scheda = s.n ORDER BY t.posizione) p) AS taboo,
        json_object(
          'accepted_phrases', (SELECT json_group_array(testo) FROM (SELECT testo FROM scheda_frasi WHERE scheda = s.n AND accettata = 1 ORDER BY posizione)),
          'rejected_counterexamples', (SELECT json_group_array(testo) FROM (SELECT testo FROM scheda_frasi WHERE scheda = s.n AND accettata = 0 ORDER BY posizione)),
          'cores', (SELECT json_group_array(json(nucleo)) FROM (
             SELECT json_object('groups', (SELECT json_group_array(json(g)) FROM (
                                   SELECT json_group_array(forma) AS g FROM (SELECT gruppo, forma FROM scheda_forme
                                    WHERE scheda = s.n AND nucleo = k.nucleo ORDER BY gruppo, posizione) GROUP BY gruppo ORDER BY gruppo)),
                                'negation', k.negazione, 'polarity_group', k.gruppo_polarita) AS nucleo
             FROM scheda_nuclei k WHERE k.scheda = s.n ORDER BY k.nucleo)),
          'max_tokens', s.max_token) AS answer_validation,
        (SELECT json_group_object(m.mode_id, sm.valutazione) FROM scheda_modalita sm JOIN modalita m ON m.n = sm.modalita
          WHERE sm.scheda = s.n AND sm.valutazione <> 'avoid') AS modes,
        (SELECT json_group_object(piattaforma, stato) FROM scheda_piattaforme WHERE scheda = s.n) AS platforms
 FROM schede s JOIN categorie_v22 c ON c.n = s.categoria JOIN difficolta d ON d.n = s.difficolta JOIN stati_editoriali st ON st.n = s.stato
 WHERE st.nome = 'active';
-- Una riga per scheda, per l'editor.
CREATE VIEW schede_riepilogo AS
 SELECT s.card_id, c.codice AS display_code, c.category_id, s.risposta AS canonical_answer, d.nome AS difficulty, s.piccante AS spice_level,
        st.nome AS editorial_status, tg.nome AS humor_primary,
        (SELECT count(*) FROM scheda_controlli WHERE scheda = s.n AND esito = 'FAIL') AS fail,
        (SELECT count(*) FROM scheda_controlli WHERE scheda = s.n AND esito = 'REVIEW') AS review,
        (SELECT group_concat(p.testo, ', ') FROM (SELECT p.testo FROM scheda_taboo t JOIN parole p ON p.n = t.parola
                                                   WHERE t.scheda = s.n ORDER BY t.posizione) p) AS taboo
 FROM schede s JOIN categorie_v22 c ON c.n = s.categoria JOIN difficolta d ON d.n = s.difficolta
      JOIN stati_editoriali st ON st.n = s.stato JOIN tag_comici tg ON tg.n = s.umorismo;
'''


def validate_files(files: list[dict], ctx: Context) -> list[str]:
    """Errori bloccanti per l'import: schema, catalogo, identificatori unici, categoria del file."""
    errors: list[str] = []
    seen: set[str] = set()
    for f in files:
        for card in f['cards']:
            cid = card.get('card_id')
            if cid in seen:
                errors.append(f'{cid}: identificatore duplicato')
            seen.add(cid)
            if card.get('category_id') != f['category_id']:
                errors.append(f'{cid}: nel file di {f["category_id"]} ma di categoria {card.get("category_id")}')
            for e in ctx.schema.errors(card):
                errors.append(f'{cid}: {e}')
            if card.get('category_id') not in ctx.categories:
                errors.append(f'{cid}: categoria assente dal catalogo')
            for mode in card.get('mode_compatibility', {}):
                if mode not in ctx.modes:
                    errors.append(f'{cid}: modalità «{mode}» assente dal catalogo')
        for cid in f.get('failure_modes', {}):
            if cid not in {c['card_id'] for c in f['cards']}:
                errors.append(f'failure_modes di {cid}, che non è nel file {f["category_id"]}')
    return errors


def build_tables(db: sqlite3.Connection, files: list[dict], ctx: Context) -> int:
    errors = validate_files(files, ctx)
    if errors:
        raise SystemExit('Schede v2.2 non valide:\n - ' + '\n - '.join(errors[:50]))
    db.executescript(DB_SCHEMA)
    cats = {}
    for i, c in enumerate(ctx.catalog['categories'], 1):
        cats[c['category_id']] = i
        db.execute('INSERT INTO categorie_v22 VALUES (?,?,?,?,?,?,?,?,?)', (i, c['category_id'], c['display_code'], c['name'], c['kind'],
                   c['status'], c['max_spice'], 1 if c.get('derived') else 0, c.get('description')))
    modes = {}
    for i, m in enumerate(ctx.catalog['modes'], 1):
        modes[m['mode_id']] = i
        db.execute('INSERT INTO modalita VALUES (?,?,?,?,?,?)', (i, m['mode_id'], m['family'], m['hint'], m.get('risk'), m['status']))
    rel = {r: i for i, r in enumerate(RELATIONS, 1)}
    tags = {t: i for i, t in enumerate(HUMOR_TAGS, 1)}
    stat = {s: i for i, s in enumerate(STATUSES, 1)}
    db.executemany('INSERT INTO relazioni VALUES (?,?)', [(i, r) for r, i in rel.items()])
    db.executemany('INSERT INTO tag_comici VALUES (?,?)', [(i, t) for t, i in tags.items()])
    db.executemany('INSERT INTO stati_editoriali VALUES (?,?)', [(i, s) for s, i in stat.items()])
    db.executemany('INSERT INTO difficolta VALUES (?,?)', [(i, d) for d, i in DIFFICULTY.items()])
    words = dict(db.execute('SELECT testo, n FROM parole'))
    next_word = max(words.values(), default=0) + 1
    count = 0
    for f in files:
        for card in f['cards']:
            count += 1
            n = count
            av = card['answer_validation']
            pv = card['provenance']
            db.execute('INSERT INTO schede VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', (
                n, card['card_id'], card['card_version'], card['canonical_answer'], card.get('answer_hash'), card['scene_premise'],
                cats[card['category_id']], card.get('category_rationale'), DIFFICULTY[card['difficulty']], card['spice_level'],
                tags[card['humor_primary']], stat[card['editorial_status']], card.get('repair_count'), av.get('max_tokens'),
                pv['source'], pv.get('generator_model'), pv.get('validator_version'), pv['created_at'], pv.get('migrated_from')))
            for pos, t in enumerate(card['taboo'], 1):
                if t['word'] not in words:
                    words[t['word']] = next_word
                    db.execute('INSERT INTO parole VALUES (?,?)', (next_word, t['word']))
                    next_word += 1
                db.execute('INSERT INTO scheda_taboo VALUES (?,?,?,?)', (n, pos, words[t['word']], rel[t['relation']]))
            db.executemany('INSERT INTO scheda_spiegazioni VALUES (?,?,?)', [(n, i, e) for i, e in enumerate(card['explanations'], 1)])
            db.executemany('INSERT INTO scheda_frasi VALUES (?,?,?,?)', [(n, 1, i, p) for i, p in enumerate(av['accepted_phrases'], 1)]
                           + [(n, 0, i, p) for i, p in enumerate(av['rejected_counterexamples'], 1)])
            for k, core in enumerate(av['cores'], 1):
                db.execute('INSERT INTO scheda_nuclei VALUES (?,?,?,?)', (n, k, core['negation'], core.get('polarity_group')))
                db.executemany('INSERT INTO scheda_forme VALUES (?,?,?,?,?)',
                               [(n, k, g, i, form) for g, group in enumerate(core['groups']) for i, form in enumerate(group, 1)])
            db.executemany('INSERT INTO scheda_tag VALUES (?,?,?)', [(n, i, tags[t]) for i, t in enumerate(card['humor_tags'], 1)])
            db.executemany('INSERT INTO scheda_comportamenti VALUES (?,?,?)', [(n, i, t) for i, t in enumerate(card.get('behavior_tags', []), 1)])
            db.executemany('INSERT INTO scheda_modalita VALUES (?,?,?,?)',
                           [(n, modes[m], r['rating'], r['reason']) for m, r in card['mode_compatibility'].items()])
            db.executemany('INSERT INTO scheda_piattaforme VALUES (?,?,?,?,?,?,?)',
                           [(n, p, r['status'], r.get('reviewed_at'), r.get('reviewer'), r.get('policy_reference'), r.get('reason'))
                            for p, r in card['platform_reviews'].items()])
            db.executemany('INSERT INTO scheda_controlli VALUES (?,?,?,?,?)',
                           [(n, i, c['code'], c['outcome'], c.get('detail')) for i, c in enumerate(card.get('checks', []), 1)])
            db.executemany('INSERT INTO scheda_storia VALUES (?,?,?,?,?,?)',
                           [(n, i, h['status'], h['at'], h['by'], h.get('note')) for i, h in enumerate(card.get('status_history', []), 1)])
            db.executemany('INSERT INTO scheda_prompt VALUES (?,?,?)', [(n, r, v) for r, v in pv.get('prompt_versions', {}).items()])
            bt = card.get('blind_test')
            if bt:
                db.execute('INSERT INTO scheda_blind_test VALUES (?,?,?,?,?,?)', (n, bt['tester_model'], bt['prompt_version'], bt['run_at'],
                           bt['explanation_result'], bt['taboo_only_result']))
                rows = [(n, i, j, g) for i, guesses in enumerate(bt['explanation_guesses'], 1) for j, g in enumerate(guesses, 1)]
                rows += [(n, 0, j, g) for j, g in enumerate(bt.get('taboo_only_guesses', []), 1)]
                db.executemany('INSERT INTO scheda_blind_tentativi VALUES (?,?,?,?)', rows)
            er = card.get('editor_review')
            if er:
                db.execute('INSERT INTO scheda_revisione VALUES (?,?,?,?,?,?,?,?,?)', (n, er['reviewed_by'], er['reviewed_at'], er['solvability'],
                           er['scenic']['hook'], er['scenic']['strategies'], er['scenic']['improvisation'], er['decision'], er.get('notes')))
            db.executemany('INSERT INTO scheda_rischi VALUES (?,?,?)', [(n, i, t) for i, t in enumerate(f.get('failure_modes', {}).get(card['card_id'], []), 1)])
        db.executemany('INSERT INTO scarti_generazione (categoria, risposta, motivo, lotto) VALUES (?,?,?,?)',
                       [(cats[f['category_id']], r['canonical_answer'], r['reason'], r['batch']) for r in f.get('self_rejected', [])])
    db.executemany('INSERT INTO meta VALUES (?,?)', [('schede_v22', str(count)), ('catalogo_v22', ctx.catalog['catalog_version']),
                                                     ('schema_scheda', '2.2')])
    return count


def _drop_none(d: dict) -> dict:
    return {k: v for k, v in d.items() if v is not None}


def read_cards(db: sqlite3.Connection) -> tuple[list[dict], dict[str, list[str]], list[tuple[str, str, str, str]]]:
    """Ricostruisce dal database le schede v2.2, i failure_modes e gli scarti del generatore."""
    q = db.execute
    cards = []
    failure: dict[str, list[str]] = {}
    for row in q('''SELECT s.n, s.card_id, s.versione, s.risposta, s.answer_hash, s.premessa, c.category_id, s.motivazione_categoria, d.nome,
                           s.piccante, tg.nome, st.nome, s.riparazioni, s.max_token, s.origine, s.modello, s.validatore, s.creata, s.migrata_da
                    FROM schede s JOIN categorie_v22 c ON c.n = s.categoria JOIN difficolta d ON d.n = s.difficolta
                    JOIN tag_comici tg ON tg.n = s.umorismo JOIN stati_editoriali st ON st.n = s.stato ORDER BY s.n''').fetchall():
        n = row[0]
        cores = []
        for k, neg, pol in q('SELECT nucleo, negazione, gruppo_polarita FROM scheda_nuclei WHERE scheda = ? ORDER BY nucleo', (n,)):
            groups: dict[int, list[str]] = {}
            for g, form in q('SELECT gruppo, forma FROM scheda_forme WHERE scheda = ? AND nucleo = ? ORDER BY gruppo, posizione', (n, k)):
                groups.setdefault(g, []).append(form)
            cores.append(_drop_none({'groups': [groups[g] for g in sorted(groups)], 'negation': neg, 'polarity_group': pol}))
        phrases = {1: [], 0: []}
        for acc, text in q('SELECT accettata, testo FROM scheda_frasi WHERE scheda = ? ORDER BY accettata, posizione', (n,)):
            phrases[acc].append(text)
        card = _drop_none({
            'schema_version': '2.2', 'card_id': row[1], 'card_version': row[2], 'canonical_answer': row[3], 'answer_hash': row[4],
            'scene_premise': row[5], 'category_id': row[6], 'category_rationale': row[7], 'difficulty': row[8], 'spice_level': row[9],
            'taboo': [{'word': w, 'relation': r} for w, r in q('''SELECT p.testo, r.nome FROM scheda_taboo t JOIN parole p ON p.n = t.parola
                       JOIN relazioni r ON r.n = t.relazione WHERE t.scheda = ? ORDER BY t.posizione''', (n,))],
            'explanations': [t for t, in q('SELECT testo FROM scheda_spiegazioni WHERE scheda = ? ORDER BY posizione', (n,))],
            'answer_validation': _drop_none({'accepted_phrases': phrases[1], 'rejected_counterexamples': phrases[0], 'cores': cores,
                                             'max_tokens': row[13]}),
            'humor_primary': row[10],
            'humor_tags': [t for t, in q('SELECT g.nome FROM scheda_tag t JOIN tag_comici g ON g.n = t.tag WHERE t.scheda = ? ORDER BY t.posizione', (n,))],
            'behavior_tags': [t for t, in q('SELECT tag FROM scheda_comportamenti WHERE scheda = ? ORDER BY posizione', (n,))],
            'mode_compatibility': {m: {'rating': r, 'reason': why} for m, r, why in q(
                'SELECT m.mode_id, sm.valutazione, sm.motivo FROM scheda_modalita sm JOIN modalita m ON m.n = sm.modalita WHERE sm.scheda = ?', (n,))},
            'platform_reviews': {p: _drop_none({'status': s, 'reviewed_at': at, 'reviewer': who, 'policy_reference': pol, 'reason': why})
                                 for p, s, at, who, pol, why in q('SELECT piattaforma, stato, revisionata_il, revisore, policy, motivo'
                                                                  ' FROM scheda_piattaforme WHERE scheda = ?', (n,))},
            'editorial_status': row[11], 'repair_count': row[12],
            'status_history': [_drop_none({'status': s, 'at': at, 'by': by, 'note': note}) for s, at, by, note in q(
                'SELECT stato, il, da, nota FROM scheda_storia WHERE scheda = ? ORDER BY posizione', (n,))],
            'checks': [_drop_none({'code': c, 'outcome': o, 'detail': d}) for c, o, d in q(
                'SELECT codice, esito, dettaglio FROM scheda_controlli WHERE scheda = ? ORDER BY posizione', (n,))],
            'provenance': _drop_none({'source': row[14], 'generator_model': row[15],
                                      'prompt_versions': dict(q('SELECT ruolo, versione FROM scheda_prompt WHERE scheda = ?', (n,))) or None,
                                      'validator_version': row[16], 'created_at': row[17], 'migrated_from': row[18]}),
        })
        bt = q('SELECT modello, prompt, eseguito_il, esito_spiegazioni, esito_solo_taboo FROM scheda_blind_test WHERE scheda = ?', (n,)).fetchone()
        if bt:
            tries: dict[int, list[str]] = {}
            for prova, text in q('SELECT prova, testo FROM scheda_blind_tentativi WHERE scheda = ? ORDER BY prova, posizione', (n,)):
                tries.setdefault(prova, []).append(text)
            card['blind_test'] = _drop_none({'tester_model': bt[0], 'prompt_version': bt[1], 'run_at': bt[2],
                                             'explanation_guesses': [tries[i] for i in sorted(tries) if i > 0],
                                             'explanation_result': bt[3], 'taboo_only_guesses': tries.get(0), 'taboo_only_result': bt[4]})
        er = q('SELECT revisore, il, risolvibilita, aggancio, strategie, improvvisazione, decisione, note FROM scheda_revisione WHERE scheda = ?', (n,)).fetchone()
        if er:
            card['editor_review'] = _drop_none({'reviewed_by': er[0], 'reviewed_at': er[1], 'solvability': er[2],
                                                'scenic': {'hook': er[3], 'strategies': er[4], 'improvisation': er[5]},
                                                'decision': er[6], 'notes': er[7]})
        cards.append(card)
        modes = [t for t, in q('SELECT testo FROM scheda_rischi WHERE scheda = ? ORDER BY posizione', (n,))]
        failure[row[1]] = modes
    scarti = [tuple(r) for r in q('SELECT c.category_id, s.risposta, s.motivo, s.lotto FROM scarti_generazione s'
                                  ' JOIN categorie_v22 c ON c.n = s.categoria ORDER BY s.n')]
    return cards, failure, scarti


def comparable(card: dict) -> dict:
    """Forma canonica per il confronto fonte/database: i campi facoltativi vuoti valgono come assenti."""
    c = json.loads(json.dumps(card))
    for key in ('behavior_tags', 'status_history', 'checks'):
        if not c.get(key):
            c.pop(key, None)
    if c.get('blind_test') and not c['blind_test'].get('taboo_only_guesses'):
        c['blind_test'].pop('taboo_only_guesses', None)
    if c.get('provenance') and not c['provenance'].get('prompt_versions'):
        c['provenance'].pop('prompt_versions', None)
    return c


def verify_db(db: sqlite3.Connection, files: list[dict]) -> list[str]:
    cards, failure, scarti = read_cards(db)
    problems: list[str] = []
    stored = {c['card_id']: c for c in cards}
    source = {c['card_id']: c for c in all_cards(files)}
    if set(stored) != set(source):
        problems.append(f'Schede v2.2: {len(stored)} nel database, {len(source)} nella fonte')
    for cid, card in source.items():
        if cid in stored and comparable(stored[cid]) != comparable(card):
            diff = [k for k in set(card) | set(stored[cid]) if comparable(card).get(k) != comparable(stored[cid]).get(k)]
            problems.append(f'{cid}: diverso dalla fonte ({", ".join(sorted(diff))})')
    want_fm = {cid: modes for f in files for cid, modes in f.get('failure_modes', {}).items()}
    for cid in source:
        if failure.get(cid, []) != want_fm.get(cid, []):
            problems.append(f'{cid}: failure_modes diversi dalla fonte')
    want_sr = [(f['category_id'], r['canonical_answer'], r['reason'], r['batch']) for f in files for r in f.get('self_rejected', [])]
    if scarti != want_sr:
        problems.append('Scarti del generatore diversi dalla fonte')
    return problems


# ---- Riepilogo ed esportazione ----

def report(files: list[dict]) -> list[str]:
    lines = []
    total: dict[str, int] = {}
    for f in files:
        cards = f['cards']
        st: dict[str, int] = {}
        for c in cards:
            st[c['editorial_status']] = st.get(c['editorial_status'], 0) + 1
            total[c['editorial_status']] = total.get(c['editorial_status'], 0) + 1
        p = [sum(1 for c in cards if c['spice_level'] == i) for i in range(4)]
        d = [sum(1 for c in cards if c['difficulty'] == x) for x in DIFFICULTY]
        top = max(HUMOR_TAGS, key=lambda t: sum(1 for c in cards if c['humor_primary'] == t))
        lines.append(f'{f["category_id"]:<11} {len(cards):>3} carte  stati {st}  P0-3 {p}  easy/medium/hard {d}  '
                     f'tag più usato {top} ({sum(1 for c in cards if c["humor_primary"] == top)})  scarti {len(f.get("self_rejected", []))}')
    lines.append(f'Totale: {sum(total.values())} carte, {total}')
    return lines


def export_csv(files: list[dict], path: Path) -> None:
    with path.open('w', encoding='utf-8-sig', newline='') as stream:
        w = csv.writer(stream)
        w.writerow(['card_id', 'categoria', 'stato', 'risposta', 'premessa', 'difficoltà', 'piccante', 'taboo', 'spiegazione 1',
                    'spiegazione 2', 'frasi accettate', 'controesempi', 'umorismo', 'modalità excellent', 'controlli non PASS', 'rischi'])
        for f in files:
            for c in f['cards']:
                av = c['answer_validation']
                cells = [c['card_id'], c['category_id'], c['editorial_status'], c['canonical_answer'], c['scene_premise'], c['difficulty'],
                         c['spice_level'], ' | '.join(f'{t["word"]} ({t["relation"]})' for t in c['taboo']), c['explanations'][0],
                         c['explanations'][1] if len(c['explanations']) > 1 else '', ' | '.join(av['accepted_phrases']),
                         ' | '.join(av['rejected_counterexamples']), ', '.join(c['humor_tags']),
                         ', '.join(m for m, r in c['mode_compatibility'].items() if r['rating'] == 'excellent'),
                         ' | '.join(f'{k["code"]} {k["outcome"]}: {k.get("detail", "")}' for k in c.get('checks', []) if k['outcome'] != 'PASS'),
                         ' | '.join(f.get('failure_modes', {}).get(c['card_id'], []))]
                w.writerow([("'" + x) if isinstance(x, str) and x[:1] in '=+-@' else x for x in cells])


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('command', choices=['ingest', 'lint', 'check', 'report', 'export'])
    ap.add_argument('files', nargs='*', type=Path)
    ap.add_argument('--write', action='store_true', help='check: salva gli esiti ricalcolati nelle schede')
    ap.add_argument('--csv', type=Path, default=DATA / 'schede-v2.2.csv')
    args = ap.parse_args(argv)
    if args.command in ('ingest', 'lint'):
        if not args.files:
            ap.error(f'{args.command}: indicare almeno una bozza')
        ctx = Context()
        out = ingest(args.files, ctx) if args.command == 'ingest' else lint(args.files, ctx)
        print('\n'.join(out) if out else 'Nessun problema')
        return 0 if args.command == 'ingest' or not out else 1
    files = load_card_files()
    if args.command == 'report':
        print('\n'.join(report(files)))
        return 0
    if args.command == 'export':
        export_csv(files, args.csv)
        print(f'Esportato {args.csv}')
        return 0
    ctx = Context()
    cards = all_cards(files)
    changed = 0
    for card in cards:
        fresh = check_card(card, ctx, others_for(card, cards, ctx.v3))
        if fresh != card.get('checks'):
            changed += 1
            print(f'{card["card_id"]} {card["canonical_answer"]}: esiti cambiati')
            if args.write:
                card['checks'] = fresh
    if args.write and changed:
        for f in files:
            write_card_file(f)
    print(f'{len(cards)} schede, {changed} con esiti diversi da quelli registrati' + (' (salvati)' if args.write and changed else ''))
    return 1 if changed and not args.write else 0


if __name__ == '__main__':
    sys.exit(main())

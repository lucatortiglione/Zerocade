"""Pulizia ortografica del RAW: niente emoji, decorazioni, falsi accorpamenti espressioni multiparola e forme con apostrofo."""
import json
import re
import unicodedata

VERSION = 'raw-word-cleaning-3'
URL = re.compile(r'(?i)(?:https?://|www\.)\S+')
EMAIL = re.compile(r'(?i)\b[^\s@]+@[^\s@]+\.[^\s@]+\b')
FACES = re.compile(r"(?i)(?:[:;=8][\-^']?[)(dpso/\\|]+|<3|\^[_-]?\^|(?<!\w)(?:x[dp]|[dp][\-^']?[:;=]|t[_-]t|o[_-]o))(?!\w)")
KEYCAP = re.compile(r'[0-9#*]\ufe0f?\u20e3')
PREFIX = re.compile(r'(?<!\w)[#@]+(?=[^\W\d_])')
APOCOPES = {'po','be','mo','fa','da','di','sta','va','to'}
QUOTES = {'’', '‘', 'ʼ', '＇', '`', '´'}


def latin(char):
    return unicodedata.category(char).startswith('L') and 'LATIN' in unicodedata.name(char,'')


def clean_word(value):
    if not isinstance(value,str):
        return None
    value = unicodedata.normalize('NFC',value).casefold()
    value = KEYCAP.sub(' ',value)
    value = EMAIL.sub(' ',URL.sub(' ',value))
    value = FACES.sub(' ',value)
    value = ''.join(' ' if unicodedata.category(c) in {'So','Sk'} else ''
                    if unicodedata.category(c)=='Cf' else c for c in value)
    value = unicodedata.normalize('NFKC',value)
    value = ''.join("'" if c in QUOTES else c for c in value)
    value = PREFIX.sub('',value)
    chunks = []
    for token in value.split():
        # Non ricavare "ho" da h2o o frammenti latini da parole di altri alfabeti.
        if any(c.isdigit() or (unicodedata.category(c).startswith('L') and not latin(c)) for c in token):
            continue
        output = []
        for i,c in enumerate(token):
            if latin(c):
                output.append(c)
            elif unicodedata.category(c).startswith('M') and output and latin(output[-1]):
                output.append(c)
            elif c=="'" and i>0 and latin(token[i-1]) and (
                    (i+1<len(token) and latin(token[i+1])) or (i==len(token)-1 and token[:i] in APOCOPES)):
                return None  # elisioni e troncamenti (l'acqua, po'): non sono parole singole
            else:
                output.append(' ')
        chunks.extend(''.join(output).split())
    # Solo parole singole: "a bagnomaria", "cane/gatto" o "a mo' di" non sono voci del RAW.
    if len(chunks)!=1:
        return None
    result = unicodedata.normalize('NFC',chunks[0]).strip()
    return result if result and any(latin(c) for c in result) else None


def clean_existing(con, *, force=False):
    """Migrazione atomica, con unione delle provenienze e risultato derivato da aggiornare."""
    current = con.execute("SELECT value FROM meta WHERE name='word_cleanup_version'").fetchone()
    if not force and current==(VERSION,):
        return {'version':VERSION,'already_clean':True}
    foreign_keys = con.execute('PRAGMA foreign_keys').fetchone()[0]
    con.execute('PRAGMA foreign_keys=OFF')
    con.execute('BEGIN IMMEDIATE')
    try:
        before = con.execute('SELECT count(*) FROM parole').fetchone()[0]
        con.execute('CREATE TEMP TABLE cleanup_map(originale TEXT PRIMARY KEY,pulita TEXT,single_word INTEGER) WITHOUT ROWID')
        changed = removed = 0
        batch = []
        for number,(word,) in enumerate(con.execute('SELECT parola FROM parole'),1):
            cleaned = clean_word(word)
            removed += cleaned is None
            changed += cleaned is not None and cleaned!=word
            single = int(bool(cleaned and re.fullmatch(r'[a-zàèéìòù]+',cleaned)))
            batch.append((word,cleaned,single))
            if len(batch)>=10000:
                con.executemany('INSERT INTO cleanup_map VALUES (?,?,?)',batch); batch.clear()
            if number%250000==0:
                print(f'Pulizia: {number:,}/{before:,} voci',flush=True)
        if batch:
            con.executemany('INSERT INTO cleanup_map VALUES (?,?,?)',batch)
        con.execute('''CREATE TEMP TABLE cleaned_words AS SELECT pulita AS parola,max(single_word) AS is_single_word
                       FROM cleanup_map WHERE pulita IS NOT NULL GROUP BY pulita''')
        con.execute('''CREATE TEMP TABLE cleaned_links AS SELECT DISTINCT m.pulita AS parola,f.fonte_id
                       FROM parole_fonti f JOIN cleanup_map m ON m.originale=f.parola WHERE m.pulita IS NOT NULL''')
        # normalizzata e le sue tabelle derivate si ricalcolano con "Normalizzare parole RAW" (lo stato diventa da_aggiornare).
        tables = {r[0] for r in con.execute("SELECT name FROM sqlite_schema WHERE type='table'")}
        for table in ('word_measurements','normalizzazione_esclusioni','normalizzata'):
            if table in tables:
                con.execute('DELETE FROM '+table)
        con.execute('DELETE FROM parole_fonti')
        con.execute('DELETE FROM parole')
        con.execute('INSERT INTO parole SELECT * FROM cleaned_words')
        con.execute('INSERT INTO parole_fonti SELECT * FROM cleaned_links')
        after = con.execute('SELECT count(*) FROM parole').fetchone()[0]
        report = {'version':VERSION,'source_words':before,'cleaned_words':after,
                  'removed':removed,'transformed':changed,'merged_duplicates':before-removed-after}
        con.execute("INSERT OR REPLACE INTO meta VALUES ('word_cleanup_version',?)",(VERSION,))
        con.execute("INSERT OR REPLACE INTO meta VALUES ('word_cleanup_report',?)",(json.dumps(report),))
        con.execute("UPDATE meta SET value='da_aggiornare' WHERE name='normalizzazione_stato'")
        if con.execute('PRAGMA foreign_key_check').fetchone():
            raise ValueError('Riferimenti non validi dopo la pulizia')
        for table in ('cleaned_words','cleaned_links','cleanup_map'):
            con.execute('DROP TABLE '+table)
        con.execute('COMMIT')
        return report
    except BaseException:
        con.execute('ROLLBACK')
        raise
    finally:
        con.execute(f'PRAGMA foreign_keys={foreign_keys}')

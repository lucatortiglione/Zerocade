"""I bacini verificati come li usa il gioco, in sola lettura, e il confronto fra parole.

Le stesse regole di packages/shared/src/wordAssociation.ts: una parola si confronta senza
accenti né maiuscole (answer_key) e un nome o aggettivo vale anche nelle forme flesse
regolari (inflections). Il gioco accetta queste forme dalla chat: l'analisi della telemetria e
la simulazione dei giocatori devono riconoscerle allo stesso modo.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
import re
import sqlite3
import unicodedata

ROOT = Path(__file__).resolve().parent
DEFAULT_DB = ROOT/'prompt.sqlite3'


def answer_key(text: str) -> str:
    """CAFFÈ -> caffe: minuscole, senza accenti, solo lettere."""
    folded = unicodedata.normalize('NFD', text).casefold()
    return re.sub(r'[^a-z]', '', ''.join(c for c in folded if not unicodedata.combining(c)))


def inflections(word: str, pos: str) -> list[str]:
    """Plurali (e per gli aggettivi l'altro genere) regolari; i verbi restano all'infinito."""
    if pos == 'VERB' or len(word) < 3 or not re.search(r'[aeio]$', word):
        return []
    if pos != 'ADJ' and len(word) > 5 and re.search(r'(?:are|ere|ire|rsi)$', word):
        return []
    stem = word[:-1]
    out: list[str] = []
    if re.search(r'[cg]o$', word): out += [stem+'hi', stem+'i']
    elif re.search(r'[cg]ia$', word): out += [word[:-2]+'e', stem+'e']
    elif re.search(r'[cg]a$', word): out += [stem+'he']
    elif word.endswith('io'): out += [stem]
    elif word.endswith('o'): out += [stem+'i']
    elif word.endswith('a'):
        out += [stem+'e']
        if re.search(r'(?:ma|ista)$', word): out += [stem+'i']
    elif word.endswith('e'): out += [stem+'i']
    if pos == 'ADJ' and word.endswith('o'):
        out += [stem+'a', stem+('he' if re.search(r'[cg]o$', word) else 'e')]
    return [f for f in dict.fromkeys(out) if f != word and re.fullmatch(r'[a-zàèéìòù]+', f)]


def keys_of(word: str, pos: str) -> set[str]:
    return {answer_key(w) for w in [word, *inflections(word, pos)]}


@dataclass
class Pool:
    sense_id: str
    prompt: str
    pos: str
    sense: str
    category_id: str | None
    answers: dict[str, dict] = field(default_factory=dict)  # parola -> {group, difficulty, difficulty_basis}

    @property
    def ref(self) -> str:
        import hashlib
        return 'c'+hashlib.sha256(self.sense_id.encode('utf-8')).hexdigest()[:24]

    def answer_for(self, text: str) -> str | None:
        """La risposta del bacino che `text` indica, anche flessa; None se nessuna."""
        key = answer_key(text)
        for word in self.answers:
            if key in keys_of(word, self.pos): return word
        return None


def load_pools(path: Path = DEFAULT_DB) -> list[Pool]:
    """Il senso familiare di ogni prompt con revisione verificata, come lo legge il server
    (senza i prompt che la raccolta segna DISCARDED o DEFERRED)."""
    path = Path(path)
    if not path.exists(): raise FileNotFoundError(f'Database assente: {path}')
    db = sqlite3.connect(f'file:{path.as_posix()}?mode=ro', uri=True)
    try:
        db.row_factory = sqlite3.Row
        pools = {}
        # Come il gioco: un prompt scartato o rimandato nella raccolta non gioca.
        decided = db.execute("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='inventory_term_decisions'").fetchone()
        exclusion = (" AND NOT EXISTS (SELECT 1 FROM inventory_term_decisions d WHERE d.prompt = s.prompt "
                     "AND d.decision IN ('DISCARDED', 'DEFERRED'))" if decided else '')
        for row in db.execute(
                "SELECT s.id, s.prompt, s.description, s.pos, s.category_id FROM prompts p "
                "JOIN senses s ON s.prompt = p.lemma AND s.description = p.familiar_sense "
                "JOIN reviews r ON r.id = s.review_id WHERE r.decision = 'verified'" + exclusion + " ORDER BY s.prompt"):
            pools[row['id']] = Pool(row['id'], row['prompt'], row['pos'], row['description'], row['category_id'])
        columns = {r[1] for r in db.execute('PRAGMA table_info(associations)')}
        basis = 'difficulty_basis' if 'difficulty_basis' in columns else "''"
        for row in db.execute(f'SELECT sense_id, word, meaning_group, difficulty, {basis} AS basis FROM associations'):
            if row['sense_id'] in pools:
                pools[row['sense_id']].answers[row['word']] = {
                    'group': row['meaning_group'], 'difficulty': row['difficulty'], 'difficulty_basis': row['basis']}
        return list(pools.values())
    finally:
        db.close()

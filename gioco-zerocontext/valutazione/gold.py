"""Associazioni verificate di ZeroAssociazioni (giochi.sqlite3, sola lettura): la parte «sì/no» della misura."""
from __future__ import annotations

from contextlib import closing
from dataclasses import dataclass
import hashlib
from pathlib import Path

from valutazione import paths
from valutazione.common import connect_ro, norm


@dataclass(frozen=True)
class GoldEntry:
    gloss: str
    pos: str
    # parola associata -> gruppo di significato: parole quasi equivalenti (coda, scodinzolare) hanno lo stesso numero
    groups: dict[str, int]


Gold = dict[str, GoldEntry]


def load_gold(giochi: Path = paths.GIOCHI) -> Gold:
    """Una voce per parola-guida. Ogni parola-guida ha un solo senso: due righe con la stessa parola sono un errore."""
    with closing(connect_ro(giochi)) as con:
        prompts = con.execute('SELECT id, prompt, pos, sense FROM associazioni__prompts ORDER BY id').fetchall()
        seen: set[str] = set()
        for _, prompt, _, _ in prompts:
            if norm(prompt) in seen:
                raise ValueError(f'La parola-guida «{prompt}» ha più di un senso in associazioni__prompts')
            seen.add(norm(prompt))
        words: dict[int, dict[str, int]] = {}
        rows = con.execute('''SELECT pw.prompt_id, w.word, pw.group_name_id, pw.word_id
                              FROM associazioni__prompt_words pw JOIN associazioni__words w ON w.id = pw.word_id
                              ORDER BY pw.prompt_id, w.word''')
        for prompt_id, word, group, word_id in rows:
            # Senza gruppo, la parola è un gruppo a sé (numero negativo: non può coincidere con un gruppo vero).
            words.setdefault(prompt_id, {})[norm(word)] = group if group is not None else -word_id
    return {norm(prompt): GoldEntry(sense or '', pos or '', words.get(pid, {})) for pid, prompt, pos, sense in prompts}


def fingerprint(giochi: Path = paths.GIOCHI) -> str:
    """SHA-256 delle tre tabelle lette, in ordine: dice se le associazioni sono cambiate tra due esecuzioni."""
    digest = hashlib.sha256()
    queries = (
        ('prompts', 'SELECT id, prompt, pos, sense FROM associazioni__prompts ORDER BY id'),
        ('words', 'SELECT id, word FROM associazioni__words ORDER BY id'),
        ('prompt_words', 'SELECT prompt_id, word_id, group_name_id FROM associazioni__prompt_words ORDER BY prompt_id, word_id'),
    )
    with closing(connect_ro(giochi)) as con:
        for name, sql in queries:
            digest.update(f'#{name}\n'.encode('utf-8'))
            for row in con.execute(sql):
                digest.update(('\t'.join('' if v is None else str(v) for v in row) + '\n').encode('utf-8'))
    return digest.hexdigest()

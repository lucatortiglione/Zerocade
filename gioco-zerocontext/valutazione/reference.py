"""Riferimento della valutazione: segrete, lemmi e forme flesse di raw 2.0, più Morph-it!.

`parole_ita_raw_2.0.sqlite3` si apre solo in lettura (spec, sezione 4.1). Ogni interrogazione apre e chiude la propria
connessione: su Windows una connessione tenuta aperta impedirebbe di cancellare o sostituire il file.
"""
from __future__ import annotations

from contextlib import closing
import hashlib
from pathlib import Path
from typing import Literal

from valutazione import paths
from valutazione.common import connect_ro as _connect, norm

Pos = Literal['NOUN', 'VERB', 'ADJ', 'ALTRO']
DERIVATIVE_ENDINGS = ('ario', 'aria', 'arie', 'ari')
MIN_STEM = 4


class ReferenceChanged(RuntimeError):
    """raw 2.0 è cambiato durante la valutazione: i numeri non sarebbero confrontabili."""


def _group(ordinaria: int, legacy: int, deroga: int, word: str) -> str:
    if ordinaria:
        return 'ordinaria' if legacy else 'aggiunta'
    if deroga:
        return 'deroga'
    raise ValueError(f"La segreta «{word}» non è né ordinaria né con deroga in raw 2.0")


def _load_morphit(path: Path) -> dict[str, list[tuple[str, str]]]:
    if not path.exists():
        raise FileNotFoundError(f'Manca Morph-it!: lancia python gioco-zerocontext/script/fetch_morphit.py ({path})')
    forms: dict[str, list[tuple[str, str]]] = {}
    with path.open(encoding='utf-8') as f:
        for line in f:
            parts = line.rstrip('\n').split('\t')
            if len(parts) >= 3:
                forms.setdefault(norm(parts[0]), []).append((norm(parts[1]), parts[2]))
    return forms


class Reference:
    def __init__(self, raw2: Path, morphit: dict[str, list[tuple[str, str]]], secrets: dict[str, str], fingerprint: str):
        self.raw2 = raw2
        self.secrets = secrets
        self._morphit = morphit
        self._fingerprint = fingerprint
        self._cache: dict[tuple[str, str], object] = {}

    def _one(self, kind: str, sql: str, word: str):
        key = (kind, word)
        if key not in self._cache:
            with closing(_connect(self.raw2)) as con:
                self._cache[key] = con.execute(sql, (word,)).fetchone()
        return self._cache[key]

    def lemmas(self, word: str) -> set[str]:
        """Lemmi della forma: quelli di raw 2.0 (esclusioni) e di Morph-it!, più la parola se è già un lemma di raw 2.0.

        Le due fonti insieme servono perché raw 2.0 contiene errori (es. «cani» → «cano» invece di «cane»)."""
        word = norm(word)
        found = {lemma for lemma, _ in self._morphit.get(word, [])}
        row = self._one('esclusione', 'SELECT sostituita_da FROM normalizzazione_esclusioni WHERE parola = ?', word)
        if row and row[0]:
            found.add(norm(row[0]))
        if self._one('lemma', 'SELECT 1 FROM normalizzata WHERE parola = ?', word):
            found.add(word)
        return found

    def is_variant(self, word: str, secret: str) -> bool:
        """Forma flessa o derivato stretto della segreta (cani, pizze, bancaria per banca)."""
        word, secret = norm(word), norm(secret)
        if word == secret:
            return False
        # La segreta è un lemma (raw 2.0 tiene solo lemmi): la parola è una sua forma se la ha tra i propri lemmi. Non si
        # intersecano i lemmi delle due parole: «porto» e «porta» condividono «portare» ma sono parole diverse.
        if secret in self.lemmas(word):
            return True
        # Derivato stretto: bancaria / bancario per banca. Solo le uscite -ario/-aria/-ari/-arie sulla stessa radice:
        # una radice uguale da sola metterebbe insieme porto e porta.
        stem = secret[:-1] if secret[-1:] in 'aeio' else secret
        return len(stem) >= MIN_STEM and any(word.endswith(e) and word[:-len(e)] == stem for e in DERIVATIVE_ENDINGS)

    def in_reference(self, word: str) -> bool:
        """La parola è in raw 2.0 (lemma o forma registrata): le altre, come «beach», sono «fuori riferimento»."""
        return self._one('parola', 'SELECT 1 FROM parole WHERE parola = ?', norm(word)) is not None

    def pos(self, word: str) -> Pos:
        entries = self._morphit.get(norm(word))
        if not entries:
            return 'ALTRO'
        tag = entries[0][1]
        if tag.startswith('NOUN'):
            return 'NOUN'
        if tag.startswith('VER'):
            return 'VERB'
        if tag.startswith('ADJ'):
            return 'ADJ'
        return 'ALTRO'

    def fingerprint(self) -> str:
        return self._fingerprint

    def check_unchanged(self) -> None:
        if _fingerprint(self.raw2) != self._fingerprint:
            raise ReferenceChanged('raw 2.0 è cambiato durante la valutazione: ricalcola da capo')


def _fingerprint(raw2: Path) -> str:
    """SHA-256 del contenuto di parole_segrete, delle esclusioni (parola, sostituita_da) e di parole, in ordine."""
    digest = hashlib.sha256()
    queries = (
        ('parole_segrete', 'SELECT parola, ordinaria, speciale, legacy, deroga FROM parole_segrete ORDER BY parola'),
        ('normalizzazione_esclusioni', 'SELECT parola, sostituita_da FROM normalizzazione_esclusioni ORDER BY parola'),
        ('parole', 'SELECT parola FROM parole ORDER BY parola'),
    )
    with closing(_connect(raw2)) as con:
        for name, sql in queries:
            digest.update(f'#{name}\n'.encode('utf-8'))
            for row in con.execute(sql):
                digest.update(('\t'.join('' if v is None else str(v) for v in row) + '\n').encode('utf-8'))
    return digest.hexdigest()


def load_reference(raw2: Path = paths.RAW2, morphit: Path = paths.MORPHIT) -> Reference:
    forms = _load_morphit(morphit)
    with closing(_connect(raw2)) as con:
        secrets = {norm(w): _group(o, l, d, w)
                   for w, o, l, d in con.execute('SELECT parola, ordinaria, legacy, deroga FROM parole_segrete ORDER BY parola')}
    return Reference(raw2, forms, secrets, _fingerprint(raw2))

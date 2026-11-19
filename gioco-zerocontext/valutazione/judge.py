"""Il giudice Qwen locale: dà un voto 0–2 alle parole delle prime 20 che né Luca né le associazioni verificate coprono.

I verdetti restano in cache nel database dei risultati con chiave (segreta, parola, versione del prompt, modello):
rilanciare non chiede nulla di nuovo. Il giudice non gira durante una diretta (spec, sezione 7).
"""
from __future__ import annotations

import hashlib
import json
import random
import sys
import urllib.error
import urllib.request
from typing import Protocol

from valutazione import paths
from valutazione.common import norm
from valutazione.gold import Gold
from valutazione.store import Store, Verdict

JUDGE_PROMPT_VERSION = 'giudice-1'
ATTEMPTS = 2          # la prima richiesta e un solo nuovo tentativo
REASON_MAX = 160

SYSTEM = '''Sei il giudice di ZeroContext, un gioco italiano in diretta: la chat prova delle parole e ognuna riceve una posizione per vicinanza a una parola segreta.
Per ogni parola dell'elenco giudica se, per un giocatore comune, RIMANDA ALLA SEGRETA.
Voto: 2 = rimanda chiaramente (sinonimi, forme della stessa parola, parti, azioni, oggetti, luoghi o contesti tipici, contrari naturali); 1 = collegamento debole o possibile; 0 = nessun collegamento, oppure parola non italiana.
Categorie grammaticali diverse vanno bene, purché la parola rimandi alla segreta.
senso_giusto: se è data una glossa, true se il collegamento vale nel senso della glossa e false se vale solo in un altro senso; senza glossa, null.
motivo: una frase breve.
Rispondi solo con il JSON richiesto: una voce per ogni parola dell'elenco, con la parola scritta identica.'''

SCHEMA = {
    'type': 'object', 'additionalProperties': False, 'required': ['parole'],
    'properties': {'parole': {'type': 'array', 'items': {
        'type': 'object', 'additionalProperties': False, 'required': ['parola', 'voto', 'senso_giusto', 'motivo'],
        'properties': {'parola': {'type': 'string'}, 'voto': {'type': 'integer', 'enum': [0, 1, 2]},
                       'senso_giusto': {'type': ['boolean', 'null']}, 'motivo': {'type': 'string', 'maxLength': REASON_MAX}}}}},
}


def judge_version() -> str:
    """Cambia quando cambia il prompt o lo schema: i vecchi verdetti restano nel database ma non si usano più."""
    digest = hashlib.sha256((SYSTEM + json.dumps(SCHEMA, sort_keys=True)).encode('utf-8')).hexdigest()
    return f'{JUDGE_PROMPT_VERSION}-{digest[:12]}'


class Backend(Protocol):
    model: str

    def ask(self, secret: str, gloss: str | None, words: list[str]) -> dict: ...


class QwenBackend:
    """Qwen locale tramite llama.cpp, con gli stessi avvio e richieste di gioco-zeroassociations/script/qwen_associations.py."""

    def __init__(self, qwen=None, lazy: bool = True):
        """Con lazy=True il server parte alla prima domanda: il nome del modello serve subito (chiave della cache), ma con la
        cache già piena Qwen non deve nemmeno partire."""
        if qwen is None:
            sys.path.insert(0, str(paths.REPO / 'gioco-zeroassociations' / 'script'))
            import qwen_associations as qwen   # importato qui: caricarlo apre i database di ZeroAssociazioni
        self.qwen = qwen
        self.cfg = qwen.config()
        self.model = self.cfg['served_model']
        self.process = None
        self._started = False
        if not lazy:
            self._start()

    def _start(self) -> None:
        if not self._started:
            self.process = self.qwen.ensure_server(self.cfg)   # None se un server compatibile era già attivo
            self._started = True

    def ask(self, secret: str, gloss: str | None, words: list[str]) -> dict:
        self._start()
        answer, _ = self.qwen.chat(self.cfg, SYSTEM, {'segreta': secret, 'glossa': gloss, 'parole': words}, SCHEMA,
                                   seed=0, max_tokens=2048, temperature=0)
        return answer

    def close(self) -> None:
        """Ferma il server solo se l'ha avviato questo oggetto."""
        if self.process is not None:
            self.process.terminate()
            self.process.wait(timeout=30)
            self.process = None


def _parse(response: dict, asked: list[str], has_gloss: bool) -> list[Verdict]:
    """Verdetti validi per tutte e sole le parole chieste; ValueError altrimenti."""
    try:
        items = response['parole']
        if not isinstance(items, list):
            raise ValueError('parole non è un elenco')
        verdicts = []
        for item in items:
            grade, sense = item['voto'], item['senso_giusto']
            if isinstance(grade, bool) or grade not in (0, 1, 2):
                raise ValueError(f'voto non valido: {grade!r}')
            if sense is not None and not isinstance(sense, bool):
                raise ValueError(f'senso_giusto non valido: {sense!r}')
            verdicts.append(Verdict(norm(item['parola']), grade, sense if has_gloss else None, str(item['motivo'])[:REASON_MAX]))
    except (KeyError, TypeError) as error:
        raise ValueError(f'risposta malformata: {error!r}') from error
    if sorted(v.word for v in verdicts) != sorted(asked):
        raise ValueError('le parole della risposta non sono quelle chieste')
    return verdicts


class Judge:
    def __init__(self, store: Store, backend: Backend, model: str | None = None):
        self.store, self.backend = store, backend
        self.model = model or backend.model
        self.version = judge_version()

    def grade(self, secret: str, gloss: str | None, words: list[str]) -> dict[str, Verdict] | None:
        """Verdetto per ogni parola: dalla cache, o da Qwen per quelle mancanti. None se Qwen non dà una risposta valida
        dopo due tentativi: in quel caso non si salva nulla, nemmeno per le parole che avevano una risposta."""
        secret = norm(secret)
        asked = list(dict.fromkeys(norm(w) for w in words))
        found = {w: self.store.judge_verdict(secret, w, self.version, self.model) for w in asked}
        missing = [w for w, v in found.items() if v is None]
        if missing:
            verdicts = None
            for _ in range(ATTEMPTS):
                try:
                    verdicts = _parse(self.backend.ask(secret, gloss, missing), missing, gloss is not None)
                    break
                except ValueError:   # anche JSON non valido o risposta troncata (json.JSONDecodeError è un ValueError)
                    continue
            if verdicts is None:
                return None
            self.store.save_judge_verdicts(secret, self.version, self.model, verdicts)
            found.update({v.word: v for v in verdicts})
        return found


def controls(judge: Judge, gold: Gold, vocab: list[str], ref, development: list[str], seed: int = 0, size: int = 50) -> dict:
    """Quanto è affidabile il giudice, senza bisogno di Luca: sensibilità (voto ≥ 1 alle associazioni verificate) e
    specificità (voto 0 a parole del vocabolario prese a caso, che non sono né verificate né varianti della segreta)."""
    rng = random.Random(seed)
    in_vocab = set(vocab)
    secrets = sorted(s for s in development if s in gold and any(w in in_vocab for w in gold[s].groups))
    chosen = rng.sample(secrets, min(size, len(secrets)))
    pool = sorted(w for w in vocab if ref.in_reference(w))
    positives, negatives = 0, 0
    judged_pos = judged_neg = 0
    for secret in chosen:
        entry = gold[secret]
        verified = rng.choice(sorted(w for w in entry.groups if w in in_vocab))
        random_word = None
        for _ in range(1000):
            candidate = rng.choice(pool)
            if candidate != secret and candidate not in entry.groups and not ref.is_variant(candidate, secret):
                random_word = candidate
                break
        words = [verified] + ([random_word] if random_word else [])
        verdicts = judge.grade(secret, entry.gloss or None, words)
        if verdicts is None:
            continue
        judged_pos += 1
        positives += verdicts[verified].grade >= 1
        if random_word:
            judged_neg += 1
            negatives += verdicts[random_word].grade == 0
    return {'sensibilita': positives / judged_pos if judged_pos else None,
            'specificita': negatives / judged_neg if judged_neg else None,
            'n': size, 'coppie_verificate': judged_pos, 'coppie_casuali': judged_neg}


def live_guard(server: str = 'http://127.0.0.1:3001') -> None:
    """Non parte se Zerocade ha una diretta collegata: Qwen e i vettori toglierebbero risorse alla diretta."""
    try:
        with urllib.request.urlopen(server.rstrip('/') + '/api/context/evaluation/live', timeout=3) as response:
            live = json.load(response).get('live')
    except urllib.error.HTTPError as error:
        raise SystemExit(f'Zerocade risponde ({error.code}) ma non dice se c\'è una diretta: aggiornalo e riavvialo, o spegnilo.') from error
    except urllib.error.URLError as error:
        if isinstance(error.reason, ConnectionRefusedError):
            return   # Zerocade non è acceso: nessuna diretta
        raise SystemExit(f'Non riesco a sapere se c\'è una diretta ({error.reason}).') from error
    except (OSError, ValueError) as error:
        raise SystemExit(f'Non riesco a sapere se c\'è una diretta ({error}).') from error
    if live:
        raise SystemExit('Diretta in corso: la valutazione con Qwen non parte durante una live.')

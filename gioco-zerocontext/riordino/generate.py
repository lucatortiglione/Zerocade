"""Associazioni scritte da Qwen locale per le segrete che non hanno quelle verificate di ZeroAssociazioni (punto 5 del piano).

Qwen scrive solo l'elenco delle parole, senza motivazioni: poche decine di token per segreta invece delle centinaia di una bozza
completa di ZeroAssociazioni. Le risposte restano in un file JSONL (una riga per risposta valida) e la cache è riprendibile: una
seconda esecuzione chiede soltanto quello che manca. Il vocabolario del gioco si applica alla lettura, non al salvataggio."""
from __future__ import annotations

import json
from pathlib import Path
import sys
import time
from typing import Protocol

from valutazione import paths
from valutazione.common import norm

PROMPT_VERSION = 'genera-1'
ATTEMPTS = 2   # la prima richiesta e un solo nuovo tentativo
MAX_WORDS = 24

SYSTEM = '''Sei un autore di associazioni di parole per ZeroContext, un gioco italiano in diretta: la chat prova delle parole e ognuna riceve una posizione per vicinanza a una parola segreta.
Data la segreta e la sua categoria grammaticale, elenca fino a 20 parole italiane che una persona comune associa alla segreta, dalla più immediata alla meno immediata: sinonimi, parti, azioni, oggetti, luoghi, persone e contesti tipici, effetti, contrari naturali.
Forme flesse e categorie grammaticali diverse vanno bene, purché la parola rimandi alla segreta. Una sola parola per voce, minuscola, italiana, diversa dalla segreta; niente nomi propri, parole volgari o offensive.
Rispondi solo con il JSON richiesto.'''

SCHEMA = {'type': 'object', 'additionalProperties': False, 'required': ['parole'], 'properties': {
    'parole': {'type': 'array', 'minItems': 1, 'maxItems': MAX_WORDS, 'items': {'type': 'string', 'minLength': 2, 'maxLength': 24}}}}


def parse_words(response, secret: str, ref, vocab) -> list[str]:
    """Le parole della risposta nell'ordine di Qwen, senza la segreta, le sue varianti, i doppioni e le parole fuori dal vocabolario."""
    if not isinstance(response, dict) or not isinstance(response.get('parole'), list):
        raise ValueError('risposta malformata: manca l\'elenco «parole»')
    words, seen = [], {secret}
    for item in response['parole']:
        if not isinstance(item, str):
            raise ValueError(f'voce non valida: {item!r}')
        word = norm(item).strip()
        if word in seen or word not in vocab or ref.is_variant(word, secret):
            continue
        seen.add(word)
        words.append(word)
    return words


def _raw_words(response) -> list[str]:
    """Le parole come le ha scritte Qwen (minuscole e senza spazi), per salvarle prima del filtro del vocabolario."""
    if not isinstance(response, dict) or not isinstance(response.get('parole'), list) or not all(isinstance(w, str) for w in response['parole']):
        raise ValueError('risposta malformata: manca l\'elenco «parole»')
    return [norm(w).strip() for w in response['parole']]


class Backend(Protocol):
    model: str

    def ask(self, secret: str, pos: str) -> dict: ...


class Generator:
    def __init__(self, backend: Backend, file: Path):
        self.backend, self.file = backend, Path(file)
        self._saved: dict[tuple[str, str], list[str]] = {}
        if self.file.exists():
            for line in self.file.read_text(encoding='utf-8').splitlines():
                if line.strip():
                    row = json.loads(line)
                    if row['model'] == backend.model and row['version'] == PROMPT_VERSION:
                        self._saved[(row['secret'], row['pos'])] = row['words']

    def words_for(self, secret: str, pos: str, ref, vocab) -> list[str] | None:
        """Le associazioni di Qwen per la segreta, dalla cache o da una nuova richiesta; None se Qwen non dà una risposta valida."""
        secret = norm(secret)
        key = (secret, pos)
        if key not in self._saved:
            raw = None
            for _ in range(ATTEMPTS):
                try:
                    started = time.monotonic()
                    response = self.backend.ask(secret, pos)
                    raw = _raw_words(response)
                    parse_words(response, secret, ref, set(raw))   # stessa validazione della lettura
                    break
                except (ValueError, OSError, KeyError):   # anche JSON non valido o risposta troncata (json.JSONDecodeError è un ValueError)
                    raw = None
            if raw is None:
                return None
            self.file.parent.mkdir(parents=True, exist_ok=True)
            with self.file.open('a', encoding='utf-8') as f:
                f.write(json.dumps({'secret': secret, 'pos': pos, 'model': self.backend.model, 'version': PROMPT_VERSION, 'words': raw,
                                    'seconds': round(time.monotonic() - started, 1)}, ensure_ascii=False) + '\n')
            self._saved[key] = raw
        return parse_words({'parole': self._saved[key]}, secret, ref, vocab)


def merge_generated(lists: dict[str, list[str]], generated: dict[str, list[str]], ref) -> dict[str, list[str]]:
    """Le parole di Qwen in cima alle liste: prima quelle che la lista già conteneva, nel suo ordine (il modello del riordino conosce
    i segnali), poi quelle che la lista non aveva, nell'ordine di Qwen; poi il resto della lista. La segreta e le sue varianti non si
    promuovono (parse_words le ha già tolte)."""
    merged = {secret: list(words) for secret, words in lists.items()}
    for secret, words in generated.items():
        if not words:
            continue
        current = lists.get(secret, [])
        position = {w: i for i, w in enumerate(current)}
        present = sorted((w for w in words if w in position), key=position.get)
        absent = [w for w in words if w not in position]
        promoted = present + absent
        taken = set(promoted)
        merged[secret] = promoted + [w for w in current if w not in taken]
    return merged


class QwenBackend:
    """Qwen locale tramite llama.cpp, con avvio e richieste di gioco-zeroassociations/script/qwen_associations.py (stesso server del giudice)."""

    def __init__(self, qwen=None, model_file: Path | None = None, gpu_layers: int = 99, port: int = 19477):
        """Con model_file un altro modello GGUF, su un'altra porta e senza la verifica SHA-256 dei pesi (che la configurazione di
        ZeroAssociazioni prevede solo per il suo modello): serve a provare modelli più piccoli e veloci; il nome salvato nella cache
        è quello del file, così le risposte di modelli diversi non si mescolano."""
        if qwen is None:
            sys.path.insert(0, str(paths.REPO / 'gioco-zeroassociations' / 'script'))
            import qwen_associations as qwen   # importato qui: caricarlo apre i database di ZeroAssociazioni
        self.qwen = qwen
        self.cfg = qwen.config()
        self.own_model = model_file is not None
        if model_file is not None:
            self.cfg = {**self.cfg, 'model_path': str(model_file), 'served_model': f'genera-{Path(model_file).stem}',
                        'endpoint': f'http://127.0.0.1:{port}',
                        'runtime_parameters': {**self.cfg['runtime_parameters'], 'gpu_layers': gpu_layers}}
        self.model = self.cfg['served_model']
        self.process = None
        self._started = False

    def _start_other_model(self) -> None:
        process = self.qwen.subprocess.Popen(self.qwen.server_command(self.cfg))
        for _ in range(600):
            if process.poll() is not None:
                raise SystemExit('Il server si è chiuso durante l\'avvio: controllare memoria della GPU e parametri')
            if self.qwen.served(self.cfg):
                self.process = process
                return
            time.sleep(1)
        process.terminate()
        raise SystemExit('Il server non ha risposto entro 10 minuti')

    def ask(self, secret: str, pos: str) -> dict:
        if not self._started:
            if self.own_model:
                self._start_other_model()
            else:
                self.process = self.qwen.ensure_server(self.cfg)   # None se un server compatibile era già attivo
            self._started = True
        answer, _ = self.qwen.chat(self.cfg, SYSTEM, {'segreta': secret, 'categoria': pos}, SCHEMA, seed=0, max_tokens=400, temperature=0)
        return answer

    def close(self) -> None:
        """Ferma il server solo se l'ha avviato questo oggetto."""
        if self.process is not None:
            self.process.terminate()
            self.process.wait(timeout=30)
            self.process = None

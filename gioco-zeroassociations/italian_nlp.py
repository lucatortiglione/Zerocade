"""Analisi italiane: previsioni dei modelli, distinte dalle attestazioni lessicali.

I modelli vengono caricati una volta per analizzatore. Nessun download implicito;
spaCy resta il backend delle analisi contestuali del validatore esistente.
"""
from __future__ import annotations

import hashlib
from importlib.metadata import version
import json
from pathlib import Path

STANZA_MODEL = 'default_fast'


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                     separators=(',', ':')).encode('utf-8')).hexdigest()


def artifact_hashes(directory, paths=None):
    root = Path(directory)
    paths = paths if paths is not None else root.rglob('*')
    result = {}
    for path in sorted(set(Path(p) for p in paths)):
        if not path.is_file() or '__pycache__' in path.parts or path.suffix == '.pyc':
            continue
        with path.open('rb') as stream:
            key = path.relative_to(root).as_posix()
            result[key] = hashlib.file_digest(stream, 'sha256').hexdigest()
    if not result:
        raise RuntimeError('Nessun artefatto del modello disponibile per la provenienza')
    return result


def load_spacy(model='it_core_news_md'):
    try:
        import spacy
    except ImportError as error:
        raise RuntimeError('spaCy non installato: usare requirements-generation.txt') from error
    try:
        nlp = spacy.load(model, disable=['ner', 'textcat'])
    except OSError as error:
        raise RuntimeError(f'Modello assente: python -m spacy download {model}') from error
    if nlp.lang != 'it':
        raise ValueError('È richiesto un modello italiano')
    if not {'tagger', 'morphologizer'}.intersection(nlp.pipe_names) or 'lemmatizer' not in nlp.pipe_names:
        raise RuntimeError('Il modello deve includere POS e lemmatizzatore')
    nlp.meta['zerocade_nlp'] = {
        'engine': 'spacy', 'language': 'it', 'adapter_version': 1,
        'capabilities': ['lemma', 'upos', 'xpos', 'morph'],
        'library_version': version('spacy'), 'model': model,
        'model_version': nlp.meta['version'], 'pipeline': nlp.pipe_names,
        'artifacts': artifact_hashes(nlp.path)}
    return nlp


def token_row(text, lemma, upos, xpos, morph, start, end, *, expanded=False):
    return {'text': text, 'lemma': lemma or '', 'upos': upos or '', 'xpos': xpos or '',
            'morph': morph, 'start': start, 'end': end, 'expanded_multiword': expanded}


def spacy_tokens(doc):
    return [token_row(t.text, t.lemma_, t.pos_, t.tag_, t.morph.to_dict(),
                      t.idx, t.idx + len(t.text)) for t in doc if not t.is_space]


def stanza_tokens(doc):
    rows = []
    for sentence in doc.sentences:
        for token in sentence.tokens:
            expanded = len(token.words) > 1
            for word in token.words:
                morph = dict(part.split('=', 1) for part in (word.feats or '').split('|') if '=' in part)
                # Le parole sintetiche di "del" -> "di", "il" non hanno uno span
                # autonomo nel testo. Si conserva lo span del token e l'espansione.
                rows.append(token_row(word.text, word.lemma, word.upos, word.xpos, morph,
                                      token.start_char, token.end_char, expanded=expanded))
    return rows


class ItalianAnalyzer:
    def __init__(self, engine='spacy', model=None, model_dir=None):
        self.engine = engine
        if engine == 'spacy':
            model = model or 'it_core_news_md'
            self.pipeline = load_spacy(model)
            metadata = self.pipeline.meta['zerocade_nlp']
        elif engine == 'stanza':
            try:
                import stanza
                from stanza.resources.common import DEFAULT_MODEL_DIR
            except ImportError as error:
                raise RuntimeError('Stanza non installato: usare requirements-nlp.txt') from error
            model = model or STANZA_MODEL
            root = Path(model_dir or DEFAULT_MODEL_DIR)
            try:
                self.pipeline = stanza.Pipeline(
                    lang='it', dir=str(root), package=model, processors='tokenize,mwt,pos,lemma',
                    use_gpu=False, download_method=stanza.DownloadMethod.NONE, verbose=False)
            except FileNotFoundError as error:
                raise RuntimeError(f'Modelli Stanza assenti: eseguire download-stanza --model {model}') from error
            paths = [root / 'resources.json']
            for processor in self.pipeline.processors.values():
                paths.extend(Path(value) for key, value in processor.config.items()
                             if isinstance(value, str) and key.endswith(('_path', '_file'))
                             and Path(value).is_file())
            metadata = {'library_version': version('stanza'), 'model': model,
                        'pipeline': list(self.pipeline.processors), 'device': 'cpu',
                        'artifacts': artifact_hashes(root, paths)}
        elif engine == 'simplemma':
            if model is not None:
                raise ValueError('Simplemma usa il dizionario italiano incluso, senza --model')
            try:
                import simplemma
            except ImportError as error:
                raise RuntimeError('Simplemma non installato: usare requirements-nlp.txt') from error
            self.pipeline = simplemma
            metadata = {'library_version': version('simplemma'), 'model': 'it',
                        'pipeline': ['tokenizer', 'dictionary_lemmatizer'],
                        'artifacts': artifact_hashes(Path(simplemma.__file__).parent)}
        else:
            raise ValueError(f'Motore sconosciuto: {engine}')
        self.metadata = {'engine': engine, 'language': 'it', 'adapter_version': 1,
                         'capabilities': ['lemma'] if engine == 'simplemma' else ['lemma', 'upos', 'xpos', 'morph'],
                         **metadata}
        self.model_id = digest(self.metadata)

    def analyze(self, text, *, scope='contextual'):
        if not isinstance(text, str) or not text.strip() or '\0' in text:
            raise ValueError('Testo assente o non valido')
        if scope not in {'contextual', 'isolated'}:
            raise ValueError('Ambito non valido')
        if self.engine == 'spacy':
            rows = spacy_tokens(self.pipeline(text))
        elif self.engine == 'stanza':
            rows = stanza_tokens(self.pipeline(text))
        else:
            rows = []
            cursor = 0
            for token in self.pipeline.simple_tokenizer(text):
                start = text.find(token, cursor)
                if start < 0:
                    raise ValueError('Tokenizer Simplemma non allineabile al testo originale')
                cursor = start + len(token)
                rows.append(token_row(token, self.pipeline.lemmatize(token, lang='it'),
                                      '', '', {}, start, cursor))
        return self._result(text, rows, scope)

    def analyze_many(self, texts, *, scope='contextual', batch_size=128):
        """Elabora lotti conservando ordine, contesto e metadati di ogni documento."""
        texts = list(texts)
        if batch_size < 1 or scope not in {'contextual', 'isolated'}:
            raise ValueError('Lotto o ambito non valido')
        if any(not isinstance(text, str) or not text.strip() or '\0' in text for text in texts):
            raise ValueError('Testo assente o non valido')
        if self.engine == 'spacy':
            for text, doc in zip(texts, self.pipeline.pipe(texts, batch_size=batch_size)):
                yield self._result(text, spacy_tokens(doc), scope)
        elif self.engine == 'stanza':
            for start in range(0, len(texts), batch_size):
                batch = texts[start:start + batch_size]
                for text, doc in zip(batch, self.pipeline.bulk_process(batch)):
                    yield self._result(text, stanza_tokens(doc), scope)
        else:
            for text in texts:
                yield self.analyze(text, scope=scope)

    def _result(self, text, rows, scope):
        contextual = scope == 'contextual' and self.engine != 'simplemma' and len({
            (row['start'], row['end']) for row in rows if any(c.isalpha() for c in row['text'])}) > 1
        return {'text': text, 'scope': scope, 'model_id': self.model_id,
                'model': self.metadata, 'tokens': rows, 'evidence_kind': 'model_prediction',
                'context_used': contextual,
                'status': 'AWAITING_REVIEW'}

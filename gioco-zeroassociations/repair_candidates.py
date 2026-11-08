#!/usr/bin/env python3
"""Ripara risposte senza eliminare prompt; prepara un piano verificabile per i CSV.

La selezione editoriale è distinta dal QA indipendente. Nessuna euristica,
frequenza o semplice presenza nella definizione approva una coppia.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import re
import unicodedata

from association_rules import GRAMMATICAL_WORDS
from generate_candidates import read_export_rows, cuid
from validate_word_association_it_v3_6_0 import RELATIONS, load_taxonomy, TAXONOMY_FILENAME

WORD = re.compile(r'[a-zàèéìòù]+\Z')


def read_jsonl(path):
    with path.open(encoding='utf-8-sig') as stream:
        return [json.loads(line) for line in stream if line.strip()]


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def revise(records, revisions, taxonomy):
    """Applica solo sostituzioni motivate esplicite; conserva tutti i prompt."""
    result = deepcopy(records)
    by_prompt = {row['prompt']: row for row in result}
    if len(by_prompt) != len(result):
        raise ValueError('Occorre una sola versione selezionata per prompt')
    previous = []
    changes = []
    seen = set()
    for patch in revisions:
        prompt = patch['prompt']
        if prompt in seen:
            raise ValueError(f'Revisione duplicata: {prompt}')
        seen.add(prompt)
        if prompt not in by_prompt:
            raise ValueError(f'Prompt assente: {prompt}; nessuna sostituzione di contesto')
        item = by_prompt[prompt]
        reviews = patch['answers']
        words = [answer['word'] for answer in reviews]
        if len(words) != 7 or len(set(words)) != 7 or prompt in words:
            raise ValueError(f'{prompt}: servono sette risposte distinte dal prompt')
        for answer in reviews:
            word = answer['word']
            if (not WORD.fullmatch(word) or unicodedata.normalize('NFC', word) != word
                    or word in GRAMMATICAL_WORDS):
                raise ValueError(f'{prompt}: risposta non canonica/grammaticale: {word}')
            if answer['relation'] not in RELATIONS or len(answer.get('rationale', '').strip()) < 15:
                raise ValueError(f'{prompt}: relazione o motivazione mancante per {word}')
        if not patch.get('sense_description', '').strip():
            raise ValueError(f'{prompt}: accezione obbligatoria')
        # Idempotenza: non creare riparazioni fittizie o ripetere la genealogia.
        if (item['words'] == words and item.get('editorial_revision', {}).get('revision_id') == patch['revision_id']):
            continue
        if patch.get('expected_words') != item['words']:
            raise ValueError(f'{prompt}: origine modificata; aggiornare la revisione prima di applicarla')
        old = deepcopy(item)
        previous.append(old)
        removed = [word for word in old['words'] if word not in words]
        added = [word for word in words if word not in old['words']]
        sense_changed = patch.get('sense_changed', False)
        targeted = len(removed) <= 2 and not sense_changed and old.get('repair_attempt') == 0
        item['candidate_id'] = old['candidate_id'] + '-editorial-' + patch['revision_id']
        item['parent_candidate_id'] = old['candidate_id'] if targeted else None
        item['repair_attempt'] = 1 if targeted else 0
        if not targeted:
            item['regenerated_from_candidate_id'] = old['candidate_id']
        item['ref'] = cuid(len(changes))
        item['words'] = words
        item['relations'] = [answer['relation'] for answer in reviews]
        item['relations_verified'] = False
        item['word_difficulty_estimates'] = ['media'] * 7
        item.pop('word_pos', None)
        # Ogni evidenza precedente resta nell'archivio; non attribuire alla
        # definizione originale le parole introdotte editorialmente.
        item['clue_evidence'] = {
            answer['word']: {'kind': 'composizione_editoriale',
                             'rationale': answer['rationale'],
                             'relation': answer['relation'],
                             'revision_id': patch['revision_id'],
                             'independent_review': False}
            for answer in reviews
        }
        item['editorial_revision'] = {
            'revision_id': patch['revision_id'], 'author': 'ChatGPT',
            'kind': 'targeted_repair' if targeted else 'regeneration_same_prompt',
            'sense_description': patch['sense_description'],
            'sense_changed': sense_changed, 'removed': removed, 'added': added,
            'changed_positions': [i+1 for i, (before, after) in enumerate(zip(old['words'], words)) if before != after],
            'word_reviews': deepcopy(reviews), 'independent_review': False,
            'decision': 'DA_RIVEDERE', 'prompt_preserved': True,
            'ratings': None, 'retrieval_test': 'NOT_RUN',
        }
        if sense_changed:
            item['previous_sense_id'] = old.get('sense_id')
            item['previous_source_url'] = old.get('source_url')
            item['sense_id'] = None
            item['source_gloss'] = None
            item['source_url'] = None
            item['source_license'] = 'Composizione editoriale; fonti precedenti nell’archivio'
        if patch.get('category_id'):
            cat = taxonomy[patch['category_id']]
            item.update({key: cat[key] for key in ('category_id', 'category_name', 'cluster_id')})
            item['secondary_categories'] = []
            item['category_relative_score'] = None
        item['status'] = 'CANDIDATO_DA_REVISIONARE'
        # Le prove del vecchio set non certificano il nuovo.
        for key in ('blind_test', 'semantic_review', 'safety_review'):
            item[key] = None
        item['method'] = 'Sostituzioni editoriali motivate sullo stesso prompt; QA indipendente non eseguito.'
        changes.append({'prompt': prompt, 'previous_candidate_id': old['candidate_id'],
                        'candidate_id': item['candidate_id'],
                        'kind': item['editorial_revision']['kind'],
                        'old_words': old['words'], 'words': words,
                        'changed_positions': item['editorial_revision']['changed_positions'],
                        'removed': removed, 'added': added, 'sense_changed': sense_changed})
    assert [row['prompt'] for row in result] == [row['prompt'] for row in records]
    return result, previous, changes


def prepare_plan(directory, batch, revision_path, output):
    metadata = directory / f'word_association_it_5000_metadati_{batch}.jsonl'
    csv_paths = sorted(directory.glob(f'word_association_it_*_*_{batch}.csv'))
    if not csv_paths:
        raise ValueError('Nessun CSV corrispondente al lotto')
    original = read_jsonl(metadata)
    revised, archive, changes = revise(original, read_jsonl(revision_path),
        load_taxonomy(Path(__file__).parent / TAXONOMY_FILENAME))
    existing_archive = directory/f'archivio_prima_revisione_semantica_{batch}.jsonl'
    existing_changes = directory/f'revisioni_semantiche_{batch}.jsonl'
    if existing_archive.exists():
        archive = read_jsonl(existing_archive) + archive
    if existing_changes.exists():
        changes = read_jsonl(existing_changes) + changes
    previous_by_id = {item['candidate_id']: item for item in archive}
    for item in revised:
        revision = item.get('editorial_revision')
        if revision and not revision.get('changed_positions'):
            parent = item.get('parent_candidate_id') or item.get('regenerated_from_candidate_id')
            old = previous_by_id[parent]
            revision['changed_positions'] = [i+1 for i, pair in enumerate(zip(old['words'], item['words'])) if pair[0] != pair[1]]
    for change in changes:
        change['changed_positions'] = [i+1 for i, pair in enumerate(zip(change['old_words'], change['words'])) if pair[0] != pair[1]]
    index = {item['prompt']: item for item in original}
    replacement = {item['prompt']: item for item in revised}
    outputs = []
    for path in csv_paths:
        rows = read_export_rows(path)
        if len(rows) != len(original):
            raise ValueError(f'Numero di righe diverso nei metadati: {path}')
        for i, row in enumerate(rows):
            prompt = unicodedata.normalize('NFC', row['prompt']).lower()
            if prompt != original[i]['prompt'] or row['words'].split('|') != index[prompt]['words']:
                raise ValueError(f'{path.name}, riga {i+2}: CSV e metadati discordanti')
            row['words'] = '|'.join(replacement[prompt]['words'])
            if row['ref'] == index[prompt].get('ref'):
                row['ref'] = replacement[prompt]['ref']
        # Tutte le celle manuali (source inclusa), l'ordine e i prompt restano intatti.
        header = list(rows[0]) if rows else ['ref', 'source', 'language', 'prompt', 'words']
        outputs.append({'path': str(path.resolve()), 'sha256_before': digest(path),
                        'header': header, 'rows': [[row[key] for key in header] for row in rows]})
    audit = []
    for item in revised:
        revision = item.get('editorial_revision')
        # Segnalare la provenienza ambigua dei vecchi export senza falsificare
        # il corpus o dichiarare che tutte le relazioni siano certamente errate.
        unverified_scopes = []
        for word, evidence in item.get('clue_evidence', {}).items():
            if evidence.get('kind') == 'relazione_lessicale':
                evidence['source_scope_verified'] = False
                evidence['scope_note'] = ('Il vecchio generatore poteva ereditare relazioni di pagina; '
                    'source_sense_id non dimostra che la relazione appartenga a questa accezione.')
                unverified_scopes.append(word)
        item['association_selection'] = {
            'policy': '3.6.0-semantic-2026-11-08',
            'editorial_selection': 'PROPOSED' if revision else 'NOT_RUN',
            'independent_review': 'NOT_RUN', 'human_review': 'NOT_RUN',
            'unverified_lexical_relation_scope': unverified_scopes,
            'prompt_preserved': True, 'decision': 'DA_RIVEDERE',
        }
        audit.append({'prompt': item['prompt'], 'candidate_id': item['candidate_id'],
            'decision': 'DA_RIVEDERE', 'prompt_preserved': True,
            'editorial_revision': revision['revision_id'] if revision else None,
            'per_answer': [{'word': word,
                'status': 'PROPOSTA_EDITORIALE' if revision else 'DA_VERIFICARE',
                'reason': ('Sostituzione motivata; prova indipendente da eseguire' if revision else
                           'Provenienza lessicale senza selezione semantica documentata'),
                'next_action': 'Verificare la coppia; cercare una sostituzione se non funziona'}
                for word in item['words']],
            'independent_semantic_review': 'NOT_RUN', 'human_review': 'NOT_RUN'})
    report = {'batch': batch, 'rows': len(revised), 'prompts_removed': 0,
        'prompts_unchanged_in_order': True, 'changed_sets': len(changes),
        'replaced_answers': sum(len(change['added']) for change in changes),
        'regenerations': sum(change['kind'] == 'regeneration_same_prompt' for change in changes),
        'independent_semantic_reviews': 0, 'approved': 0,
        'rows_without_editorial_selection': sum(not row.get('editorial_revision') for row in revised),
        'pending_independent_review': len(revised),
        'status': 'PARTIAL_EDITORIAL_CORRECTION_NOT_APPROVED',
        'limits': ['Il controllo di coerenza copre tutte le righe, non verifica la semantica.',
                   'Le righe senza revisione editoriale restano da correggere; nessuna è stata eliminata.',
                   'Le motivazioni del generatore non sono revisioni indipendenti.']}
    plan = {'csv_outputs': outputs, 'metadata_path': str(metadata.resolve()),
            'metadata_sha256_before': digest(metadata), 'metadata': revised,
            'archive': archive, 'changes': changes, 'audit': audit, 'report': report}
    plan['support_sha256'] = {
        str(path.resolve()): digest(path) for path in (
            existing_archive, existing_changes, directory/f'audit_semantico_{batch}.jsonl',
            directory/f'rapporto_revisione_semantica_{batch}.json') if path.exists()}
    with output.open('x', encoding='utf-8') as stream:
        json.dump(plan, stream, ensure_ascii=False)
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', type=Path, default=Path(__file__).parent/'generated-v3_6_0')
    parser.add_argument('--batch', default='0003')
    parser.add_argument('--revisions-jsonl', type=Path, required=True)
    parser.add_argument('--plan-json', type=Path, required=True)
    args = parser.parse_args(argv)
    if not re.fullmatch(r'\d{4,}', args.batch):
        parser.error('Suffisso lotto numerico di almeno quattro cifre')
    print(json.dumps(prepare_plan(args.directory, args.batch, args.revisions_jsonl, args.plan_json),
                     ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

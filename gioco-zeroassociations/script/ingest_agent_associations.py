"""Importazione centrale dei verbali editoriali degli agenti, mai generazione semantica.

Le correzioni complete prevalgono sul lotto originale senza modificarlo. Ogni
pacchetto conserva hash, autore e decisioni originali; un errore blocca il lotto
prima delle scritture. Le riprese sono idempotenti e non sovrascrivono altri autori.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import sys
from datetime import datetime, timezone

from association_catalog import (JOB, current, rule_hashes, pool_from_decision,
                                 verify_annotation, status)
from prompt_database import ROOT, DEFAULT_DB, GAME_DB, digest, import_reviewed, export_game_db, pool_objects
from review_prompts import build_record, evidence_for
from validated_prompt_database import validate_record, register_reviews, sync_validated, VALIDATED_DB
from sqlite_prompt_runtime import SQLite
import unified_db


def rows(path):
    return [json.loads(line) for line in Path(path).read_text(encoding='utf-8').splitlines() if line.strip()]


def relative(path):
    return str(Path(path).resolve().relative_to(ROOT))


def selected(batch):
    """Sceglie soltanto correzioni esplicite indirizzate a questo lotto."""
    batch=Path(batch).resolve()
    original=rows(batch)
    result={r['prompt']:(r,batch) for r in original}
    if len(result)!=len(original):raise ValueError('Prompt duplicato nel lotto')
    for correction in sorted(batch.parent.glob('corrections_*.jsonl')):
        for row in rows(correction):
            target=row.get('supersedes_file') or row.get('corrects_file')
            if target==batch.name:
                if row['prompt'] not in result:
                    raise ValueError('Correzione priva di origine: '+row['prompt'])
                result[row['prompt']]=(row,correction.resolve())
    for row,origin in result.values():
        if origin!=batch and not row.get('correction_reason'):
            raise ValueError('Correzione priva di motivazione: '+row['prompt'])
    return list(result.values())


def frozen_replacement(manifest, entry, old):
    """Una coda di rifacimento (prepare --rifai-validi) sostituisce solo il bacino che ha congelato."""
    return (manifest.get('replaces_existing_pools') is True and bool(entry.get('initial_pool_id'))
            and old is not None and entry['initial_pool_id'] == old.get('content_sha256'))


def ingest(batch, raw=DEFAULT_DB, valid=VALIDATED_DB, *, publish=True, backup=True):
    batch=Path(batch).resolve()
    shard_name=batch.parent.name
    job=batch.parents[2]  # <lavoro>/agent_outputs/<partizione>/batch_NNNN.jsonl
    shard=job/'prepared_shards'/(shard_name+'.jsonl')
    manifest=json.loads((shard.parent/'manifest.json').read_text(encoding='utf-8'))
    expected=(manifest.get('reviewers') or {}).get(shard_name) or 'ChatGPT — agente associations_'+shard_name[-2:]
    qwen_only=(manifest.get('reviewers') or {}).get('qwen_solo')
    specification=next((s for s in manifest['shards'] if Path(s['path']).name==shard.name),None)
    if (not specification or hashlib.sha256(shard.read_bytes()).hexdigest()!=specification['sha256']
            or manifest['rules_sha256']!=rule_hashes()):
        raise ValueError('Input assegnato o direttive modificati dopo la delega')
    candidates={r['prompt']:r for r in rows(shard)}
    heads,existing,blocked=current(raw)
    decisions=selected(batch)
    stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S_%f')
    output=job/'central_imports'/shard_name/(batch.stem+'_'+stamp)
    plans=[]; skipped=[]; negative=[]
    for row,origin in decisions:
        word=row['prompt']
        if word not in candidates:raise ValueError('Prompt fuori dal lotto assegnato: '+word)
        if (row.get('schema')!='association-editorial-result-1' or
                row.get('reviewer')!=expected or
                row.get('method')!='llm_editorial_review' or row.get('human_review') is not False or
                row.get('independent_gameplay_qa') is not False):
            raise ValueError('Attribuzione non conforme: '+word)
        if row['decision']!='accepted':
            negative.append({'prompt':word,'decision':row['decision'],'source':relative(origin)})
            continue  # Decisioni negative richiedono il percorso inventario, mai conversione in positive.
        if word in blocked:raise ValueError('Prompt bloccato nel frattempo: '+word)
        source={'path':relative(origin),'file_sha256':hashlib.sha256(origin.read_bytes()).hexdigest(),
                'record_sha256':digest(row)}
        candidate={**candidates[word]['automatic'],'language':row['prompt_language']}
        if isinstance(candidate.get('flags'),str):candidate['flags']=json.loads(candidate['flags'])
        previous=candidates[word].get('prompt_review')
        evidence=previous['evidence'] if previous else evidence_for(raw,word,candidate)
        head=build_record({**row,'sense':row['sense_description']},candidate,evidence,row['reviewer'],row['method'])
        head['review']['reviewed_at']=row['reviewed_at']
        head['source_decision']=source
        head['supersedes_validation_id']=row.get('input_validation_id')
        head.pop('content_sha256')
        head['content_sha256']=digest(head)
        validate_record(head)
        active=heads.get(word)
        if active and active['content_sha256'] not in {row.get('input_validation_id'),head['content_sha256']}:
            prior=active.get('source_decision') or {}
            over_qwen=bool(qwen_only) and active['review']['reviewer']==qwen_only and row['reviewer']!=qwen_only
            if not over_qwen and Path(prior.get('path','')).parent!=Path(source['path']).parent:
                raise ValueError('Revisione esterna intervenuta: '+word)
        annotation={'schema':'association-editorial-decisions-1','reviewer':row['reviewer'],
            'method':row['method'],'reviewed_at':row['reviewed_at'],'rules_sha256':rule_hashes(),
            'source_text':source['path'],'source_text_sha256':source['file_sha256'],
            'human_review':False,'independent_gameplay_qa':False,'lexically_exhaustive':False,
            'entries':[{'prompt':word,'validation_id':head['content_sha256'],'decision':'accepted',
                'review_rationale':row['association_review_rationale'],'answers':row['answers'],
                'group_limits':row['group_limits'],'conflicts':row.get('conflicts',[]),'source_decision':source}]}
        annotation_bytes=(json.dumps(annotation,ensure_ascii=False,indent=2)+'\n').encode('utf-8')
        annotation_path=output/(word+'.annotations.json')
        pool=pool_from_decision(annotation,annotation['entries'][0],head,annotation_path,
                                hashlib.sha256(annotation_bytes).hexdigest())
        old=existing.get(word)
        if old:
            old_head=heads.get(word)
            if old_head and old_head.get('source_decision')==source:
                verify_annotation(old)
                if old['review']['reviewer']!=row['reviewer']:
                    raise ValueError('Bacino modificato da un altro revisore: '+word)
                skipped.append(word);continue
            old_source=(old_head or {}).get('source_decision') or {}
            # Un bacino della sola modalità Qwen può essere sostituito da una revisione editoriale completa.
            replaces_qwen=bool(qwen_only) and old['review']['reviewer']==qwen_only and row['reviewer']!=qwen_only
            if (not replaces_qwen and not frozen_replacement(manifest,candidates[word],old)
                    and Path(old_source.get('path','')).parent!=Path(source['path']).parent):
                raise ValueError('Bacino appartenente ad altra revisione: '+word)
            if old['sense_description']!=pool['sense_description']:
                raise ValueError('Cambio di senso di un bacino già pubblicato: '+word)
        plans.append((head,pool,annotation_path,annotation_bytes,old))
    if not plans:return {'imported_pools':0,'already_imported':len(skipped),'negative_pending':negative}
    # Tutti i record sono stati verificati prima di creare artefatti o scrivere DB.
    output.mkdir(parents=True,exist_ok=False)
    for _,pool,path,content,_ in plans:
        path.write_bytes(content)
        verify_annotation(pool)
    pack=output/'pools.jsonl'
    pack.write_bytes(''.join(json.dumps(p,ensure_ascii=False)+'\n' for _,p,_,_,_ in plans).encode('utf-8'))
    (output/'prompt_reviews.jsonl').write_bytes(''.join(json.dumps(h,ensure_ascii=False)+'\n' for h,_,_,_,_ in plans).encode('utf-8'))
    db=SQLite(raw)
    if backup:
        backup=ROOT/'database-backups'/('before_agent_associations_'+stamp+'.sql')
        backup.parent.mkdir(parents=True,exist_ok=True)
        db.dump(backup,pool_objects(db))
    register_reviews(db,[h for h,_,_,_,_ in plans])
    import_reviewed(db,pack,expected_heads={p['prompt']:h['content_sha256'] for h,p,_,_,_ in plans},
                    expected_pool_reviews={p['prompt']:old['content_sha256'] if old else None for _,p,_,_,old in plans})
    result={'imported_pools':len(plans),'associations':sum(len(p['answers']) for _,p,_,_,_ in plans),
            'already_imported':len(skipped),'negative_pending':negative,'backup':relative(backup) if backup else None}
    if publish:
        result['validated_db']=sync_validated(db,valid)
        if unified_db.same_db(raw,DEFAULT_DB):result['game_db']=export_game_db(db,GAME_DB)
        result['queue']=status(JOB,raw)
    (output/'receipt.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    return result


def main():
    if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8')
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('batches',type=Path,nargs='+')
    parser.add_argument('--no-publish',action='store_true')
    parser.add_argument('--skip-imported',action='store_true',help='salta i lotti con ricevuta di importazione')
    args=parser.parse_args()
    backed_up=False
    for batch in args.batches:
        batch=Path(batch).resolve()
        receipts=batch.parents[2]/'central_imports'/batch.parent.name
        if args.skip_imported and any(receipts.glob(batch.stem+'_*/receipt.json')):continue
        # Un solo backup delle tabelle dei bacini per esecuzione; la copia valida si pubblica alla fine.
        result=ingest(batch,publish=False,backup=not backed_up)
        backed_up=backed_up or bool(result.get('backup'))
        print(json.dumps({'batch':str(batch),'result':result},ensure_ascii=False),flush=True)
    if backed_up and not args.no_publish:print(json.dumps({'published':publish()},ensure_ascii=False),flush=True)


def publish(raw=DEFAULT_DB,valid=VALIDATED_DB):
    db=SQLite(raw)
    return {'validated_db':sync_validated(db,valid),'game_db':export_game_db(db,GAME_DB),'queue':status(JOB,raw)}


if __name__=='__main__':main()

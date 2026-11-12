"""Fotografia verificabile dell'avanzamento; non effettua revisioni semantiche."""
from collections import Counter
from datetime import datetime,timezone
import json
from pathlib import Path

from association_catalog import current,status,read_only,JOB,verify_annotation
from prompt_database import ROOT,DEFAULT_DB,GAME_DB,digest,sample_pool
from validated_prompt_database import VALIDATED_DB
from ingest_agent_associations import selected


def snapshot():
    heads,pools,blocked=current(DEFAULT_DB)
    original={p['prompt']:p for p in map(json.loads,
        (ROOT/'resources/prompt_pools_reviewed_20261109.jsonl').read_text(encoding='utf-8').splitlines())}
    unchanged=all(pools.get(word)==pool for word,pool in original.items())
    if not unchanged:raise ValueError('Un bacino preesistente è stato alterato')
    not_ready=[]
    for word,pool in pools.items():
        if 'association_catalog' in pool:verify_annotation(pool)
        try:sample_pool(pool,7,'central-progress-audit')
        except ValueError:not_ready.append(word)
    copies={}
    for path in (VALIDATED_DB,GAME_DB):
        db=read_only(path)
        try:
            actual={r['prompt']:json.loads(r['record_json']) for r in db.execute(
                'SELECT s.prompt,r.record_json FROM senses s JOIN reviews r ON r.id=s.review_id '
                'JOIN prompts p ON p.lemma=s.prompt AND p.familiar_sense=s.description')}
            if actual!=pools:raise ValueError('Copia da riallineare: '+path.name)
            integrity=[r[0] for r in db.execute('PRAGMA integrity_check')]
            foreign_keys=list(db.execute('PRAGMA foreign_key_check'))
            if integrity!=['ok'] or foreign_keys:raise ValueError('Integrità non valida: '+path.name)
            copies[path.name]={'prompts':len(actual),'associations':sum(len(p['answers']) for p in actual.values()),
                'integrity_check':integrity,'foreign_key_errors':len(foreign_keys),
                'sampled_seven_word_sets':len(actual)-len(not_ready),
                'not_ready_for_seven':sorted(not_ready),
                'difficulty':dict(Counter(a['difficulty'] for p in actual.values() for a in p['answers']))}
        finally:db.close()
    db=read_only(DEFAULT_DB)
    try:
        inventory=db.execute('SELECT count(*) FROM inventory_terms').fetchone()[0]
        shared=db.execute('SELECT count(*) FROM (SELECT word FROM associations GROUP BY word HAVING count(DISTINCT sense_id)>1)').fetchone()[0]
    finally:db.close()
    agents={}
    for folder in sorted((JOB/'agent_outputs').glob('shard_*')):
        reviewed={r['prompt']:r for batch in sorted(folder.glob('batch_*.jsonl')) for r,_ in selected(batch)}
        agents[folder.name]={'reviewed_entries':len(reviewed),'decisions':dict(Counter(r['decision'] for r in reviewed.values())),
            'imported_current_pools':sum(1 for word in reviewed if word in pools and heads[word].get('source_decision')),
            'batch_files':len(list(folder.glob('batch_*.jsonl'))),'correction_files':len(list(folder.glob('corrections_*.jsonl')))}
    queue=status()
    result={'schema':'association-expansion-progress-1','updated_at':datetime.now(timezone.utc).isoformat(),
        'task_complete':queue['coverage_complete'],'method':'llm_editorial_review','human_review':False,
        'independent_gameplay_qa':False,'lexically_exhaustive':False,
        'new_pools':len(pools)-len(original),
        'new_associations':sum(len(p['answers']) for p in pools.values())-sum(len(p['answers']) for p in original.values()),
        'previous_pools_preserved':len(original),'previous_pools_sha256':digest([original[k] for k in sorted(original)]),
        'inventory_terms_preserved':inventory,'positive_prompt_reviews':len(heads),'shared_answer_words':shared,
        'copies':copies,'queue':queue,'agents':agents,
        'valid_pools_outside_filtered_snapshot':sorted(set(pools)-{json.loads(line)['prompt'] for line in (JOB/'entries.jsonl').read_text(encoding='utf-8').splitlines()}),
        'running_state_note':'Fotografia dei risultati salvati; non certifica che un processo continui dopo la sessione.'}
    destination=ROOT/'resources/avanzamento_associazioni_filtrati_20261109.json'
    destination.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    return result


if __name__=='__main__':
    import sys
    if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8')
    print(json.dumps(snapshot(),ensure_ascii=False,indent=2))

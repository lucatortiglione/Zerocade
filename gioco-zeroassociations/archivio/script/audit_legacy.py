#!/usr/bin/env python3
"""Ricontrolla il lotto v3.4 senza riscriverlo o convertire le categorie."""
import argparse
from collections import Counter
import csv
import io
import json
from pathlib import Path

from association_rules import STOP_ASSOCIATIONS
from validate_word_association_it_v3_6_0 import check_csv, load_taxonomy, TAXONOMY_FILENAME


def main(argv=None):
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--directory',type=Path,default=Path(__file__).parent/'generated')
    args=ap.parse_args(argv)
    root=args.directory
    dataset=root/'word_association_it_5000_candidati.csv'
    metadata=root/'word_association_it_5000_metadati.jsonl'
    taxonomy=load_taxonomy(Path(__file__).parent/TAXONOMY_FILENAME)
    records=[json.loads(line) for line in metadata.read_text(encoding='utf-8-sig').splitlines() if line.strip()]
    by_ref={r['ref']:r for r in records}
    report=check_csv(dataset,min_rows=5000)
    blocked=[]; mismatches=[]; categories=Counter()
    queue=root/'migrazione_v3_5_5.csv'
    # A rerun must not erase category decisions already entered by an editor.
    output=io.StringIO() if queue.exists() else queue.open('w',encoding='utf-8',newline='')
    with dataset.open(encoding='utf-8-sig',newline='') as f, output as out:
        writer=csv.writer(out)
        writer.writerow(['ref','prompt','source_taxonomy','legacy_category_id','legacy_category_name',
                         'target_category_id','reviewed_by','rationale','status'])
        for row in csv.DictReader(f):
            old=by_ref.get(row['ref'],{})
            if row['prompt']!=old.get('prompt') or row['words'].split('|')!=old.get('words'):
                mismatches.append(row['ref'])
            categories[old.get('category_id','MISSING')]+=1
            invalid=[w for w in row['words'].split('|') if w in STOP_ASSOCIATIONS]
            if invalid: blocked.append({'ref':row['ref'],'prompt':row['prompt'],'clues_to_rewrite':invalid})
            writer.writerow([row['ref'],row['prompt'],'3.4',old.get('category_id'),old.get('category_name'),
                             '','','','PENDING_CATEGORY_REVIEW'])
    result={'source_taxonomy':'3.4','target_taxonomy':'3.5.5','target_categories':len(taxonomy),
            'status':'LEGACY_NOT_RELEASEABLE','approved':0,'csv':report,
            'legacy_category_counts':dict(categories),'metadata_mismatches':mismatches,
            'blocked_rows':blocked,'pending_category_reviews':report['rows'],
            'migration_queue':queue.name,
            'required':['Assegnazione motivata della nuova categoria per accezione; nessuno zero-padding.',
                        'Riscrittura degli indizi vietati, poi nuovo audit NLP e nuovi test ciechi.',
                        'QA indipendente, safety, calibrazione e doppia revisione ancora mancanti.']}
    path=root/'audit_migrazione_v3_5_5.json'
    path.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'{report["rows"]} righe legacy, {len(blocked)} da riscrivere, {report["warnings_count"]} avvisi; approvate: 0. {path}')
    return 0  # Audit completato; lo stato del dataset è esplicitamente non rilasciabile.


if __name__=='__main__': raise SystemExit(main())

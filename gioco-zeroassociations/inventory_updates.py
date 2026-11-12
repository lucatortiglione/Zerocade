"""Aggiornamenti e decisioni persistenti nella raccolta prompt_raw.sqlite3."""
from __future__ import annotations

import argparse
from datetime import datetime,timezone
import hashlib
import json
from pathlib import Path
import re
import sys
import tempfile
import urllib.error
import urllib.request
from urllib.parse import urlparse
import uuid

from prompt_database import ROOT,DEFAULT_DB,insert
from prompt_inventory import CACHE,REGISTRY,KINDS,normalize,initialize_inventory,write_bulk,collect_sitemap
from collect_prompt_sources import checksum
from sqlite_prompt_runtime import SQLite,literal


def now():return datetime.now(timezone.utc).isoformat()


def head(db,key):
    rows=db.run('SELECT snapshot_id FROM inventory_source_heads WHERE source_key='+literal(key)+';',rows=True)
    return rows[0]['snapshot_id'] if rows else None


def fingerprints_sql(snapshot_id):
    # La riga nella fonte non identifica il contenuto: riordinare il file non
    # rende modificate tutte le parole. Le osservazioni duplicate contano una volta.
    payload='json_array(role,pos,lemma,source_form,json(details_json))'
    return ('INSERT OR IGNORE INTO inventory_snapshot_terms SELECT '+literal(snapshot_id)+',prompt,'
        f'lower(hex(sha3(json_group_array(DISTINCT {payload} ORDER BY {payload}),256))) '
        'FROM inventory_attestations WHERE snapshot_id='+literal(snapshot_id)+' GROUP BY prompt;')


def register_sources(db,sources):
    statements=['BEGIN IMMEDIATE;']
    for source in sources:
        if source.get('kind') not in KINDS:raise ValueError('Tipo di fonte sconosciuto')
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,100}',source.get('id','')):raise ValueError('ID fonte non valido')
        statements.append(insert('inventory_sources',{'source_key':source['id'],'name':source['name'],
            'kind':source['kind'],'url':source['url'],'license':source['license'],
            'attribution':source['attribution']},ignore=True))
        statements.append('INSERT INTO inventory_registered_sources VALUES ('+
            ','.join(literal(v) for v in [source['id'],json.dumps(source,ensure_ascii=False),1])+
            ') ON CONFLICT(source_key) DO UPDATE SET config_json=excluded.config_json;')
    statements.append('COMMIT;');db.run(''.join(statements))


def stage_update(db,source,path):
    """Salva proposte e differenze nel DB. Non modifica lo snapshot attivo."""
    if source.get('kind') not in KINDS or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,100}',source.get('id','')):
        raise ValueError('Tipo o ID fonte non valido')
    path=Path(path);file_hash=checksum(path);base=head(db,source['id'])
    if base:
        current=db.run('SELECT sha256 FROM inventory_snapshots WHERE id='+literal(base)+';',rows=True)[0]['sha256']
        if current==file_hash:return {'source':source['id'],'status':'UNCHANGED','sha256':file_hash}
    rejected=db.run('SELECT id,status FROM inventory_updates WHERE source_key='+literal(source['id'])+
        ' AND sha256='+literal(file_hash)+' ORDER BY coalesce(decision_at,detected_at) DESC LIMIT 1;',rows=True)
    if rejected and rejected[0]['status']=='DISCARDED':
        return {'source':source['id'],'status':'PREVIOUSLY_DISCARDED','update_id':rejected[0]['id'],'sha256':file_hash}
    update_id=hashlib.sha256((source['id']+'\0'+(base or '')+'\0'+file_hash).encode('utf-8')).hexdigest()
    existing=db.run('SELECT id,status FROM inventory_updates WHERE id='+literal(update_id)+';',rows=True)
    if existing:return {'source':source['id'],'status':existing[0]['status'],'update_id':update_id,'sha256':file_hash}
    with tempfile.TemporaryDirectory(prefix='zerocade-update-stage-') as directory:
        bulk=Path(directory)/'rows.txt';count=write_bulk(path,source,bulk)
        if checksum(path)!=file_hash:raise ValueError('La fonte è cambiata durante la lettura')
        sql=['PRAGMA cache_size=-131072;\nBEGIN IMMEDIATE;\n']
        sql.append(insert('inventory_sources',{'source_key':source['id'],'name':source['name'],'kind':source['kind'],
            'url':source['url'],'license':source['license'],'attribution':source['attribution']},ignore=True))
        sql.append(insert('inventory_registered_sources',{'source_key':source['id'],
            'config_json':json.dumps(source,ensure_ascii=False),'enabled':1},ignore=True))
        sql.append(insert('inventory_updates',{'id':update_id,'source_key':source['id'],'base_snapshot_id':base,
            'sha256':file_hash,'cache_path':str(path.resolve()),'config_json':json.dumps(source,ensure_ascii=False),
            'detected_at':now(),'status':'PENDING','records':count,'new_terms':0,'changed_terms':0,'removed_terms':0,'unchanged_terms':0}))
        sql.append('CREATE TEMP TABLE incoming(word TEXT,surface TEXT,locator TEXT,role TEXT,pos TEXT,lemma TEXT,details TEXT,'
                   'single_word INTEGER,is_lemma INTEGER,is_inflected INTEGER,is_proper INTEGER,it_evidence INTEGER);\n')
        sql.append('.mode ascii\n.import --ascii --schema temp '+json.dumps(bulk.as_posix())+' incoming\n')
        sql.append('INSERT INTO inventory_update_rows SELECT '+literal(update_id)+',* FROM incoming;')
        payload='json_array(role,pos,lemma,surface,json(details))'
        sql.append('INSERT INTO inventory_update_terms SELECT '+literal(update_id)+',word,'+
            f'lower(hex(sha3(json_group_array(DISTINCT {payload} ORDER BY {payload}),256))),'
            'max(single_word),max(is_lemma),max(is_inflected),max(is_proper),max(it_evidence) FROM incoming GROUP BY word;')
        if base:sql.append(fingerprints_sql(base))
        sql.append('INSERT INTO inventory_update_changes SELECT n.update_id,n.prompt,'
            "CASE WHEN o.prompt IS NULL THEN 'NEW' WHEN n.fingerprint=o.fingerprint THEN 'UNCHANGED' ELSE 'CHANGED' END "
            'FROM inventory_update_terms n LEFT JOIN inventory_snapshot_terms o ON o.snapshot_id='+literal(base)+
            ' AND o.prompt=n.prompt WHERE n.update_id='+literal(update_id)+';')
        if base:
            sql.append('INSERT INTO inventory_update_changes SELECT '+literal(update_id)+",o.prompt,'REMOVED' "
                'FROM inventory_snapshot_terms o WHERE o.snapshot_id='+literal(base)+' AND NOT EXISTS('
                'SELECT 1 FROM inventory_update_terms n WHERE n.update_id='+literal(update_id)+' AND n.prompt=o.prompt);')
        for column,kind in [('new_terms','NEW'),('changed_terms','CHANGED'),('removed_terms','REMOVED'),('unchanged_terms','UNCHANGED')]:
            sql.append('UPDATE inventory_updates SET '+column+'=(SELECT count(*) FROM inventory_update_changes '
                'WHERE update_id='+literal(update_id)+' AND kind='+literal(kind)+') WHERE id='+literal(update_id)+';')
        sql.append('COMMIT;');db.run(''.join(sql))
    result=db.run('SELECT id,source_key,status,records,new_terms,changed_terms,removed_terms,unchanged_terms '
                  'FROM inventory_updates WHERE id='+literal(update_id)+';',rows=True)[0]
    return {'update_id':result.pop('id'),**result}


def get_update(db,prefix):
    if not re.fullmatch('[a-f0-9]{8,64}',prefix):raise ValueError('Usare l’ID completo o un prefisso di almeno 8 caratteri')
    rows=db.run('SELECT * FROM inventory_updates WHERE id LIKE '+literal(prefix+'%')+';',rows=True)
    if len(rows)!=1:raise ValueError('Aggiornamento assente o prefisso non univoco')
    return rows[0]


def decide_update(db,identifier,decision,reason,actor='user'):
    if decision not in {'APPLY','DISCARD','DEFER'}:raise ValueError('Decisione non valida')
    if not reason.strip() or not actor.strip():raise ValueError('Indicare motivazione e autore della decisione')
    update=get_update(db,identifier);key=update['source_key'];uid=update['id']
    if update['status']=='APPLIED':raise ValueError('Aggiornamento già integrato; lo storico non viene riscritto')
    sql=['PRAGMA cache_size=-131072;BEGIN IMMEDIATE;']
    sql.append("CREATE TEMP TABLE state_guard(ok INTEGER CHECK(ok=1));INSERT INTO state_guard SELECT CASE WHEN "
        "(SELECT status FROM inventory_updates WHERE id="+literal(uid)+")<>'APPLIED' THEN 1 ELSE 0 END;")
    if decision=='APPLY':
        if head(db,key)!=update['base_snapshot_id']:
            raise ValueError('La fonte attiva è cambiata: ricontrollare gli aggiornamenti prima di integrare questo confronto')
        # Ricontrollo nella transazione, per evitare l'applicazione di un confronto obsoleto.
        sql.append('CREATE TEMP TABLE guard(ok INTEGER CHECK(ok=1));INSERT INTO guard SELECT CASE WHEN '
            "coalesce((SELECT snapshot_id FROM inventory_source_heads WHERE source_key="+literal(key)+"),'')="+
            literal(update['base_snapshot_id'] or '')+' THEN 1 ELSE 0 END;')
        snapshot=hashlib.sha256((key+'\0'+update['sha256']).encode('utf-8')).hexdigest()
        sql.append(insert('inventory_snapshots',{'id':snapshot,'source_key':key,'sha256':update['sha256'],
            'acquired_at':now(),'cache_path':update['cache_path'],'records':update['records'],
            'source_config_json':update['config_json']},ignore=True))
        sql.append('INSERT INTO inventory_terms(prompt,is_single_word,has_lemma_evidence,has_inflected_evidence,'
            'has_proper_name_evidence,has_it_dictionary_evidence) SELECT prompt,is_single_word,is_lemma,is_inflected,is_proper,it_evidence '
            'FROM inventory_update_terms WHERE update_id='+literal(uid)+' ON CONFLICT(prompt) DO UPDATE SET '
            'has_lemma_evidence=max(inventory_terms.has_lemma_evidence,excluded.has_lemma_evidence),'
            'has_inflected_evidence=max(inventory_terms.has_inflected_evidence,excluded.has_inflected_evidence),'
            'has_proper_name_evidence=max(inventory_terms.has_proper_name_evidence,excluded.has_proper_name_evidence),'
            'has_it_dictionary_evidence=max(inventory_terms.has_it_dictionary_evidence,excluded.has_it_dictionary_evidence);')
        sql.append('INSERT OR IGNORE INTO inventory_attestations SELECT prompt,'+literal(snapshot)+
            ',locator,role,pos,source_form,lemma,details_json FROM inventory_update_rows WHERE update_id='+literal(uid)+';')
        sql.append('INSERT OR IGNORE INTO inventory_snapshot_terms SELECT '+literal(snapshot)+',prompt,fingerprint '
            'FROM inventory_update_terms WHERE update_id='+literal(uid)+';')
        sql.append('INSERT INTO inventory_source_heads VALUES ('+literal(key)+','+literal(snapshot)+') '
            'ON CONFLICT(source_key) DO UPDATE SET snapshot_id=excluded.snapshot_id;')
        # Le righe integrali sono ora nelle attestazioni; nel confronto restano hash e differenze.
        sql.append('DELETE FROM inventory_update_rows WHERE update_id='+literal(uid)+';')
    target={'APPLY':'APPLIED','DISCARD':'DISCARDED','DEFER':'DEFERRED'}[decision];date=now()
    sql.append('UPDATE inventory_updates SET status='+literal(target)+',decision_at='+literal(date)+
        ',reason='+literal(reason)+' WHERE id='+literal(uid)+';')
    sql.append(insert('inventory_decision_history',{'subject_type':'UPDATE','subject_id':uid,
        'decision':target,'reason':reason,'actor':actor,'decided_at':date}))
    sql.append('COMMIT;');db.run(''.join(sql))
    return {'update_id':uid,'status':target,'gameplay_approval':False}


def decide_term(db,prompt,decision,reason,actor='user'):
    prompt=normalize(prompt)
    if not prompt or decision not in {'INTEGRATED','DISCARDED','DEFERRED'}:raise ValueError('Voce o decisione non valida')
    if not reason.strip() or not actor.strip():raise ValueError('Indicare motivazione e autore della decisione')
    exists=db.run('SELECT prompt FROM inventory_terms WHERE prompt='+literal(prompt)+
        ' UNION SELECT prompt FROM inventory_update_terms WHERE prompt='+literal(prompt)+
        ' UNION SELECT lemma FROM prompts WHERE lemma='+literal(prompt)+' LIMIT 1;',rows=True)
    if not exists:raise ValueError('Voce assente dall’inventario e dagli aggiornamenti raccolti')
    date=now();values={'prompt':prompt,'decision':decision,'reason':reason,'actor':actor,'decided_at':date}
    sql='BEGIN IMMEDIATE;INSERT INTO inventory_term_decisions VALUES ('+','.join(literal(v) for v in values.values())+') '
    sql+='ON CONFLICT(prompt) DO UPDATE SET decision=excluded.decision,reason=excluded.reason,actor=excluded.actor,decided_at=excluded.decided_at;'
    sql+=insert('inventory_decision_history',{'subject_type':'TERM','subject_id':prompt,'decision':decision,
        'reason':reason,'actor':actor,'decided_at':date})+'COMMIT;'
    db.run(sql)
    return {**values,'gameplay_approval':False}


def list_changes(db,identifier,kind=None,limit=50,offset=0):
    update=get_update(db,identifier)
    if kind not in {None,'NEW','CHANGED','REMOVED','UNCHANGED'}:raise ValueError('Tipo di cambiamento non valido')
    if not 1<=limit<=1000 or offset<0:raise ValueError('Limite da 1 a 1000 e offset non negativo')
    sql='SELECT c.prompt,c.kind,coalesce(d.decision,\'COLLECTED\') AS decision,d.reason FROM inventory_update_changes c '
    sql+='LEFT JOIN inventory_term_decisions d ON d.prompt=c.prompt WHERE c.update_id='+literal(update['id'])
    if kind:sql+=' AND c.kind='+literal(kind)
    return db.run(sql+' ORDER BY c.kind,c.prompt LIMIT '+str(limit)+' OFFSET '+str(offset)+';',rows=True)


def resolve_latest(source,commits):
    """Segue HEAD per GitHub e latest per i dump Wikimedia, conservando la revisione effettiva."""
    source=dict(source)
    match=re.fullmatch(r'https://raw\.githubusercontent\.com/([^/]+/[^/]+)/([^/]+)/(.*)',source['url'])
    if match:
        repo,_,path=match.groups()
        if repo not in commits:
            request=urllib.request.Request('https://api.github.com/repos/'+repo+'/commits/HEAD',
                headers={'User-Agent':'Zerocade-inventory-updates/1.0','Accept':'application/vnd.github+json'})
            with urllib.request.urlopen(request,timeout=45) as response:commits[repo]=json.load(response)['sha']
        revision=commits[repo]
        if not re.fullmatch('[a-f0-9]{40}',revision):raise ValueError('Revisione GitHub non valida')
        source['url']='https://raw.githubusercontent.com/'+repo+'/'+revision+'/'+path
        if source.get('license_url'):
            source['license_url']=re.sub(r'(https://raw\.githubusercontent\.com/[^/]+/[^/]+/)[^/]+/',
                lambda m:m[1]+revision+'/',source['license_url'])
        source['revision']=revision
    elif source['kind']=='wiki_titles':
        source['url']=re.sub(r'/(\d{8})/([^/]+)-\1-',r'/latest/\2-latest-',source['url'])
        source.pop('cache_file',None)
    return source


def fetch_current(db,source,cache,commits):
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,100}',source.get('id','')):raise ValueError('ID fonte non valido')
    if source.get('local_path'):
        path=Path(source['local_path'])
        if not path.is_absolute():path=ROOT/path
        if not path.is_file():raise FileNotFoundError(path)
        return source,path
    source=resolve_latest(source,commits)
    if source['kind']=='sitemap_index':
        # L'indice può essere invariato mentre cambia un file figlio: ricontrollarli tutti.
        directory=cache/'updates'/source['id']/uuid.uuid4().hex
        return source,collect_sitemap(source,directory)
    # Una revisione Git immutabile già archiviata non richiede un altro download.
    if source.get('revision') and source['url'].startswith('https://raw.githubusercontent.com/'):
        known=db.run('SELECT cache_path,sha256 FROM inventory_snapshots WHERE source_key='+literal(source['id'])+
            " AND json_extract(source_config_json,'$.url')="+literal(source['url'])+' LIMIT 1;',rows=True)
        if known and Path(known[0]['cache_path']).is_file() and checksum(Path(known[0]['cache_path']))==known[0]['sha256']:
            return source,Path(known[0]['cache_path'])
    cached=db.run('SELECT * FROM inventory_http_cache WHERE source_key='+literal(source['id'])+
        ' AND url='+literal(source['url'])+';',rows=True)
    headers={'User-Agent':'Zerocade-inventory-updates/1.0'}
    previous=cached[0] if cached and Path(cached[0]['cache_path']).is_file() else None
    if previous:
        if previous['etag']:headers['If-None-Match']=previous['etag']
        if previous['last_modified']:headers['If-Modified-Since']=previous['last_modified']
    request=urllib.request.Request(source['url'],headers=headers)
    directory=cache/'updates'/source['id']/uuid.uuid4().hex;directory.mkdir(parents=True,exist_ok=True)
    path=directory/(source['url'].rsplit('/',1)[-1] or 'source.bin')
    try:
        response=urllib.request.urlopen(request,timeout=60)
    except urllib.error.HTTPError as error:
        if error.code!=304 or previous is None:raise
        old=Path(previous['cache_path'])
        if checksum(old)!=previous['sha256']:raise ValueError('La copia locale validata dal server è stata modificata')
        db.run('UPDATE inventory_http_cache SET checked_at='+literal(now())+' WHERE source_key='+literal(source['id'])+
            ' AND url='+literal(source['url'])+';')
        return source,old
    with response,path.open('xb') as stream:
        etag=response.headers.get('ETag');modified=response.headers.get('Last-Modified')
        while block:=response.read(1024*1024):stream.write(block)
    file_hash=checksum(path)
    db.run('INSERT INTO inventory_http_cache VALUES ('+','.join(literal(v) for v in
        [source['id'],source['url'],etag,modified,str(path.resolve()),file_hash,now()])+
        ') ON CONFLICT(source_key,url) DO UPDATE SET etag=excluded.etag,last_modified=excluded.last_modified,'
        'cache_path=excluded.cache_path,sha256=excluded.sha256,checked_at=excluded.checked_at;')
    return source,path


def check_updates(db,only=None,cache=CACHE):
    sources=[json.loads(row['config_json']) for row in db.run(
        'SELECT config_json FROM inventory_registered_sources WHERE enabled=1 ORDER BY source_key;',rows=True)]
    if only and '*' in only:only=None
    if only and set(only)-{s['id'] for s in sources}:raise ValueError('Fonti richieste non registrate o disabilitate')
    commits={};results=[]
    for source in sources:
        if only and source['id'] not in only:continue
        print('Controllo fonte: '+source['name'],flush=True)
        try:
            effective,path=fetch_current(db,source,cache,commits)
            result=stage_update(db,effective,path)
        except Exception as error:result={'source':source['id'],'status':'FAILED','error':str(error)}
        results.append(result);print(json.dumps(result,ensure_ascii=False),flush=True)
    return results


def main(argv=None):
    if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8')
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--db',type=Path,default=DEFAULT_DB);ap.add_argument('--sqlite',type=Path)
    sub=ap.add_subparsers(dest='command',required=True)
    sub.add_parser('init')
    backup=sub.add_parser('backup');backup.add_argument('--output',type=Path)
    reg=sub.add_parser('register-sources');reg.add_argument('--registry',type=Path,default=REGISTRY)
    check=sub.add_parser('check-updates');check.add_argument('--only',nargs='+');check.add_argument('--cache',type=Path,default=CACHE)
    listing=sub.add_parser('updates');listing.add_argument('--status',choices=['PENDING','DEFERRED','APPLIED','DISCARDED'])
    changes=sub.add_parser('changes');changes.add_argument('update');changes.add_argument('--kind',choices=['NEW','CHANGED','REMOVED','UNCHANGED'])
    changes.add_argument('--limit',type=int,default=50);changes.add_argument('--offset',type=int,default=0)
    decide=sub.add_parser('decide-update');decide.add_argument('update');decide.add_argument('--decision',required=True,choices=['APPLY','DISCARD','DEFER'])
    decide.add_argument('--reason',required=True);decide.add_argument('--actor',default='user')
    term=sub.add_parser('decide-term');term.add_argument('prompt');term.add_argument('--decision',required=True,choices=['INTEGRATED','DISCARDED','DEFERRED'])
    term.add_argument('--reason',required=True);term.add_argument('--actor',default='user')
    info=sub.add_parser('term');info.add_argument('prompt')
    args=ap.parse_args(argv);db=SQLite(args.db,args.sqlite);initialize_inventory(db)
    if args.command=='init':result={'database':str(db.path),'registered_sources':db.run('SELECT count(*) AS n FROM inventory_registered_sources;',rows=True)[0]['n']}
    elif args.command=='backup':
        output=(args.output or ROOT/'database-backups'/('prompt_full_'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S_%f')+'.sqlite3')).resolve()
        if output.exists():raise FileExistsError('Backup già presente: non viene sovrascritto')
        output.parent.mkdir(parents=True,exist_ok=True)
        db.run('.backup '+json.dumps(output.as_posix())+'\n')
        result={'backup':str(output),'scope':'complete_database_including_inventory_sources_updates_and_decisions'}
    elif args.command=='register-sources':
        sources=json.loads(args.registry.read_text(encoding='utf-8'));register_sources(db,sources);result={'registered_sources':len(sources)}
    elif args.command=='check-updates':
        result=check_updates(db,args.only,args.cache)
        return 2 if any(r['status']=='FAILED' for r in result) else 0
    elif args.command=='updates':
        sql='SELECT id,source_key,status,new_terms,changed_terms,removed_terms,unchanged_terms,detected_at,reason FROM inventory_updates'
        if args.status:sql+=' WHERE status='+literal(args.status)
        result=db.run(sql+' ORDER BY detected_at DESC LIMIT 100;',rows=True)
    elif args.command=='changes':result=list_changes(db,args.update,args.kind,args.limit,args.offset)
    elif args.command=='decide-update':
        result=decide_update(db,args.update,args.decision,args.reason,args.actor)
        if result['status']=='APPLIED':
            # L'aggiornamento ha portato parole nella raccolta: si aggiornano prompt_filtrati e prompt_validi.
            from review_prompts import after_new_words
            result['refresh']=after_new_words(db.path)
    elif args.command=='decide-term':
        result=decide_term(db,args.prompt,args.decision,args.reason,args.actor)
        from discarded_prompt_database import FILTERED_DB, sync_discarded
        if db.path==DEFAULT_DB.resolve() and FILTERED_DB.exists():
            try:
                result['discarded_db']=sync_discarded(db.path,FILTERED_DB)
            except (ValueError,RuntimeError,OSError) as error:
                result['discarded_db_refresh_error']=str(error)
                result['hint']='La decisione è salvata; rigenerare i filtri e il DB degli scarti.'
    elif args.command=='term':
        prompt=normalize(args.prompt)
        result={'entry':db.run('SELECT * FROM inventory_catalog WHERE prompt='+literal(prompt)+';',rows=True),
            'history':db.run("SELECT * FROM inventory_decision_history WHERE subject_type='TERM' AND subject_id="+literal(prompt)+' ORDER BY id;',rows=True),
            'updates':db.run('SELECT u.id,u.source_key,u.status,c.kind FROM inventory_update_changes c '
                'JOIN inventory_updates u ON u.id=c.update_id WHERE c.prompt='+literal(prompt)+' ORDER BY u.detected_at DESC LIMIT 50;',rows=True)}
    print(json.dumps(result,ensure_ascii=False,indent=2));return 0


if __name__=='__main__':
    try:raise SystemExit(main())
    except (ValueError,RuntimeError,OSError) as error:
        print(str(error),file=sys.stderr);raise SystemExit(1)

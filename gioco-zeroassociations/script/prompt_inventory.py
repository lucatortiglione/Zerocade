"""Step 1: inventario multi-fonte dei prompt, senza generare associazioni.

I termini raccolti sono nel DB con stato COLLECTED. Livecade continua a leggere
esclusivamente i bacini verificati, mai queste tabelle di inventario.
"""
from __future__ import annotations

import argparse
import bz2
import csv
from datetime import datetime,timezone
import gzip
import hashlib
import json
from pathlib import Path
import re
import sys
import tempfile
import unicodedata
from urllib.parse import quote,urlparse,unquote
import xml.etree.ElementTree as ET
import zipfile

from collect_prompt_sources import CACHE,checksum,download
from prompt_database import ROOT,DEFAULT_DB,insert
from sqlite_prompt_runtime import SQLite,literal
from inventory_evidence import source_family

REGISTRY=ROOT/'resources/prompt_inventory_sources.json'
SINGLE_WORD=re.compile(r'[a-zàèéìòù]+')
KINDS={'wiktextract','wiki_titles','hunspell','mythes','wordnet_tab','wordlist','frequency_csv','frequency_text','morphit','unimorph','glaffit','flex_it','sitemap_index','conllu','tei_headwords','nvdb_text','xlsx_table'}
FIELD_SEPARATOR='\x1f'
RECORD_SEPARATOR='\x1e'


def normalize(text):
    if not isinstance(text,str):raise ValueError('Il prompt deve essere un testo')
    text=unicodedata.normalize('NFC',' '.join(text.strip().split())).casefold()
    if not text or len(text)>2048 or any(ord(c)<32 for c in text):return None
    return text


def observation(word,locator,role='listed_form',pos='',lemma='',details=None):
    prompt=normalize(word)
    if not prompt or any(ord(c)<32 for c in word):return None
    return {'prompt':prompt,'source_form':word,'locator':str(locator),'role':role,
            'pos':str(pos),'lemma':normalize(lemma) or '', 'details':details or {}}


def morphology_observations(form,lemma,pos,locator,details,lemma_pos=None,proper=False):
    """Conserva la forma e il lemma esplicito della fonte, senza dedurlo dalla flessione."""
    if not normalize(form) or not normalize(lemma):
        raise ValueError(f'Forma o lemma assente, riga {locator}')
    same=normalize(form)==normalize(lemma)
    row=observation(form,f'{locator}:form','proper_name' if proper else
                    'lemma' if same else 'inflected_form',pos,lemma,details)
    if row:yield row
    if not same:
        row=observation(lemma,f'{locator}:lemma','proper_name' if proper else 'lemma',
                        lemma_pos if lemma_pos is not None else pos,lemma,
                        {'language_claim':details['language_claim'],'source_scope':'explicit_lemma',
                         'observed_form':form})
        if row:yield row


def xlsx_rows(path,sheet):
    """Le righe di un foglio .xlsx come liste di testi, con la sola libreria standard."""
    ns={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    with zipfile.ZipFile(path) as book:
        shared=([''.join(t.itertext()) for t in ET.fromstring(book.read('xl/sharedStrings.xml')).findall('m:si',ns)]
                if 'xl/sharedStrings.xml' in book.namelist() else [])
        root=ET.fromstring(book.read(f'xl/worksheets/sheet{int(sheet)}.xml'))
    def column(ref):
        letters=re.match(r'[A-Z]+',ref or 'A')[0];n=0
        for c in letters:n=n*26+ord(c)-64
        return n-1
    for row in root.findall('.//m:row',ns):
        cells={}
        for cell in row.findall('m:c',ns):
            value=cell.find('m:v',ns);kind=cell.get('t')
            text=(shared[int(value.text)] if kind=='s' and value is not None else
                  ''.join(cell.find('m:is',ns).itertext()) if kind=='inlineStr' and cell.find('m:is',ns) is not None else
                  value.text if value is not None else '')
            cells[column(cell.get('r'))]=text
        yield [cells.get(i,'') for i in range(max(cells)+1)] if cells else []


def records(path,source):
    """Parsers lessicali: nessuna analisi semantica e nessun token da definizioni."""
    kind=source['kind'];encoding=source.get('encoding','utf-8-sig')
    if kind=='wiktextract':
        with path.open(encoding=encoding) as stream:
            for number,line in enumerate(stream,1):
                entry=json.loads(line)
                if entry.get('lang_code')!='it':continue
                senses=entry.get('senses',[])
                form_of=[r.get('word','') for s in senses for r in s.get('form_of',[])]
                inflected=bool(form_of) or 'form-of' in entry.get('tags',[])
                proper=entry.get('pos')=='name'
                details={'language_claim':'it_from_dictionary','definition_language':source.get('definition_language'),
                    'senses':[{'id':s.get('id'),'glosses':s.get('glosses',[])[:4],
                               'tags':s.get('tags',[]),'form_of':s.get('form_of',[])} for s in senses[:8]],
                    'entry_tags':entry.get('tags',[]),'forms':entry.get('forms',[]),
                    'source_scope':'headword_not_association'}
                row=observation(entry.get('word',''),number,'proper_name' if proper else 'inflected_form' if inflected else 'lemma',
                    entry.get('pos',''),form_of[0] if form_of else entry.get('word',''),details)
                if row:yield row
    elif kind=='unimorph':
        with path.open(encoding=encoding) as stream:
            for number,line in enumerate(stream,1):
                if not line.strip() or line.startswith('#'):continue
                cells=line.rstrip('\r\n').split('\t')
                if len(cells)!=3 or not cells[2].strip():
                    raise ValueError(f'Riga UniMorph non valida: {number}')
                lemma,form,features=cells
                pos=features.split(';',1)[0]
                yield from morphology_observations(form,lemma,pos,number,{
                    'language_claim':'it_from_morphology','features':features,
                    'feature_schema':'UniMorph'})
    elif kind in {'glaffit','flex_it'}:
        opener=bz2.open if kind=='glaffit' else open
        with opener(path,'rt',encoding=encoding,newline='') as stream:
            reader=csv.DictReader(stream,delimiter='\t' if kind=='glaffit' else ',')
            required=({'FORM','FCODE','LEMMA','LCODE'} if kind=='glaffit' else
                      {'Form','Lemma','POS','Freq','Gender','Number','Inf_class'})
            if not required<=set(reader.fieldnames or []):
                raise ValueError(f'Colonne mancanti per {kind}: '+', '.join(sorted(required-set(reader.fieldnames or []))))
            for number,entry in enumerate(reader,2):
                if any(entry.get(key) is None for key in required) or None in entry:
                    raise ValueError(f'Riga {kind} non valida: {number}')
                if kind=='glaffit':
                    yield from morphology_observations(entry['FORM'],entry['LEMMA'],entry['FCODE'],number,{
                        'language_claim':'it_from_morphology','feature_schema':'GRACE',
                        'features':entry['FCODE'],'lemma_features':entry['LCODE'],
                        'lexical_fields':{key:value for key,value in entry.items() if value}},
                        lemma_pos=entry['LCODE'],proper=entry['FCODE'].startswith('Np'))
                else:
                    pos=source.get('pos')
                    if pos not in {'NOUN','ADJ'}:raise ValueError('Flex_it richiede pos NOUN o ADJ nel registro')
                    if not entry['Freq'].isdigit():raise ValueError(f'Frequenza Flex_it non valida, riga {number}')
                    yield from morphology_observations(entry['Form'],entry['Lemma'],pos,number,{
                        'language_claim':'it_from_morphology','frequency':int(entry['Freq']),
                        'gender':entry['Gender'],'number':entry['Number'],
                        'inflection_class':entry['Inf_class'],'source_pos':entry['POS'],
                        'lexical_fields':{key:value for key,value in entry.items() if key and value}})
    elif kind=='wiki_titles':
        with gzip.open(path,'rt',encoding='utf-8') as stream:
            for number,line in enumerate(stream,1):
                word=line.rstrip('\r\n')
                # Un titolo composto non viene spezzato in presunte parole italiane.
                if not SINGLE_WORD.fullmatch(normalize(word) or ''):continue
                row=observation(word,number,'unverified_title',details={
                    'language_claim':'UNVERIFIED_TITLE_ONLY','url':source.get('wiki_base','')+quote(word)})
                if row:yield row
    elif kind=='sitemap_index':
        with path.open(encoding='utf-8') as stream:
            for number,line in enumerate(stream,1):
                item=json.loads(line)
                row=observation(item['word'],number,'dictionary_url_slug',details={
                    'url':item['url'],'language_claim':'UNVERIFIED_DICTIONARY_URL_SLUG',
                    'sitemap':item['sitemap'],'source_slug_not_reconstructed_lemma':True})
                if row:yield row
    elif kind=='conllu':
        with path.open(encoding='utf-8') as stream:
            for number,line in enumerate(stream,1):
                if line.startswith('#') or not line.strip():continue
                cells=line.rstrip('\n').split('\t')
                if len(cells)!=10 or not cells[0].isdigit():continue
                form,lemma,pos=cells[1:4]
                details={'language_claim':'it_treebank_token_not_isolated_language_proof','features':cells[5]}
                row=observation(form,f'{number}:form','proper_name' if pos=='PROPN' else
                    'lemma' if normalize(form)==normalize(lemma) else 'inflected_form',pos,lemma if lemma!='_' else '',details)
                if row:yield row
                if lemma!='_' and normalize(form)!=normalize(lemma):
                    row=observation(lemma,f'{number}:lemma','proper_name' if pos=='PROPN' else 'lemma',pos,lemma,details)
                    if row:yield row
    elif kind=='frequency_text':
        with path.open(encoding=encoding) as stream:
            for number,line in enumerate(stream,1):
                if not line.strip():continue
                cells=line.rstrip('\n').rsplit(None,1)
                if len(cells)!=2 or not cells[1].isdigit():
                    raise ValueError(f'Frequenza non valida, riga {number}')
                row=observation(cells[0],number,'frequency_form',details={
                    'frequency':int(cells[1]),'language_claim':'italian_frequency_list_not_language_proof'})
                if row:yield row
    elif kind=='tei_headwords':
        if source.get('dictionary_source_language')!='it':
            raise ValueError('Il dizionario TEI deve dichiarare italiano come lingua sorgente')
        entry_number=0
        for _,entry in ET.iterparse(path,events=('end',)):
            if entry.tag.rsplit('}',1)[-1]!='entry':continue
            entry_number+=1
            pos=entry.findtext('./{*}gramGrp/{*}pos') or ''
            for number,orth in enumerate(entry.findall('./{*}form/{*}orth'),1):
                language=orth.get('{http://www.w3.org/XML/1998/namespace}lang')
                if language and language not in {'it','ita'}:continue
                text=''.join(orth.itertext()).strip()
                row=observation(text,f'{entry_number}:{number}','lemma',pos,text,{
                    'language_claim':'it_from_dictionary','entry_id':entry.get('{http://www.w3.org/XML/1998/namespace}id'),
                    'translations_imported':False})
                if row:yield row
            entry.clear()
    elif kind=='frequency_csv':
        with path.open(encoding=encoding,newline='') as stream:
            for number,entry in enumerate(csv.DictReader(stream),2):
                row=observation(entry['lemma'],number,'frequency_form',details={
                    'rank':int(entry['rank']),'language_claim':'italian_frequency_list_not_language_proof'})
                if row:yield row
    elif kind=='nvdb_text':
        # Nuovo vocabolario di base (De Mauro): «parola categorie», una voce per riga.
        with path.open(encoding=encoding) as stream:
            for number,line in enumerate(stream,1):
                cells=line.strip().split(None,1)
                if len(cells)!=2:continue
                word,categories=cells
                row=observation(word,number,'lemma',categories,word,{
                    'language_claim':'it_from_lexicon','basic_vocabulary':source.get('list_name','NVdB'),
                    'categories':categories})
                if row:yield row
    elif kind=='xlsx_table':
        # Norme lessicali in un foglio: una parola per riga e le colonne numeriche dichiarate.
        rows=xlsx_rows(path,source.get('sheet',1))
        header=next(rows)
        index={name:i for i,name in enumerate(header)}
        missing={source['word_column'],*source.get('value_columns',{})}-set(index)
        if missing:raise ValueError('Colonne assenti nel foglio: '+', '.join(sorted(missing)))
        pos_map=source.get('pos_map',{})
        for number,cells in enumerate(rows,2):
            cells+=['']*(len(header)-len(cells))
            word=cells[index[source['word_column']]].strip()
            pos=pos_map.get(cells[index[source['pos_column']]].strip(),'') if source.get('pos_column') in index else ''
            values={}
            for column,key in source.get('value_columns',{}).items():
                try:values[key]=float(cells[index[column]])
                except ValueError:values[key]=None
            row=observation(word,number,'lemma',pos,word,{'language_claim':source.get('language_claim','it_from_norms'),**values})
            if row:yield row
    elif kind=='wordnet_tab':
        with path.open(encoding=encoding) as stream:
            for number,line in enumerate(stream,1):
                if line.startswith('#'):continue
                cells=line.rstrip('\n').split('\t')
                if len(cells)<3 or cells[1]!='ita:lemma':continue
                row=observation(cells[2].replace('_',' '),number,'lemma',cells[0].rsplit('-',1)[-1],
                    cells[2].replace('_',' '),{'synset':cells[0],'language_claim':'it_from_lexicon',
                                            'semantic_relations_imported':False})
                if row:yield row
    elif kind=='mythes':
        with path.open(encoding=encoding) as stream:
            first=stream.readline().strip()
            if first.upper() not in {'UTF-8','ISO8859-1','ISO-8859-1'}:
                raise ValueError('Header MyThes non riconosciuto')
            number=1
            for line in stream:
                number+=1;cells=line.rstrip('\n').split('|')
                if len(cells)!=2 or not cells[1].isdigit():raise ValueError(f'Header MyThes errato, riga {number}')
                headword=cells[0]
                row=observation(headword,number,'lemma',details={'language_claim':'it_from_thesaurus'})
                if row:yield row
                for _ in range(int(cells[1])):
                    block=next(stream,None);number+=1
                    if block is None:raise ValueError('Blocco MyThes troncato')
                    synonyms=block.rstrip('\n').split('|')
                    for offset,word in enumerate(synonyms[1:],1):
                        row=observation(word,f'{number}:{offset}','thesaurus_term',synonyms[0],details={
                            'language_claim':'it_from_thesaurus','scope_headword':headword,
                            'association_approved':False})
                        if row:yield row
    else:
        with path.open(encoding=source.get('encoding','latin-1' if kind=='morphit' else encoding)) as stream:
            for number,line in enumerate(stream,1):
                word=line.rstrip('\r\n');pos='';lemma='';role='listed_form';details={}
                if kind=='hunspell':
                    if number==1 and word.isdigit():continue
                    cells=word.split();word=re.split(r'(?<!\\)/',cells[0],maxsplit=1)[0].replace('\\/','/') if cells else ''
                    details={'affix_flags_not_expanded':True,'language_claim':'it_from_spelling_dictionary'}
                elif kind=='morphit':
                    cells=word.split('\t')
                    if len(cells)!=3:continue
                    word,lemma,pos=cells
                    role=('proper_name' if pos.startswith('NPR') else
                          'lemma' if normalize(word)==normalize(lemma) else 'inflected_form')
                    details={'language_claim':'it_from_morphology'}
                elif kind=='wordlist':
                    details={'language_claim':'UNVERIFIED_LIST_MEMBERSHIP'}
                row=observation(word,number,role,pos,lemma,details)
                if row:yield row


def schema_block(section: str, name: str) -> str:
    """Le istruzioni di prompt_inventory_schema.sql fra `-- <section>:<name>` e il segno successivo della sezione."""
    text = (ROOT/'prompt_inventory_schema.sql').read_text(encoding='utf-8')
    start = text.index('-- '+section+':'+name+'\n')
    return text[start:text.index('-- '+section+':', start+1)]


def attestation_block(name: str) -> str:
    return schema_block('attestazioni', name)


# Le voci del vecchio formato (tabella con il rowid, review_status scritto in ogni riga) passano nella tabella di
# prompt_inventory_schema.sql. Niente ALTER TABLE RENAME, che controlla le viste e si fermerebbe su quelle che
# leggono la tabella: le righe passano da una copia temporanea, la tabella si ricrea con lo stesso nome e le
# stesse colonne, e le viste e le chiavi esterne che la nominano restano valide.
TERM_COLUMNS = ('prompt,is_single_word,has_lemma_evidence,has_inflected_evidence,has_proper_name_evidence,'
                'has_it_dictionary_evidence')


def migrate_terms(db) -> bool:
    """Converte le voci del vecchio formato; False se non ce n'è bisogno (formato nuovo o raccolta vuota)."""
    found = db.run('SELECT sql FROM sqlite_schema WHERE name='+literal('inventory_terms')+';',rows=True)
    if not found or 'WITHOUT ROWID' in found[0]['sql'].upper():
        return False
    db.run('PRAGMA foreign_keys=OFF;\nPRAGMA cache_size=-1000000;\nBEGIN IMMEDIATE;\n'
           'CREATE TEMP TABLE terms_copy AS SELECT '+TERM_COLUMNS+' FROM inventory_terms;\n'
           'DROP TABLE inventory_terms;\n'+schema_block('voci','tabella')+
           'INSERT INTO inventory_terms('+TERM_COLUMNS+') SELECT '+TERM_COLUMNS+' FROM temp.terms_copy ORDER BY prompt;\n'
           'DROP TABLE temp.terms_copy;\nCOMMIT;\nPRAGMA foreign_keys=ON;\n')
    if db.schema:
        import unified_db
        unified_db.register_objects(db.schema)
    return True


# Il vecchio formato delle attestazioni (una tabella con i testi dello snapshot, del ruolo e della categoria in
# ogni riga) diventa quello di prompt_inventory_schema.sql. Le tabelle e la vista sono quelle dello schema
# (attestation_block), così un database convertito e uno nuovo sono uguali; qui ci sono solo i dati. I numeri
# degli snapshot seguono l'ordine di acquisizione (uno snapshot sconosciuto va in fondo), quelli dei ruoli e
# delle categorie l'ordine alfabetico. L'indice per prompt si costruisce dopo le righe (è più veloce che
# aggiornarlo riga per riga): la seconda passata delle tabelle, tutte IF NOT EXISTS, crea solo lui.
MIGRATE_ATTESTATIONS_ROWS = '''
DROP INDEX inventory_attestations_by_prompt;
INSERT INTO inventory_snapshot_numbers(snapshot_id)
 SELECT a.snapshot_id FROM (SELECT DISTINCT snapshot_id FROM inventory_attestations) a
 LEFT JOIN inventory_snapshots s ON s.id=a.snapshot_id
 ORDER BY s.acquired_at IS NULL,s.acquired_at,a.snapshot_id;
CREATE TEMP TABLE attestation_kinds AS SELECT DISTINCT role,pos FROM inventory_attestations;
INSERT INTO inventory_attestation_roles(role) SELECT DISTINCT role FROM temp.attestation_kinds ORDER BY role;
INSERT INTO inventory_attestation_pos(pos) SELECT DISTINCT pos FROM temp.attestation_kinds ORDER BY pos;
DROP TABLE temp.attestation_kinds;
'''

# I dettagli JSON di tutte le righe di {source}, con le regole del trigger inventory_attestations_insert
# (prompt_inventory_schema.sql): URL ricostruibile tolto, JSONB, documenti brevi nel dizionario, testo originale
# quando la vista non lo restituirebbe identico. {source} dà snapshot, prompt, locator, role, pos, source_form
# (NULL se uguale alla voce), lemma e il testo originale come original.
COMPACT_DETAILS = '''
CREATE TEMP TABLE attestation_compact AS
 SELECT snapshot,prompt,locator,role,pos,source_form,lemma,
  CASE WHEN exact THEN prefix END AS prefix,CASE WHEN exact THEN doc END AS doc,
  CASE WHEN exact THEN NULL ELSE original END AS original
 FROM (SELECT x.*,(CASE WHEN x.prefix IS NULL THEN json(x.doc)
   ELSE json_replace(x.doc,'$.url',x.pfx||coalesce(x.source_form,x.prompt)) END) IS x.original AS exact
  FROM (SELECT s.*,u.n AS prefix,u.prefix AS pfx,
    jsonb(CASE WHEN u.n IS NULL THEN s.original ELSE json_replace(s.original,'$.url','') END) AS doc
   FROM ({source}) s LEFT JOIN inventory_url_prefixes u
    ON json_extract(s.original,'$.url')=u.prefix||coalesce(s.source_form,s.prompt)) x);
INSERT INTO inventory_attestation_details(doc)
 SELECT DISTINCT doc FROM temp.attestation_compact c WHERE length(doc)<=128
  AND NOT EXISTS(SELECT 1 FROM inventory_attestation_details d WHERE d.doc=c.doc);
INSERT INTO inventory_attestation_rows(snapshot,prompt,locator,role,pos,source_form,lemma,details,own_details,url_prefix)
 SELECT c.snapshot,c.prompt,c.locator,c.role,c.pos,c.source_form,c.lemma,d.n,
  CASE WHEN d.n IS NULL THEN coalesce(c.doc,c.original) END,c.prefix
 FROM temp.attestation_compact c LEFT JOIN inventory_attestation_details d ON length(c.doc)<=128 AND d.doc=c.doc;
DROP TABLE temp.attestation_compact;
'''


def compact_details(source: str) -> str:
    return COMPACT_DETAILS.replace('{source}', source)


OLDEST_ATTESTATIONS = ('SELECT s.n AS snapshot,a.prompt,a.locator,r.n AS role,p.n AS pos,'
    'nullif(a.source_form,a.prompt) AS source_form,a.lemma,a.details_json AS original '
    'FROM inventory_attestations a JOIN inventory_snapshot_numbers s ON s.snapshot_id=a.snapshot_id '
    'JOIN inventory_attestation_roles r ON r.role=a.role JOIN inventory_attestation_pos p ON p.pos=a.pos')


def migrate_attestations(db) -> bool:
    """Converte le attestazioni del vecchio formato; False se non ce n'è bisogno (formato nuovo o raccolta vuota)."""
    kind = db.run('SELECT type FROM sqlite_schema WHERE name='+literal('inventory_attestations')+';',rows=True)
    if not kind or kind[0]['type']!='table':
        return False
    # Il vecchio indice per prompt ha il nome del nuovo: va tolto prima, o CREATE INDEX IF NOT EXISTS lo
    # salterebbe. La cache grande (1 GB) serve all'ordinamento di milioni di righe.
    tables = attestation_block('tabelle')
    db.run('PRAGMA foreign_keys=OFF;\nPRAGMA cache_size=-1000000;\nBEGIN IMMEDIATE;\n'
           'DROP INDEX IF EXISTS inventory_attestations_by_prompt;\n'+tables+MIGRATE_ATTESTATIONS_ROWS+
           compact_details(OLDEST_ATTESTATIONS)+'DROP TABLE inventory_attestations;\n'+tables+
           attestation_block('vista')+'COMMIT;\nPRAGMA foreign_keys=ON;\n')
    if db.schema:
        import unified_db
        unified_db.register_objects(db.schema)
    return True


def migrate_attestation_details(db) -> bool:
    """Le righe con details_json in chiaro (formato del 13/11/2026) passano ai dettagli compatti; False se non serve.

    La tabella si rinomina con legacy_alter_table: la vista che la leggeva è già stata tolta, e il RENAME moderno
    rileggerebbe tutte le viste, fermandosi su quelle che nominano la vista tolta."""
    # Il nome nella forma name=…: è quella che unified_db riscrive con il prefisso dello schema.
    found = db.run('SELECT sql FROM sqlite_schema WHERE name='+literal('inventory_attestation_rows')+';',rows=True)
    if not found or not re.search(r'\bdetails_json\b',found[0]['sql']):
        return False
    tables = attestation_block('tabelle')
    db.run('PRAGMA foreign_keys=OFF;\nPRAGMA cache_size=-1000000;\nPRAGMA legacy_alter_table=ON;\nBEGIN IMMEDIATE;\n'
           'DROP TRIGGER IF EXISTS inventory_attestations_insert;\nDROP TRIGGER IF EXISTS inventory_attestations_delete;\n'
           'DROP VIEW IF EXISTS inventory_attestations;\nDROP VIEW IF EXISTS inventory_attestation_rows_json;\n'
           'DROP INDEX IF EXISTS inventory_attestations_by_prompt;\n'
           'ALTER TABLE inventory_attestation_rows RENAME TO attestation_rows_before_details;\n'+tables+
           'DROP INDEX inventory_attestations_by_prompt;\n'+
           compact_details('SELECT snapshot,prompt,locator,role,pos,source_form,lemma,details_json AS original '
                           'FROM attestation_rows_before_details')+
           'DROP TABLE attestation_rows_before_details;\n'+tables+attestation_block('vista')+
           'COMMIT;\nPRAGMA legacy_alter_table=OFF;\nPRAGMA foreign_keys=ON;\n')
    if db.schema:
        import unified_db
        unified_db.register_objects(db.schema)
    return True


def initialize_inventory(db):
    # Il database operativo può essere ancora vuoto: il primo step non richiede
    # che esistano bacini di associazioni né una revisione editoriale.
    db.path.parent.mkdir(parents=True,exist_ok=True)
    migrate_terms(db)
    migrate_attestations(db)
    migrate_attestation_details(db)
    db.run((ROOT/'prompt_schema.sql').read_text(encoding='utf-8')+
           (ROOT/'prompt_inventory_schema.sql').read_text(encoding='utf-8')+
           (ROOT/'inventory_updates_schema.sql').read_text(encoding='utf-8'))


def write_bulk(path,source,bulk):
    count=0
    with bulk.open('w',encoding='utf-8',newline='') as stream:
        for row in records(path,source):
            word=row['prompt'];role=row['role']
            fields=[word,row['source_form'],row['locator'],role,row['pos'],row['lemma'],
                json.dumps(row['details'],ensure_ascii=False,separators=(',',':')),
                str(int(bool(SINGLE_WORD.fullmatch(word)))),str(int(role=='lemma')),
                str(int(role=='inflected_form')),str(int(role=='proper_name')),
                str(int(row['details'].get('language_claim') in {'it_from_dictionary','it_from_lexicon','it_from_morphology','it_from_thesaurus','it_from_spelling_dictionary'}))]
            if any(FIELD_SEPARATOR in field or RECORD_SEPARATOR in field or '\0' in field for field in fields):
                raise ValueError('Separatore di controllo presente nel testo della fonte')
            stream.write(FIELD_SEPARATOR.join(fields)+RECORD_SEPARATOR);count+=1
    if not count:raise ValueError('Fonte vuota o formato non riconosciuto: nessun inserimento')
    return count


def import_source(db,source,path):
    if source.get('kind') not in KINDS:raise ValueError('Tipo di fonte sconosciuto')
    source_hash=checksum(path)
    snapshot_id=hashlib.sha256((source['id']+'\0'+source_hash).encode('utf-8')).hexdigest()
    if db.run('SELECT id FROM inventory_snapshots WHERE id='+literal(snapshot_id)+';',rows=True):
        return {'source':source['id'],'status':'ALREADY_IMPORTED','sha256':source_hash}
    # Una fonte può essere registrata prima del primo download: solo uno snapshot
    # già acquisito rende questa raccolta un aggiornamento da confrontare.
    if db.run('SELECT id FROM inventory_snapshots WHERE source_key='+literal(source['id'])+' LIMIT 1;',rows=True):
        from inventory_updates import stage_update
        return stage_update(db,source,path)
    with tempfile.TemporaryDirectory(prefix='zerocade-inventory-') as directory:
        bulk=Path(directory)/'attestations.txt'
        count=write_bulk(path,source,bulk)
        if checksum(path)!=source_hash:raise ValueError('La fonte è cambiata durante la lettura')
        sql=['PRAGMA cache_size=-131072;\nBEGIN IMMEDIATE;\n',insert('inventory_sources',{
            'source_key':source['id'],'name':source['name'],'kind':source['kind'],'url':source['url'],
            'license':source['license'],'attribution':source['attribution']},ignore=True),
            insert('inventory_snapshots',{'id':snapshot_id,'source_key':source['id'],'sha256':source_hash,
                'acquired_at':datetime.now(timezone.utc).isoformat(),'cache_path':str(path.resolve()),'records':count,
                'source_config_json':json.dumps(source,ensure_ascii=False)}),
            'CREATE TEMP TABLE inventory_incoming(word TEXT,surface TEXT,locator TEXT,role TEXT,pos TEXT,lemma TEXT,details TEXT,'
            'single_word INTEGER,is_lemma INTEGER,is_inflected INTEGER,is_proper INTEGER,it_evidence INTEGER);\n',
            '.mode ascii\n',
            '.import --ascii --schema temp '+json.dumps(bulk.as_posix())+' inventory_incoming\n',
            "INSERT INTO inventory_terms(prompt,is_single_word,has_lemma_evidence,has_inflected_evidence,has_proper_name_evidence,has_it_dictionary_evidence) "
            'SELECT word,max(single_word),max(is_lemma),max(is_inflected),max(is_proper),max(it_evidence) FROM inventory_incoming GROUP BY word '
            'ON CONFLICT(prompt) DO UPDATE SET '
            'has_lemma_evidence=max(inventory_terms.has_lemma_evidence,excluded.has_lemma_evidence),'
            'has_inflected_evidence=max(inventory_terms.has_inflected_evidence,excluded.has_inflected_evidence),'
            'has_proper_name_evidence=max(inventory_terms.has_proper_name_evidence,excluded.has_proper_name_evidence),'
            'has_it_dictionary_evidence=max(inventory_terms.has_it_dictionary_evidence,excluded.has_it_dictionary_evidence);\n',
            'INSERT INTO inventory_attestations SELECT word,'+literal(snapshot_id)+',locator,role,pos,surface,lemma,details FROM inventory_incoming;\n',
            insert('inventory_source_heads',{'source_key':source['id'],'snapshot_id':snapshot_id}),
            'INSERT INTO inventory_registered_sources(source_key,config_json,enabled) VALUES ('+
            ','.join(literal(v) for v in [source['id'],json.dumps(source,ensure_ascii=False),1])+
            ') ON CONFLICT(source_key) DO UPDATE SET config_json=excluded.config_json;\n',
            'COMMIT;\n']
        db.run(''.join(sql))
    return {'source':source['id'],'status':'IMPORTED','records':count,'sha256':source_hash}


def source_path(source,cache):
    if source.get('local_path'):
        path=Path(source['local_path'])
        if not path.is_absolute():path=ROOT/path
        if not path.is_file():raise FileNotFoundError(path)
        return path
    if source['kind']=='sitemap_index':return collect_sitemap(source,cache)
    name=source.get('cache_file') or source['id']+'/'+source['url'].rsplit('/',1)[-1]
    path=cache/name
    download(source['url'],path)
    if source.get('license_url'):
        download(source['license_url'],cache/source['id']/'SOURCE_LICENSE.txt')
    return path


def collect_sitemap(source,cache):
    """Scarica soltanto sitemap pubbliche del dizionario, non le definizioni."""
    directory=cache/source['id'];directory.mkdir(parents=True,exist_ok=True)
    output=directory/'dictionary_url_slugs.jsonl'
    if output.exists():return output
    queue=[source['url']];seen=set();rows=[];files=[]
    allowed_host=urlparse(source['url']).netloc
    while queue:
        url=queue.pop(0)
        if url in seen:continue
        if len(seen)>=128:raise ValueError('Indice sitemap troppo ampio: raccolta non completata')
        if urlparse(url).scheme!='https' or urlparse(url).netloc!=allowed_host:
            raise ValueError('Sitemap fuori dal dominio dichiarato')
        seen.add(url)
        cached=directory/(hashlib.sha256(url.encode('utf-8')).hexdigest()+'.xml')
        download(url,cached)
        tree=ET.parse(cached);root=tree.getroot()
        links=[element.text for element in root.iter() if element.tag.rsplit('}',1)[-1]=='loc' and element.text]
        files.append({'url':url,'sha256':checksum(cached),'path':str(cached)})
        if root.tag.rsplit('}',1)[-1]=='sitemapindex':queue.extend(links);continue
        if root.tag.rsplit('}',1)[-1]!='urlset':raise ValueError('Formato XML sitemap non riconosciuto')
        for link in links:
            parsed=urlparse(link)
            if parsed.netloc!=allowed_host or not parsed.path.startswith(source['entry_prefix']):continue
            slug=unquote(parsed.path[len(source['entry_prefix']):].strip('/'))
            if slug and '/' not in slug:rows.append({'word':slug,'url':link,'sitemap':url})
    if not rows:raise ValueError('Nessun lemma ricavabile dalle sitemap pubbliche')
    manifest={'source':source,'files':files,'rows':len(rows),'definition_pages_downloaded':0}
    (directory/'sitemap_manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    temporary=output.with_suffix('.jsonl.part')
    with temporary.open('w',encoding='utf-8') as stream:
        for row in rows:stream.write(json.dumps(row,ensure_ascii=False)+'\n')
    temporary.replace(output)
    return output


def status(db):
    counts=db.run('SELECT count(*) AS collected_prompts,sum(is_single_word) AS single_word_candidates,'
        'sum(has_lemma_evidence) AS with_lemma_evidence,sum(has_inflected_evidence) AS with_inflected_evidence,'
        'sum(has_it_dictionary_evidence) AS with_italian_lexical_evidence FROM inventory_terms;',rows=True)[0]
    counts['sources']=db.run('SELECT count(*) AS n FROM inventory_sources;',rows=True)[0]['n']
    counts['attestations']=db.run('SELECT count(*) AS n FROM inventory_attestations;',rows=True)[0]['n']
    counts['decisions']=db.run('SELECT decision,count(*) AS count FROM inventory_term_decisions GROUP BY decision;',rows=True)
    counts['updates']=db.run('SELECT status,count(*) AS count FROM inventory_updates GROUP BY status;',rows=True)
    counts['association_generation_started']=False
    counts['automatic_gameplay_approval']=False
    counts['coverage']='sources_registered_and_imported_not_all_existing_sources'
    return counts


def main(argv=None):
    if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8')
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--db',type=Path,default=DEFAULT_DB)
    ap.add_argument('--sqlite',type=Path)
    sub=ap.add_subparsers(dest='command',required=True)
    collect=sub.add_parser('collect');collect.add_argument('--registry',type=Path,default=REGISTRY)
    collect.add_argument('--cache',type=Path,default=CACHE)
    collect.add_argument('--only',nargs='+',help='ID delle sole fonti da importare o riprovare')
    collect.add_argument('--report',type=Path,default=ROOT/'prompt_inventory_status.json')
    sub.add_parser('status')
    args=ap.parse_args(argv);db=SQLite(args.db,args.sqlite)
    initialize_inventory(db)
    if args.command=='status':print(json.dumps(status(db),ensure_ascii=False,indent=2));return 0
    sources=json.loads(args.registry.read_text(encoding='utf-8'))
    ids=[s['id'] for s in sources]
    if len(set(ids))!=len(ids):raise ValueError('ID fonte duplicati')
    if args.only and set(args.only)-set(ids):raise ValueError('Fonti richieste assenti nel registro')
    results=[]
    for source in sources:
        if args.only and source['id'] not in args.only:continue
        print('Raccolta: '+source['name'],flush=True)
        try:
            path=source_path(source,args.cache)
            result=import_source(db,source,path)
        except Exception as error:
            result={'source':source['id'],'status':'FAILED','error':str(error)}
        results.append(result);print(json.dumps(result,ensure_ascii=False),flush=True)
        # Un rapporto parziale resta disponibile anche interrompendo il processo.
        report={**status(db),'attempts':results,'all_selected_sources_completed':
            len(results)==len([s for s in sources if not args.only or s['id'] in args.only]) and all(r['status']!='FAILED' for r in results)}
        args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    if any(r['status']=='IMPORTED' for r in results):
        # Parole nuove nella raccolta: si aggiornano prompt_filtrati e prompt_validi.
        from review_prompts import after_new_words
        refreshed=after_new_words(db.path)
        if refreshed is not None:print(json.dumps({'refresh':refreshed},ensure_ascii=False),flush=True)
    return 2 if any(r['status']=='FAILED' for r in results) else 0


if __name__=='__main__':raise SystemExit(main())

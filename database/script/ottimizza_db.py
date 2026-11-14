"""Ottimizzazione dei DB SQLite secondo DIRETTIVE.md (ultima sezione): prima le misure, poi gli interventi.

analizza [DB…]  sola lettura. Per ogni DB: pagine libere, integrità, chiavi esterne orfane, le tabelle più
                pesanti con le colonne che pesano di più, e i punti delle direttive con la loro evidenza:
                §1 valori composti, §3 stringhe ripetute da passare a una tabella di lookup, §6 tabelle che
                guadagnano da WITHOUT ROWID (il peso dell'indice in più), §7 tabelle senza chiave né UNIQUE,
                §9 spazio libero da recuperare con VACUUM.
compatta [DB…]  VACUUM e PRAGMA optimize, solo dove le pagine libere superano la soglia (--forza per
                tutti): controllo d'integrità prima e dopo, spazio su disco verificato, dimensioni misurate.

Senza nomi: i .sqlite3 di database/. Il DB della diretta (apps/server/data/zerocade.db) solo se indicato.
La normalizzazione dello schema non si applica da sola: si progetta tabella per tabella, con viste che
conservano i vecchi nomi e il confronto riga per riga prima di sostituire il file. Le colonne derivabili
(§5) e le copie da sostituire con viste (§8) non si riconoscono in automatico: l'analisi le lascia a chi
legge lo schema. Le stime sulle colonne vengono da un campione delle prime righe e lo dichiarano.
"""
from __future__ import annotations

import argparse
from contextlib import closing
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import time

HERE = Path(__file__).resolve().parent.parent
SAMPLE = 100_000
MB = 2**20
# Il sqlite3.exe ufficiale degli strumenti di ZeroAssociazioni (sqlite_prompt_runtime): ha dbstat.
SQLITE_CLI = Path(os.environ.get('LOCALAPPDATA', Path.home()/'.cache'))/'Zerocade/sqlite-3.54.1/sqlite3.exe'


def q(name):
    return '"'+name.replace('"', '""')+'"'


def default_databases():
    return sorted(HERE.glob('*.sqlite3'))


def open_ro(path):
    con = sqlite3.connect(Path(path).resolve().as_uri()+'?mode=ro', uri=True, timeout=5)
    con.row_factory = sqlite3.Row
    return con


def dbstat_sizes(path, exe=SQLITE_CLI):
    """Byte per tabella e indice, da dbstat della riga di comando ufficiale; None se manca."""
    if not exe or not Path(exe).is_file():
        return None
    sql = 'SELECT name, sum(pgsize) AS bytes FROM dbstat GROUP BY name'
    result = subprocess.run([str(exe), '-readonly', '-json', str(path), sql], capture_output=True,
                            text=True, timeout=1800, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    if result.returncode:
        raise RuntimeError('dbstat: '+result.stderr.strip())
    return {r['name']: r['bytes'] for r in json.loads(result.stdout or '[]')}


def tables(con):
    out = []
    for r in con.execute("PRAGMA table_list"):
        if r['schema'] == 'main' and r['type'] == 'table' and not r['name'].startswith('sqlite_'):
            out.append({'name': r['name'], 'without_rowid': bool(r['wr'])})
    return out


def column_sample(con, table, column, rows):
    """Valori di testo nelle prime SAMPLE righe: quanti, quanti distinti, byte medi, quanti composti."""
    # Separatori senza spazio (a|b, a;b, a,b): in una frase «;» e «,» sono seguiti da uno spazio.
    sql = (f'SELECT count(v) n, count(DISTINCT v) d, avg(length(CAST(v AS BLOB))) l, '
           f"sum(substr(v,1,1) NOT IN ('{{','[') AND length(v)<500 AND (instr(v,'|')>0 "
           f"OR v GLOB '*[a-z0-9];[a-z0-9]*' OR v GLOB '*[a-z0-9],[a-z0-9]*')) c, "
           f"sum(substr(v,1,1) IN ('{{','[') AND json_valid(v)) j "
           f'FROM (SELECT {q(column)} v FROM {q(table)} LIMIT {SAMPLE}) WHERE typeof(v)=\'text\'')
    r = con.execute(sql).fetchone()
    return {'sampled': min(rows, SAMPLE), 'text': r['n'], 'distinct': r['d'], 'avg_bytes': r['l'] or 0,
            'composite': r['c'] or 0, 'json': r['j'] or 0}


def analyze_table(con, t, sizes):
    name = t['name']
    columns = con.execute(f'PRAGMA table_xinfo({q(name)})').fetchall()
    pk = [c for c in sorted(columns, key=lambda c: c['pk']) if c['pk']]
    indexes = con.execute(f'PRAGMA index_list({q(name)})').fetchall()
    unique_single = set()
    for ix in indexes:
        if ix['unique']:
            cols = [c['name'] for c in con.execute(f'PRAGMA index_info({q(ix["name"])})')]
            if len(cols) == 1:
                unique_single.add(cols[0])
    rows = con.execute(f'SELECT count(*) FROM {q(name)}').fetchone()[0]
    index_bytes = {ix['name']: (sizes or {}).get(ix['name']) for ix in indexes}
    info = {'table': name, 'rows': rows, 'bytes': (sizes or {}).get(name),
            'index_bytes': sum(v for v in index_bytes.values() if v) if sizes else None, 'findings': [], 'columns': []}
    integer_alias = len(pk) == 1 and pk[0]['type'].upper() == 'INTEGER'
    if not t['without_rowid'] and pk and not integer_alias and rows >= 1000:
        auto = [n for n in index_bytes if n.startswith('sqlite_autoindex_'+name+'_')]
        saving = sum(index_bytes[n] or 0 for n in auto) if sizes else None
        info['findings'].append({'rule': '§6 WITHOUT ROWID', 'saving_bytes': saving,
            'evidence': f'chiave primaria ({", ".join(c["name"] for c in pk)}) in una tabella con rowid: '
                        f'{rows:,} righe e un secondo albero per la chiave'})
    if not pk and not any(ix['unique'] for ix in indexes) and rows >= 1000:
        info['findings'].append({'rule': '§7 UNIQUE', 'saving_bytes': None,
            'evidence': f'{rows:,} righe senza chiave primaria né vincolo UNIQUE: i doppioni non sono impediti'})
    for c in columns:
        if c['hidden'] or not rows:
            continue
        s = column_sample(con, name, c['name'], rows)
        estimate = s['avg_bytes']*rows*(s['text']/s['sampled'] if s['sampled'] else 0)
        if info['bytes']:
            estimate = min(estimate, info['bytes'])  # il campione delle prime righe può sovrastimare
        info['columns'].append({'column': c['name'], 'estimated_bytes': int(estimate)})
        if not s['text']:
            continue
        repeated = (s['text'] >= 1000 and s['distinct'] <= max(50, s['text']//100) and s['avg_bytes'] >= 6
                    and c['name'] not in unique_single and c['pk'] == 0)
        saving = int(estimate*(1-2/s['avg_bytes'])) if s['avg_bytes'] else 0
        if repeated and saving >= MB:
            info['findings'].append({'rule': '§3 lookup', 'column': c['name'], 'saving_bytes': saving,
                'evidence': f'{s["distinct"]:,} valori distinti su {s["text"]:,} nel campione, {s["avg_bytes"]:.0f} '
                            f'byte di media ripetuti in ogni riga'})
        if s['text'] >= 100 and s['json'] >= s['text']*9//10 and estimate >= 50*MB:
            info['findings'].append({'rule': '§1 JSON', 'column': c['name'], 'saving_bytes': None,
                'weight_bytes': int(estimate),
                'evidence': f'documenti JSON in colonna, circa {size(estimate)} su {rows:,} righe: valori composti; '
                            f'i campi ripetuti si possono estrarre in colonne o tabelle di lookup'})
        if s['text'] >= 100 and s['composite'] >= s['text']//2:
            info['findings'].append({'rule': '§1 1NF', 'column': c['name'], 'saving_bytes': None,
                'evidence': f'{s["composite"]:,} valori su {s["text"]:,} nel campione contengono separatori '
                            f'(| ; o virgole senza spazio): forse più valori in una colonna'})
    info['columns'].sort(key=lambda c: -c['estimated_bytes'])
    info['columns'] = info['columns'][:3]
    return info


def analyze(path, exe=SQLITE_CLI, integrity=True):
    path = Path(path).resolve()
    started = time.monotonic()
    sizes = dbstat_sizes(path, exe)
    with closing(open_ro(path)) as con:
        page_size, pages = con.execute('PRAGMA page_size').fetchone()[0], con.execute('PRAGMA page_count').fetchone()[0]
        free = con.execute('PRAGMA freelist_count').fetchone()[0]
        report = {'database': str(path), 'bytes': path.stat().st_size, 'free_bytes': free*page_size,
                  'free_ratio': free/pages if pages else 0, 'table_sizes_measured': sizes is not None}
        report['integrity'] = con.execute('PRAGMA quick_check').fetchone()[0] if integrity else 'non controllata'
        orphans = {}
        for r in con.execute('PRAGMA foreign_key_check'):
            orphans[r[0]] = orphans.get(r[0], 0)+1
        report['foreign_key_violations'] = orphans
        report['statistics'] = bool(con.execute("SELECT 1 FROM sqlite_schema WHERE name='sqlite_stat1'").fetchone())
        report['tables'] = [analyze_table(con, t, sizes) for t in tables(con)]
    findings = []
    if report['free_bytes'] >= 64*MB or report['free_ratio'] >= 0.10:
        findings.append({'rule': '§9 VACUUM', 'saving_bytes': report['free_bytes'],
                         'evidence': f'{report["free_ratio"]:.0%} delle pagine libere'})
    for t in report['tables']:
        findings += [{'table': t['table'], **f} for f in t['findings']]
    report['findings'] = sorted(findings, key=lambda f: -(f['saving_bytes'] or f.get('weight_bytes') or 0))
    report['seconds'] = round(time.monotonic()-started, 1)
    return report


def size(n):
    return 'non misurato' if n is None else f'{n/MB:,.1f} MB'


def print_report(r):
    print(f'\n== {r["database"]}  {size(r["bytes"])}, libere {size(r["free_bytes"])} ({r["free_ratio"]:.0%}), '
          f'integrità {r["integrity"]}, {r["seconds"]} s')
    if r['foreign_key_violations']:
        print('   §2 chiavi esterne orfane: '+', '.join(f'{t} {n}' for t, n in r['foreign_key_violations'].items()))
    if not r['table_sizes_measured']:
        print('   peso delle tabelle non misurato: manca '+str(SQLITE_CLI)+' (lo scaricano gli strumenti di ZeroAssociazioni)')
    heavy = sorted(r['tables'], key=lambda t: -(t['bytes'] or t['rows']))[:8]
    print('   tabelle più pesanti (colonne stimate sul campione):')
    for t in heavy:
        cols = ', '.join(f'{c["column"]} ~{size(c["estimated_bytes"])}' for c in t['columns'])
        print(f'     {size(t["bytes"]):>12}  {t["table"]}  {t["rows"]:,} righe  [{cols}]')
    if not r['findings']:
        print('   nessun punto delle direttive da applicare con evidenza sufficiente')
    for f in r['findings']:
        where = f.get('table', '')+('.'+f['column'] if f.get('column') else '')
        gain = f', guadagno stimato {size(f["saving_bytes"])}' if f['saving_bytes'] else ''
        print(f'   {f["rule"]:<17} {where}: {f["evidence"]}{gain}')


def compact(path, force=False, threshold=0.10):
    path = Path(path).resolve()
    before = path.stat().st_size
    with closing(sqlite3.connect(path, timeout=5)) as con:
        page_size, pages = con.execute('PRAGMA page_size').fetchone()[0], con.execute('PRAGMA page_count').fetchone()[0]
        free = con.execute('PRAGMA freelist_count').fetchone()[0]
        if not force and free*page_size < 64*MB and (not pages or free/pages < threshold):
            return {'database': str(path), 'status': 'SKIPPED', 'bytes': before, 'free_bytes': free*page_size,
                    'reason': 'pagine libere sotto la soglia: VACUUM non recupererebbe spazio significativo'}
        # VACUUM ricostruisce il file in una copia temporanea: serve almeno altrettanto spazio libero.
        for folder in {path.parent, Path(os.environ.get('SQLITE_TMPDIR') or os.environ.get('TEMP') or path.parent)}:
            if shutil.disk_usage(folder).free < before*1.1:
                raise RuntimeError(f'spazio su disco insufficiente in {folder} per ricostruire {path.name}')
        if con.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
            raise RuntimeError(f'{path.name}: controllo d\'integrità fallito, nessun intervento')
        started = time.monotonic()
        try:
            con.execute('VACUUM')
        except sqlite3.OperationalError as error:
            raise RuntimeError(f'{path.name}: {error} (il DB è aperto da un altro programma?)') from error
        con.execute('PRAGMA optimize=0x10002')
        check = con.execute('PRAGMA quick_check').fetchone()[0]
        if check != 'ok':
            raise RuntimeError(f'{path.name}: controllo d\'integrità dopo VACUUM: {check}')
    after = path.stat().st_size
    return {'database': str(path), 'status': 'COMPACTED', 'bytes_before': before, 'bytes_after': after,
            'saved_bytes': before-after, 'seconds': round(time.monotonic()-started, 1)}


def main(argv=None):
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='command', required=True)
    a = sub.add_parser('analizza')
    a.add_argument('databases', nargs='*', type=Path)
    a.add_argument('--json', type=Path, help='salva anche il rapporto completo in JSON')
    a.add_argument('--senza-integrita', action='store_true', help='salta PRAGMA quick_check')
    c = sub.add_parser('compatta')
    c.add_argument('databases', nargs='*', type=Path)
    c.add_argument('--forza', action='store_true', help='anche sotto la soglia delle pagine libere')
    args = ap.parse_args(argv)
    databases = args.databases or default_databases()
    if args.command == 'analizza':
        reports = []
        for db in databases:
            print(f'analisi di {db} …', flush=True)
            reports.append(analyze(db, integrity=not args.senza_integrita))
            print_report(reports[-1])
        if args.json:
            args.json.write_text(json.dumps(reports, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
            print(f'\nrapporto completo: {args.json}')
    else:
        failed = False
        for db in databases:
            try:
                print(json.dumps(compact(db, args.forza), ensure_ascii=False), flush=True)
            except RuntimeError as error:
                failed = True
                print(json.dumps({'database': str(db), 'status': 'FAILED', 'error': str(error)}, ensure_ascii=False), flush=True)
        return 1 if failed else 0
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

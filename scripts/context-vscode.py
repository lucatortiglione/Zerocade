"""Operazioni dei task ZeroContext dalla radice del workspace."""
import argparse
import csv
import json
import os
import subprocess
import sys
import tempfile
from collections import Counter
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GAME = ROOT / 'gioco-zerocontext'
REPORTS = GAME / 'reports'
STANDARD = ROOT / 'database' / 'ZeroContext_Associazioni_Riordino.sqlite3'


def riordino_source():
    local = GAME / 'script' / 'prova_piste_riordino.py'
    if local.is_file():
        return GAME
    trees = subprocess.check_output(['git', 'worktree', 'list', '--porcelain', '-z'], cwd=ROOT)
    for field in trees.split(b'\0'):
        if field.startswith(b'worktree '):
            game = Path(os.fsdecode(field[9:])) / GAME.name
            if (game / 'script' / local.name).is_file():
                return game
    raise ValueError('Serve il codice del pilota Riordino nel workspace o in un worktree Git collegato.')


def run(args, cwd):
    env = dict(os.environ, ZEROCADE_EVAL_DATA_ROOT=str(ROOT), PYTHONUNBUFFERED='1')
    subprocess.run(args, cwd=cwd, env=env, check=True)


def score_sheet(sheet):
    key = json.loads(sheet.with_name('chiave.json').read_text(encoding='utf8'))
    counts = Counter()
    seen = set()
    with sheet.open(encoding='utf-8-sig', newline='') as stream:
        for row in csv.DictReader(stream, delimiter='\t'):
            secret = row['Segreta']
            if secret in seen or key.get(secret) not in ('A', 'B'):
                raise ValueError(f'{sheet}: segreta duplicata o assente dalla chiave: {secret}')
            seen.add(secret)
            vote = row['Preferenza (A/B/pari)'].strip().upper()
            if vote not in ('A', 'B', 'PARI', ''):
                raise ValueError(f'{sheet}: voto non valido per {secret}: {vote}')
            if vote in ('A', 'B'):
                counts['pilota' if vote == key[secret] else 'standard'] += 1
            else:
                counts['pari' if vote else 'da votare'] += 1
    if seen != set(key):
        raise ValueError(f'{sheet}: mancano righe rispetto alla chiave')
    return ', '.join(f'{label} {counts[label]}' for label in ('pilota', 'standard', 'pari', 'da votare'))


def compare(standard, out, pilot=None):
    cmd = ['node', '--import', 'tsx', 'scripts/context-evaluate-clues.ts', '--standard', standard, '--out', out]
    if pilot:
        cmd.extend(['--pilota', pilot])
    run(cmd, ROOT)


def cycle(game, db, rebuild):
    # Pubblica una cartella solo quando tutti i rapporti e il confronto sono pronti.
    REPORTS.mkdir(exist_ok=True)
    stamp = datetime.now().strftime('%Y%m%d_%H%M%S_%f')
    destination = REPORTS / f'pilota_piste_{stamp}'
    with tempfile.TemporaryDirectory(dir=REPORTS) as temp:
        stage = Path(temp)
        output = stage / 'pilota'
        standard = STANDARD
        python = [sys.executable, '-B', '-X', 'utf8']
        if rebuild:
            # Ogni esecuzione possiede i propri intermedi e il proprio export.
            lists = stage / 'riordino.json'
            standard = stage / 'Riordino_standard.sqlite3'
            run([*python, game / 'script/build_context_riordino.py', '--out', lists], game)
            run([*python, game / 'script/esporta_riordino_gioco.py', '--lista', lists, '--out', standard], game)
        cmd = [*python, game / 'script/prova_piste_riordino.py', '--export', standard, '--out', output]
        if db.is_file():
            cmd.extend(['--partite', db])
        else:
            print(f'Archivio tornei assente: {db}. La coda sarà disponibile dopo le prime partite.', flush=True)
        run(cmd, game)
        compare(standard, output / 'confronti_indizi.json', output / 'Riordino_piste.sqlite3')
        if rebuild:
            standard.rename(output / standard.name)
            lists.with_suffix('.report.json').rename(output / 'addestramento.json')
        output.rename(destination)
    print(f'Scheda di voto: {destination / "confronto.tsv"}\nRapporti ed export: {destination}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('azione', choices=('ciclo', 'ricalcola', 'confronti', 'revisioni', 'voti', 'umane'))
    action = parser.parse_args().azione
    db = Path(os.environ.get('ZEROCADE_DB') or ROOT / 'apps/server/data/zerocade.db').resolve()
    if action == 'voti':
        sheets = sorted([*REPORTS.glob('pilota_piste_*/confronto.tsv'), *REPORTS.glob('pilota_umane_*/confronto.tsv')])
        if not sheets:
            print('Nessuna scheda. Esegui il ciclo delle associazioni.')
        for sheet in sheets:
            print(f'{sheet.parent.name}: {score_sheet(sheet)}')
    elif action == 'umane':
        game = riordino_source()
        destination = REPORTS / ('pilota_umane_' + datetime.now().strftime('%Y%m%d_%H%M%S_%f'))
        REPORTS.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=REPORTS) as temp:
            output = Path(temp) / 'pilota'
            run([sys.executable, '-B', '-X', 'utf8', game / 'script/prova_associazioni_umane.py', '--out', output], game)
            compare(STANDARD, output / 'confronti_indizi.json', output / 'Riordino_umano.sqlite3')
            output.rename(destination)
        print(f'Scheda di voto: {destination / "confronto.tsv"}')
    elif action == 'confronti':
        compare(STANDARD, REPORTS / 'confronti_indizi.json')
    elif action == 'revisioni':
        if not db.is_file():
            raise ValueError(f'Archivio tornei assente: {db}')
        run([sys.executable, '-B', '-X', 'utf8', '-m', 'riordino.revisioni', db,
             '--corpus', GAME / 'data'], riordino_source())
    else:
        cycle(riordino_source(), db, action == 'ricalcola')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        sys.exit(str(error))

"""Prepara gli ambienti separati di generazione di ZeroContext."""
from __future__ import annotations

import os
import argparse
from pathlib import Path
import subprocess
import venv

HERE = Path(__file__).resolve().parent.parent


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--profile', choices=('semantic', 'contexts', 'vectors'), default='semantic')
    args = ap.parse_args()
    folder = HERE / f'.venv-{args.profile}'
    python = folder / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
    if not python.exists():
        print(f'Creazione ambiente semantico: {folder}', flush=True)
        venv.EnvBuilder(with_pip=True).create(folder)
    subprocess.run([str(python), '-m', 'pip', 'install', '--disable-pip-version-check',
                    '-r', str(HERE / f'requirements-{args.profile}.txt')], check=True)
    subprocess.run([str(python), '-m', 'pip', 'check'], check=True)


if __name__ == '__main__':
    main()

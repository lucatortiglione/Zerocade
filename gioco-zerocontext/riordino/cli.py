"""python script/build_context_riordino.py --out riordino.json: costruisce le liste riordinate dai candidati della Pipeline B."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import time

import numpy as np

from valutazione import paths, profiles
from valutazione.gold import load_gold
from valutazione.reference import load_reference

from riordino.build import build_lists, gold_first
from riordino.features import Lexicon
from riordino.model import KINDS
from riordino.signals import Signals, hub_scores, reverse_ranks


def cached_hub(profile, folder: Path) -> np.ndarray:
    """La genericità di ogni parola del profilo: costa minuti, quindi si salva (il nome contiene l'impronta dei vettori)."""
    file = folder / f'hub_{profile.name}_{profile.sha256[:12]}.npy'
    if file.exists():
        return np.load(file)
    scores = hub_scores(profile)
    np.save(file, scores)
    return scores


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--out', required=True, help='file JSON {segreta: [parole]} da dare a  valuta --riordino')
    ap.add_argument('--export', default=str(paths.PIPELINE_B), help="l'export della Pipeline B (sola lettura)")
    ap.add_argument('--raw2', default=str(paths.RAW2))
    ap.add_argument('--giochi', default=str(paths.GIOCHI))
    ap.add_argument('--morphit', default=str(paths.MORPHIT))
    ap.add_argument('--top', type=int, default=100, help='parole per segreta')
    ap.add_argument('--vicini', type=int, default=1000, help="ai candidati dell'export aggiunge i N vicini più vicini nei vettori del profilo (0 = solo l'export; standard 1000)")
    ap.add_argument('--profilo', default='original', help='profilo dei vettori per --vicini')
    ap.add_argument('--tipo', choices=KINDS, default='lineare', help='modello: regressione logistica (pesi leggibili) o alberi di decisione a gradiente')
    ap.add_argument('--segnali', action=argparse.BooleanOptionalAction, default=True,
                    help='segnali nuovi: coseno ABTT, genericità, rango inverso, categoria grammaticale (standard: sì; --no-segnali per escluderli)')
    ap.add_argument('--con-associazioni', action='store_true', help='le associazioni verificate di ZeroAssociazioni in cima, per le segrete che le hanno (la misura su di loro non vale più)')
    return ap


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    started = time.time()
    ref = load_reference(Path(args.raw2), Path(args.morphit))
    gold = load_gold(Path(args.giochi))
    signals_for = None
    if args.segnali:
        orig, abtt = profiles.load_published(args.profilo), profiles.load_published('abtt')
        folder = Path(args.out).resolve().parent
        signals_for = lambda found: Signals(ref, orig, abtt, cached_hub(orig, folder), cached_hub(abtt, folder), reverse_ranks(found))
    lists, report = build_lists(Path(args.export), ref, gold, Lexicon.from_raw2(Path(args.raw2)), top=args.top,
                                 profile=profiles.load_published(args.profilo) if args.vicini else None, neighbours=args.vicini, kind=args.tipo, signals_for=signals_for)
    if args.con_associazioni:
        lists = gold_first(lists, gold, ref)
        report['con_associazioni'] = True
    out = Path(args.out)
    out.write_text(json.dumps(lists, ensure_ascii=False) + '\n', encoding='utf-8')
    out.with_suffix('.report.json').write_text(json.dumps(report, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f"{report['segrete_con_lista']} liste in {out} ({time.time() - started:.0f} s); addestramento: {report['segrete_addestramento']} segrete di sviluppo, "
          f"{report['esempi']} esempi, {report['esempi_giusti']} giusti")
    print('pesi:', report['pesi'] or f"(modello {report['tipo_modello']}: nessun peso da leggere)")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

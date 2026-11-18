"""§6.1: trasformazione monotona per segnale (ECDF su un insieme di coppie fisso, separato dal test)."""
from __future__ import annotations

import numpy as np


MAX_KNOTS = 50_000


class ECDF:
    def __init__(self, sample):
        sample = np.asarray(sample, dtype=np.float64)
        sample = np.sort(sample[~np.isnan(sample)])
        if len(sample) > MAX_KNOTS:   # 50.001 quantili bastano e rendono la normalizzazione di ~840.000 parole veloce
            sample = np.quantile(sample, np.linspace(0, 1, MAX_KNOTS + 1))
        self.sample = sample
        if not len(self.sample):
            raise ValueError('campione di calibrazione vuoto')

    def __call__(self, x):
        x = np.asarray(x, dtype=np.float64)
        out = np.searchsorted(self.sample, x, side='right') / len(self.sample)
        return np.where(np.isnan(x), np.nan, out)


class Calibrator:
    """Un ECDF per segnale. `version` finisce nell'audit (`score_calibrator_version`).
    `calibrated=False` indica la normalizzazione di ripiego (non stimata su coppie reali separate dal test)."""

    def __init__(self, samples: dict, version: str, calibrated: bool = True):
        self.ecdf = {k: ECDF(v) for k, v in samples.items() if len(v)}
        self.version = version
        self.calibrated = calibrated

    def normalize(self, signal: str, x):
        x = np.asarray(x, dtype=np.float64)
        return self.ecdf[signal](x) if signal in self.ecdf else np.full(x.shape, np.nan)

    def to_dict(self):
        return {'version': self.version, 'calibrated': self.calibrated,
                'samples': {k: e.sample.tolist() for k, e in self.ecdf.items()}}

    @classmethod
    def from_dict(cls, d):
        return cls({k: np.array(v) for k, v in d['samples'].items()}, d['version'], d.get('calibrated', True))

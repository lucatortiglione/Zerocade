"""Parametri iniziali della specifica (§3-§6): sono una baseline da tarare con il benchmark, non un risultato."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field

SIGNALS = ('embedding', 'pmi_svd', 'conceptnet', 'ppmi_direct')

# §6.1: pesi di partenza per modalità. `balanced` è la baseline; le altre spostano il peso (somma sempre 1).
MODE_WEIGHTS = {
    'balanced': {'embedding': 0.35, 'pmi_svd': 0.30, 'conceptnet': 0.25, 'ppmi_direct': 0.10},
    'similarity': {'embedding': 0.45, 'pmi_svd': 0.35, 'conceptnet': 0.17, 'ppmi_direct': 0.03},
    'association': {'embedding': 0.20, 'pmi_svd': 0.20, 'conceptnet': 0.35, 'ppmi_direct': 0.25},
}

# §5: pesi iniziali delle relazioni; le relazioni negative non sono segnali positivi di vicinanza.
RELATION_WEIGHTS = {'RelatedTo': 1.0, 'Synonym': 1.0, 'UsedFor': 0.9, 'AtLocation': 0.8, 'IsA': 0.75, 'PartOf': 0.8,
                    'HasA': 0.7, 'CapableOf': 0.7, 'HasProperty': 0.7}
NEGATIVE_RELATIONS = frozenset({'Antonym', 'DistinctFrom', 'NotDesires', 'NotCapableOf', 'NotHasProperty', 'NotUsedFor'})
TWO_HOP_FACTOR = 0.4
EDGE_WEIGHT_CAP = 3.0   # il peso dell'arco ConceptNet è troncato qui e riportato su [0,1]
HUB_DEGREE = 200        # nodi con più vicini non fanno da ponte nei cammini a 2 archi (niente hub generici)


@dataclass
class Config:
    window: int = 5                  # §4.1: finestra simmetrica ±5
    min_pair_count: int = 5
    min_target_count: int = 20
    k_shift: float = 1.0
    svd_dim: int = 256
    svd_power: float = 0.5
    context_smoothing: float = 0.75  # context distribution smoothing; 1.0 = nessuno
    top_k: int = 200                 # §6.3
    bge_model: str = 'BAAI/bge-m3'
    bge_representation: str = 'A'    # §3A: A lemma nudo, B contesto stabile
    bge_max_length: int = 64
    high_confidence_families: int = 2
    min_weight_coverage: float = 0.0  # sotto questa copertura il risultato è `degraded`
    seed: int = 0
    mmr_lambda: float = 0.0          # 0 = nessuna diversificazione, 1 = solo rilevanza
    extra: dict = field(default_factory=dict)

    def as_dict(self):
        return asdict(self)

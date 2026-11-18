"""ZeroContext : Associazione Parole — Pipeline A (BGE-M3 + PMI/SVD + ConceptNet + PPMI).

Implementa database/PIPELINE_A_BGE-M3_PMI-SVD_ConceptNet_PPMI_v1.0.md. I quattro segnali sono moduli
indipendenti; `ranker` li fonde senza mai trattare un segnale assente come zero.
"""
VERSION = '1.0.0'
MODEL_ID = 'bge-m3-pmi-svd-conceptnet-ppmi'

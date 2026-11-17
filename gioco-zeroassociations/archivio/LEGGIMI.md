# Archivio: estrazione delle associazioni dalle definizioni

> **Revisione documentale — 16 novembre 2026.** Archivio storico, distinto dalla pipeline dei bacini verificati. I documenti mantengono esempi e versioni del lotto originale, con collegamenti corretti dopo lo spostamento. Per importare i moduli comuni dagli script archiviati, il percorso Python attuale — `gioco-zeroassociations/script`; eventuali moduli tra script storici richiedono anche `archivio/script`.
> [Indice e stato della documentazione](../../docs/STATO_DOCUMENTAZIONE.md).

Prima dei bacini verificati, le associazioni venivano estratte dalle definizioni
del dizionario (lotti da 5.000 prompt, ottobre–novembre 2026). Su 5.000 prompt il
filtro semantico ne ha lasciati 40 completi: il metodo produceva frammenti di
definizione (date, incisi, esempi) che le regole dovevano poi scartare. Il
percorso attuale parte dal concetto e verifica ogni parola prima di inserirla
(vedi il [README](../README.md)).

- `script/`: generatore, filtri, riparazioni e riscritture di quei lotti, con i
  loro test. Importano moduli della cartella principale (`semantic_rules.py`,
  `validate_word_association_it_v3_6_0.py`, `prompt_policy.py`): per rieseguirli,
  lanciarli con `PYTHONPATH` impostato su `gioco-zeroassociations/script` e, quando necessario, `gioco-zeroassociations/archivio/script`.
- `documenti/`: il README del pacchetto v3.6.0 e quello della pipeline di
  estrazione, come erano al 9 novembre 2026.
- `lotti/`: i lotti filtrati e riscritti (`filtered-v3_6_0`, `rewritten-v3_6_0`),
  esclusi da Git per dimensione. Il lotto `generated-v3_6_0` resta nella storia Git.

Niente di questo materiale è caricato dal gioco o importato nel database.

# Valutazione completa di ZeroContext — 14 novembre 2026

Valutati **2.837.376 termini**: tutti i **2.833.072** presenti in
`raw.inventory_terms`, più **4.304** termini ulteriori dalle banche, dal gioco,
dalle frequenze e dalle cache dei vettori. Nessun termine dell'inventario è
rimasto senza esito. Si usano i 46 snapshot attivi, non versioni storiche delle
fonti. Le risorse derivate non contano come prove indipendenti dalla loro origine.

| Esito | Parole |
| --- | ---: |
| Candidate automatiche per segreta, fasce base/comune e vettore disponibile | 6.333 |
| Di cui già segrete nel gioco | 6.323 |
| Nuove candidate automatiche | 10 |
| Riserva estesa, esclusa dalle nuove segrete dal generatore | 2.376 |
| Requisiti lessicali base soddisfatti, ma vettore fastText assente | 28 |
| Segrete attuali da rivedere rispetto ai filtri | 514 su 6.837 |
| Tentativi selezionati con la procedura del generatore | 60.229 |
| Ulteriori tentativi selezionabili rispetto al gioco attuale | 0 |

Le 514 segrete segnalate comprendono **241** parole della fascia estesa e
**273** che non superano gli altri filtri. Di queste ultime, 268 provengono
dalla banca storica Livecade e 5 dalle aggiunte: arca, azoto, bacco, santa e
teletrasporto. Questi esiti indicano discrepanze rispetto ai filtri, non errori
ortografici accertati. Per esempio, frequenza insufficiente o prevalenza di un
altro uso grammaticale possono segnalare anche parole italiane corrette.

## Valutazione delle 10 nuove candidate

La valutazione assistita di queste dieci parole è distinta dai filtri
automatici e conserva nel DB motivazioni, attestazioni e autore della valutazione.

| Parola | Valutazione |
| --- | --- |
| autobiografia | Consigliata: sostantivo autonomo, vicinanze coerenti con biografia e scrittura |
| autrice | Consigliata: sostantivo autonomo, vicinanze coerenti con scrittrice e autore |
| produttrice | Consigliata: sostantivo autonomo, vicinanze coerenti con produttore e produzione |
| ricercatrice | Consigliata: sostantivo autonomo, vicinanze coerenti con studiosa e scienziata |
| studentessa | Consigliata: sostantivo autonomo, vicinanze coerenti con studente e alunna |
| adulta | Da rivedere: uso nominale attestato, ma anche forma aggettivale femminile |
| devota | Da rivedere: distinguere sostantivazione e uso aggettivale |
| premiata | Da rivedere: forma anche participiale e aggettivale |
| raffinata | Da rivedere: forma anche participiale e aggettivale |
| italiana | Non consigliata: gentilizio, categoria indicata dalle esclusioni editoriali |

Le cinque consigliate sono già nel vocabolario dei tentativi e hanno vettori
disponibili. Per ciascuna sono state controllate le 12 vicine nei vettori
effettivi del gioco, senza boost dei collegamenti. Questa verifica qualitativa
non è una misura generale dell'accuratezza semantica di tutta la banca.

## Dove sono gli esiti

DB: `database/parole_ita_raw.sqlite3`, schema logico `raw`.

- `raw__context_evaluation_runs`: input, hash, riepilogo e identificativo.
- `raw__context_evaluation_terms`: un esito per termine ed esecuzione.
- `raw__context_evaluation_codes`: significato dei codici di esito.
- `raw__context_evaluation_results`: vista leggibile con esiti e motivi per
  segreta e tentativo, appartenenza al gioco e copertura dei vettori.
- `raw__context_candidate_reviews`: valutazioni delle 10 nuove candidate.
- `raw__context_candidate_review_results`: vista leggibile delle valutazioni.

Esecuzione automatica: `1`, identificativo
`0c6796818e2df6afef3239820046a16297e2fece3f461de5d764bcce784c84d0`.

File consultabili:

- [Riepilogo e input verificabili](reports/inventory_evaluation.json).
- [Cinque nuove segrete consigliate](reports/recommended_new_secrets.csv).
- [Valutazione delle dieci nuove candidate](reports/new_secret_review.csv),
  [con tutte le prove](reports/new_secret_review.json).
- [Tutte le candidate automatiche](reports/secret_candidates.csv).
- [Segrete attuali da rivedere](reports/current_secrets_review.csv).
- [Riserva estesa](reports/extended_reserve.csv).
- [Parole senza vettore](reports/missing_vectors.csv).

Gli esiti dei tentativi descrivono l'ingresso nel vocabolario con vettore.
La grafia senza accento che coincide con la segreta mantiene la validità
speciale prevista dal gioco, anche senza una voce autonoma nel vocabolario.

## Verifiche

Copertura integrale dell'inventario, chiave unica per parola/esecuzione,
`quick_check` del DB e chiavi esterne delle nuove tabelle regolari.
Superati 58 test pertinenti: 16 per la valutazione completa, 10 per la
valutazione delle importazioni, 21 per l'inventario e 11 per gli aggiornamenti
delle fonti. Gli hash degli input e dei dati di ZeroContext coincidono con quelli
registrati prima dell'analisi.

L'operazione salva valutazioni nel DB di lavoro. Non modifica la banca storica,
le segrete attive, il vocabolario né i vettori del gioco.

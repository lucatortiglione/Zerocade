# Utilità delle nuove parole per i giochi

Valutazione del 14 novembre 2026 sulle **92.653 voci aggiunte** da UniMorph,
GLAFF-IT e Flex_it. La selezione è la differenza esatta rispetto al backup
precedente all'importazione; non comprende tutte le parole già presenti che
hanno ricevuto nuove attestazioni. Flex_it non aveva aggiunto voci nuove.

Il rapporto usa le direttive e gli strumenti delle singole cartelle, conservandone
gli hash insieme alle versioni delle fonti e delle risorse. Le valutazioni di
giocabilità sono distinte dai dati grezzi e dalle approvazioni dei bacini.

## Risultati

**86.230 voci non rispettano il formato di parola singola** richiesto dai giochi.
La maggior parte è composta da più token; altre contengono apostrofi o caratteri
non ammessi. Non vengono spezzate né corrette automaticamente per ricavarne
presunte parole valide.

Le **6.423 parole singole** rimanenti hanno tutte una sola fonte di attestazione
e Zipf 0 in wordfreq 3.1.1. Zero significa che la frequenza non è disponibile nella
risorsa, non che la parola sia necessariamente inesistente. Rimangono disponibili
tutte le analisi morfologiche e i lemmi alternativi.

| Gioco | Esito del lotto |
|---|---|
| **ZeroWordle** | Nessuna nuova soluzione o tentativo ammesso dai criteri attuali: le 1.274 forme singole di 5–8 lettere non hanno le due attestazioni richieste né il riscontro di frequenza previsto dal generatore. |
| **ZeroContext** | Nessuna nuova segreta: mancano i requisiti per sostantivi familiari attestati da più fonti. Nessun nuovo tentativo selezionabile: 6.304 forme non hanno un vettore fastText, 118 superano la lunghezza del vocabolario e l'unica forma restante è fuori dalla fascia di frequenza prevista. |
| **ZeroWords** | Nessuna parola per le griglie principali. **833 forme**, corrispondenti a **800 grafie senza accenti**, sono formabili dalle ruote ricavabili dai semi attuali e passano i vincoli strutturali per un bonus. Tutte richiedono verifica lessicale, avendo una sola fonte e nessuna frequenza. Di queste grafie, 16 sono già nel lessico: le potenziali aggiunte sono **784**. |
| **ZeroAssociazioni** | Nessun prompt o risposta approvato automaticamente. 93 voci hanno una prova formale di lemma di contenuto, ma mancano verifiche di grafia, significato e singola relazione prompt–risposta. 1.217 forme nominali/aggettivali richiedono un'eventuale prova di uso lessicalizzato; 5.113 restano utili soltanto come analisi morfologiche. |
| **ZeroReazioniACatena** | Nessun nodo nuovo pronto: ogni parola della catena deve avere un bacino verificato. Per gli indizi valgono le verifiche di ZeroAssociazioni. |
| **ZeroDubbi** | Nessun uso diretto di un lessico: richiede dilemmi completi con scelte A/B. |
| **ZeroQuizz** | Nessun uso diretto di un lessico: la guida richiede domande di ragionamento, opzioni e una sola risposta difendibile. |

Quattro lemmi verbali (`disordinàre`, `esuarire`, `fifendere`, `torrere`)
raggiungono formalmente la soglia del filtro dei prompt soltanto attraverso
altre forme della fonte. Sono **da verificare per grafia e senso**, non contesti
approvati: la frequenza di una forma omografa non dimostra la familiarità del
verbo o dell'accezione. Non sono stati costruiti o certificati nuovi bacini.

La provenienza non certifica da sola ogni grafia: il lotto include forme come
`caratterisitco`, `caretteristica` e `catostrofico`. Le voci dubbie restano nella
raccolta con i loro esiti, senza passare automaticamente alle banche dei giochi.

## Dove sono i risultati

Nel DB `database/parole_ita_raw.sqlite3`:

- `raw__word_utility_runs`: manifest, direttive, snapshot, versioni e riepilogo;
- `raw__word_utility_results`: una riga per parola e valutazione, con caratteristiche,
  analisi e verdetti distinti per gioco e ruolo.

File consultabili:

- [Riepilogo e provenienza](resources/new_words_utility_20261114.json).
- [Esiti per parola e gioco](resources/new_words_utility_20261114.csv).

Nel CSV gli scarti di formato comuni a tutti i giochi compaiono una sola volta,
con `game=tutti`, per evitare dieci righe identiche per ogni locuzione. Nel DB
restano tutti gli esiti distinti. Le altre parole hanno una riga per gioco e ruolo.

Esempio di consultazione dei potenziali bonus:

```sql
SELECT word, features_json, verdicts_json
FROM raw__word_utility_results
WHERE run_id = (
  SELECT id FROM raw__word_utility_runs ORDER BY evaluated_at DESC LIMIT 1
)
AND json_extract(verdicts_json, '$.zerowords.bonus.status') = 'DA_REVISIONARE_BONUS'
ORDER BY word;
```

## Riprodurre la valutazione

Dalla cartella `gioco-zeroassociations`, nell'ambiente di generazione:

```powershell
.\.venv\Scripts\python.exe -B evaluate_imported_words.py
```

`--baseline`, `--import-report`, `--raw-db` e `--output` permettono di indicare
un altro lotto. Lo script controlla che differenze, conteggi e snapshot coincidano
con l'importazione dichiarata; lo stesso manifest non duplica gli esiti nel DB.

Il valutatore riusa i criteri di `build_wordle_bank.py`, `build_context_bank.py`
e `tools/build_lexicon.py`. Le fonti derivate non contano due volte: GLAFF-IT
condivide la famiglia del Wikizionario italiano; Flex_it quella di Morph-it!.
Per i bonus verifica anche i multinsiemi di lettere dei semi effettivi, non
soltanto la lunghezza. Le regole predefinite dei generatori rimangono quelle
precedenti; la valutazione non modifica le banche attive dei giochi.

# Normalizzazione delle forme delle parole

Regola scelta il **16 novembre 2026**. Il RAW 2.0 conserva tutte le forme originali
nella tabella `parole`. La normalizzazione popola la seconda tabella
**`normalizzata`**, senza cancellare righe da `parole` o approvare associazioni.

## Genere

- Integrare il femminile come forma autonoma soltanto quando manca un equivalente
  maschile dello stesso lemma/significato.
- Se il maschile equivalente è attestato, preferirlo anche se il femminile è più
  frequente. Successivamente confrontare singolare e plurale delle forme maschili.
- Il confronto richiede una relazione morfologica o lessicografica esplicita:
  la somiglianza della desinenza non dimostra equivalenza. `banca` e `banco` non
  vengono accorpati automaticamente.
- Un nome grammaticalmente femminile come `casa` non viene escluso perché termina
  in `a`: serve un vero equivalente maschile per lo stesso significato.
- Se le prove non collegano due lemmi distinti, l'assenza del collegamento non
  certifica l'assenza di un equivalente: la voce resta nel RAW per la revisione
  lessicale/semantica. Questo passaggio non la approva automaticamente per il gioco.

## Numero

- Preferire il plurale soltanto se è più comune del singolare corrispondente.
- Il confronto automatico usa la frequenza Zipf italiana di **wordfreq**, sulle
  singole forme. A parità di frequenza si tiene il singolare.
- Esempio con wordfreq 3.1.1: **stoviglie = 3,15**, **stoviglia = 1,40**.
  La rappresentante è quindi **stoviglie** e la forma meno comune è segnalata.
- Senza maschile equivalente, lo stesso confronto si applica alle forme femminili.
- Le forme invariabili non producono doppioni; le parole con letture incompatibili
  vengono conservate per la revisione, senza escluderle sulla sola desinenza.
- Nei lemmi che cambiano genere al plurale, come `uovo/uova`, si confronta il
  numero: il plurale femminile non è automaticamente una variante femminile
  parallela, anche se una fonte elenca una rara alternativa maschile plurale.
  Il confronto di genere richiede forme parallele; per i nomi con singolare
  esclusivamente maschile e plurale femminile si confrontano le frequenze del numero.
- Le frequenze sono una misura d'uso della forma, non del singolo significato.

## Implementazione e uso

[`canonical_word_forms.py`](../gioco-zeroassociations/script/canonical_word_forms.py)
legge lemma, categoria, genere e numero da Morph-it!, GLAFF, Flex-it, UniMorph,
Universal Dependencies e Wiktionary. Il task verifica gli hash e rilegge i file
originali delle acquisizioni RAW 2.0 già presenti nella cache. I collegamenti
espliciti nelle tabelle di flessione Wiktionary riconciliano anche lemmi distinti,
come `ragazza/ragazzo`. Positivo, comparativo e superlativo restano distinti.

Per i tratti in conflitto si preferiscono Morph-it!/Flex-it, poi UniMorph e
Wiktionary, poi GLAFF, infine le annotazioni contestuali UD. Una riga di lemma
generata dalla fonte non eredita il tag della forma osservata. Un'annotazione
contestuale isolata non trasforma un plurale attestato in una forma invariabile.
Le letture incompatibili della parola da escludere restano da rivedere; una
lettura aggiuntiva della forma conservata non blocca tutta la famiglia.

Il task VS Code **ZeroCade : Normalizzare parole RAW** esegue
[`normalizza_parole_raw_v2.py`](../gioco-zeroassociations/script/normalizza_parole_raw_v2.py):

```powershell
.\gioco-zerocontext\.venv-vectors\Scripts\python.exe -B -X utf8 gioco-zeroassociations/script/normalizza_parole_raw_v2.py --plan
.\gioco-zerocontext\.venv-vectors\Scripts\python.exe -B -X utf8 gioco-zeroassociations/script/normalizza_parole_raw_v2.py
```

`--plan` calcola soltanto il piano. Senza questa opzione il comando crea un backup
e ricostruisce `normalizzata` in una transazione. La tabella
`normalizzazione_esclusioni` conserva parola esclusa, sostituta, motivo, frequenze
e fonti della decisione. Le forme senza prove sufficienti restano disponibili.
Le voci non singole restano presenti con `is_single_word=0`; nessun filtro
editoriale o minimo Zipf viene aggiunto alla selezione di genere e numero.

Rapporto: `gioco-zeroassociations/reports/normalizzazione_raw_2.0.json`.
Backup: `gioco-zeroassociations/database-backups/normalizzata-<data>.sqlite3`.
Le banche già pubblicate dei giochi restano separate da questa lavorazione.

Il task **ZeroCade : Aggiornamento parole RAW** acquisisce tutte le fonti e conserva
le forme originali nel secondo DB `parole_ita_raw_2.0.sqlite3`, tabella `parole`.
La normalizzazione è un passaggio separato di selezione nel nuovo archivio.
Un aggiornamento delle fonti marca il risultato come `da_aggiornare` nei metadati;
rieseguire il task Normalizzare per ricostruire la seconda tabella.
`normalize_words.py` rimane lo strumento storico delle decisioni del vecchio RAW.
Il [catalogo delle fonti](FONTI_PAROLE_RAW.md) elenca provenienza e licenze.

La politica è verificata su fixture isolate e applicata al secondo DB reale.

# I file .sqlite3 di `database/`

Situazione al 13/11/2026: tre file, e tutti servono.

| File | Peso | In Git | A che cosa serve |
| --- | ---: | :---: | --- |
| `giochi.sqlite3` | 11 MB | sì | Il DB dei giochi di parole: uno schema per gioco, letto dal server e dal pacchetto Windows |
| `parole_ita_raw.sqlite3` | 2,3 GB | no | Il DB di lavoro di ZeroAssociazioni: i sei DB storici, uno schema ciascuno |
| `ZeroQuizz.sqlite3` | 7 MB | sì | Il DB di ZeroQuizz: domande e risposte, un gioco a sé (era `gioco-quizzland/data/domande.db`, poi lo schema `quizz` di `giochi.sqlite3`). Lo leggono il server e il pacchetto Windows |

`parole_ita_raw.sqlite3` non è in Git perché supera i 100 MB, il limite di GitHub per un file (`.gitignore`).

## `giochi.sqlite3`

Il DB che i giochi leggono, in sola lettura. Sta in Git e va nel pacchetto Windows (`app\giochi.sqlite3`).

| Schema | Gioco |
| --- | --- |
| `dubbi` | ZeroDubbi |
| `wordle` | ZeroWordle |
| `context` | ZeroContext (le parole; i vettori sono in `gioco-zerocontext/data/vectors.bin`) |
| `associazioni` | ZeroAssociazioni e ZeroReazioniACatena: solo i prompt, le parole (ognuna una volta) e i collegamenti |
| `parole` | ZeroWords |
| `contenuti` | gli altri giochi dell'overlay |

`associazioni`, `parole` e `contenuti` sono copie delle loro origini. Dopo una modifica all'origine si ricopiano
con `python database/giochi.py aggiorna`. Dettagli in [README.md](README.md).

## `parole_ita_raw.sqlite3`

Il DB su cui lavorano gli strumenti di `gioco-zeroassociations` (`unified_db.py`). Prima si chiamava
`zeroassociazioni.sqlite3`. Contiene i sei DB storici, uno schema ciascuno, più lo schema `candidati`:

| Schema | Nome storico del file | Contenuto | Peso |
| --- | --- | --- | ---: |
| `raw` | `prompt_raw.sqlite3` | la raccolta e l'inventario | 2,1 GB |
| `validi` | `prompt_validi.sqlite3` | i prompt validati con le loro parole | 120 MB |
| `scartati` | `prompt_scartati.sqlite3` | 2.733.102 parole scartate, con il motivo | 108 MB |
| `finale` | `prompt_finale.sqlite3` | prompt, parole uniche e collegamenti | 11 MB |
| `filtrati` | `prompt_filtrati.sqlite3` | candidati e filtri automatici | 5 MB |
| `candidati` | (nessuno) | le parole dei filtrati giudicate buoni prompt, vedi sotto | 1 MB |
| `game` | `prompt.sqlite3` | i soli bacini verificati: viste sulle tabelle di `raw` | 0 |

Gli script indicano uno schema con il suo indirizzo, `database/parole_ita_raw.sqlite3#raw` (`unified_db.address`),
la stessa scrittura del server, e leggono e scrivono qui. Il nome storico del file indica ancora lo stesso schema,
perché compare nei metadati e nelle ricevute già scritti, ma i file con quei nomi non esistono più. Da qui
`giochi.py aggiorna associazioni` copia i bacini del gioco, prendendoli dallo schema `validi`.

### Com'è fatto

Il 13/11 il file è passato da 4,4 a 2,3 GB con le stesse righe in ogni tabella (confrontate una per una). Al
posto dei testi ripetuti in milioni di righe ci sono numeri, e le tabelle di prima restano come viste con le
stesse colonne: gli strumenti leggono e inseriscono da lì.

| Vista | Tabelle | Cosa cambia |
| --- | --- | --- |
| `raw.inventory_attestations` | `inventory_attestation_rows`, `inventory_snapshot_numbers`, `…_roles`, `…_pos` | snapshot, ruolo e categoria come numeri; la forma della fonte solo se diversa dalla voce; `WITHOUT ROWID` |
| `scartati.discarded_prompts` | `discarded_rows`, `discarded_reasons` | le 1.470 coppie fase-motivo una volta sola; `WITHOUT ROWID` |
| `game.*` | le tabelle di `raw` | nessuna copia: `prompt_database.py dump` ricrea le viste |

Anche `raw.inventory_terms` è `WITHOUT ROWID`, e `review_status`, sempre `COLLECTED`, è una colonna generata. Gli
strumenti convertono da soli un DB del formato precedente (`prompt_inventory.migrate_attestations` e
`migrate_terms`). La copia di prima è in
`gioco-zeroassociations/database-backups/parole_ita_raw_prima_compattazione_20261113.sqlite3` (4,4 GB).

### Il percorso di una parola

Gli schemi sono le tappe che una parola attraversa prima di arrivare nel gioco. Ogni tappa è più piccola e più
controllata della precedente (numeri al 13/11/2026):

```
raw          milioni di voci raccolte dalle fonti
   │  filtri automatici (una sola parola, lemma, frequenza, nome/verbo/aggettivo, prestiti in lista)
   ▼
filtrati     6.617 parole che passano i filtri, e per ognuna il verbale della revisione del prompt
   │  selezione ragionata secondo le direttive (13/11)
   ▼
candidati    6.586 buoni prompt (67 FLAGGED da decidere, 19 con una nota)
   │  un revisore costruisce e verifica il bacino delle associazioni
   ▼
validi       3.941 prompt con il loro bacino verificato
   │  stessi dati riorganizzati per parola
   ▼
finale       3.941 prompt, 11.752 parole uniche, 58.551 collegamenti
```

| Schema | Domanda a cui risponde | Chi lo produce |
| --- | --- | --- |
| `filtrati` | «Questa parola *potrebbe* fare da prompt?» Solo controlli automatici, più il verbale di revisione con senso e categoria | `filter_prompts.py`, automatico |
| `candidati` | «Questa parola è *davvero* un buon prompt per il gioco?» Un giudizio parola per parola su familiarità, forma e sicurezza | revisione editoriale del 13/11 |
| `validi` | «Quali prompt hanno già le loro associazioni verificate?» Il prompt da solo non basta: serve il bacino | `validated_prompt_database.py sync` |
| `finale` | Gli stessi dati di `validi`, organizzati per parola: ogni parola compare una volta sola, collegata a tutti i prompt in cui è una risposta. Serve per vedere quali parole ricorrono tra più prompt | `final_associations.py build` |

Fuori dalla fila restano:
- `scartati`: le voci respinte, con il motivo; quasi tutte dai filtri automatici;
- `game`: i soli bacini verificati, come viste sulle tabelle di `raw` (sempre aggiornate, nessuna copia). Il gioco
  legge la copia nello schema `associazioni` di `giochi.sqlite3`, presa da `validi`.

In breve:
- `filtrati` e `candidati` sono **parole senza associazioni**: la prima è la selezione automatica, la seconda
  quella ragionata;
- `validi` e `finale` sono **prompt con associazioni**, gli stessi dati in due forme.

Le 2.649 candidate senza bacino sono tutte nella coda della lavorazione `finale_20261110`
(`gioco-zeroassociations/prompt-staging/associations/finale_20261110`). Quando il loro bacino è verificato, entrano
in `validi` con `validated_prompt_database.py sync`, e poi nel gioco con `python database/giochi.py aggiorna
associazioni`.

### Lo schema `candidati`

Creato il 13/11 dentro il DB unico, senza un file storico. Contiene le 6.617 parole di `filtrati.filtered_prompts`,
giudicate una per una secondo le direttive di ZeroAssociazioni:
- §3.7: un senso familiare e riconoscibile;
- §5.1: un lemma canonico, italiano oppure un prestito della lista chiusa;
- §9: la sicurezza contestuale.

| Tabella | Contenuto |
| --- | --- |
| `prompts` | le 6.586 candidate, con lingua, categoria grammaticale e senso della revisione, categoria tematica, frequenza, `has_pool` (3.937 hanno già un bacino), `safety` e `note` |
| `excluded` | le 31 escluse, con il motivo: 10 prestiti fuori lista, 10 poco familiari, 5 varianti di grafia, 5 per sicurezza, 1 forma non canonica |
| `metadata` | criteri, revisore, impronta delle direttive, conteggi |
| `review_queue` (vista) | le 84 voci da guardare: 67 `FLAGGED`, cioè temi delicati da far decidere a una persona (§9), e 19 con una nota (senso registrato da riscrivere, testo con caratteri rovinati, una categoria grammaticale) |

`FLAGGED` non vuol dire escluso: secondo il §9 serve una decisione umana prima di metterle in gioco.

**Tienine una copia di sicurezza fuori dal repository.** Non è in Git e non si ricostruisce più: i sei file da
cui `unified_db.py build` lo creava sono stati cancellati.

## Che fine hanno fatto i vecchi file

Il 13/11 ogni vecchio file è stato confrontato riga per riga con il suo schema. Tutte le 39 tabelle erano uguali,
poi i file sono stati cancellati:

| Vecchio file | Dov'è adesso |
| --- | --- |
| `zeroassociazioni.sqlite3` | è questo stesso file, rinominato `parole_ita_raw.sqlite3` |
| `prompt_raw.sqlite3` | schema `raw` |
| `prompt_scartati.sqlite3` | schema `scartati` |
| `prompt.sqlite3` | schema `game` |
| `prompt_validi.sqlite3` | schema `validi` |
| `prompt_filtrati.sqlite3` | schema `filtrati` |
| `prompt_finale.sqlite3` | schema `finale`. Il file era più recente dello schema (3.941 prompt contro 2.040): prima della cancellazione è stato copiato nello schema |

`prompt.sqlite3`, `prompt_validi.sqlite3`, `prompt_finale.sqlite3` e `prompt_filtrati.sqlite3` erano in Git, nella vecchia posizione
`gioco-zeroassociations/`. Il prossimo commit li registra come cancellati.

## Fuori da questa cartella

| File | Serve ancora? |
| --- | --- |
| `apps/server/data/zerocade.db` | **Sì**: sessioni, eventi, classifiche, voti e progressi della diretta |
| `apps/server/data/content.db` | No: la banca dei giochi ora è lo schema `contenuti`. Il server lo crea solo se quello schema manca |
| `gioco-dilemmi/data/domande.db` | No: è la copia di prima di `dubbi`. Serve solo a `giochi.py build --replace`, a `verify` e a `ZEROCADE_GIOCHI_DB=legacy` |

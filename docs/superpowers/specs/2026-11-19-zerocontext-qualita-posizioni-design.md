# ZeroContext: misurare la qualità delle posizioni

Progetto del 19 novembre 2026. Stato: **da approvare**. Nessun codice scritto.

## 1. Perché

In ZeroContext ogni parola scritta dalla chat riceve una posizione: 1 è la segreta, 2 la più vicina, e così via.
Luca vuole che **le parole che la gente associa alla segreta stiano nei primi 10**, anche quando non sono sinonimi:
con la segreta `cane`, `guinzaglio` deve stare nei primi 10. Forme flesse e categorie grammaticali diverse vanno
bene, purché la parola rimandi alla segreta.

Oggi non succede. Prova a mano del 19 novembre 2026 sui due profili in uso:

| Segreta → parola associata | Originale (FastText + retrofitting, 300) | ABTT (BGE-M3 Italian + ABTT, 1.024) |
| --- | ---: | ---: |
| cane → guinzaglio | 25 | 1.532 |
| cane → osso | 545 | 70.076 |
| pizza → margherita | 45 | 27.672 |
| spiaggia → sabbia | 16 | 1.801 |
| banca → soldi | 46 | 96 |

ABTT mette in cima forme della stessa parola e parole inglesi (`spiaggia` → `beach`, `cane` → `dog`) e sbaglia del
tutto alcune segrete (`sedia` → `pronta`, `ready`, `prepara`). Il collegamento con ZeroAssociazioni che un tempo
faceva salire le parole associate è spento in entrambi i profili (`context__links` vuoto, `link_boost = 0`).

Il profilo da far crescere è **BGE-M3 Italian**, con la pipeline a contesti e retrofitting non ancora eseguita sul
corpus intero. Per sapere se un cambio migliora davvero il gioco serve una misura ripetibile, e qui si costruisce
quella. **Questo progetto non migliora il ranking**: produce il metro con cui lo si migliorerà.

## 2. Cosa si costruisce

1. **Valutatore** (Python): dato un profilo, calcola le metriche su un insieme fisso di segrete e salva i risultati.
2. **Giudice** (Qwen locale): giudica le parole dei primi 20 che i dati verificati non coprono.
3. **Pagina «Qualità posizioni»** nella dashboard: confronto tra profili e revisione a mano di un campione.
4. **Database dei risultati** a parte: `database/ZeroContext_Valutazione.sqlite3`.

## 3. Obiettivi, non obiettivi, anti-obiettivi

**Obiettivi**

- Confrontare originale, ABTT e i profili candidati (anche non ancora pubblicati) con gli stessi numeri sugli stessi dati.
- Coprire le sei metriche chieste: Precision@10, nDCG@20, copertura, categoria grammaticale, accezione, valutazione umana.
- Risultati ripetibili; verdetti già dati mai rifatti.
- Tutto in locale sul PC di Luca.

**Non obiettivi**

- Cambiare vettori, ranking, soglie dei colori, profili o segrete del gioco.
- Scrivere in `database/giochi.sqlite3` o nei file dei vettori.
- Generare associazioni nuove per le segrete che non ne hanno (altro lavoro).
- Mostrare qualcosa nell'overlay o in diretta.

**Anti-obiettivi**: il lavoro è fallito, anche se funziona, se:

- i numeri salgono perché il ranking ha già visto i dati con cui lo si misura;
- il giudice è così permissivo che ogni profilo sembra buono;
- il rapporto non dice su quante segrete valgono i numeri;
- caricare Qwen o i vettori rallenta una diretta in corso.

## 4. I dati, verificati il 19 novembre 2026

### 4.1 Database di riferimento: `database/parole_ita_raw_2.0.sqlite3` (scelta di Luca)

È la fonte per **segrete, lemmi, forme flesse e familiarità**. Non contiene associazioni: quelle restano in
`giochi.sqlite3` (sezione 4.2). Il valutatore lo apre **solo in lettura** e registra in ogni rapporto lo SHA-256 dei
dati letti, perché il database è rigenerato dagli script di normalizzazione.

- **Segrete: `parole_segrete`, 9.905 parole.** Comprendono tutte le 9.513 del gioco più 392 aggiunte il 18 novembre;
  tutte hanno un vettore nel vocabolario del gioco. Tre gruppi:
  - **3.047 ordinarie** (`ordinaria = 1`): superano le soglie di densità e "ponti";
  - **6.858 tenute con deroga** (`deroga = 1`): segrete storiche che non superano le soglie;
  - le 392 aggiunte sono tutte ordinarie e nessuna ha associazioni verificate (tra le aggiunte ci sono anche
    numerali come `sessantasei` e `trentacinquesimo`).
- **Lemmi: `normalizzata`, 140.265 parole** con frequenza e fascia di familiarità (`MOLTO_FAMILIARE`, `FAMILIARE`,
  `POCO_FAMILIARE`, `RARA`).
- **Forme flesse: `normalizzazione_esclusioni`**, che collega ogni forma al lemma tenuto (`sostituita_da`):
  `pizze` → `pizza`, `spiagge` → `spiaggia`, `guinzagli` → `guinzaglio`, `bancaria` → `bancario`.
  **Attenzione:** contiene errori. `cani` → `cano` invece di `cane`. Va quindi incrociata con Morph-it!
  (sezione 6.2), e l'errore va segnalato a chi cura la normalizzazione.
- **Copertura del vocabolario del gioco** (93.928 parole): 38.474 sono lemmi di `normalizzata`, 47.730 forme
  registrate tra le esclusioni (perlopiù forme verbali e plurali), **7.724 assenti del tutto** da raw 2.0. Tra queste
  ci sono parole inglesi e sigle (`about`, `academy`, `abb`, `beach`, `dog`, `ready`, `bank`): sono proprio quelle che
  il profilo ABTT mette in cima.

### 4.2 Gioco e associazioni (`database/giochi.sqlite3`, solo lettura)

- **Segrete del gioco:** 9.513, uguali nei due profili. **Vocabolario:** 93.928 parole.
- **Associazioni verificate** (ZeroAssociazioni, in `giochi.sqlite3`): 3.941 parole-guida e 58.551 collegamenti,
  con un solo senso per parola-guida, descritto da una glossa (es. `cane`: «Animale domestico della specie canina»).
  Categorie: 3.077 sostantivi, 563 verbi, 301 aggettivi.
- **Solo 3.104 segrete su 9.905 (31%) hanno associazioni verificate.** Le altre 6.801 si possono misurare solo con il giudice.
- **La difficoltà non serve come voto:** il 98% dei collegamenti è `unrated` (57.541 su 58.551). I collegamenti
  verificati valgono quindi come sì/no, senza gradi.
- **I gruppi di significato** riuniscono parole quasi equivalenti: per `cane`, `coda` e `scodinzolare` sono nello
  stesso gruppo. Una segreta non deve guadagnare due volte con lo stesso concetto.
- **Le associazioni escludono di proposito i sinonimi in serie:** per `cane`, `gatto` e `cagnolino` non ci sono.
  I vicini per somiglianza vanno quindi al giudice, e l'elenco verificato misura proprio le associazioni.
- **492 parole associate su 11.847 (4%) non sono nel vocabolario:** nessun profilo può dar loro una posizione.
- Il gioco ordina le parole solo per coseno su vettori unitari, senza boost: il valutatore può ripetere lo stesso
  calcolo in Python. Un test lo conferma (sezione 9).

## 5. Approcci considerati

| | Descrizione | Pro | Contro |
| --- | --- | --- | --- |
| A | Solo script Python, revisione su CSV | Rapido, coerente con gli script esistenti | Revisione scomoda |
| **B (scelto da Luca)** | A più una pagina nella dashboard | Revisione comoda, confronto visibile | Lavoro in più su server e React |
| C | Misura dentro il server TypeScript | Identico al gioco per costruzione | Pipeline e Qwen sono in Python: doppio lavoro |

## 6. Come si misura

### 6.1 Insieme di misura e insieme di sviluppo

- Una segreta va nella **misura** se `sha256(parola in UTF-8) mod 5 = 0`, altrimenti nello **sviluppo**.
  La regola non cambia mai e compare in ogni rapporto.
- Chi in futuro migliorerà il ranking (pesi, collegamenti, retrofitting) userà solo lo sviluppo; la misura serve solo
  a controllare. Così il punteggio non può salire per costruzione.
- L'insieme delle segrete è quello di raw 2.0 (9.905). Attese nella misura circa 1.980 segrete: circa 620 con
  associazioni verificate e circa 1.360 senza.
- Ogni metrica si riporta anche per gruppo di raw 2.0: **ordinarie**, **con deroga**, **aggiunte il 18 novembre**.

### 6.2 Che cosa conta come "giusta"

Ogni parola dei primi 20 di una segreta riceve un **voto 0, 1 o 2**, preso dalla prima fonte disponibile:

1. **verdetto di Luca** nella pagina di revisione;
2. **associazione verificata** (o una sua forma flessa): voto 2;
3. **verdetto del giudice**: 2 = rimanda chiaramente alla segreta, 1 = collegamento debole, 0 = no.

Le **varianti della segreta stessa** (`cani` per `cane`, `pizze`, `bancaria` per `banca`) non ricevono voto: non
contano né come successo né come errore, e si riportano a parte con il numero di posti che occupano.
Una parola è variante se raw 2.0 (`normalizzazione_esclusioni`) **o** Morph-it! la riconducono al lemma della segreta,
o a un suo derivato stretto (`bancaria` → `bancario` per `banca`: il criterio esatto dei derivati lo fissa chi
costruisce). Usare le due fonti insieme copre gli errori come `cani` → `cano`. Le forme flesse di un'associazione
verificata (`guinzagli`) contano come l'associazione stessa.

Le **parole assenti da raw 2.0** (sezione 4.1) nei primi 10 si contano a parte: «fuori riferimento».
Passano comunque al giudice, perché alcune sono italiane (`accidente`, `accogli`) e mancano solo dal riferimento.
Nello stesso gruppo di significato vale solo la parola in posizione migliore; le altre non aggiungono punti.

### 6.3 Le metriche

| Metrica | Definizione |
| --- | --- |
| **Precision@10 verificata** | Quota delle prime 10 (varianti escluse) che sono associazioni verificate. Non dipende da Qwen: è un limite inferiore stabile |
| **Precision@10 giudicata** | Quota delle prime 10 (varianti escluse) con voto ≥ 1, usando tutte le fonti del punto 6.2 |
| **nDCG@20** | Guadagno dei voti 0–2 nelle prime 20, diviso per il massimo possibile. Il massimo considera solo le associazioni verificate presenti nel vocabolario |
| **Copertura** | Segrete di raw 2.0 con vettore; segrete con associazioni verificate; associazioni verificate presenti nel vocabolario; quota dei primi 10 «fuori riferimento» |
| **Categoria grammaticale** | Sostantivi, verbi, aggettivi e altro nei primi 10. **Solo informativa, senza punteggio** |
| **Accezione** | Per le segrete con glossa: quota delle prime 10 che il giudice (o Luca) riferisce al senso della glossa |
| **Valutazione umana** | Sul campione: quota di parole dei primi 10 che Luca segna «naturale» |

Due numeri diagnostici, per confronto con le misure storiche del README: **posizione mediana** delle associazioni
verificate e quota entro 10, 100 e 1.000.

Ogni metrica si riporta con il numero di segrete su cui vale e con un intervallo (bootstrap sulle segrete), separata
per misura e sviluppo, e per segrete con e senza associazioni verificate.

## 7. Il giudice Qwen

- Usa lo stesso Qwen locale (llama.cpp) degli strumenti di ZeroAssociazioni, con avvio, chiusura e controllo del
  modello come in `qwen_associations.py` e `local_llm_preflight.py`. Temperatura 0, risposta JSON validata.
- Una richiesta per segreta: la segreta, la glossa se c'è, e l'elenco delle parole da giudicare. Per ogni parola:
  voto 0–2, senso giusto sì/no, motivo breve.
- **Cache**: chiave (segreta, parola, versione del prompt del giudice, modello). Rilanciare non ripete nulla.
  Cambiando prompt o modello i vecchi verdetti restano, ma non si usano più.
- **Controlli automatici del giudice**, a ogni esecuzione, oltre al campione di Luca:
  - **sensibilità**: un campione di associazioni verificate, che il giudice deve votare ≥ 1;
  - **specificità**: coppie con parole prese a caso dal vocabolario, che deve votare 0.
  Il rapporto stampa i due valori. Il confronto con i verdetti di Luca dice se il giudice è affidabile; la soglia si
  fissa dopo il primo campione.
- Qwen giudica solo le parole che non hanno già un voto da Luca o dalle associazioni verificate.
- **Non gira durante una diretta.** Lo script si rifiuta di partire se il server di Zerocade ha una sorgente live collegata.
- Carico atteso: fino a circa 40.000 parole da giudicare per profilo, su 1.980 segrete per 20 parole, al netto di quelle
  verificate. Lo script lavora a lotti ed è riprendibile; la prima esecuzione giudica solo il campione umano.
- I verdetti restano nel database dei risultati: non entrano in nessuna banca di gioco.

## 8. La pagina «Qualità posizioni»

**Campione.** 50 segrete della misura, scelte una volta con seme registrato: 25 con associazioni verificate e 25
senza. Sono uguali per tutti i profili. Per profilo sono circa 500 parole, 20–30 minuti; si possono aggiungere
blocchi da 25 segrete.

**Pagina** (nuova rotta della dashboard, accanto a `/taboo`):

```
Qualità posizioni            Profilo: [Originale ▾]   Ultimo calcolo: 19/11 14:02
┌ Confronto ───────────────────────────────────────────────────────────┐
│               P@10 verif.  P@10 giud.  nDCG@20  Umana   Segrete      │
│ Originale        0,21        0,58       0,44     —       620 / 1.980 │
│ ABTT             0,04        0,19       0,12     —       620 / 1.980 │
└──────────────────────────────────────────────────────────────────────┘
Revisione  12 / 50 segrete                    Verdetti nuovi dopo il calcolo: 34
cane — «Animale domestico della specie canina»
  2 gatto        [naturale] [non naturale] [non so]   Qwen: 2
  3 cagnolino    variante? no                          Qwen: 2
  …
 25 guinzaglio   ✓ verificata
```

I numeri sopra sono finti, solo per mostrare la forma.

- Ogni parola del campione è giudicata una volta sola anche se compare in più profili.
- I verdetti di Luca prevalgono su tutto. Se Qwen non è d'accordo, la riga lo mostra.
- La pagina **non ricalcola** le metriche: mostra quanti verdetti sono arrivati dopo l'ultimo calcolo e il comando
  da lanciare per aggiornarle.

**Server.** Rotte sotto `/api/context/evaluation`: elenco delle esecuzioni con le metriche, campione da rivedere,
invio di un verdetto. Solo l'invio scrive, e solo nella tabella dei verdetti umani. Il controllo d'accesso locale
esistente (`localAccess`, applicato a tutte le richieste) vale già anche per queste rotte.

## 9. Database e file

`database/ZeroContext_Valutazione.sqlite3`, normalizzato secondo le direttive di Luca: chiavi intere, `WITHOUT ROWID`
dove conviene, chiavi esterne, viste con nomi leggibili, `VACUUM` dopo le scritture grandi, WAL e `busy_timeout`
perché lo script e il server lo usano insieme. Contenuto:

- profili valutati (nome, file dei vettori con SHA-256, origine);
- esecuzioni (profilo, versione del valutatore, versione del giudice, data, regola di divisione);
- campione (segrete, seme);
- verdetti del giudice e verdetti di Luca;
- metriche per esecuzione e per segreta.

Fonti lette, tutte in sola lettura: `parole_ita_raw_2.0.sqlite3` (segrete, lemmi, forme), `giochi.sqlite3`
(profili pubblicati, associazioni verificate), Morph-it! già scaricato. Il database dei risultati è l'unico in cui
si scrive: `parole_ita_raw_2.0.sqlite3` è rigenerato dagli script di normalizzazione, e scriverci dalla dashboard
rischierebbe di perdere i verdetti a ogni rigenerazione.

Profili caricabili:
- quelli pubblicati in `giochi.sqlite3` (`context_original`, `context_abtt`);
- un **candidato** dato come file di vettori più vocabolario, per misurare la pipeline BGE-M3 prima di pubblicarla.

Rapporto riassuntivo anche in `gioco-zerocontext/reports/` (JSON e CSV).

## 10. Verifiche richieste

- Metriche su un caso piccolo costruito a mano, con risultati noti (varianti, gruppi, voti mancanti).
- Divisione misura/sviluppo stabile e senza sovrapposizioni.
- Posizioni del valutatore uguali a quelle del server su almeno 20 segrete, per entrambi i profili.
- Cache del giudice: con un giudice finto, una seconda esecuzione non fa nessuna richiesta.
- Rifiuto di partire con una sorgente live collegata.
- Rotte del server con un database di prova (`ZEROCADE_DB` nella cartella temporanea), mai quello vivo.
- Pagina provata nel browser: niente errori in console, screenshot controllato.

## 11. Vincoli

- Windows 11, Node 26, ambienti Python della cartella del gioco.
- `DIRETTIVE.md`: timeout, limiti, nessun SQL costruito da input esterno.
- Al momento della stesura `index.ts`, `ContextAssociationsPanel.tsx` e altri file del server e della dashboard hanno
  **modifiche non committate**, forse di un'altra sessione: controllare `git status` prima di toccarli e non sovrascriverle.
- Testi dell'interfaccia in italiano.

## 12. Lasciato a chi costruisce

- Come riconoscere varianti e forme flesse (Morph-it! è già usato per i plurali, e c'è `canonical_word_forms.py`)
  e da dove prendere la categoria grammaticale delle parole del vocabolario.
- Testo esatto del prompt del giudice, nel rispetto della sezione 7.
- Come lo script capisce che una diretta è in corso (stato delle sorgenti dal server, se acceso); con il server spento
  può partire.
- Nomi delle rotte, collegamento alla pagina nel menu, aspetto definitivo.
- Formato del profilo candidato, in accordo con quello che produce la pipeline A.

## 13. Rischi

- **Le segrete ordinarie favoriscono il profilo originale.** Raw 2.0 le ha scelte con densità e "ponti" calcolati
  sui vettori del profilo originale (rapporto del 18 novembre). Su quelle segrete l'originale parte avvantaggiato:
  per questo i numeri si leggono per gruppo, e il confronto tra profili si fa anche sulle segrete con deroga.
- Raw 2.0 cambia quando si rigenera: un rapporto vale per lo SHA-256 dei dati che ha letto. Se cambia, le metriche
  si ricalcolano e non si confrontano con le vecchie senza dirlo.

- Le metriche verificate valgono solo per un terzo delle segrete; il resto dipende dal giudice.
- Qwen può preferire associazioni "da dizionario" a quelle che scrive la chat: per questo c'è il campione di Luca.
- Con 50 segrete il campione umano ha un margine ampio: serve a controllare il giudice, non a decidere da solo.
- I profili hanno dimensioni diverse: si confrontano solo le posizioni, mai i valori del coseno.

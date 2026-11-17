# ZeroTaboo — Linee guida per le carte v2.2

**Versione:** 2.2 (bozza integrata)  
**Data:** 17 novembre 2026  
**Sostituisce:** `LINEE_GUIDA_CARTE_ZEROTABOO_v2.1.md` (17/11/2026)  
**Fonti dell'integrazione:** v2.1 · `REVISIONE_CRITICA_ZEROTABOO_v2.1_17-11-2026.md` (audit) · note di revisione aggiuntive del 17/11/2026

> **Nota di ricostruzione.** Questa versione è stata redatta senza il testo integrale della v2.1, a partire da quanto ne riporta l'audit. I contenuti della v2.1 che l'audit non cita sono segnalati con **⟦DA V2.1⟧** e vanno riportati prima di dichiarare definitivo il documento. In particolare: le descrizioni delle categorie B, C, F, G, H, K, le coppie di calibrazione originali, eventuali modalità dinamiche non citate e le definizioni originali della scala P.

---

## 0. Come leggere questo documento

**Etichette di stato.** Ogni regola porta un'etichetta:

| Etichetta | Significato |
|---|---|
| **[R]** Regola | In vigore da subito per la produzione e la revisione delle carte. |
| **[P]** Proposta | Riguarda il bot, il regolamento o il prodotto: va confermata sul codice e sulle regole ufficiali prima di attivarla (registro decisioni, Parte 8). |
| **[I]** Ipotesi | Valore numerico iniziale (soglia, quota, finestra), da ricalibrare con i dati di playtest. Non è una certezza statistica. |

**Fonte unica di verità.** Nomi dei campi, enumerazioni e stati sono definiti **solo** nello schema della Parte 6. Le altre sezioni li richiamano senza ridefinirli. I prompt della Parte 5 vanno tenuti allineati allo schema: se cambia lo schema, cambia la versione del prompt.

**Indice**

1. Principi, tono e confini
2. Scheda carta e risposte
3. Categorie e comicità
4. Regole dinamiche
5. Generazione AI e controllo qualità
6. Schema e validazione
7. Live, playtest e telemetria
8. Decisioni e changelog
9. Checklist finale
- Appendice A — Matcher di riferimento (Python)
- Appendice B — Fonti sulle piattaforme

---

# Parte 1 — Principi, tono e confini

## 1.1 Principio

> **La carta deve essere facile da capire, interessante da spiegare, sufficientemente difficile da indovinare e capace di generare comicità senza dipendere da una gag preconfezionata.**

La gag nasce mentre lo streamer spiega. La carta fornisce materiale (una scena, un contrasto, un dettaglio), non battute pronte.

**Tre assi indipendenti, senza compensazione [R]:**

| Asse | Domanda | Chi lo valuta |
|---|---|---|
| **Risolvibilità** | La chat può arrivarci partendo da una spiegazione pulita? | Blind test + playtest |
| **Resa scenica** | Spiegarla genera materiale comico? | Rubrica editoriale + playtest |
| **Sicurezza** | È accettabile per il pubblico e per le piattaforme? | Controlli automatici + revisione umana |

Un FAIL di sicurezza non è compensabile. Una carta molto divertente ma irrisolvibile si scarta. Una carta sicura e risolvibile ma piatta può restare come **carta di ritmo**, se il playtest non la boccia.

**Sei dimensioni della scheda [R].** Ogni carta distingue:

1. **Risposta canonica:** ciò che la chat deve indovinare. Breve, concreta, non ambigua.
2. **Premessa della scena:** il dettaglio comico che orienta l'autore e lo streamer. Non va indovinato.
3. **Categoria primaria:** come il mazzo è organizzato e presentato.
4. **Meccanismi comici:** come può nascere la gag (tag sovrapponibili).
5. **Modalità dinamiche compatibili:** in che forma lo streamer può spiegare.
6. **Validazione e osservazioni:** sicurezza, piattaforme, alias e controesempi, QA, telemetria.

La **comicità effettiva** non è un attributo della scheda: si osserva in live.

## 1.2 Chi vede cosa: il contratto delle viste [P]

Il gioco ha senso solo se la chat non vede la soluzione prima del tempo. Le viste sono quattro:

| Vista | Chi la vede | Contenuto | Non contiene mai |
|---|---|---|---|
| `streamer_private` | Solo lo streamer (dock/finestra separata, **non** una scena del software di streaming) | Risposta canonica, premessa, 5 Taboo, modalità con suggerimento, coda dei casi dubbi, tasti di arbitraggio | — |
| `viewer_public` | Chat e chi guarda la live | Countdown, categoria, modalità attiva, punteggio, stato del round | Risposta, premessa, frasi accettate |
| `viewer_public_taboo` | Chat (solo se `PUBLIC_TABOO` è attivo) | I 5 Taboo, oltre a `viewer_public` | Risposta, premessa |
| `reveal` | Tutti, a fine round | Risposta canonica, Taboo, vincitore, esito | — |

**Regole:**

- **[R]** La risposta canonica non deve comparire su nessuna sorgente catturata dalla live prima del `reveal`. Lo stesso vale per titolo della finestra, nome del file, notifiche e log a schermo.
- **[P]** Se l'overlay pubblico è una pagina web raggiungibile da URL, il dato inviato a quella pagina non deve contenere la risposta, nemmeno nascosta da CSS. Una pagina ispezionabile equivale a uno spoiler.
- **[P] Test anti-spoiler prima di ogni release del bot:** durante un round di prova, catturare tutte le scene pubbliche e cercare la risposta e le sue radici nel testo visibile e nel payload della sorgente pubblica. Zero occorrenze ammesse.

**Taboo pubblici: un compromesso, non solo un rischio [P].** Mostrare i Taboo alla chat:

- **a favore:** la chat può fare da "buzzer" quando lo streamer sbaglia, la trasgressione diventa comica, il pubblico capisce la difficoltà;
- **contro:** i cinque divieti insieme possono suggerire la risposta (leakage).

**Default proposto:** mantenere l'impostazione attuale del regolamento (secondo la v2.1, Taboo pubblici dalla v3.1 del gioco, da confermare sul regolamento), con un vincolo: ogni carta nel pool a Taboo pubblici deve superare il **test solo-Taboo** (§5.4). Le carte che non lo superano restano nel pool a Taboo privati.

## 1.3 Infrazioni Taboo durante la spiegazione [P]

Lo streamer **parla**, non scrive: il bot non legge la sua voce. Prima di qualunque regola sulla penalità serve stabilire chi segnala l'infrazione. Le opzioni, in ordine di affidabilità:

1. **Autodenuncia dello streamer** (tasto rapido o comando): default.
2. **Comando dei moderatori** (`!taboo`), con conferma dello streamer o di un secondo moderatore.
3. **Buzzer della chat** (solo con Taboo pubblici): `!buzz` aggregato. Superata una soglia [I] (es. ≥3 utenti distinti in 10 s), genera un evento `taboo_claim` che lo streamer conferma o respinge. **Mai** una sanzione automatica.
4. **Riconoscimento vocale locale:** fase futura. Al massimo un segnalatore per lo streamer, mai una sanzione automatica.

**Cosa conta come infrazione [P]:** la parola vietata e le sue forme flesse (plurale, femminile, coniugazioni), i composti che la contengono, le parole della risposta canonica e le loro radici. I sinonimi non elencati sono ammessi. La conseguenza (round perso, penalità, nessuna) è **⟦DA REGOLAMENTO⟧**. Ogni infrazione si registra con la sua fonte (`streamer`, `mod`, `chat_buzz`).

## 1.4 Scala del piccante (`spice_level`)

La scala P0–P3 misura **ambiguità e imbarazzo**, non la difficoltà né la comicità. Nella scheda è il campo `spice_level` (0–3), distinto da `difficulty`, dai tag comici e dallo stato di revisione.

| Livello | Definizione operativa | Limiti |
|---|---|---|
| **P0 — Neutro** | Nessuna ambiguità; adatta a qualunque pubblico. | — |
| **P1 — Imbarazzo lieve** | Goffaggini e piccole figuracce sociali, senza allusioni. | Livello massimo per carte con minori o ambiente scolastico. |
| **P2 — Ambiguità leggera** | Un possibile doppio senso può far sorridere, ma la lettura principale è innocente e la carta si spiega bene senza usarlo. | — |
| **P3 — Allusione evidente** | Il doppio senso fa parte del divertimento: mai esplicito, mai volgare, **mai necessario per indovinare**. | Mai due P3 consecutive. Escluse da TikTok per default. |

⟦DA V2.1⟧ Allineare le definizioni con quelle originali della v2.1, se differiscono.

**Regole:**

- **[R]** Il doppio senso non è mai obbligatorio. Una carta P2–P3 deve restare spiegabile e indovinabile per la sua lettura innocente.
- **[R]** Mai due carte P3 consecutive.
- **[I]** Composizione obiettivo di un mazzo standard: P0–P1 ≈ 45%, P2 ≈ 40% (±10), P3 ≈ 15% (±5). Sono **target sperimentali**, non obblighi: non si scarta una carta P0–P1 buona per rientrare nella quota. Si ricalibrano sui dati della Parte 7.
- **[R]** Jackpot e finale possono usare qualunque livello coerente con il mazzo e la piattaforma. "P3 funziona bene come Jackpot" resta un'ipotesi da verificare.

## 1.5 Comicità senza volgarità: le leve

Le leve comiche sono un **catalogo non ordinato**. Nessuna classifica di resa è stata ancora misurata.

| Leva | Come funziona | Esempio |
|---|---|---|
| Dettaglio specifico | Un particolare concreto rende la scena immediata. | Bucce di banana sul pianerottolo |
| Dissonanza intenzione/esito | Volevi fare A, è successo B. | Il "grazie" mandato a tutta l'azienda |
| Personaggio situato | Una figura riconoscibile in una situazione precisa. | L'ospite dell'ultimo caffè |
| Escalation | La situazione peggiora per gradi. | Ogni segnale di congedo ignorato |
| Contrasto di registro | Un tono solenne applicato a una banalità, o il contrario. | Conferenza stampa per un tasto sbagliato |
| Personificazione | Un oggetto con intenzioni. | Il sacco che "si vendica" |
| Figuraccia | Imbarazzo pubblico reversibile. | Inciampare entrando in riunione |
| Assurdo coerente | Premessa assurda con logica interna rigorosa. | Da usare con misura (§3.4) |

**Cautele [R]:**

- La riconoscibilità **varia per community** (età, regione, abitudini). Un riferimento "universale" va verificato nel blind test e nel playtest.
- Evitare scene in cui il centro è l'**umiliazione reale** di qualcuno (es. una proposta di matrimonio rifiutata in pubblico). Preferire figuracce reversibili, autoinflitte o senza vittima identificabile.

**Tre test di resa [R]**, verificati in revisione:

1. **Comprensione immediata:** la scena si capisce in una frase.
2. **Due strategie realmente diverse:** esistono almeno due percorsi di spiegazione che non sono la stessa idea riformulata.
3. **Improvvisazione:** lo streamer può costruire una gag senza dover inventare fatti estranei alla scena.

## 1.6 Confini

**Esclusioni [R]** (FAIL di sicurezza, non riparabile):

- scherno di caratteristiche protette o di condizioni di vulnerabilità (disabilità, malattia, aspetto fisico, orientamento, identità di genere, etnia, religione, povertà);
- violenza reale, autolesionismo, sostanze, sessualità esplicita;
- minori in contesti sessuali, allusivi, umilianti o pericolosi;
- persone reali identificabili: ⟦DA V2.1⟧; default **escluse**.

**Minori e scuola [R].** I minori non sono esclusi in assoluto: scuola, compiti, gite ed esami sono ammessi fino a **P1**, mai come oggetto di allusioni. Questo corregge il "vietati minori" generico del prompt breve della v2.1.

**Criterio di tono.** "Quello che passa in prima serata passa qui" resta come immagine di riferimento, **non** come test di conformità. I test sono quelli di questa Parte e della checklist (Parte 9).

**Scarto o riparazione [R]:**

- FAIL di sicurezza → `rejected`, senza riscritture.
- REVIEW o FAIL non di sicurezza → **una sola** riparazione mirata (`repair_once`), poi di nuovo tutti i controlli. Se fallisce ancora → `rejected`.

Si scarta, non si riformula all'infinito. Le riscritture positive di §2.4 sono riparazioni singole, coerenti con questa regola.

## 1.7 Piattaforme

- **[R]** Queste linee guida sono un **filtro editoriale interno**, non una certificazione di conformità. La conformità dipende anche da come la carta viene giocata in live.
- **[R]** Ogni carta ha un esito di revisione per piattaforma (`platform_reviews`), con `status` (`needs_review`, `approved`, `blocked`), data, revisore, riferimento alla policy consultata e motivo. Il default è `needs_review`, **mai** `approved`. Il vecchio campo booleano `platform_safe` è abolito.
- **[R]** Il bot estrae una carta per una piattaforma solo se `platform_reviews.<piattaforma>.status = approved`.
- **[R]** P3 non è ammessa su TikTok per default (regola prudenziale interna, imposta anche dallo schema). Questo **non** garantisce che P0–P2 siano sempre ammesse.
- **[R]** Twitch e TikTok non sono "più o meno severi": hanno regole diverse e richiedono revisioni distinte.
- **[P]** Quando una piattaforma aggiorna le linee guida, le carte P2–P3 di quella piattaforma tornano a `needs_review`.

---

# Parte 2 — Scheda carta e risposte

## 2.1 Risposta canonica e premessa della scena

**`canonical_answer` [R]:**

- maiuscolo, **1–4 parole piene** raccomandate, al massimo 6 parole in totale [I];
- un solo referente concreto: niente concetti astratti con molte parafrasi possibili;
- la **negazione non deve reggere il significato**. Se è inevitabile (`OSPITE CHE NON VA VIA`), la polarità va codificata nei nuclei (§2.3);
- nessuna ambiguità fra due letture concrete (persona o funzione, oggetto o azione).

**`scene_premise` [R]:** una frase (max ~200 caratteri) con il dettaglio comico. Serve all'autore e allo streamer e **non** va indovinata. Separare risposta e premessa permette spiegazioni ricche senza costringere la chat a digitare frasi lunghe.

| Candidato | Problema | Intervento |
|---|---|---|
| `OSPITE CHE NON SE NE VA` | La negazione è essenziale, molti sinonimi | `OSPITE CHE NON VA VIA` con nuclei a polarità e controesempi espliciti |
| `COLLEGA CHE RISPONDE A TUTTI` | Persona che risponde a chiunque, o tasto della posta? | `RISPONDI A TUTTI`; la gaffe va nella premessa |
| `FRAINTENDERE UN COMPLIMENTO` | Astratto, troppe parafrasi | Trasformarlo in una scena concreta o scartarlo |
| `INVENTARE UNA SCUSA PER ANDARE VIA` | Vale in quasi ogni categoria | Tag `scusa` (§3.1) su una scena concreta |
| `BUSTA DELLA SPAZZATURA CHE SI ROMPE` | Descrittivo ma riconoscibile | Buon candidato: verificare il leakage dei Taboo |
| `TELECOMANDO PERSO` | Chiarissimo, comicità non garantita | Non scartarlo a priori: può essere una buona carta di ritmo |

## 2.2 Le parole Taboo

**Regole [R]:**

1. **Esattamente 5** Taboo, senza duplicati.
2. Nessun Taboo condivide la radice con una parola piena della risposta canonica.
3. Almeno **3 tipi di relazione diversi** fra: `sinonimo`, `iperonimo`, `iponimo`, `parte`, `luogo`, `azione_tipica`, `oggetto_associato`, `persona_tipica`, `conseguenza`, `contesto`.
4. Esistono **almeno due percorsi di spiegazione puliti** (verificati con il blind test, §5.4).
5. Un Taboo di più parole vieta la **locuzione**, non le singole parole, salvo indicazione esplicita.
6. Con Taboo pubblici, i cinque insieme non devono "comporre" la risposta (test solo-Taboo, §5.4).

**Controllo delle radici a più livelli [R].** Lo stemmer è un **segnalatore**, non un giudice:

1. normalizzazione (minuscole, accenti, apostrofi);
2. lemma e categoria grammaticale;
3. varianti morfologiche note (plurali, femminili, coniugazioni, clitici);
4. stemmer come segnale di sospetto;
5. conflitto o dubbio → `REVIEW` umano.

Un conflitto rilevato al livello 2–3 è FAIL. Uno rilevato solo dallo stemmer è REVIEW.

## 2.3 Validazione delle risposte della chat [P]

Il controllo basato sulla sola presenza di lemmi è **abolito**. `answer_core: ["ospite", "andare"]` accetterebbe "l'ospite se ne va", cioè l'opposto della risposta. Il nuovo campo `answer_validation` contiene:

- `accepted_phrases`: varianti testate, accettate per somiglianza;
- `rejected_counterexamples`: frasi sbagliate ma vicine, rifiutate esplicitamente;
- `cores`: uno o più **nuclei alternativi**. Ogni nucleo è un insieme di gruppi di forme (forma esatta, oppure prefisso con `*`) che devono comparire tutti, con un vincolo di **polarità** su uno dei gruppi (`required`, `forbidden`, `any`);
- `max_tokens`: lunghezza massima del messaggio considerato.

**Sequenza di valutazione di un messaggio:**

| Passo | Controllo | Esito |
|---|---|---|
| 0 | Messaggio vuoto o più lungo di `max_tokens` (default 10 [I]) | `IGNORED` |
| 1 | Normalizzazione: minuscole, accenti, punteggiatura, emoji, lettere ripetute ("viaaaa" → "via") | — |
| 2 | Somiglianza ≥ 0,92 [I] con un controesempio, **a parità di negazioni** | `REJECT` |
| 3 | Somiglianza ≥ 0,90 [I] con una frase accettata, **a parità di negazioni** | `ACCEPT` |
| 4 | Un nucleo completo con polarità rispettata | `ACCEPT` |
| 4b | Nucleo completo ma polarità violata (e nessun altro nucleo valido) | `REJECT` |
| 5 | Somiglianza fra 0,80 e 0,90 [I] con una frase accettata | `DOUBT` → arbitraggio |
| 6 | Nucleo parziale | `NO_MATCH` (registrato come "vicino", nessun feedback pubblico) |
| 7 | Altrimenti | `NO_MATCH` |

"A parità di negazioni" vuol dire che due frasi che differiscono per un *non*, *mai*, *nessuno*, *niente*, *nulla* o *senza* non sono mai considerate simili, anche se lo sono le stringhe. Senza questo vincolo "l'ospite vuole andare via" risulterebbe simile al 92% a "l'ospite non vuole andare via".

**Esempio di nuclei per `OSPITE CHE NON VA VIA`:**

```json
"cores": [
  { "groups": [["ospit*", "invitat*"], ["va", "vanno", "andar*", "andr*", "usc*", "esc*"]],
    "negation": "required", "polarity_group": 1 },
  { "groups": [["ospit*", "invitat*"], ["rest*", "riman*", "rimast*", "ferm*"]],
    "negation": "forbidden", "polarity_group": 1 }
]
```

| Messaggio | Esito | Perché |
|---|---|---|
| l'ospite non se ne va | ACCEPT | Frase accettata |
| invitato che rimane tutta la sera | ACCEPT | Nucleo 2 senza negazione |
| l'ospite vuole andare via | REJECT | Polarità: simile al 92% a una frase accettata, ma con negazioni diverse |
| OSPITEEEE CHE NON VA VIAAAA | ACCEPT | Normalizzazione |
| l'ospite se ne va | REJECT | Controesempio (in assenza: polarità del nucleo 1) |
| un ospite andrà via | REJECT | Polarità: nucleo 1 senza negazione |
| l'ospite non resta | REJECT | Controesempio (in assenza: polarità del nucleo 2) |
| ospite | NO_MATCH | Nucleo parziale |

**Regole sui prefissi [R].** Un prefisso con `*` deve avere almeno 3–4 lettere e non deve catturare parole comuni estranee: `buc*` catturerebbe "bucce", meglio le forme esatte `buca`, `bucata`. Le forme brevi (`va`, `tutti`) si scrivono sempre esatte.

**Arbitraggio dei casi dubbi [P]:**

- un `DOUBT` va nella coda privata dello streamer, che lo accetta o lo rifiuta con un tasto;
- il round continua. Se arriva un `ACCEPT` automatico, la chiusura del round **attende** la risoluzione dei `DOUBT` con timestamp anteriore (timeout di arbitraggio 10 s [I], poi rifiuto);
- se lo streamer accetta un `DOUBT`, il punto va all'autore di quel messaggio con il suo **timestamp originale**. Il bot non inventa un vincitore alternativo e non riordina gli eventi;
- vince il messaggio convalidato con il timestamp più basso.

**Anti-spam [P]:**

- messaggi oltre `max_tokens` ignorati: impedisce di "pescare" il nucleo scrivendo liste di parole;
- cooldown per utente fra due tentativi validi: 2 s [I];
- limite opzionale di tentativi per utente per round: ⟦DECISIONE APERTA⟧.

**Più piattaforme in contemporanea [P].** Le latenze di Twitch e TikTok sono diverse: confrontare i timestamp fra piattaforme favorisce sistematicamente una delle due. Default proposto: **classifiche separate per piattaforma**. In alternativa, una compensazione fissa misurata. ⟦DECISIONE APERTA⟧

**"Fuochino" [P].** Feedback pubblico sui tentativi vicini: **disattivato**. Può rivelare troppo e alterare la competizione. Si riconsidera solo dopo un test A/B e una decisione di regolamento.

**Banco di prova del matcher [R]:**

- per ogni carta da approvare: tutte le `accepted_phrases` devono dare `ACCEPT` e nessun `rejected_counterexamples` deve dare `ACCEPT` (controllo A-004);
- per le carte del pilota: almeno **10 risposte positive plausibili** e **10 negative difficili** (negazioni, sinonimi, refusi, messaggi lunghi, frasi di significato opposto);
- falsi positivi e falsi negativi si misurano **separatamente**. Criterio di rilascio [I]: **zero falsi positivi** sulle negative, falsi negativi ≤ 20%. Un falso positivo assegna punti alla persona sbagliata ed è molto più grave di un falso negativo, che lo streamer può recuperare con l'arbitraggio.

L'implementazione di riferimento è nell'**Appendice A**.

## 2.4 Coppie di calibrazione

Ogni esempio di calibrazione riporta: risposta canonica, premessa, 5 Taboo con relazione, due spiegazioni pulite reali, frasi accettate, controesempi.

⟦DA V2.1⟧ Migrare le coppie originali del §8 della v2.1 in questo formato, aggiungendo a ciascuna test negativo, due spiegazioni, Taboo verificati e 3–5 risposte non accettabili.

### Esempio 1 — `OSPITE CHE NON VA VIA` (casa, P1, medium)

- **Premessa:** l'ospite ignora ogni segnale che la serata è finita e propone sempre un ultimo caffè.
- **Taboo:** invitato (sinonimo) · casa (luogo) · uscire (azione tipica) · divano (oggetto associato) · tardi (contesto)
- **Spiegazione A:** «Sono le due di notte, hai già messo il pigiama, lavato i piatti e spento metà delle luci, e lui è ancora lì che dice: dai, l'ultimo caffè.»
- **Spiegazione B:** «È il contrario di chi scappa da una festa senza salutare: questo saluta da tre ore ma non si alza mai.»
- **Accettate:** ospite che non se ne va · l'invitato resta troppo · l'ospite non vuole andare via
- **Controesempi:** l'ospite se ne va · l'invitato è già uscito · un ospite deve andare · ospite che non resta

### Esempio 2 — `RISPONDI A TUTTI` (lavoro, P0, medium)

*Riscrittura di `COLLEGA CHE RISPONDE A TUTTI`: la gaffe passa nella premessa, la risposta diventa la funzione.*

- **Premessa:** un collega preme per sbaglio il tasto che invia la risposta a tutta l'azienda.
- **Taboo:** email (contesto) · ufficio (luogo) · messaggio (oggetto associato) · inviare (azione tipica) · sbaglio (conseguenza)
- **Spiegazione A:** «Volevi scrivere solo al capo che la riunione era inutile, e invece l'hanno letto in quattrocento, compreso il capo del capo.»
- **Spiegazione B:** «È quel pulsante, proprio accanto a quello giusto, che fa arrivare il tuo grazie a ogni singola persona dell'azienda.»
- **Accettate:** rispondi a tutti · rispondere a tutti · reply all
- **Controesempi:** collega che non risponde mai · rispondere al capo · collega che risponde male

*Nota:* in una prima stesura la spiegazione B conteneva "tutta", che condivide la radice con "TUTTI": violazione. È il tipo di errore che il controllo X-001 deve intercettare.

### Esempio 3 — `BUSTA DELLA SPAZZATURA CHE SI ROMPE` (casa, P0, easy)

- **Premessa:** il sacco troppo pieno cede sulle scale, davanti alla vicina.
- **Taboo:** sacchetto (sinonimo) · rifiuti (iperonimo) · pattumiera (oggetto associato) · scale (luogo) · puzza (conseguenza)
- **Spiegazione A:** «Scendi di corsa, è l'ultimo giro prima del camion, e a metà strada senti un crack: adesso il pianerottolo è decorato con bucce di banana e fondi di caffè.»
- **Spiegazione B:** «Quella cosa nera di plastica che riempi troppo per non fare due viaggi, e che si vendica proprio davanti alla vicina.»
- **Accettate:** busta della spazzatura che si rompe · sacco della spazzatura rotto · sacchetto dell'immondizia che si rompe
- **Controesempi:** busta della spesa · buttare la spazzatura · busta che non si rompe

Le schede JSON complete di questi esempi superano lo schema della Parte 6 e il banco di prova del matcher dell'Appendice A.

---

# Parte 3 — Categorie e comicità

## 3.1 Modello a due livelli [R]

Le categorie della v2.1 mescolano ambientazioni (casa, lavoro, scuola), tipi di bersaglio (oggetti, personaggi) e strutture comiche (equivoci, scuse, assurdo). Non formano quindi una tassonomia omogenea. La v2.2 le tiene separate:

| Livello | Campo | Cardinalità | Uso |
|---|---|---|---|
| **Categoria** | `category_id` | Una sola per carta | Organizzazione del mazzo, UI, bilanciamento |
| **Tag comici** | `humor_primary`, `humor_tags` | Uno prevalente + max 3 | Varietà comica, statistiche |
| **Tag di comportamento** | `behavior_tags` | 0–n | Strutture trasversali (`equivoco`, `scusa`) |
| **Playlist** | (catalogo esterno) | — | Selezioni tematiche costruite dai tag, mostrabili come "categoria speciale" |

La lettera (A, B, …) è un **codice di presentazione** (`display_code`) derivato dal catalogo: non si scrive mai a mano nella carta. L'identificatore stabile è `category_id`.

## 3.2 Catalogo delle categorie

| Codice | `category_id` | Nome | Tipo | Stato v2.2 |
|---|---|---|---|---|
| A | `figuracce` | Figuracce | Residuale | Attiva |
| B | ⟦DA V2.1⟧ | ⟦DA V2.1⟧ | ⟦DA V2.1⟧ | Attiva |
| C | ⟦DA V2.1⟧ | ⟦DA V2.1⟧ | ⟦DA V2.1⟧ | Attiva |
| D | `oggetti` | Oggetti | Tematica | Attiva |
| E | `personaggi` | Personaggi | Tematica | Attiva |
| F | ⟦DA V2.1⟧ | ⟦DA V2.1⟧ | ⟦DA V2.1⟧ | Attiva |
| G | ⟦DA V2.1⟧ | ⟦DA V2.1⟧ | ⟦DA V2.1⟧ | Attiva |
| H | ⟦DA V2.1⟧ | ⟦DA V2.1⟧ | ⟦DA V2.1⟧ | Attiva |
| I | `lavoro` | Lavoro *(nome da verificare)* | Ambiente | Attiva |
| J | `assurdo` | Assurdità | Residuale | Attiva |
| K | ⟦DA V2.1⟧ | ⟦DA V2.1⟧ | ⟦DA V2.1⟧ | Attiva |
| L | `scuola` | Scuola & Esami | Ambiente | Attiva (max P1) |
| — | — | ex M — Equivoci & Malintesi | → tag `equivoco` + playlist | Non è una categoria |
| — | — | ex N — Scuse Improbabili & Alibi | → tag `scusa` + playlist | Non è una categoria |
| O | `cibo` | Cibo & Disastri a Tavola | Ambiente | **Pilota prioritario** |
| P | `casa` | Casa, Ospiti & Convivenza | Ambiente | **Pilota prioritario** |
| Q | `negozi` | Negozi, Clienti & Situazioni | Ambiente | **Pilota prioritario** |
| R | `trasporti` | Trasporti, Code & Disavventure | Ambiente | **Pilota prioritario** |
| S | `cerimonie` | Cerimonie, Feste & Occasioni | Ambiente | Sperimentale (sovrapposizione con E, F) |

**M e N [R].** Un equivoco o una scusa possono avvenire ovunque: sono motori narrativi, non ambienti. Diventano tag e possono comparire in live come **playlist tematiche** ("Round degli equivoci"). Se il playtest mostra che il pubblico le percepisce come categorie intuitive, possono tornare categorie visibili con una decisione registrata (Parte 8).

**Versionamento della tassonomia [R].** Il catalogo ha una propria versione. Una categoria disattivata non si cancella: le carte e la telemetria storica la mantengono.

## 3.3 Regola di assegnazione [R]

Se più categorie sono plausibili, si segue quest'ordine di precedenza:

1. **Ambiente dominante:** dove o in quale contesto sociale avviene la scena (lavoro, scuola, cibo, casa, negozi, trasporti, cerimonie e gli ambienti A–L ⟦DA V2.1⟧).
2. **Bersaglio tematico:** se l'ambiente è irrilevante e il bersaglio è un oggetto o una figura → `oggetti` o `personaggi`.
3. **Residuali:** `figuracce` (figuraccia senza ambiente dominante) e `assurdo`.

**Spareggio:** si sceglie la scena che la chat immagina per prima. Se resta il dubbio, decide l'editor e annota una riga in `category_rationale`. Le sfumature secondarie vanno nei tag, non in una seconda categoria.

*Esempio:* `FINTA TELEFONATA IMPORTANTE` per uscire da una riunione → `lavoro` + tag `scusa`. La stessa scena a cena da amici → `casa` + tag `scusa`.

## 3.4 Tag comici

Gli otto tag sono **etichette editoriali sovrapponibili**, non una classificazione disgiunta: mescolano esiti (figuraccia), strutture temporali (escalation) e tecniche retoriche (personificazione, contrasto).

`dettaglio_specifico` · `dissonanza` · `personaggio_situato` · `escalation` · `contrasto` · `personificazione` · `figuraccia` · `assurdo_coerente`

⟦DA V2.1⟧ Allineare i nomi con quelli del §12 della v2.1, se differiscono.

**Regole [R]:**

- `humor_primary` = il meccanismo prevalente; è quello usato nelle statistiche.
- `humor_tags` = max 3, incluso il prevalente.
- **Esempi negativi:** non tutto ciò che è imbarazzante è `figuraccia` (serve un pubblico che assiste); `assurdo_coerente` richiede una logica interna esplicita, non solo stranezza; `escalation` richiede almeno due gradini riconoscibili.
- Se più del 40% [I] delle carte di un lotto riceve lo stesso tag prevalente, il lotto va in revisione per varietà.

## 3.5 Anti-ridondanza [R]

- Risposta canonica normalizzata identica a una carta esistente (stesso `answer_hash`) → **FAIL** (D-001).
- Somiglianza semantica (embedding) sopra soglia [I] → **REVIEW** (D-002), non scarto automatico: due carte vicine possono avere scene molto diverse.
- Massimo 3 [I] carte per scena-tipo nello stesso mazzo (es. tre varianti di "ospite molesto").

## 3.6 Pilota delle nuove categorie

- **[R]** Si campionano prima **carte diverse** (12–20 bersagli non ridondanti per categoria [I]), poi **giocate distribuite** fra sessioni, difficoltà, modalità e dimensioni della chat.
- **[R]** Si analizza **ogni carta**, non solo la media di categoria: una categoria non va giudicata da poche carte scelte male.
- **[R]** I risultati si presentano con intervalli di incertezza. Con 30 giocate indipendenti e un tasso osservato del 50%, l'incertezza al 95% è circa ±18 punti percentuali, ed è ancora maggiore se le giocate dello stesso streamer sono correlate.
- **[R]** Il pilota si decide con un periodo prolungabile, non con una soglia automatica. Ordine di adozione: O/P/Q/R, poi eventuali playlist M/N, infine S.
- **[I]** Le nuove carte pesano il 15–20% delle estrazioni durante il pilota.

---

# Parte 4 — Regole dinamiche

## 4.1 Principio [R]

Una modalità cambia la **forma della spiegazione**, mai la risposta, i Taboo o la validazione. Le modalità si dividono in tre famiglie:

| Famiglia | Cosa cambia | Esempi |
|---|---|---|
| **Ruoli narrativi** | Chi sta parlando | Telecronista, avvocato difensore, documentarista |
| **Vincoli comunicativi leggeri** | Il formato del discorso | Conferenza stampa, finto spot, spiegazione istituzionale |
| **Eventi di gioco** | Le regole del round | **Non introdotti in v2.2**: richiedono una decisione di regolamento |

## 4.2 Catalogo delle modalità

| `mode_id` | Famiglia | Suggerimento nel pannello | Rischio principale |
|---|---|---|---|
| `telecronista` | Ruolo | «Spiega come in una telecronaca sportiva» | Ritmo alto, Taboo detti di getto |
| `avvocato_difensore` | Ruolo | «Difendi il bersaglio davanti alla giuria» | Ritmo simile a `interrogatorio` |
| `interrogatorio` | Ruolo | «Spiega come un detective che interroga» | Ritmo simile a `avvocato_difensore` |
| `documentarista` | Ruolo | «Racconta come un documentario sulla natura» | Lentezza |
| `critico_gastronomico` | Ruolo | «Recensisci il bersaglio come un piatto» | Funziona solo con bersagli "assaggiabili" |
| `conferenza_stampa` | Vincolo | «Annuncio ufficiale ai giornalisti» | Tono monotono se la carta è statica |
| `finto_spot` | Vincolo | «Vendilo in uno spot di 20 secondi» | Tende a sembrare una lista di pregi |
| `spiegazione_istituzionale` | Vincolo | «Comunicato del Ministero» | Linguaggio burocratico che rallenta |

⟦DA V2.1⟧ Aggiungere le altre modalità della v2.1, con famiglia e rischio.

**[R]** `avvocato_difensore` e `interrogatorio` non vanno estratti nella stessa sessione a meno di 5 round di distanza [I].

## 4.3 Compatibilità carta–modalità [R]

- Ogni valutazione ha un `rating` (`excellent`, `usable`, `avoid`) e una **motivazione concreta** (max 120 caratteri): perché quella modalità produce, o non produce, una gag con questa carta.
- Una modalità non valutata equivale ad `avoid`.
- **Non serve che ogni carta sia compatibile con due modalità.** Solo le carte del **pool dinamico** devono avere almeno **una** modalità `excellent`. Le altre restano nel pool normale.
- Meglio una modalità che genera una gag naturale di due compatibilità solo nominali.

## 4.4 Esecuzione in live [P]

| Aspetto | Regola |
|---|---|
| Inizio | La modalità si annuncia all'apertura del round, in entrambe le viste |
| Durata | Tutto il round |
| Taboo | Restano validi, identici |
| Risposta e validazione | Invariate |
| Timeout | Invariato [I]; un eventuale bonus di tempo è ⟦DECISIONE APERTA⟧ |
| Pannello streamer | Nome della modalità + suggerimento di una riga |
| **Via di fuga** | Lo streamer può abbandonare la modalità (tasto o `!normale`): il round prosegue normale, si registra `mode_abandoned`, **nessuna penalità** |

## 4.5 Estrazione

- **[R]** Si estrae una coppia carta–modalità con rating `excellent` o, in mancanza, `usable`. Mai `avoid`.
- **[R]** Mai la stessa modalità in due round consecutivi.
- **[I]** Frequenza dei round dinamici: uno ogni 3–4 round.
- **[R]** Il tasso di abbandono per coppia carta–modalità (Parte 7) è il primo segnale per declassare un rating.

---

# Parte 5 — Generazione AI e controllo qualità

## 5.1 Ruoli separati [R]

Il modello che genera una carta conosce già la soluzione: le sue spiegazioni possono sembrare chiare solo a posteriori. Per questo i ruoli sono separati:

| Ruolo | Chi | Riceve | Produce |
|---|---|---|---|
| **Generatore** | LLM | Brief di slot (categoria, P, quantità), regole, leve comiche | `candidates` + `self_rejected`. **Mai** "idonei", mai punteggi |
| **Validatore automatico** | Codice | La scheda | Esiti codificati `PASS/REVIEW/FAIL` (§5.3) |
| **Blind tester** | LLM in chiamata separata, contesto pulito, preferibilmente un modello diverso dal generatore | Solo le spiegazioni, oppure solo i Taboo | Tentativi di risposta (§5.4) |
| **Assistente di revisione** (opzionale) | LLM | Scheda + esiti dei controlli + blind test, **senza** autovalutazioni del generatore | Rubrica motivata e proposta di azione |
| **Editor** | Umano | Tutto | Decisione finale: `approve`, `repair_once`, `reject` |

**Protocollo di isolamento [R]:** ogni ruolo LLM è una chiamata indipendente, senza cronologia condivisa, con input passati da una **whitelist di campi**. Il blind tester non riceve mai risposta canonica, premessa, categoria, tag, modalità o punteggi.

**Seconda revisione [I]:** per le carte P2–P3, se possibile, un secondo revisore umano.

## 5.2 Ciclo di vita della carta [R]

```
draft → auto_checked → blind_tested → approved → active
            │               │            │
            └──── repair_once (una volta) ┘
                         │
                     rejected

active ⇄ temporarily_disabled → retired
```

| Transizione | Chi | Condizione |
|---|---|---|
| `draft → auto_checked` | Validatore | Nessun FAIL automatico |
| `auto_checked → blind_tested` | Blind tester | Test eseguiti e registrati |
| `blind_tested → approved` | Editor | `explanation_result ≠ fail`, rubrica ≥ soglie (§5.6), decisione `approve` |
| `* → repair_once` | Editor | Primo REVIEW/FAIL non di sicurezza; `repair_count` passa a 1 |
| `repair_once → auto_checked` | Validatore | Si ripetono **tutti** i controlli |
| `* → rejected` | Validatore o editor | FAIL di sicurezza, oppure secondo fallimento dopo una riparazione |
| `approved → active` | Editor | Inserita in un mazzo pubblicato con almeno una piattaforma `approved` |
| `active → temporarily_disabled` | Streamer/mod (segnalazione safety) | **Immediato** per le estrazioni successive |
| `temporarily_disabled → active` / `retired` | Editor | Dopo la revisione della segnalazione |

Ogni transizione si registra in `status_history` (stato, data, autore, nota).

## 5.3 Controlli automatici

| Codice | Controllo | Esito |
|---|---|---|
| **S-001** | Parola o locuzione in blocklist | FAIL |
| **S-002** | Corrispondenza per prefisso con la blocklist, non coperta da eccezione documentata | REVIEW |
| **S-003** | `spice_level ≥ 2` con `category_id = scuola` | FAIL |
| **T-001** | Numero di Taboo ≠ 5 o Taboo duplicati | FAIL |
| **T-002** | Taboo con radice della risposta: lemma/variante → FAIL; solo stemmer → REVIEW | FAIL / REVIEW |
| **T-003** | Meno di 3 tipi di relazione distinti | REVIEW |
| **A-001** | Risposta canonica oltre 6 parole | REVIEW |
| **A-002** | Negazione nella risposta canonica senza un nucleo con vincolo `required`/`forbidden` | FAIL |
| **A-003** | Meno di 3 frasi accettate o 3 controesempi (per `approved`) | FAIL |
| **A-004** | Una frase accettata non dà `ACCEPT`, o un controesempio dà `ACCEPT` | FAIL |
| **A-005** | Prefisso `*` più corto di 3 lettere | FAIL |
| **X-001** | Una spiegazione contiene un Taboo o una radice della risposta | FAIL per quella spiegazione; la carta ne richiede 2 pulite |
| **D-001** | `answer_hash` già presente | FAIL |
| **D-002** | Somiglianza semantica sopra soglia | REVIEW |
| **M-001** | Carta destinata al pool dinamico senza modalità `excellent` | REVIEW |
| **P-001** | `spice_level = 3` con TikTok `approved` | FAIL (imposto anche dallo schema) |
| **Z-001** | Scheda non valida rispetto allo schema | FAIL |

**Blocklist [R].** Il prefisso è un segnalatore: ogni eccezione (whitelist) si documenta con motivo e data, e non annulla i controlli di contesto. Le corrispondenze per prefisso si rivedono periodicamente per misurare i falsi positivi.

## 5.4 Blind test

**Test A — spiegazioni [R].** Il tester riceve una spiegazione alla volta e propone fino a 3 risposte. Le risposte passano dal matcher (Appendice A).

| Esito | Condizione |
|---|---|
| `pass` | Entrambe le spiegazioni portano a un `ACCEPT` entro i 3 tentativi |
| `review` | Ci porta una sola spiegazione |
| `fail` | Nessuna delle due |

**Test B — solo-Taboo [R se Taboo pubblici, altrimenti `not_applicable`].** Il tester riceve solo i 5 Taboo (e la categoria, se è pubblica in live) e propone 3 risposte.

| Esito | Condizione |
|---|---|
| `pass` | Nessun `ACCEPT` |
| `review` | `ACCEPT` al 2° o 3° tentativo |
| `fail` | `ACCEPT` al 1° tentativo → la carta resta nel pool a Taboo privati |

**Limiti [R].** Un LLM non è una chat di Twitch: il blind test è un **filtro minimo**, non una prova di giocabilità. Le carte che lo superano devono comunque passare il playtest. Ogni esecuzione registra modello, versione del prompt, data e tentativi.

## 5.5 Prompt

Tre prompt distinti e versionati. Il formato di output segue lo schema della Parte 6: se lo schema cambia, aumenta la versione del prompt.

### `prompt_ideazione@2.2.0`

```text
Sei l'autore di carte per ZeroTaboo, un gioco in live: lo streamer spiega a voce
un bersaglio senza dire 5 parole vietate, la chat prova a indovinarlo scrivendo.
La carta deve essere facile da capire, interessante da spiegare, abbastanza
difficile da indovinare, e dare materiale comico senza contenere battute pronte.

SLOT: categoria={category_id} ({descrizione}), spice_level={P}, quantità={N}
Livelli P: {definizioni Parte 1.4}
Leve comiche (non ordinate): {elenco Parte 1.5}
Confini: {elenco Parte 1.6}. I minori sono ammessi solo in contesti innocui, max P1.

Per ogni candidato:
- canonical_answer: 1–4 parole piene, concreta, un solo referente. Evita che il
  significato dipenda da una negazione; se è inevitabile, codificala nei cores.
- scene_premise: una frase con il dettaglio comico (non va indovinata).
- taboo: esattamente 5, ciascuno con relation; almeno 3 relazioni diverse;
  nessuno con la radice di una parola della risposta.
- explanations: 2 spiegazioni con strategie davvero diverse, senza Taboo e senza
  radici della risposta.
- answer_validation: almeno 5 accepted_phrases, almeno 5
  rejected_counterexamples (includi negazioni e significati opposti), cores con
  vincolo di polarità.
- humor_primary, humor_tags (max 3), spice_level, difficulty.
- mode_compatibility: solo modalità con una ragione concreta; rating
  excellent/usable/avoid.
- failure_modes: 1–3 modi in cui la carta potrebbe fallire in live.

Scarta tu stesso le idee deboli e mettile in self_rejected con il motivo.
Non assegnare punteggi e non dichiarare nessuna carta idonea o approvata.
Rispondi solo con JSON: {"candidates": [...], "self_rejected": [{"canonical_answer": "...", "reason": "..."}]}
```

### `prompt_revisione@2.2.0` (assistente opzionale)

```text
Sei un revisore editoriale di ZeroTaboo. Ricevi una scheda carta, gli esiti dei
controlli automatici e del blind test. Non hai visto il ragionamento del
generatore e non devi fidarti delle sue scelte.

Valuta con la rubrica (1–3, con motivazione di una frase per voce):
- solvability: la chat ci arriva da una spiegazione pulita?
- scenic.hook: la scena offre un appiglio comico immediato?
- scenic.strategies: esistono due strategie di spiegazione davvero diverse?
- scenic.improvisation: lo streamer può costruire una gag senza inventare fatti?
Segnala: rischi di tono, ambiguità della risposta, leakage dei Taboo, frasi
accettate mancanti, controesempi mancanti, categoria o tag discutibili.
Proponi un'azione: approve | repair_once (con la modifica precisa) | reject.
La decisione finale spetta all'editor umano.
Rispondi solo con JSON.
```

### `prompt_blind_test@2.2.0`

```text
Stai giocando a indovinare una parola o una breve espressione italiana.
Qualcuno l'ha descritta così:
"{spiegazione}"
Proponi fino a 3 risposte, dalla più probabile alla meno probabile, brevi come
le scriverebbe una persona in una chat. Rispondi solo con JSON:
{"guesses": ["...", "...", "..."]}
```

Per il test solo-Taboo si sostituisce la spiegazione con: *«Le parole che chi spiega non può usare sono: {5 Taboo}. Prova a indovinare comunque.»*

**Esecuzione [R]:** dove il modello lo supporta, l'output è vincolato a schema; segue sempre la validazione dopo la decodifica. Se l'output non è strutturalmente valido si ripete **una sola volta**, poi si registra l'errore.

## 5.6 Rubrica di revisione

I pesi 30/25/20/15/10 e le soglie 80/90 della v2.1 sono **sostituiti** da una rubrica ancorata a esempi. Risolvibilità e resa scenica restano separate e non si compensano.

| Voce | 1 — Insufficiente | 2 — Adeguato | 3 — Forte |
|---|---|---|---|
| **solvability** | Il blind test fallisce o servono indizi esterni | Ci si arriva con una delle due spiegazioni | Ci si arriva con entrambe, per strade diverse |
| **scenic.hook** | Nessun appiglio: si spiega solo come definizione | Una situazione riconoscibile | Un dettaglio che fa sorridere già in premessa |
| **scenic.strategies** | Una sola strategia, il resto sono riformulazioni | Due strategie, una debole | Due o più strategie forti |
| **scenic.improvisation** | Lo streamer deve inventare fatti | Spazio limitato | Ampio margine di recitazione |

**Approvazione [I]:** `solvability ≥ 2` **e** nessuna voce scenica = 1, **oppure** `solvability = 3` con scenica bassa, approvata esplicitamente come **carta di ritmo**. Quando due carte sono vicine, si sceglie con un confronto diretto, non con la somma dei punteggi.

## 5.7 Produzione e tracciabilità [R]

- 3 candidati per slot (slot = categoria × livello P), come nella v2.1.
- Ogni carta registra in `provenance`: origine, modello generatore, versioni dei prompt, versione del validatore, data.
- Si registrano i motivi di esclusione (`self_rejected`, FAIL, `rejected`) per migliorare i prompt.
- Lotti diversificati: quote note per categoria, incluse le categorie del pilota.

---

# Parte 6 — Schema e validazione

## 6.1 Tre oggetti distinti [R]

| Oggetto | Contenuto | Dove vive |
|---|---|---|
| **Scheda editoriale** | La carta con tutti i campi di revisione (schema §6.2) | Repository delle carte |
| **Scheda di runtime** | Sottoinsieme esportato per il bot: id, versione, risposta, Taboo, `answer_validation`, categoria, P, modalità, stati piattaforma | Mazzo pubblicato |
| **Telemetria** | Eventi e riepiloghi di giocata (Parte 7) | Log/DB del bot |

La scheda di runtime si **genera** dalla scheda editoriale e non si modifica a mano. Il mazzo pubblicato contiene solo carte `active`.

## 6.2 JSON Schema della carta (v2.2)

Lo schema è la fonte unica di verità per campi, enumerazioni e vincoli condizionali. Le regole che JSON Schema non riesce a esprimere (es. "almeno 3 relazioni distinte", "radici dei Taboo") sono controlli del validatore (§5.3).

Vincoli condizionali principali:

- `blind_tested`, `approved` e `active` richiedono `blind_test`;
- `approved` e `active` richiedono `editor_review` con decisione `approve`, `answer_hash`, blind test `pass` o `review`, almeno 3 frasi accettate, 3 controesempi e 1 nucleo;
- `spice_level = 3` impedisce `platform_reviews.tiktok.status = approved`;
- un esito di piattaforma `approved` o `blocked` richiede data e revisore;
- un nucleo con `negation` `required` o `forbidden` richiede `polarity_group`.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "zerotaboo/card-2.2.json",
  "title": "ZeroTaboo — scheda carta v2.2",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schema_version", "card_id", "card_version", "canonical_answer", "scene_premise",
    "category_id", "difficulty", "spice_level", "taboo", "explanations",
    "answer_validation", "humor_primary", "humor_tags", "mode_compatibility",
    "platform_reviews", "editorial_status", "provenance"
  ],
  "properties": {
    "schema_version": { "const": "2.2" },
    "card_id": { "type": "string", "pattern": "^ztb_[0-9]{6}$" },
    "card_version": { "type": "integer", "minimum": 1 },
    "canonical_answer": { "type": "string", "pattern": "^[A-ZÀÈÉÌÒÙ' ]+$", "minLength": 3, "maxLength": 60 },
    "answer_hash": { "type": "string", "pattern": "^[0-9a-f]{16,64}$" },
    "scene_premise": { "type": "string", "minLength": 10, "maxLength": 200 },
    "category_id": { "type": "string", "pattern": "^[a-z][a-z0-9_]*$" },
    "category_rationale": { "type": "string", "maxLength": 200 },
    "difficulty": { "enum": ["easy", "medium", "hard"] },
    "spice_level": { "type": "integer", "minimum": 0, "maximum": 3 },
    "taboo": {
      "type": "array", "minItems": 5, "maxItems": 5, "uniqueItems": true,
      "items": { "$ref": "#/$defs/taboo_word" }
    },
    "explanations": {
      "type": "array", "minItems": 2, "maxItems": 4,
      "items": { "type": "string", "minLength": 20, "maxLength": 400 }
    },
    "answer_validation": { "$ref": "#/$defs/answer_validation" },
    "humor_primary": { "$ref": "#/$defs/humor_tag" },
    "humor_tags": {
      "type": "array", "maxItems": 3, "uniqueItems": true,
      "items": { "$ref": "#/$defs/humor_tag" }
    },
    "behavior_tags": {
      "type": "array", "uniqueItems": true,
      "items": { "type": "string", "pattern": "^[a-z][a-z_]*$" }
    },
    "mode_compatibility": {
      "type": "object",
      "propertyNames": { "pattern": "^[a-z][a-z_]*$" },
      "additionalProperties": { "$ref": "#/$defs/mode_rating" }
    },
    "platform_reviews": {
      "type": "object",
      "required": ["twitch", "tiktok"],
      "propertyNames": { "enum": ["twitch", "tiktok", "youtube", "kick"] },
      "additionalProperties": { "$ref": "#/$defs/platform_review" }
    },
    "editorial_status": {
      "enum": [
        "draft", "auto_checked", "blind_tested", "repair_once", "approved",
        "active", "rejected", "temporarily_disabled", "retired"
      ]
    },
    "repair_count": { "type": "integer", "minimum": 0, "maximum": 1 },
    "status_history": {
      "type": "array",
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["status", "at", "by"],
        "properties": {
          "status": { "type": "string" },
          "at": { "type": "string", "format": "date-time" },
          "by": { "type": "string" },
          "note": { "type": "string", "maxLength": 300 }
        }
      }
    },
    "checks": { "type": "array", "items": { "$ref": "#/$defs/check_result" } },
    "blind_test": { "$ref": "#/$defs/blind_test" },
    "editor_review": { "$ref": "#/$defs/editor_review" },
    "provenance": { "$ref": "#/$defs/provenance" }
  },
  "allOf": [
    {
      "if": { "properties": { "editorial_status": { "enum": ["blind_tested", "approved", "active"] } }, "required": ["editorial_status"] },
      "then": { "required": ["blind_test"] }
    },
    {
      "if": { "properties": { "editorial_status": { "enum": ["approved", "active"] } }, "required": ["editorial_status"] },
      "then": {
        "required": ["blind_test", "editor_review", "answer_hash"],
        "properties": {
          "blind_test": { "properties": { "explanation_result": { "enum": ["pass", "review"] } } },
          "editor_review": { "properties": { "decision": { "const": "approve" } } },
          "answer_validation": {
            "properties": {
              "accepted_phrases": { "minItems": 3 },
              "rejected_counterexamples": { "minItems": 3 },
              "cores": { "minItems": 1 }
            }
          }
        }
      }
    },
    {
      "if": { "properties": { "spice_level": { "const": 3 } }, "required": ["spice_level"] },
      "then": {
        "properties": {
          "platform_reviews": {
            "properties": { "tiktok": { "properties": { "status": { "enum": ["needs_review", "blocked"] } } } }
          }
        }
      }
    }
  ],
  "$defs": {
    "taboo_word": {
      "type": "object", "additionalProperties": false,
      "required": ["word", "relation"],
      "properties": {
        "word": { "type": "string", "pattern": "^[a-zàèéìòù' ]+$", "minLength": 2, "maxLength": 40 },
        "relation": {
          "enum": [
            "sinonimo", "iperonimo", "iponimo", "parte", "luogo", "azione_tipica",
            "oggetto_associato", "persona_tipica", "conseguenza", "contesto"
          ]
        }
      }
    },
    "answer_validation": {
      "type": "object", "additionalProperties": false,
      "required": ["accepted_phrases", "rejected_counterexamples", "cores"],
      "properties": {
        "accepted_phrases": { "type": "array", "uniqueItems": true, "items": { "type": "string", "minLength": 2 } },
        "rejected_counterexamples": { "type": "array", "uniqueItems": true, "items": { "type": "string", "minLength": 2 } },
        "cores": { "type": "array", "items": { "$ref": "#/$defs/core" } },
        "max_tokens": { "type": "integer", "minimum": 3, "maximum": 20 }
      }
    },
    "core": {
      "type": "object", "additionalProperties": false,
      "required": ["groups", "negation"],
      "properties": {
        "groups": {
          "type": "array", "minItems": 1, "maxItems": 4,
          "items": {
            "type": "array", "minItems": 1,
            "items": { "type": "string", "pattern": "^[a-z0-9]{2,}\\*?$" }
          }
        },
        "negation": { "enum": ["required", "forbidden", "any"] },
        "polarity_group": { "type": "integer", "minimum": 0 }
      },
      "if": { "properties": { "negation": { "enum": ["required", "forbidden"] } } },
      "then": { "required": ["polarity_group"] }
    },
    "humor_tag": {
      "enum": [
        "dettaglio_specifico", "dissonanza", "personaggio_situato", "escalation",
        "contrasto", "personificazione", "figuraccia", "assurdo_coerente"
      ]
    },
    "mode_rating": {
      "type": "object", "additionalProperties": false,
      "required": ["rating", "reason"],
      "properties": {
        "rating": { "enum": ["excellent", "usable", "avoid"] },
        "reason": { "type": "string", "minLength": 3, "maxLength": 120 }
      }
    },
    "platform_review": {
      "type": "object", "additionalProperties": false,
      "required": ["status"],
      "properties": {
        "status": { "enum": ["needs_review", "approved", "blocked"] },
        "reviewed_at": { "type": "string", "format": "date-time" },
        "reviewer": { "type": "string" },
        "policy_reference": { "type": "string" },
        "reason": { "type": "string", "maxLength": 300 }
      },
      "if": { "properties": { "status": { "enum": ["approved", "blocked"] } } },
      "then": { "required": ["reviewed_at", "reviewer"] }
    },
    "check_result": {
      "type": "object", "additionalProperties": false,
      "required": ["code", "outcome"],
      "properties": {
        "code": { "type": "string", "pattern": "^[A-Z]-[0-9]{3}$" },
        "outcome": { "enum": ["PASS", "REVIEW", "FAIL"] },
        "detail": { "type": "string", "maxLength": 300 }
      }
    },
    "blind_test": {
      "type": "object", "additionalProperties": false,
      "required": ["tester_model", "prompt_version", "run_at", "explanation_guesses", "explanation_result", "taboo_only_result"],
      "properties": {
        "tester_model": { "type": "string" },
        "prompt_version": { "type": "string" },
        "run_at": { "type": "string", "format": "date-time" },
        "explanation_guesses": {
          "type": "array", "minItems": 2,
          "items": { "type": "array", "minItems": 1, "maxItems": 3, "items": { "type": "string" } }
        },
        "explanation_result": { "enum": ["pass", "review", "fail"] },
        "taboo_only_guesses": { "type": "array", "maxItems": 3, "items": { "type": "string" } },
        "taboo_only_result": { "enum": ["pass", "review", "fail", "not_applicable"] }
      }
    },
    "editor_review": {
      "type": "object", "additionalProperties": false,
      "required": ["reviewed_by", "reviewed_at", "solvability", "scenic", "decision"],
      "properties": {
        "reviewed_by": { "type": "string" },
        "reviewed_at": { "type": "string", "format": "date-time" },
        "solvability": { "type": "integer", "minimum": 1, "maximum": 3 },
        "scenic": {
          "type": "object", "additionalProperties": false,
          "required": ["hook", "strategies", "improvisation"],
          "properties": {
            "hook": { "type": "integer", "minimum": 1, "maximum": 3 },
            "strategies": { "type": "integer", "minimum": 1, "maximum": 3 },
            "improvisation": { "type": "integer", "minimum": 1, "maximum": 3 }
          }
        },
        "decision": { "enum": ["approve", "repair_once", "reject"] },
        "notes": { "type": "string", "maxLength": 500 }
      }
    },
    "provenance": {
      "type": "object", "additionalProperties": false,
      "required": ["source", "created_at"],
      "properties": {
        "source": { "enum": ["manual", "ai", "migrated"] },
        "generator_model": { "type": "string" },
        "prompt_versions": {
          "type": "object",
          "additionalProperties": { "type": "string" }
        },
        "validator_version": { "type": "string" },
        "created_at": { "type": "string", "format": "date-time" },
        "migrated_from": { "type": "string" }
      }
    }
  }
}
```

## 6.3 Esempio di scheda approvata

```json
{
  "schema_version": "2.2",
  "card_id": "ztb_000123",
  "card_version": 2,
  "canonical_answer": "OSPITE CHE NON VA VIA",
  "answer_hash": "5f0c2a91d4e7b3a8",
  "scene_premise": "L'ospite ignora ogni segnale che la serata è finita e propone sempre un ultimo caffè.",
  "category_id": "casa",
  "category_rationale": "La scena dipende dall'ambiente domestico e dal ruolo di chi ospita.",
  "difficulty": "medium",
  "spice_level": 1,
  "taboo": [
    {
      "word": "invitato",
      "relation": "sinonimo"
    },
    {
      "word": "casa",
      "relation": "luogo"
    },
    {
      "word": "uscire",
      "relation": "azione_tipica"
    },
    {
      "word": "divano",
      "relation": "oggetto_associato"
    },
    {
      "word": "tardi",
      "relation": "contesto"
    }
  ],
  "explanations": [
    "Sono le due di notte, hai già messo il pigiama, lavato i piatti e spento metà delle luci, e lui è ancora lì che dice: dai, l'ultimo caffè.",
    "È il contrario di chi scappa da una festa senza salutare: questo saluta da tre ore ma non si alza mai."
  ],
  "answer_validation": {
    "accepted_phrases": [
      "ospite che non va via",
      "ospite che non se ne va",
      "l'invitato resta troppo",
      "l'ospite non vuole andare via",
      "ospite che resta troppo"
    ],
    "rejected_counterexamples": [
      "l'ospite se ne va",
      "l'invitato è già uscito",
      "un ospite deve andare",
      "ospite che non resta"
    ],
    "cores": [
      {
        "groups": [
          [
            "ospit*",
            "invitat*"
          ],
          [
            "va",
            "vanno",
            "andar*",
            "andr*",
            "usc*",
            "esc*"
          ]
        ],
        "negation": "required",
        "polarity_group": 1
      },
      {
        "groups": [
          [
            "ospit*",
            "invitat*"
          ],
          [
            "rest*",
            "riman*",
            "rimast*",
            "ferm*"
          ]
        ],
        "negation": "forbidden",
        "polarity_group": 1
      }
    ],
    "max_tokens": 10
  },
  "humor_primary": "escalation",
  "humor_tags": [
    "escalation",
    "personaggio_situato"
  ],
  "behavior_tags": [],
  "mode_compatibility": {
    "telecronista": {
      "rating": "excellent",
      "reason": "Ogni segnale ignorato diventa un'azione da commentare"
    },
    "documentarista": {
      "rating": "usable",
      "reason": "Funziona come comportamento di una specie notturna"
    },
    "critico_gastronomico": {
      "rating": "avoid",
      "reason": "Il cibo è marginale, la spiegazione si sposta sul caffè"
    }
  },
  "platform_reviews": {
    "twitch": {
      "status": "approved",
      "reviewed_at": "2026-11-17T17:00:00+01:00",
      "reviewer": "luca",
      "policy_reference": "Twitch Community Guidelines, consultate 2026-11-17"
    },
    "tiktok": {
      "status": "approved",
      "reviewed_at": "2026-11-17T17:00:00+01:00",
      "reviewer": "luca",
      "policy_reference": "TikTok Community Guidelines, consultate 2026-11-17"
    }
  },
  "editorial_status": "approved",
  "repair_count": 0,
  "checks": [
    {
      "code": "T-002",
      "outcome": "PASS"
    },
    {
      "code": "A-004",
      "outcome": "PASS"
    }
  ],
  "blind_test": {
    "tester_model": "modello-diverso-dal-generatore",
    "prompt_version": "blind_test@2.2.0",
    "run_at": "2026-11-17T16:40:00+01:00",
    "explanation_guesses": [
      [
        "ospite che non se ne va",
        "festa infinita",
        "nottambulo"
      ],
      [
        "ospite che resta troppo",
        "maleducato",
        "chi non saluta"
      ]
    ],
    "explanation_result": "pass",
    "taboo_only_guesses": [
      "ospite",
      "festa",
      "serata in casa"
    ],
    "taboo_only_result": "review"
  },
  "editor_review": {
    "reviewed_by": "luca",
    "reviewed_at": "2026-11-17T17:00:00+01:00",
    "solvability": 3,
    "scenic": {
      "hook": 3,
      "strategies": 2,
      "improvisation": 3
    },
    "decision": "approve",
    "notes": "Test solo-Taboo in REVIEW: 'ospite' indovinato al primo tentativo ma non la scena completa. Accettato."
  },
  "provenance": {
    "source": "migrated",
    "created_at": "2026-11-17T16:30:00+01:00",
    "migrated_from": "v2.1 §5.1 esempio OSPITE CHE NON SE NE VA",
    "validator_version": "2.2.0"
  }
}
```

## 6.4 Cataloghi esterni [R]

Categorie e modalità **non** sono enumerazioni dello schema della carta: vivono in cataloghi versionati, in modo che aggiungere o disattivare una categoria non richieda di cambiare lo schema.

```json
{
  "catalog_version": "2026.11.1",
  "categories": [
    { "category_id": "casa", "display_code": "P", "name": "Casa, Ospiti & Convivenza",
      "kind": "ambiente", "status": "pilot", "max_spice": 3 },
    { "category_id": "scuola", "display_code": "L", "name": "Scuola & Esami",
      "kind": "ambiente", "status": "active", "max_spice": 1 }
  ],
  "modes": [
    { "mode_id": "telecronista", "family": "ruolo",
      "hint": "Spiega come in una telecronaca sportiva", "status": "active" }
  ],
  "playlists": [
    { "playlist_id": "equivoci", "label": "Round degli equivoci",
      "filter": { "behavior_tags": ["equivoco"] }, "status": "experimental" }
  ]
}
```

Il validatore verifica che `category_id` e le chiavi di `mode_compatibility` esistano nel catalogo e che `spice_level ≤ max_spice` della categoria.

## 6.5 Migrazione dalle schede v2.1 [R]

Il mazzo v3.2 in uso **non viene toccato**: la migrazione produce schede v2.2 in `draft` in parallelo. Il bot passa al nuovo formato per mazzo intero, non carta per carta (D22-04).

| Campo v2.1 | Campo v2.2 | Regola di migrazione |
|---|---|---|
| `category: "P"` | `category_id` | Tradotto tramite catalogo |
| Bersaglio | `canonical_answer` + `scene_premise` | Se il bersaglio è lungo, l'editor separa risposta e premessa |
| `answer_core: [...]` | `answer_validation.cores` | Un nucleo con un gruppo per lemma, `negation: any`; **sempre REVIEW**: servono frasi accettate e controesempi |
| `platform_safe: true` | `platform_reviews.*.status = needs_review` | Mai migrato come `approved` |
| `platform_safe: false` | `platform_reviews.*.status = blocked` | Revisore `migrazione_v2.1`, motivo "migrato da platform_safe=false" |
| Difficoltà a icone | `difficulty` | `easy` / `medium` / `hard` |
| Livello P nella stringa `note` | `spice_level` | Intero 0–3 |
| `compatible_modes: [...]` | `mode_compatibility` | `rating: usable`, `reason: "migrato da v2.1, da rivedere"` |
| `tone_check` | `editor_review` / `editorial_status` | `pending_human_review` → `draft` |
| — | `provenance` | `source: migrated`, `migrated_from` |

---

# Parte 7 — Live, playtest e telemetria

## 7.1 Cosa misura la telemetria [R]

I dati del bot **stimano successo, coinvolgimento e frizione**. Non misurano se una carta fa ridere: la comicità si giudica in playtest, con il voto dello streamer e l'osservazione.

## 7.2 Eventi [P]

| Evento | Campi principali |
|---|---|
| `round_started` | `round_id`, `session_id`, `channel_id`, `platform`, `card_id`, `card_version`, `mode_id`, `public_taboo`, `timeout_s`, `ts` |
| `guess_received` | `round_id`, `user_hash`, `ts_platform`, `ts_received`, `token_count` |
| `guess_evaluated` | `round_id`, `user_hash`, `outcome` (`ACCEPT/REJECT/DOUBT/NO_MATCH/IGNORED`), `reason` |
| `doubt_resolved` | `round_id`, `user_hash`, `decision`, `resolved_by`, `latency_s` |
| `taboo_claim` / `taboo_violation` | `round_id`, `source` (`streamer/mod/chat_buzz`), `confirmed` |
| `mode_abandoned` | `round_id`, `mode_id`, `elapsed_s` |
| `round_ended` | `round_id`, `outcome` (`solved/timeout/skipped/aborted_technical`), `winner_hash`, `ts` |
| `card_flagged` | `card_id`, `issue_flags[]`, `by_role`, `note` |
| `card_rated` | `card_id`, `round_id`, `enjoyment_rating` (1–5) |
| `tech_event` | `kind` (disconnessione, ritardo API, riavvio), `ts` |

**Riepilogo per giocata:** `card_id/card_version`, `session_id`, `mode_id`, piattaforma, round, timeout previsto, timestamp di inizio, del primo messaggio e della prima risposta valida, spettatori attivi stimati, utenti unici partecipanti, numero di tentativi, numero di tentativi "vicini", numero di DOUBT, esito, eventi tecnici, flag di moderazione, voto dello streamer, `times_seen_on_channel`.

**Privacy [P]:** gli utenti si registrano con un identificativo pseudonimo (hash con salt per canale), non con il nome. I testi dei messaggi si conservano solo per i round di playtest, per tarare il matcher, e con un termine di conservazione definito ⟦DECISIONE APERTA⟧.

## 7.3 Come leggere le metriche [R]

| Metrica | Cosa suggerisce | Confondenti principali |
|---|---|---|
| Tasso di soluzione | Risolvibilità nelle condizioni osservate | Dimensione della chat, modalità, ripetizione della carta |
| Tempo alla prima risposta valida | Facilità | Spettatori, latenza della piattaforma, ritmo dello streamer |
| Utenti unici partecipanti | Coinvolgimento | Ora, gioco precedente, dimensione della chat |
| Tentativi "vicini" | Bersaglio formulato male o troppo lungo | Frasi accettate incomplete |
| Tasso di DOUBT | Qualità del matcher per quella carta | — |
| Infrazioni Taboo | Difficoltà di spiegazione | Ritmo della modalità |
| Abbandoni di modalità | Coppia carta–modalità forzata | Esperienza dello streamer |
| Emote e reazioni | **Proxy incerto** di reazione, non risate misurate | Eventi dello streamer, raid, spam |

**Timeout ≠ carta difficile.** Un timeout può dipendere da spiegazione difficile, chat distratta, chat minuscola o problemi di connessione. Per le emote si confronta il round con una **finestra di base** di 60 s [I] prima dell'inizio.

## 7.4 Rotazione e memorizzazione del mazzo [P]

Negli stream ricorrenti gli spettatori fissi imparano le risposte.

- Storico delle estrazioni **per canale**.
- Una carta non riappare sullo stesso canale prima di 5 sessioni [I], o finché non è stato estratto almeno il 70% [I] del mazzo disponibile.
- `times_seen_on_channel` entra in ogni riepilogo. Nelle analisi le ripetizioni si escludono o si stratificano.

## 7.5 Segnalazioni [P]

Pannello riservato a streamer e moderatori, con due dimensioni distinte:

- **`issue_flags`** (selezione multipla): `safety`, `ambiguita`, `troppo_facile`, `troppo_difficile`, `taboo_problematici`, `errore_tecnico`;
- **`enjoyment_rating`** (opzionale, 1–5), più una nota breve.

| Segnalazione | Effetto |
|---|---|
| `safety` | `temporarily_disabled` **atomico e immediato** per le estrazioni successive, poi revisione dell'editor |
| Ambiguità, Taboo, difficoltà | Nessun effetto automatico: entrano nella coda di revisione |
| `errore_tecnico` | La giocata si esclude dalle stime di difficoltà |

**[R]** Le segnalazioni di difficoltà non cambiano i pesi di estrazione prima di una revisione. Ridurre subito il peso di una carta "difficile" la renderebbe meno giocata e ne falserebbe la stima. Solo l'editor può ritirare una carta (`retired`).

## 7.6 Stima della difficoltà [R]

La stima Beta-Binomiale misura la **probabilità di soluzione nelle condizioni osservate**, non una difficoltà intrinseca e universale.

- **Prior [I]:** `easy` Beta(7,3), `medium` Beta(5,5), `hard` Beta(3,7), pari a 10 giocate fittizie.
- **Fasce [I]:** `easy` ≥ 65%, `medium` 35–65%, `hard` < 35%.
- **Stratificazione:** almeno round normali e round con modalità, separati.
- **Riclassificazione:** **mai automatica**. Il sistema la *suggerisce* solo se ci sono almeno 20 giocate [I] in almeno 3 sessioni [I] e l'intervallo all'80% della stima cade interamente fuori dalla fascia attuale. Decide l'editor.
- Si registrano parametri e intervalli, non solo la media.
- Con abbastanza dati si passerà a un modello gerarchico con covariate (dimensione della chat, streamer, modalità). Non serve prima.
- Difficoltà e sicurezza restano separate: molti fallimenti su una carta P3 **non** indicano un contenuto inappropriato.

## 7.7 Difficoltà adattiva [P]

| Modalità | Comportamento |
|---|---|
| `OFF` | Estrazione secondo la configurazione del mazzo (default) |
| `SHADOW` | Il sistema calcola cosa farebbe e lo registra, **senza** cambiare le estrazioni |
| `ON` | Attivabile solo dopo un periodo di `SHADOW` e una decisione registrata |

- La regola 35%/15% su 6–8 carte della v2.1 è **sospesa**: su 6 carte un solo evento sposta il tasso di 16,7 punti.
- Parametri iniziali [I] per lo `SHADOW`: finestra di almeno 12 round, stima smussata (stesso prior della §7.6), raffreddamento di 5 round dopo ogni cambio.
- **Tornei:** difficoltà fissa e dichiarata in anticipo finché l'equità del sistema adattivo non è verificata.

## 7.8 Piano di playtest

| Fase | Obiettivo | Uscita |
|---|---|---|
| **0 — Sicurezza del gioco** | Contratto delle viste, test anti-spoiler, visibilità dei Taboo da regolamento, momento del reveal, arbitraggio | D22-01…03 confermate |
| **1 — Banco del matcher** | 10 positive + 10 negative difficili per ogni carta pilota | Zero falsi positivi, falsi negativi ≤ 20% [I] |
| **2 — Generazione AI** | Lotto diversificato A–L + pilota; ruoli separati; blind test; log delle esclusioni | Tassi di scarto per codice di controllo |
| **3 — Playtest della comicità** | Per carta: soluzione, tempi, partecipanti, tentativi, voto dello streamer; modalità normali e dinamiche con assegnazione bilanciata | Prime stime con intervalli |
| **4 — Nuove categorie** | O/P/Q/R, poi playlist M/N, poi S | Decisione per categoria (Parte 8) |
| **5 — Difficoltà adattiva** | `SHADOW` per diverse sessioni; confronto fra raccomandazioni e risultati | Decisione su `ON`, separata per partite normali e tornei |

Le categorie si accettano in base alla **varietà effettiva dei bersagli e alla resa in live**, non al numero di candidati generati.

---

# Parte 8 — Decisioni e changelog

## 8.1 Registro delle decisioni

Stati: `proposed` (in attesa di verifica su codice e regolamento) · `accepted` (adottata nelle linee guida) · `implemented` (attiva nel bot) · `rejected`.

| ID | Decisione | Stato | Rompe compat. | Schema | Runtime | Verifica |
|---|---|---|---|---|---|---|
| D22-01 | Contratto delle quattro viste e test anti-spoiler | proposed | No | No | Sì | Test anti-spoiler §1.2 |
| D22-02 | Segnalazione delle infrazioni Taboo (autodenuncia, mod, buzzer non automatico) | proposed | No | No | Sì | Fase 0 |
| D22-03 | Taboo pubblici mantenuti con test solo-Taboo obbligatorio | proposed | No | Sì | Sì | §5.4 test B |
| D22-04 | `answer_core` abolito, sostituito da `answer_validation` con polarità | accepted (editoriale) / proposed (bot) | **Sì** | Sì | Sì | Banco del matcher, App. A |
| D22-05 | `canonical_answer` separata da `scene_premise` | accepted | **Sì** | Sì | Sì | Z-001 |
| D22-06 | `spice_level` distinto; quote P2/P3 come target sperimentali | accepted | No | Sì | No | Parte 7 |
| D22-07 | Minori e scuola ammessi fino a P1 | accepted | No | No | No | S-003 |
| D22-08 | `platform_reviews` per piattaforma al posto di `platform_safe` | accepted | **Sì** | Sì | Sì | P-001, Z-001 |
| D22-09 | Categorie a due livelli; M/N come tag e playlist; O–R pilota; S sperimentale | accepted (editoriale) / proposed (UI) | No | No | Sì | Fase 4 |
| D22-10 | `category_id` stabile, lettera derivata dal catalogo | accepted | **Sì** | Sì | Sì | Validatore catalogo |
| D22-11 | Compatibilità graduata, una `excellent` solo per il pool dinamico, via di fuga | accepted (editoriale) / proposed (bot) | No | Sì | Sì | M-001 |
| D22-12 | Ruoli AI separati e blind test | accepted | No | Sì | No | §5.4 |
| D22-13 | Ciclo di vita con una sola riparazione | accepted | No | Sì | No | Z-001 |
| D22-14 | Rubrica 1–3 al posto di pesi e soglie numeriche | accepted | No | Sì | No | §5.6 |
| D22-15 | Registro eventi di telemetria | proposed | No | No | Sì | Fase 3 |
| D22-16 | Rotazione delle carte per canale | proposed | No | No | Sì | Fase 3 |
| D22-17 | Segnalazioni a due dimensioni, disabilitazione safety atomica | proposed | No | No | Sì | Fase 3 |
| D22-18 | Stima Beta come baseline, mai riclassificazione automatica | accepted | No | No | Sì | §7.6 |
| D22-19 | Difficoltà adattiva solo `OFF`/`SHADOW` | proposed | No | No | Sì | Fase 5 |
| D22-20 | Classifiche separate per piattaforma in multi-streaming | proposed | No | No | Sì | Fase 0 |
| D22-21 | "Fuochino" disattivato fino a test A/B | accepted | No | No | Sì | — |

Le decisioni citate dalla v2.1 (es. D44, regole v3.1/v3.2 del gioco) vanno **confermate sui documenti sorgente** (`ZEROTABOO_1.md`, `TODO_1.md`, `TABOO_CATEGORIE.md`, codice del bot) prima di essere trattate come vincolanti.

## 8.2 Decisioni aperte

1. Conseguenza di un'infrazione Taboo (round perso, penalità, nessuna).
2. Visibilità dei Taboo: confermare sul regolamento l'impostazione attuale.
3. Gestione della latenza fra piattaforme: classifiche separate o compensazione.
4. Limite di tentativi per utente per round.
5. Bonus di tempo nei round con modalità.
6. Persone reali nelle carte (default: escluse).
7. Termine di conservazione dei testi dei messaggi di playtest.
8. Contenuti ⟦DA V2.1⟧: categorie B, C, F, G, H, K; coppie di calibrazione; modalità non citate; definizioni originali della scala P.

## 8.3 Changelog v2.1 → v2.2

**Struttura**

- Documento riorganizzato in 9 parti con indice. Checklist spostata in fondo (Parte 9) con esiti `PASS/REVIEW/FAIL`.
- Etichette [R]/[P]/[I] per distinguere regole attive, proposte da verificare e valori da calibrare.
- Schema JSON unico come fonte di verità; prompt versionati e allineati.

**Gioco e runtime**

- Nuovo contratto delle viste (`streamer_private`, `viewer_public`, `viewer_public_taboo`, `reveal`) e test anti-spoiler.
- Nuova sezione sulle infrazioni Taboo durante la spiegazione a voce.
- Validazione delle risposte riscritta: frasi accettate, controesempi, nuclei con polarità, arbitraggio dei casi dubbi, anti-spam, latenza fra piattaforme. Matcher di riferimento in Appendice A.
- Rotazione delle carte per canale contro la memorizzazione del mazzo.

**Carte**

- Risposta canonica separata dalla premessa della scena.
- Taboo: tipi di relazione, controllo delle radici a più livelli, test solo-Taboo.
- `spice_level` distinto; quote P2/P3 trasformate in target sperimentali; finale senza obbligo di P3.
- Minori e scuola ammessi fino a P1 (corregge il divieto generico del prompt breve).
- `platform_safe` sostituito da `platform_reviews` con stati, data e revisore.
- Leve comiche come catalogo non ordinato, con tre test di resa.

**Categorie e modalità**

- Categorie a due livelli; M e N diventano tag e playlist; O, P, Q, R pilota prioritario; S sperimentale; `category_id` stabile.
- Compatibilità delle modalità graduata e motivata; niente obbligo di due modalità; via di fuga.

**Generazione e revisione**

- Ruoli separati (generatore, validatore, blind tester, assistente di revisione, editor) con isolamento del contesto.
- Ciclo di vita con una sola riparazione; il generatore non dichiara mai le carte idonee.
- Rubrica 1–3 ancorata al posto di pesi 30/25/20/15/10 e soglie 80/90.

**Dati**

- Telemetria a eventi; la comicità non viene più dedotta dai dati del bot.
- Segnalazioni a due dimensioni; disabilitazione safety immediata.
- Stima Beta come baseline stratificata, nessuna riclassificazione automatica.
- Difficoltà adattiva sospesa in `OFF`/`SHADOW`; tornei a difficoltà fissa.

---

# Parte 9 — Checklist finale

Esiti: **PASS** · **REVIEW** (l'editor decide; apre al massimo una riparazione) · **FAIL**.  
Un FAIL di sicurezza porta a `rejected`. Gli altri FAIL aprono una riparazione se `repair_count = 0`, altrimenti portano a `rejected`. Lo stato `approved` richiede che tutti i controlli siano PASS, o REVIEW risolti dall'editor.

### Sicurezza (FAIL non compensabile)

| # | Controllo | Rif. |
|---|---|---|
| 1 | Nessun contenuto escluso (§1.6); blocklist superata (S-001/S-002) | §1.6, §5.3 |
| 2 | Minori e scuola: massimo P1 (S-003) | §1.6 |
| 3 | P3 non approvata per TikTok (P-001) | §1.7 |
| 4 | Nessuna umiliazione reale al centro della scena | §1.5 |

### Risposta

| # | Controllo | Rif. |
|---|---|---|
| 5 | Risposta canonica concreta, 1–4 parole piene, un solo referente (A-001) | §2.1 |
| 6 | Premessa della scena presente e distinta dalla risposta | §2.1 |
| 7 | Negazione portante codificata nei nuclei (A-002) | §2.3 |
| 8 | ≥3 frasi accettate e ≥3 controesempi (A-003); test del matcher superato (A-004) | §2.3 |
| 9 | Prefissi `*` di almeno 3 lettere, senza catture estranee (A-005) | §2.3 |
| 10 | Nessun duplicato (D-001); somiglianze verificate (D-002) | §3.5 |

### Taboo e spiegazioni

| # | Controllo | Rif. |
|---|---|---|
| 11 | Esattamente 5 Taboo, senza duplicati (T-001) | §2.2 |
| 12 | Nessuna radice condivisa con la risposta (T-002) | §2.2 |
| 13 | Almeno 3 tipi di relazione (T-003) | §2.2 |
| 14 | Due spiegazioni pulite con strategie diverse (X-001) | §2.2, §1.5 |
| 15 | Blind test A: `pass` o `review` | §5.4 |
| 16 | Blind test B (se Taboo pubblici): non `fail` | §5.4 |

### Comicità, categoria, modalità

| # | Controllo | Rif. |
|---|---|---|
| 17 | Tre test di resa: comprensione, due strategie, improvvisazione | §1.5 |
| 18 | Rubrica: soglie di approvazione o carta di ritmo dichiarata | §5.6 |
| 19 | Categoria assegnata con la regola di precedenza; motivazione se c'era dubbio | §3.3 |
| 20 | `humor_primary` coerente con gli esempi negativi; max 3 tag | §3.4 |
| 21 | Compatibilità delle modalità motivate; una `excellent` se nel pool dinamico (M-001) | §4.3 |

### Schema, stato, piattaforme

| # | Controllo | Rif. |
|---|---|---|
| 22 | Scheda valida rispetto allo schema (Z-001); `category_id` e modalità presenti nel catalogo | §6.2, §6.4 |
| 23 | `provenance` completa (modello, prompt, validatore) | §5.7 |
| 24 | `status_history` aggiornata a ogni transizione | §5.2 |
| 25 | Revisione per ciascuna piattaforma di destinazione, con data e revisore | §1.7 |

---

# Appendice A — Matcher di riferimento (Python)

Implementazione minima, senza dipendenze esterne, della sequenza del §2.3. È una **base di riferimento** per il bot, non un modello linguistico: le soglie sono ipotesi [I] da tarare con il banco di prova.

```python
"""ZeroTaboo v2.2 — matcher di riferimento per le risposte della chat (Appendice A).

Nessuna dipendenza esterna. Esiti: ACCEPT, REJECT, DOUBT, NO_MATCH, IGNORED.
Il matcher non decide il vincitore: restituisce un esito per singolo messaggio;
l'ordine dei messaggi e l'arbitraggio dei DOUBT sono gestiti dal bot (§2.3).
"""
import re
import unicodedata
from difflib import SequenceMatcher

NEGATIONS = {"non", "mai", "nessuno", "nessuna", "niente", "nulla", "senza"}
STOPWORDS = {"il", "lo", "la", "i", "gli", "le", "l", "un", "uno", "una", "che",
             "e", "di", "a", "da", "in", "con", "per", "su"}
NEG_WINDOW = 3          # token prima del gruppo di polarità in cui cercare la negazione
ACCEPT_SIM = 0.90       # somiglianza minima con una frase accettata
DOUBT_SIM = 0.80        # sotto ACCEPT_SIM ma sopra questa soglia -> arbitraggio
COUNTER_SIM = 0.92      # somiglianza con un controesempio -> rifiuto
DEFAULT_MAX_TOKENS = 10


def normalize(text: str) -> list[str]:
    text = unicodedata.normalize("NFKD", text.lower())
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = re.sub(r"[^a-z0-9\s]", " ", text)        # apostrofi, punteggiatura, emoji
    text = re.sub(r"(.)\1{2,}", r"\1", text)         # "viaaaa" -> "via", "tuttiii" -> "tutti"
    return text.split()


def _content(tokens):
    return [t for t in tokens if t not in STOPWORDS]


def _negs(tokens):
    return sorted(t for t in tokens if t in NEGATIONS)


def _similar(a, b):
    return SequenceMatcher(None, " ".join(a), " ".join(b)).ratio()


def _hit(token, entry):
    return token.startswith(entry[:-1]) if entry.endswith("*") else token == entry


def _find(tokens, group):
    for i, t in enumerate(tokens):
        if any(_hit(t, e) for e in group):
            return i
    return None


def _negated(tokens, idx):
    return any(t in NEGATIONS for t in tokens[max(0, idx - NEG_WINDOW):idx])


def evaluate(message: str, av: dict) -> tuple[str, str]:
    """Valuta un messaggio della chat contro answer_validation di una carta."""
    tokens = normalize(message)
    if not tokens:
        return "IGNORED", "vuoto"
    if len(tokens) > av.get("max_tokens", DEFAULT_MAX_TOKENS):
        return "IGNORED", "troppo lungo"
    content, negs = _content(tokens), _negs(tokens)

    # 1. Controesempi espliciti
    for ce in av.get("rejected_counterexamples", []):
        ce_tok = normalize(ce)
        if _negs(ce_tok) == negs and _similar(content, _content(ce_tok)) >= COUNTER_SIM:
            return "REJECT", "controesempio"

    # 2. Frasi accettate (la somiglianza conta solo a parità di negazioni)
    best = 0.0
    for p in av.get("accepted_phrases", []):
        p_tok = normalize(p)
        if _negs(p_tok) == negs:
            best = max(best, _similar(content, _content(p_tok)))
    if best >= ACCEPT_SIM:
        return "ACCEPT", "frase accettata"

    # 3. Nuclei con vincolo di polarità
    partial = polarity_fail = False
    for core in av.get("cores", []):
        pos = [_find(tokens, g) for g in core["groups"]]
        if all(p is not None for p in pos):
            rule = core.get("negation", "any")
            if rule != "any":
                is_neg = _negated(tokens, pos[core["polarity_group"]])
                if (rule == "required") != is_neg:
                    polarity_fail = True
                    continue
            return "ACCEPT", "nucleo"
        if any(p is not None for p in pos):
            partial = True
    if polarity_fail:
        return "REJECT", "polarità"

    # 4. Casi dubbi -> arbitraggio dello streamer
    if best >= DOUBT_SIM:
        return "DOUBT", "simile a frase accettata"
    return "NO_MATCH", "parziale" if partial else ""
```

**Esempio d'uso:**

```python
card = json.load(open("ztb_000123.json"))
evaluate("l'ospite non se ne va", card["answer_validation"])   # ('ACCEPT', 'frase accettata')
evaluate("invitato che rimane tutta la sera", card["answer_validation"])  # ('ACCEPT', 'nucleo')
evaluate("un ospite andrà via", card["answer_validation"])     # ('REJECT', 'polarità')
```

**Banco di prova eseguito il 17/11/2026** sulle tre carte della §2.4: 43 messaggi di prova (positivi, negativi difficili, parziali, spam) più il controllo A-004 su tutte le frasi accettate e i controesempi. **Zero errori.** Le tre schede sono valide rispetto allo schema della §6.2 e i due test negativi dello schema (P3 approvata su TikTok; carta `approved` senza blind test) vengono correttamente rifiutati.

**Limiti noti:**

- la negazione si cerca in una finestra di 3 parole prima del gruppo di polarità: costruzioni come "non è che l'ospite se ne va" vengono rifiutate, il che è accettabile perché un rifiuto è recuperabile con l'arbitraggio;
- non c'è lemmatizzazione vera: le forme vanno elencate nei gruppi (esatte o con prefisso);
- la somiglianza è a livello di caratteri (`difflib`), non semantica.

---

# Appendice B — Fonti sulle piattaforme

Riportate dall'audit, consultate il 17/11/2026. Non autorizzano singole carte: la revisione va fatta sui contenuti pubblicati e sulle regole in vigore al momento della revisione.

- Twitch — Community Guidelines: https://safety.twitch.tv/articles/en_US/Knowledge/Community-Guidelines
- Twitch — Safety at Twitch e Content Classification Labels: https://safety.twitch.tv/s/article/Safety-at-Twitch?language=en_US
- TikTok — Community Guidelines, aggiornamento e LIVE (Newsroom): https://newsroom.tiktok.com/create-discover-and-connect-on-tiktok-with-stronger-community-guidelines?lang=en-GB
- TikTok — Content levels e contenuti allusivi per il pubblico più giovane (Newsroom): https://newsroom.tiktok.com/strengthening-enforcement-of-sexually-suggestive-content?lang=en
- TikTok — Moderazione dei contenuti sensibili, documentazione per sviluppatori: https://developers.tiktok.com/docs/en/media-asset-management

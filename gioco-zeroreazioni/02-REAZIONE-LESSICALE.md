# Reazione lessicale — concept approfondito v0.2

**Data:** 19 novembre 2026  
**Stato:** bozza di Superpowers Brainstorming, **non approvata**; nessun codice è stato implementato.  
**Priorità:** concept scelto per essere approfondito, rispetto a Costellazioni di parole e L'intruso impossibile.  
**Durata:** partite da 1–3 minuti.  
**Destinazione:** live con un solo schermo condiviso, una sola chat pubblica, bot che legge e attribuisce automaticamente le risposte.

---

## 1. Visione

**Ogni parola mette in moto la successiva.** Sullo schermo appare una parola di partenza e una richiesta precisa (per esempio: «qualcosa che produce»). La chat propone parole; la prima risposta valida fa evolvere la catena. Una serie di trasformazioni compone una reazione collettiva, mentre il bot premia i contributi individuali.

La sfida non è soltanto indovinare l'associazione voluta dall'autore: **sono i partecipanti a determinare come la catena evolve**, entro relazioni semanticamente controllate. Lo streamer può commentare e intervenire, ma il gioco è autosufficiente.

### Obiettivi di esperienza

1. Comprendere cosa scrivere in chat in meno di 10 secondi.
2. Partecipare in qualunque momento di una partita breve.
3. Provare sorpresa quando un collegamento cambia la direzione del gioco.
4. Riuscire a vincere individualmente senza impedire il successo collettivo.
5. Alternare competenze linguistiche: intuizione, logica, lessico, creatività, senza trasformarsi in un quiz enciclopedico.

### Non-obiettivi

- Non richiedere messaggi segreti, squadre con chat separate o schermi personali.
- Non imporre turni individuali: chiunque può rispondere contemporaneamente.
- Non giudicare la «creatività» tramite un modello AI come unico arbitro di punti in tempo reale.
- Non copiare la trasmissione *Reazione a Catena* o altri giochi basati su un'unica risposta preordinata senza una meccanica aggiuntiva.

---

## 2. Requisiti già concordati

| Aspetto | Vincolo |
|---|---|
| Mezzo | Un solo schermo di streaming visibile a tutti |
| Risposte | Unica chat pubblica, tutti vedono tutto |
| Tipologia | Sia sfida comune sia punti e podio individuale |
| Abilità | Intuizione, vocabolario, logica e creatività |
| Durata | 60–180 secondi |
| Streamer | Modalità bot autonoma e interventi manuali facoltativi |
| Validazione | Bot che identifica il primo utente con risposta ammessa |

Questi punti sono requisiti; **le tre varianti e i numeri sotto sono proposte**, non decisioni approvate.

---

## 3. Tre direzioni meccaniche da confrontare

### A. Catena a vincoli mobili — raccomandazione per il primo prototipo

**Cosa si vede:** una parola attuale, un tipo di relazione obbligatoria, una timeline delle parole già conquistate e un timer.

**Cosa si fa:** gli spettatori scrivono parole che rispettano il vincolo. La prima accettata diventa la nuova parola di partenza. Poi compare un nuovo vincolo valido per quella specifica parola.

**Esempio controllato:**

```text
APE        → [PRODUCE]                  → MIELE
MIELE      → [SI USA PER PREPARARE]      → DOLCE
DOLCE      → [ESEMPIO DI]               → TORTA
TORTA      → [SI CUOCE IN]              → FORNO
```

Ogni passaggio è una **relazione direzionale** (la frase deve risultare naturale nel verso mostrato). L'esempio è un percorso preparato, non dimostra che tutte le risposte possibili possano essere giudicate in automatico.

**Pregi:** risultato chiaro, ritmo alto, chat reattiva, cambiamenti visibili.  
**Rischi:** un collegamento semanticamente plausibile ma non previsto può essere rifiutato ingiustamente; un successore accettato potrebbe non consentire un passo successivo.  
**Salvaguardia:** preparare e collaudare un **grafo di successori accettati**, con almeno un vincolo successivo giocabile per ciascun ramo. Le risposte fuori grafo non vengono automaticamente dichiarate «sbagliate» sul piano linguistico: semplicemente non sono riconosciute dal round, e la UX deve spiegarlo.

### B. Ponte verso un bersaglio

**Cosa si vede:** parola START, parola TARGET, una catena con spazi vuoti, tipo di legame richiesto per il prossimo passo.

**Cosa si fa:** la chat propone passaggi per arrivare al bersaglio in un numero massimo di mosse. Esempio didattico di sequenza: `FOGLIA → ALBERO → BOSCO → SENTIERO → MONTAGNA`, con legami esplicitati e controllati dall'editor.

**Pregi:** tensione narrativa, obiettivo finale evidente, ottimo per spettatori che entrano a round avviato.  
**Rischi:** verificare automaticamente percorsi alternativi verso il target è più difficile; percorsi troppo lunghi possono diventare frustranti.  
**Salvaguardia:** accettare percorsi editorialmente verificati e mostrare sempre mosse disponibili/avanzamento.

### C. Reazione a bivi

**Cosa si vede:** parola iniziale e 2–3 rami contemporanei, ciascuno con un vincolo diverso (sinonimo, oggetto associato, luogo, azione ecc.).

**Cosa si fa:** più spettatori alimentano i rami; la chat deve completarli prima della scadenza. A intervalli, due rami possono convergere.

**Pregi:** numerose occasioni di segnare punti, funziona bene con chat affollate.  
**Rischi:** grafica meno leggibile su smartphone, possibile somiglianza con Costellazioni di parole, complessità per chi entra a partita iniziata.  
**Salvaguardia:** non più di due bivi contemporanei nel prototipo.

### Confronto sintetico

| Criterio | A. Catena mobile | B. Bersaglio | C. Bivi |
|---|---|---|---|
| Comprensione in 10 s | Alta | Alta | Media |
| Ritmo con 1 chat pubblica | Alto | Medio-alto | Alto |
| Sensazione di costruzione collettiva | Alta | Alta | Molto alta |
| Leggibilità mobile | Alta | Alta | Media |
| Difficoltà di validazione | Medio-alta | Alta | Alta |
| Differenziazione da altri giochi | Buona, da provare | Media | Buona |

**Proposta di partenza:** A, non ancora scelta definitiva. Consente di testare meglio il ciclo `input → validazione → nuova parola` senza costruire una UI ramificata.

---

## 4. Regolamento candidato per A — Catena a vincoli mobili

### Obiettivo comune

Completare **6 passaggi validi** prima dello scadere del timer. Il numero è indicativo e va calibrato in playtest.

### Obiettivo individuale

Ottenere il punteggio più alto conquistando passaggi, contribuendo ad avanzare la catena e superando eventuali eventi bonus. Non servono turni assegnati: tutti competono in simultanea.

### Stato del round

- `parola_corrente`: termine mostrato come origine del prossimo passaggio.
- `vincolo_corrente`: relazione richiesta e sua direzione.
- `risposte_ammesse`: lessico di successori validati nel dataset del round.
- `step`: numero di passaggi completati.
- `deadline`: scadenza temporale misurata dal server/bot.
- `claim`: autore e timestamp della prima risposta valida allo step.

### Sequenza

1. Il bot mostra la parola iniziale e il vincolo; parte il timer.
2. Tutti scrivono **una parola** in chat. Non è necessario un comando per il caso base, se il parser riesce a separare in modo affidabile i messaggi di gioco da quelli ordinari; altrimenti si introduce `!r parola`.
3. Il bot normalizza e confronta l'input con le forme ammesse per lo step attuale.
4. **Prima risposta valida, secondo l'ordine degli eventi ricevuti dal bot:** claim, punti, breve animazione.
5. La parola proposta diventa la parola corrente **solo se** il ramo è stato predisposto per proseguire; appare il nuovo vincolo.
6. Ripetere fino a 6 step, alla scadenza o a un evento di fine anticipata previsto dal dataset.
7. Mostrare catena finale, contributori, risultato collettivo, vincitore individuale.

### Regole di equità proposte

- Le risposte già rivendicate non assegnano punti duplicati.
- Ogni step ha un solo claim principale. Il bot registra la sequenza di eventi che ha effettivamente ricevuto; i timestamp dei client/piattaforme non sempre sono confrontabili in modo assoluto.
- Se due risposte arrivano indistinguibilmente nello stesso batch, serve uno spareggio deterministico documentato (per esempio, ordine stabile di consegna; non favoritismi manuali).
- Un utente può vincere più passaggi, ma da testare un incentivo alla partecipazione diffusa (bonus primo contributo della partita, non esclusioni arbitrarie).
- Non si penalizzano automaticamente risposte semanticamente plausibili fuori catalogo: si mostra semmai `non prevista per questa catena`.
- No ranking dei follower basato sulle donazioni o sui regali virtuali.

---

## 5. Un round esempio da 120 secondi

**Scenario:** trovare sei trasformazioni, con vincoli espliciti. Esempio dimostrativo non bilanciato, non da pubblicare senza revisione.

```text
┌────────────────────────────────────────────┐
│ REAZIONE LESSICALE                01:42     │
│                                            │
│  PAROLA ATTUALE:        APE                │
│  RELAZIONE:             PRODUCE            │
│                                            │
│  APE → ?                                   │
│                                            │
│  CATENA  0/6    █░░░░░                     │
│  Scrivi una parola in chat                 │
│                                            │
│  @utente   ultima reazione corretta        │
│  TOP 3    @a 20  @b 10  @c 10             │
└────────────────────────────────────────────┘
```

**Eventi:**
- Utente A scrive `miele`: se presente tra le transizioni autorizzate, la risposta viene accettata.
- Il bot aggiorna la catena: `APE → MIELE`; il nome di A appare vicino a `MIELE`.
- Il vincolo cambia, per esempio `MIELE → [SI USA PER PREPARARE] → ?`.
- Utente B scrive `dolce`, che viene accettato se previsto dal ramo.
- Si prosegue fino a 6 passi; l'obiettivo comune è completare la catena prima del termine.

> L'esempio mostra un ramo narrativamente chiaro; il dataset reale dovrà includere tutte le alternative ragionevoli che si intende accettare, come `cera` per `APE → PRODUCE`, e garantire la continuazione di ciascun ramo.

### Ritmo temporale provvisorio

| Fase | Secondi | Note |
|---|---:|---|
| Spiegazione/anteprima | 0–8 | «Trova la parola che rispetta il vincolo» |
| Reazioni | 8–100 | Sei step, con feedback visivo non invasivo |
| Aiuto automatico | A stallo di 12–18 s | Un indizio specifico del ramo, non una soluzione |
| Finale | 100–120 | Ultimo sprint o reveal, catena e classifica |

**Importante:** non congelare per 20 secondi il gioco se il sesto step è già completato: una vittoria anticipata porta direttamente al reveal breve. Il formato 60–180 s richiede anche configurazioni di timer personalizzabili.

---

## 6. Lessico e categorie di relazione

Le relazioni sono **direzionali**, tipizzate e documentate. Per esempio:

| ID | Testo in sovrimpressione | Relazione concettuale | Criticità |
|---|---|---|---|
| `PRODUCE` | «Cosa produce?» | agente → prodotto | Una parola può avere moltissimi prodotti |
| `PARTE_DI` | «Di cosa fa parte?» | componente → insieme | Confusione con «contiene» |
| `CONTIENE` | «Che cosa contiene?» | insieme → componente | Necessita contestualizzazione |
| `TIPO_DI` | «È un tipo di…» | istanza → categoria | Spesso risposte troppo generiche |
| `ESEMPIO_DI` | «Un esempio è…» | categoria → istanza | Direzione opposta a `TIPO_DI` |
| `USATO_PER` | «A cosa serve?» | strumento → funzione | Accetta verbi/frasi, da limitare |
| `CONTRARIO` | «Qual è il contrario?» | lemma ↔ antonimo | Applicabile soprattutto a certi aggettivi/verbi |
| `SINONIMO` | «Un sinonimo?» | lemma ↔ sinonimo | Varianti di registro e polisemia |
| `SI_TROVA_IN` | «Dove si trova?» | entità → luogo | Difficile da definire senza contesto |
| `ASSOCIATO_A` | «Quale parola richiama?» | relazione libera | **Da evitare nella V1 competitiva**, troppo soggettiva |

**Principio:** per il punteggio non basta che due embedding siano simili; serve una relazione verificabile nel verso richiesto, con casi d'uso testati. Un modello semantico può suggerire candidati, non attribuire verdetti insindacabili.

### Punti linguistici da fissare

- Normalizzazione Unicode, maiuscole, diacritici, apostrofi e punteggiatura; conservare sempre la forma originale.
- Lemmatizzazione solo se appropriata alla relazione: `gatti` e `gatto` possono non essere equivalenti in ogni gioco; evitare che la normalizzazione cambi il significato.
- Gestione POS (nome, verbo, aggettivo); mostrare l'eventuale parte del discorso quando una parola è ambigua.
- No accettazione automatica di polirematiche se la fase vuole una sola parola, a meno di whitelist esplicita.
- Controllo di omonimie, flessioni, errori ortografici e forme lessicali improprie.

---

## 7. Due modelli alternativi di validazione

### Modello V1 consigliato: grafo curato e chiuso

**Prima del round:** editor o generatore prepara transizioni consentite, vincolo, alternative e successivi step possibili. Un validatore controlla che ogni transizione ammessa conduca a uno stato giocabile; un revisore umano verifica naturalità e chiarezza degli archi.

**Durante il round:** lookup deterministico su forme canoniche e alias. Nessuna chiamata a un LLM è necessaria per assegnare punti.

**Vantaggi:** bassa latenza, risultati ripetibili, possibilità di audit, minori contestazioni.  
**Svantaggi:** lessico meno aperto; produzione di molte catene richiede QA e un grafo sufficientemente ampio.

**Regola di trasparenza suggerita:** l'interfaccia potrebbe dire «Trova una parola valida per questa sfida», non «ogni associazione plausibile vale».

### Modello futuro: grafo aperto con controllo di confidenza

Usare un insieme di risorse linguistiche (dizionari, relazioni tipizzate, eventuale ConceptNet, corpora e revisione) per proporre e verificare transizioni nuove. Embedding, PMI o un LLM possono integrare la ricerca ma **non sostituiscono** le prove semantiche. Casi a bassa confidenza vanno in coda editoriale, non diventano punti assegnati in tempo reale.

**Rischio:** accettare un rapporto vagamente associativo genera arbitrarietà e incentivi allo spam. È meglio non usarlo come meccanica competitiva V1.

---

## 8. Costruzione automatica dei round: proposte tecniche

### Pre-generazione

1. Partire da un catalogo di lemmi italiani controllati e dal grafo delle relazioni ammesse.
2. Selezionare una parola iniziale riconoscibile.
3. Ricercare un grafo di profondità sufficiente (per esempio 6 step), senza cicli banali.
4. Per ciascun nodo/step definire più risposte valide **e** almeno un vincolo successivo raggiungibile.
5. Evitare transizioni che portano a un nodo morto, insulti, termini ambigui o molto specialistici senza intenzione esplicita.
6. Stimare difficoltà, diversità dei vocaboli, attese di risposta, rischio di monopolio del primo utente.
7. Salvare la genealogia e il punteggio QA del round, versionando il dataset.

### Validazione del dataset

- **Integrità del grafo:** nessuna risposta dichiarata valida deve terminare in uno stato non risolvibile, salvo vittoria esplicitamente prevista.
- **Unicità degli step:** evitare lo stesso lemma due volte, a meno che la ripetizione sia una meccanica deliberata.
- **Reachability:** dalla parola iniziale, ogni ramo ammesso deve poter raggiungere il target di 6 passaggi.
- **Controllo delle alternative:** verificare candidati comuni esclusi ingiustamente; annotare e correggere.
- **Audit umano su campione e blind test:** il giocatore deve comprendere la relazione senza bisogno di conoscere il database.
- **Bilanciamento:** misurare success rate e tempo per step prima di usare la difficoltà in classifica.

### Schema JSON dimostrativo

```json
{
  "game_id": "reazione-lessicale",
  "round_id": "rl-demo-001",
  "locale": "it-IT",
  "duration_seconds": 120,
  "target_steps": 6,
  "initial_state_id": "s0",
  "states": [
    {
      "id": "s0",
      "word": "ape",
      "relation_id": "PRODUCE",
      "edges": [
        {"answer": "miele", "to_state_id": "s1"},
        {"answer": "cera", "to_state_id": "s1b"}
      ]
    }
  ],
  "qa_status": "draft"
}
```

Lo schema è volutamente un *frammento*: gli stati `s1` e `s1b` devono esistere nell'oggetto reale. Un validatore deve rifiutare un puzzle incompleto, altrimenti il round potrebbe bloccarsi.

---

## 9. Punteggio — ipotesi di pilot

| Evento | Punti |
|---|---:|
| Primo claim valido per uno step | +10 |
| Primo claim dopo uno stallo >12 s | +15 (in luogo dei +10, non cumulativo) |
| Contributo che completa il sesto step | +20 (in luogo del punteggio base) |
| Primo step valido di un utente nella partita | +3 bonus, una volta soltanto |
| Risposta errata o fuori catalogo | 0 |

I bonus devono essere mostrati a inizio round per evitare sorprese. Si sconsigliano penalità severe per le risposte sbagliate in chat pubblica; meglio limitare flood e ripetizioni.

**Esito condiviso:** `catena completa` o `catena incompleta`; opzionale barra delle vittorie collettive della serata.  
**Esito competitivo:** punteggio per partita e leaderboard aggregata della live. Il risultato del round può essere indipendente da quello della serata.

**Problema da osservare:** con sei claim disponibili un unico utente molto rapido potrebbe monopolizzare il podio. Alternative da testare: un piccolo bonus ai contributori nuovi, step bonus riservati a chi non ha ancora segnato (più inclusivo ma meno puro), oppure premi per correttezza consistente su molti round.

---

## 10. Chat pubblica e concorrenza

### Parser

- Leggere eventi per piattaforma e assegnare ID stabili a messaggio, autore, round, step.
- Applicare normalizzazione senza perdere testo originale.
- Evitare che una frase casuale nella chat venga conteggiata come risposta con certezza ingiustificata; valutare modalità comando `!r` se necessario.
- Mostrare `parola accettata`, eventuale nickname e avatar; la visualizzazione non deve coprire il vincolo successivo.

### Copia delle risposte

La copia è naturale: tutti leggono la chat. **Non va combattuta tramite comunicazioni private**; si elimina il guadagno della copia attribuendo il claim solo alla prima risposta ricevuta dal bot per ciascuno step.

### Ritardo della live

Latenze diverse (Twitch, TikTok, YouTube) e ritardi di streaming possono creare vantaggi non intenzionali. Non si può promettere equità perfetta fra piattaforme. Testare modalità di classifica separata per piattaforma, round con sincronizzazione e finestre temporali, oppure una sola chat eleggibile per sessione. La soluzione dipende dall'infrastruttura reale.

### Anti-spam

- Limite dinamico di tentativi per utente per step (es. 2 messaggi ogni 3 secondi, **da verificare**).
- Scarto delle risposte duplicate dello stesso utente nello stesso step.
- Protezione da bot, messaggi automatizzati e flooding; nessun vantaggio con donazioni/gift.
- Raccolta e revisione degli eventi contestati, senza modifiche invisibili alla classifica.

---

## 11. Modalità di conduzione

**Autoplay:** il bot genera la sequenza dagli stati già verificati, apre e chiude la partita, applica il timer, sblocca indizi e aggiorna la classifica.

**Streamer attivo:** può scegliere prima del round una difficoltà, attivare un indizio predisposto, congelare brevemente il timer per problemi tecnici, lanciare un evento annunciato in anticipo. Non cambia a posteriori il significato delle relazioni per premiare un partecipante.

**Idee di eventi opzionali, non V1 obbligatoria:** «Reazione lampo» (finestra bonus 10 s), «Doppio significato» (si esplicita la parte del discorso), «Ultima scintilla» (ultimo step con indizio forte). Non aggiungere tutto insieme prima di provare il loop base.

---

## 12. Presentazione visiva e accessibilità

- **Parola corrente**: enorme e centrata.
- **Vincolo**: banner breve sopra o sotto la parola, con freccia che mostra la direzione.
- **Catena**: massimo le 3–4 parole recenti in grande; storico completo ridotto o scorrevole per non affollare lo schermo.
- **Timer**: sempre presente, non mascherato da animazioni.
- **Riconoscimento**: nickname/avatar del primo autore vicino allo step conquistato per 2–3 s.
- **Classifica**: top 3/5 in una fascia che non sottrae spazio alle parole.
- **Contrasto e leggibilità**: test su schermo 1080×1920 e 1920×1080; non distinguere stati solo dal colore.

---

## 13. Telemetria e criteri di successo

Raccogliere almeno:

- `time_to_first_valid_answer` per step e per vincolo.
- `completion_rate` per partita e difficoltà.
- Numero utenti unici che segnano / numero utenti che tentano.
- `rejected_but_plausible_rate` ottenuto da revisione campionata dei rifiuti; è cruciale per la fiducia.
- Percentuale di step vinti dallo stesso utente e impatto della latenza.
- Tempo in cui il tabellone appare inattivo e frequenza di indizi automatici.
- Errori di normalizzazione, alias, falsi positivi, contestazioni.

**Soglie di pilot da verificare empiricamente:** spiegazione compresa in <10 s; almeno il 60–75% dei round completato entro 120 s; nessun blocco del grafo; riduzione dei rifiuti plausibili dopo ogni revisione. Non sono risultati misurati.

---

## 14. Test prima di sviluppare un motore completo

1. Creare manualmente **20 round** con 6 step ciascuno e alternative curate.
2. Controllare **tutti** i rami e le transizioni al livello V1.
3. Simulare una chat con risposte simultanee e flood; verificare claim ripetibili.
4. Fare un playtest con poche persone e poi uno con più utenti.
5. Identificare i vincoli che causano rifiuti «ragionevoli» e rimuoverli o chiarirli.
6. Testare lo schermo verticale su telefono e l'ingresso a round iniziato.
7. Solo dopo, decidere se ampliare automaticamente il grafo.

---

## 15. Decisioni aperte per il brainstorming

**Prioritaria:** quanto libere devono essere le associazioni delle parole?

1. **A scelta controllata** — il bot accetta soltanto relazioni e alternative editorialmente verificate; massima equità e prestazioni prevedibili, minore creatività spontanea.
2. **Miste** — catalogo certo per la classifica e proposte fuori catalogo raccolte per revisione e futuri round; bilancia affidabilità e creatività, ma una risposta plausibile non sempre fa avanzare la catena subito.
3. **Aperte** — ogni risposta semanticamente sensata potrebbe proseguire; più emergenza creativa, ma adjudicazione automatica in tempo reale difficile da rendere coerente e contestabile.

Altre decisioni: comandino `!r` o testo libero; una sola piattaforma competitiva o più chat; rapporto fra tempo del round e quantità di step; mostrare o meno la parola finale bersaglio.

**Raccomandazione temporanea:** modello **misto** per la raccolta dati, **chiuso** per l'attribuzione istantanea dei punti, finché i test non dimostrano che un validatore più aperto è sufficientemente equo. È una proposta da discutere, non una scelta già approvata.

---

## 16. Riferimenti e differenziazione

- *Codenames*: associazioni fra più termini, qui però senza ruoli nascosti e con catena costruita in pubblico. https://www.codenamesgame.com/boardgames/codenames
- *Connections*: ragionamento su relazioni, qui la sfida è **temporale e sequenziale**. https://thenewyorktimeshelpcenter.helpjuice.com/360011158491-New-York-Times-Games/28525912587924-Connections
- *BombParty*: velocità di digitazione, qui sostituita o combinata con una relazione semantica tipizzata. https://bombparty.app/
- *Just One*: creatività nei collegamenti lessicali, qui occorre fare i conti con una chat pubblica e nessun indizio segreto. https://cdn.svc.asmodee.net/production-rprod/storage/downloads/games/justone/US/jo-us01-rules-target-1611247435ApI80.pdf

### Rapporto con i giochi già menzionati nel progetto

Prima di sviluppare, controllare nel repository reale le meccaniche esistenti di ZeroContext e dell'eventuale gioco di Reazione a Catena: evitare duplicazioni su dataset, flusso round, classifiche e validatore delle parole. Nessun codice sorgente è stato analizzato per questa bozza.

---

## 17. Stato e prossima azione

Questa è una **bozza di concept**. Superpowers Brainstorming richiede ancora di scegliere l'approccio definitivo, finalizzare il documento di design e ottenerne l'approvazione esplicita **prima** di passare a `writing-plans`, implementazione o installazione di dipendenze.

**Prima domanda da risolvere:** vogliamo che la chat possa inserire associazioni completamente libere, oppure preferiamo relazioni curate che il bot riconosce con certezza?

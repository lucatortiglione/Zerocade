# Costellazioni di parole — concept di gioco v0.1

**Data:** 19 novembre 2026  
**Stato:** proposta preliminare di Superpowers Brainstorming; non è una specifica approvata per l'implementazione.  
**Formato:** gioco di parole per streaming, un solo schermo condiviso e una sola chat pubblica.  
**Durata prevista:** 1–3 minuti per partita.

## 1. Idea in una frase

Dodici parole sono stelle sparse sullo schermo: i partecipanti scoprono connessioni tra coppie di parole, ricostruiscono tre costellazioni nascoste e accumulano punti individuali mentre tutta la chat completa il quadro.

## 2. Intento e identità

**Perché esiste:** unire la soddisfazione di riconoscere pattern nascosti all'effetto spettacolare di una mappa che si illumina man mano che la chat trova relazioni. Deve poter essere seguito anche senza aver visto l'inizio della partita.

**Ispirazioni, non riproduzioni:**
- *Connections* (NYT): riconoscimento di categorie semantiche, ma senza obbligare l'utente a inviare quattro parole tutte insieme.
- *Codenames*: collegamenti semantici fra parole, ma senza ruoli segreti, squadre riservate o indizi privati.

**Differenza proposta:** l'unità minima di gioco è un **collegamento a due parole**, con feedback visivo pubblico e progresso cumulativo della chat. Non è una copia della griglia 4×4 di Connections.

## 3. Vincoli non negoziabili condivisi

1. Un solo schermo di trasmissione; tutto ciò che serve è visibile a tutti.
2. Una sola chat pubblica; nessun DM, indizio segreto o secondo dispositivo necessario.
3. Ogni risposta deve essere valutata dal bot e attribuita al profilo dell'autore.
4. La copia delle risposte è prevedibile: premi maggiori alla prima risposta corretta; contributi successivi da definire.
5. Nuovi spettatori possono comprendere la situazione a partita avviata.
6. Sono possibili sia modalità automatica sia conduzione attiva dello streamer.
7. La competizione individuale non deve ostacolare l'obiettivo collettivo.

## 4. Regole candidate

### Tabellone

- 12 tessere numerate `1`–`12`, ciascuna con una parola italiana.
- Tre gruppi tematici latenti da quattro parole ciascuno.
- Ogni parola può avere **un solo gruppo principale** ai fini del punteggio; collegamenti secondari ambigui vengono individuati in fase di QA e, dove possibile, eliminati.
- Nessun gruppo o soluzione viene rivelato all'inizio.

### Input in chat

- Forma preferita: `3-8` (collega due tessere), rapida da scrivere anche su smartphone.
- Variante accessibile: il bot accetta anche `3 8` e, se non genera conflitti, i due termini esatti.
- Una connessione è corretta se le due parole appartengono allo stesso gruppo **e** il legame è incluso nell'insieme autorizzato del puzzle.
- Il primo utente che trova un nuovo collegamento valido lo rivendica; le ripetizioni non rubano i punti.

### Progresso condiviso

1. Una relazione corretta fa apparire una linea fra due tessere.
2. Ogni costellazione completa si colora e mostra la propria etichetta tematica.
3. La partita termina quando la chat ha completato tutti e tre i gruppi o scade il tempo.
4. Il bot può offrire indizi progressivi per evitare uno stallo.

**Nota di progetto:** il criterio per completare un gruppo non può essere lasciato implicito. In una prima versione si suggerisce che un gruppo sia risolto quando tutte e quattro le parole sono connesse tramite un percorso interno (almeno tre connessioni utili) e che il bot riconosca il gruppo. Questo riduce le risposte necessarie rispetto a un grafo completo di sei archi.

## 5. Esempio didattico (facile, non destinato alla produzione)

Tessere mescolate:

`1 STELLA` · `2 VIOLINO` · `3 BRUCO` · `4 PIANETA` · `5 APE` · `6 NOTA` · `7 FORMICA` · `8 SATELLITE` · `9 TROMBA` · `10 FARFALLA` · `11 ORBITA` · `12 PENTAGRAMMA`

Gruppi editoriali:
- Astronomia: STELLA, PIANETA, SATELLITE, ORBITA.
- Musica: VIOLINO, NOTA, TROMBA, PENTAGRAMMA.
- Insetti: BRUCO, APE, FORMICA, FARFALLA. *Caveat*: BRUCO è uno stadio larvale di un insetto, non il nome di un insetto adulto; va validato editorialmente e, se la categoria risulta troppo vaga, sostituito.

Esempio di evento: `2-6` collega VIOLINO–NOTA. La linea appare in tempo reale e il primo autore ottiene punti.

> Il dataset di produzione dovrà scegliere categorie non banali e controllare le letture alternative; questo esempio serve solo a illustrare l'interfaccia.

## 6. Tempo partita proposto (150 secondi)

| Intervallo | Evento |
|---|---|
| 0–10 s | Presentazione tessere, regola sintetica in sovrimpressione. |
| 10–110 s | Connessioni libere, punteggi e linee aggiornate dal bot. |
| 110–135 s | Indizio visivo o testuale sul gruppo meno risolto. |
| 135–150 s | Rush finale; completamento, reveal e podio. |

Durate più brevi: modalità **Sprint 90 s** con meno parole, per esempio 9 tessere/3 gruppi da 3; è una variante da testare e non il formato predefinito.

## 7. Punteggio sperimentale

- +10 per ogni collegamento nuovo e valido, attribuito al primo autore.
- +15 per la connessione che completa un gruppo.
- +5 per il primo contributo valido di un nuovo partecipante, massimo una volta per partita, per limitare il monopolio dei più rapidi.
- Nessuna sottrazione automatica per i tentativi sbagliati durante il prototipo; prevedere invece un **cooldown antispam** per utente.
- Vittoria collettiva: tutte le costellazioni scoperte entro il tempo.
- Vittoria individuale: punteggio più alto; spareggio sul numero di connessioni uniche, poi sul timestamp acquisito dal bot.

I valori vanno ricalibrati con simulazioni su chat di 10, 50, 200 spettatori.

## 8. Modalità dello streamer

**Automatica:** il bot gestisce tabellone, timer, indizi, accettazione, reveal e classifica.  
**Interattiva:** lo streamer può anticipare/posticipare un indizio, scegliere fra due difficoltà preparate o attivare un evento visivo. Non può assegnare arbitrariamente punti a chi preferisce.

## 9. Interfaccia proposta per la diretta

- Area centrale ampia per 12 parole con numeri ben leggibili.
- Connessioni colorate e animate, evitando sovrapposizioni che rendano il grafo illeggibile.
- Barra superiore: timer, gruppi completati, progresso collettivo.
- Fascia laterale/inferiore: ultimi collegamenti validi con avatar, top 5 e istruzione breve `SCRIVI 3-8 IN CHAT`.
- Transizioni ridotte e modalità ad alto contrasto, adatte anche a chi guarda dal telefono.

## 10. Anti-ambiguità, equità e moderazione

- Relazioni accettate predeterminate e verificabili **per specifico puzzle**: l'embedding semantico è un ausilio di generazione, non una prova definitiva di correttezza.
- I termini polisemici che creano collegamenti alternativi forti devono essere sostituiti o esplicitamente registrati.
- Il bot normalizza input e gestisce duplicati, flooding, timestamp e messaggi ricevuti quasi insieme.
- Ciascun collegamento viene assegnato una sola volta; accettazioni tardive non spostano retroattivamente il punteggio.
- Una modalità spettatore rende visibili gli archi trovati senza interrompere l'azione.

## 11. Dati minimi per un puzzle (proposta)

```json
{
  "puzzle_id": "cos-demo-001",
  "language": "it",
  "tiles": [{"id": 1, "word": "stella"}],
  "groups": [{"id": "g1", "label": "astronomia", "tile_ids": [1, 4, 8, 11]}],
  "allowed_edges": [[1, 4], [4, 8], [8, 11]],
  "difficulty": "intro",
  "qa_status": "draft"
}
```

Esempio intenzionalmente parziale: non costituisce un puzzle caricabile completo.

## 12. Rischi e test prima dell'implementazione

- **Somiglianza a Connections:** validare il valore aggiunto della mappa e delle connessioni incrementali.
- **Ambiguità semantica:** test cieco su gruppi e archi con revisori indipendenti.
- **Squilibrio utenti rapidi:** testare bonus newcomers e limiti di claim per persona.
- **Grafo caotico:** prototipo visivo con 12 tessere e 9+ archi.
- **Chat ad alto volume:** benchmark del parser con messaggi concorrenti e duplicati.

### Criteri preliminari di successo

- Regola comprensibile in ≤15 s.
- Almeno il 70% dei test round completabili entro 150 s con una chat simulata e dataset calibrato (obiettivo sperimentale, non dato osservato).
- Assenza di archi validi contestabili nel campione testato.

## 13. Decisioni aperte

1. Completamento del gruppo: tre collegamenti che connettono quattro tessere o scoperta esplicita del nome della categoria?
2. Accettare tutti gli archi intra-gruppo o solo quelli editorialmente autorizzati?
3. Avanzamento degli indizi: temporizzato oppure attivato dallo stallo?
4. Premio di squadra: solo animazione o metaclassifica delle vittorie collettive?

## 14. Riferimenti meccanici

- NYT Connections, istruzioni ufficiali: https://thenewyorktimeshelpcenter.helpjuice.com/360011158491-New-York-Times-Games/28525912587924-Connections
- Codenames, descrizione ufficiale: https://www.codenamesgame.com/boardgames/codenames

**Prossimo passo Superpowers:** scegliere e approvare il comportamento chiave; solo dopo preparare la specifica di progetto e il piano tecnico.

# ZeroQuizz · Come si scrivono le domande

Questa guida è per chi scrive le domande di ZeroQuizz (nel codice si chiama ancora `quizzland`): una persona, oppure Claude quando prepara una bozza da rivedere.
Spiega cosa rende buona una domanda, quanto testo entra a schermo (misurato sull'overlay vero), come si sceglie la difficoltà, come si compone il mazzo e come lo si migliora con le risposte raccolte in live.

---

## 0. In breve

1. **È un quiz d'intelligenza, non di cultura.** Si risolve ragionando in 20 secondi e non si trova su Google in 20 secondi.
2. **Ogni domanda ha una trappola onesta.** Esiste una risposta "di pancia" sbagliata. Quella giusta diventa ovvia appena si legge la spiegazione.
3. **Una sola risposta difendibile.** Se un pignolo in chat può sostenere un'altra opzione, la domanda va riscritta.
4. **Si legge in 6 secondi.** La domanda resta entro 90 caratteri, le risposte entro 12–22. Domanda e risposte insieme non superano 150 caratteri.
5. **Ogni risposta sbagliata è un errore che qualcuno farebbe davvero.** Niente risposte riempitivo.
6. **La spiegazione è il premio.** Una frase di massimo 110 caratteri che nomina la trappola e il passaggio chiave.
7. **I dati decidono.** La difficoltà scritta è un'ipotesi. Dopo 30 risposte contano le percentuali della chat.

---

## 1. Perché funziona in live

- Chi guarda arriva a metà, scorre, risponde con una lettera e ha 20 secondi.
- La risposta che vale è la prima. Il bonus velocità arriva fino a +50%: chi aspetta per copiare dalla chat guadagna meno.
- La classifica si muove solo alla rivelazione, quindi la tensione regge fino all'ultimo secondo.
- Un quiz di ragionamento non esclude nessuno: non serve aver studiato una materia e non conta da dove vieni. Chi entra in live può giocare subito.
- La trappola fa discutere la chat ("è B!", "no è C!"), e ogni commento è una risposta che spinge la live.
- La spiegazione chiude il momento con un "ah, certo!", che fa restare per la domanda dopo.

**La regola d'oro: chi sbaglia deve pensare "ci sono cascato", mai "domanda truccata".**

---

## 2. Quanto testo entra a schermo

Misurato sull'overlay vero, con i caratteri Fredoka e Nunito, in verticale 9:16 (TikTok) e in orizzontale 16:9 (Twitch, YouTube).
Il testo troppo lungo non esce mai dal riquadro: il gioco lo rimpicciolisce, e il limite vero è quanto si legge in fretta.

| Elemento | Verticale | Orizzontale | Regola |
|---|---|---|---|
| Domanda | Fino a 90 caratteri: carattere grande, 2–3 righe. Da 91 a 130: carattere più piccolo, 4 righe. Da 140: 5 righe o più | 85 caratteri = 4 righe, 120 = 5 righe | **Ideale ≤ 90, massimo 130** |
| Risposta, durante la domanda | Una riga fino a circa 30 caratteri | Le risposte stanno in una griglia 2×2: una riga fino a circa 11 caratteri, due fino a 22. Oltre, il testo si rimpicciolisce | **Ideale ≤ 12, massimo 22** |
| Parola più lunga in una risposta | Circa 30 lettere | 13 lettere ("Scorrettamente", 14 lettere, si rimpicciolisce un poco) | Parole di massimo 13 lettere |
| Spiegazione | 115 caratteri = 2 righe, 135 = 3 righe | 115 = 1 riga, 135 = 2 righe | **Massimo 110** |

**Tempo di lettura.** Contiamo circa 15 caratteri al secondo, la velocità prudente dei sottotitoli.

| Elemento | Tempo disponibile | Limite che ne deriva |
|---|---|---|
| Domanda + risposte | Al massimo 10 secondi dei 20 | Insieme ≤ 150 caratteri |
| Spiegazione | Gli 8 secondi della rivelazione, mentre si guardano anche le percentuali e il podio | ≤ 110 caratteri |

Restano almeno 10 secondi per pensare e scrivere.

---

## 3. Come è fatta una buona domanda

### 3.1 Il testo

- **Lessico.** Usa la seconda persona e il presente, parole di tutti i giorni e contesti concreti: pizza, euro, treno, gatti.
- **Numeri.** Scrivi i numeri in cifre ("5 gatti", non "cinque gatti"). Il calcolo si fa a mente: fattori di massimo 2 cifre e niente frazioni o decimali difficili.
- **Struttura.** La domanda vera è nell'ultima frase e finisce con "?". Il contesto viene prima ed è breve.
- **Niente domande al negativo** ("Quale NON è…"). L'overlay non ha grassetto, e il "non" si perde.
- **Notazione senza ambiguità.**
  - Usa × e : come a scuola.
  - Mai scritture tipo `6:2(1+2)`, che dividono anche i matematici.
  - Mai frasi a doppia lettura come "la metà di 2 + 2".
- **Mai rimandare a immagini o colori**: il gioco mostra solo testo.

### 3.2 Le risposte

Ce ne sono **4** di solito. Ne bastano 3 quando non esiste un terzo errore credibile.
Mai 2: con Vero/Falso si indovina una volta su due e la classifica perde senso.

Ricetta per le domande di difficoltà 2 e 3. Ogni risposta sbagliata ha un ruolo:

| Ruolo | Esempio (penna e quaderno, sotto) |
|---|---|
| La giusta | 5 cent |
| **La trappola**: la risposta di pancia | 10 cent (1,10 − 1) |
| L'errore di calcolo vicino: un passaggio saltato, uno in più, un "± 1" | 55 cent (1,10 diviso 2) |
| L'altra lettura del testo | 1 € (si confonde la differenza con il prezzo) |

Altre regole:

- **Risposte omogenee.** Stessa forma e lunghezza simile. La risposta più lunga o più precisa delle altre tradisce di essere quella giusta.
- **Risposte numeriche in ordine crescente con `ordine_fisso = 1`.**
  - In ordine sparso sembrano disordinate e fanno perdere tempo.
  - Con l'ordine fisso la giusta finisce in una lettera precisa. Varia la sua posizione da una domanda all'altra: `domande.py stats` conta le lettere giuste delle domande a ordine fisso.
- **Il gioco mescola le risposte.** Quindi mai "Tutte le precedenti", "Nessuna delle precedenti" o "A e B". Se l'ordine conta (Primo, Secondo, Terzo), usa `ordine_fisso = 1`.
- **"Dipende" solo come risposta sbagliata**, mai come giusta.
- **Una risposta scherzosa solo nelle facili**, al massimo una. Nelle altre difficoltà riduce le scelte vere a tre.

### 3.3 La spiegazione

- È obbligatoria per le difficoltà 2 e 3, e consigliata per la 1.
- Ha una frase sola, massimo 110 caratteri, con due parti: perché la risposta di pancia è sbagliata, e poi il passaggio chiave.
- Non deve ripetere la domanda.

> Non 10 cent: se la penna costa 5, il quaderno costa 1,05 e insieme fanno 1,10.

---

## 4. Le famiglie

Ogni domanda appartiene a una **famiglia**: un'idea con il suo meccanismo di trappola e dei parametri che si possono cambiare.
Da una famiglia nascono 3–5 varianti con numeri e contesti diversi.

Le varianti servono a due cose:
- Il mazzo cresce senza perdere qualità.
- Chi torna spesso in live non può imparare a memoria la risposta: deve aver capito il metodo, e questo è un premio giusto.

Le idee classiche (enigmi popolari, test di riflessione) si possono usare: le idee non sono proteggibili. **Il testo invece è sempre nostro.** Non si copia da libri, app, programmi TV o file di domande di altri: è la stessa regola di ZeroDubbi.

Gli esempi di logica, numeri e trabocchetti di questa sezione sono già in gioco: sono le domande da q009 a q022 di `database/ZeroQuizz.sqlite3`.

### Logica

| Famiglia | Trappola | Esempio (giusta in grassetto) | Cosa si può cambiare |
|---|---|---|---|
| `pancia-differenza` | Si sottrae invece di dividere la differenza | Penna e quaderno costano 1,10 €. Il quaderno costa 1 € più della penna. Quanto costa la penna? **5 cent** · 10 cent · 55 cent · 1 € | Totale e differenza (la penna costa (T − D) : 2) |
| `lavoro-parallelo` | Si moltiplica il tempo | Se 3 forni cuociono 3 pizze in 3 minuti, quanti minuti servono a 30 forni per 30 pizze? **3** · 10 · 30 · 90 | Oggetti e numeri uguali tra loro |
| `raddoppio` | Si dimezza il tempo | La muffa raddoppia ogni giorno e copre il barattolo in 20 giorni. In quanti giorni ne copre metà? 5 · 10 · 15 · **19** | Numero di giorni; il triplo al posto del doppio |
| `fila` | Si conta due volte se stessi | In una fila sei 4° da davanti e 4° da dietro. Quante persone ci sono? 6 · **7** · 8 · 9 | Le due posizioni |
| `parentele` | Si conta per ogni figlia il fratello che hanno in comune | (q005) Un padre ha 4 figlie e ogni figlia ha 1 fratello… | Numeri e gradi di parentela |
| `calendario` | Si sbaglia il verso del conto | Se dopodomani è sabato, che giorno era ieri? **Mercoledì** · Giovedì · Venerdì · Domenica | Giorno e scarto |
| `cassetto` | Si pensa al caso peggiore sbagliato | Hai calzini rossi e blu e sei al buio. Quanti ne prendi per averne di sicuro 2 uguali? 2 · **3** · 4 · 5 | Numero di colori |
| `sorpasso` | Si pensa di prendere il posto di chi è stato superato | (q008) Se superi il secondo in una gara… | Posizione |

### Numeri

| Famiglia | Trappola | Esempio | Cosa si può cambiare |
|---|---|---|---|
| `successione` | Si applica la regola sbagliata | 1, 2, 4, 7, 11, … 14 · 15 · **16** · 18 | Raddoppio, +1 +2 +3, quadrati, Fibonacci. La regola si deve vedere in 3 termini |
| `paletti` | Si contano gli spazi, non i paletti | Un recinto dritto di 10 metri ha un paletto ogni metro, anche agli estremi. Quanti sono? 9 · 10 · **11** · 12 | Lunghezza e passo; tagli di un tronco |
| `percentuali` | +50% e −50% non si annullano | Un prezzo sale del 50% e poi scende del 50%. Com'è rispetto a prima? Uguale · Più alto · **Più basso** · Dipende dal prezzo | Percentuali |
| `precedenza` | Si calcola da sinistra a destra | Quanto fa 2 + 2 × 2? 4 · **6** · 8 · 10 | Numeri e operatori, solo × e : |
| `cifre` | Si dimentica la decina del 90 | Quante volte scrivi la cifra 9 contando da 1 a 100? 10 · 11 · 19 · **20** | La cifra (escluso 0) |
| `età` | Si mantiene il rapporto invece della differenza | Ho 10 anni e mia sorella la metà. Quando avrò 20 anni, quanti ne avrà lei? 5 · 10 · **15** · 20 | Età e rapporto |

### Trabocchetti

| Famiglia | Trappola | Esempio | Nota |
|---|---|---|---|
| `lettura-letterale` | Si risponde alla domanda che ci si aspettava | Un contadino ha 15 pecore e scappano tutte tranne 8. Quante gliene restano? 0 · 7 · **8** · 15 | Deve reggere alla lettura più letterale |
| `presupposto-falso` | La domanda contiene un errore che non si nota | Quante uova depone un gallo in un anno? **Nessuna** · 52 · 100 · 365 | |
| `peso-uguale` | Si confondono peso e volume | (q007) Ferro o piume… | |
| `parola-tranello` | Si legge il significato invece della parola | (q006) Scorrettamente | Controllare che una sola risposta funzioni |

**Le trappole vietate** sono quelle che hanno due risposte difendibili. Un esempio classico: "Quante volte puoi togliere 5 da 25?" ha "una volta" come risposta furba, ma "5 volte" è altrettanto vera.

### Due categorie possibili: `indovinelli` e `parole` (da decidere)

Si adattano bene a un pubblico ampio italiano e si scrivono in fretta.
Per aggiungerle servono un colore e un'icona nel codice: poche righe in `packages/shared` e in `Quizzland.tsx`.

- **Indovinelli**
  - "Più ne togli, più diventa grande. Cos'è?" **La buca**
  - "Cosa si rompe appena lo nomini?" **Il silenzio**
- **Parole**
  - "Quale parola si legge uguale anche al contrario?" **Radar** · Rotta · Rana · Ramo
  - Attenzione agli anagrammi: di ROMA lo sono MORA, RAMO e ORMA, quindi più risposte sarebbero giuste.

---

## 5. La difficoltà

| Livello | Com'è fatta | Giuste attese | A cosa serve in live |
|---|---|---|---|
| 1 Facile | Un passaggio, nessuna trappola o una trappola evidente | ≥ 70% | Accoglie chi arriva, dà punti a tutti, scalda la chat |
| 2 Media | Una trappola, oppure due passaggi | 40–70% | Il grosso del gioco |
| 3 Difficile | Una trappola forte, scelta dalla maggioranza, oppure tre passaggi | 15–40% | Il picco: discussione in chat, momento giusto per la rosa del 50:50 |

**La calibrazione con i dati** si fa dopo almeno 30 risposte arrivate da almeno 3 partite. A quel punto la difficoltà misurata sostituisce quella scritta.

- **Contano le prime 10 risposte di ogni partita**, ordinate per tempo. Chi risponde dopo spesso copia dalla chat, e le risposte tardive gonfiano la percentuale.

**Gli allarmi:**

| Segnale | Cosa vuol dire | Cosa fare |
|---|---|---|
| Giuste < 15% | Trappola fortissima, oppure domanda ambigua o sbagliata | Rileggere con il test del pignolo. Tenerla solo se la spiegazione convince |
| Una risposta sbagliata supera la giusta in una facile | La facile non è facile, oppure c'è un errore | Rialzare la difficoltà o correggere |
| Una risposta sbagliata sotto il 3% | Distrattore morto: le scelte vere sono tre | Sostituirla con un errore più credibile |
| Giuste > 90% in una media o difficile | Troppo facile | Abbassarla a 1 o rendere più forte la trappola |
| Tempo medio delle giuste > 15 s | Troppo lunga da leggere o da calcolare | Accorciare il testo o semplificare i numeri |

---

## 6. Il mazzo: quante domande e con che mix

Con le impostazioni predefinite ogni domanda dura 20 + 8 + 5 secondi, cioè circa **110 domande l'ora**.
Il server propone prima le domande meno giocate, così una domanda ritorna solo quando tutte le altre sono uscite.

| Fase | Domande attive | Perché |
|---|---|---|
| Prima prova in live | 120 (40 per categoria) | Un'ora senza ripetizioni |
| Lancio | 250 | Una live di 2 ore senza ripetizioni |
| A regime | 600 e più, poi +50 a settimana guidate dai dati | Chi torna 3 volte a settimana rivede una domanda di rado, e quando succede è spesso una variante |

**Il mix:**
- Difficoltà: 35% facili, 45% medie, 20% difficili.
- Nessuna categoria sotto il 20%.
- Nessuna famiglia oltre il 3% del mazzo.

---

## 7. Il ritmo della live (proposta per il server)

Oggi il server sceglie a caso tra le domande meno giocate. Può quindi capitare che escano tre difficili di fila, o tre domande della stessa categoria.
La proposta:

- **Onde di difficoltà**: il ciclo F, M, F, M, D (facile, media, difficile) si ripete. Rispetta il mix del 35/45/20 e dà un picco ogni cinque domande.
- **Partenza morbida**: le prime 2 domande della live, e quelle dopo una pausa, sono facili.
- **Varietà**: mai due domande della stessa categoria di fila, e mai due della stessa famiglia entro 30 domande.
- **Tempo per difficoltà**: +5 secondi per le difficili, come impostazione.
- **50:50 che lascia la trappola**:
  - Oggi il 50:50 toglie due risposte sbagliate a caso.
  - Se la domanda indica qual è la trappola, il 50:50 toglie le altre e lascia la sfida "trappola contro giusta".
  - Il regalo aiuta ma la tensione resta, e la spiegazione ha ancora senso.

---

## 8. Dall'idea alla live

1. **Scegli una famiglia** (sezione 4) oppure creane una nuova con meccanismo, trappola e parametri.
2. **Scrivi 3–5 varianti** con numeri e contesti diversi. Le risposte numeriche si verificano con un calcolo, non a occhio.
3. **Test del pignolo.** Per ogni risposta sbagliata, prova per 30 secondi a sostenere che sia giusta. Se ci riesci, riscrivi la domanda.
4. **Controllo automatico**: `python script/domande.py stats` (oggi), più i controlli proposti nella sezione 10.
5. **Prova a freddo.** Leggila a due persone che non l'hanno scritta e cronometra: devono rispondere entro 15 secondi.
6. **Importala** (`python script/domande.py import`) e riavvia Zerocade.
7. **Ogni settimana guarda i dati:**
   - "Le più sbagliate" nella dashboard.
   - Le domande segnalate.
   - Il CSV di `/api/quizzland/export.csv`, con le scelte per lettera e i secondi medi.

   Poi riscrivi le domande che non vanno o ritirale con `attiva = 0`. **Non cancellare e non riusare mai un id**: le risposte salvate sono legate all'id.

---

## 9. Cosa non si scrive

- **Cultura generale e nozioni**: si cercano su Google e lasciano fuori chi non ha studiato quella cosa. Restano fuori finché non decidiamo una categoria apposta.
- **Temi delicati**:
  - Attualità, che invecchia presto.
  - Persone reali, politica, religione come tema.
  - Morte, violenza, tragedie, aspetto fisico.
  - Stereotipi di genere o di regione.
  - Tutto ciò che può far segnalare una live su TikTok.
- **Notazioni ambigue e domande con più risposte valide.**
- **Risposte del tipo "Tutte le precedenti" o "A e B"**: il gioco mescola le risposte.
- **Calcoli che non si fanno a mente.**
- **Testi copiati**: da libri, app, programmi TV o file di domande di altri.

---

## 10. Le 8 domande di oggi alla prova

| id | Esito | Intervento |
|---|---|---|
| q001 | Va bene | Risposte numeriche: in ordine crescente 24 · 28 · 30 · 32 con `ordine_fisso` |
| q002 | Va bene, difficile | Nessuno |
| q003 | Va bene: la trappola letterale regge, perché ogni mese ha un 28° giorno | 1 · 2 · 6 · 12 con `ordine_fisso` |
| q004 | **Ambigua**: "la metà di 2 + 2" si legge (2 + 2) : 2 = 2 oppure 2 : 2 + 2 = 3, e la chat avrebbe ragione in entrambi i casi | Riscriverla come "Quanto fa 2 + 2 : 2?" (giusta 3, una sola lettura), con 1 · 2 · 3 · 4 in ordine fisso |
| q005 | Va bene | 4 · 5 · 6 · 8 con `ordine_fisso` |
| q006 | Va bene | "Scorrettamente" ha 14 lettere: in orizzontale si rimpicciolisce un poco, accettabile |
| q007 | Va bene, facile | Nessuno |
| q008 | Va bene | Ha già l'ordine fisso |

---

## 11. Modifiche proposte agli strumenti

Sono proposte: niente di questo è ancora fatto.

| Cosa | Dove | A cosa serve |
|---|---|---|
| Colonne `famiglia`, `trappola` (la lettera della risposta trappola) e `note` | `ZeroQuizz.sqlite3`, CSV, `domande.py` | Varietà nel mazzo, 50:50 che lascia la trappola, statistiche sulla trappola |
| `python script/domande.py check` | `domande.py` | I limiti della sezione 2 e le regole della 3:<br>• errori: ambiguità note, "tutte le precedenti" senza ordine fisso<br>• avvisi: lunghezze, spiegazione mancante, risposte numeriche non in ordine, testi quasi uguali |
| `python script/domande.py calibra <zerocade.db>` | `domande.py` | Percentuali sulle prime 10 risposte di ogni partita, distrattori morti, difficoltà proposta. Con `--applica` la scrive |
| Onde di difficoltà, varietà, tempo per difficoltà | `apps/server/src/quizzland.ts` | Il ritmo della sezione 7 |
| Categorie `indovinelli` e `parole` | `packages/shared`, `Quizzland.tsx` | Da decidere |

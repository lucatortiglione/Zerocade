# Regolamento Ufficiale del Torneo Context (Tabellone Condiviso)

Questo documento definisce le regole ufficiali, la scala cromatica con le relative soglie di ranking logaritmico, il sistema di punteggio matematico a somma fissa, gli achievement onorari e i protocolli anti-stallo per i tornei di prossimità semantica (*stile Contexto*) disputati su **tabellone condiviso** (schermo comune, proiettore o live streaming).

---

## 1. Panoramica del Gioco

* **Obiettivo:** Trovare la parola segreta del round ($rank = 1$) nel minor tempo e con la migliore precisione concettuale.
* **Modalità:** Tabellone condiviso. Tutti i partecipanti giocano simultaneamente osservando lo stesso schermo comune: ogni parola inserita e il relativo punteggio di vicinanza sono visibili a tutti in tempo reale.
* **Condizione di Fine Manche:** Il round si conclude immediatamente non appena un giocatore digita la parola target ($rank = 1$) o allo scadere del timer limite della manche (es. 7 minuti).

---

## 2. Scala Cromatica e Soglie di Ranking

Il motore di prossimità semantica ordina l'intero vocabolario in base alla distanza vettoriale rispetto alla parola target. Il sistema adotta una suddivisione logaritmica a 5 fasce cromatiche caldo-freddo, riservando il colore **verde** in via esclusiva alla vittoria.

| Livello | Colore | Range di Posizione ($rank$) | Ampiezza | Significato Semantico |
| :--- | :--- | :--- | :--- | :--- |
| **Target** | **Verde Smeraldo** (`#2E7D32`) | **1** | 1 parola | **Vittoria:** Parola segreta indovinata. |
| **1** | **Rosso** (`#E53935`) | **2 – 100** | 99 parole | **Zona d'Attacco:** Sinonimi diretti, componenti fisici stretti, co-iponimi immediati. |
| **2** | **Arancione** (`#FB8C00`) | **101 – 600** | 500 parole | **Sottocategoria Specifica:** Oggetti, ruoli e azioni appartenenti allo stesso micro-dominio. |
| **3** | **Giallo** (`#FDD835`) | **601 – 2.500** | 1.900 parole | **Macro-Categoria:** Il contesto e l'ambito concettuale generale sono stati centrati. |
| **4** | **Ciano / Azzurro** (`#00ACC1`) | **2.501 – 7.500** | 5.000 parole | **Aggancio Debole:** Correlazione generica o situazionale; segna l'uscita dalla zona buia. |
| **5** | **Blu** (`#1565C0`) | **7.501+** | Resto del vocabolario | **Fuori Pista:** Nessuna correlazione semantica rilevante. |

*Nota di contrasto visivo:* Tutte le etichette usano testo bianco (`#FFFFFF`), ad eccezione della fascia **Gialla** che richiede testo scuro (`#212121`) per conformità WCAG AA.

---

## 3. Sistema di Punteggio a Somma Fissa (100 Punti per Round)

Ogni manche eroga esattamente **100 punti positivi complessivi**, divisi tra chi costruisce la scalata semantica e chi mette a segno il colpo decisivo.

$$\text{Punti Pioniere (max 40 pt)} + \text{Jackpot Risoluzione (min 60 pt + Rollover)} = 100\text{ pt}$$

```
   [ Ciano: +5 pt ]  ──►  se saltato ──┐
   [ Giallo: +10 pt ] ──►  se saltato ──┼──► confluiscono nel JACKPOT FINALE
   [ Arancio: +10 pt ]──►  se saltato ──┤    (Base: 60 pt + Rollover)
   [ Rosso: +15 pt ]  ──►  se saltato ──┘
```

### 3.1 Punti Progressione "Pioniere" (40 Punti Totali)
Vengono assegnati al **primo giocatore** che porta il tabellone all'interno di una fascia cromatica non ancora raggiunta:
* **Pioniere Ciano ($rank \le 7.500$):** $+5\text{ pt}$
* **Pioniere Giallo ($rank \le 2.500$):** $+10\text{ pt}$
* **Pioniere Arancione ($rank \le 600$):** $+10\text{ pt}$
* **Pioniere Rosso ($rank \le 100$):** $+15\text{ pt}$

### 3.2 Jackpot di Risoluzione con Rollover
* Il valore base assegnato a chi indovina la parola target ($rank = 1$) è pari a $60\text{ pt}$.
* Se durante la manche una o più fasce cromatiche vengono scavalcate senza essere state sbloccate, i relativi punti pioniere **non vengono bruciati**, ma **confluiscono automaticamente nel Jackpot Finale** incassato dal risolutore.

### 3.3 Esclusione di Punti Bonus sul "One-Shot"
* È **categoricamente escluso** qualsiasi punteggio bonus addizionale (moltiplicatori, gettoni extra o bonus numerici) per chi indovina la parola al primo colpo o senza indizi.
* Il massimale ottenibile in una manche resta tassativamente fissato a **$100\text{ pt}$** ($60\text{ pt}$ base $+ 40\text{ pt}$ rollover). Questa regola tutela l'equità del torneo, evitando che una casualità statistica fortuita chiuda anzitempo la competizione scavando divari incolmabili.
* L'impresa del "One-Shot" viene riconosciuta unicamente sul piano onorario tramite badge e criterio prioritario di spareggio (cfr. Sezione 7).

### 3.4 Malus Mirato: "Filtro Ghiaccio" (Anti-Spam)
* **Tentativo in Fascia Blu ($rank > 7.500$):** $-2\text{ pt}$ individuali al giocatore che ha inviato la parola.
* **Tentativi in Fascia Ciano, Gialla, Arancione o Rossa:** $0\text{ pt}$ di penalità, incentivando la partecipazione e l'esplorazione del contesto.

---

## 4. Avanzamento a Senso Unico (*High-Water Mark*) e Matrice del Rollover

1. **Blocco Irreversibile:** Non appena viene inserita una parola appartenente a un livello superiore (es. Arancione), tutte le fasce inferiori (Ciano e Giallo) vengono disattivate in modo definitivo. Nessun giocatore potrà guadagnare punti pioniere inserendo parole di quelle categorie.
2. Le parole appartenenti a fasce già superate compariranno sul tabellone unicamente a titolo consultivo ($0\text{ pt}$).

### Matrice di Calcolo del Jackpot Finale

| Scenario di Scalata | Fasce Conquistate dai Pionieri | Punti Pioniere Erogati | Punti Saltati (Rollover) | Jackpot Finale Assegnato | Totale Manche |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Scalata Completa** | Ciano, Giallo, Arancio, Rosso | $40\text{ pt}$ | $0\text{ pt}$ | $60\text{ pt}$ | $100\text{ pt}$ |
| **Salto Intermedio** | Giallo, Rosso | $25\text{ pt}$ | $15\text{ pt}$ (Ciano $5$ + Arancio $10$) | $75\text{ pt}$ ($60 + 15$) | $100\text{ pt}$ |
| **Salto Audace** | Arancione, Rosso | $25\text{ pt}$ | $15\text{ pt}$ (Ciano $5$ + Giallo $10$) | $75\text{ pt}$ ($60 + 15$) | $100\text{ pt}$ |
| **Salto Cecchino** | Solo Rosso | $15\text{ pt}$ | $25\text{ pt}$ (Ciano $5$ + Giallo $10$ + Arancio $10$) | $85\text{ pt}$ ($60 + 25$) | $100\text{ pt}$ |
| **"One-Shot" Immediato** | Nessuna fascia | $0\text{ pt}$ | $40\text{ pt}$ (Tutte le fasce) | $100\text{ pt}$ ($60 + 40$) | $100\text{ pt}$ |

---

## 5. Meccanica Anti-Spam: Cooldown Dinamico

Per impedire che la digitazione forsennata prevalga sul ragionamento, ogni tentativo applica un timer di attesa (*cooldown*) al singolo giocatore prima che questi possa inviare un'altra parola.

### 5.1 Tabella Integrata di Gioco

| Fascia Colore | Range $rank$ | Bonus Pioniere | Quota Rollover | Cooldown Individuale | Malus Punti |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Target (Verde)** | 1 | — | — | Fine Round | $0\text{ pt}$ |
| **Rosso** | 2 – 100 | $+15\text{ pt}$ | $15\text{ pt}$ | **5 secondi** *(+1 tentativo rapido)* | $0\text{ pt}$ |
| **Arancione** | 101 – 600 | $+10\text{ pt}$ | $10\text{ pt}$ | **6 secondi** | $0\text{ pt}$ |
| **Giallo** | 601 – 2.500 | $+10\text{ pt}$ | $10\text{ pt}$ | **8 secondi** | $0\text{ pt}$ |
| **Ciano** | 2.501 – 7.500 | $+5\text{ pt}$ | $5\text{ pt}$ | **12 secondi** | $0\text{ pt}$ |
| **Blu** | 7.501+ | $0\text{ pt}$ | — | **20 secondi** | $-2\text{ pt}$ |

*Nota sul Rosso:* Chi sblocca per primo la fascia Rossa ottiene una finestra esclusiva di **1 tentativo bonus immediato** (entro 10 secondi) prima che gli avversari possano inviare la parola successiva.

---

## 6. Risoluzione dei Blocchi e Dinamiche di Flusso

### 6.1 Regola "Last Player Standing" (Prevenzione dello Stallo)
Se tutti i giocatori tranne uno si trovano contemporaneamente in stato di cooldown:
* Il cooldown dell'**ultimo giocatore rimasto attivo** non potrà superare i **4 secondi**, a prescindere da quanto sia distante la parola digitata.

### 6.2 Risoluzione del Deadlock: "Global Thaw" (Scongelamento Collettivo)
Se per qualsiasi motivo tutti i giocatori finiscono contemporaneamente bloccati dal proprio timer:
1. I timer individuali residui vengono immediatamente azzerati.
2. Sullo schermo condiviso appare un avviso visivo con conto alla rovescia di **3 secondi** (`3... 2... 1... VIA!`).
3. Allo scadere del countdown, la possibilità di invio si riattiva contemporaneamente per tutti i concorrenti.

---

## 7. Achievement Onorari (Senza Punti Torneo)

Gli achievement valorizzano le giocate memorabili senza alterare la classifica matematica a somma fissa:

* 🎯 **"Hole in One" (Oracolo):** Assegnato a chi indovina la parola target al primissimo tentativo del round ($rank = 1$). Non assegna punti extra ($0\text{ pt}$), ma conferisce la priorità assoluta nei criteri di spareggio finale.
* 🧭 **"Pioniere Supremo":** Assegnato a chi riesce a sbloccare 3 o più fasce cromatiche nella stessa manche.
* 🧊 **"Fuoco sotto il Ghiaccio":** Assegnato a chi chiude la manche trovando il target dopo aver subito almeno due penalità in fascia Blu nello stesso round.

---

## 8. Struttura del Torneo e Classifica

* **Formato Consigliato:** Il torneo si articola su un totale di **5 o 7 manche**.
* **Punteggio Torneo:** La classifica finale si calcola sommando algebricamente i punteggi ottenuti da ciascun giocatore in ogni manche:

$$\text{Punteggio Totale} = \sum (\text{Punti Pioniere} + \text{Jackpot Risoluzione} - \text{Malus Filtro Ghiaccio})$$

* **Criteri Ufficiali di Spareggio:** In caso di parità di punteggio al termine del torneo, i criteri di priorità sono:
  1. Possesso dell'achievement onorario **"Hole in One"**.
  2. Maggior numero di **Jackpot di Risoluzione** incassati (vittorie di manche).
  3. Maggior numero di bonus **Pioniere d'Élite** ottenuti (somma di Arancione e Rosso).
  4. Minor numero complessivo di **penalità subite** (tentativi in fascia Blu).
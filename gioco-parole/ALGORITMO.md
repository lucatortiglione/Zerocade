# ZeroWords · Algoritmo di generazione di griglie e parole

Questo documento descrive, passo per passo, come ZeroWords costruisce ogni livello: la ruota di lettere, le parole dello schema, le parole bonus, la disposizione a incastro e le due varianti di difficoltà. Descrive l'algoritmo **così come è implementato**. Dove il codice si discosta dalla specifica di partenza, o fissa un valore che la specifica non dava, lo dice esplicitamente (vedi [Scelte non coperte dalla specifica](#14-scelte-non-coperte-dalla-specifica)).

## Indice

1. [Principi](#1-principi)
2. [Il lessico: da dove vengono le parole](#2-il-lessico-da-dove-vengono-le-parole)
3. [Dal numero del livello ai parametri](#3-dal-numero-del-livello-ai-parametri)
4. [Stadio 1 · La ruota e le parole](#4-stadio-1--la-ruota-e-le-parole)
5. [Stadio 2 · Lo scheletro dell'archetipo](#5-stadio-2--lo-scheletro-dellarchetipo)
6. [Stadio 3 · Il riempimento (CSP)](#6-stadio-3--il-riempimento-csp)
7. [Stadio 4 · Il solver umano simulato e la retroazione](#7-stadio-4--il-solver-umano-simulato-e-la-retroazione)
8. [Stadio 5 · L'ordine della ruota](#8-stadio-5--lordine-della-ruota)
9. [Stadio 6 · Le varianti DDA](#9-stadio-6--le-varianti-dda)
10. [Il livello in gioco: server, chat e difficoltà automatica](#10-il-livello-in-gioco-server-chat-e-difficoltà-automatica)
11. [Esempi reali](#11-esempi-reali)
12. [Strumenti, controllo e risultati](#12-strumenti-controllo-e-risultati)
13. [Tutti i parametri](#13-tutti-i-parametri)
14. [Scelte non coperte dalla specifica](#14-scelte-non-coperte-dalla-specifica)
15. [Limiti noti](#15-limiti-noti)

## 1. Principi

- **Livelli senza fine.** Non esiste un ultimo livello: il server di Zerocade genera il livello n quando il gioco ci arriva.
- **Deterministico.** Il livello n dipende solo da n, dal lessico e da `tools/curve.json`. Lo stesso numero dà sempre la stessa ruota, la stessa griglia e le stesse varianti, quindi non serve salvare i livelli: si salva solo il numero raggiunto.
- **Indipendente.** Ogni livello si genera da solo, senza conoscere i precedenti. Le regole che evitano le ripetizioni (§4.2) non hanno bisogno di memoria.
- **Guidato dalla difficoltà.** Ogni livello ha un bersaglio T ∈ [0, 100] (curva a dente di squalo). La griglia è accettata quando la difficoltà misurata da un solver che imita un giocatore (D_sim) cade entro ±3 punti da T.
- **Tre griglie per livello.** Oltre alla Standard (T) ci sono un'Agevolata (T − 15) e un'Esperto (T + 12) sulla stessa ruota; il server sceglie quale giocare.

| File | Ruolo |
|---|---|
| `apps/server/src/wordgen/curve.ts` | Curva T(c, i), dimensioni di ruota e griglia (legge `tools/curve.json`) |
| `apps/server/src/wordgen/lexicon.ts` | Lessico, ranghi di frequenza, indice dei multinsiemi |
| `apps/server/src/wordgen/board.ts` | Griglia, vincoli rigidi, ritaglio, ricostruzione e controllo di uno schema |
| `apps/server/src/wordgen/generator.ts` | Stadi 1–6 |
| `apps/server/src/wordgen/worker.ts`, `levels.ts` | Generazione in un thread a parte, cache e precaricamento |
| `apps/server/src/wordgen/cli.ts` | Riga di comando per tarare e controllare |
| `apps/server/src/incastro.ts` | Il livello in gioco: chat, punti, aiuti, difficoltà automatica |
| `tools/curve.json` | Tutti i parametri regolabili |
| `tools/build_lexicon.py`, `tools/validate_levels.py` | Costruzione del lessico, controllo dei livelli |

## 2. Il lessico: da dove vengono le parole

`lexicon/it/words.tsv` è costruito una volta da `tools/build_lexicon.py`, partendo da due fonti libere (licenze in `lexicon/it/SOURCE`):

- **Morph-it!**, il lessico morfologico dell'italiano: ogni forma flessa (CASA, CASE, CANTAVO…), con la sua categoria grammaticale;
- **wordfreq**, la frequenza d'uso di ogni forma (scala Zipf: 3 = circa una volta per milione di parole).

**Normalizzazione.** Ogni forma passa in maiuscolo con gli accenti tolti (CITTÀ → CITTA). Restano solo le lettere A–Z e le parole da **4 a 10 lettere**: quelle da 3 lettere sono escluse ovunque.

**Escluse del tutto.** Nomi propri, sigle, simboli, interiezioni ed emoticon secondo Morph-it!, e le parole di `lexicon/blocklist_it.txt` (volgari, offensive, sensibili; anche per prefisso).

**Due livelli di parola.**

| Livello | Può stare nello schema | Accettata in chat | Quando |
|---|---|---|---|
| `main` | sì | sì | Frequenza Zipf ≥ 2,5, forma senza accenti, nessun pronome attaccato (MANGIARLO), non più comune in inglese che in italiano (ARE, HOME), "forma italiana" (finisce per vocale salvo eccezioni come PER, BAR, SPORT; niente J, K, W, X, Y; inizio pronunciabile), non in `lexicon/it/not_in_grid.txt` |
| `extra` | no | sì, come parola bonus | Ogni altra forma valida: rara, accentata, con pronome attaccato, nome comune che è anche nome proprio poco frequente |

Una forma che è anche un nome proprio (ROSA, MARCO) è `main` solo se è un nome, aggettivo o avverbio molto comune (Zipf ≥ 4,6).

Oggi il lessico ha circa 185.500 parole, di cui circa 31.800 `main`.

**Rango di frequenza.** Al caricamento, le parole sono ordinate per frequenza decrescente: il rango R_w è la posizione (1 = la più comune). Le parole `main` hanno rango tra circa 1 e 33.000; la scala dei ranghi guida tutta la rarità delle griglie.

**Indice dei multinsiemi.** Ogni parola è indicizzata con la sua **firma**, cioè le lettere in ordine alfabetico (CARTE → ACERT, TRACE → ACERT). Tutte le parole con la stessa firma sono anagrammi tra loro.

## 3. Dal numero del livello ai parametri

### 3.1 Curva a dente di squalo

I livelli sono divisi in **denti** di 10 livelli (due per capitolo da 20). Il livello n sta nel dente `c = ⌊(n − 1) / 10⌋`, alla posizione `i = (n − 1) mod 10`:

```
T(c, i) = forma[i] + rampa(c)                         limitato a 0..100
forma   = [68, 68, 68, 71, 74, 77, 80, 83, 92, 40]
rampa   = −12 + 18 · (1 − e^(−c / 30))                 da −12 verso +6
```

| Posizione i | Fase | Archetipo | T al primo dente | T a regime |
|---|---|---|---|---|
| 0–2 | Inizio dente (duro) | A · Telaio asimmetrico | 56 | 74 |
| 3–7 | Salita | B · Doppio lobo a ponte | 59 → 71 | 77 → 89 |
| 8 | Picco boss | C · Arcipelago a ramificazione | 80 | 98 |
| 9 | Scarico | D · Arena densa | 28 | 46 |

La rampa non finisce: è al 63% del percorso dopo 30 denti (livello 300), al 95% dopo 90 (livello 900), e da lì il dente si ripete quasi uguale.

### 3.2 Dimensioni

```
g(n)     = 1 − e^(−(n − 1) / 300)                      crescita da 0 verso 1
lettere  = min(9, round(6 + 3·g) + bonus_archetipo)     bonus: A, B, C +1; D 0
K        = round((8 + 12·g) · molt_archetipo)           molt: A 0,9 · B 1,1 · C 1,0 · D 1,2
```

La **matrice di lavoro** ha circa `K × celle_per_parola` celle (A 11, B 10, C 10, D 8), in verticale con rapporto righe/colonne ≈ 1,3, almeno lunga quanto la parola più lunga e al massimo 16 × 13. Alla fine lo schema viene ritagliato sul rettangolo che contiene davvero le parole.

Valori calcolati dalla curva attuale:

| Livello | Dente c | Posizione i | Archetipo | T | Lettere della ruota | Parole K |
|---|---|---|---|---|---|---|
| 1 | 0 | 0 | A | 56,0 | 7 | 7 |
| 4 | 0 | 3 | B | 59,0 | 7 | 9 |
| 9 | 0 | 8 | C | 80,0 | 7 | 8 |
| 10 | 0 | 9 | D | 28,0 | 6 | 10 |
| 11 | 1 | 0 | A | 56,6 | 7 | 8 |
| 100 | 9 | 9 | D | 32,7 | 7 | 14 |
| 300 | 29 | 9 | D | 39,2 | 8 | 19 |
| 600 | 59 | 9 | D | 43,5 | 9 | 22 |
| 1.000 | 99 | 9 | D | 45,3 | 9 | 23 |
| 100.000 | 9.999 | 9 | D | 46,0 | 9 | 24 |

### 3.3 Il ciclo di un livello

```
genera_livello(n):
    T, archetipo = curva(n)
    lettere, K   = dimensioni(n, archetipo)
    rng          = generatore casuale con seme "zerowords:n"
    r            = T / 100                              # rarità di partenza
    migliore     = nessuno
    ripeti fino a 14 volte:
        griglia = tentativo(n, archetipo, lettere, K, r, rng)       # stadi 1–4
        se nessuna griglia: r += rumore(±0,15); continua
        se |D(griglia) − T| < |D(migliore) − T|: migliore = griglia
        se |D(griglia) − T| ≤ 3: esci
        r = r − 0,012 · (D(griglia) − T)                # retroazione
    livello = ritaglia(migliore), con ruota ordinata (stadio 5)
    livello.varianti = varianti(migliore, T)            # stadio 6
```

## 4. Stadio 1 · La ruota e le parole

### 4.1 Rarità

Un parametro r ∈ [0, 1] stabilisce a quale rango puntano il seme e le parole dello schema, su scala logaritmica:

```
rango_seme_voluto   = exp(lerp(ln 400, ln 16.000, r))
rango_parole_voluto = exp(lerp(ln 600, ln 22.000, r))
```

r parte da T/100 e viene spostato dalla retroazione (§7.4): più D_sim è sotto T, più le parole diventano rare.

### 4.2 Il seme, senza ripetizioni e senza memoria

I semi possibili sono le parole `main` di 6 e 7 lettere, una per firma (per ogni gruppo di anagrammi si tiene la più comune): oggi circa 3.100 da 6 lettere e 5.200 da 7.

1. **Gruppi.** Una volta per tutte, ogni seme finisce in uno di **50 gruppi**, con un hash della parola. Il livello n pesca solo dal gruppo `n mod 50`. Due livelli a meno di 50 di distanza pescano da gruppi diversi, quindi non condividono mai il seme, e quindi la ruota.
2. **Fascia.** Nel gruppo, i semi sono ordinati per vicinanza del log-rango a `rango_seme_voluto`; si considerano prima i 300 più vicini.
3. **Punto di partenza.** Il livello n comincia a scorrere la fascia dalla posizione `⌊frac(n · φ) · 300⌋` (φ = 0,618…, il rapporto aureo), poi la gira tutta e passa agli altri semi del gruppo. Così due livelli dello stesso gruppo con la stessa rarità (per esempio n e n + 50) non partono dallo stesso seme.

Il seme ha 7 lettere se la ruota ne ha almeno 7, altrimenti 6.

### 4.3 Le lettere in più

Se la ruota deve avere 8 o 9 lettere, al seme se ne aggiungono 1 o 2, estratte a caso con peso pari alla loro frequenza in italiano:

| E | A | I | O | N | L | R | T | S | C |
|---|---|---|---|---|---|---|---|---|---|
| 11,8 | 11,7 | 11,3 | 9,8 | 6,9 | 6,5 | 6,4 | 5,6 | 5,0 | 4,5 |

Nessuna lettera può comparire più di tre volte. È un'unione di multinsiemi: le lettere si aggiungono anche se già presenti (PRURITO + O → 8 lettere con due O).

### 4.4 Tutte le parole della ruota

```
parole_formabili(ruota):
    lettere = lettere della ruota in ordine alfabetico
    visita ogni sotto-multinsieme di 4 o più lettere, una volta sola
        (a parità di posizione, una lettera uguale alla precedente si salta)
    per ciascuno: aggiungi tutte le parole del lessico con quella firma
```

Per 9 lettere tutte diverse sono al massimo 382 consultazioni dell'indice, ben sotto il millisecondo. Il risultato 𝒱(ℛ) contiene parole `main` ed `extra`.

### 4.5 Schema e bonus

Le parole formabili si dividono in due code:

- **𝒱_grid**, candidate allo schema: solo parole `main`, ordinate per punteggio
  ```
  punteggio(w) = −|ln R_w − ln rango_parole_voluto| + 0,25 · lunghezza(w) + rumore(0..0,7)
  ```
  quindi rango vicino a quello voluto, parole lunghe un po' favorite, e un po' di varietà. Se ne tengono le prime max(3K, K + 12).
- **𝒱_bonus**, tutte le altre: le `extra` e le `main` che non entrano nello schema. In chat valgono come **parole extra** (1 punto).

**Regola dell'inizio dente (archetipo A).** Almeno l'85% delle parole dello schema deve avere 5 o più lettere. Nello schema entrano al massimo ⌊0,15 · K⌋ parole da 4 lettere, e il bacino ne tiene al massimo 2 in più; le altre finiscono tra le bonus.

### 4.6 Filtri che scartano subito una ruota

Costano poco e non consumano il tentativo (si passa al seme successivo, fino a 400 semi scorsi per tentativo):

- **Rapporto esca:** |𝒱(ℛ)| / K sotto la soglia dell'archetipo (A 1,8 · B 1,6 · C 2,0 · D 1,3). Una ruota povera darebbe uno schema senza "parole esca", cioè senza parole valide fuori dallo schema.
- **Bacino:** meno di K parole in 𝒱_grid.
- **Parole lunghe:** meno di K − (limite di parole da 4 lettere) parole da 5+ lettere.

Le ruote che passano arrivano alla griglia: dopo 10 ruote arrivate alla griglia senza successo, il tentativo si ferma.

## 5. Stadio 2 · Lo scheletro dell'archetipo

Prima del riempimento, ogni archetipo prepara la matrice: celle interdette e parole portanti.

### A · Telaio asimmetrico (inizio dente)

```
· · · · · · · ·
· · · · · · · W1      1. maschera: rettangolo interdetto tra il 40% e il 60%
· · · # # · · W1         di righe e colonne
· · · # # · · W1      2. W0 (la parola più lunga) sul bordo inferiore o destro
· W2  # # · · W1      3. W1, W2 la incrociano con le loro ultime lettere
· W2  · · · · W1         (indice ≥ L − 2): i prefissi restano scoperti
W0 W0 W0 W0 W0 W0 W0  4. W2 il più lontano possibile da W1 lungo W0
```

- W1 e W2 hanno almeno max(5, |W0| − 2) lettere e incrociano **solo** W0.
- Si provano fino a 3 parole W0 e 8 posizioni per ciascuna; se nessuna coppia di portanti entra, la ruota è scartata.

### B · Doppio lobo a ponte (salita)

Il livello 5 (ponte PRURITO nella colonna 4; # = cella interdetta):

```
· · · T O R R I        lobo superiore
· · · · · · U ·
· · · · P · P ·    ← lettera 0 del ponte (P)
· · P O R R I ·    ← lettera 1 (R): PORRI è l'unico aggancio dal lobo superiore
# # # # U # # #    ← corpo del ponte: righe interdette, tranne la colonna del ponte
# # # # R # # #
# # # # I # # #
· · T · T O P I    ← lettera L−2 (T): TOPI
· P U T O · U ·    ← lettera L−1 (O): PUTO
· · R · · · R ·        lobo inferiore
T R I O · · I ·
```

- **Ponte:** verticale, 7–8 lettere (o la più lunga disponibile), rango tra 6.000 e 9.500; se nessuna parola cade nella finestra, la più vicina in scala logaritmica.
- **Posizione:** al centro in verticale, nel terzo centrale in orizzontale. Le prime due lettere stanno nel lobo superiore, le ultime due in quello inferiore.
- **Isolamento:** tutte le righe del corpo (lettere da 2 a L − 3) sono interdette tranne la colonna del ponte. Il ponte è l'unico canale tra i lobi: per sbloccare un lobo partendo dall'altro bisogna passare dal ponte.
- **Equilibrio:** durante il riempimento la prossima parola va, quando può, nel lobo che ne ha meno.

### C · Arcipelago a ramificazione (picco boss)

- La parola più lunga al centro, niente maschere.
- **Vincolo rigido** sul numero ciclomatico del grafo delle parole: `μ = E − V + 1 ≤ 1` (V parole, E incroci). Un piazzamento con k incroci aggiunge k − 1 cicli, quindi quasi ogni parola può incrociarne una sola.
- Ne esce un albero pieno di foglie: trovare una parola aiuta pochissimo le altre, niente effetto a cascata.

### D · Arena densa (scarico)

- Nessuna maschera; la parola più lunga al centro geometrico.
- Gli incroci doppi (che chiudono cicli) e gli incroci sulle iniziali sono premiati dalla funzione di costo (§6.2).
- **Criterio:** almeno il 60% delle parole deve stare in un **rettangolo chiuso**, cioè due parole parallele che incrociano le stesse due parole perpendicolari. Se nessuna ruota ci arriva, si tiene quella che ci va più vicino.

## 6. Stadio 3 · Il riempimento (CSP)

### 6.1 Vincoli rigidi

Una parola w di lunghezza L può andare in direzione H o V a partire da (r, c) solo se:

1. resta dentro la matrice e non tocca celle interdette;
2. ogni cella già occupata contiene esattamente la lettera w[k], e non appartiene già a una parola nella stessa direzione;
3. la cella prima dell'inizio e quella dopo la fine sono vuote o fuori dai bordi (**isolamento di testa e coda**);
4. per ogni lettera che cade su una cella vuota, le due celle ortogonali sono vuote (**niente lettere affiancate**, *no side-kissing*);
5. incrocia almeno una parola già presente (tranne le parole dello scheletro);
6. nell'archetipo C, non porta μ oltre 1.

Le regole 3 e 4 garantiscono che nello schema non compaiano mai sequenze di lettere che non sono parole dichiarate.

**Trovare le posizioni.** La griglia tiene un indice lettera → celle ancora incrociabili (occupate in una sola direzione). Per una parola si guardano solo le celle con una sua lettera, e per ciascuna si calcola l'inizio che porta quella lettera sulla cella.

### 6.2 Funzione di costo dello slot

Tra le posizioni valide si sceglie quella con costo J minore:

```
J(w, slot) = 6,0 · |CR − CR_target|
           + 1,0 · segno_archetipo · Φ_prefisso
           + 1,5 · Φ_cicli
           + 1,5 · Φ_aspetto
```

| Termine | Calcolo |
|---|---|
| CR | Rapporto d'incrocio dopo il piazzamento: celle condivise / celle con lettere. Target: A 0,14 · B 0,17 · C 0,12 · D 0,30 |
| Φ_prefisso | Per ogni incrocio, l'indice della lettera sulla **più rara** delle due parole: +1 se è 0 o 1, −0,3 se è 2 o oltre. Segno: A e C ×1, B ×0,5, D ×−1 (D preferisce gli incroci sulle iniziali) |
| Φ_cicli | Cicli aggiunti (k − 1): ciascuno costa 1 oltre il massimo dell'archetipo, 0,2 sotto. In D vale −1 per ciclo (premio) |
| Φ_aspetto | \|ln((righe/colonne del rettangolo occupato) / 1,3)\| |

### 6.3 La ricerca

```
riempi(griglia, candidati):
    finché la griglia ha meno di K parole:
        opzioni = []
        per le prossime parole di candidati che entrano da qualche parte
                (6 parole per A, B, C; 40 per D):
            per ogni posizione valida: aggiungi (J, parola, posizione)
        se archetipo B: tieni le opzioni del lobo con meno parole, se ce ne sono
        prova le 3 opzioni con J minore, in ordine:
            piazza; se il resto riesce → fatto; altrimenti togli e prova la successiva
    al massimo 250 nodi; oltre, la ruota è scartata
```

Le parole che non entrano da nessuna parte vengono saltate e restano bonus. Un riempimento riuscito usa in mediana 20–40 nodi: il limite basso fa abbandonare presto le ruote senza speranza, che sono quelle che costano di più.

## 7. Stadio 4 · Il solver umano simulato e la retroazione

### 7.1 Difficoltà residua di una parola

```
d_t(w) = (α · L_w^1,4 + β · ln(1 + R_w)) · Π_{p ∈ svelate(w)} (1 − η(p, w[p]))       α = 1,0   β = 1,2
```

Il primo fattore è lo **sforzo a freddo** (lunghezza e rarità); il prodotto lo riduce per ogni lettera già svelata dagli incroci.

| Posizione della lettera svelata | η |
|---|---|
| p = 0 (iniziale) | 0,45 |
| p = 1 | 0,25 |
| p = L − 1 (desinenza) | 0,05 |
| corpo, consonante rara (Z G B F V P M) | 0,18 |
| corpo, altra consonante | 0,14 |
| corpo, vocale | 0,10 |

Esempio: VAGARE (6 lettere, rango 18.301) ha sforzo a freddo `6^1,4 + 1,2 · ln 18.302 ≈ 12,3 + 11,8 = 24,1`. Con la V iniziale svelata scende a `24,1 · 0,55 ≈ 13,2`. Con la sola E finale svelata, a `24,1 · 0,95 ≈ 22,9`.

### 7.2 La simulazione

```
simula(griglia):
    svelate = nessuna lettera
    finché restano parole:
        w = la parola non risolta con d_t minimo
        registra sforzo_t = d_t(w)
        risolvi w: le sue lettere si svelano sulle parole che la incrociano
    C_init = sforzo del primo turno            (attrito d'avvio)
    media  = media degli sforzi
    picco  = massimo degli sforzi              (la sua parola è il collo di bottiglia)
```

### 7.3 Il punteggio

```
D_grezzo = 0,3 · C_init + 0,4 · media + 0,3 · picco + 1,0 · |𝒱_bonus| / K
D_sim    = 100 · (D_grezzo − 8) / (30 − 8)          limitato a 0..100 nelle metriche
```

- **Termine delle esche:** più parole bonus per parola dello schema = più rumore per chi cerca.
- **Scala [8, 30]:** viene dalla calibrazione (`--calibrate`). I valori grezzi tipici per archetipo sono A 20–37, B 16–27, C 18–31, D 15–21, e la scala è scelta perché ogni archetipo possa raggiungere la sua fascia di T. Con i percentili 2–98 ([15,4, 36,7]) B e C non ci sarebbero mai arrivati.
- **Confronti:** tutti usano D_sim non limitato, così anche una griglia oltre la scala (sopra 100) può essere corretta.

### 7.4 La retroazione

- Griglia approvata se `|D_sim − T| ≤ 3`.
- Altrimenti `r ← r − 0,012 · (D_sim − T)`: per 10 punti di troppo la rarità scende di 0,12, quindi parole e seme più comuni. Poi si riprova.
- Al massimo 14 tentativi; poi resta la griglia più vicina a T, con lo scarto scritto nelle metriche.

## 8. Stadio 5 · L'ordine della ruota

Le lettere vengono mescolate fino a 500 volte. Si tiene l'ordine che, letto in cerchio in senso orario o antiorario, forma meno parole dello schema e mai la più lunga. Penalità: 100 per la parola più lunga, altrimenti la lunghezza della parola letta. La parola più lunga è sempre `words[0]` del livello, e il server la usa allo stesso modo quando il pubblico rimescola la ruota.

## 9. Stadio 6 · Le varianti DDA

Le varianti usano la stessa ruota e le stesse parole bonus della Standard, e nascono da sue copie modificate. Costano una frazione della Standard: niente nuova ruota, niente nuovo riempimento.

```
variante(standard, bersaglio, verso):
    griglia = copia(standard)
    ripeti fino a 6 volte:
        se D_sim ha raggiunto il bersaglio (entro 3, o oltre nel verso giusto): esci
        mosse = tutte le modifiche possibili (sotto)
        tieni solo quelle che spostano D_sim nel verso giusto
        se nessuna: esci
        applica quella che porta D_sim più vicino al bersaglio
```

**Agevolata (bersaglio T − 15)**
- Mossa: innesto di una parola corta di 𝒱_bonus (4 lettere; 5 solo se nessuna da 4 entra) sulla lettera 0 o 1 del **collo di bottiglia**, che incrocia solo quella parola.
- Trovata la parola corta, l'iniziale del collo di bottiglia si svela: calano insieme l'attrito d'avvio e il picco.
- Se il collo di bottiglia non accetta innesti (iniziali già incrociate o lettere vicine), si passa alla parola successiva più difficile.

**Esperto (bersaglio T + 12)**
- Mossa: si toglie una parola corta che regala la lettera 0 o 1 a una parola più lunga, e al suo posto si aggancia una **foglia**: una parola nuova che incrocia una sola parola, sull'ultima lettera della foglia o della parola a cui si appoggia (desinenza, η = 0,05).
- Sono ammesse solo rimozioni che lasciano la griglia connessa e pulita: togliendo una parola, due sue lettere d'incrocio consecutive potrebbero restare affiancate, e la ricostruzione controlla ogni sequenza di lettere.
- Se nessuna parola corta sul prefisso permette uno scambio utile, il che è frequente perché J già evita quegli incroci in A, B e C, si prova con le altre parole.
- Le foglie candidate sono le 30 più lunghe e più rare del bacino.

## 10. Il livello in gioco: server, chat e difficoltà automatica

**Generazione al volo.**
- Il generatore gira in un worker thread: un livello costa in media mezzo secondo e al massimo 2–3 s (gli scarichi D grandi), e non deve fermare la diretta.
- Appena un livello comincia, il server chiede il successivo; tiene in memoria gli ultimi 24.
- Si aspetta solo al primo livello e dopo un salto: in quel momento l'overlay mostra "Prossimo livello in arrivo…".

**Le parole della chat** (`incastro.ts`):

| Messaggio | Effetto |
|---|---|
| Ogni commento | Maiuscolo, accenti tolti, diviso sulle non-lettere; si guardano al massimo 4 parole da 3–10 lettere |
| Parola dello schema non ancora trovata | 1 punto per lettera, +3 se usa tutte le lettere della ruota; le sue lettere compaiono sulla griglia |
| Parola di 𝒱_bonus (extra) | 1 punto (se le extra sono accettate) |
| Parola già trovata | Nessun punto; ogni tanto compare nel feed |
| Altro | Ignorato |

La classifica conta i punti della diretta e mostra la parola più lunga trovata e chi l'ha trovata per prima.

**Aiuti.**
- Una lettera automatica ogni N secondi senza parole trovate (interruttore "Lettera automatica").
- Lettere e parole dai regali e dai trigger: al massimo `giftHints` per livello, uno ogni 2 s.
- Gli aiuti dalla dashboard.

**Difficoltà automatica.** Con l'impostazione "Difficoltà automatica" accesa, quando un livello finisce il server sceglie la griglia del successivo:

- **un passo più facile** se il tempo è scaduto, o se gli aiuti hanno mostrato almeno un terzo delle parole;
- **un passo più difficile** se la chat ha trovato tutte le parole senza nessun aiuto;
- **altrimenti la stessa**.

I passi sono Agevolata ↔ Standard ↔ Esperto. "Ricomincia dal livello 1" torna a Standard; con l'impostazione spenta si gioca sempre la Standard.

## 11. Esempi reali

Griglie prodotte dal generatore attuale (· = casella vuota).

**Livello 1 · A, T 56, D_sim 62,6.** Ruota `SREDEUI` (seme RESIDUE), 7 parole, 30 bonus. W0 = RESIDUE in verticale sul lato destro; i portanti UDIRE e SIEDE la incrociano con le loro lettere 3 e 4 (L − 2 e L − 1).

```
U · · · R · ·
S E D I E · ·
E · · · S · ·
R · U D I R E
E · · · · E ·
I · · · · S ·
· · S E R I E
· · · · · D ·
· · · · · U ·
· S I E D E ·
```

**Livello 5 · B, T 62, D_sim 60,6.** Ruota `IOTRPRU` (seme PRURITO). Il ponte PRURITO scende nella colonna centrale: P e R nel lobo alto (incrociata da PORRI), U-R-I nel corpo isolato, T e O nel lobo basso (TOPI, PUTO).

```
· · · T O R R I
· · · · · · U ·
· · · · P · P ·
· · P O R R I ·
· · · · U · · ·
· · · · R · · ·
· · · · I · · ·
· · T · T O P I
· P U T O · U ·
· · R · · · R ·
T R I O · · I ·
```

**Livello 9 · C, T 80, D_sim 76,7.** Ruota `RAPVAGE` (seme PREGAVA), 8 parole, 0 cicli: un albero, ogni parola appesa a una sola.

```
· · · G R A V A
· · P · · R · P
· · A · · P · R
P A R E V A · A
· · V · · · V ·
P R E G A V A ·
· · · · · · G ·
· · V E R G A ·
· · · · · · R ·
· · · · · · E ·
```

Le sue varianti:
- **Agevolata (bersaglio 65, D_sim 65,5):** innesta PARA sull'iniziale di PREGAVA, il collo di bottiglia.
- **Esperto (bersaglio 92, D_sim 77,3):** toglie APRA e aggancia PAGARE all'ultima lettera di VAGARE. Non raggiunge il bersaglio: in un albero le mosse disponibili sono poche.

**Livello 10 · D, T 28, D_sim 36,6.** Ruota `EAARPR` (seme PARARE), 10 parole, 11 incroci, 2 cicli: tanti incroci sulle iniziali, parole che si sbloccano a cascata.

```
· P A R E · ·
· · · · R · ·
· · A P R A ·
· · R · A · ·
· · E · · A ·
· P A R A R E
· A · A · A ·
· R · P E R A
R A R A · E ·
```

## 12. Strumenti, controllo e risultati

```
npm run wordgen -w @zerocade/server -- --only 1-40     questi livelli, una riga ciascuno (T, D_sim, varianti, tempi)
npm run wordgen -w @zerocade/server -- --calibrate     distribuzione del punteggio grezzo, per solver.scale
npm run wordgen -w @zerocade/server -- --write 600     livelli 1..600 in data/levels/it/pack_NNN.json
python tools/validate_levels.py                        controlla quei pacchetti (esce con 1 se un livello è rotto)
```

I pacchetti servono solo al controllo: il server non li legge.

Il validatore fallisce se, nella Standard o in una variante:
- una parola esce dallo schema, contraddice un'altra in una casella, non è formabile dalla ruota, non è `main` o è bloccata;
- compaiono sequenze di 2+ lettere non dichiarate;
- lo schema non è connesso;
- la ruota ha meno di 6 o più di 9 lettere, oppure lo schema supera 16 × 13;
- la prima parola non è la più lunga, o la ruota la forma in cerchio;
- uno schema C ha più cicli del consentito;
- un insieme di lettere ritorna a meno di 50 livelli di distanza.

Conta inoltre, senza fallire, quante griglie cadono entro ±3 dal loro bersaglio.

**Risultati attuali** (livelli 1–600, nessun errore):

| Griglia | Entro ±3 dal bersaglio |
|---|---|
| Standard | 435 / 600 |
| Agevolata (T − 15) | 263 / 600 |
| Esperto (T + 12) | 243 / 600 |

- 600 livelli in 288 s, cioè 0,48 s a livello in media, 2–3 s per i più grandi.
- Solo 2 ruote ricompaiono, e oltre i 50 livelli di distanza.
- Campione 99.991–100.000: 9 Standard su 10 entro ±3, 0,85 s a livello.

## 13. Tutti i parametri

| Parametro | Valore | Dove |
|---|---|---|
| Dente: lunghezza, forma, rampa, rampTeeth | 10 · [68, 68, 68, 71, 74, 77, 80, 83, 92, 40] · −12 → +6 · 30 | `curve.json` tooth |
| Archetipi per posizione | A A A B B B B B C D | `curve.json` tooth.archetypes |
| Crescita | ruota 6 → 9, parole 8 → 20, growthLevels 300 | `curve.json` |
| Matrice | aspetto 1,3, max 16 × 13 | `curve.json` |
| Per archetipo | moltiplicatore K, lettere in più, celle per parola, CR target, prefisso, cicli, rapporto esca, 85% lunghe (A), rango ponte (B), 60% rettangoli (D) | `curve.json` archetypes |
| Pesi di J | 6,0 · 1,0 · 1,5 · 1,5 | `curve.json` cost |
| Rarità | seme 400 → 16.000, parole 600 → 22.000, guadagno 0,012 | `curve.json` rarity |
| Lettere in più | pesi della tabella §4.3 | `curve.json` extraLetters |
| Varianti | −15, +12, 6 modifiche | `curve.json` variants |
| Solver | α 1,0 · β 1,2 · η · k 0,3/0,4/0,3/1,0 · scala [8, 30] | `curve.json` solver |
| Tolleranza, tentativi | ±3 · 14 | `curve.json` |
| Finestra del riempimento, rami, nodi | 6 (D 40) · 3 · 250 | `generator.ts` |
| Ruote per tentativo, semi scorsi | 10 · 400 | `generator.ts` |
| Fascia di semi, gruppi | 300 · 50 | `generator.ts` |
| Foglie per scambio Esperto | 30 | `generator.ts` |
| Lunghezza delle parole | 4–10 lettere (lessico), 3–10 in chat | `common.py`, `incastro.ts` |

## 14. Scelte non coperte dalla specifica

| Punto | Specifica | Implementazione |
|---|---|---|
| Numero di livelli | — | Infinito: rampa e crescita esponenziali che si stabilizzano; capitoli ciclici |
| Indipendenza dei livelli | — | Ogni livello dal solo numero; al posto della memoria, 50 gruppi di semi e passo aureo. Niente penalità per le parole usate di recente |
| Curva T(c, i) | Solo T ≈ 68 a inizio dente | Forma del dente, rampa e due denti per capitolo sono ipotesi da tarare |
| Matrice di difficoltà | Citata, non data | Valori per archetipo (§13) |
| Pesi w1–w4, k1–k4, α, β | Non dati | Valori in `curve.json`; scala di D_sim dalla calibrazione |
| η consonante comune nel corpo | Date solo vocali e consonanti rare | 0,14, a metà strada |
| A · posizione di W0 | Bordo sinistro o superiore | Bordo inferiore o destro: con W0 in alto o a sinistra, un portante che la incrocia con le ultime lettere uscirebbe dalla matrice |
| A · lunghezze | W0 7–8, portanti 6–7 | Con ruote corte: W0 = la più lunga disponibile, portanti ≥ max(5, \|W0\| − 2) |
| A, B, C · ruota | 6–9 lettere | Una lettera in più rispetto a D: con 6 lettere mancano parole da 5+ lettere |
| B · fascia neutra | 2 righe | Tutte le righe del corpo del ponte (3–4): stesso effetto |
| B · equilibrio dei lobi | — | Il lobo con meno parole ha la precedenza |
| D · 60% in rettangoli | Vincolo | Se nessuna ruota ci arriva, la griglia che ci va più vicino |
| Parole bonus da 3 lettere | 3–4 lettere | Il lessico non ha parole da 3 lettere: le bonus corte sono da 4 |
| Esperto | Parola corta sul prefisso → foglia sulla desinenza | Se nessuna parola corta sul prefisso permette uno scambio utile, si prova con le altre; ogni mossa deve alzare D_sim |
| Uso delle varianti | Varianti DDA | Il server sceglie la variante del livello successivo (§10) |
| Rapporto d'aspetto | H/W ≈ 1,3 (Android) | Applicato; sull'overlay la griglia ora prende quasi tutto lo spazio |

## 15. Limiti noti

- Le **varianti** non sempre arrivano al bersaglio, soprattutto quando la Standard è piccola o quasi ad albero: l'Agevolata ha poche iniziali libere, l'Esperto poche parole rimovibili.
- Tutti i valori della curva, dei pesi e della difficoltà automatica aspettano un **playtest**.
- Cambiando lessico o `curve.json` cambiano anche i livelli già giocati: il server salva solo il numero del livello raggiunto.
- "Image of the Day" e gli altri sfondi non entrano nel generatore: lo sfondo è scelto dall'overlay a ogni livello.

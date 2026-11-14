# ZeroWords · Algoritmo di generazione di griglie e parole

Questo documento descrive, passo per passo, come ZeroWords costruisce ogni livello: la ruota di lettere, le parole dello schema, le parole bonus, la disposizione a incastro e le due varianti di difficoltà. Descrive l'algoritmo **così come è implementato** nella versione del generatore `zw-2` (2 novembre 2026). Dove il codice si discosta dalla specifica di partenza, o fissa un valore che la specifica non dava, lo dice esplicitamente (vedi [Scelte non coperte dalla specifica](#14-scelte-non-coperte-dalla-specifica)). La [sezione 16](#16-revisione-v21-cosa-è-cambiato-e-perché) riassume che cosa la versione `zw-2` ha preso dalla proposta di revisione v2.1 e che cosa ha rinviato.

## Indice

1. [Principi](#1-principi)
2. [Il lessico: da dove vengono le parole](#2-il-lessico-da-dove-vengono-le-parole)
3. [Dal numero del livello ai parametri](#3-dal-numero-del-livello-ai-parametri)
4. [Stadio 1 · La ruota e le parole](#4-stadio-1--la-ruota-e-le-parole)
5. [Stadio 2 · Lo scheletro dell'archetipo](#5-stadio-2--lo-scheletro-dellarchetipo)
6. [Stadio 3 · Il riempimento (CSP)](#6-stadio-3--il-riempimento-csp)
7. [Stadio 4 · Il solver umano simulato e la retroazione](#7-stadio-4--il-solver-umano-simulato-e-la-retroazione)
8. [Stadio 5 · L'ordine della ruota](#8-stadio-5--lordine-della-ruota)
9. [Stadio 6 · Le varianti DDA e la parola segreta](#9-stadio-6--le-varianti-dda-e-la-parola-segreta)
10. [Il livello in gioco: server, chat e difficoltà automatica](#10-il-livello-in-gioco-server-chat-e-difficoltà-automatica)
11. [Esempi reali](#11-esempi-reali)
12. [Strumenti, controllo e risultati](#12-strumenti-controllo-e-risultati)
13. [Tutti i parametri](#13-tutti-i-parametri)
14. [Scelte non coperte dalla specifica](#14-scelte-non-coperte-dalla-specifica)
15. [Limiti noti](#15-limiti-noti)
16. [Revisione v2.1: cosa è cambiato e perché](#16-revisione-v21-cosa-è-cambiato-e-perché)

## 1. Principi

- **Livelli senza fine.** Non esiste un ultimo livello: il server di Zerocade genera il livello n quando il gioco ci arriva.
- **Deterministico.** Il livello n dipende solo da n, dal lessico, da `tools/curve.json` e dalla versione del generatore (`GENERATOR_VERSION` in `generator.ts`, oggi `zw-2`). Lo stesso numero dà sempre la stessa ruota, la stessa griglia e le stesse varianti, quindi non serve salvare i livelli: si salva solo il numero raggiunto. La versione è salvata con ogni partita (§10.4).
- **Indipendente.** Ogni livello si genera da solo, senza conoscere i precedenti. Le regole che evitano le ripetizioni (§4.2) non hanno bisogno di memoria.
- **Una parola vera dietro ogni ruota.** La ruota è sempre l'anagramma di una parola lunga quanto la ruota (la **parola completa**), e quella parola sta in ogni griglia del livello. Nessuna lettera della ruota è lì per caso (§4.3).
- **Guidato dalla difficoltà.** Ogni livello ha un bersaglio T ∈ [0, 100] (curva a dente di squalo). La griglia è accettata quando la difficoltà misurata da un solver che imita un giocatore (D_sim) cade entro ±3 punti da T.
- **Fino a tre griglie per livello.** Oltre alla Standard (T) ci sono un'Agevolata (T − 15) e un'Esperto (T + 12) sulla stessa ruota, quando si riesce a farle davvero diverse; il server sceglie quale giocare.
- **Una parola segreta per livello.** Una parola della ruota che non sta in nessuna delle griglie, di lunghezza diversa da livello a livello: vale il doppio a chi la trova per primo (§9.3).

| File | Ruolo |
|---|---|
| `apps/server/src/wordgen/curve.ts` | Curva T(c, i), dimensioni di ruota e griglia (legge `tools/curve.json`) |
| `apps/server/src/wordgen/lexicon.ts` | Lessico, ranghi di frequenza, indice dei multinsiemi |
| `apps/server/src/wordgen/board.ts` | Griglia, vincoli rigidi, ritaglio, ricostruzione e controllo di uno schema |
| `apps/server/src/wordgen/generator.ts` | Stadi 1–6 |
| `apps/server/src/wordgen/worker.ts`, `levels.ts` | Generazione in un thread a parte, cache e precaricamento |
| `apps/server/src/wordgen/cli.ts` | Riga di comando per tarare e controllare |
| `apps/server/src/incastro.ts` | Il livello in gioco: chat, punti, aiuti, difficoltà automatica, dati delle partite |
| `apps/server/src/db.ts` | Tabelle `zerowords_plays` e `zerowords_answers` (§10.4) |
| `tools/curve.json` | Tutti i parametri regolabili |
| `script/build_lexicon.py`, `script/validate_levels.py` | Costruzione del lessico, controllo dei livelli |

## 2. Il lessico: da dove vengono le parole

`lexicon/it/words.tsv` è costruito una volta da `script/build_lexicon.py`, partendo da due fonti libere (licenze in `lexicon/it/SOURCE`):

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

**Rango e frequenza.** Al caricamento, le parole sono ordinate per frequenza decrescente: il rango R_w è la posizione (1 = la più comune). Le parole `main` hanno rango tra circa 1 e 33.000. Il generatore usa il rango per la rarità delle parole dello schema e per lo sforzo del solver, e la frequenza Zipf per scegliere i semi (§4.2) e per pesare le parole che un giocatore può confondere con la risposta (§7.1).

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
g_ruota(n)  = 1 − e^(−(n − 1) / 500)                   crescita della ruota, da 0 verso 1
g(n)        = 1 − e^(−(n − 1) / 300)                   crescita del numero di parole
lettere     = min(9, round(6 + 3·g_ruota) + bonus_archetipo)     bonus: A, B, C +1; D 0
K           = round((8 + 12·g) · molt_archetipo)                  molt: A 0,9 · B 1,1 · C 1,0 · D 1,2
```

La ruota cresce più lentamente delle parole perché ogni lettera in più è una lettera della parola completa da trovare: 9 lettere vere sono molto più difficili di 7 lettere più 2 aggiunte (le ruote da 9 lettere formano in mediana 66 parole `main`, quelle da 7 ne formano 20). Per A, B e C la ruota ha 7 lettere fino al livello 92, 8 dal 93, 9 dal 348; per D una in meno (6, poi 7 dal 93, 8 dal 348, 9 dall'897).

La **matrice di lavoro** ha circa `K × celle_per_parola` celle (A 11, B 10, C 10, D 8), in verticale con rapporto righe/colonne ≈ 1,3, almeno lunga quanto la parola più lunga e al massimo 16 × 13. Alla fine lo schema viene ritagliato sul rettangolo che contiene davvero le parole.

Valori calcolati dalla curva attuale:

| Livello | Dente c | Posizione i | Archetipo | T | Lettere della ruota | Parole K |
|---|---|---|---|---|---|---|
| 1 | 0 | 0 | A | 56,0 | 7 | 7 |
| 4 | 0 | 3 | B | 59,0 | 7 | 9 |
| 9 | 0 | 8 | C | 80,0 | 7 | 8 |
| 10 | 0 | 9 | D | 28,0 | 6 | 10 |
| 11 | 1 | 0 | A | 56,6 | 7 | 8 |
| 93 | 9 | 2 | A | 60,7 | 8 | 10 |
| 100 | 9 | 9 | D | 32,7 | 7 | 14 |
| 300 | 29 | 9 | D | 39,2 | 7 | 19 |
| 348 | 34 | 7 | B | 83,2 | 9 | 18 |
| 600 | 59 | 9 | D | 43,5 | 8 | 22 |
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
    livello          = ritaglia(migliore), parola completa per prima
    livello.varianti = varianti(migliore, T)            # stadio 6
    livello.ruota    = ordina(lettere, parole di tutte le griglie)   # stadio 5
    livello.segreta  = parola_segreta(...)              # §9.3
```

## 4. Stadio 1 · La ruota e le parole

### 4.1 Rarità

Un parametro r ∈ [0, 1] stabilisce quanto è familiare il seme e a quale rango puntano le parole dello schema:

```
posto_seme_voluto   = r              0 = il seme più familiare della sua lunghezza, 1 = il meno familiare
rango_parole_voluto = exp(lerp(ln 600, ln 22.000, r))
```

Il seme si sceglie per **posizione tra i semi della sua lunghezza**, non per rango assoluto: le parole da 9 lettere sono in media più rare di quelle da 7, e un rango fisso come "400" fra le parole da 9 lettere quasi non esiste. r parte da T/100 e viene spostato dalla retroazione (§7.4): più D_sim è sotto T, più le parole diventano rare.

### 4.2 Il seme, senza ripetizioni e senza memoria

I semi possibili sono le parole `main` lunghe **quanto la ruota** (6–9 lettere) con frequenza Zipf almeno 2,8, una per firma (per ogni gruppo di anagrammi si tiene la più comune). Oggi sono 2.677 da 6 lettere, 4.162 da 7, 4.781 da 8 e 4.648 da 9. La soglia 2,8 (contro 2,5 del livello `main`) serve perché il seme è la parola completa che la chat deve trovare: deve essere riconoscibile.

1. **Gruppi.** Una volta per tutte, ogni seme finisce in uno di **50 gruppi**, con un hash della sua **firma**. Il livello n pesca solo dal gruppo `n mod 50`. Poiché la ruota è il seme, la firma del seme è quella della ruota: due livelli a meno di 50 di distanza non hanno mai la stessa ruota. Ogni gruppo ha in media 54–96 semi per lunghezza.
2. **Fascia.** Nel gruppo, i semi sono ordinati per vicinanza del loro posto a `posto_seme_voluto`; si considerano prima i 300 più vicini (in pratica tutto il gruppo).
3. **Punto di partenza.** Il livello n comincia a scorrere la fascia dalla posizione `⌊frac(n · φ) · lunghezza_fascia⌋` (φ = 0,618…, il rapporto aureo), poi la gira tutta e passa agli altri semi del gruppo. Così due livelli dello stesso gruppo con la stessa rarità (per esempio n e n + 50) non partono dallo stesso seme.

### 4.3 La parola completa

La ruota **è** il seme: nessuna lettera aggiunta. Fino alla versione `zw-1` le ruote da 8 e 9 lettere erano un seme da 7 più 1–2 lettere estratte a caso; sui 600 livelli di allora:

- il 60% delle parole dello schema usava una lettera estratta a caso, che decideva il livello più del seme;
- l'80% delle ruote da 9 lettere non aveva nessuna parola con tutte le lettere (nemmeno fra le extra), e nei tre quarti dei casi la parola più lunga dello schema era da 7;
- il 6% dei livelli aveva sulla ruota una lettera che nessuna parola dello schema usava;
- due semi diversi potevano dare la stessa ruota (CANTARE + O = CANTORE + A = AACENORT), aggirando i gruppi anti-ripetizione.

Con la ruota uguale al seme:

- ogni livello ha la sua **parola completa** (quella che vale +3 punti in chat, §10);
- la parola completa entra in ogni griglia come prima parola (§5, §6.3), e le varianti non la tolgono mai (§9.2);
- di conseguenza ogni copia di ogni lettera della ruota serve ad almeno una parola dello schema: il validatore lo controlla.

Le estensioni "seme più lettere scelte per utilità" proposte dalla revisione v2.1 non servono: ogni gruppo ha decine di semi familiari per lunghezza. Restano un ripiego da scrivere solo se il validatore trovasse gruppi esauriti.

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

- **𝒱_grid**, candidate allo schema: il seme per primo, poi le altre parole `main` ordinate per punteggio
  ```
  punteggio(w) = −|ln R_w − ln rango_parole_voluto| + 0,25 · lunghezza(w) + rumore(0..0,7)
  ```
  quindi rango vicino a quello voluto, parole lunghe un po' favorite, e un po' di varietà. Se ne tengono le prime max(3K, K + 12), seme compreso.
- **𝒱_bonus**, tutte le altre: le `extra` e le `main` che non entrano nello schema. In chat valgono come **parole extra** (1 punto).

Per ogni griglia (Standard e varianti) vale l'invariante: **parole dello schema ∪ extra = tutte le parole valide della ruota**, senza sovrapposizioni. Il validatore lo ricalcola da capo.

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
· · · # # · · W1      2. W0 (la parola completa) sul bordo inferiore o destro
· W2  # # · · W1      3. W1, W2 la incrociano con le loro ultime lettere
· W2  · · · · W1         (indice ≥ L − 2): i prefissi restano scoperti
W0 W0 W0 W0 W0 W0 W0  4. W2 il più lontano possibile da W1 lungo W0
```

- W0 è una parola completa: il seme, o un suo anagramma `main` (si provano fino a 3 parole W0, seme per primo, e 8 posizioni per ciascuna).
- W1 e W2 hanno almeno max(5, |W0| − 2) lettere e incrociano **solo** W0. Se nessuna coppia di portanti entra, la ruota è scartata.

### B · Doppio lobo a ponte (salita)

Il livello 5 (ponte PRIVARE, la parola completa, nella colonna 2; # = cella interdetta):

```
P R I V A · · ·        lobo superiore
I · · · R · · ·
R · P R I V E ·    ← lettera 0 del ponte (P): PRIVE è l'unico aggancio dal lobo superiore
A · R · E · · ·    ← lettera 1 (R)
# # I # # # # #    ← corpo del ponte: righe interdette, tranne la colonna del ponte
# # V # # # # #
# # A # # # # #
· · R A R I · E    ← lettera L−2 (R): RARI, l'unico aggancio dal lobo inferiore
· · E · A · · R    ← lettera L−1 (E)
· · · · R · · R        lobo inferiore
· · P R E V I A
```

- **Ponte:** verticale, 7–8 lettere (o la più lunga disponibile), rango tra 6.000 e 9.500; se nessuna parola cade nella finestra, la più vicina in scala logaritmica. Con una ruota da 7 lettere il ponte è per forza una parola completa; con 8–9 lettere può essere più corto, e allora la prima parola del riempimento è una parola completa, in uno dei lobi (§6.3).
- **Posizione:** al centro in verticale, nel terzo centrale in orizzontale. Le prime due lettere stanno nel lobo superiore, le ultime due in quello inferiore.
- **Isolamento:** tutte le righe del corpo (lettere da 2 a L − 3) sono interdette tranne la colonna del ponte. Il ponte è l'unico canale tra i lobi: per sbloccare un lobo partendo dall'altro bisogna passare dal ponte.
- **Equilibrio:** durante il riempimento la prossima parola va, quando può, nel lobo che ne ha meno.

### C · Arcipelago a ramificazione (picco boss)

- La parola completa al centro, niente maschere.
- **Vincolo rigido** sul numero ciclomatico del grafo delle parole: `μ = E − V + 1 ≤ 1` (V parole, E incroci). Un piazzamento con k incroci aggiunge k − 1 cicli, quindi quasi ogni parola può incrociarne una sola.
- Ne esce un albero pieno di foglie: trovare una parola aiuta pochissimo le altre, niente effetto a cascata.

### D · Arena densa (scarico)

- Nessuna maschera; la parola completa al centro geometrico.
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
        se la griglia non ha ancora una parola completa (B con ponte corto):
            considera solo le parole complete                  # obbligo prima di tutto
        per le prossime parole di candidati che entrano da qualche parte
                (6 parole per A, B, C; 40 per D):
            per ogni posizione valida: aggiungi (J, parola, posizione)
        se archetipo B: tieni le opzioni del lobo con meno parole, se ce ne sono
        prova le 3 opzioni con J minore, in ordine:
            piazza; se il resto riesce → fatto; altrimenti togli e prova la successiva
    al massimo 250 nodi; oltre, la ruota è scartata
```

Le parole che non entrano da nessuna parte vengono saltate e restano bonus. Un riempimento riuscito usa in mediana 20–40 nodi: il limite basso fa abbandonare presto le ruote senza speranza, che sono quelle che costano di più.

Come suggerisce la revisione v2.1, la scelta "prima il vincolo più stretto" (MRV) vale solo per gli obblighi, cioè la parola completa; le altre parole sono facoltative e restano ordinate per qualità e costo.

## 7. Stadio 4 · Il solver umano simulato e la retroazione

### 7.1 Difficoltà residua di una parola

```
freddo(w) = α · L_w^1,4 + β · ln(1 + R_w)                         α = 1,0   β = 1,2
c(w)      = min(1,2, freddo(w))                                  costo di lettura e invio
P(S)      = Π_{p ∈ S} (1 − η(p, w[p]))                           S = lettere svelate
P_tutte   = Π_{tutte le p} (1 − η(p, w[p]))
g(S)      = (P(S) − P_tutte) / (1 − P_tutte)                     1 senza lettere, 0 con tutte
A(S)      = log2( Σ q(v) sulle v compatibili / q(w) )            ambiguità, q(v) = 10^(γ · Zipf_v), γ = 1
d_t(w)    = c(w) + (freddo(w) − c(w)) · g(S) + λ · A(S)          λ = 2
```

- **Sforzo a freddo:** lunghezza e rarità della parola.
- **Lettere svelate:** ogni lettera già svelata dagli incroci toglie la sua quota η. La normalizzazione fa sì che con tutte le lettere visibili resti esattamente il **costo di lettura e invio** c. Una parola interamente visibile non va più cercata, ma in ZeroWords bisogna ancora accorgersene e scriverla in chat: il server la completa da sola solo quando è un aiuto a mostrarne l'ultima lettera (§10).
- **Ambiguità:** quante parole della ruota della stessa lunghezza, non ancora sistemate nello schema, sono compatibili con le lettere visibili, pesate per familiarità. Una forma rarissima pesa quasi nulla, una parola quotidiana quanto la risposta. A = 0 quando nessun'altra parola entra nella casella. Sostituisce il vecchio "termine delle esche", che contava ogni parola bonus allo stesso modo.
- **Calcolo stabile:** g si calcola con logaritmi, come `e^(log P) · (−expm1(log P_tutte − log P)) / (−expm1(log P_tutte))`, così resta esatta vicino agli estremi. Con tutti gli η a zero (configurazione degenere) g diventa la quota di lettere ancora nascoste.
- **Proprietà:** d_t non cresce mai quando si svela una lettera (le compatibili possono solo diminuire), vale freddo + λ·A senza lettere e c con tutte. `npm run wordgen -w @zerocade/server -- --selftest` lo controlla su ogni sottoinsieme di lettere di VAGARE, ZANZARA, BANANA e CASA: 864 passaggi.

| Posizione della lettera svelata | η |
|---|---|
| p = 0 (iniziale) | 0,45 |
| p = 1 | 0,25 |
| p = L − 1 (desinenza) | 0,05 |
| corpo, consonante rara (Z G B F V P M) | 0,18 |
| corpo, altra consonante | 0,14 |
| corpo, vocale | 0,10 |

**Esempio senza ambiguità.** VAGARE (6 lettere, rango 18.301) sulla ruota VAGARE, dove nessun'altra parola da 6 lettere è formabile:

| Visibili | ______ | V_____ | VA____ | VAG___ | VAGA__ | VAGAR_ | VAGARE | _____E |
|---|---|---|---|---|---|---|---|---|
| zw-1 (freddo · P) | 24,06 | 13,24 | 9,93 | 8,14 | 7,33 | 6,30 | 5,99 | 22,86 |
| zw-2 | 24,06 | 10,37 | 6,18 | 3,92 | 2,90 | 1,60 | 1,20 | 22,54 |

La vecchia formula lasciava il 25% dello sforzo anche con la parola tutta scritta sulla griglia.

**Esempio con ambiguità.** CASA (rango 52) sulla ruota ACSAER, che forma 19 parole da 4 lettere (AREA, CARA, CARE, CASE, CERA, CREA, RESA, SERA…):

| Visibili | ____ | ___A | C___ | CA__ | CAS_ | CASA |
|---|---|---|---|---|---|---|
| d_t | 14,27 | 13,29 | 5,26 | 2,95 | 1,83 | 1,20 |

La A finale aiuta poco (molte parole finiscono in A), la C iniziale molto (restano CARA, CARE, CASE, CERA, CREA).

### 7.2 La simulazione

```
simula(griglia):
    svelate = nessuna lettera
    finché restano parole:
        w = la parola non risolta con d_t minimo (a parità, la prima piazzata)
        registra sforzo_t = d_t(w)
        risolvi w: le sue lettere si svelano sulle parole che la incrociano,
                   e w non è più un'alternativa per le altre caselle
    C_init = sforzo del primo turno            (attrito d'avvio)
    media  = media degli sforzi
    picco  = massimo degli sforzi              (la sua parola è il collo di bottiglia)
```

### 7.3 Il punteggio

```
D_grezzo = 0,3 · C_init + 0,4 · media + 0,3 · picco
D_sim    = 100 · (D_grezzo − 16,5) / (32,5 − 16,5)          limitato a 0..100 nelle metriche
```

- **Niente termine delle esche:** le parole bonus contano ora dentro d_t, tramite l'ambiguità e pesate per familiarità.
- **Scala [16,5, 32,5], fissa per la versione `zw-2`:** sono i percentili 2 e 98 del punteggio grezzo sul corpus di riferimento di `--calibrate` (un livello ogni 7 fra i primi 600, alle rarità 0, 0,5 e 1: p2 16,57, mediana 22,27, p98 32,64). Come chiede la revisione v2.1, la scala non è adattata ai bersagli né per archetipo: D_sim 50 è la griglia mediana del corpus, 100 una fra le più difficili. Se cambia il solver si ricalcola con la stessa regola e si cambia versione.
- **Confronti:** tutti usano D_sim non limitato, così anche una griglia oltre la scala (sopra 100) può essere corretta.

### 7.4 La retroazione

- Griglia approvata se `|D_sim − T| ≤ 3`.
- Altrimenti `r ← r − 0,012 · (D_sim − T)`: per 10 punti di troppo la rarità scende di 0,12, quindi parole e seme più comuni. Poi si riprova.
- Al massimo 14 tentativi; poi resta la griglia più vicina a T, con lo scarto scritto nelle metriche.

## 8. Stadio 5 · L'ordine della ruota

Le lettere vengono mescolate fino a 500 volte. Si tiene l'ordine che, letto in cerchio in senso orario o antiorario, forma meno parole delle griglie e mai una parola completa. Le parole considerate sono quelle di **tutte** le griglie giocabili (Standard e varianti presenti), perché il server può giocarne una qualsiasi. Penalità: 100 per una parola completa (o per la parola segreta, §9.3), altrimenti la lunghezza della parola letta. La parola completa è sempre `words[0]` di ogni griglia, e il server la usa allo stesso modo quando il pubblico rimescola la ruota.

## 9. Stadio 6 · Le varianti DDA e la parola segreta

### 9.1 Le varianti

Le varianti usano la stessa ruota della Standard e nascono da sue copie modificate. Costano una frazione della Standard: niente nuova ruota, niente nuovo riempimento. Le loro parole bonus sono il complemento delle loro parole (§4.5): una parola tolta dallo schema diventa bonus, una aggiunta smette di esserlo.

```
variante(standard, verso):
    bersaglio = T − 15 (Agevolata) o T + 12 (Esperto), limitato a 3..97
    griglia   = copia(standard)
    ripeti fino a 6 volte:
        se D_sim ha raggiunto il bersaglio (entro 3, o oltre nel verso giusto): esci
        mosse = tutte le modifiche possibili (sotto)
        tieni solo quelle che spostano D_sim nel verso giusto
        se nessuna: esci
        applica quella che porta D_sim più vicino al bersaglio
    se D_sim non dista almeno 5 punti dalla Standard, dal lato giusto: nessuna variante
```

- **Bersagli raggiungibili.** A regime un boss ha T ≈ 98: T + 12 = 110 non esiste sulla scala. Il bersaglio resta dentro 3..97, e non si promette il salto nominale agli estremi.
- **Varianti davvero diverse.** Una variante che non si allontana di almeno `variants.minGap` = 5 punti dalla Standard non viene salvata (`null`): il server gioca la Standard e la dashboard lo dice. Vale anche per un Esperto il cui bersaglio, limitato a 97, non supera la Standard.
- **Più passi non servono.** Portare il limite da 6 a 10 modifiche non cambia nulla sul campione di prova (86 livelli, stessi risultati): le varianti si fermano perché finiscono le mosse utili, non i passi.

### 9.2 Le due mosse

Tutte le parole aggiunte sono `main`, prese da tutte le parole formabili dalla ruota (non dal bacino 𝒱_grid già tagliato). Nessuna mossa toglie l'ultima parola completa della griglia.

**Agevolata (bersaglio T − 15)**
- Prima mossa, **innesto:** una parola corta (4 lettere; 5 solo se nessuna da 4 entra) sulla lettera 0 o 1 del **collo di bottiglia**, che incrocia solo quella parola. Trovata la parola corta, l'iniziale del collo di bottiglia si svela: calano insieme l'attrito d'avvio e il picco. Se il collo di bottiglia non accetta innesti, si passa alla parola successiva più difficile.
- Seconda mossa, solo se nessun innesto abbassa D_sim, **sostituzione:** una delle 3 parole più difficili esce dallo schema e al suo posto entra una parola più comune (fra le 30 `main` più comuni della ruota), ovunque incroci il resto. Lo schema conserva il numero di parole, come raccomanda la revisione v2.1 (un'Agevolata con più parole durerebbe di più). Negli schemi C la sostituzione non può creare cicli oltre il limite: un albero resta un albero.
- La sostituzione ha portato le Agevolate generate sul campione da 59 a 80 su 86, e quelle entro ±3 da 39 a 62.

**Esperto (bersaglio T + 12)**
- Mossa: si toglie una parola corta che regala la lettera 0 o 1 a una parola più lunga, e al suo posto si aggancia una **foglia**: una parola nuova che incrocia una sola parola, sull'ultima lettera della foglia o della parola a cui si appoggia (desinenza, η = 0,05).
- Sono ammesse solo rimozioni che lasciano la griglia connessa e pulita: togliendo una parola, due sue lettere d'incrocio consecutive potrebbero restare affiancate, e la ricostruzione controlla ogni sequenza di lettere.
- Se nessuna parola corta sul prefisso permette uno scambio utile, il che è frequente perché J già evita quegli incroci in A, B e C, si prova con le altre parole.
- Le foglie candidate sono le 30 più lunghe e più rare fra le parole `main` della ruota. Una foglia incrocia una sola parola, quindi non crea cicli.

### 9.3 La parola segreta

Ogni livello ha **sempre** una parola segreta: una parola della ruota che non compare in nessuna delle griglie del livello, così resta segreta qualunque variante si giochi. Viene scelta dopo le varianti, con un generatore casuale a parte (seme `"zerowords:n:secret"`): ruota e griglie restano quelle che sarebbero senza.

```
parola_segreta(parole_formabili, griglie):
    libere   = parole formabili che non sono in nessuna delle griglie
    candidate = le libere `main`; se non ce n'è nessuna, le libere `extra`
    L         = una lunghezza a caso tra quelle presenti nelle candidate
    segreta   = una a caso tra le 3 più comuni di lunghezza L
    se la ruota la legge in cerchio: rimescola la ruota (penalità 100, come per la parola completa)
```

- **Lunghezza variabile.** La lunghezza è estratta tra quelle disponibili, non pesata: nei livelli 1–600 è uscita 185 volte da 4 lettere, 157 da 5, 149 da 6, 88 da 7, 18 da 8 e 3 da 9.
- **Trovabile.** Fra le parole di quella lunghezza vince una delle tre più comuni: deve essere una parola che la chat può davvero pensare.
- **Ripiego.** Se le griglie prendono tutte le parole `main`, la parola segreta è una `extra`, valida ma più rara.
- **In gioco** (§10): vale 2 punti per lettera, il doppio di una parola dello schema; l'overlay mostra solo le caselle vuote finché qualcuno non la trova; a fine livello viene rivelata comunque. Gli aiuti non la svelano, e non conta tra le parole extra.

## 10. Il livello in gioco: server, chat e difficoltà automatica

**Generazione al volo.**
- Il generatore gira in un worker thread: un livello costa in media 0,6 s e al massimo 4–5 s (le ruote da 9 lettere con molte parole), e non deve fermare la diretta.
- Appena un livello comincia, il server chiede il successivo; tiene in memoria gli ultimi 24.
- Si aspetta solo al primo livello e dopo un salto: in quel momento l'overlay mostra "Prossimo livello in arrivo…".

**Le parole della chat** (`incastro.ts`):

| Messaggio | Effetto |
|---|---|
| Ogni commento | Maiuscolo, accenti tolti, diviso sulle non-lettere; si guardano al massimo 4 parole da 3–10 lettere |
| Parola dello schema non ancora trovata | 1 punto per lettera, +3 se usa tutte le lettere della ruota; le sue lettere compaiono sulla griglia |
| La parola segreta, la prima volta | 2 punti per lettera; si rivela nel riquadro "Parola segreta" con il nome di chi l'ha trovata |
| Parola di 𝒱_bonus (extra) | 1 punto (se le extra sono accettate) |
| Parola già trovata | Nessun punto; ogni tanto compare nel feed |
| Altro | Ignorato |

La classifica conta i punti della diretta e mostra la parola più lunga trovata e chi l'ha trovata per prima.

**Aiuti**, distinti per origine:

| Origine | Da dove | Conta per la difficoltà automatica |
|---|---|---|
| `auto` | Una lettera automatica ogni N secondi senza parole trovate (interruttore "Lettera automatica"; il conto riparte a ogni parola trovata) | Sì |
| `streamer` | I pulsanti "Lettera" e "Parola" della dashboard | Sì |
| `trigger` | Regali e altri trigger: al massimo `giftHints` per livello, uno ogni 2 s | No: sono una scelta del pubblico, non un segno che lo schema è difficile |

Quando un aiuto mostra l'ultima lettera nascosta di una parola, la parola si completa da sola (trovata "con gli aiuti", da nessuno); il server ricorda quale origine l'ha completata.

### 10.1 Esito di un livello

Quando un livello finisce (tutte le parole trovate, o tempo scaduto) il server ne classifica l'esito:

| Esito | Quando |
|---|---|
| `idle` · nessuno ha giocato | Nessuno in chat ha provato una parola della ruota: una lettera automatica allora non dice nulla sullo schema |
| `easier` · la chat è in difficoltà | Il tempo è scaduto, oppure lettere automatiche e aiuti della dashboard hanno completato almeno un terzo delle parole |
| `harder` · troppo facile | Nessuna parola completata da lettere automatiche o dalla dashboard, nessun aiuto della dashboard, e al massimo una lettera automatica ogni 4 parole |
| `steady` · nella media | Tutto il resto |

Un "tentativo" è una parola di almeno 4 lettere scritta in chat e formabile con le lettere della ruota: le chiacchiere non contano.

### 10.2 Cambio di griglia

Con "Difficoltà automatica" accesa la griglia cambia di **un passo** (Agevolata ↔ Standard ↔ Esperto) solo quando:

- gli ultimi **2 esiti** che contano sono uguali, `easier` o `harder` (i livelli `idle` si saltano, uno `steady` azzera la serie);
- sono passati almeno **3 livelli** dall'ultimo cambio.

Così un solo livello fortunato o sfortunato non sposta la difficoltà. Il cambio vale dal livello successivo: uno schema già iniziato non cambia mai. Se la ruota del livello non ha la variante scelta (§9.1) si gioca la Standard, e la variante resta quella scelta per i livelli dopo. "Ricomincia dal livello 1" torna a Standard e azzera la serie; con l'impostazione spenta si gioca sempre la Standard. In Info partita la riga "Andamento chat" mostra l'ultimo esito e la serie (per esempio "In difficoltà · 1/2").

La revisione v2.1 propone anche una media mobile (rating della chat) su circa dieci livelli: si potrà costruire sui dati del §10.4 quando ce ne saranno abbastanza.

### 10.3 Generazione e varianti in gioco

Il server riceve dal generatore la Standard e le varianti presenti. La dashboard mostra la griglia in gioco con la sua D_sim e, se la variante scelta manca, una nota ("Questa ruota non ha la griglia Esperto: si gioca la Standard").

### 10.4 I dati delle partite

Ogni livello giocato viene salvato in `data/zerocade.db`, per tarare la difficoltà su partite vere invece che sul solo solver. Non si salva **chi** ha risposto: solo quante persone diverse hanno provato.

`zerowords_plays`, una riga per livello giocato:

| Colonna | Contenuto |
|---|---|
| `level`, `variant`, `generator`, `archetype`, `seed` | Quale griglia: numero, variante giocata, versione del generatore, archetipo, parola completa |
| `target`, `dsim`, `words`, `hint_seconds` | Bersaglio, difficoltà simulata, numero di parole, secondi della lettera automatica (0 = spenta) |
| `started_at`, `ended_at`, `active_ms` | Inizio e fine (ms), e tempo di gioco effettivo: pause e momenti senza dashboard né overlay aperti esclusi |
| `result`, `outcome` | `complete`, `time-up` o `left` (saltato o cambiato prima della fine, senza esito); esito per la difficoltà automatica (§10.1) |
| `players`, `attempts`, `wrong` | Persone diverse che hanno provato, tentativi, tentativi che non sono parole valide |
| `hints_auto`, `hints_streamer`, `hints_trigger` | Aiuti per origine |
| `first_ms`, `stall_ms` | Tempo alla prima parola trovata dalla chat; attesa più lunga senza parole trovate dalla chat (compresa quella fino alla fine) |

`zerowords_answers`, una riga per evento, con il tempo di gioco `at_ms` dall'inizio del livello:

| `kind` | `how` | `word`, `shown` |
|---|---|---|
| `grid` | `chat`, oppure l'origine dell'aiuto che l'ha completata, oppure `missed` a tempo scaduto | La parola e com'era sulla griglia un attimo prima (`V_G___`): il solo numero di lettere svelate non distingue `V_____` da `_____E` |
| `extra`, `secret` | `chat` | La parola |
| `hint` | `auto`, `streamer`, `trigger` | La parola rivelata (solo per "Parola") |

In Info partita i pulsanti **⬇ Partite** e **⬇ Risposte** scaricano le due tabelle in CSV (`/api/zerowords/plays.csv`, `/api/zerowords/answers.csv`). Le righe più vecchie di un anno vengono cancellate all'avvio.

**Come usarli per tarare** (da fare quando ci saranno alcune decine di live):
- confrontare `dsim` con `active_ms`, `stall_ms` e la quota di parole `missed` o completate dagli aiuti, per archetipo e variante;
- stimare per ogni parola il tempo fra `at_ms` e l'ultimo cambiamento del suo schema visibile, distinguendo le parole risolte dalla chat da quelle completate dagli aiuti o mancate (dati censurati: scartarle favorirebbe i soli successi);
- tarare su un insieme di live e verificare su altre;
- solo dopo, rivedere la scala di D_sim, i pesi k e i parametri η, λ, γ e c, cambiando versione del generatore.

## 11. Esempi reali

Griglie prodotte dal generatore attuale, versione `zw-2` (· = casella vuota).

**Livello 1 · A, T 56, D_sim 56,3.** Ruota `AAERSCV`, anagramma di SCAVARE; 7 parole, 43 bonus, parola segreta SACRA. W0 = SCAVARE in verticale sul lato destro; i portanti VARCA e SACRE la incrociano con la loro ultima lettera, lontani fra loro lungo W0.

```
· · · · · V · S
· · · · · E · C
· · · V A R C A
· · · · · S · V
· C · · · A · A
· R · · · · · R
· E · S A C R E
· A · · · A · ·
· V · · · V · ·
C A V A R E · ·
```

Le sue varianti: l'**Agevolata** (bersaglio 41, D_sim 39,9) aggiunge due innesti corti, CAVA e SERA; l'**Esperto** (bersaglio 68, D_sim 67,9) toglie CREAVA e aggancia la foglia ESCA.

**Livello 5 · B, T 62, D_sim 61,2.** Ruota `RIEAPRV`, anagramma di PRIVARE, che fa da ponte (disegno al §5). Parola segreta PARERI. Agevolata (bersaglio 47, D_sim 44,6): innesti PARE e RIVE. Esperto (bersaglio 74, D_sim 72,8): via PIRA e PRIVA, dentro ERRI e VIRARE.

**Livello 4 · B senza Esperto.** Ruota `DOERORC` (CORREDO), T 59, D_sim 64,2. L'Agevolata c'è (D_sim 44,8: via CEDRO, dentro CORO, CORRO, ERRO e RODE), l'Esperto no: nessuno scambio la allontana di 5 punti dalla Standard. Se la difficoltà automatica chiede l'Esperto, al livello 4 si gioca la Standard.

**Livello 9 · C, T 80, D_sim 82,6.** Ruota `OARENCA`, anagramma di COREANA; 8 parole, 0 cicli: un albero, ogni parola appesa a una sola. Parola segreta CARNE.

```
· · · · C E R O
· C E N O · · ·
· · · · R · A ·
R · C · N · R ·
E · E · E · C ·
C O R E A N A ·
A · A · · · N ·
N · N · · · O ·
O · O C R A · ·
```

Le sue varianti:
- **Agevolata (bersaglio 65, D_sim 66,4):** innesta CANE.
- **Esperto (bersaglio 92, D_sim 97,2):** toglie CERO e RECANO, aggancia le foglie CANOE e CARENA. Supera il bersaglio di 5 punti: è la mossa che ci andava più vicino.

**Livello 10 · D, T 28, D_sim 30,7.** Ruota `AVRIEP`, anagramma di PREVIA; 10 parole, 10 incroci, 1 ciclo: tanti incroci sulle iniziali, parole che si sbloccano a cascata. Parola segreta APRE.

```
· · · P R I V A
V I R A · · · P
A · · R · · · R
R I V E · · · I
I · E · · V · ·
· P R E V I A ·
· · I · · P · ·
· · · · · E · ·
· · · P E R I ·
· · · · · A · ·
```

## 12. Strumenti, controllo e risultati

```
npm run wordgen -w @zerocade/server -- --only 1-40     questi livelli, una riga ciascuno (T, D_sim, varianti, tempi)
npm run wordgen -w @zerocade/server -- --calibrate     distribuzione del punteggio grezzo, per solver.scale
npm run wordgen -w @zerocade/server -- --selftest      lo sforzo del solver non cresce mai svelando lettere
npm run wordgen -w @zerocade/server -- --write 600     livelli 1..600 in data/levels/it/pack_NNN.json
python script/validate_levels.py                        controlla quei pacchetti (esce con 1 se un livello è rotto)
```

I pacchetti servono solo al controllo: il server non li legge.

Il validatore fallisce se, nella Standard o in una variante presente:
- una parola esce dallo schema, contraddice un'altra in una casella, non è formabile dalla ruota, non è `main` o è bloccata;
- compaiono sequenze di 2+ lettere non dichiarate;
- lo schema non è connesso;
- parole dello schema ed extra insieme non sono esattamente le parole valide della ruota (lo ricalcola dal lessico);
- la prima parola non usa tutte le lettere della ruota (la parola completa), o la ruota la forma in cerchio;
- una copia di una lettera della ruota non serve a nessuna parola dello schema;
- la ruota ha meno di 6 o più di 9 lettere, oppure lo schema supera 16 × 13;
- uno schema C, o una sua variante, ha più cicli del consentito;
- una variante non sta dal suo lato della Standard di almeno 5 punti di D_sim (salvo una Standard già a 100);
- la parola segreta non è una parola valida della ruota, sta in una delle griglie, o la ruota la forma in cerchio;
- un insieme di lettere ritorna a meno di 50 livelli di distanza.

Conta inoltre, senza fallire, quante varianti ci sono e quante griglie cadono entro ±3 dal loro bersaglio (una variante assente conta come mancata).

**Risultati attuali** (`zw-2`, livelli 1–600, nessun errore), confrontati con `zw-1`:

| Griglia | Presenti | Entro ±3 dal bersaglio | `zw-1` |
|---|---|---|---|
| Standard | 600 | 458 / 600 | 435 / 600 |
| Agevolata (T − 15) | 559 | 436 / 600 | 263 / 600 |
| Esperto (T + 12) | 539 | 459 / 600 | 243 / 600 |

Per archetipo, Standard entro ±3: A 141/180, B 240/300, C 35/60, D 42/60. Delle 142 Standard fuori tolleranza, 98 stanno sotto il bersaglio, quasi tutti boss (§15); lo scarto mediano è 5,6 punti.

- **Parole:** la parola completa ha Zipf mediano 3,44 (fra il 10% e il 90%: 2,90–4,36), per esempio MAESTRA, ORTAGGI, BANDIERA, PRIGIONE, CONSUMARE, AROMATICO; le parole dello schema hanno Zipf mediano 3,43, e il 22% sta sotto 3.
- **Ruote:** 9 da 6 lettere, 108 da 7, 256 da 8, 227 da 9; 15 ruote ricompaiono, tutte oltre i 50 livelli.
- **Tempi:** 600 livelli in 370 s, 0,62 s a livello in media; sui livelli 341–360 e 581–600 mediana 0,45 s, 90% sotto 2 s, massimo 4,4 s. Il server genera in un thread a parte il livello successivo mentre si gioca quello in corso.

## 13. Tutti i parametri

| Parametro | Valore | Dove |
|---|---|---|
| Dente: lunghezza, forma, rampa, rampTeeth | 10 · [68, 68, 68, 71, 74, 77, 80, 83, 92, 40] · −12 → +6 · 30 | `curve.json` tooth |
| Archetipi per posizione | A A A B B B B B C D | `curve.json` tooth.archetypes |
| Crescita | ruota 6 → 9 con wheelGrowthLevels 500, parole 8 → 20 con growthLevels 300 | `curve.json` |
| Matrice | aspetto 1,3, max 16 × 13 | `curve.json` |
| Per archetipo | moltiplicatore K, lettera in più, celle per parola, CR target, prefisso, cicli, rapporto esca, 85% lunghe (A), rango ponte (B), 60% rettangoli (D) | `curve.json` archetypes |
| Pesi di J | 6,0 · 1,0 · 1,5 · 1,5 | `curve.json` cost |
| Rarità | seme: Zipf ≥ 2,8, posto r fra i semi della lunghezza; parole 600 → 22.000; guadagno 0,012 | `curve.json` rarity |
| Varianti | −15, +12 (bersagli in 3..97), 6 modifiche, distanza minima 5 | `curve.json` variants |
| Solver | α 1,0 · β 1,2 · c 1,2 · γ 1,0 · λ 2,0 · η · k 0,3/0,4/0,3 · scala [16,5, 32,5] | `curve.json` solver |
| Tolleranza, tentativi | ±3 · 14 | `curve.json` |
| Finestra del riempimento, rami, nodi | 6 (D 40) · 3 · 250 | `generator.ts` |
| Ruote per tentativo, semi scorsi | 10 · 400 | `generator.ts` |
| Fascia di semi, gruppi | 300 · 50 | `generator.ts` |
| Foglie per scambio Esperto, parole per sostituzione Agevolata | 30 · 30 (sulle 3 parole più difficili) | `generator.ts` |
| Versione del generatore | `zw-2` | `generator.ts` GENERATOR_VERSION |
| Parola segreta: candidate per lunghezza, punti | le 3 più comuni · 2 per lettera | `generator.ts`, `incastro.ts` |
| Difficoltà automatica | 1/3 di parole dagli aiuti = in difficoltà; ≤ 1 lettera automatica ogni 4 parole = troppo facile; 2 esiti uguali; 3 livelli fra due cambi | `incastro.ts` |
| Dati delle partite | conservati 365 giorni | `db.ts` |
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
| A · lunghezze | W0 7–8, portanti 6–7 | W0 = la parola completa (7–9 lettere), portanti ≥ max(5, \|W0\| − 2) |
| A, B, C · ruota | 6–9 lettere | Una lettera in più rispetto a D: con 6 lettere mancano parole da 5+ lettere |
| B · fascia neutra | 2 righe | Tutte le righe del corpo del ponte (3–4): stesso effetto |
| B · equilibrio dei lobi | — | Il lobo con meno parole ha la precedenza |
| D · 60% in rettangoli | Vincolo | Se nessuna ruota ci arriva, la griglia che ci va più vicino |
| Parole bonus da 3 lettere | 3–4 lettere | Il lessico non ha parole da 3 lettere: le bonus corte sono da 4 |
| Esperto | Parola corta sul prefisso → foglia sulla desinenza | Se nessuna parola corta sul prefisso permette uno scambio utile, si prova con le altre; ogni mossa deve alzare D_sim |
| Agevolata | Innesto sull'iniziale del collo di bottiglia | Più la sostituzione di una parola difficile con una più comune quando nessun innesto aiuta (revisione v2.1) |
| Ruota | Seme di 6–7 lettere più lettere frequenti | Seme lungo quanto la ruota (6–9 lettere): la ruota è un anagramma, con la sua parola completa sempre nello schema |
| Uso delle varianti | Varianti DDA | Il server sceglie la variante del livello successivo (§10) |
| Rapporto d'aspetto | H/W ≈ 1,3 (Android) | Applicato; sull'overlay la griglia ora prende quasi tutto lo spazio |

## 15. Limiti noti

- Le **varianti** non sempre arrivano al bersaglio, soprattutto quando la Standard è piccola o quasi ad albero: l'Agevolata ha poche iniziali libere, l'Esperto poche parole rimovibili. Quando non si allontanano abbastanza mancano del tutto, e si gioca la Standard.
- I **boss** (C, T fino a 98) restano spesso sotto il bersaglio: con la scala fissa i loro T chiedono le griglie più difficili del corpus, e per arrivarci servirebbero parole sempre più rare. Come raccomanda la revisione v2.1, il generatore non forza il bersaglio con un lessico scadente: tiene la griglia più vicina e registra lo scarto nelle metriche.
- D_sim resta un **modello**: "più difficile" per il solver non è ancora verificato sulle chat vere. I dati del §10.4 servono a questo; tutti i valori della curva, dei pesi e della difficoltà automatica aspettano quella verifica.
- Cambiando lessico, `curve.json` o il generatore cambiano anche i livelli già giocati: il server salva solo il numero del livello raggiunto. Per una diretta non è un problema (al massimo cambia la griglia del livello in corso dopo un aggiornamento); la versione del generatore salvata con ogni partita dice con quale regola è stata fatta.
- Le **famiglie lessicali** (molte forme dello stesso verbo nella stessa griglia) non sono ancora limitate: il lessico non conserva il lemma. Morph-it!, da cui nasce il lessico, il lemma lo ha già: basta tenerlo in `words.tsv` ricostruendo il lessico (§16).
- "Image of the Day" e gli altri sfondi non entrano nel generatore: lo sfondo è scelto dall'overlay a ogni livello.

## 16. Revisione v2.1: cosa è cambiato e perché

La proposta "ZeroWords — Proposta per il generatore v2.1" (2 novembre 2026) ha riletto questo documento senza i sorgenti. La versione `zw-2` ne integra la parte che riguarda correttezza e misura, adattata a un gioco giocato dalla chat di una diretta e non da un giocatore solo.

**Integrato in `zw-2`**

| Proposta | Dove |
|---|---|
| Sforzo normalizzato: con tutte le lettere visibili resta solo il costo di risposta, calcolo stabile con log1p/expm1, vincolo c ≤ freddo | §7.1 |
| Ambiguità delle alternative compatibili, pesate per familiarità (Zipf), al posto del conteggio piatto delle esche | §7.1, §7.3 |
| Scala di D_sim fissa per versione, presa dal corpus di riferimento e non dai bersagli | §7.3 |
| Gruppi anti-ripetizione sulla ruota finale, non sul seme | §4.2, ottenuti facendo coincidere ruota e seme |
| Semi lunghi quanto la ruota (8 e 9 lettere compresi), scelti per familiarità all'interno della loro lunghezza | §4.1–4.3 |
| Ogni copia di ogni lettera della ruota serve a una parola dello schema | §4.3, validatore |
| MRV solo per gli obblighi (la parola completa), non per le parole facoltative | §6.3 |
| Varianti: solo parole `main`, prese da tutte le parole della ruota; extra come complemento; bersagli dentro la scala; variante assente se non abbastanza diversa | §9.1, §9.2 |
| Agevolata senza allungare lo schema: sostituzione con una parola più comune | §9.2 |
| Ordine della ruota controllato sulle parole di tutte le griglie giocabili | §8 |
| Difficoltà automatica: aiuti distinti per origine (i regali non contano), chat inattiva senza esito, due esiti uguali per cambiare, almeno tre livelli fra due cambi | §10.1, §10.2 |
| Telemetria per la calibrazione: schema visibile a ogni risposta, aiuti con origine e tempo, partecipanti, tempo effettivo, parole mancate | §10.4 |
| Versione del generatore salvata con ogni partita | §1, §10.4 |
| Controlli: schema ∪ extra = parole della ruota; parola completa; lettere inutili; separazione delle varianti; cicli degli alberi anche nelle varianti; monotonia del solver | §12, `--selftest` |

**Rinviato, in attesa dei dati delle partite**

- Simulazioni Monte Carlo con softmax e più profili di giocatore: il costo non è un problema (il solver è O(K²) per percorso), ma senza dati veri non si sa se avvicinano il modello a una chat.
- Media mobile (rating) della chat per la difficoltà automatica, al posto della serie di due esiti.
- Taratura di η, λ, γ, c e dei pesi k su tempi reali, con insiemi di stima e di verifica separati.
- Beam e mosse neutre per le varianti: più passi da soli non aiutano (§9.1); prima di cambiare motore conviene sapere dalle partite quanto contano davvero le varianti.

**Rinviato, lavoro sul lessico**

- Lemmi e quote di famiglia ("al massimo due forme dello stesso lemma"): Morph-it! ha il lemma, ma `build_lexicon.py` non lo conserva; serve ricostruire il lessico dalla fonte (non tenuta nel repository) con `wordfreq`.
- Livelli editoriali (core, standard, advanced) ed eccezioni per i forestierismi comuni.

**Non adottato**

- Livelli introduttivi separati: in una diretta il livello raggiunto resta salvato, quindi i primi livelli si vedono una volta sola per stanza, e una griglia da 4–6 parole la chat la chiude in pochi secondi.
- Chiavi di versione complete (hash di lessico e configurazione nel progresso, riproduzione dei vecchi livelli): si salva solo il numero del livello e non serve rigiocare un livello identico a mesi di distanza. Basta la versione del generatore nei dati delle partite.
- LDS, beam sul riempimento, bitboard e pool di worker: un livello costa circa mezzo secondo in un thread a parte, preparato mentre si gioca il precedente; nessun problema di velocità da risolvere.
- Seconda rampa crescente, nuova ruota per una variante fallita, allentare μ per l'Esperto dei boss: esclusi anche dalla proposta stessa.

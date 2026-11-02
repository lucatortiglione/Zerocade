# Generatore di livelli ZeroWords

Questo documento spiega come vengono creati i livelli di ZeroWords (ruota di lettere e schema a incastro), partendo dalla curva di difficoltà a dente di squalo. I livelli **non finiscono mai**: il server di Zerocade li genera durante la partita, e il livello n dipende solo dal numero n, dal lessico e da `tools/curve.json`. Lo stesso numero dà quindi sempre lo stesso livello, a qualunque punto del gioco.

Il documento descrive l'algoritmo **così come è implementato**. Dove il codice si discosta dalla specifica, o fissa un valore che la specifica non dava, lo dice esplicitamente (vedi [Scelte non coperte dalla specifica](#scelte-non-coperte-dalla-specifica)).

## Dove sta e come si usa

| File | Ruolo |
|---|---|
| `apps/server/src/wordgen/generator.ts` | Gli stadi 1–6 |
| `apps/server/src/wordgen/board.ts` | Griglia, vincoli rigidi, ricostruzione e controllo di uno schema |
| `apps/server/src/wordgen/lexicon.ts` | Lessico, ranghi di frequenza, indice dei multinsiemi |
| `apps/server/src/wordgen/curve.ts` | Curva T(c, i), dimensioni, matrice di lavoro (legge `tools/curve.json`) |
| `apps/server/src/wordgen/worker.ts`, `levels.ts` | Generazione in un thread a parte, cache e precaricamento per il server |
| `apps/server/src/wordgen/cli.ts` | Riga di comando per tarare e controllare |
| `tools/curve.json` | Tutti i parametri |
| `tools/validate_levels.py` | Controllo indipendente sui livelli scritti dalla riga di comando |

```
npm run wordgen -w @zerocade/server -- --only 1-40     questi livelli, una riga ciascuno (T, D_sim, varianti, tempi)
npm run wordgen -w @zerocade/server -- --calibrate     distribuzione del punteggio grezzo, per solver.scale
npm run wordgen -w @zerocade/server -- --write 600     livelli 1..600 in data/levels/it/pack_NNN.json
python tools/validate_levels.py                        controlla quei pacchetti (esce con 1 se un livello è rotto)
```

I pacchetti in `data/levels/it` servono solo al controllo: il server non li legge. Nel pacchetto Windows il generatore viaggia come `app/wordgen-worker.mjs`, insieme a `app/incastro/` (lessico, blocklist, `curve.json`, `chapters.json`).

## Panoramica

Per ogni livello il bersaglio T(c, i) ∈ [0, 100] attraversa sei stadi:

| Stadio | Cosa fa | Funzione |
|---|---|---|
| 1. Ruota sintetica | Sceglie un seme di 6–7 lettere, aggiunge 1–2 lettere frequenti fino a 6–9, estrae dall'indice tutte le parole formabili, scarta le ruote povere | `Generator.attempt`, `makeWheel`, `Lexicon.madeFrom`, `gridPool` |
| 2. Scheletro | Maschere e parole portanti dell'archetipo (A, B, C, D) | `skeletonA`, `skeletonB`, `skeletonCenter` |
| 3. Motore CSP | Backtracking con vincoli rigidi; le posizioni sono ordinate dalla funzione di costo J | `fill`, `options`, `cost`, `Board.fits` |
| 4. Solver umano simulato | Misura D_sim; se è fuori da ±3 punti da T, sposta la rarità delle parole e riprova | `simulate`, `Generator.level` |
| 5. Ordine della ruota | Dispone le lettere in modo che la parola più lunga non si legga in cerchio | `wheelOrder` |
| 6. Varianti DDA | Dalla griglia Standard ricava Agevolata (T − 15) ed Esperto (T + 12) con modifiche locali | `variants`, `easyStep`, `expertStep` |

## 0. Curva a dente di squalo, senza fine

I livelli sono divisi in **denti** di 10 livelli, due per capitolo da 20. Il livello n sta nel dente c = ⌊(n − 1) / 10⌋, alla posizione i = (n − 1) mod 10:

```
T(c, i) = forma[i] + rampa(c)                              limitato a 0..100
forma   = [68, 68, 68, 71, 74, 77, 80, 83, 92, 40]
rampa   = −12 + (6 − (−12)) · (1 − e^(−c / 30))            da −12 verso +6
```

La rampa non ha un ultimo livello: si avvicina a +6 dente dopo dente, ed è al 63% del percorso dopo 30 denti (livello 300) e al 95% dopo 90 (livello 900). Da lì in poi il dente si ripete quasi uguale.

| Posizione i | Fase | Archetipo | T al livello 1–10 | T a regime |
|---|---|---|---|---|
| 0–2 | Inizio dente (duro) | A · Telaio asimmetrico | 56 | 74 |
| 3–7 | Salita | B · Doppio lobo a ponte | 59 → 71 | 77 → 89 |
| 8 | Picco boss | C · Arcipelago a ramificazione | 80 | 98 |
| 9 | Scarico | D · Arena densa | 28 | 46 |

**Dimensioni.** Lettere della ruota e numero di parole K crescono allo stesso modo: g(n) = 1 − e^(−(n−1)/300). La ruota va da 6 verso 9 lettere e K da 8 verso 20 parole: al 63% del percorso al livello 300, al 95% al livello 900. Ogni archetipo applica un moltiplicatore a K e può aggiungere una lettera alla ruota (`wheelBonus`):

| Archetipo | Moltiplicatore di K | Lettere in più | Celle per parola | CR target | Cicli max | Rapporto esca minimo |
|---|---|---|---|---|---|---|
| A | 0,9 | +1 | 11 | 0,14 | 1 (morbido) | 1,8 |
| B | 1,1 | +1 | 10 | 0,17 | 2 (morbido) | 1,6 |
| C | 1,0 | +1 | 10 | 0,12 | 1 (**rigido**) | 2,0 |
| D | 1,2 | — | 8 | 0,30 | nessuno (premiati) | 1,3 |

La ruota non supera mai 9 lettere. La matrice di lavoro H × W ha circa `K × celle per parola` celle, in verticale con H/W ≈ 1,3, ed entro il limite di 16 × 13. Alla fine lo schema viene ritagliato sul rettangolo che contiene davvero le parole. I capitoli di `data/chapters.json` (nomi, colori, giardini) ricominciano da capo dopo l'ultimo.

## 1. Indicizzazione lessicale e ruote sintetiche

**Lessico.** `lexicon/it/words.tsv` contiene parole da 4 a 10 lettere, ciascuna con frequenza Zipf e livello: `main` può stare nello schema, `extra` è valida solo come parola bonus. Le parole della blocklist sono escluse. Il **rango** R_w di una parola è la sua posizione in ordine di frequenza decrescente (1 = la più comune); le parole `main` hanno rango tra circa 1 e 33.000.

**Indice dei multinsiemi.** Ogni parola è indicizzata con la sua firma canonica, cioè le lettere in ordine alfabetico (CARTE → ACERT). Le parole formabili da una ruota si trovano visitando una sola volta ogni sotto-multinsieme di 4 o più lettere (a parità di profondità le lettere uguali si saltano) e consultando la sua firma: al massimo 382 consultazioni per 9 lettere distinte. Il risultato va in una cache limitata.

**Rarità.** Un parametro r ∈ [0, 1] stabilisce a quale rango puntano il seme e le parole dello schema, su scala logaritmica:

- seme: rango da 400 (r = 0) a 16.000 (r = 1);
- parole dello schema: rango da 600 a 22.000.

r parte da T/100 e viene corretto dallo stadio 4.

**Scelta del seme senza memoria.** Ogni livello si genera da solo, quindi non si può ricordare quali semi hanno usato i livelli precedenti. Due regole lo sostituiscono:

1. I semi (parole `main` di 6 e 7 lettere, una per insieme di lettere) sono divisi una volta per tutte in **50 gruppi** con un hash della parola. Il livello n usa solo il gruppo n mod 50, quindi due livelli a meno di 50 di distanza non condividono mai un seme né la sua ruota.
2. All'interno del gruppo si considerano i 300 semi col rango più vicino a quello voluto da r. Ogni livello comincia da un punto diverso della fascia, spostato del rapporto aureo (n·φ mod 1), così livelli dello stesso gruppo con la stessa rarità non partono dallo stesso seme.

**Sintesi della ruota.**

1. Il seme ha 7 lettere se la ruota ne ha almeno 7, altrimenti 6.
2. Per arrivare a 8–9 lettere si aggiungono lettere estratte con peso pari alla loro frequenza in italiano (E 11,8 · A 11,7 · I 11,3 · O 9,8 · N 6,9 · L 6,5 · R 6,4 · T 5,6 · S 5,0 · C 4,5). Nessuna lettera compare più di tre volte.
3. Il bacino 𝒱(ℛ) contiene tutte le parole valide formabili, `main` ed `extra`.

**Filtri che scartano subito una ruota** (costano poco e non consumano il tentativo):

- **Rapporto esca:** |𝒱(ℛ)| / K sotto la soglia dell'archetipo.
- **Bacino della griglia:** le parole candidate allo schema (𝒱_grid) sono meno di K.
- **Inizio dente (A):** almeno l'85% delle parole dello schema deve avere 5 o più lettere. Nello schema entrano al massimo ⌊0,15·K⌋ parole da 4 lettere; le altre restano in 𝒱_bonus, cioè sono accettate in chat come parole bonus.

**Ordine dei candidati.** 𝒱_grid è ordinato per punteggio: vicinanza del log-rango a quello voluto da r, +0,25 per lettera, più un rumore che dipende dal livello. Se ne tengono i primi max(3K, K + 12).

## 2. Scheletro topologico

**A · Telaio asimmetrico (inizio dente).**
- Le celle tra il 40% e il 60% di righe e colonne (un rettangolo al centro) sono interdette.
- La parola più lunga W₀ va sul bordo **inferiore o destro**, sull'ultima o penultima riga/colonna.
- Due portanti W₁ e W₂ (almeno max(5, |W₀| − 2) lettere) la incrociano ortogonalmente con le **loro ultime lettere** (indice p ≥ L − 2), lasciando scoperti i prefissi.
- W₂ viene scelta il più lontano possibile da W₁ lungo W₀, così i prefissi delle due portanti si aprono su zone diverse.
- Si provano fino a tre W₀ e otto posizioni per ciascuna.

**B · Doppio lobo a ponte (salita).**
- La parola ponte è verticale, di 7–8 lettere (oppure la più lunga disponibile), con rango tra 6.000 e 9.500. Se nessuna parola cade nella finestra, si sceglie quella più vicina in scala logaritmica.
- Il ponte sta al centro in verticale e nel terzo centrale in orizzontale. Le sue prime due lettere stanno nel lobo superiore Z_A, le ultime due nel lobo inferiore Z_B.
- Tutte le righe del corpo del ponte (lettere da 2 a L − 3) sono bloccate tranne la colonna del ponte. Così il ponte è l'unico collegamento tra i lobi, e nessuna parola può incrociarne il corpo.
- In fase di riempimento i lobi crescono insieme: quando possibile, la prossima parola va nel lobo che ne ha meno.

**C · Arcipelago a ramificazione (boss).**
- La parola più lunga va al centro.
- Vincolo rigido sul numero ciclomatico, μ = E − V + 1 ≤ 1: ogni parola aggiunta può incrociarne una sola, salvo un unico ciclo in tutto lo schema.
- Ne esce un albero ricco di foglie, senza effetto a cascata.

**D · Arena densa (scarico).**
- Nessuna maschera; la parola più lunga va al centro geometrico.
- Gli incroci doppi, che chiudono cicli, sono premiati.
- La griglia è accettata se almeno il 60% delle parole appartiene a un rettangolo chiuso: due parole parallele che incrociano le stesse due parole perpendicolari.
- Se nessun seme raggiunge il 60%, si tiene la griglia che ci va più vicino.

## 3. Motore CSP di piazzamento

**Vincoli rigidi** (`Board.fits`). Una parola w di lunghezza L va in direzione H o V dalla cella (r, c) solo se:

1. resta dentro la matrice e non tocca celle interdette;
2. ogni cella già occupata contiene esattamente w[k] e non appartiene già a una parola nella stessa direzione;
3. la cella prima dell'inizio e quella dopo la fine sono vuote o fuori dai bordi (isolamento di testa e coda);
4. per ogni lettera su una cella vuota, le due celle ortogonali sono vuote (niente lettere affiancate, *no side-kissing*);
5. incrocia almeno una parola già presente (tranne le parole dello scheletro);
6. nell'archetipo C non porta μ oltre il massimo.

**Funzione di costo dello slot.**

```
J(w, slot) = w1·|CR − CR_target| + w2·segno·Φ_prefisso + w3·Φ_cicli + w4·Φ_aspetto
w1 = 6,0   w2 = 1,0   w3 = 1,5   w4 = 1,5
```

- **CR:** rapporto di incrocio dopo il piazzamento, cioè celle condivise diviso celle con lettere.
- **Φ_prefisso:** per ogni incrocio si guarda l'indice della lettera sulla più rara delle due parole: +1 se è 0 o 1, −0,3 se è 2 o oltre. Il segno dipende dall'archetipo: A e C ×1, B ×0,5, D ×−1. Quindi D preferisce gli incroci sulle iniziali.
- **Φ_cicli:** un piazzamento con k incroci aggiunge k − 1 cicli. Costo pieno (+1 per ciclo) oltre il massimo dell'archetipo, +0,2 sotto. In D vale −1 per ciclo, cioè un premio.
- **Φ_aspetto:** |ln((righe/colonne del rettangolo occupato) / 1,3)|.

**Ricerca.**
- A ogni passo si raccolgono gli slot validi delle prossime parole del bacino che entrano da qualche parte: 6 parole per A, B e C, 40 per D (che così trova gli incroci doppi).
- Si prova lo slot con J minore. In caso di vicolo cieco si torna indietro e si prova il secondo e il terzo (3 rami per passo), entro 250 nodi.
- Le parole che non entrano da nessuna parte vengono saltate e restano bonus.
- Per trovare gli slot, la griglia tiene un indice lettera → celle ancora incrociabili.

## 4. Validazione con il solver umano simulato

**Difficoltà residua.** A ogni turno t, ogni parola non ancora trovata ha

```
d_t(w) = (α·L_w^1,4 + β·ln(1 + R_w)) · Π_{p ∈ svelate(w)} (1 − η(p, w[p]))       α = 1,0   β = 1,2
```

| Posizione della lettera svelata | η |
|---|---|
| p = 0 (iniziale) | 0,45 |
| p = 1 | 0,25 |
| p = L − 1 (desinenza) | 0,05 |
| corpo, consonante rara (Z G B F V P M) | 0,18 |
| corpo, altra consonante | 0,14 (valore scelto qui) |
| corpo, vocale | 0,10 |

**Turni.**
- Il solver risolve sempre la parola con d_t minimo, ne svela le lettere sulle parole che la incrociano e ricalcola.
- Lo sforzo del primo turno è l'**attrito d'avvio** C_init; si registrano anche la media e il massimo degli sforzi.
- La parola del massimo è il **collo di bottiglia**.

```
D_grezzo = k1·C_init + k2·media(d_t) + k3·max(d_t) + k4·|𝒱_bonus| / K      k = 0,3 · 0,4 · 0,3 · 1,0
D_sim    = 100 · (D_grezzo − 8) / (30 − 8)                                  limitato a 0..100 nelle metriche
```

**Scala [8, 30].**
- Viene dalla calibrazione (`--calibrate`), che genera griglie in tutto il gioco con tre rarità diverse.
- I valori grezzi tipici per archetipo sono: A 20–37, B 16–27, C 18–31, D 15–21.
- La scala è scelta in modo che ogni archetipo possa raggiungere la sua fascia di T.

**Retroazione.**
- La griglia è approvata se |D_sim − T| ≤ 3.
- Altrimenti la rarità diventa r ← r − 0,012·(D_sim − T) e si riprova, al massimo 14 volte.
- Se nessun tentativo centra la tolleranza, il livello tiene la griglia più vicina a T.
- Tutti i confronti usano D_sim non limitato, così anche una griglia oltre la scala (sopra 100) può essere corretta.

## 5. Ordine della ruota

Le lettere vengono mescolate fino a 500 volte. Si tiene l'ordine che, letto in cerchio in senso orario o antiorario, forma meno parole dello schema e mai la più lunga, cioè `words[0]`. Il server usa la stessa parola quando il pubblico rimescola la ruota.

## 6. Varianti DDA per lo stesso livello

Le varianti condividono la ruota e le parole bonus della griglia Standard. Partono da una sua copia e vengono rimisurate dal solver dopo ogni modifica. Una modifica è accettata solo se sposta D_sim nella direzione giusta, scegliendo quella che porta più vicino al bersaglio. Si fanno al massimo sei modifiche, fermandosi appena il bersaglio è raggiunto o superato. Produrre le varianti costa una frazione della griglia Standard: niente nuova ruota, niente nuovo riempimento.

**Agevolata (bersaglio T − 15).**
- Sulla lettera 0 o 1 del collo di bottiglia si innesta una parola corta di 𝒱_bonus (4 lettere; 5 solo se nessuna da 4 entra), che lo incrocia e non tocca altro.
- Trovata la parola corta, l'iniziale del collo di bottiglia si svela: calano insieme l'attrito d'avvio e il picco di stallo.
- Se il collo di bottiglia non accetta innesti (iniziali già incrociate, o lettere vicine), si passa alla parola successiva più difficile.

**Esperto (bersaglio T + 12).**
- Si toglie una parola corta che regala la lettera 0 o 1 a una parola più lunga, e al suo posto si aggancia una **foglia**: una parola nuova che incrocia una sola parola, sull'ultima lettera della foglia o della parola a cui si appoggia.
- Sono ammesse solo rimozioni che lasciano la griglia connessa e pulita: togliendo una parola, due sue lettere d'incrocio consecutive potrebbero restare affiancate.
- Se nessuna parola regala un prefisso con uno scambio che alzi D_sim (frequente, perché J già evita quegli incroci in A, B e C), si prova con le altre parole.
- Le foglie candidate sono le 30 più lunghe e più rare del bacino.

## Nel server: generazione al volo e DDA

- **Thread a parte.** Il generatore gira in un worker thread: un livello costa in media mezzo secondo e al massimo 2–3 secondi (gli scarichi D grandi), che non devono fermare la diretta. Il lessico si carica una volta all'avvio del worker.
- **Precaricamento.** Appena un livello comincia, il server chiede al worker il successivo e tiene in memoria gli ultimi 24 generati.
- **Attesa rara.** Si aspetta solo al primo livello e dopo un salto ("Vai al livello"): in quel momento l'overlay mostra "Prossimo livello in arrivo…" (fase `loading`).
- **Variante del livello successivo.** Con "Difficoltà automatica" acceso (impostazione `dda`, in Info partita), quando un livello finisce il server sceglie la variante del successivo:
  - **un passo più facile** se il tempo è scaduto o gli aiuti hanno mostrato almeno un terzo delle parole;
  - **un passo più difficile** se la chat ha trovato tutte le parole senza nessun aiuto (né automatico, né da regali, né dalla dashboard);
  - **altrimenti la stessa**.

  I passi sono Agevolata ↔ Standard ↔ Esperto. "Ricomincia dal livello 1" torna a Standard. Con la difficoltà automatica spenta si gioca sempre la Standard.
- **Info partita.** La dashboard mostra la griglia in gioco, la sua difficoltà simulata e, durante il riepilogo, la variante del livello successivo.

## Formato dei livelli scritti per il controllo

`data/levels/it/pack_NNN.json`, 100 livelli per file, `"version": 3`. Esempio reale (livello 9, parole ed extra accorciati):

```json
{
  "id": 9, "letters": "RAPVAGE", "rows": 10, "cols": 8, "seed": "PREGAVA",
  "words": [{ "w": "PREGAVA", "r": 5, "c": 0, "d": "H" }, { "w": "VAGARE", "r": 4, "c": 6, "d": "V" }, …],
  "extras": ["AERA", "AGRA", "AGRE", …],
  "metrics": { "archetype": "C", "target": 80, "dsim": 76.7, "letters": 7, "words": 8, "crossings": 7,
               "cycles": 0, "startFriction": 18.25, "meanEffort": 20.18, "peakEffort": 23.55,
               "bait": 34, "medianRank": 18301 },
  "variants": {
    "easy":   { "rows": 10, "cols": 8, "words": […], "extras": […], "metrics": { "target": 65, "dsim": 65.5, … } },
    "expert": { "rows": 10, "cols": 8, "words": […], "extras": […], "metrics": { "target": 92, "dsim": 77.3, … } }
  }
}
```

- `words[0]` è sempre la parola più lunga.
- `extras` contiene tutte le parole valide della ruota che non sono nello schema.

## Validazione

`tools/validate_levels.py` fallisce se, nello schema Standard o in una variante:
- una parola esce dallo schema, contraddice un'altra in una casella, non è formabile dalla ruota, non è `main` o è bloccata;
- compaiono parole involontarie (sequenze di 2+ lettere non dichiarate);
- lo schema non è connesso;
- la ruota ha meno di 6 o più di 9 lettere, oppure lo schema supera 16 × 13;
- la prima parola non è la più lunga, o la ruota la forma in cerchio;
- uno schema C ha più cicli del consentito;
- gli id non sono 1..N, oppure un insieme di lettere ritorna a meno di 50 livelli di distanza.

Conta inoltre, senza fallire, quante griglie cadono entro ±3 dal loro bersaglio e quante ruote si ripetono più lontano.

## Risultati attuali

Livelli 1–600 (`--write 600`), validatore senza errori:

| Griglia | Entro ±3 dal bersaglio |
|---|---|
| Standard | 435 / 600 |
| Agevolata (T − 15) | 263 / 600 |
| Esperto (T + 12) | 243 / 600 |

- 600 livelli in 288 s, cioè 0,48 s a livello in media; i più lenti sono gli scarichi D con 22–24 parole, 2–3 s.
- Solo 2 ruote ricompaiono, e a più di 50 livelli di distanza.
- Campione 99.991–100.000: 9 griglie Standard su 10 entro ±3, 0,85 s a livello, griglie alla dimensione massima.
- Dove la Standard manca il bersaglio, lo scarto mediano è di pochi punti. I mancati più ampi sono nei primi denti (ruote corte, poche parole) e nei boss C.

## Scelte non coperte dalla specifica

| Punto | Specifica | Implementazione |
|---|---|---|
| Numero di livelli | — | Infinito: rampa di T e crescita delle dimensioni con esponenziali che si stabilizzano; capitoli ciclici |
| Indipendenza dei livelli | — | Ogni livello si genera dal solo numero. Al posto della memoria dei semi già usati ci sono 50 gruppi di semi e il passo aureo; non c'è più la penalità per le parole usate di recente |
| Curva T(c, i) | Solo T ≈ 68 a inizio dente | Forma del dente, rampa −12 → +6 e due denti per capitolo sono ipotesi da tarare |
| Matrice di difficoltà | Citata, non data | K, lettere, celle per parola, CR target, cicli e soglie esca per archetipo (tabella sopra) |
| Pesi w1–w4, k1–k4, α, β | Non dati | Valori in `curve.json`; scala di D_sim [8, 30] dalla calibrazione |
| η consonante comune nel corpo | Date solo vocali e consonanti rare | 0,14, a metà strada |
| A · posizione di W₀ | Bordo sinistro o superiore | Bordo **inferiore o destro**: con W₀ in alto o a sinistra, una portante che la incrocia con le ultime lettere uscirebbe dalla matrice |
| A · lunghezze | W₀ 7–8, portanti 6–7 | Con ruote corte: W₀ = la più lunga disponibile, portanti ≥ max(5, \|W₀\| − 2) |
| A, B, C · ruota | 6–9 lettere | Una lettera in più rispetto a D: con 6 lettere non ci sono abbastanza parole da 5+ lettere |
| B · fascia neutra | 2 righe | Tutte le righe del corpo del ponte (3–4 con un ponte da 7–8): stesso effetto, il ponte resta l'unico canale |
| B · equilibrio dei lobi | Non specificato | Il lobo con meno parole ha la precedenza |
| D · 60% in rettangoli | Vincolo | Se nessuna ruota ci arriva, si tiene la griglia che ci va più vicino |
| Parole bonus da 3 lettere | 3–4 lettere | Il lessico non ha parole da 3 lettere: le parole bonus corte sono da 4 |
| Esperto | Parola corta sul prefisso → foglia sulla desinenza | Se nessuna parola corta sul prefisso permette uno scambio utile, si prova con le altre; ogni modifica deve alzare D_sim |
| Uso delle varianti | Varianti DDA | Il server sceglie la variante del livello successivo con le regole della sezione "Nel server" |
| Rapporto d'aspetto | H/W ≈ 1,3 (Android) | Applicato. Sull'overlay di Zerocade lo schema sta in un'area larga e bassa, e gli schemi alti hanno caselle piccole |

## Limiti noti

- Le **varianti** non sempre arrivano al bersaglio, soprattutto quando la griglia Standard è già piccola o quasi ad albero: l'Agevolata ha poche iniziali libere, l'Esperto poche parole rimovibili.
- Tutti i valori della curva e dei pesi aspettano un **playtest**: la forma del dente, la scala di D_sim, le soglie del rapporto esca, e le regole della DDA (un terzo di parole dagli aiuti; zero aiuti per salire).
- Sull'**overlay** di Zerocade (1080 × 1920) uno schema 16 × 13 lascia caselle di circa 30 px. Per i livelli avanzati conviene dare più spazio allo schema, oppure abbassare `maxRows`/`maxCols`.
- Un livello generato dipende dal lessico e da `curve.json`: cambiandoli, cambiano anche i livelli già giocati. Il server salva solo il numero del livello raggiunto.

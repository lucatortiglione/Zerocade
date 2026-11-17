# WORD HUNT — Specifica funzionale, grafica e tecnica

**Versione:** 1.0 · **Data:** 17 novembre 2026  
**Destinazione:** gioco di parole interattivo per live streaming, con spettatori che rispondono in chat e assegnazione automatica della prima risposta valida.  
**Priorità assoluta:** riprodurre fedelmente la griglia dello screenshot allegato, **compresi colori delle parole e avatar del giocatore vincitore collocato in una casella adiacente alla parola**.  
**Materiale di riferimento:** `word_hunt_riferimento.png` (570 × 769 px) e `word_hunt_fixture.json` (griglia e parole del caso di test).  
**Stato del documento:** specifica eseguibile; sono distinte le osservazioni certe ricavate dallo screenshot dalle regole di gioco e decisioni tecniche proposte.

![Screenshot di riferimento Word Hunt](word_hunt_riferimento.png)

---

## 1. Obiettivo e confini della specifica

Realizzare un **cerca-parole multiplayer in diretta**: una griglia di lettere è visibile agli spettatori; ciascuno prova a individuare le parole nascoste e le scrive nella chat; il bot valida il messaggio e determina automaticamente **chi è stato il primo a trovare ciascuna parola**. Quando una parola viene acquisita:

1. Le sue lettere cambiano immediatamente da sfondo scuro a un **unico colore acceso**, diverso o distinguibile da quello delle altre parole già trovate.
2. Il testo della parola diventa **nero** per contrasto con la tessera colorata.
3. Nell'apposita **casella immediatamente prima o dopo la parola**, lungo il medesimo asse, appare l'**avatar reale dello spettatore che l'ha indovinata**.
4. Il risultato è condiviso in tempo reale a tutte le viste del gioco; la parola non può essere conquistata da un secondo utente.
5. La griglia rimane visivamente ordinata e **non si sposta** quando viene assegnata una risposta.

Il presentatore/streamer gestisce l'avvio e l'arresto dei round, ma **non decide manualmente chi è arrivato primo**. Il gioco deve funzionare in un browser/overlay OBS e, mediante adapter compatibili, con le chat delle piattaforme supportate.

### 1.1 Requisiti non negoziabili (MUST)

- Una **griglia 20 × 15** con intestazioni **A–T** a sinistra e **1–15** sopra, nella modalità che replica lo screenshot.
- Una cella è sempre identificabile con coordinate del tipo `C7`, `O4` o `Q2`.
- **Colore associato alla parola trovata, non al giocatore**: un medesimo spettatore può trovare quattro parole e queste possono essere di quattro colori diversi.
- **Avatar associato a una singola parola trovata**: la stessa immagine può essere ripetuta accanto a più parole dello stesso utente.
- Gli avatar **non sono celle bloccate**. Nel riferimento, anche le quattro icone rosse/nere sono immagini profilo.
- Ogni parola risolta ha **esattamente una posizione-avatar**; il suo quadrato non deve interrompere, sovrapporre o cancellare le lettere che compongono la parola.
- Validazione lato server; il browser non è fonte autorevole di soluzioni, ordine di arrivo o punteggi.
- Un solo vincitore per parola e per round, determinato automaticamente con criterio temporale riproducibile.
- Adattamento alle risoluzioni dello stream **senza deformare le caselle** e senza modificare le proporzioni del tabellone.
- Nessuna barra, classifica, animazione o decorazione aggiuntiva **sopra la griglia** nella modalità visiva «identica allo screenshot».

### 1.2 Cosa non è ricavabile dall'immagine

Lo screenshot **non rivela** durata del round, punteggi, numero totale delle parole ancora nascoste, algoritmo di generazione, validazione della chat, regole per le diagonali, classifica o API utilizzate. Tutti questi aspetti sono **scelte implementative proposte qui**, non caratteristiche dichiarate dell'immagine originale. Le otto parole evidenziate sono quelle osservabili, **non necessariamente tutte** quelle che appartengono alla partita originaria.

---

## 2. Analisi precisa dell'immagine di riferimento

### 2.1 Dimensioni, griglia e coordinate

| Proprietà | Specifica della modalità «Reference» |
|---|---|
| Risoluzione dello screenshot | **570 × 769 px** |
| Orientamento | Verticale, rapporto ~0,741 |
| Numero righe | **20**, dalla A alla T |
| Numero colonne | **15**, da 1 a 15 |
| Numero posizioni | **300** |
| Passo della griglia | ~**36 px** sia in orizzontale sia in verticale |
| Larghezza e altezza delle tessere | ~**34 × 34 px** |
| Separazione tra le tessere | ~**2 px** |
| Origine indicativa della prima tessera | `(x≈24, y≈45)` nello screenshot |
| Area effettiva occupata dalle tessere | ~**538 × 718 px** |
| Angoli tessera | Arrotondati, ~**4 px** |
| Etichette colonne | Numeri piccoli chiari centrati sulla tessera |
| Etichette righe | Lettere chiare a sinistra, centrate verticalmente |
| Caratteri celle | **Singola lettera maiuscola**, centrata, grassetto marcato |

> Le misure indicate con `~` derivano dall'analisi dei pixel dello screenshot: sono **target di replica visiva**, non una dichiarazione sul codice CSS usato dal software originale. Per il confronto automatico utilizzare il file immagine, non un'interpretazione approssimativa dei numeri.

Per una tessera di indice zero-based `r`/`c`:

```ts
const REFERENCE = {
  canvasWidth: 570,
  canvasHeight: 769,
  rows: 20,
  cols: 15,
  gridX: 24,
  gridY: 45,
  tile: 34,
  gap: 2,
  step: 36,
};

const x = REFERENCE.gridX + c * REFERENCE.step;
const y = REFERENCE.gridY + r * REFERENCE.step;
const coordinate = `${String.fromCharCode(65 + r)}${c + 1}`;
```

La griglia può essere implementata mediante `position: absolute` in una superficie di riferimento 570 × 769, o con CSS Grid **purché** produca la stessa geometria. Il rendering va scalato **uniformemente**, non ricostruito con misure indipendenti che possano far divergere righe e colonne.

### 2.2 Palette cromatica: valori di riferimento

| Elemento | Colore approssimato dal riferimento | Comportamento |
|---|---|---|
| Sfondo generale | `#0E0E16` | Quasi nero, tendenza blu/viola |
| Tessera non trovata | `#16161C` | Grigio antracite |
| Bordo/contorno tessera | `#1E1E25` | Contorno sottile |
| Lettera non trovata | `#FFFFFF` | Bianco, grassetto |
| Lettera sopra parola trovata | `#000000` | Nero, grassetto |
| PENSIERO | `#F97316` | Arancione |
| MARINARE | `#F472B6` | Rosa chiaro |
| OBBLIGO | `#22C55E` | Verde |
| MURATORE | `#FF2D78` | Fucsia |
| STAGNO | `#A855F7` | Viola |
| DIRETTORE | `#4ADE80` | Verde chiaro |
| RIFLESSO | `#FACC15` | Giallo |
| CORONA | `#22D3EE` | Ciano |

Questi valori rappresentano la **palette di replica** del fotogramma (campionamento delle aree piatte e approssimazioni di contorni). Non aggiungere gradienti, colori pastello, glow invadenti, linee che uniscono le lettere, cerchi attorno alle parole o ombre pesanti: **la parola è colorata tessera per tessera**, come nell'immagine.

### 2.3 Le otto parole già trovate: mapping esatto

Tutte le coordinate riportate nella seguente tabella sono **1-based**, come le intestazioni visibili. Il simbolo `→` significa «dal primo estremo al secondo», senza implicare direzione di lettura inversa.

| Parola | Celle colorate | Orientamento | Colore | Avatar vincitore | Collocazione |
|---|---|---|---|---|---|
| **PENSIERO** | A2 → A9 | Orizzontale | `#F97316` | **A1** | Prima della `P`, a sinistra |
| **MARINARE** | B5 → B12 | Orizzontale | `#F472B6` | **B13** | Dopo la `E`, a destra |
| **OBBLIGO** | C7 → C13 | Orizzontale | `#22C55E` | **C14** | Dopo la `O`, a destra |
| **MURATORE** | E6 → E13 | Orizzontale | `#FF2D78` | **E5** | Prima della `M`, a sinistra |
| **STAGNO** | C1 → H1 | Verticale | `#A855F7` | **B1** | Prima della `S`, sopra |
| **DIRETTORE** | F4 → N4 | Verticale | `#4ADE80` | **O4** | Dopo la `E`, sotto |
| **RIFLESSO** | I2 → P2 | Verticale | `#FACC15` | **Q2** | Dopo la `O`, sotto |
| **CORONA** | B15 → G15 | Verticale | `#22D3EE` | **H15** | Dopo la `A`, sotto |

#### Due profili visibili, quattro parole ciascuno

- **Profilo con icona rossa/nera:** A1, B1, B13 e O4, rispettivamente associati a PENSIERO, STAGNO, MARINARE e DIRETTORE.
- **Profilo con immagine illustrata:** C14, E5, H15 e Q2, rispettivamente associati a OBBLIGO, MURATORE, CORONA e RIFLESSO.

**Deduzione grafica importante:** non esistono «blocchi con X» nelle otto posizioni appena elencate; nello screenshot sono tutte rappresentazioni del profilo di chi ha trovato una parola. Una riproduzione che disegni quelle icone come ostacoli o trappole è **errata**.

### 2.4 Matrice di riferimento completa 20 × 15

La matrice sotto è trascritta dalle lettere visibili. Ogni riga contiene **esattamente 15 simboli**. `X` è una **posizione coperta da un avatar**: la lettera eventualmente presente sotto l'immagine **non è osservabile** e non va inventata nella fixture di confronto.

```text
     1  2  3  4  5  6  7  8  9 10 11 12 13 14 15
 A   X  P  E  N  S  I  E  R  O  E  F  F  A  L  M
 B   X  L  E  E  M  A  R  I  N  A  R  E  X  R  C
 C   S  E  T  L  I  T  O  B  B  L  I  G  O  X  O
 D   T  N  R  R  A  B  B  I  A  O  H  A  R  A  R
 E   A  S  A  A  X  M  U  R  A  T  O  R  E  A  O
 F   G  N  S  D  L  R  N  O  O  P  A  S  S  S  N
 G   N  E  S  I  E  A  T  T  C  O  V  R  E  N  A
 H   O  V  O  R  M  A  N  T  E  A  S  R  S  Z  X
 I   L  R  S  E  E  B  E  G  E  M  A  A  E  C  S
 J   I  I  O  T  F  A  O  E  E  T  P  T  O  E  I
 K   S  F  T  T  A  S  I  L  I  S  E  O  R  A  O
 L   C  L  S  O  O  S  C  S  O  D  E  A  A  E  E
 M   I  E  O  R  I  V  I  A  E  R  S  B  T  O  A
 N   O  S  C  E  O  V  T  S  F  I  R  I  G  G  S
 O   N  S  S  X  O  R  C  E  C  F  I  S  S  R  I
 P   T  O  O  A  N  O  C  E  S  H  A  S  A  I  C
 Q   F  X  M  G  T  R  R  B  C  R  E  L  L  D  R
 R   E  P  N  T  R  P  E  A  C  O  F  N  E  O  O
 S   O  T  L  P  E  C  C  A  T  O  A  I  T  T  C
 T   F  I  N  A  N  Z  A  S  B  M  I  I  I  A  E
```

**Vincolo QA:** il file allegato `word_hunt_fixture.json` contiene queste righe e gli otto percorsi esatti. Deve essere validato prima di costruire la UI: ogni parola deve corrispondere alle lettere lungo il suo percorso, nessun percorso deve intersecare `X`, ogni `X` deve coincidere con un avatar vincitore.

---

## 3. Regole del gioco

### 3.1 Modalità principale: «Chat Hunt»

**Modalità proposta**, dato che la chat non appare nello screenshot ma è richiesta per il gioco interattivo in live:

1. Il bot genera un tabellone o carica un tabellone predefinito.
2. Lo streamer sceglie durata, tema e difficoltà e avvia il round.
3. Tutti gli spettatori vedono la **stessa griglia** in tempo reale.
4. Ogni spettatore scrive **la parola completa** nella chat, per esempio `pensiero`.
5. Il bot riceve, normalizza e confronta il testo con l'elenco delle parole-obiettivo ancora non trovate.
6. La prima risposta accettata assegna irrevocabilmente la parola a un partecipante (salvo correzione amministrativa esplicita, tracciata separatamente).
7. Il sistema colora il percorso e mostra l'avatar del vincitore nella casella riservata.
8. Il round finisce quando tutte le parole-obiettivo sono state scoperte, scade il timer oppure l'host termina il round.
9. A fine round possono apparire risultati e classifica **fuori dal tabellone** o in una scena separata.

Nessun clic sulla griglia è necessario per vincere nella modalità «Chat Hunt». In un'eventuale modalità browser-giocatore si potrà aggiungere la selezione tramite trascinamento, ma **non** deve cambiare la logica di attribuzione delle risposte in live.

### 3.2 Parole valide

- Per impostazione predefinita: **parola esatta**, non un sinonimo e non una flessione diversa.
- Il testo è confrontato in maiuscolo, con gestione degli spazi esterni, Unicode coerente, punteggiatura periferica e accenti secondo le regole del dizionario.
- Esempio: `  Pensiero! ` → `PENSIERO` → valido se è parola-obiettivo non ancora acquisita.
- Esempio: `pensieroso` → **non valido** per `PENSIERO`.
- Esempio: `ho trovato pensiero` → **non valido** in modalità «risposta esatta» (opzionale una modalità con comando `!trova PENSIERO`).
- Se il testo contiene URL, comandi di moderazione, più parole o simboli inappropriati, applicare le regole del parser; non cercare automaticamente sottostringhe dentro ogni messaggio perché produce falsi positivi.
- Una parola già trovata non può essere riassegnata.
- Parole italiane casualmente leggibili nella griglia **non valgono** se non sono fra i target del round.

### 3.3 Direzioni consentite

La modalità fedele allo screenshot deve supportare almeno **orizzontale da sinistra a destra** e **verticale dall'alto al basso**, perché sono le due direzioni effettivamente osservabili nella fixture.

Configurazione consigliata:

```json
{
  "placementDirections": ["RIGHT", "DOWN"],
  "allowReverse": false,
  "allowDiagonals": false,
  "allowWordIntersections": false
}
```

Un livello avanzato potrà abilitare `LEFT`, `UP` e le diagonali, ma ogni direzione abilitata richiede una **cella-avatar valida lungo il prolungamento del percorso**. Per mantenere leggibilità e identità grafica, evitare percorsi spezzati, curve o «snake words» nella prima versione.

### 3.4 Configurazione iniziale suggerita (modificabile)

| Parametro | Default proposto | Note |
|---|---:|---|
| Griglia | **20 × 15** | Obbligatorio in modalità screenshot |
| Target per round | **8** | Pari alle otto parole visibili, ma parametrico |
| Lunghezza minima | **5** lettere | Filtrare parole ambigue e troppo facili |
| Lunghezza massima | **12** lettere | Deve stare fisicamente nella griglia |
| Durata | **180 secondi** | Non ricavabile dall'immagine |
| Preparazione round | **5 secondi** | Countdown facoltativo fuori griglia |
| Tentativi errati | Illimitati con rate limit | Nessuna penalità di default |
| Vincitore | Prima risposta valida secondo ordine deciso dal server | Nessuna selezione manuale |
| Selezione diagonali | Disabilitata | Attivabile nella modalità avanzata |
| Intersezioni tra parole-obiettivo | Disabilitate | Evita ambiguità di colori e avatar |
| Chat | Messaggi testuali normali | Comando `!trova` opzionale |

---

## 4. Meccanica centrale: parola colorata e avatar adiacente

### 4.1 Il modello corretto

Una parola è un oggetto indivisibile che contiene un elenco di coordinate, il colore assegnato e la sua **cella di firma** (avatar anchor). La cella di firma si trova **sullo stesso asse** della parola, a una distanza di **una sola casella** dall'estremità iniziale o finale.

Esempio orizzontale, avatar **prima**:

```text
   A1 A2 A3 A4 A5 A6 A7 A8 A9
   🧑  P  E  N  S  I  E  R  O
```

Esempio orizzontale, avatar **dopo**:

```text
   B5 B6 B7 B8 B9 B10 B11 B12 B13
    M  A  R  I  N  A   R   E  🧑
```

Esempio verticale, avatar **dopo**:

```text
   F4  D
   G4  I
   H4  R
   I4  E
   J4  T
   K4  T
   L4  O
   M4  R
   N4  E
   O4  🧑
```

**Gli emoji sono soltanto schematici:** nell'interfaccia finale il bot deve renderizzare la **vera immagine profilo**, ritagliata nella tessera quadrata come nello screenshot.

### 4.2 Calcolo dell'anchor

Siano `start = (r0, c0)`, `end = (r1, c1)` e il vettore unitario di avanzamento `d = (dr, dc)`.

```ts
type CellCoord = { row: number; col: number };

type AvatarSide = 'before' | 'after';

function avatarCandidates(
  start: CellCoord,
  end: CellCoord,
  d: CellCoord,
) {
  return {
    before: { row: start.row - d.row, col: start.col - d.col },
    after:  { row: end.row + d.row,   col: end.col + d.col   },
  };
}
```

Una posizione candidata è utilizzabile **solo se**:

- è interna alla griglia;
- non appartiene a un'altra parola-obiettivo;
- non è un anchor già riservato a un'altra parola;
- non è stata assegnata come cella non sovrascrivibile da una regola speciale;
- non produce una collisione con un avatar esistente.

**Priorità proposta:** verificare entrambi gli estremi; scegliere quello meno vincolante per gli altri posizionamenti; se entrambi falliscono, rigenerare la posizione della parola. **Non** spostare un avatar verso una casella qualsiasi perché la sua adiacenza è parte essenziale dell'estetica richiesta.

### 4.3 Quando comparire e cosa nascondere

**Prima del ritrovamento:** la tessera riservata all'avatar può apparire come una normale cella scura con lettera casuale di riempimento, **ma non può essere inclusa in nessun percorso-obiettivo**. La lettera di riempimento deve essere persistente e verificabile in memoria.  
**Al ritrovamento:** soltanto quella tessera viene coperta dall'immagine dell'utente, senza modificare le dimensioni del tabellone o cancellare lo stato del generatore.  
**Dopo il ritrovamento:** avatar e colore restano visibili fino alla fine del round, salvo evento di reset.

Nella **fixture fotografica** la lettera sotto l'avatar è sconosciuta; per questo la sua matrice usa `X`, mentre il modello runtime può avere una lettera di riempimento definita per ciascun anchor.

### 4.4 Rendering dell'avatar

- Dimensioni visive: tessera quadrata della griglia, **34 × 34 px** alla scala di riferimento.
- `object-fit: cover`, `object-position: center`, clipping su angoli arrotondati.
- **Nessun nome dell'utente stampato sopra la lettera**; nello screenshot appare soltanto il profilo.
- Usare la stessa immagine dello stesso spettatore anche per parole diverse, finché l'utente non aggiorna il profilo o per tutta la durata del round secondo una regola esplicita.
- Se il provider non espone l'immagine profilo, usare avatar neutro deterministico (iniziale, colore, icona autorizzata) mantenendo l'esatta collocazione.
- Se l'immagine non carica o scade, sostituirla con il fallback senza perdere la rivendicazione della parola.
- Bloccare URL non sicuri, caricare immagini solo da origini autorizzate oppure da un proxy/cache controllato; limitare dimensione, formato e durata della cache.
- Non usare la foto del proprietario dello stream in luogo di quella del vincitore; ogni claim deve avere il relativo `participant_id`.
- Prevedere `alt`/tooltip del tipo `Trovata da: nomeutente — OBBLIGO`, visibile nella vista interattiva; l'overlay per OBS può mantenere solo l'immagine.

### 4.5 Intersezioni, occupazione e collisioni

Per la **versione 1** adottare la regola semplice: le parole non condividono celle e gli anchor sono unici. Questo garantisce che ogni tessera colorata abbia **un solo proprietario logico** e **un solo colore**. In un'eventuale versione con incroci, occorre una politica distinta (`foreground-word`, split-colors o rinuncia all'intersezione), ma **non introdurla nella versione fedele allo screenshot**.

Una parola già assegnata non può essere ricolorata da una nuova parola o da eventi successivi. Un avatar non deve coprire un carattere di un target ancora da trovare.

---

## 5. Specifica di rendering: replica visiva della griglia

### 5.1 Architettura UI consigliata

Usare tre livelli visivi **sovrapposti**, tutti derivati dal medesimo stato:

1. **Background e guide:** sfondo, coordinate A–T e 1–15.
2. **Tiles:** 300 caselle, lettera, bordo, stato base/scoperto.
3. **Avatar overlay:** ritagli del profilo posizionati esclusivamente negli anchor acquisiti.

Un quarto livello **facoltativo** gestisce un lampo di conferma brevissimo (`claim animation`) senza cambiare la posizione delle tessere. Separare gli effetti dalla logica del gioco permette di disabilitarli in modalità screenshot.

### 5.2 CSS d'esempio: canvas di riferimento

```css
.wordhunt-reference {
  position: relative;
  width: 570px;
  height: 769px;
  overflow: hidden;
  background: #0e0e16;
  isolation: isolate;
  font-family: Arial, Inter, system-ui, sans-serif;
  user-select: none;
}

.wordhunt-tile {
  position: absolute;
  box-sizing: border-box;
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #1e1e25;
  border-radius: 4px;
  background: #16161c;
  color: #fff;
  font-size: 17px;
  font-weight: 800;
  line-height: 1;
  text-align: center;
}

.wordhunt-tile[data-found='true'] {
  background: var(--word-color);
  color: #000;
}

.wordhunt-avatar {
  position: absolute;
  display: block;
  width: 34px;
  height: 34px;
  object-fit: cover;
  object-position: center;
  border-radius: 4px;
  z-index: 2;
}

.wordhunt-coord {
  position: absolute;
  color: #f2f2fb;
  font-weight: 800;
  text-align: center;
  pointer-events: none;
}

.wordhunt-col-label { font-size: 14px; }
.wordhunt-row-label { font-size: 16px; }
```

Le etichette devono essere posizionate **senza occupare una delle 300 caselle**. Per la replica utilizzare `x = 24 + col * 36`, `y = 45 + row * 36` e verificare visivamente gli offset delle etichette, che sono meno certi dei quadrati. Il colore delle parole viene assegnato come stile di una **tessera completa**, non al solo carattere `span`.

### 5.3 Ridimensionamento per OBS, Twitch, YouTube e TikTok

Il design interno rimane sempre in **coordinate di riferimento 570 × 769**. La superficie esterna sceglie un fattore di scala unico:

```ts
const scale = Math.min(availableWidth / 570, availableHeight / 769);
// Applicare transform: scale(scale) con transform-origin: top left.
// Il wrapper occupa 570*scale per 769*scale e viene centrato.
```

**Per 1920 × 1080:** collocare il tabellone verticalmente, lasciando spazio laterale per webcam, classifica o chat, **fuori dal tabellone**.  
**Per 1080 × 1920:** ingrandirlo fino alla larghezza utile e dedicare le zone non occupate a titolo, timer e classifica.  
**Per 570 × 769:** ottenere un frame pressoché coincidente con la reference.  
**Per monitor piccoli:** se uno scaling troppo basso danneggia la lettura, offrire una vista pannellizzata o consentire uno zoom del giocatore, ma **non** alterare il formato di riferimento dell'overlay ufficiale.

**Non** applicare `scaleX` e `scaleY` differenti. **Non** sostituire le tessere quadrate con rettangoli responsivi. **Non** disegnare gli avatar al di fuori delle coordinate del modello.

### 5.4 Modalità grafiche

| Modalità | Utilizzo | Regole visive |
|---|---|---|
| `reference_exact` | Test e layout identico | Solo griglia, coordinate, parole colorate, avatar; senza animazioni |
| `live_clean` | Overlay OBS | Stessa griglia; animazione breve su nuova parola; HUD esterno |
| `player_browser` | Browser interattivo | Stessa griglia; tooltip, zoom e focus accessibile |
| `admin_preview` | Console streamer | Stessa griglia con controlli separati, debug percorsi e claim |

In nessuna modalità i bottoni di admin o gli elementi di chat devono coprire il tabellone.

### 5.5 Animazioni facoltative, non invasive

Quando arriva un claim valido:

1. Transizione di colore delle caselle della parola in **120–220 ms**.
2. Comparsa dell'avatar in **120–200 ms**, senza spostamento delle caselle.
3. Eventuale notifica testuale «utente ha trovato PENSIERO» in pannello esterno per **1,5–3 s**.
4. Nessun flash stroboscopico, nessun rimbalzo che esca dalla tessera, nessun suono troppo forte.
5. Rispetto di `prefers-reduced-motion`; disattivazione completa in `reference_exact`.

I parametri temporali sono indicazioni progettuali, **non** caratteristiche visibili nella fotografia.

---

## 6. Generazione e validazione del tabellone

### 6.1 Input del generatore

```ts
type BoardConfig = {
  rows: 20;
  cols: 15;
  targetCount: number;
  minWordLength: number;
  maxWordLength: number;
  directions: Array<'RIGHT'|'DOWN'|'LEFT'|'UP'|
                    'DOWN_RIGHT'|'DOWN_LEFT'|'UP_RIGHT'|'UP_LEFT'>;
  allowIntersections: false;
  avatarAnchorRequired: true;
  dictionaryVersion: string;
  seed: string;
};
```

La modalità reference usa una **fixture statica**; una partita nuova usa un seed riproducibile. Il dizionario deve contenere parole italiane normali, controllate lessicalmente, senza dipendere da un elenco di parole casuali privo di revisione.

### 6.2 Processo di generazione proposto

1. Caricare un catalogo di parole candidate con testo canonico, lunghezza, frequenza, tema e difficoltà.
2. Filtrare duplicati, termini offensivi indesiderati, abbreviazioni, forme errate, termini eccessivamente rari e parole incompatibili con i limiti.
3. Selezionare i target con varietà di lunghezze e significati. Per la prima versione: **8 parole**, preferibilmente 5–10 lettere.
4. Ordinare temporaneamente per difficoltà di collocazione (di norma le più lunghe per prime).
5. Per ogni target, esplorare le posizioni compatibili con le direzioni permesse.
6. Verificare che il percorso non collida con altre parole o altri anchor.
7. Calcolare **entrambi gli anchor candidati** (prima/dopo) e riservarne **uno** valido.
8. Se non esiste un anchor valido, provare un'altra posizione; se esaurite le posizioni, eseguire backtracking con limite di lavoro.
9. Una volta posizionati tutti i target e tutti gli anchor, riempire le altre celle con lettere pesate per la lingua italiana. Gli anchor ricevono filler in memoria, ma restano riservati e non entrano in alcun target.
10. Eseguire audit automatico: tutte le parole si leggono lungo il percorso dichiarato; gli anchor sono unici e adiacenti; nessun obiettivo interseca anchor; nessun obiettivo ricorre in una seconda posizione non voluta.
11. Calcolare checksum del tabellone/seed/versione dizionario e salvare la partita.
12. Solo se **tutti** i controlli sono superati, pubblicare la griglia ai client.

### 6.3 Pseudocodice del posizionamento

```text
function GENERATE(targets, seed):
    rng = SeededRandom(seed)
    board = empty 20 x 15
    occupiedWords = empty set
    reservedAvatars = empty set

    for word in targets sorted by constrained-first order:
        candidatePlacements = shuffled legal paths of word
        placed = false
        for path in candidatePlacements:
            if path overlaps occupiedWords: continue
            if path touches reservedAvatars: continue

            anchors = [one cell before start, one cell after end]
            anchors = keep in-bounds cells not on words or avatar slots
            anchors = keep anchors not inside path

            if anchors is empty: continue
            choose preferred anchor, scoring future free space
            reserve word path and anchor
            placed = true
            break

        if not placed:
            BACKTRACK or RESTART_WITH_NEW_SEED

    fill remaining cells with letters, including reserved avatar cells
    assert all invariants
    return immutable board + hidden targets + hidden avatar slots
```

**Nota:** i `target` e gli `avatar slot` sono segreti del server finché la singola parola non viene scoperta. La risposta di rete per gli spettatori non deve consegnare l'elenco completo dei target, né la loro posizione, né gli anchor dei target non trovati; altrimenti la soluzione è recuperabile dagli strumenti sviluppatore del browser.

### 6.4 Verifica della difficoltà e falsi positivi

- Una matrice casuale può formare parole italiane aggiuntive; queste **non sono automaticamente obiettivi**.
- Il generatore deve almeno rilevare se un **target** compare in più posizioni, perché renderebbe ambigua la visualizzazione del percorso.
- Le parole target devono essere normalizzate e uniche **per round**.
- Preferire distribuzione di lunghezze equilibrata; evitare che tutti i target si concentrino sul bordo o in una sola direzione.
- La difficoltà effettiva va misurata: tempo medio alla prima scoperta, % target trovati, parole mai scoperte, numero di partecipanti attivi, frequenza dei falsi tentativi.
- Se il backtracking supera un budget fissato, **fallire la generazione in modo controllato** e ritentare con nuovo seed, senza pubblicare uno schema incompleto.

### 6.5 Distribuzione dei colori

Per la fixture, mantenere esattamente le otto associazioni della sezione 2.3. Per board generati, conservare una palette ordinata come quella della reference; all'acquisizione assegnare il prossimo colore libero (`colorIndex` determinato dallo stato del round) e **persisterlo**. Poiché verde e verde chiaro sono simili, il sistema dovrebbe controllare la vicinanza di due parole già colorate; se rischiano confusione, scegliere un colore più distinguibile tra quelli disponibili. La palette non identifica il vincitore.

**Regola consigliata:** colorare in ordine delle parole acquisite, non in ordine alfabetico del target, salvo la fixture screenshot che ha colori già prefissati.

---

## 7. Bot chat: normalizzazione e determinazione del primo

### 7.1 Contratto dell'adapter di piattaforma

Ogni adapter (Twitch, YouTube, TikTok o chat interna) deve produrre **lo stesso formato**, indipendentemente dall'API originale:

```ts
type IncomingChatMessage = {
  platform: 'twitch' | 'youtube' | 'tiktok' | 'local';
  platformMessageId: string;       // identità del messaggio, se esposta
  platformUserId: string;          // stabile all'interno della piattaforma
  displayName: string;
  avatarUrl?: string | null;
  text: string;
  providerTimestampMs?: number;    // se documentato e attendibile
  receivedAtMs: number;           // acquisito dal backend al primo ingresso
  receiveSequence: number;        // contatore monotono assegnato all'ingest
};
```

**Non** identificare un utente dal solo nickname: nickname omonimi o modificati non devono fondere i punteggi di spettatori diversi. La chiave logica è `(platform, platformUserId)`, salvo collegamento volontario verificato fra account.

La disponibilità di messaggi, timestamp e avatar dipende dalle API e dalle autorizzazioni effettivamente concesse da ogni piattaforma. Non dare per scontato che l'accesso live a TikTok o ai profili sia sempre disponibile tramite API ufficiali; realizzare l'adapter sulla base dei permessi e dei termini applicabili.

### 7.2 Normalizzazione rigorosa

```ts
function normalizeGuess(input: string): string | null {
  const s = input
    .normalize('NFC')
    .trim()
    .toLocaleUpperCase('it-IT')
    .replace(/^[\s.,!?;:«»"'()\[\]]+|[\s.,!?;:«»"'()\[\]]+$/g, '')
    .replace(/\s+/g, ' ');

  if (!/^[A-ZÀ-ÖØ-Ý]+$/u.test(s)) return null;
  if (s.length < 2 || s.length > 32) return null;
  return s;
}
```

I target di gioco vanno normalizzati con **la medesima funzione o una funzione canonica perfettamente compatibile**; verificare il trattamento delle lettere accentate. Non rimuovere automaticamente ogni accento, non usare stemming e non accettare plurali/singolari alternativi a meno che il target dichiari esplicitamente `acceptedForms`. Per la fixture di esempio tutte le parole sono maiuscole non accentate.

### 7.3 Determinazione del vincitore: regola precisa

La promessa «vince il primo» deve essere tecnicamente precisa:

- **Fonte autorevole:** il backend riceve gli eventi, non l'overlay né lo streamer.
- **Ordine predefinito:** `receivedAtMs` e, in caso di parità, `receiveSequence`, entrambi assegnati alla prima acquisizione del messaggio.
- **Messaggi duplicati:** stesso `(platform, platformMessageId)` elaborato una sola volta.
- **Connessioni multiple:** mantenere un unico ordinatore logico per round; se più processi ricevono eventi, assegnare l'ordine all'ingest centrale prima di validare.
- **Riordino (opzionale):** buffer breve di 200–500 ms per gestire messaggi che attraversano code interne in modo differente; la regola va definita prima del round e non modificata in corsa.
- **Timestamp della piattaforma:** conservarlo per audit, ma non usarlo per confronti fra piattaforme se non si è verificata l'equivalenza delle loro semantiche.
- **Parità effettive:** risolte dal numero sequenziale server; nessun sorteggio o scelta manuale.

**Limite di correttezza:** il bot può stabilire **la prima risposta ricevuta secondo il proprio ordinamento verificabile**. Non può garantire che corrisponda al primo utente che abbia premuto «Invia» nel mondo reale, perché rete e piattaforme introducono ritardi diversi. Questa distinzione va descritta nelle regole pubbliche.

### 7.4 Algoritmo di acquisizione idempotente

```text
ON_CHAT_MESSAGE(message):
    if message already processed: return
    if current round is not ACTIVE: ignore
    if sender is blocked or rate-limited: ignore
    guess = normalizeGuess(message.text)
    if guess is invalid: ignore

    target = find target with canonicalText == guess in current round
    if no target: store non-winning guess if enabled; return

    persist guess idempotently
    atomically claim target if unclaimed:
        INSERT claim(target_id, participant_id, message_id, receiveSequence)
        ONLY IF target has no claim

    if insertion succeeds:
        assign color and winner avatar identity
        append WORD_CLAIMED event in persistent ordered log
        publish event to all overlays/admin clients
        increment score in the same transaction
    else:
        do not recolor, do not overwrite avatar, do not rescore
```

L'acquisizione deve essere **atomica** in DB, non un controllo JavaScript «se trovato=false, allora trovato=true» senza lock. Due messaggi simultanei non devono generare due vincitori.

### 7.5 Gestione degli errori e dello spam

- Messaggi molto lunghi, URL e payload non testuali non passano come guess validi.
- `rate limit` per piattaforma/utente: per esempio fino a 3 guess ogni 2 s, con burst limitato; parametri configurabili.
- Non penalizzare inutilmente refusi: in default, un guess errato non dà punti ma non sottrae punti.
- Ignorare echo del bot, messaggi di sistema e messaggi eliminati prima dell'elaborazione quando il provider lo segnala.
- Se due messaggi identici sono ritrasmessi dopo riconnessione, elaborarli una sola volta.
- Dare ai moderatori strumenti anti-abuso, ma **nessun diritto implicito di prevalere negli ex aequo**.
- Regali, abbonamenti, donazioni e ruoli di canale **non devono anticipare** la posizione in coda né alterare la validazione della parola.

---

## 8. Stati del round, scoring e classifica

### 8.1 Macchina a stati

```text
CREATED
   |
   v
READY ----(start)----> COUNTDOWN ----> ACTIVE
   ^                                       |
   |                                       | all found / timeout / host stop
   |                                       v
   +-----------(new round)------------- FINISHED
                                           |
                                           v
                                        ARCHIVED
```

`ACTIVE` è l'unico stato che accetta nuove rivendicazioni. La scadenza usa **orologio server**: il browser visualizza il tempo rimanente stimato, ma non decide se un messaggio sia entro il limite. Dopo `FINISHED` non assegnare parole ulteriori, neppure se i messaggi arrivano in ritardo.

### 8.2 Punteggio raccomandato, esplicitamente opzionale

Lo screenshot non mostra valori; perciò il punteggio **non fa parte della replica visiva**. Se si desidera una classifica:

```text
punti_parola = 10 + 2 × max(0, lunghezza_parola − 4)
```

Esempi: STAGNO (6) = 14, CORONA (6) = 14, OBBLIGO (7) = 16, PENSIERO (8) = 18, DIRETTORE (9) = 20. La formula rende le parole lunghe più premianti senza moltiplicatori difficili da spiegare. Variazioni ammissibili: punteggio fisso, bonus difficoltà, modalità senza classifica. **Il vincitore della parola non cambia** con la modalità di punteggio.

### 8.3 Progressione e statistiche

Salvare per ogni giocatore: parole trovate, round partecipati, punti per round e cumulati, lunghezza media dei target indovinati e tempo di risposta dal via. La classifica si aggiorna automaticamente dopo ogni `WORD_CLAIMED`. La vista screenshot deve restare **senza classifica interna**: graduatoria e statistiche appartengono all'HUD esterno o alla scena dei risultati.

### 8.4 Interazioni dello streamer

Lo streamer può: creare un round, caricare la fixture di riferimento, selezionare tema/difficoltà, avviare/fermare, saltare un round malformato, mostrare risposte **solo a fine round**, consultare audit, correggere un errore in modo esplicito con log. Non può assegnare «primo arrivato» con un pulsante manuale nel flusso ordinario.

---

## 9. Modello dati e persistenza

### 9.1 Entità canoniche

| Entità | Campi indispensabili | Invariante |
|---|---|---|
| `participants` | ID interno, piattaforma, user ID piattaforma, nome visualizzato, URL avatar | Identità stabile, non basata su nickname |
| `rounds` | ID, stato, seed, dimensioni, config, start/end | Stato autorevole |
| `round_cells` | round, riga, colonna, lettera, proprietà speciale | 300 coordinate univoche per 20×15 |
| `round_targets` | ID, round, parola, percorso, anchor, colore (quando trovata) | Target e anchor validati |
| `chat_guesses` | ID messaggio, utente, parola normalizzata, tempo, sequenza, esito | Deduplicazione e audit |
| `claims` | target ID, partecipante, guess vincente, sequenza, timestamp | **Max 1 claim per target** |
| `round_events` | sequenza evento, tipo, payload, timestamp | Replay deterministico |
| `scores` | round/utente, punti, parole | Coerente con claims |

### 9.2 Esempio schema SQL (SQLite 3)

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE participants (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  platform_user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  UNIQUE(platform, platform_user_id)
);

CREATE TABLE rounds (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN
      ('CREATED', 'READY', 'COUNTDOWN', 'ACTIVE', 'FINISHED', 'ARCHIVED')),
  rows INTEGER NOT NULL CHECK(rows > 0),
  cols INTEGER NOT NULL CHECK(cols > 0),
  seed TEXT NOT NULL,
  config_json TEXT NOT NULL,
  started_at_ms INTEGER,
  ended_at_ms INTEGER
);

CREATE TABLE round_targets (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL REFERENCES rounds(id),
  word TEXT NOT NULL,
  word_norm TEXT NOT NULL,
  start_row INTEGER NOT NULL,
  start_col INTEGER NOT NULL,
  end_row INTEGER NOT NULL,
  end_col INTEGER NOT NULL,
  anchor_row INTEGER NOT NULL,
  anchor_col INTEGER NOT NULL,
  avatar_side TEXT NOT NULL CHECK(avatar_side IN ('before','after')),
  color_hex TEXT,
  UNIQUE(round_id, word_norm),
  UNIQUE(round_id, anchor_row, anchor_col)
);

CREATE TABLE chat_guesses (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL REFERENCES rounds(id),
  participant_id TEXT NOT NULL REFERENCES participants(id),
  platform TEXT NOT NULL,
  platform_message_id TEXT NOT NULL,
  guess_norm TEXT,
  received_at_ms INTEGER NOT NULL,
  receive_sequence INTEGER NOT NULL,
  outcome TEXT NOT NULL,
  UNIQUE(platform, platform_message_id),
  UNIQUE(round_id, receive_sequence)
);

CREATE TABLE claims (
  target_id TEXT PRIMARY KEY REFERENCES round_targets(id),
  participant_id TEXT NOT NULL REFERENCES participants(id),
  winning_guess_id TEXT NOT NULL UNIQUE REFERENCES chat_guesses(id),
  claimed_at_ms INTEGER NOT NULL,
  receive_sequence INTEGER NOT NULL
);

CREATE TABLE round_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id TEXT NOT NULL REFERENCES rounds(id),
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL
);

CREATE INDEX idx_targets_round ON round_targets(round_id, word_norm);
CREATE INDEX idx_guesses_round_seq ON chat_guesses(round_id, receive_sequence);
CREATE INDEX idx_claims_participant ON claims(participant_id);
CREATE INDEX idx_events_round_seq ON round_events(round_id, seq);
```

Le 300 celle possono essere materializzate in tabella `round_cells` oppure memorizzate come matrice JSON **immutabile con checksum** nel round. Preferire un unico formato autorevole e definire conversioni versionate. Le celle segnaposto-avatar della reference non devono essere trattate come target mancanti.

### 9.3 Transazione di claim

Usare una transazione SQL coerente (`BEGIN IMMEDIATE` in SQLite per serializzare gli scrittori concorrenti) e un inserimento protetto dalla chiave primaria di `claims.target_id`:

```sql
BEGIN IMMEDIATE;

-- 1) Registrare il guess idempotentemente.
-- 2) Verificare che il round sia ACTIVE e il target sia ancora disponibile.
-- 3) Il PRIMARY KEY su target_id rende impossibile un secondo vincitore.

INSERT INTO claims
  (target_id, participant_id, winning_guess_id,
   claimed_at_ms, receive_sequence)
VALUES (?, ?, ?, ?, ?)
ON CONFLICT(target_id) DO NOTHING;

-- 4) Solo se changes() = 1, assegnare colore/punteggio e inserire
--    l'evento WORD_CLAIMED nella stessa transazione.

COMMIT;
```

**Importante:** `INSERT ... DO NOTHING` impedisce doppi vincitori, ma **non** corregge da solo un elaboratore che processa messaggi fuori ordine. Prima di tentare il claim, la coda deve già consegnare i messaggi nel **criterio temporale scelto**. Le transazioni proteggono l'atomicità; l'ordinatore protegge la priorità.

### 9.4 Ripristino crash

Persistenza dello stato prima della notifica websocket. In caso di crash tra commit e broadcast, al reconnect il client riceve snapshot completo o riproduce `round_events` dal cursore noto. Il browser non può «perdere» un vincitore solo perché ha perso un pacchetto.

---

## 10. Protocollo client/server e aggiornamenti live

### 10.1 API minime

| Metodo | Endpoint proposto | Uso | Autorizzazione |
|---|---|---|---|
| `POST` | `/api/word-hunt/rounds` | Creazione round | Host/admin |
| `POST` | `/api/word-hunt/rounds/:id/start` | Avvio | Host/admin |
| `POST` | `/api/word-hunt/rounds/:id/finish` | Chiusura | Host/admin |
| `GET` | `/api/word-hunt/rounds/:id/public-state` | Snapshot pubblico **senza soluzioni nascoste** | Viewer |
| `GET` | `/api/word-hunt/rounds/:id/admin-state` | Diagnostica completa | Admin |
| `GET` | `/api/word-hunt/rounds/:id/results` | Risultati, a fine round | Viewer |
| `GET` | `/api/word-hunt/rounds/:id/audit` | Timeline messaggi/claim | Admin |
| `WS` | `/ws/word-hunt/:id` | Eventi live | Viewer con token sessione o URL overlay protetto |

Nell'ambiente Zerocade o in qualsiasi altra applicazione esistente, le rotte sono **indicative**: inserirle nell'architettura reale dopo aver verificato la struttura del repository, senza assumere che esistano già.

### 10.2 Eventi WebSocket

Eventi pubblici suggeriti:

```json
{
  "type": "WORD_CLAIMED",
  "eventSeq": 103,
  "roundId": "r-20261117-001",
  "targetId": "target-3",
  "word": "OBBLIGO",
  "cells": ["C7", "C8", "C9", "C10", "C11", "C12", "C13"],
  "color": "#22C55E",
  "avatarCell": "C14",
  "winner": {
    "participantId": "platform:user:123",
    "displayName": "Spettatore",
    "avatarUrl": "/assets/avatars/123.png"
  },
  "scoreAwarded": 16,
  "serverTimeMs": 1794918000000
}
```

Ulteriori eventi: `ROUND_CREATED`, `ROUND_STARTED`, `TIMER_SYNC`, `ROUND_FINISHED`, `SCORE_UPDATED`, `ROUND_RESET`, `ADMIN_CORRECTION`. Ogni messaggio deve avere **`eventSeq` monotono**; ignorare sequenze già applicate, rilevare salti e richiedere resync prima di mostrare uno stato potenzialmente incoerente.

### 10.3 Stato pubblico e anti-spoiler

Il payload `public-state` prima di una scoperta deve contenere:

- Matrice **delle lettere visibili** e intestazioni.
- Numero di parole totali e numero già trovate, se richiesto dall'HUD.
- Le **sole** parole già scoperte con percorso/colore/avatar del vincitore.
- Stato del round e orario di chiusura.

**Non** deve contenere l'elenco dei target non trovati, le loro coordinate o gli anchor segreti: un visitatore potrebbe leggerli direttamente nella rete e rovinare il gioco agli altri.

---

## 11. Interfacce previste e gestione stream

### 11.1 Overlay spettatori / OBS

La schermata principale mostra **esclusivamente il tabellone** nel frame di riferimento. Un contenitore esterno, non incluso nello screenshot, può mostrare: logo del gioco, numero di parole trovate, timer, ultime conquiste e classifica. Il tabellone deve poter essere usato come **browser source OBS** con URL dedicato e sfondo opaco in modalità reference; la trasparenza esterna è facoltativa.

### 11.2 Pannello amministratore

Opzioni minime: tipo di round (`fixture`/`generated`), livello, seed, durata, pulsanti start/finish, anteprima stessa griglia, elenco parole segrete (solo admin), stato connessione chat, ultimi eventi, errori, statistiche, recovery, reset e comando per correggere un claim con motivazione. I bottoni amministrativi non devono comparire nella vista spettatore.

### 11.3 Integrazione piattaforme

- **Twitch:** adapter chat in conformità alle API/autorizzazioni correnti e all'identità dell'utente.
- **YouTube:** adapter per la chat della live e sincronizzazione dell'identità/autorizzazioni.
- **TikTok:** adapter solo se è disponibile una modalità di accesso sostenibile e consentita per l'account e la piattaforma; le limitazioni devono essere dichiarate nella schermata di setup.
- **Locale/test:** simulatore di chat, timestamp e avatar per test deterministici senza stream attivo.

L'obiettivo è un dominio di gioco **indipendente dalle piattaforme**: gli adapter forniscono messaggi, il core determina risultati, l'overlay visualizza gli eventi.

### 11.4 Identità e privacy

Raccogliere solo ID tecnico, nome pubblico e avatar necessari al gioco. Evitare cache illimitate delle immagini profilo, rispettare eventuali rimozioni/consensi e documentare il trattamento nel contesto della live. I profili fittizi della fixture servono **solo per sviluppo/test**: per una pubblicazione usare asset propri/autorizzati oppure avatar recuperati legittimamente dai provider.

---

## 12. Organizzazione del codice sorgente

Struttura **proposta** per un progetto TypeScript/Node + frontend web; adattarla al repository reale:

```text
word-hunt/
├── domain/
│   ├── coordinates.ts              # A1 <-> row/col zero-based
│   ├── normalize-guess.ts           # Parser italiano
│   ├── board-generator.ts           # Target + anchor + filler
│   ├── board-validator.ts           # Invarianti, collisioni
│   ├── word-claims.ts               # Assegnazione atomica
│   ├── scoring.ts                   # Punti opzionali
│   └── types.ts                     # Contratti condivisi
├── server/
│   ├── round-controller.ts          # Macchina a stati
│   ├── chat-ingest.ts               # Tempo e sequenza
│   ├── claim-queue.ts               # Ordinamento deterministico
│   ├── routes.ts                    # REST
│   ├── websocket.ts                 # Broadcast + replay
│   └── repositories/
│       ├── rounds.ts
│       ├── targets.ts
│       ├── guesses.ts
│       └── claims.ts
├── adapters/
│   ├── twitch-chat.ts
│   ├── youtube-chat.ts
│   ├── tiktok-chat.ts
│   └── simulated-chat.ts
├── web/
│   ├── WordHuntBoard.tsx            # Rendering 20x15
│   ├── WordHuntTile.tsx             # Lettera e colore
│   ├── WordHuntAvatar.tsx           # Profilo vincitore
│   ├── WordHuntOverlay.tsx          # Scena OBS
│   ├── WordHuntAdmin.tsx            # Console admin
│   ├── reference-theme.css          # Pixel-match
│   └── useWordHuntState.ts          # Snapshot + WS
├── db/
│   └── migrations/
├── fixtures/
│   ├── word_hunt_fixture.json
│   └── word_hunt_riferimento.png
└── tests/
    ├── fixture-validation.test.ts
    ├── generator.test.ts
    ├── winner-race.test.ts
    ├── claim-replay.test.ts
    ├── render-reference.spec.ts
    └── accessibility.spec.ts
```

**Moduli separati:** il generatore non deve conoscere OBS; il bot chat non deve assegnare CSS; il frontend non deve conoscere le parole segrete; l'admin non deve bypassare transazioni/validazioni.

---

## 13. Test automatici e controlli di accettazione

### 13.1 Test obbligatori sulla fixture

1. Il file contiene **20 righe di 15 simboli** ciascuna (300 posizioni).
2. Gli otto percorsi corrispondono esattamente alle otto stringhe-obiettivo.
3. Le **otto posizioni `X` sono otto avatar**, nessuna è classificata come ostacolo.
4. Ogni avatar è direttamente adiacente a uno degli estremi della parola corrispondente.
5. Le due identità demo compaiono **quattro volte ciascuna**.
6. I colori degli otto target corrispondono a quelli della tabella §2.3.
7. Le caselle non trovate restano grigio scuro con lettere bianche.
8. Nessun avatar invade una delle celle colorate della propria parola o di altre parole.
9. Nessuna intestazione viene persa: numeri **1–15** e lettere **A–T**.
10. Nella vista `reference_exact`, a **570 × 769** la geometria rimane invariata.

### 13.2 Golden image e confronto visuale

Creare una pagina `/word-hunt/reference` che carica `word_hunt_fixture.json` **già con tutte e otto le parole claimed**, con mock degli avatar che riproducano i due asset della reference ove disponibili e autorizzati. Renderizzare a viewport esatto 570 × 769 e confrontare con `word_hunt_riferimento.png` tramite test visual regression.

**Attenzione:** se gli asset avatar originali non sono disponibili, escludere dal confronto pixel-perfect **soltanto** i rettangoli degli otto avatar e verificare per essi **dimensioni, coordinate, clipping e associazione**. Non alterare il risultato delle 292 altre posizioni per compensare il confronto. Tolleranze di antialiasing/font vanno documentate (browser, OS, devicePixelRatio, font incorporato/autorizzato), non nascoste dietro una soglia esagerata.

### 13.3 Test di concorrenza

- 100 utenti inviano `PENSIERO` quasi insieme → **un solo claim**, una sola attribuzione di punti, un solo avatar A1.
- Riordino artificiale degli arrivi → vince chi ha l'ordinamento server minimo, non chi termina prima la query al database.
- Duplicato dello stesso messaggio → nessun doppio punteggio/evento.
- Pubblicazione WS interrotta dopo commit → resync ripristina stesso vincitore.
- Secondo utente indovina dopo il primo → parola e profilo restano invariati.
- Scadenza timer simultanea all'ultimo messaggio → comportamento governato dalla regola server documentata; test del confine esatto.
- Nome utente modificato durante il round → identità e punteggi restano associati all'ID corretto.
- Immagine profilo non caricabile → compare fallback **nella stessa cella**.

### 13.4 Test del generatore

- 10.000 seed di prova senza eccezioni, anchor esterni ai target, collisioni o duplicazioni di parole.
- Validazione delle dimensioni 20×15, anche con parole della lunghezza massima.
- Casi di bordo: parola a colonna 1, parola a colonna 15, parola in prima/ultima riga, anchor disponibile su un solo lato.
- Se una parola è impossibile da collocare con avatar, il generatore **non deve** pubblicare un tabellone scorretto.
- Ogni seed + versione dizionario restituisce lo stesso output, qualora non cambino opzioni e implementazione del PRNG.

### 13.5 Sicurezza, accessibilità e performance

- Gestire username come testo, non HTML; proteggere da XSS nel rendering di nomi e notifiche.
- URL avatar con allowlist/proxy, timeout, dimensione massima e fallback.
- API amministrative protette con autenticazione e autorizzazione server.
- I target non ancora trovati non devono essere presenti negli eventi pubblici o nell'HTML/JS serializzato.
- Orologio server e sequenze immutabili; log per debugging delle contestazioni.
- Nessun `setState` che ridisegni inutilmente 300 celle a ogni carattere di chat: aggiornare solo lo stato derivato da eventi di claim.
- Font leggibili e contrasto adeguato; il nero sulle tessere colorate va verificato per ciascun colore; in caso di modalità accessibile usare alternative che **non** cambino l'estetica della modalità reference.
- In overlay a 60 FPS le animazioni non devono causare salti di layout o stall del thread principale.

---

## 14. Piano di implementazione raccomandato

### Fase 1 — Replica grafica statica (vincolante)

- Importare reference PNG e fixture JSON.
- Disegnare matrice 20×15, coordinate A–T / 1–15, lettere e otto colori.
- Disegnare gli otto avatar nelle posizioni esatte, distinguendo i due profili demo.
- Ottenere test golden image affidabile **prima** di aggiungere menu, timer e bot.

**Deliverable:** pagina `/reference` identica alla fotografia nella parte di tabellone.

### Fase 2 — Dominio del gioco

- Coordinate e percorsi immutabili, generatori seed-based e parser dei target.
- Selezione di anchor ante/post parola con collision check.
- Stato `READY`/`ACTIVE`/`FINISHED` e validazione dei target.

**Deliverable:** round avviabile e terminabile senza chat esterna.

### Fase 3 — Chat, primo vincitore e persistenza

- Adapter simulato → ingest temporale → parser → ordinatore → claim atomico.
- Salvataggio DB, punteggi e audit.
- WebSocket, snapshot pubblico e recupero dopo disconnessione.

**Deliverable:** test 100 risposte concorrenti → **un vincitore per parola**.

### Fase 4 — Stream integration

- Sorgente browser per OBS, configurazione widescreen e verticale.
- Adapter per piattaforme effettivamente accessibili, autorizzazioni e avatar.
- Pannello amministratore e gestione rate limit/errore connessione.

**Deliverable:** partita live utilizzabile senza intervento manuale nell'assegnazione delle parole.

### Fase 5 — Rifinitura e produzione

- Animazioni sobrie, statistiche, ripristino round, cache avatar, sicurezza, audit.
- Test end-to-end, benchmark di carico, correzione contrasto e visual regression multi-risoluzione.

**Deliverable:** release `v1.0` con `reference_exact` sempre disponibile come controllo regressioni.

---

## 15. Definition of Done: checklist finale

- [ ] 570 × 769 pixel in modalità reference, **20 × 15** tessere e intestazioni precise.
- [ ] 300 coordinate visualizzate correttamente; nessun tile fuori asse.
- [ ] Tutte e otto le parole del test sono negli esatti percorsi dello screenshot.
- [ ] Colori per parola e **testo nero** sopra le tessere trovate.
- [ ] Otto avatar associati alle parole negli esatti anchor della tabella.
- [ ] Icone rosse/nere riconosciute come **profili**, non come ostacoli.
- [ ] Avatar copre **solo** la propria casella adiacente e non le lettere della parola.
- [ ] Ripetizione dello stesso profilo possibile per più parole con colori differenti.
- [ ] Parole e anchor non si sovrappongono e rimangono stabili per tutto il round.
- [ ] Backend autorevole per validazione e ordinamento delle risposte.
- [ ] Un solo claim persistente per `(round, target)`, anche sotto concorrenza.
- [ ] Normalizzazione italiana, deduplicazione messaggi e rate limiting.
- [ ] Bot attribuisce autonomamente il vincitore, senza conferma manuale.
- [ ] Eventi WebSocket ordinati, snapshot pubblico e recupero dopo interruzione.
- [ ] Target non risolti e coordinate segrete non esposti ai client pubblici.
- [ ] Avatar mancanti gestiti con fallback.
- [ ] Overlay ridimensionato uniformemente per OBS 16:9 e video 9:16.
- [ ] HUD e controlli admin esterni al tabellone.
- [ ] Test di fixture, concorrenza, generazione, visual regression e sicurezza superati.

---

## 16. Esempio completo di un evento reale

**Situazione:** il round è attivo, `OBBLIGO` esiste da C7 a C13, non è ancora stato trovato. La piattaforma consegna il messaggio `obbligo` dello spettatore `user_photo`.

1. L'adapter attribuisce `receivedAtMs` e `receiveSequence` al messaggio.
2. `normalizeGuess('obbligo')` restituisce `OBBLIGO`.
3. Il backend trova il target non ancora claimed.
4. L'ordinatore garantisce che non esista un evento precedente valido ancora in attesa nell'ordine scelto.
5. Una transazione inserisce il claim; il database garantisce un solo vincitore.
6. Il target riceve colore `#22C55E`, viene registrato il percorso C7–C13 e associato il vincitore.
7. Il frontend colora di verde le sette tessere e ne rende nere le lettere.
8. In **C14** viene mostrato il profilo dello stesso spettatore.
9. Tutte le altre caselle, gli altri avatar e le coordinate restano **identici** al frame precedente.
10. Se un altro spettatore scrive `OBBLIGO`, il backend registra eventualmente il tentativo ma **non modifica** colore, avatar o punteggio del primo.

Risultato visivo desiderato:

```text
        C7   C8   C9   C10  C11  C12  C13  C14
        O    B    B    L    I    G    O   [avatar]
        └──────── verde #22C55E ─────────┘
```

L'immagine dello spettatore in C14 **è la firma visuale della parola**: è esattamente il comportamento che distingue questa implementazione da un tradizionale Word Search colorato.

---

## 17. Fonti della specifica e ambiti delle decisioni

**Osservato direttamente nello screenshot dell'utente:** dimensioni del frame, 20×15, etichette, 300 posizioni, otto parole evidenziate, colori di riferimento, due immagini profilo ripetute, otto posizioni adiacenti e assenza di HUD dentro il ritaglio. **Ricostruito e verificato tramite fixture:** contenuto visibile delle righe, coordinate delle otto parole, coordinate adiacenti degli avatar. **Proposto per l'implementazione (non deducibile dall'immagine):** generazione dinamica, connessione alla chat, ordine server, scoring, timer, database, API, pannello admin, animazioni e policy di moderazione.

**Validazione pronta all’uso:** eseguire `python validate_word_hunt_fixture.py` dopo aver estratto il pacchetto: il controllo verifica dimensioni, stringhe, percorsi, colori, anchor adiacenti e doppia identità dimostrativa.

**File da tenere assieme:**

- `Word_Hunt_Specifica_Tecnica_v1.0.md` — questo documento.
- `word_hunt_fixture.json` — griglia di test, mapping parole/colori/avatar, invarianti visive.
- `word_hunt_riferimento.png` — immagine originale da usare per visual regression.
- `validate_word_hunt_fixture.py` — validatore della fixture, senza dipendenze esterne.

**Principio architetturale finale:** la parola viene trovata **dalla chat**, il vincitore viene scelto **dal backend**, la parola viene mostrata **con il proprio colore** e il profilo del vincitore viene disegnato **nell'esatta casella adiacente**; la griglia deve continuare ad avere la stessa estetica dello screenshot.

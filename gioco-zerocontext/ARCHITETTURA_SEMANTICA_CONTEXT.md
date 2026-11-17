# Architettura Semantica e Gestione Vettoriale per Gioco Stile "Context"

Questo documento costituisce la specifica tecnica, matematica e lessicale definitiva per lo sviluppo di un motore di deduzione semantica (stile *Context* / *Semantle*). 

L'architettura gestisce un dizionario di **90.000 parole valide ammesse**, una rotazione ordinaria con pavimento $\text{Zipf} \ge 1.80$ (finestra target $[1.80, 2.50]$ con deroghe per il **Nuovo Vocabolario di Base (NVdB)** di fascia medio-alta e normalizzazione sulla **frequenza delle forme verbali attestate**), affiancata da una modalità a **Round Speciale ogni 9 partite** (con durata massima di **3 minuti** o **100 tentativi**) focalizzata sul livello **Zipf 1.9** ($1.85 \le \text{Zipf} \le 2.05$), rigorosamente **anti-monosettoriale** e anch'essa armonizzata con le eccezioni NVdB e le frequenze verbali.

---

## 1. Visione Generale e Pipeline dei Dati

Il motore separa nettamente la totalità delle parole inseribili dal giocatore (*Guess List*) dai sottoinsiemi curati delle soluzioni segrete (*Target Lists*).

```
+---------------------------------------------------------------------------------------------------------+
|                                    GUESS LIST GLOBALE (~90.000 parole)                                  |
|  - Spazio vettoriale compatto pre-calcolato: matrice float32 di forma (90000, d) con d in {256, 300}.   |
|  - Normalizzazione L2 obbligatoria: ogni riga ha norma unitaria (||w|| = 1.0).                          |
|  - Accetta forme flesse, verbi coniugati, plurali, neologismi e termini specialistici.                 |
+---------------------------------------------------------------------------------------------------------+
                                                     |
                         +---------------------------+---------------------------+
                         |                                                       |
         Filtro Round Ordinari                                   Filtro Round Speciali (Ogni 9 Round)
         - Pavimento Base: Zipf >= 1.80                          - Target: Zipf in [1.85, 2.05] (~1.9)
         - Finestra Standard: 1.80 <= Zipf <= 2.50               - Vincolo Tempo: max 180 s (3 minuti)
         - ECCEZIONE 1: NVdB Medio-Alta (AD e AU)                - Vincolo Tentativi: max 100 guess
         - ECCEZIONE 2: Verbi da Frequenze Attestate             - FILTRO ANTI-MONOSETTORIALE TASSATIVO
         - Densita media: D_100 >= 0.45                          - ECCEZIONE 1: NVdB AD/AU in range 1.9
         - Ponti Semantici: >= 10 (Zipf >= 4.0)                  - ECCEZIONE 2: Verbi da Freq. Attestate
                         |                                       - Densita media: D_100 >= 0.48
                         |                                       - Ponti Semantici: >= 15 (Zipf >= 3.8)
                         v                                                       v
+----------------------------------------------------+           +----------------------------------+
|               STANDARD SECRET POOL                 |           |            SPECIAL POOL          |
|            (~6.200 parole selezionate)             |           |       "SURVIVAL ZIPF 1.9"        |
|     Assegnate a: Round 1-8, 10-17, 19-26, ...      |           |    (~520 parole selezionate)     |
|             (Nessun limite di tempo)               |           |  Assegnate a: Round 9, 18, 27... |
+----------------------------------------------------+           +----------------------------------+
```

---

## 2. Selezione e Ottimizzazione dello Spazio Vettoriale

Per garantire risposte in tempo reale ($< 5\text{ ms}$) su 90.000 parole senza ricorrere a GPU a runtime, la scelta e l'ottimizzazione dell'embedding statico sono decisive.

### 2.1. Confronto Tecnologico

| Modello | Dimensioni ($d$) | Copertura 90k | Gestione OOV (Out-of-Vocabulary) | Comprensione Semantica | RAM (FP32) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **FastText (`cc.it.300.bin`)** | 300 | 100% | **Nativa:** Subword n-grams di caratteri | Buona (distribuzionale classica) | $\approx 108\text{ MB}$ |
| **Model2Vec (da `BGE-M3`)** | 256 – 512 | 100% | Ricostruita tramite tokenizzatore | **Ottima** (distillata da Transformer) | $\approx 92 - 184\text{ MB}$ |
| **ConceptNet Numberbatch** | 300 | $\approx 50\%$ | **Assente** (richiede fallback a FastText) | **Eccellente** (relazioni logiche umane) | $\approx 108\text{ MB}$ |
| **Transformer denso (`BGE-M3`)** | 1024 | 100% | Sub-token Transformer | Molto alta (ma pesante su CPU) | $\approx 368\text{ MB}$ |

### 2.2. Pipeline Consigliata: FastText + Retrofitting

1. **Inizializzazione Subword FastText:** Scomposizione in n-grammi di caratteri ($3 \le n \le 6$) per coprire l'intero vocabolario senza buchi:
   $$\vec{w}_{\text{init}} = \sum_{g \in \mathcal{G}_w} \vec{z}_g$$

2. **Retrofitting Semantico (Algoritmo di Faruqui):** Allontana gli antonimi (*bene* / *male*, *caldo* / *freddo*) e avvicina i sinonimi sfruttando *MultiWordNet* e i grafi lessicali italiani:
   $$\min_{Q} \left( \sum_{i=1}^N \alpha_i \Vert \vec{q}_i - \vec{w}_i \Vert_2^2 + \sum_{(i,j) \in E_{\text{sinonimi}}} \beta_{ij} \Vert \vec{q}_i - \vec{q}_j \Vert_2^2 - \sum_{(i,k) \in E_{\text{contrari}}} \gamma_{ik} \Vert \vec{q}_i - \vec{q}_k \Vert_2^2 \right)$$

3. **Lookup Table Normalizzata Contigua:** Tutti i 90.000 vettori sono archiviati con norma unitaria $L_2 = 1.0$. Il calcolo delle similarità sull'intero dizionario si riduce a un'unica moltiplicazione matrice-vettore:
   $$\vec{S} = M_{90000 \times 300} \cdot \vec{w}_{\text{target}}$$

---

## 3. Modelli Matematici e Criteri di Selezione Lessicale

### 3.1. Frequenza Zipf

La scala Zipf misura la frequenza logaritmica normalizzata per miliardo di token:

$$\text{Zipf} = \log_{10}(\text{Frequenza per miliardo}) + 3$$

* **Fascia Ordinaria:** $\text{Zipf} \ge 1.80$ (con finestra calibrata $[1.80, 2.50]$).
  *(Modifica del 16 novembre 2026: prima $[2.00, 2.40]$. La finestra include ora le parole con $1.80 \le \text{Zipf} \le 2.50$.)*
* **Fascia Speciale:** $1.85 \le \text{Zipf} \le 2.05$ (centrata su $\approx 1.90$, pari a circa 80 occorrenze per miliardo di parole).

### 3.2. Regole di Deroga NVdB (Nuovo Vocabolario di Base)

Il NVdB di Tullio De Mauro suddivide il vocabolario comune in: **Fondamentale** ($\text{FO}$), **Alto Uso** ($\text{AU}$) e **Alta Disponibilità** ($\text{AD}$).

#### Nel Pool Ordinario ($\text{Zipf} \ge 1.80$):
* **Promozione Prioritaria $\text{AD}$:** Se $w \in \text{NVdB}_{\text{AD}}$ e $\text{Zipf}(w) < 1.80$ (*scolapasta, cavatappi, pinzetta*), la parola viene **promossa in deroga**: la notorietà cognitiva dell'oggetto comune prevale sulla bassa frequenza statistica nei testi scritti.
* **Ammissione Estesa $\text{AU}$:** Se $w \in \text{NVdB}_{\text{AU}}$ e $2.50 < \text{Zipf}(w) \le 3.20$ con categoria grammaticale di sostantivo, è ammesso in deroga (*cardine, perno, cerniera*).
* **Esclusione Tassativa $\text{FO}$:** Le parole del vocabolario fondamentale ($\text{Zipf} \ge 4.5$) sono escluse dalle parole segrete per non banalizzare la scalata.

#### Nel Round Speciale ($\text{Zipf} \approx 1.90$):
* **Inclusione Qualificata $\text{AD}$:** Lemmi di Alta Disponibilità la cui frequenza scritta ricade nella finestra $1.85 \le \text{Zipf} \le 2.05$ e superano il filtro anti-monosettoriale hanno priorità di ammissione (oggetti o manufatti tradizionali).
* **Deroga $\text{AU}$ Espressivo:** Termini di Alto Uso con sfumature letterarie o secondarie in linea con la fascia 1.9 sono ammessi.
* **Esclusione $\text{FO}$:** Mantenuta tassativamente.

### 3.3. Frequenza Aggregata delle Forme Verbali Attestate

I verbi italiani presentano decine di flessioni coniugate. La frequenza superficiale del solo infinito ($v_{\text{inf}}$) sottostima enormemente verbi molto usati nel parlato e nello scritto attraverso le loro forme attestate.

Sia $\mathcal{F}_{\text{att}}(v)$ l'insieme di tutte le forme flesse del verbo $v$ convalidate nei corpora morfologici (*Morph-it!*, *CoLFIS*):

$$F_{\text{att}}(v) = \sum_{f \in \mathcal{F}_{\text{att}}(v)} 10^{\text{Zipf}(f) - 3}$$

$$\text{Zipf}_{\text{att}}(v) = \log_{10}(F_{\text{att}}(v)) + 3$$

* **Nei Round Ordinari:** Un verbo è ammesso se $\text{Zipf}_{\text{att}}(v) \ge 1.80$, anche se il solo lemma all'infinito riporta $\text{Zipf} < 1.80$.
* **Nel Round Speciale:** Un verbo è ammesso come target speciale se la frequenza aggregata attestata ricade nel range:
  $$1.85 \le \text{Zipf}_{\text{att}}(v) \le 2.05$$
  Ciò garantisce che il verbo sia realmente radicato nella memoria linguistica del parlante e non un fantasma testuale. La soluzione da digitare è l'**infinito presente**.

### 3.4. Filtro Tassativo Anti-Monosettoriale (Round Speciale)

A $\text{Zipf} \approx 1.90$, il rischio più grave è la presenza di tecnicismi ciechi (chimica organica, anatomia patologica, micro-gerghi legali). Il motore applica un triplo sbarramento:

1. **Blacklist dei Suffissi Specialistici:**
   $$\mathcal{B}_{\text{suf}} = \{\text{-ite}, \text{-osi}, \text{-asi}, \text{-ato}, \text{-uro}, \text{-morfismo}, \text{-ectomia}, \text{-terapia}, \text{-metria}, \text{-scopia}, \text{-fagia}, \text{-logia}\}$$
   Qualsiasi parola che termini con questi suffissi è scartata a priori dal pool speciale.

2. **Accreditamento dei Registri Espressivi:** Sono ammessi esclusivamente termini appartenenti ai domini:
   * *Carattere, morale e comportamento:* vizi, virtù, atteggiamenti interpersonali (*pusillanime, tracotanza, solerzia*).
   * *Dinamiche emotive e stati d'animo:* moti interiori e psicologici (*inedia, marasma, sopire*).
   * *Estetica, tempo e descrizioni evocative:* mutamento temporale, fragilità, atmosfera (*vetusto, caduco, fatuo*).
   * *Manufatti e consistenza materica:* manufatti d'arte, oggetti non industriali (*chincaglieria, farragine, catafalco*).

3. **Densità Semantica Rinforzata e Ponti Semantici:**
   $$D_{100}(w) = \frac{1}{100} \sum_{v \in \mathcal{N}_{100}(w)} \cos(\vec{w}, \vec{v}) \ge 0.48$$
   $$\mathcal{P}_{\text{spec}}(w) = \{ v \in \mathcal{N}_{100}(w) \mid \text{Zipf}(v) \ge 3.8 \} \quad \text{con} \quad \vert\mathcal{P}_{\text{spec}}(w)\vert \ge 15$$

---

## 4. Catalogo Lessicale Comparativo

### 4.1. Round Ordinari: Esempi con $\text{Zipf} \ge 1.80$ (con Deroghe NVdB e Verbi)

| Categoria | Lemma | Zipf di Calcolo | Regola / Eccezione | Ponti Semantici Comuni ($\text{Zipf} \ge 4.0$) |
| :--- | :--- | :--- | :--- | :--- |
| **NVdB Alta Disponibilità** | **Scolapasta** | $\text{Zipf}_{\text{corpus}} \approx 1.88$ | Standard $\text{AD}$ ($1.80 \le \text{Zipf} \le 2.50$; la deroga $\text{AD}$ vale sotto $1.80$) | *pasta, cucina, acqua, lavello, pentola* |
| **NVdB Alta Disponibilità** | **Cavatappi** | $\text{Zipf}_{\text{corpus}} \approx 1.95$ | Standard $\text{AD}$ ($1.80 \le \text{Zipf} \le 2.50$; la deroga $\text{AD}$ vale sotto $1.80$) | *vino, bottiglia, tappo, aprire, metallo* |
| **NVdB Alta Disponibilità** | **Imbuto** | $\approx 2.32$ | Standard $\text{AD}$ ($1.80 \le \text{Zipf} \le 2.50$) | *bottiglia, versare, plastica, liquido, filtro* |
| **NVdB Alto Uso (Deroga)** | **Cardine** | $\approx 2.85$ | **Deroga $\text{AU}$** (Sostantivo concreto $\le 3.20$) | *porta, ferro, perno, chiudere, rotazione* |
| **Sostantivo Concreto** | **Alambicco** | $\approx 2.38$ | Standard ordinario ($1.80 \le \text{Zipf} \le 2.50$) | *distillare, vetro, liquore, chimica, goccia* |
| **Sostantivo Astratto** | **Bruma** | $\approx 2.31$ | Standard ordinario ($1.80 \le \text{Zipf} \le 2.50$) | *nebbia, freddo, inverno, aria, bosco* |
| **Verbo Attestato** | **Ghermire** | $\text{Zipf}_{\text{att}} \approx 2.28$ | Forme attestate $\ge 1.80$ ($\text{inf} \approx 1.92$) | *afferrare, presa, mano, artiglio, colpire* |
| **Verbo Attestato** | **Lambire** | $\text{Zipf}_{\text{att}} \approx 2.35$ | Forme attestate $\ge 1.80$ ($\text{inf} \approx 1.96$) | *toccare, riva, onda, sfiorare, fiamma* |

### 4.2. Round Speciale (Ogni 9 Round): $\text{Zipf} \approx 1.90$ Anti-Monosettoriale, NVdB e Verbi

| Categoria | Lemma | Zipf Effettivo | Validazione Anti-Monosettoriale & Deroghe | Ponti Semantici Quotidiani ($\text{Zipf} \ge 3.8$) |
| :--- | :--- | :--- | :--- | :--- |
| **Comportamento Morale** | **Pusillanime** | $\approx 1.91$ | Non monosettoriale; etica/carattere | *codardo, vigliacco, paura, debole, scappare* |
| **Comportamento Morale** | **Tracotanza** | $\approx 1.93$ | Non monosettoriale; dinamica sociale | *orgoglio, superbia, potere, rispetto, sfida* |
| **Verbo Attestato** | **Scialacquare** | $\text{Zipf}_{\text{att}} \approx 1.94$ | Forme attestate in range ($1.85 - 2.05$); economia/costume | *soldi, spendere, sprecare, ricco, debiti* |
| **Verbo Attestato** | **Sopire** | $\text{Zipf}_{\text{att}} \approx 1.92$ | Forme attestate in range ($1.85 - 2.05$); quiete/sonno | *dormire, silenzio, calma, quiete, spegnere* |
| **Verbo Attestato** | **Vessare** | $\text{Zipf}_{\text{att}} \approx 1.95$ | Forme attestate in range; relazione oppressiva | *tormento, fastidio, opprimere, colpire, ingiustizia* |
| **NVdB Alta Disponibilità** | **Chincaglieria** | $\approx 1.92$ | Inclusione $\text{AD}$; manufatti materici non industriali | *oggetti, ferro, mercatino, cianfrusaglie, valore* |
| **Descrizione Evocativa** | **Caduco** | $\approx 1.89$ | Non monosettoriale; estetico/temporale | *fragile, foglia, autunno, breve, morte* |
| **Descrizione Evocativa** | **Vetusto** | $\approx 1.92$ | Non monosettoriale; temporale/storico | *antico, vecchio, tempo, pietra, storia* |
| **Psicologia / Stato** | **Inedia** | $\approx 1.88$ | Non settoriale medico; debolezza/inerzia | *fame, debolezza, stanchezza, vuoto, riposo* |

---

## 5. Meccanica dei Round e Regolamento del Round Speciale

### 5.1. Regola di Rotazione Ciclica

$$R_{\text{mode}} = \begin{cases} \text{ROUND SPECIALE (Survival 3 min / 100 tentativi)} & \text{se } R \equiv 0 \pmod 9 \\ \text{ROUND ORDINARIO (Relax, senza vincoli stringenti)} & \text{se } R \not\equiv 0 \pmod 9 \end{cases}$$

### 5.2. Vincoli di Gioco del Round Speciale (Dual-Exit Condition)

Il Round Speciale introduce una modalità ad alta intensità progettata per prevenire il *brute-force* da tastiera e le consultazioni prolungate:

$$\text{Terminazione Partita} = (t \ge 180\text{ s}) \;\lor\; (N_{\text{tentativi}} \ge 100) \;\lor\; (\text{guess} = \text{target})$$

1. **Limite di Tempo:** Massimo **180 secondi (3 minuti)** cronometrati lato server.
2. **Limite di Tentativi:** Massimo **100 parole ammesse**.
3. **Curva di Punteggio Speciale:**
   $$S_{\text{speciale}} = S_{\text{base}} \times \left(1 + 0.60 \cdot \frac{180 - t_{\text{fine}}}{180} + 0.40 \cdot \frac{100 - N_{\text{usati}}}{100}\right) \quad \text{con } S_{\text{base}} = 2500$$

### 5.3. Curva Termica e Valutazione Coseno

Il coseno viene rimappato su una scala 0–100 per facilitare la percezione intuitiva del giocatore:

$$S_{\text{score}} = \left( \frac{\max(0, \cos(\vec{u}, \vec{v}) - s_0)}{1.0 - s_0} \right)^\gamma \times 100$$

* **Round Ordinari ($\text{Zipf} \ge 1.80$):** $s_0 = 0.10, \; \gamma = 1.15$
* **Round Speciale ($\text{Zipf} \approx 1.90$):** $s_0 = 0.07, \; \gamma = 1.05$ (curva più accogliente per valorizzare i tentativi di avvicinamento semantico).

---

## 6. Implementazione Completa del Motore (Python)

```python
import time
import numpy as np
from wordfreq import zipf_frequency
from dataclasses import dataclass
from typing import Optional, Set, Dict, List, Any


@dataclass
class SecretWord:
    word: str
    zipf: float
    density: float
    bridges: List[str]
    is_special: bool
    category_origin: str


class SpecialRoundSession:
    """Gestisce la sessione a tempo e tentativi limitati per il Round Speciale."""
    def __init__(
        self,
        round_number: int,
        target_word: str,
        target_vector: np.ndarray,
        matrix: np.ndarray,
        word2idx: Dict[str, int],
        time_limit_sec: int = 180,
        max_attempts: int = 100
    ):
        self.round_number = round_number
        self.target_word = target_word
        self.target_vector = target_vector
        self.matrix = matrix
        self.word2idx = word2idx
        self.time_limit = time_limit_sec
        self.max_attempts = max_attempts

        self.start_time: float = 0.0
        self.is_active: bool = False
        self.attempts_count: int = 0
        self.best_rank: int = 99999
        self.history: List[Dict[str, Any]] = []

    def start(self):
        self.start_time = time.time()
        self.is_active = True
        self.attempts_count = 0
        self.history.clear()

    def submit_guess(self, guess: str) -> Dict[str, Any]:
        if not self.is_active:
            return {"status": "INACTIVE", "message": "La sessione non è attiva."}

        now = time.time()
        elapsed = now - self.start_time
        remaining_time = max(0.0, self.time_limit - elapsed)

        # 1. Verifica scadenze tempo o tentativi
        if remaining_time <= 0.0:
            self.is_active = False
            return {
                "status": "TIME_EXPIRED",
                "message": "Tempo scaduto (3 minuti esauriti)!",
                "solution": self.target_word,
                "best_rank": self.best_rank
            }

        if self.attempts_count >= self.max_attempts:
            self.is_active = False
            return {
                "status": "ATTEMPTS_EXPIRED",
                "message": "Limite di 100 tentativi raggiunto!",
                "solution": self.target_word,
                "best_rank": self.best_rank
            }

        clean = guess.strip().lower()
        if clean not in self.word2idx:
            return {
                "status": "INVALID_WORD",
                "message": "Parola non valida nel vocabolario.",
                "remaining_time": round(remaining_time, 1),
                "remaining_attempts": self.max_attempts - self.attempts_count
            }

        self.attempts_count += 1
        guess_idx = self.word2idx[clean]
        raw_sim = float(np.dot(self.matrix[guess_idx], self.target_vector))

        all_sims = np.dot(self.matrix, self.target_vector)
        rank = int(np.sum(all_sims > raw_sim)) + 1
        self.best_rank = min(self.best_rank, rank)

        # 2. Controllo Vittoria
        if clean == self.target_word:
            self.is_active = False
            f_time = (self.time_limit - elapsed) / self.time_limit
            f_eff = (self.max_attempts - self.attempts_count) / self.max_attempts
            score = int(2500 * (1.0 + 0.60 * f_time + 0.40 * f_eff))
            return {
                "status": "VICTORY",
                "target": self.target_word,
                "rank": 1,
                "similarity": 1.0,
                "attempts_used": self.attempts_count,
                "time_elapsed_sec": round(elapsed, 1),
                "final_score": score
            }

        # 3. Trigger di soccorso
        hint = None
        if self.attempts_count == 50 or (elapsed >= 90.0 and self.best_rank > 1000):
            hint = "INDIZIO: La parola appartiene all'ambito del comportamento morale, emotività o vita materica espressiva."
        elif self.attempts_count == 75 or (elapsed >= 150.0 and self.best_rank > 300):
            hint = f"ALLERTA: Miglior posizione finora #{self.best_rank}. Rafforza i termini ad alta frequenza affini."

        # Curva speciale s0=0.07, gamma=1.05
        game_score = max(0.0, (raw_sim - 0.07) / (1.0 - 0.07)) ** 1.05 * 100.0

        res = {
            "status": "CONTINUE",
            "guess": clean,
            "rank": rank,
            "game_score": round(min(100.0, game_score), 2),
            "attempts_used": self.attempts_count,
            "remaining_attempts": self.max_attempts - self.attempts_count,
            "remaining_time_sec": round(remaining_time, 1),
            "rescue_hint": hint
        }
        self.history.append(res)
        return res


class ContextGameEngine:
    """
    Motore semantico completo:
    - Standard Pool: Zipf >= 1.80 (finestra ordinaria [1.80, 2.50]), deroghe NVdB medio-alta e verbi attestati
    - Special Pool: Zipf ~1.90 ([1.85, 2.05]), rigorosamente anti-monosettoriale, armonizzato con NVdB e verbi attestati
    - Sessioni Speciali a tempo (180s) e tentativi (100) ogni 9 round
    """
    BANNED_SPECIAL_SUFFIXES = (
        "ite", "osi", "asi", "ato", "uro", "morfismo", 
        "ectomia", "terapia", "metria", "scopia", "fagia", "logia"
    )

    def __init__(
        self,
        vocabulary: List[str],
        matrix: np.ndarray,
        nvdb_ad: Optional[Set[str]] = None,
        nvdb_au: Optional[Set[str]] = None,
        nvdb_fo: Optional[Set[str]] = None,
        verb_attested_map: Optional[Dict[str, List[str]]] = None
    ):
        self.vocab = vocabulary
        self.word2idx = {w: i for i, w in enumerate(vocabulary)}
        self.nvdb_ad = nvdb_ad or set()
        self.nvdb_au = nvdb_au or set()
        self.nvdb_fo = nvdb_fo or set()
        self.verb_attested_map = verb_attested_map or {}

        # 1. Normalizzazione L2
        norms = np.linalg.norm(matrix, axis=1, keepdims=True)
        norms[norms == 0] = 1e-10
        self.matrix = (matrix / norms).astype(np.float32)

        # 2. Zipf superficiale
        print("Calcolo vettorializzato frequenze Zipf di superficie...")
        self.surface_zipf = np.array(
            [zipf_frequency(w, 'it') for w in self.vocab],
            dtype=np.float32
        )

        # 3. Frequenza aggregata forme verbali attestate
        self.verb_aggregated_zipf: Dict[str, float] = {}
        self._precompute_attested_verbs()

        self.standard_pool: List[SecretWord] = []
        self.special_pool: List[SecretWord] = []

    def _precompute_attested_verbs(self):
        """Calcola la frequenza aggregata sulle forme flesse verbali attestate."""
        for inf, forms in self.verb_attested_map.items():
            valid_forms = [f for f in forms if f in self.word2idx]
            if valid_forms:
                total_mass = sum(10 ** (zipf_frequency(f, 'it') - 3) for f in valid_forms)
                self.verb_aggregated_zipf[inf] = float(np.log10(max(total_mass, 1e-9)) + 3)
            else:
                self.verb_aggregated_zipf[inf] = zipf_frequency(inf, 'it')

    def get_effective_zipf(self, word: str, idx: int) -> float:
        if word in self.verb_aggregated_zipf:
            return self.verb_aggregated_zipf[word]
        return float(self.surface_zipf[idx])

    def is_anti_monosectorial(self, word: str) -> bool:
        """Verifica che la parola non appartenga a gerghi monosettoriali (suffissi tecnici)."""
        return not any(word.endswith(suf) for suf in self.BANNED_SPECIAL_SUFFIXES)

    def build_pools(self):
        print("Compilazione Pool Standard (Zipf >= 1.80 con deroghe NVdB / Verbi)...")
        self.standard_pool = self._build_standard_pool()

        print("Compilazione Pool Speciale (Zipf ~1.9 Anti-Monosettoriale con eccezioni NVdB / Verbi)...")
        self.special_pool = self._build_special_pool()

        print(f"-> Standard Pool attivo: {len(self.standard_pool)} lemmi.")
        print(f"-> Special Pool attivo: {len(self.special_pool)} lemmi.")

    def _build_standard_pool(self) -> List[SecretWord]:
        pool = []
        for idx, word in enumerate(self.vocab):
            if word in self.nvdb_fo:
                continue

            eff_zipf = self.get_effective_zipf(word, idx)
            category_origin = None

            # Regola 1: Deroga NVdB Alta Disponibilita (promossa anche se Zipf < 1.80)
            if word in self.nvdb_ad:
                if eff_zipf < 1.80:
                    category_origin = 'NVDB_AD_DEROGATION'
                elif eff_zipf <= 2.50:
                    category_origin = 'NVDB_AD_STANDARD'

            # Regola 2: Deroga NVdB Alto Uso (ammessa fino a 3.20 per sostantivi)
            elif word in self.nvdb_au and (2.50 < eff_zipf <= 3.20):
                category_origin = 'NVDB_AU_DEROGATION'

            # Regola 3: Verbo attestato con frequenza aggregata >= 1.80
            elif word in self.verb_aggregated_zipf:
                if 1.80 <= eff_zipf <= 2.50:
                    category_origin = 'VERB_ATTESTED_STANDARD'

            # Regola 4: Lessico ordinario calibrato [1.80, 2.50]
            elif 1.80 <= eff_zipf <= 2.50:
                category_origin = 'STANDARD_BASE'

            if not category_origin:
                continue

            # Controllo densita e ponti semantici standard
            sims = np.dot(self.matrix, self.matrix[idx])
            top100_idx = np.argpartition(sims, -101)[-101:]
            top100_idx = top100_idx[top100_idx != idx]
            top100_sims = sims[top100_idx]

            density = float(np.mean(top100_sims))
            if density < 0.45:
                continue

            neighbor_zipfs = self.surface_zipf[top100_idx]
            bridges_mask = neighbor_zipfs >= 4.0
            if np.sum(bridges_mask) < 10:
                continue

            bridge_indices = top100_idx[bridges_mask]
            best_bridges = [self.vocab[i] for i in bridge_indices[np.argsort(-sims[bridge_indices])][:5]]

            pool.append(SecretWord(
                word=word,
                zipf=round(eff_zipf, 2),
                density=round(density, 3),
                bridges=best_bridges,
                is_special=False,
                category_origin=category_origin
            ))

        pool.sort(key=lambda x: x.density, reverse=True)
        return pool

    def _build_special_pool(self) -> List[SecretWord]:
        pool = []
        for idx, word in enumerate(self.vocab):
            # Esclusione totale parole fondamentali
            if word in self.nvdb_fo:
                continue

            # 1. Filtro Tassativo Anti-Monosettoriale
            if not self.is_anti_monosectorial(word):
                continue

            eff_zipf = self.get_effective_zipf(word, idx)
            category_origin = None

            # 2. Controllo Range Speciale [1.85, 2.05]
            if 1.85 <= eff_zipf <= 2.05:
                if word in self.verb_aggregated_zipf:
                    category_origin = 'SPECIAL_VERB_ATTESTED'
                elif word in self.nvdb_ad:
                    category_origin = 'SPECIAL_NVDB_AD'
                elif word in self.nvdb_au:
                    category_origin = 'SPECIAL_NVDB_AU'
                else:
                    category_origin = 'SPECIAL_ANTI_MONOSECTORIAL'

            if not category_origin:
                continue

            # 3. Controllo Densita Semantica e Ponti Semantici Speciali
            sims = np.dot(self.matrix, self.matrix[idx])
            top100_idx = np.argpartition(sims, -101)[-101:]
            top100_idx = top100_idx[top100_idx != idx]
            top100_sims = sims[top100_idx]

            density = float(np.mean(top100_sims))
            if density < 0.48:
                continue

            neighbor_zipfs = self.surface_zipf[top100_idx]
            bridges_mask = neighbor_zipfs >= 3.8
            if np.sum(bridges_mask) < 15:
                continue

            bridge_indices = top100_idx[bridges_mask]
            best_bridges = [self.vocab[i] for i in bridge_indices[np.argsort(-sims[bridge_indices])][:5]]

            pool.append(SecretWord(
                word=word,
                zipf=round(eff_zipf, 2),
                density=round(density, 3),
                bridges=best_bridges,
                is_special=True,
                category_origin=category_origin
            ))

        pool.sort(key=lambda x: x.density, reverse=True)
        return pool

    def create_session(self, round_number: int) -> Any:
        """Restituisce una sessione ordinaria o una SpecialRoundSession a tempo."""
        if round_number <= 0:
            raise ValueError("Il numero del round deve essere >= 1.")

        if round_number % 9 == 0:
            idx = (round_number // 9 - 1) % len(self.special_pool)
            secret = self.special_pool[idx]
            target_vec = self.matrix[self.word2idx[secret.word]]
            session = SpecialRoundSession(
                round_number=round_number,
                target_word=secret.word,
                target_vector=target_vec,
                matrix=self.matrix,
                word2idx=self.word2idx,
                time_limit_sec=180,
                max_attempts=100
            )
            session.start()
            return session
        else:
            specials_passed = round_number // 9
            idx = (round_number - specials_passed - 1) % len(self.standard_pool)
            return self.standard_pool[idx]
```

---

## 7. Quadro Sinottico Operativo Definitivo

| Proprietà | Round Ordinari ($R \not\equiv 0 \pmod 9$) | Round Speciale ($R \equiv 0 \pmod 9$) |
| :--- | :--- | :--- |
| **Fascia Zipf Target** | $\mathbf{\text{Zipf} \ge 1.80}$ (Finestra base: $[1.80, 2.50]$) | $\mathbf{1.85 \le \text{Zipf} \le 2.05}$ (Centrato su $\approx 1.90$) |
| **Limite di Tempo** | Nessun limite (sessione aperta) | **180 secondi (3 minuti)** cronometrati |
| **Limite Tentativi** | Nessun limite (fino a risoluzione) | **Massimo 100 tentativi** |
| **Filtro Anti-Monosettoriale** | Standard lessicale generale | **Tassativo:** Esclusione gerghi tecnici/medici ($\mathcal{B}_{\text{suf}}$) |
| **Eccezione NVdB** | **AD promosse** se $\text{Zipf} < 1.80$; **AU ammesse** fino a $3.20$; **FO bandite** | **AD/AU integrate** se in range $1.85 - 2.05$ e non monosettoriali; **FO bandite** |
| **Frequenza Verbi** | Calcolata su **forme attestate** ($\text{Zipf}_{\text{att}} \ge 1.80$) | Calcolata su **forme attestate** ($\text{Zipf}_{\text{att}} \in [1.85, 2.05]$) |
| **Densità Minima ($D_{100}$)** | $\ge 0.45$ | $\ge 0.48$ |
| **Ponti Semantici Richiesti** | $\ge 10$ vicini con $\text{Zipf} \ge 4.0$ | $\ge 15$ vicini con $\text{Zipf} \ge 3.8$ |
| **Curva Termica ($s_0, \gamma$)** | $s_0 = 0.10, \; \gamma = 1.15$ | $s_0 = 0.07, \; \gamma = 1.05$ |
| **Condizione di Fallimento** | Nessuna | $t \ge 180\text{ s} \;\lor\; N \ge 100$ |

## 8. Applicazione nel repository — 16 novembre 2026

Implementazione e precisazioni matematiche in [IMPLEMENTAZIONE_SEMANTICA.md](IMPLEMENTAZIONE_SEMANTICA.md).
Per rispettare il vincolo esplicito di non diminuire le segrete, le vecchie soluzioni che non
superano i nuovi filtri restano giocabili in deroga nel pool ordinario. Il corpus risultante ha
9.513 segrete, comprese tutte le 6.838 precedenti. Le quantità indicative di questa specifica
non sostituiscono i conteggi misurati: il pool speciale conforme contiene attualmente 3 lemmi.

**Modifica del 16 novembre 2026 — finestra ordinaria.** Il pool ordinario include le parole con
$1.80 \le \text{Zipf} \le 2.50$ (prima $[2.00, 2.40]$). Di conseguenza: pavimento $1.80$; deroga $\text{AD}$ sotto $1.80$;
ammissione $\text{AU}$ per sostantivi tra $2.50$ e $3.20$; verbi con $\text{Zipf}_{\text{att}} \ge 1.80$. Il pool speciale
($1.85 \le \text{Zipf} \le 2.05$), le soglie di densità e di ponti e l'esclusione delle $\text{FO}$ restano invariati.
Il task *Zerocade : Generazione parole segrete* applica questa finestra.

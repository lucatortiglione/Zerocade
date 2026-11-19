# ZeroContext: qualità delle posizioni — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un valutatore ripetibile che misura quanto le posizioni di ogni profilo di ZeroContext mettono in alto le parole associate alla segreta, con giudice Qwen locale, revisione umana nella dashboard e risultati in un database a parte.

**Architecture:** Un pacchetto Python `gioco-zerocontext/valutazione/` legge in sola lettura `parole_ita_raw_2.0.sqlite3` (segrete, lemmi, forme), `giochi.sqlite3` (profili, associazioni verificate) e Morph-it!, ripete il ranking del gioco, chiede a Qwen i voti mancanti e scrive tutto in `database/ZeroContext_Valutazione.sqlite3`. Il server Fastify legge quel database e salva solo i verdetti umani; la dashboard ha una pagina `/qualita`.

**Tech Stack:** Python 3.13 + numpy (ambiente `gioco-zerocontext/.venv-pipeline-a`), `unittest`, sqlite3; Node 26, TypeScript, Fastify, better-sqlite3, `node --test` con tsx; React 19 + react-router; llama.cpp con Qwen3.8-27B (configurazione `gioco-zeroassociations/resources/association_draft_model.json`).

**Spec:** [docs/superpowers/specs/2026-11-19-zerocontext-qualita-posizioni-design.md](../specs/2026-11-19-zerocontext-qualita-posizioni-design.md)

## Global Constraints

- Sola lettura su `database/parole_ita_raw_2.0.sqlite3`, `database/giochi.sqlite3`, `database/ZeroContext_Associazioni_PipelineB.sqlite3` e sui file dei vettori: aprire con `?mode=ro` (Python) o `{ readonly: true, fileMustExist: true }` (Node).
- Unico database scritto: `database/ZeroContext_Valutazione.sqlite3` (Node: variabile `ZEROCADE_EVALUATION_FILE` lo sostituisce, come `ZEROCADE_ASSOCIATIONS_B_FILE`).
- Divisione: misura se `int(sha256(parola.encode('utf-8')).hexdigest(), 16) % 5 == 0`, altrimenti sviluppo. Costante `SPLIT_RULE = "sha256-utf8-mod5-eq0"`.
- Database normalizzato: chiavi intere, `WITHOUT ROWID` sulle tabelle con chiave composta, chiavi esterne, viste con nomi leggibili, `PRAGMA journal_mode=WAL`, `busy_timeout = 5000`, `VACUUM` a fine esecuzione.
- Parole normalizzate in Unicode NFC e minuscole in ogni punto di ingresso (vocabolario, raw 2.0, associazioni, Morph-it!, verdetti).
- Il giudice non parte se il server Zerocade risponde e ha una sorgente live collegata.
- Prove del server sempre con database temporanei (`ZEROCADE_DB`, `ZEROCADE_EVALUATION_FILE` nella cartella temporanea), mai con quelli veri.
- Testi dell'interfaccia e messaggi d'errore in italiano.
- `DIRETTIVE.md`: timeout su ogni richiesta HTTP, nessun SQL costruito da input esterno, limiti espliciti sui corpi delle richieste.
- `apps/server/src/index.ts` ha modifiche non committate di un'altra sessione: in quel file si aggiunge solo l'import e una riga di registrazione; non si committa se contiene modifiche altrui (lo si dice a Luca).
- Commit solo dopo che Luca li ha autorizzati all'avvio dell'esecuzione; `git add` sempre con i percorsi esatti del task.

## Review Focus

1. **raw 2.0 rigenerato durante una valutazione**: l'impronta delle tabelle lette all'inizio e alla fine deve coincidere, altrimenti l'esecuzione si chiude con stato `annullata` e messaggio chiaro (Task 2).
2. **Risposta di Qwen malformata o con parole diverse da quelle chieste**: nessuna scrittura in cache, un solo nuovo tentativo, poi la segreta resta «non giudicata» e il rapporto lo conta (Task 6).
3. **Interruzione a metà (Ctrl+C, crash)**: rilanciando lo stesso comando si riprende senza rigiudicare; un'esecuzione con stato `in_corso` non compare come completa nella dashboard (Task 7 e Task 8).
4. **Server avviato senza database dei risultati**: le rotte rispondono 404 con un messaggio che indica il comando da lanciare; la pagina lo mostra invece di andare in errore (Task 8 e Task 9).
5. **Verdetto inviato per una coppia fuori dal campione o con valore non previsto**: 400, nessuna scrittura (Task 8).

---

## Struttura dei file

| File | Responsabilità |
| --- | --- |
| `gioco-zerocontext/valutazione/__init__.py` | Pacchetto; `EVALUATOR_VERSION = "valutatore-1"` |
| `gioco-zerocontext/valutazione/paths.py` | Percorsi predefiniti di database, dati e cache |
| `gioco-zerocontext/valutazione/split.py` | Divisione misura/sviluppo e chiavi dei sottoinsiemi |
| `gioco-zerocontext/valutazione/reference.py` | raw 2.0 + Morph-it!: segrete e gruppi, lemmi, varianti, categoria, «fuori riferimento», impronta |
| `gioco-zerocontext/valutazione/gold.py` | Associazioni verificate da `giochi.sqlite3` |
| `gioco-zerocontext/valutazione/profiles.py` | Caricamento profili pubblicati, `pipeline_b` e candidati |
| `gioco-zerocontext/valutazione/ranking.py` | Ranking identico a `rankAgainst` |
| `gioco-zerocontext/valutazione/store.py` | Schema e accesso al database dei risultati |
| `gioco-zerocontext/valutazione/metrics.py` | Voti e metriche, funzioni pure |
| `gioco-zerocontext/valutazione/judge.py` | Giudice Qwen, cache, controlli di sensibilità e specificità |
| `gioco-zerocontext/valutazione/cli.py` | Comandi `campione`, `valuta`, `ricalcola`, `parita` |
| `gioco-zerocontext/script/evaluate_context_ranking.py` | Punto d'ingresso: `from valutazione.cli import main` |
| `gioco-zerocontext/valutazione/test_*.py` | Test Python |
| `tests/fixtures/context-evaluation-parity.json` | Caso piccolo condiviso Python/Node per la parità del ranking |
| `tests/context-evaluation-parity.test.ts` | `rankAgainst` sullo stesso caso |
| `scripts/context-evaluation-parity.ts` | Confronto sui profili veri con l'uscita di `parita` |
| `packages/shared/src/contextEvaluation.ts` | Tipi condivisi server/dashboard |
| `apps/server/src/context-evaluation.ts` | Lettura dei risultati, verdetti umani, rotte |
| `tests/context-evaluation.test.ts` | Rotte con database temporaneo |
| `apps/dashboard/src/pages/ContextQualityPage.tsx` | Pagina «Qualità posizioni» |

Comando dei test Python (dalla radice del repo), indicato sotto come **PYTEST**:

```
gioco-zerocontext\.venv-pipeline-a\Scripts\python.exe -I -m unittest discover -s gioco-zerocontext/valutazione -t gioco-zerocontext
```

---

### Task 1: Divisione misura/sviluppo e sottoinsiemi

**Files:**
- Create: `gioco-zerocontext/valutazione/__init__.py`, `gioco-zerocontext/valutazione/paths.py`, `gioco-zerocontext/valutazione/split.py`
- Test: `gioco-zerocontext/valutazione/test_split.py`

**Interfaces:**
- Produces:
  - `EVALUATOR_VERSION: str = "valutatore-1"`
  - `paths.REPO: Path`, `paths.RAW2: Path`, `paths.GIOCHI: Path`, `paths.PIPELINE_B: Path`, `paths.RESULTS: Path` (= `database/ZeroContext_Valutazione.sqlite3`), `paths.VECTORS_DIR: Path` (= `gioco-zerocontext/data`), `paths.MORPHIT: Path` (= `gioco-zerocontext/.cache/morphit_048.txt`), `paths.REPORTS: Path`
  - `split.SPLIT_RULE: str`, `split.is_measure(word: str) -> bool`, `split.split_of(word: str) -> Literal['misura','sviluppo']`
  - `split.subsets(split: str, has_gold: bool, group: str) -> list[str]`: chiavi `f"{split}:{filtro}"` con filtro in `tutte`, `con_associazioni` | `senza_associazioni`, e il gruppo (`ordinaria` | `deroga` | `aggiunta`)

- [ ] **Step 1: Scrivi i test**

```python
class SplitTest(unittest.TestCase):
    def test_rule_is_stable(self):
        expected = int(hashlib.sha256('cane'.encode('utf-8')).hexdigest(), 16) % 5 == 0
        self.assertEqual(split.is_measure('cane'), expected)
    def test_nfc(self):
        self.assertEqual(split.is_measure('città'), split.is_measure(unicodedata.normalize('NFD', 'città')))
    def test_share_close_to_one_fifth(self):
        words = [f'parola{i}' for i in range(10000)]
        share = sum(map(split.is_measure, words)) / len(words)
        self.assertAlmostEqual(share, 0.2, delta=0.02)
    def test_subsets(self):
        self.assertEqual(split.subsets('misura', True, 'deroga'),
                         ['misura:tutte', 'misura:con_associazioni', 'misura:deroga'])
```

- [ ] **Step 2:** PYTEST → FAIL (`ModuleNotFoundError: valutazione`).
- [ ] **Step 3:** Implementa i tre file. `is_measure` normalizza in NFC e minuscolo prima dell'hash.
- [ ] **Step 4:** PYTEST → PASS.
- [ ] **Step 5: Commit** `git add gioco-zerocontext/valutazione` → `feat(zerocontext): divisione misura/sviluppo del valutatore`

---

### Task 2: Riferimento raw 2.0 e Morph-it!

**Files:**
- Create: `gioco-zerocontext/valutazione/reference.py`
- Test: `gioco-zerocontext/valutazione/test_reference.py`

**Interfaces:**
- Produces:
  - `class Reference` con:
    - `secrets: dict[str, str]`: parola → gruppo (`'ordinaria'` se `ordinaria=1 and legacy=1`; `'aggiunta'` se `ordinaria=1 and legacy=0`; `'deroga'` se `deroga=1`)
    - `lemmas(word: str) -> set[str]`: lemmi da `normalizzazione_esclusioni.sostituita_da` **unito** a quelli di Morph-it! (colonna 2), più la parola stessa se è in `normalizzata`
    - `is_variant(word: str, secret: str) -> bool`: vero se `word != secret` e `secret in lemmas(word)`, oppure se `lemmas(word)` e `lemmas(secret)` si intersecano, oppure derivato stretto (`bancaria`/`bancario` per `banca`: stessa radice dopo aver tolto le desinenze `-o -a -i -e -io -ia -ario -aria -ari -arie`, minimo 4 lettere comuni)
    - `in_reference(word: str) -> bool`: presente in `parole` o in `normalizzazione_esclusioni`
    - `pos(word: str) -> Literal['NOUN','VERB','ADJ','ALTRO']`: prima etichetta Morph-it! (`NOUN*` → NOUN, `VER*` → VERB, `ADJ*` → ADJ), altrimenti `ALTRO`
    - `fingerprint() -> str`: SHA-256 del contenuto ordinato di `parole_segrete`, `normalizzazione_esclusioni(parola, sostituita_da)` e `parole(parola)`
  - `load_reference(raw2: Path = paths.RAW2, morphit: Path = paths.MORPHIT) -> Reference`
  - `class ReferenceChanged(RuntimeError)`; `Reference.check_unchanged() -> None` ricalcola l'impronta e solleva `ReferenceChanged` se diversa

- [ ] **Step 1: Scrivi i test** con un raw 2.0 finto in una cartella temporanea (le sole tabelle `parole_segrete`, `normalizzata`, `normalizzazione_esclusioni`, `parole`) e un Morph-it! finto di poche righe:

```python
def test_groups(self):            # cane(ord=1,legacy=1) gatto(ord=1,legacy=0) abate(deroga=1)
    self.assertEqual(ref.secrets, {'cane': 'ordinaria', 'gatto': 'aggiunta', 'abate': 'deroga'})
def test_variant_fixes_raw2_error(self):   # esclusioni: cani -> cano ; morphit: cani -> cane
    self.assertTrue(ref.is_variant('cani', 'cane'))
def test_derivative(self):
    self.assertTrue(ref.is_variant('bancaria', 'banca'))
    self.assertFalse(ref.is_variant('guinzaglio', 'cane'))
def test_out_of_reference(self):
    self.assertFalse(ref.in_reference('beach')); self.assertTrue(ref.in_reference('pizze'))
def test_pos(self):
    self.assertEqual(ref.pos('abbaiare'), 'VERB'); self.assertEqual(ref.pos('xyz'), 'ALTRO')
def test_changed_reference_is_detected(self):
    # aggiunge una riga a parole_segrete dopo load_reference
    with self.assertRaises(ReferenceChanged): ref.check_unchanged()
def test_opened_read_only(self):
    # dopo load_reference il file raw 2.0 ha la stessa mtime e nessun -wal accanto
```

- [ ] **Step 2:** PYTEST → FAIL.
- [ ] **Step 3:** Implementa `reference.py`. Morph-it! si legge riga per riga (forma, lemma, tratti separati da tab); se il file manca, `load_reference` solleva `FileNotFoundError` con il messaggio `Manca Morph-it!: lancia python gioco-zerocontext/script/fetch_morphit.py`.
- [ ] **Step 4:** PYTEST → PASS.
- [ ] **Step 5: Commit** → `feat(zerocontext): riferimento raw 2.0 e Morph-it! per la valutazione`

---

### Task 3: Associazioni verificate, profili e ranking

**Files:**
- Create: `gioco-zerocontext/valutazione/gold.py`, `gioco-zerocontext/valutazione/profiles.py`, `gioco-zerocontext/valutazione/ranking.py`, `tests/fixtures/context-evaluation-parity.json`, `tests/context-evaluation-parity.test.ts`
- Test: `gioco-zerocontext/valutazione/test_gold_profiles_ranking.py`

**Interfaces:**
- Produces:
  - `gold.Gold = dict[str, GoldEntry]`; `GoldEntry(gloss: str, pos: str, groups: dict[str, int])` (parola associata → `group_name_id`)
  - `gold.load_gold(giochi: Path = paths.GIOCHI) -> Gold`: join di `associazioni__prompts`, `associazioni__prompt_words`, `associazioni__words`; un solo senso per parola-guida (se ne trova due, `ValueError`)
  - `gold.fingerprint(giochi) -> str`
  - `profiles.Profile(name: str, words: list[str], index: dict[str, int], vectors: np.ndarray, sha256: str, pinned: dict[int, list[int]] | None)`; `vectors` float32 `(n, dim)`, mappato con `np.memmap` in sola lettura
  - `profiles.load_published(name: Literal['original','abtt','pipeline_b']) -> Profile`: schema da `CONTEXT_PROFILES` (`original`→`context_original`, `abtt`→`context_abtt`, `pipeline_b`→`context_original` + pinned); vocabolario da `context_<schema>__vocab(idx, word)` ordinato per `idx`; file da `context_<schema>__meta.vectors_file` in `paths.VECTORS_DIR`; controllo SHA-256 contro `vectors_sha256`
  - `profiles.load_candidate(name: str, vectors: Path, vocab: Path, dim: int) -> Profile`: `vocab` una parola per riga, nello stesso ordine dei vettori
  - `profiles.load_pinned(file: Path, words: list[str], min_pinned: int = 100) -> dict[int, list[int]]`: stessa regola di `loadPipelineAssociations` in `apps/server/src/context-pipeline.ts` (tabelle `lexemes`, `semantic_pair_scores` ordinata per `rank`, `pipeline_meta.model_version`; parole fuori vocabolario saltate; doppioni e la segreta stessa saltati; segrete con meno di `min_pinned` parole escluse)
  - `ranking.order(profile: Profile, secret: int) -> np.ndarray[int]`: ordine completo come `rankAgainst`
  - `ranking.top(profile: Profile, secret: int, k: int = 20) -> list[int]`: le prime `k` dopo la segreta
  - `ranking.rank_of(profile: Profile, secret: int) -> np.ndarray[int]`: posizione 1-based di ogni parola (1 = segreta)

Algoritmo di `ranking.order` (deve coincidere con `packages/shared/src/contextRanking.ts`):

```python
sims = (vectors.astype(np.float64) @ vectors[secret].astype(np.float64)).astype(np.float32)
sims[secret] = np.inf
key = np.full(n, n + 2, dtype=np.int64)          # solo se pinned ha la segreta
key[secret] = 0; key[pinned_words] = 1..len      # nell'ordine dell'export, primo arrivo
return np.lexsort((np.arange(n), -sims, key))    # key, poi similarità decrescente, poi indice
```

- [ ] **Step 1: Scrivi i test Python** con un `giochi.sqlite3` finto (schema `context_original` con 6 parole, `associazioni__*` per `cane`) e un file di vettori di prova:

```python
def test_gold_groups(self):
    self.assertEqual(gold['cane'].groups, {'coda': 2351, 'scodinzolare': 2351, 'guinzaglio': 4972})
def test_vectors_hash_mismatch_is_refused(self):
    with self.assertRaises(ValueError): profiles.load_published('original')  # file alterato
def test_order_ties_by_index(self):          # due vettori identici: vince l'indice più basso
def test_pinned_first(self):                 # pinned [4, 2] -> ordine [s, 4, 2, ...resto per similarità]
def test_parity_fixture(self):
    data = json.loads((REPO / 'tests/fixtures/context-evaluation-parity.json').read_text('utf-8'))
    for case in data['cases']:
        self.assertEqual(list(ranking_order_from_fixture(data, case)), case['expected'])
```

- [ ] **Step 2: Scrivi la fixture e il test Node.** La fixture contiene `dim: 8`, `words: 50`, vettori unitari float32 (seme `20261119`, in lista di numeri), e tre casi: senza pinned (segreta 0), con due parole a pari similarità (segreta 3), con pinned `[7, 1]` (segreta 5). `expected` è l'ordine completo, calcolato una volta con `ranking.order`.

```ts
test('rankAgainst coincide con il valutatore Python', () => {
  for (const c of fixture.cases) {
    const data = { vectors: Float32Array.from(fixture.vectors), dim: fixture.dim, wordCount: fixture.words,
      links: new Map(), linkBoost: 0, ...(c.pinned ? { pinned: new Map([[c.secret, c.pinned]]) } : {}) }
    assert.deepEqual([...rankAgainst(data, c.secret).order], c.expected)
  }
})
```

- [ ] **Step 3:** PYTEST e `node --import tsx --test tests/context-evaluation-parity.test.ts` → FAIL.
- [ ] **Step 4:** Implementa `gold.py`, `profiles.py`, `ranking.py`.
- [ ] **Step 5:** PYTEST e il test Node → PASS (se il Node fallisce, la fixture è sbagliata o `rankAgainst` ha campi richiesti diversi: adeguare la costruzione di `data` alla firma reale di `ContextRankSource`, non l'algoritmo).
- [ ] **Step 6: Commit** → `feat(zerocontext): profili e ranking del valutatore, parità con il server`

---

### Task 4: Database dei risultati

**Files:**
- Create: `gioco-zerocontext/valutazione/store.py`
- Test: `gioco-zerocontext/valutazione/test_store.py`

**Interfaces:**
- Produces: `class Store(path: Path = paths.RESULTS)` con:
  - `word_id(word: str) -> int` (inserisce se manca)
  - `profile_id(name: str, origin: str, vectors_sha256: str, dim: int, words: int) -> int`
  - `start_run(profile_id: int, judge_version: str | None, reference_sha256: str, gold_sha256: str) -> int` (stato `in_corso`)
  - `finish_run(run_id: int, status: Literal['completa','annullata']) -> None`
  - `open_run(profile_id: int, reference_sha256: str, gold_sha256: str, judge_version: str | None) -> int | None`: esecuzione `in_corso` da riprendere con gli stessi ingressi
  - `save_top(run_id: int, secret: str, words: list[str], verified: list[bool], variant: list[bool]) -> None`; `top(run_id: int, secret: str) -> list[str]`
  - `Store.ddl() -> str` (metodo statico): tutto il DDL, usato anche dal test del server
  - `judge_verdict(secret, word, judge_version, model) -> Verdict | None`; `save_judge_verdicts(secret, judge_version, model, verdicts: list[Verdict]) -> None` (una transazione)
  - `human_verdicts() -> dict[tuple[str, str], Literal['naturale','non_naturale','non_so']]`
  - `sample() -> list[SampleRow]`; `add_sample(rows: list[SampleRow], seed: int) -> None`
  - `save_metrics(run_id: int, rows: list[MetricRow]) -> None`, `save_secret_metrics(run_id: int, rows: list[SecretMetricRow]) -> None`
  - `vacuum() -> None`
  - Tipi: `Verdict(word: str, grade: int, sense_ok: bool | None, reason: str)`, `SampleRow(secret: str, has_gold: bool, block: int)`, `MetricRow(metric: str, subset: str, value: float | None, low: float | None, high: float | None, n: int)`, `SecretMetricRow(secret: str, metric: str, value: float | None)`

Schema (creato da `Store` se il file non esiste; `PRAGMA user_version = 1`):

| Tabella | Colonne | Chiave |
| --- | --- | --- |
| `words` | `id INTEGER PRIMARY KEY`, `word TEXT NOT NULL UNIQUE` | |
| `profiles` | `id INTEGER PRIMARY KEY`, `name`, `origin`, `vectors_sha256`, `dim`, `words`; `UNIQUE(name, vectors_sha256)` | |
| `runs` | `id INTEGER PRIMARY KEY`, `profile_id → profiles`, `created_at`, `finished_at`, `status CHECK IN ('in_corso','completa','annullata')`, `evaluator_version`, `judge_version`, `split_rule`, `reference_sha256`, `gold_sha256` | |
| `run_top` | `run_id → runs`, `secret_id → words`, `position INTEGER CHECK BETWEEN 2 AND 21`, `word_id → words`, `verified INTEGER NOT NULL`, `variant INTEGER NOT NULL` | `(run_id, secret_id, position)` WITHOUT ROWID |
| `sample` | `secret_id → words`, `has_gold`, `block`, `seed` | `(secret_id)` WITHOUT ROWID |
| `judge_verdicts` | `secret_id`, `word_id`, `judge_version`, `model`, `grade CHECK IN (0,1,2)`, `sense_ok` (NULL/0/1), `reason`, `created_at` | `(secret_id, word_id, judge_version, model)` WITHOUT ROWID |
| `human_verdicts` | `secret_id`, `word_id`, `verdict CHECK IN ('naturale','non_naturale','non_so')`, `updated_at` | `(secret_id, word_id)` WITHOUT ROWID |
| `run_metrics` | `run_id`, `metric`, `subset`, `value`, `low`, `high`, `n` | `(run_id, metric, subset)` WITHOUT ROWID |
| `run_secret_metrics` | `run_id`, `secret_id`, `metric`, `value` | `(run_id, secret_id, metric)` WITHOUT ROWID |

Viste: `v_runs` (esecuzioni con nome del profilo), `v_run_metrics` (metriche con nome del profilo e data), `v_sample_top` (campione con le prime 10 di ogni esecuzione completa e i verdetti umani e del giudice in chiaro).

- [ ] **Step 1: Scrivi i test**: schema creato con `foreign_keys=ON`, `journal_mode=wal`; `start_run` + `open_run` restituisce la stessa esecuzione; voto 3 rifiutato da `CHECK`; un verdetto umano sovrascrive il precedente sulla stessa coppia; le viste esistono e rispondono.
- [ ] **Step 2:** PYTEST → FAIL. **Step 3:** implementa. **Step 4:** PYTEST → PASS.
- [ ] **Step 5: Commit** → `feat(zerocontext): database dei risultati della valutazione`

---

### Task 5: Voti e metriche

**Files:**
- Create: `gioco-zerocontext/valutazione/metrics.py`
- Test: `gioco-zerocontext/valutazione/test_metrics.py`

**Interfaces:**
- Consumes: `Reference.is_variant`, `Reference.lemmas`, `Reference.pos`, `Reference.in_reference` (Task 2); `GoldEntry` (Task 3)
- Produces:
  - `Slot(word: str, kind: Literal['variante','verificata','umano','giudice','senza_voto'], grade: int | None, sense_ok: bool | None, pos: str, in_reference: bool)`
  - `grade_slots(secret: str, top20: list[str], ref: Reference, gold: GoldEntry | None, human: Mapping[tuple[str,str], str], judge: Mapping[str, Verdict]) -> list[Slot]`
  - `precision_verified(slots) -> float | None`, `precision_judged(slots) -> float | None`, `ndcg20(slots, gold: GoldEntry | None, vocab: set[str], pooled: list[int]) -> float | None`, `sense_share(slots) -> float | None`, `human_share(slots) -> float | None`
  - `bootstrap(values: list[float], seed: int = 0, rounds: int = 1000) -> tuple[float, float]` (percentili 2,5 e 97,5)

Regole (dalla spec, sezione 6.2–6.3, con le scelte fissate qui):

- Voto di ogni posizione, nell'ordine: umano (`naturale` → 2, `non_naturale` → 0, `non_so` → si passa oltre); verificata (la parola o un suo lemma è in `gold.groups`) → 2; giudice → il suo voto; altrimenti `senza_voto`. Le varianti della segreta hanno `kind='variante'`, `grade=None`.
- Gruppi: scorrendo dalla posizione 2, la prima parola di un `group_name_id` tiene il voto, le successive dello stesso gruppo prendono voto 0.
- Precision@10: sulle posizioni 2–11 tolte le varianti. Se resta 0, `None`. La giudicata è `None` se una di queste posizioni è `senza_voto`.
- nDCG@20: `DCG = Σ grade_i / log2(i + 1)` con `i` = 1..20 sulle posizioni 2–21 (varianti a 0). `IDCG` = stessi termini sui voti ideali in ordine decrescente: 2 per ogni gruppo verificato con almeno una parola nel vocabolario, più i voti delle parole non verificate già votate nei primi 20 (`pooled`). Se `IDCG = 0`, `None`. Così il valore resta tra 0 e 1 anche per le segrete senza associazioni (precisazione della spec, che considerava solo le verificate).
- Accezione: quota di `sense_ok is True` tra le posizioni 2–11 non varianti con `sense_ok` noto.
- Umana: quota di `naturale` tra le posizioni 2–11 non varianti con verdetto umano diverso da `non_so`.

- [ ] **Step 1: Scrivi i test** su un caso a mano (segreta `cane`, gruppi `coda`/`scodinzolare` = 2351, `guinzaglio` = 4972):

```python
top = ['cani', 'gatto', 'guinzaglio', 'coda', 'scodinzolare', 'beach', 'osso', 'cuccia', 'fiuto', 'zampa',
       'collare'] + [f'x{i}' for i in range(9)]
# gold: coda e scodinzolare gruppo 2351; guinzaglio, osso, cuccia, fiuto, zampa, collare in gruppi distinti
# cani variante; gatto giudice 2; beach giudice 0; coda verificata; scodinzolare stesso gruppo -> 0
def test_precision_verified(self):
    self.assertAlmostEqual(precision_verified(slots), 6 / 9)   # guinzaglio coda osso cuccia fiuto zampa su 9
def test_precision_judged(self):
    self.assertAlmostEqual(precision_judged(slots), 7 / 9)     # + gatto
def test_precision_judged_none_when_unjudged(self):            # un x senza voto in 2-11 -> None
def test_ndcg_perfect_is_one(self):                            # tutte verificate in ordine -> 1.0
def test_ndcg_none_without_any_grade(self):
def test_human_overrides_gold(self):                           # coda 'non_naturale' -> grade 0
def test_bootstrap_deterministic(self):
    self.assertEqual(bootstrap([0.1, 0.5, 0.9]), bootstrap([0.1, 0.5, 0.9]))
```

- [ ] **Step 2:** PYTEST → FAIL. **Step 3:** implementa. **Step 4:** PYTEST → PASS.
- [ ] **Step 5: Commit** → `feat(zerocontext): voti e metriche della valutazione`

---

### Task 6: Giudice Qwen

**Files:**
- Create: `gioco-zerocontext/valutazione/judge.py`
- Test: `gioco-zerocontext/valutazione/test_judge.py`

**Interfaces:**
- Consumes: `Store.judge_verdict`, `Store.save_judge_verdicts` (Task 4); `Verdict` (Task 4)
- Produces:
  - `JUDGE_PROMPT_VERSION = "giudice-1"`; `judge_version() -> str` = `f"{JUDGE_PROMPT_VERSION}-{sha256(SYSTEM)[:12]}"`
  - `class Backend(Protocol): def ask(self, secret: str, gloss: str | None, words: list[str]) -> dict`
  - `class QwenBackend(Backend)`: riusa `config`, `ensure_server`, `chat` di `gioco-zeroassociations/script/qwen_associations.py` (aggiungendo quella cartella a `sys.path`); `temperature=0`, `seed=0`, `max_tokens=2048`; `close()` termina il processo se l'ha avviato lui
  - `class Judge(store: Store, backend: Backend, model: str)`; `Judge.grade(secret: str, gloss: str | None, words: list[str]) -> dict[str, Verdict] | None`: chiede solo le parole senza verdetto in cache; `None` se dopo due tentativi la risposta non è valida
  - `controls(judge: Judge, gold: Gold, vocab: list[str], ref: Reference, development: list[str], seed: int = 0, size: int = 50) -> dict`: `{"sensibilita": quota di verificate con voto ≥ 1, "specificita": quota di casuali con voto 0, "n": size}`; coppie casuali: parole del vocabolario in riferimento, non varianti e non verificate per quella segreta
  - `live_guard(server: str = "http://127.0.0.1:3001") -> None`: `GET {server}/api/context/evaluation/live` con timeout 3 s; connessione rifiutata → ritorna; `{"live": false}` → ritorna; `{"live": true}` → `SystemExit("Diretta in corso: la valutazione con Qwen non parte durante una live.")`; ogni altro errore → `SystemExit` con il motivo

Schema JSON della risposta:

```json
{"type":"object","additionalProperties":false,"required":["parole"],
 "properties":{"parole":{"type":"array","items":{"type":"object","additionalProperties":false,
   "required":["parola","voto","senso_giusto","motivo"],
   "properties":{"parola":{"type":"string"},"voto":{"type":"integer","enum":[0,1,2]},
                 "senso_giusto":{"type":["boolean","null"]},"motivo":{"type":"string","maxLength":160}}}}}}
```

Il messaggio di sistema (in italiano) dice: il gioco è ZeroContext; si giudica se ogni parola **rimanda alla segreta** per un giocatore comune; 2 = rimanda chiaramente (sinonimi, parti, azioni, oggetti, luoghi tipici, forme flesse comprese), 1 = collegamento debole, 0 = nessun collegamento o parola non italiana; `senso_giusto` solo se c'è la glossa, altrimenti `null`; categorie grammaticali diverse vanno bene.

- [ ] **Step 1: Scrivi i test** con un `FakeBackend` che conta le chiamate:

```python
def test_second_run_makes_no_request(self):
    judge.grade('cane', GLOSS, ['gatto', 'osso']); judge.grade('cane', GLOSS, ['gatto', 'osso'])
    self.assertEqual(fake.calls, 1)
def test_wrong_words_rejected_then_none(self):   # il fake risponde con 'tavolo' invece di 'osso', due volte
    self.assertIsNone(judge.grade('cane', GLOSS, ['gatto', 'osso']))
    self.assertIsNone(store.judge_verdict('cane', 'gatto', judge_version(), 'fake'))
def test_retry_once_then_ok(self):               # prima risposta malformata, seconda valida
def test_controls(self):                         # fake: 2 alle verificate, 0 alle altre -> 1.0 e 1.0
def test_live_guard(self):                       # server http finto su porta libera: live true -> SystemExit; porta chiusa -> ok
```

- [ ] **Step 2:** PYTEST → FAIL. **Step 3:** implementa. **Step 4:** PYTEST → PASS.
- [ ] **Step 5: Commit** → `feat(zerocontext): giudice Qwen locale con cache e controlli`

---

### Task 7: Comandi della valutazione

**Files:**
- Create: `gioco-zerocontext/valutazione/cli.py`, `gioco-zerocontext/script/evaluate_context_ranking.py`
- Test: `gioco-zerocontext/valutazione/test_cli.py`

**Interfaces:**
- Consumes: tutti i task precedenti.
- Produces: `main(argv: list[str] | None = None) -> int`, con i comandi:
  - `campione [--seme 20261119] [--blocco]`: alla prima chiamata 25 segrete di misura con associazioni + 25 senza (blocco 1); con `--blocco` aggiunge 13 + 12 nuove (blocco successivo). Seme registrato in `sample.seed`.
  - `valuta --profilo {original,abtt,pipeline_b} | --candidato NOME --vettori FILE --vocab FILE --dim N` `[--giudice {no,campione,misura}]` (predefinito `campione`):
    1. carica riferimento, associazioni e profilo; `open_run` o `start_run`;
    2. per ogni segreta di raw 2.0 presente nel vocabolario del profilo: `save_top` delle posizioni 2–21 (misura: tutte; sviluppo: solo quelle con associazioni, per i numeri verificati);
    3. se `--giudice` ≠ `no`: `live_guard`, poi `Judge.grade` sulle parole delle prime 20 senza voto umano né verificato (`campione`: solo le segrete del campione; `misura`: tutte quelle di misura), un salvataggio per segreta, e `controls` sulle segrete di sviluppo;
    4. `check_unchanged()` del riferimento: se cambia, `finish_run(annullata)` e uscita 2;
    5. calcolo delle metriche per segreta e per sottoinsieme (`split.subsets`), con `bootstrap`; copertura
       (`copertura_segrete_con_vettore`, `copertura_segrete_con_associazioni`, `copertura_associazioni_nel_vocabolario`,
       come quote con `n` = denominatore, sottoinsieme `tutte`); diagnostica: posizione mediana delle verificate e quote entro 10/100/1.000 (`ranking.rank_of`), quota «fuori riferimento» e varianti nelle prime 10, conteggi per categoria;
    6. `finish_run(completa)`, `vacuum()`, rapporto `paths.REPORTS / f"valutazione_{profilo}_{run_id}.json"` e `.csv` (una riga per metrica e sottoinsieme).
  - `ricalcola [--esecuzione ID]`: ripete i passi 5–6 sull'ultima esecuzione completa di ogni profilo (o su quella indicata), con i verdetti umani attuali, senza Qwen né vettori.
  - `parita --profilo P [--segrete 20]`: scrive `paths.REPORTS / f"parita_{P}.json"` con `{"profile": P, "secrets": [{"secret": parola, "top": [20 parole]}]}` per le prime N segrete di misura in ordine alfabetico.
- Codici d'uscita: 0 riuscita, 2 riferimento cambiato, 3 dati mancanti (con il comando da lanciare nel messaggio).

- [ ] **Step 1: Scrivi i test** con tutti i database finti dei task 2–4 e `FakeBackend`:

```python
def test_valuta_completes_and_writes_report(self):
    self.assertEqual(main(['valuta', '--profilo', 'original', '--giudice', 'campione', *FAKE_PATHS]), 0)
    self.assertEqual(store_runs_status(), ['completa'])
def test_interrupted_run_resumes_without_rejudging(self):   # FakeBackend solleva KeyboardInterrupt alla 2ª segreta
    with self.assertRaises(KeyboardInterrupt): main([...])
    self.assertEqual(store_runs_status(), ['in_corso'])
    main([...]); self.assertEqual(store_runs_status(), ['completa']); self.assertEqual(fake.calls, TOTAL_SECRETS)
def test_reference_change_cancels(self):                    # raw 2.0 modificato tra caricamento e fine -> uscita 2, 'annullata'
def test_ricalcola_uses_new_human_verdicts(self):
def test_campione_is_stable_and_blocks_grow(self):          # 50 poi 75; i primi 50 invariati
def test_missing_morphit_exit_3(self):
```

- [ ] **Step 2:** PYTEST → FAIL. **Step 3:** implementa (`--percorsi` opzionali per sostituire i file di `paths` nei test). **Step 4:** PYTEST → PASS.
- [ ] **Step 5: Commit** → `feat(zerocontext): comandi campione, valuta, ricalcola e parita`

---

### Task 8: Rotte del server

**Files:**
- Create: `packages/shared/src/contextEvaluation.ts`, `apps/server/src/context-evaluation.ts`
- Modify: `packages/shared/src/index.ts` (export), `apps/server/src/index.ts` (import e una riga di registrazione dopo le rotte `/api/context/profiles`)
- Test: `tests/context-evaluation.test.ts`

**Interfaces:**
- Consumes: lo schema del Task 4 (sola lettura, tranne `human_verdicts` e `words`).
- Produces, in `@zerocade/shared`:
  - `type HumanVerdict = 'naturale' | 'non_naturale' | 'non_so'`
  - `interface EvaluationMetric { metric: string; subset: string; value: number | null; low: number | null; high: number | null; n: number }`
  - `interface EvaluationRun { id: number; profile: string; createdAt: string; finishedAt: string | null; judgeVersion: string | null; metrics: EvaluationMetric[] }`
  - `interface EvaluationSampleWord { position: number; word: string; verified: boolean; variant: boolean; judge: { grade: 0 | 1 | 2; senseOk: boolean | null; reason: string } | null; human: HumanVerdict | null }`
  - `interface EvaluationSampleSecret { secret: string; block: number; hasGold: boolean; words: EvaluationSampleWord[] }`
  - `interface EvaluationSample { runId: number; profile: string; secrets: EvaluationSampleSecret[]; humanAfterRun: number }`
- In `apps/server/src/context-evaluation.ts`:
  - `export const evaluationFile: string | undefined` (`ZEROCADE_EVALUATION_FILE`, poi `database/ZeroContext_Valutazione.sqlite3` se esiste)
  - `export function registerContextEvaluationRoutes(app: FastifyInstance, opts: { file?: string; live: () => boolean }): void`
  - Rotte:
    - `GET /api/context/evaluation/live` → `{ live: boolean }`
    - `GET /api/context/evaluation/runs` → `EvaluationRun[]`, solo stato `completa`, la più recente per profilo
    - `GET /api/context/evaluation/sample?profile=original` → `EvaluationSample` dall'ultima esecuzione completa del profilo (prime 10 di ogni segreta del campione)
    - `POST /api/context/evaluation/verdict` corpo `{ secret: string; word: string; verdict: HumanVerdict }`, `bodyLimit: 1024` → 204
  - Senza file: 404 `{ error: 'Nessuna valutazione: lancia python gioco-zerocontext/script/evaluate_context_ranking.py campione e poi valuta.' }`
  - `POST` con coppia non presente in `v_sample_top` o `verdict` non previsto → 400, nessuna scrittura
- In `index.ts`, `live` = una stanza di `sources` ha `live().length > 0`.

`verified` e `variant` arrivano già calcolati da `run_top` (Task 4 e 7): il server non ricalcola nulla.

- [ ] **Step 1: Scrivi i test Node** con un database creato nel test dallo schema in `tests/fixtures/context-evaluation-schema.sql`, generato una volta con `python -c "from valutazione.store import Store; print(Store.ddl())"` (dalla cartella `gioco-zerocontext`). Un test Python in `test_store.py` controlla che il file coincida con `Store.ddl()`, così i due lati non divergono:

```ts
test('senza database: 404 con il comando da lanciare', ...)
test('runs mostra solo le esecuzioni complete', ...)
test('sample: prime 10 con verdetti umani e del giudice', ...)
test('verdict salva e sovrascrive', ...)
test('verdict fuori campione o valore errato: 400 e niente scritto', ...)
test('live riflette le sorgenti', ...)
```

- [ ] **Step 2:** `node --import tsx --test tests/context-evaluation.test.ts` → FAIL.
- [ ] **Step 3:** Implementa il modulo, i tipi condivisi e `Store.ddl()`; collega in `index.ts`.
- [ ] **Step 4:** test Node → PASS; `npm run typecheck` → nessun errore; PYTEST → PASS.
- [ ] **Step 5: Commit** dei soli file nuovi e di `packages/shared/src/index.ts`; `index.ts` solo se non contiene modifiche altrui → `feat(server): rotte della valutazione di ZeroContext`

---

### Task 9: Pagina «Qualità posizioni»

**Files:**
- Create: `apps/dashboard/src/pages/ContextQualityPage.tsx`
- Modify: `apps/dashboard/src/App.tsx` (rotta `/qualita`), `apps/dashboard/src/components/LeftRail.tsx` (voce «Qualità posizioni»), `apps/dashboard/src/styles.css`

**Interfaces:**
- Consumes: le rotte e i tipi del Task 8.
- Produces: `export function ContextQualityPage(): JSX.Element`

Contenuto (vedi lo schizzo nella spec, sezione 8):

- **Confronto:** una riga per profilo con P@10 verificata, P@10 giudicata, nDCG@20, umana, accezione, numero di segrete; sottoinsieme scelto da un menu (`misura:tutte` predefinito, poi `con_associazioni`, `senza_associazioni`, `ordinaria`, `deroga`, `aggiunta`); ogni numero con l'intervallo al passaggio del mouse e in un `title`.
- **Revisione:** menu del profilo, avanzamento «N / 50 segrete», «Verdetti nuovi dopo il calcolo: N» con il comando `python gioco-zerocontext/script/evaluate_context_ranking.py ricalcola`; per ogni segreta la glossa (se c'è), le prime 10 con posizione, etichetta «verificata» o «variante», voto e motivo di Qwen, tre pulsanti `naturale` / `non naturale` / `non so`; riga evidenziata se Qwen (voto ≥ 1 contro `non_naturale`, o 0 contro `naturale`) non è d'accordo.
- `fetch` con `AbortController` e timeout di 10 s; in caso di 404 il messaggio del server al posto della pagina.

- [ ] **Step 1:** Implementa pagina, rotta e voce di menu.
- [ ] **Step 2:** `npm run typecheck` e `npm run build` → nessun errore.
- [ ] **Step 3:** Con `ZEROCADE_DB` e `ZEROCADE_EVALUATION_FILE` temporanei (il secondo prodotto da `valuta` sui dati finti del Task 7), avvia `npm run dev` e controlla `/qualita` con la skill `browser-automation`: nessun errore in console, un verdetto inviato compare dopo il ricaricamento, screenshot guardato. Ripeti senza `ZEROCADE_EVALUATION_FILE`: compare il messaggio del 404.
- [ ] **Step 4: Commit** → `feat(dashboard): pagina Qualità posizioni di ZeroContext`

---

### Task 10: Prova sui dati veri e documentazione

**Files:**
- Create: `scripts/context-evaluation-parity.ts`
- Modify: `gioco-zerocontext/README.md` (sezione «Qualità delle posizioni»), `docs/STATO_DOCUMENTAZIONE.md` (riga del nuovo documento)

**Interfaces:**
- Consumes: `parita` (Task 7); `serverCorpus`, `rankAgainst` del server.
- Produces: `node --import tsx scripts/context-evaluation-parity.ts gioco-zerocontext/reports/parita_original.json` → stampa `parità: 20/20 segrete identiche` oppure le differenze; uscita 1 se una differenza riguarda parole con similarità che differisce più di `1e-6`.

- [ ] **Step 1:** Implementa lo script di confronto.
- [ ] **Step 2:** Lancia `parita` e il confronto per `original`, `abtt` e (se l'export esiste) `pipeline_b` → `20/20` per ciascuno.
- [ ] **Step 3:** Con il server di Zerocade spento: `campione`, poi `valuta --profilo original --giudice no` e `valuta --profilo abtt --giudice no` → uscita 0; P@10 verificata di `original` maggiore di quella di `abtt` su `misura:con_associazioni` (coerente con le prove a mano della spec; se non lo è, fermarsi e capire prima di proseguire).
- [ ] **Step 4:** Scrivi la sezione del README: cosa misura, comandi, dove sono i risultati, regola di divisione, che il giudice non gira durante una live, e il rimando alla spec.
- [ ] **Step 5:** Suite completa: PYTEST, `node --import tsx --test tests/*.test.ts`, `npm run typecheck` → tutto verde.
- [ ] **Step 6: Commit** → `docs(zerocontext): valutazione delle posizioni, parità sui profili veri`

L'esecuzione con Qwen (`valuta --giudice campione`) e la prima revisione nella pagina le fa Luca: richiedono la GPU libera e il suo giudizio.

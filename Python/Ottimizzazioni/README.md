# ZeroContext — Ottimizzazioni BGE-M3 Italian (Python)

Questo pacchetto fornisce **uno script per ogni tecnica** suggerita per il modello [`albertobarnabo/bge-m3-italian`](https://huggingface.co/albertobarnabo/bge-m3-italian), più i moduli condivisi, un valutatore Spearman per STS e test locali.

## File inclusi

| File | Tecnica | Scarica un modello? | Input principale |
|---|---|---|---|
| `01_abtt_bge.py` | All-But-The-Top | No | Matrice BGE già generata |
| `02_whitening_pca_bge.py` | PCA + whitening parziale | No | Matrice BGE già generata |
| `03_ensemble_bge_eurodense.py` | Fusione BGE + EuroDense | No | Entrambe le matrici |
| `04_prompt_context_bge.py` | Prompt contestuali e definizioni | **Sì, BGE**, se non in cache | Indice parole della matrice BGE |
| `05_finetune_cosent_bge.py` | Fine-tuning LoRA + CoSENT | **Sì, BGE** | Coppie supervisionate reali |
| `06_finetune_angle_bge.py` | Fine-tuning LoRA + AnglE | **Sì, BGE** | Coppie supervisionate reali |
| `07_valuta_spearman_sts.py` | Misurazione Spearman su frasi | Sì, uno o due modelli | Benchmark STS italiano |
| `zc_bge_common.py` | Lettura embeddings/indici, controlli e scoring | No | Modulo interno |
| `zc_bge_finetune_common.py` | Training, verifiche split e LoRA | All'avvio del training | Modulo interno |
| `_test_local.py` | Test di compatibilità offline | No | Dati sintetici temporanei |
| `prepara_dati_training.py` | STS-B italiano train/dev, separato da STS22 test | Dataset pubblici | `--out` |
| `rigenera_banca_lora.py` | Rigenerazione completa con adapter addestrato | Base BGE se assente | `--model`, `--input`, `--out` |
| `valuta_mteb_banca.py` | MTEB STS22.v2 italiano con protocollo della banca | Dataset se assente | Matrice e indice |
| `ripristina_checkpoint_lora.py` | Recupero verificato di checkpoint dopo errore di reload PEFT | Base BGE se assente | Cartella di training concluso |

## 1. Preparazione

1. Estrai tutto il pacchetto in una cartella (per esempio `C:\\ZeroContext`).
2. Assicurati che esista `giochi.sqlite3` e che gli script già forniti per l'estrazione abbiano generato entrambe le matrici.
3. Posizionati nella cartella che contiene `outputs/` e avvia gli script, ad esempio `py BGE_M3_Italian_Ottimizzazioni/01_abtt_bge.py`.

Struttura attesa:

```text
giochi.sqlite3
outputs/
  bge_m3_italian/
    embeddings.npy
    vocab_index.csv
    manifest.json
  eurodense_435m/
    embeddings.npy
    vocab_index.csv
    manifest.json
BGE_M3_Italian_Ottimizzazioni/
  01_abtt_bge.py
  ...
```

`vocab_index.csv` deve contenere `matrix_index` e `word` ed essere allineato alle righe di `embeddings.npy`. Gli script precedenti leggono **`context__vocab`** e **`context__secrets`** in sola lettura: gli strumenti di questo pacchetto lavorano soltanto sui file `.npy` e `.csv`, senza modificare SQLite.

Se devi ancora generare la baseline:

```powershell
py zerocontext_bge_m3_italian.py --db giochi.sqlite3
py zerocontext_eurodense.py --db giochi.sqlite3
```

## 2. Installazione

Consigliato Python 3.11/3.12 e un ambiente virtuale.

```powershell
py -m pip install -U numpy scipy scikit-learn
py -m pip install -U sentence-transformers transformers accelerate datasets peft
```

Installa PyTorch con CUDA seguendo il selettore ufficiale [PyTorch](https://pytorch.org/get-started/locally/) se vuoi usare la RTX 5070. Verifica:

```powershell
py -c "import torch; print(torch.cuda.is_available())"
```

I primi tre script **non richiedono PyTorch né Internet**, purché gli embeddings siano già stati generati. Gli altri scaricano i modelli dalla cache Hugging Face al primo utilizzo.

## 3. Comandi (dalla cartella ZeroContext)

### ABTT

```powershell
py BGE_M3_Italian_Ottimizzazioni/01_abtt_bge.py --remove 3 --fit-samples 30000 --target mare
```

Prova separatamente `--remove 0`, `1`, `2`, `3`, `5` usando `--out` differenti. Zero componenti rimosse significa **centratura**, non matrice BGE originale. Il parametro `--fit-samples 0` usa l'intera matrice; il default usa 30.000 parole campionate con seed deterministico.

### PCA + whitening

```powershell
py BGE_M3_Italian_Ottimizzazioni/02_whitening_pca_bge.py --dims 512 --alpha 0.5 --target mare
```

Confronta `--alpha 1` (sola PCA), `--alpha 0.5` (parziale), `--alpha 0` (completo), e dimensionalità `256`, `512`, `768`. Il clipping della varianza è controllato da `--floor-ratio`.

### Ensemble BGE + EuroDense

```powershell
py BGE_M3_Italian_Ottimizzazioni/03_ensemble_bge_eurodense.py --weight-bge 0.6 --target mare
```

La concatenazione pesata `sqrt(w)*BGE || sqrt(1-w)*EuroDense` produce **esattamente** una similarità coseno `w*cos_BGE+(1-w)*cos_EuroDense` (a normalizzazione unitaria). **Non riduce automaticamente le dimensioni**: la matrice di ensemble può essere grande. Dopo il test puoi comprimere la matrice concatenata con `02_whitening_pca_bge.py --input outputs/ensemble_... --dims 512 ...`, ma questa compressione *non mantiene esattamente* il coseno pesato e richiede validazione.

### Prompt contestuali

```powershell
py BGE_M3_Italian_Ottimizzazioni/04_prompt_context_bge.py --mode multi --batch-size 8 --target mare
```

Modalità: `bare`, `lemma`, `neutral`, `multi`, `definitions`. La modalità `multi` media tre embeddings normalizzati di prompt neutri. La modalità `definitions` richiede un CSV reale:

```csv
word,definition
```

Esempio di utilizzo:

```powershell
py BGE_M3_Italian_Ottimizzazioni/04_prompt_context_bge.py --mode definitions --definitions-csv definizioni.csv --missing-definition bare
```

**Importante:** per `definitions`, parole con significati multipli possono richiedere un'accezione esplicita; le definizioni devono essere verificate e non inventate automaticamente. Con il fallback `bare` gli embeddings di termini senza definizione non sono equivalenti agli embeddings con definizione.

### Fine-tuning LoRA CoSENT / AnglE

Occorre un dataset italiano annotato con giudizi umani. Ogni CSV include:

```csv
sentence1,sentence2,score
```

`score` è in `[0, 5]` per impostazione predefinita; può essere modificato con `--score-max`. In assenza di dataset supervisionato, **non avviare il training con dati sintetici casuali**.

```powershell
py BGE_M3_Italian_Ottimizzazioni/05_finetune_cosent_bge.py --train-csv train.csv --dev-csv dev.csv --test-csv test.csv --batch-size 4 --accumulation 4
py BGE_M3_Italian_Ottimizzazioni/06_finetune_angle_bge.py --train-csv train.csv --dev-csv dev.csv --test-csv test.csv --batch-size 4 --accumulation 4
```

I due script registrano la qualità sul dev prima/dopo training e il test finale separato; riconoscono se una stessa coppia compare in più split (anche con ordine invertito), e interrompono l'esecuzione. Il modello usa LoRA sugli strati `query` e `value`, con limite sequenza iniziale 128; la fattibilità pratica dipende da driver, versione PyTorch e VRAM disponibile. Su 12 GB, se appare `CUDA out of memory`, riduci `--batch-size` a 2 e `--max-seq-length` a 64.

Dopo fine-tuning occorre **rigenerare gli embeddings delle 90.000 parole con il modello adattato**, altrimenti ZeroContext continuerà a utilizzare la matrice vecchia. Per distribuire un adapter LoRA bisogna mantenere la provenienza del modello base.

## 4. Spearman: due benchmark distinti

**Lessicale** (singole parole): aggiungi `--pairs-csv pairs_lexical_test.csv` a uno dei primi tre script. Formato:

```csv
word1,word2,score
```

Le parole devono essere presenti in `vocab_index.csv`; una coppia esclusa non contribuisce al risultato. Il CSV deve essere annotato da persone: non viene creato artificialmente dal pacchetto.

**STS italiano** (coppie di frasi): usa lo script `07_valuta_spearman_sts.py`, con CSV `sentence1,sentence2,score`:

```powershell
py BGE_M3_Italian_Ottimizzazioni/07_valuta_spearman_sts.py --csv sts_test.csv --mode raw
py BGE_M3_Italian_Ottimizzazioni/07_valuta_spearman_sts.py --csv sts_test.csv --mode abtt --transform outputs/bge_abtt_remove_3/transform.npz
py BGE_M3_Italian_Ottimizzazioni/07_valuta_spearman_sts.py --csv sts_test.csv --mode pca --transform outputs/bge_whitening_512d_alpha_0.5/transform.npz
py BGE_M3_Italian_Ottimizzazioni/07_valuta_spearman_sts.py --csv sts_test.csv --mode ensemble --weight-bge 0.6
```

**Non mescolare i risultati:** lo Spearman lessicale e quello STS su frasi misurano attività diverse. La trasformazione ABTT/PCA viene stimata **sul vocabolario**, non sui dati di test: questo evita fitting diretto sulle etichette della prova. Se esplori molti parametri, tieni distinto il test finale dal dev usato per la scelta.

## 5. Output e sicurezza

Le varianti numeriche producono cartelle separate sotto `outputs/`, contenenti:

```text
embeddings.npy
vocab_index.csv
manifest.json
transform.npz    # ABTT/PCA
```

**Non vengono sovrascritti** gli embeddings originali, e nessuno script modifica il database. La matrice BGE originale a 1.024d per 90.000 parole richiede circa 368,64 MB (Float32). Le nuove matrici possono richiedere maggiore spazio temporaneo e memoria CPU. I prompt fanno inferenza GPU/CPU a lotti e possono richiedere molto più tempo.

## 6. Ordine suggerito per ZeroContext

1. Misura baseline BGE con coppie italiane realmente annotate.
2. Prova ABTT su `remove=1,2,3,5`.
3. Prova PCA 256/512/768 e whitening `alpha=1,0.5,0`.
4. Prova ensemble `weight-bge=0.25,0.5,0.75`.
5. Prova prompt e, solo con un set affidabile, CoSENT/AnglE.
6. Congela il test finale, valida le classifiche dei round, poi scegli la variante. Nessun miglioramento Spearman è garantito.

## Esecuzione nel repository ZeroCade

Questi comandi si eseguono dalla radice del repository e usano l'ambiente
`Python/.venv-dense`, con PyTorch CUDA già installato. Le dipendenze aggiuntive
per il training sono fissate in `requirements-lora.txt`.

```powershell
$py = ".\Python\.venv-dense\Scripts\python.exe"
$run = "Python/outputs/ottimizzazioni/nuovo-esperimento"
& $py -m pip install -r Python/Ottimizzazioni/requirements-lora.txt
& $py Python/Ottimizzazioni/prepara_dati_training.py --out "$run/data"
& $py Python/Ottimizzazioni/05_finetune_cosent_bge.py --train-csv "$run/data/train.csv" --dev-csv "$run/data/dev.csv" --out "$run/05_cosent_model" --device cuda
& $py Python/Ottimizzazioni/rigenera_banca_lora.py --model "$run/05_cosent_model/best_model" --input Python/outputs/bge_m3_italian --out "$run/05_cosent"
& $py Python/Ottimizzazioni/valuta_mteb_banca.py --input "$run/05_cosent" --name 05_cosent --out "$run/mteb/05_cosent"
```

Per AnglE usare `06_finetune_angle_bge.py`, con cartelle separate. Entrambi i
training partono dalla stessa revisione BGE, senza concatenare i due adapter.
La selezione del checkpoint usa soltanto lo Spearman sul dev. Il CSV STS22
non viene passato al training.

Il dataset pubblico scelto è [STS-B multi-MT, configurazione italiana](https://huggingface.co/datasets/PhilipMay/stsb_multi_mt):
i testi italiani sono **traduzioni automatiche**, con giudizi umani ereditati
dalle frasi inglesi originali. Non sono annotazioni umane raccolte direttamente
in italiano. La preparazione elimina coppie duplicate/invertite e sovrapposizioni
testuali tra train, dev e STS22 test, normalizzando Unicode, maiuscole e spazi.
Revisioni, conteggi e SHA-256 dei CSV sono registrati in `data/provenance.json`.
Questa separazione riguarda il fine-tuning eseguito qui e non certifica quali
dati abbia visto il modello di base durante il suo addestramento originario.

`rigenera_banca_lora.py` verifica che l'adapter salvato sia attivo e che disabilitarlo
modifichi effettivamente i vettori. Mantiene parole, ruoli e indici SQLite della
banca iniziale. Codifica le singole parole senza prompt, con limite 64 token come
la banca BGE di partenza.

Con Transformers 5.3 e PEFT 0.18.1 il caricamento automatico degli adapter XLM-R
non rimuove correttamente il prefisso dei pesi salvati. I moduli di training e
rigenerazione usano quindi una conversione esplicita dei nomi, verificando
corrispondenza completa, forme e copia esatta di tutti i tensori LoRA. Per
recuperare un training già concluso prima della correzione si può usare
`ripristina_checkpoint_lora.py --training-dir <cartella-training>`: ricarica il
checkpoint selezionato sul dev, ne verifica la metrica e salva un modello separato
in `best_model_verified`, conservando l'esportazione precedente.

Il confronto delle banche usa **MTEB STS22.v2, italiano, test: 407 coppie** con
protocollo `wordmean-full-v1`: media dei vettori delle parole note di ciascuna
frase e normalizzazione L2. Tutti i confronti mantengono lo stesso vocabolario
e la stessa copertura. Il valore riportato è **cosine Spearman × 100**, non la
media dell'intera suite MTEB. I risultati e gli hash sono in `mteb/*/score.json`.
Lo script 07 valuta invece direttamente le frasi con l'encoder contestuale;
questo risultato viene riportato separatamente.

## Risultati dell'esecuzione 16 novembre 2026

Completati in ordine gli script 01–07, valutando ogni banca prima del successivo.
STS22.v2 italiano, 407 coppie test, `wordmean-full-v1`, Spearman × 100:

| Variante | Score |
|---|---:|
| BGE di partenza | 64,39 |
| Associazioni originali | 64,77 |
| 01 ABTT | 67,02 |
| 02 PCA + whitening | 66,99 |
| 03 Ensemble BGE/EuroDense | 64,17 |
| 04 Multi-prompt | 64,44 |
| 05 CoSENT | 66,07 |
| 06 AnglE | 65,88 |

Lo script 07, con l'encoder sulle frasi intere e limite 512 token, ottiene
**79,8442**, confermato da MTEB ufficiale. Questo valore usa un protocollo distinto.
Tutte le banche mantengono **93.928 parole e 9.513 segrete**. Il database del
gioco conserva lo stesso SHA-256 iniziale.

[Report completo, parametri, limiti e verifiche](../outputs/ottimizzazioni/20261116T180046259370Z/RISULTATI.md).
I risultati riguardano un singolo task STS, non la media dell'intera suite MTEB.

## Fonti tecniche

- [BGE-M3 Italian — scheda del modello](https://huggingface.co/albertobarnabo/bge-m3-italian)
- [EuroDense-435M — scheda del modello](https://huggingface.co/OPI-PIB/EuroDense-435M)
- [Sentence Transformers — CoSENT/AnglE](https://www.sbert.net/docs/package_reference/sentence_transformer/losses.html)
- [Sentence Transformers — fine-tuning PEFT](https://www.sbert.net/examples/sentence_transformer/training/peft/README.html)
- [Sentence Transformers — evaluator Spearman](https://sbert.net/docs/package_reference/sentence_transformer/evaluation.html)

# Vettori e valutazione di ZeroContext

Stato corrente: **originale e ABTT** sono integrati nello stesso DB e
selezionabili nella regia senza riavviare il server a ogni cambio.
Vedi [PROFILI_ASSOCIAZIONI.md](../gioco-zerocontext/PROFILI_ASSOCIAZIONI.md) e
`importa_abtt_zerocontext.py`. TurboX e Harrier sono stati rimossi dal DB e dalla
regia; le sezioni seguenti conservano la documentazione storica dei generatori,
delle importazioni precedenti e dei relativi benchmark.

Importazione attuale: `Python/.venv-dense/Scripts/python.exe -B -X utf8
Python/importa_abtt_zerocontext.py --source
Python/outputs/ottimizzazioni/20261116T180046259370Z/01_abtt` dalla radice del repository.
La procedura crea un backup, importa `context_abtt`, ritira i due profili precedenti
e verifica che le altre tabelle restino identiche. Sono conservate **93.928 parole
e 9.513 segrete**. ABTT usa la matrice float32 esatta a 1.024 dimensioni, score
STS22 italiano **67,02**, contro **64,77** dell'originale.

I task VS Code `Python: ZeroContext TurboX` e `Python: ZeroContext Harrier M2V`
eseguono rispettivamente `zerocontext_turbox.py` e `zerocontext_harrier_m2v.py`.
Leggono `database/giochi.sqlite3` senza modificarlo e producono, nelle cartelle
`outputs/turbox` e `outputs/harrier_m2v`:

- `vocab_index.csv`: ordine delle parole e appartenenza a vocabolario/segrete;
- `embeddings.npy`: matrice float32 normalizzata, una riga per parola;
- `manifest.json`: modello, dimensioni, conteggi e impronta dell'inventario.

Il CSV corrisponde alle tabelle `context__vocab` e `context__secrets`. La matrice
non sostituisce una tabella: il runtime legge un file binario esterno, indicato
da `context__meta`. Per cambiare modello occorre pubblicare insieme indice,
segrete, metadati e vettori nello stesso ordine, dopo i controlli di qualità.

## Confronto delle tre banche del gioco: STS22 italiano

Il 16 novembre 2026 sono state valutate anche le **associazioni originali**, usando
direttamente la matrice del profilo `context_original`. Il protocollo comune
`wordmean-full-v1` è stato applicato a tutte e tre le matrici del gioco:

| Profilo del gioco | Spearman | Spearman × 100 |
| --- | ---: | ---: |
| Originale: FastText + retrofitting | 0,6476763309 | **64,7676** |
| TurboX | 0,5522544481 | **55,2254** |
| Harrier | 0,5636522554 | **56,3652** |

Task ufficiale **STS22.v2**, solo `it/test`, **407 coppie**, MTEB 2.27.14 e dataset
alla revisione `d31f33a128469b20e357535c39b82fb3c3f6f2bd`.
Questi sono punteggi di un singolo task, non la media complessiva MTEB.

L'originale non dispone di un encoder di frasi. Per valutare le tre banche con
lo stesso procedimento si normalizza ogni testo NFC/casefold, si estraggono le
sequenze alfabetiche Unicode e si calcola la media uniforme dei vettori delle
parole presenti nel vocabolario, contando le ripetizioni. Si usano i testi interi,
senza troncamento, stopword list, pesi appresi o parametri scelti sul test.
La media viene normalizzata L2; i token fuori vocabolario sono ignorati.

Per tutti i profili sono coperti **175.490 token su 241.637 (72,63%)**, nei 814
testi delle coppie; nessun testo produce un vettore nullo e nessuna coppia viene
esclusa. Il ricalcolo di Spearman dalle predizioni coincide con il risultato MTEB.
Il DB è stato aperto in sola lettura e il suo SHA256 è rimasto invariato.

```powershell
./Python/.venv-mteb/Scripts/python.exe -B -X utf8 Python/valuta_mteb_profili.py
```

Risultati completi, SHA256 degli artefatti e copertura:
`outputs/mteb_profili/summary.json`. I file `original.json`, `turbox.json`,
`harrier.json` conservano i risultati MTEB; `*_predictions.json` contiene ID,
giudizi di similarità e coseni per le 407 coppie, senza ricopiare i testi.

**Il protocollo comune valuta le matrici del gioco con un adattatore testuale.**
I punteggi non sono direttamente confrontabili con quelli dei modelli completi
riportati sotto: quei modelli usano il proprio tokenizer, un vocabolario diverso
e il limite di sequenza predefinito. Il risultato qui più alto dell'originale
riguarda questo task e questo protocollo, senza certificare tutti gli usi possibili.

## BGE-M3 italiano ed EuroDense: generazione e due valutazioni distinte

Eseguito `zerocontext_bge_m3_italian.py` su **93.928 parole e 9.513 segrete**.
Output: `outputs/bge_m3_italian/embeddings.npy`, indice CSV e manifest;
matrice float32 **93.928 × 1.024**, righe L2 unitarie, zero vettori invalidi.
Modello `albertobarnabo/bge-m3-italian`, revisione
`f38acb8fc0bb15c910da5b44f0c93eb1c7df3b1f`, generazione su CUDA/RTX 5070,
senza prefisso e con massimo 64 token per la codifica delle singole parole.

| Valutazione STS22.v2 italiano, 407 coppie | Spearman × 100 | Interpretazione |
| --- | ---: | --- |
| Banca BGE-M3, `wordmean-full-v1` | **64,39** | Media dei vettori delle parole del gioco; confrontabile con 64,77 delle originali |
| Encoder contestuale BGE-M3, massimo 512 token | **79,84** | Ogni testo viene codificato dal Transformer completo; nessun prefisso |
| Banca EuroDense, `wordmean-full-v1` | **63,77** | Stesso metodo e vocabolario delle altre banche |
| Encoder contestuale EuroDense, massimo 512 token | **78,18** | Transformer completo, prefisso s2s applicato a entrambi i testi |

**79,84 non è una percentuale di risposte corrette:** è una correlazione di
Spearman di circa 0,7984 moltiplicata per 100. Indica concordanza nell'ordinamento
delle similarità rispetto ai giudizi umani. Il punteggio riguarda questo task,
non il benchmark MTEB complessivo. I due metodi della tabella non vanno confusi:
il gioco conserva un vettore per parola, mentre l'encoder contestuale elabora
l'intero testo fino al limite dichiarato.

Risultati ufficiali MTEB, manifest e SHA256 degli output:
`outputs/mteb_italiani/summary.json`, `bge-m3-italian_wordmean.json` e
`bge-m3-italian_native512.json`. Controlli della matrice e sonde di vicinanza:
`outputs/bge_m3_italian/validation.json`. Il DB è rimasto invariato e i vettori
BGE-M3 a 1.024 dimensioni non sono stati attivati nei profili del gioco.

EuroDense è stato successivamente ripreso e completato su richiesta dell'utente:
modello `OPI-PIB/EuroDense-435M`, revisione
`f85d99364d912ea5512dc9b629b27802b7caf564`. In `outputs/eurodense_435m` sono
salvati **93.928 vettori float32 a 1.024 dimensioni**, indice e manifest, con
tutte le 9.513 segrete e zero vettori invalidi. La generazione usa massimo
64 token e il prefisso `Instruct: Retrieve semantically similar text.\nQuery: `.
Il benchmark contestuale usa lo stesso prefisso su entrambi i testi, con
limite totale di 512 token. Il benchmark della banca conserva invece il
protocollo comune con media dei vettori sui testi interi.

I risultati EuroDense sono `outputs/mteb_italiani/eurodense_wordmean.json` e
`eurodense_native512.json`; `summary.json` conserva anche i risultati BGE-M3
precedenti, verificati invariati. I controlli della matrice sono in
`outputs/eurodense_435m/validation.json`. Il DB del gioco è rimasto invariato
anche durante questa esecuzione: nessuna matrice EuroDense è stata attivata.

L'ambiente dedicato è `Python/.venv-dense`: PyTorch **2.14.1+cu130**,
Transformers **5.3.0**, Sentence Transformers **6.3.0**, MTEB **2.27.14**.
Si prepara installando prima PyTorch dal canale ufficiale CUDA, poi
`requirements-dense.txt`. L'ambiente MTEB precedente resta separato.

```powershell
./Python/.venv-dense/Scripts/python.exe -m pip install torch==2.14.1 --index-url https://download.pytorch.org/whl/cu130
./Python/.venv-dense/Scripts/python.exe -m pip install -r Python/requirements-dense.txt
./Python/.venv-dense/Scripts/python.exe -B -X utf8 Python/zerocontext_bge_m3_italian.py --db database/giochi.sqlite3 --output-root Python/outputs --vocab-column word --secrets-column word --device cuda --batch-size 64 --max-seq-length 64
./Python/.venv-dense/Scripts/python.exe -B -X utf8 Python/valuta_mteb_italiani.py --models bge-m3-italian --device cuda --batch-size 8 --max-length 512
```

Per EuroDense usare `zerocontext_eurodense.py` con gli stessi argomenti di
generazione e `valuta_mteb_italiani.py --models eurodense --device cuda
--batch-size 8 --max-length 512`. I risultati delle due esecuzioni compatibili
sono conservati nello stesso riepilogo.

Il modulo comune ora fissa le revisioni dei modelli. Per il codice personalizzato
EuroDense sono verificati gli SHA256 dei due file esaminati e viene selezionata
l'attenzione con padding, senza richiedere xformers; un adattatore locale rende
compatibile la maschera di attenzione con Transformers 5. Il salvataggio JSON
ritenta i brevi blocchi dei file su Windows e la ripresa libera il riferimento
alla memmap prima di rinominare il file finale.

## Risultati dei modelli completi misurati il 16 novembre 2026

Valutazione ufficiale MTEB **2.27.14**, task **STS22.v2**, sottoinsieme `it`,
split `test`: **407 coppie**. La metrica principale è `cosine_spearman`.
La colonna su 100 moltiplica la correlazione per 100; non è una percentuale
di risposte corrette e non è il punteggio aggregato della classifica MTEB.

| Modello statico usato dagli script | Spearman | Scala su 100 |
| --- | ---: | ---: |
| C10X/Qwen3-Embedding-TurboX | 0,5078463391 | 50,7846 |
| rahulydc/harrier-m2v | 0,5588265246 | 55,8827 |

Dataset: [mteb/sts22-crosslingual-sts](https://huggingface.co/datasets/mteb/sts22-crosslingual-sts),
revisione `d31f33a128469b20e357535c39b82fb3c3f6f2bd`.
Il riepilogo `outputs/mteb/summary.json` registra anche revisioni dei modelli,
SHA256 dei pesi/tokenizer/configurazione, versioni software e metriche complete.
`outputs/mteb/turbox.json` e `harrier_m2v.json` conservano i risultati MTEB.
Il benchmark usa i modelli completi per codificare testi; non valuta direttamente
la sola matrice di parole del gioco. Le 93.928 righe di ciascuna matrice esportata
sono state confrontate con l'encoder della revisione valutata: differenza massima 0.

STS22 valuta similarità tra testi: serve anche verificare le associazioni fra
singole parole richieste dal gioco. Entrambe le nuove matrici falliscono i
controlli presenti in `tests/context.test.ts`. Per esempio, nella graduatoria
di `spiaggia`, `mare` è al posto 59.767 con TurboX e 81.948 con Harrier
(posizioni visualizzate da 1, inclusa la parola stessa); il gioco richiede
`mare` e `sabbia` fra i primi 29 vicini.

Successivamente, su richiesta esplicita dell'utente, **Harrier è stato importato**
nel DB e nel file vettoriale attivo: 256 dimensioni float32, 96.182.272 byte.
I round speciali restano sospesi e tutte le 9.513 segrete sono conservate.
I controlli strutturali passano; resta fallito il test semantico del corpus
(`tests/context.test.ts`: 15 passati, 1 fallito). L'importazione non corregge
le associazioni indicate sopra e non viene presentata come un collaudo semantico superato.

## Importare anche i vettori Harrier

```powershell
./gioco-zerocontext/.venv-vectors/Scripts/python.exe -B -X utf8 Python/importa_vettori_zerocontext.py --source Python/outputs/harrier_m2v
```

Lo script prepara un candidato verificato e usa il publisher del gioco per
creare il backup di DB e vettori, pubblicare il binario immutabile e sostituire
solo lo schema `context`. Conserva tutte le segrete e registra modello, SHA256
dei tre file di origine e risultati semantici nel rapporto. Rifiuta inventari
diversi dal DB corrente e matrici nulle, non finite o non normalizzate.
Le vecchie misure di densità e ponti sono archiviate come riferite ai vettori precedenti;
la geometria Harrier è marcata come non ricalcolata.

Precedente pubblicazione singola Harrier: `06510704dd764f03ff9e5daef5fbcc718931989102bace4f2330484d4d9425e6`.
Backup: `gioco-zerocontext/.cache/backups/publish-20261116T141532702489Z/`.
Candidato e verifiche: `gioco-zerocontext/.cache/model2vec-imports/20261116T141335005445Z/`.
Il lettore del codice corrente carica correttamente il corpus. Il processo del server
già aperto risponde HTTP 503 al reload e richiede un riavvio per usarlo.

## Rieseguire il benchmark

L'ambiente MTEB è separato dall'ambiente del gioco. Richiede Python 3.11–3.14;
questa esecuzione ha usato Python 3.13.

```powershell
./gioco-zerocontext/.venv-vectors/Scripts/python.exe -m venv Python/.venv-mteb
./Python/.venv-mteb/Scripts/python.exe -m pip install -r Python/requirements-mteb.txt
./Python/.venv-mteb/Scripts/python.exe -B -X utf8 Python/valuta_mteb.py
```

Il comando rigenera entrambi i risultati. `--models turbox` oppure
`--models harrier_m2v` limita l'esecuzione a un modello;
`--output CARTELLA` sceglie una cartella diversa. Non modifica il DB.

## Reimportazione delle parole

I due output attuali contengono lo stesso inventario già attivo: **93.928 parole
e 9.513 segrete**, con identico ordine degli indici. La reimportazione è stata
eseguita con:

```powershell
./gioco-zerocontext/.venv-vectors/Scripts/python.exe -B -X utf8 Python/importa_parole_zerocontext.py --source Python/outputs/turbox --source Python/outputs/harrier_m2v
```

Lo script crea un backup consistente SQLite prima della scrittura e sostituisce
le due tabelle in una transazione. Verifica che tutte le tabelle, anche degli
altri giochi, abbiano lo stesso contenuto logico al termine; controlla integrità
e chiavi esterne. Il conteggio non cresce perché i generatori leggono parole già
presenti nel DB. Questa prima operazione non cambiava i vettori; la successiva
importazione Harrier descritta sopra li ha sostituiti.

Backup e ricevuta di questa importazione:
`gioco-zerocontext/.cache/backups/python-words-20261116T140646272062Z/`
(`giochi.sqlite3` e `import.json`).

Lo script rifiuta inventari diversi dall'attuale: in quel caso è necessario
usare la pubblicazione completa di `gioco-zerocontext/script/publish_context.py`,
in modo da verificare qualità, conservazione delle segrete e allineamento dei
vettori prima dell'attivazione.

## Ottimizzazioni BGE-M3 Italian

Il 16 novembre 2026 sono stati eseguiti in ordine gli script
[`Ottimizzazioni/`](Ottimizzazioni/README.md), con valutazione MTEB STS22.v2
italiano dopo ogni banca: ABTT **67,02**, PCA + whitening **66,99**, ensemble
**64,17**, multi-prompt **64,44**, CoSENT **66,07**, AnglE **65,88**.
Il riferimento BGE è **64,39** e quello delle associazioni originali **64,77**.
Sono valori Spearman × 100 di un singolo task, con protocollo comune
`wordmean-full-v1`. Il valutatore 07 sulle frasi intere ottiene separatamente
**79,8442** con l'encoder BGE e limite 512 token.

I fine-tuning usano STS-B italiano tradotto automaticamente con i giudizi umani
originali: **5.240 coppie train, 1.497 dev**, senza sovrapposizioni testuali con
STS22 test. Tutte le sei banche conservano **93.928 parole e 9.513 segrete**;
il database del gioco mantiene lo SHA-256 iniziale.

[Report completo dell'esecuzione](outputs/ottimizzazioni/20261116T180046259370Z/RISULTATI.md),
con score ufficiali, provenienza dati, configurazioni e verifiche dei pesi LoRA.

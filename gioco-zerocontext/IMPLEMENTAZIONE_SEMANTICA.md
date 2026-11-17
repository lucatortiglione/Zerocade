# Prima implementazione dell'architettura semantica

**Documento storico:** i round speciali sono ora sospesi; tutte le 9.513 segrete sono ordinarie.
Codice e task successivi sono descritti in [IMPLEMENTAZIONE_VETTORI_SEMANTICI.md](IMPLEMENTAZIONE_VETTORI_SEMANTICI.md).
Le quantità e la pipeline riportate sotto descrivono la prima pubblicazione.

Aggiornamento del 16 novembre 2026, relativo ad [ARCHITETTURA_SEMANTICA_CONTEXT.md](ARCHITETTURA_SEMANTICA_CONTEXT.md).

## Corpus e conservazione delle segrete

Il corpus generato contiene **93.928 tentativi e 9.513 segrete**: tutte le **6.838** segrete precedenti
sono presenti, con **2.675 aggiunte**. Il controllo confronta gli insiemi di parole, non soltanto i conteggi.
La pubblicazione viene bloccata prima di modificare il DB se manca anche una sola segreta già disponibile.

| Insieme | Parole |
| --- | ---: |
| Segrete complessive, senza duplicati | 9.513 |
| Pool ordinario giocabile | 9.511 |
| Sottoinsieme ordinario conforme ai nuovi filtri | 2.706 |
| Segrete conservate con deroga di compatibilità | 6.805 |
| Pool speciale conforme a tutti i filtri | 3 |
| Presenti sia nell'ordinario sia nello speciale | 1 |

Le speciali sono **monile**, **probità** e **suppellettile**. I circa 520 target speciali citati nella specifica
sono una stima, non un risultato ottenuto dalle fonti: non si abbassano densità, ponti o soglie Zipf per raggiungerla.
L'accreditamento dei domini è esplicito in `resources/semantic-domains.json`; ulteriori lemmi possono essere
aggiunti lì, ma devono superare di nuovo tutti i controlli. L'attribuzione editoriale dei domini e i filtri
automatici non costituiscono una revisione linguistica umana dell'intera banca.

Il vincolo dell'utente di conservare le segrete prevale sulle esclusioni dei nuovi filtri. Per questo le
6.805 vecchie segrete non conformi restano **estraibili nei round ordinari**, anche quando sono FO o fuori
finestra: non sono archiviate né contate artificialmente come segrete giocabili. Le nuove ammissioni
applicano invece i filtri della specifica. Ogni deroga è registrata in `context__targets.details`.

## Generazione

Il task **00)ZeroContext : Aggiornamento banca e rigenerazione segrete, vocabolario e vettori.** e il task
**00)ZeroContext : Contesti** eseguono ora `script/build_context_semantic.py --publish`.

1. Leggono corpus corrente, attestazioni morfologiche e valutazioni delle candidate dai DB locali, in sola lettura.
   Le forme vengono dallo snapshot Morph-it attivo e abilitato. Le frequenze sono calcolate con `wordfreq==3.1.1`:
   lo snapshot lessicale wordfreq conserva i ranghi, non i valori Zipf. Non si usano CSV della banca.
2. Acquisiscono il modello FastText italiano completo, OMW/MultiWordNet italiano e WordNet 3.0 da revisioni
   fissate e verificate tramite SHA-256. Il primo download FastText richiede circa 7,24 GB; le esecuzioni
   successive riusano il modello e la matrice subword in cache. Le fasce NVdB sono ricavate dai caratteri
   del PDF originale: grassetto FO, corsivo AD, tondo AU. FO prevale sugli omografi.
3. Calcolano le sottoparole secondo i parametri **realmente addestrati** del modello (`minn=maxn=5`).
   Forzare 3–6 su quei bucket preaddestrati produrrebbe componenti non addestrate per tali n-grammi.
   La copertura è completa: 93.620 parole nel dizionario FastText e 308 ricostruite tramite sottoparole.
4. Eseguono dieci iterazioni normalizzate di attrazione sinonimica e repulsione antonimica, con ancoraggio
   ai vettori iniziali. Il grafo ha 29.207 coppie sinonimiche e 3.742 antonimiche; gli antonimi sono proiezioni
   italiane delle relazioni tra synset PWN. Non si presentano come annotazioni italiane di senso revisionate.
5. Misurano i cento vicini reali di ogni target, escludendo la parola stessa. Applicano densità e numero di
   ponti alle frequenze delle parole vicine. Per i verbi sommano le frequenze delle forme attestate,
   deduplicate, compreso l'infinito; una frequenza wordfreq assente non viene inventata.
6. Scrivono una matrice contigua **float32 little endian, 300 dimensioni, righe L2 unitarie**:
   **112.713.600 byte**. Classifica e temperatura usano il coseno, senza boost o penalità aggiuntive.
7. Verificano il candidato, conservano un backup, attivano il file vettoriale immutabile e sostituiscono
   soltanto lo schema `context`. Le altre tabelle dei giochi rimangono nel DB corrente.

`report.json` registra fonti, hash, versioni dei pacchetti e degli script, conteggi e segrete preservate;
`targets.json` contiene per parola frequenze, fascia NVdB, dominio, densità, ponti e deroghe. La ricevuta
finale è `data/publication.json`. Una generazione senza `--publish` rimane un candidato in `.cache/semantic/runs/`.

```powershell
.venv-contexts/Scripts/python.exe -B script/build_context_semantic.py
.venv-contexts/Scripts/python.exe -B script/build_context_semantic.py --publish
```

Il profilo precedente FastText/ConceptNet/LSA rimane in `resources/contexts.json` per confronti sperimentali.
Il task pilota 00a continua a usarlo; non pubblica il campione.

## Regole in esecuzione

Il server gestisce una sessione per stanza. Il round 9, 18, 27 e successivi multipli di nove usa il pool
speciale; gli altri usano il pool ordinario. Ricaricare un overlay o aprire la preview non ricomincia
il round e non azzera il contatore. Un riavvio esplicito della partita ricomincia dal round 1.

Lo speciale dura al massimo **180 secondi di gioco attivo** oppure **100 tentativi validi e distinti**.
La pausa della regia congela il tempo; il server controlla la scadenza anche senza nuovi messaggi.
Parole inesistenti, ripetizioni e suggerimenti non consumano tentativi. La risposta esatta al centesimo
tentativo vince ancora; una risposta ricevuta alla scadenza temporale non vince.

Il bonus speciale usa base 2.500 e i fattori tempo/tentativi della specifica, fino al massimo teorico di
5.000 punti. I punti per i miglioramenti restano propri dei round ordinari. Le temperature sono 0–100,
con le due curve previste dalla specifica; le posizioni continuano a essere visibili.

I soccorsi si attivano una sola volta per soglia: 50 tentativi oppure 90 secondi con migliore posizione
oltre 1.000; 75 tentativi oppure 150 secondi con migliore posizione oltre 300. Il primo indica il dominio
effettivo della soluzione. **Disabilita tutti gli aiuti** prevale anche sui soccorsi. La classifica della
soluzione è precalcolata una volta per round; un tentativo usa lookup e posizione già disponibili.
Il limite infrastrutturale dei round ordinari resta 10.000 tentativi, come nel motore precedente.

Il torneo conserva il proprio regolamento: condivide lettura dei vettori FP32 e ordinamento, senza
ereditare la rotazione survival. Un cambio di corpus sospende i tornei incompatibili.

## Precisazioni matematiche

- La scala standard wordfreq è `log10(frequenza per miliardo)`. Il `+3` nella definizione iniziale del
  documento è un refuso; i suoi esempi e la somma delle frequenze verbali sono interpretati sulla scala standard.
- Il funzionale quadratico con repulsione negativa può essere illimitato inferiormente. L'implementazione
  usa aggiornamenti con ancoraggio e proiezione sulla sfera unitaria, con pesi limitati, evitando divergenze.
- La finestra 2,00–2,40 vale per le ammissioni ordinarie di base; per i verbi si applica la deroga
  `Zipf_att >= 2,00` dichiarata nei paragrafi 3.3 e 7 della specifica.

## Verifica

Le prove coprono normalizzazione FP32, pool, confini lessicali, somma delle frequenze, sottoparole UTF-8,
attrazione/repulsione, nono e diciottesimo round, timer senza chat, pausa, centesimo tentativo,
invalidi e duplicati, bonus, soccorsi e blocco delle rimozioni anche a conteggio invariato.
Lo smoke test avvia server e DB della diretta isolati: `node scripts/smoke-runtime.mjs`, anche con `--bundle`.
Prima della pubblicazione può usare `--context-candidate=<cartella-candidato>`.

Verifica finale: **221 test TypeScript e 68 Python superati**, typecheck, build, controllo infrastrutturale,
integrità del DB e smoke test sorgente/bundle. Il rendering locale del canvas è stato controllato a
1080×1920 e 420×800; il controllo nel browser è rimasto indisponibile.

Il DB pubblicato ha revisione `0d94bc0a466144c0c7846fd85a4ec23048aa7066fae4cba4592b5ddb8c0f3e24`.
Backup precedente: `.cache/backups/publish-20261116T105901158509Z/`.
Il processo già in esecuzione richiede un riavvio per caricare il nuovo codice: il comando automatico
di arresto e riavvio è stato respinto dalla policy dell'ambiente (`blocked by policy`).

# Stato e indice della documentazione

Revisione del **16 novembre 2026**, fuso Europe/Rome. L'aggiornamento comprende tutti i 49 Markdown
inizialmente versionati o non ignorati, oltre ai due documenti locali dei lotti e dello staging.
Sono aggiunti questo indice e la guida alle strategie di espansione di ZeroContext.
Le cache dei modelli, gli ambienti virtuali, le dipendenze e gli artefatti di build non sono documentazione sorgente.

## Stato verificato nel workspace

| Area | Stato |
| --- | --- |
| Catalogo | 40 giochi in `packages/shared` |
| Runtime locale | Node 26.13.1, npm 12.2.2, better-sqlite3 13.2.0, SQLite caricato 3.54.1 |
| ZeroContext | 93.928 tentativi, 9.513 segrete; tutte le precedenti 6.838 conservate; ordinario 9.513, speciale 0 |
| Profili ZeroContext (21 novembre 2026) | Originali, ABTT, Pipeline B e Riordino. Per le associazioni con legami specifici la regia usa `ZeroContext_Associazioni_Riordino.sqlite3`. |
| Pipeline di associazione A/B | `gioco-zerocontext/pipeline_a` (BGE-M3) e `pipeline_b` (fastText) calcolano i top 1000 per ogni parola di `ZeroContext_Segrete` tra le parole della tabella `parole` del RAW 2.0; i task VS Code esportano a fine build in `database/ZeroContext_Associazioni_PipelineA/B.sqlite3` |
| Matrici dei profili ZeroContext | Originale da 112.713.600 byte, condivisa con Pipeline B e Riordino. ABTT da 384.729.088 byte. |
| ZeroAssociazioni pubblicato | 3.941 prompt, 11.847 parole, 58.551 collegamenti |
| ZeroWordle | 8.630 soluzioni e 105.310 tentativi |
| ZeroQuizz | 26.715 domande, tutte attive nel DB locale |
| ZeroDubbi | 120 dilemmi |
| ZeroLettere | 5.661 indizi e 109 alternative; banca autonoma non integrata nel runtime |
| DB di lavoro lessicale | 3.432.136.704 byte, fuori da Git; dimensione locale variabile |

Conteggi e metadati provengono da letture SQLite in sola lettura; le versioni dai manifest,
dal lockfile e dal binding effettivamente caricato. Il riepilogo dell'inventario lessicale
è quello salvato in `prompt_inventory_status.json`: non è stata eseguita una nuova raccolta.
La successiva importazione Harrier richiesta dall'utente ha sostituito i vettori di ZeroContext,
conservando parole, segrete e dati degli altri giochi. Dettagli in [Python/README.md](../Python/README.md).

## Come leggere le date

Le guide operative descrivono il checkout attuale. Gli audit del 14–15 novembre conservano
versioni, commit, prove e limiti originali; una nota iniziale li collega alle modifiche successive.
I regolamenti conservano le versioni normative e distinguono il progetto iniziale dal runtime.
Le roadmap mobili di Bivio e ZeroWords non descrivono le funzioni mancanti dei giochi PC.
Le note delle fonti conservano le condizioni registrate all'acquisizione, senza dichiarare
una nuova verifica delle licenze esterne. I rapporti editoriali non certificano l'intera banca.

## Task ZeroContext corrente

**00)ZeroContext : Aggiornamento banca e rigenerazione segrete, vocabolario e vettori.** e
**00)ZeroContext : Contesti** eseguono `build_context_semantic.py --publish`.
La pipeline legge i DB locali, genera FastText subword + retrofitting e pool separati, impedisce
la perdita di qualsiasi segreta e attiva il solo schema `context`, con backup.
Le nuove regole includono round speciali ogni nove, 180 secondi e 100 tentativi validi sul server.
Il corpus passa da 6.838 a 9.513 segrete. Le deroghe delle vecchie segrete e i tre target speciali
conformi sono spiegati in [IMPLEMENTAZIONE_VETTORI_SEMANTICI.md#segrete-domini-e-ricevute](../gioco-zerocontext/IMPLEMENTAZIONE_VETTORI_SEMANTICI.md#segrete-domini-e-ricevute).
I paragrafi successivi sono il registro cronologico delle scelte precedenti.

## Indice dei documenti

| Documento | Ruolo |
| --- | --- |
| [AGGIORNAMENTO_DIPENDENZE.md](../AGGIORNAMENTO_DIPENDENZE.md) | Guida e stato operativo |
| [ANALYSIS.md](../ANALYSIS.md) | Guida e stato operativo |
| [DIRETTIVE.md](../DIRETTIVE.md) | Regole e direttive |
| [README.md](../README.md) | Guida e stato operativo |
| [TODO.md](../TODO.md) | Backlog e rilevazione storica |
| [database/DB.md](../database/DB.md) | Guida e stato operativo |
| [database/README.md](../database/README.md) | Guida e stato operativo |
| [docs/DIRETTIVE-audit-2026-11-14.md](DIRETTIVE-audit-2026-11-14.md) | Rapporto datato |
| [docs/DIRETTIVE-sorgenti-giochi-2026-11-15.md](DIRETTIVE-sorgenti-giochi-2026-11-15.md) | Rapporto datato |
| [docs/ZeroContext-direttive-2026-11-14.md](ZeroContext-direttive-2026-11-14.md) | Rapporto datato |
| [docs/superpowers/specs/2026-11-19-zerocontext-qualita-posizioni-design.md](superpowers/specs/2026-11-19-zerocontext-qualita-posizioni-design.md) | Progetto: misura della qualità delle posizioni di ZeroContext |
| [docs/superpowers/plans/2026-11-19-zerocontext-qualita-posizioni.md](superpowers/plans/2026-11-19-zerocontext-qualita-posizioni.md) | Piano di implementazione del progetto precedente |
| [gioco-dilemmi/README.md](../gioco-dilemmi/README.md) | Guida e stato operativo |
| [gioco-dilemmi/TODO.md](../gioco-dilemmi/TODO.md) | Backlog e rilevazione storica |
| [gioco-parole/ALGORITMO.md](../gioco-parole/ALGORITMO.md) | Guida e stato operativo |
| [gioco-parole/README.md](../gioco-parole/README.md) | Guida e stato operativo |
| [gioco-parole/TODO.md](../gioco-parole/TODO.md) | Backlog e rilevazione storica |
| [gioco-quizzland/GUIDA-DOMANDE.md](../gioco-quizzland/GUIDA-DOMANDE.md) | Guida e stato operativo |
| [gioco-quizzland/README.md](../gioco-quizzland/README.md) | Guida e stato operativo |
| [gioco-quizzland/data/REVISIONE-DOMANDE.md](../gioco-quizzland/data/REVISIONE-DOMANDE.md) | Rapporto datato |
| [gioco-quizzland/data/REVISIONE-RISPOSTE.md](../gioco-quizzland/data/REVISIONE-RISPOSTE.md) | Rapporto datato |
| [gioco-quizzland/data/fonti/apininjas/LICENZA.md](../gioco-quizzland/data/fonti/apininjas/LICENZA.md) | Provenienza e condizioni registrate |
| [gioco-quizzland/data/fonti/arc/LICENZA.md](../gioco-quizzland/data/fonti/arc/LICENZA.md) | Provenienza e condizioni registrate |
| [gioco-quizzland/data/fonti/openbookqa/LICENZA.md](../gioco-quizzland/data/fonti/openbookqa/LICENZA.md) | Provenienza e condizioni registrate |
| [gioco-quizzland/data/fonti/opentdb/LICENZA.md](../gioco-quizzland/data/fonti/opentdb/LICENZA.md) | Provenienza e condizioni registrate |
| [gioco-quizzland/data/fonti/triviaapi/LICENZA.md](../gioco-quizzland/data/fonti/triviaapi/LICENZA.md) | Provenienza e condizioni registrate |
| [gioco-zeroassociations/AGGIORNAMENTI_FONTI.md](../gioco-zeroassociations/AGGIORNAMENTI_FONTI.md) | Guida e stato operativo |
| [gioco-zeroassociations/ANALISI_NLP.md](../gioco-zeroassociations/ANALISI_NLP.md) | Guida e stato operativo |
| [gioco-zeroassociations/ASSOCIAZIONI_FILTRATI.md](../gioco-zeroassociations/ASSOCIAZIONI_FILTRATI.md) | Guida e stato operativo |
| [gioco-zeroassociations/DIRETTIVA_INDIZI.md](../gioco-zeroassociations/DIRETTIVA_INDIZI.md) | Regole e direttive |
| [gioco-zeroassociations/PROMPT_DATABASE.md](../gioco-zeroassociations/PROMPT_DATABASE.md) | Guida e stato operativo |
| [gioco-zeroassociations/PROMPT_FILTRATI.md](../gioco-zeroassociations/PROMPT_FILTRATI.md) | Guida e stato operativo |
| [gioco-zeroassociations/PROMPT_INVENTORY.md](../gioco-zeroassociations/PROMPT_INVENTORY.md) | Guida e stato operativo |
| [gioco-zeroassociations/PROMPT_SCARTATI.md](../gioco-zeroassociations/PROMPT_SCARTATI.md) | Guida e stato operativo |
| [gioco-zeroassociations/PROMPT_VALIDI.md](../gioco-zeroassociations/PROMPT_VALIDI.md) | Guida e stato operativo |
| [gioco-zeroassociations/README.md](../gioco-zeroassociations/README.md) | Guida e stato operativo |
| [gioco-zeroassociations/REGOLE.md](../gioco-zeroassociations/REGOLE.md) | Regole e direttive |
| [gioco-zeroassociations/VALUTAZIONE_NUOVE_PAROLE.md](../gioco-zeroassociations/VALUTAZIONE_NUOVE_PAROLE.md) | Rapporto datato |
| [gioco-zeroassociations/analisi_screenshot_word_association_20261108.md](../gioco-zeroassociations/analisi_screenshot_word_association_20261108.md) | Guida e stato operativo |
| [gioco-zeroassociations/archivio/LEGGIMI.md](../gioco-zeroassociations/archivio/LEGGIMI.md) | Archivio storico |
| [gioco-zeroassociations/archivio/documenti/README_pipeline_estrazione_20261109.md](../gioco-zeroassociations/archivio/documenti/README_pipeline_estrazione_20261109.md) | Archivio storico |
| [gioco-zeroassociations/archivio/documenti/README_word_association_it_v3_6_0.md](../gioco-zeroassociations/archivio/documenti/README_word_association_it_v3_6_0.md) | Archivio storico |
| [gioco-zeroassociations/direttive_word_association_it_v3_6_0.md](../gioco-zeroassociations/direttive_word_association_it_v3_6_0.md) | Regole e direttive |
| [gioco-zeroassociations/resources/LEGGIMI.md](../gioco-zeroassociations/resources/LEGGIMI.md) | Guida e stato operativo |
| [gioco-zerocatene/README.md](../gioco-zerocatene/README.md) | Guida e stato operativo |
| [gioco-zerocontext/README.md](../gioco-zerocontext/README.md) | Guida e stato operativo |
| [Profili delle associazioni di ZeroContext](../gioco-zerocontext/PROFILI_ASSOCIAZIONI.md) | Scelta del database in regia, segrete giocabili e disponibilità dei profili |
| [gioco-zerocontext/REGOLAMENTO_CONTEXT_TORNEO_v2_3.md](../gioco-zerocontext/REGOLAMENTO_CONTEXT_TORNEO_v2_3.md) | Regole e direttive |
| [gioco-zerocontext/STRATEGIE_ESPANSIONE.md](../gioco-zerocontext/STRATEGIE_ESPANSIONE.md) | Guida e stato operativo |
| [gioco-zerocontext/VALUTAZIONE_INVENTARIO.md](../gioco-zerocontext/VALUTAZIONE_INVENTARIO.md) | Rapporto datato |
| [gioco-zerocontext/ZEROCONTEXT_TORNEO_SPECIFICA_TECNICA.md](../gioco-zerocontext/ZEROCONTEXT_TORNEO_SPECIFICA_TECNICA.md) | Progetto iniziale e scostamenti |
| [gioco-zerolettere/README.md](../gioco-zerolettere/README.md) | Guida e stato operativo |
| [gioco-zerowordle/README.md](../gioco-zerowordle/README.md) | Guida e stato operativo |

I due documenti locali ignorati da Git sono il `LEGGIMI.md` del lotto
`gioco-zeroassociations/archivio/lotti/filtered-v3_6_0/lotto_0003_20261108/` e
`ISTRUZIONI_AGENTI.md` della lavorazione `prompt-staging/associations/finale_20261110/`.
Conservano conteggi e istruzioni storici con una nota di ambito aggiornata.

## Verifica e tracciabilità

La revisione controlla contenuti, collegamenti locali, codifica UTF-8, diff e grafo delle dipendenze
del nuovo task. Selezione dal DB e pubblicazione di nuovi vocaboli vengono provate su database temporanei.
La selezione viene inoltre verificata in sola lettura sull'inventario locale, senza pubblicare il risultato.
I test applicativi, le prove live e gli audit delle dipendenze riportati negli altri documenti restano
esiti storici; non vengono dichiarati nuovamente eseguiti per una modifica documentale.

Il testo delle direttive di ZeroAssociazioni è legato ai verbali tramite SHA-256: il ritocco editoriale
viene registrato in `resources/policy_versions.json` con la stessa `SEMANTIC_POLICY`, senza revisionare
nuovamente o promuovere bacini. Le modifiche preesistenti del workspace sono state conservate.

## Aggiornamento del task: selezione dal DB lessicale

Il task di aggiornamento ora usa `build_context_ensemble.py --refresh-vocabulary --publish`.
Legge lemmi, morfologia, frequenze e valutazioni delle candidate dal DB lessicale, senza CSV,
e pubblica soltanto dopo aver completato il candidato fastText + ConceptNet + LSA.

Verifiche di questa modifica: **43 test Python ZeroContext superati** nell'ambiente semantico;
selezione e pubblicazione provate su DB temporanei, compreso il rifiuto di un candidato con
impronta della selezione errata e la conservazione degli altri giochi dopo la pubblicazione.

La prova in sola lettura sull'inventario locale ha selezionato **89.380 tentativi e 6.838 segrete**:
5 aggiunte (autobiografia, autrice, produttrice, ricercatrice, studentessa), nessuna rimozione.
Le candidate adulta, devota, italiana, premiata e raffinata restano trattenute dalle valutazioni
salvate. Questa è un'anteprima della selezione: il corpus attivo è rimasto a 6.833 segrete,
con hash del DB di gioco invariato. Non è stata eseguita la generazione/pubblicazione completa.

## Pubblicazione del 16 novembre 2026, ore 10:05

Eseguito il task dal DB lessicale con `--refresh-vocabulary --publish`, profilo statistico
fastText 40%, ConceptNet 30%, LSA 30%. Il corpus è stato pubblicato e il server locale ha
confermato il ricaricamento della revisione `934521355d2f87856aa8f73d3058b871509257d3ddc9217b16ec1fa83f65ceb7`.

- Segrete: **6.833 → 6.838**, con autobiografia, autrice, produttrice, ricercatrice e studentessa.
- Tentativi: **89.380**, invariati; nessuna parola rimossa.
- Collegamenti: **78.245 → 78.246**.
- Vettori: 768 int8 per parola, 68.643.840 byte. La rigenerazione ha prodotto lo stesso hash
  vettoriale: le nuove segrete erano già tra le parole giocabili; il file immutabile è stato riutilizzato.
- `integrity_check`: ok; `foreign_key_check`: nessun errore; parole e vettori allineati.
- I contenuti degli schemi wordle, associazioni, parole e contenuti hanno gli stessi hash di prima.

Backup consistente del DB precedente e dei vettori in
`gioco-zerocontext/.cache/backups/publish-20261116T090523311622Z/`.
Ricevuta in `gioco-zerocontext/data/publication.json`; rapporto completo in
`gioco-zerocontext/.cache/ensemble/runs/20261116T090520587483Z/report.json`.
Questa pubblicazione supera lo stato di sola anteprima riportato nella sezione precedente.

## Pubblicazione del 16 novembre 2026, ore 10:28 — Zipf minimo 2,85

Applicata la richiesta di una soglia italiana **Zipf ≥ 2,85** per tutte le segrete,
comprese quelle storiche: misura sul lemma con wordfreq 3.1.1, senza eccezioni per
NVdB o valutazioni positive. `context_secret_policy.py` centralizza la regola;
selezione, generatore storico e pubblicazione ne applicano i controlli.

Pubblicato il corpus: **6.838 → 6.144 segrete**, 694 rimosse dalla sola banca delle soluzioni.
Vocabolario e vettori restano 89.380 righe; collegamenti **78.246 → 74.944**.
La scansione delle segrete pubblicate ha confermato minimo Zipf effettivo **2,85**.
Il server locale ha ricaricato la revisione
`cf2fb42238770fceb6c7cf631e376669b9c7da2c82357e86b8eb76702b66691b`.

Verifiche: **45 test Python ZeroContext superati**, inclusi confine 2,85, segrete
preesistenti sotto soglia, candidate consigliate, conservazione dei tentativi e rifiuto
di pubblicazioni non conformi. `integrity_check`, chiavi esterne, hash dei vettori e
`giochi.py verify` regolari. Le 14 tabelle degli altri giochi sono identiche al backup.
I due ambienti Python sono stati verificati con `pip check`; wordfreq 3.1.1 è ora
un requisito esplicito dei profili statistico e semantico.

Backup in `gioco-zerocontext/.cache/backups/publish-20261116T092831154114Z/`.
Rapporto con valori Zipf esclusi in
`gioco-zerocontext/.cache/ensemble/runs/20261116T092828357630Z/report.json`, sezione
`selection.below_secret_zipf`; politica nei metadati `secret_frequency` del corpus.

## Ripristino del 16 novembre 2026, ore 10:33 — vincolo Zipf annullato

Su richiesta dell'utente è stata annullata la soglia 2,85 e ripristinato **solo lo schema
`context`** dal backup precedente alla sua applicazione. Le **6.838 segrete** coincidono
esattamente con quelle del corpus pubblicato alle 10:05; tornano 78.246 collegamenti.
Vocabolario e vettori restano 89.380 righe, senza modifiche agli altri giochi.

Rimosso il filtro da selezione, generatore storico, pubblicazione e task; rimossi anche
il modulo specifico e il requisito aggiunto ai due profili. Nessun minimo Zipf globale
può quindi reintrodurre il taglio nella successiva rigenerazione. Restano i criteri di
lemma, familiarità, fasce, revisione, esclusioni e plurali già presenti prima della scelta.

Verifiche: **43 test Python ZeroContext superati**, controllo di integrità e chiavi
esterne, confronto degli altri giochi con lo stato prima del ripristino, `giochi.py verify`.
Il server ha ricaricato la revisione `934521355d2f87856aa8f73d3058b871509257d3ddc9217b16ec1fa83f65ceb7`.
È stata conservata anche una copia dello stato da 6.144 segrete prima di ripristinare:
`gioco-zerocontext/.cache/backups/rollback-20261116T093326740829Z/`.
Le sezioni precedenti restano come cronologia delle operazioni, non come vincoli attivi.

## Task 3: soglia dei prompt aggiornata a Zipf 2,2

La politica `resources/prompt_policy.json` di ZeroAssociazioni è alla versione
`2026-11-16.1`, con `minimum_zipf_it = 2.2`. Il task «3)Parole: scarta quelle non utili e filtrate»,
il refresh e la costruzione diretta dei filtrati leggono questa configurazione condivisa.
Restano le eccezioni NVdB e la frequenza delle forme verbali attestate; gli altri controlli
lessicali e la necessità della revisione semantica sono invariati.

È una modifica della configurazione: il task non è stato eseguito sui dati reali e non
sono stati avviati revisioni LLM o aggiornamenti delle copie. ZeroContext resta a **6.838
segrete**. Il confronto in sola lettura delle sue segrete con wordfreq italiano 3.1.1
conta **6.730 parole con Zipf ≥ 2,2** e 108 sotto soglia; non è una nuova selezione pubblicata.

## Task 3: limite massimo Zipf 2,2

La successiva richiesta dell'utente inverte il confronto: la politica `2026-11-16.2`
configura **`maximum_zipf_it = 2.2`**, quindi **Zipf ≤ 2,2**, e rimuove il minimo.
Il confronto è condiviso da costruzione dei filtrati, refresh, validatore e valutazione
delle nuove parole. Le configurazioni storiche con un minimo restano leggibili;
non si possono configurare simultaneamente minimo e massimo.

L'eccezione NVdB resta: una parola attestata nel vocabolario di base può passare anche
oltre 2,2. Per i verbi si usa ancora il massimo delle frequenze delle forme attestate,
che viene confrontato con il limite massimo; non si usa una forma meno frequente per
aggirare il filtro. Restano i controlli su lingua, lemma, prestiti e revisione semantica.

Non è stato eseguito il task sui DB reali. ZeroContext conserva le sue 6.838 segrete,
senza una soglia Zipf globale. I dati e i conteggi delle precedenti operazioni restano storici.

## Architettura semantica applicata — 16 novembre 2026

La pipeline precedente FastText/ConceptNet/LSA è sostituita nei due task principali da FastText
subword + retrofitting. Il corpus generato ha 93.928 tentativi e 9.513 segrete: nessuna delle
6.838 segrete precedenti è stata rimossa. Le deroghe di compatibilità restano giocabili.
Il server gestisce round, tempo e punti anche in classica; il torneo mantiene le sue regole.
La descrizione corrente e le precisazioni matematiche sono nel
[rapporto di implementazione](../gioco-zerocontext/IMPLEMENTAZIONE_VETTORI_SEMANTICI.md#segrete-domini-e-ricevute).

## Pipeline vettoriale e sospensione speciali — 16 novembre 2026

Codice e task ora seguono ARCHITETTURA_VETTORI_SEMANTICI.md: Model2Vec, PCA/SIF,
prompt-averaging offline, fallback FastText allineato, retrofitting con margine e collaudi obbligatori.
Il DB pubblicato mantiene i vettori precedenti e tutte le 9.513 segrete; i pool sono stati
aggiornati a 9.513 ordinarie e zero speciali. Nessuna rigenerazione completa Model2Vec è ancora
stata eseguita. Stato e comandi in
[IMPLEMENTAZIONE_VETTORI_SEMANTICI.md](../gioco-zerocontext/IMPLEMENTAZIONE_VETTORI_SEMANTICI.md).

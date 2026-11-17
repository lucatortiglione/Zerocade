# Originali e ABTT: associazioni di ZeroContext

Dal 16 novembre 2026 la regia mostra **Associazioni ZeroContext**, con due scelte:

| Scelta | Schema in `database/giochi.sqlite3` | Vettori | Parole / segrete |
| --- | --- | --- | --- |
| Associazioni originali, predefinite | `context_original` | FastText + retrofitting, 300 float32 | 93.928 / 9.513 |
| Associazioni ABTT | `context_abtt` | BGE-M3 Italian + ABTT, 1.024 float32 | 93.928 / 9.513 |

Lo schema `context` precedente è conservato e rimane compatibile con gli strumenti
esistenti. Ogni profilo ha metadati, indici, pool e riferimento al proprio file
immutabile. Tutte le segrete sono ordinarie; i round speciali restano sospesi.
I modelli non vengono mescolati nello stesso spazio vettoriale.

## Uso nella regia

Aprire ZeroContext nella pagina Games e scegliere una voce nel pannello
**Associazioni ZeroContext**. Il cambio avvia un round nuovo, elimina tentativi
e aiuti del round precedente e conserva le classifiche generali, compresa
Sessione. Se il gioco è in pausa, resta in pausa. La scelta è salvata per la
stanza e viene ripristinata alla riapertura della sessione.

La scelta resta bloccata mentre un torneo è aperto: concluderlo o annullarlo
prima di cambiare. I tornei usano il profilo selezionato nella propria stanza;
il controllo dell'impronta del corpus continua a proteggere le manche salvate.

Le due versioni si caricano nello stesso processo: non serve riavviare il server
a ogni cambio. Per installare questo nuovo codice su un processo già aperto
serve un solo riavvio iniziale, quindi ricaricare la regia.

## Origine dei dati e backup

La matrice importata è `Python/outputs/ottimizzazioni/20261116T180046259370Z/01_abtt`:
ABTT rimuove tre componenti principali da BGE-M3 Italian. Il file del runtime
contiene gli stessi float32 della matrice valutata, senza compressione o riduzione
delle dimensioni: **384.729.088 byte**, entro il budget di caricamento di 384 MiB.
I vettori restano esterni al DB e sono indicati da `context_abtt__meta`.

La procedura riproducibile è `Python/importa_abtt_zerocontext.py --source
Python/outputs/ottimizzazioni/20261116T180046259370Z/01_abtt`, dalla radice del
repository con l'ambiente `Python/.venv-dense`. Prima crea un backup consistente
SQLite e delle matrici precedenti; poi importa ABTT e rimuove gli schemi
`context_turbox` e `context_harrier` nella stessa transazione. I generatori e i
risultati storici restano disponibili per riprodurre gli esperimenti.

Backup: `.cache/backups/abtt-20261116T185900981896Z/` nella cartella del gioco.
Ricevuta: `.cache/abtt-imports/20261116T185900981896Z/import.json`.
Le **27 tabelle conservate** hanno contenuto identico al backup, inclusi
`context`, `context_original` e gli altri giochi. Chiavi esterne e integrità
SQLite sono state verificate. Il DB pesa 52.998.144 byte.

Il confronto uniforme sulle banche misura **64,77** per l'originale e **67,02**
per ABTT: Spearman × 100, STS22.v2 italiano, 407 coppie, `wordmean-full-v1`.
È un singolo task STS. [Risultati e limiti](../Python/outputs/ottimizzazioni/20261116T180046259370Z/RISULTATI.md).

## Caricamento e verifica

`GET /api/context/profiles` elenca disponibilità e conteggi. Le risorse
`/api/context/:file?profile=original|abtt` sono fissate a un profilo e
portano intestazioni di profilo e revisione. L'overlay rifiuta file mescolati.
Il server conserva cache distinte e sceglie il corpus dalla sessione della stanza.
Il pacchetto Windows include le matrici originali e ABTT. Gli ID TurboX/Harrier
sono rifiutati dalle API; vecchie impostazioni di stanza ricadono sull'originale.

`tests/context-profiles.test.ts` verifica inventari, cache distinte e download
coerenti. `scripts/smoke-runtime.mjs` prova cambi ripetuti sullo stesso processo,
nuovi round, conservazione dei punteggi e isolamento fra stanze.
Verificati 108 test ZeroContext, typecheck, build e smoke test bundle con cinque
cambi Originali/ABTT nello stesso processo e ripristino della scelta al reconnect.

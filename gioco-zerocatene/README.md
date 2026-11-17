# ⛓️ ZeroReazioniACatena

> **Revisione documentale — 16 novembre 2026.** Il gioco continua a derivare i dati dai bacini di ZeroAssociazioni, senza una banca autonoma. La copia disponibile contiene 3.941 prompt: dopo l'aggiornamento dello schema `associazioni`, il server deve ricostruire le catene al successivo caricamento. Le variazioni della banca ZeroContext non aggiungono automaticamente nuove catene.
> [Indice e stato della documentazione](../docs/STATO_DOCUMENTAZIONE.md).

Parole legate tra loro da associazioni, in tre modalità che si danno il cambio (di base ogni 5 round, in
quest'ordine):

| Modalità | Come si gioca |
| --- | --- |
| **Effetto domino** | Si vede solo la prima parola della catena; le altre si trovano in ordine, una dopo l'altra |
| **Catena completa** | Si vedono la prima parola e, se la regia lo sceglie, anche l'ultima; le altre si trovano in qualsiasi ordine |
| **Parola chiave** | Una parola nascosta e le parole associate a lei, che compaiono una alla volta come indizi |

La regia può anche fissare una sola modalità. Quando nessuno indovina, «Rivela lettera o indizio» scopre una
lettera, oppure un indizio in più nella Parola chiave.

## Da dove vengono le catene

Il gioco non ha dati propri: questa cartella esiste per questo README. Le catene le costruisce il server dai
bacini verificati di [ZeroAssociazioni](../gioco-zeroassociations/README.md), cioè dallo schema `associazioni` di
[`database/giochi.sqlite3`](../database/README.md).

In una catena ogni parola è un prompt con un bacino verificato. La parola successiva è una delle sue associazioni
che è anch'essa un prompt, quindi ogni coppia di parole vicine è un'associazione verificata. Due parole troppo
simili non stanno mai una dopo l'altra: uguali, una dentro l'altra o con la stessa radice.

Il server costruisce 1.500 catene alla prima richiesta, con un seme fisso: al riavvio le catene restano le stesse.
Ogni catena ha da 5 a 9 parole, e l'overlay ne prende un tratto della lunghezza che gli serve. Quando entrano
nuovi bacini in ZeroAssociazioni (`python database/script/giochi.py aggiorna associazioni`), le catene cambiano.

## Nel codice

- Server: `apps/server/src/chains.ts` costruisce catene e indizi.
- Overlay: `apps/overlay/src/games/chainReaction.ts` (la partita) e `apps/overlay/src/games/chainLogic.ts`
  (punteggi, indizi e scelta delle catene).

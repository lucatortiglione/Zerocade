# Revisione del contesto delle domande e delle risposte

6 novembre 2026.

Controlli automatici su **26,715 domande**. Decisioni editoriali registrate: **820 correzioni**, **343 esclusioni reversibili**. Applicate al database: **1163/1163**.

Domande attive: **26,372**. Segnalazioni automatiche residue su domande attive: **0**.

Domande lette nel contesto, comprese le precedenti decisioni editoriali applicate: **1,195/26,715**. Confermate senza modifiche: **32**. Ancora da leggere: **25,520**. Letture invalidate da modifiche successive: **0**.

## Ambito effettivo

Sono stati controllati struttura, unicità delle alternative, riferimenti mancanti, distrattori fantastici nel contesto scientifico e traduzioni sospette. I candidati sono stati letti insieme a domanda, alternative, chiave e originale disponibile; le correzioni sono registrate per ID.

**Non è una verifica semantica e fattuale individuale completa delle 26.715 domande.** Il registro distingue letture contestuali, decisioni editoriali e soli controlli automatici. L’assenza di una segnalazione non certifica una domanda. Una lettura perde validità se cambia il contenuto della domanda o delle risposte.

La precedente revisione per pubblico italiano resta separata: qui non si escludono domande per argomento, provenienza o difficoltà.

## Riproducibilità

- `correzioni-risposte.json`: motivo, testo e tutte le opzioni prima/dopo, chiave e fonti consultate; le versioni precedenti conservano le revisioni intermedie.
- `verifica-contesto.json`: letture contestuali registrate, incluse le conferme senza modifiche, con impronta del testo verificato.
- `fonti/openbookqa/contesto-originale.json`: quesiti originali e fatti di supporto della fonte; usati per ricostruire l’intento, non assunti come garanzia di correttezza.
- `audit-risposte.json`: una riga per ogni ID e impronta del contenuto controllato.
- `backup-revisione/`: backup SQLite precedente a ogni applicazione o ripristino.
- `python gioco-quizzland/script/revisione_risposte.py apply`: applica le decisioni; rifiuta modifiche concorrenti.
- `python gioco-quizzland/script/revisione_risposte.py restore`: ripristina solo le decisioni di questo registro, se non modificate nel frattempo.
- `python gioco-quizzland/script/revisione_risposte.py audit`: rigenera il controllo dell’intero catalogo.

Il CSV rigenerato da `fonti.py csv` conserva queste correzioni e disattivazioni. Il server carica le domande all’avvio: riavviarlo per utilizzare il catalogo aggiornato.

## Interventi

| ID | Azione | Motivo |
| --- | --- | --- |
| q004 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| q003 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-9-519 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-9-57 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-9-618 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-9-966 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-10-1196 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-10-1201 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-10-146 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-10-515 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-10-597 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-10-664 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-12-1005 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-12-1171 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-12-1172 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-12-199 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-12-71 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-12-886 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-12-941 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-12-944 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-12-967 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-13-1055 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-13-117 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-7-194 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-13-204 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-13-28 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-13-368 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-13-647 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-13-783 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-13-805 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-13-830 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-13-91 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-13-919 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-13-99 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-14-106 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-14-219 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-14-606 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-14-918 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-14-984 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-1428 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-1570 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-7-574 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-8-113 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-8-461 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-9-344 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-9-444 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-9-68 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-14-967 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-12-625 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-8-481 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-9-936 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-12-491 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-7-653 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-14-709 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-9-439 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-9-904 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-7-1029 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-1998 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-14 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-14-1438 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-660 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-13-281 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-13-376 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-13-666 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-13-712 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-7-1070 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| arc-Mercury_SC_415388 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-10-1120 | escludi | Generalizzazione caricaturale sui rettili: nessuna risposta scientifica ben definita. |
| obqa-10-445 | escludi | Giustifica come innocue le emissioni da biomassa: premessa ingannevole e distrattori assurdi. |
| obqa-10-643 | escludi | Non specifica tipo di eclissi, osservatore e geometria; soluzione tradotta incomprensibile. |
| obqa-10-757 | escludi | Scenario e comportamento delle foche non specificati; traduzione non recuperabile con certezza. |
| obqa-12-113 | escludi | La risposta dipende da una persona e da danni non descritti; alternative prive di senso. |
| obqa-12-1130 | escludi | Rifiuto umano ambiguo fra escreti e rifiuti domestici; alternative non comparabili. |
| obqa-12-12 | escludi | Scenario nutrizionale privo di alternative informative. |
| obqa-12-1208 | escludi | Affermazione soggettiva sulla fortuna di un orso; nessun criterio verificabile. |
| obqa-12-160 | escludi | Un picnic ? possibile anche di notte; manca un criterio che distingua la risposta. |
| obqa-12-221 | escludi | Descrizione soggettiva dell?Artico; risposte di categorie diverse. |
| obqa-12-353 | escludi | Riferimento al vulcanismo lunare troppo generico per sostituire i distrattori senza revisione specifica. |
| obqa-12-388 | escludi | Persone non introdotte nella domanda; non chiarisce esposizione al fumo. |
| obqa-12-400 | escludi | Generalizzazione sui pesci gatto senza specie o condizioni. |
| obqa-12-443 | escludi | Il collegamento fra temperatura e margherite non determina una risposta univoca. |
| obqa-12-448 | escludi | Confonde fitoplancton e zooplancton; risposta tautologica. |
| obqa-12-487 | escludi | Antropomorfismo sul senso della famiglia degli uccelli; non verificabile cos? formulato. |
| obqa-12-833 | escludi | La pioggia non ? da sola il processo che definisce la formazione di sedimenti. |
| obqa-12-914 | escludi | Non si pu? dedurre il motivo per cui una gallina attraversa la strada. |
| obqa-12-965 | escludi | Confonde riproduzione, geni e caratteri complessi; risposta non univoca. |
| obqa-13-1006 | escludi | Risposta tautologica e scenario commerciale insufficiente. |
| obqa-13-1048 | escludi | Affermazione imprecisa sui fiumi nei ghiacciai; alternative senza senso. |
| obqa-13-131 | escludi | Metafora della pelle terrestre presentata come classificazione scientifica. |
| obqa-13-145 | escludi | Preferenza personale e alternative fantastiche, nessun criterio scientifico. |
| obqa-13-36 | escludi | Mancano luogo e condizioni meteorologiche per stabilire l?uso degli occhiali. |
| obqa-13-455 | escludi | Traduzione vaga di strutture riproduttive delle piante; alternative non confrontabili. |
| obqa-13-49 | escludi | Scaldare il latte non implica necessariamente la formazione di cagliata. |
| obqa-13-492 | escludi | Non identifica l?organismo n? il rapporto ecologico. |
| obqa-13-577 | escludi | La risposta ? un modo di dire tradotto letteralmente; il rischio non ? descritto. |
| obqa-13-980 | escludi | Anche molte uova di uccelli sono simmetriche: differenza proposta non valida. |
| obqa-14-10 | escludi | L?uso degli occhiali non si deduce dal solo mese e orario. |
| obqa-14-104 | escludi | Data impossibile fra le opzioni e andamento dell?alba compatibile con pi? periodi. |
| obqa-14-1111 | escludi | Domanda incompleta; inventato non descrive in modo scientifico l?etanolo. |
| obqa-14-1213 | escludi | Anatomia presentata con termini corrotti e risposte fantastiche; richiede riscrittura specialistica. |
| obqa-14-1265 | escludi | Domanda vaga sui danni a un bambino; nessun quesito definito. |
| obqa-14-129 | escludi | Non specifica la specie di fringuello; risposta tradotta senza significato. |
| obqa-14-133 | escludi | Manca la rete alimentare per dedurre gli effetti della scomparsa delle aquile. |
| obqa-14-1429 | escludi | Comportamento specifico di alcune specie, non identificate; domanda non generalizzabile. |
| obqa-14-761 | escludi | Statistica senza fonte o data; risposta semanticamente corrotta. |
| obqa-14-965 | escludi | Generalizzazione su tutte le popolazioni caraibiche e causalit? troppo semplificata. |
| obqa-14-972 | escludi | Chiede un possibile uso della torcia senza specificare la trasformazione energetica. |
| obqa-14-990 | escludi | Esplosione di liquido caldo non definisce una causa univoca della perdita dell?habitat. |
| obqa-8-184 | escludi | Frase incompleta e risposta generica molteplici cause. |
| obqa-7-236 | escludi | Sedimenti attorno a un capannone non provano un tornado; mancano osservazioni decisive. |
| obqa-1337 | escludi | Colore della confezione e liquido bianco non distinguono latte e candeggina. |
| obqa-12-768 | escludi | Una sommit? lavica non ? necessariamente pi? alta di qualsiasi valle o fiume. |
| obqa-11-265 | escludi | Pianeta umido non significa che i mari superino la superficie emersa; alternative equivalenti. |
| obqa-8-440 | escludi | La deformazione di una scarpa col calore non dimostra la fusione del materiale. |
| obqa-12-911 | escludi | Una crepa nel nucleo non ? necessaria al moto delle placche: chiave scientificamente errata. |
| obqa-10-748 | escludi | I nei non sono un semplice carattere trasmesso automaticamente dal padre; domanda ambigua. |
| arc-Mercury_SC_400854 | escludi | La forza gravitazionale dipende anche dalla massa: il Sole subisce dalla Terra una forza maggiore della Luna. |
| arc-MDSA_2007_8_15 | escludi | L?estensione delle attivit? non ? indicata: impossibile stabilire quale interessi meno superficie. |
| tta-622a1c397cc59eab6f950ce3 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-11-288 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-1176 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-12 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-12-23 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-12-745 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-14-670 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-12-959 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-14-778 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-1895 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-1202 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-7-452 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-10-683 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-11-620 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-7-866 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-10-772 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-14-1038 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-12-29 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-14-940 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-11-325 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-12-587 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-14-13 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-7-71 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-10-1013 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-10-1177 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-10-1217 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-10-619 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-10-653 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-11-191 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-11-52 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-11-671 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-12-1165 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-12-239 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-12-319 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-12-321 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-12-371 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-12-503 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-12-595 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-13-184 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-13-268 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-13-377 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-13-468 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-13-587 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-13-795 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-13-900 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-13-955 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-13-972 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-14-1125 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-14-1174 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-14-1459 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-14-55 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-14-567 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-9-106 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-9-151 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-9-329 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| arc-Mercury_SC_407570 | correggi | Terminologia verificata nel contesto scientifico e nell?originale: meter stick: metro a bastoncino ? Metro rigido; balance: equilibrio ? Bilancia |
| arc-Mercury_SC_408027 | correggi | Terminologia verificata nel contesto scientifico e nell?originale: balance: equilibrio ? Bilancia |
| arc-Mercury_SC_409886 | correggi | Terminologia verificata nel contesto scientifico e nell?originale: muscular: muscoloso ? Muscolare |
| arc-Mercury_SC_413301 | correggi | Terminologia verificata nel contesto scientifico e nell?originale: balance: equilibrio ? Bilancia |
| arc-Mercury_SC_LBS10764 | correggi | Terminologia verificata nel contesto scientifico e nell?originale: cells.: celle. ? Cellule |
| arc-NYSEDREGENTS_2005_4_13 | correggi | Terminologia verificata nel contesto scientifico e nell?originale: fall: cadere ? Autunno |
| arc-NYSEDREGENTS_2005_4_19 | correggi | Terminologia verificata nel contesto scientifico e nell?originale: hand lens: lente manuale ? Lente d?ingrandimento; balance: equilibrio ? Bilancia |
| arc-NYSEDREGENTS_2006_4_5 | correggi | Terminologia verificata nel contesto scientifico e nell?originale: balance: equilibrio ? Bilancia |
| arc-NYSEDREGENTS_2006_4_7 | correggi | Terminologia verificata nel contesto scientifico e nell?originale: balance: equilibrio ? Bilancia; hand lens: lente manuale ? Lente d?ingrandimento |
| arc-NYSEDREGENTS_2007_8_22 | correggi | Terminologia verificata nel contesto scientifico e nell?originale: cells: celle ? Cellule |
| arc-NYSEDREGENTS_2009_4_2 | correggi | Terminologia verificata nel contesto scientifico e nell?originale: hearing: udienza ? Udito; alternative rese omogenee come nomi dei sensi. |
| arc-NYSEDREGENTS_2009_8_28 | correggi | Terminologia verificata nel contesto scientifico e nell?originale: cells: celle ? Cellule |
| arc-NYSEDREGENTS_2009_8_6 | correggi | Terminologia verificata nel contesto scientifico e nell?originale: cells: celle ? Cellule |
| arc-NYSEDREGENTS_2011_4_8 | correggi | Terminologia verificata nel contesto scientifico e nell?originale: hearing: udienza ? Udito; alternative rese omogenee come nomi dei sensi. |
| arc-TIMSS_1995_8_N6 | correggi | Terminologia verificata nel contesto scientifico e nell?originale: Cells: Celle ? Cellule |
| arc-TIMSS_2007_8_pg118 | correggi | Terminologia verificata nel contesto scientifico e nell?originale: muscular: muscoloso ? Muscolare |
| arc-VASoL_2007_3_8 | correggi | Terminologia verificata nel contesto scientifico e nell?originale: Hearing: Udienza ? Udito; alternative rese omogenee come nomi dei sensi. |
| arc-VASoL_2009_5_33 | correggi | Terminologia verificata nel contesto scientifico e nell?originale: Balance: Saldo ? Bilancia |
| arc-AKDE&ED_2008_4_22 | correggi | Terminologia verificata nel contesto scientifico e nell?originale: hand lens: lente manuale ? Lente d?ingrandimento |
| arc-Mercury_408929 | correggi | Terminologia verificata nel contesto scientifico e nell?originale: fall: cadere ? Autunno |
| arc-Mercury_7041825 | correggi | Terminologia verificata nel contesto scientifico e nell?originale: muscular: muscoloso ? Muscolare |
| arc-Mercury_7081813 | correggi | Terminologia verificata nel contesto scientifico e nell?originale: cells.: celle. ? Cellule |
| arc-Mercury_7100415 | correggi | Terminologia verificata nel contesto scientifico e nell?originale: cells.: celle. ? Cellule |
| arc-Mercury_SC_400303 | correggi | Terminologia verificata nel contesto scientifico e nell?originale: meter stick: metro a bastoncino ? Metro rigido |
| arc-Mercury_SC_401111 | correggi | Terminologia verificata nel contesto scientifico e nell?originale: hand lens: lente manuale ? Lente d?ingrandimento |
| arc-Mercury_SC_408040 | correggi | Terminologia verificata nel contesto scientifico e nell?originale: fall: cadere ? Autunno |
| arc-NYSEDREGENTS_2014_4_18 | correggi | Terminologia verificata nel contesto scientifico e nell?originale: hearing: udienza ? Udito; alternative rese omogenee come nomi dei sensi. |
| arc-VASoL_2010_3_5 | correggi | Terminologia verificata nel contesto scientifico e nell?originale: Mass: Messa ? Massa |
| obqa-11-637 | escludi | Non esiste un?unica stagione piovosa per tutto il Nord America. |
| obqa-1171 | escludi | Un riflettore non ha un?efficacia determinata dalla sola stagione. |
| obqa-12-899 | escludi | Gioco di parole inglese spineless; nessuna domanda anatomica ben definita. |
| obqa-14-1423 | correggi | Terminologia verificata nel contesto scientifico e nell?originale: Cells: Celle ? Cellule |
| obqa-14-1457 | escludi | Testo incomprensibile e generalizzazione errata: non tutti gli elementi formano molecole. |
| obqa-399 | correggi | Terminologia verificata nel contesto scientifico e nell?originale: fall: cadere ? Autunno |
| obqa-10-322 | escludi | Scenario di segnalazione mal tradotto e alternativa corretta non sufficientemente definita. |
| obqa-10-727 | escludi | La visita di api non garantisce un particolare numero di nuove piante l?anno successivo. |
| obqa-10-746 | escludi | Testo incomprensibile: confonde piante e impianti, fenomeni e azioni. |
| obqa-12-299 | escludi | Specie e forma di mimetismo non specificate; distrattori non comparabili. |
| obqa-12-779 | escludi | La creazione di un roseto da parte di un cervo non si deduce dal testo. |
| obqa-13-551 | escludi | Domanda incompleta: le opzioni sono luoghi ma manca il quesito geografico. |
| obqa-13-746 | escludi | Molti scoiattoli mangiano anche insetti; pi? risposte plausibili. |
| obqa-14-836 | escludi | Cugino della talpa non identifica una specie o un?alimentazione. |
| obqa-1596 | escludi | La risposta confonde produzione vegetale e necessit? di tutti gli animali. |
| obqa-10-1085 | escludi | Luce solare importante per comunit? ? vaga, non esclude gli altri organismi proposti. |
| obqa-10-1162 | escludi | Sia acqua sia CO? sono materie prime della fotosintesi: due risposte corrette. |
| obqa-10-730 | escludi | La dimensione del gruppo non migliora sempre la sopravvivenza: mancano specie e condizioni. |
| obqa-11-346 | escludi | Et? non specificata e risposte non omogenee; nessuna soluzione univoca. |
| obqa-11-523 | escludi | La presenza di trattamenti non implica automaticamente malattia: mancano residui e quantit?. |
| obqa-11-540 | escludi | Kettle tradotto come bollitore; dinamica geologica non definita correttamente. |
| obqa-11-632 | escludi | Nessuna risorsa nel terreno ? infinita; premessa falsa. |
| obqa-12-640 | escludi | Il terreno disponibile per una felce non ? infinito. |
| obqa-12-93 | escludi | Vivere sottoterra non permette di dedurre l?assenza di predatori. |
| obqa-13-428 | escludi | Vivere sottoterra non permette di dedurre l?assenza di predatori. |
| obqa-14-1002 | escludi | Presuppone senza evidenza un proiettile non rintracciabile; soluzione non affidabile. |
| obqa-14-1100 | escludi | Lo zucchero pu? sciogliersi in pi? mezzi proposti a seconda delle condizioni. |
| obqa-9-496 | escludi | Un?erbaccia non vive esclusivamente nel terreno; esistono altri substrati. |
| obqa-7-435 | escludi | Il terreno non garantisce crescita robusta e non ? indispensabile in idroponica. |
| obqa-8-49 | escludi | Scenario domestico senza quesito scientifico; distrattori assurdi. |
| obqa-9-942 | escludi | Le felci non producono semi: premessa scientificamente errata. |
| obqa-10-455 | escludi | Una modifica piccola non distrugge necessariamente un ecosistema. |
| obqa-10-628 | escludi | Pi? alternative possibili per il legno morto, a seconda del contesto. |
| obqa-10-644 | escludi | Statura non determinata dai soli genitori; testo e alternative poco definiti. |
| obqa-10-649 | escludi | Non tutti gli organismi hanno il senso del gusto: premessa falsa. |
| obqa-10-790 | escludi | Ali non definite dal testo e non presenti in tutti gli adulti a metamorfosi incompleta. |
| obqa-11-154 | escludi | Modifica della superficie terrestre non specificata; distrattori senza senso. |
| obqa-12-1000 | escludi | Un microscopio non osserva la malattia raffreddore; va specificato un agente o campione. |
| obqa-12-1058 | escludi | Produrre pasta con il vento richiede macchinari non descritti. |
| obqa-12-1123 | escludi | Vitale per il basilico non distingue impollinazione, crescita e riproduzione. |
| obqa-12-115 | escludi | Confusione tra popolazione e comunit? e risposta nominale poco comprensibile. |
| obqa-12-1182 | escludi | Vivacit? non identifica il beneficio della simbiosi corallo-alghe. |
| obqa-12-1197 | escludi | Domanda tautologica con alternative non grammaticali. |
| obqa-12-220 | escludi | Testo incomprensibile; pi? gruppi biologici possono deporre uova. |
| obqa-12-313 | escludi | Energia della Terra non specifica il processo di generazione del campo magnetico. |
| obqa-12-35 | escludi | Riciclare plastica creando berretti richiede un processo non descritto. |
| obqa-12-481 | escludi | Estirpare una radice non garantisce l?assenza di ricrescita per tutte le piante. |
| obqa-12-634 | escludi | Procedura medica non identificata; non si pu? inferire il trattamento dal solo ago. |
| obqa-12-658 | escludi | Vestiti ? una metafora, non una funzione botanica definita. |
| obqa-12-663 | escludi | Premessa universale falsa: non tutti gli animali necessitano di un compagno per riprodursi. |
| obqa-12-888 | escludi | Un danno al tappeto richiede esposizione non specificata; alternative prive di senso. |
| obqa-12-983 | escludi | Regioni viventi non ? una risposta definita; distrattori fantastici. |
| obqa-1210 | escludi | Mancanza di magnetismo non spiega ogni modo in cui un coltello pu? aderire a una coperta. |
| obqa-13-1007 | escludi | Confonde reagenti e prodotti della fotosintesi. |
| obqa-13-251 | escludi | Non identifica il corpo celeste e il liquido che precipita. |
| obqa-13-334 | escludi | Effetto del freddo senza soglia, specie o condizioni; alternative assurde. |
| obqa-13-504 | escludi | Regioni bumpless ? un residuo inglese vago; non identifica una struttura lunare. |
| obqa-13-573 | escludi | La dieta dipende dalla specie di aquila, non indicata. |
| obqa-13-607 | escludi | Marmi ? una traduzione errata di biglie, ma il fenomeno dipende dal materiale e dalla geometria. |
| obqa-13-83 | escludi | Salire e scendere non implica il trasporto da parte di un agente: criterio insufficiente. |
| obqa-13-853 | escludi | Intensit? dell?uragano non determinata da generica piccantezza o sola umidit?. |
| obqa-13-936 | escludi | Il ferro pu? essere usato in molti prodotti: alternative non omogenee. |
| obqa-13-958 | escludi | Vivacit? non ? una propriet? biologica ben definita. |
| obqa-14-1194 | escludi | Regioni viventi non ? una risposta definita; distrattori fantastici. |
| obqa-14-1268 | escludi | Sono presenti i quarzi non costituisce una domanda comprensibile. |
| obqa-14-1409 | escludi | Struttura umana non ? una patologia; formulazione medica priva di senso. |
| obqa-14-1489 | escludi | Il possibile uso dell?energia solare non ? delimitato dal testo. |
| obqa-14-188 | escludi | Confonde adattamento evolutivo di popolazioni e cambiamento volontario del singolo pesce. |
| obqa-14-270 | escludi | La temperatura del magma non supera sempre quella di fusione dell?acciaio. |
| obqa-14-572 | escludi | Tariffa ? una traduzione errata di nutrimento; domanda non definisce il processo. |
| obqa-14-582 | escludi | Il semplice rimpicciolimento non identifica il vento come unica causa. |
| obqa-14-638 | escludi | Scenario non definito e distrattori affettivi senza senso. |
| obqa-14-730 | escludi | Preferenze alimentari generalizzate; anche orsi e pesci possono mangiare cereali. |
| obqa-14-805 | escludi | Le salamandre non si trovano necessariamente sotto statue da giardino. |
| obqa-14-9 | escludi | Terremoto ? una traduzione non pertinente per vibrazioni microscopiche. |
| obqa-779 | escludi | Intensit? delle vibrazioni non determinabile senza caratteristiche delle sorgenti sonore. |
| obqa-8-310 | escludi | Il testo non dimostra mimetismo del gufo come unica spiegazione. |
| obqa-8-397 | escludi | Arrotolare la lingua non ? un semplice carattere mendeliano da quadrato di Punnett. |
| obqa-9-1028 | escludi | Infermiera ? il sostantivo sbagliato per il verbo allattarsi; scenario e distrattori confusi. |
| obqa-9-551 | escludi | Il surriscaldamento del motore non si attribuisce univocamente allo sfregamento. |
| obqa-1392 | escludi | Tutti i sensi elencati coinvolgono nervi; pi? risposte difendibili. |
| obqa-7-524 | escludi | Risposta tautologica sull?invisibilit? dei vulcani sottomarini; manca il processo formativo. |
| otdb-e991f960a2 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| tta-622a1c367cc59eab6f95039e | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| tta-646262f6ab138b829b81ea6f | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| tta-622a1c377cc59eab6f95043d | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| tta-64f6d9c9660c3a8d96010205 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| tta-622a1c3a7cc59eab6f950fd3 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| tta-622a1c367cc59eab6f950124 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| otdb-a3cbe3fb6d | escludi | Le opzioni sono traslitterazioni dello stesso nome: la soluzione dipende dall?edizione. |
| otdb-3d40a7e964 | escludi | Lord Genome e Lordgenome indicano lo stesso personaggio: due risposte equivalenti. |
| otdb-bdce90a70e | escludi | Primo videogioco dipende dalla definizione; manca una data e la risposta proposta non ? un primato univoco. |
| obqa-828 | escludi | Due distrattori sono identici salvo il punto e la premessa nutrizionale non specifica il bilancio energetico. |
| arc-Mercury_7071628 | escludi | Sistema immunitario indebolito non identifica una sola malattia fra quelle elencate. |
| arc-Mercury_7193043 | correggi | Weathering indica alterazione/disgregazione in situ; distinto dall?erosione che asporta materiale. |
| arc-AKDE&ED_2012_4_39 | correggi | Weathering indica alterazione/disgregazione in situ; distinto dall?erosione che asporta materiale. |
| arc-MCAS_2010_8_12006 | correggi | Weathering indica alterazione/disgregazione in situ; distinto dall?erosione che asporta materiale. |
| arc-Mercury_400574 | correggi | Weathering indica alterazione/disgregazione in situ; distinto dall?erosione che asporta materiale. |
| arc-Mercury_404924 | correggi | Weathering indica alterazione/disgregazione in situ; distinto dall?erosione che asporta materiale. |
| arc-Mercury_7025025 | correggi | Weathering indica alterazione/disgregazione in situ; distinto dall?erosione che asporta materiale. |
| arc-Mercury_7041388 | correggi | Weathering indica alterazione/disgregazione in situ; distinto dall?erosione che asporta materiale. |
| arc-Mercury_7068425 | correggi | Weathering indica alterazione/disgregazione in situ; distinto dall?erosione che asporta materiale. |
| arc-Mercury_LBS10523 | correggi | Weathering indica alterazione/disgregazione in situ; distinto dall?erosione che asporta materiale. |
| arc-Mercury_SC_400187 | correggi | Weathering indica alterazione/disgregazione in situ; distinto dall?erosione che asporta materiale. |
| arc-Mercury_SC_400707 | correggi | Weathering indica alterazione/disgregazione in situ; distinto dall?erosione che asporta materiale. |
| arc-Mercury_SC_401789 | correggi | Weathering indica alterazione/disgregazione in situ; distinto dall?erosione che asporta materiale. |
| arc-Mercury_SC_402284 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| arc-Mercury_SC_405490 | correggi | Weathering indica alterazione/disgregazione in situ; distinto dall?erosione che asporta materiale. |
| arc-Mercury_SC_405495 | correggi | Weathering indica alterazione/disgregazione in situ; distinto dall?erosione che asporta materiale. |
| arc-Mercury_SC_413002 | correggi | Weathering indica alterazione/disgregazione in situ; distinto dall?erosione che asporta materiale. |
| arc-Mercury_SC_LBS10174 | correggi | Weathering indica alterazione/disgregazione in situ; distinto dall?erosione che asporta materiale. |
| arc-NYSEDREGENTS_2013_8_27 | correggi | Weathering indica alterazione/disgregazione in situ; distinto dall?erosione che asporta materiale. |
| arc-AKDE&ED_2012_4_10 | correggi | Weathering indica alterazione/disgregazione in situ; distinto dall?erosione che asporta materiale. |
| arc-MCAS_2006_5_8 | correggi | Weathering indica alterazione/disgregazione in situ; distinto dall?erosione che asporta materiale. |
| arc-Mercury_SC_408584 | correggi | Weathering indica alterazione/disgregazione in situ; distinto dall?erosione che asporta materiale. |
| arc-Mercury_7183225 | correggi | Weathering indica alterazione/disgregazione in situ; distinto dall?erosione che asporta materiale. |
| obqa-9-597 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-13-536 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-14-1095 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-1923 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-10-1055 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-12-624 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-12-697 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-13-903 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-13-933 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-14-566 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-14-63 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-14-838 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-9-559 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-7-459 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-10-156 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-10-673 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-10-975 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-12-616 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-12-629 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-12-694 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-13-626 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-14-1377 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-9-1188 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-9-280 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-433 | escludi | Moto circolare non implica aumento del modulo della velocit?; pi? alternative coinvolgono forze. |
| obqa-570 | escludi | Una tastiera non ha corde da pizzicare e anche un sonaglio pu? produrre musica. |
| obqa-10-489 | escludi | Non si dimostra dal tipo di edificio quale inquinamento sia pi? difficile da contenere. |
| obqa-10-589 | escludi | Una nuvola non provoca necessariamente brividi; manca la soglia termica. |
| obqa-10-650 | escludi | Privo di pezzi non descrive adeguatamente il trattamento dell?acqua. |
| obqa-11-271 | escludi | Il bamb? pu? crescere senza terreno; anche gli altri oggetti richiedono terreno in altri sensi. |
| obqa-1115 | escludi | Le alternative sono impianti, non sostanze respirabili: domanda di categoria errata. |
| obqa-12-142 | escludi | Pieghe geologiche attribuite a bunker che tremano: nesso non scientifico. |
| obqa-12-216 | escludi | Impianto moderno non prova l?uso di una specifica invenzione di Edison. |
| obqa-12-577 | escludi | Domanda basata su simboli e cartoni non spiegati, con descrizione eccessivamente contorta. |
| obqa-12-602 | escludi | Adobe e impianto elettrico non sono contestualizzati; alternative prive di senso. |
| obqa-12-992 | escludi | La pupilla ? un?apertura, non assorbe la luce; chiave scientificamente errata. |
| obqa-13-275 | escludi | Impianto non specifica un dispositivo a benzina: mancano dati decisivi. |
| obqa-13-42 | escludi | Un oggetto tangibile non garantisce luce nella pupilla; alternative non omogenee. |
| obqa-13-561 | escludi | Senza testamento ? una traduzione corrotta; scenario meteorologico incompleto. |
| obqa-14-1214 | escludi | Frattura da oscillazione non definisce oggetto e condizioni dell?impatto. |
| obqa-14-573 | escludi | Non si deduce dal cielo verde che portare un ombrello sia una risposta appropriata. |
| obqa-14-643 | escludi | Anche gli impianti di riciclaggio possono avere impatti ambientali; criterio non definito. |
| obqa-274 | escludi | Bollire non elimina tutte le sostanze dall?acqua: risposta generica e ingannevole. |
| obqa-9-150 | escludi | La risposta brivido non completa il testo che parla di morte. |
| obqa-9-443 | escludi | Non ? indicata l?ereditariet? del tratto; distrattore con gattini senza senso. |
| obqa-10-622 | escludi | La dispersione dei cromosomi delle banane non ? una descrizione corretta dell?impollinazione. |
| obqa-10-173 | escludi | Studiare terreno non significa necessariamente studiare microrganismi. |
| obqa-10-73 | escludi | La possibilit? di migrazione non ? contemplata; alternative non pertinenti. |
| obqa-11-343 | escludi | Suolo e dirt diventano risposte equivalenti in italiano. |
| obqa-11-457 | escludi | Confusione fra periodo orbitale e rotazione lunare con alternative non comparabili. |
| obqa-11-646 | escludi | Le lentiggini non sono deducibili dal solo contributo genetico di un genitore. |
| obqa-12-1015 | escludi | Stato del piatto in lavastoviglie non determinabile senza indicare fase e temperatura. |
| obqa-12-1081 | escludi | La cottura dipende da temperature e durata non indicate. |
| obqa-12-963 | escludi | Uso del vento non implica un prodotto assolutamente privo di inquinamento. |
| obqa-13-52 | escludi | Non tutti i microrganismi sul cibo provocano malattia. |
| obqa-13-797 | escludi | Contano il bilancio energetico e il fabbisogno, non il confronto con le sole calorie precedenti. |
| obqa-14-37 | escludi | Un trapianto non garantisce facile acclimatazione; condizioni assenti. |
| obqa-14-1451 | escludi | Mangiare gusci duri non implica necessariamente dispersione di semi. |
| obqa-14-578 | escludi | Detriti non identifica adeguatamente la dieta del procione. |
| obqa-14-637 | escludi | La porosit? pu? aumentare il volume sia di aria sia di acqua, secondo la saturazione. |
| obqa-8-84 | escludi | Erba e biocarburanti non sono alternative esclusive; manca il dispositivo di conversione. |
| obqa-9-512 | escludi | Periodicit? delle maree semplificata in modo ambiguo e risposte non omogenee. |
| obqa-1629 | escludi | Citt? non implica un?alimentazione particolare; alternativa Ohio fuori contesto. |
| obqa-9-259 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-9-250 | correggi | Domanda e alternative riscritte insieme: significato esplicito, opzioni coerenti e una sola risposta corretta. |
| obqa-1003 | correggi | Una turbina generica può usare combustibili fossili: precisata la fonte eolica e rese omogenee le alternative. |
| obqa-1023 | correggi | Frase incompleta: esplicitato il generatore e la conversione energetica richiesta. |
| obqa-1032 | correggi | Anche i movimenti delle piante richiedono energia: precisata la locomozione animale. |
| obqa-1038 | correggi | Eliminato il frammento grammaticale finale e formulate unità confrontabili. |
| obqa-1047 | correggi | Distinta l’evaporazione dall’infiltrazione; eliminate conseguenze estranee alla domanda. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-1088 | correggi | Le zampe servono anche a camminare: il quesito riguarda ora specificamente la membrana natatoria. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-1095 | correggi | Rimosse risposte fuori contesto; esplicitata la funzione isolante dell’aria trattenuta. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-1112 | correggi | Precisato il confronto sulla nascita, prima espresso come generico inizio della vita. |
| obqa-1126 | correggi | Le opzioni originali includevano altre situazioni di evaporazione: distinta l’ebollizione. |
| obqa-1129 | escludi | La probabilità di nebbia non si deduce dal solo ambiente: mancano umidità e condizioni meteorologiche; anche tundra e pianura possono avere nebbia frequente. |
| obqa-1137 | correggi | Il riferimento ai castelli era incompleto: resa diretta la domanda sul materiale delle dune. |
| obqa-1139 | correggi | Completata la frase e chiarito il ruolo alimentare richiesto. |
| obqa-1150 | correggi | Gli oggetti fermacarte non hanno tutti lo stesso materiale: specificata una graffetta di acciaio. |
| obqa-1160 | escludi | Confronto sull’umidità di un viaggio privo di date o misure; la sola lista di città non consente una risposta univoca, e Phoenix è tradotto come Fenice. |
| obqa-1161 | correggi | Eliminate alternative fantastiche e distinta l’apparenza illuminata dalla forma fisica. |
| obqa-1170 | correggi | Le alternative smartphone e rana non avevano relazione con la classificazione dello strumento. |
| obqa-1180 | correggi | Reso esplicito il contrasto oviparità/viviparità e sostituite parole isolate con affermazioni verificabili. |
| obqa-1184 | correggi | Precisato il ruolo delle riserve del seme; rimosse espressioni vaghe come elementi di sostegno vitale. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-1189 | correggi | Esplicitati animale e funzione termica; alternative riferite tutte allo stesso fenomeno. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-1200 | correggi | Il 29 febbraio non è il giorno con meno luce: precisato l’emisfero e corretta la chiave concettuale. |
| obqa-1215 | correggi | Corretta la grammatica e reso esplicito il riciclo attraverso la decomposizione. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-1231 | correggi | Chiarito il collegamento tra spezie e cellule vegetali; sostituite alternative di categorie estranee. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-1239 | correggi | Lo xilema trasporta acqua e sali, non pioggia o piantine; separato il ruolo del floema. |
| obqa-1240 | correggi | Due alternative originali descrivevano increspature: sostituite con fenomeni distinti. |
| obqa-1271 | correggi | Mancavano luogo e stagione; eliminato il confronto indiretto due mesi prima. |
| obqa-1272 | correggi | Seals era tradotto sigilli: corretto in foche e precisata la distinzione innato/appreso. |
| obqa-1300 | correggi | Resa interrogativa la frase e allineati i distrattori alla distinzione eredità/apprendimento. |
| obqa-1301 | correggi | Specificato che cardinale indica l’uccello. |
| obqa-1309 | correggi | La generica osservazione del terreno non implicava il microscopio: precisata la scala. |
| obqa-132 | correggi | Esplicitate elasticità, chiusura e riscaldamento moderato necessari alla dilatazione. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-1321 | correggi | L’Artico non è tutto bianco; rimosse spiegazioni surreali e riferita la domanda alla neve. |
| obqa-1334 | correggi | Sostituiti scenari di fulminazione poco controllati con il meccanismo della conduzione nell’acqua salata. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-1345 | correggi | Eliminata l’espressione antropomorfa lavoro della vita; funzioni degli organi vegetali confrontabili. |
| obqa-1359 | correggi | La luce fornisce energia, non è un reagente materiale; eliminata la risposta dei frullati proteici. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-1387 | correggi | Anche il fiammifero era corretto: ora solo una fonte luminosa deriva da combustione. |
| obqa-1391 | escludi | Il confronto di altitudine non specifica la posizione degli oggetti; 6 pollici/6 piedi è ambiguo e l’altezza non equivale all’altitudine. |
| obqa-1393 | correggi | Sostituito il riferimento circolare prima fase del mese con una sequenza lunare esplicita. |
| obqa-1457 | correggi | Specificati mare e profilo costiero: un aumento generico dell’acqua non implica una spiaggia più stretta. |
| obqa-1458 | correggi | Un motore spento non implica immobilità: corretta la condizione di velocità nulla. |
| obqa-147 | correggi | Riparata la struttura grammaticale; esplicitato che il confronto riguarda proprietà rilevabili tramite eco. |
| obqa-1500 | correggi | Evitata l’assoluta principale causa di erosione, che dipende dall’ambiente; definito il contesto fluviale. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-1502 | correggi | Il Sole è l’unica stella del sistema solare; collegata l’inclinazione a durata e intensità dell’illuminazione. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-1506 | correggi | Reso esplicito il rapporto tra copertura nuvolosa e luce, evitando che notte serena sia un’altra risposta pertinente. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-1508 | correggi | Eliminato il confronto indefinito sull’inquinamento e distinte fonti energetiche da accumulatori. |
| obqa-1528 | correggi | Corretta la traduzione depauperare e precisato il trasporto eolico. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-1530 | correggi | La domanda generica su cosa viaggia nell’aria aveva distrattori estranei; precisata la propagazione del suono. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-1531 | correggi | Precisato il gruppo di animali interessato: non tutti gli habitat reagiscono nello stesso modo. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-1545 | correggi | Specificata la temperatura per escludere ossigeno liquido; sostituito fulmine, che non è una sostanza. |
| obqa-1554 | correggi | Completata la domanda e sostituite alternative non informative come gusci inutili. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-1560 | correggi | Aggiungere nastro poteva cambiare anch’esso la forma: rimossa la seconda possibilità valida. |
| obqa-1568 | correggi | Precisati i materiali e lo stato asciutto degli isolanti; corretto ancoraggio in ancora. |
| obqa-1572 | correggi | Un mammifero non è un oggetto: ricostruita la domanda sull’escrezione con organi pertinenti. |
| obqa-1577 | correggi | Esplicitata la parte vegetale della dieta: mangiare piante poteva suggerire erroneamente un erbivoro esclusivo. |
| obqa-158 | escludi | Habitat arboreo formulato come esclusione assoluta: anche un leone può usare un albero per riposare e scimmia non identifica una specie. |
| obqa-1582 | correggi | Specificato l’incrocio: un generico strumento di probabilità ereditaria non ha sempre almeno quattro caselle. |
| obqa-1611 | correggi | Esplicitati ferro e bobina e distinta magnetizzazione da carica elettrica. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-1618 | correggi | Riparata la frase e confrontate condizioni coerenti con la propagazione dell’incendio. |
| obqa-162 | escludi | L’ora non determina se un cane trema: mancano temperatura, luogo e condizioni dell’animale. La fonte presume arbitrariamente che le 5 siano più fredde. |
| obqa-163 | correggi | I termini commerciale e privato non determinano le dimensioni: precisati tipo e capacità. |
| obqa-1635 | correggi | Persone non è una causa sufficiente del deflusso: ricostruita la definizione senza il presupposto agricolo errato della fonte. |
| obqa-1660 | correggi | Precisate durata, massa e condizioni; la forza da sola non determina una distanza universale. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-167 | correggi | Distinta l’accelerazione gravitazionale locale dalla generica forza gravitazionale e specificato il riferimento per il gigante gassoso. |
| obqa-1672 | correggi | Fall era tradotto caduta; ripristinati autunno e funzione delle scorte. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-1674 | escludi | Non è garantito che madre e figlia abbiano lo stesso numero di unghie; mancano condizioni e il semplice confronto non dimostra l’ereditarietà. |
| obqa-1698 | correggi | Sostituito un alcol semplice con il prodotto specifico e rese omogenee le alternative. |
| obqa-170 | correggi | Rimosse larva/adulto e ibridi normalmente sterili, che rendevano ambiguo il confronto riproduttivo. |
| obqa-1702 | correggi | La somiglianza è un indizio coerente, non una prova isolata; rese pertinenti le alternative. |
| obqa-1709 | correggi | Impollinare favorisce la fecondazione, non garantisce semplicemente che una pianta continui a fiorire. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-1712 | correggi | Limitata l’analogia alla capillarità, senza identificarla con l’intero meccanismo di trasporto dello xilema. |
| obqa-1759 | correggi | Eliminati riferimenti fuori contesto a mercurio nel sangue e 98,6 senza unità. |
| obqa-1774 | correggi | Il pannolino non dimostra la digestione e la traduzione non aveva soggetto: chiesto il processo biologico. |
| obqa-178 | correggi | Una frana può essere rocciosa: ristretto il contesto alla colata di fango. |
| obqa-1780 | escludi | La primavera non implica necessariamente api anziché neve o polvere; mancano luogo e condizioni, e tutte le alternative possono coesistere. |
| obqa-1787 | correggi | Il solo assorbimento di calore non basta: specificato il bilancio negativo dell’acqua. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-1795 | correggi | Jersey non era identificato come bovino; eliminati mucca e nei dalla lista di alimenti. |
| obqa-1823 | correggi | Sostituita la metafora tesoro/spazzatura con il legame esplicito tra i due processi. |
| obqa-1835 | escludi | Esistono foche artiche, mediterranee e tropicali: senza specie non c’è una scelta univoca tra gli ambienti proposti. |
| obqa-1852 | correggi | Autotrofia non significa autosufficienza per ogni nutriente: corretta la definizione. |
| obqa-187 | correggi | Nella versione originale la luce era trattata come input accanto a sostanze: ora il confronto è esplicito tra reagenti e prodotto. |
| obqa-1890 | correggi | Mimetismo non richiede una riconfigurazione volontaria: chiarito l’effetto della colorazione sul riconoscimento visivo. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-1911 | correggi | Lo sversamento è un rischio, non una conseguenza inevitabile; distinta l’attività naturale del mare. |
| obqa-1918 | correggi | Precisato l’habitat naturale, evitando di dire che il freddo gelido è una condizione costante assoluta. |
| obqa-1924 | correggi | Esistono deserti freddi: sostituita l’associazione assoluta con sole e caldo con l’aridità. |
| obqa-1937 | correggi | Aggiunto l’uso concreto della macchina semplice per rendere univoca la forma energetica. |
| obqa-1942 | correggi | La scarsità non induce necessariamente parsimonia: sostituita la risposta antropomorfa con la competizione. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-1948 | correggi | Non tutti i carnivori uccidono prede vive: chiesta la dieta anziché rendere universale la predazione. |
| obqa-1954 | correggi | Distinta l’attrazione di un materiale ferromagnetico dall’essere esso stesso un magnete permanente. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-1955 | correggi | Il generico effetto dei fulmini ammetteva più risposte: specificato l’innesco di un incendio. |
| obqa-202 | correggi | Ripristinato il contesto dell’inchiostro presente nella fonte; corretto polipo in polpo. |
| obqa-224 | correggi | Mine significava miniera, non mina esplosiva; specificata l’estrazione sotterranea. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-226 | correggi | Anche moto e bici possono essere elettriche: specificata l’alimentazione di ciascuna alternativa. |
| obqa-229 | correggi | L’attività nucleare era generica: precisato il meccanismo che alimenta il Sole. |
| obqa-257 | correggi | Precisata la massa dei ghiacciai anziché un confronto tra quantità di natura diversa. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-266 | correggi | Anche i nervi partecipano alla visione: specificate posizione e funzione della cornea. |
| obqa-268 | correggi | Le alternative originali potevano verificarsi contemporaneamente: chiesto il processo di usura. |
| obqa-276 | correggi | La crescita umana non è causata dal solo grano; preservato il tema originale delle colture alimentari senza suggerimenti nutrizionali infondati. |
| obqa-279 | correggi | Specificati materiale e condizioni per evitare che umidità o componenti metallici cambino la risposta. |
| obqa-28 | escludi | La relazione forza-distanza non è universalmente diretta: mancano durata, massa, attrito e condizioni iniziali. Anche inverso/opposto sono distrattori sovrapposti. |
| obqa-280 | correggi | Conducibilità e temperatura erano confuse; confrontati materiali senza inventare temperature degli oggetti. |
| obqa-283 | correggi | Rimossi indizi enciclopedici indiretti sugli stati federati e confrontati nomi di fiumi. |
| obqa-3 | correggi | Sostituito il generico inquinamento con il processo caratteristico della discarica; eliminate patatine e camminare. |
| obqa-326 | correggi | Eliminati fiammifero e seduta, traduzioni fuori contesto, e il riferimento a date variabili. |
| obqa-342 | escludi | Non si può dedurre che un alimento sia nocivo dal solo fatto che non è biologico; la presenza e la dose di contaminanti non sono indicate. |
| obqa-35 | escludi | Il mese in cui trovare più piante morte dipende da specie, clima, emisfero e gestione del terreno; gennaio non è una risposta universale. |
| obqa-359 | correggi | Comodità non era una grandezza definita; precisati assorbimento, materiale ed esposizione, corretto marina da navy. |
| obqa-378 | correggi | Le formazioni lunari includono anche strutture vulcaniche: limitata la domanda ai crateri d’impatto. |
| obqa-381 | correggi | Le piante possono riprodursi anche vegetativamente: specificati organo e processo sessuato. |
| obqa-385 | correggi | Sostituite perifrasi culturali con gli animali e reso esplicito il criterio alimentare. |
| obqa-389 | correggi | Ricostruito il soggetto del frammento e distinta una trasformazione fisica da una chimica. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-397 | correggi | La fonte confondeva fossilizzazione e formazione di carburanti: ripristinato il processo indicato nel contesto originale. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-404 | correggi | L’evaporazione da sola non provoca una bufera; distinti i processi del ciclo idrologico. |
| obqa-406 | escludi | La vitamina D dei latticini dipende dal prodotto e dalla fortificazione; le alternative mescolano termini chimici e presunti trattamenti medici. Non recuperabile senza sostituire la premessa alimentare. |
| obqa-429 | correggi | I millilitri non hanno un limite d’uso fra 1 e 1000: chiesta la conversione effettiva. |
| obqa-437 | escludi | La protezione della pelle è associata senza spiegazione a una gamma commerciale; le altre alternative non sono prodotti o funzioni confrontabili e la fonte non supporta la specificità del marchio. |
| obqa-44 | correggi | Competenze era troppo generale: scelta una capacità sicuramente appresa e confrontata con risposte innate. |
| obqa-448 | correggi | Corrette le traduzioni asciugatrice/più difficile e ricostruito il rapporto decomposizione-suolo. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-470 | correggi | Rese naturali e omogenee le descrizioni di caccia, allevamento, raccolta e preparazione del cibo. |
| obqa-473 | correggi | Swedish Fish era il nome di una caramella, non un pesce svedese: sostituita l’ambiguità con il concetto alimentare. |
| obqa-474 | correggi | Assorbire ossigeno e rilasciare CO2 sono anche caratteristiche delle piante: sostituite risposte sovrapposte. |
| obqa-48 | correggi | Un lago da solo non garantisce fossilizzazione: specificato il seppellimento e il carattere possibile del processo. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-490 | correggi | Eliminata la falsa trasfusione di colore e il colore della carne come prova universale di cottura. |
| obqa-508 | escludi | Una visita alle terme non è una risposta sanitaria univoca: mancano obiettivo, condizioni personali e motivazione; la fonte parla soltanto del riposo. |
| obqa-520 | correggi | Sostituita la certezza romperà i tuoi vasi con una conseguenza possibile delle scosse. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-530 | correggi | La frase sulle ali come oggetto di attrito era confusa: chiarita la resistenza dell’aria in volo. |
| obqa-568 | escludi | Un albero può cadere pur essendo vivo; la caduta non ne dimostra la morte. La stessa implicazione errata è presente nel fatto di supporto della fonte. |
| obqa-591 | correggi | Amaro e malleabile erano proprietà improprie del terreno: formulate condizioni agronomiche comprensibili senza imporle a tutte le specie. |
| obqa-597 | correggi | Il cuore non è un esempio generico: chiesto il rapporto concreto tra organo e scheletro. |
| obqa-60 | correggi | Mantenuto normalmente, poiché alcuni mesi hanno due lune piene; eliminate due risposte che potevano essere valide in casi particolari. |
| obqa-605 | correggi | Balance era tradotto saldo invece di bilancia: chiariti strumento e grandezza. |
| obqa-609 | correggi | Preferito un foraggio tipico ai ceci senza contesto di razione; mantenuto il tema dell’alimentazione dei bovini. |
| obqa-620 | correggi | Sostituite configurazione concreta e forma ambigua con proprietà fisiche comprensibili. |
| obqa-630 | correggi | Indian era diventato l’indiano e Amazon l’Amazzonia: ripristinati i nomi dei corpi d’acqua. |
| obqa-636 | correggi | I musicisti possono esibirsi anche con sandali o flauti: esplicitata la protezione dell’udito. |
| obqa-644 | correggi | Precisata la parità di luce e sostituita conversione, che non indica una forma di energia. |
| obqa-648 | correggi | Eliminata la risposta tautologica deforestazione agricola; confrontate azioni umane concrete. |
| obqa-661 | escludi | Luminosità apparente non determinabile senza luminosità propria e distanze; una stella non è sempre più fioca di qualsiasi lampada descritta. |
| obqa-664 | escludi | La diminuzione dei colibrì non dimostra lo spostamento verso un’altra mangiatoia; mancano osservazioni che distinguano le cause. |
| obqa-676 | correggi | Non tutti gli animali polari hanno più grasso: ripreso il ruolo energetico delle riserve indicato dalla fonte. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-695 | correggi | Anche i lupi possono mangiare bacche: sostituito il confronto ambiguo fra coppie con la classificazione della dieta. |
| obqa-7-100 | correggi | Nuvole grigie non garantiscono precipitazioni e molecole cadenti era vago: definita la pioggia. |
| obqa-7-1018 | correggi | La chiave tirare su una ruota era errata: descritta la funzione della carrucola fissa. |
| obqa-7-1044 | correggi | Eliminata la domanda assoluta sulla sicurezza e la risposta nessuno di questi; indicato un effetto concreto. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-7-1050 | correggi | La metafora dell’acqua scomparsa era incomprensibile e suggeriva distruzione di materia. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-7-1053 | escludi | I deserti comprendono regioni polari con notte polare; elevata insolazione ed eccesso di sole non sono proprietà universali né definite quantitativamente. |
| obqa-7-1062 | correggi | Distinto lo scambio respiratorio dal trasporto ai tessuti svolto dalla circolazione. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-7-107 | correggi | La traduzione attribuiva l’estate australiana a giugno: esplicitato l’inverno nell’emisfero australe. |
| obqa-7-1077 | correggi | Eliminato in molti da in lots e specificato il riferimento: il vaso su un carro poteva muoversi. |
| obqa-7-108 | correggi | Ricostruita la domanda sulla combustione e rimossa la risposta nessuno di questi. |
| obqa-7-1105 | escludi | Aggiungere calore può favorire la crescita microbica o inattivare organismi a seconda di temperatura e durata. Non è specificato alcun trattamento sufficiente a distinguere le risposte. |
| obqa-7-1096 | correggi | Swallow era tradotto deglutire anziché rondine. |
| obqa-7-1108 | correggi | Gli ambienti non istituiscono norme: reso esplicito il comportamento di risparmio idrico. |
| obqa-7-1122 | escludi | Non sono indicate altitudini, orari o condizioni meteorologiche delle tappe; un passo non è necessariamente il punto più freddo del viaggio. |
| obqa-7-1128 | correggi | Un sismografo registra movimenti, non predice quanto sarà stabile il terreno. |
| obqa-7-1132 | correggi | Riparati Atomic 26 e alternative troncate; chiesto il dispositivo magnetico in modo diretto. |
| obqa-7-1138 | correggi | Precisata la soluzione acquosa e limitata l’affermazione alle temperature in cui il sale è efficace. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-7-1140 | correggi | Eliminata l’aritmetica indiretta dei quattro mesi e la data esatta variabile. |
| obqa-7-1159 | correggi | La nuova specie non garantisce da sola un calo: specificato l’aumento effettivo della predazione a parità di altri fattori. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-7-1170 | correggi | Calorie indica un’unità di energia: esplicitata la conversione dell’energia chimica. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-7-1186 | escludi | La pasta può cuocere anche senza ebollizione continua: acqua calda e acqua che bolle possono essere entrambe corrette a seconda di temperatura e durata. |
| obqa-7-1197 | escludi | Stanza, giacca e forno non hanno temperature indicate; il raffreddamento del braccio dipende dal gradiente termico, non dal solo nome del luogo. |
| obqa-7-146 | correggi | Chiarito il passaggio da parco ad area asfaltata per collegare demolizione e perdita di habitat. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-7-157 | correggi | Chiarita la natura ionica del sale in soluzione; eliminate le alternative su seltzer e carbonatazione. |
| obqa-7-160 | correggi | Corretti polipo e pigmenti; esplicitato il meccanismo difensivo. |
| obqa-7-163 | correggi | Sono le correnti ad azionare la turbina: rimosse le risposte su zuppa, pesci e formaggio. |
| obqa-7-171 | escludi | Gli effetti dell’acqua calda dipendono da temperatura, durata ed estensione dell’esposizione; non è giustificata la garanzia che gli organi restino inalterati. |
| obqa-7-179 | correggi | Atomic 26 era una perifrasi confusa: chiesta l’identità dell’elemento. |
| obqa-7-203 | correggi | Corretti gli esempi di riflesso e la formulazione inchiodare una cornice. |
| obqa-7-208 | correggi | Precisati intensità, durata e portata; anche scarsità potabile e altri danni erano possibili dopo un temporale. |
| obqa-7-238 | correggi | Sostituito barattolo di diamante con il prisma indicato dalla fonte e rimossa la risposta economica. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-7-244 | correggi | Sole da solo non garantisce fusione: specificata una temperatura superiore a quella di fusione. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-7-262 | escludi | Montagne e oceani includono ambienti caldi; la generica categoria organismo del clima caldo non seleziona unicamente il Sahara. |
| obqa-7-270 | correggi | La fonte riguarda la luce: eliminato il riferimento confuso alle esigenze per creare clorofilla e l’assoluto su tutte le piante. |
| obqa-7-284 | escludi | La sola indicazione sovrappeso non basta per stabilire un intervento alimentare su un cane; mancano dieta, stato di salute e valutazione del fabbisogno. |
| obqa-7-333 | correggi | La lunghezza delle orecchie non è garantita da quella dei genitori: chiesta la trasmissione del DNA. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-7-334 | correggi | Le alternative vaghe erano sovrapposte: distinta probabilità da garanzia individuale. |
| obqa-7-364 | correggi | Eliminate le traduzioni umiliarci e agitarsi; indicato il rapporto vibrazione-suono. |
| obqa-7-372 | correggi | Lo squalo non aspira aria con le branchie: rimossa la scena di aggressione che falsava il meccanismo respiratorio. |
| obqa-7-381 | correggi | Fonte di energia era una perifrasi poco precisa e spazio esterno non un corpo orbitato. |
| obqa-7-386 | correggi | Gli acidi possono anche essere coinvolti nella produzione di elettricità: specificata la reazione chimica. |
| obqa-7-391 | correggi | Feeder era tradotto alimentatore; specificati mangiatoia, animali e alimento. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-7-394 | correggi | Confrontare Luna e stelle confonde distanza e luminosità propria: usata la stessa sorgente. |
| obqa-7-414 | escludi | Le conseguenze economiche dei carburanti alternativi non sono determinate dall’unica premessa dell’aumento del prezzo della benzina; mancano condizioni di domanda e sostituzione. |
| obqa-7-417 | correggi | La muta non è causata soltanto dalla temperatura: precisati stagione, alcuni mammiferi e funzione termica. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-7-424 | escludi | La frase non farebbe nulla è una traduzione errata; per raccogliere vongole non è necessario uno scafandro e il luogo non è specificato. |
| obqa-7-444 | correggi | Sostituite alternative poco leggibili con processi distinti dal movimento muscolare. |
| obqa-7-445 | correggi | Esplicitato il meccanismo fra erosione e modifica del corso invece del generico cambiamento di un flusso. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-7-461 | correggi | Rimosso il consiglio generico per persone con diabete e precisata la composizione alimentare richiesta. |
| obqa-7-479 | correggi | Sostituito il vago perché e nessuno di questi con la relazione biologica fra larva e adulto. |
| obqa-7-49 | correggi | Enjoy significava gradire come alimento, non divertirsi; sostituiti ciottoli e compost con alternative alimentari. |
| obqa-7-50 | correggi | L’estinzione era un’ulteriore possibile conseguenza: chiesto direttamente lo squilibrio con le risorse. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-7-511 | escludi | Città, grotta, oceano e solo non sono categorie comparabili; la sopravvivenza dipende da risorse e condizioni, non dalla sola densità del gruppo. |
| obqa-7-519 | correggi | Studiare scientificamente il suolo non significa studiare solo microbi: precisati organismo e scala. |
| obqa-7-52 | correggi | La riproduzione richiede più fattori del grembo: chiesto il luogo dello sviluppo prenatale. |
| obqa-7-527 | correggi | Eliminata la negazione confusa: resa esplicita la trasformazione propria della fotosintesi. |
| obqa-7-561 | correggi | Rimosso formaggio come distrattore senza rapporto con il riempimento di un pallone; distinta aria da solo vapore. |
| obqa-7-59 | correggi | La chiave ripeteva soltanto produzione dei nutrienti: ripristinato il nome del processo. |
| obqa-7-599 | correggi | Già scomposto era indefinito: indicata l’origine geologica della sabbia senza generalizzarla a tutti i casi. |
| obqa-7-658 | correggi | I pungiglioni non sono genericamente punte sulla schiena; precisato il sesso/casta dove necessario. |
| obqa-7-664 | correggi | Specificati contatto e possibilità di bruciare, senza trattare il colore come garanzia di sicurezza alimentare. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-7-671 | correggi | Eliminata la frase spezzata sull’UFO; distinta dimensione apparente da luminosità e dimensione fisica. |
| obqa-7-677 | correggi | Rimosso arso dal sole, non valido per tutti i deserti, e gli aggettivi contraddittori fra i distrattori. |
| obqa-7-683 | correggi | Corretto il carattere danneggiato e distinta apparenza ottica da crescita fisica. |
| obqa-7-685 | escludi | Le lucertole hanno diete diverse secondo la specie; pulci è un sottoinsieme di insetti e striscianti non è una categoria alimentare definita. |
| obqa-7-7 | correggi | Esplicitati sudore, evaporazione e scambio termico invece del generico liquido della pelle. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-7-710 | correggi | Corrette vita scaduta e vecchiaia; chiarita l’origine organica e la scala temporale. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-7-725 | correggi | Sostituite cascate al contrario e uccelli assassini con il meccanismo fisico dell’abrasione eolica. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-7-727 | correggi | Eliminata la costruzione io sono una formica: chiesto il senso associato allo stimolo. |
| obqa-7-732 | correggi | Non si crea energia: precisata la conversione iniziale ed eliminata la tautologia alimentare il mondo. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-7-736 | correggi | Nails era tradotto chiodi; scelto un carattere ereditario definito senza assumere un numero universale di unghie. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-7-740 | correggi | Precisati stadio e dieta; rimossi hamburger, cani e il verbo masticare improprio per le rane. |
| obqa-7-769 | correggi | Un circuito chiuso non implica energia infinita: esplicitati continuità e alimentazione. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-7-787 | correggi | Parti di riproduzione vegetale era generico e sovrapposto a fiori: specificati polline e ruolo nutrizionale. |
| obqa-7-807 | correggi | La Terra non è composta da quattro strati tutti rocciosi: distinto il nucleo metallico dalla crosta e dal mantello. |
| obqa-7-823 | correggi | Anche il microonde trasforma energia elettrica in riscaldamento: specificato il meccanismo resistivo e il tipo di forno. |
| obqa-7-852 | correggi | Le analogie con sangue, acqua e traffico erano tutte possibili; chiesto il trasporto effettivo del floema. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-7-855 | correggi | Precisato il tratto del cactus e la condizione ambientale a cui è utile. |
| obqa-7-875 | escludi | Un deserto può essere freddo o polare: soffocante non è una proprietà necessaria né una categoria climatica misurabile. |
| obqa-7-884 | correggi | Riverberi per colpire il timpano era una traduzione imprecisa; ricostruita la propagazione sonora. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-7-891 | correggi | Riutilizzo e riciclo non sono sinonimi; trasformato era un’altra opzione compatibile: esplicitato il processo. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-7-902 | correggi | Il cambio colza-soia non garantisce rese maggiori: chiesta la pratica agronomica descritta. |
| obqa-7-903 | correggi | Dirt indicava suolo e non sporco; distinta la componente minerale da quella organica. |
| obqa-7-93 | escludi | Vitamine e decongestionanti possono avere effetti negativi secondo dose e condizioni; senza contesto il rotavirus non è l’unica risposta possibile. |
| obqa-7-942 | escludi | L’assenza di peli non distingue la termoregolazione: esistono animali endotermi senza pelliccia e la fonte non giustifica il generico spesso. |
| obqa-7-95 | correggi | L’umidità non è tirata verso l’alto: ripristinato il trasferimento di energia. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-7-976 | correggi | La disposizione dei poli nelle decorazioni da frigorifero non era nota: specificati due poli uguali. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-7-986 | correggi | Famiglia, scuola e media possono contribuire: riunito il meccanismo di apprendimento ed escluso il determinismo genetico. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-7-988 | correggi | La sola crescita non garantisce più foglie: esplicitato lo sviluppo di foglie senza perdita contemporanea. |
| obqa-7-999 | correggi | Accorciata la premessa e precisato l’effetto meccanico delle radici; eliminate conseguenze alternative senza contesto. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-745 | correggi | Utilizzate in modo simile era troppo generico; anche il legno è isolante: chiesta la proprietà dei materiali. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-758 | correggi | Distinto l’uso energetico dagli impatti ambientali: nessuna garanzia di assenza di emissioni. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-761 | escludi | Nessuno dei quattro stati indicati rappresenta l’habitat naturale dell’orso polare; Nebraska più freddo non dimostra maggiore idoneità o benessere. |
| obqa-767 | correggi | Non tutte le cellule vegetali fanno fotosintesi: specificata la cellula verde della foglia; corretto cella in cellula. |
| obqa-769 | escludi | La frase ripete vasca da bagno e confronta contenitori senza capacità definite, includendo uno stomaco; la chiave non è deducibile dai dati. |
| obqa-78 | correggi | Aggiunto il soggetto mancante e distinto l’alveare da altre strutture. |
| obqa-785 | correggi | Eliminati riavvolgimento e previsione del futuro: opzioni coerenti con funzioni di strumenti. |
| obqa-788 | correggi | Non tutti i gufi hanno le stesse abitudini e gli orari dipendono dalla luce: specificata la specie notturna. |
| obqa-8-107 | correggi | Rimossa la traduzione stendere pelo; formulata una spiegazione genetica senza promettere un carattere mendeliano semplice. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-8-125 | escludi | Il latte non fortificato non è una fonte garantita di vitamina D; la situazione di privazione della luce non consente di scegliere una soluzione nutrizionale dai dati forniti. |
| obqa-8-130 | correggi | Non tutti i Walkman usano batterie al litio: specificati causa del guasto e ripristino dell’alimentazione. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-8-165 | correggi | Invertito il soggetto si mangia tonno e sostituita la descrizione zoologica errata della preda. |
| obqa-8-179 | correggi | Sostituito semestralmente con il numero di eventi richiesto, evitando l’ambigua possibilità di viverlo. |
| obqa-8-183 | correggi | Eliminato il caso narrativo e chiarito il tipo di radiazione, senza suggerire che la crema sia una protezione completa. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-8-186 | escludi | Taglio selettivo, organismi, laghi e gas serra possono essere collegati in più modi; non sono specificati intervento e impatto per rendere unica una risposta. |
| obqa-8-190 | escludi | Esistono coralli di acque fredde e profonde: senza specificare i coralli costruttori di barriere tropicali, mari tiepidi non è l’unico ambiente valido. |
| obqa-8-192 | correggi | Uniformate le alternative e distinta la cottura dalla generica presenza di energia chimica nel combustibile. |
| obqa-8-205 | correggi | Robusta non descrive la struttura terrestre; limitato il quesito alla crosta, evitando di definire roccioso il nucleo. |
| obqa-8-206 | escludi | Vedere un’eclissi non causa di per sé un incidente; guidare entro il limite o usare gli indicatori non esclude incidenti. Mancano condizioni di distrazione o visibilità. |
| obqa-8-213 | correggi | Il sedimento non crea un trilobite: distinta la formazione del fossile dall’origine dell’animale. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-8-240 | correggi | Piante e animali non consumano il cibo nello stesso modo: mantenuto il bisogno comune di energia. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-8-250 | correggi | Bug non era tradotto e le alternative erano assurde; ricostruito il ruolo del cibo senza generalizzare la dieta della specie. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-8-253 | correggi | Specificato l’ambiente della lucertola e sostituito nessuno di questi con un animale comparabile. |
| obqa-8-257 | correggi | Distinta un’ipotesi da osservazioni; eliminata la previsione assoluta e senza tempi sullo scioglimento completo delle calotte. |
| obqa-8-260 | correggi | Chiarito il nesso decomposizione-biogas anziché implicare che qualsiasi motore a gas dipenda da quella vegetazione. |
| obqa-8-279 | correggi | La Luna non è una stella e Orione non è un unico astro: rese omogenee le alternative. |
| obqa-8-28 | correggi | Corretto H20 e separati reagenti dalla fonte energetica; un cielo nuvoloso non impedisce la fotosintesi. |
| obqa-8-293 | correggi | Ridotta la scena incoerente sul coperchio; evitata la confusione tra vapore invisibile e nebbiolina di goccioline. |
| obqa-8-304 | escludi | La qualità dell’aria dentro una casa non si deduce dalla sola vicinanza a una discarica o dalla categoria urbana; mancano fonti interne, ventilazione e misure. |
| obqa-8-307 | escludi | Un animale può ansimare anche di notte, durante un temporale o con neve per movimento o stress; giorno soleggiato non è una condizione esclusiva. |
| obqa-8-308 | correggi | Sostituita la metafora vedere col suono con il meccanismo, senza assumere capacità universali delle persone cieche. |
| obqa-8-312 | correggi | Polo superiore non è una direzione: distinto nord magnetico da nord geografico. |
| obqa-8-318 | correggi | I distrattori originale erano tre sinonimi di lontano: confrontati cambiamenti dell’intensità apparente. |
| obqa-8-321 | correggi | Chiarito il contatto meccanico e sostituiti sole, animali e acqua con spiegazioni del fenomeno. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-8-332 | correggi | Resa esplicita la funzione delle gallerie e rimossa l’opzione nessuno di questi. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-8-333 | correggi | Soda era ambiguo: specificati due liquidi miscibili anziché sostanze che si mescolano completamente in senso generico. |
| obqa-8-340 | escludi | Pioggia garantita è una premessa errata: cumuliformi, cirri e grandine non sono condizioni necessarie congiunte, e può piovere con luce solare diretta. |
| obqa-8-343 | correggi | Smettere di mangiare fuori non quantificava i costi alternativi: aggiunti dati espliciti e rimossa la moneta del Monopoly. |
| obqa-8-346 | escludi | Il gusto di una mela dipende dalla varietà e maturazione; dolce e acido possono essere entrambi corretti. L’aneddoto su Newton non specifica il frutto mangiato. |
| obqa-8-35 | correggi | La distanza d’arresto richiede molte condizioni: chiesto il principio meccanico dei freni. |
| obqa-8-350 | correggi | Lombrichi non bastano a garantire il terreno ideale; precisata la struttura fisica e rimosso tutto questo. |
| obqa-8-365 | correggi | Accorciata la narrazione e riparata la frase contando il secondi. |
| obqa-8-373 | correggi | Precisato lo specchio freddo e il motivo del calo nel bicchiere, evitando che perdita o infiltrazione siano implicite. |
| obqa-8-378 | correggi | Distinto incasso da profitto e fissato il prezzo, condizioni mancanti nel testo originale. |
| obqa-8-395 | escludi | Una minore aspettativa di vita non è deducibile dalla sola sovrappopolazione di un Paese; mancano risorse, servizi e condizioni sanitarie. |
| obqa-8-403 | correggi | Il solo parto vivo non dimostra la classe e tutte le risposte originali erano compatibili: chiesta direttamente la classificazione. |
| obqa-8-409 | escludi | Un’aragosta cotta può essere sia morta sia fredda; le alternative descrivono proprietà che possono coesistere e il quesito non precisa quale cercare. |
| obqa-8-41 | correggi | Studenti universitari era un distrattore assurdo; confrontati ambienti dello stadio larvale. |
| obqa-8-43 | correggi | Distinta la respirazione cellulare dai movimenti respiratori, evitando l’assoluto tutti gli animali respirano nello stesso modo. |
| obqa-8-445 | escludi | L’imbrunimento dell’erba dipende dal clima e può avvenire anche in estate; non dimostra una causa della depressione stagionale della persona descritta. |
| obqa-8-45 | correggi | Gli orari dipendono da luogo e stagione: sostituiti con il periodo notturno che definisce il comportamento. |
| obqa-8-463 | correggi | Il frigorifero normale non congela necessariamente il caffè e fusione può coincidere con congelamento: corretta la definizione e separati i distrattori. |
| obqa-8-464 | correggi | Il testo confondeva fonte dell’energia e percorso elettrico: chiesta la funzione dei conduttori. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-8-466 | correggi | Una genealogia non garantisce una previsione del colore degli occhi: chiesto il ruolo dell’eredità, senza determinismo. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-8-471 | correggi | Le regole di raccolta dipendono dal Comune e anche olio o medicinali hanno raccolte dedicate: chiesto il materiale della lattina. |
| obqa-8-478 | correggi | La pellicola da cucina non è un accessorio affidabile per questa funzione: specificato materiale progettato per la visibilità. |
| obqa-8-491 | correggi | Il nutrimento iniziale non basta per sempre: esplicitate le prime fasi ed eliminate sabbia e sporcizia. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-8-493 | correggi | Non tutte le piante spinose forniscono acqua agli uccelli: chiesto l’adattamento del cactus presente nella fonte. |
| obqa-8-494 | correggi | La durata del viaggio dipende dal mezzo: chiesta la distanza relativa e rimosso nessuno di questi. |
| obqa-8-52 | correggi | Rimosse le alternative sul significato figurato di stella; ricostruito il processo fisico. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-8-53 | correggi | La marca non determina l’unità del cruscotto: specificati strumento e grandezza. |
| obqa-8-57 | correggi | Chiarito il meccanismo dell’energia dalle maree, senza confonderlo con petrolio o reazioni del sale. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-8-59 | escludi | Il rumore dipende da forma, dimensioni, vincoli e intensità dell’urto, non solo dal materiale; il fatto di supporto riguarda la velocità del suono e non dimostra la chiave. |
| obqa-8-62 | correggi | Esplicitata l’estinzione globale e sostituito turbato con una condizione di popolazione. |
| obqa-8-63 | correggi | Gli uccelli non masticano come i mammiferi: precisata la manipolazione del cibo. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-8-69 | correggi | Rimosso nessuno di questi e chiarita la scala temporale senza imporre un’età unica a tutti i giacimenti. |
| obqa-8-79 | correggi | Precisate condizioni di dilatazione; il caminetto da solo poteva produrre perdita, rottura o altri esiti. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-8-92 | escludi | La solubilità dipende dal soluto e dalla composizione del solvente; non tutti i solidi diventano più solubili scaldando e tè, acqua e latte non sono solventi equivalenti. |
| obqa-8-93 | correggi | Weathering era tradotto tempo: esplicitati agenti atmosferici e degradazione della pietra. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-8-97 | correggi | Current/currant era diventato ribes; la corrente non deve necessariamente essere continua: ripristinato il concetto generale. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-810 | correggi | Precisate riserva finita e assenza di rinnovo, necessarie al rapporto consumo-durata. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-82 | escludi | Visibilità e dimensioni non hanno una proporzionalità universale: contano distanza, contrasto, illuminazione e capacità visiva; diretto non è definito quantitativamente. |
| obqa-841 | escludi | Un altopiano non è necessariamente vulcanico e la sua composizione non si deduce dalla sola forma geografica; plateau non identifica una sostanza. |
| obqa-844 | correggi | Eliminati vendita e bambino che chiede come pseudo-cause dei cuccioli; riparata la punteggiatura. |
| obqa-850 | correggi | Resa naturale la traduzione e precisato serpente oviparo, poiché esistono anche serpenti vivipari. |
| obqa-869 | escludi | Senza temperature non si determina quale cibo ceda calore; anche gelato, insalata e sushi trasferiscono calore verso oggetti più freddi. |
| obqa-880 | correggi | Anche esseri umani e leoni possono essere prede: sostituita la lista non esclusiva con la relazione predatore-preda. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-889 | correggi | Le diete delle specie elencate non erano precise e falena non garantiva la chiave: richiesta la definizione. |
| obqa-898 | correggi | Le parti verdi assorbono anche gas e acqua: specificata la molecola e il suo ruolo. |
| obqa-9-1026 | correggi | Precisata la mancanza di fonti alternative e corretta la grammatica dei verbi. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-9-1030 | correggi | Semplificata la perifrasi sensore orientato alla visione e chiarito lo stimolo. |
| obqa-9-1034 | correggi | Trasferire nello stomaco non spiegava il comportamento: esplicitato l’uso alimentare. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-9-1046 | correggi | Anche alcuni vasi sanguigni sono protetti dallo scheletro: chiesta la struttura protettiva specifica. |
| obqa-9-105 | correggi | Sostanza variabile non indicava lo stato fisico; distinto il cambiamento di forma da quello chimico. |
| obqa-9-1053 | correggi | Anche CO2 e nutrienti azotati favoriscono la crescita: definita la sostanza richiesta anziché la migliore. |
| obqa-9-1071 | escludi | La fonte parla di un asciugamani ad aria calda, mentre la traduzione descrive asciugamani di stoffa; diverse alternative potrebbero essere usi reali e l’oggetto è indeterminato. |
| obqa-9-1087 | correggi | Specificati ricarica e prelievi per collegare logicamente la siccità al livello della falda. |
| obqa-9-1090 | correggi | La risposta O indicava ossigeno atomico: corretta in ossigeno molecolare e rese omogenee le alternative. |
| obqa-9-110 | correggi | Non tutti i mammiferi partoriscono piccoli vivi: scelta una specie e rimossa la frase partoriscono per vivere. |
| obqa-9-1102 | correggi | Anche una barca può contenere materiali riciclabili: chiesto il materiale delle pagine anziché il riciclo di oggetti eterogenei. |
| obqa-9-1117 | escludi | Alcune rane possono mangiare scorpioni; senza specie e dimensioni non esiste una preda sicuramente esclusa, e la reincarnazione non fornisce contesto biologico. |
| obqa-9-1134 | correggi | La vecchia chiave rilascio di rifiuti ignorava l’alternativa corretta rilascio di energia: chiarita la funzione energetica. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-9-1139 | escludi | Dolore dopo un contatto può avere più cause e non identifica necessariamente un trasformatore; manca l’esposizione a parti sotto tensione e il malessere cardiaco non è deducibile. |
| obqa-9-1160 | correggi | Rimosse alternative prive di senso e distinta rivoluzione da rotazione. |
| obqa-9-1163 | correggi | Ioni descrive i portatori di carica nella batteria, non l’alimentazione del motore; corretta la grandezza. |
| obqa-9-1164 | correggi | Un ghepardo non corre tutto il giorno: sostituita la premessa con uno sforzo prolungato e specificate le vie di perdita. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-9-1166 | correggi | La frase da completare chiedeva solo un sinonimo: esplicitato il legame ambiente-sopravvivenza senza un clima unico per tutte le piante. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-9-1167 | correggi | Weather era tradotto tempo: esplicitati gli agenti fisici dell’erosione. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-9-1180 | correggi | Non tutte le zanzare succhiano sangue e cibo era sovrapposto a sangue: specificati sesso, funzione e ambito. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-9-1186 | correggi | Anche dormire coinvolge reazioni metaboliche: sostituito con trasformazioni fisiche esplicite. |
| obqa-9-1194 | correggi | Eliminate abbronzatura e palla: specificati uccello insettivoro e funzione del becco. |
| obqa-9-124 | correggi | Decodificate le perifrasi pianeta umano e monoossido di diidrogeno; distinta la marea da altri fenomeni marini. |
| obqa-9-132 | correggi | Riprocessabile era poco naturale e gli altri aggettivi non confrontabili: chiesto il processo di recupero. |
| obqa-9-135 | correggi | La strada sterrata introduceva altre variabili: controllate le condizioni del confronto sull’aderenza. |
| obqa-9-149 | correggi | La frase ripeteva nascono/nato e conteneva stati non pertinenti: chiesto il nome del processo. |
| obqa-9-152 | escludi | La velocità non è necessaria in ogni cattura di un coniglio: un predatore può usare agguato, cooperazione o altri meccanismi. Mancano modalità di caccia. |
| obqa-9-159 | correggi | Reso esplicito il processo fluviale; eliminati piscina e semplice presenza d’acqua. |
| obqa-9-16 | correggi | Anche gli altri animali possono essere agili: sostituito il confronto non esclusivo con il comportamento di fuga. |
| obqa-9-163 | correggi | Chiarito il contesto marino senza pretendere una località specifica né usare il nome errato Lago Eerie. |
| obqa-9-179 | correggi | Texture indicava consistenza superficiale, non struttura; chiarita l’azione che rende univoco il senso. |
| obqa-9-18 | escludi | La narrazione confonde preparazione allo sforzo e quantità del pasto; colazione abbondante non è deducibile come scelta migliore per quel cane. Le traduzioni dei distrattori sono prive di senso. |
| obqa-9-181 | correggi | Fonte di calore più vicina era falso: ripristinato il confronto tra stelle indicato dalla fonte. |
| obqa-9-187 | escludi | I piccoli rettili hanno diete diverse; inoltre insetti è un sottoinsieme di invertebrati, quindi due alternative possono essere corrette. |
| obqa-9-197 | correggi | Reso diretto il legame precipitazioni-acqua; non garantita l’intera disponibilità idrica che dipende anche da deflusso e infiltrazione. |
| obqa-9-199 | correggi | Riparata la frase spezzata e specificate immiscibilità e densità, necessarie per prevedere gli strati. |
| obqa-9-206 | correggi | Un motore contiene materiali diversi: specificato un oggetto ferromagnetico semplice. |
| obqa-9-222 | correggi | Corretta la confusione tra rana e rettile e rimossi vestiti/bevande: descritto il riscaldamento di un ectotermo. |
| obqa-9-227 | correggi | Anche acqua è presente sulla Luna: ristretto il quesito ai rilievi e sostituiti umani e cani. |
| obqa-9-229 | correggi | Collegati suoni ed eco all’ostacolo; eliminate le risposte su automobili e camion. |
| obqa-9-230 | correggi | Eliminata la risposta chiedere all’uccello e distinta l’altezza dal suolo dall’altitudine sul mare. |
| obqa-9-24 | correggi | Esplicitata la funzione visiva del mimetismo; rimosse trasformazioni impossibili e azioni antropomorfe. |
| obqa-9-257 | correggi | Eliminati eleganza e intenzionalità evolutiva: chiesto il vantaggio del mantello nel contesto innevato. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-9-270 | correggi | Una pianta può crescere temporaneamente al buio usando riserve: distinta crescita da fotosintesi. |
| obqa-9-271 | correggi | Rifornirsi del gas poteva indicare la respirazione: specificato il trasporto ematico; rimosso sistema scolastico. |
| obqa-9-281 | correggi | Precisata la superficie considerata e rimosso tutto questo. |
| obqa-9-284 | correggi | Ricostruita la frase sul calore dell’acqua evitando verbi incompleti e la narrazione dell’incidente. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-9-289 | escludi | Le bisce possono frequentare ambienti erbosi, acque e altri habitat; il nome comune e la fonte non permettono di scegliere un solo ambiente. |
| obqa-9-29 | correggi | Distinto l’effetto sulla luce da un giudizio positivo universale sull’abbattimento. |
| obqa-9-298 | correggi | Conservazione riferita esplicitamente al combustibile, evitando oggetti e sostanze non confrontabili. |
| obqa-9-30 | correggi | Anche le formiche possono essere predatrici: sostituiti nomi generici con comportamenti alimentari. |
| obqa-9-301 | correggi | Sostituito gas con aria e rimossi cibo e luce come pseudo-materiali di gonfiaggio. |
| obqa-9-317 | correggi | Eliminati banane, legno e metallo: confrontate forme energetiche. |
| obqa-9-32 | correggi | La data esatta varia: usato dicembre; rimossi afferma e contee da traduzioni fuori contesto. |
| obqa-9-322 | correggi | Il Sole non è sempre allo zenit a mezzogiorno: corretto il fenomeno apparente e la causa. |
| obqa-9-35 | escludi | I minerali si formano in tempi molto diversi e una collana non identifica un materiale o un processo: milioni di anni non è deducibile. |
| obqa-9-350 | correggi | Specificata la dieta e sostituita la perifrasi alati a sei zampe: non tutti gli insetti sono alati. |
| obqa-9-352 | correggi | Un acciaio è una lega con carbonio, non due metalli: chiesta la composizione confrontando altre leghe plausibili. |
| obqa-9-368 | correggi | Precisata la vitalità dei semi e distinto trasporto dei semi da polline o concimazione. |
| obqa-9-369 | correggi | La sola distanza non basta: aggiunto il tempo e formulata la coppia di dati necessaria. |
| obqa-9-390 | escludi | Nessuna fonte indicata garantisce acqua potabile senza informazioni su contaminazione e trattamento. La pioggia non è automaticamente la più sicura. |
| obqa-9-393 | correggi | Le alghe non vivono solo nell’acqua e possono crescere su alberi: specificato il gruppo acquatico e le condizioni. |
| obqa-9-409 | correggi | La Luna non è visibile ogni sera e non sorge una volta in ogni giorno civile: chiesta la causa del moto apparente. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-9-411 | correggi | Distinti numero di isole e area emersa; temperatura da sola non determina la geometria delle coste. |
| obqa-9-416 | escludi | Il trapianto di querce può avere effetti ambientali ed economici diversi secondo luogo, specie e gestione; non c’è un unico impatto positivo deducibile. |
| obqa-9-418 | correggi | Il trasporto non riguarda soltanto glucosio e può avere direzioni diverse: precisati tessuto e percorso da organo produttore a consumatore. |
| obqa-9-429 | correggi | La dissoluzione non è la trasformazione chimica indicata dalla vecchia chiave: ricostruito il processo realmente descritto. |
| obqa-9-431 | correggi | Rimossi bere, sottrazione e lancio: confrontate operazioni sulle miscele. |
| obqa-9-433 | correggi | Il numero di cambi pagina dipende dal calendario e dalla pagina iniziale: chiesto il numero di mesi. |
| obqa-9-436 | correggi | Corpo terrestre era ambiguo e un satellite non orbita necessariamente un pianeta: identificato il satellite concreto. |
| obqa-9-437 | correggi | Anche camminare o pedalare può cambiare la pressione: precisati quota e andamento. |
| obqa-9-44 | correggi | Bianchetti non indicava l’animale della fonte: ripristinato cervo e chiarito il contesto terrestre. |
| obqa-9-440 | correggi | La presenza di aria e altre componenti non viventi richiede ecosistema, non comunità. |
| obqa-9-454 | correggi | Il testo confondeva polline e semi: esplicitato il trasporto dei semi tramite un uccello frugivoro. |
| obqa-9-461 | correggi | Rimosse supposizioni sulla causa di un incidente: chiesto il fattore che limita la visibilità. |
| obqa-9-463 | correggi | Il coltello può avere un manico isolante e il corpo umano può condurre: specificati materiali senza suggerire contatti rischiosi. |
| obqa-9-464 | correggi | Un arcobaleno non appare sempre dopo la pioggia: precisati luce e goccioline, possibili anche in spruzzi. |
| obqa-9-478 | correggi | Rimossi ruoli familiari senza contesto e distinta previsione probabilistica da eventi certi. |
| obqa-9-482 | escludi | La mancanza di ossigeno può avere esiti diversi secondo concentrazione e durata: lo svenimento non è garantito dalla premessa generica. |
| obqa-9-490 | correggi | La dimensione del gomito non era un carattere definito: precisato il contenuto ereditario distinto dall’apprendimento. |
| obqa-9-491 | correggi | Sostituito gonfio con livello e specificato il bilancio idrico anziché dedurlo dalla sola durata del temporale. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-9-501 | escludi | La risposta indicata, monte McKinley/Denali, non è un vulcano: il rilievo deriva dal sollevamento tettonico. Nessuna alternativa soddisfa la domanda così formulata. |
| obqa-9-504 | correggi | Una cava non è necessariamente una fonte di metalli: specificato il materiale estratto e rimosso il gioco di parole sui concerti metal. |
| obqa-9-508 | correggi | Le stelle non sono gas infiammato per combustione: ripristinata la loro identità senza distrattori estranei. |
| obqa-9-51 | escludi | Una stanza isolata non garantisce da sola una temperatura adatta al cane: mancano temperatura, durata dell’esposizione e caratteristiche dell’animale. |
| obqa-9-510 | correggi | La presenza non implica automaticamente acqua velenosa e l’uso non garantisce sicurezza: chiesto il trasporto dei residui. |
| obqa-9-520 | correggi | Esistono plasmi sulla Terra, quindi il Sole non è la fonte più vicina; rimossa anche l’idea che bruci zolfo. |
| obqa-9-523 | correggi | Ingrandimento dell’immagine distinto dalla trasformazione del campione; gigantesco sostituito con una proprietà precisa. |
| obqa-9-528 | correggi | Precisati tessuto e funzione anziché una graduatoria vaga della muscolosità. |
| obqa-9-532 | correggi | Caldo/freddino erano categorie relative: esplicitato il gradiente termico. |
| obqa-9-540 | escludi | Le temperature delle quattro mele non sono misurate e dipendono da tempo di esposizione e ambiente; la posizione al Sole non garantisce la chiave. |
| obqa-9-548 | correggi | Eliminati forse e tutto questo e trasformata la negazione in una domanda storica diretta. |
| obqa-9-550 | correggi | Cordone spento e seduto sul tavolo erano traduzioni errate: esplicitata la spina scollegata. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-9-552 | correggi | Un carnivoro può essere anche preda: chiesto il comportamento di caccia invece di ruoli compatibili. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-9-554 | escludi | Il comportamento del cucciolo non si può attribuire alla sola istruzione materna; anche dimensioni ed esperienze dirette possono contribuire e non sono indicate osservazioni. |
| obqa-9-566 | correggi | Precisati altezza della colonna d’acqua e punto di misura; anche una rottura può aumentare le sollecitazioni in altri modi. |
| obqa-9-573 | escludi | Il vomito può avere molte cause e non identifica una reazione allergica a un farmaco. La premessa non permette la distinzione tra allergia e altro effetto indesiderato. |
| obqa-9-575 | correggi | Normale/strano non distingue modalità riproduttive: chiesto il termine biologico. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-9-576 | correggi | Liscio e duro non basta a identificare una roccia: chiesta la composizione senza dedurre il materiale dal tatto. |
| obqa-9-612 | correggi | Precisato il nutriente e distinto da ossigeno, acqua e organelli. |
| obqa-9-621 | correggi | Sostituita la perifrasi cavità a ciotola con il termine e il processo geologico. |
| obqa-9-633 | correggi | Rimossi agente e dirigente: tutte le alternative descrivono comportamenti animali. |
| obqa-9-637 | escludi | La preferenza di un’anatra non si deduce dal nome di una vasta regione: servono specie, presenza d’acqua e habitat locale. |
| obqa-9-638 | correggi | Trasformazione era sovrapposto a ciclo di vita: chiesto il processo specifico senza definirlo ultima fase della vita. |
| obqa-9-645 | correggi | Specificata la specie e distinta la dieta carnivora dal ruolo occasionale di predatore. |
| obqa-9-652 | correggi | Buon terreno non specificava la disponibilità di zinco: chiesto il meccanismo di assorbimento. |
| obqa-9-655 | correggi | Rimossa l’analogia Terra-soggiorno e precisate condizioni della fusione. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-9-668 | correggi | Ricostruita la frase e distinta la difesa da alimentazione e corteggiamento. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-9-669 | correggi | Sostituite risposte sul grado di certezza con identità astronomiche confrontabili. |
| obqa-9-674 | correggi | Il vapore può trovarsi anche in tubi e oggetti pieni d’aria: chiesto lo stato fisico. |
| obqa-9-675 | correggi | Distinto fotovoltaico da riscaldamento solare ed eliminate api e innesti solari. |
| obqa-9-686 | correggi | Agricoltura poteva includere riproduzione vegetale: usato un singolo animale con processi distinti. |
| obqa-9-692 | escludi | Le frane possono verificarsi anche in deserti e sott’acqua; il rischio richiede pendenza, geologia e condizioni locali, non solo una regione. |
| obqa-9-727 | correggi | Specificato il rapporto mimetismo-avvicinamento, sostituendo pasti con preda. |
| obqa-9-73 | correggi | Il Brasile attraversa l’equatore: specificata la parte nell’emisfero australe. |
| obqa-9-731 | correggi | Rimossi cinema e direzione: distinto consumo di altri animali dalla produzione primaria. |
| obqa-9-735 | correggi | Subdivision indicava quartiere e non suddivisione; anche attività ricreative possono avere impatti, quindi precisato il tipo di trasformazione. |
| obqa-9-743 | escludi | Un coniglio può vivere in più degli ambienti descritti, comprese isole con vegetazione; il boschetto non è esclusivo senza condizioni ulteriori. |
| obqa-9-757 | correggi | Il parto vivo non definisce tutti i mammiferi e non tutti gli altri animali nascono da uova deposte: corretta la distinzione. |
| obqa-9-759 | correggi | Eliminata la perifrasi del bouquet e distinti polline e semi, che si sviluppano in fasi e strutture diverse. |
| obqa-9-771 | correggi | Chiarita l’origine del biocombustibile e sostituita automobile, che non è un materiale. |
| obqa-9-772 | escludi | La domanda non specifica che cosa cambia nell’acqua e il fatto originale riguarda soltanto la durata del ciclo lunare: nesso causale non definito. |
| obqa-9-774 | escludi | Una popolazione può calare per migrazione, predazione o malattie anche in un habitat idoneo; il declino da solo non dimostra insostenibilità. |
| obqa-9-776 | escludi | La durata di una sega dipende da lega, costruzione, utilizzo e manutenzione. Le opzioni possono indicare il materiale da tagliare anziché quello dell’attrezzo. |
| obqa-9-783 | correggi | Freddo estremo era indefinito: chiesto il passaggio di stato. |
| obqa-9-786 | correggi | La rotazione da sola causa giorno/notte, non stagioni: ripristinati inclinazione e rivoluzione. |
| obqa-9-79 | escludi | Un vetro smerigliato è traslucido, non necessariamente opaco: diffonde la luce e tutela la riservatezza, ma non è descritto il prodotto né il vantaggio richiesto. |
| obqa-9-794 | correggi | Distinto il carbonio dalla CO₂ e reso esplicito il meccanismo, senza un aumento automatico in ogni scenario. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-9-799 | correggi | Chiarito lo stato fisico con alternative sul materiale. |
| obqa-9-813 | correggi | Eliminate divinità e condensazione vaga: collegata pioggia, portata e capacità dell’alveo. |
| obqa-9-853 | correggi | Produrre cibo era ambiguo rispetto alla sintesi di molecole nel corpo: precisato il significato ecologico. |
| obqa-9-858 | correggi | Hotness era tradotto piccantezza: precisate le condizioni in cui l’assorbimento aumenta la temperatura. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-9-866 | correggi | Distinta apparenza dalla crescita fisica e rimossi rotazione e ombra come conseguenze non pertinenti. |
| obqa-9-877 | correggi | Aggiunta la famiglia dei canidi per rendere univoca la descrizione del mantello stagionale. |
| obqa-9-881 | correggi | Riciclaggio e decomposizione erano entrambi pertinenti; distinti processi biologici senza considerarli sinonimi alternativi. |
| obqa-9-883 | correggi | La domanda originaria era tautologica: introdotto un confronto chiaro fra habitat. |
| obqa-9-889 | correggi | Si confrontavano pianeti e abitazioni; definita la struttura senza affermare l’impossibilità assoluta di vivere altrove. |
| obqa-9-89 | correggi | Eliminata la vaga categoria qualcosa che si riproduce e definito l’effetto termico possibile. |
| obqa-9-893 | correggi | Chiariti tipo di torcia e alimentazione, senza perifrasi sui fotoni. |
| obqa-9-894 | correggi | Elemento che riflette ripeteva la domanda e qualsiasi oggetto era ambiguo: chiesto il processo ottico. |
| obqa-9-895 | escludi | Anche piogge eccessive, calpestio o altre condizioni possono ridurre gli arbusti; la siccità non è una causa identificabile senza ulteriori dati. |
| obqa-9-908 | correggi | Confrontate forze/interazioni e chiarito il componente del freno. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-9-916 | correggi | Rimosso l’obbligo di mangiare meno in caso di disoccupazione: specificata la riduzione di spese non necessarie. |
| obqa-9-937 | correggi | Anche riserve alimentari possono essere nel fusto: circoscritta la caratteristica idrica dei tessuti carnosi. |
| obqa-9-948 | correggi | Sostituite risposte fuori categoria con piante da frutto. |
| obqa-9-957 | escludi | Risparmiare acqua può essere necessario anche in città, montagne o foreste durante emergenze; la sola località non determina un’unica tattica di sopravvivenza. |
| obqa-9-983 | correggi | Corretto sporco in suolo e formulato il nesso agronomico in termini di contributo possibile. |
| obqa-9-988 | escludi | Il testo è spezzato e lo stato di conservazione non è collegato logicamente alle alternative. La sola fonte parla di animali negli zoo; recuperarlo richiederebbe una domanda diversa. |
| obqa-9-993 | correggi | La carta può anche essere riciclata o provenire da altre fibre: limitato il quesito alla pasta derivata dal legno. |
| obqa-936 | escludi | Frase senza evento e soggetti definiti; boccola è probabilmente una traduzione di bush ma anche rimuovere casa o altri ripari può distruggere un habitat. |
| obqa-948 | correggi | Il ritorno allo stagno può coinvolgere memoria e orientamento: evitata una garanzia universale e distinta la predisposizione dall’addestramento. |
| obqa-970 | correggi | Non serve necessariamente un piano cottura: chiesta la trasformazione energetica comune ai metodi di cottura. |
| obqa-998 | correggi | Corretto polipo in polpo e distinta la difesa mimetica dagli altri comportamenti. |
| obqa-10 | correggi | Le opzioni TV e acquisti potevano essere entrambe preparazione: ricondotto il quesito al ruolo delle previsioni nella fonte. |
| obqa-10-10 | correggi | Corpo H2O sostituito con il termine geografico; indicato il lato a monte. |
| obqa-10-100 | correggi | Non si conduce un potenziale e acqua pura/salata non sono equivalenti: esplicitato il ruolo degli ioni. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-10-1001 | correggi | La muta non è indispensabile per nuotare: precisata la sua funzione termica e confrontati indumenti. |
| obqa-10-1003 | correggi | Il generico impatto negativo ammetteva più interpretazioni: identificata la categoria della malattia. |
| obqa-10-1004 | correggi | Stare vicino alla candeggina non basta a definire un’esposizione: specificato il rischio di schizzi. |
| obqa-10-1005 | correggi | Il suolo non è solo roccia consumata: specificata la componente minerale e rimosse esplosioni e vaporizzazione. |
| obqa-10-1006 | correggi | Rimossi anima e vestiti e definito il ruolo trofico del consumatore. |
| obqa-10-1008 | escludi | Un tragitto geografico non determina l’intensificazione di un uragano: mancano temperatura marina, umidità e condizioni dei venti; la chiave è una frase incompleta. |
| obqa-10-1009 | correggi | L’acqua aggiusta le cose era privo di significato: descritto il deposito dei sedimenti. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-10-1010 | correggi | Charges era tradotto oneri e la fonte confondeva magnetismo: specificate cariche elettriche dello stesso segno. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-10-1012 | correggi | Foglie era un esempio poco definito: scelto un combustibile concreto e confrontato con fonti fossili. |
| obqa-10-1014 | correggi | Il semplice contatto con ferro non garantisce magnetizzazione: aggiunta la calamita e definito l’effetto. |
| obqa-10-1016 | correggi | Eliminate carote e fuoco: specificate umidità e temperatura di condensazione. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-10-1017 | correggi | Identificata la catena montuosa prima non nominata e precisata l’origine tettonica. |
| obqa-10-1018 | escludi | Le cure di due genitori dipendono dalla specie e non seguono dal parto vivo indicato nella fonte; il testo è troncato e le alternative non definiscono un quesito univoco. |
| obqa-10-1019 | correggi | Domanda e risposte originarie non concordavano: ripristinata la definizione del fenomeno. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-10-1020 | escludi | Non è specificato se si tratta di polo geografico o magnetico, né di bussola orizzontale o ago libero in tre dimensioni. Su e giù non è una previsione univoca. |
| obqa-10-1021 | correggi | Risolvere misteri era un altro uso possibile: chiesta la funzione strumentale. |
| obqa-10-1022 | correggi | Precisato il bilancio idrico, necessario per legare evaporazione e diminuzione. |
| obqa-10-1023 | correggi | Non tutti i batteri sono nocivi e non si impedisce ogni malattia: limitata l’affermazione ai patogeni e al rischio. |
| obqa-10-1026 | escludi | Una cometa non è una luce che cade normalmente verso il suolo; luminosità intrinseca, atmosfera e frammentazione non sono controllate. Avvicinamento e impatto sono confusi. |
| obqa-10-1027 | correggi | La pagina non diventa necessariamente rotonda e può anche strapparsi: identificato il cambiamento fisico comune. |
| obqa-10-1028 | correggi | Rifiuti era vago e moccio/feci erano fuori scala: chiesto un prodotto cellulare specifico. |
| obqa-10-103 | correggi | Il semplice interramento non garantisce germinazione e alcuni semi possono germinare dopo ingestione: specificati vitalità e requisito generale. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-10-1033 | correggi | La descrizione includeva anche biomasse rinnovabili: identificato il combustibile fossile e la scala temporale. |
| obqa-10-1034 | correggi | Un calo qualsiasi di acqua non basta: precisate durata e anomalie delle precipitazioni. |
| obqa-10-1035 | escludi | La chiave pioggia e ghiaccio non è un combustibile e il fulmine non è una combustione. Testo, risposte e fatto di supporto riguardano fenomeni differenti. |
| obqa-10-1036 | correggi | Un incendio generico non è necessariamente boschivo: precisato l’ambiente e il materiale combustibile. |
| obqa-10-1038 | correggi | Rimossi astronave e asteroide: distinto il sedimento originario dalla roccia consolidata. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-10-1040 | escludi | Si possono costruire strumenti usando erba, acqua o metallo; la fonte sul pizzicare una corda non seleziona una graffetta fra queste alternative. |
| obqa-10-1041 | correggi | Le precipitazioni non sono il numero delle gocce e comprendono anche forme solide: precisato cosa misura il pluviometro per la pioggia. |
| obqa-10-1042 | escludi | La domanda non definisce esposizione, clima o attività e la risposta evitatelo non ha un referente chiaro; il fatto di supporto non giustifica una regola di comportamento. |
| obqa-10-1043 | escludi | Cieli minacciosi è soggettivo e la pioggia può iniziare anche in condizioni luminose. Non è specificato un indicatore meteorologico univoco. |
| obqa-10-1044 | correggi | Pianeta bagnato era una perifrasi impropria: confrontati nomi di pianeti. |
| obqa-10-1046 | correggi | La domanda era invertita rispetto alla risposta: chiesto l’organello che contiene il pigmento. |
| obqa-10-1047 | correggi | Gli usi creativi della carta non erano esclusivi: scelto un riutilizzo concreto distinguendolo dallo smaltimento. |
| obqa-10-1048 | correggi | Accumulazione H20 era vaga: indicato il fenomeno idrologico senza escludere altri rischi possibili. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-10-1049 | correggi | Entità a sei zampe non identificava tutti e soli gli impollinatori: scelto un esempio concreto. |
| obqa-10-105 | correggi | Eliminato il salto dalla frequenza della pioggia alla disponibilità complessiva e riparata la formula. |
| obqa-10-1050 | escludi | Tutti gli animali elencati possono sfruttare la luce per la visione; la domanda non chiede di produrla e la traduzione gelatine a pettine non chiarisce specie o funzione. |
| obqa-10-1052 | correggi | La cottura non richiede bruciatura o alimento cavo: chiarito l’apporto termico. |
| obqa-10-1054 | correggi | Feeling significava percezione tattile, non sentimento: alternative omogenee fra sensi. |
| obqa-10-1056 | correggi | Viaggiare attorno a una cosa era impreciso: distinta rivoluzione da rotazione e lancio. |
| obqa-10-106 | correggi | Culmine e racconti erano traduzioni fuori contesto: confrontate forme topografiche. |
| obqa-10-1060 | correggi | Specificati pentola aperta ed ebollizione: il solo tempo sul fuoco non determina l’esito. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-10-1061 | correggi | La Terra non cambia inclinazione ogni autunno: ripristinati i segnali stagionali e limitato il contesto climatico. |
| obqa-10-1062 | correggi | Anche un frigorifero emette calore: specificata la sorgente calda e il trasferimento. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-10-1063 | correggi | Gli adulti possono anche mangiare e comunicare: chiesto lo stadio di sviluppo. |
| obqa-10-1064 | escludi | Domanda tautologica: contiene già ferro nella premessa e propone latte e caramelle senza alcun confronto scientifico utile. |
| obqa-10-1067 | correggi | La partenza da uno Stato non prova una migrazione: precisata stagionalità e destinazione. |
| obqa-10-1068 | escludi | Una cosa va a fuoco non definisce materiale o risultato; scottato non è una conseguenza univoca e le altre risposte sono prive di rapporto col fenomeno. |
| obqa-10-1070 | correggi | Specificato il tipo di conservante; non tutte le sostanze chimiche conservano o garantiscono sicurezza. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-10-1073 | correggi | Anche altre piante usano ossigeno: chiesto il gas, evitando utilizzatori sovrapposti. |
| obqa-10-1074 | correggi | Materia da avvicinare era una traduzione incompleta: identificata l’interazione fisica. |
| obqa-10-1075 | correggi | Rimossi globo gigante, cerchio e azioni senza significato astronomico. |
| obqa-10-1076 | correggi | L’attività non determina un fabbisogno universale: collegato il reintegro a perdite effettive. |
| obqa-10-1077 | escludi | Le vongole non richiedono necessariamente profondità marine e il nome comune include molluschi di diversi ambienti. Non sono specificati specie o luogo di raccolta. |
| obqa-10-1078 | correggi | Sostituito il confronto con gatto, guru e bistecca con la funzione del dispositivo. |
| obqa-10-1083 | correggi | Completata la frase e chiarito il carattere mammifero senza generalizzare cure e abbandono. |
| obqa-10-1084 | correggi | Un tubo di troppo pieno da solo non genera elettricità: aggiunti turbina e generatore. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-10-1086 | escludi | 100 °F corrispondono a circa 38 °C, non all’ebollizione dell’acqua a pressione ordinaria. Agitarsi e rotazione non sono stati o processi deducibili. |
| obqa-10-1088 | escludi | Sabbia e argilla non sono risorse inesauribili. La fonte indica vento, assente da tutte le alternative: nessuna chiave corretta disponibile. |
| obqa-10-1089 | correggi | La scarsità di cibo non definisce l’aridità ed è dipendente dalla specie: corretto il criterio climatico. |
| obqa-10-109 | correggi | Le branchie non respirano l’acqua come sostanza: chiarito lo scambio di ossigeno e confrontati animali. |
| obqa-10-1090 | correggi | Precisata la foresta pluviale e corretto caduta di H2O in precipitazioni. |
| obqa-10-1092 | escludi | Tutti gli oggetti visibili riflettono parte della luce. Cartello aereo non identifica una superficie speculare o retroriflettente e non rende unica la chiave. |
| obqa-10-1095 | correggi | Indirizza erroneamente non spiegava il fenomeno: esplicitata la somiglianza visiva. |
| obqa-10-1096 | correggi | Rilascio termico sostituito con il concetto, distinguendo combustione e semplice accumulo. |
| obqa-10-1099 | escludi | Non sono specificati età o specie dello scoiattolo e vinaccioli di alberi è una traduzione errata. La fonte sulle ghiande non giustifica un’alimentazione per un piccolo soccorso. |
| obqa-10-11 | correggi | Un fossile non richiede una specie estinta: precisate conservazione e antichità; corretto spazzato via. |
| obqa-10-110 | correggi | Resistenza e colori erano irrilevanti: fissati condizione statica e luogo, usate masse confrontabili. |
| obqa-10-1100 | escludi | Non sono indicate acqua, coperchio, temperatura effettiva e gestione del fornello: dodici ore non dimostrano necessariamente patate bruciate. |
| obqa-10-1101 | escludi | Una morte osservata dopo un contatto non consente una diagnosi della causa e infarto può essere conseguenza elettrica: alternative non esclusive. |
| obqa-10-1102 | correggi | La chiave pressione era falsa; recuperata la grandezza misurata dalla bilancia. |
| obqa-10-1103 | correggi | Interesse e cuccioli erano distrattori estranei: distinto effetto chimico da fisico. |
| obqa-10-1106 | escludi | Usare pochissima acqua non garantisce sopravvivenza e può essere interpretato come restrizione pericolosa dell’idratazione; mancano quantità, condizioni e modalità di uso. |
| obqa-10-1107 | correggi | Bass era tradotto basso: ripristinato il pesce e il relativo ambiente. |
| obqa-10-1108 | correggi | Limo vecchio non basta: esplicitati processi di formazione e confrontate origini geologiche. |
| obqa-10-1113 | correggi | Il metallo non scompare necessariamente dopo l’uso: distinta riserva mineraria dal riciclo. |
| obqa-10-1114 | correggi | Rimosso animali in festa e distinta la capacità di fuga da un generico cambiamento. |
| obqa-10-1115 | correggi | Le azioni delle persone vicine non seguono dalla fotosintesi: chiesto il prodotto del processo. |
| obqa-10-1117 | escludi | Un albero abbattuto non è necessariamente morto e parti vive possono persistere; l’uso di un tronco da parte del castoro non dimostra la premessa biologica. |
| obqa-10-1118 | escludi | L’esposizione all’aria non determina un unico esito dei resti: temperatura, umidità, tempo e decompositori possono produrre condizioni differenti. |
| obqa-10-112 | correggi | Honey era tradotto tesoro; eliminati signori degli insetti e il galleggiamento stabile di liquidi miscibili. |
| obqa-10-1121 | correggi | Specificata la dieta e distinta energia chimica alimentare da luce o respirazione. |
| obqa-10-1122 | correggi | Orecchie che canticchiano o cambiano la fonte erano azioni improprie: identificato il senso. |
| obqa-10-1123 | correggi | Rimosso il riferimento a divieti nazionali non specificati; l’invasione è un rischio, non un esito inevitabile. |
| obqa-10-1124 | correggi | Meno eccitato e nervoso erano impropri: specificate temperature e scambio termico. |
| obqa-10-1125 | correggi | Distinta sudorazione animale da traspirazione vegetale e chiarita l’evaporazione. |
| obqa-10-1126 | correggi | Anche uccelli e anfibi mutano altri rivestimenti: specificati i peli anziché la muta generica. |
| obqa-10-1127 | escludi | La chiave entrambi vengono adeguati non ha significato. Aceto e candeggina non sono un esempio neutro di miscela: possono liberare gas tossici; la voce viene esclusa. |
| obqa-10-1128 | correggi | La traspirazione non è soltanto un controllo generico dell’acqua: definito il processo e rimossa l’alternativa sull’argon. |
| obqa-10-1129 | escludi | Una noce di cocco non garantisce di salvare una persona denutrita; mancano condizioni e bisogno specifico, mentre acqua e nutrimento hanno funzioni diverse. |
| obqa-10-1130 | correggi | Un dispositivo che raffredda non garantisce il congelamento: precisata la temperatura, tenendo conto che il latte è una miscela. |
| obqa-10-1131 | correggi | Localizzazioni non definiva lo stimolo: identificato il fotoperiodo senza attribuirgli ogni risposta stagionale. |
| obqa-10-1136 | correggi | Rimosso il consiglio generico di correre al freddo e le risposte ghiaccioli, soldi e cani. |
| obqa-10-1137 | correggi | Non tutti gli organismi ingeriscono cibo: limitato il quesito agli animali e alla riparazione dei tessuti. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-10-1138 | correggi | Precisato il meccanismo di alterazione fisica della roccia. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-10-1139 | correggi | La chiave vivipara era falsa: l’ornitorinco è un mammifero oviparo; eliminate le frasi prive di senso. |
| obqa-10-114 | correggi | La morte di uno non determina il saldo complessivo se ci sono altre variazioni: fissate le condizioni demografiche. |
| obqa-10-1140 | correggi | Distinta la massa della carcassa da quella complessiva: la materia si trasferisce e non viene distrutta. |
| obqa-10-1142 | escludi | Il Sole fa bene non definisce un effetto misurabile; può avere effetti diversi su ambienti, edifici e veicoli. La fonte riguarda solo il trasferimento di energia. |
| obqa-10-1143 | correggi | Le fasi cambiano continuamente e non esattamente 52 volte all’anno: chiesta la durata del ciclo sinodico. |
| obqa-10-1145 | correggi | Non ogni gas riscaldato sale: specificate pressione, espansione e ambiente di confronto. |
| obqa-10-1146 | correggi | Sentimento ed emozione non erano alternative al tipo di apprendimento: precisato l’esempio. |
| obqa-10-115 | correggi | Sereno non implica luminosità in ogni ora o latitudine: definita la copertura nuvolosa. |
| obqa-10-1151 | correggi | Scura e pesante non garantiva pioggia e ghiaccio è una forma di precipitazione: chiesto il processo di caduta. |
| obqa-10-1152 | escludi | La durata del riposo invernale varia con specie, clima e individuo; venti settimane non si deducono dal mese di novembre e le alternative non sono confrontabili. |
| obqa-10-1153 | correggi | Unicellulare non significa necessariamente isolata da ogni altro organismo: corretta la definizione. |
| obqa-10-1154 | correggi | Completata la domanda sulla composizione e corretto terreno senza affidarsi a una lista incompleta. |
| obqa-10-1155 | correggi | Drafts era tradotto bozze: ripristinato il vento come agente di trasporto. |
| obqa-10-1156 | correggi | La digestione non è una semplice dissoluzione o fusione: distinta la scomposizione dei nutrienti. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-10-1159 | correggi | Ore di veglia non equivale a giorno; identificata la causa del moto apparente. |
| obqa-10-1163 | correggi | Rimossi caseificio e pulsanti; non ridotto l’organismo a una sostanza unica. |
| obqa-10-1166 | escludi | Telecamere e lenti oscurate non sono equivalenti; il trattamento UV non è specificato e il colore di una lente non ne dimostra la protezione ultravioletta. |
| obqa-10-1167 | escludi | La capacità di raggiungere il cibo può dipendere da abilità già presenti e apprendimento; non prova un adattamento evolutivo e non garantisce che il gatto impari a saltare più alto. |
| obqa-10-1168 | correggi | Un impollinatore vivente è distinto dal vettore abiotico vento: specificato il meccanismo. |
| obqa-10-1171 | escludi | La dieta dell’aquila di mare testabianca comprende pesci e anche uccelli: senza contesto alimentare salmone e uccelli possono essere entrambi corretti. |
| obqa-10-1173 | correggi | Bill era tradotto fattura: ripristinato il becco e confrontate parti del corpo. |
| obqa-10-1174 | escludi | Più acqua non garantisce più animali acquatici: contano specie, qualità dell’acqua e risorse. La premessa sul lavoro è una traduzione priva di senso. |
| obqa-10-1175 | correggi | Un ambiente adatto non viene necessariamente colonizzato: chiesti i requisiti senza promettere popolamento. |
| obqa-10-1176 | correggi | Interessante era antropomorfo e il film era un gioco di parole: specificati mosche e segnale olfattivo. |
| obqa-10-1178 | correggi | Il ciclo non ha un unico ultimo passaggio reale: esplicitata la ripetizione attraverso evaporazione. |
| obqa-10-1179 | correggi | Accendere la luce non implica collegamenti surriscaldati: definito l’effetto resistivo senza diagnosticare un guasto. |
| obqa-10-118 | escludi | L’assenza globale dei gatti non implica che una specie invada la Terra: le reti ecologiche includono molti predatori e fattori limitanti. Roditori è inoltre un gruppo, non una specie. |
| obqa-10-1180 | escludi | La quantità di rifiuti dipende da processi, dimensioni e gestione; il settore imprese di pulizie non è selezionabile come unico produttore rilevante. |
| obqa-10-1181 | correggi | Rimosse traduzioni su telefono e santuario; il cibo adatto aiuta senza garantire la sopravvivenza. |
| obqa-10-1182 | escludi | Il fatto di supporto riguarda semi mentre la domanda richiama colibrì e tulipani; impollinazione, crescita e dispersione dei semi sono confusi e manca una specie di pianta coerente. |
| obqa-10-1183 | correggi | Equidistante non è parallelo elettrico; più percorsi da soli non definiscono tutti i dettagli: specificati nodi comuni. |
| obqa-10-1185 | escludi | Il corallo è un animale, non una pianta; esistono coralli profondi e freddi e la traduzione secche non definisce quale gruppo sia considerato. |
| obqa-10-1187 | correggi | Non tutti gli anfibi depongono nello stesso modo: limitato il contesto a specie con girini acquatici. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-10-1189 | escludi | Tostare richiede energia termica, ma non necessariamente contatto con un conduttore; un flusso energetico è anch’esso corretto e il quesito confonde energia e conduzione. |
| obqa-10-119 | correggi | Precisata la liscezza dei materiali e il ruolo degli appigli, senza ridurre tutto alla sola etichetta del materiale. |
| obqa-10-1190 | correggi | Le costole non garantiscono che un colpo al torace sia innocuo: rimossa la falsa rassicurazione sul cuore. |
| obqa-10-1195 | correggi | Il vento non ricarica direttamente il telefono: specificata la conversione e rimossi distrattori senza senso. |
| obqa-10-1197 | escludi | Il numero di tramonti dipende da luogo e anno; febbraio può avere 29 giorni e alle latitudini polari non c’è necessariamente un tramonto quotidiano. |
| obqa-10-1198 | correggi | Precisato il percorso di acqua e nutrienti ed eliminate alternative prive di relazione botanica. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-10-1199 | escludi | La domanda trasforma i globuli bianchi in oggetti da procurarsi e propone di manipolare una pustola senza ragione. La fonte riguarda la funzione immunitaria, non la raccolta di cellule. |
| obqa-10-120 | escludi | Le festività di persone di diverse fedi non identificano un mese o una stagione. Sopra l’equatore può indicare quota o latitudine, e i mesi non sono uniformemente freddi. |
| obqa-10-1200 | correggi | Orologio e religione non erano alternative confrontabili: chiesta la protezione meteorologica senza istruzioni di sopravvivenza. |
| obqa-10-1205 | correggi | Descritta la caduta in termini di forza; rimosse azioni antropomorfe come geme. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-10-1207 | escludi | Il calo dei profitti delle stazioni di servizio non è deducibile senza domanda, prezzi e servizi; veicoli idroelettrici è inoltre un termine improprio. Le alternative non rendono il quesito verificabile. |
| obqa-10-1209 | correggi | Ripristinato il legame fra risorsa necessaria e sopravvivenza, con alternative dello stesso tipo. |
| obqa-10-1210 | correggi | Non tutti gli unicellulari fotosintetizzano: scelto un gruppo fotosintetico e completata la domanda. |
| obqa-10-1211 | correggi | Precisato il bilancio e il superamento delle sponde, senza attribuirlo alla sola pioggia. |
| obqa-10-1212 | correggi | Sostituite perifrasi e centro dell’universo con corpi celesti confrontabili. |
| obqa-10-1214 | escludi | Tutti gli alimenti elencati possono partecipare a reazioni chimiche; senza specificare la reazione il succo di agrumi non è l’unica risposta. |
| obqa-10-1218 | correggi | Hotness era tradotto piccantezza: specificato il modello ad aria calda, poiché esistono apparecchi senza resistenza riscaldante. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-10-1219 | correggi | Distinto il volume dell’acqua dal movimento dell’avvallamento e specificato il meccanismo gelo-disgelo. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-10-122 | correggi | Rimossi zuppa e oggetti casuali; identificata la rampa con la sua funzione. |
| obqa-10-1220 | correggi | La marca e l’anno non erano necessari: specificati alimentazione e motivo dell’arresto. |
| obqa-10-1221 | correggi | Una superficie lucida assorbe anche parte della luce: chiesto il fenomeno caratteristico di uno specchio. |
| obqa-10-1226 | correggi | La frase conteneva già la risposta puzzo: trasformata in una domanda sul tipo di difesa. |
| obqa-10-123 | escludi | Natale non deriva dalla rotazione terrestre e non si oppone a pranzo come evento temporale. Continenti, asse e festività sono collegati senza una relazione definita. |
| obqa-10-126 | correggi | Rimossi esche e trappole; esplicitato il meccanismo di occultamento. |
| obqa-10-128 | escludi | Fabbriche non identifica una sostanza o una specifica emissione; velenoso è una generalizzazione e anche utile può descrivere alcuni prodotti rilasciati. |
| obqa-10-129 | correggi | Più acqua non significa sempre più crescita: specificato il deficit iniziale e un apporto adeguato. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-10-13 | correggi | Materia senza vita era troppo ampia: ripristinato il termine minerale della fonte. |
| obqa-10-131 | correggi | Microfono e altoparlante operano in direzioni opposte: limitata la domanda al microfono. |
| obqa-10-132 | correggi | Anno, mese e settimana erano intervalli tutti compatibili: chiesta la causa delle fasi. |
| obqa-10-135 | escludi | La scena della Terra mangiata è priva di contesto scientifico e tratta tutta la Terra come pietra, ignorando composizione e strati. Le alternative sono oggetti casuali. |
| obqa-10-136 | correggi | La domanda originaria distingueva una pianta da oggetti non viventi senza spiegare il processo: specificate le strutture fogliari. |
| obqa-10-137 | correggi | Alti e bassi non prova una perdita: chiesto il grafico di un andamento, distinguendo incasso da utile. |
| obqa-10-138 | correggi | Superficie piana era impreciso: nominate le pale e componenti dello stesso apparecchio. |
| obqa-10-139 | correggi | La frase faceva lavorare le persone anziché gli alimenti: corretto il soggetto e uniformate le alternative. |
| obqa-10-14 | escludi | La scarsità di luce può selezionare adattamenti nel tempo o provocare acclimatazione, ma non fa necessariamente adattare una singola pianta; meccanismo e tempi sono assenti. |
| obqa-10-140 | escludi | La Polare resta sopra l’orizzonte al Polo Nord, ma visibile tutto l’anno ignora il giorno polare e le condizioni di osservazione. Le altre risposte sono malformate. |
| obqa-10-141 | correggi | Molto male era un giudizio vago: specificate le reazioni dipendenti dalla luce. |
| obqa-10-142 | correggi | Non tutti i mammiferi sono vivipari e un embrione nell’uovo è vivo: eliminata la falsa contrapposizione vivo/uovo. |
| obqa-10-143 | correggi | Dintorni era troppo ristretto: inclusi apprendimento e condizioni ambientali. |
| obqa-10-144 | correggi | Luce solare e radiazione solare erano poste in relazione circolare: chiesto l’effetto energetico. |
| obqa-10-145 | escludi | Il testo non distingue formazione del suolo, lavorazione agricola e ripristino dei nutrienti; la frammentazione delle rocce non dimostra il risultato del campo descritto. |
| obqa-10-147 | correggi | Un microscopio può ingrandire testo e un binocolo in alcuni casi: precisati uso comune e alternative funzionali distinte. |
| obqa-10-148 | correggi | Un telescopio può osservare anche animali lontani: chiesto lo strumento per un compito astronomico. |
| obqa-10-15 | escludi | La tendenza dei lupi a evitare persone non garantisce sicurezza in un incontro specifico; il testo dà una rassicurazione non deducibile e alternative caricaturali. |
| obqa-10-150 | correggi | Burrasche non è una causa universale della deposizione: descritto il deposito per perdita di capacità di trasporto. |
| obqa-10-152 | correggi | La popolazione del paese non basta: specificato l’inquinamento luminoso e fissate le altre condizioni. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-10-153 | correggi | Specificati i fattori controllati e la velocità di evaporazione; eliminati latte e carboni. |
| obqa-10-157 | correggi | I procarioti non hanno un nucleo delimitato: corretta la chiave falsa e distinta cellula da nucleo. |
| obqa-10-158 | escludi | Minori vendite di un prodotto non dimostrano perdite complessive di un’azienda; mancano prezzo, costi e altre attività. Non si deducono risultati economici reali da questa premessa. |
| obqa-10-159 | correggi | Avanti e indietro dipendono dal riferimento: chiesto il modulo della velocità e la forza risultante. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-10-16 | escludi | Cervo indica specie con habitat diversi; una generica preferenza per il bosco non è dimostrata e spazio e oceano non costruiscono un confronto utile. |
| obqa-10-160 | correggi | Un liquido può evaporare anche a bassa temperatura: caldo non è la definizione del passaggio. |
| obqa-10-163 | correggi | Aumentare l’altitudine era una traduzione vaga: chiesta la funzione della carrucola fissa senza attribuirle vantaggio di forza. |
| obqa-10-165 | escludi | Osaka e Alaska sono entrambe aree sismiche e anche altre regioni possono subire terremoti; manca un criterio di confronto che renda unica la risposta. |
| obqa-10-167 | correggi | Una bussola da sola non ritrova una rotta: precisata l’informazione che misura. |
| obqa-10-168 | escludi | Un cucciolo può tremare per freddo, paura, dolore o altre cause; il tremore da solo non dimostra che la temperatura esterna sia scesa. |
| obqa-10-169 | correggi | Stella locale e luce solare erano alternative sovrapposte: identificato il corpo e ricordata l’inclinazione. |
| obqa-10-17 | correggi | Gli indumenti non identificano universalmente la stagione: confrontate le stagioni nei due emisferi. |
| obqa-10-170 | correggi | Specificato il volume occupato e distinta la forma dal passaggio di stato. |
| obqa-10-172 | correggi | Osservare era generico: ripristinata la funzione del cilindro graduato indicata nella fonte. |
| obqa-10-175 | correggi | L’habitat degli squali non deriva dalla sola galleggiabilità: chiesto il confronto fisico fra liquidi. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-10-176 | correggi | Configurazione chiarita come forma e distinto il cambiamento geometrico da quello chimico. |
| obqa-10-177 | correggi | Il rapporto con gli animali non era definito: recuperato il contesto della produzione dei semi. |
| obqa-10-18 | correggi | Anche più verde era una conseguenza possibile: richiesto specificamente il rischio del pendio. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-10-180 | escludi | Formaggio e presunta allergia al Sole non definiscono il trattamento di una carenza di vitamina D; mancano dati clinici e il contenuto vitaminico varia fra prodotti. |
| obqa-10-181 | correggi | Non è composta soltanto da bocche laviche sommerse: ripristinata la definizione geografica. |
| obqa-10-183 | correggi | Rimosso socializzare e precisata la protezione microclimatica senza garantire una temperatura in ogni condizione. |
| obqa-10-184 | correggi | Tramoggia per alberi era una traduzione zoologica impropria: usato un anfibio coerente con la fonte. |
| obqa-10-186 | correggi | La chiave rifrangere confondeva riflessione e rifrazione; rimossa la descrizione chimica errata del rivestimento. |
| obqa-10-188 | correggi | Rimosse azioni prive di relazione e riferimenti a luoghi di raccolta non specifici. |
| obqa-10-190 | escludi | L’impatto di un sapone dipende da ingredienti, quantità e scarichi; anche le altre attività possono avere impatti indiretti. Non è indicata una sostanza o un’emissione verificabile. |
| obqa-10-191 | escludi | Un tronco con segatura non è un isolamento elettrico certificato e l’umidità cambia la conducibilità del legno. La domanda propone una falsa soluzione protettiva. |
| obqa-10-192 | correggi | Flora e crostacei erano entrambi compatibili con l’onnivoria: chiesta la combinazione che definisce la dieta. |
| obqa-10-193 | correggi | La nube non precipita come un oggetto intero: descritto il moto delle particelle. |
| obqa-10-196 | correggi | Premere un tasto su una presa non definiva la conduzione: esplicitati circuito e portatori di carica. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-10-197 | correggi | Il testo parlava di polline ma chiedeva diffusione del seme: corretto il processo e rese distinte le alternative. |
| obqa-10-198 | escludi | Combustibile alternativo non significa necessariamente rinnovabile e le risposte bene, suono, bere e pasto non rispondono alla domanda. |
| obqa-10-2 | escludi | Coperchi chiusi è una traduzione di shut-eye, non una raccomandazione comprensibile. La domanda generale sulla salute e le alternative assolute non definiscono una scelta verificabile. |
| obqa-10-20 | correggi | Un oggetto di ferro a forma di ferro di cavallo non è necessariamente una calamita: precisata la magnetizzazione. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-10-201 | correggi | Pericoloso era troppo generico: specificato il meccanismo che riguarda la circolazione. |
| obqa-10-202 | correggi | Colazione e ferri di cavallo erano distrattori senza senso: chiesto il ruolo del produttore. |
| obqa-10-203 | correggi | Incenerimento sostituito con il termine corretto e rimossa la frase carisma esplosivo. |
| obqa-10-204 | escludi | Perdere massa non garantisce un volo migliore: può indicare denutrizione e cambiare la capacità muscolare. Mancano specie, condizioni e significato di meglio. |
| obqa-10-209 | correggi | Esplicitata la differenza invece di una generica diversità tra organismi. |
| obqa-10-21 | correggi | Completo e acceso erano vaghi: precisati alimentazione e percorso chiuso. |
| obqa-10-210 | escludi | Premessa e chiave sono contraddittorie: una lampadina su uno scaffale non si accende senza alimentazione. Non è definita una domanda ricostruibile senza sostituire il testo. |
| obqa-10-212 | correggi | Vellutati era una traduzione impropria: descritti levigatura e arrotondamento. |
| obqa-10-215 | correggi | Precisata la funzione dell’interruttore e distinto chiudere da aprire il circuito. |
| obqa-10-217 | correggi | Non tutto il calcare deriva da evaporazione: rimossa l’origine geologica generalizzata e mantenuto l’impiego industriale. |
| obqa-10-218 | correggi | Rimossa la scena dello sputare e chiesto il ruolo riproduttivo, senza dipendere dal colore dei semi. |
| obqa-10-219 | escludi | L’alimentazione dei gechi varia per specie e fase di vita; bachi della cera non è una risposta alimentare universale e manca il contesto necessario. |
| obqa-10-22 | correggi | Prosperare era generico e spazzolone fuori contesto: precisato l’isolamento termico. |
| obqa-10-220 | escludi | Cibo, riposo e attività possono tutti contribuire alla salute a seconda della specie: la domanda non definisce un requisito unico fra le alternative. |
| obqa-10-221 | correggi | L’efficienza da sola non determina il consumo totale se aumenta la distanza: fissato il tragitto. |
| obqa-10-223 | escludi | Avvolgere una ciotola nella plastica può limitare lo scambio con l’aria e mostrare condensazione; non è specificato un esperimento che isoli l’evaporazione. |
| obqa-10-226 | correggi | Distinti resti anatomici da proprietà della roccia che non identificano l’animale. |
| obqa-10-227 | correggi | Rimosso il determinismo sanitario e distinta una previsione verificabile da osservazioni già registrate. |
| obqa-10-23 | correggi | Sostituiti porta e tavolo con organismi, identificando i tessuti delle piante vascolari. |
| obqa-10-230 | correggi | Petto era una localizzazione vaga: specificata la sede dello scambio e corretta la fonte che includeva il digerente. |
| obqa-10-231 | correggi | Confrontate grandezze astronomiche senza mescolare animali e oggetti domestici. |
| obqa-10-232 | escludi | Sabbia e argilla non sono fonti rinnovabili sulla scala del loro sfruttamento e le altre alternative non forniscono una chiave valida. La fonte non giustifica la scelta. |
| obqa-10-233 | correggi | Precisata la fase di partenza: essere in longitudine eclittica con il Sole era una formulazione incompleta. |
| obqa-10-234 | escludi | Sulla Luna è presente acqua, soprattutto ghiaccio, e anche Marte non offre acqua potabile pronta. Terra e terzo pianeta sono inoltre la stessa alternativa. |
| obqa-10-235 | correggi | La risposta è sano non completava il quesito: ricostruita la funzione del pigmento. |
| obqa-10-236 | escludi | La durata al Sole non specifica esposizione, temperatura o stato di salute; la morte non è deducibile e le altre alternative sono assurde. |
| obqa-10-237 | correggi | Ioni positivi non è la fonte di alimentazione del computer: corretta la chiave e rimosse risposte antropomorfe. |
| obqa-10-238 | escludi | L’abbondanza di organismi non dipende soltanto dal calore e poco calore non è una condizione fisica definita; si confondono quantità di individui e varietà di specie. |
| obqa-10-239 | escludi | Sterne identifica molte specie migratrici e prosperare al freddo dipende da specie e periodo. La fonte parla di abbondanza di organismi e non sostiene la chiave. |
| obqa-10-240 | escludi | Clima rigido non significa necessariamente siccità e il prosciugamento di uno stagno non è deducibile. Il fatto di supporto riguarda una serra, non lo scenario. |
| obqa-10-244 | escludi | Più acqua non garantisce greggi di pecore più numerose; mancano pascolo e gestione e le altre alternative sono prive di senso. |
| obqa-10-250 | correggi | Rimosse supernove e buchi neri come eventi locali e collegata la rotazione all’illuminazione. |
| obqa-10-251 | correggi | L’ago ha due estremità opposte e non punta tutto verso l’Artico: specificata l’estremità. |
| obqa-10-252 | escludi | Esistono pinguini che nidificano in foreste, per esempio il pinguino crestato del Fiordland. Non tutti i pinguini vivono ai poli: la chiave generalizza in modo errato. |
| obqa-10-253 | correggi | Tables era tradotto tabelle e anche altre superfici riflettono: chiesto il fenomeno. |
| obqa-10-255 | escludi | Asciugare capelli e pulire finestre bagnate possono mostrare evaporazione quanto cuocere la pasta: ci sono più alternative corrette. |
| obqa-10-257 | correggi | Vicino non significa gigantesco: esplicitato il confronto della dimensione apparente. |
| obqa-10-26 | escludi | Uno scricchiolio non dimostra che siano cadute foglie morte; può provenire da rami, foglie calpestate o altre sorgenti non indicate. |
| obqa-10-262 | escludi | La macinazione del caffè richiederebbe un dispositivo aggiuntivo e non segue dalla presenza di viti nella bicicletta; le alternative non definiscono il compito. |
| obqa-10-265 | correggi | Una persona può celebrare con frequenze diverse: chiesto il numero degli eventi astronomici. |
| obqa-10-267 | correggi | Non tutti gli anelli sono sempre annuali: esplicitata la condizione e rimossa la premessa legale sul valore. |
| obqa-10-268 | escludi | Più pioggia su un periodo non implica automaticamente meno luce solare sullo stesso periodo; mancano copertura nuvolosa, durata e misure. |
| obqa-10-27 | escludi | La sopravvivenza invernale dei bombi dipende da specie e casta: non tutti dormono a lungo. Le risposte descrivono qualità del sonno senza un criterio biologico. |
| obqa-10-271 | escludi | Il calo della pressione può essere associato al maltempo ma non impone precipitazioni; la frase attribuisce alle nubi verbi non interpretabili e manca il contesto meteorologico. |
| obqa-10-272 | correggi | Rigato poteva indicare un rilievo tattile: distinte proprietà visive da forma percepibile al tatto. |
| obqa-10-277 | correggi | Nano giallo era una perifrasi non necessaria: identificata la sorgente. |
| obqa-10-278 | correggi | Livello di attività atomica e liquidità non definivano un processo: ricostruito il passaggio di stato. |
| obqa-10-279 | correggi | Collisioni con sporco non aveva significato; i terremoti non richiedono solo collisione fra placche. |
| obqa-10-28 | correggi | Esplicitata la dominanza completa, evitando una regola universale per ogni eredità genetica. |
| obqa-10-282 | escludi | I colori delle mappe dipendono dalla legenda e nelle immagini aeree dalla modalità di acquisizione; verde scuro non identifica universalmente una foresta densa. |
| obqa-10-283 | escludi | La dimensione del fiore da sola non determina numero o specie degli impollinatori; mancano nettare, colore, stagione e ambiente. Monarchi è inoltre ambiguo senza nominare le farfalle. |
| obqa-10-287 | escludi | Gli insetti stecco possono avere colori diversi secondo specie e condizioni; marrone non è un colore unico né universale. |
| obqa-10-288 | correggi | Tutte le risposte originali erano miscele: circoscritto il confronto a due liquidi. |
| obqa-10-289 | correggi | Il petrolio non è costituito semplicemente da resti di dinosauri; specificato il motore, perché esistono rasaerba manuali o con altre alimentazioni. |
| obqa-10-290 | correggi | Un livido non dura normalmente sei anni: ripristinata la cicatrice del fatto di supporto. |
| obqa-10-292 | escludi | Cerniere, lampadine e panchine possono contenere materiali magnetici o non magnetici: senza specificarli non c’è una sola risposta. |
| obqa-10-293 | escludi | La frase è malformata e il fatto di supporto su un ecosistema non implica un’infestazione urbana di cimici; mancano specie e condizioni. |
| obqa-10-294 | correggi | Tessuto fibroso non è sinonimo di muscolo: precisata la struttura responsabile della contrazione. |
| obqa-10-296 | correggi | Quanto tremavano le cose sostituito con la grandezza fisica; la magnitudo viene ricavata dall’analisi delle registrazioni. |
| obqa-10-297 | escludi | La relazione fra acqua e sostentamento dipende dall’ecosistema e dalle risorse; il testo ripete acqua disponibile in modo circolare senza definire la grandezza confrontata. |
| obqa-10-298 | correggi | Non tutti gli uccelli volano a sud al freddo: chiesto il comportamento senza direzione geografica universale. |
| obqa-10-299 | correggi | Lunghezza e spessore hanno anche componenti genetiche: specificato il taglio come causa acquisita. |
| obqa-10-3 | correggi | Tremano le viscere era una traduzione errata: descritte vibrazioni e propagazione. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-10-30 | correggi | Cartella in tela sostituita con borsa e criterio limitato al riutilizzo, senza pretendere un confronto completo d’impatto ambientale. |
| obqa-10-300 | correggi | Lo spessore osseo risente anche di ambiente e attività: scelto un carattere genetico definito. |
| obqa-10-301 | correggi | Umidità e beneficio per la pelle non definivano il fenomeno; distinte gocce da vapore. |
| obqa-10-302 | correggi | Precisato il completo scioglimento e rimossa acqua di mare, che richiede composizione diversa. |
| obqa-10-304 | correggi | Noccioli non equivale a semi e i veri frutti della fragola sono acheni: rimossa la generalizzazione sulle bacche e sulle strutture esterne. |
| obqa-10-305 | correggi | Precisata l’origine vulcanica senza imporre pochi anni come tempo universale. |
| obqa-10-306 | escludi | Animali, erba e alcune vernici possono bruciare; non si può selezionare soltanto il barattolo di vernice senza specificarne il contenuto. |
| obqa-10-308 | correggi | La chiave sugli ioni era errata per un conduttore metallico; eliminate riferimenti a gatti e scintille sulle pareti. |
| obqa-10-309 | correggi | Rimossi formaggio e laghi; confronto coerente fra strutture antiche e manufatti recenti. |
| obqa-10-31 | escludi | Il tempo necessario a trasformare una pietra in sabbia dipende da materiale, ambiente e processi; un millennio non è una durata generale. |
| obqa-10-311 | escludi | Porre una roccia in un bicchiere non ne provoca l’alterazione meccanica. È possibile una traduzione errata di rock tumbler ma il testo e le risposte non lo specificano. |
| obqa-10-310 | correggi | Non serve necessariamente una lampada: precisata la luce rinviata da un oggetto non luminoso. |
| obqa-10-312 | correggi | Frenare bruscamente non garantisce una decelerazione efficace su ogni fondo: indicata la funzione dei freni. |
| obqa-10-314 | escludi | Limitare indistintamente l’accesso umano non garantisce un vantaggio ambientale: servono obiettivi e gestione del territorio. Rivolta e costruzione non definiscono alternative comparabili. |
| obqa-10-315 | correggi | Molliccio non indica la durezza relativa: esplicitato il confronto senza etichette che si confondano con le lettere delle opzioni. |
| obqa-10-316 | correggi | Anche illuminare un percorso può essere un uso dell’energia: specificato il componente di conversione. |
| obqa-10-321 | correggi | Dimenarsi non identifica il ruolo ecologico e il mucchio abbattuto non prova decomposizione: chiesto il gruppo funzionale. |
| obqa-10-324 | escludi | La contentezza della famiglia e l’età della persona non si deducono dalla nascita; il testo confonde maturità sessuale, età adulta e giudizio sociale. |
| obqa-10-325 | escludi | Non sono precisati specie, casta, intervallo di tempo né uova deposte rispetto agli ovociti prodotti. Autista africano Ant è inoltre una traduzione non interpretabile. |
| obqa-10-328 | correggi | Un oggetto già in moto non aumenta necessariamente energia: esplicitata la variazione di velocità e la dipendenza quadratica. |
| obqa-10-329 | correggi | Pools era tradotto piscine: specificata condensazione sopra il congelamento. |
| obqa-10-331 | escludi | Il collegamento tra feci di bradipo e guacamole non è dimostrato dalla necessità generale di dispersione dei semi; la fonte non identifica né specie né pianta. |
| obqa-10-332 | escludi | La premessa sulla stufa bianca non ha fondamento; una superficie bianca non riflette ogni fotone senza assorbirne alcuno. Le alternative sono caricaturali e fuori contesto. |
| obqa-10-333 | correggi | Un circuito completo da solo non basta senza energia: specificati lampadina e batteria funzionanti. |
| obqa-10-336 | escludi | Clean Air Act è tradotto atto di pulizia dell’aria e non è specificata la norma o la giurisdizione. Fabbricante e corsi scolastici non sono alternative confrontabili. |
| obqa-10-34 | correggi | Una spinta non richiede necessariamente sforzo intenso: identificata la grandezza fisica. |
| obqa-10-341 | correggi | La vibrazione può generare suono ma non deve sempre essere udibile: precisato il fenomeno. |
| obqa-10-342 | correggi | Eliminate visione a raggi X e formulazioni caotiche; distinto l’ambito di protezione del dispositivo. |
| obqa-10-343 | escludi | La navigazione degli uccelli usa segnali diversi e non garantisce sempre la rotta corretta; manca la specie e la fonte non giustifica un unico meccanismo infallibile. |
| obqa-10-344 | correggi | Ricavare energia era generico: distinto l’apporto alimentare dalle attività che la consumano. |
| obqa-10-345 | correggi | Muri di H2O ghiacciata sostituito con ghiacciai e preservata la complessità geologica con contribuito. |
| obqa-10-347 | escludi | La Terra perde e assorbe energia con un bilancio variabile; guadagna di più non è una legge universale e milione di parti non è una misura definita. |
| obqa-10-349 | correggi | I topi possono vivere anche in edifici: specificati campagna e tane scavate nel terreno. |
| obqa-10-350 | correggi | Mantle era interpretato come ripiano di un camino: ripristinato il termine geologico. |
| obqa-10-554 | correggi | Copia esatta di obqa-9-508 (testo, tutte le alternative e chiave): applicata la stessa decisione contestuale. Le stelle non sono gas infiammato per combustione: ripristinata la loro identità senza distrattori estranei. |
| obqa-11-111 | correggi | Copia esatta di obqa-9-322 (testo, tutte le alternative e chiave): applicata la stessa decisione contestuale. Il Sole non è sempre allo zenit a mezzogiorno: corretto il fenomeno apparente e la causa. |
| obqa-12-159 | correggi | Copia esatta di obqa-9-566 (testo, tutte le alternative e chiave): applicata la stessa decisione contestuale. Precisati altezza della colonna d’acqua e punto di misura; anche una rottura può aumentare le sollecitazioni in altri modi. |
| obqa-12-645 | correggi | Copia esatta di obqa-9-727 (testo, tutte le alternative e chiave): applicata la stessa decisione contestuale. Specificato il rapporto mimetismo-avvicinamento, sostituendo pasti con preda. |
| obqa-13-215 | correggi | Copia esatta di obqa-7-1018 (testo, tutte le alternative e chiave): applicata la stessa decisione contestuale. La chiave tirare su una ruota era errata: descritta la funzione della carrucola fissa. |
| obqa-13-308 | correggi | Copia esatta di obqa-9-317 (testo, tutte le alternative e chiave): applicata la stessa decisione contestuale. Eliminati banane, legno e metallo: confrontate forme energetiche. |
| obqa-13-839 | correggi | Copia esatta di obqa-9-298 (testo, tutte le alternative e chiave): applicata la stessa decisione contestuale. Conservazione riferita esplicitamente al combustibile, evitando oggetti e sostanze non confrontabili. |
| obqa-13-859 | correggi | Copia esatta di obqa-7-999 (testo, tutte le alternative e chiave): applicata la stessa decisione contestuale. Accorciata la premessa e precisato l’effetto meccanico delle radici; eliminate conseguenze alternative senza contesto. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |
| obqa-14-132 | correggi | Copia esatta di obqa-7-208 (testo, tutte le alternative e chiave): applicata la stessa decisione contestuale. Precisati intensità, durata e portata; anche scarsità potabile e altri danni erano possibili dopo un temporale. |
| obqa-14-1370 | correggi | Copia esatta di obqa-9-197 (testo, tutte le alternative e chiave): applicata la stessa decisione contestuale. Reso diretto il legame precipitazioni-acqua; non garantita l’intera disponibilità idrica che dipende anche da deflusso e infiltrazione. |
| obqa-14-1416 | correggi | Copia esatta di obqa-7-203 (testo, tutte le alternative e chiave): applicata la stessa decisione contestuale. Corretti gli esempi di riflesso e la formulazione inchiodare una cornice. |
| obqa-14-1510 | correggi | Copia esatta di obqa-9-16 (testo, tutte le alternative e chiave): applicata la stessa decisione contestuale. Anche gli altri animali possono essere agili: sostituito il confronto non esclusivo con il comportamento di fuga. |
| obqa-14-651 | correggi | Copia esatta di obqa-9-257 (testo, tutte le alternative e chiave): applicata la stessa decisione contestuale. Eliminati eleganza e intenzionalità evolutiva: chiesto il vantaggio del mantello nel contesto innevato. Alternative rifinite per mantenere errori plausibili e pertinenti al contesto. |

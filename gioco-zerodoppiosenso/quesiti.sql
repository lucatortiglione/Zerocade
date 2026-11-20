-- Banca pilota. Ordine editoriale di gioco: ORDER BY numero.
-- Le soluzioni provengono dalla selezione lessicale di ZeroLettere.
-- Gli indizi e la loro divisione in frammenti sono originali.
BEGIN;
CREATE TABLE quesiti (
  numero INTEGER PRIMARY KEY CHECK (numero BETWEEN 1 AND 50),
  livello INTEGER NOT NULL CHECK (livello = 1 + (numero - 1) / 10),
  soluzione TEXT NOT NULL UNIQUE,
  indizio TEXT NOT NULL,
  frammento_1 TEXT NOT NULL,
  frammento_2 TEXT NOT NULL,
  frammento_3 TEXT NOT NULL
);
INSERT INTO quesiti VALUES
-- 1. Due scene quotidiane, con un primo indizio molto riconoscibile.
(1,1,'pesca','È un frutto con il nocciolo e, spesso, la buccia vellutata.','Al lago','la pratichi con un galleggiante','e un verme sull’amo.'),
(2,1,'lingua','È la prima a toccare il gelato quando lecchi il cono.','Per parlarne una nuova','puoi cominciare da poche parole','e da un corso di spagnolo.'),
(3,1,'margherita','È il fiore a cui togli un petalo per volta dicendo «m’ama, non m’ama».','In pizzeria','la riconosci dal pomodoro','con mozzarella e basilico.'),
(4,1,'scopa','Ha il manico lungo e raccoglie le briciole dal pavimento.','Al tavolo','ci giochi con quaranta carte','e fai un punto se le prendi tutte dal tavolo.'),
(5,1,'cavallo','Al galoppo porta in sella il fantino.','Sulla scacchiera','scavalca gli altri pezzi','muovendosi a L.'),
(6,1,'gomma','La passi sul foglio per cancellare la matita.','Se si fora','puoi dover accostare','e montare la ruota di scorta.'),
(7,1,'riccio','È il piccolo animale che si chiude a palla mostrando gli aculei.','Dal parrucchiere','puoi avvolgere una ciocca','per formarne uno a spirale.'),
(8,1,'bottone','Lo infili nell’asola prima di uscire col cappotto.','In ascensore','ne premi uno','per scegliere il piano.'),
(9,1,'carta','È il materiale dei fogli del quaderno.','Alla cassa','puoi avvicinarla al lettore','per pagare col tuo conto.'),
(10,1,'cuffia','In piscina la metti in testa per raccogliere i capelli.','Alla postazione del DJ','ne appoggi un lato all’orecchio','per ascoltare il prossimo brano.'),
-- 2. Il primo indizio lascia spazio a più risposte familiari.
(11,2,'trucco','Il prestigiatore spera che tu non lo scopra.','Prima di uscire','lo ritocchi allo specchio','con cipria e rossetto.'),
(12,2,'coppa','Il capitano la solleva dopo la finale.','Dal salumiere','si ordina a etti','e si affetta sottile.'),
(13,2,'mazzo','Il fioraio lo lega con un nastro.','Il giocatore','lo mescola per bene','prima di distribuire le carte.'),
(14,2,'zecca','Può restare attaccata alla pelle del cane dopo una passeggiata.','In città','è il posto dove si battono','le monete appena disegnate.'),
(15,2,'canale','A Venezia lo attraversi in vaporetto.','Dal divano','puoi cambiarlo','con un tasto del telecomando.'),
(16,2,'maglia','Il ciclista in testa al Giro ne indossa una rosa.','Su una catena','è il singolo elemento','agganciato a quello successivo.'),
(17,2,'cappa','Sta sopra i fornelli e aspira gli odori.','Sulle spalle','la porta il cavaliere','come un ampio mantello.'),
(18,2,'bocca','Il dentista ti chiede di aprirla.','In montagna','quella di un vulcano','può sputare cenere e lapilli.'),
(19,2,'riso','A fine cottura puoi mantecarlo con burro e formaggio.','A teatro','il comico cerca di suscitarlo','anche nello spettatore più serio.'),
(20,2,'ciglio','Basta che uno finisca nell’occhio per farti lacrimare.','Lungo la strada','lo raggiungi accostando','proprio al limite dell’asfalto.'),
-- 3. Dal concreto al figurato, o da un mestiere a un altro.
(21,3,'credenza','In sala da pranzo custodisce il servizio buono.','Quella popolare','può durare secoli','come l’idea che un gatto nero porti sfortuna.'),
(22,3,'radice','Lavora sotto terra e tiene in piedi anche una quercia.','Sul quaderno','quella quadrata di ottantuno','vale nove.'),
(23,3,'talpa','Del suo passaggio sul prato restano mucchietti di terra.','In un’indagine','è la persona infiltrata','che passa informazioni di nascosto.'),
(24,3,'nodo','Il marinaio lo controlla prima di mettere in tiro una cima.','Sul quadrante di bordo','è una misura di velocità','pari a un miglio nautico all’ora.'),
(25,3,'gola','Ti si secca dopo aver parlato a lungo.','Tra due pareti di roccia','puoi attraversarne una','seguendo il torrente che l’ha scavata.'),
(26,3,'manica','Il sarto la accorcia lasciando scoperto il polso.','In aeroporto','quella a vento si gonfia','e indica da dove soffia.'),
(27,3,'frana','Può bloccare in pochi istanti una strada di montagna.','Dopo tre disastri ai fornelli','potresti ammettere','«In cucina sono proprio una…».'),
(28,3,'sorgente','A volte la trovi seguendo un ruscello fino al suo inizio.','Il programmatore','apre il codice che porta questo nome','per cambiare le istruzioni di un’app.'),
(29,3,'montatura','A volte la scegli mentre aspetti di avere le lenti nuove.','In una falsa accusa','è la messinscena costruita ad arte','per far sembrare vere le prove.'),
(30,3,'trama','Se la racconti tutta, rischi di rovinare il film a un amico.','Sul telaio','corre da un lato all’altro','incrociando i fili dell’ordito.'),
-- 4. Un uso figurato o settoriale si riconosce incrociando le scene.
(31,4,'margine','In una trattativa provi a capire quanto te ne resta.','Sul quaderno','è lo spazio che lasci bianco','fra il testo e il bordo del foglio.'),
(32,4,'polso','A chi dirige una classe difficile può servirne parecchio.','Al pronto soccorso','l’infermiere può sentirlo','con due dita sotto la base del pollice.'),
(33,4,'vena','Uno scrittore può attraversare un periodo in cui gli manca quella comica.','Nella roccia','chi cerca oro ne segue una','fin dove arriva il filone.'),
(34,4,'modulo','In panchina puoi cambiarlo anche tenendo in campo gli stessi undici.','Allo sportello','te ne porgono uno','con caselle da compilare e firmare.'),
(35,4,'registro','Passando da una battuta a un discorso solenne, lo cambi.','A scuola','oggi è spesso elettronico','e ci finiscono voti e assenze.'),
(36,4,'partita','Un commerciante può respingerne una intera per un solo difetto di fabbrica.','Su un campo','può finire in parità','dopo novanta minuti più recupero.'),
(37,4,'divisa','Se è straniera, il suo valore oscilla rispetto all’euro.','In stazione','la riconosci addosso al capotreno','anche prima che chieda il biglietto.'),
(38,4,'rotta','Può rendere necessario evacuare le case vicino a un argine.','In cabina','il pilota la corregge','per riportare l’aereo sul percorso previsto.'),
(39,4,'morsa','Quando il gelo stringe, si dice che la città è nella sua.','In officina','girando una vite','ne chiudi le ganasce attorno al pezzo.'),
(40,4,'fattura','Si giudica dai dettagli quando è quella di un abito ben fatto.','Per un lavoro appena concluso','può arrivarti in formato elettronico','con imponibile e IVA.'),
-- 5. Il primo indizio allude; l'ultimo frammento risolve l'incrocio.
(41,5,'bolla','Una promessa di guadagni facili può gonfiarla finché scoppia.','Negli archivi pontifici','è un documento solenne','che prende il nome dal sigillo.'),
(42,5,'retta','In un convitto può pesare sul bilancio della famiglia.','Sul piano','due punti distinti bastano','per determinarne una sola, infinita.'),
(43,5,'fiera','In un bestiario medievale potrebbe balzarti addosso.','Per un editore','quella del libro è un appuntamento','con stand, lettori e autori.'),
(44,5,'lira','A fine Novecento a Roma ne servivano quasi duemila per fare un euro.','Nelle mani di Orfeo','accompagnava il canto','con corde tese fra due bracci.'),
(45,5,'trapezio','Può farti male all’altezza delle spalle dopo ore alla scrivania.','Sotto il tendone','l’acrobata lo lascia un istante','per afferrare al volo la barra successiva.'),
(46,5,'saggio','In laboratorio ne basta uno per cercare una sostanza in un campione.','In libreria','lo trovi fra le opere in prosa','che sviluppano una tesi su un argomento.'),
(47,5,'armatura','Sul pentagramma decide quali note cambiano per tutto il brano.','Sotto il cemento','è lo scheletro d’acciaio','che rinforza travi e pilastri.'),
(48,5,'fronte','In meteorologia può essere occluso.','Davanti allo specchio','la vedi corrugarsi','appena alzi le sopracciglia.'),
(49,5,'stima','Puoi perderla agli occhi di qualcuno mantenendo intatto il tuo patrimonio.','Prima di un’asta','un perito la formula','per attribuire un valore al lotto.'),
(50,5,'corte','La fai sperando di essere ricambiato.','Quando entra in aula','ci si alza in piedi','davanti al collegio che pronuncerà la sentenza.');
COMMIT;

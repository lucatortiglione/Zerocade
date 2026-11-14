# Revisione delle domande per un pubblico italiano

Data: 6 novembre 2026.

**Snapshot della precedente revisione per pubblico italiano.** Successivamente sono state applicate le correzioni e le esclusioni contestuali descritte in [REVISIONE-RISPOSTE.md](REVISIONE-RISPOSTE.md); i conteggi sotto riportano lo stato precedente.

Analizzate **26,715 domande**; **459 esclusioni proposte**. Nel DB sono attive **tutte le 26,715 domande**, come richiesto successivamente dall'utente.

Il file `domande-escluse.json` contiene ID, testo, tutte le opzioni, risposta corretta, originale inglese e motivi. È un elenco di esclusioni proposte: la revisione non disattiva né cancella record.

## Criteri

Si segnalano dipendenze dalla lingua inglese e dal doppiaggio estero, trivia locali USA/UK, unità non localizzate, riferimenti a supporti assenti, opzioni legate alla posizione, contenuti espliciti, droghe, cronaca violenta e ambiguità evidenti.

Si mantengono cultura internazionale, opere e personaggi noti, storia e geografia estere, anatomia e riproduzione trattate scientificamente. Un nome straniero o una citazione del corpo umano non bastano a escludere una domanda.

| Criterio | Segnalazioni |
| --- | ---: |
| ambiguita | 1 |
| comportamento_rischioso | 1 |
| contesto_locale | 108 |
| doppiaggio_non_italiano | 51 |
| droghe | 5 |
| geografia_locale | 30 |
| istituzioni_locali | 27 |
| lingua_inglese | 156 |
| offensivo | 2 |
| opzioni_dipendenti | 2 |
| sessuale_esplicito | 10 |
| stereotipo | 1 |
| traduzione | 22 |
| unita_non_localizzate | 27 |
| violenza_esplicita | 9 |
| violenza_tragedie | 32 |

Una domanda può avere più motivi: la somma delle segnalazioni può superare le esclusioni proposte.

| Fonte | Domande analizzate | Esclusioni proposte |
| --- | ---: | ---: |
| apininjas | 56 | 4 |
| arc | 7709 | 4 |
| openbookqa | 5950 | 38 |
| opentdb | 4978 | 169 |
| originale | 22 | 1 |
| triviaapi | 8000 | 243 |

## Metodo e limiti

Screening automatico di ogni domanda, opzione e originale disponibile; regole trasparenti e decisioni editoriali esplicite nel programma script/verifica_pubblico.py.

Non costituisce lettura editoriale individuale né verifica fattuale completa di tutte le risposte. Le traduzioni poco naturali non sono tutte riconoscibili con regole; assenza dall'elenco non certifica correttezza o idoneità.

Tutte le domande presenti in data/domande.db, incluse quelle precedentemente non attive. I record già omessi dalle fonti con traduzione [] non sono nel DB e non rientrano in questa revisione.

Le impostazioni di attivazione non risolvono i vincoli di licenza descritti nei file LICENZA.md delle fonti.

Per rigenerare l'elenco: `python gioco-quizzland/script/verifica_pubblico.py`. Il programma legge il DB senza modificarlo.

## Elenco sintetico

Il JSON conserva anche tutte le risposte e il dettaglio dei motivi.

| ID | Domanda | Motivi |
| --- | --- | --- |
| q004 | Quanto fa la metà di 2 + 2? | ambiguita |
| otdb-1058bcafc8 | Come si chiama in inglese il cucciolo di pipistrello? | lingua_inglese |
| otdb-10e0e7eed8 | In inglese, come si chiama un gruppo di avvoltoi? | lingua_inglese |
| otdb-53cd9ec151 | In inglese, come si chiama un gruppo di orsi? | lingua_inglese |
| otdb-b5169548d3 | In inglese un gruppo di corvi si chiama "homicide". | lingua_inglese |
| otdb-e539c10347 | In inglese, come si chiama un gruppo di ratti? | lingua_inglese |
| otdb-f5ce98f0ec | In inglese, come si chiama un gruppo di corvi? | lingua_inglese |
| otdb-080d887925 | Tupac Shakur morì nel 1996 per le complicazioni di un accoltellamento. | violenza_esplicita |
| otdb-31db227570 | In che anno O.J. Simpson fu assolto dalle accuse di omicidio? | violenza_tragedie |
| otdb-6a7d0bc9eb | Qual è stata la causa della morte di Marilyn Monroe? | violenza_tragedie, violenza_esplicita |
| otdb-6c2db371b9 | In quale situazione fu assassinato il musicista John Lennon? | violenza_tragedie |
| otdb-8235049105 | Nel 2014 un rapper emergente, noto per "Computers" e "Body Dance", fu arrestato dalla polizia di New York per omicidio. Chi era? | violenza_tragedie |
| otdb-c80e0c5319 | Da quale stato americano viene Billy Herrington? | sessuale_esplicito |
| otdb-0bba58bb84 | Nello Scrabble in inglese, quanti punti vale la tessera Z? | lingua_inglese |
| otdb-84b85435cf | Nello Scrabble in inglese, quanto fa la somma dei punti di tutte le tessere? | lingua_inglese |
| otdb-9eca553d3b | Nei giochi da tavolo, una regola aggiunta o modificata da un gruppo di giocatori si chiama in inglese regola… | lingua_inglese |
| otdb-013c3e0a41 | Quale di questi personaggi dei cartoni NON ha la voce originale di Rob Paulsen? | doppiaggio_non_italiano, doppiaggio_non_italiano |
| otdb-23a7869306 | Nella saga di "Shrek", Ciuchino ha la voce originale di Eddie Murphy. | doppiaggio_non_italiano |
| otdb-2c4e7d7fae | Chi doppia in originale il lemure Maurice nel film DreamWorks "Madagascar"? | doppiaggio_non_italiano |
| otdb-3b2998272b | Chi doppiava in originale il Genio in "Aladdin" della Disney? | doppiaggio_non_italiano |
| otdb-54ea472780 | Chi doppia in originale Hiccup nel film "Dragon Trainer"? | doppiaggio_non_italiano |
| otdb-6fd6e5fe74 | Chi dà la voce originale a Ruby nella serie animata RWBY? | doppiaggio_non_italiano |
| otdb-816bc820a8 | Chi dà la voce originale a Diamante Bianco in "Steven Universe"? | doppiaggio_non_italiano, doppiaggio_non_italiano |
| otdb-a7c26b42d0 | Nella serie originale delle Tartarughe Ninja del 1987, a quale tartaruga dava la voce Townsend Coleman? | doppiaggio_non_italiano |
| otdb-aa68fc4bca | Quale cantante diede la voce a Mother Brain di Metroid nella serie animata "Captain N: The Game Master"? | doppiaggio_non_italiano |
| otdb-e577cd0c63 | Chi dà la voce originale a Finn in Adventure Time? | doppiaggio_non_italiano, doppiaggio_non_italiano |
| otdb-ef313bf98e | Quale personaggio di "Toy Story" aveva la voce originale di Don Rickles? | doppiaggio_non_italiano, doppiaggio_non_italiano |
| otdb-f3b05255e6 | Nella serie della BBC "Postman Pat", qual è il cognome di uno degli insegnanti? | contesto_locale |
| otdb-16a279fa1e | Chi dà la voce originale a Metalbeard in "The LEGO Movie"? | doppiaggio_non_italiano, doppiaggio_non_italiano |
| otdb-23cc18d4ba | Chi dava la voce originale al drago Draco nel film del 1996 "Dragonheart"? | doppiaggio_non_italiano |
| otdb-4178f63640 | In "Super Mario Bros. - Il film" (2023), chi dà la voce originale a Toad? | doppiaggio_non_italiano |
| otdb-c55e946d5c | Nel film "Requiem for a Dream", da quale droga diventa dipendente il personaggio di Jared Leto? | droghe |
| otdb-d5b67cbbec | Chi dà la voce originale al protagonista Blu nel film d'animazione del 2011 "Rio"? | doppiaggio_non_italiano |
| otdb-da92c45f8a | Chi dà la voce originale a Po nei film di "Kung Fu Panda"? | doppiaggio_non_italiano |
| otdb-e95168f0e5 | Quale comico diede la voce originale al pappagallo Iago in "Aladdin" della Disney (1992)? | doppiaggio_non_italiano, doppiaggio_non_italiano |
| otdb-0663607ef4 | Chi dà la voce a Shou Suzuki nel doppiaggio inglese di "Mob Psycho 100"? | lingua_inglese, doppiaggio_non_italiano |
| otdb-0acc9d3e39 | Chi dà la voce a Reigen nel doppiaggio inglese di "Mob Psycho 100"? | lingua_inglese, doppiaggio_non_italiano |
| otdb-20bef42bf6 | Chi ha doppiato un personaggio nella versione inglese de "Il castello errante di Howl" (2004)? | doppiaggio_non_italiano |
| otdb-60ee2cb1cb | Chi dà la voce a One Punch Man nella versione giapponese? | doppiaggio_non_italiano |
| otdb-d3734d9320 | Qual è il titolo del doppiaggio inglese di "Smile Precure"? | doppiaggio_non_italiano |
| otdb-e3b5239da2 | Nell'anime "Buddyfight", in cosa differisce Dragowizard Qinus Axia tra la versione giapponese e quella inglese? | doppiaggio_non_italiano |
| otdb-e41b7e0093 | Nel doppiaggio inglese di ADV dell'anime "Ghost Stories", quale personaggio è una cristiana pentecostale? | doppiaggio_non_italiano |
| otdb-8b7119b047 | Long John Baldry, voce del dottor Robotnik in "Adventures of Sonic the Hedgehog", suonò negli anni '60 con quale artista? | doppiaggio_non_italiano |
| otdb-b294c75d38 | Quale di questi John fu ucciso a colpi di pistola davanti al Dakota di New York nel 1980? | violenza_tragedie |
| otdb-b82e4af6ac | Come si chiama in inglese britannico la semibiscroma (nota da 1/64)? | lingua_inglese |
| otdb-c6b429336d | Nell'agosto 1964, chi fece provare la cannabis ai Beatles? | droghe |
| otdb-e61f11e8ee | Quale di queste opere teatrali andò in scena per la prima volta dopo il suicidio dell'autrice? | violenza_tragedie |
| otdb-27a83b90ae | Nel cartone "SpongeBob", cosa significava l'acronimo inglese E.V.I.L.? | lingua_inglese, lingua_inglese |
| otdb-5cdd04ba57 | Quale ex attrice di "Coronation Street" fu valletta del quiz britannico "Double Your Money"? | contesto_locale |
| otdb-6067ff0f90 | Quante vittorie di fila fece Ken Jennings a Jeopardy!? | contesto_locale |
| otdb-670ea88c9f | In che anno la BBC lanciò ufficialmente il canale BBC One? | contesto_locale |
| otdb-75633eaf54 | A quale personaggio NON dà la voce la doppiatrice Tara Strong? | doppiaggio_non_italiano |
| otdb-8ece4a482b | Chi era il doppiatore originale di Shaggy Rogers in Scooby-Doo? | doppiaggio_non_italiano, doppiaggio_non_italiano |
| otdb-df3c16311a | Di quale personaggio era la voce originale Alan Reed? | doppiaggio_non_italiano, doppiaggio_non_italiano |
| otdb-15fe201e61 | Quale di questi attori non ha doppiato un personaggio in "Saints Row: The Third"? | sessuale_esplicito |
| otdb-2212be44d6 | In Team Fortress 2, Gary Schwartz, il doppiatore dell'Heavy, dà la voce anche al Demoman. | doppiaggio_non_italiano |
| otdb-4f074828cc | Quale attore americano dà la voce a Cave Johnson, capo della Aperture Science? | doppiaggio_non_italiano |
| otdb-570f33e2b3 | Ellen McLain, voce di GLaDOS in Portal, è sposata con il doppiatore di quale personaggio di Team Fortress 2? | doppiaggio_non_italiano |
| otdb-5f048d40ee | Nel gioco BattleBlock Theater, chi dava la voce al narratore? | doppiaggio_non_italiano |
| otdb-6b2e2a3789 | Chi dà la voce a Thrall nella serie Warcraft? | doppiaggio_non_italiano |
| otdb-7e77c7ef59 | A quale di questi personaggi NON ha dato la voce Jennifer Taylor? | doppiaggio_non_italiano |
| otdb-92d83dd176 | Chi dà la voce originale a Joel in "The Last of Us"? | doppiaggio_non_italiano, doppiaggio_non_italiano |
| otdb-9ccbb12161 | Chi è il doppiatore inglese di Sora nella serie Kingdom Hearts? | doppiaggio_non_italiano |
| otdb-9e33d9da9b | Il doppiatore di quale personaggio di Portal 2 non era attore di cinema o TV prima del gioco? | doppiaggio_non_italiano |
| otdb-bc5f576c11 | In Half-Life 2, se si ascoltano al contrario le voci degli zombi, dicono frasi sensate in inglese. | lingua_inglese |
| otdb-d3ee348f51 | Quale membro dei Monty Python dava la voce a Scuotivento nel gioco del 1995 Discworld? | doppiaggio_non_italiano |
| otdb-e48a2688fa | Chi dà la voce originale a GLaDOS nei giochi di Portal? | doppiaggio_non_italiano |
| otdb-eeebaecd72 | Quanti zombi bisogna uccidere per l'obiettivo "Zombie Genocider" in Dead Rising (2006)? | violenza_tragedie |
| otdb-f2ab279890 | Nella serie Kingdom Hearts, chi dà la voce inglese al Maestro Eraqus? | doppiaggio_non_italiano |
| otdb-0a22609db8 | Nel calendario gregoriano in inglese, quanti mesi iniziano con la lettera J? | lingua_inglese |
| otdb-0dbc6142ca | Qual è il sostantivo più usato nella lingua inglese? | lingua_inglese |
| otdb-0f33913b9c | Chi è raffigurato sulla banconota americana da cento dollari? | istituzioni_locali |
| otdb-1962603018 | Le parole inglesi "bungalow" e "shampoo" vengono dalle lingue di quale paese? | lingua_inglese |
| otdb-1e4c5894a4 | In inglese, un criminale che ha "cooked the books" ("cucinato i libri") che reato ha commesso? | lingua_inglese |
| otdb-22421d41d0 | Gli americani consumano in media 45 kg (100 libbre) al secondo di cosa? | unita_non_localizzate, droghe |
| otdb-288aafb273 | Negli Stati Uniti, in media, almeno una persona all'ora viene uccisa da un guidatore ubriaco. | violenza_tragedie |
| otdb-2ad26c2bca | Quanti nickel (monete americane da 5 centesimi) valgono cinque dollari? | istituzioni_locali |
| otdb-2f26538139 | In inglese, come si chiama il carattere "&"? | lingua_inglese |
| otdb-3291e904c1 | Quale presidente americano compare sulla banconota da un dollaro? | istituzioni_locali |
| otdb-4ad33577e4 | Quale carattere era considerato un tempo la 27ª lettera dell'alfabeto inglese? | lingua_inglese |
| otdb-4be1076ebc | Quale di queste parole inglesi significa "spettatore ozioso"? | lingua_inglese |
| otdb-50efd495b1 | In inglese, di un codardo si dice che ha la pancia di quale colore? | lingua_inglese |
| otdb-557a92f847 | Qual è il soprannome dello stato americano della California? | geografia_locale |
| otdb-6ac77bcfd4 | Prima dell'Ottocento, in inglese il "living room" si chiamava… | lingua_inglese |
| otdb-6cc41afdd9 | In che anno è stata coniata la parola inglese "scientist" (scienziato)? | lingua_inglese |
| otdb-785026ecd5 | Quale di queste parole inglesi indica qualcosa prodotto, distribuito o venduto illegalmente? | lingua_inglese |
| otdb-7d39618a50 | Se qualcuno ti dicesse in inglese "you are olid", cosa intenderebbe? | lingua_inglese |
| otdb-92aaa61a01 | In media una donna è 13 centimetri più bassa di un uomo. | stereotipo |
| otdb-934a07ae85 | Nel 2010 Twitter e la Biblioteca del Congresso americana si accordarono per archiviare tutti i tweet dei cittadini americani. | istituzioni_locali |
| otdb-9d9f8326e8 | In inglese, se ti beccano a fare "goldbricking", cosa stai facendo di sbagliato? | lingua_inglese |
| otdb-9f43d21271 | Quale di questi sovrani britannici non è mai comparso su una moneta in sterline in circolazione? | istituzioni_locali |
| otdb-a1c796e21d | In inglese, di che colore si dice che è una persona inesperta? | lingua_inglese |
| otdb-b726f21a6d | In "Shrek", quale attore comico dà la voce originale a Ciuchino? | doppiaggio_non_italiano |
| otdb-c3ac099365 | Quante lettere ha l'alfabeto inglese? | lingua_inglese |
| otdb-e3dafe0ae3 | Quante lettere ci sono nell'alfabeto inglese? | lingua_inglese |
| otdb-eb6051153e | Come continua il detto inglese poco noto "Curiosity killed the cat" ("la curiosità uccise il gatto")? | lingua_inglese, lingua_inglese |
| otdb-f0ce61678c | Secondo la filastrocca inglese, quale frutto tirò fuori Little Jack Horner dalla sua torta di Natale? | lingua_inglese |
| otdb-f811693ff5 | La sigla del canale commerciale britannico ITV significa "International Television". | contesto_locale |
| otdb-0b159e9556 | In inglese, quale di questi paesi NON è l'unico il cui nome inizia con quella lettera? | lingua_inglese |
| otdb-0ef489e85b | Qual è la capitale dello stato americano del Texas? | geografia_locale |
| otdb-0f4d16fcc6 | A quali paesi europei e alla loro situazione economica si riferisce la sigla dispregiativa "PIIGS"? | offensivo |
| otdb-129a1a9faa | Qual è la capitale dello stato americano del Texas? | geografia_locale |
| otdb-211b6f8a3c | Qual è la capitale dello stato americano del Nevada? | geografia_locale |
| otdb-4748cf9d3b | Qual è la capitale dello stato di New York? | geografia_locale |
| otdb-519ee6f6c7 | Qual è l'unico stato americano la cui bandiera non ha una forma a quattro lati? | geografia_locale |
| otdb-574cc369cf | In Inghilterra il calcio si chiama "football": come si chiama lì il football americano? | lingua_inglese |
| otdb-647c3a3c5f | New Haven è la capitale dello stato americano del Connecticut. | geografia_locale |
| otdb-7a460cc154 | St. Louis è la capitale dello stato americano del Missouri. | geografia_locale |
| otdb-9a434d9626 | Quale stato americano è soprannominato "The Golden State"? | geografia_locale |
| otdb-9f1bd52660 | Qual è la capitale dello stato americano dell'Arizona? | geografia_locale |
| otdb-a2f72825df | La capitale dello stato americano dell'Ohio è Chillicothe. | geografia_locale |
| otdb-a3628cf938 | Qual è il soprannome dello stato americano del Delaware? | geografia_locale |
| otdb-a64abeb66e | Dove si trova la scalinata che in inglese chiamano "Spanish Steps"? | lingua_inglese |
| otdb-b4f8878a03 | Qual è la capitale dello stato di Washington, negli Stati Uniti? | geografia_locale |
| otdb-b957e0e517 | Qual è la capitale dello stato americano del Dakota del Sud? | geografia_locale |
| otdb-ebe3e50ff4 | In quale stato americano si trova Frankenmuth, la città soprannominata "Piccola Baviera"? | geografia_locale |
| otdb-fcc0f7b863 | Quale anno compare sulla bandiera dello stato americano del Wisconsin? | geografia_locale |
| otdb-050286b108 | Secondo la nota filastrocca inglese, in che ordine finirono le sei mogli di Enrico VIII? | lingua_inglese |
| otdb-3232686e14 | In che anno avvennero il terremoto e lo tsunami di Santo Stefano nell'Oceano Indiano? | contesto_locale |
| otdb-69f4475ee7 | Quale di questi cecchini ha il maggior numero di uccisioni confermate? | violenza_tragedie |
| otdb-80b7aebb45 | Il presidente Ronald Reagan fu il primo a nominare una donna alla Corte Suprema degli Stati Uniti. | istituzioni_locali |
| otdb-97f3d69b6f | Chi morì nel disastro aereo di Smolensk, in Russia, nel 2010? | violenza_tragedie, offensivo |
| otdb-f7875f9c71 | Come fu giustiziato Socrate? | violenza_tragedie |
| otdb-0ca241485d | George W. Bush perse il voto popolare alle elezioni presidenziali americane del 2004. | istituzioni_locali |
| otdb-0e626beb9c | Donald Trump vinse il voto popolare alle elezioni presidenziali americane del 2016. | istituzioni_locali |
| otdb-1275fe537e | Secondo la Costituzione degli Stati Uniti, quanti anni bisogna avere per essere eletti presidente? | istituzioni_locali |
| otdb-1787b2c0ce | Quale di questi era un candidato ufficiale alle elezioni politiche britanniche del 2017? | istituzioni_locali |
| otdb-18762294fc | Qual era il soprannome di Huey Long, 40º governatore della Louisiana? | geografia_locale, istituzioni_locali |
| otdb-28a8970dab | Quale di questi senatori americani è famoso per un ostruzionismo (filibuster) durato 24 ore? | istituzioni_locali |
| otdb-42b6251bab | Chi è stato il senatore più longevo nella storia degli Stati Uniti, in carica dal 1959 al 2010? | istituzioni_locali |
| otdb-48b40c2b4c | Qual è lo scopo principale del Quarto emendamento della Costituzione americana? | istituzioni_locali |
| otdb-5b545ffd79 | Le elezioni presidenziali americane del 2016 furono la prima volta in cui Hillary Clinton si candidò alla presidenza. | istituzioni_locali |
| otdb-5cd04c1fc4 | Alle presidenziali americane del 2016 lo stato con più grandi elettori era la California, con 55. | istituzioni_locali |
| otdb-b0b6afbb82 | Come si intitola l'opera di Niccolò Machiavelli secondo cui un capo efficace deve schiacciare gli avversari a ogni costo? | sessuale_esplicito |
| otdb-cb8b4c15ac | Chi fu eletto leader del Partito laburista britannico nel settembre 2015? | contesto_locale |
| otdb-226e97020c | A quanti gradi Fahrenheit corrispondono 100 gradi Celsius? | unita_non_localizzate |
| otdb-55891f6fb8 | Come si chiamano in inglese tutti i cuccioli di marsupiale? | lingua_inglese |
| otdb-b09cb488e2 | A quale temperatura i gradi Celsius e Fahrenheit coincidono? | unita_non_localizzate |
| otdb-3bfce3c672 | Quale parola inglese di cinque lettere è il motto di IBM? | lingua_inglese |
| otdb-c9cb9bad06 | A quale temperatura i gradi Celsius e i gradi Fahrenheit hanno lo stesso valore? | unita_non_localizzate |
| otdb-0ed0954dd7 | Quale commentatore sportivo canadese è famoso per il suo ruolo in "Hockey Night in Canada", il programma che accompagna le partite di hockey? | contesto_locale |
| otdb-15f9621845 | Chi vinse il Super Bowl LI (51) della NFL? | contesto_locale |
| otdb-20c33e2d1a | Chi superò Drew Brees nel 2018 per yard su passaggio in carriera nella NFL? | contesto_locale |
| otdb-258c29df1b | Nel rugby league, fare un "40-20" viene punito con un calcio libero per la squadra avversaria. | contesto_locale |
| otdb-2b256496ad | Peyton Manning si ritirò dopo aver vinto il Super Bowl XLIX. | contesto_locale |
| otdb-2b5f1aa6a8 | Quale squadra ha vinto più Stanley Cup nella NHL? | contesto_locale |
| otdb-3bfb430f39 | Quale afroamericano contribuì ad abbattere la segregazione razziale nella Major League di baseball? | contesto_locale |
| otdb-622e485ea7 | In che anno si giocò il terzo Super Bowl? | contesto_locale |
| otdb-6749937ab8 | In che anno nacque la leggenda dell'hockey Wayne Gretzky? | contesto_locale |
| otdb-6a4d965e4d | Chi fu il primo calciatore a segnare 200 gol in Premier League? | lingua_inglese |
| otdb-6bbb276589 | Quale di questi giocatori NHL non ha mai vinto l'Hart Trophy come miglior giocatore della stagione regolare? | contesto_locale |
| otdb-6dc2b00078 | Quali due squadre giocarono il Super Bowl XLII? | contesto_locale |
| otdb-6e32e0518e | Quale di queste squadre NHL non ha mai cambiato città dalla sua fondazione? | contesto_locale |
| otdb-862c798059 | Quale di queste squadre NHL giocava in origine ad Atlanta? | contesto_locale |
| otdb-9e5488bc46 | Chi vinse la Stanley Cup nel 2011? | contesto_locale |
| otdb-a5b1d98841 | In quale provincia canadese è nato il giocatore di hockey Wayne Gretzky? | contesto_locale |
| otdb-a76f2e9bcd | Qual è la squadra più antica della NFL? | contesto_locale |
| otdb-aef583eff6 | Quale di queste squadre NON faceva parte delle "Original Six" della NHL? | contesto_locale |
| otdb-b33f22361a | In che anno i New Orleans Saints vinsero il Super Bowl? | contesto_locale |
| otdb-df01fabddc | Da quale città venivano i Nordiques, ex squadra della NHL? | contesto_locale |
| otdb-e0009fbd5d | Quale giocatore detiene il record NHL di 2.857 punti? | contesto_locale |
| otdb-e457375942 | Qual è la squadra più antica della Major League Baseball? | contesto_locale, contesto_locale |
| otdb-e6dc40eab0 | Quale squadra NFL rappresenta il New England? | contesto_locale |
| otdb-f7c62421aa | Qual è il soprannome della squadra di rugby a 15 di Northampton? | contesto_locale |
| otdb-fcc35ab47e | Qual era la media battuta di Sir Donald Bradman nei test match di cricket? | contesto_locale |
| otdb-288fa3fcd2 | Quanti pollici cubi di cilindrata ha il motore LS3? | unita_non_localizzate |
| otdb-40ae1dd205 | Quanti pollici cubi di cilindrata ha il motore LS2? | unita_non_localizzate |
| otdb-855389a59b | Quanti pollici cubi di cilindrata ha il motore LS7? | unita_non_localizzate |
| otdb-a90cd98248 | Quanti pollici cubi di cilindrata ha il motore LS1? | unita_non_localizzate |
| otdb-f610993f5b | Il nome completo in inglese della casa automobilistica BMW è Bavarian Motor Works. | lingua_inglese |
| tta-622a1c367cc59eab6f9501ae | Quale opera inizia con la frase "Mr. Jones, of the Manor Farm, had locked the hen-houses for the night..."? | lingua_inglese |
| tta-622a1c3a7cc59eab6f95136b | Con quale titolo fu pubblicato per la prima volta in inglese il "Diario di Anne Frank"? | lingua_inglese |
| tta-6495b50be831b1ab5aa11113 | Quale famoso artista passò inosservato in vita e si tolse la vita a 37 anni nel 1890? | violenza_tragedie |
| tta-622a1c357cc59eab6f94feae | Chi ha interpretato (doppiato in originale) il ruolo di Nala nel remake del 2019 de "Il re leone"? | doppiaggio_non_italiano |
| tta-622a1c367cc59eab6f95039c | Quale serie di film ha per protagonista un assassino seriale di nome Michael Myers? | violenza_tragedie |
| tta-622a1c367cc59eab6f9503b3 | Quale famigerato assassino, impiccato nel luglio 1953, ha la sua storia raccontata nel film "L'assassino di Rillington Place"? | violenza_tragedie |
| tta-62573f4f9da29df7b05f7394 | Qual è la trama del film "Il miglio verde"? | sessuale_esplicito, violenza_esplicita |
| tta-625740139da29df7b05f73c2 | Quale film corrisponde a questa trama? "Un avvocato dell'Alabama durante la Grande Depressione difende un uomo di colore da un'ingiusta accusa di stupro." | sessuale_esplicito, violenza_tragedie |
| tta-6257403c9da29df7b05f73ce | Quale film corrisponde a questa trama? "Quando un serial killer uccide importanti figure politiche, un vigilante è costretto a intervenire." | violenza_tragedie |
| tta-625740789da29df7b05f73e0 | Qual è la trama del film "Toro scatenato"? | sessuale_esplicito |
| tta-625741003d2f5c16bfb8833c | Qual è la trama del film "Ricomincio da capo"? | contesto_locale |
| tta-63d9530f168979b94b2e4f8c | Come si chiamava l'iconico film degli anni Novanta in cui Julia Roberts interpreta una prostituta ingaggiata da un ricco imprenditore? | sessuale_esplicito |
| tta-647edb90520523194910c357 | In quale film, basato su un racconto di Washington Irving, il protagonista è un poliziotto mandato a indagare su una serie di decapitazioni? | violenza_tragedie |
| tta-622a1c3b7cc59eab6f9515a5 | Quanti galloni ci sono in un firkin? | unita_non_localizzate |
| tta-622a1c3b7cc59eab6f9515af | Cosa significa "puttanesca" nella pasta alla puttanesca? | sessuale_esplicito |
| tta-645cb1257d263fd5097043aa | Nelle misure di volume, quante once fluide ci sono in una tazza (cup)? | unita_non_localizzate |
| tta-622a1c357cc59eab6f94fd80 | Chi fu il responsabile dell'assassinio di John Lennon? | violenza_tragedie |
| tta-622a1c367cc59eab6f950096 | Qual è il valore della lettera Q nello Scrabble (in inglese)? | lingua_inglese |
| tta-622a1c367cc59eab6f950219 | Quale meteorologo della BBC smentì famosamente nel 1987 le notizie di un possibile uragano? | contesto_locale |
| tta-622a1c367cc59eab6f950323 | Chi fu l'uomo condannato come mente degli omicidi LaBianca-Tate del 1969? | violenza_tragedie |
| tta-622a1c3a7cc59eab6f951002 | Quale antica unità di misura imperiale equivale a 54 galloni? | unita_non_localizzate |
| tta-645c9f6b42ea81e2554c5f2a | Qual è l'unico stato americano la cui canzone ufficiale fu scritta per un musical di Broadway? | geografia_locale |
| tta-622a1c357cc59eab6f94fdf5 | Quale stato americano è spesso soprannominato "Evergreen State" (stato sempreverde)? | geografia_locale |
| tta-623384aa62eaad73716a8c22 | Qual è la capitale dello stato della Louisiana? | geografia_locale |
| tta-6233855b62eaad73716a8c66 | Quale stato americano è soprannominato "Golden State" (stato dorato)? | geografia_locale |
| tta-623389220161109f922aaccc | Quale stato americano è soprannominato "Garden State" (stato giardino)? | geografia_locale |
| tta-623389270161109f922aacce | Quale stato americano è soprannominato "Wolverine State" (stato del ghiottone)? | geografia_locale |
| tta-623389510161109f922aacdf | Quale capitale di stato americano è nota come "mile high city" (la città a un miglio di altezza)? | geografia_locale |
| tta-6463394601d576cfac3aa32a | Qual è la capitale della provincia canadese del Manitoba? | geografia_locale |
| tta-6477bb70550bc819ad646b84 | Qual è la capitale dello stato del Michigan? | geografia_locale |
| tta-64dd398a9cef2bd3a34add05 | Quale stato americano è noto con i soprannomi "Sagebrush State" (stato dell'artemisia) e "Silver State" (stato dell'argento)? | geografia_locale |
| tta-622a1c367cc59eab6f950315 | Chi fu il più giovane primo ministro britannico? | istituzioni_locali |
| tta-622a1c367cc59eab6f950328 | Chi fu l'ultimo monarca britannico nato all'estero? | istituzioni_locali |
| tta-622a1c367cc59eab6f95033a | Chi fu il primo monarca britannico a trasmettere un messaggio di Natale alla nazione? | istituzioni_locali |
| tta-622a1c367cc59eab6f95033f | Chi fu primo ministro britannico tra il 1964 e il 1969? | istituzioni_locali |
| tta-622a1c367cc59eab6f95035f | Chi fu ucciso a colpi di arma da fuoco a Dallas il 24 novembre 1963? | violenza_tragedie |
| tta-622a1c367cc59eab6f950388 | Chi guidò 900 seguaci in un suicidio di massa nel 1979? | violenza_tragedie |
| tta-622a1c367cc59eab6f950397 | Quale stato americano fu l'ultimo, nel 1907, a dichiarare il Natale festa legale? | geografia_locale, contesto_locale |
| tta-622a1c367cc59eab6f9503fb | In quale città ebbe luogo il massacro di San Valentino? | violenza_tragedie |
| tta-622a1c3b7cc59eab6f95173a | Quale stato divenne il 47° stato americano nel 1912? | contesto_locale |
| tta-622a1c3b7cc59eab6f951778 | Quale filastrocca fu la prima registrazione su grammofono? | lingua_inglese |
| tta-622a1c3c7cc59eab6f9517aa | Quale strumento di tortura aveva un involucro con cerniere pieno di punte? | violenza_esplicita |
| tta-622a1c3c7cc59eab6f9517b2 | Quale ex primo ministro britannico tornò al potere nel 1951? | istituzioni_locali |
| tta-622a1c3c7cc59eab6f9519ef | Quale emendamento della Costituzione degli Stati Uniti pose fine al Proibizionismo? | istituzioni_locali |
| tta-622a1c3c7cc59eab6f951a16 | Quale romano si tolse la vita dopo la sconfitta di Azio? | violenza_tragedie |
| tta-622a1c3c7cc59eab6f951a1a | Quale regina di Francia fu decapitata nel 1793? | violenza_tragedie |
| tta-622a1c3c7cc59eab6f951afe | In quale città del Massachusetts furono giustiziate 20 persone per stregoneria nel 1692? | violenza_tragedie |
| tta-622a1c3d7cc59eab6f951bb3 | Nel 1817 quale stato americano fu ammesso nell'Unione come 20° stato? | contesto_locale |
| tta-63a039c3c7d86251f9b65caf | Quale re inglese fu giustiziato nel 1649? | violenza_tragedie |
| tta-63a039cfc7d86251f9b65cba | Quale monarca britannico regnò durante la guerra d'indipendenza americana (1775-1783)? | istituzioni_locali |
| tta-645c9fc342ea81e2554c5f75 | In quale anno elettorale degli Stati Uniti i sostenitori del candidato democratico parafrasarono la canzone popolare "Hello, Dolly" in "Hello, Lyndon"? | istituzioni_locali |
| tta-64746b3e5a4c31088dd9d03e | Quale stato americano fu il penultimo ad entrare nell'Unione? | contesto_locale |
| tta-65056f4f7a97013de78b541b | A quale partito politico apparteneva il primo ministro britannico Tony Blair? | istituzioni_locali |
| tta-65056f6a7a97013de78b5441 | Quale moglie di Enrico VIII fu decapitata a meno di due anni dalle nozze? | violenza_tragedie |
| tta-6aa0f7b67bba16e6425b1e60 | In quale battaglia del 1513 fu ucciso Giacomo IV di Scozia, l'ultimo monarca britannico a morire in battaglia? | istituzioni_locali |
| tta-6ae97a95bb6335621cbf787a | Quale miliardario texano si candidò come indipendente alle elezioni presidenziali americane del 1992? | istituzioni_locali |
| tta-622a1c347cc59eab6f94fb82 | Quale canzone inizia con il verso (in inglese): «And Today is gonna be the day that they're gonna throw it back to you.»? | lingua_inglese |
| tta-622a1c347cc59eab6f94fb85 | Quale canzone inizia con il verso (in inglese): «I don't want a lot for Christmas, there is just one thing I need.»? | lingua_inglese |
| tta-622a1c347cc59eab6f94fb87 | Quale canzone inizia con il verso (in inglese): «Let's go girls!»? | lingua_inglese |
| tta-622a1c347cc59eab6f94fb88 | Quale canzone inizia con il verso (in inglese): «What you want, baby, I got it!»? | lingua_inglese |
| tta-622a1c347cc59eab6f94fb8c | Quale canzone inizia con il verso (in inglese): «Go shawty, it's your birthday, we gon' party like it's yo birthday.»? | lingua_inglese |
| tta-622a1c347cc59eab6f94fb90 | Quale canzone inizia con il verso (in inglese): «Dearly beloved, we have gathered here today to get through this thing called life.»? | lingua_inglese |
| tta-622a1c347cc59eab6f94fb91 | Quale canzone inizia con il verso (in inglese): «Is this the real life? Is this just fantasy?»? | lingua_inglese |
| tta-622a1c347cc59eab6f94fb93 | Quale canzone inizia con il verso (in inglese): «Do you remember, the 21st night of September?»? | lingua_inglese |
| tta-622a1c347cc59eab6f94fb94 | Quale canzone inizia con il verso (in inglese): «My baby don't mess around because she loves me so, and this I know for sure.»? | lingua_inglese |
| tta-622a1c347cc59eab6f94fb97 | Quale canzone inizia con il verso (in inglese): «Just a small town girl, living in a lonely world.»? | lingua_inglese |
| tta-622a1c347cc59eab6f94fb99 | Quale canzone inizia con il verso (in inglese): «When I find myself in times of trouble, Mother Mary comes to me / Speaking words of wisdom, let it be...»? | lingua_inglese |
| tta-622a1c347cc59eab6f94fb9a | Quale canzone inizia con il verso (in inglese): «Do you have the time to listen to me whine...»? | lingua_inglese |
| tta-622a1c347cc59eab6f94fb9c | Quale canzone inizia con il verso (in inglese): «There is a house in New Orleans...»? | lingua_inglese |
| tta-622a1c347cc59eab6f94fb9d | Quale sigla di un cartone animato inizia con il verso (in inglese): «ARE YE READY, KIDS?»? | lingua_inglese |
| tta-622a1c347cc59eab6f94fb9e | Quale canzone inizia con il verso (in inglese): «I said a hip-hop, the hippie the hippie / To the hip, hip hop you don't stop / Rock it to the bang bang boogie / Say up jump the boogie to the rhythm of the boogie, the beat...»? | lingua_inglese |
| tta-622a1c347cc59eab6f94fba0 | Quale canzone inizia con il verso (in inglese): «Tonight, I’m gonna have myself a real good time / I feel alive / And the world, I'll turn it inside out, yeah / I'm floating around in ecstasy...»? | lingua_inglese |
| tta-622a1c347cc59eab6f94fba1 | Quale canzone inizia con il verso (in inglese): «Nants ingonyama bagithi Baba / Sithi uhm ingonyama...»? | lingua_inglese |
| tta-622a1c347cc59eab6f94fba4 | Quale canzone inizia con il verso (in inglese): «ALL ABOARD! (maniacal laughter)»? | lingua_inglese |
| tta-622a1c347cc59eab6f94fba7 | Quale canzone inizia con il verso (in inglese): «At first I was afraid, I was petrified / Kept thinking I could never live without you by my side...»? | lingua_inglese |
| tta-622a1c347cc59eab6f94fba8 | Quale canzone inizia con il verso (in inglese): «Please allow me to introduce myself / I'm a man of wealth and taste / I've been around for a long, long year / Stole many a man's soul and faith...»? | lingua_inglese |
| tta-622a1c347cc59eab6f94fba9 | Quale canzone inizia con il verso (in inglese): «Oh, my, God, Becky / Look at her butt...»? | lingua_inglese |
| tta-622a1c347cc59eab6f94fbaa | Quale canzone Disney inizia con il verso (in inglese): «Let's get down to business...»? | lingua_inglese |
| tta-622a1c347cc59eab6f94fbab | Quale canzone inizia con il verso (in inglese): «Look / If you had / One shot / Or one opportunity / To seize everything you ever wanted / In one moment / Would you capture it / Or just let it slip?»? | lingua_inglese |
| tta-622a1c347cc59eab6f94fbae | Quale canzone inizia con il verso (in inglese): «A long, long time ago / I can still remember how / That music used to make me smile...»? | lingua_inglese |
| tta-622a1c347cc59eab6f94fbaf | Quale canzone inizia con il verso (in inglese): «Coming out of my cage / And I've been doing just fine...»? | lingua_inglese |
| tta-622a1c347cc59eab6f94fbb0 | Quale canzone inizia con il verso (in inglese): «Hello darkness, my old friend...»? | lingua_inglese |
| tta-622a1c347cc59eab6f94fbb1 | Quale canzone inizia con il verso (in inglese): «Now this is the story all about how / My life got flipped, turned upside down...»? | lingua_inglese |
| tta-622a1c347cc59eab6f94fbb2 | Quale canzone inizia con il verso (in inglese): «Hello? Is there anybody in there?»? | lingua_inglese |
| tta-622a1c347cc59eab6f94fbb3 | Quale canzone inizia con il verso (in inglese): «I wanna be the very best...»? | lingua_inglese |
| tta-622a1c347cc59eab6f94fbb4 | Quale canzone inizia con il verso (in inglese): «We come from the land of the ice and snow / From the midnight sun, where the hot springs flow...»? | lingua_inglese |
| tta-622a1c347cc59eab6f94fbb7 | Quale canzone inizia con il verso (in inglese): «Somebody once told me / The world is gonna roll me...»? | lingua_inglese |
| tta-622a1c347cc59eab6f94fbbc | Quale canzone inizia con il verso (in inglese): «As I walk through the valley of the shadow of death / I take a look at my life and realize there's not much left...»? | lingua_inglese |
| tta-622a1c347cc59eab6f94fbc0 | Quale canzone inizia con il verso (in inglese): «I read the news today, oh boy...»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd45 | Con chi stava duettando Janet Jackson quando ebbe il famoso "incidente" al Super Bowl del 2004? | contesto_locale |
| tta-622a1c397cc59eab6f950ce3 | Quale artista ha pubblicato la canzone «Flash', the theme tune to the film 'Flash Gordon»? | traduzione |
| tta-6463394601d576cfac3aa32b | Quale canzone di Elvis contiene il verso "Everybody in the whole cell block was dancin' to the..."? | lingua_inglese |
| tta-6ae2e3033f3b0b676f6e9c9f | L'interpretazione dell'inno nazionale di quale cantante al Super Bowl XXV nel 1991 divenne un singolo di successo? | contesto_locale |
| tta-622a1c3a7cc59eab6f95103f | Qual è il punto di ebollizione dell'acqua in gradi Fahrenheit? | unita_non_localizzate |
| tta-622a1c3f7cc59eab6f95235d | In quale punto le scale di temperatura Fahrenheit e Celsius coincidono? | unita_non_localizzate |
| tta-645cb16b7d263fd5097043c9 | Che tipo di uccello è la nene, uccello ufficiale delle Hawaii? | geografia_locale, contesto_locale |
| tta-64e6fd5e0b79e5bedd55c898 | La capitale dell'Idaho, Boise, ricava la sua energia dal calore all'interno della terra, ed è all'avanguardia in quale tipo di energia rinnovabile? | geografia_locale |
| tta-622a1c357cc59eab6f94fcf1 | A quale famiglia linguistica appartiene la lingua inglese? | lingua_inglese |
| tta-622a1c357cc59eab6f94fcf3 | Quale filosofo disse la celebre frase (in inglese): «Man is the measure of all things»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fcf5 | Quale filosofo disse la celebre frase (in inglese): «We are too weak to discover the truth by reason alone»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fcf6 | Quale filosofo disse la celebre frase (in inglese): «Everything that exists is born for no reason, carries on living through weakness, and dies by accident»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fcf7 | Quale filosofo disse la celebre frase (in inglese): «To do as one would be done by, and to love one's neighbor as oneself, constitute the ideal perfection of utilitarian morality»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fcf9 | Quale filosofo disse la celebre frase (in inglese): «Good and evil, reward and punishment, are the only motives to a rational creature»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fcfb | Quale filosofo disse la celebre frase (in inglese): «The brave man is he who overcomes not only his enemies but his pleasures»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fcfd | Quale filosofo disse la celebre frase (in inglese): «A little philosophy inclineth man's mind to atheism; but depth in philosophy bringeth men’s minds about to religion»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fcfe | Quale filosofo disse la celebre frase (in inglese): «Freedom is secured not by the fulfilling of one's desires, but by the removal of desire»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fcff | Quale filosofo disse la celebre frase (in inglese): «In everything, there is a share of everything»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd00 | Quale filosofo disse la celebre frase (in inglese): «Virtue is nothing else than right reason»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd01 | Quale filosofo disse la celebre frase (in inglese): «It is wrong always, everywhere and for everyone, to believe anything upon insufficient evidence»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd02 | Quale filosofo disse la celebre frase (in inglese): «I can control my passions and emotions if I can understand their nature»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd03 | Quale filosofo disse la celebre frase (in inglese): «Philosophers have hitherto only interpreted the world in various ways; the point, however, is to change it»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd04 | Quale filosofo disse la celebre frase (in inglese): «Happiness lies in virtuous activity, and perfect happiness lies in the best activity, which is contemplative»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd05 | Quale filosofo disse la celebre frase (in inglese): «Man will never be free until the last king is strangled with the entrails of the last priest»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd06 | Quale filosofo disse la celebre frase (in inglese): «Man is born free, but is everywhere in chains»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd07 | Quale filosofo disse la celebre frase (in inglese): «If you would be a real seeker after truth, it is necessary that at least once in your life you doubt, as far as possible, all things»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd08 | Quale filosofo disse la celebre frase (in inglese): «The function of prayer is not to influence God, but rather to change the nature of the one who prays»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd09 | Quale filosofo disse la celebre frase (in inglese): «The only thing I know is that I know nothing»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd0a | Quale filosofo disse la celebre frase (in inglese): «All is for the best in the best of all possible worlds»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd0b | Quale filosofo disse la celebre frase (in inglese): «That man is wisest who, like Socrates, realizes that his wisdom is worthless»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd0c | Quale filosofo disse la celebre frase (in inglese): «I don’t know why we are here, but I’m pretty sure it is not in order to enjoy ourselves»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd0d | Quale filosofo disse la celebre frase (in inglese): «It is one thing to show a man that he is in error, and another to put him in possession of truth»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd0f | Quale filosofo disse la celebre frase (in inglese): «Morality is not the doctrine of how we may make ourselves happy, but of how we may make ourselves worthy of happiness»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd10 | Quale filosofo disse la celebre frase (in inglese): «Man is condemned to be free»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd11 | Quale filosofo disse la celebre frase (in inglese): «The greater the difficulty, the more glory in surmounting it»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd13 | Quale filosofo disse la celebre frase (in inglese): «Happiness is the highest good»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd14 | Quale filosofo disse la celebre frase (in inglese): «Religion is the sign of the oppressed ... it is the opium of the people»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd15 | Quale filosofo disse la celebre frase (in inglese): «Is man merely a mistake of God's? Or God merely a mistake of man's?»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd16 | Quale filosofo disse la celebre frase (in inglese): «I would never die for my beliefs because I might be wrong»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd17 | Quale filosofo disse la celebre frase (in inglese): «Metaphysics is a dark ocean without shores or lighthouse, strewn with many a philosophic wreck»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd18 | Quale filosofo disse la celebre frase (in inglese): «You can discover more about a person in an hour of play than in a year of conversation»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd19 | Quale filosofo disse la celebre frase (in inglese): «He who is unable to live in society, or who has no need because he is sufficient for himself, must be either a beast or a god»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd1a | Quale filosofo disse la celebre frase (in inglese): «Things alter for the worse spontaneously, if they be not altered for the better designedly»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd1b | Quale filosofo disse la celebre frase (in inglese): «Science is what you know. Philosophy is what you don't know»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd1c | Quale filosofo disse la celebre frase (in inglese): «Life must be understood backward. But it must be lived forward »? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd1d | Quale filosofo disse la celebre frase (in inglese): «The mind is furnished with ideas by experience alone»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd1e | Quale filosofo disse la celebre frase (in inglese): «Only one man ever understood me, and he didn’t understand me»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd1f | Quale filosofo disse la celebre frase (in inglese): «Philosophy is at once the most sublime and the most trivial of human pursuits»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd20 | Quale filosofo disse la celebre frase (in inglese): «There is only one thing a philosopher can be relied upon to do, and that is to contradict other philosophers»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd21 | Quale filosofo disse la celebre frase (in inglese): «We are what we repeatedly do. Excellence, then, is not an act, but a habit»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd22 | Quale filosofo disse la celebre frase (in inglese): «Philosophy is a battle against the bewitchment of our intelligence by means of language»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd23 | Quale filosofo disse la celebre frase (in inglese): «Leisure is the mother of philosophy»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd24 | Quale filosofo disse la celebre frase (in inglese): «One cannot conceive anything so strange and so implausible that it has not already been said by one philosopher or another»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd25 | Quale filosofo disse la celebre frase (in inglese): «If God did not exist, it would be necessary to invent Him»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd26 | Quale filosofo disse la celebre frase (in inglese): «There is only one good, knowledge, and one evil, ignorance»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd27 | Quale filosofo disse la celebre frase (in inglese): «This is patently absurd; but whoever wishes to become a philosopher must learn not to be frightened by absurdities»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd28 | Quale filosofo disse la celebre frase (in inglese): «History is Philosophy teaching by examples»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd29 | Quale filosofo disse la celebre frase (in inglese): «Even while they teach, men learn»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd2a | Quale filosofo disse la celebre frase (in inglese): «One cannot step twice in the same river»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd2c | Quale filosofo disse la celebre frase (in inglese): «It is undesirable to believe a proposition when there is no ground whatever for supposing it true»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd2d | Quale filosofo disse la celebre frase (in inglese): «There is but one truly serious philosophical problem, and that is suicide»? | lingua_inglese, violenza_tragedie |
| tta-622a1c357cc59eab6f94fd2e | Quale filosofo disse la celebre frase (in inglese): «No man's knowledge here can go beyond his experience»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd2f | Quale filosofo disse la celebre frase (in inglese): «Happiness is not an ideal of reason but of imagination»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd30 | Quale filosofo disse la celebre frase (in inglese): «God is dead! He remains dead! And we have killed him.»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd31 | Quale filosofo disse la celebre frase (in inglese): «Liberty consists in doing what one desires»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd32 | Quale filosofo disse la celebre frase (in inglese): «We live in the best of all possible worlds»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd33 | Quale filosofo disse la celebre frase (in inglese): «What is rational is actual and what is actual is rational»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd34 | Quale filosofo disse la celebre frase (in inglese): «He who thinks great thoughts, often makes great errors»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd36 | Quale filosofo disse la celebre frase (in inglese): «The greatest happiness of the greatest number is the foundation of morals and legislation»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd37 | Quale filosofo disse la celebre frase (in inglese): «The life of man (in a state of nature) is solitary, poor, nasty, brutish, and short»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd38 | Quale filosofo disse la celebre frase (in inglese): «Entities should not be multiplied unnecessarily»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd39 | Quale filosofo disse la celebre frase (in inglese): «God is not willing to do everything, and thus take away our free will and that share of glory which belongs to us»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd3a | Quale filosofo disse la celebre frase (in inglese): «Whereof one cannot speak, thereof one must be silent»? | lingua_inglese |
| tta-622a1c357cc59eab6f94fd3b | Quale filosofo disse la celebre frase (in inglese): «The unexamined life is not worth living»? | lingua_inglese |
| tta-63e13a28106de6ffa7d4a7a5 | In quale stato americano il serial killer "Night Stalker" compì la sua serie di crimini? | violenza_tragedie |
| tta-63e13a2a106de6ffa7d4a7a8 | Nel 2002, quale città americana fu teatro di una serie di omicidi coordinati da cecchini? | violenza_tragedie |
| tta-63e13a2f106de6ffa7d4a7ae | In quale città americana avvennero gli "omicidi Zebra" del 1973-74? | violenza_tragedie |
| tta-645fcc80541c4d4fc8cf307d | Quale parola, dalla mitologia greca, indica il vuoto da cui emersero Nyx ed Erebo e in inglese si usa per descrivere un disordine? | lingua_inglese |
| tta-646339ce01d576cfac3aa3ba | Come si chiama in inglese un canto o inno natalizio? | lingua_inglese |
| tta-64746b075a4c31088dd9d017 | Che cosa significa l'acronimo "OTOH" nel linguaggio dei messaggi? | lingua_inglese |
| tta-64909c3c58265893a0c86d85 | Che cosa significa in italiano la frase spagnola "Te amo"? | lingua_inglese |
| tta-64f4e5cbd361046b195e5803 | Come si chiama chi prova piacere sessuale guardando altri in intimità? | sessuale_esplicito, violenza_esplicita |
| tta-65056e227a97013de78b5276 | Da quante lettere è composto l'alfabeto inglese? | lingua_inglese |
| tta-65056efc7a97013de78b53a7 | La parola "atomo" deriva dal greco antico ἄτομος (atomos). Che cosa significava originariamente? | lingua_inglese |
| tta-622a1c367cc59eab6f95002a | Perché Mike Tyson fu multato di 3 milioni di dollari dalla commissione pugilistica nel 1997? | droghe, violenza_esplicita |
| tta-622a1c367cc59eab6f95006f | Quale tennista fu squalificata per due anni dopo essere risultata positiva alla cocaina a Wimbledon nel 2007? | droghe |
| tta-622a1c367cc59eab6f950098 | Da quale città statunitense provengono sia la squadra di basket dei Rockets sia quella di baseball degli Astros? | contesto_locale |
| tta-622a1c367cc59eab6f9500af | Nel baseball, da dove vengono i Braves? | contesto_locale |
| tta-622a1c367cc59eab6f9500cb | Hockey: gli Edmonton ______. | contesto_locale |
| tta-622a1c367cc59eab6f9500ce | Football americano: i New Orleans ______. | contesto_locale |
| tta-622a1c367cc59eab6f9500d2 | Baseball: i Baltimore ________. | contesto_locale |
| tta-62417cbc8c3137686862d735 | Quale di queste è una squadra di football americano con sede a Atlanta? | contesto_locale |
| tta-62417cc88c3137686862d73a | Quale di queste è una squadra di football americano con sede a Baltimora? | contesto_locale |
| tta-62417ccb8c3137686862d73b | Quale di queste è una squadra di baseball con sede a Boston? | contesto_locale |
| tta-62417cd00f96c4efe8d77388 | Quale di queste è una squadra di hockey su ghiaccio con sede a Boston? | contesto_locale |
| tta-62417cd30f96c4efe8d77389 | Quale di queste è una squadra di football americano con sede a Buffalo? | contesto_locale |
| tta-62417cd60f96c4efe8d7738a | Quale di queste è una squadra di hockey su ghiaccio con sede a Buffalo? | contesto_locale |
| tta-62417cd80f96c4efe8d7738b | Quale di queste è una squadra di hockey su ghiaccio con sede a Calgary? | contesto_locale |
| tta-62417ce10f96c4efe8d7738e | Quale di queste è una squadra di baseball con sede a Chicago? | contesto_locale |
| tta-62417ce80f96c4efe8d77391 | Quale di queste è una squadra di hockey su ghiaccio con sede a Chicago? | contesto_locale |
| tta-62417ced0f96c4efe8d77393 | Quale di queste è una squadra di baseball con sede a Cincinnati? | contesto_locale |
| tta-62417cf00f96c4efe8d77394 | Quale di queste è una squadra di football americano con sede a Cincinnati? | contesto_locale |
| tta-62417cfd0f96c4efe8d77399 | Quale di queste è una squadra di hockey su ghiaccio con sede a Columbus? | contesto_locale |
| tta-62417d020f96c4efe8d7739b | Quale di queste è una squadra di football americano con sede a Dallas? | contesto_locale |
| tta-62417d070f96c4efe8d7739d | Quale di queste è una squadra di hockey su ghiaccio con sede a Dallas? | contesto_locale |
| tta-62417d0c0f96c4efe8d7739f | Quale di queste è una squadra di football americano con sede a Denver? | contesto_locale |
| tta-62417d140f96c4efe8d773a2 | Quale di queste è una squadra di football americano con sede a Detroit? | contesto_locale |
| tta-62417d190f96c4efe8d773a4 | Quale di queste è una squadra di hockey su ghiaccio con sede a Detroit? | contesto_locale |
| tta-62417d1e0f96c4efe8d773a6 | Quale di queste è una squadra di football americano con sede a Green Bay? | contesto_locale |
| tta-62417d230f96c4efe8d773a8 | Quale di queste è una squadra di football americano con sede a Houston? | contesto_locale |
| tta-62417d2d0f96c4efe8d773ac | Quale di queste è una squadra di football americano con sede a Jacksonville? | contesto_locale |
| tta-62417d2f0f96c4efe8d773ad | Quale di queste è una squadra di baseball con sede a Kansas City? | contesto_locale |
| tta-62417d370f96c4efe8d773b0 | Quale di queste è una squadra di football americano con sede a Las Vegas? | contesto_locale |
| tta-62417d3f0f96c4efe8d773b3 | Quale di queste è una squadra di football americano con sede a Miami? | contesto_locale |
| tta-62417d460f96c4efe8d773b6 | Quale di queste è una squadra di baseball con sede a Milwaukee? | contesto_locale |
| tta-62417d5d0f96c4efe8d773bf | Quale di queste è una squadra di baseball con sede a New York? | contesto_locale |
| tta-62417d5f0f96c4efe8d773c0 | Quale di queste è una squadra di football americano con sede a New York? | contesto_locale |
| tta-62417d700f96c4efe8d773c7 | Quale di queste è una squadra di baseball con sede a Oakland? | contesto_locale |
| tta-62417d7d0f96c4efe8d773cc | Quale di queste è una squadra di baseball con sede a Filadelfia? | contesto_locale |
| tta-62417d7f0f96c4efe8d773cd | Quale di queste è una squadra di football americano con sede a Filadelfia? | contesto_locale |
| tta-62417d840f96c4efe8d773cf | Quale di queste è una squadra di hockey su ghiaccio con sede a Filadelfia? | contesto_locale |
| tta-62417d8c0f96c4efe8d773d2 | Quale di queste è una squadra di baseball con sede a Pittsburgh? | contesto_locale |
| tta-62417d8e0f96c4efe8d773d3 | Quale di queste è una squadra di football americano con sede a Pittsburgh? | contesto_locale |
| tta-62417d9f0f96c4efe8d773da | Quale di queste è una squadra di baseball con sede a San Diego? | contesto_locale |
| tta-62417da28c3137686862d73d | Quale di queste è una squadra di baseball con sede a San Francisco? | contesto_locale |
| tta-62417da50f96c4efe8d773db | Quale di queste è una squadra di football americano con sede a San Francisco? | contesto_locale |
| tta-62417da70f96c4efe8d773dc | Quale di queste è una squadra di hockey su ghiaccio con sede a San Jose? | contesto_locale |
| tta-62417dac0f96c4efe8d773de | Quale di queste è una squadra di baseball con sede a St. Louis? | contesto_locale |
| tta-62417daf0f96c4efe8d773df | Quale di queste è una squadra di hockey su ghiaccio con sede a St. Louis? | contesto_locale |
| tta-62417db40f96c4efe8d773e1 | Quale di queste è una squadra di football americano con sede a Seattle? | contesto_locale |
| tta-62417db60f96c4efe8d773e2 | Quale di queste è una squadra di hockey su ghiaccio con sede a Seattle? | contesto_locale |
| tta-62417dbe0f96c4efe8d773e5 | Quale di queste è una squadra di football americano con sede a Tampa? | contesto_locale |
| tta-62417dc00f96c4efe8d773e6 | Quale di queste è una squadra di hockey su ghiaccio con sede a Tampa? | contesto_locale |
| tta-62417dc30f96c4efe8d773e7 | Quale di queste è una squadra di baseball con sede a Toronto? | contesto_locale |
| tta-62417dc70f96c4efe8d773e9 | Quale di queste è una squadra di hockey su ghiaccio con sede a Toronto? | contesto_locale |
| tta-62417dcc0f96c4efe8d773eb | Quale di queste è una squadra di hockey su ghiaccio con sede a Vancouver? | contesto_locale |
| tta-62417ddc0f96c4efe8d773f1 | Quale di queste è una squadra di hockey su ghiaccio con sede a Winnipeg? | contesto_locale |
| tta-6384b43f83dddfb71ee5e369 | Quale sport è associato a Stanley Cup? | contesto_locale |
| tta-645b431a067ef798d145507c | Qual è il soprannome del famoso stadio di baseball un tempo chiamato "la casa costruita da Ruth"? | contesto_locale |
| tta-646262c1ab138b829b81ea5a | Come si chiama un tipo di baseball pensato per i giovani giocatori che stanno ancora sviluppando le capacità di battuta? | contesto_locale |
| tta-646339a001d576cfac3aa3a1 | Quale squadra NFL, nota per i cappelli a forma di spicchio di formaggio dei suoi tifosi, è soprannominata anche "Cheeseheads"? | contesto_locale |
| tta-6477bad7550bc819ad646b41 | Nell'hockey, come si chiama la penalità per aver ostacolato l'avversario con il bastone? | contesto_locale |
| tta-6477bb70550bc819ad646b8f | Quale di queste è una posizione di lancio regolare nel baseball? | contesto_locale |
| tta-647edb90520523194910c352 | Qual è la città più piccola degli Stati Uniti ad avere una franchigia NFL? | contesto_locale |
| tta-64879d54a754bb6010f8b041 | Come si chiama il momento in cui si lascia cadere il disco nell'hockey su ghiaccio? | contesto_locale |
| tta-6496ac48e831b1ab5aa11147 | Come si chiama la squadra NFL il cui logo presenta un ferro di cavallo blu? | contesto_locale |
| tta-64e6fd5e0b79e5bedd55c889 | Nel 1999, quale squadra aveva Mariano Rivera come closer nelle World Series? | contesto_locale |
| tta-64f3a941601ffca0b7615dd7 | Come si chiama nel baseball il lancio con cui un lanciatore colpisce intenzionalmente il battitore? | contesto_locale |
| tta-64fadc3c717513cb79190383 | Quale squadra NHL prese il nome da un film Disney? | contesto_locale |
| tta-65056e687a97013de78b52d7 | Quale di queste è una tecnica difensiva nell'hockey su ghiaccio? | contesto_locale |
| tta-6ac7357f198afb6e5af917d5 | Chi lanciò l'unica partita perfetta nella storia delle World Series? | contesto_locale |
| tta-6ae03f923f3b0b676f6e9a8c | Quale giocatore di hockey su ghiaccio è soprannominato "The Great One" (il Grande)? | contesto_locale |
| tta-6ae82946bb6335621cbf775c | Che cosa significa letteralmente in italiano il nome dell'arte marziale judo? | lingua_inglese |
| tta-6ae97a87bb6335621cbf7878 | Quale squadra di baseball vinse le World Series del 2016, ponendo fine a 108 anni di digiuno? | contesto_locale |
| arc-LEAP_2006_8_10411 | Raquel ha nutrito una cucciolata di cinque gattini con una dieta di sola carne per due settimane e ha scoperto che sono aumentati in media di 15 once. Ne ha concluso che mangiare carne è il modo migliore per aiutare i gattini a crescere. Che cosa avrebbe dovuto fare Raquel per rendere migliore questo esperimento? | unita_non_localizzate |
| arc-MCAS_2006_8_25 | Sal guarda una mappa del Massachusetts. Ha misurato in pollici la distanza da Boston a Salem sulla mappa. Vuole sapere a quante miglia reali corrispondono quei pollici. Quale elemento della mappa dovrebbe cercare? | unita_non_localizzate |
| ani-10b5bb6a9d | Nella filastrocca inglese "This Little Piggy", dove andò il primo porcellino? | lingua_inglese |
| ani-2d13d7f0e8 | In un episodio del 1952 di "I Love Lucy" intitolato "Lucy Is Enceinte" si usò la parola francese perché fu censurata quale parola inglese? | lingua_inglese |
| ani-87fdc1a4b9 | Come si chiama in inglese una coperta o uno scialle fatto di quadrati colorati cuciti o lavorati all'uncinetto? | lingua_inglese |
| ani-fed7d7f9f5 | Sulla scala Fahrenheit, 98,6 gradi sono generalmente considerati cosa? | unita_non_localizzate |
| obqa-9-259 | Come sopravvivono al freddo gli orsi polari? | opzioni_dipendenti |
| obqa-10-1086 | Quando il ghiaccio viene riscaldato in una padella a 100 gradi Fahrenheit, si scioglierà e quindi | unita_non_localizzate |
| obqa-10-204 | Una gru pesa inizialmente trenta libbre, poi pesa venti libbre. Durante il viaggio, la gru volerà | unita_non_localizzate |
| obqa-10-322 | Una persona si trova nel bosco, smarrita. Hanno bisogno di segnalare agli altri che sono lì e che la loro voce è scomparsa, quindi devono farlo in modo impercettibile. La persona può segnalare con | traduzione |
| obqa-10-727 | Una certa pianta si trova in un campo e all'improvviso le api la circondano, si arrampicano su di essa e volano via. L'anno successivo | traduzione |
| obqa-10-746 | Gli impianti di un inceneritore sarebbero | traduzione |
| obqa-10-916 | Se la temperatura è di 34 gradi Fahrenheit, cosa si potrebbe mettere sopra il marciapiede ghiacciato per trasformare il ghiaccio in liquido? | unita_non_localizzate |
| obqa-11-288 | Una persona urla all'interno di un garage. La loro voce risuona e loro sentono | traduzione |
| obqa-11-62 | A 30 gradi Fahrenheit, l'acqua è | unita_non_localizzate |
| obqa-11-632 | Un impianto che ha bisogno di espandersi potrà avere al suo interno una risorsa infinita | traduzione |
| obqa-11-648 | Due orsi, uno di 200 libbre e un altro di 150 libbre, stanno per entrare nell'inverno. L'orso con il peso maggiore lo sarà | unita_non_localizzate |
| obqa-11-93 | Un uccello che pesa venti libbre volerà più facilmente di un uccello che pesa | unita_non_localizzate |
| obqa-1176 | Dispersione dei semi | traduzione |
| obqa-12 | Quando una palla da baseball viene colpita con una mazza, cosa fanno le particelle della palla? | traduzione |
| obqa-12-1108 | Se un pezzo di terreno riceve sei pollici di pioggia ogni mese, allora quella è la quantità di | unita_non_localizzate |
| obqa-12-1168 | Cosa può aiutarti a dormire profondamente? | violenza_esplicita |
| obqa-12-23 | Un seme è disperso quando lo è | traduzione |
| obqa-12-299 | Alcuni bruchi usano il mimetismo per assomigliarsi | traduzione |
| obqa-12-624 | Le sequoie sono supportate da | violenza_esplicita |
| obqa-12-745 | se una pianta si presenta in un posto nuovo, cosa può essere successo? | traduzione |
| obqa-12-779 | Un cervo creò un roseto | traduzione |
| obqa-12-959 | Quali sono le fonti dei frutti? | traduzione |
| obqa-13-551 | cacciare significa che gli esseri umani perseguitano e uccidono gli animali | traduzione |
| obqa-13-606 | Se una giovane sterna viene trovata in una scatola chiusa a chiave, morta, senza segni su di essa, la causa di morte più probabile è stata | violenza_esplicita |
| obqa-13-746 | Cosa vorrebbe nutrirsi uno scoiattolo? | traduzione |
| obqa-14-183 | Gli alberi di limone Eureka guadagnano 12-24 pollici in primavera a causa di | unita_non_localizzate |
| obqa-14-390 | Un insetto può presentarsi come cacca di uccello | sessuale_esplicito |
| obqa-14-670 | Se una pianta si presenta in un posto nuovo, cosa può essere successo? | traduzione |
| obqa-14-778 | Una persona guarda un organismo nudo all'occhio umano. Desiderando osservarlo più chiaramente, una persona si impegna a utilizzarlo | traduzione |
| obqa-14-836 | Un cugino della talpa sopravvive | traduzione |
| obqa-14-988 | Se un cubetto di ghiaccio che pesa 2 once si scioglie, in forma liquida, si scioglierà | unita_non_localizzate |
| obqa-1895 | Floema | traduzione |
| obqa-7-167 | Un palloncino viene riempito di elio, quindi viene aperto e premuto sulla bocca di qualcuno per alzare la voce, perché fa questo? | comportamento_rischioso |
| obqa-996 | Le relazioni violente spesso portano all'abuso | violenza_tragedie |
| obqa-1202 | Fusto di una pianta | traduzione |
| obqa-1596 | Gli animali richiedono | traduzione |
| obqa-7-452 | Le luci degli impianti possono essere utili a questo scopo | traduzione |
| obqa-9-250 | quale di questi disturberebbe uno specchio d'acqua stagnante? | opzioni_dipendenti |
| arc-Mercury_LBS10959 | Uno studente sta misurando in iarde la distanza percorsa da un'auto lungo una rampa. Quale misura è più simile in lunghezza usando il sistema metrico? | unita_non_localizzate |
| arc-MCAS_2004_9_6 | Due operai utilizzano un'impalcatura. Un lavoratore pesa 180 libbre. e l'altro pesa 200 libbre. Si presume che gli effetti dell'impatto aumentino il carico vivo del peso dei lavoratori del 25%. Qual è il carico mobile massimo risultante, in libbre, che ci si può aspettare dai due lavoratori sostenuti dall'impalcatura? | unita_non_localizzate |

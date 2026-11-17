# Taboo: Stream & Meme Edition 🎭 — Regolamento e mazzo v3.0
**Stato:** proposta pronta per playtest (non calibrazione empirica).  **Base:** revisione integrale della versione 2, 62 carte.  **Lingua:** italiano.

> **Identità:** lo streamer descrive la carta; la chat prova a indovinare; **il bot valida le risposte secondo le regole approvate e decreta il primo spettatore**, mentre streamer e chat inseguono insieme il punteggio di squadra. Le parole segrete non sono mostrate nella scena pubblica.

## 1. Obiettivi di progetto e vincoli invarianti
1. La partita standard resta di **5 round × 90 secondi**: 450 secondi di gioco effettivo. Le pause tra round sono fuori dal timer.
2. Il bot è l’autorità su ordine delle risposte, timer, punteggi e classifica. Il moderatore/lo streamer segnala soltanto eventuali violazioni vocali, contestazioni e problemi tecnici; non sceglie manualmente chi è arrivato primo.
3. La squadra vince raggiungendo o superando la soglia di punti fissata **prima** dell’inizio della partita. La soglia iniziale sperimentale è **25**.
4. Le regole base valgono per tutte le categorie. Eventi e varianti non possono cambiare il significato di una risposta corretta o l’ordine dei messaggi.
5. Ogni carta presenta **un solo bersaglio**, cinque voci Taboo, categoria, difficoltà provvisoria, risposte approvate e metadati. Una voce Taboo può essere un’espressione composta.
6. Nessuna ricompensa di valore economico è collegata automaticamente alla partita; premi, gift card e giveaway richiedono una valutazione separata delle regole legali e di piattaforma.

## 2. Regole fondamentali da annunciare in live
**Obiettivo.** Nei 90 secondi del round lo streamer cerca di far indovinare quante più carte possibile. La chat scrive la risposta; il **primo messaggio valido** riconosciuto dal bot ottiene una vittoria individuale. Ogni carta risolta assegna anche punti alla squadra.

**Non è permesso allo streamer:**
- Pronunciare il bersaglio, i suoi **componenti lessicali significativi** (es. per «CALZINO BUCATO» né «calzino» né «bucato») o le cinque parole/espressioni Taboo. Articoli e preposizioni comuni presenti nel bersaglio non sono vietati isolatamente.
- Usare flessioni e derivati **trasparenti dello stesso lemma** delle parole proibite (es. «puzza» → «puzzolente» quando il derivato rivela lo stesso concetto). **Non** si considerano automaticamente proibite parole casualmente omografe o con radici simili ma significato diverso: in caso di dubbio la decisione viene presa tra i round.
- Suggerire lettere, iniziali, sillabe, ortografia, traduzioni, rime, suoni che imitano il bersaglio, parole scandite o indicazioni sul numero di caratteri.
- Mimare, indicare oggetti, mostrare scritte/immagini, usare la chat o altri schermi per rivelare la soluzione. Eccezione: «Mimo Proibito» in modalità esibizione non classificata.

**Lo streamer può:** parlare liberamente con analogie, microstorie, esempi, domande retoriche e descrizioni indirette, purché non violino i divieti. Può saltare **al massimo due carte per round** usando il comando dedicato.

**La chat:** invia risposte testuali. Il bot accetta il bersaglio esatto e le sole varianti approvate nella scheda, dopo normalizzazione di maiuscole, accenti, apostrofi, spazi e punteggiatura. Non basta contenere una parola generica del bersaglio: per una frase composta deve essere riconosciuta l’intera idea secondo gli alias autorizzati. Un messaggio può contenere una risposta completa e testo accessorio; **i messaggi con più ipotesi distinte vengono ignorati**, per evitare tentativi a raffica. Il bot considera al massimo un tentativo per utente ogni 2 secondi, misurati dal ricevimento del messaggio; il limite non blocca l’intera chat.

**Ordine delle risposte:** per ciascuna piattaforma il bot registra il primo messaggio valido ricevuto nella finestra attiva della carta. La **partita competitiva standard si svolge su una piattaforma alla volta**: così esiste un vincitore univoco per carta. Se una live viene trasmessa simultaneamente su più piattaforme, il bot può raccogliere tutte le risposte per il punteggio cooperativo, ma il premio «primo indovino» viene assegnato soltanto nella piattaforma competitiva annunciata in partenza. Una classifica interpiattaforma unica è sperimentale e richiede misurazioni affidabili delle latenze. Il bot resta l’unico arbitro della precedenza.

## 3. Ciclo tecnico di una carta
1. **READY:** la carta è privata e visibile allo streamer, non al pubblico; il bot marca l’ID carta e prepara la finestra risposte.
2. **ACTIVE:** la carta si apre sul timer autorevole del bot. L’overlay pubblico mostra solo categoria, livello, punti e tempo rimasto; la parola e i Taboo restano nascosti.
3. **SUCCESS:** alla prima risposta valida, il bot chiude la carta, registra un solo vincitore, assegna punti squadra e incrementa la serie. Si passa immediatamente alla successiva (transizione grafica breve, senza bloccare il timer).
4. **SKIP:** lo streamer usa uno dei due skip del round; 0 punti, serie azzerata. Se non ci sono skip residui, la carta può restare attiva fino alla fine del round.
5. **TABOO:** lo streamer si autocorregge o un moderatore segnala una violazione con comando dedicato: carta persa, **−1 punto squadra** e serie azzerata. Al massimo una penalità per carta; non sottrarre punti sotto zero. Se l’evento è contestato o tardivo, applicare la rettifica nell’intervallo successivo con log verificabile: se la violazione è avvenuta **prima della risposta vincente**, revocare la vittoria, riaccreditare gli eventi nell’ordine corretto e rettificare il punteggio, mostrando il motivo tra i round. Se non è verificabile, nessuna sanzione retroattiva.
6. **TIMEOUT ROUND:** alla fine dei 90 secondi la carta ancora aperta non assegna punti. Niente tolleranza arbitraria post-scadenza; valgono soltanto i messaggi ricevuti entro il cutoff definito dal bot.
7. Il bot registra un evento per ogni esito: `card_id`, `round_id`, `start_ms`, `end_ms`, `outcome`, `winning_user_id` (se presente), `points_delta`, `taboo_flag`, `skips_used`.

**Nota sulla moderazione:** il riconoscimento delle parole proibite nel parlato può essere assistito da speech-to-text ma **non è sufficientemente affidabile come unico arbitro** per accenti, rumore, inflessioni e omofoni. La validazione delle risposte della chat è invece automatica, come previsto dal progetto.

## 4. Punteggi, serie e obiettivo cooperativo
| Evento | Squadra | Individuale | Specifiche |
|---|---:|---:|---|
| Carta facile risolta | +1 | 1 vittoria al primo | Una sola volta per carta |
| Carta media risolta | +2 | 1 vittoria al primo | Una sola volta per carta |
| Carta difficile risolta | +3 | 1 vittoria al primo | Una sola volta per carta |
| Violazione Taboo | −1 | Nessuna vittoria | Carta chiusa, minimo squadra 0 |
| Skip | 0 | Nessuna vittoria | Fino a 2 per round; azzera la serie |
| Ogni 3 carte consecutive corrette nello stesso round | +1 | Nessuna vittoria extra | Bonus ai traguardi 3, 6, 9…; reset su skip, errore, fine round |
| Jackpot risolto | ×2 **solo sui punti base** della carta | 1 vittoria | Una volta a partita, senza altri moltiplicatori |
| Carta cantata risolta (evento facoltativo) | ×2 **solo sui punti base** della carta | 1 vittoria | Non si combina con Jackpot; il bonus serie resta fisso a +1 |

**Esempio:** tre carte facili-medie-difficili risolte consecutivamente valgono `1 + 2 + 3 + 1 bonus serie = 7` punti squadra. Se la carta difficile è Jackpot valgono `1 + 2 + (3 × 2) + 1 = 10`. La difficoltà non aggiunge vittorie individuali: ogni carta ne vale una, preservando l’equità della classifica indovini.

**Obiettivo standard:** 25 punti, fisso all’avvio. Non aumentarlo in corso d’opera se la chat va molto bene; non diminuirlo se va male. Dopo almeno 10 partite standard comparabili, puntare a una riuscita attorno al **40–65%**: se il tasso di successo supera il 75%, proporre +2 punti di soglia; se è sotto il 30%, −2. Cambiare un solo parametro tra due finestre di prova e verificare di nuovo.

**Classifica individuale:** ordinare per (1) numero di carte vinte, (2) numero di carte difficili vinte, (3) numero di carte medie vinte; eventuale ulteriore parità = **ex aequo**. Una sola risposta premiata per carta e utente; niente punti per spam o messaggi ripetuti. L’ID utente, non il nickname modificabile, identifica un giocatore; le graduatorie Twitch/TikTok sono distinte per impostazione predefinita.

## 5. I cinque round della modalità standard
| Round | Durata | Carte | Regola speciale |
|---|---:|---|---|
| 1 · Riscaldamento | 90 s | Facili e medie (circa 70/30) | Nessun evento speciale, serve a far entrare la chat nel ritmo |
| 2 · Classico | 90 s | Mix indicativo 30/50/20 (facili/medie/difficili) | Taboo puro, massimo 2 skip |
| 3 · La chat sceglie | 90 s | Categoria votata nell’intervallo | Sondaggio chiuso **prima** dell’inizio del timer, selezione automatica tra carte disponibili |
| 4 · Caos leggero | 90 s | Mix indicativo 30/50/20 | Un solo vincolo narrativo scelto prima del round: «telecronista», «thriller» oppure «venditore disperato»; i divieti Taboo restano identici |
| 5 · Gran finale | 90 s | Mix indicativo 20/50/30 | **Prima carta Jackpot** (×2 base se risolta), poi Taboo classico |

**Stabilità del ritmo:** timer di partita gestito dal bot, transizione carta idealmente entro 1–2 secondi, non interrompere il cronometro per festeggiare il vincitore, niente ruota durante il round. Gli intervalli da 15–30 secondi fuori timer servono a mostrare classifica, votar categoria e svolgere **una sola** penitenza eventuale. Nessun round speciale può essere imposto all’improvviso dopo che il tempo è partito.

**Gestione categorie e mazzo:** senza ripetizioni nella stessa partita; una carta giocata resta esclusa nelle due partite successive **solo se il mazzo disponibile lo consente**. In mancanza di carte per la categoria votata, il bot propone una categoria alternativa e segnala il motivo prima del round. Estrazione stratificata con pesi configurabili, senza esposizione pubblica del target.

## 6. Eventi e varianti: cosa tenere, modificare o relegare a bonus
| Variante v2 | Decisione v3 | Nuova regola |
|---|---|---|
| Suggerimento cantato | **Opzionale** | Un solo evento in una partita, attivabile dal bot negli ultimi 20 s di un round **solo sulla carta allora attiva**; il target non cambia. ×2 punti base, non cumulabile con Jackpot. Se non c’è una carta attiva, non si attiva. |
| Taboo invertito con TTS | **Esibizione separata, fuori classifica** | Le frasi inviate dagli spettatori vengono filtrate prima del TTS; niente partecipazione limitata obbligatoriamente a VIP/abbonati. |
| Poliglotta tarocco | **Vincolo narrativo opzionale** | Preferire registri teatrali e voci immaginarie, senza ricorrere a caricature di comunità o nazionalità. |
| Speedrun 60 s | **Modalità arcade separata** | Classifica e soglia proprie: non mescolare statistiche con la modalità standard. |
| Una Parola Sola | **Modalità sperimentale separata** | Cinque secondi minimi tra indizi, soltanto facili/medie; controllo umano del rispetto della regola, non usata per la difficoltà standard. |
| Mimo Proibito | **Bonus esibizione non classificata** | Eccezione ai divieti dei gesti, punteggio di squadra standard disabilitato. |
| La Chat Sceglie | **Round 3 standard** | Il sondaggio termina prima del timer e non interrompe la partita. |
| No Sostantivi | **Sperimentale fuori classifica** | Troppo difficile da verificare automaticamente senza errori; usarla solo per una gag controllata. |

**Ruota delle penitenze:** si attiva **una volta al massimo per round** se durante quel round è stata segnalata almeno una violazione Taboo. Si gira **tra** i round, mai nel countdown. Penitenze brevi, sicure e non umilianti: filtro vocale per una carta, cappello buffo, annunciare la classifica da telecronista, parlare come narratore noir, lettura drammatica di un messaggio scelto/moderato, «salvezza». Evitare esercizi fisici obbligatori, messaggi non moderati e contenuti che espongano utenti a derisione.

## 7. Qualità delle carte: controllo editoriale
La qualità si valuta **separatamente** dalla difficoltà. Griglia da 100 punti: chiarezza/univocità **25**, potenziale comico **25**, pertinenza delle 5 parole Taboo **20**, familiarità del target con il pubblico **15**, originalità/assenza duplicati **15**. **≥80:** approvabile; **65–79:** rivedere; **<65:** scartare. Sono soglie editoriali proposte, non dati sperimentali.

Controlli obbligatori prima della pubblicazione:
- Un bersaglio = un concetto. Vietati bersagli «A (B)» che concedono due soluzioni come «CALVIZIE (RIPORTO)».
- Le cinque parole vietate devono bloccare spiegazioni **ovvie ma plausibili**: non riempire la scheda di termini casuali («rosso», «macchina», «giallo») senza legame robusto.
- I Taboo non devono replicare una parola costitutiva del bersaglio (già proibita dalla regola generale); se c’è sovrapposizione, scegliere un altro divieto utile.
- Nei composti, scegliere cinque divieti che coprano almeno tre collegamenti distinti: funzione, contesto, oggetto, effetto, associazione culturale, gesto tipico.
- Alias semantici: ammettere soltanto varianti strettamente equivalenti al bersaglio. Un concetto più generico o più specifico **non** è automaticamente valido.
- Le situazioni memetiche devono restare comprensibili anche quando un nuovo spettatore entra a metà live; se troppo di nicchia, introdurle in una categoria specialistica o ritararne l’esposizione.
- Evitare bersagli che richiedano allusioni denigratorie a gruppi, salute o persone reali; preferire **situazioni** a etichette negative.

## 8. Mazzo completo revisionato: 62 carte
Le difficoltà qui indicate sono **proposte iniziali**, da correggere dopo i playtest. I bersagli modificati mantengono l’ID della carta v2; le schede nuove ereditano le statistiche soltanto se la semantica è invariata, altrimenti le statistiche vengono azzerate.

### Categoria A · Disastri & Figuracce Quotidiane
| ID | Bersaglio v3 | Diff. iniziale | 5 parole Taboo | Modifica/motivazione |
|---|---|:---:|---|---|
| `A01` | **PETO** | 🟢 | Scoreggia, Aria, Puzza, Rumore, Sedere | Conservata: immediata e comica |
| `A02` | **RUTTO** | 🟢 | Bocca, Digestione, Birra, Gas, Suono | Sostituito «aria» con «gas» per rendere i divieti più pertinenti |
| `A03` | **BRUFOLO** | 🟢 | Faccia, Spremere, Pelle, Adolescente, Acne | Rimpiazzato «giallo», indizio poco affidabile |
| `A04` | **INCIAMPARE** | 🟢 | Cadere, Piede, Gradino, Equilibrio, Ostacolo | Rafforzato il quinto divieto |
| `A05` | **ALITO PESANTE** | 🟡 | Bocca, Puzza, Cipolla, Menta, Respiro | Rimpiazzato «mattina», poco discriminante |
| `A06` | **CALZINO BUCATO** | 🟡 | Alluce, Scarpa, Dito, Tessuto, Piede | Sostituito «filo», debole e poco immediato |
| `A07` | **DITO NEL NASO** | 🟡 | Caccole, Pulire, Buco, Furtivo, Scavare | Rimpiazzato «macchina», poco pertinente |
| `A08` | **FIGURACCIA** | 🟡 | Vergogna, Errore, Ridere, Imbarazzo, Gaffe | Sostituiti divieti metaforici deboli |
| `A09` | **FRIENDZONE** | 🟡 | Amico, Rifiuto, Amore, Interesse, Palo | Conservata; verificare familiarità tra pubblici diversi |
| `A10` | **RIPORTO** (da **CALVIZIE (RIPORTO)**) | 🔴 | Capelli, Pelata, Pettine, Lato, Vento | Separato da «calvizie», che è un altro concetto |
| `A11` | **VOCALE INTERMINABILE** (da **AUDIO VOCALE DI 5 MINUTI**) | 🔴 | WhatsApp, Messaggio, Ascoltare, Durata, Velocità | Target accorciato e più riconoscibile; «interminabile» resta soggettivo |
| `A12` | **SALUTO NON RICAMBIATO** (da **SALUTARE CHI NON TI SALUTAVA**) | 🔴 | Ciao, Mano, Ignorare, Rispondere, Imbarazzo | Target condensato e più univoco |

### Categoria B · Internet Culture & Meme
| ID | Bersaglio v3 | Diff. iniziale | 5 parole Taboo | Modifica/motivazione |
|---|---|:---:|---|---|
| `B01` | **BOOMER** | 🟢 | Vecchio, Giovani, Facebook, Buongiornissimo, Generazione | Conservata, ma verificare comprensibilità nella chat |
| `B02` | **TROLL** | 🟢 | Scherzo, Chat, Provocare, Fake, Disturbare | Sostituito «insulto», non necessario al concetto |
| `B03` | **CRINGE** | 🟢 | Imbarazzo, Vergogna, Video, Brividi, Disagio | Sostituito «guardare», poco incisivo |
| `B04` | **GHOSTING** | 🟡 | Sparire, Messaggi, Visualizzato, Rispondere, Silenzio | Tolto il marchio specifico per evitare suggerimenti ridondanti |
| `B05` | **MARANZA** | 🟡 | Borsello, Tuta, Monopattino, Ciuffo, Slang | Termine con forte connotazione sociale: evitare indizi denigratori |
| `B06` | **SIMP** | 🟡 | Cotta, Adulare, Attenzioni, Chat, Idealizzare | Rimozione di indizi dipendenti dal genere |
| `B07` | **RAGEQUIT** | 🟡 | Gioco, Rabbia, Uscire, Alt+F4, Partita | Resi più precisi i divieti |
| `B08` | **SPOILER** | 🟢 | Finale, Film, Serie, Rovinare, Anticipare | Conservata e rifinita |
| `B09` | **NPC** | 🟡 | Personaggio, Gioco, Robot, Ripetere, Videogioco | Difficoltà ridotta provvisoriamente: per un pubblico gaming può essere nota |
| `B10` | **COPIUM** | 🔴 | Illusione, Speranza, Negare, Autoinganno, Meme | Concetto di nicchia: da testare e potenzialmente sostituire |

### Categoria C · Vita da Streamer
| ID | Bersaglio v3 | Diff. iniziale | 5 parole Taboo | Modifica/motivazione |
|---|---|:---:|---|---|
| `C01` | **MICROFONO SPENTO** (da **MUTATO**) | 🟢 | Muto, Audio, Parlare, Sentire, Trasmissione | Eliminata ambiguità di «mutato» |
| `C02` | **BAN** | 🟢 | Espellere, Moderatore, Chat, Canale, Sospendere | Più rilevante il quinto divieto |
| `C03` | **LAG** | 🟢 | Connessione, Internet, Ritardo, Scatti, Ping | Conservata |
| `C04` | **FOLLOW** | 🟢 | Seguire, Pulsante, Canale, Notifica, Profilo | Conservata; evitare di sollecitare follow come indizio esterno |
| `C05` | **CLIP** | 🟡 | Video, Momento, Tagliare, Secondi, Highlight | Conservata |
| `C06` | **RAID** | 🟡 | Canale, Spettatori, Arrivare, Live, Trasferire | Divieti riferiti al contesto streaming, non ad altri significati |
| `C07` | **EMOTE** | 🟡 | Faccina, Chat, Emoji, Abbonati, Kappa | Conservata |
| `C08` | **FINTA DONAZIONE** (da **DONAZIONE FAKE**) | 🟡 | Soldi, Scherzo, Notifica, Troll, Simulare | Rinominata in italiano; sostituito «rimborsare» poco pertinente |
| `C09` | **BACKSEAT GAMING** | 🔴 | Consigli, Chat, Giocare, Suggerire, Comandare | Rafforzata specificità del comportamento |
| `C10` | **STREAM SNIPER** | 🔴 | Partita, Spiare, Nemico, Diretta, Posizione | Reso il divieto «posizione» più caratteristico |

### Categoria D · Oggetti Buffi o Fraintendibili
| ID | Bersaglio v3 | Diff. iniziale | 5 parole Taboo | Modifica/motivazione |
|---|---|:---:|---|---|
| `D01` | **PARRUCCA** | 🟢 | Capelli, Finti, Carnevale, Testa, Calvo | Conservata |
| `D02` | **BIDET** | 🟡 | Bagno, Lavare, Italia, Ceramica, Intimo | Conservata |
| `D03` | **DENTIERA** | 🟡 | Denti, Nonno, Bocca, Bicchiere, Masticare | Conservata |
| `D04` | **SUPPOSTA** | 🟡 | Farmaco, Sedere, Febbre, Inserire, Medico | Conservata |
| `D05` | **STURALAVANDINI** | 🟡 | Ventosa, Tubo, Acqua, Intasato, Scarico | Tolto «rosso», vietati invece gli agganci realmente utili |
| `D06` | **CARTA IGIENICA FINITA** (da **ROTOLO FINITO**) | 🟡 | Bagno, Rotolo, Cartone, Vuoto, Emergenza | Rimosso bersaglio troppo ambiguo |
| `D07` | **FENICOTTERO GONFIABILE** (da **GONFIABILE A FENICOTTERO**) | 🟡 | Rosa, Mare, Piscina, Canotto, Estate | Rinominato in forma più naturale |
| `D08` | **PIGIAMA CON I PIEDINI** | 🔴 | Dormire, Tuta, Bambino, Freddo, Intero | Conservata; bersaglio lungo volutamente comico |
| `D09` | **CIABATTE DELLA NONNA** | 🔴 | Pantofole, Lana, Piedi, Casa, Anziana | Mantenuta come bersaglio umoristico; più risposte possibili da preautorizzare |
| `D10` | **GOMMA MASTICATA SOTTO IL BANCO** (da **GOMMA SOTTO AL BANCO**) | 🔴 | Appiccicosa, Scuola, Tavolo, Sputare, Attaccata | Precisato che è una gomma da masticare |

### Categoria E · Stereotipi & Personaggi Imbarazzanti
| ID | Bersaglio v3 | Diff. iniziale | 5 parole Taboo | Modifica/motivazione |
|---|---|:---:|---|---|
| `E01` | **SUOCERA** | 🟢 | Mamma, Marito, Moglie, Pranzo, Critica | Conservata, evitare spiegazioni obbligatoriamente negative |
| `E02` | **COMPLOTTISTA** | 🟢 | Terra piatta, Rettiliani, Teoria, Segreto, Cospirazione | Reso più pertinente il quinto divieto |
| `E03` | **IPOCONDRIACO** | 🟡 | Malato, Sintomi, Medico, Paura, Google | Conservata; evitare allusioni a persone reali |
| `E04` | **INFLUENCER SENZA FOLLOWER** (da **INFLUENCER FALLITO**) | 🟡 | Sponsor, Like, Social, Visualizzazioni, Popolarità | Target più descrittivo e autoironico |
| `E05` | **EX CHE RISPUNTA** (da **EX TOSSICO**) | 🟡 | Messaggio, Notte, Tornare, Bloccare, Relazione | Sostituita etichetta giudicante con situazione comica |
| `E06` | **VICINO RUMOROSO** | 🟡 | Casa, Muro, Trapano, Domenica, Frastuono | Tolto «sopra», non sempre pertinente |
| `E07` | **SELFIE IN PALESTRA** (da **PALESTRATO DA SELFIE**) | 🟡 | Specchio, Foto, Muscoli, Pesi, Instagram | Comportamento preciso invece di stereotipo personale |
| `E08` | **COMPAGNO FANTASMA** (da **COMPAGNO CHE NON FA NULLA**) | 🔴 | Gruppo, Progetto, Lavoro, Voto, Assente | Formula più breve; associare alias «compagno di gruppo che non fa nulla» |
| `E09` | **AMICO CHE CONOSCE TUTTI** (da **AMICO CHE "CONOSCE UN TIZIO"**) | 🔴 | Sconto, Cugino, Favore, Contatto, Raccomandazione | Più breve, mantiene la gag delle conoscenze |
| `E10` | **TUTTOLOGO DEI COMMENTI** | 🔴 | Opinione, Esperto, Social, Sapere, Rispondere | Ridotta ridondanza; termini costitutivi già vietati automaticamente |

### Categoria F · Italianità Estrema
| ID | Bersaglio v3 | Diff. iniziale | 5 parole Taboo | Modifica/motivazione |
|---|---|:---:|---|---|
| `F01` | **APERITIVO** | 🟢 | Spritz, Sera, Stuzzichini, Amici, Bere | Conservata |
| `F02` | **FERRAGOSTO** | 🟢 | Agosto, Spiaggia, Grigliata, Caldo, Vacanza | Conservata |
| `F03` | **PIZZA CON L'ANANAS** | 🟢 | Hawaii, Frutta, Napoli, Gialla, Eresia | Conservata; potenziale comico elevato |
| `F04` | **CARBONARA CON LA PANNA** | 🟡 | Pasta, Uova, Guanciale, Romani, Sacrilegio | Conservata |
| `F05` | **CENONE DI NATALE** | 🟡 | Mangiare, Parenti, Vigilia, Pesce, Panettone | Conservata |
| `F06` | **NONNA CHE TI RIEMPIE IL PIATTO** (da **NONNA CHE TI FA MANGIARE**) | 🟡 | Cibo, Pranzo, Porzione, Bis, Sazio | Immagine concreta e più riconoscibile |
| `F07` | **MAMMA CHE CHIAMA 10 VOLTE** | 🟡 | Telefono, Chiamata, Preoccupata, Rispondere, Figlio | Conservata: lunghezza funzionale alla gag |
| `F08` | **RIUNIONE DI CONDOMINIO** | 🔴 | Vicini, Amministratore, Litigare, Scale, Spese | Conservata |
| `F09` | **POSTO FISSO** | 🔴 | Lavoro, Statale, Concorso, Sicuro, Zalone | Conservata; verificare riconoscibilità fuori dalla fascia di riferimento |
| `F10` | **SUPERCAZZOLA** | 🔴 | Amici Miei, Parole, Confondere, Senso, Tognazzi | Conservata: alto potenziale comico, pubblico dipendente |

### Alias approvati esemplificativi per le carte con bersaglio modificato
Gli alias vanno **convalidati manualmente prima della live**. Non aprire l’accettazione automatica a tutte le parafrasi; l’elenco è una base editoriale.
| ID | Target | Esempi di alias accettabili | Esempi da non accettare automaticamente |
|---|---|---|---|
| A10 | RIPORTO | capelli a riporto | calvizie, pelata |
| A11 | VOCALE INTERMINABILE | audio vocale lunghissimo; messaggio vocale interminabile | audio, messaggio |
| A12 | SALUTO NON RICAMBIATO | salutare chi non ti saluta; saluto a vuoto | ignorato |
| C01 | MICROFONO SPENTO | microfono disattivato; mic spento | muto |
| C08 | FINTA DONAZIONE | donazione fake; donazione fasulla | donazione |
| D06 | CARTA IGIENICA FINITA | finita la carta igienica; rotolo di carta igienica finito | rotolo finito |
| D07 | FENICOTTERO GONFIABILE | gonfiabile a fenicottero; fenicottero da piscina | fenicottero |
| D10 | GOMMA MASTICATA SOTTO IL BANCO | chewing gum sotto il banco | gomma da cancellare |
| E04 | INFLUENCER SENZA FOLLOWER | influencer con zero follower | influencer fallito |
| E05 | EX CHE RISPUNTA | ex che ritorna; ex che si rifà vivo | ex tossico |
| E07 | SELFIE IN PALESTRA | autoscatto in palestra | palestrato |
| E08 | COMPAGNO FANTASMA | compagno di gruppo assente; quello che non fa nulla nel gruppo | fantasma |
| E09 | AMICO CHE CONOSCE TUTTI | amico che conosce un tizio per tutto | amico |
| F06 | NONNA CHE TI RIEMPIE IL PIATTO | nonna che continua a servirti; nonna che ti fa mangiare ancora | nonna |

**Nota di QA:** i bersagli «VOCALE INTERMINABILE», «COMPAGNO FANTASMA» e «CIABATTE DELLA NONNA» restano volutamente figurativi/umoristici. Il primo playtest deve verificare se la chat li indovina con un buon grado di convergenza; in caso contrario, riscriverli prima di espandere il mazzo.

## 9. Calibrazione della difficoltà basata sui dati del bot
### 9.1 Telemetria minima
Per ciascuna esposizione registrare: `card_id`, `card_revision`, `session_id`, `mode`, `difficulty_at_play`, `round_number`, `start_time`, `end_time`, `seconds_available_when_started`, `outcome` (`solved|skipped|taboo|round_timeout`), `solve_time_s` (se risolta), `active_guessers` (utenti distinti con ≥1 tentativo), `guess_count`, `winner_id`, `hint_mode`, `taboo_word_id` (se disponibile). Non salvare integralmente messaggi e dati personali se non servono: ID pseudonimizzati e retention limitata.

**Campione comparabile** per difficoltà standard: escludere round/modalità sperimentali, carte con meno di 20 s disponibili all’apertura, errori Taboo e interruzioni tecniche. Non usare la semplice % di successo aggregata per giudicare carte viste in chat di 5 persone e carte viste in chat di 500: segmentare almeno per fascia di partecipanti attivi (1–5, 6–20, 21+) o usare aggiustamento statistico.

### 9.2 Metriche e soglie proposte (da validare)
- `solve_rate = solved / (solved + skipped + round_timeout)` sulle esposizioni comparabili; violazioni Taboo fuori dal denominatore perché dipendono principalmente dallo streamer.
- `median_solve_time_s` tra le esposizioni **risolte** (misura utile, ma condizionata al successo).
- `skip_rate`, `taboo_rate`, `median_active_guessers`, `approved_alias_hit_rate`, `p50/p90_solve_time` per individuare difetti e anomalie.
- Etichette solo **provvisorie** per meno di 20 esposizioni comparabili distribuite su almeno 4 sessioni. Se una carta viene modificata sostanzialmente, azzerare la serie empirica e incrementare `card_revision`.
- Per ≥20 esposizioni: 🟢 se `solve_rate ≥ 0.80` **e** `median_solve_time_s ≤ 18`; 🔴 se `solve_rate < 0.45` **oppure** `median_solve_time_s > 35`; 🟡 altrimenti. Se il tempo mediano è assente perché nessuno ha risolto, classificare provvisoriamente difficile e segnalare revisione editoriale.
- Non promuovere/retrocedere una carta per una sola finestra di osservazione: richiedere due revisioni statistiche consecutive coerenti, e limitare il cambio a **un livello alla volta**. I valori vanno confrontati per fascia di audience, senza assumere che siano soglie ottimali universali.
- Alert QA: `skip_rate > 0.35`, `taboo_rate > 0.25`, più del 15% di contestazioni di alias o risposte quasi corrette, o categoria molto sottorappresentata. Gli alert richiedono una revisione, non una riclassificazione automatica.

### 9.3 Difficoltà vs qualità
Una carta con `solve_rate = 0.20` non è automaticamente una buona carta difficile: può essere ambigua, troppo di nicchia o mal formulata. Le revisioni distinguono **difficoltà desiderata** da **difetti editoriali**. La card review viene prioritaria se molti spettatori scrivono la stessa alternativa sbagliata ma ragionevole.

## 10. Progressione, riconoscimenti e UX
**Durante la partita**: punteggio squadra/25; barra di progresso; round e tempo; categoria e difficoltà attuale; «serie corretta ×2» se pertinente; ultimo vincitore mostrato senza esporre i cinque Taboo. Gli indovinelli non risolti possono mostrare la risposta **solo dopo** la loro chiusura.

**Intervalli**: risultati del round, numero di carte risolte, errori, 3 migliori indovini e titolo di categoria votata. Animazioni brevi, silenziabili e compatibili con l’accessibilità: non usare solo il colore per comunicare la difficoltà.

**Premi simbolici della serata:**
- **Miglior Indovino:** primo per vittorie individuali, con tie-break definiti.
- **Cacciatore di Rosse:** maggior numero di difficili vinte; pareggio ex aequo.
- **Prima Vittoria:** badge per chi trova la prima carta in quella partita; incentiva nuovi partecipanti.
- **Voce della Chat:** menzione per spettatore che ha partecipato ad almeno 3 round con almeno un messaggio distinto per round (badge di partecipazione, non punti competitivi; protezione anti-spam).
- **Squadra in Forma:** tre carte risolte consecutivamente in un round; feedback visivo del bonus collettivo.

**Progressione stagionale opzionale:** storico vittorie per 4 settimane; almeno una classifica «più carte vinte» e una «più round partecipati», senza convertire i tentativi in punti illimitati e senza premi monetari automatici. Consentire opt-out dalle classifiche pubbliche se necessario.

## 11. Architettura dati minima per il bot
```json
{
  "card_id": "A12",
  "revision": 3,
  "target": "SALUTO NON RICAMBIATO",
  "category_id": "A",
  "difficulty_initial": 3,
  "difficulty_current": 3,
  "taboo_words": ["ciao", "mano", "ignorare", "rispondere", "imbarazzo"],
  "accepted_answers": ["salutare chi non ti saluta", "saluto a vuoto"],
  "quality_score": null,
  "calibration": {"eligible_exposures": 0, "solve_rate": null, "median_solve_time_s": null},
  "status": "playtest"
}
```
**Schema di persistenza suggerito:** `cards` (versionamento carta), `accepted_answers`, `game_sessions`, `rounds`, `card_exposures`, `chat_winners`, `score_events`, `moderation_events`. La cronologia eventi deve permettere ricostruzione del punteggio e rettifiche senza riscrivere silenziosamente il passato. Gli alias sono propri di una versione della carta.

## 12. Roadmap e criteri di accettazione
**Fase 1 · Revisione editoriale:** caricare queste 62 schede, verificare cinque Taboo unici per ognuna, ortografia, unicità del bersaglio, qualità e alias. Le rinomine sostanziali richiedono nuovo `revision`. Nessuna nuova categoria fino al completamento.

**Fase 2 · Playtest controllato:** 10 partite standard come base di telemetria generale; rivedere in particolare le carte rinominate e i target umoristici non univoci. Non considerare calibrata una carta che è stata giocata una volta soltanto.

**Fase 3 · Bilanciamento:** misurare successo obiettivo, carte risolte per round, distribuzione dei primi vincitori, tempo per carta e ricorrenza Taboo; cambiare una regola per finestra di test e documentare l’effetto.

**Fase 4 · Espansione:** portare il mazzo **prima a 120**, poi a **180–200 carte** soltanto se la quota di carte approvate è alta. Proposta di nuove categorie: `G` Gaming & Rage Moments, `H` Tecnologia che ti tradisce, `I` Lavoro & Colleghi, `J` Situazioni assurde. Mantenere un mix indicativo di 30% facili / 45% medie / 25% difficili, aggiornandolo con dati reali.


### 12.1 Sedici carte candidate per le quattro categorie future
**Non fanno parte delle 62 carte revisionate**: sono esempi da selezionare e sottoporre a QA solo dopo i playtest della v3.0. Ogni set ha cinque parole vietate proposte.
| Categoria | Carta candidata | Diff. preliminare | Cinque Taboo proposti |
|---|---|:---:|---|
| G · Gaming | **PAD SCARICO** | 🟢 | Controller, Batteria, Pile, Spegnere, Pulsanti |
| G · Gaming | **SALVATAGGIO CORROTTO** | 🟡 | File, Progressi, Perdere, Caricamento, Partita |
| G · Gaming | **TUTORIAL INFINITO** | 🟡 | Comandi, Spiegazioni, Inizio, Saltare, Gioco |
| G · Gaming | **BOSS FINALE** | 🟢 | Nemico, Scontro, Ultimo, Difficile, Videogioco |
| H · Tecnologia | **CAPTCHA IMPOSSIBILE** | 🟡 | Semaforo, Robot, Immagini, Quadrati, Verifica |
| H · Tecnologia | **AGGIORNAMENTO FORZATO** | 🟡 | Computer, Riavviare, Installare, Sistema, Attesa |
| H · Tecnologia | **PASSWORD DIMENTICATA** | 🟢 | Accedere, Credenziali, Recupero, Email, Memoria |
| H · Tecnologia | **AUTOCORRETTORE TRADITORE** | 🔴 | Tastiera, Telefono, Messaggio, Correggere, Imbarazzo |
| I · Lavoro | **RIUNIONE INUTILE** | 🟡 | Colleghi, Agenda, Call, Tempo, Ufficio |
| I · Lavoro | **STAMPANTE IN SCIOPERO** | 🟡 | Carta, Inceppata, Toner, Ufficio, Stampare |
| I · Lavoro | **COLLEGA TUTTOFARE** | 🟡 | Aiutare, Mansione, Disponibile, Favori, Lavoro |
| I · Lavoro | **SCADENZA IMPOSSIBILE** | 🔴 | Progetto, Consegna, Domani, Tempo, Panico |
| J · Assurdità | **OMBRELLO AL CONTRARIO** | 🟡 | Vento, Pioggia, Stecche, Rovesciare, Temporale |
| J · Assurdità | **ASCENSORE IMBARAZZANTE** | 🟡 | Cabina, Silenzio, Piani, Sguardi, Vicino |
| J · Assurdità | **SVEGLIA NEL SOGNO** | 🔴 | Letto, Suonare, Mattina, Dormire, Finto |
| J · Assurdità | **BANANA NELLA TASCA** | 🟢 | Frutto, Pantaloni, Gialla, Schiacciare, Merenda |

**Prima di aggiungere una nuova carta:** testare bersaglio e cinque Taboo con 2–3 spiegazioni simulate indipendenti; confermare che non sia un duplicato semantico di una carta presente; assegnare alias conservativi; superare il punteggio editoriale minimo; entrare come `playtest`.

**Criteri di accettazione v3.0:**
1. Le 62 carte hanno un target unico, cinque divieti e un ID stabile.
2. Bot e overlay non rivelano la soluzione prima della chiusura della carta.
3. Cinque round da 90 s; la partita termina e somma punteggi in modo riproducibile.
4. Un primo vincitore massimo per carta **nella partita competitiva di una piattaforma**; eventi duplicati o tardivi non assegnano punti duplicati.
5. Skip e Taboo interrompono la serie; la penalità non viene addebitata due volte.
6. Jackpot e suggerimento cantato non si sommano e non modificano la classifica individuale.
7. Le modalità sperimentali non contaminano la calibrazione standard.
8. Le contestazioni sono tracciate con una rettifica esplicita e verificabile.

---
**Nota editoriale:** la proposta conserva il formato e le 62 idee di partenza della v2. Difficoltà, soglie di valutazione, punteggi bonus e nuovi target sono proposte progettuali da validare in diretta, non risultati di test già effettuati.

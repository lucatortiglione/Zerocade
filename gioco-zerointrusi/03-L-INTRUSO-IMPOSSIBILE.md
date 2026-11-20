# L'intruso impossibile — concept di gioco v0.1

**Data:** 19 novembre 2026  
**Stato:** bozza di brainstorming, da validare.  
**Destinazione:** giochi di parole per live con un solo schermo e una sola chat pubblica.  
**Durata:** 1–3 minuti.

## 1. Idea in una frase

In una matrice di termini apparentemente compatibili, la chat individua gli intrusi e scopre **la regola precisa** che rende alcune parole corrette e altre no.

## 2. Promessa di gioco

Il colpo di scena non consiste soltanto nello scoprire «la parola diversa», ma nel rendersi conto che la categoria intuita all'inizio era troppo generica o nascondeva una condizione più sottile.

**Ispirazioni:** rompicapi «trova l'intruso», deduzione categoriale di *Connections* e capacità di sintesi degli indizi tipica dei word party game. **Differenza proposta:** categoria che può emergere progressivamente, più intrusi e punteggio sia per l'individuazione sia per la regola.

## 3. Vincoli di prodotto

- Nessuna informazione segreta o ruolo personale.
- Ogni risposta è un messaggio nella chat visibile a tutti.
- Il bot determina il primo autore e tiene la classifica; la stessa parola non genera vincitori multipli per copia.
- Lo streamer può intervenire oppure lasciare svolgere la partita al bot.
- Il gioco è comprensibile anche a chi entra a metà partita.

## 4. Regole candidate

### Preparazione del round

- Mostrare **9 parole** numerate, senza indicare la categoria esatta.
- Un set editoriale nasconde **6 elementi conformi** a una regola, **3 intrusi** verificabili.
- Mostrare un indizio iniziale generale, abbastanza ampio da non banalizzare la soluzione.
- Le parole rimangono nella stessa posizione e non scompaiono quando rivendicate: sono marcate come scoperte.

### Risposte ammesse

- `!intruso 7` oppure semplicemente `7` se il contesto della chat lo permette.
- `!regola ...` per tentare di indovinare la condizione nascosta; per evitare falsi positivi, la verifica testuale automatica delle formulazioni libere **non è garantita** nella versione iniziale. Meglio prevedere un set di alias editoriali o una scelta finale tra 3 formulazioni mostrate a tutti.
- Le scelte errate producono feedback personale limitato per evitare spam a schermo.

### Progresso

1. Gli spettatori trovano gli intrusi.
2. Dopo il primo/secondo ritrovamento vengono sbloccati indizi sempre più specifici.
3. Completare tutti e tre gli intrusi sblocca un'ultima finestra per enunciare la regola.
4. Risultato comune + podio individuale.

## 5. Esempio illustrativo

Le parole mostrate sono:

`MERCURIO · VENERE · TERRA · MARTE · GIOVE · SATURNO · PLUTONE · CERERE · EUROPA`

**Regola nascosta:** «essere un pianeta del Sistema Solare secondo la classificazione attuale».

**Conformi:** MERCURIO, VENERE, TERRA, MARTE, GIOVE, SATURNO.  
**Intrusi:** PLUTONE (pianeta nano), CERERE (pianeta nano), EUROPA (satellite naturale di Giove).

Questo esempio è semplice e didattico. In produzione la difficoltà può nascere da falsi amici, omonimie, proprietà linguistiche ben definite o dettagli enciclopedici **solo se verificabili**. Non accettare esempi basati su opinioni o classificazioni contestabili.

## 6. Varianti interne

| Variante | Meccanica | Pregio | Criticità |
|---|---|---|---|
| Categorie semantiche | Parole appartenenti o meno a una categoria | Accessibile | Rischio banalità |
| Regola linguistica | Proprietà ortografica, morfologica, fonetica | Oggettiva se ben definita | Alcune regole sono poco intuitive |
| Doppia lettura | Sembra valere una categoria, ma la regola è più specifica | Effetto sorpresa | Rischio indovinello ingiusto |

**Prima raccomandazione:** alternare le tre famiglie, ma usare solo dataset con regola univoca e revisione umana.

## 7. Ritmo di partita: proposta da 120 secondi

| Fase | Tempo | Schermo e chat |
|---|---:|---|
| Avvio | 0–8 s | Matrice, timer, «TROVA I 3 INTRUSI» |
| Caccia | 8–75 s | Tentativi, claim, feedback |
| Indizio | 75–95 s | Si svela una caratteristica distintiva |
| Finale | 95–115 s | Si completa il set; eventuale indovinello sulla regola |
| Reveal | 115–120 s | Spiegazione, podio, prossimo round |

Il timer non deve scadere durante il reveal: gli ultimi 5 secondi sono riservati al riepilogo.

## 8. Punteggio iniziale (non definitivo)

- +20 al primo utente che scopre ciascun intruso.
- +30 al primo che indica la regola corretta, se la modalità «regola» è attiva e se il metodo di verifica è affidabile.
- +10 al partecipante che individua un intruso dopo un indizio avanzato, **solo se il primo claim non è ancora avvenuto**; per semplicità, si può applicare invece il normale +20.
- No penalità ai primi errori; limitazione per flood e tentativi ripetuti.
- Vittoria comune: tutti e tre gli intrusi trovati e, nella modalità estesa, regola scoperta.

**Principio:** tutte le quantità saranno ricalibrate usando telemetria reale, non assunte come definitive.

## 9. Ruolo dello streamer

- **Auto:** timer, indizi progressivi, classifiche e validazione sono eseguiti dal bot.
- **Regia attiva:** lo streamer può scegliere «categoria facile/difficile» prima del round, richiedere un indizio o proporre una spiegazione pubblica, senza cambiare dopo il fatto quali siano gli intrusi corretti.

## 10. Bozza d'interfaccia

```text
┌───────────────────────────────────────┐
│  L'INTRUSO IMPOSSIBILE     01:22      │
│  Trova i 3 termini fuori dalla regola │
│                                       │
│   [1] ...   [2] ...   [3] ...        │
│   [4] ...   [5] ...   [6] ...        │
│   [7] ...   [8] ...   [9] ...        │
│                                       │
│  Intrusi scoperti: 1 / 3             │
│  Ultimo claim: @utente  +20          │
│  Scrivi !intruso <numero>             │
└───────────────────────────────────────┘
```

## 11. Specifica dati proposta

```json
{
  "puzzle_id": "intr-demo-001",
  "title": "Il sistema solare",
  "words": ["mercurio", "venere", "terra", "marte", "giove", "saturno", "plutone", "cerere", "europa"],
  "intruder_indices_1_based": [7, 8, 9],
  "rule": "pianeti del Sistema Solare",
  "rule_aliases": ["pianeti", "sono pianeti"],
  "hints": ["Guarda la classificazione astronomica", "Non tutti orbitano intorno al Sole allo stesso modo"],
  "qa_status": "draft"
}
```

**Attenzione:** gli alias della regola devono essere verificati; parole generiche come `pianeti` potrebbero rivelarsi troppo permissive o ambiguamente corrette in altri puzzle.

## 12. Verifica di qualità

**Rifiutare** enigmi con:
- Due o più definizioni ragionevoli della regola che cambiano l'insieme degli intrusi.
- Fatti non verificabili, usi regionali non segnalati, grafie contestate.
- Troppe categorie specialistiche in sequenza o nessuna possibilità di deduzione graduale.
- Risposte che obbligano a interpretare giudizi morali, estetici o culturali come oggettivi.

**Test suggeriti:** almeno 10 utenti di prova per set, annotando `completion_rate`, `time_to_first_intruder`, `time_to_solve`, errori per parola e percentuale di persone capaci di spiegare la regola.

## 13. Rischi e contromisure

1. **Risposte copiate:** solo il primo claim per intruso dà punti.
2. **Round istantanei:** bloccare l'uso di termini troppo ovvi; QA sulla difficoltà.
3. **Errori del bot sulla regola libera:** alias curati, selezione guidata o fase manuale opzionale.
4. **Troppe persone sulla stessa risposta:** feedback aggregato e anti-flood.
5. **Esclusione dei nuovi spettatori:** istruzione persistente e puzzle leggibile fino al reveal.

## 14. Decisioni aperte

1. La regola segreta è da indovinare sempre o soltanto come bonus?
2. Quanti indizi temporizzati sono opportuni in 1–3 minuti?
3. Si ammettono anche intrusi grammaticali/ortografici o solo semantici?
4. Quanto deve essere «impossibile» senza risultare arbitrario?

## 15. Riferimenti

- NYT Connections — come funziona la deduzione di gruppi: https://thenewyorktimeshelpcenter.helpjuice.com/360011158491-New-York-Times-Games/28525912587924-Connections
- Just One — l'idea generale di indizi e regole verificabili per un word party game: https://cdn.svc.asmodee.net/production-rprod/storage/downloads/games/justone/US/jo-us01-rules-target-1611247435ApI80.pdf

**Prossimo passo Superpowers:** scegliere una variante e validare la regola prima della pianificazione tecnica.

# Word Association IT — Pacchetto v3.6.0

> **Revisione documentale — 16 novembre 2026.** Pacchetto storico v3.6.0. Gli esempi di comandi riflettono la disposizione originaria dei file; i validatori correnti sono in `../../script/` e gli estrattori storici in `../script/`. La procedura attuale parte dai bacini revisionati nel [README principale](../../README.md).
> [Indice e stato della documentazione](../../../docs/STATO_DOCUMENTAZIONE.md).

## Regola del gioco

**`prompt` è il contesto che il giocatore vede. `words` contiene sette risposte nascoste che il giocatore deve indovinare.** Il vecchio protocollo che ricostruiva il prompt dai sette indizi è superato e non è compatibile con questa versione.

Esempio illustrativo (NON certificato dal QA):

```csv
ref,source,language,prompt,words
c000000000000000000000001,platform,it,pizza,forno|mozzarella|pomodoro|impasto|lievito|basilico|margherita
```

## File

- `direttive_word_association_it_v3_6_0.md`: direttive complete, nuova meccanica e 172 macrocategorie.
- `validate_word_association_it_v3_6_0.py`: validatore autonomo con librerie standard; audit NLP facoltativo con risorse esterne.
- `test_word_association_it_v3_6_0.py`: test deterministici.
- `tassonomia_word_association_it_172_categorie_v3_6_0.csv`: catalogo compatibile di 172 categorie in 16 cluster, senza rinumerazione.

## Comandi

Eseguire nella cartella dei file:

```bash
python -m unittest -v test_word_association_it_v3_6_0.py
python validate_word_association_it_v3_6_0.py finale.csv --taxonomy-csv tassonomia_word_association_it_172_categorie_v3_6_0.csv --report-json audit.json
python validate_word_association_it_v3_6_0.py --candidates-jsonl candidati.jsonl --taxonomy-csv tassonomia_word_association_it_172_categorie_v3_6_0.csv --report-json candidati_audit.json
```

La modalità `--export-csv` crea un CSV **tecnicamente conforme**, non un dataset semanticamente approvato. Il gate `--release` richiede evidenze QA indipendenti. Per l'audit lessicale completo si devono fornire modello italiano spaCy e risorse morfologiche/frequenza/DF reali, indicate nella guida completa delle direttive.

**Nota:** i test deterministici non dimostrano che un giocatore reale possa indovinare ognuna delle sette risposte. Per questo sono necessarie prove indipendenti con il contesto visibile e le risposte nascoste.

## Revisione delle associazioni

La correzione semantica dell'8 novembre 2026 è descritta nei §§3.5–3.9 delle
direttive complete, nel protocollo del §3.10 e in [DIRETTIVA_INDIZI.md](../../DIRETTIVA_INDIZI.md). Ogni risposta
richiede una relazione concreta, una motivazione e una revisione indipendente:
la sola presenza nella definizione non la rende giocabile. Date, incisi,
locuzioni quantitative e verbi di servizio non devono riempire i set.
La familiarità si verifica sull'accezione scelta, conservando accenti e senso.
Per ogni risposta debole cercare un'alternativa mantenendo prompt e risposte
valide. Se necessario rigenerare sullo stesso prompt; senza soluzione mantenerlo
in revisione. Una sola risposta respinta o irrisolta mantiene il set `DA_RIVEDERE`.
Sono inclusi i casi MORTE, LIGHT, COSPLAY e PALATO: frammenti di definizioni,
esempi accessori e relazioni di altre accezioni non diventano risposte per estrazione.
GUFO e SPANDERE illustrano inoltre il divieto di privilegiare frequenze elevate,
spezzare locuzioni e usare descrittori generici del modo dell'azione.
SOTTOMARINO, ESPERTO e PONGO coprono verbi generici, contrari figurati e
relazioni di altre accezioni. COAGULAZIONE richiede di distinguere rapporto
tecnico da accessibilità e di controllare i lemmi (`ferita`, non `ferito`).

Questa è una correzione delle direttive: non certifica che il generatore o i
lotti esistenti abbiano già superato i nuovi controlli semantici.

## Aggiornamento dagli screenshot

Vedere l'[analisi dei 22 contesti](../../analisi_screenshot_word_association_20261108.md)
e i §§3.11–3.13: polarità della fonte, diversità dei contenuti, senso dominante,
qualità delle definizioni e confronto delle regressioni. SKATEBOARD non eredita
il manubrio da «senza manubrio»; IMPROVVISO non accumula varianti di inatteso.

Il contratto QA `word-association-semantic-2026-11-08.2` richiede controlli
individuali e del set realmente compilati, non sette motivazioni generiche.
La produzione ordinaria usa `--editorial-jsonl`; la vecchia estrazione richiede
`--lexical-proposals-only` esplicito e rimane una fonte di proposte non revisionate.
Senza selezioni sufficienti i prompt sono conservati in una coda; non si
esporta un lotto completato artificialmente. Formato e nomenclatura restano quelli richiesti.

## Distribuzione grammaticale flessibile

Il piano 70% nomi / 20% verbi / 10% aggettivi è orientativo. Se i verbi
disponibili non offrono sette risposte adatte, compensare con nomi o aggettivi;
sono ammessi anche lotti senza verbi. La carenza di verbi non blocca il lotto
e non giustifica associazioni forzate. Riportare sempre la distribuzione effettiva.
La modalità lessicale applica questa compensazione; quella editoriale usa
le selezioni documentate senza una quota obbligatoria di verbi;
`--strict-pos-quotas` resta una scelta opzionale di pianificazione.

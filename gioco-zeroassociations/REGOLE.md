# Regole in una pagina

Sintesi operativa delle [direttive complete](direttive_word_association_it_v3_6_0.md)
e della [direttiva di pertinenza](DIRETTIVA_INDIZI.md): in caso di dubbio valgono
quelle. Versione delle regole: `SEMANTIC_POLICY` in `semantic_rules.py`.

## Il prompt

- Un solo **senso familiare**, scelto prima delle risposte. Senza un tema visibile
  nel gioco, niente accezioni tecniche o rare.
- Parola italiana familiare (Zipf ≥ 3,0) oppure prestito della lista chiusa
  `resources/prompt_policy.json`.
- Categoria del catalogo coerente con il senso; non cambiarla per salvare un set.

## Ogni risposta

Una parola singola, minuscola, diversa dal prompt, che un giocatore direbbe
pensando al prompt **in quel senso**. Le sei verifiche del verbale:

| Verifica | Domanda |
|---|---|
| `same_sense` | È nello stesso senso del prompt? |
| `standalone` | Funziona da sola, senza ricostruire la frase di una fonte? |
| `natural` | È un'associazione naturale, non una verità tecnica poco accessibile? |
| `not_incidental` | Non viene da date, incisi, esempi, quantità o verbi di servizio? |
| `source_polarity` | Rispetta negazioni e ruoli («senza manubrio» non dà manubrio)? |
| `lemma_meaning_preserved` | Il lemma conserva il significato (`ferita`, non `ferito`)? |

Ogni risposta ha una motivazione propria e concreta: «è nella definizione» non basta.

## Il bacino

- La stessa risposta può appartenere a più prompt, anche nella stessa lista:
  ogni coppia prompt–risposta richiede una verifica e una motivazione proprie.
  Niente duplicati all'interno dello stesso bacino o della sua estrazione.
- Più risposte di quante ne servano (meglio 12–15): il gioco ne estrae 7 o 8 per round.
- Equivalenti nello stesso **gruppo di significato**, con limite 1 o 2 per round.
- Coppie che non devono uscire insieme tra i **conflitti**.
- Nessun riempitivo: senza abbastanza risposte valide il prompt resta in revisione.

## Dopo il gioco

`analyze_telemetry.py` segnala le parole mai trovate e le parole che la chat
scrive spesso. Sono indizi da rivedere con queste stesse regole, non
approvazioni: una parola nuova entra solo con un nuovo verbale (`import-reviewed`).

I casi studiati (MORTE, GUFO, COSPLAY e gli altri) sono nella tabella della
[direttiva di pertinenza](DIRETTIVA_INDIZI.md) e in `resources/semantic_regressions_it.jsonl`.

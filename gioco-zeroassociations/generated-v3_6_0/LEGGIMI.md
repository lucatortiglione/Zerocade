# Word Association IT v3.6.0 — lotto corrente 0003

## Revisione dell'8 novembre 2026

Sostituite **150 risposte in 33 set**, mantenendo tutti i **5.000 prompt** e
il loro ordine. La revisione comprende TERNA, RUGBY, ARIA, MORTE, LIGHT, COSPLAY,
PALATO, GUFO, SOTTOMARINO, ESPERTO, PONGO, COAGULAZIONE e 21 contesti alimentari.
SPANDERE appartiene ai lotti precedenti e non è stato aggiunto al lotto corrente.

**Correzione editoriale parziale, non dataset approvato.** Le altre 4.967 righe
non hanno ancora una selezione semantica editoriale documentata. Tutte le 5.000
richiedono il QA indipendente previsto. Non sono stati simulati giocatori,
revisori umani o punteggi di recuperabilità.

## File correnti

- [CSV di consegna](word_association_it_5000_candidati_0003.csv):
  intestazione `ref,source,language,prompt,words`, virgole, UTF-8 senza BOM,
  un record completo per riga. `ref` vuoto, `source` esistente conservato
  (`yours`), `it`, prompt MAIUSCOLO e sette risposte minuscole separate da `|`.
- [CSV tecnico](word_association_it_5000_gioco_0003.csv): stessi prompt e risposte,
  con ID interni, `source=platform` e prompt minuscolo.
- [Metadati](word_association_it_5000_metadati_0003.jsonl): accezioni, provenienza,
  motivazione per ciascuna risposta rielaborata e stato della selezione semantica.
- [Modifiche](revisioni_semantiche_0003.jsonl) e
  [versioni precedenti dei 33 candidati](archivio_prima_revisione_semantica_0003.jsonl).
- [Rapporto](rapporto_revisione_semantica_0003.json) e
  [coda di revisione di tutti i set](audit_semantico_0003.jsonl).

Le due copie CSV e i metadati sono sincronizzati. Le cinque riparazioni mirate
conservano il padre; le 28 rigenerazioni mantengono il prompt e documentano il
candidato precedente. TERNA usa ora il senso di insieme di tre elementi,
dichiarato nei metadati, anziché quello di macchina da cantiere. Posizioni
modificate, motivazioni e versioni precedenti sono registrate.

Le vecchie relazioni lessicali ereditate da una pagina del dizionario sono
segnalate come ambito non verificato. Il generatore è stato corretto per non
attribuirle automaticamente a un'accezione: il vecchio `source_sense_id` non ne
dimostrava l'appartenenza. I token delle definizioni restano proposte lessicali,
non associazioni approvate.

## Regole per il riesame rimanente

Seguire il [protocollo §3.10](../direttive_word_association_it_v3_6_0.md) e la
[direttiva di pertinenza](../DIRETTIVA_INDIZI.md). Per ogni risposta debole
cercare un'alternativa nello stesso senso, mantenendo il prompt e le risposte
valide. Non usare frammenti, locuzioni spezzate, sensi diversi o verbi generici
per completare i set. Senza alternative adeguate conservare il prompt in revisione.

La lista chiusa `common_loanwords` riguarda soltanto i prestiti stranieri.
I normali termini italiani seguono il filtro di familiarità. La politica non
contiene `excluded_prompts`; POS e frequenza non approvano le associazioni.
I verbi non sono obbligatori.

## Lotti precedenti

I file senza suffisso, 0001 e 0002 sono storici. Non sono stati riscritti né
promossi con questa revisione. Il lotto corrente conserva 4.040 nomi, 460 verbi,
500 aggettivi, 170 categorie e tutti i 16 cluster. Categorie e difficoltà restano
proposte da verificare. Non è stata creata una copia aggiuntiva `con_ordine`.

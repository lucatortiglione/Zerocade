# API Ninjas Trivia

> **Revisione documentale — 16 novembre 2026.** Le 56 domande `ani-…` della fonte risultano attive nel DB locale. L'importazione predefinita non attiva descritta sotto — una scelta di `fonti.py`, distinta dai dati pubblicati. Le condizioni riportate sono quelle registrate all'acquisizione e non sono state nuovamente verificate con il titolare.
> [Indice e stato della documentazione](../../../../docs/STATO_DOCUMENTAZIONE.md).

Fonte: https://api-ninjas.com/api/trivia (domanda + risposta, senza risposte sbagliate).

- Chiave gratuita: una domanda per richiesta da un insieme di 100. Termini: https://api-ninjas.com/terms
  (uso commerciale vietato sul piano gratuito; i dati non vanno redistribuiti).
- Le domande si importano **non attive**, come Trivia API. Vanno attivate solo se l'uso è coperto
  dal permesso del titolare.
- Le traduzioni italiane contengono 3 risposte sbagliate scritte da noi.
- La chiave non va mai messa in un file: si passa con la variabile d'ambiente APININJAS_KEY.

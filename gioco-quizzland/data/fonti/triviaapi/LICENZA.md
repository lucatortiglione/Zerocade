# Domande della categoria "curiosita" (The Trivia API)

> **Revisione documentale — 16 novembre 2026.** Le 8.000 domande `tta-…` risultano attive nel DB locale, diversamente dall'impostazione di importazione non attiva descritta sotto. L'attivazione tecnica non documenta l'acquisto di un piano o un permesso; le condizioni sotto restano quelle registrate all'acquisizione.
> [Indice e stato della documentazione](../../../../docs/STATO_DOCUMENTAZIONE.md).

Le domande con id `tta-…` vengono da **The Trivia API** (https://the-trivia-api.com).
Il sito le rilascia sotto licenza **Creative Commons Attribution-NonCommercial 4.0 International** (CC BY-NC 4.0):
https://creativecommons.org/licenses/by-nc/4.0/

- Sono gratuite **solo per uso non commerciale**. Una live con regali o altra monetizzazione è un uso commerciale: richiede l'abbonamento a pagamento (https://the-trivia-api.com/pricing/).
- Per questo `fonti.py` imposta l’importazione con `attiva = 0`. Si accendono quando c'è l'abbonamento, cambiando `attiva` di `triviaapi` in `script/fonti.py` e rigenerando il CSV.
- Il sito chiede di citare The Trivia API in un punto discreto dell'app.

Modifiche rispetto all'originale: domande e risposte tradotte dall'inglese all'italiano con Claude (Anthropic); le categorie della fonte sono riunite in `curiosita`.
Sono state scaricate solo le domande a scelta multipla testuale (`types=text_choice`), con `python script/fonti.py download triviaapi`.

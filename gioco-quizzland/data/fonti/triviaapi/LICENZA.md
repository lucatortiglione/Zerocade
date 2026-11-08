# Domande della categoria "curiosita" (non attive)

Le domande con id `tta-…` vengono da **The Trivia API** (https://the-trivia-api.com).
Il sito le rilascia sotto licenza **Creative Commons Attribution-NonCommercial 4.0 International** (CC BY-NC 4.0):
https://creativecommons.org/licenses/by-nc/4.0/

- Sono gratuite **solo per uso non commerciale**. Una live con regali o altra monetizzazione è un uso commerciale: richiede l'abbonamento a pagamento (https://the-trivia-api.com/pricing/).
- Per questo sono importate con `attiva = 0`. Si accendono quando c'è l'abbonamento, cambiando `attiva` di `triviaapi` in `tools/fonti.py` e rigenerando il CSV.
- Il sito chiede di citare The Trivia API in un punto discreto dell'app.

Modifiche rispetto all'originale: domande e risposte tradotte dall'inglese all'italiano con Claude (Anthropic); le categorie della fonte sono riunite in `curiosita`.
Sono state scaricate solo le domande a scelta multipla testuale (`types=text_choice`), con `python tools/fonti.py download triviaapi`.

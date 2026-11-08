# Domande della categoria "scienze" (non attive)

Le domande con id `obqa-…` vengono da **OpenBookQA** dell'Allen Institute for AI (AI2):
https://github.com/allenai/OpenBookQA · https://huggingface.co/datasets/allenai/openbookqa

Mihaylov, Clark, Khot, Sabharwal, "Can a Suit of Armor Conduct Electricity? A New Dataset for Open Book Question Answering", EMNLP 2018.

**La licenza del contenuto non è chiara.** Il repository del codice è Apache-2.0, ma la scheda del dataset indica la licenza come "unknown".
Per questo le domande sono importate con `attiva = 0`, finché la licenza non è chiarita, per esempio scrivendo ad AI2.
Si accendono cambiando `attiva` di `openbookqa` in `tools/fonti.py` e rigenerando il CSV.

Modifiche rispetto all'originale: domande e risposte tradotte automaticamente dall'inglese all'italiano con Google Translate il 6 novembre 2026, da sottoporre a revisione editoriale.
La fonte non indica la difficoltà, quindi tutte hanno difficoltà 2.
Molte domande sono frasi da completare con la risposta ("Il sole è responsabile di…"): la traduzione mantiene questa forma.

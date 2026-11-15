# 🌱 ZeroWords

Una ruota di lettere e uno schema a incastro: il pubblico scrive in chat le parole che riesce a formare con le
lettere della ruota, e ogni parola dello schema trovata si scrive al suo posto. Valgono anche le parole bonus,
cioè le parole italiane valide che non sono nello schema. I livelli non finiscono mai: il server li genera
durante la partita. A ogni capitolo il giardino dello sfondo cresce.

## Come nascono i livelli

Il generatore è nel server (`apps/server/src/wordgen`), non in questa cartella. Per ogni livello costruisce:

1. la ruota di lettere e le parole che se ne ricavano;
2. lo schema a incastro;
3. due varianti di difficoltà;
4. la parola segreta.

[ALGORITMO.md](ALGORITMO.md) lo descrive passo per passo, con tutti i parametri.

Con la «Difficoltà automatica» accesa, dopo due livelli andati allo stesso modo lo schema passa ad Agevolata,
Standard o Esperto: più facile se la chat ha avuto bisogno di molti aiuti, più difficile se ha trovato le parole
quasi da sola.

## I dati

Le parole stanno nello schema `parole` di [`database/giochi.sqlite3`](../database/README.md), copiate dai file di
questa cartella:

| File | Contenuto |
| --- | --- |
| `lexicon/it/words.tsv` | 185.540 parole italiane, da 4 a 10 lettere, con frequenza e fascia: `main` (può stare in uno schema) o `extra` (vale solo come bonus) |
| `lexicon/it/not_in_grid.txt` | Nomi, prestiti e interiezioni: al massimo bonus |
| `lexicon/blocklist_it.txt` | Le parole escluse del tutto |
| `tools/curve.json` | La curva di difficoltà, livello dopo livello |
| `data/chapters.json` | I capitoli con i loro sfondi (fuori da Git, lo scrive `make_backgrounds.py`) |

Dopo una modifica a uno di questi file si ricopia lo schema:

```
python database/script/giochi.py aggiorna parole
```

[`lexicon/it/SOURCE`](lexicon/it/SOURCE) indica fonti, versioni e licenze del lessico: Morph-it! (CC BY-SA 2.0 e
LGPL) e le frequenze di wordfreq (CC BY-SA 4.0).

## Strumenti

Dalla cartella `gioco-parole`:

| Comando | Cosa fa |
| --- | --- |
| `python script/build_lexicon.py morph-it_048.txt` | Ricostruisce `lexicon/it/words.tsv` (serve `pip install wordfreq`; il file di Morph-it! non è nel repository) |
| `python script/make_backgrounds.py` | Disegna gli sfondi dei capitoli (`assets/backgrounds/chapter_NN.svg`) e scrive `data/chapters.json` |
| `npm run wordgen -w @zerocade/server -- --write N` | Fa scrivere al generatore i livelli da 1 a N in `data/levels/it`, solo per controllarli |
| `python script/validate_levels.py` | Controlla quei livelli: schema connesso, parole valide e nella ruota, varianti, parola segreta |

## File

| Percorso | Contenuto |
| --- | --- |
| [`ALGORITMO.md`](ALGORITMO.md) | Come si costruisce ogni livello |
| [`TODO.md`](TODO.md) | Il piano del gioco e le decisioni prese |
| `assets/backgrounds/` | Gli sfondi dei capitoli (SVG 1080 × 1920); `assets/anteprima.html` li mostra tutti |
| `lexicon/` | Il lessico, con fonti e licenze |
| `script/` | Gli strumenti qui sopra |
| `tools/` | La curva di difficoltà (`curve.json`) |

## Nel codice

- Server: `apps/server/src/wordgen` (il generatore), `apps/server/src/incastro.ts` (la partita) e
  `apps/server/src/nasa.ts` (lo sfondo «NASA»: le foto «Image of the Day»).
- Overlay: `apps/overlay/src/Incastro.tsx`.

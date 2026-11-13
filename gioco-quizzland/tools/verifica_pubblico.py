"""Screen the complete question DB for an Italian general audience, without changing it.

Usage: python gioco-quizzland/tools/verifica_pubblico.py
Writes data/domande-escluse.json and data/REVISIONE-DOMANDE.md.
This is an editorial screening, not a factual verification of every answer.
"""
import collections
import datetime
import hashlib
import json
from pathlib import Path
import re
import sqlite3

import domande
import fonti

ROOT = Path(domande.ROOT)
OUT = ROOT / "data" / "domande-escluse.json"
REPORT = ROOT / "data" / "REVISIONE-DOMANDE.md"

# Patterns are deliberately scoped: an English proper name, an international film,
# a historical war or a scientific description of reproduction is not in itself
# unsuitable. Both the original and its translation are examined.
RULES = [
    ("lingua_inglese", "Richiede lessico, ortografia o giochi di parole inglesi.", "question",
     r"\bin (?:the )?english(?: language)?\b|\benglish (?:word|term|alphabet|spelling|spelled|spelt)\b|"
     r"\b(?:rhymes? with|homophones?|spelt|spelled|spelling|scrabble)\b|"
     r"\b(?:in inglese|alfabeto inglese|parol[ae] ingles[ei]|lingua inglese|anagramma inglese|acronimo inglese|filastrocca inglese|detto inglese)\b|"
     r"\b(?:American English|British English|nursery rhyme|limerick|Cockney)\b"),
    ("doppiaggio_non_italiano", "Chiede doppiatori della versione inglese, non di quella italiana.", "question",
     r"\b(?:english (?:dub|voice)|dubbed english|english.language (?:dub|voice)|doppiaggio (?:inglese|americano)|versione inglese.*doppi|doppiator\w* ingles\w*|voce originale|doppiator\w* original\w*|doppi\w* in originale)"),
    ("contesto_locale", "Trivia su sport, TV o ricorrenze locali angloamericane poco accessibili a un pubblico italiano generalista.", "question",
     r"\b(?:NFL|MLB|NHL|NCAA|Super Bowls?|World Series|NASCAR|CFL|AFL|WNBA|"
     r"EastEnders|Coronation Street|Jeopardy|Double Your Money|Blue Peter|"
     r"Emmerdale|Hollyoaks|Countdown|University Challenge|The Chase|Pointless|"
     r"Groundhog Day|Memorial Day|Labou?r Day|Boxing Day|Bank Holiday|giorno della marmotta|Major League Baseball|Stanley Cup)\b|"
     r"\bsquadra di (?:football americano|baseball|hockey su ghiaccio)\b.{0,40}\b(?:sede|proviene|città)\b|"
     r"^(?:Hockey|Baseball|Football americano):"),
    ("geografia_locale", "Capoluoghi, soprannomi, simboli o dettagli amministrativi di stati e province nordamericani; richiede cultura locale.", "question",
     r"\b(?:state (?:capital|bird|flower|flag|motto|song)|capital of (?:the (?:US|U.S.) state|the state of)|"
     r"capitale (?:dello stato|di stato|della provincia)|capoluogo (?:dello stato|della provincia))\b|"
     r"\b(?:stato americano|stati americani|US state|U.S. state)\b.{0,65}\b(?:soprannom\w*|nicknam\w*|bandiera|flag|canzone ufficiale|festa legale|47°|20°)\b|"
     r"\b(?:soprannom\w*|nicknam\w*|bandiera|flag)\b.{0,65}\b(?:stato americano|US state|U.S. state)\b"),
    ("istituzioni_locali", "Richiede dettagli di istituzioni, norme o monete locali estere; serve una selezione o un adattamento per l'Italia.", "question",
     r"\b(?:US|U\.?S\.?|United States|American|British|UK|U\.?K\.?|britannic\w*|statunitens\w*|americani)\b.{0,90}"
     r"\b(?:amendment|constitution|senat\w*|congress\w*|supreme court|monarch|prime minister|election|federal|parliament|governor|dollar bill|banknote|monet\w*|banconot\w*|emendament\w*|costituzion\w*)\b|"
     r"\b(?:amendment|senat\w*|congress\w*|supreme court|parliament|governor|emendament\w*|costituzion\w*)\b.{0,90}"
     r"\b(?:US|U\.?S\.?|United States|British|UK|britannic\w*|Stati Uniti)\b|"
     r"\b(?:pennies|state quarters?|electoral college|Collegio elettorale|House of Commons|House of Lords)\b|"
     r"\b(?:dimes?|nickels?)\b.{0,40}\b(?:dollars?|cents?|worth)\b|\b(?:dollars?|cents?|worth)\b.{0,40}\b(?:dimes?|nickels?)\b"),
    ("unita_non_localizzate", "Il testo italiano richiede misure imperiali o Fahrenheit senza una localizzazione metrica.", "italian",
     r"\b(?:Fahrenheit|galloni?|iarde?|pollici|libbre|mph)\b|\b(?:\d+(?:[.,]\d+)?|quante|trenta|venti|dieci)\s*(?:once|feet|inches|yards?|gallons?|pounds?|ounces?)\b"),
    ("supporto_assente", "La domanda rimanda a un'immagine, tabella, grafico o testo non fornito nel quiz.", "italian",
     r"\b(?:following|below|above) (?:diagram|table|graph|picture|figure|illustration|map|passage)\b|"
     r"\b(?:diagram|table|graph|picture|figure|illustration|map|passage) (?:below|above|shown|provided)\b|"
     r"\b(?:shown|pictured|illustrated) (?:below|above|in the (?:diagram|figure|picture|graph))\b|"
     r"\b(?:figura|tabella|immagine|mappa|diagramma|grafico|brano) (?:seguente|sottostante|sopra|qui sotto|riportat[oa])\b"),
    ("opzioni_dipendenti", "Le opzioni dipendono da lettere o posizioni che cambiano quando il gioco le mescola.", "answers",
     r"\b(?:tutt[ei] (?:le|i) (?:precedenti|sopracitat\w*)|nessun[oa] (?:delle|dei) precedenti|all of the above|none of the above|both [a-d] and [a-d]|[a-d] e [a-d])\b"),
    ("sessuale_esplicito", "Contenuti sessuali espliciti, pornografia o turpiloquio: inadatti a una live generalista.", "all",
     r"\b(?:porn\w*|hentai|orgasm\w*|masturb\w*|fuck\w*|cunt|nigger\w*|faggot\w*|"
     r"prostitut\w*|raped|rapist|stupro|stupr\w*|incest(?:o|uous)?|fellatio|fellazio\w*|"
     r"sesso (?:orale|anale)|anal sex|sexual intercourse|piacere sessuale|oscenità feticista|sex toy|dildo|bestiality)\b"),
    ("droghe", "La domanda o le risposte vertono su sostanze stupefacenti o loro consumo.", "all",
     r"\b(?:cocaine|cocaina|heroin|eroina|LSD|methamphetamine|metanfetamin\w*|marijuana|cannabis|MDMA|ecstasy|hashish|oppio|opium)\b"),
    ("violenza_tragedie", "Violenza, suicidio, esecuzioni o dettagli di morti: esclusione editoriale per una live generalista.", "italian",
     r"\b(?:serial killer|assassino seriale|suicide|suicid\w*|raped|rapist|stupro|stupr\w*|"
     r"massacr\w*|genocid\w*|behead\w*|decapitat\w*|executed|execution|giustiziat\w*|"
     r"pena di morte|death penalty|cause of (?:\w+['’]s )?death|causa della morte|overdose|"
     r"ucciso a colpi|si tolse la vita|decapitazion\w*|shot dead|shot and killed|Holocaust|Olocausto|concentration camp|camp[oi] di (?:sterminio|concentramento))\b"),
    ("stereotipo", "Generalizzazione su gruppi di persone o aspetto fisico, poco adatta al tono del quiz.", "question",
     r"\bon average.{0,30}women.{0,40}men\b|\bin media (?:una donna|le donne).{0,50}(?:un uomo|gli uomini)\b"),
    ("violenza_esplicita", "Il testo o le alternative descrivono tortura, aggressioni o violenza esplicita.", "all",
     r"\b(?:strument[oi] di tortura|tortura|psicopatici armati|accoltellamento|accoltellat\w*|staccò a morsi|braccio della morte|piacere sessuale)\b"),
]
COMPILED = [(code, reason, scope, re.compile(pattern, re.I)) for code, reason, scope, pattern in RULES]

# Specific editorial decisions and exceptions are added after reviewing candidates.
MANUAL = {
    "q004": [("ambiguita", "La metà di 2 + 2 ammette due letture: (2 + 2) : 2 oppure 2 : 2 + 2. Anche la guida del progetto la segnala come ambigua.")],
}
EXCEPTIONS = {
    "otdb-95c4ab87b4": {"unita_non_localizzate": "Fahrenheit 451 è il titolo di un romanzo, non una misura da convertire."},
    "otdb-f99623b878": {"violenza_tragedie": "Suicide Squad è un titolo: la domanda chiede il cast."},
    "otdb-69bc65b27b": {"violenza_tragedie": "Suicide Squad è un titolo: la domanda chiede la colonna sonora."},
    "tta-622a1c377cc59eab6f9505c2": {"violenza_tragedie": "Suicide Squad è un titolo: la domanda chiede un attore."},
    "otdb-760a273646": {"droghe": "Eroina significa protagonista femminile."},
    "otdb-cb469aa127": {"droghe": "Eroina significa personaggio femminile giocabile."},
    "tta-622a1c347cc59eab6f94fba0": {"droghe": "Ecstasy nel verso della canzone indica estasi; resta la dipendenza dall'inglese."},
    "tta-622a1c357cc59eab6f94fd14": {"droghe": "È una citazione filosofica metaforica; resta la dipendenza dall'inglese."},
    "tta-622a1c3d7cc59eab6f951bb8": {"droghe": "La guerra dell'oppio è un evento storico, non una domanda sul consumo."},
    "tta-622a1c3c7cc59eab6f951979": {"droghe": "Botanica: un distrattore cita una pianta, senza consumo o istruzioni."},
    "tta-64e6536e0b79e5bedd54950d": {"droghe": "Storia scientifica degli anestetici: contesto medico neutro."},
    "tta-65056e407a97013de78b52a0": {"droghe": "Composizione del tabacco: informazione neutra, senza promozione del consumo."},
    "otdb-d39f28408c": {"droghe": "Botanica: domanda scientifica, senza consumo o istruzioni."},
    "otdb-c2c42a1723": {"istituzioni_locali": "Guglielmo d'Orange è un riferimento di storia europea."},
    "otdb-e69b1c2e87": {"istituzioni_locali": "Contesto della seconda guerra mondiale, di interesse internazionale."},
    "otdb-6603042ec2": {"istituzioni_locali": "Contesto della seconda guerra mondiale, di interesse internazionale."},
    "otdb-37740d18a7": {"istituzioni_locali": "Elezione di Obama: cultura internazionale, senza dettagli delle regole elettorali."},
    "tta-622a1c367cc59eab6f950350": {"istituzioni_locali": "Contesto della seconda guerra mondiale, di interesse internazionale."},
    "tta-63a039bcc7d86251f9b65caa": {"istituzioni_locali": "Churchill durante la seconda guerra mondiale: cultura internazionale."},
    "tta-65056f147a97013de78b53c8": {"istituzioni_locali": "Nobel per la letteratura: riconoscimento internazionale."},
    "tta-63b0587e4799123c67712f42": {"istituzioni_locali": "Buckingham Palace è un monumento noto internazionalmente."},
    "tta-6384b44183dddfb71ee5e36a": {"contesto_locale": "Identifica lo sport, senza chiedere statistiche locali."},
    "tta-622a1c3c7cc59eab6f9517ef": {"contesto_locale": "Storica pubblicità Apple: cultura informatica internazionale."},
    "otdb-21f7d9d946": {"contesto_locale": "Marchio di pneumatici internazionale, il riferimento NASCAR è accessorio."},
    "tta-625fd744dc0dd3b72da64d2f": {"contesto_locale": "Groundhog Day è un titolo di film, non una domanda sulla ricorrenza."},
    "arc-Mercury_SC_402170": {"unita_non_localizzate": "Chiede il tipo di rappresentazione dei dati, non una conversione."},
    "arc-FCAT_2008_5_5": {"unita_non_localizzate": "La temperatura è già indicata anche in Celsius."},
    "otdb-0ff39d4f19": {"violenza_tragedie": "Rape è il plurale italiano dell'ortaggio."},
}

# Artworks and non-graphic historical events are not excluded just for their titles
# or because an event involved violence. Specific details of executions remain out.
for _qid in """
tta-622a1c347cc59eab6f94fa00 tta-622a1c347cc59eab6f94fa26
tta-622a1c347cc59eab6f94fa31 tta-622a1c347cc59eab6f94fa53
otdb-e4ce670ae0 tta-622a1c3c7cc59eab6f951a08
tta-622a1c3c7cc59eab6f951b0c tta-62611f524b176d54800e3d51
tta-62611f594b176d54800e3d53 tta-639895775c9a75021f310458
""".split():
    EXCEPTIONS.setdefault(_qid, {})["violenza_tragedie"] = "Storia o storia dell'arte, senza descrizioni grafiche o dettagli di esecuzioni."


def manual_group(ids, code, reason):
    for qid in ids.split():
        MANUAL.setdefault(qid, []).append((code, reason))


manual_group("""
otdb-013c3e0a41 otdb-816bc820a8 otdb-a7c26b42d0 otdb-aa68fc4bca
otdb-e577cd0c63 otdb-ef313bf98e otdb-16a279fa1e otdb-e95168f0e5
otdb-60ee2cb1cb otdb-8b7119b047 otdb-75633eaf54 otdb-8ece4a482b
otdb-df3c16311a otdb-2212be44d6 otdb-4f074828cc otdb-570f33e2b3
otdb-5f048d40ee otdb-6b2e2a3789 otdb-7e77c7ef59 otdb-92d83dd176
otdb-9e33d9da9b otdb-d3ee348f51
""", "doppiaggio_non_italiano", "Richiede attori vocali di edizioni estere; per il pubblico italiano va adattata all'edizione locale.")

manual_group("""
otdb-27a83b90ae otdb-574cc369cf otdb-eb6051153e tta-64746b075a4c31088dd9d017
tta-622a1c367cc59eab6f9501ae tta-6463394601d576cfac3aa32b
""", "lingua_inglese", "La soluzione dipende da una sigla, una citazione, un testo o un modo di dire inglese non localizzato.")

manual_group("""
otdb-f3b05255e6 otdb-670ea88c9f otdb-f811693ff5 otdb-cb8b4c15ac
otdb-0ed0954dd7 otdb-258c29df1b otdb-6749937ab8 otdb-a5b1d98841
otdb-e457375942 otdb-f7c62421aa otdb-fcc35ab47e
tta-622a1c367cc59eab6f950219 tta-622a1c367cc59eab6f950397
tta-622a1c3b7cc59eab6f95173a tta-622a1c3d7cc59eab6f951bb3
tta-64746b3e5a4c31088dd9d03e tta-645cb16b7d263fd5097043c9
tta-622a1c367cc59eab6f950098 tta-622a1c367cc59eab6f9500af
tta-645b431a067ef798d145507c tta-646262c1ab138b829b81ea5a
tta-6477bad7550bc819ad646b41 tta-6477bb70550bc819ad646b8f
tta-64879d54a754bb6010f8b041 tta-64f3a941601ffca0b7615dd7
tta-65056e687a97013de78b52d7 tta-6ae03f923f3b0b676f6e9a8c
""", "contesto_locale", "Dettaglio di TV, politica amministrativa o sport locale angloamericano, senza un riferimento italiano o internazionale sufficiente.")

manual_group("""
otdb-31db227570 otdb-6c2db371b9 otdb-8235049105 otdb-97f3d69b6f
tta-622a1c367cc59eab6f9503b3 tta-622a1c357cc59eab6f94fd80
tta-622a1c367cc59eab6f950323 tta-63e13a2a106de6ffa7d4a7a8
tta-63e13a2f106de6ffa7d4a7ae otdb-69f4475ee7 otdb-288aafb273
""", "violenza_tragedie", "La domanda è centrata su cronaca nera, morti violente o statistiche di uccisioni, poco adatte al tono di una live generalista.")

manual_group("otdb-0f4d16fcc6 otdb-97f3d69b6f", "offensivo", "Presenza di un'espressione dispregiativa o di una risposta caricaturale riferita a nazionalità o gruppi di persone.")
manual_group("otdb-c80e0c5319 otdb-15fe201e61", "sessuale_esplicito", "Trivia con protagonisti della pornografia, estranea al pubblico generalista previsto.")
manual_group("obqa-996", "violenza_tragedie", "La domanda tratta relazioni violente e abusi, senza un contesto adatto al quiz scientifico.")
manual_group("obqa-7-167", "comportamento_rischioso", "Presenta l'inalazione di elio come espediente per cambiare voce: esempio facilmente imitabile da non proporre nel quiz.")

manual_group("""
obqa-10-322 obqa-11-288 obqa-14-778 obqa-13-551 obqa-10-727
obqa-10-746 obqa-11-632 obqa-1176 obqa-12-23 obqa-12-745
obqa-12-959 obqa-13-746 obqa-14-670 obqa-1895 obqa-1202
obqa-1596 obqa-7-452 obqa-12-779 obqa-14-836
""", "traduzione", "Traduzione non comprensibile o alterata: termini, costruzione o riferimenti non rendono correttamente il testo originale. Richiede riscrittura prima dell'uso.")
manual_group("tta-622a1c397cc59eab6f950ce3", "traduzione", "Nel titolo della canzone è rimasto il frammento inglese 'the theme tune to the film': testo non localizzato e punteggiatura corrotta.")
manual_group("obqa-12 obqa-12-299 obqa-13-13", "traduzione", "Le opzioni hanno forme grammaticali incoerenti o parole che non completano correttamente il testo italiano.")


def examine(q, original):
    italian = q["domanda"]
    english = original.get("domanda", "")
    scopes = {
        "italian": italian,
        "question": italian + "\n" + english,
        "answers": "\n".join(q["opzioni"]),
        "all": "\n".join([italian, *q["opzioni"]]),
    }
    found = []
    for code, reason, scope, pattern in COMPILED:
        match = pattern.search(scopes[scope])
        if match and code not in EXCEPTIONS.get(q["id"], []):
            found.append({"criterio": code, "motivo": reason, "evidenza": match.group()})
    for code, reason in MANUAL.get(q["id"], []):
        found.append({"criterio": code, "motivo": reason, "evidenza": "Valutazione editoriale del testo e delle opzioni"})
    problems = domande.problems_of(q)
    if problems:
        found.append({"criterio": "struttura", "motivo": "; ".join(problems), "evidenza": "Controllo delle opzioni"})
    return found


def main():
    questions = domande.load()
    originals = {}
    source_of = {}
    for source in fonti.SOURCES:
        if not Path(fonti.raw_path(source)).exists():
            continue
        for q in fonti.raw(source):
            originals[q["id"]] = q
            source_of[q["id"]] = source
    excluded = []
    for q in questions:
        original = originals.get(q["id"], {})
        reasons = examine(q, original)
        if not reasons:
            continue
        excluded.append({
            "id": q["id"], "fonte": source_of.get(q["id"], "originale"),
            "categoria": q["categoria"], "difficolta": q["difficolta"],
            "domanda": q["domanda"], "opzioni": q["opzioni"],
            "risposta_corretta": q["opzioni"][q["giusta"]] if q["giusta"] is not None else None,
            "spiegazione": q["spiegazione"], "attiva_nel_db": int(q["attiva"]),
            "domanda_originale": original.get("domanda"),
            "opzioni_originali": [original["giusta"], *original["sbagliate"]] if original else [],
            "esito": "esclusione_proposta", "motivi": reasons,
        })
    counts = collections.Counter(r["criterio"] for q in excluded for r in q["motivi"])
    by_source = collections.Counter(q["fonte"] for q in excluded)
    totals = collections.Counter(source_of.get(q["id"], "originale") for q in questions)
    # A content fingerprint lets a later run establish whether the catalog changed.
    fingerprint = hashlib.sha256(json.dumps(questions, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    metadata = {
        "versione": 1, "data": datetime.date(2026, 11, 6).isoformat(),
        "ambito": "Tutte le domande presenti nello schema quizz di database/giochi.sqlite3, incluse quelle precedentemente non attive. I record già omessi dalle fonti con traduzione [] non sono nel DB e non rientrano in questa revisione.",
        "metodo": "Screening automatico di ogni domanda, opzione e originale disponibile; regole trasparenti e decisioni editoriali esplicite nel programma tools/verifica_pubblico.py.",
        "limiti": "Non costituisce lettura editoriale individuale né verifica fattuale completa di tutte le risposte. Le traduzioni poco naturali non sono tutte riconoscibili con regole; assenza dall'elenco non certifica correttezza o idoneità.",
        "stato_db": f"Domande attive: {sum(q['attiva'] for q in questions)} su {len(questions)}. Questo elenco propone esclusioni e non modifica il database; per la revisione delle risposte vedere REVISIONE-RISPOSTE.md.",
        "impronta_catalogo_sha256": fingerprint,
        "domande_analizzate": len(questions), "domande_attive": sum(q["attiva"] for q in questions),
        "esclusioni_proposte": len(excluded), "conteggi_criteri": dict(sorted(counts.items())),
        "conteggi_fonti": {s: {"analizzate": totals[s], "esclusioni_proposte": by_source[s]} for s in sorted(totals)},
        "domande": excluded,
    }
    OUT.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    lines = [
        "# Revisione delle domande per un pubblico italiano", "", "Data: 6 novembre 2026.", "",
        f"Analizzate **{len(questions):,} domande**; **{len(excluded):,} esclusioni proposte**. Nel DB sono attive **{sum(q['attiva'] for q in questions):,} domande** su **{len(questions):,}**.", "",
        "Il file `domande-escluse.json` contiene ID, testo, tutte le opzioni, risposta corretta, originale inglese e motivi. È un elenco di esclusioni proposte: la revisione non disattiva né cancella record.", "",
        "## Criteri", "",
        "Si segnalano dipendenze dalla lingua inglese e dal doppiaggio estero, trivia locali USA/UK, unità non localizzate, riferimenti a supporti assenti, opzioni legate alla posizione, contenuti espliciti, droghe, cronaca violenta e ambiguità evidenti.", "",
        "Si mantengono cultura internazionale, opere e personaggi noti, storia e geografia estere, anatomia e riproduzione trattate scientificamente. Un nome straniero o una citazione del corpo umano non bastano a escludere una domanda.", "",
        "| Criterio | Segnalazioni |", "| --- | ---: |",
        *[f"| {code} | {n} |" for code, n in sorted(counts.items())], "",
        "Una domanda può avere più motivi: la somma delle segnalazioni può superare le esclusioni proposte.", "",
        "| Fonte | Domande analizzate | Esclusioni proposte |", "| --- | ---: | ---: |",
        *[f"| {s} | {totals[s]} | {by_source[s]} |" for s in sorted(totals)], "",
        "## Metodo e limiti", "", metadata["metodo"], "", metadata["limiti"], "", metadata["ambito"], "",
        "Le impostazioni di attivazione non risolvono i vincoli di licenza descritti nei file LICENZA.md delle fonti.", "",
        "Per rigenerare l'elenco: `python gioco-quizzland/tools/verifica_pubblico.py`. Il programma legge il DB senza modificarlo.", "",
        "## Elenco sintetico", "", "Il JSON conserva anche tutte le risposte e il dettaglio dei motivi.", "",
        "| ID | Domanda | Motivi |", "| --- | --- | --- |",
    ]
    for q in excluded:
        text = q["domanda"].replace("|", "\\|").replace("\n", " ")
        codes = ", ".join(r["criterio"] for r in q["motivi"])
        lines.append(f"| {q['id']} | {text} | {codes} |")
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps({"analizzate": len(questions), "proposte": len(excluded), "criteri": counts}, ensure_ascii=False))


if __name__ == "__main__":
    main()

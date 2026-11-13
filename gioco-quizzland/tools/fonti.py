"""Questions from open sources in ZeroQuizz, translated into Italian.

Usage:
  python tools/fonti.py download FONTE       the source's questions -> data/fonti/FONTE/FONTE-en.json
  python tools/fonti.py todo FONTE [N]       the next N questions without a translation, one per line
  python tools/fonti.py nuove [FONTE]        how many questions the source has now against the ones we
                                             hold: one light request, nothing downloaded
  python tools/fonti.py csv domande.csv      the questions of the schema quizz that come from no
                                             source, then every translated one: a CSV for
                                             domande.py import

Sources (FONTE), each with its category, whether its questions play (attiva) and its licence in
data/fonti/FONTE/LICENZA.md:
  opentdb     Open Trivia Database, CC BY-SA 4.0                  cultura     attive
  triviaapi   The Trivia API, CC BY-NC 4.0: not for monetised     curiosita   non attive
              lives without its paid plan
  openbookqa  OpenBookQA (AI2), content licence unknown           scienze     non attive
  arc         AI2 Reasoning Challenge (ARC), CC BY-SA 4.0         scienze     attive
  apininjas   API Ninjas Trivia, free key: personal use only      curiosita   non attive
              (key in the APININJAS_KEY environment variable, never in a file; the API gives
              question + answer only, so a translation carries 3 wrong answers of our own)

Translations live in data/fonti/FONTE/it/*.json: {id: [domanda, giusta, sbagliata, ...]} for
multiple choice, {id: [domanda]} for true/false (Vero/Falso). Ids keep the source's prefix and are
the same at every download, as domande.py asks.
"""
import csv
import glob
import hashlib
import json
import os
import random
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import domande  # noqa: E402

DATA = os.path.join(ROOT, "data", "fonti")
HEADERS = {"User-Agent": "Zerocade question import"}
DIFFICULTY = {"easy": 1, "medium": 2, "hard": 3}
SOURCES = {
    "opentdb": {"prefix": "otdb-", "categoria": "cultura", "attiva": 1},
    "triviaapi": {"prefix": "tta-", "categoria": "curiosita", "attiva": 0},
    "openbookqa": {"prefix": "obqa-", "categoria": "scienze", "attiva": 0},
    "arc": {"prefix": "arc-", "categoria": "scienze", "attiva": 1},
    "apininjas": {"prefix": "ani-", "categoria": "curiosita", "attiva": 0},
}


def get(url):
    # Too many requests (429) or a server error: wait longer each time, then give up.
    for wait in (5, 15, 30, 60, 120, 0):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=30) as res:
                return json.load(res)
        except urllib.error.HTTPError as e:
            if not wait or (e.code != 429 and e.code < 500):
                raise
            print(f"! HTTP {e.code}, riprovo tra {wait} s", flush=True)
            time.sleep(wait)


def raw_path(source):
    return os.path.join(DATA, source, f"{source}-en.json")


def save(source, questions):
    os.makedirs(os.path.join(DATA, source), exist_ok=True)
    with open(raw_path(source), "w", encoding="utf-8") as fh:
        json.dump(sorted(questions, key=lambda q: (q["fonte_categoria"], q["id"])), fh, ensure_ascii=False, indent=1)
    print(f"{len(questions)} domande -> {raw_path(source)}")


# Every source is saved as: {id, fonte_categoria, tipo (M or VF), difficolta (1-3), domanda,
# giusta, sbagliate}.


def download_opentdb():
    # A session token never returns the same question twice and answers code 4 once every
    # question has been given. One request every 5 seconds, 50 questions at most.
    api = "https://opentdb.com"
    token = get(f"{api}/api_token.php?command=request")["token"]
    out, amount = {}, 50
    while True:
        time.sleep(5.2)
        data = get(f"{api}/api.php?amount={amount}&token={token}&encode=url3986")
        code = data["response_code"]
        if code == 5:  # too many requests
            time.sleep(10)
            continue
        if code == 1 and amount > 1:  # fewer than `amount` left
            amount = max(1, amount // 2)
            continue
        if code in (1, 4):
            break
        if code != 0:
            sys.exit(f"Open Trivia: response_code {code}")
        for item in data["results"]:
            q = {k: urllib.parse.unquote(v) if isinstance(v, str) else [urllib.parse.unquote(x) for x in v] for k, v in item.items()}
            qid = "otdb-" + hashlib.sha1(f"{q['question']}\n{q['correct_answer']}".encode("utf-8")).hexdigest()[:10]
            out[qid] = {
                "id": qid,
                "fonte_categoria": q["category"],
                "tipo": "VF" if q["type"] == "boolean" else "M",
                "difficolta": DIFFICULTY[q["difficulty"]],
                "domanda": q["question"],
                "giusta": q["correct_answer"],
                "sbagliate": q["incorrect_answers"],
            }
        print(f"{len(out)} domande", flush=True)
    save("opentdb", out.values())


def download_triviaapi():
    # Without a key the API returns random questions (sessions need one): requests go on until
    # every text question counted by /v2/metadata has come, or none new comes for a long while.
    # One request a second, well under the 20 every 5 seconds it allows.
    api = "https://the-trivia-api.com/v2"
    total = get(f"{api}/metadata")["byType"]["text_choice"]
    out, idle = {}, 0
    while len(out) < total and idle < 300:
        time.sleep(1)
        try:
            batch = get(f"{api}/questions?limit=50&types=text_choice")
        except Exception as e:  # 429 or a network hiccup: wait and go on
            print(f"! {e}", flush=True)
            time.sleep(10)
            continue
        before = len(out)
        for q in batch:
            qid = "tta-" + q["id"]
            out[qid] = {
                "id": qid,
                "fonte_categoria": q["category"],
                "tipo": "M",
                "difficolta": DIFFICULTY.get(q["difficulty"], 2),
                "domanda": q["question"]["text"],
                "giusta": q["correctAnswer"],
                "sbagliate": q["incorrectAnswers"],
            }
        idle = 0 if len(out) > before else idle + 1
        if len(out) // 500 != before // 500:
            print(f"{len(out)}/{total} domande", flush=True)
    save("triviaapi", out.values())


def download_openbookqa():
    # Hugging Face's dataset server, 100 rows a request. No difficulty in the source: 2.
    api = "https://datasets-server.huggingface.co/rows?dataset=allenai/openbookqa&config=main"
    out = {}
    for split in ("train", "validation", "test"):
        offset = 0
        while True:
            data = get(f"{api}&split={split}&offset={offset}&length=100")
            for r in (row["row"] for row in data["rows"]):
                labels, texts = r["choices"]["label"], r["choices"]["text"]
                right = texts[labels.index(r["answerKey"])]
                out["obqa-" + r["id"]] = {
                    "id": "obqa-" + r["id"],
                    "fonte_categoria": split,
                    "tipo": "M",
                    "difficolta": 2,
                    "domanda": r["question_stem"],
                    "giusta": right,
                    "sbagliate": [t for t in texts if t != right],
                }
            offset += 100
            if offset >= data["num_rows_total"]:
                break
            time.sleep(0.5)
    save("openbookqa", out.values())


def download_arc():
    # Hugging Face's dataset server, 100 rows a request. Easy -> difficulty 1, Challenge -> 2
    # (school science: Challenge is hard for retrieval systems, not much harder for people).
    # The few questions with 5 answers keep the right one and the first 3 wrong ones.
    api = "https://datasets-server.huggingface.co/rows?dataset=allenai/ai2_arc"
    out = {}
    for config, level in (("ARC-Easy", 1), ("ARC-Challenge", 2)):
        for split in ("train", "validation", "test"):
            offset = 0
            while True:
                data = get(f"{api}&config={config}&split={split}&offset={offset}&length=100")
                for r in (row["row"] for row in data["rows"]):
                    labels, texts = r["choices"]["label"], r["choices"]["text"]
                    if r["answerKey"] not in labels:
                        continue
                    right = texts[labels.index(r["answerKey"])]
                    out["arc-" + r["id"]] = {
                        "id": "arc-" + r["id"],
                        "fonte_categoria": f"{config} {split}",
                        "tipo": "M",
                        "difficolta": level,
                        "domanda": r["question"],
                        "giusta": right,
                        "sbagliate": [t for t in texts if t != right][:3],
                    }
                offset += 100
                if offset >= data["num_rows_total"]:
                    break
                time.sleep(0.5)
    save("arc", out.values())


def download_apininjas():
    # A free key returns one random question per request out of a pool of 100: ask until no new
    # one has come for a long while. The key is read from the environment.
    key = os.environ.get("APININJAS_KEY") or sys.exit("APININJAS_KEY non impostata")
    out, idle = {}, 0
    while idle < 60:
        time.sleep(1)
        try:
            req = urllib.request.Request("https://api.api-ninjas.com/v1/trivia", headers={**HEADERS, "X-Api-Key": key})
            with urllib.request.urlopen(req, timeout=30) as res:
                batch = json.load(res)
        except Exception as e:
            print(f"! {e}", flush=True)
            time.sleep(10)
            idle += 5
            continue
        new = 0
        for item in batch:
            qid = "ani-" + hashlib.sha1((item["question"] + "\n" + item["answer"]).encode("utf-8")).hexdigest()[:10]
            if qid not in out:
                out[qid] = {"id": qid, "fonte_categoria": item.get("category") or "general", "tipo": "M", "difficolta": 2,
                            "domanda": item["question"].strip(), "giusta": item["answer"].strip(), "sbagliate": []}
                new += 1
        idle = 0 if new else idle + 1
        if new:
            print(f"{len(out)} domande", flush=True)
    save("apininjas", out.values())


def raw(source):
    with open(raw_path(source), encoding="utf-8") as fh:
        return json.load(fh)


def translations(source):
    out = {}
    for path in sorted(glob.glob(os.path.join(DATA, source, "it", "*.json"))):
        with open(path, encoding="utf-8") as fh:
            out.update(json.load(fh))
    return out


def todo(source, n):
    done = translations(source)
    left = [q for q in raw(source) if q["id"] not in done]
    print(f"# {source}: {len(left)} da tradurre; id|tipo|domanda|giusta|sbagliate")
    for q in left[:n]:
        print("|".join([q["id"], q["tipo"], q["domanda"], q["giusta"], *q["sbagliate"]]))


def nuove(sources):
    # Only a count: Open Trivia and The Trivia API publish how many questions they hold. ARC and
    # OpenBookQA are fixed datasets. A small gap is normal (duplicates, a download cut short):
    # what matters is a gap that grows from one check to the next.
    for source in sources:
        if source not in ("opentdb", "triviaapi"):
            print(f"{source}: dataset fisso, nessuna novità possibile")
            continue
        if source == "opentdb":  # a download gives the verified ones
            now = get("https://opentdb.com/api_count_global.php")["overall"]["total_num_of_verified_questions"]
        else:
            now = get("https://the-trivia-api.com/v2/metadata")["byType"]["text_choice"]
        have = len(raw(source)) if os.path.exists(raw_path(source)) else 0
        print(f"{source}: online {now}, scaricate {have}, differenza {now - have:+d}")


def to_csv(dst):
    prefixes = tuple(s["prefix"] for s in SOURCES.values())
    ours = [q for q in domande.load() if not q["id"].startswith(prefixes)]
    rows, report = [], []
    for q in ours:
        answers = (q["opzioni"] + ["", "", "", ""])[:4]
        right = domande.LETTERS[q["giusta"]].upper() if q["giusta"] is not None else ""
        rows.append([q["id"], q["categoria"], q["difficolta"], int(q["ordine_fisso"]), int(q["attiva"]), q["domanda"], *answers, right, q["spiegazione"]])
    for source, cfg in SOURCES.items():
        if not os.path.exists(raw_path(source)):
            continue
        done = translations(source)
        added, missing, left_out, bad = 0, 0, 0, []
        for q in raw(source):
            it = done.get(q["id"])
            if it is None:
                missing += 1
                continue
            if not it:  # translated as [] on purpose: wrong, dated or ambiguous in the source
                left_out += 1
                continue
            if q["tipo"] == "VF":
                answers, right, fixed = ["Vero", "Falso", "", ""], "A" if q["giusta"] == "True" else "B", 1
            else:
                if len(it) != (2 + len(q["sbagliate"]) if q["sbagliate"] else 5) or len({a.strip().lower() for a in it[1:]}) < len(it) - 1:
                    bad.append(q["id"])
                    continue
                # The right answer comes first in a translation; a fixed shuffle per id in the
                # CSV, so its letter is not always A (the game shuffles them again).
                options = [(text, i == 0) for i, text in enumerate(it[1:])]
                random.Random(q["id"]).shuffle(options)
                answers = [t for t, _ in options] + [""] * (4 - len(options))
                right, fixed = domande.LETTERS[[r for _, r in options].index(True)].upper(), 0
            rows.append([q["id"], cfg["categoria"], q["difficolta"], fixed, cfg["attiva"], it[0], *answers, right, ""])
            added += 1
        report.append(f"{source}: {added} ({missing} senza traduzione, {left_out} escluse{f', {len(bad)} scartate: ' + ', '.join(bad[:10]) if bad else ''})")
    # Keep reviewed wording and exclusions when rebuilding from the original sources.
    from revisione_risposte import editorial_rows
    rows = editorial_rows(rows)
    with open(dst, "w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(["id", "categoria", "difficolta", "ordine_fisso", "attiva", "domanda", "a", "b", "c", "d", "giusta", "spiegazione"])
        writer.writerows(rows)
    print(f"{len(rows)} domande -> {dst}; nostre {len(ours)}; " + "; ".join(report))


if __name__ == "__main__":
    args = sys.argv[1:]
    downloads = {"opentdb": download_opentdb, "triviaapi": download_triviaapi, "openbookqa": download_openbookqa, "arc": download_arc, "apininjas": download_apininjas}
    if len(args) == 2 and args[0] == "download" and args[1] in downloads:
        downloads[args[1]]()
    elif len(args) in (2, 3) and args[0] == "todo" and args[1] in SOURCES:
        todo(args[1], int(args[2]) if len(args) > 2 else 100)
    elif len(args) in (1, 2) and args[0] == "nuove" and (len(args) == 1 or args[1] in SOURCES):
        nuove(args[1:] or list(SOURCES))
    elif len(args) == 2 and args[0] == "csv":
        to_csv(args[1])
    else:
        sys.exit(__doc__)

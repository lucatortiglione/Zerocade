"""Complete missing Italian source translations using Google Translate.

Usage: python script/traduci_fonti.py arc openbookqa
Existing translations (including deliberately excluded questions) are preserved.
Output is machine translated and should receive editorial review before activation.
The cache in the system temporary directory allows interrupted runs to resume.
"""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import re
import sys
import tempfile
import time
import urllib.parse
import urllib.request

import fonti

CACHE = Path(tempfile.gettempdir()) / "zerocade-traduzioni-it"


def translate(batch):
    text = "\n".join(f"[{i:05d}] {s}" for i, s in enumerate(batch))
    path = CACHE / (hashlib.sha256(text.encode()).hexdigest() + ".json")
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    url = "https://translate.googleapis.com/translate_a/single?" + urllib.parse.urlencode(
        {"client": "dict-chrome-ex", "sl": "en", "tl": "it", "dt": "t", "q": text}
    )
    for attempt in range(5):
        try:
            with urllib.request.urlopen(url, timeout=45) as response:
                result = json.load(response)
            output = "".join(part[0] or "" for part in result[0])
            parts = re.split(r"\[\s*(\d{5})\s*\]", output)
            if len(parts) != 2 * len(batch) + 1:
                raise ValueError("Translation markers changed")
            values = []
            for i in range(len(batch)):
                if int(parts[2 * i + 1]) != i or not parts[2 * i + 2].strip():
                    raise ValueError("Missing or reordered translation")
                values.append(parts[2 * i + 2].strip())
            path.write_text(json.dumps(values, ensure_ascii=False), encoding="utf-8")
            return values
        except Exception:
            if attempt == 4:
                raise
            time.sleep(2 ** (attempt + 1))


def main(sources):
    CACHE.mkdir(exist_ok=True)
    pending = {}
    strings = {}
    for source in sources:
        done = fonti.translations(source)
        pending[source] = [q for q in fonti.raw(source) if q["id"] not in done]
        for q in pending[source]:
            for value in [q["domanda"], q["giusta"], *q["sbagliate"]]:
                strings.setdefault(re.sub(r"\s+", " ", value).strip(), None)
    batches, batch, size = [], [], 0
    for value in strings:
        if batch and size + len(value) + 10 > 1800:
            batches.append(batch)
            batch, size = [], 0
        batch.append(value)
        size += len(value) + 10
    if batch:
        batches.append(batch)
    print(f"{sum(map(len, pending.values()))} domande, {len(strings)} testi, {len(batches)} gruppi", flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        futures = {pool.submit(translate, batch): batch for batch in batches}
        for count, future in enumerate(concurrent.futures.as_completed(futures), 1):
            batch = futures[future]
            strings.update(zip(batch, future.result()))
            if count % 25 == 0 or count == len(batches):
                print(f"Tradotti {count}/{len(batches)} gruppi", flush=True)
    for source, questions in pending.items():
        folder = Path(fonti.DATA) / source / "it"
        folder.mkdir(exist_ok=True)
        number = max((int(p.stem) for p in folder.glob("*.json") if p.stem.isdigit()), default=0)
        for start in range(0, len(questions), 250):
            out = {}
            for q in questions[start:start + 250]:
                original = [q["domanda"]] if q["tipo"] == "VF" else [q["domanda"], q["giusta"], *q["sbagliate"]]
                values = [strings[re.sub(r"\s+", " ", value).strip()] for value in original]
                # Distinct English options can become identical in Italian; retain the
                # original wording as a gloss rather than silently dropping an answer.
                if len({s.casefold() for s in values[1:]}) != len(values) - 1:
                    for i in range(1, len(values)):
                        if sum(s.casefold() == values[i].casefold() for s in values[1:]) > 1:
                            values[i] += f" ({original[i]})"
                out[q["id"]] = values
            number += 1
            path = folder / f"{number:04d}.json"
            with path.open("x", encoding="utf-8", newline="\n") as fh:
                fh.write("{\n" + ",\n".join(json.dumps(k) + ":" + json.dumps(v, ensure_ascii=False) for k, v in out.items()) + "\n}\n")
        print(f"{source}: salvate {len(questions)} traduzioni automatiche", flush=True)


if __name__ == "__main__":
    selected = sys.argv[1:]
    if not selected or any(s not in fonti.SOURCES for s in selected):
        sys.exit(__doc__)
    main(selected)

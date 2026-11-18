#!/usr/bin/env python3
"""Download matching card scans from TCGdex, with a per-card validation report."""
import csv
import json
import re
import time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "pokemon-cardmarket-100-500"
API = "https://api.tcgdex.net/v2/en"

def fetch(url, binary=False):
    for retry in range(4):
        try:
            req = Request(url, headers={"User-Agent": "DrGokuReferenceCardLoader/1.0"})
            with urlopen(req, timeout=30) as response:
                data = response.read()
            return data if binary else json.loads(data)
        except (HTTPError, URLError, TimeoutError):
            if retry == 3:
                raise
            time.sleep(2 ** retry)

def normalized(s):
    return re.sub(r"[^a-z0-9]", "", str(s).casefold())

def normalized_number(n):
    m = re.fullmatch(r"([a-zA-Z]*)([0-9]+)", str(n))
    return m.group(1).upper() + str(int(m.group(2))) if m else str(n).upper()

def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", str(s).casefold()).strip("-")

def run():
    OUT.mkdir(parents=True, exist_ok=True)
    with (ROOT / "data" / "pokemon-cards-100-500.csv").open(encoding="utf-8", newline="") as f:
        entries = list(csv.DictReader(f))
    assert len(entries) == 50, f"Expected 50 entries, got {len(entries)}"
    set_list = fetch(API + "/sets")
    set_map = {normalized(item["name"]): item["id"] for item in set_list}
    set_cache = {}
    report = []
    for idx, entry in enumerate(entries, 1):
        name, expansion, number = entry["name"], entry["set"], entry["number"]
        row = dict(entry, status="not_found")
        try:
            set_id = set_map.get(normalized(expansion))
            if not set_id:
                raise ValueError("Expansion not found in TCGdex")
            if set_id not in set_cache:
                set_cache[set_id] = fetch(API + "/sets/" + set_id)
            local_number = normalized_number(number.split("/")[0])
            matches = [card for card in set_cache[set_id].get("cards", [])
                       if normalized_number(card.get("localId", "")) == local_number]
            if len(matches) != 1:
                raise ValueError(f"Found {len(matches)} matches for local number {local_number}")
            candidate = matches[0]
            if normalized(candidate["name"]) != normalized(name):
                raise ValueError(f"Card-name mismatch: {candidate['name']}")
            detail = fetch(API + "/cards/" + candidate["id"])
            source = detail.get("image", candidate.get("image"))
            if not source:
                raise ValueError("No card image at source")
            image_url = source + "/high.webp"
            blob = fetch(image_url, binary=True)
            if blob[:4] != b"RIFF" or blob[8:12] != b"WEBP":
                raise ValueError("Downloaded content is not a WebP image")
            filename = f"{idx:02d}-{slug(name)}-{slug(expansion)}-{slug(number)}.webp"
            (OUT / filename).write_bytes(blob)
            row.update(status="saved", filename=filename, tcgdex_id=candidate["id"], image_source=image_url)
        except (ValueError, KeyError, HTTPError, URLError, TimeoutError) as error:
            row["error"] = str(error)
        report.append(row)
        print(f"{idx:02d}/50 {name} ({expansion} {number}): {row['status']}", flush=True)
    (OUT / "download-report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    saved = sum(r["status"] == "saved" for r in report)
    print(f"Saved {saved}/50")
    if saved != 50:
        raise SystemExit(f"{50-saved} images could not be verified; see download-report.json")

if __name__ == "__main__":
    run()

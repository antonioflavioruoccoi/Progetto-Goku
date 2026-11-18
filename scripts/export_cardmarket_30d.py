#!/usr/bin/env python3
"""Export Cardmarket 30-day sale averages for the 50 specified Pokémon cards.

TCGdex exposes Cardmarket's avg30 and avg30-holo with price-guide update dates.
The card is identified by the verified set + collection number, never by name alone.
"""
import csv
import io
import json
import re
import time
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "data" / "pokemon-cards-100-500.csv"
REPORT = ROOT / "assets" / "pokemon-cardmarket-100-500" / "download-report.json"
OUTPUT = ROOT / "data" / "pokemon-cards-30d-avg-cardmarket.csv"
API = "https://api.tcgdex.net/v2/en"
FIELDS = [
    "nome", "espansione", "numero", "media_30gg_eur", "variante_media",
    "media_30gg_standard_eur", "media_30gg_holo_eur", "aggiornato_il",
    "cardmarket_id_product", "tcgdex_id", "stato",
    "fonte_prezzo", "ricerca_cardmarket", "immagine_file"
]

def fetch_json(url):
    for i in range(4):
        try:
            request = Request(url, headers={"User-Agent": "DrGokuPriceExport/1.0"})
            with urlopen(request, timeout=35) as response:
                return json.load(io.TextIOWrapper(response, encoding="utf-8"))
        except (HTTPError, URLError, TimeoutError):
            if i == 3:
                raise
            time.sleep(2 ** i)

def norm(value):
    return re.sub(r"[^a-z0-9]", "", str(value).casefold())

def number_key(value):
    match = re.fullmatch(r"([A-Za-z]*)(0*[0-9]+)", str(value))
    if match:
        return match.group(1).upper() + str(int(match.group(2)))
    return str(value).upper()

def decimal(value):
    return f"{value:.2f}" if isinstance(value, (int, float)) and value > 0 else ""

def main():
    with MANIFEST.open(encoding="utf-8", newline="") as f:
        cards = list(csv.DictReader(f))
    assert len(cards) == 50, "Il catalogo deve contenere esattamente 50 carte."
    report = json.loads(REPORT.read_text(encoding="utf-8"))
    assert len(report) == len(cards), "Catalogo e report immagini non coincidono."
    sets = None
    set_cache = {}
    results = []
    for idx, card in enumerate(cards):
        name, expansion, number = card["name"], card["set"], card["number"]
        prior = report[idx]
        assert (prior["name"], prior["set"], prior["number"]) == (name, expansion, number)
        card_id = prior.get("tcgdex_id")
        row = {
            "nome": name,
            "espansione": expansion,
            "numero": number,
            "media_30gg_eur": "",
            "variante_media": "",
            "media_30gg_standard_eur": "",
            "media_30gg_holo_eur": "",
            "aggiornato_il": "",
            "cardmarket_id_product": "",
            "tcgdex_id": card_id or "",
            "stato": "non_disponibile",
            "fonte_prezzo": "",
            "ricerca_cardmarket": "https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=" +
                quote(f"{name} {expansion}"),
            "immagine_file": prior.get("filename", "")
        }
        try:
            if not card_id:
                if sets is None:
                    sets = fetch_json(API + "/sets")
                set_match = [s for s in sets if norm(s["name"]) == norm(expansion)]
                if len(set_match) != 1:
                    raise ValueError("espansione non univoca nell'API")
                sid = set_match[0]["id"]
                if sid not in set_cache:
                    set_cache[sid] = fetch_json(API + "/sets/" + sid)
                local = number_key(number.split("/")[0])
                matches = [c for c in set_cache[sid].get("cards", [])
                           if number_key(c.get("localId", "")) == local]
                if len(matches) != 1:
                    raise ValueError("numero carta non univoco nell'espansione")
                candidate = matches[0]
                # TCGdex sometimes omits suffixes such as LV.X in display names.
                if norm(candidate["name"]) not in (norm(name), norm(name).replace("lvx", "")):
                    raise ValueError("nome non corrispondente")
                card_id = candidate["id"]
                row["tcgdex_id"] = card_id
            detail = fetch_json(API + "/cards/" + card_id)
            if detail.get("id") != card_id:
                raise ValueError("id restituito differente dall'id richiesto")
            prices = detail.get("pricing", {}).get("cardmarket") or {}
            row["fonte_prezzo"] = API + "/cards/" + card_id
            row["aggiornato_il"] = prices.get("updated", "")
            row["cardmarket_id_product"] = prices.get("idProduct", "")
            standard, holo = decimal(prices.get("avg30")), decimal(prices.get("avg30-holo"))
            row["media_30gg_standard_eur"] = standard
            row["media_30gg_holo_eur"] = holo
            if standard:
                row["media_30gg_eur"] = standard
                row["variante_media"] = "standard"
                row["stato"] = "ok"
            elif holo:
                row["media_30gg_eur"] = holo
                row["variante_media"] = "holo"
                row["stato"] = "solo_holo"
            else:
                row["stato"] = "media_30gg_non_presente"
        except (ValueError, KeyError, HTTPError, URLError, TimeoutError) as exc:
            row["stato"] = "errore_" + type(exc).__name__
        results.append(row)
        print(f"{idx + 1:02d}/50 {name} [{expansion} {number}] {row['media_30gg_eur'] or 'N/D'} {row['stato']}", flush=True)
        time.sleep(0.15)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(results)
    available = sum(bool(r["media_30gg_eur"]) for r in results)
    print(f"Prezzi medi trovati: {available}/50. File: {OUTPUT}")
    # Unavailable prices remain empty instead of being filled with estimates.

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Manche 7 "50 Sfumature": prepara le immagini per il sito.

Uso:  python3 server/build-sfumature.py      (serve Pillow e numpy: lancialo sul computer, non su GitHub)

1. Legge 50sfumature/elementi.json -> { "file.png": { "nome", "categoria", "zona", "colore": "#rrggbb" } }
   "colore" e' il colore (circa) della zona da far indovinare; "tolleranza" (facoltativa, default 24)
   allarga o stringe la zona.
2. Per ogni PNG di 50sfumature/ crea in assets/sfumature/ (nome in codice, cosi' non svela nulla):
   - <codice>.png   immagine con la zona dipinta di bianco e un contorno scuro
   - <codice>-m.png maschera della zona (serve al telefono per colorarla)
   Il colore esatto lo misura sull'immagine e resta solo nel server: il sito non lo vede prima della soluzione.
3. Scrive i dati nel server (server/worker-index.js) e aggiorna .claude/deploy-files.txt.
"""
import hashlib, json, os, re, sys

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, "50sfumature")
DATA = os.path.join(SOURCE, "elementi.json")
ASSETS = "assets/sfumature"
WORKER = os.path.join(ROOT, "server", "worker-index.js")
DEPLOY = os.path.join(ROOT, ".claude", "deploy-files.txt")
START, END = "// shades-data:start", "// shades-data:end"
ROUNDS, SIDE, OUTLINE = 6, 640, (28, 26, 34)


def fail(errors):
    print("ERRORE 50 Sfumature: niente e' stato cambiato.\n" + "\n".join(f"  - {e}" for e in errors))
    sys.exit(1)


def load():
    try:
        data = json.load(open(DATA, encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError) as e:
        fail([f"50sfumature/elementi.json mancante o scritto male: {e}"])
    errors = []
    for file, item in data.items():
        if not os.path.exists(os.path.join(SOURCE, file)):
            errors.append(f'{file}: immagine mancante in 50sfumature/')
        if not all(isinstance(item.get(k), str) and item[k].strip() for k in ("nome", "categoria", "zona")):
            errors.append(f"{file}: servono nome, categoria e zona")
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", str(item.get("colore", ""))):
            errors.append(f'{file}: "colore" deve essere tipo "#ff8800"')
    if len(data) < ROUNDS:
        errors.append(f"servono almeno {ROUNDS} elementi, ce ne sono {len(data)}")
    if errors:
        fail(errors)
    return data


def dilate(mask, radius):
    out = mask.copy()
    h, w = mask.shape
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            if dx * dx + dy * dy > radius * radius:
                continue
            out[max(0, dy):h + min(0, dy), max(0, dx):w + min(0, dx)] |= mask[max(0, -dy):h - max(0, dy), max(0, -dx):w - max(0, dx)]
    return out


def build(file, item):
    img = Image.open(os.path.join(SOURCE, file)).convert("RGBA")
    scale = SIDE / max(img.size)
    img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    px = np.asarray(img).astype(np.float32)
    seed = np.array([int(item["colore"][i:i + 2], 16) for i in (1, 3, 5)], np.float32)
    near = item.get("tolleranza", 24)
    dist = np.sqrt(((px[..., :3] - seed) ** 2).sum(-1))
    # 1 dentro la zona, 0 fuori, sfumato sui bordi antialias
    m = np.clip(1 - (dist - near) / 40, 0, 1) * (px[..., 3] / 255)
    core = m > 0.98
    if core.sum() < 200:
        fail([f"{file}: zona troppo piccola, controlla \"colore\""])
    color = "#" + "".join(f"{round(v):02x}" for v in px[core][:, :3].mean(0))
    # Filtro mediano: toglie i puntini sparsi e rende netto il confine della zona
    zone = np.asarray(Image.fromarray(((m > 0.5) * 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(5))) > 127
    painted = m > 0
    m = m * dilate(zone, 1)
    # Bianco pieno ovunque il colore sia anche solo vicino: niente bordi sfumati da cui ricostruirlo
    base = px.copy()
    base[painted, :3] = 255
    # Contorno scuro attorno alla zona: copre anche i pixel di bordo che tradirebbero il colore
    ring = dilate(zone, 3) & ~zone
    base[ring] = [*OUTLINE, 255]
    mask = np.zeros(px.shape[:2] + (2,), np.uint8)
    mask[..., 1] = np.where(painted & ~ring, 255, 0)
    code = hashlib.sha256(open(os.path.join(SOURCE, file), "rb").read() + item["colore"].encode()).hexdigest()[:20]
    paths = (f"{ASSETS}/{code}.png", f"{ASSETS}/{code}-m.png")
    Image.fromarray(base.round().astype(np.uint8), "RGBA").save(os.path.join(ROOT, paths[0]), optimize=True)
    Image.fromarray(mask, "LA").save(os.path.join(ROOT, paths[1]), optimize=True)
    return {"name": item["nome"].strip(), "category": item["categoria"].strip(), "part": item["zona"].strip(),
            "image": paths[0], "mask": paths[1], "ratio": round(img.width / img.height, 4), "color": color}


def main():
    data = load()
    os.makedirs(os.path.join(ROOT, ASSETS), exist_ok=True)
    items = [build(file, item) for file, item in data.items()]
    used = {it[k] for it in items for k in ("image", "mask")}
    for f in os.listdir(os.path.join(ROOT, ASSETS)):
        if f"{ASSETS}/{f}" not in used:
            os.remove(os.path.join(ROOT, ASSETS, f))

    code = open(WORKER, encoding="utf-8").read()
    if code.count(START) != 1 or code.count(END) != 1:
        fail([f"in server/worker-index.js mancano i segnaposto {START} / {END}"])
    block = f"{START}\nvar SHADES_ITEMS = {json.dumps(items, ensure_ascii=False)};\n{END}"
    code = re.sub(re.escape(START) + r".*?" + re.escape(END), lambda _: block, code, flags=re.S)
    open(WORKER, "w", encoding="utf-8").write(code)

    lines = [l.rstrip("\n") for l in open(DEPLOY, encoding="utf-8") if l.strip() and not l.startswith(ASSETS + "/")]
    open(DEPLOY, "w", encoding="utf-8").write("\n".join(sorted(lines + sorted(used))) + "\n")
    print(f"50 Sfumature pronto: {len(items)} elementi in {ASSETS}/")
    for it in items:
        print(f"  {it['name']:<26} {it['color']}  ({it['part']})")


if __name__ == "__main__":
    main()

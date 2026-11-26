#!/usr/bin/env python3
"""Manche 6 "Album dei ricordi": controlla foto e indizi e li prepara per il sito.

Uso:  python3 server/build-album.py

1. Legge album-dei-ricordi/indizi.json  ->  { "Nome Persona": ["difficile", "medio", "facile"] }
2. Cerca in "Album dei ricordi/" le foto "Nome Persona - bambino.<ext>" e "Nome Persona - adulto.<ext>"
   (vanno bene anche "bambina" e "adulta"; estensioni: jpg, jpeg, jfif, png, webp, avif).
3. Se manca qualcosa si ferma con un errore chiaro e non cambia nulla.
4. Copia le foto in assets/album/ con un nome in codice (cosi' il nome del file non svela la risposta),
   scrive i dati nel codice del server (server/worker-index.js) e aggiorna .claude/deploy-files.txt.
Lo lancia anche .claude/deploy.py prima di ogni pubblicazione.
"""
import hashlib, json, os, re, shutil, sys, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLUES = os.path.join(ROOT, "album-dei-ricordi", "indizi.json")
PHOTOS = os.path.join(ROOT, "Album dei ricordi")
ASSETS = "assets/album"
WORKER = os.path.join(ROOT, "server", "worker-index.js")
DEPLOY = os.path.join(ROOT, ".claude", "deploy-files.txt")
START, END = "// album-data:start", "// album-data:end"
ROUNDS = 5
PHOTO = re.compile(r"^(.+?)\s+-\s+(bambin[oa]|adult[oa])\.(jpe?g|jfif|png|webp|avif)$", re.I)
nfc = lambda s: unicodedata.normalize("NFC", s).strip()


def fail(errors):
    print("ERRORE Album dei ricordi: niente e' stato cambiato.\n" + "\n".join(f"  - {e}" for e in errors))
    sys.exit(1)


def load_clues():
    try:
        data = json.load(open(CLUES, encoding="utf-8"))
    except FileNotFoundError:
        fail([f"manca il file {os.path.relpath(CLUES, ROOT)}"])
    except json.JSONDecodeError as e:
        fail([f"indizi.json non e' scritto bene (riga {e.lineno}, colonna {e.colno}): {e.msg}"])
    if not isinstance(data, dict) or not data:
        fail(['indizi.json deve essere { "Nome Persona": ["indizio difficile", "indizio medio", "indizio facile"] }'])
    errors = []
    keys = [nfc(k).casefold() for k in data]
    errors += [f'"{k}" compare due volte in indizi.json' for k in sorted({k for k in keys if keys.count(k) > 1})]
    for name, clues in data.items():
        if not nfc(name):
            errors.append("c'e' un VIP senza nome")
        elif not isinstance(clues, list) or len(clues) != 3 or not all(isinstance(c, str) and c.strip() for c in clues):
            errors.append(f"{name}: servono esattamente 3 indizi non vuoti (difficile, medio, facile)")
        elif any(len(c) > 200 for c in clues):
            errors.append(f"{name}: ogni indizio deve avere al massimo 200 caratteri")
    if errors:
        fail(errors)
    return {nfc(k): [c.strip() for c in v] for k, v in data.items()}


def find_photos():
    found, warnings = {}, []
    for file in sorted(os.listdir(PHOTOS)):
        if file.startswith("."):
            continue
        m = PHOTO.match(nfc(file))
        if not m:
            warnings.append(f'"{file}" ignorata: il nome deve essere "Nome Persona - bambino.jpg" o "Nome Persona - adulto.jpg"')
            continue
        kind = "child" if m.group(2).lower().startswith("bambin") else "adult"
        slot = found.setdefault(nfc(m.group(1)).casefold(), {})
        if kind in slot:
            fail([f'due foto per lo stesso posto: "{slot[kind]}" e "{file}": tienine una'])
        slot[kind] = file
    return found, warnings


def copy_photo(file):
    raw = open(os.path.join(PHOTOS, file), "rb").read()
    ext = file.rsplit(".", 1)[1].lower().replace("jfif", "jpg").replace("jpeg", "jpg")
    path = f"{ASSETS}/{hashlib.sha256(raw).hexdigest()[:20]}.{ext}"
    target = os.path.join(ROOT, path)
    if not os.path.exists(target):
        open(target, "wb").write(raw)
    return path


def answers(name):
    words = name.split()
    return [name] + ([" ".join(words[1:])] if len(words) > 1 else [])


def main():
    clues = load_clues()
    photos, warnings = find_photos()
    errors = []
    for name in clues:
        have = photos.get(name.casefold(), {})
        for kind, label in (("child", "bambino"), ("adult", "adulto")):
            if kind not in have:
                errors.append(f'{name}: manca la foto "{name} - {label}.<jpg|webp|...>" in "Album dei ricordi/"')
    known = {n.casefold() for n in clues}
    warnings += [f'foto di "{p}" senza indizi in indizi.json: non verra\' usata' for p in photos if p not in known]
    if len(clues) < ROUNDS:
        errors.append(f"servono almeno {ROUNDS} VIP (uno per round), ce ne sono {len(clues)}")
    if errors:
        fail(errors)

    os.makedirs(os.path.join(ROOT, ASSETS), exist_ok=True)
    vips = [{
        "name": name,
        "answers": answers(name),
        "clues": clues[name],
        "child": copy_photo(photos[name.casefold()]["child"]),
        "adult": copy_photo(photos[name.casefold()]["adult"]),
    } for name in clues]
    used = {v[k] for v in vips for k in ("child", "adult")}
    for f in os.listdir(os.path.join(ROOT, ASSETS)):
        if f"{ASSETS}/{f}" not in used:
            os.remove(os.path.join(ROOT, ASSETS, f))

    code = open(WORKER, encoding="utf-8").read()
    if code.count(START) != 1 or code.count(END) != 1:
        fail([f"in server/worker-index.js mancano i segnaposto {START} / {END}"])
    block = f"{START}\nvar ALBUM_VIPS = {json.dumps(vips, ensure_ascii=False)};\n{END}"
    code = re.sub(re.escape(START) + r".*?" + re.escape(END), lambda _: block, code, flags=re.S)
    open(WORKER, "w", encoding="utf-8").write(code)

    lines = [l.rstrip("\n") for l in open(DEPLOY, encoding="utf-8") if l.strip() and not l.startswith(ASSETS + "/")]
    open(DEPLOY, "w", encoding="utf-8").write("\n".join(sorted(lines + sorted(used))) + "\n")

    for w in warnings:
        print("Attenzione:", w)
    print(f"Album dei ricordi pronto: {len(vips)} VIP, {len(used)} foto in {ASSETS}/")


if __name__ == "__main__":
    main()

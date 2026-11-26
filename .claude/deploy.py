#!/usr/bin/env python3
"""Pubblica il sito su Cloudflare (Worker "dr-goku") senza toccare il codice multiplayer.

Uso:   python3 .claude/deploy.py            -> pubblica i file elencati in .claude/deploy-files.txt
       python3 .claude/deploy.py rollback   -> torna alla versione precedente
       python3 .claude/deploy.py --worker server/worker-index.js -> pubblica i file E il codice del server indicato

Come funziona: scarica dal Worker online il codice attuale e le impostazioni, carica i file del sito
come nuova versione e la rende attiva. La chiave API la mette in automatico l'ambiente (api.cloudflare.com).
"""
import base64, hashlib, json, mimetypes, os, subprocess, sys, tempfile

ACCOUNT = "ac9a473c680cccb5a466a6741c94404a"
WORKER = "dr-goku"
SITE = "https://dr-goku.antonioflavioruocco-i.workers.dev"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/workers"
tmp = tempfile.mkdtemp()
# Su GitHub (Actions) la chiave arriva dal segreto CLOUDFLARE_API_TOKEN; nell'ambiente cloud la mette il proxy.
TOKEN = os.environ.get("CLOUDFLARE_API_TOKEN")
AUTH = ["-H", f"Authorization: Bearer {TOKEN}"] if TOKEN else []


def curl(*args, jwt=None):
    cmd = ["curl", "-sS", "-m", "300"] + (["-H", f"Authorization: Bearer {jwt}"] if jwt else AUTH) + list(args)
    out = subprocess.run(cmd, capture_output=True, text=True).stdout
    try:
        return json.loads(out)
    except ValueError:
        return {"success": False, "raw": out[:300]}


def ok(r, what):
    if not r.get("success"):
        sys.exit(f"ERRORE in '{what}': {json.dumps(r.get('errors') or r)[:400]}")
    return r["result"]


def current_version():
    d = ok(curl(f"{API}/scripts/{WORKER}/deployments"), "lettura deployment")["deployments"][0]
    return d["versions"][0]["version_id"], d["id"]


def deploy_version(version_id):
    body = json.dumps({"strategy": "percentage", "versions": [{"version_id": version_id, "percentage": 100}]})
    ok(curl("-X", "POST", f"{API}/scripts/{WORKER}/deployments", "-H", "Content-Type: application/json", "-d", body), "attivazione")


def file_hash(path):
    ext = os.path.splitext(path)[1].lstrip(".")
    return hashlib.sha256((base64.b64encode(open(path, "rb").read()).decode() + ext).encode()).hexdigest()[:32]


def main():
    old_version, _ = current_version()
    if len(sys.argv) > 1 and sys.argv[1] == "rollback":
        vs = ok(curl(f"{API}/scripts/{WORKER}/versions?per_page=5"), "elenco versioni")["items"]
        prev = next(v["id"] for v in vs if v["id"] != old_version)
        deploy_version(prev)
        return print(f"Tornato alla versione {prev}")

    files = [l.rstrip("\n") for l in open(os.path.join(ROOT, ".claude/deploy-files.txt")) if l.strip()]
    manifest, paths = {}, {}
    for f in files:
        p = os.path.join(ROOT, f)
        manifest["/" + f] = {"hash": file_hash(p), "size": os.path.getsize(p)}
        paths[manifest["/" + f]["hash"]] = p

    # 1) impostazioni e codice attuali del Worker online
    ver = ok(curl(f"{API}/scripts/{WORKER}/versions/{old_version}"), "lettura versione")
    assets_cfg = ver["resources"]["script_runtime"]["assets"]
    bindings = [b for b in ver["resources"]["bindings"] if b["type"] != "secret_text"]
    raw = subprocess.run(["curl", "-sS", *AUTH, f"{API}/scripts/{WORKER}/content/v2"], capture_output=True).stdout
    # (la chiave API viene aggiunta dall'ambiente; riscarico con curl() per sicurezza se vuoto)
    if not raw.startswith(b"--"):
        sys.exit("ERRORE: codice del Worker non scaricato")
    boundary = raw.split(b"\r\n", 1)[0]
    parts = {}
    for chunk in raw.split(boundary)[1:-1]:
        head, body = chunk.lstrip(b"\r\n").split(b"\r\n\r\n", 1)
        name = head.split(b'name="')[1].split(b'"')[0].decode()
        parts[name] = body[:-2] if body.endswith(b"\r\n") else body
    for n in ("index.js", "index.js.map"):
        open(os.path.join(tmp, n), "wb").write(parts[n])
    if "--worker" in sys.argv:  # codice del server nuovo (solo se richiesto esplicitamente)
        open(os.path.join(tmp, "index.js"), "wb").write(open(os.path.join(ROOT, sys.argv[sys.argv.index("--worker") + 1]), "rb").read())

    # 2) carico solo i file nuovi o cambiati
    sess = ok(curl("-X", "POST", f"{API}/scripts/{WORKER}/assets-upload-session", "-H", "Content-Type: application/json",
                   "-d", json.dumps({"manifest": manifest})), "sessione di caricamento file")
    jwt = sess["jwt"]
    for bucket in sess.get("buckets") or []:
        args = []
        for h in bucket:
            b64 = os.path.join(tmp, h)
            open(b64, "w").write(base64.b64encode(open(paths[h], "rb").read()).decode())
            ct = mimetypes.guess_type(paths[h])[0] or "application/octet-stream"
            args += ["-F", f"{h}=@{b64};type={ct};filename={h}"]
        res = ok(curl("-X", "POST", f"{API}/assets/upload?base64=true", *args, jwt=jwt), "caricamento file")
        jwt = res.get("jwt") or jwt
    print(f"File nel sito: {len(manifest)}, nuovi o cambiati: {sum(len(b) for b in sess.get('buckets') or [])}")

    # 3) nuova versione: stesso codice, stesse impostazioni, file aggiornati
    meta = {
        "main_module": "index.js",
        "compatibility_date": ver["resources"]["script_runtime"]["compatibility_date"],
        "bindings": bindings,
        "keep_bindings": ["secret_text"],
        "assets": {"jwt": jwt, "config": {"_headers": assets_cfg["raw_headers"], "run_worker_first": assets_cfg["raw_run_worker_first"]}},
    }
    mp = os.path.join(tmp, "metadata.json")
    json.dump(meta, open(mp, "w"))
    new = ok(curl("-X", "POST", f"{API}/scripts/{WORKER}/versions",
                  "-F", f"metadata=@{mp};type=application/json",
                  "-F", f"index.js=@{tmp}/index.js;type=application/javascript+module;filename=index.js",
                  "-F", f"index.js.map=@{tmp}/index.js.map;type=application/source-map;filename=index.js.map"), "creazione versione")
    new_id = new["id"]
    names = {b["name"] for b in ok(curl(f"{API}/scripts/{WORKER}/versions/{new_id}"), "controllo versione")["resources"]["bindings"]}
    if not {"ADMIN_PASSWORD", "ASSETS", "GOKU"} <= names:
        sys.exit(f"STOP: la nuova versione {new_id} non ha tutti i collegamenti ({names}). Non attivata.")

    # 4) attivo la nuova versione
    deploy_version(new_id)
    print(f"Online: versione {new_id} (precedente: {old_version}) su {SITE}")


main()

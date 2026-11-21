# Stato operativo · 21 novembre 2026

Produzione su `feat/cloudflare-simple-hosting`, pubblicata da Workers Builds sul Worker `dr-goku`. Prima di questo aggiornamento il commit remoto e [/version.json](https://dr-goku.antonioflavioruocco-i.workers.dev/version.json) coincidevano su `636dc30`. Verifica lo SHA live a ogni deploy. La branch di produzione è aggiornata direttamente via Git, senza una PR di rilascio aperta.

- `feat/pokeprice` è ferma a `3c0f2e7`, già incluso in produzione. `feat/supabase-host-licenses` e la [PR #1](https://github.com/antonioflavioruoccoi/Progetto-Goku/pull/1) sono superate dal backend Cloudflare.
- `main` ospita il quiz standalone storico. `docs/contesto-codex` e la [PR #2](https://github.com/antonioflavioruoccoi/Progetto-Goku/pull/2) descrivono quel ramo. `feat/50-pokemon-card-images` è un ramo separato di dati e immagini, fuori dal rilascio.
- Le sessioni Admin preesistenti richiedono un nuovo accesso. La pulizia riguarda solo sessioni scadute e contatori di login scaduti. Partite, punteggi e licenze restano salvati.

# Dr. Goku

- Repository `antonioflavioruoccoi/Progetto-Goku`. Produzione su `feat/cloudflare-simple-hosting`, Worker `dr-goku`. Vedi [stato operativo](docs/STATUS.md).
- Mantieni nome Worker, binding `GOKU`, migrazione SQLite `v1`, segreti e dati di partite e licenze. Il codice applicativo in `worker/index.js` è l’autorità per permessi, timer, punteggi e persistenza.
- Interfaccia multiplayer in `web/`, quiz originale in `game.js`. Parti da `rg` e leggi solo i file necessari. Usa Graphify se hai già un grafo utile. Per verifiche mirate nel browser usa Agent Browser con sessioni Host e giocatore distinte.
- Esegui una build e avvia direttamente i test esistenti pertinenti con `node --test` (comandi nel [README](README.md)). Se pubblichi, usa la branch di produzione collegata al Worker e confronta `/version.json` con lo SHA pubblicato.

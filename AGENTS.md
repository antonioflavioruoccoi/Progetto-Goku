# Progetto Goku · Dr. Goku

Quiz multiplayer online con licenza. Repo: `antonioflavioruoccoi/Progetto-Goku`. Sito: Worker Cloudflare `dr-goku` (https://dr-goku.antonioflavioruocco-i.workers.dev). Il server multiplayer **non è in questa repo** e non va mai sostituito.

## Come lavorare
- Spiega tutto in italiano, in modo semplice: l'utente non sa programmare.
- Usa le skill disponibili: risparmiano token e riducono l'AI Slop.
- Stile: molto catchy (animazioni, immagini, giochi interattivi), **mobile first** (touch, schermo verticale, vibrazione), tono da quizzer professionista, UX semplice e fluida.
- Codice: pensa prima di scrivere e dichiara le ipotesi; il minimo codice che risolve; modifiche mirate nello stile esistente (segnala il codice morto altrui, non cancellarlo); definisci come verificare e controlla prima di dire "fatto".
- Risparmio token (God Mode): [.claudeignore](.claudeignore) e [.serena/project.yml](.serena/project.yml). `app.js` e `app.css` sono enormi: cerca prima, poi apri solo le righe giuste.

## Dove intervenire
- **Quiz originale Pixelcard** (giocatore singolo): [index.html](index.html), [style.css](style.css), [game.js](game.js). 6 carte Pokémon, 30 secondi, immagine che si de-pixela. Pokédex in `pokemon_pokedex_nazionale.txt`, caricato con `fetch` (serve un server HTTP). In `game.js`: `cards`, `loadGame`, `renderPixels`, `resolveName`, `finishRound`. Shift+N salta alla carta successiva.
- **Multiplayer**: `play/`, `host/`, `admin/` (stesso HTML), grafica in [app.css](app.css), logica in [app.js](app.js). Accesso Admin, inviti Host con licenza, stanze con PIN e QR, lobby, filtro nickname.
- **Quiz**: *Pokémon* (6 carte + 6 PokéIndizi + 12 PokéPrice) e *Cultura generale* (7 manche: Popolazione, Cronologia, Puzzle, Prato fiorito, Per un pelo, Album dei ricordi, 50 Sfumature). Le regole di gioco sono nel server (`server/worker-index.js`): si pubblicano con l'opzione `server`.
- **Manche 3 Puzzle** (scambiata con Per un pelo, ora manche 5): [puzzle.js](puzzle.js). Le foto vengono da `nome-cartella/` e sono copiate compresse in `assets/puzzle/` con un nome in codice; nomi, risposte e ordine dei pezzi sono in `PUZZLE_IMAGES` nel server. Sul telefono il puzzle non si vede.
- **Manche 6 Album dei ricordi**: [album.js](album.js) e [album.css](album.css). Foto in `Album dei ricordi/` (`Nome Persona - bambino.jpg` e `Nome Persona - adulto.jpg`), indizi in [album-dei-ricordi/indizi.json](album-dei-ricordi/indizi.json) (`{ "Nome Persona": ["difficile", "medio", "facile"] }`). Dopo una modifica lancia `python3 server/build-album.py`: controlla foto e indizi, copia le foto in `assets/album/` e aggiorna server e lista dei file (lo fa anche `deploy.py`). Test dei nomi: `node --test server/`.
- **Manche 7 50 Sfumature**: [shades.js](shades.js) e [shades.css](shades.css). 18 PNG (loghi, cartoni, bandiere) in `50sfumature/`, dati in [50sfumature/elementi.json](50sfumature/elementi.json) (`{ "file.png": { "nome", "categoria", "zona", "colore": "#rrggbb" } }`, `tolleranza` facoltativa). Dopo una modifica lancia `python3 server/build-sfumature.py` (serve Pillow e numpy, quindi non lo fa `deploy.py`): crea in `assets/sfumature/` l'immagine con la zona bianca e la maschera, misura il colore esatto (resta solo nel server) e aggiorna server e lista dei file. Punteggio 0-200 con CIEDE2000 (`shadesScore`, test in `server/shades-score.test.mjs`).
- **Immagini**: `assets/` (flags, interface, pokeindizi, pokemon-cardmarket-100-500, pokeprice), `nome-cartella/` (Puzzle), `Album dei ricordi/` (Album), `50sfumature/` (50 Sfumature); quelle del quiz originale sono nella cartella principale.

## Backup e pubblicazione
- Prima di una modifica grande fai un backup: dura **72 ore**, il primo task dopo la scadenza lo elimina. Attuali: `backup-2026-11-25/` (scade il 28/11/2026) e `backup-2026-11-26/` (versione 28, scade il 29/11/2026) e `backup-2026-11-26b/` (prima dei fix grafici di Manche 5 e 6, scade il 29/11/2026) e `backup-2026-11-26c/` (prima del ritorno allo stile v27 della home e dell'inversione manche 3/5, scade il 29/11/2026) e `backup-2026-11-26d/` (prima della manche 7 "50 Sfumature", scade il 29/11/2026).
- Dopo ogni modifica al sito, se non ci sono errori, pubblica subito **senza chiedere**, salvo indicazione contraria.
- "Online" = su Cloudflare: `python3 .claude/deploy.py` (`rollback` per tornare indietro). Carica solo i file di [.claude/deploy-files.txt](.claude/deploy-files.txt): se aggiungi un file al sito, aggiungilo lì.
- Dal cloud `deploy.py` fallisce con "Unauthorized" al caricamento dei file. Lì si pubblica con GitHub Actions: committa e pusha sul tuo branch, poi avvia il workflow "Pubblica online" ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)) su quel branch con lo strumento GitHub `actions_run_trigger`. Opzione `server: true` solo se è cambiato `server/worker-index.js` e la richiesta lo autorizza; `rollback: true` per tornare indietro. Controlla l'esito del workflow prima di dire "online".

## Verifica
Avvia `python3 -m http.server 8000` e apri http://localhost:8000 (non con doppio clic). Quiz originale: prova avvio, pausa, risposta o scadenza, **Continua**, **Rigioca**; se cambi carte, durata o punti, aggiorna le etichette in `index.html` e `game.js`. Multiplayer: in locale serve il Worker (`npx wrangler dev` con una configurazione di prova fuori dalla repo: DO `GOKU` classe `Goku` SQLite, assets nella cartella del sito, `ADMIN_PASSWORD` di prova); altrimenti si prova online. Controlla sempre in verticale su telefono.

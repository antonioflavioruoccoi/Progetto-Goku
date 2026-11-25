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
- **Quiz**: *Pokémon* (6 carte + 6 PokéIndizi + 12 PokéPrice) e *Cultura generale* (4 manche).
- **Immagini**: `assets/` (flags, interface, pokeindizi, pokemon-cardmarket-100-500, pokeprice), `nome-cartella/` (Cultura generale); quelle del quiz originale sono nella cartella principale.

## Backup e pubblicazione
- Prima di una modifica grande fai un backup: dura **72 ore**, il primo task dopo la scadenza lo elimina. Attuale: `backup-2026-11-25/`, scade il 28/11/2026.
- Dopo ogni modifica al sito, se non ci sono errori, pubblica subito **senza chiedere**, salvo indicazione contraria.
- "Online" = su Cloudflare: `python3 .claude/deploy.py` (`rollback` per tornare indietro). Carica solo i file di [.claude/deploy-files.txt](.claude/deploy-files.txt): se aggiungi un file al sito, aggiungilo lì.
- Limite noto (25/11/2026): dal cloud il caricamento fallisce con "Unauthorized". Va fatto da un computer con accesso a Cloudflare.

## Verifica
Avvia `python3 -m http.server 8000` e apri http://localhost:8000 (non con doppio clic). Quiz originale: prova avvio, pausa, risposta o scadenza, **Continua**, **Rigioca**; se cambi carte, durata o punti, aggiorna le etichette in `index.html` e `game.js`. Multiplayer: una partita vera si prova solo online. Controlla sempre in verticale su telefono.

Nota: `README.md` descrive ancora il vecchio sito Pixelcard su ChatGPT e va aggiornato.

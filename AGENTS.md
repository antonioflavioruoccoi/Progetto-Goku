# Progetto Goku · Dr. Goku

Quiz multiplayer online con licenza. Le regole di lavoro (tono, mobile first, backup, pubblicazione) stanno in [.claude/CLAUDE.md](.claude/CLAUDE.md): leggile per prime.

Sito ufficiale: Worker Cloudflare `dr-goku` (https://dr-goku.antonioflavioruocco-i.workers.dev). Il codice multiplayer del server **non è in questa repo** e non va mai sostituito.

## Dove intervenire

- **Quiz originale Pixelcard (giocatore singolo).** [index.html](index.html), [style.css](style.css) e [game.js](game.js): 6 carte Pokémon da indovinare in 30 secondi, immagine che si "de-pixela" col tempo. Il Pokédex è in [pokemon_pokedex_nazionale.txt](pokemon_pokedex_nazionale.txt), caricato con `fetch`, quindi serve un server HTTP. In `game.js` cerca `cards`, `loadGame`, `renderPixels`, `resolveName`, `finishRound`. Con Shift+N si salta alla carta successiva.
- **Multiplayer live.** Le pagine [play/](play/index.html), [host/](host/index.html) e [admin/](admin/index.html) hanno lo stesso HTML: la grafica è in [app.css](app.css), la logica in [app.js](app.js). Entrambi i file sono molto lunghi e scritti su poche righe: cerca il testo che ti serve con `grep` invece di aprirli interi. Funzioni visibili nell'HTML: accesso Admin, inviti personali per gli Host, licenze (durata, numero di stanze, quiz abilitati), creazione stanze con PIN e QR, lobby, filtro nickname.
- **Quiz disponibili.** *Pokémon*: 6 carte + 6 PokéIndizi + 12 PokéPrice (confronto di prezzi Cardmarket, higher/lower). *Cultura generale*: 4 manche (tra cui Popolazione, con le bandiere).
- **Immagini e dati.** Nella cartella [assets/](assets) trovi `flags`, `interface`, `pokeindizi`, `pokemon-cardmarket-100-500` e `pokeprice`. Le immagini della cartella `nome-cartella/` sono per Cultura generale. Le immagini e gli audio del quiz originale stanno nella cartella principale.

Non ci sono sottocartelle di codice: tutto il codice è nella cartella principale e in `play/`, `host/`, `admin/`.

## Pubblicazione e backup

- "Online" significa pubblicato su Cloudflare. Si pubblica con `python3 .claude/deploy.py` (`rollback` per tornare indietro). Il comando carica solo i file elencati in [.claude/deploy-files.txt](.claude/deploy-files.txt): se aggiungi un file al sito, aggiungilo anche lì.
- Limite noto (25/11/2026): dal cloud il caricamento fallisce con "Unauthorized". La pubblicazione va fatta da un computer con accesso a Cloudflare.
- Prima di una modifica grande crea un backup. Il backup attuale è in `backup-2026-11-25/` e scade il 28/11/2026: il primo task dopo quella data lo cancella.

## Come verificare

Avvia `python3 -m http.server 8000` dalla cartella principale e apri http://localhost:8000. Non aprire i file con doppio clic: il Pokédex ha bisogno del server HTTP.

- Se tocchi il quiz originale: prova avvio, pausa e ripresa, risposta o scadenza, **Continua** e **Rigioca**. Se cambi il numero di carte, la durata o il punteggio, aggiorna anche le etichette e il massimo mostrato in `index.html` e `game.js`.
- Se tocchi il multiplayer, ricorda che il server non è in questa repo: una partita vera si prova solo sul sito online.
- Controlla sempre la pagina in verticale su telefono (mobile first).

## Risparmio di token (God Mode)

La repo ha [.claudeignore](.claudeignore) (cosa non leggere) e [.serena/project.yml](.serena/project.yml) (navigazione del codice con Serena). Poiché `app.js` e `app.css` sono enormi, evita di leggerli per intero: cerca prima, poi apri solo le righe giuste.

## Da sapere

- [README.md](README.md) descrive ancora il vecchio sito privato di Pixelcard su ChatGPT e va aggiornato.

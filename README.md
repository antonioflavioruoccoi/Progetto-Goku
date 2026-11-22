# Dr. Goku · Cloudflare Free

Quiz originale su `/`, multiplayer su `/play/`, gestione su `/host/`, amministrazione su `/admin/`, inviti su `/invite/`. Il quiz originale, la grafica, le animazioni, la musica e gli asset sono conservati. Non servono Supabase, email, OTP, account Host, SMTP o database esterni.

## Produzione e pubblicazione

La branch di produzione è `feat/cloudflare-simple-hosting`. Il Worker esistente `dr-goku` è collegato a questa branch tramite Cloudflare Workers Builds.

1. Esegui le verifiche locali mirate e pubblica il commit sulla branch di produzione.
2. Attendi che il deploy del Worker esistente termini. Il build usa `npm run build` e scrive lo SHA Git in `dist/version.json`.
3. Confronta il commit pubblicato con [/version.json](https://dr-goku.antonioflavioruocco-i.workers.dev/version.json). Se gli SHA differiscono, controlla il log di Workers Builds.

Conserva il Worker `dr-goku`, il binding `GOKU`, la migrazione SQLite `v1` e il secret `ADMIN_PASSWORD` configurato sul Worker. Consulta [lo stato operativo](docs/STATUS.md) per le branch e le PR storiche.

## Partita di prova in locale

1. Apri `/admin/` e inserisci la password. Premi **Crea stanza**: compare la lobby con PIN e QR.
2. Su due telefoni o in due profili browser diversi apri `/play/`, inserisci PIN e nickname oppure scansiona il QR. Non usare più schede dello stesso browser per simulare persone diverse: condividono l’identità.
3. Sullo schermo Host premi **Avvia partita**, prova pausa/ripresa, risposte, classifica e le sei carte, poi il podio. Le carte sono mostrate sullo schermo del conduttore; i telefoni ricevono il campo risposta, come nel multiplayer precedente.
4. Ricarica un telefono durante la partita: identità, tentativi e punteggio vengono recuperati. Prova anche a disattivare e riattivare la rete.
5. Torna alla dashboard Admin, scegli durata in ore e quota stanze e premi **Genera invito**, poi **Copia link**. Condividi manualmente su WhatsApp.
6. Apri il link in un altro browser: viene riscattato automaticamente e porta alla dashboard Host. Un clic su **Crea stanza** basta per aprire la lobby. Lo stesso link non funziona in un secondo browser. Prova **Revoca** nell’Admin e verifica che l’Host non possa più comandare la partita.

## Architettura e permessi

Un Worker serve asset statici e API same-origin. Un Durable Object SQLite unico (`GOKU`, istanza `goku`) contiene licenze, hash di sessione e partite. È una scelta semplice per piccoli eventi: riscatto, consumo quota, revoca e comandi condividono la stessa autorità. Ogni mutazione usa una transazione SQLite sincrona, quindi richieste concorrenti non possono consumare oltre la quota o riscattare due volte un invito. Non esistono API SQL pubbliche.

- **Admin:** password verificata sul server; cinque errori per IP bloccano i tentativi per 15 minuti. Può creare stanze senza quota applicativa, vedere e controllare tutte le partite, generare e revocare licenze.
- **Host:** link con 256 bit casuali, conservato solo come SHA-256. Il frammento URL viene rimosso dalla barra, custodito temporaneamente in sessionStorage e inviato soltanto al riscatto. La prima apertura lo consuma; non inoltrare il link dopo averlo aperto tu. La quota conta tutte le stanze create, anche se concluse. Scadenza: niente nuove stanze o avvio di lobby; le partite già iniziate possono concludersi. Revoca: tutti i privilegi vengono bloccati immediatamente, anche nelle partite iniziate. L’Admin può proseguirle o terminarle.
- **Giocatore:** sessione anonima e nickname; nessuna registrazione. Cookie persistente nello stesso browser, senza segreti in localStorage. Per recuperare una stanza usa il suo URL `?room=…` o reinserisci il PIN nello stesso browser. Cancellare i cookie o cambiare browser perde l’identità.
- **Sessioni:** token opachi casuali, solo hash nel database, cookie `__Host-goku`, `HttpOnly`, `Secure`, `SameSite=Strict`, durata massima un anno; logout invalida il token sul server. La durata del cookie non estende la licenza. Le sessioni Admin dipendono dalla password corrente. Le sessioni Admin precedenti a questo aggiornamento o a una rotazione richiedono un nuovo accesso. Usa una password nuova a ogni rotazione.
- **CSRF:** API POST JSON e WebSocket richiedono un Origin esattamente uguale a quello del sito; niente CORS aperto. Ruoli e licenze vengono verificati nuovamente sul server a ogni operazione sensibile. Una sessione giocatore non può promuoversi manipolando HTTP.

Sei carte mescolate sul server, 30 secondi effettivi per domanda dopo due secondi di preparazione. Tre tentativi; nomi inesistenti non consumano tentativi. Correzione dei refusi con le stesse soglie e distanza di Levenshtein del quiz originale. Il server calcola `ceil(secondi rimasti) × 10`; invii duplicati con lo stesso ID non duplicano punti o tentativi. I punteggi vengono consolidati una sola volta alla rivelazione o alla terminazione. Le parità condividono il rango. Pause, deadline e progressione non dipendono dall’orologio del telefono.

I giocatori non ricevono ordine delle carte, URL della carta corrente o soluzione prima della rivelazione. Il conduttore autorizzato riceve solo l’immagine corrente con nome opaco. Il quiz originale pubblico conserva necessariamente il suo catalogo e le sue immagini: non è un sistema anti-cheat contro chi studia le sei carte prima dell’evento.

## WebSocket e piano Free

I WebSocket usano `acceptWebSocket` e attachment persistenti della **Hibernation API**. Il server invia snapshot autorizzati su join, risposta, comandi, connessioni/disconnessioni e rivelazione. La riconnessione automatica ha ritardo crescente con jitter e usa l’API HTTP per aggiornare lo stato durante le interruzioni del WebSocket. Il timer è locale, con una verifica del server alla scadenza.

Un solo allarme Durable Object punta alla prima deadline di domanda attiva. Non ci sono `setInterval` sul server: lobby, pause e partite finite consentono l’ibernazione. Le deadline vengono anche controllate a ogni operazione, quindi un allarme in ritardo non permette risposte tardive. La presenza indica le connessioni WebSocket conosciute; una rete interrotta senza chiusura esplicita può richiedere il timeout del trasporto per apparire offline.

SQLite Durable Objects e Workers Static Assets sono utilizzabili sul piano Free. Le stanze Admin non hanno una quota applicativa, ma **Free non significa risorse illimitate**: restano i limiti Cloudflare di richieste, CPU, storage e operazioni SQLite. Consultare https://developers.cloudflare.com/workers/platform/limits/ e https://developers.cloudflare.com/durable-objects/platform/pricing/ prima di eventi grandi. Al raggiungimento delle quote Free il servizio può rifiutare operazioni; questo progetto non attiva un piano a pagamento.

Limiti applicativi: 100 giocatori per stanza e 500 WebSocket totali. L’istanza unica e gli snapshot completi privilegiano semplicità per eventi piccoli, non grandi carichi simultanei. Non è stato eseguito un benchmark di carico. Le richieste eliminano periodicamente solo le sessioni scadute e le finestre esaurite del rate limit. Il database conserva licenze, partite e punteggi. Non esiste una migrazione automatica degli account o delle partite del precedente backend Supabase.

## Sviluppo e verifiche locali

Node.js 22+:

```sh
npm ci
cp .dev.vars.example .dev.vars
# Modifica ADMIN_PASSWORD in .dev.vars (file ignorato da Git).
npm run dev
```

Wrangler inizializza binding e SQLite locali in `.wrangler/`; apri `http://localhost:8787`. I browser moderni trattano localhost come origine affidabile per i cookie Secure; non usare un indirizzo HTTP LAN per simulare i telefoni, usa HTTPS. Il secret locale non viene caricato automaticamente in produzione.

```sh
npm run build
node --test tests/frontend.test.mjs tests/game-server.test.mjs tests/cloudflare.test.mjs
```

I test d’integrazione usano Miniflare/workerd, SQLite temporaneo e un vero allarme di 30 secondi: durano circa 40 secondi. Verificano autorizzazione Admin/giocatori, CSRF, rate limit, cookie, inviti invalidi/scaduti/revocati/riscattati, riscatto concorrente, quote concorrenti, isolamento stanze, timer, tre tentativi, idempotenza, pause, punti, snapshot e riconnessione WebSocket, scadenza vs revoca, persistenza dopo riavvio del runtime. Il quiz originale è testato con DOM simulato, comprese pixelatura, animazioni, refusi, punteggio e finale.

La verifica locale non dimostra l’eviction/ibernazione effettiva in produzione, i limiti di carico, il comportamento su tutti i telefoni o la riuscita di Workers Builds remoto. Dopo la pubblicazione verifica `/version.json` e le pagine pubbliche.


## Manche multiplayer

Dopo la sesta carta Pixelcard il server consolida i punti e avvia automaticamente 5 secondi di introduzione con Oak, poi sei PokéIndizi casuali senza ripetizioni dal dataset di dodici. PIN, identità e WebSocket restano gli stessi. Gli indizi si sbloccano a 30/20/10 secondi; dopo la seconda manche si passa a PokéPrice. I 12 confronti di PokéPrice precedono il podio cumulato.

Nella schermata del conduttore, **Shift + N** passa al round successivo e consolida una sola volta i punti già ottenuti. In Quanto ci vai vicino? la scorciatoia è disponibile solo al termine della rivelazione. Si usa fuori dal campo di risposta e funziona anche nel quiz originale. Nel multiplayer il server verifica ruolo, licenza, fase e revisione.

Cultura generale comprende 10 confronti sulla popolazione, 5 round di Cronologia, 6 domande di Quanto ci vai vicino? e il podio finale. In Cronologia ogni posizione corretta vale 50 punti.

Asset locali e limiti: [ASSET_SOURCES.md](assets/pokeindizi/ASSET_SOURCES.md). Per i Pokémon recenti si usano icone dei giochi, non falsi sprite Game Boy.

Sfondo video di PokéPrice: [Hilda and Tepig Watching Castelia City, MoeWalls](https://moewalls.com/pixel-art/hilda-and-tepig-watching-castelia-city-pokemon-pixel-live-wallpaper/).

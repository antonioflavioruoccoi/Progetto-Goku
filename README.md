# Dr. Goku · Cloudflare Free

Quiz originale su `/`, multiplayer su `/play/`, gestione su `/host/`, amministrazione su `/admin/`, inviti su `/invite/`. Il quiz originale, la grafica, le animazioni, la musica e gli asset sono conservati. Non servono Supabase, email, OTP, account Host, SMTP o database esterni.

## Configurazione per principianti

### 1. Creare l’account Cloudflare Free

1. Vai su https://dash.cloudflare.com/sign-up e crea un account; verifica l’indirizzo richiesto da Cloudflare per **il tuo account Cloudflare**, non per giocare.
2. Apri **Workers & Pages** (può trovarsi sotto **Compute & AI**), scegli il piano Workers **Free**. Non attivare Workers Paid. Non occorre acquistare un dominio: riceverai un indirizzo `dr-goku.<tuo-sottodominio>.workers.dev`.
3. Se richiesto, scegli il sottodominio Workers dell’account.

### 2. Collegare GitHub

1. In Workers & Pages scegli **Create application → Import a repository / Connect Git** e GitHub. Usa **Workers**, non il flusso Pages.
2. Autorizza l’app GitHub di Cloudflare ad accedere alla repository `antonioflavioruoccoi/Progetto-Goku`.
3. Seleziona la branch **`feat/cloudflare-simple-hosting`** come branch di produzione del nuovo Worker. Non cambiare `main` e non collegare questo deployment a `main`.
4. Nome Worker: **`dr-goku`**, come in `wrangler.jsonc`; directory radice: `/` (radice della repository).
5. Build command: **`npm run build`**. Deploy command: **`npx wrangler deploy`**. Cloudflare installa le dipendenze dal lockfile. Usa Node **22 o successivo** (variabile build `NODE_VERSION=22` se necessario).
6. `wrangler.jsonc` contiene già pubblicazione di `dist/`, binding `GOKU` e migrazione SQLite `v1`. La configurazione `build.command` rende sicuro anche il deploy da terminale; nel flusso Builds il build può essere ripetuto, senza modificare i dati.

### 3. Impostare il Secret

Nel Worker apri **Settings → Variables and Secrets → Add**:

- tipo **Secret**;
- nome esatto **`ADMIN_PASSWORD`**;
- valore: una password lunga, unica, scelta da te e conservata in un password manager.

Salva e distribuisci la modifica. Se il wizard non permette di aggiungere il secret prima del primo deploy, termina il primo deploy e aggiungilo subito dopo: finché manca, l’accesso Admin è disabilitato. Non inserirlo nel codice, in GitHub, nel comando di build o in una variabile frontend. Non serve `SESSION_SECRET`: le sessioni usano token casuali e solo i loro hash sono persistiti.

### 4. Pubblicare il sito

Premi **Deploy** nel wizard (oppure **Retry deployment** dopo la configurazione). Il deploy crea automaticamente il Durable Object SQLite; le tabelle vengono inizializzate dal codice al primo utilizzo. **Nessuna query SQL manuale.** Apri l’URL HTTPS `workers.dev` mostrato nel pannello. I successivi push sulla branch collegata avviano Workers Builds.

Se il nome Worker è già occupato nel tuo account, scegli un altro nome sia nel pannello sia in `wrangler.jsonc`. Non eliminare il binding, il nome della classe o la migrazione esistente dopo aver iniziato a usare le partite: identificano i dati persistenti.

Alternativa da terminale, dalla stessa branch:

```sh
npm ci
npx wrangler login
npx wrangler secret put ADMIN_PASSWORD
npm run deploy
```

Il comando secret chiede il valore senza salvarlo nella repository. Se il Worker non esiste ancora, accetta la sua creazione oppure esegui prima `npm run deploy` e poi imposta il secret.

### 5. Fare una partita di prova

1. Apri `/admin/` e inserisci la password. Premi **Crea stanza**: compare la lobby con PIN e QR.
2. Su due telefoni o in due profili browser diversi apri `/play/`, inserisci PIN e nickname oppure scansiona il QR. Non usare più schede dello stesso browser per simulare persone diverse: condividono l’identità.
3. Sullo schermo Host premi **Avvia partita**, prova pausa/ripresa, risposte, classifica e le sei carte, poi il podio. Le carte sono mostrate sullo schermo del conduttore; i telefoni ricevono il campo risposta, come nel multiplayer precedente.
4. Ricarica un telefono durante la partita: identità, tentativi e punteggio vengono recuperati. Prova anche a disattivare e riattivare la rete.
5. Torna alla dashboard Admin, scegli durata in ore e quota stanze e premi **Genera invito**, poi **Copia link**. Condividi manualmente su WhatsApp.
6. Apri il link in un altro browser: viene riscattato automaticamente e porta alla dashboard Host. Un clic su **Crea stanza** basta per aprire la lobby. Lo stesso link non funziona in un secondo browser. Prova **Revoca** nell’Admin e verifica che l’Host non possa più comandare la partita.

I passaggi manuali inevitabili sono creazione dell’account, autorizzazione GitHub, selezione della branch, scelta del secret e primo deploy. Nessun deploy remoto è stato eseguito o verificato da questo lavoro.

## Architettura e permessi

Un Worker serve asset statici e API same-origin. Un Durable Object SQLite unico (`GOKU`, istanza `goku`) contiene licenze, hash di sessione e partite. È una scelta semplice per piccoli eventi: riscatto, consumo quota, revoca e comandi condividono la stessa autorità. Ogni mutazione usa una transazione SQLite sincrona, quindi richieste concorrenti non possono consumare oltre la quota o riscattare due volte un invito. Non esistono API SQL pubbliche.

- **Admin:** password verificata sul server; cinque errori per IP bloccano i tentativi per 15 minuti. Può creare stanze senza quota applicativa, vedere e controllare tutte le partite, generare e revocare licenze.
- **Host:** link con 256 bit casuali, conservato solo come SHA-256. Il frammento URL viene rimosso dalla barra, custodito temporaneamente in sessionStorage e inviato soltanto al riscatto. La prima apertura lo consuma; non inoltrare il link dopo averlo aperto tu. La quota conta tutte le stanze create, anche se concluse. Scadenza: niente nuove stanze o avvio di lobby; le partite già iniziate possono concludersi. Revoca: tutti i privilegi vengono bloccati immediatamente, anche nelle partite iniziate. L’Admin può proseguirle o terminarle.
- **Giocatore:** sessione anonima e nickname; nessuna registrazione. Cookie persistente nello stesso browser, senza segreti in localStorage. Per recuperare una stanza usa il suo URL `?room=…` o reinserisci il PIN nello stesso browser. Cancellare i cookie o cambiare browser perde l’identità.
- **Sessioni:** token opachi casuali, solo hash nel database, cookie `__Host-goku`, `HttpOnly`, `Secure`, `SameSite=Strict`, durata massima un anno; logout invalida il token sul server. La durata del cookie non estende la licenza. La rotazione della password non revoca automaticamente le sessioni Admin già emesse.
- **CSRF:** API POST JSON e WebSocket richiedono un Origin esattamente uguale a quello del sito; niente CORS aperto. Ruoli e licenze vengono verificati nuovamente sul server a ogni operazione sensibile. Una sessione giocatore non può promuoversi manipolando HTTP.

Sei carte mescolate sul server, 30 secondi effettivi per domanda dopo due secondi di preparazione. Tre tentativi; nomi inesistenti non consumano tentativi. Correzione dei refusi con le stesse soglie e distanza di Levenshtein del quiz originale. Il server calcola `ceil(secondi rimasti) × 10`; invii duplicati con lo stesso ID non duplicano punti o tentativi. I punteggi vengono consolidati una sola volta alla rivelazione o alla terminazione. Le parità condividono il rango. Pause, deadline e progressione non dipendono dall’orologio del telefono.

I giocatori non ricevono ordine delle carte, URL della carta corrente o soluzione prima della rivelazione. Il conduttore autorizzato riceve solo l’immagine corrente con nome opaco. Il quiz originale pubblico conserva necessariamente il suo catalogo e le sue immagini: non è un sistema anti-cheat contro chi studia le sei carte prima dell’evento.

## WebSocket e piano Free

I WebSocket usano `acceptWebSocket` e attachment persistenti della **Hibernation API**. Il server invia snapshot autorizzati su join, risposta, comandi, connessioni/disconnessioni e rivelazione. La riconnessione automatica ha ritardo crescente con jitter e riceve lo stato completo. Non c’è polling ogni cinque secondi, né heartbeat applicativo permanente. Il timer grafico locale non fa richieste continue.

Un solo allarme Durable Object punta alla prima deadline di domanda attiva. Non ci sono `setInterval` sul server: lobby, pause e partite finite consentono l’ibernazione. Le deadline vengono anche controllate a ogni operazione, quindi un allarme in ritardo non permette risposte tardive. La presenza indica le connessioni WebSocket conosciute; una rete interrotta senza chiusura esplicita può richiedere il timeout del trasporto per apparire offline.

SQLite Durable Objects e Workers Static Assets sono utilizzabili sul piano Free. Le stanze Admin non hanno una quota applicativa, ma **Free non significa risorse illimitate**: restano i limiti Cloudflare di richieste, CPU, storage e operazioni SQLite. Consultare https://developers.cloudflare.com/workers/platform/limits/ e https://developers.cloudflare.com/durable-objects/platform/pricing/ prima di eventi grandi. Al raggiungimento delle quote Free il servizio può rifiutare operazioni; questo progetto non attiva un piano a pagamento.

Limiti applicativi: 100 giocatori per stanza e 500 WebSocket totali. L’istanza unica e gli snapshot completi privilegiano semplicità per eventi piccoli, non grandi carichi simultanei. Non è stato eseguito un benchmark di carico. Licenze e partite rimangono persistite, senza cancellazione automatica dello storico; monitorare spazio e metriche dal pannello Cloudflare. Non esiste una migrazione automatica degli account o delle partite del precedente backend Supabase.

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
npm test        # frontend, quiz originale e integrazione workerd/SQLite/WebSocket
npm run check   # build e wrangler deploy --dry-run, senza pubblicare
```

I test d’integrazione usano Miniflare/workerd, SQLite temporaneo e un vero allarme di 30 secondi: durano circa 40 secondi. Verificano autorizzazione Admin/giocatori, CSRF, rate limit, cookie, inviti invalidi/scaduti/revocati/riscattati, riscatto concorrente, quote concorrenti, isolamento stanze, timer, tre tentativi, idempotenza, pause, punti, snapshot e riconnessione WebSocket, scadenza vs revoca, persistenza dopo riavvio del runtime. Il quiz originale è testato con DOM simulato, comprese pixelatura, animazioni, refusi, punteggio e finale.

La verifica locale non dimostra l’eviction/ibernazione effettiva in produzione, i limiti di carico, il comportamento su tutti i telefoni o la riuscita di Workers Builds remoto. Eseguire la partita di prova dopo il primo deploy pubblico.


## PokéIndizi e pubblicazione aggiornata

Dopo la sesta carta Pixelcard il server consolida i punti e avvia automaticamente 5 secondi di introduzione con Oak, poi sei PokéIndizi casuali senza ripetizioni dal dataset di dodici. PIN, identità e WebSocket restano gli stessi. Gli indizi si sbloccano a 30/20/10 secondi; dopo la seconda manche il normale avanzamento mostra il podio cumulato.

Nella schermata del conduttore, **Shift + N** salta le carte rimanenti, consolida una sola volta i punti del round corrente e avvia la stessa introduzione. Non funziona nei campi testo, sui telefoni giocatore o durante PokéIndizi. Il server verifica ruolo, licenza, fase e revisione.

Asset locali e limiti: [ASSET_SOURCES.md](assets/pokeindizi/ASSET_SOURCES.md). Per i Pokémon recenti si usano icone dei giochi, non falsi sprite Game Boy.

Sito esistente: https://dr-goku.antonioflavioruocco-i.workers.dev/play/ . La presenza di questo URL non certifica un deploy: confrontare `/version.json` con `git rev-parse HEAD` e con la versione attiva in Cloudflare. Non creare un secondo Worker, non reinserire né ruotare ADMIN_PASSWORD per aggiornare il codice.

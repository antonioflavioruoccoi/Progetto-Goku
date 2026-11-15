# Progetto-Goku · Pixelcard Live

HTML, CSS e JavaScript senza framework. Il quiz originale resta su `/`: asset, animazioni, musica e `game.js` sono invariati. Il collegamento in home apre il multiplayer. Le nuove pagine sono `/play/`, `/host/`, `/admin/`, `/invite/`; gli hosting statici normalmente reindirizzano le varianti senza slash alle rispettive directory.

**Stato:** codice e migrazioni pronti; serve un progetto Supabase configurato prima dell'uso pubblico. Non sono stati configurati né testati un progetto Supabase remoto, l'invio email OTP o il trasporto Realtime ospitato. Il sito Sites preesistente non viene modificato da questa repository.

## Architettura

- Supabase Auth: OTP email per Admin/Host; sessione anonima persistente nel browser per i giocatori. Il nickname si sceglie entrando nella stanza.
- Supabase PostgreSQL: RPC `public.goku(action, payload)` con transazioni, `SECURITY DEFINER`, `search_path` vuoto e autorizzazione dell'utente su ogni operazione. Nessuna Edge Function è necessaria: i controlli atomici sono funzioni PostgreSQL server.
- RLS su tutte le tabelle. Il browser può leggere solo stanze proprie o a cui partecipa; non può scrivere direttamente stanze, punteggi o permessi. `goku_private` non è esposto nelle API e contiene Admin, licenze, hash inviti, ordine delle domande, risposte e Pokédex.
- Realtime pubblica solo modifiche a `goku_rooms`, senza soluzioni. L'evento richiede un nuovo snapshot autorizzato. Un controllo ogni 5 secondi recupera disconnessioni e aggiorna la presenza; alla scadenza del timer si richiede subito lo stato. La presenza diventa “disconnesso” dopo 20 secondi senza heartbeat.
- Il timer usa timestamp del server e un offset stimato dal client solo per disegnarlo. Validità di inviti, licenze, risposte e punteggi usa sempre l'orologio PostgreSQL.
- Sei carte mescolate per stanza, 30 secondi, pixelatura con la formula originale, tre tentativi su nomi Pokémon validi. Un nome non riconosciuto non consuma tentativi; la correzione conserva la distanza di Levenshtein e le soglie originali. Risposta corretta: `ceil(secondi rimasti) * 10`. Feedback personale immediato come nell'originale; la classifica generale si aggiorna alla rivelazione. Pari merito con rango condiviso.
- Il client dei giocatori non riceve soluzioni, sequenza o URL della carta. Solo l'Host autorizzato riceve un percorso immagine opaco; la home originale conserva necessariamente il proprio catalogo statico, ma non rivela l'ordine casuale di una partita live.

## 1. Configurare Supabase

1. Crea un progetto Supabase. Non servono servizi ulteriori o abbonamenti implementati da questa applicazione.
2. Nel SQL Editor esegui in ordine `supabase/migrations/202611160001_goku.sql` e `supabase/seed.sql`. In alternativa collega la CLI (`supabase link --project-ref …`) ed esegui `supabase db push`, poi applica il seed dal SQL Editor. Per lo stack locale: `supabase start` e `supabase db reset` usano config e seed inclusi. Non rieseguire la migrazione già applicata; per cambi futuri aggiungi una nuova migrazione.
3. Authentication → Providers: abilita Email e **Anonymous Sign-Ins**. Mantieni la verifica email abilitata. Imposta Site URL all'URL pubblico dell'applicazione.
4. Authentication → Email Templates: usa il contenuto di `supabase/templates/otp.html` sia per **Confirm signup** sia per **Magic Link**. Deve contenere `{{ .Token }}`: l'interfaccia richiede un codice, non una password o il clic su un magic link. Consigliati sei cifre e scadenza 10 minuti.
5. Verifica l'invio email. Il mittente predefinito Supabase ha restrizioni sui destinatari e limiti di invio: per invitare indirizzi esterni può essere indispensabile configurare il proprio SMTP in Supabase. Non è stato configurato SMTP in questo lavoro e nessun servizio email aggiuntivo è incluso.
6. Realtime → Publications: la migrazione aggiunge `public.goku_rooms` a `supabase_realtime` se la publication esiste (normalmente è già presente). Se non esisteva durante la migrazione, abilita quella tabella dal pannello. **Non aggiungere le tabelle private.** Non aggiungere `goku_private` agli schemi esposti dalle API.

## 2. Configurare e pubblicare il frontend

Richiede Node.js 22+.

```sh
npm ci
cp .env.example .env
# Compila SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY
npm run build
python -m http.server 8000 --directory dist
```

Apri `http://localhost:8000/`. Pubblica **solo `dist/`** su un hosting statico HTTPS che serva gli `index.html` nelle directory. Build command: `npm ci && npm run build`; output: `dist`. Non serve una riscrittura SPA. Funziona anche sotto un prefisso di percorso, purché l'hosting normalizzi le directory con slash finale. Non pubblicare sorgenti SQL, `.env` o la cartella della repository al posto di `dist`.

Variabili:

| Variabile | Uso | Pubblica? |
| --- | --- | --- |
| `SUPABASE_URL` | URL progetto, necessario al build | Sì |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable key `sb_publishable_…` oppure legacy anon JWT, necessario al build | Sì |
| `SUPABASE_DB_URL` | Connessione PostgreSQL diretta/session pooler, solo script di bootstrap Admin | **No** |
| `ADMIN_EMAIL` | Email verificata dell'Admin, solo bootstrap | No |
| `TEST_DATABASE_URL` | PostgreSQL locale dedicato ai test | No |

Il build include esclusivamente URL e chiave pubblica; rifiuta una `sb_secret_…` o un JWT con ruolo diverso da `anon`. Nessuna `service_role` è necessaria nel frontend. Le chiavi segrete non devono essere impostate come chiave pubblica. Senza configurazione, il build riesce ma l'app mostra esplicitamente “Supabase non configurato”; non può ospitare partite.

## 3. Assegnare il primo Admin

1. Apri `/host/` e verifica tramite OTP l'email del proprietario. Non avrai ancora una licenza: è normale.
2. Su un terminale **fidato**, imposta `SUPABASE_DB_URL` e `ADMIN_EMAIL` in `.env`, quindi esegui `npm run admin:add`. Lo script cerca esattamente un account verificato e non anonimo e lo inserisce in `goku_private.admins`.
3. Riapri `/admin/`. Il controllo del ruolo avviene nel database, non mediante email o flag JavaScript.

In alternativa, dal SQL Editor Supabase del proprietario:

```sql
insert into goku_private.admins(user_id)
select id from auth.users
where lower(email) = lower('EMAIL_VERIFICATA_DEL_PROPRIETARIO')
  and email_confirmed_at is not null and coalesce(is_anonymous,false)=false
on conflict do nothing;
```

Verifica che sia stata selezionata la persona corretta. Nessuna API frontend permette di assegnare Admin. Per rimuoverlo usa il SQL Editor con il suo UUID. `/admin/` è una shell statica: non contiene dati amministrativi; dashboard, letture e mutazioni richiedono l'autorizzazione server. Un Host non può usarne le API nemmeno modificando l'HTML.

## 4. Uso durante gli eventi

**Admin:** accedi a `/admin/`, configura email, inizio/scadenza (ora locale del browser, salvata in UTC), quota complessiva e Pokémon. Genera e copia il link, condividendolo manualmente. Il link viene mostrato una sola volta: viene memorizzato solo SHA-256 del token. Se perdi il link, revoca la licenza e generane un'altra. Puoi vedere tutte le stanze, aprirle, interromperle e crearne senza licenza.

**Host:** apre il link personale, verifica esattamente l'email autorizzata e preme “Riscatta invito”. L'invito non è riutilizzabile. Il token è nel frammento URL (non inviato all'hosting o nel Referer), rimosso dalla barra e conservato in sessionStorage solo fino al riscatto. Dopo il riscatto apre `/host/`, sceglie licenza e quiz e crea la stanza. Può preparare una licenza futura riscattandola prima dell'inizio, ma non creare stanze finché non è valida.

La quota conta tutte le stanze create, non quelle simultanee; non si ripristina terminando una stanza. Il consumo usa un lock di riga transazionale. La scadenza blocca nuove stanze e l'avvio di lobby non ancora iniziate; una partita già iniziata può essere completata. La revoca blocca subito tutti i comandi Host anche con un JWT già valido. L'Admin conserva il controllo. La stanza revocata non viene chiusa automaticamente: l'Admin può terminarla.

**Giocatori:** aprono `/play/`, inseriscono PIN e nickname oppure scansionano il QR. Non vedono una registrazione. Stesso browser e stessa sessione recuperano identità, tentativi e punteggio dopo refresh. Non cancellare i dati del sito durante la partita; un altro browser/dispositivo rappresenta un altro giocatore. Gli ingressi nuovi sono ammessi solo in lobby.

L'Host proietta la lobby, usa “Avvia partita”, “Pausa/Riprendi” e “Prossima domanda”, poi “Mostra podio”. “Termina partita” chiude anticipatamente e consolida i punti già ottenuti. Prima di un evento prova host e due telefoni sul progetto configurato.

## Test e limiti di verifica

```sh
# Test senza database: quiz originale + frontend; test DB segnalato SKIP.
npm test
# Database locale usa una nuova database temporanea per ciascuna esecuzione.
docker run -d --name goku-postgres -e POSTGRES_PASSWORD=goku-local-tests \
  -p 127.0.0.1:55432:5432 postgres:17
TEST_DATABASE_URL=postgresql://postgres:goku-local-tests@127.0.0.1:55432/postgres npm test
```

I test DB richiedono una connessione **localhost** con permesso CREATE DATABASE. Creano e poi rimuovono solo un database temporaneo `goku_test_*`; preparano fixture `auth.users` e `auth.uid()` per modellare il contesto JWT. Non contattano Supabase né inviano email. Non puntarli a un database reale.

Copertura: anonimato e privilegi, Admin, Host valido, email non verificata/diversa, inviti scaduti/revocati/riusati, hash segreto, quota con 12 richieste concorrenti, RLS, stanza altrui, tre tentativi, invii idempotenti, punteggio/timer non modificabili, pause e timeout, riconnessione, classifica e finale, scadenza vs revoca. Il test del `game.js` originale esegue il flusso completo in DOM simulato e verifica animazione, pixelatura, tre tentativi, correzione, punteggio e finale.

**Non verificati:** consegna reale OTP/SMTP, autenticazione anonima del servizio ospitato, trasporto WebSocket Realtime e comportamento visuale su telefoni reali. Richiedono un progetto Supabase configurato e la relativa prova end-to-end. Il test PostgreSQL verifica le regole effettive della migrazione, non sostituisce questo collaudo.

## Manutenzione minima

Le risposte memorizzano tentativi/esito/punti, non il testo digitato. Dopo gli eventi, il proprietario può eliminare stanze concluse, vecchie ricevute idempotenti e account anonimi non più necessari dal backend. Per esempio, nel SQL Editor:

```sql
delete from public.goku_rooms where phase='finished' and created_at < now()-interval '7 days';
delete from goku_private.requests where created_at < now()-interval '7 days';
```

La cancellazione delle stanze elimina partecipanti e stato tramite cascade. Le licenze conservano lo storico delle quote consumate. Nessun pagamento, abbonamento o servizio commerciale aggiunto.

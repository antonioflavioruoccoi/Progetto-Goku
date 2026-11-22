# QUANTO CI VAI VICINO?
## Specifica ASTRA per SOL · The Number Vault

La cassaforte raccoglie in silenzio un numero da ciascun telefono. Quando scade il tempo, la sala vede prima dove sono cadute le stime, poi quanto sono lontane dalla soluzione. La domanda guida per il pubblico è «quanto ci siamo avvicinati?». Chi osserva può seguire l’intera storia sul proiettore.

### Collocazione e confini della modifica

Base verificata: worktree di produzione di Progetto-Goku, branch `feat/cloudflare-simple-hosting`, commit `90b7ed5`. Il grafo disponibile nel checkout Pixelcard riguarda il gioco originale. I riferimenti sotto derivano dai sorgenti multiplayer di produzione. Percorso di una **nuova** stanza Cultura generale: lobby → Popolazione (10) → Cronologia (5) → Quanto ci vai vicino? (6) → podio cumulativo esistente. Ogni giocatore resta in partita. Massimo 200 punti per domanda, 1.200 aggiuntivi per manche. I punteggi già assegnati restano acquisiti.

| File per SOL | Intervento circoscritto |
|---|---|
| Nuovo `worker/number-vault.js` | Catalogo privato, selezione, validazione dei limiti, punti e ordine del podio. Sul modello di separazione di `worker/chronology.js`. |
| `worker/index.js` | Estendere `cultureStages`, creazione stanza, `advanceRound`, `question`, ramo specifico di `answer` prima del ramo generico Cultura, `settle`, `command`, `snapshot` e filtro di `publicRoom`. |
| Nuovo `web/number-vault.js` | Come `web/chronology.js`: vista dedicata per i due ruoli, tastierino, scala e scene SVG originali associate per chiave. Riceve stato pubblico, tempo e callback di invio dalla shell. |
| `web/app.html`, `web/app.css` | Una sezione sorella di chronology-stage, stili confinati alla manche, controlli e simboli scenografici. Font Atkinson locale e icone d’interfaccia già distribuiti. |
| `web/app.js` | Collegare selezione in creazione stanza, `cultureRound`, dashboard, `renderRoom`, `tick`, fullscreen, audio, comandi e invio. Escludere pannello generico domanda/risultati mentre la scena occupa la stanza. Ripristinare shell e podio finali, rimuovere listener/animazioni di scena all’uscita. |
| `tests/game-server.test.mjs`, `tests/frontend.test.mjs` | Aggiungere casi mirati alla matrice finale. Aggiornare solo aspettative su percorso, conteggio manche e finale delle nuove stanze. |
| `README.md` | Aggiornare la sequenza documentata di Cultura generale. |

La build esistente raggruppa web/app.js con esbuild e copia lo stesso HTML sotto admin, host, play e invite. Gli SVG inline del renderer entrano nel bundle senza modificare lo script di build. Riutilizzare PIN, QR, licenze, sessioni, ID giocatore e nickname, `readable/control`, limite join di 100, POST /api/rpc, /api/socket, fallback polling, riconnessione e controllo revisione. Il DO Goku usa SQLite, tabella records(kind,id,data), con la stanza salvata come singolo record. Conservare Worker, binding GOKU e migrazione v1.

### Dati e transizioni autorevoli

Alla creazione di ogni nuova stanza culture, salvare un ordine privato di sei ID distinti (`vaultOrder`), immutabile per la partita. Il valore predefinito del selettore host «Domande di stima» è «Dimostrazione» Q01–Q06. In alternativa «Miste» pesca senza reinserimento due facili e quattro medie e mescola le sei sul server, con lo stesso criterio di estrazione già adottato alla creazione stanza. Validare la modalità. L’assenza di vaultOrder identifica una stanza precedente: manche_total=2 e finale dopo Cronologia, anche dopo un riavvio. Per quelle nuove manche_total=3. Nessun conteggio globale delle partite.

| Stato stanza | Evento / condizione | Effetto |
|---|---|---|
| Fine reveal di Cronologia 5 | Avanzamento ordinario | Per le nuove stanze: manche=3, round=1, settled azzerato, answers vuoto, score conservati. |
| question prima di starts_at | Ingresso | La manche apre con un annuncio di 3 s sull’host e 1 s di anteprima della prima domanda. Le successive hanno 0,8 s di anteprima. Server fissa deadline=starts_at+20.000 ms. |
| question aperta | Un invio valido | Salva e sigilla. Se hanno risposto tutti i giocatori registrati, chiude subito. In caso di risposte mancanti, comprese le disconnessioni, attende la deadline. |
| question → paused → question | Pausa/riprendi | Congelare residuo, risposte e bozza locale. Ripresa con nuova deadline e starts_at=deadline−20 s, anche per pausa durante intro. |
| question → reveal | Ultimo invio o tempo server ≥ deadline | Calcolare punti e podio una volta. Con tutti gli invii, mostrare immediatamente soluzione e podio e avanzare dopo 5 s. Alla scadenza usare la sequenza completa di 8 s. Allarme e richiesta concorrente producono lo stesso stato persistito. |
| reveal → paused → reveal | Comando host | Salvare paused_from e residuo del reveal. Riprendere dalla stessa scena, con deadline ricalcolata. |
| Fine reveal | Allarme/settle ordinario | Round successivo con nuova chiave e answers vuoto. Dopo Q6, finished e podio della stanza. |

Comandi utilizzano control e revision come oggi. Per questa manche, durante domanda/pausa domanda disabilitare e rifiutare skip_round e next, compresa la scorciatoia host. Durante il reveal consentire avanzamento manuale negli ultimi 0,5 s, altrimenti avanza il server alla scadenza. In pausa usare Riprendi. Conservare «Termina partita»: se interruzione a domanda aperta, annullare la domanda, mantenere i totali precedenti, omettere soluzione e risultati della domanda annullata anche da finished. Dopo chiusura conservare i punti già assegnati. Distinguere annullamento da settle(force) e dal semplice nome dello stato finished.

### Contratto di rete e ripristino

- Chiave di domanda: stanza, manche, round. `answer` riceve room_id, manche, round, request_id UUID e answer intero JSON. Identità dalla sessione. Validare corrispondenza di manche anche per richieste tardive al passaggio di fase. Un invio appartiene a un giocatore registrato, mai a un ID scelto dal telefono.
- Ora del DO in millisecondi, finestra semiaperta [starts_at, deadline). Accettare esclusivamente interi sicuri da 1 a 99.999.999 inclusi per tutte le domande. Il tetto comune permette errori di ordini di grandezza e non suggerisce quante cifre abbia la soluzione. Rifiutare stringhe, frazioni, zero, negativi, valori fuori limite. Orario del tap e velocità di rete non attribuiscono punti.
- Nella transazione esistente, salvare answers[user_id] con done, choice e ricevuta per request_id prima dell’ACK {done, choice}. Stesso ID e valore per la stessa chiave restituiscono la ricevuta anche se la domanda è appena chiusa. Stesso ID con valore diverso o nuovo ID dopo il blocco: rifiuto senza mutare. Alla domanda successiva respingere il vecchio round. Un solo incremento di revision per il primo invio.
- Al tap disabilitare modifiche, mostrare «Invio in corso…». Conservare in sessionStorage solo chiave, cifra e UUID dell’invio esplicitamente confermato. Dopo timeout/refresh riconciliare con state.me: se done, mostrare il valore del server, anche se l’ACK HTTP si è perso. Se ancora aperta e senza conferma offrire «Riprova invio» con stesso UUID/payload. Se chiusa e senza ricevuta mostrare «Tempo scaduto · nessuna risposta», 0 punti. Scartare risposte HTTP riferite a chiavi superate. La bozza editabile può sopravvivere al refresh nella stessa scheda, separata dalla ricevuta e mai trasmessa automaticamente. Ripulire entrambe al cambio chiave.
- Snapshot host/giocatore prima della chiusura: room pubblica, server_now, duration_ms, remaining_ms, ricevute aggregate, presenti via socket o polling recente, vault con id, testi, categoria, unità, difficoltà, effetto e limiti. Solo il proprietario vede me.done e me.choice. Sul palco mostrare soltanto il numero di risposte inviate. Nessuna attribuzione di nomi alle conferme.
- Proiettare esplicitamente i campi di vault. Escludere vaultOrder e privati anche dal rest/spread di publicRoom usato dalla dashboard. Omettere punti di round, esito, soluzione, spiegazione, fonte e dati del podio da ACK e viste aperte (anche pausa). Moduli server fuori da web, dist e asset pubblici. Le forme decorative aperte non rappresentano quantità contabili pari alla soluzione.
- A chiusura, un solo risultato per ronda: per la scena host inviare distribuzione ordinata di coppie valore/molteplicità e gruppi premiati con nickname, stima, punti e rango. Ogni telefono riceve soluzione, spiegazione, riferimento, propri punti/stima/rango e classifica cumulativa. L'interfaccia rivela questi campi alla battuta prevista, anche dopo refresh. Risolvere errori/pareggi sul server. `settled < round` protegge l’accredito unitario nel record stanza.
- Usare `applySnapshot` con revision e server_now, `left` con offset corretto da RPC/WS, `schedule/alarm` e verifica delle scadenze al fetch. A zero locale disabilitare invio e attendere stato autorevole. Nessun evento per tick, cifra digitata, fotogramma o singola particella. Per questa manche tenere leggeri gli snapshot intermedi: durante domanda servono i contatori, la propria ricevuta e i metadati; evitare il roster completo ripetuto a ogni conferma. Adeguare i lettori di state.players della shell al formato scelto. Calcolare presenze e parte comune dello snapshot una volta per broadcast, personalizzare soltanto i campi privati. La regia locale cambia fase in base al tempo server; un broadcast successivo non riavvia la scena.

### Punti, errori e pari merito

Per ogni risposta valida con soluzione c, errore = |log10(guess/c)|. Punti = 2 × max(0, min(100, round(100 × (1 − errore)))). Un assente prende zero ed è escluso dal podio di domanda. Per c=1.000, 1.000 → 200, 900 → 190, 500 e 2.000 → 140, 10.000 e 100 → 0. Una stima quasi esatta può valere 200 punti. Il premio visivo richiede guess=c.

Ordine di domanda per distanza moltiplicativa crescente, prima dell’arrotondamento. Per evitare falsi spareggi floating point, rappresentare max(guess,c)/min(guess,c) con due interi e confrontare i prodotti incrociati con BigInt sul server (nessun BigInt nel JSON). Questo ordine coincide con quello dell’errore logaritmico. Posizioni da competizione 1,1,3 oppure 1,2,2,4. Evidenziare tutti con rango ≤3, inclusi i pari merito al confine. A parità di totale usare la convenzione reale della piattaforma: medesimo rango, nickname in ordine alfabetico solo per esposizione. Nessun bonus o spareggio temporale.

### Catalogo server v1

Ogni riga ha limiti inclusivi 1–99.999.999. Le prime sei formano la dimostrazione. Le fonti e i dettagli esplicativi sono consultabili dopo la chiusura. Per dati storicamente aggiornabili ancorare la domanda alla versione o alla misura indicata.

| ID · categoria · difficoltà | Testo host / testo telefono | Riferimento e unità | Scena / popup | Spiegazione e fonte |
|---|---|---|---|---|
| Q01 · Giochi da tavolo · facile | Quanti mattoncini contiene una torre Jenga classica appena montata?<br>**Mobile** Quanti blocchi ha una torre Jenga classica? | 54 mattoncini | jenga-tower<br>NON FAR CADERE IL CERVELLO! | il set classico contiene 54 blocchi, disposti inizialmente in 18 strati da 3. [Fonte](https://instructions.hasbro.com/it-it/instruction/classic-jenga) |
| Q02 · Architettura · facile | Qual è l’altezza complessiva della Torre Eiffel con la nuova antenna installata nel 2022?<br>**Mobile** Torre Eiffel con antenna: quanti metri dal 2022? | 330 metri | eiffel<br>UNA RISPOSTA DA ALTA QUOTA! | dal 2022 l'altezza complessiva con le antenne è 330 metri. [Fonte](https://www.toureiffel.paris/it/il-monumento/in-cifre) |
| Q03 · Serie TV · media | Quanti episodi comprende la serie originale Breaking Bad, senza spin-off e mini-episodi?<br>**Mobile** Breaking Bad: quanti episodi regolari? | 62 episodi | chemistry<br>HAI TROVATO LA FORMULA! | la serie regolare conta 62 episodi distribuiti in cinque stagioni. [Fonte](https://en.wikipedia.org/wiki/Breaking_Bad) |
| Q04 · Sport · media | Quanti metri misura una maratona ufficiale?<br>**Mobile** Una maratona ufficiale, in metri? | 42195 metri | marathon<br>IL TUO CERVELLO CORRE! | la distanza regolamentare è 42,195 chilometri. [Fonte](https://worldathletics.org/disciplines/road-running-event/marathon) |
| Q05 · Geometria · media | Quanti litri contiene una piscina rettangolare di 50 metri per 25 metri, profonda 2 metri e riempita completamente?<br>**Mobile** Vasca piena 50 × 25 × 2 m: quanti litri? | 2500000 litri | pool-water<br>UNA VALANGA D'ACQUA! | 50 × 25 × 2 = 2500 metri cubi. ogni metro cubo corrisponde a 1000 litri. calcolo geometrico esatto. |
| Q06 · Astronomia · media | Quanti chilometri è la distanza media Terra-Luna secondo il valore di riferimento NASA?<br>**Mobile** Distanza media Terra–Luna in km (NASA)? | 384400 chilometri | lunar<br>UNA RISPOSTA SPAZIALE! | la distanza media di riferimento è circa 384.400 km. la distanza reale varia durante l'orbita. [Fonte](https://science.nasa.gov/moon/by-the-numbers/) |
| Q07 · Giochi da tavolo · facile | Quante caselle ha in totale il tabellone del Monopoly classico, comprese le quattro caselle agli angoli?<br>**Mobile** Monopoly classico: quante caselle, angoli inclusi? | 40 caselle | board-game<br>PASSA DAL VIA! | Il perimetro ha nove caselle interne per lato e quattro angoli: 4 × 9 + 4 = 40. [Tabellone classico e conteggio](https://www.monopolyland.com/monopoly-uk-quiz-questions/) |
| Q08 · Musica · facile | Quanti tasti ha un pianoforte moderno standard?<br>**Mobile** Quanti tasti ha un pianoforte standard? | 88 tasti | piano<br>HAI TROVATO LA NOTA GIUSTA! | La tastiera standard comprende 52 tasti bianchi e 36 neri. [Yamaha, tastiera standard a 88 tasti](https://usa.yamaha.com/musical-instruments/pianos/products/arius/) |
| Q09 · Serie TV · media | Quanti episodi ha la serie originale Friends nelle sue dieci stagioni?<br>**Mobile** Friends: quanti episodi nelle 10 stagioni? | 236 episodi | friends-sofa<br>THE ONE WITH THE PERFECT GUESS! | Il catalogo delle dieci stagioni comprende 236 episodi. La reunion è uno speciale separato. [WarnerMedia, catalogo e reunion](https://press.wbd.com/us/media-release/one-where-they-got-back-together) |
| Q10 · Chimica · media | Quanti elementi riconosciuti comprende la tavola periodica pubblicata da IUPAC nel 2022?<br>**Mobile** Quanti elementi nella tavola IUPAC del 2022? | 118 elementi | periodic<br>REAZIONE GENIALE! | La tavola pubblicata da IUPAC nel 2022 arriva al numero atomico 118, oganesson. [IUPAC](https://iupac.org/what-we-do/periodic-table-of-elements/) |
| Q11 · Tecnologia · media | Quanti pixel contiene complessivamente uno schermo Full HD con risoluzione 1920 × 1080?<br>**Mobile** Full HD: quanti pixel in 1920 × 1080? | 2073600 pixel | pixels<br>PRECISIONE IN ALTA DEFINIZIONE! | 1920 × 1080 = 2.073.600. calcolo esatto. |
| Q12 · Curiosità storiche · media | Quante statue di guerrieri si stima che compongano l'Esercito di Terracotta cinese?<br>**Mobile** Esercito di Terracotta: quanti guerrieri si stimano? | 8000 statue | terracotta-army<br>L'IMPERATORE APPROVA! | L'Esercito di Terracotta, realizzato per il primo imperatore cinese Qin Shi Huang, comprende migliaia di statue a grandezza naturale. 8.000 guerrieri è una stima, non un conteggio esatto. [Fonte](https://www.smithsonianmag.com/history/what-you-need-know-about-chinas-terra-cotta-warriors-first-qin-emperor-30942673/) |

### Scenografia e interazione

**Host.** Una cassaforte a tutta parete incornicia il display meccanico. Fondo blu notte #101629, piani indaco #293451, numeri argento #BAC8E1, soluzione e incisioni oro champagne #E8CB77. Il turchese #43D6C0 segnala una conferma, il viola #9B82FF disegna la scala, il rubino #A94766 accompagna gli ultimi secondi, il verde #278A77 accompagna il simbolo di precisione. Testo chiaro su fondo scuro, sempre con etichette e simboli. Mantenere tipografia, pulsanti di sala e iconografia BisQUIZ. Niente emoji di scena. In alto titolo, «Domanda n/6», categoria e difficoltà. Al centro domanda, unità leggibile e oggetto tematico. In basso timer, risposte inviate e comandi host. La luce della serratura reagisce all’incremento del contatore una volta per aggiornamento. Ultimi 5 s: cifra centrale, arco che si accorcia e breve pulsazione al secondo. Nessun indizio individuale.

**Telefono.** Timer, display tabulare, tastierino a tre colonne (1–9, Cancella tutto, 0, Backspace) e Conferma. La domanda è visibile sul palco. Sul telefono resta disponibile con la sua unità per il lettore di schermo. Vuoto iniziale con trattino. Visualizzare migliaia it-IT, rimuovere zeri iniziali, zero isolato modificabile ma non confermabile. All’ottava cifra fermare la crescita e spiegare il limite. Tasti fisici 0–9, Backspace, Delete per svuotare, Invio per confermare quando il display è attivo; rispettare focus, Tab, attivazione nativa dei pulsanti e shortcut host. Pulsanti HTML con nomi accessibili, focus visibile, unità associata e messaggi di stato annunciati una sola volta. Lettore di schermo e controllo vocale possono attivare ogni cifra e correzione tramite il nome del tasto. Offrire «Inserimento assistito» nel display: campo testo etichettato che accetta dettatura/incolla di cifre, convalida identica e conferma esplicita. In questa modalità il campo sostituisce il tastierino, si mantiene Conferma sopra la tastiera usando il viewport visibile. In modalità ordinaria i pulsanti non aprono la tastiera nativa.

**Motion.** All’apertura il titolo è al centro del palco e una ghiera compie uno scatto. A ogni domanda la scheda avanza pochi gradi, emerge la sagoma, il testo si svela per righe. Lasciare tutto leggibile prima dell’apertura comune. Su tap keycap a −2 px con riflesso e ritorno in 100 ms, cifra in ingresso 90 ms, cancellazione in dissolvenza 80 ms a larghezza stabile. Feedback aptico breve solo se disponibile e abilitato. Conferma si comprime subito; solo dopo ricevuta il numero attraversa il display, il chiavistello si chiude in 320 ms («RISPOSTA SIGILLATA»), poi stato stabile «RISPOSTA BLOCCATA» con numero, unità e attesa discreta. Stesso linguaggio di pressione, focus e disabilitazione anche sui comandi secondari.

### Regia della rivelazione

Tempo trascorso = 8.000 ms meno residuo server del reveal, congelato se paused_from=reveal. All’ingresso tardivo rappresentare direttamente la battuta corrente. Il telefono scopre il risultato insieme alla sala. Con tutti gli invii, la regia parte da C con il podio già visibile.

| Tempo | Host | Telefono |
|---|---|---|
| A · 0–1 s | Timer fermo, bordi percorsi dalla luce, «VERIFICHIAMO…». | Mostrare stima sigillata o assenza. |
| B · 1–3 s | Pioggia a gruppi di punti anonimi sulle coordinate delle stime. | Attesa sincronizzata. |
| C · 3–5 s | Traccia dorata sulla scala, marcatore vero, odometro con numero e unità, riflesso breve e ricompensa tematica. Spiegazione breve sotto la cifra. | Soluzione, propria stima, spiegazione e punti. Esatto: sigillo d’oro anche sul telefono. |
| D · 5–7,5 s | Illuminare ranghi 1–3, mostrare nickname, stima e punti animati, poi posizione cumulativa. | Punti ottenuti, rango personale della domanda e totale. Assente: «Nessuna risposta · 0 punti». |
| E · 7,5–8 s | Le sfere sfumano, resta la classifica sintetica, comandi di avanzamento ordinari. | Attendere il cambio di chiave. |

**Scala.** In B ricavare il dominio dai soli estremi delle stime. Aggiungere in C la soluzione al dominio e interpolare tutta la scala se cambia: la scelta dell’asse prima della rivelazione non suggerisce il bersaglio. Con max/min ≥10 usare log10 e dicitura «Scala logaritmica», altrimenti asse lineare con unità. Ascissa normalizzata (f(v)−f(min))/(f(max)−f(min)), margini interni, 3–5 tacche leggibili in italiano. Con unico valore centrare il punto tra due estremi positivi distinti che lo includano, anche sul limite inferiore; se necessario usare tacche frazionarie solo per disegnare l’asse. Con zero risposte B mostra «Nessuna stima ricevuta», C mostra comunque valore e spiegazione, D salta le schede vuote.

**Densità.** Un simbolo SVG riutilizzato fino a 100 istanze. Calcolare coordinate una volta per cambio di dominio/dimensione. Fino a quattro corsie verticali anticollisione, ascissa reale invariata. Per gruppi densi aggiungere indicatore di quantità e punti sovrapposti alla rispettiva ascissa, senza etichette individuali. Per 100 stime identiche mostrare un unico punto ×100. Podio con una riga per rango presente. Se un gruppo supera lo spazio, usare «1° ex aequo · N giocatori» con frequenze per stima (a parità matematica, al massimo due stime) e punti comuni; mai scegliere tre nomi dal gruppo. Tutti i pari merito ricevono lo stesso riconoscimento sul telefono. Per la classifica generale affollata mostrare gruppi di testa e piazzamento personale, preservando il podio finale della piattaforma.

### Ricompense vettoriali

Una scena condivisa con piani fondo, soggetto e riflesso, simboli SVG originali e proprietà CSS per profondità, luce e spostamento. La chiave pubblica sceglie l’illustrazione. Tre pose per ciascuna: entrata nel pre-round, accento alla battuta C, dissolvenza verso D. Le quantità illustrative prima di C sono parziali o astratte. Nessun modello 3D, marchio, logo, fotogramma o personaggio riconoscibile.

| Chiave | Entrata → accento tematico |
|---|---|
| jenga-tower | Sezione di torre sale a strati → oscilla e i blocchi si separano a ventaglio. |
| eiffel | Silhouette traforata emerge dal basso → fascio ruota sopra la cuspide. |
| chemistry | Beute e formule astratte si sovrappongono → bolle si espandono e svaniscono. |
| marathon | Sagome prendono posizione → attraversano il palco con scie brevi. |
| pool-water | Vasca in prospettiva → acqua sale, onda riflessa e cascata di cifre. |
| lunar | Luna in parallasse su stelle ferme → arco luminoso Terra–Luna. |
| board-game | Tessere generiche scorrono in prospettiva → dadi ruotano e si arrestano. |
| piano | Dettaglio dei tasti in rilievo → sequenza luminosa e onda musicale. |
| friends-sofa | Sei sagome astratte siedono su un divano originale → luce calda di scena. |
| periodic | Tessere scientifiche sospese → si allineano con collegamenti luminosi. |
| pixels | Piccolo reticolo → moltiplicazione visiva tramite pattern SVG, pannello luminoso. |
| terracotta-army | Pavimento prospettico si apre → guerrieri di terracotta stilizzati emergono dal terreno in file prospettiche con polvere, arretramento simulato della camera, «8.000» monumentale dal valore ricevuto, popup imperiale e dissolvenza verso il podio. |

La scacchiera richiesta come motivo grafico si costruisce tessera dopo tessera sul piano prospettico, evidenziando quadrati di taglie diverse. Usarla come transizione della cassaforte all’ingresso della manche. Q12 conserva l’Esercito di Terracotta e il catalogo conta dodici domande.

**Tono.** Una battuta al massimo per evento, in un’area riservata senza coprire timer o tasti. Dopo ACK alternare per round «NUMERO SIGILLATO!», «IL TUO CERVELLO HA DECISO.», «SPERIAMO CHE TU ABBIA RAGIONE.», «LA MATEMATICA STA TREMANDO.», «RISPOSTA CONSEGNATA. ORMAI È FATTA.». A C usare il popup di catalogo sul palco. Sul telefono usare la fascia del risultato, rotazione per round stabile ai refresh:

| Condizione in ordine | Battute disponibili |
|---|---|
| Esatta | PRECISIONE DISUMANA! / MA HAI IL LIBRO DELLE RISPOSTE?! / CENTRO PERFETTO! |
| Diversa, ≥180 punti | CI SEI ANDATO VICINISSIMO! / IL TUO SESTO SENSO FUNZIONA! / QUASI UN CECCHINO DEI NUMERI! |
| 80–178 punti | NON MALE, PROFESSORE! / UN’OTTIMA INTUIZIONE! |
| 0–78 punti con invio | LA FANTASIA NON TI MANCA! / UN VIAGGIO NELL’IMPROBABILE! / HAI INVENTATO UN’ALTRA REALTÀ! |

Solo su domande pari, durante B o D, una battuta collettiva aggiuntiva se pertinente: «LE STIME SONO OVUNQUE!» per dispersione di almeno un ordine di grandezza con almeno cinque invii, oppure «ABBIAMO UN CAMPIONE DI PRECISIONE!» per un centro esatto dopo C. Evitare una battuta su un errore accanto al nickname o in una sala dove l’autore è identificabile.

**Audio.** La shell possiede volume, abilitazione audio e gestione pagehide; syncMusic oggi spegne la musica per Cultura. Mantenere quell’impostazione e rendere disponibili per la sola manche cue sintetici originali, sotto lo stesso controllo volume/mute. Scadenza, pioggia, soluzione, accento tematico e conteggio sul palco dopo il gesto di abilitazione audio. Un cue per battuta, niente replay dopo refresh o tab riattivata. Fermare in pausa e rispettare rifiuto di autoplay. Tutte le informazioni restano leggibili in silenzio.

### Ingombri, accessibilità e prestazioni

Una superficie dimensionata sull’altezza dinamica (100dvh con fallback), padding safe-area incluso nel box, righe grid con min-height:0 e larghezze flessibili. Usare VisualViewport per inserimento assistito con tastiera aperta. Riservare subito lo spazio per cifre, feedback e comandi. Ridurre in ordine decorazioni, spazi, testo tramite variante mobile editoriale e dimensione del display. Evitare maschere che taglino domande, pulsanti o nickname indispensabili. Contrasto testo normale ≥4,5:1, controlli e testo grande ≥3:1. Target di almeno 44×44 CSS px; ordine di focus uguale a quello visivo, timer annunciato a soglie, esito in regione live. Nessun flash ripetuto.

| Viewport CSS | Composizione da verificare |
|---|---|
| 320×568 | Margini 8 px, timer, display compatto, quattro righe di tasti da almeno 44 px e Conferma separata. |
| 375×667 e 390×844 | Stessa griglia, tasti e display crescono con lo spazio, safe area inferiore sotto Conferma. |
| Telefono orizzontale (568×320) | Timer in alto, display a sinistra, tastierino e Conferma a destra. Con tastiera assistita usare fascia compatta campo + Conferma. |
| 1280×720 e 1366×768 | Fascia alta di servizio, palco su due colonne domanda/oggetto, controlli host bassi. Alla reveal scala a tutta larghezza, righe podio compatte. |
| 1920×1080 | Ampliare palco, testo e intervalli della scala, controlli raggruppati entro il margine da proiezione del 4%. |

Con prefers-reduced-motion sostituire pioggia, rotazioni, parallasse e odometro con pose statiche e cambi di opacità ≤120 ms. Conservare ordine temporale e valori finali. Sui dispositivi lenti o con aggiornamento lento usare la stessa scena semplificata, disattivare filtri, particelle e riflessi in movimento. Animare transform e opacity su gruppi; niente ciclo di layout per particella. Fermare gli effetti fuori vista e in pausa. Per snapshot duplicati aggiornare solo testo e contatori cambiati; mantenere focus, selezione e posizione temporale.

### Ordine di sviluppo e accettazione essenziale

1. Fissare catalogo e funzioni pure server. Verificare 12 ID unici, sei demo in ordine, estrazione mista distinta, intervalli pubblici, cinque esempi numerici, pari errore su lati opposti, esatto distinto da 200 arrotondato e soglia ×10.
2. Integrare stanza e protocollo in Miniflare. Una nuova stanza attraversa Cronologia 5 → Vault 1 → Vault 6 → podio, una vecchia termina dopo Cronologia. Tentare invio a starts_at, a deadline−1 e a deadline, retry identico, doppio invio con nuovo UUID, altro round e pausa. Controllare il reveal immediato all’ultimo invio e la scadenza di 20 s con risposte mancanti. Verificare un solo accredito dopo richieste/alarmi ripetuti, zero per assenti e cancellazione da Termina.
3. Collegare scene, tastierino, riconciliazione, classifica e effetti. Confrontare ACK, state, dashboard e snapshot WS per due giocatori e host in domanda e in pausa: nessuna soluzione o stima altrui. Eseguire npm run build, verificare gli import e l’assenza del catalogo/soluzioni nei file pubblicati, inclusi gli SVG. Eseguire solo i casi server/frontend pertinenti.
4. Nel browser configurato usare sessioni host/giocatore distinte. Provare correzione, invio lento, perdita ACK, refresh, modalità solo polling, pausa/ripresa a metà domanda e durante reveal, cambio di domanda con ACK vecchio. Confrontare stessi testi equivalenti e stessa chiusura. Fare un passaggio rapido di Popolazione, Cronologia e join Pokémon sulle route esistenti.
5. Verifica visiva alle sei risoluzioni in tabella, con safe area, intero a otto cifre, tastiera assistita, focus e moto ridotto. Controllare elementi interamente dentro il viewport e nessun overflow in entrambe le direzioni. Con dati controllati di 0, 1 e 100 giocatori provare stime identiche, dispersione estrema e grande gruppo al terzo posto: coordinate verificabili, niente etichette impilate e nessuna lista da scorrere. Osservare in DevTools una reveal completa e una raffica di conferme: input reattivo, assenza di layout ripetuti per punto o frame WS di animazione. Queste verifiche spettano all’implementazione SOL.

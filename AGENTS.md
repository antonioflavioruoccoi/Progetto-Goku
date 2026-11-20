# Progetto-Goku · Pixelcard

Pixelcard è un quiz di carte Pokémon che gira nel browser con HTML, CSS e JavaScript. Per avviarlo in locale, segui [README.md](README.md). Usa un server HTTP perché il gioco carica il Pokédex con `fetch`.

## Dove intervenire

- **Interfaccia e accessibilità.** In [index.html](index.html) trovi i controlli, il canvas, l'audio e la schermata finale. [style.css](style.css) gestisce layout, animazioni della carta, resa dei pixel e adattamento ai dispositivi mobili. Gli ID HTML sono usati da `game.js`.
- **Carte e dati.** In [game.js](game.js), `cards` definisce l'ordine delle carte e le immagini locali. `loadGame` carica [pokemon_pokedex_nazionale.txt](pokemon_pokedex_nazionale.txt), controlla che i nomi delle carte siano nel Pokédex e precarica le immagini prima di abilitare **Gioca**.
- **Tempo, risposte e punteggio.** In `game.js`, parti da `tick`, `remaining` e `renderPixels` per le fasi del giro, il timer e la pixelatura. Per le risposte cerca `resolveName` e il gestore di `answer-form`. `finishRound` calcola i punti e rivela la carta.

Se cambi il numero di carte, la durata del giro o il calcolo dei punti, verifica anche le etichette e il punteggio massimo mostrati da `index.html` e `game.js`.

Per modifiche al quiz, verifica il flusso interessato nel browser servito via HTTP. Se tocchi il ciclo di gioco, prova avvio, pausa e ripresa, risposta o scadenza, **Continua** e **Rigioca**.

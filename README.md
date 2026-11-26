# Dr. Goku

Quiz multiplayer online: https://dr-goku.antonioflavioruocco-i.workers.dev

- **Gioca live** (`/play/`): entra con il PIN o il QR della stanza.
- **Host** (`/host/`) e **Admin** (`/admin/`): creano e conducono le stanze.
- **Quiz originale** (`/`): Pixelcard, il quiz di carte Pokémon a giocatore singolo.

Quiz *Cultura generale*, 6 manche: Popolazione, Cronologia, Stime, Prato fiorito, Puzzle e Album dei ricordi.

## Modificare le foto

- **Puzzle (manche 5)**: le foto sono in `nome-cartella/`.
- **Album dei ricordi (manche 6)**: metti le foto in `Album dei ricordi/` con i nomi
  `Nome Persona - bambino.jpg` e `Nome Persona - adulto.jpg`, poi aggiungi i 3 indizi
  (difficile, medio, facile) in `album-dei-ricordi/indizi.json`:

  ```json
  { "Nome Persona": ["indizio difficile", "indizio medio", "indizio facile"] }
  ```

  Controlla tutto con `python3 server/build-album.py`: se manca una foto o un indizio
  ti dice cosa correggere.

Istruzioni complete per chi lavora sul codice: [AGENTS.md](AGENTS.md).

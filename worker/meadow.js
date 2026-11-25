// Prato fiorito: [categoria, risposte safe, bombe]. Il client non riceve mai il campo bomb prima del reveal.
const categories = [
  ["Hanno presentato Sanremo",
    ["Pippo Baudo", "Mike Bongiorno", "Nunzio Filogamo", "Amadeus", "Carlo Conti", "Fabio Fazio", "Corrado", "Raffaella Carrà", "Antonella Clerici", "Claudio Baglioni", "Claudio Cecchetto", "Rosita Celentano", "Loretta Goggi", "Paolo Bonolis", "Simona Ventura", "Giorgio Panariello", "Gianni Morandi", "Raimondo Vianello"],
    ["Gerry Scotti", "Massimo Giletti", "Vanessa Incontrada", "Marco Liorni", "Silvia Toffanin", "Barbara d’Urso"]],
  ["Ha scritto un libro",
    ["Fabio Volo", "Cicciogamer89", "Donato Carrisi", "Elena Ferrante", "Alberto Moravia", "Primo Levi", "Luigi Pirandello", "Levante", "Chiara Ferragni", "Luciano Ligabue", "Elsa Morante", "Alex Zanardi", "Carlo Verdone", "Valentino Rossi", "Checco Zalone", "Luca Argentero", "Giorgia Meloni", "Bruno Barbieri"],
    ["Lucio Battisti", "Belen Rodriguez", "Pierfrancesco Favino", "Paolo Maldini", "Federico Fellini", "Maria De Filippi"]],
  ["Programmi Mediaset",
    ["C’è Posta per te", "Verissimo", "Mistero", "Ok il prezzo è giusto", "The Cube", "La Fattoria", "Io canto", "Chi ha incastrato Peter Pan?", "I menu di Giallo Zafferano", "La ruota della fortuna", "La sai l’ultima?", "Dritto e Rovescio", "Forum", "È sempre Cartabianca", "Radio Belva", "Quarto Grado", "La pupa e il secchione", "Buona Domenica"],
    ["Cartabianca", "Chi l’ha visto?", "The Floor", "Vita da Cani", "Voyager", "Scanzonissima"]],
  ["Attori/attrici sopra i 50 anni",
    ["Edoardo Leo", "George Clooney", "Raoul Bova", "Pierfrancesco Favino", "Alessandro Gassmann", "Brad Pitt", "Stefano Accorsi", "Alessandro Siani", "Monica Bellucci", "Sabrina Ferilli", "Elena Sofia Ricci", "Claudia Gerini", "Claudia Pandolfi", "Paola Cortellesi", "Angelina Jolie", "Nicole Kidman"],
    ["Luca Argentero", "Riccardo Scamarcio", "James Franco", "Zoe Saldana", "Elisabetta Canalis", "Valentina Lodovini"]],
  ["Ha dei tatuaggi",
    ["Fedez", "Damiano David", "Francesco Totti", "Michele Morrone", "Kendall Jenner", "Emma Stone", "Carlo Calenda", "Zendaya", "Elodie", "Marcell Jacobs", "Lorenzo Musetti", "Mario Balotelli", "Stefano De Martino", "Charlize Theron", "Anne Hathaway", "Ringo Starr", "Jim Carrey", "Luciano Spalletti"],
    ["Timothée Chalamet", "Cristiano Ronaldo", "Jannik Sinner", "Kourtney Kardashian", "Elon Musk", "Paul McCartney"]],
  ["È una citazione vera",
    ["“Se puoi sognarlo, puoi farlo.” — Walt Disney", "“Un giorno senza sorriso è un giorno perso.” — Charlie Chaplin", "“La violenza è l’ultimo rifugio degli incapaci.” — Isaac Asimov", "“Fare! O non fare! Non c’è provare!” — Yoda", "“Non preoccuparti di fallire. Preoccupati di non averci provato.” — Michael Jordan", "“La gente è il più grande spettacolo del mondo. E non si paga il biglietto.” — Charles Bukowski", "“Il tuo tempo è limitato, quindi non sprecarlo vivendo la vita di qualcun altro.” — Steve Jobs", "“Ogni persona che incontri sta combattendo una battaglia di cui non sai nulla. Sii gentile. Sempre.” — Platone", "“Una bugia, ripetuta a sufficienza, diventa verità.” — Lenin", "“Coloro che sognano di giorno sanno molte cose che sfuggono a chi sogna soltanto di notte.” — Edgar Allan Poe", "“Mira alla luna. Anche se sbagli, atterrerai tra le stelle.” — Les Brown", "“Anche un viaggio di mille miglia inizia con un singolo passo.” — Lao Tzu", "“Sii il cambiamento che vuoi vedere nel mondo.” — Gandhi", "“Ciò che non ti uccide ti rende più forte.” — Friedrich Nietzsche", "“Il paradiso lo preferisco per il clima, l’inferno per la compagnia.” — Mark Twain", "“Dio è morto, Marx è morto, e anche io non mi sento molto bene.” — Woody Allen"],
    ["“Houston, abbiamo un problema.” — Astronauti dell’Apollo 13", "“Follia è fare sempre la stessa cosa e aspettarsi ogni volta un risultato diverso.” — Albert Einstein", "“Tu quoque, Brute, fili mi!” — Giulio Cesare", "“Per me un White Russian, grazie.” — Barack Obama", "“Io rispetto gli omosessuali.” — Francesco Totti", "“Fatta l’Italia, bisogna fare gli italiani.” — Benito Mussolini", "“Panta rei.” — Aristotele"]],
  ["Fa parte delle meraviglie del mondo (antiche o moderne)",
    ["Piramide di Cheope", "Giardini pensili di Babilonia", "Statua di Zeus", "Tempio di Artemide", "Mausoleo di Alicarnasso", "Colosso di Rodi", "Faro di Alessandria", "Colosseo", "Grande Muraglia Cinese", "Machu Picchu", "Petra", "Cristo Redentore", "Taj Mahal", "Chichén Itzá"],
    ["Grand Canyon", "Torre Eiffel", "Torre di Pisa", "Stonehenge", "Angkor Wat", "Cascate del Niagara"]],
  ["È una capitale",
    ["Canberra", "Tokyo", "Tbilisi", "Riga", "Vilnius", "Ankara", "Ottawa", "Dublino", "Atene", "Baku", "Varsavia", "Praga", "Nairobi", "Helsinki", "Copenaghen", "Bogotà"],
    ["Barcellona", "New York", "Toronto", "Sydney", "Istanbul", "Shanghai"]],
  ["È un film tratto da un libro",
    ["Il Signore degli Anelli", "Il Padrino", "Jurassic Park", "Dune", "Il silenzio degli innocenti", "Via col vento", "Harry Potter", "Gomorra", "Fight Club", "Colazione da Tiffany", "Forrest Gump", "Blade Runner", "Il curioso caso di Benjamin Button", "Povere creature!", "American Psycho", "Le pagine della nostra vita", "Hugo Cabret", "L’arte di vincere"],
    ["Nuovo Cinema Paradiso", "La grande bellezza", "Star Wars", "Perfetti sconosciuti", "Interstellar", "C’era una volta a Hollywood"]],
  ["È un film ispirato a una storia vera",
    ["Schindler’s List", "A Beautiful Mind", "12 anni schiavo", "Oppenheimer", "Zodiac", "The Wolf of Wall Street", "Prova a prendermi", "Into the Wild", "I cento passi", "Il caso Spotlight", "Green Book", "La ricerca della felicità", "Balto", "Una tomba per le lucciole", "Sulla mia pelle", "Il divo", "Quasi amici", "The Imitation Game"],
    ["Salvate il soldato Ryan", "Fargo", "Il labirinto del fauno", "La leggenda del pianista sull’oceano", "The Prestige", "2001: Odissea nello spazio"]],
  ["Costa più di un milione",
    ["Spada laser di Luke Skywalker", "Animatronic di E.T.", "Aston Martin DB5 di James Bond", "Fender Stratocaster di David Gilmour", "Patek Philippe Grandmaster Chime", "Ferrari 250 GTO", "Spada d’oro di Napoleone (Marengo)", "Copia della Magna Carta del 1297", "Air Jordan XIII firmate da Michael Jordan", "Computer Apple-1 (1976)", "Maglia di Maradona dei Mondiali 1986", "Action Comics #1 (1938)", "Carta Pokémon “Pikachu Illustrator”", "Abito bianco di Marilyn Monroe", "Manoscritto della Costituzione USA", "Buckingham Palace", "“Salvator Mundi” di Leonardo da Vinci", "Bibbia di Gutenberg"],
    ["Ferrari SF90 XX Spider", "Primo violino di Albert Einstein", "Casco originale di Darth Vader", "DeLorean DMC-12 di Ritorno al futuro", "Nike Air Yeezy 1 “Prototype”", "Prima edizione di Harry Potter e la pietra filosofale"]],
  ["Ha vinto il Mondiale 1982 con l’Italia",
    ["Dino Zoff", "Franco Baresi", "Giuseppe Bergomi", "Antonio Cabrini", "Fulvio Collovati", "Gaetano Scirea", "Gabriele Oriali", "Bruno Conti", "Alessandro Altobelli", "Ciccio Graziani", "Paolo Rossi", "Marco Tardelli", "Giancarlo Antognoni", "Ivano Bordon", "Daniele Massaro", "Franco Causio"],
    ["Gigi Riva", "Roberto Bettega", "Evaristo Beccalossi", "Roberto Pruzzo", "Agostino Di Bartolomei", "Franco Tancredi"]],
];

export const MEADOW_ROUNDS = 5;
export const MEADOW_OPTIONS = 6;
export const MEADOW_POINTS = 40;
// Bonus al primo che invia tutte e cinque le risposte giuste, senza bomba.
export const MEADOW_FASTEST_BONUS = 40;
export const MEADOW_CATEGORIES = categories.length;

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
const pick = (list, count) => shuffle([...list]).slice(0, count);

export function drawMeadow() {
  return pick(categories, MEADOW_ROUNDS).map(([category, safe, bombs]) => {
    const names = shuffle([...pick(safe, MEADOW_OPTIONS - 1).map(name => ({ name, bomb: false })), { name: pick(bombs, 1)[0], bomb: true }]);
    const items = names.map((item, id) => ({ id, ...item }));
    if (items.length !== MEADOW_OPTIONS || items.filter(item => item.bomb).length !== 1 ||
        new Set(items.map(item => item.name)).size !== MEADOW_OPTIONS)
      throw new Error(`Prato fiorito: round non valido per ${category}`);
    return { category, items };
  });
}

export const meadowPerfect = (items, choice) =>
  choice.length === items.length - 1 && !items.some(item => item.bomb && choice.includes(item.id));

// choice è già validato: id unici tra quelli del round.
export const meadowPoints = (items, choice) =>
  items.some(item => item.bomb && choice.includes(item.id)) ? 0 : choice.length * MEADOW_POINTS;

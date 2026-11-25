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
  ["Fa parte delle meraviglie del mondo (antiche o moderne)",
    ["Piramide di Cheope", "Giardini pensili di Babilonia", "Statua di Zeus", "Tempio di Artemide", "Mausoleo di Alicarnasso", "Colosso di Rodi", "Faro di Alessandria", "Colosseo", "Grande Muraglia Cinese", "Machu Picchu", "Petra", "Cristo Redentore", "Taj Mahal", "Chichén Itzá"],
    ["Grand Canyon", "Torre Eiffel", "Torre di Pisa", "Stonehenge", "Angkor Wat", "Cascate del Niagara"]],
  ["È una capitale",
    ["Canberra", "Tokyo", "Tbilisi", "Riga", "Vilnius", "Ankara", "Ottawa", "Dublino", "Atene", "Baku", "Varsavia", "Praga", "Nairobi", "Helsinki", "Copenaghen", "Bogotà"],
    ["Barcellona", "New York", "Toronto", "Sydney", "Istanbul", "Shanghai"]],
  ["Ha vinto il Mondiale 1982 con l’Italia",
    ["Zoff", "Baresi", "Bergomi", "Cabrini", "Collovati", "Scirea", "Oriali", "Bruno Conti", "Altobelli", "Ciccio Graziani", "Paolo Rossi", "Tardelli", "Antognoni", "Bordon", "Massaro", "Causio"],
    ["Gigi Riva", "Bettega", "Beccalossi", "Pruzzo", "Di Bartolomei", "Franco Tancredi"]],
];

export const MEADOW_ROUNDS = 5;
export const MEADOW_OPTIONS = 6;
export const MEADOW_POINTS = 40;
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

// choice è già validato: id unici tra quelli del round.
export const meadowPoints = (items, choice) =>
  items.some(item => item.bomb && choice.includes(item.id)) ? 0 : choice.length * MEADOW_POINTS;

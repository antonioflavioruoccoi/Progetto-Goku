const categories = [
  ["Invenzioni", [
    ["Occhiali da vista", 1286],
    ["Macchina a vapore", 1712],
    ["Microscopio", 1590],
    ["Lampadina elettrica pratica", 1879],
    ["WC con sciacquone", 1596],
    ["Il primo sottomarino militare sperimentale", 1775],
    ["Calcolatrice meccanica", 1642],
    ["Termometro a mercurio", 1714],
    ["Primo estintore chimico", 1723],
    ["Paracetamolo", 1877],
    ["Acqua gassata artificiale", 1767],
    ["Parafulmine", 1752],
  ]],
  ["Eventi Storici", [
    ["Dichiarazione d'indipendenza degli Stati Uniti", 1776],
    ["Napoleone diventa imperatore", 1804],
    ["Abolizione della schiavitù negli Stati Uniti", 1865],
    ["Prime Olimpiadi moderne", 1896],
    ["Primo uomo sulla Luna", 1969],
    ["Proclamazione del Regno d'Italia", 1861],
    ["Crollo di Wall Street", 1929],
    ["Attacco a Pearl Harbor", 1941],
    ["Caduta del Muro di Berlino", 1989],
    ["Affondamento del Titanic", 1912],
    ["Dissoluzione dell'Unione Sovietica", 1991],
    ["Disastro nucleare di Chernobyl", 1986],
  ]],
  ["Brand", [
    ["Adidas", 1949],
    ["Disney", 1923],
    ["Ferrari", 1947],
    ["Google", 1998],
    ["LEGO", 1932],
    ["Nike", 1964],
    ["Netflix", 1997],
    ["Louis Vuitton", 1854],
    ["McDonald's", 1940],
    ["IKEA", 1943],
    ["Rolex", 1905],
    ["Starbucks", 1971],
  ]],
  ["Canzoni", [
    ["Nel blu dipinto di blu (Volare) - Domenico Modugno", 1958],
    ["Azzurro - Adriano Celentano", 1968],
    ["Imagine - John Lennon", 1971],
    ["Bohemian Rhapsody - Queen", 1975],
    ["Felicità - Al Bano e Romina Power", 1982],
    ["Billie Jean - Michael Jackson", 1983],
    ["Wonderwall - Oasis", 1995],
    ["Sarà perché ti amo - Ricchi e Poveri", 1981],
    ["Acqua e sale - Mina e Adriano Celentano", 1998],
    ["Bad Romance - Lady Gaga", 2009],
    ["Sere nere - Tiziano Ferro", 2003],
    ["La notte - Arisa", 2012],
  ]],
  ["Film", [
    ["Fight Club - David Fincher", 1999],
    ["Il gladiatore - Ridley Scott", 2000],
    ["Harry Potter e la pietra filosofale - Chris Columbus", 2001],
    ["Spider-Man - Sam Raimi", 2002],
    ["Ratatouille - Brad Bird", 2007],
    ["Il cavaliere oscuro - Christopher Nolan", 2008],
    ["Avatar - James Cameron", 2009],
    ["Inception - Christopher Nolan", 2010],
    ["Quasi amici - Olivier Nakache e Éric Toledano", 2011],
    ["Il diavolo veste Prada - David Frankel", 2006],
    ["The Wolf of Wall Street - Martin Scorsese", 2013],
    ["Interstellar - Christopher Nolan", 2014],
  ]],
];

export const CHRONOLOGY_ROUNDS = categories.length;

export function drawChronology() {
  return categories.map(([category, entries]) => {
    const pool = [...entries];
    const items = Array.from({ length: 4 }, (_, id) => {
      const index = Math.floor(Math.random() * pool.length);
      const [[name, year]] = pool.splice(index, 1);
      return { id, name, year };
    });
    return { category, items };
  });
}

export function correctChronology(items) {
  return [...items].sort((a, b) => a.year - b.year).map(({ id }) => id);
}

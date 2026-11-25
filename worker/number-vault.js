const catalog = [
  {
    id: "Q01",
    category: "Giochi da tavolo",
    difficulty: "facile",
    prompt: "Quanti mattoncini ha una torre Jenga classica?",
    mobile: "Mattoncini di una torre Jenga?",
    unit: "mattoncini",
    effect: "jenga-tower",
    solution: 54,
    popup: "NON FAR CADERE IL CERVELLO!",
    explanation: "Il set classico contiene 54 blocchi, disposti in 18 strati da 3.",
    source: "https://instructions.hasbro.com/it-it/instruction/classic-jenga",
  },
  {
    id: "Q02",
    category: "Architettura",
    difficulty: "facile",
    prompt: "Quanto è alta la Torre Eiffel con l’antenna del 2022?",
    mobile: "Torre Eiffel con antenna: quanti metri?",
    unit: "metri",
    effect: "eiffel",
    solution: 330,
    popup: "UNA RISPOSTA DA ALTA QUOTA!",
    explanation: "Dal 2022, con la nuova antenna, la torre misura 330 metri.",
    source: "https://www.toureiffel.paris/it/il-monumento/in-cifre",
  },
  {
    id: "Q03",
    category: "Cinema",
    difficulty: "media",
    prompt: "Quanti minuti dura l’intera saga di Harry Potter?",
    mobile: "Saga di Harry Potter: quanti minuti?",
    unit: "minuti",
    effect: "film-saga",
    solution: 1179,
    popup: "UNA STIMA MAGICA!",
    explanation: "Gli otto film, nelle versioni uscite al cinema, sommano 1179 minuti: quasi 20 ore.",
    source: "https://en.wikipedia.org/wiki/Harry_Potter_(film_series)",
  },
  {
    id: "Q04",
    category: "Sport",
    difficulty: "media",
    prompt: "Quanti metri misura una maratona ufficiale?",
    mobile: "Una maratona, in metri?",
    unit: "metri",
    effect: "marathon",
    solution: 42195,
    popup: "IL TUO CERVELLO CORRE!",
    explanation: "La distanza regolamentare è 42,195 chilometri.",
    source: "https://worldathletics.org/disciplines/road-running-event/marathon",
  },
  {
    id: "Q05",
    category: "Storia",
    difficulty: "media",
    prompt: "Quanti chilometri è lunga la Grande Muraglia cinese?",
    mobile: "Grande Muraglia: quanti km?",
    unit: "chilometri",
    effect: "great-wall",
    solution: 21196,
    popup: "UN MURO DI PRECISIONE!",
    explanation: "Il rilevamento cinese del 2012 ha misurato 21.196 km, sommando i tratti di tutte le dinastie.",
    source: "https://www.bbc.com/news/world-asia-china-18530553",
  },
  {
    id: "Q06",
    category: "Astronomia",
    difficulty: "media",
    prompt: "Quanti chilometri separano in media la Terra dalla Luna, secondo la NASA?",
    mobile: "Terra–Luna in media: quanti km?",
    unit: "chilometri",
    effect: "lunar",
    solution: 384400,
    popup: "UNA RISPOSTA SPAZIALE!",
    explanation: "La distanza media di riferimento è 384.400 km. Quella reale varia lungo l’orbita.",
    source: "https://science.nasa.gov/moon/by-the-numbers/",
  },
  {
    id: "Q07",
    category: "Giochi da tavolo",
    difficulty: "facile",
    prompt: "Quante caselle ha il tabellone del Monopoly, angoli inclusi?",
    mobile: "Caselle del Monopoly, angoli inclusi?",
    unit: "caselle",
    effect: "board-game",
    solution: 40,
    popup: "PASSA DAL VIA!",
    explanation: "Nove caselle per lato più i quattro angoli: 4 × 9 + 4 = 40.",
    source: "https://www.monopolyland.com/monopoly-uk-quiz-questions/",
  },
  {
    id: "Q08",
    category: "Musica",
    difficulty: "facile",
    prompt: "Quanti tasti ha un pianoforte standard?",
    mobile: "Tasti di un pianoforte standard?",
    unit: "tasti",
    effect: "piano",
    solution: 88,
    popup: "HAI TROVATO LA NOTA GIUSTA!",
    explanation: "La tastiera standard ha 52 tasti bianchi e 36 neri.",
    source: "https://usa.yamaha.com/musical-instruments/pianos/products/arius/",
  },
  {
    id: "Q09",
    category: "Serie TV",
    difficulty: "media",
    prompt: "Quanti episodi ha Friends nelle sue 10 stagioni?",
    mobile: "Friends: quanti episodi in 10 stagioni?",
    unit: "episodi",
    effect: "tv-series",
    solution: 236,
    popup: "THE ONE WITH THE PERFECT GUESS!",
    explanation: "Le dieci stagioni contano 236 episodi. La reunion è uno speciale a parte.",
    source: "https://press.wbd.com/us/media-release/one-where-they-got-back-together",
  },
  {
    id: "Q10",
    category: "Chimica",
    difficulty: "media",
    prompt: "Quanti elementi conta la tavola periodica IUPAC del 2022?",
    mobile: "Elementi nella tavola IUPAC 2022?",
    unit: "elementi",
    effect: "periodic",
    solution: 118,
    popup: "REAZIONE GENIALE!",
    explanation: "La tavola IUPAC del 2022 arriva al numero atomico 118, l’oganesson.",
    source: "https://iupac.org/what-we-do/periodic-table-of-elements/",
  },
  {
    id: "Q11",
    category: "Anatomia",
    difficulty: "facile",
    prompt: "Quante ossa ha il corpo umano adulto?",
    mobile: "Ossa del corpo umano adulto?",
    unit: "ossa",
    effect: "skeleton",
    solution: 206,
    popup: "RISPOSTA DA OSSO DURO!",
    explanation: "Lo scheletro adulto ha 206 ossa. Alla nascita sono circa 270: con la crescita alcune si fondono.",
    source: "https://www.britannica.com/science/human-skeleton",
  },
  {
    id: "Q12",
    category: "Storia",
    difficulty: "media",
    prompt: "Quanti guerrieri conta, secondo le stime, l’Esercito di Terracotta?",
    mobile: "Esercito di Terracotta: quanti guerrieri?",
    unit: "statue",
    effect: "terracotta-army",
    solution: 8000,
    popup: "L'IMPERATORE APPROVA!",
    explanation: "Le statue a grandezza naturale del primo imperatore Qin Shi Huang sono circa 8.000: è una stima, non un conteggio esatto.",
    source: "https://www.smithsonianmag.com/history/what-you-need-know-about-chinas-terra-cotta-warriors-first-qin-emperor-30942673/",
  },
];

export const VAULT_ROUNDS = 6;
export const VAULT_DURATION = 20_000;
export const VAULT_REVEAL = 8_000;
export const VAULT_SOLUTION_AT = 3_000;
export const VAULT_NEXT = 7_500;
export const VAULT_MAX_POINTS = 200;
// The rules screen replaces the old 3 s announcement.
const ANNOUNCEMENT_MS = 0;
const preview = round => round === 1 ? 1_000 : 800;
export const vaultIntro = round => (round === 1 ? ANNOUNCEMENT_MS : 0) + preview(round);
const min = 1;
const max = 99_999_999;

export const vaultQuestion = id => catalog.find(question => question.id === id);
export const validGuess = value => Number.isSafeInteger(value) && value >= min && value <= max;
export function vaultPoints(guess, solution) {
  const ratio = Math.max(guess, solution) / Math.min(guess, solution);
  const base = Math.max(0, Math.min(100, Math.round(100 * (1 - Math.log10(ratio)))));
  return base * (VAULT_MAX_POINTS / 100);
}

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

// Every room gets a random mix: 2 easy and 4 medium questions.
export function drawVault() {
  const ids = difficulty => shuffle(catalog.filter(q => q.difficulty === difficulty).map(q => q.id));
  return shuffle([...ids("facile").slice(0, 2), ...ids("media").slice(0, 4)]);
}

export function publicVault({ id, category, difficulty, prompt, mobile, unit, effect }, round) {
  return {
    id, category, difficulty, prompt, mobile, unit, effect, min, max,
    intro_ms: vaultIntro(round), preview_ms: preview(round), max_points: VAULT_MAX_POINTS,
  };
}

export function settleVault(r, { solution, explanation, source, popup }, early = false, addPoints = (room, id, points) => { room.players[id].score += points; }) {
  const entries = Object.entries(r.answers);
  const spread = new Map();
  const byDistance = ([, a], [, b]) => {
    const left = BigInt(Math.max(a.choice, solution)) * BigInt(Math.min(b.choice, solution));
    const right = BigInt(Math.max(b.choice, solution)) * BigInt(Math.min(a.choice, solution));
    return (left > right) - (left < right);
  };
  entries.sort((a, b) => byDistance(a, b) || r.players[a[0]].nickname.localeCompare(r.players[b[0]].nickname));
  const podium = [];
  let rank = 0;
  entries.forEach(([id, answer], i) => {
    if (!i || byDistance(entries[i - 1], entries[i])) rank = i + 1;
    const { choice } = answer;
    const points = vaultPoints(choice, solution);
    Object.assign(answer, { rank, points });
    addPoints(r, id, points);
    spread.set(choice, (spread.get(choice) || 0) + 1);
    if (rank <= 3) {
      if (podium.at(-1)?.rank !== rank) podium.push({ rank, points, players: [] });
      podium.at(-1).players.push({ nickname: r.players[id].nickname, choice });
    }
  });
  r.vaultResult = {
    solution, explanation, source, popup, podium, early, max_points: VAULT_MAX_POINTS,
    distribution: [...spread].sort(([a], [b]) => a - b),
  };
}

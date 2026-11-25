const catalog = [
  {
    id: "Q01",
    category: "Giochi da tavolo",
    difficulty: "facile",
    prompt: "Quanti mattoncini contiene una torre Jenga classica appena montata?",
    mobile: "Quanti blocchi ha una torre Jenga classica?",
    unit: "mattoncini",
    effect: "jenga-tower",
    solution: 54,
    popup: "NON FAR CADERE IL CERVELLO!",
    explanation: "Il set classico contiene 54 blocchi, disposti inizialmente in 18 strati da 3.",
    source: "https://instructions.hasbro.com/it-it/instruction/classic-jenga",
  },
  {
    id: "Q02",
    category: "Architettura",
    difficulty: "facile",
    prompt: "Qual è l’altezza complessiva della Torre Eiffel con la nuova antenna installata nel 2022?",
    mobile: "Torre Eiffel con antenna: quanti metri dal 2022?",
    unit: "metri",
    effect: "eiffel",
    solution: 330,
    popup: "UNA RISPOSTA DA ALTA QUOTA!",
    explanation: "Dal 2022 l'altezza complessiva con le antenne è 330 metri.",
    source: "https://www.toureiffel.paris/it/il-monumento/in-cifre",
  },
  {
    id: "Q03",
    category: "Serie TV",
    difficulty: "media",
    prompt: "Quanti episodi comprende la serie originale Breaking Bad, senza spin-off e mini-episodi?",
    mobile: "Breaking Bad: quanti episodi regolari?",
    unit: "episodi",
    effect: "chemistry",
    solution: 62,
    popup: "HAI TROVATO LA FORMULA!",
    explanation: "La serie regolare conta 62 episodi distribuiti in cinque stagioni.",
    source: "https://en.wikipedia.org/wiki/Breaking_Bad",
  },
  {
    id: "Q04",
    category: "Sport",
    difficulty: "media",
    prompt: "Quanti metri misura una maratona ufficiale?",
    mobile: "Una maratona ufficiale, in metri?",
    unit: "metri",
    effect: "marathon",
    solution: 42195,
    popup: "IL TUO CERVELLO CORRE!",
    explanation: "La distanza regolamentare è 42,195 chilometri.",
    source: "https://worldathletics.org/disciplines/road-running-event/marathon",
  },
  {
    id: "Q05",
    category: "Geometria",
    difficulty: "media",
    prompt: "Quanti litri contiene una piscina rettangolare di 50 metri per 25 metri, profonda 2 metri e riempita completamente?",
    mobile: "Vasca piena 50 × 25 × 2 m: quanti litri?",
    unit: "litri",
    effect: "pool-water",
    solution: 2500000,
    popup: "UNA VALANGA D'ACQUA!",
    explanation: "50 × 25 × 2 = 2500 metri cubi. ogni metro cubo corrisponde a 1000 litri. calcolo geometrico esatto.",
    source: null,
  },
  {
    id: "Q06",
    category: "Astronomia",
    difficulty: "media",
    prompt: "Quanti chilometri è la distanza media Terra-Luna secondo il valore di riferimento NASA?",
    mobile: "Distanza media Terra–Luna in km (NASA)?",
    unit: "chilometri",
    effect: "lunar",
    solution: 384400,
    popup: "UNA RISPOSTA SPAZIALE!",
    explanation: "La distanza media di riferimento è circa 384.400 km. la distanza reale varia durante l'orbita.",
    source: "https://science.nasa.gov/moon/by-the-numbers/",
  },
  {
    id: "Q07",
    category: "Giochi da tavolo",
    difficulty: "facile",
    prompt: "Quante caselle ha in totale il tabellone del Monopoly classico, comprese le quattro caselle agli angoli?",
    mobile: "Monopoly classico: quante caselle, angoli inclusi?",
    unit: "caselle",
    effect: "board-game",
    solution: 40,
    popup: "PASSA DAL VIA!",
    explanation: "Il perimetro ha nove caselle interne per lato e quattro angoli: 4 × 9 + 4 = 40.",
    source: "https://www.monopolyland.com/monopoly-uk-quiz-questions/",
  },
  {
    id: "Q08",
    category: "Musica",
    difficulty: "facile",
    prompt: "Quanti tasti ha un pianoforte moderno standard?",
    mobile: "Quanti tasti ha un pianoforte standard?",
    unit: "tasti",
    effect: "piano",
    solution: 88,
    popup: "HAI TROVATO LA NOTA GIUSTA!",
    explanation: "La tastiera standard comprende 52 tasti bianchi e 36 neri.",
    source: "https://usa.yamaha.com/musical-instruments/pianos/products/arius/",
  },
  {
    id: "Q09",
    category: "Serie TV",
    difficulty: "media",
    prompt: "Quanti episodi ha la serie originale Friends nelle sue dieci stagioni?",
    mobile: "Friends: quanti episodi nelle 10 stagioni?",
    unit: "episodi",
    effect: "friends-sofa",
    solution: 236,
    popup: "THE ONE WITH THE PERFECT GUESS!",
    explanation: "Il catalogo delle dieci stagioni comprende 236 episodi. La reunion è uno speciale separato.",
    source: "https://press.wbd.com/us/media-release/one-where-they-got-back-together",
  },
  {
    id: "Q10",
    category: "Chimica",
    difficulty: "media",
    prompt: "Quanti elementi riconosciuti comprende la tavola periodica pubblicata da IUPAC nel 2022?",
    mobile: "Quanti elementi nella tavola IUPAC del 2022?",
    unit: "elementi",
    effect: "periodic",
    solution: 118,
    popup: "REAZIONE GENIALE!",
    explanation: "La tavola pubblicata da IUPAC nel 2022 arriva al numero atomico 118, oganesson.",
    source: "https://iupac.org/what-we-do/periodic-table-of-elements/",
  },
  {
    id: "Q11",
    category: "Tecnologia",
    difficulty: "media",
    prompt: "Quanti pixel contiene complessivamente uno schermo Full HD con risoluzione 1920 × 1080?",
    mobile: "Full HD: quanti pixel in 1920 × 1080?",
    unit: "pixel",
    effect: "pixels",
    solution: 2073600,
    popup: "PRECISIONE IN ALTA DEFINIZIONE!",
    explanation: "1920 × 1080 = 2.073.600. calcolo esatto.",
    source: null,
  },
  {
    id: "Q12",
    category: "Curiosità storiche",
    difficulty: "media",
    prompt: "Quante statue di guerrieri si stima che compongano l'Esercito di Terracotta cinese?",
    mobile: "Esercito di Terracotta: quanti guerrieri si stimano?",
    unit: "statue",
    effect: "terracotta-army",
    solution: 8000,
    popup: "L'IMPERATORE APPROVA!",
    explanation: "L'Esercito di Terracotta, realizzato per il primo imperatore cinese Qin Shi Huang, comprende migliaia di statue a grandezza naturale. 8.000 guerrieri è una stima, non un conteggio esatto.",
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

export function drawVault(mode) {
  if (mode === "demo") return catalog.slice(0, VAULT_ROUNDS).map(({ id }) => id);
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

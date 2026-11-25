import catalog from "../data/population-countries.json";

// Random Popolazione matches for new culture rooms. Rooms store country IDs,
// never indices, so the catalog can grow without changing saved games.
export const POPULATION_ROUNDS = 10;
export const MIN_RATIO = 1.05;
export const MAX_RATIO = 3;
// Ten matches: 3 easy, 4 medium, 3 hard, shuffled so difficulty is mixed.
export const POPULATION_BANDS = [
  { id: "hard", min: MIN_RATIO, max: 1.35, count: 3 },
  { id: "medium", min: 1.35, max: 1.9, count: 4 },
  { id: "easy", min: 1.9, max: MAX_RATIO, count: 3 },
];

const byId = new Map(catalog.countries.map(country => [country.id, country]));
export const populationCountry = id => byId.get(id);
export const populationRatio = (a, b) => Math.max(a.population, b.population) / Math.min(a.population, b.population);
export const populationBand = (a, b) => {
  const ratio = populationRatio(a, b);
  return POPULATION_BANDS.find(band => ratio >= band.min && ratio < band.max)?.id ??
    (ratio === MAX_RATIO ? "easy" : null);
};

const randomInt = n => crypto.getRandomValues(new Uint32Array(1))[0] % n;
function shuffle(items, random) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

const candidates = Object.fromEntries(POPULATION_BANDS.map(band => [band.id, []]));
for (const [i, a] of catalog.countries.entries())
  for (const b of catalog.countries.slice(i + 1)) {
    const band = populationBand(a, b);
    if (band) candidates[band].push([a.id, b.id]);
  }

// Returns 10 [leftId, rightId] pairs; no country appears twice in a game.
export function drawPopulationPairs(random = randomInt) {
  for (let attempt = 0; attempt < 500; attempt++) {
    const bands = shuffle(POPULATION_BANDS.flatMap(band => Array(band.count).fill(band.id)), random);
    // Avoid three matches of the same difficulty in a row.
    if (bands.some((band, i) => i > 1 && band === bands[i - 1] && band === bands[i - 2])) continue;
    const used = new Set();
    const pairs = [];
    for (const band of bands) {
      const pool = candidates[band].filter(([a, b]) => !used.has(a) && !used.has(b));
      if (!pool.length) break;
      const pair = [...pool[random(pool.length)]];
      if (random(2)) pair.reverse();
      pair.forEach(id => used.add(id));
      pairs.push(pair);
    }
    if (pairs.length === POPULATION_ROUNDS) return pairs;
  }
  throw new Error("Impossibile estrarre i confronti sulla popolazione");
}

export const populationYear = catalog.year;

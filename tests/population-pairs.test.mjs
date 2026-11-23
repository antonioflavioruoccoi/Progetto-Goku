import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { build } from 'esbuild';

const bundle = async entry => {
  const { outputFiles } = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm' });
  return import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64'));
};
const { drawPopulationPairs, populationBand, populationCountry, populationRatio, POPULATION_ROUNDS } = await bundle('worker/population.js');
const { Goku } = await bundle('worker/index.js');
const catalog = JSON.parse(await fs.readFile('data/population-countries.json', 'utf8'));
const fixed = JSON.parse(await fs.readFile('data/population-comparisons.json', 'utf8'));

test('population catalog has at least 60 IDB 2025 countries with local flags', async () => {
  assert.equal(catalog.year, 2025);
  assert.ok(catalog.countries.length >= 60);
  assert.equal(new Set(catalog.countries.map(c => c.id)).size, catalog.countries.length);
  assert.equal(new Set(catalog.countries.map(c => c.iso2)).size, catalog.countries.length);
  for (const country of catalog.countries) {
    assert.match(country.id, /^[A-Z]{3}$/);
    assert.match(country.iso2, /^[A-Z]{2}$/);
    assert.ok(Number.isSafeInteger(country.population) && country.population > 0);
    for (const directory of ['web/assets/flags', 'dist/assets/flags'])
      assert.match(await fs.readFile(`${directory}/${country.iso2.toLowerCase()}.svg`, 'utf8'), /<svg\b/);
  }
  // Same IDB values as the fixed 2025 pairs kept for older rooms.
  for (const country of fixed.pairs.flat()) assert.deepEqual(populationCountry(country.id), country);
});

test('random population matches respect uniqueness, ratio and mixed difficulty over many draws', () => {
  const left = new Map();
  for (let draw = 0; draw < 2000; draw++) {
    const pairs = drawPopulationPairs();
    assert.equal(pairs.length, POPULATION_ROUNDS);
    const ids = pairs.flat();
    assert.equal(new Set(ids).size, 20, 'no country repeated in a game');
    const bands = pairs.map(([a, b]) => {
      const [x, y] = [populationCountry(a), populationCountry(b)];
      assert.ok(x && y);
      const ratio = populationRatio(x, y);
      assert.ok(ratio >= 1.05 && ratio <= 3, `ratio ${ratio}`);
      return populationBand(x, y);
    });
    assert.deepEqual(['easy', 'hard', 'medium'].map(b => bands.filter(x => x === b).length), [3, 3, 4]);
    for (let i = 2; i < bands.length; i++) assert.ok(!(bands[i] === bands[i - 1] && bands[i] === bands[i - 2]));
    for (const [a] of pairs) left.set(a, (left.get(a) || 0) + 1);
  }
  // Left/right order is randomised: most countries appear on both sides.
  assert.ok(left.size > catalog.countries.length * .9);
});

function setup() {
  const game = Object.create(Goku.prototype), records = new Map();
  game.get = (kind, id) => structuredClone(records.get(kind + ':' + id) || null);
  game.put = (kind, id, value) => records.set(kind + ':' + id, structuredClone(value));
  game.all = kind => [...records].filter(([key]) => key.startsWith(kind + ':')).map(([, value]) => structuredClone(value));
  game.ctx = { getWebSockets: () => [] }; game.changed = new Set();
  for (const id of ['admin', 'p1']) game.put('session', id, { id, role: id === 'admin' ? 'admin' : 'player', expires: Date.now() + 86400000 });
  return { game, rpc: (session, action, payload = {}) => game.dispatch(action, payload, { session }) };
}

test('new culture rooms store drawn country IDs and serve them in order without leaking them', t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1700000000000 });
  const { game, rpc } = setup();
  const room = rpc('admin', 'create', { quiz: 'culture' });
  rpc('p1', 'join', { code: room.code, nickname: 'Ash' });
  const r = game.get('room', room.id);
  assert.equal(r.population_year, 2025);
  assert.equal(r.order, undefined);
  assert.equal(r.population_pairs.length, 10);
  assert.ok(r.population_pairs.flat().every(id => /^[A-Z]{3}$/.test(id)));
  rpc('admin', 'command', { room_id: r.id, revision: game.get('room', r.id).revision, command: 'start' });
  for (let round = 1; round <= 10; round++) {
    const current = game.get('room', r.id);
    const snapshot = rpc('p1', 'state', { room_id: r.id });
    assert.equal(snapshot.room.population_pairs, undefined);
    assert.deepEqual(snapshot.population.countries.map(c => c.id), r.population_pairs[round - 1]);
    assert.equal(snapshot.population.year, 2025);
    t.mock.timers.tick(current.starts_at - Date.now());
    const [a, b] = r.population_pairs[round - 1].map(populationCountry);
    const winner = a.population > b.population ? a : b;
    rpc('p1', 'answer', { room_id: r.id, round, answer: winner.id, request_id: crypto.randomUUID() });
    const revealed = rpc('p1', 'state', { room_id: r.id });
    assert.equal(revealed.population.correct, winner.id);
    assert.deepEqual(revealed.population.values, [a.population, b.population]);
    t.mock.timers.tick(10000); game.settle(game.get('room', r.id));
  }
  const after = game.get('room', r.id);
  assert.equal(after.manche, 2);
});

test('stored rooms without drawn pairs keep the fixed 2025 or legacy 2019 comparisons', t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1700000000000 });
  const { game, rpc } = setup();
  for (const [year, values] of [[2025, [60924851, 69145464]], [undefined, [60297396, 58005463]]]) {
    const room = rpc('admin', 'create', { quiz: 'culture' });
    rpc('p1', 'join', { code: room.code, nickname: 'Ash' });
    const r = game.get('room', room.id);
    // Shape of a room saved by the previous release.
    delete r.population_pairs;
    if (year) r.population_year = year; else delete r.population_year;
    r.order = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    Object.assign(r, { round: 1, phase: 'question', starts_at: Date.now(), deadline: Date.now() + 15000, remaining_ms: 15000, answers: {}, settled: 0 });
    game.put('room', r.id, r);
    assert.deepEqual(rpc('p1', 'state', { room_id: r.id }).population.countries.map(c => c.id), ['ITA', 'TZA']);
    rpc('p1', 'answer', { room_id: r.id, round: 1, answer: 'ITA', request_id: crypto.randomUUID() });
    const snapshot = rpc('p1', 'state', { room_id: r.id });
    assert.equal(snapshot.population.year, year ?? 2019);
    assert.deepEqual(snapshot.population.values, values);
  }
});

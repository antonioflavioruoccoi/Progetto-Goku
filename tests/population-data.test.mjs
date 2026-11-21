import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const current = JSON.parse(await fs.readFile('data/population-comparisons.json', 'utf8'));
const legacy = JSON.parse(await fs.readFile('data/population-comparisons-2019.json', 'utf8'));

test('2025 culture data preserves all 2019 country IDs, pairs, order and flag codes', async () => {
  assert.equal(current.year, 2025);
  assert.equal(legacy.year, 2019);
  assert.equal(current.pairs.length, 10);
  assert.equal(legacy.pairs.length, 10);

  const currentCountries = current.pairs.flat();
  const legacyCountries = legacy.pairs.flat();
  assert.equal(currentCountries.length, 20);
  assert.equal(new Set(currentCountries.map(country => country.id)).size, 20);
  assert.deepEqual(
    current.pairs.map(pair => pair.map(country => country.id)),
    legacy.pairs.map(pair => pair.map(country => country.id)),
  );

  for (const [index, pair] of current.pairs.entries()) {
    const historicalPair = legacy.pairs[index];
    for (const [side, country] of pair.entries()) {
      assert.match(country.id, /^[A-Z]{3}$/);
      assert.match(country.iso2, /^[A-Z]{2}$/);
      assert.equal(country.id, historicalPair[side].id);
      assert.equal(country.name, historicalPair[side].name);
      assert.equal(country.iso2, historicalPair[side].iso2);
      assert.ok(Number.isSafeInteger(country.population) && country.population > 0);
      assert.ok(Number.isSafeInteger(historicalPair[side].population) && historicalPair[side].population > 0);
    }
    assert.notEqual(pair[0].population, pair[1].population);
  }

  const idbPair = current.pairs[0];
  assert.deepEqual(idbPair.map(country => country.population), [60924851, 69145464]);
  assert.equal(legacy.pairs[0][0].id, 'ITA');
  assert.equal(legacy.pairs[0][0].population, 60297396);
  assert.equal(legacy.pairs[0][1].id, 'TZA');
  assert.equal(legacy.pairs[0][1].population, 58005463);
});

test('population and flag data sources document reusable public-domain sources', async () => {
  const source = await fs.readFile('data/POPULATION-DATA-SOURCE.md', 'utf8');
  assert.match(source, /November 2026 IDB release/);
  assert.match(source, /YR=2025/);
  assert.match(source, /idb5yr\.txt/);
  assert.match(source, /public domain/);
  assert.match(source, /Natural Earth/);
  assert.match(source, /v5\.1\.1/);
  assert.match(source, /terms-of-use/);

  const flagSource = await fs.readFile('data/FLAGS-SOURCE.md', 'utf8');
  assert.match(flagSource, /public domain/);
  assert.match(flagSource, /c09927e63705529bbf59ca6684cd9b23225dddad/);
});

test('all country flags are local SVGs copied into the deployable static assets', async () => {
  for (const country of current.pairs.flat()) {
    const filename = `${country.iso2.toLowerCase()}.svg`;
    for (const directory of ['web/assets/flags', 'dist/assets/flags']) {
      const svg = await fs.readFile(`${directory}/${filename}`, 'utf8');
      assert.match(svg, /<svg\b/);
      assert.match(svg, /viewBox=/);
    }
  }
});

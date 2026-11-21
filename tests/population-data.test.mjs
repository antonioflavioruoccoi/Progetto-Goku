import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const data = JSON.parse(await fs.readFile('data/population-comparisons.json', 'utf8'));

test('Cultura generale population pairs are 20 unique 2019 sovereign country records', async () => {
  assert.equal(data.year, 2019);
  assert.equal(data.pairs.length, 10);
  const countries = data.pairs.flat();
  assert.equal(countries.length, 20);
  assert.equal(new Set(countries.map(country => country.id)).size, 20);
  for (const [left, right] of data.pairs) {
    for (const country of [left, right]) {
      assert.match(country.id, /^[A-Z]{3}$/);
      assert.ok(country.name);
      assert.ok(Number.isSafeInteger(country.population) && country.population > 0);
    }
    assert.notEqual(left.population, right.population);
  }
  const source = await fs.readFile('data/POPULATION-DATA-SOURCE.md', 'utf8');
  assert.match(source, /v5\.1\.1/);
  assert.match(source, /public domain/);
  assert.match(source, /NAME_IT/);
  assert.match(source, /ADM0_A3/);
});

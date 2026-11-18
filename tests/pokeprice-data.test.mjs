import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseCsv, pokepriceData, PRICE_IMAGES } from '../scripts/pokeprice-data.mjs';
import { selectPriceCards, validComparison } from '../worker/pokeprice.js';

const warnings = [];
const cards = await pokepriceData('.', message => warnings.push(message));

test('CSV quoting, BOM and column validation', () => {
  assert.deepEqual(parseCsv('\uFEFFnome,valore\r\n"Carta, ""X""",123.45\r\n'),
    [{nome:'Carta, "X"', valore:'123.45'}]);
  assert.throws(() => parseCsv('a,b\n1,2,3'), /colonne/);
});

test('PokéPrice build verifies variant identities, Cardmarket 30-day data and local assets', async () => {
  const prices = parseCsv(await fs.readFile('data/pokemon-cards-30d-avg-cardmarket.csv', 'utf8'));
  const report = JSON.parse(await fs.readFile(PRICE_IMAGES + '/download-report.json', 'utf8'));
  assert.equal(cards.length, report.filter(entry => entry.status === 'saved').length);
  assert.equal(cards.length, 47);
  assert.match(warnings.join(), /47\/50.*Lugia.*Mewtwo LV.X.*Leafeon LV.X/);
  assert.equal(new Set(cards.map(card => card.productId)).size, cards.length);
  for (const card of cards) {
    const row = prices.find(row => row.tcgdex_id === card.id);
    assert.ok(row);
    assert.deepEqual([card.name, card.set, card.number, card.productId],
      [row.nome, row.espansione, row.numero, row.cardmarket_id_product]);
    assert.equal(card.cents, Math.round(Number(row.media_30gg_eur) * 100));
    assert.equal(card.priceSource, row.fonte_prezzo);
    assert.equal(card.pricedAt, row.aggiornato_il);
    assert.match(card.image, new RegExp(row.immagine_file + '$'));
    assert.deepEqual(await fs.readFile('dist' + card.image), await fs.readFile('.' + card.image));
  }
  assert.ok(cards.some(card => card.cents > 50000));
  assert.equal(cards.filter(card => card.name === 'Victini').length, 2);
  assert.deepEqual(await fs.readdir('dist/' + PRICE_IMAGES), cards.map(card => card.image.split('/').at(-1)).sort());
});

test('build reports unusable entries and rejects inconsistent mappings', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'goku-prices-'));
  try {
    await fs.mkdir(path.join(root, 'data'));
    const list = 'data/pokemon-cards-100-500.csv';
    await fs.copyFile(list, path.join(root, list));
    const priceFile = path.join(root, 'data/pokemon-cards-30d-avg-cardmarket.csv');
    const original = await fs.readFile('data/pokemon-cards-30d-avg-cardmarket.csv', 'utf8');
    await fs.writeFile(priceFile, original.replace(',479.23,', ',invalid,'));
    await fs.cp(PRICE_IMAGES, path.join(root, PRICE_IMAGES), {recursive: true});
    await fs.writeFile(path.join(root, cards[1].image), 'invalid');
    const messages = [];
    const pool = await pokepriceData(root, message => messages.push(message));
    assert.equal(pool.length, 45);
    assert.match(messages.join(), /prezzo non valido.*file immagine inutilizzabile/);
    await fs.writeFile(priceFile, original.replace('01-reshiram-ex-white-flare-173-086.webp', 'wrong.webp'));
    await assert.rejects(pokepriceData(root), /mapping immagine incongruente/);
  } finally {
    await fs.rm(root, {recursive: true, force: true});
  }
});

test('random sequences have 13 unique cards and every directed difference is at least 5%', () => {
  assert.equal(validComparison({cents:100}, {cents:95}), true);
  assert.equal(validComparison({cents:105}, {cents:100}), false);
  assert.equal(validComparison({cents:100}, {cents:100}), false);
  const sequences = new Set();
  for (let i = 0; i < 100; i++) {
    const sequence = selectPriceCards(cards);
    assert.equal(sequence.length, 13);
    assert.equal(new Set(sequence.map(card => card.id)).size, 13);
    for (let j = 1; j < sequence.length; j++) {
      const before = sequence[j - 1].cents, after = sequence[j].cents;
      assert.ok(Math.abs(before - after) / before >= .05);
    }
    sequences.add(sequence.map(card => card.id).join(','));
  }
  assert.ok(sequences.size > 90);
});

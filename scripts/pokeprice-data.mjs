import fs from "node:fs/promises";
import path from "node:path";
import { validatePricePool } from "../worker/pokeprice.js";

export const PRICE_IMAGES = "assets/pokemon-cardmarket-100-500";

export function parseCsv(source) {
  const rows = [];
  let row = [];
  // Match one complete field and its separator, including quoted commas and quotes.
  const field = /(?:"((?:[^"]|"")*)"|([^",\r\n]*))(,|\r?\n|$)/y;
  const csv = source.replace(/^\uFEFF/, "").replace(/\r?\n$/, "");
  do {
    const token = field.exec(csv);
    if (!token) throw Error("PokéPrice: CSV malformato");
    row.push(token[1] === undefined ? token[2] : token[1].replaceAll('""', '"'));
    if (token[3] !== ",") {
      rows.push(row);
      row = [];
    }
    if (!token[3]) break;
  } while (field.lastIndex <= csv.length);

  const headers = rows.shift();
  if (new Set(headers).size !== headers.length) throw Error("PokéPrice: colonne CSV duplicate");
  return rows.map(values => {
    if (values.length !== headers.length) throw Error("PokéPrice: numero di colonne CSV incongruente");
    return Object.fromEntries(headers.map((header, i) => [header, values[i]]));
  });
}

const key = (name, set, number) => JSON.stringify([name, set, number]);

function indexed(rows, identity, label) {
  const result = new Map();
  for (const row of rows) {
    const id = identity(row);
    if (result.has(id)) throw Error(`PokéPrice: identità duplicata in ${label} ${id}`);
    result.set(id, row);
  }
  return result;
}

function usableWebp(bytes) {
  if (bytes.length < 20 || bytes.toString("ascii", 0, 4) !== "RIFF"
    || bytes.toString("ascii", 8, 12) !== "WEBP" || bytes.readUInt32LE(4) !== bytes.length - 8) return false;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const size = bytes.readUInt32LE(offset + 4);
    const end = offset + 8 + size;
    if (end > bytes.length) return false;
    if (["VP8 ", "VP8L"].includes(bytes.toString("ascii", offset, offset + 4))) return size >= 10;
    offset = end + (size % 2);
  }
  return false;
}

export async function pokepriceData(root = ".", warn = console.warn) {
  const read = file => fs.readFile(path.join(root, file), "utf8");
  const [list, prices, report] = await Promise.all([
    read("data/pokemon-cards-100-500.csv").then(parseCsv),
    read("data/pokemon-cards-30d-avg-cardmarket.csv").then(parseCsv),
    read(`${PRICE_IMAGES}/download-report.json`).then(JSON.parse),
  ]);
  const listed = indexed(list, c => key(c.name, c.set, c.number), "elenco");
  const images = indexed(report, c => key(c.name, c.set, c.number), "report");
  const priced = indexed(prices, c => key(c.nome, c.espansione, c.numero), "prezzi");
  if (listed.size !== priced.size || listed.size !== images.size)
    throw Error("PokéPrice: elenco, prezzi e report hanno conteggi diversi");

  const cards = [], excluded = [], productIds = new Set(), tcgdexIds = new Set(), files = new Set();
  for (const [identity, card] of listed) {
    const price = priced.get(identity);
    const image = images.get(identity);
    if (!price || !image || !card.name || !card.set || !card.number)
      throw Error(`PokéPrice: mapping incompleto per ${identity}`);
    if (image.status !== "saved") {
      if (price.immagine_file || image.status !== "not_found")
        throw Error(`PokéPrice: stato immagine incongruente per ${identity}`);
      excluded.push(`${card.name} (${card.set}, immagine mancante)`);
      continue;
    }
    if (image.filename !== price.immagine_file || image.tcgdex_id !== price.tcgdex_id
      || !/^[\w.-]+\.webp$/.test(image.filename) || files.has(image.filename))
      throw Error(`PokéPrice: mapping immagine incongruente per ${identity}`);
    files.add(image.filename);
    const cents = Math.round(Number(price.media_30gg_eur) * 100);
    if (price.stato !== "ok" || !/^\d+(?:\.\d{1,2})?$/.test(price.media_30gg_eur)
      || !Number.isSafeInteger(cents) || cents <= 0) {
      excluded.push(`${card.name} (${card.set}, prezzo non valido)`);
      continue;
    }
    if (!/^\d+$/.test(price.cardmarket_id_product) || !price.tcgdex_id || !price.fonte_prezzo
      || !Number.isFinite(Date.parse(price.aggiornato_il)) || productIds.has(price.cardmarket_id_product)
      || tcgdexIds.has(price.tcgdex_id))
      throw Error(`PokéPrice: ID o metadati prezzo incongruenti per ${identity}`);
    productIds.add(price.cardmarket_id_product);
    tcgdexIds.add(price.tcgdex_id);
    const file = `${PRICE_IMAGES}/${image.filename}`;
    const bytes = await fs.readFile(path.join(root, file)).catch(error => {
      if (error.code !== "ENOENT") throw error;
      return Buffer.alloc(0);
    });
    if (!usableWebp(bytes)) {
      excluded.push(`${card.name} (${card.set}, file immagine inutilizzabile)`);
      continue;
    }
    cards.push({
      ...card, id: price.tcgdex_id, productId: price.cardmarket_id_product,
      cents, image: `/${file}`, priceSource: price.fonte_prezzo, pricedAt: price.aggiornato_il,
    });
  }
  if (excluded.length) warn(`PokéPrice: ${cards.length}/${listed.size} carte utilizzabili. Escluse: ${excluded.join("; ")}.`);
  validatePricePool(cards);
  return cards;
}

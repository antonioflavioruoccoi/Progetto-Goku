// Test del riconoscimento dei nomi della manche 6. Avvio: node --test server/
import { test } from "node:test";
import assert from "node:assert/strict";
import { albumMatch } from "./worker-index.js";

const amadeus = ["Amadeus"];
const carra = ["Raffaella Carrà", "Carrà"];
const canna = ["Antonino Cannavacciuolo", "Cannavacciuolo"];
const demartino = ["Stefano De Martino", "De Martino"];
const toto = ["Totò"];
const vasco = ["Vasco Rossi", "Rossi"];
const hill = ["Terence Hill", "Hill"];

test("5 risposte giuste: refusi, maiuscole, accenti, prefisso", () => {
  assert.ok(albumMatch("Amadaus", amadeus), "un refuso");
  assert.ok(albumMatch("RAFFAELLA CARRA", carra), "maiuscole e senza accento");
  assert.ok(albumMatch("canavacciuolo", canna), "solo il cognome lungo, una lettera in meno");
  assert.ok(albumMatch("Mi chiamo Stefano De Martino", demartino), "con il prefisso Mi chiamo");
  assert.ok(albumMatch("toto", toto), "senza accento");
});

test("5 risposte sbagliate", () => {
  assert.ok(!albumMatch("Fiorello", amadeus), "un altro VIP");
  assert.ok(!albumMatch("Valentino Rossi", vasco), "stesso cognome, persona diversa");
  assert.ok(!albumMatch("Bill", hill), "cognome corto con un refuso");
  assert.ok(!albumMatch("", demartino), "risposta vuota");
  assert.ok(!albumMatch("Totti", toto), "troppo diverso per un nome corto");
});

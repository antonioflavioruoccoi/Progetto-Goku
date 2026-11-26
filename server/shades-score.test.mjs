// Test del punteggio della manche 7 "50 Sfumature". Avvio: node --test server/
import { test } from "node:test";
import assert from "node:assert/strict";
import { shadesScore } from "./worker-index.js";

test("colore identico: 100% e 200 punti", () => {
  // #e4000b (rosso LEGO) in HSV: tonalita' 357, saturazione 100, luminosita' 89
  const r = shadesScore({ h: 357, s: 100, v: 89 }, "#e4000b");
  assert.ok(r.accuracy >= 99, `precisione ${r.accuracy}`);
  assert.ok(r.points >= 198 && r.points <= 200, `punti ${r.points}`);
});

test("piu' vicino vale di piu'", () => {
  const target = "#1ed860"; // verde Spotify, circa 141/86/85
  const near = shadesScore({ h: 145, s: 80, v: 80 }, target).points;
  const mid = shadesScore({ h: 170, s: 60, v: 60 }, target).points;
  const far = shadesScore({ h: 330, s: 90, v: 40 }, target).points;
  assert.ok(near > mid && mid > far, `${near} > ${mid} > ${far}`);
  assert.ok(far < 60, `colore opposto: ${far}`);
});

test("sempre tra 0 e 200 punti", () => {
  for (let h = 0; h < 360; h += 37) for (const s of [0, 50, 100]) for (const v of [0, 50, 100]) {
    const { points, accuracy } = shadesScore({ h, s, v }, "#5372a6");
    assert.ok(Number.isInteger(points) && points >= 0 && points <= 200);
    assert.ok(accuracy >= 0 && accuracy <= 100);
  }
});

test("grigio e nero: la tonalita' nascosta non cambia i punti", () => {
  const target = "#e4000b";
  assert.equal(shadesScore({ h: 357, s: 0, v: 60 }, target).points, shadesScore({ h: 180, s: 0, v: 60 }, target).points);
  assert.equal(shadesScore({ h: 357, s: 100, v: 0 }, target).points, shadesScore({ h: 180, s: 100, v: 0 }, target).points);
});

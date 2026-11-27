// Test del filtro nickname e del limite di 20 licenze/stanze. Avvio: node --test server/
import { test } from "node:test";
import assert from "node:assert/strict";
import { Goku, inappropriateName } from "./worker-index.js";

test("blocca Gesù, Gesu, Jesus e le bestemmie al contrario", () => {
  for (const bad of ["Gesù", "gesu", "JESUS", "J3sus", "oidocrop", "OidOcrop", "nacoid", "otsircocrop", "suseJ"])
    assert.equal(inappropriateName(bad), true, bad);
});

test("lascia passare nomi normali", () => {
  for (const ok of ["Antonio", "Gesualdo", "Diana", "Pikachu", "Marco 92"])
    assert.equal(inappropriateName(ok), false, ok);
});

test("tiene solo le 20 più recenti", () => {
  const store = new Map(Array.from({ length: 25 }, (_, i) => [`r${i}`, { id: `r${i}`, created: i }]));
  store.set("vecchia", { id: "vecchia" }); // stanza vecchia senza data
  const fake = { all: () => [...store.values()], del: (_, id) => store.delete(id) };
  Goku.prototype.keepNewest.call({ ...fake, newest: Goku.prototype.newest }, "room");
  assert.equal(store.size, 20);
  assert.ok(store.has("r24") && store.has("r5") && !store.has("r4") && !store.has("vecchia"));
});

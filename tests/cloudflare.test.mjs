import { test } from "node:test";
import assert from "node:assert/strict";
import { Miniflare } from "miniflare";
import { build } from "esbuild";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const { outputFiles } = await build({
  entryPoints: ["worker/index.js"],
  bundle: true,
  write: false,
  format: "esm",
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test("Cloudflare SQLite: authentication, atomic licenses, multiplayer, alarms and persistence", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "goku-test-"));
  const options = {
    modules: true,
    script: outputFiles[0].text,
    compatibilityDate: "2026-08-01",
    durableObjects: { GOKU: { className: "Goku", useSQLite: true } },
    durableObjectsPersist: dir,
    bindings: { ADMIN_PASSWORD: "test-password-only" },
  };
  let mf = new Miniflare(options);
  const users = {};
  let room, priceRoom, hostRoom, license, expiryLicense, expiryRoom, lobbyRoom;
  async function rpc(who, action, payload = {}, extra = {}) {
    const response = await mf.dispatchFetch("https://goku.test/api/rpc", {
      method: "POST",
      headers: {
        Origin: "https://goku.test",
        "Content-Type": "application/json",
        Cookie: users[who] || "",
        "CF-Connecting-IP": who,
        ...extra,
      },
      body: JSON.stringify({ action, payload }),
    });
    const data = await response.json();
    const cookie = response.headers.get("Set-Cookie");
    if (cookie) {
      assert.match(cookie, /HttpOnly; Secure; SameSite=Strict/);
      users[who] = cookie.split(";")[0];
    }
    return { status: response.status, ...data };
  }
  const ok = async (who, action, payload) => {
    const r = await rpc(who, action, payload);
    assert.equal(r.error, undefined, JSON.stringify(r));
    return r;
  };
  const denied = async (who, action, payload, pattern) => {
    const r = await rpc(who, action, payload);
    assert.match(r.error, pattern);
    return r;
  };
  const state = (who, id) => ok(who, "state", { room_id: id });
  const command = async (who, id, c) => {
    const s = await state(who, id);
    return ok(who, "command", {
      room_id: id,
      revision: s.room.revision,
      command: c,
    });
  };
  const socket = async (who, id) => {
    const response = await mf.dispatchFetch(
      "https://goku.test/api/socket?room=" + id,
      {
        headers: {
          Origin: "https://goku.test",
          Cookie: users[who],
          Upgrade: "websocket",
        },
      },
    );
    assert.equal(response.status, 101);
    response.webSocket.accept();
    return response.webSocket;
  };
  try {
    await t.test(
      "admin password, CSRF, player privileges, session cookie and login throttling",
      async () => {
        await denied("none", "dashboard", {}, /Autenticazione/);
        const csrf = await rpc(
          "none",
          "login",
          { password: "test-password-only" },
          { Origin: "https://evil.test" },
        );
        assert.equal(csrf.status, 403);
        for (let i = 0; i < 5; i++)
          await denied("bad", "login", { password: "wrong" }, /Password/);
        assert.equal(
          (await rpc("bad", "login", { password: "wrong" })).status,
          429,
        );
        // Production CF-Connecting-IP is supplied by Cloudflare, not by the browser.
        await ok("admin", "login", { password: "test-password-only" });
        await ok("p1", "identity");
        await denied("p1", "create", {}, /Licenza/);
        await denied(
          "p1",
          "license_create",
          { hours: 1, max_rooms: 1 },
          /Solo Admin/,
        );
        await denied("p1", "dashboard", {}, /Solo Admin/);
      },
    );
    await t.test(
      "one-use links, concurrent redemption, atomic room quotas and revocation",
      async () => {
        license = await ok("admin", "license_create", {
          hours: 1,
          max_rooms: 2,
        });
        const race = await Promise.all(
          Array.from({ length: 10 }, (_, i) =>
            rpc("redeemer" + i, "redeem", { token: license.token }),
          ),
        );
        assert.equal(race.filter((x) => !x.error).length, 1);
        users.host = users["redeemer" + race.findIndex((x) => !x.error)];
        await denied(
          "stranger",
          "redeem",
          { token: license.token },
          /già riscattato/,
        );
        const rooms = await Promise.all(
          Array.from({ length: 12 }, () => rpc("host", "create", {})),
        );
        assert.equal(rooms.filter((x) => !x.error).length, 2);
        hostRoom = rooms.find((x) => x.id);
        const dashboard = await ok("admin", "dashboard");
        assert.equal(
          dashboard.licenses.find((l) => l.id === license.id).used_rooms,
          2,
        );
        assert.equal(JSON.stringify(dashboard).includes(license.token), false);
        assert.equal(JSON.stringify(dashboard).includes("token_hash"), false);
        const revoked = await ok("admin", "license_create", {
          hours: 1,
          max_rooms: 1,
        });
        await ok("admin", "license_revoke", { license_id: revoked.id });
        await denied(
          "stranger",
          "redeem",
          { token: revoked.token },
          /revocato/,
        );
        const expired = await ok("admin", "license_create", {
          hours: 0.00001,
          max_rooms: 1,
        });
        await sleep(70);
        await denied("stranger", "redeem", { token: expired.token }, /scaduto/);
        await denied("stranger", "redeem", { token: "invalid" }, /non valido/);
        room = await ok("admin", "create");
        await denied("host", "state", { room_id: room.id }, /non accessibile/);
      },
    );
    await t.test(
      "WebSocket snapshots, reconnect identity, server rules and alarm reveal",
      async () => {
        await ok("p2", "identity");
        await ok("p1", "join", { code: room.code, nickname: "Ash" });
        await ok("p2", "join", { code: room.code, nickname: "Misty" });
        const before = await state("p1", room.id);
        assert.equal(before.me.nickname, "Ash");
        assert.equal(before.can_control, false);
        await denied(
          "p1",
          "command",
          {
            room_id: room.id,
            revision: before.room.revision,
            command: "start",
          },
          /Privilegi/,
        );
        await denied("p1", "card", { room_id: room.id }, /conduttore/);
        let ws = await socket("p1", room.id);
        let updates = [];
        ws.addEventListener("message", (e) => updates.push(JSON.parse(e.data)));
        await command("admin", room.id, "start");
        await sleep(100);
        assert.ok(updates.some((x) => x.room.phase === "question"));
        const active = await state("p1", room.id);
        assert.equal(active.solution, null);
        assert.equal(active.room.order, undefined);
        assert.equal(active.room.answers, undefined);
        assert.equal(JSON.stringify(active).includes("live-cards"), false);
        await denied(
          "p1",
          "answer",
          {
            room_id: room.id,
            round: 1,
            request_id: crypto.randomUUID(),
            answer: "Pikachu",
          },
          /chiuse/,
        );
        await sleep(2100);
        await command("admin", room.id, "pause");
        await denied(
          "p1",
          "answer",
          {
            room_id: room.id,
            round: 1,
            request_id: crypto.randomUUID(),
            answer: "Pikachu",
          },
          /pausa/,
        );
        await command("admin", room.id, "resume");
        const card = await ok("admin", "card", { room_id: room.id });
        const data = JSON.parse(
          await fs.readFile("worker/generated/quiz.json", "utf8"),
        );
        const correct = data.cards.find((c) => c.opaque === card.asset).name;
        const wrong = {
          room_id: room.id,
          round: 1,
          request_id: crypto.randomUUID(),
          answer: "Pikachu",
        };
        assert.equal(
          (await ok("p1", "answer", { ...wrong, answer: "zzzzzzzzzzzz" }))
            .result,
          "invalid",
        );
        await sleep(260);
        for (let i = 1; i <= 3; i++) {
          const a = await ok("p1", "answer", {
            ...wrong,
            request_id: crypto.randomUUID(),
          });
          assert.equal(a.attempts, i);
          assert.equal(a.done, i === 3);
          await sleep(260);
        }
        const answer = {
          room_id: room.id,
          round: 1,
          request_id: crypto.randomUUID(),
          answer: correct,
          points: 999999,
        };
        const won = await ok("p2", "answer", answer);
        assert.equal(won.result, "correct");
        assert.ok(won.points > 0 && won.points <= 300);
        assert.deepEqual(await ok("p2", "answer", answer), won);
        ws.close();
        await sleep(100);
        ws = await socket("p2", room.id);
        updates = [];
        ws.addEventListener("message", (e) => updates.push(JSON.parse(e.data)));
        assert.equal((await state("p2", room.id)).me.done, true);
        // A real DO alarm, with no polling and no connected host, reveals the question.
        await sleep(
          Math.max(
            0,
            (await state("admin", room.id)).room.deadline - Date.now(),
          ) + 350,
        );
        assert.ok(updates.some((x) => x.room.phase === "reveal"));
        const revealed = await state("p2", room.id);
        assert.equal(revealed.solution, correct);
        assert.equal(revealed.me.score, won.points);
        assert.equal(revealed.players[0].nickname, "Misty");
        assert.equal((await state("p2", room.id)).me.score, won.points);
        await command("admin", room.id, "end");
        assert.equal((await state("p2", room.id)).room.phase, "finished");
        await ok("late-finished", "identity");
        await denied("late-finished", "join", { code: room.code, nickname: "Brock" }, /terminata/);
        assert.equal((await ok("p2", "join", { code: room.code, nickname: "Misty" })).id, room.id);
        ws.close();
      },
    );
    await t.test(
      "expired host may finish running games; revoked active session loses control immediately",
      async () => {
        expiryLicense = await ok("admin", "license_create", {
          hours: 0.0004,
          max_rooms: 2,
        });
        await ok("expiring", "redeem", { token: expiryLicense.token });
        expiryRoom = await ok("expiring", "create");
        lobbyRoom = await ok("expiring", "create");
        await ok("p1", "join", { code: expiryRoom.code, nickname: "Ash" });
        await ok("p1", "join", { code: lobbyRoom.code, nickname: "Ash" });
        await command("expiring", expiryRoom.id, "start");
        await sleep(2200);
        await denied("expiring", "create", {}, /scaduta/);
        const lobby = await state("expiring", lobbyRoom.id);
        await denied(
          "expiring",
          "command",
          {
            room_id: lobbyRoom.id,
            revision: lobby.room.revision,
            command: "start",
          },
          /Privilegi/,
        );
        await command("expiring", expiryRoom.id, "pause");
        await command("expiring", expiryRoom.id, "resume");
        const ws = await socket("expiring", expiryRoom.id);
        let revoked = false;
        ws.addEventListener("message", (e) => {
          if (!JSON.parse(e.data).can_control) revoked = true;
        });
        await ok("admin", "license_revoke", { license_id: expiryLicense.id });
        await sleep(100);
        assert.equal(revoked, true);
        const current = await state("expiring", expiryRoom.id);
        assert.equal(current.can_control, false);
        await denied(
          "expiring",
          "command",
          {
            room_id: expiryRoom.id,
            revision: current.room.revision,
            command: "end",
          },
          /Privilegi/,
        );
        ws.close();
        await command("admin", expiryRoom.id, "end");
      },
    );
    await t.test("PokéPrice snapshots stay private across WebSocket and reconnect", async () => {
      priceRoom = await ok("admin", "create");
      await ok("p1", "join", { code: priceRoom.code, nickname: "Ash" });
      await denied("host", "state", { room_id: priceRoom.id }, /non accessibile/);
      await command("admin", priceRoom.id, "start");
      const ws = await socket("p1", priceRoom.id);
      const snapshots = [];
      ws.addEventListener("message", event => snapshots.push(JSON.parse(event.data)));
      await command("admin", priceRoom.id, "skip_to_clues");
      await command("admin", priceRoom.id, "skip_to_price");
      const intro = await state("p1", priceRoom.id);
      assert.equal(intro.room.manche, "price");
      assert.equal(intro.room.priceOrder, undefined);
      assert.equal(intro.price.candidate.cents, undefined);
      const answer = { room_id: priceRoom.id, round: 13, request_id: crypto.randomUUID(), answer: "higher" };
      await denied("p1", "answer", answer, /chiuse/);
      await sleep(Math.max(0, intro.room.starts_at - Date.now()) + 100);
      await denied("p2", "join", { code: priceRoom.code, nickname: "Ash" }, /già utilizzato/);
      assert.equal((await ok("p2", "join", { code: priceRoom.code, nickname: "Misty" })).id, priceRoom.id);
      const late = await state("p2", priceRoom.id);
      assert.equal(late.room.phase, "question");
      assert.equal(late.price.round, 1);
      assert.equal(late.price.candidate.cents, undefined);
      assert.equal(late.me.score, 0);
      assert.equal(late.me.streak, 0);
      assert.deepEqual(await ok("p2", "answer", answer), { status: 200, done: true, choice: "higher" });
      const replies = await Promise.all([
        rpc("p1", "answer", answer),
        rpc("p1", "answer", { ...answer, request_id: crypto.randomUUID(), answer: "lower" }),
      ]);
      const accepted = replies.find(reply => reply.status === 200);
      assert.equal(replies.filter(reply => reply.status === 200).length, 1);
      if (accepted.choice === "higher") assert.deepEqual(await ok("p1", "answer", answer), accepted);
      else await denied("p1", "answer", answer, /completato/);
      assert.ok(snapshots.some(snapshot => snapshot.price?.round === 1));
      assert.ok(snapshots.filter(snapshot => snapshot.price).every(snapshot => snapshot.price.candidate.cents === undefined));
      ws.close();

      await command("admin", priceRoom.id, "pause");
      const paused = await state("p1", priceRoom.id);
      const reconnected = await socket("p1", priceRoom.id);
      try {
        assert.equal(paused.me.choice, accepted.choice);
        assert.equal(paused.me.score, 0);
        assert.equal(paused.me.streak, 0);
        assert.equal(paused.price.candidate.cents, undefined);
        assert.equal((await state("p2", priceRoom.id)).me.choice, "higher");
        await command("admin", priceRoom.id, "end");
        const final = await state("p1", priceRoom.id);
        assert.equal(final.room.phase, "finished");
        assert.equal(final.me.score, accepted.choice === final.price.direction ? 100 : -50);
        assert.equal((await state("p2", priceRoom.id)).me.score, final.price.direction === "higher" ? 100 : -50);
      } finally {
        reconnected.close();
      }
    });
    await t.test(
      "SQLite survives runtime restart: sessions, licenses, room state and scores",
      async () => {
        const before = await state("p2", room.id);
        const priceBefore = await state("p1", priceRoom.id);
        await mf.dispose();
        mf = new Miniflare(options);
        await mf.ready;
        const after = await state("p2", room.id);
        assert.equal(after.me.score, before.me.score);
        assert.equal(after.me.nickname, before.me.nickname);
        assert.equal(after.room.phase, "finished");
        const priceAfter = await state("p1", priceRoom.id);
        assert.deepEqual(priceAfter.price, priceBefore.price);
        assert.deepEqual(priceAfter.me, priceBefore.me);
        assert.equal((await ok("admin", "dashboard")).admin, true);
        await denied("host", "create", {}, /Quota/);
        await ok("admin", "logout");
        await denied("admin", "dashboard", {}, /Autenticazione/);
      },
    );
  } finally {
    await mf.dispose();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

import quiz from "./generated/quiz.json";
import populations from "../data/population-comparisons.json";
import legacyPopulations from "../data/population-comparisons-2019.json";
import { CHRONOLOGY_ROUNDS, correctChronology, drawChronology } from "./chronology.js";
import {
  PRICE_START, PRICE_ROUNDS, PRICE_DURATION,
  selectPriceCards, settlePrice, priceSnapshot,
} from "./pokeprice.js";
const quizOf = r => r.quiz || "pokemon";
const cultureStages = [
  { id: "population", count: populations.pairs.length, duration: 15000 },
  { id: "chronology", count: CHRONOLOGY_ROUNDS, duration: 30000 },
];
const cultureStage = r => quizOf(r) === "culture" ? cultureStages[(r.manche || 1) - 1] : null;
const isChronology = r => cultureStage(r)?.id === "chronology";
// The client's reconnect backoff refreshes via HTTP at least every 15.3 seconds.
const POLL_PRESENCE_MS = 20000;
const populationsFor = r => (r.population_year || legacyPopulations.year) === populations.year ? populations : legacyPopulations;
const roundDuration = r => cultureStage(r)?.duration ?? (quizOf(r) === "culture" ? 0 : r.manche === "price" ? PRICE_DURATION : 30000);
const rounds = r => quizOf(r) === "culture" ? cultureStage(r)?.count ?? 0 : PRICE_START + PRICE_ROUNDS - 1;
const DAY = 86400000;
const unavailable = () => {
  console.warn("Goku: operazione temporaneamente non disponibile");
  return json({ error: "Servizio temporaneamente non disponibile" }, 503);
};
const json = (data, status = 200, headers = {}) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
const fail = (message, status = 403) => {
  throw Object.assign(new Error(message), { status });
};
const token = () =>
  [...crypto.getRandomValues(new Uint8Array(32))]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
const hash = async (value) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
const cookie = (value) =>
  `__Host-goku=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${value ? 365 * 86400 : 0}`;
const normalize = (s) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const canonical = name => name === "codaurlante" ? "screamtail" : name;
function resolveName(text) {
  const input = normalize(text);
  if (quiz.names.includes(input)) return canonical(input);
  let best = Infinity,
    matches = [];
  for (const name of quiz.names) {
    const limit = name.length >= 8 ? 2 : name.length >= 4 ? 1 : 0;
    if (Math.abs(input.length - name.length) > limit) continue;
    let row = Array.from({ length: name.length + 1 }, (_, i) => i);
    for (let i = 1; i <= input.length; i++) {
      const next = [i];
      for (let j = 1; j <= name.length; j++)
        next[j] = Math.min(
          next[j - 1] + 1,
          row[j] + 1,
          row[j - 1] + (input[i - 1] !== name[j - 1]),
        );
      row = next;
    }
    const d = row[name.length];
    if (d > limit || d > best) continue;
    if (d < best) {
      best = d;
      matches = [];
    }
    matches.push(name);
  }
  return matches.length === 1 ? canonical(matches[0]) : null;
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    try {
      if (request.headers.get("Origin") !== url.origin)
        fail("Origine non autorizzata");
      if (url.pathname !== "/api/rpc" && url.pathname !== "/api/socket")
        fail("Non trovato", 404);
      if (
        url.pathname === "/api/rpc" &&
        (request.method !== "POST" ||
          !request.headers.get("Content-Type")?.startsWith("application/json"))
      )
        fail("Richiesta non valida", 400);
      const rawCookie =
        request.headers
          .get("Cookie")
          ?.match(/(?:^|;\s*)__Host-goku=([a-f0-9]{64})(?:;|$)/)?.[1] || "";
      const session = rawCookie ? await hash(rawCookie) : "";
      if (url.pathname === "/api/socket") {
        if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
          fail("WebSocket richiesto", 400);
        return await env.GOKU.getByName("goku").fetch(
          new Request(
            "https://internal/socket?room=" +
              encodeURIComponent(url.searchParams.get("room") || ""),
            { headers: { Upgrade: "websocket", "X-Session": session } },
          ),
        );
      }
      const raw = await request.text();
      if (raw.length > 4096) fail("Richiesta troppo grande", 413);
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        fail("Richiesta non valida", 400);
      }
      const { action, payload = {} } = body || {};
      if (typeof action !== "string") fail("Richiesta non valida", 400);
      if (!payload || typeof payload !== "object" || Array.isArray(payload))
        fail("Dati non validi", 400);
      const secret = token(),
        invite = token();
      const auth = {
        session,
        newHash: await hash(secret),
        inviteHash: await hash(invite),
        ip: await hash(request.headers.get("CF-Connecting-IP") || "local"),
      };
      if (action === "login") {
        const supplied = await hash(String(payload.password || "")),
          expected = await hash(env.ADMIN_PASSWORD || token());
        let diff = 0;
        for (let i = 0; i < expected.length; i++)
          diff |= supplied.charCodeAt(i) ^ expected.charCodeAt(i);
        auth.passwordOK = !!env.ADMIN_PASSWORD && diff === 0;
        delete payload.password;
      }
      if (action === "redeem") {
        auth.tokenHash = await hash(String(payload.token || ""));
        delete payload.token;
      }
      const response = await env.GOKU.getByName("goku").fetch(
        "https://internal/rpc",
        { method: "POST", body: JSON.stringify({ action, payload, auth }) },
      );
      const data = await response.json();
      const headers = {};
      if (data.setSession) {
        headers["Set-Cookie"] = cookie(secret);
        delete data.setSession;
      }
      if (data.clearSession) {
        headers["Set-Cookie"] = cookie("");
        delete data.clearSession;
      }
      if (data.invite) {
        data.token = invite;
        delete data.invite;
      }
      return json(data, response.status, headers);
    } catch (e) {
      return e.status ? json({ error: e.message }, e.status) : unavailable();
    }
  },
};

// One SQLite authority serializes license redemption, quotas and game operations.
// JSON rows are private; only explicitly projected snapshots leave this object.
export class Goku {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS records (kind TEXT, id TEXT, data TEXT NOT NULL, PRIMARY KEY(kind,id))",
    );
  }
  get(kind, id) {
    const r = this.sql
      .exec("SELECT data FROM records WHERE kind=? AND id=?", kind, id)
      .toArray()[0];
    return r ? JSON.parse(r.data) : null;
  }
  put(kind, id, data) {
    this.sql.exec(
      "INSERT OR REPLACE INTO records VALUES(?,?,?)",
      kind,
      id,
      JSON.stringify(data),
    );
  }
  del(kind, id) {
    this.sql.exec("DELETE FROM records WHERE kind=? AND id=?", kind, id);
  }
  all(kind) {
    return this.sql
      .exec("SELECT data FROM records WHERE kind=?", kind)
      .toArray()
      .map((r) => JSON.parse(r.data));
  }
  session(key) {
    const s = this.get("session", key);
    return s && s.expires > Date.now() ? s : null;
  }
  async adminSessionKey(key) {
    if (!this.env.ADMIN_PASSWORD) return "";
    const encoder = new TextEncoder();
    this.adminSigningKey ??= crypto.subtle.importKey(
      "raw", encoder.encode(this.env.ADMIN_PASSWORD), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
    const signature = await crypto.subtle.sign("HMAC", await this.adminSigningKey, encoder.encode(key));
    return "admin:" + [...new Uint8Array(signature)].map(n => n.toString(16).padStart(2, "0")).join("");
  }
  async sessionKey(key) {
    if (!key) return "";
    const s = this.session(key);
    return s && s.role !== "admin" ? key : this.adminSessionKey(key);
  }
  pruneTemporaryRecords(now) {
    if (now < this.nextPruneAt) return;
    this.sql.exec(
      `DELETE FROM records
       WHERE (kind = 'rate' AND json_extract(data, '$.until') <= ?)
          OR (kind = 'session' AND json_extract(data, '$.expires') <= ?)`,
      now, now,
    );
    this.nextPruneAt = now + 3600000;
  }
  license(s) {
    return s?.license ? this.get("license", s.license) : null;
  }
  control(s, r) {
    const l = this.license(s);
    return (
      !!s &&
      (s.role === "admin" ||
        (s.id === r.host_id &&
          l &&
          !l.revoked &&
          (r.phase !== "lobby" || l.expires > Date.now())))
    );
  }
  readable(s, r) {
    return (
      s && r && (s.role === "admin" || s.id === r.host_id || r.players[s.id])
    );
  }
  publicRoom(r) {
    const { players, answers, order, clueOrder, priceOrder, chronologyOrder, polling, settled, ...publicData } = r;
    publicData.quiz ||= "pokemon";
    publicData.manche ||= publicData.quiz === "culture" ? 1 : "cards";
    if (publicData.quiz === "culture") publicData.manche_total = cultureStages.length;
    return publicData;
  }
  advanceRound(r, now = Date.now()) {
    if (r.round === rounds(r)) {
      if (cultureStage(r)?.id !== "population") {
        r.phase = "finished";
        return;
      }
      r.manche = 2;
      r.chronologyOrder ??= drawChronology();
      r.round = r.settled = 0;
    }
    r.round++;
    r.phase = "question";
    r.starts_at = now + (r.manche === "price" || isChronology(r) ? 0 : 2000);
    r.remaining_ms = roundDuration(r);
    r.deadline = r.starts_at + r.remaining_ms;
    r.answers = {};
    r.cluesShown = 0;
  }
  chronologyParticipants(r, connected = this.connectedPlayers(r)) {
    const cutoff = Date.now() - POLL_PRESENCE_MS;
    return Object.keys(r.players).filter(id => connected.has(id) || r.polling?.[id] > cutoff);
  }
  connectedPlayers(r) {
    return new Set(this.ctx.getWebSockets(r.id)
      .filter(ws => ws.readyState === 1)
      .map(ws => ws.deserializeAttachment()?.user));
  }
  recordPoll(r, id, now) {
    if (quizOf(r) !== "culture" || r.phase === "finished" || !r.players[id] ||
        this.connectedPlayers(r).has(id)) return false;
    r.polling ??= {};
    r.polling[id] = now;
    return true;
  }
  settle(r, force = false) {
    let changed = false;
    const now = Date.now();
    const complete = () => {
      const ids = isChronology(r) ? this.chronologyParticipants(r) : Object.keys(r.players);
      return ids.length > 0 && ids.every(id => r.answers[id]?.done);
    };
    if (r.phase === "question" && (r.deadline <= now || (now >= r.starts_at && complete()))) {
      if (quizOf(r) === "culture") {
        r.remaining_ms = isChronology(r) ? 15000 : 10000;
        r.deadline = now + r.remaining_ms;
      } else r.deadline = Math.min(r.deadline, now);
      r.phase = "reveal";
      r.revision++;
      changed = true;
    }
    if (
      (force || ["reveal", "finished"].includes(r.phase)) &&
      r.settled < r.round
    ) {
      if (r.manche === "price") settlePrice(r);
      else for (const [id, a] of Object.entries(r.answers))
        r.players[id].score += a.points || 0;
      r.settled = r.round;
      changed = true;
    }
    if (!force && quizOf(r) === "culture" && r.phase === "reveal" && r.deadline <= Date.now()) {
      this.advanceRound(r);
      r.revision++;
      changed = true;
    }
    if (r.manche === "clues" && r.phase === "question") {
      const count = Date.now() < r.starts_at ? 0 : r.deadline - Date.now() > 20000 ? 1 : r.deadline - Date.now() > 10000 ? 2 : 3;
      if (count !== (r.cluesShown || 0)) { r.cluesShown = count; changed = true; }
    }
    if (!force && quizOf(r) === "pokemon" && (r.manche ?? "cards") === "cards" && r.round === 6 && r.phase === "reveal") {
      this.beginClues(r); changed = true;
    }
    if (!force && quizOf(r) === "pokemon" && r.manche === "clues" && r.round === PRICE_START - 1 && r.phase === "reveal") {
      this.beginPrice(r); changed = true;
    }
    if (changed) this.put("room", r.id, r);
    return changed;
  }
  beginClues(r) {
    r.manche = "clues";
    r.clueOrder = quiz.clues.map((_, i) => i);
    for (let i = r.clueOrder.length - 1; i > 0; i--) {
      const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
      [r.clueOrder[i], r.clueOrder[j]] = [r.clueOrder[j], r.clueOrder[i]];
    }
    r.clueOrder = r.clueOrder.slice(0, 6);
    r.round = 7; r.settled = 6; r.answers = {}; r.cluesShown = 0;
    r.phase = "question"; r.starts_at = Date.now() + 5000;
    r.deadline = r.starts_at + 30000; r.remaining_ms = 30000; r.revision++;
  }
  beginPrice(r) {
    r.priceOrder ??= selectPriceCards(quiz.priceCards);
    r.manche = "price";
    r.round = PRICE_START;
    r.settled = PRICE_START - 1;
    r.answers = {};
    r.phase = "question";
    r.starts_at = Date.now() + 5000;
    r.remaining_ms = roundDuration(r);
    r.deadline = r.starts_at + r.remaining_ms;
    r.revision++;
  }
  question(r) {
    if (isChronology(r)) return r.chronologyOrder[r.round - 1];
    if (quizOf(r) === "culture") return populationsFor(r).pairs[r.order[r.round - 1]];
    return r.manche === "clues" ? quiz.clues[r.clueOrder[r.round - 7]] : quiz.cards[r.order[r.round - 1]];
  }
  snapshot(s, r) {
    if (!this.readable(s, r)) fail("Stanza non accessibile");
    const connected = this.connectedPlayers(r);
    const players = Object.values(r.players)
      .map((p) => ({ ...p, connected: connected.has(p.user_id) }))
      .sort(
        (a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname),
      );
    players.forEach(
      (p, i) =>
        (p.rank =
          i && players[i - 1].score === p.score ? players[i - 1].rank : i + 1),
    );
    const remaining = r.phase === "paused" ? r.remaining_ms : Math.max(0, Math.min(roundDuration(r), r.deadline - Date.now()));
    const revealed = ["reveal", "finished"].includes(r.phase) || (r.manche === "clues" && r.answers[s.id]?.result === "correct");
    const cultureRevealed = ["reveal", "finished"].includes(r.phase) || (r.phase === "paused" && r.paused_from === "reveal");
    const price = r.manche === "price";
    const question = r.round && !price ? this.question(r) : null;
    const population = cultureStage(r)?.id === "population" && question;
    const chronology = isChronology(r) && question;
    const participants = chronology && new Set([
      ...this.chronologyParticipants(r, connected),
      ...Object.keys(r.answers).filter(id => r.answers[id].done),
    ]).size;
    return {
      clues: r.manche === "clues" && Date.now() >= r.starts_at ? question.clues.slice(0, ["reveal", "finished"].includes(r.phase) ? 3 : remaining > 20000 ? 1 : remaining > 10000 ? 2 : 3) : [],
      solution_image: revealed && r.manche === "clues" ? question.image : null,
      room: this.publicRoom(r),
      server_now: Date.now(),
      remaining_ms: remaining,
      ...(price ? { duration_ms: PRICE_DURATION, price: priceSnapshot(r, revealed) } : population || chronology ? { duration_ms: roundDuration(r) } : {}),
      ...(chronology ? {
        chronology: {
          category: chronology.category,
          total: CHRONOLOGY_ROUNDS,
          items: cultureRevealed ? chronology.items : chronology.items.map(({ id, name }) => ({ id, name })),
          ...(cultureRevealed ? { correct: correctChronology(chronology.items) } : {}),
          participants,
        },
      } : {}),
      ...(population
        ? {
            population: {
              year: populationsFor(r).year,
              countries: question.map(({ id, iso2, name }) => ({ id, iso2, name })),
              ...(cultureRevealed
                ? {
                    values: question.map(({ population: value }) => value),
                    correct: question.reduce((a, b) => a.population > b.population ? a : b).id,
                  }
                : {}),
            },
          }
        : {}),
      players,
      me: r.players[s.id]
        ? {
            ...r.players[s.id],
            attempts: r.answers[s.id]?.attempts || 0,
            done: r.answers[s.id]?.done || false,
            result: r.answers[s.id]?.result,
            points: !chronology || cultureRevealed ? r.answers[s.id]?.points || 0 : 0,
            ...(price ? {
              choice: r.answers[s.id]?.choice || null,
              streak: r.players[s.id].streak || 0,
              bonus: r.answers[s.id]?.bonus || 0,
            } : population || chronology ? { choice: r.answers[s.id]?.choice || null } : {}),
          }
        : null,
      can_control: this.control(s, r),
      received: Object.values(r.answers).filter((a) => a.done).length,
      solution:
        revealed && question && quizOf(r) !== "culture"
          ? question.name
          : null,
    };
  }
  async broadcast(room) {
    const sockets = this.ctx.getWebSockets(room);
    const keys = await Promise.all(sockets.map(ws => this.sessionKey(ws.deserializeAttachment()?.session)));
    const r = this.get("room", room);
    if (!r) return;
    for (const [i, ws] of sockets.entries()) {
      const s = this.session(keys[i]);
      try {
        if (this.readable(s, r)) ws.send(JSON.stringify(this.snapshot(s, r)));
        else ws.close(1008, "Sessione o accesso non valido");
      } catch {
        console.warn("Goku: invio WebSocket non riuscito");
      }
    }
  }
  async schedule() {
    const deadlines = this.all("room")
      .filter((r) => r.phase === "question" || (quizOf(r) === "culture" && r.phase === "reveal"))
      .map((r) => r.phase === "question" && r.manche === "clues" ? [r.starts_at, r.deadline - 20000, r.deadline - 10000, r.deadline].find(time => time > Date.now()) || r.deadline : r.deadline);
    const next = deadlines.length ? Math.min(...deadlines) : null;
    if ((await this.ctx.storage.getAlarm()) !== next) {
      if (next) await this.ctx.storage.setAlarm(next);
      else await this.ctx.storage.deleteAlarm();
    }
  }
  async fetch(request) {
    return this.ctx.blockConcurrencyWhile(async () => {
      try {
        if (new URL(request.url).pathname === "/socket") {
          const key = request.headers.get("X-Session"),
            s = this.session(await this.sessionKey(key)),
            id = new URL(request.url).searchParams.get("room"),
            r = this.get("room", id);
          if (!this.readable(s, r)) fail("Stanza non accessibile");
          if (this.ctx.getWebSockets().length >= 500)
            fail("Troppe connessioni", 429);
          const pair = new WebSocketPair();
          this.ctx.acceptWebSocket(pair[1], [id]);
          pair[1].serializeAttachment({ session: key, user: s.id, room: id });
          if (r.polling?.[s.id]) {
            delete r.polling[s.id];
            this.put("room", r.id, r);
          }
          this.settle(r);
          await this.broadcast(id);
          await this.schedule();
          return new Response(null, { status: 101, webSocket: pair[0] });
        }
        const { action, payload, auth } = await request.json();
        this.pruneTemporaryRecords(Date.now());
        auth.session = await this.sessionKey(auth.session);
        if (action === "login" && auth.passwordOK) auth.newHash = await this.adminSessionKey(auth.newHash);
        this.changed = new Set();
        // Expired questions settle before authorization/commands, even after alarm delay.
        for (const r of this.all("room"))
          if (this.settle(r)) this.changed.add(r.id);
        let data,
          status = 200;
        try {
          data = this.ctx.storage.transactionSync(() =>
            this.dispatch(action, payload, auth),
          );
        } catch (e) {
          if (!e.status) return unavailable();
          data = { error: e.message };
          status = e.status;
        }
        for (const id of this.changed) await this.broadcast(id);
        await this.schedule();
        return json(data, status);
      } catch (e) {
        return e.status ? json({ error: e.message }, e.status) : unavailable();
      }
    });
  }
  dispatch(action, p, a) {
    const now = Date.now(),
      s = this.session(a.session),
      admin = s?.role === "admin";
    const requireAdmin = () => {
      if (!admin) fail("Solo Admin");
    };
    const newSession = (role, license = null) => {
      const session = {
        id: crypto.randomUUID(),
        role,
        license,
        expires: now + 365 * DAY,
      };
      this.put("session", a.newHash, session);
      return session;
    };
    if (action === "login") {
      const rate = this.get("rate", a.ip) || { count: 0, until: 0 };
      if (rate.until > now && rate.count >= 5)
        fail("Troppi tentativi. Riprova tra 15 minuti.", 429);
      if (!a.passwordOK) {
        if (rate.until <= now) {
          rate.count = 0;
          rate.until = now + 15 * 60000;
        }
        rate.count++;
        this.put("rate", a.ip, rate);
        return { error: "Password errata" };
      }
      this.del("rate", a.ip);
      if (a.session) this.del("session", a.session);
      newSession("admin");
      return { setSession: true };
    }
    if (action === "logout") {
      this.del("session", a.session);
      for (const r of this.all("room")) this.changed.add(r.id);
      return { clearSession: true };
    }
    if (action === "identity") {
      if (s) return { id: s.id, role: s.role };
      const player = newSession("player");
      return { id: player.id, role: player.role, setSession: true };
    }
    if (action === "redeem") {
      const l = this.all("license").find((l) => l.token_hash === a.tokenHash);
      if (!l) fail("Invito non valido");
      if (l.revoked) fail("Invito revocato");
      if (l.expires <= now) fail("Invito scaduto");
      if (l.redeemed) fail("Invito già riscattato");
      const host = newSession("host", l.id);
      l.redeemed = host.id;
      this.put("license", l.id, l);
      return { setSession: true };
    }
    if (!s) fail("Autenticazione necessaria", 401);
    if (action === "license_create") {
      requireAdmin();
      const hours = Number(p.hours),
        quota = Number(p.max_rooms);
      if (
        !Number.isFinite(hours) ||
        hours <= 0 ||
        hours > 8760 ||
        !Number.isInteger(quota) ||
        quota < 1 ||
        quota > 10000
      )
        fail("Durata o quota non valida", 400);
      if (p.name !== undefined && (typeof p.name !== "string" || p.name.trim().length > 80))
        fail("Nome della licenza non valido (massimo 80 caratteri)", 400);
      const quizzes = p.quizzes ?? ["pokemon"];
      if (!Array.isArray(quizzes) || !quizzes.length || quizzes.some(q => !["pokemon", "culture"].includes(q)) || new Set(quizzes).size !== quizzes.length)
        fail("Seleziona almeno un quiz valido", 400);
      const l = {
        name: (p.name || "").trim(),
        id: crypto.randomUUID(),
        token_hash: a.inviteHash,
        expires: now + hours * 3600000,
        created: now,
        max_rooms: quota,
        quizzes,
        used_rooms: 0,
        revoked: false,
        redeemed: null,
      };
      this.put("license", l.id, l);
      return { id: l.id, invite: true };
    }
    if (action === "license_revoke") {
      requireAdmin();
      const l = this.get("license", p.license_id);
      if (!l) fail("Licenza inesistente", 404);
      l.revoked = true;
      this.put("license", l.id, l);
      for (const r of this.all("room"))
        if (r.license_id === l.id) this.changed.add(r.id);
      return { ok: true };
    }
    if (action === "dashboard") {
      if (s.role === "player") fail("Solo Admin o Host");
      return {
        admin,
        licenses: this.all("license")
          .filter((l) => admin || l.id === s.license)
          .map((l) => ({
            id: l.id,
            name: l.name || "",
            starts_at: l.created,
            expires_at: l.expires,
            max_rooms: l.max_rooms,
            used_rooms: l.used_rooms,
            quizzes: l.quizzes || ["pokemon"],
            redeemed: !!l.redeemed,
            status: l.revoked
              ? "revocato"
              : l.expires <= now
                ? "scaduto"
                : l.redeemed
                  ? "attivo"
                  : "disponibile",
          })),
        rooms: this.all("room")
          .filter((r) => admin || r.host_id === s.id)
          .map((r) => this.publicRoom(r)),
      };
    }
    if (action === "create") {
      const selectedQuiz = p.quiz ?? "pokemon";
      if (!["pokemon", "culture"].includes(selectedQuiz)) fail("Quiz non valido", 400);
      const license = admin ? null : this.license(s);
      if (!admin && !(license?.quizzes || ["pokemon"]).includes(selectedQuiz)) fail("Quiz non incluso nella licenza");
      if (!admin) {
        const l = license;
        if (s.role !== "host" || !l || l.revoked || l.expires <= now)
          fail("Licenza assente, scaduta o revocata");
        if (l.used_rooms >= l.max_rooms) fail("Quota esaurita");
        l.used_rooms++;
        this.put("license", l.id, l);
      }
      const existing = new Set(this.all("room").map((r) => r.code));
      let code;
      for (let i = 0; i < 50; i++) {
        code = String(
          100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000),
        );
        if (!existing.has(code)) break;
        code = null;
      }
      if (!code) fail("PIN esauriti");
      const order = (selectedQuiz === "culture" ? populations.pairs : quiz.cards).map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
        [order[i], order[j]] = [order[j], order[i]];
      }
      const r = {
        id: crypto.randomUUID(),
        code,
        host_id: s.id,
        license_id: admin ? null : s.license,
        quiz: selectedQuiz,
        phase: "lobby",
        round: 0,
        manche: selectedQuiz === "culture" ? 1 : "cards",
        revision: 0,
        starts_at: null,
        deadline: null,
        remaining_ms: 30000,
        settled: 0,
        players: {},
        answers: {},
        order,
        ...(selectedQuiz === "culture" ? { population_year: populations.year, chronologyOrder: drawChronology() } : {}),
        ...(selectedQuiz === "pokemon" ? { priceOrder: selectPriceCards(quiz.priceCards) } : {}),
      };
      this.put("room", r.id, r);
      return { id: r.id, code };
    }
    if (action === "join") {
      const r = this.all("room").find((r) => r.code === p.code);
      if (!r) fail("Stanza inesistente", 404);
      if (r.players[s.id]) return { id: r.id };
      if (r.phase === "finished") fail("Partita terminata");
      if (Object.keys(r.players).length >= 100) fail("Stanza piena");
      const nickname = String(p.nickname || "")
        .trim()
        .replace(/\s+/g, " ");
      if (!/^[\p{L}\p{N} _.-]{1,24}$/u.test(nickname))
        fail("Nickname non valido");
      if (
        Object.values(r.players).some(
          (x) => x.nickname.toLowerCase() === nickname.toLowerCase(),
        )
      )
        fail("Nickname già utilizzato");
      r.players[s.id] = { user_id: s.id, nickname, score: 0 };
      this.recordPoll(r, s.id, now);
      r.revision++;
      this.put("room", r.id, r);
      this.changed.add(r.id);
      return { id: r.id };
    }
    const r = this.get("room", p.room_id);
    if (!this.readable(s, r)) fail("Stanza non accessibile");
    if (action === "state") {
      if (this.recordPoll(r, s.id, now)) this.put("room", r.id, r);
      return this.snapshot(s, r);
    }
    if (action === "card") {
      if (!this.control(s, r) || quizOf(r) !== "pokemon" || !r.round || ["clues", "price"].includes(r.manche))
        fail("Solo il conduttore può vedere la carta");
      return { asset: quiz.cards[r.order[r.round - 1]].opaque };
    }
    if (action === "answer") {
      if (!r.players[s.id]) fail("Solo giocatori");
      if (p.round !== r.round || (isChronology(r) && p.manche !== r.manche)) fail("Domanda non più attuale");
      const answer = r.answers[s.id] || {
        attempts: 0,
        done: false,
        points: 0,
        requests: {},
      };
      if (
        typeof p.request_id !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(p.request_id)
      )
        fail("Identificativo richiesta necessario");
      if (answer.requests[p.request_id]) return answer.requests[p.request_id];
      if (r.phase !== "question" || now < r.starts_at || now >= r.deadline)
        fail("Risposte chiuse o timer in pausa");
      if (answer.done) fail("Hai già completato questa domanda");
      if (r.manche === "price") {
        if (!["higher", "lower"].includes(p.answer)) fail("Scegli HIGHER o LOWER");
        const result = { done: true, choice: p.answer };
        r.answers[s.id] = {
          ...result, requests: { [p.request_id]: result },
        };
        r.revision++;
        this.settle(r);
        this.put("room", r.id, r);
        this.changed.add(r.id);
        return result;
      }
      if (isChronology(r)) {
        const items = this.question(r).items;
        if (!Array.isArray(p.answer) || p.answer.length !== items.length ||
            new Set(p.answer).size !== items.length ||
            !items.every(({ id }) => p.answer.includes(id))) fail("Ordina tutti e quattro gli elementi");
        const points = correctChronology(items).reduce((sum, id, index) => sum + (p.answer[index] === id ? 30 : 0), 0);
        const result = { done: true, choice: p.answer };
        r.answers[s.id] = { ...result, points, requests: { [p.request_id]: result } };
        this.recordPoll(r, s.id, now);
        r.revision++;
        this.settle(r);
        this.put("room", r.id, r);
        this.changed.add(r.id);
        return result;
      }
      if (quizOf(r) === "culture") {
        if (!cultureStage(r)) fail("Manche non disponibile");
        const [first, second] = this.question(r);
        const correct = second.population > first.population ? second : first;
        if (![first.id, second.id].includes(p.answer)) fail("Scegli una nazione");
        const result = { done: true, result: p.answer === correct.id ? "correct" : "wrong", choice: p.answer, points: p.answer === correct.id ? Math.ceil(Math.min(15000, r.deadline - now) / 1000) * 10 : 0 };
        r.answers[s.id] = { ...result, requests: { [p.request_id]: result } };
        r.revision++;
        this.settle(r);
        this.put("room", r.id, r);
        this.changed.add(r.id);
        return result;
      }
      if (
        typeof p.answer !== "string" ||
        p.answer.length < 1 ||
        p.answer.length > 80
      )
        fail("Inserisci un nome (massimo 80 caratteri)");
      if (answer.last && now - answer.last < 250)
        fail("Attendi prima di riprovare", 429);
      answer.last = now;
      const resolved = resolveName(p.answer);
      let result;
      if (!resolved) result = { result: "invalid" };
      else {
        if (resolved === normalize(this.question(r).canonical || this.question(r).name)) {
          answer.done = true;
          answer.points =
            Math.ceil(Math.min(30000, r.deadline - now) / 1000) * 10;
          answer.result = "correct";
        } else {
          answer.attempts++;
          answer.done = answer.attempts >= 3;
          answer.result = "wrong";
        }
        result = {
          result: answer.result,
          points: answer.points,
          attempts: answer.attempts,
          done: answer.done,
        };
      }
      // Bound idempotency storage even for unlimited invalid names.
      const keys = Object.keys(answer.requests);
      if (keys.length >= 20) delete answer.requests[keys[0]];
      answer.requests[p.request_id] = result;
      r.answers[s.id] = answer;
      r.revision++;
      this.settle(r);
      this.put("room", r.id, r);
      this.changed.add(r.id);
      return result;
    }
    if (action === "command") {
      if (!this.control(s, r))
        fail("Privilegi Host assenti, scaduti o revocati");
      if (p.revision !== r.revision) fail("Stato cambiato: riprova");
      const c = p.command;
      if (["start", "next"].includes(c) && quizOf(r) === "culture" && !cultureStage(r)) fail("Manche non disponibile");
      if (
        ["question", "paused", "reveal"].includes(r.phase) &&
        (quizOf(r) === "pokemon" && ((c === "skip_to_clues" && r.round >= 1 && r.round < 7)
          || (c === "skip_to_price" && r.manche === "clues")))
      ) {
        this.settle(r, true);
        if (c === "skip_to_clues") this.beginClues(r);
        else this.beginPrice(r);
      } else if (
        (c === "start" && r.phase === "lobby") ||
        (c === "next" && r.phase === "reveal" && !isChronology(r))
      ) {
        if (!Object.keys(r.players).length) fail("Attendi un giocatore");
        this.advanceRound(r, now);
      } else if (
        c === "pause" &&
        ((r.phase === "question" && now >= r.starts_at) || (quizOf(r) === "culture" && r.phase === "reveal" && now < r.deadline))
      ) {
        r.remaining_ms = Math.max(0, r.deadline - now);
        if (quizOf(r) === "culture") r.paused_from = r.phase;
        r.phase = "paused";
      } else if (c === "resume" && r.phase === "paused") {
        r.phase = r.paused_from || "question";
        r.deadline = now + r.remaining_ms;
        delete r.paused_from;
      } else if (c === "end" && r.phase !== "finished") {
        this.settle(r, true);
        r.phase = "finished";
      } else fail("Comando non disponibile");
      r.revision++;
      this.put("room", r.id, r);
      this.changed.add(r.id);
      return { ok: true };
    }
    fail("Operazione non disponibile", 400);
  }
  async alarm() {
    return this.ctx.blockConcurrencyWhile(async () => {
      for (const r of this.all("room")) {
        const changed = this.settle(r);
        if (changed) await this.broadcast(r.id);
      }
      await this.schedule();
    });
  }
  webSocketMessage(ws) {
    ws.close(1008, "Usa le API per le operazioni");
  }
  async webSocketClose(ws) {
    const { room } = ws.deserializeAttachment();
    ws.close(1000);
    await this.handleDisconnect(room);
  }
  async webSocketError(ws) {
    const { room } = ws.deserializeAttachment();
    ws.close(1011, "Riconnetti");
    await this.handleDisconnect(room);
  }
  async handleDisconnect(room) {
    await this.ctx.blockConcurrencyWhile(async () => {
      const r = this.get("room", room);
      const changed = r && isChronology(r) && this.settle(r);
      await this.broadcast(room);
      if (changed) await this.schedule();
    });
  }
}

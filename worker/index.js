import quiz from "./generated/quiz.json";
import populations from "../data/population-comparisons.json";
import legacyPopulations from "../data/population-comparisons-2019.json";
import { drawPopulationPairs, populationCountry, populationYear } from "./population.js";
import { CHRONOLOGY_ROUNDS, correctChronology, drawChronology } from "./chronology.js";
import {
  VAULT_DURATION, VAULT_NEXT, VAULT_REVEAL, VAULT_ROUNDS, VAULT_SOLUTION_AT,
  drawVault, publicVault, settleVault, validGuess, vaultIntro, vaultQuestion,
} from "./number-vault.js";
import {
  PRICE_START, PRICE_ROUNDS, PRICE_DURATION,
  selectPriceCards, settlePrice, priceSnapshot,
} from "./pokeprice.js";
import { MEADOW_POINTS, MEADOW_ROUNDS, drawMeadow, meadowPoints } from "./meadow.js";
const quizOf = r => r.quiz || "pokemon";
const cultureStages = [
  { id: "population", count: populations.pairs.length, duration: 15000 },
  { id: "chronology", count: CHRONOLOGY_ROUNDS, duration: 30000 },
  { id: "vault", count: VAULT_ROUNDS, duration: VAULT_DURATION },
  { id: "meadow", count: MEADOW_ROUNDS, duration: 30000 },
];
const cultureStage = r => quizOf(r) === "culture" ? cultureStages[(r.manche || 1) - 1] : null;
const isVault = r => cultureStage(r)?.id === "vault";
const isChronology = r => cultureStage(r)?.id === "chronology";
const isMeadow = r => cultureStage(r)?.id === "meadow";
// Cronologia e Prato fiorito chiudono il round quando rispondono i giocatori presenti.
const isTimeline = r => isChronology(r) || isMeadow(r);
const MEADOW_INTRO = 3000;
const MEADOW_REVEAL = 15000;
const CHRONOLOGY_POINTS = 50;
const CHRONOLOGY_CARD_INTERVAL = 2000;
const CHRONOLOGY_INTRO = 3000 + 3 * CHRONOLOGY_CARD_INTERVAL;
// The first round of Popolazione and Cronologia opens with a 3 s title card.
const MANCHE_OPENING = 3000;
const openingMs = r => r.round === 1 && (cultureStage(r)?.id === "population" || isChronology(r)) ? MANCHE_OPENING : 0;
// The solution stays on screen until the host presses "Avanti"; the ranking then lasts 10 s.
const CHRONOLOGY_RANKING = 10000;
const chronologyPoints = r => r.chronology_points ?? 30;
// Rooms revealed before the "Avanti" button have no view and keep their timed reveal.
const chronologyView = r => r.chronology_view ?? "ranking";
export function addPoints(r, id, points) {
  const player = r.players[id];
  player.score += points;
  if (quizOf(r) === "culture") {
    player.manche_scores ??= {};
    player.manche_scores[r.manche] = (player.manche_scores[r.manche] || 0) + points;
  }
}
// The client's reconnect backoff refreshes via HTTP at least every 15.3 seconds.
const POLL_PRESENCE_MS = 20000;
// Rooms created before random matches keep their fixed pairs (2025, or 2019 without population_year).
const populationsFor = r => r.population_pairs
  ? { year: r.population_year, pairs: r.population_pairs.map(pair => pair.map(populationCountry)) }
  : (r.population_year || legacyPopulations.year) === populations.year ? populations : legacyPopulations;
const roundDuration = r => cultureStage(r)?.duration ?? (quizOf(r) === "culture" ? 0 : r.manche === "price" ? PRICE_DURATION : 30000);
const rounds = r => quizOf(r) === "culture" ? cultureStage(r)?.count ?? 0 : PRICE_START + PRICE_ROUNDS - 1;
function rankings(r, connected, extra = () => ({})) {
  const players = Object.values(r.players)
    .map(p => ({ ...p, connected: connected.has(p.user_id), ...extra(p) }))
    .sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname));
  players.forEach((p, i) => {
    p.rank = i && players[i - 1].score === p.score ? players[i - 1].rank : i + 1;
  });
  return players;
}
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
    const { players, answers, order, population_pairs, clueOrder, priceOrder, chronologyOrder, chronology_points, vaultOrder, meadowOrder, vaultResult, polling, settled, ...publicData } = r;
    publicData.quiz ||= "pokemon";
    publicData.manche ||= publicData.quiz === "culture" ? 1 : "cards";
    if (publicData.quiz === "culture") publicData.manche_total = meadowOrder ? cultureStages.length : vaultOrder ? 3 : 2;
    return publicData;
  }
  advanceRound(r, now = Date.now()) {
    if (quizOf(r) === "pokemon") {
      if ((r.manche ?? "cards") === "cards" && r.round === 6) return this.beginClues(r);
      if (r.manche === "clues" && r.round === PRICE_START - 1) return this.beginPrice(r);
    }
    if (r.round === rounds(r)) {
      if (cultureStage(r)?.id === "population") {
        r.manche = 2;
        r.chronologyOrder ??= drawChronology();
      } else if (isChronology(r) && r.vaultOrder) {
        r.manche = 3;
      } else if (isVault(r) && r.meadowOrder) {
        r.manche = 4;
      } else {
        r.phase = "finished";
        return;
      }
      r.round = r.settled = 0;
    }
    r.round++;
    r.phase = "question";
    delete r.chronology_view;
    if (isChronology(r)) r.chronology_points = CHRONOLOGY_POINTS;
    if (isVault(r)) delete r.vaultResult;
    r.starts_at = now + openingMs(r) + (isVault(r) ? vaultIntro(r.round) : isChronology(r) ? CHRONOLOGY_INTRO : isMeadow(r) ? MEADOW_INTRO : r.manche === "price" ? 0 : 2000);
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
  settle(r, force = false, now = Date.now()) {
    let changed = false;
    const complete = () => {
      const ids = isTimeline(r) ? this.chronologyParticipants(r) : Object.keys(r.players);
      return ids.length > 0 && ids.every(id => r.answers[id]?.done);
    };
    const allAnswered = r.phase === "question" && now >= r.starts_at && now < r.deadline && complete();
    if (r.phase === "question" && (r.deadline <= now || allAnswered)) {
      if (quizOf(r) === "culture") {
        if (isChronology(r)) {
          r.chronology_view = "solution";
          r.remaining_ms = 0;
          r.deadline = null;
        } else {
          r.remaining_ms = isVault(r) ? VAULT_REVEAL - (allAnswered ? VAULT_SOLUTION_AT : 0) : isMeadow(r) ? MEADOW_REVEAL : 10000;
          r.deadline = now + r.remaining_ms;
        }
      } else r.deadline = Math.min(r.deadline, now);
      r.phase = "reveal";
      r.revision++;
      changed = true;
    }
    if (
      (force || ["reveal", "finished"].includes(r.phase)) &&
      r.settled < r.round
    ) {
      if (isVault(r)) settleVault(r, this.question(r), allAnswered, addPoints);
      else if (r.manche === "price") settlePrice(r);
      else for (const [id, a] of Object.entries(r.answers))
        addPoints(r, id, a.points || 0);
      r.settled = r.round;
      changed = true;
    }
    if (!force && quizOf(r) === "culture" && r.phase === "reveal" && r.deadline !== null && r.deadline <= now) {
      this.advanceRound(r, now);
      r.revision++;
      changed = true;
    }
    if (r.manche === "clues" && r.phase === "question") {
      const count = Date.now() < r.starts_at ? 0 : r.deadline - Date.now() > 20000 ? 1 : r.deadline - Date.now() > 10000 ? 2 : 3;
      if (count !== (r.cluesShown || 0)) { r.cluesShown = count; changed = true; }
    }
    if (!force && quizOf(r) === "pokemon" && (r.manche ?? "cards") === "cards" && r.round === 6 && r.phase === "reveal") {
      this.advanceRound(r, now); changed = true;
    }
    if (!force && quizOf(r) === "pokemon" && r.manche === "clues" && r.round === PRICE_START - 1 && r.phase === "reveal") {
      this.advanceRound(r, now); changed = true;
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
    if (isVault(r)) return vaultQuestion(r.vaultOrder[r.round - 1]);
    if (isChronology(r)) return r.chronologyOrder[r.round - 1];
    if (isMeadow(r)) return r.meadowOrder[r.round - 1];
    if (quizOf(r) === "culture") return r.population_pairs ? populationsFor(r).pairs[r.round - 1] : populationsFor(r).pairs[r.order[r.round - 1]];
    return r.manche === "clues" ? quiz.clues[r.clueOrder[r.round - 7]] : quiz.cards[r.order[r.round - 1]];
  }
  vaultShared(r) {
    const connected = this.connectedPlayers(r);
    const server_now = Date.now();
    const duration_ms = r.vaultResult ? VAULT_REVEAL : VAULT_DURATION;
    return {
      room: this.publicRoom(r),
      server_now,
      duration_ms,
      remaining_ms: r.phase === "paused" ? r.remaining_ms : Math.max(0, Math.min(duration_ms, r.deadline - server_now)),
      received: Object.keys(r.answers).length,
      active: this.chronologyParticipants(r, connected).length,
      vault: publicVault(this.question(r), r.round),
      players: r.vaultResult || r.phase === "finished" ? rankings(r, connected) : [],
    };
  }
  snapshot(s, r, shared) {
    if (!this.readable(s, r)) fail("Stanza non accessibile");
    if (isVault(r)) {
      const common = shared ?? this.vaultShared(r);
      const answer = r.answers[s.id];
      const can_control = this.control(s, r);
      const { distribution, podium, ...solution } = r.vaultResult ?? {};
      const me = r.players[s.id];
      return {
        ...common, can_control,
        me: me ? {
          ...me, done: !!answer?.done, choice: answer?.choice ?? null,
          ...(r.vaultResult ? { points: answer?.points ?? 0, rank: answer?.rank ?? null } : {}),
        } : null,
        ...(r.vaultResult ? { vault_result: can_control ? { ...solution, distribution, podium } : solution } : {}),
      };
    }
    const connected = this.connectedPlayers(r);
    const cultureRevealed = ["reveal", "finished"].includes(r.phase) || (r.phase === "paused" && r.paused_from === "reveal");
    const chronologyRevealed = isTimeline(r) && cultureRevealed;
    const players = rankings(r, connected, p => chronologyRevealed ? { round_points: r.answers[p.user_id]?.points || 0 } : {});
    const remaining = r.phase === "paused" ? r.remaining_ms : Math.max(0, Math.min(roundDuration(r), r.deadline - Date.now()));
    const revealed = ["reveal", "finished"].includes(r.phase) || (r.manche === "clues" && r.answers[s.id]?.result === "correct");
    const price = r.manche === "price";
    const question = r.round && !price ? this.question(r) : null;
    const population = cultureStage(r)?.id === "population" && question;
    const chronology = isChronology(r) && question;
    const meadow = isMeadow(r) && question;
    const participants = (chronology || meadow) && new Set([
      ...this.chronologyParticipants(r, connected),
      ...Object.keys(r.answers).filter(id => r.answers[id].done),
    ]).size;
    return {
      clues: r.manche === "clues" && Date.now() >= r.starts_at ? question.clues.slice(0, ["reveal", "finished"].includes(r.phase) ? 3 : remaining > 20000 ? 1 : remaining > 10000 ? 2 : 3) : [],
      solution_image: revealed && r.manche === "clues" ? question.image : null,
      room: this.publicRoom(r),
      server_now: Date.now(),
      remaining_ms: remaining,
      ...(price ? { duration_ms: PRICE_DURATION, price: priceSnapshot(r, revealed) } : population || chronology || meadow ? { duration_ms: roundDuration(r) } : {}),
      ...(chronology ? {
        chronology: {
          category: chronology.category,
          total: CHRONOLOGY_ROUNDS,
          card_interval_ms: CHRONOLOGY_CARD_INTERVAL,
          opening_ms: openingMs(r),
          points_per_match: chronologyPoints(r),
          items: cultureRevealed ? chronology.items : chronology.items.map(({ id, name }) => ({ id, name })),
          ...(cultureRevealed ? { correct: correctChronology(chronology.items), view: chronologyView(r), ranking_ms: CHRONOLOGY_RANKING } : {}),
          participants,
        },
      } : {}),
      ...(meadow ? {
        meadow: {
          category: meadow.category,
          total: MEADOW_ROUNDS,
          points_per_safe: MEADOW_POINTS,
          options: meadow.items.map(({ id, name }) => ({ id, name })),
          ...(cultureRevealed ? { bomb: meadow.items.find(item => item.bomb).id, reveal_ms: MEADOW_REVEAL } : {}),
          participants,
        },
      } : {}),
      ...(population
        ? {
            population: {
              year: populationsFor(r).year,
              opening_ms: openingMs(r),
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
            points: !(chronology || meadow) || cultureRevealed ? r.answers[s.id]?.points || 0 : 0,
            ...(price ? {
              choice: r.answers[s.id]?.choice || null,
              streak: r.players[s.id].streak || 0,
              bonus: r.answers[s.id]?.bonus || 0,
            } : population || chronology || meadow ? { choice: r.answers[s.id]?.choice || null } : {}),
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
    const shared = isVault(r) ? this.vaultShared(r) : undefined;
    for (const [i, ws] of sockets.entries()) {
      const s = this.session(keys[i]);
      try {
        if (this.readable(s, r)) ws.send(JSON.stringify(this.snapshot(s, r, shared)));
        else ws.close(1008, "Sessione o accesso non valido");
      } catch {
        console.warn("Goku: invio WebSocket non riuscito");
      }
    }
  }
  async schedule() {
    const deadlines = this.all("room")
      .filter((r) => r.phase === "question" || (quizOf(r) === "culture" && r.phase === "reveal" && r.deadline !== null))
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
        const now = Date.now();
        for (const r of this.all("room"))
          if (this.settle(r, false, now)) this.changed.add(r.id);
        let data,
          status = 200;
        try {
          data = this.ctx.storage.transactionSync(() =>
            this.dispatch(action, payload, auth, now),
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
  dispatch(action, p, a, now = Date.now()) {
    const s = this.session(a.session),
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
      const vaultMode = p.vault_mode === undefined ? "demo" : p.vault_mode;
      if (selectedQuiz === "culture" && !["demo", "mixed"].includes(vaultMode)) fail("Modalità di stima non valida", 400);
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
      const order = quiz.cards.map((_, i) => i);
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
        ...(selectedQuiz === "culture" ? { population_year: populationYear, population_pairs: drawPopulationPairs(), chronologyOrder: drawChronology(), vaultOrder: drawVault(vaultMode), meadowOrder: drawMeadow() } : {}),
        ...(selectedQuiz === "pokemon" ? { order, priceOrder: selectPriceCards(quiz.priceCards) } : {}),
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
      const becameActive = isVault(r) && !(r.polling?.[s.id] > now - POLL_PRESENCE_MS);
      if (this.recordPoll(r, s.id, now)) {
        this.put("room", r.id, r);
        if (becameActive) this.changed.add(r.id);
      }
      return this.snapshot(s, r);
    }
    if (action === "card") {
      if (!this.control(s, r) || quizOf(r) !== "pokemon" || !r.round || ["clues", "price"].includes(r.manche))
        fail("Solo il conduttore può vedere la carta");
      return { asset: quiz.cards[r.order[r.round - 1]].opaque };
    }
    if (action === "answer") {
      if (!r.players[s.id]) fail("Solo giocatori");
      if (p.round !== r.round || ((isVault(r) || isTimeline(r) || p.manche === 3) && p.manche !== r.manche)) fail("Domanda non più attuale");
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
      if (isVault(r)) {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.request_id))
          fail("Identificativo richiesta non valido");
        if (!validGuess(p.answer)) fail("Inserisci un intero da 1 a 99.999.999", 400);
        const receipt = answer.requests[p.request_id];
        if (receipt) {
          if (receipt.choice !== p.answer) fail("La richiesta contiene una stima diversa");
          return receipt;
        }
        if (answer.done) fail("Risposta già bloccata");
        if (r.phase !== "question" || now < r.starts_at || now >= r.deadline) fail("Risposte chiuse o timer in pausa");
        const result = { done: true, choice: p.answer };
        r.answers[s.id] = { ...result, requests: { [p.request_id]: result } };
        this.recordPoll(r, s.id, now);
        if (!this.settle(r, false, now)) {
          r.revision++;
          this.put("room", r.id, r);
        }
        this.changed.add(r.id);
        return result;
      }
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
        const points = correctChronology(items).reduce((sum, id, index) =>
          sum + (p.answer[index] === id ? chronologyPoints(r) : 0), 0);
        const result = { done: true, choice: p.answer };
        r.answers[s.id] = { ...result, points, requests: { [p.request_id]: result } };
        this.recordPoll(r, s.id, now);
        r.revision++;
        this.settle(r);
        this.put("room", r.id, r);
        this.changed.add(r.id);
        return result;
      }
      if (isMeadow(r)) {
        const items = this.question(r).items;
        if (!Array.isArray(p.answer) || p.answer.length > items.length ||
            new Set(p.answer).size !== p.answer.length ||
            !p.answer.every(id => items.some(item => item.id === id))) fail("Selezione non valida");
        const result = { done: true, choice: p.answer };
        r.answers[s.id] = { ...result, points: meadowPoints(items, p.answer), requests: { [p.request_id]: result } };
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
      const c = p.command;
      if (c === "advance") {
        // "Avanti" names its Cronologia round: duplicate clicks or retries never skip a second phase.
        const target = p.manche === 2 && Number.isInteger(p.round) ? p.round : 0;
        if (!target || quizOf(r) !== "culture") fail("Comando non disponibile");
        if (isChronology(r) && r.round === target && r.phase === "reveal" && r.chronology_view === "solution") {
          r.chronology_view = "ranking";
          r.remaining_ms = CHRONOLOGY_RANKING;
          r.deadline = now + CHRONOLOGY_RANKING;
          r.revision++;
          this.put("room", r.id, r);
          this.changed.add(r.id);
          return { ok: true };
        }
        const done = r.phase === "finished" || r.manche > 2 ||
          (r.manche === 2 && (r.round > target || (r.round === target && r.chronology_view === "ranking")));
        if (done) return { ok: true, unchanged: true };
        fail("Comando non disponibile");
      }
      if (p.revision !== r.revision) fail("Stato cambiato: riprova");
      if (isVault(r) && ["next", "skip_round"].includes(c) &&
          (r.phase !== "reveal" || r.deadline - now > VAULT_REVEAL - VAULT_NEXT))
        fail("Attendi la fine della rivelazione");
      if (["start", "next"].includes(c) && quizOf(r) === "culture" && !cultureStage(r)) fail("Manche non disponibile");
      if (
        ["question", "paused", "reveal"].includes(r.phase) &&
        (quizOf(r) === "pokemon" && ((c === "skip_to_clues" && r.round >= 1 && r.round < 7)
          || (c === "skip_to_price" && r.manche === "clues")))
      ) {
        this.settle(r, true);
        if (c === "skip_to_clues") this.beginClues(r);
        else this.beginPrice(r);
      } else if (c === "skip_round" && ["question", "paused", "reveal"].includes(r.phase)) {
        this.settle(r, true);
        delete r.paused_from;
        this.advanceRound(r, now);
      } else if (
        (c === "start" && r.phase === "lobby") ||
        (c === "next" && r.phase === "reveal" && !isTimeline(r))
      ) {
        if (!Object.keys(r.players).length) fail("Attendi un giocatore");
        this.advanceRound(r, now);
      } else if (
        c === "pause" &&
        ((r.phase === "question" && (isVault(r) || isTimeline(r) || now >= r.starts_at)) || (quizOf(r) === "culture" && r.phase === "reveal" && now < r.deadline))
      ) {
        r.remaining_ms = Math.max(0, r.deadline - now);
        if (quizOf(r) === "culture") r.paused_from = r.phase;
        r.phase = "paused";
      } else if (c === "resume" && r.phase === "paused") {
        r.phase = r.paused_from || "question";
        r.deadline = now + r.remaining_ms;
        if (r.phase === "question" && (isVault(r) || (isTimeline(r) && r.remaining_ms > roundDuration(r)))) {
          r.starts_at = r.deadline - roundDuration(r);
        }
        delete r.paused_from;
      } else if (c === "end" && r.phase !== "finished") {
        if (isVault(r) && !r.vaultResult) {
          r.answers = {};
          r.settled = r.round;
        } else this.settle(r, true);
        r.phase = "finished";
        if (isVault(r)) delete r.paused_from;
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
      const changed = r && isTimeline(r) && this.settle(r);
      await this.broadcast(room);
      if (changed) await this.schedule();
    });
  }
}

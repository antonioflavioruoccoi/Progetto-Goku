// Manche 5 di Cultura generale: "Puzzle". L'immagine si scopre un pezzo ogni 3 secondi.
// app.js chiama window.goPuzzle (a ogni aggiornamento dello stato) e window.goPuzzleTick (10 volte al secondo).
const el = (id) => document.getElementById(id);
const stage = el("puzzle-stage");
const board = el("puzzle-board");
const tilesBox = el("puzzle-tiles");
const image = el("puzzle-image");
const form = el("puzzle-form");
const input = el("puzzle-input");
const setText = (node, value) => { if (node.textContent !== value) node.textContent = value; };
const calm = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const vibrate = (pattern) => { try { navigator.vibrate?.(pattern); } catch {} };

let state = null, api = null, roundKey = "", tiles = [], opened = 0, sending = false, celebrated = "", lastFeedback = "";

function setupRound(s) {
  const p = s.puzzle;
  roundKey = `${s.room.id}/${s.room.round}`;
  image.src = "/" + p.image;
  board.style.setProperty("--ratio", p.ratio);
  tilesBox.style.gridTemplate = `repeat(${p.rows}, 1fr) / repeat(${p.cols}, 1fr)`;
  tiles = Array.from({ length: p.rows * p.cols }, (_, i) => {
    const tile = document.createElement("span");
    tile.style.setProperty("--spin", `${((i * 47) % 23) - 11}deg`);
    tile.style.setProperty("--wait", `${((i * 31) % 17) * 22}ms`);
    return tile;
  });
  tilesBox.replaceChildren(...tiles);
  opened = 0;
  input.value = "";
  lastFeedback = "";
  setText(el("puzzle-feedback"), "");
  el("puzzle-burst").replaceChildren();
  stage.removeAttribute("data-solved");
}

function openTiles(count, all) {
  const order = state.puzzle.order;
  if (all) {
    tiles.forEach((tile) => tile.setAttribute("data-open", "all"));
    opened = order.length;
    return;
  }
  if (count === opened) return;
  tiles.forEach((tile, i) => {
    const step = order.indexOf(i);
    if (step >= 0 && step < count) tile.setAttribute("data-open", "");
    else tile.removeAttribute("data-open");
  });
  if (count > opened && opened > 0 && !calm()) {
    const fresh = tiles[order[count - 1]];
    fresh.classList.remove("puzzle-pop");
    void fresh.offsetWidth;
    fresh.classList.add("puzzle-pop");
  }
  opened = count;
}

function celebrate(points, first) {
  stage.setAttribute("data-solved", "");
  vibrate(first ? [40, 50, 40, 50, 160] : [40, 60, 120]);
  const burst = el("puzzle-burst");
  const label = document.createElement("strong");
  label.className = "puzzle-points";
  label.textContent = `+${points}`;
  const pieces = calm() ? [] : Array.from({ length: 26 }, (_, i) => {
    const piece = document.createElement("i");
    piece.style.setProperty("--a", `${Math.round((360 / 26) * i + Math.random() * 10)}deg`);
    piece.style.setProperty("--d", `${Math.round(90 + Math.random() * 90)}px`);
    piece.style.setProperty("--c", ["#e8cb77", "#52cc8d", "#f1f5ff", "#ef7474"][i % 4]);
    return piece;
  });
  burst.replaceChildren(label, ...pieces);
  if (first) {
    const badge = document.createElement("span");
    badge.className = "puzzle-badge";
    badge.textContent = "Occhio di falco!";
    burst.append(badge);
  }
}

function feedback(text, tone = "") {
  const node = el("puzzle-feedback");
  node.dataset.tone = tone;
  setText(node, text);
}

window.goPuzzle = (s, host, tools) => {
  state = s;
  api = tools;
  const p = s.puzzle, room = s.room, me = s.me;
  if (`${room.id}/${room.round}` !== roundKey) setupRound(s);
  const revealed = p.answer !== undefined;
  const asking = ["question", "paused"].includes(room.phase) && !revealed;
  stage.dataset.phase = revealed ? "reveal" : "question";
  stage.toggleAttribute("data-paused", room.phase === "paused");
  setText(el("puzzle-round"), `${room.round}/${p.total}`);

  const player = !host && !!me;
  form.hidden = !player || !asking || !!me.done;
  const tries = el("puzzle-tries");
  tries.hidden = !player || revealed || me.result === "correct";
  [...tries.children].forEach((dot, i) => dot.toggleAttribute("data-used", i < (me?.attempts || 0)));
  tries.setAttribute("aria-label", `Tentativi rimasti: ${p.attempts - (me?.attempts || 0)} di ${p.attempts}`);

  if (player) {
    const mine = `${roundKey}:${me.result}:${me.attempts}`;
    if (me.result === "correct") {
      feedback(`Esatto! +${me.points} punti${me.first ? ` (bonus primo +${p.first_bonus})` : ""}`, "good");
      if (celebrated !== roundKey) { celebrated = roundKey; celebrate(me.points, me.first); }
    } else if (me.done) feedback(revealed ? "Tentativi finiti · 0 punti" : "Tentativi finiti. Aspetta la soluzione…", "bad");
    else if (revealed) feedback("Nessuna risposta giusta · 0 punti", "bad");
    else if (me.result === "wrong" && mine !== lastFeedback) {
      feedback(`No, non è giusto · ${p.attempts - me.attempts} ${p.attempts - me.attempts === 1 ? "tentativo rimasto" : "tentativi rimasti"}`, "bad");
      form.classList.remove("puzzle-shake");
      void form.offsetWidth;
      form.classList.add("puzzle-shake");
      vibrate(90);
    }
    lastFeedback = mine;
  }

  const answer = el("puzzle-answer");
  answer.hidden = !revealed;
  if (revealed) setText(answer, `Soluzione: ${p.answer}`);
  const first = el("puzzle-first");
  first.hidden = !p.first;
  if (p.first) setText(el("puzzle-first-text"), me?.first ? `Hai indovinato per primo · +${p.first_bonus}` : `Il primo a indovinare: ${p.first} · +${p.first_bonus}`);
  setText(el("puzzle-count"), `${p.found}/${s.players.length} hanno indovinato`);

  const ranking = el("puzzle-ranking");
  ranking.hidden = !revealed;
  if (revealed) {
    const signature = JSON.stringify(s.players.slice(0, 5).map((x) => [x.user_id, x.score, x.rank]));
    if (ranking.dataset.signature !== signature) {
      ranking.dataset.signature = signature;
      ranking.replaceChildren(...s.players.slice(0, 5).map((x, i) => {
        const row = document.createElement("li");
        row.style.setProperty("--i", i);
        if (x.user_id === me?.user_id) row.setAttribute("aria-current", "true");
        const name = document.createElement("span");
        name.textContent = `${x.rank}. ${x.nickname}`;
        const score = document.createElement("strong");
        score.textContent = `${x.score} pt`;
        row.append(name, score);
        return row;
      }));
    }
  }
};

window.goPuzzleTick = (s, remaining, untilStart) => {
  if (!s.puzzle || `${s.room.id}/${s.room.round}` !== roundKey) return;
  const p = s.puzzle, revealed = p.answer !== undefined;
  const intro = !revealed && untilStart > 0;
  const elapsed = Math.max(0, s.duration_ms - remaining);
  openTiles(intro ? 0 : Math.min(p.order.length, Math.floor(elapsed / p.tile_ms) + 1), revealed);
  stage.toggleAttribute("data-intro", intro);
  const seconds = Math.ceil((revealed ? 0 : remaining) / 1000);
  const value = String(seconds).padStart(2, "0");
  if (el("puzzle-seconds").textContent !== value) el("puzzle-seconds").replaceChildren(Object.assign(document.createElement("span"), { textContent: value }));
  stage.toggleAttribute("data-urgent", !intro && !revealed && seconds <= 5 && s.room.phase === "question");
  el("puzzle-progress").firstElementChild.style.transform = `scaleX(${revealed ? 0 : Math.min(1, remaining / s.duration_ms)})`;
  setText(el("puzzle-phase"), s.room.phase === "paused" ? "In pausa" : revealed ? (s.room.round === p.total ? "Soluzione · poi il podio" : "Soluzione · prossima immagine") : intro ? "Preparati…" : `Pezzo ${Math.min(p.order.length, Math.floor(elapsed / p.tile_ms) + 1)} di ${p.order.length} · vale ${seconds * p.points_per_second} punti`);
  const canType = !intro && s.room.phase === "question" && remaining > 0 && !s.me?.done;
  input.disabled = el("puzzle-send").disabled = !canType || sending;
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const answer = input.value.trim();
  if (!answer || sending || !state || !api) return;
  sending = true;
  input.disabled = el("puzzle-send").disabled = true;
  const { room } = state;
  try {
    const result = await api.rpc("answer", { room_id: room.id, manche: room.manche, round: room.round, answer, request_id: crypto.randomUUID() });
    if (result.result !== "correct") input.value = "";
    await api.refresh();
  } catch (error) {
    api.error(error.message);
  } finally {
    sending = false;
    if (!state?.me?.done) input.focus({ preventScroll: true });
  }
});

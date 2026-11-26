// Manche 5 di Cultura generale: "Puzzle". L'immagine si scopre un pezzo ogni 3 secondi.
// app.js chiama window.goPuzzle (a ogni aggiornamento dello stato) e window.goPuzzleTick (10 volte al secondo).
const el = (id) => document.getElementById(id);
const stage = el("puzzle-stage");
const board = el("puzzle-board");
const image = el("puzzle-image");
const form = el("puzzle-form");
const input = el("puzzle-input");
const setText = (node, value) => { if (node.textContent !== value) node.textContent = value; };
const calm = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const vibrate = (pattern) => { try { navigator.vibrate?.(pattern); } catch {} };

// Tessere a incastro: il corpo di ogni pezzo e' esattamente la sua casella, linguette e incavi sporgono del 20%.
const TAB = 0.2;
const piecesBox = Object.assign(document.createElement("div"), { id: "puzzle-pieces" });
piecesBox.setAttribute("aria-hidden", "true");
board.insertBefore(piecesBox, el("puzzle-burst"));
// Sul telefono il puzzle non si vede: i giocatori guardano lo schermo principale.
const hint = Object.assign(document.createElement("p"), { id: "puzzle-hint" });
hint.innerHTML = "<strong>Chi o cosa c'è nell'immagine?</strong><span>Guarda lo schermo principale</span>";
board.append(hint);

// Lati [sopra, destra, sotto, sinistra]: 1 = linguetta fuori, -1 = incavo, 0 = bordo dritto.
// Ogni lato interno e' condiviso: la linguetta di un pezzo entra nell'incavo del vicino.
const flipV = (r, c) => ((r * 31 + c * 17) % 7) % 2 ? 1 : -1;
const flipH = (r, c) => ((r * 13 + c * 29) % 5) % 2 ? 1 : -1;
const sidesOf = (r, c, rows, cols) => [r ? -flipH(r - 1, c) : 0, c < cols - 1 ? flipV(r, c) : 0, r < rows - 1 ? flipH(r, c) : 0, c ? -flipV(r, c - 1) : 0];

// Contorno della tessera in un quadrato 140x140 (corpo 20..120).
function piecePath(sides) {
  const side = (s, x0, y0, dx, dy, nx, ny) => {
    if (!s) return `L${x0 + dx} ${y0 + dy} `;
    const p = (t, h) => `${x0 + dx * t - nx * h * s} ${y0 + dy * t - ny * h * s}`;
    return `L${p(.36, 0)} C${p(.42, 0)} ${p(.42, 6)} ${p(.38, 9)} C${p(.3, 15)} ${p(.4, 19)} ${p(.5, 19)} C${p(.6, 19)} ${p(.7, 15)} ${p(.62, 9)} C${p(.58, 6)} ${p(.58, 0)} ${p(.64, 0)} L${p(1, 0)} `;
  };
  const [top, right, bottom, left] = sides;
  return "M20 20 " + side(top, 20, 20, 100, 0, 0, 1) + side(right, 120, 20, 0, 100, -1, 0) + side(bottom, 120, 120, -100, 0, 0, -1) + side(left, 20, 120, 0, -100, 1, 0) + "Z";
}
const shapes = new Map();
function shapeOf(sides) {
  const key = sides.join();
  if (!shapes.has(key)) {
    const d = piecePath(sides);
    shapes.set(key, { d, mask: `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 140 140'><path d='${d}'/></svg>`)}")` });
  }
  return shapes.get(key);
}

function makePiece(cell) {
  const p = state.puzzle, r = Math.floor(cell / p.cols), c = cell % p.cols;
  const shape = shapeOf(sidesOf(r, c, p.rows, p.cols));
  const size = 1 + 2 * TAB; // lato della tessera in caselle
  const piece = document.createElement("div");
  piece.className = "puzzle-piece";
  piece.style.cssText = `left:${((c - TAB) / p.cols) * 100}%;top:${((r - TAB) / p.rows) * 100}%;width:${(size / p.cols) * 100}%;height:${(size / p.rows) * 100}%`;
  const art = document.createElement("div");
  art.className = "puzzle-piece-art";
  art.style.maskImage = art.style.webkitMaskImage = shape.mask;
  const img = document.createElement("img");
  img.alt = "";
  img.src = image.src;
  img.style.cssText = `width:${(p.cols / size) * 100}%;height:${(p.rows / size) * 100}%;left:${(-(c - TAB) / size) * 100}%;top:${(-(r - TAB) / size) * 100}%`;
  art.append(img);
  piece.append(art);
  piece.insertAdjacentHTML("beforeend", `<svg viewBox="0 0 140 140" preserveAspectRatio="none"><path d="${shape.d}"/></svg>`);
  return piece;
}

// Entra da fuori, si aggancia e "scatta" in posizione.
function snapIn(piece, cell) {
  if (calm()) return;
  const p = state.puzzle, r = Math.floor(cell / p.cols), c = cell % p.cols;
  const angle = ((cell * 137) % 360) * Math.PI / 180;
  const dx = Math.cos(angle) * 160, dy = Math.sin(angle) * 160 - 40;
  const spin = ((cell * 53) % 50) - 25;
  piece.animate([
    { transform: `translate(${dx}%, ${dy}%) rotate(${spin}deg) scale(1.2)`, opacity: 0, filter: "drop-shadow(0 26px 22px #000a)" },
    { opacity: 1, offset: .12 },
    { transform: "translate(0, 0) rotate(0deg) scale(1.06)", filter: "drop-shadow(0 10px 10px #0009)", offset: .72 },
    { transform: "scale(.97)", filter: "drop-shadow(0 2px 3px #0008)", offset: .84 },
    { transform: "none", filter: "drop-shadow(0 3px 5px #0008)" }
  ], { duration: 950, easing: "cubic-bezier(.16, 1, .3, 1)" });
  piece.classList.add("puzzle-snap");
  board.animate([{ transform: "none" }, { transform: `translate(${c < p.cols / 2 ? 1 : -1}px, ${r < p.rows / 2 ? 1 : -1}px)`, offset: .5 }, { transform: "none" }], { duration: 140, delay: 700 });
}

let state = null, api = null, roundKey = "", opened = 0, sending = false, celebrated = "", lastFeedback = "";

function setupRound(s) {
  const p = s.puzzle;
  roundKey = `${s.room.id}/${s.room.round}`;
  image.src = "/" + p.image;
  board.style.setProperty("--ratio", p.ratio);
  piecesBox.replaceChildren();
  board.removeAttribute("data-done");
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
    if (opened === Infinity) return;
    board.setAttribute("data-done", "");
    opened = Infinity;
    return;
  }
  if (count === opened) return;
  const fresh = count === opened + 1;
  piecesBox.replaceChildren(...order.slice(0, count).map((cell, step) => {
    const piece = piecesBox.children[step]?.dataset.cell === String(cell) ? piecesBox.children[step] : makePiece(cell);
    piece.dataset.cell = cell;
    return piece;
  }));
  if (fresh && count > 0) snapIn(piecesBox.lastElementChild, order[count - 1]);
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

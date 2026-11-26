// Manche 6 di Cultura generale: "Album dei ricordi". Foto da bambino, 3 indizi a tempo, poi la pagina si volta.
// app.js chiama window.goAlbum (a ogni aggiornamento dello stato) e window.goAlbumTick (10 volte al secondo).
const el = (id) => document.getElementById(id);
const stage = el("album-stage");
const form = el("album-form");
const input = el("album-input");
const setText = (node, value) => { if (node.textContent !== value) node.textContent = value; };
const calm = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const vibrate = (pattern) => { try { navigator.vibrate?.(pattern); } catch {} };
const LEVELS = ["difficile", "medio", "facile"];

let state = null, api = null, roundKey = "", shownClues = 0, sending = false, lastFeedback = "", celebrated = "", pending = null;
let seenBonus = new Set(), bonusQueue = [], bonusBusy = false;

function setupRound(s, host) {
  const a = s.album;
  roundKey = `${s.room.id}/${s.room.round}`;
  // Il telefono non mostra la foto: i giocatori guardano lo schermo principale.
  if (host) el("album-child").src = "/" + a.child;
  else el("album-child").removeAttribute("src");
  el("album-adult").removeAttribute("src");
  shownClues = 0;
  el("album-clues").replaceChildren(...LEVELS.map((level, i) => {
    const item = document.createElement("li");
    const label = document.createElement("small");
    label.textContent = `Indizio ${i + 1} · ${level}`;
    const text = document.createElement("span");
    text.textContent = `arriva al secondo ${a.clue_at[i] / 1000}`;
    item.append(label, text);
    item.dataset.waiting = "";
    return item;
  }));
  input.value = "";
  lastFeedback = "";
  setText(el("album-feedback"), "");
  setText(el("album-cover-round"), `Round ${s.room.round} di ${a.total}`);
  stage.removeAttribute("data-solved");
  el("album-ranking").replaceChildren();
  el("album-ranking").dataset.signature = "";
  // Bonus gia' assegnati prima di aprire la pagina: niente annuncio a posteriori.
  seenBonus = new Set(a.bonus_players);
  bonusQueue = [];
  pending = null;
  el("album-bonus").replaceChildren();
}

function showClues(clues) {
  if (clues.length === shownClues) return;
  [...el("album-clues").children].forEach((item, i) => {
    if (i >= clues.length || !item.hasAttribute("data-waiting")) return;
    item.removeAttribute("data-waiting");
    item.lastElementChild.textContent = clues[i];
    if (shownClues > 0 || i === clues.length - 1) item.classList.add("album-write");
  });
  if (clues.length === shownClues + 1) vibrate(30);
  shownClues = clues.length;
}

function feedback(text, tone = "") {
  const node = el("album-feedback");
  node.dataset.tone = tone;
  setText(node, text);
}

function nextBonus() {
  const name = bonusQueue.shift();
  if (!name) { bonusBusy = false; return; }
  bonusBusy = true;
  const stamp = document.createElement("div");
  stamp.className = "album-stamp";
  const title = document.createElement("strong");
  title.textContent = "Senza indizi!";
  const who = document.createElement("span");
  who.textContent = `${name} · +${state.album.bonus}`;
  stamp.append(title, who);
  el("album-bonus").replaceChildren(stamp);
  if (state.me?.nickname === name) vibrate([40, 50, 40, 50, 160]);
  setTimeout(() => { stamp.remove(); nextBonus(); }, calm() ? 2200 : 2600);
}

function announceBonus(names) {
  for (const name of names) {
    if (seenBonus.has(name)) continue;
    seenBonus.add(name);
    bonusQueue.push(name);
  }
  if (!bonusBusy) nextBonus();
}

function renderRanking(s, me) {
  const ranking = el("album-ranking");
  const top = s.players.slice(0, 5);
  const signature = JSON.stringify(top.map((x) => [x.user_id, x.score, x.rank]));
  if (ranking.dataset.signature === signature) return;
  ranking.dataset.signature = signature;
  ranking.replaceChildren(...top.map((x, i) => {
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

window.goAlbum = (s, host, tools) => {
  state = s;
  api = tools;
  const a = s.album, room = s.room, me = s.me;
  if (`${room.id}/${room.round}` !== roundKey) setupRound(s, host);
  const revealed = a.answer !== undefined;
  const asking = ["question", "paused"].includes(room.phase) && !revealed;
  stage.dataset.phase = revealed ? "reveal" : "question";
  stage.toggleAttribute("data-paused", room.phase === "paused");
  setText(el("album-round"), `${room.round}/${a.total}`);
  showClues(a.clues);
  announceBonus(a.bonus_players);

  const player = !host && !!me;
  form.hidden = !player || !asking || !!me.done;
  const left = a.attempts - (me?.attempts || 0);
  el("album-tries-row").hidden = !player || revealed || me.result === "correct";
  [...el("album-tries").children].forEach((dot, i) => dot.toggleAttribute("data-used", i < (me?.attempts || 0)));
  setText(el("album-tries-text"), `${left} ${left === 1 ? "tentativo rimasto" : "tentativi rimasti"}`);

  if (player) {
    const mine = `${roundKey}:${me.result}:${me.attempts}`;
    if (me.result === "correct") {
      feedback(`Esatto! +${me.points} punti${me.bonus ? ` (bonus senza indizi +${a.bonus})` : ""}`, "good");
      if (celebrated !== roundKey) { celebrated = roundKey; stage.setAttribute("data-solved", ""); vibrate([40, 60, 120]); }
    } else if (me.done) feedback(revealed ? "Tentativi finiti · 0 punti" : "Tentativi finiti. Guarda lo schermo e aspetta…", "bad");
    else if (revealed) feedback("Nessuna risposta giusta · 0 punti", "bad");
    else if (me.result === "wrong" && mine !== lastFeedback) {
      feedback("Non sono io! Riprova", "bad");
      form.classList.remove("album-shake");
      void form.offsetWidth;
      form.classList.add("album-shake");
      vibrate(90);
    }
    lastFeedback = mine;
  }

  if (revealed) {
    if (host && !el("album-adult").getAttribute("src")) el("album-adult").src = "/" + a.adult;
    setText(el("album-adult-name"), a.answer);
    setText(el("album-answer"), `Era ${a.answer}!`);
    setText(el("album-mine"), !player ? "" : me.result === "correct" ? `Hai fatto +${me.points} punti` : "Questa volta 0 punti");
    renderRanking(s, me);
  }
  setText(el("album-count"), `${a.found}/${s.players.length} hanno indovinato`);
};

window.goAlbumTick = (s, remaining, untilStart) => {
  if (!s.album || `${s.room.id}/${s.room.round}` !== roundKey) return;
  const a = s.album, revealed = a.answer !== undefined;
  const intro = !revealed && untilStart > 0;
  stage.toggleAttribute("data-intro", intro);
  const seconds = Math.ceil((revealed ? 0 : remaining) / 1000);
  const value = String(seconds).padStart(2, "0");
  if (el("album-seconds").textContent !== value) el("album-seconds").replaceChildren(Object.assign(document.createElement("span"), { textContent: value }));
  stage.toggleAttribute("data-urgent", !intro && !revealed && seconds <= 5 && s.room.phase === "question");
  el("album-progress").firstElementChild.style.transform = `scaleX(${revealed ? 0 : Math.min(1, remaining / s.duration_ms)})`;
  const elapsed = s.duration_ms - remaining;
  const next = a.clue_at.findIndex((at) => at > elapsed);
  const worth = seconds * a.points_per_second + (next === 0 ? a.bonus : 0);
  setText(el("album-phase"), s.room.phase === "paused" ? "In pausa"
    : revealed ? (s.room.round === a.total ? "Ecco chi era · poi il podio" : "Ecco chi era · l'host preme Avanti")
    : intro ? "Si apre l'album…"
    : next >= 0 ? `Indizio ${next + 1} tra ${Math.ceil((a.clue_at[next] - elapsed) / 1000)} s · vale ${worth} punti`
    : `Ultimi secondi · vale ${worth} punti`);
  const canType = !intro && s.room.phase === "question" && remaining > 0 && !s.me?.done;
  input.disabled = el("album-send").disabled = !canType || sending;
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const answer = input.value.trim();
  if (!answer || sending || !state || !api) return;
  sending = true;
  input.disabled = el("album-send").disabled = true;
  const { room } = state;
  try {
    // Se la rete perde la risposta, il nuovo invio della stessa parola riusa lo stesso id: niente tentativo sprecato
    if (pending?.answer !== answer || pending.round !== room.round) pending = { answer, round: room.round, id: crypto.randomUUID() };
    const result = await api.rpc("answer", { room_id: room.id, manche: room.manche, round: room.round, answer, request_id: pending.id });
    pending = null;
    if (result.result !== "correct") input.value = "";
    await api.refresh();
  } catch (error) {
    api.error(error.message);
  } finally {
    sending = false;
    if (!state?.me?.done) input.focus({ preventScroll: true });
  }
});

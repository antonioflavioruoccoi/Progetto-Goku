// Manche 6 di Cultura generale: "Album dei ricordi". Foto da bambino, 3 indizi a tempo, poi la pagina si volta.
// app.js chiama window.goAlbum (a ogni aggiornamento dello stato) e window.goAlbumTick (10 volte al secondo).
const el = (id) => document.getElementById(id);
const stage = el("album-stage");
const form = el("album-form");
const input = el("album-input");
const setText = (node, value) => { if (node.textContent !== value) node.textContent = value; };
const calm = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const vibrate = (pattern) => { try { navigator.vibrate?.(pattern); } catch {} };

let turned = "";
const roundKeyOf = (s) => `${s.room.id}/${s.room.round}`;
let state = null, api = null, roundKey = "", shownClues = 0, sending = false, lastFeedback = "", celebrated = "", pending = null;
let seenBonus = new Set(), bonusQueue = [], bonusBusy = false;
// Sullo schermo grande, accanto al VIP adulto, si rileggono i 3 indizi del round.
const recap = Object.assign(document.createElement("ol"), { id: "album-recap" });
el("album-mine").after(recap);

// Dal secondo VIP il libro resta aperto: la pagina con la soluzione si volta e scopre il nuovo bambino.
// Copie temporanee delle pagine (stessi id, quindi stessa grafica): getElementById trova sempre prima le originali.
function turnPage(childSrc) {
  if (calm()) return;
  const under = el("album-back").cloneNode(true);
  const front = el("album-right").cloneNode(true);
  const back = el("album-left").cloneNode(true);
  back.querySelector("img").src = childSrc;
  const leaf = document.createElement("div");
  leaf.className = "album-turn";
  under.classList.add("album-turn-under");
  back.classList.add("album-turn-back");
  leaf.append(front, back);
  for (const node of [under, leaf]) node.setAttribute("aria-hidden", "true");
  el("album-book").append(under, leaf);
  // Anche se l'animazione viene annullata (partita terminata, schermata nascosta) le copie spariscono
  const done = () => { under.remove(); leaf.remove(); };
  leaf.addEventListener("animationend", done, { once: true });
  leaf.addEventListener("animationcancel", done, { once: true });
  setTimeout(done, 2500);
  turned = roundKeyOf(state);
}

function setupRound(s, host) {
  const a = s.album;
  const turning = host && s.room.round > 1 && roundKey === `${s.room.id}/${s.room.round - 1}` && stage.dataset.phase === "reveal";
  if (turning) { state = s; turnPage("/" + a.child); }
  roundKey = `${s.room.id}/${s.room.round}`;
  // Primo VIP: libro subito chiuso, la nuova foto non si vede prima che la copertina si apra (goAlbumTick lo riapre).
  stage.setAttribute("data-intro", "");
  stage.toggleAttribute("data-cover", s.room.round === 1);
  // Il telefono non mostra la foto: i giocatori guardano lo schermo principale.
  if (host) el("album-child").src = "/" + a.child;
  else el("album-child").removeAttribute("src");
  el("album-adult").removeAttribute("src");
  shownClues = 0;
  el("album-clues").replaceChildren(...a.clue_at.map((_, i) => {
    const item = document.createElement("li");
    const label = document.createElement("small");
    label.textContent = `${i + 1}° indizio`;
    const text = document.createElement("span");
    item.append(label, text);
    item.dataset.waiting = "";
    return item;
  }));
  input.value = "";
  lastFeedback = "";
  setText(el("album-feedback"), "");
  recap.replaceChildren();
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
    if (!recap.childElementCount) recap.replaceChildren(...a.clues.map((clue, i) => {
      const item = document.createElement("li");
      item.append(Object.assign(document.createElement("small"), { textContent: `${i + 1}°` }), clue);
      return item;
    }));
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
  stage.toggleAttribute("data-cover", intro && s.room.round === 1);
  const seconds = Math.ceil((revealed ? 0 : remaining) / 1000);
  const value = String(seconds).padStart(2, "0");
  if (el("album-seconds").textContent !== value) el("album-seconds").replaceChildren(Object.assign(document.createElement("span"), { textContent: value }));
  stage.toggleAttribute("data-urgent", !intro && !revealed && seconds <= 5 && s.room.phase === "question");
  el("album-progress").firstElementChild.style.transform = `scaleX(${revealed ? 0 : Math.min(1, remaining / s.duration_ms)})`;
  const elapsed = s.duration_ms - remaining;
  const next = a.clue_at.findIndex((at) => at > elapsed);
  const worth = seconds * a.points_per_second + (next === 0 ? a.bonus : 0);
  setText(el("album-phase"), s.room.phase === "paused" ? "In pausa"
    : revealed ? (s.room.round === a.total ? (s.room.manche_total > 6 ? "Ecco chi era · poi 50 Sfumature" : "Ecco chi era · poi il podio") : "Ecco chi era · l'host preme Avanti")
    : intro ? (s.room.round === 1 ? "Si apre l'album…" : turned === roundKeyOf(s) ? "Si volta pagina…" : "Preparati…")
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

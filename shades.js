// Manche 7 di Cultura generale: "50 Sfumature". Una zona del disegno e' bianca: ricrea il colore originale.
// app.js chiama window.goShades (a ogni aggiornamento dello stato) e window.goShadesTick (10 volte al secondo).
const el = (id) => document.getElementById(id);
const stage = el("shades-stage");
const bars = { h: el("shades-h"), s: el("shades-s"), v: el("shades-v") };
// Quadrato colore: in orizzontale la saturazione, in verticale la luminosita' (pilota le barre s e v nascoste)
const pad = el("shades-pad");
const setText = (node, value) => { if (node.textContent !== value) node.textContent = value; };
const vibrate = (pattern) => { try { navigator.vibrate?.(pattern); } catch {} };
// Colori dei tubetti: titolo multicolore e "macchie" della tavolozza
const PAINTS = ["#e4572e", "#f2a541", "#f3d34a", "#5bb36a", "#2fb8a6", "#3d8fd1", "#6a5fd6", "#c64ca3"];

let state = null, api = null, roundKey = "", touched = false, sending = false, pending = null, autoSent = "";

// "50 Sfumature" con ogni lettera di un colore diverso (titolo della manche e schermata delle regole)
window.goShadesTitle = (node) => {
  const letters = [...node.textContent].map((ch, i) => {
    const span = document.createElement("span");
    span.textContent = ch === " " ? "\u00a0" : ch;
    if (ch.trim()) span.style.color = PAINTS[i % PAINTS.length];
    return span;
  });
  node.setAttribute("aria-label", node.textContent);
  node.replaceChildren(...letters);
  for (const span of letters) span.setAttribute("aria-hidden", "true");
};
window.goShadesTitle(el("shades-name"));

const hsvToHex = ({ h, s, v }) => {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return Math.round(v / 100 * (1 - s / 100 * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
  };
  return "#" + [f(5), f(3), f(1)].map((c) => c.toString(16).padStart(2, "0")).join("");
};
const hexToHsv = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  const h = !d ? 0 : max === r ? (g - b) / d % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: Math.round((h * 60 + 360) % 360), s: max ? Math.round(d / max * 100) : 0, v: Math.round(max / 2.55) };
};
const current = () => ({ h: +bars.h.value, s: +bars.s.value, v: +bars.v.value });

// Le barre mostrano sempre il colore che otterresti spostandole
function paintBars() {
  const c = current();
  const hex = hsvToHex(c);
  stage.style.setProperty("--pick", hex);
  stage.style.setProperty("--pick-full", hsvToHex({ h: c.h, s: 100, v: c.v }));
  stage.style.setProperty("--pick-bright", hsvToHex({ h: c.h, s: c.s, v: 100 }));
  stage.style.setProperty("--pick-gray", hsvToHex({ h: c.h, s: 0, v: c.v }));
  stage.style.setProperty("--pick-hue", hsvToHex({ h: c.h, s: 100, v: 100 }));
  stage.style.setProperty("--pick-s", c.s / 100);
  stage.style.setProperty("--pick-v", c.v / 100);
  setText(el("shades-h-value"), `${c.h}°`);
  setText(el("shades-s-value"), `${c.s}%`);
  setText(el("shades-v-value"), `${c.v}%`);
}

function setupRound(s, host) {
  const x = s.shades;
  roundKey = `${s.room.id}/${s.room.round}`;
  stage.style.setProperty("--ratio", x.ratio);
  el("shades-art-img").src = "/" + x.image;
  el("shades-art-img").alt = `${x.name}: ${x.part} da colorare`;
  const mask = `url("/${x.mask}")`;
  el("shades-fill").style.maskImage = el("shades-fill").style.webkitMaskImage = mask;
  setText(el("shades-category"), x.category);
  const name = document.createElement("strong"), part = document.createElement("span");
  name.textContent = x.name;
  part.textContent = x.part;
  el("shades-prompt").replaceChildren(name, " ", part);
  // Come in Colortoon si parte da un colore a caso: nessun vantaggio per chi non tocca nulla
  bars.h.value = Math.floor(Math.random() * 360);
  bars.s.value = 35 + Math.floor(Math.random() * 50);
  bars.v.value = 35 + Math.floor(Math.random() * 50);
  touched = false;
  pending = null;
  stage.removeAttribute("data-revealed");
  el("shades-board").replaceChildren();
  el("shades-board").dataset.signature = "";
  setText(el("shades-result"), "");
  setText(el("shades-hint"), "");
  if (!host) paintBars();
}

// Consiglio sul colore consegnato, rispetto all'originale
function hint(mine, target) {
  const a = hexToHsv(mine), b = hexToHsv(target);
  const hue = Math.min(Math.abs(a.h - b.h), 360 - Math.abs(a.h - b.h));
  if (Math.abs(a.v - b.v) >= 8) return a.v > b.v ? "Un po' troppo chiaro: serviva più in basso nel quadrato." : "Un po' troppo scuro: serviva più in alto nel quadrato.";
  if (Math.abs(a.s - b.s) >= 8) return a.s > b.s ? "Troppo acceso: serviva più a sinistra nel quadrato." : "Troppo spento: serviva più a destra nel quadrato.";
  if (hue >= 8) return "Chiarezza giusta: ritocca la tinta sulla barra arcobaleno.";
  return "Occhio da pittore!";
}

function renderBoard(s) {
  const board = el("shades-board");
  const picks = new Map(s.shades.picks.map((p) => [p.user_id, p]));
  const rows = s.players.slice(0, 6);
  const signature = JSON.stringify(rows.map((p) => [p.user_id, p.score, p.rank, picks.get(p.user_id)?.points]));
  if (board.dataset.signature === signature) return;
  board.dataset.signature = signature;
  board.replaceChildren(...rows.map((p, i) => {
    const pick = picks.get(p.user_id);
    const row = document.createElement("li");
    row.style.setProperty("--i", i);
    if (p.user_id === s.me?.user_id) row.setAttribute("aria-current", "true");
    const dab = document.createElement("i");
    dab.className = "shades-dab";
    if (pick) dab.style.background = pick.color;
    else dab.dataset.empty = "";
    const name = document.createElement("span");
    name.textContent = `${p.rank}. ${p.nickname}`;
    const round = document.createElement("small");
    round.textContent = pick ? `${pick.accuracy}% · +${pick.points}` : "nessun colore";
    const total = document.createElement("strong");
    total.textContent = `${p.score} pt`;
    row.append(dab, name, round, total);
    return row;
  }));
}

window.goShades = (s, host, tools) => {
  state = s;
  api = tools;
  const x = s.shades, room = s.room, me = s.me;
  if (`${room.id}/${room.round}` !== roundKey) setupRound(s, host);
  const revealed = x.color !== undefined;
  const player = !host && !!me;
  stage.dataset.phase = revealed ? "reveal" : "question";
  stage.toggleAttribute("data-paused", room.phase === "paused");
  stage.toggleAttribute("data-done", !!me?.done);
  setText(el("shades-round"), `${room.round}/${x.total}`);
  setText(el("shades-count"), `${s.received}/${s.players.length} hanno consegnato`);

  if (revealed) {
    if (!stage.hasAttribute("data-revealed")) {
      stage.setAttribute("data-revealed", "");
      stage.style.setProperty("--answer", x.color);
      if (player) vibrate(me.points >= x.max * .8 ? [40, 60, 140] : 40);
    }
    setText(el("shades-answer-hex"), x.color.toUpperCase());
    const mine = me?.choice ? hsvToHex(me.choice) : null;
    stage.style.setProperty("--mine", mine || "transparent");
    el("shades-mine").toggleAttribute("data-empty", !mine);
    if (player) {
      setText(el("shades-result"), mine ? `Precisione ${me.accuracy}% · +${me.points} punti` : "Nessun colore consegnato · 0 punti");
      setText(el("shades-hint"), mine ? hint(mine, x.color) : "La prossima volta premi Consegna prima dello scadere.");
    }
    renderBoard(s);
  } else if (player && me.done && me.choice) {
    stage.style.setProperty("--pick", hsvToHex(me.choice));
  }
};

window.goShadesTick = (s, remaining, untilStart) => {
  if (!s.shades || `${s.room.id}/${s.room.round}` !== roundKey) return;
  const x = s.shades, revealed = x.color !== undefined;
  const intro = !revealed && untilStart > 0;
  const seconds = Math.ceil((revealed ? 0 : intro ? untilStart : remaining) / 1000);
  stage.toggleAttribute("data-intro", intro);
  setText(el("shades-seconds"), String(seconds).padStart(2, "0"));
  stage.toggleAttribute("data-urgent", !intro && !revealed && seconds <= 10 && s.room.phase === "question");
  el("shades-progress").firstElementChild.style.transform = `scaleX(${revealed ? 0 : Math.min(1, remaining / s.duration_ms)})`;
  const last = s.room.round === x.total;
  setText(el("shades-phase"), s.room.phase === "paused" ? "In pausa"
    : revealed ? (!s.can_control ? "Ecco il colore giusto" : last ? "Ecco il colore giusto. Poi il podio." : "Ecco il colore giusto. Premi Avanti.")
    : intro ? "Prepara i pennelli…"
    : s.me?.done ? "Colore consegnato: guarda lo schermo"
    : s.can_control ? "Ricreate il colore sul telefono" : "Ricrea il colore originale");
  const canPaint = !intro && s.room.phase === "question" && remaining > 0 && !!s.me && !s.me.done && !s.can_control;
  for (const bar of Object.values(bars)) bar.disabled = !canPaint || sending;
  pad.toggleAttribute("data-disabled", !canPaint || sending);
  el("shades-send").disabled = !canPaint || sending;
  // Se il tempo sta per finire e hai gia' mosso le barre, il colore parte da solo (margine per reti lente)
  if (canPaint && touched && remaining < 2500 && autoSent !== roundKey) {
    autoSent = roundKey;
    send();
  }
};

for (const bar of Object.values(bars)) {
  bar.addEventListener("input", () => {
    touched = true;
    paintBars();
  });
  bar.addEventListener("change", () => vibrate(8));
}

async function send() {
  if (sending || !state || !api) return;
  sending = true;
  const { room } = state;
  const answer = current();
  try {
    // Se la rete perde la risposta, il nuovo invio dello stesso colore riusa lo stesso id
    if (pending?.round !== room.round || pending.hex !== hsvToHex(answer)) pending = { round: room.round, hex: hsvToHex(answer), id: crypto.randomUUID() };
    await api.rpc("answer", { room_id: room.id, manche: room.manche, round: room.round, answer, request_id: pending.id });
    vibrate([30, 40, 30]);
    await api.refresh();
  } catch (error) {
    api.error(error.message);
  } finally {
    sending = false;
  }
}
el("shades-send").addEventListener("click", send);

// Trascinamento nel quadrato (mouse e touch): il dito resta "agganciato" anche se esce dal bordo
const clamp01 = (n) => Math.min(1, Math.max(0, n));
function padAt(event) {
  const r = pad.getBoundingClientRect();
  bars.s.value = Math.round(clamp01((event.clientX - r.left) / r.width) * 100);
  bars.v.value = Math.round((1 - clamp01((event.clientY - r.top) / r.height)) * 100);
  touched = true;
  paintBars();
}
pad.addEventListener("pointerdown", (event) => {
  if (pad.hasAttribute("data-disabled")) return;
  event.preventDefault();
  pad.setPointerCapture(event.pointerId);
  pad.setAttribute("data-drag", "");
  padAt(event);
});
pad.addEventListener("pointermove", (event) => { if (pad.hasPointerCapture(event.pointerId)) padAt(event); });
const padEnd = () => { if (pad.hasAttribute("data-drag")) { pad.removeAttribute("data-drag"); vibrate(8); } };
pad.addEventListener("pointerup", padEnd);
pad.addEventListener("pointercancel", padEnd);

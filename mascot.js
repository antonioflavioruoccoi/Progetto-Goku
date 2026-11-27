// Biscotto e Cervello in pixel art, disegnati pixel per pixel con gambe e braccia animate.
// La griglia è W×H pixel logici; il CSS la ingrandisce con image-rendering: pixelated.
export const W = 48, H = 62;
const GROUND = 58; // riga della suola
const INK = '#2b1720', WHITE = '#fbf8f2', WHITE_SHADE = '#d6cfe0', EYE = '#1a1014', TONGUE = '#ff6f61';
const YELLOW = '#f5c542', YELLOW_DARK = '#c9961c';
// arti color prugna: il nero delle foto sparirebbe sul blu notte della dashboard
const LIMB_DARK = '#3b2633', LIMB = '#7a5670';
const LIGHT = [-0.55, -0.83]; // luce dall'alto a sinistra

const TYPES = {
  biscotto: {
    skin: ['#c27c2e', '#e9a94f', '#f7cd7c'], // ombra, base, luce
    blush: '#ee8a5a',
    blobs: [[24, 33, 14.3]],
    shoulders: [[10, 34], [38, 34]],
    hips: [[20, 46], [28, 46]],
    face: 29,
    brows: false,
    details: cookieDetails,
  },
  cervello: {
    skin: ['#d4687a', '#f39aa0', '#ffc6c8'],
    blush: '#ff7f91',
    blobs: [[16, 31, 8.6], [24, 26, 10], [32, 31, 8.6], [19, 37, 8.5], [29, 37, 8.5]],
    shoulders: [[9, 34], [39, 34]],
    hips: [[20, 45], [28, 45]],
    face: 29,
    brows: true,
    details: brainDetails,
  },
};

// Griglia di pixel: colori per posizione, poi contorno scuro attorno a tutto.
function pixelGrid() {
  const g = new Map();
  return {
    set: (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < W && y < H) g.set(y * W + x, c); },
    get: (x, y) => g.get(y * W + x),
    entries: () => g.entries(),
    outline() {
      const add = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
        if (!g.has(y * W + x) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g.has((y + dy) * W + x + dx) && x + dx >= 0 && x + dx < W)) add.push([x, y]);
      for (const [x, y] of add) g.set(y * W + x, INK);
    },
  };
}

const inside = (t, x, y) => t.blobs.some(([cx, cy, r]) => (x + .5 - cx) ** 2 + (y + .5 - cy) ** 2 <= r * r);

function renderBody(t) {
  const g = pixelGrid();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inside(t, x, y)) continue;
    // ombreggiatura per lobo: il lobo che contiene di più il pixel decide la normale
    let best = null;
    for (const [cx, cy, r] of t.blobs) {
      const d = Math.hypot(x + .5 - cx, y + .5 - cy);
      if (d <= r && (!best || r - d > best.depth)) best = { depth: r - d, nx: (x + .5 - cx) / r, ny: (y + .5 - cy) / r, k: d / r };
    }
    const dot = best.nx * LIGHT[0] + best.ny * LIGHT[1];
    const tone = dot > .45 && best.k > .35 ? 2 : dot < -.4 || (best.k > .82 && dot < -.1) ? 0 : 1;
    g.set(x, y, t.skin[tone]);
  }
  t.details(g, t);
  g.outline();
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  for (const [i, color] of g.entries()) { ctx.fillStyle = color; ctx.fillRect(i % W, Math.floor(i / W), 1, 1); }
  return c;
}

function cookieDetails(g, t) {
  const chip = '#6a3a1e', chipLight = '#94582f', crumb = '#d08a3a';
  for (const [x, y, w, h] of [[14, 24, 3, 2], [30, 22, 3, 2], [12, 37, 2, 3], [34, 38, 3, 2], [23, 43, 3, 2], [33, 29, 2, 2], [16, 41, 2, 2]]) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (inside(t, x + i, y + j)) g.set(x + i, y + j, chip);
    g.set(x, y, chipLight);
  }
  for (const [x, y] of [[27, 21], [11, 30], [36, 33], [30, 44], [20, 23], [37, 26]]) if (inside(t, x, y)) g.set(x, y, crumb);
  // tocco da laureato: cappello disegnato sopra la testa e contornato insieme al corpo
  const rows = [[12, 21, 27, '#4a62b3'], [13, 17, 31, '#4a62b3'], [14, 13, 35, '#34488f'], [15, 11, 37, '#34488f'], [16, 14, 34, '#2a3a78'], [17, 18, 30, '#1f2b5c']];
  for (const [y, a, b, c] of rows) for (let x = a; x <= b; x++) g.set(x, y, c);
  for (let y = 18; y <= 20; y++) for (let x = 16; x <= 32; x++) g.set(x, y, y === 18 ? '#2c3d7c' : '#22305f');
  g.set(24, 13, YELLOW);
}

function brainDetails(g, t) {
  const fold = '#c4556a';
  const paths = [
    [[24, 17], [24, 19], [23, 21], [24, 23]], [[14, 23], [16, 24], [18, 23], [19, 25]], [[29, 23], [31, 24], [33, 23], [35, 25]],
    [[8, 30], [10, 31], [11, 33]], [[40, 30], [38, 31], [37, 33]], [[12, 40], [14, 41], [15, 43]],
    [[36, 40], [34, 41], [33, 43]], [[21, 44], [24, 43], [27, 44]], [[19, 19], [20, 21]], [[29, 19], [28, 21]],
  ];
  for (const p of paths) for (let i = 1; i < p.length; i++) line(p[i - 1], p[i], (x, y) => inside(t, x, y) && g.set(x, y, fold));
}

// Bresenham: chiama put(x, y) per ogni pixel del segmento.
function line([x0, y0], [x1, y1], put) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    put(x0, y0);
    if (x0 === x1 && y0 === y1) return;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

// Una posa per ogni stato: dove stanno piedi, mani, quanto rimbalza il corpo e che faccia fa.
function pose(t, p) {
  const { state, phase = 0, time = 0 } = p;
  const s = Math.sin(phase), c = Math.cos(phase);
  const stand = i => ({ x: t.hips[i][0] + (i ? 1 : -1), lift: 0 });
  let bob = 0, feet = [stand(0), stand(1)], arms = [{ a: 22, swing: 0 }, { a: 22, swing: 0 }];
  let face = 'open', mouth = 'smile', shadow = 1, bulb = false, tassel = 0;
  if (state === 'walk') {
    bob = -Math.round(Math.abs(c));
    // il piede che avanza si alza; quello a terra resta fermo (niente scivolate)
    feet = [{ x: t.hips[0][0] - 1 + 2 * s, lift: Math.max(0, c) * 3.4 }, { x: t.hips[1][0] + 1 - 2 * s, lift: Math.max(0, -c) * 3.4 }];
    arms = [{ a: 24, swing: -3 * s }, { a: 24, swing: 3 * s }];
    tassel = Math.round(-s);
  } else if (state === 'idle') {
    bob = Math.sin(time * 2.4) > .35 ? -1 : 0;
  } else if (state === 'wave') {
    arms = [{ a: 18, swing: 0 }, { a: 138 + 24 * Math.sin(time * 13), swing: 0 }];
    face = 'happy';
    bob = Math.sin(time * 6.5) > .6 ? -1 : 0;
    bulb = true;
  } else if (state === 'fall') {
    arms = [{ a: 150 + 14 * Math.sin(time * 22), swing: 0 }, { a: 150 - 14 * Math.sin(time * 22), swing: 0 }];
    feet = [{ x: t.hips[0][0] - 1 + 2 * Math.sin(time * 18), lift: 1 }, { x: t.hips[1][0] + 1 - 2 * Math.sin(time * 18), lift: 1 }];
    face = 'wide'; mouth = 'o'; shadow = 0;
  } else if (state === 'land') {
    bob = 2;
    feet = [{ x: t.hips[0][0] - 3, lift: 0 }, { x: t.hips[1][0] + 3, lift: 0 }];
    arms = [{ a: 75, swing: 0 }, { a: 75, swing: 0 }];
    face = 'squint';
  } else if (state === 'wake') {
    bob = -1;
    arms = [{ a: 145 + 8 * Math.sin(time * 16), swing: 0 }, { a: 145 - 8 * Math.sin(time * 16), swing: 0 }];
    face = 'happy';
    bulb = true;
  }
  if (p.blink && (face === 'open')) face = 'blink';
  return { bob, feet, arms, face, mouth, shadow, bulb, tassel };
}

export function createSprite(kind) {
  const t = TYPES[kind];
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const body = renderBody(t);
  const put = c => (x, y) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); };
  const rect = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
  const disk = (cx, cy, r, c) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (dx * dx + dy * dy <= r * r) put(c)(cx + dx, cy + dy); };
  const thick = c => (x, y) => rect(x, y, 2, 2, c);
  const limb = (a, b) => { line(a, b, thick(LIMB_DARK)); line(a, b, put(LIMB)); };

  function shoe(x) {
    x = Math.round(x);
    const y = GROUND;
    rect(x - 2, y - 4, 6, 1, INK); rect(x - 3, y - 3, 9, 4, INK);
    rect(x - 2, y - 3, 5, 1, WHITE); rect(x - 2, y - 2, 7, 1, WHITE); rect(x - 2, y - 1, 7, 1, WHITE_SHADE);
    put(WHITE)(x + 4, y - 1);
  }
  function shoeLifted(x, lift) { ctx.save(); ctx.translate(0, -Math.round(lift)); shoe(x); ctx.restore(); }
  function glove(x, y) {
    rect(x - 1, y - 2, 3, 1, INK); rect(x - 2, y - 1, 5, 3, INK); rect(x - 1, y + 2, 3, 1, INK);
    rect(x - 1, y - 1, 3, 3, WHITE); put(WHITE_SHADE)(x + 1, y + 1); put(WHITE_SHADE)(x, y + 1);
  }

  function eyes(face, y) {
    for (const ex of [18, 28]) {
      if (face === 'blink' || face === 'squint') rect(ex, y + 2, 3, 1, EYE);
      else if (face === 'happy') { put(EYE)(ex + 1, y + 1); put(EYE)(ex, y + 2); put(EYE)(ex + 2, y + 2); put(EYE)(ex, y + 3); put(EYE)(ex + 2, y + 3); }
      else { rect(ex, y, 3, 4, EYE); put(WHITE)(ex, y); if (face === 'wide') put(WHITE)(ex + 2, y + 2); }
      if (t.brows) rect(ex, y - (face === 'happy' || face === 'wide' ? 3 : 2), 3, 1, INK);
    }
  }
  function mouth(kind, y) {
    if (kind === 'o') { rect(23, y, 3, 3, INK); put('#5a1f2a')(24, y + 1); return; }
    rect(22, y, 5, 1, INK); put(INK)(22, y + 1); rect(23, y + 1, 3, 1, TONGUE); put(INK)(26, y + 1); rect(23, y + 2, 3, 1, INK);
  }
  function bulb(time) {
    const on = Math.sin(time * 9) > -.3;
    disk(39, 8, 3.3, INK); disk(39, 8, 2.3, on ? '#ffd84a' : '#e7c24a'); put('#fff6b8')(38, 7);
    rect(37, 11, 5, 4, INK); rect(38, 12, 3, 2, '#a3a8bf');
    if (on) for (const [x, y] of [[33, 5], [34, 6], [39, 1], [39, 2], [44, 5], [45, 4]]) put(YELLOW)(x, y);
  }

  function draw(p) {
    const q = pose(t, p);
    ctx.clearRect(0, 0, W, H);
    if (q.shadow) { ctx.fillStyle = 'rgba(6,10,26,.42)'; ctx.fillRect(13, GROUND + 1, 22, 1); ctx.fillRect(16, GROUND + 2, 16, 1); }
    q.feet.forEach((f, i) => {
      const hip = [t.hips[i][0], t.hips[i][1] + q.bob];
      limb(hip, [f.x, GROUND - 4 - f.lift]);
      shoeLifted(f.x, f.lift);
    });
    ctx.drawImage(body, 0, q.bob);
    eyes(q.face, t.face + q.bob);
    mouth(q.mouth, t.face + 6 + q.bob);
    rect(14, t.face + 5 + q.bob, 2, 1, t.blush); rect(33, t.face + 5 + q.bob, 2, 1, t.blush);
    if (t === TYPES.biscotto) {
      const tx = 36 + q.tassel;
      line([24, 13 + q.bob], [tx, 15 + q.bob], put(YELLOW));
      line([tx, 15 + q.bob], [tx, 19 + q.bob], put(YELLOW));
      rect(tx - 1, 19 + q.bob, 3, 5, INK); rect(tx, 20 + q.bob, 1, 3, YELLOW); put(YELLOW_DARK)(tx, 22 + q.bob);
    }
    q.arms.forEach((arm, i) => {
      const side = i ? 1 : -1, [sx, sy] = t.shoulders[i], rad = arm.a * Math.PI / 180;
      const hand = [sx + side * Math.sin(rad) * 8 + arm.swing, sy + q.bob + Math.cos(rad) * 8 - Math.abs(arm.swing) * .3];
      limb([sx, sy + q.bob], hand);
      glove(Math.round(hand[0]), Math.round(hand[1]));
    });
    if (q.bulb && t === TYPES.cervello) bulb(p.time || 0);
  }
  return { canvas, draw };
}

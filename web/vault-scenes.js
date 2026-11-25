// "Per un pelo" scenes: small isometric dioramas drawn as SVG solids.
// Every solid has a warm lit top, a mid left face and a cool dark right face,
// like a painted paper model under a lamp. Each scene is auto-fitted to the frame.

const C = Math.cos(Math.PI / 6);
const r1 = n => Math.round(n * 10) / 10;
const BG = '#121a30';

function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function mix(a, b, t) { const A = rgb(a), B = rgb(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); }
const lit = (c, t = .22) => mix(c, '#fff3dc', t);
const shade = (c, t = .32) => mix(c, '#0c1124', t);

function random(seed) {
  let x = seed;
  return () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
}

function toolkit({s = 10, ex = [C, .5], ey = [-C, .5], seed = 1} = {}) {
  const defs = new Map();
  const box = {x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity};
  const extend = (x, y) => { box.x0 = Math.min(box.x0, x); box.x1 = Math.max(box.x1, x); box.y0 = Math.min(box.y0, y); box.y1 = Math.max(box.y1, y); };
  const P = (x, y, z = 0) => {
    const q = [(x * ex[0] + y * ey[0]) * s, (x * ex[1] + y * ey[1] - z) * s];
    extend(q[0], q[1]);
    return q;
  };
  const pt = q => `${r1(q[0])} ${r1(q[1])}`;
  const path = (pts, fill, extra = '') => `<path d="M${pts.map(pt).join('L')}Z" fill="${fill}" stroke="${fill}" stroke-width=".7" stroke-linejoin="round"${extra}/>`;
  const gradient = (c, kind = 'h') => {
    const id = `vs-${kind}-${c.slice(1)}`;
    if (!defs.has(id)) defs.set(id, kind === 'h'
      ? `<linearGradient id="${id}"><stop offset="0" stop-color="${lit(c, .2)}"/><stop offset=".4" stop-color="${c}"/><stop offset="1" stop-color="${shade(c, .45)}"/></linearGradient>`
      : `<radialGradient id="${id}" cx=".36" cy=".32" r=".78"><stop offset="0" stop-color="${lit(c, .38)}"/><stop offset=".5" stop-color="${c}"/><stop offset="1" stop-color="${shade(c, .55)}"/></radialGradient>`);
    return `url(#${id})`;
  };
  const t = {
    P, pt, path, gradient, extend, defs, bounds: box, rand: random(seed), s,
    // Axis-aligned cuboid: x/y footprint, z base, w/d/h size.
    box(x, y, z, w, d, h, c, {top, left, right, attrs = ''} = {}) {
      const front = [P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)];
      const side = [P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)];
      const lid = [P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)];
      return `<g${attrs}>${path(front, left ?? c)}${path(side, right ?? shade(c))}${path(lid, top ?? lit(c))}</g>`;
    },
    // Map (a, b) in [0,1]² onto a parallelogram with origin o and edges u, v (world vectors).
    on(o, u, v) { return (a, b) => P(o[0] + a * u[0] + b * v[0], o[1] + a * u[1] + b * v[1], o[2] + a * u[2] + b * v[2]); },
    quad(map, a0, b0, a1, b1, fill, extra = '') { return path([map(a0, b0), map(a1, b0), map(a1, b1), map(a0, b1)], fill, extra); },
    disc(map, a, b, r, fill) { return path(Array.from({length: 14}, (_, i) => map(a + r * Math.cos(i / 14 * 2 * Math.PI), b + r * Math.sin(i / 14 * 2 * Math.PI))), fill); },
    // Upright cylinder (only for the symmetric isometric axes).
    cyl(x, y, z, r, h, c, {top, cap = true, attrs = ''} = {}) {
      const [cx, cb] = P(x, y, z), [, ct] = P(x, y, z + h);
      const rx = Math.SQRT2 * r * ex[0] * s, ry = Math.SQRT2 * r * ex[1] * s;
      extend(cx - rx, ct - ry); extend(cx + rx, cb + ry);
      return `<g${attrs}><path d="M${r1(cx - rx)} ${r1(ct)}V${r1(cb)}A${r1(rx)} ${r1(ry)} 0 0 0 ${r1(cx + rx)} ${r1(cb)}V${r1(ct)}Z" fill="${gradient(c)}"/>` +
        (cap ? `<ellipse cx="${r1(cx)}" cy="${r1(ct)}" rx="${r1(rx)}" ry="${r1(ry)}" fill="${top ?? lit(c, .3)}"/>` : '') + '</g>';
    },
    ball(x, y, z, r, c, attrs = '') {
      const [cx, cy] = P(x, y, z), R = r * s;
      extend(cx - R, cy - R); extend(cx + R, cy + R);
      return `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(R)}" fill="${gradient(c, 'r')}"${attrs}/>`;
    },
    // Contact shadow on a surface at height z.
    shadow(x, y, z, w, d, spread = .35) {
      return path([P(x - spread, y - spread * .2, z), P(x + w + spread, y - spread * .2, z), P(x + w + spread, y + d + spread, z), P(x - spread * .2, y + d + spread, z)], '#05070f', ' opacity=".35"');
    },
    plinth(x, y, w, d, c = '#2c3653', h = .6) {
      return t.shadow(x, y, -h, w, d, .9) + t.box(x, y, -h, w, d, h, c, {top: lit(c, .1), right: shade(c, .45)});
    },
    tree(x, y, z, size = 1, c = '#5f8a5a') {
      return t.cyl(x, y, z, .12 * size, .9 * size, '#6b4a33', {cap: false}) + t.ball(x, y, z + 1.25 * size, .55 * size, c);
    },
  };
  return t;
}

// ---------- scenes ----------

function jenga(t) {
  const wood = ['#c99a63', '#d3a670', '#bf8d58', '#d9b27e', '#c4925f'];
  let out = t.plinth(-1.6, -1.6, 6.2, 6.2, '#3a3249');
  for (let layer = 0; layer < 18; layer++) {
    const z = layer * .6;
    for (let k = 0; k < 3; k++) {
      const c = wood[Math.floor(t.rand() * wood.length)];
      const pull = layer === 11 && k === 1 ? 1.7 : layer === 5 && k === 2 ? .5 : 0;
      const attrs = pull > 1 ? ' class="vault-pop" style="--i:0"' : '';
      out += layer % 2
        ? t.box(k + .03, pull, z, .94, 3, .58, c, {attrs})
        : t.box(pull, k + .03, z, 3, .94, .58, c, {attrs});
    }
  }
  return out;
}

function eiffel(t) {
  const iron = '#8b5d40';
  const profile = [[0, 30], [10, 22], [22, 16.5], [36, 13], [40, 12], [60, 8], [80, 5.5], [84, 5], [110, 3.3], [135, 2.2], [150, 1.8]];
  const half = z => { for (let i = 1; i < profile.length; i++) if (z <= profile[i][0]) { const [z0, a0] = profile[i - 1], [z1, a1] = profile[i]; return a0 + (a1 - a0) * (z - z0) / (z1 - z0); } return 1.8; };
  let out = t.plinth(-40, -40, 80, 80, '#2f3a4f', 4);
  for (const [x, y] of [[-34, 26], [26, -34], [24, 28], [-36, -36]]) out += t.tree(x, y, 0, 7, '#5d7f52');
  const face = (z0, z1, left, color) => {
    const a0 = half(z0), a1 = half(z1);
    const pts = left ? [t.P(-a0, a0, z0), t.P(a0, a0, z0), t.P(a1, a1, z1), t.P(-a1, a1, z1)] : [t.P(a0, -a0, z0), t.P(a0, a0, z0), t.P(a1, a1, z1), t.P(a1, -a1, z1)];
    let g = t.path(pts, color);
    const bays = Math.max(2, Math.round(a0 / 5));
    const lerp = (p, q, k) => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k];
    let d = '';
    for (let i = 0; i < bays; i++) {
      const b0 = lerp(pts[0], pts[1], i / bays), b1 = lerp(pts[0], pts[1], (i + 1) / bays);
      const u0 = lerp(pts[3], pts[2], i / bays), u1 = lerp(pts[3], pts[2], (i + 1) / bays);
      d += `M${t.pt(b0)}L${t.pt(u1)}M${t.pt(b1)}L${t.pt(u0)}`;
    }
    return g + `<path d="${d}M${t.pt(pts[3])}L${t.pt(pts[2])}" stroke="${shade(color, .5)}" stroke-width=".8" fill="none"/>`;
  };
  const arch = left => {
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const phi = Math.PI * i / 16, u = -Math.cos(phi) * 17, z = Math.sin(phi) * 19;
      const a = half(z);
      pts.push(left ? t.P(u, a, z) : t.P(a, -u, z));
    }
    return t.path(pts, BG, ' opacity=".92"');
  };
  const sections = [[0, 10], [10, 22], [22, 36], [40, 60], [60, 80], [84, 110], [110, 135], [135, 150]];
  for (const [z0, z1] of sections) {
    out += face(z0, z1, true, iron) + face(z0, z1, false, shade(iron, .3));
    if (z0 === 0) out += arch(true) + arch(false);
    if (z1 === 36) out += t.box(-15, -15, 36, 30, 30, 4, '#a7744f', {attrs: ' class="vault-pop" style="--i:1"'});
    if (z1 === 80) out += t.box(-7.5, -7.5, 80, 15, 15, 4, '#a7744f', {attrs: ' class="vault-pop" style="--i:2"'});
  }
  out += t.box(-2.6, -2.6, 150, 5.2, 5.2, 6, '#a7744f');
  out += `<g class="vault-pop" style="--i:3">${t.cyl(0, 0, 156, .7, 9, '#e9e1d2')}${t.cyl(0, 0, 165, .55, 5, '#c4533e')}${t.cyl(0, 0, 170, .35, 3, '#e9e1d2')}</g>`;
  return out;
}

function filmSaga(t) {
  let out = t.plinth(-5, -5, 10, 10, '#33304a');
  const bands = ['#9a6b4a', '#6f7f5a', '#8a5560', '#5a6f8a', '#a88a4a', '#6a5a80', '#7a6a55', '#4f6a66'];
  let z = 0, x = 0, y = 0;
  for (let i = 0; i < 8; i++) {
    x = (t.rand() - .5) * .7; y = (t.rand() - .5) * .7;
    out += `<g class="vault-pop" style="--i:${i}">${t.cyl(x, y, z, 3.1, .62, '#8e98ab')}${t.cyl(x, y, z + .22, 3.12, .16, bands[i], {cap: false})}</g>`;
    z += .66;
  }
  const top = z - .04;
  // Reel hub on the top tin.
  const [hx, hy] = t.P(x, y, top);
  out += `<ellipse cx="${r1(hx)}" cy="${r1(hy)}" rx="${r1(t.s * 1.1)}" ry="${r1(t.s * .64)}" fill="none" stroke="#6d7890" stroke-width="1.2"/>`;
  // Pointed hat on top of the stack.
  out += t.cyl(x, y, top, 2.6, .12, '#4a3a63');
  const [bx, by] = t.P(x, y, top + .12), tip = t.P(x + 1.4, y - 1.2, top + 7.4);
  const w = t.s * 2.6;
  out += `<path d="M${r1(bx - w)} ${r1(by)}Q${r1(bx - w * .35)} ${r1(by - w * 1.1)} ${t.pt(tip)}Q${r1(bx + w * .2)} ${r1(by - w)} ${r1(bx + w)} ${r1(by)}Q${r1(bx)} ${r1(by + w * .5)} ${r1(bx - w)} ${r1(by)}Z" fill="${t.gradient('#5a4677')}"/>`;
  out += `<path d="M${r1(bx - w * .93)} ${r1(by - w * .3)}Q${r1(bx)} ${r1(by + w * .12)} ${r1(bx + w * .93)} ${r1(by - w * .3)}L${r1(bx + w * .88)} ${r1(by - w * .55)}Q${r1(bx)} ${r1(by - w * .14)} ${r1(bx - w * .88)} ${r1(by - w * .55)}Z" fill="#c9a24e"/>`;
  // Film ribbon unspooling from the stack to the floor.
  const a = t.P(x + 2.2, y + 2.2, 3.2), b = t.P(8, 3, 4), c = t.P(2, 9, -2), d = t.P(7, 7, 0);
  const curve = k => { const m = 1 - k; return [0, 1].map(i => m * m * m * a[i] + 3 * m * m * k * b[i] + 3 * m * k * k * c[i] + k * k * k * d[i]); };
  const left = [], right = [], holes = [];
  const half = t.s * .55;
  for (let i = 0; i <= 40; i++) {
    const k = i / 40, p = curve(k), q = curve(Math.min(1, k + .01)), o = curve(Math.max(0, k - .01));
    const dx = q[0] - o[0], dy = q[1] - o[1], len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    left.push([p[0] + nx * half, p[1] + ny * half]); right.push([p[0] - nx * half, p[1] - ny * half]);
    if (i % 2 === 0) for (const side of [.72, -.72]) holes.push(`M${r1(p[0] + nx * half * side - 1)} ${r1(p[1] + ny * half * side - 1)}h2v2h-2Z`);
    if (i % 5 === 2) holes.push(`M${r1(p[0] - 2)} ${r1(p[1] - 1.6)}h4v3.2h-4Z`);
  }
  left.forEach(p => t.extend(...p)); right.forEach(p => t.extend(...p));
  out += `<path d="M${[...left, ...right.reverse()].map(t.pt).join('L')}Z" fill="#26232c" stroke="#3a3542" stroke-width=".8"/>`;
  out += `<path d="${holes.join('')}" fill="#d8b46a" opacity=".85"/>`;
  for (const [i, [sx, sy, sz]] of [[-4, 3, 9], [5, -5, 11], [-6, -2, 4]].entries()) {
    const [px, py] = t.P(sx, sy, sz);
    out += `<path class="vault-pop" style="--i:${i + 3}" d="M${r1(px)} ${r1(py - 5)}Q${r1(px + .8)} ${r1(py - .8)} ${r1(px + 5)} ${r1(py)}Q${r1(px + .8)} ${r1(py + .8)} ${r1(px)} ${r1(py + 5)}Q${r1(px - .8)} ${r1(py + .8)} ${r1(px - 5)} ${r1(py)}Q${r1(px - .8)} ${r1(py - .8)} ${r1(px)} ${r1(py - 5)}Z" fill="#efd9a0"/>`;
  }
  return out;
}

function marathon(t) {
  let out = t.plinth(0, 0, 9, 9, '#33433a');
  out += t.box(0, 0, 0, 9, 9, .05, '#5d7a54', {top: '#6b8a5e'});
  const route = [[0, 7], [5, 7], [5, 4], [1, 4], [1, 1], [7, 1]];
  const cells = [];
  for (let i = 1; i < route.length; i++) {
    const [x0, y0] = route[i - 1], [x1, y1] = route[i];
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let k = i === 1 ? 0 : 1; k <= n; k++) cells.push([x0 + Math.sign(x1 - x0) * k, y0 + Math.sign(y1 - y0) * k]);
  }
  for (const [x, y] of cells) {
    out += t.box(x, y, .05, 1, 1, .1, '#575c6e', {top: '#6a6f80'});
    const map = t.on([x, y, .15], [1, 0, 0], [0, 1, 0]);
    out += t.quad(map, .42, .2, .58, .5, '#e9dfc5', ' opacity=".8"');
  }
  const items = [];
  for (const [x, y] of [[7.6, 6.4], [8.2, 4.2], [3, 2.6], [.3, 2.4], [7.4, 8.2], [3.2, 5.6], [.4, .2]]) items.push([x + y, t.tree(x, y, .05, 1, ['#5f8a5a', '#6e9460', '#557d55'][Math.floor(t.rand() * 3)])]);
  for (const [i, [x, y]] of [[2.4, 6.6], [5.9, 5.6], [2.5, 3.6], [3.8, .6]].entries())
    items.push([x + y, `<g class="vault-pop" style="--i:${i}">${t.box(x, y, .05, .12, .12, 1.3, '#d8d0bd')}${t.box(x - .25, y, 1.05, .62, .1, .45, '#c9a24e')}</g>`]);
  // Water station.
  let table = t.box(6.2, 2.6, .05, 1.6, .7, .55, '#8b6b4b');
  for (let i = 0; i < 4; i++) table += t.cyl(6.45 + i * .37, 2.95, .6, .13, .25, '#e7e3da', {top: '#7fb6c9'});
  items.push([6.2 + 2.6, table]);
  // Finish arch with a checkered banner.
  let gate = t.box(7.3, .2, .15, .22, .22, 2.4, '#c8c0b0') + t.box(7.3, 1.6, .15, .22, .22, 2.4, '#c8c0b0');
  gate += t.box(7.25, .15, 2.1, .32, 1.7, .6, '#e6e0d0');
  const banner = t.on([7.57, .15, 2.1], [0, 1.7, 0], [0, 0, .6]);
  for (let i = 0; i < 8; i++) for (let j = 0; j < 3; j++) if ((i + j) % 2) gate += t.quad(banner, i / 8, j / 3, (i + 1) / 8, (j + 1) / 3, '#252a36');
  items.push([8.5, `<g class="vault-pop" style="--i:5">${gate}</g>`]);
  items.sort((a, b) => a[0] - b[0]);
  return out + items.map(([, svg]) => svg).join('');
}

function greatWall(t) {
  const path = [[0, 6], [1, 6], [2, 6], [2, 5], [2, 4], [3, 4], [4, 4], [5, 4], [5, 3], [5, 2], [6, 2], [7, 2], [8, 2]];
  const towers = new Set(['0,6', '2,6', '2,4', '5,4', '5,2', '8,2']);
  const onPath = new Map(path.map((p, i) => [p.join(), i]));
  const height = (x, y) => {
    const d = Math.min(...path.map(([px, py]) => Math.hypot(px - x, py - y)));
    return Math.max(.4, Math.round((.6 + 2.4 * Math.exp(-d * d / 3.2) + (x * 7 + y * 3) % 4 * .12) * 2) / 2);
  };
  const stone = '#cdb892';
  let out = t.shadow(0, 0, 0, 9, 9, .9);
  const cells = [];
  for (let x = 0; x < 9; x++) for (let y = 0; y < 9; y++) cells.push([x, y]);
  cells.sort((a, b) => a[0] + a[1] - b[0] - b[1] || a[0] - b[0]);
  for (const [x, y] of cells) {
    const h = height(x, y), key = `${x},${y}`;
    const grass = ['#6f8f5e', '#66875a', '#789a64'][(x * 5 + y * 3) % 3];
    out += t.box(x, y, 0, 1, 1, h, '#7d6248', {top: grass, left: '#7d6248', right: '#5d4836'});
    if (!onPath.has(key)) {
      if ((x * 13 + y * 7) % 9 === 0) out += t.tree(x + .5, y + .5, h, .55, '#4f7a4c');
      continue;
    }
    const i = onPath.get(key), links = [path[i - 1], path[i + 1]].filter(Boolean).map(([px, py]) => [px - x, py - y]);
    let wall = '';
    const seg = ([dx, dy]) => {
      const [x0, x1] = dx ? (dx < 0 ? [x, x + .5] : [x + .5, x + 1]) : [x + .34, x + .66];
      const [y0, y1] = dy ? (dy < 0 ? [y, y + .5] : [y + .5, y + 1]) : [y + .34, y + .66];
      let g = t.box(x0, y0, h, x1 - x0, y1 - y0, .55, stone);
      const n = 2;
      for (let k = 0; k < n; k++) {
        g += dx ? t.box(x0 + k * .25 + .03, y1 - .1, h + .55, .13, .1, .14, stone) : t.box(x1 - .1, y0 + k * .25 + .03, h + .55, .1, .13, .14, stone);
      }
      return g;
    };
    const back = links.filter(([dx, dy]) => dx < 0 || dy < 0), front = links.filter(([dx, dy]) => dx > 0 || dy > 0);
    wall += back.map(seg).join('');
    if (towers.has(key)) {
      let tower = t.box(x + .14, y + .14, h, .72, .72, 1.35, stone, {right: shade(stone, .38)});
      const lf = t.on([x + .14, y + .86, h], [.72, 0, 0], [0, 0, 1.35]), rf = t.on([x + .86, y + .14, h], [0, .72, 0], [0, 0, 1.35]);
      tower += t.quad(lf, .38, .45, .62, .78, '#2a2520') + t.quad(rf, .38, .45, .62, .78, '#221d18');
      for (const [mx, my] of [[0, 0], [.52, 0], [0, .52], [.52, .52], [.26, .58], [.58, .26]]) tower += t.box(x + .14 + mx, y + .14 + my, h + 1.35, .2, .2, .16, stone);
      wall += `<g class="vault-pop" style="--i:${[...towers].indexOf(key)}">${tower}</g>`;
    } else if (!front.length || !back.length || front.length + back.length < 2) {
      wall += t.box(x + .34, y + .34, h, .32, .32, .55, stone);
    } else {
      const corner = front.length === 1 && back.length === 1 && front[0][0] !== -back[0][0];
      if (corner) wall += t.box(x + .34, y + .34, h, .32, .32, .55, stone);
    }
    wall += front.map(seg).join('');
    out += wall;
  }
  return out;
}

function lunar(t) {
  let out = t.plinth(-3, -3, 6.5, 6.5, '#2f3550');
  out += t.cyl(0, 0, 0, 1.3, .35, '#5b4332') + t.cyl(0, 0, .35, .14, 1.1, '#b8944f');
  const [ex, ey] = t.P(0, 0, 3.75), R = 2.25 * t.s;
  t.extend(ex - R, ey - R); t.extend(ex + R, ey + R);
  out += `<defs><clipPath id="vs-earth"><circle cx="${r1(ex)}" cy="${r1(ey)}" r="${r1(R)}"/></clipPath></defs>`;
  out += `<circle cx="${r1(ex)}" cy="${r1(ey)}" r="${r1(R)}" fill="${t.gradient('#3f6c9e', 'r')}"/>`;
  const land = [
    `M${r1(ex - R * .7)} ${r1(ey - R * .45)}q${r1(R * .25)} ${r1(-R * .3)} ${r1(R * .55)} ${r1(-R * .12)}t${r1(R * .2)} ${r1(R * .4)}q${r1(-R * .1)} ${r1(R * .35)} ${r1(-R * .4)} ${r1(R * .3)}t${r1(-R * .38)} ${r1(-R * .55)}Z`,
    `M${r1(ex + R * .05)} ${r1(ey + R * .05)}q${r1(R * .4)} ${r1(-R * .2)} ${r1(R * .62)} ${r1(R * .1)}t${r1(-R * .05)} ${r1(R * .5)}q${r1(-R * .3)} ${r1(R * .25)} ${r1(-R * .45)} ${r1(-R * .05)}t${r1(-R * .12)} ${r1(-R * .55)}Z`,
    `M${r1(ex - R * .55)} ${r1(ey + R * .35)}q${r1(R * .2)} ${r1(-R * .08)} ${r1(R * .3)} ${r1(R * .15)}t${r1(-R * .1)} ${r1(R * .3)}q${r1(-R * .25)} ${r1(R * .05)} ${r1(-R * .2)} ${r1(-R * .45)}Z`,
  ];
  out += `<g clip-path="url(#vs-earth)"><path d="${land.join('')}" fill="#7c9a5e" opacity=".9"/><path d="M${r1(ex - R)} ${r1(ey - R * .1)}q${r1(R * .6)} ${r1(-R * .25)} ${r1(R * 1.2)} ${r1(-R * .05)}M${r1(ex - R * .2)} ${r1(ey + R * .62)}q${r1(R * .5)} ${r1(-R * .15)} ${r1(R)} ${r1(R * .05)}" stroke="#eef0f2" stroke-width="2.2" stroke-linecap="round" fill="none" opacity=".55"/><circle cx="${r1(ex + R * .55)}" cy="${r1(ey + R * .45)}" r="${r1(R * 1.05)}" fill="#0c1124" opacity=".38"/></g>`;
  out += `<path d="M${r1(ex - R * 1.12)} ${r1(ey + R * .5)}A${r1(R * 1.14)} ${r1(R * 1.14)} 0 1 1 ${r1(ex + R * .2)} ${r1(ey + R * 1.13)}" stroke="#b8944f" stroke-width="2.2" fill="none"/>`;
  // Tape measure case on the plinth and the tape reaching the Moon.
  out += t.box(1.6, 1.3, 0, 1.3, 1.1, 1.2, '#d2a33f', {attrs: ' class="vault-pop" style="--i:0"'});
  const lf = t.on([1.6, 2.4, 0], [1.3, 0, 0], [0, 0, 1.2]);
  out += t.disc(lf, .5, .5, .28, '#2a2a33');
  const [mx, my] = t.P(9, -6, 16), MR = 1.15 * t.s;
  t.extend(mx - MR, my - MR); t.extend(mx + MR, my + MR);
  const a = t.P(2.9, 1.8, .9), c = [mx - MR * .9, my + MR * .4], b = [a[0] + 70, a[1] - 5];
  const tape = `M${t.pt(a)}Q${t.pt(b)} ${t.pt(c)}`;
  out += `<path class="vault-pop" style="--i:1" d="${tape}" stroke="#e1b84f" stroke-width="5" fill="none"/><path d="${tape}" stroke="#3a3020" stroke-width="5" stroke-dasharray=".8 4.2" fill="none" opacity=".7"/>`;
  out += `<defs><clipPath id="vs-moon"><circle cx="${r1(mx)}" cy="${r1(my)}" r="${r1(MR)}"/></clipPath></defs><g class="vault-pop" style="--i:2"><circle cx="${r1(mx)}" cy="${r1(my)}" r="${r1(MR)}" fill="${t.gradient('#bdb8ad', 'r')}"/><g clip-path="url(#vs-moon)" fill="#8d887d"><circle cx="${r1(mx - MR * .3)}" cy="${r1(my - MR * .25)}" r="${r1(MR * .22)}"/><circle cx="${r1(mx + MR * .25)}" cy="${r1(my + MR * .3)}" r="${r1(MR * .16)}"/><circle cx="${r1(mx + MR * .35)}" cy="${r1(my - MR * .4)}" r="${r1(MR * .1)}"/><circle cx="${r1(mx + MR * .6)}" cy="${r1(my + MR * .5)}" r="${r1(MR * .9)}" fill="#0c1124" opacity=".4"/></g></g>`;
  for (const [x, y, r] of [[-6, -6, 1.2], [4, -9, .9], [12, -2, 1], [-2, -11, .8], [14, -11, 1.1]]) {
    const [sx, sy] = t.P(x, y, 12);
    out += `<circle cx="${r1(sx)}" cy="${r1(sy)}" r="${r}" fill="#e9dfc2" opacity=".55"/>`;
  }
  return out;
}

function boardGame(t) {
  let out = t.shadow(0, 0, -.5, 11, 11, .8) + t.box(0, 0, -.5, 11, 11, .5, '#3e5a4b', {top: '#d9d0b6'});
  const groups = ['#8a5a44', '#8fb8c9', '#b9708f', '#d08a4c', '#b8483e', '#d9b44a', '#4f8a5b', '#3f5591'];
  const marked = {1: 0, 3: 0, 6: 1, 8: 1, 9: 1};
  const cells = [];
  for (let i = 0; i < 11; i++) for (let j = 0; j < 11; j++) if (i === 0 || j === 0 || i === 10 || j === 10) cells.push([i, j]);
  cells.sort((a, b) => a[0] + a[1] - b[0] - b[1]);
  let index = 0;
  for (const [x, y] of cells) {
    const corner = (x === 0 || x === 10) && (y === 0 || y === 10);
    const c = corner ? '#c9bd9c' : '#e6dec8';
    out += `<g class="vault-pop" style="--i:${index++ % 14}">${t.box(x + .04, y + .04, 0, .92, .92, .12, c, {top: c})}`;
    let side, pos;
    if (y === 10 && !corner) { side = 0; pos = x; } else if (x === 0 && !corner) { side = 1; pos = 10 - y; } else if (y === 0 && !corner) { side = 2; pos = 10 - x; } else if (x === 10 && !corner) { side = 3; pos = y; }
    if (side !== undefined && pos in marked) {
      const color = groups[side * 2 + marked[pos]];
      const map = t.on([x + .04, y + .04, .12], [.92, 0, 0], [0, .92, 0]);
      const [a0, b0, a1, b1] = [[0, 0, 1, .3], [.7, 0, 1, 1], [0, .7, 1, 1], [0, 0, .3, 1]][side];
      out += t.quad(map, a0, b0, a1, b1, color);
    }
    out += '</g>';
  }
  const pips = {1: [[.5, .5]], 2: [[.28, .28], [.72, .72]], 3: [[.25, .25], [.5, .5], [.75, .75]], 5: [[.25, .25], [.75, .25], [.5, .5], [.25, .75], [.75, .75]], 6: [[.27, .22], [.27, .5], [.27, .78], [.73, .22], [.73, .5], [.73, .78]], 4: [[.28, .28], [.72, .28], [.28, .72], [.72, .72]]};
  const die = (x, y, z, n, faces, i) => {
    let g = t.box(x, y, z, n, n, n, '#efe9dc', {right: '#bdb5a3', top: '#fbf8f0'});
    const maps = [t.on([x, y, z + n], [n, 0, 0], [0, n, 0]), t.on([x, y + n, z], [n, 0, 0], [0, 0, n]), t.on([x + n, y, z], [0, n, 0], [0, 0, n])];
    faces.forEach((f, k) => { for (const [a, b] of pips[f]) g += t.disc(maps[k], a, b, .09, '#2d2a33'); });
    return `<g class="vault-pop" style="--i:${i}">${g}</g>`;
  };
  const house = (x, y, w, d, h, c, i) => {
    const roof = h * .6;
    let g = t.box(x, y, 0, w, d, h, c);
    g += t.path([t.P(x, y + d, h), t.P(x + w, y + d, h), t.P(x + w, y + d / 2, h + roof), t.P(x, y + d / 2, h + roof)], lit(c, .1));
    g += t.path([t.P(x + w, y, h), t.P(x + w, y + d, h), t.P(x + w, y + d / 2, h + roof)], shade(c, .3));
    return `<g class="vault-pop" style="--i:${i}">${g}</g>`;
  };
  out += house(6.6, 2.6, .9, .9, .8, '#4f8a5b', 2) + house(7.6, 2.6, .9, .9, .8, '#4f8a5b', 3);
  out += die(3.6, 4, 0, 1.4, [5, 3, 2], 0) + die(5.6, 5.4, 0, 1.4, [6, 1, 4], 1);
  out += house(2.6, 7, 1.6, .95, 1.1, '#b8483e', 4);
  return out;
}

function piano(t) {
  let out = t.shadow(-1.5, -4, -6, 55, 14, 1);
  for (const x of [1, 50]) out += t.box(x, 5, -6, 1.6, 1.6, 4.6, '#2a2324');
  out += t.box(-1.5, -4, -1.6, 55, 14, 1.6, '#3b2c2b', {top: '#4d3a37'});
  out += t.box(-1.5, -4, 0, 55, 3, 3.6, '#3b2c2b', {top: '#56423e'});
  const sheet = t.on([16, -1, .5], [20, 0, 0], [0, 0, 2.6]);
  out += t.quad(sheet, 0, 0, 1, 1, '#e8e0cc');
  let lines = '';
  for (let i = 0; i < 4; i++) { const p = sheet(.06, .2 + i * .2), q = sheet(.94, .2 + i * .2); lines += `M${t.pt(p)}L${t.pt(q)}`; }
  out += `<path d="${lines}" stroke="#7a6f5e" stroke-width=".6"/>`;
  out += t.box(-1.5, -1, 0, 1.2, 10.6, 1.4, '#3b2c2b') + t.box(52.3, -1, 0, 1.2, 10.6, 1.4, '#3b2c2b');
  const names = 'ABCDEFG';
  let whites = '', blacks = '';
  for (let i = 0; i < 52; i++) {
    whites += t.box(i + .04, -1, 0, .92, 10, .7, '#efe9dc', {top: '#faf7ef', right: '#b9b1a0', attrs: ` class="vault-pop" style="--i:${i % 12}"`});
    if (i < 51 && 'ACDFG'.includes(names[i % 7])) blacks += t.box(i + .7, -1, .7, .6, 6, .75, '#1e1b20', {top: '#38333a', right: '#121014'});
  }
  return out + whites + blacks;
}

function tvSeries(t) {
  let out = t.plinth(-1, -1, 10, 8, '#3a3141');
  out += t.box(-1, -1, 0, 10, 8, .05, '#5a4636', {top: '#7a5a3f'});
  // Cabinet and TV.
  out += t.box(0, 0, .05, 4.2, 3.4, 1.3, '#4a3a30');
  out += t.box(.2, .2, 1.35, 3.8, 3, 3, '#8a5a3c', {top: '#a8744f'});
  const screen = t.on([.2, 3.2, 1.35], [3.8, 0, 0], [0, 0, 3]);
  out += t.quad(screen, .06, .12, .7, .9, '#1b1a20');
  const bars = ['#cfcac0', '#d6c35a', '#62b5b5', '#6aa05a', '#a2588f', '#b9473f', '#4a5f9a'];
  bars.forEach((c, i) => { out += t.quad(screen, .09 + i * .085, .2, .09 + (i + 1) * .085, .84, c, ` class="vault-pop" style="--i:${i}"`); });
  out += t.quad(screen, .09, .16, .685, .2, '#2b2a33');
  out += t.disc(screen, .82, .7, .05, '#d8c79a') + t.disc(screen, .82, .45, .05, '#d8c79a');
  for (let i = 0; i < 5; i++) out += t.quad(screen, .77, .14 + i * .04, .9, .155 + i * .04, '#5a3a28');
  const [ax, ay] = t.P(2.1, 1.7, 4.35);
  const ends = [[ax - 26, ay - 30], [ax + 22, ay - 34]];
  ends.forEach(p => t.extend(...p));
  out += `<path d="M${r1(ax)} ${r1(ay)}L${t.pt(ends[0])}M${r1(ax)} ${r1(ay)}L${t.pt(ends[1])}" stroke="#bfb7a6" stroke-width="1.4"/>` + ends.map(([x, y]) => `<circle cx="${r1(x)}" cy="${r1(y)}" r="2" fill="#d8cfbd"/>`).join('');
  out += `<ellipse cx="${r1(ax)}" cy="${r1(ay)}" rx="5" ry="2.6" fill="#3a3030"/>`;
  // Ten tapes, one per season.
  const spines = ['#3f5591', '#b8483e', '#d9b44a', '#4f8a5b', '#8a5a44', '#7a6aa0', '#d08a4c', '#4a7f86', '#b9708f', '#6b7a52'];
  spines.forEach((c, i) => {
    const z = .05 + i * .42, dx = (t.rand() - .5) * .3;
    let tape = t.box(5.2 + dx, .7, z, 2.3, 3.6, .38, '#24222a', {top: '#33313a'});
    const spine = t.on([5.2 + dx, 4.3, z], [2.3, 0, 0], [0, 0, .38]);
    tape += t.quad(spine, .08, .18, .92, .82, c);
    out += `<g class="vault-pop" style="--i:${i}">${tape}</g>`;
  });
  // Mug with steam.
  out += t.cyl(3.2, 5.4, .05, .55, 1, '#c9a24e', {top: '#3a2618'});
  const [hx, hy] = t.P(3.75, 5.4, .55);
  out += `<path d="M${r1(hx)} ${r1(hy - 5)}q7 1 6 6t-6 4" stroke="#a8843a" stroke-width="2.2" fill="none"/>`;
  const [sx, sy] = t.P(3.2, 5.4, 1.2);
  out += `<path class="vault-pop" style="--i:3" d="M${r1(sx - 3)} ${r1(sy - 2)}q-4 -6 0 -11t0 -11M${r1(sx + 3)} ${r1(sy - 3)}q-4 -6 0 -10t0 -10" stroke="#e8e1d1" stroke-width="1.6" stroke-linecap="round" fill="none" opacity=".55"/>`;
  t.extend(sx - 8, sy - 26);
  return out;
}

function periodic(t) {
  const cells = [];
  const add = (x, y, block) => cells.push([x, y, block]);
  add(0, 0, 's'); add(17, 0, 'p');
  for (const y of [1, 2]) { add(0, y, 's'); add(1, y, 's'); for (let x = 12; x < 18; x++) add(x, y, 'p'); }
  for (const y of [3, 4]) for (let x = 0; x < 18; x++) add(x, y, x < 2 ? 's' : x < 12 ? 'd' : 'p');
  for (const y of [5, 6]) for (let x = 0; x < 18; x++) if (x !== 2) add(x, y, x < 2 ? 's' : x < 12 ? 'd' : 'p');
  for (const y of [7.6, 8.6]) for (let x = 2; x < 17; x++) add(x, y, 'f');
  const colors = {s: '#c8775a', p: '#d6b25a', d: '#7f9f86', f: '#7b89b8'};
  const heights = {s: 1.1, p: .8, d: .6, f: .45};
  let out = t.shadow(-.6, -.6, -.5, 19.2, 10.8, .8) + t.box(-.6, -.6, -.5, 19.2, 10.8, .5, '#2b3350', {top: '#343d5c'});
  cells.sort((a, b) => a[0] + a[1] - b[0] - b[1] || a[0] - b[0]);
  cells.forEach(([x, y, block], i) => {
    const h = heights[block] + ((x * 7 + y * 3) % 5) * .06;
    out += `<g class="vault-pop" style="--i:${(x + Math.floor(y)) % 14}">${t.box(x + .07, y + .07, 0, .86, .86, h, colors[block])}</g>`;
  });
  return out;
}

function skeleton(t) {
  let out = t.shadow(-2, -2, 0, 4, 4, .6);
  out += t.box(-2, -.35, 0, 4, .7, .35, '#4a4a52') + t.box(-.35, -2, 0, .7, 4, .35, '#4a4a52');
  out += t.cyl(0, 0, .35, .45, .5, '#5a5a63');
  const [fx, fy] = t.P(0, 0, .85);
  const top = fy - 210;
  t.extend(fx - 40, top - 14);
  out += `<path d="M${r1(fx - 2.2)} ${r1(fy)}V${r1(top - 6)}h4.4V${r1(fy)}Z" fill="${t.gradient('#9a9aa3')}"/>`;
  out += `<path d="M${r1(fx)} ${r1(top - 6)}q0 -8 -8 -8h-4" stroke="#9a9aa3" stroke-width="3" fill="none"/>`;
  const ox = fx - 12, oy = top;
  const X = x => r1(ox + x), Y = y => r1(oy + y);
  const ivory = '#e5dac0', edge = '#6e624c';
  const fill = t.gradient(ivory);
  const bone = (x1, y1, x2, y2, w) => {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len, k = w * .32;
    const knobs = [[x1, y1], [x2, y2]].flatMap(([x, y]) => [[x + nx * k, y + ny * k], [x - nx * k, y - ny * k]]);
    t.extend(ox + x1 - w, oy + y1 - w); t.extend(ox + x2 + w, oy + y2 + w);
    return `<path d="M${X(x1 + nx * k)} ${Y(y1 + ny * k)}L${X(x2 + nx * k)} ${Y(y2 + ny * k)}L${X(x2 - nx * k)} ${Y(y2 - ny * k)}L${X(x1 - nx * k)} ${Y(y1 - ny * k)}Z" fill="${fill}" stroke="${edge}" stroke-width=".7"/>` +
      knobs.map(([x, y]) => `<circle cx="${X(x)}" cy="${Y(y)}" r="${r1(w * .5)}" fill="${ivory}" stroke="${edge}" stroke-width=".7"/>`).join('');
  };
  let g = '';
  // Legs and pelvis.
  for (const s of [-1, 1]) {
    g += bone(s * 8, 102, s * 10, 145, 5) + bone(s * 9.2, 149, s * 9.6, 190, 3.6) + bone(s * 12.4, 150, s * 12.2, 188, 2);
    g += `<circle cx="${X(s * 10)}" cy="${Y(147)}" r="3" fill="${ivory}" stroke="${edge}" stroke-width=".7"/>`;
    g += `<path d="M${X(s * 7)} ${Y(192)}l${s * 9} 3l${s * 1} 3h${-s * 11}Z" fill="${ivory}" stroke="${edge}" stroke-width=".7"/>`;
  }
  g += `<path d="M${X(-3)} ${Y(90)}C${X(-18)} ${Y(84)} ${X(-20)} ${Y(98)} ${X(-12)} ${Y(104)}L${X(-3)} ${Y(110)}H${X(3)}L${X(12)} ${Y(104)}C${X(20)} ${Y(98)} ${X(18)} ${Y(84)} ${X(3)} ${Y(90)}Z" fill="${fill}" stroke="${edge}" stroke-width=".8"/>`;
  g += `<path d="M${X(-4)} ${Y(104)}Q${X(0)} ${Y(98)} ${X(4)} ${Y(104)}" stroke="${edge}" stroke-width=".8" fill="none"/>`;
  // Spine.
  for (let i = 0; i < 17; i++) g += `<rect x="${X(-2.6)}" y="${Y(27 + i * 3.7)}" width="5.2" height="3" rx="1.2" fill="${ivory}" stroke="${edge}" stroke-width=".6"/>`;
  // Ribs.
  for (let i = 0; i < 7; i++) {
    const y = 38 + i * 6, w = 15 - Math.abs(i - 2.4) * 1.3;
    for (const s of [-1, 1]) {
      const d = `M${X(s * 2.5)} ${Y(y)}C${X(s * (w + 3))} ${Y(y - 3)} ${X(s * (w + 2))} ${Y(y + 9)} ${X(s * 3.5)} ${Y(y + 10 - i * .6)}`;
      g += `<path d="${d}" stroke="${edge}" stroke-width="3.4" fill="none" stroke-linecap="round"/><path d="${d}" stroke="${ivory}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    }
  }
  g += `<rect x="${X(-1.8)}" y="${Y(37)}" width="3.6" height="30" rx="1.6" fill="${fill}" stroke="${edge}" stroke-width=".7"/>`;
  // Shoulders and arms.
  for (const s of [-1, 1]) {
    g += bone(s * 3, 35, s * 17, 33, 2.6);
    g += bone(s * 19, 36, s * 23, 70, 4.2) + bone(s * 22.6, 74, s * 26, 102, 2.4) + bone(s * 25, 74, s * 28.6, 101, 2.2);
    for (let f = 0; f < 4; f++) g += `<path d="M${X(s * (25 + f * 1.4))} ${Y(104)}l${s * (f * .5)} 11" stroke="${edge}" stroke-width="2.2" stroke-linecap="round"/><path d="M${X(s * (25 + f * 1.4))} ${Y(104)}l${s * (f * .5)} 11" stroke="${ivory}" stroke-width="1.2" stroke-linecap="round"/>`;
    g += `<ellipse cx="${X(s * 26.8)}" cy="${Y(104)}" rx="4" ry="2.6" fill="${ivory}" stroke="${edge}" stroke-width=".7"/>`;
  }
  // Skull.
  g += `<path d="M${X(-7)} ${Y(17)}Q${X(-7)} ${Y(27)} ${X(0)} ${Y(28)}Q${X(7)} ${Y(27)} ${X(7)} ${Y(17)}Z" fill="${fill}" stroke="${edge}" stroke-width=".8"/>`;
  g += `<path d="M${X(-4.5)} ${Y(22)}H${X(4.5)}" stroke="${edge}" stroke-width=".7" stroke-dasharray="1.2 .8"/>`;
  g += `<ellipse cx="${X(0)}" cy="${Y(10)}" rx="10.5" ry="11" fill="${t.gradient(ivory, 'r')}" stroke="${edge}" stroke-width=".8"/>`;
  g += `<ellipse cx="${X(-4)}" cy="${Y(12)}" rx="2.9" ry="3.3" fill="#2a2620"/><ellipse cx="${X(4)}" cy="${Y(12)}" rx="2.9" ry="3.3" fill="#2a2620"/><path d="M${X(-1.2)} ${Y(18)}L${X(0)} ${Y(15.5)}L${X(1.2)} ${Y(18)}Z" fill="#2a2620"/>`;
  return out + `<g class="vault-pop" style="--i:0">${g}</g>`;
}

function terracotta(t) {
  const earth = '#7a5236';
  let out = t.plinth(-.5, -.8, 9.2, 8.4, '#4a3426', .7);
  out += t.box(-.5, -.8, 0, 9.2, 8.4, .05, earth, {top: '#8d6242'});
  const corridors = [0, 2, 4, 6];
  const clay = ['#b4795a', '#a86d50', '#be8667', '#ae7556'];
  const warrior = (x, y, i) => {
    const c = clay[i % 4];
    let g = t.box(x - .2, y - .12, .05, .16, .24, .75, shade(c, .1)) + t.box(x + .04, y - .12, .05, .16, .24, .75, shade(c, .1));
    g += t.box(x - .27, y - .18, .8, .54, .36, .82, c);
    const armor = t.on([x - .27, y + .18, .8], [.54, 0, 0], [0, 0, .82]);
    for (let k = 0; k < 3; k++) g += t.quad(armor, .08, .25 + k * .22, .92, .3 + k * .22, shade(c, .25));
    g += t.box(x + .27, y - .1, .95, .12, .2, .62, c);
    g += t.cyl(x, y, 1.62, .1, .1, c);
    g += t.ball(x, y, 1.86, .19, lit(c, .08)) + t.ball(x - .04, y - .04, 2.08, .07, shade(c, .2));
    return `<g class="vault-warrior" style="--i:${i}">${g}</g>`;
  };
  let n = 0;
  out += t.box(-.5, -.8, .05, 9.2, .5, .7, earth, {top: '#946a48'});
  corridors.forEach((y, row) => {
    for (let i = 0; i < 6; i++) out += warrior(.8 + i * 1.4 + (row % 2) * .35, y + .55, n++);
    if (row < 3) out += t.box(-.5, y + 1.25, .05, 9.2, .6, .7, earth, {top: '#946a48'});
  });
  out += `<g class="vault-dust" fill="#d9a77c">${[[2, 7.4], [5, 7.2], [7.5, 7.6]].map(([x, y]) => { const [sx, sy] = t.P(x, y, .3); return `<ellipse cx="${r1(sx)}" cy="${r1(sy)}" rx="12" ry="3"/>`; }).join('')}</g>`;
  return out;
}

const scenes = {
  'jenga-tower': {draw: jenga, s: 10, seed: 7},
  eiffel: {draw: eiffel, s: 1, seed: 2},
  'film-saga': {draw: filmSaga, s: 9, seed: 11},
  marathon: {draw: marathon, s: 10, seed: 5},
  'great-wall': {draw: greatWall, s: 10, seed: 3},
  lunar: {draw: lunar, s: 9, seed: 4},
  'board-game': {draw: boardGame, s: 10, seed: 6},
  piano: {draw: piano, s: 5, ex: [.95, .2], ey: [-.42, .3], seed: 8},
  'tv-series': {draw: tvSeries, s: 10, seed: 9},
  periodic: {draw: periodic, s: 12, ex: [.95, .14], ey: [-.32, .42], seed: 10},
  skeleton: {draw: skeleton, s: 9, seed: 12},
  'terracotta-army': {draw: terracotta, s: 10, seed: 13},
};

export const vaultEffects = Object.keys(scenes);

function openingTiles() {
  const tiles = Array.from({length: 36}, (_, i) => { const x = i % 6, y = Math.floor(i / 6); return `<rect style="--i:${(x + y) * 3 + i % 3}" x="${x * 23}" y="${y * 23}" width="22" height="22" rx="1.2" fill="${(x + y) % 2 ? '#e8cb77' : '#667aa3'}" opacity="${x === y || (x < 2 && y < 2) ? '.7' : '.28'}"/>`; }).join('');
  return `<g class="vault-opening-tiles" transform="translate(160 96) matrix(1 .32 -1 .32 0 0)">${tiles}</g>`;
}

export function vaultArt(effect, first) {
  const scene = scenes[effect];
  const t = toolkit(scene);
  const body = scene.draw(t);
  const {x0, y0, x1, y1} = t.bounds;
  const k = Math.min(296 / (x1 - x0), 180 / (y1 - y0));
  const tx = 160 - (x0 + x1) / 2 * k, ty = 97 - (y0 + y1) / 2 * k;
  return `<svg viewBox="0 0 320 194" fill="none" aria-hidden="true">
    <defs>${[...t.defs.values()].join('')}<radialGradient id="vs-glow"><stop stop-color="#f3d9a4" stop-opacity=".16"/><stop offset="1" stop-color="#f3d9a4" stop-opacity="0"/></radialGradient></defs>
    <ellipse cx="150" cy="88" rx="150" ry="92" fill="url(#vs-glow)"/>
    ${first ? openingTiles() : ''}
    <g class="vault-object"><g transform="translate(${r1(tx)} ${r1(ty)}) scale(${Math.round(k * 1000) / 1000})">${body}</g></g>
  </svg>`;
}

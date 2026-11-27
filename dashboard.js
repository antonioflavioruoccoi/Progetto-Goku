// Dashboard: evidenzia la pagina aperta nel menu e fa cadere una mascotte se tieni premuto il logo.
import { createSprite, W } from './mascot.js';

const app = document.getElementById('app');
const logo = document.querySelector('#app > header h1');
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const vibrate = pattern => navigator.vibrate?.(pattern);

for (const a of document.querySelectorAll('#app nav a'))
  if (new URL(a.href).pathname === location.pathname) a.setAttribute('aria-current', 'page');

const MASCOTS = [
  { kind: 'biscotto', name: 'Biscotto', lines: ['Ciao! Sono Biscotto.', 'Domanda da cento punti?', 'Croccante di cultura!', 'Ehi, mi fai il solletico!'] },
  { kind: 'cervello', name: 'Cervello', lines: ['Ciao! Sono Cervello.', 'Mi è venuta un’idea!', 'Pronto per il quiz?', 'Allenami con una domanda!'] },
];
const HOLD_MS = 650, LIFE_MS = 35000;
let holdTimer = 0, current = null;

const inRoom = () => document.body.matches('.host, .player');
const stopHold = () => { clearTimeout(holdTimer); logo?.classList.remove('is-charging'); };

logo?.addEventListener('pointerdown', e => {
  if (inRoom() || e.button > 0) return;
  stopHold();
  logo.classList.add('is-charging');
  holdTimer = setTimeout(summon, HOLD_MS);
});
for (const type of ['pointerup', 'pointerleave', 'pointercancel']) logo?.addEventListener(type, stopHold);
logo?.addEventListener('contextmenu', e => e.preventDefault());

app.addEventListener('animationend', e => { if (e.target === app) app.classList.remove('is-quaking'); });

// 1) in partita la mascotte sparisce (l'ingresso in stanza non ricarica la pagina)
new MutationObserver(() => { if (inRoom()) current?.destroy(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

function summon() {
  stopHold();
  vibrate([40, 30, 90]);
  if (!reduce.matches) {
    app.classList.remove('is-quaking');
    void app.offsetWidth; // riavvia l'animazione anche se il terremoto è ancora in corso
    app.classList.add('is-quaking');
  }
  current?.destroy();
  current = createMascot(MASCOTS[Math.floor(Math.random() * MASCOTS.length)]);
}

function createMascot(m) {
  // pixel interi: 2× sul telefono, 3× sugli schermi grandi
  const scale = innerWidth >= 900 ? 3 : 2;
  const speed = 34 * scale, stride = 40 * scale; // px al secondo; px per un passo completo (due appoggi)
  const sprite = createSprite(m.kind);
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'mascot';
  el.dataset.mascot = m.kind;
  el.style.setProperty('--s', scale);
  el.setAttribute('aria-label', `Saluta ${m.name}`);
  const body = document.createElement('span');
  body.className = 'mascot-body';
  sprite.canvas.style.width = `${W * scale}px`;
  const bubble = document.createElement('span');
  bubble.className = 'mascot-bubble';
  bubble.setAttribute('role', 'status');
  body.append(sprite.canvas);
  el.append(body, bubble);
  document.body.append(el);

  const width = () => el.offsetWidth;
  let x = Math.random() * Math.max(0, innerWidth - width());
  let dir = Math.random() < .5 ? -1 : 1, ready = false, leaving = false, last = 0, raf = 0, phase = 0;
  // stato della posa: fall, land, wake, walk, idle, wave; stateUntil > 0 = torna a camminare a quell'ora
  let state = reduce.matches ? 'idle' : 'fall', stateUntil = 0;
  let lineIndex = 0, bubbleTimer = 0;
  const timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const rest = () => (reduce.matches ? 'idle' : 'walk');
  const setState = (s, ms = 0) => { state = s; stateUntil = ms ? performance.now() + ms : 0; };
  const place = () => {
    el.style.transform = `translateX(${x}px)`;
    el.style.setProperty('--dir', dir);
    const edge = x < 70 ? 'left' : x > innerWidth - width() - 70 ? 'right' : '';
    if (el.dataset.edge !== (edge || undefined)) edge ? (el.dataset.edge = edge) : delete el.dataset.edge;
  };
  place();
  const onResize = () => { if (!leaving) { x = Math.min(Math.max(x, 0), Math.max(0, innerWidth - width())); place(); } };
  addEventListener('resize', onResize);

  const step = t => {
    const dt = last ? Math.min(t - last, 50) / 1000 : 0;
    last = t;
    if (stateUntil && t >= stateUntil) setState(rest());
    if (state === 'walk') {
      const dx = speed * dt;
      x += dir * dx;
      phase += dx / stride * 2 * Math.PI; // le gambe seguono la strada fatta: i piedi non scivolano
      const max = innerWidth - width();
      if (!leaving && (x <= 0 || x >= max)) { x = Math.min(Math.max(x, 0), max); dir = -dir; }
      if (!leaving && Math.random() < dt / 5) setState('idle', 900 + Math.random() * 1100);
      if (leaving && (x < -width() || x > innerWidth)) return destroy();
      place();
    }
    sprite.draw({ state, phase, time: reduce.matches ? 0 : t / 1000, blink: t % 3700 < 140 });
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);

  const begin = () => {
    ready = true;
    el.classList.add('is-ready');
    setState(rest());
  };

  // Cade agitando braccia e gambe, atterra schiacciandosi, si accende e parte.
  if (reduce.matches) later(() => { say(m.lines[0]); begin(); }, 300);
  else {
    body.addEventListener('animationend', () => {
      setState('land');
      el.classList.add('is-landed');
      vibrate(25);
      later(() => { el.classList.remove('is-landed'); el.classList.add('is-awake'); setState('wake'); say(m.lines[0]); }, 450);
      later(() => { el.classList.remove('is-awake'); begin(); }, 1150);
    }, { once: true });
  }

  function say(text) {
    clearTimeout(bubbleTimer);
    bubble.textContent = text;
    bubble.classList.add('is-on');
    bubbleTimer = setTimeout(() => bubble.classList.remove('is-on'), 2200);
  }

  el.addEventListener('click', () => {
    if (!ready || leaving) return;
    vibrate(20);
    lineIndex = (lineIndex + 1) % m.lines.length;
    say(m.lines[lineIndex]);
    setState('wave', 1800);
  });

  // Dopo un po' saluta ed esce di scena camminando (con movimento ridotto sfuma).
  later(() => {
    say('Ciao ciao!');
    if (reduce.matches || !ready) { el.classList.add('is-leaving'); return later(destroy, 400); }
    leaving = true;
    dir = x + width() / 2 < innerWidth / 2 ? -1 : 1;
    setState('wave', 900);
  }, LIFE_MS);

  function destroy() {
    cancelAnimationFrame(raf);
    removeEventListener('resize', onResize);
    timers.forEach(clearTimeout);
    clearTimeout(bubbleTimer);
    el.remove();
    if (current?.el === el) current = null;
  }
  return { el, destroy };
}

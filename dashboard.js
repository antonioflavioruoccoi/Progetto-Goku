// Dashboard: evidenzia la pagina aperta nel menu e fa cadere una mascotte se tieni premuto il logo.
const app = document.getElementById('app');
const logo = document.querySelector('#app > header h1');
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const vibrate = pattern => navigator.vibrate?.(pattern);

for (const a of document.querySelectorAll('#app nav a'))
  if (new URL(a.href).pathname === location.pathname) a.setAttribute('aria-current', 'page');

const MASCOTS = [
  { name: 'Biscotto', src: '/assets/mascot/biscotto.webp', lines: ['Ciao! Sono Biscotto.', 'Domanda da cento punti?', 'Croccante di cultura!', 'Ehi, mi fai il solletico!'] },
  { name: 'Cervello', src: '/assets/mascot/cervello.webp', lines: ['Ciao! Sono Cervello.', 'Mi è venuta un’idea!', 'Pronto per il quiz?', 'Allenami con una domanda!'] },
];
const HOLD_MS = 650, LIFE_MS = 35000, SPEED = 70; // px al secondo
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
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'mascot';
  el.dataset.mascot = m.name.toLowerCase();
  el.setAttribute('aria-label', `Saluta ${m.name}`);
  const body = document.createElement('span');
  body.className = 'mascot-body';
  const img = new Image();
  img.src = m.src;
  img.alt = '';
  img.draggable = false;
  const bubble = document.createElement('span');
  bubble.className = 'mascot-bubble';
  bubble.setAttribute('role', 'status');
  body.append(img);
  el.append(body, bubble);
  document.body.append(el);

  const width = () => el.offsetWidth;
  let x = Math.random() * Math.max(0, innerWidth - width());
  let dir = Math.random() < .5 ? -1 : 1, ready = false, walking = false, leaving = false, pauseUntil = 0, last = 0, raf = 0;
  let lineIndex = 0, bubbleTimer = 0, waveTimer = 0;
  const timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
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
    if (walking && t >= pauseUntil) {
      el.classList.add('is-walking');
      x += dir * SPEED * dt;
      const max = innerWidth - width();
      if (!leaving && (x <= 0 || x >= max)) { x = Math.min(Math.max(x, 0), max); dir = -dir; }
      if (!leaving && Math.random() < dt / 4) { pauseUntil = t + 900 + Math.random() * 900; el.classList.remove('is-walking'); }
      if (leaving && (x < -width() || x > innerWidth)) return destroy();
      place();
    }
    raf = requestAnimationFrame(step);
  };

  const startWalking = () => {
    ready = true;
    el.classList.add('is-ready');
    if (reduce.matches) return;
    walking = true;
    raf = requestAnimationFrame(step);
  };

  // Cade, atterra, si accende e parte.
  if (reduce.matches) later(() => { say(m.lines[0]); startWalking(); }, 300);
  else {
    body.addEventListener('animationend', () => {
      el.classList.add('is-landed');
      vibrate(25);
      later(() => { el.classList.remove('is-landed'); el.classList.add('is-awake'); say(m.lines[0]); }, 500);
      later(() => { el.classList.remove('is-awake'); startWalking(); }, 1100);
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
    clearTimeout(waveTimer);
    el.classList.remove('is-walking', 'is-waving', 'is-awake');
    void el.offsetWidth;
    el.classList.add('is-waving');
    pauseUntil = performance.now() + 1800;
    waveTimer = setTimeout(() => el.classList.remove('is-waving'), 1800);
  });

  // Dopo un po' saluta ed esce di scena (con movimento ridotto sfuma).
  later(() => {
    say('Ciao ciao!');
    if (reduce.matches || !walking) { el.classList.add('is-leaving'); return later(destroy, 400); }
    leaving = true;
    dir = x + width() / 2 < innerWidth / 2 ? -1 : 1;
    pauseUntil = performance.now() + 900;
  }, LIFE_MS);

  function destroy() {
    cancelAnimationFrame(raf);
    removeEventListener('resize', onResize);
    timers.forEach(clearTimeout);
    clearTimeout(bubbleTimer);
    clearTimeout(waveTimer);
    el.remove();
    if (current?.el === el) current = null;
  }
  return { el, destroy };
}

'use strict';

const cards = [
  { name: 'Skarmory', image: 'show_skarmory-illustration-rare-209-191-surging-sparks.webp' },
  { name: 'Poliwhirl', image: 'poliwhirlcard.webp' },
  { name: 'Chatot', image: 'Chaototcard.jpg' },
  { name: 'Joltik', image: 'wht.116.joltik.png' },
  { name: 'Fomantis', image: 'pbl.085.fomantis.png' },
  { name: 'Heliolisk', image: 'asc.229.heliolisk.png' }
];
const $ = id => document.getElementById(id);
const duration = 30000;
let pokedex = [], index = 0, score = 0, phase = 'idle';
let phaseStart = 0, roundStart = 0, pausedAt = null, pausedDuration = 0;
let attempts = 0;
const pixels = $('pixels');
const pixelContext = pixels.getContext('2d');

$('music').volume = Number($('volume').value) / 100;
$('volume').addEventListener('input', () => {
  $('music').volume = Number($('volume').value) / 100;
});

function normalize(name) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function levenshtein(a, b) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] !== b[j - 1]));
    }
    row = next;
  }
  return row[b.length];
}

function resolveName(text) {
  const input = normalize(text);
  if (!input) return null;
  if (pokedex.includes(input)) return input;
  let best = Infinity, matches = [];
  for (const name of pokedex) {
    const limit = name.length >= 8 ? 2 : name.length >= 4 ? 1 : 0;
    if (Math.abs(input.length - name.length) > limit) continue;
    const distance = levenshtein(input, name);
    if (distance > limit || distance > best) continue;
    if (distance < best) { best = distance; matches = []; }
    matches.push(name);
  }
  return matches.length === 1 ? matches[0] : null;
}

function enableAnswers(enabled) {
  $('answer').disabled = $('submit').disabled = !enabled;
}

function remaining(now) {
  return Math.max(0, duration - ((pausedAt ?? now) - roundStart - pausedDuration));
}

function renderTime(now) {
  const left = remaining(now);
  $('seconds').textContent = `${Math.ceil(left / 1000)}s`;
  renderPixels(left);
  return left;
}

// Draw the original asset at low resolution; CSS enlarges its square pixels.
// Resolution follows elapsed time and stays unchanged while the round is paused.
function renderPixels(left, force = false) {
  const asset = cards[index].asset;
  const blockSize = 40 - 37 * (1 - left / duration);
  const width = Math.ceil(310 / blockSize);
  const height = Math.round(width * asset.naturalHeight / asset.naturalWidth);
  if (!force && pixels.width === width && pixels.height === height) return;
  pixels.width = width;
  pixels.height = height;
  pixelContext.drawImage(asset, 0, 0, width, height);
}

function nextCard(now) {
  if (index === cards.length) {
    phase = 'finished';
    $('play-area').hidden = true;
    $('final').hidden = false;
    $('final-score').textContent = score;
    $('round').textContent = '6 / 6 carte';
    $('replay').focus();
    return;
  }
  phase = 'covered';
  phaseStart = now;
  pausedAt = null;
  pausedDuration = 0;
  attempts = 0;
  $('continue').hidden = true;
  $('points-popup').hidden = true;
  $('answer-form').hidden = false;
  $('paused').hidden = true;
  $('timer').disabled = true;
  $('timer').setAttribute('aria-pressed', 'false');
  $('timer').setAttribute('aria-label', 'Metti in pausa il timer');
  enableAnswers(false);
  $('answer').value = '';
  $('message').textContent = '';
  $('message').classList.remove('won');
  $('round').textContent = `Carta ${index + 1} / 6`;
  $('seconds').textContent = '30s';
  $('card').className = 'card reset';
  $('pokemon').src = cards[index].image;
  $('pokemon').alt = 'Pokémon da indovinare';
  const asset = cards[index].asset;
  $('card').style.aspectRatio = `${asset.naturalWidth} / ${asset.naturalHeight}`;
  renderPixels(duration, true);
}

function finishRound(result, now) {
  if (phase !== 'active') return;
  const points = result === 'correct' ? Math.ceil(remaining(now) / 1000) * 10 : 0;
  score += points;
  phase = 'result';
  phaseStart = now;
  $('score').textContent = score;
  $('seconds').textContent = '0s';
  $('timer').disabled = true;
  enableAnswers(false);
  $('card').classList.add('revealed');
  $('pokemon').alt = cards[index].name;
  $('answer-form').hidden = true;
  $('continue').hidden = false;
  if (points > 0) {
    $('points-popup').textContent = `+${points}`;
    $('points-popup').hidden = false;
  }
  if (result === 'correct') $('message').classList.add('won');
  $('message').textContent = result === 'correct' ? `Hai vinto ${points} punti!` :
    (result === 'wrong' ? 'Peccato, hai sbagliato' : 'Tempo scaduto!');
  $('continue').focus({ preventScroll: true });
}

// One animation loop drives every phase; elapsed time never depends on frame count.
function tick(now) {
  if (phase === 'covered' && now - phaseStart >= 250) {
    $('card').classList.remove('reset');
    $('card').classList.add('flipped');
    phase = 'flipping';
    phaseStart = now;
  } else if (phase === 'flipping' && now - phaseStart >= 700) {
    phase = 'active';
    roundStart = now;
    enableAnswers(true);
    $('timer').disabled = false;
    $('answer').focus({ preventScroll: true });
  } else if (phase === 'active' && pausedAt === null) {
    if (renderTime(now) <= 0) finishRound('timeout', now);
  }
  if (phase !== 'finished') requestAnimationFrame(tick);
}

$('timer').addEventListener('click', () => {
  if (phase !== 'active') return;
  const now = performance.now();
  if (pausedAt === null) {
    if (remaining(now) <= 0) { finishRound('timeout', now); return; }
    pausedAt = now;
    $('card').classList.add('paused');
    renderTime(now);
  } else {
    pausedDuration += now - pausedAt;
    pausedAt = null;
    $('card').classList.remove('paused');
  }
  const paused = pausedAt !== null;
  $('paused').hidden = !paused;
  $('timer').setAttribute('aria-pressed', String(paused));
  $('timer').setAttribute('aria-label', paused ? 'Riprendi il timer' : 'Metti in pausa il timer');
  enableAnswers(!paused);
  if (!paused) $('answer').focus({ preventScroll: true });
});

$('answer-form').addEventListener('submit', event => {
  event.preventDefault();
  if (phase !== 'active' || pausedAt !== null) return;
  const now = performance.now();
  if (remaining(now) <= 0) { finishRound('timeout', now); return; }
  const name = resolveName($('answer').value);
  if (!name) { $('message').textContent = 'Nome errato, riprova'; return; }
  if (name === normalize(cards[index].name)) {
    finishRound('correct', now);
  } else if (++attempts === 3) {
    finishRound('wrong', now);
  } else {
    const left = 3 - attempts;
    $('message').textContent = `Non è questo Pokémon! ${left === 1 ? 'Resta 1 tentativo.' : 'Restano 2 tentativi.'}`;
    $('answer').value = '';
    $('answer').focus({ preventScroll: true });
  }
});

$('continue').addEventListener('click', () => {
  if (phase !== 'result') return;
  index++;
  nextCard(performance.now());
});

function startGame() {
  if (phase !== 'idle' && phase !== 'finished') return;
  // Called synchronously from the user gesture to comply with autoplay policies.
  $('music').play().catch(() => {
    $('message').textContent = 'Musica non disponibile. Puoi continuare a giocare.';
  });
  score = 0;
  index = 0;
  $('score').textContent = '0';
  $('start-panel').hidden = true;
  $('final').hidden = true;
  $('play-area').hidden = false;
  nextCard(performance.now());
  requestAnimationFrame(tick);
}
$('start').addEventListener('click', startGame);
$('replay').addEventListener('click', startGame);

async function loadGame() {
  try {
    const response = await fetch('pokemon_pokedex_nazionale.txt');
    if (!response.ok) throw new Error('Pokédex');
    pokedex = [...new Set((await response.text()).split(/\r?\n/)
      .map(line => line.match(/^\s*\d+\s*-\s*(.+?)\s*$/)?.[1]).filter(Boolean).map(normalize))];
    if (!pokedex.length || cards.some(card => !pokedex.includes(normalize(card.name)))) throw new Error('Pokédex incompleto');
    await Promise.all(cards.map(card => new Promise((resolve, reject) => {
      card.asset = new Image();
      card.asset.onload = resolve;
      card.asset.onerror = reject;
      card.asset.src = card.image;
    })));
    $('start').disabled = false;
    $('start').textContent = 'Gioca';
  } catch {
    $('start').textContent = 'Caricamento fallito';
    $('message').textContent = 'Impossibile caricare carte o Pokédex. Ricarica la pagina da un server web.';
  }
}
loadGame();

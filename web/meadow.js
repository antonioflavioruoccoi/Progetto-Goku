import { element, rankingBoard } from './chronology.js';

// Fiori ed esplosione restano 5 s, poi la classifica (come la vecchia Cronologia).
const ANSWER_REVEAL_MS = 5000;

const $ = id => document.getElementById('meadow-' + id);
const stage = $('stage');
const board = $('board');
const list = $('options');
const leaderboard = $('leaderboard');
const ranking = rankingBoard(leaderboard.querySelector('ol'), $('ranking-empty'));
const SVG = 'http://www.w3.org/2000/svg';
const setText = (node, value) => { if (node.textContent !== value) node.textContent = value; };

let roundKey, buttons = [], buds = [], selected = [], enabled = false;

// Fiore vettoriale: sei petali attorno al centro, si aprono via CSS con [data-open].
function flower(className) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '-20 -20 40 40');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'meadow-flower ' + className);
  const shape = (tag, attrs) => {
    const node = document.createElementNS(SVG, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  };
  for (let k = 0; k < 6; k++) {
    const turn = shape('g', { transform: `rotate(${k * 60})` });
    const petal = shape('ellipse', { class: 'meadow-petal', cx: 0, cy: -8.5, rx: 4.6, ry: 8.2 });
    petal.style.setProperty('--k', k);
    turn.append(petal);
    svg.append(turn);
  }
  svg.append(shape('circle', { class: 'meadow-bud-core', r: 7.5 }), shape('circle', { class: 'meadow-heart', r: 4.4 }),
    shape('path', { class: 'meadow-burst', d: 'M0-18 4-7 15-12 8-2 18 4 6 6 7 17 0 9-8 16-6 5-18 3-8-3-14-13-4-7z' }));
  return svg;
}

function paint() {
  for (const button of buttons) {
    const on = selected.includes(Number(button.dataset.option));
    button.setAttribute('aria-pressed', String(on));
    button.querySelector('.meadow-flower').toggleAttribute('data-open', on);
  }
  const count = selected.length;
  setText($('status'), count ? `${count} ${count === 1 ? 'fiore' : 'fiori'} · ${count * 40} punti se eviti la bomba${count === 5 ? ', +40 se sei il primo' : ''}` :
    'Tocca le risposte giuste, poi invia');
  $('clear').disabled = !enabled || !count;
  $('send').disabled = !enabled;
}

list.addEventListener('click', event => {
  const button = event.target.closest('button[data-option]');
  if (!enabled || !button) return;
  const id = Number(button.dataset.option);
  selected = selected.includes(id) ? selected.filter(item => item !== id) : [...selected, id];
  paint();
});

$('clear').addEventListener('click', () => {
  if (!enabled) return;
  selected = [];
  paint();
});

export const meadowSelection = () => [...selected];

function buildRound(meadow, host) {
  selected = [];
  $('category').replaceChildren(...meadow.category.split(' ').map((word, index, words) => {
    const span = element('span', '', word + (index < words.length - 1 ? ' ' : ''));
    span.style.setProperty('--i', index);
    return span;
  }));
  buttons = meadow.options.map(({ id, name }, index) => {
    const option = element(host ? 'li' : 'button', 'meadow-option');
    if (!host) option.type = 'button';
    option.dataset.option = id;
    option.style.setProperty('--i', index);
    option.toggleAttribute('data-long', name.length > 36);
    option.append(host ? element('span', 'meadow-number', String(index + 1)) : flower('meadow-option-flower'),
      element('span', 'meadow-name', name), element('span', 'meadow-detail'));
    if (host) option.prepend(flower('meadow-option-flower'));
    return option;
  });
  list.replaceChildren(...buttons);
  buds = meadow.options.map((_, index) => {
    const bud = element('span', 'meadow-bud');
    bud.style.setProperty('--i', index);
    bud.append(element('span', 'meadow-stem'), flower('meadow-bud-flower'), element('span', 'meadow-bud-label', String(index + 1)));
    return bud;
  });
  $('ground').replaceChildren(...buds);
}

export function renderMeadow(state, host) {
  const { room, meadow, me } = state;
  const key = `${room.id}/${room.round}/${host}`;
  const reveal = meadow.bomb !== undefined;
  const locked = !!me?.done;
  if (key !== roundKey) {
    roundKey = key;
    buildRound(meadow, host);
  }
  // Tocchi mai inviati non contano al reveal.
  if (locked) selected = me.choice;
  else if (reveal) selected = [];
  stage.dataset.phase = reveal ? 'reveal' : locked ? 'waiting' : 'question';
  stage.toggleAttribute('data-paused', room.phase === 'paused');
  setText($('round'), `${room.round}/${meadow.total}`);
  setText($('instruction'), host ? `Quali sono giuste? Una sola è la bomba. Tutte e 5 per primo: +${meadow.fastest_bonus} bonus.` :
    `Una è una bomba: se la prendi, il round vale 0. Tutte e 5 giuste per primo: +${meadow.fastest_bonus}.`);
  $('instruction').hidden = reveal;
  // Premio al più veloce: compare al reveal e resta anche sulla classifica.
  const fastest = reveal ? meadow.fastest : null, mine = !host && !!me?.fastest;
  $('fastest').hidden = !fastest;
  if (fastest) {
    setText($('fastest-label'), mine ? 'Sei tu il più veloce' : 'Il più veloce');
    setText($('fastest-name'), fastest);
    $('fastest-name').hidden = mine;
    setText($('fastest-bonus'), `+${meadow.fastest_bonus} bonus`);
    $('fastest').toggleAttribute('data-mine', mine);
  }
  $('clear').hidden = $('send').hidden = host || reveal || locked;
  const hit = locked && reveal && selected.includes(meadow.bomb);
  buttons.forEach((option, index) => {
    const id = Number(option.dataset.option), bomb = reveal && id === meadow.bomb, picked = selected.includes(id);
    option.dataset.result = !reveal ? '' : bomb ? 'bomb' : 'safe';
    option.toggleAttribute('data-picked', picked);
    option.querySelector('.meadow-flower').toggleAttribute('data-open', host ? reveal && !bomb : picked && !bomb);
    option.querySelector('.meadow-flower').toggleAttribute('data-boom', bomb);
    setText(option.querySelector('.meadow-detail'), !reveal ? '' : bomb ? 'Bomba' : host || !picked || hit ? '' : `+${meadow.points_per_safe}`);
    if (!host) option.setAttribute('aria-pressed', String(picked));
    if (!host && reveal) option.setAttribute('aria-label', `${option.querySelector('.meadow-name').textContent}${bomb ? ', bomba' : ', risposta giusta'}${picked ? ', scelta da te' : ''}`);
    const bud = buds[index].querySelector('.meadow-flower');
    bud.toggleAttribute('data-open', reveal && !bomb);
    bud.toggleAttribute('data-boom', bomb);
  });
  if (reveal) ranking.prepare(state.players, me, roundKey);
  if (!host) {
    if (reveal) {
      setText($('status'), !locked ? 'Risposta non inviata · 0 punti' : hit ? 'Hai preso la bomba · 0 punti' :
        selected.length ? `Prato salvo · +${me.points} punti${me.fastest ? `, bonus compreso` : ''}` : 'Nessun fiore piantato · 0 punti');
    } else if (locked) setText($('status'), selected.length ? 'Fiori piantati. In attesa degli altri.' : 'Inviato senza fiori. In attesa degli altri.');
    else paint();
  }
}

export function tickMeadow(state, ms, canAnswer, introMs) {
  if (stage.hidden) return;
  const { room, meadow, duration_ms: duration, me, can_control: host } = state;
  const reveal = meadow.bomb !== undefined;
  const paused = room.phase === 'paused';
  const revealElapsed = reveal ? meadow.reveal_ms - ms : 0;
  const showRanking = reveal && revealElapsed >= ANSWER_REVEAL_MS;
  const untilStart = paused && !reveal ? Math.max(0, ms - duration) : introMs;
  const presenting = untilStart > 0;
  stage.toggleAttribute('data-intro', presenting);
  stage.toggleAttribute('data-ranking', showRanking);
  board.hidden = showRanking;
  leaderboard.hidden = !showRanking;
  $('actions').hidden = host || showRanking;
  if (showRanking) ranking.tick(revealElapsed - ANSWER_REVEAL_MS, paused);
  if (host) {
    setText(document.querySelector('[data-command="pause"]'), showRanking ? 'Pausa classifica' : 'Pausa');
    setText(document.querySelector('[data-command="resume"]'), showRanking ? 'Riprendi classifica' : 'Riprendi');
  }
  setText($('phase'), paused ? (showRanking ? 'Classifica in pausa' : 'In pausa') : reveal ?
    `${showRanking ? 'Classifica' : 'Il prato sboccia'} · ${room.round === meadow.total ? 'al podio' : 'prossimo round'}` :
    presenting ? 'Presentazione' : me?.done ? 'Risposta inviata' : 'Tempo per rispondere');
  const sent = `${state.received}/${meadow.participants} risposte inviate`;
  setText($('count'), sent);
  setText($('sent'), reveal ? 'Risultati' : sent);
  enabled = canAnswer && !!me && !host;
  const time = Math.ceil(Math.min(ms, duration) / 1000);
  const number = String(time).padStart(2, '0');
  if ($('seconds').textContent !== number) $('seconds').replaceChildren(element('span', '', number));
  stage.toggleAttribute('data-urgent', !presenting && !reveal && time <= 5 && room.phase === 'question');
  $('progress').firstElementChild.style.transform = `scaleX(${Math.min(1, ms / (reveal ? meadow.reveal_ms : duration))})`;
  $('scene').setAttribute('aria-label', `Prato del round ${room.round} di ${meadow.total}: ${reveal ? 'cinque fiori sbocciati e una bomba esplosa' : `sei boccioli chiusi, ${sent}`}`);
  if (!host) {
    for (const button of buttons) button.disabled = !enabled;
    $('clear').disabled = !enabled || !selected.length;
    $('send').disabled = !enabled;
  }
}

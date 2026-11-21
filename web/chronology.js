const $ = id => document.getElementById('chronology-' + id);
const stage = $('stage');
const board = $('board');
const entries = $('items');
const seconds = $('seconds');
const shortName = name => name.split(' - ', 1)[0];
const setText = (node, value) => { if (node.textContent !== value) node.textContent = value; };
const element = (tag, className, value = '') => {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = value;
  return node;
};

let roundKey, previous, buttons = [], selected = [], enabled = false;

function setPosition(card, rank) {
  const badge = card.querySelector('.chronology-position');
  const value = rank ? String(rank) : '';
  if (badge.textContent !== value) badge.replaceChildren(...(value ? [element('span', '', value)] : []));
}

function animateExit() {
  if (!board.animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const outgoing = board.cloneNode(true);
  for (const node of [outgoing, ...outgoing.querySelectorAll('[id]')]) node.removeAttribute('id');
  outgoing.classList.add('chronology-outgoing');
  outgoing.inert = true;
  outgoing.setAttribute('aria-hidden', 'true');
  board.before(outgoing);
  outgoing.animate([{ opacity: 0.7 }, { opacity: 0, transform: 'translateY(-14px)' }], {
    duration: 220, easing: 'ease-out',
  }).finished.then(() => outgoing.remove(), () => outgoing.remove());
}

function paintSelection() {
  for (const button of buttons) {
    const rank = selected.indexOf(Number(button.dataset.item)) + 1;
    button.setAttribute('aria-pressed', String(rank > 0));
    setPosition(button, rank);
  }
  setText($('status'), `${selected.length}/4 selezionati`);
  $('reset').disabled = !enabled || !selected.length;
  $('send').disabled = !enabled || selected.length !== 4;
}

entries.addEventListener('click', event => {
  const button = event.target.closest('button[data-item]');
  if (!enabled || !button) return;
  const id = Number(button.dataset.item);
  selected = selected.includes(id) ? selected.filter(item => item !== id) : [...selected, id];
  paintSelection();
});

$('reset').addEventListener('click', () => {
  if (!enabled) return;
  selected = [];
  paintSelection();
  if (entries.animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    entries.animate([{ opacity: 0.65, transform: 'translateY(3px)' }, { opacity: 1, transform: 'none' }], 170);
  }
});

export const chronologySelection = () => [...selected];

export function renderChronology(state, host) {
  const { room, chronology, me } = state;
  const key = `${room.id}/${room.round}/${host}`;
  const reveal = !!chronology.correct;
  const newRound = key !== roundKey;
  const locked = !!me?.done;
  if (newRound) {
    if (roundKey) animateExit();
    roundKey = key;
    selected = [];
    const words = chronology.category.split(' ').map((word, index, words) => {
      const span = element('span', '', word + (index < words.length - 1 ? ' ' : ''));
      span.style.setProperty('--i', index);
      return span;
    });
    $('category').replaceChildren(...words);
    buttons = chronology.items.map(({ id, name }) => {
      const card = element(host ? 'div' : 'button', 'chronology-card');
      if (!host) card.type = 'button';
      card.dataset.item = id;
      card.append(element('span', 'chronology-position'), element('span', 'chronology-name', host ? name : shortName(name)),
        element('span', 'chronology-detail'));
      return card;
    });
    entries.replaceChildren(...buttons);
  }

  if (locked) selected = me.choice;
  stage.dataset.phase = reveal ? 'reveal' : locked ? 'waiting' : 'question';
  stage.toggleAttribute('data-paused', room.phase === 'paused');
  $('instruction').hidden = reveal;
  $('solution').hidden = host || !reveal;
  $('reset').hidden = $('send').hidden = host || reveal || locked;
  $('actions').hidden = host;
  if (reveal && (newRound || previous !== 'reveal')) {
    const byId = new Map(chronology.items.map(item => [item.id, item]));
    const order = chronology.correct;
    for (const card of buttons) {
      const id = Number(card.dataset.item);
      const position = selected.indexOf(id);
      const rank = order.indexOf(id);
      const correct = locked && position === rank;
      card.style.setProperty('--reveal', rank);
      setPosition(card, host ? rank + 1 : position + 1);
      setText(card.querySelector('.chronology-detail'), host ? String(byId.get(id).year) :
        locked ? correct ? `+${chronology.points_per_match}` : '0' : '');
      if (!host && locked) card.dataset.result = correct ? 'correct' : 'wrong';
      if (!host) card.setAttribute('aria-pressed', String(position >= 0));
    }
    if (!host) {
      if (selected.length) {
        const display = [...selected, ...chronology.items.map(item => item.id).filter(id => !selected.includes(id))];
        entries.replaceChildren(...display.map(id => buttons.find(card => Number(card.dataset.item) === id)));
      }
      $('solution').querySelector('ol').replaceChildren(...order.map(id => {
        const { name, year } = byId.get(id);
        const item = element('li', '');
        item.append(element('span', '', shortName(name)), element('strong', '', String(year)));
        return item;
      }));
    }
  }
  if (!host) {
    if (reveal) setText($('status'), locked ? `La tua sequenza · +${me.points} punti` : 'Risposta non inviata · 0 punti');
    else if (locked) setText($('status'), 'In attesa delle altre risposte');
    else paintSelection();
  }
  previous = stage.dataset.phase;
}

export function tickChronology(state, ms, canAnswer, introMs) {
  if (stage.hidden) return;
  const { room, chronology, duration_ms: duration, me } = state;
  const reveal = !!chronology.correct;
  const paused = room.phase === 'paused';
  const untilStart = paused && !reveal ? Math.max(0, ms - duration) : introMs;
  const visible = Math.max(0, buttons.length - Math.ceil(untilStart / chronology.card_interval_ms));
  const presenting = untilStart > 0;
  stage.toggleAttribute('data-intro', presenting);
  stage.toggleAttribute('data-category-only', visible <= 0);
  setText($('phase'), paused ? 'In pausa' : reveal ?
    (room.round === chronology.total ? 'Risultati · al podio' : 'Risultati · prossimo round') :
    presenting ? 'Presentazione' : me?.done ? 'Risposta inviata' : 'Tempo per rispondere');

  enabled = canAnswer && !!state.me && !state.can_control;
  const time = Math.ceil(Math.min(ms, duration) / 1000);
  const number = String(time).padStart(2, '0');
  if (seconds.textContent !== number) seconds.replaceChildren(element('span', '', number));
  stage.toggleAttribute('data-urgent', !presenting && !reveal && time <= 5 && room.phase === 'question');
  $('progress').firstElementChild.style.transform = `scaleX(${Math.min(1, ms / (reveal ? 15000 : duration))})`;
  buttons.forEach((card,i) => card.toggleAttribute('data-present', i < visible));
  if (!state.can_control) {
    for (const button of buttons) button.disabled = !enabled;
    $('reset').disabled = !enabled || !selected.length;
    $('send').disabled = !enabled || selected.length !== 4;
  }
}

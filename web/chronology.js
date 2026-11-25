const $ = id => document.getElementById('chronology-' + id);
const stage = $('stage');
const board = $('board');
const entries = $('items');
const seconds = $('seconds');
const leaderboard = $('leaderboard');
const rankingList = leaderboard.querySelector('ol');
const RANK_COUNT_DELAY = 800;
const RANK_COUNT_MS = 1200;
const RANK_MOVE_MS = 650;
const shortName = name => name.split(' - ', 1)[0];
const setText = (node, value) => { if (node.textContent !== value) node.textContent = value; };
export const element = (tag, className, value = '') => {
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
  const outgoing = (leaderboard.hidden ? board : leaderboard).cloneNode(true);
  for (const node of [outgoing, ...outgoing.querySelectorAll('[id]')]) node.removeAttribute('id');
  outgoing.classList.add('chronology-outgoing');
  outgoing.inert = true;
  outgoing.setAttribute('aria-hidden', 'true');
  board.before(outgoing);
  outgoing.animate([{ opacity: 0.7 }, { opacity: 0, transform: 'translateY(-14px)' }], {
    duration: 220, easing: 'ease-out',
  }).finished.then(() => outgoing.remove(), () => outgoing.remove());
}

// Classifica animata condivisa da Cronologia e Prato fiorito.
export function rankingBoard(list, empty) {
  let rankingKey, rankingRows = [], rankingAnimations = [], ranked = false;
  function prepare(players, me, round) {
  const key = JSON.stringify([round, players.map(p => [p.user_id, p.nickname, p.score, p.round_points])]);
  if (key === rankingKey) return;
  rankingKey = key;
  rankingAnimations = [];
  ranked = false;
  rankingRows = players.map(player => {
    const node = element('li', 'chronology-ranking-row');
    const position = element('span', 'chronology-ranking-position');
    const gain = player.round_points ?? 0;
    const delta = element('span', 'chronology-ranking-delta', gain ? `+${gain}` : '');
    const points = element('strong', 'chronology-ranking-points');
    if (player.user_id === me?.user_id) node.setAttribute('aria-current', 'true');
    node.append(position, element('span', 'chronology-ranking-name', player.nickname), delta, points);
    return { player, node, position, delta, points, gain, start: player.score - gain };
  });
  const orderBefore = [...rankingRows].sort((a, b) => b.start - a.start || a.player.nickname.localeCompare(b.player.nickname));
  orderBefore.forEach((row, index) => {
    row.rankBefore = index && row.start === orderBefore[index - 1].start ? orderBefore[index - 1].rankBefore : index + 1;
    row.position.textContent = String(row.rankBefore);
  });
  list.replaceChildren(...orderBefore.map(row => row.node));
  empty.hidden = rankingRows.length > 0;
}

  function tick(elapsed, paused) {
  const countEnd = RANK_COUNT_DELAY + RANK_COUNT_MS;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const progress = ranked ? 1 : reduced ? Number(elapsed >= countEnd) :
    Math.max(0, Math.min(1, (elapsed - RANK_COUNT_DELAY) / RANK_COUNT_MS));
  for (const { start, gain, delta, points } of rankingRows) {
    setText(points, `${start + Math.round(gain * progress)} pt`);
    delta.hidden = !gain || progress === 0;
  }
  if (progress === 1 && !ranked) {
    ranked = true;
    const animate = !reduced && !!list.animate && elapsed < countEnd + RANK_MOVE_MS;
    const before = animate ? rankingRows.map(row => row.node.getBoundingClientRect().top) : [];
    const scroll = list.scrollTop;
    list.replaceChildren(...rankingRows.map(row => row.node));
    list.scrollTop = scroll;
    rankingRows.forEach(({ node, position, player }, i) => {
      setText(position, String(player.rank));
      if (!animate) return;
      const distance = before[i] - node.getBoundingClientRect().top;
      if (!distance) return;
      const animation = node.animate([{ transform: `translateY(${distance}px)` }, { transform: 'none' }], {
        duration: RANK_MOVE_MS, easing: 'cubic-bezier(.2, .72, .3, 1)',
      });
      animation.currentTime = elapsed - countEnd;
      rankingAnimations.push(animation);
    });
  }
  for (const animation of rankingAnimations) {
    if (paused && animation.playState === 'running') animation.pause();
    if (!paused && animation.playState === 'paused') animation.play();
  }
}
  return { prepare, tick };
}
const ranking = rankingBoard(rankingList, $('ranking-empty'));

function paintSelection() {
  for (const button of buttons) {
    const rank = selected.indexOf(Number(button.dataset.item)) + 1;
    button.setAttribute('aria-pressed', String(rank > 0));
    button.setAttribute('aria-label', `${button.querySelector('.chronology-name').textContent}${rank ? `, posizione ${rank}` : ''}`);
    setPosition(button, rank);
  }
  setText($('status'), selected.length === 4 ? 'Ordine completo · premi Invia' :
    `Tocca il ${selected.length + 1}° evento in ordine di tempo · ${selected.length}/4`);
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
      const text = element('span', 'chronology-text');
      text.append(element('span', 'chronology-name', host ? name : shortName(name)), element('span', 'chronology-year'));
      card.append(element('span', 'chronology-position'), text, element('span', 'chronology-detail'));
      return card;
    });
    entries.replaceChildren(...buttons);
  }

  if (locked) selected = me.choice;
  stage.dataset.phase = reveal ? 'reveal' : locked ? 'waiting' : 'question';
  stage.toggleAttribute('data-paused', room.phase === 'paused');
  setText($('instruction'), host ? 'Dal più antico al più recente' : 'Tocca gli eventi dal più antico al più recente');
  $('instruction').hidden = reveal;
  $('reset').hidden = $('send').hidden = host || reveal || locked;
  if (reveal) ranking.prepare(state.players, me, roundKey);
  if (reveal && (newRound || previous !== 'reveal')) {
    // Same cards, reordered by the correct order, with the year under each title.
    const byId = new Map(chronology.items.map(item => [item.id, item]));
    const order = chronology.correct;
    for (const card of buttons) {
      const id = Number(card.dataset.item);
      const position = selected.indexOf(id);
      const rank = order.indexOf(id);
      const correct = locked && position === rank;
      card.style.setProperty('--reveal', rank);
      setPosition(card, rank + 1);
      setText(card.querySelector('.chronology-year'), String(byId.get(id).year) +
        (!host && locked && !correct ? ` · tu: ${position + 1}°` : ''));
      setText(card.querySelector('.chronology-detail'), host || !locked ? '' : correct ? `+${chronology.points_per_match}` : '0');
      if (!host && locked) card.dataset.result = correct ? 'correct' : 'wrong';
      if (!host) {
        card.setAttribute('aria-pressed', String(position >= 0));
        card.setAttribute('aria-label', `${rank + 1}. ${card.querySelector('.chronology-name').textContent}, ${byId.get(id).year}` +
          (locked ? correct ? ', posizione giusta' : `, tu: ${position + 1}°` : ''));
      }
    }
    const display = order.map(id => buttons.find(card => Number(card.dataset.item) === id));
    if (entries.animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const before = new Map(display.map(card => [card, card.getBoundingClientRect()]));
      entries.replaceChildren(...display);
      for (const card of display) {
        const from = before.get(card), to = card.getBoundingClientRect();
        const dx = from.left - to.left, dy = from.top - to.top;
        if (dx || dy) card.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
          { duration: 520, easing: 'cubic-bezier(.2, .72, .3, 1)' });
      }
    } else entries.replaceChildren(...display);
  }
  if (!host) {
    if (reveal) setText($('status'), locked ? `${me.points / chronology.points_per_match}/4 posizioni giuste · +${me.points} punti` : 'Risposta non inviata · 0 punti');
    else if (locked) setText($('status'), 'In attesa delle altre risposte');
    else paintSelection();
  }
  previous = stage.dataset.phase;
}

export function tickChronology(state, ms, canAnswer, introMs) {
  if (stage.hidden) return;
  const { room, chronology, duration_ms: duration, me, can_control: host } = state;
  const reveal = !!chronology.correct;
  const paused = room.phase === 'paused';
  // The solution waits for the host ("Avanti"); the ranking then runs on a 10 s timer.
  const showRanking = reveal && chronology.view === 'ranking';
  const solution = reveal && !showRanking;
  const rankingElapsed = showRanking ? chronology.ranking_ms - ms : 0;
  const untilStart = paused && !reveal ? Math.max(0, ms - duration) : introMs;
  const visible = Math.max(0, buttons.length - Math.ceil(untilStart / chronology.card_interval_ms));
  const presenting = untilStart > 0;
  stage.toggleAttribute('data-intro', presenting);
  stage.toggleAttribute('data-category-only', visible <= 0);
  stage.toggleAttribute('data-ranking', showRanking);
  stage.toggleAttribute('data-solution', solution);
  board.hidden = showRanking;
  leaderboard.hidden = !showRanking;
  $('actions').hidden = host || showRanking;
  if (showRanking) ranking.tick(rankingElapsed, paused);
  if (host) {
    setText(document.querySelector('[data-command="pause"]'), showRanking ? 'Pausa classifica' : 'Pausa');
    setText(document.querySelector('[data-command="resume"]'), showRanking ? 'Riprendi classifica' : 'Riprendi');
  }
  setText($('phase'), paused ? (showRanking ? 'Classifica in pausa' : 'In pausa') :
    solution ? (host ? 'Ordine corretto · premi Avanti per la classifica' : 'In attesa del conduttore…') :
    showRanking ? `Classifica · ${room.round === chronology.total ? 'poi il podio' : 'poi il prossimo round'}` :
    presenting ? 'Presentazione' : me?.done ? 'Risposta inviata' : '');

  enabled = canAnswer && !!state.me && !state.can_control;
  const time = Math.ceil(Math.min(ms, duration) / 1000);
  const number = String(time).padStart(2, '0');
  if (seconds.textContent !== number) seconds.replaceChildren(element('span', '', number));
  stage.toggleAttribute('data-urgent', !presenting && !reveal && time <= 5 && room.phase === 'question');
  $('progress').firstElementChild.style.transform = `scaleX(${solution ? 0 : Math.min(1, ms / (showRanking ? chronology.ranking_ms : duration))})`;
  buttons.forEach((card,i) => card.toggleAttribute('data-present', i < visible));
  if (!state.can_control) {
    for (const button of buttons) button.disabled = !enabled;
    $('reset').disabled = !enabled || !selected.length;
    $('send').disabled = !enabled || selected.length !== 4;
  }
}

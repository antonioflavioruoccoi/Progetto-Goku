// Final podium of Cultura generale: steps for 1st-3rd (ties share a step),
// confetti once per room and the full ranking split by manche.
const $ = id => document.getElementById(id);
const MANCHES = [1, 2, 3];
const CONFETTI = 70;
let confettiRoom = null;

const element = (tag, className, text = '') => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

export function podiumGroups(players) {
  const groups = [];
  for (const player of players) {
    if (player.rank > 3) break;
    const group = groups.at(-1);
    if (group?.rank === player.rank) group.players.push(player);
    else groups.push({ rank: player.rank, score: player.score, players: [player] });
  }
  return groups;
}

// The per-manche split is shown only when it adds up for every player
// (rooms started before the split was recorded have no complete data).
export function mancheBreakdown(players) {
  const complete = players.length > 0 && players.every(p => p.manche_scores &&
    MANCHES.reduce((sum, m) => sum + (p.manche_scores[m] || 0), 0) === p.score);
  return complete ? players.map(p => MANCHES.map(m => p.manche_scores[m] || 0)) : null;
}

function confetti(roomId) {
  const box = $('confetti');
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  box.hidden = reduced;
  if (reduced || confettiRoom === roomId) return;
  confettiRoom = roomId;
  box.replaceChildren(...Array.from({ length: CONFETTI }, (_, i) => {
    const piece = element('span');
    piece.style.setProperty('--x', `${Math.round(Math.random() * 100)}%`);
    piece.style.setProperty('--d', `${(Math.random() * 1.6).toFixed(2)}s`);
    piece.style.setProperty('--t', `${(2.6 + Math.random() * 1.8).toFixed(2)}s`);
    piece.style.setProperty('--r', `${Math.round(Math.random() * 720 - 360)}deg`);
    piece.style.setProperty('--s', (0.6 + Math.random() * 0.8).toFixed(2));
    piece.dataset.tone = String(i % 3);
    return piece;
  }));
}

export function renderCultureFinal(state, host, me) {
  const wrap = $('final-table-wrap');
  if (!state) {
    wrap.hidden = true;
    $('confetti').hidden = true;
    $('podium').removeAttribute('data-culture');
    return;
  }
  const { players, room } = state;
  const podium = $('podium');
  podium.dataset.culture = '';
  const groups = podiumGroups(players);
  // Visual order of the steps: 2nd, 1st, 3rd.
  const order = [groups[1], groups[0], groups[2]].filter(Boolean);
  podium.setAttribute('aria-label', groups.map(g =>
    `${g.rank}° posto: ${g.players.map(p => p.nickname).join(', ')}, ${g.score} punti`).join('. '));
  podium.replaceChildren(...order.map(group => {
    const step = element('div', 'podium-step');
    step.dataset.place = String(groups.indexOf(group) + 1);
    step.dataset.rank = String(group.rank);
    const names = element('div', 'podium-names');
    for (const player of group.players) {
      const name = element('strong', 'podium-name', player.nickname);
      if (player.user_id === me?.user_id) name.setAttribute('aria-current', 'true');
      names.append(name);
    }
    const tie = group.players.length > 1 ? element('span', 'podium-tie', 'Pari merito') : null;
    const block = element('div', 'podium-block');
    block.append(element('span', 'podium-rank', `${group.rank}°`));
    step.append(...[names, tie, element('span', 'podium-points', `${group.score} punti`), block].filter(Boolean));
    return step;
  }));

  const breakdown = mancheBreakdown(players);
  wrap.hidden = !breakdown;
  $('ranking').hidden = !!breakdown;
  if (breakdown) {
    const body = $('final-table').tBodies[0];
    const signature = JSON.stringify(players.map(p => [p.user_id, p.rank, p.score, p.manche_scores]));
    if (body.dataset.signature !== signature) {
      body.dataset.signature = signature;
      body.replaceChildren(...players.map((player, i) => {
        const row = element('tr');
        if (player.user_id === me?.user_id) row.setAttribute('aria-current', 'true');
        row.append(element('td', 'final-rank', `${player.rank}°`), element('th', 'final-name', player.nickname));
        row.firstChild.nextSibling.scope = 'row';
        for (const points of breakdown[i]) row.append(element('td', 'final-points', String(points)));
        row.append(element('td', 'final-total', String(player.score)));
        return row;
      }));
    }
  }
  confetti(room.id);
}

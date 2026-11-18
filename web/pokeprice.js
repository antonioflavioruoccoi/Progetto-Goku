const $ = id => document.getElementById(id);
const signedPoints = new Intl.NumberFormat('it-IT', {signDisplay: 'always'});
const money = new Intl.NumberFormat('it-IT', {style: 'currency', currency: 'EUR'});
let comparison = '', revealed = false, counterFrame;

function motion(element) {
  return element.animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function showCard(element, card, host) {
  const image = element.querySelector('img');
  if (host && image.getAttribute('src') !== card.image) {
    image.src = card.image;
    image.alt = `Carta ${card.name}, ${card.set} ${card.number}`;
  }
  element.querySelector('h2').textContent = card.name;
  element.querySelector('p').textContent = `${card.set} · ${card.number}`;
}

export function renderPrice(state, host) {
  const {price, me, room} = state;
  const stage = $('price-stage');
  const reference = $('price-reference');
  const candidate = $('price-candidate');
  const key = `${room.id}:${room.round}`;
  const nextRound = comparison !== key;
  const moved = nextRound && candidate.dataset.card === price.reference.id;
  const referencePrice = reference.querySelector('strong');
  const candidatePrice = candidate.querySelector('strong');

  if (nextRound) {
    showCard(reference, price.reference, host);
    showCard(candidate, price.candidate, host);
    candidate.dataset.card = price.candidate.id;
    referencePrice.textContent = money.format(price.reference.cents / 100);
    candidatePrice.textContent = '??? €';
    comparison = key;
    revealed = false;
    delete stage.dataset.revealing;
    if (host && moved && motion(reference)) {
      const distance = candidate.getBoundingClientRect().left - reference.getBoundingClientRect().left;
      reference.animate([{transform: `translateX(${distance}px)`}, {transform: 'translateX(0)'}],
        {duration: 420, easing: 'cubic-bezier(.2,.7,.2,1)'});
      candidate.animate([{transform: 'translateX(24%)', opacity: 0}, {transform: 'translateX(0)', opacity: 1}],
        {duration: 380, delay: 90, fill: 'backwards', easing: 'ease-out'});
    }
  }
  if (price.direction && !revealed) {
    revealed = true;
    const value = price.candidate.cents / 100;
    if (counterFrame !== undefined) window.cancelAnimationFrame(counterFrame);
    if (motion(candidatePrice)) {
      stage.dataset.revealing = '';
      let start;
      const frame = now => {
        if (comparison !== key) return;
        start ??= now;
        const t = Math.min((now - start) / 650, 1);
        candidatePrice.textContent = money.format(value * (1 - (1 - t) ** 3));
        if (t < 1) counterFrame = window.requestAnimationFrame(frame);
        else {
          counterFrame = undefined;
          delete stage.dataset.revealing;
        }
      };
      counterFrame = window.requestAnimationFrame(frame);
    } else candidatePrice.textContent = money.format(value);
  }

  const count = state.players.length;
  const percent = count ? Math.round(price.correct * 100 / count) : 0;
  const outcome = $('price-outcome');
  if (price.direction) {
    const direction = price.direction.toUpperCase();
    const personal = me?.result ? `${signedPoints.format(me.points)} punti` : 'Nessuna risposta · 0 punti';
    outcome.textContent = host ? `${direction} · ${price.correct}/${count} corrette (${percent}%)`
      : `${direction} · ${personal}`;
  } else outcome.textContent = me?.choice ? `Registrata: ${me.choice.toUpperCase()}` : '';
  candidate.dataset.direction = price.direction || '';
  stage.dataset.result = me?.result || '';
  $('price-combo').hidden = !me?.bonus;
  $('price-received').textContent = host ? `${state.received}/${count} hanno risposto`
    : [`${me?.score ?? 0} punti`, me?.streak ? `serie di ${me.streak}` : ''].filter(Boolean).join(' · ');
  $('price-choices').hidden = host || !me || !!price.direction;
  for (const choice of ['higher', 'lower'])
    $('price-' + choice).setAttribute('aria-pressed', String(me?.choice === choice));
}

export function tickPrice(state, ms, pre, introMs, enabled) {
  const {room, price} = state;
  $('price-intro').hidden = !pre;
  $('price-play').hidden = pre;
  $('price-prompt').textContent = room.phase === 'paused' ? 'In pausa'
    : pre ? 'Si parte tra poco' : state.can_control ? 'Quale carta ti spenna di più?' : 'Più alto o più basso?';
  const seconds = pre ? Math.max(0, Math.ceil(introMs / 1000)) : Math.ceil(ms / 1000);
  $('price-seconds').textContent = `${seconds}s`;
  $('price-timer').style.setProperty('--time', `${pre ? Math.min(1, introMs / 5000) : ms / state.duration_ms}turn`);
  $('price-higher').disabled = $('price-lower').disabled = !enabled || !!price.direction;
}

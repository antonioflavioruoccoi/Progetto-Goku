import {vaultArt} from './vault-scenes.js';

const $ = id => document.getElementById(id);
const stage = $('vault-stage');
const keypad = $('vault-keypad');
const assisted = $('vault-assisted');
const send = $('vault-send');
const format = new Intl.NumberFormat('it-IT', {maximumFractionDigits:2, useGrouping:'always'});
const motion = window.matchMedia('(prefers-reduced-motion: reduce), (update: slow)');
const svgNS = 'http://www.w3.org/2000/svg';
const sealJokes = ['NUMERO SIGILLATO!', 'IL TUO CERVELLO HA DECISO.', 'SPERIAMO CHE TU ABBIA RAGIONE.', 'LA MATEMATICA STA TREMANDO.', 'RISPOSTA CONSEGNATA. ORMAI È FATTA.'];
const resultJokes = [
  ['PRECISIONE DISUMANA!', 'MA HAI IL LIBRO DELLE RISPOSTE?!', 'CENTRO PERFETTO!'],
  ['CI SEI ANDATO VICINISSIMO!', 'IL TUO SESTO SENSO FUNZIONA!', 'QUASI UN CECCHINO DEI NUMERI!'],
  ['NON MALE, PROFESSORE!', 'UN’OTTIMA INTUIZIONE!'],
  ['LA FANTASIA NON TI MANCA!', 'UN VIAGGIO NELL’IMPROBABILE!', 'HAI INVENTATO UN’ALTRA REALTÀ!'],
];
let scene, audio, sound, draft = '', posted, receipt, sending, assist, key, beat, lastSecond, chart;
let sealUntil = 0;
let canSend = false;
let tableSignature;
let inputMessage = '';
let signals;
let resize;

function content(node, value) {
  if (node.textContent !== value) node.textContent = value;
}

function saved(name, value) {
  const storageKey = 'goku-vault-' + name;
  try {
    if (value === undefined) return JSON.parse(sessionStorage.getItem(storageKey));
    if (value === null) sessionStorage.removeItem(storageKey);
    else sessionStorage.setItem(storageKey, JSON.stringify({key, value}));
  } catch { /* The current view still works when storage is unavailable. */ }
}

function sizeViewport() {
  const visible = window.visualViewport;
  stage.toggleAttribute('data-compact', !!assist && (visible?.height ?? window.innerHeight) < 310);
  if (assist && visible && visible.height < window.innerHeight - 40) {
    document.body.style.setProperty('--vault-visible-height', `${visible.height}px`);
    document.body.style.setProperty('--vault-visible-top', `${visible.offsetTop}px`);
  } else {
    document.body.style.removeProperty('--vault-visible-height');
    document.body.style.removeProperty('--vault-visible-top');
  }
}

export function vaultAudioEnabled() {
  return audio?.state === 'running';
}

export async function toggleVaultAudio() {
  if (vaultAudioEnabled()) {
    stopVaultAudio();
    await audio.suspend();
  } else {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) throw Error('Audio non disponibile su questo dispositivo.');
    audio ??= new Context();
    await audio.resume();
  }
}

export function stopVaultAudio() {
  sound?.disconnect();
  sound = undefined;
}

function cue(name) {
  if (!vaultAudioEnabled() || document.hidden || scene?.state.room.phase === 'paused') return;
  const volume = Number($('volume').value) / 100;
  if (!volume) return;
  const notes = {
    tap:[415], seal:[165, 247, 330], verify:[130, 196], rain:[392, 587, 784, 494],
    solution:[262, 392, 523, {'terracotta-army':196, piano:784, lunar:880, chemistry:698}[scene.state.vault.effect] ?? 659], tally:[330, 415, 523],
  }[name];
  stopVaultAudio();
  sound = audio.createGain();
  sound.gain.value = volume * .17;
  sound.connect(audio.destination);
  notes.forEach((hz, i) => {
    const start = audio.currentTime + i * .055;
    const osc = audio.createOscillator();
    const envelope = audio.createGain();
    osc.type = name === 'seal' || name === 'verify' ? 'triangle' : 'sine';
    osc.frequency.value = hz;
    envelope.gain.setValueAtTime(.001, start);
    envelope.gain.exponentialRampToValueAtTime(.22, start+.012);
    envelope.gain.exponentialRampToValueAtTime(.001, start+.16);
    osc.connect(envelope).connect(sound);
    osc.start(start);
    osc.stop(start + .17);
  });
}

function flutter(node, frames, duration) {
  if (!motion.matches && !document.hidden) node.animate?.(frames, {duration, easing:'ease-out'});
}

function normalizeDigits(value) {
  return value.replace(/^0+(?=\d)/, '');
}

function updateDisplay(value, animate = true) {
  const old = draft;
  draft = normalizeDigits(value);
  const output = $('vault-number');
  if (assisted.value !== draft) assisted.value = draft;
  content(output, draft ? format.format(Number(draft)) : '—');
  $('vault-display').setAttribute('aria-label', draft ? `Stima ${output.textContent}` : 'Stima in cifre');
  if (animate && old !== draft) flutter(output,
    [{opacity:.35, transform:draft.length >= old.length ? 'translateY(3px)' : 'none'}, {opacity:1, transform:'none'}],
    draft.length >= old.length ? 90 : 80);
}

function edit(value, button) {
  if (!canSend || sending || posted || assist) return;
  const next = value === 'clear' ? '' : value === 'back' ? draft.slice(0,-1) : normalizeDigits(draft + value);
  if (next.length <= 8) {
    updateDisplay(next);
    saved('draft', draft);
  }
  if (button) flutter(button, [{transform:'translateY(-2px)', filter:'brightness(1.35)'}, {transform:'none', filter:'none'}], 100);
  if (vaultAudioEnabled()) {
    cue('tap');
    navigator.vibrate?.(8);
  }
  scene.update();
}

function rememberReceipt(value, animate) {
  if (receipt?.choice === value) return;
  receipt = {choice:value};
  posted = undefined;
  saved('send', null);
  saved('draft', null);
  if (animate) {
    sealUntil = window.performance.now() + 320;
    cue('seal');
  }
}

async function submit() {
  if (!canSend || sending || receipt || (!posted && Number(draft) < 1)) return;
  const current = scene;
  const {room} = current.state;
  const request = posted ?? {room_id:room.id, manche:room.manche, round:room.round, answer:Number(draft), request_id:crypto.randomUUID()};
  posted = request;
  saved('send', request);
  sending = true;
  assisted.blur();
  current.update();
  try {
    const ack = await current.submit(request);
    if (scene && current.key === key) rememberReceipt(ack.choice, true);
  } catch {
    // The next authoritative snapshot can still acknowledge this UUID.
  } finally {
    if (scene && current.key === key) {
      sending = false;
      scene.update();
      current.refresh();
    }
  }
}

function toggleAssist(enabled) {
  assist = enabled;
  $('vault-assist').setAttribute('aria-pressed', String(enabled));
  content($('vault-assist'), enabled ? 'Tastierino' : 'Inserimento assistito');
  sizeViewport();
}

function listened() {
  signals = new window.AbortController();
  const options = {signal:signals.signal};
  if (!keypad.children.length) for (const value of ['1','2','3','4','5','6','7','8','9','clear','0','back']) {
    const keycap = document.createElement('button');
    keycap.type = 'button';
    keycap.dataset.key = value;
    keycap.textContent = value === 'clear' ? 'Cancella' : value === 'back' ? '⌫' : value;
    if (value === 'clear' || value === 'back') keycap.setAttribute('aria-label', value === 'clear' ? 'Cancella tutto' : 'Backspace');
    keypad.append(keycap);
  }
  keypad.addEventListener('click', event => {
    const button = event.target.closest('button[data-key]');
    if (button) edit(button.dataset.key, button);
  }, options);
  $('vault-assist').addEventListener('click', () => {
    toggleAssist(!assist);
    scene.update();
    (assist ? assisted : $('vault-display')).focus({preventScroll:true});
  }, options);
  assisted.addEventListener('input', () => {
    if (sending || posted) return;
    const value = assisted.value.trim();
    inputMessage = '';
    if (/^\d*$/.test(value)) {
      updateDisplay(normalizeDigits(value).slice(0,8), false);
      saved('draft', draft);
    } else {
      assisted.value = draft;
      inputMessage = 'Usa soltanto cifre da 0 a 9.';
    }
    scene.update();
  }, options);
  send.addEventListener('click', submit, options);
  stage.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing || !canSend) return;
    if (event.key === 'Enter' && [assisted, $('vault-display')].includes(event.target)) {
      event.preventDefault();
      submit();
    } else if (/^\d$|^Backspace$|^Delete$/.test(event.key) &&
        event.target.closest('#vault-entry') && event.target !== assisted) {
      event.preventDefault();
      edit(event.key === 'Delete' ? 'clear' : event.key === 'Backspace' ? 'back' : event.key);
    }
  }, options);
  window.visualViewport?.addEventListener('resize', sizeViewport, options);
  window.visualViewport?.addEventListener('scroll', sizeViewport, options);
  document.addEventListener('visibilitychange', () => {
    stage.toggleAttribute('data-away', document.hidden);
    if (document.hidden) stopVaultAudio();
  }, options);
  if (window.ResizeObserver) {
    resize = new window.ResizeObserver(() => { if (scene && !$('vault-scale').hidden) drawScale(scene.state, beat); });
    resize.observe($('vault-scale'));
  }
}

export function leaveVault() {
  if (!scene) return;
  signals?.abort();
  resize?.disconnect();
  stopVaultAudio();
  toggleAssist(false);
  saved('draft', null);
  saved('send', null);
  stage.removeAttribute('data-beat');
  $('vault-art').replaceChildren();
  scene = key = chart = null;
}

export function renderVault(state, host, callbacks) {
  if (!scene) listened();
  const nextKey = `${state.room.id}/${state.room.manche}/${state.room.round}`;
  scene = {state, host, key:nextKey, ...callbacks};
  stage.dataset.role = host ? 'host' : 'player';
  stage.dataset.effect = state.vault.effect;
  if (nextKey !== key) {
    key = nextKey;
    const savedDraft = saved('draft');
    const savedSend = saved('send');
    draft = savedDraft?.key === key ? savedDraft.value : '';
    posted = savedSend?.key === key ? savedSend.value : undefined;
    if (!draft) saved('draft', null);
    if (!posted) saved('send', null);
    receipt = undefined;
    sending = false;
    inputMessage = '';
    sealUntil = 0;
    beat = lastSecond = tableSignature = chart = null;
    toggleAssist(false);
    stage.removeAttribute('data-beat');
    stage.removeAttribute('data-sealing');
    $('vault-art').replaceChildren();
    updateDisplay(draft, false);
  }
  if (host && !$('vault-art').firstChild) $('vault-art').innerHTML = vaultArt(state.vault.effect,state.room.round===1);
  if (state.me?.done) rememberReceipt(state.me.choice, sending);
  const {vault, room} = state;
  content($('vault-round'), `Domanda ${room.round}/6`);
  content($('vault-category'), `${vault.category} · ${vault.difficulty}`);
  content($('vault-question'), host ? vault.prompt : vault.mobile);
  content($('vault-unit'), `Unità · ${vault.unit}`);
  const presence = `${state.received} conferme · ${state.active} attivi`;
  const counter = $('vault-presence');
  if (host && counter.textContent && counter.textContent !== presence &&
      Number.parseInt(counter.textContent) < state.received && room.phase === 'question') {
    flutter($('vault-clock'), [{boxShadow:'0 0 24px #43d6c0'}, {boxShadow:'none'}], 400);
  }
  content(counter, host ? presence : '');
}

export function tickVault(ms, introMs) {
  if (!scene) return;
  const {state, host} = scene;
  const {room, vault, vault_result:result, me, duration_ms:duration} = state;
  const paused = room.phase === 'paused';
  const intro = paused && room.paused_from === 'question' ? Math.max(0,ms-duration) : introMs;
  const elapsed = result ? Math.max(0,duration-ms) : 0;
  const nextBeat = result ? elapsed >= 7500 ? 'summary' : elapsed >= 5000 ? 'podium' :
    elapsed >= 3000 ? 'solution' : elapsed >= 1000 ? 'rain' : 'verify' : intro > 0 ? 'intro' : 'play';
  const showAnswer = ['solution','podium','summary'].includes(nextBeat);
  const showRank = ['podium','summary'].includes(nextBeat);
  const previousBeat = beat;
  const remaining = Math.max(0,Math.min(duration,ms));
  canSend = !!me && !host && !result && !paused && !intro && remaining > 0;
  stage.toggleAttribute('data-paused', paused);
  stage.toggleAttribute('data-assisted', assist && !receipt && !result);
  stage.toggleAttribute('data-first', room.round === 1);
  if (paused) stopVaultAudio();
  if (nextBeat !== beat) {
    const beatStart = {verify:0, rain:1000, solution:3000, podium:5000, summary:7500}[nextBeat];
    const late = result ? elapsed - beatStart : intro ? Math.max(0,(room.round===1 ? 2000 : 800)-intro) : 0;
    stage.style.setProperty('--vault-delay', `-${Math.round(late)}ms`);
    stage.dataset.beat = beat = nextBeat;
    if (host && previousBeat && result && late < 350) {
      const sound = {verify:'verify', rain:'rain', solution:'solution', podium:'tally'}[beat];
      if (sound) cue(sound);
    }
  }
  const seconds = result ? 0 : Math.ceil((intro || remaining)/1000);
  $('vault-clock').style.setProperty('--arc', String(result ? 100 : (1-remaining/duration)*100));
  stage.toggleAttribute('data-urgent', !result && !intro && seconds <= 5 && seconds > 0);
  if (seconds !== lastSecond) {
    lastSecond = seconds;
    content($('vault-seconds'), String(seconds));
    if (!intro && !result && [20,10,5,0].includes(seconds)) {
      content($('vault-clock-live'), seconds ? `${seconds} secondi rimanenti.` : 'Tempo scaduto.');
    }
    if (!paused && stage.hasAttribute('data-urgent') && previousBeat === beat) {
      flutter($('vault-clock'), [{scale:'1.09'}, {scale:'1'}], 260);
    }
  }
  $('vault-entry').hidden = host || !me || !!receipt || !!result;
  $('vault-hold').hidden = host || !me || showAnswer || !(receipt || result);
  $('vault-art').hidden = !host || (!!result && !['verify','solution','podium'].includes(beat));
  $('vault-answer').hidden = !showAnswer;
  $('vault-scale').hidden = !host || !result || beat === 'verify';
  $('vault-ranking').hidden = !showRank;
  const editLocked = !canSend || sending || !!posted;
  $('vault-assisted-label').hidden = !assist;
  $('vault-number').hidden = assist;
  keypad.hidden = assist;
  if (editLocked !== keypad.hasAttribute('data-locked')) {
    keypad.toggleAttribute('data-locked', editLocked);
    for (const button of keypad.children) button.disabled = editLocked;
  }
  assisted.readOnly = editLocked;
  $('vault-assist').disabled = editLocked;
  send.disabled = !canSend || sending || (!posted && Number(draft) < 1);
  content(send, sending ? 'Invio in corso…' : posted ? 'Riprova invio' : 'Conferma');
  content($('vault-status'), sending ? 'Invio in corso…' : posted && canSend ? 'Conferma non ricevuta.' :
    assist && inputMessage ? inputMessage : draft.length === 8 ? 'Limite di 8 cifre raggiunto.' : !intro && !remaining ? 'Tempo scaduto.' : '');
  if (!$('vault-hold').hidden) {
    const sealing = receipt && window.performance.now() < sealUntil;
    stage.toggleAttribute('data-sealing', !!sealing);
    content($('vault-hold-value'), receipt ? `${format.format(receipt.choice)} ${vault.unit}` : '');
    content($('vault-hold-status'), sealing ? 'RISPOSTA SIGILLATA' : receipt ? 'RISPOSTA BLOCCATA' : 'Tempo scaduto · nessuna risposta');
    content($('vault-hold-joke'), receipt ? sealJokes[(room.round-1)%sealJokes.length] : '');
  }
  const spread = result?.distribution;
  const scattered = spread?.reduce((n,[,count])=>n+count,0) >= 5 && spread.at(-1)[0]/spread[0][0] >= 10;
  const champion = spread?.some(([value])=>value===result.solution);
  const aside = host && room.round % 2 === 0 && (beat === 'rain' && scattered ? 'LE STIME SONO OVUNQUE!' :
    beat === 'podium' && !scattered && champion ? 'ABBIAMO UN CAMPIONE DI PRECISIONE!' : '');
  content($('vault-phase'), paused ? 'In pausa' : aside || ({
    intro:'Preparati', play:remaining ? (receipt ? 'In attesa della sala' : 'Tempo per rispondere') : 'Tempo scaduto',
    verify:'Verifichiamo…', rain:host ? 'Pioggia delle stime' : 'Rivelazione in arrivo',
    solution:'Soluzione', podium:'Podio della domanda', summary:'Classifica generale',
  })[beat]);
  if (result && showAnswer) renderAnswer(result, me, vault, host, room.round, elapsed);
  if (showRank) renderRankings(state, host, beat);
  if (host && result && beat !== 'verify' && previousBeat !== beat) drawScale(state, beat);
}

function renderAnswer(result, me, vault, host, round, elapsed) {
  const exact = !host && me?.choice === result.solution;
  stage.toggleAttribute('data-exact', exact);
  const jokes = me?.done && resultJokes[exact ? 0 : me.points >= 90 ? 1 : me.points >= 40 ? 2 : 3];
  content($('vault-popup'), host ? result.popup : jokes ? jokes[(round-1)%jokes.length] : '');
  const solution = $('vault-solution');
  const number = format.format(result.solution);
  if (solution.dataset.key !== key) {
    solution.dataset.key = key;
    solution.setAttribute('aria-label', number);
    solution.replaceChildren(...Array.from(number,(digit,i) => {
      const reel = document.createElement('span');
      reel.className = /^\d$/.test(digit) ? 'vault-digit' : 'vault-separator';
      reel.setAttribute('aria-hidden','true');
      reel.textContent = digit;
      if (reel.className === 'vault-digit' && beat === 'solution' && elapsed < 3650) {
        reel.dataset.reel = Array.from({length:4},(_,j) => (Number(digit)+6+j)%10).join('\n');
        reel.style.setProperty('--i',String(i));
      }
      return reel;
    }));
  }
  content($('vault-solution-unit'), vault.unit);
  content($('vault-explanation'), result.explanation);
  const source = $('vault-source');
  source.hidden = !result.source;
  if (result.source && source.getAttribute('href') !== result.source) source.href = result.source;
  content($('vault-personal'), host ? '' : me?.done ?
    `${exact ? 'Stima esatta' : 'La tua stima'} · ${format.format(me.choice)} ${vault.unit} · ${me.points} punti` :
    'Nessuna risposta · 0 punti');
}

function row(label, value) {
  const li = document.createElement('li');
  const name = document.createElement('span');
  const score = document.createElement('strong');
  name.textContent = label;
  score.textContent = value;
  li.append(name,score);
  return li;
}

export function vaultRankGroups(players) {
  const ranks = new Map();
  for (const player of players) {
    if (player.rank > 3) break;
    if (!ranks.has(player.rank)) ranks.set(player.rank, []);
    ranks.get(player.rank).push(player);
  }
  return ranks;
}

function renderRankings(state, host, phase) {
  const {players, me, vault_result:result} = state;
  const podium = $('vault-podium'), leaders = $('vault-leaders');
  podium.hidden = !host || phase === 'summary' || !result.podium.length;
  leaders.hidden = !host;
  const cumulativeRank = players.find(player=>player.user_id===me?.user_id)?.rank;
  content($('vault-total'), host ? '' : [me?.rank ? `${me.rank}° nella domanda` : '', cumulativeRank ?
    `${cumulativeRank}° nella classifica · ${me.score} punti totali` : ''].filter(Boolean).join(' · '));
  if (!host || tableSignature === key) return;
  tableSignature = key;
  podium.replaceChildren(...result.podium.map(({rank, players, points}) => {
    const guesses = new Map();
    for (const {choice} of players) guesses.set(choice,(guesses.get(choice)||0)+1);
    const names = players.map(p=>`${p.nickname} (${format.format(p.choice)})`).join(' · ');
    const label = players.length > 1 && names.length > 46
      ? `${rank}° ex aequo · ${players.length} giocatori · ${[...guesses].map(([value,count])=>`${format.format(value)} ×${count}`).join(' / ')}`
      : `${rank}° · ${names}`;
    const item = row(label,`+${points} pt`);
    item.dataset.rank = rank;
    return item;
  }));
  leaders.replaceChildren(...[...vaultRankGroups(players)].map(([rank, group]) =>
    row(`${rank}° · ${group.length === 1 ? group[0].nickname : `Ex aequo · ${group.length} giocatori`}`,`${group[0].score} pt`)));
}

function svg(tag, attributes = {}, label = '') {
  const element = document.createElementNS(svgNS, tag);
  for (const [name,value] of Object.entries(attributes)) element.setAttribute(name,value);
  if (label) element.textContent = label;
  return element;
}

export function vaultDomain(distribution, solution) {
  const low = distribution[0]?.[0] ?? solution;
  const high = distribution.at(-1)?.[0] ?? solution;
  const min = Math.min(low, solution ?? low);
  const max = Math.max(high, solution ?? high);
  const log = max/min >= 10;
  const start = min === max ? min - .5 : min;
  const end = min === max ? max + .5 : max;
  const scale = log ? Math.log10 : value => value;
  return {
    log, position:value => (scale(value)-scale(start))/(scale(end)-scale(start)),
    ticks:Array.from({length:4}, (_,i) => {
      if (i === 0) return start;
      if (i === 3) return end;
      const tick = scale(start) + (scale(end)-scale(start))*i/3;
      return log ? 10 ** tick : tick;
    }),
  };
}

function drawScale(state, phase) {
  const axis = $('vault-axis');
  const {distribution, solution} = state.vault_result;
  const revealed = phase !== 'rain';
  const width = Math.max(240, Math.round(axis.clientWidth));
  if (chart?.key === key && chart.revealed === revealed && chart.width === width) return;
  const label = $('vault-scale-label');
  axis.setAttribute('viewBox', `0 0 ${width} 98`);
  if (!revealed && !distribution.length) {
    if (axis.firstChild) axis.replaceChildren();
    axis.setAttribute('aria-label','Nessuna stima ricevuta');
    content(label, 'Nessuna stima ricevuta');
    return;
  }
  const domain = vaultDomain(distribution, revealed ? solution : undefined);
  const x = value => 54 + domain.position(value) * (width - 108);
  content(label, `${domain.log ? 'Scala logaritmica' : 'Scala lineare'} · ${state.vault.unit}`);
  const count = distribution.reduce((n,[,quantity])=>n+quantity,0);
  axis.setAttribute('aria-label', `${label.textContent} · ${count} stime${revealed ? ` · Soluzione ${format.format(solution)}` : ''}`);
  if (chart?.key !== key || !axis.firstChild) {
    const defs = svg('defs');
    defs.append(svg('circle',{id:'vault-dot', r:5}));
    const marks = svg('g',{class:'vault-ticks'});
    const dots = svg('g',{class:'vault-dots'});
    const gold = svg('g',{class:'vault-true'});
    const groups = distribution.map(([value, count], i) => {
      const group = svg('g',{class:'vault-position'});
      const dot = svg('g',{class:'vault-drop',style:`--i:${i%14}`});
      dot.append(svg('use',{href:'#vault-dot'}));
      group.append(dot, svg('text',{y:-9, 'text-anchor':'middle'}));
      dots.append(group);
      return {value, count, group};
    });
    axis.replaceChildren(defs, marks, dots, gold);
    chart = {key, marks, groups, gold};
  }
  Object.assign(chart, {width, revealed});
  chart.marks.replaceChildren(svg('path',{d:`M54 70H${width-54}`}), ...domain.ticks.flatMap(value => {
    const at = x(value);
    return [
      svg('path',{d:`M${at} 66v8`}),
      svg('text',{x:at,y:92,'text-anchor':'middle'},format.format(value)),
    ];
  }));
  const lanes = [0,0,0,0];
  let dense, lastLabel = 0;
  for (const {value, count, group} of chart.groups) {
    const at = x(value);
    const free = lanes.findIndex(previous => at - previous >= 16);
    const lane = free < 0 ? 3 : free;
    lanes[lane] = at;
    const translate = `translate(${at}px,${60-lane*14}px)`;
    if (group.style.transform !== translate) group.style.transform = translate;
    const number = group.lastElementChild;
    if (free < 0 && dense && at-lastLabel<34) {
      dense.count += count;
      content(dense.label,`×${dense.count}`);
      content(number,'');
    } else if (count>1 || free<0) {
      if (dense && at-lastLabel<34) {
        dense.count += count;
        content(dense.label,`×${dense.count}`);
        content(number,'');
      } else {
        lastLabel = at;
        dense = {label:number,count};
        content(number,`×${count}`);
      }
    } else content(number,'');
  }
  if (revealed) {
    const at = x(solution);
    chart.gold.replaceChildren(svg('path',{d:`M54 70H${at}V12`}), svg('circle',{cx:at,cy:70,r:6}));
  }
}

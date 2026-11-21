import QRCode from 'qrcode';
import {renderPrice, showPriceBackground, tickPrice} from './pokeprice.js';
const $=id=>document.getElementById(id);
const pixelStart=40*2/3,pixelEnd=3;
const show=(id,visible)=>$(id).hidden=!visible;
const text=(tag,value,className)=>{const e=document.createElement(tag);e.textContent=value;if(className)e.className=className;return e;};
const route=location.pathname.split('/').filter(Boolean).at(-1)||'play';
const base=new URL('../',location.href);
const params=new URLSearchParams(location.search);
let user,dashboard,state,roomId=params.get('room'),channel,offset=0,refreshing=false,cardRound=0,cardAsset=null,busy=false,answerRequest=null,deadlineRequested=false,qrCode='',reconnectTimer,reconnectDelay=500,previousRanks=new Map(),previousRankRoom=null;
let inviteToken=new URLSearchParams(location.hash.slice(1)).get('token');
if(inviteToken){sessionStorage.setItem('goku-invite',inviteToken);history.replaceState(null,'',location.pathname+location.search);}
else if(route==='invite')inviteToken=sessionStorage.getItem('goku-invite');
const notice=s=>{$('notice').textContent=s;};
const error=s=>{$('error').textContent=s;};
async function rpc(action,payload={}){const start=Date.now();const response=await fetch('/api/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,payload})});const data=await response.json();if(!response.ok||data.error)throw Error(data.error||'Errore di connessione');if(data.server_now)offset=new Date(data.server_now).getTime()-(start+Date.now())/2;return data;}

function bind(id,handler,event='click'){$(id).addEventListener(event,async e=>{e.preventDefault();if(busy)return;busy=true;const button=e.currentTarget.tagName==='FORM'?e.currentTarget.querySelector('button'):e.currentTarget;if(button.tagName==='BUTTON')button.disabled=true;error('');try{await handler(e);}catch(e){error(e.message);}finally{busy=false;if(button.tagName==='BUTTON')button.disabled=false;tick();}});}
async function loadDashboard(){dashboard=await rpc('dashboard');if(route==='admin'&&!dashboard.admin)throw Error('Area riservata all’amministratore.');show('dashboard',true);show('admin-tools',route==='admin'&&dashboard.admin);show('license-select-label',!dashboard.admin);show('auth',false);show('logout',true);$('licenses').replaceChildren();$('license-select').replaceChildren();
 for(const l of dashboard.licenses){const box=text('div','', 'license');box.append(text('strong',`${l.name||`Host ${l.id.slice(0,8)}`} · ${l.status}`),text('p',`${new Date(l.starts_at).toLocaleString()} → ${new Date(l.expires_at).toLocaleString()}`),text('p',`Stanze: ${l.used_rooms} / ${l.max_rooms} · Quiz: ${l.quizzes.map(q=>q==='culture'?'Cultura generale':'Pokémon').join(', ')}`));
  if(dashboard.admin&&l.status!=='revocato'){const revoke=text('button','Revoca');revoke.onclick=async()=>{revoke.disabled=true;try{await rpc('license_revoke',{license_id:l.id});await loadDashboard();}catch(e){error(e.message);revoke.disabled=false;}};box.append(revoke);}
  $('licenses').append(box);if(l.status==='attivo'&&l.used_rooms<l.max_rooms){const option=text('option',`${l.name||`Host ${l.id.slice(0,8)}`} · ${l.max_rooms-l.used_rooms} stanze · scade ${new Date(l.expires_at).toLocaleString()}`);option.value=l.id;$('license-select').append(option);}}
 if(!dashboard.licenses.length)$('licenses').append(text('p',dashboard.admin?'Nessuna licenza generata.':'Nessuna licenza associata. Apri il tuo invito personale e riscattalo.'));
 const allowed=new Set(dashboard.admin?['pokemon','culture']:dashboard.licenses.flatMap(l=>l.quizzes||['pokemon']));for(const option of $('quiz').options){option.hidden=!allowed.has(option.value);option.disabled=!allowed.has(option.value);}if(!allowed.has($('quiz').value))$('quiz').value=allowed.has('culture')?'culture':'pokemon';
 $('create-room').disabled=!dashboard.admin&&!$('license-select').options.length;
 $('rooms').replaceChildren();for(const r of dashboard.rooms){const box=text('div','', 'room-item');box.append(text('strong',`PIN ${r.code} · ${r.quiz==='culture'?'Cultura generale':'Pokémon'}`),text('p',`Stato: ${r.phase} · ${r.quiz==='culture'?`Confronto ${r.round}/10 · manche 1/3`:r.manche==='price'?'PokéPrice '+(r.round-12)+'/12':r.manche==='clues'?'Indizio '+(r.round-6)+'/6':'Carta '+r.round+'/6'}`));const open=text('button','Apri stanza');open.onclick=()=>{location.href=`?room=${r.id}`;};box.append(open);
  if(dashboard.admin&&r.phase!=='finished'){const end=text('button','Interrompi');end.onclick=async()=>{end.disabled=true;try{const s=await rpc('state',{room_id:r.id});await rpc('command',{room_id:r.id,revision:s.room.revision,command:'end'});await loadDashboard();}catch(e){error(e.message);end.disabled=false;}};box.append(end);}$('rooms').append(box);}
 if(!dashboard.rooms.length)$('rooms').append(text('p','Nessuna stanza.'));
}
async function start(){user=await rpc('identity');
 if(route==='play'){show('join-panel',!roomId);$('code').value=params.get('code')||'';if(roomId)await openRoom();}
 else if(route==='invite'){show('invite',true);if(!inviteToken)throw Error('Link di invito mancante o non valido.');await redeem();}
 else if(route==='admin'&&user.role!=='admin'){show('auth',true);notice('Inserisci la password amministratore.');}
 else if(user.role==='player'){notice('Per diventare Host apri un link generato dall’amministratore.');}
 else {show('logout',true);if(roomId)await openRoom();else await loadDashboard();}
}
bind('password-form',async()=>{await rpc('login',{password:$('password').value});$('password').value='';show('auth',false);notice('');await start();},'submit');
bind('logout',async()=>{await rpc('logout');sessionStorage.removeItem('goku-invite');location.href=base.href+route+'/';});
async function redeem(){if(!inviteToken)throw Error('Invito mancante.');await rpc('redeem',{token:inviteToken});sessionStorage.removeItem('goku-invite');inviteToken=null;location.replace(base.href+'host/');}
bind('redeem',redeem);
bind('license-form',async e=>{const f=new FormData(e.currentTarget);const result=await rpc('license_create',{name:f.get('name'),hours:Number(f.get('hours')),max_rooms:Number(f.get('max_rooms')),quizzes:f.getAll('quizzes')});$('invite-link').value=base.href+'invite/#token='+result.token;show('invite-result',true);await loadDashboard();},'submit');
bind('copy-invite',async()=>{try{await navigator.clipboard.writeText($('invite-link').value);notice('Link copiato.');}catch{$('invite-link').select();notice('Selezionato: copia il link manualmente.');}});
bind('create-form',async()=>{const r=await rpc('create',{quiz:$('quiz').value,license_id:$('license-select').value||null});location.href=`?room=${r.id}`;},'submit');
bind('join-form',async()=>{const r=await rpc('join',{code:$('code').value.trim(),nickname:$('nickname').value});roomId=r.id;history.replaceState(null,'',`?room=${roomId}`);await openRoom();},'submit');
bind('fullscreen',async()=>{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();});
for(const button of document.querySelectorAll('[data-command]'))button.addEventListener('click',async()=>{if(busy)return;busy=true;try{error('');if(button.dataset.command==='start'&&state.room.quiz!=='culture')$('music').play().catch(()=>{});await rpc('command',{room_id:roomId,revision:state.room.revision,command:button.dataset.command});await refresh();}catch(e){error(e.message);await refresh();}finally{busy=false;}});
bind('answer-form',async()=>{const answer=$('answer').value.trim();const request=answerRequest?.answer===answer&&answerRequest.round===state.room.round?answerRequest:{answer,round:state.room.round,request_id:crypto.randomUUID()};answerRequest=request;const result=await rpc('answer',{room_id:roomId,...request});answerRequest=null;
 $('feedback').textContent=result.result==='invalid'?'Nome errato, riprova':result.result==='correct'?`Hai vinto ${result.points} punti!`:result.done?'Peccato, hai sbagliato':`Non è questo Pokémon! Restano ${3-result.attempts} tentativi.`;
 if(result.result==='wrong'&&!result.done)$('answer').value='';await refresh();},'submit');
for(const choice of ['higher','lower']) bind('price-'+choice,async()=>{
 const round=state.room.round;
 const request=answerRequest?.answer===choice&&answerRequest.round===round
   ?answerRequest:{answer:choice,round,request_id:crypto.randomUUID()};
 answerRequest=request;
 tick();
 try{
  const result=await rpc('answer',{room_id:roomId,...request});
  if(state.room.round===round&&state.me)Object.assign(state.me,result);
  answerRequest=null;
 }finally{await refresh();renderRoom();}
});
$('population-match').addEventListener('click',async event=>{
 const button=event.target.closest('button[data-country]');
 if(!button||busy||!state?.me)return;
 busy=true;
 const round=state.room.round;
 button.classList.add('population-selected');
 button.setAttribute('aria-pressed','true');
 button.disabled=true;
 $('population-feedback').textContent=`Hai scelto ${button.querySelector('.population-name').textContent}.`;
 const request=answerRequest?.answer===button.dataset.country&&answerRequest.round===round
  ?answerRequest:{answer:button.dataset.country,round,request_id:crypto.randomUUID()};
 answerRequest=request;
 try{
  const result=await rpc('answer',{room_id:roomId,...request});
  answerRequest=null;
  if(state.room.round===round)Object.assign(state.me,result);
 }catch(e){error(e.message);}
 finally{await refresh();busy=false;renderRoom();}
});
$('music').volume=.7;$('volume').oninput=()=>{$('music').volume=Number($('volume').value)/100;};
function syncMusic(){
 const music=$('music'),r=state.room;if(r.quiz==='culture'){music.pause();show('enable-audio',false);return;}
 const tracks={cards:'Pokemon FireRedLeafGreen- Pallet Town.mp3',clues:'assets/audio/oak-notebook.m4a',price:'assets/audio/castelia-card-market.m4a'};
 const src=new URL(tracks[r.manche||'cards'],base).href;
 if(music.src!==src){music.pause();music.src=src;music.load();}
 if(!state.can_control||['lobby','paused','finished'].includes(r.phase)){music.pause();show('enable-audio',false);return;}
 if(music.paused)music.play().then(()=>show('enable-audio',false)).catch(()=>show('enable-audio',true));
}
bind('enable-audio',async()=>{await $('music').play();show('enable-audio',false);});
$('volume').addEventListener('input',()=>{if(state)syncMusic();});
window.addEventListener('pagehide',()=>$('music').pause());
async function openRoom(){show('dashboard',false);show('join-panel',false);show('room',true);$('back').href=route==='play'?base.href+'play/':base.href+route+'/';$('back').textContent=route==='play'?'Entra in un’altra stanza':'Torna alla dashboard';
 await refresh();connectSocket();}
function connectSocket(){clearTimeout(reconnectTimer);if(channel){channel.onclose=null;channel.close();}const url=new URL('/api/socket',location.origin);url.protocol=location.protocol==='https:'?'wss:':'ws:';url.searchParams.set('room',roomId);channel=new WebSocket(url);
 channel.onopen=()=>{reconnectDelay=500;notice('');};
 channel.onmessage=e=>{state=JSON.parse(e.data);offset=new Date(state.server_now).getTime()-Date.now();deadlineRequested=state.room.phase!=='question'?false:deadlineRequested;renderRoom();};
 channel.onclose=()=>{notice('Connessione interrotta. Riconnessione in corso…');reconnectTimer=setTimeout(connectSocket,reconnectDelay+Math.random()*300);reconnectDelay=Math.min(15000,reconnectDelay*2);};
 channel.onerror=()=>channel.close();
}

async function refresh(){if(!roomId||refreshing)return;refreshing=true;try{const snapshot=await rpc('state',{room_id:roomId});if(snapshot.room.revision<state?.room.revision)return;state=snapshot;deadlineRequested=state.room.phase!=='question'?false:deadlineRequested;renderRoom();}catch(e){notice('Riconnessione: '+e.message);}finally{refreshing=false;}}
function left(){return !state?0:state.room.phase==='paused'?state.remaining_ms:Math.max(0,Math.min(state.duration_ms||30000,new Date(state.room.deadline).getTime()-Date.now()-offset));}
function renderPopulation(){
 const {countries,values,correct}=state.population,format=new Intl.NumberFormat('it-IT');
 countries.forEach((country,i)=>{
  const button=$(`population-${i?'b':'a'}`),selected=state.me?.choice===country.id;
  button.dataset.country=country.id;
  button.querySelector('.population-name').textContent=country.name;
  button.querySelector('.population-value').textContent=values?`${format.format(values[i])} abitanti`:'';
  button.classList.toggle('population-winner',!!values&&country.id===correct);
  button.classList.toggle('population-selected',selected);
  button.setAttribute('aria-pressed',String(selected));
  button.disabled=busy||state.can_control||state.room.phase!=='question'||Date.now()+offset<new Date(state.room.starts_at).getTime()||!!state.me?.done;
 });
 const chosen=countries.find(country=>country.id===state.me?.choice);
 $('population-feedback').textContent=state.me?.result==='correct'&&['reveal','finished'].includes(state.room.phase)?'Risposta esatta!':state.me?.result==='wrong'&&['reveal','finished'].includes(state.room.phase)?'Risposta sbagliata.':chosen?`Hai scelto ${chosen.name}. In attesa della rivelazione.`:'';
}
function renderRoom(){const r=state.room,host=state.can_control,active=['question','paused'].includes(r.phase),lobby=r.phase==='lobby',final=r.phase==='finished',clues=r.manche==='clues',culture=r.quiz==='culture',price=state.price,checkpoint=price&&r.phase==='reveal'&&price.round%3===0;document.body.className=(host?'host':'player')+' '+r.phase+(clues?' gameboy':'')+(culture?' culture-quiz':'')+(price?' pokeprice':'')+(checkpoint?' price-checkpoint':'');
 document.querySelector('h1').textContent=price?'PokéPrice':clues?'PokéIndizi':culture?'Cultura generale':'Pixelcard';
 show('clue-stage',clues&&!final);show('question-prompt',!host&&!clues&&!price&&!culture);show('clue-reveal',clues&&!!state.solution_image);show('culture-stage',culture&&r.round>0);if(culture&&state.population){$('culture-prompt').textContent=`Higher or lower — Quale nazione ha più abitanti? · stime ${state.population.year}`;renderPopulation();}
 if(clues){const unlocked=state.clues||[];if(JSON.stringify(unlocked)!==$('clues').dataset.content){$('clues').dataset.content=JSON.stringify(unlocked);$('clues').replaceChildren(...unlocked.map((c,i)=>text('p',`${i+1}. ${c}`,'clue-dialog')));}
 if(state.solution_image){$('clue-image').src=base.href+state.solution_image;$('clue-image').alt='Sprite di '+state.solution;$('clue-caption').textContent=`${state.solution}${state.me?' · '+(state.me.points||0)+' punti':''}`;}
 if(state.me?.result==='correct')$('feedback').textContent=`Hai vinto ${state.me.points} punti!`;}
 show('skip-hint',host&&!clues&&!culture&&!price&&!lobby&&!final);
 show('price-shortcut',host&&clues&&!final);
 show('lobby',lobby);
 show('question',!price&&(active||((host||clues||culture)&&r.phase==='reveal')||(clues&&final&&!!state.solution_image)));
 show('price-stage',!!price&&!final);
 showPriceBackground(!!price&&!final);
 show('results',culture&&r.round>0||final||(!price&&r.phase==='reveal')||!!checkpoint);show('controls',host&&!final);show('fullscreen',host);show('audio-control',host&&!lobby&&!final&&!culture);show('revoked',route!=='play'&&!host);show('card-wrap',host&&!clues&&!price&&!culture);show('answer-form',!!state.me&&active&&!price&&!culture);show('population-match',culture&&r.round>0);show('paused',r.phase==='paused');$('room-code').textContent=r.code;$('round').textContent=lobby?'Lobby':price?`Round ${price.round}/${price.total}`:clues?`PokéIndizi ${r.round-6}/6`:culture?`Confronto ${r.round}/10 · manche ${r.manche}/${r.manche_total}`:`Carta ${r.round}/6`;$('received').textContent=`${state.received}/${state.players.length} risposte inviate`;
 if(lobby){$('big-code').textContent=r.code;const url=base.href+'play/?code='+r.code;$('join-link').textContent=url;$('join-link').href=url;if(qrCode!==r.code){qrCode=r.code;QRCode.toCanvas($('qr'),url,{width:280,margin:4}).catch(e=>error(e.message));}$('lobby-players').replaceChildren(...state.players.map(p=>text('span',`${p.connected?'●':'○'} ${p.nickname}${p.connected?'':' · disconnesso'}`,'player-chip'+(p.connected?'':' offline'))));}
 if($('answer').dataset.round!==String(r.round)){deadlineRequested=false;$('answer').value='';$('answer').dataset.round=r.round;$('feedback').textContent='';answerRequest=null;}
 if(host&&!clues&&!culture&&!price&&r.round>0&&cardRound!==r.round){cardRound=r.round;cardAsset=null;$('card').className='card reset';rpc('card',{room_id:roomId}).then(({asset})=>{const img=new Image();img.onload=()=>{if(cardRound!==r.round)return;cardAsset=img;$('pokemon').src=img.src;$('card').style.aspectRatio=`${img.naturalWidth}/${img.naturalHeight}`;setTimeout(()=>{
 if(state.room.round!==r.round||cardRound!==r.round)return;
 $('card').className=['question','paused'].includes(state.room.phase)?'card flipped':'card flipped revealed';
 tick();
 },250);};img.onerror=()=>{cardRound=0;error('Impossibile caricare la carta.');};img.src=base.href+asset;}).catch(e=>{cardRound=0;error(e.message);});}
 if(!active&&r.round>0&&!culture)$('card').classList.add('revealed');
 for(const b of document.querySelectorAll('[data-command]')){const c=b.dataset.command;b.hidden=!(c==='end'||c==='start'&&lobby||c==='pause'&&r.phase==='question'||c==='resume'&&r.phase==='paused'||c==='next'&&r.phase==='reveal');if(c==='next')b.textContent=price?(price.round===price.total?'Mostra podio':'Prossimo round'):culture?(r.round===10?'Mostra podio':'Prossimo confronto'):r.round===6?'Avvia PokéIndizi':'Prossima domanda';}
 if(culture&&r.round>0||final||(!price&&r.phase==='reveal')||checkpoint){$('results-title').textContent=final?'Podio finale':culture&&r.phase!=='reveal'?'Classifica attuale':price?'Classifica intermedia':'Soluzione e classifica';$('solution').textContent=culture&&state.population?.values?`${state.population.countries[state.population.values[1]>state.population.values[0]?1:0].name} ha più abitanti (${new Intl.NumberFormat('it-IT').format(Math.max(...state.population.values))}, stima ${state.population.year}).`:state.solution?`È ${state.solution}!`:'';const me=state.players.find(p=>p.user_id===user?.id);$('personal').textContent=me?`${me.nickname}: ${me.score} punti · posizione ${me.rank}`:'';if(culture&&previousRankRoom!==r.id){previousRanks.clear();previousRankRoom=r.id;}$('ranking').replaceChildren(...state.players.map(p=>{const movement=culture?(previousRanks.get(p.user_id)||p.rank)-p.rank:0,li=text('li','',movement>0?'rank-up':movement<0?'rank-down':'');li.append(text('span',`${p.rank}. ${p.nickname}${movement>0?' ▲':movement<0?' ▼':''}`),text('strong',`${p.score} pt`));return li;}));previousRanks=new Map(state.players.map(p=>[p.user_id,p.rank]));$('podium').replaceChildren();if(final){$('music').pause();for(const p of state.players.filter(p=>p.rank<=3)){const box=text('div','', 'winner');box.append(text('span',p.rank===1?(state.players.filter(x=>x.rank===1).length>1?'Vincitore ex aequo':'Vincitore'):`${p.rank}° posto`),text('strong',p.nickname),text('span',`${p.score} punti`));$('podium').append(box);}}}
 if(price&&!final)renderPrice(state,host);
 syncMusic();
 tick();}
function tick(){if(!state)return;const r=state.room,ms=left(),pre=r.phase==='question'&&Date.now()+offset<new Date(r.starts_at).getTime();show('clue-intro',r.manche==='clues'&&r.round===7&&pre);$('seconds').textContent=pre&&r.quiz==='culture'?`Partenza ${Math.ceil((new Date(r.starts_at).getTime()-Date.now()-offset)/1000)}s`:pre?'Pronti…':`${Math.ceil(ms/1000)}s`;const enabled=r.phase==='question'&&!pre&&ms>0&&!state.me?.done&&!busy;$('answer').disabled=$('submit').disabled=!enabled;for(const button of $('population-match').querySelectorAll('button'))button.disabled=!enabled||state.can_control||!!state.me?.done;
 if(state.price&&r.phase!=='finished'){
  const introMs=pre?new Date(r.starts_at).getTime()-Date.now()-offset:0;
  tickPrice(state,ms,pre,introMs,enabled&&!!state.me&&!state.can_control);
  if(state.can_control)document.querySelector('[data-command="pause"]').hidden=pre||r.phase!=='question';
 }
 if(!state.price&&r.manche!=='clues'&&cardAsset&&['question','paused'].includes(r.phase)){const blockSize=pixelEnd+(pixelStart-pixelEnd)*ms/30000,width=Math.ceil(310/blockSize),height=Math.round(width*cardAsset.naturalHeight/cardAsset.naturalWidth),canvas=$('pixels');if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;canvas.getContext('2d').drawImage(cardAsset,0,0,width,height);}}
 if(r.phase==='question'&&ms===0&&!deadlineRequested&&!refreshing){deadlineRequested=true;refresh();}}
setInterval(tick,100);
window.addEventListener('online',()=>{if(roomId)connectSocket();});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){if(roomId){refresh();if(!channel||channel.readyState!==WebSocket.OPEN)connectSocket();}else if(dashboard)loadDashboard().catch(e=>error(e.message));}});start().catch(e=>error(e.message));

document.addEventListener('keydown', async event => {
 if (!event.shiftKey || event.key.toLowerCase() !== 'n' || event.ctrlKey || event.altKey || event.metaKey || event.repeat || event.isComposing || busy) return;
 if (event.target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]')) return;
 if (route === 'play' || !state?.can_control || state.room.manche === 'price' || state.room.quiz === 'culture' || !['question','paused','reveal'].includes(state.room.phase)) return;
 event.preventDefault(); busy = true;
 try { await rpc('command',{room_id:roomId,revision:state.room.revision,command:state.room.manche==='clues'?'skip_to_price':'skip_to_clues'}); await refresh(); }
 catch(e) { error(e.message); await refresh(); } finally { busy = false; }
});

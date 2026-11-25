import QRCode from 'qrcode';
import {renderPrice, showPriceBackground, tickPrice} from './pokeprice.js';
import {chronologySelection, renderChronology, tickChronology} from './chronology.js';
import {meadowSelection, renderMeadow, tickMeadow} from './meadow.js';
import {leaveVault, renderVault, stopVaultAudio, tickVault, toggleVaultAudio, vaultAudioEnabled, vaultRankGroups} from './number-vault.js';
const $=id=>document.getElementById(id);
const pixelStart=40*2/3,pixelEnd=3;
const show=(id,visible)=>$(id).hidden=!visible;
function vaultViewport(active){
 const viewport=document.querySelector('meta[name="viewport"]');
 const value='width=device-width,initial-scale=1'+(active?',viewport-fit=cover':'');
 if(viewport.content!==value)viewport.content=value;
}
const text=(tag,value,className)=>{const e=document.createElement(tag);e.textContent=value;if(className)e.className=className;return e;};
const populationText=(node,value)=>{
 if(node.textContent!==value)node.replaceChildren(...(value?[text('span',value,'population-change')]:[]));
};
const route=location.pathname.split('/').filter(Boolean).at(-1)||'play';
const base=new URL('../',location.href);
const params=new URLSearchParams(location.search);
let user,dashboard,state,roomId=params.get('room'),channel,offset=0,refreshing=false,cardRound=0,cardAsset=null,busy=false,answerRequest=null,deadlineRequested=false,qrCode='',reconnectTimer,reconnectDelay=500,previousRanks=new Map(),previousRankRoom=null;
let roomUnavailable=false;
let inviteToken=new URLSearchParams(location.hash.slice(1)).get('token');
if(inviteToken){sessionStorage.setItem('goku-invite',inviteToken);history.replaceState(null,'',location.pathname+location.search);}
else if(route==='invite')inviteToken=sessionStorage.getItem('goku-invite');
const notice=s=>{$('notice').textContent=s;};
const error=s=>{$('error').textContent=s;};
const cultureRound=(r,total=5)=>r.manche===4?`Prato fiorito ${r.round}/5`:r.manche===3?`Quanto ci vai vicino? ${r.round}/6`:r.manche===2?`Cronologia ${r.round}/${total}`:`Confronto ${r.round}/10 · manche ${r.manche}/${r.manche_total}`;
async function rpc(action,payload={}){
 const start=Date.now();
 let response;
 try{
  response=await fetch('/api/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,payload}),signal:window.AbortSignal?.timeout?.(8000)});
 }catch{throw Object.assign(Error('Connessione non disponibile. Riprova.'),{status:0});}
 const data=await response.json().catch(()=>null);
 if(!response.ok||!data||data.error)throw Object.assign(Error(data?.error||'Servizio temporaneamente non disponibile. Riprova.'),{status:response.status});
 if(data.server_now)offset=new Date(data.server_now).getTime()-(start+Date.now())/2;
 return data;
}

function bind(id,handler,event='click'){$(id).addEventListener(event,async e=>{e.preventDefault();if(busy)return;busy=true;const button=e.currentTarget.tagName==='FORM'?e.currentTarget.querySelector('button'):e.currentTarget;if(button.tagName==='BUTTON')button.disabled=true;error('');try{await handler(e);}catch(e){error(e.message);}finally{busy=false;if(button.tagName==='BUTTON')button.disabled=false;tick();}});}
async function loadDashboard(){dashboard=await rpc('dashboard');if(route==='admin'&&!dashboard.admin)throw Error('Area riservata all’amministratore.');show('dashboard',true);show('admin-tools',route==='admin'&&dashboard.admin);show('license-select-label',!dashboard.admin);show('auth',false);show('logout',true);$('licenses').replaceChildren();$('license-select').replaceChildren();
 for(const l of dashboard.licenses){const box=text('div','', 'license');box.append(text('strong',`${l.name||`Host ${l.id.slice(0,8)}`} · ${l.status}`),text('p',`${new Date(l.starts_at).toLocaleString()} → ${new Date(l.expires_at).toLocaleString()}`),text('p',`Stanze: ${l.used_rooms} / ${l.max_rooms} · Quiz: ${l.quizzes.map(q=>q==='culture'?'Cultura generale':'Pokémon').join(', ')}`));
  if(dashboard.admin&&l.status!=='revocato'){const revoke=text('button','Revoca');revoke.onclick=async()=>{revoke.disabled=true;try{await rpc('license_revoke',{license_id:l.id});await loadDashboard();}catch(e){error(e.message);revoke.disabled=false;}};box.append(revoke);}
  $('licenses').append(box);if(l.status==='attivo'&&l.used_rooms<l.max_rooms){const option=text('option',`${l.name||`Host ${l.id.slice(0,8)}`} · ${l.max_rooms-l.used_rooms} stanze · scade ${new Date(l.expires_at).toLocaleString()}`);option.value=l.id;$('license-select').append(option);}}
 if(!dashboard.licenses.length)$('licenses').append(text('p',dashboard.admin?'Nessuna licenza generata.':'Nessuna licenza associata. Apri il tuo invito personale e riscattalo.'));
 const allowed=new Set(dashboard.admin?['pokemon','culture']:dashboard.licenses.flatMap(l=>l.quizzes||['pokemon']));for(const option of $('quiz').options){option.hidden=!allowed.has(option.value);option.disabled=!allowed.has(option.value);}if(!allowed.has($('quiz').value))$('quiz').value=allowed.has('culture')?'culture':'pokemon';
 show('vault-mode-label',$('quiz').value==='culture');
 $('create-room').disabled=!dashboard.admin&&!$('license-select').options.length;
 $('rooms').replaceChildren();for(const r of dashboard.rooms){const box=text('div','', 'room-item');box.append(text('strong',`PIN ${r.code} · ${r.quiz==='culture'?'Cultura generale':'Pokémon'}`),text('p',`Stato: ${r.phase} · ${r.quiz==='culture'?cultureRound(r):r.manche==='price'?'PokéPrice '+(r.round-12)+'/12':r.manche==='clues'?'Indizio '+(r.round-6)+'/6':'Carta '+r.round+'/6'}`));const open=text('button','Apri stanza');open.onclick=()=>{location.href=`?room=${r.id}`;};box.append(open);
  if(dashboard.admin&&r.phase!=='finished'){const end=text('button','Interrompi');end.onclick=async()=>{end.disabled=true;try{const s=await rpc('state',{room_id:r.id});await rpc('command',{room_id:r.id,revision:s.room.revision,command:'end'});await loadDashboard();}catch(e){error(e.message);end.disabled=false;}};box.append(end);}$('rooms').append(box);}
 if(!dashboard.rooms.length)$('rooms').append(text('p','Nessuna stanza.'));
}
async function start(){user=await rpc('identity');error('');
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
$('quiz').addEventListener('change',()=>show('vault-mode-label',$('quiz').value==='culture'));
bind('create-form',async()=>{
 try{
  const r=await rpc('create',{quiz:$('quiz').value,...($('quiz').value==='culture'?{vault_mode:$('vault-mode').value}:{}),license_id:$('license-select').value||null});
  location.href=`?room=${r.id}`;
 }catch(e){
  if(e.status===0||e.status>=500){
   await loadDashboard().catch(()=>{});
   throw Error('Creazione non confermata. Controlla le stanze in dashboard prima di riprovare.');
  }
  throw e;
 }
},'submit');
bind('join-form',async()=>{
 if(!user)user=await rpc('identity');
 const r=await rpc('join',{code:$('code').value.trim(),nickname:$('nickname').value});
 roomId=r.id;
 history.replaceState(null,'',`?room=${roomId}`);
 await openRoom();
},'submit');
bind('fullscreen',async()=>{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();});
const labelFullscreen=()=>{$('fullscreen').textContent=(!$('chronology-stage').hidden||!$('meadow-stage').hidden||!$('vault-stage').hidden||document.body.classList.contains('population-quiz'))&&document.fullscreenElement?'Esci da schermo intero':'Schermo intero';};
document.addEventListener('fullscreenchange',labelFullscreen);
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
bind('chronology-send',async()=>{
 const {id,manche,round}=state.room, answer=chronologySelection();
 if(!state.me||state.me.done||state.room.phase!=='question'||!left()||answer.length!==4)return;
 const request=answerRequest?.manche===manche&&answerRequest.round===round&&
  answer.every((item,index)=>item===answerRequest.answer[index])
  ?answerRequest:{manche,round,answer,request_id:crypto.randomUUID()};
 answerRequest=request;
 tick();
 try{
  const result=await rpc('answer',{room_id:id,...request});
  if(state?.room.id===id&&state.room.manche===manche&&state.room.round===round){
   Object.assign(state.me,result);
   answerRequest=null;
  }
 }finally{await refresh();if(state)renderRoom();}
});
bind('meadow-send',async()=>{
 const {id,manche,round}=state.room, answer=meadowSelection();
 if(!state.me||state.me.done||state.room.phase!=='question'||!left())return;
 const request=answerRequest?.manche===manche&&answerRequest.round===round&&
  answer.length===answerRequest.answer.length&&answer.every((item,index)=>item===answerRequest.answer[index])
  ?answerRequest:{manche,round,answer,request_id:crypto.randomUUID()};
 answerRequest=request;
 tick();
 try{
  const result=await rpc('answer',{room_id:id,...request});
  if(state?.room.id===id&&state.room.manche===manche&&state.room.round===round){
   Object.assign(state.me,result);
   answerRequest=null;
  }
 }finally{await refresh();if(state)renderRoom();}
});
$('population-match').addEventListener('click',async event=>{
 const button=event.target.closest('button[data-country]');
 if(!button||button.disabled||busy||!state?.me)return;
 busy=true;
 const round=state.room.round;
 button.classList.add('population-selected');
 button.setAttribute('aria-pressed','true');
 button.disabled=true;
 populationText($('population-feedback'),`Hai scelto ${button.querySelector('.population-name').textContent}.`);
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
 const music=$('music'),r=state.room;if(r.quiz==='culture'){
  music.pause();
  const vault=state.vault&&r.phase!=='finished';
  const toggle=$('enable-audio');
  if(vault){
   toggle.textContent=vaultAudioEnabled()?'Disattiva audio':'Attiva audio';
   toggle.setAttribute('aria-pressed',String(vaultAudioEnabled()));
   toggle.title=toggle.textContent;
  }
  show('enable-audio',!!vault);
  return;
 }
 $('enable-audio').textContent='Attiva audio';
 $('enable-audio').removeAttribute('aria-pressed');
 const tracks={cards:'Pokemon FireRedLeafGreen- Pallet Town.mp3',clues:'assets/audio/oak-notebook.m4a',price:'assets/audio/castelia-card-market.m4a'};
 const src=new URL(tracks[r.manche||'cards'],base).href;
 if(music.src!==src){music.pause();music.src=src;music.load();}
 if(!state.can_control||['lobby','paused','finished'].includes(r.phase)){music.pause();show('enable-audio',false);return;}
 if(music.paused)music.play().then(()=>show('enable-audio',false)).catch(()=>show('enable-audio',true));
}
bind('enable-audio',async()=>{
 if(state?.vault&&state.room.phase!=='finished'){await toggleVaultAudio();syncMusic();return;}
 await $('music').play();show('enable-audio',false);
});
$('volume').addEventListener('input',()=>{if(state)syncMusic();});
window.addEventListener('pagehide',()=>{$('music').pause();stopVaultAudio();});
async function openRoom(){roomUnavailable=false;show('dashboard',false);show('join-panel',false);show('room',true);$('back').href=route==='play'?base.href+'play/':base.href+route+'/';$('back').textContent=route==='play'?'Entra in un’altra stanza':'Torna alla dashboard';
 await refresh();connectSocket();}
function connectSocket(){
 clearTimeout(reconnectTimer);
 if(!roomId||roomUnavailable)return;
 if(channel){channel.onclose=null;channel.close();}
 const url=new URL('/api/socket',location.origin);
 url.protocol=location.protocol==='https:'?'wss:':'ws:';
 url.searchParams.set('room',roomId);
 const socket=channel=new WebSocket(url);
 socket.onmessage=e=>{
  if(channel!==socket)return;
  let next;
  try{next=JSON.parse(e.data);}catch{socket.close();return;}
  if(!next?.room){socket.close();return;}
  applySnapshot(next,true);
  reconnectDelay=500;
  notice('');
 };
 socket.onclose=()=>{
  if(channel!==socket)return;
  notice('Aggiornamento in tempo reale interrotto. Riconnessione in corso…');
  reconnectTimer=setTimeout(async()=>{await refresh();if(channel===socket)connectSocket();},reconnectDelay+Math.random()*300);
  reconnectDelay=Math.min(15000,reconnectDelay*2);
 };
 socket.onerror=()=>{if(channel===socket)socket.close();};
}

function applySnapshot(next,fromSocket=false){
 if(state&&(next.room.revision<state.room.revision||
    next.room.revision===state.room.revision&&new Date(next.server_now)<new Date(state.server_now)))return;
 if(state&&(next.room.phase!==state.room.phase||next.room.deadline!==state.room.deadline))deadlineRequested=false;
 state=next;
 if(fromSocket&&next.server_now)offset=new Date(next.server_now).getTime()-Date.now();
 renderRoom();
}
async function refresh(){
 if(!roomId||roomUnavailable||refreshing)return;
 refreshing=true;
 try{applySnapshot(await rpc('state',{room_id:roomId}));}
 catch(e){
  if([401,403,404].includes(e.status)){
   roomUnavailable=true;
   clearTimeout(reconnectTimer);
   if(channel){channel.onclose=null;channel.close();channel=null;}
   state=null;
   leaveVault();
   vaultViewport(false);
   if($('audio-control').parentNode===$('vault-audio'))document.body.append($('audio-control'));
   show('audio-control',false);
   document.body.className='live-shell';
   cardRound=0;
   cardAsset=null;
   $('answer').dataset.round='';
   $('music').pause();
   show('room',false);
   notice('');
   if(route==='play'){
    if(e.status===401)user=null;
    roomId=null;
    history.replaceState(null,'',base.href+'play/');
    show('join-panel',true);
    $('code').focus();
    error(e.message+' Inserisci il PIN per entrare di nuovo.');
   }else{
    if(route==='admin'&&e.status===401){show('auth',true);show('logout',false);}
    error(e.message+(e.status===401?' Accedi di nuovo.':' Apri la dashboard dal menu.'));
   }
  }else if(channel?.readyState!==WebSocket.OPEN){
   notice('Riconnessione in corso. '+e.message);
  }
 }finally{refreshing=false;}
}
function left(){return !state?0:state.room.phase==='paused'?state.remaining_ms:Math.max(0,Math.min(state.duration_ms||30000,new Date(state.room.deadline).getTime()-Date.now()-offset));}
function renderPopulation(){
 const {room,me}=state,stage=$('culture-stage'),key=`${room.id}/${room.round}`;
 const newRound=stage.dataset.round!==key;
 stage.dataset.round=key;
 const {countries,values,correct}=state.population,format=new Intl.NumberFormat('it-IT');
 const animate=newRound&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const enter=(node,delay)=>node.animate?.([{opacity:0,transform:'translateY(9px)'},{opacity:1,transform:'none'}],
  {duration:380,delay,fill:'backwards',easing:'cubic-bezier(.2,.72,.3,1)'});
 if(animate)enter($('culture-prompt'),0);
 $('population-year').textContent=`Stime ${state.population.year}`;
 countries.forEach((country,i)=>{
  const button=$(`population-${i?'b':'a'}`),selected=me?.choice===country.id;
  const flag=button.querySelector('.population-flag'),src=new URL(`assets/flags/${country.iso2.toLowerCase()}.svg`,base).href;
  if(flag.src!==src){
   flag.dataset.loading='';
   flag.onload=()=>delete flag.dataset.loading;
   flag.src=src;
   if(flag.complete&&flag.naturalWidth)delete flag.dataset.loading;
  }
  button.dataset.country=country.id;
  button.querySelector('.population-name').textContent=country.name;
  const population=values?`${format.format(values[i])} abitanti`:'';
  populationText(button.querySelector('.population-value'),population);
  button.setAttribute('aria-label',values?`${country.name}, ${population}${country.id===correct?', nazione con più abitanti':''}`:country.name);
  button.classList.toggle('population-winner',!!values&&country.id===correct);
  button.classList.toggle('population-selected',selected);
  button.setAttribute('aria-pressed',String(selected));
  if(animate)enter(button,70+i*85);
 });
 const chosen=countries.find(country=>country.id===me?.choice);
 populationText($('population-feedback'),me?.result==='correct'&&values?'Risposta esatta!':me?.result==='wrong'&&values?'Risposta sbagliata.':chosen?`Hai scelto ${chosen.name}. In attesa della rivelazione.`:'');
}
function renderRoom(){const r=state.room,host=state.can_control,active=['question','paused'].includes(r.phase),lobby=r.phase==='lobby',final=r.phase==='finished',clues=r.manche==='clues',culture=r.quiz==='culture',cultureRevealed=culture&&!!state.population?.values,population=!!state.population&&!final,chronology=state.chronology&&!final,meadow=state.meadow&&!final,vault=state.vault&&!final,vaultFinal=(state.vault||state.meadow)&&final,price=state.price,checkpoint=price&&r.phase==='reveal'&&price.round%3===0;document.body.className=(host?'host':'player')+' '+r.phase+(lobby?' live-shell':'')+(clues?' gameboy':'')+(culture?' culture-quiz':'')+(population?' population-quiz':'')+(chronology||meadow?' chronology-quiz':'')+(meadow?' meadow-quiz':'')+(price?' pokeprice':'')+(checkpoint?' price-checkpoint':'')+(vault?' vault-quiz':'')+(vaultFinal?' vault-finished':'');
 document.querySelector('h1').textContent=price?'PokéPrice':clues?'PokéIndizi':culture?'Cultura generale':'Pixelcard';
 show('pokemon-parade',clues);
 show('clue-stage',clues&&!final);show('question-prompt',!host&&!clues&&!price&&!culture);show('clue-reveal',clues&&!!state.solution_image);show('culture-stage',population);show('population-phase',population);show('population-progress',population);if(population)renderPopulation();
 if(clues){const unlocked=state.clues||[];if(JSON.stringify(unlocked)!==$('clues').dataset.content){$('clues').dataset.content=JSON.stringify(unlocked);$('clues').replaceChildren(...unlocked.map((c,i)=>text('p',`${i+1}. ${c}`,'clue-dialog')));}
 if(state.solution_image){$('clue-image').src=base.href+state.solution_image;$('clue-image').alt='Sprite di '+state.solution;$('clue-caption').textContent=`${state.solution}${state.me?' · '+(state.me.points||0)+' punti':''}`;}
 if(state.me?.result==='correct')$('feedback').textContent=`Hai vinto ${state.me.points} punti!`;}
 show('skip-hint',host&&!lobby&&!final&&!vault);
 show('lobby',lobby);
 show('question',!price&&!chronology&&!meadow&&!vault&&(active||((host||clues||culture)&&r.phase==='reveal')||(clues&&final&&!!state.solution_image)));
 show('price-stage',!!price&&!final);
 show('chronology-stage',!!chronology);
 if(chronology)renderChronology(state,host);
 show('meadow-stage',!!meadow);
 if(meadow)renderMeadow(state,host);
 show('vault-stage',!!vault);
 vaultViewport(!!(vault||vaultFinal));
 const audioControl=$('audio-control'),vaultAudio=$('vault-audio');
 if(vault&&audioControl.parentNode!==vaultAudio)vaultAudio.append(audioControl);
 if(!vault&&audioControl.parentNode===vaultAudio)document.body.append(audioControl);
 if(vault)renderVault(state,host,{submit:request=>rpc('answer',request),refresh,update:tick});
 else leaveVault();
 labelFullscreen();
 showPriceBackground(!!price&&!final);
 const results=!chronology&&!meadow&&!vault&&(final||checkpoint||(population?host||cultureRevealed:culture&&r.round>0||!price&&r.phase==='reveal'));
 show('results',results);show('controls',host&&!final);show('fullscreen',host);show('audio-control',!!vault||host&&!lobby&&!final&&!culture);show('revoked',route!=='play'&&!host);show('card-wrap',host&&!clues&&!price&&!culture);show('answer-form',!!state.me&&active&&!price&&!culture);show('population-match',population);show('paused',r.phase==='paused'&&!population);$('room-code').textContent=r.code;$('round').textContent=lobby?'Lobby':price?`Round ${price.round}/${price.total}`:clues?`PokéIndizi ${r.round-6}/6`:vault?`Manche ${r.manche}/${r.manche_total}`:culture?cultureRound(r,state.chronology?.total):`Carta ${r.round}/6`;
 const received=vault?'':`${state.received}/${(chronology||meadow)?.participants??state.players.length} risposte inviate`;
 if(population)populationText($('received'),received);else $('received').textContent=received;
 if(chronology)$('chronology-count').textContent=$('received').textContent;
 if(lobby){$('big-code').textContent=r.code;const url=base.href+'play/?code='+r.code;$('join-link').textContent=url;$('join-link').href=url;if(qrCode!==r.code){qrCode=r.code;QRCode.toCanvas($('qr'),url,{width:280,margin:4}).catch(e=>error(e.message));}$('lobby-players').replaceChildren(...state.players.map(p=>text('span',`${p.connected?'●':'○'} ${p.nickname}${p.connected?'':' · disconnesso'}`,'player-chip'+(p.connected?'':' offline'))));}
 const questionKey=`${r.id}/${r.manche}/${r.round}`;
 if($('answer').dataset.round!==questionKey){deadlineRequested=false;$('answer').value='';$('answer').dataset.round=questionKey;$('feedback').textContent='';answerRequest=null;}
 if(host&&!clues&&!culture&&!price&&r.round>0&&cardRound!==r.round){cardRound=r.round;cardAsset=null;$('card').className='card reset';rpc('card',{room_id:roomId}).then(({asset})=>{const img=new Image();img.onload=()=>{if(cardRound!==r.round)return;cardAsset=img;$('pokemon').src=img.src;$('card').style.aspectRatio=`${img.naturalWidth}/${img.naturalHeight}`;setTimeout(()=>{
 if(state.room.round!==r.round||cardRound!==r.round)return;
 $('card').className=['question','paused'].includes(state.room.phase)?'card flipped':'card flipped revealed';
 tick();
 },250);};img.onerror=()=>{cardRound=0;error('Impossibile caricare la carta.');};img.src=base.href+asset;}).catch(e=>{cardRound=0;error(e.message);});}
 if(!active&&r.round>0&&!culture)$('card').classList.add('revealed');
 for(const b of document.querySelectorAll('[data-command]')){const c=b.dataset.command;b.hidden=!(c==='end'||c==='start'&&lobby||c==='pause'&&(r.phase==='question'||(culture&&r.phase==='reveal'))||c==='resume'&&r.phase==='paused'||c==='next'&&r.phase==='reveal'&&!chronology&&!meadow);if(c==='next')b.textContent=vault?(r.round===6?(r.manche_total>3?'Avvia Prato fiorito':'Mostra podio'):'Prossima domanda'):price?(price.round===price.total?'Mostra podio':'Prossimo round'):culture?(r.round===10?'Avvia Cronologia':'Prossimo confronto'):r.round===6?'Avvia PokéIndizi':'Prossima domanda';}
 show('vault-pages',!!vaultFinal&&state.players.length>vaultPageSize());
 if(results){
  const title=final?'Podio finale':culture&&!cultureRevealed?'Classifica attuale':price?'Classifica intermedia':'Soluzione e classifica';
  const solution=cultureRevealed?`${state.population.countries[state.population.values[1]>state.population.values[0]?1:0].name} ha più abitanti (${new Intl.NumberFormat('it-IT').format(Math.max(...state.population.values))}, stima ${state.population.year}).`:state.solution?`È ${state.solution}!`:'';
  const me=state.players.find(p=>p.user_id===user?.id);
  const personal=me?`${me.nickname}: ${me.score} punti · posizione ${me.rank}`:'';
  for(const [id,value] of [['results-title',title],['solution',solution],['personal',personal]]){
   const node=$(id);
   if(population)populationText(node,value);else node.textContent=value;
  }
  if(culture&&previousRankRoom!==r.id){previousRanks.clear();previousRankRoom=r.id;}
  const ranking=$('ranking');
  const signature=population?JSON.stringify([r.id,state.players.map(p=>[p.user_id,p.nickname,p.score,p.rank])]):'';
  if(!population||ranking.dataset.content!==signature){
   ranking.dataset.content=signature;
   ranking.replaceChildren(...(vaultFinal?vaultPage(state.players):state.players).map(p=>{
    const movement=culture?(previousRanks.get(p.user_id)||p.rank)-p.rank:0;
    const row=text('li','',movement>0?'rank-up':movement<0?'rank-down':'');
    row.append(text('span',`${p.rank}. ${p.nickname}${movement>0?' ▲':movement<0?' ▼':''}`),text('strong',`${p.score} pt`));
    return row;
   }));
   previousRanks=new Map(state.players.map(p=>[p.user_id,p.rank]));
  }
  $('podium').replaceChildren();
  if(final){
   $('music').pause();
   const groups=vaultFinal?vaultRankGroups(state.players):null;
   const winners=vaultFinal?[...groups.values()].map(group=>group[0]):state.players.filter(p=>p.rank<=3);
   for(const p of winners){
    const box=text('div','', 'winner'),group=groups?.get(p.rank);
    box.append(text('span',p.rank===1?((group?.length??state.players.filter(x=>x.rank===1).length)>1?'Vincitore ex aequo':'Vincitore'):`${p.rank}° posto`),text('strong',vaultFinal&&group.length>1?`${group.length} a pari merito`:p.nickname),text('span',`${p.score} punti`));
    $('podium').append(box);
   }
  }
 }
 if(price&&!final)renderPrice(state,host);
 syncMusic();
 tick();}
let resultPage=0;
const vaultPageSize=()=>window.innerHeight<460?2:4;
function vaultPage(players){
 const size=vaultPageSize(),pages=Math.max(1,Math.ceil(players.length/size));
 resultPage=Math.min(resultPage,pages-1);
 $('vault-prev').disabled=resultPage===0;
 $('vault-next').disabled=resultPage===pages-1;
 $('vault-page').textContent=`${resultPage+1} / ${pages}`;
 return players.slice(resultPage*size,(resultPage+1)*size);
}
for(const [id,step] of [['vault-prev',-1],['vault-next',1]])$(id).addEventListener('click',()=>{
 resultPage+=step;
 renderRoom();
});
window.addEventListener('resize',()=>{if((state?.vault||state?.meadow)&&state.room.phase==='finished')renderRoom();});
function tick(){if(!state)return;
 const r=state.room,ms=left(),introMs=r.phase==='question'?Math.max(0,new Date(r.starts_at).getTime()-Date.now()-offset):0,pre=introMs>0;
 show('clue-intro',r.manche==='clues'&&r.round===7&&pre);
 const seconds=Math.ceil((pre?introMs:ms)/1000);
 if(state.population&&r.phase!=='finished'){
  populationText($('seconds'),`${seconds}s`);
  populationText($('population-phase'),r.phase==='paused'?'In pausa':pre?'Preparati':state.population.values?'Rivelazione':'Tempo per rispondere');
  $('question').toggleAttribute('data-urgent',r.phase==='question'&&!pre&&seconds<=5);
  const progress=$('population-progress');
  progress.toggleAttribute('data-hidden-progress',!!state.population.values);
  progress.firstElementChild.style.transform=`scaleX(${Math.min(1,ms/state.duration_ms)})`;
 }else if($('seconds').textContent!==(pre?'Pronti…':`${seconds}s`)){
  $('seconds').textContent=pre?'Pronti…':`${seconds}s`;
 }
 const enabled=r.phase==='question'&&!pre&&ms>0&&!state.me?.done&&!busy;
 if(state.can_control)document.querySelector('[data-command="pause"]').disabled=!!state.population&&pre;
 $('answer').disabled=$('submit').disabled=!enabled;
 for(const button of $('population-match').querySelectorAll('button'))button.disabled=!enabled||state.can_control||!state.me;
 if(state.vault&&r.phase!=='finished'){
  tickVault(ms,introMs);
  if(state.can_control)document.querySelector('[data-command="next"]').hidden=r.phase!=='reveal'||ms>500||!ms;
 }
 if(state.chronology&&r.phase!=='finished')tickChronology(state,ms,enabled,introMs);
 if(state.meadow&&r.phase!=='finished')tickMeadow(state,ms,enabled,introMs);
 if(state.price&&r.phase!=='finished'){
  tickPrice(state,ms,pre,introMs,enabled&&!!state.me&&!state.can_control);
  if(state.can_control)document.querySelector('[data-command="pause"]').hidden=pre||r.phase!=='question';
 }
 if(!state.price&&r.manche!=='clues'&&cardAsset&&['question','paused'].includes(r.phase)){const blockSize=pixelEnd+(pixelStart-pixelEnd)*ms/30000,width=Math.ceil(310/blockSize),height=Math.round(width*cardAsset.naturalHeight/cardAsset.naturalWidth),canvas=$('pixels');if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;canvas.getContext('2d').drawImage(cardAsset,0,0,width,height);}}
 if((r.phase==='question'||(r.quiz==='culture'&&r.phase==='reveal'))&&ms===0&&!deadlineRequested&&!refreshing){deadlineRequested=true;refresh();}}
setInterval(tick,100);
window.addEventListener('offline',()=>{if(roomId&&!roomUnavailable)notice('Connessione assente. Riconnessione automatica al ritorno della rete.');});
window.addEventListener('online',()=>{
 if(user&&roomId&&!roomUnavailable){refresh();connectSocket();}
 else if(!roomUnavailable)start().catch(e=>error(e.message));
});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){if(roomId&&!roomUnavailable){refresh();if(channel?.readyState!==WebSocket.OPEN)connectSocket();}else if(dashboard)loadDashboard().catch(e=>error(e.message));}});start().catch(e=>error(e.message));

document.addEventListener('keydown', async event => {
 if (!event.shiftKey || event.key.toLowerCase() !== 'n' || event.ctrlKey || event.altKey || event.metaKey || event.repeat || event.isComposing || busy) return;
 if (event.target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]')) return;
 if (state?.vault && (state.room.phase!=='reveal'||left()>500||!left())) return;
 if (route === 'play' || !state?.can_control || !['question','paused','reveal'].includes(state.room.phase)) return;
 event.preventDefault(); busy = true;
 try { await rpc('command',{room_id:roomId,revision:state.room.revision,command:'skip_round'}); await refresh(); }
 catch(e) { error(e.message); await refresh(); } finally { busy = false; }
});

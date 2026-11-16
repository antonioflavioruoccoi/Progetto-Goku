import QRCode from 'qrcode';
const $=id=>document.getElementById(id);
const show=(id,visible)=>$(id).hidden=!visible;
const text=(tag,value,className)=>{const e=document.createElement(tag);e.textContent=value;if(className)e.className=className;return e;};
const route=location.pathname.split('/').filter(Boolean).at(-1)||'play';
const base=new URL('../',location.href);
const params=new URLSearchParams(location.search);
let user,dashboard,state,roomId=params.get('room'),channel,offset=0,refreshing=false,cardRound=0,cardAsset=null,busy=false,answerRequest=null,deadlineRequested=false,qrCode='',reconnectTimer,reconnectDelay=500;
let inviteToken=new URLSearchParams(location.hash.slice(1)).get('token');
if(inviteToken){sessionStorage.setItem('goku-invite',inviteToken);history.replaceState(null,'',location.pathname+location.search);}
else if(route==='invite')inviteToken=sessionStorage.getItem('goku-invite');
const notice=s=>{$('notice').textContent=s;};
const error=s=>{$('error').textContent=s;};
async function rpc(action,payload={}){const start=Date.now();const response=await fetch('/api/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,payload})});const data=await response.json();if(!response.ok||data.error)throw Error(data.error||'Errore di connessione');if(data.server_now)offset=new Date(data.server_now).getTime()-(start+Date.now())/2;return data;}

function bind(id,handler,event='click'){$(id).addEventListener(event,async e=>{e.preventDefault();if(busy)return;busy=true;const button=e.currentTarget.tagName==='FORM'?e.currentTarget.querySelector('button'):e.currentTarget;if(button.tagName==='BUTTON')button.disabled=true;error('');try{await handler(e);}catch(e){error(e.message);}finally{busy=false;if(button.tagName==='BUTTON')button.disabled=false;tick();}});}
async function loadDashboard(){dashboard=await rpc('dashboard');if(route==='admin'&&!dashboard.admin)throw Error('Area riservata all’amministratore.');show('dashboard',true);show('admin-tools',route==='admin'&&dashboard.admin);show('license-select-label',!dashboard.admin);show('auth',false);show('logout',true);$('licenses').replaceChildren();$('license-select').replaceChildren();
 for(const l of dashboard.licenses){const box=text('div','', 'license');box.append(text('strong',`Host ${l.id.slice(0,8)} · ${l.status}`),text('p',`${new Date(l.starts_at).toLocaleString()} → ${new Date(l.expires_at).toLocaleString()}`),text('p',`Stanze: ${l.used_rooms} / ${l.max_rooms} · Quiz: ${l.quizzes.join(', ')}`));
  if(dashboard.admin&&l.status!=='revocato'){const revoke=text('button','Revoca');revoke.onclick=async()=>{revoke.disabled=true;try{await rpc('license_revoke',{license_id:l.id});await loadDashboard();}catch(e){error(e.message);revoke.disabled=false;}};box.append(revoke);}
  $('licenses').append(box);if(l.status==='attivo'&&l.used_rooms<l.max_rooms){const option=text('option',`Host ${l.id.slice(0,8)} · ${l.max_rooms-l.used_rooms} stanze · scade ${new Date(l.expires_at).toLocaleString()}`);option.value=l.id;$('license-select').append(option);}}
 if(!dashboard.licenses.length)$('licenses').append(text('p',dashboard.admin?'Nessuna licenza generata.':'Nessuna licenza associata. Apri il tuo invito personale e riscattalo.'));
 $('create-room').disabled=!dashboard.admin&&!$('license-select').options.length;
 $('rooms').replaceChildren();for(const r of dashboard.rooms){const box=text('div','', 'room-item');box.append(text('strong',`PIN ${r.code} · ${r.quiz}`),text('p',`Stato: ${r.phase} · Carta ${r.round}/6`));const open=text('button','Apri stanza');open.onclick=()=>{location.href=`?room=${r.id}`;};box.append(open);
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
bind('license-form',async e=>{const f=new FormData(e.currentTarget);const result=await rpc('license_create',{hours:Number(f.get('hours')),max_rooms:Number(f.get('max_rooms'))});$('invite-link').value=base.href+'invite/#token='+result.token;show('invite-result',true);await loadDashboard();},'submit');
bind('copy-invite',async()=>{try{await navigator.clipboard.writeText($('invite-link').value);notice('Link copiato.');}catch{$('invite-link').select();notice('Selezionato: copia il link manualmente.');}});
bind('create-form',async()=>{const r=await rpc('create',{quiz:$('quiz').value,license_id:$('license-select').value||null});location.href=`?room=${r.id}`;},'submit');
bind('join-form',async()=>{const r=await rpc('join',{code:$('code').value.trim(),nickname:$('nickname').value});roomId=r.id;history.replaceState(null,'',`?room=${roomId}`);await openRoom();},'submit');
bind('fullscreen',async()=>{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();});
for(const button of document.querySelectorAll('[data-command]'))button.addEventListener('click',async()=>{if(busy)return;busy=true;try{error('');if(button.dataset.command==='start')$('music').play().catch(()=>{});await rpc('command',{room_id:roomId,revision:state.room.revision,command:button.dataset.command});await refresh();}catch(e){error(e.message);await refresh();}finally{busy=false;}});
bind('answer-form',async()=>{const answer=$('answer').value.trim();const request=answerRequest?.answer===answer&&answerRequest.round===state.room.round?answerRequest:{answer,round:state.room.round,request_id:crypto.randomUUID()};answerRequest=request;const result=await rpc('answer',{room_id:roomId,...request});answerRequest=null;
 $('feedback').textContent=result.result==='invalid'?'Nome errato, riprova':result.result==='correct'?`Hai vinto ${result.points} punti!`:result.done?'Peccato, hai sbagliato':`Non è questo Pokémon! Restano ${3-result.attempts} tentativi.`;
 if(result.result==='wrong'&&!result.done)$('answer').value='';await refresh();},'submit');
$('music').volume=.7;$('volume').oninput=()=>{$('music').volume=Number($('volume').value)/100;};
async function openRoom(){show('dashboard',false);show('join-panel',false);show('room',true);$('back').href=route==='play'?base.href+'play/':base.href+route+'/';$('back').textContent=route==='play'?'Entra in un’altra stanza':'Torna alla dashboard';
 await refresh();connectSocket();}
function connectSocket(){clearTimeout(reconnectTimer);if(channel){channel.onclose=null;channel.close();}const url=new URL('/api/socket',location.origin);url.protocol=location.protocol==='https:'?'wss:':'ws:';url.searchParams.set('room',roomId);channel=new WebSocket(url);
 channel.onopen=()=>{reconnectDelay=500;notice('');};
 channel.onmessage=e=>{state=JSON.parse(e.data);offset=new Date(state.server_now).getTime()-Date.now();deadlineRequested=state.room.phase!=='question'?false:deadlineRequested;renderRoom();};
 channel.onclose=()=>{notice('Connessione interrotta. Riconnessione in corso…');reconnectTimer=setTimeout(connectSocket,reconnectDelay+Math.random()*300);reconnectDelay=Math.min(15000,reconnectDelay*2);};
 channel.onerror=()=>channel.close();
}

async function refresh(){if(!roomId||refreshing)return;refreshing=true;try{state=await rpc('state',{room_id:roomId});deadlineRequested=state.room.phase!=='question'?false:deadlineRequested;renderRoom();}catch(e){notice('Riconnessione: '+e.message);}finally{refreshing=false;}}
function left(){return !state?0:state.room.phase==='paused'?state.remaining_ms:Math.max(0,Math.min(30000,new Date(state.room.deadline).getTime()-Date.now()-offset));}
function renderRoom(){const r=state.room,host=state.can_control,active=['question','paused'].includes(r.phase),lobby=r.phase==='lobby',final=r.phase==='finished';document.body.className=(host?'host':'player')+' '+r.phase;
 show('lobby',lobby);show('question',active||(host&&r.phase==='reveal'));show('results',r.phase==='reveal'||final);show('controls',host&&!final);show('fullscreen',host);show('audio-control',host);show('revoked',route!=='play'&&!host);show('card-wrap',host);show('answer-form',!!state.me&&active);show('paused',r.phase==='paused');$('room-code').textContent=r.code;$('round').textContent=lobby?'Lobby':`Carta ${r.round}/6`;$('received').textContent=`${state.received}/${state.players.length} completate`;
 if(lobby){$('big-code').textContent=r.code;const url=base.href+'play/?code='+r.code;$('join-link').textContent=url;$('join-link').href=url;if(qrCode!==r.code){qrCode=r.code;QRCode.toCanvas($('qr'),url,{width:280,margin:4}).catch(e=>error(e.message));}$('lobby-players').replaceChildren(...state.players.map(p=>text('span',`${p.connected?'●':'○'} ${p.nickname}${p.connected?'':' · disconnesso'}`,'player-chip'+(p.connected?'':' offline'))));}
 if($('answer').dataset.round!==String(r.round)){deadlineRequested=false;$('answer').value='';$('answer').dataset.round=r.round;$('feedback').textContent='';answerRequest=null;}
 if(host&&r.round>0&&cardRound!==r.round){cardRound=r.round;cardAsset=null;$('card').className='card reset';rpc('card',{room_id:roomId}).then(({asset})=>{const img=new Image();img.onload=()=>{if(cardRound!==r.round)return;cardAsset=img;$('pokemon').src=img.src;$('card').style.aspectRatio=`${img.naturalWidth}/${img.naturalHeight}`;setTimeout(()=>{$('card').className='card flipped';tick();},250);};img.onerror=()=>{cardRound=0;error('Impossibile caricare la carta.');};img.src=base.href+asset;}).catch(e=>{cardRound=0;error(e.message);});}
 if(!active&&r.round>0)$('card').classList.add('revealed');
 for(const b of document.querySelectorAll('[data-command]')){const c=b.dataset.command;b.hidden=!(c==='end'||c==='start'&&lobby||c==='pause'&&r.phase==='question'||c==='resume'&&r.phase==='paused'||c==='next'&&r.phase==='reveal');if(c==='next')b.textContent=r.round===6?'Mostra podio':'Prossima domanda';}
 if(r.phase==='reveal'||final){$('results-title').textContent=final?'Podio finale':'Soluzione e classifica';$('solution').textContent=state.solution?`È ${state.solution}!`:'';const me=state.players.find(p=>p.user_id===user?.id);$('personal').textContent=me?`${me.nickname}: ${me.score} punti · posizione ${me.rank}`:'';$('ranking').replaceChildren(...state.players.map(p=>{const li=text('li','');li.append(text('span',`${p.rank}. ${p.nickname}`),text('strong',`${p.score} pt`));return li;}));$('podium').replaceChildren();if(final){$('music').pause();for(const p of state.players.filter(p=>p.rank<=3)){const box=text('div','', 'winner');box.append(text('span',p.rank===1?(state.players.filter(x=>x.rank===1).length>1?'🏆 Vincitore ex aequo':'🏆 Vincitore'):`${p.rank}° posto`),text('strong',p.nickname),text('span',`${p.score} punti`));$('podium').append(box);}}}
 tick();}
function tick(){if(!state)return;const r=state.room,ms=left(),pre=r.phase==='question'&&Date.now()+offset<new Date(r.starts_at).getTime();$('seconds').textContent=pre?'Pronti…':`${Math.ceil(ms/1000)}s`;const enabled=r.phase==='question'&&!pre&&ms>0&&!state.me?.done&&!busy;$('answer').disabled=$('submit').disabled=!enabled;
 if(cardAsset&&['question','paused'].includes(r.phase)){const blockSize=40-37*(1-ms/30000),width=Math.ceil(310/blockSize),height=Math.round(width*cardAsset.naturalHeight/cardAsset.naturalWidth),canvas=$('pixels');if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;canvas.getContext('2d').drawImage(cardAsset,0,0,width,height);}}
 if(r.phase==='question'&&ms===0&&!deadlineRequested&&!refreshing){deadlineRequested=true;refresh();}}
setInterval(tick,100);
window.addEventListener('online',()=>{if(roomId)connectSocket();});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){if(roomId){refresh();if(!channel||channel.readyState!==WebSocket.OPEN)connectSocket();}else if(dashboard)loadDashboard().catch(e=>error(e.message));}});start().catch(e=>error(e.message));

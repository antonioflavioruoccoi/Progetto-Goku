import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import vm from 'node:vm';import crypto from 'node:crypto';import {Window} from 'happy-dom';import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:['web/app.js'],bundle:true,write:false,format:'iife',plugins:[{name:'mock-qr',setup(b){b.onResolve({filter:/^qrcode$/},args=>({path:args.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:"export default {toCanvas:async()=>{}}"}));}}]});
const app=outputFiles[0].text,html=await fs.readFile('web/app.html','utf8');
async function boot(path,{anonymous=false,admin=false,room=null,licenses=[],blockedAudio=false,userId='user-1',answerResponse}={}){
 const window=new Window({url:'https://goku.test/'+path,settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}});window.document.write(html);const calls=[];let socket;
 const fetch=async(url,options)=>{const {action,payload}=JSON.parse(options.body);calls.push({action,payload});return {ok:true,json:async()=>action==='identity'?{id:userId,role:admin?'admin':anonymous?'player':'host'}:action==='dashboard'?{admin,licenses,rooms:[],server_now:Date.now()}:action==='state'?room:action==='answer'?answerResponse?answerResponse(payload):room?.chronology?Object.assign(room.me,{done:true,choice:payload.answer}):room?.price?{done:true,choice:payload.answer}:room?.population?(Object.assign(room.me,{done:true,choice:payload.answer,result:'wrong',points:0}),{done:true,choice:payload.answer,result:'wrong',points:0}):{result:'wrong',attempts:1,done:false}:{}};};
 class WebSocket {static OPEN=1;readyState=1;constructor(){socket=this;}close(){this.readyState=3;this.onclose?.();}}
 window.matchMedia=()=>({matches:true});
 const audio=window.document.getElementById('music'),audioEvents=[];let paused=true;
 Object.defineProperty(audio,'paused',{get:()=>paused});
 audio.play=()=>{audioEvents.push(['play',audio.src]);if(blockedAudio)return Promise.reject(Error('Autoplay blocked'));paused=false;return Promise.resolve();};
 audio.pause=()=>{paused=true;audioEvents.push(['pause',audio.src]);};
 audio.load=()=>audioEvents.push(['load',audio.src]);
 const context=vm.createContext({fetch,WebSocket,document:window.document,location:window.location,history:window.history,sessionStorage:window.sessionStorage,navigator:window.navigator,window,URL,URLSearchParams,FormData:window.FormData,Image:window.Image,crypto,console,setInterval:()=>0,setTimeout:fn=>queueMicrotask(fn),clearTimeout:()=>{}});
 vm.runInContext(app,context);await new Promise(r=>setImmediate(r));return {
  window,calls,audioEvents,
  notify:async()=>{socket?.onmessage?.({data:JSON.stringify(room)});await new Promise(r=>setImmediate(r));},
  disconnect:async()=>{socket.close();await new Promise(r=>setImmediate(r));},
  $:id=>window.document.getElementById(id),
 };
}
test('non-admin sees password form without rendering dashboard',async()=>{const h=await boot('admin/');assert.equal(h.$('auth').hidden,false);assert.equal(h.$('dashboard').hidden,true);assert.equal(h.$('admin-tools').hidden,true);await h.window.happyDOM.close();});
test('admin dashboard is rendered only after server authorization',async()=>{const h=await boot('admin/',{admin:true});assert.equal(h.$('dashboard').hidden,false);assert.equal(h.$('admin-tools').hidden,false);assert.equal(h.$('license-select-label').hidden,true);await h.window.happyDOM.close();});
test('player reconnect renders server identity; WebSocket snapshot and answer use API',async()=>{
 const room={room:{id:'room-1',code:'123456',phase:'question',round:1,revision:2,starts_at:new Date(Date.now()-1000).toISOString(),deadline:new Date(Date.now()+25000).toISOString()},server_now:new Date().toISOString(),remaining_ms:25000,can_control:false,received:0,solution:null,players:[{user_id:'user-1',nickname:'Ash',score:0,rank:1,connected:true}],me:{nickname:'Ash',score:0,done:false,attempts:0}};
 const h=await boot('play/?room=room-1',{anonymous:true,room});assert.equal(h.$('room').hidden,false);assert.equal(h.$('join-panel').hidden,true);assert.equal(h.$('controls').hidden,true);assert.equal(h.$('card-wrap').hidden,true);assert.equal(h.$('answer-form').hidden,false);
 const before=h.calls.filter(x=>x.action==='state').length;await h.notify();assert.equal(h.calls.filter(x=>x.action==='state').length,before,'WebSocket pushes state without another request');
 room.received=1;
 await h.disconnect();
 assert.match(h.$('notice').textContent,/Riconnessione/);
 assert.equal(h.calls.filter(x=>x.action==='state').length,before+1);
 assert.equal(h.$('received').textContent,'1/1 risposte inviate');
 await h.notify();
 assert.equal(h.$('notice').textContent,'');
 h.$('answer').value='Pikachu';h.$('answer-form').dispatchEvent(new h.window.Event('submit',{cancelable:true}));await new Promise(r=>setImmediate(r));const request=h.calls.find(x=>x.action==='answer').payload;assert.equal(request.room_id,'room-1');assert.equal(request.round,1);assert.ok(request.request_id);assert.equal(request.score,undefined);assert.match(h.$('feedback').textContent,/Restano 2/);await h.window.happyDOM.close();
});

test('PokéIndizi shares host/player styling and only renders server-unlocked clues, reveal and podium',async()=>{
 for(const host of [false,true]){
 const room={room:{id:'r',code:'123456',phase:'question',round:7,manche:'clues',starts_at:Date.now()+5000,deadline:Date.now()+35000},server_now:Date.now(),remaining_ms:30000,can_control:host,received:0,clues:[],solution:null,solution_image:null,players:[],me:host?null:{done:false,points:0}};
 const h=await boot((host?'host':'play')+'/?room=r',{room});
 assert.ok(h.window.document.body.classList.contains('gameboy'));assert.equal(h.$('clue-intro').hidden,false);assert.equal(h.$('card-wrap').hidden,true);assert.equal(h.$('clues').children.length,0);assert.ok(!h.calls.some(c=>c.action==='card'));
 room.room.starts_at=Date.now()-1000;room.clues=['Primo indizio'];await h.notify();assert.equal(h.$('clue-intro').hidden,true);assert.equal(h.$('clues').children.length,1);
 room.solution='Snorlax';room.solution_image='assets/pokeindizi/snorlax.png';if(room.me)room.me={done:true,result:'correct',points:300};await h.notify();assert.equal(h.$('clue-reveal').hidden,false);assert.match(h.$('clue-image').src,/snorlax.png$/);
 room.room.phase='finished';room.room.round=12;await h.notify();assert.equal(h.$('results-title').textContent,'Podio finale');assert.ok(h.window.document.body.classList.contains('gameboy'));await h.window.happyDOM.close();
 }
});

test('Shift N skips one round in every multiplayer game, only for the host and outside editable fields',async()=>{
 for(const host of [true,false]){
 const room={room:{id:'r',code:'123456',phase:'question',round:1,revision:1,manche:'cards',starts_at:Date.now()-1000,deadline:Date.now()+30000},can_control:host,players:[],me:null,received:0};
 const h=await boot((host?'host':'play')+'/?room=r',{room});
 const press=async(target=h.window.document)=>{target.dispatchEvent(new h.window.KeyboardEvent('keydown',{key:'N',shiftKey:true,bubbles:true}));await new Promise(r=>setImmediate(r));};
 await press(h.$('answer'));assert.equal(h.calls.filter(c=>c.action==='command').length,0);
 for(const manche of ['cards','clues','price',1,2]){
  room.room.manche=manche;
  room.room.quiz=typeof manche==='number'?'culture':'pokemon';
  await h.notify();
  await press();
 }
 assert.deepEqual(h.calls.filter(c=>c.action==='command').map(c=>c.payload.command),
  host?Array(5).fill('skip_round'):[]);
 await h.window.happyDOM.close();
 }
});

test('PokéPrice renders host art and player choices, locks choices and shows the third-round standings',async()=>{
 for(const host of [true,false]){
  const card=(name,id)=>({name,id,number:'014/099',set:'Espansione',image:`/assets/cards/${id}.webp`});
  const now=Date.now();
  const room={
   room:{id:'r',code:'123456',phase:'question',round:13,manche:'price',starts_at:now+5000,deadline:now+20000},
   server_now:now, duration_ms:15000, remaining_ms:15000, can_control:host, received:0,
   players:[{user_id:'user-1',nickname:'Ash',score:100,rank:1}],
   me:host?null:{done:false,choice:null,score:0},
   price:{round:1,total:12,reference:{...card('Pikachu','a'),cents:12000},candidate:card('Eevee','b'),direction:null,correct:null},
  };
  const h=await boot((host?'host':'play')+'/?room=r',{room});
  assert.ok(h.window.document.body.classList.contains('pokeprice'));
  assert.equal(h.$('price-intro').hidden,false);
  assert.equal(h.$('price-background').hidden,false);
  assert.match(h.$('price-background').poster,/castelia-poster.webp$/);
  assert.equal(h.$('price-background').hasAttribute('src'),false);
  assert.equal(h.$('answer-form').hidden,true);
  assert.equal(h.$('price-candidate').querySelector('img').hasAttribute('src'),host);
  assert.equal(h.$('price-candidate').querySelector('strong').textContent,'??? €');
  assert.equal(h.$('price-higher').disabled,true);

  room.room.starts_at=now-1000;room.room.deadline=now+14000;await h.notify();
  assert.equal(h.$('price-intro').hidden,true);
  assert.equal(h.$('price-choices').hidden,host);
  if(!host){
   h.$('price-higher').click();
   assert.equal(h.$('price-lower').disabled,true);
   await new Promise(r=>setImmediate(r));
   const answer=h.calls.find(c=>c.action==='answer');
   assert.equal(answer.payload.answer,'higher');assert.equal(answer.payload.round,13);assert.ok(answer.payload.request_id);
   room.me={...room.me,done:true,choice:'higher'};await h.notify();
   assert.equal(h.$('price-higher').disabled,true);
   assert.equal(h.$('price-outcome').textContent,'Registrata: HIGHER');
  }
  room.room.phase='reveal';room.price={...room.price,candidate:{...room.price.candidate,cents:14000},direction:'higher',correct:1};
  if(!host)room.me={...room.me,result:'correct',points:100,score:100};
  await h.notify();
  assert.match(h.$('price-candidate').querySelector('strong').textContent,/140,00/);
  if(host)assert.equal(h.$('price-outcome').textContent,'');
  else assert.match(h.$('price-outcome').textContent,/\+100 punti/);
  assert.equal(h.$('results').hidden,true);
  room.room.round=15;room.price.round=3;
  if(!host)room.me={...room.me,bonus:20,points:120,streak:3};
  await h.notify();
  assert.equal(h.$('results').hidden,false);
  assert.equal(h.$('results-title').textContent,'Classifica intermedia');
  assert.equal(h.$('price-combo').hidden,host);
  room.room.phase='finished';await h.notify();
  assert.equal(h.$('price-stage').hidden,true);
  assert.equal(h.$('price-background').hidden,true);
  assert.equal(h.$('results-title').textContent,'Podio finale');
  await h.window.happyDOM.close();
 }
});


test('host music changes once per minigame, preserves volume, pauses and stops at exit',async()=>{
 const room={room:{id:'r',code:'123456',phase:'question',round:7,manche:'clues',starts_at:Date.now()-1000,deadline:Date.now()+30000},can_control:true,players:[],received:0,clues:[]};
 const h=await boot('host/?room=r',{room});
 assert.match(h.$('music').src,/oak-notebook.m4a$/);assert.equal(h.$('music').paused,false);
 assert.equal(h.$('audio-control').hidden,false);
 h.$('volume').value='0';h.$('volume').dispatchEvent(new h.window.Event('input'));
 assert.equal(h.$('music').volume,0);
 const starts=h.audioEvents.filter(e=>e[0]==='play').length;
 await h.notify();assert.equal(h.audioEvents.filter(e=>e[0]==='play').length,starts);
 room.room.phase='paused';await h.notify();assert.equal(h.$('music').paused,true);
 room.room.phase='question';await h.notify();assert.equal(h.$('music').paused,false);
 room.room.manche='price';room.room.round=13;
 room.price={round:1,total:12,reference:{id:'a',name:'A',set:'S',number:'1',image:'/a',cents:100},candidate:{id:'b',name:'B',set:'S',number:'2',image:'/b'},direction:null};
 await h.notify();assert.match(h.$('music').src,/castelia-card-market.m4a$/);assert.equal(h.$('music').volume,0);
 room.room.phase='finished';await h.notify();assert.equal(h.$('music').paused,true);
 assert.equal(h.$('audio-control').hidden,true);
 await h.window.happyDOM.close();
 const player=await boot('play/?room=r',{room:{...room,can_control:false}});
 assert.equal(player.audioEvents.some(e=>e[0]==='play'),false);await player.window.happyDOM.close();
});

test('blocked autoplay has an accessible activation button',async()=>{
 const room={room:{id:'r',code:'123456',phase:'question',round:7,manche:'clues',starts_at:Date.now()-1000,deadline:Date.now()+30000},can_control:true,players:[],received:0,clues:[]};
 const h=await boot('host/?room=r',{room,blockedAudio:true});
 assert.equal(h.$('enable-audio').hidden,false);assert.equal(h.$('audio-control').hidden,false);
 await h.window.happyDOM.close();
});

test('named and legacy licenses render safely in dashboard and selector',async()=>{
 const base={starts_at:Date.now(),expires_at:Date.now()+86400000,status:'attivo',max_rooms:2,used_rooms:0,quizzes:['pokemon']};
 const licenses=[{...base,id:'named-123',name:'Serata <Pokémon>'},{...base,id:'legacy-123'}];
 for(const path of ['admin/','host/']){
  const h=await boot(path,{admin:path==='admin/',licenses});
  assert.match(h.$('licenses').textContent,/Serata <Pokémon>/);assert.equal(h.$('licenses').querySelector('pokemon'),null);
  assert.match(h.$('license-select').options[0].textContent,/Serata <Pokémon>/);
  assert.match(h.$('license-select').options[1].textContent,/Host legacy-1/);
  if(path==='admin/'){
   h.$('license-form').querySelector('[name=name]').value='Serata Pokémon';
   h.$('license-form').dispatchEvent(new h.window.Event('submit',{cancelable:true}));
   await new Promise(r=>setImmediate(r));assert.equal(h.calls.find(c=>c.action==='license_create').payload.name,'Serata Pokémon');
  }
  await h.window.happyDOM.close();
 }
});


test('Cultura generale keeps player choices private and restores the selected country after reload',async()=>{
 const now=Date.now(),countries=[{id:'ITA',iso2:'IT',name:'Italia'},{id:'TZA',iso2:'TZ',name:'Tanzania'}];
 const makeRoom=(userId,me)=>({room:{id:'culture-room',code:'123456',quiz:'culture',manche:1,manche_total:3,phase:'question',round:1,revision:2,starts_at:new Date(now-1000).toISOString(),deadline:new Date(now+14000).toISOString()},server_now:now,duration_ms:15000,remaining_ms:15000,can_control:false,received:0,population:{year:2019,countries},solution:null,players:[{user_id:userId,nickname:userId,score:0,rank:1}],me});
 const firstRoom=makeRoom('user-1',{nickname:'Ash',score:0,done:false,choice:null});
 const first=await boot('play/?room=culture-room',{anonymous:true,userId:'user-1',room:firstRoom});
 assert.equal(first.$('culture-stage').hidden,false);assert.equal(first.$('card-wrap').hidden,true);assert.equal(first.$('answer-form').hidden,true);assert.equal(first.$('population-match').children.length,2);assert.equal(first.$('population-a').querySelector('.population-name').textContent,'Italia');assert.equal(first.$('population-a').querySelector('.population-value').textContent,'');assert.equal(first.$('results').hidden,true);
 assert.equal(first.$('population-progress').hidden,false);
 assert.match(first.$('population-progress').firstElementChild.style.transform,/^scaleX\(0\.\d+\)$/);
 assert.equal(first.$('population-a').querySelector('.population-flag').src,'https://goku.test/assets/flags/it.svg');assert.equal(first.$('population-a').querySelector('.population-flag').alt,'');
 first.$('population-b').dispatchEvent(new first.window.MouseEvent('click',{bubbles:true}));await new Promise(r=>setImmediate(r));
 assert.equal(first.calls.find(call=>call.action==='answer').payload.answer,'TZA');assert.ok(first.$('population-b').classList.contains('population-selected'));assert.match(first.$('population-feedback').textContent,/Tanzania/);
 const secondRoom=makeRoom('user-2',{nickname:'Misty',score:0,done:false,choice:null});
 const second=await boot('play/?room=culture-room',{anonymous:true,userId:'user-2',room:secondRoom});assert.ok(!second.$('population-b').classList.contains('population-selected'));assert.equal(second.$('population-b').disabled,false);
 const reloadRoom=makeRoom('user-1',{nickname:'Ash',score:0,done:true,choice:'TZA'});
 const reload=await boot('play/?room=culture-room',{anonymous:true,userId:'user-1',room:reloadRoom});assert.ok(reload.$('population-b').classList.contains('population-selected'));assert.equal(reload.$('population-b').disabled,true);
 reloadRoom.room.phase='paused';reloadRoom.room.paused_from='question';await reload.notify();
 assert.equal(reload.$('results').hidden,true);
 assert.equal(reload.$('population-phase').textContent,'In pausa');
 reloadRoom.room.phase='reveal';reloadRoom.population.values=[60297396,58005463];reloadRoom.population.correct='ITA';reloadRoom.me.result='wrong';reloadRoom.me.points=0;await reload.notify();
 assert.equal(reload.$('results').hidden,false);
 assert.ok(reload.$('population-progress').hasAttribute('data-hidden-progress'));
 const row=reload.$('ranking').firstElementChild;
 await reload.notify();
 assert.equal(reload.$('ranking').firstElementChild,row);
 assert.equal(reload.$('population-a').querySelector('.population-value').textContent,'60.297.396 abitanti');assert.equal(reload.$('population-b').querySelector('.population-value').textContent,'58.005.463 abitanti');assert.ok(reload.$('population-a').classList.contains('population-winner'));assert.ok(reload.$('population-b').classList.contains('population-loser'));assert.equal(reload.$('population-score').textContent,'0 punti');assert.equal(reload.$('population-score').hidden,false);assert.equal(reload.$('population-compare').hidden,false);assert.match(reload.$('population-compare').textContent,/Italia · 60,3 mln/);assert.match(reload.$('solution').textContent,/Italia ha più abitanti/);
 await Promise.all([first.window.happyDOM.close(),second.window.happyDOM.close(),reload.window.happyDOM.close()]);
});

test('host only sees the licensed quiz choices and no Pokémon audio for Cultura generale',async()=>{
 const licenses=[{id:'lic',name:'Solo Cultura',status:'attivo',starts_at:Date.now(),expires_at:Date.now()+86400000,max_rooms:1,used_rooms:0,quizzes:['culture']}];
 const host=await boot('host/',{licenses});assert.equal(host.$('quiz').value,'culture');assert.equal(host.$('quiz').options[0].disabled,true);assert.equal(host.$('quiz').options[1].disabled,false);await host.window.happyDOM.close();
 const room={room:{id:'r',code:'123456',quiz:'culture',manche:1,manche_total:3,phase:'lobby',round:0,revision:0},can_control:true,players:[],received:0};
 const game=await boot('host/?room=r',{room});assert.equal(game.audioEvents.some(e=>e[0]==='play'),false);await game.window.happyDOM.close();
 const now=Date.now();
 const pausedReveal={room:{id:'culture-room',code:'123456',quiz:'culture',manche:1,manche_total:3,phase:'paused',paused_from:'reveal',round:1,revision:3,starts_at:new Date(now-15000).toISOString(),deadline:new Date(now+6000).toISOString(),remaining_ms:6000},server_now:now,duration_ms:15000,remaining_ms:6000,can_control:true,received:1,players:[{user_id:'p1',nickname:'Ash',score:100,rank:1}],population:{year:2025,countries:[{id:'ITA',iso2:'IT',name:'Italia'},{id:'TZA',iso2:'TZ',name:'Tanzania'}],values:[60924851,69145464],correct:'TZA'},me:null};
 const pausedHost=await boot('host/?room=culture-room',{room:pausedReveal});
 assert.equal(pausedHost.$('culture-stage').hidden,false);assert.equal(pausedHost.$('results').hidden,false);assert.equal(pausedHost.$('results-title').textContent,'Soluzione e classifica');assert.equal(pausedHost.$('population-b').querySelector('.population-flag').src,'https://goku.test/assets/flags/tz.svg');assert.equal(pausedHost.$('population-a').querySelector('.population-name').textContent,'Italia');assert.equal(pausedHost.$('population-b').querySelector('.population-value').textContent,'69.145.464 abitanti');assert.equal(pausedHost.$('solution').textContent,'Tanzania ha più abitanti (69.145.464, stima 2025).');assert.equal(pausedHost.$('population-b').disabled,true);assert.equal(pausedHost.$('population-phase').textContent,'In pausa');assert.equal(pausedHost.window.document.querySelector('[data-command=resume]').hidden,false);assert.equal(pausedHost.window.document.querySelector('[data-command=end]').hidden,false);await pausedHost.window.happyDOM.close();
});

test('Cronologia toggles and resets ranks, submits once, and reveals the player order',async()=>{
 const now=Date.now(),items=[
  {id:0,name:'Interstellar - Christopher Nolan'},
  {id:1,name:'Avatar - James Cameron'},
  {id:2,name:'Spider-Man - Sam Raimi'},
  {id:3,name:'Ratatouille - Brad Bird'},
 ];
 const room={
  room:{id:'chronology-room',code:'123456',quiz:'culture',manche:2,round:5,revision:1,
   phase:'question',starts_at:now+9000,deadline:now+39000},
  chronology:{category:'Film',total:5,participants:1,card_interval_ms:2000,points_per_match:50,items},
  server_now:now,duration_ms:30000,remaining_ms:29000,can_control:false,received:0,
  players:[],me:{done:false,points:0},
 };
 const h=await boot('play/?room=chronology-room',{anonymous:true,room});
 const send=h.$('chronology-send'),reset=h.$('chronology-reset'),list=h.$('chronology-items');
 const cards=[...list.children];
 const ranks=()=>cards.map(card=>card.querySelector('.chronology-position').textContent);
 assert.deepEqual(cards.map(card=>card.querySelector('.chronology-name').textContent),['Interstellar','Avatar','Spider-Man','Ratatouille']);
 assert.equal(list.querySelectorAll('[data-present]').length,0);
 for(const [index,elapsed] of [3050,5050,7050,9050].entries()){
  room.server_now=now+elapsed;
  await h.notify();
  assert.equal(list.querySelectorAll('[data-present]').length,index+1);
  assert.ok(cards.every(card=>card.disabled===(elapsed<9000)));
 }
 assert.equal(send.disabled,true);
 cards.forEach(card=>card.click());
 cards[1].click();
 assert.deepEqual(ranks(),['1','','2','3']);
 assert.equal(send.disabled,true);
 reset.click();
 assert.deepEqual(ranks(),['','','','']);
 for(const id of [2,1,3,0])cards[id].click();
 room.room.phase='paused';room.room.revision++;
 await h.notify();
 assert.equal(send.disabled,true);assert.equal(reset.disabled,true);
 assert.ok(cards.every(card=>card.disabled));
 assert.equal(h.$('chronology-phase').textContent,'In pausa');
 room.room.phase='question';room.room.revision++;
 await h.notify();
 send.click();send.click();
 await new Promise(resolve=>setImmediate(resolve));
 const answers=h.calls.filter(call=>call.action==='answer');
 assert.equal(answers.length,1);
 assert.deepEqual(answers[0].payload.answer,[2,1,3,0]);
 assert.equal(answers[0].payload.manche,2);
 assert.equal(send.hidden,true);assert.match(h.$('chronology-status').textContent,/In attesa/);
 room.room.phase='reveal';room.room.revision++;
 room.chronology.correct=[2,3,1,0];
 room.chronology.view='solution';room.chronology.ranking_ms=10000;
 items.forEach((item,i)=>{item.year=[2014,2009,2002,2007][i];});
 room.me.points=100;
 await h.notify();
 assert.deepEqual([...list.children].map(card=>[card.dataset.item,card.dataset.result]),
  [['2','correct'],['3','wrong'],['1','wrong'],['0','correct']]);
 assert.deepEqual([...list.children].map(card=>card.querySelector('.chronology-detail').textContent),['+50','0','0','+50']);
 assert.match(h.$('chronology-status').textContent,/100 punti/);
 assert.deepEqual([...list.children].map(card=>card.querySelector('.chronology-year').textContent),['2002','2007 · tu: 3°','2009 · tu: 2°','2014']);
 assert.deepEqual([...list.children].map(card=>card.querySelector('.chronology-position').textContent),['1','2','3','4']);
 assert.equal(h.$('chronology-solution'),null);
 assert.equal(h.$('chronology-phase').textContent,'In attesa del conduttore…');
 assert.equal(h.$('chronology-leaderboard').hidden,true);
 await h.window.happyDOM.close();
});

test('Cronologia presents previous scores, freezes the tally and reorders the standings on resume',async()=>{
 const now=Date.now();
 const room={
  room:{id:'chronology-ranking-room',code:'123456',quiz:'culture',manche:2,round:1,revision:1,
   phase:'reveal',starts_at:now-30000,deadline:now+9900},
  chronology:{category:'Brand',total:5,participants:2,card_interval_ms:2000,points_per_match:50,
   view:'ranking',ranking_ms:10000,items:[{id:0,name:'LEGO',year:1932}],correct:[0]},
  server_now:now,duration_ms:30000,remaining_ms:9900,can_control:true,received:2,me:null,
  players:[{user_id:'p1',nickname:'Misty',score:300,round_points:200,rank:1},
   {user_id:'p2',nickname:'Ash',score:170,round_points:0,rank:2}],
 };
 const h=await boot('host/?room=chronology-ranking-room',{room});
 h.window.matchMedia=()=>({matches:false});
 const standings=()=>[...h.$('chronology-leaderboard').querySelectorAll('li')].map(row=>
  ['position','name','points'].map(part=>row.querySelector('.chronology-ranking-'+part).textContent));
 const control=command=>h.window.document.querySelector(`[data-command="${command}"]`);
 assert.equal(h.$('chronology-board').hidden,true);
 assert.deepEqual(standings(),[['1','Ash','170 pt'],['2','Misty','100 pt']]);
 assert.equal(control('pause').textContent,'Pausa classifica');
 room.room.phase='paused';room.room.paused_from='reveal';room.room.revision++;
 room.remaining_ms=8800;
 await h.notify();
 assert.equal(h.$('chronology-phase').textContent,'Classifica in pausa');
 assert.equal(control('resume').textContent,'Riprendi classifica');
 assert.deepEqual(standings(),[['1','Ash','170 pt'],['2','Misty','167 pt']]);
 await h.notify();
 assert.equal(standings()[1][2],'167 pt');
 room.room.phase='reveal';room.room.revision++;room.room.deadline=Date.now()+7750;room.server_now=Date.now();
 await h.notify();
 assert.deepEqual(standings(),[['1','Misty','300 pt'],['2','Ash','170 pt']]);
 await h.window.happyDOM.close();
});

test('Quanto ci vai vicino? restores the receipt and gates the Terracotta solution, rain and podium on server time',async()=>{
 const now=Date.now();
 const room={
  room:{id:'vault-room',code:'123456',quiz:'culture',manche:3,manche_total:3,phase:'question',round:1,revision:1,starts_at:now-1000,deadline:now+19000},
  server_now:now,duration_ms:20000,remaining_ms:19000,received:0,active:2,
  players:[],can_control:false,me:{user_id:'user-1',done:false,choice:null,score:0},
  vault:{id:'Q12',category:'Curiosità storiche',difficulty:'media',unit:'statue',effect:'terracotta-army',
   prompt:"Quante statue di guerrieri si stima che compongano l'Esercito di Terracotta cinese?",
   mobile:'Esercito di Terracotta: quanti guerrieri si stimano?',min:1,max:99_999_999},
 };
 const h=await boot('play/?room=vault-room',{anonymous:true,room,answerResponse:payload=>({error:'Ricevuta non disponibile'})});
 const key=value=>h.$('vault-keypad').querySelector(`[data-key="${value}"]`).click();
 assert.equal(h.$('question').hidden,true);
 assert.equal(h.$('vault-answer').hidden,true);
 assert.equal(h.$('error').textContent,'');
 assert.equal(h.$('notice').textContent,'');
 key('0');assert.equal(h.$('vault-send').disabled,true);
 for(const digit of '123456789')key(digit);
 assert.equal(h.$('vault-number').textContent,'12.345.678');
 assert.match(h.$('vault-status').textContent,/Limite di 8 cifre/);
 key('back');key('clear');
 h.$('vault-assist').click();
 assert.equal(h.$('vault-keypad').hidden,true);
 h.$('vault-assisted').value='0008000';
 h.$('vault-assisted').dispatchEvent(new h.window.Event('input'));
 assert.equal(h.$('vault-assisted').value,'8000');
 h.$('vault-send').click();
 await new Promise(r=>setImmediate(r));
 assert.equal(h.$('vault-send').textContent,'Riprova invio');
 h.$('vault-send').click();
 await new Promise(r=>setImmediate(r));
 const payloads=h.calls.filter(x=>x.action==='answer').map(x=>x.payload);
 assert.equal(payloads.length,2);
 assert.deepEqual(payloads[0],payloads[1]);
 assert.equal(payloads[0].answer,8000);
 assert.equal(payloads[0].manche,3);
 Object.assign(room.me,{done:true,choice:8000});
 room.room.revision++;
 await h.notify();
 assert.equal(h.$('vault-entry').hidden,true);
 assert.equal(h.$('vault-hold-status').textContent,'RISPOSTA BLOCCATA');
 assert.equal(h.window.sessionStorage.getItem('goku-vault-send'),null);

 Object.assign(room.room,{phase:'paused',paused_from:'reveal',revision:3});
 room.duration_ms=8000;
 room.remaining_ms=6400;
 room.players=[{user_id:'user-1',nickname:'Ada',rank:1,score:100}];
 Object.assign(room.me,{points:100,rank:1,score:100});
 room.vault_result={solution:8000,explanation:'8.000 guerrieri è una stima, non un conteggio esatto.',source:null,popup:"L'IMPERATORE APPROVA!"};
 await h.notify();
 assert.equal(h.$('vault-answer').hidden,true);
 assert.equal(h.$('vault-solution').textContent,'');
 room.remaining_ms=4800;room.room.revision++;
 await h.notify();
 assert.equal(h.$('vault-solution').textContent,'8.000');
 assert.match(h.$('vault-personal').textContent,/Stima esatta.*8\.000 statue.*Punti.*\+100/);
 assert.equal(h.$('vault-ranking').hidden,true);
 room.remaining_ms=2300;room.room.revision++;await h.notify();
 assert.match(h.$('vault-total').textContent,/1° nella domanda.*100 punti totali/);
 await h.window.happyDOM.close();

 Object.assign(room,{can_control:true,me:null,remaining_ms:6400});
 room.vault_result.distribution=[[100,1],[1001,99]];
 room.vault_result.podium=[{rank:1,points:10,players:[{nickname:'Ada',choice:1001}]}];
 const host=await boot('host/?room=vault-room',{room});
 assert.equal(host.$('vault-scale-label').textContent,'Scala logaritmica · statue');
 assert.equal(host.$('vault-axis').querySelectorAll('use').length,2);
 assert.equal(host.$('vault-axis').textContent.includes('×99'),true);
 assert.equal(host.$('vault-answer').hidden,true);
 room.remaining_ms=4800;room.room.revision++;await host.notify();
 assert.equal(host.$('vault-popup').textContent,"L'IMPERATORE APPROVA!");
 assert.equal(host.$('vault-art').querySelectorAll('.vault-warrior').length,12);
 assert.equal(host.$('vault-solution').textContent,'8.000');
 Object.assign(room.room,{phase:'paused',paused_from:'question',round:1,revision:room.room.revision+1});
 Object.assign(room.vault,{intro_ms:4000,preview_ms:1000,max_points:200});
 Object.assign(room,{duration_ms:20000,remaining_ms:23500,received:0,players:[],vault_result:undefined});
 await host.notify();
 assert.equal(host.$('vault-opening').hidden,false);
 assert.equal(host.$('vault-clock').hidden,true);
 assert.match(host.$('vault-opening-rule').textContent,/200 punti/);
 room.remaining_ms=20750;room.room.revision++;
 await host.notify();
 assert.equal(host.$('vault-opening').hidden,true);
 assert.equal(host.$('vault-clock').hidden,false);
 Object.assign(room.room,{paused_from:'reveal',round:2,revision:room.room.revision+1});
 Object.assign(room,{duration_ms:8000,remaining_ms:5000,received:1,active:7,
  players:[{user_id:'user-1',nickname:'Ada',rank:1,score:200}],
  vault_result:{solution:8000,explanation:'8.000 statue è una stima.',source:null,popup:"L'IMPERATORE APPROVA!",
   early:true,max_points:200,distribution:[[8000,1]],podium:[{rank:1,points:200,players:[{nickname:'Ada',choice:8000}]}]},
 });
 await host.notify();
 assert.equal(host.$('vault-presence').textContent,'1 risposta inviata');
 assert.equal(host.$('vault-answer').hidden,false);
 assert.equal(host.$('vault-ranking').hidden,false);
 assert.equal(host.$('vault-solution').querySelector('[data-reel]'),null);
 assert.match(host.$('vault-podium').textContent,/\+200 pt/);
 await host.window.happyDOM.close();
});

test('Cronologia shows Avanti only to the host during the solution and sends the round with it',async()=>{
 const now=Date.now();
 const room={
  room:{id:'avanti-room',code:'123456',quiz:'culture',manche:2,round:3,revision:7,phase:'reveal',starts_at:now-30000,deadline:null},
  chronology:{category:'Brand',total:5,participants:1,card_interval_ms:2000,points_per_match:50,view:'solution',ranking_ms:10000,
   items:[{id:0,name:'LEGO',year:1932},{id:1,name:'Nike',year:1964}],correct:[0,1]},
  server_now:now,duration_ms:30000,remaining_ms:0,can_control:true,received:1,me:null,
  players:[{user_id:'p1',nickname:'Misty',score:100,round_points:100,rank:1}],
 };
 const h=await boot('host/?room=avanti-room',{room});
 const control=command=>h.window.document.querySelector(`[data-command="${command}"]`);
 assert.equal(control('advance').hidden,false);
 assert.equal(control('pause').hidden,true);
 assert.equal(h.$('chronology-leaderboard').hidden,true);
 assert.equal(h.$('chronology-count').textContent,'');
 assert.deepEqual([...h.$('chronology-items').children].map(card=>card.querySelector('.chronology-year').textContent),['1932','1964']);
 control('advance').click();
 await new Promise(resolve=>setImmediate(resolve));
 const sent=h.calls.find(call=>call.action==='command');
 assert.deepEqual([sent.payload.command,sent.payload.round,sent.payload.manche],['advance',3,2]);
 room.chronology.view='ranking';room.room.deadline=Date.now()+10000;room.remaining_ms=10000;room.room.revision++;
 await h.notify();
 assert.equal(control('advance').hidden,true);
 assert.equal(control('pause').hidden,false);
 assert.equal(h.$('chronology-leaderboard').hidden,false);
 await h.window.happyDOM.close();
 const player=await boot('play/?room=avanti-room',{anonymous:true,room:{...room,can_control:false,chronology:{...room.chronology,view:'solution'},me:{user_id:'p1',nickname:'Misty',score:100,done:true,choice:[0,1],points:100}}});
 assert.equal(player.$('chronology-phase').textContent,'In attesa del conduttore…');
 assert.equal(player.$('controls').hidden,true);
 await player.window.happyDOM.close();
});

test('Cultura generale final podium groups ties on steps and splits points by manche',async()=>{
 const players=[
  {user_id:'a',nickname:'Ash',score:500,rank:1,manche_scores:{1:300,2:100,3:100}},
  {user_id:'b',nickname:'Misty',score:500,rank:1,manche_scores:{1:200,2:200,3:100}},
  {user_id:'c',nickname:'Brock',score:320,rank:3,manche_scores:{1:120,2:0,3:200}},
  {user_id:'d',nickname:'Gary',score:10,rank:4,manche_scores:{1:10}},
 ];
 const room={room:{id:'final-room',code:'123456',quiz:'culture',manche:3,manche_total:3,round:6,revision:9,phase:'finished'},
  server_now:Date.now(),remaining_ms:0,can_control:true,received:0,players,me:null};
 const h=await boot('host/?room=final-room',{room});
 assert.equal(h.$('results').hidden,false);
 assert.equal(h.$('results-title').textContent,'Podio finale');
 const steps=[...h.$('podium').querySelectorAll('.podium-step')];
 assert.deepEqual(steps.map(step=>[step.dataset.place,step.dataset.rank,[...step.querySelectorAll('.podium-name')].map(n=>n.textContent).join('+')]),
  [['2','3','Brock'],['1','1','Ash+Misty']]);
 assert.match(h.$('podium').textContent,/Pari merito/);
 assert.equal(h.$('final-table-wrap').hidden,false);
 assert.equal(h.$('ranking').hidden,true);
 assert.deepEqual([...h.$('final-table').querySelectorAll('tbody tr')].map(row=>[...row.querySelectorAll('th,td')].map(cell=>cell.textContent)),
  [['1°','Ash','300','100','100','500'],['1°','Misty','200','200','100','500'],['3°','Brock','120','0','200','320'],['4°','Gary','10','0','0','10']]);
 assert.ok(h.window.document.body.classList.contains('culture-final'));
 await h.window.happyDOM.close();
 // Older rooms without a complete split keep the plain ranking.
 delete players[3].manche_scores;
 const legacy=await boot('host/?room=final-room',{room});
 assert.equal(legacy.$('final-table-wrap').hidden,true);
 assert.equal(legacy.$('ranking').hidden,false);
 await legacy.window.happyDOM.close();
});

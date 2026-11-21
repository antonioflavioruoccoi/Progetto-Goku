import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import vm from 'node:vm';import crypto from 'node:crypto';import {Window} from 'happy-dom';import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:['web/app.js'],bundle:true,write:false,format:'iife',plugins:[{name:'mock-qr',setup(b){b.onResolve({filter:/^qrcode$/},args=>({path:args.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:"export default {toCanvas:async()=>{}}"}));}}]});
const app=outputFiles[0].text,html=await fs.readFile('web/app.html','utf8');
async function boot(path,{anonymous=false,admin=false,room=null,licenses=[],blockedAudio=false,userId='user-1'}={}){
 const window=new Window({url:'https://goku.test/'+path,settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}});window.document.write(html);const calls=[];let callback;
 const fetch=async(url,options)=>{const {action,payload}=JSON.parse(options.body);calls.push({action,payload});return {ok:true,json:async()=>action==='identity'?{id:userId,role:admin?'admin':anonymous?'player':'host'}:action==='dashboard'?{admin,licenses,rooms:[],server_now:Date.now()}:action==='state'?room:action==='answer'?room?.price?{done:true,choice:payload.answer}:room?.population?(Object.assign(room.me,{done:true,choice:payload.answer,result:'wrong',points:0}),{done:true,choice:payload.answer,result:'wrong',points:0}):{result:'wrong',attempts:1,done:false}:{}};};
 class WebSocket {static OPEN=1;readyState=1;constructor(){callback=()=>this.onmessage?.({data:JSON.stringify(room)});}close(){}}
 window.matchMedia=()=>({matches:true});
 const audio=window.document.getElementById('music'),audioEvents=[];let paused=true;
 Object.defineProperty(audio,'paused',{get:()=>paused});
 audio.play=()=>{audioEvents.push(['play',audio.src]);if(blockedAudio)return Promise.reject(Error('Autoplay blocked'));paused=false;return Promise.resolve();};
 audio.pause=()=>{paused=true;audioEvents.push(['pause',audio.src]);};
 audio.load=()=>audioEvents.push(['load',audio.src]);
 const context=vm.createContext({fetch,WebSocket,document:window.document,location:window.location,history:window.history,sessionStorage:window.sessionStorage,navigator:window.navigator,window,URL,URLSearchParams,FormData:window.FormData,Image:window.Image,crypto,console,setInterval:()=>0,setTimeout:fn=>queueMicrotask(fn),clearTimeout:()=>{}});
 vm.runInContext(app,context);await new Promise(r=>setImmediate(r));return {window,calls,audioEvents,notify:async()=>{await callback?.();await new Promise(r=>setImmediate(r));},$:id=>window.document.getElementById(id)};
}
test('non-admin sees password form without rendering dashboard',async()=>{const h=await boot('admin/');assert.equal(h.$('auth').hidden,false);assert.equal(h.$('dashboard').hidden,true);assert.equal(h.$('admin-tools').hidden,true);await h.window.happyDOM.close();});
test('admin dashboard is rendered only after server authorization',async()=>{const h=await boot('admin/',{admin:true});assert.equal(h.$('dashboard').hidden,false);assert.equal(h.$('admin-tools').hidden,false);assert.equal(h.$('license-select-label').hidden,true);await h.window.happyDOM.close();});
test('player reconnect renders server identity; WebSocket snapshot and answer use API',async()=>{
 const room={room:{id:'room-1',code:'123456',phase:'question',round:1,revision:2,starts_at:new Date(Date.now()-1000).toISOString(),deadline:new Date(Date.now()+25000).toISOString()},server_now:new Date().toISOString(),remaining_ms:25000,can_control:false,received:0,solution:null,players:[{user_id:'user-1',nickname:'Ash',score:0,rank:1,connected:true}],me:{nickname:'Ash',score:0,done:false,attempts:0}};
 const h=await boot('play/?room=room-1',{anonymous:true,room});assert.equal(h.$('room').hidden,false);assert.equal(h.$('join-panel').hidden,true);assert.equal(h.$('controls').hidden,true);assert.equal(h.$('card-wrap').hidden,true);assert.equal(h.$('answer-form').hidden,false);
 const before=h.calls.filter(x=>x.action==='state').length;await h.notify();assert.equal(h.calls.filter(x=>x.action==='state').length,before,'WebSocket pushes state without another request');
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

test('Shift N advances the first two manches only for the host and outside editable fields',async()=>{
 for(const host of [true,false]){
 const room={room:{id:'r',code:'123456',phase:'question',round:1,revision:1,manche:'cards',starts_at:Date.now()-1000,deadline:Date.now()+30000},can_control:host,players:[],me:null,received:0};
 const h=await boot((host?'host':'play')+'/?room=r',{room});
 const press=async(target=h.window.document)=>{target.dispatchEvent(new h.window.KeyboardEvent('keydown',{key:'N',shiftKey:true,bubbles:true}));await new Promise(r=>setImmediate(r));};
 await press(h.$('answer'));assert.equal(h.calls.filter(c=>c.action==='command').length,0);
 await press();assert.equal(h.calls.filter(c=>c.action==='command').length,host?1:0);
 if(host)assert.equal(h.calls.find(c=>c.action==='command').payload.command,'skip_to_clues');
 room.room.manche='clues';await h.notify();await press();
 assert.equal(h.calls.filter(c=>c.action==='command').length,host?2:0);
 if(host)assert.equal(h.calls.filter(c=>c.action==='command').at(-1).payload.command,'skip_to_price');
 room.room.manche='price';await h.notify();await press();assert.equal(h.calls.filter(c=>c.action==='command').length,host?2:0);await h.window.happyDOM.close();
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
 const now=Date.now(),countries=[{id:'ITA',name:'Italia'},{id:'TZA',name:'Tanzania'}];
 const makeRoom=(userId,me)=>({room:{id:'culture-room',code:'123456',quiz:'culture',manche:1,manche_total:3,phase:'question',round:1,revision:2,starts_at:new Date(now-1000).toISOString(),deadline:new Date(now+14000).toISOString()},server_now:now,duration_ms:15000,remaining_ms:15000,can_control:false,received:0,population:{year:2019,countries},solution:null,players:[{user_id:userId,nickname:userId,score:0,rank:1}],me});
 const firstRoom=makeRoom('user-1',{nickname:'Ash',score:0,done:false,choice:null});
 const first=await boot('play/?room=culture-room',{anonymous:true,userId:'user-1',room:firstRoom});
 assert.equal(first.$('culture-stage').hidden,false);assert.equal(first.$('card-wrap').hidden,true);assert.equal(first.$('answer-form').hidden,true);assert.equal(first.$('population-match').children.length,2);assert.equal(first.$('population-a').querySelector('.population-name').textContent,'Italia');assert.equal(first.$('population-a').querySelector('.population-value').textContent,'');assert.equal(first.$('results').hidden,false);
 first.$('population-b').dispatchEvent(new first.window.MouseEvent('click',{bubbles:true}));await new Promise(r=>setImmediate(r));
 assert.equal(first.calls.find(call=>call.action==='answer').payload.answer,'TZA');assert.ok(first.$('population-b').classList.contains('population-selected'));assert.match(first.$('population-feedback').textContent,/Tanzania/);
 const secondRoom=makeRoom('user-2',{nickname:'Misty',score:0,done:false,choice:null});
 const second=await boot('play/?room=culture-room',{anonymous:true,userId:'user-2',room:secondRoom});assert.ok(!second.$('population-b').classList.contains('population-selected'));assert.equal(second.$('population-b').disabled,false);
 const reloadRoom=makeRoom('user-1',{nickname:'Ash',score:0,done:true,choice:'TZA'});
 const reload=await boot('play/?room=culture-room',{anonymous:true,userId:'user-1',room:reloadRoom});assert.ok(reload.$('population-b').classList.contains('population-selected'));assert.equal(reload.$('population-b').disabled,true);
 reloadRoom.room.phase='reveal';reloadRoom.population.values=[60297396,58005463];reloadRoom.population.correct='ITA';reloadRoom.me.result='wrong';reloadRoom.me.points=0;await reload.notify();
 assert.equal(reload.$('population-a').querySelector('.population-value').textContent,'60.297.396 abitanti');assert.equal(reload.$('population-b').querySelector('.population-value').textContent,'58.005.463 abitanti');assert.ok(reload.$('population-a').classList.contains('population-winner'));assert.match(reload.$('population-feedback').textContent,/Risposta sbagliata/);assert.match(reload.$('solution').textContent,/Italia ha più abitanti/);
 await Promise.all([first.window.happyDOM.close(),second.window.happyDOM.close(),reload.window.happyDOM.close()]);
});

test('host only sees the licensed quiz choices and no Pokémon audio for Cultura generale',async()=>{
 const licenses=[{id:'lic',name:'Solo Cultura',status:'attivo',starts_at:Date.now(),expires_at:Date.now()+86400000,max_rooms:1,used_rooms:0,quizzes:['culture']}];
 const host=await boot('host/',{licenses});assert.equal(host.$('quiz').value,'culture');assert.equal(host.$('quiz').options[0].disabled,true);assert.equal(host.$('quiz').options[1].disabled,false);await host.window.happyDOM.close();
 const room={room:{id:'r',code:'123456',quiz:'culture',manche:1,manche_total:3,phase:'lobby',round:0,revision:0},can_control:true,players:[],received:0};
 const game=await boot('host/?room=r',{room});assert.equal(game.audioEvents.some(e=>e[0]==='play'),false);await game.window.happyDOM.close();
});

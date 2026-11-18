import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import vm from 'node:vm';import crypto from 'node:crypto';import {Window} from 'happy-dom';import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:['web/app.js'],bundle:true,write:false,format:'iife',plugins:[{name:'mock-qr',setup(b){b.onResolve({filter:/^qrcode$/},args=>({path:args.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:"export default {toCanvas:async()=>{}}"}));}}]});
const app=outputFiles[0].text,html=await fs.readFile('web/app.html','utf8');
async function boot(path,{anonymous=false,admin=false,room=null}={}){
 const window=new Window({url:'https://goku.test/'+path,settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}});window.document.write(html);const calls=[];let callback;
 const fetch=async(url,options)=>{const {action,payload}=JSON.parse(options.body);calls.push({action,payload});return {ok:true,json:async()=>action==='identity'?{id:'user-1',role:admin?'admin':anonymous?'player':'host'}:action==='dashboard'?{admin,licenses:[],rooms:[],server_now:Date.now()}:action==='state'?room:action==='answer'?room?.price?{done:true,choice:payload.answer}:{result:'wrong',attempts:1,done:false}:{}};};
 class WebSocket {static OPEN=1;readyState=1;constructor(){callback=()=>this.onmessage?.({data:JSON.stringify(room)});}close(){}}
 window.matchMedia=()=>({matches:true});
 const context=vm.createContext({fetch,WebSocket,document:window.document,location:window.location,history:window.history,sessionStorage:window.sessionStorage,navigator:window.navigator,window,URL,URLSearchParams,FormData:window.FormData,Image:window.Image,crypto,console,setInterval:()=>0,setTimeout:fn=>queueMicrotask(fn),clearTimeout:()=>{}});
 vm.runInContext(app,context);await new Promise(r=>setImmediate(r));return {window,calls,notify:async()=>{await callback?.();await new Promise(r=>setImmediate(r));},$:id=>window.document.getElementById(id)};
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

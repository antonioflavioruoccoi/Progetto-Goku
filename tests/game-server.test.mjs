import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import fs from 'node:fs/promises';
import {drawVault, publicVault, settleVault, validGuess, vaultPoints, vaultQuestion} from '../worker/number-vault.js';
import {MEADOW_CATEGORIES, drawMeadow, meadowPoints} from '../worker/meadow.js';
const { outputFiles } = await build({entryPoints:['worker/index.js'],bundle:true,write:false,format:'esm'});
const { Goku, addPoints } = await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const quiz = JSON.parse(await fs.readFile('worker/generated/quiz.json','utf8'));
function setupCultureGame(ids=['admin','p1','p2']) {
 const game=Object.create(Goku.prototype),records=new Map();
 game.get=(kind,id)=>structuredClone(records.get(kind+':'+id)||null);
 game.put=(kind,id,value)=>records.set(kind+':'+id,structuredClone(value));
 game.all=kind=>[...records].filter(([key])=>key.startsWith(kind+':')).map(([,value])=>structuredClone(value));
 game.ctx={getWebSockets:()=>[]};game.changed=new Set();
 for(const id of ids)game.put('session',id,{id,role:id==='admin'?'admin':'player',expires:Date.now()+86400000});
 return {game,rpc:(session,action,payload={})=>game.dispatch(action,payload,{session})};
}

test('last answer before the deadline reveals once; a missing or late answer waits for expiry', t => {
 t.mock.timers.enable({apis:['Date'],now:1700000000000});
 for(const manche of ['cards','clues','price'])for(const early of [true,false]){
  const game=Object.create(Goku.prototype),records=new Map();game.changed=new Set();
  game.get=(k,id)=>structuredClone(records.get(k+id));game.put=(k,id,v)=>records.set(k+id,structuredClone(v));
  game.all=k=>[...records].filter(([id])=>id.startsWith(k)).map(([,v])=>structuredClone(v));game.ctx={getWebSockets:()=>[]};
  for(const [id,role] of [['a','admin'],['p1','player'],['p2','player']])game.put('session',id,{id,role,expires:Date.now()+86400000});
  const rpc=(id,action,payload={})=>game.dispatch(action,payload,{session:id});
  const room=rpc('a','create');for(const id of ['p1','p2'])rpc(id,'join',{code:room.code,nickname:id});
  const command=command=>rpc('a','command',{room_id:room.id,revision:game.get('room',room.id).revision,command});
  command('start');if(manche!=='cards')command('skip_to_clues');if(manche==='price')command('skip_to_price');
  let r=game.get('room',room.id);t.mock.timers.tick(r.starts_at-Date.now());
  const answer=manche==='price'?'higher':game.question(r).name;
  const send=(id,request_id=crypto.randomUUID())=>rpc(id,'answer',{room_id:r.id,round:r.round,answer,request_id});
  send('p1');assert.equal(game.get('room',r.id).phase,'question');
  t.mock.timers.tick(r.deadline-Date.now()-1);
  const request=crypto.randomUUID();if(early)send('p2',request);
  r=game.get('room',r.id);assert.equal(r.phase,early?'reveal':'question');
  const scores=Object.values(r.players).map(p=>p.score),revision=r.revision;
  t.mock.timers.tick(1);assert.equal(game.settle(r),!early);
  assert.equal(r.phase,'reveal');assert.equal(game.settle(r),false);
  if(early){assert.equal(r.revision,revision);assert.deepEqual(Object.values(r.players).map(p=>p.score),scores);send('p2',request);}
  else assert.throws(()=>send('p2'),/chiuse/);
  for(const id of ['a','p1','p2'])assert.equal(rpc(id,'state',{room_id:r.id}).room.phase,'reveal');
 }
});

test('license names are validated, trimmed and compatible with unnamed stored licenses',()=>{
 const game=Object.create(Goku.prototype),records=new Map();
 game.get=(k,id)=>structuredClone(records.get(k+id));game.put=(k,id,v)=>records.set(k+id,structuredClone(v));
 game.all=k=>[...records].filter(([id])=>id.startsWith(k)).map(([,v])=>structuredClone(v));
 game.put('session','a',{id:'a',role:'admin',expires:Date.now()+86400000});
 const rpc=(action,payload={})=>game.dispatch(action,payload,{session:'a',inviteHash:'hash'});
 for(const name of [null,{},[],80,'x'.repeat(81)])assert.throws(()=>rpc('license_create',{name,hours:1,max_rooms:1}),/Nome della licenza/);
 const named=rpc('license_create',{name:'  Serata Pokémon  ',hours:1,max_rooms:1});
 const old=rpc('license_create',{hours:1,max_rooms:1});
 const legacy=game.get('license',old.id);delete legacy.name;game.put('license',old.id,legacy);
 const dashboard=rpc('dashboard');
 assert.equal(dashboard.licenses.find(l=>l.id===named.id).name,'Serata Pokémon');
 assert.equal(dashboard.licenses.find(l=>l.id===old.id).name,'');
});

test('server game logic: Pixelcard and PokéIndizi feed the 12 PokéPrice comparisons and cumulative podium', t => {
 t.mock.timers.enable({apis:['Date'],now:1700000000000});
 // Exercise production game methods with a deterministic clock. Persistence and
 // transport are tested separately against real SQLite/workerd in cloudflare.test.
 const game=Object.create(Goku.prototype),records=new Map();
 game.get=(kind,id)=>structuredClone(records.get(kind+':'+id)||null);
 game.put=(kind,id,value)=>records.set(kind+':'+id,structuredClone(value));
 game.all=kind=>[...records].filter(([k])=>k.startsWith(kind+':')).map(([,v])=>structuredClone(v));
 game.ctx={getWebSockets:()=>[]};game.changed=new Set();
 for(const [id,role] of [['admin','admin'],['p1','player'],['p2','player']])game.put('session',id,{id,role,expires:Date.now()+86400000});
 const rpc=(session,action,payload={})=>game.dispatch(action,payload,{session});
 const room=rpc('admin','create');
 for(const id of ['p1','p2'])rpc(id,'join',{code:room.code,nickname:id});
 const command=c=>rpc('admin','command',{room_id:room.id,revision:game.get('room',room.id).revision,command:c});
 // A room persisted before the feature has no manche field.
 const legacy=game.get('room',room.id);
 assert.equal(legacy.priceOrder.length,13);
 delete legacy.manche;delete legacy.priceOrder;delete legacy.quiz;game.put('room',room.id,legacy);
 assert.equal(rpc('p1','state',{room_id:room.id}).room.manche,'cards');assert.equal(rpc('p1','state',{room_id:room.id}).room.quiz,'pokemon');
 command('start');
 for(let round=1;round<=12;round++){
  let r=game.get('room',room.id);assert.equal(r.round,round);assert.equal(r.phase,'question');
  const before=rpc('p1','state',{room_id:room.id});
  if(round===1)assert.ok(rpc('admin','card',{room_id:room.id}).asset);
  assert.equal(before.solution,null);assert.equal(before.room.clueOrder,undefined);assert.equal(before.room.order,undefined);
  if(round===7){r.clueOrder[0]=quiz.clues.findIndex(q=>q.name==='Codaurlante');r.clueOrder=[...new Set(r.clueOrder)];for(let i=0;r.clueOrder.length<6;i++)if(!r.clueOrder.includes(i))r.clueOrder.push(i);game.put('room',room.id,r);assert.equal(r.manche,'clues');assert.equal(new Set(r.clueOrder).size,6);assert.deepEqual(before.clues,[]);assert.equal(r.starts_at-Date.now(),5000);}
  t.mock.timers.tick(round===7?5000:2000);
  const question=round<=6?quiz.cards[r.order[round-1]]:quiz.clues[r.clueOrder[round-7]];
  const correct=question.name;
  if(round>6){
   assert.deepEqual(rpc('p1','state',{room_id:room.id}).clues,question.clues.slice(0,1));
   assert.throws(()=>rpc('admin','card',{room_id:room.id}),/conduttore/);
  }
  if(round>6){
   command('pause');t.mock.timers.tick(45000);
   assert.equal(rpc('p1','state',{room_id:room.id}).remaining_ms,30000);
   command('resume');
  }
  for(const id of ['p1','p2']){
   const result=rpc(id,'answer',{room_id:room.id,round,request_id:crypto.randomUUID(),answer:correct==='Codaurlante'?(id==='p1'?'Codaurlant':'Scream Tail'):correct==='Poliwhirl'?'Poliwhrl':correct});
   assert.equal(result.result,'correct');assert.equal(result.points,300);
   if(id==='p1'){
    assert.equal(rpc('admin','state',{room_id:room.id}).room.phase,'question');
    assert.equal(rpc('admin','state',{room_id:room.id}).solution,null);
    if(round>6)assert.equal(rpc('p1','state',{room_id:room.id}).solution,correct);
   }
  }
  r=game.get('room',room.id);
  if(round===6||round===12){
   assert.equal(r.round,round+1);assert.equal(r.manche,round===6?'clues':'price');
   assert.deepEqual(Object.values(r.players).map(p=>p.score),[round*300,round*300]);continue;
  }
  assert.equal(r.phase,'reveal');
  const snapshot=rpc('p1','state',{room_id:room.id});assert.equal(snapshot.solution,correct);assert.equal(snapshot.me.score,round*300);assert.deepEqual(snapshot.players.map(p=>p.rank),[1,1]);
  assert.throws(()=>rpc('p1','answer',{room_id:room.id,round,request_id:crypto.randomUUID(),answer:correct}),/chiuse/);
  command('next');
 }
 const initial=game.get('room',room.id);
 assert.equal(initial.starts_at-Date.now(),5000);
 const frozen=structuredClone(initial.priceOrder);
 assert.equal(new Set(frozen.map(c=>c.id)).size,13);
 assert.equal(rpc('admin','dashboard').rooms[0].priceOrder,undefined);
 const other=rpc('admin','create');
 assert.throws(()=>rpc('p1','state',{room_id:other.id}),/non accessibile/);
 assert.throws(()=>rpc('p1','command',{room_id:room.id,revision:initial.revision,command:'pause'}),/Privilegi/);
 assert.throws(()=>command('skip_to_price'),/non disponibile/);
 const answer=(id,round,choice,request_id=crypto.randomUUID())=>rpc(id,'answer',{room_id:room.id,round,answer:choice,request_id});
 assert.throws(()=>answer('p1',13,'higher'),/chiuse/);
 t.mock.timers.tick(5000);

 let p1Score=3600,p2Score=3600,p2Streak=0;
 for(let i=0;i<12;i++){
  const round=13+i;
  const current=game.get('room',room.id);
  assert.deepEqual(current.priceOrder,frozen);
  const [reference,candidate]=frozen.slice(i,i+2);
  const correct=candidate.cents>reference.cents?'higher':'lower';
  const wrong=correct==='higher'?'lower':'higher';
  assert.equal(current.deadline-current.starts_at,15000);
  for(const id of ['p1','admin']){
   const active=rpc(id,'state',{room_id:room.id});
   assert.equal(active.duration_ms,15000);assert.equal(active.remaining_ms,15000);
   assert.equal(active.price.round,i+1);assert.equal(active.price.total,12);
   assert.equal(active.price.reference.cents,reference.cents);
   assert.deepEqual(active.price.candidate,{id:candidate.id,name:candidate.name,set:candidate.set,number:candidate.number,image:candidate.image});
   assert.equal(active.price.direction,null);
   assert.equal(active.price.correct,null);assert.equal(active.room.priceOrder,undefined);
  }
  assert.throws(()=>answer('p1',round,'Pikachu'),/HIGHER o LOWER/);
  const request=crypto.randomUUID();
  assert.deepEqual(answer('p1',round,correct,request),{done:true,choice:correct});
  assert.deepEqual(answer('p1',round,wrong,request),{done:true,choice:correct});
  assert.throws(()=>answer('p1',round,wrong),/completato/);
  assert.equal(rpc('p1','state',{room_id:room.id}).me.score,p1Score);
  assert.equal(rpc('p1','state',{room_id:room.id}).me.result,undefined);
  if(i===0){
   t.mock.timers.tick(3000);command('pause');
   t.mock.timers.tick(20000);assert.equal(game.settle(game.get('room',room.id)),false);
   const paused=rpc('p1','state',{room_id:room.id});
   assert.equal(paused.me.choice,correct);assert.equal(paused.remaining_ms,12000);
   assert.equal(paused.price.candidate.cents,undefined);
   assert.throws(()=>answer('p2',round,correct),/chiuse/);
   command('resume');assert.equal(rpc('p1','state',{room_id:room.id}).remaining_ms,12000);
  }
  if(i!==6)answer('p2',round,i===3?wrong:correct);
  t.mock.timers.tick(i===0?12000:15000);
  assert.throws(()=>answer('p2',round,correct),/chiuse|completato/);
  assert.equal(game.settle(game.get('room',room.id)),i===6);
  assert.equal(game.settle(game.get('room',room.id)),false);
  const revealed=rpc('p1','state',{room_id:room.id});
  const peer=rpc('p2','state',{room_id:room.id});
  const bonus=(i+1)%3===0?20:0;
  p1Score+=100+bonus;
  p2Streak=i===3||i===6?0:p2Streak+1;
  p2Score+=i===3?-50:i===6?0:100+(p2Streak%3===0?20:0);
  assert.equal(revealed.price.direction,correct);
  assert.equal(revealed.price.correct,i===3||i===6?1:2);
  assert.equal(revealed.price.candidate.cents,candidate.cents);
  assert.equal(revealed.me.streak,i+1);assert.equal(revealed.me.bonus,bonus);
  assert.equal(revealed.me.points,100+bonus);assert.equal(revealed.me.score,p1Score);
  assert.equal(peer.me.streak,p2Streak);assert.equal(peer.me.score,p2Score);
  assert.deepEqual(answer('p1',round,correct,request),{done:true,choice:correct});
  const revision=revealed.room.revision;
  command('next');
  assert.throws(()=>rpc('admin','command',{room_id:room.id,revision,command:'next'}),/Stato cambiato/);
 }
 const final=rpc('p1','state',{room_id:room.id});
 assert.equal(final.room.phase,'finished');assert.equal(final.room.round,24);
 assert.deepEqual(final.players.map(p=>p.score),[4880,p2Score]);
 assert.throws(()=>command('start'),/non disponibile/);
 assert.throws(()=>command('next'),/non disponibile/);

});

test('clue alarms broadcast only unlocked clues and pause removes the alarm',async t=>{
 t.mock.timers.enable({apis:['Date'],now:1700000000000});
 const game=Object.create(Goku.prototype);let alarm=null,broadcasts=0;
 const r={id:'r',phase:'question',manche:'clues',round:7,starts_at:Date.now()+5000,deadline:Date.now()+35000,remaining_ms:30000,clueOrder:[0],players:{p:{user_id:'p',score:0}},answers:{},settled:6,revision:0};
 game.all=()=>[r];game.put=()=>{};game.broadcast=()=>broadcasts++;
 game.ctx={blockConcurrencyWhile:fn=>fn(),storage:{getAlarm:async()=>alarm,setAlarm:async n=>{alarm=n;},deleteAlarm:async()=>{alarm=null;}}};
 await game.schedule();assert.equal(alarm,r.starts_at);
 t.mock.timers.tick(5000);await game.alarm();assert.equal(broadcasts,1);assert.equal(alarm,r.deadline-20000);
 t.mock.timers.tick(10000);assert.equal(game.settle(r),true);assert.equal(r.cluesShown,2);game.broadcast(r.id);await game.alarm();assert.equal(broadcasts,2);assert.equal(alarm,r.deadline-10000);
 r.phase='paused';r.remaining_ms=20000;await game.schedule();assert.equal(alarm,null);
 t.mock.timers.tick(50000);r.phase='question';r.deadline=Date.now()+20000;await game.schedule();assert.equal(alarm,r.deadline-10000);
 t.mock.timers.tick(10000);await game.alarm();assert.equal(broadcasts,3);assert.equal(alarm,r.deadline);
 t.mock.timers.tick(10000);await game.alarm();assert.equal(r.phase,'reveal');assert.equal(alarm,null);
});

test('clues reuse invalid-name handling, three attempts and server scoring',t=>{
 t.mock.timers.enable({apis:['Date'],now:1700000000000});
 const game=Object.create(Goku.prototype),records=new Map();
 game.get=(k,id)=>structuredClone(records.get(k+id));game.put=(k,id,v)=>records.set(k+id,structuredClone(v));game.changed=new Set();
 game.put('session','p',{id:'p',role:'player',expires:Date.now()+86400000});
 const r={id:'r',phase:'question',manche:'clues',round:7,starts_at:Date.now(),deadline:Date.now()+30000,clueOrder:[0],players:{p:{user_id:'p',score:1800}},answers:{},settled:6,revision:0};game.put('room','r',r);
 const answer=name=>game.dispatch('answer',{room_id:'r',round:7,request_id:crypto.randomUUID(),answer:name,points:9999},{session:'p'});
 assert.equal(answer('zzzzzzzzzzzzzzzzzz').result,'invalid');assert.equal(game.get('room','r').answers.p.attempts,0);
 for(let i=1;i<=3;i++){t.mock.timers.tick(250);const result=answer('Pikachu');assert.equal(result.attempts,i);assert.equal(result.done,i===3);}
 t.mock.timers.tick(250);assert.throws(()=>answer('Snorlax'),/chiuse/);
 r.answers={};game.put('room','r',r);t.mock.timers.tick(10000);const result=answer('Snorlax');assert.equal(result.result,'correct');assert.equal(result.points,190);
});

test('both shortcuts are host-only and settle once while keeping identity and scores', t=>{
 t.mock.timers.enable({apis:['Date'],now:1700000000000});
 for(const phase of ['question','paused','reveal']){
 const game=Object.create(Goku.prototype),records=new Map();game.changed=new Set();
 game.get=(k,id)=>structuredClone(records.get(k+id));game.put=(k,id,v)=>records.set(k+id,structuredClone(v));game.ctx={getWebSockets:()=>[]};
 for(const [id,role] of [['a','admin'],['p','player']])game.put('session',id,{id,role,expires:Date.now()+86400000});
 const room={id:'r',code:'123456',phase,manche:'cards',round:2,revision:1,starts_at:Date.now()-1000,deadline:Date.now()+29000,remaining_ms:29000,order:[0,1,2,3,4,5],players:{p:{user_id:'p',nickname:'Ash',score:300}},answers:{p:{points:250,done:true}},settled:phase==='reveal'?2:1};if(phase==='reveal')room.players.p.score=550;game.put('room','r',room);
 const cmd=(session,revision=1,command='skip_to_clues')=>game.dispatch('command',{room_id:'r',command,revision},{session});
 assert.throws(()=>cmd('p'),/Privilegi/);cmd('a');const r=game.get('room','r');
 assert.equal(r.round,7);assert.equal(r.players.p.score,550);assert.equal(r.players.p.nickname,'Ash');assert.equal(r.code,'123456');assert.equal(r.starts_at-Date.now(),5000);assert.equal(new Set(r.clueOrder).size,6);assert.deepEqual(r.answers,{});
 assert.throws(()=>cmd('a',r.revision),/non disponibile/);assert.equal(game.get('room','r').players.p.score,550);
 r.answers.p={points:200,done:true};r.phase=phase;
 if(phase==='reveal'){r.settled=7;r.players.p.score+=200;}
 game.put('room','r',r);
 assert.throws(()=>cmd('p',r.revision,'skip_to_price'),/Privilegi/);
 cmd('a',r.revision,'skip_to_price');
 const price=game.get('room','r');
 assert.equal(price.round,13);assert.equal(price.players.p.score,750);assert.equal(price.starts_at-Date.now(),5000);
 assert.throws(()=>cmd('a',price.revision,'skip_to_price'),/non disponibile/);
 assert.equal(game.get('room','r').players.p.score,750);

 }
});

test('Cultura generale reveals mixed answers immediately, pauses results, resumes and settles once', t => {
 t.mock.timers.enable({apis:['Date'],now:1700000000000});
 const {game,rpc}=setupCultureGame(['admin','p1','p2','p3']);
 const room=rpc('admin','create',{quiz:'culture'});
 for(const id of ['p1','p2'])rpc(id,'join',{code:room.code,nickname:id});
 let r=game.get('room',room.id);delete r.population_pairs;r.order=Array.from({length:10},(_,i)=>i);game.put('room',r.id,r);
 assert.equal(r.population_year,2025);assert.equal(r.order.length,10);assert.equal(r.priceOrder,undefined);
 const command=name=>rpc('admin','command',{room_id:r.id,revision:game.get('room',r.id).revision,command:name});
 command('start');r=game.get('room',room.id);
 assert.equal(r.deadline-r.starts_at,15000);assert.equal(r.starts_at-Date.now(),5000);
 let snapshot=rpc('p1','state',{room_id:r.id});
 assert.equal(snapshot.population.year,2025);assert.deepEqual(snapshot.population.countries.map(country=>country.iso2),['IT','TZ']);
 assert.equal(snapshot.population.values,undefined);assert.equal(snapshot.population.correct,undefined);
 assert.equal(snapshot.room.order,undefined);assert.equal(snapshot.room.priceOrder,undefined);
 t.mock.timers.tick(r.starts_at-Date.now());r=game.get('room',room.id);
 const pair=game.question(r),correct=pair[1],wrong=pair[0];
 const p1Request=crypto.randomUUID();
 const send=(id,answer,request_id=crypto.randomUUID())=>rpc(id,'answer',{room_id:r.id,round:r.round,answer,request_id});
 assert.deepEqual(send('p1',correct.id,p1Request),{done:true,result:'correct',choice:'TZA',points:150});
 assert.equal(game.get('room',r.id).phase,'question');
 assert.deepEqual(send('p2',wrong.id),{done:true,result:'wrong',choice:'ITA',points:0});
 r=game.get('room',r.id);
 assert.equal(r.phase,'reveal');assert.equal(r.deadline-Date.now(),10000);assert.equal(r.settled,1);
 assert.deepEqual(Object.values(r.players).map(player=>player.score),[150,0]);
 snapshot=rpc('p1','state',{room_id:r.id});
 assert.deepEqual(snapshot.population.values,[60924851,69145464]);assert.equal(snapshot.population.correct,'TZA');
 assert.deepEqual(send('p1',correct.id,p1Request),{done:true,result:'correct',choice:'TZA',points:150});
 assert.equal(game.settle(game.get('room',r.id)),false);
 assert.deepEqual(Object.values(game.get('room',r.id).players).map(player=>player.score),[150,0]);

 t.mock.timers.tick(4000);command('pause');r=game.get('room',room.id);
 assert.equal(r.phase,'paused');assert.equal(r.paused_from,'reveal');assert.equal(r.remaining_ms,6000);
 snapshot=rpc('p1','state',{room_id:r.id});assert.equal(snapshot.population.year,2025);assert.deepEqual(snapshot.population.values,[60924851,69145464]);
 t.mock.timers.tick(30000);assert.equal(game.settle(game.get('room',r.id)),false);
 assert.equal(rpc('p2','state',{room_id:r.id}).population.correct,'TZA');
 command('resume');r=game.get('room',room.id);assert.equal(r.phase,'reveal');assert.equal(r.deadline-Date.now(),6000);assert.equal(r.paused_from,undefined);
 t.mock.timers.tick(5999);assert.equal(game.settle(game.get('room',r.id)),false);
 t.mock.timers.tick(1);assert.equal(game.settle(game.get('room',r.id)),true);
 r=game.get('room',room.id);assert.equal(r.phase,'question');assert.equal(r.round,2);assert.equal(r.starts_at-Date.now(),2000);
 assert.deepEqual(Object.values(r.players).map(player=>player.score),[150,0]);
});

test('Cultura generale legacy rooms keep 2019 answers while new rooms use 2025 data', t => {
 t.mock.timers.enable({apis:['Date'],now:1700000000000});
 const {game,rpc}=setupCultureGame(['admin','p1','p2']);
 const room=rpc('admin','create',{quiz:'culture'});rpc('p1','join',{code:room.code,nickname:'Ash'});
 let r=game.get('room',room.id);delete r.population_pairs;r.order=Array.from({length:10},(_,i)=>i);delete r.population_year;r.round=1;r.phase='question';r.starts_at=Date.now();r.deadline=Date.now()+15000;r.remaining_ms=15000;r.answers={};r.settled=0;game.put('room',r.id,r);
 let snapshot=rpc('p1','state',{room_id:r.id});assert.equal(snapshot.population.year,2019);assert.deepEqual(snapshot.population.countries.map(country=>country.iso2),['IT','TZ']);assert.equal(snapshot.population.values,undefined);
 const request_id=crypto.randomUUID();
 assert.deepEqual(rpc('p1','answer',{room_id:r.id,round:1,request_id,answer:'ITA'}),{done:true,result:'correct',choice:'ITA',points:150});
 snapshot=rpc('p1','state',{room_id:r.id});assert.deepEqual(snapshot.population.values,[60297396,58005463]);assert.equal(snapshot.population.correct,'ITA');assert.equal(snapshot.me.score,150);
});

test('Cultura generale keeps unanswered players through the question timeout and advances from population after the tenth reveal', t => {
 t.mock.timers.enable({apis:['Date'],now:1700000000000});
 const {game,rpc}=setupCultureGame(['admin','p1','p2','p3']);
 const room=rpc('admin','create',{quiz:'culture'});
 for(const id of ['p1','p2','p3'])rpc(id,'join',{code:room.code,nickname:id});
 let r=game.get('room',room.id);delete r.population_pairs;r.order=Array.from({length:10},(_,i)=>i);game.put('room',r.id,r);
 const command=name=>rpc('admin','command',{room_id:r.id,revision:game.get('room',r.id).revision,command:name});
 command('start');r=game.get('room',room.id);t.mock.timers.tick(r.starts_at-Date.now());r=game.get('room',room.id);
 const [first,second]=game.question(r),correct=second.population>first.population?second:first,wrong=correct===first?second:first;
 const send=(id,answer,round=r.round)=>rpc(id,'answer',{room_id:r.id,round,answer,request_id:crypto.randomUUID()});
 send('p1',correct.id);send('p2',wrong.id);assert.equal(game.get('room',r.id).phase,'question');
 const questionDeadline=game.get('room',r.id).deadline;
 t.mock.timers.tick(questionDeadline-Date.now()-1);assert.equal(game.settle(game.get('room',r.id)),false);
 t.mock.timers.tick(1);assert.equal(game.settle(game.get('room',r.id)),true);
 r=game.get('room',r.id);assert.equal(r.phase,'reveal');assert.equal(r.deadline-Date.now(),10000);
 assert.equal(r.settled,1);assert.equal(Object.values(r.players).reduce((score,player)=>score+player.score,0),150);
 assert.throws(()=>send('p3',correct.id),/Risposte chiuse/);

 r.round=10;r.order[9]=9;r.settled=9;r.phase='question';r.starts_at=Date.now();r.deadline=Date.now()+15000;r.remaining_ms=15000;r.answers={};game.put('room',r.id,r);
 const [lastFirst,lastSecond]=game.question(r),lastCorrect=lastSecond.population>lastFirst.population?lastSecond:lastFirst;
 send('p1',lastCorrect.id,10);r=game.get('room',r.id);assert.equal(r.phase,'question');
 send('p2',lastCorrect.id,10);r=game.get('room',r.id);assert.equal(r.phase,'question');
 send('p3',lastCorrect.id,10);r=game.get('room',r.id);assert.equal(r.phase,'reveal');assert.equal(r.round,10);assert.equal(r.deadline-Date.now(),10000);
 t.mock.timers.tick(9999);assert.equal(game.settle(game.get('room',r.id)),false);
 t.mock.timers.tick(1);assert.equal(game.settle(game.get('room',r.id)),true);
 const next=rpc('p1','state',{room_id:r.id});assert.equal(next.room.phase,'question');assert.equal(next.room.manche,2);
 assert.equal(next.room.round,1);assert.equal(next.chronology.category,'Invenzioni');assert.equal(next.me.score,300);
});

test('Cronologia keeps its server draw, scores by position, waits for Avanti and times the ranking', t => {
 t.mock.timers.enable({apis:['Date'],now:1700000000000});
 const {game,rpc}=setupCultureGame(['admin','p1','p2','offline']);
 const room=rpc('admin','create',{quiz:'culture'});
 for(const id of ['p1','p2','offline'])rpc(id,'join',{code:room.code,nickname:id});
 game.ctx.getWebSockets=()=>['p1','p2'].map(user=>({readyState:1,deserializeAttachment:()=>({user})}));
 const get=()=>game.get('room',room.id);
 const state=id=>rpc(id,'state',{room_id:room.id});
 const command=command=>rpc('admin','command',{room_id:room.id,revision:get().revision,command});
 const send=(id,answer,request_id=crypto.randomUUID(),manche=2)=>rpc(id,'answer',{room_id:room.id,round:get().round,manche,request_id,answer});
 const r=get(), draw=r.chronologyOrder;
 const categories=['Invenzioni','Eventi Storici','Brand','Canzoni','Film'];
 assert.deepEqual(draw.map(({category})=>category),categories);
 for(const {items} of draw){
  assert.equal(items.length,4);
  assert.equal(new Set(items.map(({name})=>name)).size,4);
 }
 r.round=r.settled=10;r.phase='reveal';r.deadline=Date.now()+10000;r.players.p1.score=50;
 game.put('room',r.id,r);t.mock.timers.tick(20001);
 assert.equal(game.settle(get()),true);
 const first=state('p1');
 assert.deepEqual(first.chronology,state('admin').chronology);
 assert.deepEqual(first.chronology.items,draw[0].items.map(({id,name})=>({id,name})));
 assert.equal(first.chronology.correct,undefined);
 assert.equal(first.room.chronologyOrder,undefined);
 assert.equal(first.room.polling,undefined);
 assert.equal(first.chronology.participants,2);
 assert.equal(first.players[0].round_points,undefined);
 assert.equal(first.chronology.points_per_match,50);
 assert.equal(first.chronology.card_interval_ms,2000);
 assert.equal(first.room.starts_at-Date.now(),12000);assert.equal(first.chronology.opening_ms,3000);
 assert.equal(first.room.deadline-first.room.starts_at,30000);
 assert.equal(game.settle({...get(),players:{}}),false);
 assert.throws(()=>send('p1',[0,1,2,3]),/Risposte chiuse/);
 t.mock.timers.tick(4000);command('pause');
 assert.equal(state('p1').remaining_ms,38000);
 t.mock.timers.tick(15000);command('resume');
 assert.equal(get().starts_at-Date.now(),8000);
 t.mock.timers.tick(8000);
 assert.throws(()=>send('p1',[0,1,1,3]),/Ordina tutti/);
 assert.throws(()=>send('p1',[0,1,2,4]),/Ordina tutti/);
 assert.throws(()=>send('p1',[0,1,2,3],crypto.randomUUID(),1),/non più attuale/);

 const order=index=>[...draw[index].items].sort((a,b)=>a.year-b.year).map(({id})=>id);
 const [a,b,c,d]=order(0), partial=[a,c,b,d];
 t.mock.timers.tick(3000);command('pause');
 assert.equal(state('p1').remaining_ms,27000);
 t.mock.timers.tick(31000);
 assert.throws(()=>send('p1',partial),/Risposte chiuse/);
 command('resume');
 assert.equal(get().deadline-Date.now(),27000);
 const request=crypto.randomUUID();
 assert.deepEqual(send('p1',partial,request),{done:true,choice:partial});
 assert.equal(state('p1').me.points,0);
 assert.equal(state('p1').room.phase,'question');
 assert.throws(()=>send('p1',partial),/già completato/);
 send('p2',order(0));
 const revealed=state('p1');
 assert.equal(revealed.room.phase,'reveal');
 assert.deepEqual(revealed.chronology.items,draw[0].items);
 assert.deepEqual(revealed.chronology.correct,order(0));
 assert.equal(revealed.me.points,100);
 assert.equal(revealed.me.score,150);
 assert.equal(revealed.chronology.view,'solution');assert.equal(revealed.chronology.ranking_ms,10000);
 assert.equal(get().deadline,null);
 assert.deepEqual(revealed.players.map(p=>[p.user_id,p.round_points]),[['p2',200],['p1',100],['offline',0]]);
 assert.equal(state('p2').me.points,200);
 assert.deepEqual(send('p1',partial,request),{done:true,choice:partial});
 assert.equal(state('p1').me.score,150);
 assert.equal(state('offline').me.points,0);
 assert.throws(()=>command('next'),/non disponibile/);

 // The solution has no timer: it stays until the host presses "Avanti".
 t.mock.timers.tick(120000);
 assert.equal(game.settle(get()),false);assert.equal(get().phase,'reveal');
 assert.throws(()=>command('pause'),/non disponibile/);
 const advance=(session='admin',round=get().round,manche=2)=>rpc(session,'command',{room_id:room.id,command:'advance',round,manche});
 assert.throws(()=>advance('p1'),/Privilegi/);
 assert.throws(()=>advance('admin',1,1),/non disponibile/);
 const revision=get().revision;
 assert.deepEqual(advance(),{ok:true});
 assert.equal(get().revision,revision+1);assert.equal(get().chronology_view,'ranking');
 assert.equal(get().deadline-Date.now(),10000);assert.equal(state('p1').chronology.view,'ranking');
 assert.deepEqual(advance(),{ok:true,unchanged:true});assert.equal(get().revision,revision+1);
 assert.equal(get().deadline-Date.now(),10000);
 t.mock.timers.tick(4000);command('pause');
 assert.equal(state('p1').remaining_ms,6000);
 assert.deepEqual(advance(),{ok:true,unchanged:true});
 t.mock.timers.tick(16000);
 assert.equal(game.settle(get()),false);
 assert.deepEqual(state('p1').chronology.correct,order(0));
 command('resume');
 t.mock.timers.tick(5999);assert.equal(game.settle(get()),false);
 t.mock.timers.tick(1);assert.equal(game.settle(get()),true);
 assert.equal(get().round,2);assert.equal(get().chronology_view,undefined);
 assert.deepEqual(advance('admin',1),{ok:true,unchanged:true});assert.equal(get().round,2);assert.equal(get().phase,'question');
 assert.throws(()=>advance(),/non disponibile/);

 for(let round=2;round<=5;round++){
  const q=state('p2');
  assert.equal(q.room.round,round);
  assert.equal(q.chronology.category,categories[round-1]);
  assert.equal(q.remaining_ms,30000);
  t.mock.timers.tick(q.room.starts_at-Date.now());
  send('p2',order(round-1));
  if(round===2){
   assert.equal(get().phase,'question');
   t.mock.timers.tick(30000);
   assert.throws(()=>send('p1',order(round-1)),/Risposte chiuse/);
   assert.equal(game.settle(get()),true);
   assert.equal(state('p1').me.points,0);
  }else send('p1',order(round-1));
  assert.equal(get().phase,'reveal');
  assert.equal(get().deadline,null);
  t.mock.timers.tick(60000);
  assert.equal(game.settle(get()),false);
  rpc('admin','command',{room_id:room.id,command:'advance',round,manche:2});
  assert.equal(get().deadline-Date.now(),10000);
  t.mock.timers.tick(10000);
  assert.equal(game.settle(get()),true);
 }
 const next=state('p2');
 assert.equal(next.room.phase,'question');
 assert.equal(next.room.manche,3);
 assert.equal(next.room.round,1);
 assert.equal(next.room.manche_total,4);
 assert.equal(next.me.score,1000);
 assert.equal(state('p1').me.score,750);
 assert.equal(game.settle(get()),false);
 assert.deepEqual(get().chronologyOrder,draw);
});

test('skip_round moves only one round, crosses manche boundaries and settles submitted answers once', t => {
 t.mock.timers.enable({apis:['Date'],now:1700000000000});
 const {game,rpc}=setupCultureGame();
 for(const [quiz,stages] of [['pokemon',{'cards':6,'clues':12,'price':24}],['culture',{1:10,2:5}]]){
  const {id,code}=rpc('admin','create',{quiz});
  rpc('p1','join',{code,nickname:'Ash'});
  rpc('p2','join',{code,nickname:'Misty'});
  const get=()=>game.get('room',id);
  const command=(command,session='admin',revision=get().revision)=>rpc(session,'command',{room_id:id,revision,command});
  command('start');
  assert.throws(()=>command('skip_round','p1'),/Privilegi/);
  for(const [manche,end] of Object.entries(stages)){
   while(String(get().manche)===manche&&get().phase!=='finished'){
    const before=get();
    if(manche==='2'&&before.round===1){
     t.mock.timers.tick(before.starts_at-Date.now());
     const [a,b,c,d]=[...game.question(before).items].sort((a,b)=>a.year-b.year).map(item=>item.id);
     const result=rpc('p1','answer',{room_id:id,manche:2,round:1,request_id:crypto.randomUUID(),answer:[a,c,b,d]});
     assert.equal(result.done,true);
     command('pause');
    }
    command('skip_round');
    assert.throws(()=>command('skip_round','admin',before.revision),/Stato cambiato/);
    const after=get();
    if(before.round<end)assert.equal(after.round,before.round+1);
    else assert.ok(after.manche!==before.manche||after.phase==='finished');
   }
  }
  if(quiz==='culture'){
   assert.equal(get().manche,3);
   assert.throws(()=>command('skip_round'),/Attendi la fine/);
   command('end');
  }
  assert.equal(get().phase,'finished');
  assert.equal(get().players.p1.score,quiz==='culture'?100:0);
 }
});

test('Cultura generale retains the host manual next control', t => {
 t.mock.timers.enable({apis:['Date'],now:1700000000000});
 const {game,rpc}=setupCultureGame();
 const room=rpc('admin','create',{quiz:'culture'});rpc('p1','join',{code:room.code,nickname:'Ash'});
 let r=game.get('room',room.id);delete r.population_pairs;r.order=Array.from({length:10},(_,i)=>i);game.put('room',r.id,r);
 const command=name=>rpc('admin','command',{room_id:r.id,revision:game.get('room',r.id).revision,command:name});
 command('start');r=game.get('room',room.id);t.mock.timers.tick(r.starts_at-Date.now());r=game.get('room',room.id);
 const [first,second]=game.question(r),answer=second.population>first.population?second.id:first.id;
 rpc('p1','answer',{room_id:r.id,round:r.round,request_id:crypto.randomUUID(),answer});
 assert.equal(game.get('room',r.id).phase,'reveal');
 command('next');r=game.get('room',room.id);assert.equal(r.round,2);assert.equal(r.phase,'question');assert.equal(r.starts_at-Date.now(),2000);assert.equal(r.settled,1);
});

test('Cultura generale validates quiz licenses before quota use', t => {
 t.mock.timers.enable({apis:['Date'],now:1700000000000});
 const {game,rpc}=setupCultureGame(['admin']);
 const license=game.dispatch('license_create',{hours:1,max_rooms:1,quizzes:['culture']},{session:'admin',inviteHash:'invite'});
 game.put('session','host',{id:'host',role:'host',license:license.id,expires:Date.now()+86400000});
 assert.throws(()=>rpc('host','create',{quiz:'pokemon'}),/Quiz non incluso/);assert.equal(game.get('license',license.id).used_rooms,0);
 const room=rpc('host','create',{quiz:'culture'});assert.equal(game.get('license',license.id).used_rooms,1);assert.equal(game.get('room',room.id).population_year,2025);assert.equal(game.get('room',room.id).priceOrder,undefined);
 assert.deepEqual(rpc('admin','dashboard').licenses.find(x=>x.id===license.id).quizzes,['culture']);
});

test('Quanto ci vai vicino? catalog, inclusive bounds and multiplicative ties', () => {
 const catalog=Array.from({length:12},(_,i)=>vaultQuestion(`Q${String(i+1).padStart(2,'0')}`));
 assert.deepEqual(drawVault('demo'),catalog.slice(0,6).map(q=>q.id));
 for(let i=0;i<12;i++){
  const mixed=drawVault('mixed').map(vaultQuestion);
  assert.equal(new Set(mixed).size,6);
  assert.equal(mixed.filter(q=>q.difficulty==='facile').length,2);
  assert.equal(mixed.filter(q=>q.difficulty==='media').length,4);
 }
 for(const q of catalog){
  assert.deepEqual([publicVault(q,1).min,publicVault(q,1).max],[1,99_999_999]);
  assert.equal(publicVault(q,1).solution,undefined);
 }
 assert.equal(catalog.at(-1).effect,'terracotta-army');
 assert.equal(catalog.at(-1).solution,8000);
 assert.match(catalog.at(-1).explanation,/stima, non un conteggio esatto/);
 for(const value of [0,-1,100_000_000,'10',1.5,null])assert.equal(validGuess(value),false);
 for(const value of [1,99_999_999])assert.equal(validGuess(value),true);
 assert.deepEqual([1000,900,500,2000,10000,100].map(n=>vaultPoints(n,1000)),[200,190,140,140,0,0]);
 const values=[1000,999,500,2000,10000];
 const answers=Object.fromEntries(values.map(choice=>[choice,{choice}]));
 const players=Object.fromEntries(values.map(choice=>[choice,{nickname:String(choice),score:0}]));
 const room={answers,players};
 settleVault(room,{solution:1000});
 assert.deepEqual(values.map(value=>[answers[value].rank,players[value].score]),[[1,200],[2,200],[3,140],[3,140],[5,0]]);
 assert.equal(room.vaultResult.podium.at(-1).players.length,2);
});

test('Quanto ci vai vicino? locks answers and reveals as soon as everyone answers or time expires', t => {
 t.mock.timers.enable({apis:['Date'],now:1700000000000});
 const {game,rpc}=setupCultureGame();
 assert.throws(()=>rpc('admin','create',{quiz:'culture',vault_mode:'invalid'}),/Modalità/);
 const {id,code}=rpc('admin','create',{quiz:'culture'});
 for(const name of ['p1','p2'])rpc(name,'join',{code,nickname:name});
 const get=()=>game.get('room',id);
 const snap=name=>rpc(name,'state',{room_id:id});
 const command=command=>rpc('admin','command',{room_id:id,revision:get().revision,command});
 const send=(session,answer,request_id=crypto.randomUUID(),round=1,manche=3)=>
  rpc(session,'answer',{room_id:id,round,manche,answer,request_id});
 const r=get();
 Object.assign(r,{manche:2,round:5,settled:5,phase:'reveal',deadline:Date.now()});
 r.players.p1.score=90;
 const old=structuredClone(r);
 delete old.vaultOrder;delete old.meadowOrder;
 assert.equal(game.publicRoom(old).manche_total,2);
 game.advanceRound(old);
 assert.equal(old.phase,'finished');
 assert.equal(game.settle(r),true);
 assert.equal(get().manche,3);
 assert.equal(get().starts_at-Date.now(),4000);
 assert.equal(snap('admin').duration_ms,20000);
 assert.equal(snap('admin').vault.preview_ms,1000);
 assert.equal(snap('admin').vault.max_points,200);
 assert.throws(()=>send('p1',54),/chiuse/);
 command('pause');t.mock.timers.tick(3000);command('resume');
 assert.equal(get().starts_at-Date.now(),4000);
 t.mock.timers.tick(4000);
 assert.throws(()=>send('p1',54,crypto.randomUUID(),1,2),/non più attuale/);
 assert.throws(()=>send('p1','54'),/intero/);
 assert.throws(()=>send('p1',54,'------------------------------------'),/non valido/);
 const revision=get().revision, request=crypto.randomUUID();
 assert.deepEqual(send('p1',54,request),{done:true,choice:54});
 assert.deepEqual(send('p1',54,request),{done:true,choice:54});
 assert.throws(()=>send('p1',55,request),/diversa/);
 assert.throws(()=>send('p1',54),/bloccata/);
 assert.equal(get().revision,revision+1);
 assert.deepEqual(snap('admin').players,[]);
 assert.equal(snap('p2').me.choice,null);
 assert.equal(snap('p1').me.choice,54);
 for(const name of ['admin','p1','p2']){
  const state=snap(name);
  assert.equal(state.vault.solution,undefined);
  assert.equal(state.vault_result,undefined);
  assert.equal(state.me?.points,undefined);
  assert.equal(state.room.vaultOrder,undefined);
 }
 assert.equal(rpc('admin','dashboard').rooms[0].vaultOrder,undefined);
 assert.throws(()=>command('skip_round'),/Attendi la fine/);
 assert.throws(()=>command('next'),/Attendi la fine/);
 t.mock.timers.tick(19_999);
 assert.equal(snap('p1').room.phase,'question');
 assert.equal(snap('p1').me.score,90);
 send('p2',27);
 assert.equal(game.settle(get()),false);
 assert.equal(snap('p1').room.phase,'reveal');
 assert.equal(snap('p1').vault_result.early,true);
 assert.equal(snap('p1').remaining_ms,5000);
 assert.equal(snap('p1').me.score,290);
 assert.equal(snap('p2').me.score,140);
 assert.equal(snap('p2').vault_result.distribution,undefined);
 assert.deepEqual(snap('admin').vault_result.distribution,[[27,1],[54,1]]);
 assert.deepEqual(send('p1',54,request),{done:true,choice:54});
 assert.throws(()=>command('next'),/Attendi la fine/);
 t.mock.timers.tick(2500);command('pause');t.mock.timers.tick(20000);
 assert.equal(snap('admin').remaining_ms,2500);
 command('resume');t.mock.timers.tick(2000);command('next');
 assert.equal(get().round,2);
 assert.throws(()=>send('p1',54,request),/non più attuale/);
 assert.equal(get().starts_at-Date.now(),800);
 for(let round=2;round<=6;round++){
  t.mock.timers.tick(get().deadline-Date.now());
  assert.throws(()=>send('p2',1,crypto.randomUUID(),round),/chiuse/);
  assert.equal(game.settle(get()),true);
  assert.equal(snap('p1').vault_result.early,false);
  assert.equal(snap('p1').remaining_ms,8000);
  assert.equal(snap('p1').me.points,0);
  assert.equal(snap('p1').me.rank,null);
  assert.deepEqual(snap('admin').vault_result.podium,[]);
  t.mock.timers.tick(8000);
  assert.equal(game.settle(get()),true);
 }
 assert.equal(get().manche,4);assert.equal(get().round,1);assert.equal(get().phase,'question');
 assert.deepEqual(snap('admin').players.map(p=>p.score),[290,140]);

 Object.assign(r,{phase:'question',starts_at:Date.now(),deadline:Date.now()+20000});
 r.answers={};
 delete r.vaultResult;
 game.put('room',id,r);
 send('p1',54);
 command('end');
 assert.equal(snap('p1').vault_result,undefined);
 assert.equal(snap('p1').me.choice,null);
 assert.equal(snap('p1').me.score,90);
 assert.equal(game.settle(get()),false);
});

test('Prato fiorito draws 5 distinct categories per game, each round 6 unique options with exactly one bomb', () => {
 const seen=new Set();
 let rounds=0;
 for(let game=0;game<1000;game++){
  const draw=drawMeadow();
  assert.equal(draw.length,5);
  assert.equal(new Set(draw.map(({category})=>category)).size,5);
  for(const {category,items} of draw){
   rounds++;seen.add(category);
   assert.equal(items.length,6);
   assert.deepEqual(items.map(({id})=>id),[0,1,2,3,4,5]);
   assert.equal(new Set(items.map(({name})=>name)).size,6);
   assert.equal(items.filter(({bomb})=>bomb===true).length,1);
   assert.equal(items.filter(({bomb})=>bomb===false).length,5);
  }
 }
 assert.ok(rounds>=1000);
 assert.equal(seen.size,MEADOW_CATEGORIES);
 const items=[0,1,2,3,4,5].map(id=>({id,name:'x'+id,bomb:id===5}));
 assert.equal(meadowPoints(items,[0,1,2]),120);
 assert.equal(meadowPoints(items,[0,1,2,3,4]),200);
 assert.equal(meadowPoints(items,[0,1,2,5,3]),0);
 assert.equal(meadowPoints(items,[]),0);
});

test('Prato fiorito follows Quanto ci vai vicino?, hides the bomb until reveal and scores on the server', t => {
 t.mock.timers.enable({apis:['Date'],now:1700000000000});
 const {game,rpc}=setupCultureGame(['admin','p1','p2','p3']);
 const {id,code}=rpc('admin','create',{quiz:'culture'});
 for(const name of ['p1','p2','p3'])rpc(name,'join',{code,nickname:name});
 game.ctx.getWebSockets=()=>['p1','p2','p3'].map(user=>({readyState:1,deserializeAttachment:()=>({user})}));
 const get=()=>game.get('room',id);
 const snap=name=>rpc(name,'state',{room_id:id});
 const command=command=>rpc('admin','command',{room_id:id,revision:get().revision,command});
 const send=(session,answer,request_id=crypto.randomUUID(),manche=4)=>rpc(session,'answer',{room_id:id,round:get().round,manche,answer,request_id});
 const draw=get().meadowOrder;
 assert.equal(draw.length,5);
 const r=get();Object.assign(r,{manche:3,round:6,settled:6,phase:'reveal',deadline:Date.now()});game.put('room',id,r);
 assert.equal(game.settle(get()),true);
 assert.equal(get().manche,4);assert.equal(get().round,1);
 for(let round=1;round<=5;round++){
  const {items}=draw[round-1],safe=items.filter(i=>!i.bomb).map(i=>i.id),bomb=items.find(i=>i.bomb).id;
  for(const who of ['admin','p1']){
   const before=snap(who);
   assert.equal(before.room.manche_total,4);
   assert.equal(before.meadow.category,draw[round-1].category);
   assert.deepEqual(before.meadow.options,items.map(({id,name})=>({id,name})));
   assert.doesNotMatch(JSON.stringify(before),/bomb|meadowOrder/);
  }
  assert.throws(()=>send('p1',[0]),/chiuse/);
  t.mock.timers.tick(get().starts_at-Date.now());
  assert.throws(()=>send('p1',[0,0]),/Selezione non valida/);
  assert.throws(()=>send('p1',[0,1,2,3,4,5,6]),/Selezione non valida/);
  assert.throws(()=>send('p1',['0']),/Selezione non valida/);
  assert.throws(()=>send('p1',[0],crypto.randomUUID(),3),/non più attuale/);
  const plays={1:[safe.slice(0,3),safe,[...safe.slice(0,4),bomb]],2:[[],safe.slice(0,1),[bomb]]}[round]??[safe.slice(0,2),safe.slice(0,2),safe.slice(0,2)];
  const expected={1:[120,200,0],2:[0,40,0]}[round]??[80,80,80];
  const request=crypto.randomUUID();
  assert.deepEqual(send('p1',plays[0],request),{done:true,choice:plays[0]});
  assert.deepEqual(send('p1',plays[0],request),{done:true,choice:plays[0]});
  assert.throws(()=>send('p1',plays[0]),/già completato/);
  const waiting=snap('p1');
  assert.equal(waiting.me.points,0);assert.deepEqual(waiting.me.choice,plays[0]);
  assert.doesNotMatch(JSON.stringify(waiting),/bomb/);
  send('p2',plays[1]);send('p3',plays[2]);
  const revealed=snap('p1');
  assert.equal(revealed.room.phase,'reveal');
  assert.equal(revealed.meadow.bomb,bomb);assert.equal(revealed.meadow.reveal_ms,15000);
  assert.deepEqual(['p1','p2','p3'].map(name=>snap(name).me.points),expected);
  assert.throws(()=>command('next'),/non disponibile/);
  t.mock.timers.tick(15000);assert.equal(game.settle(get()),true);
 }
 assert.equal(get().phase,'finished');
 assert.deepEqual(['p1','p2','p3'].map(name=>snap(name).me.score),[120+0+240,200+40+240,0+0+240]);
});

test('Cronologia: Shift + N during the solution skips once, and legacy timed reveals still advance', t => {
 t.mock.timers.enable({apis:['Date'],now:1700000000000});
 const {game,rpc}=setupCultureGame(['admin','p1']);
 const room=rpc('admin','create',{quiz:'culture'});rpc('p1','join',{code:room.code,nickname:'Ash'});
 const get=()=>game.get('room',room.id);
 const command=(command,extra={})=>rpc('admin','command',{room_id:room.id,revision:get().revision,command,...extra});
 command('start');
 let r=get();r.manche=1;r.round=10;r.settled=10;r.phase='reveal';r.deadline=Date.now();game.put('room',r.id,r);
 t.mock.timers.tick(1);game.settle(get());
 assert.equal(get().manche,2);
 t.mock.timers.tick(get().starts_at-Date.now());
 const order=[...game.question(get()).items].sort((a,b)=>a.year-b.year).map(item=>item.id);
 rpc('p1','answer',{room_id:room.id,manche:2,round:1,request_id:crypto.randomUUID(),answer:order});
 assert.equal(get().chronology_view,'solution');
 const revision=get().revision;
 command('skip_round');
 assert.equal(get().round,2);assert.equal(get().phase,'question');
 assert.equal(get().players.p1.score,200);assert.equal(get().players.p1.manche_scores[2],200);
 assert.throws(()=>rpc('admin','command',{room_id:room.id,revision,command:'skip_round'}),/Stato cambiato/);
 assert.deepEqual(command('advance',{round:1,manche:2}),{ok:true,unchanged:true});
 assert.equal(get().round,2);
 // A room revealed by the previous release (timed reveal, no view) keeps advancing on its deadline.
 r=get();r.phase='reveal';r.deadline=Date.now()+15000;delete r.chronology_view;r.settled=2;game.put('room',r.id,r);
 assert.equal(rpc('p1','state',{room_id:room.id}).chronology.view,'ranking');
 t.mock.timers.tick(15000);assert.equal(game.settle(get()),true);assert.equal(get().round,3);
});

test('Cultura generale records points per manche for the final podium', () => {
 const r={quiz:'culture',manche:3,players:{a:{user_id:'a',nickname:'Ash',score:150,manche_scores:{1:100,2:50}},b:{user_id:'b',nickname:'Misty',score:0}},
  answers:{a:{done:true,choice:54},b:{done:true,choice:5400}}};
 settleVault(r,vaultQuestion('Q01'),false,addPoints);
 assert.deepEqual(r.players.a.manche_scores,{1:100,2:50,3:200});assert.equal(r.players.a.score,350);
 assert.deepEqual(r.players.b.manche_scores,{3:0});assert.equal(r.players.b.score,0);
 const pokemon={quiz:'pokemon',manche:'cards',players:{a:{score:0}}};
 addPoints(pokemon,'a',30);assert.equal(pokemon.players.a.score,30);assert.equal(pokemon.players.a.manche_scores,undefined);
});

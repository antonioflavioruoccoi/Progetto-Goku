import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import fs from 'node:fs/promises';
const { outputFiles } = await build({entryPoints:['worker/index.js'],bundle:true,write:false,format:'esm'});
const { Goku } = await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const quiz = JSON.parse(await fs.readFile('worker/generated/quiz.json','utf8'));

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
 delete legacy.manche;delete legacy.priceOrder;game.put('room',room.id,legacy);
 assert.equal(rpc('p1','state',{room_id:room.id}).room.manche,'cards');
 command('start');
 for(let round=1;round<=12;round++){
  let r=game.get('room',room.id);assert.equal(r.round,round);assert.equal(r.phase,'question');
  const before=rpc('p1','state',{room_id:room.id});
  assert.equal(before.solution,null);assert.equal(before.room.clueOrder,undefined);assert.equal(before.room.order,undefined);
  if(round===7){r.clueOrder[0]=quiz.clues.findIndex(q=>q.name==='Codaurlante');r.clueOrder=[...new Set(r.clueOrder)];for(let i=0;r.clueOrder.length<6;i++)if(!r.clueOrder.includes(i))r.clueOrder.push(i);game.put('room',room.id,r);assert.equal(r.manche,'clues');assert.equal(new Set(r.clueOrder).size,6);assert.deepEqual(before.clues,[]);assert.equal(r.starts_at-Date.now(),5000);}
  t.mock.timers.tick(round===7?5000:2000);
  const question=round<=6?quiz.cards[r.order[round-1]]:quiz.clues[r.clueOrder[round-7]];
  const correct=question.name;
  if(round>6){
   assert.deepEqual(rpc('p1','state',{room_id:room.id}).clues,question.clues.slice(0,1));
   assert.throws(()=>rpc('admin','card',{room_id:room.id}),/conduttore/);
  }
  for(const id of ['p1','p2']){
   const result=rpc(id,'answer',{room_id:room.id,round,request_id:crypto.randomUUID(),answer:correct==='Codaurlante'?(id==='p1'?'Codaurlant':'Scream Tail'):correct==='Poliwhirl'?'Poliwhrl':correct});
   assert.equal(result.result,'correct');assert.equal(result.points,300);
  }
  if(round>6){
   const personal=rpc('p1','state',{room_id:room.id});assert.equal(personal.solution,correct);assert.equal(personal.solution_image,question.image);assert.equal(personal.me.points,300);
   assert.equal(rpc('admin','state',{room_id:room.id}).solution,null);
   t.mock.timers.tick(10000);assert.equal(rpc('p1','state',{room_id:room.id}).clues.length,2);
   command('pause');t.mock.timers.tick(45000);assert.equal(rpc('p1','state',{room_id:room.id}).clues.length,2);assert.equal(rpc('p1','state',{room_id:room.id}).remaining_ms,20000);
   command('resume');t.mock.timers.tick(10000);assert.equal(rpc('p1','state',{room_id:room.id}).clues.length,3);t.mock.timers.tick(10000);
  }else t.mock.timers.tick(30000);r=game.get('room',room.id);game.settle(r);if(round===6||round===12){
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
  assert.equal(game.settle(game.get('room',room.id)),true);
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
 t.mock.timers.tick(250);assert.throws(()=>answer('Snorlax'),/completato/);
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

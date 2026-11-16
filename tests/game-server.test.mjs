import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import fs from 'node:fs/promises';
const { outputFiles } = await build({entryPoints:['worker/index.js'],bundle:true,write:false,format:'esm'});
const { Goku } = await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const quiz = JSON.parse(await fs.readFile('worker/generated/quiz.json','utf8'));

test('server game logic: all six cards, typo correction, deadlines, ranks and final podium', t => {
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
 command('start');
 for(let round=1;round<=6;round++){
  let r=game.get('room',room.id);assert.equal(r.round,round);assert.equal(r.phase,'question');
  t.mock.timers.tick(2000);
  const correct=quiz.cards[r.order[round-1]].name;
  for(const id of ['p1','p2']){
   const result=rpc(id,'answer',{room_id:room.id,round,request_id:crypto.randomUUID(),answer:correct==='Poliwhirl'?'Poliwhrl':correct});
   assert.equal(result.result,'correct');assert.equal(result.points,300);
  }
  t.mock.timers.tick(30000);r=game.get('room',room.id);game.settle(r);assert.equal(r.phase,'reveal');
  const snapshot=rpc('p1','state',{room_id:room.id});assert.equal(snapshot.solution,correct);assert.equal(snapshot.me.score,round*300);assert.deepEqual(snapshot.players.map(p=>p.rank),[1,1]);
  assert.throws(()=>rpc('p1','answer',{room_id:room.id,round,request_id:crypto.randomUUID(),answer:correct}),/chiuse/);
  command('next');
 }
 const final=rpc('p1','state',{room_id:room.id});assert.equal(final.room.phase,'finished');assert.equal(final.room.round,6);assert.deepEqual(final.players.map(p=>p.score),[1800,1800]);assert.throws(()=>command('start'),/non disponibile/);
});

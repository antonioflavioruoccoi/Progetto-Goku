import {test} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const connectionString=process.env.TEST_DATABASE_URL;
test('PostgreSQL: security, licenses, concurrent quotas and multiplayer', {skip:!connectionString}, async t=>{
 const url=new URL(connectionString);if(!['localhost','127.0.0.1'].includes(url.hostname))throw Error('Integration tests require a local PostgreSQL server');
 const root=new pg.Client({connectionString});await root.connect();
 const dbName='goku_test_'+crypto.randomBytes(6).toString('hex');await root.query(`create database ${dbName}`);url.pathname='/'+dbName;
 const db=new pg.Pool({connectionString:url.href,max:30});
 try{
 await db.query(`do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$;
 create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false);
 create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
 grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
 await db.query(await fs.readFile('supabase/migrations/202611160001_goku.sql','utf8'));
 await db.query(await fs.readFile('supabase/seed.sql','utf8'));
 const users={};for(const [name,anonymous,verified] of [['admin',false,true],['host',false,true],['other',false,true],['unverified',false,false],['p1',true,false],['p2',true,false]]){const id=crypto.randomUUID();users[name]=id;await db.query('insert into auth.users values($1,$2,$3,$4)',[id,name+'@example.com',verified?new Date():null,anonymous]);}
 await db.query('insert into goku_private.admins values($1)',[users.admin]);
 async function as(name,sql,values=[]){const c=await db.connect();try{await c.query('begin');await c.query('set local role authenticated');await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:users[name],role:'authenticated',is_anonymous:name.startsWith('p')})]);const result=await c.query(sql,values);await c.query('commit');return result;}catch(e){await c.query('rollback');throw e;}finally{c.release(true);}}
 async function rpc(name,action,payload={}){return (await as(name,'select public.goku($1,$2) result',[action,payload])).rows[0].result;}
 const rejects=(name,action,payload,pattern)=>assert.rejects(()=>rpc(name,action,payload),pattern);
 async function license(overrides={}){return rpc('admin','license_create',{email:'host@example.com',starts_at:new Date(Date.now()-60000).toISOString(),expires_at:new Date(Date.now()+3600000).toISOString(),max_rooms:2,quizzes:['pokemon'],...overrides});}
 async function state(name,id){return rpc(name,'state',{room_id:id});}
 async function command(name,id,cmd){const s=await state(name,id);return rpc(name,'command',{room_id:id,command:cmd,revision:s.room.revision});}
 let invitation,room,room2;
 await t.test('anonymous/unverified users and non-admin cannot escalate',async()=>{
  await rejects('p1','create',{quiz:'pokemon'},/Solo Admin/);await rejects('unverified','create',{quiz:'pokemon'},/Solo Admin/);
  await rejects('host','license_create',{},/Solo Admin/);await rejects('p1','dashboard',{},/Verifica/);
  await assert.rejects(()=>as('host',"insert into goku_private.admins values(auth.uid())"),/permission denied/);
  await assert.rejects(()=>as('host',"update public.goku_rooms set host_id=auth.uid()"),/permission denied/);
  await assert.rejects(()=>as('p1',"select * from goku_private.cards"),/permission denied/);
  assert.equal((await rpc('host','dashboard')).admin,false);
 });
 await t.test('admin is unlimited; invitation binds verified email and hashes token',async()=>{
  room=await rpc('admin','create',{quiz:'pokemon'});room2=await rpc('admin','create',{quiz:'pokemon'});
  invitation=await license();assert.match(invitation.token,/^[a-f0-9]{64}$/);
  const row=(await db.query('select * from goku_private.licenses where id=$1',[invitation.id])).rows[0];assert.notEqual(row.token_hash.toString('hex'),invitation.token);assert.equal(row.token_hash.toString('hex'),crypto.createHash('sha256').update(invitation.token).digest('hex'));
  assert.ok(!JSON.stringify(await rpc('admin','dashboard')).includes(invitation.token));
  await rejects('other','redeem',{token:invitation.token},/Email diversa/);await rejects('unverified','redeem',{token:invitation.token},/Verifica/);
  assert.equal((await rpc('host','redeem',{token:invitation.token})).redeemed,true);
  await rejects('host','redeem',{token:invitation.token},/già utilizzato/);
 });
 await t.test('expired/revoked/invalid invitations are refused',async()=>{
  const expired=await license();await db.query("update goku_private.licenses set starts_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' where id=$1",[expired.id]);await rejects('host','redeem',{token:expired.token},/scaduto/);
  const revoked=await license();await rpc('admin','license_revoke',{license_id:revoked.id});await rejects('host','redeem',{token:revoked.token},/revocato/);
  await rejects('host','redeem',{token:'x'.repeat(64)},/non valido/);
 });
 let hostRooms;
 await t.test('quota consumed atomically under 12 concurrent creations',async()=>{
  const attempts=await Promise.allSettled(Array.from({length:12},()=>rpc('host','create',{quiz:'pokemon',license_id:invitation.id})));
  hostRooms=attempts.filter(x=>x.status==='fulfilled').map(x=>x.value);assert.equal(hostRooms.length,2);assert.ok(attempts.filter(x=>x.status==='rejected').every(x=>/Quota esaurita/.test(x.reason.message)));
  const used=(await db.query('select used_rooms from goku_private.licenses where id=$1',[invitation.id])).rows[0].used_rooms;assert.equal(used,2);
  await rejects('other','create',{quiz:'pokemon',license_id:invitation.id},/non autorizzata/);
  await rejects('host','create',{quiz:'other',license_id:invitation.id},/non disponibile/);
 });
 await t.test('room isolation, nickname uniqueness and reconnect',async()=>{
  await rpc('p1','join',{code:room.code,nickname:'Ash'});await rpc('p2','join',{code:room.code,nickname:'Misty'});
  await rejects('other','join',{code:room.code,nickname:'ASH'},/già utilizzato/);await rejects('other','join',{code:'000000',nickname:'A'},/inesistente/);
  const again=await rpc('p1','join',{code:room.code,nickname:'Changed'});assert.equal(again.id,room.id);assert.equal((await state('p1',room.id)).me.nickname,'Ash');
  await rejects('p1','state',{room_id:room2.id},/non accessibile/);assert.equal((await as('p1','select * from public.goku_rooms where id=$1',[room2.id])).rowCount,0);
  assert.equal((await state('admin',room.id)).players.length,2);
 });
 await t.test('server timer, three attempts, idempotency, scoring and reconnection',async()=>{
  await command('admin',room.id,'start');await rejects('p1','command',{room_id:room.id,command:'pause',revision:1},/Privilegi/);
  await db.query("update public.goku_rooms set starts_at=now()-interval '1 second',deadline=now()+interval '28 seconds' where id=$1",[room.id]);
  const g=(await db.query('select * from goku_private.games where room_id=$1',[room.id])).rows[0];const correct=(await db.query('select name from goku_private.cards where id=$1',[g.questions[0]])).rows[0].name;
  const s=await state('p1',room.id);assert.equal(s.solution,null);assert.ok(!JSON.stringify(s).includes(correct));await rejects('p1','card',{room_id:room.id},/Solo il conduttore/);
  await assert.rejects(()=>as('p1','update public.goku_participants set score=999999'),/permission denied/);
  await assert.rejects(()=>as('p1',"update public.goku_rooms set deadline=now()+interval '10 hours'"),/permission denied/);
  const answer={room_id:room.id,round:1,answer:'zzzzzzzzzzzzzz',request_id:crypto.randomUUID(),points:999};assert.equal((await rpc('p1','answer',answer)).result,'invalid');assert.equal((await state('p1',room.id)).me.attempts,0);
  const wrong={room_id:room.id,round:1,answer:'Pikachu',request_id:crypto.randomUUID()};const simultaneous=await Promise.all(Array.from({length:5},()=>rpc('p1','answer',wrong)));assert.ok(simultaneous.every(x=>x.attempts===1));assert.equal((await state('p1',room.id)).me.attempts,1);
  await rpc('p1','answer',{...wrong,request_id:crypto.randomUUID()});const last=await rpc('p1','answer',{...wrong,request_id:crypto.randomUUID()});assert.equal(last.done,true);assert.equal(last.points,0);
  await rejects('p1','answer',{...wrong,answer:correct,request_id:crypto.randomUUID()},/completato/);
  const won=await rpc('p2','answer',{...wrong,answer:correct.toLowerCase()+'x',request_id:crypto.randomUUID(),score:999999});assert.equal(won.result,'correct');assert.ok(won.points>0&&won.points<=300);
  const reconnect=await state('p2',room.id);assert.equal(reconnect.me.done,true);assert.equal(reconnect.me.result,'correct');assert.equal(reconnect.me.score,0);
  await command('admin',room.id,'pause');const paused=await state('p1',room.id);assert.equal(paused.room.phase,'paused');assert.equal((await state('p2',room.id)).remaining_ms,paused.remaining_ms);
  await rejects('p2','answer',{...wrong,request_id:crypto.randomUUID()},/pausa/);await command('admin',room.id,'resume');
  await db.query("update public.goku_rooms set deadline=now()-interval '1 second' where id=$1",[room.id]);const revealed=await state('p2',room.id);assert.equal(revealed.room.phase,'reveal');assert.equal(revealed.solution,correct);assert.equal(revealed.me.score,won.points);
  assert.equal((await state('p2',room.id)).me.score,won.points,'settle is idempotent');await rejects('p2','answer',{...wrong,request_id:crypto.randomUUID()},/chiuse/);
  for(let i=2;i<=6;i++){await command('admin',room.id,'next');await db.query("update public.goku_rooms set deadline=now()-interval '1 second' where id=$1",[room.id]);await state('p1',room.id);}
  await command('admin',room.id,'next');assert.equal((await state('p2',room.id)).room.phase,'finished');assert.equal((await state('p2',room.id)).players[0].user_id,users.p2);
 });
 await t.test('expiry allows running games, blocks lobby start and new rooms; revocation kills open sessions',async()=>{
  for(const r of hostRooms)await rpc('p1','join',{code:r.code,nickname:'Ash'});
  await command('host',hostRooms[0].id,'start');
  await db.query("update goku_private.licenses set starts_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' where id=$1",[invitation.id]);
  await rejects('host','create',{quiz:'pokemon',license_id:invitation.id},/scaduta/);await assert.rejects(()=>command('host',hostRooms[1].id,'start'),/Privilegi/);
  await db.query("update public.goku_rooms set starts_at=now()-interval '1 second' where id=$1",[hostRooms[0].id]);await command('host',hostRooms[0].id,'pause');await command('host',hostRooms[0].id,'resume');
  await rpc('admin','license_revoke',{license_id:invitation.id});assert.equal((await state('host',hostRooms[0].id)).can_control,false);await assert.rejects(()=>command('host',hostRooms[0].id,'pause'),/Privilegi/);
  await command('admin',hostRooms[0].id,'end');assert.equal((await state('admin',hostRooms[0].id)).room.phase,'finished');
 });
 }finally{await db.end();await root.query(`drop database ${dbName}`);await root.end();}
});

-- All writes use the authenticated goku RPC. No service key is used by the browser.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists fuzzystrmatch with schema extensions;
create schema if not exists goku_private;
revoke all on schema goku_private from public, anon, authenticated;

create table goku_private.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table goku_private.licenses (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email=lower(trim(email))),
  starts_at timestamptz not null,
  expires_at timestamptz not null check (expires_at>starts_at),
  max_rooms integer not null check (max_rooms between 1 and 10000),
  used_rooms integer not null default 0 check (used_rooms between 0 and max_rooms),
  quizzes text[] not null check (cardinality(quizzes)>0 and quizzes <@ array['pokemon']),
  token_hash bytea not null unique,
  redeemed_by uuid references auth.users(id) on delete set null,
  redeemed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);
create table goku_private.cards (
  id integer primary key, name text not null, image text not null
);
create table goku_private.pokedex (name text primary key);
create table public.goku_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[0-9]{6}$'),
  host_id uuid not null references auth.users(id),
  license_id uuid references goku_private.licenses(id),
  quiz text not null check (quiz='pokemon'),
  phase text not null default 'lobby' check (phase in ('lobby','question','paused','reveal','finished')),
  round integer not null default 0,
  starts_at timestamptz,
  deadline timestamptz,
  remaining_ms integer not null default 30000,
  revision bigint not null default 0,
  created_at timestamptz not null default clock_timestamp()
);
create table public.goku_participants (
  room_id uuid not null references public.goku_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 24),
  nickname_key text not null,
  score integer not null default 0,
  last_seen timestamptz not null default clock_timestamp(),
  primary key (room_id,user_id), unique (room_id,nickname_key)
);
create table goku_private.games (
  room_id uuid primary key references public.goku_rooms(id) on delete cascade,
  questions integer[] not null,
  answers jsonb not null default '{}',
  settled_round integer not null default 0
);
-- Request IDs make answer retries idempotent (including concurrent mobile retries).
create table goku_private.requests (
  user_id uuid not null, request_id uuid not null, result jsonb not null,
  created_at timestamptz not null default clock_timestamp(), primary key(user_id,request_id)
);
alter table goku_private.admins enable row level security;
alter table goku_private.licenses enable row level security;
alter table goku_private.cards enable row level security;
alter table goku_private.pokedex enable row level security;
alter table goku_private.games enable row level security;
alter table goku_private.requests enable row level security;
alter table public.goku_rooms enable row level security;
alter table public.goku_participants enable row level security;
revoke all on public.goku_rooms, public.goku_participants from anon,authenticated;
grant select on public.goku_rooms, public.goku_participants to authenticated;

create function goku_private.verified() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null and coalesce(is_anonymous,false)=false);
$$;
create function goku_private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select goku_private.verified() and exists(select 1 from goku_private.admins where user_id=auth.uid());
$$;
create function public.goku_can_read(p_room uuid) returns boolean language sql stable security definer set search_path='' as $$
 select goku_private.is_admin() or exists(select 1 from public.goku_rooms where id=p_room and host_id=auth.uid()) or exists(select 1 from public.goku_participants where room_id=p_room and user_id=auth.uid());
$$;
revoke all on function public.goku_can_read(uuid) from public,anon;
grant execute on function public.goku_can_read(uuid) to authenticated;
create policy rooms_read on public.goku_rooms for select to authenticated using (public.goku_can_read(id));
create policy participants_read on public.goku_participants for select to authenticated using (public.goku_can_read(room_id));

create function goku_private.normalize(p_text text) returns text language sql stable set search_path='' as $$
 select regexp_replace(lower(normalize(p_text,NFD)), '[^a-z0-9]', '', 'g');
$$;
create function goku_private.resolve_name(p_text text) returns text language plpgsql stable set search_path='' as $$
declare v text:=goku_private.normalize(p_text); best integer; matches text[];
begin
 if v='' then return null; end if;
 if exists(select 1 from goku_private.pokedex where name=v) then return v; end if;
 select min(distance) into best from (
  select extensions.levenshtein(v,name) distance, case when length(name)>=8 then 2 when length(name)>=4 then 1 else 0 end lim
  from goku_private.pokedex where abs(length(v)-length(name))<=2
 ) s where distance<=lim;
 select array_agg(name) into matches from goku_private.pokedex
 where extensions.levenshtein(v,name)=best and best<=case when length(name)>=8 then 2 when length(name)>=4 then 1 else 0 end;
 return case when cardinality(matches)=1 then matches[1] else null end;
end $$;

create function goku_private.can_control(p_room public.goku_rooms) returns boolean language sql stable set search_path='' as $$
 select goku_private.is_admin() or (goku_private.verified() and p_room.host_id=auth.uid() and exists(
  select 1 from goku_private.licenses where id=p_room.license_id and redeemed_by=auth.uid() and revoked_at is null
  and (p_room.phase<>'lobby' or (clock_timestamp()>=starts_at and clock_timestamp()<expires_at))
 ));
$$;
-- Called under the room lock; applies pending scores exactly once.
create function goku_private.settle(p_room uuid, p_force boolean default false) returns void language plpgsql set search_path='' as $$
declare r public.goku_rooms; g goku_private.games;
begin
 select * into r from public.goku_rooms where id=p_room;
 if r.phase='question' and clock_timestamp()>=r.deadline then
  update public.goku_rooms set phase='reveal',revision=revision+1 where id=p_room; r.phase:='reveal';
 end if;
 if p_force or r.phase in ('reveal','finished') then
  select * into g from goku_private.games where room_id=p_room;
  if g.settled_round<r.round then
   update public.goku_participants p set score=score+coalesce((g.answers->p.user_id::text->>'points')::integer,0) where room_id=p_room;
   update goku_private.games set settled_round=r.round where room_id=p_room;
  end if;
 end if;
end $$;

create function public.goku(action text, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare
 uid uuid:=auth.uid(); adm boolean:=goku_private.is_admin(); verified boolean:=goku_private.verified();
 l goku_private.licenses; r public.goku_rooms; g goku_private.games; now_at timestamptz;
 result jsonb; items jsonb; mine jsonb; a jsonb; secret text; email_value text;
 room_id uuid; request_id uuid; code_value text; nickname_value text; resolved text; correct_name text;
 points integer; tries integer; ms integer; command text; question_ids integer[]; token_digest bytea;
begin
 if uid is null then raise exception 'Autenticazione necessaria'; end if;
 if action='dashboard' then
  if not verified then raise exception 'Verifica la tua email per accedere'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'email',email,'starts_at',starts_at,'expires_at',expires_at,
   'max_rooms',max_rooms,'used_rooms',used_rooms,'quizzes',quizzes,'redeemed',redeemed_at is not null,
   'status',case when revoked_at is not null then 'revocato' when clock_timestamp()>=expires_at then 'scaduto'
    when redeemed_at is not null and clock_timestamp()>=starts_at then 'attivo' else 'disponibile' end) order by created_at desc),'[]')
  into items from goku_private.licenses where adm or redeemed_by=uid;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]') into result from
   (select * from public.goku_rooms where adm or host_id=uid) x;
  return jsonb_build_object('admin',adm,'licenses',items,'rooms',result,'server_now',clock_timestamp());
 elsif action='license_create' then
  if not adm then raise exception 'Solo Admin'; end if;
  email_value:=lower(trim(payload->>'email'));
  if email_value is null or email_value !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Email non valida'; end if;
  if (payload->>'expires_at')::timestamptz<=clock_timestamp() then raise exception 'Scadenza già trascorsa'; end if;
  secret:=encode(extensions.gen_random_bytes(32),'hex');
  insert into goku_private.licenses(email,starts_at,expires_at,max_rooms,quizzes,token_hash)
  values(email_value,(payload->>'starts_at')::timestamptz,(payload->>'expires_at')::timestamptz,(payload->>'max_rooms')::integer,
   array(select jsonb_array_elements_text(payload->'quizzes')),extensions.digest(secret,'sha256')) returning * into l;
  return jsonb_build_object('id',l.id,'token',secret);
 elsif action='license_revoke' then
  if not adm then raise exception 'Solo Admin'; end if;
  -- Lock the license first, as create/control do, to serialize concurrent revocation.
  update goku_private.licenses set revoked_at=clock_timestamp() where id=(payload->>'license_id')::uuid;
  update public.goku_rooms set revision=revision+1 where license_id=(payload->>'license_id')::uuid;
  return jsonb_build_object('revoked',true);
 elsif action='redeem' then
  if not verified then raise exception 'Verifica prima la tua email'; end if;
  if length(payload->>'token')<>64 then raise exception 'Invito non valido'; end if;
  token_digest:=extensions.digest(payload->>'token','sha256');
  select * into l from goku_private.licenses where token_hash=token_digest for update;
  if not found then raise exception 'Invito non valido'; end if;
  if l.revoked_at is not null then raise exception 'Invito revocato'; end if;
  if l.expires_at<=clock_timestamp() then raise exception 'Invito scaduto'; end if;
  if l.redeemed_at is not null then raise exception 'Invito già utilizzato'; end if;
  select lower(email) into email_value from auth.users where id=uid;
  if email_value<>l.email then raise exception 'Email diversa da quella autorizzata'; end if;
  update goku_private.licenses set redeemed_by=uid,redeemed_at=clock_timestamp() where id=l.id;
  return jsonb_build_object('redeemed',true);
 elsif action='create' then
  if not verified then raise exception 'Solo Admin o Host verificati possono creare stanze'; end if;
  if payload->>'quiz' is distinct from 'pokemon' then raise exception 'Quiz non disponibile'; end if;
  if not adm then
   select * into l from goku_private.licenses where id=(payload->>'license_id')::uuid for update;
   if not found or l.redeemed_by is distinct from uid then raise exception 'Licenza non autorizzata'; end if;
   if l.revoked_at is not null then raise exception 'Licenza revocata'; end if;
   if clock_timestamp()<l.starts_at or clock_timestamp()>=l.expires_at then raise exception 'Licenza non attiva o scaduta'; end if;
   if not ('pokemon'=any(l.quizzes)) then raise exception 'Quiz non autorizzato'; end if;
   if l.used_rooms>=l.max_rooms then raise exception 'Quota esaurita'; end if;
   update goku_private.licenses set used_rooms=used_rooms+1 where id=l.id;
  end if;
  select array_agg(id order by extensions.gen_random_bytes(8)) into question_ids from goku_private.cards;
  if cardinality(question_ids) is distinct from 6 then raise exception 'Quiz non configurato: applicare il seed'; end if;
  for i in 1..30 loop
   code_value:=(100000+(('x'||encode(extensions.gen_random_bytes(4),'hex'))::bit(32)::bigint % 900000))::text;
   insert into public.goku_rooms(code,host_id,license_id,quiz) values(code_value,uid,case when adm then null else l.id end,'pokemon')
    on conflict(code) do nothing returning * into r;
   exit when found;
  end loop;
  if r.id is null then raise exception 'Riprova a creare la stanza'; end if;
  insert into goku_private.games(room_id,questions) values(r.id,question_ids);
  return jsonb_build_object('id',r.id,'code',r.code);
 elsif action='join' then
  select * into r from public.goku_rooms where code=payload->>'code' for update;
  if not found then raise exception 'Stanza inesistente'; end if;
  if exists(select 1 from public.goku_participants where room_id=r.id and user_id=uid) then return jsonb_build_object('id',r.id,'code',r.code); end if;
  if r.phase<>'lobby' then raise exception 'Partita già iniziata'; end if;
  if (select count(*) from public.goku_participants where room_id=r.id)>=100 then raise exception 'Stanza piena'; end if;
  nickname_value:=regexp_replace(trim(payload->>'nickname'),'\s+',' ','g');
  if nickname_value is null or nickname_value !~ '^[[:alnum:] _.-]{1,24}$' then raise exception 'Nickname non valido (1–24 lettere o numeri)'; end if;
  if exists(select 1 from public.goku_participants where room_id=r.id and nickname_key=lower(nickname_value)) then raise exception 'Nickname già utilizzato'; end if;
  insert into public.goku_participants(room_id,user_id,nickname,nickname_key) values(r.id,uid,nickname_value,lower(nickname_value));
  update public.goku_rooms set revision=revision+1 where id=r.id;
  return jsonb_build_object('id',r.id,'code',r.code);
 end if;

 room_id:=(payload->>'room_id')::uuid;
 if room_id is null then raise exception 'Stanza non valida'; end if;
 -- All privileged controls share license -> room lock order with revoke.
 if action='command' then
  select * into r from public.goku_rooms where id=room_id;
  if r.license_id is not null then perform 1 from goku_private.licenses where id=r.license_id for update; end if;
 end if;
 select * into r from public.goku_rooms where id=room_id for update;
 if not found or not public.goku_can_read(room_id) then raise exception 'Stanza non accessibile'; end if;
 perform goku_private.settle(room_id);
 select * into r from public.goku_rooms where id=room_id;
 select * into g from goku_private.games where games.room_id=r.id;
 now_at:=clock_timestamp();
 ms:=case when r.phase='paused' then r.remaining_ms else greatest(0,least(30000,ceil(extract(epoch from (r.deadline-now_at))*1000)::integer)) end;
 if action='state' then
  update public.goku_participants set last_seen=now_at where goku_participants.room_id=r.id and user_id=uid;
  select coalesce(jsonb_agg(to_jsonb(x) order by rank,nickname),'[]') into items from (
   select user_id,nickname,score,rank() over(order by score desc) rank,last_seen>now_at-interval '20 seconds' connected
   from public.goku_participants where goku_participants.room_id=r.id
  ) x;
  select jsonb_build_object('nickname',nickname,'score',score,'attempts',coalesce((g.answers->uid::text->>'attempts')::integer,0),
    'done',coalesce((g.answers->uid::text->>'done')::boolean,false),'result',g.answers->uid::text->>'result') into mine
   from public.goku_participants where goku_participants.room_id=r.id and user_id=uid;
  result:=jsonb_build_object('room',to_jsonb(r),'server_now',now_at,'remaining_ms',ms,'players',items,'me',mine,
   'can_control',goku_private.can_control(r),'received',(select count(*) from jsonb_each(g.answers) where (value->>'done')::boolean),
   'solution',case when r.phase in ('reveal','finished') then (select name from goku_private.cards where id=g.questions[r.round]) else null end);
  return result;
 elsif action='card' then
  if not goku_private.can_control(r) then raise exception 'Solo il conduttore può vedere la carta'; end if;
  -- Image data is returned only to the authorized host, never to participants.
  return jsonb_build_object('asset',case when r.round>0 then (select image from goku_private.cards where id=g.questions[r.round]) else null end);
 elsif action='answer' then
  if not exists(select 1 from public.goku_participants where goku_participants.room_id=r.id and user_id=uid) then raise exception 'Solo giocatori'; end if;
  request_id:=(payload->>'request_id')::uuid;
  if request_id is null then raise exception 'Identificativo richiesta necessario'; end if;
  select requests.result into result from goku_private.requests where user_id=uid and requests.request_id=(payload->>'request_id')::uuid;
  if found then return result; end if;
  if r.phase<>'question' or now_at<r.starts_at or now_at>=r.deadline then raise exception 'Risposte chiuse o timer in pausa'; end if;
  if (payload->>'round')::integer is distinct from r.round then raise exception 'Domanda non più attuale'; end if;
  if length(trim(payload->>'answer')) not between 1 and 80 or payload->>'answer' is null then raise exception 'Inserisci un nome (massimo 80 caratteri)'; end if;
  a:=coalesce(g.answers->uid::text,'{"attempts":0,"done":false,"points":0}'::jsonb);
  if (a->>'done')::boolean then raise exception 'Hai già completato questa domanda'; end if;
  resolved:=goku_private.resolve_name(payload->>'answer');
  if resolved is null then result:=jsonb_build_object('result','invalid','message','Nome errato, riprova');
  else
   select goku_private.normalize(name) into correct_name from goku_private.cards where id=g.questions[r.round];
   tries:=(a->>'attempts')::integer;
   if resolved=correct_name then
    points:=ceil(ms/1000.0)::integer*10;
    a:=jsonb_build_object('attempts',tries,'done',true,'points',points,'result','correct');
   else
    tries:=tries+1; a:=jsonb_build_object('attempts',tries,'done',tries>=3,'points',0,'result','wrong');
   end if;
   update goku_private.games set answers=jsonb_set(answers,array[uid::text],a) where games.room_id=r.id;
   update public.goku_rooms set revision=revision+1 where id=r.id;
   result:=a;
  end if;
  insert into goku_private.requests(user_id,request_id,result) values(uid,request_id,result);
  return result;
 elsif action='command' then
  if not goku_private.can_control(r) then raise exception 'Privilegi Host assenti, scaduti o revocati'; end if;
  if (payload->>'revision')::bigint is distinct from r.revision then raise exception 'Stato cambiato: riprova'; end if;
  command:=payload->>'command';
  if command in ('start','next') then
   if not ((command='start' and r.phase='lobby') or (command='next' and r.phase='reveal')) then raise exception 'Comando non disponibile'; end if;
   if not exists(select 1 from public.goku_participants where goku_participants.room_id=r.id) then raise exception 'Attendi un giocatore'; end if;
   if r.round=6 then update public.goku_rooms set phase='finished',revision=revision+1 where id=r.id;
   else
    update public.goku_rooms set phase='question',round=round+1,starts_at=now_at+interval '2 seconds',deadline=now_at+interval '32 seconds',remaining_ms=30000,revision=revision+1 where id=r.id;
    update goku_private.games set answers='{}' where games.room_id=r.id;
   end if;
  elsif command='pause' and r.phase='question' and now_at>=r.starts_at then
   update public.goku_rooms set phase='paused',remaining_ms=ms,revision=revision+1 where id=r.id;
  elsif command='resume' and r.phase='paused' then
   update public.goku_rooms set phase='question',deadline=now_at+r.remaining_ms*interval '1 millisecond',revision=revision+1 where id=r.id;
  elsif command='end' then
   perform goku_private.settle(r.id,true);
   update public.goku_rooms set phase='finished',revision=revision+1 where id=r.id;
  else raise exception 'Comando non disponibile'; end if;
  return jsonb_build_object('ok',true);
 end if;
 raise exception 'Operazione non disponibile';
end $$;

revoke all on all functions in schema goku_private from public, anon, authenticated;
revoke all on function public.goku(text,jsonb) from public,anon;
grant execute on function public.goku(text,jsonb) to authenticated;
-- Only non-secret room revisions are published. Never publish private tables.
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  alter publication supabase_realtime add table public.goku_rooms;
 end if;
end $$;

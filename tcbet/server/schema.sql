-- TCBET multiplayer schema for Supabase. Paste into the SQL editor and run once, then run seed.sql.
-- Every balance/item change goes through a SECURITY DEFINER function below; clients can only read.

-- ============================================================ catalog (filled by seed.sql)
create table if not exists catalog (name text primary key, v float8 not null, hf float8 not null default 0, unu bool not null default false, fx text[] not null default '{}', q text, weapon bool not null default false);
create table if not exists effects (name text primary key, m float8 not null, g text[] not null);
create table if not exists cases (id text primary key, name text not null, price numeric(14,2) not null, sort int not null default 0);
create table if not exists case_entries (case_id text references cases on delete cascade, idx int, name text, p float8 not null, unusual bool not null default false, groups text[], hats text[], primary key (case_id, idx));

-- ============================================================ players
create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  username text not null,
  balance numeric(14,2) not null default 100 check (balance >= 0),
  daily_at timestamptz, chat_at timestamptz,
  opened int not null default 0,
  created_at timestamptz not null default now());
create unique index if not exists profiles_username_ci on profiles (lower(username));
-- player | vip. Only changed by hand in the SQL editor (see vip.sql); no game function touches it.
alter table profiles add column if not exists rank text not null default 'player';

create table if not exists inventory (
  id bigint generated always as identity primary key,
  owner uuid references profiles on delete cascade,
  name text not null, fx text,
  state text not null default 'inv',          -- inv | flip | jackpot
  created_at timestamptz not null default now());
create index if not exists inventory_owner on inventory (owner);

create table if not exists drops (id bigint generated always as identity primary key, username text, name text, fx text, value numeric(14,2), source text, created_at timestamptz not null default now());
create table if not exists chat (id bigint generated always as identity primary key, user_id uuid, username text, body text, created_at timestamptz not null default now());
alter table chat add column if not exists rank text;

create table if not exists coinflips (
  id bigint generated always as identity primary key,
  creator uuid, creator_name text, side text, creator_items jsonb, creator_value numeric(14,2),
  joiner uuid, joiner_name text, joiner_items jsonb, joiner_value numeric(14,2),
  winner_side text, winner uuid, status text not null default 'open',   -- open | done | cancelled
  created_at timestamptz not null default now(), finished_at timestamptz);

create table if not exists jackpot_rounds (id bigint generated always as identity primary key, status text not null default 'open', ends_at timestamptz, winner uuid, winner_name text, total numeric(14,2), ticket float8, created_at timestamptz not null default now(), finished_at timestamptz);
create table if not exists jackpot_entries (id bigint generated always as identity primary key, round_id bigint references jackpot_rounds on delete cascade, user_id uuid, username text, items jsonb, value numeric(14,2), created_at timestamptz not null default now());

create table if not exists trades (
  id bigint generated always as identity primary key,
  sender uuid, sender_name text, receiver uuid, receiver_name text,
  give jsonb not null default '[]', get jsonb not null default '[]', give_coins numeric(14,2) not null default 0,
  status text not null default 'pending',     -- pending | accepted | declined | cancelled | failed
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

-- ============================================================ read-only access for clients
do $$ declare t text; begin
  foreach t in array array['catalog','effects','cases','case_entries','profiles','inventory','drops','chat','coinflips','jackpot_rounds','jackpot_entries','trades'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists read_all on %I', t);
    if t <> 'trades' then execute format('create policy read_all on %I for select using (true)', t); end if;
  end loop;
end $$;
drop policy if exists read_own on trades;
create policy read_own on trades for select using (auth.uid() in (sender, receiver));

-- ============================================================ helpers
create or replace function item_value(p_name text, p_fx text) returns numeric language sql stable set search_path = public as $$
  select case when p_fx is null then (select round(v::numeric, 2) from catalog where name = p_name)
    else (select round(least(18000, e.m * case when 'UX' = any(e.g) then least(1, c.hf) else c.hf end)::numeric, 2)
          from catalog c join effects e on e.name = p_fx where c.name = p_name and c.unu and c.fx && e.g) end $$;

create or replace function _uid() returns uuid language plpgsql stable as $$
begin if auth.uid() is null then raise exception 'Please sign in first'; end if; return auth.uid(); end $$;

-- lock items the caller owns (state inv) and move them to p_state; returns [{id,n,fx,v}]
create or replace function _claim_items(p_ids bigint[], p_uid uuid, p_state text) returns jsonb language plpgsql set search_path = public as $$
declare ids bigint[] := array(select distinct unnest(p_ids)); j jsonb; n int;
begin
  if cardinality(ids) = 0 then raise exception 'Select at least one item'; end if;
  if cardinality(ids) > 40 then raise exception 'Max 40 items at once'; end if;
  perform 1 from inventory where id = any(ids) for update;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'n', name, 'fx', fx, 'v', item_value(name, fx)) order by item_value(name, fx) desc), '[]'), count(*)
    into j, n from inventory where id = any(ids) and owner = p_uid and state = 'inv';
  if n <> cardinality(ids) then raise exception 'Some of those items are no longer in your inventory'; end if;
  update inventory set state = p_state where id = any(ids);
  return j;
end $$;

create or replace function _jsum(j jsonb) returns numeric language sql immutable as $$ select coalesce(sum((x->>'v')::numeric), 0) from jsonb_array_elements(j) x $$;
create or replace function _jids(j jsonb) returns bigint[] language sql immutable as $$ select coalesce(array_agg((x->>'id')::bigint), '{}') from jsonb_array_elements(j) x $$;

-- ============================================================ accounts
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare uname text := new.raw_user_meta_data->>'username';
begin
  if uname is null or uname !~ '^[A-Za-z0-9_]{3,20}$' then raise exception 'Username must be 3-20 letters, numbers or _'; end if;
  insert into profiles (id, username) values (new.id, uname);
  insert into inventory (owner, name) select new.id, name from catalog where not weapon and v < 1.5 order by random() limit 4;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

create or replace function username_available(p_name text) returns bool language sql stable security definer set search_path = public as $$
  select p_name ~ '^[A-Za-z0-9_]{3,20}$' and not exists (select 1 from profiles where lower(username) = lower(p_name)) $$;

create or replace function claim_daily() returns numeric language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); b numeric;
begin
  update profiles set balance = balance + case when rank = 'vip' then 100 else 25 end, daily_at = now() where id = uid and (daily_at is null or daily_at < now() - interval '4 hours') returning balance into b;
  if not found then raise exception 'Free coins are not ready yet'; end if;
  return b;
end $$;

-- ============================================================ cases / market / selling
create or replace function open_case(p_case text, p_qty int) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); c cases; uname text; res jsonb := '[]'; k int; r float8; e case_entries; hat text; fxn text; inter text[]; nid bigint; v numeric;
begin
  if p_qty not between 1 and 5 then raise exception 'Open 1 to 5 at a time'; end if;
  select * into c from cases where id = p_case; if not found then raise exception 'Unknown case'; end if;
  update profiles set balance = balance - c.price * p_qty, opened = opened + p_qty where id = uid and balance >= c.price * p_qty returning username into uname;
  if not found then raise exception 'Not enough coins'; end if;
  for i in 1..p_qty loop
    r := random();
    select x.idx into k from (select idx, sum(p) over (order by idx) cum from case_entries where case_id = p_case) x where x.cum >= r order by x.idx limit 1;
    if k is null then select max(idx) into k from case_entries where case_id = p_case; end if;
    select * into e from case_entries where case_id = p_case and idx = k;
    if e.unusual then
      hat := e.hats[1 + floor(random() * cardinality(e.hats))::int];
      select array(select unnest(e.groups) intersect select unnest(fx)) into inter from catalog where name = hat;
      select name into fxn from effects where g && inter order by random() limit 1;
    else hat := e.name; fxn := null; end if;
    insert into inventory (owner, name, fx) values (uid, hat, fxn) returning id into nid;
    v := item_value(hat, fxn);
    res := res || jsonb_build_object('id', nid, 'n', hat, 'fx', fxn, 'v', v);
    insert into drops (username, name, fx, value, source) values (uname, hat, fxn, v, c.name);
  end loop;
  return jsonb_build_object('items', res, 'balance', (select balance from profiles where id = uid));
end $$;

create or replace function sell_items(p_ids bigint[]) returns numeric language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); ids bigint[] := array(select distinct unnest(p_ids)); s numeric; n int; b numeric;
begin
  with d as (delete from inventory where id = any(ids) and owner = uid and state = 'inv' returning name, fx)
    select coalesce(sum(item_value(name, fx)), 0), count(*) into s, n from d;
  if n <> cardinality(ids) or n = 0 then raise exception 'Some of those items are no longer in your inventory'; end if;
  update profiles set balance = balance + round(s * case when rank = 'vip' then 1 else 0.95 end, 2) where id = uid returning balance into b;
  return b;
end $$;

create or replace function buy_item(p_name text, p_fx text) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); v numeric := item_value(p_name, p_fx); nid bigint; b numeric;
begin
  if v is null then raise exception 'That item cannot exist'; end if;
  update profiles set balance = balance - v where id = uid and balance >= v returning balance into b;
  if not found then raise exception 'Not enough coins'; end if;
  insert into inventory (owner, name, fx) values (uid, p_name, p_fx) returning id into nid;
  return jsonb_build_object('id', nid, 'balance', b);
end $$;

-- ============================================================ unusualifier (upgrader)
create or replace function upgrade(p_ids bigint[], p_hat text, p_fx text) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); ids bigint[] := array(select distinct unnest(p_ids)); t numeric := item_value(p_hat, p_fx); s numeric; n int; ch float8; roll float8 := random(); nid bigint; uname text;
begin
  if p_fx is null or t is null then raise exception 'That hat cannot have that effect'; end if;
  with d as (delete from inventory where id = any(ids) and owner = uid and state = 'inv' returning name, fx)
    select coalesce(sum(item_value(name, fx)), 0), count(*) into s, n from d;
  if n <> cardinality(ids) or n = 0 then raise exception 'Some of those items are no longer in your inventory'; end if;
  if s >= t then raise exception 'Your stake is already worth more than the target'; end if;
  ch := least(0.75, s / t * 0.95);
  if roll < ch then
    insert into inventory (owner, name, fx) values (uid, p_hat, p_fx) returning id into nid;
    select username into uname from profiles where id = uid;
    insert into drops (username, name, fx, value, source) values (uname, p_hat, p_fx, t, 'Unusualifier');
  end if;
  return jsonb_build_object('win', roll < ch, 'roll', roll, 'chance', ch, 'id', nid);
end $$;

-- ============================================================ coinflip
create or replace function coinflip_create(p_ids bigint[], p_side text) returns bigint language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); j jsonb; fid bigint;
begin
  if p_side not in ('RED', 'GRN') then raise exception 'Pick RED or GRN'; end if;
  if (select count(*) from coinflips where creator = uid and status = 'open') >= 3 then raise exception 'You already have 3 open flips'; end if;
  j := _claim_items(p_ids, uid, 'flip');
  insert into coinflips (creator, creator_name, side, creator_items, creator_value)
    values (uid, (select username from profiles where id = uid), p_side, j, _jsum(j)) returning id into fid;
  return fid;
end $$;

create or replace function coinflip_join(p_id bigint, p_ids bigint[]) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); f coinflips; j jsonb; v numeric; ws text; w uuid;
begin
  select * into f from coinflips where id = p_id for update;
  if not found or f.status <> 'open' then raise exception 'That flip is no longer open'; end if;
  if f.creator = uid then raise exception 'You cannot join your own flip'; end if;
  j := _claim_items(p_ids, uid, 'flip'); v := _jsum(j);
  if v < f.creator_value * 0.9 or v > f.creator_value * 1.1 then raise exception 'Your items must be within 10%% of %', f.creator_value; end if;
  ws := case when random() < 0.5 then 'RED' else 'GRN' end;
  w := case when ws = f.side then f.creator else uid end;
  update inventory set owner = w, state = 'inv' where id = any(_jids(f.creator_items) || _jids(j));
  update coinflips set joiner = uid, joiner_name = (select username from profiles where id = uid), joiner_items = j, joiner_value = v,
    winner_side = ws, winner = w, status = 'done', finished_at = now() where id = p_id returning * into f;
  return to_jsonb(f);
end $$;

-- nobody joined: flip against the house for coins (win = items back + their value in coins)
create or replace function coinflip_house(p_id bigint) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); f coinflips; ws text;
begin
  select * into f from coinflips where id = p_id for update;
  if not found or f.status <> 'open' or f.creator <> uid then raise exception 'That flip is no longer open'; end if;
  if f.created_at > now() - interval '10 seconds' then raise exception 'Give other players a few seconds to join first'; end if;
  ws := case when random() < 0.5 then 'RED' else 'GRN' end;
  if ws = f.side then
    update inventory set state = 'inv' where id = any(_jids(f.creator_items));
    update profiles set balance = balance + f.creator_value where id = uid;
  else
    delete from inventory where id = any(_jids(f.creator_items));
  end if;
  update coinflips set joiner_name = 'House', joiner_items = '[]', joiner_value = f.creator_value, winner_side = ws,
    winner = case when ws = f.side then uid end, status = 'done', finished_at = now() where id = p_id returning * into f;
  return to_jsonb(f);
end $$;

create or replace function coinflip_cancel(p_id bigint) returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); f coinflips;
begin
  select * into f from coinflips where id = p_id for update;
  if not found or f.status <> 'open' or f.creator <> uid then raise exception 'That flip is no longer open'; end if;
  update inventory set state = 'inv' where id = any(_jids(f.creator_items));
  update coinflips set status = 'cancelled', finished_at = now() where id = p_id;
end $$;

-- ============================================================ jackpot
create or replace function _open_round() returns jackpot_rounds language plpgsql set search_path = public as $$
declare r jackpot_rounds;
begin
  select * into r from jackpot_rounds where status = 'open' order by id desc limit 1 for update;
  if not found then insert into jackpot_rounds default values returning * into r; end if;
  return r;
end $$;

create or replace function jackpot_deposit(p_ids bigint[]) returns bigint language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); r jackpot_rounds; j jsonb;
begin
  r := _open_round();
  if r.ends_at is not null and r.ends_at <= now() then raise exception 'This round is rolling, wait for the next one'; end if;
  j := _claim_items(p_ids, uid, 'jackpot');
  insert into jackpot_entries (round_id, user_id, username, items, value) values (r.id, uid, (select username from profiles where id = uid), j, _jsum(j));
  if r.ends_at is null and (select count(distinct user_id) from jackpot_entries where round_id = r.id) >= 2 then
    update jackpot_rounds set ends_at = now() + interval '30 seconds' where id = r.id;
  end if;
  return r.id;
end $$;

-- only player in the round and the timer hasn't started: take your items back
create or replace function jackpot_withdraw() returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); r jackpot_rounds;
begin
  r := _open_round();
  if r.ends_at is not null then raise exception 'The timer has started, items are locked in'; end if;
  update inventory set state = 'inv' where id = any(select unnest(_jids(items)) from jackpot_entries where round_id = r.id and user_id = uid);
  delete from jackpot_entries where round_id = r.id and user_id = uid;
end $$;

-- anyone may call this once the timer runs out; it is idempotent
create or replace function jackpot_settle() returns jsonb language plpgsql security definer set search_path = public as $$
declare r jackpot_rounds; tot numeric; t float8; acc numeric := 0; e jackpot_entries; w jackpot_entries;
begin
  select * into r from jackpot_rounds where status = 'open' and ends_at <= now() order by id limit 1 for update skip locked;
  if not found then return null; end if;
  select sum(value) into tot from jackpot_entries where round_id = r.id;
  t := random() * tot;
  for e in select * from jackpot_entries where round_id = r.id order by id loop
    acc := acc + e.value; w := e;
    exit when acc >= t;
  end loop;
  update inventory set owner = w.user_id, state = 'inv' where id = any(select unnest(_jids(items)) from jackpot_entries where round_id = r.id);
  update jackpot_rounds set status = 'done', winner = w.user_id, winner_name = w.username, total = tot, ticket = t, finished_at = now() where id = r.id returning * into r;
  insert into chat (username, body) values ('TCBET', w.username || ' won jackpot #' || r.id || ' worth ' || tot || ' with ' || round(w.value / tot * 100, 1) || '%');
  insert into jackpot_rounds default values;
  return to_jsonb(r);
end $$;

-- ============================================================ trading
create or replace function trade_send(p_to text, p_give bigint[], p_get bigint[], p_coins numeric default 0) returns bigint language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); rc profiles; me profiles; g jsonb; w jsonb; n int; tid bigint;
begin
  select * into me from profiles where id = uid;
  select * into rc from profiles where lower(username) = lower(p_to);
  if not found then raise exception 'No player named %', p_to; end if;
  if rc.id = uid then raise exception 'You cannot trade with yourself'; end if;
  p_coins := round(coalesce(p_coins, 0), 2);
  if p_coins < 0 or p_coins > me.balance then raise exception 'You do not have that many coins'; end if;
  if cardinality(coalesce(p_give, '{}')) + cardinality(coalesce(p_get, '{}')) = 0 and p_coins = 0 then raise exception 'Add something to the trade'; end if;
  if cardinality(coalesce(p_give, '{}')) > 40 or cardinality(coalesce(p_get, '{}')) > 40 then raise exception 'Max 40 items per side'; end if;
  if (select count(*) from trades where sender = uid and status = 'pending') >= 10 then raise exception 'You have 10 pending offers already'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'n', name, 'fx', fx, 'v', item_value(name, fx))), '[]'), count(*) into g, n
    from inventory where id = any(p_give) and owner = uid and state = 'inv';
  if n <> cardinality(array(select distinct unnest(coalesce(p_give, '{}')))) then raise exception 'Some of your items are no longer available'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'n', name, 'fx', fx, 'v', item_value(name, fx))), '[]'), count(*) into w, n
    from inventory where id = any(p_get) and owner = rc.id and state = 'inv';
  if n <> cardinality(array(select distinct unnest(coalesce(p_get, '{}')))) then raise exception 'Some of their items are no longer available'; end if;
  insert into trades (sender, sender_name, receiver, receiver_name, give, get, give_coins)
    values (uid, me.username, rc.id, rc.username, g, w, p_coins) returning id into tid;
  return tid;
end $$;

create or replace function trade_respond(p_id bigint, p_accept bool) returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); t trades; gi bigint[]; wi bigint[];
begin
  select * into t from trades where id = p_id for update;
  if not found or t.status <> 'pending' or t.receiver <> uid then raise exception 'That offer is no longer pending'; end if;
  if not p_accept then update trades set status = 'declined', updated_at = now() where id = p_id; return 'declined'; end if;
  gi := _jids(t.give); wi := _jids(t.get);
  perform 1 from inventory where id = any(gi || wi) for update;
  perform 1 from profiles where id in (t.sender, t.receiver) for update;
  if (select count(*) from inventory where id = any(gi) and owner = t.sender and state = 'inv') <> cardinality(gi)
     or (select count(*) from inventory where id = any(wi) and owner = t.receiver and state = 'inv') <> cardinality(wi)
     or (select balance from profiles where id = t.sender) < t.give_coins then
    update trades set status = 'failed', updated_at = now() where id = p_id;
    return 'failed';
  end if;
  update inventory set owner = t.receiver where id = any(gi);
  update inventory set owner = t.sender where id = any(wi);
  update profiles set balance = balance - t.give_coins where id = t.sender;
  update profiles set balance = balance + t.give_coins where id = t.receiver;
  update trades set status = 'accepted', updated_at = now() where id = p_id;
  return 'accepted';
end $$;

create or replace function trade_cancel(p_id bigint) returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid();
begin
  update trades set status = 'cancelled', updated_at = now() where id = p_id and sender = uid and status = 'pending';
  if not found then raise exception 'That offer is no longer pending'; end if;
end $$;

-- ============================================================ chat
create or replace function chat_send(p_body text) returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); b text := btrim(p_body); me profiles;
begin
  if length(b) = 0 or length(b) > 200 then raise exception 'Messages are 1-200 characters'; end if;
  update profiles set chat_at = now() where id = uid and (chat_at is null or chat_at < now() - interval '1.5 seconds') returning * into me;
  if not found then raise exception 'Slow down a little'; end if;
  insert into chat (user_id, username, body, rank) values (uid, me.username, b, me.rank);
end $$;

-- ============================================================ permissions + realtime
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function item_value(text, text), username_available(text) to anon, authenticated;
grant execute on function claim_daily(), open_case(text, int), sell_items(bigint[]), buy_item(text, text), upgrade(bigint[], text, text),
  coinflip_create(bigint[], text), coinflip_join(bigint, bigint[]), coinflip_house(bigint), coinflip_cancel(bigint),
  jackpot_deposit(bigint[]), jackpot_withdraw(), jackpot_settle(),
  trade_send(text, bigint[], bigint[], numeric), trade_respond(bigint, bool), trade_cancel(bigint), chat_send(text) to authenticated;

do $$ declare t text; begin
  foreach t in array array['chat','drops','coinflips','jackpot_rounds','jackpot_entries','trades'] loop
    begin execute format('alter publication supabase_realtime add table %I', t); exception when duplicate_object then null; end;
  end loop;
end $$;

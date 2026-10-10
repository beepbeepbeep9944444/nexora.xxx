-- TCBET multiplayer schema for Supabase. Paste into the SQL editor and run once, then run seed.sql.
-- Every balance/item change goes through a SECURITY DEFINER function below; clients can only read.

-- ============================================================ catalog (filled by seed.sql)
create table if not exists catalog (name text primary key, v float8 not null, hf float8 not null default 0, unu bool not null default false, fx text[] not null default '{}', q text, weapon bool not null default false);
-- price floors: fbs = min value with Burning/Scorching Energy (2018 hats), fany = min value with any non-Unusualifier effect (shop hats)
alter table catalog add column if not exists fbs float8 not null default 0;
alter table catalog add column if not exists fany float8 not null default 0;
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
alter table profiles add column if not exists rank text not null default 'player';   -- player | vip | owner
alter table profiles add column if not exists avatar text;                              -- 'class:Agent' or 'item:Knightmare|Burning'
alter table profiles add column if not exists xp numeric(16,2) not null default 0;      -- 1 xp per coin wagered
alter table profiles add column if not exists rakeback numeric(14,2) not null default 0;
alter table profiles add column if not exists crates_claimed int not null default 0;
alter table profiles add column if not exists best_name text;
alter table profiles add column if not exists best_fx text;
alter table profiles add column if not exists best_value numeric(14,2) not null default 0;
create table if not exists battles (
  id bigint generated always as identity primary key,
  creator uuid, creator_name text,
  teams int not null, team_size int not null, crazy bool not null default false,   -- crazy: lowest total wins
  cases text[] not null, cost numeric(14,2) not null,                              -- cost per seat
  status text not null default 'open',                                             -- open | done | cancelled
  results jsonb, totals jsonb, winner_team int,
  created_at timestamptz not null default now(), finished_at timestamptz);
alter table battles add column if not exists payout jsonb;   -- {slot: value received} for the winning team
create table if not exists battle_players (battle_id bigint references battles on delete cascade, slot int, user_id uuid, username text, is_bot bool not null default false, primary key (battle_id, slot));
create table if not exists roulette_games (
  id bigint generated always as identity primary key,
  creator uuid, creator_name text, stake numeric(14,2) not null,       -- the creator's buy-in; others must be within 10%
  seats int not null default 6, status text not null default 'open', -- open | done | cancelled
  eliminated int[], winner_slot int, winner_name text, pot numeric(14,2),
  created_at timestamptz not null default now(), finished_at timestamptz);
alter table roulette_games add column if not exists rounds jsonb;   -- [{start, bullet, pulls:[slot...], out}] one per elimination
create table if not exists roulette_players (game_id bigint references roulette_games on delete cascade, slot int, user_id uuid, username text,
  is_bot bool not null default false, items jsonb, value numeric(14,2), primary key (game_id, slot));
create table if not exists tips (id bigint generated always as identity primary key, sender uuid, sender_name text, receiver uuid, receiver_name text, amount numeric(14,2), created_at timestamptz not null default now());

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
alter table chat add column if not exists show_at timestamptz not null default now();
alter table drops add column if not exists show_at timestamptz not null default now();

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
  foreach t in array array['catalog','effects','cases','case_entries','profiles','inventory','drops','chat','coinflips','jackpot_rounds','jackpot_entries','trades','tips','battles','battle_players','roulette_games','roulette_players'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists read_all on %I', t);
    if t not in ('trades', 'tips') then execute format('create policy read_all on %I for select using (true)', t); end if;
  end loop;
end $$;
drop policy if exists read_own on trades;
drop policy if exists read_own on tips;
create policy read_own on tips for select using (auth.uid() in (sender, receiver));
create policy read_own on trades for select using (auth.uid() in (sender, receiver));

-- ============================================================ helpers
create or replace function item_value(p_name text, p_fx text) returns numeric language sql stable set search_path = public as $$
  select case when p_fx is null then (select round(v::numeric, 2) from catalog where name = p_name)
    else (select round(greatest(least(100000, e.m * case when 'UX' = any(e.g) then least(1, c.hf) else c.hf end),
                                case when e.name in ('Burning', 'Scorching Energy') then c.fbs else 0 end,
                                case when 'UX' = any(e.g) then 0 else c.fany end)::numeric, 2)
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

-- ============================================================ levels / rakeback
-- level L needs 100*(L-1)^2 xp: L2 = 100, L10 = 8,100, L25 = 57,600, L50 = 240,100
create or replace function level_of(p_xp numeric) returns int language sql immutable as $$ select floor(sqrt(greatest(p_xp, 0) / 100))::int + 1 $$;
create or replace function is_vip(p_rank text) returns bool language sql immutable as $$ select p_rank in ('vip', 'owner') $$;
-- 0.5% + 0.05% per level (max 3%), +1% for VIPs
create or replace function rake_rate(p_level int, p_rank text) returns numeric language sql immutable as $$
  select least(0.03, 0.005 + 0.0005 * p_level) + case when is_vip(p_rank) then 0.01 else 0 end $$;
create or replace function _wager(p_uid uuid, p_amount numeric) returns void language sql set search_path = public as $$
  update profiles set xp = xp + p_amount, rakeback = rakeback + round(p_amount * rake_rate(level_of(xp), rank), 2) where id = p_uid $$;
create or replace function _best(p_uid uuid, p_name text, p_fx text, p_v numeric) returns void language sql set search_path = public as $$
  update profiles set best_name = p_name, best_fx = p_fx, best_value = p_v where id = p_uid and p_v > best_value $$;

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
  update profiles set balance = balance + case when is_vip(rank) then 100 else 25 end, daily_at = now() where id = uid and (daily_at is null or daily_at < now() - interval '4 hours') returning balance into b;
  if not found then raise exception 'Free coins are not ready yet'; end if;
  return b;
end $$;

-- ============================================================ cases / market / selling
-- pick a random item from a case (no side effects); returns {n,fx,v}
create or replace function _pick(p_case text) returns jsonb language plpgsql set search_path = public as $$
declare k int; r float8 := random(); e case_entries; hat text; fxn text; inter text[];
begin
  select x.idx into k from (select idx, sum(p) over (order by idx) cum from case_entries where case_id = p_case) x where x.cum >= r order by x.idx limit 1;
  if k is null then select max(idx) into k from case_entries where case_id = p_case; end if;
  select * into e from case_entries where case_id = p_case and idx = k;
  if e.unusual then
    hat := e.hats[1 + floor(random() * cardinality(e.hats))::int];
    select array(select unnest(e.groups) intersect select unnest(fx)) into inter from catalog where name = hat;
    select name into fxn from effects where g && inter order by random() limit 1;
  else hat := e.name; fxn := null; end if;
  return jsonb_build_object('n', hat, 'fx', fxn, 'v', item_value(hat, fxn));
end $$;

-- roll one item from a case into the player's inventory; returns {id,n,fx,v}
create or replace function _roll_case(p_case text, p_uid uuid, p_uname text, p_source text) returns jsonb language plpgsql set search_path = public as $$
declare it jsonb := _pick(p_case); nid bigint;
begin
  insert into inventory (owner, name, fx) values (p_uid, it->>'n', it->>'fx') returning id into nid;
  insert into drops (username, name, fx, value, source, show_at) values (p_uname, it->>'n', it->>'fx', (it->>'v')::numeric, p_source, now() + interval '6 seconds');
  perform _best(p_uid, it->>'n', it->>'fx', (it->>'v')::numeric);
  return it || jsonb_build_object('id', nid);
end $$;

create or replace function open_case(p_case text, p_qty int) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); c cases; uname text; res jsonb := '[]';
begin
  if p_qty not between 1 and 5 then raise exception 'Open 1 to 5 at a time'; end if;
  select * into c from cases where id = p_case; if not found then raise exception 'Unknown case'; end if;
  update profiles set balance = balance - c.price * p_qty, opened = opened + p_qty where id = uid and balance >= c.price * p_qty returning username into uname;
  if not found then raise exception 'Not enough coins'; end if;
  perform _wager(uid, c.price * p_qty);
  for i in 1..p_qty loop res := res || _roll_case(p_case, uid, uname, c.name); end loop;
  return jsonb_build_object('items', res, 'balance', (select balance from profiles where id = uid));
end $$;

create or replace function sell_items(p_ids bigint[]) returns numeric language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); ids bigint[] := array(select distinct unnest(p_ids)); s numeric; n int; b numeric;
begin
  with d as (delete from inventory where id = any(ids) and owner = uid and state = 'inv' returning name, fx)
    select coalesce(sum(item_value(name, fx)), 0), count(*) into s, n from d;
  if n <> cardinality(ids) or n = 0 then raise exception 'Some of those items are no longer in your inventory'; end if;
  update profiles set balance = balance + round(s * case when is_vip(rank) then 1 else 0.95 end, 2) where id = uid returning balance into b;
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
  perform _wager(uid, s);
  if roll < ch then
    insert into inventory (owner, name, fx) values (uid, p_hat, p_fx) returning id into nid;
    select username into uname from profiles where id = uid;
    insert into drops (username, name, fx, value, source, show_at) values (uname, p_hat, p_fx, t, 'Unusualifier', now() + interval '5 seconds');
    perform _best(uid, p_hat, p_fx, t);
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
  perform _wager(f.creator, f.creator_value); perform _wager(uid, v);
  update inventory set owner = w, state = 'inv' where id = any(_jids(f.creator_items) || _jids(j));
  update coinflips set joiner = uid, joiner_name = (select username from profiles where id = uid), joiner_items = j, joiner_value = v,
    winner_side = ws, winner = w, status = 'done', finished_at = now() where id = p_id returning * into f;
  return to_jsonb(f);
end $$;

-- nobody joined: flip against the house for coins (win = items back + their value in coins)
-- the House stakes real items worth 90-110% of the target: greedily takes one of the biggest items that still fits
create or replace function _house_items(p_target numeric) returns jsonb language plpgsql set search_path = public as $$
declare res jsonb := '[]'; cands jsonb; left_ numeric := p_target; it jsonb;
begin
  select jsonb_agg(jsonb_build_object('n', n, 'fx', fx, 'v', v)) into cands from (
    select x.hn n, x.en fx, item_value(x.hn, x.en) v from (
      select c.name hn, e.name en from catalog c join effects e on c.fx && e.g where c.unu order by random() limit 1500) x
    union all
    select name, null, round(v::numeric, 2) from catalog
      where name not in ('Golden Frying Pan', 'Frying Pan', 'Golden Knife', 'Golden Wrench') and coalesce(q, '') <> 'Haunted' and v >= 0.05) s
    where v is not null;
  while left_ > greatest(p_target * 0.02, 0.05) and jsonb_array_length(res) < 30 loop
    select x into it from (select x from jsonb_array_elements(cands) x where (x->>'v')::numeric <= left_ * 1.02
                            order by (x->>'v')::numeric desc limit 4) top order by random() limit 1;
    exit when it is null;
    res := res || it; left_ := left_ - (it->>'v')::numeric;
  end loop;
  return res;
end $$;

-- nobody joined: flip against the House. Win = your items back + the House's items; lose = the House keeps yours
create or replace function coinflip_house(p_id bigint) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); f coinflips; ws text; hj jsonb; hv numeric;
begin
  select * into f from coinflips where id = p_id for update;
  if not found or f.status <> 'open' or f.creator <> uid then raise exception 'That flip is no longer open'; end if;
  if f.created_at > now() - interval '10 seconds' then raise exception 'Give other players a few seconds to join first'; end if;
  hj := _house_items(f.creator_value); hv := _jsum(hj);
  if hv < f.creator_value * 0.9 or hv > f.creator_value * 1.1 then        -- couldn't build a close match: top up with one filler item
    hj := hj || jsonb_build_object('n', 'Bat Blockers', 'fx', null, 'v', 0); hv := _jsum(hj);
  end if;
  perform _wager(uid, f.creator_value);
  ws := case when random() < 0.5 then 'RED' else 'GRN' end;
  if ws = f.side then
    update inventory set state = 'inv' where id = any(_jids(f.creator_items));
    insert into inventory (owner, name, fx) select uid, x->>'n', x->>'fx' from jsonb_array_elements(hj) x where (x->>'v')::numeric > 0;
  else
    delete from inventory where id = any(_jids(f.creator_items));
  end if;
  update coinflips set joiner_name = 'House', joiner_items = (select coalesce(jsonb_agg(x), '[]') from jsonb_array_elements(hj) x where (x->>'v')::numeric > 0),
    joiner_value = (select coalesce(sum((x->>'v')::numeric), 0) from jsonb_array_elements(hj) x), winner_side = ws,
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
  perform _wager(uid, _jsum(j));
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
  insert into chat (username, body, show_at) values ('TCBET', w.username || ' won jackpot #' || r.id || ' worth ' || tot || ' with ' || round(w.value / tot * 100, 1) || '%', now() + interval '8 seconds');
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

-- ============================================================ rewards: rakeback + level crates
create or replace function claim_rakeback() returns numeric language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); amt numeric;
begin
  select rakeback into amt from profiles where id = uid for update;
  if amt < 0.01 then raise exception 'No rakeback to claim yet'; end if;
  update profiles set balance = balance + rakeback, rakeback = 0 where id = uid;
  return amt;
end $$;

-- one free crate per level gained; the case is random among those priced up to 4 + 3*level coins
create or replace function open_level_crate() returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); me profiles; lvl int; cid text; cname text; item jsonb;
begin
  select * into me from profiles where id = uid for update;
  if me.crates_claimed >= level_of(me.xp) - 1 then raise exception 'No reward crates right now. Level up to earn more!'; end if;
  lvl := me.crates_claimed + 2;                       -- the level this crate rewards
  select id, name into cid, cname from cases where price <= 4 + 3 * lvl and id <> 'unusual-box' order by random() limit 1;
  if cid is null then select id, name into cid, cname from cases order by price limit 1; end if;
  update profiles set crates_claimed = crates_claimed + 1 where id = uid;
  item := _roll_case(cid, uid, me.username, 'Level ' || lvl || ' crate');
  return jsonb_build_object('item', item, 'case', cid, 'case_name', cname, 'level', lvl);
end $$;

-- ============================================================ case battles
-- modes: 1v1, 1v1v1, 2v2, 3v3, 3v3v3 (teams x team_size). Everyone opens the same cases; the winning team takes every item.
create or replace function battle_create(p_cases text[], p_teams int, p_size int, p_crazy bool) returns bigint language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); uname text; c numeric; bid bigint;
begin
  if (p_teams, p_size) not in ((2,1), (3,1), (2,2), (2,3), (3,3)) then raise exception 'Pick 1v1, 1v1v1, 2v2, 3v3 or 3v3v3'; end if;
  if cardinality(p_cases) not between 1 and 30 then raise exception 'Battles have 1 to 30 cases'; end if;
  select sum(cs.price) into c from unnest(p_cases) x(id) join cases cs on cs.id = x.id;
  if c is null or (select count(*) from unnest(p_cases) x(id) where x.id not in (select id from cases)) > 0 then raise exception 'Unknown case'; end if;
  if (select count(*) from battles where creator = uid and status = 'open') >= 3 then raise exception 'You already have 3 open battles'; end if;
  update profiles set balance = balance - c where id = uid and balance >= c returning username into uname;
  if not found then raise exception 'Not enough coins (this battle costs %)', c; end if;
  perform _wager(uid, c);
  insert into battles (creator, creator_name, teams, team_size, crazy, cases, cost) values (uid, uname, p_teams, p_size, coalesce(p_crazy, false), p_cases, c) returning id into bid;
  insert into battle_players (battle_id, slot, user_id, username) values (bid, 0, uid, uname);
  return bid;
end $$;

create or replace function battle_join(p_id bigint, p_slot int) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); b battles; uname text;
begin
  select * into b from battles where id = p_id for update;
  if not found or b.status <> 'open' then raise exception 'That battle is no longer open'; end if;
  if p_slot < 0 or p_slot >= b.teams * b.team_size then raise exception 'No such seat'; end if;
  if exists (select 1 from battle_players where battle_id = p_id and user_id = uid) then raise exception 'You are already in this battle'; end if;
  if exists (select 1 from battle_players where battle_id = p_id and slot = p_slot) then raise exception 'That seat is taken'; end if;
  update profiles set balance = balance - b.cost where id = uid and balance >= b.cost returning username into uname;
  if not found then raise exception 'Not enough coins (this battle costs %)', b.cost; end if;
  perform _wager(uid, b.cost);
  insert into battle_players (battle_id, slot, user_id, username) values (p_id, p_slot, uid, uname);
  return _battle_maybe_run(p_id);
end $$;

-- creator fills every empty seat with House bots and starts the battle
create or replace function battle_fill_bots(p_id bigint) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); b battles;
begin
  select * into b from battles where id = p_id for update;
  if not found or b.status <> 'open' or b.creator <> uid then raise exception 'Only the creator of an open battle can call bots'; end if;
  insert into battle_players (battle_id, slot, username, is_bot)
    select p_id, s, 'House Bot', true from generate_series(0, b.teams * b.team_size - 1) s
    where s not in (select slot from battle_players where battle_id = p_id);
  return _battle_maybe_run(p_id);
end $$;

create or replace function battle_cancel(p_id bigint) returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); b battles;
begin
  select * into b from battles where id = p_id for update;
  if not found or b.status <> 'open' or b.creator <> uid then raise exception 'That battle is no longer open'; end if;
  update profiles pr set balance = balance + b.cost from battle_players bp where bp.battle_id = p_id and not bp.is_bot and pr.id = bp.user_id;
  update battles set status = 'cancelled', finished_at = now() where id = p_id;
end $$;

-- once every seat is filled: roll every case for every seat, pick the winning team, hand out the items
create or replace function _battle_maybe_run(p_id bigint) returns jsonb language plpgsql set search_path = public as $$
declare b battles; seats int; res jsonb := '[]'; it jsonb; pl record; tot numeric[]; best numeric; wt int; winners uuid[]; got numeric[]; k int; i int; ties int[];
begin
  select * into b from battles where id = p_id;
  seats := b.teams * b.team_size;
  if (select count(*) from battle_players where battle_id = p_id) < seats then return to_jsonb(b); end if;
  tot := array_fill(0::numeric, array[b.teams]);
  for r in 1..cardinality(b.cases) loop
    for pl in select * from battle_players where battle_id = p_id order by slot loop
      it := _pick(b.cases[r]);
      res := res || jsonb_build_object('round', r, 'slot', pl.slot, 'n', it->>'n', 'fx', it->>'fx', 'v', (it->>'v')::numeric);
      tot[pl.slot / b.team_size + 1] := tot[pl.slot / b.team_size + 1] + (it->>'v')::numeric;
      if not pl.is_bot then
        insert into drops (username, name, fx, value, source, show_at) values (pl.username, it->>'n', it->>'fx', (it->>'v')::numeric, 'Case Battle', now() + make_interval(secs => cardinality(b.cases) * 3.2 + 2));
        perform _best(pl.user_id, it->>'n', it->>'fx', (it->>'v')::numeric);
      end if;
    end loop;
  end loop;
  best := case when b.crazy then (select min(x) from unnest(tot) x) else (select max(x) from unnest(tot) x) end;
  ties := array(select i2 from generate_subscripts(tot, 1) i2 where tot[i2] = best);
  wt := ties[1 + floor(random() * cardinality(ties))::int] - 1;
  -- the pot is split evenly (by value) between every seat on the winning team: each item goes to whoever has
  -- received the least so far. A House bot's share stays with the House.
  winners := array(select user_id from battle_players where battle_id = p_id and slot / b.team_size = wt order by slot);
  got := array_fill(0::numeric, array[cardinality(winners)]);
  for it in select x from jsonb_array_elements(res) x order by (x->>'v')::numeric desc loop
    k := 1; for i in 2..cardinality(winners) loop if got[i] < got[k] then k := i; end if; end loop;
    if winners[k] is not null then insert into inventory (owner, name, fx) values (winners[k], it->>'n', it->>'fx'); end if;
    got[k] := got[k] + (it->>'v')::numeric;
  end loop;
  -- items can't be cut in pieces, so anyone who got less than an equal share is topped up with coins
  for i in 1..cardinality(winners) loop
    if winners[i] is not null and got[i] < (select sum(x) from unnest(got) x) / cardinality(got) then
      update profiles set balance = balance + round((select sum(x) from unnest(got) x) / cardinality(got) - got[i], 2) where id = winners[i];
    end if;
  end loop;
  update battles set payout = (select jsonb_object_agg((wt * b.team_size + gs.n - 1)::text,
      round(greatest(got[gs.n], (select sum(x) from unnest(got) x) / cardinality(got)), 2)) from generate_series(1, cardinality(got)) gs(n)) where id = p_id;
  update battles set status = 'done', results = res, totals = to_jsonb(tot), winner_team = wt, finished_at = now() where id = p_id returning * into b;
  if (select sum(x) from unnest(tot) x) >= 1000 then
    insert into chat (username, body, show_at) values ('TCBET', 'Case battle #' || p_id || ' (' || (select string_agg(username, ', ') from battle_players where battle_id = p_id and slot / b.team_size = wt) || ') won ' || round((select sum(x) from unnest(tot) x), 2) || ' in items!', now() + make_interval(secs => cardinality(b.cases) * 3.2 + 2));
  end if;
  return to_jsonb(b);
end $$;

-- ============================================================ russian roulette
-- 6 seats, every buy-in within 10% of the creator's. One random player is knocked out per round; the last one standing takes the pile.
create or replace function rr_create(p_ids bigint[]) returns bigint language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); j jsonb; uname text; gid bigint;
begin
  if (select count(*) from roulette_games where creator = uid and status = 'open') >= 2 then raise exception 'You already have 2 open roulette tables'; end if;
  j := _claim_items(p_ids, uid, 'roulette');
  if _jsum(j) < 0.5 then raise exception 'Buy in with at least 0.50 worth of items'; end if;
  select username into uname from profiles where id = uid;
  insert into roulette_games (creator, creator_name, stake) values (uid, uname, _jsum(j)) returning id into gid;
  insert into roulette_players (game_id, slot, user_id, username, items, value) values (gid, 0, uid, uname, j, _jsum(j));
  return gid;
end $$;

create or replace function rr_join(p_id bigint, p_ids bigint[]) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); g roulette_games; j jsonb; v numeric; s int;
begin
  select * into g from roulette_games where id = p_id for update;
  if not found or g.status <> 'open' then raise exception 'That table is no longer open'; end if;
  if exists (select 1 from roulette_players where game_id = p_id and user_id = uid) then raise exception 'You are already at this table'; end if;
  j := _claim_items(p_ids, uid, 'roulette'); v := _jsum(j);
  if v < g.stake * 0.9 or v > g.stake * 1.1 then raise exception 'Your buy-in must be within 10%% of %', g.stake; end if;
  select min(x) into s from generate_series(0, g.seats - 1) x where x not in (select slot from roulette_players where game_id = p_id);
  insert into roulette_players (game_id, slot, user_id, username, items, value) values (p_id, s, uid, (select username from profiles where id = uid), j, v);
  return _rr_maybe_run(p_id);
end $$;

-- creator fills the empty seats with House bots (they stake real items) and starts the game
create or replace function rr_fill_bots(p_id bigint) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); g roulette_games; hj jsonb; s int;
begin
  select * into g from roulette_games where id = p_id for update;
  if not found or g.status <> 'open' or g.creator <> uid then raise exception 'Only the creator of an open table can call bots'; end if;
  for s in select x from generate_series(0, g.seats - 1) x where x not in (select slot from roulette_players where game_id = p_id) loop
    hj := _house_items(g.stake);
    insert into roulette_players (game_id, slot, username, is_bot, items, value) values (p_id, s, 'House Bot', true, hj, _jsum(hj));
  end loop;
  return _rr_maybe_run(p_id);
end $$;

create or replace function rr_cancel(p_id bigint) returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); g roulette_games;
begin
  select * into g from roulette_games where id = p_id for update;
  if not found or g.status <> 'open' or g.creator <> uid then raise exception 'That table is no longer open'; end if;
  update inventory set state = 'inv' where id = any(select unnest(_jids(items)) from roulette_players where game_id = p_id and not is_bot);
  update roulette_games set status = 'cancelled', finished_at = now() where id = p_id;
end $$;

create or replace function _rr_maybe_run(p_id bigint) returns jsonb language plpgsql set search_path = public as $$
declare g roulette_games; order_ int[]; w roulette_players; total_ numeric; pl roulette_players;
begin
  select * into g from roulette_games where id = p_id;
  if (select count(*) from roulette_players where game_id = p_id) < g.seats then return to_jsonb(g); end if;
  -- real Russian Roulette: each round one bullet goes in a random chamber of a 6-shot revolver, the gun passes around
  -- the table (starting after the last player knocked out) and whoever pulls the trigger on the loaded chamber is out
  declare alive int[] := array(select slot from roulette_players where game_id = p_id order by slot); turn int := floor(random() * g.seats)::int + 1;
          bullet int; pulls int[]; rounds_ jsonb := '[]'; victim int;
  begin
    order_ := '{}';
    while cardinality(alive) > 1 loop
      bullet := floor(random() * 6)::int + 1; pulls := '{}';
      for k in 1..bullet loop
        if k > 1 then turn := turn % cardinality(alive) + 1; end if;
        pulls := pulls || alive[turn];
      end loop;
      victim := alive[turn];
      rounds_ := rounds_ || jsonb_build_object('bullet', bullet, 'pulls', to_jsonb(pulls), 'out', victim);
      order_ := order_ || victim;
      alive := array_remove(alive, victim);
      if turn > cardinality(alive) then turn := 1; end if;     -- the next player after the victim starts the next round
    end loop;
    order_ := order_ || alive[1];
    update roulette_games set rounds = rounds_ where id = p_id;
  end;
  select * into w from roulette_players where game_id = p_id and slot = order_[g.seats];
  select sum(value) into total_ from roulette_players where game_id = p_id;
  for pl in select * from roulette_players where game_id = p_id and not is_bot loop perform _wager(pl.user_id, pl.value); end loop;
  if w.is_bot then
    delete from inventory where id = any(select unnest(_jids(items)) from roulette_players where game_id = p_id and not is_bot);
  else
    update inventory set owner = w.user_id, state = 'inv' where id = any(select unnest(_jids(items)) from roulette_players where game_id = p_id and not is_bot);
    insert into inventory (owner, name, fx) select w.user_id, x->>'n', x->>'fx' from roulette_players rp, jsonb_array_elements(rp.items) x where rp.game_id = p_id and rp.is_bot;
  end if;
  update roulette_games set status = 'done', eliminated = order_[1:g.seats - 1], winner_slot = w.slot, winner_name = w.username, pot = total_, finished_at = now() where id = p_id returning * into g;
  if total_ >= 500 then insert into chat (username, body, show_at) values ('TCBET', w.username || ' survived Russian Roulette #' || p_id || ' and took ' || round(total_, 2) || '!',
    now() + make_interval(secs => 2 + (select count(*) * 3.4 + coalesce(sum(jsonb_array_length(x->'pulls')), 0) * 3.0 from jsonb_array_elements((select rounds from roulette_games where id = p_id)) x))); end if;
  return to_jsonb(g);
end $$;

-- ============================================================ tipping
create or replace function tip(p_to text, p_amount numeric) returns numeric language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); me profiles; rc profiles; amt numeric := round(coalesce(p_amount, 0), 2);
begin
  select * into rc from profiles where lower(username) = lower(p_to);
  if not found then raise exception 'No player named %', p_to; end if;
  if rc.id = uid then raise exception 'You cannot tip yourself'; end if;
  if amt < 1 then raise exception 'Tips start at 1 coin'; end if;
  update profiles set balance = balance - amt where id = uid and balance >= amt returning * into me;
  if not found then raise exception 'You do not have that many coins'; end if;
  update profiles set balance = balance + amt where id = rc.id;
  insert into tips (sender, sender_name, receiver, receiver_name, amount) values (uid, me.username, rc.id, rc.username, amt);
  if amt >= 100 then insert into chat (username, body) values ('TCBET', me.username || ' tipped ' || rc.username || ' ' || amt || ' coins!'); end if;
  return me.balance;
end $$;

-- ============================================================ profile pictures
create or replace function set_avatar(p_kind text, p_value text) returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); it inventory; a text;
begin
  if p_kind = 'class' then
    if p_value not in ('Flanker','Trooper','Arsonist','Annihilator','Brute','Mechanic','Doctor','Marksman','Agent') then raise exception 'Unknown class'; end if;
    a := 'class:' || p_value;
  elsif p_kind = 'item' then
    select * into it from inventory where id = p_value::bigint and owner = uid;
    if not found then raise exception 'You can only use items you own'; end if;
    a := 'item:' || it.name || coalesce('|' || it.fx, '');
  elsif p_kind = 'none' then a := null;
  else raise exception 'Unknown avatar type'; end if;
  update profiles set avatar = a where id = uid;
  return a;
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
  trade_send(text, bigint[], bigint[], numeric), trade_respond(bigint, bool), trade_cancel(bigint), chat_send(text),
  claim_rakeback(), open_level_crate(), tip(text, numeric), set_avatar(text, text),
  battle_create(text[], int, int, bool), battle_join(bigint, int), battle_fill_bots(bigint), battle_cancel(bigint),
  rr_create(bigint[]), rr_join(bigint, bigint[]), rr_fill_bots(bigint), rr_cancel(bigint) to authenticated;
grant execute on function level_of(numeric), rake_rate(int, text), is_vip(text) to anon, authenticated;

do $$ declare t text; begin
  foreach t in array array['chat','drops','coinflips','jackpot_rounds','jackpot_entries','trades','tips','battles','battle_players','roulette_games','roulette_players'] loop
    begin execute format('alter publication supabase_realtime add table %I', t); exception when duplicate_object then null; end;
  end loop;
end $$;

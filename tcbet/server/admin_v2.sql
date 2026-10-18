-- Admin v2 (admins have no limits + item spawner + overview) and Limbo. Safe to run more than once.

-- admins/owners skip limits (bets, case counts, battle size, item counts, trades)
create or replace function _is_admin(p_uid uuid) returns bool language sql stable security definer set search_path = public as $$
  select coalesce((select rank in ('admin', 'owner') from profiles where id = p_uid), false) $$;

create or replace function _claim_items(p_ids bigint[], p_uid uuid, p_state text) returns jsonb language plpgsql set search_path = public as $$
declare ids bigint[] := array(select distinct unnest(p_ids)); j jsonb; n int;
begin
  if cardinality(ids) = 0 then raise exception 'Select at least one item'; end if;
  if cardinality(ids) > 40 and not (_is_admin(p_uid) and cardinality(ids) <= 1000) then raise exception 'Max 40 items at once'; end if;
  perform 1 from inventory where id = any(ids) for update;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'n', name, 'fx', fx, 'v', item_value(name, fx)) order by item_value(name, fx) desc), '[]'), count(*)
    into j, n from inventory where id = any(ids) and owner = p_uid and state = 'inv';
  if n <> cardinality(ids) then raise exception 'Some of those items are no longer in your inventory'; end if;
  update inventory set state = p_state where id = any(ids);
  return j;
end $$;

create or replace function open_case(p_case text, p_qty int) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); c cases; uname text; res jsonb := '[]';
begin
  if p_qty < 1 or (p_qty > 5 and not (_is_admin(uid) and p_qty <= 100)) then raise exception 'Open 1 to 5 at a time'; end if;
  select * into c from cases where id = p_case; if not found then raise exception 'Unknown case'; end if;
  update profiles set balance = balance - c.price * p_qty, opened = opened + p_qty where id = uid and balance >= c.price * p_qty returning username into uname;
  if not found then raise exception 'Not enough coins'; end if;
  perform _wager(uid, c.price * p_qty);
  for i in 1..p_qty loop res := res || _roll_case(p_case, uid, uname, c.name); end loop;
  return jsonb_build_object('items', res, 'balance', (select balance from profiles where id = uid));
end $$;

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
  if (cardinality(coalesce(p_give, '{}')) > 40 or cardinality(coalesce(p_get, '{}')) > 40) and not _is_admin(uid) then raise exception 'Max 40 items per side'; end if;
  if (select count(*) from trades where sender = uid and status = 'pending') >= 10 and not _is_admin(uid) then raise exception 'You have 10 pending offers already'; end if;
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

create or replace function battle_create(p_cases text[], p_teams int, p_size int, p_crazy bool) returns bigint language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); uname text; c numeric; bid bigint;
begin
  if (p_teams, p_size) not in ((2,1), (3,1), (2,2), (2,3), (3,3)) then raise exception 'Pick 1v1, 1v1v1, 2v2, 3v3 or 3v3v3'; end if;
  if cardinality(p_cases) < 1 or (cardinality(p_cases) > 30 and not (_is_admin(_uid()) and cardinality(p_cases) <= 500)) then raise exception 'Battles have 1 to 30 cases'; end if;
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

create or replace function bj_start(p_bet numeric) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); bet numeric := round(coalesce(p_bet, 0), 2); d int[]; h blackjack_hands;
begin
  if exists (select 1 from blackjack_hands where user_id = uid and status = 'playing') then raise exception 'Finish your current hand first'; end if;
  if bet < 1 then raise exception 'The minimum bet is 1 coin'; end if;
  if bet > 25000000 and not (_is_admin(uid) and bet <= 1000000000) then raise exception 'The maximum blackjack bet is 25,000,000 coins'; end if;
  update profiles set balance = balance - bet where id = uid and balance >= bet;
  if not found then raise exception 'Not enough coins'; end if;
  perform _wager(uid, bet);
  d := array(select c from generate_series(0, 51) c order by random());
  insert into blackjack_hands (user_id, bet, deck, player, dealer) values (uid, bet, d[5:], array[d[1], d[3]], array[d[2], d[4]]) returning * into h;
  if _bj_total(h.player) = 21 or _bj_total(h.dealer) = 21 then h := _bj_finish(h.id); end if;   -- naturals end the hand right away
  return _bj_view(h);
end $$;

create or replace function bj_start_items(p_ids bigint[]) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); j jsonb; bet numeric; d int[]; h blackjack_hands;
begin
  if exists (select 1 from blackjack_hands where user_id = uid and status = 'playing') then raise exception 'Finish your current hand first'; end if;
  j := _claim_items(p_ids, uid, 'blackjack'); bet := _jsum(j);
  if bet < 1 then raise exception 'Bet at least 1 coin worth of items'; end if;
  if bet > 25000000 and not (_is_admin(uid) and bet <= 1000000000) then raise exception 'The maximum blackjack bet is 25,000,000 coins worth of items'; end if;
  perform _wager(uid, bet);
  d := array(select c from generate_series(0, 51) c order by random());
  insert into blackjack_hands (user_id, bet, items, deck, player, dealer) values (uid, bet, j, d[5:], array[d[1], d[3]], array[d[2], d[4]]) returning * into h;
  if _bj_total(h.player) = 21 or _bj_total(h.dealer) = 21 then h := _bj_finish(h.id); end if;
  return _bj_view(h);
end $$;

create or replace function keno_play(p_picks int[], p_bet numeric, p_risk text default 'classic') returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); bet numeric := round(coalesce(p_bet, 0), 2); picks int[] := array(select distinct unnest(p_picks) order by 1);
        d int[]; h int; m numeric; pay numeric; bal numeric; uname text;
begin
  if cardinality(picks) not between 1 and 10 or exists (select 1 from unnest(picks) x where x not between 1 and 40) then raise exception 'Pick 1 to 10 numbers from 1 to 40'; end if;
  if p_risk not in ('classic', 'low', 'medium', 'high') then raise exception 'Unknown risk level'; end if;
  if bet < 1 then raise exception 'The minimum bet is 1 coin'; end if;
  if bet > 25000000 and not (_is_admin(uid) and bet <= 1000000000) then raise exception 'The maximum keno bet is 25,000,000 coins'; end if;
  update profiles set balance = balance - bet where id = uid and balance >= bet returning username into uname;
  if not found then raise exception 'Not enough coins'; end if;
  perform _wager(uid, bet);
  d := array(select x from generate_series(1, 40) x order by random() limit 10);
  h := (select count(*) from unnest(d) x where x = any(picks));
  m := (keno_paytable() -> p_risk -> cardinality(picks)::text ->> h)::numeric;
  pay := least(round(bet * m, 2), 900000000000);
  update profiles set balance = balance + pay where id = uid returning balance into bal;
  insert into keno_rounds (user_id, bet, picks, draw, hits, multiplier, payout) values (uid, bet, picks, d, h, m, pay);
  if pay - bet >= 5000 then insert into chat (username, body, show_at) values ('TCBET', uname || ' hit ' || h || '/' || cardinality(picks) || ' at Keno for ' || round(pay) || ' coins (' || m || 'x)!', now() + interval '5 seconds'); end if;
  return jsonb_build_object('draw', to_jsonb(d), 'picks', to_jsonb(picks), 'hits', h, 'multiplier', m, 'payout', pay, 'bet', bet, 'balance', bal, 'risk', p_risk);
end $$;

create or replace function plinko_play(p_bet numeric, p_rows int, p_risk text) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); bet numeric := round(coalesce(p_bet, 0), 2); path int[]; k int; m numeric; pay numeric; bal numeric; uname text;
        cnt int; total_ numeric; mega bool := false;
begin
  if p_rows not in (8, 12, 16) then raise exception 'Pick 8, 12 or 16 rows'; end if;
  if p_risk not in ('low', 'medium', 'high') then raise exception 'Unknown risk level'; end if;
  if bet < 1 then raise exception 'The minimum bet is 1 coin'; end if;
  if bet > 25000000 and not (_is_admin(uid) and bet <= 1000000000) then raise exception 'The maximum plinko bet is 25,000,000 coins'; end if;
  update profiles set balance = balance - bet, plinko_count = plinko_count + 1, plinko_sum = plinko_sum + bet
    where id = uid and balance >= bet returning username, plinko_count, plinko_sum into uname, cnt, total_;
  if not found then raise exception 'Not enough coins'; end if;
  perform _wager(uid, bet);
  if cnt >= 100 then
    mega := true;
    k := case when random() < .5 then 0 else p_rows end;                             -- an outer slot
    path := array(select (k > 0)::int from generate_series(1, p_rows));
    m := 999;
    pay := round(least(bet, total_ / cnt) * 999, 2);
    update profiles set plinko_count = 0, plinko_sum = 0 where id = uid;
    cnt := 0;
  else
    path := array(select (random() < .5)::int from generate_series(1, p_rows));   -- 1 = bounce right
    k := (select sum(x) from unnest(path) x);
    m := (plinko_paytable() -> p_rows::text -> p_risk ->> k)::numeric;
    pay := round(bet * m, 2);
  end if;
  update profiles set balance = balance + pay where id = uid returning balance into bal;
  insert into plinko_rounds (user_id, bet, rows, risk, path, slot, multiplier, payout, mega) values (uid, bet, p_rows, p_risk, path, k, m, pay, mega);
  if mega then insert into chat (username, body, show_at) values ('TCBET', '💥 ' || uname || ' hit the MEGA BALL at Plinko: 999x for ' || to_char(pay, 'FM999,999,999,990') || ' coins!', now() + interval '9 seconds');
  elsif pay - bet >= 5000 then insert into chat (username, body, show_at) values ('TCBET', uname || ' hit ' || m || 'x at Plinko for ' || round(pay) || ' coins!', now() + interval '4 seconds'); end if;
  return jsonb_build_object('path', to_jsonb(path), 'slot', k, 'multiplier', m, 'payout', pay, 'bet', bet, 'balance', bal, 'rows', p_rows, 'risk', p_risk, 'mega', mega, 'count', cnt);
end $$;

create or replace function wheel_spin(p_bets jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); b jsonb; t text; n int; a numeric; tot numeric := 0; pay numeric := 0; r int; bal numeric; uname text;
        reds int[] := array[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]; win bool;
begin
  if jsonb_typeof(p_bets) <> 'array' or jsonb_array_length(p_bets) = 0 or jsonb_array_length(p_bets) > 80 then raise exception 'Place some bets first'; end if;
  for b in select * from jsonb_array_elements(p_bets) loop
    t := b->>'t'; a := round((b->>'a')::numeric, 2);
    if a is null or a <= 0 then raise exception 'Bad bet amount'; end if;
    if t = 'n' then n := (b->>'n')::int; if n is null or n not between 0 and 36 then raise exception 'Bad number'; end if;
    elsif t not in ('red','black','even','odd','low','high','d1','d2','d3','c1','c2','c3') then raise exception 'Unknown bet'; end if;
    tot := tot + a;
  end loop;
  if tot < 1 then raise exception 'The minimum total bet is 1 coin'; end if;
  if tot > 25000000 and not (_is_admin(uid) and tot <= 1000000000) then raise exception 'The maximum total bet is 25,000,000 coins'; end if;
  update profiles set balance = balance - tot where id = uid and balance >= tot returning username into uname;
  if not found then raise exception 'Not enough coins'; end if;
  perform _wager(uid, tot);
  r := floor(random() * 37)::int;
  for b in select * from jsonb_array_elements(p_bets) loop
    t := b->>'t'; a := round((b->>'a')::numeric, 2);
    win := case t when 'n' then (b->>'n')::int = r
      when 'red' then r = any(reds) when 'black' then r > 0 and not r = any(reds)
      when 'even' then r > 0 and r % 2 = 0 when 'odd' then r % 2 = 1
      when 'low' then r between 1 and 18 when 'high' then r between 19 and 36
      when 'd1' then r between 1 and 12 when 'd2' then r between 13 and 24 when 'd3' then r between 25 and 36
      when 'c1' then r > 0 and r % 3 = 1 when 'c2' then r > 0 and r % 3 = 2 when 'c3' then r > 0 and r % 3 = 0 end;
    if win then pay := pay + a * case when t = 'n' then 36 when t in ('d1','d2','d3','c1','c2','c3') then 3 else 2 end; end if;
  end loop;
  update profiles set balance = balance + pay where id = uid returning balance into bal;
  insert into wheel_spins (user_id, bets, result, wagered, payout) values (uid, p_bets, r, tot, pay);
  if pay - tot >= 5000 then insert into chat (username, body, show_at) values ('TCBET', uname || ' hit ' || r || ' at Roulette and won ' || round(pay - tot) || ' coins!', now() + interval '6 seconds'); end if;
  return jsonb_build_object('result', r, 'payout', pay, 'wagered', tot, 'balance', bal);
end $$;

create or replace function admin_spawn_coins(p_amount numeric) returns numeric language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); me profiles; amt numeric := round(coalesce(p_amount, 0), 2);
begin
  select * into me from profiles where id = uid;
  if me.rank not in ('admin', 'owner') then raise exception 'Admins only'; end if;
  if amt < 1 or amt > 1000000000 then raise exception 'Spawn between 1 and 1,000,000,000 coins at a time'; end if;
  update profiles set balance = balance + amt where id = uid returning * into me;
  insert into admin_log (user_id, username, amount, kind, detail) values (uid, me.username, amt, 'coins', null);
  insert into chat (username, body) values ('TCBET', me.username || ' spawned ' || to_char(amt, 'FM999,999,990') || ' coins (admin)');
  return me.balance;
end $$;

-- ============================================================ admin tools: spawn items, site overview (rank admin/owner, all logged + announced)
alter table admin_log add column if not exists kind text not null default 'coins';
alter table admin_log add column if not exists detail text;

create or replace function admin_spawn_items(p_name text, p_fx text, p_qty int) returns int language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); me profiles; fx text := nullif(trim(coalesce(p_fx, '')), ''); v numeric;
begin
  select * into me from profiles where id = uid;
  if not _is_admin(uid) then raise exception 'Admins only'; end if;
  if p_qty is null or p_qty < 1 or p_qty > 1000 then raise exception 'Spawn 1 to 1,000 items at a time'; end if;
  v := item_value(p_name, fx);
  if v is null then raise exception 'That item/effect combo does not exist (effects must match the hat''s seasons)'; end if;
  insert into inventory (owner, name, fx) select uid, p_name, fx from generate_series(1, p_qty);
  insert into admin_log (user_id, username, amount, kind, detail) values (uid, me.username, v * p_qty, 'items', p_qty || 'x ' || coalesce(fx || ' ', '') || p_name);
  insert into chat (username, body) values ('TCBET', me.username || ' spawned ' || p_qty || 'x ' || coalesce(fx || ' ', '') || p_name || ' (admin)');
  return p_qty;
end $$;

create or replace function admin_overview() returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not _is_admin(_uid()) then raise exception 'Admins only'; end if;
  return jsonb_build_object(
    'players', (select count(*) from profiles),
    'coins', (select coalesce(sum(balance), 0) from profiles),
    'items', (select count(*) from inventory where state = 'inv'),
    'wagered', (select coalesce(sum(xp), 0) from profiles),
    'richest', (select coalesce(jsonb_agg(x), '[]') from (select username, balance from profiles order by balance desc limit 5) x),
    'log', (select coalesce(jsonb_agg(x), '[]') from (select username, kind, amount, detail, created_at from admin_log order by id desc limit 25) x));
end $$;

revoke execute on function admin_spawn_items(text, text, int), admin_overview(), _is_admin(uuid) from public, anon;
grant execute on function admin_spawn_items(text, text, int), admin_overview() to authenticated;

-- ============================================================ limbo (coins): pick a target multiplier, win bet x target if the roll reaches it (1% edge)
create table if not exists limbo_rounds (id bigint generated always as identity primary key, user_id uuid not null, bet numeric(14,2) not null,
  target numeric not null, result numeric not null, payout numeric(14,2) not null, created_at timestamptz not null default now());
alter table limbo_rounds enable row level security;
drop policy if exists read_own on limbo_rounds;
create policy read_own on limbo_rounds for select using (auth.uid() = user_id);

create or replace function limbo_play(p_bet numeric, p_target numeric) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); bet numeric := round(coalesce(p_bet, 0), 2); t numeric := round(coalesce(p_target, 0), 2); res numeric; pay numeric := 0; bal numeric; uname text;
begin
  if t < 1.01 or t > 1000000 then raise exception 'Target must be between 1.01x and 1,000,000x'; end if;
  if bet < 1 then raise exception 'The minimum bet is 1 coin'; end if;
  if bet > 25000000 and not (_is_admin(uid) and bet <= 1000000000) then raise exception 'The maximum limbo bet is 25,000,000 coins'; end if;
  if bet * t > 900000000000 then raise exception 'That win would be too big. Lower the bet or the target'; end if;
  update profiles set balance = balance - bet where id = uid and balance >= bet returning username into uname;
  if not found then raise exception 'Not enough coins'; end if;
  perform _wager(uid, bet);
  -- P(result >= t) = 0.99 / t
  res := least(1000000, greatest(1, floor(99 / (1 - random())) / 100));
  if res >= t then pay := round(bet * t, 2); end if;
  update profiles set balance = balance + pay where id = uid returning balance into bal;
  insert into limbo_rounds (user_id, bet, target, result, payout) values (uid, bet, t, res, pay);
  if pay - bet >= 5000 then insert into chat (username, body, show_at) values ('TCBET', uname || ' hit ' || t || 'x at Limbo for ' || round(pay) || ' coins!', now() + interval '2 seconds'); end if;
  return jsonb_build_object('result', res, 'target', t, 'win', pay > 0, 'payout', pay, 'bet', bet, 'balance', bal);
end $$;

revoke execute on function limbo_play(numeric, numeric) from public, anon;
grant execute on function limbo_play(numeric, numeric) to authenticated;

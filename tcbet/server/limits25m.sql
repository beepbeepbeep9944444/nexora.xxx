-- All coin game limits -> 25,000,000 (blackjack coins/items, keno, roulette)

create or replace function bj_start(p_bet numeric) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); bet numeric := round(coalesce(p_bet, 0), 2); d int[]; h blackjack_hands;
begin
  if exists (select 1 from blackjack_hands where user_id = uid and status = 'playing') then raise exception 'Finish your current hand first'; end if;
  if bet < 1 then raise exception 'The minimum bet is 1 coin'; end if;
  if bet > 25000000 then raise exception 'The maximum blackjack bet is 25,000,000 coins'; end if;
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
  if bet > 25000000 then raise exception 'The maximum blackjack bet is 25,000,000 coins worth of items'; end if;
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
  if bet > 25000000 then raise exception 'The maximum keno bet is 25,000,000 coins'; end if;
  update profiles set balance = balance - bet where id = uid and balance >= bet returning username into uname;
  if not found then raise exception 'Not enough coins'; end if;
  perform _wager(uid, bet);
  d := array(select x from generate_series(1, 40) x order by random() limit 10);
  h := (select count(*) from unnest(d) x where x = any(picks));
  m := (keno_paytable() -> p_risk -> cardinality(picks)::text ->> h)::numeric;
  pay := least(round(bet * m, 2), 1000000000);
  update profiles set balance = balance + pay where id = uid returning balance into bal;
  insert into keno_rounds (user_id, bet, picks, draw, hits, multiplier, payout) values (uid, bet, picks, d, h, m, pay);
  if pay - bet >= 5000 then insert into chat (username, body, show_at) values ('TCBET', uname || ' hit ' || h || '/' || cardinality(picks) || ' at Keno for ' || round(pay) || ' coins (' || m || 'x)!', now() + interval '5 seconds'); end if;
  return jsonb_build_object('draw', to_jsonb(d), 'picks', to_jsonb(picks), 'hits', h, 'multiplier', m, 'payout', pay, 'bet', bet, 'balance', bal, 'risk', p_risk);
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
  if tot > 25000000 then raise exception 'The maximum total bet is 25,000,000 coins'; end if;
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

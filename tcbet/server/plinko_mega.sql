-- Plinko MEGA ball: every 100th ball per player pays 999x
-- every 100th plinko ball per player is a guaranteed MEGA ball: 999x the player's average bet over those 100 balls
-- (capped at that ball's own bet, so betting 1 coin 99 times and max on the 100th doesn't work)
alter table profiles add column if not exists plinko_count int not null default 0;
alter table profiles add column if not exists plinko_sum numeric(16,2) not null default 0;
alter table plinko_rounds add column if not exists mega bool not null default false;
create or replace function plinko_play(p_bet numeric, p_rows int, p_risk text) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); bet numeric := round(coalesce(p_bet, 0), 2); path int[]; k int; m numeric; pay numeric; bal numeric; uname text;
        cnt int; total_ numeric; mega bool := false;
begin
  if p_rows not in (8, 12, 16) then raise exception 'Pick 8, 12 or 16 rows'; end if;
  if p_risk not in ('low', 'medium', 'high') then raise exception 'Unknown risk level'; end if;
  if bet < 1 then raise exception 'The minimum bet is 1 coin'; end if;
  if bet > 25000000 then raise exception 'The maximum plinko bet is 25,000,000 coins'; end if;
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

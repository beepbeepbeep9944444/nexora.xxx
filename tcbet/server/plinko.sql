-- Plinko + better keno odds (~98% return). Safe to run more than once.

create or replace function keno_paytable() returns jsonb language sql immutable as $$ select '{"classic": {"1": [0.0, 3.92], "2": [0.0, 1.47, 7.16], "3": [0.0, 0.0, 4.33, 32.0], "4": [0.0, 0.0, 2.08, 8.51, 87.2], "5": [0.0, 0.0, 0.0, 5.97, 34.0, 473.0], "6": [0.0, 0.0, 0.0, 3.11, 12.4, 96.4, 1813.0], "7": [0.0, 0.0, 0.0, 0.0, 9.85, 52.9, 552.0, 5000], "8": [0.0, 0.0, 0.0, 0.0, 5.26, 21.7, 158.0, 2238.0, 10000], "9": [0.0, 0.0, 0.0, 0.0, 0.0, 17.8, 101.0, 999.0, 5000, 10000], "10": [0.0, 0.0, 0.0, 0.0, 0.0, 9.49, 42.3, 322.0, 4492.0, 5000, 10000]}, "low": {"1": [0.0, 3.92], "2": [0.0, 1.77, 5.2], "3": [0.0, 1.24, 2.37, 9.08], "4": [0.0, 1.02, 1.55, 3.82, 18.6], "5": [0.0, 0.93, 1.14, 2.38, 7.45, 43.4], "6": [0.0, 0.0, 1.45, 2.48, 6.09, 23.7, 173.0], "7": [0.0, 0.0, 1.17, 1.8, 3.71, 11.7, 55.2, 486.0], "8": [0.0, 0.0, 1.05, 1.36, 2.51, 6.6, 25.1, 148.0, 1000], "9": [0.0, 0.0, 0.0, 1.66, 2.81, 6.23, 19.7, 90.4, 679.0, 1000], "10": [0.0, 0.0, 0.0, 1.36, 2.09, 4.07, 11.5, 42.8, 253.0, 1000, 1000]}, "medium": {"1": [0.0, 3.92], "2": [0.0, 1.37, 7.82], "3": [0.0, 0.0, 4.04, 35.2], "4": [0.0, 0.0, 1.86, 8.46, 108.0], "5": [0.0, 0.0, 0.0, 5.18, 34.2, 629.0], "6": [0.0, 0.0, 0.0, 2.6, 11.5, 112.0, 2838.0], "7": [0.0, 0.0, 0.0, 0.0, 8.3, 51.9, 684.0, 10000], "8": [0.0, 0.0, 0.0, 0.0, 4.34, 20.7, 183.0, 3357.0, 10000], "9": [0.0, 0.0, 0.0, 0.0, 0.0, 15.5, 98.2, 1218.0, 10000, 10000], "10": [0.0, 0.0, 0.0, 0.0, 0.0, 7.85, 40.3, 374.0, 6753.0, 10000, 10000]}, "high": {"1": [0.0, 3.92], "2": [0.0, 0.0, 17.0], "3": [0.0, 0.0, 3.11, 45.7], "4": [0.0, 0.0, 0.0, 10.4, 248.0], "5": [0.0, 0.0, 0.0, 3.1, 32.1, 1114.0], "6": [0.0, 0.0, 0.0, 0.0, 10.0, 155.0, 7989.0], "7": [0.0, 0.0, 0.0, 0.0, 0.0, 48.2, 1109.0, 50000], "8": [0.0, 0.0, 0.0, 0.0, 0.0, 17.6, 253.0, 8894.0, 50000], "9": [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 101.0, 2179.0, 50000, 50000], "10": [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 35.1, 530.0, 18172.0, 50000, 50000]}}'::jsonb $$;

-- ============================================================ plinko (coins): 8/12/16 rows, low/medium/high risk, ~98% return
create table if not exists plinko_rounds (id bigint generated always as identity primary key, user_id uuid not null, bet numeric(14,2) not null,
  rows int not null, risk text not null, path int[] not null, slot int not null, multiplier numeric not null, payout numeric(14,2) not null, created_at timestamptz not null default now());
alter table plinko_rounds enable row level security;
drop policy if exists read_own on plinko_rounds;
create policy read_own on plinko_rounds for select using (auth.uid() = user_id);

-- multiplier by [rows][risk][slot]
create or replace function plinko_paytable() returns jsonb language sql immutable as $$ select '{"8": {"low": [5.54, 2.08, 1.09, 0.99, 0.5, 0.99, 1.09, 2.08, 5.54], "medium": [12.9, 2.97, 1.29, 0.69, 0.4, 0.69, 1.29, 2.97, 12.9], "high": [28.7, 3.96, 1.48, 0.3, 0.2, 0.3, 1.48, 3.96, 28.7]}, "12": {"low": [9.9, 2.97, 1.58, 1.39, 1.09, 0.99, 0.5, 0.99, 1.09, 1.39, 1.58, 2.97, 9.9], "medium": [32.7, 10.9, 3.96, 1.98, 1.09, 0.59, 0.3, 0.59, 1.09, 1.98, 3.96, 10.9, 32.7], "high": [168.0, 23.7, 8.01, 1.98, 0.69, 0.2, 0.2, 0.2, 0.69, 1.98, 8.01, 23.7, 168.0]}, "16": {"low": [15.8, 8.91, 1.98, 1.39, 1.39, 1.19, 1.09, 0.99, 0.49, 0.99, 1.09, 1.19, 1.39, 1.39, 1.98, 8.91, 15.8], "medium": [109.0, 40.6, 9.9, 4.95, 2.97, 1.49, 0.99, 0.5, 0.3, 0.5, 0.99, 1.49, 2.97, 4.95, 9.9, 40.6, 109.0], "high": [990.0, 129.0, 25.7, 8.91, 3.96, 1.98, 0.2, 0.2, 0.2, 0.2, 0.2, 1.98, 3.96, 8.91, 25.7, 129.0, 990.0]}}'::jsonb $$;

create or replace function plinko_play(p_bet numeric, p_rows int, p_risk text) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); bet numeric := round(coalesce(p_bet, 0), 2); path int[]; k int; m numeric; pay numeric; bal numeric; uname text;
begin
  if p_rows not in (8, 12, 16) then raise exception 'Pick 8, 12 or 16 rows'; end if;
  if p_risk not in ('low', 'medium', 'high') then raise exception 'Unknown risk level'; end if;
  if bet < 1 then raise exception 'The minimum bet is 1 coin'; end if;
  if bet > 25000000 then raise exception 'The maximum plinko bet is 25,000,000 coins'; end if;
  update profiles set balance = balance - bet where id = uid and balance >= bet returning username into uname;
  if not found then raise exception 'Not enough coins'; end if;
  perform _wager(uid, bet);
  path := array(select (random() < .5)::int from generate_series(1, p_rows));   -- 1 = bounce right
  k := (select sum(x) from unnest(path) x);
  m := (plinko_paytable() -> p_rows::text -> p_risk ->> k)::numeric;
  pay := round(bet * m, 2);
  update profiles set balance = balance + pay where id = uid returning balance into bal;
  insert into plinko_rounds (user_id, bet, rows, risk, path, slot, multiplier, payout) values (uid, bet, p_rows, p_risk, path, k, m, pay);
  if pay - bet >= 5000 then insert into chat (username, body, show_at) values ('TCBET', uname || ' hit ' || m || 'x at Plinko for ' || round(pay) || ' coins!', now() + interval '4 seconds'); end if;
  return jsonb_build_object('path', to_jsonb(path), 'slot', k, 'multiplier', m, 'payout', pay, 'bet', bet, 'balance', bal, 'rows', p_rows, 'risk', p_risk);
end $$;

revoke execute on function plinko_play(numeric, int, text) from public, anon;
grant execute on function plinko_play(numeric, int, text) to authenticated;
grant execute on function plinko_paytable(), keno_paytable() to anon, authenticated;

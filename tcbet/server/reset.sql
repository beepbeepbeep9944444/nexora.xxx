-- ONE-TIME ECONOMY RESET. This cannot be undone.
-- Wipes every inventory, open game, trade, tip and drop, and puts every player back at 1,000 coins with
-- 4 fresh starter items and level 1. Ranks (VIP / owner), usernames, passwords, avatars and chat are kept.
begin;
delete from inventory;
delete from coinflips;
delete from jackpot_entries; delete from jackpot_rounds;
delete from battle_players;  delete from battles;
delete from roulette_players; delete from roulette_games;
delete from trades;
delete from tips;
delete from drops;
update profiles set balance = 1000, xp = 0, rakeback = 0, crates_claimed = 0, opened = 0, daily_at = null,
  best_name = null, best_fx = null, best_value = 0,
  avatar = case when avatar like 'item:%' then null else avatar end;      -- item pictures pointed at items that no longer exist
insert into inventory (owner, name)
  select p.id, c.name from profiles p
  cross join lateral (select name from catalog where not weapon and v < 1.5 and p.id is not null order by random() limit 4) c;
insert into chat (username, body) values ('TCBET', 'The economy has been reset! Everyone starts fresh with 1,000 coins. Good luck!');
commit;
select username, rank, balance, (select count(*) from inventory i where i.owner = p.id) items from profiles p order by rank desc, username;

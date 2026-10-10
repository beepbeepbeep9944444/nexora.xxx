-- Change the name in quotes, then Run. Ranks: 'player', 'vip', 'owner' (owner gets VIP perks + an OWNER tag).

-- Make a player VIP:
update profiles set rank = 'vip' where lower(username) = lower('NAME') returning username, rank;

-- Owner tag:
-- update profiles set rank = 'owner' where lower(username) = lower('arkko') returning username, rank;

-- Back to a normal player:
-- update profiles set rank = 'player' where lower(username) = lower('NAME') returning username, rank;

-- Give coins:
-- update profiles set balance = balance + 1000 where lower(username) = lower('NAME') returning username, balance;

-- See every VIP / owner:
-- select username, rank, balance from profiles where rank <> 'player' order by rank, username;

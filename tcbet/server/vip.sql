-- Make a player VIP: change the name in quotes, then Run.
update profiles set rank = 'vip' where lower(username) = lower('arkko') returning username, rank;

-- Remove VIP again:
-- update profiles set rank = 'player' where lower(username) = lower('arkko') returning username, rank;

-- See every VIP:
-- select username, balance, created_at from profiles where rank = 'vip' order by username;

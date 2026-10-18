-- Give or remove the admin rank. Admins get an "Admin" button to spawn up to 5,000,000 coins per click
-- (announced in chat, logged in admin_log) plus VIP perks and a blue ADMIN tag.
update profiles set rank = 'admin' where lower(username) in ('crypto', 'imafatpiggy', 'arkko') returning username, rank;
-- remove:  update profiles set rank = 'vip' where lower(username) = lower('NAME') returning username, rank;
-- history: select username, amount, created_at from admin_log order by id desc;

-- Rename a player. Change old_name / new_name, then Run.
-- They keep their password and log in with the new name. Old chat, drops, games, trades and tips are updated too.
do $$
declare
  old_name text := 'nigger';
  new_name text := 'ImAFatPiggy';
  uid uuid;
begin
  if new_name !~ '^[A-Za-z0-9_]{3,20}$' then raise exception 'New name must be 3-20 letters, numbers or _'; end if;
  select id into uid from profiles where lower(username) = lower(old_name);
  if uid is null then raise exception 'No player named %', old_name; end if;
  if exists (select 1 from profiles where lower(username) = lower(new_name) and id <> uid) then raise exception '% is already taken', new_name; end if;
  old_name := (select username from profiles where id = uid);   -- exact stored spelling

  -- login: TCBET signs in with tcbet.<username>@nexora.xxx behind the scenes
  update auth.users set email = 'tcbet.' || lower(new_name) || '@nexora.xxx',
    raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('username', new_name) where id = uid;
  update auth.identities set identity_data = identity_data || jsonb_build_object('email', 'tcbet.' || lower(new_name) || '@nexora.xxx')
    where user_id = uid and provider = 'email';

  update profiles set username = new_name where id = uid;
  update chat set username = new_name where username = old_name;
  update chat set body = replace(body, old_name, new_name) where username = 'TCBET' and position(old_name in body) > 0;
  update drops set username = new_name where username = old_name;
  update coinflips set creator_name = new_name where creator = uid;
  update coinflips set joiner_name = new_name where joiner = uid;
  update jackpot_entries set username = new_name where user_id = uid;
  update jackpot_rounds set winner_name = new_name where winner = uid;
  update battles set creator_name = new_name where creator = uid;
  update battle_players set username = new_name where user_id = uid;
  update roulette_games set creator_name = new_name where creator = uid;
  update roulette_games set winner_name = new_name where winner_name = old_name;
  update roulette_players set username = new_name where user_id = uid;
  update trades set sender_name = new_name where sender = uid;
  update trades set receiver_name = new_name where receiver = uid;
  update tips set sender_name = new_name where sender = uid;
  update tips set receiver_name = new_name where receiver = uid;
  raise notice 'Renamed % to %', old_name, new_name;
end $$;

select username, rank, balance from profiles where lower(username) = lower('ImAFatPiggy');

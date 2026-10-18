-- Chat moderation + no chat announcements: slur filter + AutoMod strikes, mute/delete/purge tools, blocked usernames. Safe to run more than once.

-- ============================================================ chat moderation: slur filter (shared by chat + usernames)
alter table profiles add column if not exists muted_until timestamptz;
alter table profiles add column if not exists mute_reason text;
alter table profiles add column if not exists chat_strikes int not null default 0;
create table if not exists chat_filter (word text primary key,
  norm text generated always as (regexp_replace(regexp_replace(translate(lower(word), '013457@$!|', 'oieastasii'), '[^a-z]', '', 'g'), '(.)\1+', '\1', 'g')) stored);
alter table chat_filter enable row level security;                       -- no policies: only server functions read it
create table if not exists mod_log (id bigint generated always as identity primary key, admin text, action text not null, target text, detail text, created_at timestamptz not null default now());
alter table mod_log enable row level security;
insert into chat_filter (word) values ('nigger'), ('nigga'), ('niggah'), ('nig'), ('sandnigger'), ('faggot'), ('fag'), ('retard'), ('tranny'), ('kike'), ('spic'), ('chink'), ('gook'), ('wetback'), ('beaner'), ('dyke'), ('paki'), ('raghead'), ('towelhead'), ('kys') on conflict do nothing;

-- returns the banned word found in p_text, or null. Sees through leetspeak (n1gg3r), spacing (n i g g e r),
-- symbols (n_i.g) and stretched letters (niiigggger), but matches whole words so "Nigeria"/"conspicuous" are fine.
create or replace function _chat_blocked(p_text text) returns text language plpgsql stable security definer set search_path = public as $$
declare toks text[]; w text; buf text := ''; arr text[] := '{}'; hit text;
begin
  toks := regexp_split_to_array(translate(lower(coalesce(p_text, '')), '013457@$!|', 'oieastasii'), '\s+');
  foreach w in array toks loop
    w := regexp_replace(w, '[^a-z]', '', 'g');
    if length(w) = 1 then buf := buf || w;                                  -- glue "n i g g a" back together
    else
      if length(buf) > 1 then arr := arr || buf; end if; buf := '';
      if length(w) > 0 then arr := arr || w; end if;
    end if;
  end loop;
  if length(buf) > 1 then arr := arr || buf; end if;
  foreach w in array arr loop
    w := regexp_replace(w, '(.)\1+', '\1', 'g');
    select f.word into hit from chat_filter f
      where w = f.norm or (w like f.norm || '%' and substr(w, length(f.norm) + 1) in ('s', 'z', 'a', 'as', 'az', 'ah', 'er', 'ers', 'ed', 'ing', 'ies', 'o', 'os', 'ish'))
      limit 1;
    if hit is not null then return hit; end if;
  end loop;
  return null;
end $$;

create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare uname text := new.raw_user_meta_data->>'username';
begin
  if uname is null or uname !~ '^[A-Za-z0-9_]{3,20}$' then raise exception 'Username must be 3-20 letters, numbers or _'; end if;
  if lower(uname) in ('house', 'tcbet', 'admin', 'administrator', 'owner', 'moderator', 'mod', 'staff', 'support', 'system', 'official') or _chat_blocked(uname) is not null or _chat_blocked(regexp_replace(uname, '_', ' ', 'g')) is not null then raise exception 'That username isn''t allowed'; end if;
  insert into profiles (id, username) values (new.id, uname);
  insert into inventory (owner, name) select new.id, name from catalog where not weapon and v < 1.5 order by random() limit 4;
  return new;
end $$;

create or replace function username_available(p_name text) returns bool language sql stable security definer set search_path = public as $$
  select p_name ~ '^[A-Za-z0-9_]{3,20}$' and not exists (select 1 from profiles where lower(username) = lower(p_name))
     and lower(p_name) not in ('house', 'tcbet', 'admin', 'administrator', 'owner', 'moderator', 'mod', 'staff', 'support', 'system', 'official') and _chat_blocked(p_name) is null and _chat_blocked(regexp_replace(p_name, '_', ' ', 'g')) is null $$;

drop function if exists chat_send(text);
create or replace function chat_send(p_body text) returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); b text := btrim(p_body); me profiles; bad text;
begin
  if length(b) = 0 or length(b) > 200 then raise exception 'Messages are 1-200 characters'; end if;
  select * into me from profiles where id = uid;
  if me.muted_until is not null and me.muted_until > now() then
    raise exception '%', case when me.muted_until = 'infinity' then 'You are muted from chat' else 'You are muted for ' || greatest(1, ceil(extract(epoch from me.muted_until - now()) / 60))::int || ' more minute(s)' end
      || coalesce(' (' || me.mute_reason || ')', '');
  end if;
  bad := _chat_blocked(b);
  if bad is not null then
    update profiles set chat_strikes = chat_strikes + 1 where id = uid returning * into me;
    insert into mod_log (admin, action, target, detail) values ('AutoMod', 'blocked', me.username, 'strike ' || me.chat_strikes || '/3');
    if me.chat_strikes >= 3 then
      update profiles set muted_until = now() + interval '10 minutes', mute_reason = 'AutoMod: slurs', chat_strikes = 0 where id = uid;
      insert into mod_log (admin, action, target, detail) values ('AutoMod', 'mute', me.username, '10 minutes');
      return 'Message blocked. You are muted for 10 minutes for repeated slurs';
    end if;
    return 'Message blocked: slurs aren''t allowed (strike ' || me.chat_strikes || '/3)';   -- returned, not raised, so the strike is saved
  end if;
  update profiles set chat_at = now() where id = uid and (chat_at is null or chat_at < now() - interval '1.5 seconds') returning * into me;
  if not found then raise exception 'Slow down a little'; end if;
  insert into chat (user_id, username, body, rank) values (uid, me.username, b, me.rank);
  return null;
end $$;

-- ============================================================ moderation tools (rank admin/owner)
create or replace function admin_mute(p_username text, p_minutes int, p_reason text default null) returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); me profiles; t profiles; until timestamptz;
begin
  select * into me from profiles where id = uid;
  if not _is_admin(uid) then raise exception 'Admins only'; end if;
  select * into t from profiles where lower(username) = lower(btrim(p_username));
  if not found then raise exception 'No player called %', p_username; end if;
  if t.id = uid then raise exception 'You can''t mute yourself'; end if;
  if t.rank in ('admin', 'owner') and me.rank <> 'owner' then raise exception 'Only the owner can mute staff'; end if;
  until := case when p_minutes is null or p_minutes = 0 then null when p_minutes < 0 then 'infinity'::timestamptz else now() + make_interval(mins => p_minutes) end;
  update profiles set muted_until = until, mute_reason = case when until is null then null else nullif(btrim(coalesce(p_reason, '')), '') end, chat_strikes = 0 where id = t.id;
  insert into mod_log (admin, action, target, detail) values (me.username, case when until is null then 'unmute' else 'mute' end, t.username,
    case when until is null then null when p_minutes < 0 then 'permanent' else p_minutes || ' min' end || coalesce(' · ' || nullif(btrim(coalesce(p_reason, '')), ''), ''));
  if until is not null then
    insert into chat (username, body) values ('TCBET', t.username || ' was muted ' || case when p_minutes < 0 then 'permanently' else 'for ' || p_minutes || ' min' end || ' by ' || me.username);
  end if;
  return t.username;
end $$;

create or replace function admin_delete_msg(p_id bigint) returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); c chat;
begin
  if not _is_admin(uid) then raise exception 'Admins only'; end if;
  delete from chat where id = p_id returning * into c;
  if found then insert into mod_log (admin, action, target, detail) values ((select username from profiles where id = uid), 'delete', c.username, left(c.body, 60)); end if;
end $$;

create or replace function admin_purge_chat(p_username text) returns int language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); n int;
begin
  if not _is_admin(uid) then raise exception 'Admins only'; end if;
  delete from chat where lower(username) = lower(btrim(p_username)); get diagnostics n = row_count;
  insert into mod_log (admin, action, target, detail) values ((select username from profiles where id = uid), 'purge', p_username, n || ' messages');
  return n;
end $$;

create or replace function admin_filter_word(p_word text, p_add bool) returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := _uid(); w text := lower(btrim(coalesce(p_word, '')));
begin
  if not _is_admin(uid) then raise exception 'Admins only'; end if;
  if length(w) < 2 or length(w) > 40 then raise exception 'Words are 2-40 characters'; end if;
  if p_add then insert into chat_filter (word) values (w) on conflict do nothing; else delete from chat_filter where word = w; end if;
  insert into mod_log (admin, action, target, detail) values ((select username from profiles where id = uid), case when p_add then 'filter +' else 'filter -' end, null, null);
end $$;

create or replace function admin_mod_overview() returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not _is_admin(_uid()) then raise exception 'Admins only'; end if;
  return jsonb_build_object(
    'muted', (select coalesce(jsonb_agg(x), '[]') from (select username, muted_until, mute_reason from profiles where muted_until > now() order by muted_until) x),
    'words', (select coalesce(jsonb_agg(word order by word), '[]') from chat_filter),
    'log', (select coalesce(jsonb_agg(x), '[]') from (select admin, action, target, detail, created_at from mod_log order by id desc limit 40) x));
end $$;

-- clean slurs that are already in chat
delete from chat where username <> 'TCBET' and _chat_blocked(body) is not null;

revoke execute on function admin_mute(text, int, text), admin_delete_msg(bigint), admin_purge_chat(text), admin_filter_word(text, bool), admin_mod_overview(), _chat_blocked(text) from public, anon;
grant execute on function admin_mute(text, int, text), admin_delete_msg(bigint), admin_purge_chat(text), admin_filter_word(text, bool), admin_mod_overview(), chat_send(text) to authenticated;
grant execute on function username_available(text) to anon, authenticated;

-- ============================================================ no system announcements in chat (big wins still show in the live drops bar)
create or replace function _no_announcements() returns trigger language plpgsql as $$
begin
  if new.username = 'TCBET' then return null; end if;   -- silently skip
  return new;
end $$;
drop trigger if exists no_announcements on chat;
create trigger no_announcements before insert on chat for each row execute function _no_announcements();
delete from chat where username = 'TCBET';

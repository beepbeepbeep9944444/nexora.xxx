# TCBET server (Supabase)

TCBET's multiplayer backend is a free Supabase project. All coins, items, case rolls, flips, jackpots and
trades are handled by the database functions in `schema.sql`; the website can only read data and call them.

## One-time setup

1. Create a project at https://supabase.com.
2. **Authentication → Sign In / Providers → Email:** turn **off** "Confirm email" (players sign up with a username only).
3. **SQL Editor → New query:** paste all of `schema.sql`, click **Run**.
4. **SQL Editor → New query:** paste all of `seed.sql`, click **Run**.
5. **Project Settings → API:** copy the Project URL and the anon/publishable key into `tcbet/config.js`.

## Updating item data

`seed.sql` and `tcbet/data.js` are generated together by `tools/build_server.py`, so prices always match:

```
python tools/build_server.py <data.js from process.py> tcbet/data.js supabase/seed.sql
```

Re-run `seed.sql` in the SQL editor after regenerating. It only replaces the catalog tables, never player data.

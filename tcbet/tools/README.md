# TCBET data tools

These scripts rebuild `../data.js` from the Typical Colors 2 wiki (typicalcolors2.fandom.com).
TCBET uses play-money fun-coins only; every value is an invented estimate.

Run them from a scratch folder, in this order:

```
python scrape.py raw.json
python crates.py crates.json
python weapons.py crates.json weapons.json
# save the wiki's Unusualifier page wikitext as unusualifier.txt, then:
python process.py raw.json data_base.js crates.json unusualifier.txt weapons.json
python build_server.py data_base.js ../data.js ../server/seed.sql
```

`build_server.py` applies the hat ranking, removes admin-only items/effects and builds the case tables, writing the site's `data.js` and the server's `seed.sql` together so prices always match.
Run the new `seed.sql` in the Supabase SQL editor, then bump the `?v=` numbers in `tcbet/index.html` so browsers reload.

# TCBET data tools

These scripts rebuild `../data.js` from the Typical Colors 2 wiki (typicalcolors2.fandom.com).
TCBET uses play-money fun-coins only; every value is an invented estimate.

Run them from a scratch folder, in this order:

```
python scrape.py raw.json
python crates.py crates.json
python weapons.py crates.json weapons.json
# save the wiki's Unusualifier page wikitext as unusualifier.txt, then:
python process.py raw.json data.js crates.json unusualifier.txt weapons.json
```

Copy the new `data.js` over `tcbet/data.js` and bump the `?v=` numbers in `tcbet/index.html` so browsers reload it.

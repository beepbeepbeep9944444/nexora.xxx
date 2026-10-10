"""Precompute hat factors + case tables so the browser and the Supabase database use identical numbers.

usage: python build_server.py <site/data.js in> <site/data.js out> <supabase/seed.sql out>
"""
import json, math, re, sys

src = open(sys.argv[1], encoding="utf-8").read()
grab = lambda k: json.loads(re.search(r"window\." + k + r"=(.*?);\n", src).group(1))
ITEMS, EFFECTS, CRATES = grab("TC2_ITEMS"), grab("TC2_EFFECTS"), grab("TC2_CRATES")

# players can't get developer/contributor items or dev/community effects, so they don't exist on TCBET
ADMIN_GROUPS = {"DEV", "COMM"}
ITEMS = [i for i in ITEMS if "Developer/Contributor-only" not in i.get("tags", [])]
EFFECTS = [e for e in EFFECTS if not ADMIN_GROUPS & set(e["g"])]
for i in ITEMS:
    i["fx"] = [g for g in i["fx"] if g not in ADMIN_GROUPS]
    if not i["fx"]: i["unu"] = False

# Effect multipliers on a hat's base unusual price (site owner's numbers; ranges use the middle).
# value = hat factor * BASE_UNIT * multiplier, so Burning (1.75x) on Sheik lands next to a Golden Frying Pan.
BASE_UNIT = 1487
EFFECT_MULT = {"Burning": 1.75, "Scorching Summon": 2.5, "Nebula": 3.0, "Sunrise": 3.5, "Dawn": 3.5,
               "Black Hole": 1.2, "Singularity": 1.5, "Scorching Energy": 1.5}
for e in EFFECTS:
    if "UX" in e["g"]: continue                      # Unusualifier effects stay near-worthless
    if e["name"] in EFFECT_MULT: e["m"] = BASE_UNIT * EFFECT_MULT[e["name"]]
    else: e["m"] = min(e["m"], 1.3 * BASE_UNIT)      # tier-list effects keep their order but stay below the named ones
ITEM = {i["name"]: i for i in ITEMS}
FX = {e["name"]: e for e in EFFECTS}
STD = ["S%d" % i for i in range(1, 11)]

def r2(x):  # JS Math.round(x*100)/100
    return math.floor(x * 100 + 0.5) / 100

def fnv01(s):  # same as the JS hash() in app.js
    h = 2166136261
    for ch in s:
        c = ord(ch)
        if c > 0xFFFF:  # JS charCodeAt(0) gives the high surrogate
            c = 0xD800 + ((c - 0x10000) >> 10)
        x = (h ^ c) & 0xFFFFFFFF
        h = (x * 16777619) & 0xFFFFFFFF
    return h / 4294967295

def age(yr):
    return 2.6 if yr <= 2017 else 2.2 if yr <= 2018 else 1.7 if yr <= 2019 else 1.5 if yr <= 2020 else 1.2 if yr <= 2021 else 1 if yr <= 2022 else .85 if yr <= 2023 else .7

# The site owner's base-hat ranking, most to least valuable. These always beat every unlisted hat.
# Halloween 2018 Costume Crate hats (Time Capsule, any effect from 2020 and under) are the grails: Burning Knightmare is #1.
GRAILS = {"Knightmare": 15.5, "Disaster Spellcaster": 13.0, "Omniscient Oculi": 12.0, "Pigeon Mask": 11.5, "Terror-Vision": 11.2,
          "Ugly Ursidae": 10.9, "Haunted Headgear": 10.7, "Ostracized Elephant": 10.5, "Brim Full of Brains": 10.3, "Open Mind": 10.1}
# Burning Sheik / Dead Eye sit around a Golden Frying Pan; the list then tapers geometrically down to Big Bruncher
TOP_HATS = ["Sheik", "Dead Eye", "Safety First", "Attack Wrap", "Hard News", "Drama Queen", "Driller",
    "Spiked Raider", "Soldier on Safari", "Vae Victis", "Occult Classic", "Ghast Mask", "Rider",
    "Welding Mask", "Beast's Bonnet", "Shady Character",                                                 # 2017-18 all-year
    "Antler Branches", "Cold Companion", "Coldchack Flaps", "Sweets Sweeper", "Whereville Wardrobe",
    "Good-willed Gifter", "Holiday Conductor", "Sugarlined Topper",                                      # Holiday 2020
    "Summer Blockers", "Trilby Thriller", "Trendsetter", "Diver Goggles", "Summer Striker", "Shady Agent",
    "Scubanist", "Battle Bronco", "Silly Serpent", "Jumper's Jammies", "Blind Warrior", "Private Sandbox",
    "Life Doctor", "Visor Advisor", "Troopceratops", "Fisher Man", "Shoreline Shot", "Lucky Lid",
    "Brutish Captain", "Arcade Ace", "Sweet Memories", "Subway Sprayer", "Truck Month", "Big Bruncher"]  # Summer 2021
TOP_HI, TOP_LO = 9.8, 1.5
# Fitten Co. shop hats (and the three named costume grails): any real unusual on them is worth at least 5,000
SHOP_HATS = {"Spiked Raider", "Sheik", "Driller", "Hard News", "Welding Mask", "Rider", "Knightmare", "Disaster Spellcaster", "Omniscient Oculi"}
BURN_FLOOR, SHOP_FLOOR, CAP = 10000, 5000, 100000
def other_age(yr):  # unlisted hats: small age bonus, never reaching TOP_LO
    return 1.1 if yr <= 2018 else 1.0 if yr <= 2020 else .9 if yr <= 2021 else .8 if yr <= 2022 else .7 if yr <= 2023 else .6
missing = [n for n in [*TOP_HATS, *GRAILS, *SHOP_HATS] if n not in {i["name"] for i in ITEMS}]
assert not missing, missing
for it in ITEMS:
    if not it.get("unu"): continue
    if it["name"] in GRAILS:
        it["hf"] = GRAILS[it["name"]]
    elif it["name"] in TOP_HATS:
        r = TOP_HATS.index(it["name"])
        it["hf"] = TOP_HI * (TOP_LO / TOP_HI) ** (r / (len(TOP_HATS) - 1))
    else:
        it["hf"] = (0.3 if it.get("bp") else 1) * other_age(it.get("yr") or 2022) * (0.85 + 0.3 * fnv01(it["name"]))
    it["fbs"] = BURN_FLOOR if (it.get("yr") or 2022) <= 2018 else 0     # 2018 hats: Burning / Scorching Energy never below 10k
    it["fany"] = SHOP_FLOOR if it["name"] in SHOP_HATS else 0          # shop hats: any non-Unusualifier effect >= 5k

def legal(hat, e): return any(g in e["g"] for g in hat["fx"])
def value(n, fx=None):  # keep in sync with item_value() in schema.sql and value() in app.js
    b = ITEM[n]
    if not fx: return b["v"]
    e = FX[fx]
    ux = "UX" in e["g"]
    v = min(CAP, e["m"] * (min(1, b["hf"]) if ux else b["hf"]))
    if fx in ("Burning", "Scorching Energy"): v = max(v, b.get("fbs", 0))
    if not ux: v = max(v, b.get("fany", 0))
    return r2(v)

def fx_for(hat, groups):
    return [e for e in EFFECTS if legal(hat, e) and any(g in groups and g in hat["fx"] for g in e["g"])]

def unusual_entry(hats, groups, w):
    # server rolls: random hat, then random legal effect within the case's groups
    evs = [sum(value(h["name"], e["name"]) for e in fx_for(h, groups)) / len(fx_for(h, groups)) for h in hats]
    return dict(unusual=True, hats=[h["name"] for h in hats], groups=groups, w=w, ev=sum(evs) / len(evs))

def build(cid, name, img, entries, season, tag, price=None, markup=1.1):
    tw = sum(e["w"] for e in entries)
    for e in entries: e["p"] = e["w"] / tw
    ev = sum(e["p"] * (e["ev"] if e.get("unusual") else value(e["n"])) for e in entries)
    return dict(id=cid, name=name, img=img, season=season, tag=tag, entries=entries, ev=r2(ev), price=price or max(0.25, r2(ev * markup)))

def season_of(c):
    if c.get("weapons"): return "Weapons"
    f = c["fx"]
    return "Classic" if "S1" in f else "Summer" if ("S2" in f or "S5" in f) else "Halloween" if "S3" in f else "Holiday"

cases = []
for c in CRATES:
    pool = [ITEM[n] for n in c["items"] if n in ITEM]
    if len(pool) < 5 or not c["img"]: continue
    groups = [g for g in c["fx"] if g in STD]
    hats = [h for h in pool if h.get("unu") and fx_for(h, groups)]
    entries = [dict(n=i["name"], w=1 / max(i["v"], .05) ** .75) for i in pool]
    tw = sum(e["w"] for e in entries)
    if hats: entries.append(unusual_entry(hats, groups, tw * 0.0101))
    cid = re.sub(r"\W+", "-", c["name"]).lower()
    cases.append(build(cid, c["name"], c["img"], entries, season_of(c), "In game" if c["avail"] else "Retired"))

all_hats = [h for h in ITEMS if h.get("unu") and fx_for(h, STD)]
ub = build("unusual-box", "Unusual Box", "logo-mark.svg", [unusual_entry(all_hats, STD, 1)], "Classic", "100% Unusual", markup=1.08)
top = [i for i in ITEMS if not i.get("weapon") and i["v"] > 150][:14]
mid = [i for i in ITEMS if 3 < i["v"] < 30][:18]
gg = build("golden-gamble", "Golden Gamble", ITEM["Golden Frying Pan"]["img"], [
    dict(n="Golden Frying Pan", w=.4), dict(n="Frying Pan", w=.9), dict(n="Golden Knife", w=1.6), dict(n="Golden Wrench", w=1.8),
    dict(n="Collector's Rising Sun Katana", w=3),
    *[dict(n=i["name"], w=4000 / i["v"]) for i in ITEMS if i.get("q") == "Haunted"],
    *[dict(n=i["name"], w=6) for i in top],
    unusual_entry(all_hats, STD, 20),
    *[dict(n=i["name"], w=12) for i in mid]], "Classic", "Golden Frying Pan inside")
col = [i for i in ITEMS if i.get("q") == "Collector's" and i.get("base") != "Rising Sun Katana"]
strg = [i for i in ITEMS if i.get("q") == "Strange" and i.get("base")]
cc = build("collectors-cache", "Collector's Cache", ITEM["Collector's Rising Sun Katana"]["img"],
           [*[dict(n=i["name"], w=.12) for i in col], dict(n="Strange Rising Sun Katana", w=.6), *[dict(n=i["name"], w=1) for i in strg]],
           "Weapons", "Collector's weapons")
cases = [gg, ub, cc] + cases
for i, c in enumerate(cases): c["sort"] = i

# ---- client data
out = src.rstrip() + "\nwindow.TC2_CASES=" + json.dumps(cases, separators=(",", ":")) + ";\n"
out = re.sub(r"window\.TC2_ITEMS=.*?;\n", lambda m: "window.TC2_ITEMS=" + json.dumps(ITEMS, separators=(",", ":")) + ";\n", out, count=1)
out = re.sub(r"window\.TC2_EFFECTS=.*?;\n", lambda m: "window.TC2_EFFECTS=" + json.dumps(EFFECTS, separators=(",", ":")) + ";\n", out, count=1)
open(sys.argv[2], "w", encoding="utf-8").write(out)

# ---- server seed
q = lambda s: "NULL" if s is None else "'" + str(s).replace("'", "''") + "'"
arr = lambda a: "ARRAY[" + ",".join(q(x) for x in a) + "]::text[]" if a else "'{}'::text[]"
L = ["-- generated by tools/build_server.py — do not edit by hand", "begin;",
     "truncate catalog, effects, cases, case_entries;"]
L.append("insert into catalog(name,v,hf,unu,fx,q,weapon,fbs,fany) values")
L.append(",\n".join(f"({q(i['name'])},{i['v']},{i.get('hf', 0)!r},{str(bool(i.get('unu'))).lower()},{arr(i['fx'])},{q(i.get('q'))},{str(bool(i.get('weapon'))).lower()},{i.get('fbs', 0)},{i.get('fany', 0)})" for i in ITEMS) + ";")
L.append("insert into effects(name,m,g) values")
L.append(",\n".join(f"({q(e['name'])},{e['m']!r},{arr(e['g'])})" for e in EFFECTS) + ";")
L.append("insert into cases(id,name,price,sort) values")
L.append(",\n".join(f"({q(c['id'])},{q(c['name'])},{c['price']},{c['sort']})" for c in cases) + ";")
rows = []
for c in cases:
    for k, e in enumerate(c["entries"]):
        if e.get("unusual"): rows.append(f"({q(c['id'])},{k},NULL,{e['p']!r},true,{arr(e['groups'])},{arr(e['hats'])})")
        else: rows.append(f"({q(c['id'])},{k},{q(e['n'])},{e['p']!r},false,NULL,NULL)")
L.append("insert into case_entries(case_id,idx,name,p,unusual,groups,hats) values")
L.append(",\n".join(rows) + ";")
# drop anything players own that no longer exists (e.g. removed admin items/effects)
L.append("delete from inventory where name not in (select name from catalog) or (fx is not null and fx not in (select name from effects));")
L.append("commit;")
open(sys.argv[3], "w", encoding="utf-8").write("\n".join(L) + "\n")
print(len(cases), "cases;", [(c["name"], c["price"]) for c in cases[:4]])
for h, f in [("Knightmare", "Burning"), ("Disaster Spellcaster", "Burning"), ("Open Mind", "Burning"), ("Sheik", "Burning"), ("Dead Eye", "Burning"), ("Attack Wrap", "Burning"), ("Big Bruncher", "Nebula"), ("Hard News", "Sparking"), ("Occult Classic", "Massed Fireflies"), ("Knightmare", "VIP")]: print(f, h, "=", value(h, f))
print("Golden Frying Pan =", value("Golden Frying Pan"))
print("top 5 unusuals:", sorted(((value(h["name"], e["name"]), e["name"] + " " + h["name"]) for h in ITEMS if h.get("unu") for e in EFFECTS if legal(h, e)), reverse=True)[:5])
print("2018 burning/scorching under 10k:", [h["name"] for h in ITEMS if h.get("unu") and (h.get("yr") or 2022) <= 2018 for e in EFFECTS if e["name"] in ("Burning", "Scorching Energy") and legal(h, e) and value(h["name"], e["name"]) < 10000])

"""Precompute hat factors + case tables so the browser and the Supabase database use identical numbers.

usage: python build_server.py <site/data.js in> <site/data.js out> <supabase/seed.sql out>
"""
import json, math, re, sys

src = open(sys.argv[1], encoding="utf-8").read()
grab = lambda k: json.loads(re.search(r"window\." + k + r"=(.*?);\n", src).group(1))
ITEMS, EFFECTS, CRATES = grab("TC2_ITEMS"), grab("TC2_EFFECTS"), grab("TC2_CRATES")

# owner-set fixed values
# the Golden Frying Pan is the end goal of the economy; the other grails sit well below it
VALUE_OVERRIDE = {"Golden Frying Pan": 100000, "Frying Pan": 40000, "Golden Knife": 18000, "Golden Wrench": 16000,
                  "Strange Rising Sun Katana": 3500, "Collector's Rising Sun Katana": 10000}
for i in ITEMS:
    if i["name"] in VALUE_OVERRIDE: i["v"] = VALUE_OVERRIDE[i["name"]]
    elif i.get("q") == "Haunted": i["v"] = round(i["v"] * 2.5, 2)       # one-of-a-kind haunted weapons
# owner-set case prices
PRICE_OVERRIDE = {"collectors-cache": 250, "golden-gamble": 3000, "grail-crate": 25000}

# players can't get developer/contributor items or dev/community effects, so they don't exist on TCBET
ADMIN_GROUPS = {"DEV", "COMM"}
ITEMS = [i for i in ITEMS if "Developer/Contributor-only" not in i.get("tags", [])]
EFFECTS = [e for e in EFFECTS if not ADMIN_GROUPS & set(e["g"])]
for i in ITEMS:
    i["fx"] = [g for g in i["fx"] if g not in ADMIN_GROUPS]
    if not i["fx"]: i["unu"] = False

# Effect multipliers on a hat's base unusual price (site owner's numbers; ranges use the middle).
# value = hat factor * BASE_UNIT * multiplier, so Burning (1.75x) on Sheik lands next to a Golden Frying Pan.
BASE_UNIT = 2200   # unusual price scale: Burning on a costume grail ~ half a Golden Frying Pan
# Most desirable effects, in the owner's order: Nebula > Burning > Scorching Energy > Dawn > Singularity
EFFECT_MULT = {"Nebula": 2.0, "Burning": 1.85, "Scorching Energy": 1.7, "Dawn": 1.55, "Singularity": 1.45,
               "Sunrise": 1.3, "Scorching Summon": 1.2, "Black Hole": 1.1}
for e in EFFECTS:
    if "UX" in e["g"]: continue                      # Unusualifier effects stay near-worthless
    if e["name"] in EFFECT_MULT: e["m"] = BASE_UNIT * EFFECT_MULT[e["name"]]
    else: e["m"] = e["m"] * 0.4                      # everything else keeps its tier order but sits well below the desirable ones
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
GRAILS = {"Knightmare": 12.6, "Disaster Spellcaster": 12.5, "Omniscient Oculi": 12.45, "Pigeon Mask": 12.4, "Terror-Vision": 12.35,
          "Ugly Ursidae": 12.3, "Haunted Headgear": 12.2, "Ostracized Elephant": 12.15, "Brim Full of Brains": 12.1, "Open Mind": 12.0}
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
TOP_HI, TOP_LO = 11.8, 1.5   # Sheik sits right behind the costume grails
# Fitten Co. shop hats (and the three named costume grails): any real unusual on them is worth at least 5,000
SHOP_HATS = {"Spiked Raider", "Sheik", "Driller", "Hard News", "Welding Mask", "Rider", "Knightmare", "Disaster Spellcaster", "Omniscient Oculi"}
BURN_FLOOR, SHOP_FLOOR, CAP = 15000, 7500, 95000
def other_age(yr):  # unlisted hats: small age bonus, never reaching TOP_LO
    return 1.1 if yr <= 2018 else 1.0 if yr <= 2020 else .9 if yr <= 2021 else .8 if yr <= 2022 else .7 if yr <= 2023 else .6
missing = [n for n in [*TOP_HATS, *GRAILS, *SHOP_HATS] if n not in {i["name"] for i in ITEMS}]
assert not missing, missing
# Hat category multipliers vs a normal hat (1x): shop 7x, 2018-and-older 5x, Summer 2023 coolers 2.5x
SUMMER_2023 = {n for c in CRATES if c["name"].startswith("Summer 2023") for n in c["items"]}
def category_mult(it):
    if it["name"] in SHOP_HATS: return 7.0
    if (it.get("yr") or 2022) <= 2018: return 5.0
    if it["name"] in SUMMER_2023: return 2.5
    return 0.0
# Individually priced hats: Summer Blockers trades like a 2018, Nebula on it a bit above a Golden Frying Pan
HAT_OVERRIDE = {"Summer Blockers": 8.85}   # Nebula Summer Blockers ~ a Golden Frying Pan and up
for it in ITEMS:
    if not it.get("unu"): continue
    if it["name"] in HAT_OVERRIDE:
        it["hf"] = HAT_OVERRIDE[it["name"]]
    elif it["name"] in GRAILS:
        it["hf"] = GRAILS[it["name"]]
    elif it["name"] in TOP_HATS:
        r = TOP_HATS.index(it["name"])
        it["hf"] = max(TOP_HI * (TOP_LO / TOP_HI) ** (r / (len(TOP_HATS) - 1)), category_mult(it))
    else:
        it["hf"] = category_mult(it) or (0.3 if it.get("bp") else 1) * other_age(it.get("yr") or 2022) * (0.85 + 0.3 * fnv01(it["name"]))
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

def tier_markup(ev):
    # higher-tier crates are a bigger risk: house edge grows with value (EV 10 -> 1.15x, 100 -> 1.40x, 1000+ -> 1.65x)
    return 1.15 + 0.25 * min(2, max(0, math.log10(max(ev, 1) / 10)))

def build(cid, name, img, entries, season, tag, price=None, markup=None):
    tw = sum(e["w"] for e in entries)
    for e in entries: e["p"] = e["w"] / tw
    ev = sum(e["p"] * (e["ev"] if e.get("unusual") else value(e["n"])) for e in entries)
    # house keeps ~15%; cheap crates get a floor so 1%-unusual lottery tickets can't be spammed with free coins
    floor = 2.5 if season == "Weapons" else 5
    price = PRICE_OVERRIDE.get(cid) or price or max(floor, r2(ev * (markup or tier_markup(ev))))
    return dict(id=cid, name=name, img=img, season=season, tag=tag, entries=entries, ev=r2(ev), price=price)

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
ub = build("unusual-box", "Unusual Box", "logo-mark.svg", [unusual_entry(all_hats, STD, 1)], "Classic", "100% Unusual")
top = [i for i in ITEMS if not i.get("weapon") and i["v"] > 150][:14]
mid = [i for i in ITEMS if 3 < i["v"] < 30][:18]
def tuned(entries, filler, target_ev):
    """scale the weight of the cheap 'filler' entries so the case pays back target_ev on average"""
    val = lambda x: x["ev"] if x.get("unusual") else value(x["n"])
    hi = [x for x in entries if x not in filler]
    lo_w, hi_w = 1e-6, 1e6
    for _ in range(200):
        k = (lo_w * hi_w) ** .5
        tw = sum(x["w"] for x in hi) + k * sum(x["w"] for x in filler)
        ev = (sum(x["w"] * val(x) for x in hi) + k * sum(x["w"] * val(x) for x in filler)) / tw
        lo_w, hi_w = (k, hi_w) if ev > target_ev else (lo_w, k)
    for x in filler: x["w"] *= k
    return entries

gg_fill = [dict(n=i["name"], w=12) for i in mid]
gg = build("golden-gamble", "Golden Gamble", ITEM["Golden Frying Pan"]["img"], tuned([
    dict(n="Golden Frying Pan", w=.4), dict(n="Frying Pan", w=.9), dict(n="Golden Knife", w=1.6), dict(n="Golden Wrench", w=1.8),
    dict(n="Collector's Rising Sun Katana", w=1.2),
    *[dict(n=i["name"], w=4000 / i["v"]) for i in ITEMS if i.get("q") == "Haunted"],
    *[dict(n=i["name"], w=6) for i in top],
    unusual_entry(all_hats, STD, 20),
    *gg_fill], gg_fill, 2000), "Classic", "Golden Frying Pan inside")
col = [i for i in ITEMS if i.get("q") == "Collector's" and i.get("base") != "Rising Sun Katana"]
strg = [i for i in ITEMS if i.get("q") == "Strange" and i.get("base") and i.get("base") != "Rising Sun Katana"]
cc_fill = [dict(n=i["name"], w=1) for i in strg]
cc = build("collectors-cache", "Collector's Cache", ITEM["Collector's Rising Sun Katana"]["img"], tuned([
    dict(n="Collector's Rising Sun Katana", w=.05), dict(n="Strange Rising Sun Katana", w=.25),
    *[dict(n=i["name"], w=.5) for i in col], *cc_fill], cc_fill, 190),
    "Weapons", "Collector's weapons")
# ---- top-tier vaults
FOUNDERS = [h for h in TOP_HATS[:16] if ITEM[h].get("unu")]
fv = build("founders-vault", "Founders' Vault", ITEM["Sheik"]["img"], [unusual_entry([ITEM[h] for h in FOUNDERS], STD, 1)], "Classic", "2017-18 grail unusual")
cv = build("costume-vault", "Costume Vault", ITEM["Knightmare"]["img"], [unusual_entry([ITEM[h] for h in GRAILS], STD + ["HAUNT"], 1)], "Classic", "Costume hat unusual")
grail_fill = [unusual_entry([ITEM[h] for h in FOUNDERS], STD, 40)]
gc = build("grail-crate", "Grail Crate", ITEM["Golden Frying Pan"]["img"], tuned([
    dict(n="Golden Frying Pan", w=6), dict(n="Frying Pan", w=9), dict(n="Golden Knife", w=12), dict(n="Golden Wrench", w=12),
    dict(n="Collector's Rising Sun Katana", w=14),
    unusual_entry([ITEM[h] for h in GRAILS], STD + ["HAUNT"], 20), *grail_fill], grail_fill, 25000 / 1.5), "Classic", "Golden Frying Pan odds")
cases = [gc, cv, fv, gg, ub, cc] + cases
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
for c in (gc, cv, fv, ub, gg): print(f"  {c['name']}: price {c['price']:,} avg payout {c['ev']:,.0f} ({c['ev'] / c['price'] * 100:.0f}%)")
print("  grail odds:", [(e.get("n", "unusual"), f"{e['p'] * 100:.1f}%") for e in gc["entries"]])
for h, f in [("Knightmare", "Burning"), ("Disaster Spellcaster", "Burning"), ("Open Mind", "Burning"), ("Sheik", "Burning"), ("Dead Eye", "Burning"), ("Attack Wrap", "Burning"), ("Big Bruncher", "Nebula"), ("Hard News", "Sparking"), ("Occult Classic", "Massed Fireflies"), ("Knightmare", "VIP")]: print(f, h, "=", value(h, f))
print("Golden Frying Pan =", value("Golden Frying Pan"))
print("Summer Blockers:", {f: value("Summer Blockers", f) for f in ("Nebula", "Sunrise", "Dawn", "Dust Devil", "Bubble Bath", "Far-out Beat", "VIP")})
for h in ["Welding Mask", "Rider", "Driller", "Ugly Ursidae", "Beast's Bonnet", "Antler Branches", "Big Bruncher"] + sorted(SUMMER_2023)[:2] + [i["name"] for i in ITEMS if i.get("unu") and (i.get("yr") or 2022) <= 2018 and i["name"] not in TOP_HATS and i["name"] not in GRAILS][:2]: print(f"  {h}: hat x{ITEM[h]['hf']:.2f}  Burning={value(h, 'Burning') if any(e['name']=='Burning' and legal(ITEM[h], e) for e in EFFECTS) else '-'}")
print("top 5 unusuals:", sorted(((value(h["name"], e["name"]), e["name"] + " " + h["name"]) for h in ITEMS if h.get("unu") for e in EFFECTS if legal(h, e)), reverse=True)[:5])
print("2018 burning/scorching under 10k:", [h["name"] for h in ITEMS if h.get("unu") and (h.get("yr") or 2022) <= 2018 for e in EFFECTS if e["name"] in ("Burning", "Scorching Energy") and legal(h, e) and value(h["name"], e["name"]) < 10000])

import json, re, sys, hashlib, urllib.request, urllib.parse, time
raw=json.load(open(sys.argv[1])); wt=raw["wt"]; cats={k:set(v) for k,v in raw["cats"].items()}
CR=json.load(open(sys.argv[3]))
UXL=set(x.strip() for x in re.findall(r"#[^|\]]+\|([^\]]+)\]\]", open(sys.argv[4],encoding="utf-8").read().split("taunt-exclusive")[0]))
SEASON={"Summer":["S2","S5","S6","S8"],"Halloween":["S3","S9"],"Holiday":["S4","S7","S10"]}
ALLSTD=["S%d"%i for i in range(1,11)]
CRATE_RULES=[("Summer 2021",["S2"]),("Summer 2022",["S5"]),("Summer 2023",["S6","S2"]),("Summer 2024",["S8","S6","S2"]),("Summer 2025",["S8","S6","S2"]),
  ("Halloween 2021",["S3"]),("Halloween 2023",["S3"]),("Halloween 2024",["S9","S3"]),
  ("Holiday 2021",["S4"]),("Holiday 2023",["S7","S4"]),("Holiday 2024",["S10","S7","S4"]),("Holiday 2025",["S10","S7","S4"])]
def crate_groups(c):
    for pre,g in CRATE_RULES:
        if c.startswith(pre): return g
    return ["S1"]   # year-round / pre-2021 crates = Classic season = Series 1
item_crates={}
crates_out=[]
for c,info in CR.items():
    if "Weapon" in c:
        crates_out.append(dict(name=c,items=["Strange "+n for n in info["items"]],img="Cosmetic Crate.png",fx=[],avail=info["status"]=="Available",weapons=True)); continue
    for n in info["items"]: item_crates.setdefault(n,[]).append(c)
    crates_out.append(dict(name=c,items=info["items"],img=info["img"] if info["img"] and not info["img"].startswith("<") else "Cosmetic Crate.png",fx=crate_groups(c),avail=info["status"]=="Available"))
A="https://typicalcolors2.fandom.com/api.php"
def get(params):
    url=A+"?"+urllib.parse.urlencode(dict(params,format="json"))
    for i in range(4):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(url,headers={"User-Agent":"tc2-funcash/0.1"}),timeout=60))
        except Exception as e: time.sleep(2)
def h(s,salt=""):  # deterministic 0..1
    return int(hashlib.md5((s+salt).encode()).hexdigest()[:8],16)/0xffffffff
def field(t,name):
    m=re.search(r"\|\s*"+name+r"\s*=\s*(.*?)(?=\n\|\s*[\w ]+\s*=|\n\}\})",t,re.S)
    return m.group(1).strip() if m else ""
items=[]; files=set()
for name,t in wt.items():
    if "#REDIRECT" in t[:20].upper(): continue
    img=field(t,"image1")
    m=re.search(r"([^\n|=<>]+?\.(?:png|gif|jpg|jpeg|webp))",img,re.I)
    if not m: continue
    img=m.group(1).strip()
    q=field(t,"qualities")
    avail=field(t,"availability")
    obt=avail.split("Unobtainable:")[0]
    unobt="Unobtainable:" in avail and avail.split("Unobtainable:")[1] or ""
    funds=[int(x.replace(",","")) for x in re.findall(r"\{\{Funds\|([\d,]+)",obt)]
    crates=sorted(set(c for c in re.findall(r"\[\[([^\]|#]+)",obt) if re.search(r"Crate|Cooler|Basket|Box|Jack-o",c)))
    worn=re.sub(r"\[\[|\]\]|<.*?>","",field(t,"worn_by") or field(t,"class")).strip().split("\n")[0].replace("Unfortunate","").strip()
    region=re.sub(r"\(.*?\)","",field(t,"equip_region")).split("\n")[0].strip()
    isHat = name in cats["Hat"] or name in cats["Helmet"] or region.lower().startswith(("hat","head"))
    grp=[]
    if "Unusual" in q:
        grp.append("UX")
        for c in item_crates.get(name,[]): grp+=crate_groups(c)
        if "Unboxing an [[Item Qualities/Unusual" in t and not item_crates.get(name): grp+=["S1"]   # "unusual from any crate" only matters for hats that never had a crate
        if name in cats["Season Pass Rewards"] or name in cats["Battle Pass Rewards"]: grp=["UX","S5"]
        if name in cats["Haunted item"]: grp.append("HAUNT")
        if name in cats["Developer/Contributor-only"]: grp+=["DEV","COMM"]
        if name=="Savior's Badge": grp.append("CODE")
    grp=sorted(set(grp))
    tags=[c for c in ["Unobtainable","Developer/Contributor-only","Season Pass Rewards","Battle Pass Rewards","Achievement Item","Removed Content","Scrapped Content","Experimental item","Taunt"] if name in cats[c]]
    if "Scrapped Content" in tags or "Experimental item" in tags: continue
    if name in cats["Taunt"]: continue
    ym=re.search(r"(20\d\d)", field(t,"added_in")); yr=int(ym.group(1)) if ym else 2022
    weapon = name.startswith("Golden") or name=="Frying Pan"
    # ---- value model (fun-coins) ----
    r=h(name)
    if name=="Golden Frying Pan": v=25000
    elif name=="Golden Knife": v=3850
    elif name=="Golden Wrench": v=3400
    elif name=="Frying Pan": v=9500
    elif "Developer/Contributor-only" in tags: v=180+r*620
    elif "Unobtainable" in tags or "Removed Content" in tags: v=(6+r*30)*(1.6 if isHat else 1)
    elif "Season Pass Rewards" in tags or "Battle Pass Rewards" in tags: v=2.5+r*5
    elif "Achievement Item" in tags: v=1.8+r*2
    elif funds: v=max(0.05, min(funds)/100*0.22*(0.85+r*0.3))
    elif crates: v=0.9+r*2.4
    else: v=0.4+r*1.2
    v=round(v,2)
    files.add(img)
    items.append(dict(name=name,img=img,v=v,hat=isHat,unu=bool(grp),fx=grp,yr=yr,bp=(name in cats["Season Pass Rewards"] or name in cats["Battle Pass Rewards"]),worn=worn or "All",crates=item_crates.get(name,[]),tags=tags,
                      weapon=weapon,price=min(funds) if funds else None))
# ---- unusual effects ----
tpl=raw["unusualTpl"]; effects=[]
blocks=re.findall(r"\|(\w+)=\{\{Unusual exhibition(.*?)\n\}\}",tpl,re.S)
TIER={}
for t,v,names in [("S",2200,"Nebula|Black Hole|Singularity|Sunbeams|Flameable 87|Dawn|Sunrise|Intrusive Thoughts"),
 ("A",1100,"Heating 43|Dust Devil|Andromeda Affinity|Stardust|Chromatic Mirage|Galactic Nova|Hiveminded|Ghastly Horns|Scorching Summon|Tesla|Milkyway|Thunder|Devilish Horns|Electrons|Sakura Wind|Dreary Downpour|Sparking"),
 ("B",550,"Blazing Beast|Bloom Doom|Bubble Bath|Tropical Punch|Winter's Wrath|Serenity|Everlasting Eye|Frost Moon|Blazing Crown|Sandstorm|Digital Hearts|Fireflies|Baneful Bunker|Beautiful Binary|Vivid Plasma|Searing Plasma|Mystical Cyanea|Distortion Paranoia|Shuttershock|Aurora Shine|Stars|Shine|Purple Energy|Enneagram of Classes|Galactic Nova"),
 ("C",280,"Frost Spirit|Far-out Beat|Devil Within|Spectacular Space|Anarchy Flash|Shifting Stars|Polar Star|Daydream|Fireworks|Aurora Borealis|Orbiting Sun|Glacial Quake|Massed Butterflies|Starry Night|Northern Star|Northern Lights|Plasmagetic|Tech Manifestation|Tech Materialization|Fiery Blaze|Orbiting Planets|Massed Fireflies|Nightmare|Shivering Sight"),
 ("D",120,"Candy Cauldron|Ghastly Ghoul|Powerful Poltergeist|Pessimistic Fire|Nuts and Bolts|Night Slash|Malicious Flames|Crabulous Flash|Fwangy Flash|Wondering Wisp|Lit-Up Loyalty")]:
    for n in names.split("|"): TIER.setdefault(n,v)
TIER.update({"Burning":2900,"Scorching Energy":2500,"Nebula":2600})
S1={"Burning":2600,"Scorching Energy":2400,"Searing Plasma":1500,"Vivid Plasma":1400,"Sunbeams":1100,"Black Hole":1000,"Singularity":900,"Purple Energy":850,"Electrons":700,"Aurora Shine":650,"Stars":550,"Shine":520,"Stardust":420,"Sparking":400,"Nuts and Bolts":360,"Massed Fireflies":340}
tier={"Series1":(260,900),"Series2":(180,520),"Series3":(200,600),"Series4":(170,540),"Series5":(70,240),"Series6":(55,200),"Series7":(60,220),"Series8":(40,160),"Series9":(45,170),"Series10":(35,140),
      "CodeExclusive":(1600,3200),"UnusualifierExclusive":(3,15),"DeveloperExclusive":(1400,4200),"CommunitySparkle":(900,1400),"Haunted":(700,1200)}
label={"CodeExclusive":"Code Exclusive","UnusualifierExclusive":"Unusualifier Exclusive","DeveloperExclusive":"Developer Exclusive","CommunitySparkle":"Community","Haunted":"Haunted"}
for key,body in blocks:
    if key not in tier: continue
    sec_taunt=set(re.findall(r"\|(section\d+)=Taunt",body))
    for m in re.finditer(r"\|((?:section\d+ )?)effect(\d+)=([^\n]+)",body):
        pre,num,eff=m.group(1),m.group(2),m.group(3).strip()
        if pre.strip() in sec_taunt: continue
        im=re.search(r"\|"+re.escape(pre)+r"image"+num+r"(?: grn)?=\s*([^\n]+)",body)
        if not im: continue
        if key in ("CommunitySparkle","Haunted"):
            if eff!="Cosmetic": continue
            eff="Community Sparkle" if key=="CommunitySparkle" else "Haunted"
        if eff in [e["name"] for e in effects]: continue
        lo,hi=tier[key]; r=h(eff,"fx")
        g=[{"CodeExclusive":"CODE","UnusualifierExclusive":"UX","DeveloperExclusive":"DEV","CommunitySparkle":"COMM","Haunted":"HAUNT"}.get(key,key.replace("Series","S"))]
        m=TIER.get(eff)
        if m: m=round(m*(0.85+0.3*h(eff,"t")),2)
        if key=="Haunted": m=1800
        effects.append(dict(name=eff,g=g,img=im.group(1).strip(),series=label.get(key,key.replace("Series","Series ")),m=m or round(lo+(hi-lo)*r**1.6,2)))
        files.add(im.group(1).strip())
# ---- resolve image urls ----
# ---- strange + collector's weapons (normal drop pool + strange weapon crates) ----
for w in json.load(open(sys.argv[5])):
    r=h(w["name"],"w"); old=max(0,2022-w["yr"])*0.06
    if w["name"]=="Rising Sun Katana": sv,cv=120,1800      # rare drop
    else: sv=round(0.3+2.2*r,2); cv=round(260+460*(r**1.3)+old*200,2)
    for q,v in (("Strange",sv),("Collector's",cv)):
        if q not in w["q"]: continue
        files.add(w["file"])
        items.append(dict(name=q+" "+w["name"],base=w["name"],q=q,img=w["file"],v=v,hat=False,unu=False,fx=[],yr=w["yr"],worn=w["cls"].replace("Unfortunate","").strip() or "All",crates=[],tags=[],weapon=True,price=None))
for n in ("Golden Frying Pan","Golden Knife","Golden Wrench","Frying Pan"):
    for it in items:
        if it["name"]==n: it["q"]="Strange" if n!="Frying Pan" else "Vintage"
# ---- haunted weapons: valued by how few exist (counts are not published on the site) ----
HAUNTED=[("Haunted Medigun","Medigun","Medigun.png","Doctor",2600),("Haunted Kritzkrieg","Kritzkrieg","Kritzkrieg.png","Doctor",3300),
  ("Haunted Poacher's Pride","Poacher's Pride","Poacher's Pride.png","Marksman",5200),("Haunted Scythe for Sore Eyes","Scythe for Sore Eyes","Scythe for Sore Eyes.png","Marksman",5000),
  ("Haunted Sniper Rifle","Sniper Rifle","Sniper Rifle.png","Marksman",4600),("Haunted Syringe Crossbow","Syringe Crossbow","Syringe Crossbow.png","Doctor",4400),
  ("Haunted Strange Shotgun","Shotgun","Shotgun render.png","Trooper Arsonist Brute Mechanic",950),("Haunted Rejuvenator","Rejuvenator","Rejuvenator.png","Doctor",4300),
  ("Haunted Strange Knife","Knife","Knife.png","Agent",5600)]
for n,b,f,cl,v in HAUNTED:
    files.add(f)
    items.append(dict(name=n,base=b,q="Haunted",img=f,v=v,hat=False,unu=False,fx=[],yr=2021,worn=cl,crates=[],tags=["Haunted"],weapon=True,price=None))
files|=set(c["img"] for c in crates_out)
fl=sorted(files); urls={}
for i in range(0,len(fl),50):
    d=get(dict(action="query",prop="imageinfo",iiprop="url",titles="|".join("File:"+f for f in fl[i:i+50])))
    norm={n["to"]:n["from"] for n in d["query"].get("normalized",[])}
    for p in d["query"]["pages"].values():
        if "imageinfo" in p:
            urls[norm.get(p["title"],p["title"])[5:]]=p["imageinfo"][0]["url"].split("/revision/")[0]
for it in items: it["img"]=urls.get(it["img"])
for e in effects: e["img"]=urls.get(e["img"])
for c in crates_out: c["img"]=urls.get(c["img"])
items=[i for i in items if i["img"]]; effects=[e for e in effects if e["img"]]
items.sort(key=lambda x:-x["v"])
out="// Generated from typicalcolors2.fandom.com — fun-coin values are invented estimates\nwindow.TC2_ITEMS="+json.dumps(items,separators=(",",":"))+";\nwindow.TC2_EFFECTS="+json.dumps(effects,separators=(",",":"))+";\nwindow.TC2_CRATES="+json.dumps(crates_out,separators=(",",":"))+";\n"
open(sys.argv[2],"w",encoding="utf-8").write(out)
print(len(items),"items",sum(i["unu"] for i in items),"unusualable hats",len(effects),"effects",file=sys.stderr)
print([ (i["name"],i["v"]) for i in items[:15]],file=sys.stderr)
import collections; print(collections.Counter(e["series"] for e in effects),file=sys.stderr)

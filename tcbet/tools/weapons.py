import json, re, urllib.request, urllib.parse, sys
A="https://typicalcolors2.fandom.com/api.php"
def get(p):
    return json.load(urllib.request.urlopen(urllib.request.Request(A+"?"+urllib.parse.urlencode(dict(p,format="json")),headers={"User-Agent":"tc2-funcash/0.1"}),timeout=60))
pool=get(dict(action="parse",page="Template:Current Drop Pool",prop="wikitext"))["parse"]["wikitext"]["*"]
strange_tab=pool.split('<div class="tabs__content')[1]
names=[]; poolfile={}
for m in re.finditer(r"\[\[File:([^|\]]+)\|[^\]]*?link=([^|\]]+)",strange_tab):
    n=m.group(2).strip()
    poolfile.setdefault(n,m.group(1).strip())
    if n not in names: names.append(n)
CR=json.load(open(sys.argv[1]))
crate_w=[n for k,v in CR.items() if "Weapon" in k for n in v["items"]]
for n in crate_w:
    if n not in names: names.append(n)
names.append("Rising Sun Katana")
names=[n for n in names if not n.endswith("transparent.png") and n not in ("Flanker","Trooper","Arsonist","Annihilator","Brute","Mechanic","Doctor","Marksman","Agent")]
out=[]
for i in range(0,len(names),50):
    d=get(dict(action="query",prop="revisions",rvprop="content",rvslots="main",titles="|".join(names[i:i+50]),redirects=1))
    for p in d["query"]["pages"].values():
        if "revisions" not in p: continue
        t=p["revisions"][0]["slots"]["main"]["*"]
        if "{{Weapon" not in t: continue
        blk=re.search(r"\|\s*image1\s*=(.*?)\n\|\s*qualities",t,re.S)
        files=[f.strip() for f in re.findall(r"([^\n|=<>]+?\.(?:png|gif|jpg))",blk.group(1) if blk else "",re.I)]
        img=poolfile.get(p["title"]) or next((f for f in files if "render" in f.lower() and "viewmodel" not in f.lower()),None) or (files[0] if files else None)
        q=re.search(r"\|\s*qualities\s*=\s*([^\n]*)",t)
        cl=re.search(r"\|\s*class\s*=\s*([^\n]*)",t)
        ym=re.search(r"added_in\s*=\s*[^\n]*?(20\d\d)",t)
        if not img: continue
        out.append(dict(name=p["title"],file=img,q=q.group(1).strip() if q else "",cls=re.sub(r"\[\[|\]\]","",cl.group(1)).strip() if cl else "All",
                        yr=int(ym.group(1)) if ym else 2020,crate=p["title"] in crate_w,unobt="{{Unobtainable}}" in t))
json.dump(out,open(sys.argv[2],"w"),indent=0)
print(len(out),[o["name"] for o in out])
print("no collectors:",[o["name"] for o in out if "Collector" not in o["q"]])

import json, re, urllib.request, urllib.parse, sys, time
A="https://typicalcolors2.fandom.com/api.php"
def get(params):
    params=dict(params, format="json")
    url=A+"?"+urllib.parse.urlencode(params)
    for i in range(4):
        try:
            req=urllib.request.Request(url, headers={"User-Agent":"tc2-funcash-scraper/0.1"})
            return json.load(urllib.request.urlopen(req, timeout=60))
        except Exception as e:
            print("retry",e,file=sys.stderr); time.sleep(2)
    raise SystemExit("fail")
def catmembers(cat):
    out=[]; cont={}
    while True:
        d=get(dict(action="query",list="categorymembers",cmtitle="Category:"+cat,cmlimit=500,cmnamespace=0,**cont))
        out+= [m["title"] for m in d["query"]["categorymembers"]]
        if "continue" in d: cont={"cmcontinue":d["continue"]["cmcontinue"]}
        else: return out
cats={}
for c in ["Cosmetic","Hat","Head Cosmetic","Helmet","Glasses","Misc Cosmetic","Body Cosmetic","Unobtainable","Unusual item","Weaponry","Taunt","Collector's item","Vintage item","Genuine item","Haunted item","Developer/Contributor-only","Battle Pass Rewards","Season Pass Rewards","Achievement Item","Removed Content","Community item","Scrapped Content","Experimental item"]:
    cats[c]=catmembers(c); print(c,len(cats[c]),file=sys.stderr)
titles=sorted(set(cats["Cosmetic"])|set(["Golden Frying Pan","Golden Knife","Golden Wrench","Frying Pan"]))
wt={}
for i in range(0,len(titles),50):
    d=get(dict(action="query",prop="revisions",rvprop="content",rvslots="main",titles="|".join(titles[i:i+50]),redirects=1))
    for p in d["query"]["pages"].values():
        if "revisions" in p: wt[p["title"]]=p["revisions"][0]["slots"]["main"]["*"]
print("wikitext",len(wt),file=sys.stderr)
tu=get(dict(action="parse",page="Template:Unusual",prop="wikitext"))["parse"]["wikitext"]["*"]
json.dump({"cats":cats,"wt":wt,"unusualTpl":tu},open(sys.argv[1],"w"))

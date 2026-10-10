import json, re, urllib.request, urllib.parse, sys
A="https://typicalcolors2.fandom.com/api.php"
def get(p):
    return json.load(urllib.request.urlopen(urllib.request.Request(A+"?"+urllib.parse.urlencode(dict(p,format="json")),headers={"User-Agent":"tc2-funcash/0.1"}),timeout=60))
mem=[m["title"] for m in get(dict(action="query",list="categorymembers",cmtitle="Category:Crates",cmlimit=500))["query"]["categorymembers"]]
out={}
for i in range(0,len(mem),50):
    d=get(dict(action="query",prop="revisions|pageimages",rvprop="content",rvslots="main",titles="|".join(mem[i:i+50])))
    for p in d["query"]["pages"].values():
        t=p["revisions"][0]["slots"]["main"]["*"]
        items=[re.split(r"\{\{!\}\}",x)[0].strip() for x in re.findall(r"\|item\d+\s*=\s*([^\n]+)",t)]
        img=re.search(r"\|image1\s*=\s*([^\n]+)",t)
        cost=re.search(r"\{\{Funds\|([\d,]+)",t)
        status=re.search(r"\|status\s*=\s*([^\n]+)",t)
        if items: out[p["title"]]=dict(items=items,img=img.group(1).strip() if img else None,cost=int(cost.group(1).replace(",","")) if cost else None,status=status.group(1).strip() if status else "")
json.dump(out,open(sys.argv[1],"w"),indent=0)
for k,v in out.items(): print(k,len(v["items"]),v["cost"],v["status"],v["img"])

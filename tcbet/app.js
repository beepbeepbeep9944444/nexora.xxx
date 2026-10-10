/* TCBET — fun-coin Typical Colors 2 item site. No real money anywhere. */
(() => {
"use strict";

// ---------------------------------------------------------------- data
const ITEMS = window.TC2_ITEMS, EFFECTS = window.TC2_EFFECTS;
const ITEM = Object.fromEntries(ITEMS.map(i => [i.name, i]));
const FX = Object.fromEntries(EFFECTS.map(e => [e.name, e]));
const UNU_HATS = ITEMS.filter(i => i.unu);
const QCOLOR = { "Strange": "#e0773a", "Collector's": "#e03a3a", "Vintage": "#6b8fd1", "Genuine": "#5fa36f", "Haunted": "#38f3ab" };
const TRADEABLE = ITEMS.filter(i => !i.weapon || (i.base && i.q !== "Haunted"));
const STANDARD = new Set(["S1","S2","S3","S4","S5","S6","S7","S8","S9","S10"]);

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const r2 = n => Math.round(n * 100) / 100;
const fmt = n => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967295; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let uid = Date.now();
const newId = () => (uid++).toString(36);

// Which effects can legally sit on which hat (rules pulled from the wiki: crate seasons, Unusualifier list, etc.)
const allowed = (hat, fx) => hat.fx.some(g => fx.g.includes(g));
const allowedFx = hat => EFFECTS.filter(e => allowed(hat, e));
// older hats carry the value; newer hats sit lower (on top of a small per-hat popularity spread)
const AGE = yr => yr <= 2017 ? 2.6 : yr <= 2018 ? 2.2 : yr <= 2019 ? 1.7 : yr <= 2020 ? 1.5 : yr <= 2021 ? 1.2 : yr <= 2022 ? 1 : yr <= 2023 ? .85 : .7;
// battle/season pass hats were guaranteed unusuals, so they trade low
const hatFactor = h => (h.bp ? .3 : 1) * AGE(h.yr || 2022) * (0.8 + 0.4 * hash(h.name)) * (1 + Math.min(0.3, Math.log10(1 + h.v) * 0.1));

function value(it) {
  const base = ITEM[it.n];
  if (!base) return 0;
  if (!it.fx) return base.v;
  const fx = FX[it.fx];
  // Unusualifier effects are cheap to apply in-game, so an old hat doesn't make them worth more
  return r2(Math.min(18000, fx.m * (fx.g.includes("UX") ? Math.min(1, hatFactor(base)) : hatFactor(base))));
}
const label = it => it.fx ? `${it.fx} ${it.n}` : it.n;
const total = list => r2(list.reduce((s, it) => s + value(it), 0));
function rarity(v, fx) {
  if (fx) return "var(--unu2)";
  return v >= 1000 ? "var(--r6)" : v >= 100 ? "var(--r5)" : v >= 20 ? "var(--r4)" : v >= 4 ? "var(--r3)" : v >= 1 ? "var(--r2)" : "var(--r1)";
}
const coinVal = v => `<span class="val"><i class="coin"></i>${fmt(v)}</span>`;

// ---------------------------------------------------------------- state
const SAVE = "tcbet_save_v1";
const fresh = () => ({ bal: 100, inv: [], daily: 0, stats: { opened: 0, wagered: 0, won: 0 } });
let S;
try { S = JSON.parse(localStorage.getItem(SAVE)) || null; } catch { S = null; }
if (!S || !Array.isArray(S.inv)) {
  S = fresh();
  ITEMS.filter(i => i.v < 1.5 && !i.weapon).sort(() => Math.random() - .5).slice(0, 4).forEach(i => S.inv.push({ id: newId(), n: i.name }));
}
S.inv = S.inv.filter(it => ITEM[it.n] && (!it.fx || (FX[it.fx] && allowed(ITEM[it.n], FX[it.fx]))));
const save = () => { try { localStorage.setItem(SAVE, JSON.stringify(S)); } catch {} };
function setBal(delta) {
  S.bal = r2(Math.max(0, S.bal + delta)); save();
  $("#balance span").textContent = fmt(S.bal);
  const b = $("#balance"); b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump");
}
function addItems(list) { list.forEach(it => S.inv.unshift({ id: newId(), n: it.n, fx: it.fx || undefined })); save(); syncTop(); }
function removeIds(ids) { const s = new Set(ids); S.inv = S.inv.filter(it => !s.has(it.id)); save(); syncTop(); }
function syncTop() { $("#balance span").textContent = fmt(S.bal); $("#invCount").textContent = S.inv.length; syncDaily(); }

// ---------------------------------------------------------------- rendering helpers
function thumb(it, cls = "") {
  const b = ITEM[it.n], fx = it.fx && FX[it.fx];
  return `<div class="thumb ${fx ? "has-fx" : ""} ${cls}">${fx ? `<img class="fx" src="${fx.img}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}<img class="hat" src="${b.img}" alt="${esc(label(it))}" loading="lazy" referrerpolicy="no-referrer"></div>`;
}
function card(it, { sub, click, sel, extra = "", priceOverride } = {}) {
  const v = priceOverride ?? value(it);
  const rc = rarity(v, it.fx);
  const q = !it.fx && ITEM[it.n].q;
  return `<div class="card ${it.fx ? "unusual" : ""} ${click ? "click" : ""} ${sel ? "sel" : ""}" style="--rc:${rc}" ${it.id ? `data-id="${it.id}"` : ""} ${extra}>
    <span class="check">✓</span><div class="glow"></div>${thumb(it)}
    <div class="meta"><div class="nm" title="${esc(label(it))}" ${q ? `style="color:${QCOLOR[q]}"` : ""}>${esc(label(it))}</div>
    <div class="sub">${esc(sub ?? (it.fx ? "Unusual · " + ITEM[it.n].worn : (q ? q + " · " : "") + ITEM[it.n].worn))}</div>
    <div class="price">${coinVal(v)}</div></div></div>`;
}
function mini(it) { return `<div class="mini" style="--rc:${rarity(value(it), it.fx)}" title="${esc(label(it))} — ${fmt(value(it))}">${thumb(it)}</div>`; }
function minis(list, n = 6) { return list.slice(0, n).map(mini).join("") + (list.length > n ? `<div class="mini-more">+${list.length - n}</div>` : ""); }

function toast(msg, kind = "") {
  const t = document.createElement("div"); t.className = "toast " + kind; t.innerHTML = msg;
  $("#toasts").append(t); setTimeout(() => t.remove(), 3800);
}
function modal(html) { $("#modalCard").innerHTML = html; $("#modal").hidden = false; return $("#modalCard"); }
function closeModal() { $("#modal").hidden = true; $("#modalCard").innerHTML = ""; }
$("#modal").addEventListener("mousedown", e => { if (e.target.id === "modal" && !$("#modal").dataset.lock) closeModal(); });

// ---------------------------------------------------------------- bots
const BOT_NAMES = ["xXFlankerMainXx","Trooper_Joe","pyroboi2009","mechanic_lord","DocHealzz","AgentSmoke","MarksmanMike","brute_force77","annihilat0r","RocketJumpRay","TC2_Grinder","GRN_Gaming","RedTeamRuler","hatcollector","ItsUnusualTime","Fitten_Fan","sentry_sam","QuickScopeQ","backstab_betty","CrateKing","Lupara_Larry","notchill_fan","burnin_bacon","golden_pan_hunter","2Fort_Vet","DustbowlDan","DoublefortDiva","intel_runner","Bloxy_Boi","HardNewsHank"];
const PFP_COLORS = ["#ef4444","#22c55e","#3b82f6","#f59e0b","#8b5cf6","#ec4899","#14b8a6","#f97316"];
const pfpColor = n => PFP_COLORS[Math.floor(hash(n) * PFP_COLORS.length)];
const pfp = (n, cls = "pfp") => `<div class="${cls}" style="background:${pfpColor(n)}">${esc(n[0].toUpperCase())}</div>`;

// random loadout worth roughly `target` coins (respects unusual lock rules)
function randomUnusual(hats = UNU_HATS, groups) {
  for (let i = 0; i < 50; i++) {
    const h = pick(hats);
    let opts = allowedFx(h).filter(e => !groups || e.g.some(g => groups.includes(g)));
    opts = opts.filter(e => !e.g.includes("DEV") || Math.random() < .08);
    if (!groups && Math.random() < .85 && opts.some(e => !e.g.includes("UX"))) opts = opts.filter(e => !e.g.includes("UX"));
    if (opts.length) return { n: h.name, fx: pick(opts).name };
  }
  return null;
}
function botLoadout(target) {
  const out = []; let left = target;
  if (target > 60 && Math.random() < .85) {
    for (let i = 0; i < 40; i++) { const u = randomUnusual(); if (u && value(u) <= left * 1.05) { out.push(u); left -= value(u); break; } }
  }
  const pool = TRADEABLE;
  for (let g = 0; g < 400 && left > 0.1 && out.length < 14; g++) {
    const i = pick(pool);
    if (i.v <= left * 1.02 && (i.v > left * 0.08 || g > 200)) { out.push({ n: i.name }); left -= i.v; }
  }
  if (!out.length) out.push({ n: ITEMS[ITEMS.length - 1].name });
  return out.sort((a, b) => value(b) - value(a));
}

// ---------------------------------------------------------------- cases
const SEASON_OF = c => c.weapons ? "Weapons" : c.fx.includes("S1") ? "Classic" : c.fx.includes("S2") || c.fx.includes("S5") ? "Summer" : c.fx.includes("S3") ? "Halloween" : "Holiday";
function buildCase(id, name, img, entries, opts = {}) {
  const tw = entries.reduce((s, e) => s + e.w, 0);
  entries.forEach(e => e.p = e.w / tw);
  const ev = entries.reduce((s, e) => s + e.p * (e.ev ?? value(e.it)), 0);
  return { id, name, img, entries, season: opts.season, tag: opts.tag, price: opts.price ?? Math.max(0.25, r2(ev * 1.1)), ev };
}
function unusualEntry(hats, groups, p) {
  // expected value of a random legal unusual from this pool (sampled once, deterministic enough)
  let s = 0, n = 0;
  for (const h of hats) { const fx = allowedFx(h).filter(e => e.g.some(g => groups.includes(g))); for (const e of fx) { s += value({ n: h.name, fx: e.name }); n++; } }
  return { unusual: { hats, groups }, w: p, ev: n ? s / n : 0, it: null };
}
const CASES = [];
for (const c of window.TC2_CRATES) {
  const pool = c.items.map(n => ITEM[n]).filter(Boolean);
  if (pool.length < 5 || !c.img) continue;
  const groups = c.fx.filter(g => STANDARD.has(g));
  const hats = pool.filter(h => h.unu && allowedFx(h).some(e => e.g.some(g => groups.includes(g))));
  const entries = pool.map(i => ({ it: { n: i.name }, w: 1 / Math.pow(Math.max(i.v, .05), .75) }));
  const tw = entries.reduce((s, e) => s + e.w, 0);
  if (hats.length) entries.push(unusualEntry(hats, groups, tw * 0.0101)); // ~1% like the real game
  CASES.push(buildCase(c.name.replace(/\W+/g, "-").toLowerCase(), c.name, c.img, entries, { season: SEASON_OF(c), tag: c.avail ? "In game" : "Retired" }));
}
{ // house cases
  const hats = UNU_HATS.filter(h => allowedFx(h).some(e => e.g.some(g => STANDARD.has(g))));
  const std = [...STANDARD];
  const unu = buildCase("unusual-box", "Unusual Box", "logo-mark.svg", [unusualEntry(hats, std, 1)], { season: "Classic", tag: "100% Unusual" });
  unu.price = r2(unu.ev * 1.08);
  CASES.unshift(unu);
  const top = ITEMS.filter(i => !i.weapon && i.v > 150).slice(0, 14);
  const g = buildCase("golden-gamble", "Golden Gamble", ITEM["Golden Frying Pan"].img, [
    { it: { n: "Golden Frying Pan" }, w: 0.4 }, { it: { n: "Frying Pan" }, w: 0.9 }, { it: { n: "Golden Knife" }, w: 1.6 }, { it: { n: "Golden Wrench" }, w: 1.8 },
    { it: { n: "Collector's Rising Sun Katana" }, w: 3 },
    ...ITEMS.filter(i => i.q === "Haunted").map(i => ({ it: { n: i.name }, w: 4000 / i.v })),
    ...top.map(i => ({ it: { n: i.name }, w: 6 })),
    unusualEntry(hats, std, 20),
    ...ITEMS.filter(i => i.v > 3 && i.v < 30).slice(0, 18).map(i => ({ it: { n: i.name }, w: 12 })),
  ], { season: "Classic", tag: "Golden Frying Pan inside" });
  CASES.unshift(g);
  const col = ITEMS.filter(i => i.q === "Collector's" && i.base !== "Rising Sun Katana"), str = ITEMS.filter(i => i.q === "Strange" && i.base);
  const cc = buildCase("collectors-cache", "Collector's Cache", ITEM["Collector's Rising Sun Katana"].img, [
    ...col.map(i => ({ it: { n: i.name }, w: 0.12 })), { it: { n: "Strange Rising Sun Katana" }, w: 0.6 },
    ...str.map(i => ({ it: { n: i.name }, w: 1 })),
  ], { season: "Weapons", tag: "Collector's weapons" });
  CASES.splice(2, 0, cc);
}
function rollCase(c) {
  let r = Math.random();
  for (const e of c.entries) { if ((r -= e.p) <= 0) return materialize(e); }
  return materialize(c.entries[0]);
}
function materialize(e) { return e.unusual ? randomUnusual(e.unusual.hats, e.unusual.groups) : { ...e.it }; }
const mysteryCard = p => `<div class="card" style="--rc:var(--unu2)"><div class="glow"></div><div class="thumb" style="background:radial-gradient(circle,#3b2357,#0b0910)"><div style="font:900 54px Rubik;color:var(--unu2);text-shadow:0 0 20px var(--unu)">★</div></div><div class="meta"><div class="nm" style="color:var(--unu2)">Unusual Hat</div><div class="sub">Legal effect for this crate</div><div class="odds">${p != null ? (p * 100).toFixed(2) + "%" : ""}</div></div></div>`;

function viewCases() {
  const q = (location.hash.split("?q=")[1] || "");
  $("#view").innerHTML = `
    <div class="page-head"><div><h1>Cases</h1><p>Real Typical Colors 2 crates with their real item pools. ~1% chance at an Unusual, with effects locked to the crate's season.</p></div>
      <div class="tabs" id="caseFilter">${["All","Classic","Summer","Halloween","Holiday","Weapons"].map(s => `<button data-s="${s}" class="${s === "All" ? "on" : ""}">${s}</button>`).join("")}</div></div>
    <div class="cases" id="caseGrid"></div>`;
  const draw = s => $("#caseGrid").innerHTML = CASES.filter(c => s === "All" || c.season === s).map(c => `
    <a class="case-tile" href="#/case/${c.id}">
      <span class="chip season ${c.season}">${c.tag || c.season}</span>
      <img src="${c.img}" alt="" referrerpolicy="no-referrer" loading="lazy">
      <h3>${esc(c.name)}</h3><div class="muted" style="font-size:12px">${c.entries.length} drops · ${c.season}</div>
      <span class="btn btn-gold">${coinVal(c.price).replace('class="val"', 'class="val" style="color:#1a1204"')}</span></a>`).join("");
  draw("All");
  $("#caseFilter").onclick = e => { const b = e.target.closest("button"); if (!b) return; $$("#caseFilter button").forEach(x => x.classList.toggle("on", x === b)); draw(b.dataset.s); };
}

function viewCase(id) {
  const c = CASES.find(x => x.id === id); if (!c) return go("cases");
  const sorted = [...c.entries].sort((a, b) => (b.ev ?? value(b.it)) - (a.ev ?? value(a.it)));
  $("#view").innerHTML = `
    <div class="case-open">
      <div class="panel case-hero"><img src="${c.img}" alt="" referrerpolicy="no-referrer">
        <div><a href="#/cases" class="muted">← All cases</a><h1>${esc(c.name)}</h1><div class="muted">${c.season} season · Expected value ${coinVal(c.ev)}</div></div>
        <div class="case-actions"><div class="tabs" id="qty">${[1,2,3,5].map(n => `<button data-n="${n}" class="${n === 1 ? "on" : ""}">${n}x</button>`).join("")}</div>
        <button class="btn" id="fastBtn">Quick</button><button class="btn btn-gold" id="openBtn">Open for ${fmt(c.price)}</button></div></div>
      <div id="reels"><div class="reel-wrap"><div class="reel-marker"></div><div class="reel"></div></div></div>
      <div><div class="section-title">Drops in this case</div><div class="grid">${sorted.map(e => e.unusual ? mysteryCard(e.p) : card(e.it, { sub: (e.p * 100).toFixed(e.p < .01 ? 3 : 2) + "% chance" })).join("")}</div></div>
    </div>`;
  let qty = 1, fast = false, busy = false;
  $("#qty").onclick = e => { const b = e.target.closest("button"); if (!b || busy) return; qty = +b.dataset.n; $$("#qty button").forEach(x => x.classList.toggle("on", x === b)); $("#openBtn").textContent = `Open ${qty > 1 ? qty + "x " : ""}for ${fmt(c.price * qty)}`; };
  $("#fastBtn").onclick = () => { fast = !fast; $("#fastBtn").classList.toggle("btn-unu", fast); };
  $("#openBtn").onclick = async () => {
    if (busy) return;
    const cost = r2(c.price * qty);
    if (S.bal < cost) return toast("Not enough fun-coins. Claim free coins or sell some items.", "bad");
    busy = true; $("#openBtn").disabled = true;
    setBal(-cost); S.stats.opened += qty;
    const wins = Array.from({ length: qty }, () => rollCase(c));
    $("#reels").innerHTML = wins.map(() => `<div class="reel-wrap" style="margin-bottom:10px"><div class="reel-marker"></div><div class="reel"></div></div>`).join("");
    await Promise.all(wins.map((w, i) => spinReel($$("#reels .reel")[i], c, w, fast ? 1600 : 5600)));
    wins.forEach(w => pushDrop("You", w, true));
    showWins(wins, c);
    busy = false; $("#openBtn").disabled = false;
  };
}
async function spinReel(reel, c, win, ms) {
  const N = 58, WIN = 50, W = 158;
  const strip = Array.from({ length: N }, (_, i) => i === WIN ? null : rollEntry(c));
  reel.innerHTML = strip.map(e => e === null ? (win.fx ? card(win) : card(win)) : e.unusual ? mysteryCard() : card(e.it)).join("");
  // show a mystery star in the reel even when the win is unusual, reveal after stop
  if (win.fx) reel.children[WIN].outerHTML = mysteryCard();
  const wrapW = reel.parentElement.clientWidth;
  const offset = WIN * W + rand(10, 140) - wrapW / 2;
  reel.style.transition = "none"; reel.style.transform = "translateX(0)"; void reel.offsetWidth;
  reel.style.transition = `transform ${ms}ms cubic-bezier(.08,.72,.12,1)`;
  reel.style.transform = `translateX(${-offset}px)`;
  await sleep(ms + 150);
  if (win.fx) { reel.children[WIN].outerHTML = card(win); await sleep(fastReveal(ms)); }
}
const fastReveal = ms => ms > 2000 ? 700 : 250;
function rollEntry(c) { let r = Math.random(); for (const e of c.entries) if ((r -= e.p) <= 0) return e; return c.entries[0]; }

function showWins(wins, c) {
  const tv = total(wins);
  const m = modal(`<div class="win-show"><h2>${wins.some(w => w.fx) ? "UNUSUAL UNBOXED!" : "You unboxed"}</h2><div class="muted">Total ${coinVal(tv)}</div>
    <div class="grid" style="margin-top:14px;grid-template-columns:repeat(auto-fit,minmax(170px,220px));justify-content:center">${wins.map(w => card(w)).join("")}</div>
    <div style="display:flex;gap:10px;justify-content:center;margin-top:18px"><button class="btn" id="sellAll">Sell all for ${fmt(r2(tv * .95))}</button><button class="btn btn-gold" id="keepAll">Keep items</button></div></div>`);
  if (wins.some(w => w.fx)) sysChat(`You unboxed an <b>${esc(label(wins.find(w => w.fx)))}</b>!`);
  $("#keepAll", m).onclick = () => { addItems(wins); closeModal(); toast(`Added ${wins.length} item${wins.length > 1 ? "s" : ""} to your inventory`, "good"); };
  $("#sellAll", m).onclick = () => { setBal(r2(tv * .95)); closeModal(); toast(`Sold for ${fmt(r2(tv * .95))} fun-coins`, "good"); };
}

// ---------------------------------------------------------------- unusualifier (upgrader)
const U = { stake: new Set(), hat: null, fx: null, tab: "stake", hatScope: "all", q: "" };
function viewUnusualifier() {
  $("#view").innerHTML = `
    <div class="page-head"><div><h1>Unusualifier</h1><p>Stake items from your inventory, pick a hat and an effect it can actually roll, and spin. Win and the Unusual is yours.</p></div></div>
    <div class="upg">
      <div class="panel upg-slot"><h3>Your stake</h3><div class="upg-preview" id="stakePrev"></div><div id="stakeVal"></div></div>
      <div class="panel upg-center">
        <div class="dial" id="dial">
          <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="none" stroke="#1c2130" stroke-width="9"/>
            <circle id="arc" cx="50" cy="50" r="44" fill="none" stroke="url(#ug)" stroke-width="9" stroke-dasharray="0 999" stroke-linecap="butt"/>
            <defs><linearGradient id="ug"><stop offset="0" stop-color="#b07ad8"/><stop offset="1" stop-color="#8650ac"/></linearGradient></defs></svg>
          <div class="needle" id="needle"></div>
          <div class="readout"><div><b id="chance">0.00%</b><span>win chance</span></div></div>
        </div>
        <div class="mults" id="mults"></div>
        <button class="btn btn-unu" id="spinBtn" style="width:100%">Unusualify</button>
        <div class="muted" style="font-size:12px;text-align:center">Chance = stake ÷ target × 95%, capped at 75%.</div>
      </div>
      <div class="panel upg-slot"><h3>Target unusual</h3><div class="upg-preview" id="targetPrev"></div><div id="targetVal"></div></div>
    </div>
    <div class="panel picker" style="padding:16px">
      <div class="picker-head"><div class="tabs" id="upgTabs"><button data-t="stake">1 · Stake items</button><button data-t="hat">2 · Choose hat</button><button data-t="fx">3 · Choose effect</button></div>
        <input id="upgSearch" placeholder="Search…"></div>
      <div id="pickerBody"></div>
    </div>`;
  $("#upgTabs").onclick = e => { const b = e.target.closest("button"); if (b) { U.tab = b.dataset.t; U.q = ""; $("#upgSearch").value = ""; drawPicker(); } };
  $("#upgSearch").oninput = e => { U.q = e.target.value.toLowerCase(); drawPicker(); };
  $("#spinBtn").onclick = spinUpgrade;
  drawUpg(); drawPicker();
}
const stakeItems = () => S.inv.filter(it => U.stake.has(it.id));
const target = () => U.hat && U.fx ? { n: U.hat, fx: U.fx } : null;
function upgChance() { const t = target(); if (!t) return 0; const s = total(stakeItems()); return Math.min(.75, s / value(t) * .95); }
function drawUpg() {
  const st = stakeItems(), t = target();
  $("#stakePrev").innerHTML = st.length ? (st.length === 1 ? thumb(st[0]) : `<div class="mini-items" style="flex-wrap:wrap;justify-content:center;padding:14px">${st.slice(0, 15).map(mini).join("")}</div>`) : `<div class="ph">Select items from your inventory below</div>`;
  $("#stakeVal").innerHTML = `<div class="muted">${st.length} item${st.length === 1 ? "" : "s"}</div>${coinVal(total(st))}`;
  if (t) { $("#targetPrev").innerHTML = thumb(t); $("#targetVal").innerHTML = `<div style="color:var(--unu2);font-weight:700">${esc(label(t))}</div>${coinVal(value(t))}`; }
  else if (U.hat) { $("#targetPrev").innerHTML = thumb({ n: U.hat }); $("#targetVal").innerHTML = `<div class="muted">${esc(U.hat)} · pick an effect</div>`; }
  else { $("#targetPrev").innerHTML = `<div class="ph">Choose a hat, then an effect</div>`; $("#targetVal").innerHTML = ""; }
  const ch = upgChance();
  $("#chance").textContent = (ch * 100).toFixed(2) + "%";
  $("#arc").setAttribute("stroke-dasharray", `${ch * 2 * Math.PI * 44} 999`);
  $("#spinBtn").disabled = !t || !st.length || total(st) >= value(t);
  $("#spinBtn").textContent = t && st.length && total(st) >= value(t) ? "Stake is worth more than target" : "Unusualify";
  $("#mults").innerHTML = t ? "" : (st.length ? [2, 3, 5, 10, 20].map(m => `<button data-m="${m}">${m}x</button>`).join("") : "");
  $("#mults").onclick = e => { const b = e.target.closest("button"); if (b) autoTarget(total(st) * +b.dataset.m); };
}
function autoTarget(v) {
  // find a legal hat+effect closest to v (prefers hats you own if in "mine" scope)
  let best = null, bd = Infinity;
  for (const h of UNU_HATS) for (const e of allowedFx(h)) { const d = Math.abs(value({ n: h.name, fx: e.name }) - v); if (d < bd && Math.random() > .3) { bd = d; best = [h.name, e.name]; } }
  if (best) { [U.hat, U.fx] = best; U.tab = "fx"; U.q = ""; $("#upgSearch").value = ""; drawUpg(); drawPicker(); }
}
function drawPicker() {
  $$("#upgTabs button").forEach(b => b.classList.toggle("on", b.dataset.t === U.tab));
  const body = $("#pickerBody"), q = U.q;
  if (U.tab === "stake") {
    const list = S.inv.filter(it => label(it).toLowerCase().includes(q)).sort((a, b) => value(b) - value(a));
    body.innerHTML = list.length ? `<div class="grid">${list.map(it => card(it, { click: 1, sel: U.stake.has(it.id) })).join("")}</div>` : `<div class="empty">Your inventory is empty. Open a case or visit the Market.</div>`;
    body.onclick = e => { const c = e.target.closest(".card"); if (!c) return; const id = c.dataset.id; U.stake.has(id) ? U.stake.delete(id) : U.stake.add(id); c.classList.toggle("sel"); drawUpg(); };
  } else if (U.tab === "hat") {
    const mine = new Set(S.inv.map(i => i.n));
    const hats = UNU_HATS.filter(h => (U.hatScope === "all" || mine.has(h.name)) && h.name.toLowerCase().includes(q));
    body.innerHTML = `<div class="tabs" id="hatScope" style="display:inline-flex;margin-bottom:12px"><button data-s="all" class="${U.hatScope === "all" ? "on" : ""}">All hats</button><button data-s="mine" class="${U.hatScope === "mine" ? "on" : ""}">Hats I own</button></div>
      <div class="grid">${hats.map(h => card({ n: h.name }, { click: 1, sel: U.hat === h.name, sub: `${allowedFx(h).length} legal effects`, extra: `data-hat="${esc(h.name)}"` })).join("") || `<div class="empty">No hats found</div>`}</div>`;
    body.onclick = e => {
      const s = e.target.closest("#hatScope button"); if (s) { U.hatScope = s.dataset.s; return drawPicker(); }
      const c = e.target.closest(".card"); if (!c) return; U.hat = c.dataset.hat; U.fx = null; U.tab = "fx"; U.q = ""; $("#upgSearch").value = ""; drawUpg(); drawPicker();
    };
  } else {
    if (!U.hat) { body.innerHTML = `<div class="empty">Pick a hat first.</div>`; return; }
    const h = ITEM[U.hat], legal = allowedFx(h), lockedN = EFFECTS.length - legal.length;
    const src = h.fx.map(g => ({ UX: "Unusualifier effects (low value)", HAUNT: "Haunted", DEV: "Developer", COMM: "Community Sparkle", CODE: "Code-exclusive" }[g] || null)).filter(Boolean);
    const series = h.fx.filter(g => STANDARD.has(g)).map(g => g.slice(1)).sort((a, b) => a - b);
    body.innerHTML = `<div class="lock-note" style="margin-bottom:12px"><b>${esc(h.name)}</b> can roll ${legal.length} effects: ${series.length ? "crate series " + series.join(", ") : "no crate series"}${src.length ? " + " + src.join(", ") : ""}. ${lockedN} other effects are locked because this hat never came with them.</div>
      <div class="fx-grid">${legal.filter(e => e.name.toLowerCase().includes(q)).sort((a, b) => a.m - b.m).map(e => card({ n: h.name, fx: e.name }, { click: 1, sel: U.fx === e.name, sub: e.series, extra: `data-fx="${esc(e.name)}"` })).join("")}</div>`;
    body.onclick = e => { const c = e.target.closest(".card"); if (!c) return; U.fx = c.dataset.fx; $$(".card", body).forEach(x => x.classList.toggle("sel", x === c)); drawUpg(); };
  }
}
let upgBusy = false;
async function spinUpgrade() {
  if (upgBusy) return;
  const st = stakeItems(), t = target(), ch = upgChance(); if (!t || !st.length) return;
  upgBusy = true; $("#spinBtn").disabled = true; $("#dial").className = "dial";
  removeIds(st.map(i => i.id)); U.stake.clear();
  S.stats.wagered += total(st);
  const roll = Math.random(), win = roll < ch;
  const needle = $("#needle");
  needle.style.transition = "none"; needle.style.transform = "rotate(0deg)"; void needle.offsetWidth;
  needle.style.transition = ""; needle.style.transform = `rotate(${360 * 5 + roll * 360}deg)`;
  await sleep(4400);
  $("#dial").classList.add(win ? "win" : "lose");
  $("#chance").textContent = win ? "WIN" : "LOSS";
  if (win) { addItems([t]); S.stats.won += value(t); save(); sysChat(`Unusualified a <b>${esc(label(t))}</b> at ${(ch * 100).toFixed(2)}%!`); pushDrop("You", t, true);
    modal(`<div class="win-show"><h2>Unusualified!</h2>${thumb(t)}<div class="nm" style="color:var(--unu2)">${esc(label(t))}</div><div style="margin:6px 0 16px">${coinVal(value(t))}</div><button class="btn btn-gold" onclick="document.getElementById('modal').hidden=true">Nice</button></div>`);
  } else toast(`The effect fizzled. Lost ${fmt(total(st))} in items.`, "bad");
  await sleep(1200); upgBusy = false; if (route()[0] === "unusualifier") { U.fx = win ? null : U.fx; drawUpg(); drawPicker(); }
}

// ---------------------------------------------------------------- inventory picker modal (shared)
function pickItems({ title, min = 0, max = Infinity, confirm = "Confirm", hint = "" }) {
  return new Promise(res => {
    const sel = new Set();
    const list = [...S.inv].sort((a, b) => value(b) - value(a));
    const m = modal(`<h2>${title}</h2><div class="muted" style="margin-bottom:12px">${hint}</div>
      ${list.length ? `<div class="grid" id="pk">${list.map(it => card(it, { click: 1 })).join("")}</div>` : `<div class="empty">Your inventory is empty.</div>`}
      <div class="sel-bar"><span id="pkInfo" class="grow muted">Nothing selected</span><button class="btn" id="pkCancel">Cancel</button><button class="btn btn-gold" id="pkOk" disabled>${confirm}</button></div>`);
    const upd = () => { const v = total(list.filter(i => sel.has(i.id))); $("#pkInfo").innerHTML = `${sel.size} selected · ${coinVal(v)}`; $("#pkOk").disabled = !(v >= min && v <= max && sel.size); };
    m.onclick = e => { const c = e.target.closest("#pk .card"); if (!c) return; const id = c.dataset.id; sel.has(id) ? sel.delete(id) : sel.add(id); c.classList.toggle("sel"); upd(); };
    $("#pkCancel").onclick = () => { closeModal(); res(null); };
    $("#pkOk").onclick = () => { const out = list.filter(i => sel.has(i.id)); closeModal(); res(out); };
  });
}

// ---------------------------------------------------------------- coinflip
const CF = { games: [] };
function newBotFlip() { const v = r2(Math.pow(Math.random(), 2.4) * 900 + rand(1, 8)); const items = botLoadout(v); CF.games.unshift({ id: newId(), a: { name: pick(BOT_NAMES), items, side: Math.random() < .5 ? "RED" : "GRN" }, b: null, state: "open" }); }
for (let i = 0; i < 6; i++) newBotFlip();
function viewCoinflip() {
  $("#view").innerHTML = `<div class="page-head"><div><h1>Coinflip</h1><p>RED or GRN. Match the other player's items within ±10% and flip for everything.</p></div><button class="btn btn-gold" id="cfCreate">Create game</button></div><div class="cf-list" id="cfList"></div>`;
  $("#cfCreate").onclick = createFlip; drawFlips();
}
function drawFlips() {
  const el = $("#cfList"); if (!el) return;
  const open = CF.games.filter(g => g.state !== "done").slice(0, 12);
  el.innerHTML = open.map(g => { const v = total(g.a.items); return `<div class="panel cf-row">
      <div class="player"><div class="pfp" style="background:${pfpColor(g.a.name)}">${esc(g.a.name[0].toUpperCase())}<span class="side ${g.a.side}"></span></div><div><div class="nm">${esc(g.a.name)}</div><div class="muted" style="font-size:12px">${g.a.items.length} items · ${g.a.side}</div></div></div>
      <div class="mini-items">${minis(g.a.items, 7)}</div>
      <div>${coinVal(v)}<div class="muted" style="font-size:11px">${fmt(v * .9)} – ${fmt(v * 1.1)}</div></div>
      <div>${g.state === "open" ? (g.a.name === "You" ? `<span class="chip">Waiting for opponent…</span>` : `<button class="btn btn-${g.a.side === "RED" ? "grn" : "red"}" data-join="${g.id}" style="width:100%">Join as ${g.a.side === "RED" ? "GRN" : "RED"}</button>`) : `<button class="btn" data-watch="${g.id}" style="width:100%">Flipping…</button>`}</div></div>`; }).join("") || `<div class="empty">No open games.</div>`;
  el.onclick = e => { const j = e.target.closest("[data-join]"); if (j) joinFlip(CF.games.find(g => g.id === j.dataset.join)); };
}
async function joinFlip(g) {
  const v = total(g.a.items);
  const items = await pickItems({ title: `Join ${esc(g.a.name)}'s flip`, min: v * .9, max: v * 1.1, confirm: "Join & flip", hint: `Select items worth ${fmt(v * .9)} – ${fmt(v * 1.1)}.` });
  if (!items || g.state !== "open") return;
  removeIds(items.map(i => i.id));
  g.b = { name: "You", items, side: g.a.side === "RED" ? "GRN" : "RED" }; g.state = "flip";
  runFlip(g, true);
}
async function createFlip() {
  const items = await pickItems({ title: "Create a coinflip", min: 0.1, confirm: "Next", hint: "Select the items you want to flip." });
  if (!items) return;
  const side = await new Promise(res => { const m = modal(`<h2>Pick your side</h2><div class="vs" style="margin-top:18px"><button class="btn btn-red" data-s="RED" style="padding:24px">RED</button><span class="muted">or</span><button class="btn btn-grn" data-s="GRN" style="padding:24px">GRN</button></div>`); m.onclick = e => { const b = e.target.closest("[data-s]"); if (b) { closeModal(); res(b.dataset.s); } }; });
  removeIds(items.map(i => i.id));
  const g = { id: newId(), a: { name: "You", items, side }, b: null, state: "open" };
  CF.games.unshift(g); drawFlips(); toast("Game created. Waiting for an opponent…");
  await sleep(rand(2500, 6000));
  const v = total(items);
  g.b = { name: pick(BOT_NAMES), items: botLoadout(v * rand(.92, 1.06)), side: side === "RED" ? "GRN" : "RED" }; g.state = "flip";
  runFlip(g, true);
}
async function runFlip(g, mine) {
  drawFlips();
  const pot = [...g.a.items, ...g.b.items], pv = total(pot);
  const winSide = Math.random() < .5 ? "RED" : "GRN";
  const winner = g.a.side === winSide ? g.a : g.b;
  if (mine) {
    $("#modal").dataset.lock = 1;
    const side = p => `<div><div class="player" style="justify-content:center;flex-direction:column">${pfp(p.name)}<b>${esc(p.name)}</b><span class="chip"><span class="side ${p.side}" style="position:static;display:inline-block;width:10px;height:10px;border:0"></span>${p.side}</span></div><div style="margin-top:8px">${coinVal(total(p.items))}</div><div class="mini-items" style="justify-content:center;margin-top:8px">${minis(p.items, 4)}</div></div>`;
    modal(`<h2 style="text-align:center">Coinflip</h2><div class="vs" style="margin-top:12px">${side(g.a)}<div class="coin3d" id="coin3d"><div class="face RED">RED</div><div class="face GRN">GRN</div></div>${side(g.b)}</div><div id="cfRes" style="text-align:center;margin-top:12px" class="muted">Flipping for ${fmt(pv)}…</div>`);
    const coin = $("#coin3d");
    const turns = 8 + (winSide === "GRN" ? .5 : 0);
    coin.animate([{ transform: "rotateY(0)" }, { transform: `rotateY(${turns * 360}deg)` }], { duration: 3200, easing: "cubic-bezier(.2,.7,.2,1)", fill: "forwards" });
    await sleep(3400);
    delete $("#modal").dataset.lock;
    const iWon = winner.name === "You";
    S.stats.wagered += total((g.a.name === "You" ? g.a : g.b).items);
    if (iWon) { addItems(pot); S.stats.won += pv; save(); }
    $("#cfRes").innerHTML = `<h2 style="color:${winSide === "RED" ? "var(--red)" : "var(--grn)"}">${winSide} wins!</h2>${iWon ? `You won ${coinVal(pv)} in items.` : `${esc(winner.name)} took the pot.`}<div style="margin-top:14px"><button class="btn" onclick="document.getElementById('modal').hidden=true">Close</button></div>`;
    if (pv > 200) sysChat(`<b>${esc(winner.name)}</b> won a ${fmt(pv)} coinflip!`);
  } else await sleep(3400);
  g.state = "done"; drawFlips();
}

// ---------------------------------------------------------------- jackpot
const JP = { round: 1, entries: [], timer: null, ends: 0, spinning: false, history: [] };
function jpTotal() { return r2(JP.entries.reduce((s, e) => s + e.value, 0)); }
function jpAdd(name, items) {
  if (JP.spinning) return false;
  const ex = JP.entries.find(e => e.name === name);
  if (ex) { ex.items.push(...items); ex.value = total(ex.items); } else JP.entries.push({ name, items, value: total(items), color: name === "You" ? "#f5b83d" : pfpColor(name) });
  if (JP.entries.length >= 2 && !JP.ends) JP.ends = Date.now() + 25000;
  drawJackpot(); return true;
}
function viewJackpot() {
  $("#view").innerHTML = `<div class="page-head"><div><h1>Jackpot</h1><p>Everyone throws items in the pot. Your odds = your share of the pot. One winner takes all.</p></div><button class="btn btn-gold" id="jpDep">Deposit items</button></div>
    <div class="jp"><div style="display:flex;flex-direction:column;gap:16px"><div class="panel jp-top">
      <div class="jp-stats"><div class="stat"><small>Round</small><b id="jpRound"></b></div><div class="stat"><small>Pot</small><b id="jpPot"></b></div><div class="stat"><small>Your chance</small><b id="jpMe"></b></div><div class="stat"><small>Time left</small><b id="jpTime"></b></div></div>
      <div class="jp-bar" id="jpBar"></div>
      <div class="jp-reel-wrap"><div class="reel-marker"></div><div class="jp-reel" id="jpReel"></div></div></div>
      <div class="panel" style="padding:14px"><div class="section-title">Recent winners</div><div id="jpHist" class="cf-list"></div></div></div>
      <div class="panel jp-entries" id="jpEntries"></div></div>`;
  $("#jpDep").onclick = async () => { const items = await pickItems({ title: "Deposit into the jackpot", min: .05, confirm: "Deposit" }); if (items && !JP.spinning) { removeIds(items.map(i => i.id)); S.stats.wagered += total(items); jpAdd("You", items); } };
  drawJackpot();
}
function drawJackpot() {
  if (!$("#jpPot")) return;
  const tp = jpTotal(), me = JP.entries.find(e => e.name === "You");
  $("#jpRound").textContent = "#" + JP.round;
  $("#jpPot").innerHTML = coinVal(tp);
  $("#jpMe").textContent = me ? (me.value / tp * 100).toFixed(2) + "%" : "0%";
  $("#jpTime").textContent = JP.spinning ? "Rolling" : JP.ends ? Math.max(0, Math.ceil((JP.ends - Date.now()) / 1000)) + "s" : "Waiting";
  $("#jpBar").innerHTML = JP.entries.map(e => `<div style="width:${e.value / tp * 100}%;background:${e.color}" title="${esc(e.name)}"></div>`).join("");
  $("#jpEntries").innerHTML = `<div class="section-title">${JP.entries.length} players</div>` + ([...JP.entries].sort((a, b) => b.value - a.value).map(e => `<div class="entry" style="--pc:${e.color}"><div class="entry-head"><div class="player">${pfp(e.name)}<div><div class="nm">${esc(e.name)}</div><div class="muted" style="font-size:12px">${(e.value / tp * 100).toFixed(2)}%</div></div></div>${coinVal(e.value)}</div><div class="mini-items">${minis(e.items, 5)}</div></div>`).join("") || `<div class="empty">Pot is empty — be the first.</div>`);
  if (!JP.spinning) $("#jpReel").innerHTML = JP.entries.flatMap(e => [pfp(e.name)]).join("");
  $("#jpHist").innerHTML = JP.history.slice(0, 6).map(h => `<div class="player" style="justify-content:space-between"><div class="player">${pfp(h.name)}<div><div class="nm">${esc(h.name)}</div><div class="muted" style="font-size:12px">Round #${h.round} · ${h.chance.toFixed(2)}%</div></div></div>${coinVal(h.pot)}</div>`).join("") || `<div class="muted">No rounds yet.</div>`;
}
async function jpRoll() {
  JP.spinning = true; drawJackpot();
  const tp = jpTotal(); let r = Math.random() * tp, win = JP.entries[0];
  for (const e of JP.entries) if ((r -= e.value) <= 0) { win = e; break; }
  const reel = $("#jpReel");
  if (reel) {
    const strip = Array.from({ length: 70 }, (_, i) => { if (i === 60) return win; let x = Math.random() * tp; for (const e of JP.entries) if ((x -= e.value) <= 0) return e; return JP.entries[0]; });
    reel.innerHTML = strip.map(e => pfp(e.name)).join("");
    const off = 60 * 78 + 36 - reel.parentElement.clientWidth / 2 + rand(-24, 24);
    reel.style.transition = "none"; reel.style.transform = "translateX(0)"; void reel.offsetWidth;
    reel.style.transition = "transform 6s cubic-bezier(.08,.72,.12,1)"; reel.style.transform = `translateX(${-off}px)`;
  }
  await sleep(6300);
  const pot = JP.entries.flatMap(e => e.items);
  JP.history.unshift({ round: JP.round, name: win.name, pot: tp, chance: win.value / tp * 100 });
  if (win.name === "You") { addItems(pot); S.stats.won += tp; save(); toast(`You won the jackpot: ${fmt(tp)}!`, "good"); }
  if (tp > 150 || win.name === "You") sysChat(`<b>${esc(win.name)}</b> won jackpot #${JP.round} (${fmt(tp)}) with ${(win.value / tp * 100).toFixed(1)}%`);
  await sleep(2500);
  JP.round++; JP.entries = []; JP.ends = 0; JP.spinning = false;
  const reel2 = $("#jpReel"); if (reel2) { reel2.style.transition = "none"; reel2.style.transform = "translateX(0)"; }
  drawJackpot();
}
setInterval(() => {
  if (JP.spinning) return;
  if (JP.ends && Date.now() >= JP.ends) { jpRoll(); return; }
  if (Math.random() < (JP.entries.length < 2 ? .35 : .18) && JP.entries.length < 9) {
    const n = pick(BOT_NAMES); jpAdd(n, botLoadout(r2(Math.pow(Math.random(), 2.2) * 300 + rand(.5, 5))));
  }
  if ($("#jpTime")) $("#jpTime").textContent = JP.spinning ? "Rolling" : JP.ends ? Math.max(0, Math.ceil((JP.ends - Date.now()) / 1000)) + "s" : "Waiting";
}, 1000);

// ---------------------------------------------------------------- market
let marketUnusuals = [];
function refreshMarket() { marketUnusuals = Array.from({ length: 80 }, () => randomUnusual()).filter(Boolean); }
refreshMarket();
function viewMarket() {
  $("#view").innerHTML = `<div class="page-head"><div><h1>Market</h1><p>Buy items with fun-coins. Prices follow TCBET's value guide.</p></div></div>
    <div class="toolbar"><input id="mkQ" placeholder="Search ${ITEMS.length} items…"><div class="tabs" id="mkTab"><button data-t="unu" class="on">Unusuals</button><button data-t="all">Items</button><button data-t="weap">Weapons</button><button data-t="rare">Rare</button></div>
      <select id="mkSort"><option value="desc">Price: high → low</option><option value="asc">Price: low → high</option><option value="az">Name</option></select></div>
    <div class="grid" id="mkGrid"></div>`;
  let tab = "unu";
  const draw = () => {
    const q = $("#mkQ").value.toLowerCase(), s = $("#mkSort").value;
    let list = tab === "unu" ? marketUnusuals : ITEMS.filter(i => tab === "all" || (tab === "weap" ? i.weapon : i.v >= 50)).map(i => ({ n: i.name }));
    list = list.filter(it => label(it).toLowerCase().includes(q));
    list.sort(s === "az" ? (a, b) => label(a).localeCompare(label(b)) : s === "asc" ? (a, b) => value(a) - value(b) : (a, b) => value(b) - value(a));
    $("#mkGrid").innerHTML = list.slice(0, 240).map((it, i) => card(it, { click: 1, extra: `data-i="${esc(JSON.stringify(it))}"` })).join("") || `<div class="empty">Nothing found.</div>`;
  };
  $("#mkTab").onclick = e => { const b = e.target.closest("button"); if (!b) return; tab = b.dataset.t; $$("#mkTab button").forEach(x => x.classList.toggle("on", x === b)); draw(); };
  $("#mkQ").oninput = draw; $("#mkSort").onchange = draw;
  $("#mkGrid").onclick = e => {
    const c = e.target.closest(".card"); if (!c) return; const it = JSON.parse(c.dataset.i), v = value(it);
    const m = modal(`<div class="win-show"><h2>${esc(label(it))}</h2><div class="muted">${it.fx ? FX[it.fx].series + " effect · " : ""}${esc(ITEM[it.n].worn)}</div>${thumb(it)}<div style="margin-bottom:16px">${coinVal(v)}</div>
      <div style="display:flex;gap:10px;justify-content:center"><button class="btn" id="mkNo">Cancel</button><button class="btn btn-gold" id="mkBuy" ${S.bal < v ? "disabled" : ""}>${S.bal < v ? "Not enough coins" : "Buy for " + fmt(v)}</button></div></div>`);
    $("#mkNo", m).onclick = closeModal;
    $("#mkBuy", m).onclick = () => { setBal(-v); addItems([it]); closeModal(); toast(`Bought ${esc(label(it))}`, "good"); if (it.fx) { marketUnusuals = marketUnusuals.filter(x => !(x.n === it.n && x.fx === it.fx)); draw(); } };
  };
  draw();
}

// ---------------------------------------------------------------- inventory
function viewInventory() {
  const sel = new Set();
  $("#view").innerHTML = `<div class="panel inv-hero">${pfp("You")}<div style="flex:1"><h1 style="margin:0;font:800 22px Rubik">Your inventory</h1><div class="muted">${S.inv.length} items</div></div>
      <div class="stat"><small>Inventory value</small><b>${coinVal(total(S.inv))}</b></div><div class="stat"><small>Cases opened</small><b>${S.stats.opened}</b></div><div class="stat"><small>Total won</small><b>${coinVal(S.stats.won)}</b></div></div>
    <div class="toolbar"><input id="ivQ" placeholder="Search your items…"><button class="btn" id="ivAll">Select all</button></div>
    <div class="grid" id="ivGrid"></div>
    <div class="sel-bar" id="ivBar" hidden><span class="grow" id="ivInfo"></span><button class="btn" id="ivClear">Clear</button><button class="btn btn-gold" id="ivSell">Sell</button></div>`;
  const draw = () => {
    const q = $("#ivQ").value.toLowerCase();
    const list = S.inv.filter(it => label(it).toLowerCase().includes(q)).sort((a, b) => value(b) - value(a));
    $("#ivGrid").innerHTML = list.map(it => card(it, { click: 1, sel: sel.has(it.id) })).join("") || `<div class="empty">No items yet. <a href="#/cases" style="color:var(--gold)">Open a case</a>.</div>`;
    const v = total(S.inv.filter(i => sel.has(i.id)));
    $("#ivBar").hidden = !sel.size; $("#ivInfo").innerHTML = `${sel.size} selected · sells for ${coinVal(r2(v * .95))}`;
  };
  $("#ivQ").oninput = draw;
  $("#ivGrid").onclick = e => { const c = e.target.closest(".card"); if (!c) return; const id = c.dataset.id; sel.has(id) ? sel.delete(id) : sel.add(id); draw(); };
  $("#ivAll").onclick = () => { S.inv.forEach(i => sel.add(i.id)); draw(); };
  $("#ivClear").onclick = () => { sel.clear(); draw(); };
  $("#ivSell").onclick = () => { const v = r2(total(S.inv.filter(i => sel.has(i.id))) * .95); removeIds([...sel]); sel.clear(); setBal(v); toast(`Sold for ${fmt(v)} fun-coins`, "good"); viewInventory(); };
  draw();
}

// ---------------------------------------------------------------- live drops + chat
function pushDrop(who, it, me) {
  const t = $("#tickerTrack"); if (!t) return;
  const d = document.createElement("div"); d.className = "drop"; d.style.setProperty("--rc", rarity(value(it), it.fx));
  d.title = `${who} — ${label(it)} (${fmt(value(it))})`;
  d.innerHTML = thumb(it) + `<div class="who" style="${me ? "color:var(--gold)" : ""}">${esc(who)}</div>`;
  t.prepend(d); while (t.children.length > 30) t.lastChild.remove();
}
const LINES = ["gl everyone", "just hit a burning on a cosmetic crate 6 lets goooo", "jackpot is rigged (it's not i just lost)", "anyone wanna flip 50?", "golden pan when", "unusualifier at 12% hit first try", "RED always wins coinflips trust", "GRN gang", "classic crates got the best effects ngl", "stop sniping my jackpot rounds lol", "what's a black hole hard news worth", "i need a summer cooler unusual so bad", "+rep for the trade", "ty for the flip gg", "nebula on anything is clean", "just got a dev effect in the unusual box??", "how do i get free coins", "free coins button top right", "lost 3 flips in a row im done", "this site is so smooth"];
function chat(name, text, me) {
  const log = $("#chatLog");
  log.insertAdjacentHTML("beforeend", `<div class="msg">${pfp(name)}<div><b class="${me ? "me" : ""}">${esc(name)}</b><p>${esc(text)}</p></div></div>`);
  while (log.children.length > 60) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
}
function sysChat(html) {
  const log = $("#chatLog");
  log.insertAdjacentHTML("beforeend", `<div class="msg sys"><div class="pfp" style="background:var(--unu)">★</div><div><b>TCBET</b><p>${html}</p></div></div>`);
  log.scrollTop = log.scrollHeight;
}
$("#chatForm").onsubmit = e => { e.preventDefault(); const v = $("#chatInput").value.trim(); if (v) { chat("You", v, true); $("#chatInput").value = ""; } };
for (let i = 0; i < 8; i++) chat(pick(BOT_NAMES), pick(LINES));
setInterval(() => { if (Math.random() < .5) chat(pick(BOT_NAMES), pick(LINES)); $("#onlineCount").textContent = (1200 + Math.floor(rand(0, 180))).toLocaleString(); }, 4500);
function botOpen() {
  const c = Math.random() < .04 ? CASES[1] : pick(CASES);
  const w = rollCase(c);
  pushDrop(pick(BOT_NAMES), w);
  if (w.fx) sysChat(`<b>${esc(pick(BOT_NAMES))}</b> unboxed <b>${esc(label(w))}</b> from ${esc(c.name)}!`);
}
for (let i = 0; i < 18; i++) botOpen();
setInterval(() => { botOpen(); if (Math.random() < .25) { const r = Math.random() < .08 ? randomUnusual() : null; if (r) { pushDrop(pick(BOT_NAMES), r); } } }, 2600);
setInterval(() => { if (CF.games.filter(g => g.state === "open").length < 8 && Math.random() < .5) { newBotFlip(); drawFlips(); }
  const bot = CF.games.find(g => g.state === "open" && g.a.name !== "You" && Math.random() < .08);
  if (bot) { bot.b = { name: pick(BOT_NAMES), items: botLoadout(total(bot.a.items)), side: bot.a.side === "RED" ? "GRN" : "RED" }; bot.state = "flip"; runFlip(bot, false); }
  CF.games = CF.games.filter(g => g.state !== "done").slice(0, 20);
}, 3000);

// ---------------------------------------------------------------- daily coins
const DAILY_MS = 4 * 3600 * 1000, DAILY_AMT = 25;
function syncDaily() {
  const b = $("#dailyBtn"), left = S.daily + DAILY_MS - Date.now();
  b.disabled = left > 0;
  b.textContent = left > 0 ? `Free coins in ${Math.ceil(left / 60000)}m` : `Claim ${DAILY_AMT} free coins`;
}
$("#dailyBtn").onclick = () => { if (S.daily + DAILY_MS > Date.now()) return; S.daily = Date.now(); setBal(DAILY_AMT); toast(`+${DAILY_AMT} fun-coins claimed`, "good"); syncDaily(); };
setInterval(syncDaily, 30000);
$("#resetBtn").onclick = () => { if (confirm("Reset your TCBET save? This wipes your fun-coins and items.")) { localStorage.removeItem(SAVE); location.reload(); } };

// ---------------------------------------------------------------- router
const route = () => (location.hash.replace(/^#\/?/, "").split("?")[0] || "cases").split("/");
const go = r => location.hash = "#/" + r;
function render() {
  closeModal();
  const [r, arg] = route();
  $$("#nav a").forEach(a => a.classList.toggle("active", a.dataset.r === (r === "case" ? "cases" : r)));
  ({ cases: viewCases, case: () => viewCase(arg), unusualifier: viewUnusualifier, coinflip: viewCoinflip, jackpot: viewJackpot, market: viewMarket, inventory: viewInventory }[r] || viewCases)();
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", render);
syncTop(); render();
})();

/* TCBET — multiplayer fun-coin Typical Colors 2 item site. No real money anywhere.
   Every balance/item change happens in Supabase functions (supabase/schema.sql); this file only renders and calls them. */
(() => {
"use strict";

// ---------------------------------------------------------------- data
const ITEMS = window.TC2_ITEMS, EFFECTS = window.TC2_EFFECTS, CASES = window.TC2_CASES;
const ITEM = Object.fromEntries(ITEMS.map(i => [i.name, i]));
const FX = Object.fromEntries(EFFECTS.map(e => [e.name, e]));
const UNU_HATS = ITEMS.filter(i => i.unu);
const QCOLOR = { "Strange": "#e0773a", "Collector's": "#e03a3a", "Vintage": "#6b8fd1", "Genuine": "#5fa36f", "Haunted": "#38f3ab" };
const STANDARD = new Set(["S1","S2","S3","S4","S5","S6","S7","S8","S9","S10"]);

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const r2 = n => Math.round(n * 100) / 100;
const fmt = n => (+n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967295; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Which effects can legally sit on which hat (crate seasons, Unusualifier list, etc.) — the server enforces the same rule
const allowed = (hat, fx) => hat.fx.some(g => fx.g.includes(g));
const allowedFx = hat => EFFECTS.filter(e => allowed(hat, e));
function value(it) {
  const base = ITEM[it.n];
  if (!base) return 0;
  if (!it.fx) return base.v;
  const fx = FX[it.fx];
  // Unusualifier effects are cheap to apply in-game, so an old hat doesn't make them worth more
  return r2(Math.min(18000, fx.m * (fx.g.includes("UX") ? Math.min(1, base.hf) : base.hf)));
}
const label = it => it.fx ? `${it.fx} ${it.n}` : it.n;
const total = list => r2(list.reduce((s, it) => s + value(it), 0));
function rarity(v, fx) {
  if (fx) return "var(--unu2)";
  return v >= 1000 ? "var(--r6)" : v >= 100 ? "var(--r5)" : v >= 20 ? "var(--r4)" : v >= 4 ? "var(--r3)" : v >= 1 ? "var(--r2)" : "var(--r1)";
}
const coinVal = v => `<span class="val"><i class="coin"></i>${fmt(v)}</span>`;
const fromJ = list => (list || []).map(x => ({ id: x.id, n: x.n, fx: x.fx || null })).filter(x => ITEM[x.n]);

// ---------------------------------------------------------------- server
const CFG = window.TCBET_CONFIG || {};
const sb = window.supabase && CFG.url && CFG.anonKey ? window.supabase.createClient(CFG.url, CFG.anonKey) : null;
const ME = { user: null, profile: null, inv: [] };
const emailFor = u => `tcbet.${u.toLowerCase()}@nexora.xxx`;  // login ID only; email confirmation is off, nothing is sent

async function rpc(fn, args = {}) {
  if (!sb) throw new Error("TCBET isn't connected to its server yet.");
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message.replace(/^.*?: /, ""));
  return data;
}
async function refreshMe() {
  if (!ME.user) { ME.profile = null; ME.inv = []; return syncTop(); }
  const [{ data: p }, { data: inv }] = await Promise.all([
    sb.from("profiles").select("*").eq("id", ME.user.id).single(),
    sb.from("inventory").select("id,name,fx").eq("owner", ME.user.id).eq("state", "inv").order("id", { ascending: false }).limit(2000),
  ]);
  ME.profile = p; ME.inv = (inv || []).filter(r => ITEM[r.name]).map(r => ({ id: r.id, n: r.name, fx: r.fx }));
  syncTop();
}
function needLogin() { if (ME.user) return false; openAuth("login"); return true; }
const fail = e => toast(esc(e.message || e), "bad");
const isVip = () => ME.profile?.rank === "vip";
const vipTag = r => r === "vip" ? `<span class="vip-tag" title="VIP">VIP</span>` : "";
const sellRate = () => isVip() ? 1 : .95;

function syncTop() {
  const p = ME.profile;
  $("#balance").hidden = !p; $("#avatarLink").hidden = !p; $("#loginBtn").hidden = !!p;
  if (p) {
    $("#balance span").textContent = fmt(p.balance);
    $("#avatarInitial").textContent = p.username[0].toUpperCase();
    $("#avatarLink").classList.toggle("is-vip", p.rank === "vip");
    $("#avatarLink").style.background = pfpColor(p.username);
    $("#invCount").textContent = ME.inv.length;
  }
  syncDaily();
}
function bumpBalance() { const b = $("#balance"); b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump"); }

// ---------------------------------------------------------------- rendering helpers
// the wiki serves resized copies; a 160px effect gif is ~3x smaller than the original
const sized = (url, w) => `${url}/revision/latest/scale-to-width-down/${w}`;
function thumb(it, cls = "", big = false) {
  const b = ITEM[it.n], fx = it.fx && FX[it.fx];
  return `<div class="thumb ${fx ? "has-fx" : ""} ${cls}">${fx ? `<img class="fx" data-src="${sized(fx.img, big ? 320 : 160)}" alt="" referrerpolicy="no-referrer">` : ""}<img class="hat" src="${sized(b.img, big ? 320 : 160)}" alt="${esc(label(it))}" loading="lazy" referrerpolicy="no-referrer"></div>`;
}
// effect gifs only load/animate while visible, and are unloaded again when scrolled away
const fxObserver = new IntersectionObserver(entries => {
  for (const e of entries) {
    const img = e.target;
    if (e.isIntersecting) { if (!img.getAttribute("src")) img.src = img.dataset.src; }
    else if (img.getAttribute("src")) img.removeAttribute("src");
  }
}, { rootMargin: "150px" });
new MutationObserver(muts => {
  for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) {
    if (n.matches?.("img.fx[data-src]")) fxObserver.observe(n);
    n.querySelectorAll?.("img.fx[data-src]").forEach(i => fxObserver.observe(i));
  }
}).observe(document.body, { childList: true, subtree: true });
function card(it, { sub, click, sel, extra = "" } = {}) {
  const v = value(it), rc = rarity(v, it.fx), q = !it.fx && ITEM[it.n].q;
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
  $("#toasts").append(t); setTimeout(() => t.remove(), 4200);
}
function modal(html) { $("#modalCard").innerHTML = html; $("#modal").hidden = false; return $("#modalCard"); }
function closeModal() { $("#modal").hidden = true; $("#modalCard").innerHTML = ""; }
$("#modal").addEventListener("mousedown", e => { if (e.target.id === "modal" && !$("#modal").dataset.lock) closeModal(); });
document.addEventListener("click", e => { if (e.target.closest("[data-close]")) closeModal(); });

const PFP_COLORS = ["#ef4444","#22c55e","#3b82f6","#f59e0b","#8b5cf6","#ec4899","#14b8a6","#f97316"];
const pfpColor = n => PFP_COLORS[Math.floor(hash(n || "?") * PFP_COLORS.length)];
const pfp = (n, cls = "pfp") => `<div class="${cls}" style="background:${pfpColor(n)}">${esc((n || "?")[0].toUpperCase())}</div>`;
const userLink = n => n && n !== "TCBET" && n !== "House" ? `<a href="#/trade/${encodeURIComponent(n)}" class="ulink">${esc(n)}</a>` : esc(n);

function randomUnusual(hats = UNU_HATS) {
  for (let i = 0; i < 50; i++) {
    const h = pick(hats);
    let opts = allowedFx(h).filter(e => !e.g.includes("DEV") || Math.random() < .08);
    if (Math.random() < .85 && opts.some(e => !e.g.includes("UX"))) opts = opts.filter(e => !e.g.includes("UX"));
    if (opts.length) return { n: h.name, fx: pick(opts).name };
  }
  return null;
}

// ---------------------------------------------------------------- auth
function openAuth(mode = "login") {
  const m = modal(`<div class="auth">
    <img src="logo-mark.svg" alt="" class="auth-logo"><h2>${mode === "login" ? "Welcome back" : "Create your account"}</h2>
    <p class="muted">${mode === "login" ? "Sign in to open cases, flip and trade." : "Free to play. You start with 100 fun-coins and a few items."}</p>
    <form id="authForm"><label>Username<input id="auUser" autocomplete="username" maxlength="20" required></label>
      <label>Password<input id="auPass" type="password" autocomplete="${mode === "login" ? "current-password" : "new-password"}" minlength="6" required></label>
      ${mode === "signup" ? `<label>Confirm password<input id="auPass2" type="password" autocomplete="new-password" minlength="6" required></label>` : ""}
      <div class="auth-err" id="auErr"></div>
      <button class="btn btn-gold" style="width:100%" id="auGo">${mode === "login" ? "Sign in" : "Create account"}</button></form>
    <p class="muted" style="margin-top:14px">${mode === "login" ? `New here? <a href="#" id="auSwap">Create an account</a>` : `Already have an account? <a href="#" id="auSwap">Sign in</a>`}</p>
    <p class="auth-note">Usernames are 3–20 letters, numbers or _. There's no email, so remember your password.</p></div>`);
  $("#auSwap", m).onclick = e => { e.preventDefault(); openAuth(mode === "login" ? "signup" : "login"); };
  $("#authForm", m).onsubmit = async e => {
    e.preventDefault();
    const u = $("#auUser").value.trim(), p = $("#auPass").value, err = $("#auErr");
    err.textContent = "";
    if (!/^[A-Za-z0-9_]{3,20}$/.test(u)) return err.textContent = "Username must be 3–20 letters, numbers or _.";
    if (!sb) return err.textContent = "TCBET isn't connected to its server yet.";
    $("#auGo").disabled = true;
    try {
      if (mode === "signup") {
        if (p !== $("#auPass2").value) throw new Error("Passwords don't match.");
        if (!(await rpc("username_available", { p_name: u }))) throw new Error("That username is taken.");
        const { error } = await sb.auth.signUp({ email: emailFor(u), password: p, options: { data: { username: u } } });
        if (error) throw error;
        toast(`Welcome to TCBET, ${esc(u)}! Here's 100 fun-coins to start.`, "good");
      } else {
        const { error } = await sb.auth.signInWithPassword({ email: emailFor(u), password: p });
        if (error) throw new Error(/invalid/i.test(error.message) ? "Wrong username or password." : error.message);
      }
      closeModal();
    } catch (x) { err.textContent = x.message; $("#auGo").disabled = false; }
  };
  setTimeout(() => $("#auUser")?.focus(), 50);
}
$("#loginBtn").onclick = () => openAuth("login");

// ---------------------------------------------------------------- cases
function viewCases() {
  $("#view").innerHTML = `
    <div class="page-head"><div><h1>Cases</h1><p>Real Typical Colors 2 crates with their real item pools. ~1% chance at an Unusual, with effects locked to the crate's season.</p></div>
      <div class="tabs" id="caseFilter">${["All","Classic","Summer","Halloween","Holiday","Weapons"].map(s => `<button data-s="${s}" class="${s === "All" ? "on" : ""}">${s}</button>`).join("")}</div></div>
    <div class="cases" id="caseGrid"></div>`;
  const draw = s => $("#caseGrid").innerHTML = CASES.filter(c => s === "All" || c.season === s).map(c => `
    <a class="case-tile" href="#/case/${c.id}">
      <span class="chip season ${c.season}">${c.tag || c.season}</span>
      <img src="${c.img.startsWith("http") ? sized(c.img, 240) : c.img}" alt="" referrerpolicy="no-referrer" loading="lazy">
      <h3>${esc(c.name)}</h3><div class="muted" style="font-size:12px">${c.entries.length} drops · ${c.season}</div>
      <span class="btn btn-gold"><span class="val" style="color:#1a1204"><i class="coin"></i>${fmt(c.price)}</span></span></a>`).join("");
  draw("All");
  $("#caseFilter").onclick = e => { const b = e.target.closest("button"); if (!b) return; $$("#caseFilter button").forEach(x => x.classList.toggle("on", x === b)); draw(b.dataset.s); };
}
const mysteryCard = p => `<div class="card" style="--rc:var(--unu2)"><div class="glow"></div><div class="thumb" style="background:radial-gradient(circle,#3b2357,#0b0910)"><div style="font:900 54px Rubik;color:var(--unu2);text-shadow:0 0 20px var(--unu)">★</div></div><div class="meta"><div class="nm" style="color:var(--unu2)">Unusual Hat</div><div class="sub">Legal effect for this crate</div><div class="odds">${p != null ? (p * 100).toFixed(2) + "%" : ""}</div></div></div>`;
const entryVal = e => e.unusual ? e.ev : value({ n: e.n });
function rollEntry(c) { let r = Math.random(); for (const e of c.entries) if ((r -= e.p) <= 0) return e; return c.entries[0]; }

function viewCase(id) {
  const c = CASES.find(x => x.id === id); if (!c) return go("cases");
  const sorted = c.entries.filter(e => e.unusual || ITEM[e.n]).sort((a, b) => entryVal(b) - entryVal(a));
  $("#view").innerHTML = `
    <div class="case-open">
      <div class="panel case-hero"><img src="${c.img}" alt="" referrerpolicy="no-referrer">
        <div><a href="#/cases" class="muted">← All cases</a><h1>${esc(c.name)}</h1><div class="muted">${c.season} season · Expected value ${coinVal(c.ev)}</div></div>
        <div class="case-actions"><div class="tabs" id="qty">${[1,2,3,5].map(n => `<button data-n="${n}" class="${n === 1 ? "on" : ""}">${n}x</button>`).join("")}</div>
        <button class="btn" id="fastBtn">Quick</button><button class="btn btn-gold" id="openBtn">Open for ${fmt(c.price)}</button></div></div>
      <div id="reels"><div class="reel-wrap"><div class="reel-marker"></div><div class="reel"></div></div></div>
      <div><div class="section-title">Drops in this case</div><div class="grid">${sorted.map(e => e.unusual ? mysteryCard(e.p) : card({ n: e.n }, { sub: (e.p * 100).toFixed(e.p < .01 ? 3 : 2) + "% chance" })).join("")}</div></div>
    </div>`;
  let qty = 1, fast = false, busy = false;
  $("#qty").onclick = e => { const b = e.target.closest("button"); if (!b || busy) return; qty = +b.dataset.n; $$("#qty button").forEach(x => x.classList.toggle("on", x === b)); $("#openBtn").textContent = `Open ${qty > 1 ? qty + "x " : ""}for ${fmt(c.price * qty)}`; };
  $("#fastBtn").onclick = () => { fast = !fast; $("#fastBtn").classList.toggle("btn-unu", fast); };
  $("#openBtn").onclick = async () => {
    if (busy || needLogin()) return;
    if (+ME.profile.balance < c.price * qty) return toast("Not enough fun-coins. Claim free coins or sell some items.", "bad");
    busy = true; $("#openBtn").disabled = true;
    try {
      const res = await rpc("open_case", { p_case: c.id, p_qty: qty });
      ME.profile.balance = res.balance; syncTop(); bumpBalance();
      const wins = fromJ(res.items);
      $("#reels").innerHTML = wins.map(() => `<div class="reel-wrap" style="margin-bottom:10px"><div class="reel-marker"></div><div class="reel"></div></div>`).join("");
      await Promise.all(wins.map((w, i) => spinReel($$("#reels .reel")[i], c, w, fast ? 1600 : 5600)));
      await refreshMe();
      showWins(wins);
    } catch (e) { fail(e); }
    busy = false; $("#openBtn").disabled = false;
  };
}
async function spinReel(reel, c, win, ms) {
  const N = 58, WIN = 50, W = 158;
  const strip = Array.from({ length: N }, (_, i) => i === WIN ? null : rollEntry(c));
  reel.innerHTML = strip.map(e => e === null ? (win.fx ? mysteryCard() : card(win)) : e.unusual ? mysteryCard() : card({ n: e.n })).join("");
  const wrapW = reel.parentElement.clientWidth;
  const offset = WIN * W + rand(10, 140) - wrapW / 2;
  reel.style.transition = "none"; reel.style.transform = "translateX(0)"; void reel.offsetWidth;
  reel.style.transition = `transform ${ms}ms cubic-bezier(.08,.72,.12,1)`;
  reel.style.transform = `translateX(${-offset}px)`;
  await sleep(ms + 150);
  if (win.fx) { reel.children[WIN].outerHTML = card(win); await sleep(ms > 2000 ? 700 : 250); }
}
function showWins(wins) {
  const tv = total(wins);
  const m = modal(`<div class="win-show"><h2>${wins.some(w => w.fx) ? "UNUSUAL UNBOXED!" : "You unboxed"}</h2><div class="muted">Total ${coinVal(tv)}</div>
    <div class="grid" style="margin-top:14px;grid-template-columns:repeat(auto-fit,minmax(170px,220px));justify-content:center">${wins.map(w => card(w)).join("")}</div>
    <div style="display:flex;gap:10px;justify-content:center;margin-top:18px"><button class="btn" id="sellAll">Sell all for ${fmt(r2(tv * sellRate()))}</button><button class="btn btn-gold" data-close>Keep items</button></div></div>`);
  $("#sellAll", m).onclick = async () => {
    try { await rpc("sell_items", { p_ids: wins.map(w => w.id) }); closeModal(); await refreshMe(); bumpBalance(); toast(`Sold for ${fmt(r2(tv * sellRate()))} fun-coins`, "good"); } catch (e) { fail(e); }
  };
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
function stakeItems() {
  const have = new Set(ME.inv.map(i => i.id));
  for (const id of U.stake) if (!have.has(id)) U.stake.delete(id);   // items that were sold/traded away
  return ME.inv.filter(it => U.stake.has(it.id));
}
// called whenever the stake changes: a target that's no longer worth more than the stake is cleared
function stakeChanged() {
  const s = total(stakeItems());
  if (U.fx && value({ n: U.hat, fx: U.fx }) <= s) U.fx = null;
  if (U.hat && !allowedFx(ITEM[U.hat]).some(e => value({ n: U.hat, fx: e.name }) > s)) { U.hat = null; U.fx = null; }
  drawUpg();
}
const upgOptions = (h, s) => allowedFx(h).filter(e => value({ n: h.name, fx: e.name }) > s);
const target = () => U.hat && U.fx ? { n: U.hat, fx: U.fx } : null;
function upgChance() { const t = target(); if (!t) return 0; const s = total(stakeItems()); return Math.min(.75, s / value(t) * .95); }
function drawUpg() {
  if (!$("#stakePrev")) return;
  const st = stakeItems(), t = target();
  $("#stakePrev").innerHTML = st.length ? (st.length === 1 ? thumb(st[0], "", true) : `<div class="mini-items" style="flex-wrap:wrap;justify-content:center;padding:14px">${st.slice(0, 15).map(mini).join("")}</div>`) : `<div class="ph">${ME.user ? "Select items from your inventory below" : "Sign in to stake items"}</div>`;
  $("#stakeVal").innerHTML = `<div class="muted">${st.length} item${st.length === 1 ? "" : "s"}</div>${coinVal(total(st))}`;
  if (t) { $("#targetPrev").innerHTML = thumb(t, "", true); $("#targetVal").innerHTML = `<div style="color:var(--unu2);font-weight:700">${esc(label(t))}</div>${coinVal(value(t))}`; }
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
  let best = null, bd = Infinity;
  for (const h of UNU_HATS) for (const e of allowedFx(h)) { const d = Math.abs(value({ n: h.name, fx: e.name }) - v); if (d < bd && Math.random() > .3) { bd = d; best = [h.name, e.name]; } }
  if (best) { [U.hat, U.fx] = best; U.tab = "fx"; U.q = ""; $("#upgSearch").value = ""; drawUpg(); drawPicker(); }
}
function drawPicker() {
  if (!$("#pickerBody")) return;
  $$("#upgTabs button").forEach(b => b.classList.toggle("on", b.dataset.t === U.tab));
  const body = $("#pickerBody"), q = U.q;
  if (U.tab === "stake") {
    const list = ME.inv.filter(it => label(it).toLowerCase().includes(q)).sort((a, b) => value(b) - value(a));
    body.innerHTML = !ME.user ? `<div class="empty"><button class="btn btn-gold" id="pkLogin">Sign in to play</button></div>` : list.length ? `<div class="grid">${list.map(it => card(it, { click: 1, sel: U.stake.has(it.id) })).join("")}</div>` : `<div class="empty">Your inventory is empty. Open a case or visit the Market.</div>`;
    body.onclick = e => { if (e.target.id === "pkLogin") return openAuth(); const c = e.target.closest(".card"); if (!c) return; const id = +c.dataset.id; U.stake.has(id) ? U.stake.delete(id) : U.stake.add(id); c.classList.toggle("sel"); stakeChanged(); };
  } else if (U.tab === "hat") {
    const mine = new Set(ME.inv.map(i => i.n)), s = total(stakeItems());
    const hats = UNU_HATS.filter(h => (U.hatScope === "all" || mine.has(h.name)) && h.name.toLowerCase().includes(q) && upgOptions(h, s).length);
    body.innerHTML = `<div class="tabs" id="hatScope" style="display:inline-flex;margin-bottom:12px"><button data-s="all" class="${U.hatScope === "all" ? "on" : ""}">All hats</button><button data-s="mine" class="${U.hatScope === "mine" ? "on" : ""}">Hats I own</button></div>
      <div class="grid">${hats.map(h => card({ n: h.name }, { click: 1, sel: U.hat === h.name, sub: `${upgOptions(h, s).length} effects worth more than your stake`, extra: `data-hat="${esc(h.name)}"` })).join("") || `<div class="empty">No hats found</div>`}</div>`;
    body.onclick = e => {
      const s = e.target.closest("#hatScope button"); if (s) { U.hatScope = s.dataset.s; return drawPicker(); }
      const c = e.target.closest(".card"); if (!c) return; U.hat = c.dataset.hat; U.fx = null; U.tab = "fx"; U.q = ""; $("#upgSearch").value = ""; drawUpg(); drawPicker();
    };
  } else {
    if (!U.hat) { body.innerHTML = `<div class="empty">Pick a hat first.</div>`; return; }
    const h = ITEM[U.hat], legal = allowedFx(h), lockedN = EFFECTS.length - legal.length, s = total(stakeItems());
    const options = legal.filter(e => value({ n: h.name, fx: e.name }) > s), cheap = legal.length - options.length;
    const src = h.fx.map(g => ({ UX: "Unusualifier effects (low value)", HAUNT: "Haunted", DEV: "Developer", COMM: "Community Sparkle", CODE: "Code-exclusive" }[g] || null)).filter(Boolean);
    const series = h.fx.filter(g => STANDARD.has(g)).map(g => g.slice(1)).sort((a, b) => a - b);
    body.innerHTML = `<div class="lock-note" style="margin-bottom:12px"><b>${esc(h.name)}</b> can roll ${legal.length} effects: ${series.length ? "crate series " + series.join(", ") : "no crate series"}${src.length ? " + " + src.join(", ") : ""}. ${lockedN} other effects are locked because this hat never came with them.${cheap && s ? ` ${cheap} more are hidden because they're worth less than your stake.` : ""}</div>
      <div class="fx-grid">${options.filter(e => e.name.toLowerCase().includes(q)).sort((a, b) => value({ n: h.name, fx: a.name }) - value({ n: h.name, fx: b.name })).map(e => { const v = value({ n: h.name, fx: e.name }); return card({ n: h.name, fx: e.name }, { click: 1, sel: U.fx === e.name, sub: s ? `${e.series} · ${(Math.min(.75, s / v * .95) * 100).toFixed(2)}% chance` : e.series, extra: `data-fx="${esc(e.name)}"` }); }).join("") || `<div class="empty">No effects on this hat are worth more than your stake.</div>`}</div>`;
    body.onclick = e => { const c = e.target.closest(".card"); if (!c) return; U.fx = c.dataset.fx; $$(".card", body).forEach(x => x.classList.toggle("sel", x === c)); drawUpg(); };
  }
}
let upgBusy = false;
async function spinUpgrade() {
  if (upgBusy || needLogin()) return;
  const st = stakeItems(), t = target(); if (!t || !st.length) return;
  upgBusy = true; $("#spinBtn").disabled = true; $("#dial").className = "dial";
  let res;
  try { res = await rpc("upgrade", { p_ids: st.map(i => i.id), p_hat: t.n, p_fx: t.fx }); }
  catch (e) { fail(e); upgBusy = false; await refreshMe(); U.stake.clear(); drawUpg(); drawPicker(); return; }
  U.stake.clear();
  const needle = $("#needle");
  needle.style.transition = "none"; needle.style.transform = "rotate(0deg)"; void needle.offsetWidth;
  needle.style.transition = ""; needle.style.transform = `rotate(${360 * 5 + res.roll * 360}deg)`;
  await sleep(4400);
  $("#dial").classList.add(res.win ? "win" : "lose");
  $("#chance").textContent = res.win ? "WIN" : "LOSS";
  await refreshMe();
  if (res.win) modal(`<div class="win-show"><h2>Unusualified!</h2>${thumb(t, "", true)}<div class="nm" style="color:var(--unu2)">${esc(label(t))}</div><div style="margin:6px 0 16px">${coinVal(value(t))}</div><button class="btn btn-gold" data-close>Nice</button></div>`);
  else toast(`The effect fizzled. Lost ${fmt(total(st))} in items.`, "bad");
  await sleep(1200); upgBusy = false; if (route()[0] === "unusualifier") { U.fx = res.win ? null : U.fx; drawUpg(); drawPicker(); }
}

// ---------------------------------------------------------------- inventory picker modal (shared)
function pickItems({ title, min = 0, max = Infinity, confirm = "Confirm", hint = "" }) {
  return new Promise(res => {
    const sel = new Set();
    const list = [...ME.inv].sort((a, b) => value(b) - value(a));
    const m = modal(`<h2>${title}</h2><div class="muted" style="margin-bottom:12px">${hint}</div>
      ${list.length ? `<div class="grid" id="pk">${list.map(it => card(it, { click: 1 })).join("")}</div>` : `<div class="empty">Your inventory is empty.</div>`}
      <div class="sel-bar"><span id="pkInfo" class="grow muted">Nothing selected</span><button class="btn" id="pkCancel">Cancel</button><button class="btn btn-gold" id="pkOk" disabled>${confirm}</button></div>`);
    const upd = () => { const v = total(list.filter(i => sel.has(i.id))); $("#pkInfo").innerHTML = `${sel.size} selected · ${coinVal(v)}`; $("#pkOk").disabled = !(v >= min && v <= max && sel.size && sel.size <= 40); };
    m.onclick = e => { const c = e.target.closest("#pk .card"); if (!c) return; const id = +c.dataset.id; sel.has(id) ? sel.delete(id) : sel.add(id); c.classList.toggle("sel"); upd(); };
    $("#pkCancel").onclick = () => { closeModal(); res(null); };
    $("#pkOk").onclick = () => { const out = list.filter(i => sel.has(i.id)); closeModal(); res(out); };
  });
}

// ---------------------------------------------------------------- coinflip
let FLIPS = [];
async function loadFlips() {
  if (!sb) return;
  const [{ data: open }, { data: done }] = await Promise.all([
    sb.from("coinflips").select("*").eq("status", "open").order("creator_value", { ascending: false }).limit(50),
    sb.from("coinflips").select("*").eq("status", "done").order("finished_at", { ascending: false }).limit(8),
  ]);
  FLIPS = [...(open || []), ...(done || [])];
  drawFlips();
}
function viewCoinflip() {
  $("#view").innerHTML = `<div class="page-head"><div><h1>Coinflip</h1><p>RED or GRN. Match the other player's items within ±10% and flip for everything. Nobody joining? Flip against the House for coins.</p></div><button class="btn btn-gold" id="cfCreate">Create game</button></div>
    <div class="cf-list" id="cfList"><div class="empty">Loading…</div></div><div class="section-title" style="margin-top:22px">Recent flips</div><div class="cf-list" id="cfDone"></div>`;
  $("#cfCreate").onclick = createFlip; loadFlips();
}
const sideChip = s => `<span class="side ${s}" style="position:static;display:inline-block;width:10px;height:10px;border:0;border-radius:50%"></span>`;
function drawFlips() {
  const el = $("#cfList"); if (!el) return;
  const open = FLIPS.filter(g => g.status === "open"), done = FLIPS.filter(g => g.status === "done");
  el.innerHTML = open.map(g => { const items = fromJ(g.creator_items), v = +g.creator_value, mine = ME.user && g.creator === ME.user.id, other = g.side === "RED" ? "GRN" : "RED"; return `<div class="panel cf-row">
      <div class="player"><div class="pfp" style="background:${pfpColor(g.creator_name)}">${esc(g.creator_name[0].toUpperCase())}<span class="side ${g.side}"></span></div><div><div class="nm">${userLink(g.creator_name)}</div><div class="muted" style="font-size:12px">${items.length} items · ${g.side}</div></div></div>
      <div class="mini-items">${minis(items, 7)}</div>
      <div>${coinVal(v)}<div class="muted" style="font-size:11px">${fmt(v * .9)} – ${fmt(v * 1.1)}</div></div>
      <div style="display:flex;gap:6px">${mine ? `<button class="btn" data-house="${g.id}" style="flex:1">vs House</button><button class="btn" data-cancel="${g.id}" title="Cancel">✕</button>` : `<button class="btn btn-${other === "GRN" ? "grn" : "red"}" data-join="${g.id}" style="width:100%">Join as ${other}</button>`}</div></div>`; }).join("") || `<div class="empty">No open games. Create one!</div>`;
  $("#cfDone").innerHTML = done.map(g => `<div class="panel cf-row" style="opacity:.8">
      <div class="player">${pfp(g.creator_name)}<div><div class="nm">${userLink(g.creator_name)}</div><div class="muted" style="font-size:12px">${g.side} ${g.winner_side === g.side ? "· won" : ""}</div></div></div>
      <div class="player">${pfp(g.joiner_name)}<div><div class="nm">${userLink(g.joiner_name)}</div><div class="muted" style="font-size:12px">${g.side === "RED" ? "GRN" : "RED"} ${g.winner_side !== g.side ? "· won" : ""}</div></div></div>
      <div>${coinVal(+g.creator_value + +g.joiner_value)}</div><div>${sideChip(g.winner_side)} <b>${g.winner_side}</b> won</div></div>`).join("") || `<div class="muted">No flips yet.</div>`;
  el.onclick = async e => {
    const j = e.target.closest("[data-join]"), h = e.target.closest("[data-house]"), c = e.target.closest("[data-cancel]");
    if (j) joinFlip(FLIPS.find(g => g.id === +j.dataset.join));
    if (h) { try { const r = await rpc("coinflip_house", { p_id: +h.dataset.house }); showFlip(r); } catch (x) { fail(x); } }
    if (c) { try { await rpc("coinflip_cancel", { p_id: +c.dataset.cancel }); toast("Flip cancelled, items returned."); await refreshMe(); loadFlips(); } catch (x) { fail(x); } }
  };
}
async function joinFlip(g) {
  if (!g || needLogin()) return;
  const v = +g.creator_value;
  const items = await pickItems({ title: `Join ${esc(g.creator_name)}'s flip`, min: v * .9, max: v * 1.1, confirm: "Join & flip", hint: `Select items worth ${fmt(v * .9)} – ${fmt(v * 1.1)}.` });
  if (!items) return;
  try { const r = await rpc("coinflip_join", { p_id: g.id, p_ids: items.map(i => i.id) }); showFlip(r); } catch (e) { fail(e); loadFlips(); }
}
async function createFlip() {
  if (needLogin()) return;
  const items = await pickItems({ title: "Create a coinflip", min: 0.1, confirm: "Next", hint: "Select the items you want to flip." });
  if (!items) return;
  const side = await new Promise(res => { const m = modal(`<h2>Pick your side</h2><div class="vs" style="margin-top:18px"><button class="btn btn-red" data-s="RED" style="padding:24px">RED</button><span class="muted">or</span><button class="btn btn-grn" data-s="GRN" style="padding:24px">GRN</button></div>`); m.onclick = e => { const b = e.target.closest("[data-s]"); if (b) { closeModal(); res(b.dataset.s); } }; });
  try { await rpc("coinflip_create", { p_ids: items.map(i => i.id), p_side: side }); toast("Game created. Waiting for an opponent…"); await refreshMe(); loadFlips(); } catch (e) { fail(e); }
}
const shownFlips = new Set();
async function showFlip(g) {
  if (shownFlips.has(g.id)) return; shownFlips.add(g.id);
  const a = { name: g.creator_name, side: g.side, items: fromJ(g.creator_items), v: +g.creator_value };
  const b = { name: g.joiner_name, side: g.side === "RED" ? "GRN" : "RED", items: fromJ(g.joiner_items), v: +g.joiner_value };
  const col = p => `<div><div class="player" style="justify-content:center;flex-direction:column">${pfp(p.name)}<b>${esc(p.name)}</b><span class="chip">${sideChip(p.side)}${p.side}</span></div><div style="margin-top:8px">${coinVal(p.v)}</div><div class="mini-items" style="justify-content:center;margin-top:8px">${p.items.length ? minis(p.items, 4) : `<span class="muted">coins</span>`}</div></div>`;
  $("#modal").dataset.lock = 1;
  modal(`<h2 style="text-align:center">Coinflip</h2><div class="vs" style="margin-top:12px">${col(a)}<div class="coin3d" id="coin3d"><div class="face RED">RED</div><div class="face GRN">GRN</div></div>${col(b)}</div><div id="cfRes" style="text-align:center;margin-top:12px" class="muted">Flipping for ${fmt(a.v + b.v)}…</div>`);
  $("#coin3d").animate([{ transform: "rotateY(0)" }, { transform: `rotateY(${(8 + (g.winner_side === "GRN" ? .5 : 0)) * 360}deg)` }], { duration: 3200, easing: "cubic-bezier(.2,.7,.2,1)", fill: "forwards" });
  await sleep(3400);
  delete $("#modal").dataset.lock;
  const won = ME.user && g.winner === ME.user.id, winner = g.winner_side === a.side ? a : b;
  $("#cfRes").innerHTML = `<h2 style="color:${g.winner_side === "RED" ? "var(--red)" : "var(--grn)"}">${g.winner_side} wins!</h2>${won ? `You won ${coinVal(a.v + b.v)}!` : `${esc(winner.name)} took the pot.`}<div style="margin-top:14px"><button class="btn" data-close>Close</button></div>`;
  await refreshMe(); bumpBalance(); loadFlips();
}

// ---------------------------------------------------------------- jackpot
const JP = { round: null, entries: [], history: [], spinning: false, settling: false };
async function loadJackpot() {
  if (!sb) return;
  const [{ data: open }, { data: hist }] = await Promise.all([
    sb.from("jackpot_rounds").select("*").eq("status", "open").order("id", { ascending: false }).limit(1),
    sb.from("jackpot_rounds").select("*").eq("status", "done").order("id", { ascending: false }).limit(6),
  ]);
  JP.round = open?.[0] || null; JP.history = hist || [];
  JP.entries = JP.round ? ((await sb.from("jackpot_entries").select("*").eq("round_id", JP.round.id).order("id")).data || []) : [];
  if (!JP.spinning) drawJackpot();
}
function jpTotal() { return r2(JP.entries.reduce((s, e) => s + +e.value, 0)); }
function viewJackpot() {
  $("#view").innerHTML = `<div class="page-head"><div><h1>Jackpot</h1><p>Everyone throws items in the pot. Your odds = your share of the pot. One winner takes all. The 30s timer starts when a second player joins.</p></div><div style="display:flex;gap:8px"><button class="btn" id="jpBack" hidden>Take items back</button><button class="btn btn-gold" id="jpDep">Deposit items</button></div></div>
    <div class="jp"><div style="display:flex;flex-direction:column;gap:16px"><div class="panel jp-top">
      <div class="jp-stats"><div class="stat"><small>Round</small><b id="jpRound"></b></div><div class="stat"><small>Pot</small><b id="jpPot"></b></div><div class="stat"><small>Your chance</small><b id="jpMe"></b></div><div class="stat"><small>Time left</small><b id="jpTime"></b></div></div>
      <div class="jp-bar" id="jpBar"></div>
      <div class="jp-reel-wrap"><div class="reel-marker"></div><div class="jp-reel" id="jpReel"></div></div></div>
      <div class="panel" style="padding:14px"><div class="section-title">Recent winners</div><div id="jpHist" class="cf-list"></div></div></div>
      <div class="panel jp-entries" id="jpEntries"></div></div>`;
  $("#jpDep").onclick = async () => {
    if (needLogin()) return;
    const items = await pickItems({ title: "Deposit into the jackpot", min: .05, confirm: "Deposit" });
    if (items) try { await rpc("jackpot_deposit", { p_ids: items.map(i => i.id) }); await refreshMe(); loadJackpot(); } catch (e) { fail(e); }
  };
  $("#jpBack").onclick = async () => { try { await rpc("jackpot_withdraw"); toast("Items returned."); await refreshMe(); loadJackpot(); } catch (e) { fail(e); } };
  loadJackpot();
}
const secsLeft = () => JP.round?.ends_at ? Math.max(0, Math.ceil((new Date(JP.round.ends_at) - Date.now()) / 1000)) : null;
function drawJackpot() {
  if (!$("#jpPot")) return;
  const tp = jpTotal(), me = ME.user && JP.entries.filter(e => e.user_id === ME.user.id).reduce((s, e) => s + +e.value, 0);
  $("#jpRound").textContent = JP.round ? "#" + JP.round.id : "—";
  $("#jpPot").innerHTML = coinVal(tp);
  $("#jpMe").textContent = me ? (me / tp * 100).toFixed(2) + "%" : "0%";
  const s = secsLeft(); $("#jpTime").textContent = JP.spinning ? "Rolling" : s === null ? "Waiting" : s + "s";
  $("#jpBack").hidden = !(me && JP.round && !JP.round.ends_at);
  const players = groupEntries();
  $("#jpBar").innerHTML = players.map(p => `<div style="width:${p.value / tp * 100}%;background:${pfpColor(p.name)}" title="${esc(p.name)}"></div>`).join("");
  $("#jpEntries").innerHTML = `<div class="section-title">${players.length} player${players.length === 1 ? "" : "s"}</div>` + (players.sort((a, b) => b.value - a.value).map(p => `<div class="entry" style="--pc:${pfpColor(p.name)}"><div class="entry-head"><div class="player">${pfp(p.name)}<div><div class="nm">${userLink(p.name)}</div><div class="muted" style="font-size:12px">${(p.value / tp * 100).toFixed(2)}%</div></div></div>${coinVal(p.value)}</div><div class="mini-items">${minis(p.items, 5)}</div></div>`).join("") || `<div class="empty">Pot is empty — be the first.</div>`);
  if (!JP.spinning) $("#jpReel").innerHTML = players.map(p => pfp(p.name)).join("");
  $("#jpHist").innerHTML = JP.history.map(h => `<div class="player" style="justify-content:space-between"><div class="player">${pfp(h.winner_name)}<div><div class="nm">${userLink(h.winner_name)}</div><div class="muted" style="font-size:12px">Round #${h.id}</div></div></div>${coinVal(h.total)}</div>`).join("") || `<div class="muted">No rounds yet.</div>`;
}
function groupEntries() {
  const m = new Map();
  for (const e of JP.entries) { const p = m.get(e.username) || { name: e.username, value: 0, items: [] }; p.value += +e.value; p.items.push(...fromJ(e.items)); m.set(e.username, p); }
  return [...m.values()];
}
async function animateJackpot(round) {
  if (JP.spinning) return;
  const players = groupEntries(); if (!players.length) return loadJackpot();
  JP.spinning = true; drawJackpot();
  const tp = players.reduce((s, p) => s + p.value, 0), reel = $("#jpReel");
  if (reel) {
    const winner = players.find(p => p.name === round.winner_name) || players[0];
    const strip = Array.from({ length: 70 }, (_, i) => { if (i === 60) return winner; let x = Math.random() * tp; for (const p of players) if ((x -= p.value) <= 0) return p; return players[0]; });
    reel.innerHTML = strip.map(p => pfp(p.name)).join("");
    const off = 60 * 78 + 36 - reel.parentElement.clientWidth / 2 + rand(-24, 24);
    reel.style.transition = "none"; reel.style.transform = "translateX(0)"; void reel.offsetWidth;
    reel.style.transition = "transform 6s cubic-bezier(.08,.72,.12,1)"; reel.style.transform = `translateX(${-off}px)`;
    await sleep(6300);
  }
  if (ME.profile && round.winner_name === ME.profile.username) toast(`You won the jackpot: ${fmt(round.total)}!`, "good");
  await sleep(1500);
  JP.spinning = false;
  const r = $("#jpReel"); if (r) { r.style.transition = "none"; r.style.transform = "translateX(0)"; }
  await refreshMe(); loadJackpot();
}
setInterval(async () => {
  if (!JP.round || JP.spinning) return;
  const s = secsLeft();
  if ($("#jpTime")) $("#jpTime").textContent = s === null ? "Waiting" : s + "s";
  if (s === 0 && !JP.settling && sb) { JP.settling = true; try { await rpc("jackpot_settle"); } catch {} JP.settling = false; }
}, 1000);

// ---------------------------------------------------------------- market
let marketUnusuals = Array.from({ length: 80 }, () => randomUnusual()).filter(Boolean);
function viewMarket() {
  $("#view").innerHTML = `<div class="page-head"><div><h1>Market</h1><p>Buy items with fun-coins. Prices follow TCBET's value guide.</p></div></div>
    <div class="toolbar"><input id="mkQ" placeholder="Search ${ITEMS.length} items…"><div class="tabs" id="mkTab"><button data-t="unu" class="on">Unusuals</button><button data-t="all">Items</button><button data-t="weap">Weapons</button><button data-t="rare">Rare</button></div>
      <select id="mkSort"><option value="desc">Price: high → low</option><option value="asc">Price: low → high</option><option value="az">Name</option></select></div>
    <div class="grid" id="mkGrid"></div><div style="text-align:center;margin-top:16px"><button class="btn" id="mkMore" hidden>Load more</button></div>`;
  let tab = "unu";
  const draw = () => {
    const q = $("#mkQ").value.toLowerCase(), s = $("#mkSort").value;
    let list = tab === "unu" ? marketUnusuals : ITEMS.filter(i => tab === "all" || (tab === "weap" ? i.weapon : i.v >= 50)).map(i => ({ n: i.name }));
    list = list.filter(it => label(it).toLowerCase().includes(q));
    list.sort(s === "az" ? (a, b) => label(a).localeCompare(label(b)) : s === "asc" ? (a, b) => value(a) - value(b) : (a, b) => value(b) - value(a));
    shown = list; page = 0; $("#mkGrid").innerHTML = ""; more();
  };
  let shown = [], page = 0;
  const PAGE = 48;
  const more = () => {
    const slice = shown.slice(page * PAGE, ++page * PAGE);
    $("#mkGrid").insertAdjacentHTML("beforeend", slice.map(it => card(it, { click: 1, extra: `data-i="${esc(JSON.stringify(it))}"` })).join("") || (page === 1 ? `<div class="empty">Nothing found.</div>` : ""));
    $("#mkMore").hidden = page * PAGE >= shown.length;
  };
  $("#mkMore").onclick = more;
  $("#mkTab").onclick = e => { const b = e.target.closest("button"); if (!b) return; tab = b.dataset.t; $$("#mkTab button").forEach(x => x.classList.toggle("on", x === b)); draw(); };
  $("#mkQ").oninput = draw; $("#mkSort").onchange = draw;
  $("#mkGrid").onclick = e => {
    const c = e.target.closest(".card"); if (!c) return; const it = JSON.parse(c.dataset.i), v = value(it);
    const bal = ME.profile ? +ME.profile.balance : 0;
    const m = modal(`<div class="win-show"><h2>${esc(label(it))}</h2><div class="muted">${it.fx ? FX[it.fx].series + " effect · " : ""}${esc(ITEM[it.n].worn)}</div>${thumb(it, "", true)}<div style="margin-bottom:16px">${coinVal(v)}</div>
      <div style="display:flex;gap:10px;justify-content:center"><button class="btn" data-close>Cancel</button><button class="btn btn-gold" id="mkBuy" ${ME.user && bal < v ? "disabled" : ""}>${!ME.user ? "Sign in to buy" : bal < v ? "Not enough coins" : "Buy for " + fmt(v)}</button></div></div>`);
    $("#mkBuy", m).onclick = async () => {
      if (needLogin()) return;
      try { await rpc("buy_item", { p_name: it.n, p_fx: it.fx || null }); closeModal(); await refreshMe(); bumpBalance(); toast(`Bought ${esc(label(it))}`, "good");
        if (it.fx) { marketUnusuals = marketUnusuals.filter(x => !(x.n === it.n && x.fx === it.fx)); draw(); } } catch (x) { fail(x); }
    };
  };
  draw();
}

// ---------------------------------------------------------------- inventory
function viewInventory() {
  if (!ME.user) { $("#view").innerHTML = `<div class="empty"><h2>Your inventory</h2><p>Sign in to see your items.</p><button class="btn btn-gold" id="ivLogin">Sign in</button></div>`; $("#ivLogin").onclick = () => openAuth(); return; }
  const sel = new Set(), p = ME.profile;
  $("#view").innerHTML = `<div class="panel inv-hero">${pfp(p.username)}<div style="flex:1"><h1 style="margin:0;font:800 22px Rubik">${esc(p.username)} ${vipTag(p.rank)}</h1><div class="muted">${ME.inv.length} items · joined ${new Date(p.created_at).toLocaleDateString()}</div></div>
      <div class="stat"><small>Inventory value</small><b>${coinVal(total(ME.inv))}</b></div><div class="stat"><small>Cases opened</small><b>${p.opened}</b></div><button class="btn" id="signOut">Sign out</button></div>
    <div class="toolbar"><input id="ivQ" placeholder="Search your items…"><button class="btn" id="ivAll">Select all</button></div>
    <div class="grid" id="ivGrid"></div>
    <div class="sel-bar" id="ivBar" hidden><span class="grow" id="ivInfo"></span><button class="btn" id="ivClear">Clear</button><button class="btn btn-gold" id="ivSell">Sell</button></div>`;
  const draw = () => {
    const q = $("#ivQ").value.toLowerCase();
    const list = ME.inv.filter(it => label(it).toLowerCase().includes(q)).sort((a, b) => value(b) - value(a));
    $("#ivGrid").innerHTML = list.map(it => card(it, { click: 1, sel: sel.has(it.id) })).join("") || `<div class="empty">No items yet. <a href="#/cases" style="color:var(--gold)">Open a case</a>.</div>`;
    const v = total(ME.inv.filter(i => sel.has(i.id)));
    $("#ivBar").hidden = !sel.size; $("#ivInfo").innerHTML = `${sel.size} selected · sells for ${coinVal(r2(v * sellRate()))}${isVip() ? " (VIP: full value)" : ""}`;
  };
  $("#ivQ").oninput = draw;
  $("#ivGrid").onclick = e => { const c = e.target.closest(".card"); if (!c) return; const id = +c.dataset.id; sel.has(id) ? sel.delete(id) : sel.add(id); draw(); };
  $("#ivAll").onclick = () => { ME.inv.forEach(i => sel.add(i.id)); draw(); };
  $("#ivClear").onclick = () => { sel.clear(); draw(); };
  $("#ivSell").onclick = async () => { try { await rpc("sell_items", { p_ids: [...sel] }); await refreshMe(); bumpBalance(); toast("Sold!", "good"); viewInventory(); } catch (e) { fail(e); } };
  $("#signOut").onclick = async () => { await sb.auth.signOut(); go("cases"); };
  draw();
}

// ---------------------------------------------------------------- trading
const TR = { them: null, theirInv: [], give: new Set(), get: new Set(), offers: [] };
async function loadOffers() {
  if (!ME.user) return;
  const { data } = await sb.from("trades").select("*").order("updated_at", { ascending: false }).limit(40);
  TR.offers = data || []; drawOffers();
  const n = TR.offers.filter(t => t.status === "pending" && t.receiver === ME.user.id).length;
  $("#tradeBadge").textContent = n; $("#tradeBadge").hidden = !n;
}
async function viewTrade(who) {
  if (!ME.user) { $("#view").innerHTML = `<div class="empty"><h2>Trading</h2><p>Sign in to trade items with other players.</p><button class="btn btn-gold" id="trLogin">Sign in</button></div>`; $("#trLogin").onclick = () => openAuth(); return; }
  $("#view").innerHTML = `<div class="page-head"><div><h1>Trade</h1><p>Look up a player, pick what you give and what you want, and send an offer. Nothing moves until they accept.</p></div></div>
    <div class="panel" style="padding:16px;margin-bottom:16px"><div class="section-title">Offers</div><div id="offerList" class="cf-list"></div></div>
    <form class="toolbar" id="trFind"><input id="trWho" placeholder="Player username" value="${esc(who || "")}" maxlength="20"><button class="btn">Load inventory</button></form>
    <div id="trBuilder"></div>`;
  $("#trFind").onsubmit = e => { e.preventDefault(); const u = $("#trWho").value.trim(); if (u) go("trade/" + encodeURIComponent(u)); };
  loadOffers();
  if (who) loadPartner(who);
}
async function loadPartner(who) {
  const { data: p } = await sb.from("profiles").select("id,username").ilike("username", who.replace(/[%_\\]/g, "\\$&")).maybeSingle();
  if (!p) return $("#trBuilder").innerHTML = `<div class="empty">No player named ${esc(who)}.</div>`;
  if (p.id === ME.user.id) return $("#trBuilder").innerHTML = `<div class="empty">That's you! Enter someone else's username.</div>`;
  const { data: inv } = await sb.from("inventory").select("id,name,fx").eq("owner", p.id).eq("state", "inv").limit(2000);
  TR.them = p; TR.theirInv = (inv || []).filter(r => ITEM[r.name]).map(r => ({ id: r.id, n: r.name, fx: r.fx })); TR.give.clear(); TR.get.clear();
  drawBuilder();
}
function drawBuilder() {
  const box = $("#trBuilder"); if (!box || !TR.them) return;
  const give = ME.inv.filter(i => TR.give.has(i.id)), get = TR.theirInv.filter(i => TR.get.has(i.id));
  const sorted = l => [...l].sort((a, b) => value(b) - value(a));
  box.innerHTML = `<div class="trade-sum panel">
      <div><div class="section-title">You give</div><div class="mini-items" style="flex-wrap:wrap">${give.map(mini).join("") || `<span class="muted">Nothing yet</span>`}</div><div style="margin-top:8px">${coinVal(total(give))} + <input id="trCoins" type="number" min="0" step="0.01" placeholder="coins" style="width:110px"></div></div>
      <div class="trade-arrow">⇄</div>
      <div><div class="section-title">You get from ${esc(TR.them.username)}</div><div class="mini-items" style="flex-wrap:wrap">${get.map(mini).join("") || `<span class="muted">Nothing yet</span>`}</div><div style="margin-top:8px">${coinVal(total(get))}</div></div>
      <button class="btn btn-gold" id="trSend">Send offer</button></div>
    <div class="trade-cols"><div><div class="section-title">Your items</div><div class="grid" id="trMine">${sorted(ME.inv).map(it => card(it, { click: 1, sel: TR.give.has(it.id) })).join("") || `<div class="muted">Empty</div>`}</div></div>
      <div><div class="section-title">${esc(TR.them.username)}'s items</div><div class="grid" id="trTheirs">${sorted(TR.theirInv).map(it => card(it, { click: 1, sel: TR.get.has(it.id) })).join("") || `<div class="muted">Empty</div>`}</div></div></div>`;
  const keepCoins = TR.coins || ""; $("#trCoins").value = keepCoins; $("#trCoins").oninput = e => TR.coins = e.target.value;
  $("#trMine").onclick = e => { const c = e.target.closest(".card"); if (!c) return; const id = +c.dataset.id; TR.give.has(id) ? TR.give.delete(id) : TR.give.add(id); drawBuilder(); };
  $("#trTheirs").onclick = e => { const c = e.target.closest(".card"); if (!c) return; const id = +c.dataset.id; TR.get.has(id) ? TR.get.delete(id) : TR.get.add(id); drawBuilder(); };
  $("#trSend").onclick = async () => {
    try {
      await rpc("trade_send", { p_to: TR.them.username, p_give: [...TR.give], p_get: [...TR.get], p_coins: +($("#trCoins").value || 0) });
      toast(`Offer sent to ${esc(TR.them.username)}`, "good"); TR.give.clear(); TR.get.clear(); TR.coins = ""; drawBuilder(); loadOffers();
    } catch (e) { fail(e); }
  };
}
function drawOffers() {
  const el = $("#offerList"); if (!el) return;
  const me = ME.user.id;
  el.innerHTML = TR.offers.map(t => {
    const out = t.sender === me, other = out ? t.receiver_name : t.sender_name;
    const give = fromJ(t.give), get = fromJ(t.get), mineGive = out ? give : get, mineGet = out ? get : give;
    const coinsIn = !out && +t.give_coins ? ` + ${coinVal(t.give_coins)}` : "", coinsOut = out && +t.give_coins ? ` + ${coinVal(t.give_coins)}` : "";
    const act = t.status !== "pending" ? `<span class="chip st-${t.status}">${t.status}</span>`
      : out ? `<button class="btn" data-tcancel="${t.id}">Cancel</button>`
      : `<button class="btn" data-tno="${t.id}">Decline</button><button class="btn btn-grn" data-tyes="${t.id}">Accept</button>`;
    return `<div class="offer ${t.status === "pending" && !out ? "incoming" : ""}"><div class="offer-who">${pfp(other)}<div><b>${out ? "To" : "From"} ${userLink(other)}</b><div class="muted" style="font-size:12px">${new Date(t.created_at).toLocaleString()}</div></div></div>
      <div><small class="muted">You give</small><div class="mini-items">${minis(mineGive, 5) || ""}</div>${coinVal(total(mineGive))}${coinsOut}</div>
      <div><small class="muted">You get</small><div class="mini-items">${minis(mineGet, 5) || ""}</div>${coinVal(total(mineGet))}${coinsIn}</div>
      <div class="offer-act">${act}</div></div>`;
  }).join("") || `<div class="muted">No offers yet.</div>`;
  el.onclick = async e => {
    const y = e.target.closest("[data-tyes]"), n = e.target.closest("[data-tno]"), c = e.target.closest("[data-tcancel]");
    try {
      if (y) { const r = await rpc("trade_respond", { p_id: +y.dataset.tyes, p_accept: true }); toast(r === "accepted" ? "Trade complete!" : "Trade failed: some items or coins were no longer available.", r === "accepted" ? "good" : "bad"); await refreshMe(); }
      if (n) await rpc("trade_respond", { p_id: +n.dataset.tno, p_accept: false });
      if (c) await rpc("trade_cancel", { p_id: +c.dataset.tcancel });
      if (y || n || c) { loadOffers(); if (TR.them) loadPartner(TR.them.username); }
    } catch (x) { fail(x); }
  };
}

// ---------------------------------------------------------------- live drops + chat
function pushDrop(d) {
  const t = $("#tickerTrack"), it = { n: d.name, fx: d.fx }; if (!t || !ITEM[it.n]) return;
  const el = document.createElement("div"); el.className = "drop"; el.style.setProperty("--rc", rarity(+d.value, it.fx));
  el.title = `${d.username} — ${label(it)} (${fmt(d.value)}) from ${d.source}`;
  el.innerHTML = thumb(it) + `<div class="who" style="${ME.profile && d.username === ME.profile.username ? "color:var(--gold)" : ""}">${esc(d.username)}</div>`;
  t.prepend(el); while (t.children.length > 30) t.lastChild.remove();
}
function chatLine(m) {
  const log = $("#chatLog"), sys = m.username === "TCBET";
  log.insertAdjacentHTML("beforeend", sys ? `<div class="msg sys"><div class="pfp" style="background:var(--unu)">★</div><div><b>TCBET</b><p>${esc(m.body)}</p></div></div>`
    : `<div class="msg">${pfp(m.username)}<div><b class="${ME.profile && m.username === ME.profile.username ? "me" : ""}">${userLink(m.username)}</b>${vipTag(m.rank)}<p>${esc(m.body)}</p></div></div>`);
  while (log.children.length > 80) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
}
$("#chatForm").onsubmit = async e => {
  e.preventDefault(); if (needLogin()) return;
  const v = $("#chatInput").value.trim(); if (!v) return;
  try { await rpc("chat_send", { p_body: v }); $("#chatInput").value = ""; } catch (x) { fail(x); }
};

// ---------------------------------------------------------------- daily coins
const DAILY_MS = 4 * 3600 * 1000, dailyAmt = () => isVip() ? 100 : 25;
function syncDaily() {
  const b = $("#dailyBtn");
  if (!ME.profile) { b.disabled = false; b.textContent = `Claim 25 free coins`; return; }
  const left = (ME.profile.daily_at ? new Date(ME.profile.daily_at).getTime() : 0) + DAILY_MS - Date.now();
  b.disabled = left > 0;
  b.textContent = left > 0 ? `Free coins in ${Math.ceil(left / 60000)}m` : `Claim ${dailyAmt()} free coins${isVip() ? " (VIP)" : ""}`;
}
$("#dailyBtn").onclick = async () => {
  if (needLogin()) return;
  try { await rpc("claim_daily"); await refreshMe(); bumpBalance(); toast(`+${dailyAmt()} fun-coins claimed`, "good"); } catch (e) { fail(e); }
};
setInterval(syncDaily, 30000);

// ---------------------------------------------------------------- realtime
function connectRealtime() {
  sb.channel("feed")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat" }, p => chatLine(p.new))
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "drops" }, p => pushDrop(p.new))
    .on("postgres_changes", { event: "*", schema: "public", table: "coinflips" }, p => {
      const g = p.new;
      if (g && g.status === "done" && ME.user && g.creator === ME.user.id && g.joiner) showFlip(g);   // someone joined my flip
      if (route()[0] === "coinflip") loadFlips();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "jackpot_rounds" }, p => {
      if (p.new && p.new.status === "done" && route()[0] === "jackpot") animateJackpot(p.new); else loadJackpot();
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "jackpot_entries" }, () => loadJackpot())
    .on("postgres_changes", { event: "*", schema: "public", table: "trades" }, p => {
      if (p.eventType === "INSERT" && ME.user && p.new.receiver === ME.user.id) toast(`New trade offer from ${esc(p.new.sender_name)}. <a href="#/trade">View</a>`, "good");
      if (p.new?.status === "accepted" && ME.user && p.new.sender === ME.user.id) toast(`${esc(p.new.receiver_name)} accepted your trade!`, "good");
      loadOffers(); refreshMe();
    })
    .subscribe();
  const pres = sb.channel("online", { config: { presence: { key: Math.random().toString(36).slice(2) } } });
  pres.on("presence", { event: "sync" }, () => $("#onlineCount").textContent = Object.keys(pres.presenceState()).length.toLocaleString())
    .subscribe(s => { if (s === "SUBSCRIBED") pres.track({ at: Date.now() }); });
}
async function loadFeeds() {
  const [{ data: chat }, { data: drops }] = await Promise.all([
    sb.from("chat").select("*").order("id", { ascending: false }).limit(40),
    sb.from("drops").select("*").order("id", { ascending: false }).limit(30),
  ]);
  $("#chatLog").innerHTML = ""; (chat || []).reverse().forEach(chatLine);
  (drops || []).reverse().forEach(pushDrop);
}

// ---------------------------------------------------------------- router
const route = () => (location.hash.replace(/^#\/?/, "").split("?")[0] || "cases").split("/").map(decodeURIComponent);
const go = r => location.hash = "#/" + r;
function render() {
  closeModal();
  const [r, arg] = route();
  $$("#nav a").forEach(a => a.classList.toggle("active", a.dataset.r === (r === "case" ? "cases" : r)));
  ({ cases: viewCases, case: () => viewCase(arg), unusualifier: viewUnusualifier, coinflip: viewCoinflip, jackpot: viewJackpot, market: viewMarket, inventory: viewInventory, trade: () => viewTrade(arg) }[r] || viewCases)();
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", render);

(async () => {
  syncTop(); render();
  if (!sb) { $("#chatLog").innerHTML = `<div class="msg sys"><div><p>TCBET's server isn't configured yet (config.js).</p></div></div>`; return; }
  sb.auth.onAuthStateChange((_e, session) => {
    const was = ME.user?.id; ME.user = session?.user || null;
    if (was !== ME.user?.id) refreshMe().then(() => { loadOffers(); render(); });
  });
  const { data } = await sb.auth.getSession(); ME.user = data.session?.user || null;
  await refreshMe(); render(); loadOffers();
  loadFeeds(); connectRealtime();
  setInterval(() => { if (ME.user && !document.hidden) refreshMe(); }, 20000);
})();
})();

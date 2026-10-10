/* TCBET — multiplayer fun-coin Typical Colors 2 item site. No real money anywhere.
   Every balance/item change happens in Supabase functions (supabase/schema.sql); this file only renders and calls them. */
(() => {
"use strict";

// ---------------------------------------------------------------- data
const ITEMS = window.TC2_ITEMS, EFFECTS = window.TC2_EFFECTS, CASES = window.TC2_CASES.sort((a, b) => b.price - a.price);   // everything on the site is listed high -> low
const ITEM = Object.fromEntries(ITEMS.map(i => [i.name, i]));
const FX = Object.fromEntries(EFFECTS.map(e => [e.name, e]));
const UNU_HATS = ITEMS.filter(i => i.unu).sort((a, b) => (b.hf || 0) - (a.hf || 0));
const QCOLOR = { "Strange": "#e0773a", "Collector's": "#e03a3a", "Vintage": "#6b8fd1", "Genuine": "#5fa36f", "Haunted": "#38f3ab" };
const STANDARD = new Set(["S1","S2","S3","S4","S5","S6","S7","S8","S9","S10"]);

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const r2 = n => Math.round(n * 100) / 100;
// cents only matter under 100 coins: 25,000 rather than 25,000.00
const fmt = n => Math.abs(+n) >= 100 ? Math.round(+n).toLocaleString("en-US") : (+n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  const ux = fx.g.includes("UX");
  let v = Math.min(100000, fx.m * (ux ? Math.min(1, base.hf) : base.hf));
  if (it.fx === "Burning" || it.fx === "Scorching Energy") v = Math.max(v, base.fbs || 0);   // 2018 hats: never under 10k
  if (!ux) v = Math.max(v, base.fany || 0);                                                // shop hats: at least 5k
  return r2(v);
}
const label = it => it.fx ? `${it.fx} ${it.n}` : it.n;
const total = list => r2(list.reduce((s, it) => s + value(it), 0));
function rarity(v, fx) {
  if (fx) return "var(--unu2)";
  return v >= 1000 ? "var(--r6)" : v >= 100 ? "var(--r5)" : v >= 20 ? "var(--r4)" : v >= 4 ? "var(--r3)" : v >= 1 ? "var(--r2)" : "var(--r1)";
}
const coinVal = v => `<span class="val"><i class="coin"></i>${fmt(v)}</span>`;
const fromJ = list => (list || []).map(x => ({ id: x.id, n: x.n, fx: x.fx || null })).filter(x => ITEM[x.n]);

// ---------------------------------------------------------------- sound effects (synthesised, no files)
const SFX = (() => {
  let ctx = null, muted = false;
  try { muted = localStorage.getItem("tcbet_mute") === "1"; } catch {}
  const ac = () => { if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } } if (ctx.state === "suspended") ctx.resume(); return ctx; };
  function tone(f, dur = .1, type = "sine", vol = .12, at = 0, slide) {
    if (muted) return; const c = ac(); if (!c) return;
    const t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + .02);
  }
  function noise(dur = .3, vol = .08, freq = 1200, at = 0) {
    if (muted) return; const c = ac(); if (!c) return;
    const t = c.currentTime + at, buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    f.type = "bandpass"; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(freq * 3, t + dur);
    g.gain.value = vol; s.buffer = buf; s.connect(f).connect(g).connect(c.destination); s.start(t);
  }
  const notes = (seq, step, type, vol, base = 0) => seq.forEach((f, i) => tone(f, step * 1.6, type, vol, base + i * step));
  return {
    get muted() { return muted; },
    toggle() { muted = !muted; try { localStorage.setItem("tcbet_mute", muted ? "1" : "0"); } catch {} if (!muted) this.click(); return muted; },
    unlock() { ac(); },
    click() { tone(900, .04, "square", .03); },
    tick() { tone(1500 + Math.random() * 300, .022, "square", .035); },
    whoosh() { noise(.45, .07, 700); },
    win() { notes([523, 659, 784], .09, "triangle", .1); },
    good() { notes([523, 659, 784, 1047], .08, "triangle", .12); tone(2093, .5, "sine", .04, .3); },
    rare() { notes([392, 523, 659, 784, 1047, 1319], .07, "triangle", .13); for (let i = 0; i < 8; i++) tone(2400 + i * 180, .12, "sine", .03, .45 + i * .05); },
    lose() { notes([392, 330, 262], .12, "sawtooth", .05); },
    coin() { tone(2600, .18, "triangle", .08); tone(3900, .12, "sine", .04, .02); },
    land() { tone(180, .12, "sine", .2, 0, 90); tone(2200, .3, "triangle", .06, .02); },
    count() { tone(660, .09, "square", .05); },
    heartbeat() { tone(70, .12, "sine", .35, 0, 50); tone(65, .12, "sine", .25, .18, 45); },
    join() { notes([784, 1175], .08, "triangle", .1); tone(1568, .25, "sine", .05, .16); },
    drumroll(ms) { const n = Math.floor(ms / 55); for (let i = 0; i < n; i++) noise(.05, .05 + .05 * i / n, 260, i * .055); },
    cash() { notes([1319, 1568, 2093], .06, "triangle", .1); for (let i = 0; i < 10; i++) tone(2800 + Math.random() * 1400, .1, "triangle", .04, .15 + i * .05); },
    click2() { tone(260, .03, "square", .12); noise(.04, .12, 3000); },
    spinCyl() { for (let i = 0; i < 6; i++) tone(420 + i * 30, .03, "square", .06, i * .07); },
    bang() { noise(.6, .55, 180); tone(90, .35, "sawtooth", .25, 0, 40); },
    survive() { notes([523, 659, 784, 1047, 1319], .1, "triangle", .14); },
    go() { tone(990, .18, "square", .06); },
    jackpot() {   // casino bells + coin shower for big wins
      for (let r = 0; r < 4; r++) notes([523, 659, 784, 1047, 784, 1047, 1319], .075, "triangle", .12, r * .62);
      for (let i = 0; i < 28; i++) tone(2400 + Math.random() * 1600, .14, "triangle", .05, .1 + i * .09);
      tone(130, 1.6, "sawtooth", .05, 0, 260);
    },
  };
})();
document.addEventListener("pointerdown", () => SFX.unlock(), { once: true });
// plays a tick each time a reel moves one card past the marker
function reelTicks(reel, size, ms, axis = "x") {
  const end = performance.now() + ms; let last = null;
  const step = () => {
    const r = reel.getBoundingClientRect(), pr = reel.parentElement.getBoundingClientRect();
    const pos = Math.floor(((axis === "x" ? pr.left - r.left : pr.top - r.top)) / size);
    if (last !== null && pos !== last) SFX.tick();
    last = pos; if (performance.now() < end) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
const BIG_WIN = 25000;
function bigWin(v, what = "") {
  SFX.jackpot();
  const o = document.createElement("div"); o.className = "bigwin";
  o.innerHTML = `<div class="bigwin-card"><div class="bigwin-title">MEGA WIN</div><div class="bigwin-val"><i class="coin"></i>${fmt(v)}</div><div class="bigwin-sub">${esc(what)}</div></div>`;
  document.body.append(o);
  const colors = ["#f5b83d", "#ffd36b", "#fff3c4", "#ef4444", "#22c55e", "#b07ad8", "#3b82f6"];
  const W = innerWidth, H = innerHeight;
  for (let i = 0; i < 160; i++) {          // coin rain
    const d = document.createElement("i"); d.className = Math.random() < .55 ? "rain-coin" : "confetti";
    if (d.className === "confetti") d.style.background = pick(colors);
    d.style.left = rand(0, W) + "px"; d.style.top = "-30px"; o.append(d);
    d.animate([{ transform: "translateY(0) rotate(0)" }, { transform: `translateY(${H + 80}px) rotate(${rand(-900, 900)}deg)` }],
      { duration: rand(1800, 3600), delay: rand(0, 2200), easing: "cubic-bezier(.3,.1,.7,1)", fill: "both" });
  }
  for (let b = 0; b < 6; b++) setTimeout(() => {   // bursts
    const x = rand(W * .15, W * .85), y = rand(H * .2, H * .7);
    for (let i = 0; i < 40; i++) {
      const d = document.createElement("i"); d.className = "confetti"; d.style.background = pick(colors); d.style.left = x + "px"; d.style.top = y + "px"; o.append(d);
      const a = rand(0, Math.PI * 2), r = rand(80, 300);
      d.animate([{ transform: "translate(0,0)", opacity: 1 }, { transform: `translate(${Math.cos(a) * r}px,${Math.sin(a) * r + 200}px) rotate(${rand(-720, 720)}deg)`, opacity: 0 }], { duration: rand(1000, 1800), easing: "cubic-bezier(.2,.7,.3,1)", fill: "forwards" });
    }
    SFX.coin();
  }, 300 + b * 450);
  o.onclick = () => o.remove();
  setTimeout(() => o.classList.add("out"), 4600); setTimeout(() => o.remove(), 5200);
}
function celebrate(items, what) {
  const top = items.reduce((m, it) => value(it) > value(m) ? it : m, items[0]);
  const tv = total(items);
  if (value(top) >= BIG_WIN) bigWin(value(top), label(top) + (what ? " · " + what : ""));
  else if (top.fx || value(top) >= 1000) SFX.rare(); else if (tv >= 5) SFX.good(); else SFX.win();
}

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
const isVip = () => ["vip", "owner"].includes(ME.profile?.rank);
const vipTag = r => r === "owner" ? `<span class="vip-tag owner-tag" title="Site owner">OWNER</span>` : r === "vip" ? `<span class="vip-tag" title="VIP">VIP</span>` : "";
// levels: level L needs 100*(L-1)^2 xp (1 xp per coin wagered) — same formula as level_of() on the server
const levelOf = xp => Math.floor(Math.sqrt(Math.max(0, +xp || 0) / 100)) + 1;
const xpFor = L => 100 * (L - 1) ** 2;
const rakeRate = (L, rank) => Math.min(.03, .005 + .0005 * L) + (["vip", "owner"].includes(rank) ? .01 : 0);
const crateBudget = L => 4 + 3 * L;
const lvlChip = xp => `<span class="lvl-chip" title="Level">Lv ${levelOf(xp)}</span>`;
const sellRate = () => isVip() ? 1 : .95;

function syncTop() {
  const p = ME.profile;
  $("#balance").hidden = !p; $("#avatarLink").hidden = !p; $("#loginBtn").hidden = !!p; if (!p) $("#lvlChip").hidden = true;
  if (p) {
    $("#balance span").textContent = fmt(p.balance);
    const inner = avatarInner(p.avatar);
    $("#avatarInitial").innerHTML = inner || esc(p.username[0].toUpperCase());
    $("#avatarLink").classList.toggle("has-av", !!inner);
    $("#avatarLink").classList.toggle("is-vip", isVip());
    $("#avatarLink").href = "#/inventory";   // inventory is where you sell; it links on to your profile
    $("#lvlChip").textContent = "Lv " + levelOf(p.xp); $("#lvlChip").hidden = false;
    const rewards = Math.max(0, levelOf(p.xp) - 1 - p.crates_claimed) + (+p.rakeback >= 0.01 ? 1 : 0);
    $("#rewardBadge").textContent = rewards; $("#rewardBadge").hidden = !rewards;
    rememberProfile(p);
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
const CLASS_IMG = { Flanker: "a/aa/Flankertransparent.png", Trooper: "b/be/Troopertransparent.png", Arsonist: "7/7b/Arsonisttransparent.png",
  Annihilator: "3/3c/Annihilatortransparent.png", Brute: "2/26/Brutetransparent.png", Mechanic: "a/a2/Mechanictransparent.png",
  Doctor: "d/d1/Doctortransparent.png", Marksman: "4/46/Marksmantransparent.png", Agent: "5/56/Agenttransparent.png" };
const classImg = c => `https://static.wikia.nocookie.net/tc2/images/${CLASS_IMG[c]}`;
function parseAvatar(a) {
  if (!a) return null;
  if (a.startsWith("class:")) return CLASS_IMG[a.slice(6)] ? { cls: a.slice(6) } : null;
  if (a.startsWith("item:")) { const [n, fx] = a.slice(5).split("|"); return ITEM[n] ? { it: { n, fx: fx && FX[fx] ? fx : null } } : null; }
  return null;
}
// small avatar: static image only (cheap enough for chat); unusual items get a purple ring
function avatarInner(a) {
  const p = parseAvatar(a); if (!p) return null;
  if (p.cls) return `<img src="${sized(classImg(p.cls), 96)}" alt="" referrerpolicy="no-referrer">`;
  return `<img src="${sized(ITEM[p.it.n].img, 96)}" alt="" referrerpolicy="no-referrer">`;
}
const PROF = new Map();   // lowercase username -> {username, rank, avatar, xp}
let profWant = new Set(), profTimer = 0;
function wantProfile(n) {
  if (!sb || !n || n === "TCBET" || n === "House" || PROF.has(n.toLowerCase())) return;
  profWant.add(n); clearTimeout(profTimer); profTimer = setTimeout(fetchProfiles, 120);
}
async function fetchProfiles() {
  const names = [...profWant]; profWant = new Set(); if (!names.length) return;
  const { data } = await sb.from("profiles").select("username,rank,avatar,xp").in("username", names);
  for (const n of names) if (!PROF.has(n.toLowerCase())) PROF.set(n.toLowerCase(), null);
  for (const r of data || []) PROF.set(r.username.toLowerCase(), r);
  hydrate(document);
}
function rememberProfile(r) { if (r?.username) { PROF.set(r.username.toLowerCase(), r); hydrate(document); } }
function hydrate(root) {
  root.querySelectorAll?.("[data-u]").forEach(el => {
    const r = PROF.get(el.dataset.u.toLowerCase());
    if (r === undefined) return wantProfile(el.dataset.u);
    if (!r || el.dataset.av === (r.avatar || "") + r.rank) return;
    el.dataset.av = (r.avatar || "") + r.rank;
    const inner = avatarInner(r.avatar);
    if (inner) { el.innerHTML = inner; el.classList.add("has-av"); el.classList.toggle("av-unu", r.avatar.includes("|")); }
    el.classList.toggle("ring-vip", r.rank === "vip"); el.classList.toggle("ring-owner", r.rank === "owner");
  });
}
new MutationObserver(muts => { for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) { if (n.dataset?.u) hydrate(n.parentNode || document); else hydrate(n); } })
  .observe(document.body, { childList: true, subtree: true });
const pfp = (n, cls = "pfp") => `<div class="${cls}" ${n && n !== "TCBET" && n !== "House" ? `data-u="${esc(n)}"` : ""} style="background:${pfpColor(n)}">${esc((n || "?")[0].toUpperCase())}</div>`;
const userLink = n => n && n !== "TCBET" && n !== "House" ? `<a href="#/u/${encodeURIComponent(n)}" class="ulink">${esc(n)}</a>` : esc(n);

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
const syncMute = () => { $("#muteBtn").textContent = SFX.muted ? "🔇" : "🔊"; $("#muteBtn").title = SFX.muted ? "Sound off" : "Sound on"; };
$("#muteBtn").onclick = () => { SFX.toggle(); syncMute(); }; syncMute();

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
  SFX.whoosh(); reelTicks(reel, W, ms);
  await sleep(ms + 150);
  if (win.fx) await unusualSpin(reel, c, win, ms);
}
// landed on the ★: flash, then spin again through possible unusuals from this case and stop on the real one
async function unusualSpin(reel, c, win, ms) {
  const wrap = reel.parentElement, N = 46, WIN = 38, W = 158;
  wrap.classList.add("unu-flash"); SFX.rare(); await sleep(ms > 2000 ? 900 : 300);
  const e = c?.entries?.find(x => x.unusual);
  const hats = (e?.hats || [win.n]).map(n => ITEM[n]).filter(Boolean), groups = e?.groups || [...STANDARD];
  const combo = () => { for (let i = 0; i < 20; i++) { const h = pick(hats), o = allowedFx(h).filter(f => f.g.some(g => groups.includes(g) && h.fx.includes(g))); if (o.length) return { n: h.name, fx: pick(o).name }; } return win; };
  reel.innerHTML = Array.from({ length: N }, (_, i) => card(i === WIN ? win : combo())).join("");
  wrap.classList.remove("unu-flash"); wrap.classList.add("unu-mode");
  const offset = WIN * W + rand(10, 140) - wrap.clientWidth / 2, t = ms > 2000 ? 4200 : 1400;
  reel.style.transition = "none"; reel.style.transform = "translateX(0)"; void reel.offsetWidth;
  reel.style.transition = `transform ${t}ms cubic-bezier(.08,.72,.12,1)`; reel.style.transform = `translateX(${-offset}px)`;
  SFX.whoosh(); reelTicks(reel, W, t);
  await sleep(t + 200);
  reel.children[WIN].classList.add("reel-win"); confetti(wrap, 60, ["#b07ad8", "#8650ac", "#f5b83d", "#fff"]);
  await sleep(ms > 2000 ? 900 : 300);
}
function confetti(host, n = 50, colors = ["#f5b83d", "#22c55e", "#ef4444", "#fff"]) {
  const box = host.getBoundingClientRect();
  for (let i = 0; i < n; i++) {
    const d = document.createElement("i"); d.className = "confetti";
    d.style.left = box.left + box.width / 2 + "px"; d.style.top = box.top + box.height / 2 + "px"; d.style.background = pick(colors);
    document.body.append(d);
    const a = rand(0, Math.PI * 2), r = rand(80, 260);
    d.animate([{ transform: "translate(0,0) rotate(0)", opacity: 1 }, { transform: `translate(${Math.cos(a) * r}px,${Math.sin(a) * r + 160}px) rotate(${rand(-720, 720)}deg)`, opacity: 0 }],
      { duration: rand(900, 1600), easing: "cubic-bezier(.2,.7,.3,1)" }).onfinish = () => d.remove();
  }
}
function showWins(wins) {
  const tv = total(wins);
  celebrate(wins, "Unboxed");
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
      <div class="fx-grid">${options.filter(e => e.name.toLowerCase().includes(q)).sort((a, b) => value({ n: h.name, fx: b.name }) - value({ n: h.name, fx: a.name })).map(e => { const v = value({ n: h.name, fx: e.name }); return card({ n: h.name, fx: e.name }, { click: 1, sel: U.fx === e.name, sub: s ? `${e.series} · ${(Math.min(.75, s / v * .95) * 100).toFixed(2)}% chance` : e.series, extra: `data-fx="${esc(e.name)}"` }); }).join("") || `<div class="empty">No effects on this hat are worth more than your stake.</div>`}</div>`;
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
  SFX.whoosh(); { const t0 = performance.now(); let last = 0; const tk = () => { const a = new DOMMatrix(getComputedStyle(needle).transform), deg = (Math.atan2(a.b, a.a) * 180 / Math.PI + 360) % 360, seg = Math.floor(deg / 15); if (seg !== last) SFX.tick(); last = seg; if (performance.now() - t0 < 4200) requestAnimationFrame(tk); }; requestAnimationFrame(tk); }
  await sleep(4400);
  $("#dial").classList.add(res.win ? "win" : "lose");
  $("#chance").textContent = res.win ? "WIN" : "LOSS";
  await refreshMe();
  if (res.win) celebrate([t], "Unusualifier"); else SFX.lose();
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
setInterval(() => { if (route()[0] === "coinflip" && FLIPS.some(flipLive)) drawFlips(); }, 2000);
function viewCoinflip() {
  $("#view").innerHTML = `<div class="page-head"><div><h1>Coinflip</h1><p>RED or GRN. Match the other player's items within ±10% and flip for everything. Nobody joining? Flip against the House for coins.</p></div><button class="btn btn-gold" id="cfCreate">Create game</button></div>
    <div class="cf-list" id="cfList"><div class="empty">Loading…</div></div><div class="section-title" style="margin-top:22px">Recent flips</div><div class="cf-list" id="cfDone"></div>`;
  $("#cfCreate").onclick = createFlip; loadFlips();
}
const sideChip = s => `<span class="side ${s}" style="position:static;display:inline-block;width:10px;height:10px;border:0;border-radius:50%"></span>`;
function drawFlips() {
  const el = $("#cfList"); if (!el) return;
  const open = FLIPS.filter(g => g.status === "open"), live = FLIPS.filter(flipLive), done = FLIPS.filter(g => g.status === "done" && !flipLive(g));
  el.innerHTML = open.map(g => { const items = fromJ(g.creator_items), v = +g.creator_value, mine = ME.user && g.creator === ME.user.id, other = g.side === "RED" ? "GRN" : "RED"; return `<div class="panel cf-row">
      <div class="player"><div class="pfp" style="background:${pfpColor(g.creator_name)}">${esc(g.creator_name[0].toUpperCase())}<span class="side ${g.side}"></span></div><div><div class="nm">${userLink(g.creator_name)}</div><div class="muted" style="font-size:12px">${items.length} items · ${g.side}</div></div></div>
      <div class="mini-items">${minis(items, 7)}</div>
      <div>${coinVal(v)}<div class="muted" style="font-size:11px">${fmt(v * .9)} – ${fmt(v * 1.1)}</div></div>
      <div style="display:flex;gap:6px">${mine ? `<button class="btn" data-house="${g.id}" style="flex:1">vs House</button><button class="btn" data-cancel="${g.id}" title="Cancel">✕</button>` : `<button class="btn btn-${other === "GRN" ? "grn" : "red"}" data-join="${g.id}" style="flex:1">Join as ${other}</button>`}<button class="btn" data-watch="${g.id}" title="Watch">👁</button></div></div>`; }).join("")
    + live.map(g => `<div class="panel cf-row live-row"><div class="player">${pfp(g.creator_name)}<div><div class="nm">${userLink(g.creator_name)}</div><div class="muted" style="font-size:12px">${g.side}</div></div></div>
      <div class="player">${pfp(g.joiner_name)}<div><div class="nm">${userLink(g.joiner_name)}</div><div class="muted" style="font-size:12px">${g.side === "RED" ? "GRN" : "RED"}</div></div></div>
      <div>${coinVal(+g.creator_value + +g.joiner_value)}</div><div><button class="btn btn-gold" data-livewatch="${g.id}" style="width:100%"><span class="live-dot"></span>LIVE · Watch</button></div></div>`).join("")
    || `<div class="empty">No open games. Create one!</div>`;
  $("#cfDone").innerHTML = done.map(g => `<div class="panel cf-row" style="opacity:.8">
      <div class="player">${pfp(g.creator_name)}<div><div class="nm">${userLink(g.creator_name)}</div><div class="muted" style="font-size:12px">${g.side} ${g.winner_side === g.side ? "· won" : ""}</div></div></div>
      <div class="player">${pfp(g.joiner_name)}<div><div class="nm">${userLink(g.joiner_name)}</div><div class="muted" style="font-size:12px">${g.side === "RED" ? "GRN" : "RED"} ${g.winner_side !== g.side ? "· won" : ""}</div></div></div>
      <div>${coinVal(+g.creator_value + +g.joiner_value)}</div><div style="display:flex;gap:8px;align-items:center">${sideChip(g.winner_side)} <b>${g.winner_side}</b> won <button class="btn" data-replay="${g.id}" style="margin-left:auto;padding:6px 10px">Replay</button></div></div>`).join("") || `<div class="muted">No flips yet.</div>`;
  $("#cfDone").onclick = e => { const r = e.target.closest("[data-replay]"); if (r) showFlip(FLIPS.find(g => g.id === +r.dataset.replay), true); };
  el.onclick = async e => {
    const j = e.target.closest("[data-join]"), h = e.target.closest("[data-house]"), c = e.target.closest("[data-cancel]"), w = e.target.closest("[data-watch]");
    if (w) watchFlip(FLIPS.find(g => g.id === +w.dataset.watch));
    const lw = e.target.closest("[data-livewatch]"); if (lw) showFlip(FLIPS.find(g => g.id === +lw.dataset.livewatch), true);
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
const flipLive = g => g.status === "done" && Date.now() < new Date(g.finished_at).getTime() + 5000 + 5200 + 800;
let watchingFlip = null;
const FLIP_WAIT = 5000, FLIP_TOSS = 5200;
const flipCol = p => `<div><div class="player" style="justify-content:center;flex-direction:column">${pfp(p.name)}<b>${userLink(p.name)}</b><span class="chip">${sideChip(p.side)}${p.side}</span></div><div style="margin-top:8px">${coinVal(p.v)}</div><div class="mini-items" style="justify-content:center;margin-top:8px;flex-wrap:wrap">${p.items.length ? minis(p.items, 6) : `<span class="muted">${p.name === "House" ? "coins" : "…"}</span>`}</div></div>`;
const coinStage = () => `<div class="cf-stage"><div class="cf-count" id="cfCount"></div><div class="cf-toss" id="cfToss"><div class="coin3d" id="coin3d"><div class="face RED">RED</div><div class="coin-edge"></div><div class="face GRN">GRN</div></div></div><div class="cf-shadow" id="cfShadow"></div></div>`;
// watch an open flip: shows the creator and waits for someone to join
function watchFlip(g) {
  watchingFlip = g.id;
  const a = { name: g.creator_name, side: g.side, items: fromJ(g.creator_items), v: +g.creator_value };
  modal(`<h2 style="text-align:center">Coinflip #${g.id}</h2><div class="vs cf-vs" style="margin-top:12px"><div class="cf-side">${flipCol(a)}</div>${coinStage()}
    <div class="cf-side cf-empty"><div class="player" style="justify-content:center;flex-direction:column"><div class="pfp wait-pfp">?</div><b class="muted">Waiting for a player…</b><span class="chip">${sideChip(g.side === "RED" ? "GRN" : "RED")}${g.side === "RED" ? "GRN" : "RED"}</span></div></div></div>
    <div id="cfRes" style="text-align:center;margin-top:12px"><span class="spectate-tag">👁 Spectating</span><div class="muted" style="margin-top:6px">The flip plays here as soon as someone joins.</div></div>`);
}
// result is decided on the server the moment someone joins; everyone sees it 5 seconds later
async function showFlip(g, replay = false) {
  if (!replay && shownFlips.has(g.id)) return; shownFlips.add(g.id);
  watchingFlip = g.id;
  const a = { name: g.creator_name, side: g.side, items: fromJ(g.creator_items), v: +g.creator_value };
  const b = { name: g.joiner_name, side: g.side === "RED" ? "GRN" : "RED", items: fromJ(g.joiner_items), v: +g.joiner_value };
  $("#modal").dataset.lock = 1;
  modal(`<h2 style="text-align:center">Coinflip #${g.id}</h2><div class="vs cf-vs" style="margin-top:12px"><div class="cf-side" data-side="${a.side}">${flipCol(a)}</div>${coinStage()}
    <div class="cf-side" data-side="${b.side}">${flipCol(b)}</div></div><div id="cfRes" style="text-align:center;margin-top:12px" class="muted">${ME.user && [g.creator, g.joiner].includes(ME.user.id) ? "" : `<span class="spectate-tag">👁 Spectating</span> `}${esc(b.name)} joined! Flipping for ${fmt(a.v + b.v)}…</div>`);
  SFX.join();
  const realAt = new Date(g.finished_at).getTime() + FLIP_WAIT, flipAt = replay && realAt < Date.now() ? Date.now() + 3000 : realAt;
  let lastN = null;
  while (Date.now() < flipAt && $("#cfCount")) {
    const n = Math.ceil((flipAt - Date.now()) / 1000);
    if (n !== lastN) { lastN = n; $("#cfCount").textContent = n; $("#cfCount").classList.remove("pop"); void $("#cfCount").offsetWidth; $("#cfCount").classList.add("pop"); SFX.count(); SFX.heartbeat(); }
    await sleep(100);
  }
  if (!$("#cfCount")) return;
  $("#cfCount").textContent = ""; SFX.go(); SFX.whoosh(); SFX.drumroll(FLIP_TOSS * .8);
  const spins = 18 + (g.winner_side === "GRN" ? .5 : 0), T = FLIP_TOSS;
  $("#cfToss").animate([{ transform: "translateY(0) scale(1)" }, { transform: "translateY(-170px) scale(1.3)", offset: .42 }, { transform: "translateY(0) scale(1)", offset: .82 },
    { transform: "translateY(-22px) scale(1.05)", offset: .9 }, { transform: "translateY(0) scale(1)", offset: .96 }, { transform: "translateY(0) scale(1)" }], { duration: T, easing: "ease-in-out", fill: "forwards" });
  $("#cfShadow").animate([{ transform: "scale(1)", opacity: .5 }, { transform: "scale(.4)", opacity: .12, offset: .42 }, { transform: "scale(1)", opacity: .5, offset: .82 }, { transform: "scale(1)", opacity: .5 }], { duration: T, fill: "forwards" });
  $("#coin3d").animate([{ transform: "rotateX(10deg) rotateY(0)" }, { transform: `rotateX(10deg) rotateY(${spins * 360}deg)` }], { duration: T * .86, easing: "cubic-bezier(.12,.55,.2,1)", fill: "forwards" });
  { let k = 0; const iv = setInterval(() => { if (++k > 22) return clearInterval(iv); SFX.tick(); }, T * .8 / 26); }
  await sleep(T * .82); SFX.land(); await sleep(T * .18 + 150);
  if (!$("#coin3d")) return;
  delete $("#modal").dataset.lock;
  const won = ME.user && g.winner === ME.user.id, winner = g.winner_side === a.side ? a : b, pot = a.v + b.v;
  $$(".cf-side").forEach(s => s.classList.add(s.dataset.side === g.winner_side ? "cf-win" : "cf-lose"));
  $("#coin3d").classList.add("glow-" + g.winner_side);
  confetti($("#coin3d"), won ? 100 : 50, g.winner_side === "RED" ? ["#ef4444", "#ff8a80", "#f5b83d", "#fff"] : ["#22c55e", "#86efac", "#f5b83d", "#fff"]);
  if (won && pot >= BIG_WIN) bigWin(pot, "Coinflip #" + g.id); else if (won) { SFX.good(); SFX.cash(); } else if (ME.user && [g.creator, g.joiner].includes(ME.user.id)) SFX.lose(); else SFX.win();
  $("#cfRes").innerHTML = `<h2 style="color:${g.winner_side === "RED" ? "var(--red)" : "var(--grn)"}">${g.winner_side} wins!</h2>${won ? `You won ${coinVal(pot)}!` : `${userLink(winner.name)} took the pot of ${coinVal(pot)}.`}<div style="margin-top:14px"><button class="btn" data-close>Close</button></div>`;
  watchingFlip = null;
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
    SFX.whoosh(); reelTicks(reel, 78, 6000);
    await sleep(6300);
  }
  if (ME.profile && round.winner_name === ME.profile.username) { toast(`You won the jackpot: ${fmt(round.total)}!`, "good"); if (+round.total >= BIG_WIN) bigWin(+round.total, "Jackpot #" + round.id); else SFX.good(); }
  await sleep(1500);
  JP.spinning = false;
  const r = $("#jpReel"); if (r) { r.style.transition = "none"; r.style.transform = "translateX(0)"; }
  await refreshMe(); loadJackpot();
}
setInterval(async () => {
  if (!JP.round || JP.spinning) return;
  const s = secsLeft();
  if ($("#jpTime")) $("#jpTime").textContent = s === null ? "Waiting" : s + "s";
  if (s === 0 && !JP.settling && sb && ME.user) { JP.settling = true; try { await rpc("jackpot_settle"); } catch {} JP.settling = false; }
}, 1000);

// ---------------------------------------------------------------- market
let marketUnusuals = Array.from({ length: 80 }, () => randomUnusual()).filter(Boolean);
function viewMarket() {
  $("#view").innerHTML = `<div class="page-head"><div><h1>Market</h1><p>Buy items with fun-coins. Prices follow TCBET's value guide.</p></div></div>
    <div class="toolbar"><input id="mkQ" placeholder="Search ${ITEMS.length} items…"><div class="tabs" id="mkTab"><button data-t="unu" class="on">Unusuals</button><button data-t="all">Items</button><button data-t="weap">Weapons</button><button data-t="rare">Rare</button></div></div>
    <div class="grid" id="mkGrid"></div><div style="text-align:center;margin-top:16px"><button class="btn" id="mkMore" hidden>Load more</button></div>`;
  let tab = "unu";
  const draw = () => {
    const q = $("#mkQ").value.toLowerCase();
    let list = tab === "unu" ? marketUnusuals : ITEMS.filter(i => tab === "all" || (tab === "weap" ? i.weapon : i.v >= 50)).map(i => ({ n: i.name }));
    list = list.filter(it => label(it).toLowerCase().includes(q));
    list.sort((a, b) => value(b) - value(a));
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
  $("#mkQ").oninput = draw;
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
      <div class="stat"><small>Inventory value</small><b>${coinVal(total(ME.inv))}</b></div><div class="stat"><small>Cases opened</small><b>${p.opened}</b></div><a class="btn" href="#/u/${encodeURIComponent(p.username)}">View profile</a><button class="btn" id="signOut">Sign out</button></div>
    <div class="toolbar"><input id="ivQ" placeholder="Search your items…"><button class="btn" id="ivAll">Select all</button></div>
    <form class="panel bulk-sell" id="ivBulk"><b>Sell by value</b><span class="muted">Select every item</span>
      <select id="ivDir"><option value="under">under</option><option value="over">over</option></select>
      <span class="val"><i class="coin"></i><input id="ivAmt" type="number" min="0" step="0.01" placeholder="1.00" required></span>
      <label class="chk"><input type="checkbox" id="ivKeepUnu" checked> keep unusuals</label>
      <button class="btn">Select</button><span id="ivBulkInfo" class="muted"></span></form>
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
  $("#ivBulk").onsubmit = e => {
    e.preventDefault();
    const amt = +$("#ivAmt").value, over = $("#ivDir").value === "over", keepUnu = $("#ivKeepUnu").checked;
    const hit = ME.inv.filter(it => (over ? value(it) > amt : value(it) < amt) && !(keepUnu && it.fx));
    sel.clear(); hit.forEach(i => sel.add(i.id)); draw();
    $("#ivBulkInfo").innerHTML = hit.length ? `${hit.length} item${hit.length === 1 ? "" : "s"} ${over ? "over" : "under"} ${fmt(amt)} selected · worth ${coinVal(total(hit))}` : `No items ${over ? "over" : "under"} ${fmt(amt)}`;
  };
  $("#ivSell").onclick = () => {
    const items = ME.inv.filter(i => sel.has(i.id)), get = r2(total(items) * sellRate()), unu = items.filter(i => i.fx).length;
    const m = modal(`<h2>Sell ${items.length} item${items.length === 1 ? "" : "s"}?</h2><p class="muted">You'll get ${coinVal(get)}${isVip() ? " (VIP: full value)" : " (95% of value)"}. This can't be undone.</p>
      ${unu ? `<p style="color:var(--unu2)">Includes ${unu} unusual${unu === 1 ? "" : "s"}.</p>` : ""}
      <div class="mini-items" style="flex-wrap:wrap;margin:12px 0">${minis(items.sort((a, b) => value(b) - value(a)), 24)}</div>
      <div style="display:flex;gap:10px;justify-content:flex-end"><button class="btn" data-close>Cancel</button><button class="btn btn-gold" id="ivSellOk">Sell for ${fmt(get)}</button></div>`);
    $("#ivSellOk", m).onclick = async () => {
      $("#ivSellOk").disabled = true;
      try { await rpc("sell_items", { p_ids: [...sel] }); closeModal(); await refreshMe(); bumpBalance(); toast(`Sold ${items.length} items for ${fmt(get)}`, "good"); viewInventory(); } catch (x) { fail(x); $("#ivSellOk").disabled = false; }
    };
  };
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

// ---------------------------------------------------------------- case battles
const MODES = [{ k: "1v1", t: 2, s: 1 }, { k: "1v1v1", t: 3, s: 1 }, { k: "2v2", t: 2, s: 2 }, { k: "3v3", t: 2, s: 3 }, { k: "3v3v3", t: 3, s: 3 }];
const modeName = b => MODES.find(m => m.t === b.teams && m.s === b.team_size)?.k || `${b.teams}x${b.team_size}`;
const caseById = id => CASES.find(c => c.id === id);
const battleLive = b => b.status === "done" && Date.now() < new Date(b.finished_at).getTime() + b.cases.length * 3200 + 2000;
let BATTLES = [];
async function loadBattles() {
  if (!sb) return;
  const [{ data: open }, { data: done }] = await Promise.all([
    sb.from("battles").select("*").eq("status", "open").order("cost", { ascending: false }).limit(40),
    sb.from("battles").select("*").eq("status", "done").order("finished_at", { ascending: false }).limit(10)]);
  const list = [...(open || []), ...(done || [])];
  const { data: pl } = list.length ? await sb.from("battle_players").select("*").in("battle_id", list.map(b => b.id)) : { data: [] };
  for (const b of list) b.players = (pl || []).filter(x => x.battle_id === b.id);
  BATTLES = list; drawBattles();
}
const seatHtml = (b, slot, joinable) => {
  const pl = b.players.find(x => x.slot === slot);
  if (pl) return `<div class="seat" title="${esc(pl.username)}">${pl.is_bot ? `<div class="pfp bot">🤖</div>` : pfp(pl.username)}</div>`;
  return joinable ? `<button class="seat seat-open" data-bjoin="${b.id}" data-slot="${slot}" title="Join this seat">+</button>` : `<div class="seat seat-empty"></div>`;
};
const teamsHtml = (b, joinable) => Array.from({ length: b.teams }, (_, t) => `<div class="seat-team">${Array.from({ length: b.team_size }, (_, i) => seatHtml(b, t * b.team_size + i, joinable)).join("")}</div>`).join(`<span class="vs-tag">VS</span>`);
const caseStrip = (ids, n = 8) => ids.slice(0, n).map(id => { const c = caseById(id); return c ? `<img class="bcase" src="${c.img.startsWith("http") ? sized(c.img, 96) : c.img}" title="${esc(c.name)}" referrerpolicy="no-referrer">` : ""; }).join("") + (ids.length > n ? `<span class="muted">+${ids.length - n}</span>` : "");
setInterval(() => { if (route()[0] === "battles" && BATTLES.some(battleLive)) drawBattles(); }, 2000);
function viewBattles() {
  $("#view").innerHTML = `<div class="page-head"><div><h1>Case Battles</h1><p>Everyone opens the same cases. <b>Normal</b>: highest total wins. <b>Crazy</b>: lowest total wins. The winning team takes every item.</p></div><button class="btn btn-gold" id="bCreate">Create battle</button></div>
    <div class="cf-list" id="bList"><div class="empty">Loading…</div></div><div class="section-title" style="margin-top:22px">Recent battles</div><div class="cf-list" id="bDone"></div>`;
  $("#bCreate").onclick = createBattle; loadBattles();
}
function drawBattles() {
  const el = $("#bList"); if (!el) return;
  const row = (b, open) => `<div class="panel b-row" data-bopen="${b.id}">
      <div class="b-mode"><b>${modeName(b)}</b>${b.crazy ? `<span class="chip crazy">CRAZY</span>` : `<span class="chip">Normal</span>`}<div class="muted" style="font-size:12px">${b.cases.length} case${b.cases.length === 1 ? "" : "s"}</div></div>
      <div class="b-cases">${caseStrip(b.cases)}</div>
      <div class="b-seats">${teamsHtml(b, open && ME.user && !b.players.some(x => x.user_id === ME.user.id))}</div>
      <div class="b-cost">${battleLive(b) ? `<span class="btn btn-gold"><span class="live-dot"></span>LIVE · Watch</span>` : `${coinVal(b.cost)}<div class="muted" style="font-size:11px">${open ? "per seat" : "pot " + fmt((b.results || []).reduce((s, r) => s + +r.v, 0))}</div>`}</div></div>`;
  el.innerHTML = BATTLES.filter(b => b.status === "open" || battleLive(b)).map(b => row(b, b.status === "open")).join("") || `<div class="empty">No open battles. Create one!</div>`;
  $("#bDone").innerHTML = BATTLES.filter(b => b.status === "done" && !battleLive(b)).map(b => row(b, false)).join("") || `<div class="muted">No battles yet.</div>`;
  const click = async e => {
    const j = e.target.closest("[data-bjoin]");
    if (j) { e.stopPropagation(); return joinBattle(+j.dataset.bjoin, +j.dataset.slot); }
    const r = e.target.closest("[data-bopen]"); if (r) go("battle/" + r.dataset.bopen);
  };
  el.onclick = click; $("#bDone").onclick = click;
}
async function joinBattle(id, slot) {
  if (needLogin()) return;
  const b = BATTLES.find(x => x.id === id) || CUR_BATTLE;
  if (b && !confirm(`Join this ${modeName(b)} battle for ${fmt(b.cost)} coins?`)) return;
  try { const r = await rpc("battle_join", { p_id: id, p_slot: slot }); await refreshMe(); bumpBalance(); SFX.click(); if (route()[0] !== "battle") go("battle/" + id); else viewBattle(id); } catch (e) { fail(e); }
}
function createBattle() {
  if (needLogin()) return;
  const st = { mode: MODES[0], crazy: false, cases: [] };
  const m = modal(`<h2>Create a case battle</h2>
    <div class="section-title">Mode</div><div class="tabs" id="bcMode" style="display:inline-flex">${MODES.map((x, i) => `<button data-i="${i}" class="${i ? "" : "on"}">${x.k}</button>`).join("")}</div>
    <div class="tabs" id="bcType" style="display:inline-flex;margin-left:8px"><button data-c="0" class="on">Normal</button><button data-c="1">Crazy</button></div>
    <div class="muted" id="bcHint" style="margin:8px 0 12px">Highest total value wins.</div>
    <div class="section-title">Cases (up to 10, click to add)</div><div class="b-picked" id="bcPicked"></div>
    <input id="bcQ" placeholder="Search cases…" style="width:100%;margin:8px 0">
    <div class="b-pick" id="bcPick"></div>
    <div class="sel-bar"><span class="grow" id="bcInfo"></span><button class="btn" data-close>Cancel</button><button class="btn btn-gold" id="bcGo" disabled>Create</button></div>`);
  const draw = () => {
    const cost = r2(st.cases.reduce((s, id) => s + caseById(id).price, 0));
    $("#bcPicked").innerHTML = st.cases.map((id, i) => { const c = caseById(id); return `<button class="b-chip" data-rm="${i}" title="Remove">${caseStrip([id])}<span>${esc(c.name)}</span>✕</button>`; }).join("") || `<span class="muted">No cases yet</span>`;
    $("#bcInfo").innerHTML = `${st.mode.k}${st.crazy ? " Crazy" : ""} · ${st.cases.length} case${st.cases.length === 1 ? "" : "s"} · ${coinVal(cost)} per seat`;
    $("#bcGo").disabled = !st.cases.length;
  };
  const drawPick = () => { const q = $("#bcQ").value.toLowerCase();
    $("#bcPick").innerHTML = CASES.filter(c => c.name.toLowerCase().includes(q)).map(c => `<button class="b-opt" data-add="${c.id}">${caseStrip([c.id])}<span>${esc(c.name)}</span>${coinVal(c.price)}</button>`).join(""); };
  m.onclick = e => {
    const md = e.target.closest("#bcMode [data-i]"), ty = e.target.closest("#bcType [data-c]"), ad = e.target.closest("[data-add]"), rm = e.target.closest("[data-rm]");
    if (md) { st.mode = MODES[+md.dataset.i]; $$("#bcMode button").forEach(b => b.classList.toggle("on", b === md)); }
    if (ty) { st.crazy = ty.dataset.c === "1"; $$("#bcType button").forEach(b => b.classList.toggle("on", b === ty)); $("#bcHint").textContent = st.crazy ? "Crazy: the LOWEST total value wins." : "Highest total value wins."; }
    if (ad && st.cases.length < 10) { st.cases.push(ad.dataset.add); SFX.click(); }
    if (rm) st.cases.splice(+rm.dataset.rm, 1);
    draw();
  };
  $("#bcQ").oninput = drawPick;
  $("#bcGo").onclick = async () => {
    try { const id = await rpc("battle_create", { p_cases: st.cases, p_teams: st.mode.t, p_size: st.mode.s, p_crazy: st.crazy }); closeModal(); await refreshMe(); bumpBalance(); go("battle/" + id); } catch (e) { fail(e); }
  };
  draw(); drawPick();
}
let CUR_BATTLE = null; const animatedBattles = new Set(); let BATTLE_ANIM = null;
let BV_TOKEN = 0;
async function viewBattle(id) {
  id = +id;
  if (BATTLE_ANIM === id && $("#bRounds")) return;
  const tok = ++BV_TOKEN;
  const [{ data: b }, { data: pl }] = await Promise.all([sb.from("battles").select("*").eq("id", id).maybeSingle(), sb.from("battle_players").select("*").eq("battle_id", id)]);
  if (tok !== BV_TOKEN || (BATTLE_ANIM === id && $("#bRounds"))) return;    // a newer draw (or a running animation) wins
  if (!b) { $("#view").innerHTML = `<div class="empty">Battle not found. <a href="#/battles">Back to battles</a></div>`; return; }
  b.players = pl || []; CUR_BATTLE = b;
  const seats = b.teams * b.team_size, me = ME.user && b.players.find(x => x.user_id === ME.user.id), creator = ME.user && b.creator === ME.user.id;
  const col = slot => { const p = b.players.find(x => x.slot === slot);
    return `<div class="b-col ${p ? "" : "b-empty"}" data-slot="${slot}"><div class="b-head">${p ? (p.is_bot ? `<div class="pfp bot">🤖</div><b>House Bot</b>` : `${pfp(p.username)}<b>${userLink(p.username)}</b>`) : `<div class="pfp wait-pfp">?</div><span class="muted">Empty seat</span>`}</div>
      ${!p && b.status === "open" && ME.user && !me ? `<button class="btn btn-gold b-joinbig" data-bjoin="${b.id}" data-slot="${slot}">Join for ${coinVal(b.cost)}</button>` : ""}
      <div class="vreel-wrap"><div class="vreel"></div></div><div class="b-total">${coinVal(0)}</div><div class="b-items"></div></div>`; };
  $("#view").innerHTML = `<div class="page-head"><div><a href="#/battles" class="muted">← All battles</a><h1>${modeName(b)} ${b.crazy ? `<span class="chip crazy">CRAZY</span>` : ""} battle #${b.id}</h1>
      <p>${b.crazy ? "Lowest" : "Highest"} total wins · ${coinVal(b.cost)} per seat · ${b.cases.length} cases</p></div>
      <div style="display:flex;gap:8px">${b.status === "open" && creator ? `<button class="btn btn-gold" id="bBots">Fill with bots & start</button><button class="btn" id="bCancel">Cancel</button>` : ""}${b.status === "done" ? `<button class="btn" id="bReplay">Replay</button>` : ""}</div></div>
    <div class="b-rounds" id="bRounds">${b.cases.map((cid, i) => `<div class="b-round" data-r="${i + 1}">${caseStrip([cid])}</div>`).join("")}</div>
    <div class="b-board">${Array.from({ length: b.teams }, (_, t) => `<div class="b-team" data-team="${t}">${Array.from({ length: b.team_size }, (_, i) => col(t * b.team_size + i)).join("")}</div>`).join(`<div class="vs-tag big">VS</div>`)}</div>
    <div id="bStatus" class="muted" style="text-align:center;margin-top:14px">${b.status === "open" ? `Waiting for players (${b.players.length}/${seats})…` : b.status === "cancelled" ? "This battle was cancelled." : ""}</div>`;
  $("#view").onclick = e => { const j = e.target.closest("[data-bjoin]"); if (j) joinBattle(+j.dataset.bjoin, +j.dataset.slot); };
  $("#bBots") && ($("#bBots").onclick = async () => { try { await rpc("battle_fill_bots", { p_id: b.id }); viewBattle(b.id); } catch (e) { fail(e); } });
  $("#bCancel") && ($("#bCancel").onclick = async () => { try { await rpc("battle_cancel", { p_id: b.id }); await refreshMe(); toast("Battle cancelled, coins refunded."); go("battles"); } catch (e) { fail(e); } });
  $("#bReplay") && ($("#bReplay").onclick = () => runBattle(b, true));
  if (b.status === "done") {
    const fresh = battleLive(b) || Date.now() - new Date(b.finished_at).getTime() < 90000;
    if (!animatedBattles.has(b.id) && fresh) runBattle(b); else showBattleFinal(b);
  }
}
const vcard = it => { const v = value(it); return `<div class="vcard ${it.fx ? "unusual" : ""}" style="--rc:${rarity(v, it.fx)}">${thumb(it)}<div class="vc-v">${coinVal(v)}</div></div>`; };
async function runBattle(b, replay = false) {
  if (BATTLE_ANIM === b.id) return;
  animatedBattles.add(b.id); BATTLE_ANIM = b.id;
  try { await runBattleInner(b); } finally { BATTLE_ANIM = null; }
}
async function runBattleInner(b) {
  const res = (b.results || []).map(r => ({ ...r, it: { n: r.n, fx: r.fx || null } })).filter(r => ITEM[r.n]);
  const tots = {}; $$(".b-items").forEach(x => x.innerHTML = ""); $$(".b-total").forEach(x => x.innerHTML = coinVal(0));
  $$(".b-team").forEach(t => t.classList.remove("b-win", "b-lose"));
  $$(".b-teamtot").forEach(x => x.remove());
  for (let r = 1; r <= b.cases.length; r++) {
    if (!$("#bRounds")) return;
    $$(".b-round").forEach(x => x.classList.toggle("on", +x.dataset.r === r));
    $("#bStatus").textContent = `Round ${r} of ${b.cases.length}`;
    const c = caseById(b.cases[r - 1]), rows = res.filter(x => x.round === r);
    SFX.whoosh();
    await Promise.all(rows.map(async row => {
      const colEl = $(`.b-col[data-slot="${row.slot}"]`); if (!colEl) return;
      const reel = colEl.querySelector(".vreel"), H = 190, N = 30, WIN = 25;
      reel.innerHTML = Array.from({ length: N }, (_, i) => i === WIN ? (row.it.fx ? `<div class="vcard mystery">★</div>` : vcard(row.it)) : (e => e.unusual ? `<div class="vcard mystery">★</div>` : vcard({ n: e.n }))(rollEntry(c))).join("");
      reel.style.transition = "none"; reel.style.transform = "translateY(0)"; void reel.offsetWidth;
      reel.style.transition = "transform 2600ms cubic-bezier(.1,.75,.15,1)";
      reel.style.transform = `translateY(${-(WIN * H) + (reel.parentElement.clientHeight - H) / 2 + rand(-40, 40)}px)`;
      if (row.slot === 0) reelTicks(reel, H, 2600, "y");
      await sleep(2700);
      if (row.it.fx) { reel.children[WIN].outerHTML = vcard(row.it); colEl.classList.add("unu-hit"); SFX.rare(); await sleep(500); colEl.classList.remove("unu-hit"); }
      tots[row.slot] = (tots[row.slot] || 0) + value(row.it);
      colEl.querySelector(".b-total").innerHTML = coinVal(tots[row.slot]);
      colEl.querySelector(".b-items").insertAdjacentHTML("afterbegin", mini(row.it));
    }));
    SFX.win(); await sleep(450);
  }
  showBattleFinal(b, true);
}
function showBattleFinal(b, animated = false) {
  if (!$("#bRounds")) return;
  const res = (b.results || []).filter(r => ITEM[r.n]), tots = {};
  if (!animated) {
    $$(".b-items").forEach(x => x.innerHTML = "");
    for (const r of res) { tots[r.slot] = (tots[r.slot] || 0) + +r.v; const colEl = $(`.b-col[data-slot="${r.slot}"]`); colEl?.querySelector(".b-items").insertAdjacentHTML("afterbegin", mini({ n: r.n, fx: r.fx })); }
    $$(".b-col").forEach(c => c.querySelector(".b-total").innerHTML = coinVal(tots[c.dataset.slot] || 0));
    $$(".vreel").forEach(v => v.innerHTML = "");
  }
  $$(".b-round").forEach(x => x.classList.remove("on"));
  const teamTot = (b.totals || []).map(Number), pot = res.reduce((s, r) => s + +r.v, 0);
  $$(".b-team").forEach(t => t.classList.add(+t.dataset.team === b.winner_team ? "b-win" : "b-lose"));
  $$(".b-team").forEach(t => t.insertAdjacentHTML("beforeend", `<div class="b-teamtot">${coinVal(teamTot[+t.dataset.team] || 0)}</div>`));
  // each winning seat's equal share of the pot (bots' shares stay with the House)
  for (const [slot, v] of Object.entries(b.payout || {})) {
    const col = $(`.b-col[data-slot="${slot}"]`), bot = b.players.find(p => p.slot === +slot)?.is_bot;
    col?.querySelector(".b-total").insertAdjacentHTML("beforeend", `<div class="b-share ${bot ? "house" : ""}">${bot ? "House keeps" : "Gets"} ${coinVal(v)}</div>`);
  }
  const winners = b.players.filter(p => Math.floor(p.slot / b.team_size) === b.winner_team).map(p => p.is_bot ? "House Bot" : p.username);
  $("#bStatus").innerHTML = `<h2 style="margin:6px 0">${winners.map(esc).join(" & ")} win${winners.length === 1 ? "s" : ""} ${coinVal(pot)}!</h2>${winners.length > 1 ? `Split ${winners.length} ways, about ${coinVal(pot / winners.length)} each. ` : ""}${b.crazy ? "Crazy mode: the lowest total took it." : ""}`;
  if (animated) {
    const iWon = ME.user && b.players.some(p => p.user_id === ME.user.id && Math.floor(p.slot / b.team_size) === b.winner_team);
    const mine = b.players.find(p => ME.user && p.user_id === ME.user.id), share = iWon ? +(b.payout?.[mine.slot] ?? pot / b.team_size) : 0;
    confetti($(".b-team.b-win") || $("#bStatus"), 80);
    if (iWon && share >= BIG_WIN) bigWin(share, "Case battle #" + b.id); else if (iWon) SFX.good(); else SFX.win();
    refreshMe();
  }
}

// ---------------------------------------------------------------- russian roulette
let RR = [], CUR_RR = null; const animatedRR = new Set(); let RR_ANIM = null;
const rrLive = g => g.status === "done" && Date.now() < new Date(g.finished_at).getTime() + (2 + (g.rounds || []).reduce((s, r) => s + 3.4 + r.pulls.length * 3, 0)) * 1000;
async function loadRoulette() {
  if (!sb) return;
  const [{ data: open }, { data: done }] = await Promise.all([
    sb.from("roulette_games").select("*").eq("status", "open").order("stake", { ascending: false }).limit(30),
    sb.from("roulette_games").select("*").eq("status", "done").order("finished_at", { ascending: false }).limit(8)]);
  const list = [...(open || []), ...(done || [])];
  const { data: pl } = list.length ? await sb.from("roulette_players").select("*").in("game_id", list.map(g => g.id)) : { data: [] };
  for (const g of list) g.players = (pl || []).filter(x => x.game_id === g.id);
  RR = list; drawRoulette();
}
setInterval(() => { if (route()[0] === "roulette" && !route()[1] && RR.some(rrLive)) drawRoulette(); }, 2000);
function viewRoulette() {
  $("#view").innerHTML = `<div class="page-head"><div><h1>Russian Roulette</h1><p>6 seats. Everyone buys in with items within 10% of the first player's. Each round the chamber knocks one player out. The last one standing takes the whole pile.</p></div><button class="btn btn-red" id="rrCreate">Open a table</button></div>
    <div class="cf-list" id="rrList"><div class="empty">Loading…</div></div><div class="section-title" style="margin-top:22px">Recent games</div><div class="cf-list" id="rrDone"></div>`;
  $("#rrCreate").onclick = async () => {
    if (needLogin()) return;
    const items = await pickItems({ title: "Open a Russian Roulette table", min: .5, confirm: "Open table", hint: "Your buy-in. Others must match it within 10%." });
    if (items) try { const id = await rpc("rr_create", { p_ids: items.map(i => i.id) }); await refreshMe(); go("roulette/" + id); } catch (e) { fail(e); }
  };
  loadRoulette();
}
const rrSeats = g => Array.from({ length: g.seats }, (_, s) => { const p = g.players.find(x => x.slot === s); return p ? `<div class="seat">${p.is_bot ? `<div class="pfp bot">🤖</div>` : pfp(p.username)}</div>` : `<div class="seat seat-empty"></div>`; }).join("");
function drawRoulette() {
  const el = $("#rrList"); if (!el) return;
  const row = (g, open) => `<div class="panel b-row rr-row" data-rr="${g.id}">
      <div class="b-mode"><b>#${g.id}</b><div class="muted" style="font-size:12px">by ${esc(g.creator_name)}</div></div>
      <div class="b-seats">${rrSeats(g)}<span class="muted" style="margin-left:6px">${g.players.length}/${g.seats}</span></div>
      <div>${open ? `Buy-in ${coinVal(g.stake)}<div class="muted" style="font-size:11px">${fmt(g.stake * .9)} – ${fmt(g.stake * 1.1)}</div>` : rrLive(g) ? `Pot ${coinVal(g.pot)}` : `${esc(g.winner_name === "House Bot" ? "Bot " + (g.winner_slot + 1) : g.winner_name)} won ${coinVal(g.pot)}`}</div>
      <div>${rrLive(g) ? `<button class="btn btn-gold"><span class="live-dot"></span>LIVE · Watch</button>` : `<button class="btn ${open ? "btn-red" : ""}">${open ? "Sit down" : "Replay"}</button>`}</div></div>`;
  el.innerHTML = RR.filter(g => g.status === "open" || rrLive(g)).map(g => row(g, g.status === "open")).join("") || `<div class="empty">No open tables. Open one!</div>`;
  $("#rrDone").innerHTML = RR.filter(g => g.status === "done" && !rrLive(g)).map(g => row(g, false)).join("") || `<div class="muted">No games yet.</div>`;
  el.onclick = $("#rrDone").onclick = e => { const r = e.target.closest("[data-rr]"); if (r) go("roulette/" + r.dataset.rr); };
}
const REVOLVER_SVG = `<svg viewBox="0 0 120 60" class="revolver-svg"><defs><linearGradient id="gm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfd5df"/><stop offset="1" stop-color="#6b7280"/></linearGradient></defs>
  <rect x="44" y="12" width="72" height="9" rx="3" fill="url(#gm)"/><rect x="110" y="9" width="5" height="5" rx="1" fill="#9ca3af"/>
  <rect x="40" y="10" width="26" height="22" rx="6" fill="#4b5563"/><circle cx="53" cy="21" r="10" fill="url(#gm)"/><circle cx="53" cy="21" r="3" fill="#374151"/>
  <path d="M40 18 L28 16 L18 22 L10 52 Q9 58 16 58 L30 58 Q35 58 35 53 L38 34 L46 32 Z" fill="#7c4a24"/><path d="M14 50 L30 50" stroke="#5a3418" stroke-width="2"/>
  <path d="M44 32 Q46 42 56 41 L56 37 Q49 38 49 32 Z" fill="none" stroke="#9ca3af" stroke-width="2.5"/><path d="M50 32 L52 38" stroke="#d1d5db" stroke-width="2"/></svg>`;
const seatAngle = s => -90 + s * 60;     // seat 0 at the top, clockwise
let RV_TOKEN = 0;
async function viewRouletteGame(id) {
  id = +id;
  if (RR_ANIM === id && $("#rvTable")) return;          // never redraw a table mid-animation (it would show the result)
  const tok = ++RV_TOKEN;
  const [{ data: g }, { data: pl }] = await Promise.all([sb.from("roulette_games").select("*").eq("id", id).maybeSingle(), sb.from("roulette_players").select("*").eq("game_id", id)]);
  if (tok !== RV_TOKEN || (RR_ANIM === id && $("#rvTable"))) return;
  if (!g) { $("#view").innerHTML = `<div class="empty">Table not found. <a href="#/roulette">Back</a></div>`; return; }
  g.players = pl || []; CUR_RR = g;
  const me = ME.user && g.players.find(x => x.user_id === ME.user.id), creator = ME.user && g.creator === ME.user.id;
  const pot = g.players.reduce((s, x) => s + +x.value, 0);
  const seat = s => { const p = g.players.find(x => x.slot === s), a = seatAngle(s) * Math.PI / 180;
    return `<div class="rv-seat" data-slot="${s}" style="left:${50 + 41 * Math.cos(a)}%;top:${50 + 41 * Math.sin(a)}%"><div class="rr-badge"></div><div class="rv-bubble"></div>
      ${p ? `${p.is_bot ? `<div class="pfp bot">🤖</div>` : pfp(p.username)}<b>${esc(rrName(g, s))}</b><div class="rr-val">${coinVal(p.value)}</div>`
        : g.status === "open" && ME.user && !me ? `<div class="pfp wait-pfp">+</div><button class="btn btn-red" data-rrjoin="1" style="padding:6px 10px">Sit down</button>` : `<div class="pfp wait-pfp">?</div><span class="muted">Empty</span>`}</div>`; };
  $("#view").innerHTML = `<div class="page-head"><div><a href="#/roulette" class="muted">← All tables</a><h1>Russian Roulette #${g.id}</h1><p>Buy-in ${coinVal(g.stake)} (±10%) · ${g.players.length}/${g.seats} seated · pot ${coinVal(g.status === "done" ? g.pot : pot)}</p></div>
      <div style="display:flex;gap:8px">${g.status === "open" && creator ? `<button class="btn btn-red" id="rrBots">Fill with bots & start</button><button class="btn" id="rrCancel">Cancel</button>` : ""}${g.status === "done" ? `<button class="btn" id="rrReplay">Replay</button><button class="btn" id="rrSkip" hidden>Skip to result</button>` : ""}</div></div>
    <div class="rv-table" id="rvTable">
      <div class="rv-felt"></div>
      ${Array.from({ length: g.seats }, (_, s) => seat(s)).join("")}
      <div class="rv-center"><div class="rv-cyl" id="rvCyl">${Array.from({ length: 6 }, (_, i) => `<i data-c="${i}" style="--i:${i}"></i>`).join("")}</div>
        <div class="rr-banner" id="rrBanner">${g.status === "open" ? "Waiting for players…" : g.status === "cancelled" ? "Table closed" : ""}</div><div class="rr-sub muted" id="rrSub">${g.status === "open" ? `${g.seats - g.players.length} seat${g.seats - g.players.length === 1 ? "" : "s"} left` : ""}</div></div>
      <div class="rv-gun" id="rvGun">${REVOLVER_SVG}</div>
      <div class="rv-hand" id="rvHand">🧤</div>
    </div>
    <div class="muted" style="text-align:center;margin-top:8px">One bullet, six chambers. The gun goes around the table until it fires. Then it's reloaded, spun, and goes around again until one player is left.</div>`;
  $("#view").onclick = async e => {
    if (!e.target.closest("[data-rrjoin]")) return;
    if (needLogin()) return;
    const items = await pickItems({ title: `Sit down at table #${g.id}`, min: g.stake * .9, max: g.stake * 1.1, confirm: "Buy in", hint: `Buy in with items worth ${fmt(g.stake * .9)} – ${fmt(g.stake * 1.1)}.` });
    if (items) try { await rpc("rr_join", { p_id: g.id, p_ids: items.map(i => i.id) }); await refreshMe(); SFX.join(); viewRouletteGame(g.id); } catch (x) { fail(x); }
  };
  $("#rrBots") && ($("#rrBots").onclick = async () => { try { await rpc("rr_fill_bots", { p_id: g.id }); viewRouletteGame(g.id); } catch (e) { fail(e); } });
  $("#rrCancel") && ($("#rrCancel").onclick = async () => { try { await rpc("rr_cancel", { p_id: g.id }); await refreshMe(); toast("Table closed, items returned."); go("roulette"); } catch (e) { fail(e); } });
  $("#rrReplay") && ($("#rrReplay").onclick = () => runRoulette(g));
  gunTo(null, 0);
  if (g.status === "done") { if (!animatedRR.has(g.id) && (rrLive(g) || Date.now() - new Date(g.finished_at).getTime() < 120000)) runRoulette(g); else rrFinal(g); }
}
const rrName = (g, s) => { const p = g.players.find(x => x.slot === s); return p ? (p.is_bot ? `Bot ${s + 1}` : p.username) : "?"; };   // bots get seat numbers so you can tell them apart
// slide the revolver to a seat (barrel pointing at that player), or back to the middle of the table
function gunTo(slot, ms = 650) {
  const gun = $("#rvGun"); if (!gun) return;
  gun.style.transition = ms ? `transform ${ms}ms cubic-bezier(.3,.8,.3,1)` : "none";
  if (slot === null) { gun.style.transform = "translate(-50%,-50%) translate(0,110px) rotate(-20deg) scale(.9)"; return; }
  const a = seatAngle(slot), r = $("#rvTable").clientWidth * .25, rad = a * Math.PI / 180;
  gun.style.transform = `translate(-50%,-50%) translate(${Math.cos(rad) * r}px,${Math.sin(rad) * r}px) rotate(${a}deg) ${a > 90 && a < 270 ? "scaleY(-1)" : ""}`;
}
const bubble = (slot, text, cls = "") => { const b = $(`.rv-seat[data-slot="${slot}"] .rv-bubble`); if (!b) return; b.className = "rv-bubble show " + cls; b.textContent = text; setTimeout(() => b.classList.remove("show"), 900); };
let rrSkip = false;
async function runRoulette(g) {
  if (RR_ANIM === g.id) return;
  animatedRR.add(g.id); RR_ANIM = g.id;
  try { await runRouletteInner(g); } finally { RR_ANIM = null; }
}
async function runRouletteInner(g) {
  rrSkip = false;
  if ($("#rrSkip")) { $("#rrSkip").hidden = false; $("#rrSkip").onclick = () => { rrSkip = true; }; }
  const rounds = g.rounds?.length ? g.rounds : (g.eliminated || []).map(o => ({ bullet: 1, pulls: [o], out: o }));   // older games had no trigger log
  const banner = (t, pop) => { const b = $("#rrBanner"); if (!b) return; b.innerHTML = t; if (pop) { b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop"); } };
  const sub = t => $("#rrSub") && ($("#rrSub").innerHTML = t);
  const wait = ms => rrSkip ? Promise.resolve() : sleep(ms);
  $$(".rv-seat").forEach(s => { s.classList.remove("out", "winner", "aim"); s.querySelector(".rr-badge").textContent = ""; });
  const out = [];
  for (let r = 0; r < rounds.length; r++) {
    if (!$("#rvTable") || rrSkip) break;
    const rd = rounds[r], alive = g.seats - out.length;
    banner(`ROUND ${r + 1}<small>${alive} players left</small>`, true);
    // a mystery hand loads one bullet, then the cylinder is spun
    gunTo(null); sub("A mystery hand loads one bullet…");
    const cyl = $("#rvCyl"); cyl.querySelectorAll("i").forEach(c => c.classList.remove("loaded", "fired"));
    $("#rvHand").classList.remove("load"); void $("#rvHand").offsetWidth; $("#rvHand").classList.add("load");
    await wait(700); cyl.querySelector("i").classList.add("loaded"); SFX.click2(); await wait(600);
    sub("Spinning the cylinder…"); SFX.spinCyl(); setTimeout(() => !rrSkip && SFX.spinCyl(), 450);
    cyl.querySelectorAll("i").forEach(c => c.classList.remove("loaded"));
    const spinTo = 1080 + rand(0, 360);
    cyl.animate([{ transform: "rotate(0)" }, { transform: `rotate(${spinTo}deg)` }], { duration: rrSkip ? 1 : 1500, easing: "cubic-bezier(.15,.7,.2,1)", fill: "forwards" });
    await wait(1600);
    // the gun goes around the table, one trigger pull per player, until the loaded chamber comes up
    for (let k = 0; k < rd.pulls.length; k++) {
      if (!$("#rvTable") || rrSkip) break;
      const s = rd.pulls[k], last = k === rd.pulls.length - 1;
      $$(".rv-seat").forEach(x => x.classList.toggle("aim", +x.dataset.slot === s));
      gunTo(s); SFX.whoosh(); sub(`<b>${esc(rrName(g, s))}</b> picks up the gun…`); await wait(750);
      SFX.heartbeat(); await wait(550); SFX.heartbeat(); await wait(450);
      cyl.querySelectorAll("i")[k % 6]?.classList.add("fired");
      if (!last) { SFX.click2(); bubble(s, "click", "safe"); sub(`<b>${esc(rrName(g, s))}</b>: *click*… safe.`); await wait(800); continue; }
      SFX.bang(); bubble(s, "BANG!", "bang"); document.body.classList.add("shake"); setTimeout(() => document.body.classList.remove("shake"), 450);
      $("#rvTable").classList.add("flash"); setTimeout(() => $("#rvTable")?.classList.remove("flash"), 450);
      const seat = $(`.rv-seat[data-slot="${s}"]`); if (seat) { seat.classList.remove("aim"); seat.classList.add("out"); seat.querySelector(".rr-badge").textContent = `OUT · R${r + 1}`; }
      out.push(s); sub(`💥 <b>${esc(rrName(g, s))}</b> is out!`); await wait(1500);
    }
  }
  if ($("#rrSkip")) $("#rrSkip").hidden = true;
  rrFinal(g, true);
}
function rrFinal(g, animated = false) {
  if (!$("#rrBanner")) return;
  $$(".rv-seat").forEach(s => s.classList.remove("aim"));
  (g.eliminated || []).forEach((s, i) => { const seat = $(`.rv-seat[data-slot="${s}"]`); if (seat) { seat.classList.add("out"); seat.querySelector(".rr-badge").textContent = `OUT · R${i + 1}`; } });
  const ws = $(`.rv-seat[data-slot="${g.winner_slot}"]`); if (ws) { ws.classList.remove("out"); ws.classList.add("winner"); ws.querySelector(".rr-badge").textContent = "SURVIVOR"; }
  gunTo(null, animated ? 600 : 0);
  $("#rrBanner").innerHTML = `🏆 ${esc(rrName(g, g.winner_slot))} survives!<small>takes ${fmt(g.pot)} coins in items</small>`;
  $("#rrSub").innerHTML = "";
  if (animated) {
    const winP = g.players.find(x => x.slot === g.winner_slot), iWon = ME.user && winP?.user_id === ME.user.id;
    confetti(ws || $("#rrBanner"), 100);
    if (iWon && +g.pot >= BIG_WIN) bigWin(+g.pot, "Russian Roulette #" + g.id); else { SFX.survive(); if (iWon) SFX.cash(); }
    refreshMe();
  }
}

// ---------------------------------------------------------------- value list: every item and every possible unusual
let ALL_VALUES = null;
function allValues() {
  if (ALL_VALUES) return ALL_VALUES;
  const out = ITEMS.map(i => ({ n: i.name, fx: null }));
  for (const h of UNU_HATS) for (const e of allowedFx(h)) out.push({ n: h.name, fx: e.name });
  for (const it of out) it.v = value(it);
  return ALL_VALUES = out.sort((a, b) => b.v - a.v);
}
function viewValues() {
  const all = allValues();
  $("#view").innerHTML = `<div class="page-head"><div><h1>Value List</h1><p>Every item on TCBET and every unusual that can actually exist (${all.length.toLocaleString()} total), from most to least expensive.</p></div></div>
    <div class="toolbar"><input id="vlQ" placeholder="Search items or effects…" autocomplete="off">
      <div class="tabs" id="vlTab"><button data-t="all" class="on">All</button><button data-t="unu">Unusuals</button><button data-t="items">Items</button><button data-t="weap">Weapons</button></div></div>
    <div class="vl-head"><span>#</span><span></span><span>Item</span><span>Type</span><span style="text-align:right">Value</span></div>
    <div id="vlList" class="vl-list"></div><div style="text-align:center;margin-top:14px"><button class="btn" id="vlMore">Show more</button></div>`;
  let tab = "all", list = all, page = 0; const PAGE = 100;
  const row = (it, i) => { const b = ITEM[it.n], q = !it.fx && b.q;
    return `<div class="vl-row" style="--rc:${rarity(it.v, it.fx)}"><span class="vl-rank">${i + 1}</span><span class="vl-img">${thumb(it)}</span>
      <span class="vl-name ${it.fx ? "unu" : ""}" ${q ? `style="color:${QCOLOR[q]}"` : ""}>${esc(label(it))}</span>
      <span class="muted vl-type">${it.fx ? FX[it.fx].series + " · " + esc(b.worn) : (q ? q + " · " : "") + esc(b.worn)}</span><span class="vl-v">${coinVal(it.v)}</span></div>`; };
  const more = () => { const s = list.slice(page * PAGE, ++page * PAGE); $("#vlList").insertAdjacentHTML("beforeend", s.map((it, k) => row(it, all.indexOf(it))).join("")); $("#vlMore").hidden = page * PAGE >= list.length; };
  const draw = () => {
    const q = $("#vlQ").value.toLowerCase().trim();
    list = all.filter(it => (tab === "all" || (tab === "unu" ? it.fx : tab === "weap" ? !it.fx && ITEM[it.n].weapon : !it.fx && !ITEM[it.n].weapon)) && (!q || label(it).toLowerCase().includes(q)));
    page = 0; $("#vlList").innerHTML = list.length ? "" : `<div class="empty">Nothing found.</div>`; more();
  };
  let t = 0; $("#vlQ").oninput = () => { clearTimeout(t); t = setTimeout(draw, 150); };
  $("#vlTab").onclick = e => { const b = e.target.closest("button"); if (!b) return; tab = b.dataset.t; $$("#vlTab button").forEach(x => x.classList.toggle("on", x === b)); draw(); };
  $("#vlMore").onclick = more;
  draw();
}

// ---------------------------------------------------------------- profiles
async function viewProfile(name) {
  if (!name) return go("players");
  $("#view").innerHTML = `<div class="empty">Loading ${esc(name)}…</div>`;
  const { data: p } = await sb.from("profiles").select("id,username,rank,avatar,xp,opened,best_name,best_fx,best_value,created_at,balance").ilike("username", name.replace(/[%_\\]/g, "\\$&")).maybeSingle();
  if (!p) { $("#view").innerHTML = `<div class="empty"><h2>No player named ${esc(name)}</h2><a class="btn" href="#/players">Find players</a></div>`; return; }
  rememberProfile(p);
  const { data: inv } = await sb.from("inventory").select("id,name,fx").eq("owner", p.id).eq("state", "inv").limit(2000);
  const items = (inv || []).filter(r => ITEM[r.name]).map(r => ({ id: r.id, n: r.name, fx: r.fx })).sort((a, b) => value(b) - value(a));
  const me = ME.user && ME.user.id === p.id, L = levelOf(p.xp), next = xpFor(L + 1), prev = xpFor(L);
  const av = parseAvatar(p.avatar), best = p.best_name && ITEM[p.best_name] ? { n: p.best_name, fx: p.best_fx } : null;
  $("#view").innerHTML = `<div class="panel profile-hero ${p.rank !== "player" ? "rank-" + p.rank : ""}">
      <div class="profile-av">${av?.it ? thumb(av.it, "", true) : av?.cls ? `<img src="${sized(classImg(av.cls), 240)}" alt="" referrerpolicy="no-referrer">` : `<div class="pfp-big" style="background:${pfpColor(p.username)}">${esc(p.username[0].toUpperCase())}</div>`}</div>
      <div class="profile-main"><h1>${esc(p.username)} ${vipTag(p.rank)}</h1>
        <div class="muted">Level ${L} · joined ${new Date(p.created_at).toLocaleDateString()}</div>
        <div class="xpbar" title="${fmt(p.xp)} / ${fmt(next)} xp"><div style="width:${Math.min(100, (p.xp - prev) / (next - prev) * 100)}%"></div></div>
        <div class="muted" style="font-size:12px">${fmt(p.xp - prev)} / ${fmt(next - prev)} xp to level ${L + 1}</div>
        <div class="profile-actions">${me ? `<a class="btn btn-gold" href="#/inventory">Sell items</a><button class="btn" id="pfAvatar">Change picture</button><a class="btn" href="#/rewards">Rewards</a>` : ME.user ? `<a class="btn btn-gold" href="#/trade/${encodeURIComponent(p.username)}">Trade</a><button class="btn" id="pfTip">Tip coins</button>` : ""}</div></div>
      <div class="profile-stats">
        <div class="stat"><small>Inventory value</small><b>${coinVal(total(items))}</b></div>
        <div class="stat"><small>Wagered</small><b>${coinVal(p.xp)}</b></div>
        <div class="stat"><small>Cases opened</small><b>${p.opened.toLocaleString()}</b></div>
        <div class="stat"><small>Items</small><b>${items.length.toLocaleString()}</b></div></div></div>
    ${best ? `<div class="section-title" style="margin-top:18px">Best drop</div><div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(170px,220px))">${card(best, { sub: "Best drop ever" })}</div>` : ""}
    <div class="section-title" style="margin-top:18px">Inventory</div>
    <div class="grid">${items.slice(0, 96).map(it => card(it)).join("") || `<div class="empty">No items.</div>`}</div>
    ${items.length > 96 ? `<div class="muted" style="text-align:center;margin-top:10px">+${items.length - 96} more items</div>` : ""}`;
  $("#pfAvatar") && ($("#pfAvatar").onclick = openAvatarPicker);
  $("#pfTip") && ($("#pfTip").onclick = () => openTip(p.username));
}
function openAvatarPicker() {
  const items = [...ME.inv].sort((a, b) => value(b) - value(a)).slice(0, 120);
  const m = modal(`<h2>Profile picture</h2><p class="muted">Pick a class, or show off any item you own.</p>
    <div class="section-title">Classes</div><div class="av-grid">${Object.keys(CLASS_IMG).map(c => `<button class="av-opt" data-k="class" data-v="${c}" title="${c}"><img src="${sized(classImg(c), 96)}" alt="${c}" referrerpolicy="no-referrer"></button>`).join("")}</div>
    <div class="section-title" style="margin-top:14px">Your items</div><div class="grid" id="avItems">${items.map(it => card(it, { click: 1 })).join("") || `<div class="muted">No items yet.</div>`}</div>
    <div style="display:flex;justify-content:space-between;margin-top:14px"><button class="btn" id="avNone">Use my initial</button><button class="btn" data-close>Done</button></div>`);
  const set = async (k, v) => { try { await rpc("set_avatar", { p_kind: k, p_value: v }); closeModal(); await refreshMe(); toast("Profile picture updated", "good"); if (route()[0] === "u") render(); } catch (e) { fail(e); } };
  m.onclick = e => {
    const o = e.target.closest(".av-opt"); if (o) return set(o.dataset.k, o.dataset.v);
    const c = e.target.closest("#avItems .card"); if (c) return set("item", c.dataset.id);
    if (e.target.id === "avNone") set("none", "");
  };
}
function openTip(to) {
  if (needLogin()) return;
  const m = modal(`<h2>Tip ${esc(to)}</h2><p class="muted">Send fun-coins straight to their balance. Your balance: ${coinVal(ME.profile.balance)}</p>
    <div class="tip-presets">${[10, 50, 100, 500, 1000].map(v => `<button class="btn" data-a="${v}">${v}</button>`).join("")}</div>
    <form id="tipForm" style="display:flex;gap:10px;margin-top:12px"><span class="val" style="flex:1"><i class="coin"></i><input id="tipAmt" type="number" min="1" step="0.01" placeholder="Amount" required style="width:100%"></span><button class="btn btn-gold">Send tip</button></form>`);
  m.onclick = e => { const b = e.target.closest("[data-a]"); if (b) $("#tipAmt").value = b.dataset.a; };
  $("#tipForm", m).onsubmit = async e => {
    e.preventDefault(); const amt = +$("#tipAmt").value;
    try { await rpc("tip", { p_to: to, p_amount: amt }); closeModal(); await refreshMe(); bumpBalance(); toast(`Tipped ${esc(to)} ${fmt(amt)} coins`, "good"); } catch (x) { fail(x); }
  };
  setTimeout(() => $("#tipAmt")?.focus(), 50);
}

// ---------------------------------------------------------------- players
async function viewPlayers() {
  $("#view").innerHTML = `<div class="page-head"><div><h1>Players</h1><p>Look up anyone to see their profile and inventory, trade or tip them.</p></div></div>
    <form class="toolbar" id="plFind"><input id="plQ" placeholder="Search username…" maxlength="20" autocomplete="off"><button class="btn btn-gold">View profile</button></form>
    <div id="plResults" class="pl-results"></div>
    <div class="lb-cols"><div class="panel" style="padding:16px"><div class="section-title">Top levels</div><div id="lbLevel" class="lb"></div></div>
      <div class="panel" style="padding:16px"><div class="section-title">Richest</div><div id="lbRich" class="lb"></div></div></div>`;
  $("#plFind").onsubmit = e => { e.preventDefault(); const u = $("#plQ").value.trim(); if (u) go("u/" + encodeURIComponent(u)); };
  let t = 0;
  $("#plQ").oninput = () => { clearTimeout(t); t = setTimeout(async () => {
    const q = $("#plQ").value.trim(); if (q.length < 2) return $("#plResults").innerHTML = "";
    const { data } = await sb.from("profiles").select("username,rank,avatar,xp").ilike("username", "%" + q.replace(/[%_\\]/g, "\\$&") + "%").limit(12);
    (data || []).forEach(rememberProfile);
    $("#plResults").innerHTML = (data || []).map(r => `<a class="pl-chip" href="#/u/${encodeURIComponent(r.username)}">${pfp(r.username)}<b>${esc(r.username)}</b>${vipTag(r.rank)}${lvlChip(r.xp)}</a>`).join("") || `<span class="muted">No players found.</span>`;
  }, 200); };
  const row = (r, i, v) => `<a class="lb-row" href="#/u/${encodeURIComponent(r.username)}"><span class="lb-n">${i + 1}</span>${pfp(r.username)}<b>${esc(r.username)}</b>${vipTag(r.rank)}<span class="grow"></span>${v}</a>`;
  const [{ data: lv }, { data: rich }] = await Promise.all([
    sb.from("profiles").select("username,rank,avatar,xp").order("xp", { ascending: false }).limit(20),
    sb.from("profiles").select("username,rank,avatar,xp,balance").order("balance", { ascending: false }).limit(20)]);
  [...(lv || []), ...(rich || [])].forEach(rememberProfile);
  if (!$("#lbLevel")) return;
  $("#lbLevel").innerHTML = (lv || []).map((r, i) => row(r, i, lvlChip(r.xp))).join("") || `<div class="muted">No players yet.</div>`;
  $("#lbRich").innerHTML = (rich || []).map((r, i) => row(r, i, coinVal(r.balance))).join("");
}

// ---------------------------------------------------------------- rewards: levels, rakeback, crates
function viewRewards() {
  if (!ME.user) { $("#view").innerHTML = `<div class="empty"><h2>Rewards</h2><p>Sign in to level up, earn rakeback and open reward crates.</p><button class="btn btn-gold" id="rwLogin">Sign in</button></div>`; $("#rwLogin").onclick = () => openAuth(); return; }
  const p = ME.profile, L = levelOf(p.xp), next = xpFor(L + 1), prev = xpFor(L), crates = Math.max(0, L - 1 - p.crates_claimed);
  const rate = rakeRate(L, p.rank), nextCrateLvl = p.crates_claimed + 2;
  $("#view").innerHTML = `<div class="page-head"><div><h1>Rewards</h1><p>Every coin you wager (cases, Unusualifier, flips, jackpot) is 1 XP. Levels raise your rakeback and give you free reward crates.</p></div></div>
    <div class="rw-grid">
      <div class="panel rw-card"><div class="section-title">Level</div><div class="rw-big">${L}</div>
        <div class="xpbar"><div style="width:${Math.min(100, (p.xp - prev) / (next - prev) * 100)}%"></div></div>
        <div class="muted">${fmt(p.xp - prev)} / ${fmt(next - prev)} xp to level ${L + 1}</div>
        <div class="muted" style="margin-top:8px">Total wagered ${coinVal(p.xp)}</div></div>
      <div class="panel rw-card"><div class="section-title">Rakeback</div><div class="rw-big">${coinVal(p.rakeback)}</div>
        <div class="muted">You earn <b>${(rate * 100).toFixed(2)}%</b> of everything you wager${isVip() ? " (includes +1% VIP)" : ""}. Goes up 0.05% per level, max ${isVip() ? "4" : "3"}%.</div>
        <button class="btn btn-gold" id="rwRake" ${+p.rakeback < 0.01 ? "disabled" : ""} style="margin-top:12px;width:100%">Claim ${fmt(p.rakeback)}</button></div>
      <div class="panel rw-card"><div class="section-title">Reward crates</div><div class="rw-big">${crates}</div>
        <div class="muted">One free crate for every level you reach. ${crates ? `Your next one is from level ${nextCrateLvl}: a random case worth up to ${fmt(crateBudget(nextCrateLvl))}.` : `Reach level ${L + 1} for the next one.`}</div>
        <button class="btn btn-unu" id="rwCrate" ${crates ? "" : "disabled"} style="margin-top:12px;width:100%">Open reward crate</button></div>
    </div>
    <div id="rwReel"></div>`;
  $("#rwRake").onclick = async () => { try { const a = await rpc("claim_rakeback"); await refreshMe(); bumpBalance(); toast(`Claimed ${fmt(a)} rakeback`, "good"); viewRewards(); } catch (e) { fail(e); } };
  $("#rwCrate").onclick = async () => {
    $("#rwCrate").disabled = true;
    try {
      const r = await rpc("open_level_crate"), c = CASES.find(x => x.id === r.case), win = fromJ([r.item])[0];
      $("#rwReel").innerHTML = `<div class="section-title" style="margin-top:18px">Level ${r.level} crate: ${esc(r.case_name)}</div><div class="reel-wrap"><div class="reel-marker"></div><div class="reel"></div></div>`;
      if (c && win) await spinReel($("#rwReel .reel"), c, win, 4500);
      await refreshMe(); if (win) showWins([win]); if (route()[0] === "rewards") setTimeout(() => !$("#modal").hidden || viewRewards(), 50);
    } catch (e) { fail(e); $("#rwCrate").disabled = false; }
  };
}

// ---------------------------------------------------------------- live drops + chat
// the server stamps announcements with show_at so nobody sees a result before the animation ends
const later = (row, fn) => { const ms = row.show_at ? new Date(row.show_at) - Date.now() : 0; ms > 0 ? setTimeout(() => fn(row), ms) : fn(row); };
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
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat" }, p => later(p.new, chatLine))
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "drops" }, p => later(p.new, pushDrop))
    .on("postgres_changes", { event: "*", schema: "public", table: "coinflips" }, p => {
      const g = p.new;
      if (g && g.status === "done" && (watchingFlip === g.id || (ME.user && g.creator === ME.user.id))) showFlip(g);   // someone joined a flip I made or am watching
      if (route()[0] === "coinflip") loadFlips();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "jackpot_rounds" }, p => {
      if (p.new && p.new.status === "done" && route()[0] === "jackpot") animateJackpot(p.new); else loadJackpot();
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "jackpot_entries" }, () => loadJackpot())
    .on("postgres_changes", { event: "*", schema: "public", table: "battles" }, p => {
      const r = route();
      if (r[0] === "battles") loadBattles();
      if (r[0] === "battle" && +r[1] === p.new?.id && p.new.status !== CUR_BATTLE?.status) viewBattle(p.new.id);
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "battle_players" }, p => {
      const r = route();
      if (r[0] === "battles") loadBattles();
      if (r[0] === "battle" && +r[1] === p.new.battle_id && CUR_BATTLE?.status === "open") viewBattle(p.new.battle_id);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "roulette_games" }, p => {
      const r = route();
      if (r[0] === "roulette" && !r[1]) loadRoulette();
      if (r[0] === "roulette" && +r[1] === p.new?.id && p.new.status !== CUR_RR?.status) viewRouletteGame(p.new.id);
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "roulette_players" }, p => {
      const r = route();
      if (r[0] === "roulette" && !r[1]) loadRoulette();
      if (r[0] === "roulette" && +r[1] === p.new.game_id && CUR_RR?.status === "open") { SFX.join(); viewRouletteGame(p.new.game_id); }
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "tips" }, p => {
      if (ME.user && p.new.receiver === ME.user.id) { toast(`${esc(p.new.sender_name)} tipped you ${fmt(p.new.amount)} coins!`, "good"); refreshMe().then(bumpBalance); }
    })
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
  $("#chatLog").innerHTML = ""; (chat || []).reverse().forEach(m => later(m, chatLine));
  (drops || []).reverse().forEach(d => later(d, pushDrop));
}

// ---------------------------------------------------------------- router
const route = () => (location.hash.replace(/^#\/?/, "").split("?")[0] || "cases").split("/").map(decodeURIComponent);
const go = r => location.hash = "#/" + r;
function render() {
  closeModal();
  const [r, arg] = route();
  $$("#nav a").forEach(a => a.classList.toggle("active", a.dataset.r === (r === "case" ? "cases" : r === "u" ? "players" : r === "battle" ? "battles" : r)));
  ({ cases: viewCases, case: () => viewCase(arg), unusualifier: viewUnusualifier, coinflip: viewCoinflip, jackpot: viewJackpot, market: viewMarket, inventory: viewInventory, trade: () => viewTrade(arg), u: () => viewProfile(arg), players: viewPlayers, rewards: viewRewards, battles: viewBattles, battle: () => viewBattle(arg), roulette: () => arg ? viewRouletteGame(arg) : viewRoulette(), values: viewValues }[r] || viewCases)();
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

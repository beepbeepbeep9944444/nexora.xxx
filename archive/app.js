(() => {
  const PAGE = 60;
  const CATS = ["Tops", "Bottoms", "Outerwear", "Sets", "Footwear", "Accessories", "Bags", "Jewelry", "Home & Tech", "Other"];
  const STORES = { weidian: "Weidian", taobao: "Taobao", "1688": "1688" };
  const app = document.getElementById("app");
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = p => p == null ? "Price on link" : "$" + (p >= 100 ? Math.round(p) : p.toFixed(2).replace(/\.00$/, ""));

  let DB = { items: [], sheets: [] };
  let byId = new Map();
  const state = { q: "", designers: new Set(), cats: new Set(), stores: new Set(), sheets: new Set(), archiveOnly: false,
    min: "", max: "", sort: "featured", shown: PAGE, designerFilter: "", sheetFilter: "", scroll: 0 };

  // favorites are a per-browser convenience only
  let favs = new Set();
  try { favs = new Set(JSON.parse(localStorage.getItem("ai-favs") || "[]")); } catch {}
  const saveFavs = () => { try { localStorage.setItem("ai-favs", JSON.stringify([...favs])); } catch {} updateFavCount(); };
  const updateFavCount = () => { $("#favCount").textContent = favs.size ? `(${favs.size})` : ""; };

  // a listing photo that fails falls back to the item's next photo; with none left the card is hidden
  window.AI_imgFail = img => {
    const it = byId.get(+img.dataset.id);
    const k = +img.dataset.k + 1;
    if (it && k < it.im.length) { img.dataset.k = k; img.src = it.im[k]; }
    else img.closest(".card").hidden = true;
  };

  const heartSvg = '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>';

  function filtered(list = DB.items) {
    const q = state.q.trim().toLowerCase();
    const terms = q ? q.split(/\s+/) : [];
    const min = parseFloat(state.min), max = parseFloat(state.max);
    let out = list.filter(it => {
      if (state.archiveOnly && !it.ar) return false;
      if (state.designers.size && !state.designers.has(it.b)) return false;
      if (state.cats.size && !state.cats.has(it.c)) return false;
      if (state.stores.size && !state.stores.has(it.pf)) return false;
      if (state.sheets.size && !state.sheets.has(it.s)) return false;
      if (!isNaN(min) && (it.p == null || it.p < min)) return false;
      if (!isNaN(max) && (it.p == null || it.p > max)) return false;
      if (terms.length) {
        const hay = it._h || (it._h = `${it.n} ${it.b} ${it.c} ${DB.sheets[it.s]?.n || ""}`.toLowerCase());
        for (const t of terms) if (!hay.includes(t)) return false;
      }
      return true;
    });
    if (state.sort === "low") out.sort((a, b) => (a.p ?? 1e9) - (b.p ?? 1e9));
    else if (state.sort === "high") out.sort((a, b) => (b.p ?? -1) - (a.p ?? -1));
    else if (state.sort === "photos") out.sort((a, b) => b.im.length - a.im.length);
    return out;
  }

  function counts(key, list) {
    const m = new Map();
    for (const it of list) m.set(it[key], (m.get(it[key]) || 0) + 1);
    return m;
  }

  function card(it) {
    const sheet = DB.sheets[it.s];
    const alt = it.im[1] ? `<img class="alt" src="${esc(it.im[1])}" alt="" loading="lazy" onerror="this.remove()">` : "";
    return `<article class="card">
      <a class="ph" href="#item/${it.id}">
        <img src="${esc(it.im[0])}" alt="${esc(it.n)}" loading="lazy" data-id="${it.id}" data-k="0" onerror="AI_imgFail(this)">
        ${alt}
        ${it.im.length > 1 ? `<span class="tag">${it.im.length} photos</span>` : ""}
      </a>
      <div class="meta">
        <span class="src">${esc(sheet?.n || "")}</span>
        <div class="row"><a class="designer" href="#item/${it.id}">${esc(it.b)}</a><span class="cat">${esc(it.c)}</span></div>
        <a class="title" href="#item/${it.id}">${esc(it.n)}</a>
        <div class="bottom">
          <span class="price">${money(it.p)}</span>
          <button class="heart ${favs.has(it.id) ? "on" : ""}" data-fav="${it.id}" aria-label="Save to favorites">${heartSvg}</button>
        </div>
      </div>
    </article>`;
  }

  function optList(name, entries, selected, labelFn = k => k) {
    return entries.map(([k, n]) => `<label class="opt"><input type="checkbox" data-f="${name}" value="${esc(k)}" ${selected.has(k) ? "checked" : ""}>
      <span>${esc(labelFn(k))}</span><span class="ct">${n.toLocaleString()}</span></label>`).join("");
  }

  function renderFeed(title) {
    const isFavs = title === "favs";
    const base = isFavs ? DB.items.filter(i => favs.has(i.id)) : DB.items;
    const list = filtered(base);
    const dCounts = [...counts("b", base)].sort((a, b) => b[1] - a[1]);
    const cCounts = CATS.map(c => [c, base.filter(i => i.c === c).length]).filter(x => x[1]);
    const pCounts = [...counts("pf", base)].filter(([k]) => k).sort((a, b) => b[1] - a[1]);
    const sCounts = [...counts("s", base)].sort((a, b) => b[1] - a[1]);
    const df = state.designerFilter.toLowerCase(), sf = state.sheetFilter.toLowerCase();

    const chips = [
      ...(state.archiveOnly ? [["archive", "", "Archive designers only"]] : []),
      ...[...state.designers].map(v => ["designers", v, v]),
      ...[...state.cats].map(v => ["cats", v, v]),
      ...[...state.stores].map(v => ["stores", v, STORES[v] || v]),
      ...[...state.sheets].map(v => ["sheets", v, DB.sheets[v]?.n]),
      ...(state.min || state.max ? [["price", "", `$${state.min || 0} – ${state.max ? "$" + state.max : "any"}`]] : []),
      ...(state.q ? [["q", "", `“${state.q}”`]] : []),
    ];

    app.innerHTML = `<div class="feed">
      <aside class="rail" id="rail">
        <div class="rail-head"><h2>Filters</h2><button id="clearAll">Clear all</button></div>
        <details class="fgroup" open><summary>Category</summary><div class="fbody"><div class="opts">
          <label class="opt"><input type="checkbox" id="archOnly" ${state.archiveOnly ? "checked" : ""}><span>Archive designers only</span><span class="ct">${base.filter(i => i.ar).length.toLocaleString()}</span></label>
          ${optList("cats", cCounts, state.cats)}</div></div></details>
        <details class="fgroup" open><summary>Designers</summary><div class="fbody">
          <input type="text" id="dSearch" placeholder="Search designers" value="${esc(state.designerFilter)}">
          <div class="opts" id="dOpts">${optList("designers", dCounts.filter(([k]) => !df || k.toLowerCase().includes(df)).slice(0, 150), state.designers)}</div></div></details>
        <details class="fgroup" open><summary>Price</summary><div class="fbody"><div class="price-row">
          <input type="number" id="pmin" placeholder="$ Min" min="0" value="${esc(state.min)}"><span>to</span>
          <input type="number" id="pmax" placeholder="$ Max" min="0" value="${esc(state.max)}"></div></div></details>
        <details class="fgroup"><summary>Store</summary><div class="fbody"><div class="opts">${optList("stores", pCounts, state.stores, k => STORES[k] || k)}</div></div></details>
        <details class="fgroup"><summary>Source spreadsheet</summary><div class="fbody">
          <input type="text" id="sSearch" placeholder="Search spreadsheets" value="${esc(state.sheetFilter)}">
          <div class="opts">${optList("sheets", sCounts.filter(([k]) => !sf || (DB.sheets[k]?.n || "").toLowerCase().includes(sf)), new Set([...state.sheets].map(String)), k => DB.sheets[k]?.n || k)}</div></div></details>
      </aside>
      <section>
        <div class="results-head">
          <button class="filter-toggle" id="ftoggle">Filters</button>
          <span class="count">${isFavs ? "Favorites · " : ""}${list.length.toLocaleString()} listings</span>
          <select id="sort" aria-label="Sort">
            <option value="featured" ${state.sort === "featured" ? "selected" : ""}>Sort: Default</option>
            <option value="low" ${state.sort === "low" ? "selected" : ""}>Price: Low to High</option>
            <option value="high" ${state.sort === "high" ? "selected" : ""}>Price: High to Low</option>
            <option value="photos" ${state.sort === "photos" ? "selected" : ""}>Most photos</option>
          </select>
        </div>
        ${chips.length ? `<div class="chips">${chips.map(([k, v, l]) => `<button class="chip" data-chip="${k}" data-v="${esc(v)}">${esc(l)} <span aria-hidden="true">×</span></button>`).join("")}</div>` : ""}
        ${list.length ? `<div class="grid" id="grid">${list.slice(0, state.shown).map(card).join("")}</div>` :
          `<div class="empty">${isFavs ? "Tap the heart on any listing to save it here." : "No listings match these filters."}</div>`}
        ${list.length > state.shown ? `<div class="more"><button class="btn line" id="moreBtn">Show more (${(list.length - state.shown).toLocaleString()} left)</button></div>` : ""}
      </section>
    </div>`;
    renderDeptBar();
    bindFeed(title);
  }

  function rerender() { const y = scrollY; route(); scrollTo(0, y); }
  function resetPaging() { state.shown = PAGE; }

  function bindFeed(title) {
    app.querySelectorAll("input[data-f]").forEach(inp => inp.addEventListener("change", () => {
      const set = state[inp.dataset.f];
      const v = inp.dataset.f === "sheets" ? +inp.value : inp.value;
      inp.checked ? set.add(v) : set.delete(v);
      resetPaging(); rerender();
    }));
    $("#archOnly").addEventListener("change", e => { state.archiveOnly = e.target.checked; resetPaging(); rerender(); });
    $("#clearAll").addEventListener("click", clearFilters);
    $("#sort").addEventListener("change", e => { state.sort = e.target.value; resetPaging(); rerender(); });
    $("#ftoggle").addEventListener("click", () => $("#rail").classList.toggle("open"));
    const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
    const keepFocus = (id, fn) => debounce(e => { fn(e.target.value); const pos = e.target.selectionStart; rerender(); const el = $("#" + id); if (el) { el.focus(); el.setSelectionRange(pos, pos); } });
    $("#dSearch").addEventListener("input", keepFocus("dSearch", v => state.designerFilter = v));
    $("#sSearch").addEventListener("input", keepFocus("sSearch", v => state.sheetFilter = v));
    $("#pmin").addEventListener("change", e => { state.min = e.target.value; resetPaging(); rerender(); });
    $("#pmax").addEventListener("change", e => { state.max = e.target.value; resetPaging(); rerender(); });
    app.querySelectorAll("[data-chip]").forEach(b => b.addEventListener("click", () => {
      const k = b.dataset.chip, v = b.dataset.v;
      if (k === "archive") state.archiveOnly = false;
      else if (k === "price") state.min = state.max = "";
      else if (k === "q") { state.q = ""; $("#q").value = ""; }
      else state[k].delete(k === "sheets" ? +v : v);
      resetPaging(); rerender();
    }));
    const more = $("#moreBtn");
    if (more) more.addEventListener("click", () => { state.shown += PAGE * 2; rerender(); });
  }

  function clearFilters() {
    Object.assign(state, { q: "", archiveOnly: false, min: "", max: "", designerFilter: "", sheetFilter: "" });
    ["designers", "cats", "stores", "sheets"].forEach(k => state[k].clear());
    $("#q").value = ""; resetPaging(); rerender();
  }

  function renderDeptBar() {
    const bar = $("#deptBar");
    const onlyCat = state.cats.size === 1 ? [...state.cats][0] : null;
    const mineIdx = DB.sheets.map((s, i) => s.me ? i : -1).filter(i => i >= 0);
    const onMine = mineIdx.length && state.sheets.size === mineIdx.length && mineIdx.every(i => state.sheets.has(i));
    const plain = !state.cats.size && !state.archiveOnly && !state.sheets.size;
    const btns = [["All", plain], ...(mineIdx.length ? [["Featured", onMine && !state.cats.size]] : []),
      ["Archive", state.archiveOnly && !state.cats.size], ...CATS.map(c => [c, onlyCat === c])];
    bar.innerHTML = btns.map(([l, on]) => `<button data-dept="${l}" class="${on ? "on" : ""}">${l}</button>`).join("");
    bar.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
      const d = b.dataset.dept;
      state.cats.clear(); state.archiveOnly = false;
      if (d === "Featured" || d === "All") state.sheets.clear();
      if (d === "Featured") mineIdx.forEach(i => state.sheets.add(i));
      else if (d === "Archive") state.archiveOnly = true; else if (d !== "All") state.cats.add(d);
      resetPaging();
      if (location.hash && location.hash !== "#favs") location.hash = ""; else rerender();
    }));
  }

  function renderItem(id) {
    const it = byId.get(id);
    if (!it) { app.innerHTML = `<div class="empty">This listing isn't in the index anymore. <a href="#">Back to the feed</a></div>`; return; }
    const sheet = DB.sheets[it.s];
    const related = DB.items.filter(x => x.b === it.b && x.id !== it.id && it.b !== "Other").slice(0, 8);
    app.innerHTML = `<div class="item">
      <nav class="crumbs"><a href="#">Feed</a><span>/</span><span>${esc(it.c)}</span><span>/</span><span>${esc(it.b)}</span></nav>
      <div class="gallery">
        <div class="thumbs">${it.im.map((s, i) => `<button data-i="${i}" class="${i ? "" : "on"}" aria-label="Photo ${i + 1}"><img src="${esc(s)}" alt="" loading="lazy"></button>`).join("")}</div>
        <div class="main-ph">
          <img id="mainImg" src="${esc(it.im[0])}" alt="${esc(it.n)}">
          ${it.im.length > 1 ? `<button class="nav prev" aria-label="Previous photo">‹</button><button class="nav next" aria-label="Next photo">›</button>` : ""}
          <span class="idx" id="idx">1 / ${it.im.length}</span>
        </div>
      </div>
      <div class="panel">
        <a class="designer" href="#" data-designer="${esc(it.b)}">${esc(it.b)}</a>
        <h1>${esc(it.n)}</h1>
        <div class="big-price">${money(it.p)}${it.cny ? `<small>¥${Math.round(it.cny)}</small>` : ""}</div>
        <dl class="facts">
          <dt>Category</dt><dd>${esc(it.c)}</dd>
          <dt>Store</dt><dd>${esc(STORES[it.pf] || "Agent link")}</dd>
          ${it.sec ? `<dt>Section</dt><dd>${esc(it.sec)}</dd>` : ""}
        </dl>
        <div class="actions">
          <a class="btn solid" href="${esc(it.l)}" target="_blank" rel="noopener noreferrer">Buy</a>
          <button class="btn line" id="favBtn">${favs.has(it.id) ? "Saved to favorites" : "Add to favorites"}</button>
        </div>
        ${it.v ? `<div class="verified"><b>●</b> Listing confirmed live on ${esc(STORES[it.pf])} when this index was built</div>`
          : `<div class="verified"><span>○</span> From a featured spreadsheet. Not checked against the store yet.</div>`}
        ${it.al?.length ? `<div class="alts"><strong>Other buy links</strong>${it.al.map(a => `<a href="${esc(a)}" target="_blank" rel="noopener noreferrer">${esc(new URL(a).hostname.replace(/^www\./, ""))}</a>`).join("")}</div>` : ""}
        <div class="seller">
          <span class="nm">${esc(sheet?.n || "")}</span>
          ${sheet?.cr ? `<span>by ${esc(sheet.cr)}</span>` : ""}
          ${sheet?.u ? `<a href="${esc(sheet.u)}" target="_blank" rel="noopener noreferrer">Open source spreadsheet</a>` : ""}
        </div>
      </div>
      ${related.length ? `<section class="related"><h3>More from ${esc(it.b)}</h3><div class="grid">${related.map(card).join("")}</div></section>` : ""}
    </div>`;
    let cur = 0;
    const show = i => {
      cur = (i + it.im.length) % it.im.length;
      $("#mainImg").src = it.im[cur];
      $("#idx").textContent = `${cur + 1} / ${it.im.length}`;
      app.querySelectorAll(".thumbs button").forEach((b, j) => b.classList.toggle("on", j === cur));
    };
    app.querySelectorAll(".thumbs button").forEach(b => b.addEventListener("click", () => show(+b.dataset.i)));
    app.querySelector(".nav.prev")?.addEventListener("click", () => show(cur - 1));
    app.querySelector(".nav.next")?.addEventListener("click", () => show(cur + 1));
    $("#favBtn").addEventListener("click", e => { toggleFav(it.id); e.target.textContent = favs.has(it.id) ? "Saved to favorites" : "Add to favorites"; });
    app.querySelector("[data-designer]").addEventListener("click", e => {
      e.preventDefault(); clearFilters(); state.designers.add(it.b); location.hash = "";
    });
    // drop thumbnails whose image is gone so the gallery only shows working photos
    app.querySelectorAll(".thumbs img").forEach((img, i) => img.addEventListener("error", () => img.parentElement.remove()));
    let fails = 0;
    $("#mainImg").addEventListener("error", () => { if (++fails < it.im.length) show(cur + 1); });
    renderDeptBar();
  }

  function renderSheets() {
    const n = counts("s", DB.items);
    const rows = DB.sheets.map((s, i) => ({ ...s, i, ct: n.get(i) || 0 })).sort((a, b) => b.ct - a.ct);
    app.innerHTML = `<div class="sheets">
      <h1>Source spreadsheets</h1>
      <p class="sub">Every spreadsheet and finds site in the index. Each one was checked and is publicly viewable. Item counts only include listings with a working photo and a buy link.</p>
      <div class="sheet-table-wrap"><table class="sheet-table">
        <thead><tr><th>Spreadsheet</th><th>Creator</th><th>Focus</th><th>Found on</th><th class="n">Listings</th></tr></thead>
        <tbody>${rows.map(s => `<tr>
          <td><a href="${esc(s.u)}" target="_blank" rel="noopener noreferrer">${esc(s.n)}</a></td>
          <td>${esc(s.cr || "—")}</td>
          <td>${s.me ? '<span class="pill">Featured</span> ' : ""}${s.ar ? '<span class="pill">Archive</span>' : "General"}</td>
          <td>${/^https?:/.test(s.src || "") ? `<a href="${esc(s.src)}" target="_blank" rel="noopener noreferrer">${esc(new URL(s.src).hostname.replace(/^www\./, ""))}</a>` : esc(s.src || "—")}</td>
          <td class="n">${s.ct ? `<a href="#" data-sheet="${s.i}">${s.ct.toLocaleString()}</a>` : '<span style="color:var(--muted)">Checking links</span>'}</td></tr>`).join("")}</tbody>
      </table></div></div>`;
    app.querySelectorAll("[data-sheet]").forEach(a => a.addEventListener("click", e => {
      e.preventDefault(); clearFilters(); state.sheets.add(+a.dataset.sheet); location.hash = "";
    }));
    renderDeptBar();
  }

  function toggleFav(id) { favs.has(id) ? favs.delete(id) : favs.add(id); saveFavs(); }

  app.addEventListener("click", e => {
    const h = e.target.closest("[data-fav]");
    if (h) { e.preventDefault(); toggleFav(+h.dataset.fav); h.classList.toggle("on", favs.has(+h.dataset.fav)); }
  });

  let lastHash = null;
  function route() {
    const h = location.hash.slice(1);
    if (h.startsWith("item/")) renderItem(+h.slice(5));
    else if (h === "sheets") renderSheets();
    else renderFeed(h === "favs" ? "favs" : "");
  }
  addEventListener("hashchange", () => {
    const wasFeed = !lastHash || lastHash === "" || lastHash === "favs";
    if (wasFeed) state.scroll = scrollY;
    lastHash = location.hash.slice(1);
    route();
    const nowFeed = lastHash === "" || lastHash === "favs";
    scrollTo(0, nowFeed ? state.scroll : 0);
  });

  $("#searchForm").addEventListener("submit", e => {
    e.preventDefault(); state.q = $("#q").value; resetPaging();
    if (location.hash && location.hash !== "#favs") location.hash = ""; else rerender();
  });
  $("#favLink").addEventListener("click", e => { e.preventDefault(); location.hash = "favs"; });

  app.innerHTML = `<div class="empty">Loading listings…</div>`;
  fetch("data/items.json", { cache: "no-cache" }).then(r => r.json()).then(d => {
    DB = d;
    DB.items.forEach(it => byId.set(it.id, it));
    $("#footStats").textContent = `${DB.items.length.toLocaleString()} listings from ${DB.sheets.length} spreadsheets · links checked ${DB.built}`;
    updateFavCount();
    lastHash = location.hash.slice(1);
    route();
  }).catch(() => { app.innerHTML = `<div class="empty">Couldn't load the listings file (data/items.json). Start the site with the local server, not by opening the file directly.</div>`; });
})();

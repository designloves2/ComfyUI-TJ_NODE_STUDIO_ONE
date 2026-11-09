// ONE STUDIO manual viewer. Content lives in content/<page id>.js, each file calls MANUAL.add({...}); the order of the pages is
// in manifest.js. Every piece of text is { ko, en }, so the language button only switches what is shown.
(function () {
  const M = window.MANUAL = Object.assign({ groups: [], pages: {} }, window.MANUAL || {});
  M.add = (p) => { M.pages[p.id] = p; };
  const $ = (s) => document.querySelector(s);
  const store = {
    get(k, d) { try { return localStorage.getItem(k) || d; } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
  };
  let lang = store.get("tj_manual_lang", (navigator.language || "").startsWith("ko") ? "ko" : "en");
  const tx = (o) => o == null ? "" : typeof o === "string" ? o : (o[lang] || o.en || o.ko || "");
  const esc = (s) => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  // `code` between backticks, **bold**, and a plain table written as lines starting with "|"
  const rich = (s) => {
    const lines = esc(s).split("\n"), out = [];
    for (let i = 0; i < lines.length; i++) {
      if (/^\|/.test(lines[i])) {
        const rows = [];
        while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
        i--;
        const cells = (r) => r.replace(/^\||\|$/g, "").split("|").map(c => c.trim());
        const body = rows.filter(r => !/^\|[\s:|-]+\|?$/.test(r));
        out.push(`<table class="c${cells(body[0]).length}">` + body.map((r, k) => "<tr>" + cells(r).map(c => k ? `<td>${c}</td>` : `<th>${c}</th>`).join("") + "</tr>").join("") + "</table>");
      } else out.push(lines[i]);
    }
    return out.join("\n").replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:var(--brand2)">$1</a>').replace(/<\/table>\n/g, "</table>");
  };
  const order = () => M.groups.flatMap(g => g.pages).filter(id => M.pages[id]);

  function renderNav() {
    $("#nav").innerHTML = M.groups.map(g => {
      const items = g.pages.filter(id => M.pages[id]).map(id => `<a href="#${id}" data-id="${id}">${esc(tx(M.pages[id].title))}</a>`).join("");
      return items ? `<h4>${esc(tx(g.title))}</h4>${items}` : "";
    }).join("");
  }
  function renderPage(id) {
    const p = M.pages[id] || M.pages[order()[0]];
    if (!p) { $("#main").innerHTML = "<p>No pages.</p>"; return; }
    document.querySelectorAll("#nav a").forEach(a => a.classList.toggle("cur", a.dataset.id === p.id));
    const secs = (p.sections || []).map((s, i) => {
      const body = tx(s.body), img = s.img ? `<figure><img src="${s.img.src}" alt="${esc(tx(s.img.cap))}" loading="lazy"><figcaption>${esc(tx(s.img.cap))}</figcaption></figure>` : "";
      return `<section id="s${i}"><h3>${esc(tx(s.h))}</h3><div class="body">${rich(body)}</div>${img}</section>`;
    }).join("");
    const ids = order(), at = ids.indexOf(p.id), prev = M.pages[ids[at - 1]], next = M.pages[ids[at + 1]];
    $("#main").innerHTML = `<h2>${esc(tx(p.title))}</h2><p class="lead">${esc(tx(p.lead))}</p>${secs}`
      + `<div class="pn"><span>${prev ? `<a href="#${prev.id}">← ${esc(tx(prev.title))}</a>` : ""}</span><span>${next ? `<a href="#${next.id}">${esc(tx(next.title))} →</a>` : ""}</span></div>`;
    document.title = tx(p.title) + " — ONE STUDIO Manual";
    window.scrollTo(0, 0);
  }
  function renderSearch(q) {
    const needle = q.toLowerCase(), hits = [];
    for (const id of order()) {
      const p = M.pages[id];
      (p.sections || []).forEach((s, i) => {
        const text = tx(s.h) + "\n" + tx(s.body);
        const at = text.toLowerCase().indexOf(needle);
        if (at >= 0) hits.push({ id, i, title: tx(p.title), h: tx(s.h), snip: text.slice(Math.max(0, at - 40), at + 120).replace(/\n/g, " ") });
      });
    }
    $("#main").innerHTML = `<h2>“${esc(q)}” — ${hits.length}</h2>` + hits.map(h =>
      `<section><h3><a style="color:inherit" href="#${h.id}">${esc(h.title)} › ${esc(h.h)}</a></h3><div class="body">${esc(h.snip)}</div></section>`).join("");
  }
  function route() {
    const q = $("#q").value.trim();
    if (q.length >= 2) renderSearch(q); else renderPage(location.hash.slice(1));
  }
  function setLang(l) {
    lang = l; store.set("tj_manual_lang", l);
    document.documentElement.lang = l;
    $("#bKo").classList.toggle("on", l === "ko"); $("#bEn").classList.toggle("on", l === "en");
    $("#q").placeholder = l === "ko" ? "검색" : "Search";
    renderNav(); route();
  }
  function setTheme(t) { document.documentElement.dataset.theme = t; store.set("tj_manual_theme", t); }

  $("#bKo").onclick = () => setLang("ko");
  $("#bEn").onclick = () => setLang("en");
  $("#bTh").onclick = () => setTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
  $("#q").oninput = route;
  window.addEventListener("hashchange", () => { $("#q").value = ""; route(); });
  setTheme(store.get("tj_manual_theme", "dark"));

  // load the page files, then draw
  let left = 0;
  const done = () => { if (--left <= 0) setLang(lang); };
  const files = M.groups.flatMap(g => g.pages);
  left = files.length;
  if (!left) setLang(lang);
  for (const id of files) {
    const s = document.createElement("script");
    s.src = `content/${id}.js`; s.onload = done; s.onerror = done;
    document.head.appendChild(s);
  }
})();

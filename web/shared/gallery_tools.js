// Gallery tools popup — cleanup, folder merge and trash — shared by every gallery.
// Server side: /tj_shared/gallery_tools/* (gallery_tools.py). Wire it like the Cache button:
//   const toolsBtn = button("🧹 Tools", () => {});
//   wireGalleryTools(toolsBtn, () => ({ nodeKey: "klein", folder: SUBFOLDER, onChanged: () => reset() }));
const BRAND = "#7612DA";
const P = { bg: "#161616", bg2: "#232323", border: "#3a3a3a", text: "#e6e6e6", muted: "#9a9a9a", ok: "#4caf7d", warn: "#e0a030", bad: "#c0392b" };

function h(tag, props = {}, kids = []) {
  const e = document.createElement(tag);
  const { style, text, ...rest } = props;
  if (style) Object.assign(e.style, style);
  if (text != null) e.textContent = text;
  for (const [k, v] of Object.entries(rest)) e[k] = v;
  for (const c of [].concat(kids)) if (c) e.appendChild(c);
  return e;
}

async function post(path, body) {
  const r = await fetch(`/tj_shared/gallery_tools/${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }));
  if (!d.ok) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
}

const fmtSize = (n) => n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n > 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`;
const btnStyle = (primary) => ({
  cursor: "pointer", fontFamily: "inherit", fontSize: "11px", padding: "6px 12px", borderRadius: "6px",
  border: `1px solid ${primary ? BRAND : P.border}`, background: primary ? BRAND : P.bg2, color: primary ? "#fff" : P.text,
});

// Separate popup showing the output folder as a tree, so sub-folders stay distinguishable.
// list: [{path, files}] (files counts everything below). Resolves to the chosen path or null.
function pickFolderTree(list, here, current) {
  return new Promise((resolve) => {
    const nodes = new Map();
    const root = { path: "", name: "output", files: 0, children: [] };
    nodes.set("", root);
    for (const f of [...list].sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }))) {
      const parts = f.path.split("/");
      for (let i = 0; i < parts.length; i++) {
        const p = parts.slice(0, i + 1).join("/");
        if (!nodes.has(p)) {
          const n = { path: p, name: parts[i], files: 0, children: [] };
          nodes.set(p, n);
          nodes.get(parts.slice(0, i).join("/")).children.push(n);
        }
      }
      nodes.get(f.path).files = f.files;
    }
    const open = new Set();
    const expandTo = (p) => { const parts = p.split("/"); for (let i = 1; i < parts.length; i++) open.add(parts.slice(0, i).join("/")); };
    expandTo(here);
    let choice = current || "";
    if (choice) expandTo(choice);

    const back = h("div", { style: { position: "fixed", inset: "0", zIndex: "100001", background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center" } });
    const box = h("div", { style: { width: "min(560px, 92vw)", height: "min(620px, 82vh)", background: P.bg, color: P.text, border: `1px solid ${P.border}`, borderRadius: "10px", padding: "12px", display: "flex", flexDirection: "column", gap: "8px", boxSizing: "border-box", fontSize: "12px" } });
    const filter = h("input", { type: "text", placeholder: "Filter folders…", style: { padding: "6px 8px", background: P.bg2, color: P.text, border: `1px solid ${P.border}`, borderRadius: "6px", fontFamily: "inherit" } });
    const tree = h("div", { style: { flex: "1", overflow: "auto", border: `1px solid ${P.border}`, borderRadius: "6px", padding: "4px", background: "#101010" } });
    const info = h("div", { style: { color: P.muted, minHeight: "16px" } });
    const ok = h("button", { type: "button", text: "Choose", style: btnStyle(true) });
    const cancel = h("button", { type: "button", text: "Cancel", style: btnStyle(false) });
    box.append(h("div", { text: "Choose the folder to merge into the current one", style: { fontWeight: "700", fontSize: "13px" } }),
      h("div", { text: `Current (stays): ${here}`, style: { color: P.muted } }), filter, tree, info,
      h("div", { style: { display: "flex", gap: "8px", justifyContent: "flex-end" } }, [cancel, ok]));
    back.appendChild(box);
    const done = (v) => { back.remove(); resolve(v); };
    cancel.addEventListener("click", () => done(null));
    back.addEventListener("mousedown", (e) => { if (e.target === back) done(null); });
    const disabledReason = (p) => p === here ? "current folder" : here.startsWith(p + "/") ? "contains the current folder" : "";

    function render() {
      tree.replaceChildren();
      const q = filter.value.trim().toLowerCase();
      const matches = (n) => !q || n.path.toLowerCase().includes(q) || n.children.some(matches);
      const walk = (n, depth) => {
        for (const c of n.children) {
          if (!matches(c)) continue;
          const isOpen = q ? true : open.has(c.path);
          const why = disabledReason(c.path);
          const row = h("div", { style: {
            display: "flex", alignItems: "center", gap: "6px", padding: "3px 6px", paddingLeft: `${6 + depth * 18}px`, borderRadius: "4px",
            cursor: why ? "default" : "pointer", opacity: why ? 0.45 : 1, background: c.path === choice ? BRAND : "transparent",
          } });
          if (c.path === choice) row.dataset.sel = "1";
          const tog = h("span", { text: c.children.length ? (isOpen ? "▾" : "▸") : "·", style: { width: "12px", textAlign: "center", color: P.muted, cursor: c.children.length ? "pointer" : "default" } });
          tog.addEventListener("click", (e) => { e.stopPropagation(); if (!c.children.length) return; open.has(c.path) ? open.delete(c.path) : open.add(c.path); render(); });
          row.append(tog, h("span", { text: `📁 ${c.name}` }), h("span", { text: `${c.files} file${c.files === 1 ? "" : "s"}${why ? ` · ${why}` : ""}`, style: { color: c.path === choice ? "#fff" : P.muted, marginLeft: "auto", fontSize: "11px" } }));
          row.addEventListener("click", () => { if (why) return; choice = c.path; info.textContent = `Selected: ${c.path}`; render(); });
          row.addEventListener("dblclick", () => { if (!why) done(c.path); });
          tree.appendChild(row);
          if (isOpen) walk(c, depth + 1);
        }
      };
      walk(root, 0);
      if (!tree.firstChild) tree.appendChild(h("div", { text: "No folder matches.", style: { color: P.muted, padding: "8px" } }));
    }
    filter.addEventListener("input", render);
    ok.addEventListener("click", () => done(choice || null));
    info.textContent = choice ? `Selected: ${choice}` : "";
    render();
    document.body.appendChild(back);
    setTimeout(() => { tree.querySelector("[data-sel]")?.scrollIntoView({ block: "center" }); }, 0);
  });
}

export function wireGalleryTools(button, getScope) {
  button.title = "Clean up leftovers, rebuild thumbnails, merge folders, restore from trash";
  button.addEventListener("click", () => openGalleryTools(getScope()));
}

export function openGalleryTools({ nodeKey, folder, onChanged }) {
  const back = h("div", { style: {
    position: "fixed", inset: "0", zIndex: "100000", background: "rgba(0,0,0,.6)", display: "flex",
    alignItems: "center", justifyContent: "center",
  }});
  const box = h("div", { style: {
    width: "min(720px, 94vw)", maxHeight: "86vh", overflow: "auto", background: P.bg, color: P.text,
    border: `1px solid ${P.border}`, borderRadius: "10px", padding: "14px", fontSize: "12px",
    display: "flex", flexDirection: "column", gap: "10px", boxSizing: "border-box",
  }});
  back.appendChild(box);
  const close = () => back.remove();
  back.addEventListener("mousedown", (e) => { if (e.target === back) close(); });
  let changed = false;
  const notify = () => { changed = true; try { onChanged?.(); } catch {} };

  const tabs = h("div", { style: { display: "flex", gap: "6px", alignItems: "center" } });
  const body = h("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } });
  const names = [["clean", "🧹 Cleanup"], ["merge", "📁 Merge folder"], ["trash", "🗑 Trash"]];
  const tabBtns = {};
  for (const [k, label] of names) {
    tabBtns[k] = h("button", { type: "button", text: label, style: btnStyle(false) });
    tabBtns[k].addEventListener("click", () => show(k));
    tabs.appendChild(tabBtns[k]);
  }
  const closeBtn = h("button", { type: "button", text: "✕ Close", style: { ...btnStyle(false), marginLeft: "auto" } });
  closeBtn.addEventListener("click", close);
  tabs.appendChild(closeBtn);
  const statusEl = h("div");   // result line that survives a tab reload (trash restore / delete)
  box.append(h("div", { text: `Gallery tools — ${folder}`, style: { fontSize: "13px", fontWeight: "700" } }), tabs, body, statusEl);

  const note = (t, color) => h("div", { text: t, style: { color: color || P.muted, lineHeight: "1.5" } });
  const err = (e) => body.appendChild(note(`⚠ ${e.message || e}`, P.bad));

  // Each tab loads asynchronously; a tab clicked away from must not paint over the one now showing.
  let token = 0;
  function show(k) {
    const mine = ++token;
    statusEl.replaceChildren();
    for (const [n, b] of Object.entries(tabBtns)) { b.style.background = n === k ? BRAND : P.bg2; b.style.borderColor = n === k ? BRAND : P.border; b.style.color = n === k ? "#fff" : P.text; }
    body.replaceChildren();
    ({ clean: viewClean, merge: viewMerge, trash: viewTrash })[k](() => mine === token);
  }

  // ── cleanup ──────────────────────────────────────────────────────────────────────
  async function viewClean(live) {
    body.appendChild(note("Scanning…"));
    let rep;
    try { rep = (await post("scan", { node_key: nodeKey, folder })).report; } catch (e) { if (!live()) return; body.replaceChildren(); err(e); return; }
    if (!live()) return;
    body.replaceChildren();
    body.appendChild(note(`${rep.media} media files in this folder (and its sub-folders). Removed files go to the Trash tab, so nothing here is permanent.`));
    const rows = [
      ["orphans", "Metadata and thumbnails whose file is gone", rep.orphan_meta.length + rep.orphan_thumbs.length, rep.bytes.orphan_meta + rep.bytes.orphan_thumbs, true],
      ["tmp", "Leftover temp files (.tmp, .part …)", rep.tmp_files.length, rep.bytes.tmp_files, true],
      ["thumbs", "Missing or outdated thumbnails (rebuild)", rep.missing_thumbs.length + rep.stale_thumbs.length, 0, true],
      ["empty_dirs", "Empty folders", rep.empty_dirs.length, 0, true],
      ["favorites", "Favorites pointing at files that no longer exist", rep.dead_favorites.length, 0, true],
    ];
    const checks = {};
    for (const [key, label, n, size, on] of rows) {
      const cb = h("input", { type: "checkbox", checked: on && n > 0, disabled: n === 0 });
      checks[key] = cb;
      body.appendChild(h("label", { style: { display: "flex", gap: "8px", alignItems: "center", opacity: n ? 1 : 0.5 } }, [
        cb, h("span", { text: `${label}: ${n}${size ? ` (${fmtSize(size)})` : ""}` })]));
    }
    const force = h("input", { type: "checkbox" });
    checks.force_thumbs = force;
    body.appendChild(h("label", { style: { display: "flex", gap: "8px", alignItems: "center" } }, [
      force, h("span", { text: "Rebuild ALL thumbnails (slow on big folders)" })]));
    if (rep.no_meta.length) body.appendChild(note(`${rep.no_meta.length} file(s) have no metadata (added by hand?). They are kept and get thumbnails; "Reuse setting" is simply unavailable for them.`));
    const out = h("div");
    const go = h("button", { type: "button", text: "Run cleanup", style: btnStyle(true) });
    const again = h("button", { type: "button", text: "↻ Rescan", style: btnStyle(false) });
    again.addEventListener("click", () => show("clean"));
    go.addEventListener("click", async () => {
      go.disabled = true; go.textContent = "⏳ Working…"; out.replaceChildren();
      try {
        const actions = Object.fromEntries(Object.entries(checks).map(([k, c]) => [k, c.checked]));
        const r = (await post("clean", { node_key: nodeKey, folder, actions })).result;
        out.appendChild(note(`✓ ${r.trashed} moved to trash · ${r.thumbs_built} thumbnails built${r.thumbs_failed ? ` (${r.thumbs_failed} failed)` : ""} · ${r.dirs_removed} empty folders removed · ${r.favorites_pruned} favorites pruned${r.skipped_recent ? ` · ${r.skipped_recent} skipped (changed in the last minute)` : ""}`, P.ok));
        notify();
      } catch (e) { out.appendChild(note(`⚠ ${e.message}`, P.bad)); }
      go.disabled = false; go.textContent = "Run cleanup";
    });
    body.append(h("div", { style: { display: "flex", gap: "8px" } }, [go, again]), out);
  }

  // ── merge ────────────────────────────────────────────────────────────────────────
  async function viewMerge(live) {
    body.appendChild(note("Loading folders…"));
    let list;
    try {
      const r = await fetch(`/tj_shared/gallery_tools/folders?node_key=${encodeURIComponent(nodeKey)}&folder=${encodeURIComponent(folder)}`);
      const d = await r.json(); if (!d.ok) throw new Error(d.error); list = d.folders;
    } catch (e) { if (!live()) return; body.replaceChildren(); err(e); return; }
    if (!live()) return;
    body.replaceChildren();
    const here = folder.replace(/\\/g, "/");
    body.appendChild(note(`This folder (stays): ${here}\nChoose any folder of the output tree to merge INTO it, e.g. "minimax_h3" into "one_minimax_h3". Its files, metadata and covers are moved here, the thumbnails are rebuilt, every path stored in the metadata is updated, and the emptied folder is removed. A file whose name is already taken becomes "<name>_<folder name>".`));
    const sel = { value: "" };       // the chosen source folder
    const out = h("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } });
    const chosen = h("div", { text: "No folder chosen", style: { flex: "1", padding: "6px 8px", background: P.bg2, borderRadius: "6px", color: P.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } });
    const pick = h("button", { type: "button", text: "📂 Choose folder…", style: btnStyle(false) });
    const preview = h("button", { type: "button", text: "Preview", style: btnStyle(false) });
    const run = h("button", { type: "button", text: "Merge", style: btnStyle(true) });
    run.disabled = true; preview.disabled = true;
    pick.addEventListener("click", async () => {
      const p = await pickFolderTree(list, here, sel.value);
      if (!p) return;
      sel.value = p; chosen.textContent = p; chosen.style.color = P.text;
      run.disabled = true; preview.disabled = false; out.replaceChildren();
    });
    const bodyOf = () => ({ node_key: nodeKey, dest: here, source: sel.value });
    preview.addEventListener("click", async () => {
      out.replaceChildren(); run.disabled = true;
      try {
        const p = (await post("merge_plan", bodyOf())).plan;
        const ren = Object.entries(p.renames);
        out.appendChild(note(`${p.moves.length} file(s) will move${p.covers.length ? `, ${p.covers.length} cover(s)` : ""}; ${ren.length} get a new name.`, P.text));
        for (const [a, b] of ren.slice(0, 8)) out.appendChild(note(`  ${a.split("/").pop()} → ${b.split("/").pop()}`));
        if (ren.length > 8) out.appendChild(note(`  … and ${ren.length - 8} more`));
        if (p.leftover.length) out.appendChild(note(`⚠ ${p.leftover.length} other file(s) are not gallery media (e.g. ${p.leftover[0].split("/").pop()}). They stay and the source folder is NOT removed.`, P.warn));
        else out.appendChild(note("The source folder will be removed afterwards.", P.text));
        run.disabled = !p.moves.length && !p.covers.length;
      } catch (e) { out.appendChild(note(`⚠ ${e.message}`, P.bad)); }
    });
    run.addEventListener("click", async () => {
      if (!confirm(`Merge "${sel.value}" into "${here}"?\nFiles are moved and the source folder is removed.`)) return;
      run.disabled = true; run.textContent = "⏳ Merging…"; out.replaceChildren();
      try {
        const p = (await post("merge", bodyOf())).plan;
        out.appendChild(note(`✓ ${p.moves.length} file(s) merged (${Object.keys(p.renames).length} renamed) · ${p.metas_rewritten} metadata updated · ${p.refs_rewritten} other metadata re-pointed · ${p.thumbs_built} thumbnails built · source folder ${p.removed_source ? "removed" : "kept"}`, P.ok));
        notify();
      } catch (e) { out.appendChild(note(`⚠ ${e.message}`, P.bad)); }
      run.textContent = "Merge";
    });
    body.append(h("div", { style: { display: "flex", gap: "8px", alignItems: "center" } }, [pick, chosen]),
      h("div", { style: { display: "flex", gap: "8px" } }, [preview, run]), out);
  }

  // ── trash ────────────────────────────────────────────────────────────────────────
  async function viewTrash(live) {
    body.appendChild(note("Loading…"));
    let batches;
    try { batches = (await post("trash", { action: "list" })).batches; } catch (e) { if (!live()) return; body.replaceChildren(); err(e); return; }
    if (!live()) return;
    body.replaceChildren();
    if (!batches.length) { body.appendChild(note("The trash is empty.")); return; }
    body.appendChild(note("Items removed by cleanup / merge are kept here until you empty the trash. Restore puts them back where they were."));
    const msg = statusEl;
    for (const b of batches) {
      const when = new Date(b.created * 1000).toLocaleString();
      const rs = h("button", { type: "button", text: "Restore", style: btnStyle(false) });
      const del = h("button", { type: "button", text: "Delete", style: btnStyle(false) });
      rs.addEventListener("click", async () => {
        try {
          const r = (await post("trash", { action: "restore", batch: b.batch })).result;
          notify(); show("trash");
          msg.replaceChildren(note(`✓ ${r.restored} restored${r.skipped.length ? ` · ${r.skipped.length} skipped (a file with that name exists)` : ""}`, P.ok));
        } catch (e) { msg.replaceChildren(note(`⚠ ${e.message}`, P.bad)); }
      });
      del.addEventListener("click", async () => {
        if (!confirm("Delete this trash entry permanently?")) return;
        try { await post("trash", { action: "empty", batch: b.batch }); show("trash"); } catch (e) { msg.replaceChildren(note(`⚠ ${e.message}`, P.bad)); }
      });
      body.appendChild(h("div", { style: { display: "flex", gap: "8px", alignItems: "center", padding: "6px 8px", background: P.bg2, borderRadius: "6px" } }, [
        h("div", { text: `${b.label || b.batch} — ${b.count} item(s), ${fmtSize(b.size)} — ${when}`, style: { flex: "1" } }), rs, del]));
    }
    const emptyAll = h("button", { type: "button", text: "Empty the whole trash", style: { ...btnStyle(false), color: "#ff8a80" } });
    emptyAll.addEventListener("click", async () => {
      if (!confirm("Permanently delete everything in the trash?")) return;
      try { await post("trash", { action: "empty" }); show("trash"); } catch (e) { msg.replaceChildren(note(`⚠ ${e.message}`, P.bad)); }
    });
    body.append(emptyAll);
  }

  document.body.appendChild(back);
  show("clean");
}

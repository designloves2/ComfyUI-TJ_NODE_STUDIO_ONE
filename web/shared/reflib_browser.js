// reflib_browser.js — the Asset tab: categories | asset thumbnails | viewer, with register,
// replace, save and delete. Modelled on ComfyUI-TJ_NODE's "Reference Asset Browser" node.
// `mountAssetBrowser` returns { el, reload } and has no idea which node hosts it.
import { C } from "../minimax/core_minimax.js";
import { reflib, reflibError, CATEGORIES } from "./reflib_api.js";
import { el, btn, fieldStyle } from "./reflib_dom.js";
import { openGalleryImport } from "./reflib_gallery_import.js";


// In / out trim of an audio asset (seconds). The numbers are the asset's library default
// (settings.start / settings.end; end 0 = to the end); the H3 nodes apply them when the asset is used.
// Drag the yellow in / out handles on the waveform, drag the lit range to move it, click outside to jump
// the nearest handle, double-click to reset. The number fields follow every drag and the waveform
// follows every typed value.
function audioTrimEditor(a, f, src) {
  const duration = a.duration || 0;
  const canvas = el("canvas", { width: 900, height: 160, style: {
    width: "100%", height: "160px", background: "#101010", borderRadius: "4px", cursor: "ew-resize", touchAction: "none" } });
  const info = el("div", { style: { color: C.muted, fontSize: "11px" } });
  const num = (input) => Math.max(0, Number(input.value) || 0);
  const outOf = () => (num(f.end) > 0 ? Math.min(num(f.end), duration) : duration);
  const round = (t) => Math.round(t * 100) / 100;
  let peaks = null, playhead = null;

  const draw = () => {
    info.textContent = `in ${num(f.start).toFixed(2)}s  →  out ${outOf().toFixed(2)}s  (length ${Math.max(0, outOf() - num(f.start)).toFixed(2)}s of ${duration.toFixed(2)}s)`;
    if (!duration) return;
    const g = canvas.getContext("2d"), w = canvas.width, h = canvas.height, ruler = 14;
    g.clearRect(0, 0, w, h);
    const x0 = (num(f.start) / duration) * w, x1 = (outOf() / duration) * w;
    g.fillStyle = "#1d2a38"; g.fillRect(x0, 0, x1 - x0, h - ruler);
    if (peaks) peaks.forEach((pk, i) => {
      const x = (i / peaks.length) * w, bar = Math.max(1, pk * (h - ruler - 14));
      g.fillStyle = x >= x0 && x <= x1 ? "#78beff" : "#3a4654";
      g.fillRect(x, (h - ruler - bar) / 2 + 5, Math.max(1, w / peaks.length - 0.5), bar);
    });
    g.font = "10px sans-serif"; g.textBaseline = "middle";
    const step = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300].find(v => duration / v <= 10) || 600;
    g.fillStyle = "#6b7a88"; g.strokeStyle = "#445";
    for (let t = 0; t <= duration + 1e-6; t += step) {
      const x = (t / duration) * w;
      g.beginPath(); g.moveTo(x, h - ruler); g.lineTo(x, h - ruler + 4); g.stroke();
      g.fillText(`${+t.toFixed(2)}s`, Math.min(x + 2, w - 34), h - 5);
    }
    for (const [x, label, right] of [[x0, `in ${num(f.start).toFixed(2)}s`, false], [x1, `out ${outOf().toFixed(2)}s`, true]]) {
      g.fillStyle = "#ffcf5a"; g.fillRect(x - 1, 0, 2, h - ruler);
      g.fillRect(right ? x - 10 : x, 0, 10, 14);                       // grab tab
      const tw = g.measureText(label).width + 6;
      g.fillStyle = "#000b"; g.fillRect(right ? x - 12 - tw : x + 12, 1, tw, 13);
      g.fillStyle = "#ffcf5a"; g.fillText(label, (right ? x - 12 - tw : x + 12) + 3, 8);
    }
    if (playhead != null) { g.fillStyle = "#ff5a5a"; g.fillRect((playhead / duration) * w - 1, 0, 2, h - ruler); }
  };

  reflib.waveform(a.id).then(r => { if (r.ok) { peaks = r.peaks; draw(); } });
  const rect = () => canvas.getBoundingClientRect();
  const timeAt = (e) => Math.min(1, Math.max(0, (e.clientX - rect().left) / rect().width)) * duration;
  const hit = (e) => {
    const r = rect(), x = e.clientX - r.left;
    const sx = (num(f.start) / duration) * r.width, ex = (outOf() / duration) * r.width;
    if (Math.abs(x - sx) <= 10) return "start";
    if (Math.abs(x - ex) <= 10) return "end";
    return x > sx && x < ex ? "move" : "new";
  };
  const setStart = (t) => { f.start.value = round(Math.min(Math.max(0, t), Math.max(0, outOf() - 0.05))); };
  const setEnd = (t) => { const v = round(Math.max(t, num(f.start) + 0.05)); f.end.value = v >= duration - 0.01 ? 0 : v; };
  let drag = null;
  canvas.addEventListener("pointerdown", (e) => {
    if (!duration) return;
    let mode = hit(e);
    const t = timeAt(e);
    if (mode === "new") mode = t < num(f.start) ? "start" : "end";
    drag = { mode, t0: t, s0: num(f.start), len: outOf() - num(f.start) };
    canvas.setPointerCapture(e.pointerId);
    canvas.dispatchEvent(new PointerEvent("pointermove", { clientX: e.clientX, pointerId: e.pointerId }));
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) { canvas.style.cursor = { start: "ew-resize", end: "ew-resize", move: "grab", new: "crosshair" }[hit(e)]; return; }
    const t = timeAt(e);
    if (drag.mode === "start") setStart(t);
    else if (drag.mode === "end") setEnd(t);
    else {
      const start = Math.min(Math.max(0, drag.s0 + (t - drag.t0)), duration - drag.len);
      f.start.value = round(start);
      const out = round(start + drag.len);
      f.end.value = out >= duration - 0.01 ? 0 : out;
    }
    draw();
  });
  const release = () => { drag = null; };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("dblclick", () => { f.start.value = 0; f.end.value = 0; draw(); });

  const player = new Audio(src);
  let guard = null;
  const stopPlay = () => { player.pause(); if (guard) player.removeEventListener("timeupdate", guard); guard = null; playhead = null; draw(); };
  const play = btn("▶ Range", () => {
    stopPlay();
    player.currentTime = num(f.start); player.play();
    guard = () => { playhead = player.currentTime; if (player.currentTime >= outOf()) stopPlay(); else draw(); };
    player.addEventListener("timeupdate", guard);
  }, { padding: "3px 8px" });
  play.title = "play only the in–out range";
  const stopBtn = btn("■", stopPlay, { padding: "3px 8px" });
  const whole = btn("Whole", () => { f.start.value = 0; f.end.value = 0; draw(); }, { padding: "3px 8px" });
  // typed values: follow on every keystroke, tidy up (end after start, inside the clip) when done
  [f.start, f.end].forEach(i => i.addEventListener("input", draw));
  f.start.addEventListener("change", () => {
    f.start.value = round(Math.min(num(f.start), Math.max(0, (duration || num(f.start)) - 0.05)));
    draw();
  });
  f.end.addEventListener("change", () => {
    let v = num(f.end);
    if (duration && v >= duration - 0.01) v = 0;
    else if (v > 0 && v < num(f.start) + 0.05) v = round(num(f.start) + 0.05);
    f.end.value = v;
    draw();
  });
  const numStyle = { ...fieldStyle, width: "64px", padding: "3px 4px" };
  Object.assign(f.start.style, numStyle); Object.assign(f.end.style, numStyle);
  const lbl = (t) => el("span", { text: t, style: { color: C.muted, whiteSpace: "nowrap" } });
  const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "4px", border: `1px solid ${C.border}`,
    borderRadius: "6px", padding: "6px", background: C.bg2 } },
    canvas,
    el("div", { style: { display: "flex", gap: "4px", alignItems: "center" } }, lbl("in(s)"), f.start, lbl("out(s)"), f.end, whole, play, stopBtn),
    info);
  wrap.stopPlay = stopPlay;
  draw();
  return wrap;
}

// Cards of a trimmed audio asset show the kept part: the waveform is dimmed outside the range, a yellow
// range bar runs along the bottom of the picture and an "in–out" tag sits in the corner.
function audioCutOverlay(a) {
  const start = a.settings?.start || 0, end = a.settings?.end || 0;
  if (a.kind !== "audio" || !a.duration || (!start && !end)) return { nodes: [], title: "" };
  const out = end > 0 ? Math.min(end, a.duration) : a.duration;
  const l = (start / a.duration) * 100, r = (out / a.duration) * 100;
  const dim = (css) => el("div", { style: { position: "absolute", top: "0", bottom: "0", background: "rgba(0,0,0,0.72)", pointerEvents: "none", ...css } });
  return {
    nodes: [
      dim({ left: "0", width: `${l}%` }), dim({ left: `${r}%`, right: "0" }),
      el("div", { style: { position: "absolute", left: "0", right: "0", bottom: "0", height: "6px", background: "rgba(0,0,0,0.65)", pointerEvents: "none" } },
        el("i", { style: { position: "absolute", top: "0", bottom: "0", left: `${l}%`, width: `${r - l}%`, background: "#ffcf5a" } })),
      el("div", { text: `✂ ${start.toFixed(1)}–${out.toFixed(1)}s`, style: { position: "absolute", top: "3px", right: "3px",
        background: "rgba(0,0,0,0.8)", color: "#ffcf5a", borderRadius: "3px", padding: "0 5px", fontSize: "10px", pointerEvents: "none" } }),
    ],
    title: `trim ${start.toFixed(2)}s – ${out.toFixed(2)}s`,
  };
}

function column(title) {
  const head = el("div", { text: title, style: {
    padding: "5px 9px", background: C.bg2, borderBottom: `1px solid ${C.border}`, fontWeight: "700", fontSize: "12px", color: C.muted } });
  const body = el("div", { style: { flex: "1", minHeight: "0", overflow: "auto", padding: "6px" } });
  const box = el("div", { style: {
    display: "flex", flexDirection: "column", minHeight: "0", border: `1px solid ${C.border}`,
    borderRadius: "8px", background: C.bg1, overflow: "hidden" } }, head, body);
  return { box, body };
}

export function mountAssetBrowser({ height }) {
  const CARD_KEY = "tj_reflib_card_cols";      // cards per row: 4 (small) / 3 / 2 (large)
  let cardCols = 4;
  try { const n = Number(localStorage.getItem(CARD_KEY)); if (n >= 2 && n <= 4) cardCols = Math.round(n); } catch { /* storage blocked */ }
  const S = { assets: [], category: "all", query: "", id: null, detail: null, form: null, armed: null };

  const search = el("input", { type: "text", placeholder: "Search name / tag / ID", style: { ...fieldStyle, flex: "1" } });
  const fileAdd = el("input", { type: "file", multiple: true, style: { display: "none" } });
  const fileRep = el("input", { type: "file", style: { display: "none" } });
  const msg = el("div", { style: { minHeight: "16px", fontSize: "11px", color: C.muted } });
  const say = (text, err = false) => { msg.textContent = text || ""; msg.style.color = err ? C.err : C.ok; };

  // "+ Register" opens a two-way menu: upload from disk, or pick from this pack's galleries.
  const menuItem = (text, onClick) => {
    const i = el("div", { text, style: { padding: "7px 14px", cursor: "pointer", whiteSpace: "nowrap" } });
    i.addEventListener("mouseenter", () => { i.style.background = C.bg3; });
    i.addEventListener("mouseleave", () => { i.style.background = "transparent"; });
    i.addEventListener("click", () => { menuBox.style.display = "none"; onClick(); });
    return i;
  };
  const menuBox = el("div", { style: {
    display: "none", position: "absolute", top: "100%", left: "0", marginTop: "4px", zIndex: "20", background: C.bg2,
    border: `1px solid ${C.border}`, borderRadius: "6px", boxShadow: "0 6px 20px rgba(0,0,0,0.5)", overflow: "hidden" } },
    menuItem("Upload files…", () => fileAdd.click()),
    menuItem("Image from Gallery…", () => openGalleryImport(async (last) => { await reload(); if (last != null) select(last); })));
  const registerMenu = el("div", { style: { position: "relative" } }, btn("+ Register ▾", () => {
    menuBox.style.display = menuBox.style.display === "none" ? "block" : "none";
  }), menuBox);
  document.addEventListener("mousedown", (e) => { if (!registerMenu.contains(e.target)) menuBox.style.display = "none"; });

  const cats = column("Categories");
  const list = column("Assets");
  const view = column("Viewer");
  const btnReplace = btn("Replace", () => fileRep.click());
  const btnSave = btn("Save", () => save());
  const btnDelete = btn("Delete", () => remove(), { color: C.err, borderColor: C.err });
  const actions = el("div", { style: {
    display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px", padding: "6px", borderTop: `1px solid ${C.border}` } },
    btnReplace, btnSave, btnDelete);
  view.box.appendChild(actions);

  // Card size: three steps, 4 / 3 / 2 cards per row (slider right = bigger cards); remembered per browser.
  const sizeLabel = el("span", { text: `${cardCols} per row`, style: { color: C.muted, minWidth: "62px", textAlign: "right" } });
  const sizeSlider = el("input", { type: "range", min: "1", max: "3", step: "1", value: String(5 - cardCols),
    style: { flex: "1", accentColor: C.lime } });
  sizeSlider.addEventListener("input", () => {
    cardCols = 5 - Number(sizeSlider.value);
    sizeLabel.textContent = `${cardCols} per row`;
    try { localStorage.setItem(CARD_KEY, String(cardCols)); } catch { /* storage blocked */ }
    drawList();
  });
  list.box.appendChild(el("div", { style: {
    display: "flex", alignItems: "center", gap: "8px", padding: "6px 9px", borderTop: `1px solid ${C.border}`, color: C.muted } },
    el("span", { text: "Card size" }), sizeSlider, sizeLabel));

  const cols = el("div", { style: {
    display: "grid", gridTemplateColumns: "150px 1fr 1.2fr", gap: "8px", flex: "1", minHeight: "0" } },
    cats.box, list.box, view.box);
  const root = el("div", { style: {
    display: "flex", flexDirection: "column", gap: "8px", width: "100%", height: `${height}px`, flexShrink: "0",
    boxSizing: "border-box", color: C.text, fontSize: "12px" } },
    el("div", { style: { display: "flex", gap: "6px" } }, search,
      registerMenu, btn("Refresh", () => reload()), fileAdd, fileRep),
    cols, msg);

  function drawCats() {
    cats.body.replaceChildren();
    const counts = { all: S.assets.length };
    for (const a of S.assets) counts[a.category] = (counts[a.category] || 0) + 1;
    for (const c of ["all", ...CATEGORIES]) {
      const on = S.category === c;
      const row = el("div", { style: {
        padding: "6px 9px", borderRadius: "6px", cursor: "pointer", display: "flex", justifyContent: "space-between",
        background: on ? C.lime : "transparent", color: on ? "#fff" : C.text } },
        el("span", { text: c === "all" ? "All" : c }), el("span", { text: String(counts[c] || 0) }));
      row.addEventListener("click", () => { S.category = c; drawCats(); drawList(); });
      cats.body.appendChild(row);
    }
  }

  function drawList() {
    list.body.replaceChildren();
    const grid = el("div", { style: { display: "grid", gridTemplateColumns: `repeat(${cardCols}, 1fr)`, gap: "8px" } });
    for (const a of S.assets) {
      if (S.category !== "all" && a.category !== S.category) continue;
      if (S.query && !`${a.name} ${(a.tags || []).join(" ")} ${a.id}`.toLowerCase().includes(S.query)) continue;
      const on = a.id === S.id;
      const cut = audioCutOverlay(a);
      const card = el("div", { title: `#${a.id} ${a.name}${cut.title ? `  ·  ${cut.title}` : ""}`, style: {
        position: "relative", cursor: "pointer", borderRadius: "8px", overflow: "hidden", background: C.bg2,
        border: `1px solid ${on ? C.lime : C.border}`, boxShadow: on ? `0 0 0 1px ${C.lime}` : "none" } },
        el("div", { style: { position: "relative" } },
          el("img", { src: reflib.thumbUrl(a), loading: "lazy", style: {
            width: "100%", aspectRatio: "1 / 1", objectFit: "contain", display: "block", background: "#000" } }),
          ...cut.nodes),
        el("div", { text: a.kind, style: {
          position: "absolute", top: "3px", left: "3px", background: "rgba(0,0,0,0.65)", color: "#fff",
          borderRadius: "4px", padding: "0 5px", fontSize: "10px" } }),
        el("div", { text: `#${a.id} ${a.name}`, style: {
          padding: "3px 6px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: "11px" } }));
      card.addEventListener("click", () => select(a.id));
      grid.appendChild(card);
    }
    list.body.appendChild(grid.children.length ? grid
      : el("div", { text: "No assets here. Use “+ Register” to add files.", style: { color: C.muted, padding: "6px" } }));
  }

  function drawView() {
    view.body.replaceChildren();
    S.stopPlay?.(); S.stopPlay = null;
    const d = S.detail;
    if (!d) { view.body.appendChild(el("div", { text: "Pick an asset on the left.", style: { color: C.muted, padding: "6px" } })); return; }
    const a = d.asset;
    const src = reflib.fileUrl(a);
    let media;
    const mediaStyle = { width: "100%", maxHeight: "432px", objectFit: "contain", background: "#000", borderRadius: "6px" };
    if (a.kind === "image") media = el("img", { src, style: mediaStyle });
    else if (a.kind === "video") media = el("video", { src, controls: true, loop: true, muted: true, style: mediaStyle });
    else if (a.kind === "audio") media = null;     // waveform editor + compact player, built below
    else media = el("div", { style: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" } },
      (a.members || []).map(m => el("img", { src: reflib.memberThumbUrl(m), style: { ...mediaStyle, aspectRatio: "1 / 1" } })));

    const f = {
      name: el("input", { type: "text", value: a.name, style: fieldStyle }),
      category: el("select", { style: fieldStyle }, CATEGORIES.map(c => el("option", { value: c, text: c, selected: c === a.category }))),
      sub: el("input", { type: "text", value: a.subcategory || "", placeholder: "sub-category (folder)", style: fieldStyle }),
      tags: el("input", { type: "text", value: (a.tags || []).join(","), placeholder: "tag1,tag2", style: fieldStyle }),
      note: el("input", { type: "text", value: a.note || "", style: fieldStyle }),
      mp: el("input", { type: "number", step: "0.1", min: "0", value: a.settings?.mp ?? 0, style: fieldStyle }),
      start: el("input", { type: "number", step: "0.01", min: "0", value: a.settings?.start ?? 0 }),
      end: el("input", { type: "number", step: "0.01", min: "0", value: a.settings?.end ?? 0, title: "0 = to the end" }),
    };
    S.form = f;
    if (a.kind === "audio") {
      const trim = audioTrimEditor(a, f, src);
      S.stopPlay = trim.stopPlay;
      media = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } }, trim,
        el("audio", { src, controls: true, style: { width: "100%", height: "32px" } }));
    }
    const facts = [`#${a.id}`, a.kind, a.width ? `${a.width}x${a.height}` : null, a.duration ? `${a.duration.toFixed(1)}s` : null,
      a.size ? `${(a.size / 1048576).toFixed(2)} MB` : null].filter(Boolean).join("  ·  ");
    const used = d.projects?.length ? `Projects: ${d.projects.map(p => p.name).join(", ")}` : "Not used by any project";
    const lab = (t) => el("span", { text: t, style: { color: C.muted } });
    view.body.appendChild(el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } },
      media,
      el("div", { text: facts, style: { color: C.muted, fontSize: "11px" } }),
      el("div", { text: a.rel_path || `Set (${(a.members || []).length} images)`, style: { color: C.muted, fontSize: "11px" } }),
      el("div", { style: { display: "grid", gridTemplateColumns: "76px 1fr", gap: "4px 6px", alignItems: "center" } },
        lab("Name"), f.name, lab("Category"), f.category, lab("Sub"), f.sub, lab("Tags"), f.tags,
        lab("Note"), f.note, ...(a.kind === "audio" ? [] : [lab("mp (cap)"), f.mp])),
      el("div", { text: used, style: { color: C.muted, fontSize: "11px" } })));
  }

  async function reload() {
    const r = await reflib.list();
    if (!r.ok) {
      S.assets = [];
      say(`Asset library unavailable — ${reflibError(r)}. Is ComfyUI-TJ_NODE installed and up to date?`, true);
    } else {
      S.assets = r.assets || [];
    }
    if (S.id != null && !S.assets.some(a => a.id === S.id)) { S.id = null; S.detail = null; }
    drawCats(); drawList(); drawView();
  }

  async function select(id) {
    S.id = id; resetDelete();
    const r = await reflib.detail(id);
    S.detail = r.ok ? r : null;
    say(r.ok ? "" : reflibError(r), !r.ok);
    drawList(); drawView();
  }

  async function upload(files) {
    const category = S.category === "all" ? "etc" : S.category;
    let ok = 0, dup = 0, last = null;
    for (const file of files) {
      const r = await reflib.upload(file, { category });
      if (!r.ok) { say(`${file.name}: ${reflibError(r)}`, true); continue; }
      r.duplicate ? dup++ : ok++; last = r.asset.id;
    }
    fileAdd.value = "";
    if (ok || dup) say(`Registered ${ok}${dup ? `, already there ${dup}` : ""} (${category})`);
    await reload();
    if (last != null) select(last);
  }

  async function replaceFile(file) {
    if (!file || S.id == null) return;
    const r = await reflib.replace(S.id, file);
    fileRep.value = "";
    say(r.ok ? `#${S.id} file replaced (ID kept)` : reflibError(r), !r.ok);
    if (r.ok) { await reload(); select(S.id); }
  }

  async function save() {
    const f = S.form;
    if (S.id == null || !f) return;
    const settings = {};
    if (S.detail.asset.kind === "audio") {
      settings.start = Math.max(0, Number(f.start.value) || 0);
      settings.end = Math.max(0, Number(f.end.value) || 0);
      if (settings.end > 0 && settings.end <= settings.start) { say("out must be later than in (0 = to the end)", true); return; }
    } else {
      settings.mp = Number(f.mp.value) || 0;
    }
    const r = await reflib.update(S.id, {
      name: f.name.value, category: f.category.value, subcategory: f.sub.value,
      tags: f.tags.value.split(",").map(t => t.trim()).filter(Boolean), note: f.note.value,
      settings,
    });
    say(r.ok ? `#${S.id} saved` : reflibError(r), !r.ok);
    if (r.ok) { await reload(); select(S.id); }
  }

  let armTimer = null;
  function resetDelete() {
    clearTimeout(armTimer); S.armed = null;
    btnDelete.textContent = "Delete"; btnDelete.style.background = C.bg2; btnDelete.style.color = C.err;
  }
  async function remove() {
    if (S.id == null) return;
    const used = S.detail?.projects?.length || 0;
    if (!S.armed) {
      S.armed = used ? "force" : "plain";
      btnDelete.style.background = C.err; btnDelete.style.color = "#fff";
      btnDelete.textContent = used ? `Also remove from ${used} project(s)? Click again` : "Really delete? Click again";
      armTimer = setTimeout(resetDelete, 5000);
      return;
    }
    const force = S.armed === "force";
    resetDelete();
    const r = await reflib.remove(S.id, force);
    say(r.ok ? `#${S.id} deleted` : reflibError(r), !r.ok);
    if (r.ok) { S.id = null; S.detail = null; await reload(); }
  }

  search.addEventListener("input", () => { S.query = search.value.toLowerCase(); drawList(); });
  fileAdd.addEventListener("change", () => upload(Array.from(fileAdd.files)));
  fileRep.addEventListener("change", () => replaceFile(fileRep.files[0]));

  drawCats(); drawList(); drawView();
  // Leaving the tab must not leave a track playing behind the generation screen.
  const stop = () => { S.stopPlay?.(); root.querySelectorAll("audio").forEach(x => x.pause()); };
  return { el: root, reload, stop };
}

// reflib_gallery_import.js — "Image from Gallery": register files that already exist in this
// pack's galleries into the asset library, without downloading and re-uploading by hand.
// Tabs: every image tool's gallery (INPUT / OUTPUT / Krea2 / ...), the H3 video gallery and the
// MusicMaker playlist. Click cards to select several, then register them in one go.
// The file is read through ComfyUI's /view and sent to the library's own upload route.
import { C, API } from "../minimax/core_minimax.js";
import { IMAGE_GALLERY_TOOLS } from "./ui_image_gallery_picker.js";
import { setThumb, wireCacheButton } from "./gallery_thumb.js";
import { mediaKey, isBlurred, attachSensitiveToggle, wireRevealButton } from "./ui_sensitive_media.js";
import { reflib, reflibError, CATEGORIES } from "./reflib_api.js";
import { el, btn, fieldStyle } from "./reflib_dom.js";

const BRAND = C.lime;
const PAGE = 60;
// kind decides the default category in the register bar.
const DEFAULT_CATEGORY = { image: "character", video: "video", audio: "music" };

const TABS = [
  ...IMAGE_GALLERY_TOOLS.map(t => ({ ...t, kind: "image" })),
  // The video picker's INPUT / OUTPUT tabs (videos only, same folder navigation), then H3's own clips.
  { id: "inputvideo", label: "INPUT Video", kind: "video", sharedVideo: "input" },
  { id: "outputvideo", label: "OUTPUT Video", kind: "video", sharedVideo: "output" },
  { id: "h3video", label: "H3 Video", kind: "video" },
  { id: "music", label: "MusicMaker", kind: "audio" },
];

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

async function fetchFolders(root) {
  try { return (await getJson(`/tj_shared/gallery_folders?root=${root}`)).folders || []; } catch { return []; }
}

/** One page of a tab: { rows, total }. Rows carry filename / subfolder / type (+ title for audio). */
async function fetchPage(tab, offset, folder, musicSub) {
  try {
    const sf = encodeURIComponent(folder || "");
    if (tab.kind === "image") {
      const url = tab.input ? `${tab.api}/input_gallery?offset=${offset}&limit=${PAGE}&subfolder=${sf}`
        : tab.output ? `${tab.api}/output_gallery?offset=${offset}&limit=${PAGE}&subfolder=${sf}`
        : `${tab.api}/gallery?offset=${offset}&limit=${PAGE}&subfolder=${encodeURIComponent(tab.subfolder)}`;
      const d = await getJson(url);
      const type = tab.input ? "input" : "output";
      return { rows: (d.images || []).map(r => ({ ...r, type })), total: d.total || 0 };
    }
    if (tab.sharedVideo) {
      const d = await getJson(`/tj_shared/${tab.sharedVideo}_gallery_video?offset=${offset}&limit=${PAGE}&subfolder=${sf}`);
      return { rows: (d.images || []).map(r => ({ ...r, type: tab.sharedVideo })), total: d.total || 0 };
    }
    if (tab.kind === "video") {
      const d = await getJson(`${API}/videos?offset=${offset}&limit=${PAGE}`);
      return { rows: (d.videos || []).map(r => ({ ...r, type: "output" })), total: d.total || (d.videos || []).length };
    }
    const d = await getJson(`/music_one/playlist?offset=${offset}&limit=${PAGE}&sort=newest&subfolder=${encodeURIComponent(musicSub)}`);
    return { rows: (d.tracks || []).map(r => ({ ...r, type: "output", subfolder: r.subfolder || musicSub })), total: d.total || (d.tracks || []).length };
  } catch { return { rows: [], total: 0 }; }
}

const viewUrl = (r) =>
  `/view?filename=${encodeURIComponent(r.filename)}&subfolder=${encodeURIComponent(r.subfolder || "")}&type=${r.type}`;
const coverUrl = (r) =>
  `/view?filename=${encodeURIComponent(r.cover)}&subfolder=${encodeURIComponent((r.subfolder || "") + "/covers")}&type=output&t=${r.mtime || ""}`;
const rowKey = (r) => `${r.type}|${r.subfolder || ""}|${r.filename}`;

function clock(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * @param onDone(lastAssetId | null, count)  called after files were registered
 * @param options  optional, for callers with their own limits (the asset browser node):
 *   maxImages        at most this many images can be selected; with it, 2..maxImages images can also be
 *                    registered as one set ("Register as set")
 *   singleVideoAudio video / audio tabs select one file at a time, and image vs video/audio picks never mix
 */
export function openGalleryImport(onDone, options = {}) {
  const { maxImages = 0, singleVideoAudio = false } = options;
  let tab = TABS[0];
  let folder = "";
  let offset = 0, total = 0, loading = false, busy = false;
  let musicSub = "one_music";
  const picked = new Map();          // rowKey -> row, across tab switches
  let previewing = null;             // the <audio> playing now
  const stopPreview = () => { if (previewing) { try { previewing.pause(); } catch { /* already gone */ } previewing = null; } };

  const ov = el("div", { style: { position: "fixed", inset: "0", background: "rgba(0,0,0,0.75)", zIndex: "100000",
    display: "flex", alignItems: "center", justifyContent: "center" } });
  const box = el("div", { style: { background: C.bg1, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "12px",
    width: "min(1056px, 96vw)", height: "min(840px, 92vh)", minHeight: "0", boxShadow: "0 10px 40px rgba(0,0,0,0.6)",
    display: "flex", flexDirection: "column", gap: "10px", color: C.text } });

  const closeBtn = btn("✕", () => close(), { background: "#c0392b", color: "#fff", border: "none", padding: "5px 10px" });
  // Same two header buttons as the image gallery picker: build the missing thumbnails, and peek at hidden items.
  const cacheBtn = btn("⚡ Cache", () => {}, { fontSize: "12px", padding: "5px 10px" });
  wireCacheButton(cacheBtn, () => ({
    root: tab.input ? "input" : "output",
    subfolder: tab.input || tab.output ? folder : tab.subfolder,
    recursive: !tab.input && !tab.output,
  }));
  const revealBtn = btn("", () => {}, { fontSize: "12px", padding: "5px 10px" });
  wireRevealButton(revealBtn);
  const top = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" } },
    el("div", { text: "🖼 Register from a gallery", style: { color: "#fff", fontSize: "14px", fontWeight: "700", flex: "1" } }), cacheBtn, revealBtn, closeBtn);

  const tabBar = el("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap", flexShrink: "0" } });
  function drawTabs() {
    tabBar.replaceChildren(...TABS.map(t => {
      const on = t.id === tab.id;
      return btn(t.label, () => { if (t.id !== tab.id) { tab = t; folder = ""; if (singleVideoAudio) dropOtherKind(); reset(); } }, {
        fontSize: "11px", padding: "5px 10px", borderRadius: "14px",
        background: on ? BRAND : C.bg2, color: on ? "#fff" : C.text, border: `1px solid ${on ? BRAND : C.border}`, fontWeight: on ? "700" : "400" });
    }));
  }

  const folderSel = el("select", { style: { ...fieldStyle, width: "auto", display: "none", flexShrink: "0" } });
  folderSel.addEventListener("change", () => { folder = folderSel.value; reset(); });
  async function drawFolders() {
    cacheBtn.style.display = tab.kind === "image" ? "" : "none";   // thumbnails are built for images only
    const root = tab.sharedVideo || (tab.input ? "input" : tab.output ? "output" : "");
    if (!root) { folderSel.style.display = "none"; return; }
    folderSel.style.display = "block";
    folderSel.replaceChildren(el("option", { value: "", text: tab.label }));
    const add = (f, depth) => {
      folderSel.append(el("option", { value: f.path, text: `${"  ".repeat(depth)}${f.name}` }));
      (f.children || []).forEach(c => add(c, depth + 1));
    };
    (await fetchFolders(root)).forEach(f => add(f, 0));
    folderSel.value = folder;
  }

  const grid = el("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
    gridAutoRows: "min-content", gap: "8px", overflowY: "auto", flex: "1", minHeight: "0", alignContent: "start" } });
  const status = el("div", { style: { color: C.muted, fontSize: "11px", flexShrink: "0" } });
  const moreBtn = btn("Load more", () => loadMore(), { display: "none", flexShrink: "0" });

  // Register bar
  const cat = el("select", { style: { ...fieldStyle, width: "auto" } }, CATEGORIES.map(c => el("option", { value: c, text: c })));
  const sub = el("input", { type: "text", placeholder: "sub-category (optional)", style: { ...fieldStyle, width: "190px" } });
  const countLabel = el("span", { style: { color: C.muted } });
  const goBtn = btn("Register selected", () => register(), { background: BRAND, color: "#fff", border: "none", fontWeight: "700" });
  const setBtn = btn("Register as set", () => registerSet(), { background: C.bg2, color: C.text, border: `1px solid ${BRAND}`, fontWeight: "700", display: "none" });
  const clearBtn = btn("Clear", () => { picked.clear(); grid.querySelectorAll("[data-sel]").forEach(c => mark(c, false)); updateBar(); });
  const bar = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0",
    paddingTop: "8px", borderTop: `1px solid ${C.border}` } },
    el("span", { text: "Category", style: { color: C.muted } }), cat, sub, countLabel, el("span", { style: { flex: "1" } }), clearBtn, setBtn, goBtn);

  box.append(top, tabBar, folderSel, grid, status, moreBtn, bar);
  ov.append(box);

  function updateBar() {
    countLabel.textContent = picked.size ? `${picked.size} selected` : "Click cards to select";
    goBtn.disabled = busy || !picked.size;
    goBtn.style.opacity = goBtn.disabled ? "0.5" : "1";
    // A set needs 2..maxImages images and nothing else selected.
    const n = picked.size, imagesOnly = [...picked.values()].every(r => r.kind === "image");
    setBtn.style.display = maxImages && imagesOnly && n >= 2 && n <= maxImages ? "" : "none";
    setBtn.disabled = busy;
    // The category follows the kind of what is selected, unless it has been chosen by hand.
    const kinds = new Set([...picked.values()].map(r => r.kind));
    if (kinds.size === 1 && !cat.dataset.touched) cat.value = DEFAULT_CATEGORY[[...kinds][0]];
  }
  cat.addEventListener("change", () => { cat.dataset.touched = "1"; });

  function mark(cell, on) {
    cell.style.borderColor = on ? BRAND : C.border;
    cell.style.boxShadow = on ? `0 0 0 1px ${BRAND}` : "none";
  }

  function toggle(row, cell) {
    const k = rowKey(row);
    if (picked.has(k)) { picked.delete(k); mark(cell, false); updateBar(); return; }
    if (maxImages && row.kind === "image" && [...picked.values()].filter(r => r.kind === "image").length >= maxImages) {
      status.textContent = `At most ${maxImages} images can be selected`;
      return;
    }
    // One video / audio file at a time: the new card replaces the old pick.
    if (singleVideoAudio && row.kind !== "image") {
      for (const [pk, r] of [...picked]) if (r.kind !== "image") picked.delete(pk);
      grid.querySelectorAll("[data-sel]").forEach(c => mark(c, false));
    }
    picked.set(k, row); mark(cell, true);
    updateBar();
  }

  // Leaving an image tab drops video / audio picks and the other way round.
  function dropOtherKind() {
    const toImage = tab.kind === "image";
    for (const [pk, r] of [...picked]) if ((r.kind === "image") !== toImage) picked.delete(pk);
    updateBar();
  }

  function cardFor(row) {
    const cell = el("div", { style: { position: "relative", borderRadius: "6px", overflow: "hidden", cursor: "pointer",
      border: `1px solid ${C.border}`, background: "#000" } });
    cell.dataset.sel = "1";
    let media;                                   // what the hide toggle blurs
    if (row.kind === "image") {
      const im = el("img", { style: { width: "100%", aspectRatio: "1 / 1", objectFit: "contain", display: "block" } });
      setThumb(im, row, row.type);
      cell.append(im);
      media = im;
    } else if (row.kind === "video") {
      const vid = el("video", { src: viewUrl(row), muted: true, playsInline: true, preload: "metadata",
        style: { width: "100%", aspectRatio: "1 / 1", objectFit: "contain", display: "block", background: "#000" } });
      cell.addEventListener("mouseenter", () => { try { vid.currentTime = 0; vid.play().catch(() => {}); } catch { /* not loaded yet */ } });
      cell.addEventListener("mouseleave", () => vid.pause());
      cell.append(vid);
      media = vid;
    } else {
      // Track card: cover art when it has one, a note otherwise; title and length underneath.
      cell.style.background = C.bg2;
      const art = el("div", { style: { width: "100%", aspectRatio: "1 / 1", background: "#000", display: "flex",
        alignItems: "center", justifyContent: "center", fontSize: "34px", color: BRAND } });
      if (row.cover) {
        art.style.backgroundImage = `url("${coverUrl(row)}")`;
        art.style.backgroundSize = "contain"; art.style.backgroundRepeat = "no-repeat"; art.style.backgroundPosition = "center";
      } else art.textContent = "♪";
      const dur = row.seconds ? el("span", { text: clock(row.seconds), style: { position: "absolute", right: "4px", bottom: "4px",
        background: "rgba(0,0,0,0.7)", color: "#fff", borderRadius: "3px", padding: "0 5px", fontSize: "10px" } }) : null;
      art.style.position = "relative";
      if (dur) art.append(dur);
      // Same ▶ preview as the audio picker; one track plays at a time.
      const audio = el("audio", { preload: "none", src: viewUrl(row) });
      const play = el("button", { type: "button", text: "▶", title: "Preview", style: { position: "absolute", left: "4px", top: "4px",
        zIndex: "3", cursor: "pointer", fontSize: "11px", width: "26px", height: "26px", borderRadius: "50%",
        border: `1px solid ${C.border}`, background: C.bg1, color: C.text } });
      play.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!audio.paused) { audio.pause(); return; }
        stopPreview();
        audio.currentTime = 0;
        audio.play().then(() => { previewing = audio; }).catch(() => {});
      });
      audio.addEventListener("play", () => { play.textContent = "⏸"; });
      audio.addEventListener("pause", () => { play.textContent = "▶"; });
      audio.addEventListener("ended", () => { play.textContent = "▶"; if (previewing === audio) previewing = null; });
      art.append(audio, play);
      media = art;
      cell.append(art, el("div", { text: row.title || row.filename, title: row.title || row.filename, style: {
        padding: "3px 6px 0", fontSize: "11px", color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }));
    }
    if (row.kind !== "audio") cell.append(el("div", { text: row.filename, title: row.filename, style: { padding: "2px 5px", fontSize: "10px", background: C.bg2,
      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: C.muted } }));
    mark(cell, picked.has(rowKey(row)));
    // 눈가리기 — the same hidden set every gallery in the app reads and writes.
    const sensKey = mediaKey(row.filename, row.subfolder || "");
    attachSensitiveToggle(cell, media, sensKey, "br");
    cell.addEventListener("click", () => {
      if (isBlurred(sensKey)) {
        status.textContent = "Hidden — click 👁 on the tile to reveal it first.";
        setTimeout(() => { status.textContent = total ? `${offset} / ${total}` : ""; }, 2200);
        return;
      }
      toggle(row, cell);
    });
    return cell;
  }

  function reset() {
    offset = 0; total = 0;
    stopPreview();
    grid.replaceChildren();
    drawTabs(); drawFolders();
    status.textContent = "Loading…";
    loadMore();
  }

  async function loadMore() {
    if (loading) return;
    loading = true;
    const t = tab, f = folder;
    const d = await fetchPage(t, offset, f, musicSub);
    if (t.id !== tab.id || f !== folder) { loading = false; return; }
    total = d.total;
    d.rows.forEach(r => grid.append(cardFor({ ...r, kind: t.kind })));
    offset += d.rows.length;
    status.textContent = d.rows.length || total ? `${offset} / ${total}` : "Nothing in this tab yet.";
    moreBtn.style.display = offset < total ? "block" : "none";
    loading = false;
  }

  async function register() {
    if (busy || !picked.size) return;
    busy = true; updateBar();
    const rows = [...picked.values()];
    let ok = 0, dup = 0, last = null;
    for (const [i, row] of rows.entries()) {
      status.textContent = `Registering ${i + 1} / ${rows.length} — ${row.filename}`;
      try {
        const blob = await (await fetch(viewUrl(row))).blob();
        const name = (row.title || row.filename).replace(/\.[^.]+$/, "");
        const r = await reflib.upload(new File([blob], row.filename, { type: blob.type }),
          { category: cat.value, subcategory: sub.value.trim(), name });
        if (!r.ok) { status.textContent = `${row.filename}: ${reflibError(r)}`; continue; }
        r.duplicate ? dup++ : ok++; last = r.asset.id;
        picked.delete(rowKey(row));
      } catch (e) {
        status.textContent = `${row.filename}: ${e?.message || e}`;
      }
    }
    busy = false;
    grid.querySelectorAll("[data-sel]").forEach(c => mark(c, false));
    updateBar();
    status.textContent = `Registered ${ok}${dup ? `, already in the library ${dup}` : ""}${picked.size ? ` — ${picked.size} failed, still selected` : ""}`;
    onDone?.(last, ok + dup);
    if (!picked.size) close();
  }

  // The picked images (in click order) become one library set; each image is registered first.
  async function registerSet() {
    if (busy) return;
    const rows = [...picked.values()];
    if (rows.length < 2 || rows.length > maxImages || rows.some(r => r.kind !== "image")) return;
    busy = true; updateBar();
    const ids = [];
    for (const [i, row] of rows.entries()) {
      status.textContent = `Registering ${i + 1} / ${rows.length} — ${row.filename}`;
      try {
        const blob = await (await fetch(viewUrl(row))).blob();
        const r = await reflib.upload(new File([blob], row.filename, { type: blob.type }),
          { category: cat.value, subcategory: sub.value.trim(), name: row.filename.replace(/\.[^.]+$/, "") });
        if (!r.ok) { status.textContent = `${row.filename}: ${reflibError(r)}`; break; }
        ids.push(r.asset.id);
      } catch (e) {
        status.textContent = `${row.filename}: ${e?.message || e}`;
        break;
      }
    }
    if (ids.length === rows.length) {
      const s = await reflib.createSet({ name: `${rows[0].filename.replace(/\.[^.]+$/, "")}_set`,
        category: cat.value, subcategory: sub.value.trim(), image_ids: ids });
      if (s.ok) {
        busy = false;
        onDone?.(s.asset.id, 1);
        close();
        return;
      }
      status.textContent = `Set: ${reflibError(s)}`;
    }
    busy = false; updateBar();
  }

  // New folders can appear while the dialog is open (another tool saving into one); skipped while the
  // dropdown has focus so its popup is not rebuilt under the user.
  const folderPoll = setInterval(() => { if (document.activeElement !== folderSel) drawFolders(); }, 5000);

  function close() {
    stopPreview();
    clearInterval(folderPoll);
    document.removeEventListener("keydown", onKey);
    ov.remove();
  }
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  ov.addEventListener("mousedown", (e) => { if (e.target === ov) close(); });

  document.body.append(ov);
  updateBar();
  fetch("/music_one/config").then(r => r.json()).then(c => { musicSub = (c.save_subfolder || "one_music").trim() || "one_music"; }).catch(() => {});
  reset();
}

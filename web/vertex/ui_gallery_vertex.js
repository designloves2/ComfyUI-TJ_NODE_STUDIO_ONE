// ui_gallery_vertex.js — gallery for Vertex Image ONE STUDIO (TJ)
// Built from H3's image gallery: same cards, ⓘ hover, blur/reveal, Select + bulk delete,
// full-screen Prompt View (←/→/Esc, wheel zoom, drag pan, double-click fit), Reuse Setting / Prompt Copy, Cache,
// Tools, Open folder, pick mode. H3's Deblur / RTX VSR post-process bar is H3-only and left out.
import { C, BRAND, el, clear, SUBFOLDER, modelName } from "./core_vertex.js";
import { setThumb, wireCacheButton } from "../shared/gallery_thumb.js";
import { button } from "../klein/ui_common.js";
import { galleryPageSize, fetchFirst, mergeUnique, loadMoreButton } from "../shared/gallery_more.js";
import { wireGalleryTools } from "../shared/gallery_tools.js";
import { listImages, revealOutputFolder, deleteImage, copyOutputToInput } from "./api_vertex.js";
import { mediaKey, isBlurred, attachSensitiveToggle, makeSensitiveControl, wireRevealButton } from "../shared/ui_sensitive_media.js";
import { mountGalleryLayout } from "../shared/gallery_layout.js";
import { attachPanZoom } from "../shared/pan_zoom.js";

// Named aspect ratios a real render is actually likely to land on — same table the video
// gallery's own card badge uses.
const NAMED_RATIOS = [
  ["1:1", 1], ["16:9", 16 / 9], ["9:16", 9 / 16], ["4:3", 4 / 3], ["3:4", 3 / 4],
  ["21:9", 21 / 9], ["3:2", 3 / 2], ["2:3", 2 / 3], ["5:4", 5 / 4], ["4:5", 4 / 5],
];
function aspectRatioLabel(w, h, chosen) {
  if (!w || !h) return "";
  const r = w / h;
  // The aspect picked when it was rendered wins. Sizes are snapped to multiples of 32, so the
  // pixel ratio only approximates it (736x1344 is 23:42, not the 9:16 that was asked for).
  const m = /^(\d+):(\d+)/.exec(chosen || "");
  if (m) {
    const v = m[1] / m[2];
    if (Math.abs(r - v) / v <= 0.1) return `${m[1]}:${m[2]}`;
  }
  let best = null, bestErr = Infinity;
  for (const [label, val] of NAMED_RATIOS) {
    const err = Math.abs(r - val) / val;
    if (err < bestErr) { bestErr = err; best = label; }
  }
  // Snapping to 32 moves a small render's ratio by up to ~7% (the named ones are at least
  // 6.7% apart, so the nearest still wins), hence the loose bound.
  if (best && bestErr <= 0.08) return best;
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const g = gcd(w, h) || 1;
  return `${w / g}:${h / g}`;
}

function imageURL(v) {
  return `/view?filename=${encodeURIComponent(v.filename)}`
    + `&subfolder=${encodeURIComponent(v.subfolder || "")}&type=output&t=${v.mtime || ""}`;
}
// Read-only look at everything Reuse Setting would restore — same idea as the video
// gallery's own buildInfoLines, scoped to what Image Generator actually saves.
function buildInfoLines(v) {
  const m = v.meta || {};
  const lines = [];
  if (m.model) lines.push(`model: ${modelName(m.model)}`);
  if (m.title) lines.push(`chat: ${m.title}`);
  if (m.aspect) lines.push(`aspect: ${m.aspect}`);
  if (m.size) lines.push(`resolution: ${m.size}`);
  if (m.thinking) lines.push(`thinking: ${m.thinking}`);
  if (m.enhanced) lines.push(`enhanced: yes`);
  if (m.text) lines.push(`model text: ${m.text}`);
  return lines;
}
function fmtSize(bytes) {
  if (!bytes) return "";
  const mb = bytes / 1048576;
  return mb >= 1 ? `${mb.toFixed(1)}MB` : `${Math.round(bytes / 1024)}KB`;
}
function fmtWhen(mtime) {
  try { return new Date(mtime * 1000).toLocaleString(); } catch { return ""; }
}

// Image Generator writes to its own path (Settings -> Output -> "Image Generator Save
// Folder"), separate from the video path — falls back to the shared video path, then the
// hardcoded default, so this gallery still finds something before that field is ever set.
function imgFolder() { return SUBFOLDER; }

export function createImageGalleryOverlay(state, ctx) {
  const ov = el("div", { style: {
    position: "absolute", inset: "0", zIndex: "9998",
    background: "rgba(11,11,11,0.985)", borderRadius: "inherit",
    display: "none", flexDirection: "column", padding: "12px", gap: "8px", boxSizing: "border-box",
  }});

  let images = [];
  let imageTotal = 0;      // what the folder holds; `images` is only the part loaded so far
  let galleryFilter = "all";
  const GALLERY_FILTERS = [
    { value: "all", label: "All" },
    { value: "edits", label: "Follow-up edits" },
    { value: "first", label: "First images" },
  ];
  function matchesFilter(v) {
    const m = v.meta || {};
    switch (galleryFilter) {
      case "edits": return !!m.turn && m.turn > 1;
      case "first": return !m.turn || m.turn === 1;
      default:      return true;
    }
  }

  // ── delete confirm ──────────────────────────────────────────────────────────────
  const deleteConfirmOv = el("div", { style: {
    display: "none", position: "fixed", inset: "0", zIndex: "99999",
    background: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center",
  }});
  const deleteConfirmBox = el("div", { style: {
    background: C.bg1, border: `1px solid ${C.border}`, borderRadius: "10px",
    padding: "18px 20px", width: "320px", boxSizing: "border-box",
    display: "flex", flexDirection: "column", gap: "10px", boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
  }});
  const deleteConfirmTitle = el("div", { text: "Delete this image?", style: { color: "#fff", fontSize: "13px", fontWeight: "700" } });
  const deleteConfirmName = el("div", { style: { color: C.muted, fontSize: "11px", lineHeight: "1.5", wordBreak: "break-all" } });
  const deleteConfirmWarn = el("div", { text: "This can't be undone.", style: { color: C.muted, fontSize: "11.5px", lineHeight: "1.5" } });
  deleteConfirmBox.append(deleteConfirmTitle, deleteConfirmName, deleteConfirmWarn);
  const deleteBtnRow = el("div", { style: { display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "4px" } });
  const deleteCancelBtn = el("button", { type: "button", text: "Cancel", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "11.5px", padding: "6px 14px",
    borderRadius: "6px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
  }});
  const deleteConfirmBtn = button("Delete", () => runDelete(), "danger");
  function cancelDelete() { deleteConfirmOv.style.display = "none"; pendingDelete = null; }
  deleteCancelBtn.addEventListener("click", cancelDelete);
  deleteBtnRow.append(deleteCancelBtn, deleteConfirmBtn);
  deleteConfirmBox.appendChild(deleteBtnRow);
  deleteConfirmOv.appendChild(deleteConfirmBox);
  deleteConfirmOv.addEventListener("click", e => { if (e.target === deleteConfirmOv) cancelDelete(); });
  document.body.appendChild(deleteConfirmOv);

  let pendingDelete = null;
  function askDelete(v) {
    pendingDelete = { filename: v.filename, subfolder: v.subfolder || "" };
    deleteConfirmName.textContent = v.filename;
    deleteConfirmOv.style.display = "flex";
  }
  async function runDelete() {
    if (!pendingDelete) return;
    const { filename, subfolder } = pendingDelete;
    deleteConfirmBtn.disabled = true;
    try {
      const d = await deleteImage(filename, subfolder);
      if (!d.ok) throw new Error(d.error || "delete failed");
      deleteConfirmOv.style.display = "none";
      pendingDelete = null;
      await refresh();
    } catch (e) {
      ctx.showPopup?.(`Delete failed: ${e.message || e}`, true);
    } finally {
      deleteConfirmBtn.disabled = false;
    }
  }

  // ── header ───────────────────────────────────────────────────────────────────────
  const hdr = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" } });
  hdr.appendChild(el("div", { text: "🖼 Image Gallery", style: { color: "#fff", fontSize: "14px", fontWeight: "700" } }));
  const countTag = el("div", { style: { fontSize: "10.5px", color: C.muted, flex: "1" } });
  hdr.appendChild(countTag);

  // ── multi-select (same pattern as the image-node galleries' own Select/bulk-delete) ─
  let selectMode = false;
  const selected = new Set();   // mediaKey() strings
  let cellRefs = [];            // { key, checkbox } — toggled visible/hidden together
  const bulkDeleteBtn = el("button", { type: "button", text: "Delete", style: {
    display: "none", cursor: "pointer", fontFamily: "inherit", fontSize: "10.5px", padding: "5px 11px",
    borderRadius: "6px", background: "#c0392b", color: "#fff", border: "none", fontWeight: "700",
  }});
  const selectBtn = el("button", { type: "button", text: "Select", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "10.5px", padding: "5px 11px",
    borderRadius: "6px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
  }});
  function updateSelectionUI() {
    selectBtn.textContent = selected.size ? `${selected.size} Select` : "Select";
    bulkDeleteBtn.textContent = `Delete ${selected.size} Image${selected.size === 1 ? "" : "s"}`;
    bulkDeleteBtn.style.display = selected.size ? "" : "none";
  }
  function setSelectMode(on) {
    selectMode = on; if (!on) selected.clear();
    selectBtn.style.background  = on ? BRAND : C.bg2;
    selectBtn.style.borderColor = on ? BRAND : C.border;
    cellRefs.forEach(ref => { ref.checkbox.style.display = on ? "" : "none"; ref.info.style.display = on ? "none" : ""; });
    updateSelectionUI();
  }
  selectBtn.addEventListener("click", () => setSelectMode(!selectMode));
  bulkDeleteBtn.addEventListener("click", async () => {
    if (!selected.size) return;
    // the node's own dialog: the browser's confirm() can return "cancel" without showing anything in embedded browsers
    const yes = ctx.dialog ? await ctx.dialog({ title: `Delete ${selected.size} image(s)?`, message: "This can't be undone.", ok: "Delete", danger: true })
                           : window.confirm(`Delete ${selected.size} image(s)? This can't be undone.`);
    if (!yes) return;
    const targets = filtered.filter(v => selected.has(mediaKey(v.filename, v.subfolder || "")));
    for (const v of targets) await deleteImage(v.filename, v.subfolder || "").catch(() => {});
    setSelectMode(false);
    await refresh();
  });

  const filterSel = el("select", { style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "10.5px", padding: "5px 8px",
    borderRadius: "6px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
  }}, GALLERY_FILTERS.map(f => el("option", { value: f.value, text: f.label })));
  filterSel.addEventListener("change", () => { galleryFilter = filterSel.value; renderGrid(); });

  const refreshBtn = el("button", { type: "button", text: "↻", title: "Refresh", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "12px", padding: "5px 11px",
    borderRadius: "6px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
  }});
  refreshBtn.addEventListener("click", () => refresh());
  const folderBtn = el("button", { type: "button", text: "📂 Open folder", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "10.5px", padding: "5px 11px",
    borderRadius: "6px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
  }});
  folderBtn.addEventListener("click", async () => {
    const r = await revealOutputFolder(imgFolder(state));
    if (!r.ok) ctx.showPopup?.(`Could not open the folder: ${r.error || "unknown"}`, true);
  });

  // ── pick mode — Image Generator's "🖼 From gallery" opens this exact gallery to pick
  // a previously-generated image as a new reference, same shape as the video gallery's
  // showPicker() for clips ───────────────────────────────────────────────────────────
  let pickCallback = null;
  async function pickImage(v) {
    if (!pickCallback) return;
    const key = mediaKey(v.filename, v.subfolder || "");
    if (isBlurred(key)) { ctx.showPopup?.("Hidden — click 👁 on the card to reveal it first.", true); return; }
    const cb = pickCallback;
    try {
      const name = await copyOutputToInput(v.filename, v.subfolder || "", "output");
      cb(name, v);
    } catch (e) { ctx.showPopup?.(e.message || "Could not use that image.", true); return; }
    pickCallback = null;
    hide();
  }

  const cacheBtn = button("⚡ Cache", () => {});
  wireCacheButton(cacheBtn, () => ({ root: "output", subfolder: imgFolder(state), recursive: true }));
  const revealBtn = button("👁 Show", () => {});
  wireRevealButton(revealBtn);
  const toolsBtn = button("🧹 Tools", () => {});
  wireGalleryTools(toolsBtn, () => ({ nodeKey: "vertex", folder: imgFolder(state), onChanged: () => refresh() }));
  hdr.append(bulkDeleteBtn, selectBtn, filterSel, cacheBtn, toolsBtn, revealBtn, refreshBtn, folderBtn, button("✕ Close", () => hide(), "danger"));

  // ── grid ─────────────────────────────────────────────────────────────────────────
  // No `overflow` other than visible on `card` (the grid item) — same fix the video
  // gallery's own grid already documents: a grid item's automatic minimum size collapses
  // to 0 instead of its content's natural height whenever its own overflow isn't
  // "visible", which is what squashed every row into a sliver and stacked all 146 cards
  // on top of each other. Clipping happens on `thumbWrap` (an inner child) instead, and
  // the thumbnail image stays in NORMAL FLOW sized by aspect-ratio (not absolutely
  // positioned) so it contributes real height the same way the video gallery's own
  // thumbnail does.
  const grid = el("div", { style: {
    flex: "1", overflowY: "auto", display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(168px, 1fr))", gap: "10px", alignContent: "start",
    paddingRight: "4px",
  }});
  const hint = el("div", { text: "No images yet.", style: { color: C.muted, fontSize: "12px", textAlign: "center", padding: "30px 0", display: "none" } });
  let filtered = [];   // current filtered order — Prompt View's prev/next navigate this

  function thumb(v, idx) {
    const key = mediaKey(v.filename, v.subfolder || "");
    const picked = false;
    const isSel = selected.has(key);
    const card = el("div", { style: {
      position: "relative", background: C.bg1,
      border: `1px solid ${picked || isSel ? BRAND : C.border}`,
      borderRadius: "8px", cursor: "pointer", display: "flex", flexDirection: "column",
    }});

    const thumbWrap = el("div", { style: { position: "relative", width: "100%", overflow: "hidden", borderRadius: "7px 7px 0 0" } });
    const img = el("img", {
      style: { width: "100%", aspectRatio: "1 / 1", objectFit: "contain", background: "#000", display: "block" } });
    setThumb(img, v);
    thumbWrap.appendChild(img);
    attachSensitiveToggle?.(thumbWrap, img, key);   // ⊘ eye toggle — bottom-right by default

    // ⓘ info hover (top-left) — read-only look at everything Reuse Setting would
    // restore. Swaps for a checkbox in the same spot while Select mode is on.
    const infoBtn = el("button", { type: "button", text: "ⓘ", style: {
      position: "absolute", top: "4px", left: "4px", zIndex: "2", width: "18px", height: "18px",
      lineHeight: "16px", padding: "0", cursor: "default", fontSize: "11px", fontFamily: "inherit",
      background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", borderRadius: "4px",
    }});
    infoBtn.addEventListener("click", e => e.stopPropagation());
    let infoPopup = null;
    infoBtn.addEventListener("mouseenter", () => {
      const lines = buildInfoLines(v);
      infoPopup = el("div", { style: {
        position: "fixed", zIndex: "10001", background: "rgba(10,10,10,0.97)",
        border: `1px solid ${C.border}`, borderRadius: "6px", padding: "6px 8px",
        fontSize: "10px", color: C.text, lineHeight: "1.6", whiteSpace: "pre-wrap", wordBreak: "break-all",
        pointerEvents: "none", maxWidth: "220px", boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
      }});
      infoPopup.textContent = lines.length ? lines.join("\n") : "No settings saved for this image.";
      document.body.appendChild(infoPopup);
      const r = infoBtn.getBoundingClientRect();
      infoPopup.style.left = `${r.right + 6}px`; infoPopup.style.top = `${r.top}px`;
    });
    infoBtn.addEventListener("mouseleave", () => { infoPopup?.remove(); infoPopup = null; });
    thumbWrap.appendChild(infoBtn);

    const checkbox = el("input", { type: "checkbox" });
    checkbox.checked = isSel;
    checkbox.style.cssText = "position:absolute;top:4px;left:4px;z-index:2;width:16px;height:16px;cursor:pointer;display:none;";
    checkbox.addEventListener("click", e => e.stopPropagation());
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) selected.add(key); else selected.delete(key);
      card.style.borderColor = checkbox.checked ? BRAND : C.border;
      updateSelectionUI();
    });
    thumbWrap.appendChild(checkbox);
    cellRefs.push({ key, checkbox, info: infoBtn });
    if (selectMode) { infoBtn.style.display = "none"; checkbox.style.display = ""; }

    const del = el("button", { type: "button", text: "✕", title: "Delete", style: {
      position: "absolute", top: "4px", right: "4px", zIndex: "2", width: "20px", height: "20px",
      border: "none", borderRadius: "5px", background: "rgba(0,0,0,0.7)", color: "#fff",
      cursor: "pointer", fontSize: "11px", lineHeight: "20px", padding: "0",
    }});
    del.addEventListener("click", (e) => { e.stopPropagation(); askDelete(v); });
    thumbWrap.appendChild(del);

    thumbWrap.addEventListener("click", () => {
      if (selectMode) { checkbox.checked = !checkbox.checked; checkbox.dispatchEvent(new Event("change")); return; }
      if (pickCallback) { pickImage(v); return; }
      openPromptViewPopup(idx);
    });

    const meta = el("div", { style: { padding: "5px 7px", display: "flex", flexDirection: "column", gap: "1px" } });
    if (v.meta?.w && v.meta?.h) {
      const mp = ((v.meta.w * v.meta.h) / 1_000_000).toFixed(1);
      const ratio = aspectRatioLabel(v.meta.w, v.meta.h, v.meta.aspect);
      meta.appendChild(el("div", { text: `[${v.meta.w}x${v.meta.h}px / ${mp}MP${ratio ? `    ${ratio}` : ""}]`,
        style: { fontSize: "9px", color: "#fff", fontWeight: "600" } }));
    }
    meta.append(
      el("div", { text: v.filename, title: v.filename, style: {
        fontSize: "10px", color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }),
      el("div", { text: `${fmtSize(v.size)} · ${fmtWhen(v.mtime)}`, style: { fontSize: "9px", color: C.muted } }),
    );

    const promptText = String(v.prompt || v.meta?.prompt || "").trim();
    if (promptText) {
      const p = el("div", { text: promptText, style: {
        fontSize: "9px", color: C.muted, lineHeight: "1.35", marginTop: "2px",
        display: "-webkit-box", WebkitLineClamp: "3", WebkitBoxOrient: "vertical",
        overflow: "hidden", cursor: "text",
      }});
      p.title = promptText;
      meta.appendChild(p);
    }

    // Always shown, prompt or not — Reuse Setting still restores whatever settings ARE
    // saved, and View/Copy are harmless on an empty prompt too. Matches the enlarged
    // popup, which already shows this footer unconditionally (user: "버튼은 크게
    // 보기에서도 있는데 밖에서도 보이게").
    const mini = (txt, tip, fn, full) => {
      const b = el("button", { text: txt, style: {
        flex: full ? "1 1 100%" : "1", fontSize: "9px", padding: "3px 0", cursor: "pointer",
        background: C.bg2, color: C.text, border: `1px solid ${C.border}`, borderRadius: "4px",
      }});
      b.title = tip;
      b.addEventListener("click", e => { e.stopPropagation(); fn(); });
      return b;
    };
    // Row 1: Reuse Setting alone (full width); Row 2: Prompt View + Prompt Copy split
    // 1:1 — the user's own requested layout.
    const row1 = el("div", { style: { display: "flex", gap: "4px", marginTop: "4px" } },
      [mini("↩ Reuse Setting", "Open this image's chat and continue editing from it", () => doReuse(v), true)]);
    const row2 = el("div", { style: { display: "flex", gap: "4px", marginTop: "4px" } }, [
      mini("📄 Prompt View", "View the full prompt, image and info in one popup", () => openPromptViewPopup(idx)),
      mini("⧉ Prompt Copy", "Copy the prompt to the clipboard", () => doCopyPrompt(promptText || "")),
    ]);
    meta.append(row1, row2);

    card.append(thumbWrap, meta);
    return card;
  }

  function renderGrid() {
    clear(grid);
    cellRefs = [];
    filtered = images.filter(matchesFilter);
    countTag.textContent = `${filtered.length} image${filtered.length === 1 ? "" : "s"}`
      + (images.length < imageTotal ? ` · ${images.length} / ${imageTotal} loaded` : "");
    hint.style.display = filtered.length ? "none" : "block";
    filtered.forEach((v, idx) => grid.appendChild(thumb(v, idx)));
    if (images.length < imageTotal) grid.appendChild(loadMoreButton(loadMore));
  }

  function doReuse(v) {
    const m = v.meta || { prompt: v.prompt || "" };
    const ok = ctx.reuseImageSettings?.(m, v);
    ctx.showPopup?.(ok ? "Chat opened — continuing from this image." : "No prompt stored for this image.", !ok);
    if (ok) hide();
  }
  function doCopyPrompt(promptText) {
    if (!promptText) { ctx.showPopup?.("No prompt saved for this image.", true); return; }
    navigator.clipboard?.writeText(promptText)
      .then(() => ctx.showPopup?.("Prompt copied.", false))
      .catch(() => ctx.showPopup?.("Copy failed.", true));
  }

  // ── Prompt View — full-viewport (position:fixed inset:0), same weight as the video
  // gallery's own fullscreen player, not a small centered box: a large image area, then
  // prev/next + the pan/zoom/fit shortcut hint, then the prompt, then Reuse/Copy — the
  // user's own requested stacking. ←/→ still step through the current filtered list,
  // Esc still closes, and the blur/reveal toggle still re-applies on every navigation.
  function openPromptViewPopup(idx) {
    let i = idx;
    const pop = el("div", { style: {
      display: "flex", position: "fixed", inset: "0", zIndex: "100060",
      background: "rgba(0,0,0,0.97)", flexDirection: "column",
    }});
    const topBar = el("div", { style: {
      flexShrink: "0", display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", color: "#fff",
    }});
    const titleEl = el("div", { style: { fontSize: "13px", fontWeight: "600", flex: "1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } });
    const posEl = el("div", { style: { fontSize: "11px", color: "#9a9a9a" } });
    const closeBtn = el("button", { type: "button", text: "✕", title: "Close (Esc)", style: {
      cursor: "pointer", background: "rgba(255,255,255,0.1)", color: "#fff", border: "none",
      borderRadius: "6px", width: "30px", height: "30px", fontSize: "14px",
    }});
    topBar.append(titleEl, posEl, closeBtn);

    // ── image area — fills most of the screen ──────────────────────────────────────
    const imgWrap = el("div", { style: {
      position: "relative", flex: "1", minHeight: "0", overflow: "hidden",
      display: "flex", alignItems: "center", justifyContent: "center", background: "#000",
    }});
    const im = el("img", { style: {
      maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block",
      transformOrigin: "center center", cursor: "default", userSelect: "none",
      WebkitUserDrag: "none", pointerEvents: "none",
    }});
    im.draggable = false;
    im.addEventListener("dragstart", (e) => e.preventDefault());
    imgWrap.appendChild(im);

    // wheel = zoom · left-drag = pan · double-click = fit (shared/pan_zoom.js)
    attachPanZoom(imgWrap, [im]);

    // ── nav row — "‹ Previous  Next ›" centered, shortcut hint underneath ───────────
    const prevBtn = el("button", { type: "button", text: "‹ Previous Image", title: "Previous image (←)", style: {
      cursor: "pointer", fontFamily: "inherit", fontSize: "12px", padding: "6px 14px",
      borderRadius: "6px", background: "rgba(255,255,255,0.08)", color: "#fff", border: "none",
    }});
    const nextBtn = el("button", { type: "button", text: "Next Image ›", title: "Next image (→)", style: {
      cursor: "pointer", fontFamily: "inherit", fontSize: "12px", padding: "6px 14px",
      borderRadius: "6px", background: "rgba(255,255,255,0.08)", color: "#fff", border: "none",
    }});
    prevBtn.addEventListener("click", () => step(-1));
    nextBtn.addEventListener("click", () => step(1));
    const navRow = el("div", { style: { flexShrink: "0", display: "flex", justifyContent: "center", gap: "20px", padding: "10px 14px 4px" } },
      [prevBtn, nextBtn]);
    const hintRow = el("div", { style: { flexShrink: "0", textAlign: "center", padding: "0 14px 10px", color: "#7a7a7a", fontSize: "11px" } });
    hintRow.innerHTML = "<b>Pan</b>: click drag &nbsp;/&nbsp; <b>Zoom</b>: Mouse wheel &nbsp;/&nbsp; <b>Fit-screen</b>: Double Click";

    // ── prompt ───────────────────────────────────────────────────────────────────
    const infoBox = el("div", { style: {
      flexShrink: "0", fontSize: "10px", color: C.text, lineHeight: "1.6", whiteSpace: "pre-wrap", wordBreak: "break-all",
      background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "6px 8px", margin: "0 14px",
    }});
    // ── footer — Reuse Setting / Prompt View ──────────────────────────────────────
    const footBtn = (txt, tip, fn, primary) => {
      const b = el("button", { type: "button", text: txt, style: {
        flex: "1", cursor: "pointer", fontFamily: "inherit", fontSize: "13px", fontWeight: primary ? "700" : "400",
        padding: "10px 0", borderRadius: "6px", border: `1px solid ${primary ? "transparent" : C.border}`,
        background: primary ? BRAND : C.bg2, color: primary ? "#fff" : C.text,
      }});
      b.title = tip; b.addEventListener("click", fn);
      return b;
    };
    const currentPromptText = () => String(filtered[i]?.prompt || filtered[i]?.meta?.prompt || "").trim();
    const footRow = el("div", { style: { flexShrink: "0", display: "flex", gap: "8px", padding: "10px 14px 14px" } }, [
      footBtn("↩ Reuse Setting", "Restore this image's prompt and settings into the panel",
        () => { closePop(); doReuse(filtered[i]); }, true),
      footBtn("📄 Prompt View", "Show the full prompt in its own window", () => openPromptTextPopup(currentPromptText())),
    ]);

    pop.append(topBar, imgWrap, navRow, hintRow, infoBox, footRow);

    // ── Prompt View — a small centered modal on top of the full-screen popup, with the
    // prompt text and Prompt Copy / Close underneath. Kept separate from the main prompt
    // field per the user's request (no inline prompt field in the full-screen view).
    function openPromptTextPopup(text) {
      const overlay = el("div", { style: {
        position: "fixed", inset: "0", zIndex: "100070", display: "flex",
        alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)",
      }});
      const box = el("div", { style: {
        width: "560px", maxWidth: "90%", maxHeight: "70vh", display: "flex", flexDirection: "column",
        gap: "10px", background: "#141414", border: `1px solid ${C.border}`, borderRadius: "10px",
        padding: "16px", boxShadow: "0 16px 50px rgba(0,0,0,0.65)",
      }});
      const title = el("div", { text: "Prompt", style: { color: "#fff", fontSize: "13px", fontWeight: "700" } });
      const textBox = el("div", { text: text || "(no prompt saved)", style: {
        flex: "1", minHeight: "0", overflowY: "auto", background: C.bg2, border: `1px solid ${C.border}`,
        borderRadius: "6px", padding: "10px", fontSize: "12px", color: C.text, lineHeight: "1.5",
        whiteSpace: "pre-wrap",
      }});
      const btnRow = el("div", { style: { display: "flex", gap: "8px" } }, [
        footBtn("⧉ Prompt Copy", "Copy the prompt to the clipboard", () => doCopyPrompt(text)),
        footBtn("✕ Close", "Close", () => { document.removeEventListener("keydown", onOvKey, true); overlay.remove(); }),
      ]);
      box.append(title, textBox, btnRow);
      overlay.appendChild(box);
      const onOvKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); document.removeEventListener("keydown", onOvKey, true); overlay.remove(); } };
      overlay.addEventListener("mousedown", e => { if (e.target === overlay) { document.removeEventListener("keydown", onOvKey, true); overlay.remove(); } });
      document.addEventListener("keydown", onOvKey, true);
      document.body.appendChild(overlay);
    }

    function render() {
      const v = filtered[i];
      if (!v) return;
      const key = mediaKey(v.filename, v.subfolder || "");
      titleEl.textContent = v.filename; titleEl.title = v.filename;
      posEl.textContent = `${i + 1} / ${filtered.length}`;
      const lines = buildInfoLines(v);
      infoBox.textContent = lines.length ? lines.join("\n") : "No settings saved for this image.";
      // Blur/reveal toggle stays live across nav — re-applies to whichever image is
      // current, same rule the thumbnail grid follows.
      clear(imgWrap); imgWrap.appendChild(im);   // a new picture starts fitted (shared/pan_zoom.js resets on this)
      const { eye, shade } = makeSensitiveControl(im, key, () => {
        if (isBlurred(key)) { im.removeAttribute("src"); }
        else if (!im.getAttribute("src")) { im.src = imageURL(v); }
      });
      if (!isBlurred(key)) im.src = imageURL(v); else im.removeAttribute("src");
      eye.style.cssText += ";position:absolute;bottom:6px;right:6px;z-index:3;"
        + "width:26px;height:26px;font-size:14px;background:rgba(0,0,0,0.7);border-radius:6px;";
      imgWrap.append(shade, eye);
      prevBtn.style.visibility = i > 0 ? "visible" : "hidden";
      nextBtn.style.visibility = i < filtered.length - 1 ? "visible" : "hidden";
    }
    function step(d) {
      const n = i + d;
      if (n < 0 || n >= filtered.length) return;
      i = n; render();
    }
    const onKey = (e) => {
      if (e.key === "Escape") { closePop(); return; }
      if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
    };
    function closePop() {
      document.removeEventListener("keydown", onKey, true);
      pop.remove();
    }
    closeBtn.addEventListener("click", closePop);
    document.addEventListener("keydown", onKey, true);
    render();
    document.body.appendChild(pop);
  }

  // Picker-only tab row (pick mode)
  let galleryScope = "";
  const mkTab = (label, value) => {
    const b = el("button", { type: "button", text: label, style: {
      cursor: "pointer", fontFamily: "inherit", fontSize: "10.5px", padding: "5px 11px", borderRadius: "6px",
      border: `1px solid ${C.border}`, background: C.bg2, color: C.text,
    }});
    b.addEventListener("click", () => { galleryScope = value; syncTabs(); refresh(); });
    b._v = value; return b;
  };
  const tabImgs = mkTab("Images", "");
  const tabsBox = el("div", { style: { display: "none", gap: "6px" } }, [tabImgs]);
  function syncTabs() {
    tabsBox.style.display = pickCallback ? "flex" : "none";
    for (const b of [tabImgs]) {
      const on = b._v === galleryScope;
      b.style.background = on ? BRAND : C.bg2; b.style.borderColor = on ? BRAND : C.border;
    }
  }
  hdr.insertBefore(tabsBox, countTag);
  const fetchImagePage = (offset, limit) => listImages(imgFolder(state), { offset, limit, scope: galleryScope });

  // A refresh (or a delete) re-fetches at least as many images as were showing, so the
  // grid does not snap back to the first page.
  async function refresh() {
    try {
      const d = await fetchFirst(fetchImagePage, "images", Math.max(galleryPageSize(state), images.length));
      images = d.rows; imageTotal = d.total;
    } catch (e) {
      images = []; imageTotal = 0;
      ctx.showPopup?.(`Could not load images: ${e.message || e}`, true);
    }
    renderGrid();
  }

  async function loadMore() {
    const d = await fetchImagePage(images.length, galleryPageSize(state));
    images = mergeUnique(images, d.images || []);
    imageTotal = (d.images || []).length ? Number(d.total) || images.length : images.length;
    renderGrid();
  }

  function show() { ov.style.display = "flex"; if (!pickCallback) galleryScope = ""; syncTabs(); refresh(); }
  function hide() {
    ov.style.display = "none";
    pickCallback = null; galleryScope = ""; syncTabs();
    setSelectMode(false);
  }
  function showPicker(onPick) {
    pickCallback = onPick;
    show();
  }

  mountGalleryLayout(grid, hdr, { colMin: 168, before: refreshBtn, like: refreshBtn });
  ov.append(hdr, grid, hint);
  return { el: ov, show, hide, showPicker, refresh, isOpen: () => ov.style.display !== "none" };
}

// ui_gallery_minimax_images.js — dedicated H3 image gallery for MiniMax H3 ONE STUDIO (TJ)
//
// A separate module from ui_gallery_minimax.js (the video/clip gallery), built BY COPYING
// that file's shape (header/filter/grid/post-process-bar pattern) and trimming it down for
// stills — per explicit instruction, the video gallery itself is never touched or modified
// to "also handle images"; this is its own file for Image Generator's own PNG outputs
// (T2I / Reference to Image / Character Sheet), read from its own backend route
// (/minimax_h3_one/images, separate from /videos).
//
// Kept from the video gallery: the filter dropdown, refresh/open-folder/close, delete with
// confirm, a single-pick post-process bar. Deblur + RTX VSR are the only two post-process
// steps carried over (per instruction) — Interpolate/Resize/Stitch are video-only concepts
// and dropped entirely, including their filter options.
import { C, BRAND, el, clear, SUBFOLDER } from "./core_minimax.js";
import { button } from "../klein/ui_common.js";
import { listImages, revealOutputFolder, deleteImage, copyOutputToInput, discardInputCopy,
         saveMeta, queuePrompt } from "./api_minimax.js";
import { buildImageUpscaleGraph } from "./graph_builder_minimax.js";
import { mediaKey, isBlurred, attachSensitiveToggle, makeSensitiveControl } from "../shared/ui_sensitive_media.js";

function imageURL(v) {
  return `/view?filename=${encodeURIComponent(v.filename)}`
    + `&subfolder=${encodeURIComponent(v.subfolder || "")}&type=output&t=${v.mtime || ""}`;
}
// Read-only look at everything Reuse Setting would restore — same idea as the video
// gallery's own buildInfoLines, scoped to what Image Generator actually saves.
function buildInfoLines(v) {
  const m = v.meta || {};
  const lines = [];
  if (m.subMode) lines.push(`mode: ${m.subMode}`);
  if (m.imgAspect) lines.push(`aspect: ${m.imgAspect}`);
  if (m.imgFinalMp != null) lines.push(`final MP: ${m.imgFinalMp}`);
  if (m.seed != null) lines.push(`seed: ${m.seed}`);
  const loraOn = (m.imgLoras || []).filter(l => l && l.enabled !== false && l.name && l.name !== "none");
  if (loraOn.length) lines.push(`LoRA: ${loraOn.map(l => `${String(l.name).split(/[\\/]/).pop()} (${l.strength ?? 1.0})`).join(", ")}`);
  if (m.refImages?.length) lines.push(`reference images: ${m.refImages.length}`);
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
function imgFolder(state) { return state.imgSaveSubfolder || state.saveSubfolder || SUBFOLDER; }

export function createImageGalleryOverlay(state, ctx) {
  const ov = el("div", { style: {
    position: "absolute", inset: "0", zIndex: "9998",
    background: "rgba(11,11,11,0.985)", borderRadius: "inherit",
    display: "none", flexDirection: "column", padding: "12px", gap: "8px", boxSizing: "border-box",
  }});

  let images = [];
  let galleryFilter = "all";
  const GALLERY_FILTERS = [
    { value: "all", label: "All" },
    { value: "original", label: "Original" },
    { value: "deblur", label: "RTX Deblur" },
    { value: "rtxvsr", label: "RTX VSR" },
  ];
  function matchesFilter(v) {
    const m = v.meta || {};
    switch (galleryFilter) {
      case "original": return !(m.deblur && m.deblur !== "none") && !m.upscale;
      case "deblur":   return !!(m.deblur && m.deblur !== "none");
      case "rtxvsr":   return !!(m.upscale && m.upscale.method === "rtx");
      default:         return true;
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
    if (!window.confirm(`Delete ${selected.size} image(s)? This can't be undone.`)) return;
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

  // ── post-process bar (Deblur + RTX VSR only) ──────────────────────────────────────
  let postMode = false;
  let postPick = null;   // image key
  const postBtn = el("button", { type: "button", text: "✦ Deblur / RTX VSR", title: "Pick one image, then deblur/upscale it", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "10.5px", padding: "5px 11px",
    borderRadius: "6px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
  }});
  function setPostMode(on) {
    postMode = on; postPick = null;
    postBtn.style.background  = on ? BRAND : C.bg2;
    postBtn.style.borderColor = on ? BRAND : C.border;
    postBar.style.display = on ? "flex" : "none";
    renderGrid();
  }
  postBtn.addEventListener("click", () => setPostMode(!postMode));

  hdr.append(bulkDeleteBtn, selectBtn, filterSel, postBtn, refreshBtn, folderBtn, button("✕ Close", () => hide(), "danger"));

  const barStyle = {
    display: "none", flexShrink: "0", alignItems: "center", gap: "8px", flexWrap: "wrap",
    background: C.bg1, border: `1px solid ${BRAND}`, borderRadius: "8px", padding: "7px 10px",
  };
  const smallInput = (w) => ({
    width: w, boxSizing: "border-box", background: C.bg2, color: C.text,
    border: `1px solid ${C.border}`, borderRadius: "5px", padding: "3px 4px",
    fontSize: "10.5px", fontFamily: "inherit", outline: "none",
  });
  const smallSelect = (w) => Object.assign(smallInput(w), { cursor: "pointer" });

  const postBar = el("div", { style: Object.assign({}, barStyle) });
  const postProgText = el("div", { style: { flex: "1", minWidth: "150px", fontSize: "10.5px", color: C.text } });
  const deblurSel = el("select", { style: smallSelect("96px") },
    [{ v: "none", t: "off" }, { v: "LOW", t: "Low" }, { v: "MEDIUM", t: "Medium" },
     { v: "HIGH", t: "High" }, { v: "ULTRA", t: "Ultra" }].map(o => el("option", { value: o.v, text: o.t })));
  deblurSel.value = "none";
  const deblurWrap = el("label", { style: { display: "flex", alignItems: "center", gap: "4px", fontSize: "10.5px", color: C.text } },
    [el("span", { text: "deblur" }), deblurSel]);
  const rtxCb = el("input", { type: "checkbox" }); rtxCb.style.cursor = "pointer";
  const rtxLabel = el("label", { style: { display: "flex", alignItems: "center", gap: "4px", fontSize: "10.5px", color: C.text, cursor: "pointer" } },
    [rtxCb, el("span", { text: "RTX VSR" })]);
  const rtxScaleIn = el("input", { type: "number", min: "1", max: "4", step: "0.25", style: smallInput("52px") });
  rtxScaleIn.value = "2.0";
  const rtxQualSel = el("select", { style: smallSelect("88px") },
    ["LOW", "MEDIUM", "HIGH", "ULTRA"].map(q => el("option", { value: q, text: q })));
  rtxQualSel.value = "ULTRA";
  function refreshPostBar() {
    const deblurOn = deblurSel.value !== "none";
    const ready = !!postPick && !postRunning && (deblurOn || rtxCb.checked);
    postGoBtn.disabled = !ready;
    postGoBtn.style.opacity = ready ? "1" : "0.5";
    if (postRunning) return;
    if (!postPick) postProgText.textContent = "Pick one image.";
    else postProgText.textContent = pickedImage()?.filename || "";
  }
  deblurSel.addEventListener("change", refreshPostBar);
  rtxCb.addEventListener("change", refreshPostBar);
  const postGoBtn = button("▶ Run", () => runImagePost(), "primary");
  postBar.append(postProgText, deblurWrap, rtxLabel, rtxScaleIn, rtxQualSel, postGoBtn);

  function pickedImage() { return postPick ? images.find(v => vKey(v) === postPick) : null; }
  const vKey = v => `${v.subfolder || ""}|${v.filename}`;

  let postRunning = false;
  async function runImagePost() {
    const v = pickedImage();
    if (!v || postRunning) return;
    postRunning = true; refreshPostBar();
    postProgText.textContent = "Running…";
    let copied = null;
    try {
      const inputFile = await copyOutputToInput(v.filename, v.subfolder || "", "output");
      copied = inputFile;
      const stem = v.filename.replace(/\.[^.]+$/, "");
      const built = buildImageUpscaleGraph({
        inputFile, stem, folder: imgFolder(state),
        deblur: deblurSel.value,
        rtx: rtxCb.checked ? {
          rtxSizeMode: "scale", rtxScale: parseFloat(rtxScaleIn.value) || 2.0,
          rtxQuality: rtxQualSel.value, srcW: v.meta?.w, srcH: v.meta?.h,
        } : null,
      }, ctx.availability || {});
      const res = await queuePrompt(built.graph, {});
      const o = res.byNode[built.saveNode]?.images?.[0];
      if (!o) throw new Error("no output produced");
      const patched = { ...(v.meta || {}), created: Date.now() };
      if (deblurSel.value !== "none") patched.deblur = deblurSel.value;
      if (rtxCb.checked) patched.upscale = { method: "rtx", scale: parseFloat(rtxScaleIn.value) || 2.0, quality: rtxQualSel.value };
      await saveMeta(o.filename, o.subfolder || imgFolder(state), patched).catch(() => {});
      postProgText.textContent = "✓ Done.";
      ctx.showPopup?.("Finished — the new file is at the top of the gallery.", false);
      postPick = null;
      await refresh();
    } catch (e) {
      postProgText.textContent = `✕ ${e?.message || e}`;
      ctx.showPopup?.(`Failed: ${e?.message || e}`, true);
    } finally {
      await discardInputCopy(copied).catch(() => {});
      postRunning = false;
      refreshPostBar();
    }
  }

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
    const picked = postMode && postPick === vKey(v);
    const isSel = selected.has(key);
    const card = el("div", { style: {
      position: "relative", background: C.bg1,
      border: `1px solid ${picked || isSel ? BRAND : C.border}`,
      borderRadius: "8px", cursor: "pointer", display: "flex", flexDirection: "column",
    }});

    const thumbWrap = el("div", { style: { position: "relative", width: "100%", overflow: "hidden", borderRadius: "7px 7px 0 0" } });
    const img = el("img", { loading: "lazy", src: imageURL(v),
      style: { width: "100%", aspectRatio: "1 / 1", objectFit: "cover", background: "#000", display: "block" } });
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

    // ⇪✧ marks — bottom-left, same glyphs/meaning as the video gallery's own
    // post-process marks (⇪ = upscaled, ✧ = deblurred).
    {
      const m = v.meta || {};
      const marks = [];
      if (m.upscale) marks.push(["⇪", m.upscale.method === "rtx"
        ? `Upscaled — RTX VSR ×${m.upscale.scale ?? "?"} (${m.upscale.quality})`
        : `Upscaled — ${String(m.upscale.model || "model").split(/[\\/]/).pop()}`]);
      if (m.deblur && m.deblur !== "none") marks.push(["✧", `Deblurred — strength ${m.deblur}`]);
      if (marks.length) {
        const bar = el("div", { style: { position: "absolute", bottom: "4px", left: "4px", zIndex: "2", display: "flex", gap: "3px" } });
        marks.forEach(([glyph, tip]) => bar.appendChild(el("div", { text: glyph, title: tip, style: {
          width: "18px", height: "18px", lineHeight: "18px", textAlign: "center",
          fontSize: "11px", borderRadius: "4px", color: "#fff", background: "rgba(0,0,0,0.6)",
        }})));
        thumbWrap.appendChild(bar);
      }
    }

    thumbWrap.addEventListener("click", () => {
      if (selectMode) { checkbox.checked = !checkbox.checked; checkbox.dispatchEvent(new Event("change")); return; }
      if (pickCallback) { pickImage(v); return; }
      if (postMode) { postPick = vKey(v); refreshPostBar(); renderGrid(); return; }
      openPromptViewPopup(idx);
    });

    const meta = el("div", { style: { padding: "5px 7px", display: "flex", flexDirection: "column", gap: "1px" } });
    if (v.meta?.w && v.meta?.h) {
      const mp = ((v.meta.w * v.meta.h) / 1_000_000).toFixed(1);
      meta.appendChild(el("div", { text: `[${v.meta.w}x${v.meta.h}px / ${mp}MP]`,
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

      const mini = (txt, tip, fn, full) => {
        const b = el("button", { text: txt, style: {
          flex: full ? "1 1 100%" : "1", fontSize: "9px", padding: "3px 0", cursor: "pointer",
          background: C.bg2, color: C.text, border: `1px solid ${C.border}`, borderRadius: "4px",
        }});
        b.title = tip;
        b.addEventListener("click", e => { e.stopPropagation(); fn(); });
        return b;
      };
      // Row 1: Reuse Setting alone; Row 2: Prompt View + Prompt Copy side by side —
      // the user's own requested layout.
      const row1 = el("div", { style: { display: "flex", gap: "4px", marginTop: "4px" } },
        [mini("↩ Reuse Setting", "Restore this image's prompt and settings into the Image Generator panel", () => doReuse(v), true)]);
      const row2 = el("div", { style: { display: "flex", gap: "4px", marginTop: "4px" } }, [
        mini("📄 Prompt View", "View the full prompt, image and info in one popup", () => openPromptViewPopup(idx)),
        mini("⧉ Prompt Copy", "Copy the prompt to the clipboard", () => doCopyPrompt(promptText)),
      ]);
      meta.append(row1, row2);
    }

    card.append(thumbWrap, meta);
    return card;
  }

  function renderGrid() {
    clear(grid);
    cellRefs = [];
    filtered = images.filter(matchesFilter);
    countTag.textContent = `${filtered.length} image${filtered.length === 1 ? "" : "s"}`;
    hint.style.display = filtered.length ? "none" : "block";
    filtered.forEach((v, idx) => grid.appendChild(thumb(v, idx)));
    refreshPostBar();
  }

  function doReuse(v) {
    const m = v.meta || { prompt: v.prompt || "" };
    const ok = ctx.reuseImageSettings?.(m);
    ctx.showPopup?.(ok ? "Image settings loaded into the panel." : "No prompt stored for this image.", !ok);
    if (ok) hide();
  }
  function doCopyPrompt(promptText) {
    navigator.clipboard?.writeText(promptText)
      .then(() => ctx.showPopup?.("Prompt copied.", false))
      .catch(() => ctx.showPopup?.("Copy failed.", true));
  }

  // ── Prompt View — image + info left, full prompt right, Reuse/Copy footer, same shape
  // as the video gallery's own popup — plus ←/→ to step through the current filtered
  // list without closing, and the same blur/reveal toggle the thumbnail itself has.
  function openPromptViewPopup(idx) {
    let i = idx;
    const box = el("div", { style: {
      position: "relative", background: "#141414", border: `1px solid ${C.border}`, borderRadius: "10px",
      width: "760px", maxWidth: "94%", padding: "16px", display: "flex", flexDirection: "column",
      gap: "12px", boxShadow: "0 16px 50px rgba(0,0,0,0.65)",
    }});
    const titleEl = el("div", { text: "Prompt", style: { color: "#fff", fontSize: "13px", fontWeight: "700" } });
    const imgWrap = el("div", { style: {
      position: "relative", width: "100%", aspectRatio: "1 / 1", background: "#000",
      borderRadius: "6px", overflow: "hidden", border: `1px solid ${C.border}`, flexShrink: "0",
    }});
    const im = el("img", { style: {
      width: "100%", height: "100%", objectFit: "contain", background: "#000", display: "block",
      transformOrigin: "center center", cursor: "default",
    }});
    imgWrap.appendChild(im);

    // Pan (drag) / zoom (wheel, cursor-anchored) / fit (double-click reset) — same gesture
    // set the main node's own compare viewer uses, applied to this single image.
    let zoom = 1, panX = 0, panY = 0;
    const applyTransform = () => { im.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`; };
    const resetTransform = () => { zoom = 1; panX = 0; panY = 0; applyTransform(); im.style.cursor = "default"; };
    imgWrap.style.overflow = "hidden";
    imgWrap.addEventListener("wheel", (e) => {
      e.preventDefault();
      const rect = imgWrap.getBoundingClientRect();
      const cx = e.clientX - rect.left - rect.width / 2;
      const cy = e.clientY - rect.top - rect.height / 2;
      const prevZoom = zoom;
      zoom = Math.min(6, Math.max(1, zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      const ratio = zoom / prevZoom;
      panX = cx - (cx - panX) * ratio; panY = cy - (cy - panY) * ratio;
      if (zoom === 1) { panX = 0; panY = 0; }
      im.style.cursor = zoom > 1 ? "grab" : "default";
      applyTransform();
    }, { passive: false });
    let dragging = false, dragStartX = 0, dragStartY = 0, dragPanX = 0, dragPanY = 0;
    imgWrap.addEventListener("pointerdown", (e) => {
      if (zoom <= 1) return;
      dragging = true; dragStartX = e.clientX; dragStartY = e.clientY; dragPanX = panX; dragPanY = panY;
      imgWrap.setPointerCapture(e.pointerId);
      im.style.cursor = "grabbing";
    });
    imgWrap.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      panX = dragPanX + (e.clientX - dragStartX); panY = dragPanY + (e.clientY - dragStartY);
      applyTransform();
    });
    imgWrap.addEventListener("pointerup", () => { dragging = false; if (zoom > 1) im.style.cursor = "grab"; });
    imgWrap.addEventListener("dblclick", resetTransform);
    const infoBox = el("div", { style: {
      fontSize: "10px", color: C.text, lineHeight: "1.6", whiteSpace: "pre-wrap", wordBreak: "break-all",
      background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "6px 8px",
    }});
    const leftCol = el("div", { style: { display: "flex", flexDirection: "column", gap: "8px", flex: "1", minWidth: "0" } }, [imgWrap, infoBox]);
    const promptBox = el("div", { style: {
      flex: "1", minWidth: "0", background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "6px",
      padding: "10px", fontSize: "12px", color: C.text, lineHeight: "1.5", whiteSpace: "pre-wrap",
      overflowY: "auto", maxHeight: "360px",
    }});
    const topRow = el("div", { style: { display: "flex", gap: "10px" } }, [leftCol, promptBox]);

    const footBtn = (txt, tip, fn, primary) => {
      const b = el("button", { type: "button", text: txt, style: {
        flex: "1", cursor: "pointer", fontFamily: "inherit", fontSize: "12px", fontWeight: primary ? "700" : "400",
        padding: "8px 0", borderRadius: "6px", border: `1px solid ${primary ? "transparent" : C.border}`,
        background: primary ? BRAND : C.bg2, color: primary ? "#fff" : C.text,
      }});
      b.title = tip; b.addEventListener("click", fn);
      return b;
    };
    const currentPromptText = () => String(filtered[i]?.prompt || filtered[i]?.meta?.prompt || "").trim();
    const footRow = el("div", { style: { display: "flex", gap: "8px" } }, [
      footBtn("↩ Reuse Setting", "Restore this image's prompt and settings into the panel",
        () => { closePop(); doReuse(filtered[i]); }, true),
      footBtn("⧉ Prompt Copy", "Copy the prompt to the clipboard", () => doCopyPrompt(currentPromptText())),
    ]);

    const navBtn = (txt, tip, fn) => el("button", { type: "button", text: txt, title: tip, style: {
      position: "absolute", top: "50%", transform: "translateY(-50%)", zIndex: "3",
      width: "30px", height: "30px", borderRadius: "50%", border: "none",
      background: "rgba(0,0,0,0.6)", color: "#fff", cursor: "pointer", fontSize: "14px",
    }, onclick: fn });
    const prevBtn = navBtn("‹", "Previous image (←)", () => step(-1));
    prevBtn.style.left = "-15px";
    const nextBtn = navBtn("›", "Next image (→)", () => step(1));
    nextBtn.style.right = "-15px";

    const closeBtn = el("button", { type: "button", text: "✕", style: {
      position: "absolute", top: "8px", right: "8px", width: "26px", height: "26px",
      border: "none", borderRadius: "6px", background: "rgba(255,255,255,0.08)", color: C.text,
      cursor: "pointer", fontSize: "13px",
    }});
    box.append(titleEl, topRow, footRow, closeBtn, prevBtn, nextBtn);
    const pop = el("div", { style: {
      position: "fixed", inset: "0", zIndex: "100060", display: "flex",
      alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.72)",
    }}, [box]);

    function render() {
      const v = filtered[i];
      if (!v) return;
      const key = mediaKey(v.filename, v.subfolder || "");
      const lines = buildInfoLines(v);
      infoBox.textContent = lines.length ? lines.join("\n") : "No settings saved for this image.";
      promptBox.textContent = currentPromptText() || "(no prompt saved)";
      // Blur/reveal toggle stays live across nav — re-applies to whichever image is
      // current, same rule the thumbnail grid follows.
      resetTransform();
      clear(imgWrap); imgWrap.appendChild(im);
      const { eye, shade } = makeSensitiveControl(im, key, () => {
        if (isBlurred(key)) { im.removeAttribute("src"); }
        else if (!im.getAttribute("src")) { im.src = imageURL(v); }
      });
      if (!isBlurred(key)) im.src = imageURL(v); else im.removeAttribute("src");
      eye.style.cssText += ";position:absolute;bottom:6px;right:6px;z-index:3;"
        + "width:26px;height:26px;font-size:14px;background:rgba(0,0,0,0.7);border-radius:6px;";
      imgWrap.append(shade, eye);
      prevBtn.style.display = i > 0 ? "" : "none";
      nextBtn.style.display = i < filtered.length - 1 ? "" : "none";
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
      document.removeEventListener("keydown", onKey);
      pop.remove();
    }
    closeBtn.addEventListener("click", closePop);
    pop.addEventListener("mousedown", e => { if (e.target === pop) closePop(); });
    document.addEventListener("keydown", onKey);
    render();
    document.body.appendChild(pop);
  }

  async function refresh() {
    try {
      const d = await listImages(imgFolder(state), { limit: 300 });
      images = d.images || [];
    } catch (e) {
      images = [];
      ctx.showPopup?.(`Could not load images: ${e.message || e}`, true);
    }
    renderGrid();
  }

  function show() { ov.style.display = "flex"; refresh(); }
  function hide() {
    ov.style.display = "none";
    pickCallback = null;
    setPostMode(false);
    setSelectMode(false);
  }
  function showPicker(onPick) {
    pickCallback = onPick;
    show();
  }

  ov.append(hdr, postBar, grid, hint);
  return { el: ov, show, hide, showPicker, refresh, isOpen: () => ov.style.display !== "none" };
}

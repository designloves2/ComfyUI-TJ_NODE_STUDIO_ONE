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
import { mediaKey, isBlurred, attachSensitiveToggle } from "../shared/ui_sensitive_media.js";

function imageURL(v) {
  return `/view?filename=${encodeURIComponent(v.filename)}`
    + `&subfolder=${encodeURIComponent(v.subfolder || "")}&type=output`;
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

  hdr.append(filterSel, postBtn, refreshBtn, folderBtn, button("✕ Close", () => hide(), "danger"));

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
  // gridAutoRows is a fixed pixel height (not "auto") deliberately: relying on the card's
  // own CSS aspect-ratio (or an <img>'s intrinsic size before it loads) left every row's
  // auto-computed height near zero in this environment, since the wrapper's only
  // non-absolutely-positioned child was the still-unsized image — rows overlapped and the
  // whole gallery looked like everything crammed onto one unscrollable page. A fixed row
  // height needs nothing from the image to lay out correctly.
  const THUMB = 140;
  const grid = el("div", { style: {
    flex: "1", overflowY: "auto", display: "grid",
    gridTemplateColumns: `repeat(auto-fill, minmax(${THUMB}px, 1fr))`, gridAutoRows: `${THUMB}px`,
    gap: "10px", alignContent: "start",
  }});
  const hint = el("div", { text: "No images yet.", style: { color: C.muted, fontSize: "12px", textAlign: "center", padding: "30px 0", display: "none" } });

  function thumb(v) {
    const key = mediaKey(v.filename, v.subfolder || "");
    const picked = postMode && postPick === vKey(v);
    // Card fills its fixed-height grid cell exactly (see the grid's own comment above);
    // the image is absolutely positioned to match, so it needs nothing of its own to
    // establish a size before or after it loads.
    const card = el("div", { style: {
      position: "relative", width: "100%", height: "100%", borderRadius: "8px", overflow: "hidden",
      background: "#000", border: `1px solid ${picked ? BRAND : C.border}`, cursor: "pointer",
    }});
    const img = el("img", { src: imageURL(v), loading: "lazy",
      style: { position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "cover", display: "block" } });
    card.appendChild(img);
    attachSensitiveToggle?.(card, img, key);

    if (v.favorite) card.appendChild(el("div", { text: "★", title: "Favorite", style: {
      position: "absolute", top: "4px", left: "4px", color: "#ffd75e", fontSize: "13px",
      textShadow: "0 0 3px rgba(0,0,0,0.9)",
    }}));

    const del = el("button", { type: "button", text: "✕", title: "Delete", style: {
      position: "absolute", top: "4px", right: "4px", width: "20px", height: "20px",
      border: "none", borderRadius: "5px", background: "rgba(0,0,0,0.7)", color: "#fff",
      cursor: "pointer", fontSize: "11px", lineHeight: "20px", padding: "0",
    }});
    del.addEventListener("click", (e) => { e.stopPropagation(); askDelete(v); });
    card.appendChild(del);

    const infoBar = el("div", { style: {
      position: "absolute", left: "0", right: "0", bottom: "0", padding: "3px 5px",
      background: "linear-gradient(transparent, rgba(0,0,0,0.85))", fontSize: "9.5px", color: "#ddd",
    }});
    infoBar.textContent = `${fmtSize(v.size)} · ${fmtWhen(v.mtime)}`;
    card.appendChild(infoBar);

    card.addEventListener("click", () => {
      if (pickCallback) { pickImage(v); return; }
      if (postMode) { postPick = vKey(v); refreshPostBar(); renderGrid(); return; }
      window.open(imageURL(v), "_blank");
    });
    return card;
  }

  function renderGrid() {
    clear(grid);
    const filtered = images.filter(matchesFilter);
    countTag.textContent = `${filtered.length} image${filtered.length === 1 ? "" : "s"}`;
    hint.style.display = filtered.length ? "none" : "block";
    filtered.forEach(v => grid.appendChild(thumb(v)));
    refreshPostBar();
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
  }
  function showPicker(onPick) {
    pickCallback = onPick;
    show();
  }

  ov.append(hdr, postBar, grid, hint);
  return { el: ov, show, hide, showPicker, refresh, isOpen: () => ov.style.display !== "none" };
}

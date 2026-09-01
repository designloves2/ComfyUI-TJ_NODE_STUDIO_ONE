// ui_gallery_minimax.js — clip gallery + fullscreen player for MiniMax H3 ONE STUDIO (TJ)
//
// The node's results are videos, so the shared PNG gallery doesn't apply: this lists the
// mp4s written into the output subfolder and plays them full screen with the keyboard
// shortcuts you'd expect from a review pass.
import { composeStitchedPrompt, C, BRAND, el, clear, SUBFOLDER, framesToSeconds, ONE_TAKE_OVERLAP_FRAMES,
         UPSCALE_MODES, FPS } from "./core_minimax.js";
import { button, select, numberField } from "../klein/ui_common.js";
import { listVideos, revealOutputFolder, stitchClips, saveMeta, deleteImage, getMediaFiles,
         copyOutputToInput, discardInputCopy, getVideoInfo, queuePrompt, waitForHistory, historyEntry,
         getClipLastFrame, getSystemPrompt, analyzeImagesNative, writeBriefNative } from "./api_minimax.js";
import { buildUpscaleGraph, buildInterpolateGraph } from "./graph_builder_minimax.js";

const STITCH_MAX = 10;

// Overlap (39) plus four frames of guard — see the note on the trim field below.
const DEFAULT_STITCH_TRIM_FRAMES = ONE_TAKE_OVERLAP_FRAMES + 4;

function viewURL(v) {
  return `/view?filename=${encodeURIComponent(v.filename)}`
    + `&subfolder=${encodeURIComponent(v.subfolder || "")}&type=output`;
}

function thumbURL(v) {
  return `/minimax_h3_one/thumb?filename=${encodeURIComponent(v.filename)}`
    + `&subfolder=${encodeURIComponent(v.subfolder || "")}`;
}

function fmtSize(bytes) {
  if (!bytes) return "";
  const mb = bytes / 1048576;
  return mb >= 1 ? `${mb.toFixed(1)}MB` : `${Math.round(bytes / 1024)}KB`;
}

function fmtWhen(mtime) {
  try { return new Date(mtime * 1000).toLocaleString(); } catch { return ""; }
}

export function createGalleryOverlay(state, ctx) {
  const ov = el("div", { style: {
    position: "absolute", inset: "0", zIndex: "9998",
    background: "rgba(11,11,11,0.985)", borderRadius: "inherit",
    display: "none", flexDirection: "column", padding: "12px", gap: "8px", boxSizing: "border-box",
  }});

  let videos = [];
  let filterFull = false;

  // ── delete confirm — viewport-centered, like Prompt Edit's reset confirm, so it's
  // visible even if the node is scrolled off-screen ──────────────────────────────────
  const deleteConfirmOv = el("div", { style: {
    display: "none", position: "fixed", inset: "0", zIndex: "99999",
    background: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center",
  }});
  const deleteConfirmBox = el("div", { style: {
    background: C.bg1, border: `1px solid ${C.border}`, borderRadius: "10px",
    padding: "18px 20px", width: "320px", boxSizing: "border-box",
    display: "flex", flexDirection: "column", gap: "10px", boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
  }});
  const deleteConfirmTitle = el("div", {
    text: "Delete this clip?",
    style: { color: "#fff", fontSize: "13px", fontWeight: "700" } });
  const deleteConfirmName = el("div", {
    style: { color: C.muted, fontSize: "11px", lineHeight: "1.5", wordBreak: "break-all" } });
  const deleteConfirmWarn = el("div", {
    text: "This can't be undone.",
    style: { color: C.muted, fontSize: "11.5px", lineHeight: "1.5" } });
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

  // Enter = Delete, Esc = Cancel, only while this popup is actually showing — captured
  // at the document level (same pattern as the fullscreen player's onKey below) so it
  // fires regardless of what currently has focus.
  const onDeleteConfirmKey = (e) => {
    if (deleteConfirmOv.style.display === "none") return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelDelete(); }
    else if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); runDelete(); }
  };
  document.addEventListener("keydown", onDeleteConfirmKey, true);

  let pendingDelete = null;   // { filename, subfolder }
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

  const hdr = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" } });
  hdr.appendChild(el("div", { text: "🖼 Gallery", style: { color: "#fff", fontSize: "14px", fontWeight: "700" } }));
  const countTag = el("div", { style: { fontSize: "10.5px", color: C.muted, flex: "1" } });
  hdr.appendChild(countTag);

  const fullBtn = el("button", { type: "button", text: "★ stitched only", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "10.5px", padding: "5px 11px",
    borderRadius: "6px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
  }});
  fullBtn.addEventListener("click", () => {
    filterFull = !filterFull;
    fullBtn.style.background = filterFull ? BRAND : C.bg2;
    fullBtn.style.borderColor = filterFull ? BRAND : C.border;
    renderGrid();
  });
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
    const r = await revealOutputFolder(state.saveSubfolder || SUBFOLDER);
    if (!r.ok) ctx.showPopup?.(`Could not open the folder: ${r.error || "unknown"}`, true);
  });
  // ── stitch mode (A6) — pick clips in click order, then concat server-side ──────────
  let stitchMode = false;
  let stitchOrder = [];   // array of video keys (filename|subfolder), in pick order
  const vKey = v => `${v.subfolder || ""}|${v.filename}`;

  const stitchBtn = el("button", { type: "button", text: "🔗 Stitch", title: "Pick clips in order, then combine into one file", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "10.5px", padding: "5px 11px",
    borderRadius: "6px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
  }});
  stitchBtn.addEventListener("click", () => setMode(stitchMode ? null : "stitch"));
  // ── post-processing modes — upscale / interpolate one finished video ────────────
  //
  // Same shape as stitch mode (arm a mode, pick from the grid, run from a bar), but the
  // target is a single video: both operations are per-file, and running them over a
  // multi-pick would just be a batch queue nobody asked for. The three modes are mutually
  // exclusive because they all take over what a click on a card means.
  let postMode = null;        // null | "upscale" | "rife"
  let postPick = null;        // video key

  const upBtn = el("button", { type: "button", text: "⬆ Upscale", title: "Pick one clip, then upscale it", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "10.5px", padding: "5px 11px",
    borderRadius: "6px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
  }});
  const rifeBtn = el("button", { type: "button", text: "🎞 Interpolate", title: "Pick one clip, then interpolate it to a higher frame rate", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "10.5px", padding: "5px 11px",
    borderRadius: "6px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
  }});

  /**
   * Arm one mode and disarm the others; `null` returns the grid to plain browsing.
   *
   * `render` is false when closing: hide() has just emptied the grid to stop the hover
   * videos, and rebuilding it here would put them straight back.
   */
  function setMode(m, render = true) {
    if (postRunning) return;                     // never swap modes mid-job
    stitchMode = (m === "stitch");
    postMode   = (m === "upscale" || m === "rife") ? m : null;
    stitchOrder = []; oneTakeUserSet = false; postPick = null;
    const paint = (btn, on) => {
      btn.style.background  = on ? BRAND : C.bg2;
      btn.style.borderColor = on ? BRAND : C.border;
    };
    paint(stitchBtn, stitchMode);
    paint(upBtn,   postMode === "upscale");
    paint(rifeBtn, postMode === "rife");
    stitchBar.style.display        = stitchMode ? "flex" : "none";
    audioOverrideBar.style.display = stitchMode ? "flex" : "none";
    upBar.style.display   = postMode === "upscale" ? "flex" : "none";
    rifeBar.style.display = postMode === "rife"    ? "flex" : "none";
    if (render) renderGrid();
  }
  upBtn.addEventListener("click",   () => setMode(postMode === "upscale" ? null : "upscale"));
  rifeBtn.addEventListener("click", () => setMode(postMode === "rife"    ? null : "rife"));

  hdr.append(fullBtn, stitchBtn, upBtn, rifeBtn, refreshBtn, folderBtn, button("✕ Close", () => hide(), "danger"));

  const stitchBar = el("div", { style: {
    display: "none", flexShrink: "0", alignItems: "center", gap: "8px",
    background: C.bg1, border: `1px solid ${BRAND}`, borderRadius: "8px", padding: "7px 10px",
  }});
  const stitchInfo = el("div", { style: { flex: "1", fontSize: "10.5px", color: C.text } });
  const stitchClearBtn = el("button", { type: "button", text: "✕ Clear", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "10.5px", padding: "5px 10px",
    borderRadius: "6px", background: C.bg2, color: C.muted, border: `1px solid ${C.border}`,
  }});
  stitchClearBtn.addEventListener("click", () => { stitchOrder = []; oneTakeUserSet = false; renderGrid(); });

  // Clips rendered by Continuity: One-Take share `overlap` seconds at every boundary by
  // construction (each clip's head is the previous clip's tail — see
  // TJ_H3_LatentContinuation), so a plain concat would show that stretch twice. Each such
  // clip carries meta.onetake from the run that made it, so this auto-checks when every
  // picked clip agrees — but stays a manual override either way, since a user might mix
  // clips from a run made before this flag existed.
  const oneTakeLabel = el("label", { style: {
    display: "flex", alignItems: "center", gap: "5px", fontSize: "10.5px", color: C.text, cursor: "pointer",
  }});
  const oneTakeCb = el("input", { type: "checkbox" });
  oneTakeCb.style.cursor = "pointer";
  let oneTakeUserSet = false;
  oneTakeCb.addEventListener("change", () => { oneTakeUserSet = true; });
  oneTakeLabel.append(oneTakeCb, el("span", { text: "One-Take (trim)" }));

  // How many frames to drop from the head of every clip after the first.
  //
  // The overlap itself is 39 frames, but trimming exactly that leaves the artefact that
  // sits right on the seam: the carried latent is spliced in hard, with no feathering, so
  // the VAE produces a few frames of colour breakup where it meets freshly sampled
  // content. Measured on a matched pair at 0.2MP (same seed, same prompt, only the
  // accelerators differing), the frame-to-frame colour jump peaked at 184x baseline with
  // Spectrum + FirstBlockCache on and still 50x with every accelerator off — so the
  // accelerators amplify it roughly threefold but are not the cause. The breakup spans
  // frames 39-42 consistently, hence 43 as the default here: overlap plus four frames of
  // guard. Editable because the artefact's length varies a little with the material, and
  // because a run stitched by hand is exactly where you would want to tune it.
  const trimLabel = el("label", { style: {
    display: "flex", alignItems: "center", gap: "4px", fontSize: "10.5px", color: C.text,
  }});
  const trimIn = el("input", { type: "number", min: "0", max: "240", step: "1", style: {
    width: "48px", boxSizing: "border-box", background: C.bg2, color: C.text,
    border: `1px solid ${C.border}`, borderRadius: "5px", padding: "3px 4px",
    fontSize: "10.5px", fontFamily: "inherit", outline: "none",
  }});
  trimIn.value = String(state.stitchTrimFrames ?? DEFAULT_STITCH_TRIM_FRAMES);
  trimIn.title = "Frames trimmed from the head of every clip after the first.\n"
    + `${ONE_TAKE_OVERLAP_FRAMES} = the overlap alone; the default adds a few frames of guard `
    + "because the seam itself shows some colour breakup.";
  trimIn.addEventListener("input", () => {
    state.stitchTrimFrames = Math.max(0, Math.round(parseFloat(trimIn.value) || 0));
    ctx.persist?.();
    refreshStitchBar();
  });
  trimLabel.append(el("span", { text: "trim" }), trimIn, el("span", { text: "f", style: { color: C.muted } }));

  const stitchGoBtn = button("🔗 Combine", () => runStitch(), "primary");
  stitchBar.append(stitchInfo, oneTakeLabel, trimLabel, stitchClearBtn, stitchGoBtn);

  // ── post-processing bars ────────────────────────────────────────────────────────
  //
  // Both jobs go through the normal /prompt queue, so they cost a real queue turn and
  // compete with a generation for the GPU. `postRunning` is what stops a second one being
  // started on top — the mode buttons and both Run buttons all check it.
  let postRunning = false;

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

  /**
   * The shared progress readout for both bars.
   *
   * RTX VSR reports nothing — it upscales the whole batch inside a single node call, so
   * there is no per-step event to listen to and the bar just says it is working. The other
   * two (ImageUpscaleWithModel, RIFEInterpolation) tick per frame, so they get a real bar.
   */
  function makeProgress() {
    const wrap = el("div", { style: { flex: "1", minWidth: "150px", display: "flex", alignItems: "center", gap: "7px" } });
    const text = el("div", { style: { fontSize: "10.5px", color: C.text, whiteSpace: "nowrap" } });
    const track = el("div", { style: {
      flex: "1", height: "5px", borderRadius: "3px", background: C.bg2, overflow: "hidden", display: "none",
    }});
    const fill = el("div", { style: { width: "0%", height: "100%", background: BRAND, transition: "width .12s linear" } });
    track.appendChild(fill);
    wrap.append(text, track);
    return {
      el: wrap,
      idle(msg) { text.textContent = msg; track.style.display = "none"; fill.style.width = "0%"; },
      busy(msg) { text.textContent = msg; track.style.display = "none"; },
      step(v, m) {
        track.style.display = "block";
        const pct = Math.max(0, Math.min(100, (v / m) * 100));
        fill.style.width = `${pct.toFixed(1)}%`;
        text.textContent = `${Math.round(pct)}% · ${v} / ${m}`;
      },
      // Overall progress across a chunked job: chunk index plus how far the current
      // chunk's own step got, so the bar advances smoothly instead of resetting to 0%
      // at every chunk boundary.
      chunkStep(idx, count, v, m) {
        track.style.display = "block";
        const within = m ? v / m : 0;
        const pct = Math.max(0, Math.min(100, ((idx + within) / count) * 100));
        fill.style.width = `${pct.toFixed(1)}%`;
        text.textContent = count > 1
          ? `chunk ${idx + 1}/${count} · ${Math.round(within * 100)}% (${Math.round(pct)}% overall)`
          : `${Math.round(pct)}% · ${v} / ${m}`;
      },
    };
  }

  // ── Upscale ─────────────────────────────────────────────────────────────────────
  // Both methods from the left panel are offered here, defaulting to whatever that panel
  // is set to, so a clip can be upscaled after the fact with the settings it would have
  // been given during the run.
  const upBar = el("div", { style: Object.assign({}, barStyle) });
  const upProg = makeProgress();
  let upMethod = (state.upscaleMode && state.upscaleMode !== "none") ? state.upscaleMode : "model";

  // None belongs here: with deblur beside it, "no upscale" is a real choice rather than
  // an absence, and it is what makes the Upscale button able to run a deblur-only pass.
  const upMethodSel = el("select", { style: smallSelect("112px") },
    UPSCALE_MODES.map(m => el("option", { value: m.key, text: m.label })));
  upMethodSel.value = upMethod;
  const upModelSel = el("select", { style: smallSelect("172px") });
  const upModelWrap = el("label", { style: { display: "flex", alignItems: "center", gap: "4px", fontSize: "10.5px", color: C.text } });
  upModelWrap.append(el("span", { text: "model" }), upModelSel);

  const rtxScaleIn = el("input", { type: "number", min: "1", max: "4", step: "0.25", style: smallInput("52px") });
  rtxScaleIn.value = String(state.rtxScale ?? 2.0);
  const rtxQualSel = el("select", { style: smallSelect("88px") },
    ["LOW", "MEDIUM", "HIGH", "ULTRA"].map(q => el("option", { value: q, text: q })));
  rtxQualSel.value = state.rtxQuality || "ULTRA";
  const rtxWrap = el("div", { style: { display: "none", alignItems: "center", gap: "8px" } });
  rtxWrap.append(
    el("label", { style: { display: "flex", alignItems: "center", gap: "4px", fontSize: "10.5px", color: C.text } },
      [el("span", { text: "scale" }), rtxScaleIn, el("span", { text: "x", style: { color: C.muted } })]),
    el("label", { style: { display: "flex", alignItems: "center", gap: "4px", fontSize: "10.5px", color: C.text } },
      [el("span", { text: "quality" }), rtxQualSel]),
  );

  // Deblur sharpens at the clip's own resolution and is a separate job from upscaling:
  // its own button runs it alone, and the select also feeds the Upscale button so one
  // pass can deblur then upscale without writing an intermediate file. Pressing one
  // button never triggers the other's work.
  const deblurSel = el("select", { style: smallSelect("96px") },
    [{ v: "none", t: "off" }, { v: "LOW", t: "Low" }, { v: "MEDIUM", t: "Medium" },
     { v: "HIGH", t: "High" }, { v: "ULTRA", t: "Ultra" }]
      .map(o => el("option", { value: o.v, text: o.t })));
  deblurSel.value = "none";
  const deblurWrap = el("label", { style: { display: "flex", alignItems: "center", gap: "4px", fontSize: "10.5px", color: C.text } },
    [el("span", { text: "deblur" }), deblurSel]);
  const deblurGoBtn = button("✦ Deblur", () => runDeblur());

  function refreshUpModels() {
    const list = (ctx.availableModels?.upscale_models || []).filter(x => x && x !== "none");
    clear(upModelSel);
    if (!list.length) {
      upModelSel.appendChild(el("option", { value: "", text: "— none installed —" }));
    } else {
      const want = list.includes(state.upscaleModel) ? state.upscaleModel : list[0];
      list.forEach(m => upModelSel.appendChild(el("option", { value: m, text: m })));
      upModelSel.value = want;
    }
  }

  function refreshUpBar() {
    const isRtx = upMethod === "rtx";
    const isNone = upMethod === "none";
    upModelWrap.style.display = (isRtx || isNone) ? "none" : "flex";
    rtxWrap.style.display     = isRtx ? "flex" : "none";
    const rtxOk = !!ctx.availability?.RTXVideoSuperResolution;
    // With Upscale = None the button runs the deblur pass alone, so it needs deblur set
    // rather than a model or the RTX node.
    const ready = !!postPick && !postRunning &&
      (noUpscale ? (deblurOn && deblurOk) : (isRtx ? rtxOk : !!upModelSel.value));
    upGoBtn.disabled = !ready;
    upGoBtn.style.opacity = ready ? "1" : "0.5";
    const deblurOn = deblurSel.value !== "none";
    const deblurOk = !!ctx.availability?.TJ_RTXDeblur;
    const deblurReady = !!postPick && !postRunning && deblurOn && deblurOk;
    const noUpscale = upMethod === "none";
    deblurGoBtn.disabled = !deblurReady;
    deblurGoBtn.style.opacity = deblurReady ? "1" : "0.5";
    if (postRunning) return;
    if (deblurOn && !deblurOk) upProg.idle("⚠ RTX Deblur node is not installed — restart ComfyUI.");
    else if (noUpscale && !deblurOn) upProg.idle("Pick a deblur strength, or an upscale method.");
    else if (isRtx && !rtxOk) upProg.idle("⚠ RTX VSR node is not installed.");
    else if (!isRtx && !isNone && !upModelSel.value) upProg.idle("⚠ No upscale model installed.");
    else if (!postPick) upProg.idle("Pick one clip to upscale.");
    else upProg.idle(pickName());
  }
  upMethodSel.addEventListener("change", () => { upMethod = upMethodSel.value; refreshUpBar(); });
  upModelSel.addEventListener("change", refreshUpBar);
  deblurSel.addEventListener("change", refreshUpBar);

  const upGoBtn = button("⬆ Upscale", () => runUpscale(), "primary");
  upBar.append(upProg.el, deblurWrap, deblurGoBtn, upMethodSel, upModelWrap, rtxWrap, upGoBtn);

  // ── Interpolate ─────────────────────────────────────────────────────────────────
  // RIFEInterpolation takes a source/target fps pair, not a multiplier, so the options
  // here are the node's own: any target rate is reachable, 24 -> 60 included.
  const rifeBar = el("div", { style: Object.assign({}, barStyle) });
  const rifeProg = makeProgress();

  // Source rate is not a field: every clip in this gallery was rendered at FPS (24), so
  // there is nothing to choose. Only the target is up to the user.
  const rifeDstIn = el("input", { type: "number", min: "1", max: "240", step: "1", style: smallInput("50px") });
  rifeDstIn.value = String(FPS * 2);
  const rifeScaleSel = el("select", { style: smallSelect("64px") },
    ["0.25", "0.5", "1.0", "2.0", "4.0"].map(v => el("option", { value: v, text: v })));
  rifeScaleSel.value = "1.0";
  const rifeBatchIn = el("input", { type: "number", min: "1", max: "32", step: "1", style: smallInput("46px") });
  rifeBatchIn.value = "8";
  const rifeFp16Cb = el("input", { type: "checkbox" }); rifeFp16Cb.checked = true; rifeFp16Cb.style.cursor = "pointer";
  const cbLabel = (cb, t, tip) => {
    const l = el("label", { title: tip || "", style: {
      display: "flex", alignItems: "center", gap: "4px", fontSize: "10.5px", color: C.text, cursor: "pointer",
    }});
    l.append(cb, el("span", { text: t }));
    return l;
  };
  const fieldLabel = (t, node, tip, suffix) => {
    const l = el("label", { title: tip || "", style: {
      display: "flex", alignItems: "center", gap: "4px", fontSize: "10.5px", color: C.text,
    }});
    l.append(el("span", { text: t }), node);
    if (suffix) l.append(el("span", { text: suffix, style: { color: C.muted } }));
    return l;
  };

  function refreshRifeBar() {
    const ok = !!ctx.availability?.RIFEInterpolation;
    const dst = Number(rifeDstIn.value) || 0;
    const sane = dst > FPS;
    const ready = !!postPick && !postRunning && ok && sane;
    rifeGoBtn.disabled = !ready;
    rifeGoBtn.style.opacity = ready ? "1" : "0.5";
    if (postRunning) return;
    if (!ok) rifeProg.idle("⚠ RIFE Frame Interpolation is not installed.");
    else if (!sane) rifeProg.idle(`⚠ Target fps must be above ${FPS}.`);
    else if (!postPick) rifeProg.idle("Pick one clip to interpolate.");
    else rifeProg.idle(`${pickName()} · ${FPS} → ${dst} fps`);
  }
  rifeDstIn.addEventListener("input", refreshRifeBar);

  const rifeGoBtn = button("🎞 Interpolate", () => runInterpolate(), "primary");
  rifeBar.append(
    rifeProg.el,
    fieldLabel(`${FPS} fps →`, rifeDstIn, "Frame rate after interpolation. The clip keeps its running time.", "fps"),
    fieldLabel("scale", rifeScaleSel, "Motion is estimated at this scale. Below 1.0 is faster and lighter on VRAM, and a little less accurate."),
    fieldLabel("batch", rifeBatchIn, "Frames processed in parallel. Higher is faster and uses more VRAM."),
    cbLabel(rifeFp16Cb, "fp16", "Half precision — faster, lower VRAM. Needs a CUDA GPU."),
    rifeGoBtn,
  );

  function pickedVideo() { return postPick ? videos.find(v => vKey(v) === postPick) : null; }
  function pickName() { const v = pickedVideo(); return v ? v.filename : ""; }
  function refreshPostBars() { refreshUpBar(); refreshRifeBar(); }

  // Every requested frame gets materialized as a float32 RGBA array by VHS_LoadVideo
  // before any node touches it, so asking for a whole long/high-res clip in one shot can
  // exceed available RAM — a "★ stitched" full run easily runs into the thousands of
  // frames. The budget is per-chunk RAM, not resolution, so it scales the chunk length
  // down automatically for a bigger frame: a 1088x736 clip and a 4K one both stay under
  // roughly the same footprint per chunk.
  const CHUNK_BUDGET_BYTES = 1.25 * 1024 ** 3;
  const CHUNK_MIN_FRAMES = 8;
  const CHUNK_MAX_FRAMES = 240;

  // Chunking is decided by the source's DURATION, per method (the user's rule):
  //   RTX VSR / RTX-based Deblur : < 15s whole file, else 15s chunks
  //   Upscale model              : < 10s whole file, else  5s chunks
  //   Deblur + model together    : the model rule (stricter) wins
  //   Interpolate                : no rule — falls through to the byte budget below
  // `chunkPlan(durationSec)` returns the chunk length in seconds, or 0 for whole-file.
  const RTX_PLAN   = (d) => (d < 15 ? 0 : 15);
  const MODEL_PLAN = (d) => (d < 10 ? 0 : 5);

  /**
   * Shared run wrapper: copy the source into input/, queue the graph (chunked if the
   * source is long or large enough to risk exhausting RAM), reload the grid.
   *
   * `buildFn(inputFile, stem, chunkOpts)` returns `{ graph, saveNode }`; chunkOpts carries
   * `{ folder, skipFirstFrames, frameLoadCap, saveSuffix }` when chunking, or is `{}` for
   * a plain single-shot job — both graph builders default those to their old whole-file
   * behaviour, so a caller that ignores chunkOpts still works.
   */
  // A single-shot post-process is a minutes-long ComfyUI job whose meta is written by
  // this client after it finishes. A page reload (or ComfyUI Manager reboot, which
  // reloads the frontend) mid-job would leave the output file with no metadata. So the
  // job is stashed on queue and picked up again when the gallery next opens — the same
  // reattach the main render uses. Chunked jobs aren't resumable (the slicing loop would
  // have to be replayed); the "keep this tab open" line covers those.
  const POST_JOB_KEY = "mmh3_post_job";
  const stashPostJob = (j) => { try { localStorage.setItem(POST_JOB_KEY, JSON.stringify(j)); } catch {} };
  const clearPostJob = () => { try { localStorage.removeItem(POST_JOB_KEY); } catch {} };

  // A human `postProcess` label that names every stage that ran, so a combined
  // deblur→upscale pass no longer reads as just "upscale". `deblur` / `upscale` are the
  // structured fields the card badges and Reuse read — the same keys buildClipGraph writes
  // for an inline pass, so both paths look identical to a reader.
  function postLabel(fallback, info = {}) {
    const parts = [];
    if (info.deblur && info.deblur !== "none") parts.push("deblur");
    if (info.upscale) parts.push(info.upscale.method === "rtx" ? "rtx upscale" : "upscale");
    if (info.interpolate) parts.push("interpolation");
    return parts.length ? parts.join(" + ") : String(fallback).toLowerCase();
  }

  // Copy the source clip's meta onto the post-processed file (§5 — Reuse rebuilds the
  // original), but correct the geometry to what the job actually produced.
  async function writePostMeta(outFile, srcMeta, srcFilename, label, postInfo = {}) {
    if (!outFile || !srcMeta) return;
    const patched = {
      ...srcMeta, created: Date.now(),
      postProcess: postLabel(label, postInfo), postSource: srcFilename,
    };
    delete patched.elapsedSec;
    delete patched.sourceW; delete patched.sourceH;   // recomputed below, only on a real size change
    if (postInfo.deblur && postInfo.deblur !== "none") patched.deblur = postInfo.deblur;
    if (postInfo.upscale)     patched.upscale     = postInfo.upscale;
    if (postInfo.interpolate) patched.interpolate = postInfo.interpolate;
    try {
      const oi = await getVideoInfo(outFile.filename, outFile.subfolder || "", "output");
      if (oi?.width || oi?.height) {
        if ((oi.width && oi.width !== srcMeta.w) || (oi.height && oi.height !== srcMeta.h)) {
          patched.sourceW = srcMeta.w; patched.sourceH = srcMeta.h;
        }
        if (oi.width)  patched.w = oi.width;
        if (oi.height) patched.h = oi.height;
      }
      if (oi?.frames) { patched.frames = oi.frames; patched.durationSeconds = oi.frames / (oi.fps || FPS); }
      if (oi?.fps)    patched.fps = oi.fps;
    } catch { /* keep the source geometry rather than fail */ }
    await saveMeta(outFile.filename, outFile.subfolder || "", patched).catch(() => {});
  }

  // Reattach to a single-shot post-process that was in flight when the tab went away.
  async function resumePostJob() {
    if (postRunning) return;
    let job = null;
    try { job = JSON.parse(localStorage.getItem(POST_JOB_KEY) || "null"); } catch {}
    if (!job || !job.promptId) return;
    const entry = await historyEntry(job.promptId);
    if (!entry) { clearPostJob(); return; }          // ComfyUI has no record — nothing to resume
    postRunning = true; refreshPostBars();
    upProg.busy(`Reattaching to ${job.label}…`);
    try {
      const res = entry.status?.completed
        ? { byNode: entry.outputs || {} }
        : await waitForHistory(job.promptId, { onProgress: (v, m) => upProg.chunkStep(0, 1, v, m) });
      const o = res.byNode?.[job.saveNode]?.images?.[0] || res.byNode?.[job.saveNode]?.gifs?.[0];
      if (o) {
        await writePostMeta({ filename: o.filename, subfolder: o.subfolder || job.outFolder }, job.srcMeta, job.src, job.label, job.postInfo || {});
        upProg.idle(`✓ ${job.label} done (resumed).`);
        ctx.showPopup?.(`${job.label} finished while the tab was away — its settings were restored.`, false);
      } else {
        upProg.idle(`✕ ${job.label}: no output found on resume.`);
      }
    } catch (e) {
      upProg.idle(`✕ ${job.label}: ${e?.message || e}`);
    } finally {
      await discardInputCopy(job.copied).catch(() => {});
      clearPostJob();
      postRunning = false;
      refreshPostBars();
      await refresh();
    }
  }

  // `finalSuffix` is what the single-shot path's builder would have appended on its own.
  // The chunked path builds its chunks with saveSuffix:"" and joins them itself, so
  // without this the joined file lands under the source's bare stem — colliding with the
  // namespace of fresh, unprocessed renders.
  async function runPost(prog, label, buildFn, finalSuffix, chunkPlan, postInfo = {}) {
    const v = pickedVideo();
    if (!v || postRunning) return;
    postRunning = true;
    refreshPostBars();
    clearPostJob();
    prog.busy(`Preparing ${v.filename}… — keep this tab open`);
    let copied = null;
    const chunkFiles = [];   // { filename, subfolder } written to the temp chunk folder
    try {
      // VHS_LoadVideo only lists ComfyUI's input folder, so the finished mp4 has to be
      // copied there first — copy_to_input is format-agnostic, it just moves bytes.
      const inputFile = await copyOutputToInput(v.filename, v.subfolder || "", "output");
      copied = inputFile;
      const stem = v.filename.replace(/\.[^.]+$/, "");
      const outFolder = state.saveSubfolder || SUBFOLDER;

      // Chunk sizing. If video_info can't be read (ffprobe missing, odd container), fall
      // back to a single whole-file job rather than failing outright — that's exactly the
      // old behaviour, so short clips are unaffected either way.
      let chunkFrames = 0, totalFrames = 0;
      try {
        const info = await getVideoInfo(inputFile, "", "input");
        const fps = info.fps || FPS;
        totalFrames = info.frames || 0;
        const durationSec = totalFrames > 0 ? totalFrames / fps : 0;
        if (chunkPlan && durationSec > 0) {
          const cs = chunkPlan(durationSec);                    // seconds per chunk, 0 = whole file
          chunkFrames = cs > 0 ? Math.round(cs * fps) : 0;
        } else {
          // Interpolate / no rule: keep the RAM byte budget as the sizing fallback.
          const perFrameBytes = Math.max(1, (info.width || 0) * (info.height || 0) * 16);
          chunkFrames = Math.max(CHUNK_MIN_FRAMES, Math.min(CHUNK_MAX_FRAMES,
            Math.floor(CHUNK_BUDGET_BYTES / perFrameBytes)));
        }
      } catch { /* handled below by chunkCount defaulting to 1 */ }
      const chunkCount = (totalFrames > 0 && chunkFrames > 0 && totalFrames > chunkFrames)
        ? Math.ceil(totalFrames / chunkFrames) : 1;

      let outFile = null;   // what the job actually wrote, so its metadata can follow
      if (chunkCount === 1) {
        const { graph, saveNode } = buildFn(inputFile, stem, {});
        prog.busy(`${label}… — keep this tab open (this takes minutes)`);
        const res = await queuePrompt(graph, {
          onProgress: (val, max) => prog.chunkStep(0, 1, val, max),
          onQueued: (pid) => stashPostJob({
            promptId: pid, saveNode, label, postInfo,
            src: v.filename, srcMeta: v.meta, copied: inputFile, outFolder,
          }),
        });
        const o = res.byNode[saveNode]?.images?.[0] || res.byNode[saveNode]?.gifs?.[0];
        if (o) outFile = { filename: o.filename, subfolder: o.subfolder || outFolder };
      } else {
        // Same VHS_LoadVideo source, sliced by skip_first_frames/frame_load_cap — audio
        // slices the same way (VHS derives its start/duration from those two fields), so
        // each chunk's own soundtrack lines up with its frames. Chunks land in a scratch
        // subfolder and get stream-copy concatenated afterward, then deleted.
        const chunkSub = `${outFolder}/._post_chunks`;
        for (let i = 0; i < chunkCount; i++) {
          const skip = i * chunkFrames;
          const cap = Math.min(chunkFrames, totalFrames - skip);
          const { graph, saveNode } = buildFn(inputFile, `${stem}_c${String(i).padStart(3, "0")}`, {
            folder: chunkSub, skipFirstFrames: skip, frameLoadCap: cap, saveSuffix: "",
          });
          prog.busy(`${label} — preparing chunk ${i + 1}/${chunkCount}…`);
          const res = await queuePrompt(graph, {
            onProgress: (val, max) => prog.chunkStep(i, chunkCount, val, max),
          });
          const out = res.byNode[saveNode]?.images?.[0] || res.byNode[saveNode]?.gifs?.[0];
          if (!out) throw new Error(`chunk ${i + 1}/${chunkCount} produced no output`);
          chunkFiles.push({ filename: out.filename, subfolder: out.subfolder || chunkSub });
        }
        prog.busy(`${label} — joining ${chunkCount} chunks…`);
        // Every chunk shares the same codec, resolution, and fps, so this is a plain
        // stream-copy concat (overlap/trim both 0) — no re-encode, no quality loss.
        const joined = await stitchClips(chunkFiles, `${outFolder}/${stem}${finalSuffix || ""}`, 0, 0, null);
        if (joined?.filename) outFile = { filename: joined.filename, subfolder: joined.subfolder || outFolder };
      }

      // The prompt / seed / pipeline copied here are the SOURCE's (Reuse rebuilds the
      // original, SPEC §5); the geometry is corrected to the OUTPUT's inside writePostMeta.
      await writePostMeta(outFile, v.meta, v.filename, label, postInfo);

      prog.idle(`✓ ${label} done.`);
      ctx.showPopup?.(`${label} finished — the new file is at the top of the gallery.`, false);
      postPick = null;
      await refresh();
    } catch (e) {
      const msg = e?.message || String(e);
      prog.idle(`✕ ${msg}`);
      ctx.showPopup?.(`${label} failed: ${msg}`, true);
    } finally {
      // Clean up in both the success and failure paths: whatever chunks did get written,
      // and the source copy that only ever existed to feed VHS_LoadVideo.
      for (const f of chunkFiles) await deleteImage(f.filename, f.subfolder).catch(() => {});
      await discardInputCopy(copied);
      clearPostJob();
      postRunning = false;
      refreshPostBars();
    }
  }

  function runUpscale() {
    const rtxScale = Math.max(1, Math.min(4, parseFloat(rtxScaleIn.value) || 2));
    const upscale = upMethod === "none" ? null
      : upMethod === "rtx" ? { method: "rtx", scale: rtxScale, quality: rtxQualSel.value }
      : { method: "model", model: upModelSel.value };
    return runPost(upProg, "Upscale", (inputFile, stem, chunkOpts) => buildUpscaleGraph({
      inputFile, stem,
      folder: chunkOpts.folder || (state.saveSubfolder || SUBFOLDER),
      method: upMethod,
      modelName: upModelSel.value,
      rtxScale,
      rtxQuality: rtxQualSel.value,
      deblur: deblurSel.value,
      skipFirstFrames: chunkOpts.skipFirstFrames,
      frameLoadCap: chunkOpts.frameLoadCap,
      saveSuffix: upMethod === "none" && chunkOpts.saveSuffix === "_upscaled"
        ? "_deblur" : chunkOpts.saveSuffix,
    }, ctx.availability || {}), upMethod === "none" ? "_deblur" : "_upscaled",
      upMethod === "model" ? MODEL_PLAN : RTX_PLAN,
      { deblur: deblurSel.value, upscale });
  }

  /** Deblur with no upscale: method "none" makes the graph builder skip both upscalers. */
  function runDeblur() {
    return runPost(upProg, "Deblur", (inputFile, stem, chunkOpts) => buildUpscaleGraph({
      inputFile, stem,
      folder: chunkOpts.folder || (state.saveSubfolder || SUBFOLDER),
      method: "none",
      deblur: deblurSel.value,
      skipFirstFrames: chunkOpts.skipFirstFrames,
      frameLoadCap: chunkOpts.frameLoadCap,
      saveSuffix: chunkOpts.saveSuffix === "_upscaled" ? "_deblur" : chunkOpts.saveSuffix,
    }, ctx.availability || {}), "_deblur", RTX_PLAN,
      { deblur: deblurSel.value, upscale: null });
  }

  function runInterpolate() {
    return runPost(rifeProg, "Interpolation", (inputFile, stem, chunkOpts) => buildInterpolateGraph({
      inputFile, stem,
      folder: chunkOpts.folder || (state.saveSubfolder || SUBFOLDER),
      sourceFps: FPS,
      targetFps: Number(rifeDstIn.value) || FPS * 2,
      scale: parseFloat(rifeScaleSel.value) || 1.0,
      batchSize: parseInt(rifeBatchIn.value, 10) || 8,
      useFp16: rifeFp16Cb.checked,
      skipFirstFrames: chunkOpts.skipFirstFrames,
      frameLoadCap: chunkOpts.frameLoadCap,
      saveSuffix: chunkOpts.saveSuffix,
    }, ctx.availability || {}), `_${Math.round(Number(rifeDstIn.value) || FPS * 2)}fps`,
      null, { interpolate: { targetFps: Number(rifeDstIn.value) || FPS * 2 } });
    // no chunkPlan → interpolate keeps the RAM byte-budget sizing
  }

  // Optional: swap the combined result's audio for a separate source file entirely (e.g. a
  // full backing track), instead of whatever the picked clips' own audio was. Independent of
  // the node's own Audio Lock file — this is its own picker over models/input's audio files.
  let audioOverrideOn = false, audioOverrideFile = "", audioOverrideStart = 0, audioFilesCache = null;
  const audioOverrideBar = el("div", { style: {
    display: "none", flexShrink: "0", alignItems: "center", gap: "8px", flexWrap: "wrap",
    background: C.bg1, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "7px 10px",
  }});
  const audioOverrideCb = el("input", { type: "checkbox" });
  audioOverrideCb.style.cursor = "pointer";
  const audioOverrideLabel = el("label", { style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "10.5px", color: C.text, cursor: "pointer" } },
    [audioOverrideCb, el("span", { text: "🎵 Replace audio with:" })]);
  const audioSelectWrap = el("div", { style: { minWidth: "180px" } });
  const startField = numberField(0, v => { audioOverrideStart = Math.max(0, v); }, 0.1);
  const startFieldWrap = el("div", { style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "10.5px", color: C.muted } },
    [el("span", { text: "start(s)" }), startField]);
  audioOverrideBar.append(audioOverrideLabel, audioSelectWrap, startFieldWrap);

  function renderAudioSelect() {
    clear(audioSelectWrap);
    const files = audioFilesCache || [];
    const opts = ["", ...files].map(f => ({ value: f, label: f || (audioFilesCache ? "— pick a file —" : "loading…") }));
    const sel = select(opts, audioOverrideFile, v => { audioOverrideFile = v; });
    sel.style.fontSize = "10.5px";
    audioSelectWrap.appendChild(sel);
  }
  renderAudioSelect();

  audioOverrideCb.addEventListener("change", () => {
    audioOverrideOn = audioOverrideCb.checked;
    if (audioOverrideOn && audioFilesCache === null) {
      getMediaFiles().then(d => { audioFilesCache = d.audios || []; renderAudioSelect(); })
                     .catch(() => { audioFilesCache = []; renderAudioSelect(); });
    }
  });

  function refreshStitchBar() {
    const picked = stitchOrder.map(k => videos.find(v => vKey(v) === k)).filter(Boolean);
    const known = picked.map(v => v.meta?.frames ? framesToSeconds(v.meta.frames) : null);
    const total = known.every(s => s != null) ? known.reduce((a, b) => a + b, 0) : null;
    const sizes = new Set(picked.map(v => `${v.meta?.w || "?"}x${v.meta?.h || "?"}`));

    if (!oneTakeUserSet) oneTakeCb.checked = picked.length > 0 && picked.every(v => v.meta?.onetake === true);

    let text = `${picked.length} / ${STITCH_MAX} selected`;
    if (picked.length >= STITCH_MAX) text += " · longer edits need a real video editor";
    if (total != null) {
      const trimmed = oneTakeCb.checked && picked.length > 1
        ? total - (picked.length - 1) * trimSeconds()
        : total;
      text += ` · ≈${trimmed.toFixed(2)}s`;
    }
    if (sizes.size > 1) text += ` · ⚠ mixed resolution (${[...sizes].join(", ")}) — stitch may fail or look off`;
    stitchInfo.textContent = text;
    stitchGoBtn.disabled = picked.length < 2;
    stitchGoBtn.style.opacity = picked.length < 2 ? "0.5" : "1";
  }

  // Frames are the unit that matters here (the artefact is N frames wide), but the
  // stitch API takes seconds — convert once, in one place.
  function trimSeconds() {
    const f = Math.max(0, Math.round(state.stitchTrimFrames ?? DEFAULT_STITCH_TRIM_FRAMES));
    return framesToSeconds(f);
  }

  async function runStitch() {
    const picked = stitchOrder.map(k => videos.find(v => vKey(v) === k)).filter(Boolean);
    if (picked.length < 2) return;
    stitchGoBtn.disabled = true;
    const overlapSec = oneTakeCb.checked ? trimSeconds() : null;
    stitchInfo.textContent = `Stitching ${picked.length} clips${overlapSec ? ` (One-Take, ${overlapSec.toFixed(3)}s overlap trimmed)` : ""}…`;
    try {
      const folder = (state.saveSubfolder || SUBFOLDER).replace(/\\/g, "/");
      const audioOverride = audioOverrideOn && audioOverrideFile ? { filename: audioOverrideFile, start: audioOverrideStart } : null;
      const out = await stitchClips(
        picked.map(v => ({ filename: v.filename, subfolder: v.subfolder || "" })),
        `${folder}/${state.filenamePrefix || "MMH3"}_full`, null, overlapSec, audioOverride,
      );
      const known = picked.map(v => v.meta?.frames ? framesToSeconds(v.meta.frames) : null);
      const rawTotal = known.every(s => s != null) ? known.reduce((a, b) => a + b, 0) : null;
      const durationSeconds = rawTotal != null && overlapSec ? rawTotal - (picked.length - 1) * overlapSec : rawTotal;
      // Carry the first clip's full metadata - resolution, steps, seed, every pipeline
      // axis - rather than writing a thin record: the stitched file is the same run, and
      // without this Reuse cannot rebuild the settings that produced it. `frames` is
      // dropped because it is per-clip; durationSeconds describes the joined file.
      const base = picked[0]?.meta ? { ...picked[0].meta } : { v: 1, node: "minimax_h3" };
      delete base.frames;
      await saveMeta(out.filename, out.subfolder || "", {
        ...base,
        prompt: composeStitchedPrompt(picked.map(v => v.prompt || "")),
        prompts: picked.map(v => v.prompt || ""),
        clips: picked.length, stitched: true, onetake: !!overlapSec,
        created: Date.now(), durationSeconds,
      });
      ctx.showPopup?.(`Stitched ${picked.length} clips → ${out.filename}`, false);
      stitchOrder = [];
      oneTakeUserSet = false;
      await refresh();
    } catch (e) {
      ctx.showPopup?.(`Stitch failed: ${e.message || e}`, true);
      refreshStitchBar();
    }
  }

  const grid = el("div", { style: {
    flex: "1", overflowY: "auto", display: "grid", gap: "8px",
    gridTemplateColumns: "repeat(auto-fill, minmax(168px, 1fr))", alignContent: "start", paddingRight: "4px",
  }});
  grid.className = "mmh3-lp";

  const hint = el("div", { style: { flexShrink: "0", fontSize: "10px", color: C.muted, textAlign: "center" } });
  hint.innerHTML = "double-click a clip to play it full screen · "
    + "<b>space</b> play/pause · <b>← →</b> seek · <b>[ ]</b> previous / next · <b>Esc</b> close";

  ov.append(hdr, stitchBar, audioOverrideBar, upBar, rifeBar, grid, hint);

  // ── fullscreen player ──────────────────────────────────────────────────────
  const player = el("div", { style: {
    display: "none", position: "fixed", inset: "0", zIndex: "100000",
    background: "rgba(0,0,0,0.97)", flexDirection: "column",
  }});
  const pTop = el("div", { style: {
    flexShrink: "0", display: "flex", alignItems: "center", gap: "10px",
    padding: "10px 14px", color: "#fff", fontFamily: "'Segoe UI',sans-serif",
  }});
  const pTitle = el("div", { style: { fontSize: "13px", fontWeight: "600", flex: "1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } });
  const pPos = el("div", { style: { fontSize: "11px", color: "#9a9a9a" } });
  const pClose = el("button", { type: "button", text: "✕", title: "Close (Esc)", style: {
    cursor: "pointer", background: "rgba(255,255,255,0.1)", color: "#fff", border: "none",
    borderRadius: "6px", width: "30px", height: "30px", fontSize: "14px",
  }});
  pTop.append(pTitle, pPos, pClose);

  const pVideo = el("video", { controls: "", playsinline: "", style: {
    flex: "1", minHeight: "0", width: "100%", objectFit: "contain", background: "#000",
  }});
  const pFoot = el("div", { style: {
    flexShrink: "0", padding: "8px 14px 14px", color: "#7a7a7a", fontSize: "11px",
    textAlign: "center", fontFamily: "'Segoe UI',sans-serif",
  }});
  pFoot.innerHTML = "<b>space</b> play/pause · <b>← →</b> ±5s · <b>Shift+← →</b> ±1s · "
    + "<b>[ ]</b> previous / next clip · <b>f</b> browser fullscreen · <b>Esc</b> close";
  player.append(pTop, pVideo, pFoot);

  let playIndex = -1;
  function shown() { return filterFull ? videos.filter(v => v.is_full) : videos; }

  function openPlayer(i) {
    const list = shown();
    if (!list.length) return;
    stopGridVideos();   // the card under the player must not keep looping behind it
    playIndex = Math.max(0, Math.min(i, list.length - 1));
    const v = list[playIndex];
    pVideo.src = viewURL(v);
    pTitle.textContent = v.filename;
    pPos.textContent = `${playIndex + 1} / ${list.length}`;
    player.style.display = "flex";
    pVideo.play?.().catch(() => {});
    setTimeout(() => pVideo.focus(), 30);
  }
  function closePlayer() {
    player.style.display = "none";
    try { pVideo.pause(); } catch {}
    pVideo.removeAttribute("src");
    pVideo.load?.();
  }
  function step(delta) {
    const list = shown();
    if (!list.length) return;
    openPlayer((playIndex + delta + list.length) % list.length);
  }
  pClose.addEventListener("click", closePlayer);

  // Player keys are captured while it's open so they never reach the canvas.
  const onKey = (e) => {
    if (player.style.display === "none") return;
    const k = e.key;
    if (k === "Escape")      { e.preventDefault(); e.stopPropagation(); closePlayer(); return; }
    if (k === " ")           { e.preventDefault(); e.stopPropagation(); pVideo.paused ? pVideo.play() : pVideo.pause(); return; }
    if (k === "ArrowRight")  { e.preventDefault(); e.stopPropagation(); pVideo.currentTime += e.shiftKey ? 1 : 5; return; }
    if (k === "ArrowLeft")   { e.preventDefault(); e.stopPropagation(); pVideo.currentTime -= e.shiftKey ? 1 : 5; return; }
    if (k === "]")           { e.preventDefault(); e.stopPropagation(); step(1); return; }
    if (k === "[")           { e.preventDefault(); e.stopPropagation(); step(-1); return; }
    if (k === "f" || k === "F") {
      e.preventDefault(); e.stopPropagation();
      if (document.fullscreenElement) document.exitFullscreen?.();
      else player.requestFullscreen?.();
    }
  };
  document.addEventListener("keydown", onKey, true);

  // Thumbnails are plain <img> (server-extracted first frame, see /minimax_h3_one/thumb) —
  // a hundred-plus <video> elements, even paused, even preload=none, are that many decoder
  // instances and were enough to crash the tab. An <img loading="lazy"> is what a browser
  // actually handles cheaply at this scale; the browser's own lazy-loading covers scrolling
  // through a large gallery, no manual viewport bookkeeping needed.
  //
  // Hover-to-preview reuses a single shared <video>, moved into whichever card is currently
  // hovered — so there is at most one live decoder for the whole grid, ever.
  const hoverVideo = el("video", { muted: "", playsinline: "", preload: "none", style: {
    position: "absolute", inset: "0", width: "100%", height: "100%",
    objectFit: "contain", background: "#000", pointerEvents: "none",
  }});
  hoverVideo.muted = true;
  function stopGridVideos() {
    try { hoverVideo.pause(); } catch {}
    hoverVideo.removeAttribute("src");
    hoverVideo.load();
    hoverVideo.parentElement?.removeChild(hoverVideo);
  }

  // ── grid ───────────────────────────────────────────────────────────────────
  function renderGrid() {
    stopGridVideos();
    clear(grid);
    const list = shown();
    countTag.textContent = `${list.length} clip${list.length === 1 ? "" : "s"}`
      + (filterFull ? " (stitched)" : "") + ` · ${state.saveSubfolder || SUBFOLDER}`;
    if (!list.length) {
      grid.appendChild(el("div", {
        text: filterFull ? "No stitched videos yet." : "No clips yet — generate something first.",
        style: { color: C.muted, fontSize: "12px", gridColumn: "1 / -1", textAlign: "center", padding: "30px 0" } }));
      return;
    }
    list.forEach((v, i) => {
      const pickIdx = stitchMode ? stitchOrder.indexOf(vKey(v)) : -1;
      const postPicked = !!postMode && postPick === vKey(v);
      const picked = pickIdx !== -1 || postPicked;
      // No `overflow` other than visible here — a grid item's automatic minimum size
      // collapses to 0 instead of its content's natural height whenever overflow isn't
      // "visible", which is what was actually squashing every row into ~27px tracks and
      // making every card overlap the next, through every earlier pass at this bug (it was
      // never the video/img choice or preload — always this).
      const card = el("div", { style: {
        position: "relative",
        background: C.bg1, border: `1px solid ${picked ? BRAND : (v.is_full ? BRAND : C.border)}`,
        borderRadius: "8px", cursor: "pointer",
        display: "flex", flexDirection: "column",
        opacity: (stitchMode && !picked && stitchOrder.length >= STITCH_MAX) ? "0.4"
               : (postRunning && !picked) ? "0.4" : "1",
      }});
      // Square card, long edge fit (contain) — works for portrait and landscape clips alike
      // without cropping either one. A real <img>, not a <video> — see the note above.
      // Wrapped so the hover-preview video below only covers the thumbnail, not the whole
      // card — it used to sit at inset:0 on `card` itself and blocked the Reuse/Copy
      // buttons underneath (pointer-events:none stops it from eating clicks, but it still
      // hid the buttons from view, which is just as unusable).
      const thumbWrap = el("div", { style: { position: "relative", width: "100%" } });
      const thumb = el("img", { loading: "lazy", src: thumbURL(v), style: {
        width: "100%", aspectRatio: "1 / 1", objectFit: "contain", background: "#000", display: "block",
        borderRadius: "7px 7px 0 0",
      }});
      thumbWrap.appendChild(thumb);

      const deleteBtn = el("button", { type: "button", text: "✕", title: "Delete this clip", style: {
        position: "absolute", top: "4px", right: "4px", zIndex: "3",
        width: "18px", height: "18px", lineHeight: "16px", padding: "0",
        cursor: "pointer", fontSize: "11px", fontFamily: "inherit",
        background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", borderRadius: "4px",
      }});
      deleteBtn.addEventListener("click", e => { e.stopPropagation(); askDelete(v); });
      thumbWrap.appendChild(deleteBtn);

      // Full render settings this clip was actually made with, on hover — the meta already
      // carries everything Reuse (below) restores, this is just a read-only look at it.
      // No `title` here on purpose — the browser's native tooltip would sit right on top
      // of the custom popup below and hide it.
      const infoBtn = el("button", { type: "button", text: "ⓘ", style: {
        position: "absolute", top: "4px", left: "4px", zIndex: "3",
        width: "18px", height: "18px", lineHeight: "16px", padding: "0",
        cursor: "default", fontSize: "11px", fontFamily: "inherit",
        background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", borderRadius: "4px",
      }});
      infoBtn.addEventListener("click", e => e.stopPropagation());
      let infoPopup = null;
      infoBtn.addEventListener("mouseenter", () => {
        const m = v.meta || {};
        const lines = [];
        // Gallery post-process writes `postProcess`; an inline generation-time pass writes
        // only the structured deblur/upscale keys — synthesize a label from those.
        const ppLabel = m.postProcess || [
          (m.deblur && m.deblur !== "none") ? "deblur" : null,
          m.upscale ? (m.upscale.method === "rtx" ? "rtx upscale" : "upscale") : null,
        ].filter(Boolean).join(" + ");
        if (ppLabel) {
          lines.push(`⚙ ${ppLabel}${m.sourceW ? ` (from ${m.sourceW}×${m.sourceH})` : ""}`);
        }
        if (m.w && m.h) lines.push(`${m.w}×${m.h}`);
        if (m.frames) lines.push(`${m.frames} frames${m.fps ? ` @ ${Math.round(m.fps)}fps` : ""}`);
        if (m.steps) lines.push(`${m.steps} steps`);
        if (m.sampler) lines.push(String(m.sampler));
        if (m.accel) lines.push(`accel: ${m.accel}`);
        if (m.elapsedSec != null) {
          const s = Math.round(m.elapsedSec);
          lines.push(`took ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
        }
        if (m.turboLora) {
          lines.push(`turbo LoRA: ${String(m.turboLora).split(/[\\/]/).pop()} (${m.turboLoraStrength ?? 1})`);
        }
        (m.loras || []).filter(l => l && l.name && l.name !== "none").forEach(l => {
          lines.push(`${l.enabled === false ? "lora (off): " : "lora: "}${String(l.name).split(/[\\/]/).pop()} (${l.strength ?? 1})`);
        });
        if (m.seed != null) lines.push(`seed ${m.seed}`);
        infoPopup = el("div", { style: {
          position: "fixed", zIndex: "10001", background: "rgba(10,10,10,0.97)",
          border: `1px solid ${C.border}`, borderRadius: "6px", padding: "6px 8px",
          fontSize: "10px", color: C.text, lineHeight: "1.6", whiteSpace: "pre",
          pointerEvents: "none", maxWidth: "220px", boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
        }});
        infoPopup.textContent = lines.length ? lines.join("\n") : "No settings saved for this clip.";
        document.body.appendChild(infoPopup);
        const r = infoBtn.getBoundingClientRect();
        infoPopup.style.left = `${r.right + 6}px`;
        infoPopup.style.top = `${r.top}px`;
      });
      infoBtn.addEventListener("mouseleave", () => { infoPopup?.remove(); infoPopup = null; });
      thumbWrap.appendChild(infoBtn);

      // Post-decode frame ops, bottom-left — set the same way whether the pass ran inline
      // at generation time (buildClipGraph meta) or afterward from this gallery
      // (writePostMeta). ⇪ = upscaled, ✧ = deblurred; both can show.
      {
        const m = v.meta || {};
        const marks = [];
        if (m.upscale) marks.push(["⇪", m.upscale.method === "rtx"
          ? `Upscaled — RTX VSR ×${m.upscale.scale} (${m.upscale.quality})`
          : `Upscaled — ${String(m.upscale.model || "model").split(/[\\/]/).pop()}`]);
        if (m.deblur && m.deblur !== "none") marks.push(["✧", `Deblurred — strength ${m.deblur}`]);
        if (marks.length) {
          const bar = el("div", { style: {
            position: "absolute", bottom: "4px", left: "4px", zIndex: "3",
            display: "flex", gap: "3px",
          }});
          marks.forEach(([glyph, tip]) => bar.appendChild(el("div", { text: glyph, title: tip, style: {
            width: "18px", height: "18px", lineHeight: "18px", textAlign: "center",
            fontSize: "11px", borderRadius: "4px", color: "#fff",
            background: "rgba(0,0,0,0.6)",
          }})));
          thumbWrap.appendChild(bar);
        }
      }

      thumbWrap.addEventListener("mouseenter", () => {
        stopGridVideos();               // only ever one card previewing at a time
        hoverVideo.src = viewURL(v);
        thumbWrap.appendChild(hoverVideo);
        hoverVideo.currentTime = 0; hoverVideo.play?.().catch(() => {});
      });
      thumbWrap.addEventListener("mouseleave", stopGridVideos);
      if (stitchMode) {
        card.addEventListener("click", () => {
          const key = vKey(v);
          const idx = stitchOrder.indexOf(key);
          if (idx !== -1) stitchOrder.splice(idx, 1);
          else if (stitchOrder.length < STITCH_MAX) stitchOrder.push(key);
          else { ctx.showPopup?.(`${STITCH_MAX} / ${STITCH_MAX} · longer edits need a real video editor`, true); return; }
          renderGrid();
        });
        if (picked) {
          card.appendChild(el("div", { text: String(pickIdx + 1), style: {
            position: "absolute", top: "5px", left: "5px", zIndex: "2",
            width: "20px", height: "20px", borderRadius: "50%", background: BRAND, color: "#fff",
            fontSize: "11px", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center",
          }}));
        }
      } else if (postMode) {
        card.addEventListener("click", () => {
          if (postRunning) return;          // the source is already in flight
          postPick = postPicked ? null : vKey(v);
          renderGrid();
        });
        if (postPicked) {
          card.appendChild(el("div", { text: "✓", style: {
            position: "absolute", top: "5px", left: "5px", zIndex: "2",
            width: "20px", height: "20px", borderRadius: "50%", background: BRAND, color: "#fff",
            fontSize: "12px", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center",
          }}));
        }
      } else {
        card.addEventListener("dblclick", () => openPlayer(i));
      }

      // Individual clips carry their frame count; stitched files carry an explicit
      // durationSeconds instead (their real length isn't one clip's frame count — see
      // the auto-stitch and manual-stitch saveMeta calls).
      const durationSec = v.meta?.durationSeconds ?? (v.meta?.frames ? framesToSeconds(v.meta.frames) : null);
      const durationText = durationSec != null ? `${durationSec.toFixed(2)}s · ` : "";
      const meta = el("div", { style: { padding: "5px 7px", display: "flex", flexDirection: "column", gap: "1px" } });
      meta.append(
        el("div", { text: v.filename, style: {
          fontSize: "10px", color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }),
        el("div", { text: `${durationText}${fmtSize(v.size)} · ${fmtWhen(v.mtime)}`, style: { fontSize: "9px", color: C.muted } }),
      );
      if (v.is_full) {
        meta.appendChild(el("div", { text: "★ stitched", style: { fontSize: "9px", color: BRAND, fontWeight: "700" } }));
      }

      // The prompt the clip was rendered from, plus a one-click way back into the editor.
      const promptText = String(v.prompt || v.meta?.prompt || "").trim();
      if (promptText) {
        const p = el("div", { text: promptText, style: {
          fontSize: "9px", color: C.muted, lineHeight: "1.35", marginTop: "2px",
          display: "-webkit-box", WebkitLineClamp: "3", WebkitBoxOrient: "vertical",
          overflow: "hidden", cursor: "text",
        }});
        p.title = promptText;
        meta.appendChild(p);

        const bar = el("div", { style: { display: "flex", gap: "4px", marginTop: "4px" } });
        const mini = (txt, tip, fn) => {
          const b = el("button", { text: txt, style: {
            flex: "1", fontSize: "9px", padding: "3px 0", cursor: "pointer",
            background: C.bg2, color: C.text, border: `1px solid ${C.border}`, borderRadius: "4px",
          }});
          b.title = tip;
          b.addEventListener("click", e => { e.stopPropagation(); fn(); });
          return b;
        };
        bar.append(
          mini("↩ Reuse", "Restore this clip's prompt AND its render settings (resolution, steps, sampler, acceleration, LoRAs, seed) into the panel", () => {
            const m = v.meta || { prompt: promptText };
            const ok = (ctx.reuseAll || ctx.reusePrompt)?.(m);
            ctx.showPopup?.(ok ? "Clip settings loaded into the panel." : "No prompt stored for this clip.", !ok);
            if (ok) hide();
          }),
          mini("⧉ Copy", "Copy the prompt to the clipboard", () => {
            navigator.clipboard?.writeText(promptText)
              .then(() => ctx.showPopup?.("Prompt copied.", false))
              .catch(() => ctx.showPopup?.("Copy failed.", true));
          }),
          mini("⏭ Extend", "Add a continuation from this clip's last frame — the result is one longer, stitched video", () => {
            openExtendPopup(v, promptText);
          }),
        );
        meta.appendChild(bar);
      }
      card.append(thumbWrap, meta);
      grid.appendChild(card);
    });
    if (stitchMode) refreshStitchBar();
    if (postMode) refreshPostBars();
  }

  async function refresh() {
    refreshUpModels();
    countTag.textContent = "loading…";
    try {
      const d = await listVideos(state.saveSubfolder || SUBFOLDER);
      videos = d.videos || [];
    } catch { videos = []; }
    renderGrid();
  }

  // ── Extend — one continuation clip from this clip's last frame, auto-stitched ──
  async function extendBrief(seedFrame, rough) {
    let sys = "";
    try { sys = (await getSystemPrompt("minimax")).instruction || ""; } catch {}
    let vision = "";
    if (state.nativeVisionClip) {
      try {
        vision = (await analyzeImagesNative(state.nativeVisionClip, [seedFrame],
          "Describe this frame factually and concisely. It is the final frame of a video clip "
          + "and the starting point for what happens next.")).trim();
      } catch {}
    }
    const user = (vision ? `The clip so far ends on this frame:\n${vision}\n\n` : "")
      + `Continue the same shot. What happens next: ${rough}`;
    return (await writeBriefNative(state.nativeBriefClip, sys, user)).trim();
  }

  function openExtendPopup(clip, sourcePrompt) {
    if (!state.nativeBriefClip) { ctx.showPopup?.("Set a brief CLIP in ⚙ Settings → Models first.", true); return; }
    let seedFrame = null, mode = "review", reviewed = false, busy = false;

    const thumb = el("img", { style: {
      width: "100%", height: "150px", objectFit: "contain", background: "#000",
      borderRadius: "6px", border: `1px solid ${C.border}` } });
    const ta = el("textarea", { placeholder: "What happens next — a rough line is enough.", style: {
      width: "100%", minHeight: "70px", resize: "vertical", boxSizing: "border-box",
      background: C.bg2, color: C.text, border: `1px solid ${C.border}`, borderRadius: "6px",
      padding: "8px", fontSize: "12px", fontFamily: "inherit", outline: "none" } });
    const modeRow = el("div", { style: { display: "flex", gap: "6px" } });
    const modeBtns = {};
    [["review", "LLM: Review"], ["auto", "LLM: Auto"]].forEach(([k, lbl]) => {
      const b = el("button", { type: "button", text: lbl, style: {
        flex: "1", cursor: "pointer", fontFamily: "inherit", fontSize: "10.5px", padding: "5px 0",
        borderRadius: "5px", border: `1px solid ${C.border}`, background: C.bg2, color: C.text } });
      b.addEventListener("click", () => { mode = k; reviewed = false; paintModes(); });
      modeBtns[k] = b; modeRow.appendChild(b);
    });
    function paintModes() {
      for (const k in modeBtns) {
        const on = k === mode;
        modeBtns[k].style.background = on ? BRAND : C.bg2;
        modeBtns[k].style.color = on ? "#fff" : C.text;
        modeBtns[k].style.fontWeight = on ? "700" : "400";
      }
      goBtn.textContent = (mode === "review" && !reviewed) ? "Enhance →"
        : (mode === "review" && reviewed) ? "Extend" : "Extend";
    }

    const cancelBtn = el("button", { type: "button", text: "Cancel", style: {
      cursor: "pointer", fontFamily: "inherit", fontSize: "12px", padding: "6px 12px",
      borderRadius: "6px", border: `1px solid ${C.border}`, background: C.bg2, color: C.text } });
    const goBtn = el("button", { type: "button", text: "Enhance →", style: {
      cursor: "pointer", fontFamily: "inherit", fontSize: "12px", fontWeight: "700", padding: "6px 16px",
      borderRadius: "6px", border: "1px solid transparent", background: BRAND, color: "#fff" } });

    const box = el("div", { style: {
      background: "#141414", border: `1px solid ${C.border}`, borderRadius: "10px",
      width: "420px", maxWidth: "92%", padding: "16px", display: "flex", flexDirection: "column",
      gap: "9px", boxShadow: "0 16px 50px rgba(0,0,0,0.65)" } }, [
      el("div", { text: "Extend clip", style: { color: "#fff", fontSize: "13px", fontWeight: "700" } }),
      thumb, ta,
      el("div", { text: "LLM analyses the frame above + your line. Review shows the result first; "
        + "Auto renders straight away.", style: { fontSize: "9.5px", color: C.muted, lineHeight: "1.5" } }),
      modeRow,
      el("div", { style: { display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "2px" } }, [cancelBtn, goBtn]),
    ]);
    const pop = el("div", { style: {
      position: "fixed", inset: "0", zIndex: "100060", display: "flex",
      alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.72)" } }, [box]);
    const closePop = () => pop.remove();
    cancelBtn.addEventListener("click", closePop);
    pop.addEventListener("mousedown", e => { if (e.target === pop) closePop(); });
    document.body.appendChild(pop);
    paintModes();

    (async () => {
      try {
        seedFrame = await getClipLastFrame(clip.filename, clip.subfolder || "");
        thumb.src = `/view?filename=${encodeURIComponent(seedFrame)}&type=input&t=${Date.now()}`;
      } catch (e) {
        ctx.showPopup?.(`Could not read the last frame: ${e.message || e}`, true);
        closePop();
      }
    })();

    goBtn.addEventListener("click", async () => {
      if (busy || !seedFrame) return;
      const rough = ta.value.trim();
      if (!rough) { ctx.showPopup?.("Write what happens next.", true); return; }
      // Review, first click: enhance and show the result for editing.
      if (mode === "review" && !reviewed) {
        busy = true; goBtn.disabled = true; goBtn.textContent = "Enhancing…";
        try {
          ta.value = await extendBrief(seedFrame, rough);
          reviewed = true;
        } catch (e) { ctx.showPopup?.(`Enhance failed: ${e.message || e}`, true); }
        busy = false; goBtn.disabled = false; paintModes();
        return;
      }
      // Otherwise: resolve the final text and fire the run.
      busy = true; goBtn.disabled = true; goBtn.textContent = "Working…";
      let finalText = rough;
      try {
        if (mode === "auto") finalText = await extendBrief(seedFrame, rough);
        else if (mode === "review") finalText = ta.value.trim() || rough;
      } catch (e) {
        ctx.showPopup?.(`Enhance failed: ${e.message || e}`, true);
        busy = false; goBtn.disabled = false; paintModes(); return;
      }
      closePop();
      hide();
      ctx.runExtend?.({ sourceClip: clip, seedFrame, prompt: finalText, sourcePrompt });
    });
  }

  function hide() {
    closePlayer(); stopGridVideos(); ov.style.display = "none";
    clear(grid);
    if (!postRunning) setMode(null, false);
    deleteConfirmOv.style.display = "none"; pendingDelete = null;
  }

  return {
    el: ov,
    playerEl: player,
    show() { ov.style.display = "flex"; refresh(); resumePostJob(); },
    hide,
    isOpen: () => ov.style.display !== "none",
    isPlaying: () => player.style.display !== "none",
    destroy() {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("keydown", onDeleteConfirmKey, true);
    },
  };
}

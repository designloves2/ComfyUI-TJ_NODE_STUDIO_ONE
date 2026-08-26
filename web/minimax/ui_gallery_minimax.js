// ui_gallery_minimax.js — clip gallery + fullscreen player for MiniMax H3 ONE STUDIO (TJ)
//
// The node's results are videos, so the shared PNG gallery doesn't apply: this lists the
// mp4s written into the output subfolder and plays them full screen with the keyboard
// shortcuts you'd expect from a review pass.
import { C, BRAND, el, clear, SUBFOLDER, framesToSeconds, ONE_TAKE_OVERLAP_FRAMES } from "./core_minimax.js";
import { button, select, numberField } from "../klein/ui_common.js";
import { listVideos, revealOutputFolder, stitchClips, saveMeta, deleteImage, getMediaFiles } from "./api_minimax.js";

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
  stitchBtn.addEventListener("click", () => {
    stitchMode = !stitchMode;
    stitchOrder = [];
    oneTakeUserSet = false;
    stitchBtn.style.background = stitchMode ? BRAND : C.bg2;
    stitchBtn.style.borderColor = stitchMode ? BRAND : C.border;
    stitchBar.style.display = stitchMode ? "flex" : "none";
    audioOverrideBar.style.display = stitchMode ? "flex" : "none";
    renderGrid();
  });
  hdr.append(fullBtn, stitchBtn, refreshBtn, folderBtn, button("✕ Close", () => hide(), "danger"));

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
      await saveMeta(out.filename, out.subfolder || "", {
        v: 1, prompt: picked.map(v => v.prompt || "").filter(Boolean).join("\n\n"),
        clips: picked.length, stitched: true, onetake: !!overlapSec,
        node: "minimax_h3", created: Date.now(), durationSeconds,
        prompts: picked.map(v => v.prompt || ""),
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

  ov.append(hdr, stitchBar, audioOverrideBar, grid, hint);

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
      const picked = pickIdx !== -1;
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
        opacity: (stitchMode && !picked && stitchOrder.length >= STITCH_MAX) ? "0.4" : "1",
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
        if (m.w && m.h) lines.push(`${m.w}×${m.h}`);
        if (m.frames) lines.push(`${m.frames} frames`);
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
        );
        meta.appendChild(bar);
      }
      card.append(thumbWrap, meta);
      grid.appendChild(card);
    });
    if (stitchMode) refreshStitchBar();
  }

  async function refresh() {
    countTag.textContent = "loading…";
    try {
      const d = await listVideos(state.saveSubfolder || SUBFOLDER);
      videos = d.videos || [];
    } catch { videos = []; }
    renderGrid();
  }

  function hide() {
    closePlayer(); stopGridVideos(); ov.style.display = "none";
    clear(grid);
    stitchMode = false; stitchOrder = []; oneTakeUserSet = false;
    stitchBtn.style.background = C.bg2; stitchBtn.style.borderColor = C.border;
    stitchBar.style.display = "none";
    deleteConfirmOv.style.display = "none"; pendingDelete = null;
  }

  return {
    el: ov,
    playerEl: player,
    show() { ov.style.display = "flex"; refresh(); },
    hide,
    isOpen: () => ov.style.display !== "none",
    isPlaying: () => player.style.display !== "none",
    destroy() {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("keydown", onDeleteConfirmKey, true);
    },
  };
}

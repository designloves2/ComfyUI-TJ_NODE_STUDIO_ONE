// ui_prompt_edit_minimax.js — full-node prompt editor for MiniMax H3 ONE STUDIO (TJ)
//
// The node's inline prompt strip is fine for a glance but cramped for real writing, so
// this popup gives each clip a full-height editor plus an Ollama pass to turn a rough
// idea into a shot-by-shot brief.
//
// The brief-writing instruction is the same "Minimax H3 (Video)" system prompt TJ_NODE
// ships, fetched from the backend (with a built-in fallback when TJ_NODE isn't present).
import { C, BRAND, el, clear, clipSecondsFor, clipFramesFor, clipTimeline, snapHalf, snapClipSec, clipSecForTyped, shotRanges, rebaseShots, shiftShots, shotCount, splitShotsByTime, ONE_TAKE_OVERLAP_SEC, snapShotTimes, oneTakeLlmOn, oneTakeRules, oneTakeFixShots, oneTakeIssues, activePrompts, parseBrief, groupShots, parseTargetSeconds, evenBreaks, composeClipPrompt, imageBriefMax, promptText, promptFirstFrame, promptEnabled, clipAssets, clipFraming, promptOverrides, normalizeAssetRef } from "./core_minimax.js";
import { panel, label, button, select, row, col } from "../klein/ui_common.js";
import { buildClipMediaSlots } from "./ui_clip_media_slots.js";
import { openVideoGalleryPicker } from "./ui_video_picker_minimax.js";
import { openImageGalleryPicker } from "../shared/ui_image_gallery_picker.js";
import { openAudioGalleryPicker } from "../shared/ui_audio_gallery_picker.js";
import { ask } from "../shared/ui_ask.js";
import { attachBilingual } from "../shared/bilingual_ui.js";
import { fieldEdit, fieldSetBoth, fieldFill, ensureEnglish, koKey } from "../shared/bilingual.js";
import { translateLlm } from "../shared/translate_config.js";
import { h3ProtectWords } from "./translate_minimax.js";
import { mountLibraryRefs, emptyAssetRef, sourceToggle } from "../shared/reflib_refpanel.js";
import { libraryRefFor, libraryContextCached } from "../shared/reflib_llm.js";
import { reflib } from "../shared/reflib_api.js";
import { attachAtComplete } from "../shared/reflib_at.js";
import { getMediaFiles, getSystemPrompt, uploadImage, uploadMedia, analyzeImagesNative, writeBriefNative, analyzeImagesOpenRouter, writeBriefOpenRouter, analyzeImageLlama, writeBriefLlama, analyzeImagesCustom, writeBriefCustom, listPromptSets, getPromptSet, savePromptSet, deletePromptSet, missingInputFiles } from "./api_minimax.js";
import { H3_SYSTEM_PROMPT_BASE, H3_SYSTEM_PROMPT_REF } from "./system_prompt_h3.js";

// A prompt entry may still arrive as a plain string (mid-migration data); normalize once.
function normPrompt(p) {
  return typeof p === "string" ? { text: p, firstFrame: "", enabled: true } : p;
}

// The model renders a clip for at most this long. A clip whose set time is above it (after a merge) is flagged red.
const MAX_CLIP_SEC = 15;
const overMaxSec = (p) => !!(p && typeof p === "object" && p.timeOverride && p.timeSec > MAX_CLIP_SEC);

export function createPromptEditOverlay(state, ctx, onApply) {
  const ov = el("div", { style: {
    position: "absolute", inset: "0", zIndex: "9999",
    background: "rgba(11,11,11,0.985)", borderRadius: "inherit",
    display: "none", flexDirection: "column", padding: "12px", gap: "8px", boxSizing: "border-box",
  }});

  let selected = 0;
  // Filenames the loader nodes accept, for the per-clip video/audio pickers.
  let mediaFiles = { videos: [], audios: [] };
  let systemPrompt = "";
  let systemPromptSource = "";
  let busy = false;

  // ── undo ───────────────────────────────────────────────────────────────────
  // Splitting and enhancing rewrite every prompt at once; without this a mis-click
  // would be unrecoverable.
  const COMMON_BIL_KEYS = ["promptHeaderKo", "promptHeaderNewest", "promptHeaderView", "promptFooterKo", "promptFooterNewest", "promptFooterView"];
  const undoStack = [];
  function snapshot(what) {
    undoStack.push({
      what,
      header: state.promptHeader || "",
      footer: state.promptFooter || "",
      // the Korean view / newest mark / view of the common pair go back with them
      common: Object.fromEntries(COMMON_BIL_KEYS.map(k => [k, state[k]])),
      prompts: (state.prompts || []).map(p => ({ ...normPrompt(p) })),
      selected,
    });
    if (undoStack.length > 20) undoStack.shift();
    refreshUndo();
  }
  function undo() {
    const s = undoStack.pop();
    if (!s) return;
    state.promptHeader = s.header;
    state.promptFooter = s.footer;
    for (const k of COMMON_BIL_KEYS) { if (s.common?.[k] === undefined) delete state[k]; else state[k] = s.common[k]; }
    state.prompts = s.prompts.map(p => ({ ...p }));
    selected = Math.min(s.selected, state.prompts.length - 1);
    ctx.persist();
    renderAll();
    ctx.showPopup?.(`Undid: ${s.what}`, false);
  }
  let undoBtn = null;
  function refreshUndo() {
    if (!undoBtn) return;
    const last = undoStack[undoStack.length - 1];
    undoBtn.disabled = !last;
    undoBtn.style.opacity = last ? "1" : "0.4";
    undoBtn.style.cursor = last ? "pointer" : "default";
    undoBtn.title = last ? `Undo: ${last.what}` : "Nothing to undo";
  }

  // ── header ─────────────────────────────────────────────────────────────────
  const hdr = el("div", { style: { position: "relative", display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" } });
  hdr.appendChild(el("div", { text: "📝 Prompt Edit", style: { color: "#fff", fontSize: "14px", fontWeight: "700" } }));
  // True center of the whole header, independent of how wide the title/buttons on
  // either side are — so it reads as one glance: what mode is this popup working with.
  const hdrModeTag = el("div", { style: {
    position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
    fontSize: "11px", fontWeight: "700", color: BRAND, whiteSpace: "nowrap", pointerEvents: "none",
  }});
  hdr.appendChild(hdrModeTag);
  const srcTag = el("div", { style: { fontSize: "10px", color: C.muted, flex: "1" } });
  hdr.appendChild(srcTag);
  undoBtn = el("button", { type: "button", text: "↶ Undo", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "11px", padding: "5px 11px",
    borderRadius: "6px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
  }});
  undoBtn.addEventListener("click", undo);
  hdr.appendChild(undoBtn);
  const resetBtn = el("button", { type: "button", text: "↺ Reset", title: "Reset prompts, header and footer", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "11px", padding: "5px 11px",
    borderRadius: "6px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
  }});
  resetBtn.addEventListener("click", () => resetConfirmOv.style.display = "flex");
  hdr.appendChild(resetBtn);
  const closeBtn = button("✕ Close", () => hide(), "danger");
  hdr.appendChild(closeBtn);

  // ── reset confirm (A4) — viewport-centered, unlike the node-relative overlays above:
  // the node can be scrolled off-screen while this popup still needs to be seen. ────────
  const resetConfirmOv = el("div", { style: {
    display: "none", position: "fixed", inset: "0", zIndex: "99999",
    background: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center",
  }});
  const resetConfirmBox = el("div", { style: {
    background: C.bg1, border: `1px solid ${C.border}`, borderRadius: "10px",
    padding: "18px 20px", width: "340px", boxSizing: "border-box",
    display: "flex", flexDirection: "column", gap: "10px", boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
  }});
  resetConfirmBox.appendChild(el("div", {
    text: "Reset prompt settings?",
    style: { color: "#fff", fontSize: "13px", fontWeight: "700" } }));
  resetConfirmBox.appendChild(el("div", {
    text: "This clears every prompt down to one, plus the common header/footer.",
    style: { color: C.muted, fontSize: "11.5px", lineHeight: "1.5" } }));
  const resetBtnRow = el("div", { style: { display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "4px" } });
  const resetCancelBtn = el("button", { type: "button", text: "Cancel", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "11.5px", padding: "6px 14px",
    borderRadius: "6px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
  }});
  const resetConfirmBtn = button("Reset", () => {
    snapshot("reset");
    state.prompts = [{ text: "", firstFrame: "", enabled: true }];
    fieldSetBoth(state, "promptHeader", "", "");
    fieldSetBoth(state, "promptFooter", "", "");
    selected = 0;
    ctx.persist();
    resetConfirmOv.style.display = "none";
    renderAll();
    ctx.showPopup?.("Prompts reset.", false);
  }, "danger");
  resetCancelBtn.addEventListener("click", () => resetConfirmOv.style.display = "none");
  resetBtnRow.append(resetCancelBtn, resetConfirmBtn);
  resetConfirmBox.appendChild(resetBtnRow);
  resetConfirmOv.appendChild(resetConfirmBox);
  resetConfirmOv.addEventListener("click", e => { if (e.target === resetConfirmOv) resetConfirmOv.style.display = "none"; });
  // Appended to <body>, not `ov` — LiteGraph's canvas pans/zooms its DOM widgets with a CSS
  // transform, which would hijack `position:fixed` if this lived inside that subtree.
  document.body.appendChild(resetConfirmOv);

  // ── prompt sets (A5) — named bundles kept as server files so they survive a cleared
  // browser cache and can be reused across workflows ───────────────────────────────
  const setsWrap = el("div", { style: { display: "flex", alignItems: "center", gap: "6px", flexShrink: "0" } });
  const setsSel = el("select", { style: {
    flex: "1", minWidth: "0", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
    borderRadius: "6px", padding: "5px 7px", fontSize: "11px", fontFamily: "inherit", outline: "none",
  }});
  function setBtn(text, title) {
    return el("button", { type: "button", text, title, style: {
      cursor: "pointer", fontFamily: "inherit", fontSize: "11px", padding: "5px 10px",
      borderRadius: "6px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`, flexShrink: "0",
    }});
  }
  const setLoadBtn = setBtn("📂 Load", "Load this set — replaces all current prompts");
  const setSaveBtn = setBtn("💾 Save", "Save current prompts as a named set");
  const setDelBtn  = setBtn("🗑 Delete", "Delete this set");
  setsWrap.append(setsSel, setLoadBtn, setSaveBtn, setDelBtn);

  async function refreshSetsList(selectName) {
    try {
      const sets = await listPromptSets();
      const cur = selectName || setsSel.value;
      clear(setsSel);
      if (!sets.length) {
        setsSel.appendChild(el("option", { text: "(no saved sets)", value: "" }));
      } else {
        sets.forEach(s => setsSel.appendChild(el("option", {
          text: `${s.name} · ${s.count}`, value: s.name,
        })));
      }
      if (cur && sets.some(s => s.name === cur)) setsSel.value = cur;
    } catch (e) {
      clear(setsSel);
      setsSel.appendChild(el("option", { text: "(failed to load)", value: "" }));
    }
  }

  /**
   * After a load, check every referenced file and say what is gone.
   *
   * Quietly leaving a blank slot loses the only record that something was ever there —
   * you cannot tell a set that used three pictures from one that used none. So the names
   * are kept, the tiles draw a ghost in place of the missing thumbnail, and the popup
   * says how many and which.
   */
  async function reportMissingAssets(setName) {
    const names = [];
    const addMedia = (arr) => (arr || []).forEach(m => m && m.file && names.push(m.file));
    names.push(...(state.refImages || []).filter(Boolean));
    if (state.firstFrameImage) names.push(state.firstFrameImage);
    if (state.lastFrameImage) names.push(state.lastFrameImage);
    addMedia(state.refVideos); addMedia(state.refAudios);
    (state.prompts || []).forEach(p => {
      if (typeof p === "string") return;
      names.push(...(p.refImages || []).filter(Boolean));
      if (p.firstFrame) names.push(p.firstFrame);
      if (p.lastFrame) names.push(p.lastFrame);
      addMedia(p.refVideos); addMedia(p.refAudios);
    });
    const gone = await missingInputFiles(names);
    state.missingAssets = gone;
    renderImageRow(); ctx.refreshModes?.();
    if (!gone.length) return;
    const shown = gone.slice(0, 4).join(", ");
    ctx.showPopup?.(
      `"${setName}" refers to ${gone.length} file${gone.length > 1 ? "s" : ""} that are no longer in the input folder: ` +
      `${shown}${gone.length > 4 ? `, and ${gone.length - 4} more` : ""}. ` +
      `Their slots are marked — re-add them or clear the slot.`, true);
  }

  setLoadBtn.addEventListener("click", async () => {
    const name = setsSel.value;
    if (!name) return;
    try {
      const s = await getPromptSet(name);
      snapshot(`load set: ${name}`);
      delete state._resumeSnapshot;   // a new prompt list — the old resume snapshot is meaningless
      // Whole entries, not three fields: dropping override/refImages here is what made a
      // loaded set come back without its pictures.
      state.prompts = (Array.isArray(s.prompts) && s.prompts.length ? s.prompts : [{ text: "", firstFrame: "", enabled: true }])
        .map(p => (typeof p === "string"
          ? { text: p, firstFrame: "", enabled: true }
          : { ...p, text: p?.text || "", firstFrame: p?.firstFrame || "", enabled: p?.enabled !== false }));
      fieldSetBoth(state, "promptHeader", s.promptHeader || "", s.promptHeaderKo || "");
      fieldSetBoth(state, "promptFooter", s.promptFooter || "", s.promptFooterKo || "");
      // Only restore the common assets when the set actually carries them, so an older
      // set saved before this existed does not wipe what is on screen.
      if (Array.isArray(s.refImages))   state.refImages   = s.refImages.slice();
      if (Array.isArray(s.refImagesMp)) state.refImagesMp = s.refImagesMp.slice();
      if (Array.isArray(s.refVideos))   state.refVideos   = s.refVideos.map(v => ({ ...v }));
      if (Array.isArray(s.refAudios))   state.refAudios   = s.refAudios.map(a => ({ ...a }));
      if (typeof s.firstFrameImage === "string") state.firstFrameImage = s.firstFrameImage;
      if (typeof s.lastFrameImage === "string")  state.lastFrameImage  = s.lastFrameImage;
      if (s.refTypes && typeof s.refTypes === "object") state.refTypes = { ...s.refTypes };
      // A saved set carries the generation mode it was written for — restoring it here
      // switches the main screen (and this popup's own Text/Image → Brief derivation)
      // to match, instead of leaving the set's Reference images sitting under whatever
      // mode happened to be active before the load.
      if (s.generationMode) state.generationMode = s.generationMode;
      selected = 0;
      ctx.persist();
      deriveModes();
      renderAll();
      ctx.refreshModes?.();
      const framesNote = (s.clipFrames && s.clipFrames !== state.clipFrames)
        ? ` — saved at a different clip length (${s.clipFrames} frames vs current ${state.clipFrames})` : "";
      ctx.showPopup?.(`Loaded "${name}"${framesNote}`, false);
      reportMissingAssets(name);
    } catch (e) {
      ctx.showPopup?.(`Load failed: ${e.message || e}`, true);
    }
  });

  setSaveBtn.addEventListener("click", async () => {
    const existing = setsSel.value && setsSel.options.length && setsSel.value !== "" ? setsSel.value : "";
    // window.prompt / confirm are suppressed in ComfyUI's frontend: the handler stopped
    // here and the button looked dead. These draw in the page instead.
    const name = await ask(ov, {
      title: "Save prompt set",
      message: "Saves these prompts with their reference images, video and audio.",
      initial: existing || "", okLabel: "Save",
    });
    if (name == null) return;
    const trimmed = name.trim();
    if (!trimmed) { ctx.showPopup?.("Name can't be empty.", true); return; }
    const willOverwrite = [...setsSel.options].some(o => o.value === trimmed);
    if (willOverwrite && !(await ask(ov, {
      title: "Overwrite prompt set?", message: `"${trimmed}" already exists.`,
      kind: "confirm", okLabel: "Overwrite", danger: true }))) return;
    try {
      // The pictures and clips are as much a part of a prompt set as the words: a set that
      // restores the text but not the references reproduces nothing in Reference mode.
      await savePromptSet({
        name: trimmed,
        clipFrames: state.clipFrames,
        promptHeader: state.promptHeader || "",
        promptFooter: state.promptFooter || "",
        prompts: (state.prompts || []).map(p => (typeof p === "string" ? { text: p, firstFrame: "", enabled: true } : p)),
        generationMode:  state.generationMode || "",
        refTypes:        { ...(state.refTypes || {}) },
        refImages:       (state.refImages || []).slice(),
        refImagesMp:     (state.refImagesMp || []).slice(),
        firstFrameImage: state.firstFrameImage || "",
        lastFrameImage:  state.lastFrameImage || "",
        refVideos:       (state.refVideos || []).map(v => ({ ...v })),
        refAudios:       (state.refAudios || []).map(a => ({ ...a })),
      });
      await refreshSetsList(trimmed);
      ctx.showPopup?.(`Saved "${trimmed}".`, false);
    } catch (e) {
      ctx.showPopup?.(`Save failed: ${e.message || e}`, true);
    }
  });

  setDelBtn.addEventListener("click", async () => {
    const name = setsSel.value;
    if (!name) return;
    if (!(await ask(ov, {
      title: "Delete prompt set", message: `"${name}" will be removed.
This cannot be undone.`,
      kind: "confirm", okLabel: "Delete", danger: true }))) return;
    try {
      await deletePromptSet(name);
      await refreshSetsList();
      ctx.showPopup?.(`Deleted "${name}".`, false);
    } catch (e) {
      ctx.showPopup?.(`Delete failed: ${e.message || e}`, true);
    }
  });

  // Per-field Undo / Clear, sat at the top-right of a field's label row. `write(v)` puts
  // the value through that field's real backing store. Undo steps back through values
  // captured on focus (so "undo my edits to this box") and on Clear.
  function undoClearBtns(ta, write) {
    const stack = [];
    const apply = (v) => {
      ta.value = v; write(v);
      if (typeof ta.autoSize === "function") ta.autoSize();
      ctx.persist();
      if (typeof refreshPreviewTag === "function") refreshPreviewTag();
      paint();
    };
    const mk = (txt, tip, fn) => {
      const b = el("button", { type: "button", text: txt, title: tip, style: {
        cursor: "pointer", fontFamily: "inherit", fontSize: "9px", padding: "2px 7px",
        borderRadius: "4px", background: C.bg2, color: C.muted,
        border: `1px solid ${C.border}`, flexShrink: "0",
      }});
      b.addEventListener("click", (e) => { e.preventDefault(); fn(); });
      return b;
    };
    const undoB = mk("Undo", "Undo this field's last change", () => { if (stack.length) apply(stack.pop()); });
    const clearB = mk("Clear", "Empty this field", () => { stack.push(ta.value); apply(""); });
    // White while the button can actually do something, muted otherwise.
    function paint() {
      undoB.style.color  = stack.length ? "#fff" : C.muted;
      clearB.style.color = ta.value ? "#fff" : C.muted;
    }
    ta.addEventListener("focus", () => {
      if (stack[stack.length - 1] !== ta.value) stack.push(ta.value);
      if (stack.length > 15) stack.shift();
      paint();
    });
    ta.addEventListener("input", paint);
    const row = el("div", { style: { display: "flex", gap: "4px", flexShrink: "0" } }, [undoB, clearB]);
    row.resetStack = () => { stack.length = 0; paint(); };   // call on clip switch so undo stays within one clip
    row.paint = paint;
    paint();
    return row;
  }

  // ── shared header / footer ─────────────────────────────────────────────────
  // These go into every clip, so they're edited once and kept out of the split.
  function commonField(placeholder, get, set, sizeKey) {
    const ta = el("textarea", { placeholder, style: {
      width: "100%", boxSizing: "border-box", flexShrink: "0",
      minHeight: "104px",
      background: C.bg2, color: C.text, border: `1px solid ${C.border}`, borderRadius: "6px",
      padding: "6px 8px", fontSize: "11.5px", lineHeight: "1.5", fontFamily: "inherit",
      outline: "none", resize: "vertical", overflowY: "auto",
    }});
    // The box keeps the height the user dragged it to (remembered across sessions); it is never
    // resized to its text. autoSize stays as a no-op for the callers that still invoke it.
    ta.autoSize = () => {};
    try { const h = localStorage.getItem(sizeKey); if (h) ta.style.height = h; } catch { /* default height */ }
    new ResizeObserver(() => {
      if (!ta.offsetHeight) return;   // popup hidden
      try { localStorage.setItem(sizeKey, `${ta.offsetHeight}px`); } catch { /* not remembered */ }
    }).observe(ta);
    ta.value = get() || "";
    ta.addEventListener("input", () => { set(ta.value); ta.autoSize(); ctx.persist(); refreshPreviewTag(); });
    ta.addEventListener("focus", () => ta.style.borderColor = BRAND);
    ta.addEventListener("blur",  () => ta.style.borderColor = C.border);
    return ta;
  }
  // Both fields write to whichever pair the selected clip actually renders with: the
  // common one, or that clip's own when its override is on. clipFraming() is the single
  // resolver, so the editor cannot disagree with what composeClipPrompt() sends.
  const ownFraming = () => promptOverrides((state.prompts || [])[selected]);
  const framingTarget = () => (ownFraming() ? (state.prompts[selected]) : state);
  const headerTA = commonField("Opening — visual style, grade, opening composition…",
    () => clipFraming(state, selected).header,
    v => { const t = framingTarget(); if (ownFraming()) t.header = v; else t.promptHeader = v; }, "mmh3_pe_header_h");
  const footerTA = commonField("Tail — Ambient sound: … / Music: …",
    () => clipFraming(state, selected).footer,
    v => { const t = framingTarget(); if (ownFraming()) t.footer = v; else t.promptFooter = v; }, "mmh3_pe_footer_h");

  // KO / EN on both boxes; the slot is the clip's own header / tail when it has its own, else the common pair.
  const headerKey = () => (ownFraming() ? "header" : "promptHeader");
  const footerKey = () => (ownFraming() ? "footer" : "promptFooter");
  const headerBil = attachBilingual(headerTA, { persist: () => ctx.persist(), protect: () => h3ProtectWords(state), onError: (m) => ctx.showPopup?.(m, true), target: framingTarget, key: headerKey });
  const footerBil = attachBilingual(footerTA, { persist: () => ctx.persist(), protect: () => h3ProtectWords(state), onError: (m) => ctx.showPopup?.(m, true), target: framingTarget, key: footerKey });
  const headerLbl = el("div", { text: "COMMON — HEADER", style: { color: C.muted, fontSize: "9.5px", letterSpacing: "0.06em" } });
  const footerLbl = el("div", { text: "COMMON — SOUND / MUSIC", style: { color: C.muted, fontSize: "9.5px", letterSpacing: "0.06em" } });

  /** Repoint both boxes at the selected clip — call after switching clip or toggling override. */
  function refreshFraming() {
    const own = ownFraming();
    headerBil.refresh();
    footerBil.refresh();
    headerLbl.textContent = own ? "THIS CLIP — HEADER" : "COMMON — HEADER";
    footerLbl.textContent = own ? "THIS CLIP — SOUND / MUSIC" : "COMMON — SOUND / MUSIC";
    headerLbl.style.color = own ? BRAND : C.muted;
    footerLbl.style.color = own ? BRAND : C.muted;
    headerTA.autoSize(); footerTA.autoSize();
    headerUC?.paint?.(); footerUC?.paint?.();
    refreshPreviewTag();
  }

  headerLbl.style.flex = "1"; footerLbl.style.flex = "1";
  const headerUC = undoClearBtns(headerTA, v => fieldEdit(framingTarget(), headerKey(), v));
  const footerUC = undoClearBtns(footerTA, v => fieldEdit(framingTarget(), footerKey(), v));
  const lblRow = (lbl, uc) => el("div", { style: { display: "flex", alignItems: "center", gap: "6px" } }, [lbl, uc]);
  const commonWrap = el("div", { style: { flexShrink: "0", display: "flex", gap: "8px" } });
  commonWrap.append(
    el("div", { style: { flex: "1", display: "flex", flexDirection: "column", gap: "3px" } }, [lblRow(headerLbl, headerUC), headerBil.el]),
    el("div", { style: { flex: "1", display: "flex", flexDirection: "column", gap: "3px" } }, [lblRow(footerLbl, footerUC), footerBil.el]),
  );

  // ── body: clip list | editor ───────────────────────────────────────────────
  const body = el("div", { style: { flex: "1", display: "flex", gap: "10px", minHeight: "0" } });
  const listCol = el("div", { style: { width: "252px", flexShrink: "0", display: "flex", flexDirection: "column", gap: "5px" } });
  const listHdr = el("div", { style: { display: "flex", alignItems: "center", gap: "4px" } });
  listHdr.appendChild(el("div", { text: "CLIPS", style: { color: C.muted, fontSize: "10px", letterSpacing: "0.06em" } }));
  const onCountTag = el("div", { style: { color: C.muted, fontSize: "9.5px", flex: "1" } });
  listHdr.appendChild(onCountTag);
  function refreshOnCountTag(onCount, total) {
    onCountTag.textContent = onCount < total ? `${onCount}/${total} on` : "";
  }
  const addBtn = el("button", { type: "button", text: "+", title: "Add clip prompt", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "11px", padding: "2px 8px",
    borderRadius: "5px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
  }});
  listHdr.appendChild(addBtn);
  const listBox = el("div", { style: { flex: "1", overflowY: "auto", display: "flex", flexDirection: "column", gap: "4px" } });
  listBox.className = "mmh3-lp";
  listCol.append(listHdr, listBox);

  const editCol = el("div", { style: { flex: "1", display: "flex", flexDirection: "column", gap: "5px", minWidth: "0" } });
  const editHdr = el("div", { style: { display: "flex", alignItems: "center", gap: "6px" } });
  const editTitle = el("div", { text: "Clip 1", style: { color: C.text, fontSize: "12px", fontWeight: "600", flex: "1" } });
  const charCount = el("div", { style: { color: C.muted, fontSize: "10px" } });
  const editor = el("textarea", { placeholder: "Describe this clip…", style: {
    flex: "1", minHeight: "0", boxSizing: "border-box", background: C.bg1, color: C.text,
    border: `1px solid ${C.border}`, borderRadius: "8px", padding: "12px",
    fontSize: "13px", lineHeight: "1.6", fontFamily: "inherit", outline: "none", resize: "none",
  }});
  editor.addEventListener("input", () => {
    state.prompts[selected] = normPrompt(state.prompts[selected]);
    state.prompts[selected].text = editor.value;
    ctx.persist(); updateCount(); renderList();
  });
  // Undo / Clear write the language the field is showing (the Korean view keeps the English text as it was).
  const editorUndoClear = undoClearBtns(editor, v => {
    state.prompts[selected] = normPrompt(state.prompts[selected]);
    fieldEdit(state.prompts[selected], "text", v);
    updateCount(); renderList();
  });
  // KO / EN button: the English text is what the model gets, the Korean one is its view.
  const bilOpts = { persist: () => ctx.persist(), protect: () => h3ProtectWords(state), onError: (m) => ctx.showPopup?.(m, true) };
  const editorBil = attachBilingual(editor, { ...bilOpts, target: () => (state.prompts[selected] = normPrompt(state.prompts[selected])), key: "text" });
  editHdr.append(editTitle, charCount, editorUndoClear);

  // ── continue this clip from a finished clip's last frame (planned resume) ────
  // Picking a clip seeds THIS entry's first frame and, since a resume never re-renders
  // what is already done, disables every earlier clip (their override checkbox greys out
  // too) and enables this one onward. Clearing it restores the enabled states from the
  // snapshot taken when the pick was made.
  const fiRow = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" } });
  const fiThumb = el("img", { style: {
    width: "34px", height: "34px", objectFit: "cover", borderRadius: "5px",
    border: `1px solid ${C.border}`, display: "none", cursor: "pointer",
  }});
  const fiLabel = el("div", { text: "▶ Continue generating the clip.", style: {
    fontSize: "10.5px", color: C.muted, whiteSpace: "nowrap",
  }});
  const fiGalleryBtn = el("button", { type: "button", text: "Select from the gallery", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "10.5px", padding: "4px 9px",
    borderRadius: "5px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
  }});
  const fiRemoveBtn = el("button", { type: "button", text: "✕", title: "Stop continuing — restore all clips", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "10.5px", padding: "4px 8px",
    borderRadius: "5px", background: "transparent", color: C.muted, border: `1px solid ${C.border}`,
    display: "none",
  }});
  fiGalleryBtn.addEventListener("click", () => {
    (ctx.pickVideoFromGallery || openVideoGalleryPicker)((inputFilename, clip) => {
      if (!Array.isArray(state._resumeSnapshot)) {
        state._resumeSnapshot = (state.prompts || []).map(p => normPrompt(p).enabled !== false);
      }
      (state.prompts || []).forEach((raw, i) => {
        state.prompts[i] = normPrompt(raw);
        if (i === selected) state.prompts[i].firstFrame = inputFilename;
        state.prompts[i].enabled = i >= selected;
      });
      ctx.persist(); renderFirstFrameRow(); renderList(); renderImageRow();
      ctx.showPopup?.(`Continuing from ${clip?.filename || "the selected clip"} — clips before this are off.`, false);
    }, { mode: "frame" });
  });
  fiRemoveBtn.addEventListener("click", () => {
    state.prompts[selected] = normPrompt(state.prompts[selected]);
    state.prompts[selected].firstFrame = "";
    if (Array.isArray(state._resumeSnapshot)) {
      (state.prompts || []).forEach((raw, i) => {
        state.prompts[i] = normPrompt(raw);
        state.prompts[i].enabled = state._resumeSnapshot[i] !== false;
      });
      delete state._resumeSnapshot;
    }
    ctx.persist(); renderFirstFrameRow(); renderList(); renderImageRow();
  });
  // Insert-at-cursor tags — <Picture N>, <Subject N>, <Shot N> — into the clip editor.
  // "N" is inserted literally; the user replaces it with the actual number themselves.
  function insertTagAtCursor(ta, tag) {
    const s = ta.selectionStart ?? ta.value.length;
    const e = ta.selectionEnd ?? ta.value.length;
    const token = `<${tag} N>`;
    ta.value = ta.value.slice(0, s) + token + ta.value.slice(e);
    ta.focus();
    ta.setSelectionRange(s + token.length, s + token.length);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }
  // Centered between "Select from the gallery" (left) and the Continue label (right) —
  // wrapped in a flex:1 div so justifyContent:center actually centers it in the row.
  const tagBtnRow = el("div", { style: { flex: "1", display: "flex", justifyContent: "center", gap: "5px" } },
    ["Picture", "Subject", "Shot"].map(tag => {
      const b = el("button", { type: "button", text: tag, title: `Insert <${tag} N> at the cursor`, style: {
        cursor: "pointer", fontFamily: "inherit", fontSize: "10px", padding: "4px 8px",
        borderRadius: "5px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
      }});
      // mousedown steals focus from the editor before click fires, collapsing its
      // selection to the end — preventDefault keeps the editor focused throughout.
      b.addEventListener("mousedown", (e) => e.preventDefault());
      b.addEventListener("click", () => insertTagAtCursor(editor, tag));
      return b;
    }));
  fiRow.append(fiThumb, fiGalleryBtn, tagBtnRow, fiLabel, fiRemoveBtn);
  const fiHint = el("div", {
    text: "Resuming a multi-clip run: pick the last finished clip, then write the prompts "
        + "for the clips that still need rendering. This clip starts from that clip's final "
        + "frame (First/Last), the ones before it are switched off.",
    style: { fontSize: "9.5px", color: C.muted, lineHeight: "1.5", flexShrink: "0" },
  });
  function renderFirstFrameRow() {
    const p = normPrompt(state.prompts[selected] || {});
    const ff = p.firstFrame || "";
    if (ff) {
      fiThumb.src = `/view?filename=${encodeURIComponent(ff)}&type=input`;
      fiThumb.style.display = "block";
      fiLabel.textContent = `Continuing from: ${ff}`;
      fiRemoveBtn.style.display = "inline-block";
    } else {
      fiThumb.style.display = "none";
      fiLabel.textContent = "▶ Continue generating the clip.";
      fiRemoveBtn.style.display = "none";
    }
  }
  editor.addEventListener("focus", () => editor.style.borderColor = BRAND);
  editor.addEventListener("blur",  () => editor.style.borderColor = C.border);
  // Same "busy, no per-step feedback" banner language as the video preview's own
  // frDetectBanner/fvsrBanner — dim cover + centered glowing text — over the one field
  // a Prompt Write/Refine run is actually about to overwrite.
  const editorWrap = el("div", { style: { flex: "1", display: "flex", position: "relative", minHeight: "0" } });
  const editorBusyOv = el("div", { text: "✨ Writing the prompt…", style: {
    display: "none", position: "absolute", inset: "0", zIndex: "5",
    alignItems: "center", justifyContent: "center", textAlign: "center",
    background: "rgba(0,0,0,0.75)", padding: "0 16px", borderRadius: "8px",
    color: "#b57bff", fontSize: "18px", fontWeight: "700",
    textShadow: "0 0 12px rgba(181,123,255,0.5)",
  }});
  editorWrap.append(editorBil.el, editorBusyOv);
  function setEditorBusy(busy, label) {
    editorBusyOv.textContent = label || "✨ Writing the prompt…";
    editorBusyOv.style.display = busy ? "flex" : "none";
    editor.disabled = busy;
    ctx.setPromptBusy?.(busy, label);
  }
  // Clip time override: the clip renders its own length instead of the global clip length. The
  // seconds snap to the model's frame grid (17k+5), so the note shows what is really rendered.
  const timeRow = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" } });
  const timeChk = el("input", { type: "checkbox" });
  timeChk.style.cursor = "pointer";
  const timeChkLbl = el("label", { style: { display: "flex", alignItems: "center", gap: "5px", fontSize: "10.5px",
    cursor: "pointer" } }, [timeChk, el("span", { text: "clip time override" })]);
  const timeIn = el("input", { type: "number", min: "1", max: "15", step: "0.5", style: {
    width: "64px", boxSizing: "border-box", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
    borderRadius: "6px", padding: "3px 6px", fontSize: "11px", fontFamily: "inherit", outline: "none", textAlign: "center",
  }});
  const timeNote = el("div", { style: { fontSize: "10px", color: C.muted } });
  function renderTimeRow() {
    const p = normPrompt((state.prompts || [])[selected] || {});
    const on = !!p.timeOverride;
    timeChk.checked = on;
    timeChkLbl.style.color = on ? "#ffb020" : C.muted;
    timeIn.disabled = !on;
    timeIn.style.opacity = on ? "1" : "0.4";
    if (on) timeIn.value = String(Number((p.timeSec || 0).toFixed(2)));
    else timeIn.value = "";
    renderOverrideChk();
    const global = state.clipFrames ?? 192;
    const over = overMaxSec(p);
    timeIn.style.borderColor = over ? C.err : C.border;
    timeNote.style.color = over ? C.err : C.muted;
    timeNote.textContent = over
      ? `set to ${p.timeSec}s - the model renders at most ${MAX_CLIP_SEC}s: set ${MAX_CLIP_SEC}s or less`
      : on
      ? `renders ${clipSecondsFor(state, selected).toFixed(2)}s (${clipFramesFor(state, selected)} frames)`
      : `global ${(global / 24).toFixed(2)}s`;
  }
  function timeChanged() {
    snapClipText(selected);
    editorBil.refresh();
    ctx.persist(); renderTimeRow(); renderList(); refreshPlanTag(); refreshPreviewTag(); ctx.refreshModes?.();
  }
  timeChk.addEventListener("change", () => {
    state.prompts[selected] = normPrompt(state.prompts[selected]);
    const p = state.prompts[selected];
    p.timeOverride = timeChk.checked;
    if (timeChk.checked && !(p.timeSec > 0)) p.timeSec = clipSecForTyped((state.clipFrames ?? 192) / 24);
    timeChanged();
  });
  // Typing: the red flag follows the value as it is typed (a value above 15 s stays red until it is 15 s or less);
  // on change the value is snapped to what the model can render.
  timeIn.addEventListener("input", () => {
    const v = parseFloat(timeIn.value);
    if (!(v > 0) || !state.prompts[selected]) return;
    state.prompts[selected] = normPrompt(state.prompts[selected]);
    state.prompts[selected].timeSec = v;
    timeIn.style.borderColor = v > MAX_CLIP_SEC ? C.err : C.border;
    renderList();
  });
  timeIn.addEventListener("change", () => {
    state.prompts[selected] = normPrompt(state.prompts[selected]);
    const v = parseFloat(timeIn.value);
    if (v > 0) state.prompts[selected].timeSec = clipSecForTyped(v);   // the real render length, in half seconds
    timeChanged();
  });
  // "override for this clip" - the clip's own references, header and sound / music. Ticking it
  // unfolds LOCAL ENHANCE (where those are edited) if it is folded; an unfolded one stays as it is.
  const ovChk = el("input", { type: "checkbox" });
  ovChk.style.cursor = "pointer";
  const ovLbl = el("label", { style: { display: "flex", alignItems: "center", gap: "5px", fontSize: "10.5px",
    cursor: "pointer", marginLeft: "auto", flexShrink: "0" } }, [ovChk, el("span", { text: "override for this clip" })]);
  function renderOverrideChk() {
    const p = normPrompt((state.prompts || [])[selected] || {});
    ovChk.checked = !!p.override;
    // A clip switched off for a resume has nothing to override - grey it out.
    ovChk.disabled = !promptEnabled(p);
    ovChk.style.cursor = ovChk.disabled ? "default" : "pointer";
    ovLbl.style.color = p.override ? BRAND : C.text;
  }
  ovChk.addEventListener("change", () => {
    state.prompts[selected] = normPrompt(state.prompts[selected]);
    const p = state.prompts[selected];
    p.override = ovChk.checked;
    // Starting from the common set is the useful default: an override almost always
    // means "these, but swap one", not "start from nothing".
    if (ovChk.checked && !(p.refImages || []).length) {
      p.refImages = (state.refImages || []).slice();
      p.refImagesMp = (state.refImagesMp || []).slice();
    }
    if (ovChk.checked && !p.assetRef) {
      p.refSource = state.refSource || "files";
      p.assetRef = state.assetRef ? { ...state.assetRef, ids: [...(state.assetRef.ids || [])] } : null;
    }
    // The header and the sound/music tail describe the scene the images establish, so
    // they follow the override too - seeded from the common pair the first time, which
    // gives the user something to edit rather than two empty boxes.
    if (ovChk.checked && !p.header && !p.footer) {
      p.header = state.promptHeader || "";
      p.footer = state.promptFooter || "";
    }
    if (ovChk.checked && state.enhCollapsed) { state.enhCollapsed = false; applyEnhCollapsed(); }
    ctx.persist(); renderImageRow(); refreshFraming(); renderList(); renderOverrideChk(); ctx.refreshModes?.();
  });
  timeRow.append(timeChkLbl, timeIn, el("div", { text: "sec", style: { fontSize: "10px", color: C.muted } }), timeNote, ovLbl);
  editCol.append(editHdr, timeRow, editorWrap, fiRow, fiHint);
  body.append(listCol, editCol);

  function updateCount() { refreshPreviewTag(); }

  const fmtSec = (s) => String(snapHalf(s));   // list times in half-second steps
  function renderList() {
    clear(listBox);
    let onCount = 0;
    const timeline = clipTimeline(state);
    (state.prompts || []).forEach((raw, i) => {
      const p = normPrompt(raw);
      if (promptEnabled(p)) onCount++;
      const active = i === selected;
      const on = promptEnabled(p);
      const overSec = overMaxSec(p);   // set longer than the model renders: red until the time is 15 s or less
      const item = el("div", { style: {
        display: "flex", gap: "4px", alignItems: "center", cursor: "grab",
        background: active ? C.bg3 : C.bg1, border: `1px solid ${overSec ? C.err : active ? BRAND : C.border}`,
        borderRadius: "6px", padding: "6px 7px", opacity: on ? "1" : "0.5",
      }});
      if (overSec) item.title = `This clip is set to ${p.timeSec} s; the model renders at most ${MAX_CLIP_SEC} s. Set its time to ${MAX_CLIP_SEC} s or less.`;
      const cb = el("input", { type: "checkbox" });
      cb.checked = on;
      cb.title = on ? "On — included in the run" : "Off — skipped when running";
      cb.style.cursor = "pointer";
      cb.addEventListener("click", e => e.stopPropagation());
      cb.addEventListener("change", () => {
        state.prompts[i] = normPrompt(state.prompts[i]);
        state.prompts[i].enabled = cb.checked;
        ctx.persist(); renderList();
      });
      // A clip with its own override reads orange-yellow in the list; one whose override is the
      // Asset Library reads pink. The running clock and each shot's range sit under / beside it.
      const ownClip = promptOverrides(p);
      const libClip = ownClip && p.refSource === "library";
      const labelColor = libClip ? "#ff6fb5" : ownClip ? "#ffb020" : (active ? C.text : C.muted);
      const tl = timeline[i];
      const shots = shotRanges(promptText(p), tl.sec);
      const rowLabel = el("div", { style: { flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" } }, [
        el("div", { text: `${i + 1} - Clip Prompt #${i + 1}`,
          style: { fontSize: "10.5px", color: labelColor, fontWeight: (active || ownClip) ? "700" : "400",
                   overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }),
        el("div", { text: tl.start == null ? "off" : overSec ? `${fmtSec(p.timeSec)} sec ⚠ over ${MAX_CLIP_SEC}` : `${fmtSec(tl.start)}~${fmtSec(tl.end)} sec${p.timeOverride ? " ⏱" : ""}`,
          title: p.timeOverride ? "This clip has its own length" : "Global clip length",
          style: { fontSize: "9.5px", color: overSec ? C.err : p.timeOverride ? "#ffb020" : C.muted, fontWeight: overSec ? "700" : "400" } }),
        // One-Take: each clip after the first overlaps the one before by 1.625 s, so its place in the stitched video is later-shorter.
        ...(tl.fstart != null ? [el("div", { text: `stitched ${fmtSec(tl.fstart)}~${fmtSec(tl.fend)} sec`,
          title: "Place in the finished One-Take video (1.625 s overlap with the previous clip removed)",
          style: { fontSize: "9.5px", color: C.ok } })] : []),
      ]);
      const shotCol = shots.length ? el("div", { style: { display: "flex", flexDirection: "column", gap: "1px", flexShrink: "0" } },
        shots.map(s => {
          // A shot that starts after the clip has ended is cut off: shown in red until the clip is longer
          // (clip time override) or the shots are re-timed.
          const late = s.start >= tl.sec - 0.05;
          return el("div", { text: `[shot ${s.n}] ${fmtSec(s.start)}~${fmtSec(late ? s.start : s.end)}`,
            title: late ? `Starts at ${fmtSec(s.start)}s, after this clip ends (${fmtSec(tl.sec)}s)` : "",
            style: { fontSize: "9.5px", color: late ? C.err : C.muted, whiteSpace: "nowrap" } });
        })) : null;
      const del = el("button", { type: "button", text: "✕", title: "Remove", style: {
        flexShrink: "0", cursor: "pointer", background: "transparent", color: C.muted,
        border: "none", fontSize: "10px", padding: "0 2px",
      }});
      del.addEventListener("click", e => {
        e.stopPropagation();
        if ((state.prompts || []).length <= 1) state.prompts = [{ text: "", firstFrame: "", enabled: true }];
        else state.prompts.splice(i, 1);
        if (selected >= state.prompts.length) selected = state.prompts.length - 1;
        ctx.persist(); renderList(); loadSelected();
      });
      // renderImageRow too: the attach area belongs to whichever clip is selected, so
      // switching clips has to swap which set it is showing and editing.
      item.addEventListener("click", () => {
        selected = i;
        renderList(); loadSelected(); renderImageRow();
        refreshFraming();   // the two boxes belong to the clip, not to the panel
      });

      // Drag to reorder the clip list. Whichever clip is selected stays selected — its
      // index just follows the move — so a mid-reorder click still edits the right clip.
      item.draggable = true;
      item.addEventListener("dragstart", e => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(i));
        item.style.opacity = "0.4";
      });
      item.addEventListener("dragend", () => { item.style.opacity = on ? "1" : "0.5"; });
      item.addEventListener("dragover", e => {
        e.preventDefault(); e.dataTransfer.dropEffect = "move";
        item.style.borderTop = `2px solid ${BRAND}`;
      });
      item.addEventListener("dragleave", () => { item.style.borderTop = ""; });
      item.addEventListener("drop", e => {
        e.preventDefault();
        item.style.borderTop = "";
        const from = Number(e.dataTransfer.getData("text/plain"));
        if (Number.isNaN(from) || from === i || !state.prompts[from]) return;
        const [moved] = state.prompts.splice(from, 1);
        state.prompts.splice(i, 0, moved);
        if (selected === from) selected = i;
        else if (from < selected && i >= selected) selected--;
        else if (from > selected && i <= selected) selected++;
        ctx.persist(); renderList(); loadSelected(); renderImageRow(); refreshFraming();
      });

      item.append(cb, rowLabel, ...(shotCol ? [shotCol] : []), del);
      listBox.appendChild(item);
    });
    refreshOnCountTag(onCount, (state.prompts || []).length);
  }

  function loadSelected() {
    const list = state.prompts || [{ text: "", firstFrame: "", enabled: true }];
    if (selected >= list.length) selected = 0;
    const p = normPrompt(list[selected]);
    editorBil.refresh();
    editorUndoClear.resetStack?.();
    editTitle.textContent = `Clip ${selected + 1}`;
    renderTimeRow();
    updateCount();
    renderFirstFrameRow();
  }

  addBtn.addEventListener("click", () => {
    (state.prompts = state.prompts || []).push({ text: "", firstFrame: "", enabled: true });
    selected = state.prompts.length - 1;
    ctx.persist(); renderList(); loadSelected(); editor.focus();
  });

  // ── Ollama enhance bar ─────────────────────────────────────────────────────
  // Capped and scrolled rather than left to grow: with nine image slots plus the per-clip
  // media pickers this block ran to a third of the panel, and every pixel it took came out
  // of the clip editor above it — the one box the user is actually typing in.
  const enhWrap = el("div", { style: {
    flexShrink: "0", background: C.bg1, border: `1px solid ${C.border}`,
    borderRadius: "8px", padding: "9px 10px", display: "flex", flexDirection: "column", gap: "7px",
    maxHeight: "330px", overflowY: "auto",
  }});

  const enhTop = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" } });
  const enhTitle = el("div", { text: "OLLAMA ENHANCE", style: { color: BRAND, fontSize: "10px", fontWeight: "700", letterSpacing: "0.06em" } });
  enhTop.appendChild(enhTitle);
  const statusTag = el("div", { text: "", style: { fontSize: "10px", color: C.muted, flex: "1" } });
  enhTop.appendChild(statusTag);

  // The source mode used to be two rows of manual toggle buttons (Text/Image, then
  // First-Last/Reference) — confusing, since the main screen's own generation mode
  // already says which images exist and what they mean. Both are now derived from
  // state.generationMode instead: t2v has no images to show, firstlast means the
  // brief writer sees the main screen's start/end frame, reference means it sees the
  // main screen's reference set. Recomputed at the start of every write/refine run so
  // it can never go stale if the main mode changed while this popup was open.
  let enhMode = "text";
  const modeTag = el("div", { style: { fontSize: "10px", color: C.muted, fontWeight: "700" } });
  function deriveModes() {
    const gm = state.generationMode || "t2v";
    enhMode = gm === "t2v" ? "text" : "image";
    state.briefImageMode = gm === "firstlast" ? "fl" : "ref";
    modeTag.textContent = gm === "t2v" ? "✨ Text → Brief"
      : gm === "firstlast" ? "🖼 Image → Brief (First/Last, from the main screen)"
      : "🖼 Image → Brief (Reference, from the main screen)";
    hdrModeTag.textContent = gm === "t2v" ? "Text To Video"
      : gm === "firstlast" ? "Image to Video (F/L)"
      : gm === "reference" ? "Reference to Video"
      : gm;
  }
  enhTop.appendChild(modeTag);

  const modelSelWrap = el("div", { style: { minWidth: "220px" } });
  const targetSel = select(
    [{ value: "one", label: "→ this clip" }, { value: "all", label: "→ split into all clips" }],
    "one", () => {});
  // The shared select() is width:100%; here it shares one bar with the length field and
  // the Enhance button, so it takes only what its label needs.
  targetSel.style.width = "auto";
  targetSel.style.flexShrink = "0";
  const enhBtn = el("button", { type: "button", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "12px", padding: "7px 16px",
    borderRadius: "6px", background: BRAND, color: "#fff", border: "none", fontWeight: "700",
    display: "inline-flex", alignItems: "center", gap: "6px",
  }});
  const enhSpin = el("span", { text: "⟳", style: {
    display: "none", animation: "mmh3-spin 0.8s linear infinite", fontSize: "13px",
  }});
  const enhBtnLabel = el("span", { text: "✨ Prompt Write" });
  enhBtn.append(enhSpin, enhBtnLabel);

  // Refine — revises an ALREADY-WRITTEN prompt from a typed instruction, instead of
  // writing a fresh one from scratch. Modeled on ComfyUI-MiniMaxH3-Prompt-Writer's
  // assemble_refinement(): text-only unless "Include Images" is ticked (then the attached
  // images get the same vision pass as Prompt Write), current prompt + the
  // instruction go to the same brief model, and the result goes through the exact same
  // review overlay as Prompt Write (one / split / manual / apply / discard / again).
  const refineBtn = el("button", { type: "button", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "12px", padding: "7px 16px",
    borderRadius: "6px", background: C.bg2, color: "#fff", border: `1px solid ${BRAND}`, fontWeight: "700",
    display: "inline-flex", alignItems: "center", gap: "6px",
  }});
  const refineSpin = el("span", { text: "⟳", style: {
    display: "none", animation: "mmh3-spin 0.8s linear infinite", fontSize: "13px",
  }});
  const refineBtnLabel = el("span", { text: "🔧 Prompt Refine" });
  refineBtn.append(refineSpin, refineBtnLabel);

  // How long the finished piece should be. Only the LLM briefing uses it: it decides how
  // many shots to ask for. The run's real length still comes from the prompts that come
  // back, so this never contradicts "one prompt, one clip".
  const lenIn = el("input", { type: "text", placeholder: "3:20", style: {
    width: "74px", boxSizing: "border-box", background: C.bg2, color: C.text,
    border: `1px solid ${C.border}`, borderRadius: "6px", padding: "6px",
    fontSize: "12px", fontFamily: "inherit", outline: "none", textAlign: "center",
  }});
  lenIn.value = state.targetLength || "";
  lenIn.title = "Target length for the whole piece — 3:20, 200s, or 3분 20초. Blank = one shot per prompt already in the editor.";
  const lenTag = el("div", { style: { fontSize: "10px", color: C.muted, whiteSpace: "nowrap" } });
  function targetPlan() {
    const plan = ctx.currentPlan?.() || { count: 1, clipSec: 8 };
    const secs = parseTargetSeconds(lenIn.value);
    if (!(secs > 0)) return { shots: plan.count, seconds: plan.actualSeconds ?? plan.count * plan.clipSec, clipSec: plan.clipSec, fromField: false };
    const shots = Math.max(1, Math.round(secs / plan.clipSec));
    return { shots, seconds: shots * plan.clipSec, clipSec: plan.clipSec, fromField: true };
  }
  function renderLenTag() {
    const t = targetPlan();
    lenTag.textContent = t.fromField
      ? `→ ${t.shots} clips × ${t.clipSec.toFixed(2)}s = ${t.seconds.toFixed(1)}s`
      : `→ ${t.shots} clip${t.shots > 1 ? "s" : ""} (from the editor)`;
  }
  lenIn.addEventListener("input", () => { state.targetLength = lenIn.value; ctx.persist(); renderLenTag(); });
  renderLenTag();

  const imgRow = el("div", { style: { display: "none", alignItems: "center", gap: "8px" } });
  // Image → Brief source mode: which slot count applies and how the brief writer is
  // told to use the images. Kept separate from state.generationMode so writing a brief
  // never depends on — or silently changes — which mode the node is currently in.
  function renderImageRow() {
    clear(imgRow);
    imgRow.style.flexDirection = "column"; imgRow.style.alignItems = "stretch"; imgRow.style.gap = "6px";
    imgRow._flow = enhMode === "image" ? "flex" : "none";
    imgRow.style.display = state.enhCollapsed ? "none" : imgRow._flow;
    if (enhMode !== "image") return;


    // One attach area, two possible owners. Unticked it edits the panel's common
    // references - the set every other clip also renders with - and ticked it edits this
    // clip's own. The heading says which, because an attach area that silently belongs to
    // something else is how a whole run gets rendered with the wrong pictures.
    const p = (state.prompts || [])[selected] || {};
    const own = !!p.override;
    const list = () => (own ? (p.refImages ||= []) : (state.refImages ||= []));
    const mpList = () => (own ? (p.refImagesMp ||= []) : (state.refImagesMp ||= []));
    const commit = () => {
      ctx.persist(); renderImageRow(); ctx.refreshModes?.();
    };

    const head = el("div", { style: { display: "flex", alignItems: "center", gap: "8px" } });
    head.append(
      el("div", { text: own ? "This clip only" : "Common (shared by all clips)",
        style: { fontSize: "11px", fontWeight: "700", color: own ? BRAND : C.text, flex: "1" } }),
    );

    if (state.briefImageMode === "fl") {
      // First/Last gets the same Source switch as Reference, kept in step with the main screen
      // (state.refSource): Files / Gallery shows the main screen's frames (read-only here, they are
      // set there or via "Continue generating the clip"); Asset Library shows the frames picked from
      // the Asset tab - the common ones, or this clip's own with the override ticked.
      const useLibFL = (own ? p.refSource : state.refSource) === "library";
      const srcToggleFL = sourceToggle(useLibFL ? "library" : "files", (src) => {
        if (own) { p.refSource = src; if (src === "files") p.assetRef = null; }
        else { state.refSource = src; if (src === "files") state.assetRef = null; }
        ctx.persist(); renderImageRow(); ctx.refreshModes?.();
      });
      let flBody;
      if (useLibFL) {
        flBody = mountLibraryRefs({
          mode: "firstlast",
          note: own ? "This clip only: First / Last frames from the Asset tab." : "Common: First / Last frames from the Asset tab.",
          getRef: () => (own ? p.assetRef : state.assetRef) || emptyAssetRef(),
          onChange: (ref) => {
            const n = normalizeAssetRef(ref);
            if (own) p.assetRef = n; else state.assetRef = n;
            ctx.persist(); ctx.refreshModes?.();
          },
        }).el;
      } else {
        const a = clipAssets(state, selected);
        const thumb = (src, tag) => {
          const box = el("div", { style: {
            width: "72px", height: "72px", borderRadius: "6px", border: `1px solid ${C.border}`,
            background: "#000", display: "flex", alignItems: "center", justifyContent: "center",
            overflow: "hidden", flexShrink: "0",
          }});
          if (src) box.appendChild(el("img", { src: `/view?filename=${encodeURIComponent(src)}&type=input&t=${Date.now()}`,
            style: { width: "100%", height: "100%", objectFit: "cover" } }));
          else box.appendChild(el("div", { text: "none", style: { color: C.muted, fontSize: "10px" } }));
          return el("div", { style: { display: "flex", flexDirection: "column", gap: "4px", alignItems: "center" } },
            [box, el("div", { text: tag, style: { fontSize: "9.5px", color: C.muted } })]);
        };
        flBody = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } }, [
          el("div", { text: "First/Last frame — set on the main screen, or via \"Continue generating the clip\" above.",
            style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } }),
          el("div", { style: { display: "flex", gap: "12px" } }, [thumb(a.firstFrame, "Start"), thumb(a.lastFrame, "End")]),
        ]);
      }
      imgRow.append(head, srcToggleFL, flBody, modelSelWrap);
      return;
    }

    // One row, nine slots — wrapping put the tail of the set on a second line and pushed
    // the media columns beside it down with it.
    const grid = el("div", { style: { display: "flex", gap: "6px", flexWrap: "nowrap" } });
    function slot(i) {
      const name = list()[i];
      const box = el("div", { style: {
        width: "54px", height: "54px", borderRadius: "6px", border: `1px solid ${C.border}`,
        background: "#000", position: "relative", overflow: "hidden", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: "0",
      }});
      const isGone = (state.missingAssets || []).includes(name);
      if (name && isGone) {
        // A ghost, not an empty slot: the set used a picture here and the only way to
        // know that — and which one — is to keep saying so.
        box.style.border = `1px dashed ${C.warn}`;
        box.style.background = "#1a1206";
        box.appendChild(el("div", { title: `Missing from the input folder:
${name}`, style: {
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: "1px", width: "100%", height: "100%", padding: "2px", boxSizing: "border-box",
        }}, [
          el("div", { text: "⚠", style: { fontSize: "13px", color: C.warn, lineHeight: "1" } }),
          el("div", { text: name, style: {
            fontSize: "6.5px", color: C.warn, lineHeight: "1.1", textAlign: "center",
            overflow: "hidden", wordBreak: "break-all", maxHeight: "22px" } }),
        ]));
        box.appendChild(el("div", { text: String(i + 1), style: {
          position: "absolute", top: "1px", left: "3px", fontSize: "9px", fontWeight: "700",
          color: C.warn, textShadow: "0 0 3px #000", pointerEvents: "none" } }));
        // Still removable: a ghost is a prompt to act, not a slot you are stuck with.
        const gx = el("button", { type: "button", text: "✕", title: "Remove this missing entry", style: {
          position: "absolute", top: "0", right: "0", cursor: "pointer", fontSize: "10px",
          background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", padding: "1px 4px", zIndex: "3",
        }});
        gx.addEventListener("click", e => {
          e.stopPropagation();
          list().splice(i, 1); mpList().splice(i, 1);
          state.missingAssets = (state.missingAssets || []).filter(x => x !== name);
          commit();
        });
        box.appendChild(gx);
      } else if (name) {
        box.appendChild(el("img", { src: `/view?filename=${encodeURIComponent(name)}&type=input&t=${Date.now()}`,
          style: { width: "100%", height: "100%", objectFit: "cover" } }));
        box.appendChild(el("div", { text: String(i + 1), style: {
          position: "absolute", top: "1px", left: "3px", fontSize: "9px", fontWeight: "700",
          color: "#fff", textShadow: "0 0 3px #000" } }));
        const x = el("button", { type: "button", text: "✕", title: "Remove", style: {
          position: "absolute", top: "0", right: "0", cursor: "pointer", fontSize: "10px",
          background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", padding: "1px 4px",
        }});
        x.addEventListener("click", e => {
          e.stopPropagation();
          list().splice(i, 1); mpList().splice(i, 1);
          commit();
        });
        box.appendChild(x);

        // Drag to reorder — the number badge is the <Picture N> token position.
        box.draggable = true;
        box.addEventListener("dragstart", e => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", String(i));
          box.style.opacity = "0.4";
        });
        box.addEventListener("dragend", () => { box.style.opacity = "1"; });
        box.addEventListener("dragover", e => {
          e.preventDefault(); e.dataTransfer.dropEffect = "move";
          box.style.outline = `2px solid ${BRAND}`;
        });
        box.addEventListener("dragleave", () => { box.style.outline = "none"; });
        box.addEventListener("drop", e => {
          e.preventDefault();
          box.style.outline = "none";
          const from = Number(e.dataTransfer.getData("text/plain"));
          if (Number.isNaN(from) || from === i || !list()[from]) return;
          const l = list(), mp = mpList();
          const [movedImg] = l.splice(from, 1);
          l.splice(i, 0, movedImg);
          const [movedMp] = mp.splice(from, 1);
          mp.splice(i, 0, movedMp);
          commit();
        });
      } else {
        box.appendChild(el("div", { text: "+img", style: { color: C.muted, fontSize: "10px", pointerEvents: "none" } }));
        const inp = el("input", { type: "file", accept: "image/*", style: { display: "none" } });
        async function take(f, picked) {
          if (!f && !picked) return;
          const uploaded = picked || await uploadImage(f);
          list()[i] = uploaded;
          mpList()[i] = mpList()[i] ?? 1.0;
          commit();
        }
        const galBtn = el("button", { type: "button", text: "🖼", title: "Pick from a gallery", style: {
          position: "absolute", bottom: "1px", left: "1px", zIndex: "3",
          background: "rgba(0,0,0,0.7)", color: "#fff", border: "none", borderRadius: "3px",
          width: "16px", height: "16px", cursor: "pointer", fontSize: "9px", padding: "0",
        }});
        galBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          openImageGalleryPicker(async (filename) => { await take(null, filename); });
        });
        box.appendChild(galBtn);
        box.addEventListener("click", () => inp.click());
        inp.addEventListener("change", async () => { await take(inp.files[0]); inp.value = ""; });
        box.addEventListener("dragover",  e => { e.preventDefault(); box.style.borderColor = BRAND; });
        box.addEventListener("dragleave", () => { box.style.borderColor = C.border; });
        box.addEventListener("drop", async e => { e.preventDefault(); box.style.borderColor = C.border; await take(e.dataTransfer.files[0]); });
        box.appendChild(inp);
      }
      return box;
    }
    // Attach holds up to the render limit; the brief modes cap how many of them the
    // vision model is shown, and it reads from the front of the list.
    const filled = list().filter(Boolean).length;
    for (let i = 0; i < filled; i++) grid.appendChild(slot(i));
    if (filled < 9) grid.appendChild(slot(filled));

    const visionCap = imageBriefMax(state.briefImageMode);
    const note = el("div", { style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } });
    note.innerHTML = filled
      ? `${filled}/9 images for this clip. Enhance reads the first `
        + `<b>${Math.min(filled, visionCap)}</b> (brief mode cap: ${visionCap}).`
      : `Add up to 9. Enhance reads the first ${visionCap}, per the brief mode above.`;

    // The mode buttons sit inside the image column, and every media column's caption is
    // the first row of its own column, all at this height — that is what puts each set of
    // thumbnails on the same line. Declared here because the media builder below reads it.
    const HEAD_H = "24px";

    // Reference video / audio, override only. They are render inputs, never shown to the
    // vision model: feeding clips to it would restrict which model can be used and cost
    // far more time, for something that helps write a prompt rather than make the video.
    const mediaRow = el("div", { style: {
      display: own ? "flex" : "none", gap: "14px", alignItems: "flex-start", flexWrap: "wrap" } });
    if (own) {
      // The same slots the left panel uses, pointed at this clip's own arrays: file picker,
      // upload, in/out seconds, source facts, soundtrack checkbox. A single dropdown could
      // only ever hold one file and dropped the trim window the render actually needs.
      const mk = (labelText, list, kind) => {
        const wrap = el("div", { style: {
          display: "flex", flexDirection: "column", gap: "5px", flex: "0 0 auto" } });
        wrap.style.marginRight = "6px";
        wrap.appendChild(el("div", { text: labelText, style: {
          fontSize: "10px", color: C.muted, height: HEAD_H,
          display: "flex", alignItems: "center" } }));
        wrap.appendChild(buildClipMediaSlots(kind, list, ctx, renderImageRow,
          kind === "video" ? (onPick => (ctx.pickVideoFromGallery || openVideoGalleryPicker)(onPick)) : (onPick => openAudioGalleryPicker(onPick)),
          state.missingAssets));
        return wrap;
      };
      mediaRow.append(
        mk("Reference video (this clip)", p.refVideos ||= [], "video"),
        mk("Reference audio (this clip)", p.refAudios ||= [], "audio"),
      );
    }

    // Images, reference video and reference audio share one horizontal band: the image
    // grid is widest (it has to hold nine slots without wrapping), the two media columns
    // take what is left. Stacking them made this block tall enough to push the clip
    // editor off the panel.
    const assetBand = el("div", { style: {
      display: "flex", gap: "22px", alignItems: "stretch", width: "100%" } });
    // Fixed to the full nine slots (9 x 54px + 8 x 6px gaps) rather than sized to how many
    // images happen to be attached: otherwise the video and audio columns slide left and
    // right every time a picture is added or removed, and nothing beside it holds still.
    const imgCol = el("div", { style: {
      display: "flex", flexDirection: "column", gap: "5px",
      width: "534px", flex: "0 0 534px" } });
    // The Brief / Vision line runs the full width of the panel, under the band: inside the
    // 534px image column the long model paths wrapped into four short lines.
    modelSelWrap.style.marginTop = "0";
    modelSelWrap.style.paddingTop = "0";
    // Library assets / project for whoever owns this attach area (this clip when overriding,
    // else the node's common set) - when set they replace the file slots below.
    const libBlock = mountLibraryRefs({
      mode: "reference", sideReport: true,
      note: own ? "This clip only: assets or a project from the Asset tab." : "Common: assets or a project from the Asset tab.",
      getRef: () => (own ? p.assetRef : state.assetRef) || emptyAssetRef(),
      getPrompt: () => editor.value || "",
      onChange: (ref) => {
        const n = normalizeAssetRef(ref);
        if (own) p.assetRef = n; else state.assetRef = n;
        ctx.persist(); ctx.refreshModes?.();
      },
    });
    // One source at a time: the file slots (images, video, audio) or the library. Switching to
    // Files drops the library choice so nothing stays active out of sight.
    const useLib = (own ? p.refSource : state.refSource) === "library";
    const srcToggle = sourceToggle(useLib ? "library" : "files", (src) => {
      if (own) { p.refSource = src; if (src === "files") p.assetRef = null; }
      else { state.refSource = src; if (src === "files") state.assetRef = null; }
      ctx.persist(); renderImageRow(); ctx.refreshModes?.();
    });
    if (useLib) {
      // The Asset Library block takes the whole width: the picker on the left, the Load result beside it.
      imgCol.style.width = "100%"; imgCol.style.flex = "1";
      imgCol.append(srcToggle, libBlock.el);
    }
    else imgCol.append(srcToggle, grid, note);
    assetBand.append(imgCol);
    if (own && !useLib) assetBand.append(mediaRow);
    imgRow.append(head, assetBand, modelSelWrap);
  }


  const enhBottom = el("div", { style: {
    display: "flex", alignItems: "center", gap: "10px", flexWrap: "nowrap" } });
  lenTag.style.flex = "1";          // takes the slack, so Enhance stays hard right
  enhBtn.style.flexShrink = "0";
  enhBottom.append(targetSel,
    el("div", { text: "Length", style: { fontSize: "11px", color: C.muted, flexShrink: "0" } }),
    lenIn, lenTag);
  enhWrap.append(enhTop, imgRow, enhBottom);

  // ── collapse ───────────────────────────────────────────────────────────────
  // Folded away, the whole block is one bar at the foot of the panel and every pixel it
  // was using goes back to the editor above — which is the point of collapsing it while
  // writing a long prompt. The state is remembered so it does not spring open each time.
  const enhBody = [imgRow, enhBottom];
  const collapseBtn = el("button", { type: "button", title: "Collapse / expand", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "11px", lineHeight: "1",
    padding: "2px 7px", borderRadius: "5px", background: "transparent", color: C.muted,
    border: `1px solid ${C.border}`, flexShrink: "0",
  }});
  function applyEnhCollapsed() {
    const off = !!state.enhCollapsed;
    enhBody.forEach(nEl => { nEl.style.display = off ? "none" : (nEl === imgRow ? imgRow._flow : "flex"); });
    collapseBtn.textContent = off ? "▸" : "▾";
    // Released height goes to the editor, not to empty space under the block.
    enhWrap.style.maxHeight = off ? "none" : "330px";
    enhWrap.style.overflowY = off ? "visible" : "auto";
  }
  collapseBtn.addEventListener("click", () => {
    state.enhCollapsed = !state.enhCollapsed;
    ctx.persist(); applyEnhCollapsed();
  });
  enhTop.insertBefore(collapseBtn, enhTop.firstChild);

  function renderModelSel() {
    clear(modelSelWrap);
    const needImage = enhMode === "image";
    const bBackend = state.h3BriefBackend  || state.h3LlmBackend;
    const vBackend = state.h3VisionBackend || state.h3LlmBackend;
    const bOR = bBackend === "openrouter", vOR = vBackend === "openrouter";
    const bLlama = bBackend === "llamagguf", vLlama = vBackend === "llamagguf";
    const bCustom = bBackend === "custom", vCustom = vBackend === "custom";
    const customName = (base, model) => model ? `Custom:${model}${base ? ` @ ${base}` : ""}` : null;
    // Full names, nothing cut off: the line wraps instead of ending in an ellipsis.
    // This used to only ever check OpenRouter-vs-native, so picking Llama GGUF in Settings
    // silently kept showing whatever native CLIP was set before (reported: saved Llama GGUF,
    // panel still showed the old "LTX\gemma4_e4b_it_fp8_scaled.safetensors" native model).
    const brief  = bCustom ? customName(state.h3CustomBriefBase, state.h3CustomBriefModel)
      : bLlama ? (state.h3LlamaBriefModel ? `Llama:${state.h3LlamaBriefModel}` : null)
      : bOR ? `OR:${(state.h3OrModelBrief || state.h3OrModel) || "default"}`
      : (state.nativeBriefClip || null);
    // Vision has no GGUF model of its own — it reuses Brief's, only the mmproj differs.
    const vision = vCustom ? customName(state.h3CustomVisionBase, state.h3CustomVisionModel)
      : vLlama ? (state.h3LlamaVisionModel ? `Llama:${state.h3LlamaVisionModel}+${state.h3LlamaVisionMmproj || "none"}` : null)
      : vOR ? `OR:${(state.h3OrModelVision || state.h3OrModel) || "default"}`
      : (state.nativeVisionClip || null);
    // Clicking the line opens the LLM Setting popup (the Settings pickers for these two),
    // so the model can be changed without leaving Prompt Edit.
    const openQuick = () => ctx.openLlmQuickSettings?.(refreshSourceUI);
    const lineStyle = { fontSize: "10px", color: C.text, cursor: "pointer", lineHeight: "1.5",
      whiteSpace: "normal", overflowWrap: "anywhere", textDecoration: "underline dotted", textUnderlineOffset: "2px" };
    if (!brief || (needImage && !vision)) {
      modelSelWrap.appendChild(el("div", {
        text: !brief ? "Brief: not set — click to pick a CLIP/GGUF model or switch backend."
                     : "Vision: not set — click to pick a CLIP/GGUF model or switch backend.",
        title: "Click to open LLM Setting",
        onclick: openQuick,
        style: { ...lineStyle, fontSize: "10.5px", color: C.warn },
      }));
      return;
    }
    // Brief and Vision each get their own line, so a long model path stays on one line.
    const lines = needImage ? [`Brief: ${brief}`, `Vision: ${vision}`] : [`Brief: ${brief}`];
    modelSelWrap.appendChild(el("div", {
      title: "Click to change the Brief / Vision models",
      onclick: openQuick,
      style: { cursor: "pointer" },
    }, lines.map(t => el("div", { text: t, style: lineStyle }))));
  }

  // The header used to hardcode "(native CLIP)" from back when Native was the only
  // backend — stale ever since OpenRouter/Llama GGUF were added as alternatives, so it
  // kept saying "native CLIP" even while actually running on OpenRouter or Llama GGUF.
  function refreshSourceUI() {
    const label = (backend) => backend === "openrouter" ? "OpenRouter"
      : backend === "llamagguf" ? "Llama GGUF" : backend === "custom" ? "Custom endpoint" : "native CLIP";
    const bBackend = state.h3BriefBackend  || state.h3LlmBackend;
    const vBackend = state.h3VisionBackend || state.h3LlmBackend;
    enhTitle.textContent = bBackend === vBackend
      ? `LOCAL ENHANCE (${label(bBackend)})`
      : `LOCAL ENHANCE (Brief: ${label(bBackend)} · Vision: ${label(vBackend)})`;
    statusTag.textContent = (bBackend === "openrouter" || vBackend === "openrouter")
      ? "OpenRouter calls out to the cloud — everything else stays local"
      : (bBackend === "custom" || vBackend === "custom")
      ? "runs on your own Chat Completions endpoint (Connect Custom)"
      : (bBackend === "llamagguf" || vBackend === "llamagguf")
      ? "runs through TJ_NODE's local llama.cpp — no cloud call"
      : "runs through ComfyUI's own model loading - no external server";
    statusTag.style.color = C.muted;
    renderModelSel();
  }


  async function loadSystemPrompt() {
    const d = await getSystemPrompt("minimax");
    systemPrompt = d.instruction || "";
    systemPromptSource = d.source || "";
    if (systemPrompt) {
      srcTag.textContent = `system prompt: ${d.name || "Minimax H3"} (${systemPromptSource === "TJ_NODE" ? "from TJ_NODE" : "built-in"})`;
      srcTag.style.color = C.muted;
    } else {
      srcTag.textContent = d.needsRestart ? "⚠ restart ComfyUI to load the MiniMax system prompt" : "system prompt unavailable";
      srcTag.style.color = C.warn;
    }
  }

  // Give the model the run's actual shape so the brief fits the clips we'll render.
  // `imageSummary` is the merged vision-analysis text for Image → Brief (§C2's pipeline);
  // it's just another paragraph of context by the time the brief model sees it.
  // "원테이크 / 원 테이크 / onetake / one take / one-take" in the prompt switches on the One-Take mode and its prompt
  // rules by itself (Continuity = One-Take (latent), "Write prompts with the One-Take rules" ticked).
  const ONE_TAKE_WORD = /원\s*테이크|one[\s-]*take/i;
  function autoOneTake(text) {
    if (oneTakeLlmOn(state) || !ONE_TAKE_WORD.test(text || "")) return;
    state.continuityMode = "onetake";
    state.oneTakeLlm = true;
    ctx.persist();
    ctx.refreshModes?.();   // redraws the Continuity panel; it falls back to None when One-Take cannot run here
    if (state.continuityMode === "onetake") {
      ctx.showPopup?.("One-Take found in the prompt: Continuity is now One-Take (latent) and the One-Take prompt rules are on.", false);
    } else {
      ctx.showPopup?.("One-Take found in the prompt, but One-Take (latent) is not available here (update the TJ_NODE pack) - writing without it.", true);
    }
  }

  let writeTarget = "all";   // set by doWrite: "one" = this clip, "all" = split into all clips
  // What the Write in progress is (the Prompt Write menu): "single" = the normal Write; "longshot" = ONE prompt whose shot times run
  // over the whole piece, cut into clips in the result window; "onetake" = clips written with the One-Take rules from a total length.
  // The result window keeps the kind (reviewWriteKind) so it applies the answer the same way.
  let writeKind = "single", reviewWriteKind = "single";
  const oneTakeNow = () => writeKind === "onetake" || oneTakeLlmOn(state);
  const oneTakeReview = () => reviewWriteKind === "onetake" || oneTakeLlmOn(state);
  const fmtClock = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${(s - Math.floor(s / 60) * 60).toFixed(3).padStart(6, "0")}`;
  function buildUserPrompt(baseText, imageSummary, lib = null) {
    const one = writeTarget === "one";
    const t0 = targetPlan();
    // Each clip has its own length (clip time override), so the request lists them.
    const lens = one ? [clipSecondsFor(state, selected)]
      : t0.fromField ? Array.from({ length: t0.shots }, (_, k) => clipSecondsFor(state, k))
      : activePrompts(state).map(({ i }) => clipSecondsFor(state, i));
    const t = { shots: one ? 1 : t0.shots, seconds: lens.reduce((a, b) => a + b, 0) || t0.seconds, clipSec: lens[0] || t0.clipSec };
    const sameLen = lens.every(s => Math.abs(s - lens[0]) < 0.001);
    // Labeled key:value header block, same shape as ComfyUI-MiniMaxH3-Prompt-Writer's
    // assemble_request() user_content ("Mode: ...\nDuration: ...\nAspect ratio: ...\n\n
    // Reference manifest...\n\nCreative brief:\n...") — the label wording is copied
    // closely; what differs is only our own output shape (shot-separated brief text,
    // not their 6-section MiniMax H3 schema — our own system prompt already governs
    // that, this is just the same technique for framing the request).
    const modeLabel = state.generationMode === "reference" ? "Reference"
      : state.briefImageMode === "fl" ? "First/Last frame" : "Text/Image → Brief";
    const lines = [
      `Mode: ${modeLabel}`,
      sameLen
        ? `Target duration: ${t.seconds.toFixed(2)} seconds total, split into ${t.shots} shot(s) of ~${t.clipSec.toFixed(2)}s each.`
        : `Target duration: ${t.seconds.toFixed(2)} seconds total, split into ${t.shots} clips of ${lens.map(s => `${s.toFixed(2)}s`).join(", ")}.`,
    ];
    if (writeKind === "longshot" && !one) {
      // a long shot: ONE brief timed over the whole piece (the clips are cut from it afterwards)
      const edges = []; let acc = 0;
      for (const l of lens) { edges.push(acc); acc += l; }
      lines.push(
        `LONG SHOT. Write ONE brief for the whole piece, ${t.seconds.toFixed(1)} seconds in total, as one continuous long shot. `
        + `Shot times run over the WHOLE piece: "At MM:SS.mmm" is counted from the start of the piece (from 00:00.000 up to ${fmtClock(t.seconds)}), `
        + "never restarted for a clip.",
        `The piece will afterwards be cut into ${t.shots} consecutive clips (${edges.map((e, k) => `${fmtClock(e)}-${fmtClock(e + lens[k])}`).join(", ")}). `
        + "Start a new [Shot N] inside every one of those windows, at about the time the window opens, so every clip gets its own opening "
        + "and the shots cover the whole length without gaps. Keep the same people, place, light and style from one window to the next.",
        "Write the shared header sections (subject_definitions, summary, retention_analysis, SCENARIO, technical_settings) once, then the "
        + "[Shot N] blocks in order (the first [Shot 1] has no timestamp), then overall_soundscape and non_diegetic_music once. "
        + "Do not separate clips with --- : this is a single brief.",
      );
    } else if (t.shots > 1) {
      lines.push(
        `Write exactly ${t.shots} clips, separated by a line containing only ---. Every clip is its own video: write each one `
        + "as a full brief with the labels subject_definitions:, summary:, retention_analysis:, SCENARIO:, technical_settings:, "
        + "detailed_description: (followed by the [Shot N] blocks), overall_soundscape: and non_diegetic_music:.",
        "Time restarts in every clip: each clip begins at [Shot 1] with no timestamp, and the later shots of the SAME clip use "
        + "\"At MM:SS.mmm\" counted from that clip's own start. Never continue the time or the shot numbers from one clip to the next. "
        + "The shots of a clip must add up to that clip's own length.",
      );
    }
    if (oneTakeNow()) {
      // The clip before the one being written (target "one"): how it ends is what this one has to open with.
      let prevEnding = "";
      if (one && selected > 0) {
        const prev = promptText(normPrompt(state.prompts[selected - 1])).trim();
        prevEnding = prev.split(/\n\s*\n/).pop().replace(/\s+/g, " ").slice(-600);
      }
      lines.push("", oneTakeRules(lens, prevEnding));
    }
    // Library references are named by @token (the library node turns them into the model's tags),
    // so the numbered-tag manifest is replaced by the token list.
    const refCount = lib ? 0 : state.generationMode === "reference" ? (state.refImages || []).length : 0;
    lines.push(
      "",
      "Reference manifest:",
      lib ? lib.text
        : refCount
        ? `${refCount} reference image(s) supplied; refer to them as <Picture 1>…<Picture ${refCount}>.`
        : "None",
    );
    if (imageSummary) {
      if (state.briefImageMode === "fl") {
        lines.push("", "The following images were analyzed in order: image 1 is the STARTING frame, "
          + "the last one is the ENDING frame. Write the brief as a first/last-frame shot that moves "
          + "from the starting description to the ending one.", "", imageSummary);
      } else {
        lines.push("", "The following images were analyzed in order and are the <Picture 1>…"
          + `<Picture ${imageSummary.split("\n").length}> references for this brief.`, "", imageSummary);
      }
    }
    lines.push("", "Creative brief:", baseText || "(no text supplied — base the brief on the image analysis above)");
    // A last, plain restatement of the rules a long system prompt's earlier instructions
    // are most likely to drift away from, placed as the very last thing the model reads
    // before writing — the same "final contract" technique ComfyUI-MiniMaxH3-Prompt-Writer
    // uses (its assembly.py's _final_contract() appends a mode-specific grounding check
    // to the end of the USER message, not the system prompt, specifically for this
    // recency effect; wording below is adapted from that same closing paragraph). The
    // frame-anchored scenario's own instruction to invent a bridging action between two
    // frames is a documented exception, which is why this says "only the minimum needed"
    // rather than banning invention outright.
    lines.push(
      "",
      "Final grounding check: stay grounded in what the request and any images/video/audio "
      + "actually show — invent only the minimum needed to connect frames or fulfill the request, "
      + "never unrelated actions, props, on-screen text, dialogue, or locations. An explicit user "
      + "instruction always outranks a default assumption. Treat every explicitly assigned reference "
      + "role (voice, motion, style, etc.) as exclusive — use only that role's content, do not also "
      + "pull in its other visible traits. Do not invent music or ambient sound beyond what the "
      + "request asks for or clearly implies. Never pad solely to reach a length — use only what the "
      + "target duration above actually needs. Return only the complete brief text, no commentary "
      + "outside it.",
    );
    return lines.join("\n");
  }

  // Refine: revise an already-written prompt from a typed instruction. Structure and
  // wording closely follow ComfyUI-MiniMaxH3-Prompt-Writer's assemble_refinement():
  // the opening "rewrite / return only / do not discuss" instruction, current-prompt +
  // revision-instruction block, a reference-preservation rule (their version is scoped
  // to <Audio N> tags because that node's Reference mode uses audio/video assets we
  // don't; ours is <Picture N>, the only reference tag our own brief format uses), and
  // a final grounding check appended last for the same recency effect — text-only, no
  // images re-attached, exactly like their version ("media is intentionally not
  // attached"). The OUTPUT stays our own shot-separated brief format throughout; only
  // the prompt-construction technique is borrowed.
  function buildRefineUserPrompt(currentPrompt, instruction, imageSummary, lib = null, common = null) {
    const lines = [
      "Rewrite the current H3 brief according to the revision instruction. "
      + "Return only the complete revised brief. Do not discuss the changes.",
      "",
      "Current prompt:",
      currentPrompt || "(empty)",
      "",
    ];
    // The Common opening / tail is put around this prompt when the clip is made, so it is not in the text above:
    // show it, or the rewrite repeats or contradicts it.
    const commonHeader = (common?.header || "").trim(), commonFooter = (common?.footer || "").trim();
    if (commonHeader || commonFooter) {
      lines.push(
        "Common prompt (placed before and after the current prompt when the video is made — read it so the revised "
        + "brief fits it: do not repeat it, do not contradict it, and do not include it in your answer):",
        ...(commonHeader ? ["Opening:", commonHeader] : []),
        ...(commonFooter ? ["Tail:", commonFooter] : []),
        "",
      );
    }
    if (imageSummary) {
      lines.push(
        state.briefImageMode === "fl"
          ? "The images currently attached were analyzed in order: image 1 is the STARTING frame, "
            + "the last one is the ENDING frame. They may differ from what the current prompt "
            + "describes — update the prompt so it matches these images."
          : "The images currently attached were analyzed in order and are the <Picture 1>…"
            + `<Picture ${imageSummary.split("\n").length}> references. They may differ from what the `
            + "current prompt describes — update the prompt so it matches these images.",
        "",
        imageSummary,
        "",
      );
    }
    if (lib) lines.push(lib.text, "");
    if (oneTakeLlmOn(state)) {
      lines.push("This brief is one clip of a One-Take run: keep a single [Shot 1] (later beats as \"At 00:02.000, ...\" in the same paragraph), "
        + "keep the clip ending in motion with its exact end state, and keep the opening that copies the previous clip's end state, "
        + "unless the instruction asks otherwise.", "");
    }
    lines.push(
      "Revision instruction:",
      instruction,
      "",
      lib
        ? "Reference revision rule: preserve each existing @token that the revision instruction does "
          + "not ask to change. Only add or remove an @token when the instruction's meaning actually "
          + "calls for it, and use only the tokens listed above."
        : "Reference revision rule: preserve each existing <Picture N> tag that the revision "
          + "instruction does not ask to change. Only add, remove, or renumber a <Picture N> tag "
          + "when the instruction's meaning actually calls for it.",
      "",
      "Final grounding check: keep everything from the current prompt that the instruction "
      + (imageSummary ? "or the attached images don't call for changing. " : "doesn't ask you to change. ")
      + "Apply only what the instruction actually asks for — do not "
      + "invent unrelated actions, props, on-screen text, dialogue, locations, music or ambient "
      + "sound beyond what it asks for or clearly implies. Return only the complete revised "
      + "prompt, no commentary outside it.",
    );
    return lines.join("\n");
  }

  // Vision calls stay factual and format-free on purpose — Shot structure, <Picture N>
  // tags and duration all belong to the brief model, which never has to fight a vision
  // model's idea of "brief" formatting.
  const VISION_SYSTEM_PROMPT = "Describe this image factually and concisely for a video "
    + "director: subject appearance, pose, expression, setting, lighting. Plain prose, "
    + "no formatting, no preamble, 2-4 sentences.";

  // ── progress display ──────────────────────────────────────────────────────
  // Nothing here before this: the button just said "Enhancing…" once and sat still
  // until the response landed, indistinguishable from a hang. A cold vision-model load
  // alone can take well past 30s.
  let progTimer = null, progStart = 0, progStage = "";
  function progressStart() {
    progStart = Date.now();
    progTimer = setInterval(progressTick, 1000);
    progressTick();
  }
  function progressStage(text) { progStage = text; progressTick(); }
  function progressTick() {
    const s = Math.round((Date.now() - progStart) / 1000);
    enhSpin.style.display = "inline-block"; enhBtnLabel.textContent = `${progStage} (${s}s)`;
    statusTag.textContent = s > 30
      ? `${progStage} — a cold Ollama model load can take a while past this point`
      : progStage;
    statusTag.style.color = BRAND;
  }
  function progressStop() {
    if (progTimer) clearInterval(progTimer);
    progTimer = null;
  }

  // The native path (analyzeImagesNative → TJ_MultiImageLoader) already fixes this at
  // megapixel: 1.0 server-side; the Ollama path sent the raw upload with no cap at all,
  // so a big reference image meant a much bigger request than the native path ever sent
  // for the same picture. Match it here, client-side, since there's no server hop for
  // the Ollama call to do it in.
  async function imageToB64(filename) {
    const resp = await fetch(`/view?filename=${encodeURIComponent(filename)}&type=input`);
    const blob = await resp.blob();
    const bitmap = await createImageBitmap(blob);
    const targetPixels = 1024 * 1024;
    const scale = Math.min(1, Math.sqrt(targetPixels / (bitmap.width * bitmap.height)));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    return dataUrl.split(",")[1] || "";
  }

  // The pictures this clip will actually be made from — the override set when it has
  // one, or the main screen's own first/last frame pair in First/Last mode.
  // First/Last frames picked from the Asset Library for the clip being edited (null = file frames).
  function flLibraryIds() {
    const a = clipAssets(state, selected);
    const p = (state.prompts || [])[selected] || {};
    const lib = (a.own ? p.refSource : state.refSource) === "library" ? a.assetRef : null;
    return { first: lib?.first || null, last: lib?.last || null };
  }

  // The vision pass reads pictures from input/, so a library frame is copied there first, scaled
  // to 1 MP like every other picture sent to the vision model (one fixed name per asset, overwritten each time).
  async function libraryFrameFile(id) {
    const bitmap = await createImageBitmap(await (await fetch(reflib.fileUrl({ id }))).blob());
    const scale = Math.min(1, Math.sqrt(1024 * 1024 / (bitmap.width * bitmap.height)));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const jpg = await new Promise(r => canvas.toBlob(r, "image/jpeg", 0.92));
    return uploadImage(new File([jpg], `h3lib_${id}.jpg`, { type: "image/jpeg" }));
  }

  // attachedImages() plus the First/Last frames of the Asset Library, which are not file names.
  async function attachedImagesResolved() {
    if (enhMode === "image" && state.briefImageMode === "fl") {
      const { first, last } = flLibraryIds();
      if (first || last) return Promise.all([first, last].filter(Boolean).map(libraryFrameFile));
    }
    return attachedImages();
  }

  function attachedImages() {
    if (enhMode !== "image") return [];
    const a = clipAssets(state, selected);
    // Library assets are described from their library record instead (see libraryContext).
    if (libraryRefFor(a, state.generationMode)) return [];
    return state.briefImageMode === "fl" ? [a.firstFrame, a.lastFrame].filter(Boolean)
      : a.refImages.slice(0, imageBriefMax(state.briefImageMode));
  }

  // The library references of the clip being edited, described for the LLM (null for a file clip).
  // Cached for a few seconds (libraryContextCached): typing "@" asks for it on every keystroke.
  const libraryContextForClip = () => libraryContextCached(libraryRefFor(clipAssets(state, selected), state.generationMode));
  attachAtComplete(editor, async () => (await libraryContextForClip())?.items || []);

  // Vision pass shared by Prompt Write and Prompt Refine: returns the "Image N: ..." text.
  async function describeImages(images, onStage = progressStage) {
    if (!images.length) return "";
    const visionOR = (state.h3VisionBackend || state.h3LlmBackend) === "openrouter";
    const visionLlama = (state.h3VisionBackend || state.h3LlmBackend) === "llamagguf";
    const visionCustom = (state.h3VisionBackend || state.h3LlmBackend) === "custom";
    onStage(`Analyzing ${images.length} image${images.length > 1 ? "s" : ""}...`);
    let imageSummary;
    if (visionLlama) {
      // The shared /tj_studio_one/llm/image_to_prompt route (same one the image
      // nodes' Enhance panel uses) takes one image per call - no true multi-image
      // batching like the native TextGenerate path has - so loop client-side.
      const lines = [];
      for (let i = 0; i < images.length; i++) {
        onStage(`Analyzing image ${i + 1}/${images.length}...`);
        const b64 = await imageToB64(images[i]);
        const desc = await analyzeImageLlama(b64, state.h3LlamaVisionModel, state.h3LlamaVisionMmproj, VISION_SYSTEM_PROMPT, state.h3LlamaNCtx, state.h3LlamaMaxTokens);
        lines.push(String(desc || "").trim());
      }
      imageSummary = lines.join("\n");
    } else {
      // One call, whole batch - this path attends to every image at once (verified:
      // SPEC_MINIMAX_H3_NEXT_ROUND.md C5). The instruction asks for them to stay
      // separated in the answer since nothing downstream re-splits them.
      const prompt = `${VISION_SYSTEM_PROMPT} There are ${images.length} images, in order. `
        + `Describe each one separately, each on its own line starting with "Image N: ".`;
      imageSummary = (visionCustom
        ? await analyzeImagesCustom(images, prompt, { baseUrl: state.h3CustomVisionBase, model: state.h3CustomVisionModel, context: state.h3CustomVisionCtx })
        : visionOR
        ? await analyzeImagesOpenRouter(images, prompt, state.h3OrModelVision || state.h3OrModel)
        : await analyzeImagesNative(state.nativeVisionClip, images, prompt)).trim();
    }
    // The vision model is only asked to number its own lines "Image N: ..." — it does
    // not reliably count correctly (reported: 4 images came back labelled Image
    // 1/4/5/6). The brief model is told these lines are <Picture 1>...<Picture N>
    // strictly BY POSITION, but if the text still carries the vision model's own wrong
    // numbers right there in the line, the brief model has seen the wrong one attach to
    // the wrong picture in the observed cases. Force every line's label to match its
    // actual position instead of trusting whatever number the vision model wrote.
    return imageSummary.split("\n")
      .filter(line => line.trim())
      .map((line, i) => line.replace(/^\s*(?:Image|Picture)\s*\d+\s*:/i, `Image ${i + 1}:`))
      .join("\n");
  }

  // `auto` (Auto Prompt, run when Generate is pressed): nothing is asked or reviewed - the clip's whole
  // text goes to the model as one request and the whole answer replaces it. Problems throw so Generate stops.
  async function doWrite(opts) {
    const auto = opts?.auto === true;
    const stop = (msg) => { if (auto) throw new Error(msg); ctx.showPopup?.(msg, true); };
    if (busy) return false;
    writeKind = !auto && (opts?.kind === "longshot" || opts?.kind === "onetake") ? opts.kind : "single";
    deriveModes(); renderImageRow(); renderModelSel();
    // Same resolver the render loop uses, so Prompt Write always looks at the pictures
    // this clip will actually be made from.
    const images = await attachedImagesResolved();
    const lib = await libraryContextForClip();
    if (lib?.error) { stop(`Library references: ${lib.error}`); return false; }
    // Brief and Vision each choose their own backend (native CLIP vs OpenRouter vs the
    // local Llama GGUF backend the image nodes' shared Enhance panel already has).
    const briefOR  = (state.h3BriefBackend  || state.h3LlmBackend) === "openrouter";
    const visionOR = (state.h3VisionBackend || state.h3LlmBackend) === "openrouter";
    const briefLlama  = (state.h3BriefBackend  || state.h3LlmBackend) === "llamagguf";
    const visionLlama = (state.h3VisionBackend || state.h3LlmBackend) === "llamagguf";
    const briefCustom  = (state.h3BriefBackend  || state.h3LlmBackend) === "custom";
    const visionCustom = (state.h3VisionBackend || state.h3LlmBackend) === "custom";
    if (!briefOR && !briefLlama && !briefCustom && !state.nativeBriefClip) { stop("No brief CLIP set - pick one in Settings, or switch the Brief backend to OpenRouter/Llama GGUF."); return false; }
    if (images.length && !visionOR && !visionLlama && !visionCustom && !state.nativeVisionClip) { stop("No vision CLIP set - pick one in Settings, or switch the Vision backend to OpenRouter/Llama GGUF."); return false; }
    if (briefLlama && !state.h3LlamaBriefModel) { stop("No Llama GGUF brief model set - pick one in Settings."); return false; }
    if (images.length && visionLlama && !state.h3LlamaVisionModel) { stop("No Llama GGUF vision model set - pick one in Settings."); return false; }
    if (briefCustom && !(state.h3CustomBriefBase && state.h3CustomBriefModel)) { stop("Connect Custom (Brief) needs an API base URL and a model ID - set them in Settings."); return false; }
    if (images.length && visionCustom && !(state.h3CustomVisionBase && state.h3CustomVisionModel)) { stop("Connect Custom (Vision) needs an API base URL and a model ID - set them in Settings."); return false; }

    // a long shot / One-Take write is always for the whole piece (the dropdown only decides a normal Write)
    const target = auto ? "one" : writeKind !== "single" ? "all" : targetSel.value;
    writeTarget = target;
    // A clip that already has its own header and sound / music is written from all three together.
    const clipOwn = target === "one" && ownFraming() ? state.prompts[selected] : null;
    const base = [clipOwn?.header, editor.value, clipOwn?.footer].map(s => (s || "").trim()).filter(Boolean).join("\n\n");
    if (!base && !images.length && !lib) {
      if (auto) return false;
      stop("Write something first (or add an image)."); return false;
    }
    autoOneTake(base);
    // The model gets the guide for the mode being rendered: Reference (Ref2VA) has its own, the rest share one.
    const sys = auto ? (state.generationMode === "reference" ? H3_SYSTEM_PROMPT_REF : H3_SYSTEM_PROMPT_BASE) : systemPrompt;
    busy = true;
    enhBtn.disabled = true;
    setEditorBusy(true, "✨ Writing the prompt…");
    progressStart();
    try {
      const imageSummary = await describeImages(images);

      progressStage("Writing brief...");
      const text = (briefCustom
        ? await writeBriefCustom(sys, buildUserPrompt(base, imageSummary, lib), { baseUrl: state.h3CustomBriefBase, model: state.h3CustomBriefModel, context: state.h3CustomBriefCtx })
        : briefLlama
        ? await writeBriefLlama(buildUserPrompt(base, imageSummary, lib), state.h3LlamaBriefModel, state.h3LlamaNCtx, state.h3LlamaMaxTokens)
        : briefOR
        ? await writeBriefOpenRouter(sys, buildUserPrompt(base, imageSummary, lib), state.h3OrModelBrief || state.h3OrModel,
            // a full brief per clip is long: the room for the answer grows with the clip count
            Math.min(16000, 2200 * (writeTarget === "one" ? 1 : Math.max(1, targetPlan().shots)) + 1500))
        : await writeBriefNative(state.nativeBriefClip, sys, buildUserPrompt(base, imageSummary, lib))).trim();
      if (!text) throw new Error("empty response");
      if (auto) {
        state.prompts[selected] = normPrompt(state.prompts[selected]);
        fieldSetBoth(state.prompts[selected], "text", text, "");   // header / sound-music left alone; the Korean view is written when the KO / EN button is used
        statusTag.textContent = "written";
        statusTag.style.color = C.ok;
        return true;
      }
      // Never write straight in - show what came back and let the user decide.
      openReview(text, target);
      statusTag.textContent = "review the result";
      statusTag.style.color = C.ok;
    } catch (e) {
      statusTag.textContent = `⚠ ${String(e.message).slice(0, 90)}`;
      statusTag.style.color = C.err;
      if (auto) throw new Error(`Auto Prompt failed: ${e.message}`);
      ctx.showPopup?.(`Prompt Write failed: ${e.message}`, true);
    } finally {
      progressStop();
      busy = false; enhBtn.disabled = false; enhSpin.style.display = "none"; enhBtnLabel.textContent = "✨ Prompt Write";
      setEditorBusy(false);
    }
  }
  // ── Prompt Write menu ─────────────────────────────────────────────────────
  // The Write button first asks which kind of prompt to write: Single Shot (the normal Write), Long Shot (one prompt over a total
  // length you give, cut into clips in the result window) or One-Take (clips chained into one unbroken take: total length, written
  // with the One-Take rules, then cut into clips in the result window).
  const writeMenuOv = el("div", { style: {
    display: "none", position: "absolute", inset: "0", zIndex: "11", background: "rgba(0,0,0,0.6)",
    alignItems: "center", justifyContent: "center", boxSizing: "border-box",
  }});
  const writeMenuPanel = el("div", { style: {
    width: "min(560px, 92%)", display: "flex", flexDirection: "column", gap: "8px", padding: "14px", boxSizing: "border-box",
    background: "rgba(11,11,11,0.985)", border: `1px solid ${BRAND}`, borderRadius: "10px", boxShadow: "0 8px 30px rgba(0,0,0,0.6)",
  }});
  writeMenuOv.appendChild(writeMenuPanel);
  let writeMenuDone = null;
  function closeWriteMenu(result) {
    writeMenuOv.style.display = "none";
    const done = writeMenuDone; writeMenuDone = null;
    done?.(result);
  }
  writeMenuOv.addEventListener("click", (e) => { if (e.target === writeMenuOv) closeWriteMenu(null); });
  const menuSmallBtn = (text, on, primary = false) => {
    const b = el("button", { type: "button", text, style: {
      cursor: "pointer", fontFamily: "inherit", fontSize: "11px", padding: "7px 14px", borderRadius: "6px",
      background: primary ? BRAND : C.bg2, color: primary ? "#fff" : C.text, border: primary ? "none" : `1px solid ${C.border}`,
      fontWeight: primary ? "700" : "400" } });
    b.addEventListener("click", on);
    return b;
  };
  function writeKindBtn(title, desc, on) {
    const b = el("button", { type: "button", style: {
      cursor: "pointer", fontFamily: "inherit", textAlign: "left", display: "flex", flexDirection: "column", gap: "3px",
      padding: "10px 12px", borderRadius: "8px", background: C.bg1, border: `1px solid ${C.border}`, color: C.text } }, [
      el("div", { text: title, style: { fontSize: "12.5px", fontWeight: "700", color: BRAND } }),
      el("div", { text: desc, style: { fontSize: "10.5px", color: C.muted, lineHeight: "1.5" } }),
    ]);
    b.addEventListener("mouseenter", () => { b.style.borderColor = BRAND; });
    b.addEventListener("mouseleave", () => { b.style.borderColor = C.border; });
    b.addEventListener("click", on);
    return b;
  }
  function showWriteKinds() {
    clear(writeMenuPanel);
    writeMenuPanel.append(
      el("div", { text: "✨ Prompt Write — which kind?", style: { color: "#fff", fontSize: "13px", fontWeight: "700" } }),
      writeKindBtn("Single Shot Write", "One clip. The normal Write: this clip, or split into all clips (the dropdown next to the Write button).",
        () => closeWriteMenu({ kind: "single" })),
      writeKindBtn("Long Shot Write", "One long shot over a total length you give. The whole prompt is written on that timeline, then cut into clips in the result window - each clip gets its own shot numbers and times.",
        () => showWriteTotal("longshot")),
      writeKindBtn("One-Take Write", "Clips chained into one unbroken take. You give the total length; it is written with the One-Take rules (the end of each clip copied into the start of the next), then cut into clips in the result window.",
        () => showWriteTotal("onetake")),
      el("div", { style: { display: "flex", justifyContent: "flex-end" } }, [menuSmallBtn("Cancel", () => closeWriteMenu(null))]),
    );
  }
  function showWriteTotal(kind) {
    clear(writeMenuPanel);
    const plan = ctx.currentPlan?.() || { count: 1, clipSec: 8 };
    const input = el("input", { type: "text", placeholder: "30s, 0:30, 1분 20초", style: {
      width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
      borderRadius: "6px", padding: "8px 10px", fontSize: "13px", fontFamily: "inherit", outline: "none" } });
    input.value = state.targetLength || "";
    const hint = el("div", { style: { fontSize: "11px", color: C.muted, lineHeight: "1.5" } });
    const paint = () => {
      const secs = parseTargetSeconds(input.value);
      if (!(secs > 0)) { hint.style.color = C.muted; hint.textContent = "Type the total length."; return; }
      const n = Math.max(1, Math.round(secs / plan.clipSec));
      hint.style.color = C.text;
      hint.textContent = `→ ${n} clip(s) × ${plan.clipSec.toFixed(2)} s = ${(n * plan.clipSec).toFixed(1)} s`
        + (kind === "onetake" ? ` · the stitched video is about ${(n * plan.clipSec - (n - 1) * ONE_TAKE_OVERLAP_SEC).toFixed(1)} s (the ${ONE_TAKE_OVERLAP_SEC.toFixed(3)} s overlap of every clip after the first is removed)` : "");
    };
    input.addEventListener("input", paint);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    const go = () => {
      const secs = parseTargetSeconds(input.value);
      if (!(secs > 0)) { hint.style.color = C.err; hint.textContent = "Type the total length first."; return; }
      closeWriteMenu({ kind, totalSec: secs });
    };
    paint();
    writeMenuPanel.append(
      el("div", { text: kind === "longshot" ? "✨ Long Shot Write — total length" : "✨ One-Take Write — total length", style: { color: "#fff", fontSize: "13px", fontWeight: "700" } }),
      el("div", { text: kind === "longshot"
        ? "How long is the whole long shot? The prompt is written with times counted over this whole length."
        : "How long should the whole take be? The clips are written one after another with the One-Take rules.", style: { fontSize: "10.5px", color: C.muted, lineHeight: "1.5" } }),
      input, hint,
      el("div", { style: { display: "flex", justifyContent: "space-between", gap: "8px" } }, [
        menuSmallBtn("← Back", showWriteKinds),
        el("div", { style: { display: "flex", gap: "8px" } }, [menuSmallBtn("Cancel", () => closeWriteMenu(null)), menuSmallBtn("✨ Write", go, true)]),
      ]),
    );
    setTimeout(() => input.focus(), 40);
  }
  function askWriteKind() {
    return new Promise((resolve) => { writeMenuDone = resolve; showWriteKinds(); writeMenuOv.style.display = "flex"; });
  }
  async function onWriteClick() {
    if (busy) return false;
    const pick = await askWriteKind();
    if (!pick) return false;
    if (pick.kind !== "single") {
      // the plan (how many clips, how long) reads the target length field
      lenIn.value = `${Math.round(pick.totalSec * 100) / 100}s`;
      state.targetLength = lenIn.value;
      ctx.persist(); renderLenTag();
    }
    return doWrite({ kind: pick.kind });
  }
  enhBtn.addEventListener("click", onWriteClick);

  let lastRefineInstruction = "";
  async function doRefine() {
    if (busy) return;
    deriveModes();
    const briefOR    = (state.h3BriefBackend || state.h3LlmBackend) === "openrouter";
    const briefLlama = (state.h3BriefBackend || state.h3LlmBackend) === "llamagguf";
    const briefCustom = (state.h3BriefBackend || state.h3LlmBackend) === "custom";
    if (!briefOR && !briefLlama && !briefCustom && !state.nativeBriefClip) { ctx.showPopup?.("No brief CLIP set - pick one in Settings, or switch the Brief backend to OpenRouter/Llama GGUF.", true); return; }
    if (briefLlama && !state.h3LlamaBriefModel) { ctx.showPopup?.("No Llama GGUF brief model set - pick one in Settings.", true); return; }
    if (briefCustom && !(state.h3CustomBriefBase && state.h3CustomBriefModel)) { ctx.showPopup?.("Connect Custom (Brief) needs an API base URL and a model ID - set them in Settings.", true); return; }

    const current = (editor.value || "").trim();
    if (!current) { ctx.showPopup?.("Nothing to refine yet — write a prompt first.", true); return; }

    // Re-send the currently attached images with the request, for when the pictures were
    // swapped after the prompt was written. Lives in this dialog because Refine is reached
    // from two buttons (the main screen's and the Prompt Edit popup's) and both land here.
    // Only offered when the mode has images; the choice is saved the moment it is toggled.
    let includeImagesChk = null;
    if (enhMode === "image") {
      includeImagesChk = el("input", { type: "checkbox", style: { margin: "0", cursor: "pointer" } });
      includeImagesChk.checked = !!state.refineIncludeImages;
      includeImagesChk.addEventListener("change", () => { state.refineIncludeImages = includeImagesChk.checked; ctx.persist(); });
    }
    const includeImagesRow = includeImagesChk && el("label", {
      title: "Analyze the images currently attached (main screen / this clip) and refine the prompt to match them",
      style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "11.5px", color: C.text, cursor: "pointer" },
    }, [includeImagesChk, el("span", { text: "Include Images" })]);

    const instruction = await ask(ov, {
      title: "Refine prompt",
      message: "What should change in the current prompt?",
      initial: lastRefineInstruction,
      kind: "textarea",
      okLabel: "Refine",
      tags: ["Picture", "Subject", "Shot"],
      extra: includeImagesRow,
    });
    if (!instruction || !instruction.trim()) return;
    lastRefineInstruction = instruction.trim();
    autoOneTake(`${current}\n${lastRefineInstruction}`);

    const images = includeImagesChk?.checked ? await attachedImagesResolved() : [];
    const lib = await libraryContextForClip();
    if (lib?.error) { ctx.showPopup?.(`Library references: ${lib.error}`, true); return; }
    if (includeImagesChk?.checked && !images.length && !lib) { ctx.showPopup?.("Include Images is on, but no image is attached.", true); return; }
    const visionBackend = state.h3VisionBackend || state.h3LlmBackend;
    if (images.length) {
      if (visionBackend === "llamagguf" && !state.h3LlamaVisionModel) { ctx.showPopup?.("No Llama GGUF vision model set - pick one in Settings.", true); return; }
      if (visionBackend === "custom" && !(state.h3CustomVisionBase && state.h3CustomVisionModel)) { ctx.showPopup?.("Connect Custom (Vision) needs an API base URL and a model ID - set them in Settings.", true); return; }
      if (!["openrouter", "llamagguf", "custom"].includes(visionBackend) && !state.nativeVisionClip) { ctx.showPopup?.("No vision CLIP set - pick one in Settings, or switch the Vision backend to OpenRouter/Llama GGUF.", true); return; }
    }

    busy = true;
    refineBtn.disabled = true;
    refineSpin.style.display = "inline-block"; refineBtnLabel.textContent = "Refining...";
    setEditorBusy(true, "🔧 Refining the prompt…");
    statusTag.textContent = "refining..."; statusTag.style.color = BRAND;
    try {
      const imageSummary = await describeImages(images, (t) => { refineBtnLabel.textContent = t; statusTag.textContent = t; });
      refineBtnLabel.textContent = "Refining...";
      const userPrompt = buildRefineUserPrompt(current, lastRefineInstruction, imageSummary, lib, clipFraming(state, selected));
      const text = (briefCustom
        ? await writeBriefCustom(systemPrompt, userPrompt, { baseUrl: state.h3CustomBriefBase, model: state.h3CustomBriefModel, context: state.h3CustomBriefCtx })
        : briefLlama
        ? await writeBriefLlama(userPrompt, state.h3LlamaBriefModel, state.h3LlamaNCtx, state.h3LlamaMaxTokens)
        : briefOR
        ? await writeBriefOpenRouter(systemPrompt, userPrompt, state.h3OrModelBrief || state.h3OrModel)
        : await writeBriefNative(state.nativeBriefClip, systemPrompt, userPrompt)).trim();
      if (!text) throw new Error("empty response");
      openReview(text, "one", "refine");
      statusTag.textContent = "review the result";
      statusTag.style.color = C.ok;
    } catch (e) {
      statusTag.textContent = `⚠ ${String(e.message).slice(0, 90)}`;
      statusTag.style.color = C.err;
      ctx.showPopup?.(`Refine failed: ${e.message}`, true);
    } finally {
      busy = false; refineBtn.disabled = false; refineSpin.style.display = "none"; refineBtnLabel.textContent = "🔧 Prompt Refine";
      setEditorBusy(false);
    }
  }
  refineBtn.addEventListener("click", doRefine);

  // ── LLM result review ──────────────────────────────────────────────────────
  // The model's answer lands here first. It's shown already separated into the common
  // header, the shots and the sound/music tail, so applying it fills the right fields
  // instead of dumping one blob into the current clip.
  const reviewOv = el("div", { style: {
    display: "none", position: "absolute", inset: "0", zIndex: "20",
    background: "rgba(11,11,11,0.985)", borderRadius: "inherit",
    flexDirection: "column", padding: "12px", gap: "8px", boxSizing: "border-box",
  }});
  let reviewText = "", reviewTarget = "one", reviewKind = "write";
  // Set by openTransient() when a main-screen button (Refine or Prompt Write) opened
  // `ov` purely to host the review overlay (see openTransient's comment) — once the
  // user is done, close `ov` back up too instead of leaving the full Prompt Edit popup
  // sitting open behind it.
  let transientMode = false;
  /** Run `action` (doRefine or doWrite) for one clip without navigating into the full
   * Prompt Edit popup. `reviewOv` is an absolute-inset child of `ov` and only paints
   * while `ov` is displayed, so this still shows `ov` underneath, but the review card
   * (or the instruction dialog that precedes it, for Refine) fully covers it — the
   * user never sees the tabs/editor. */
  function openTransient(idx, action) {
    const wasOpen = ov.style.display !== "none";
    transientMode = !wasOpen;
    ov.style.display = "flex";
    if (!state.prompts || !state.prompts.length) state.prompts = [{ text: "", firstFrame: "", enabled: true }];
    if (idx != null) selected = idx;
    if (selected >= state.prompts.length) selected = 0;
    if (!systemPrompt) loadSystemPrompt();
    loadSelected();
    runTransient(action);
  }
  // After `action` settles with no review card showing, a popup that only exists to host
  // it closes again — and stops being "transient", so a later normal use of the popup
  // is never closed by a stale flag.
  function runTransient(action) {
    action().finally(() => {
      if (transientMode && reviewOv.style.display === "none") { ov.style.display = "none"; transientMode = false; }
    });
  }
  // How the result gets applied — chosen AFTER the model answers, on this screen:
  //   "one"    the whole brief as one paragraph into the current clip's shot field only
  //   "split"  parsed into common header / shots / sound-music tail (the old behaviour)
  //   "manual" only the result cards the user clicked are applied
  let reviewMode = "split";
  const reviewSel = new Set();                 // card keys picked in "manual" mode
  let reviewParsed = { header: "", shots: [], footer: "" };

  const rvHdr = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" } });
  const rvHdrTitle = el("div", { text: "✨ Prompt Write result", style: { color: "#fff", fontSize: "13px", fontWeight: "700" } });
  rvHdr.appendChild(rvHdrTitle);
  const rvInfo = el("div", { style: { fontSize: "10.5px", color: C.muted, flex: "1" } });
  rvHdr.appendChild(rvInfo);

  // Mode block — a centred caption over three toggle buttons, sitting just above
  // Discard / Apply so choosing how to apply is the last step before applying.
  const rvModeRow = el("div", { style: { display: "flex", flexDirection: "column", gap: "5px", flexShrink: "0" } });
  rvModeRow.appendChild(el("div", { text: "Choose how to apply this result",
    style: { fontSize: "10.5px", color: C.muted, textAlign: "center", fontWeight: "700" } }));
  const rvModeBtnRow = el("div", { style: { display: "flex", gap: "5px" } });
  rvModeRow.appendChild(rvModeBtnRow);
  const rvModeBtns = {};
  [
    ["one",    "1. One Prompt",    "Whole brief → this clip's shot field only"],
    ["split",  "2. Auto Split",    "Header / shots / sound-music into their own fields"],
    ["manual", "3. Use selected",  "Only the cards you pick above"],
  ].forEach(([k, lbl, tip]) => {
    const b = el("button", { type: "button", text: lbl, title: tip, style: {
      flex: "1", cursor: "pointer", fontFamily: "inherit", fontSize: "10px", fontWeight: "700",
      padding: "5px 0", borderRadius: "5px", border: `1px solid ${C.border}`, background: C.bg2, color: C.text,
    }});
    b.addEventListener("click", () => { reviewMode = k; renderReviewCards(); });
    rvModeBtns[k] = b; rvModeBtnRow.appendChild(b);
  });

  const rvBody = el("div", { style: { flex: "1", overflowY: "auto", display: "flex", flexDirection: "column", gap: "7px" } });
  rvBody.className = "mmh3-lp";

  const rvFoot = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" } });
  const rvSummary = el("div", { style: { fontSize: "10.5px", color: C.muted, flex: "1" } });
  const rvCancel = el("button", { type: "button", text: "✕ Discard", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "11px", padding: "6px 12px",
    borderRadius: "6px", background: C.bg2, color: C.muted, border: `1px solid ${C.border}`,
  }});
  const rvAgain = el("button", { type: "button", text: "↻ Write again", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "11px", padding: "6px 12px",
    borderRadius: "6px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
  }});
  const rvApply = button("✓ Apply", () => applyReview(), "primary");
  rvFoot.append(rvSummary, rvCancel, rvAgain, rvApply);
  reviewOv.append(rvHdr, rvBody, rvModeRow, rvFoot);

  // One result card. `key` is "header" | `shot:${i}` | "footer". In "manual" mode a click
  // toggles it in/out of the apply set and the border colour shows the state; in the other
  // two modes the card is a read-only preview of what that mode does with this piece.
  function reviewCard(key, title, text) {
    const selectable = reviewMode === "manual";
    const on = reviewSel.has(key);
    // manual: selected = thick brand border, no dim. unselected = black border + a black
    // scrim laid over the card (inset box-shadow) so it plainly reads as "not applied".
    // preview modes (one / split): a coloured border by kind, no scrim.
    const previewAccent = reviewMode === "one" ? C.border : key.startsWith("shot") ? BRAND : C.ok;
    const border = selectable ? (on ? `2px solid ${BRAND}` : "1px solid #3a3a3a")
                              : `1px solid ${previewAccent}`;
    const b = el("div", { style: {
      background: C.bg1, border, borderRadius: "7px", padding: "8px 10px",
      display: "flex", flexDirection: "column", gap: "3px",
      cursor: selectable ? "pointer" : "default",
      boxShadow: (selectable && !on) ? "inset 0 0 0 999px rgba(0,0,0,0.55)" : "none",
      opacity: (reviewMode === "one" && key !== "one") ? "0.5" : "1",
      transition: "box-shadow .1s, border-color .1s",
    }});
    b.append(
      el("div", { text: title + (selectable ? (on ? "   ● selected" : "   ○ off") : ""),
        style: { fontSize: "9.5px", fontWeight: "700",
          color: selectable ? (on ? BRAND : C.muted) : (previewAccent === C.border ? C.muted : previewAccent),
          letterSpacing: "0.05em" } }),
      el("div", { text, style: { fontSize: "11px", color: C.text, lineHeight: "1.55", whiteSpace: "pre-wrap" } }),
    );
    if (selectable) b.addEventListener("click", () => {
      reviewSel.has(key) ? reviewSel.delete(key) : reviewSel.add(key);
      renderReviewCards();
    });
    return b;
  }

  function renderReviewCards() {
    for (const k in rvModeBtns) {
      const active = k === reviewMode;
      rvModeBtns[k].style.background = active ? BRAND : C.bg2;
      rvModeBtns[k].style.color = active ? "#fff" : C.text;
    }
    const p = reviewParsed;
    clear(rvBody);

    if (reviewMode === "one") {
      rvBody.appendChild(reviewCard("one", `→ CLIP ${selected + 1} (whole brief, one paragraph)`, reviewText));
    } else {
      const briefs = reviewMode === "split" && reviewTarget === "all" && reviewWriteKind !== "longshot" ? clipBriefs(reviewText) : null;
      const windows = reviewMode === "split" && reviewTarget === "all" && reviewWriteKind === "longshot" && p.shots.length ? longShotClips() : null;
      if (windows) {
        // a long shot: the shots are cut into clips by the time window each one starts in; every clip starts over at [Shot 1]
        if (p.header) rvBody.appendChild(reviewCard("header", "COMMON — HEADER", p.header));
        windows.forEach((c, i) => rvBody.appendChild(reviewCard(`shot:${i}`, `CLIP ${i + 1} — ${fmtClockShort(c.from)}~${fmtClockShort(c.to)} of the long shot`, c.text)));
        if (p.footer) rvBody.appendChild(reviewCard("footer", "COMMON — SOUND / MUSIC", p.footer));
      } else if (briefs) {
        briefs.forEach((b, i) => {
          if (b.header) rvBody.appendChild(reviewCard("header", `CLIP ${i + 1} — THIS CLIP — HEADER`, b.header));
          rvBody.appendChild(reviewCard(`shot:${i}`, `CLIP ${i + 1}`, rebaseShots(b.shots.join("\n\n"))));
          if (b.footer) rvBody.appendChild(reviewCard("footer", `CLIP ${i + 1} — THIS CLIP — SOUND / MUSIC`, b.footer));
        });
      } else {
        const own = reviewTarget !== "all" && ownFraming();
        if (p.header) rvBody.appendChild(reviewCard("header", own ? "THIS CLIP — HEADER" : "COMMON — HEADER", p.header));
        const shots = p.shots.length ? p.shots : [reviewText];
        shots.forEach((s, i) => rvBody.appendChild(reviewCard(`shot:${i}`, `CLIP ${i + 1}`, s)));
        if (p.footer) rvBody.appendChild(reviewCard("footer", own ? "THIS CLIP — SOUND / MUSIC" : "COMMON — SOUND / MUSIC", p.footer));
      }
    }

    // Info line — for "all" enhance, call out when the model wrote a different shot count
    // than the target asked for (the small brief model often does).
    const lw = reviewMode === "split" && reviewTarget === "all" && reviewWriteKind === "longshot" && p.shots.length ? longShotClips() : null;
    const structured = reviewTarget === "all" && !lw ? clipBriefs(reviewText) : null;
    const want = reviewTarget === "all" ? targetPlan().shots : 0;
    const got = structured ? structured.length : lw ? lw.length : (p.shots.length || 1);
    let info = `${reviewText.length} chars`;
    if (reviewTarget === "all") {
      info += structured ? ` · ${got} clips` : ` · ${got} shot${got > 1 ? "s" : ""}`;
      if (want && got !== want) info += `  ⚠ asked for ${want} — use ✂ Split or ↻ Enhance again`;
    } else {
      info += ` → clip ${selected + 1}`;
    }
    if (oneTakeReview() && reviewMode !== "one") {
      const clips = structured ? structured.map(b => [b.header, ...b.shots, b.footer].join("\n"))
        : reviewTarget === "all" ? (p.shots.length ? p.shots : [reviewText]).map((s, i) => (i === 0 ? [p.header, s] : [s]).join("\n"))
        : [[p.header, ...p.shots, p.footer].join("\n")];
      const issues = oneTakeIssues(reviewTarget === "all" ? clips : clips.map(c => c));
      if (issues.length) info += `  ⚠ One-Take: ${issues.slice(0, 3).map(x => `clip ${x.clip} ${x.msg}`).join("; ")}${issues.length > 3 ? ` (+${issues.length - 3} more)` : ""}`;
    }
    rvInfo.textContent = info;

    rvSummary.textContent =
      reviewMode === "one"   ? `Whole brief → clip ${selected + 1}'s text. Header / tail untouched.`
    : reviewMode === "manual" ? (reviewSel.size ? `Applying ${reviewSel.size} selected part(s).` : "Click the cards to apply.")
    : lw                      ? `Cuts the long shot into ${got} clip(s) by time - each starts over at [Shot 1] with its own shot numbers and times. Replaces all prompts${p.header ? " + common header" : ""}${p.footer ? " + tail" : ""}.`
    : structured              ? `Replaces all prompts with ${got} clips, each with its own header and sound / music (override on).`
    : reviewTarget === "all"  ? `Replaces all prompts with ${got}${p.header ? " + header" : ""}${p.footer ? " + tail" : ""}.`
    :                           `Replaces clip ${selected + 1}${p.header || p.footer ? (ownFraming() ? " and this clip's header / sound" : " and the common parts") : ""}.`;
  }

  // The clip windows of a long shot: one clip length after another, as many as the planned clip count.
  const fmtClockShort = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
  function longShotClips() {
    const lens = Array.from({ length: Math.max(1, targetPlan().shots) }, (_, k) => clipSecondsFor(state, k));
    return splitShotsByTime(reviewParsed.shots.join("\n\n"), lens);
  }

  // N clips written as N full briefs separated by --- (each with its own header sections, [Shot N]
  // blocks and sound / music). null when the text is one brief, or --- only separates plain shots.
  function clipBriefs(text) {
    const parts = String(text || "").split(/^\s*-{3,}\s*$/m).map(s => s.trim()).filter(Boolean).map(parseBrief);
    return parts.length > 1 && parts.every(b => b.shots.length) && parts.some(b => b.header || b.footer) ? parts : null;
  }
  // A clip made from a split carries its own header / sound, so it needs the override on; the
  // references it had (common set) come along so nothing is lost by switching it on.
  // The shot times written in a clip's text are kept in half-second steps (a tie goes the way the clip's real
  // render length rounds - see snapShotTimes), so they follow the clip's length whenever it is set or changed.
  function snapClipText(i) {
    const c = (state.prompts || [])[i];
    if (c && typeof c === "object") {
      const sec = clipSecondsFor(state, i);
      c.text = snapShotTimes(c.text || "", sec);
      // the Korean view carries the same times ([Shot N] At MM:SS is never translated), so it follows them
      if (c.textKo) c.textKo = snapShotTimes(c.textKo, sec);
    }
  }
  function keepTimes(list, old) {
    list.forEach((c, i) => {
      const o = old[i];
      if (o && typeof o === "object" && o.timeOverride) { c.timeOverride = true; c.timeSec = o.timeSec; }
    });
    return list;
  }
  function seedOverride(c) {
    c.override = true;
    c.refImages = (state.refImages || []).slice();
    c.refImagesMp = (state.refImagesMp || []).slice();
    c.refVideos = (state.refVideos || []).map(v => ({ ...v }));
    c.refAudios = (state.refAudios || []).map(a => ({ ...a }));
    c.refSource = state.refSource || "files";
    c.assetRef = state.assetRef ? { ...state.assetRef, ids: [...(state.assetRef.ids || [])] } : null;
    return c;
  }

  function openReview(text, target, kind) {
    reviewText = text; reviewTarget = target; reviewKind = kind || "write";
    reviewWriteKind = reviewKind === "refine" ? "single" : writeKind;
    rvHdrTitle.textContent = reviewKind === "refine" ? "🔧 Prompt Refine result" : "✨ Prompt Write result";
    rvAgain.textContent = reviewKind === "refine" ? "↻ Refine again" : "↻ Write again";
    reviewParsed = parseBrief(text);
    reviewMode = reviewKind === "refine" ? "one" : "split";
    reviewSel.clear();
    // Manual mode starts with everything ticked, so "select" == "auto split" until the
    // user removes a card, rather than starting from an empty apply.
    if (reviewParsed.header) reviewSel.add("header");
    if (reviewParsed.footer) reviewSel.add("footer");
    (reviewParsed.shots.length ? reviewParsed.shots : [text]).forEach((_, i) => reviewSel.add(`shot:${i}`));
    renderReviewCards();
    reviewOv.style.display = "flex";
  }

  // Write / Refine produce English. The Korean view of a field they wrote is cleared (it no longer matches) and
  // written again right after the apply, with the same translator the KO / EN button uses.
  const koTodo = [];
  const putEn = (obj, key, en) => {
    fieldSetBoth(obj, key, en, "");
    if (String(en || "").trim()) koTodo.push([obj, key]);
  };
  function refreshBil() {
    if (document.activeElement !== editor) editorBil.refresh();
    if (document.activeElement !== headerTA) headerBil.refresh();
    if (document.activeElement !== footerTA) footerBil.refresh();
  }
  async function fillKoLater() {
    const todo = koTodo.splice(0);
    if (!todo.length) return;
    const llm = translateLlm(), protect = h3ProtectWords(state);
    for (let n = 0; n < todo.length; n++) {
      const [obj, key] = todo[n];
      if (!String(obj[key] || "").trim() || String(obj[koKey(key)] || "").trim()) continue;
      statusTag.textContent = `writing the Korean view ${n + 1}/${todo.length}…`;
      statusTag.style.color = BRAND;
      try { await fieldFill(obj, key, "ko", llm, { protect }); ctx.persist(); refreshBil(); }
      catch (e) {
        statusTag.textContent = `⚠ Korean view not written: ${String(e.message).slice(0, 80)}`;
        statusTag.style.color = C.err;
        return;
      }
    }
    statusTag.textContent = "applied"; statusTag.style.color = C.ok;
  }

  function applyReview() {
    const p = reviewParsed;
    if (reviewMode === "manual" && !reviewSel.size) {
      ctx.showPopup?.("Pick at least one card, or switch mode.", true); return;
    }
    snapshot(`enhance → ${reviewMode}`);
    const oldPrompts = (state.prompts || []).slice();

    if (reviewMode === "one") {
      state.prompts[selected] = normPrompt(state.prompts[selected]);
      putEn(state.prompts[selected], "text", reviewText);        // header/footer left alone
    } else if (reviewMode === "split") {
      const briefs = reviewTarget === "all" && reviewWriteKind !== "longshot" ? clipBriefs(reviewText) : null;
      const windows = reviewTarget === "all" && reviewWriteKind === "longshot" && p.shots.length ? longShotClips() : null;
      if (windows && windows.length) {
        // long shot: one clip per time window, each starting over at [Shot 1] (the times counted from its own start)
        if (p.header) putEn(state, "promptHeader", p.header);
        if (p.footer) putEn(state, "promptFooter", p.footer);
        state.prompts = keepTimes(windows.map(c => ({ text: c.text, firstFrame: "", enabled: true })), oldPrompts);
        selected = 0;
        for (const c of state.prompts) if (c.text) koTodo.push([c, "text"]);
      } else if (briefs) {
        // Every clip gets its own header sections, [Shot] blocks and sound / music.
        state.prompts = keepTimes(briefs.map(b => seedOverride({
          text: rebaseShots(b.shots.join("\n\n")), firstFrame: "", enabled: true,
          header: b.header || state.promptHeader || "", footer: b.footer || state.promptFooter || "",
        })), oldPrompts);
        selected = 0;
        for (const c of state.prompts) for (const k of ["text", "header", "footer"]) if (c[k]) koTodo.push([c, k]);
      } else if (reviewTarget === "all") {
        if (p.header) putEn(state, "promptHeader", p.header);
        if (p.footer) putEn(state, "promptFooter", p.footer);
        state.prompts = keepTimes(p.shots.length
          ? p.shots.map(s => ({ text: rebaseShots(s), firstFrame: "", enabled: true }))
          : [{ text: reviewText, firstFrame: "", enabled: true }], oldPrompts);
        selected = 0;
        for (const c of state.prompts) if (c.text) koTodo.push([c, "text"]);
      } else {
        state.prompts[selected] = normPrompt(state.prompts[selected]);
        const clip = state.prompts[selected];
        // A clip with its own override keeps its header / sound in its own fields.
        if (ownFraming()) { if (p.header) putEn(clip, "header", p.header); if (p.footer) putEn(clip, "footer", p.footer); }
        else { if (p.header) putEn(state, "promptHeader", p.header); if (p.footer) putEn(state, "promptFooter", p.footer); }
        putEn(clip, "text", rebaseShots(p.shots.join("\n\n")) || reviewText);
      }
    } else {  // manual — only the ticked cards
      const ownTarget = reviewTarget !== "all" && ownFraming();
      if (reviewSel.has("header") && p.header) { if (ownTarget) putEn(state.prompts[selected], "header", p.header); else putEn(state, "promptHeader", p.header); }
      if (reviewSel.has("footer") && p.footer) { if (ownTarget) putEn(state.prompts[selected], "footer", p.footer); else putEn(state, "promptFooter", p.footer); }
      const picked = (p.shots.length ? p.shots : [reviewText]).filter((_, i) => reviewSel.has(`shot:${i}`));
      if (picked.length) {
        if (reviewTarget === "all") {
          state.prompts = keepTimes(picked.map(s => ({ text: rebaseShots(s), firstFrame: "", enabled: true })), oldPrompts);
          selected = 0;
          for (const c of state.prompts) if (c.text) koTodo.push([c, "text"]);
        } else {
          state.prompts[selected] = normPrompt(state.prompts[selected]);
          putEn(state.prompts[selected], "text", rebaseShots(picked.join("\n\n")));
        }
      }
    }
    if (reviewMode !== "one" && oneTakeReview()) {
      const fold = (i) => { const c = state.prompts[i]; if (c && typeof c === "object") c.text = oneTakeFixShots(c.text, c.header); };
      if (reviewTarget === "all") (state.prompts || []).forEach((_, i) => fold(i)); else fold(selected);
    }
    if (reviewMode !== "one") {
      if (reviewTarget === "all") (state.prompts || []).forEach((_, i) => snapClipText(i));
      else snapClipText(selected);
    }
    ctx.persist();
    reviewOv.style.display = "none";
    if (transientMode) { ov.style.display = "none"; transientMode = false; }
    renderAll(); onApply?.();
    statusTag.textContent = "applied";
    statusTag.style.color = C.ok;
    fillKoLater();
  }

  rvCancel.addEventListener("click", () => {
    reviewOv.style.display = "none";
    if (transientMode) { ov.style.display = "none"; transientMode = false; }
    statusTag.textContent = "discarded";
    statusTag.style.color = C.muted;
  });
  rvAgain.addEventListener("click", () => {
    reviewOv.style.display = "none";
    runTransient(reviewKind === "refine" ? doRefine : () => doWrite({ kind: reviewWriteKind }));   // "Write again" keeps the kind
  });

  // ── split dialog ───────────────────────────────────────────────────────────
  // 8s holds one to three shots, so "one shot per clip" is usually wrong. The parsed
  // shots are listed with a break toggle between each pair; the user decides where the
  // clip boundaries fall, and the header/tail stay out of it entirely.
  const splitOv = el("div", { style: {
    display: "none", position: "absolute", inset: "0", zIndex: "10", background: "rgba(11,11,11,0.985)",
    borderRadius: "inherit", flexDirection: "column", padding: "12px", gap: "8px", boxSizing: "border-box",
  }});
  let splitShots = [], splitHeader = "", splitFooter = "", splitBreaks = new Set();

  const splitHdr = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" } });
  splitHdr.appendChild(el("div", { text: "✂ Split into clips", style: { color: "#fff", fontSize: "13px", fontWeight: "700" } }));
  const splitInfo = el("div", { style: { fontSize: "10.5px", color: C.muted, flex: "1" } });
  splitHdr.appendChild(splitInfo);
  const evenBtn = el("button", { type: "button", text: "↔ Even", title: "Spread the shots evenly over the planned clip count", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "10.5px", padding: "5px 11px",
    borderRadius: "6px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
  }});
  const onePerBtn = el("button", { type: "button", text: "1 shot / clip", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "10.5px", padding: "5px 11px",
    borderRadius: "6px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
  }});
  const noneBtn = el("button", { type: "button", text: "All in one", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "10.5px", padding: "5px 11px",
    borderRadius: "6px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
  }});
  splitHdr.append(evenBtn, onePerBtn, noneBtn, button("✕", () => { splitOv.style.display = "none"; }, "danger"));

  const splitBody = el("div", { style: { flex: "1", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0" } });
  splitBody.className = "mmh3-lp";

  const splitFoot = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" } });
  const splitSummary = el("div", { style: { fontSize: "11px", color: C.text, flex: "1" } });
  const applySplitBtn = button("✓ Apply split", () => applySplit(), "primary");
  splitFoot.append(splitSummary, applySplitBtn);
  splitOv.append(splitHdr, splitBody, splitFoot);

  function renderSplit() {
    clear(splitBody);
    const plan = ctx.currentPlan?.() || { count: 1, clipSec: 8 };
    splitInfo.textContent = `${splitShots.length} shot(s) · plan is ${plan.count} clip(s) of ${plan.clipSec.toFixed(2)}s`;

    if (splitHeader) {
      splitBody.appendChild(el("div", {
        html: `<b style="color:${C.ok}">kept as common header</b> — ${splitHeader.slice(0, 110).replace(/</g, "&lt;")}${splitHeader.length > 110 ? "…" : ""}`,
        style: { fontSize: "10px", color: C.muted, background: C.bg1, border: `1px dashed ${C.border}`,
                 borderRadius: "6px", padding: "6px 8px", marginBottom: "6px", lineHeight: "1.5" } }));
    }

    let clipNo = 1;
    splitShots.forEach((shot, i) => {
      if (i > 0 && splitBreaks.has(i)) clipNo++;
      const card = el("div", { style: {
        display: "flex", gap: "7px", alignItems: "flex-start",
        background: C.bg1, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "7px 8px",
      }});
      card.append(
        el("div", { text: `C${clipNo}`, style: {
          flexShrink: "0", fontSize: "10px", fontWeight: "700", color: BRAND,
          background: C.bg3, borderRadius: "4px", padding: "2px 6px", marginTop: "1px" } }),
        el("div", { text: shot.replace(/\s+/g, " ").slice(0, 150) + (shot.length > 150 ? "…" : ""),
          style: { flex: "1", fontSize: "10.5px", color: C.text, lineHeight: "1.55" } }),
      );
      splitBody.appendChild(card);

      if (i < splitShots.length - 1) {
        const on = splitBreaks.has(i + 1);
        const cut = el("button", { type: "button",
          text: on ? "✂ ── clip break ──" : "· · · join · · ·", style: {
            alignSelf: "center", cursor: "pointer", fontFamily: "inherit", fontSize: "9.5px",
            padding: "2px 12px", margin: "3px 0", borderRadius: "10px",
            background: on ? BRAND : "transparent", color: on ? "#fff" : C.muted,
            border: `1px ${on ? "solid" : "dashed"} ${on ? BRAND : C.border}`,
          }});
        cut.addEventListener("click", () => {
          if (splitBreaks.has(i + 1)) splitBreaks.delete(i + 1); else splitBreaks.add(i + 1);
          renderSplit();
        });
        splitBody.appendChild(cut);
      }
    });

    if (splitFooter) {
      splitBody.appendChild(el("div", {
        html: `<b style="color:${C.ok}">kept as common sound/music tail</b> — ${splitFooter.slice(0, 110).replace(/</g, "&lt;")}${splitFooter.length > 110 ? "…" : ""}`,
        style: { fontSize: "10px", color: C.muted, background: C.bg1, border: `1px dashed ${C.border}`,
                 borderRadius: "6px", padding: "6px 8px", marginTop: "6px", lineHeight: "1.5" } }));
    }

    const groups = splitBreaks.size + 1;
    const diff = groups - plan.count;
    splitSummary.innerHTML = `→ <b style="color:${BRAND}">${groups} clip prompt(s)</b>`
      + (diff === 0 ? ` · matches the planned ${plan.count}`
         : ` · <span style="color:${C.warn}">plan is ${plan.count} clip(s)</span>`
           + (diff < 0 ? " — later clips reuse the last prompt" : " — extra prompts are ignored until you raise Total seconds"));
  }

  async function openSplit() {
    // the split reads the English text (a Korean-only edit is translated first); the Korean view is written again after
    try {
      state.prompts[selected] = normPrompt(state.prompts[selected]);
      if (await ensureEnglish(state.prompts[selected], "text", translateLlm(), { protect: h3ProtectWords(state) })) { ctx.persist(); editorBil.refresh(); }
    } catch (e) { ctx.showPopup?.(e.message, true); return; }
    const parsed = parseBrief(promptText(normPrompt(state.prompts[selected])));
    if (!parsed.shots.length) { ctx.showPopup?.("Nothing to split.", true); return; }
    if (parsed.shots.length === 1) {
      ctx.showPopup?.("Only one shot found — nothing to split ([Shot N] markers or --- separate them).", true);
      return;
    }
    splitShots = parsed.shots; splitHeader = parsed.header; splitFooter = parsed.footer;
    const plan = ctx.currentPlan?.() || { count: 1 };
    splitBreaks = new Set(evenBreaks(splitShots.length, plan.count));
    renderSplit();
    splitOv.style.display = "flex";
  }

  function applySplit() {
    snapshot("split into clips");
    const groups = groupShots(splitShots, splitBreaks.size + 1, [...splitBreaks]);
    if (splitHeader) putEn(state, "promptHeader", splitHeader);
    if (splitFooter) putEn(state, "promptFooter", splitFooter);
    state.prompts = keepTimes(groups.map(g => ({ text: g, firstFrame: "", enabled: true })), state.prompts || []);
    state.prompts.forEach((_, i) => snapClipText(i));
    selected = 0;
    for (const c of state.prompts) if (c.text) koTodo.push([c, "text"]);
    ctx.persist();
    splitOv.style.display = "none";
    renderAll(); onApply?.();
    ctx.showPopup?.(`Split into ${groups.length} clip prompt(s); common parts kept.`, false);
    fillKoLater();
  }

  evenBtn.addEventListener("click", () => {
    const plan = ctx.currentPlan?.() || { count: 1 };
    splitBreaks = new Set(evenBreaks(splitShots.length, plan.count)); renderSplit();
  });
  onePerBtn.addEventListener("click", () => {
    splitBreaks = new Set(splitShots.map((_, i) => i).filter(i => i > 0)); renderSplit();
  });
  noneBtn.addEventListener("click", () => { splitBreaks = new Set(); renderSplit(); });

  // ── merge dialog ───────────────────────────────────────────────────────────
  // The clips are listed in order with a "clip break" tick after each one. A ticked break keeps two clips apart; clear it and
  // the clip joins the one after it, so the ticks left in place give the groups (7 clips with breaks after 2 and 4 make 1-2,
  // 3-4 and 5-6-7). Dragging a card changes the order first. A group's text is its clips' texts one after the other, the
  // shots renumbered and moved later by the length of the clips before them. A group over 15 s is only flagged (red): it
  // keeps its real total as its time, and turns normal again as soon as the time is set to 15 s or less.
  const MERGE_COLORS = ["#7612DA", "#2e9d6a", "#d98a1c", "#3a86d6", "#c4437e", "#7a8a2e"];
  const mergeOv = el("div", { style: {
    display: "none", position: "absolute", inset: "0", zIndex: "10", background: "rgba(11,11,11,0.985)",
    borderRadius: "inherit", flexDirection: "column", padding: "12px", gap: "8px", boxSizing: "border-box",
  }});
  let mergeCards = [];   // { i: index in state.prompts, brk: a break after this card }
  let mergeDragK = -1;
  const mergeBtnStyle = { cursor: "pointer", fontFamily: "inherit", fontSize: "10.5px", padding: "5px 11px",
    borderRadius: "6px", background: C.bg2, color: C.text, border: `1px solid ${C.border}` };
  const mergeHdr = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" } });
  mergeHdr.appendChild(el("div", { text: "🔗 Merge clips", style: { color: "#fff", fontSize: "13px", fontWeight: "700" } }));
  const mergeInfo = el("div", { style: { fontSize: "10.5px", color: C.muted, flex: "1" } });
  const mergeAllSepBtn = el("button", { type: "button", text: "All separate", style: mergeBtnStyle });
  const mergeAllOneBtn = el("button", { type: "button", text: "Merge all", style: mergeBtnStyle });
  mergeHdr.append(mergeInfo, mergeAllSepBtn, mergeAllOneBtn, button("✕", () => closeMerge(), "danger"));
  const mergeBody = el("div", { style: { flex: "1", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0" } });
  mergeBody.className = "mmh3-lp";
  const mergeFoot = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" } });
  const mergeSummary = el("div", { style: { fontSize: "11px", color: C.text, flex: "1", lineHeight: "1.5" } });
  mergeFoot.append(mergeSummary, button("✓ Apply merge", () => applyMerge(), "primary"));
  mergeOv.append(mergeHdr, mergeBody, mergeFoot);

  const mergeClipSec = (i) => clipSecondsFor(state, i);
  function closeMerge() {
    mergeOv.style.display = "none";
    if (transientMode) { ov.style.display = "none"; transientMode = false; }
  }
  function mergeGroups() {
    const groups = []; let cur = [];
    mergeCards.forEach((c, k) => { cur.push(c); if (c.brk || k === mergeCards.length - 1) { groups.push(cur); cur = []; } });
    return groups;
  }
  function renderMerge() {
    clear(mergeBody);
    const groups = mergeGroups();
    const groupOf = new Map();
    groups.forEach((g, gi) => g.forEach(c => groupOf.set(c, gi)));
    mergeInfo.textContent = `${mergeCards.length} clip(s) → ${groups.length} clip(s) · drag a card to change the order, clear a break to join a clip to the next one`;
    mergeCards.forEach((c, k) => {
      const gi = groupOf.get(c), g = groups[gi];
      const total = g.reduce((s, m) => s + mergeClipSec(m.i), 0);
      const over = g.length > 1 && total > MAX_CLIP_SEC;
      const color = MERGE_COLORS[gi % MERGE_COLORS.length];
      const text = promptText(normPrompt(state.prompts[c.i]));
      const card = el("div", { style: {
        display: "flex", gap: "7px", alignItems: "flex-start", cursor: "grab",
        background: C.bg1, border: `1px solid ${over ? C.err : C.border}`, borderLeft: `4px solid ${over ? C.err : color}`,
        borderRadius: "6px", padding: "7px 8px",
      }});
      card.draggable = true;
      card.append(
        el("div", { text: "⋮⋮", title: "Drag to change the order", style: { color: C.muted, fontSize: "12px", flexShrink: "0", marginTop: "1px" } }),
        el("div", { text: `Clip ${c.i + 1}`, style: { flexShrink: "0", fontSize: "10px", fontWeight: "700", color: "#fff",
          background: color, borderRadius: "4px", padding: "2px 6px", marginTop: "1px" } }),
        el("div", { text: text.replace(/\s+/g, " ").slice(0, 150) + (text.length > 150 ? "…" : ""),
          style: { flex: "1", fontSize: "10.5px", color: C.text, lineHeight: "1.55" } }),
        el("div", { text: `${fmtSec(mergeClipSec(c.i))} s`, style: { flexShrink: "0", fontSize: "10px", color: C.muted, marginTop: "1px" } }),
      );
      card.addEventListener("dragstart", (e) => {
        mergeDragK = k; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(k));
        card.style.opacity = "0.45";
      });
      card.addEventListener("dragend", () => { mergeDragK = -1; renderMerge(); });
      card.addEventListener("dragover", (e) => { if (mergeDragK >= 0) { e.preventDefault(); card.style.outline = `1px dashed ${BRAND}`; } });
      card.addEventListener("dragleave", () => { card.style.outline = "none"; });
      card.addEventListener("drop", (e) => {
        e.preventDefault();
        if (mergeDragK < 0 || mergeDragK === k) return;
        const [moved] = mergeCards.splice(mergeDragK, 1);
        mergeCards.splice(k, 0, moved);
        mergeDragK = -1; renderMerge();
      });
      mergeBody.appendChild(card);

      if (k < mergeCards.length - 1) {
        const row = el("label", { title: "Ticked: this clip stays apart from the next one. Cleared: they become one clip.", style: {
          alignSelf: "center", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", margin: "3px 0",
          fontSize: "9.5px", color: c.brk ? BRAND : C.muted } });
        const cb = el("input", { type: "checkbox" });
        cb.checked = c.brk; cb.style.cursor = "pointer";
        cb.addEventListener("change", () => { c.brk = cb.checked; renderMerge(); });
        row.append(cb, el("span", { text: c.brk ? "✂ clip break" : "🔗 joined with the next clip" }));
        mergeBody.appendChild(row);
      }
    });
    const overGroups = groups.map((g, gi) => ({ g, gi, total: g.reduce((s, m) => s + mergeClipSec(m.i), 0) }))
      .filter(x => x.g.length > 1 && x.total > MAX_CLIP_SEC);
    mergeSummary.innerHTML = `→ <b style="color:${BRAND}">${groups.length} clip(s)</b>`
      + (overGroups.length
        ? ` · <span style="color:${C.err}">${overGroups.map(x => `clip ${x.gi + 1} is ${snapHalf(x.total)} s`).join(", ")} - the model renders at most ${MAX_CLIP_SEC} s; it is kept red in the clip list until its time is ${MAX_CLIP_SEC} s or less</span>`
        : "");
  }
  async function openMergeDialog() {
    // the merge reads the English text: a Korean-only edit is translated first
    try {
      const llm = translateLlm(), protect = h3ProtectWords(state);
      for (let i = 0; i < state.prompts.length; i++) {
        state.prompts[i] = normPrompt(state.prompts[i]);
        if (await ensureEnglish(state.prompts[i], "text", llm, { protect })) ctx.persist();
      }
      editorBil.refresh();
    } catch (e) { ctx.showPopup?.(e.message, true); closeMerge(); return; }
    if ((state.prompts || []).length < 2) { ctx.showPopup?.("Need at least two clips to merge.", true); closeMerge(); return; }
    mergeCards = state.prompts.map((_, i) => ({ i, brk: true }));
    renderMerge();
    mergeOv.style.display = "flex";
  }
  async function applyMerge() {
    const groups = mergeGroups();
    const inOrder = mergeCards.every((c, k) => c.i === k);
    if (groups.length === mergeCards.length && inOrder) { ctx.showPopup?.("Nothing to merge: every clip is still apart and in its place.", true); return; }
    snapshot("merge clips");
    const old = state.prompts.map(normPrompt);
    const merged = [];
    const next = groups.map((g) => {
      const first = { ...old[g[0].i] };
      if (g.length === 1) return first;
      let offset = 0, no = 1;
      const texts = [];
      for (const m of g) {
        const t = promptText(old[m.i]);
        texts.push(shiftShots(t, offset, no));
        no += shotCount(t);
        offset += mergeClipSec(m.i);
      }
      // new English text: the Korean view of it is cleared and written again after the apply
      delete first.textKo; delete first.textNewest; delete first.textView;
      first.text = texts.join("\n");
      // the real total is kept even above 15 s (flagged red in the list); the render itself stops at 15 s
      first.timeOverride = true;
      first.timeSec = snapHalf(offset);
      first.enabled = g.some(m => promptEnabled(old[m.i]));
      merged.push(first);
      return first;
    });
    state.prompts = next;
    selected = 0;
    for (const c of merged) if (c.text) koTodo.push([c, "text"]);
    ctx.persist();
    closeMerge();
    renderAll(); refreshFraming(); onApply?.();
    const overN = next.filter(p => p.timeOverride && p.timeSec > MAX_CLIP_SEC).length;
    ctx.showPopup?.(`Merged ${mergeCards.length} clip(s) into ${next.length}.${overN ? ` ${overN} clip(s) are over ${MAX_CLIP_SEC} s (red in the list) - set their time to ${MAX_CLIP_SEC} s or less.` : ""}`, !!overN);
    fillKoLater();
  }
  mergeAllSepBtn.addEventListener("click", () => { mergeCards.forEach(c => { c.brk = true; }); renderMerge(); });
  mergeAllOneBtn.addEventListener("click", () => { mergeCards.forEach((c, k) => { c.brk = k === mergeCards.length - 1; }); renderMerge(); });

  // ── footer ─────────────────────────────────────────────────────────────────
  const footer = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" } });
  const splitBtn = el("button", { type: "button", text: "✂ Split into clips…", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "11px", padding: "6px 12px",
    borderRadius: "6px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
  }});
  splitBtn.addEventListener("click", openSplit);
  const mergeBtn = el("button", { type: "button", text: "🔗 Merge clips…", title: "Join clips into longer ones (several groups at once)", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "11px", padding: "6px 12px",
    borderRadius: "6px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
  }});
  mergeBtn.addEventListener("click", openMergeDialog);
  const planTag = el("div", { style: { fontSize: "10.5px", color: C.muted, flex: "1" } });
  const previewBtn = el("button", { type: "button", text: "👁 Preview sent text", title: "What this clip will actually send", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "11px", padding: "6px 12px",
    borderRadius: "6px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
  }});
  previewBtn.addEventListener("click", () => {
    const full = composeClipPrompt(state, selected);
    ctx.showPopup?.(`Clip ${selected + 1} sends ${full.length} chars (header + shots + tail).`, false);
    editor.setAttribute("title", full);
  });
  // Prompt Write / Refine stay in view whether LOCAL ENHANCE is folded or not.
  footer.append(splitBtn, mergeBtn, previewBtn, planTag, enhBtn, refineBtn, button("✓ Done", () => hide(), "primary"));

  ov.append(hdr, setsWrap, commonWrap, body, enhWrap, footer, splitOv, mergeOv, writeMenuOv, reviewOv);

  function refreshPlanTag() {
    const p = ctx.currentPlan?.();
    if (!p) return;
    const n = (state.prompts || []).length;
    const warn = n < p.count;
    planTag.innerHTML = `${n} prompt(s) for <b>${p.count}</b> clip · ${p.actualSeconds.toFixed(2)}s total`
      + (warn ? ` <span style="color:${C.muted}">(later clips reuse the last one)</span>` : "");
  }
  function refreshPreviewTag() {
    const full = composeClipPrompt(state, selected);
    charCount.textContent = `${(editor.value || "").length} chars · sends ${full.length}`;
  }
  function renderAll() {
    headerBil.refresh();
    footerBil.refresh();
    headerUC?.paint?.(); footerUC?.paint?.();
    renderList(); loadSelected(); refreshPlanTag(); refreshUndo();
  }

  function hide() { ov.style.display = "none"; transientMode = false; onApply?.(); }

  return {
    el: ov,
    show() {
      transientMode = false;
      ov.style.display = "flex";
      if (!state.prompts || !state.prompts.length) state.prompts = [{ text: "", firstFrame: "", enabled: true }];
      if (selected >= state.prompts.length) selected = 0;
      deriveModes(); renderImageRow(); renderAll(); refreshFraming(); applyEnhCollapsed();
      if (!mediaFiles.videos.length && !mediaFiles.audios.length)
        getMediaFiles().then(d => { mediaFiles = d; renderImageRow(); }).catch(() => {});
      if (!systemPrompt) loadSystemPrompt();
      refreshSourceUI();
      refreshSetsList();
      setTimeout(() => editor.focus(), 60);
    },
    hide,
    isOpen: () => ov.style.display !== "none",
    /** Pull header/footer back in after the Common Prompt popup edited them. */
    syncCommon() {
      refreshFraming();
    },
    /** Run Refine for one clip without navigating into the full Prompt Edit popup —
     * used by the main screen's own Refine button next to Common. `reviewOv` is an
     * absolute-inset child of `ov` and only paints while `ov` is displayed, so this
     * still shows `ov` underneath, but the review card (or the instruction dialog
     * that precedes it) fully covers it — the user never sees the tabs/editor. */
    openRefine(idx) {
      openTransient(idx, doRefine);
    },
    /** The merge dialog from the main screen's own Merge clips button (the popup behind it stays hidden). */
    openMerge() {
      const wasOpen = ov.style.display !== "none";
      transientMode = !wasOpen;
      ov.style.display = "flex";
      if (!state.prompts || !state.prompts.length) state.prompts = [{ text: "", firstFrame: "", enabled: true }];
      if (selected >= state.prompts.length) selected = 0;
      loadSelected();
      return openMergeDialog();
    },
    /** Same idea as openRefine(), but runs Prompt Write instead — used by the main
     * screen's own Prompt Write button. */
    openWrite(idx) {
      openTransient(idx, onWriteClick);
    },
    /**
     * An H3 first/last-frame brief for a finished video (Postprocess → Latent Upscale (Use H3)).
     * `frames` are input-folder images sampled in order across the clip (about one per second);
     * `base` is the clip's saved prompt when it has one — an LTX prompt or a reference-mode brief is
     * rewritten as a standalone brief, otherwise the brief is written from the frames alone.
     */
    async writeFromVideo({ base = "", frames, seconds, onStage = () => {} }) {
      const get = (b) => state[b] || state.h3LlmBackend;
      const briefOR = get("h3BriefBackend") === "openrouter", briefLlama = get("h3BriefBackend") === "llamagguf", briefCustom = get("h3BriefBackend") === "custom";
      const visionOR = get("h3VisionBackend") === "openrouter", visionLlama = get("h3VisionBackend") === "llamagguf", visionCustom = get("h3VisionBackend") === "custom";
      if (!briefOR && !briefLlama && !briefCustom && !state.nativeBriefClip) throw new Error("No brief CLIP set - pick one in Settings, or switch the Brief backend to OpenRouter/Llama GGUF.");
      if (!visionOR && !visionLlama && !visionCustom && !state.nativeVisionClip) throw new Error("No vision CLIP set - pick one in Settings, or switch the Vision backend to OpenRouter/Llama GGUF.");
      if (briefLlama && !state.h3LlamaBriefModel) throw new Error("No Llama GGUF brief model set - pick one in Settings.");
      if (visionLlama && !state.h3LlamaVisionModel) throw new Error("No Llama GGUF vision model set - pick one in Settings.");
      if (briefCustom && !(state.h3CustomBriefBase && state.h3CustomBriefModel)) throw new Error("Connect Custom (Brief) needs an API base URL and a model ID - set them in Settings.");
      if (visionCustom && !(state.h3CustomVisionBase && state.h3CustomVisionModel)) throw new Error("Connect Custom (Vision) needs an API base URL and a model ID - set them in Settings.");
      const summary = await describeImages(frames, onStage);
      onStage("Writing brief...");
      const user = [
        "Mode: First/Last frame",
        `Target duration: ${seconds.toFixed(2)} seconds total, split into 1 shot(s) of ~${seconds.toFixed(2)}s each.`,
        "", "Reference manifest:", "None", "",
        "The following frames were sampled in order from an existing video, about one per second: image 1 is the STARTING frame, "
          + "the last one is the ENDING frame, the ones between show what happens in the middle. Write the brief as a first/last-frame shot "
          + "that describes this video from the starting description to the ending one.",
        "", summary, "",
        "Creative brief:",
        base
          ? `${base}\n\n(This text may use reference tags (<Picture N>, @name) or another model's phrasing. Rewrite it as a standalone brief: describe what the frames show instead of any reference tag.)`
          : "(no text supplied — base the brief on the frame analysis above)",
        "", "Final grounding check: stay grounded in what the frames actually show. Do not invent unrelated actions, props, on-screen text, dialogue, or locations. "
          + "Return only the complete brief text, no commentary outside it. The brief has no reference images: never write <Picture N>, <Video N>, \"Image N\" or a line that maps a picture to a time.",
      ].join("\n");
      const sys = H3_SYSTEM_PROMPT_BASE;
      const text = (briefCustom
        ? await writeBriefCustom(sys, user, { baseUrl: state.h3CustomBriefBase, model: state.h3CustomBriefModel, context: state.h3CustomBriefCtx })
        : briefLlama
        ? await writeBriefLlama(user, state.h3LlamaBriefModel, state.h3LlamaNCtx, state.h3LlamaMaxTokens)
        : briefOR
        ? await writeBriefOpenRouter(sys, user, state.h3OrModelBrief || state.h3OrModel, 3700)
        : await writeBriefNative(state.nativeBriefClip, sys, user)).trim();
      if (!text) throw new Error("empty response");
      // The model sometimes still labels the frames: drop a line that only maps a picture tag to a time,
      // and turn any tag left inside a sentence into plain words.
      return text.split("\n").filter(l => !/<Picture \d+>.*\b(mark|second|frame)\b|\b(aligns? with|fully referenced|into the target video)\b/i.test(l) || l.length > 220)
        .join("\n").replace(/<Picture \d+>/g, "the frame").replace(/\n{3,}/g, "\n\n").trim();
    },
    /** Auto Prompt: write every enabled clip's prompt in one go, no review. Throws on the first failure. */
    async autoWrite() {
      if (!state.prompts || !state.prompts.length) return;
      for (const { i } of activePrompts(state)) {
        selected = i; loadSelected();
        await doWrite({ auto: true });
      }
      ctx.persist(); renderAll(); onApply?.();
    },
  };
}

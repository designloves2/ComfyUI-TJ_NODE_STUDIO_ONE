// ui_prompt_edit_ltx25.js — full-node prompt editor for LTX 2.5 ONE STUDIO (TJ)
//
// The node's inline prompt strip is fine for a glance but cramped for real writing, so
// this popup gives each clip a full-height editor plus an Ollama pass to turn a rough
// idea into a shot-by-shot brief.
//
// The brief-writing instruction is the same "Minimax H3 (Video)" system prompt TJ_NODE
// ships, fetched from the backend (with a built-in fallback when TJ_NODE isn't present).
import {
  C, BRAND, el, clear, clipSecondsFor, clipFramesFor, clipTimeline, snapHalf, clipSecForTyped, composeClipPrompt, clipFraming, promptText,
  promptEnabled, promptOverrides, activePrompts, parseTargetSeconds, emptyTimeline, clipAssets, normalizeAssetRef
} from "./core_ltx25.js";
import { imageSlot, shapeWarning } from "./ui_images_ltx25.js";
import { mountLibraryRefs, emptyAssetRef, sourceToggle } from "../shared/reflib_refpanel.js";
import { LTX_WRITE_SYSTEM, LTX_WRITE_PLAIN_SYSTEM, LTX_REFINE_SYSTEM, LTX_VISION_SYSTEM } from "./prompts_ltx25.js";
import { button, select } from "../klein/ui_common.js";
import { createDirectorHost } from "./director/director_host.js";
import { openAssetPicker } from "../shared/reflib_picker.js";
import { openVideoGalleryPicker } from "./ui_video_picker_ltx25.js";
import { openImageGalleryPicker } from "../shared/ui_image_gallery_picker.js";
import { ask } from "../shared/ui_ask.js";
import { reflib } from "../shared/reflib_api.js";
import {
  analyzeImagesNative, writeBriefNative, analyzeImagesOpenRouter, writeBriefOpenRouter, analyzeImageLlama, writeBriefLlama,
  analyzeImagesCustom, writeBriefCustom, listPromptSets, getPromptSet, savePromptSet, deletePromptSet, missingInputFiles
} from "./api_ltx25.js";

// A prompt entry may still arrive as a plain string (mid-migration data); normalize once.
function normPrompt(p) {
  return typeof p === "string" ? { text: p, firstFrame: "", enabled: true } : p;
}

export function createPromptEditOverlay(state, ctx, onApply) {
  const ov = el("div", { style: {
    position: "absolute", inset: "0", zIndex: "9999",
    background: "rgba(11,11,11,0.985)", borderRadius: "inherit",
    display: "none", flexDirection: "column", padding: "12px", gap: "8px", boxSizing: "border-box",
  }});

  let selected = 0;
  let busy = false;

  // ── undo ───────────────────────────────────────────────────────────────────
  // Splitting and enhancing rewrite every prompt at once; without this a mis-click
  // would be unrecoverable.
  const undoStack = [];
  function snapshot(what) {
    undoStack.push({
      what,
      header: state.promptHeader || "",
      footer: state.promptFooter || "",
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
    state.promptHeader = "";
    state.promptFooter = "";
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
    ctx.refreshModes?.();
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
      state.promptHeader = s.promptHeader || "";
      state.promptFooter = s.promptFooter || "";
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
  const headerTA = commonField("Global prompt for every clip — visual style, scene, lighting, camera, ambient sound and music…",
    () => clipFraming(state, selected).header,
    v => { const t = framingTarget(); if (ownFraming()) t.header = v; else t.promptHeader = v; }, "mmh3_pe_header_h");
  const footerTA = commonField("Tail — Ambient sound: … / Music: …",
    () => clipFraming(state, selected).footer,
    v => { const t = framingTarget(); if (ownFraming()) t.footer = v; else t.promptFooter = v; }, "mmh3_pe_footer_h");

  const headerLbl = el("div", { text: "GLOBAL PROMPT — all clips", style: { color: C.muted, fontSize: "9.5px", letterSpacing: "0.06em" } });
  const footerLbl = el("div", { text: "COMMON — SOUND / MUSIC", style: { color: C.muted, fontSize: "9.5px", letterSpacing: "0.06em" } });

  /** Repoint both boxes at the selected clip — call after switching clip or toggling override. */
  function refreshFraming() {
    const own = ownFraming();
    headerTA.value = clipFraming(state, selected).header || "";
    footerTA.value = clipFraming(state, selected).footer || "";
    headerLbl.textContent = own ? "THIS CLIP — GLOBAL PROMPT" : "GLOBAL PROMPT — all clips";
    footerLbl.textContent = own ? "THIS CLIP — SOUND / MUSIC" : "COMMON — SOUND / MUSIC";
    headerLbl.style.color = own ? BRAND : C.muted;
    footerLbl.style.color = own ? BRAND : C.muted;
    headerTA.autoSize(); footerTA.autoSize();
    headerUC?.paint?.(); footerUC?.paint?.();
    refreshPreviewTag();
  }

  headerLbl.style.flex = "1"; footerLbl.style.flex = "1";
  const headerUC = undoClearBtns(headerTA, v => { const t = framingTarget(); if (ownFraming()) t.header = v; else t.promptHeader = v; });
  const footerUC = undoClearBtns(footerTA, v => { const t = framingTarget(); if (ownFraming()) t.footer = v; else t.promptFooter = v; });
  const lblRow = (lbl, uc) => el("div", { style: { display: "flex", alignItems: "center", gap: "6px" } }, [lbl, uc]);
  const commonWrap = el("div", { style: { flexShrink: "0", display: "flex", gap: "8px" } });
  // One global prompt: the sound and music direction is written inside it, as an LTX prompt is one description.
  commonWrap.append(
    el("div", { style: { flex: "1", display: "flex", flexDirection: "column", gap: "3px" } }, [lblRow(headerLbl, headerUC), headerTA]),
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
  listBox.className = "ltx25-lp";
  listCol.append(listHdr, listBox);

  const editCol = el("div", { style: { flex: "1", display: "flex", flexDirection: "column", gap: "5px", minWidth: "0" } });
  const editHdr = el("div", { style: { display: "flex", alignItems: "center", gap: "6px" } });
  const editTitle = el("div", { text: "Clip 1", style: { color: C.text, fontSize: "12px", fontWeight: "600", flex: "1" } });
  const charCount = el("div", { style: { color: C.muted, fontSize: "10px" } });
  const editor = el("textarea", { placeholder: "Global prompt for this clip — the scene, camera and sound. Each segment gets its own prompt in the timeline below.", style: {
    flex: "1", minWidth: "0", boxSizing: "border-box", background: C.bg1, color: C.text,
    border: `1px solid ${C.border}`, borderRadius: "8px", padding: "10px",
    fontSize: "13px", lineHeight: "1.55", fontFamily: "inherit", outline: "none", resize: "none",
  }});
  editor.addEventListener("input", () => {
    state.prompts[selected] = normPrompt(state.prompts[selected]);
    state.prompts[selected].text = editor.value;
    if (isDirector()) host.setText(editor.value).then(saveDir);
    ctx.persist(); updateCount(); renderList();
  });
  const editorUndoClear = undoClearBtns(editor, v => {
    state.prompts[selected] = normPrompt(state.prompts[selected]);
    state.prompts[selected].text = v;
    updateCount(); renderList();
  });
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
      ctx.persist(); renderFirstFrameRow(); renderList(); 
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
    ctx.persist(); renderFirstFrameRow(); renderList(); 
  });
  fiRow.append(fiThumb, fiGalleryBtn, fiLabel, fiRemoveBtn);
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
  // Only LTX Director edits a segment timeline; Text To Video and Image to Video write one prompt per clip.
  const isDirector = () => state.generationMode === "director";
  const editorWrap = el("div", { style: { flex: "0 0 auto", height: "72px", display: "flex", position: "relative" } });
  const editorBusyOv = el("div", { text: "✨ Writing the prompt…", style: {
    display: "none", position: "absolute", inset: "0", zIndex: "5",
    alignItems: "center", justifyContent: "center", textAlign: "center",
    background: "rgba(0,0,0,0.75)", padding: "0 16px", borderRadius: "8px",
    color: "#b57bff", fontSize: "18px", fontWeight: "700",
    textShadow: "0 0 12px rgba(181,123,255,0.5)",
  }});
  editorWrap.append(editor, editorBusyOv);
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
  const timeIn = el("input", { type: "number", min: "1", max: "20", step: "0.5", style: {
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
    timeNote.textContent = on
      ? `renders ${clipSecondsFor(state, selected).toFixed(2)}s (${clipFramesFor(state, selected)} frames)`
      : `global ${(global / 24).toFixed(2)}s`;
  }
  function timeChanged() {
    editor.value = promptText(normPrompt(state.prompts[selected]));
    if (isDirector()) host.setLength(clipFramesFor(state, selected)).then(saveDir);
    ctx.persist(); renderTimeRow(); renderList(); refreshPlanTag(); refreshPreviewTag(); ctx.refreshModes?.();
  }
  timeChk.addEventListener("change", () => {
    state.prompts[selected] = normPrompt(state.prompts[selected]);
    const p = state.prompts[selected];
    p.timeOverride = timeChk.checked;
    if (timeChk.checked && !(p.timeSec > 0)) p.timeSec = clipSecForTyped((state.clipFrames ?? 192) / 24);
    timeChanged();
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
    ctx.persist(); refreshFraming(); renderList(); renderOverrideChk(); renderImageRow(); ctx.refreshModes?.();
  });
  timeRow.append(timeChkLbl, timeIn, el("div", { text: "sec", style: { fontSize: "10px", color: C.muted } }), timeNote, ovLbl);
  // The segment timeline (the Director's editor). Each clip keeps its own: its widget values live on the
  // clip as `dir`, made for the clip length they were saved at.
  const host = createDirectorHost({ onChange: () => saveDir() });
  const hostWrap = el("div", { style: {
    flex: "1", minHeight: "0", display: "flex", flexDirection: "column", background: C.bg1,
    border: `1px solid ${C.border}`, borderRadius: "8px", overflow: "hidden" } }, [host.el]);
  function saveDir() {
    state.prompts[selected] = normPrompt(state.prompts[selected]);
    state.prompts[selected].dir = { ...host.snapshot(), frames: clipFramesFor(state, selected) };
    ctx.persist();
  }
  // Images can also come from the studio's own sources, not only a file on disk: any gallery, or the Asset
  // Library. Either becomes an image segment at the playhead, exactly like the editor's own "Add Image".
  async function addImageFrom(url, name) {
    const blob = await (await fetch(url)).blob();
    await host.addImageFile(new File([blob], name, { type: blob.type || "image/png" }));
    saveDir();
  }
  host.addImageButton().then(anchor => {
    if (!anchor) return;
    const mk = (text, title, onClick) => {
      const b = document.createElement("button");
      b.className = "prcs-btn"; b.textContent = text; b.title = title;
      b.addEventListener("click", onClick);
      return b;
    };
    const fromAsset = mk("📚 Asset", "Add an image from the Asset Library", () => openAssetPicker({
      title: "Add images from the Asset Library", kinds: ["image"], multi: true,
      onPick: async (ids) => {
        for (const id of ids) {
          const d = await reflib.detail(id);
          if (d.ok) await addImageFrom(reflib.fileUrl(d.asset), `asset_${id}_${d.asset.name || "image"}.png`.replace(/[^\w.\-]+/g, "_"));
        }
      } }));
    const fromGallery = mk("🖼 Gallery", "Add an image from a gallery", () => openImageGalleryPicker(
      filename => addImageFrom(`/view?filename=${encodeURIComponent(filename)}&type=input`, filename)));
    anchor.after(fromGallery, fromAsset);
  });
  // A clip whose timeline was made for another length is rebuilt for the current one before it renders.
  let syncHost = null;
  ctx.syncClipDir = async (i, frames) => {
    const p = (state.prompts || [])[i];
    if (!p || typeof p !== "object" || !p.dir || p.dir.frames === frames) return;
    syncHost = syncHost || createDirectorHost();
    await syncHost.load(p.dir, { frames, text: p.text || "" });
    p.dir = { ...syncHost.snapshot(), frames };
  };
  // First / Last frames of Image to Video, shown in the writer popup the way H3 shows them: the source switch and the
  // pictures stay in step with the main screen - they are the common ones, or this clip's own once "override for this
  // clip" is ticked.
  const imgBlock = el("div", { style: { display: "none", flexDirection: "column", gap: "6px" } });
  // A foldable band between the editor and the footer, only in Image to Video; the fold is remembered.
  const imgCollapse = el("button", { type: "button", title: "Collapse / expand", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "11px", lineHeight: "1", padding: "2px 7px", borderRadius: "5px",
    background: "transparent", color: C.muted, border: `1px solid ${C.border}`, flexShrink: "0",
  }});
  imgCollapse.addEventListener("click", () => { state.enhCollapsed = !state.enhCollapsed; ctx.persist(); renderImageRow(); });
  const imgBand = el("div", { style: {
    display: "none", flexDirection: "column", gap: "6px", flexShrink: "0", boxSizing: "border-box",
    background: C.bg1, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 10px",
  }}, [
    el("div", { style: { display: "flex", alignItems: "center", gap: "8px" } }, [
      imgCollapse, el("div", { text: "FIRST / LAST FRAMES", style: { color: BRAND, fontSize: "10.5px", fontWeight: "700", letterSpacing: "0.05em" } })]),
    imgBlock,
  ]);
  function renderImageRow() {
    clear(imgBlock);
    const on = state.generationMode === "firstlast";
    const off = !!state.enhCollapsed;
    imgBand.style.display = on ? "flex" : "none";
    imgBlock.style.display = on && !off ? "flex" : "none";
    imgCollapse.textContent = off ? "▸" : "▾";
    imgBand.style.maxHeight = off ? "none" : "330px";
    imgBand.style.overflowY = off ? "visible" : "auto";
    if (off) return;
    if (!on || !state.prompts?.[selected]) return;
    const p = state.prompts[selected] = normPrompt(state.prompts[selected]);
    const own = !!p.override;
    const sync = () => { ctx.persist(); ctx._rerenderImages?.(); ctx.refreshModes?.(); };
    const useLib = (own ? p.refSource : state.refSource) === "library";
    imgBlock.append(
      el("div", { text: own ? "This clip only" : "Common (shared by all clips)", style: { fontSize: "11px", fontWeight: "700", color: own ? BRAND : C.text } }),
      sourceToggle(useLib ? "library" : "files", (src) => {
        if (own) { p.refSource = src; if (src === "files") p.assetRef = null; }
        else { state.refSource = src; if (src === "files") state.assetRef = null; }
        sync(); renderImageRow();
      }));
    if (useLib) {
      imgBlock.append(mountLibraryRefs({
        mode: "firstlast",
        note: own ? "This clip only: First / Last frames from the Asset tab." : "Common: First / Last frames from the Asset tab.",
        getRef: () => (own ? p.assetRef : state.assetRef) || emptyAssetRef(),
        onChange: (ref) => { const n = normalizeAssetRef(ref); if (own) p.assetRef = n; else state.assetRef = n; sync(); },
      }).el);
      return;
    }
    const a = clipAssets(state, selected);
    const warn = shapeWarning();
    const check = () => { const cur = clipAssets(state, selected); warn.refresh(cur.firstFrame, cur.lastFrame); };
    const first = imageSlot("① First frame\n(click / drop)", a.firstFrame, n => { if (own) p.firstFrame = n || ""; else state.firstFrameImage = n; sync(); renderFirstFrameRow(); if (n && !own) ctx.matchAspect?.(n); check(); }, { box: 80 });
    const last = imageSlot("② Last frame\n(optional)", a.lastFrame, n => { if (own) p.lastFrame = n || ""; else state.lastFrameImage = n; sync(); if (n && !own && !state.firstFrameImage) ctx.matchAspect?.(n); check(); }, { box: 80 });
    imgBlock.append(el("div", { style: { display: "flex", gap: "10px" } }, [first.el, last.el]), warn.el);
    check();
  }
  editCol.append(editHdr, timeRow, editorWrap, hostWrap, fiRow, fiHint);
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
      const item = el("div", { style: {
        display: "flex", gap: "4px", alignItems: "center", cursor: "grab",
        background: active ? C.bg3 : C.bg1, border: `1px solid ${active ? BRAND : C.border}`,
        borderRadius: "6px", padding: "6px 7px", opacity: on ? "1" : "0.5",
      }});
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
      const rowLabel = el("div", { style: { flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" } }, [
        el("div", { text: `${i + 1} - Clip Prompt #${i + 1}`,
          style: { fontSize: "10.5px", color: labelColor, fontWeight: (active || ownClip) ? "700" : "400",
                   overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }),
        el("div", { text: tl.start == null ? "off" : `${fmtSec(tl.start)}~${fmtSec(tl.end)} sec${p.timeOverride ? " ⏱" : ""}`,
          title: p.timeOverride ? "This clip has its own length" : "Global clip length",
          style: { fontSize: "9.5px", color: p.timeOverride ? "#ffb020" : C.muted } }),
        // One-Take: each clip after the first overlaps the one before by 1.625 s, so its place in the stitched video is later-shorter.
        ...(tl.fstart != null ? [el("div", { text: `stitched ${fmtSec(tl.fstart)}~${fmtSec(tl.fend)} sec`,
          title: "Place in the finished One-Take video (1.625 s overlap with the previous clip removed)",
          style: { fontSize: "9.5px", color: C.ok } })] : []),
      ]);
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
        renderList(); loadSelected(); 
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
        ctx.persist(); renderList(); loadSelected(); refreshFraming();
      });

      item.append(cb, rowLabel, del);
      listBox.appendChild(item);
    });
    refreshOnCountTag(onCount, (state.prompts || []).length);
  }

  function loadSelected() {
    const list = state.prompts || [{ text: "", firstFrame: "", enabled: true }];
    if (selected >= list.length) selected = 0;
    const p = normPrompt(list[selected]);
    editor.value = promptText(p);
    editorUndoClear.resetStack?.();
    editTitle.textContent = `Clip ${selected + 1}`;
    const timeline = isDirector();
    editor.placeholder = timeline
      ? "Prompt for this clip — the scene, camera and sound. Each segment gets its own prompt in the timeline below."
      : "Prompt for this clip — the shot, the action, the camera and the sound, as one flowing paragraph.";
    hostWrap.style.display = timeline ? "flex" : "none";
    editorWrap.style.flex = timeline ? "0 0 auto" : "1";
    editorWrap.style.height = timeline ? "72px" : "";
    if (timeline) host.load(p.dir, { frames: clipFramesFor(state, selected), text: promptText(p) });
    renderTimeRow();
    updateCount();
    renderFirstFrameRow();
    renderImageRow();
  }

  addBtn.addEventListener("click", () => {
    (state.prompts = state.prompts || []).push({ text: "", firstFrame: "", enabled: true });
    selected = state.prompts.length - 1;
    ctx.persist(); renderList(); loadSelected(); editor.focus();
  });

  // The gallery's Extend writes its continuation prompt through the same backend
  ctx.callBrief = (system, user) => callBrief(system, user);
  ctx.briefProblem = () => briefProblem();
  ctx.visionReady = () => visionReady();
  ctx.describeImages = (files) => describeImages(files, () => {});

  // ── Prompt Write / Refine ────────────────────────────────────────────────────
  // In LTX Director the writer works in segments: Write plans every clip - the clip's own prompt plus a prompt and an
  // end time for each segment - and Apply puts the result straight into the clips' timelines; Refine rewrites the one
  // segment that is selected in the timeline (or the clip prompt when none is). In Text To Video and Image to Video
  // Write plans one prompt per clip and Refine rewrites the clip prompt.
  // The writer's settings live in a small popup that opens upward from this button, so the editor keeps the height.
  const enhTitle = el("span", { text: "PROMPT WRITER" });
  const writerBtn = el("button", { type: "button", title: "Writer settings: target, length, model", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "11px", padding: "7px 12px", borderRadius: "6px",
    background: C.bg2, color: BRAND, border: `1px solid ${C.border}`, fontWeight: "700", letterSpacing: "0.04em",
    display: "inline-flex", alignItems: "center", gap: "6px",
  }}, [enhTitle, el("span", { text: "▴", style: { color: C.muted } })]);
  const statusTag = el("div", { text: "", style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } });
  const writerPop = el("div", { style: {
    display: "none", position: "absolute", bottom: "calc(100% + 6px)", right: "0", width: "380px", zIndex: "30",
    background: C.bg1, border: `1px solid ${BRAND}`, borderRadius: "8px", padding: "10px",
    flexDirection: "column", gap: "8px", boxShadow: "0 -6px 22px rgba(0,0,0,0.55)", maxHeight: "460px", overflowY: "auto",
  }});
  const writerAnchor = el("div", { style: { position: "relative", flexShrink: "0" } }, [writerBtn, writerPop]);
  writerBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (writerPop.style.display !== "none") { writerPop.style.display = "none"; return; }
    writerPop.style.display = "flex";
    const close = (ev) => {
      if (writerAnchor.contains(ev.target)) return;
      writerPop.style.display = "none";
      document.removeEventListener("mousedown", close);
    };
    setTimeout(() => document.addEventListener("mousedown", close), 0);
  });

  const modelSelWrap = el("div", { style: { minWidth: "0" } });
  const targetSel = select(
    [{ value: "all", label: "→ all clips" }, { value: "one", label: "→ this clip" }],
    "all", () => {});
  targetSel.style.width = "auto";
  targetSel.style.flexShrink = "0";

  const enhBtn = el("button", { type: "button", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "12px", padding: "7px 16px",
    borderRadius: "6px", background: BRAND, color: "#fff", border: "none", fontWeight: "700",
    display: "inline-flex", alignItems: "center", gap: "6px",
  }});
  const enhSpin = el("span", { text: "⟳", style: { display: "none", animation: "ltx25-spin 0.8s linear infinite", fontSize: "13px" } });
  const enhBtnLabel = el("span", { text: "✨ Prompt Write" });
  enhBtn.append(enhSpin, enhBtnLabel);
  const refineBtn = el("button", { type: "button", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "12px", padding: "7px 16px",
    borderRadius: "6px", background: C.bg2, color: "#fff", border: `1px solid ${BRAND}`, fontWeight: "700",
    display: "inline-flex", alignItems: "center", gap: "6px",
  }});
  const refineSpin = el("span", { text: "⟳", style: { display: "none", animation: "ltx25-spin 0.8s linear infinite", fontSize: "13px" } });
  const refineBtnLabel = el("span", { text: "🔧 Prompt Refine" });
  refineBtn.append(refineSpin, refineBtnLabel);

  // How long the finished piece should be - only Write uses it, to decide how many clips to plan.
  const lenIn = el("input", { type: "text", placeholder: "3:20", style: {
    width: "74px", boxSizing: "border-box", background: C.bg2, color: C.text,
    border: `1px solid ${C.border}`, borderRadius: "6px", padding: "6px",
    fontSize: "12px", fontFamily: "inherit", outline: "none", textAlign: "center",
  }});
  lenIn.value = state.targetLength || "";
  lenIn.title = "Target length for the whole piece — 3:20, 200s, or 3분 20초. Blank = one plan per clip already in the editor.";
  const lenTag = el("div", { style: { fontSize: "10px", color: C.muted, whiteSpace: "nowrap" } });
  function targetPlan() {
    const plan = ctx.currentPlan?.() || { count: 1, clipSec: 5 };
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

  const lenRow = el("div", { style: { display: "flex", alignItems: "center", gap: "8px" } }, [targetSel, lenIn, lenTag]);
  writerPop.append(statusTag, lenRow, modelSelWrap);

  // ── which model writes ───────────────────────────────────────────────────────
  const briefBackend = () => state.h3BriefBackend || state.h3LlmBackend || "native";
  const visionBackend = () => state.h3VisionBackend || state.h3LlmBackend || "native";
  function briefModelName() {
    const b = briefBackend();
    if (b === "custom") return state.h3CustomBriefModel ? `Custom:${state.h3CustomBriefModel}${state.h3CustomBriefBase ? ` @ ${state.h3CustomBriefBase}` : ""}` : null;
    if (b === "llamagguf") return state.h3LlamaBriefModel ? `Llama:${state.h3LlamaBriefModel}` : null;
    if (b === "openrouter") return `OR:${(state.h3OrModelBrief || state.h3OrModel) || "default"}`;
    return state.nativeBriefClip || null;
  }
  function renderModelSel() {
    clear(modelSelWrap);
    const name = briefModelName();
    modelSelWrap.appendChild(el("div", {
      text: name ? `Brief: ${name}` : "Brief: not set — click to pick a model or switch backend.",
      title: "Click to change the Brief / Vision models",
      onclick: () => ctx.openLlmQuickSettings?.(refreshSourceUI),
      style: { fontSize: "10px", color: name ? C.text : C.warn, cursor: "pointer", lineHeight: "1.5", whiteSpace: "normal",
        overflowWrap: "anywhere", textDecoration: "underline dotted", textUnderlineOffset: "2px" } }));
  }
  function refreshSourceUI() {
    const label = (b) => b === "openrouter" ? "OpenRouter" : b === "llamagguf" ? "Llama GGUF" : b === "custom" ? "Custom endpoint" : "native CLIP";
    enhTitle.textContent = `PROMPT WRITER (${label(briefBackend())})`;
    statusTag.textContent = briefBackend() === "openrouter" ? "OpenRouter calls out to the cloud — everything else stays local" : "runs locally";
    statusTag.style.color = C.muted;
    renderModelSel();
  }
  function briefProblem() {
    const b = briefBackend();
    if (b === "custom") return state.h3CustomBriefBase && state.h3CustomBriefModel ? "" : "Connect Custom (Brief) needs an API base URL and a model ID - set them in Settings → LLM Setting.";
    if (b === "llamagguf") return state.h3LlamaBriefModel ? "" : "No Llama GGUF brief model set - pick one in Settings.";
    if (b === "openrouter") return "";
    return state.nativeBriefClip ? "" : "No brief CLIP set - pick one in Settings, or switch the Brief backend to OpenRouter.";
  }
  async function callBrief(system, user, maxTokens = 2000) {
    const b = briefBackend();
    const text = b === "custom"
      ? await writeBriefCustom(system, user, { baseUrl: state.h3CustomBriefBase, model: state.h3CustomBriefModel, context: state.h3CustomBriefCtx })
      : b === "llamagguf"
      ? await writeBriefLlama(system, user, state.h3LlamaBriefModel, state.h3LlamaNCtx, state.h3LlamaMaxTokens)
      : b === "openrouter"
      ? await writeBriefOpenRouter(system, user, state.h3OrModelBrief || state.h3OrModel, maxTokens)
      : await writeBriefNative(state.nativeBriefClip, system, user);
    return String(text || "").trim();
  }

  // ── progress display ─────────────────────────────────────────────────────────
  let progTimer = null, progStart = 0, progStage = "", progBtn = "write";
  function progressStart(which = "write") {
    progBtn = which;
    progStart = Date.now();
    progTimer = setInterval(progressTick, 1000);
    progressTick();
  }
  function progressStage(text) { progStage = text; progressTick(); }
  function progressTick() {
    const s = Math.round((Date.now() - progStart) / 1000);
    const [spin, lbl] = progBtn === "write" ? [enhSpin, enhBtnLabel] : [refineSpin, refineBtnLabel];
    spin.style.display = "inline-block"; lbl.textContent = `${progStage} (${s}s)`;
    statusTag.textContent = progStage;
    statusTag.style.color = BRAND;
  }
  function progressStop() { if (progTimer) clearInterval(progTimer); progTimer = null; }

  // ── pictures on the timeline ─────────────────────────────────────────────────
  // The writer is told about the images a clip's timeline holds (in order, with the clip time they sit at) so the
  // text can start from them. They are described by the Vision model set in Settings; without one they are skipped.
  async function imageToB64(filename) {
    const bitmap = await createImageBitmap(await (await fetch(`/view?filename=${encodeURIComponent(filename)}&type=input`)).blob());
    const scale = Math.min(1, Math.sqrt(1024 * 1024 / (bitmap.width * bitmap.height)));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return (canvas.toDataURL("image/jpeg", 0.92).split(",")[1]) || "";
  }
  function visionReady() {
    const b = visionBackend();
    if (b === "custom") return !!(state.h3CustomVisionBase && state.h3CustomVisionModel);
    if (b === "llamagguf") return !!state.h3LlamaVisionModel;
    if (b === "openrouter") return true;
    return !!state.nativeVisionClip;
  }
  /** [{ file, at }] - the image segments of clip i's timeline, in time order. */
  function timelineImages(i) {
    if (!isDirector()) {
      const a = clipAssets(state, i);
      return [a.firstFrame && { file: a.firstFrame, at: 0 }, a.lastFrame && { file: a.lastFrame, at: clipSecondsFor(state, i) }].filter(Boolean);
    }
    const p =normPrompt((state.prompts || [])[i]) || {};
    let tl = {};
    try { tl = JSON.parse(p.dir?.widgets?.timeline_data || "{}"); } catch { tl = {}; }
    return (tl.segments || [])
      .filter(s => (s.type || "image") === "image" && s.imageFile)
      .sort((a, b) => (a.start || 0) - (b.start || 0))
      .map(s => ({ file: s.imageFile, at: (s.isEndFrame ? (s.start || 0) + (s.length || 0) : (s.start || 0)) / 24 }));
  }
  async function describeImages(files, onStage = progressStage) {
    if (!files.length) return "";
    const b = visionBackend();
    onStage(`Analyzing ${files.length} image${files.length > 1 ? "s" : ""}...`);
    let summary;
    if (b === "llamagguf") {
      const lines = [];
      for (let k = 0; k < files.length; k++) {
        onStage(`Analyzing image ${k + 1}/${files.length}...`);
        lines.push(String(await analyzeImageLlama(await imageToB64(files[k]), state.h3LlamaVisionModel, state.h3LlamaVisionMmproj,
          LTX_VISION_SYSTEM, state.h3LlamaNCtx, state.h3LlamaMaxTokens) || "").trim());
      }
      summary = lines.join("\n");
    } else {
      const prompt = `${LTX_VISION_SYSTEM} There are ${files.length} images, in order. Describe each one separately, each on its own line starting with "Image N: ".`;
      summary = (b === "custom"
        ? await analyzeImagesCustom(files, prompt, { baseUrl: state.h3CustomVisionBase, model: state.h3CustomVisionModel, context: state.h3CustomVisionCtx })
        : b === "openrouter"
        ? await analyzeImagesOpenRouter(files, prompt, state.h3OrModelVision || state.h3OrModel)
        : await analyzeImagesNative(state.nativeVisionClip, files, prompt)).trim();
    }
    return summary.split("\n").filter(l => l.trim()).map((l, k) => l.replace(/^\s*(?:Image|Picture)\s*\d+\s*:/i, `Image ${k + 1}:`)).join("\n");
  }

  // ── Prompt Write ─────────────────────────────────────────────────────────────
  const secLabel = (s) => `${Number(s.toFixed(2))} s`;
  /** The lengths (seconds) of the clips Write plans. */
  function clipLens(target) {
    if (target === "one") return [clipSecondsFor(state, selected)];
    const t = targetPlan();
    return t.fromField
      ? Array.from({ length: t.shots }, (_, k) => clipSecondsFor(state, k))
      : activePrompts(state).map(({ i }) => clipSecondsFor(state, i));
  }
  function buildWriteRequest(target, lens, base, imageNotes) {
    const total = lens.reduce((a, b) => a + b, 0);
    const lines = [
      `Total length: ${secLabel(total)} in ${lens.length} clip${lens.length > 1 ? "s" : ""}: ${lens.map((s, k) => `clip ${k + 1} = ${secLabel(s)}`).join(", ")}.`,
      `Write exactly ${lens.length} clip${lens.length > 1 ? "s" : ""} with these lengths${isDirector() ? "; the last segment of each clip ends at that clip's length" : ""}.`,
    ];
    if (target === "one") {
      lines.push(`This is clip ${selected + 1} of ${(state.prompts || []).length}; the other clips already exist, so keep the "global" description of the piece.`);
      if (selected > 0) {
        const prev = promptText(normPrompt(state.prompts[selected - 1])).trim().split(/\n\s*\n/).pop().replace(/\s+/g, " ").slice(-600);
        if (prev) lines.push(`The previous clip ends like this - open this clip where it left off: ${prev}`);
      }
    }
    if (imageNotes) lines.push("", isDirector() ? "Images placed on this clip's timeline (in order; the time is when each one appears):" : "Images given to this clip (in order; the time is when each one appears):", imageNotes);
    lines.push("", "Brief:", base || "(no text supplied - base the plan on the images above)", "", "Return only the JSON object.");
    return lines.join("\n");
  }
  /** The model's answer as a plan: { global, clips: [{ prompt, segments: [{ end, prompt }] }] }. */
  function parsePlan(text, lens) {
    const a = text.indexOf("{"), b = text.lastIndexOf("}");
    if (a < 0 || b <= a) throw new Error("the model did not return a plan (no JSON found)");
    let raw;
    try { raw = JSON.parse(text.slice(a, b + 1)); } catch { throw new Error("the model's plan is not valid JSON"); }
    const clips = (Array.isArray(raw.clips) ? raw.clips : []).map((c, k) => {
      const len = lens[Math.min(k, lens.length - 1)];
      const segs = (Array.isArray(c.segments) ? c.segments : [])
        .map(s => ({ end: Number(s.end), prompt: String(s.prompt || "").trim() }))
        .filter(s => s.prompt && s.end > 0)
        .sort((x, y) => x.end - y.end);
      // strictly increasing, inside the clip, the last one reaching its end
      const fixed = [];
      for (const s of segs) if (s.end < len - 0.01 && (!fixed.length || s.end > fixed[fixed.length - 1].end + 0.2)) fixed.push(s);
      if (segs.length) {
        const last = segs[segs.length - 1];
        fixed.push({ end: len, prompt: last.end >= len - 0.01 ? last.prompt : last.prompt });
      }
      return { prompt: String(c.prompt || "").trim(), segments: fixed };
    });
    if (!clips.length) throw new Error("the plan has no clips");
    if (clips.length < lens.length) throw new Error(`the plan has ${clips.length} clip(s), ${lens.length} were asked for`);
    return { global: String(raw.global || "").trim(), clips: clips.slice(0, lens.length) };
  }

  // The result is shown first, as a plan, and only goes into the clips when applied.
  // A dimmed backdrop with the result in a panel: the whole plan fills it, a refined prompt is a small popup.
  const planOv = el("div", { style: {
    display: "none", position: "absolute", inset: "0", zIndex: "20",
    background: "rgba(0,0,0,0.6)", borderRadius: "inherit",
    alignItems: "center", justifyContent: "center", boxSizing: "border-box",
  }});
  const planPanel = el("div", { style: {
    display: "flex", flexDirection: "column", gap: "8px", boxSizing: "border-box", padding: "12px",
    background: "rgba(11,11,11,0.985)", border: `1px solid ${BRAND}`, borderRadius: "10px",
    boxShadow: "0 8px 30px rgba(0,0,0,0.6)",
  }});
  const planHdr = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" } });
  const planTitle = el("div", { text: "", style: { color: "#fff", fontSize: "14px", fontWeight: "700", flex: "1" } });
  planHdr.append(planTitle);
  const planBody = el("div", { style: { flex: "1", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px", minHeight: "0" } });
  planBody.className = "ltx25-lp";
  const planFoot = el("div", { style: { display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "8px", flexShrink: "0" } });
  const planNote = el("div", { style: { fontSize: "10.5px", color: C.muted, flex: "1" } });
  planPanel.append(planHdr, planBody, planFoot);
  planOv.append(planPanel);

  function planCard(title, text, accent = BRAND) {
    return el("div", { style: { background: C.bg1, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "9px 11px", display: "flex", flexDirection: "column", gap: "5px" } }, [
      el("div", { text: title, style: { color: accent, fontSize: "10.5px", fontWeight: "700", letterSpacing: "0.04em" } }),
      el("div", { text, style: { color: C.text, fontSize: "12px", lineHeight: "1.55", whiteSpace: "pre-wrap" } }),
    ]);
  }
  function openPlanReview({ title, cards, note, onApply, onAgain, popup = false }) {
    clear(planBody); clear(planFoot);
    Object.assign(planPanel.style, popup
      ? { width: "min(780px, 92%)", height: "auto", maxHeight: "82%" }
      : { width: "calc(100% - 24px)", height: "calc(100% - 24px)", maxHeight: "none" });
    planTitle.textContent = title;
    cards.forEach(c => planBody.appendChild(c));
    planNote.textContent = note || "";
    planFoot.append(planNote,
      button("✕ Discard", () => { planOv.style.display = "none"; finishTransient(); }, "default"),
      ...(onAgain ? [button("↻ Write again", () => { planOv.style.display = "none"; onAgain(); }, "default")] : []),
      button("✓ Apply", async () => { planOv.style.display = "none"; await onApply(); finishTransient(); }, "primary"));
    planOv.style.display = "flex";
  }

  const blankPrompt = () => ({ text: "", firstFrame: "", enabled: true });
  let planHost = null;
  /** Put a plan into the clips: each clip gets its prompt and one text segment per planned beat. */
  async function applyPlan(plan, target) {
    snapshot("Prompt Write");
    if (isDirector()) planHost = planHost || createDirectorHost();
    if (plan.global && (target === "all" || !(state.promptHeader || "").trim())) state.promptHeader = plan.global;
    if (target === "all") {
      while (state.prompts.length < plan.clips.length) state.prompts.push(blankPrompt());
      state.prompts.length = plan.clips.length;
    }
    for (let k = 0; k < plan.clips.length; k++) {
      const i = target === "all" ? k : selected;
      const clip = plan.clips[k];
      const p = state.prompts[i] = normPrompt(state.prompts[i]);
      p.text = clip.prompt;
      p.enabled = true;
      if (!isDirector()) continue;
      const frames = clipFramesFor(state, i);
      let tl;
      try { tl = JSON.parse(p.dir?.widgets?.timeline_data || "null"); } catch { tl = null; }
      tl = tl && typeof tl === "object" ? tl : emptyTimeline(clip.prompt, frames);
      const keep = (tl.segments || []).filter(s => s.type !== "text");   // images stay, the text beats are replaced
      let from = 0;
      const beats = clip.segments.map((s, n) => {
        const end = n === clip.segments.length - 1 ? frames : Math.min(frames, Math.round(s.end * 24));
        const seg = { id: `tj-w${Date.now().toString(36)}${k}${n}`, start: from, length: Math.max(8, end - from), prompt: s.prompt, type: "text" };
        from = end;
        return seg;
      });
      tl.segments = [...keep, ...beats];
      tl.global_prompt = clip.prompt;
      tl.disable_prompt_relay = false;   // the beats only take effect with prompt relay on
      await planHost.load({ widgets: { ...(p.dir?.widgets || {}), timeline_data: JSON.stringify(tl), local_prompts: "", segment_lengths: "" } },
        { frames, text: clip.prompt });
      p.dir = { ...planHost.snapshot(), frames };
    }
    if (target === "one") selected = Math.min(selected, state.prompts.length - 1);
    ctx.persist(); renderAll(); ctx.refreshModes?.();
    ctx.showPopup?.(target === "all" ? `Wrote ${plan.clips.length} clip${plan.clips.length > 1 ? "s" : ""}.` : `Wrote clip ${selected + 1}.`, false);
  }
  function planCards(plan, lens) {
    const cards = [];
    if (plan.global) cards.push(planCard("GLOBAL PROMPT — all clips", plan.global));
    plan.clips.forEach((c, k) => {
      cards.push(planCard(`CLIP ${k + 1} — ${secLabel(lens[k])}`, c.prompt));
      let from = 0;
      c.segments.forEach((s, n) => {
        cards.push(planCard(`   segment ${n + 1} · ${secLabel(from)} – ${secLabel(s.end)}`, s.prompt, C.muted));
        from = s.end;
      });
    });
    return cards;
  }

  async function doWrite() {
    if (busy) return;
    const problem = briefProblem();
    if (problem) { ctx.showPopup?.(problem, true); return; }
    const target = targetSel.value;
    const lens = clipLens(target);
    const head = (state.promptHeader || "").trim();
    const clipTexts = target === "one"
      ? [editor.value]
      : (state.prompts || []).map(p => promptText(normPrompt(p)));
    const base = [head, ...clipTexts].map(s => (s || "").trim()).filter(Boolean).join("\n\n");
    const imgs = target === "one" ? timelineImages(selected) : [];
    if (!base && !imgs.length) { ctx.showPopup?.("Write something first (or add an image to the timeline).", true); return; }
    busy = true;
    enhBtn.disabled = true;
    setEditorBusy(true, "✨ Writing the prompt…");
    progressStart("write");
    try {
      let notes = "";
      if (imgs.length && visionReady()) {
        const summary = await describeImages(imgs.map(m => m.file));
        notes = summary.split("\n").map((l, k) => `${l}  [appears at ${secLabel(imgs[k]?.at || 0)}]`).join("\n");
      }
      progressStage(isDirector() ? "Planning clips and segments..." : "Planning clips...");
      const text = await callBrief(isDirector() ? LTX_WRITE_SYSTEM : LTX_WRITE_PLAIN_SYSTEM,buildWriteRequest(target, lens, base, notes), Math.min(16000, 1800 * lens.length + 1500));
      if (!text) throw new Error("empty response");
      const plan = parsePlan(text, lens);
      openPlanReview({
        title: target === "all" ? `Plan — ${plan.clips.length} clip${plan.clips.length > 1 ? "s" : ""}` : `Plan — clip ${selected + 1}`,
        cards: planCards(plan, lens),
        note: !isDirector() ? (target === "all" ? "Apply replaces the global prompt and every clip's prompt." : "Apply replaces this clip's prompt.")
          : target === "all" ? "Apply replaces the global prompt and every clip's prompt and text segments (images on the timelines stay)."
          : "Apply replaces this clip's prompt and text segments (its images stay).",
        onApply: () => applyPlan(plan, target),
        onAgain: () => doWrite(),
      });
      statusTag.textContent = "review the plan";
      statusTag.style.color = C.ok;
    } catch (e) {
      statusTag.textContent = `⚠ ${String(e.message).slice(0, 90)}`;
      statusTag.style.color = C.err;
      ctx.showPopup?.(`Prompt Write failed: ${e.message}`, true);
    } finally {
      progressStop();
      busy = false; enhBtn.disabled = false; enhSpin.style.display = "none"; enhBtnLabel.textContent = "✨ Prompt Write";
      setEditorBusy(false);
    }
  }
  enhBtn.addEventListener("click", doWrite);

  // ── Prompt Refine ────────────────────────────────────────────────────────────
  let lastRefineInstruction = "";
  async function doRefine(scope = "clip") {
    if (busy) return;
    const problem = briefProblem();
    if (problem) { ctx.showPopup?.(problem, true); return; }
    const seg = scope === "clip" && isDirector() ? await host.selectedSegment() : null;
    const current = (scope === "global" ? headerTA.value : seg ? seg.prompt : editor.value || "").trim();
    const what = scope === "global" ? "the global prompt" : seg ? `segment ${seg.index + 1} (${secLabel(seg.start)} – ${secLabel(seg.end)})` : `clip ${selected + 1}'s prompt`;
    if (!current) { ctx.showPopup?.(`Nothing to refine yet — ${seg ? "that segment has no prompt" : "write a prompt first"}.`, true); return; }
    const instruction = await ask(ov, {
      title: "Refine prompt",
      message: `What should change in ${what}?`,
      initial: lastRefineInstruction, kind: "textarea", okLabel: "Refine", tags: null,
    });
    if (!instruction || !instruction.trim()) return;
    lastRefineInstruction = instruction.trim();

    const lines = [];
    if (scope === "clip" && (state.promptHeader || "").trim()) lines.push("Global prompt of the piece:", state.promptHeader.trim(), "");
    if ((editor.value || "").trim() && seg) lines.push("Prompt of this clip:", editor.value.trim(), "");
    if (seg) {
      const around = seg.prompts.map((t, n) => (n === seg.index || !t.trim() ? null : `segment ${n + 1}: ${t.trim()}`)).filter(Boolean);
      if (around.length) lines.push("The other segments of this clip, for context:", ...around, "");
      lines.push(`The prompt to revise is segment ${seg.index + 1}, which covers ${secLabel(seg.start)} – ${secLabel(seg.end)} of the clip.`);
    }
    lines.push("Current prompt:", current, "", "Revision instruction:", instruction.trim(), "", "Return only the revised prompt.");

    busy = true;
    refineBtn.disabled = true;
    setEditorBusy(true, "🔧 Refining the prompt…");
    progressStart("refine");
    progressStage("Refining...");
    try {
      const text = (await callBrief(LTX_REFINE_SYSTEM, lines.join("\n"), 1500)).replace(/^["“]|["”]$/g, "").trim();
      if (!text) throw new Error("empty response");
      openPlanReview({
        title: `Refine — ${what}`,
        popup: true,
        cards: [planCard("BEFORE", current, C.muted), planCard("AFTER", text)],
        note: "Apply replaces " + (scope === "global" ? "the global prompt." : seg ? "that segment's prompt." : "the clip prompt."),
        onApply: async () => {
          snapshot("Prompt Refine");
          if (scope === "global") {
            const target = framingTarget();
            if (ownFraming()) target.header = text; else target.promptHeader = text;
            headerTA.value = text;
            ctx.persist(); refreshPreviewTag(); ctx.onGlobalRefined?.();
          } else if (seg) { await host.setSegmentPrompt(seg.index, text); saveDir(); }
          else {
            editor.value = text;
            state.prompts[selected] = normPrompt(state.prompts[selected]);
            state.prompts[selected].text = text;
            if (isDirector()) { await host.setText(text); saveDir(); }
            ctx.persist(); renderList(); updateCount();
          }
        },
      });
      statusTag.textContent = "review the result";
      statusTag.style.color = C.ok;
    } catch (e) {
      statusTag.textContent = `⚠ ${String(e.message).slice(0, 90)}`;
      statusTag.style.color = C.err;
      ctx.showPopup?.(`Refine failed: ${e.message}`, true);
    } finally {
      progressStop();
      busy = false; refineBtn.disabled = false; refineSpin.style.display = "none"; refineBtnLabel.textContent = "🔧 Prompt Refine";
      setEditorBusy(false);
    }
  }
  refineBtn.addEventListener("click", () => doRefine());
  headerUC.append(el("button", { type: "button", text: "🔧 Refine", title: "Refine the global prompt with the writer", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "9px", padding: "2px 7px", borderRadius: "4px",
    background: C.bg2, color: BRAND, border: `1px solid ${BRAND}`, flexShrink: "0",
  } }));
  headerUC.lastChild.addEventListener("click", () => doRefine("global"));

  // Write / Refine started from the main screen: the popup opens only to host the dialogs, and closes again after.
  let transientMode = false;
  function openTransient(idx, action) {
    transientMode = ov.style.display === "none";
    transientLook(transientMode);
    ov.style.display = "flex";
    if (!state.prompts || !state.prompts.length) state.prompts = [blankPrompt()];
    if (idx != null) selected = idx;
    if (selected >= state.prompts.length) selected = 0;
    loadSelected();
    action().finally(() => { if (transientMode && planOv.style.display === "none") finishTransient(); });
  }
  function finishTransient() {
    if (transientMode && planOv.style.display === "none") { ov.style.display = "none"; transientMode = false; transientLook(false); }
  }
  // Started from the main screen, only the dialogs show: the editor stays out of sight behind a dim backdrop.
  function transientLook(on) {
    ov.style.background = on ? "rgba(0,0,0,0.55)" : "rgba(11,11,11,0.985)";
    ov.style.zIndex = on ? "10000" : "9999";
    [hdr, setsWrap, commonWrap, body, imgBand, footer].forEach(n => { n.style.visibility = on ? "hidden" : ""; });
  }

  // ── footer ─────────────────────────────────────────────────────────────────
  const footer = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" } });
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
  footer.append(previewBtn, planTag, writerAnchor, enhBtn, refineBtn, button("✓ Done", () => hide(), "primary"));

  ov.append(hdr, setsWrap, commonWrap, body, imgBand, footer, planOv);

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
    headerTA.value = state.promptHeader || "";
    footerTA.value = state.promptFooter || "";
    headerUC?.paint?.(); footerUC?.paint?.();
    renderList(); loadSelected(); refreshPlanTag(); refreshUndo();
  }

  function hide() { ov.style.display = "none"; planOv.style.display = "none"; transientMode = false; transientLook(false); onApply?.(); }

  return {
    el: ov,
    show(clipIndex) {
      transientMode = false;
      if (Number.isInteger(clipIndex)) selected = clipIndex;
      ov.style.display = "flex";
      if (!state.prompts || !state.prompts.length) state.prompts = [{ text: "", firstFrame: "", enabled: true }];
      if (selected >= state.prompts.length) selected = 0;
      renderAll(); refreshFraming();
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
    /** Refine the global prompt from the Global popup. */
    openRefineGlobal() {
      openTransient(null, () => doRefine("global"));
    },
    /** Same idea as openRefine(), but runs Prompt Write instead — used by the main
     * screen's own Prompt Write button. */
    openWrite(idx) {
      openTransient(idx, doWrite);
    },
  };
}

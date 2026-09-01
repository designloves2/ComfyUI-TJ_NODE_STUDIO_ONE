// ui_prompt_edit_minimax.js — full-node prompt editor for MiniMax H3 ONE STUDIO (TJ)
//
// The node's inline prompt strip is fine for a glance but cramped for real writing, so
// this popup gives each clip a full-height editor plus an Ollama pass to turn a rough
// idea into a shot-by-shot brief.
//
// The brief-writing instruction is the same "Minimax H3 (Video)" system prompt TJ_NODE
// ships, fetched from the backend (with a built-in fallback when TJ_NODE isn't present).
import { C, BRAND, el, clear, parseBrief, groupShots, parseTargetSeconds, evenBreaks, composeClipPrompt, IMAGE_BRIEF_MODES, imageBriefMax, promptText, promptFirstFrame, promptEnabled, clipAssets, clipFraming, promptOverrides } from "./core_minimax.js";
import { panel, label, button, select, row, col } from "../klein/ui_common.js";
import { buildClipMediaSlots } from "./ui_clip_media_slots.js";
import { openVideoGalleryPicker } from "./ui_video_picker_minimax.js";
import { openImageGalleryPicker } from "../shared/ui_image_gallery_picker.js";
import { ask } from "../shared/ui_ask.js";
import { getMediaFiles, getSystemPrompt, uploadImage, uploadMedia, analyzeImagesNative, writeBriefNative, listPromptSets, getPromptSet, savePromptSet, deletePromptSet, missingInputFiles } from "./api_minimax.js";

// A prompt entry may still arrive as a plain string (mid-migration data); normalize once.
function normPrompt(p) {
  return typeof p === "string" ? { text: p, firstFrame: "", enabled: true } : p;
}

const MODES = [
  { key: "text",  label: "✨ Text → Brief",  hint: "rewrite the prompt into a shot-by-shot brief" },
  { key: "image", label: "🖼 Image → Brief", hint: "describe an image, then write the brief from it" },
];

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
  const hdr = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" } });
  hdr.appendChild(el("div", { text: "📝 Prompt Edit", style: { color: "#fff", fontSize: "14px", fontWeight: "700" } }));
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
      selected = 0;
      ctx.persist();
      renderAll();
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
  function commonField(placeholder, get, set) {
    const ta = el("textarea", { placeholder, style: {
      width: "100%", boxSizing: "border-box", flexShrink: "0",
      minHeight: "104px", maxHeight: "320px",
      background: C.bg2, color: C.text, border: `1px solid ${C.border}`, borderRadius: "6px",
      padding: "6px 8px", fontSize: "11.5px", lineHeight: "1.5", fontFamily: "inherit",
      outline: "none", resize: "vertical", overflowY: "auto",
    }});
    // Grow to the text instead of scrolling a fixed box. A header long enough to matter is
    // the normal case here, and reading it four lines at a time through a scrollbar — while
    // the empty tail box beside it sits the same size — was the actual complaint.
    ta.autoSize = () => {
      ta.style.height = "auto";
      ta.style.height = Math.max(104, Math.min(320, ta.scrollHeight + 2)) + "px";
    };
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
    v => { const t = framingTarget(); if (ownFraming()) t.header = v; else t.promptHeader = v; });
  const footerTA = commonField("Tail — Ambient sound: … / Music: …",
    () => clipFraming(state, selected).footer,
    v => { const t = framingTarget(); if (ownFraming()) t.footer = v; else t.promptFooter = v; });

  const headerLbl = el("div", { text: "COMMON — HEADER", style: { color: C.muted, fontSize: "9.5px", letterSpacing: "0.06em" } });
  const footerLbl = el("div", { text: "COMMON — SOUND / MUSIC", style: { color: C.muted, fontSize: "9.5px", letterSpacing: "0.06em" } });

  /** Repoint both boxes at the selected clip — call after switching clip or toggling override. */
  function refreshFraming() {
    const own = ownFraming();
    headerTA.value = clipFraming(state, selected).header || "";
    footerTA.value = clipFraming(state, selected).footer || "";
    headerLbl.textContent = own ? "THIS CLIP — HEADER" : "COMMON — HEADER";
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
  commonWrap.append(
    el("div", { style: { flex: "1", display: "flex", flexDirection: "column", gap: "3px" } }, [lblRow(headerLbl, headerUC), headerTA]),
    el("div", { style: { flex: "1", display: "flex", flexDirection: "column", gap: "3px" } }, [lblRow(footerLbl, footerUC), footerTA]),
  );

  // ── body: clip list | editor ───────────────────────────────────────────────
  const body = el("div", { style: { flex: "1", display: "flex", gap: "10px", minHeight: "0" } });
  const listCol = el("div", { style: { width: "190px", flexShrink: "0", display: "flex", flexDirection: "column", gap: "5px" } });
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
    fontSize: "10.5px", color: C.muted, flex: "1",
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
    openVideoGalleryPicker((inputFilename, clip) => {
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
  fiRow.append(fiThumb, fiLabel, fiGalleryBtn, fiRemoveBtn);
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
  editCol.append(editHdr, editor, fiRow, fiHint);
  body.append(listCol, editCol);

  function updateCount() { refreshPreviewTag(); }

  function renderList() {
    clear(listBox);
    let onCount = 0;
    (state.prompts || []).forEach((raw, i) => {
      const p = normPrompt(raw);
      if (promptEnabled(p)) onCount++;
      const active = i === selected;
      const on = promptEnabled(p);
      const item = el("div", { style: {
        display: "flex", gap: "4px", alignItems: "center", cursor: "pointer",
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
      const num = el("div", { text: String(i + 1), style: {
        width: "16px", flexShrink: "0", textAlign: "center", fontSize: "10px",
        fontWeight: "700", color: active ? BRAND : C.muted,
      }});
      const prev = el("div", {
        text: promptText(p).trim().slice(0, 42) || "(empty — reuses previous)",
        style: { flex: "1", fontSize: "10.5px", color: promptText(p).trim() ? C.text : C.muted,
                 overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
      });
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
      item.append(cb, num, prev, del);
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

  let enhMode = "text";
  const modeWrap = el("div", { style: { display: "flex", gap: "4px" } });
  function renderModes() {
    clear(modeWrap);
    MODES.forEach(m => {
      const active = m.key === enhMode;
      const b = el("button", { type: "button", text: m.label, title: m.hint, style: {
        cursor: "pointer", fontFamily: "inherit", fontSize: "10.5px", padding: "4px 10px",
        borderRadius: "5px", fontWeight: active ? "700" : "400",
        background: active ? BRAND : C.bg2, color: "#fff",
        border: `1px solid ${active ? BRAND : C.border}`,
      }});
      b.addEventListener("click", () => { enhMode = m.key; renderModes(); renderImageRow(); renderModelSel(); });
      modeWrap.appendChild(b);
    });
  }
  enhTop.appendChild(modeWrap);

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
  const enhBtnLabel = el("span", { text: "✨ Enhance" });
  enhBtn.append(enhSpin, enhBtnLabel);

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
    if (!(secs > 0)) return { shots: plan.count, seconds: plan.count * plan.clipSec, clipSec: plan.clipSec, fromField: false };
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
    const chk = el("input", { type: "checkbox" });
    chk.checked = own; chk.style.cursor = "pointer";
    // A clip switched off for a resume has nothing to override — grey it out.
    if (!promptEnabled(p)) { chk.disabled = true; chk.style.cursor = "default"; }
    chk.addEventListener("change", () => {
      p.override = chk.checked;
      // Starting from the common set is the useful default: an override almost always
      // means "these, but swap one", not "start from nothing".
      if (chk.checked && !(p.refImages || []).length) {
        p.refImages = (state.refImages || []).slice();
        p.refImagesMp = (state.refImagesMp || []).slice();
      }
      // The header and the sound/music tail describe the scene the images establish, so
      // they follow the override too — seeded from the common pair the first time, which
      // gives the user something to edit rather than two empty boxes.
      if (chk.checked && !p.header && !p.footer) {
        p.header = state.promptHeader || "";
        p.footer = state.promptFooter || "";
      }
      ctx.persist(); renderImageRow(); refreshFraming(); ctx.refreshModes?.();
    });
    head.append(
      el("div", { text: own ? "This clip only" : "Common (shared by all clips)",
        style: { fontSize: "11px", fontWeight: "700", color: own ? BRAND : C.text, flex: "1" } }),
      el("label", { style: { display: "flex", alignItems: "center", gap: "5px", fontSize: "10.5px",
        color: C.text, cursor: "pointer" } }, [chk, el("span", { text: "override for this clip" })]),
    );

    const modeRow = el("div", { style: { display: "flex", gap: "4px" } });
    IMAGE_BRIEF_MODES.forEach(m => {
      const active = state.briefImageMode === m.key;
      const b = el("button", { type: "button", text: m.label, title: m.hint, style: {
        cursor: "pointer", fontFamily: "inherit", fontSize: "10px", padding: "3px 8px",
        borderRadius: "5px", fontWeight: active ? "700" : "400",
        background: active ? BRAND : C.bg2, color: "#fff",
        border: `1px solid ${active ? BRAND : C.border}`,
      }});
      b.addEventListener("click", () => { state.briefImageMode = m.key; ctx.persist(); renderImageRow(); });
      modeRow.appendChild(b);
    });

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
          kind === "video" ? (onPick => openVideoGalleryPicker(onPick)) : null,
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
    modeRow.style.height = HEAD_H;
    modeRow.style.alignItems = "center";
    // marginTop:auto pushes the model line to the foot of the column, so its baseline
    // matches the "has audio" line at the foot of the media columns. Left in its own row
    // underneath, it added height the panel did not have and clipped the buttons below.
    modelSelWrap.style.marginTop = "auto";
    modelSelWrap.style.paddingTop = "4px";
    imgCol.append(modeRow, grid, note, modelSelWrap);
    assetBand.append(imgCol);
    if (own) assetBand.append(mediaRow);
    imgRow.append(head, assetBand);
  }


  const enhBottom = el("div", { style: {
    display: "flex", alignItems: "center", gap: "10px", flexWrap: "nowrap" } });
  lenTag.style.flex = "1";          // takes the slack, so Enhance stays hard right
  enhBtn.style.flexShrink = "0";
  enhBottom.append(targetSel,
    el("div", { text: "Length", style: { fontSize: "11px", color: C.muted, flexShrink: "0" } }),
    lenIn, lenTag, enhBtn);
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
    const briefOk = !!state.nativeBriefClip;
    const visionOk = !needImage || !!state.nativeVisionClip;
    if (!briefOk || !visionOk) {
      modelSelWrap.appendChild(el("div", {
        text: !briefOk ? "No brief CLIP set - pick one in Settings -> LLM Setting."
                       : "No vision CLIP set - pick one in Settings -> LLM Setting.",
        style: { fontSize: "10.5px", color: C.warn },
      }));
      return;
    }
    modelSelWrap.appendChild(el("div", {
      text: needImage
        ? `Brief: ${state.nativeBriefClip}  .  Vision: ${state.nativeVisionClip}`
        : `Brief: ${state.nativeBriefClip}`,
      title: "Change these in Settings -> LLM Setting",
      style: { fontSize: "10px", color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
    }));
  }

  // One backend now: the external Ollama server was removed on 2026-08-31, so there is no
  // source to choose between and nothing to connect to before the bar can be drawn.
  function refreshSourceUI() {
    enhTitle.textContent = "LOCAL ENHANCE (native CLIP)";
    statusTag.textContent = "runs through ComfyUI's own model loading - no external server";
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
  function buildUserPrompt(baseText, imageSummary) {
    const t = targetPlan();
    const lines = [
      `Target duration: ${t.seconds.toFixed(2)} seconds total, split into ${t.shots} shot(s) of ~${t.clipSec.toFixed(2)}s each.`,
    ];
    if (t.shots > 1) {
      lines.push(`Write exactly ${t.shots} shots, separated by a line containing only ---, one shot per clip.`);
    }
    if (state.generationMode === "reference" && (state.refImages || []).length) {
      lines.push(`${state.refImages.length} reference image(s) are supplied; refer to them as <Picture 1>…<Picture ${state.refImages.length}>.`);
    }
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
    lines.push("", "USER REQUEST:", baseText || "(no text supplied — base the brief on the image analysis above)");
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

  enhBtn.addEventListener("click", async () => {
    if (busy) return;
    // Same resolver the render loop uses, so Enhance always looks at the pictures this
    // clip will actually be made from — the override set when it has one.
    const a = clipAssets(state, selected);
    const images = enhMode === "image"
      ? a.refImages.slice(0, imageBriefMax(state.briefImageMode))
      : [];
    if (!state.nativeBriefClip) { ctx.showPopup?.("No brief CLIP set - pick one in Settings.", true); return; }
    if (images.length && !state.nativeVisionClip) { ctx.showPopup?.("No vision CLIP set - pick one in Settings.", true); return; }

    const target = targetSel.value;
    const base = (editor.value || "").trim();
    if (!base && !images.length) {
      ctx.showPopup?.("Write something first (or add an image).", true); return;
    }
    busy = true;
    enhBtn.disabled = true;
    progressStart();
    try {
      let imageSummary = "";
      if (images.length) {
        // One call, whole batch - this path attends to every image at once (verified:
        // SPEC_MINIMAX_H3_NEXT_ROUND.md C5). The instruction asks for them to stay
        // separated in the answer since nothing downstream re-splits them.
        progressStage(`Analyzing ${images.length} image${images.length > 1 ? "s" : ""}...`);
        const prompt = `${VISION_SYSTEM_PROMPT} There are ${images.length} images, in order. `
          + `Describe each one separately, each on its own line starting with "Image N: ".`;
        imageSummary = (await analyzeImagesNative(state.nativeVisionClip, images, prompt)).trim();
      }

      progressStage("Writing brief...");
      const text = (await writeBriefNative(state.nativeBriefClip, systemPrompt,
        buildUserPrompt(base, imageSummary))).trim();
      if (!text) throw new Error("empty response");
      // Never write straight in - show what came back and let the user decide.
      openReview(text, target);
      statusTag.textContent = "review the result";
      statusTag.style.color = C.ok;
    } catch (e) {
      statusTag.textContent = `⚠ ${String(e.message).slice(0, 90)}`;
      statusTag.style.color = C.err;
      ctx.showPopup?.(`Enhance failed: ${e.message}`, true);
    } finally {
      progressStop();
      busy = false; enhBtn.disabled = false; enhSpin.style.display = "none"; enhBtnLabel.textContent = "✨ Enhance";
    }
  });

  // ── LLM result review ──────────────────────────────────────────────────────
  // The model's answer lands here first. It's shown already separated into the common
  // header, the shots and the sound/music tail, so applying it fills the right fields
  // instead of dumping one blob into the current clip.
  const reviewOv = el("div", { style: {
    display: "none", position: "absolute", inset: "0", zIndex: "20",
    background: "rgba(11,11,11,0.985)", borderRadius: "inherit",
    flexDirection: "column", padding: "12px", gap: "8px", boxSizing: "border-box",
  }});
  let reviewText = "", reviewTarget = "one";
  // How the result gets applied — chosen AFTER the model answers, on this screen:
  //   "one"    the whole brief as one paragraph into the current clip's shot field only
  //   "split"  parsed into common header / shots / sound-music tail (the old behaviour)
  //   "manual" only the result cards the user clicked are applied
  let reviewMode = "split";
  const reviewSel = new Set();                 // card keys picked in "manual" mode
  let reviewParsed = { header: "", shots: [], footer: "" };

  const rvHdr = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" } });
  rvHdr.appendChild(el("div", { text: "✨ Enhance result", style: { color: "#fff", fontSize: "13px", fontWeight: "700" } }));
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
  const rvAgain = el("button", { type: "button", text: "↻ Enhance again", style: {
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
      if (p.header) rvBody.appendChild(reviewCard("header", "COMMON — HEADER", p.header));
      const shots = p.shots.length ? p.shots : [reviewText];
      shots.forEach((s, i) => rvBody.appendChild(reviewCard(`shot:${i}`, `CLIP ${i + 1}`, s)));
      if (p.footer) rvBody.appendChild(reviewCard("footer", "COMMON — SOUND / MUSIC", p.footer));
    }

    // Info line — for "all" enhance, call out when the model wrote a different shot count
    // than the target asked for (the small brief model often does).
    const want = reviewTarget === "all" ? targetPlan().shots : 0;
    const got = p.shots.length || 1;
    let info = `${reviewText.length} chars`;
    if (reviewTarget === "all") {
      info += ` · ${got} shot${got > 1 ? "s" : ""}`;
      if (want && got !== want) info += `  ⚠ asked for ${want} — use ✂ Split or ↻ Enhance again`;
    } else {
      info += ` → clip ${selected + 1}`;
    }
    rvInfo.textContent = info;

    rvSummary.textContent =
      reviewMode === "one"   ? `Whole brief → clip ${selected + 1}'s text. Header / tail untouched.`
    : reviewMode === "manual" ? (reviewSel.size ? `Applying ${reviewSel.size} selected part(s).` : "Click the cards to apply.")
    : reviewTarget === "all"  ? `Replaces all prompts with ${got}${p.header ? " + header" : ""}${p.footer ? " + tail" : ""}.`
    :                           `Replaces clip ${selected + 1}${p.header || p.footer ? " and the common parts" : ""}.`;
  }

  function openReview(text, target) {
    reviewText = text; reviewTarget = target;
    reviewParsed = parseBrief(text);
    reviewMode = "split";
    reviewSel.clear();
    // Manual mode starts with everything ticked, so "select" == "auto split" until the
    // user removes a card, rather than starting from an empty apply.
    if (reviewParsed.header) reviewSel.add("header");
    if (reviewParsed.footer) reviewSel.add("footer");
    (reviewParsed.shots.length ? reviewParsed.shots : [text]).forEach((_, i) => reviewSel.add(`shot:${i}`));
    renderReviewCards();
    reviewOv.style.display = "flex";
  }

  function applyReview() {
    const p = reviewParsed;
    if (reviewMode === "manual" && !reviewSel.size) {
      ctx.showPopup?.("Pick at least one card, or switch mode.", true); return;
    }
    snapshot(`enhance → ${reviewMode}`);

    if (reviewMode === "one") {
      state.prompts[selected] = normPrompt(state.prompts[selected]);
      state.prompts[selected].text = reviewText;                 // header/footer left alone
    } else if (reviewMode === "split") {
      if (p.header) state.promptHeader = p.header;
      if (p.footer) state.promptFooter = p.footer;
      if (reviewTarget === "all") {
        state.prompts = p.shots.length
          ? p.shots.map(s => ({ text: s, firstFrame: "", enabled: true }))
          : [{ text: reviewText, firstFrame: "", enabled: true }];
        selected = 0;
      } else {
        state.prompts[selected] = normPrompt(state.prompts[selected]);
        state.prompts[selected].text = p.shots.join("\n\n") || reviewText;
      }
    } else {  // manual — only the ticked cards
      if (reviewSel.has("header") && p.header) state.promptHeader = p.header;
      if (reviewSel.has("footer") && p.footer) state.promptFooter = p.footer;
      const picked = (p.shots.length ? p.shots : [reviewText]).filter((_, i) => reviewSel.has(`shot:${i}`));
      if (picked.length) {
        if (reviewTarget === "all") {
          state.prompts = picked.map(s => ({ text: s, firstFrame: "", enabled: true }));
          selected = 0;
        } else {
          state.prompts[selected] = normPrompt(state.prompts[selected]);
          state.prompts[selected].text = picked.join("\n\n");
        }
      }
    }
    ctx.persist();
    reviewOv.style.display = "none";
    renderAll(); onApply?.();
    statusTag.textContent = "applied";
    statusTag.style.color = C.ok;
  }

  rvCancel.addEventListener("click", () => {
    reviewOv.style.display = "none";
    statusTag.textContent = "discarded";
    statusTag.style.color = C.muted;
  });
  rvAgain.addEventListener("click", () => { reviewOv.style.display = "none"; enhBtn.click(); });

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

  function openSplit() {
    const parsed = parseBrief(editor.value);
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
    if (splitHeader) state.promptHeader = splitHeader;
    if (splitFooter) state.promptFooter = splitFooter;
    state.prompts = groups.map(g => ({ text: g, firstFrame: "", enabled: true }));
    selected = 0;
    ctx.persist();
    splitOv.style.display = "none";
    renderAll(); onApply?.();
    ctx.showPopup?.(`Split into ${groups.length} clip prompt(s); common parts kept.`, false);
  }

  evenBtn.addEventListener("click", () => {
    const plan = ctx.currentPlan?.() || { count: 1 };
    splitBreaks = new Set(evenBreaks(splitShots.length, plan.count)); renderSplit();
  });
  onePerBtn.addEventListener("click", () => {
    splitBreaks = new Set(splitShots.map((_, i) => i).filter(i => i > 0)); renderSplit();
  });
  noneBtn.addEventListener("click", () => { splitBreaks = new Set(); renderSplit(); });

  // ── footer ─────────────────────────────────────────────────────────────────
  const footer = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" } });
  const splitBtn = el("button", { type: "button", text: "✂ Split into clips…", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "11px", padding: "6px 12px",
    borderRadius: "6px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
  }});
  splitBtn.addEventListener("click", openSplit);
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
  footer.append(splitBtn, previewBtn, planTag, button("✓ Done", () => hide(), "primary"));

  ov.append(hdr, setsWrap, commonWrap, body, enhWrap, footer, splitOv, reviewOv);

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

  function hide() { ov.style.display = "none"; onApply?.(); }

  return {
    el: ov,
    show() {
      ov.style.display = "flex";
      if (!state.prompts || !state.prompts.length) state.prompts = [{ text: "", firstFrame: "", enabled: true }];
      if (selected >= state.prompts.length) selected = 0;
      // Open on the enhance mode the node is actually set up for. In Reference or
      // First/Last Frame the clip already has images attached, so landing on Text -> Brief
      // hid the whole attach area (and the override checkbox with it) behind an extra
      // click. Text only has no images to show, so it stays on Text -> Brief.
      enhMode = (state.generationMode === "t2v") ? "text" : "image";
      renderModes(); renderImageRow(); renderAll(); refreshFraming(); applyEnhCollapsed();
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
  };
}

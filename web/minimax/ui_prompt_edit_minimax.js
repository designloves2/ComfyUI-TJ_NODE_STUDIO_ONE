// ui_prompt_edit_minimax.js — full-node prompt editor for MiniMax H3 ONE STUDIO (TJ)
//
// The node's inline prompt strip is fine for a glance but cramped for real writing, so
// this popup gives each clip a full-height editor plus an Ollama pass to turn a rough
// idea into a shot-by-shot brief.
//
// The brief-writing instruction is the same "Minimax H3 (Video)" system prompt TJ_NODE
// ships, fetched from the backend (with a built-in fallback when TJ_NODE isn't present).
import { C, BRAND, el, clear, parseBrief, groupShots, parseTargetSeconds, evenBreaks, composeClipPrompt, IMAGE_BRIEF_MODES, imageBriefMax, promptText, promptFirstFrame, promptEnabled } from "./core_minimax.js";
import { panel, label, button, select, row, col } from "../klein/ui_common.js";
import { getOllamaModels, getSystemPrompt, enhancePrompt, uploadImage, uploadMedia, analyzeImagesNative, writeBriefNative, listPromptSets, getPromptSet, savePromptSet, deletePromptSet } from "./api_minimax.js";

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
  let systemPrompt = "";
  let systemPromptSource = "";
  let ollamaModels = [];
  let needsRestart = false;
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

  setLoadBtn.addEventListener("click", async () => {
    const name = setsSel.value;
    if (!name) return;
    try {
      const s = await getPromptSet(name);
      snapshot(`load set: ${name}`);
      state.prompts = (Array.isArray(s.prompts) && s.prompts.length ? s.prompts : [{ text: "", firstFrame: "", enabled: true }])
        .map(p => (typeof p === "string" ? { text: p, firstFrame: "", enabled: true }
                                          : { text: p?.text || "", firstFrame: p?.firstFrame || "", enabled: p?.enabled !== false }));
      state.promptHeader = s.promptHeader || "";
      state.promptFooter = s.promptFooter || "";
      selected = 0;
      ctx.persist();
      renderAll();
      const framesNote = (s.clipFrames && s.clipFrames !== state.clipFrames)
        ? ` — saved at a different clip length (${s.clipFrames} frames vs current ${state.clipFrames})` : "";
      ctx.showPopup?.(`Loaded "${name}"${framesNote}`, false);
    } catch (e) {
      ctx.showPopup?.(`Load failed: ${e.message || e}`, true);
    }
  });

  setSaveBtn.addEventListener("click", async () => {
    const existing = setsSel.value && setsSel.options.length && setsSel.value !== "" ? setsSel.value : "";
    const name = window.prompt("Save this prompt set as:", existing || "");
    if (name == null) return;
    const trimmed = name.trim();
    if (!trimmed) { ctx.showPopup?.("Name can't be empty.", true); return; }
    const willOverwrite = [...setsSel.options].some(o => o.value === trimmed);
    if (willOverwrite && !confirm(`"${trimmed}" already exists — overwrite it?`)) return;
    try {
      await savePromptSet({
        name: trimmed,
        clipFrames: state.clipFrames,
        promptHeader: state.promptHeader || "",
        promptFooter: state.promptFooter || "",
        prompts: (state.prompts || []).map(p => (typeof p === "string" ? { text: p, firstFrame: "", enabled: true } : p)),
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
    if (!confirm(`Delete "${name}"? This can't be undone.`)) return;
    try {
      await deletePromptSet(name);
      await refreshSetsList();
      ctx.showPopup?.(`Deleted "${name}".`, false);
    } catch (e) {
      ctx.showPopup?.(`Delete failed: ${e.message || e}`, true);
    }
  });

  // ── shared header / footer ─────────────────────────────────────────────────
  // These go into every clip, so they're edited once and kept out of the split.
  function commonField(placeholder, get, set) {
    const ta = el("textarea", { placeholder, style: {
      width: "100%", boxSizing: "border-box", minHeight: "90px", maxHeight: "150px",
      background: C.bg2, color: C.text, border: `1px solid ${C.border}`, borderRadius: "6px",
      padding: "6px 8px", fontSize: "11.5px", lineHeight: "1.5", fontFamily: "inherit",
      outline: "none", resize: "vertical",
    }});
    ta.value = get() || "";
    ta.addEventListener("input", () => { set(ta.value); ctx.persist(); refreshPreviewTag(); });
    ta.addEventListener("focus", () => ta.style.borderColor = BRAND);
    ta.addEventListener("blur",  () => ta.style.borderColor = C.border);
    return ta;
  }
  const headerTA = commonField("Common opening — visual style, grade, opening composition… (sent with every clip)",
    () => state.promptHeader, v => state.promptHeader = v);
  const footerTA = commonField("Common tail — Ambient sound: … / Music: … (sent with every clip)",
    () => state.promptFooter, v => state.promptFooter = v);

  const commonWrap = el("div", { style: { flexShrink: "0", display: "flex", gap: "8px" } });
  commonWrap.append(
    el("div", { style: { flex: "1", display: "flex", flexDirection: "column", gap: "3px" } },
      [el("div", { text: "COMMON — HEADER", style: { color: C.muted, fontSize: "9.5px", letterSpacing: "0.06em" } }), headerTA]),
    el("div", { style: { flex: "1", display: "flex", flexDirection: "column", gap: "3px" } },
      [el("div", { text: "COMMON — SOUND / MUSIC", style: { color: C.muted, fontSize: "9.5px", letterSpacing: "0.06em" } }), footerTA]),
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
  editHdr.append(editTitle, charCount);
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

  // ── per-prompt first-image override (A3) — thumbnail + upload + remove ──────
  const fiRow = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" } });
  const fiThumb = el("img", { style: {
    width: "34px", height: "34px", objectFit: "cover", borderRadius: "5px",
    border: `1px solid ${C.border}`, display: "none", cursor: "pointer",
  }});
  const fiLabel = el("div", { text: "First-frame override: none — uses this mode's default", style: {
    fontSize: "10.5px", color: C.muted, flex: "1",
  }});
  const fiUploadBtn = el("button", { type: "button", text: "⬆ Upload override", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "10.5px", padding: "4px 9px",
    borderRadius: "5px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
  }});
  const fiRemoveBtn = el("button", { type: "button", text: "✕", title: "Remove override", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "10.5px", padding: "4px 8px",
    borderRadius: "5px", background: "transparent", color: C.muted, border: `1px solid ${C.border}`,
    display: "none",
  }});
  const fiFileInput = el("input", { type: "file", accept: "image/*", style: { display: "none" } });
  fiUploadBtn.addEventListener("click", () => fiFileInput.click());
  fiFileInput.addEventListener("change", async () => {
    const file = fiFileInput.files?.[0];
    fiFileInput.value = "";
    if (!file) return;
    try {
      const filename = await uploadMedia(file);
      state.prompts[selected] = normPrompt(state.prompts[selected]);
      state.prompts[selected].firstFrame = filename;
      ctx.persist(); renderFirstFrameRow();
    } catch (e) {
      ctx.showPopup?.(`Upload failed: ${e.message || e}`, true);
    }
  });
  fiRemoveBtn.addEventListener("click", () => {
    state.prompts[selected] = normPrompt(state.prompts[selected]);
    state.prompts[selected].firstFrame = "";
    ctx.persist(); renderFirstFrameRow();
  });
  fiRow.append(fiThumb, fiLabel, fiUploadBtn, fiRemoveBtn, fiFileInput);
  const fiHint = el("div", {
    text: "Only FL2VA can take a first frame — a clip with an override renders as First/Last "
        + "even in Reference mode (its reference images drop for that clip). To resume a stopped "
        + "run, upload output/one_minimax_h3/frames/MMH3_clip0NN_last_*.png from the last clip you kept.",
    style: { fontSize: "9.5px", color: C.muted, lineHeight: "1.5", flexShrink: "0" },
  });
  function renderFirstFrameRow() {
    const p = normPrompt(state.prompts[selected] || {});
    const ff = p.firstFrame || "";
    if (ff) {
      fiThumb.src = `/view?filename=${encodeURIComponent(ff)}&type=input`;
      fiThumb.style.display = "block";
      fiLabel.textContent = `First-frame override: ${ff}`;
      fiRemoveBtn.style.display = "inline-block";
    } else {
      fiThumb.style.display = "none";
      fiLabel.textContent = "First-frame override: none — uses this mode's default";
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
      item.addEventListener("click", () => { selected = i; renderList(); loadSelected(); });
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
  const enhWrap = el("div", { style: {
    flexShrink: "0", background: C.bg1, border: `1px solid ${C.border}`,
    borderRadius: "8px", padding: "9px 10px", display: "flex", flexDirection: "column", gap: "7px",
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
    imgRow.style.display = enhMode === "image" ? "flex" : "none";
    if (enhMode !== "image") return;

    if (!state.ollamaImages) state.ollamaImages = [];
    const max = imageBriefMax(state.ollamaImageMode);
    if (state.ollamaImages.length > max) { state.ollamaImages.length = max; ctx.persist(); }

    const modeRow = el("div", { style: { display: "flex", gap: "4px" } });
    IMAGE_BRIEF_MODES.forEach(m => {
      const active = state.ollamaImageMode === m.key;
      const b = el("button", { type: "button", text: m.label, title: m.hint, style: {
        cursor: "pointer", fontFamily: "inherit", fontSize: "10px", padding: "3px 8px",
        borderRadius: "5px", fontWeight: active ? "700" : "400",
        background: active ? BRAND : C.bg2, color: "#fff",
        border: `1px solid ${active ? BRAND : C.border}`,
      }});
      b.addEventListener("click", () => {
        state.ollamaImageMode = m.key;
        const cap = imageBriefMax(m.key);
        if (state.ollamaImages.length > cap) state.ollamaImages.length = cap;
        ctx.persist(); renderImageRow();
      });
      modeRow.appendChild(b);
    });

    const grid = el("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap" } });
    function slot(i) {
      const name = state.ollamaImages[i];
      const box = el("div", { style: {
        position: "relative", width: "54px", height: "54px", flexShrink: "0",
        background: "#000", borderRadius: "6px", border: `1px solid ${C.border}`,
        cursor: name ? "default" : "pointer", overflow: "hidden",
        display: "flex", alignItems: "center", justifyContent: "center",
      }});
      if (name) {
        box.appendChild(el("img", { src: `/view?filename=${encodeURIComponent(name)}&type=input&t=${Date.now()}`,
          style: { width: "100%", height: "100%", objectFit: "cover" } }));
        box.appendChild(el("div", { text: String(i + 1), style: {
          position: "absolute", top: "1px", left: "3px", fontSize: "9px", fontWeight: "700",
          color: "#fff", textShadow: "0 0 3px #000" } }));
        const x = el("button", { type: "button", text: "✕", title: "Remove", style: {
          position: "absolute", top: "0", right: "0", cursor: "pointer", fontSize: "10px",
          background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", padding: "1px 4px",
        }});
        x.addEventListener("click", e => { e.stopPropagation(); state.ollamaImages.splice(i, 1); ctx.persist(); renderImageRow(); });
        box.appendChild(x);
      } else {
        box.appendChild(el("div", { text: "+img", style: { color: C.muted, fontSize: "10px", pointerEvents: "none" } }));
        const inp = el("input", { type: "file", accept: "image/*", style: { display: "none" } });
        async function take(f) {
          if (!f) return;
          const uploaded = await uploadImage(f);
          state.ollamaImages[i] = uploaded; ctx.persist(); renderImageRow();
        }
        box.addEventListener("click", () => inp.click());
        inp.addEventListener("change", async () => { await take(inp.files[0]); inp.value = ""; });
        box.addEventListener("dragover",  e => { e.preventDefault(); box.style.borderColor = BRAND; });
        box.addEventListener("dragleave", () => { box.style.borderColor = C.border; });
        box.addEventListener("drop", async e => { e.preventDefault(); box.style.borderColor = C.border; await take(e.dataTransfer.files[0]); });
        box.appendChild(inp);
      }
      return box;
    }
    // one slot per filled image, plus one empty slot to add the next — up to the cap
    const filled = state.ollamaImages.length;
    for (let i = 0; i < filled; i++) grid.appendChild(slot(i));
    if (filled < max) grid.appendChild(slot(filled));

    const note = el("div", { style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } });
    note.innerHTML = filled
      ? `${filled}/${max} image${max > 1 ? "s" : ""} — analyzed one at a time by the <b>vision model</b>, then written into a brief by the <b>brief model</b> (both set in ⚙ Settings).`
      : `Add up to ${max} image${max > 1 ? "s" : ""}. Needs a <b>vision model</b> set in ⚙ Settings.`;

    imgRow.append(modeRow, grid, note);
  }

  const enhBottom = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" } });
  enhBottom.append(modelSelWrap, targetSel,
    el("div", { text: "Length", style: { fontSize: "11px", color: C.muted } }), lenIn, lenTag,
    enhBtn);
  enhWrap.append(enhTop, imgRow, enhBottom);

  function isNativeSource() { return (state.visionSource || "ollama") === "native"; }

  function renderModelSel() {
    clear(modelSelWrap);
    if (isNativeSource()) {
      const needImage = enhMode === "image";
      const briefOk = !!state.nativeBriefClip;
      const visionOk = !needImage || !!state.nativeVisionClip;
      if (!briefOk || !visionOk) {
        modelSelWrap.appendChild(el("div", {
          text: !briefOk ? "No brief CLIP set — pick one in ⚙ Settings → Sampling."
                         : "No vision CLIP set — pick one in ⚙ Settings → Sampling.",
          style: { fontSize: "10.5px", color: C.warn },
        }));
        return;
      }
      const line = needImage
        ? `Brief: ${state.nativeBriefClip}  ·  Vision: ${state.nativeVisionClip}`
        : `Brief: ${state.nativeBriefClip}`;
      modelSelWrap.appendChild(el("div", {
        text: line,
        title: "Change these in ⚙ Settings → Sampling → Image → Brief — vision source",
        style: { fontSize: "10px", color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
      }));
      return;
    }
    if (!ollamaModels.length) {
      modelSelWrap.appendChild(el("div", {
        text: needsRestart ? "restart ComfyUI to enable Enhance"
                           : "no Ollama models — check the server URL in ⚙ Settings",
        style: { fontSize: "10.5px", color: C.warn },
      }));
      return;
    }
    if (!state.ollamaModel || !ollamaModels.includes(state.ollamaModel)) state.ollamaModel = ollamaModels[0];
    modelSelWrap.appendChild(select(
      ollamaModels.map(m => ({ value: m, label: m })),
      state.ollamaModel, v => { state.ollamaModel = v; ctx.persist(); }));
  }

  // Prompt Edit must reflect whichever source Settings currently has picked — it used to
  // always show the Ollama bar and model dropdown even with Native selected, which left no
  // way to tell (or change) which pipeline Enhance would actually run.
  function refreshSourceUI() {
    const native = isNativeSource();
    enhTitle.textContent = native ? "LOCAL ENHANCE (native CLIP)" : "OLLAMA ENHANCE";
    if (native) {
      statusTag.textContent = "runs through ComfyUI's own model loading — no external server";
      statusTag.style.color = C.muted;
      renderModelSel();
    } else {
      refreshOllama();
    }
  }

  async function refreshOllama() {
    statusTag.textContent = "connecting to Ollama…";
    const d = await getOllamaModels(state.ollamaUrl);
    ollamaModels = d.models || [];
    needsRestart = !!d.needsRestart;
    statusTag.textContent = d.ok
      ? `${ollamaModels.length} model${ollamaModels.length === 1 ? "" : "s"} · ${d.server_url}`
      : `⚠ ${String(d.error || "unreachable").slice(0, 80)}`;
    statusTag.style.color = d.ok ? C.muted : C.warn;
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
      if (state.ollamaImageMode === "fl") {
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

  async function imageToB64(filename) {
    const resp = await fetch(`/view?filename=${encodeURIComponent(filename)}&type=input`);
    const blob = await resp.blob();
    return new Promise(res => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result).split(",")[1] || "");
      fr.readAsDataURL(blob);
    });
  }

  enhBtn.addEventListener("click", async () => {
    if (busy) return;
    const native = (state.visionSource || "ollama") === "native";
    const images = enhMode === "image" ? (state.ollamaImages || []).filter(Boolean) : [];

    if (native) {
      if (!state.nativeBriefClip) { ctx.showPopup?.("No brief CLIP set — pick one in ⚙ Settings.", true); return; }
      if (images.length && !state.nativeVisionClip) { ctx.showPopup?.("No vision CLIP set — pick one in ⚙ Settings.", true); return; }
    } else {
      if (!state.ollamaModel) { ctx.showPopup?.("No brief model set — pick one in ⚙ Settings.", true); return; }
      if (images.length && !state.ollamaVisionModel) { ctx.showPopup?.("No vision model set — pick one in ⚙ Settings.", true); return; }
    }

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
        if (native) {
          // One call, whole batch — this is the path that actually attends to every
          // image at once (verified: SPEC_MINIMAX_H3_NEXT_ROUND.md §C5). The instruction
          // asks for the images to stay separated in the answer since nothing downstream
          // re-splits them the way the per-image Ollama loop naturally does.
          progressStage(`Analyzing ${images.length} image${images.length > 1 ? "s" : ""} (native, one batch)…`);
          const prompt = `${VISION_SYSTEM_PROMPT} There are ${images.length} images, in order. `
            + `Describe each one separately, each on its own line starting with "Image N: ".`;
          imageSummary = (await analyzeImagesNative(state.nativeVisionClip, images, prompt)).trim();
        } else {
          // One call per image, strictly sequential. A single Ollama call with several
          // images attached was tested against the model actually in use and it only
          // ever attended to one of them (§C0) — this loop is the workaround, not an
          // optimization left undone.
          const parts = [];
          for (let i = 0; i < images.length; i++) {
            progressStage(`Analyzing image ${i + 1}/${images.length}…`);
            const b64 = await imageToB64(images[i]);
            const d = await enhancePrompt({
              server_url: state.ollamaUrl,
              model: state.ollamaVisionModel,
              system_prompt: VISION_SYSTEM_PROMPT,
              user_prompt: "Describe this image.",
              image_b64: b64,
              temperature: state.ollamaTemperature ?? 0.7,
              top_p: state.ollamaTopP ?? 0.9,
              think: false,
            });
            parts.push(`Image ${i + 1}: ${(d.response || "").trim()}`);
          }
          imageSummary = parts.join("\n");
        }
      }

      progressStage("Writing brief…");
      let text;
      if (native) {
        text = (await writeBriefNative(state.nativeBriefClip, systemPrompt, buildUserPrompt(base, imageSummary))).trim();
      } else {
        const d = await enhancePrompt({
          server_url: state.ollamaUrl,
          model: state.ollamaModel,
          system_prompt: systemPrompt,
          user_prompt: buildUserPrompt(base, imageSummary),
          temperature: state.ollamaTemperature ?? 0.7,
          top_p: state.ollamaTopP ?? 0.9,
          think: false,
        });
        text = (d.response || "").trim();
      }
      if (!text) throw new Error("empty response");
      // Never write straight in — show what came back and let the user decide.
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

  const rvHdr = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" } });
  rvHdr.appendChild(el("div", { text: "✨ Enhance result", style: { color: "#fff", fontSize: "13px", fontWeight: "700" } }));
  const rvInfo = el("div", { style: { fontSize: "10.5px", color: C.muted, flex: "1" } });
  rvHdr.appendChild(rvInfo);

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
  reviewOv.append(rvHdr, rvBody, rvFoot);

  function reviewBlock(title, text, accent) {
    const b = el("div", { style: {
      background: C.bg1, border: `1px solid ${accent || C.border}`, borderRadius: "7px", padding: "8px 10px",
      display: "flex", flexDirection: "column", gap: "3px",
    }});
    b.append(
      el("div", { text: title, style: { fontSize: "9.5px", fontWeight: "700", color: accent || C.muted, letterSpacing: "0.05em" } }),
      el("div", { text, style: { fontSize: "11px", color: C.text, lineHeight: "1.55", whiteSpace: "pre-wrap" } }),
    );
    return b;
  }

  function openReview(text, target) {
    reviewText = text; reviewTarget = target;
    const parsed = parseBrief(text);
    const plan = ctx.currentPlan?.() || { count: 1 };
    clear(rvBody);

    if (reviewTarget === "all") {
      // Preview exactly what applying does: one shot, one clip.
      const shots = parsed.shots.length ? parsed.shots : [text];
      const secs = shots.length * (plan.clipSec || 0);
      rvInfo.textContent = `${shots.length} shot(s) → ${shots.length} clip prompt(s)`
        + (secs ? ` · ${secs.toFixed(1)}s total` : "");
      if (parsed.header) rvBody.appendChild(reviewBlock("→ COMMON HEADER", parsed.header, C.ok));
      shots.forEach((g, i) => rvBody.appendChild(reviewBlock(`→ CLIP ${i + 1}`, g, BRAND)));
      if (parsed.footer) rvBody.appendChild(reviewBlock("→ COMMON SOUND / MUSIC", parsed.footer, C.ok));
      rvSummary.textContent = `Applying replaces ${plan.promptCount} prompt(s) with ${shots.length}`
        + (parsed.header ? " + the common header" : "") + (parsed.footer ? " + the common tail" : "");
    } else {
      rvInfo.textContent = `${text.length} chars → clip ${selected + 1}`;
      // A single-clip apply still lifts the common parts out if the model wrote them.
      if (parsed.header) rvBody.appendChild(reviewBlock("→ COMMON HEADER", parsed.header, C.ok));
      rvBody.appendChild(reviewBlock(`→ CLIP ${selected + 1}`, parsed.shots.join("\n\n") || text, BRAND));
      if (parsed.footer) rvBody.appendChild(reviewBlock("→ COMMON SOUND / MUSIC", parsed.footer, C.ok));
      rvSummary.textContent = `Applying replaces clip ${selected + 1}`
        + (parsed.header || parsed.footer ? " and the common parts" : "");
    }
    reviewOv.style.display = "flex";
  }

  function applyReview() {
    const parsed = parseBrief(reviewText);
    snapshot(reviewTarget === "all" ? "enhance → all clips" : `enhance → clip ${selected + 1}`);
    if (parsed.header) state.promptHeader = parsed.header;
    if (parsed.footer) state.promptFooter = parsed.footer;
    if (reviewTarget === "all") {
      // One shot becomes one clip. Regrouping the shots down to however many prompts
      // happened to be in the editor was why asking for a long piece still produced a
      // single clip — the model wrote the shots and they were merged straight back.
      state.prompts = parsed.shots.length
        ? parsed.shots.map(s => ({ text: s, firstFrame: "", enabled: true }))
        : [{ text: reviewText, firstFrame: "", enabled: true }];
      selected = 0;
    } else {
      state.prompts[selected] = normPrompt(state.prompts[selected]);
      state.prompts[selected].text = parsed.shots.join("\n\n") || reviewText;
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
    renderList(); loadSelected(); refreshPlanTag(); refreshUndo();
  }

  function hide() { ov.style.display = "none"; onApply?.(); }

  return {
    el: ov,
    show() {
      ov.style.display = "flex";
      if (!state.prompts || !state.prompts.length) state.prompts = [{ text: "", firstFrame: "", enabled: true }];
      if (selected >= state.prompts.length) selected = 0;
      renderModes(); renderImageRow(); renderAll();
      if (!systemPrompt) loadSystemPrompt();
      refreshSourceUI();
      refreshSetsList();
      setTimeout(() => editor.focus(), 60);
    },
    hide,
    isOpen: () => ov.style.display !== "none",
    /** Pull header/footer back in after the Common Prompt popup edited them. */
    syncCommon() {
      headerTA.value = state.promptHeader || "";
      footerTA.value = state.promptFooter || "";
      refreshPreviewTag();
    },
  };
}

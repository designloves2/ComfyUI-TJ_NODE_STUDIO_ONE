// ui_prompt_edit_minimax.js — full-node prompt editor for MiniMax H3 ONE STUDIO (TJ)
//
// The node's inline prompt strip is fine for a glance but cramped for real writing, so
// this popup gives each clip a full-height editor plus an Ollama pass to turn a rough
// idea into a shot-by-shot brief.
//
// The brief-writing instruction is the same "Minimax H3 (Video)" system prompt TJ_NODE
// ships, fetched from the backend (with a built-in fallback when TJ_NODE isn't present).
import { C, BRAND, el, clear, parseBrief, groupShots, evenBreaks, composeClipPrompt } from "./core_minimax.js";
import { panel, label, button, select, row, col } from "../klein/ui_common.js";
import { getOllamaModels, getSystemPrompt, enhancePrompt, uploadImage } from "./api_minimax.js";

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
      prompts: (state.prompts || []).slice(),
      promptClips: (state.promptClips || []).slice(),
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
    state.prompts = s.prompts.slice();
    state.promptClips = (s.promptClips || []).slice();
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
  const closeBtn = button("✕ Close", () => hide(), "danger");
  hdr.appendChild(closeBtn);

  // ── shared header / footer ─────────────────────────────────────────────────
  // These go into every clip, so they're edited once and kept out of the split.
  function commonField(placeholder, get, set) {
    const ta = el("textarea", { placeholder, style: {
      width: "100%", boxSizing: "border-box", minHeight: "38px", maxHeight: "90px",
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
  listHdr.appendChild(el("div", { text: "CLIPS", style: { color: C.muted, fontSize: "10px", letterSpacing: "0.06em", flex: "1" } }));
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
    state.prompts[selected] = editor.value;
    ctx.persist(); updateCount(); renderList();
  });
  editor.addEventListener("focus", () => editor.style.borderColor = BRAND);
  editor.addEventListener("blur",  () => editor.style.borderColor = C.border);
  editCol.append(editHdr, editor);
  body.append(listCol, editCol);

  function updateCount() { refreshPreviewTag(); }

  function renderList() {
    clear(listBox);
    (state.prompts || []).forEach((p, i) => {
      const active = i === selected;
      const item = el("div", { style: {
        display: "flex", gap: "4px", alignItems: "center", cursor: "pointer",
        background: active ? C.bg3 : C.bg1, border: `1px solid ${active ? BRAND : C.border}`,
        borderRadius: "6px", padding: "6px 7px",
      }});
      const num = el("div", { text: String(i + 1), style: {
        width: "16px", flexShrink: "0", textAlign: "center", fontSize: "10px",
        fontWeight: "700", color: active ? BRAND : C.muted,
      }});
      const prev = el("div", {
        text: (p || "").trim().slice(0, 42) || "(empty — reuses previous)",
        style: { flex: "1", fontSize: "10.5px", color: (p || "").trim() ? C.text : C.muted,
                 overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
      });
      const del = el("button", { type: "button", text: "✕", title: "Remove", style: {
        flexShrink: "0", cursor: "pointer", background: "transparent", color: C.muted,
        border: "none", fontSize: "10px", padding: "0 2px",
      }});
      del.addEventListener("click", e => {
        e.stopPropagation();
        if ((state.prompts || []).length <= 1) { state.prompts = [""]; state.promptClips = [1]; }
        else { state.prompts.splice(i, 1); (state.promptClips || []).splice(i, 1); }
        if (selected >= state.prompts.length) selected = state.prompts.length - 1;
        ctx.persist(); renderList(); loadSelected();
      });
      item.addEventListener("click", () => { selected = i; renderList(); loadSelected(); });
      item.append(num, prev, del);
      listBox.appendChild(item);
    });
  }

  function loadSelected() {
    const list = state.prompts || [""];
    if (selected >= list.length) selected = 0;
    editor.value = list[selected] || "";
    editTitle.textContent = `Clip ${selected + 1}`;
    updateCount();
  }

  addBtn.addEventListener("click", () => {
    (state.prompts = state.prompts || []).push("");
    (state.promptClips = state.promptClips || []).push(1);
    selected = state.prompts.length - 1;
    ctx.persist(); renderList(); loadSelected(); editor.focus();
  });

  // ── Ollama enhance bar ─────────────────────────────────────────────────────
  const enhWrap = el("div", { style: {
    flexShrink: "0", background: C.bg1, border: `1px solid ${C.border}`,
    borderRadius: "8px", padding: "9px 10px", display: "flex", flexDirection: "column", gap: "7px",
  }});

  const enhTop = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" } });
  enhTop.appendChild(el("div", { text: "OLLAMA ENHANCE", style: { color: BRAND, fontSize: "10px", fontWeight: "700", letterSpacing: "0.06em" } }));
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
      b.addEventListener("click", () => { enhMode = m.key; renderModes(); renderImageRow(); });
      modeWrap.appendChild(b);
    });
  }
  enhTop.appendChild(modeWrap);

  const modelSelWrap = el("div", { style: { minWidth: "220px" } });
  const targetSel = select(
    [{ value: "one", label: "→ this clip" }, { value: "all", label: "→ split into all clips" }],
    "one", () => {});
  const enhBtn = el("button", { type: "button", text: "✨ Enhance", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "12px", padding: "7px 16px",
    borderRadius: "6px", background: BRAND, color: "#fff", border: "none", fontWeight: "700",
  }});

  const imgRow = el("div", { style: { display: "none", alignItems: "center", gap: "8px" } });
  function renderImageRow() {
    clear(imgRow);
    imgRow.style.display = enhMode === "image" ? "flex" : "none";
    if (enhMode !== "image") return;
    const thumb = el("div", { style: {
      width: "54px", height: "54px", flexShrink: "0", background: "#000", borderRadius: "6px",
      border: `1px solid ${C.border}`, cursor: "pointer", overflow: "hidden",
      display: "flex", alignItems: "center", justifyContent: "center",
    }});
    const hint = el("div", { text: "+img", style: { color: C.muted, fontSize: "10px", pointerEvents: "none" } });
    const im = el("img", { style: { width: "100%", height: "100%", objectFit: "cover", display: "none", pointerEvents: "none" } });
    if (state.ollamaImage) {
      im.src = `/view?filename=${encodeURIComponent(state.ollamaImage)}&type=input&t=${Date.now()}`;
      im.style.display = "block"; hint.style.display = "none";
    }
    thumb.append(hint, im);
    const inp = el("input", { type: "file", accept: "image/*", style: { display: "none" } });
    async function take(f) {
      if (!f) return;
      const name = await uploadImage(f);
      state.ollamaImage = name; ctx.persist(); renderImageRow();
    }
    thumb.addEventListener("click", () => inp.click());
    inp.addEventListener("change", async () => { await take(inp.files[0]); inp.value = ""; });
    thumb.addEventListener("dragover",  e => { e.preventDefault(); thumb.style.borderColor = BRAND; });
    thumb.addEventListener("dragleave", () => { thumb.style.borderColor = C.border; });
    thumb.addEventListener("drop", async e => { e.preventDefault(); thumb.style.borderColor = C.border; await take(e.dataTransfer.files[0]); });

    const note = el("div", { style: { fontSize: "10px", color: C.muted, lineHeight: "1.5", flex: "1" } });
    note.innerHTML = state.ollamaImage
      ? "The model sees this image and writes the brief from it. Anything in the editor is used as extra direction.<br>Pick a <b>vision-capable</b> Ollama model (llava / qwen-vl / gemma-vision …)."
      : "Drop or click to add an image. Needs a <b>vision-capable</b> Ollama model.";
    const clr = el("button", { type: "button", text: "✕", title: "Clear image", style: {
      cursor: "pointer", background: "transparent", color: C.muted, border: "none", fontSize: "11px",
    }});
    clr.addEventListener("click", () => { state.ollamaImage = null; ctx.persist(); renderImageRow(); });
    imgRow.append(thumb, note, ...(state.ollamaImage ? [clr] : []), inp);
  }

  const enhBottom = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" } });
  enhBottom.append(modelSelWrap, targetSel, enhBtn);
  enhWrap.append(enhTop, imgRow, enhBottom);

  function renderModelSel() {
    clear(modelSelWrap);
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
  function buildUserPrompt(baseText) {
    const plan = ctx.currentPlan?.() || { count: 1, clipSec: 8, actualSeconds: 8 };
    const lines = [
      `Target duration: ${plan.actualSeconds.toFixed(2)} seconds total, split into ${plan.count} shot(s) of ~${plan.clipSec.toFixed(2)}s each.`,
    ];
    if (plan.count > 1) {
      lines.push(`Write exactly ${plan.count} shots, separated by a line containing only ---, one shot per clip.`);
    }
    if (state.generationMode === "reference" && (state.refImages || []).length) {
      lines.push(`${state.refImages.length} reference image(s) are supplied; refer to them as <Picture 1>…<Picture ${state.refImages.length}>.`);
    }
    lines.push("", "USER REQUEST:", baseText || "(no text supplied — base the brief on the image)");
    return lines.join("\n");
  }

  enhBtn.addEventListener("click", async () => {
    if (busy) return;
    if (!state.ollamaModel) { ctx.showPopup?.("No Ollama model available.", true); return; }
    const target = targetSel.value;
    const base = (editor.value || "").trim();
    if (!base && !(enhMode === "image" && state.ollamaImage)) {
      ctx.showPopup?.("Write something first (or add an image).", true); return;
    }
    busy = true;
    const oldLabel = enhBtn.textContent;
    enhBtn.textContent = "⏳ Enhancing…"; enhBtn.disabled = true;
    statusTag.textContent = "generating…"; statusTag.style.color = BRAND;
    try {
      let imageB64 = null;
      if (enhMode === "image" && state.ollamaImage) {
        const resp = await fetch(`/view?filename=${encodeURIComponent(state.ollamaImage)}&type=input`);
        const blob = await resp.blob();
        imageB64 = await new Promise(res => {
          const fr = new FileReader();
          fr.onload = () => res(String(fr.result).split(",")[1] || "");
          fr.readAsDataURL(blob);
        });
      }
      const d = await enhancePrompt({
        server_url: state.ollamaUrl,
        model: state.ollamaModel,
        system_prompt: systemPrompt,
        user_prompt: buildUserPrompt(base),
        image_b64: imageB64,
        temperature: state.ollamaTemperature ?? 0.7,
        top_p: state.ollamaTopP ?? 0.9,
        think: false,
      });
      const text = (d.response || "").trim();
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
      busy = false; enhBtn.disabled = false; enhBtn.textContent = oldLabel;
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
      rvInfo.textContent = `${parsed.shots.length} shot(s) → will be grouped into ${Math.min(plan.count, parsed.shots.length) || 1} clip prompt(s)`;
      if (parsed.header) rvBody.appendChild(reviewBlock("→ COMMON HEADER", parsed.header, C.ok));
      const groups = groupShots(parsed.shots, plan.count);
      groups.forEach((g, i) => rvBody.appendChild(reviewBlock(`→ CLIP ${i + 1}`, g, BRAND)));
      if (parsed.footer) rvBody.appendChild(reviewBlock("→ COMMON SOUND / MUSIC", parsed.footer, C.ok));
      rvSummary.textContent = `Applying replaces ${plan.promptCount} prompt(s)`
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
      const plan = ctx.currentPlan?.() || { count: 1 };
      const groups = groupShots(parsed.shots, plan.count);
      state.prompts = groups.length ? groups : [reviewText];
      state.promptClips = state.prompts.map(() => 1);
      selected = 0;
    } else {
      state.prompts[selected] = parsed.shots.join("\n\n") || reviewText;
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
    state.prompts = groups;
    state.promptClips = groups.map(() => 1);
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

  ov.append(hdr, commonWrap, body, enhWrap, footer, splitOv, reviewOv);

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
      if (!state.prompts || !state.prompts.length) state.prompts = [""];
      if (selected >= state.prompts.length) selected = 0;
      renderModes(); renderImageRow(); renderAll();
      if (!systemPrompt) loadSystemPrompt();
      refreshOllama();
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

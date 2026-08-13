// ui_prompt_edit_minimax.js — full-node prompt editor for MiniMax H3 ONE STUDIO (TJ)
//
// The node's inline prompt strip is fine for a glance but cramped for real writing, so
// this popup gives each clip a full-height editor plus an Ollama pass to turn a rough
// idea into a shot-by-shot brief.
//
// The brief-writing instruction is the same "Minimax H3 (Video)" system prompt TJ_NODE
// ships, fetched from the backend (with a built-in fallback when TJ_NODE isn't present).
import { C, BRAND, el, clear, splitBrief } from "./core_minimax.js";
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

  // ── header ─────────────────────────────────────────────────────────────────
  const hdr = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" } });
  hdr.appendChild(el("div", { text: "📝 Prompt Edit", style: { color: "#fff", fontSize: "14px", fontWeight: "700" } }));
  const srcTag = el("div", { style: { fontSize: "10px", color: C.muted, flex: "1" } });
  hdr.appendChild(srcTag);
  const closeBtn = button("✕ Close", () => hide(), "danger");
  hdr.appendChild(closeBtn);

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

  function updateCount() {
    const n = (editor.value || "").length;
    charCount.textContent = `${n} chars`;
  }

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
        if ((state.prompts || []).length <= 1) state.prompts = [""];
        else state.prompts.splice(i, 1);
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

      if (target === "all") {
        const parts = splitBrief(text, (ctx.currentPlan?.() || {}).count);
        state.prompts = parts.length ? parts : [text];
        selected = 0;
      } else {
        state.prompts[selected] = text;
      }
      ctx.persist(); renderList(); loadSelected(); onApply?.();
      statusTag.textContent = target === "all"
        ? `done — ${state.prompts.length} clip prompt(s)` : "done";
      statusTag.style.color = C.ok;
    } catch (e) {
      statusTag.textContent = `⚠ ${String(e.message).slice(0, 90)}`;
      statusTag.style.color = C.err;
      ctx.showPopup?.(`Enhance failed: ${e.message}`, true);
    } finally {
      busy = false; enhBtn.disabled = false; enhBtn.textContent = oldLabel;
    }
  });

  // ── footer ─────────────────────────────────────────────────────────────────
  const footer = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" } });
  const splitBtn = el("button", { type: "button", text: "✂ Split this into clips", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "11px", padding: "6px 12px",
    borderRadius: "6px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
  }});
  splitBtn.addEventListener("click", () => {
    const parts = splitBrief(editor.value, (ctx.currentPlan?.() || {}).count);
    if (parts.length <= 1) { ctx.showPopup?.("No clip boundaries found ([Shot N], --- or blank lines).", true); return; }
    state.prompts = parts; selected = 0;
    ctx.persist(); renderList(); loadSelected(); onApply?.();
    ctx.showPopup?.(`Split into ${parts.length} clip prompts.`, false);
  });
  const planTag = el("div", { style: { fontSize: "10.5px", color: C.muted, flex: "1" } });
  footer.append(splitBtn, planTag, button("✓ Done", () => hide(), "primary"));

  ov.append(hdr, body, enhWrap, footer);

  function refreshPlanTag() {
    const p = ctx.currentPlan?.();
    if (!p) return;
    planTag.textContent = `${state.prompts.length} prompt(s) for ${p.count} clip · ${p.actualSeconds.toFixed(2)}s total`;
  }

  function hide() { ov.style.display = "none"; onApply?.(); }

  return {
    el: ov,
    show() {
      ov.style.display = "flex";
      if (!state.prompts || !state.prompts.length) state.prompts = [""];
      if (selected >= state.prompts.length) selected = 0;
      renderModes(); renderImageRow(); renderList(); loadSelected(); refreshPlanTag();
      if (!systemPrompt) loadSystemPrompt();
      refreshOllama();
      setTimeout(() => editor.focus(), 60);
    },
    hide,
    isOpen: () => ov.style.display !== "none",
  };
}

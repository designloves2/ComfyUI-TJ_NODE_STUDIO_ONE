// ui_app_settings_moss.js — Settings overlay for Moss Image ONE STUDIO (TJ)
import { C, el, SUBFOLDER, MANUAL_TEXT } from "./core_moss.js";
import { panel, label, button, col } from "../klein/ui_common.js";
import { getModels, getConfig, saveConfig } from "./api_moss.js";
import { mountLLMSettingsSection } from "../shared/llm_panel.js";

function searchableSelect(options, value, onChange) {
  const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "2px" } });
  const search = el("input", { type: "text", placeholder: "Search…", style: {
    width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text,
    border: `1px solid ${C.border}`, borderRadius: "6px", padding: "5px 7px",
    fontSize: "11px", fontFamily: "inherit", outline: "none",
  }});
  const sel = el("select", { style: {
    width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text,
    border: `1px solid ${C.border}`, borderRadius: "6px", padding: "6px",
    fontSize: "12px", fontFamily: "inherit", outline: "none",
  }, onchange: e => onChange(e.target.value) }, options.map(opt => {
    const v = typeof opt === "string" ? opt : opt.value;
    const t = typeof opt === "string" ? opt : opt.label;
    return el("option", { value: v, text: t, ...(v === value ? { selected: "selected" } : {}) });
  }));
  search.addEventListener("input", () => {
    const q = search.value.toLowerCase().trim();
    Array.from(sel.options).forEach(o => { o.hidden = q && !o.text.toLowerCase().includes(q); });
    const cur = Array.from(sel.options).find(o => o.value === sel.value);
    if (cur) cur.hidden = false;
  });
  wrap.appendChild(search); wrap.appendChild(sel);
  return { el: wrap, getValue() { return sel.value; }, setValue(v) { sel.value = v; } };
}

export function createSettingsOverlay(state, ctx) {
  const ov = el("div", { style: {
    position: "absolute", inset: "0", zIndex: "9998",
    background: "rgba(11,11,11,0.97)", borderRadius: "inherit",
    display: "none", flexDirection: "column", padding: "12px", gap: "8px",
    boxSizing: "border-box", overflowY: "auto",
  }});

  const topRow = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" } });
  topRow.appendChild(el("div", { text: "Settings — Moss Image ONE STUDIO (TJ)", style: { color: "#ffffff", fontSize: "14px", fontWeight: "700", flex: "1" } }));
  const saveAllBtn = button("Save All", () => saveAll(), "primary");
  const closeBtn   = button("✕", () => { ov.style.display = "none"; }, "danger");
  topRow.appendChild(saveAllBtn); topRow.appendChild(closeBtn);
  ov.appendChild(topRow);

  // ── Model dropdowns ────────────────────────────────────────────────────────
  const modelWrap = el("div"), teWrap = el("div"), vaeWrap = el("div");
  let modelSel, teSel, vaeSel;

  function rebuildModels(data) {
    [modelWrap, teWrap, vaeWrap].forEach(w => { while (w.firstChild) w.removeChild(w.firstChild); });
    const diff  = ["none", ...(data.diffusion_models || [])];
    const te    = ["none", ...(data.text_encoders    || [])];
    const vaes  = ["none", ...(data.vaes             || [])];
    if (data.diffusion_models?.length && !diff.includes(state.model))       state.model       = "none";
    if (data.text_encoders?.length    && !te.includes(state.textEncoder))   state.textEncoder = "none";
    if (data.vaes?.length             && !vaes.includes(state.vae))         state.vae         = "none";
    ctx.availableLoras = data.loras || [];
    ctx._rerenderLoras?.();
    modelSel   = searchableSelect(diff,  state.model,       v => { state.model       = v; ctx.persist(); });
    teSel      = searchableSelect(te,    state.textEncoder, v => { state.textEncoder = v; ctx.persist(); });
    vaeSel     = searchableSelect(vaes,  state.vae,         v => { state.vae         = v; ctx.persist(); });
    modelWrap.appendChild(col([label("Diffusion Model (moss_image_sft_* or moss_image_base_*)"), modelSel.el]));
    teWrap.appendChild(col([label("Text Encoder (qwen3.5_9b_*, loaded as CLIP type moss_image)"), teSel.el]));
    vaeWrap.appendChild(col([label("VAE (flux2-vae.safetensors)"), vaeSel.el]));
  }

  function applyConfigModels(cfg, data) {
    if (!data) return;
    const diff  = ["none", ...(data.diffusion_models || [])];
    const te    = ["none", ...(data.text_encoders    || [])];
    const vaes  = ["none", ...(data.vaes             || [])];
    if (!state.model        || state.model === "none")        { const sm = cfg.selected_model || "";        if (sm && diff.includes(sm))   { state.model = sm; modelSel?.setValue(sm); } }
    if (!state.textEncoder  || state.textEncoder === "none")  { const st = cfg.selected_text_encoder || "";  if (st && te.includes(st))     { state.textEncoder = st; teSel?.setValue(st); } }
    if (!state.vae          || state.vae === "none")          { const sv = cfg.selected_vae || "";           if (sv && vaes.includes(sv))   { state.vae = sv; vaeSel?.setValue(sv); } }
    ctx.persist();
  }

  rebuildModels({ diffusion_models: [], text_encoders: [], vaes: [], loras: [] });

  const refreshBtn = button("↻ Refresh Models", async () => {
    refreshBtn.textContent = "Loading…";
    try { const d = await getModels(); rebuildModels(d); } finally { refreshBtn.textContent = "↻ Refresh Models"; }
  });

  const modelNote = el("div", { style: { fontSize: "10px", color: C.muted, marginTop: "-4px" } });
  modelNote.innerHTML = "Diffusion model → <code>models/diffusion_models/</code> · Text Encoder → <code>models/text_encoders/</code> · VAE → <code>models/vae/</code>";

  ov.appendChild(panel([
    el("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } }, [
      modelWrap, teWrap, vaeWrap, modelNote, refreshBtn,
    ])
  ]));

  // ── Negative prompt ────────────────────────────────────────────────────────
  const negTA = el("textarea", { placeholder: "Negative prompt…", style: {
    width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text,
    border: `1px solid ${C.border}`, borderRadius: "6px", padding: "7px",
    fontSize: "12px", fontFamily: "inherit", resize: "vertical", outline: "none", minHeight: "60px",
  }});
  negTA.value = state.negativePrompt || "";
  negTA.addEventListener("input", () => { state.negativePrompt = negTA.value; ctx.persist(); });
  ov.appendChild(panel([label("Negative Prompt"), negTA]));

  // ── Save folder ────────────────────────────────────────────────────────────
  const pathIn = el("input", { type: "text", placeholder: SUBFOLDER, style: {
    width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text,
    border: `1px solid ${C.border}`, borderRadius: "6px", padding: "7px",
    fontSize: "12px", fontFamily: "inherit",
  }});
  pathIn.value = state.saveSubfolder || "";
  pathIn.addEventListener("input", () => { state.saveSubfolder = pathIn.value.trim(); ctx.persist(); });

  const visChk = el("input", { type: "checkbox" });
  visChk.checked = ctx.appConfig?.output_mode_visible !== false;
  const visLbl = el("label", { style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: C.text } },
    [visChk, el("span", { text: "Show Save / Preview toggle in main view" })]);
  visChk.addEventListener("change", () => {
    if (ctx.appConfig) ctx.appConfig.output_mode_visible = visChk.checked;
    ctx._refreshToggle?.(); ctx.renderToggle?.();
  });
  ov.appendChild(panel([label("Save Folder (inside ComfyUI output/)"), pathIn, visLbl]));

  // ── LLM — Prompt Write / Prompt Enhance backend + model config ─────────────
  const llmPanel = panel([]);
  ov.appendChild(llmPanel);
  mountLLMSettingsSection(llmPanel, ctx);

  // ── Manual / required files ───────────────────────────────────────────────
  const manualBody = el("div", { style: { fontSize: "11px", lineHeight: "1.6", color: C.text, whiteSpace: "pre-wrap" } });
  manualBody.textContent = MANUAL_TEXT;
  ov.appendChild(panel([label("Manual — Model & File Requirements"), manualBody]));

  function saveAll() {
    ctx.persist();
    saveConfig({
      save_subfolder:          state.saveSubfolder    || "",
      output_mode_visible:     visChk.checked,
      selected_model:          state.model             || "",
      selected_text_encoder:   state.textEncoder        || "",
      selected_vae:            state.vae                || "",
      negative_prompt:         state.negativePrompt     || "",
    });
    saveAllBtn.textContent = "✓ Saved!";
    setTimeout(() => { saveAllBtn.textContent = "Save All"; }, 1500);
  }

  getConfig().then(cfg => {
    if (cfg.negative_prompt && !state.negativePrompt?.trim()) { state.negativePrompt = cfg.negative_prompt; negTA.value = cfg.negative_prompt; }
    if (cfg.save_subfolder && !state.saveSubfolder) { state.saveSubfolder = cfg.save_subfolder; pathIn.value = cfg.save_subfolder; }
    visChk.checked = cfg.output_mode_visible !== false;
    if (ctx.appConfig) ctx.appConfig.output_mode_visible = visChk.checked;
    ctx._refreshToggle?.(); ctx.renderToggle?.();
    return getModels().then(d => { rebuildModels(d); applyConfigModels(cfg, d); });
  }).catch(() => {});

  return {
    el: ov,
    show() { ov.style.display = "flex"; },
    hide() { ov.style.display = "none"; },
  };
}

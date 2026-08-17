// ui_app_settings_anima.js — Settings overlay for Anima ONE STUDIO (TJ)
import { C, el, SUBFOLDER, MANUAL_TEXT } from "./core_anima.js";
import { panel, label, button, col } from "../klein/ui_common.js";
import { getModels, getConfig, saveConfig } from "./api_anima.js";

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
  topRow.appendChild(el("div", { text: "Settings — Anima ONE STUDIO (TJ)", style: { color: "#ffffff", fontSize: "14px", fontWeight: "700", flex: "1" } }));
  const saveAllBtn = button("Save All", () => saveAll(), "primary");
  const closeBtn   = button("✕", () => { ov.style.display = "none"; }, "danger");
  topRow.appendChild(saveAllBtn); topRow.appendChild(closeBtn);
  ov.appendChild(topRow);

  // ── Model dropdowns ────────────────────────────────────────────────────────
  const modelWrap = el("div"), previewWrap = el("div"), teWrap = el("div"), vaeWrap = el("div"), turboWrap = el("div");
  let modelSel, previewSel, teSel, vaeSel, turboSel;

  function rebuildModels(data) {
    [modelWrap, previewWrap, teWrap, vaeWrap, turboWrap].forEach(w => { while (w.firstChild) w.removeChild(w.firstChild); });
    const diff  = ["none", ...(data.diffusion_models || [])];
    const te    = ["none", ...(data.text_encoders    || [])];
    const vaes  = ["none", ...(data.vaes             || [])];
    const loras = ["none", ...(data.loras            || [])];
    if (data.diffusion_models?.length && !diff.includes(state.model))       state.model       = "none";
    if (data.diffusion_models?.length && !diff.includes(state.previewModel)) state.previewModel = "none";
    if (data.text_encoders?.length    && !te.includes(state.textEncoder))   state.textEncoder = "none";
    if (data.vaes?.length             && !vaes.includes(state.vae))         state.vae         = "none";
    if (data.loras?.length            && !loras.includes(state.turboLora))  state.turboLora   = "none";
    modelSel   = searchableSelect(diff,  state.model,       v => { state.model       = v; ctx.persist(); });
    previewSel = searchableSelect(diff,  state.previewModel, v => { state.previewModel = v; ctx.persist(); });
    teSel      = searchableSelect(te,    state.textEncoder, v => { state.textEncoder = v; ctx.persist(); });
    vaeSel     = searchableSelect(vaes,  state.vae,         v => { state.vae         = v; ctx.persist(); });
    turboSel   = searchableSelect(loras, state.turboLora,   v => { state.turboLora   = v; ctx.persist(); });
    modelWrap.appendChild(col([label("Diffusion Model — Base 1.0 (anima-base-v1.0.safetensors)"), modelSel.el]));
    previewWrap.appendChild(col([label("Diffusion Model — Preview3 (T2I only)"), previewSel.el]));
    teWrap.appendChild(col([label("Text Encoder (qwen_3_06b_base.safetensors)"), teSel.el]));
    vaeWrap.appendChild(col([label("VAE (qwen_image_vae.safetensors)"), vaeSel.el]));
    turboWrap.appendChild(col([label("Turbo LoRA (anima-turbo-lora-v0.2.safetensors)"), turboSel.el]));
  }

  function applyConfigModels(cfg, data) {
    if (!data) return;
    const diff  = ["none", ...(data.diffusion_models || [])];
    const te    = ["none", ...(data.text_encoders    || [])];
    const vaes  = ["none", ...(data.vaes             || [])];
    const loras = ["none", ...(data.loras            || [])];
    if (!state.model        || state.model === "none")        { const sm = cfg.selected_model || "";        if (sm && diff.includes(sm))   { state.model = sm; modelSel?.setValue(sm); } }
    if (!state.previewModel || state.previewModel === "none")  { const sp = cfg.selected_preview_model || ""; if (sp && diff.includes(sp))   { state.previewModel = sp; previewSel?.setValue(sp); } }
    if (!state.textEncoder  || state.textEncoder === "none")  { const st = cfg.selected_text_encoder || "";  if (st && te.includes(st))     { state.textEncoder = st; teSel?.setValue(st); } }
    if (!state.vae          || state.vae === "none")          { const sv = cfg.selected_vae || "";           if (sv && vaes.includes(sv))   { state.vae = sv; vaeSel?.setValue(sv); } }
    if (!state.turboLora    || state.turboLora === "none")    { const sl = cfg.selected_turbo_lora || "";     if (sl && loras.includes(sl)) { state.turboLora = sl; turboSel?.setValue(sl); } }
    ctx.persist();
  }

  rebuildModels({ diffusion_models: [], text_encoders: [], vaes: [], loras: [] });

  const refreshBtn = button("↻ Refresh Models", async () => {
    refreshBtn.textContent = "Loading…";
    try { const d = await getModels(); rebuildModels(d); } finally { refreshBtn.textContent = "↻ Refresh Models"; }
  });

  const modelNote = el("div", { style: { fontSize: "10px", color: C.muted, marginTop: "-4px" } });
  modelNote.innerHTML = "Diffusion model / Preview3 → <code>models/diffusion_models/</code> · Text Encoder → <code>models/text_encoders/</code> · VAE → <code>models/vae/</code> · Turbo LoRA → <code>models/loras/</code>";

  ov.appendChild(panel([
    el("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } }, [
      modelWrap, previewWrap, teWrap, vaeWrap, turboWrap, modelNote, refreshBtn,
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
      selected_preview_model:  state.previewModel       || "",
      selected_text_encoder:   state.textEncoder        || "",
      selected_vae:            state.vae                || "",
      selected_turbo_lora:     state.turboLora           || "",
      negative_prompt:         state.negativePrompt     || "",
    });
    saveAllBtn.textContent = "✓ Saved!";
    setTimeout(() => { saveAllBtn.textContent = "Save All"; }, 1500);
  }

  getConfig().then(cfg => {
    if (cfg.negative_prompt && !state.negativePrompt) { state.negativePrompt = cfg.negative_prompt; negTA.value = cfg.negative_prompt; }
    if (cfg.save_subfolder && !state.saveSubfolder) pathIn.placeholder = cfg.save_subfolder;
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

// ui_app_settings_krea2.js — Settings overlay for Krea 2 ONE STUDIO (TJ)
import { C, el, SUBFOLDER, DEPTH_CKPTS, safeDepthCkpt } from "./core_krea2.js";
import { panel, label, button, select, row, col } from "../klein/ui_common.js";
import { getModels, getConfig, saveConfig } from "./api_krea2.js";
import { t, getLang, setLang } from "../shared/i18n.js";

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
  topRow.appendChild(el("div", { text: "⚙ Settings — Krea 2 ONE STUDIO (TJ)", style: { color: "#ffffff", fontSize: "14px", fontWeight: "700", flex: "1" } }));
  const saveAllBtn = button("💾 Save All", () => saveAll(), "primary");
  const closeBtn   = button("✕", () => { ov.style.display = "none"; }, "danger");
  topRow.appendChild(saveAllBtn); topRow.appendChild(closeBtn);
  ov.appendChild(topRow);

  // ── Model dropdowns ────────────────────────────────────────────────────────
  const modelWrap = el("div"), teWrap = el("div"), vaeWrap = el("div");
  let modelSel, teSel, vaeSel;

  function rebuildModels(data) {
    [modelWrap, teWrap, vaeWrap].forEach(w => { while (w.firstChild) w.removeChild(w.firstChild); });
    const diff = ["none", ...(data.diffusion_models || [])];
    const te   = ["none", ...(data.text_encoders    || [])];
    const vaes = ["none", ...(data.vaes             || [])];
    if (data.diffusion_models?.length && !diff.includes(state.model))     state.model       = "none";
    if (data.text_encoders?.length    && !te.includes(state.textEncoder)) state.textEncoder = "none";
    if (data.vaes?.length             && !vaes.includes(state.vae))       state.vae         = "none";
    modelSel = searchableSelect(diff, state.model,       v => { state.model       = v; ctx.persist(); });
    teSel    = searchableSelect(te,   state.textEncoder, v => { state.textEncoder = v; ctx.persist(); });
    vaeSel   = searchableSelect(vaes, state.vae,         v => { state.vae         = v; ctx.persist(); });
    modelWrap.appendChild(col([label("Diffusion Model (UNet / GGUF)"), modelSel.el]));
    teWrap.appendChild(col([label("Text Encoder (CLIP krea2)"), teSel.el]));
    vaeWrap.appendChild(col([label("VAE"), vaeSel.el]));
  }

  function applyConfigModels(cfg, data) {
    if (!data) return;
    const diff = ["none", ...(data.diffusion_models || [])];
    const te   = ["none", ...(data.text_encoders    || [])];
    const vaes = ["none", ...(data.vaes             || [])];
    if (!state.model       || state.model === "none")       { const sm = cfg.selected_model || ""; if (sm && diff.includes(sm)) { state.model = sm; modelSel?.setValue(sm); } }
    if (!state.textEncoder || state.textEncoder === "none") { const st = cfg.selected_text_encoder || ""; if (st && te.includes(st)) { state.textEncoder = st; teSel?.setValue(st); } }
    if (!state.vae         || state.vae === "none")         { const sv = cfg.selected_vae || ""; if (sv && vaes.includes(sv)) { state.vae = sv; vaeSel?.setValue(sv); } }
    ctx.persist();
  }

  rebuildModels({ diffusion_models: [], text_encoders: [], vaes: [] });

  const refreshBtn = button("↻ Refresh Models", async () => {
    refreshBtn.textContent = "Loading…";
    try {
      const d = await getModels();
      rebuildModels(d);
      ctx.availableLoras = d.loras || [];
      rebuildControlNet(d.loras || []);
      rebuildIdentity(d.loras || []);
      ctx._rerenderLoras?.();
      ctx._rerenderControlNet?.();
    } finally { refreshBtn.textContent = "↻ Refresh Models"; }
  });

  const modelNote = el("div", { style: { fontSize: "10px", color: C.muted, marginTop: "-4px" } });
  modelNote.innerHTML = "Model → <code>models/diffusion_models/</code> · Text Encoder → <code>models/text_encoders/</code> · VAE → <code>models/vae/</code>";

  ov.appendChild(panel([
    el("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } }, [
      row([modelWrap, teWrap, vaeWrap]),
      modelNote,
      refreshBtn,
    ])
  ]));

  // ── ControlNet (Krea2 Control LoRA) — depth + canny, configured once ────────
  const cnDepthWrap = el("div"), cnCannyWrap = el("div");
  let cnDepthSel, cnCannySel;
  function rebuildControlNet(loras) {
    [cnDepthWrap, cnCannyWrap].forEach(w => { while (w.firstChild) w.removeChild(w.firstChild); });
    const opts = ["none", ...(loras || []).filter(n => n !== "none")];
    if (loras?.length && !opts.includes(state.controlLoraDepth)) state.controlLoraDepth = "none";
    if (loras?.length && !opts.includes(state.controlLoraCanny)) state.controlLoraCanny = "none";
    cnDepthSel = searchableSelect(opts, state.controlLoraDepth || "none", v => { state.controlLoraDepth = v; ctx.persist(); ctx._rerenderControlNet?.(); });
    cnCannySel = searchableSelect(opts, state.controlLoraCanny || "none", v => { state.controlLoraCanny = v; ctx.persist(); ctx._rerenderControlNet?.(); });
    cnDepthWrap.appendChild(col([label("Depth Control LoRA"), cnDepthSel.el]));
    cnCannyWrap.appendChild(col([label("Canny Control LoRA"), cnCannySel.el]));
  }
  rebuildControlNet([]);
  state.depthCkpt = safeDepthCkpt(state.depthCkpt);   // drop unavailable vitg, etc.

  const cnHint = el("div", { style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } });
  cnHint.innerHTML = "Register the LoRA FILES here (once). <b>All tuning values</b> — type (depth / canny), strength, "
    + "thresholds, depth model, resolution, channel/normalize/invert — are adjusted in the <b>side-menu CONTROLNET panel</b>."
    + "<br><b>Depth</b>: Krea2 Control LoRA + <code>DepthAnythingV2Preprocessor</code> (<code>comfyui-krea2-controlnet</code>)."
    + "<br><b>Canny</b>: NK2E in-context edit + <code>CannyEdgePreprocessor</code> (<code>ComfyUI-NK2E</code> node + NK2E canny LoRA)."
    + "<br>LoRAs go in <code>models/loras/</code>.";

  ov.appendChild(panel([
    label("ControlNet — LoRA files (register once)"),
    row([cnDepthWrap, cnCannyWrap]),
    cnHint,
  ]));

  // ── Identity Edit LoRA (comfyui-krea2edit) — configure ONCE ─────────────────
  const idLoraWrap = el("div");
  let idLoraSel;
  function rebuildIdentity(loras) {
    while (idLoraWrap.firstChild) idLoraWrap.removeChild(idLoraWrap.firstChild);
    const opts = ["none", ...(loras || []).filter(n => n !== "none")];
    if (loras?.length && !opts.includes(state.identityLora)) state.identityLora = "none";
    idLoraSel = searchableSelect(opts, state.identityLora || "none", v => { state.identityLora = v; ctx.persist(); });
    idLoraWrap.appendChild(col([label("Identity Edit LoRA (krea2_identity_edit_v1_2.safetensors)"), idLoraSel.el]));
  }
  rebuildIdentity([]);

  const idStrIn = el("input", { type: "number", step: "0.05", min: "0", max: "2", style: {
    width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text,
    border: `1px solid ${C.border}`, borderRadius: "6px", padding: "6px",
    fontSize: "12px", fontFamily: "inherit", outline: "none",
  }});
  idStrIn.value = state.identityLoraStrength ?? 1.0;
  idStrIn.addEventListener("input", () => { const v = parseFloat(idStrIn.value); state.identityLoraStrength = isNaN(v) ? 1.0 : v; ctx.persist(); });

  const idHint = el("div", { style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } });
  idHint.innerHTML = "Powers the <b>IDENTITY</b> tab. Requires the <code>comfyui-krea2edit</code> custom node "
    + "(Krea2EditModelPatch / Krea2EditGroundedEncode) and the LoRA in <code>models/loras/</code>. "
    + "Set here once — strength 1.0 recommended.";

  ov.appendChild(panel([
    label("Identity Edit — LoRA (one-time setup)"),
    idLoraWrap,
    row([col([label("LoRA Strength"), idStrIn]), col([el("div")])]),
    idHint,
  ]));

  // ── Language selector ──────────────────────────────────────────────────────
  const langSel = el("select", { style: {
    background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
    borderRadius: "6px", padding: "5px 8px", fontSize: "12px", fontFamily: "inherit", outline: "none",
  }, onchange: e => { setLang(e.target.value); window.location.reload(); }});
  ["ko", "en"].forEach(code => {
    const opt = el("option", { value: code, text: code === "ko" ? "한국어" : "English" });
    if (getLang() === code) opt.selected = true;
    langSel.appendChild(opt);
  });
  ov.appendChild(panel([label(t("lang_label")), langSel]));

  // ── Negative prompt ────────────────────────────────────────────────────────
  const negTA = el("textarea", { placeholder: "Negative prompt…", style: {
    width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text,
    border: `1px solid ${C.border}`, borderRadius: "6px", padding: "7px",
    fontSize: "12px", fontFamily: "inherit", resize: "vertical", outline: "none", minHeight: "60px",
  }});
  negTA.value = state.negativePrompt || "";
  negTA.addEventListener("input", () => { state.negativePrompt = negTA.value; });
  ov.appendChild(panel([label("Negative Prompt"), negTA]));

  // ── Prompt suffix ──────────────────────────────────────────────────────────
  const suffixIn = el("input", { type: "text", placeholder: "e.g. high quality, sharp focus", style: {
    width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text,
    border: `1px solid ${C.border}`, borderRadius: "6px", padding: "7px",
    fontSize: "12px", fontFamily: "inherit",
  }});
  suffixIn.value = state.promptSuffix || "";
  suffixIn.addEventListener("input", () => { state.promptSuffix = suffixIn.value; });
  ov.appendChild(panel([label("Prompt Suffix (auto-appended for quality boost)"), suffixIn]));

  // ── Save folder ────────────────────────────────────────────────────────────
  const pathIn = el("input", { type: "text", placeholder: SUBFOLDER, style: {
    width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text,
    border: `1px solid ${C.border}`, borderRadius: "6px", padding: "7px",
    fontSize: "12px", fontFamily: "inherit",
  }});
  pathIn.value = state.saveSubfolder || "";
  pathIn.addEventListener("input", () => { state.saveSubfolder = pathIn.value.trim(); });

  const visChk = el("input", { type: "checkbox" });
  visChk.checked = ctx.appConfig?.output_mode_visible !== false;
  const visLbl = el("label", { style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: C.text } },
    [visChk, el("span", { text: "Show Save / Preview toggle in main view" })]);
  visChk.addEventListener("change", () => {
    if (ctx.appConfig) ctx.appConfig.output_mode_visible = visChk.checked;
    ctx._refreshToggle?.(); ctx.renderToggle?.();
  });
  ov.appendChild(panel([label("Save Folder (inside ComfyUI output/)"), pathIn, visLbl]));

  function saveAll() {
    ctx.persist();
    saveConfig({
      save_subfolder:        state.saveSubfolder    || "",
      output_mode_visible:   visChk.checked,
      selected_model:        state.model            || "",
      selected_text_encoder: state.textEncoder      || "",
      selected_vae:          state.vae              || "",
      negative_prompt:       state.negativePrompt   || "",
      prompt_suffix:         state.promptSuffix     || "",
      control_lora_depth:    state.controlLoraDepth || "none",
      control_lora_canny:    state.controlLoraCanny || "none",
      control_strength:      state.controlStrength  ?? 1.0,
      control_channel_mode:  state.controlChannelMode || "rgb",
      control_normalize:     state.controlNormalize   || "per_image_minmax",
      control_invert:        state.controlInvert    ?? false,
      depth_ckpt:            state.depthCkpt        || "depth_anything_v2_vitl.pth",
      preproc_resolution:    state.preprocResolution ?? 512,
      identity_lora:          state.identityLora         || "none",
      identity_lora_strength: state.identityLoraStrength ?? 1.0,
    });
    saveAllBtn.textContent = "✓ Saved!";
    setTimeout(() => { saveAllBtn.textContent = "💾 Save All"; }, 1500);
  }

  // ── Model Override toggle ─────────────────────────────────────────────────
  const overrideChk = el("input", { type: "checkbox" });
  overrideChk.checked = false;
  overrideChk.addEventListener("change", () => {
    ctx.syncOverrideSlots?.(overrideChk.checked);
  });
  const overrideLbl = el("label", { style: { display:"flex", alignItems:"center", gap:"6px", fontSize:"12px", color:C.text } }, [
    overrideChk,
    el("span", { text: "Enable Model Override (connects model / clip / vae from external nodes)" }),
  ]);
  ov.appendChild(panel([label("Model Override"), overrideLbl]));

  // Initial load
  getConfig().then(cfg => {
    if (cfg.negative_prompt && !state.negativePrompt) { state.negativePrompt = cfg.negative_prompt; negTA.value = cfg.negative_prompt; }
    if (cfg.prompt_suffix   && !state.promptSuffix)   { state.promptSuffix   = cfg.prompt_suffix;   suffixIn.value = cfg.prompt_suffix; }
    // ControlNet config — apply saved values if state still at defaults
    // (migrate legacy single control_lora → depth slot)
    if ((!state.controlLoraDepth || state.controlLoraDepth === "none") && cfg.control_lora_depth && cfg.control_lora_depth !== "none") state.controlLoraDepth = cfg.control_lora_depth;
    else if ((!state.controlLoraDepth || state.controlLoraDepth === "none") && cfg.control_lora && cfg.control_lora !== "none") state.controlLoraDepth = cfg.control_lora;
    if ((!state.controlLoraCanny || state.controlLoraCanny === "none") && cfg.control_lora_canny && cfg.control_lora_canny !== "none") state.controlLoraCanny = cfg.control_lora_canny;
    // ControlNet tuning values are adjusted in the side menu now — just seed state.
    if (cfg.control_strength   != null)          state.controlStrength    = cfg.control_strength;
    if (cfg.control_channel_mode)                state.controlChannelMode = cfg.control_channel_mode;
    if (cfg.control_normalize)                   state.controlNormalize   = cfg.control_normalize;
    if (typeof cfg.control_invert === "boolean") state.controlInvert      = cfg.control_invert;
    if (cfg.depth_ckpt)                          state.depthCkpt          = safeDepthCkpt(cfg.depth_ckpt);
    if (cfg.preproc_resolution != null)          state.preprocResolution  = cfg.preproc_resolution;
    // Identity Edit LoRA config
    if ((!state.identityLora || state.identityLora === "none") && cfg.identity_lora && cfg.identity_lora !== "none") state.identityLora = cfg.identity_lora;
    if (cfg.identity_lora_strength != null) { state.identityLoraStrength = cfg.identity_lora_strength; idStrIn.value = state.identityLoraStrength; }
    if (cfg.save_subfolder  && !state.saveSubfolder)  pathIn.placeholder = cfg.save_subfolder;
    visChk.checked = cfg.output_mode_visible !== false;
    if (ctx.appConfig) ctx.appConfig.output_mode_visible = visChk.checked;
    ctx._refreshToggle?.(); ctx.renderToggle?.();
    return getModels().then(d => {
      rebuildModels(d);
      ctx.availableLoras = d.loras || [];
      rebuildControlNet(d.loras || []);
      rebuildIdentity(d.loras || []);
      ctx._rerenderLoras?.();
      ctx._rerenderControlNet?.();
      applyConfigModels(cfg, d);
    });
  }).catch(() => {});

  return {
    el: ov,
    show() { ov.style.display = "flex"; },
    hide() { ov.style.display = "none"; },
  };
}

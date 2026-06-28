// ui_app_settings_qe.js — Settings overlay for Qwen Image Edit 2511 ONE (TJ)
import { C, el, SUBFOLDER, BRAND } from "./core_qwen2511.js";
import { panel, label, button, row, col } from "./ui_common_qe.js";
import { getModels, getConfig, saveConfig } from "./api_qwen2511.js";
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
  topRow.appendChild(el("div", { text: "⚙ Settings — Qwen Image Edit 2511 ONE (TJ)", style: { color: "#ffffff", fontSize: "14px", fontWeight: "700", flex: "1" } }));
  const saveAllBtn = button("💾 Save All", () => saveAll(), "primary");
  const closeBtn   = button("✕", () => { ov.style.display = "none"; }, "danger");
  topRow.appendChild(saveAllBtn); topRow.appendChild(closeBtn);
  ov.appendChild(topRow);

  // ── Model dropdowns ────────────────────────────────────────────────────────
  const modelWrap = el("div"), clipWrap = el("div"), vaeWrap = el("div");
  let modelSel, clipSel, vaeSel;

  function rebuildModels(data) {
    [modelWrap, clipWrap, vaeWrap].forEach(w => { while (w.firstChild) w.removeChild(w.firstChild); });
    const allModels = ["none", ...(data.diffusion_models||[]), ...(data.gguf||[])];
    const te        = ["none", ...(data.text_encoders   || [])];
    const vaes      = ["none", ...(data.vaes            || [])];
    if (data.diffusion_models?.length && !allModels.includes(state.model))      state.model       = "none";
    if (data.text_encoders?.length    && !te.includes(state.textEncoder))       state.textEncoder = "none";
    if (data.vaes?.length             && !vaes.includes(state.vae))             state.vae         = "none";
    modelSel = searchableSelect(allModels, state.model       || "none", v => { state.model       = v; ctx.persist?.(); });
    clipSel  = searchableSelect(te,        state.textEncoder || "none", v => { state.textEncoder = v; ctx.persist?.(); });
    vaeSel   = searchableSelect(vaes,      state.vae         || "none", v => { state.vae         = v; ctx.persist?.(); });
    modelWrap.appendChild(col([label("Diffusion Model (UNETLoader)"), modelSel.el]));
    clipWrap.appendChild(col([label("Text Encoder (CLIPLoader qwen_image)"), clipSel.el]));
    vaeWrap.appendChild(col([label("VAE"), vaeSel.el]));
  }

  function applyConfigModels(cfg, data) {
    if (!data) return;
    const allModels = ["none", ...(data.diffusion_models||[]), ...(data.gguf||[])];
    const te   = ["none", ...(data.text_encoders || [])];
    const vaes = ["none", ...(data.vaes          || [])];
    if (!state.model       || state.model       === "none") { const sm=cfg.selected_model||""; if(sm&&allModels.includes(sm)){state.model=sm; modelSel?.setValue(sm);} }
    if (!state.textEncoder || state.textEncoder === "none") { const st=cfg.selected_text_encoder||""; if(st&&te.includes(st)){state.textEncoder=st; clipSel?.setValue(st);} }
    if (!state.vae         || state.vae         === "none") { const sv=cfg.selected_vae||""; if(sv&&vaes.includes(sv)){state.vae=sv; vaeSel?.setValue(sv);} }
    ctx.persist?.();
  }

  rebuildModels({ diffusion_models: [], text_encoders: [], vaes: [] });

  const refreshBtn = button("↻ Refresh Models", async () => {
    refreshBtn.textContent = "Loading…";
    try {
      const d = await getModels();
      rebuildModels(d);
      ctx.availableLoras = d.loras || [];
      ctx._rerenderLoras?.();
      ctx._rebuildLightning?.(d.loras || []);
      ctx._rebuildAngleLora?.(d.loras || []);
    } finally { refreshBtn.textContent = "↻ Refresh Models"; }
  });
  const modelNote = el("div", { style: { fontSize: "10px", color: C.muted, marginTop: "-4px" } });
  modelNote.innerHTML = "Model → <code>models/diffusion_models/</code> · Text Encoder → <code>models/text_encoders/</code> · VAE → <code>models/vae/</code>";

  ov.appendChild(panel([
    el("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } }, [
      row([modelWrap, clipWrap, vaeWrap]),
      modelNote,
      refreshBtn,
    ])
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

  // ── Lightning LoRA ────────────────────────────────────────────────────────
  const lightningWrap = el("div");
  function rebuildLightning(loras) {
    while (lightningWrap.firstChild) lightningWrap.removeChild(lightningWrap.firstChild);
    const ll = state.lightningLora || { name:"none", strength:1, enabled:false };
    const opts = ["none", ...(loras||[])];
    const llSel = searchableSelect(opts, ll.name||"none", v=>{ll.name=v; state.lightningLora=ll; ctx.persist?.();});
    const strIn = el("input",{type:"number",step:"0.05",min:"0",max:"2",style:{width:"60px",background:C.bg2,color:C.text,border:`1px solid ${C.border}`,borderRadius:"4px",padding:"4px",fontSize:"12px",fontFamily:"inherit",outline:"none"}});
    strIn.value = ll.strength??1;
    strIn.addEventListener("input",()=>{const v=parseFloat(strIn.value);ll.strength=isNaN(v)?1:v;ctx.persist?.();});
    const onBtn = el("button",{type:"button",text:ll.enabled?"ON":"OFF",style:{cursor:"pointer",fontFamily:"inherit",fontSize:"10px",padding:"3px 8px",borderRadius:"10px",border:"none",background:ll.enabled?BRAND:"#444",color:"#fff",fontWeight:"700"}});
    onBtn.addEventListener("click",()=>{
      ll.enabled=!ll.enabled; state.lightningLora=ll;
      // Auto-set Steps/CFG defaults based on Lightning LoRA state
      if (ll.enabled) { state.steps=8;  state.cfg=1; }
      else            { state.steps=20; state.cfg=4; }
      ctx.persist?.();
      onBtn.textContent=ll.enabled?"ON":"OFF"; onBtn.style.background=ll.enabled?BRAND:"#444";
      ctx._onLightningChange?.(ll.enabled);
    });
    lightningWrap.appendChild(el("div",{style:{display:"flex",flexDirection:"column",gap:"6px"}},[
      label("Lightning LoRA (optional 4-step speed)"),
      llSel.el,
      row([el("span",{text:"Strength:",style:{fontSize:"11px",color:C.muted,flexShrink:"0"}}), strIn, onBtn]),
      el("div",{style:{fontSize:"10px",color:C.muted,lineHeight:"1.4"},text:"Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16 · steps=4, cfg=1.0"}),
    ]));
  }
  rebuildLightning([]);
  ctx._rebuildLightning = rebuildLightning;
  ov.appendChild(panel([lightningWrap]));

  // ── Camera Angle LoRA ──────────────────────────────────────────────────────
  const angleLoraWrap = el("div");
  function rebuildAngleLora(loras) {
    while (angleLoraWrap.firstChild) angleLoraWrap.removeChild(angleLoraWrap.firstChild);
    if (!state.angleLora) state.angleLora = { name:"none", strength:1, enabled:true };
    const al = state.angleLora;
    const opts = ["none", ...(loras||[])];
    const alSel = searchableSelect(opts, al.name||"none", v=>{al.name=v; state.angleLora=al; ctx.persist?.();});
    const strIn = el("input",{type:"number",step:"0.05",min:"0",max:"2",style:{width:"60px",background:C.bg2,color:C.text,border:`1px solid ${C.border}`,borderRadius:"4px",padding:"4px",fontSize:"12px",fontFamily:"inherit",outline:"none"}});
    strIn.value = al.strength??1;
    strIn.addEventListener("input",()=>{const v=parseFloat(strIn.value);al.strength=isNaN(v)?1:v;ctx.persist?.();});
    const onBtn = el("button",{type:"button",text:al.enabled?"ON":"OFF",style:{cursor:"pointer",fontFamily:"inherit",fontSize:"10px",padding:"3px 8px",borderRadius:"10px",border:"none",background:al.enabled?BRAND:"#444",color:"#fff",fontWeight:"700"}});
    onBtn.addEventListener("click",()=>{al.enabled=!al.enabled;state.angleLora=al;ctx.persist?.();onBtn.textContent=al.enabled?"ON":"OFF";onBtn.style.background=al.enabled?BRAND:"#444";});
    angleLoraWrap.appendChild(el("div",{style:{display:"flex",flexDirection:"column",gap:"6px"}},[
      label("Camera Angle LoRA (optional — applied in ANGLE mode)"),
      alSel.el,
      row([el("span",{text:"Strength:",style:{fontSize:"11px",color:C.muted,flexShrink:"0"}}), strIn, onBtn]),
      el("div",{style:{fontSize:"10px",color:C.muted,lineHeight:"1.4"},text:"Select a LoRA trained for camera angle control. Saved here and auto-applied when ANGLE mode generates."}),
    ]));
  }
  rebuildAngleLora([]);
  ctx._rebuildAngleLora = rebuildAngleLora;
  ov.appendChild(panel([angleLoraWrap]));

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
    ctx.persist?.();
    saveConfig({
      save_subfolder:        state.saveSubfolder    || "",
      output_mode_visible:   visChk.checked,
      selected_model:        state.model            || "",
      selected_text_encoder: state.textEncoder      || "",
      selected_vae:          state.vae              || "",
      negative_prompt:       state.negativePrompt   || "",
      prompt_suffix:         state.promptSuffix     || "",
    });
    saveAllBtn.textContent = "✓ Saved!";
    setTimeout(() => { saveAllBtn.textContent = "💾 Save All"; }, 1500);
  }

  // Initial load
  getConfig().then(cfg => {
    if (cfg.negative_prompt && !state.negativePrompt) { state.negativePrompt = cfg.negative_prompt; negTA.value = cfg.negative_prompt; }
    if (cfg.prompt_suffix   && !state.promptSuffix)   { state.promptSuffix   = cfg.prompt_suffix;   suffixIn.value = cfg.prompt_suffix; }
    if (cfg.save_subfolder  && !state.saveSubfolder)  pathIn.placeholder = cfg.save_subfolder;
    visChk.checked = cfg.output_mode_visible !== false;
    if (ctx.appConfig) ctx.appConfig.output_mode_visible = visChk.checked;
    ctx._refreshToggle?.(); ctx.renderToggle?.();
    return getModels().then(d => {
      rebuildModels(d);
      ctx.availableLoras = d.loras || [];
      ctx._rerenderLoras?.();
      ctx._rerenderAngleLora?.();
      ctx._rebuildLightning?.(d.loras || []);
      ctx._rebuildAngleLora?.(d.loras || []);
      applyConfigModels(cfg, d);
    });
  }).catch(() => {});

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

  return {
    el: ov,
    show() { ov.style.display = "flex"; },
    hide() { ov.style.display = "none"; },
  };
}

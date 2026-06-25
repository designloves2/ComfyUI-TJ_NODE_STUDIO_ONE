// ui_app_settings.js — Settings overlay (model save/load + all settings)
import { C, el, clear } from "./core.js";
import { panel, label, button, row, col } from "./ui_common.js";
import { getModels, getConfig, saveConfig } from "./api.js";
import { t, getLang, setLang } from "../shared/i18n.js";

function searchableSelect(options, value, onChange) {
  const wrap = el("div",{style:{display:"flex",flexDirection:"column",gap:"2px"}});
  const search = el("input",{type:"text",placeholder:"Search…",style:{
    width:"100%",boxSizing:"border-box",background:C.bg2,color:C.text,
    border:`1px solid ${C.border}`,borderRadius:"6px",padding:"5px 7px",
    fontSize:"11px",fontFamily:"inherit",outline:"none",
  }});
  const sel = el("select",{style:{
    width:"100%",boxSizing:"border-box",background:C.bg2,color:C.text,
    border:`1px solid ${C.border}`,borderRadius:"6px",padding:"6px",
    fontSize:"12px",fontFamily:"inherit",outline:"none",
  },onchange:e=>onChange(e.target.value)},
  options.map(opt=>{
    const v=typeof opt==="string"?opt:opt.value;
    const t=typeof opt==="string"?opt:opt.label;
    return el("option",{value:v,text:t,...(v===value?{selected:"selected"}:{})});
  }));
  search.addEventListener("input",()=>{
    const q=search.value.toLowerCase().trim();
    Array.from(sel.options).forEach(o=>{o.hidden=q&&!o.text.toLowerCase().includes(q);});
    const cur=Array.from(sel.options).find(o=>o.value===sel.value);
    if(cur) cur.hidden=false;
  });
  wrap.appendChild(search); wrap.appendChild(sel);
  return { el:wrap, getValue(){return sel.value;}, setValue(v){sel.value=v;} };
}

export function createSettingsOverlay(state, ctx) {
  const ov = el("div",{style:{
    position:"absolute",inset:"0",zIndex:"9998",
    background:"rgba(11,11,11,0.97)",borderRadius:"inherit",
    display:"none",flexDirection:"column",padding:"12px",gap:"8px",
    boxSizing:"border-box",overflowY:"auto",
  }});

  const topRow=el("div",{style:{display:"flex",alignItems:"center",gap:"8px",flexShrink:"0"}});
  topRow.appendChild(el("div",{text:"⚙ Settings",style:{color:"#ffffff",fontSize:"14px",fontWeight:"700",flex:"1"}}));
  const saveAllBtn=button("💾 Save All",()=>saveAll(),"primary");
  const closeBtn  =button("✕",()=>{ov.style.display="none";},"danger");
  topRow.appendChild(saveAllBtn); topRow.appendChild(closeBtn);
  ov.appendChild(topRow);

  // Model dropdowns
  const modelWrap=el("div"), teWrap=el("div"), vaeWrap=el("div");
  let modelSel, teSel, vaeSel;
  let allModels = null; // cache

  function rebuildModels(data) {
    clear(modelWrap); clear(teWrap); clear(vaeWrap);
    allModels = data;
    const diff = ["none",...(data.diffusion_models||[])];
    const te   = ["none",...(data.text_encoders||[])];
    const vaes = ["none",...(data.vaes||[])];

    // 실제 목록이 있을 때만 검증 (초기 빈 리스트 호출 시 state 덮어쓰기 방지)
    if (data.diffusion_models?.length && !diff.includes(state.model))     state.model       = diff[0];
    if (data.text_encoders?.length    && !te.includes(state.textEncoder)) state.textEncoder = te[0];
    if (data.vaes?.length             && !vaes.includes(state.vae))       state.vae         = vaes[0];

    modelSel = searchableSelect(diff, state.model,       v=>{state.model=v;ctx.persist();});
    teSel    = searchableSelect(te,   state.textEncoder, v=>{state.textEncoder=v;ctx.persist();});
    vaeSel   = searchableSelect(vaes, state.vae,         v=>{state.vae=v;ctx.persist();});
    modelWrap.appendChild(col([label("Diffusion Model"), modelSel.el]));
    teWrap.appendChild(col([label("Text Encoder"),       teSel.el]));
    vaeWrap.appendChild(col([label("VAE"),               vaeSel.el]));
  }

  function applyConfigModels(cfg, data) {
    if (!data) return;
    const diff = ["none",...(data.diffusion_models||[])];
    const te   = ["none",...(data.text_encoders||[])];
    const vaes = ["none",...(data.vaes||[])];
    const sm = cfg.selected_model       || "";
    const st = cfg.selected_text_encoder|| "";
    const sv = cfg.selected_vae         || "";
    // config 모델은 state 모델이 비어있을 때만 적용 (로컬 저장 state 우선)
    if (!state.model       || state.model       === "none") { if (sm && diff.includes(sm)) { state.model=sm; modelSel?.setValue(sm); } }
    if (!state.textEncoder || state.textEncoder === "none") { if (st && te.includes(st))   { state.textEncoder=st; teSel?.setValue(st); } }
    if (!state.vae         || state.vae         === "none") { if (sv && vaes.includes(sv)) { state.vae=sv; vaeSel?.setValue(sv); } }
    ctx.persist();
  }

  rebuildModels({diffusion_models:[],text_encoders:[],vaes:[]});

  const refreshBtn=button("↻ Refresh Models",async()=>{
    refreshBtn.textContent="Loading…";
    try{const d=await getModels();rebuildModels(d);ctx.availableLoras=d.loras||[];ctx._rerenderLoras?.();}
    finally{refreshBtn.textContent="↻ Refresh Models";}
  });
  ov.appendChild(panel([el("div",{style:{display:"flex",flexDirection:"column",gap:"8px"}},[row([modelWrap,teWrap,vaeWrap]),refreshBtn])]));

  // Language selector
  const langSel = el("select", { style: {
    background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
    borderRadius: "6px", padding: "5px 8px", fontSize: "12px", fontFamily: "inherit", outline: "none",
  }, onchange: e => { setLang(e.target.value); window.location.reload(); }});
  ["ko","en"].forEach(code => {
    const opt = el("option", { value: code, text: code === "ko" ? "한국어" : "English" });
    if (getLang() === code) opt.selected = true;
    langSel.appendChild(opt);
  });
  ov.appendChild(panel([
    label(t("lang_label")),
    langSel,
    el("div", { style: { fontSize:"11px", color:"#888", marginTop:"4px" }, text: t("lang_reload_note") }),
  ]));

  // Negative prompt
  const negTA=el("textarea",{placeholder:"Negative prompt…",style:{
    width:"100%",boxSizing:"border-box",background:C.bg2,color:C.text,
    border:`1px solid ${C.border}`,borderRadius:"6px",padding:"7px",
    fontSize:"12px",fontFamily:"inherit",resize:"vertical",outline:"none",minHeight:"60px",
  }});
  negTA.value=state.negativePrompt||"";
  negTA.addEventListener("input",()=>{state.negativePrompt=negTA.value;});
  ov.appendChild(panel([label("Negative Prompt"),negTA]));

  // Prompt suffix
  const suffixIn=el("input",{type:"text",placeholder:"e.g. high quality, sharp focus",style:{
    width:"100%",boxSizing:"border-box",background:C.bg2,color:C.text,
    border:`1px solid ${C.border}`,borderRadius:"6px",padding:"7px",fontSize:"12px",fontFamily:"inherit",
  }});
  suffixIn.value=state.promptSuffix||"";
  suffixIn.addEventListener("input",()=>{state.promptSuffix=suffixIn.value;});
  ov.appendChild(panel([label("Prompt Suffix (auto-appended for quality boost)"),suffixIn]));

  // Save path + toggle visibility
  const pathIn=el("input",{type:"text",placeholder:"z-image-one-tj",style:{
    width:"100%",boxSizing:"border-box",background:C.bg2,color:C.text,
    border:`1px solid ${C.border}`,borderRadius:"6px",padding:"7px",fontSize:"12px",fontFamily:"inherit",
  }});
  pathIn.value=state.saveSubfolder||"";
  pathIn.addEventListener("input",()=>{state.saveSubfolder=pathIn.value.trim();});

  const visChk=el("input",{type:"checkbox"});
  visChk.checked=ctx.appConfig?.output_mode_visible!==false;
  const visLbl=el("label",{style:{display:"flex",alignItems:"center",gap:"6px",fontSize:"12px",color:C.text}},
    [visChk,el("span",{text:"Show Save / Preview toggle in main view"})]);
  visChk.addEventListener("change",()=>{
    if(ctx.appConfig) ctx.appConfig.output_mode_visible=visChk.checked;
    ctx._refreshToggle?.(); ctx.renderToggle?.();
  });
  ov.appendChild(panel([label("Save Folder (inside ComfyUI output/)"),pathIn,visLbl]));

  // Model Override 토글
  const ovChk=el("input",{type:"checkbox"});
  ovChk.checked=state.useModelOverride||false;
  ovChk.addEventListener("change",()=>{state.useModelOverride=ovChk.checked;ctx.persist();ctx.syncOverrideSlots?.(ovChk.checked);});
  const ovLbl=el("label",{style:{display:"flex",alignItems:"center",gap:"6px",fontSize:"12px",color:C.text}},
    [ovChk,el("span",{text:t("model_override_toggle")})]);
  ov.appendChild(panel([label(t("model_override_slot")),ovLbl,
    el("div",{style:{fontSize:"11px",color:"#888",marginTop:"4px"},text:t("model_override_desc")})]));

  function saveAll() {
    ctx.persist();
    saveConfig({
      save_subfolder:       state.saveSubfolder||"",
      output_mode_visible:  visChk.checked,
      selected_model:       state.model||"",
      selected_text_encoder:state.textEncoder||"",
      selected_vae:         state.vae||"",
      negative_prompt:      state.negativePrompt||"",
      prompt_suffix:        state.promptSuffix||"",
    });
    saveAllBtn.textContent="✓ Saved!";
    setTimeout(()=>{saveAllBtn.textContent="💾 Save All";},1500);
  }

  // Initial load: get config first, then models, then apply saved selections
  getConfig().then(cfg=>{
    // Apply non-model settings
    if(cfg.negative_prompt && !state.negativePrompt){state.negativePrompt=cfg.negative_prompt;negTA.value=cfg.negative_prompt;}
    if(cfg.prompt_suffix   && !state.promptSuffix)  {state.promptSuffix=cfg.prompt_suffix;suffixIn.value=cfg.prompt_suffix;}
    if(cfg.save_subfolder  && !state.saveSubfolder)  pathIn.placeholder=cfg.save_subfolder;
    visChk.checked=cfg.output_mode_visible!==false;
    if(ctx.appConfig) ctx.appConfig.output_mode_visible=visChk.checked;
    ctx._refreshToggle?.(); ctx.renderToggle?.();

    // Load models, then apply saved model selections
    return getModels().then(d=>{
      rebuildModels(d);
      ctx.availableLoras=d.loras||[];
      ctx._rerenderLoras?.();
      applyConfigModels(cfg, d);
    });
  }).catch(()=>{});

  return {
    el:ov,
    show(){ov.style.display="flex";},
    hide(){ov.style.display="none";},
  };
}

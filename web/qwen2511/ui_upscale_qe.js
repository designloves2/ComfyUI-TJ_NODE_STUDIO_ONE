// ui_upscale_qe.js — SeedVR2 Upscale panel for Qwen Image Edit 2511 ONE (TJ)
import { C, el, clear } from "./core_qwen2511.js";
import { panel, label, button, row, col } from "./ui_common_qe.js";
import { buildUpscaleGraph } from "./graph_builder_qwen2511.js";
import { uploadImage, getSeedVR2Models } from "./api_qwen2511.js";

function searchableSelect(options, value, onChange) {
  const wrap = el("div", { style:{ display:"flex", flexDirection:"column", gap:"2px" }});
  const search = el("input",{type:"text",placeholder:"Search…",style:{ width:"100%",boxSizing:"border-box",background:C.bg2,color:C.text,border:`1px solid ${C.border}`,borderRadius:"6px 6px 0 0",padding:"4px 7px",fontSize:"11px",fontFamily:"inherit",outline:"none" }});
  const sel = el("select",{style:{ width:"100%",boxSizing:"border-box",background:C.bg2,color:C.text,border:`1px solid ${C.border}`,borderTopWidth:"0",borderRadius:"0 0 6px 6px",padding:"5px",fontSize:"11px",fontFamily:"inherit",outline:"none" }});
  let current = value;
  function build(filter) {
    const q = filter.toLowerCase();
    sel.replaceChildren(...options.filter(o=>!q||o.toLowerCase().includes(q)).map(o=>el("option",{value:o,text:o,...(o===current?{selected:"selected"}:{})})));
    if (options.includes(current)) sel.value=current; else if(options.length) sel.value=options[0];
  }
  build("");
  sel.addEventListener("change", e=>{ current=e.target.value; onChange(e.target.value); });
  search.addEventListener("input", ()=>{ const prev=sel.value; build(search.value); if([...sel.options].find(o=>o.value===prev)) sel.value=prev; });
  wrap.appendChild(search); wrap.appendChild(sel);
  return { el: wrap, getValue(){return sel.value;}, setValue(v){current=v;sel.value=v;} };
}

function createImgUpload(labelText, initialFile, onUpload) {
  const BOX = 192;
  const wrap = el("div",{style:{display:"flex",flexDirection:"column",gap:"4px",alignItems:"center"}});
  const box  = el("div",{style:{width:`${BOX}px`,height:`${BOX}px`,background:"#000",borderRadius:"10px",border:`1px solid ${C.border}`,position:"relative",cursor:"pointer",flexShrink:"0",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}});
  const hint = el("div",{text:`${labelText}\nClick to upload`,style:{color:C.muted,fontSize:"12px",textAlign:"center",whiteSpace:"pre",pointerEvents:"none"}});
  const img  = el("img",{style:{position:"absolute",inset:"0",width:"100%",height:"100%",objectFit:"contain",pointerEvents:"none",display:"none"}});
  function setFilename(name){if(name){img.src=`/view?filename=${encodeURIComponent(name)}&type=input&t=${Date.now()}`;img.style.display="block";hint.style.display="none";}else{img.style.display="none";hint.style.display="";}}
  box.appendChild(hint); box.appendChild(img); wrap.appendChild(box);
  const inp = el("input",{type:"file",accept:"image/*",style:{display:"none"}}); wrap.appendChild(inp);
  inp.addEventListener("change", async()=>{if(inp.files[0]){const n=await onUpload(inp.files[0]);setFilename(n);inp.value="";}});
  box.addEventListener("click",()=>inp.click());
  box.addEventListener("dragover",e=>{e.preventDefault();box.style.borderColor=C.brand;});
  box.addEventListener("dragleave",()=>{box.style.borderColor=C.border;});
  box.addEventListener("drop",async e=>{e.preventDefault();box.style.borderColor=C.border;const f=e.dataTransfer.files[0];if(f){const n=await onUpload(f);setFilename(n);}});
  setFilename(initialFile);
  return {el:wrap, setFilename};
}

export function mountUpscaleLeft(leftEl, state, ctx) {
  const wrap = el("div", { style:{ display:"flex", flexDirection:"column", gap:"6px" }});
  leftEl.appendChild(wrap);

  const { el: imgEl, setFilename } = createImgUpload("Source Image", state.upscaleImage||null, async f=>{
    const n=await uploadImage(f); state.upscaleImage=n; ctx.persist(); return n;
  });
  wrap.appendChild(panel([label("Source Image"), imgEl]));

  const ditWrap = el("div"), vaeWrap = el("div");
  let ditSel, vaeSel;
  function buildModelSelects(models) {
    clear(ditWrap); clear(vaeWrap);
    const opts = ["none", ...models.filter(m=>m!=="none")];
    ditSel = searchableSelect(opts, state.upscaleDitModel||"none", v=>{state.upscaleDitModel=v;ctx.persist();});
    vaeSel = searchableSelect(opts, state.upscaleVaeModel||"none", v=>{state.upscaleVaeModel=v;ctx.persist();});
    ditWrap.appendChild(col([label("DiT Model"),ditSel.el]));
    vaeWrap.appendChild(col([label("VAE Model"),vaeSel.el]));
  }
  buildModelSelects(["none"]);

  const refreshBtn = button("↻ Refresh", async()=>{
    refreshBtn.textContent="Loading…"; refreshBtn.disabled=true;
    try { const d=await getSeedVR2Models(); buildModelSelects(d.models||["none"]); }
    finally { refreshBtn.textContent="↻ Refresh"; refreshBtn.disabled=false; }
  });
  wrap.appendChild(panel([el("div",{style:{display:"flex",flexDirection:"column",gap:"6px"}},[
    ditWrap, vaeWrap, refreshBtn,
    el("div",{style:{fontSize:"10px",color:C.muted}},[el("span",{html:"Models → <code>models/SEEDVR2/</code>"})]),
  ])]));

  function numRow(lbl, key, min, max, step, def, tip) {
    const inp = el("input",{type:"number",min,max,step,style:{width:"70px",background:C.bg2,color:C.text,border:`1px solid ${C.border}`,borderRadius:"4px",padding:"4px 6px",fontSize:"12px",fontFamily:"inherit",outline:"none"}});
    inp.value = state[key]??def;
    inp.addEventListener("input",()=>{state[key]=parseFloat(inp.value)||def;ctx.persist();});
    const lblEl = el("div",{text:lbl,style:{flex:"1",fontSize:"12px",color:C.text}});
    if (tip) { lblEl.title=tip; lblEl.style.cursor="help"; lblEl.style.borderBottom=`1px dotted ${C.muted}`; lblEl.style.display="inline-block"; }
    return row([lblEl,inp],"8px");
  }
  function comboRow(lbl, key, options, def) {
    const sel = el("select",{style:{width:"70px",background:C.bg2,color:C.text,border:`1px solid ${C.border}`,borderRadius:"4px",padding:"4px 6px",fontSize:"11px",fontFamily:"inherit",outline:"none"}});
    options.forEach(o=>{const opt=el("option",{value:o,text:o});if((state[key]||def)===o)opt.selected=true;sel.appendChild(opt);});
    sel.addEventListener("change",e=>{state[key]=e.target.value;ctx.persist();});
    return row([el("div",{text:lbl,style:{flex:"1",fontSize:"12px",color:C.text}}),sel],"8px");
  }
  wrap.appendChild(panel([
    label("Upscale Settings"),
    numRow("Resolution (short edge)","upscaleResolution",16,16384,2,2048),
    numRow("Max Resolution","upscaleMaxResolution",0,16384,2,4096),
    numRow("Batch Size","upscaleBatchSize",1,64,4,1),
    numRow("Blocks to Swap","upscaleBlocksToSwap",0,36,1,0,"0=disabled / 3B:0~32 / 7B:0~36"),
    comboRow("Attention Mode","upscaleAttentionMode",["sdpa","flash_attn_2","flash_attn_3","sageattn_2","sageattn_3"],"sdpa"),
    comboRow("Color Correction","upscaleColorCorrection",["lab","wavelet","wavelet_adaptive","hsv","adain","none"],"lab"),
    comboRow("Offload Device","upscaleOffloadDevice",["cpu","cuda:0"],"cpu"),
    numRow("Input Noise Scale","upscaleInputNoiseScale",0,1,0.01,0),
    numRow("Latent Noise Scale","upscaleLatentNoiseScale",0,1,0.01,0),
  ]));

  getSeedVR2Models().then(d=>buildModelSelects(d.models||["none"])).catch(()=>{});

  return {
    beforeGenerate: async () => {
      if (!state.upscaleImage)                                          throw new Error("Upload a source image.");
      if (!state.upscaleDitModel || state.upscaleDitModel==="none")    throw new Error("Select a SeedVR2 DiT model.");
      if (!state.upscaleVaeModel || state.upscaleVaeModel==="none")    throw new Error("Select a SeedVR2 VAE model.");
    },
    async getGraph() { return buildUpscaleGraph(state); },
    getSourceURL() { return state.upscaleImage ? `/view?filename=${encodeURIComponent(state.upscaleImage)}&type=input` : null; },
    setImage(name) { state.upscaleImage=name; setFilename(name); ctx.persist(); },
  };
}

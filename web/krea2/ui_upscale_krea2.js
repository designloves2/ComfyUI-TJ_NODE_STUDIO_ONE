// ui_upscale_krea2.js — SeedVR2 Upscale panel for Krea 2 ONE STUDIO (TJ)
import { C, el, clear, BRAND, SEEDVR2_ATTN_MODES, SEEDVR2_COLOR_MODES } from "./core_krea2.js";
import { panel, label, button, select, numberField, row, col } from "../klein/ui_common.js";
import { buildUpscaleGraph } from "./graph_builder_krea2.js";
import { uploadImage, getSeedVR2Models } from "./api_krea2.js";

export function mountUpscaleLeft(leftEl, state, ctx) {
  const wrap = el("div", { style:{ display:"flex", flexDirection:"column", gap:"6px" }});
  leftEl.appendChild(wrap);

  // ── Source image ─────────────────────────────────────────────────────────────
  const BOX = 192;
  const imgBox  = el("div",{style:{width:`${BOX}px`,height:`${BOX}px`,background:"#000",borderRadius:"10px",border:`1px solid ${C.border}`,position:"relative",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}});
  const hint    = el("div",{text:"Source Image\nClick to upload",style:{color:C.muted,fontSize:"12px",textAlign:"center",whiteSpace:"pre",pointerEvents:"none"}});
  const imgEl   = el("img",{style:{position:"absolute",inset:"0",width:"100%",height:"100%",objectFit:"contain",pointerEvents:"none",display:"none"}});
  function setFilename(name){if(name){imgEl.src=`/view?filename=${encodeURIComponent(name)}&type=input&t=${Date.now()}`;imgEl.style.display="block";hint.style.display="none";}else{imgEl.style.display="none";hint.style.display="";}}
  imgBox.appendChild(hint); imgBox.appendChild(imgEl);
  const fi = el("input",{type:"file",accept:"image/*",style:{display:"none"}});
  fi.addEventListener("change", async()=>{if(fi.files[0]){const n=await uploadImage(fi.files[0]);state.upscaleImage=n;setFilename(n);ctx.persist();fi.value="";}});
  imgBox.addEventListener("click",()=>fi.click());
  imgBox.addEventListener("dragover",e=>{e.preventDefault();imgBox.style.borderColor=BRAND;});
  imgBox.addEventListener("dragleave",()=>{imgBox.style.borderColor=C.border;});
  imgBox.addEventListener("drop",async e=>{e.preventDefault();imgBox.style.borderColor=C.border;const f=e.dataTransfer.files[0];if(f){const n=await uploadImage(f);state.upscaleImage=n;setFilename(n);ctx.persist();}});
  wrap.appendChild(el("div",{style:{display:"none"}},[fi]));
  const imgBoxCenter = el("div",{style:{display:"flex",justifyContent:"center"}},[imgBox]);
  wrap.appendChild(panel([label("Source Image"), imgBoxCenter]));
  setFilename(state.upscaleImage||null);

  // ── Model selects ─────────────────────────────────────────────────────────────
  const ditWrap = el("div"), vaeWrap = el("div");
  let ditSel, vaeSel;

  function buildModelSelects(models) {
    clear(ditWrap); clear(vaeWrap);
    const opts = ["none", ...models.filter(m=>m!=="none")];
    ditSel = makeSearchSel(opts, state.upscaleDitModel||"none", v=>{state.upscaleDitModel=v;ctx.persist();});
    vaeSel = makeSearchSel(opts, state.upscaleVaeModel||"none", v=>{state.upscaleVaeModel=v;ctx.persist();});
    ditWrap.appendChild(col([label("DiT Model"), ditSel.el]));
    vaeWrap.appendChild(col([label("VAE Model"), vaeSel.el]));
  }

  function makeSearchSel(options, value, onChange) {
    const w = el("div",{style:{display:"flex",flexDirection:"column",gap:"2px"}});
    const s = el("input",{type:"text",placeholder:"Search…",style:{width:"100%",boxSizing:"border-box",background:C.bg2,color:C.text,border:`1px solid ${C.border}`,borderRadius:"6px",padding:"4px 7px",fontSize:"11px",fontFamily:"inherit",outline:"none"}});
    const d = el("select",{style:{width:"100%",boxSizing:"border-box",background:C.bg2,color:C.text,border:`1px solid ${C.border}`,borderRadius:"6px",padding:"5px",fontSize:"11px",fontFamily:"inherit",outline:"none"}});
    let cur=value;
    function build(filter){const q=filter.toLowerCase();d.replaceChildren(...options.filter(o=>!q||o.toLowerCase().includes(q)).map(o=>el("option",{value:o,text:o,...(o===cur?{selected:"selected"}:{})})));if(options.includes(cur))d.value=cur;}
    build("");
    d.addEventListener("change",e=>{cur=e.target.value;onChange(e.target.value);});
    s.addEventListener("input",()=>{build(s.value);});
    w.appendChild(s); w.appendChild(d);
    return {el:w,getValue(){return d.value;},setValue(v){cur=v;d.value=v;}};
  }

  buildModelSelects(["none"]);
  const refreshBtn = button("↻ Refresh", async()=>{
    refreshBtn.textContent="Loading…"; refreshBtn.disabled=true;
    try{const d=await getSeedVR2Models();buildModelSelects(d.models||["none"]);}
    finally{refreshBtn.textContent="↻ Refresh";refreshBtn.disabled=false;}
  });
  const modelNote = el("div",{style:{fontSize:"10px",color:C.muted}});
  modelNote.innerHTML="Models → <code>models/SEEDVR2/</code>";
  wrap.appendChild(panel([el("div",{style:{display:"flex",flexDirection:"column",gap:"6px"}},[ditWrap,vaeWrap,refreshBtn,modelNote])]));

  // ── Settings ──────────────────────────────────────────────────────────────────
  function numRow(lbl, key, min, max, step, def) {
    const inp = el("input",{type:"number",min,max,step,style:{width:"72px",background:C.bg2,color:C.text,border:`1px solid ${C.border}`,borderRadius:"4px",padding:"4px 6px",fontSize:"12px",fontFamily:"inherit",outline:"none"}});
    inp.value = state[key]??def;
    inp.addEventListener("input",()=>{state[key]=parseFloat(inp.value)||def;ctx.persist();});
    return row([el("div",{text:lbl,style:{flex:"1",fontSize:"12px",color:C.text}}),inp],"8px");
  }
  function comboRow(lbl, key, options, def) {
    const s = select(options.map(o=>({value:o,label:o})),state[key]||def,v=>{state[key]=v;ctx.persist();});
    s.style.width="72px";
    return row([el("div",{text:lbl,style:{flex:"1",fontSize:"12px",color:C.text}}),s],"8px");
  }

  wrap.appendChild(panel([
    label("Upscale Settings"),
    numRow("Resolution (short edge)",  "upscaleResolution",    16, 16384, 2,    2048),
    numRow("Max Resolution",           "upscaleMaxResolution", 0,  16384, 2,    4096),
    numRow("Batch Size (4n+1)",        "upscaleBatchSize",     1,  64,    4,    1),
    numRow("Blocks to Swap",           "upscaleBlocksToSwap",  0,  36,    1,    0),
    comboRow("Attention Mode",   "upscaleAttentionMode",   SEEDVR2_ATTN_MODES,  "sdpa"),
    comboRow("Color Correction", "upscaleColorCorrection", SEEDVR2_COLOR_MODES, "lab"),
    comboRow("Offload Device",   "upscaleOffloadDevice",   ["cpu","cuda:0"],     "cpu"),
    numRow("Input Noise Scale",  "upscaleInputNoiseScale",  0, 1, 0.01, 0),
    numRow("Latent Noise Scale", "upscaleLatentNoiseScale", 0, 1, 0.01, 0),
  ]));

  getSeedVR2Models().then(d=>buildModelSelects(d.models||["none"])).catch(()=>{});

  return {
    beforeGenerate: async() => {
      if (!state.upscaleImage)                                         throw new Error("Upload a source image.");
      if (!state.upscaleDitModel||state.upscaleDitModel==="none")     throw new Error("Select a SeedVR2 DiT model.");
      if (!state.upscaleVaeModel||state.upscaleVaeModel==="none")     throw new Error("Select a SeedVR2 VAE model.");
    },
    async getGraph() { return buildUpscaleGraph(state); },
    getSourceURL() { return state.upscaleImage ? `/view?filename=${encodeURIComponent(state.upscaleImage)}&type=input` : null; },
    setImage(name) { state.upscaleImage=name; setFilename(name); ctx.persist(); },
  };
}

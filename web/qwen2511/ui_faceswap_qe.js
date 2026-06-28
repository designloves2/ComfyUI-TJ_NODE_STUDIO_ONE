// ui_faceswap_qe.js — Faceswap left panel for Qwen Image Edit 2511 ONE (TJ)
import { C, el } from "./core_qwen2511.js";
import { panel, label, slider, numberField, select, row, col, button } from "./ui_common_qe.js";
import { buildFaceswapGraph } from "./graph_builder_qwen2511.js";
import { uploadImage } from "./api_qwen2511.js";

function createImgUpload(labelText, initialFile, onUpload) {
  const BOX = 192;
  const wrap = el("div", { style:{ display:"flex", flexDirection:"column", gap:"4px", alignItems:"center" }});
  const box  = el("div", { style:{ width:`${BOX}px`, height:`${BOX}px`, background:"#000", borderRadius:"10px", border:`1px solid ${C.border}`, position:"relative", cursor:"pointer", flexShrink:"0", display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden" }});
  const hint = el("div", { text:`${labelText}\nClick to upload`, style:{ color:C.muted, fontSize:"12px", textAlign:"center", whiteSpace:"pre", pointerEvents:"none" }});
  const img  = el("img", { style:{ position:"absolute", inset:"0", width:"100%", height:"100%", objectFit:"contain", pointerEvents:"none", display:"none" }});
  function setFilename(name) { if(name){img.src=`/view?filename=${encodeURIComponent(name)}&type=input&t=${Date.now()}`;img.style.display="block";hint.style.display="none";}else{img.style.display="none";hint.style.display="";} }
  box.appendChild(hint); box.appendChild(img); wrap.appendChild(box);
  const inp = el("input", { type:"file", accept:"image/*", style:{ display:"none" }}); wrap.appendChild(inp);
  inp.addEventListener("change", async ()=>{ if(inp.files[0]){ const n=await onUpload(inp.files[0]); setFilename(n); inp.value=""; }});
  box.addEventListener("click", ()=>inp.click());
  box.addEventListener("dragover", e=>{e.preventDefault();box.style.borderColor=C.brand;});
  box.addEventListener("dragleave", ()=>{box.style.borderColor=C.border;});
  box.addEventListener("drop", async e=>{e.preventDefault();box.style.borderColor=C.border;const f=e.dataTransfer.files[0];if(f){const n=await onUpload(f);setFilename(n);}});
  setFilename(initialFile);
  return { el: wrap, setFilename };
}

function mountBfsLoraSection(leftEl, state, ctx) {
  const wrap = el("div"); leftEl.appendChild(wrap);
  const avail = () => ctx.availableLoras || ["none"];
  function render() {
    wrap.replaceChildren();
    const lora = state.bfsLora;
    const addBtn = !lora
      ? el("button", { type:"button", text:"+ BFS LoRA", style:{ cursor:"pointer", background:C.bg2, color:C.text, border:`1px solid ${C.border}`, borderRadius:"6px", padding:"6px 12px", fontSize:"12px", fontFamily:"inherit" }, onclick: ()=>{ state.bfsLora={name:"none",strength:1,enabled:true}; ctx.persist(); render(); ctx.resizeNode?.(); }})
      : null;
    const item = lora ? (() => {
      const nameOpts = ["none", ...avail().filter(n=>n!=="none")];
      const sel = el("select", { style:{ flex:"1", background:C.bg2, color:C.text, border:`1px solid ${C.border}`, borderRadius:"6px", padding:"4px", fontSize:"11px", fontFamily:"inherit", outline:"none" }, onchange: e=>{ lora.name=e.target.value; ctx.persist(); }}, nameOpts.map(n=>el("option",{value:n,text:n,...(n===(lora.name||"none")?{selected:"selected"}:{})})));
      const strIn = el("input",{type:"number",step:"0.05",min:"0",max:"2",style:{ width:"50px",background:C.bg2,color:C.text,border:`1px solid ${C.border}`,borderRadius:"4px",padding:"4px",fontSize:"12px",fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}); strIn.value=lora.strength??1; strIn.addEventListener("input",()=>{const v=parseFloat(strIn.value);lora.strength=isNaN(v)?1:v;ctx.persist();});
      const tog = el("button",{type:"button",text:lora.enabled!==false?"ON":"OFF",style:{ cursor:"pointer",fontFamily:"inherit",fontSize:"10px",padding:"3px 6px",borderRadius:"10px",border:"none",background:lora.enabled!==false?C.brand:"#444",color:"#fff",fontWeight:"700"},onclick:()=>{lora.enabled=lora.enabled===false;ctx.persist();render();}});
      const del = el("button",{type:"button",text:"✕",style:{ cursor:"pointer",fontFamily:"inherit",fontSize:"11px",background:"transparent",color:C.err,border:"none",padding:"2px 4px"},onclick:()=>{state.bfsLora=null;ctx.persist();render();ctx.resizeNode?.();}});
      return el("div",{style:{display:"flex",flexDirection:"column",gap:"3px",padding:"5px",background:C.bg2,borderRadius:"6px",border:`1px solid ${C.border}`}},[
        el("div",{style:{display:"flex",gap:"4px",alignItems:"center"}},[sel,strIn,tog,del]),
      ]);
    })() : null;
    const children = [el("div",{text:"BFS LoRA",style:{color:C.muted,fontSize:"11px",marginBottom:"3px",textTransform:"uppercase",letterSpacing:"0.04em"}})];
    if (item) children.push(item);
    if (addBtn) children.push(addBtn);
    wrap.appendChild(el("div",{style:{background:C.bg1,border:`1px solid ${C.border}`,borderRadius:"8px",padding:"10px",marginBottom:"6px"}},children));
    ctx.resizeNode?.();
  }
  render();
}

export function mountFaceswapLeft(leftEl, state, ctx) {
  const wrap = el("div", { style:{ display:"flex", flexDirection:"column", gap:"6px" }});
  leftEl.appendChild(wrap);

  const { el: targetEl, setFilename: setTargetFn } = createImgUpload("Target Image (scene)", state.faceswapTarget||null, async f=>{ const n=await uploadImage(f); state.faceswapTarget=n; ctx.persist(); return n; });
  wrap.appendChild(panel([label("Target Image (scene)"), targetEl]));

  const { el: sourceEl, setFilename: setSourceFn } = createImgUpload("Source Face", state.faceswapSource||null, async f=>{ const n=await uploadImage(f); state.faceswapSource=n; ctx.persist(); return n; });
  wrap.appendChild(panel([label("Source Face"), sourceEl]));

  wrap.appendChild(panel([
    label("Denoise"),
    slider(0, 1, 0.01, state.faceswapDenoise??1.0, v=>{state.faceswapDenoise=v;ctx.persist();}, v=>v.toFixed(2)),
  ]));
  wrap.appendChild(panel([
    row([
      col([label("Steps"), numberField(state.steps??20, v=>{state.steps=v;ctx.persist();}, 1)]),
      col([label("CFG"),   numberField(state.cfg??4,    v=>{state.cfg=v;ctx.persist();},   0.1)]),
    ]),
    row([
      col([label("Sampler"),   select(["euler","euler_ancestral","er_sde","heun","dpm_pp_2m"], state.sampler||"euler",   v=>{state.sampler=v;ctx.persist();})]),
      col([label("Scheduler"), select(["simple","normal","karras","sgm_uniform","beta"],        state.scheduler||"simple", v=>{state.scheduler=v;ctx.persist();})]),
    ]),
  ]));

  wrap.appendChild(el("div", { text:"⚠ BFS LoRA is required for faceswap. Assign the BFS LoRA below.", style:{ color:"#FFD700", fontSize:"11px", fontWeight:"600", padding:"6px 8px", background:"rgba(255,215,0,0.08)", border:"1px solid rgba(255,215,0,0.3)", borderRadius:"6px" }}));
  mountBfsLoraSection(wrap, state, ctx);

  return {
    getSourceURL: () => state.faceswapTarget ? `/view?filename=${encodeURIComponent(state.faceswapTarget)}&type=input` : null,
    async getGraph() { return buildFaceswapGraph(state); },
    setImage(name)  { state.faceswapTarget=name; setTargetFn(name); ctx.persist(); },
    setImage2(name) { state.faceswapSource=name; setSourceFn(name); ctx.persist(); },
  };
}

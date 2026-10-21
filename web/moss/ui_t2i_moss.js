// ui_t2i_moss.js — T2I left panel for Moss Image ONE STUDIO (TJ)
import { C, el, clear, RESOLUTIONS, SAMPLERS, SCHEDULERS } from "./core_moss.js";
import { panel, label, button, select, numberField, row, col, loraSelect } from "../klein/ui_common.js";
import { buildT2IGraph } from "./graph_builder_moss.js";
import { getLoraTriggers } from "./api_moss.js";

// LoRA section (max 3) — mirrors Krea2 ONE STUDIO's mountLoraSectionKrea2 exactly.
export function mountLoraSectionMoss(wrapEl, state, ctx) {
  const loraWrap = el("div");
  wrapEl.appendChild(loraWrap);
  if (!state.loras) state.loras = [];

  function rebuildLoras() {
    clear(loraWrap);
    const loras = state.loras;
    const items = loras.map((lora, i) => {
      const nameOpts = ["none", ...(ctx.availableLoras||[]).filter(n=>n!=="none")];
      const twIn = el("input", { type:"text", placeholder:"Trigger word…", style:{
        width:"100%", boxSizing:"border-box", background:C.bg2, color:C.text,
        border:`1px solid ${C.border}`, borderRadius:"4px", padding:"4px 6px",
        fontSize:"11px", fontFamily:"inherit", outline:"none",
      }});
      twIn.value = lora.triggerWord || "";
      twIn.addEventListener("input", ()=>{ lora.triggerWord=twIn.value; ctx.persist(); });
      const loraSel = loraSelect(nameOpts, lora.name||"none", async v => {
        const prev = lora.name;
        lora.name = v; ctx.persist();
        if (v && v !== "none") {
          if (v !== prev) { lora.triggerWord = ""; twIn.value = ""; }
          if (!lora.triggerWord) {
            twIn.placeholder = "Loading…";
            try { const d = await getLoraTriggers(v); if (d.ok && d.triggers?.length) { lora.triggerWord=d.triggers.join(", "); twIn.value=lora.triggerWord; ctx.persist(); } } catch {}
            twIn.placeholder = "Trigger word…";
          }
        } else { lora.triggerWord = ""; twIn.value = ""; }
      });
      const strInp = el("input", { type:"number", step:"0.05", min:"0", max:"2", style:{
        width:"50px", background:C.bg2, color:C.text, border:`1px solid ${C.border}`,
        borderRadius:"4px", padding:"4px", fontSize:"12px", fontFamily:"inherit", outline:"none", boxSizing:"border-box",
      }});
      strInp.value = lora.strength ?? 1;
      strInp.addEventListener("input", ()=>{ { const v=parseFloat(strInp.value); lora.strength=isNaN(v)?1:v; } ctx.persist(); });
      const tog = el("button", { type:"button", text:lora.enabled!==false?"ON":"OFF", style:{
        cursor:"pointer", fontFamily:"inherit", fontSize:"10px", padding:"3px 6px",
        borderRadius:"10px", border:"none", background:lora.enabled!==false?C.lime:"#444", color:"#fff", fontWeight:"700",
      }, onclick:()=>{ lora.enabled=lora.enabled===false; ctx.persist(); rebuildLoras(); }});
      const del = el("button", { type:"button", text:"✕", style:{
        cursor:"pointer", fontFamily:"inherit", fontSize:"11px",
        background:"transparent", color:C.err, border:"none", padding:"2px 4px",
      }, onclick:()=>{ state.loras.splice(i,1); ctx.persist(); rebuildLoras(); }});
      return el("div", { style:{ display:"flex", flexDirection:"column", gap:"3px", padding:"5px", background:C.bg2, borderRadius:"6px", border:`1px solid ${C.border}` } }, [
        row([el("div",{style:{flex:"1"}},[loraSel.el]), strInp, tog, del], "4px"), twIn,
      ]);
    });
    const addBtn = loras.length < 3
      ? button("+ Add LoRA", ()=>{ state.loras.push({name:"none",strength:1,triggerWord:"",enabled:true}); ctx.persist(); rebuildLoras(); })
      : null;
    const panelChildren = [label("LoRA (max 3)"), ...items];
    if (addBtn) panelChildren.push(addBtn);
    loraWrap.appendChild(panel(panelChildren));
  }

  ctx._rerenderLoras = rebuildLoras;
  rebuildLoras();
}

// Resolution (multiples of 16), Steps / CFG, Sampler / Scheduler and the skip-layer-guidance switch — shared by every mode.
export function mountSharedSettings(wrap, state, ctx, { onSize, resolution = true } = {}) {
  const matched = RESOLUTIONS.find(r => r.w === state.width && r.h === state.height);
  const isCustom = !matched || matched.label === "Custom";
  const customRow = row([]);
  const snap = v => Math.max(64, Math.round(v / 16) * 16) || 1024;
  const wInp = numberField(state.width,  v => { state.width  = snap(v); ctx.persist(); onSize?.(); }, 16);
  const hInp = numberField(state.height, v => { state.height = snap(v); ctx.persist(); onSize?.(); }, 16);
  customRow.append(col([label("W"), wInp]), col([label("H"), hInp]));
  customRow.style.display = isCustom ? "flex" : "none";
  const resDd = select(
    RESOLUTIONS.map(r => ({ value: r.label, label: r.label })),
    isCustom ? "Custom" : matched.label,
    v => {
      const p = RESOLUTIONS.find(r => r.label === v);
      if (p && p.w > 0) { state.width = p.w; state.height = p.h; wInp.value = p.w; hInp.value = p.h; ctx.persist(); customRow.style.display = "none"; onSize?.(); }
      else customRow.style.display = "flex";
    }
  );
  if (resolution) wrap.appendChild(panel([label("Resolution"), resDd, customRow]));

  const stepsF = numberField(state.steps, v => { state.steps = Math.max(1, Math.min(100, Math.round(v) || 1)); ctx.persist(); }, 1);
  const cfgF   = numberField(state.cfg,   v => { state.cfg   = Math.max(0, Math.min(20, v || 0)); ctx.persist(); }, 0.25);
  wrap.appendChild(panel([row([col([label("Steps"), stepsF]), col([label("CFG"), cfgF])])]));

  const sampSel  = select(SAMPLERS.map(s=>({value:s,label:s})),   state.sampler,   v=>{ state.sampler=v;   ctx.persist(); });
  const schedSel = select(SCHEDULERS.map(s=>({value:s,label:s})), state.scheduler, v=>{ state.scheduler=v; ctx.persist(); });
  wrap.appendChild(panel([row([col([label("Sampler"), sampSel]), col([label("Scheduler"), schedSel])])]));

  const slgChk = el("input", { type: "checkbox" }); slgChk.checked = !!state.slgEnabled;
  const slgLbl = el("label", { title: "Skip layer guidance on the model (official layer 22). Off looks more realistic; on keeps detail but can overblow anime styles.",
    style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: C.text, cursor: "pointer" } },
    [slgChk, el("span", { text: "SLG — skip layer guidance" })]);
  const slgLayers = el("input", { type: "text", style: { width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text,
    border: `1px solid ${C.border}`, borderRadius: "6px", padding: "5px 7px", fontSize: "12px", fontFamily: "inherit", outline: "none" } });
  slgLayers.value = state.slgLayers ?? "22";
  slgLayers.addEventListener("input", () => { state.slgLayers = slgLayers.value.trim(); ctx.persist(); });
  const slgRow = row([col([label("Layers (single)"), slgLayers])]);
  const syncSlg = () => { slgRow.style.display = state.slgEnabled ? "flex" : "none"; };
  slgChk.addEventListener("change", () => { state.slgEnabled = slgChk.checked; ctx.persist(); syncSlg(); });
  syncSlg();
  wrap.appendChild(panel([slgLbl, slgRow]));
}

export function mountT2ILeft(leftEl, state, ctx) {
  const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } });
  leftEl.appendChild(wrap);
  mountSharedSettings(wrap, state, ctx);
  mountLoraSectionMoss(wrap, state, ctx);
  return {
    getSourceURL() { return null; },
    async getGraph() { return buildT2IGraph(state); },
  };
}

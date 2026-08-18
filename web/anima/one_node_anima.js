// one_node_anima.js — Anima ONE STUDIO (TJ)
import { app } from "../../../scripts/app.js";
import { C, BRAND, NODE_W, PREVIEW_SIZE, LEFT_W, PAD,
         el, clear, loadState, saveState, defaultState, randomSeed, MANUAL_TEXT } from "./core_anima.js";
import { panel, label, button, row, col, modeBar, iconBtn, openFullscreen } from "../klein/ui_common.js";
import { queuePrompt, interrupt, setLastImage, saveMeta, copyOutputToInput } from "./api_anima.js";
import { createSettingsOverlay } from "./ui_app_settings_anima.js";
import { attachLLMPanel } from "../shared/llm_panel.js";
import { createGalleryOverlay } from "./ui_gallery_anima.js";
import { mountT2ILeft } from "./ui_t2i_anima.js";
import { mountControlLeft } from "./ui_control_anima.js";
import { attachNodeState, restoreNodeState } from "../shared/node_state.js";

// ── Layout ───────────────────────────────────────────────────────────────────
const TOPBAR_H    = 40;
const BOTTOM_PAD  = 20;
const SEND_TO_H   = 32;
const PROMPT_TA_H = 96;
const PROMPT_LBL  = 18;
const PROMPT_H    = PROMPT_LBL + 4 + PROMPT_TA_H;
const RIGHT_H     = PREVIEW_SIZE + PAD + SEND_TO_H + PAD + PROMPT_H;
const ROOT_H      = PAD + TOPBAR_H + PAD + RIGHT_H + BOTTOM_PAD;
const NODE_H      = ROOT_H + 30;
const NODE_MW     = NODE_W + 30;
const NODE_MH     = NODE_H + 40;

const MODES = [
  { key: "t2i",          label: "T2I",           enabled: true },
  { key: "inpaint",       label: "INPAINTING",    enabled: true },
  { key: "anycontrol",    label: "ANY CONTROL",   enabled: true },
  { key: "depthcontrol",  label: "DEPTH CONTROL", enabled: true },
];

// Send-to targets per mode: where a generated result can be copied as the NEXT
// mode's source image. T2I has no image input of its own, so it isn't a target.
const SEND_TO = {
  t2i:          [{ mode:"inpaint",      label:"→ Inpainting",    field:"inpaintImage"      },
                 { mode:"anycontrol",   label:"→ Any Control",   field:"anyControlImage"   },
                 { mode:"depthcontrol", label:"→ Depth Control", field:"depthControlImage" }],
  inpaint:      [{ mode:"anycontrol",   label:"→ Any Control",   field:"anyControlImage"   },
                 { mode:"depthcontrol", label:"→ Depth Control", field:"depthControlImage" }],
  anycontrol:   [{ mode:"inpaint",      label:"→ Inpainting",    field:"inpaintImage"      },
                 { mode:"depthcontrol", label:"→ Depth Control", field:"depthControlImage" }],
  depthcontrol: [{ mode:"inpaint",      label:"→ Inpainting",    field:"inpaintImage"      },
                 { mode:"anycontrol",   label:"→ Any Control",   field:"anyControlImage"   }],
};

// ── Compare view (source vs result, for control modes) ───────────────────────
function createCompareView(originalURL, resultURL) {
  const container = el("div", { style:{ position:"relative", width:"100%", height:"100%", overflow:"hidden", borderRadius:"8px" }});
  const resultImg = el("img", { src:resultURL,  style:{ position:"absolute", inset:"0", width:"100%", height:"100%", objectFit:"contain" }});
  const origWrap  = el("div", { style:{ position:"absolute", inset:"0 auto 0 0", width:"100%", overflow:"hidden" }});
  const origImg   = el("img", { src:originalURL, style:{ position:"absolute", inset:"0", width:`${PREVIEW_SIZE}px`, height:"100%", objectFit:"contain" }});
  origWrap.appendChild(origImg);
  const divider = el("div", { style:{ position:"absolute", top:"0", bottom:"0", left:"100%", width:"3px", background:"rgba(255,255,255,0.85)", cursor:"ew-resize", zIndex:"10" }});
  const handle  = el("div", { style:{ position:"absolute", top:"50%", left:"-10px", transform:"translateY(-50%)", width:"20px", height:"40px", borderRadius:"10px", background:BRAND, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:"11px", userSelect:"none" }, text:"⟺" });
  divider.appendChild(handle);
  let pos=50;
  function update(p){ pos=Math.max(0,Math.min(100,p)); origWrap.style.width=pos+"%"; divider.style.left=pos+"%"; }
  update(0);
  divider.addEventListener("pointerdown", e => {
    divider.setPointerCapture(e.pointerId);
    const mv=e2=>{ const r=container.getBoundingClientRect(); update((e2.clientX-r.left)/r.width*100); };
    const up=()=>{ divider.removeEventListener("pointermove",mv); divider.removeEventListener("pointerup",up); };
    divider.addEventListener("pointermove",mv); divider.addEventListener("pointerup",up);
  });
  container.appendChild(resultImg); container.appendChild(origWrap); container.appendChild(divider);
  return container;
}

// ── Main extension ────────────────────────────────────────────────────────────
app.registerExtension({
  name: "TJ.AnimaONE.v1",

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "AnimaOneTJNode") return;

    nodeType.prototype.onNodeCreated = function () {
      this.color       = BRAND;
      this.bgcolor     = C.bg0;
      this.title_color = "#ffffff";
      this.resizable   = false;
      this.size        = [NODE_MW, NODE_MH];
      this._buildUI();
    };
    nodeType.prototype.onConfigure = function () {
      this.size = [NODE_MW, NODE_MH];
      restoreNodeState(this);
    };
    nodeType.prototype.onResize    = function () { this.size = [NODE_MW, NODE_MH]; };
    nodeType.prototype.getSlotMenuOptions = function () { return []; };

    nodeType.prototype._buildUI = function () {
      const self   = this;
      const state  = defaultState(loadState());
      const persist = attachNodeState(self, {
        state, save: saveState, normalize: defaultState,
        rerender: () => self._tjRepaint?.(),
      });
      const appConfig = { output_mode_visible: true };
      const modeResults = {};

      if (!document.getElementById("anima-v1-styles")) {
        const s = document.createElement("style"); s.id = "anima-v1-styles";
        s.textContent = `@keyframes animav1-spin{to{transform:rotate(360deg)}}.animav1-lp::-webkit-scrollbar{width:4px}.animav1-lp::-webkit-scrollbar-track{background:transparent}.animav1-lp::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px}`;
        document.head.appendChild(s);
      }

      const ctx = { persist, appConfig, rootEl: null, showPopup: null, renderToggle: null, _refreshToggle: null };

      // ── Root ──────────────────────────────────────────────────────────────
      const root = el("div", { style:{
        width:`${NODE_W}px`, height:`${ROOT_H}px`, boxSizing:"border-box",
        position:"relative", overflow:"hidden",
        background:C.bg0, borderRadius:"8px",
        padding:`${PAD}px ${PAD}px ${BOTTOM_PAD}px ${PAD}px`,
        color:C.text, fontFamily:"'Segoe UI',sans-serif",
      }});
      ctx.rootEl = root;

      let popTimer;
      function showPopup(msg, isError=true) {
        let pop = root.querySelector(".animav1-pop");
        if (!pop) {
          pop = el("div",{style:{position:"absolute",bottom:"30px",left:"50%",transform:"translateX(-50%)",background:C.bg2,border:`1px solid ${C.border}`,borderRadius:"6px",padding:"6px 14px",fontSize:"11px",color:C.text,zIndex:"10001",maxWidth:"80%",textAlign:"center",pointerEvents:"none"}});
          pop.className="animav1-pop"; root.appendChild(pop);
        }
        pop.textContent=msg; pop.style.color=isError?C.err:BRAND; pop.style.opacity="1";
        clearTimeout(popTimer); popTimer=setTimeout(()=>pop.style.opacity="0",3000);
      }
      ctx.showPopup = showPopup;

      // ── Topbar ───────────────────────────────────────────────────────────
      const topBar    = el("div",{style:{display:"flex",alignItems:"center",gap:"6px",height:`${TOPBAR_H}px`,marginBottom:`${PAD}px`,flexShrink:"0"}});
      const pillsWrap = el("div",{style:{flex:"1"}});
      function renderPills(){ clear(pillsWrap); pillsWrap.appendChild(modeBar(MODES, state.mode, key=>{ state.mode=key; persist(); renderPills(); renderMode(); })); }

      const resetBtn = iconBtn("↺", "Reset settings", ()=>{
        if (!confirm("Reset all settings? Model selection is preserved.")) return;
        const { model, previewModel, textEncoder, vae, turboLora } = state;
        Object.assign(state, defaultState({}));
        if (model) state.model=model; if (previewModel) state.previewModel=previewModel;
        if (textEncoder) state.textEncoder=textEncoder; if (vae) state.vae=vae; if (turboLora) state.turboLora=turboLora;
        persist(); renderPills(); renderMode(); showPopup("Reset done.", false);
      });
      resetBtn.style.cssText += `background:#ffffff;color:${BRAND};border:2px solid ${BRAND};border-radius:6px;padding:4px 8px;font-weight:700;`;
      resetBtn.addEventListener("mouseenter",()=>resetBtn.style.background="#f5f5ff");
      resetBtn.addEventListener("mouseleave",()=>resetBtn.style.background="#ffffff");

      let compareEnabled = true;
      function applyCompareBtnStyle() {
        if (compareEnabled) {
          compareBtn.style.background="#ffffff"; compareBtn.style.color=BRAND; compareBtn.style.border=`2px solid ${BRAND}`; compareBtn.style.opacity="1";
        } else {
          compareBtn.style.background=C.bg2; compareBtn.style.color=C.muted; compareBtn.style.border=`1px solid ${C.border}`; compareBtn.style.opacity="1";
        }
      }
      const compareBtn = iconBtn("⇌", "Toggle compare view", ()=>{ compareEnabled=!compareEnabled; applyCompareBtnStyle(); if (!compareEnabled) restorePreview(); else tryShowCompare(); });
      compareBtn.style.cssText += "border-radius:6px;padding:4px 8px;font-weight:700;font-size:13px;";

      const unloadBtn = iconBtn("🗑","Unload RAM/VRAM",async()=>{
        unloadBtn.style.opacity="0.5";
        try { await fetch("/free",{method:"POST"}); } catch {}
        setTimeout(()=>unloadBtn.style.opacity="1",2000);
      });

      let settingsOv, galleryOv, helpOv;
      topBar.appendChild(pillsWrap);
      topBar.appendChild(resetBtn);
      topBar.appendChild(compareBtn);
      topBar.appendChild(unloadBtn);
      topBar.appendChild(iconBtn("⚙","Settings",()=>settingsOv?.show()));
      topBar.appendChild(iconBtn("🖼","Gallery",()=>galleryOv?.show()));
      topBar.appendChild(iconBtn("?","Manual",()=>helpOv?.show()));
      root.appendChild(topBar);

      // ── Main row ──────────────────────────────────────────────────────────
      const mainRow   = el("div",{style:{display:"flex",gap:`${PAD}px`,height:`${RIGHT_H}px`,flexShrink:"0"}});
      const leftOuter = el("div",{style:{width:`${LEFT_W}px`,flexShrink:"0",height:`${RIGHT_H}px`,display:"flex",flexDirection:"column"}});
      const leftPanel = el("div",{style:{flex:"1",overflowY:"auto",overflowX:"hidden",display:"flex",flexDirection:"column",gap:"6px"}});
      leftPanel.className = "animav1-lp";
      leftOuter.appendChild(leftPanel);
      const rightPanel = el("div",{style:{flex:"1",minWidth:`${PREVIEW_SIZE}px`,display:"flex",flexDirection:"column",gap:`${PAD}px`,height:`${RIGHT_H}px`}});

      // Preview box
      const previewBox = el("div",{style:{width:`${PREVIEW_SIZE}px`,height:`${PREVIEW_SIZE}px`,flexShrink:"0",background:"#000",borderRadius:"8px",border:`1px solid ${C.border}`,position:"relative",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",alignSelf:"flex-start"}});
      const placeholder = el("div",{text:"Generate to see result",style:{color:C.muted,fontSize:"12px"}});
      const finalImg    = el("img",{style:{maxWidth:"100%",maxHeight:"100%",objectFit:"contain",display:"none"}});
      const loadingOv   = el("div",{style:{position:"absolute",inset:"0",background:"rgba(0,0,0,0.5)",display:"none",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"12px",zIndex:"10"}});
      const spinner     = el("div",{style:{width:"44px",height:"44px",border:`3px solid ${C.border}`,borderTop:`3px solid ${BRAND}`,borderRadius:"50%",animation:"animav1-spin 0.8s linear infinite"}});
      loadingOv.appendChild(spinner); loadingOv.appendChild(el("div",{text:"Generating…",style:{color:C.text,fontSize:"12px"}}));
      const clearBtn = el("button",{type:"button",text:"✕",title:"Clear result",style:{position:"absolute",top:"6px",right:"6px",zIndex:"5",background:"rgba(0,0,0,0.65)",color:"#fff",border:"none",borderRadius:"4px",width:"22px",height:"22px",cursor:"pointer",fontSize:"12px",padding:"0",display:"none"}});
      clearBtn.addEventListener("click",()=>{ delete modeResults[state.mode]; resetZoom(); resetPreview(); });

      // Zoom / Pan
      let zoomEnabled=true, zoomScale=1, panX=0, panY=0, isPanning=false, panSX=0, panSY=0, pSTX=0, pSTY=0;
      function applyZoom(){ finalImg.style.transform=`scale(${zoomScale}) translate(${panX}px,${panY}px)`; finalImg.style.transformOrigin="center center"; finalImg.style.cursor=zoomScale>1?"grab":"default"; }
      function resetZoom(){ zoomScale=1; panX=0; panY=0; applyZoom(); }
      const zoomLockBtn = el("button",{type:"button",text:"🔓",title:"Scroll zoom on/off",style:{position:"absolute",top:"6px",right:"32px",zIndex:"5",background:"rgba(0,0,0,0.65)",color:"#fff",border:"none",borderRadius:"4px",width:"22px",height:"22px",cursor:"pointer",fontSize:"11px",padding:"0",display:"none"}});
      zoomLockBtn.addEventListener("click",()=>{ zoomEnabled=!zoomEnabled; zoomLockBtn.textContent=zoomEnabled?"🔓":"🔒"; if(!zoomEnabled)resetZoom(); });
      previewBox.addEventListener("wheel",e=>{if(!zoomEnabled||!modeResults[state.mode])return;e.preventDefault();zoomScale=Math.max(1,Math.min(8,zoomScale*(e.deltaY<0?1.12:0.9)));if(zoomScale===1){panX=0;panY=0;}applyZoom();},{passive:false});
      previewBox.addEventListener("mousedown",e=>{if(!zoomEnabled||zoomScale<=1||e.button!==0)return;isPanning=true;panSX=e.clientX;panSY=e.clientY;pSTX=panX;pSTY=panY;finalImg.style.cursor="grabbing";e.preventDefault();});
      document.addEventListener("mousemove",e=>{if(!isPanning)return;panX=pSTX+(e.clientX-panSX)/zoomScale;panY=pSTY+(e.clientY-panSY)/zoomScale;applyZoom();});
      document.addEventListener("mouseup",()=>{if(isPanning){isPanning=false;finalImg.style.cursor=zoomScale>1?"grab":"default";}});
      previewBox.addEventListener("dblclick",()=>{ const mr=modeResults[state.mode]; if(mr) openFullscreen(mr.url); });

      function resetPreview(){
        previewBox.innerHTML=""; previewBox.appendChild(placeholder); previewBox.appendChild(finalImg); previewBox.appendChild(loadingOv); previewBox.appendChild(zoomLockBtn); previewBox.appendChild(clearBtn);
        placeholder.style.display="block"; finalImg.style.display="none"; loadingOv.style.display="none"; zoomLockBtn.style.display="none"; clearBtn.style.display="none"; resetZoom();
      }
      resetPreview();

      let modeHandle = null;
      function tryShowCompare(){
        const mr=modeResults[state.mode]; if(!mr)return;
        const src=modeHandle?.getSourceURL?.();
        previewBox.innerHTML=""; clearBtn.style.display="block"; zoomLockBtn.style.display="block";
        if(compareEnabled && state.mode!=="t2i" && src){ previewBox.appendChild(createCompareView(src,mr.url)); resetZoom(); }
        else { placeholder.style.display="none"; finalImg.src=mr.url; finalImg.style.display="block"; previewBox.appendChild(placeholder); previewBox.appendChild(finalImg); }
        loadingOv.style.display="none"; previewBox.appendChild(loadingOv); previewBox.appendChild(zoomLockBtn); previewBox.appendChild(clearBtn);
      }
      function restorePreview(){ const mr=modeResults[state.mode]; if(!mr)resetPreview(); else tryShowCompare(); }
      ctx.showResult = (im) => {
        const url=`/view?filename=${encodeURIComponent(im.filename)}&subfolder=${encodeURIComponent(im.subfolder||"")}&type=${im.type||"output"}&t=${Date.now()}`;
        modeResults[state.mode]={im,url}; loadingOv.style.display="none"; tryShowCompare(); renderSendTo();
        setLastImage(self.id, im).catch(()=>{});
      };

      // ── Send-to strip + Output toggle ───────────────────────────────────────
      const sendToWrap = el("div",{style:{height:`${SEND_TO_H}px`,flexShrink:"0",display:"flex",alignItems:"center",gap:"8px",overflow:"hidden"}});
      const sendLeft   = el("div",{style:{flex:"1",display:"flex",flexWrap:"wrap",alignItems:"center",gap:"4px"}});
      const sendRight  = el("div",{style:{display:"flex",alignItems:"center",gap:"4px",flexShrink:"0"}});
      sendToWrap.append(sendLeft, sendRight);

      function renderSendTo(){
        clear(sendLeft);
        const targets = SEND_TO[state.mode] || [];
        const mr = modeResults[state.mode];
        if (!targets.length) return;
        sendLeft.appendChild(el("div",{text:"Send to:",style:{color:C.muted,fontSize:"11px",flexShrink:"0"}}));
        targets.forEach(t=>{
          const btn=el("button",{type:"button",text:t.label,disabled:!mr,style:{cursor:mr?"pointer":"not-allowed",fontFamily:"inherit",fontSize:"11px",padding:"3px 8px",borderRadius:"12px",background:C.bg2,color:mr?C.text:C.muted,border:`1px solid ${C.border}`,opacity:mr?"1":"0.5"}});
          if (mr) {
            btn.addEventListener("mouseenter",()=>btn.style.background=C.bg3);
            btn.addEventListener("mouseleave",()=>btn.style.background=C.bg2);
            btn.addEventListener("click",async()=>{
              btn.disabled=true; btn.textContent="Copying…";
              try{
                const n=await copyOutputToInput(mr.im.filename,mr.im.subfolder||"",mr.im.type||"output");
                state[t.field]=n;
                state.mode=t.mode; persist(); renderPills(); renderMode();
              }catch(e){ btn.disabled=false; btn.textContent=t.label; showPopup(`Send failed: ${e.message}`); }
            });
          }
          sendLeft.appendChild(btn);
        });
      }

      function renderToggle(){
        clear(sendRight);
        if(appConfig.output_mode_visible===false)return;
        sendRight.appendChild(el("div",{text:"Output:",style:{color:C.muted,fontSize:"11px"}}));
        ["preview","save"].forEach(key=>{
          const active=state.outputMode===key;
          const b=el("button",{type:"button",text:key==="save"?"💾 Save":"👁 Preview",style:{cursor:"pointer",fontFamily:"inherit",fontSize:"11px",padding:"4px 10px",borderRadius:"20px",background:active?BRAND:C.bg2,color:"#fff",border:`1px solid ${active?BRAND:C.border}`,fontWeight:active?"700":"400"},onclick:()=>{state.outputMode=key;persist();renderToggle();}});
          sendRight.appendChild(b);
        });
      }
      renderToggle(); ctx.renderToggle=renderToggle; ctx._refreshToggle=renderToggle;

      // ── Prompt expand overlay ──────────────────────────────────────────────
      const promptExpandEl = el("div",{style:{position:"absolute",inset:"0",zIndex:"9997",background:"rgba(11,11,11,0.97)",borderRadius:"inherit",display:"none",flexDirection:"column",padding:"14px",gap:"8px",boxSizing:"border-box"}});
      const pxHdr = el("div",{style:{display:"flex",alignItems:"center",gap:"8px",flexShrink:"0"}});
      pxHdr.appendChild(el("div",{text:"Prompt — Full Screen Edit",style:{color:"#fff",fontSize:"13px",fontWeight:"700",flex:"1"}}));
      const pxTA    = el("textarea",{style:{flex:"1",background:C.bg2,color:C.text,border:`1px solid ${BRAND}`,borderRadius:"6px",padding:"10px",fontSize:"13px",fontFamily:"inherit",resize:"none",outline:"none"}});
      const pxApply = button("✓ Apply",()=>{ setModePrompt(state.mode,pxTA.value); promptTA.value=pxTA.value; persist(); updateCount(); promptExpandEl.style.display="none"; },"primary");
      const pxClose = button("✕ Close",()=>{ promptExpandEl.style.display="none"; },"danger");
      pxHdr.appendChild(pxApply); pxHdr.appendChild(pxClose);
      promptExpandEl.appendChild(pxHdr); promptExpandEl.appendChild(pxTA);
      const promptExpandOv = {
        show(){ promptExpandEl._tj_llm_onshow?.(); promptExpandEl.style.display="flex"; setTimeout(()=>pxTA.focus(),50); },
        hide(){ promptExpandEl.style.display="none"; },
      };
      attachLLMPanel({promptExpandEl,pxTA,getModePrompt,setModePrompt,state,persist,updateCount,getPromptTA:()=>promptTA});

      // ── Prompt area ────────────────────────────────────────────────────────
      const promptWrap = el("div",{style:{height:`${PROMPT_H}px`,flexShrink:"0",display:"flex",flexDirection:"column",gap:"4px"}});
      const charCount  = el("span",{style:{color:C.muted,fontSize:"10px",marginLeft:"6px"}});
      const promptHdr  = el("div",{style:{display:"flex",alignItems:"center",height:`${PROMPT_LBL}px`}});
      promptHdr.appendChild(el("div",{text:"PROMPT",style:{color:C.muted,fontSize:"11px",textTransform:"uppercase",letterSpacing:"0.04em"}}));
      promptHdr.appendChild(charCount);
      const expandBtn  = el("button",{type:"button",text:"🔍",title:"Expand edit",style:{cursor:"pointer",background:"transparent",border:"none",fontSize:"12px",color:C.muted,padding:"0 3px",marginLeft:"auto"},onclick:()=>promptExpandOv.show()});
      promptHdr.appendChild(expandBtn);
      const tplBtn = button("📋",null,"default");
      tplBtn.title="Load Template"; tplBtn.style.cssText+="padding:2px 6px;font-size:11px;margin-left:4px;";
      promptHdr.appendChild(tplBtn);

      const promptTA = el("textarea",{placeholder:"Describe what you want to generate…",style:{flex:"1",width:"100%",boxSizing:"border-box",background:C.bg2,color:C.text,border:`1px solid ${C.border}`,borderRadius:"6px",padding:"7px",fontSize:"13px",fontFamily:"inherit",outline:"none",resize:"none",overflowY:"auto"}});

      function getModePrompt(mode){if(!state.promptsByMode)state.promptsByMode={};if(!(mode in state.promptsByMode))state.promptsByMode[mode]="";return state.promptsByMode[mode];}
      function setModePrompt(mode,v){if(!state.promptsByMode)state.promptsByMode={};state.promptsByMode[mode]=v;state.prompt=v;}
      promptTA.value=getModePrompt(state.mode);
      function updateCount(){ const n=getModePrompt(state.mode).trim().length; charCount.textContent=` (${n} chars${n<10?" ⚠":""})`; charCount.style.color=n<10?C.warn:C.muted; }
      updateCount();
      promptTA.addEventListener("input",()=>{setModePrompt(state.mode,promptTA.value);persist();updateCount();});
      promptTA.addEventListener("focus",()=>promptTA.style.borderColor=BRAND);
      promptTA.addEventListener("blur",()=>promptTA.style.borderColor=C.border);
      promptWrap.appendChild(promptHdr); promptWrap.appendChild(promptTA);

      rightPanel.appendChild(previewBox); rightPanel.appendChild(sendToWrap); rightPanel.appendChild(promptWrap);
      mainRow.appendChild(leftOuter); mainRow.appendChild(rightPanel);
      root.appendChild(mainRow);

      // ── Seed + Generate ────────────────────────────────────────────────────
      const seedField = el("input",{type:"number",step:"1",style:{width:"100%",boxSizing:"border-box",background:C.bg2,color:C.text,border:`1px solid ${C.border}`,borderRadius:"6px",padding:"6px",fontSize:"12px",fontFamily:"inherit",outline:"none"}});
      seedField.value = state.seed;
      seedField.addEventListener("input",()=>{ state.seed=parseFloat(seedField.value)||0; persist(); });
      const seedModeSel = el("select",{style:{width:"100%",boxSizing:"border-box",background:C.bg2,color:C.text,border:`1px solid ${C.border}`,borderRadius:"6px",padding:"6px",fontSize:"12px",fontFamily:"inherit",outline:"none"},onchange:e=>{state.seedMode=e.target.value;persist();}},
        [{value:"randomize",label:"Random"},{value:"fixed",label:"Fixed"},{value:"increment",label:"+1"},{value:"decrement",label:"-1"}].map(o=>el("option",{value:o.value,text:o.label,...(o.value===state.seedMode?{selected:"selected"}:{})})));
      const seedGenWrap = el("div",{style:{display:"flex",flexDirection:"column",gap:"4px",paddingTop:"6px",flexShrink:"0",borderTop:`1px solid ${C.border}`}});
      seedGenWrap.appendChild(panel([row([col([label("SEED"),seedField]),col([label("MODE"),seedModeSel])])]));

      const genBtn  = button("▶ Generate",null,"primary");
      genBtn.style.cssText += "width:100%;padding:11px;font-size:13px;";
      const stopBtn = button("■ Stop",async()=>{ running=false; await interrupt(); genBtn.disabled=false; genBtn.textContent="▶ Generate"; loadingOv.style.display="none"; if(!modeResults[state.mode])resetPreview(); });
      stopBtn.style.flexShrink="0";
      seedGenWrap.appendChild(row([genBtn,stopBtn]));

      // ── Mode rendering ─────────────────────────────────────────────────────
      function renderMode(){
        const mode=state.mode; clear(leftPanel); modeHandle=null;
        switch(mode){
          case "t2i":          modeHandle=mountT2ILeft(leftPanel,state,ctx);              break;
          case "inpaint":       modeHandle=mountControlLeft("inpaint",leftPanel,state,ctx);      break;
          case "anycontrol":    modeHandle=mountControlLeft("anycontrol",leftPanel,state,ctx);    break;
          case "depthcontrol":  modeHandle=mountControlLeft("depthcontrol",leftPanel,state,ctx);  break;
        }
        leftOuter.appendChild(seedGenWrap);
        promptTA.value=getModePrompt(mode); updateCount();
        restorePreview(); renderSendTo(); applyCompareBtnStyle();
      }

      // ── Generate ───────────────────────────────────────────────────────────
      let running=false;
      genBtn.onclick = async()=>{
        if(running||!modeHandle)return;
        running=true; genBtn.disabled=true; genBtn.textContent="⏳ Queuing…";
        previewBox.appendChild(loadingOv); loadingOv.style.display="flex";

        if(state.seedMode==="randomize")  {state.seed=randomSeed();seedField.value=state.seed;}
        else if(state.seedMode==="increment"){state.seed=(state.seed||0)+1;seedField.value=state.seed;}
        else if(state.seedMode==="decrement"){state.seed=Math.max(0,(state.seed||0)-1);seedField.value=state.seed;}
        persist();

        try{await modeHandle.beforeGenerate?.();}catch(err){alert(err.message);running=false;genBtn.disabled=false;genBtn.textContent="▶ Generate";loadingOv.style.display="none";if(!modeResults[state.mode])resetPreview();return;}

        let prompt;
        try{ prompt=await modeHandle.getGraph(); }
        catch(err){alert(`Build error: ${err.message}`);running=false;genBtn.disabled=false;genBtn.textContent="▶ Generate";loadingOv.style.display="none";if(!modeResults[state.mode])resetPreview();return;}

        try{
          genBtn.textContent="⏳ Running…";
          const result=await queuePrompt(prompt);
          const im=result?.output?.images?.[0];
          if(im){ ctx.showResult(im); if(state.outputMode!=="preview") await saveMeta(im.filename,im.subfolder||"",{...state,mode:state.mode}); }
        }catch(err){
          if(err.message!=="cancelled") alert(`Generation error: ${err.message}`);
          loadingOv.style.display="none"; if(!modeResults[state.mode])resetPreview();
        }finally{running=false;genBtn.disabled=false;genBtn.textContent="▶ Generate";loadingOv.style.display="none";}
      };

      // ── Manual overlay ───────────────────────────────────────────────────────
      const helpEl = el("div",{style:{position:"absolute",inset:"0",zIndex:"9998",background:"rgba(11,11,11,0.98)",borderRadius:"inherit",display:"none",flexDirection:"column",padding:"14px",gap:"0",boxSizing:"border-box"}});
      const helpTop = el("div",{style:{display:"flex",alignItems:"center",gap:"8px",flexShrink:"0",marginBottom:"10px"}});
      helpTop.appendChild(el("div",{text:"Manual — Anima ONE STUDIO",style:{color:"#fff",fontSize:"14px",fontWeight:"700",flex:"1"}}));
      helpTop.appendChild(button("✕",()=>helpEl.style.display="none","danger"));
      helpEl.appendChild(helpTop);
      const helpBody=el("div",{style:{flex:"1",overflowY:"auto",fontSize:"11.5px",lineHeight:"1.7",color:C.text,whiteSpace:"pre-wrap"}});
      helpBody.className="animav1-lp";
      helpBody.textContent = MANUAL_TEXT;
      helpEl.appendChild(helpBody);
      helpOv={el:helpEl,show(){helpEl.style.display="flex";}};

      // ── Overlays mounting ──────────────────────────────────────────────────
      settingsOv = createSettingsOverlay(state, ctx);
      root.appendChild(settingsOv.el);

      galleryOv = createGalleryOverlay(
        state, ctx,
        meta => { Object.assign(state, meta); persist(); renderPills(); renderMode(); },
        (mode, field, filename) => {
          state[field] = filename;
          state.mode = mode; persist(); renderPills(); renderMode();
        }
      );
      root.appendChild(galleryOv.el);

      // Template overlay (shared with Klein/Krea2)
      import("../klein/ui_prompt_templates.js").then(mod=>{
        if(!mod.createTemplateOverlay)return;
        const tOv=mod.createTemplateOverlay(state,ctx,txt=>{setModePrompt(state.mode,txt);promptTA.value=txt;persist();updateCount();},"nl");
        root.appendChild(tOv.el);
        tplBtn.onclick=()=>tOv.show();
      }).catch(()=>{});

      root.appendChild(promptExpandEl);
      root.appendChild(helpEl);

      // ── ESC ────────────────────────────────────────────────────────────────
      document.addEventListener("keydown",e=>{
        if(e.key!=="Escape")return;
        if(promptExpandEl.style.display!=="none"){promptExpandEl.style.display="none";return;}
        if(helpEl.style.display!=="none"){helpEl.style.display="none";return;}
        if(settingsOv?.el.style.display!=="none"){settingsOv.hide();return;}
        if(galleryOv?.el.style.display!=="none"){galleryOv.hide();return;}
      });

      self.addDOMWidget("animav1_ui","div",root,{serialize:false,computeSize:()=>[NODE_MW,NODE_MH]});
      self._tjRepaint = () => { seedField.value = state.seed ?? 0; promptTA.value = getModePrompt(state.mode); updateCount?.(); renderPills(); renderMode(); applyCompareBtnStyle?.(); };
      renderPills(); renderMode(); applyCompareBtnStyle();
    };
  },
});

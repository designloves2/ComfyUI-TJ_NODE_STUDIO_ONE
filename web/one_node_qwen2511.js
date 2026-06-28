// one_node_qwen2511.js — Qwen Image Edit 2511 ONE STUDIO (TJ)
import { app } from "../../scripts/app.js";
import { C, BRAND, NODE_W, PREVIEW_SIZE, LEFT_W, PAD,
         el, clear, loadState, saveState, defaultState, randomSeed, LS_KEY } from "./qwen2511/core_qwen2511.js";
import { panel, label, button, select, numberField, row, col,
         modeBar, iconBtn, openFullscreen }                                    from "./klein/ui_common.js";
import { queuePrompt, interrupt, setLastImage, saveMeta,
         copyOutputToInput }                                                    from "./qwen2511/api_qwen2511.js";
import { createSettingsOverlay }  from "./qwen2511/ui_app_settings_qe.js";
import { t } from "./shared/i18n.js";
import { createGalleryOverlay }   from "./qwen2511/ui_gallery_qe2511.js";
import { mountT2ILeft }      from "./qwen2511/ui_t2i_qe.js";
import { mountI2ILeft }      from "./qwen2511/ui_i2i_qe.js";
import { mountEditLeft }     from "./qwen2511/ui_edit_qe.js";
import { mountInpaintLeft }  from "./qwen2511/ui_inpaint_qe.js";
import { mountFaceswapLeft } from "./qwen2511/ui_faceswap_qe.js";
import { mountUpscaleLeft }  from "./qwen2511/ui_upscale_qe.js";
import { mountAngleLeft }    from "./qwen2511/ui_angle_qe.js";

// ── Layout ────────────────────────────────────────────────────────────────────
const TOPBAR_H    = 40;
const BOTTOM_PAD  = 20;
const SEND_TO_H   = 32;
const PROMPT_TA_H = 96;
const PROMPT_LBL  = 18;
const PROMPT_H    = PROMPT_LBL + 4 + PROMPT_TA_H;
const RIGHT_H     = PREVIEW_SIZE + PAD + SEND_TO_H + PAD + PROMPT_H;
const ROOT_H      = PAD + TOPBAR_H + PAD + RIGHT_H + BOTTOM_PAD;
const NODE_H      = ROOT_H + 30;

const MODES = [
  { key: "t2i",     label: "T2I",      enabled: true },
  { key: "i2i",     label: "I2I",      enabled: true },
  { key: "edit",    label: "EDIT",     enabled: true },
  { key: "inpaint", label: "PAINT",    enabled: true },
  { key: "faceswap",label: "FACESWAP", enabled: true },
  { key: "angle",   label: "ANGLE",    enabled: true },
  { key: "upscale", label: "UPSCALE",  enabled: true },
];

// T2I → 모든 모드, 나머지 → T2I·현재모드 제외한 전체
const ALL_TARGETS = [
  { mode:"i2i",      label:"→ I2I",     field:"i2iImage"       },
  { mode:"edit",     label:"→ Edit",    field:"editImage1"     },
  { mode:"inpaint",  label:"→ Paint",   field:"inpaintImage"   },
  { mode:"faceswap", label:"→ Face",    field:"faceswapTarget" },
  { mode:"angle",    label:"→ Angle",   field:"angleCameraImage"},
  { mode:"upscale",  label:"→ Upscale", field:"upscaleImage"   },
];
const SEND_TO = {
  t2i:      ALL_TARGETS,
  i2i:      ALL_TARGETS.filter(t => t.mode !== "i2i"),
  edit:     ALL_TARGETS.filter(t => t.mode !== "edit"),
  inpaint:  ALL_TARGETS.filter(t => t.mode !== "inpaint"),
  faceswap: ALL_TARGETS.filter(t => t.mode !== "faceswap"),
  angle:    ALL_TARGETS.filter(t => t.mode !== "angle"),
  upscale:  ALL_TARGETS.filter(t => t.mode !== "upscale"),
};

// ── Compare view ──────────────────────────────────────────────────────────────
function createCompareView(originalURL, resultURL) {
  const container = el("div",{style:{position:"relative",width:"100%",height:"100%",overflow:"hidden",borderRadius:"8px"}});
  const resultImg = el("img",{src:resultURL, style:{position:"absolute",inset:"0",width:"100%",height:"100%",objectFit:"contain"}});
  const origWrap  = el("div",{style:{position:"absolute",inset:"0 auto 0 0",width:"100%",overflow:"hidden"}});
  const origImg   = el("img",{src:originalURL,style:{position:"absolute",inset:"0",width:`${PREVIEW_SIZE}px`,height:"100%",objectFit:"contain"}});
  origWrap.appendChild(origImg);
  const divider = el("div",{style:{position:"absolute",top:"0",bottom:"0",left:"100%",width:"3px",background:"rgba(255,255,255,0.85)",cursor:"ew-resize",zIndex:"10"}});
  const handle  = el("div",{style:{position:"absolute",top:"50%",left:"-10px",transform:"translateY(-50%)",width:"20px",height:"40px",borderRadius:"10px",background:BRAND,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:"11px",userSelect:"none"},text:"⟺"});
  divider.appendChild(handle);
  let pos=50;
  function update(p){pos=Math.max(0,Math.min(100,p));origWrap.style.width=pos+"%";divider.style.left=pos+"%";}
  update(0);
  divider.addEventListener("pointerdown",e=>{
    divider.setPointerCapture(e.pointerId);
    const mv=e2=>{const r=container.getBoundingClientRect();update((e2.clientX-r.left)/r.width*100);};
    const up=()=>{divider.removeEventListener("pointermove",mv);divider.removeEventListener("pointerup",up);};
    divider.addEventListener("pointermove",mv);divider.addEventListener("pointerup",up);
  });
  container.appendChild(resultImg);container.appendChild(origWrap);container.appendChild(divider);
  return container;
}

// ── Main extension ─────────────────────────────────────────────────────────────
app.registerExtension({
  name: "TJ.QwenImageEdit2511ONE.v3",

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "QwenImageEdit2511OneTJNode") return;

    nodeType.prototype.onNodeCreated = function () {
      this.color       = BRAND;
      this.bgcolor     = C.bg0;
      this.title_color = "#ffffff";
      this.resizable   = false;
      this.size        = [NODE_W, NODE_H];
      this._buildUI();
    };
    nodeType.prototype.onConfigure = function () { this.size = [NODE_W, NODE_H + (this._extraH||0)]; };
    nodeType.prototype.onResize    = function () { this.size = [NODE_W, NODE_H + (this._extraH||0)]; };
    nodeType.prototype.getSlotMenuOptions = function () { return []; };

    nodeType.prototype._buildUI = function () {
      const self   = this;
      self._extraH = 0;
      const state  = defaultState(loadState());
      state.useModelOverride = false;
      const persist   = () => saveState(state);
      const appConfig = { output_mode_visible: true };
      const modeResults = {};

      if (!document.getElementById("qe2511v3-styles")) {
        const s = document.createElement("style"); s.id = "qe2511v3-styles";
        s.textContent = `@keyframes qe2511v3-spin{to{transform:rotate(360deg)}}.qe2511v3-lp::-webkit-scrollbar{width:4px}.qe2511v3-lp::-webkit-scrollbar-track{background:transparent}.qe2511v3-lp::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px}`;
        document.head.appendChild(s);
      }

      // 모델 override 슬롯
      const OVERRIDE_SLOTS = [
        { name:"model_override", type:"MODEL" },
        { name:"clip_override",  type:"CLIP"  },
        { name:"vae_override",   type:"VAE"   },
      ];
      const OVERRIDE_NAMES = OVERRIDE_SLOTS.map(s=>s.name);
      function getOverrideSlot(slotName) {
        try {
          const idx = self.inputs?.findIndex(i=>i.name===slotName);
          if (idx==null||idx<0) return "";
          const linkId = self.inputs[idx]?.link;
          if (linkId==null) return "";
          const link = app.graph.links[linkId];
          if (!link) return "";
          const srcNode = app.graph.getNodeById(link.origin_id);
          if (!srcNode) return "";
          return srcNode.widgets?.[link.origin_slot]?.value ?? srcNode.widgets?.[0]?.value ?? "";
        } catch { return ""; }
      }
      const getPromptOverride = () => getOverrideSlot("prompt_override");
      function syncOverrideSlots(enabled) {
        if (enabled) {
          for (const { name, type } of OVERRIDE_SLOTS) {
            if (!self.inputs?.find(i=>i.name===name)) self.addInput(name, type);
          }
        } else {
          for (let i=(self.inputs?.length??0)-1; i>=0; i--) {
            if (OVERRIDE_NAMES.includes(self.inputs[i]?.name)) self.removeInput(i);
          }
        }
        self._extraH = enabled ? OVERRIDE_SLOTS.length*20 : 0;
        const newH = NODE_H + self._extraH;
        self.size = [NODE_W, newH]; self.setSize?.([NODE_W, newH]);
        self.graph?.setDirtyCanvas?.(true, true);
      }

      const ctx = {
        persist, appConfig, availableLoras:[], rootEl:null,
        _rerenderLoras:null, renderToggle:null, _refreshToggle:null,
        showPopup:null, syncOverrideSlots, resizeNode:()=>{},
      };
      syncOverrideSlots(false);

      // ── Root ───────────────────────────────────────────────────────────────
      const root = el("div",{style:{
        width:"100%", height:`${ROOT_H}px`, boxSizing:"border-box",
        position:"relative", overflow:"hidden",
        background:C.bg0, borderRadius:"8px",
        padding:`${PAD}px ${PAD}px ${BOTTOM_PAD}px ${PAD}px`,
        color:C.text, fontFamily:"'Segoe UI',sans-serif",
      }});
      ctx.rootEl = root;

      let popTimer;
      function showPopup(msg, isError=true) {
        let pop=root.querySelector(".qe2511v3-pop");
        if(!pop){pop=el("div",{style:{position:"absolute",bottom:"30px",left:"50%",transform:"translateX(-50%)",background:C.bg2,border:`1px solid ${C.border}`,borderRadius:"6px",padding:"6px 14px",fontSize:"11px",color:C.text,zIndex:"10001",maxWidth:"80%",textAlign:"center",pointerEvents:"none"}});pop.className="qe2511v3-pop";root.appendChild(pop);}
        pop.textContent=msg;pop.style.color=isError?C.err:BRAND;pop.style.opacity="1";
        clearTimeout(popTimer);popTimer=setTimeout(()=>pop.style.opacity="0",3000);
      }
      ctx.showPopup = showPopup;

      // ── Topbar ─────────────────────────────────────────────────────────────
      const topBar   =el("div",{style:{display:"flex",alignItems:"center",gap:"6px",height:`${TOPBAR_H}px`,marginBottom:`${PAD}px`,flexShrink:"0"}});
      const pillsWrap=el("div",{style:{flex:"1"}});
      function renderPills(){clear(pillsWrap);pillsWrap.appendChild(modeBar(MODES,state.mode,key=>{state.mode=key;persist();renderPills();renderMode();}));}

      const resetBtn=iconBtn("↺","Reset settings",()=>{
        if(!confirm("Reset all settings? Model selection is preserved."))return;
        const{model,textEncoder,vae}=state;Object.assign(state,defaultState({}));
        if(model)state.model=model;if(textEncoder)state.textEncoder=textEncoder;if(vae)state.vae=vae;
        persist();renderPills();renderMode();showPopup("Reset done.",false);
      });
      resetBtn.style.cssText+=`background:#ffffff;color:${BRAND};border:2px solid ${BRAND};border-radius:6px;padding:4px 8px;font-weight:700;`;
      resetBtn.addEventListener("mouseenter",()=>resetBtn.style.background="#f0f9ff");
      resetBtn.addEventListener("mouseleave",()=>resetBtn.style.background="#ffffff");

      let compareEnabled=true;
      function applyCompareBtnStyle(){
        if(compareEnabled){
          compareBtn.style.background="#ffffff";compareBtn.style.color=BRAND;compareBtn.style.border=`2px solid ${BRAND}`;compareBtn.style.opacity="1";
          compareBtn.onmouseenter=()=>{compareBtn.style.background="#f0e0ff";};compareBtn.onmouseleave=()=>{compareBtn.style.background="#ffffff";};
        }else{
          compareBtn.style.background=C.bg2;compareBtn.style.color=C.muted;compareBtn.style.border=`1px solid ${C.border}`;compareBtn.style.opacity="1";
          compareBtn.onmouseenter=()=>{compareBtn.style.background=C.bg3||C.bg2;};compareBtn.onmouseleave=()=>{compareBtn.style.background=C.bg2;};
        }
      }
      const compareBtn=iconBtn("⇌","Toggle compare view",()=>{compareEnabled=!compareEnabled;applyCompareBtnStyle();if(!compareEnabled)restorePreview();else tryShowCompare();});
      compareBtn.style.cssText+="border-radius:6px;padding:4px 8px;font-weight:700;font-size:13px;";

      const unloadBtn=iconBtn("🗑","Unload RAM/VRAM",async()=>{
        unloadBtn.style.opacity="0.5";try{await fetch("/free",{method:"POST"});}catch{}setTimeout(()=>unloadBtn.style.opacity="1",2000);
      });

      let settingsOv,galleryOv,helpOv;
      topBar.appendChild(pillsWrap);
      topBar.appendChild(resetBtn);
      topBar.appendChild(compareBtn);
      topBar.appendChild(unloadBtn);
      topBar.appendChild(iconBtn("⚙","Settings",()=>settingsOv?.show()));
      topBar.appendChild(iconBtn("🖼","Gallery",()=>galleryOv?.show()));
      topBar.appendChild(iconBtn("?","Help",()=>helpOv?.show()));
      root.appendChild(topBar);

      // ── Main row ───────────────────────────────────────────────────────────
      const mainRow  =el("div",{style:{display:"flex",gap:`${PAD}px`,height:`${RIGHT_H}px`,flexShrink:"0"}});
      const leftOuter=el("div",{style:{width:`${LEFT_W}px`,flexShrink:"0",height:`${RIGHT_H}px`,display:"flex",flexDirection:"column"}});
      const leftPanel=el("div",{style:{flex:"1",overflowY:"auto",overflowX:"hidden",display:"flex",flexDirection:"column",gap:"6px"}});
      leftPanel.className="qe2511v3-lp";
      leftOuter.appendChild(leftPanel);
      const rightPanel=el("div",{style:{flex:"1",minWidth:"0",display:"flex",flexDirection:"column",gap:`${PAD}px`,height:`${RIGHT_H}px`}});

      // Preview box
      const previewBox =el("div",{style:{width:`${PREVIEW_SIZE}px`,height:`${PREVIEW_SIZE}px`,flexShrink:"0",background:"#000",borderRadius:"8px",border:`1px solid ${C.border}`,position:"relative",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",alignSelf:"flex-start"}});
      const placeholder=el("div",{text:"Generate to see result",style:{color:C.muted,fontSize:"12px"}});
      const finalImg   =el("img",{style:{maxWidth:"100%",maxHeight:"100%",objectFit:"contain",display:"none"}});
      const loadingOv  =el("div",{style:{position:"absolute",inset:"0",background:"rgba(0,0,0,0.5)",display:"none",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"12px",zIndex:"10"}});
      const spinner    =el("div",{style:{width:"44px",height:"44px",border:`3px solid ${C.border}`,borderTop:`3px solid ${BRAND}`,borderRadius:"50%",animation:"qe2511v3-spin 0.8s linear infinite"}});
      loadingOv.appendChild(spinner);loadingOv.appendChild(el("div",{text:"Generating…",style:{color:C.text,fontSize:"12px"}}));
      const clearBtn=el("button",{type:"button",text:"✕",title:"Clear result",style:{position:"absolute",top:"6px",right:"6px",zIndex:"5",background:"rgba(0,0,0,0.65)",color:"#fff",border:"none",borderRadius:"4px",width:"22px",height:"22px",cursor:"pointer",fontSize:"12px",padding:"0",display:"none"}});
      clearBtn.addEventListener("click",()=>{delete modeResults[state.mode];resetZoom();resetPreview();renderSendTo();});

      let zoomEnabled=true,zoomScale=1,panX=0,panY=0,isPanning=false,panSX=0,panSY=0,pSTX=0,pSTY=0;
      function applyZoom(){finalImg.style.transform=`scale(${zoomScale}) translate(${panX}px,${panY}px)`;finalImg.style.transformOrigin="center center";finalImg.style.cursor=zoomScale>1?"grab":"default";}
      function resetZoom(){zoomScale=1;panX=0;panY=0;applyZoom();}
      const zoomLockBtn=el("button",{type:"button",text:"🔓",title:"Scroll zoom on/off",style:{position:"absolute",top:"6px",right:"32px",zIndex:"5",background:"rgba(0,0,0,0.65)",color:"#fff",border:"none",borderRadius:"4px",width:"22px",height:"22px",cursor:"pointer",fontSize:"11px",padding:"0",display:"none"}});
      zoomLockBtn.addEventListener("click",()=>{zoomEnabled=!zoomEnabled;zoomLockBtn.textContent=zoomEnabled?"🔓":"🔒";if(!zoomEnabled)resetZoom();});
      previewBox.addEventListener("wheel",e=>{if(!zoomEnabled||!modeResults[state.mode])return;e.preventDefault();zoomScale=Math.max(1,Math.min(8,zoomScale*(e.deltaY<0?1.12:0.9)));if(zoomScale===1){panX=0;panY=0;}applyZoom();},{passive:false});
      previewBox.addEventListener("mousedown",e=>{if(!zoomEnabled||zoomScale<=1||e.button!==0)return;isPanning=true;panSX=e.clientX;panSY=e.clientY;pSTX=panX;pSTY=panY;finalImg.style.cursor="grabbing";e.preventDefault();});
      document.addEventListener("mousemove",e=>{if(!isPanning)return;panX=pSTX+(e.clientX-panSX)/zoomScale;panY=pSTY+(e.clientY-panSY)/zoomScale;applyZoom();});
      document.addEventListener("mouseup",()=>{if(isPanning){isPanning=false;finalImg.style.cursor=zoomScale>1?"grab":"default";}});
      previewBox.addEventListener("dblclick",()=>{const mr=modeResults[state.mode];if(mr)openFullscreen(mr.url);});

      function resetPreview(){
        previewBox.innerHTML="";previewBox.appendChild(placeholder);previewBox.appendChild(finalImg);previewBox.appendChild(loadingOv);previewBox.appendChild(zoomLockBtn);previewBox.appendChild(clearBtn);
        placeholder.style.display="block";finalImg.style.display="none";loadingOv.style.display="none";zoomLockBtn.style.display="none";clearBtn.style.display="none";resetZoom();
      }
      resetPreview();

      let modeHandle=null;
      function tryShowCompare(){
        const mr=modeResults[state.mode];if(!mr)return;
        const src=modeHandle?.getSourceURL?.();
        previewBox.innerHTML="";clearBtn.style.display="block";zoomLockBtn.style.display="block";
        if(compareEnabled&&state.mode!=="t2i"&&src){previewBox.appendChild(createCompareView(src,mr.url));resetZoom();}
        else{placeholder.style.display="none";finalImg.src=mr.url;finalImg.style.display="block";previewBox.appendChild(placeholder);previewBox.appendChild(finalImg);}
        loadingOv.style.display="none";previewBox.appendChild(loadingOv);previewBox.appendChild(zoomLockBtn);previewBox.appendChild(clearBtn);
      }
      function restorePreview(){const mr=modeResults[state.mode];if(!mr)resetPreview();else tryShowCompare();}
      ctx.showResult=(im)=>{
        const url=`/view?filename=${encodeURIComponent(im.filename)}&subfolder=${encodeURIComponent(im.subfolder||"")}&type=${im.type||"output"}&t=${Date.now()}`;
        modeResults[state.mode]={im,url};loadingOv.style.display="none";tryShowCompare();renderSendTo();
        setLastImage(self.id,im).catch(()=>{});
      };

      // ── Send-to strip + Output toggle ───────────────────────────────────────
      const sendToWrap=el("div",{style:{height:`${SEND_TO_H}px`,flexShrink:"0",display:"flex",alignItems:"center",gap:"8px",overflow:"hidden"}});
      const sendLeft =el("div",{style:{flex:"1",display:"flex",flexWrap:"wrap",alignItems:"center",gap:"4px"}});
      const sendRight=el("div",{style:{display:"flex",alignItems:"center",gap:"4px",flexShrink:"0"}});
      sendToWrap.append(sendLeft,sendRight);

      function renderSendTo(){
        clear(sendLeft);
        const targets=SEND_TO[state.mode]||[];if(!targets.length)return;
        sendLeft.appendChild(el("div",{text:"Send to:",style:{color:C.muted,fontSize:"11px",flexShrink:"0"}}));
        targets.forEach(t=>{
          const btn=el("button",{type:"button",text:t.label,style:{cursor:"pointer",fontFamily:"inherit",fontSize:"11px",padding:"3px 8px",borderRadius:"12px",background:C.bg2,color:C.text,border:`1px solid ${C.border}`}});
          btn.addEventListener("mouseenter",()=>btn.style.background=C.bg3);
          btn.addEventListener("mouseleave",()=>btn.style.background=C.bg2);
          btn.addEventListener("click",async()=>{
            const mr=modeResults[state.mode];if(!mr)return;
            btn.disabled=true;btn.textContent="Copying…";
            try{const n=await copyOutputToInput(mr.im.filename,mr.im.subfolder||"",mr.im.type||"output");state[t.field]=n;state.mode=t.mode;persist();renderPills();renderMode();}
            catch(e){btn.disabled=false;btn.textContent=t.label;}
          });
          sendLeft.appendChild(btn);
        });
      }
      function renderToggle(){
        clear(sendRight);
        if(appConfig.output_mode_visible===false)return;
        sendRight.appendChild(el("div",{text:"Output:",style:{color:C.muted,fontSize:"11px"}}));
        ["preview","save"].forEach(key=>{
          const active=state.outputMode===key;
          const btn=el("button",{type:"button",text:key==="save"?"💾 Save":"👁 Preview",style:{cursor:"pointer",fontFamily:"inherit",fontSize:"11px",padding:"4px 10px",borderRadius:"20px",background:active?BRAND:C.bg2,color:"#fff",border:`1px solid ${active?BRAND:C.border}`,fontWeight:active?"700":"400"},onclick:()=>{state.outputMode=key;persist();renderToggle();}});
          sendRight.appendChild(btn);
        });
      }
      renderToggle();ctx.renderToggle=renderToggle;ctx._refreshToggle=renderToggle;

      // ── Prompt expand overlay ───────────────────────────────────────────────
      const promptExpandEl=el("div",{style:{position:"absolute",inset:"0",zIndex:"9997",background:"rgba(11,11,11,0.97)",borderRadius:"inherit",display:"none",flexDirection:"column",padding:"14px",gap:"8px",boxSizing:"border-box"}});
      const pxHdr=el("div",{style:{display:"flex",alignItems:"center",gap:"8px",flexShrink:"0"}});
      pxHdr.appendChild(el("div",{text:"🔍 Prompt — Full Screen Edit",style:{color:"#fff",fontSize:"13px",fontWeight:"700",flex:"1"}}));
      const pxTA   =el("textarea",{style:{flex:"1",background:C.bg2,color:C.text,border:`1px solid ${BRAND}`,borderRadius:"6px",padding:"10px",fontSize:"13px",fontFamily:"inherit",resize:"none",outline:"none"}});
      const pxApply=button("✓ Apply",()=>{setModePrompt(state.mode,pxTA.value);promptTA.value=pxTA.value;persist();updateCount();promptExpandEl.style.display="none";},"primary");
      const pxClose=button("✕ Close",()=>{promptExpandEl.style.display="none";},"danger");
      pxHdr.appendChild(pxApply);pxHdr.appendChild(pxClose);
      promptExpandEl.appendChild(pxHdr);promptExpandEl.appendChild(pxTA);
      const promptExpandOv={
        show(){pxTA.value=getModePrompt(state.mode);promptExpandEl.style.display="flex";setTimeout(()=>pxTA.focus(),50);},
        hide(){promptExpandEl.style.display="none";},
      };

      // ── Prompt area ─────────────────────────────────────────────────────────
      const promptWrap=el("div",{style:{height:`${PROMPT_H}px`,flexShrink:"0",display:"flex",flexDirection:"column",gap:"4px"}});
      const charCount =el("span",{style:{color:C.muted,fontSize:"10px",marginLeft:"6px"}});
      const promptHdr =el("div",{style:{display:"flex",alignItems:"center",height:`${PROMPT_LBL}px`}});
      promptHdr.appendChild(el("div",{text:"PROMPT",style:{color:C.muted,fontSize:"11px",textTransform:"uppercase",letterSpacing:"0.04em"}}));
      promptHdr.appendChild(charCount);
      const expandBtn=el("button",{type:"button",text:"🔍",title:"Expand edit",style:{cursor:"pointer",background:"transparent",border:"none",fontSize:"12px",color:C.muted,padding:"0 3px",marginLeft:"auto"},onclick:()=>promptExpandOv.show()});
      promptHdr.appendChild(expandBtn);
      const tplBtn=button("📋",null,"default");
      tplBtn.title="Load Template";tplBtn.style.cssText+="padding:2px 6px;font-size:11px;margin-left:4px;";
      promptHdr.appendChild(tplBtn);

      const promptTA=el("textarea",{placeholder:"Describe what you want to generate…",style:{flex:"1",width:"100%",boxSizing:"border-box",background:C.bg2,color:C.text,border:`1px solid ${C.border}`,borderRadius:"6px",padding:"7px",fontSize:"13px",fontFamily:"inherit",outline:"none",resize:"none",overflowY:"auto"}});

      function effectiveKey(mode){return(mode==="inpaint"&&state.paintSubMode==="outpaint")?"outpaint":mode;}
      function getModePrompt(mode){return state.promptsByMode?.[effectiveKey(mode)]||"";}
      function setModePrompt(mode,v){if(!state.promptsByMode)state.promptsByMode={};state.promptsByMode[effectiveKey(mode)]=v;state.prompt=v;}
      promptTA.value=getModePrompt(state.mode);
      function updateCount(){const n=getModePrompt(state.mode).trim().length;charCount.textContent=` (${n} chars${n<20?" ⚠":""})`;charCount.style.color=n<20?C.warn:C.muted;}
      updateCount();
      promptTA.addEventListener("input",()=>{setModePrompt(state.mode,promptTA.value);persist();updateCount();});
      promptTA.addEventListener("focus",()=>promptTA.style.borderColor=BRAND);
      promptTA.addEventListener("blur",()=>promptTA.style.borderColor=C.border);
      ctx.updatePromptTA=()=>{
        promptTA.value=getModePrompt(state.mode);
        promptTA.placeholder=effectiveKey(state.mode)==="outpaint"
          ?"Scene description only — system prompt is auto-added"
          :"Describe what you want to generate…";
        updateCount();
      };
      promptWrap.appendChild(promptHdr);promptWrap.appendChild(promptTA);

      rightPanel.appendChild(previewBox);rightPanel.appendChild(sendToWrap);rightPanel.appendChild(promptWrap);
      mainRow.appendChild(leftOuter);mainRow.appendChild(rightPanel);
      root.appendChild(mainRow);

      // ── Seed + Generate ─────────────────────────────────────────────────────
      const seedInput =numberField(state.seed,v=>{state.seed=v;persist();},1);
      const seedModeDD=select(
        [{value:"randomize",label:"Random"},{value:"fixed",label:"Fixed"},{value:"increment",label:"+1"},{value:"decrement",label:"-1"}],
        state.seedMode,v=>{state.seedMode=v;persist();}
      );
      const seedGenWrap=el("div",{style:{display:"flex",flexDirection:"column",gap:"4px",paddingTop:"6px",flexShrink:"0",borderTop:`1px solid ${C.border}`}});
      seedGenWrap.appendChild(panel([row([col([label("SEED"),seedInput]),col([label("MODE"),seedModeDD])])]));

      const genBtn =button("▶ Generate",null,"primary");
      genBtn.style.cssText+="width:100%;padding:11px;font-size:13px;";
      const stopBtn=button("■ Stop",async()=>{running=false;await interrupt();genBtn.disabled=false;genBtn.textContent="▶ Generate";loadingOv.style.display="none";if(!modeResults[state.mode])resetPreview();});
      stopBtn.style.flexShrink="0";
      seedGenWrap.appendChild(row([genBtn,stopBtn]));

      // ── Mode rendering ──────────────────────────────────────────────────────
      function renderMode(){
        const mode=state.mode;clear(leftPanel);modeHandle=null;
        switch(mode){
          case "t2i":     modeHandle=mountT2ILeft(leftPanel,state,ctx);      break;
          case "i2i":     modeHandle=mountI2ILeft(leftPanel,state,ctx);      break;
          case "edit":    modeHandle=mountEditLeft(leftPanel,state,ctx);     break;
          case "inpaint": modeHandle=mountInpaintLeft(leftPanel,state,ctx);  break;
          case "faceswap":
            if (!getModePrompt("faceswap")) {
              setModePrompt("faceswap","Replace the head in image 1 with the head from image 2, adapting the facial features to match the artistic style, focus, and environmental lighting of the image 1.");
              persist();
            }
            modeHandle=mountFaceswapLeft(leftPanel,state,ctx); break;
          case "angle":   modeHandle=mountAngleLeft(leftPanel,state,ctx);    break;
          case "upscale": modeHandle=mountUpscaleLeft(leftPanel,state,ctx);  break;
        }
        leftOuter.appendChild(seedGenWrap);
        promptTA.value=getModePrompt(mode);promptTA.placeholder="Describe what you want to generate…";updateCount();
        restorePreview();renderSendTo();applyCompareBtnStyle();
      }

      // ── Generate ────────────────────────────────────────────────────────────
      let running=false;
      genBtn.onclick=async()=>{
        if(running||!modeHandle)return;
        running=true;genBtn.disabled=true;genBtn.textContent="⏳ Queuing…";
        previewBox.appendChild(loadingOv);loadingOv.style.display="flex";

        if(state.seedMode==="randomize"){state.seed=randomSeed();seedInput.value=state.seed;}
        else if(state.seedMode==="increment"){state.seed=(state.seed||0)+1;seedInput.value=state.seed;}
        else if(state.seedMode==="decrement"){state.seed=Math.max(0,(state.seed||0)-1);seedInput.value=state.seed;}
        persist();

        if(state.useModelOverride){state.modelOverride=getOverrideSlot("model_override");state.clipOverride=getOverrideSlot("clip_override");state.vaeOverride=getOverrideSlot("vae_override");}
        else{state.modelOverride="";state.clipOverride="";state.vaeOverride="";}

        const mOk=state.modelOverride||(state.model&&state.model!=="none");
        if(!mOk){alert("No model selected. Open ⚙ Settings to pick a model.");running=false;genBtn.disabled=false;genBtn.textContent="▶ Generate";loadingOv.style.display="none";if(!modeResults[state.mode])resetPreview();return;}

        try{await modeHandle.beforeGenerate?.();}catch(err){alert(err.message);running=false;genBtn.disabled=false;genBtn.textContent="▶ Generate";loadingOv.style.display="none";if(!modeResults[state.mode])resetPreview();return;}

        let prompt;
        try{
          prompt=await modeHandle.getGraph();
          const po=getPromptOverride();
          if(po){for(const n of Object.values(prompt)){if(n.class_type==="CLIPTextEncode"&&n.inputs?.text)n.inputs.text=po+" "+n.inputs.text;}}
        }catch(err){alert(`Build error: ${err.message}`);running=false;genBtn.disabled=false;genBtn.textContent="▶ Generate";loadingOv.style.display="none";if(!modeResults[state.mode])resetPreview();return;}

        try{
          genBtn.textContent="⏳ Running…";
          const result=await queuePrompt(prompt);
          const im=result?.output?.images?.[0];
          if(im){ctx.showResult(im);if(state.outputMode!=="preview")await saveMeta(im.filename,im.subfolder||"",{...state,mode:state.mode});}
        }catch(err){
          if(err.message!=="cancelled")alert(`Generation error: ${err.message}`);
          loadingOv.style.display="none";if(!modeResults[state.mode])resetPreview();
        }finally{running=false;genBtn.disabled=false;genBtn.textContent="▶ Generate";loadingOv.style.display="none";state.modelOverride="";state.clipOverride="";state.vaeOverride="";}
      };

      // ── Help overlay ────────────────────────────────────────────────────────
      function linkifyHelp(str) {
        const esc = str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
        return esc.replace(/(https?:\/\/\S+)/g, '<a href="$1" target="_blank" rel="noopener" style="color:#a78bfa;text-decoration:underline;word-break:break-all;">$1</a>');
      }
      const helpEl=el("div",{style:{position:"absolute",inset:"0",zIndex:"9998",background:"rgba(11,11,11,0.98)",borderRadius:"inherit",display:"none",flexDirection:"column",padding:"14px",gap:"0",boxSizing:"border-box"}});
      const helpTop=el("div",{style:{display:"flex",alignItems:"center",gap:"8px",flexShrink:"0",marginBottom:"10px"}});
      helpTop.appendChild(el("div",{text:t("qehelp_title"),style:{color:"#fff",fontSize:"14px",fontWeight:"700",flex:"1"}}));
      helpTop.appendChild(button("✕",()=>helpEl.style.display="none","danger"));
      helpEl.appendChild(helpTop);
      const helpBody=el("div",{style:{flex:"1",overflowY:"auto",display:"flex",flexDirection:"column",gap:"10px"}});
      helpBody.className="qe2511v3-lp";
      [
        [t("qehelp_s0_title"), t("qehelp_s0_body")],
        [t("qehelp_s1_title"), t("qehelp_s1_body")],
        [t("qehelp_s2_title"), t("qehelp_s2_body")],
        [t("qehelp_s3_title"), t("qehelp_s3_body")],
        [t("qehelp_s4_title"), t("qehelp_s4_body")],
        [t("qehelp_s5_title"), t("qehelp_s5_body")],
        [t("qehelp_s6_title"), t("qehelp_s6_body")],
        [t("qehelp_s7_title"), t("qehelp_s7_body")],
        [t("qehelp_s8_title"), t("qehelp_s8_body")],
        [t("qehelp_s9_title"), t("qehelp_s9_body")],
        [t("qehelp_s10_title"), t("qehelp_s10_body")],
      ].forEach(([title,body])=>{
        const block=el("div",{style:{background:C.bg1,border:`1px solid ${C.border}`,borderRadius:"8px",padding:"10px 12px"}});
        block.appendChild(el("div",{text:title,style:{color:BRAND,fontSize:"12px",fontWeight:"700",marginBottom:"6px"}}));
        const bodyDiv=el("div",{style:{fontSize:"11.5px",lineHeight:"1.65",color:C.text,whiteSpace:"pre-wrap"}});
        bodyDiv.innerHTML=linkifyHelp(body);
        block.appendChild(bodyDiv);
        helpBody.appendChild(block);
      });
      helpEl.appendChild(helpBody);
      helpOv={el:helpEl,show(){helpEl.style.display="flex";}};

      // ── Overlays mounting ─────────────────────────────────────────────────
      settingsOv=createSettingsOverlay(state,ctx);
      // Re-render current mode panel when Lightning LoRA is toggled (so Steps/CFG fields update)
      ctx._onLightningChange = () => { persist(); renderMode(); };
      root.appendChild(settingsOv.el);

      galleryOv=createGalleryOverlay(
        state, ctx,
        meta => { Object.assign(state, meta); persist(); renderPills(); renderMode(); },
        (mode, field, filename) => { state[field]=filename; state.mode=mode; persist(); renderPills(); renderMode(); }
      );
      root.appendChild(galleryOv.el);

      import("./klein/ui_prompt_templates.js").then(mod=>{
        if(!mod.createTemplateOverlay)return;
        const tOv=mod.createTemplateOverlay(state,ctx,txt=>{setModePrompt(state.mode,txt);promptTA.value=txt;persist();updateCount();});
        root.appendChild(tOv.el);
        tplBtn.onclick=()=>tOv.show();
      }).catch(()=>{});

      root.appendChild(promptExpandEl);
      root.appendChild(helpEl);

      // ── ESC ─────────────────────────────────────────────────────────────────
      document.addEventListener("keydown",e=>{
        if(e.key!=="Escape")return;
        if(promptExpandEl.style.display!=="none"){promptExpandEl.style.display="none";return;}
        if(helpEl.style.display!=="none"){helpEl.style.display="none";return;}
        if(settingsOv?.el.style.display!=="none"){settingsOv.hide();return;}
        if(galleryOv?.el.style.display!=="none"){galleryOv.hide();return;}
      });

      self.addDOMWidget("qe2511v3_ui","div",root,{serialize:false,computeSize:()=>[NODE_W,NODE_H]});
      renderPills();renderMode();applyCompareBtnStyle();
    };
  },
});

// one_node_z_image_turbo.js — Z-Image ONE STUDIO (TJ)
import { app } from "../../../scripts/app.js";
import { C, NODE_W, PREVIEW_SIZE, LEFT_W, PAD,
         el, clear, loadState, saveState, defaultState, randomSeed, LS_KEY } from "./core.js";
import { panel, label, button, select, numberField, row, col,
         modeBar, iconBtn, openFullscreen } from "./ui_common.js";
import { queuePrompt, interrupt, copyOutputToInput, setLastImage,
         freeMemory, saveMeta } from "./api.js";
import { t } from "../shared/i18n.js";
import { attachLLMPanel } from "../shared/llm_panel.js";
import { mountT2II2ILeft }     from "./ui_t2i_i2i.js";
import { mountInpaintLeft }    from "./ui_inpaint.js";
import { mountReBGLeft }       from "./ui_rebg.js";
import { mountControlNetLeft } from "./ui_controlnet.js";
import { mountFaceRedrawLeft } from "./ui_face_redraw.js";
import { mountUpscaleLeft }   from "./ui_upscale.js";
import { createSettingsOverlay }  from "./ui_app_settings.js";
import { createGalleryOverlay }   from "./ui_gallery.js";
import { createTemplateOverlay }  from "./ui_prompt_templates.js";

// ── Layout ────────────────────────────────────────────────────────────────
const TOPBAR_H   = 40;
const BOTTOM_PAD = 20;
const SEND_TO_H  = 32;
const PROMPT_TA_H= 96;
const PROMPT_LBL = 18;
const PROMPT_H   = PROMPT_LBL + 4 + PROMPT_TA_H;
const RIGHT_H    = PREVIEW_SIZE + PAD + SEND_TO_H + PAD + PROMPT_H;
const ROOT_H     = PAD + TOPBAR_H + PAD + RIGHT_H + BOTTOM_PAD;
const NODE_H     = ROOT_H + 30;

const MODES = [
  { key:"t2i",         label:"T2I",         enabled:true },
  { key:"i2i",         label:"I2I",         enabled:true },
  { key:"inpaint",     label:"INPAINT",     enabled:true },
  { key:"rebg",        label:"RE-BG",       enabled:true },
  { key:"controlnet",  label:"CONTROLNET",  enabled:true },
  { key:"face_redraw", label:"FACE REDRAW", enabled:true },
  { key:"upscale",     label:"UPSCALE",     enabled:true },
];

const SEND_TO = {
  t2i:        [{ mode:"i2i",        label:"→ I2I",      field:"i2iImage" },
               { mode:"inpaint",    label:"→ Inpaint",  field:"inpaintImage" },
               { mode:"rebg",       label:"→ RE-BG",    field:"rebgImage" },
               { mode:"controlnet", label:"→ CN",        field:"controlnetImage" },
               { mode:"face_redraw",label:"→ Redraw",   field:"faceImage" },
               { mode:"upscale",    label:"→ Upscale",  field:"upscaleImage" }],
  i2i:        [{ mode:"inpaint",    label:"→ Inpaint",  field:"inpaintImage" },
               { mode:"rebg",       label:"→ RE-BG",    field:"rebgImage" },
               { mode:"controlnet", label:"→ CN",        field:"controlnetImage" },
               { mode:"face_redraw",label:"→ Redraw",   field:"faceImage" },
               { mode:"upscale",    label:"→ Upscale",  field:"upscaleImage" }],
  inpaint:    [{ mode:"i2i",        label:"→ I2I",      field:"i2iImage" },
               { mode:"rebg",       label:"→ RE-BG",    field:"rebgImage" },
               { mode:"controlnet", label:"→ CN",        field:"controlnetImage" },
               { mode:"face_redraw",label:"→ Redraw",   field:"faceImage" },
               { mode:"upscale",    label:"→ Upscale",  field:"upscaleImage" }],
  rebg:       [{ mode:"i2i",        label:"→ I2I",      field:"i2iImage" },
               { mode:"inpaint",    label:"→ Inpaint",  field:"inpaintImage" },
               { mode:"controlnet", label:"→ CN",        field:"controlnetImage" },
               { mode:"face_redraw",label:"→ Redraw",   field:"faceImage" },
               { mode:"upscale",    label:"→ Upscale",  field:"upscaleImage" }],
  controlnet: [{ mode:"i2i",        label:"→ I2I",      field:"i2iImage" },
               { mode:"inpaint",    label:"→ Inpaint",  field:"inpaintImage" },
               { mode:"rebg",       label:"→ RE-BG",    field:"rebgImage" },
               { mode:"face_redraw",label:"→ Redraw",   field:"faceImage" },
               { mode:"upscale",    label:"→ Upscale",  field:"upscaleImage" }],
  face_redraw:[{ mode:"i2i",        label:"→ I2I",      field:"i2iImage" },
               { mode:"inpaint",    label:"→ Inpaint",  field:"inpaintImage" },
               { mode:"rebg",       label:"→ RE-BG",    field:"rebgImage" },
               { mode:"controlnet", label:"→ CN",        field:"controlnetImage" },
               { mode:"upscale",    label:"→ Upscale",  field:"upscaleImage" }],
  upscale:    [{ mode:"i2i",        label:"→ I2I",      field:"i2iImage" },
               { mode:"inpaint",    label:"→ Inpaint",  field:"inpaintImage" },
               { mode:"rebg",       label:"→ RE-BG",    field:"rebgImage" },
               { mode:"controlnet", label:"→ CN",        field:"controlnetImage" },
               { mode:"face_redraw",label:"→ Redraw",   field:"faceImage" }],
};

// ── Toast popup ────────────────────────────────────────────────────────────
function showPopup(msg, isError=true) {
  const t=el("div",{style:{
    position:"fixed",top:"60px",left:"50%",transform:"translateX(-50%)",zIndex:"99999",
    padding:"12px 22px",borderRadius:"8px",
    background:isError?"#3a0a0a":"#0a2a0a",
    border:`1px solid ${isError?C.err:"#4caf50"}`,
    color:isError?C.err:"#81c784",
    fontSize:"13px",fontFamily:"'Segoe UI',sans-serif",
    boxShadow:"0 4px 20px rgba(0,0,0,0.6)",maxWidth:"440px",textAlign:"center",
  },text:msg});
  document.body.appendChild(t);
  setTimeout(()=>{ if(t.parentNode) t.parentNode.removeChild(t); },3500);
}

// ── Compare view ──────────────────────────────────────────────────────────
function createCompareView(originalURL, resultURL) {
  const container=el("div",{style:{position:"relative",width:"100%",height:"100%",overflow:"hidden",borderRadius:"8px"}});
  const resultImg=el("img",{src:resultURL,style:{position:"absolute",inset:"0",width:"100%",height:"100%",objectFit:"contain"}});
  const origWrap =el("div",{style:{position:"absolute",inset:"0 auto 0 0",width:"100%",overflow:"hidden"}});
  const origImg  =el("img",{src:originalURL,style:{position:"absolute",inset:"0",width:`${PREVIEW_SIZE}px`,height:"100%",objectFit:"contain"}});
  origWrap.appendChild(origImg);
  const divider=el("div",{style:{
    position:"absolute",top:"0",bottom:"0",left:"100%",
    width:"3px",background:"rgba(255,255,255,0.85)",cursor:"ew-resize",zIndex:"10",
  }});
  const handle=el("div",{style:{
    position:"absolute",top:"50%",left:"-10px",transform:"translateY(-50%)",
    width:"20px",height:"40px",borderRadius:"10px",
    background:C.lime,display:"flex",alignItems:"center",justifyContent:"center",
    color:"#fff",fontSize:"11px",userSelect:"none",
  },text:"⟺"});
  divider.appendChild(handle);
  let pos=0;
  function update(p){pos=Math.max(0,Math.min(100,p));origWrap.style.width=pos+"%";divider.style.left=pos+"%";}
  update(0);
  divider.addEventListener("pointerdown",e=>{
    divider.setPointerCapture(e.pointerId);
    const mv=e2=>{const r=container.getBoundingClientRect();update((e2.clientX-r.left)/r.width*100);};
    const up=()=>{divider.removeEventListener("pointermove",mv);divider.removeEventListener("pointerup",up);};
    divider.addEventListener("pointermove",mv); divider.addEventListener("pointerup",up);
  });
  container.appendChild(resultImg); container.appendChild(origWrap); container.appendChild(divider);
  return container;
}

app.registerExtension({
  name:"ZImageONE_TJ.v1",
  async beforeRegisterNodeDef(nodeType,nodeData){
    if(nodeData.name!=="ZImageTurboOneNode") return;

    nodeType.prototype.onNodeCreated=function(){
      this.color="#7612DA"; this.bgcolor=C.bg0; this.title_color="#ffffff";
      this.resizable=false; this.size=[NODE_W,NODE_H];
      this._buildUI();
    };
    nodeType.prototype.onConfigure=function(){ this.size=[NODE_W,NODE_H+(this._extraH||0)]; };
    nodeType.prototype.onResize=function(){ this.size=[NODE_W,NODE_H+(this._extraH||0)]; };
    nodeType.prototype.onDrawConnections=function(){};
    nodeType.prototype.getSlotMenuOptions=function(){return[];};

    nodeType.prototype._buildUI=function(){
      const self=this;
      self._extraH = 0;
      const state=defaultState(loadState());
      state.useModelOverride = false; // 오버라이드는 항상 비활성으로 시작 (저장 무시)
      const persist=()=>saveState(state);
      const appConfig={output_mode_visible:true,save_subfolder:""};
      const modeResults={};  // per-mode result storage (in-memory)

      let compareEnabled=true;   // compare toggle state (기본 ON)

      function publishOutput(im){
        setLastImage(self.id,im);
        const hasLink=self.outputs?.[0]?.links?.length>0;
        if(hasLink){try{app.queuePrompt(0);}catch(e){}}
      }

      if(!document.getElementById("zit-styles")){
        const s=document.createElement("style");
        s.id="zit-styles";
        s.textContent=`
          @keyframes zit-spin{to{transform:rotate(360deg)}}
          .zit-lp::-webkit-scrollbar{width:4px}
          .zit-lp::-webkit-scrollbar-track{background:transparent}
          .zit-lp::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px}
        `;
        document.head.appendChild(s);
      }

      // ── Root ────────────────────────────────────────────────────────────
      const root=el("div",{style:{
        width:`${NODE_W}px`,height:`${ROOT_H}px`,boxSizing:"border-box",
        position:"relative",overflow:"hidden",
        background:C.bg0,borderRadius:"8px",
        padding:`${PAD}px ${PAD}px ${BOTTOM_PAD}px ${PAD}px`,
        color:C.text,fontFamily:"'Segoe UI',sans-serif",
      }});

      const OVERRIDE_SLOTS = [
        { name: "model_override", type: "MODEL" },
        { name: "clip_override",  type: "CLIP" },
        { name: "vae_override",   type: "VAE" },
      ];
      const OVERRIDE_SLOT_NAMES = OVERRIDE_SLOTS.map(s => s.name);
      function syncOverrideSlots(enabled) {
        if (enabled) {
          for (const { name, type } of OVERRIDE_SLOTS) {
            if (!self.inputs?.find(i => i.name === name))
              self.addInput(name, type);
          }
        } else {
          for (let i = (self.inputs?.length ?? 0) - 1; i >= 0; i--) {
            if (OVERRIDE_SLOT_NAMES.includes(self.inputs[i]?.name))
              self.removeInput(i);
          }
        }
        // 슬롯 수에 따라 노드 높이 동기화 (DOM은 ROOT_H 고정)
        self._extraH = enabled ? OVERRIDE_SLOTS.length * 20 : 0;
        const newH = NODE_H + self._extraH;
        self.size = [NODE_W, newH];
        self.setSize?.([NODE_W, newH]);
        self.graph?.setDirtyCanvas?.(true, true);
      }

      const ctx={
        persist,appConfig,availableLoras:[],rootEl:root,
        publishOutput,showPopup,
        syncOverrideSlots,
        resizeNode(){self.size=[NODE_W,NODE_H];self.setSize?.([NODE_W,NODE_H]);self.graph?.dirty_canvas?.(true,true);},
      };

      // 초기 슬롯 동기화
      syncOverrideSlots(state.useModelOverride || false);

      // ── topBar ──────────────────────────────────────────────────────────
      const topBar=el("div",{style:{
        display:"flex",alignItems:"center",gap:"6px",
        height:`${TOPBAR_H}px`,marginBottom:`${PAD}px`,flexShrink:"0",
      }});
      const pillsWrap=el("div",{style:{flex:"1"}});
      let settingsOv,galleryOv,templateOv,promptExpandOv;

      // ── Reset button ─────────────────────────────────────────────────────
      const resetBtn=iconBtn("↺",t("reset_tooltip"),()=>{
        if(!confirm(t("reset_confirm"))) return;
        try{ localStorage.removeItem(LS_KEY); }catch(e){}
        const { model, textEncoder } = state;
        const fresh=defaultState({});
        Object.keys(state).forEach(k=>{ delete state[k]; });
        Object.assign(state,fresh);
        if (model)       state.model       = model;
        if (textEncoder) state.textEncoder = textEncoder;
        compareEnabled=false;
        applyCompareBtnStyle();
        compareBtn.title="Compare: OFF";
        // 프리뷰 초기화
        finalImg.src=""; finalImg.style.display="none";
        placeholder.style.display="flex";
        Object.keys(modeResults).forEach(k=>{ delete modeResults[k]; });
        renderPills(); renderMode();
        showPopup(t("reset_done"),false);
      });
      resetBtn.style.cssText+=`background:#ffffff;color:#7612DA;border:2px solid #7612DA;border-radius:6px;padding:4px 8px;font-weight:700;`;
      resetBtn.onmouseenter=()=>{ resetBtn.style.background="#f0e0ff"; };
      resetBtn.onmouseleave=()=>{ resetBtn.style.background="#ffffff"; };

      // Compare toggle button
      function applyCompareBtnStyle() {
        if (compareEnabled) {
          compareBtn.style.background = "#ffffff";
          compareBtn.style.color      = "#7612DA";
          compareBtn.style.border     = "2px solid #7612DA";
          compareBtn.onmouseenter = () => { compareBtn.style.background = "#f0e0ff"; };
          compareBtn.onmouseleave = () => { compareBtn.style.background = "#ffffff"; };
        } else {
          compareBtn.style.background = C.bg2;
          compareBtn.style.color      = C.muted;
          compareBtn.style.border     = `1px solid ${C.border}`;
          compareBtn.onmouseenter = () => { compareBtn.style.background = C.bg3||C.bg2; };
          compareBtn.onmouseleave = () => { compareBtn.style.background = C.bg2; };
        }
      }
      const compareBtn=iconBtn("⇌","Compare: OFF",()=>{
        compareEnabled=!compareEnabled;
        compareBtn.title=compareEnabled?"Compare: ON":"Compare: OFF";
        applyCompareBtnStyle();
        restorePreview();
      });
      compareBtn.style.cssText+=`border-radius:6px;padding:4px 8px;font-weight:700;font-size:13px;`;
      applyCompareBtnStyle();

      const unloadBtn=iconBtn("🗑","Unload RAM/VRAM",async()=>{
        unloadBtn.style.opacity="0.5";
        try{await freeMemory();showPopup("Models unloaded.",false);}
        catch(e){showPopup("Unload failed: "+(e.message||e));}
        setTimeout(()=>{unloadBtn.style.opacity="1";},2000);
      });
      let helpOv;
      const helpBtn=iconBtn("?",t("help_tooltip"),()=>helpOv?.show());
      helpBtn.style.cssText+=`font-weight:700;font-size:13px;`;

      topBar.appendChild(pillsWrap);
      topBar.appendChild(resetBtn);
      topBar.appendChild(compareBtn);
      topBar.appendChild(unloadBtn);
      topBar.appendChild(iconBtn("⚙","Settings",()=>settingsOv?.show()));
      topBar.appendChild(iconBtn("🖼","Gallery", ()=>galleryOv?.show()));
      topBar.appendChild(helpBtn);
      root.appendChild(topBar);

      // ── mainRow ─────────────────────────────────────────────────────────
      const mainRow=el("div",{style:{
        display:"flex",gap:`${PAD}px`,height:`${RIGHT_H}px`,flexShrink:"0",
      }});

      const leftOuter=el("div",{style:{
        width:`${LEFT_W}px`,flexShrink:"0",height:`${RIGHT_H}px`,
        display:"flex",flexDirection:"column",
      }});
      const leftPanel=el("div",{style:{
        flex:"1",overflowY:"auto",overflowX:"hidden",
        display:"flex",flexDirection:"column",gap:"6px",
      }});
      leftPanel.className="zit-lp";
      leftOuter.appendChild(leftPanel);

      const rightPanel=el("div",{style:{
        flex:"1",minWidth:`${PREVIEW_SIZE}px`,display:"flex",flexDirection:"column",
        gap:`${PAD}px`,height:`${RIGHT_H}px`,
      }});

      // Preview box
      const previewBox=el("div",{style:{
        width:`${PREVIEW_SIZE}px`,height:`${PREVIEW_SIZE}px`,flexShrink:"0",
        background:"#000",borderRadius:"8px",border:`1px solid ${C.border}`,
        position:"relative",display:"flex",alignItems:"center",justifyContent:"center",
        overflow:"hidden",alignSelf:"flex-start",
      }});
      const placeholder=el("div",{text:"Generate to see result",style:{color:C.muted,fontSize:"12px"}});
      const finalImg=el("img",{style:{maxWidth:"100%",maxHeight:"100%",objectFit:"contain",display:"none"}});
      const loadingOv=el("div",{style:{
        position:"absolute",inset:"0",background:"rgba(0,0,0,0.5)",
        display:"none",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"12px",
        zIndex:"10",
      }});
      const spinner=el("div",{style:{
        width:"44px",height:"44px",
        border:`3px solid ${C.border}`,borderTop:`3px solid ${C.lime}`,
        borderRadius:"50%",animation:"zit-spin 0.8s linear infinite",
      }});
      loadingOv.appendChild(spinner);
      loadingOv.appendChild(el("div",{text:"Generating image…",style:{color:C.text,fontSize:"12px"}}));

      const clearBtn=el("button",{text:"✕",type:"button",title:"Clear result",style:{
        position:"absolute",top:"6px",right:"6px",zIndex:"5",
        background:"rgba(0,0,0,0.65)",color:"#fff",border:"none",
        borderRadius:"4px",width:"22px",height:"22px",cursor:"pointer",fontSize:"12px",padding:"0",display:"none",
      }});
      clearBtn.addEventListener("click",()=>{ delete modeResults[state.mode]; resetZoom(); resetPreview(); renderSendTo(); });

      // ── Zoom / Pan ────────────────────────────────────────────────────────
      let zoomEnabled=true, zoomScale=1, panX=0, panY=0;
      let isPanning=false, panStartX=0, panStartY=0, panStartTX=0, panStartTY=0;

      function applyZoom(){
        finalImg.style.transform=`scale(${zoomScale}) translate(${panX}px,${panY}px)`;
        finalImg.style.transformOrigin="center center";
        finalImg.style.cursor=zoomScale>1?"grab":"default";
      }
      function resetZoom(){ zoomScale=1; panX=0; panY=0; applyZoom(); }

      const zoomLockBtn=el("button",{text:"🔓",type:"button",title:"Scroll zoom on/off",style:{
        position:"absolute",top:"6px",right:"32px",zIndex:"5",
        background:"rgba(0,0,0,0.65)",color:"#fff",border:"none",
        borderRadius:"4px",width:"22px",height:"22px",cursor:"pointer",fontSize:"11px",padding:"0",display:"none",
      }});
      zoomLockBtn.addEventListener("click",()=>{
        zoomEnabled=!zoomEnabled;
        zoomLockBtn.textContent=zoomEnabled?"🔓":"🔒";
        if(!zoomEnabled) resetZoom();
      });

      previewBox.addEventListener("wheel",e=>{
        if(!zoomEnabled||!modeResults[state.mode]) return;
        e.preventDefault();
        zoomScale=Math.max(1,Math.min(8,zoomScale*(e.deltaY<0?1.12:0.9)));
        if(zoomScale===1){panX=0;panY=0;}
        applyZoom();
      },{passive:false});

      previewBox.addEventListener("mousedown",e=>{
        if(!zoomEnabled||zoomScale<=1||e.button!==0) return;
        isPanning=true;
        panStartX=e.clientX; panStartY=e.clientY;
        panStartTX=panX; panStartTY=panY;
        finalImg.style.cursor="grabbing";
        e.preventDefault();
      });
      document.addEventListener("mousemove",e=>{
        if(!isPanning) return;
        panX=panStartTX+(e.clientX-panStartX)/zoomScale;
        panY=panStartTY+(e.clientY-panStartY)/zoomScale;
        applyZoom();
      });
      document.addEventListener("mouseup",()=>{
        if(isPanning){isPanning=false; finalImg.style.cursor=zoomScale>1?"grab":"default";}
      });

      previewBox.addEventListener("dblclick",()=>{
        const mr=modeResults[state.mode];
        if(mr) openFullscreen(mr.url);
      });

      function resetPreview(){
        previewBox.innerHTML="";
        previewBox.appendChild(placeholder);
        previewBox.appendChild(finalImg);
        previewBox.appendChild(loadingOv);
        previewBox.appendChild(zoomLockBtn);
        previewBox.appendChild(clearBtn);
        placeholder.style.display="block"; finalImg.style.display="none"; loadingOv.style.display="none";
        zoomLockBtn.style.display="none"; clearBtn.style.display="none";
        resetZoom();
      }
      resetPreview();

      function restorePreview(){
        const mr=modeResults[state.mode];
        if(!mr){resetPreview();return;}
        previewBox.innerHTML="";
        previewBox.appendChild(loadingOv);
        previewBox.appendChild(zoomLockBtn);
        previewBox.appendChild(clearBtn);
        clearBtn.style.display="block"; zoomLockBtn.style.display="block";
        if(compareEnabled && mr.originalURL){
          previewBox.appendChild(createCompareView(mr.originalURL,mr.url));
          resetZoom();
        }else{
          finalImg.src=mr.url; finalImg.style.display="block"; placeholder.style.display="none";
          previewBox.appendChild(placeholder); previewBox.appendChild(finalImg);
        }
        loadingOv.style.display="none";
      }

      ctx.showResult=(im,originalURL)=>{
        const resultURL=`/view?filename=${encodeURIComponent(im.filename)}&subfolder=${encodeURIComponent(im.subfolder||"")}&type=${im.type||"output"}&t=${Date.now()}`;
        modeResults[state.mode]={im,url:resultURL,originalURL:originalURL||null};
        restorePreview(); renderSendTo(); publishOutput(im);
      };

      // Send-to strip + Output toggle
      const sendToWrap=el("div",{style:{
        height:`${SEND_TO_H}px`,flexShrink:"0",
        display:"flex",alignItems:"center",gap:"8px",overflow:"hidden",
      }});
      const sendLeft =el("div",{style:{flex:"1",display:"flex",flexWrap:"wrap",alignItems:"center",gap:"4px"}});
      const sendRight=el("div",{style:{display:"flex",alignItems:"center",gap:"4px",flexShrink:"0"}});
      sendToWrap.appendChild(sendLeft); sendToWrap.appendChild(sendRight);

      function renderSendTo(){
        clear(sendLeft);
        const targets=SEND_TO[state.mode]||[];
        if(!targets.length) return;
        sendLeft.appendChild(el("div",{text:"Send to:",style:{color:C.muted,fontSize:"11px",flexShrink:"0"}}));
        targets.forEach(t=>{
          const btn=el("button",{text:t.label,type:"button",style:{
            cursor:"pointer",fontFamily:"inherit",fontSize:"11px",
            padding:"3px 8px",borderRadius:"12px",
            background:C.bg2,color:C.text,border:`1px solid ${C.border}`,
          }});
          btn.addEventListener("mouseenter",()=>btn.style.background=C.bg3);
          btn.addEventListener("mouseleave",()=>btn.style.background=C.bg2);
          btn.addEventListener("click",async()=>{
            const mr=modeResults[state.mode];
            if(!mr){showPopup("No image in this mode — generate first.");return;}
            btn.disabled=true; btn.textContent="Copying…";
            try{
              const n=await copyOutputToInput(mr.im.filename,mr.im.subfolder||"",mr.im.type||"output");
              state[t.field]=n; if(t.extra) t.extra(state);
              if(t.mode===state.mode && modeHandle?.setImage){
                modeHandle.setImage(n); persist();
              } else {
                state.mode=t.mode; persist(); renderPills(); renderMode();
              }
            }catch(e){showPopup("Copy failed: "+(e.message||e));btn.disabled=false;btn.textContent=t.label;}
          });
          sendLeft.appendChild(btn);
        });
      }

      function renderToggle(){
        clear(sendRight);
        sendRight.appendChild(el("div",{text:"Output:",style:{color:C.muted,fontSize:"11px"}}));
        ["preview","save"].forEach(key=>{
          const active=state.outputMode===key;
          const text=key==="save"?"💾 Save":"👁 Preview";
          const btn=el("button",{text,type:"button",style:{
            cursor:"pointer",fontFamily:"inherit",fontSize:"11px",
            padding:"4px 10px",borderRadius:"20px",
            background:active?C.lime:C.bg2,color:"#ffffff",
            border:`1px solid ${active?C.lime:C.border}`,fontWeight:active?"700":"400",
          },onclick:()=>{state.outputMode=key;persist();renderToggle();}});
          sendRight.appendChild(btn);
        });
      }
      renderToggle();
      ctx.renderToggle=renderToggle; ctx._refreshToggle=renderToggle;

      // Prompt header — with expand (🔍) and template (📋) buttons
      const promptWrap=el("div",{style:{height:`${PROMPT_H}px`,flexShrink:"0",display:"flex",flexDirection:"column",gap:"4px"}});
      const charCount=el("span",{style:{color:C.muted,fontSize:"10px",marginLeft:"6px"}});
      const promptHdr=el("div",{style:{display:"flex",alignItems:"center",height:`${PROMPT_LBL}px`}});
      promptHdr.appendChild(el("div",{text:"PROMPT",style:{color:C.muted,fontSize:"11px",textTransform:"uppercase",letterSpacing:"0.04em"}}));
      promptHdr.appendChild(charCount);

      const expandBtn=button("🔍",null,"default");
      expandBtn.title="Expand prompt editor";
      expandBtn.onclick=()=>promptExpandOv?.show();
      expandBtn.style.cssText+="padding:2px 6px;font-size:11px;margin-left:auto;";

      const tplBtn=button("📋",null,"default");
      tplBtn.title="Load Template"; tplBtn.onclick=()=>templateOv?.show();
      tplBtn.style.cssText+="padding:2px 6px;font-size:11px;";

      promptHdr.appendChild(expandBtn); promptHdr.appendChild(tplBtn);

      const promptTA=el("textarea",{
        placeholder:"Describe the image…",
        style:{
          flex:"1",width:"100%",boxSizing:"border-box",
          background:C.bg2,color:C.text,
          border:`1px solid ${C.border}`,borderRadius:"6px",
          padding:"7px",fontSize:"13px",fontFamily:"inherit",
          outline:"none",resize:"none",overflowY:"auto",
        },
      });

      function getModePrompt(mode){return state.promptsByMode?.[mode]||"";}
      function setModePrompt(mode,val){
        if(!state.promptsByMode) state.promptsByMode={};
        state.promptsByMode[mode]=val; state.prompt=val;
      }
      promptTA.value=getModePrompt(state.mode);
      function updateCount(){
        const n=getModePrompt(state.mode).trim().length;
        charCount.textContent=` (${n} chars${n<30?" ⚠":""})`;
        charCount.style.color=n<30?C.warn:C.muted;
      }
      updateCount();
      promptTA.addEventListener("input",()=>{setModePrompt(state.mode,promptTA.value);persist();updateCount();});
      promptTA.addEventListener("focus",()=>promptTA.style.borderColor=C.lime);
      promptTA.addEventListener("blur", ()=>promptTA.style.borderColor=C.border);
      promptWrap.appendChild(promptHdr); promptWrap.appendChild(promptTA);

      rightPanel.appendChild(previewBox);
      rightPanel.appendChild(sendToWrap);
      rightPanel.appendChild(promptWrap);
      mainRow.appendChild(leftOuter); mainRow.appendChild(rightPanel);
      root.appendChild(mainRow);

      // ── Seed + Generate ─────────────────────────────────────────────────
      const seedInput=numberField(state.seed,v=>{state.seed=v;persist();},1);
      const seedModeDD=select(
        [{value:"randomize",label:"Random"},{value:"fixed",label:"Fixed"},{value:"increment",label:"+1"},{value:"decrement",label:"-1"}],
        state.seedMode,v=>{state.seedMode=v;persist();}
      );
      const seedRow=el("div",{style:{display:"flex",flexDirection:"column",gap:"4px",paddingTop:"6px",flexShrink:"0",borderTop:`1px solid ${C.border}`}});
      seedRow.appendChild(panel([row([col([label("Seed"),seedInput]),col([label("Mode"),seedModeDD])])]));

      const genBtn=button("▶ Generate",null,"primary");
      genBtn.style.cssText+="width:100%;padding:11px;font-size:13px;";
      const stopBtn=button("■ Stop",async()=>{
        await interrupt();
        // Force re-enable generate button regardless of async state
        genBtn.disabled=false; genBtn.textContent="▶ Generate";
        loadingOv.style.display="none";
        if(!modeResults[state.mode]){placeholder.style.display="block";finalImg.style.display="none";}
      });
      stopBtn.style.flexShrink="0";

      const genRow=el("div",{style:{display:"flex",flexDirection:"column",gap:"4px"}});
      genRow.appendChild(row([genBtn,stopBtn]));
      seedRow.appendChild(genRow);

      let modeHandle=null;

      // ── 연결된 prompt_override 슬롯 값 읽기 ────────────────────────────────
      // LiteGraph 그래프에서 직접 읽으므로 실행 없이 즉시 사용 가능.
      // Primitive / String 노드처럼 위젯 값이 메모리에 있는 노드에서 동작.
      function getOverrideSlot(slotName) {
        try {
          const slotIdx = self.inputs?.findIndex(i => i.name === slotName);
          if (slotIdx == null || slotIdx < 0) return "";
          const linkId = self.inputs[slotIdx]?.link;
          if (linkId == null) return "";
          const link = app.graph.links[linkId];
          if (!link) return "";
          const srcNode = app.graph.getNodeById(link.origin_id);
          if (!srcNode) return "";
          return srcNode.widgets?.[link.origin_slot]?.value
              ?? srcNode.widgets?.[0]?.value
              ?? "";
        } catch(e) { return ""; }
      }
      const getPromptOverride = () => getOverrideSlot("prompt_override");

      genBtn.onclick=async()=>{
        if(!modeHandle) return;
        // Model override 읽기
        if(state.useModelOverride) {
          state.modelOverride = getOverrideSlot("model_override");
          state.clipOverride  = getOverrideSlot("clip_override");
          state.vaeOverride   = getOverrideSlot("vae_override");
        } else {
          state.modelOverride = ""; state.clipOverride = ""; state.vaeOverride = "";
        }
        // Model validation (override 시 각 슬롯이 연결되어 있으면 검사 생략)
        const mOk = state.modelOverride || (state.model && state.model !== "none");
        const cOk = state.clipOverride  || (state.textEncoder && state.textEncoder !== "none");
        const vOk = state.vaeOverride   || (state.vae && state.vae !== "none");
        if(!mOk){ showPopup(t("err_no_model")); return; }
        if(!cOk){ showPopup(t("err_no_clip")); return; }
        if(!vOk){ showPopup(t("err_no_vae")); return; }

        genBtn.disabled=true; genBtn.textContent="Generating…";
        previewBox.appendChild(loadingOv);
        loadingOv.style.display="flex";
        let originalURL=null;
        try{
          state.promptOverride = getPromptOverride();
          await modeHandle.beforeGenerate?.();
          if(compareEnabled && typeof modeHandle.getSourceURL==="function") originalURL=modeHandle.getSourceURL();
          if(state.seedMode==="randomize") state.seed=randomSeed();
          else if(state.seedMode==="increment") state.seed=(state.seed||0)+1;
          else if(state.seedMode==="decrement") state.seed=Math.max(0,(state.seed||0)-1);
          seedInput.value=state.seed; persist();
          const graph=modeHandle.getGraph();
          const result=await queuePrompt(graph,{onProgress:()=>{}});
          const imgs=result?.output?.images;
          if(!imgs?.length) throw new Error("No output images returned.");
          ctx.showResult(imgs[0],originalURL);
          saveMeta(imgs[0].filename,imgs[0].subfolder||"",state);
        }catch(e){
          if(e.message !== "cancelled")
            showPopup("Generation error: "+(e.message||String(e)));
          loadingOv.style.display="none"; placeholder.style.display="block";
        }finally{
          state.promptOverride=""; state.modelOverride=""; state.clipOverride=""; state.vaeOverride="";
          genBtn.disabled=false; genBtn.textContent="▶ Generate";
        }
      };

      function renderMode(){
        clear(leftPanel);
        restorePreview(); renderSendTo();
        promptTA.value=getModePrompt(state.mode); updateCount();
        if(state.mode==="t2i"||state.mode==="i2i") modeHandle=mountT2II2ILeft(leftPanel,state,ctx);
        else if(state.mode==="inpaint")            modeHandle=mountInpaintLeft(leftPanel,state,ctx);
        else if(state.mode==="rebg")               modeHandle=mountReBGLeft(leftPanel,state,ctx);
        else if(state.mode==="controlnet")         modeHandle=mountControlNetLeft(leftPanel,state,ctx);
        else if(state.mode==="face_redraw")        modeHandle=mountFaceRedrawLeft(leftPanel,state,ctx);
        else if(state.mode==="upscale")            modeHandle=mountUpscaleLeft(leftPanel,state,ctx);
        leftOuter.appendChild(seedRow);
      }

      function renderPills(){
        clear(pillsWrap);
        pillsWrap.appendChild(modeBar(MODES,state.mode,key=>{
          state.mode=key;persist();renderPills();renderMode();
        }));
      }

      renderPills(); renderMode(); renderSendTo();

      // ── Overlays ─────────────────────────────────────────────────────────
      settingsOv=createSettingsOverlay(state,ctx);

      // Gallery send-to handler
      function onGallerySendTo(mode,field,extra,newFilename){
        state[field]=newFilename;
        if(extra) extra(state);
        if(mode===state.mode && modeHandle?.setImage){
          modeHandle.setImage(newFilename); persist();
        } else {
          state.mode=mode; persist(); renderPills(); renderMode();
        }
      }

      galleryOv=createGalleryOverlay(state,ctx,(meta)=>{
        const skip=new Set(["inpaintMaskOverlay","inpaintMaskDataURL","modeResults"]);
        Object.keys(meta).forEach(k=>{if(!skip.has(k)) state[k]=meta[k];});
        persist(); renderPills(); renderMode(); renderToggle();
      }, onGallerySendTo);

      templateOv=createTemplateOverlay(state,ctx,(prompt)=>{
        setModePrompt(state.mode,prompt); promptTA.value=prompt; persist(); updateCount();
      });

      // Prompt expand overlay
      const promptExpandEl=el("div",{style:{
        position:"absolute",inset:"0",zIndex:"9996",
        background:"rgba(11,11,11,0.97)",borderRadius:"inherit",
        display:"none",flexDirection:"column",padding:"12px",gap:"8px",boxSizing:"border-box",
      }});
      const pxTopRow=el("div",{style:{display:"flex",alignItems:"center",gap:"8px",flexShrink:"0"}});
      pxTopRow.appendChild(el("div",{text:"📝 Prompt Editor",style:{color:"#fff",fontSize:"14px",fontWeight:"700",flex:"1"}}));
      const pxApply=button("✓ Apply",()=>{
        setModePrompt(state.mode,pxTA.value);
        promptTA.value=pxTA.value; persist(); updateCount();
        promptExpandEl.style.display="none";
      },"primary");
      const pxClose=button("✕",()=>{promptExpandEl.style.display="none";},"danger");
      pxTopRow.appendChild(pxApply); pxTopRow.appendChild(pxClose);
      const pxTA=el("textarea",{
        placeholder:"Write your prompt here…",
        style:{
          flex:"1",width:"100%",boxSizing:"border-box",
          background:C.bg2,color:C.text,
          border:`1px solid ${C.border}`,borderRadius:"6px",
          padding:"10px",fontSize:"14px",fontFamily:"inherit",
          outline:"none",resize:"none",
        },
      });
      promptExpandEl.appendChild(pxTopRow);
      promptExpandEl.appendChild(pxTA);
      promptExpandOv={
        el:promptExpandEl,
        show(){promptExpandEl._tj_llm_onshow?.();promptExpandEl.style.display="flex";setTimeout(()=>pxTA.focus(),50);}
      };
      attachLLMPanel({promptExpandEl,pxTA,getModePrompt,setModePrompt,state,persist,updateCount,getPromptTA:()=>promptTA});

      // ── Help overlay ─────────────────────────────────────────────────────
      const HELP_SECTIONS = [
        { title: t("zhelp_s0_title"), body: t("zhelp_s0_body") },
        { title: t("zhelp_s1_title"), body: t("zhelp_s1_body") },
        { title: t("zhelp_s2_title"), body: t("zhelp_s2_body") },
        { title: t("zhelp_s3_title"), body: t("zhelp_s3_body") },
        { title: t("zhelp_s4_title"), body: t("zhelp_s4_body") },
        { title: t("zhelp_s5_title"), body: t("zhelp_s5_body") },
        { title: t("zhelp_s6_title"), body: t("zhelp_s6_body") },
        { title: t("zhelp_s7_title"), body: t("zhelp_s7_body") },
        { title: t("zhelp_s8_title"), body: t("zhelp_s8_body") },
        { title: t("zhelp_s9_title"), body: t("zhelp_s9_body") },
      ];

      const helpEl=el("div",{style:{
        position:"absolute",inset:"0",zIndex:"9998",
        background:"rgba(11,11,11,0.98)",borderRadius:"inherit",
        display:"none",flexDirection:"column",
        padding:"14px",gap:"0",boxSizing:"border-box",
      }});
      const helpTop=el("div",{style:{display:"flex",alignItems:"center",gap:"8px",flexShrink:"0",marginBottom:"10px"}});
      helpTop.appendChild(el("div",{
        text: t("help_title_zimage"),
        style:{color:"#ffffff",fontSize:"14px",fontWeight:"700",flex:"1"},
      }));
      const helpClose=button("✕",()=>{helpEl.style.display="none";},"danger");
      helpTop.appendChild(helpClose);
      helpEl.appendChild(helpTop);

      const helpBody=el("div",{style:{
        flex:"1",overflowY:"auto",display:"flex",flexDirection:"column",gap:"12px",
        paddingRight:"4px",
      }});
      helpBody.className="zit-lp";

      const URL_RE=/https?:\/\/[^\s]+/g;
      function renderHelpLine(line,block){
        const isIndent=line.startsWith("•")||line.startsWith(" ");
        const color=line.startsWith("•")?"#c8c8c8":isIndent?"#a0a0a0":C.text;
        const div=el("div",{style:{fontSize:"11.5px",lineHeight:"1.65",paddingLeft:isIndent?"8px":"0",color}});
        const urls=[...line.matchAll(URL_RE)];
        if(!urls.length){div.textContent=line||" ";}
        else{
          let last=0;
          urls.forEach(m=>{
            if(m.index>last)div.appendChild(document.createTextNode(line.slice(last,m.index)));
            const a=el("a",{href:m[0],target:"_blank",rel:"noopener",text:m[0],
              style:{color:C.lime,wordBreak:"break-all",fontSize:"11px"}});
            div.appendChild(a);last=m.index+m[0].length;
          });
          if(last<line.length)div.appendChild(document.createTextNode(line.slice(last)));
        }
        block.appendChild(div);
      }
      HELP_SECTIONS.forEach(sec=>{
        const block=el("div",{style:{
          background:C.bg1,border:`1px solid ${C.border}`,borderRadius:"8px",padding:"10px 12px",
        }});
        block.appendChild(el("div",{
          text:sec.title,
          style:{color:C.lime,fontSize:"12px",fontWeight:"700",marginBottom:"6px",letterSpacing:"0.04em"},
        }));
        sec.body.split("\n").forEach(line=>renderHelpLine(line,block));
        helpBody.appendChild(block);
      });

      helpEl.appendChild(helpBody);
      helpOv={el:helpEl, show(){helpEl.style.display="flex";}};

      root.appendChild(settingsOv.el);
      root.appendChild(galleryOv.el);
      root.appendChild(templateOv.el);
      root.appendChild(promptExpandEl);
      root.appendChild(helpEl);

      // ── ESC key: close topmost overlay ────────────────────────────────────
      document.addEventListener("keydown", e => {
        if (e.key !== "Escape") return;
        if (promptExpandEl.style.display !== "none") { promptExpandEl.style.display = "none"; return; }
        if (helpEl.style.display !== "none") { helpEl.style.display = "none"; return; }
        if (settingsOv?.el.style.display !== "none") { settingsOv.hide(); return; }
        if (galleryOv?.el.style.display !== "none") { galleryOv.el.style.display = "none"; return; }
        if (templateOv?.el.style.display !== "none") { templateOv.el.style.display = "none"; return; }
      });

      this.addDOMWidget("zit_ui","div",root,{
        getValue(){return null;}, setValue(){}, serialize:false,
        computeSize(){return [NODE_W,NODE_H+(self._extraH||0)];},
      });
      self.size=[NODE_W,NODE_H]; self.setSize?.([NODE_W,NODE_H]);
    };
  },
});

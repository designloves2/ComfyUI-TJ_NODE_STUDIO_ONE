// one_node_moss.js — Moss Image ONE STUDIO (TJ)
import { app } from "../../../scripts/app.js";
import { C, BRAND, NODE_W, PREVIEW_SIZE, LEFT_W, PAD,
         el, clear, loadState, saveState, defaultState, randomSeed, MANUAL_TEXT } from "./core_moss.js";
import { panel, label, button, row, col, modeBar, iconBtn, openFullscreen } from "../klein/ui_common.js";
import { queuePrompt, interrupt, setLastImage, saveMeta, copyOutputToInput } from "./api_moss.js";
import { createSettingsOverlay } from "./ui_app_settings_moss.js";
import { attachLLMPanel } from "../shared/llm_panel.js";
import { createGalleryOverlay } from "./ui_gallery_moss.js";
import { mountT2ILeft } from "./ui_t2i_moss.js";
import { mountI2ILeft } from "./ui_i2i_moss.js";
import { mossSystemPrompt } from "./system_prompt_moss.js";
import { mountInpaintLeft } from "./ui_inpaint_moss.js";
import { mountR2ILeft } from "./ui_r2i_moss.js";
import { attachNodeState, restoreNodeState } from "../shared/node_state.js";
import { resolvePipeOverrides, applyOverridesTemp, labelPipeInput } from "../shared/promptdb_pipe.js";
import { summarizeRun } from "../shared/run_summary.js";
import { addLivePreview, listenLivePreview, showStepBar } from "../shared/live_preview.js";
import { createOverrideToggle } from "../shared/override_toggle.js";
import { OUTER_W, OUTER_H } from "../shared/node_size.js";
import { attachPanZoom, createCompareView } from "../shared/pan_zoom.js";
import { createImagePromptBilingual } from "../shared/bilingual_image.js";

// ── Layout ───────────────────────────────────────────────────────────────────
const TOPBAR_H    = 40;
const BOTTOM_PAD  = 20;
const SEND_TO_H   = 32;
const PROMPT_LBL  = 18;
// The node's outer size is fixed (node_size.js). Its UI fills what is left of it after the node body's margin and the
// slot rows (image / prompt / settings outputs): the left menu keeps LEFT_W, the preview and the prompt take the extra
// width, and the prompt field takes the extra height, so nothing is left empty.
const UI_W        = OUTER_W - 30;
const UI_H        = OUTER_H - 40 - 3 * 20;
const PROMPT_TA_H = 96 + Math.max(0, UI_H - (PAD + TOPBAR_H + PAD + PREVIEW_SIZE + PAD + SEND_TO_H + PAD + PROMPT_LBL + 4 + 96 + BOTTOM_PAD));
const PROMPT_H    = PROMPT_LBL + 4 + PROMPT_TA_H;
const RIGHT_H     = PREVIEW_SIZE + PAD + SEND_TO_H + PAD + PROMPT_H;
const ROOT_H      = PAD + TOPBAR_H + PAD + RIGHT_H + BOTTOM_PAD;
const NODE_MW     = OUTER_W;
const NODE_MH     = OUTER_H;

const MODES = [
  { key: "t2i",     label: "T2I",          enabled: true },
  { key: "i2i",     label: "I2I",          enabled: true },
  { key: "r2i",     label: "R2I (bboxes)", enabled: true },
  { key: "inpaint", label: "INPAINT",      enabled: true },
];

// Send-to targets per mode: where a generated result can be copied as the next mode's source image. T2I and R2I draw
// from text (and boxes), so they are not targets themselves.
const TO_I2I     = { mode:"i2i",     label:"→ I2I",     field:"i2iImage"     };
const TO_INPAINT = { mode:"inpaint", label:"→ Inpaint", field:"inpaintImage" };
const SEND_TO = {
  t2i:     [TO_I2I, TO_INPAINT],
  i2i:     [TO_INPAINT],
  inpaint: [TO_I2I],
  r2i:     [TO_I2I, TO_INPAINT],
};

// ── Compare view (source vs result, for control modes) ───────────────────────

// ── Main extension ────────────────────────────────────────────────────────────
app.registerExtension({
  name: "TJ.MossImageONE.v1",

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "MossImageOneTJNode") return;

    nodeType.prototype.onNodeCreated = function () { labelPipeInput(this);
      this.color       = BRAND;
      this.bgcolor     = C.bg0;
      this.title_color = "#ffffff";
      this.resizable   = false;
      this.size        = [NODE_MW, NODE_MH];
      this._buildUI();
    };
    nodeType.prototype.onConfigure = function () { labelPipeInput(this);
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

      if (!document.getElementById("moss-v1-styles")) {
        const s = document.createElement("style"); s.id = "moss-v1-styles";
        s.textContent = `@keyframes mossv1-spin{to{transform:rotate(360deg)}}.mossv1-lp::-webkit-scrollbar{width:4px}.mossv1-lp::-webkit-scrollbar-track{background:transparent}.mossv1-lp::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px}`;
        document.head.appendChild(s);
      }

      const ctx = { persist, appConfig, availableLoras: [], _rerenderLoras: null, rootEl: null, showPopup: null, renderToggle: null, _refreshToggle: null };

      // ── Root ──────────────────────────────────────────────────────────────
      const root = el("div", { style:{
        width:`${UI_W}px`, height:`${ROOT_H}px`, boxSizing:"border-box",
        position:"relative", overflow:"hidden",
        background:C.bg0, borderRadius:"8px",
        padding:`${PAD}px ${PAD}px ${BOTTOM_PAD}px ${PAD}px`,
        color:C.text, fontFamily:"'Segoe UI',sans-serif",
      }});
      ctx.rootEl = root;

      let popTimer;
      function showPopup(msg, isError=true) {
        let pop = root.querySelector(".mossv1-pop");
        if (!pop) {
          pop = el("div",{style:{position:"absolute",bottom:"30px",left:"50%",transform:"translateX(-50%)",background:C.bg2,border:`1px solid ${C.border}`,borderRadius:"6px",padding:"6px 14px",fontSize:"11px",color:C.text,zIndex:"10001",maxWidth:"80%",textAlign:"center",pointerEvents:"none"}});
          pop.className="mossv1-pop"; root.appendChild(pop);
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
        const { model, textEncoder, vae } = state;
        Object.assign(state, defaultState({}));
        if (model) state.model=model; if (textEncoder) state.textEncoder=textEncoder; if (vae) state.vae=vae;
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
      topBar.appendChild(createOverrideToggle(state, persist));
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
      leftPanel.className = "mossv1-lp";
      leftOuter.appendChild(leftPanel);
      const rightPanel = el("div",{style:{flex:"1",minWidth:`${PREVIEW_SIZE}px`,display:"flex",flexDirection:"column",gap:`${PAD}px`,height:`${RIGHT_H}px`}});

      // Preview box
      const previewBox = el("div",{style:{width:"100%",height:`${PREVIEW_SIZE}px`,flexShrink:"0",background:"#000",borderRadius:"8px",border:`1px solid ${C.border}`,position:"relative",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",alignSelf:"flex-start"}});
      const placeholder = el("div",{text:"Generate to see result",style:{color:C.muted,fontSize:"12px"}});
      const finalImg    = el("img",{style:{width:"100%",height:"100%",objectFit:"contain",display:"none"}});
      const loadingOv   = el("div",{style:{position:"absolute",inset:"0",background:"rgba(0,0,0,0.5)",display:"none",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"12px",zIndex:"10"}});
      const spinner     = el("div",{style:{width:"44px",height:"44px",border:`3px solid ${C.border}`,borderTop:`3px solid ${BRAND}`,borderRadius:"50%",mosstion:"mossv1-spin 0.8s linear infinite"}});
      loadingOv.appendChild(spinner); loadingOv.appendChild(el("div",{text:"Generating…",style:{color:C.text,fontSize:"12px"}}));
      const clearBtn = el("button",{type:"button",text:"✕",title:"Clear result",style:{position:"absolute",top:"6px",right:"6px",zIndex:"5",background:"rgba(0,0,0,0.65)",color:"#fff",border:"none",borderRadius:"4px",width:"22px",height:"22px",cursor:"pointer",fontSize:"12px",padding:"0",display:"none"}});
      clearBtn.addEventListener("click",()=>{ delete modeResults[state.mode]; resetZoom(); resetPreview(); });

      // Zoom / Pan
      let zoomEnabled = true;
      function resetZoom() { pz.reset(); }
      const zoomLockBtn = el("button",{type:"button",text:"🔓",title:"Scroll zoom on/off",style:{position:"absolute",top:"6px",right:"32px",zIndex:"5",background:"rgba(0,0,0,0.65)",color:"#fff",border:"none",borderRadius:"4px",width:"22px",height:"22px",cursor:"pointer",fontSize:"11px",padding:"0",display:"none"}});
      zoomLockBtn.addEventListener("click",()=>{ zoomEnabled=!zoomEnabled; zoomLockBtn.textContent=zoomEnabled?"🔓":"🔒"; if(!zoomEnabled)resetZoom(); });
      // wheel = zoom · left-drag = pan · double-click = fit (shared/pan_zoom.js); the lock button switches it off
      const pz = attachPanZoom(previewBox, () => [finalImg], { enabled: () => zoomEnabled && !!modeResults[state.mode] });

      function resetPreview(){
        previewBox.innerHTML=""; previewBox.appendChild(placeholder); previewBox.appendChild(finalImg); previewBox.appendChild(loadingOv); previewBox.appendChild(zoomLockBtn); previewBox.appendChild(clearBtn);
        placeholder.style.display="block"; finalImg.style.display="none"; loadingOv.style.display="none"; zoomLockBtn.style.display="none"; clearBtn.style.display="none"; resetZoom();
      }
      resetPreview();

      // live sampling frames (ModelPreviewOverrideKJ) paint over the box until the final image replaces them
      const stopLive = listenLivePreview(self, (url, step, total) => {
        if (finalImg.parentNode !== previewBox) previewBox.appendChild(finalImg);
        placeholder.style.display = "none"; loadingOv.style.display = "none";
        if (step && total) showStepBar(previewBox, step, total);
        finalImg.src = url; finalImg.style.display = "block";
      });
      const origOnRemoved = nodeType.prototype.onRemoved;
      self.onRemoved = function () { stopLive(); origOnRemoved?.apply(this, arguments); };

      let modeHandle = null;
      function tryShowCompare(){
        const mr=modeResults[state.mode]; if(!mr)return;
        const src=modeHandle?.getSourceURL?.();
        previewBox.innerHTML=""; clearBtn.style.display="block"; zoomLockBtn.style.display="block";
        if(compareEnabled && (state.mode==="i2i"||state.mode==="inpaint") && src){ previewBox.appendChild(createCompareView(src,mr.url)); resetZoom(); }
        else { placeholder.style.display="none"; finalImg.src=mr.url; finalImg.style.display="block"; previewBox.appendChild(placeholder); previewBox.appendChild(finalImg); }
        loadingOv.style.display="none"; previewBox.appendChild(loadingOv); previewBox.appendChild(zoomLockBtn); previewBox.appendChild(clearBtn);
      }
      function restorePreview(){ const mr=modeResults[state.mode]; if(!mr)resetPreview(); else tryShowCompare(); }
      ctx.showResult = (im) => {
        const url=`/view?filename=${encodeURIComponent(im.filename)}&subfolder=${encodeURIComponent(im.subfolder||"")}&type=${im.type||"output"}&t=${Date.now()}`;
        modeResults[state.mode]={im,url}; loadingOv.style.display="none"; tryShowCompare(); renderSendTo();
        setLastImage(self.id, im, self._tjLastRun).catch(()=>{});
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
          const btn=el("button",{type:"button",text:t.label,style:{cursor:mr?"pointer":"not-allowed",fontFamily:"inherit",fontSize:"11px",padding:"3px 8px",borderRadius:"12px",background:C.bg2,color:mr?C.text:C.muted,border:`1px solid ${C.border}`,opacity:mr?"1":"0.5"}});
          btn.disabled=!mr;   // el() would setAttribute("disabled", false), which still disables
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
      pxHdr.appendChild(el("div",{text:"🔍 Prompt — Full Screen Edit",style:{color:"#fff",fontSize:"13px",fontWeight:"700",flex:"1"}}));
      const pxTA    = el("textarea",{style:{flex:"1",background:C.bg2,color:C.text,border:`1px solid ${BRAND}`,borderRadius:"6px",padding:"10px",fontSize:"13px",fontFamily:"inherit",resize:"none",outline:"none"}});
      const pxApply = button("✓ Apply",()=>{ imgBil.refresh(); persist(); updateCount(); promptExpandEl.style.display="none"; },"primary");
      const pxClose = button("✕ Close",()=>{ promptExpandEl.style.display="none"; },"danger");
      pxHdr.appendChild(pxApply); pxHdr.appendChild(pxClose);
      promptExpandEl.appendChild(pxHdr); promptExpandEl.appendChild(pxTA);
      const promptExpandOv = {
        show(){ promptExpandEl._tj_llm_onshow?.(); promptExpandEl.style.display="flex"; setTimeout(()=>pxTA.focus(),50); },
        hide(){ promptExpandEl.style.display="none"; },
      };
      // Default Model Format for THIS node's Prompt Edit — ported from Qwen Image 2.1's
      // pilot. Applied inside attachLLMPanel once its model list actually loads.
      const imgBil=createImagePromptBilingual({state,getModePrompt,setModePrompt,persist,onError:m=>alert(m)});
      const llmApi = attachLLMPanel({bilingual:imgBil.panel,promptExpandEl,pxTA,getModePrompt,setModePrompt,state,persist,updateCount,getPromptTA:()=>promptTA,openSettings:()=>settingsOv?.showTab("LLM"),defaultModelFormat:"Universal Natural Language",systemPrompt:()=>mossSystemPrompt(state.mode)});

      // ── Prompt area ────────────────────────────────────────────────────────
      const promptWrap = el("div",{style:{height:`${PROMPT_H}px`,flexShrink:"0",display:"flex",flexDirection:"column",gap:"4px"}});
      const charCount  = el("span",{style:{color:C.muted,fontSize:"10px",marginLeft:"6px"}});
      const promptHdr  = el("div",{style:{display:"flex",alignItems:"center",height:`${PROMPT_LBL}px`}});
      promptHdr.appendChild(el("div",{text:"PROMPT",style:{color:C.muted,fontSize:"11px",textTransform:"uppercase",letterSpacing:"0.04em"}}));
      promptHdr.appendChild(charCount);
      const autoEnhanceChk = el("input",{type:"checkbox",style:{cursor:"pointer",marginLeft:"auto"}});
      autoEnhanceChk.checked = !!state.autoEnhance;
      autoEnhanceChk.addEventListener("change",()=>{state.autoEnhance=autoEnhanceChk.checked;persist();});
      const autoEnhanceLbl = el("label",{title:"Automatically run Prompt Enhance on the current prompt right before Generate, updating the PROMPT field in place.",style:{display:"flex",alignItems:"center",gap:"4px",fontSize:"11px",color:C.muted,cursor:"pointer",marginLeft:"auto"}},[autoEnhanceChk,el("span",{text:"Auto Enhance"})]);
      promptHdr.appendChild(autoEnhanceLbl);
      // Refine: revise the current prompt from an instruction without opening Prompt Edit.
      promptHdr.appendChild(el("button",{type:"button",text:"🔧 Refine",title:"Revise the current prompt from an instruction (no need to open Prompt Edit)",style:{cursor:"pointer",background:BRAND,border:"none",borderRadius:"4px",fontSize:"11px",fontWeight:"700",color:"#fff",padding:"3px 8px",marginLeft:"6px"},onclick:()=>llmApi.refine()}));
      const expandBtn  = el("button",{type:"button",text:"🔍 Prompt Edit",title:"Expand edit",style:{cursor:"pointer",background:BRAND,border:"none",borderRadius:"4px",fontSize:"11px",fontWeight:"700",color:"#fff",padding:"3px 8px",marginLeft:"6px"},onclick:()=>promptExpandOv.show()});
      promptHdr.appendChild(expandBtn);
      const tplBtn = button("📋 Prompt Preset",null,"default");
      tplBtn.title="Load Template"; tplBtn.style.cssText+=`padding:3px 8px;font-size:11px;margin-left:4px;background:${BRAND};border:none;color:#fff;font-weight:700;`;
      promptHdr.appendChild(tplBtn);

      const promptTA = el("textarea",{placeholder:"Describe what you want to generate…",style:{flex:"1",width:"100%",boxSizing:"border-box",background:C.bg2,color:C.text,border:`1px solid ${C.border}`,borderRadius:"6px",padding:"7px",fontSize:"13px",fontFamily:"inherit",outline:"none",resize:"none",overflowY:"auto"}});

      function getModePrompt(mode){if(!state.promptsByMode)state.promptsByMode={};if(!(mode in state.promptsByMode))state.promptsByMode[mode]="";return state.promptsByMode[mode];}
      function setModePrompt(mode,v){if(!state.promptsByMode)state.promptsByMode={};state.promptsByMode[mode]=v;state.prompt=v;}
      imgBil.refresh();
      function updateCount(){ const n=getModePrompt(state.mode).trim().length; charCount.textContent=` (${n} chars${n<10?" ⚠":""})`; charCount.style.color=n<10?C.warn:C.muted; }
      updateCount();
      promptTA.addEventListener("input",()=>{setModePrompt(state.mode,promptTA.value);persist();updateCount();});
      promptTA.addEventListener("focus",()=>promptTA.style.borderColor=BRAND);
      promptTA.addEventListener("blur",()=>promptTA.style.borderColor=C.border);
      promptWrap.appendChild(promptHdr); promptWrap.appendChild(imgBil.attach(promptTA).el);

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
          case "t2i": modeHandle=mountT2ILeft(leftPanel,state,ctx); break;
          case "i2i": modeHandle=mountI2ILeft(leftPanel,state,ctx); break;
          case "inpaint": modeHandle=mountInpaintLeft(leftPanel,state,ctx); break;
          case "r2i": modeHandle=mountR2ILeft(leftPanel,state,ctx); break;
        }
        leftOuter.appendChild(seedGenWrap);
        imgBil.refresh(); updateCount();
        promptTA.placeholder = mode==="r2i" ? "Describe the whole image (the boxes carry the details)…" : "Describe what you want to generate…";
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

        if(state.autoEnhance&&getModePrompt(state.mode).trim()){
          genBtn.textContent="⏳ Enhancing…";
          try{
            pxTA.value=getModePrompt(state.mode);
            await llmApi.enhance();
            imgBil.refresh();persist();updateCount();
          }catch(err){
            alert(`Auto Enhance failed: ${err.message}`);running=false;genBtn.disabled=false;genBtn.textContent="▶ Generate";loadingOv.style.display="none";if(!modeResults[state.mode])resetPreview();return;
          }
          genBtn.textContent="⏳ Queuing…";
        }

        genBtn.textContent="⏳ Translating…";
        try{await imgBil.ensure();}catch(err){alert(err.message);running=false;genBtn.disabled=false;genBtn.textContent="▶ Generate";loadingOv.style.display="none";if(!modeResults[state.mode])resetPreview();return;}
        try{await modeHandle.beforeGenerate?.();}catch(err){alert(err.message);running=false;genBtn.disabled=false;genBtn.textContent="▶ Generate";loadingOv.style.display="none";if(!modeResults[state.mode])resetPreview();return;}

        // PromptDB pipe / prompt_override: applied only while the graph is built, then restored (the UI never changes).
        let pipeOv=null;
        try{ pipeOv=await resolvePipeOverrides(self, state); if(pipeOv) ctx.showPopup?.(pipeOv.summary,false); }catch{}

        let prompt;
        try{
          const _restore=pipeOv?applyOverridesTemp(state,pipeOv.overrides):null;
          try{ prompt=await modeHandle.getGraph(); } finally{ _restore?.(); }
          self._tjLastRun = summarizeRun(prompt, state);
          await addLivePreview(prompt, self.id);
        }
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
      helpTop.appendChild(el("div",{text:"Manual — Moss Image ONE STUDIO",style:{color:"#fff",fontSize:"14px",fontWeight:"700",flex:"1"}}));
      helpTop.appendChild(button("✕",()=>helpEl.style.display="none","danger"));
      helpEl.appendChild(helpTop);
      const helpBody=el("div",{style:{flex:"1",overflowY:"auto",fontSize:"11.5px",lineHeight:"1.7",color:C.text,whiteSpace:"pre-wrap"}});
      helpBody.className="mossv1-lp";
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
        const tOv=mod.createTemplateOverlay(state,ctx,txt=>{imgBil.setEnglish(txt);persist();updateCount();},"moss");
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

      self.addDOMWidget("mossv1_ui","div",root,{serialize:false,computeSize:()=>[UI_W,UI_H]});
      self._tjRepaint = () => { seedField.value = state.seed ?? 0; imgBil.refresh(); updateCount?.(); renderPills(); renderMode(); applyCompareBtnStyle?.(); };
      renderPills(); renderMode(); applyCompareBtnStyle();
    };
  },
});

// one_node_qwen21.js — QWEN IMAGE 2.1 ONE STUDIO (TJ)
// Mirrors one_node_qwen2511.js's layout/interaction pattern (topbar, mode pills, preview,
// send-to strip, prompt box, seed/generate) for the Qwen-Image-2.1 model family. Faceswap
// and Angle Change are intentionally dropped (see AGENTS-level task spec) — modes here are
// T2I / I2I (plain + Ref-to-Image) / Edit / Inpaint / Outpaint / Upscale.
import { app } from "../../scripts/app.js";
import { C, BRAND, NODE_W, PREVIEW_SIZE, LEFT_W, PAD, MAX_REF_IMAGES, SUBFOLDER,
         POSE_SYSTEM_PROMPT_DEFAULT, POSE_SAM3D_MODEL_DEFAULT,
         el, clear, loadState, saveState, defaultState, randomSeed } from "./qwen21/core_qwen21.js";
import { panel, label, button, select, slider, numberField, row, col,
         modeBar, iconBtn, openFullscreen, loraSelect }                 from "./klein/ui_common.js";
import { queuePrompt, interrupt, setLastImage, saveMeta, uploadImage,
         copyOutputToInput, getModels, getLoraTriggers, getConfig, saveConfig,
         getSeedVR2Models }                                                from "./qwen21/api_qwen21.js";
import { buildT2IGraph, buildI2IGraph, buildRefToImageGraph, buildEditGraph,
         buildInpaintGraph, buildOutpaintGraph, buildUpscaleGraph,
         buildPoseExtractGraph, buildPoseGraph }                         from "./qwen21/graph_builder_qwen21.js";
import { openMaskDrawOverlay }                                            from "./qwen21/ui_mask_draw.js";
import { openPoseCropOverlay, cropAndUploadPoseImage }                    from "./qwen21/ui_pose_crop.js";
import { createGalleryOverlay }                                           from "./qwen21/ui_gallery_qwen21.js";
// Reuse MiniMax H3's own compact reference-image grid (imageSlot) instead of a
// bespoke full-width-card-per-image list — user: "Ref to Image의 레퍼런스 이미지
// 업로드 방식은 MiniMax H3의 Reference to Video의 Reference 이미지 업로드 방식
// UI와 기능 처럼 동작되게... 지금 방식은 너무 메뉴공간을 많이 차지하는 방식이야."
import { imageSlot }                                                      from "./minimax/ui_images_minimax.js";
// Reuse 2511's own single-image upload card verbatim (192px box, gallery-pick button,
// clear button) instead of a bespoke smaller card — user pointed out every single-image
// upload in this node ("Source Image"/"Image 1"/등) must look and behave exactly like
// "Qwen Image Edit 2511 ONE STUDIO (TJ)"'s own.
import { createImageUpload }                                              from "./qwen2511/ui_image_upload.js";
import { attachLLMPanel, mountLLMSettingsSection }                        from "./shared/llm_panel.js";
import { attachNodeState, restoreNodeState }                              from "./shared/node_state.js";
import { t, getLang, setLang }                                            from "./shared/i18n.js";

// ── Layout (same constants pattern as 2511) ────────────────────────────────────
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

const RES_PRESETS = [
  { label: "1024 × 1024", w: 1024, h: 1024 },
  { label: "1024 × 1536", w: 1024, h: 1536 },
  { label: "1536 × 1024", w: 1536, h: 1024 },
  { label: "1920 × 1088", w: 1920, h: 1088 },
  { label: "1088 × 1920", w: 1088, h: 1920 },
  { label: "1280 × 720",  w: 1280, h: 720  },
  { label: "720 × 1280",  w: 720,  h: 1280 },
  { label: "Custom",      w: 0,    h: 0    },
];

const MODES = [
  { key: "t2i",     label: "T2I",     enabled: true },
  { key: "i2i",     label: "I2I",     enabled: true },
  { key: "edit",    label: "EDIT",    enabled: true },
  { key: "inpaint", label: "PAINT",   enabled: true },
  { key: "pose",    label: "POSE",    enabled: true },
  { key: "upscale", label: "UPSCALE", enabled: true },
];

const ALL_TARGETS = [
  { mode: "i2i",      label: "→ I2I",      field: "i2iImage" },
  { mode: "edit",     label: "→ Edit",     field: "editImage1" },
  { mode: "inpaint",  label: "→ Inpaint",  field: "inpaintImage", subMode: "inpaint" },
  { mode: "inpaint",  label: "→ Outpaint", field: "outpaintImage", subMode: "outpaint" },
  { mode: "upscale",  label: "→ Upscale",  field: "upscaleImage" },
  { mode: "pose",     label: "→ Pose (Character)", field: "poseCharacterImage" },
];
const SEND_TO = {
  t2i: ALL_TARGETS,
  i2i: ALL_TARGETS.filter(t => t.mode !== "i2i"),
  edit: ALL_TARGETS.filter(t => t.mode !== "edit"),
  inpaint: ALL_TARGETS.filter(t => t.mode !== "inpaint"),
  upscale: ALL_TARGETS.filter(t => t.mode !== "upscale"),
  pose: ALL_TARGETS.filter(t => t.mode !== "pose"),
};

// ── Small shared UI helpers ─────────────────────────────────────────────────────
// Thin wrapper around 2511's own createImageUpload so every call site here keeps the
// same `{ el, _refresh }`-shaped return this file's mount functions already expect.
function imageUploadCard(labelText, currentFilename, onChange, opts) {
  const { el: wrap, setFilename } = createImageUpload(labelText, currentFilename, async (f) => {
    const name = typeof f === "string" ? f : await uploadImage(f);
    onChange(name);
    return name;
  }, opts);
  wrap._refresh = setFilename;
  return wrap;
}

function loraRow(state, ctx) {
  const wrap = el("div");
  function render() {
    clear(wrap);
    if (!state.loras) state.loras = [];
    const items = state.loras.map((lora, i) => {
      const nameOpts = ["none", ...(ctx.availableLoras || ["none"]).filter(n => n !== "none")];
      const twIn = el("input", { type: "text", placeholder: "Trigger word…", style: {
        width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text,
        border: `1px solid ${C.border}`, borderRadius: "4px", padding: "4px 6px", fontSize: "11px", fontFamily: "inherit", outline: "none",
      }});
      twIn.value = lora.triggerWord || "";
      twIn.addEventListener("input", () => { lora.triggerWord = twIn.value; ctx.persist(); });
      const loraSel = loraSelect(nameOpts, lora.name || "none", async v => {
        const prev = lora.name; lora.name = v; ctx.persist();
        if (v && v !== "none") {
          if (v !== prev) { lora.triggerWord = ""; twIn.value = ""; }
          if (!lora.triggerWord) {
            try { const d = await getLoraTriggers(v); if (d.ok && d.triggers?.length) { lora.triggerWord = d.triggers.join(", "); twIn.value = lora.triggerWord; ctx.persist(); } } catch {}
          }
        } else { lora.triggerWord = ""; twIn.value = ""; }
      });
      const strIn = el("input", { type: "number", step: "0.05", min: "0", max: "2", style: {
        width: "50px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`, borderRadius: "4px", padding: "4px", fontSize: "12px", fontFamily: "inherit", outline: "none", boxSizing: "border-box",
      }});
      strIn.value = lora.strength ?? 1;
      strIn.addEventListener("input", () => { const v = parseFloat(strIn.value); lora.strength = isNaN(v) ? 1 : v; ctx.persist(); });
      const tog = el("button", { type: "button", text: lora.enabled !== false ? "ON" : "OFF", style: {
        cursor: "pointer", fontFamily: "inherit", fontSize: "10px", padding: "3px 6px", borderRadius: "10px", border: "none",
        background: lora.enabled !== false ? C.brand : "#444", color: "#fff", fontWeight: "700",
      }, onclick: () => { lora.enabled = lora.enabled === false; ctx.persist(); render(); }});
      const del = el("button", { type: "button", text: "✕", style: { cursor: "pointer", fontFamily: "inherit", fontSize: "11px", background: "transparent", color: C.err, border: "none", padding: "2px 4px" },
        onclick: () => { state.loras.splice(i, 1); ctx.persist(); render(); }});
      return el("div", { style: { display: "flex", flexDirection: "column", gap: "3px", padding: "5px", background: C.bg2, borderRadius: "6px", border: `1px solid ${C.border}` } }, [
        el("div", { style: { display: "flex", gap: "4px", alignItems: "center" } }, [el("div", { style: { flex: "1" } }, [loraSel.el]), strIn, tog, del]), twIn,
      ]);
    });
    const addBtn = state.loras.length < 3 ? el("button", { type: "button", text: "+ Add LoRA", style: {
      cursor: "pointer", background: C.bg2, color: C.text, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "6px 12px", fontSize: "12px", fontFamily: "inherit",
    }, onclick: () => { state.loras.push({ name: "none", strength: 1, triggerWord: "", enabled: true }); ctx.persist(); render(); }}) : null;
    const children = [el("div", { text: "LoRA (max 3)", style: { color: C.muted, fontSize: "11px", marginBottom: "3px", textTransform: "uppercase" } }), ...items];
    if (addBtn) children.push(addBtn);
    wrap.appendChild(el("div", { style: { background: C.bg1, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "10px" } }, children));
  }
  render();
  return wrap;
}

// ── Compare view (identical pattern to 2511) ────────────────────────────────────
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

app.registerExtension({
  name: "TJ.QwenImage21ONE.v1",

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "QwenImage21OneTJNode") return;

    nodeType.prototype.onNodeCreated = function () {
      this.color       = BRAND;
      this.bgcolor     = C.bg0;
      this.title_color = "#ffffff";
      this.resizable   = false;
      this.size        = [NODE_MW, NODE_MH];
      this._buildUI();
    };
    nodeType.prototype.onConfigure = function () { this.size = [NODE_MW, NODE_MH]; restoreNodeState(this); };
    nodeType.prototype.onResize    = function () { this.size = [NODE_MW, NODE_MH]; };
    nodeType.prototype.getSlotMenuOptions = function () { return []; };

    nodeType.prototype._buildUI = function () {
      const self  = this;
      const state = defaultState(loadState());
      state.useModelOverride = false;
      const persist = attachNodeState(self, { state, save: saveState, normalize: defaultState, rerender: () => self._tjRepaint?.() });
      const modeResults = {};
      const ctx = { persist, availableLoras: [], showPopup: (...a) => showPopup(...a) };

      // ── Model Override — same client-side mechanism as 2511: adds MODEL/CLIP/VAE
      // input sockets on the node itself; at generate time the connected node's own
      // widget value is read directly (no Python-side declaration needed, since this
      // never goes through the queued prompt as a real input). Mirrors 2511 1:1.
      const OVERRIDE_SLOTS = [
        { name: "model_override", type: "MODEL" },
        { name: "clip_override",  type: "CLIP"  },
        { name: "vae_override",   type: "VAE"   },
      ];
      const OVERRIDE_NAMES = OVERRIDE_SLOTS.map(s => s.name);
      function getOverrideSlot(slotName) {
        try {
          const idx = self.inputs?.findIndex(i => i.name === slotName);
          if (idx == null || idx < 0) return "";
          const linkId = self.inputs[idx]?.link;
          if (linkId == null) return "";
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
            if (!self.inputs?.find(i => i.name === name)) self.addInput(name, type);
          }
        } else {
          for (let i = (self.inputs?.length ?? 0) - 1; i >= 0; i--) {
            if (OVERRIDE_NAMES.includes(self.inputs[i]?.name)) self.removeInput(i);
          }
        }
        self.graph?.setDirtyCanvas?.(true, true);
      }
      ctx.syncOverrideSlots = syncOverrideSlots;
      syncOverrideSlots(false);

      if (!document.getElementById("q21v1-styles")) {
        const s = document.createElement("style"); s.id = "q21v1-styles";
        s.textContent = `@keyframes q21v1-spin{to{transform:rotate(360deg)}}.q21v1-lp::-webkit-scrollbar{width:4px}.q21v1-lp::-webkit-scrollbar-track{background:transparent}.q21v1-lp::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px}`;
        document.head.appendChild(s);
      }

      const root = el("div",{style:{
        width:`${NODE_W}px`, height:`${ROOT_H}px`, boxSizing:"border-box", position:"relative", overflow:"hidden",
        background:C.bg0, borderRadius:"8px", padding:`${PAD}px ${PAD}px ${BOTTOM_PAD}px ${PAD}px`, color:C.text, fontFamily:"'Segoe UI',sans-serif",
      }});
      ctx.rootEl = root;

      let popTimer;
      function showPopup(msg, isError = true) {
        let pop = root.querySelector(".q21v1-pop");
        if (!pop) { pop = el("div", { style: { position:"absolute",bottom:"30px",left:"50%",transform:"translateX(-50%)",background:C.bg2,border:`1px solid ${C.border}`,borderRadius:"6px",padding:"6px 14px",fontSize:"11px",color:C.text,zIndex:"10001",maxWidth:"80%",textAlign:"center",pointerEvents:"none" } }); pop.className = "q21v1-pop"; root.appendChild(pop); }
        pop.textContent = msg; pop.style.color = isError ? C.err : BRAND; pop.style.opacity = "1";
        clearTimeout(popTimer); popTimer = setTimeout(() => pop.style.opacity = "0", 3000);
      }

      // ── Topbar ───────────────────────────────────────────────────────────
      const topBar = el("div",{style:{display:"flex",alignItems:"center",gap:"6px",height:`${TOPBAR_H}px`,marginBottom:`${PAD}px`,flexShrink:"0"}});
      const pillsWrap = el("div",{style:{flex:"1"}});
      function renderPills(){ clear(pillsWrap); pillsWrap.appendChild(modeBar(MODES,state.mode,key=>{state.mode=key;persist();renderPills();renderMode();})); }

      const resetBtn = iconBtn("↺","Reset settings",()=>{
        if(!confirm("Reset all settings? Model selection is preserved."))return;
        const{model,textEncoder,vae}=state; Object.assign(state,defaultState({}));
        if(model)state.model=model; if(textEncoder)state.textEncoder=textEncoder; if(vae)state.vae=vae;
        persist();renderPills();renderMode();showPopup("Reset done.",false);
      });
      resetBtn.style.cssText += `background:#ffffff;color:${BRAND};border:2px solid ${BRAND};border-radius:6px;padding:4px 8px;font-weight:700;`;
      resetBtn.addEventListener("mouseenter",()=>resetBtn.style.background="#f0f9ff");
      resetBtn.addEventListener("mouseleave",()=>resetBtn.style.background="#ffffff");

      const unloadBtn = iconBtn("🗑","Unload RAM/VRAM",async()=>{
        unloadBtn.style.opacity="0.5"; try{await fetch("/free",{method:"POST"});}catch{} setTimeout(()=>unloadBtn.style.opacity="1",2000);
      });

      topBar.appendChild(pillsWrap);
      topBar.appendChild(resetBtn);
      topBar.appendChild(unloadBtn);
      let settingsOv, galleryOv, helpOv;
      topBar.appendChild(iconBtn("⚙","Settings",()=>settingsOv?.show()));
      topBar.appendChild(iconBtn("🖼","Gallery",()=>galleryOv?.show()));
      topBar.appendChild(iconBtn("?","Help",()=>helpOv?.show()));
      root.appendChild(topBar);

      // ── Main row ─────────────────────────────────────────────────────────
      const mainRow = el("div",{style:{display:"flex",gap:`${PAD}px`,height:`${RIGHT_H}px`,flexShrink:"0"}});
      const leftOuter = el("div",{style:{width:`${LEFT_W}px`,flexShrink:"0",height:`${RIGHT_H}px`,display:"flex",flexDirection:"column"}});
      const leftPanel = el("div",{style:{flex:"1",overflowY:"auto",overflowX:"hidden",display:"flex",flexDirection:"column",gap:"6px"}});
      leftPanel.className = "q21v1-lp";
      leftOuter.appendChild(leftPanel);
      const rightPanel = el("div",{style:{flex:"1",minWidth:`${PREVIEW_SIZE}px`,display:"flex",flexDirection:"column",gap:`${PAD}px`,height:`${RIGHT_H}px`}});

      const previewBox = el("div",{style:{width:`${PREVIEW_SIZE}px`,height:`${PREVIEW_SIZE}px`,flexShrink:"0",background:"#000",borderRadius:"8px",border:`1px solid ${C.border}`,position:"relative",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",alignSelf:"flex-start"}});
      const placeholder = el("div",{text:"Generate to see result",style:{color:C.muted,fontSize:"12px"}});
      const finalImg = el("img",{style:{maxWidth:"100%",maxHeight:"100%",objectFit:"contain",display:"none"}});
      const loadingOv = el("div",{style:{position:"absolute",inset:"0",background:"rgba(0,0,0,0.5)",display:"none",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"12px",zIndex:"10"}});
      const spinner = el("div",{style:{width:"44px",height:"44px",border:`3px solid ${C.border}`,borderTop:`3px solid ${BRAND}`,borderRadius:"50%",animation:"q21v1-spin 0.8s linear infinite"}});
      loadingOv.appendChild(spinner); loadingOv.appendChild(el("div",{text:"Generating…",style:{color:C.text,fontSize:"12px"}}));
      const clearBtn = el("button",{type:"button",text:"✕",title:"Clear result",style:{position:"absolute",top:"6px",right:"6px",zIndex:"5",background:"rgba(0,0,0,0.65)",color:"#fff",border:"none",borderRadius:"4px",width:"22px",height:"22px",cursor:"pointer",fontSize:"12px",padding:"0",display:"none"}});
      clearBtn.addEventListener("click", () => { delete modeResults[state.mode]; resetPreview(); renderSendTo(); });

      function resetPreview(){
        previewBox.innerHTML=""; previewBox.appendChild(placeholder); previewBox.appendChild(finalImg); previewBox.appendChild(loadingOv); previewBox.appendChild(clearBtn);
        placeholder.style.display="block"; finalImg.style.display="none"; loadingOv.style.display="none"; clearBtn.style.display="none";
      }
      resetPreview();

      let modeHandle = null;
      function tryShowCompare(){
        const mr = modeResults[state.mode]; if (!mr) return;
        const src = modeHandle?.getSourceURL?.();
        previewBox.innerHTML=""; clearBtn.style.display="block";
        if (state.mode!=="t2i" && src) { previewBox.appendChild(createCompareView(src, mr.url)); }
        else { placeholder.style.display="none"; finalImg.src=mr.url; finalImg.style.display="block"; previewBox.appendChild(placeholder); previewBox.appendChild(finalImg); }
        loadingOv.style.display="none"; previewBox.appendChild(loadingOv); previewBox.appendChild(clearBtn);
      }
      function restorePreview(){ const mr=modeResults[state.mode]; if(!mr) resetPreview(); else tryShowCompare(); }
      const showResult = (im) => {
        const url = `/view?filename=${encodeURIComponent(im.filename)}&subfolder=${encodeURIComponent(im.subfolder||"")}&type=${im.type||"output"}&t=${Date.now()}`;
        modeResults[state.mode] = { im, url }; loadingOv.style.display="none"; tryShowCompare(); renderSendTo();
        setLastImage(self.id, im).catch(()=>{});
      };

      // ── Send-to strip + output toggle ───────────────────────────────────
      const sendToWrap = el("div",{style:{height:`${SEND_TO_H}px`,flexShrink:"0",display:"flex",alignItems:"center",gap:"8px",overflow:"hidden"}});
      const sendLeft = el("div",{style:{flex:"1",display:"flex",flexWrap:"wrap",alignItems:"center",gap:"4px"}});
      const sendRight = el("div",{style:{display:"flex",alignItems:"center",gap:"4px",flexShrink:"0"}});
      sendToWrap.append(sendLeft, sendRight);

      function renderSendTo(){
        clear(sendLeft);
        const targets = SEND_TO[state.mode] || []; if (!targets.length) return;
        sendLeft.appendChild(el("div",{text:"Send to:",style:{color:C.muted,fontSize:"11px",flexShrink:"0"}}));
        targets.forEach(t => {
          const btn = el("button",{type:"button",text:t.label,style:{cursor:"pointer",fontFamily:"inherit",fontSize:"11px",padding:"3px 8px",borderRadius:"12px",background:C.bg2,color:C.text,border:`1px solid ${C.border}`}});
          btn.addEventListener("click", async () => {
            const mr = modeResults[state.mode]; if (!mr) return;
            btn.disabled = true; btn.textContent = "Copying…";
            try {
              const n = await copyOutputToInput(mr.im.filename, mr.im.subfolder||"", mr.im.type||"output");
              state[t.field] = n;
              if (t.field === "inpaintImage") state.outpaintImage = n;
              if (t.subMode) state.paintSubMode = t.subMode;
              state.mode = t.mode; persist(); renderPills(); renderMode();
            } catch { btn.disabled=false; btn.textContent=t.label; }
          });
          sendLeft.appendChild(btn);
        });
      }
      function renderToggle(){
        clear(sendRight);
        sendRight.appendChild(el("div",{text:"Output:",style:{color:C.muted,fontSize:"11px"}}));
        ["preview","save"].forEach(key => {
          const active = state.outputMode === key;
          sendRight.appendChild(el("button",{type:"button",text:key==="save"?"💾 Save":"👁 Preview",style:{cursor:"pointer",fontFamily:"inherit",fontSize:"11px",padding:"4px 10px",borderRadius:"20px",background:active?BRAND:C.bg2,color:"#fff",border:`1px solid ${active?BRAND:C.border}`,fontWeight:active?"700":"400"},onclick:()=>{state.outputMode=key;persist();renderToggle();}}));
        });
      }
      renderToggle();

      // ── Prompt expand overlay + LLM panel (shared component — reused unchanged) ──
      const promptExpandEl = el("div",{style:{position:"absolute",inset:"0",zIndex:"9997",background:"rgba(11,11,11,0.97)",borderRadius:"inherit",display:"none",flexDirection:"column",padding:"14px",gap:"8px",boxSizing:"border-box"}});
      const pxHdr = el("div",{style:{display:"flex",alignItems:"center",gap:"8px",flexShrink:"0"}});
      pxHdr.appendChild(el("div",{text:"🔍 Prompt — Full Screen Edit",style:{color:"#fff",fontSize:"13px",fontWeight:"700",flex:"1"}}));
      const pxTA = el("textarea",{style:{flex:"1",background:C.bg2,color:C.text,border:`1px solid ${BRAND}`,borderRadius:"6px",padding:"10px",fontSize:"13px",fontFamily:"inherit",resize:"none",outline:"none"}});
      const pxApply = button("✓ Apply", () => { setModePrompt(state.mode, pxTA.value); promptTA.value = pxTA.value; persist(); updateCount(); promptExpandEl.style.display="none"; }, "primary");
      const pxClose = button("✕ Close", () => { promptExpandEl.style.display="none"; }, "danger");
      pxHdr.appendChild(pxApply); pxHdr.appendChild(pxClose);
      promptExpandEl.appendChild(pxHdr); promptExpandEl.appendChild(pxTA);
      const promptExpandOv = { show(){ promptExpandEl._tj_llm_onshow?.(); promptExpandEl.style.display="flex"; setTimeout(()=>pxTA.focus(),50); } };

      // ── Prompt area ──────────────────────────────────────────────────────
      const promptWrap = el("div",{style:{height:`${PROMPT_H}px`,flexShrink:"0",display:"flex",flexDirection:"column",gap:"4px"}});
      const charCount = el("span",{style:{color:C.muted,fontSize:"10px",marginLeft:"6px"}});
      const promptHdr = el("div",{style:{display:"flex",alignItems:"center",height:`${PROMPT_LBL}px`}});
      promptHdr.appendChild(el("div",{text:"PROMPT",style:{color:C.muted,fontSize:"11px",textTransform:"uppercase"}}));
      promptHdr.appendChild(charCount);
      // Pilot: auto-run Prompt Enhance on the current prompt right before Generate — user:
      // "Auto Enhance 체크 박스를 만들고... Qwen 2.1에서 먼저 테스트 해보고 나머지 이미지
      // 생성 노드에 전부 포팅할 예정이니 기억해주고." Ships here first.
      const autoEnhanceChk = el("input",{type:"checkbox",style:{cursor:"pointer",marginLeft:"auto"}});
      autoEnhanceChk.checked = !!state.autoEnhance;
      autoEnhanceChk.addEventListener("change",()=>{state.autoEnhance=autoEnhanceChk.checked;persist();});
      const autoEnhanceLbl = el("label",{title:"Automatically run Prompt Enhance on the current prompt right before Generate, updating the PROMPT field in place.",style:{display:"flex",alignItems:"center",gap:"4px",fontSize:"11px",color:C.muted,cursor:"pointer",marginLeft:"auto"}},[autoEnhanceChk, el("span",{text:"Auto Enhance"})]);
      promptHdr.appendChild(autoEnhanceLbl);
      const expandBtn = el("button",{type:"button",text:"🔍 Prompt Edit",title:"Expand edit",style:{cursor:"pointer",background:BRAND,border:"none",borderRadius:"4px",fontSize:"11px",fontWeight:"700",color:"#fff",padding:"3px 8px",marginLeft:"6px"},onclick:()=>promptExpandOv.show()});
      promptHdr.appendChild(expandBtn);
      const tplBtn = button("📋 Prompt Preset", null, "default");
      tplBtn.title = "Load Template";
      tplBtn.style.cssText += `padding:3px 8px;font-size:11px;margin-left:4px;background:${BRAND};border:none;color:#fff;font-weight:700;`;
      promptHdr.appendChild(tplBtn);

      const promptTA = el("textarea",{placeholder:"Describe what you want to generate…",style:{flex:"1",width:"100%",boxSizing:"border-box",background:C.bg2,color:C.text,border:`1px solid ${C.border}`,borderRadius:"6px",padding:"7px",fontSize:"13px",fontFamily:"inherit",outline:"none",resize:"none",overflowY:"auto"}});

      function getModePrompt(mode){ if(!state.promptsByMode) state.promptsByMode={}; if(!(mode in state.promptsByMode)) state.promptsByMode[mode]=""; return state.promptsByMode[mode]; }
      function setModePrompt(mode,v){ if(!state.promptsByMode) state.promptsByMode={}; state.promptsByMode[mode]=v; state.prompt=v; }
      promptTA.value = getModePrompt(state.mode);
      function updateCount(){ const n=getModePrompt(state.mode).trim().length; charCount.textContent=` (${n} chars${n<20?" ⚠":""})`; charCount.style.color = n<20 ? C.warn : C.muted; }
      updateCount();
      promptTA.addEventListener("input", () => { setModePrompt(state.mode, promptTA.value); persist(); updateCount(); });
      // Default Model Format for THIS node's Prompt Edit — user: "🔍 Prompt Edit를
      // 실행하면 자동으로 Model Format의 기본값은 Qwen 2.1관련 항목이 기본값으로
      // 되어있어야되고." Applied inside attachLLMPanel once its model list actually
      // loads (never overwrites a value the user deliberately picked).
      const llmApi = attachLLMPanel({ promptExpandEl, pxTA, getModePrompt, setModePrompt, state, persist, updateCount, getPromptTA: () => promptTA, openSettings: () => settingsOv?.show(), defaultModelFormat: "Qwen Image 2.1 (T2I)" });

      promptWrap.appendChild(promptHdr); promptWrap.appendChild(promptTA);
      rightPanel.appendChild(previewBox); rightPanel.appendChild(sendToWrap); rightPanel.appendChild(promptWrap);
      mainRow.appendChild(leftOuter); mainRow.appendChild(rightPanel);
      root.appendChild(mainRow);

      // ── Seed + Generate ──────────────────────────────────────────────────
      const seedInput = numberField(state.seed, v=>{state.seed=v;persist();}, 1);
      const seedModeDD = select([{value:"randomize",label:"Random"},{value:"fixed",label:"Fixed"},{value:"increment",label:"+1"},{value:"decrement",label:"-1"}], state.seedMode, v=>{state.seedMode=v;persist();});
      const seedGenWrap = el("div",{style:{display:"flex",flexDirection:"column",gap:"4px",paddingTop:"6px",flexShrink:"0",borderTop:`1px solid ${C.border}`}});
      seedGenWrap.appendChild(panel([row([col([label("SEED"),seedInput]),col([label("MODE"),seedModeDD])])]));
      const genBtn = button("▶ Generate", null, "primary"); genBtn.style.cssText += "width:100%;padding:11px;font-size:13px;";
      const stopBtn = button("■ Stop", async () => { running=false; await interrupt(); genBtn.disabled=false; genBtn.textContent="▶ Generate"; loadingOv.style.display="none"; if(!modeResults[state.mode]) resetPreview(); });
      seedGenWrap.appendChild(row([genBtn, stopBtn]));

      // ── Mode mounts ──────────────────────────────────────────────────────
      function mountT2I(container){
        // Resolution preset dropdown + custom W/H, same as 2511's own T2I panel
        // (ui_t2i_qe.js) instead of always-visible raw W/H fields.
        const matched  = RES_PRESETS.find(p => p.w === state.width && p.h === state.height);
        const isCustom = !matched;
        const wIn = numberField(state.width,  v => { state.width  = Math.max(64, Math.round((v||64)/8)*8); persist(); }, 8);
        const hIn = numberField(state.height, v => { state.height = Math.max(64, Math.round((v||64)/8)*8); persist(); }, 8);
        const customRow = row([col([label("W"), wIn]), col([label("H"), hIn])]);
        customRow.style.display = isCustom ? "flex" : "none";
        const resDD = select(RES_PRESETS.map(p=>({value:p.label,label:p.label})), isCustom?"Custom":matched.label, v=>{
          const p = RES_PRESETS.find(x=>x.label===v);
          if (p && p.w > 0) { state.width=p.w; state.height=p.h; persist(); customRow.style.display="none"; }
          else customRow.style.display="flex";
        });
        container.appendChild(panel([label("Resolution"), resDD, customRow]));

        container.appendChild(panel([row([col([label("STEPS"),numberField(state.steps,v=>{state.steps=v;persist();},1)]),col([label("CFG"),numberField(state.cfg,v=>{state.cfg=v;persist();},0.1)])])]));
        container.appendChild(panel([row([col([label("SAMPLER"),select(SAMPLER_OPTS(),state.sampler,v=>{state.sampler=v;persist();})]),col([label("SCHEDULER"),select(SCHED_OPTS(),state.scheduler,v=>{state.scheduler=v;persist();})])])]));
        container.appendChild(loraRow(state, ctx));
        return { getGraph: async () => buildT2IGraph(state) };
      }
      function mountI2I(container){
        const subTabs = el("div",{style:{display:"flex",gap:"4px",marginBottom:"4px"}});
        ["i2i","ref2img"].forEach(sm => {
          const active = state.i2iSubMode === sm;
          subTabs.appendChild(el("button",{type:"button",text:sm==="i2i"?"I2I":"Ref to Image",style:{flex:"1",cursor:"pointer",fontFamily:"inherit",fontSize:"11px",padding:"6px",borderRadius:"6px",background:active?BRAND:C.bg2,color:"#fff",border:`1px solid ${active?BRAND:C.border}`,fontWeight:active?"700":"400"},onclick:()=>{state.i2iSubMode=sm;persist();renderMode();}}));
        });
        container.appendChild(subTabs);

        if (state.i2iSubMode === "ref2img") {
          // Compact grid: filled slots + one trailing "+ add reference" slot, same
          // layout/behavior as MiniMax H3's Reference to Video image panel (drag to
          // reorder, click/drop or 🖼 gallery-pick per slot, ✕ to clear) instead of a
          // full-width card per image.
          const gridWrap = el("div",{style:{display:"flex",flexWrap:"wrap",gap:"5px",justifyContent:"center"}});
          function renderRefs(){
            clear(gridWrap);
            const label_ = `Ref (${(state.refImages||[]).filter(Boolean).length}/${MAX_REF_IMAGES})`;
            gridWrap.appendChild(el("div",{text:label_,style:{width:"100%",textAlign:"center",fontSize:"10px",color:C.muted,marginBottom:"2px"}}));
            const refs = (state.refImages||[]).slice(0, MAX_REF_IMAGES);
            for (let i = 0; i < Math.min(MAX_REF_IMAGES, refs.length + 1); i++) {
              const current = refs[i]?.filename || null;
              const slot = imageSlot(current ? `Ref ${i+1}` : "+ add\nreference", current,
                (fn) => {
                  const list = (state.refImages||[]).slice();
                  if (fn) { list[i] = { filename: fn }; } else { list.splice(i,1); }
                  state.refImages = list.filter(Boolean).slice(0, MAX_REF_IMAGES);
                  persist(); renderRefs();
                }, { box: 76 });
              if (current) {
                slot.el.draggable = true;
                slot.el.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", String(i)); });
                slot.el.addEventListener("dragover", (e) => e.preventDefault());
                slot.el.addEventListener("drop", (e) => {
                  e.preventDefault();
                  const from = Number(e.dataTransfer.getData("text/plain"));
                  if (Number.isNaN(from) || from === i) return;
                  const list = (state.refImages||[]).slice();
                  const [moved] = list.splice(from, 1);
                  list.splice(i, 0, moved);
                  state.refImages = list.filter(Boolean).slice(0, MAX_REF_IMAGES);
                  persist(); renderRefs();
                });
              }
              gridWrap.appendChild(slot.el);
            }
          }
          renderRefs();
          container.appendChild(panel([gridWrap]));
          container.appendChild(panel([row([col([label("WIDTH"),numberField(state.refWidth,v=>{state.refWidth=v;persist();},8)]),col([label("HEIGHT"),numberField(state.refHeight,v=>{state.refHeight=v;persist();},8)])])]));
          // Was missing entirely — user: "Ref to Image에는 Denoise / STEPS / CFG / SAMPLER /
          // SCHEDULER 기능 누락." Denoise defaults to 1.0 (full generation from references,
          // no source image to partially preserve), same numeric field the graph builder
          // now reads instead of a hardcoded 1.0.
          container.appendChild(panel([
            label("Denoise"),
            slider(0, 1, 0.01, state.refDenoise ?? 1.0, v => { state.refDenoise = v; persist(); }, v => v.toFixed(2)),
          ]));
          container.appendChild(panel([row([col([label("STEPS"),numberField(state.steps,v=>{state.steps=v;persist();},1)]),col([label("CFG"),numberField(state.cfg,v=>{state.cfg=v;persist();},0.1)])])]));
          container.appendChild(panel([row([col([label("SAMPLER"),select(SAMPLER_OPTS(),state.sampler,v=>{state.sampler=v;persist();})]),col([label("SCHEDULER"),select(SCHED_OPTS(),state.scheduler,v=>{state.scheduler=v;persist();})])])]));
          container.appendChild(loraRow(state, ctx));
          return { getGraph: async () => buildRefToImageGraph(state) };
        }

        // Custom output size with 🔒 Lock ratio, same pattern as 2511's own I2I panel
        // (makeSizeFields in ui_i2i_qe.js) — auto-filled from the uploaded image's own
        // size, editable afterwards, ratio-locked by default. User was confused by the
        // old "OUT W (opt)/OUT H (opt)" fields with no lock and no auto-fill.
        const sizeStyle = { width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "5px 7px", fontSize: "12px", fontFamily: "inherit", outline: "none" };
        const wIn2 = el("input", { type: "number", step: "8", min: "64", style: { ...sizeStyle } });
        const hIn2 = el("input", { type: "number", step: "8", min: "64", style: { ...sizeStyle } });
        if (state.i2iWidth)  wIn2.value = state.i2iWidth;
        if (state.i2iHeight) hIn2.value = state.i2iHeight;
        let i2iAspect = (state.i2iWidth && state.i2iHeight) ? state.i2iWidth / state.i2iHeight : 1;
        const snap8 = v => Math.max(8, Math.round(v / 8) * 8);
        const lockChk = el("input", { type: "checkbox" }); lockChk.checked = state.i2iLockRatio ?? true;
        const lockLbl = el("label", { style: { display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: C.muted, cursor: "pointer", whiteSpace: "nowrap" } }, [lockChk, el("span", { text: "🔒 Lock ratio" })]);
        lockChk.addEventListener("change", () => { state.i2iLockRatio = lockChk.checked; if (lockChk.checked && state.i2iWidth && state.i2iHeight) i2iAspect = state.i2iWidth / state.i2iHeight; persist(); });
        wIn2.addEventListener("change", () => { state.i2iWidth = snap8(+wIn2.value||512); wIn2.value = state.i2iWidth; if (state.i2iLockRatio && i2iAspect > 0) { state.i2iHeight = snap8(state.i2iWidth / i2iAspect); hIn2.value = state.i2iHeight; } else if (state.i2iHeight) i2iAspect = state.i2iWidth / state.i2iHeight; persist(); });
        hIn2.addEventListener("change", () => { state.i2iHeight = snap8(+hIn2.value||512); hIn2.value = state.i2iHeight; if (state.i2iLockRatio && i2iAspect > 0) { state.i2iWidth = snap8(state.i2iHeight * i2iAspect); wIn2.value = state.i2iWidth; } else if (state.i2iWidth) i2iAspect = state.i2iWidth / state.i2iHeight; persist(); });
        const sizeEl = col([row([col([label("W"), wIn2]), col([label("H"), hIn2])]), lockLbl]);

        const card = imageUploadCard("Source Image", state.i2iImage, (fn)=>{ state.i2iImage=fn; persist(); }, {
          maxPixels: 1280 * 1280,
          onLoad: (w, h) => { state.i2iWidth = snap8(w); state.i2iHeight = snap8(h); wIn2.value = state.i2iWidth; hIn2.value = state.i2iHeight; i2iAspect = w / h; persist(); },
        });
        container.appendChild(panel([card, sizeEl]));
        container.appendChild(panel([
          label("Denoise"),
          slider(0, 1, 0.01, state.i2iDenoise ?? 0.75, v => { state.i2iDenoise = v; persist(); }, v => v.toFixed(2)),
        ]));
        container.appendChild(panel([row([col([label("STEPS"),numberField(state.steps,v=>{state.steps=v;persist();},1)]),col([label("CFG"),numberField(state.cfg,v=>{state.cfg=v;persist();},0.1)])])]));
        container.appendChild(panel([row([col([label("SAMPLER"),select(SAMPLER_OPTS(),state.sampler,v=>{state.sampler=v;persist();})]),col([label("SCHEDULER"),select(SCHED_OPTS(),state.scheduler,v=>{state.scheduler=v;persist();})])])]));
        container.appendChild(loraRow(state, ctx));
        return {
          getSourceURL: () => state.i2iImage ? `/view?filename=${encodeURIComponent(state.i2iImage)}&type=input` : null,
          setImage: (fn) => { state.i2iImage = fn; card._refresh(fn); },
          getGraph: async () => buildI2IGraph(state),
        };
      }
      function mountEdit(container){
        // Image 1 = main reference, same big upload card as 2511's own Edit panel. The
        // card's own thumbnail is refreshed to the ANNOTATED flattened frame whenever one
        // exists (so a marked-up image visibly shows it), while state.editImage1 itself
        // stays the untouched original — the redraw button always reopens THAT, with the
        // saved strokes replayed on top, so edits/erases are never destructive.
        const card1 = imageUploadCard("Image 1 (main reference)", state.editAnnotImage || state.editImage1, (fn)=>{ state.editImage1=fn; state.editAnnotImage=null; state.editAnnotStrokes=[]; persist(); card1._refresh(fn); });
        container.appendChild(panel([label("Image 1"), card1]));
        const draw1Btn = el("button",{type:"button",text:state.editAnnotImage?"✏ Edit annotation":"✏ Draw annotation",style:{cursor:"pointer",background:state.editAnnotImage?C.brand:C.bg2,color:state.editAnnotImage?"#fff":C.text,border:`1px solid ${C.border}`,borderRadius:"6px",padding:"8px",fontSize:"12px",fontFamily:"inherit"},onclick:()=>{
          if (!state.editImage1) { alert("Upload Image 1 first."); return; }
          const url = `/view?filename=${encodeURIComponent(state.editImage1)}&type=input`;
          openMaskDrawOverlay(root, url, (filename, strokes)=>{
            state.editAnnotImage = filename; state.editAnnotStrokes = strokes; persist();
            card1._refresh(filename);
            showPopup("Annotation added as reference.", false);
            renderMode();
          }, state.editAnnotStrokes);
        }});
        container.appendChild(draw1Btn);
        if (state.editAnnotImage) {
          container.appendChild(el("div",{style:{display:"flex",alignItems:"center",gap:"6px"}},[
            el("div",{text:"✓ Image 1 annotation attached.",style:{fontSize:"10px",color:C.brand,flex:"1"}}),
            el("button",{type:"button",text:"✕ Remove",style:{cursor:"pointer",fontSize:"10px",background:"transparent",color:C.err,border:"none",padding:"2px 4px"},onclick:()=>{
              state.editAnnotImage=null; state.editAnnotStrokes=[]; persist(); card1._refresh(state.editImage1); renderMode();
            }}),
          ]));
        }

        // Images 2–10: MiniMax H3's compact Reference-to-Video grid (up to 9 extra),
        // each filled slot gets its own small ✏ draw-annotation button — user: "이미지
        // 2~10번 MiniMax H3의 Reference to Video Reference 이미지 업로드 방식처럼(9개
        // 입력가능)... Draw annotation은 입력이미지 마다 가능하게 해줘야 된다."
        const EXTRA_MAX = 9;
        if (!Array.isArray(state.editRefImages)) state.editRefImages = [];
        if (!state.editRefAnnotations) state.editRefAnnotations = {};
        if (!state.editRefAnnotationStrokes) state.editRefAnnotationStrokes = {};
        const gridWrap = el("div",{style:{display:"flex",flexWrap:"wrap",gap:"5px",justifyContent:"center"}});
        function renderExtraGrid(){
          clear(gridWrap);
          gridWrap.appendChild(el("div",{text:`Images 2–10 (${(state.editRefImages||[]).filter(Boolean).length}/${EXTRA_MAX})`,style:{width:"100%",textAlign:"center",fontSize:"10px",color:C.muted,marginBottom:"2px"}}));
          const refs = (state.editRefImages||[]).slice(0, EXTRA_MAX);
          for (let i = 0; i < Math.min(EXTRA_MAX, refs.length + 1); i++) {
            const current = refs[i]?.filename || null; // the true original — always the redraw source & graph's base image
            const annotated = state.editRefAnnotations[i] || null;
            const cell = el("div",{style:{display:"flex",flexDirection:"column",gap:"2px",alignItems:"center"}});
            // Thumbnail shows the annotated (marked-up) version when one exists, so edits
            // are visibly reflected — user: "수정을 했던 흔적이 있으면 썸네일에 반영되어
            // 보여져야." The underlying original filename in editRefImages is untouched.
            const slot = imageSlot(current ? `Img ${i+2}` : "+ add\nimage", annotated || current, (fn) => {
              const list = (state.editRefImages||[]).slice();
              if (fn) { list[i] = { filename: fn }; delete state.editRefAnnotations[i]; delete state.editRefAnnotationStrokes[i]; }
              else { list.splice(i,1); delete state.editRefAnnotations[i]; delete state.editRefAnnotationStrokes[i]; }
              state.editRefImages = list.filter(Boolean).slice(0, EXTRA_MAX);
              persist(); renderExtraGrid();
            }, { box: 76 });
            cell.appendChild(slot.el);
            if (current) {
              slot.el.draggable = true;
              slot.el.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", String(i)); });
              slot.el.addEventListener("dragover", (e) => e.preventDefault());
              slot.el.addEventListener("drop", (e) => {
                e.preventDefault();
                const from = Number(e.dataTransfer.getData("text/plain"));
                if (Number.isNaN(from) || from === i) return;
                const list = (state.editRefImages||[]).slice();
                const [moved] = list.splice(from, 1);
                list.splice(i, 0, moved);
                state.editRefImages = list.filter(Boolean).slice(0, EXTRA_MAX);
                persist(); renderExtraGrid();
              });
              const drawBtn = el("button",{type:"button",text:annotated?"✓✏":"✏",title:annotated?"Edit this image's annotation":"Draw annotation on this image",style:{cursor:"pointer",background:annotated?C.brand:C.bg2,color:"#fff",border:`1px solid ${C.border}`,borderRadius:"4px",fontSize:"10px",padding:"1px 6px"},onclick:()=>{
                const url = `/view?filename=${encodeURIComponent(current)}&type=input`;
                openMaskDrawOverlay(root, url, (filename, strokes)=>{
                  state.editRefAnnotations[i]=filename; state.editRefAnnotationStrokes[i]=strokes; persist(); renderExtraGrid();
                  showPopup(`Annotation added for Image ${i+2}.`, false);
                }, state.editRefAnnotationStrokes[i]);
              }});
              cell.appendChild(drawBtn);
            }
            gridWrap.appendChild(cell);
          }
        }
        renderExtraGrid();
        container.appendChild(panel([gridWrap]));

        container.appendChild(panel([
          label("Output Size Source"),
          select([{value:"img1",label:"Match Image 1 size"},{value:"manual",label:"Manual"}], state.editSizeSource||"img1", v=>{state.editSizeSource=v;persist();}),
        ]));
        container.appendChild(panel([row([col([label("STEPS"),numberField(state.steps,v=>{state.steps=v;persist();},1)]),col([label("CFG"),numberField(state.cfg,v=>{state.cfg=v;persist();},0.1)])])]));
        container.appendChild(panel([row([col([label("SAMPLER"),select(SAMPLER_OPTS(),state.sampler,v=>{state.sampler=v;persist();})]),col([label("SCHEDULER"),select(SCHED_OPTS(),state.scheduler,v=>{state.scheduler=v;persist();})])])]));
        container.appendChild(loraRow(state, ctx));
        return {
          getSourceURL: () => state.editImage1 ? `/view?filename=${encodeURIComponent(state.editImage1)}&type=input` : null,
          setImage: (fn) => { state.editImage1 = fn; state.editAnnotImage = null; state.editAnnotStrokes = []; card1._refresh(fn); },
          getGraph: async () => buildEditGraph(state),
        };
      }
      function mountInpaint(container){
        const subTabs = el("div",{style:{display:"flex",gap:"4px",marginBottom:"4px"}});
        ["inpaint","outpaint"].forEach(sm => {
          const active = state.paintSubMode === sm;
          subTabs.appendChild(el("button",{type:"button",text:sm==="inpaint"?"Inpaint":"Outpaint",style:{flex:"1",cursor:"pointer",fontFamily:"inherit",fontSize:"11px",padding:"6px",borderRadius:"6px",background:active?BRAND:C.bg2,color:"#fff",border:`1px solid ${active?BRAND:C.border}`,fontWeight:active?"700":"400"},onclick:()=>{state.paintSubMode=sm;persist();renderMode();}}));
        });
        container.appendChild(subTabs);

        const card = imageUploadCard("Source Image", state.inpaintAnnotImage || state.inpaintImage, (fn)=>{ state.inpaintImage=fn; state.inpaintAnnotImage=null; state.inpaintAnnotStrokes=[]; persist(); });
        container.appendChild(panel([label("Source Image"), card]));

        if (state.paintSubMode === "inpaint") {
          const drawBtn = el("button",{type:"button",text:state.inpaintAnnotImage?"✏ Edit mask":"✏ Draw mask (required)",style:{cursor:"pointer",background:state.inpaintAnnotImage?C.brand:C.bg2,color:state.inpaintAnnotImage?"#fff":C.text,border:`1px solid ${C.border}`,borderRadius:"6px",padding:"8px",fontSize:"12px",fontFamily:"inherit"},onclick:()=>{
            if (!state.inpaintImage) { alert("Upload a source image first."); return; }
            const url = `/view?filename=${encodeURIComponent(state.inpaintImage)}&type=input`;
            openMaskDrawOverlay(root, url, (filename, strokes)=>{
              state.inpaintAnnotImage = filename; state.inpaintAnnotStrokes = strokes; persist();
              card._refresh(filename);
              showPopup("Marked area attached.", false);
              renderMode();
            }, state.inpaintAnnotStrokes);
          }});
          container.appendChild(drawBtn);
          if (state.inpaintAnnotImage) container.appendChild(el("div",{style:{display:"flex",alignItems:"center",gap:"6px"}},[
            el("div",{text:"✓ Marked area ready.",style:{fontSize:"10px",color:C.brand,flex:"1"}}),
            el("button",{type:"button",text:"✕ Remove",style:{cursor:"pointer",fontSize:"10px",background:"transparent",color:C.err,border:"none",padding:"2px 4px"},onclick:()=>{
              state.inpaintAnnotImage=null; state.inpaintAnnotStrokes=[]; persist(); card._refresh(state.inpaintImage); renderMode();
            }}),
          ]));
          container.appendChild(panel([
            label("Denoise"),
            slider(0.1, 1, 0.01, state.inpaintDenoise ?? 0.85, v => { state.inpaintDenoise = v; persist(); }, v => v.toFixed(2)),
          ]));
          container.appendChild(panel([row([col([label("STEPS"),numberField(state.steps,v=>{state.steps=v;persist();},1)]),col([label("CFG"),numberField(state.cfg,v=>{state.cfg=v;persist();},0.1)])])]));
          container.appendChild(panel([row([col([label("SAMPLER"),select(SAMPLER_OPTS(),state.sampler,v=>{state.sampler=v;persist();})]),col([label("SCHEDULER"),select(SCHED_OPTS(),state.scheduler,v=>{state.scheduler=v;persist();})])])]));
          container.appendChild(loraRow(state, ctx));
          return {
            getSourceURL: () => state.inpaintImage ? `/view?filename=${encodeURIComponent(state.inpaintImage)}&type=input` : null,
            setImage: (fn) => { state.inpaintImage = fn; state.inpaintAnnotImage = null; state.inpaintAnnotStrokes = []; card._refresh(fn); },
            switchSubMode: (sm) => { state.paintSubMode = sm; renderMode(); },
            getGraph: async () => buildInpaintGraph(state),
          };
        }

        container.appendChild(panel([
          label("Expansion (px)"),
          row([col([label("Up"),numberField(state.outpaintUp,v=>{state.outpaintUp=v;persist();},8)]),col([label("Down"),numberField(state.outpaintDown,v=>{state.outpaintDown=v;persist();},8)])]),
          row([col([label("Left"),numberField(state.outpaintLeft,v=>{state.outpaintLeft=v;persist();},8)]),col([label("Right"),numberField(state.outpaintRight,v=>{state.outpaintRight=v;persist();},8)])]),
        ]));
        container.appendChild(panel([
          label("Pad Color (R G B)"),
          row([
            col([label("R"),numberField(state.outpaintPadR??0,v=>{state.outpaintPadR=Math.max(0,Math.min(255,Math.round(v)));persist();},1)]),
            col([label("G"),numberField(state.outpaintPadG??0,v=>{state.outpaintPadG=Math.max(0,Math.min(255,Math.round(v)));persist();},1)]),
            col([label("B"),numberField(state.outpaintPadB??0,v=>{state.outpaintPadB=Math.max(0,Math.min(255,Math.round(v)));persist();},1)]),
          ]),
        ]));
        container.appendChild(panel([row([col([label("STEPS"),numberField(state.steps,v=>{state.steps=v;persist();},1)]),col([label("CFG"),numberField(state.cfg,v=>{state.cfg=v;persist();},0.1)])])]));
        container.appendChild(panel([row([col([label("SAMPLER"),select(SAMPLER_OPTS(),state.sampler,v=>{state.sampler=v;persist();})]),col([label("SCHEDULER"),select(SCHED_OPTS(),state.scheduler,v=>{state.scheduler=v;persist();})])])]));
        container.appendChild(loraRow(state, ctx));
        return {
          getSourceURL: () => state.inpaintImage ? `/view?filename=${encodeURIComponent(state.inpaintImage)}&type=input` : null,
          setImage: (fn) => { state.inpaintImage = fn; card._refresh(fn); },
          switchSubMode: (sm) => { state.paintSubMode = sm; renderMode(); },
          getGraph: async () => buildOutpaintGraph(state),
        };
      }
      function mountUpscale(container){
        const card = imageUploadCard("Source Image", state.upscaleImage, (fn)=>{ state.upscaleImage=fn; persist(); });
        container.appendChild(panel([label("Source Image"), card]));

        const ditWrap = el("div"), vaeWrap = el("div");
        function buildModelSelects(models){
          clear(ditWrap); clear(vaeWrap);
          const opts = ["none", ...models.filter(m=>m!=="none")];
          const ditSel = searchableSelect(opts, state.upscaleDitModel||"none", v=>{state.upscaleDitModel=v;persist();});
          const vaeSel = searchableSelect(opts, state.upscaleVaeModel||"none", v=>{state.upscaleVaeModel=v;persist();});
          ditWrap.appendChild(col([label("DiT Model"),ditSel.el]));
          vaeWrap.appendChild(col([label("VAE Model"),vaeSel.el]));
        }
        buildModelSelects(["none"]);
        const refreshBtn = button("↻ Refresh", async()=>{
          refreshBtn.textContent="Loading…"; refreshBtn.disabled=true;
          try { const d=await getSeedVR2Models(); buildModelSelects(d.models||["none"]); }
          finally { refreshBtn.textContent="↻ Refresh"; refreshBtn.disabled=false; }
        });
        container.appendChild(panel([el("div",{style:{display:"flex",flexDirection:"column",gap:"6px"}},[
          ditWrap, vaeWrap, refreshBtn,
          el("div",{style:{fontSize:"10px",color:C.muted}},[el("span",{html:"Models → <code>models/SEEDVR2/</code>"})]),
        ])]));
        getSeedVR2Models().then(d=>buildModelSelects(d.models||["none"])).catch(()=>{});

        function numRow(lbl, key, min, max, step, def, tip){
          const inp = el("input",{type:"number",min,max,step,style:{width:"70px",background:C.bg2,color:C.text,border:`1px solid ${C.border}`,borderRadius:"4px",padding:"4px 6px",fontSize:"12px",fontFamily:"inherit",outline:"none"}});
          inp.value = state[key]??def;
          inp.addEventListener("input",()=>{state[key]=parseFloat(inp.value)||def;persist();});
          const lblEl = el("div",{text:lbl,style:{flex:"1",fontSize:"12px",color:C.text}});
          if (tip) { lblEl.title=tip; lblEl.style.cursor="help"; lblEl.style.borderBottom=`1px dotted ${C.muted}`; lblEl.style.display="inline-block"; }
          return row([lblEl,inp],"8px");
        }
        function comboRow(lbl, key, options, def){
          const sel = el("select",{style:{width:"70px",background:C.bg2,color:C.text,border:`1px solid ${C.border}`,borderRadius:"4px",padding:"4px 6px",fontSize:"11px",fontFamily:"inherit",outline:"none"}});
          options.forEach(o=>{const opt=el("option",{value:o,text:o});if((state[key]||def)===o)opt.selected=true;sel.appendChild(opt);});
          sel.addEventListener("change",e=>{state[key]=e.target.value;persist();});
          return row([el("div",{text:lbl,style:{flex:"1",fontSize:"12px",color:C.text}}),sel],"8px");
        }
        container.appendChild(panel([
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

        return {
          beforeGenerate: async () => {
            if (!state.upscaleImage) throw new Error("Upload a source image.");
            if (!state.upscaleDitModel || state.upscaleDitModel==="none") throw new Error("Select a SeedVR2 DiT model.");
            if (!state.upscaleVaeModel || state.upscaleVaeModel==="none") throw new Error("Select a SeedVR2 VAE model.");
          },
          getSourceURL: () => state.upscaleImage ? `/view?filename=${encodeURIComponent(state.upscaleImage)}&type=input` : null,
          setImage: (fn) => { state.upscaleImage = fn; card._refresh(fn); },
          getGraph: async () => buildUpscaleGraph(state),
        };
      }
      // ── POSE (VNCCS PoseStudio LoRA) — Image 1 is a SAM3D-Body render of the (cropped)
      // pose image, Image 2 is the character. getGraph() does the pose extraction itself
      // (queued and awaited) before returning the actual generation graph, so the shared
      // Generate flow (which already awaits modeHandle.getGraph()) needs no special-casing.
      function mountPose(container){
        let poseNaturalW = 0, poseNaturalH = 0;

        // Yellow box drawn ON the thumbnail itself, positioned proportionally within the
        // card's own contain-fit rect — user: "로드된 이미지도 썸네일에도 설정한 크롭
        // 영역(노란 박스 라인)이 표시되야 한다."
        const cropOverlayBox = el("div",{style:{position:"absolute",border:"2px solid #ffd400",boxSizing:"border-box",pointerEvents:"none",display:"none"}});
        function updateCropOverlayBox(){
          const box = state.poseCropBox;
          if (!box || !poseNaturalW || !poseNaturalH) { cropOverlayBox.style.display = "none"; return; }
          const cardBox = poseCard.querySelector("img")?.parentElement;
          if (!cardBox) return;
          const cw = cardBox.clientWidth || 192, ch = cardBox.clientHeight || 192;
          const scale = Math.min(cw / poseNaturalW, ch / poseNaturalH);
          const fitW = poseNaturalW * scale, fitH = poseNaturalH * scale;
          const offX = (cw - fitW) / 2, offY = (ch - fitH) / 2;
          cropOverlayBox.style.left = `${offX + box.x * scale}px`;
          cropOverlayBox.style.top = `${offY + box.y * scale}px`;
          cropOverlayBox.style.width = `${box.w * scale}px`;
          cropOverlayBox.style.height = `${box.h * scale}px`;
          cropOverlayBox.style.display = "block";
        }

        const poseCard = imageUploadCard("Image 1 — Pose Image", state.poseImageRaw, (fn)=>{
          state.poseImageRaw = fn; state.poseImage = null; state.poseCropBox = null; state.poseCropRatioLabel = ""; state.poseRenderImage = null;
          persist(); poseCard._refresh(fn); updateCropLabel(); updateCropOverlayBox();
        }, {
          onLoad: (w, h) => { poseNaturalW = w; poseNaturalH = h; updateCropOverlayBox(); },
        });
        poseCard.querySelector("img")?.parentElement?.appendChild(cropOverlayBox);
        container.appendChild(panel([label("Image 1 — Pose Image"), poseCard]));

        const cropBtn = el("button",{type:"button",text: state.poseCropBox ? "✂ Edit Crop" : "✂ Crop Pose Image (required)",style:{cursor:"pointer",background:state.poseCropBox?C.brand:C.bg2,color:state.poseCropBox?"#fff":C.text,border:`1px solid ${C.border}`,borderRadius:"6px",padding:"8px",fontSize:"12px",fontFamily:"inherit"},onclick:()=>{
          if (!state.poseImageRaw) { showPopup("Upload the pose image first.", true); return; }
          const url = `/view?filename=${encodeURIComponent(state.poseImageRaw)}&type=input`;
          openPoseCropOverlay(root, url, state.poseCropBox, async (cropBox, ratioLabel) => {
            state.poseCropBox = cropBox;
            state.poseCropRatioLabel = ratioLabel && ratioLabel !== "Free" ? ratioLabel : "";
            // A freshly-picked region resets Output Size to the crop's own native size
            // (no resize) — the fields below let the user retarget it afterwards, locked
            // to this crop's aspect ratio.
            state.poseOutW = Math.round(cropBox.w); state.poseOutH = Math.round(cropBox.h);
            outWIn.value = state.poseOutW; outHIn.value = state.poseOutH;
            state.poseRenderImage = null; // stale after a re-crop
            persist(); updateCropOverlayBox();
            await reuploadPoseImage();
          });
        }});
        function cropSizeLabelText(){
          if (!state.poseCropBox) return "";
          const ratioPrefix = state.poseCropRatioLabel ? `Ratio ${state.poseCropRatioLabel}    ` : "";
          return `${ratioPrefix}${Math.round(state.poseCropBox.w)}×${Math.round(state.poseCropBox.h)} → ${state.poseOutW}×${state.poseOutH}`;
        }
        const cropSizeText = el("div",{text: cropSizeLabelText(), style:{color:"#fff",fontSize:"11px",textAlign:"center"}});
        function updateCropLabel(){
          cropBtn.textContent = state.poseCropBox ? "✂ Edit Crop" : "✂ Crop Pose Image (required)";
          cropBtn.style.background = state.poseCropBox ? C.brand : C.bg2;
          cropBtn.style.color = state.poseCropBox ? "#fff" : C.text;
          cropSizeText.textContent = cropSizeLabelText();
        }
        container.appendChild(panel([cropBtn, cropSizeText]));

        // ── Image Output Size — locked to the CROP's own aspect ratio (not the raw
        // image's), same 🔒 Lock ratio UX as I2I's own size fields. Re-crops+uploads from
        // the raw source every time W or H actually changes.
        const outSizeStyle = { width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "5px 7px", fontSize: "12px", fontFamily: "inherit", outline: "none" };
        const outWIn = el("input", { type: "number", step: "8", min: "64", style: { ...outSizeStyle } });
        const outHIn = el("input", { type: "number", step: "8", min: "64", style: { ...outSizeStyle } });
        outWIn.value = state.poseOutW; outHIn.value = state.poseOutH;
        const outLockChk = el("input", { type: "checkbox" }); outLockChk.checked = state.poseLockRatio ?? true;
        const outLockLbl = el("label", { style: { display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: C.muted, cursor: "pointer", whiteSpace: "nowrap" } }, [outLockChk, el("span", { text: "🔒 Lock ratio" })]);
        outLockChk.addEventListener("change", () => { state.poseLockRatio = outLockChk.checked; persist(); });
        const snap8 = v => Math.max(8, Math.round(v / 8) * 8);
        function cropAspect(){ const b = state.poseCropBox; return b ? b.w / b.h : (outWIn.value / outHIn.value || 1); }
        async function reuploadPoseImage(){
          if (!state.poseImageRaw || !state.poseCropBox) return;
          cropBtn.disabled = true;
          try {
            const url = `/view?filename=${encodeURIComponent(state.poseImageRaw)}&type=input`;
            const filename = await cropAndUploadPoseImage(url, state.poseCropBox, state.poseOutW, state.poseOutH);
            state.poseImage = filename; state.poseRenderImage = null; persist();
            updateCropLabel();
          } catch (e) { showPopup("Crop failed: " + e.message, true); }
          finally { cropBtn.disabled = false; }
        }
        outWIn.addEventListener("change", async () => {
          state.poseOutW = snap8(+outWIn.value || 512); outWIn.value = state.poseOutW;
          if (outLockChk.checked) { state.poseOutH = snap8(state.poseOutW / cropAspect()); outHIn.value = state.poseOutH; }
          persist(); updateCropLabel(); await reuploadPoseImage();
        });
        outHIn.addEventListener("change", async () => {
          state.poseOutH = snap8(+outHIn.value || 512); outHIn.value = state.poseOutH;
          if (outLockChk.checked) { state.poseOutW = snap8(state.poseOutH * cropAspect()); outWIn.value = state.poseOutW; }
          persist(); updateCropLabel(); await reuploadPoseImage();
        });
        container.appendChild(panel([label("Image Output Size"), row([col([label("W"), outWIn]), col([label("H"), outHIn])]), outLockLbl]));

        const charCard = imageUploadCard("Image 2 — Character Image", state.poseCharacterImage, (fn)=>{ state.poseCharacterImage=fn; persist(); charCard._refresh(fn); });
        container.appendChild(panel([label("Image 2 — Character Image"), charCard]));

        container.appendChild(panel([row([col([label("STEPS"),numberField(state.steps,v=>{state.steps=v;persist();},1)]),col([label("CFG"),numberField(state.cfg,v=>{state.cfg=v;persist();},0.1)])])]));
        container.appendChild(panel([row([col([label("SAMPLER"),select(SAMPLER_OPTS(),state.sampler,v=>{state.sampler=v;persist();})]),col([label("SCHEDULER"),select(SCHED_OPTS(),state.scheduler,v=>{state.scheduler=v;persist();})])])]));

        return {
          getSourceURL: () => state.poseRenderImage ? `/view?filename=${encodeURIComponent(state.poseRenderImage)}&type=output` : null,
          setImage: (fn) => { state.poseCharacterImage = fn; charCard._refresh(fn); },
          getGraph: async () => {
            if (!state.poseImage) throw new Error("Crop the pose image first (✂ Crop Pose Image).");
            if (!state.poseCharacterImage) throw new Error("Upload the character image (Image 2).");
            const extractResult = await queuePrompt(buildPoseExtractGraph(state));
            const renderIm = extractResult?.output?.images?.[0];
            if (!renderIm) throw new Error("Pose extraction produced no image.");
            state.poseRenderImage = renderIm.filename; persist();
            // The render lands in output/ (SaveImage), but LoadImage only validates
            // against input/ — copy it over before wiring it as <image1> for Phase 2,
            // same as every other "reuse an output as the next input" flow in this pack.
            const renderInputFilename = await copyOutputToInput(renderIm.filename, renderIm.subfolder || "", "output");
            return buildPoseGraph(state, renderInputFilename);
          },
        };
      }
      function SAMPLER_OPTS(){ return ["euler","euler_ancestral","er_sde","dpm_2","dpm_2_ancestral","lms","dpm_fast","heun","dpm_pp_2m"].map(v=>({value:v,label:v})); }
      function SCHED_OPTS(){ return ["simple","normal","karras","exponential","sgm_uniform","beta"].map(v=>({value:v,label:v})); }

      function renderMode(){
        const mode = state.mode; clear(leftPanel); modeHandle = null;
        switch (mode) {
          case "t2i":     modeHandle = mountT2I(leftPanel); break;
          case "i2i":     modeHandle = mountI2I(leftPanel); break;
          case "edit":    modeHandle = mountEdit(leftPanel); break;
          case "inpaint": modeHandle = mountInpaint(leftPanel); break;
          case "pose":    modeHandle = mountPose(leftPanel); break;
          case "upscale": modeHandle = mountUpscale(leftPanel); break;
        }
        leftOuter.appendChild(seedGenWrap);
        promptTA.value = getModePrompt(mode); updateCount();
        restorePreview(); renderSendTo();
      }

      // ── Generate ─────────────────────────────────────────────────────────
      let running = false;
      genBtn.onclick = async () => {
        if (running || !modeHandle) return;
        running = true; genBtn.disabled = true; genBtn.textContent = "⏳ Queuing…";
        previewBox.appendChild(loadingOv); loadingOv.style.display = "flex";

        if (state.seedMode === "randomize") { state.seed = randomSeed(); seedInput.value = state.seed; }
        else if (state.seedMode === "increment") { state.seed = (state.seed||0)+1; seedInput.value = state.seed; }
        else if (state.seedMode === "decrement") { state.seed = Math.max(0,(state.seed||0)-1); seedInput.value = state.seed; }
        persist();

        if (state.useModelOverride) { state.modelOverride = getOverrideSlot("model_override"); state.clipOverride = getOverrideSlot("clip_override"); state.vaeOverride = getOverrideSlot("vae_override"); }
        else { state.modelOverride = ""; state.clipOverride = ""; state.vaeOverride = ""; }

        if (state.autoEnhance && getModePrompt(state.mode).trim()) {
          genBtn.textContent = "⏳ Enhancing…";
          try {
            pxTA.value = getModePrompt(state.mode);
            await llmApi.enhance();
            setModePrompt(state.mode, pxTA.value); promptTA.value = pxTA.value; persist(); updateCount();
          } catch (err) {
            alert(`Auto Enhance failed: ${err.message}`); running=false; genBtn.disabled=false; genBtn.textContent="▶ Generate"; loadingOv.style.display="none"; if(!modeResults[state.mode]) resetPreview(); return;
          }
          genBtn.textContent = "⏳ Queuing…";
        }

        const mOk = state.modelOverride || (state.model && state.model !== "none");
        if (!mOk) { alert("No model selected. Open ⚙ Settings to pick a model."); running=false; genBtn.disabled=false; genBtn.textContent="▶ Generate"; loadingOv.style.display="none"; if(!modeResults[state.mode]) resetPreview(); return; }

        let prompt;
        try {
          prompt = await modeHandle.getGraph();
          const po = getPromptOverride();
          if (po) { for (const n of Object.values(prompt)) { if (n.class_type === "TextEncodeQwenImage21" && n.inputs?.prompt) n.inputs.prompt = po + " " + n.inputs.prompt; } }
        }
        catch (err) { alert(`Build error: ${err.message}`); running=false; genBtn.disabled=false; genBtn.textContent="▶ Generate"; loadingOv.style.display="none"; if(!modeResults[state.mode]) resetPreview(); return; }

        try {
          genBtn.textContent = "⏳ Running…";
          const result = await queuePrompt(prompt);
          const im = result?.output?.images?.[0];
          if (im) { showResult(im); if (state.outputMode !== "preview") await saveMeta(im.filename, im.subfolder||"", {...state, mode: state.mode}); }
        } catch (err) {
          if (err.message !== "cancelled") alert(`Generation error: ${err.message}`);
          loadingOv.style.display = "none"; if (!modeResults[state.mode]) resetPreview();
        } finally {
          running = false; genBtn.disabled = false; genBtn.textContent = "▶ Generate"; loadingOv.style.display = "none";
          state.modelOverride = ""; state.clipOverride = ""; state.vaeOverride = "";
        }
      };

      // ── Help overlay ─────────────────────────────────────────────────────
      const helpEl = el("div",{style:{position:"absolute",inset:"0",zIndex:"9998",background:"rgba(11,11,11,0.98)",borderRadius:"inherit",display:"none",flexDirection:"column",padding:"14px",gap:"0",boxSizing:"border-box"}});
      const helpTop = el("div",{style:{display:"flex",alignItems:"center",gap:"8px",flexShrink:"0",marginBottom:"10px"}});
      helpTop.appendChild(el("div",{text:"❓ Help — QWEN IMAGE 2.1 ONE STUDIO (TJ)",style:{color:"#fff",fontSize:"14px",fontWeight:"700",flex:"1"}}));
      helpTop.appendChild(button("✕",()=>helpEl.style.display="none","danger"));
      helpEl.appendChild(helpTop);
      const helpBody = el("div",{style:{flex:"1",overflowY:"auto",display:"flex",flexDirection:"column",gap:"10px"}});
      helpBody.className = "q21v1-lp";
      [
        ["T2I", "Text-to-image. Pick a resolution preset (or Custom W/H), write a prompt, Generate."],
        ["I2I", "Image-to-image with a single Source Image and a Denoise slider — lower keeps more of the original, 1.0 rewrites it fully. Optional custom output size with a 🔒 Lock ratio toggle."],
        ["I2I — Ref to Image", "Up to 10 reference images composed into a new image from your prompt, at its own output resolution — no single 'source' image, all references are equal inputs."],
        ["EDIT", "Image 1 is the main reference; Images 2–10 are extra references in a compact grid (drag to reorder). Each image can get its own hand-drawn ✏ annotation pointing at what to change — the annotation is sent as an extra reference, not a mask."],
        ["PAINT — Inpaint", "Draw directly on the Source Image to mark the area to change (✏ Draw mask). No separate mask file — the marked-up image is sent as a second reference alongside the original."],
        ["PAINT — Outpaint", "Expands the canvas (Up/Down/Left/Right) and fills the new border with Pad Color before asking the model to extend the scene into it."],
        ["POSE", "Copies the pose from Image 1 onto the character in Image 2, using the VNCCS PoseStudio LoRA (select it in ⚙ Settings first). Image 1 must be cropped (✂ Crop Pose Image, yellow box + handles) to the pose subject before Generate — the crop's own output size is what SAM3D Body extracts the pose at. The system prompt (editable/resettable in Settings) is automatically prepended to whatever you write in the PROMPT field."],
        ["UPSCALE", "SeedVR2 upscaler — pick a DiT + VAE model pair from models/SEEDVR2/, independent of the Qwen model above."],
        ["Model Override", "Enable in Settings to expose model/clip/vae input sockets on the node itself, so an external loader can override this node's own Settings selection at generation time only."],
        ["Send to / Gallery", "Copies the current result into the next mode's Source/Image 1 slot, or browse this node's own render history in 🖼 Gallery."],
      ].forEach(([title, body]) => {
        const block = el("div",{style:{background:C.bg1,border:`1px solid ${C.border}`,borderRadius:"8px",padding:"10px 12px"}});
        block.appendChild(el("div",{text:title,style:{color:BRAND,fontSize:"12px",fontWeight:"700",marginBottom:"6px"}}));
        block.appendChild(el("div",{text:body,style:{fontSize:"11.5px",lineHeight:"1.65",color:C.text,whiteSpace:"pre-wrap"}}));
        helpBody.appendChild(block);
      });
      {
        const loraBlock = el("div",{style:{background:C.bg1,border:`1px solid ${C.border}`,borderRadius:"8px",padding:"10px 12px"}});
        loraBlock.appendChild(el("div",{text:"POSE — LoRA Download",style:{color:BRAND,fontSize:"12px",fontWeight:"700",marginBottom:"6px"}}));
        loraBlock.appendChild(el("div",{html:'Download <b>VNCCS_QI2_PoseStudioV1.1.safetensors</b> and place it in <code>models/loras/</code>, then select it under ⚙ Settings → POSE — Pose Copy Settings.<br><a href="https://huggingface.co/MIUProject/VNCCS_PoseStudio_QI2.1/blob/main/VNCCS_QI2_PoseStudioV1.1.safetensors" target="_blank" rel="noopener" style="color:'+BRAND+'">huggingface.co/MIUProject/VNCCS_PoseStudio_QI2.1</a>',style:{fontSize:"11.5px",lineHeight:"1.65",color:C.text}}));
        helpBody.appendChild(loraBlock);

        // SAM3DBody_Loader/_Predict/_Smooth/_Render (comfy_extras.nodes_sam3d_body — the
        // node names used by buildPoseExtractGraph, matching the user's own reference
        // workflow) need exactly ONE model file. A different, unrelated third-party pack
        // (custom_nodes.ComfyUI-SAM3DBody: LoadSAM3DBodyModel/SAM3DBodyProcessAdvanced,
        // 4 model files) was mistakenly documented here before — that pack isn't used by
        // this graph at all, so don't reintroduce its download links.
        const samBlock = el("div",{style:{background:C.bg1,border:`1px solid ${C.border}`,borderRadius:"8px",padding:"10px 12px"}});
        samBlock.appendChild(el("div",{text:"POSE — SAM3D Body Model",style:{color:BRAND,fontSize:"12px",fontWeight:"700",marginBottom:"6px"}}));
        samBlock.appendChild(el("div",{html:'Required for the ✂ Crop Pose Image → SAM3D pose extraction step. Place it under <code>ComfyUI/models/detection/</code>:<br><a href="https://huggingface.co/Comfy-Org/sam-3d-body/resolve/main/detection/sam_3d_body_dinov3_bf16.safetensors" target="_blank" rel="noopener" style="color:'+BRAND+'">sam_3d_body_dinov3_bf16.safetensors</a>',style:{fontSize:"11.5px",lineHeight:"1.75",color:C.text}}));
        helpBody.appendChild(samBlock);
      }
      helpEl.appendChild(helpBody);
      helpOv = { el: helpEl, show(){ helpEl.style.display = "flex"; } };
      root.appendChild(helpEl);

      // ── Settings overlay (model/clip/vae, cache/sage toggles, output subfolder) ──
      settingsOv = createSettingsOverlay(state, ctx, showPopup);
      root.appendChild(settingsOv.el);

      // ── Gallery overlay (full 2511-parity: pagination, lightbox, favorite/delete) ──
      galleryOv = createGalleryOverlay(
        state, ctx,
        meta => { Object.assign(state, meta); persist(); renderPills(); renderMode(); },
        (mode, field, subMode, filename) => {
          state[field] = filename;
          if (mode === state.mode) {
            if (subMode && subMode !== state.paintSubMode) {
              state.paintSubMode = subMode;
              modeHandle?.switchSubMode?.(subMode);
            }
            if (modeHandle?.setImage) { modeHandle.setImage(filename); persist(); }
            else { persist(); renderPills(); renderMode(); }
          } else {
            if (subMode) state.paintSubMode = subMode;
            state.mode = mode; persist(); renderPills(); renderMode();
          }
        }
      );
      root.appendChild(galleryOv.el);

      import("./klein/ui_prompt_templates.js").then(mod=>{
        if(!mod.createTemplateOverlay)return;
        const tOv=mod.createTemplateOverlay(state,ctx,txt=>{setModePrompt(state.mode,txt);promptTA.value=txt;persist();updateCount();},"qwen21");
        root.appendChild(tOv.el);
        tplBtn.onclick=()=>tOv.show();
      }).catch(()=>{});

      root.appendChild(promptExpandEl);

      document.addEventListener("keydown", e => {
        if (e.key !== "Escape") return;
        if (promptExpandEl.style.display !== "none") { promptExpandEl.style.display = "none"; return; }
        if (helpEl.style.display !== "none") { helpEl.style.display = "none"; return; }
        if (settingsOv?.el.style.display !== "none") { settingsOv.hide(); return; }
        if (galleryOv?.el.style.display !== "none") { galleryOv.hide(); return; }
      });

      self.addDOMWidget("q21v1_ui","div",root,{serialize:false,computeSize:()=>[NODE_MW, NODE_MH]});
      self._tjRepaint = () => { seedInput.value = state.seed ?? 0; promptTA.value = getModePrompt(state.mode); updateCount?.(); renderPills(); renderMode(); };
      renderPills(); renderMode();

      // Populate model lists once
      getModels().then(d => {
        ctx.availableLoras = d.loras || [];
        settingsOv.setModelLists(d);
      }).catch(()=>{});
    };
  },
});

// ── Searchable <select> — same shape as 2511's own (ui_app_settings_qe.js /
// ui_upscale_qe.js), module-scoped here so both the Settings overlay and the Upscale
// mode's DiT/VAE pickers reuse the one implementation.
function searchableSelect(options, value, onChange){
  const wrap = el("div", { style:{ display:"flex", flexDirection:"column", gap:"2px" }});
  const search = el("input",{type:"text",placeholder:"Search…",style:{ width:"100%",boxSizing:"border-box",background:C.bg2,color:C.text,border:`1px solid ${C.border}`,borderRadius:"6px 6px 0 0",padding:"4px 7px",fontSize:"11px",fontFamily:"inherit",outline:"none" }});
  const sel = el("select",{style:{ width:"100%",boxSizing:"border-box",background:C.bg2,color:C.text,border:`1px solid ${C.border}`,borderTopWidth:"0",borderRadius:"0 0 6px 6px",padding:"5px",fontSize:"11px",fontFamily:"inherit",outline:"none" }});
  let current = value;
  function build(filter){
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

// ── Settings overlay ───────────────────────────────────────────────────────────
function createSettingsOverlay(state, ctx, showPopup) {
  const el_ = el;
  const wrap = el_("div",{style:{position:"absolute",inset:"0",zIndex:"9996",background:"rgba(11,11,11,0.97)",borderRadius:"inherit",display:"none",flexDirection:"column",padding:"14px",gap:"10px",boxSizing:"border-box",overflowY:"auto"}});
  const hdr = el_("div",{style:{display:"flex",alignItems:"center",gap:"8px"}});
  hdr.appendChild(el_("div",{text:"⚙ Settings — QWEN IMAGE 2.1 ONE STUDIO (TJ)",style:{color:"#fff",fontSize:"14px",fontWeight:"700",flex:"1"}}));
  const saveAllBtn = el_("button",{type:"button",text:"💾 Save All",style:{cursor:"pointer",background:BRAND,color:"#fff",border:"none",borderRadius:"6px",padding:"6px 12px",fontSize:"12px",fontWeight:"700"},onclick:()=>saveAll()});
  const closeBtn = el_("button",{type:"button",text:"✕ Close",style:{cursor:"pointer",background:C.bg2,color:C.text,border:`1px solid ${C.border}`,borderRadius:"6px",padding:"6px 12px",fontSize:"12px"},onclick:()=>{wrap.style.display="none";}});
  hdr.appendChild(saveAllBtn); hdr.appendChild(closeBtn);
  wrap.appendChild(hdr);

  // Searchable model/clip/vae pickers + Refresh button, same as 2511's own Settings —
  // user pointed out the plain <select> had no search and there was no way to rescan
  // the models folder without reopening the node.
  const modelWrap = el_("div"), clipWrap = el_("div"), vaeWrap = el_("div"), poseLoraWrap = el_("div");
  let modelSelC, clipSelC, vaeSelC, poseLoraSelC;
  function rebuildModels(d) {
    [modelWrap, clipWrap, vaeWrap, poseLoraWrap].forEach(w => { while (w.firstChild) w.removeChild(w.firstChild); });
    const allModels = ["none", ...(d.diffusion_models||[]), ...(d.gguf||[])];
    const te   = ["none", ...(d.text_encoders||[])];
    const vaes = ["none", ...(d.vaes||[])];
    const loras = ["none", ...(d.loras||[])];
    modelSelC = searchableSelect(allModels, state.model || "none", v=>{state.model=v;ctx.persist();});
    clipSelC  = searchableSelect(te,        state.textEncoder || "none", v=>{state.textEncoder=v;ctx.persist();});
    vaeSelC   = searchableSelect(vaes,      state.vae || "none", v=>{state.vae=v;ctx.persist();});
    poseLoraSelC = searchableSelect(loras,  state.poseLoraModel || "none", v=>{state.poseLoraModel=v;ctx.persist();});
    modelWrap.appendChild(col([label("DIFFUSION MODEL"), modelSelC.el]));
    clipWrap.appendChild(col([label("TEXT ENCODER (Qwen3-VL)"), clipSelC.el]));
    vaeWrap.appendChild(col([label("VAE"), vaeSelC.el]));
    poseLoraWrap.appendChild(col([label("POSE — VNCCS PoseStudio LoRA"), poseLoraSelC.el]));
  }
  rebuildModels({ diffusion_models: [], text_encoders: [], vaes: [], loras: [] });
  const refreshBtn = el_("button",{type:"button",text:"↻ Refresh Models",style:{cursor:"pointer",background:C.bg2,color:C.text,border:`1px solid ${C.border}`,borderRadius:"6px",padding:"6px 12px",fontSize:"12px",fontFamily:"inherit"},onclick:async()=>{
    refreshBtn.textContent="Loading…"; refreshBtn.disabled=true;
    try { const d = await getModels(); rebuildModels(d); ctx.availableLoras = d.loras || []; ctx._rerenderLoras?.(); }
    finally { refreshBtn.textContent="↻ Refresh Models"; refreshBtn.disabled=false; }
  }});
  const modelNote = el_("div",{style:{fontSize:"10px",color:C.muted,marginTop:"-4px"}});
  modelNote.innerHTML = "Model → <code>models/diffusion_models/</code> · Text Encoder → <code>models/text_encoders/</code> · VAE → <code>models/vae/</code>";
  wrap.appendChild(panel([
    el_("div",{style:{display:"flex",flexDirection:"column",gap:"8px"}},[
      row([modelWrap, clipWrap, vaeWrap]),
      modelNote,
      refreshBtn,
    ]),
  ]));

  // ── POSE mode — VNCCS PoseStudio LoRA + SAM3D model + editable/resettable system prompt ──
  const poseStrengthIn = numberField(state.poseLoraStrength ?? 1, v=>{state.poseLoraStrength=v;ctx.persist();}, 0.05);
  poseStrengthIn.style.width = "90px"; poseStrengthIn.style.flex = "0 0 auto";
  const poseSamIn = el_("input",{type:"text",placeholder:POSE_SAM3D_MODEL_DEFAULT,style:{width:"100%",boxSizing:"border-box",background:C.bg2,color:C.text,border:`1px solid ${C.border}`,borderRadius:"6px",padding:"6px",fontSize:"12px",fontFamily:"inherit"}});
  poseSamIn.value = state.poseSamModel || "";
  poseSamIn.addEventListener("input", ()=>{state.poseSamModel=poseSamIn.value || POSE_SAM3D_MODEL_DEFAULT;ctx.persist();});
  const poseSysTA = el_("textarea",{style:{width:"100%",boxSizing:"border-box",background:C.bg2,color:C.text,border:`1px solid ${C.border}`,borderRadius:"6px",padding:"7px",fontSize:"12px",fontFamily:"inherit",minHeight:"55px"}});
  poseSysTA.value = state.poseSystemPrompt || POSE_SYSTEM_PROMPT_DEFAULT;
  poseSysTA.addEventListener("input", ()=>{state.poseSystemPrompt=poseSysTA.value;ctx.persist();});
  const poseSysResetBtn = el_("button",{type:"button",text:"↺ Reset to default",style:{cursor:"pointer",background:C.bg2,color:C.text,border:`1px solid ${C.border}`,borderRadius:"6px",padding:"5px 10px",fontSize:"11px",fontFamily:"inherit",alignSelf:"flex-start"},onclick:()=>{state.poseSystemPrompt=POSE_SYSTEM_PROMPT_DEFAULT;poseSysTA.value=POSE_SYSTEM_PROMPT_DEFAULT;ctx.persist();}});
  wrap.appendChild(panel([
    el_("div",{style:{display:"flex",flexDirection:"column",gap:"8px"}},[
      label("POSE — Pose Copy Settings"),
      row([poseLoraWrap, col([label("Strength"), poseStrengthIn])]),
      col([label("SAM3D Body model file"), poseSamIn]),
      col([label("System Prompt (prepended to the PROMPT field, POSE mode only)"), poseSysTA, poseSysResetBtn]),
    ]),
  ]));

  const cacheBtn = el_("button",{type:"button",text:state.useCache!==false?"Cache: ON":"Cache: OFF",style:{cursor:"pointer",background:C.bg2,color:C.text,border:`1px solid ${C.border}`,borderRadius:"6px",padding:"8px",fontSize:"12px"},onclick:()=>{state.useCache=state.useCache===false;ctx.persist();cacheBtn.textContent=state.useCache!==false?"Cache: ON":"Cache: OFF";}});
  const sageBtn = el_("button",{type:"button",text:state.useSageAttention?"Sage Attention: ON":"Sage Attention: OFF",style:{cursor:"pointer",background:C.bg2,color:C.text,border:`1px solid ${C.border}`,borderRadius:"6px",padding:"8px",fontSize:"12px"},onclick:()=>{state.useSageAttention=!state.useSageAttention;ctx.persist();sageBtn.textContent=state.useSageAttention?"Sage Attention: ON":"Sage Attention: OFF";}});
  wrap.appendChild(panel([row([cacheBtn]), row([sageBtn])]));

  const negTA = el_("textarea",{placeholder:"Negative prompt…",style:{width:"100%",boxSizing:"border-box",background:C.bg2,color:C.text,border:`1px solid ${C.border}`,borderRadius:"6px",padding:"7px",fontSize:"12px",fontFamily:"inherit",minHeight:"60px"}});
  negTA.value = state.negativePrompt || "";
  negTA.addEventListener("input", ()=>{state.negativePrompt=negTA.value;ctx.persist();});
  wrap.appendChild(panel([col([label("NEGATIVE PROMPT"), negTA])]));

  const subfolderIn = el_("input",{type:"text",placeholder:SUBFOLDER,style:{width:"100%",boxSizing:"border-box",background:C.bg2,color:C.text,border:`1px solid ${C.border}`,borderRadius:"6px",padding:"6px",fontSize:"12px",fontFamily:"inherit"}});
  subfolderIn.value = state.saveSubfolder || "";
  subfolderIn.addEventListener("input", ()=>{state.saveSubfolder=subfolderIn.value;ctx.persist();});
  wrap.appendChild(panel([col([label("SAVE SUBFOLDER (optional)"), subfolderIn])]));

  const suffixIn = el_("input",{type:"text",placeholder:"e.g. high quality, sharp focus",style:{width:"100%",boxSizing:"border-box",background:C.bg2,color:C.text,border:`1px solid ${C.border}`,borderRadius:"6px",padding:"7px",fontSize:"12px",fontFamily:"inherit"}});
  suffixIn.value = state.promptSuffix || "";
  suffixIn.addEventListener("input", ()=>{state.promptSuffix=suffixIn.value;ctx.persist();});
  wrap.appendChild(panel([label("Prompt Suffix (auto-appended for quality boost)"), suffixIn]));

  // ── Reference image cap — user: 4K reference images times up to 10 refs were slow to
  // encode and heavy on VRAM, and the node's own `resolution` field only governs the
  // generated output, not how big a reference image is read at. 0 = off (send as uploaded).
  const refMpIn = numberField(state.refMaxMegapixels ?? 0, v=>{state.refMaxMegapixels=v;ctx.persist();updateRefMpHint();}, 0.1);
  refMpIn.style.width = "90px"; refMpIn.style.flex = "0 0 auto";
  const refMpHint = el_("span", { style: { fontSize: "11px", color: C.muted, whiteSpace: "nowrap", alignSelf: "center" } });
  function updateRefMpHint() {
    const mp = parseFloat(refMpIn.value) || 0;
    // ImageScaleToTotalPixels preserves the image's own aspect ratio, so there's no single
    // "actual pixel size" — the square-equivalent side (sqrt of the pixel budget) is the
    // usual reference point, same as reading "1.0 MP" as "roughly 1024x1024".
    refMpHint.textContent = mp > 0 ? `≈ ${Math.round(Math.sqrt(mp * 1e6))}×${Math.round(Math.sqrt(mp * 1e6))}px (1:1 기준, 비율 유지)` : "";
  }
  updateRefMpHint();
  wrap.appendChild(panel([label("Reference Image Max Megapixels (Ref to Image / Edit, 0 = off)"), row([refMpIn, refMpHint])]));

  // ── Language selector (i18n) ─────────────────────────────────────────────
  const langSel = el_("select", { style: {
    background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
    borderRadius: "6px", padding: "5px 8px", fontSize: "12px", fontFamily: "inherit", outline: "none",
  }, onchange: e => { setLang(e.target.value); window.location.reload(); }});
  ["ko", "en"].forEach(code => {
    const opt = el_("option", { value: code, text: code === "ko" ? "한국어" : "English" });
    if (getLang() === code) opt.selected = true;
    langSel.appendChild(opt);
  });
  wrap.appendChild(panel([label("Language"), langSel]));

  // ── LLM — Prompt Write / Prompt Enhance backend + model config (shared) ──
  const llmPanel = panel([]);
  wrap.appendChild(llmPanel);
  mountLLMSettingsSection(llmPanel, ctx);

  // ── Model Override toggle ────────────────────────────────────────────────
  const overrideChk = el_("input", { type: "checkbox" });
  overrideChk.checked = false;
  overrideChk.addEventListener("change", () => { ctx.syncOverrideSlots?.(overrideChk.checked); });
  const overrideLbl = el_("label", { style: { display:"flex", alignItems:"center", gap:"6px", fontSize:"12px", color:C.text } }, [
    overrideChk,
    el_("span", { text: "Enable Model Override (connects model / clip / vae from external nodes)" }),
  ]);
  wrap.appendChild(panel([label("Model Override"), overrideLbl]));

  function setModelLists(d) { rebuildModels(d); }

  function saveAll() {
    ctx.persist?.();
    saveConfig({
      save_subfolder:        state.saveSubfolder    || "",
      selected_model:        state.model            || "",
      selected_text_encoder: state.textEncoder      || "",
      selected_vae:          state.vae              || "",
      negative_prompt:       state.negativePrompt   || "",
      prompt_suffix:         state.promptSuffix     || "",
      ref_max_megapixels:    state.refMaxMegapixels ?? 0,
      pose_lora_model:       state.poseLoraModel    || "none",
      pose_lora_strength:    state.poseLoraStrength ?? 1,
      pose_sam_model:        state.poseSamModel     || POSE_SAM3D_MODEL_DEFAULT,
      pose_system_prompt:    state.poseSystemPrompt || POSE_SYSTEM_PROMPT_DEFAULT,
    });
    saveAllBtn.textContent = "✓ Saved!";
    setTimeout(() => { saveAllBtn.textContent = "💾 Save All"; }, 1500);
  }

  // Initial load — same as 2511: pull the last-saved config (server-side, survives a
  // fresh node/workflow) and only fill fields the user hasn't already set locally.
  getConfig().then(cfg => {
    if (cfg.negative_prompt && !state.negativePrompt) { state.negativePrompt = cfg.negative_prompt; negTA.value = cfg.negative_prompt; }
    if (cfg.prompt_suffix   && !state.promptSuffix)   { state.promptSuffix   = cfg.prompt_suffix;   suffixIn.value = cfg.prompt_suffix; }
    if (cfg.save_subfolder  && !state.saveSubfolder)  { state.saveSubfolder  = cfg.save_subfolder;  subfolderIn.value = cfg.save_subfolder; }
    if (cfg.ref_max_megapixels && !state.refMaxMegapixels) { state.refMaxMegapixels = cfg.ref_max_megapixels; refMpIn.value = cfg.ref_max_megapixels; updateRefMpHint(); }
    if (cfg.pose_lora_model && (!state.poseLoraModel || state.poseLoraModel === "none")) { state.poseLoraModel = cfg.pose_lora_model; }
    if (cfg.pose_lora_strength !== undefined && state.poseLoraStrength === 1) { state.poseLoraStrength = cfg.pose_lora_strength; poseStrengthIn.value = cfg.pose_lora_strength; }
    if (cfg.pose_sam_model && !state.poseSamModel) { state.poseSamModel = cfg.pose_sam_model; poseSamIn.value = cfg.pose_sam_model; }
    if (cfg.pose_system_prompt && state.poseSystemPrompt === POSE_SYSTEM_PROMPT_DEFAULT) { state.poseSystemPrompt = cfg.pose_system_prompt; poseSysTA.value = cfg.pose_system_prompt; }
    return getModels().then(d => {
      rebuildModels(d);
      ctx.availableLoras = d.loras || [];
      ctx._rerenderLoras?.();
      if (!state.model || state.model === "none") { const sm = cfg.selected_model || ""; if (sm) { state.model = sm; } }
      if (!state.textEncoder || state.textEncoder === "none") { const st = cfg.selected_text_encoder || ""; if (st) { state.textEncoder = st; } }
      if (!state.vae || state.vae === "none") { const sv = cfg.selected_vae || ""; if (sv) { state.vae = sv; } }
      rebuildModels(d);
      ctx.persist?.();
    });
  }).catch(() => {});

  return { el: wrap, show: () => wrap.style.display = "flex", hide: () => wrap.style.display = "none", setModelLists };
}


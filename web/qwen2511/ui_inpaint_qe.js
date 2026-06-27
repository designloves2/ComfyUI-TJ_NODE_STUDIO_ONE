// ui_inpaint_qe.js — Inpaint left panel for Qwen Image Edit 2511 ONE (TJ)
import { C, el, LEFT_W } from "./core_qwen2511.js";
import { panel, label, button, slider, numberField, select, row, col } from "./ui_common_qe.js";
import { buildInpaintGraph, buildOutpaintGraph } from "./graph_builder_qwen2511.js";
import { mountLoraSectionQE } from "./ui_common_qe.js";
import { uploadImage } from "./api_qwen2511.js";

const DISP_W = LEFT_W - 24;

function createDrawingEngine(maskRef, dispCanvas, opts = {}) {
  let zoom = 1, panX = 0, panY = 0, brushSize = opts.brushSize ?? 20;
  let tool = "brush", isDrawing = false, isPanning = false, lastPos = null, panStart = null, rafPending = false;
  let onZoomChange = null;
  function clampPan() { const { origW, origH } = maskRef; if (!origW) return; const vpW = origW/zoom, vpH = origH/zoom; panX = Math.max(0, Math.min(origW-vpW, panX)); panY = Math.max(0, Math.min(origH-vpH, panY)); }
  function schedRender() { if (rafPending) return; rafPending = true; requestAnimationFrame(() => { rafPending = false; render(); }); }
  function render() {
    const { canvas: maskCanvas, srcImg, origW, origH } = maskRef;
    if (!srcImg || !maskCanvas) return;
    const dctx = dispCanvas.getContext("2d"), dw = dispCanvas.width, dh = dispCanvas.height;
    const vpW = origW/zoom, vpH = origH/zoom;
    dctx.clearRect(0, 0, dw, dh);
    dctx.drawImage(srcImg, panX, panY, vpW, vpH, 0, 0, dw, dh);
    const tmp = document.createElement("canvas"); tmp.width = dw; tmp.height = dh;
    const tctx = tmp.getContext("2d");
    tctx.drawImage(maskCanvas, panX, panY, vpW, vpH, 0, 0, dw, dh);
    tctx.globalCompositeOperation = "source-in"; tctx.fillStyle = "rgba(118,18,218,0.55)"; tctx.fillRect(0, 0, dw, dh);
    dctx.drawImage(tmp, 0, 0);
    if (zoom > 1) { dctx.save(); dctx.font = "bold 13px monospace"; dctx.fillStyle = "rgba(0,0,0,0.6)"; dctx.fillRect(4,4,42,20); dctx.fillStyle="#fff"; dctx.fillText(`${zoom}×`,8,18); dctx.restore(); }
  }
  function toOrig(e) { const { origW, origH } = maskRef; const r = dispCanvas.getBoundingClientRect(); return { x: panX+((e.clientX-r.left)/r.width)*(origW/zoom), y: panY+((e.clientY-r.top)/r.height)*(origH/zoom) }; }
  function dot(pos) { const mctx = maskRef.canvas.getContext("2d"); if (tool==="eraser") { mctx.globalCompositeOperation="destination-out"; mctx.fillStyle="rgba(0,0,0,1)"; } else { mctx.globalCompositeOperation="source-over"; mctx.fillStyle="white"; } mctx.beginPath(); mctx.arc(pos.x,pos.y,brushSize,0,Math.PI*2); mctx.fill(); mctx.globalCompositeOperation="source-over"; schedRender(); }
  function stroke(from, to) { const mctx = maskRef.canvas.getContext("2d"); mctx.lineCap="round"; mctx.lineJoin="round"; mctx.lineWidth=brushSize*2; if (tool==="eraser") { mctx.globalCompositeOperation="destination-out"; mctx.strokeStyle=mctx.fillStyle="rgba(0,0,0,1)"; } else { mctx.globalCompositeOperation="source-over"; mctx.strokeStyle=mctx.fillStyle="white"; } mctx.beginPath(); mctx.moveTo(from.x,from.y); mctx.lineTo(to.x,to.y); mctx.stroke(); mctx.beginPath(); mctx.arc(to.x,to.y,brushSize,0,Math.PI*2); mctx.fill(); mctx.globalCompositeOperation="source-over"; schedRender(); }
  function zoomAt(factor, rx, ry) { const { origW, origH } = maskRef; const nz = Math.max(1, Math.min(32, zoom*factor)); if (nz===zoom) return; const ox=panX+rx*(origW/zoom), oy=panY+ry*(origH/zoom); zoom=nz; panX=ox-rx*(origW/zoom); panY=oy-ry*(origH/zoom); clampPan(); onZoomChange?.(); schedRender(); }
  dispCanvas.addEventListener("wheel", e => { e.preventDefault(); const r=dispCanvas.getBoundingClientRect(); zoomAt(e.deltaY<0?2:0.5,(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height); }, { passive: false });
  dispCanvas.addEventListener("pointerdown", e => { e.preventDefault(); dispCanvas.setPointerCapture(e.pointerId); if (e.button===1||e.button===2) { if (zoom>1) { isPanning=true; panStart={clientX:e.clientX,clientY:e.clientY,panX,panY}; dispCanvas.style.cursor="grabbing"; } return; } if (e.button!==0) return; isDrawing=true; lastPos=toOrig(e); dot(lastPos); });
  dispCanvas.addEventListener("pointermove", e => { e.preventDefault(); if (isPanning&&panStart) { const r=dispCanvas.getBoundingClientRect(),{origW,origH}=maskRef; panX=panStart.panX-(e.clientX-panStart.clientX)/r.width*(origW/zoom); panY=panStart.panY-(e.clientY-panStart.clientY)/r.height*(origH/zoom); clampPan(); schedRender(); return; } if (!isDrawing) return; const pos=toOrig(e); if (lastPos) stroke(lastPos,pos); lastPos=pos; });
  const end = () => { isDrawing=false; isPanning=false; lastPos=null; panStart=null; dispCanvas.style.cursor="crosshair"; };
  dispCanvas.addEventListener("pointerup", end); dispCanvas.addEventListener("pointercancel", end);
  dispCanvas.addEventListener("contextmenu", e => e.preventDefault());
  return {
    schedRender, resetView: () => { zoom=1; panX=0; panY=0; onZoomChange?.(); schedRender(); },
    setZoomChangeCallback: cb => { onZoomChange = cb; }, getZoom: () => zoom,
    setTool: t => { tool = t; }, getTool: () => tool,
    setBrushSize: s => { brushSize = s; }, getBrushSize: () => brushSize,
    zoomIn: () => zoomAt(2, 0.5, 0.5), zoomOut: () => zoomAt(0.5, 0.5, 0.5),
    clearMask: () => { if (maskRef.canvas) { maskRef.canvas.getContext("2d").clearRect(0,0,maskRef.origW,maskRef.origH); schedRender(); } },
  };
}

function mkBtn(text, onClick, ac) {
  const b = el("button", { type: "button", text, style: { cursor:"pointer", fontFamily:"inherit", fontSize:"11px", padding:"4px 8px", borderRadius:"6px", border:`1px solid ${C.border}`, background: ac || C.bg2, color:"#fff" }, onclick: onClick });
  return b;
}

async function saveMaskToServer(maskRef) {
  const out = document.createElement("canvas"); out.width = maskRef.origW; out.height = maskRef.origH;
  const octx = out.getContext("2d"); octx.fillStyle = "black"; octx.fillRect(0,0,maskRef.origW,maskRef.origH); octx.drawImage(maskRef.canvas,0,0);
  const blob = await new Promise(r => out.toBlob(r, "image/png"));
  const fd = new FormData(); fd.append("image", blob, `qe_mask_${Date.now()}.png`); fd.append("type", "input");
  const resp = await fetch("/upload/image", { method:"POST", body:fd }); const d = await resp.json(); return d.name;
}

export function mountInpaintLeft(leftEl, state, ctx) {
  const wrap = el("div", { style: { display:"flex", flexDirection:"column", gap:"6px" }});
  leftEl.appendChild(wrap);

  // ── Sub-mode: inpaint | outpaint ──────────────────────────────────────────
  if (!state.paintSubMode) state.paintSubMode = "inpaint";
  const inpaintSection  = el("div", { style:{ display:"flex", flexDirection:"column", gap:"6px" }});
  const outpaintSection = el("div", { style:{ display:"flex", flexDirection:"column", gap:"6px" }});

  function applySubModeBtn(b, active) {
    b.style.background = active ? BRAND : C.bg2;
    b.style.color      = "#fff";
    b.style.border     = `1px solid ${active ? BRAND : C.border}`;
    b.style.fontWeight = active ? "700" : "400";
  }
  const inpaintBtn  = el("button", { type:"button", text:"Inpaint",  style:{ cursor:"pointer", fontFamily:"inherit", fontSize:"12px", borderRadius:"20px", padding:"5px 12px", flex:"1" }});
  const outpaintBtn = el("button", { type:"button", text:"Outpaint", style:{ cursor:"pointer", fontFamily:"inherit", fontSize:"12px", borderRadius:"20px", padding:"5px 12px", flex:"1" }});
  function switchSubMode(m) {
    state.paintSubMode = m; ctx.persist?.();
    inpaintSection.style.display  = m === "inpaint"  ? "" : "none";
    outpaintSection.style.display = m === "outpaint" ? "" : "none";
    applySubModeBtn(inpaintBtn,  m === "inpaint");
    applySubModeBtn(outpaintBtn, m === "outpaint");
  }
  inpaintBtn.onclick  = () => switchSubMode("inpaint");
  outpaintBtn.onclick = () => switchSubMode("outpaint");
  const subModeRow = el("div", { style:{ display:"flex", gap:"6px", padding:"8px", background:C.bg1, borderRadius:"8px", border:`1px solid ${C.border}` }});
  subModeRow.appendChild(inpaintBtn); subModeRow.appendChild(outpaintBtn);
  wrap.appendChild(subModeRow);

  // ── Drawing engine (inpaint only) ─────────────────────────────────────────
  const BRAND = "#7612DA";
  const maskRef = { canvas: null, srcImg: null, origW: 0, origH: 0 };
  const dispCanvas = el("canvas", { style: { display:"block", width:"100%", cursor:"crosshair", touchAction:"none" }});
  const canvasWrap = el("div", { style: { display:"none", width:`${DISP_W}px`, background:"#111", borderRadius:"6px", border:`1px solid ${C.border}`, overflow:"hidden" }});
  canvasWrap.appendChild(dispCanvas);
  const engine = createDrawingEngine(maskRef, dispCanvas, { brushSize: 20 });

  let brushBtn, eraserBtn;
  function syncTools() {
    brushBtn.style.background  = engine.getTool()==="brush"  ? C.brand : C.bg2;
    eraserBtn.style.background = engine.getTool()==="eraser" ? C.brand : C.bg2;
  }
  brushBtn  = mkBtn("✏ Brush",  () => { engine.setTool("brush");  syncTools(); });
  eraserBtn = mkBtn("◻ Eraser", () => { engine.setTool("eraser"); syncTools(); });
  brushBtn.style.background = C.brand;
  const clearMaskBtn = mkBtn("✕ Clear", () => { engine.clearMask(); state.inpaintMaskImage=null; ctx.persist(); });

  const sizeValEl = el("span", { text:`${engine.getBrushSize()}px`, style:{ color:C.text, fontSize:"11px", minWidth:"28px", display:"inline-block", textAlign:"right" }});
  const sizeRange = el("input", { type:"range", min:"2", max:"200", step:"1" });
  sizeRange.value = engine.getBrushSize();
  sizeRange.style.cssText = `flex:1;accent-color:${C.brand};min-width:60px;`;
  sizeRange.addEventListener("input", () => { engine.setBrushSize(parseInt(sizeRange.value)); sizeValEl.textContent=`${engine.getBrushSize()}px`; });

  const zoomLbl = el("span", { text:"1×", style:{ color:C.text, fontSize:"12px", fontWeight:"700", minWidth:"28px", textAlign:"center", fontFamily:"monospace" }});
  engine.setZoomChangeCallback(() => { zoomLbl.textContent=`${engine.getZoom()}×`; });

  const toolRow = el("div", { style:{ display:"flex", alignItems:"center", gap:"4px", flexWrap:"wrap", marginBottom:"4px" }});
  const sizeRow = el("div", { style:{ display:"flex", alignItems:"center", gap:"4px", flex:"1" }});
  sizeRow.appendChild(el("span", { text:"Size:", style:{ color:C.muted, fontSize:"11px" }}));
  sizeRow.appendChild(sizeRange); sizeRow.appendChild(sizeValEl);
  toolRow.appendChild(brushBtn); toolRow.appendChild(eraserBtn); toolRow.appendChild(clearMaskBtn); toolRow.appendChild(sizeRow);

  const zoomRow = el("div", { style:{ display:"flex", alignItems:"center", gap:"4px", marginBottom:"4px" }});
  zoomRow.appendChild(el("span", { text:"Zoom:", style:{ color:C.muted, fontSize:"11px" }}));
  zoomRow.appendChild(mkBtn("－", () => engine.zoomOut()));
  zoomRow.appendChild(zoomLbl);
  zoomRow.appendChild(mkBtn("＋", () => engine.zoomIn()));
  zoomRow.appendChild(mkBtn("⊡ Fit", () => engine.resetView()));

  const saveMaskBtn = button("💾 Save Mask", async () => {
    if (!maskRef.canvas || !maskRef.origW) return;
    saveMaskBtn.disabled=true; saveMaskBtn.textContent="Saving…";
    try { const n = await saveMaskToServer(maskRef); state.inpaintMaskImage=n; ctx.persist(); ctx.showPopup?.("Mask saved.", false); }
    catch(e) { ctx.showPopup?.("Mask save failed: "+(e.message||e)); }
    finally { saveMaskBtn.disabled=false; saveMaskBtn.textContent="💾 Save Mask"; }
  }, "primary");

  const editorPanel = panel([
    label("Mask Editor (blue=regenerate)"),
    canvasWrap,
    el("div", { style:{ height:"6px" }}),
    toolRow, zoomRow,
    el("div", { style:{ display:"flex", gap:"6px" }}, [saveMaskBtn]),
  ]);
  editorPanel.style.display = "none";

  function loadSourceImage(filename) {
    if (!filename) { editorPanel.style.display="none"; return; }
    const img = new Image();
    img.onload = () => {
      maskRef.srcImg=img; maskRef.origW=img.naturalWidth; maskRef.origH=img.naturalHeight;
      const dh = Math.round(maskRef.origH*DISP_W/maskRef.origW);
      dispCanvas.width=DISP_W; dispCanvas.height=dh; canvasWrap.style.display="block";
      maskRef.canvas = document.createElement("canvas"); maskRef.canvas.width=maskRef.origW; maskRef.canvas.height=maskRef.origH;
      engine.resetView();
      if (state.inpaintMaskImage) {
        const mImg = new Image();
        mImg.onload = () => {
          const tmp=document.createElement("canvas"); tmp.width=maskRef.origW; tmp.height=maskRef.origH;
          const tctx=tmp.getContext("2d"); tctx.drawImage(mImg,0,0,maskRef.origW,maskRef.origH);
          const imgData=tctx.getImageData(0,0,maskRef.origW,maskRef.origH);
          for (let i=0;i<imgData.data.length;i+=4) imgData.data[3]=imgData.data[i];
          tctx.putImageData(imgData,0,0);
          maskRef.canvas.getContext("2d").drawImage(tmp,0,0);
          engine.schedRender();
        };
        mImg.onerror=()=>engine.schedRender();
        mImg.src=`/view?filename=${encodeURIComponent(state.inpaintMaskImage)}&type=input&t=${Date.now()}`;
      } else { engine.schedRender(); }
      editorPanel.style.display="block";
    };
    img.onerror=()=>{};
    img.src=`/view?filename=${encodeURIComponent(filename)}&type=input&t=${Date.now()}`;
  }

  async function autoSaveMask() {
    if (!maskRef.canvas || !maskRef.origW) return false;
    const data = maskRef.canvas.getContext("2d").getImageData(0,0,maskRef.origW,maskRef.origH).data;
    let hasPixels=false; for (let i=3;i<data.length;i+=4) { if(data[i]>10){hasPixels=true;break;} }
    if (!hasPixels) return false;
    const n = await saveMaskToServer(maskRef); state.inpaintMaskImage=n; ctx.persist(); return true;
  }

  // Source image upload
  const srcBox = el("div", { style:{ width:"192px", height:"192px", background:"#000", borderRadius:"10px", border:`1px solid ${C.border}`, position:"relative", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden" }});
  const srcHint = el("div", { text:"Source Image\nClick to upload", style:{ color:C.muted, fontSize:"12px", textAlign:"center", whiteSpace:"pre", pointerEvents:"none" }});
  const srcImg2  = el("img", { style:{ position:"absolute", inset:"0", width:"100%", height:"100%", objectFit:"contain", pointerEvents:"none", display:"none" }});
  srcBox.appendChild(srcHint); srcBox.appendChild(srcImg2);
  const srcInp = el("input", { type:"file", accept:"image/*", style:{ display:"none" }});
  function setSourceFilename(name) {
    if (name) { srcImg2.src=`/view?filename=${encodeURIComponent(name)}&type=input&t=${Date.now()}`; srcImg2.style.display="block"; srcHint.style.display="none"; }
    else       { srcImg2.style.display="none"; srcHint.style.display=""; }
  }
  srcBox.appendChild(srcInp);
  srcInp.addEventListener("change", async () => { if (srcInp.files[0]) { const n=await uploadImage(srcInp.files[0]); state.inpaintImage=n; state.inpaintMaskImage=null; ctx.persist(); setSourceFilename(n); loadSourceImage(n); srcInp.value=""; }});
  srcBox.addEventListener("click", ()=>srcInp.click());
  srcBox.addEventListener("dragover", e=>{e.preventDefault();srcBox.style.borderColor=C.brand;});
  srcBox.addEventListener("dragleave", ()=>{srcBox.style.borderColor=C.border;});
  srcBox.addEventListener("drop", async e=>{ e.preventDefault(); srcBox.style.borderColor=C.border; const f=e.dataTransfer.files[0]; if(f){const n=await uploadImage(f);state.inpaintImage=n;state.inpaintMaskImage=null;ctx.persist();setSourceFilename(n);loadSourceImage(n);}});
  setSourceFilename(state.inpaintImage);

  // ── Source image (공용) ───────────────────────────────────────────────────
  wrap.appendChild(panel([label("Source Image"), el("div", { style:{ display:"flex", justifyContent:"center" }}, [srcBox])]));

  // ── Inpaint section ───────────────────────────────────────────────────────
  inpaintSection.appendChild(editorPanel);
  inpaintSection.appendChild(panel([
    label("Denoise"),
    slider(0.1, 1, 0.01, state.inpaintDenoise ?? 0.85, v => { state.inpaintDenoise=v; ctx.persist(); }, v => v.toFixed(2)),
  ]));
  wrap.appendChild(inpaintSection);

  // ── Outpaint section ──────────────────────────────────────────────────────
  function padField(lbl, key) {
    return col([label(lbl), numberField(state[key] ?? 0, v => { state[key]=Math.max(0,v); ctx.persist(); }, 64)]);
  }
  outpaintSection.appendChild(panel([
    label("Expansion (px)"),
    row([padField("Up",    "outpaintUp"),   padField("Down",  "outpaintDown")]),
    row([padField("Left",  "outpaintLeft"), padField("Right", "outpaintRight")]),
  ]));
  outpaintSection.appendChild(panel([
    label("Pad Color (R G B)"),
    row([
      col([label("R"), numberField(state.outpaintPadR ?? 0, v => { state.outpaintPadR = Math.max(0, Math.min(255, Math.round(v))); ctx.persist?.(); }, 1)]),
      col([label("G"), numberField(state.outpaintPadG ?? 0, v => { state.outpaintPadG = Math.max(0, Math.min(255, Math.round(v))); ctx.persist?.(); }, 1)]),
      col([label("B"), numberField(state.outpaintPadB ?? 0, v => { state.outpaintPadB = Math.max(0, Math.min(255, Math.round(v))); ctx.persist?.(); }, 1)]),
    ]),
  ]));
  wrap.appendChild(outpaintSection);

  // ── Shared: sampling + LoRA ───────────────────────────────────────────────
  wrap.appendChild(panel([
    row([
      col([label("Steps"), numberField(state.steps??20, v=>{state.steps=v;ctx.persist();}, 1)]),
      col([label("CFG"),   numberField(state.cfg??4,    v=>{state.cfg=v;ctx.persist();},   0.1)]),
    ]),
    row([
      col([label("Sampler"),   select(["euler","euler_ancestral","er_sde","heun","dpm_pp_2m"], state.sampler||"euler",   v=>{state.sampler=v;ctx.persist();})]),
      col([label("Scheduler"), select(["simple","normal","karras","exponential","sgm_uniform","beta"], state.scheduler||"simple", v=>{state.scheduler=v;ctx.persist();})]),
    ]),
  ]));
  mountLoraSectionQE(wrap, state, ctx);

  if (state.inpaintImage) loadSourceImage(state.inpaintImage);
  switchSubMode(state.paintSubMode || "inpaint");

  // 아웃페인트 비교용: 패딩 이미지를 canvas로 생성하여 data URL 반환
  async function buildPaddedDataURL() {
    if (!state.inpaintImage) return null;
    const img = new Image();
    img.src = `/view?filename=${encodeURIComponent(state.inpaintImage)}&type=input&t=${Date.now()}`;
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
    const L = state.outpaintLeft || 0, R = state.outpaintRight || 0;
    const U = state.outpaintUp   || 0, D = state.outpaintDown  || 0;
    const canvas = document.createElement("canvas");
    canvas.width  = img.naturalWidth  + L + R;
    canvas.height = img.naturalHeight + U + D;
    const ctx2d = canvas.getContext("2d");
    ctx2d.fillStyle = `rgb(${state.outpaintPadR??0},${state.outpaintPadG??0},${state.outpaintPadB??0})`;
    ctx2d.fillRect(0, 0, canvas.width, canvas.height);
    ctx2d.drawImage(img, L, U);
    return canvas.toDataURL("image/png");
  }

  return {
    beforeGenerate: async () => {
      if (!state.inpaintImage) throw new Error("Upload a source image first.");
      if (state.paintSubMode === "inpaint") {
        if (!state.inpaintMaskImage) {
          const saved = await autoSaveMask().catch(()=>false);
          if (!saved) throw new Error("Draw a mask area (auto-save failed).");
        }
      } else {
        const total = (state.outpaintUp||0)+(state.outpaintDown||0)+(state.outpaintLeft||0)+(state.outpaintRight||0);
        if (total <= 0) throw new Error("Set at least one expansion value (Up/Down/Left/Right).");
        // 비교 뷰용 패딩 이미지 사전 생성
        state._outpaintPaddedDataURL = await buildPaddedDataURL().catch(()=>null);
      }
    },
    async getGraph() {
      return state.paintSubMode === "outpaint"
        ? buildOutpaintGraph(state)
        : buildInpaintGraph(state);
    },
    getSourceURL() {
      if (state.paintSubMode === "outpaint") return state._outpaintPaddedDataURL || null;
      return state.inpaintImage ? `/view?filename=${encodeURIComponent(state.inpaintImage)}&type=input` : null;
    },
    setImage(name) { state.inpaintImage=name; setSourceFilename(name); loadSourceImage(name); ctx.persist(); },
  };
}

// ui_inpaint_sdxl.js — Inpaint left panel for SDXL ONE (TJ)
import { C, el, LEFT_W, createInputImageSlot } from "./core_sdxl.js";
import { panel, label, select, numberField, slider, row, col, button } from "../klein/ui_common.js";
import { uploadImage } from "./api_sdxl.js";
import { buildInpaintGraph } from "./graph_builder_sdxl.js";
import { mountLoraSection } from "./ui_lora_sdxl.js";
import { t } from "../shared/i18n.js";

const SAMPLERS   = ["euler","euler_ancestral","dpm_2","dpm_2_ancestral","dpm_pp_2m","dpm_pp_2m_sde","dpm_pp_sde","heun","lms","dpm_fast","ddim","uni_pc"];
const SCHEDULERS = ["normal","karras","exponential","sgm_uniform","simple","beta"];
const DISP_W = LEFT_W - 24;

// ════════════════════════════════════════════════════════════════════════════
// 공용 캔버스 드로잉 엔진
// ════════════════════════════════════════════════════════════════════════════
function createDrawingEngine(maskRef, dispCanvas, opts = {}) {
  let zoom   = 1, panX = 0, panY = 0;
  let brushSize  = opts.brushSize  ?? 20;
  let tool       = opts.tool       ?? "brush";
  let isDrawing  = false;
  let isPanning  = false;
  let lastPos    = null, panStart = null;
  let rafPending = false;

  function clampPan() {
    const { origW, origH } = maskRef;
    if (!origW) return;
    const vpW = origW / zoom, vpH = origH / zoom;
    panX = Math.max(0, Math.min(origW - vpW, panX));
    panY = Math.max(0, Math.min(origH - vpH, panY));
  }

  function resetView() { zoom = 1; panX = 0; panY = 0; onZoomChange?.(); schedRender(); }

  function zoomAt(factor, rx, ry) {
    const { origW, origH } = maskRef;
    const nz = Math.max(1, Math.min(32, zoom * factor));
    if (nz === zoom) return;
    const ox = panX + rx * (origW / zoom);
    const oy = panY + ry * (origH / zoom);
    zoom = nz;
    panX = ox - rx * (origW / zoom);
    panY = oy - ry * (origH / zoom);
    clampPan();
    onZoomChange?.();
    schedRender();
  }

  let onZoomChange = null;
  function setZoomChangeCallback(cb) { onZoomChange = cb; }
  function getZoom() { return zoom; }

  function schedRender() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => { rafPending = false; render(); });
  }

  function render() {
    const { canvas: maskCanvas, srcImg, origW, origH } = maskRef;
    if (!srcImg || !maskCanvas) return;
    const dctx = dispCanvas.getContext("2d");
    const dw = dispCanvas.width, dh = dispCanvas.height;
    const vpW = origW / zoom, vpH = origH / zoom;

    dctx.clearRect(0, 0, dw, dh);
    dctx.drawImage(srcImg, panX, panY, vpW, vpH, 0, 0, dw, dh);

    const tmp = document.createElement("canvas");
    tmp.width = dw; tmp.height = dh;
    const tctx = tmp.getContext("2d");
    tctx.drawImage(maskCanvas, panX, panY, vpW, vpH, 0, 0, dw, dh);
    tctx.globalCompositeOperation = "source-in";
    tctx.fillStyle = "rgba(118,18,218,0.55)";
    tctx.fillRect(0, 0, dw, dh);
    dctx.drawImage(tmp, 0, 0);

    if (zoom > 1) {
      dctx.save();
      dctx.font = "bold 13px monospace";
      dctx.fillStyle = "rgba(0,0,0,0.6)";
      dctx.fillRect(4, 4, 42, 20);
      dctx.fillStyle = "#fff";
      dctx.fillText(`${zoom}×`, 8, 18);
      dctx.restore();
    }
  }

  function toOrig(e) {
    const { origW, origH } = maskRef;
    const r  = dispCanvas.getBoundingClientRect();
    return {
      x: panX + ((e.clientX - r.left) / r.width)  * (origW / zoom),
      y: panY + ((e.clientY - r.top)  / r.height) * (origH / zoom),
    };
  }

  function dot(pos) {
    const mctx = maskRef.canvas.getContext("2d");
    if (tool === "eraser") {
      mctx.globalCompositeOperation = "destination-out";
      mctx.fillStyle = "rgba(0,0,0,1)";
    } else {
      mctx.globalCompositeOperation = "source-over";
      mctx.fillStyle = "white";
    }
    mctx.beginPath();
    mctx.arc(pos.x, pos.y, brushSize, 0, Math.PI * 2);
    mctx.fill();
    mctx.globalCompositeOperation = "source-over";
    schedRender();
  }

  function stroke(from, to) {
    const mctx = maskRef.canvas.getContext("2d");
    mctx.lineCap = "round"; mctx.lineJoin = "round";
    mctx.lineWidth = brushSize * 2;
    if (tool === "eraser") {
      mctx.globalCompositeOperation = "destination-out";
      mctx.strokeStyle = mctx.fillStyle = "rgba(0,0,0,1)";
    } else {
      mctx.globalCompositeOperation = "source-over";
      mctx.strokeStyle = mctx.fillStyle = "white";
    }
    mctx.beginPath(); mctx.moveTo(from.x, from.y); mctx.lineTo(to.x, to.y); mctx.stroke();
    mctx.beginPath(); mctx.arc(to.x, to.y, brushSize, 0, Math.PI * 2); mctx.fill();
    mctx.globalCompositeOperation = "source-over";
    schedRender();
  }

  function attachEvents() {
    dispCanvas.addEventListener("wheel", e => {
      e.preventDefault();
      const r = dispCanvas.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 2 : 0.5,
        (e.clientX - r.left) / r.width,
        (e.clientY - r.top)  / r.height);
    }, { passive: false });

    dispCanvas.addEventListener("pointerdown", e => {
      e.preventDefault();
      dispCanvas.setPointerCapture(e.pointerId);
      if (e.button === 1 || e.button === 2) {
        if (zoom > 1) {
          isPanning = true;
          panStart = { clientX: e.clientX, clientY: e.clientY, panX, panY };
          dispCanvas.style.cursor = "grabbing";
        }
        return;
      }
      if (e.button !== 0) return;
      isDrawing = true;
      lastPos = toOrig(e);
      dot(lastPos);
    });

    dispCanvas.addEventListener("pointermove", e => {
      e.preventDefault();
      if (isPanning && panStart) {
        const r = dispCanvas.getBoundingClientRect();
        const { origW, origH } = maskRef;
        panX = panStart.panX - (e.clientX - panStart.clientX) / r.width  * (origW / zoom);
        panY = panStart.panY - (e.clientY - panStart.clientY) / r.height * (origH / zoom);
        clampPan(); schedRender(); return;
      }
      if (!isDrawing) return;
      const pos = toOrig(e);
      if (lastPos) stroke(lastPos, pos);
      lastPos = pos;
    });

    const end = () => {
      isDrawing = false; isPanning = false; lastPos = null; panStart = null;
      dispCanvas.style.cursor = "crosshair";
    };
    dispCanvas.addEventListener("pointerup",     end);
    dispCanvas.addEventListener("pointercancel", end);
    dispCanvas.addEventListener("contextmenu",   e => e.preventDefault());
  }

  attachEvents();

  return {
    schedRender, resetView, getZoom,
    setZoomChangeCallback,
    setTool: v => { tool = v; },
    getTool: () => tool,
    setBrushSize: s => { brushSize = s; },
    getBrushSize: () => brushSize,
    zoomIn:  () => zoomAt(2, 0.5, 0.5),
    zoomOut: () => zoomAt(0.5, 0.5, 0.5),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 공용 툴바 생성
// ════════════════════════════════════════════════════════════════════════════
function createEditorToolbar(engine, accentColor) {
  const ac = accentColor ?? C.lime;
  function mkBtn(text, onClick) {
    return el("button", {
      text, type:"button",
      style:{
        cursor:"pointer", fontFamily:"inherit", fontSize:"11px",
        padding:"4px 8px", borderRadius:"6px",
        border:`1px solid ${C.border}`, background:C.bg2, color:"#fff",
      },
      onclick: onClick,
    });
  }

  let brushBtn, eraserBtn;
  function syncToolBtns() {
    brushBtn.style.background  = engine.getTool() === "brush"  ? ac : C.bg2;
    eraserBtn.style.background = engine.getTool() === "eraser" ? ac : C.bg2;
  }
  brushBtn  = mkBtn("✏ Brush",  () => { engine.setTool("brush");  syncToolBtns(); });
  eraserBtn = mkBtn("◻ Eraser", () => { engine.setTool("eraser"); syncToolBtns(); });
  brushBtn.style.background = ac;

  const clearBtn = mkBtn("✕ Clear", () => {});

  const sizeValEl = el("span", { text:`${engine.getBrushSize()}px`, style:{ color:C.text, fontSize:"11px", minWidth:"28px", display:"inline-block", textAlign:"right" } });
  const sizeRange = el("input", { type:"range", min:"2", max:"200", step:"1" });
  sizeRange.value = engine.getBrushSize();
  sizeRange.style.cssText = `flex:1;accent-color:${ac};min-width:60px;`;
  sizeRange.addEventListener("input", () => {
    engine.setBrushSize(parseInt(sizeRange.value));
    sizeValEl.textContent = `${engine.getBrushSize()}px`;
  });

  const zoomLbl = el("span", { text:"1×", style:{ color:C.text, fontSize:"12px", fontWeight:"700", minWidth:"28px", textAlign:"center", fontFamily:"monospace" } });
  engine.setZoomChangeCallback(() => { zoomLbl.textContent = `${engine.getZoom()}×`; });

  const zoomInBtn  = mkBtn("＋", () => engine.zoomIn());
  const zoomOutBtn = mkBtn("－", () => engine.zoomOut());
  const fitBtn     = mkBtn("⊡ Fit", () => engine.resetView());

  const toolRow = el("div", { style:{ display:"flex", alignItems:"center", gap:"4px", flexWrap:"wrap", marginBottom:"4px" } });
  const sizeRow = el("div", { style:{ display:"flex", alignItems:"center", gap:"4px", flex:"1" } });
  sizeRow.appendChild(el("span", { text:"Size:", style:{ color:C.muted, fontSize:"11px" } }));
  sizeRow.appendChild(sizeRange);
  sizeRow.appendChild(sizeValEl);
  toolRow.appendChild(brushBtn); toolRow.appendChild(eraserBtn);
  toolRow.appendChild(clearBtn); toolRow.appendChild(sizeRow);

  const zoomRow = el("div", { style:{ display:"flex", alignItems:"center", gap:"4px", marginBottom:"4px" } });
  zoomRow.appendChild(el("span", { text:"Zoom:", style:{ color:C.muted, fontSize:"11px" } }));
  zoomRow.appendChild(zoomOutBtn);
  zoomRow.appendChild(zoomLbl);
  zoomRow.appendChild(zoomInBtn);
  zoomRow.appendChild(fitBtn);

  const hint = el("div", {
    text: t("inpaint_hint"),
    style:{ color:C.muted, fontSize:"9px", marginBottom:"4px" },
  });

  return { toolRow, zoomRow, hint, clearBtn };
}

// ════════════════════════════════════════════════════════════════════════════
// 팝업 에디터
// ════════════════════════════════════════════════════════════════════════════
function openPopupEditor(maskRef, state, ctx, onApply, showPopup) {
  const { origW, origH } = maskRef;
  const maxW = Math.round(window.innerWidth  * 0.85);
  const maxH = Math.round(window.innerHeight * 0.78);
  const scale = Math.min(maxW / origW, maxH / origH, 1);
  const popW  = Math.round(origW * scale);
  const popH  = Math.round(origH * scale);

  const overlay = el("div", {
    style:{
      position:"fixed", inset:"0", zIndex:"99999",
      background:"rgba(8,8,8,0.92)",
      display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center", gap:"10px",
    },
  });

  const popCanvas = el("canvas", {
    style:{
      display:"block", cursor:"crosshair", touchAction:"none",
      borderRadius:"6px", border:`1px solid ${C.border}`,
      boxShadow:"0 0 40px rgba(0,0,0,0.8)",
    },
  });
  popCanvas.width  = popW;
  popCanvas.height = popH;
  popCanvas.style.width  = `${popW}px`;
  popCanvas.style.height = `${popH}px`;

  const engine = createDrawingEngine(maskRef, popCanvas, { brushSize:30 });
  engine.schedRender();

  const { toolRow, zoomRow, hint, clearBtn } = createEditorToolbar(engine, "#7c3aed");

  clearBtn.onclick = () => {
    const mctx = maskRef.canvas.getContext("2d");
    mctx.clearRect(0, 0, maskRef.origW, maskRef.origH);
    engine.schedRender();
    state.inpaintMaskImage = null;
    ctx.persist();
  };

  const applyBtn = button(t("inpaint_apply"), async () => {
    applyBtn.disabled = true; applyBtn.textContent = t("inpaint_saving");
    try {
      const out = document.createElement("canvas");
      out.width = origW; out.height = origH;
      const octx = out.getContext("2d");
      octx.fillStyle = "black";
      octx.fillRect(0, 0, origW, origH);
      octx.drawImage(maskRef.canvas, 0, 0);
      const blob = await new Promise(r => out.toBlob(r, "image/png"));
      const fd = new FormData();
      fd.append("image", blob, `sdxl_mask_${Date.now()}.png`);
      fd.append("type", "input");
      const resp = await fetch("/upload/image", { method:"POST", body:fd });
      const data = await resp.json();
      state.inpaintMaskImage = data.name;
      ctx.persist();
      showPopup?.(t("inpaint_saved"), false);
      onApply?.();
      document.body.removeChild(overlay);
    } catch (e) {
      showPopup?.(t("inpaint_save_err") + (e.message || e));
      applyBtn.disabled = false; applyBtn.textContent = "✓ 적용 & 닫기";
    }
  }, "primary");

  const closeBtn2 = button("✕ 닫기 (저장 안 함)", () => {
    onApply?.();
    document.body.removeChild(overlay);
  });

  const btnRow = el("div", { style:{ display:"flex", gap:"10px", alignItems:"center" } });
  btnRow.appendChild(applyBtn);
  btnRow.appendChild(closeBtn2);

  const ctrlPanel = el("div", {
    style:{
      background:C.bg1, border:`1px solid ${C.border}`, borderRadius:"8px",
      padding:"10px 14px", width:`${popW}px`, boxSizing:"border-box",
    },
  });
  ctrlPanel.appendChild(toolRow);
  ctrlPanel.appendChild(zoomRow);
  ctrlPanel.appendChild(hint);

  const titleRow = el("div", { style:{ display:"flex", alignItems:"center", gap:"12px" } });
  titleRow.appendChild(el("div", { text:"Mask Editor  (보라=재생성 영역)", style:{ color:"#fff", fontSize:"14px", fontWeight:"700" } }));

  overlay.appendChild(titleRow);
  overlay.appendChild(popCanvas);
  overlay.appendChild(ctrlPanel);
  overlay.appendChild(btnRow);

  const onKey = e => {
    if (e.key === "Escape") { onApply?.(); document.body.removeChild(overlay); document.removeEventListener("keydown", onKey); }
  };
  document.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);
}

// ════════════════════════════════════════════════════════════════════════════
// 인라인 마스크 에디터
// ════════════════════════════════════════════════════════════════════════════
function createMaskEditor(state, ctx, showPopupFn) {
  const maskRef = { canvas: null, srcImg: null, origW: 0, origH: 0 };

  const dispCanvas = el("canvas", {
    style:{ display:"block", width:"100%", cursor:"crosshair", touchAction:"none" },
  });

  const canvasWrap = el("div", {
    style:{
      display:"none", position:"relative",
      width:`${DISP_W}px`, background:"#111",
      borderRadius:"6px", border:`1px solid ${C.border}`, overflow:"hidden",
    },
  });
  canvasWrap.appendChild(dispCanvas);

  const engine = createDrawingEngine(maskRef, dispCanvas, { brushSize: 20 });

  const { toolRow, zoomRow, hint, clearBtn } = createEditorToolbar(engine, C.lime);
  clearBtn.onclick = () => {
    if (!maskRef.canvas) return;
    maskRef.canvas.getContext("2d").clearRect(0, 0, maskRef.origW, maskRef.origH);
    engine.schedRender();
    state.inpaintMaskImage = null;
    ctx.persist();
  };

  const saveMaskBtn = button(t("inpaint_save_btn"), async () => {
    if (!maskRef.canvas || !maskRef.origW) return;
    saveMaskBtn.disabled = true; saveMaskBtn.textContent = t("inpaint_saving");
    try {
      const out = document.createElement("canvas");
      out.width = maskRef.origW; out.height = maskRef.origH;
      const octx = out.getContext("2d");
      octx.fillStyle = "black";
      octx.fillRect(0, 0, maskRef.origW, maskRef.origH);
      octx.drawImage(maskRef.canvas, 0, 0);
      const blob = await new Promise(r => out.toBlob(r, "image/png"));
      const fd = new FormData();
      fd.append("image", blob, `sdxl_mask_${Date.now()}.png`);
      fd.append("type", "input");
      const resp = await fetch("/upload/image", { method:"POST", body:fd });
      const data = await resp.json();
      state.inpaintMaskImage = data.name;
      ctx.persist();
      showPopupFn?.(t("inpaint_saved"), false);
    } catch (e) {
      showPopupFn?.(t("inpaint_save_err") + (e.message || e));
    } finally {
      saveMaskBtn.disabled = false; saveMaskBtn.textContent = t("inpaint_save_btn");
    }
  }, "primary");
  saveMaskBtn.style.cssText += "flex:1;";

  const bigEditBtn = button(t("inpaint_large_edit"), () => {
    if (!maskRef.canvas) return;
    openPopupEditor(maskRef, state, ctx, () => engine.schedRender(), showPopupFn);
  });
  bigEditBtn.title = "전체화면 팝업에서 마스크 편집";
  bigEditBtn.style.cssText += "flex:1;";

  const actionRow = el("div", { style:{ display:"flex", gap:"6px" } });
  actionRow.appendChild(saveMaskBtn);
  actionRow.appendChild(bigEditBtn);

  const editorPanel = panel([
    label("Mask Editor  (보라=재생성 / 검=유지)"),
    canvasWrap,
    el("div", { style:{ height:"6px" } }),
    toolRow,
    zoomRow,
    hint,
    actionRow,
  ]);
  editorPanel.style.display = "none";

  function loadSourceImage(filename) {
    if (!filename) { editorPanel.style.display = "none"; return; }
    const img = new Image();
    img.onload = () => {
      maskRef.srcImg = img;
      maskRef.origW  = img.naturalWidth;
      maskRef.origH  = img.naturalHeight;

      const dh = Math.round(maskRef.origH * DISP_W / maskRef.origW);
      dispCanvas.width  = DISP_W;
      dispCanvas.height = dh;
      canvasWrap.style.display = "block";

      maskRef.canvas = document.createElement("canvas");
      maskRef.canvas.width  = maskRef.origW;
      maskRef.canvas.height = maskRef.origH;

      engine.resetView();

      if (state.inpaintMaskImage) {
        const mImg = new Image();
        mImg.onload = () => {
          const tmp = document.createElement("canvas");
          tmp.width = maskRef.origW; tmp.height = maskRef.origH;
          const tctx = tmp.getContext("2d");
          tctx.drawImage(mImg, 0, 0, maskRef.origW, maskRef.origH);
          const imgData = tctx.getImageData(0, 0, maskRef.origW, maskRef.origH);
          for (let i = 0; i < imgData.data.length; i += 4) {
            imgData.data[3] = imgData.data[i];
          }
          tctx.putImageData(imgData, 0, 0);
          const mctx = maskRef.canvas.getContext("2d");
          mctx.clearRect(0, 0, maskRef.origW, maskRef.origH);
          mctx.drawImage(tmp, 0, 0);
          engine.schedRender();
        };
        mImg.onerror = () => engine.schedRender();
        mImg.src = `/view?filename=${encodeURIComponent(state.inpaintMaskImage)}&type=input&t=${Date.now()}`;
      } else {
        engine.schedRender();
      }

      editorPanel.style.display = "block";
    };
    img.onerror = () => {};
    img.src = `/view?filename=${encodeURIComponent(filename)}&type=input&t=${Date.now()}`;
  }

  async function autoSaveMask() {
    if (!maskRef.canvas || !maskRef.origW) return false;
    const checkCtx = maskRef.canvas.getContext("2d");
    const data = checkCtx.getImageData(0, 0, maskRef.origW, maskRef.origH).data;
    let hasPixels = false;
    for (let i = 3; i < data.length; i += 4) { if (data[i] > 10) { hasPixels = true; break; } }
    if (!hasPixels) return false;
    const out = document.createElement("canvas");
    out.width = maskRef.origW; out.height = maskRef.origH;
    const octx = out.getContext("2d");
    octx.fillStyle = "black"; octx.fillRect(0, 0, maskRef.origW, maskRef.origH);
    octx.drawImage(maskRef.canvas, 0, 0);
    const blob = await new Promise(r => out.toBlob(r, "image/png"));
    const fd = new FormData();
    fd.append("image", blob, `sdxl_mask_${Date.now()}.png`); fd.append("type", "input");
    const resp = await fetch("/upload/image", { method:"POST", body:fd });
    const d = await resp.json();
    state.inpaintMaskImage = d.name; ctx.persist();
    return true;
  }

  return { editorPanel, loadSourceImage, autoSaveMask };
}

// ════════════════════════════════════════════════════════════════════════════
// 메인 패널
// ════════════════════════════════════════════════════════════════════════════
export function mountInpaintLeft(leftEl, state, ctx) {
  const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } });
  leftEl.appendChild(wrap);

  const { editorPanel, loadSourceImage, autoSaveMask } = createMaskEditor(state, ctx, ctx.showPopup);

  // Source image — reactive slot
  const srcSlot = createInputImageSlot(state, "inpaintImage", uploadImage, ctx, { label: "Source Image" });
  const origSetFilename = srcSlot.setFilename.bind(srcSlot);
  srcSlot.setFilename = name => {
    origSetFilename(name);
    state.inpaintMaskImage = null;
    loadSourceImage(name);
  };
  wrap.appendChild(panel([label("Source Image"), srcSlot.el]));
  wrap.appendChild(editorPanel);

  if (state.inpaintImage) loadSourceImage(state.inpaintImage);

  // Settings
  wrap.appendChild(panel([
    label("Denoise Strength"),
    slider(0, 1, 0.01, state.inpaintDenoise ?? 0.85, v => { state.inpaintDenoise = v; ctx.persist(); }, v => v.toFixed(2)),
    row([col([label("Grow Mask (px)"), numberField(state.inpaintGrowMask ?? 6, v => { state.inpaintGrowMask = Math.max(0, Math.round(v)); ctx.persist(); }, 1)])]),
  ]));

  wrap.appendChild(panel([
    row([
      col([label("Steps"), numberField(state.steps, v => { state.steps = Math.max(1, Math.round(v)); ctx.persist(); }, 1)]),
      col([label("CFG"),   numberField(state.cfg,   v => { state.cfg   = v; ctx.persist(); }, 0.5)]),
    ]),
    row([
      col([label("Sampler"),   select(SAMPLERS,   state.sampler,   v => { state.sampler   = v; ctx.persist(); })]),
      col([label("Scheduler"), select(SCHEDULERS, state.scheduler, v => { state.scheduler = v; ctx.persist(); })]),
    ]),
  ]));

  mountLoraSection(wrap, state, ctx);

  return {
    setImageField(field, filename) {
      if (field === "inpaintImage") srcSlot.setFilename(filename);
    },

    setImage(name) { srcSlot.setFilename(name); },

    beforeGenerate: async () => {
      if (!state.inpaintImage) throw new Error("소스 이미지를 업로드하세요.");
      if (!state.inpaintMaskImage) {
        const saved = await autoSaveMask().catch(() => false);
        if (!saved) throw new Error(t("inpaint_no_mask"));
      }
    },

    getSourceURL() {
      return state.inpaintImage
        ? `/view?filename=${encodeURIComponent(state.inpaintImage)}&type=input`
        : null;
    },

    async getGraph() { return buildInpaintGraph(state); },
  };
}

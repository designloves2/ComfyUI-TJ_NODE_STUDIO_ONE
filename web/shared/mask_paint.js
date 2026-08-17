// mask_paint.js — shared inline mask editor (brush/eraser/zoom/pan canvas + popup
// large-edit), factored out of Z-Image's INPAINT mode so every ONE STUDIO tool with
// a paint-mask step calls the same implementation instead of re-authoring it.
import { C, el } from "../zimage/core.js";
import { panel, label, button } from "../zimage/ui_common.js";
import { t } from "./i18n.js";

// ════════════════════════════════════════════════════════════════════════════
// Drawing engine — brush/eraser strokes onto an offscreen mask canvas, with
// zoom/pan over the source image. No state coupling; caller owns maskRef/state.
// ════════════════════════════════════════════════════════════════════════════
export function createDrawingEngine(maskRef, dispCanvas, opts = {}) {
  let zoom   = 1, panX = 0, panY = 0;
  let brushSize  = opts.brushSize  ?? 20;
  let tool       = opts.tool       ?? "brush";
  let isDrawing  = false;
  let isPanning  = false;
  let lastPos    = null, panStart = null;
  let rafPending = false;
  // Live brush cursor: the pointer position in ORIGINAL image coords, so the ring
  // drawn on the display canvas always matches the real brush footprint.
  let hoverPos   = null;

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

    // Brush cursor — a ring at the true brush radius, replacing the OS crosshair so
    // the painted footprint is visible before committing a stroke. Drawn on the
    // display canvas only; never touches the exported mask.
    if (hoverPos && !isPanning) {
      const scale = dw / (origW / zoom);
      const cx = (hoverPos.x - panX) * scale;
      const cy = (hoverPos.y - panY) * (dh / (origH / zoom));
      const r  = Math.max(1, brushSize * scale);
      dctx.save();
      dctx.setLineDash(tool === "eraser" ? [4, 3] : []);
      dctx.lineWidth = 2;
      dctx.strokeStyle = "rgba(0,0,0,0.75)";
      dctx.beginPath(); dctx.arc(cx, cy, r, 0, Math.PI * 2); dctx.stroke();
      dctx.lineWidth = 1;
      dctx.strokeStyle = "rgba(255,255,255,0.95)";
      dctx.beginPath(); dctx.arc(cx, cy, r, 0, Math.PI * 2); dctx.stroke();
      dctx.restore();
    }

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

  // Flip the painted region: what was masked becomes kept and vice versa. The mask
  // lives in the alpha channel (opaque white = regenerate), so inverting is just
  // alpha' = 255 - alpha, with RGB forced to white so partial alpha stays white.
  function invertMask() {
    const { canvas, origW, origH } = maskRef;
    if (!canvas || !origW) return;
    const mctx = canvas.getContext("2d");
    const d = mctx.getImageData(0, 0, origW, origH);
    const px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      const a = 255 - px[i + 3];
      px[i] = 255; px[i + 1] = 255; px[i + 2] = 255; px[i + 3] = a;
    }
    mctx.putImageData(d, 0, 0);
    schedRender();
  }

  function attachEvents() {
    // The brush ring drawn in render() IS the cursor — hide the OS one.
    dispCanvas.style.cursor = "none";

    dispCanvas.addEventListener("wheel", e => {
      e.preventDefault();
      const r = dispCanvas.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 2 : 0.5,
        (e.clientX - r.left) / r.width,
        (e.clientY - r.top)  / r.height);
      hoverPos = toOrig(e);
      schedRender();
    }, { passive: false });

    dispCanvas.addEventListener("pointerenter", e => { hoverPos = toOrig(e); schedRender(); });
    dispCanvas.addEventListener("pointerleave", () => { hoverPos = null; schedRender(); });

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
      const pos = toOrig(e);
      hoverPos = pos;
      if (!isDrawing) { schedRender(); return; }
      if (lastPos) stroke(lastPos, pos);
      lastPos = pos;
    });

    const end = () => {
      isDrawing = false; isPanning = false; lastPos = null; panStart = null;
      dispCanvas.style.cursor = "none";
      schedRender();
    };
    dispCanvas.addEventListener("pointerup",     end);
    dispCanvas.addEventListener("pointercancel", end);
    dispCanvas.addEventListener("contextmenu",   e => e.preventDefault());
  }

  attachEvents();

  return {
    schedRender, resetView, getZoom, invertMask,
    setZoomChangeCallback,
    setTool: tv => { tool = tv; schedRender(); },
    getTool: () => tool,
    setBrushSize: s => { brushSize = s; schedRender(); },
    getBrushSize: () => brushSize,
    zoomIn:  () => zoomAt(2, 0.5, 0.5),
    zoomOut: () => zoomAt(0.5, 0.5, 0.5),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Toolbar (brush/eraser/clear/size + zoom controls)
// ════════════════════════════════════════════════════════════════════════════
export function createEditorToolbar(engine, accentColor, opts = {}) {
  const ac = accentColor ?? C.lime;
  function btn(text, onClick) {
    return el("button", {
      text, type: "button",
      style: {
        cursor: "pointer", fontFamily: "inherit", fontSize: "11px",
        padding: "4px 8px", borderRadius: "6px",
        border: `1px solid ${C.border}`, background: C.bg2, color: "#fff",
      },
      onclick: onClick,
    });
  }

  let brushBtn, eraserBtn;
  function syncToolBtns() {
    brushBtn.style.background  = engine.getTool() === "brush"  ? ac : C.bg2;
    eraserBtn.style.background = engine.getTool() === "eraser" ? ac : C.bg2;
  }
  brushBtn  = btn("✏ Brush",  () => { engine.setTool("brush");  syncToolBtns(); });
  eraserBtn = btn("◻ Eraser", () => { engine.setTool("eraser"); syncToolBtns(); });
  brushBtn.style.background = ac;

  const clearBtn = btn("✕ Clear", () => {}); // caller wires actual clearing

  // Invert swaps the painted/unpainted regions. It edits the live canvas, so any
  // previously uploaded mask file is now stale — onMaskEdited lets the caller drop it.
  const invertBtn = btn("⇄ Invert", () => { engine.invertMask(); opts.onMaskEdited?.(); });
  invertBtn.title = "Invert mask (swap regenerate / keep areas)";

  const sizeValEl = el("span", { text: `${engine.getBrushSize()}px`, style: { color: C.text, fontSize: "11px", minWidth: "28px", display: "inline-block", textAlign: "right" } });
  const sizeRange = el("input", { type: "range", min: "2", max: "200", step: "1" });
  sizeRange.value = engine.getBrushSize();
  sizeRange.style.cssText = `flex:1;accent-color:${ac};min-width:60px;`;
  sizeRange.addEventListener("input", () => {
    engine.setBrushSize(parseInt(sizeRange.value));
    sizeValEl.textContent = `${engine.getBrushSize()}px`;
  });

  const zoomLbl = el("span", { text: "1×", style: { color: C.text, fontSize: "12px", fontWeight: "700", minWidth: "28px", textAlign: "center", fontFamily: "monospace" } });
  engine.setZoomChangeCallback(() => { zoomLbl.textContent = `${engine.getZoom()}×`; });

  const zoomInBtn  = btn("＋", () => engine.zoomIn());
  const zoomOutBtn = btn("－", () => engine.zoomOut());
  const fitBtn     = btn("⊡ Fit", () => engine.resetView());

  const toolRow = el("div", { style: { display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap", marginBottom: "4px" } });
  const sizeRow = el("div", { style: { display: "flex", alignItems: "center", gap: "4px", flex: "1" } });
  sizeRow.appendChild(el("span", { text: "Size:", style: { color: C.muted, fontSize: "11px" } }));
  sizeRow.appendChild(sizeRange);
  sizeRow.appendChild(sizeValEl);
  toolRow.appendChild(brushBtn); toolRow.appendChild(eraserBtn);
  toolRow.appendChild(invertBtn); toolRow.appendChild(clearBtn);
  toolRow.appendChild(sizeRow);

  const zoomRow = el("div", { style: { display: "flex", alignItems: "center", gap: "4px", marginBottom: "4px" } });
  zoomRow.appendChild(el("span", { text: "Zoom:", style: { color: C.muted, fontSize: "11px" } }));
  zoomRow.appendChild(zoomOutBtn);
  zoomRow.appendChild(zoomLbl);
  zoomRow.appendChild(zoomInBtn);
  zoomRow.appendChild(fitBtn);

  const hint = el("div", { text: t("inpaint_hint"), style: { color: C.muted, fontSize: "9px", marginBottom: "4px" } });

  return { toolRow, zoomRow, hint, clearBtn, invertBtn };
}

async function maskCanvasToUpload(maskCanvas, origW, origH, filenamePrefix) {
  const out = document.createElement("canvas");
  out.width = origW; out.height = origH;
  const octx = out.getContext("2d");
  octx.fillStyle = "black";
  octx.fillRect(0, 0, origW, origH);
  octx.drawImage(maskCanvas, 0, 0);
  const blob = await new Promise(r => out.toBlob(r, "image/png"));
  const fd = new FormData();
  fd.append("image", blob, `${filenamePrefix}_${Date.now()}.png`);
  fd.append("type", "input");
  const resp = await fetch("/upload/image", { method: "POST", body: fd });
  const data = await resp.json();
  return data.name;
}

function openPopupEditor(maskRef, onSave, onClose, filenamePrefix, showPopup) {
  const { origW, origH } = maskRef;
  const maxW = Math.round(window.innerWidth  * 0.85);
  const maxH = Math.round(window.innerHeight * 0.78);
  const scale = Math.min(maxW / origW, maxH / origH, 1);
  const popW  = Math.round(origW * scale);
  const popH  = Math.round(origH * scale);

  const overlay = el("div", { style: {
    position: "fixed", inset: "0", zIndex: "99999",
    background: "rgba(8,8,8,0.92)",
    display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", gap: "10px",
  }});

  const popCanvas = el("canvas", { style: {
    display: "block", cursor: "none", touchAction: "none",
    borderRadius: "6px", border: `1px solid ${C.border}`,
    boxShadow: "0 0 40px rgba(0,0,0,0.8)",
  }});
  popCanvas.width  = popW;
  popCanvas.height = popH;
  popCanvas.style.width  = `${popW}px`;
  popCanvas.style.height = `${popH}px`;

  const engine = createDrawingEngine(maskRef, popCanvas, { brushSize: 30 });
  engine.schedRender();

  const { toolRow, zoomRow, hint, clearBtn } = createEditorToolbar(engine, "#7c3aed");
  clearBtn.onclick = () => {
    maskRef.canvas.getContext("2d").clearRect(0, 0, maskRef.origW, maskRef.origH);
    engine.schedRender();
  };

  const applyBtn = button(t("inpaint_apply"), async () => {
    applyBtn.disabled = true; applyBtn.textContent = t("inpaint_saving");
    try {
      const name = await maskCanvasToUpload(maskRef.canvas, origW, origH, filenamePrefix);
      showPopup?.(t("inpaint_saved"), false);
      document.body.removeChild(overlay);
      onSave?.(name);
    } catch (e) {
      showPopup?.(t("inpaint_save_err") + (e.message || e));
      applyBtn.disabled = false; applyBtn.textContent = t("inpaint_apply");
    }
  }, "primary");

  const closeBtn2 = button("✕ Close (don't save)", () => {
    document.body.removeChild(overlay);
    onClose?.();
  });

  const btnRow = el("div", { style: { display: "flex", gap: "10px", alignItems: "center" } });
  btnRow.appendChild(applyBtn);
  btnRow.appendChild(closeBtn2);

  const ctrlPanel = el("div", { style: {
    background: C.bg1, border: `1px solid ${C.border}`, borderRadius: "8px",
    padding: "10px 14px", width: `${popW}px`, boxSizing: "border-box",
  }});
  ctrlPanel.appendChild(toolRow);
  ctrlPanel.appendChild(zoomRow);
  ctrlPanel.appendChild(hint);

  const titleRow = el("div", { style: { display: "flex", alignItems: "center", gap: "12px" } });
  titleRow.appendChild(el("div", { text: "Mask Editor  (purple = regenerate area)", style: { color: "#fff", fontSize: "14px", fontWeight: "700" } }));

  overlay.appendChild(titleRow);
  overlay.appendChild(popCanvas);
  overlay.appendChild(ctrlPanel);
  overlay.appendChild(btnRow);

  const onKey = e => {
    if (e.key === "Escape") { document.body.removeChild(overlay); document.removeEventListener("keydown", onKey); onClose?.(); }
  };
  document.addEventListener("keydown", onKey);

  document.body.appendChild(overlay);
}

// ════════════════════════════════════════════════════════════════════════════
// Inline mask editor — same UI Z-Image's INPAINT mode uses (inline canvas +
// "Large Edit" popup). Generic over which state fields hold the image/mask
// filenames, so every ONE STUDIO tool wires the same component.
//
// opts: { state, ctx, imageField, maskField, dispW, filenamePrefix, accentColor }
// ════════════════════════════════════════════════════════════════════════════
export function createInlineMaskEditor(opts) {
  const { state, ctx, imageField, maskField, dispW = 276, filenamePrefix = "mask", accentColor } = opts;
  const maskRef = { canvas: null, srcImg: null, origW: 0, origH: 0 };

  const dispCanvas = el("canvas", { style: { display: "block", width: "100%", cursor: "none", touchAction: "none" } });
  const canvasWrap = el("div", { style: {
    display: "none", position: "relative",
    width: `${dispW}px`, background: "#111",
    borderRadius: "6px", border: `1px solid ${C.border}`, overflow: "hidden",
  }});
  canvasWrap.appendChild(dispCanvas);

  const engine = createDrawingEngine(maskRef, dispCanvas, { brushSize: 20 });
  const { toolRow, zoomRow, hint, clearBtn } = createEditorToolbar(engine, accentColor, {
    // Inverting edits the canvas, so the uploaded file no longer matches — drop it so
    // Save / auto-save-on-generate re-uploads the new mask.
    onMaskEdited: () => { state[maskField] = null; ctx.persist(); },
  });
  clearBtn.onclick = () => {
    if (!maskRef.canvas) return;
    maskRef.canvas.getContext("2d").clearRect(0, 0, maskRef.origW, maskRef.origH);
    engine.schedRender();
    state[maskField] = null;
    ctx.persist();
  };

  const saveMaskBtn = button(t("inpaint_save_btn"), async () => {
    if (!maskRef.canvas || !maskRef.origW) return;
    saveMaskBtn.disabled = true; saveMaskBtn.textContent = t("inpaint_saving");
    try {
      state[maskField] = await maskCanvasToUpload(maskRef.canvas, maskRef.origW, maskRef.origH, filenamePrefix);
      ctx.persist();
      ctx.showPopup?.(t("inpaint_saved"), false);
    } catch (e) {
      ctx.showPopup?.(t("inpaint_save_err") + (e.message || e));
    } finally {
      saveMaskBtn.disabled = false; saveMaskBtn.textContent = t("inpaint_save_btn");
    }
  }, "primary");
  saveMaskBtn.style.cssText += "flex:1;";

  const bigEditBtn = button(t("inpaint_large_edit"), () => {
    if (!maskRef.canvas) return;
    openPopupEditor(maskRef, name => { state[maskField] = name; ctx.persist(); engine.schedRender(); }, () => engine.schedRender(), filenamePrefix, ctx.showPopup);
  });
  bigEditBtn.style.cssText += "flex:1;";

  const actionRow = el("div", { style: { display: "flex", gap: "6px" } });
  actionRow.appendChild(saveMaskBtn);
  actionRow.appendChild(bigEditBtn);

  const editorPanel = panel([
    label("Mask Editor  (purple = regenerate / clear = keep)"),
    canvasWrap,
    el("div", { style: { height: "6px" } }),
    toolRow, zoomRow, hint, actionRow,
  ]);
  editorPanel.style.display = "none";

  function loadSourceImage(filename) {
    if (!filename) { editorPanel.style.display = "none"; return; }
    const img = new Image();
    img.onload = () => {
      maskRef.srcImg = img;
      maskRef.origW  = img.naturalWidth;
      maskRef.origH  = img.naturalHeight;

      const dh = Math.round(maskRef.origH * dispW / maskRef.origW);
      dispCanvas.width  = dispW;
      dispCanvas.height = dh;
      canvasWrap.style.display = "block";

      maskRef.canvas = document.createElement("canvas");
      maskRef.canvas.width  = maskRef.origW;
      maskRef.canvas.height = maskRef.origH;

      engine.resetView();

      if (state[maskField]) {
        const mImg = new Image();
        mImg.onload = () => {
          const tmp = document.createElement("canvas");
          tmp.width = maskRef.origW; tmp.height = maskRef.origH;
          const tctx = tmp.getContext("2d");
          tctx.drawImage(mImg, 0, 0, maskRef.origW, maskRef.origH);
          const imgData = tctx.getImageData(0, 0, maskRef.origW, maskRef.origH);
          // B&W mask PNG → alpha mask. The saved file is fully opaque (black bg +
          // white paint), so alpha must be rebuilt from luminance PER PIXEL — writing
          // to data[3] instead of data[i+3] only touched pixel 0 and left every other
          // alpha at 255, which made a reloaded mask cover the whole image.
          for (let i = 0; i < imgData.data.length; i += 4) imgData.data[i + 3] = imgData.data[i];
          tctx.putImageData(imgData, 0, 0);
          const mctx = maskRef.canvas.getContext("2d");
          mctx.clearRect(0, 0, maskRef.origW, maskRef.origH);
          mctx.drawImage(tmp, 0, 0);
          engine.schedRender();
        };
        mImg.onerror = () => engine.schedRender();
        mImg.src = `/view?filename=${encodeURIComponent(state[maskField])}&type=input&t=${Date.now()}`;
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
    state[maskField] = await maskCanvasToUpload(maskRef.canvas, maskRef.origW, maskRef.origH, filenamePrefix);
    ctx.persist();
    return true;
  }

  return { editorPanel, loadSourceImage, autoSaveMask };
}

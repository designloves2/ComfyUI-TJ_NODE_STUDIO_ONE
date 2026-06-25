// ui_paint_canvas.js — mask painting canvas (original-resolution)
import { C, el } from "./core.js";
import { button, row } from "./ui_common.js";

const MAX_HISTORY = 20;

export function createPaintCanvas({ width = 1024, height = 1024, mode = "mask", baseImageURL = null, existingMask = null } = {}) {
  const stageW = width, stageH = height;

  const stage = el("div", { style: {
    position: "relative", width: "100%",
    aspectRatio: `${stageW}/${stageH}`,
    background: "#000", borderRadius: "6px",
    overflow: "hidden", touchAction: "none", cursor: "crosshair",
  }});

  const baseCanvas = el("canvas", { width: stageW, height: stageH, style: { position:"absolute", inset:"0", width:"100%", height:"100%" }});
  const drawCanvas = el("canvas", { width: stageW, height: stageH, style: { position:"absolute", inset:"0", width:"100%", height:"100%" }});
  stage.appendChild(baseCanvas);
  stage.appendChild(drawCanvas);

  const baseCtx = baseCanvas.getContext("2d");
  const drawCtx = drawCanvas.getContext("2d");

  // B/W mask buffer (pure black/white, for upload)
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = stageW; maskCanvas.height = stageH;
  const maskCtx = maskCanvas.getContext("2d");
  maskCtx.fillStyle = "#000"; maskCtx.fillRect(0, 0, stageW, stageH);

  // Load base image — no crossOrigin needed for ComfyUI localhost
  if (baseImageURL) {
    const img = new Image();
    img.onload = () => baseCtx.drawImage(img, 0, 0, stageW, stageH);
    img.src = baseImageURL;
  }

  // Restore previous mask overlay if any
  if (existingMask) {
    const img = new Image();
    img.onload = () => {
      drawCtx.drawImage(img, 0, 0, stageW, stageH);
      // Rebuild B/W mask from the visible (red) overlay
      const id = drawCtx.getImageData(0, 0, stageW, stageH);
      const mid = maskCtx.createImageData(stageW, stageH);
      for (let i = 0; i < id.data.length; i += 4) {
        const hasRed = id.data[i] > 100 && id.data[i+3] > 50;
        mid.data[i] = mid.data[i+1] = mid.data[i+2] = hasRed ? 255 : 0;
        mid.data[i+3] = 255;
      }
      maskCtx.putImageData(mid, 0, 0);
    };
    img.src = existingMask;
  }

  let brushSize = 40;
  let drawing = false;
  let last = null;
  const history = [];

  function pushHistory() {
    history.push(drawCanvas.toDataURL());
    if (history.length > MAX_HISTORY) history.shift();
  }

  function strokeTo(x, y) {
    drawCtx.lineJoin = "round"; drawCtx.lineCap = "round"; drawCtx.lineWidth = brushSize;
    drawCtx.strokeStyle = "rgba(255,50,50,0.6)";
    drawCtx.beginPath(); drawCtx.moveTo(last.x, last.y); drawCtx.lineTo(x, y); drawCtx.stroke();
    maskCtx.lineJoin = "round"; maskCtx.lineCap = "round"; maskCtx.lineWidth = brushSize;
    maskCtx.strokeStyle = "#ffffff";
    maskCtx.beginPath(); maskCtx.moveTo(last.x, last.y); maskCtx.lineTo(x, y); maskCtx.stroke();
    last = { x, y };
  }

  function toLocal(e) {
    const r = stage.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (stageW / r.width), y: (e.clientY - r.top) * (stageH / r.height) };
  }

  stage.addEventListener("pointerdown", e => { stage.setPointerCapture(e.pointerId); pushHistory(); drawing = true; last = toLocal(e); strokeTo(last.x, last.y); });
  stage.addEventListener("pointermove", e => { if (!drawing) return; strokeTo(toLocal(e).x, toLocal(e).y); });
  ["pointerup","pointerleave","pointercancel"].forEach(ev => stage.addEventListener(ev, () => { drawing = false; last = null; }));

  function clearMask() {
    pushHistory();
    drawCtx.clearRect(0, 0, stageW, stageH);
    maskCtx.fillStyle = "#000"; maskCtx.fillRect(0, 0, stageW, stageH);
  }
  function undo() {
    const prev = history.pop(); if (!prev) return;
    const img = new Image(); img.onload = () => { drawCtx.clearRect(0,0,stageW,stageH); drawCtx.drawImage(img, 0,0); }; img.src = prev;
  }
  function exportMaskDataURL()   { return maskCanvas.toDataURL("image/png"); }
  function exportOverlayDataURL(){ return drawCanvas.toDataURL("image/png"); } // red overlay (for thumbnail)

  function setBrushSize(v) { brushSize = v; }

  return { stage, clearMask, undo, exportMaskDataURL, exportOverlayDataURL, setBrushSize };
}

export function paintToolbar(pc, { mode = "mask" } = {}) {
  const sizeIn = el("input", { type:"range", min:"4", max:"200", value:"40", style:{ width:"120px" }});
  sizeIn.addEventListener("input", () => pc.setBrushSize(parseInt(sizeIn.value, 10)));
  const lbl = el("div", { text:"Brush", style:{ color:C.muted, fontSize:"11px", alignSelf:"center" }});
  const undoBtn  = button("↶ Undo",  () => pc.undo());
  const clearBtn = button("Clear",   () => pc.clearMask(), "danger");
  return row([lbl, sizeIn, undoBtn, clearBtn], "8px");
}

// ui_mask_draw.js — shared drawing-canvas annotation tool for Qwen 2.1 ONE (TJ)
//
// Used by both Inpaint mode (mandatory) and Edit mode (optional): draws pen/line/circle/
// rectangle marks directly on top of a loaded image instead of uploading a separate mask
// file. "Commit" flattens the drawing onto a copy of the source image at full opacity and
// uploads that flattened frame through the normal image-upload path — the model then reads
// it as an extra reference image (images.image_N on TextEncodeQwenImage21), never as a
// mask/SetLatentNoiseMask input.
import { C, el } from "./core_qwen21.js";
import { uploadAnnotationBlob } from "./api_qwen21.js";

const HIGHLIGHT = "#ff00c8"; // flat, unambiguous highlight color — easy for the model to read

// Opens a modal drawing overlay over `sourceImageUrl`, optionally seeded with a previous
// session's `initialStrokes` (re-edit: erase/add to marks already made on this image) —
// user: "원본이미지와 드로잉 레이어 두개를 전부 기억하고 있으면서 수정이 가능하게 되야
// 한다." Calls onCommit(filename, strokes) once the user uploads the flattened annotated
// frame — `strokes` is the live stroke list, saved by the caller so the NEXT time this
// same image is opened for drawing, the marks are still there to edit/erase, not lost.
export function openMaskDrawOverlay(root, sourceImageUrl, onCommit, initialStrokes) {
  const overlay = el("div", { style: {
    position: "absolute", inset: "0", zIndex: "9999", background: "rgba(11,11,11,0.97)",
    borderRadius: "inherit", display: "flex", flexDirection: "column", padding: "12px", gap: "8px", boxSizing: "border-box",
  }});

  const hdr = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" } });
  hdr.appendChild(el("div", { text: "Draw over the area to change", style: { color: "#fff", fontSize: "13px", fontWeight: "700", flex: "1" } }));

  const toolbar = el("div", { style: { display: "flex", alignItems: "center", gap: "6px", flexShrink: "0", flexWrap: "wrap" } });
  const TOOL_KEYS = { pen: "P", line: "I", circle: "O", rect: "U" };
  const tools = ["pen", "line", "circle", "rect"];
  let activeTool = "pen";
  const toolBtns = {};
  function setTool(tool) { activeTool = tool; tools.forEach(t => toolBtns[t].style.background = t === activeTool ? C.brand : C.bg2); }
  tools.forEach(tool => {
    const b = el("button", { type: "button", text: `${tool} (${TOOL_KEYS[tool]})`, style: {
      cursor: "pointer", fontFamily: "inherit", fontSize: "11px", padding: "4px 10px", borderRadius: "6px",
      background: tool === activeTool ? C.brand : C.bg2, color: "#fff", border: `1px solid ${C.border}`, textTransform: "capitalize",
    }});
    b.addEventListener("click", () => setTool(tool));
    toolBtns[tool] = b;
    toolbar.appendChild(b);
  });

  const sizeLabel = el("span", { text: "Brush ([/])", style: { color: C.muted, fontSize: "11px" } });
  const sizeSlider = el("input", { type: "range", min: "2", max: "60", value: "12", style: { width: "100px" } });
  toolbar.appendChild(sizeLabel); toolbar.appendChild(sizeSlider);

  const undoBtn  = el("button", { type: "button", text: "↺ Undo (\\)",  style: btnStyle() });
  const clearBtn = el("button", { type: "button", text: "✕ Clear (⌫)", style: btnStyle() });
  toolbar.appendChild(undoBtn); toolbar.appendChild(clearBtn);

  const spacer = el("div", { style: { flex: "1" } });
  const hint = el("span", { text: "Right-click drag: erase", style: { color: C.muted, fontSize: "10px" } });
  const cancelBtn = el("button", { type: "button", text: "Cancel (Esc)", style: btnStyle() });
  const commitBtn = el("button", { type: "button", text: "✓ Commit as reference (Enter)", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "12px", padding: "6px 14px", borderRadius: "6px",
    background: C.brand, color: "#fff", border: "none", fontWeight: "700",
  }});
  toolbar.appendChild(hint); toolbar.appendChild(spacer); toolbar.appendChild(cancelBtn); toolbar.appendChild(commitBtn);

  hdr.appendChild(toolbar);
  overlay.appendChild(hdr);

  const canvasWrap = el("div", { style: {
    flex: "1", position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
  }});
  overlay.appendChild(canvasWrap);

  const img = new Image();
  img.onload = () => {
    const maxW = canvasWrap.clientWidth || 640, maxH = canvasWrap.clientHeight || 480;
    const scale = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
    const dispW = Math.round(img.naturalWidth * scale), dispH = Math.round(img.naturalHeight * scale);

    const baseCanvas = document.createElement("canvas");
    baseCanvas.width = img.naturalWidth; baseCanvas.height = img.naturalHeight;
    baseCanvas.getContext("2d").drawImage(img, 0, 0);

    // Draw the loaded image straight onto the same canvas every redraw instead of a
    // separate CSS `background: url(...)` layer — that was a second, independent fetch
    // of the same image with its own failure/caching path, so it could (and did, per the
    // user) show a blank/black canvas even after the JS Image above loaded fine. Painting
    // from the already-loaded `img` object guarantees the photo is always there.
    const stage = el("div", { style: { position: "relative", width: `${dispW}px`, height: `${dispH}px` } });
    const drawCanvas = el("canvas", { width: String(dispW), height: String(dispH), style: {
      position: "absolute", inset: "0", width: `${dispW}px`, height: `${dispH}px`,
      borderRadius: "6px", cursor: "none", touchAction: "none",
    }});
    // Brush-size cursor ring — a separate transparent layer on top so the live preview
    // never gets baked into the exported/committed frame. User: "드로잉에서는 커서가
    // 브러시의 사이즈로 보였으면 좋겠어."
    const cursorCanvas = el("canvas", { width: String(dispW), height: String(dispH), style: {
      position: "absolute", inset: "0", width: `${dispW}px`, height: `${dispH}px`,
      borderRadius: "6px", pointerEvents: "none",
    }});
    stage.appendChild(drawCanvas); stage.appendChild(cursorCanvas);
    canvasWrap.appendChild(stage);
    const ctx = drawCanvas.getContext("2d");
    const cctx = cursorCanvas.getContext("2d");
    ctx.lineCap = "round"; ctx.lineJoin = "round";

    // Strokes are painted onto their own offscreen layer first, then composited under the
    // photo-drawn drawCanvas — an eraser stroke (right-click) uses destination-out on THIS
    // layer only, so it removes previously drawn marks without touching the photo itself
    // (drawCanvas redraws the full image from scratch every frame, so erasing pixels
    // directly on it would erase the photo, not just the annotation).
    const annotCanvas = document.createElement("canvas");
    annotCanvas.width = dispW; annotCanvas.height = dispH;
    const actx = annotCanvas.getContext("2d");
    actx.lineCap = "round"; actx.lineJoin = "round";

    const strokes = []; // { tool, size, erase, points:[{x,y}] }
    if (Array.isArray(initialStrokes) && initialStrokes.length) {
      strokes.push(...JSON.parse(JSON.stringify(initialStrokes)));
    }
    function redraw() {
      actx.clearRect(0, 0, dispW, dispH);
      strokes.forEach(s => drawStroke(actx, s));
      ctx.clearRect(0, 0, dispW, dispH);
      ctx.drawImage(img, 0, 0, dispW, dispH);
      ctx.drawImage(annotCanvas, 0, 0);
    }
    function drawCursorRing(pos, size, erasing) {
      cctx.clearRect(0, 0, dispW, dispH);
      if (!pos) return;
      cctx.beginPath();
      cctx.arc(pos.x, pos.y, Math.max(1, size / 2), 0, Math.PI * 2);
      cctx.strokeStyle = erasing ? "#ff4444" : "#ffffff"; cctx.lineWidth = 1.5; cctx.stroke();
      cctx.beginPath();
      cctx.arc(pos.x, pos.y, Math.max(1, size / 2), 0, Math.PI * 2);
      cctx.strokeStyle = "#000000"; cctx.lineWidth = 1; cctx.setLineDash([2, 2]); cctx.stroke();
      cctx.setLineDash([]);
    }
    function drawStroke(ctx, s) {
      ctx.globalCompositeOperation = s.erase ? "destination-out" : "source-over";
      ctx.strokeStyle = HIGHLIGHT; ctx.fillStyle = HIGHLIGHT; ctx.lineWidth = s.size;
      if (s.tool === "pen") {
        ctx.beginPath();
        s.points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.stroke();
      } else if (s.tool === "line" && s.points.length >= 2) {
        ctx.beginPath(); ctx.moveTo(s.points[0].x, s.points[0].y); ctx.lineTo(s.points[1].x, s.points[1].y); ctx.stroke();
      } else if (s.tool === "circle" && s.points.length >= 2) {
        const [a, b] = s.points;
        if (s.shift) {
          // Shift: old center-out behavior — a is the center, drag distance is the radius.
          const r = Math.hypot(b.x - a.x, b.y - a.y);
          ctx.beginPath(); ctx.arc(a.x, a.y, r, 0, Math.PI * 2); ctx.stroke();
        } else {
          // Default: top-left-corner bounding box, like the rect tool — an ellipse
          // inscribed in the a→b box, not a circle centered on the drag start.
          const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
          const rx = Math.abs(b.x - a.x) / 2, ry = Math.abs(b.y - a.y) / 2;
          ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
        }
      } else if (s.tool === "rect" && s.points.length >= 2) {
        const [a, b] = s.points;
        if (s.shift) {
          // Shift: center-out perfect square — a is the center.
          const half = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
          ctx.strokeRect(a.x - half, a.y - half, half * 2, half * 2);
        } else {
          ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
        }
      }
    }

    redraw(); // paint the source image immediately — otherwise the canvas stayed blank
              // (showing as solid black through the overlay) until the user's first stroke.

    let current = null;
    function toLocal(e) { const r = drawCanvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * (dispW / r.width), y: (e.clientY - r.top) * (dispH / r.height) }; }
    // Right mouse button = eraser for whichever tool is active — user: "마우스 오른쪽
    // 클릭 : 지우개". Left-click keeps drawing with the active tool.
    drawCanvas.addEventListener("contextmenu", e => e.preventDefault());
    drawCanvas.addEventListener("pointerdown", e => {
      if (e.button !== 0 && e.button !== 2) return;
      drawCanvas.setPointerCapture(e.pointerId);
      current = { tool: activeTool, size: +sizeSlider.value, shift: e.shiftKey, erase: e.button === 2, points: [toLocal(e)] };
      strokes.push(current);
    });
    drawCanvas.addEventListener("pointermove", e => {
      drawCursorRing(toLocal(e), +sizeSlider.value, !!current?.erase);
      if (!current) return;
      // Live-read shift on every move (not just at pointerdown) — the user may press/
      // release it mid-drag, e.g. circle default (corner box) vs Shift (center-out circle).
      current.shift = e.shiftKey;
      if (current.tool === "pen") current.points.push(toLocal(e));
      else current.points[1] = toLocal(e);
      redraw();
    });
    drawCanvas.addEventListener("pointerup", () => { current = null; });
    drawCanvas.addEventListener("pointerleave", () => drawCursorRing(null));

    function undo()  { strokes.pop(); redraw(); }
    function clearAll() { strokes.length = 0; redraw(); }
    function bumpBrush(delta) {
      sizeSlider.value = String(Math.max(+sizeSlider.min, Math.min(+sizeSlider.max, +sizeSlider.value + delta)));
    }
    undoBtn.onclick  = undo;
    clearBtn.onclick = clearAll;

    async function commit() {
      commitBtn.disabled = true; commitBtn.textContent = "Uploading…";
      try {
        // Flatten the drawing (scaled back up to native resolution) onto a copy of the
        // source image at full opacity — a flat opaque highlight on a duplicate frame,
        // per the spec's "simplest and most robust" guidance.
        const outCanvas = document.createElement("canvas");
        outCanvas.width = img.naturalWidth; outCanvas.height = img.naturalHeight;
        const octx = outCanvas.getContext("2d");
        octx.drawImage(baseCanvas, 0, 0);
        octx.drawImage(drawCanvas, 0, 0, dispW, dispH, 0, 0, img.naturalWidth, img.naturalHeight);
        const blob = await new Promise(res => outCanvas.toBlob(res, "image/png"));
        const filename = await uploadAnnotationBlob(blob, `q21_annot_${Date.now()}.png`);
        onCommit(filename, JSON.parse(JSON.stringify(strokes)));
        closeOverlay();
      } catch (e) {
        alert("Upload failed: " + e.message);
      } finally {
        commitBtn.disabled = false; commitBtn.textContent = "✓ Commit as reference (Enter)";
      }
    }
    commitBtn.onclick = commit;

    // ── Keyboard shortcuts — user's exact spec: tool letters, brush size, undo/clear/
    // cancel/commit. Ignored while the brush-size slider itself has focus so arrow-key
    // slider nudging still works normally.
    function onKeyDown(e) {
      if (e.target === sizeSlider) return;
      switch (e.key) {
        case "p": case "P": setTool("pen"); break;
        case "i": case "I": setTool("line"); break;
        case "o": case "O": setTool("circle"); break;
        case "u": case "U": setTool("rect"); break;
        case "[": bumpBrush(-1); break;
        case "]": bumpBrush(+1); break;
        case "\\": e.preventDefault(); undo(); break;
        case "Backspace": e.preventDefault(); clearAll(); break;
        case "Escape": e.preventDefault(); closeOverlay(); break;
        case "Enter": e.preventDefault(); commit(); break;
        default: return;
      }
    }
    function closeOverlay() { document.removeEventListener("keydown", onKeyDown); overlay.remove(); }
    document.addEventListener("keydown", onKeyDown);
    cancelBtn.onclick = closeOverlay;
  };
  img.src = sourceImageUrl;

  cancelBtn.onclick = () => overlay.remove(); // overridden once the image loads, to also drop the keydown listener
  root.appendChild(overlay);
  return overlay;
}

function btnStyle() {
  return { cursor: "pointer", fontFamily: "inherit", fontSize: "11px", padding: "4px 10px", borderRadius: "6px", background: C.bg2, color: C.text, border: `1px solid ${C.border}` };
}

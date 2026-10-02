// ui_pose_crop.js — POSE mode's crop tool for Qwen Image 2.1 ONE (TJ)
//
// This overlay ONLY selects the crop region (yellow box + 8 drag handles) — it has no
// output-size UI of its own. The Output Size (W/H + 🔒 Lock ratio, locked to the crop's own
// aspect) lives in the left panel below the crop button, so the user sees/edits it without
// reopening the overlay, and can retarget the output size without re-selecting the region.
// cropAndUploadPoseImage() does the actual crop+resize+upload (shared by "just applied the
// crop" and "changed the Output Size fields afterwards").
import { C, el } from "./core_qwen21.js";
import { uploadAnnotationBlob } from "./api_qwen21.js";

const YELLOW = "#ffd400";
const HANDLE_SIZE = 12;

// Aspect-ratio presets — "paired" ones (2:3, 3:4, 4:5, 9:16) can be flipped between
// portrait/landscape with the ⇄ switch next to the box; 1:1 and Free have no pair.
const RATIO_PRESETS = [
  { key: "1:1",  w: 1, h: 1 },
  { key: "2:3",  w: 2, h: 3, pair: true },
  { key: "3:4",  w: 3, h: 4, pair: true },
  { key: "4:5",  w: 4, h: 5, pair: true },
  { key: "9:16", w: 9, h: 16, pair: true },
  { key: "Free", w: null, h: null },
];

function btnStyle() {
  return { cursor: "pointer", fontFamily: "inherit", fontSize: "11px", padding: "4px 10px", borderRadius: "6px", background: C.bg2, color: C.text, border: `1px solid ${C.border}` };
}

// Crops `cropBox` (native pixels of the image at sourceImageUrl) and resizes it to
// outW×outH, uploads the result, and resolves to its filename.
export function cropAndUploadPoseImage(sourceImageUrl, cropBox, outW, outH) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = async () => {
      try {
        const outCanvas = document.createElement("canvas");
        outCanvas.width = Math.max(8, Math.round(outW));
        outCanvas.height = Math.max(8, Math.round(outH));
        const octx = outCanvas.getContext("2d");
        octx.drawImage(img, cropBox.x, cropBox.y, cropBox.w, cropBox.h, 0, 0, outCanvas.width, outCanvas.height);
        const blob = await new Promise(res => outCanvas.toBlob(res, "image/png"));
        const filename = await uploadAnnotationBlob(blob, `q21_pose_crop_${Date.now()}.png`);
        resolve(filename);
      } catch (e) { reject(e); }
    };
    img.onerror = () => reject(new Error("Failed to load the source image."));
    img.src = sourceImageUrl;
  });
}

// onCommit(cropBox, ratioLabel) — cropBox is {x,y,w,h} in the SOURCE image's native pixels;
// ratioLabel is the active preset's display key (e.g. "4:5") or "Free". The caller
// (mountPose) is responsible for turning cropBox into an actual uploaded file via
// cropAndUploadPoseImage(), and for seeding the Output Size fields from cropBox.w/h.
export function openPoseCropOverlay(root, sourceImageUrl, initialCropBox, onCommit) {
  const overlay = el("div", { style: {
    position: "absolute", inset: "0", zIndex: "9999", background: "rgba(11,11,11,0.97)",
    borderRadius: "inherit", display: "flex", flexDirection: "column", padding: "12px", gap: "8px", boxSizing: "border-box",
  }});

  const hdr = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" } });
  hdr.appendChild(el("div", { text: "Crop the pose image — drag the yellow box/handles", style: { color: "#fff", fontSize: "13px", fontWeight: "700", flex: "1" } }));
  const cancelBtn = el("button", { type: "button", text: "Cancel", style: btnStyle() });
  const applyBtn = el("button", { type: "button", text: "✓ Apply Crop", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "12px", padding: "6px 14px", borderRadius: "6px",
    background: C.brand, color: "#fff", border: "none", fontWeight: "700",
  }});
  hdr.appendChild(cancelBtn); hdr.appendChild(applyBtn);
  overlay.appendChild(hdr);

  // ── Aspect-ratio preset toolbar ────────────────────────────────────────────
  const ratioBar = el("div", { style: { display: "flex", alignItems: "center", gap: "6px", flexShrink: "0", flexWrap: "wrap" } });
  const ratioBtns = {};
  let setActiveRatio = () => {}; // reassigned once img.onload sets up box/render
  RATIO_PRESETS.forEach(p => {
    const b = el("button", { type: "button", text: p.key, style: btnStyle() });
    b.addEventListener("click", () => setActiveRatio(p.key));
    ratioBtns[p.key] = b;
    ratioBar.appendChild(b);
  });
  overlay.appendChild(ratioBar);

  const canvasWrap = el("div", { style: {
    flex: "1", position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
  }});
  overlay.appendChild(canvasWrap);

  const img = new Image();
  img.onload = () => {
    const maxW = canvasWrap.clientWidth || 640, maxH = canvasWrap.clientHeight || 480;
    const scale = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
    const dispW = Math.round(img.naturalWidth * scale), dispH = Math.round(img.naturalHeight * scale);
    const toDisp = scale; // natural -> display

    const stage = el("div", { style: { position: "relative", width: `${dispW}px`, height: `${dispH}px` } });
    stage.appendChild(el("img", { src: sourceImageUrl, style: { position: "absolute", inset: "0", width: `${dispW}px`, height: `${dispH}px`, borderRadius: "6px", userSelect: "none", pointerEvents: "none" } }));
    canvasWrap.appendChild(stage);

    // Crop box lives in NATIVE pixel coordinates — converted to display coords only for
    // rendering, so re-editing the same image later restores an exact box regardless of
    // how large the overlay happens to render.
    let box = (initialCropBox && initialCropBox.w > 0 && initialCropBox.h > 0)
      ? { ...initialCropBox }
      : { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };

    const boxEl = el("div", { style: {
      position: "absolute", border: `2px solid ${YELLOW}`, boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
      cursor: "move", boxSizing: "border-box",
    }});
    stage.appendChild(boxEl);

    // ── Aspect-ratio lock — a preset fixes activeRatio (w/h); resizing then keeps that
    // ratio instead of the free-form per-handle math below. Paired presets (2:3/3:2 etc.)
    // show a landscape/portrait switch next to the box — user: "노란색 박스 옆에 ⇔ ⇕
    // 이렇게 전환 스위치가 있어서 가로 비율과 세로 비율을 직관적으로 보면서 변경".
    let activeRatio = null; // number (w/h) or null = Free
    let activeRatioKey = "Free"; // display label, e.g. "4:5" — exposed via onCommit for the size text
    let pairLandscape = null, pairPortrait = null; // the two orientations of the current pair
    let pairLandscapeLabel = null, pairPortraitLabel = null;
    const orientBar = el("div", { style: { position: "absolute", display: "none", gap: "4px", zIndex: "3" } });
    const wideBtn = el("button", { type: "button", text: "⇔", title: "Landscape (wide)", style: {
      width: "24px", height: "24px", borderRadius: "4px", border: "none", cursor: "pointer", fontSize: "13px",
    }});
    const tallBtn = el("button", { type: "button", text: "⇕", title: "Portrait (tall)", style: {
      width: "24px", height: "24px", borderRadius: "4px", border: "none", cursor: "pointer", fontSize: "13px",
    }});
    orientBar.appendChild(wideBtn); orientBar.appendChild(tallBtn);
    stage.appendChild(orientBar);
    function highlightOrientBtns() {
      const isWide = activeRatio === pairLandscape;
      wideBtn.style.background = isWide ? C.brand : C.bg2; wideBtn.style.color = isWide ? "#fff" : C.text;
      tallBtn.style.background = !isWide ? C.brand : C.bg2; tallBtn.style.color = !isWide ? "#fff" : C.text;
    }
    wideBtn.addEventListener("click", e => { e.stopPropagation(); if (pairLandscape) { activeRatio = pairLandscape; activeRatioKey = pairLandscapeLabel; highlightOrientBtns(); resizeBoxToRatio(); } });
    tallBtn.addEventListener("click", e => { e.stopPropagation(); if (pairPortrait) { activeRatio = pairPortrait; activeRatioKey = pairPortraitLabel; highlightOrientBtns(); resizeBoxToRatio(); } });

    function highlightRatioBtn(key) {
      Object.entries(ratioBtns).forEach(([k, b]) => {
        b.style.background = k === key ? C.brand : C.bg2;
        b.style.color = k === key ? "#fff" : C.text;
      });
    }
    function resizeBoxToRatio() {
      if (activeRatio) {
        const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
        let newW = box.w, newH = newW / activeRatio;
        if (newH > img.naturalHeight) { newH = img.naturalHeight; newW = newH * activeRatio; }
        if (newW > img.naturalWidth)  { newW = img.naturalWidth;  newH = newW / activeRatio; }
        box = { x: cx - newW / 2, y: cy - newH / 2, w: newW, h: newH };
      }
      render();
    }
    setActiveRatio = (key) => {
      const preset = RATIO_PRESETS.find(p => p.key === key);
      if (!preset) return;
      if (!preset.w) {
        activeRatio = null; activeRatioKey = "Free"; pairLandscape = pairPortrait = null;
        orientBar.style.display = "none";
        highlightRatioBtn("Free"); render(); return;
      }
      activeRatio = preset.w / preset.h; activeRatioKey = key;
      if (preset.pair) {
        pairPortrait = preset.w / preset.h; pairPortraitLabel = key;
        pairLandscape = preset.h / preset.w; pairLandscapeLabel = key.split(":").reverse().join(":");
        orientBar.style.display = "flex"; highlightOrientBtns();
      } else {
        pairLandscape = pairPortrait = null; orientBar.style.display = "none";
      }
      highlightRatioBtn(key);
      resizeBoxToRatio();
    };
    highlightRatioBtn("Free");

    const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
    const handleEls = {};
    HANDLES.forEach(h => {
      const cursorMap = { n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize" };
      const he = el("div", { style: {
        position: "absolute", width: `${HANDLE_SIZE}px`, height: `${HANDLE_SIZE}px`, background: YELLOW,
        border: "1px solid #000", borderRadius: "2px", cursor: cursorMap[h], zIndex: "2",
      }});
      handleEls[h] = he;
      stage.appendChild(he);
    });

    function clampBox() {
      box.w = Math.max(16, Math.min(box.w, img.naturalWidth));
      box.h = Math.max(16, Math.min(box.h, img.naturalHeight));
      if (activeRatio) {
        // Re-deriving one dimension from the other independently (like the free-form
        // clamp below) would drift off the locked ratio near the image's edges — clamp by
        // area instead so both dimensions shrink together and the ratio stays exact.
        if (box.w / box.h > activeRatio) box.w = box.h * activeRatio; else box.h = box.w / activeRatio;
      }
      box.x = Math.max(0, Math.min(box.x, img.naturalWidth - box.w));
      box.y = Math.max(0, Math.min(box.y, img.naturalHeight - box.h));
    }

    function render() {
      clampBox();
      const dx = box.x * toDisp, dy = box.y * toDisp, dw = box.w * toDisp, dh = box.h * toDisp;
      boxEl.style.left = `${dx}px`; boxEl.style.top = `${dy}px`; boxEl.style.width = `${dw}px`; boxEl.style.height = `${dh}px`;
      const mid = (a, b) => (a + b) / 2 - HANDLE_SIZE / 2;
      const pos = {
        nw: [dx - HANDLE_SIZE / 2, dy - HANDLE_SIZE / 2], ne: [dx + dw - HANDLE_SIZE / 2, dy - HANDLE_SIZE / 2],
        sw: [dx - HANDLE_SIZE / 2, dy + dh - HANDLE_SIZE / 2], se: [dx + dw - HANDLE_SIZE / 2, dy + dh - HANDLE_SIZE / 2],
        n: [mid(dx, dx + dw), dy - HANDLE_SIZE / 2], s: [mid(dx, dx + dw), dy + dh - HANDLE_SIZE / 2],
        w: [dx - HANDLE_SIZE / 2, mid(dy, dy + dh)], e: [dx + dw - HANDLE_SIZE / 2, mid(dy, dy + dh)],
      };
      HANDLES.forEach(h => { handleEls[h].style.left = `${pos[h][0]}px`; handleEls[h].style.top = `${pos[h][1]}px`; });
      orientBar.style.left = `${dx + dw + 6}px`; orientBar.style.top = `${dy}px`;
    }
    render();

    // ── Drag to move the whole box ──────────────────────────────────────────
    boxEl.addEventListener("pointerdown", e => {
      e.stopPropagation();
      boxEl.setPointerCapture(e.pointerId);
      const start = { x: e.clientX, y: e.clientY, bx: box.x, by: box.y };
      const move = e2 => {
        box.x = start.bx + (e2.clientX - start.x) / toDisp;
        box.y = start.by + (e2.clientY - start.y) / toDisp;
        render();
      };
      const up = () => { boxEl.removeEventListener("pointermove", move); boxEl.removeEventListener("pointerup", up); };
      boxEl.addEventListener("pointermove", move); boxEl.addEventListener("pointerup", up);
    });

    // ── Drag a handle to resize ──────────────────────────────────────────────
    HANDLES.forEach(h => {
      handleEls[h].addEventListener("pointerdown", e => {
        e.stopPropagation();
        handleEls[h].setPointerCapture(e.pointerId);
        // Named mx/my (not x/y) — the box itself already has x/y keys, and a plain
        // `{ x: e.clientX, ...box }` spread let box.x silently clobber the mouse's
        // start position, making the drag delta compare mouse-screen-coords against
        // natural-image-pixel-coords (garbage math, box didn't track the cursor at all).
        const start = { mx: e.clientX, my: e.clientY, x: box.x, y: box.y, w: box.w, h: box.h };
        // Fixed anchor point (the opposite corner/edge) for ratio-locked resizing — the
        // box grows/shrinks from here so the ratio stays exact instead of drifting per-axis.
        const anchor = {
          x: h.includes("w") ? start.x + start.w : start.x,
          y: h.includes("n") ? start.y + start.h : start.y,
        };
        const move = e2 => {
          const ddx = (e2.clientX - start.mx) / toDisp, ddy = (e2.clientY - start.my) / toDisp;
          if (activeRatio) {
            // Resize from the fixed anchor (opposite corner/edge) so the locked ratio
            // stays exact. n/s edge handles are driven purely by vertical mouse movement
            // (width follows via the ratio); e/w purely by horizontal; corners by
            // horizontal. The non-driven axis on an edge handle stays pinned to the
            // anchor — it isn't under the user's control on that handle. rawW/rawH follow
            // the SAME start.w±ddx / start.h±ddy math as the free-mode branch below (not
            // just |ddx|/|ddy| from zero) — otherwise the box's actual current size never
            // factors in and every drag snaps it to a tiny box near the cursor.
            // Placement uses the HANDLE's own direction (h.includes("n"/"w")), not the
            // sign of raw{W,H} — anchor.y for an "n" handle is already the OPPOSITE
            // (bottom) edge, so a sign-based ternary snapped the box's top edge straight
            // to that bottom anchor on every normal (non-flipped) drag. Same bug for "w".
            let newW, newH;
            if (h === "n" || h === "s") {
              const rawH = h.includes("n") ? start.h - ddy : start.h + ddy;
              newH = Math.max(8, Math.abs(rawH)); newW = newH * activeRatio;
              const y = h.includes("n") ? anchor.y - newH : anchor.y;
              box = { x: anchor.x, y, w: newW, h: newH };
            } else {
              const rawW = h.includes("w") ? start.w - ddx : start.w + ddx;
              newW = Math.max(8, Math.abs(rawW)); newH = newW / activeRatio;
              const x = h.includes("w") ? anchor.x - newW : anchor.x;
              const y = h.includes("n") ? anchor.y - newH : anchor.y;
              box = { x, y, w: newW, h: newH };
            }
            render();
            return;
          }
          let { x, y, w, h: bh } = start;
          if (h.includes("e")) w = start.w + ddx;
          if (h.includes("s")) bh = start.h + ddy;
          if (h.includes("w")) { x = start.x + ddx; w = start.w - ddx; }
          if (h.includes("n")) { y = start.y + ddy; bh = start.h - ddy; }
          box = { x, y, w, h: bh };
          render();
        };
        const up = () => { handleEls[h].removeEventListener("pointermove", move); handleEls[h].removeEventListener("pointerup", up); };
        handleEls[h].addEventListener("pointermove", move); handleEls[h].addEventListener("pointerup", up);
      });
    });

    applyBtn.onclick = () => {
      clampBox();
      onCommit({ x: box.x, y: box.y, w: box.w, h: box.h }, activeRatioKey);
      overlay.remove();
    };
  };
  img.src = sourceImageUrl;

  cancelBtn.onclick = () => overlay.remove();
  root.appendChild(overlay);
  return overlay;
}

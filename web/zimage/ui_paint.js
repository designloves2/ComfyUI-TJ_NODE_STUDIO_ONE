// ui_paint.js — PAINT mode: Inpaint / Outpaint (Sketch removed)
import { C, el, clear } from "./core.js";
import { panel, label, button, slider, numberField, row, col } from "./ui_common.js";
import { uploadImage, uploadDataURL } from "./api.js";
import { buildInpaintGraph, buildOutpaintGraph } from "./graph_builder.js";
import { mountLoraSection } from "./ui_lora_section.js";
import { createImageUpload } from "./ui_image_upload.js";
import { createPaintCanvas, paintToolbar } from "./ui_paint_canvas.js";

const SUB = [{ key:"inpaint", label:"Inpaint" }, { key:"outpaint", label:"Outpaint" }];

function subPillBar(active, onSelect) {
  return el("div", { style:{ display:"flex", gap:"4px", marginBottom:"4px" } },
    SUB.map(t => {
      const a = t.key === active;
      return el("button", { text:t.label, type:"button", style:{
        cursor:"pointer", fontFamily:"inherit", fontSize:"11px", padding:"4px 10px", borderRadius:"14px",
        background:a?C.lime:C.bg2, color:"#ffffff", border:`1px solid ${a?C.lime:C.border}`, fontWeight:a?"700":"400",
      }, onclick:()=>onSelect(t.key) });
    })
  );
}

export function mountPaintLeft(leftEl, state, ctx) {
  const wrap = el("div", { style:{ display:"flex", flexDirection:"column", gap:"6px" }});
  leftEl.appendChild(wrap);
  const subTabEl = el("div");
  const subBodyEl = el("div");
  let maskCanvas = null;
  let handle = null;

  function openCanvasOverlay(pc, title, onDone, imgW, imgH) {
    const rootEl = ctx.rootEl; if (!rootEl) return;

    // Compute actual available canvas area
    const rootW = rootEl.clientWidth  || 956;
    const rootH = rootEl.clientHeight || 900;
    const avW = rootW - 24;           // 2×PAD
    const avH = rootH - 50 - 50 - 20; // topRow + toolRow + padding

    // Fit original image AR into available area
    const imgAR = imgW / imgH;
    const avAR  = avW / avH;
    let dW, dH;
    if (imgAR > avAR) { dW = avW; dH = Math.round(avW / imgAR); }
    else               { dH = avH; dW = Math.round(avH * imgAR); }

    const ov = el("div", { style:{
      position:"absolute", inset:"0", zIndex:"9999",
      background:"rgba(11,11,11,0.97)", borderRadius:"inherit",
      display:"flex", flexDirection:"column", padding:"12px", gap:"8px", boxSizing:"border-box",
    }});
    const topRow = el("div", { style:{ display:"flex", alignItems:"center", gap:"8px", flexShrink:"0" }});
    topRow.appendChild(el("div", { text:title, style:{ color:C.lime, fontSize:"13px", fontWeight:"700", flex:"1" }}));
    const doneBtn = button("✓ Done", () => { rootEl.removeChild(ov); onDone?.(); }, "primary");
    topRow.appendChild(doneBtn);

    // Canvas container: flex-center, fills available space
    const canvasArea = el("div", { style:{
      flex:"1", display:"flex", alignItems:"center", justifyContent:"center",
      overflow:"hidden", minHeight:"0", background:"#111",
    }});

    // Set explicit size on stage so image is never stretched
    pc.stage.style.width  = dW + "px";
    pc.stage.style.height = dH + "px";
    pc.stage.style.flex   = "";
    pc.stage.style.maxWidth  = "";
    pc.stage.style.maxHeight = "";
    canvasArea.appendChild(pc.stage);

    const toolRow = el("div", { style:{ flexShrink:"0" }});
    toolRow.appendChild(paintToolbar(pc, { mode:"mask" }));

    ov.appendChild(topRow);
    ov.appendChild(canvasArea);
    ov.appendChild(toolRow);
    rootEl.appendChild(ov);
  }

  // ── Create thumbnail with mask overlay ───────────────────────────────
  // Composite thumbnail maintaining original aspect ratio (letterbox in 192×192)
  function composeThumbnail(srcURL, overlayDataURL, imgEl) {
    const BOX = 192;
    const src = new Image();
    src.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = BOX; canvas.height = BOX;
      const ctx2 = canvas.getContext("2d");
      ctx2.fillStyle = "#000"; ctx2.fillRect(0, 0, BOX, BOX);
      const ar = (src.naturalWidth || 1) / (src.naturalHeight || 1);
      let dw = BOX, dh = BOX;
      if (ar > 1) dh = Math.round(BOX / ar);
      else        dw = Math.round(BOX * ar);
      const ox = Math.round((BOX - dw) / 2);
      const oy = Math.round((BOX - dh) / 2);
      ctx2.drawImage(src, ox, oy, dw, dh);
      const ov = new Image();
      ov.onload = () => {
        ctx2.globalAlpha = 0.55;
        ctx2.drawImage(ov, ox, oy, dw, dh);
        ctx2.globalAlpha = 1;
        imgEl.src = canvas.toDataURL();
      };
      ov.src = overlayDataURL;
    };
    src.src = srcURL;
  }

  function renderSub() {
    clear(subTabEl); clear(subBodyEl);
    maskCanvas = null;
    subTabEl.appendChild(subPillBar(state.paintSub, key => {
      state.paintSub = key; ctx.persist(); renderSub();
    }));

    if (state.paintSub === "inpaint") {
      // Image upload with mask overlay support
      const upWrap = el("div", { style:{ display:"flex", justifyContent:"center" }});
      const thumbEl = el("img", { style:{
        width:"192px", height:"192px", borderRadius:"10px",
        border:`1px solid ${C.border}`, background:"#000", objectFit:"contain",
        cursor:"pointer", display: state.inpaintImage ? "block" : "none",
      }});
      if (state.inpaintImage) {
        if (state.inpaintMaskOverlay) {
          // Show composited thumbnail (image + mask)
          composeThumbnail(
            `/view?filename=${encodeURIComponent(state.inpaintImage)}&type=input`,
            state.inpaintMaskOverlay, thumbEl
          );
        } else {
          thumbEl.src = `/view?filename=${encodeURIComponent(state.inpaintImage)}&type=input`;
        }
      }
      const hintEl = el("div", { text:"Source Image\nClick to upload", style:{
        width:"192px", height:"192px", borderRadius:"10px", border:`1px solid ${C.border}`,
        background:"#000", display:state.inpaintImage?"none":"flex",
        alignItems:"center", justifyContent:"center", color:C.muted,
        fontSize:"12px", textAlign:"center", whiteSpace:"pre", cursor:"pointer",
      }});
      const fi = el("input", { type:"file", accept:"image/*", style:{ display:"none" }});
      fi.addEventListener("change", async () => {
        const f = fi.files[0]; if (!f) return;
        const name = await uploadImage(f);
        state.inpaintImage = name;
        state.inpaintMaskImage = null;
        state.inpaintMaskOverlay = null;
        ctx.persist();
        thumbEl.src = `/view?filename=${encodeURIComponent(name)}&type=input`;
        thumbEl.style.display = "block"; hintEl.style.display = "none";
        maskCanvas = null;
      });
      [thumbEl, hintEl].forEach(el2 => el2.addEventListener("click", () => fi.click()));
      upWrap.appendChild(thumbEl); upWrap.appendChild(hintEl); upWrap.appendChild(fi);

      // Cap long-edge to 1536 (Z-Image Turbo optimal), keep ratio, ensure divisible by 8
      function capEdit(w, h) {
        const maxEdge = 1536;
        const long = Math.max(w, h);
        const scale = long > maxEdge ? maxEdge / long : 1;
        return {
          w: Math.max(8, Math.round(w * scale / 8) * 8),
          h: Math.max(8, Math.round(h * scale / 8) * 8),
        };
      }

      // Paint Mask button
      const maskBtn = button("🖌 Paint Mask", async () => {
        if (!state.inpaintImage) { ctx.showPopup?.("Upload an image first."); return; }
        const img = new Image();
        img.onload = () => {
          const { w: eW, h: eH } = capEdit(img.naturalWidth || 1024, img.naturalHeight || 1024);
          state.inpaintEditW = eW; state.inpaintEditH = eH; ctx.persist();
          maskCanvas = createPaintCanvas({
            mode:"mask", width:eW, height:eH,
            baseImageURL:`/view?filename=${encodeURIComponent(state.inpaintImage)}&type=input`,
            existingMask: state.inpaintMaskOverlay || null,
          });
          openCanvasOverlay(maskCanvas, "Paint Mask — red = regenerate area", async () => {
            const overlay = maskCanvas.exportOverlayDataURL();
            state.inpaintMaskOverlay = overlay;
            state.inpaintMaskImage = await uploadDataURL(maskCanvas.exportMaskDataURL(), "mask.png");
            ctx.persist();
            composeThumbnail(`/view?filename=${encodeURIComponent(state.inpaintImage)}&type=input`, overlay, thumbEl);
            thumbEl.style.display = "block"; hintEl.style.display = "none";
          }, eW, eH);
        };
        img.onerror = () => {
          const eW = 1024, eH = 1024;
          state.inpaintEditW = eW; state.inpaintEditH = eH; ctx.persist();
          maskCanvas = createPaintCanvas({ mode:"mask", width:eW, height:eH,
            baseImageURL:`/view?filename=${encodeURIComponent(state.inpaintImage)}&type=input`,
            existingMask: state.inpaintMaskOverlay || null,
          });
          openCanvasOverlay(maskCanvas, "Paint Mask — red = regenerate area", async () => {
            const overlay = maskCanvas.exportOverlayDataURL();
            state.inpaintMaskOverlay = overlay;
            state.inpaintMaskImage = await uploadDataURL(maskCanvas.exportMaskDataURL(), "mask.png");
            ctx.persist();
            composeThumbnail(`/view?filename=${encodeURIComponent(state.inpaintImage)}&type=input`, overlay, thumbEl);
            thumbEl.style.display="block"; hintEl.style.display="none";
          }, eW, eH);
        };
        img.src = `/view?filename=${encodeURIComponent(state.inpaintImage)}&type=input`;
      });

      subBodyEl.appendChild(panel([
        label("Source Image"), upWrap, maskBtn,
        label("Denoise"),
        slider(0.1,1,0.01,state.inpaintDenoise,v=>{state.inpaintDenoise=v;ctx.persist();},v=>v.toFixed(2)),
        label("Feather px"),
        slider(0,128,1,state.inpaintFeather,v=>{state.inpaintFeather=v;ctx.persist();},v=>String(v)),
      ]));
      handle = {
        beforeGenerate: async () => {
          if (!state.inpaintImage) throw new Error("Upload a source image.");
          if (!state.inpaintMaskImage) throw new Error("Paint a mask first.");
        },
        getGraph() { return buildInpaintGraph(state); },
        getSourceURL() { return state.inpaintImage ? `/view?filename=${encodeURIComponent(state.inpaintImage)}&type=input` : null; },
      };

    } else { // outpaint
      const up = createImageUpload({
        label:"Source Image",
        initialFilename:state.outpaintImage,
        onUpload:async f=>{ const n=await uploadImage(f); state.outpaintImage=n; ctx.persist(); return n; },
      });
      const px = (lbl, key) => col([label(lbl), numberField(state[key], v=>{ state[key]=Math.max(0,v); ctx.persist(); }, 64)]);
      subBodyEl.appendChild(panel([
        label("Source Image"), up.el,
        label("Expand pixels (0 = no expand)"),
        row([px("Top","outpaintUp"), px("Bottom","outpaintDown")]),
        row([px("Left","outpaintLeft"), px("Right","outpaintRight")]),
        label("Feather px"),
        slider(0,256,4,state.outpaintFeather,v=>{state.outpaintFeather=v;ctx.persist();},v=>String(v)),
      ]));
      handle = {
        beforeGenerate:async()=>{
          if (!state.outpaintImage) throw new Error("Upload a source image.");
          const t=(state.outpaintUp||0)+(state.outpaintDown||0)+(state.outpaintLeft||0)+(state.outpaintRight||0);
          if (t<=0) throw new Error("Set at least one expansion value > 0.");
        },
        getGraph(){ return buildOutpaintGraph(state); },
        getSourceURL(){ return null; }, // outpaint doesn't use compare
      };
    }
  }

  wrap.appendChild(subTabEl);
  wrap.appendChild(subBodyEl);
  renderSub();
  mountLoraSection(wrap, state, ctx);

  return {
    beforeGenerate:async()=>{ await handle?.beforeGenerate?.(); },
    getGraph(){ return handle?.getGraph(); },
    getSourceURL(){ return handle?.getSourceURL?.(); },
  };
}

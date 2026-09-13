// ui_image_upload.js — shared image upload box for Qwen Image Edit 2511 ONE (TJ).
//
// Before this file existed, ui_i2i_qe.js, ui_edit_qe.js, ui_faceswap_qe.js,
// ui_inpaint_qe.js, ui_upscale_qe.js and ui_angle_qe.js each hand-rolled their own
// near-identical copy of this box — which is why this tool's image-loading cards didn't
// get the "🖼 Load from gallery" button when Klein/Z-Image/SDXL did: there was no single
// place to add it. One real factory now, matching Klein's/Z-Image's own
// ui_image_upload.js shape, used by all six.
import { C, el } from "./core_qwen2511.js";
import { openImageGalleryPicker } from "../shared/ui_image_gallery_picker.js";

export function createImageUpload(labelText, initialFile, onUpload,
  { box: BOX = 192, maxPixels = null, onLoad = null, onClear = null } = {}) {
  const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "4px", alignItems: "center" } });
  const box = el("div", { style: {
    width: `${BOX}px`, height: `${BOX}px`, background: "#000", borderRadius: "10px",
    border: `1px solid ${C.border}`, position: "relative", cursor: "pointer",
    flexShrink: "0", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
  }});
  const hint = el("div", { text: `${labelText}\nClick or drag to upload`, style: {
    color: C.muted, fontSize: "12px", textAlign: "center", whiteSpace: "pre", pointerEvents: "none" } });
  const img = el("img", { style: {
    position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "contain",
    pointerEvents: "none", display: "none" } });
  const warnEl = maxPixels ? el("div", { style: {
    fontSize: "10px", color: C.warn || "#ffb347", textAlign: "center", display: "none", marginTop: "2px" } }) : null;
  img.addEventListener("load", () => {
    const w = img.naturalWidth, h = img.naturalHeight;
    if (onLoad && w > 0) onLoad(w, h);
    if (!maxPixels || !warnEl) return;
    const px = w * h;
    if (px > maxPixels) {
      const mp = (px / 1e6).toFixed(1), maxMp = (maxPixels / 1e6).toFixed(0);
      warnEl.textContent = `⚠ ${w}×${h} (${mp}MP) exceeds model max ~${maxMp}MP — adjust size below.`;
      warnEl.style.display = "block";
    } else warnEl.style.display = "none";
  });

  const clearBtn = onClear ? el("button", { type: "button", text: "✕", title: "Clear", style: {
    position: "absolute", top: "4px", right: "4px", zIndex: "3",
    background: "rgba(0,0,0,0.65)", color: "#fff", border: "none", borderRadius: "4px",
    width: "20px", height: "20px", cursor: "pointer", fontSize: "11px", padding: "0", display: "none",
  }}) : null;

  let currentFile = null;
  function setFilename(name) {
    currentFile = name;
    if (name) {
      img.src = `/view?filename=${encodeURIComponent(name)}&type=input&t=${Date.now()}`;
      img.style.display = "block"; hint.style.display = "none";
      if (clearBtn) clearBtn.style.display = "block";
    } else {
      img.style.display = "none"; hint.style.display = "";
      if (warnEl) warnEl.style.display = "none";
      if (clearBtn) clearBtn.style.display = "none";
    }
  }

  // Bottom-left, same spot/style every other ONE STUDIO tool's image slots use for this —
  // pick an image from any tool's gallery (or the shared INPUT/OUTPUT folders) instead of
  // only a local file. uploadImage() (api_qwen2511.js) passes a string straight through
  // unchanged, so each call site's own onUpload (upload then set state) works for a
  // gallery pick too, with no call-site changes needed.
  const galleryBtn = el("button", { type: "button", text: "🖼", title: "Load from gallery", style: {
    position: "absolute", bottom: "4px", left: "4px", zIndex: "2",
    background: "rgba(0,0,0,0.65)", color: "#fff", border: "none", borderRadius: "4px",
    width: "22px", height: "22px", fontSize: "12px", cursor: "pointer", padding: "0",
  }});
  galleryBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openImageGalleryPicker(async (filename) => {
      const n = await onUpload(filename);
      setFilename(n);
    });
  });

  box.append(hint, img);
  if (clearBtn) box.appendChild(clearBtn);
  box.appendChild(galleryBtn);
  wrap.appendChild(box);
  if (warnEl) wrap.appendChild(warnEl);

  const inp = el("input", { type: "file", accept: "image/*", style: { display: "none" } });
  wrap.appendChild(inp);
  inp.addEventListener("change", async () => {
    if (inp.files[0]) { const n = await onUpload(inp.files[0]); setFilename(n); inp.value = ""; }
  });
  box.addEventListener("click", (e) => {
    if ((clearBtn && e.target === clearBtn) || e.target === galleryBtn) return;
    inp.click();
  });
  if (clearBtn) clearBtn.addEventListener("click", (e) => { e.stopPropagation(); setFilename(null); onClear(); });
  box.addEventListener("dragover", e => { e.preventDefault(); box.style.borderColor = C.lime; });
  box.addEventListener("dragleave", () => { box.style.borderColor = C.border; });
  box.addEventListener("drop", async e => {
    e.preventDefault(); box.style.borderColor = C.border;
    const f = e.dataTransfer.files[0]; if (f) { const n = await onUpload(f); setFilename(n); }
  });
  setFilename(initialFile);

  return { el: wrap, setFilename, getFilename: () => currentFile };
}

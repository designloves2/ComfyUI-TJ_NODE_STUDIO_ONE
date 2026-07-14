// ui_image_upload.js — shared 256x256 image upload box (long-edge fit, expand popup).
import { C, el } from "./core_klein.js";
import { button } from "./ui_common.js";

export function createImageUpload({ label = "Image", onUpload, initialFilename = null, maxPixels = null, onLoad = null } = {}) {
  const BOX = 192;
  const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "4px", alignItems: "center" } });

  const box = el("div", { style: {
    width: `${BOX}px`, height: `${BOX}px`,
    background: "#000", borderRadius: "10px",
    border: `1px solid ${C.border}`, position: "relative",
    cursor: "pointer", flexShrink: "0",
    display: "flex", alignItems: "center", justifyContent: "center",
    overflow: "hidden",
  }});

  const hint = el("div", { text: label + "\nClick or drag to upload", style: {
    color: C.muted, fontSize: "12px", textAlign: "center",
    whiteSpace: "pre", pointerEvents: "none",
    display: initialFilename ? "none" : "block",
  }});

  const img = el("img", { style: {
    maxWidth: "100%", maxHeight: "100%",
    objectFit: "contain", display: initialFilename ? "block" : "none",
    pointerEvents: "none",
  }});
  if (initialFilename) img.src = `/view?filename=${encodeURIComponent(initialFilename)}&type=input&t=${Date.now()}`;

  // Expand icon (top-right)
  const expandBtn = el("button", { type: "button", text: "⤢", style: {
    position: "absolute", top: "4px", right: "4px",
    background: "rgba(0,0,0,0.65)", color: "#fff", border: "none",
    borderRadius: "4px", width: "22px", height: "22px",
    fontSize: "13px", cursor: "pointer", lineHeight: "22px", padding: "0",
    display: initialFilename ? "block" : "none",
  }});

  expandBtn.addEventListener("click", e => {
    e.stopPropagation();
    if (!img.src) return;
    const ov = el("div", { style: {
      position: "fixed", inset: "0", background: "rgba(0,0,0,0.88)", zIndex: "10001",
      display: "flex", alignItems: "center", justifyContent: "center",
    }});
    const big = el("img", { src: img.src, style: { maxWidth: "90vw", maxHeight: "90vh", borderRadius: "8px", objectFit: "contain" }});
    ov.addEventListener("click", () => document.body.removeChild(ov));
    ov.appendChild(big);
    document.body.appendChild(ov);
  });

  // Resolution warning (shown below box when maxPixels is set and image exceeds limit)
  const warnEl = maxPixels ? el("div", { style: { fontSize: "10px", color: C.warn, textAlign: "center", display: "none" } }) : null;

  function checkResolution() {
    const w = img.naturalWidth, h = img.naturalHeight;
    if (onLoad && w > 0) onLoad(w, h);
    if (!maxPixels || !warnEl) return;
    const px = w * h;
    if (px > 0 && px > maxPixels) {
      const mp = (px / 1_000_000).toFixed(1);
      const maxMp = (maxPixels / 1_000_000).toFixed(0);
      warnEl.textContent = `⚠ ${w}×${h} (${mp}MP) exceeds model max ~${maxMp}MP — adjust size below.`;
      warnEl.style.display = "block";
    } else {
      warnEl.style.display = "none";
    }
  }
  img.addEventListener("load", checkResolution);

  box.appendChild(hint);
  box.appendChild(img);
  box.appendChild(expandBtn);

  const fi = el("input", { type: "file", accept: "image/*", style: { display: "none" }});

  fi.addEventListener("change", async () => {
    const f = fi.files[0]; if (!f) return;
    const name = await onUpload(f);
    img.src = `/view?filename=${encodeURIComponent(name)}&type=input&t=${Date.now()}`;
    img.style.display = "block";
    hint.style.display = "none";
    expandBtn.style.display = "block";
  });

  box.addEventListener("click", () => fi.click());
  box.addEventListener("dragover", e => { e.preventDefault(); box.style.borderColor = C.lime; });
  box.addEventListener("dragleave", () => { box.style.borderColor = C.border; });
  box.addEventListener("drop", async e => {
    e.preventDefault(); box.style.borderColor = C.border;
    const f = e.dataTransfer.files[0]; if (!f) return;
    const name = await onUpload(f); show(name);
  });
  wrap.appendChild(box);
  wrap.appendChild(fi);

  function show(name) {
    if (name) {
      img.src = `/view?filename=${encodeURIComponent(name)}&type=input&t=${Date.now()}`;
      img.style.display = "block";
      hint.style.display = "none";
      expandBtn.style.display = "block";
    } else {
      img.src = "";
      img.style.display = "none";
      hint.style.display = "block";
      expandBtn.style.display = "none";
    }
  }

  if (warnEl) wrap.appendChild(warnEl);

  return {
    el: wrap,
    setFilename(name) { show(name); },
    clearSlot() { show(null); },
  };
}

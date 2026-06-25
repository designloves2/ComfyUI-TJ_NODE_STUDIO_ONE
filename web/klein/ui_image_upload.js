// ui_image_upload.js — shared 256x256 image upload box (long-edge fit, expand popup).
import { C, el } from "./core_klein.js";
import { button } from "./ui_common.js";

export function createImageUpload({ label = "Image", onUpload, initialFilename = null } = {}) {
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

  const hint = el("div", { text: label + "\nClick to upload", style: {
    color: C.muted, fontSize: "12px", textAlign: "center",
    whiteSpace: "pre", pointerEvents: "none",
    display: initialFilename ? "none" : "block",
  }});

  const img = el("img", { style: {
    maxWidth: "100%", maxHeight: "100%",
    objectFit: "contain", display: initialFilename ? "block" : "none",
    pointerEvents: "none",
  }});
  if (initialFilename) img.src = `/view?filename=${encodeURIComponent(initialFilename)}&type=input`;

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

  box.appendChild(hint);
  box.appendChild(img);
  box.appendChild(expandBtn);

  const fi = el("input", { type: "file", accept: "image/*", style: { display: "none" }});

  fi.addEventListener("change", async () => {
    const f = fi.files[0]; if (!f) return;
    const name = await onUpload(f);
    img.src = `/view?filename=${encodeURIComponent(name)}&type=input`;
    img.style.display = "block";
    hint.style.display = "none";
    expandBtn.style.display = "block";
  });

  box.addEventListener("click", () => fi.click());
  wrap.appendChild(box);
  wrap.appendChild(fi);

  return {
    el: wrap,
    setFilename(name) {
      img.src = `/view?filename=${encodeURIComponent(name)}&type=input`;
      img.style.display = "block";
      hint.style.display = "none";
      expandBtn.style.display = "block";
    },
  };
}

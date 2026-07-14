// ui_controlnet_krea2.js — shared ControlNet panel for Krea 2 ONE STUDIO (TJ)
// The control LoRA + processing params are configured globally in ⚙ Settings.
// Each mode (T2I / I2I) only toggles ON/OFF and supplies its own control image.
import { C, el, clear } from "./core_krea2.js";
import { panel, label, row, col } from "../klein/ui_common.js";
import { uploadImage } from "./api_krea2.js";

function ctrlImgUpload(labelText, initialFile, onUpload) {
  const BOX = 192;
  const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "4px", alignItems: "center" } });
  const box = el("div", { style: {
    width: `${BOX}px`, height: `${BOX}px`, background: "#000", borderRadius: "10px",
    border: `1px solid ${C.border}`, position: "relative", cursor: "pointer",
    flexShrink: "0", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
  }});
  const hint = el("div", { text: `${labelText}\nClick or drag to upload`, style: { color: C.muted, fontSize: "12px", textAlign: "center", whiteSpace: "pre", pointerEvents: "none" }});
  const img  = el("img", { style: { position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none", display: "none" }});
  function setFilename(name) {
    if (name) { img.src = `/view?filename=${encodeURIComponent(name)}&type=input&t=${Date.now()}`; img.style.display = "block"; hint.style.display = "none"; }
    else       { img.style.display = "none"; hint.style.display = ""; }
  }
  box.appendChild(hint); box.appendChild(img); wrap.appendChild(box);
  const inp = el("input", { type: "file", accept: "image/*", style: { display: "none" } });
  wrap.appendChild(inp);
  inp.addEventListener("change", async () => { if (inp.files[0]) { const n = await onUpload(inp.files[0]); setFilename(n); inp.value = ""; }});
  box.addEventListener("click", () => inp.click());
  box.addEventListener("dragover", e => { e.preventDefault(); box.style.borderColor = C.lime; });
  box.addEventListener("dragleave", () => { box.style.borderColor = C.border; });
  box.addEventListener("drop", async e => { e.preventDefault(); box.style.borderColor = C.border; const f = e.dataTransfer.files[0]; if (f) { const n = await onUpload(f); setFilename(n); }});
  setFilename(initialFile);
  return { el: wrap, setFilename };
}

// mode: "t2i" | "i2i" — picks the enabled flag + control image state keys
export function mountControlNetSection(wrapEl, state, ctx, mode) {
  const enabledKey = mode === "t2i" ? "t2iControlEnabled" : "i2iControlEnabled";
  const imageKey   = mode === "t2i" ? "t2iControlImage"   : "i2iControlImage";

  const wrap = el("div");
  wrapEl.appendChild(wrap);

  function render() {
    clear(wrap);
    const enabled = state[enabledKey] ?? false;

    const toggleBtn = el("button", { type: "button", text: enabled ? "ON" : "OFF", style: {
      cursor: "pointer", fontFamily: "inherit", fontSize: "10px", padding: "3px 10px",
      borderRadius: "10px", border: "none",
      background: enabled ? C.lime : "#444", color: "#fff", fontWeight: "700",
    }});
    toggleBtn.addEventListener("click", () => { state[enabledKey] = !enabled; ctx.persist(); render(); });

    const header = row([
      el("div", { text: "ControlNet (Krea2 Control LoRA)", style: { color: C.muted, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.04em", flex: "1" } }),
      toggleBtn,
    ]);

    if (!enabled) { wrap.appendChild(panel([header])); return; }

    // Active control LoRA (read-only display; set in ⚙ Settings)
    const lora = state.controlLora || "none";
    const loraInfo = el("div", { style: { fontSize: "11px", color: lora === "none" ? C.warn : C.text, padding: "6px 8px", background: C.bg2, borderRadius: "6px", border: `1px solid ${C.border}` } });
    loraInfo.textContent = lora === "none"
      ? "⚠ No Control LoRA set. Open ⚙ Settings → ControlNet to select one."
      : `LoRA: ${lora}  ·  strength ${(state.controlStrength ?? 1).toFixed(2)}  ·  ${state.controlChannelMode || "rgb"} / ${state.controlNormalize || "none"}${state.controlInvert ? " / invert" : ""}`;

    const hint = el("div", { style: { fontSize: "10px", color: C.muted, marginTop: "2px" } });
    hint.textContent = "Control LoRA & processing params are configured in ⚙ Settings.";

    const { el: ctrlImgEl } = ctrlImgUpload("Control Image", state[imageKey] || null, async f => {
      const name = await uploadImage(f); state[imageKey] = name; ctx.persist(); return name;
    });

    wrap.appendChild(panel([
      header,
      label("Active Control LoRA"), loraInfo, hint,
      label("Control Image"), ctrlImgEl,
    ]));
  }

  // Only the active mode's panel is mounted at a time, so a single hook is enough.
  // Settings refresh calls ctx._rerenderControlNet() to refresh the LoRA info line.
  ctx._rerenderControlNet = render;
  render();
}

// ui_i2i_moss.js — I2I left panel for Moss Image ONE STUDIO (TJ)
//
// MOSS has no reference-image input, so I2I is the classic latent route: the source is scaled to the working size,
// encoded by the VAE and re-noised by DENOISE.
import { C, el } from "./core_moss.js";
import { panel, label, slider, row, col } from "../klein/ui_common.js";
import { createImageUpload } from "../krea2/ui_image_upload.js";
import { uploadImage } from "./api_moss.js";
import { buildI2IGraph } from "./graph_builder_moss.js";
import { mountSharedSettings, mountLoraSectionMoss } from "./ui_t2i_moss.js";

function snap16(v) { return Math.max(64, Math.round(v / 16) * 16); }

export function mountI2ILeft(leftEl, state, ctx) {
  const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } });
  leftEl.appendChild(wrap);

  const fieldStyle = { width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "5px 7px", fontSize: "12px", fontFamily: "inherit", outline: "none" };
  const wIn = el("input", { type: "number", step: "16", min: "64", style: { ...fieldStyle } });
  const hIn = el("input", { type: "number", step: "16", min: "64", style: { ...fieldStyle } });
  if (state.i2iWidth)  wIn.value = state.i2iWidth;
  if (state.i2iHeight) hIn.value = state.i2iHeight;
  let aspect = (state.i2iWidth && state.i2iHeight) ? state.i2iWidth / state.i2iHeight : 1;
  const lockChk = el("input", { type: "checkbox" }); lockChk.checked = state.i2iLockRatio ?? true;
  const lockLbl = el("label", { style: { display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: C.muted, cursor: "pointer", whiteSpace: "nowrap" } }, [lockChk, el("span", { text: "Lock ratio" })]);
  lockChk.addEventListener("change", () => {
    state.i2iLockRatio = lockChk.checked;
    if (lockChk.checked && state.i2iWidth && state.i2iHeight) aspect = state.i2iWidth / state.i2iHeight;
    ctx.persist();
  });
  wIn.addEventListener("change", () => {
    state.i2iWidth = snap16(+wIn.value || 1024); wIn.value = state.i2iWidth;
    if (state.i2iLockRatio && aspect > 0) { state.i2iHeight = snap16(state.i2iWidth / aspect); hIn.value = state.i2iHeight; }
    ctx.persist();
  });
  hIn.addEventListener("change", () => {
    state.i2iHeight = snap16(+hIn.value || 1024); hIn.value = state.i2iHeight;
    if (state.i2iLockRatio && aspect > 0) { state.i2iWidth = snap16(state.i2iHeight * aspect); wIn.value = state.i2iWidth; }
    ctx.persist();
  });

  const { el: uploadEl, setFilename } = createImageUpload("Source Image", state.i2iImage || null, async f => {
    const name = await uploadImage(f);
    state.i2iImage = name; ctx.persist();
    return name;
  }, {
    maxPixels: 4 * 1024 * 1024,   // MOSS-Image works from 0.25M to 4M pixels
    onLoad: (w, h) => { state.i2iWidth = snap16(w); state.i2iHeight = snap16(h); wIn.value = state.i2iWidth; hIn.value = state.i2iHeight; aspect = w / h; ctx.persist(); },
  });
  wrap.appendChild(panel([uploadEl, col([row([col([label("W"), wIn]), col([label("H"), hIn])]), lockLbl])]));

  wrap.appendChild(panel([
    label("Denoise"),
    slider(0, 1, 0.01, state.i2iDenoise ?? 0.6, v => { state.i2iDenoise = v; ctx.persist(); }, v => v.toFixed(2)),
  ]));

  mountSharedSettings(wrap, state, ctx, { resolution: false });
  mountLoraSectionMoss(wrap, state, ctx);

  return {
    getSourceURL: () => state.i2iImage ? `/view?filename=${encodeURIComponent(state.i2iImage)}&type=input` : null,
    async getGraph() { return buildI2IGraph(state); },
    setImage(name) { state.i2iImage = name; setFilename(name); ctx.persist(); },
  };
}

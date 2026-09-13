// ui_i2i_qe.js — I2I left panel for Qwen Image Edit 2511 ONE (TJ)
import { C, el } from "./core_qwen2511.js";
import { panel, label, slider, numberField, select, row, col } from "./ui_common_qe.js";
import { buildI2IGraph } from "./graph_builder_qwen2511.js";
import { mountLoraSectionQE } from "./ui_common_qe.js";
import { uploadImage } from "./api_qwen2511.js";
import { createImageUpload as createImgUpload } from "./ui_image_upload.js";

function snap8(v) { return Math.max(8, Math.round(v / 8) * 8); }

function makeSizeFields(state, ctx) {
  const style = { width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "5px 7px", fontSize: "12px", fontFamily: "inherit", outline: "none" };
  const wIn = el("input", { type: "number", step: "8", min: "64", style: { ...style } });
  const hIn = el("input", { type: "number", step: "8", min: "64", style: { ...style } });
  if (state.i2iWidth)  wIn.value = state.i2iWidth;
  if (state.i2iHeight) hIn.value = state.i2iHeight;
  let aspect = (state.i2iWidth && state.i2iHeight) ? state.i2iWidth / state.i2iHeight : 1;
  const lockChk = el("input", { type: "checkbox" }); lockChk.checked = state.i2iLockRatio ?? true;
  const lockLbl = el("label", { style: { display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: C.muted, cursor: "pointer", whiteSpace: "nowrap" } }, [lockChk, el("span", { text: "🔒 Lock ratio" })]);
  lockChk.addEventListener("change", () => { state.i2iLockRatio = lockChk.checked; if (lockChk.checked && state.i2iWidth && state.i2iHeight) aspect = state.i2iWidth / state.i2iHeight; ctx.persist(); });
  wIn.addEventListener("change", () => { state.i2iWidth = snap8(+wIn.value||512); wIn.value = state.i2iWidth; if (state.i2iLockRatio && aspect > 0) { state.i2iHeight = snap8(state.i2iWidth / aspect); hIn.value = state.i2iHeight; } else if (state.i2iHeight) aspect = state.i2iWidth / state.i2iHeight; ctx.persist(); });
  hIn.addEventListener("change", () => { state.i2iHeight = snap8(+hIn.value||512); hIn.value = state.i2iHeight; if (state.i2iLockRatio && aspect > 0) { state.i2iWidth = snap8(state.i2iHeight * aspect); wIn.value = state.i2iWidth; } else if (state.i2iWidth) aspect = state.i2iWidth / state.i2iHeight; ctx.persist(); });
  return { wIn, hIn, setAspect: a => { aspect = a; }, el: col([row([col([label("W"), wIn]), col([label("H"), hIn])]), lockLbl]) };
}

export function mountI2ILeft(leftEl, state, ctx) {
  const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } });
  leftEl.appendChild(wrap);

  const { wIn, hIn, setAspect, el: sizeEl } = makeSizeFields(state, ctx);

  const { el: uploadEl, setFilename } = createImgUpload("Source Image", state.i2iImage || null, async f => {
    const name = await uploadImage(f);
    state.i2iImage = name; ctx.persist();
    return name;
  }, {
    maxPixels: 1280 * 1280, // QE2511 (Qwen) recommended max ~1.6MP (1280×1280)
    onLoad: (w, h) => { state.i2iWidth = snap8(w); state.i2iHeight = snap8(h); wIn.value = state.i2iWidth; hIn.value = state.i2iHeight; setAspect(w / h); ctx.persist(); },
  });
  wrap.appendChild(panel([uploadEl, sizeEl]));

  wrap.appendChild(panel([
    label("Denoise"),
    slider(0, 1, 0.01, state.i2iDenoise ?? 0.75, v => { state.i2iDenoise = v; ctx.persist(); }, v => v.toFixed(2)),
  ]));
  wrap.appendChild(panel([
    row([
      col([label("Steps"), numberField(state.steps ?? 20, v => { state.steps = v; ctx.persist(); }, 1)]),
      col([label("CFG"),   numberField(state.cfg   ?? 4,  v => { state.cfg   = v; ctx.persist(); }, 0.1)]),
    ]),
    row([
      col([label("Sampler"),   select(["euler","euler_ancestral","er_sde","heun","dpm_pp_2m"], state.sampler   || "euler", v => { state.sampler   = v; ctx.persist(); })]),
      col([label("Scheduler"), select(["simple","normal","karras","exponential","sgm_uniform","beta"],        state.scheduler || "simple", v => { state.scheduler = v; ctx.persist(); })]),
    ]),
  ]));

  mountLoraSectionQE(wrap, state, ctx);

  return {
    getSourceURL: () => state.i2iImage ? `/view?filename=${encodeURIComponent(state.i2iImage)}&type=input` : null,
    async getGraph() { return buildI2IGraph(state); },
    setImage(name) { state.i2iImage = name; setFilename(name); ctx.persist(); },
  };
}

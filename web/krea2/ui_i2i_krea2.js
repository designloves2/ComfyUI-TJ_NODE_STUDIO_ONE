// ui_i2i_krea2.js — I2I left panel for Krea 2 ONE STUDIO (TJ)
import { C, el, SAMPLERS, SCHEDULERS } from "./core_krea2.js";
import { panel, label, slider, numberField, select, row, col } from "../klein/ui_common.js";

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
import { buildI2IGraph } from "./graph_builder_krea2.js";
import { uploadImage } from "./api_krea2.js";
import { mountLoraSectionKrea2 } from "./ui_t2i_krea2.js";
import { mountControlNetSection } from "./ui_controlnet_krea2.js";

function createImgUpload(labelText, initialFile, onUpload, { maxPixels = null, onLoad = null } = {}) {
  const BOX = 192;
  const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "4px", alignItems: "center" } });
  const box = el("div", { style: {
    width: `${BOX}px`, height: `${BOX}px`, background: "#000", borderRadius: "10px",
    border: `1px solid ${C.border}`, position: "relative", cursor: "pointer",
    flexShrink: "0", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
  }});
  const hint = el("div", { text: `${labelText}\nClick or drag to upload`, style: { color: C.muted, fontSize: "12px", textAlign: "center", whiteSpace: "pre", pointerEvents: "none" }});
  const img  = el("img", { style: { position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }});
  const warnEl = maxPixels ? el("div", { style: { fontSize: "10px", color: C.warn || "#ffb347", textAlign: "center", display: "none", marginTop: "2px" } }) : null;
  img.addEventListener("load", () => {
    const w = img.naturalWidth, h = img.naturalHeight;
    if (onLoad && w > 0) onLoad(w, h);
    if (!maxPixels || !warnEl) return;
    const px = w * h;
    if (px > maxPixels) { const mp=(px/1e6).toFixed(1),maxMp=(maxPixels/1e6).toFixed(0); warnEl.textContent=`⚠ ${w}×${h} (${mp}MP) exceeds model max ~${maxMp}MP — adjust size below.`; warnEl.style.display="block"; }
    else warnEl.style.display="none";
  });
  img.style.display = "none";
  let currentFile = null;
  function setFilename(name) {
    currentFile = name;
    if (name) { img.src = `/view?filename=${encodeURIComponent(name)}&type=input&t=${Date.now()}`; img.style.display = "block"; hint.style.display = "none"; }
    else       { img.style.display = "none"; hint.style.display = ""; if(warnEl)warnEl.style.display="none"; }
  }
  box.appendChild(hint); box.appendChild(img); wrap.appendChild(box);
  if (warnEl) wrap.appendChild(warnEl);
  const inp = el("input", { type: "file", accept: "image/*", style: { display: "none" } });
  wrap.appendChild(inp);
  inp.addEventListener("change", async () => { if (inp.files[0]) { const n = await onUpload(inp.files[0]); setFilename(n); inp.value = ""; }});
  box.addEventListener("click", () => inp.click());
  box.addEventListener("dragover", e => { e.preventDefault(); box.style.borderColor = C.lime; });
  box.addEventListener("dragleave", () => { box.style.borderColor = C.border; });
  box.addEventListener("drop", async e => { e.preventDefault(); box.style.borderColor = C.border; const f = e.dataTransfer.files[0]; if (f) { const n = await onUpload(f); setFilename(n); }});
  setFilename(initialFile);
  return { el: wrap, setFilename, getFilename: () => currentFile };
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
    maxPixels: 4 * 1024 * 1024, // Krea2 max supported ~4MP (2048×2048)
    onLoad: (w, h) => { state.i2iWidth = snap8(w); state.i2iHeight = snap8(h); wIn.value = state.i2iWidth; hIn.value = state.i2iHeight; setAspect(w / h); ctx.persist(); },
  });
  wrap.appendChild(panel([uploadEl, sizeEl]));

  wrap.appendChild(panel([
    label("Denoise"),
    slider(0, 1, 0.01, state.i2iDenoise ?? 0.75, v => { state.i2iDenoise = v; ctx.persist(); }, v => v.toFixed(2)),
  ]));

  wrap.appendChild(panel([
    row([
      col([label("Steps"), numberField(state.steps ?? 8,  v => { state.steps = v; ctx.persist(); }, 1)]),
      col([label("CFG"),   numberField(state.cfg   ?? 1,  v => { state.cfg   = v; ctx.persist(); }, 0.1)]),
    ]),
    row([
      col([label("Sampler"),   select(SAMPLERS.map(s=>({value:s,label:s})),   state.sampler   || "euler",  v => { state.sampler   = v; ctx.persist(); })]),
      col([label("Scheduler"), select(SCHEDULERS.map(s=>({value:s,label:s})), state.scheduler || "simple", v => { state.scheduler = v; ctx.persist(); })]),
    ]),
  ]));

  mountLoraSectionKrea2(wrap, state, ctx);
  mountControlNetSection(wrap, state, ctx, "i2i");

  return {
    getSourceURL: () => state.i2iImage ? `/view?filename=${encodeURIComponent(state.i2iImage)}&type=input` : null,
    async getGraph() { return buildI2IGraph(state); },
    setImage(name) { state.i2iImage = name; setFilename(name); ctx.persist(); },
  };
}

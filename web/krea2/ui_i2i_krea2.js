// ui_i2i_krea2.js — I2I left panel for Krea 2 ONE STUDIO (TJ)
import { C, el, SAMPLERS, SCHEDULERS } from "./core_krea2.js";
import { panel, label, slider, numberField, select, row, col } from "../klein/ui_common.js";
import { buildI2IGraph } from "./graph_builder_krea2.js";
import { uploadImage } from "./api_krea2.js";
import { mountLoraSectionKrea2 } from "./ui_t2i_krea2.js";

function createImgUpload(labelText, initialFile, onUpload) {
  const BOX = 192;
  const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "4px", alignItems: "center" } });
  const box = el("div", { style: {
    width: `${BOX}px`, height: `${BOX}px`, background: "#000", borderRadius: "10px",
    border: `1px solid ${C.border}`, position: "relative", cursor: "pointer",
    flexShrink: "0", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
  }});
  const hint = el("div", { text: `${labelText}\nClick or drag to upload`, style: { color: C.muted, fontSize: "12px", textAlign: "center", whiteSpace: "pre", pointerEvents: "none" }});
  const img  = el("img", { style: { position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }});
  img.style.display = "none";
  let currentFile = null;
  function setFilename(name) {
    currentFile = name;
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
  return { el: wrap, setFilename, getFilename: () => currentFile };
}

export function mountI2ILeft(leftEl, state, ctx) {
  const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } });
  leftEl.appendChild(wrap);

  const { el: uploadEl, setFilename } = createImgUpload("Source Image", state.i2iImage || null, async f => {
    const name = await uploadImage(f);
    state.i2iImage = name; ctx.persist();
    return name;
  });
  wrap.appendChild(panel([uploadEl]));

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

  return {
    getSourceURL: () => state.i2iImage ? `/view?filename=${encodeURIComponent(state.i2iImage)}&type=input` : null,
    async getGraph() { return buildI2IGraph(state); },
    setImage(name) { state.i2iImage = name; setFilename(name); ctx.persist(); },
  };
}

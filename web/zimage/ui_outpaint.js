// ui_outpaint.js — OUTPAINT mode (DifferentialDiffusion 기반)
import { C, el } from "./core.js";
import { panel, label, slider, numberField, row, col } from "./ui_common.js";
import { uploadImage } from "./api.js";
import { buildOutpaintGraph } from "./graph_builder.js";
import { mountLoraSection } from "./ui_lora_section.js";
import { createImageUpload } from "./ui_image_upload.js";

export function mountOutpaintLeft(leftEl, state, ctx) {
  const wrap = el("div", { style:{ display:"flex", flexDirection:"column", gap:"6px" } });
  leftEl.appendChild(wrap);

  // Source image
  const srcUp = createImageUpload({
    label: "Source Image",
    initialFilename: state.outpaintImage,
    onUpload: async f => { const n = await uploadImage(f); state.outpaintImage = n; ctx.persist(); return n; },
  });
  wrap.appendChild(panel([label("Source Image"), srcUp.el]));

  // Direction pad controls
  function padField(labelText, key, defaultVal) {
    const f = numberField(state[key]??defaultVal, v=>{ state[key]=Math.max(0,v); ctx.persist(); }, 64);
    return col([label(labelText), f]);
  }

  wrap.appendChild(panel([
    label("Expansion (px)"),
    row([padField("Up",    "outpaintUp",    256), padField("Down",  "outpaintDown",  256)]),
    row([padField("Left",  "outpaintLeft",  0),   padField("Right", "outpaintRight", 0)]),
  ]));

  wrap.appendChild(panel([
    label("Feathering px"),
    slider(0, 128, 4, state.outpaintFeather??32, v=>{ state.outpaintFeather=v; ctx.persist(); }, v=>String(v)),
  ]));

  mountLoraSection(wrap, state, ctx);

  return {
    setImage(name) { state.outpaintImage = name; srcUp.setFilename(name); ctx.persist(); },
    beforeGenerate: async () => {
      if (!state.outpaintImage) throw new Error("소스 이미지를 업로드하세요.");
      const total = (state.outpaintUp||0)+(state.outpaintDown||0)+(state.outpaintLeft||0)+(state.outpaintRight||0);
      if (total <= 0) throw new Error("확장할 방향을 하나 이상 설정하세요.");
    },
    getGraph() { return buildOutpaintGraph(state); },
    getSourceURL() { return state.outpaintImage ? `/view?filename=${encodeURIComponent(state.outpaintImage)}&type=input` : null; },
  };
}

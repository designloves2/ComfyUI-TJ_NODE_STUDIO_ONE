// ui_controlnet.js — LEFT PANEL: CONTROLNET mode (English UI)
import { C, el, clear } from "./core.js";
import { panel, label, button, select, slider, numberField, row, col } from "./ui_common.js";
import { getModels, uploadImage } from "./api.js";
import { buildControlNetGraph } from "./graph_builder.js";
import { mountLoraSection } from "./ui_lora_section.js";
import { createImageUpload } from "./ui_image_upload.js";

const CONTROL_TYPES = [
  { value:"depth", label:"Depth" }, { value:"canny", label:"Canny" },
  { value:"pose",  label:"Pose"  }, { value:"hed",   label:"HED"   },
  { value:"mlsd",  label:"MLSD"  }, { value:"none",  label:"None (raw)" },
];

export function mountControlNetLeft(leftEl, state, ctx) {
  const wrap = el("div", { style: { display:"flex", flexDirection:"column", gap:"6px" } });
  leftEl.appendChild(wrap);

  const cnWrap = el("div");
  function renderCn(data) {
    clear(cnWrap);
    const list = data?.model_patches?.length ? data.model_patches : ["none"];
    if (!state.controlnetModel || !list.includes(state.controlnetModel)) state.controlnetModel = list[0];
    cnWrap.appendChild(panel([
      label("ControlNet Union Model"),
      select(list, state.controlnetModel, v => { state.controlnetModel = v; ctx.persist(); }),
    ]));
  }
  renderCn({}); getModels().then(renderCn).catch(() => {});
  wrap.appendChild(cnWrap);

  const up = createImageUpload({
    label: "Reference Image",
    initialFilename: state.controlnetImage,
    onUpload: async f => { const n = await uploadImage(f); state.controlnetImage = n; ctx.persist(); ctx.resizeNode?.(); return n; },
  });
  wrap.appendChild(panel([label("Reference Image"), up.el]));

  wrap.appendChild(panel([
    label("Control Type"),
    select(CONTROL_TYPES, state.controlnetType, v => { state.controlnetType = v; ctx.persist(); }),
    label("Strength"),
    slider(0, 2, 0.05, state.controlnetStrength, v => { state.controlnetStrength = v; ctx.persist(); }, v => v.toFixed(2)),
    label("Preprocess Resolution"),
    numberField(state.controlnetResolution, v => { state.controlnetResolution = v; ctx.persist(); }, 64),
    label("Denoise"),
    slider(0.1, 1, 0.01, state.controlnetDenoise, v => { state.controlnetDenoise = v; ctx.persist(); }, v => v.toFixed(2)),
  ]));

  mountLoraSection(wrap, state, ctx);

  return {
    setImage(name) { state.controlnetImage = name; up.setFilename(name); ctx.persist(); },
    beforeGenerate: async () => {
      if (!state.controlnetImage) throw new Error("Upload a reference image.");
      if (!state.controlnetModel || state.controlnetModel === "none") throw new Error("Select a ControlNet Union model.");
    },
    getGraph() { return buildControlNetGraph(state); },
    getSourceURL() { return state.controlnetImage ? `/view?filename=${encodeURIComponent(state.controlnetImage)}&type=input` : null; },
  };
}

// ui_i2i_klein.js — I2I left panel for flux2 klein One (TJ)
import { C, el } from "./core_klein.js";
import { panel, label, slider, numberField, select, row, col } from "./ui_common.js";
import { buildI2IGraph } from "./graph_builder_klein.js";
import { createImageUpload } from "./ui_image_upload.js";
import { uploadImage } from "./api_klein.js";
import { mountLoraSection } from "./ui_lora_section.js";

const SAMPLERS   = ["euler","euler_ancestral","er_sde","dpm_2","dpm_2_ancestral","lms","dpm_fast","heun","dpm_pp_2m"];
const SCHEDULERS = ["simple","normal","karras","exponential","sgm_uniform","beta"];

export function mountI2ILeft(leftEl, state, ctx) {
  const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } });
  leftEl.appendChild(wrap);

  const { el: uploadEl, setFilename } = createImageUpload({
    label: "Source Image",
    initialFilename: state.i2iImage || null,
    onUpload: async f => {
      const name = await uploadImage(f);
      state.i2iImage = name; ctx.persist();
      return name;
    },
  });
  wrap.appendChild(panel([uploadEl]));

  wrap.appendChild(panel([
    label("Denoise"),
    slider(0, 1, 0.01, state.i2iDenoise ?? 0.75, v => { state.i2iDenoise = v; ctx.persist(); }, v => v.toFixed(2)),
  ]));

  wrap.appendChild(panel([
    row([
      col([label("STEPS"),     numberField(state.steps ?? 4,  v => { state.steps = v; ctx.persist(); }, 1)]),
      col([label("CFG"),       numberField(state.cfg   ?? 1,  v => { state.cfg   = v; ctx.persist(); }, 0.1)]),
    ]),
    row([
      col([label("SAMPLER"),   select(SAMPLERS,   state.sampler   || "er_sde", v => { state.sampler   = v; ctx.persist(); })]),
      col([label("SCHEDULER"), select(SCHEDULERS, state.scheduler || "simple", v => { state.scheduler = v; ctx.persist(); })]),
    ]),
  ]));

  mountLoraSection(wrap, state, ctx);

  return {
    getSourceURL: () => state.i2iImage ? `/view?filename=${encodeURIComponent(state.i2iImage)}&type=input` : null,
    async getGraph() { return buildI2IGraph(state); },
    setImage(name) { state.i2iImage = name; setFilename(name); ctx.persist(); },
  };
}

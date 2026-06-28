// ui_i2i_sdxl.js — I2I left panel for SDXL ONE (TJ)
import { C, el, createInputImageSlot } from "./core_sdxl.js";
import { panel, label, select, numberField, slider, row, col } from "../klein/ui_common.js";
import { uploadImage } from "./api_sdxl.js";
import { buildI2IGraph } from "./graph_builder_sdxl.js";
import { mountLoraSection } from "./ui_lora_sdxl.js";

const SAMPLERS   = ["euler","euler_ancestral","dpm_2","dpm_2_ancestral","dpm_pp_2m","dpm_pp_2m_sde","dpm_pp_sde","heun","lms","dpm_fast","dpm_adaptive","ddim","uni_pc"];
const SCHEDULERS = ["normal","karras","exponential","sgm_uniform","simple","beta"];

export function mountI2ILeft(leftEl, state, ctx) {
  const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } });
  leftEl.appendChild(wrap);

  // Reactive image slot — always in sync with state.i2iImage
  const imgSlot = createInputImageSlot(state, "i2iImage", uploadImage, ctx, { label: "Source Image" });
  wrap.appendChild(panel([label("Source Image"), imgSlot.el]));

  // Denoise
  wrap.appendChild(panel([
    label("Denoise Strength"),
    slider(0, 1, 0.01, state.i2iDenoise ?? 0.75, v => { state.i2iDenoise = v; ctx.persist(); }, v => v.toFixed(2)),
  ]));

  // Sampling
  wrap.appendChild(panel([
    row([
      col([label("Steps"), numberField(state.steps, v => { state.steps = Math.max(1, Math.round(v)); ctx.persist(); }, 1)]),
      col([label("CFG"),   numberField(state.cfg,   v => { state.cfg   = v; ctx.persist(); }, 0.5)]),
    ]),
    row([
      col([label("Sampler"),   select(SAMPLERS,   state.sampler,   v => { state.sampler   = v; ctx.persist(); })]),
      col([label("Scheduler"), select(SCHEDULERS, state.scheduler, v => { state.scheduler = v; ctx.persist(); })]),
    ]),
  ]));

  mountLoraSection(wrap, state, ctx);

  return {
    getSourceURL: () => state.i2iImage
      ? `/view?filename=${encodeURIComponent(state.i2iImage)}&type=input`
      : null,

    /** Called by gallery send-to when mode already matches */
    setImageField(field, filename) {
      if (field === "i2iImage") imgSlot.setFilename(filename);
    },

    beforeGenerate: async () => {
      if (!state.i2iImage) throw new Error("소스 이미지를 업로드하세요.");
    },

    async getGraph() { return buildI2IGraph(state); },
  };
}

// ui_t2i_i2i.js — LEFT PANEL: T2I and I2I modes (English UI)
import { C, el, clear } from "./core.js";
import { panel, label, button, select, slider, numberField, row, col } from "./ui_common.js";
import { uploadImage } from "./api.js";
import { buildT2IGraph, buildI2IGraph } from "./graph_builder.js";
import { mountLoraSection } from "./ui_lora_section.js";
import { createImageUpload } from "./ui_image_upload.js";

const RES_PRESETS = [
  { label:"1024 × 1536", w:1024, h:1536 },
  { label:"1536 × 1024", w:1536, h:1024 },
  { label:"1024 × 1024", w:1024, h:1024 },
  { label:"1216 × 832",  w:1216, h:832  },
  { label:"832 × 1216",  w:832,  h:1216 },
  { label:"1344 × 768",  w:1344, h:768  },
  { label:"768 × 1344",  w:768,  h:1344 },
  { label:"Custom",       w:0,    h:0    },
];

export function mountT2II2ILeft(leftEl, state, ctx) {
  const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } });
  leftEl.appendChild(wrap);

  // I2I image upload
  const i2iSection = el("div");
  function renderI2I() {
    clear(i2iSection);
    if (state.mode !== "i2i") return;
    const up = createImageUpload({
      label: "Source Image",
      initialFilename: state.i2iImage,
      onUpload: async f => { const n = await uploadImage(f); state.i2iImage = n; ctx.persist(); ctx.resizeNode?.(); return n; },
    });
    i2iSection.appendChild(panel([
      label("Source Image"), up.el,
      label("Denoise Strength"),
      slider(0.05, 1, 0.01, state.i2iDenoise, v => { state.i2iDenoise = v; ctx.persist(); }, v => v.toFixed(2)),
    ]));
  }
  renderI2I();
  wrap.appendChild(i2iSection);

  // Resolution (T2I only)
  const resSection = el("div");
  function renderRes() {
    clear(resSection);
    if (state.mode !== "t2i") return;
    const matched = RES_PRESETS.find(p => p.w === state.width && p.h === state.height);
    const isCustom = !matched || matched.label === "Custom";
    const dd = select(RES_PRESETS.map(p => ({ value: p.label, label: p.label })),
      isCustom ? "Custom" : matched.label,
      v => {
        const p = RES_PRESETS.find(x => x.label === v);
        if (p && p.w > 0) { state.width = p.w; state.height = p.h; ctx.persist(); customRow.style.display = "none"; }
        else customRow.style.display = "flex";
      });
    const wIn = numberField(state.width,  v => { state.width  = Math.max(64, Math.round((v || 64) / 8) * 8); ctx.persist(); }, 8);
    const hIn = numberField(state.height, v => { state.height = Math.max(64, Math.round((v || 64) / 8) * 8); ctx.persist(); }, 8);
    const customRow = row([col([label("W"), wIn]), col([label("H"), hIn])]);
    customRow.style.display = isCustom ? "flex" : "none";
    resSection.appendChild(panel([label("Resolution"), dd, customRow]));
  }
  renderRes();
  wrap.appendChild(resSection);

  // Sampling params (populated dynamically with all ComfyUI samplers)
  const samplerWrap = el("div");
  wrap.appendChild(samplerWrap);

  function renderSamplers(samplers, schedulers) {
    clear(samplerWrap);
    samplerWrap.appendChild(panel([
      row([
        col([label("Steps"), numberField(state.steps,  v => { state.steps  = v; ctx.persist(); }, 1)]),
        col([label("CFG"),   numberField(state.cfg,    v => { state.cfg    = v; ctx.persist(); }, 0.1)]),
        col([label("Shift"), numberField(state.shift,  v => { state.shift  = v; ctx.persist(); }, 0.5)]),
      ]),
      row([
        col([label("Sampler"),   select(samplers,   state.sampler,   v => { state.sampler   = v; ctx.persist(); })]),
        col([label("Scheduler"), select(schedulers, state.scheduler, v => { state.scheduler = v; ctx.persist(); })]),
      ]),
    ]));
  }
  const fallbackSamplers   = ctx._samplers   || ["euler","res_multistep","euler_ancestral","dpmpp_2m","dpmpp_2m_sde","uni_pc","lcm"];
  const fallbackSchedulers = ctx._schedulers || ["simple","normal","sgm_uniform","karras","beta","exponential","ays","gits"];
  renderSamplers(fallbackSamplers, fallbackSchedulers);

  // Load full sampler list once
  if (!ctx._samplersLoaded) {
    ctx._samplersLoaded = true;
    import("./api.js").then(m => m.getKSamplerOptions?.()).then(d => {
      if (d) { ctx._samplers = d.samplers; ctx._schedulers = d.schedulers; renderSamplers(d.samplers, d.schedulers); }
    }).catch(() => {});
  }

  mountLoraSection(wrap, state, ctx);

  return {
    beforeGenerate: async () => {
      if (state.mode === "i2i" && !state.i2iImage) throw new Error("Upload a source image for I2I.");
    },
    getGraph() { return state.mode === "i2i" ? buildI2IGraph(state) : buildT2IGraph(state); },
    getSourceURL() { return state.mode === "i2i" && state.i2iImage ? `/view?filename=${encodeURIComponent(state.i2iImage)}&type=input` : null; },
    onModeChange() { renderI2I(); renderRes(); ctx.resizeNode?.(); },
  };
}

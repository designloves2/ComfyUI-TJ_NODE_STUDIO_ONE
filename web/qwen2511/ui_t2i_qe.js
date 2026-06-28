// ui_t2i_qe.js — T2I left panel for Qwen Image Edit 2511 ONE (TJ)
import { C, el } from "./core_qwen2511.js";
import { panel, label, select, numberField, row, col } from "./ui_common_qe.js";
import { buildT2IGraph } from "./graph_builder_qwen2511.js";
import { mountLoraSectionQE } from "./ui_common_qe.js";

const RES_PRESETS = [
  { label: "1024 × 1024", w: 1024, h: 1024 },
  { label: "1024 × 1536", w: 1024, h: 1536 },
  { label: "1536 × 1024", w: 1536, h: 1024 },
  { label: "1920 × 1088", w: 1920, h: 1088 },
  { label: "1088 × 1920", w: 1088, h: 1920 },
  { label: "1280 × 720",  w: 1280, h: 720  },
  { label: "720 × 1280",  w: 720,  h: 1280 },
  { label: "Custom",      w: 0,    h: 0    },
];

export function mountT2ILeft(leftEl, state, ctx) {
  const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } });
  leftEl.appendChild(wrap);

  const matched  = RES_PRESETS.find(p => p.w === state.width && p.h === state.height);
  const isCustom = !matched || matched.label === "Custom";
  const resDD    = select(RES_PRESETS.map(p => ({ value: p.label, label: p.label })),
    isCustom ? "Custom" : matched.label,
    v => {
      const p = RES_PRESETS.find(x => x.label === v);
      if (p && p.w > 0) { state.width = p.w; state.height = p.h; ctx.persist(); customRow.style.display = "none"; }
      else customRow.style.display = "flex";
    }
  );
  const wIn = numberField(state.width,  v => { state.width  = Math.max(64, Math.round((v || 64) / 8) * 8); ctx.persist(); }, 8);
  const hIn = numberField(state.height, v => { state.height = Math.max(64, Math.round((v || 64) / 8) * 8); ctx.persist(); }, 8);
  const customRow = row([col([label("W"), wIn]), col([label("H"), hIn])]);
  customRow.style.display = isCustom ? "flex" : "none";
  wrap.appendChild(panel([label("Resolution"), resDD, customRow]));

  wrap.appendChild(panel([
    row([
      col([label("Steps"), numberField(state.steps,  v => { state.steps  = v; ctx.persist(); }, 1)]),
      col([label("CFG"),   numberField(state.cfg,    v => { state.cfg    = v; ctx.persist(); }, 0.1)]),
    ]),
    row([
      col([label("Sampler"),   select(["euler","euler_ancestral","er_sde","dpm_2","heun","dpm_pp_2m"], state.sampler,   v => { state.sampler   = v; ctx.persist(); })]),
      col([label("Scheduler"), select(["simple","normal","karras","exponential","sgm_uniform","beta"], state.scheduler, v => { state.scheduler = v; ctx.persist(); })]),
    ]),
  ]));

  mountLoraSectionQE(wrap, state, ctx);

  return {
    getSourceURL: () => null,
    async getGraph() { return buildT2IGraph(state); },
  };
}

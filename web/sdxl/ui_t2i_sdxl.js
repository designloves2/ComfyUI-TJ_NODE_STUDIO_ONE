// ui_t2i_sdxl.js — T2I left panel for SDXL ONE (TJ)
import { C, el } from "./core_sdxl.js";
import { panel, label, select, numberField, row, col } from "../klein/ui_common.js";
import { buildT2IGraph } from "./graph_builder_sdxl.js";
import { mountLoraSection } from "./ui_lora_sdxl.js";

// SDXL native resolutions
const RES_PRESETS = [
  { label: "1024 × 1024", w: 1024, h: 1024 },
  { label: "1152 × 896",  w: 1152, h: 896  },
  { label: "896 × 1152",  w: 896,  h: 1152 },
  { label: "1216 × 832",  w: 1216, h: 832  },
  { label: "832 × 1216",  w: 832,  h: 1216 },
  { label: "1344 × 768",  w: 1344, h: 768  },
  { label: "768 × 1344",  w: 768,  h: 1344 },
  { label: "1536 × 640",  w: 1536, h: 640  },
  { label: "640 × 1536",  w: 640,  h: 1536 },
  { label: "Custom",       w: 0,    h: 0    },
];

const SAMPLERS   = ["euler","euler_ancestral","dpm_2","dpm_2_ancestral","dpm_pp_2m","dpm_pp_2m_sde","dpm_pp_sde","heun","lms","dpm_fast","dpm_adaptive","ddim","uni_pc"];
const SCHEDULERS = ["normal","karras","exponential","sgm_uniform","simple","beta"];

export function mountT2ILeft(leftEl, state, ctx) {
  const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } });
  leftEl.appendChild(wrap);

  // Resolution
  const matched  = RES_PRESETS.find(p => p.w === state.width && p.h === state.height);
  const isCustom = !matched || matched.label === "Custom";
  const resDD = select(
    RES_PRESETS.map(p => ({ value: p.label, label: p.label })),
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

  // Refiner toggle info
  const refNote = el("div", { style: {
    fontSize: "10px", color: C.muted, padding: "4px 8px",
    background: C.bg2, borderRadius: "4px", border: `1px solid ${C.border}`,
  }});
  function updateRefNote() {
    refNote.textContent = state.useRefiner
      ? `✓ Refiner ON — ${Math.round((state.refinerStepFrac ?? 0.8) * 100)}% base / ${Math.round((1 - (state.refinerStepFrac ?? 0.8)) * 100)}% refiner`
      : "Refiner OFF — enable in Settings ⚙";
    refNote.style.color = state.useRefiner ? "#7bc97e" : C.muted;
  }
  updateRefNote();
  wrap.appendChild(refNote);
  ctx._refreshRefinerNote = updateRefNote;

  // LoRA
  mountLoraSection(wrap, state, ctx);

  return {
    getSourceURL: () => null,
    async getGraph() { return buildT2IGraph(state); },
  };
}

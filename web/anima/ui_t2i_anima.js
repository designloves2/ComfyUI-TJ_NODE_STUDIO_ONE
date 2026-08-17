// ui_t2i_anima.js — T2I left panel for Anima ONE STUDIO (TJ)
import { C, el, RESOLUTIONS, SAMPLERS, SCHEDULERS, BASE_STEPS, BASE_CFG, TURBO_STEPS, TURBO_CFG } from "./core_anima.js";
import { panel, label, select, numberField, row, col } from "../klein/ui_common.js";
import { buildT2IGraph } from "./graph_builder_anima.js";

export function mountT2ILeft(leftEl, state, ctx) {
  const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } });
  leftEl.appendChild(wrap);

  // ── Base checkpoint variant (Base 1.0 vs Preview3) — T2I only ──────────────
  const variantSel = select(
    [{ value: "base", label: "Base 1.0 (recommended)" }, { value: "preview3", label: "Preview3 (experimental)" }],
    state.useBaseVariant || "base",
    v => { state.useBaseVariant = v; ctx.persist(); }
  );
  wrap.appendChild(panel([label("Checkpoint"), variantSel]));

  // ── Resolution ──────────────────────────────────────────────────────────────
  const matched = RESOLUTIONS.find(r => r.w === state.width && r.h === state.height);
  const isCustom = !matched || matched.label === "Custom";
  const resDd = select(
    RESOLUTIONS.map(r => ({ value: r.label, label: r.label })),
    isCustom ? "Custom" : matched.label,
    v => {
      const p = RESOLUTIONS.find(r => r.label === v);
      if (p && p.w > 0) { state.width = p.w; state.height = p.h; ctx.persist(); customRow.style.display = "none"; }
      else customRow.style.display = "flex";
    }
  );
  const wInp = numberField(state.width,  v => { state.width  = Math.max(64, Math.round(v / 64) * 64) || 1024; ctx.persist(); }, 64);
  const hInp = numberField(state.height, v => { state.height = Math.max(64, Math.round(v / 64) * 64) || 1024; ctx.persist(); }, 64);
  const customRow = row([col([label("W"), wInp]), col([label("H"), hInp])]);
  customRow.style.display = isCustom ? "flex" : "none";
  wrap.appendChild(panel([label("Resolution"), resDd, customRow]));

  // ── Turbo toggle + Steps/CFG ─────────────────────────────────────────────────
  const stepsF = numberField(state.steps, v => { state.steps = Math.max(1, Math.min(60, Math.round(v) || 1)); ctx.persist(); }, 1);
  const cfgF   = numberField(state.cfg,   v => { state.cfg   = Math.max(0, Math.min(20, v || 0)); ctx.persist(); }, 0.25);
  function syncStepsCfgEnabled() {
    const turbo = !!state.turboMode;
    stepsF.disabled = turbo; cfgF.disabled = turbo;
    stepsF.style.opacity = turbo ? "0.5" : "1"; cfgF.style.opacity = turbo ? "0.5" : "1";
  }
  const turboChk = el("input", { type: "checkbox" }); turboChk.checked = !!state.turboMode;
  const turboLbl = el("label", { style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: C.text, cursor: "pointer" } },
    [turboChk, el("span", { text: "TURBO (Base 1.0 + Turbo LoRA → 8 steps / CFG 1)" })]);
  turboChk.addEventListener("change", () => {
    state.turboMode = turboChk.checked;
    if (state.turboMode) { state.steps = TURBO_STEPS; state.cfg = TURBO_CFG; }
    else { state.steps = BASE_STEPS; state.cfg = BASE_CFG; }
    stepsF.value = state.steps; cfgF.value = state.cfg;
    syncStepsCfgEnabled(); ctx.persist();
  });
  syncStepsCfgEnabled();
  wrap.appendChild(panel([turboLbl, row([col([label("Steps"), stepsF]), col([label("CFG"), cfgF])])]));

  // ── Sampler / Scheduler ──────────────────────────────────────────────────────
  const sampSel  = select(SAMPLERS.map(s=>({value:s,label:s})),   state.sampler,   v=>{ state.sampler=v;   ctx.persist(); });
  const schedSel = select(SCHEDULERS.map(s=>({value:s,label:s})), state.scheduler, v=>{ state.scheduler=v; ctx.persist(); });
  wrap.appendChild(panel([row([col([label("Sampler"), sampSel]), col([label("Scheduler"), schedSel])])]));

  return {
    getSourceURL() { return null; },
    async getGraph() { return buildT2IGraph(state); },
  };
}

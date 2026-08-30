// presets_minimax.js — the pipeline combinations worth keeping, for the MiniMax H3 node.
//
// These six are what survived a 39-configuration benchmark (Reference mode, 1.0MP, 8s,
// 25 steps, one fixed seed, ~16 hours). The numbers are kept from that run so a preset
// here and a row in the report are the same thing; the full matrix, the raw timings and
// the clips live with the report rather than in this dropdown.
//
// What the benchmark settled, and why the list is this short:
//
//   FirstBlockCache is worth 44% and almost everything else is noise around it — five
//   attention backends land within 4% of each other once it is on, so the backend choice
//   that gets argued about does not matter here. Spectrum, the obvious thing to add next
//   to a cache, costs about 2% instead: both skip work on the same axis, the cache gets
//   there first, and nothing is left to forecast. Re-measured at 50 steps in case the
//   schedule was too short — same answer. Spectrum does earn its place where no cache is
//   running, which is why it appears on the PDD entry and nowhere else. Quality could not
//   separate the survivors at all: one configuration run six times scored 3-5, so
//   anything inside two points is measurement noise, and the choice comes down to speed.
//
// A preset only ever writes the pipeline axes. Steps, seed, length, resolution and the
// model pickers are deliberately left alone — a preset that moved those would invalidate
// the comparison someone picked it for.

/**
 * @typedef {object} Preset
 * @property {number} id        the row number this had in the benchmark; kept so a
 *                             preset here and a row in the report are the same thing
 * @property {string} phase     category shown in the dropdown label
 * @property {string} label     dropdown text
 * @property {string} note      what this row is for — shown under the dropdown
 * @property {string} turbo     turboMode
 * @property {string} backend   attnBackend
 * @property {string} forward   attnForward
 * @property {string} cache     blockCache
 * @property {boolean} spectrum useSpectrum
 * @property {boolean} torch    useTorchPatch (+ fp16 accumulation)
 * @property {boolean} fused    useFusedModulation
 * @property {string|null} nfe  pddNfe — only meaningful for turbo "pdd", null elsewhere
 */

const P = (id, phase, label, note, turbo, backend, forward, cache, spectrum, torch, fused, nfe = null) =>
  ({ id, phase, label, note, turbo, backend, forward, cache, spectrum, torch, fused, nfe });

/** @type {Preset[]} */
export const PIPELINE_PRESETS = [
  P(18, "Everyday", "Sage + MemEff + FirstBlockCache",
    "The default. 17.5 min for an 8s clip at 1.0MP / 25 steps, against 30.4 with nothing on — the cache is the whole 44%. For fast camera or character motion raise steps to 40-50; that is the one change that visibly cleared smearing, and no accelerator here substitutes for it.",
    "none", "sage", "memeff_sage", "fbcache", false, true, false),

  P(31, "Fast", "SLA Turbo (lightx2v)",
    "6.3 min at the same quality as the 25-step stacks — the quickest configuration that held up. 64 s/step against larryvrh's 95, because the SLA kernel actually removes work. In Reference mode it needs the ref2v LoRA; the fl2v file silently does nothing.",
    "lightx2v", "sla", "none", "none", false, true, false),

  P(38, "Fast", "PDD 8 nfe + Spectrum",
    "8.2 min, eight evaluations instead of six, quality indistinguishable from the full stacks. PDD cannot use a block cache, which is exactly why Spectrum belongs here — with nothing else skipping steps it takes 27% off (11.3 -> 8.2).",
    "pdd", "none", "none", "none", true, true, false, "8"),

  P(4, "Cautious", "No cache, no forecasting",
    "Dense attention only; nothing skips or approximates a step. 30.7 min against 17.5, and the bench found no quality difference to justify that — but its quality scores could not resolve anything under two points. Reach for this when output looks wrong and you want the caches ruled out.",
    "none", "sage", "memeff_sage", "none", false, true, true),

  P(1, "Cautious", "Stock — no patches at all",
    "Everything off, including the Torch patch. The honest floor, and the first thing to try when you need to know whether the pipeline caused a problem or the model did.",
    "none", "none", "none", "none", false, false, false),

  P(5, "First-Last / Text", "larryvrh 4-step turbo",
    "6.3 min, but only outside Reference mode: larryvrh publishes no reference-mode weights, and in Reference the LoRA does not take — it scored 2/5 with heavy blur across every run. Untested for first-last and text so far. Use preset 31 for fast Reference work.",
    "larryvrh", "sage", "memeff_sage", "none", false, true, true),
];


/** The axes a preset owns, in the shape both built-in and user presets store them. */
export function captureAxes(state) {
  return axesOf(state);
}

/**
 * User presets first, then the built-in six.
 *
 * User entries carry `user: true` and a string id (`u:<name>`) so nothing collides with
 * the built-ins' numeric benchmark ids — a saved preset must never be mistaken for
 * "preset 18" in the report, and the id ends up in clip filenames and metadata.
 */
export function allPresets(userPresets) {
  const mine = (userPresets || []).map(p => ({
    id: `u:${p.name}`, user: true, phase: "My preset", label: p.name, note: "",
    turbo: p.turbo, backend: p.backend, forward: p.forward, cache: p.cache,
    spectrum: !!p.spectrum, torch: p.torch !== false, fused: !!p.fused,
    nfe: p.nfe ?? null,
  }));
  return [...mine, ...PIPELINE_PRESETS];
}

/** The axes a preset owns, read off a state in the same shape the presets store them. */
function axesOf(state) {
  return {
    turbo:    state.turboMode   || "none",
    backend:  state.attnBackend || "none",
    forward:  state.attnForward || "none",
    cache:    state.blockCache  || "none",
    spectrum: !!state.useSpectrum,
    torch:    state.useTorchPatch !== false,
    fused:    !!state.useFusedModulation,
    // Only PDD has an nfe, and it is a real axis there — 8 and 4 are different partitions
    // of the same trained grid, not a speed slider. Elsewhere it must not affect matching.
    nfe:      (state.turboMode === "pdd") ? String(state.pddNfe ?? "8") : null,
  };
}

/**
 * The preset the panel is currently sitting on, or null.
 *
 * Derived rather than remembered on purpose: change one dropdown by hand and the answer
 * becomes null on its own. A stored "currently selected preset" would keep naming a
 * combination that had since been edited out from under it, which is exactly the kind of
 * label that costs an evening when the render is long.
 */
export function matchPreset(state, userPresets) {
  const a = axesOf(state);
  // User presets are checked first so a saved copy of a built-in shows the user's own
  // name — the name is what they will look for in the list.
  return (userPresets ? allPresets(userPresets) : PIPELINE_PRESETS).find(p =>
    p.turbo === a.turbo && p.backend === a.backend && p.forward === a.forward &&
    p.cache === a.cache && p.spectrum === a.spectrum && p.torch === a.torch &&
    p.fused === a.fused && p.nfe === a.nfe) || null;
}

/** Write a preset's axes onto `state`. Everything a comparison holds constant is untouched. */
export function applyPreset(state, preset) {
  if (!preset) return;
  state.turboMode          = preset.turbo;
  state.attnBackend        = preset.backend;
  state.attnForward        = preset.forward;
  state.blockCache         = preset.cache;
  state.useSpectrum        = preset.spectrum;
  state.useTorchPatch      = preset.torch;
  state.useFusedModulation = preset.fused;
  if (preset.nfe) state.pddNfe = preset.nfe;
  // fp16 accumulation lives under the Torch patch and is on for every preset that has
  // the patch at all; setting it unconditionally means toggling Torch back on by hand
  // lands on the same configuration the preset described.
  state.fp16Accum = true;
}

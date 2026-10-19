// run_summary.js — the settings a ONE STUDIO image node actually generated with, read from the graph it submitted.
//
// The node's `prompt` and `settings` outputs report this, so what comes out is what was run (a PromptDB pipe or a
// prompt_override included), not what the panel showed. Anything the graph does not carry falls back to the panel.
const isRef = v => Array.isArray(v) && v.length === 2 && typeof v[1] === "number";

// The prompt text behind a conditioning link: follows it through guidance / zero-out style nodes to the text encoder.
function textOf(graph, ref, depth = 0) {
  if (!isRef(ref) || depth > 8) return "";
  const node = graph[ref[0]];
  const inputs = node?.inputs;
  if (!inputs) return "";
  if (inputs.clip !== undefined) {
    for (const key of ["text", "prompt"]) if (typeof inputs[key] === "string") return inputs[key];
  }
  const next = ["conditioning", "positive", "conditioning_1"].map(k => inputs[k]).find(isRef) ?? Object.values(inputs).find(isRef);
  return textOf(graph, next, depth + 1);
}

function firstValue(graph, keys, type) {
  for (const node of Object.values(graph)) {
    for (const key of keys) {
      const v = node?.inputs?.[key];
      if (typeof v === type) return v;
    }
  }
  return undefined;
}

/** { model, seed, steps, cfg, sampler, scheduler, positive_prompt, negative_prompt } for the graph about to be queued. */
export function summarizeRun(graph, state) {
  const guide = Object.values(graph).find(n => isRef(n?.inputs?.positive) && isRef(n?.inputs?.negative));
  const mode = state.mode;
  const panelPrompt = (state.promptsByMode && mode in state.promptsByMode) ? state.promptsByMode[mode] : state.prompt;
  return {
    model: firstValue(graph, ["unet_name", "ckpt_name", "model_name"], "string") ?? state.model ?? "",
    seed: firstValue(graph, ["seed", "noise_seed"], "number") ?? state.seed ?? 0,
    steps: firstValue(graph, ["steps"], "number") ?? state.steps ?? 0,
    cfg: firstValue(graph, ["cfg"], "number") ?? state.cfg ?? 0,
    sampler: firstValue(graph, ["sampler_name"], "string") ?? state.sampler ?? "",
    scheduler: firstValue(graph, ["scheduler"], "string") ?? state.scheduler ?? "",
    positive_prompt: (guide ? textOf(graph, guide.inputs.positive) : "") || panelPrompt || "",
    negative_prompt: (guide ? textOf(graph, guide.inputs.negative) : "") || state.negativePrompt || "",
  };
}

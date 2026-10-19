// promptdb_pipe.js — receive a TJ_NODE PromptDB pipe (TJ_PROMPT_PIPE) in ONE STUDIO nodes.
//
// Design (per SPEC_PROMPTDB_PIPE.md, method A + user decision):
//   The node's UI is NEVER changed. At GENERATION time we back-track the `pipe`
//   input link to the TJ_PromptDBLoader node, read the selected row via TJ_NODE's
//   HTTP API, and TEMPORARILY override only the fields the pipe actually carries.
//   Missing fields keep the node's own settings. After the graph is built we restore.
//
// No hard dependency on TJ_NODE: the socket type is a plain string, and every call
// is wrapped so a missing node / missing API just means "no pipe" (node runs as before).
import { api } from "../../../scripts/api.js";

// ── 1. Read the selected PromptDB row via the connected loader ────────────────
// The node an input is wired to (wireless Set/Get resolves to a real link), or null.
function linkedSource(node, inputName) {
  const slot = node?.inputs?.findIndex(i => i.name === inputName);
  if (slot == null || slot < 0) return null;
  const linkId = node.inputs[slot]?.link;
  if (linkId == null) return null;
  const link = node.graph?.links?.[linkId];
  const src = link ? node.graph.getNodeById(link.origin_id) : null;
  return src ? { src, link } : null;
}

export async function readPipeRow(node) {
  try {
    const from = linkedSource(node, "pipe");
    if (!from || from.src.type !== "TJ_PromptDBLoader") return null;
    return await loaderRow(from.src);
  } catch {
    return null;                                            // any failure → behave as no pipe
  }
}

// The row a PromptDBLoader has selected, read through TJ_NODE's HTTP API.
async function loaderRow(src) {
  try {
    const w = name => src.widgets?.find(x => x.name === name)?.value;
    const excelPath  = w("excel_path");
    const selectedId = Number(w("selected_id") ?? -1);
    if (!excelPath || !(selectedId >= 0)) return null;      // nothing selected

    const res = await api.fetchApi("/tj_node/promptdb/list_rows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ excel_path: excelPath }),
    });
    if (!res.ok) return null;                               // TJ_NODE missing / error
    const rows = (await res.json())?.rows || [];
    return rows.find(r => Number(r.id) === selectedId) || null;
  } catch {
    return null;
  }
}

// The text wired into `prompt_override`. Nothing is computed until the workflow runs, so a PromptDBLoader is read
// through its selected row (its first output is the positive prompt); any other node gives the widget it exposes.
export async function readPromptOverride(node) {
  try {
    const from = linkedSource(node, "prompt_override");
    if (!from) return "";
    let { src, link } = from;
    // a Reroute only passes the link on: follow it to the node that really holds the text
    while (src.type === "Reroute") {
      const next = src.inputs?.[0]?.link != null ? src.graph.links[src.inputs[0].link] : null;
      const origin = next ? src.graph.getNodeById(next.origin_id) : null;
      if (!origin) return "";
      src = origin; link = next;
    }
    if (src.type === "TJ_PromptDBLoader") return String((await loaderRow(src))?.positive_prompt ?? "").trim();
    const out = src.outputs?.[link.origin_slot]?.name;
    const w = src.widgets?.find(x => x.name === out) ?? src.widgets?.[link.origin_slot] ?? src.widgets?.[0];
    return String(w?.value ?? "").trim();
  } catch {
    return "";
  }
}

// Standard ComfyUI sampler/scheduler names — used to validate a pipe value when the
// caller doesn't supply the node's own list (klein/sdxl/zimage cores don't export one).
const COMFY_SAMPLERS = [
  "euler", "euler_ancestral", "euler_cfg_pp", "euler_ancestral_cfg_pp", "heun", "heunpp2",
  "dpm_2", "dpm_2_ancestral", "lms", "dpm_fast", "dpm_adaptive", "dpmpp_2s_ancestral",
  "dpmpp_sde", "dpmpp_sde_gpu", "dpmpp_2m", "dpmpp_2m_sde", "dpmpp_2m_sde_gpu",
  "dpmpp_3m_sde", "dpmpp_3m_sde_gpu", "ddpm", "lcm", "ipndm", "ipndm_v", "deis",
  "res_multistep", "gradient_estimation", "ddim", "uni_pc", "uni_pc_bh2",
];
const COMFY_SCHEDULERS = [
  "normal", "karras", "exponential", "sgm_uniform", "simple", "ddim_uniform",
  "beta", "linear_quadratic", "kl_optimal",
];

// Flatten a getModels() response into one list of model names (keys vary per node:
// diffusion_models / unets / checkpoints / gguf).
export function collectModelNames(resp) {
  if (!resp || typeof resp !== "object") return [];
  const keys = ["diffusion_models", "unets", "checkpoints", "gguf", "models"];
  const out = [];
  for (const k of keys) if (Array.isArray(resp[k])) out.push(...resp[k]);
  return [...new Set(out.filter(n => n && n !== "none"))];
}

// The slot receives PromptDBLoader (TJ)'s pipe output. It keeps its internal name `pipe` (saved workflows and the
// lookups above use it); only the label on the node changes.
export function labelPipeInput(node) {
  const input = node.inputs?.find(i => i.name === "pipe");
  if (input) input.label = "PDBLoader pipe";
}

// ── 2. Turn a row into an overrides object (only present + valid fields) ───────
function _norm(s) { return String(s ?? "").replace(/\//g, "\\").trim().toLowerCase(); }

function _findInList(list, value) {
  const n = _norm(value);
  if (!n) return null;
  return (list || []).find(m => _norm(m) === n) || null;
}


export function computePipeOverrides(row, { samplers, schedulers } = {}) {
  const samplerList   = (samplers && samplers.length)   ? samplers   : COMFY_SAMPLERS;
  const schedulerList = (schedulers && schedulers.length) ? schedulers : COMFY_SCHEDULERS;
  const overrides = {};
  const skipped = [];
  if (!row || typeof row !== "object") return { overrides, skipped, meta: {} };

  const str = k => { const v = row[k]; return typeof v === "string" ? v : (v == null ? "" : String(v)); };
  const asInt = v => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
  const asFloat = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };

  const pos = str("positive_prompt").trim();
  if (pos) overrides.prompt = pos;
  const neg = str("negative_prompt").trim();
  if (neg) overrides.negativePrompt = neg;

  // model_name: intentionally NOT read from the pipe. Different ONE STUDIO nodes need
  // different model families + text-encoders (Krea2 ≠ Z-Image ≠ SDXL …) and there's no
  // reliable, install-agnostic way to tell which family a model file belongs to, so
  // each node always keeps its OWN configured model.

  if ("seed" in row) { const s = asInt(row.seed); if (s != null) overrides.seed = s; }   // 0 is valid
  if ("steps" in row) { const s = asInt(row.steps); if (s != null && s > 0) overrides.steps = s; }
  if ("cfg" in row) { const c = asFloat(row.cfg); if (c != null) overrides.cfg = c; }

  const samp = str("sampler_name").trim();
  if (samp) { const f = _findInList(samplerList, samp); if (f) overrides.sampler = f; else skipped.push({ field: "sampler", value: samp }); }
  const sched = str("scheduler").trim();
  if (sched) { const f = _findInList(schedulerList, sched); if (f) overrides.scheduler = f; else skipped.push({ field: "scheduler", value: sched }); }

  const meta = { note: str("note").trim(), extra_settings: str("extra_settings").trim() };
  return { overrides, skipped, meta };
}

// ── 3. Temporarily apply overrides to `state`; returns a restore() fn ──────────
export function applyOverridesTemp(state, overrides) {
  const snap = {};
  // Apply every key present on `overrides` except the per-mode `prompt` (handled below).
  // This lets a node remap `model` → its own key (e.g. SDXL checkpoint / unet) before calling.
  for (const k in overrides) {
    if (k === "prompt") continue;
    snap[k] = state[k];
    state[k] = overrides[k];
  }
  let promptSnap = null;
  if ("prompt" in overrides) {
    const mode = state.mode;
    if (!state.promptsByMode) state.promptsByMode = {};
    promptSnap = { mode, prompt: state.prompt, modeVal: state.promptsByMode[mode] };
    state.promptsByMode[mode] = overrides.prompt;
    state.prompt = overrides.prompt;
  }
  return function restore() {
    for (const k in snap) state[k] = snap[k];
    if (promptSnap) {
      state.prompt = promptSnap.prompt;
      if (state.promptsByMode) state.promptsByMode[promptSnap.mode] = promptSnap.modeVal;
    }
  };
}

// ── 4. Resolve overrides for a node's generate handler (does NOT apply) ────────
// Returns null (no pipe / nothing to do), or { overrides, skipped, meta, summary }.
// The caller applies with applyOverridesTemp() around getGraph() and restores
// immediately — so `state` is only touched while the graph is built.
export async function resolvePipeOverrides(node, state, { samplers = [], schedulers = [] } = {}) {
  const row = await readPipeRow(node);
  const { overrides, skipped, meta } = row ? computePipeOverrides(row, { samplers, schedulers }) : { overrides: {}, skipped: [], meta: {} };
  // A connected prompt_override replaces the node's own prompt outright (it wins over the pipe's positive prompt too).
  const text = await readPromptOverride(node);
  if (text) overrides.prompt = text;
  const nApplied = Object.keys(overrides).length;
  if (!nApplied && !skipped.length) return null;
  const parts = [`PromptDB pipe: applied ${nApplied}`];
  if (skipped.length) parts.push(`skipped ${skipped.map(s => `${s.field}(not found)`).join(", ")}`);
  if (meta.note) parts.push(`note: ${meta.note.slice(0, 60)}`);
  return { overrides, skipped, meta, summary: parts.join(" · ") };
}

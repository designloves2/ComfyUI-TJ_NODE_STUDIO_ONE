// core_minimax.js — MiniMax H3 ONE STUDIO (TJ) constants, state, helpers
export const BRAND = "#00B3A4";
export const C = {
  lime: BRAND, bg0: "#0b0b0b", bg1: "#111111", bg2: "#181818",
  bg3: "#222222", border: "#2a2a2a", borderH: "#3c3c3c",
  text: "#dedede", muted: "#565656", dim: "#2e2e2e",
  warn: "#ffb347", err: "#ff6767", ok: "#5fd38d",
};

export const NODE_W       = 1000;
export const PREVIEW_SIZE = 620;
export const LEFT_W       = 320;
export const PAD          = 12;
export const SUBFOLDER    = "one_minimax_h3";
export const API          = "/minimax_h3_one";
export const LS_KEY       = "minimax_h3_one_state_v1";

export const FPS = 24;

// The model only accepts frame counts on the 17k+5 grid (comfy_extras/nodes_minimax_h3.py:
// `while n % 17 != 5: n += 1`). Free-form seconds would silently snap up, so the UI offers
// the exact ladder instead. Trained range is ~124-362 frames.
export const CLIP_LENGTHS = (() => {
  const out = [];
  for (let n = 124; n <= 362; n += 17) {
    const sec = n / FPS;
    out.push({ frames: n, seconds: sec, label: `${sec.toFixed(2)}s  (${n}f)` });
  }
  return out;
})();
export const DEFAULT_FRAMES = 192;   // 8.000s — the only exact-second option at 24fps

export function framesToSeconds(frames) { return frames / FPS; }

export function clipPlan(totalSeconds, clipFrames, avgMinutesPerClip) {
  const clipSec = framesToSeconds(clipFrames);
  const count   = Math.max(1, Math.ceil((totalSeconds || clipSec) / clipSec));
  const actual  = count * clipSec;
  const minutes = count * (avgMinutesPerClip ?? 13);
  return { count, clipSec, actualSeconds: actual, estimateMinutes: minutes };
}

export function formatDuration(minutes) {
  if (!isFinite(minutes) || minutes <= 0) return "—";
  const h = Math.floor(minutes / 60), m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function formatClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export const ASPECTS = [
  { label: "9:16 Portrait",  w: 9,  h: 16 },
  { label: "16:9 Landscape", w: 16, h: 9  },
  { label: "1:1 Square",     w: 1,  h: 1  },
  { label: "4:5 Portrait",   w: 4,  h: 5  },
  { label: "3:4 Portrait",   w: 3,  h: 4  },
  { label: "4:3 Landscape",  w: 4,  h: 3  },
  { label: "21:9 Cinema",    w: 21, h: 9  },
];

// Mirrors the ResolutionSelector node the source workflow used: pick the WxH that hits
// `megapixels` at the chosen aspect, each axis rounded to a multiple of 32.
export function resolveResolution(aspectLabel, megapixels) {
  const a = ASPECTS.find(x => x.label === aspectLabel) || ASPECTS[0];
  const mp = Math.max(0.1, megapixels || 1.0);
  const target = mp * 1_000_000;
  const ratio = a.w / a.h;
  let h = Math.sqrt(target / ratio);
  let w = h * ratio;
  const snap = v => Math.max(32, Math.round(v / 32) * 32);
  return { width: snap(w), height: snap(h) };
}

export const SAMPLERS = [
  "euler", "euler_ancestral", "heun", "dpmpp_2m", "dpmpp_2m_sde", "dpmpp_3m_sde",
  "ddim", "uni_pc", "res_multistep", "er_sde", "lcm", "deis",
];
export const SCHEDULERS = ["simple", "normal", "karras", "exponential", "sgm_uniform", "beta", "ddim_uniform"];

export const GENERATION_MODES = [
  { key: "t2v",       label: "Text only",        hint: "prompt only (T2VA)" },
  { key: "firstlast", label: "First/Last Frame",  hint: "start + end keyframe (FL2VA)" },
  { key: "reference", label: "Reference",         hint: "up to 9 reference images (REF2VA)" },
];
export const ACCEL_MODES  = [
  { key: "turbo",  label: "Turbo LoRA" },
  { key: "solattn", label: "SolAttn" },
  { key: "none",   label: "None" },
];
export const UPSCALE_MODES = [
  { key: "none",  label: "None" },
  { key: "model", label: "Upscale Model" },
  { key: "rtx",   label: "RTX VSR" },
];
export const CONTINUITY_MODES = [
  { key: "lastframe", label: "Last Frame Chain", hint: "each clip starts from the previous clip's final frame" },
  { key: "reference", label: "Reference",        hint: "every clip re-uses the same reference images" },
  { key: "none",      label: "None",             hint: "clips are independent" },
];

export function loadState() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; }
}
export function saveState(s) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch {}
}

export function defaultState(saved) {
  saved = saved || {};
  return {
    // models
    unetFirstLast: saved.unetFirstLast || "",
    unetReference: saved.unetReference || "",
    clipName:      saved.clipName      || "",
    vaeVideo:      saved.vaeVideo      || "",
    vaeAudio:      saved.vaeAudio      || "",
    turboLora:     saved.turboLora     || "",
    turboLoraStrength: saved.turboLoraStrength ?? 1.0,
    turboLoraLowVram:  saved.turboLoraLowVram  ?? false,
    upscaleModel:  saved.upscaleModel  || "",
    loras: Array.isArray(saved.loras) ? saved.loras.map(l => ({
      name: l.name || "none", strength: l.strength ?? 1.0, enabled: l.enabled !== false,
    })) : [],

    // modes
    generationMode: saved.generationMode || "t2v",
    accelMode:      saved.accelMode      || "turbo",
    upscaleMode:    saved.upscaleMode    || "none",
    continuityMode: saved.continuityMode || "lastframe",

    // canvas / length
    aspect:      saved.aspect      || "9:16 Portrait",
    megapixels:  saved.megapixels  ?? 1.0,
    clipFrames:  saved.clipFrames  ?? DEFAULT_FRAMES,
    totalSeconds: saved.totalSeconds ?? 8,
    trimLastClip: saved.trimLastClip ?? false,
    avgMinutesPerClip: saved.avgMinutesPerClip ?? 13,
    unloadBetweenClips: saved.unloadBetweenClips ?? true,

    // prompts — one entry per clip (blank entries reuse the last non-blank one)
    prompts: Array.isArray(saved.prompts) && saved.prompts.length ? saved.prompts.slice() : [""],
    promptSuffix: saved.promptSuffix || "",

    // images
    firstFrameImage: saved.firstFrameImage || null,
    lastFrameImage:  saved.lastFrameImage  || null,
    refImages: Array.isArray(saved.refImages) ? saved.refImages.slice(0, 9) : [],
    refImageSize: saved.refImageSize || "match",

    // sampling
    steps:       saved.steps       ?? 20,
    turboSteps:  saved.turboSteps  ?? 4,
    sampler:     saved.sampler     || "er_sde",
    scheduler:   saved.scheduler   || "simple",
    denoise:     saved.denoise     ?? 1.0,
    seed:        saved.seed        ?? 0,
    seedMode:    saved.seedMode    || "randomize",
    seedPerClip: saved.seedPerClip ?? true,
    shiftVideo:  saved.shiftVideo  ?? 12,
    shiftAudio:  saved.shiftAudio  ?? 3,

    // model patches (defaults lifted from the reference workflow)
    useSageAttn:   saved.useSageAttn   ?? true,
    sageAttnMode:  saved.sageAttnMode  || "auto",
    useMemEffSage: saved.useMemEffSage ?? true,
    useTorchPatch: saved.useTorchPatch ?? true,
    fp16Accum:     saved.fp16Accum     ?? true,
    useCache:      saved.useCache      ?? true,
    cacheThreshold: saved.cacheThreshold ?? 0.3,
    cacheStart:     saved.cacheStart     ?? 0.15,
    cacheEnd:       saved.cacheEnd       ?? 0.9,
    cacheMaxSteps:  saved.cacheMaxSteps  ?? 2,
    solTau:        saved.solTau        ?? 1.3,
    solStart:      saved.solStart      ?? 0.2,
    solEnd:        saved.solEnd        ?? 0.9,
    solMinTokens:  saved.solMinTokens  ?? 4096,

    // upscale params
    rtxScale:   saved.rtxScale   ?? 2.0,
    rtxQuality: saved.rtxQuality || "ULTRA",

    // preview (ModelPreviewOverrideKJ)
    previewEnabled:  saved.previewEnabled  ?? true,
    previewFrames:   saved.previewFrames   ?? 8,
    previewFps:      saved.previewFps      ?? 12,
    previewMaxRes:   saved.previewMaxRes   ?? 512,
    previewQuality:  saved.previewQuality  ?? 85,
    previewTinyVae:  saved.previewTinyVae  || "none",

    // output
    saveSubfolder: saved.saveSubfolder || "",
    filenamePrefix: saved.filenamePrefix || "MMH3",
    stitchAtEnd:   saved.stitchAtEnd   ?? true,
  };
}

export function el(tag, props, children) {
  const node = document.createElement(tag);
  if (props) {
    for (const k in props) {
      if (k === "style") Object.assign(node.style, props.style);
      else if (k === "text") node.textContent = props.text;
      else if (k === "html") node.innerHTML = props.html;
      else if (k.startsWith("on") && typeof props[k] === "function") node.addEventListener(k.slice(2), props[k]);
      else node.setAttribute(k, props[k]);
    }
  }
  (children || []).forEach(c => { if (c) node.appendChild(c); });
  return node;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
export function randomSeed() { return Math.floor(Math.random() * 1e15); }

// Split a long brief into per-clip prompts. Handles the `[Shot N] 0.0~3.0s` timecode
// format emitted by the minimax-h3-prompt skill, plus plain `---` separators.
export function splitBrief(text, clipCount) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  if (raw.includes("---")) {
    const parts = raw.split(/^\s*-{3,}\s*$/m).map(s => s.trim()).filter(Boolean);
    if (parts.length > 1) return parts;
  }
  const shotRe = /^\s*\[(?:Shot|SHOT|샷)\s*\d+\][^\n]*$/gm;
  if (shotRe.test(raw)) {
    shotRe.lastIndex = 0;
    const idx = [];
    let m;
    while ((m = shotRe.exec(raw)) !== null) idx.push(m.index);
    if (idx.length > 1) {
      const parts = [];
      for (let i = 0; i < idx.length; i++) {
        parts.push(raw.slice(idx[i], i + 1 < idx.length ? idx[i + 1] : undefined).trim());
      }
      return parts;
    }
  }
  const paras = raw.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
  if (clipCount && paras.length > clipCount) {
    // fold extra paragraphs into the last clip rather than dropping them
    const head = paras.slice(0, clipCount - 1);
    head.push(paras.slice(clipCount - 1).join("\n\n"));
    return head;
  }
  return paras.length ? paras : [raw];
}

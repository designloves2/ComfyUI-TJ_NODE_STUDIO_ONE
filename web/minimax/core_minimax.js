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
  { key: "turbo",    label: "Turbo LoRA", node: "MiniMaxH3TurboLoRA" },
  { key: "solattn",  label: "SolAttn",    node: "SolAttnPatch" },
  { key: "spectrum", label: "Spectrum",   node: "SpectrumApplyMiniMaxH3" },
  { key: "none",     label: "None",       node: null },
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

    // prompts — one entry per clip (blank entries reuse the last non-blank one).
    // header/footer are the parts every clip shares (style preamble, ambient/music tail);
    // they are stored apart so splitting into clips never throws them away.
    prompts: Array.isArray(saved.prompts) && saved.prompts.length ? saved.prompts.slice() : [""],
    promptHeader: saved.promptHeader || "",
    promptFooter: saved.promptFooter || "",
    promptSuffix: saved.promptSuffix || "",

    // images
    firstFrameImage: saved.firstFrameImage || null,
    lastFrameImage:  saved.lastFrameImage  || null,
    refImages: Array.isArray(saved.refImages) ? saved.refImages.slice(0, 9) : [],
    refImageSize: saved.refImageSize || "match",
    // Reference videos / audios (REF2VA). The model takes up to 3 of each; videos are
    // fed as 24fps frames plus, optionally, their own soundtrack. start/end are seconds
    // — the trained window for a reference video is ~2-15s, so clipping matters.
    refVideos: Array.isArray(saved.refVideos) ? saved.refVideos.slice(0, 3).map(v => ({
      file: v.file || "", start: v.start ?? 0, end: v.end ?? 5, withAudio: v.withAudio !== false,
    })) : [],
    refAudios: Array.isArray(saved.refAudios) ? saved.refAudios.slice(0, 3).map(a => ({
      file: a.file || "", start: a.start ?? 0, end: a.end ?? 5,
    })) : [],
    // which reference kinds are shown in the side panel (keeps it short by default)
    refTypes: {
      images: saved.refTypes?.images !== false,
      videos: saved.refTypes?.videos ?? false,
      audios: saved.refTypes?.audios ?? false,
    },

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
    // Spectrum (SpectrumApplyMiniMaxH3) — node defaults
    specBlendWeight:  saved.specBlendWeight  ?? 0.5,
    specDegree:       saved.specDegree       ?? 1,
    specRidgeLambda:  saved.specRidgeLambda  ?? 0.1,
    specWindowSize:   saved.specWindowSize   ?? 2.0,
    specFlexWindow:   saved.specFlexWindow   ?? 0.75,
    specWarmupSteps:  saved.specWarmupSteps  ?? 1,
    specTailSteps:    saved.specTailSteps    ?? 1,
    specMaxHistory:   saved.specMaxHistory   ?? 8,
    specHistoryStore: saved.specHistoryStore || "system_ram",

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

    // Ollama prompt enhance
    ollamaUrl:         saved.ollamaUrl         || "http://127.0.0.1:11434",
    ollamaModel:       saved.ollamaModel       || "",
    ollamaTemperature: saved.ollamaTemperature ?? 0.7,
    ollamaTopP:        saved.ollamaTopP        ?? 0.9,
    ollamaImage:       saved.ollamaImage       || null,

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

// A MiniMax brief is three parts, not just a list of shots: a preamble that sets the
// visual style and opening composition, the [Shot N] blocks, and trailing
// "Ambient sound:" / "Music:" paragraphs. The preamble and tail apply to every clip, so
// they are kept aside and re-attached at queue time instead of being split away.
const SHOT_LINE_RE = /^[ \t]*\[(?:Shot|SHOT|샷)[ \t]*\d+\][^\n]*$/gm;
const TAIL_RE = /^[ \t]*(?:Ambient sound|Ambience|Sound|Music|Soundtrack|배경음|음악|사운드)[ \t]*:/i;

/** Split a brief into { header, shots[], footer }. Never loses text. */
export function parseBrief(text) {
  const raw = String(text || "").trim();
  if (!raw) return { header: "", shots: [], footer: "" };

  SHOT_LINE_RE.lastIndex = 0;
  const starts = [];
  let m;
  while ((m = SHOT_LINE_RE.exec(raw)) !== null) starts.push(m.index);

  if (!starts.length) {
    // No shot markers — fall back to `---` groups, else treat the whole thing as one shot.
    const parts = raw.split(/^\s*-{3,}\s*$/m).map(s => s.trim()).filter(Boolean);
    return parts.length > 1
      ? { header: "", shots: parts, footer: "" }
      : { header: "", shots: [raw], footer: "" };
  }

  const header = raw.slice(0, starts[0]).trim();
  const blocks = starts.map((s, i) => raw.slice(s, i + 1 < starts.length ? starts[i + 1] : undefined).trim());

  // The tail lives inside the last block; cut it at the first "Ambient sound:"-style line.
  let footer = "";
  const last = blocks[blocks.length - 1];
  const lines = last.split("\n");
  let cut = -1;
  for (let i = 1; i < lines.length; i++) {
    if (TAIL_RE.test(lines[i])) { cut = i; break; }
  }
  if (cut > 0) {
    blocks[blocks.length - 1] = lines.slice(0, cut).join("\n").trim();
    footer = lines.slice(cut).join("\n").trim();
  }
  return { header, shots: blocks.filter(Boolean), footer };
}

/**
 * Group shots into `groups` clips. `breaks` is a set of shot indices that start a new
 * clip; when omitted the shots are spread as evenly as possible.
 */
export function groupShots(shots, groups, breaks) {
  if (!shots.length) return [];
  if (breaks && breaks.length) {
    const cuts = [...new Set(breaks)].filter(i => i > 0 && i < shots.length).sort((a, b) => a - b);
    const out = [];
    let prev = 0;
    for (const c of cuts) { out.push(shots.slice(prev, c)); prev = c; }
    out.push(shots.slice(prev));
    return out.map(g => g.join("\n\n"));
  }
  const n = Math.max(1, Math.min(groups || 1, shots.length));
  const per = Math.ceil(shots.length / n);
  const out = [];
  for (let i = 0; i < shots.length; i += per) out.push(shots.slice(i, i + per).join("\n\n"));
  return out;
}

/** Default break points that spread `count` shots over `groups` clips. */
export function evenBreaks(count, groups) {
  const n = Math.max(1, Math.min(groups || 1, count));
  const per = Math.ceil(count / n);
  const b = [];
  for (let i = per; i < count; i += per) b.push(i);
  return b;
}

/** What actually gets sent for clip `i`: common header + that clip's shots + common tail. */
export function composeClipPrompt(state, i) {
  const list = state.prompts || [];
  let body = "";
  for (let k = Math.min(i, list.length - 1); k >= 0; k--) {
    if (list[k] && list[k].trim()) { body = list[k].trim(); break; }
  }
  return [state.promptHeader, body, state.promptFooter, state.promptSuffix]
    .map(s => (s || "").trim()).filter(Boolean).join("\n\n");
}

// Kept for the plain "split this text" path (no header/footer awareness).
export function splitBrief(text, clipCount) {
  const { header, shots, footer } = parseBrief(text);
  if (!shots.length) return [];
  const groups = groupShots(shots, clipCount || shots.length);
  if (!header && !footer) return groups;
  return groups.map((g, i) => [i === 0 ? header : "", g, i === groups.length - 1 ? footer : ""]
    .filter(Boolean).join("\n\n"));
}

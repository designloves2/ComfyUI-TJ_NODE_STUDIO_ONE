// core_qwen2511.js — Qwen Image Edit 2511 ONE (TJ)
export const BRAND = "#7612DA"; // unified brand color
export const C = {
  brand: BRAND,
  bg0: "#0b0b0b", bg1: "#111111", bg2: "#181818",
  bg3: "#222222", border: "#2a2a2a", borderH: "#3c3c3c",
  text: "#dedede", muted: "#565656", dim: "#2e2e2e",
  warn: "#ffb347", err: "#ff6767",
  lime: BRAND,  // alias used by shared Klein UI components
};

export const NODE_W       = 980;
export const PREVIEW_SIZE = 640;
export const LEFT_W       = 300;
export const PAD          = 12;
export const SUBFOLDER    = "qwen2511-one-tj";
export const API          = "/qwen2511_one";
export const LS_KEY       = "qwen2511_one_tj_state_v1";

export const SAMPLERS   = ["euler","euler_ancestral","er_sde","dpm_2","dpm_2_ancestral","lms","dpm_fast","heun","dpm_pp_2m"];
export const SCHEDULERS = ["simple","normal","karras","exponential","sgm_uniform","beta"];

export const SEEDVR2_ATTN_MODES  = ["sdpa","flash_attn_2","flash_attn_3","sageattn_2","sageattn_3"];
export const SEEDVR2_COLOR_MODES = ["lab","wavelet","wavelet_adaptive","hsv","adain","none"];

export const AZIMUTH_PRESETS = [
  { label:"Front (0°)",            value: 0   },
  { label:"Front-Right (45°)",     value: 45  },
  { label:"Right (90°)",           value: 90  },
  { label:"Back-Right (135°)",     value: 135 },
  { label:"Back (180°)",           value: 180 },
  { label:"Back-Left (225°)",      value: 225 },
  { label:"Left (270°)",           value: 270 },
  { label:"Front-Left (315°)",     value: 315 },
];
export const ELEVATION_PRESETS = [
  { label:"Low Angle (-30°)",      value: -30 },
  { label:"Eye Level (0°)",        value: 0   },
  { label:"Elevated (30°)",        value: 30  },
  { label:"High Angle (60°)",      value: 60  },
];
export const ZOOM_PRESETS = [
  { label:"Wide Shot (1)",         value: 1   },
  { label:"Medium Shot (4)",       value: 4   },
  { label:"Close-up (8)",          value: 8   },
];

export function buildAnglePrompt(h, v, z) {
  const ha = ((h % 360) + 360) % 360;
  let hDir;
  if      (ha < 22.5 || ha >= 337.5) hDir = "front view";
  else if (ha < 67.5)   hDir = "front-right quarter view";
  else if (ha < 112.5)  hDir = "right side view";
  else if (ha < 157.5)  hDir = "back-right quarter view";
  else if (ha < 202.5)  hDir = "back view";
  else if (ha < 247.5)  hDir = "back-left quarter view";
  else if (ha < 292.5)  hDir = "left side view";
  else                  hDir = "front-left quarter view";

  const vDir = v < -15 ? "high-angle shot" : v < 15 ? "eye-level shot" : v < 45 ? "elevated shot" : "low-angle shot";
  const dist = z < 4   ? "close-up"       : z < 7   ? "medium shot"    : "wide shot";
  return `<sks> ${hDir} ${vDir} ${dist}`;
}

export function loadState() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; }
}
export function saveState(s) {
  try {
    const SKIP = new Set(["inpaintMaskOverlay","inpaintMaskDataURL"]);
    const clean = {};
    for (const k in s) if (!SKIP.has(k)) clean[k] = s[k];
    localStorage.setItem(LS_KEY, JSON.stringify(clean));
  } catch {}
}

export function defaultState(saved) {
  saved = saved || {};
  return {
    mode: saved.mode || "edit",
    model:        saved.model        || "",
    textEncoder:  saved.textEncoder  || "",
    vae:          saved.vae          || "",

    prompt:        saved.prompt        || "",
    promptsByMode: saved.promptsByMode || {},
    negativePrompt: saved.negativePrompt || "",
    promptSuffix:  saved.promptSuffix  || "",

    width:  saved.width  || 1024,
    height: saved.height || 1024,

    steps:     saved.steps     !== undefined ? saved.steps     : 20,
    cfg:       saved.cfg       !== undefined ? saved.cfg       : 4.0,
    sampler:   saved.sampler   || "euler",
    scheduler: saved.scheduler || "simple",
    seed:      saved.seed      ?? 0,
    seedMode:  saved.seedMode  || "randomize",

    // Lightning LoRA (optional speed LoRA)
    lightningLora: saved.lightningLora
      ? { name: saved.lightningLora.name || "none", strength: saved.lightningLora.strength ?? 1, enabled: saved.lightningLora.enabled !== false }
      : { name: "none", strength: 1, enabled: false },

    loras: Array.isArray(saved.loras)
      ? saved.loras.map(l => ({ name: l.name || "none", strength: l.strength ?? 1, triggerWord: l.triggerWord || "", enabled: l.enabled !== false }))
      : [],

    // I2I
    i2iImage:   saved.i2iImage   || null,
    i2iDenoise: saved.i2iDenoise ?? 0.75,

    // Edit
    editImage1:     saved.editImage1     || null,
    editImage2:     saved.editImage2     || null,
    editRefImages:  Array.isArray(saved.editRefImages) ? saved.editRefImages : [],
    editSizeSource: saved.editSizeSource || "img1",

    // Inpaint / Outpaint
    paintSubMode:     saved.paintSubMode     || "inpaint",
    inpaintImage:     saved.inpaintImage     || null,
    inpaintMaskImage: saved.inpaintMaskImage || null,
    inpaintDenoise:   saved.inpaintDenoise   ?? 0.85,
    outpaintUp:       saved.outpaintUp       ?? 0,
    outpaintDown:     saved.outpaintDown     ?? 0,
    outpaintLeft:     saved.outpaintLeft     ?? 0,
    outpaintRight:    saved.outpaintRight    ?? 0,
    outpaintPadR:     saved.outpaintPadR     ?? 0,
    outpaintPadG:     saved.outpaintPadG     ?? 0,
    outpaintPadB:     saved.outpaintPadB     ?? 0,

    // Faceswap
    faceswapTarget:  saved.faceswapTarget  || null,
    faceswapSource:  saved.faceswapSource  || null,
    faceswapDenoise: saved.faceswapDenoise ?? 1.0,
    bfsLora: saved.bfsLora
      ? { name: saved.bfsLora.name || "none", strength: saved.bfsLora.strength ?? 1, enabled: saved.bfsLora.enabled !== false }
      : null,

    // Angle Change
    angleCameraImage: saved.angleCameraImage || null,
    angleHorizontal:  saved.angleHorizontal  ?? 0,
    angleVertical:    saved.angleVertical    ?? 0,
    angleZoom:        saved.angleZoom        ?? 5,
    angleLora: saved.angleLora
      ? { name: saved.angleLora.name || "none", strength: saved.angleLora.strength ?? 1, enabled: saved.angleLora.enabled !== false }
      : { name: "none", strength: 1, enabled: true },

    // Upscale (SeedVR2)
    upscaleImage:            saved.upscaleImage            || null,
    upscaleDitModel:         saved.upscaleDitModel         || "none",
    upscaleVaeModel:         saved.upscaleVaeModel         || "none",
    upscaleResolution:       saved.upscaleResolution       ?? 2048,
    upscaleMaxResolution:    saved.upscaleMaxResolution    ?? 4096,
    upscaleBatchSize:        saved.upscaleBatchSize        ?? 1,
    upscaleBlocksToSwap:     saved.upscaleBlocksToSwap     ?? 0,
    upscaleAttentionMode:    saved.upscaleAttentionMode    || "sdpa",
    upscaleColorCorrection:  saved.upscaleColorCorrection  || "lab",
    upscaleOffloadDevice:    (saved.upscaleOffloadDevice && saved.upscaleOffloadDevice !== "none") ? saved.upscaleOffloadDevice : "cpu",
    upscaleInputNoiseScale:  saved.upscaleInputNoiseScale  ?? 0,
    upscaleLatentNoiseScale: saved.upscaleLatentNoiseScale ?? 0,

    outputMode:    saved.outputMode    || "save",
    saveSubfolder: saved.saveSubfolder || "",
  };
}

export function el(tag, props, children) {
  const node = document.createElement(tag);
  if (props) {
    for (const k in props) {
      if      (k === "style")                          Object.assign(node.style, props.style);
      else if (k === "text")                           node.textContent = props.text;
      else if (k === "html")                           node.innerHTML   = props.html;
      else if (k.startsWith("on") && typeof props[k] === "function") node.addEventListener(k.slice(2), props[k]);
      else                                             node.setAttribute(k, props[k]);
    }
  }
  (children || []).forEach(c => { if (c) node.appendChild(c); });
  return node;
}
export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
export function randomSeed() { return Math.floor(Math.random() * 1e15); }

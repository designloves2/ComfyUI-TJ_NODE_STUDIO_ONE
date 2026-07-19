// core_krea2.js — Krea 2 ONE STUDIO constants, state, helpers
export const BRAND   = "#7612DA";
export const C = {
  lime: BRAND, bg0: "#0b0b0b", bg1: "#111111", bg2: "#181818",
  bg3: "#222222", border: "#2a2a2a", borderH: "#3c3c3c",
  text: "#dedede", muted: "#565656", dim: "#2e2e2e",
  warn: "#ffb347", err: "#ff6767",
};

export const NODE_W       = 980;
export const PREVIEW_SIZE = 640;
export const LEFT_W       = 300;
export const PAD          = 12;
export const SUBFOLDER    = "krea2-one-tj";
export const API          = "/krea2_one";
export const LS_KEY       = "krea2_one_state_v1";

export const RESOLUTIONS = [
  { label: "1024 × 1024",  w: 1024, h: 1024 },
  { label: "1024 × 1536",  w: 1024, h: 1536 },
  { label: "1536 × 1024",  w: 1536, h: 1024 },
  { label: "1536 × 1536",  w: 1536, h: 1536 },
  { label: "2048 × 2048",  w: 2048, h: 2048 },
  { label: "1152 × 768",   w: 1152, h: 768  },
  { label: "768 × 1152",   w: 768,  h: 1152 },
  { label: "1152 × 864",   w: 1152, h: 864  },
  { label: "864 × 1152",   w: 864,  h: 1152 },
  { label: "1280 × 720",   w: 1280, h: 720  },
  { label: "720 × 1280",   w: 720,  h: 1280 },
  { label: "1920 × 1080",  w: 1920, h: 1080 },
  { label: "1080 × 1920",  w: 1080, h: 1920 },
  { label: "Custom",       w: 0,    h: 0    },
];

export const SAMPLERS   = ["euler", "dpmpp_2m_sde", "dpmpp_2m", "euler_ancestral", "heun"];
export const SCHEDULERS = ["simple", "sgm_uniform", "karras", "normal", "exponential"];
export const LORA_MAX   = 4;

// DepthAnythingV2 checkpoints publicly downloadable via comfyui_controlnet_aux.
// NOTE: vitg (Giant) is intentionally excluded — its HF repo is gated/unavailable
// (download returns 401), so selecting it would break generation.
export const DEPTH_CKPTS = [
  "depth_anything_v2_vitl.pth",
  "depth_anything_v2_vitb.pth",
  "depth_anything_v2_vits.pth",
];

// Coerce an unknown / unavailable depth ckpt (e.g. saved vitg) back to the default.
export function safeDepthCkpt(name) {
  return DEPTH_CKPTS.includes(name) ? name : "depth_anything_v2_vitl.pth";
}

// SeedVR2 options
export const SEEDVR2_ATTN_MODES  = ["sdpa", "flash_attn_2", "flash_attn_3", "sageattn_2", "sageattn_3"];
export const SEEDVR2_COLOR_MODES = ["lab", "wavelet", "wavelet_adaptive", "hsv", "adain", "none"];

export function loadState() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; }
}
export function saveState(s) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch {}
}

export function defaultState(saved) {
  saved = saved || {};
  return {
    mode: saved.mode || "t2i",
    model: saved.model || "",
    textEncoder: saved.textEncoder || "",
    vae: saved.vae || "",

    prompt: saved.prompt || "",
    promptsByMode: saved.promptsByMode || {},
    promptSuffix: saved.promptSuffix || "",

    width:  saved.width  || 1024,
    height: saved.height || 1024,

    steps:     saved.steps     ?? 8,
    cfg:       saved.cfg       ?? 1,
    sampler:   saved.sampler   || "euler",
    scheduler: saved.scheduler || "simple",
    seed:      saved.seed      ?? 0,
    seedMode:  saved.seedMode  || "randomize",

    loras: Array.isArray(saved.loras) ? saved.loras.map(l => ({
      name: l.name || "none",
      strength: l.strength ?? 0.8,
      enabled: l.enabled !== false,
    })) : [],

    // I2I
    i2iImage:     saved.i2iImage     || null,
    i2iWidth:     saved.i2iWidth     || null,
    i2iHeight:    saved.i2iHeight    || null,
    i2iLockRatio: saved.i2iLockRatio ?? true,
    i2iDenoise:   saved.i2iDenoise   ?? 0.75,

    // ControlNet — Krea2 Control LoRA. Two LoRAs (depth / canny) configured once in
    // Settings; the side-menu picks which type per generation. Preprocessing params
    // (channel/normalize) are derived from the type automatically. The uploaded control
    // image is a normal photo — the app runs the depth/canny preprocessor on it.
    controlType:        saved.controlType        || "canny",   // "canny" | "depth" (canny default)
    controlLoraDepth:   saved.controlLoraDepth   ?? saved.controlLora ?? "none",
    controlLoraCanny:   saved.controlLoraCanny   ?? "none",
    controlStrength:    saved.controlStrength    ?? saved.i2iControlStrength    ?? 1.0,
    // Depth encode options (Krea2ControlImageEncode) — match the reference workflow:
    // rgb + per_image_minmax + bicubic. Canny (NK2E path) ignores these.
    controlChannelMode: saved.controlChannelMode ?? "rgb",
    controlNormalize:   saved.controlNormalize   ?? "per_image_minmax",
    controlInvert:      saved.controlInvert      ?? false,
    // Canny preprocessor
    cannyLow:           saved.cannyLow           ?? 100,
    cannyHigh:          saved.cannyHigh          ?? 200,
    // Depth preprocessor
    depthCkpt:          safeDepthCkpt(saved.depthCkpt),
    preprocResolution:  saved.preprocResolution  ?? 512,

    // ControlNet — per-mode enable + control image (+ its natural pixel size, so the
    // generation can match the control image's aspect ratio at the set long edge)
    t2iControlEnabled: saved.t2iControlEnabled ?? false,
    t2iControlImage:   saved.t2iControlImage   || null,
    t2iControlImageW:  saved.t2iControlImageW  || null,
    t2iControlImageH:  saved.t2iControlImageH  || null,
    i2iControlEnabled: saved.i2iControlEnabled ?? false,
    i2iControlImage:   saved.i2iControlImage   || (saved.i2iControlImage ?? null),
    i2iControlImageW:  saved.i2iControlImageW  || null,
    i2iControlImageH:  saved.i2iControlImageH  || null,

    // IDENTITY EDIT (comfyui-krea2edit + krea2 identity edit LoRA)
    identityImage:       saved.identityImage       || null,
    identityImageB:      saved.identityImageB      || null,
    identityWidth:       saved.identityWidth       || null,
    identityHeight:      saved.identityHeight      || null,
    identityLockRatio:   saved.identityLockRatio   ?? true,
    identityRefBoost:    saved.identityRefBoost    ?? 1.0,
    identityGroundingPx: saved.identityGroundingPx ?? 768,
    identityFitMode:     saved.identityFitMode     || "fit",
    // configured once in Settings:
    identityLora:         saved.identityLora         || "none",
    identityLoraStrength: saved.identityLoraStrength ?? 1.0,

    // UPSCALE — SeedVR2
    upscaleImage:            saved.upscaleImage            || null,
    upscaleDitModel:         saved.upscaleDitModel         || "none",
    upscaleVaeModel:         saved.upscaleVaeModel         || "none",
    upscaleResolution:       saved.upscaleResolution       ?? 2048,
    upscaleMaxResolution:    saved.upscaleMaxResolution    ?? 4096,
    upscaleBatchSize:        saved.upscaleBatchSize        ?? 1,
    upscaleBlocksToSwap:     saved.upscaleBlocksToSwap     ?? 0,
    upscaleAttentionMode:    saved.upscaleAttentionMode    || "sdpa",
    upscaleColorCorrection:  saved.upscaleColorCorrection  || "lab",
    upscaleOffloadDevice:    (saved.upscaleOffloadDevice && saved.upscaleOffloadDevice !== "none")
                               ? saved.upscaleOffloadDevice : "cpu",
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

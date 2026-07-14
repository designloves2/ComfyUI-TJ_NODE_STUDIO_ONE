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

    // ControlNet — LoRA + processing params configured globally in Settings
    // (function-specific control LoRA held ready; params depend on LoRA type)
    controlLora:        saved.controlLora        ?? saved.i2iControlLora        ?? "none",
    controlStrength:    saved.controlStrength    ?? saved.i2iControlStrength    ?? 1.0,
    controlChannelMode: saved.controlChannelMode ?? saved.i2iControlChannelMode ?? "rgb",
    controlNormalize:   saved.controlNormalize   ?? saved.i2iControlNormalize   ?? "none",
    controlInvert:      saved.controlInvert      ?? saved.i2iControlInvert      ?? false,

    // ControlNet — per-mode enable + control image
    t2iControlEnabled: saved.t2iControlEnabled ?? false,
    t2iControlImage:   saved.t2iControlImage   || null,
    i2iControlEnabled: saved.i2iControlEnabled ?? false,
    i2iControlImage:   saved.i2iControlImage   || (saved.i2iControlImage ?? null),

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

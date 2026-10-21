import { SAMPLERS as SHARED_SAMPLERS, SCHEDULERS as SHARED_SCHEDULERS } from "../shared/sampler_lists.js";
// core_moss.js — Moss Image ONE STUDIO constants, state, helpers
export const BRAND = "#7612DA";
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
export const SUBFOLDER    = "moss-image-one-tj";
export const API          = "/moss_one";
export const LS_KEY       = "moss_image_one_state_v1";

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

// MOSS-Image needs width and height in multiples of 16 (1080 is not): the size actually rendered.
export const snap16 = v => Math.max(64, Math.round(v / 16) * 16);
export function workSize(state) { return { w: snap16(state.width || 1024), h: snap16(state.height || 1024) }; }

export const SAMPLERS   = SHARED_SAMPLERS;
export const SCHEDULERS = SHARED_SCHEDULERS;

// MOSS-Image defaults (ComfyUI MOSS-Image template): 25 steps / CFG 2.5 / er_sde / simple.
export const DEFAULT_STEPS = 25;
export const DEFAULT_CFG   = 2.5;
export const DEFAULT_NEGATIVE = "nsfw, worst quality, bad anatomy, watermark, jpeg artifact";

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

    // Models (Settings)
    model:       saved.model       || "",   // moss_image_sft_* (or moss_image_base_*)
    textEncoder: saved.textEncoder || "",   // qwen3.5_9b_* (CLIPLoader type moss_image)
    vae:         saved.vae         || "",   // flux2-vae

    // Runs Prompt Enhance on the current prompt right before Generate, updating the PROMPT field in place.
    autoEnhance: saved.autoEnhance ?? false,

    prompt:        saved.prompt        || "",
    promptsByMode: saved.promptsByMode || {},
    negativePrompt: saved.negativePrompt ?? DEFAULT_NEGATIVE,

    width:  saved.width  || 1024,
    height: saved.height || 1024,

    loras: Array.isArray(saved.loras) ? saved.loras.map(l => ({
      name: l.name || "none",
      strength: l.strength ?? 0.8,
      triggerWord: l.triggerWord || "",
      enabled: l.enabled !== false,
    })) : [],

    steps:     saved.steps     ?? DEFAULT_STEPS,
    cfg:       saved.cfg       ?? DEFAULT_CFG,
    sampler:   saved.sampler   || "er_sde",
    scheduler: saved.scheduler || "simple",
    seed:      saved.seed      ?? 0,
    seedMode:  saved.seedMode  || "randomize",

    // Skip layer guidance on the model (official layer 22; off = more detail collapse risk gone, anime can overblow)
    slgEnabled: saved.slgEnabled ?? false,
    slgLayers:  saved.slgLayers  || "22",
    slgStart:   saved.slgStart   ?? 0,
    slgEnd:     saved.slgEnd     ?? 0.5,

    // I2I — source image encoded to a latent and re-noised (MOSS has no reference-image input)
    i2iImage:   saved.i2iImage   || null,
    i2iDenoise: saved.i2iDenoise ?? 0.6,
    i2iWidth:   saved.i2iWidth   || 0,    // the source's own size (set on upload); 0 = use width / height
    i2iHeight:  saved.i2iHeight  || 0,
    i2iLockRatio: saved.i2iLockRatio ?? true,

    // R2I — region (bounding box) layout. Boxes are in canvas pixels of width x height.
    // { x, y, width, height, metadata: { type: "obj"|"text", text, desc, palette: [] } }
    r2iBoxes:      Array.isArray(saved.r2iBoxes) ? saved.r2iBoxes : [],
    r2iCharacters: saved.r2iCharacters || "",   // numbers of the object boxes to label as characters, e.g. "1, 3"

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

export const MANUAL_TEXT = `MOSS-Image is an open ~5B text-to-image model (single-stream DiT, FLUX.2 small VAE, Qwen3.5 text encoder). Strong at English / Chinese text rendering and layout control. Apache 2.0.

MODES
• T2I — prompt to image.
• I2I — the source image is encoded to a latent and re-noised; DENOISE sets how far it may change. (MOSS itself has no reference-image input.)
• R2I (bboxes) — draw boxes on the canvas. Each box is an OBJECT (a described thing) or a TEXT block (exact words to render). Boxes go through MOSSImageLayoutPrompt, which turns them plus your PROMPT (description of the whole image) into the layout prompt the model was trained on. Draw the background element first and foreground last. "Characters" = numbers of the object boxes to label as characters, e.g. 1, 3.

SIZE
Total pixels of 1M, 1.5M or 2M are recommended (0.25M to 4M works). Width and height must be multiples of 16.

SAMPLING (ComfyUI template defaults)
25 steps / CFG 2.5 / er_sde / simple. The official defaults are 50 steps / CFG 3 / Euler. SFT checkpoints give clearer text layouts; Base has no post-training (better for LoRAs).
SLG (skip layer guidance, layer 22) is optional: off looks more realistic, on keeps detail but can overblow anime styles.
Recommended negative prompt: nsfw, worst quality, bad anatomy, watermark, jpeg artifact

REQUIRED FILES (Hugging Face: Comfy-Org/MOSS-Image)
• moss_image_sft_int8_convrot.safetensors (or moss_image_sft_bf16 / moss_image_base_*) → models/diffusion_models/
• qwen3.5_9b_w4a8_gptq.safetensors (loaded as CLIP type moss_image) → models/text_encoders/
• flux2-vae.safetensors (flux2-vae_small.safetensors) → models/vae/

Needs a ComfyUI recent enough to have the MOSS-Image nodes (EmptyFlux2LatentImage, MOSSImageLayoutPrompt, CreateBoundingBoxes).`;

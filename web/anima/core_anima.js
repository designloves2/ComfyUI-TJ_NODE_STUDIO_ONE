// core_anima.js — Anima ONE STUDIO constants, state, helpers
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
export const SUBFOLDER    = "anima-one-tj";
export const API          = "/anima_one";
export const LS_KEY       = "anima_one_state_v1";

export const RESOLUTIONS = [
  { label: "1024 × 1024",  w: 1024, h: 1024 },
  { label: "1024 × 1536",  w: 1024, h: 1536 },
  { label: "1536 × 1024",  w: 1536, h: 1024 },
  { label: "1152 × 768",   w: 1152, h: 768  },
  { label: "768 × 1152",   w: 768,  h: 1152 },
  { label: "1280 × 720",   w: 1280, h: 720  },
  { label: "720 × 1280",   w: 720,  h: 1280 },
  { label: "Custom",       w: 0,    h: 0    },
];

export const SAMPLERS   = ["euler", "dpmpp_2m_sde", "dpmpp_2m", "euler_ancestral", "heun"];
export const SCHEDULERS = ["simple", "sgm_uniform", "karras", "normal", "exponential"];

// LLLite control-patch filenames per official ComfyUI Anima templates.
export const LLLITE_PATCH = {
  inpaint:      "anima-lllite-inpainting-v2.safetensors",
  anycontrol:   "anima-lllite-any-test-like-v2.safetensors",
  depthcontrol: "anima-lllite-depth-1.safetensors",
};

export const TURBO_LORA_DEFAULT = "anima-turbo-lora-v0.2.safetensors";

// Steps/CFG switch exactly matches the official template's ComfySwitchNode gating.
export const BASE_STEPS  = 30;
export const BASE_CFG    = 4;
export const TURBO_STEPS = 8;
export const TURBO_CFG   = 1;

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
    model:        saved.model        || "",   // Base 1.0 (all modes) or Preview3 for T2I
    previewModel:  saved.previewModel  || "",   // anima-preview3-base.safetensors
    textEncoder:  saved.textEncoder  || "",
    vae:          saved.vae          || "",
    turboLora:    saved.turboLora    || "",

    prompt:        saved.prompt        || "",
    promptsByMode: saved.promptsByMode || {},
    negativePrompt: saved.negativePrompt || "",

    width:  saved.width  || 1024,
    height: saved.height || 1024,

    useBaseVariant: saved.useBaseVariant || "base", // "base" | "preview3" — T2I only
    turboMode:      saved.turboMode ?? false,
    steps:     saved.steps     ?? BASE_STEPS,
    cfg:       saved.cfg       ?? BASE_CFG,
    sampler:   saved.sampler   || "euler",
    scheduler: saved.scheduler || "simple",
    seed:      saved.seed      ?? 0,
    seedMode:  saved.seedMode  || "randomize",

    // Inpainting
    inpaintImage:    saved.inpaintImage    || null,
    inpaintMask:     saved.inpaintMask     || null,
    inpaintStrength: saved.inpaintStrength ?? 1.0,
    inpaintStart:    saved.inpaintStart    ?? 0.0,
    inpaintEnd:      saved.inpaintEnd      ?? 1.0,

    // Any Control to Image
    anyControlImage:    saved.anyControlImage    || null,
    anyControlMask:      saved.anyControlMask      || null,
    anyControlStrength:  saved.anyControlStrength  ?? 1.0,
    anyControlStart:     saved.anyControlStart     ?? 0.0,
    anyControlEnd:       saved.anyControlEnd       ?? 1.0,

    // Depth Control to Image
    depthControlImage:   saved.depthControlImage   || null,
    depthControlStrength: saved.depthControlStrength ?? 1.0,
    depthControlStart:    saved.depthControlStart    ?? 0.0,
    depthControlEnd:      saved.depthControlEnd      ?? 1.0,
    depthCkpt:            saved.depthCkpt || "depth_anything_v2_vitl.pth",
    preprocResolution:    saved.preprocResolution ?? 512,

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

export const MANUAL_TEXT = `Anima is ComfyUI's native anime/illustration text-to-image model (2B params, non-photorealistic by design).

MODEL VARIANTS
• Base 1.0 (anima-base-v1.0.safetensors) — full-quality checkpoint, 30 steps / CFG 4. Used by all 4 modes.
• Turbo 1.0 — NOT a separate checkpoint. It is the Turbo LoRA (anima-turbo-lora-v0.2.safetensors) applied on top of Base 1.0, which also switches sampling to 8 steps / CFG 1. Toggle it with the TURBO switch in the left panel.
• Preview3-base (anima-preview3-base.safetensors) — an earlier/experimental checkpoint. T2I mode only. Lower quality than Base 1.0; select it in Settings only if you specifically want to compare.

REQUIRED FILES
• qwen_3_06b_base.safetensors → models/text_encoders/
• qwen_image_vae.safetensors → models/vae/
• anima-base-v1.0.safetensors → models/diffusion_models/
• anima-preview3-base.safetensors (optional, T2I only) → models/diffusion_models/
• anima-turbo-lora-v0.2.safetensors (optional) → models/loras/
• anima-lllite-inpainting-v2.safetensors (Inpainting mode) → models/model_patches/
• anima-lllite-any-test-like-v2.safetensors (Any Control mode) → models/model_patches/
• anima-lllite-depth-1.safetensors (Depth Control mode) → models/model_patches/

CONTROL MECHANISM
Inpainting / Any Control / Depth Control do NOT use a standard ControlNet — they use a lightweight LLLite model patch (ModelPatchLoader → AnimaLLLiteApply) applied directly onto the diffusion model, guided by an image (+ mask for Inpainting).

Depth Control in this app reuses the DepthAnythingV2 preprocessor already installed for other tools in this pack (instead of the official template's Depth-Anything-3 pipeline), so no extra model download is required beyond what Krea2's ControlNet setup already uses.

All files download from the HuggingFace repos: circlestone-labs/Anima, circlestone-labs/Anima-Official-LoRAs, Comfy-Org/Anima-LLLite.`;

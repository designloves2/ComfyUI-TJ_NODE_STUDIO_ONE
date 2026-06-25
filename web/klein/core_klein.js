// core_klein.js — constants, colors, state persistence for flux2 klein One (TJ)
export const LIME = "#7612DA";
export const C = {
  lime: LIME, bg0: "#0b0b0b", bg1: "#111111", bg2: "#181818",
  bg3: "#222222", border: "#2a2a2a", borderH: "#3c3c3c",
  text: "#dedede", muted: "#565656", dim: "#2e2e2e",
  warn: "#ffb347", err: "#ff6767",
};

export const NODE_W       = 980;
export const PREVIEW_SIZE = 640;
export const LEFT_W       = 300;
export const PAD          = 12;
export const SUBFOLDER    = "flux2-klein-one-tj";
export const API          = "/flux_klein";
export const LS_KEY       = "flux2_klein_one_tj_state_v1";

export function loadState(_nodeId) {
  try {
    const key = `${LS_KEY}`;
    const saved = JSON.parse(localStorage.getItem(key) || "{}");
    return defaultState(saved);
  } catch(e) { return defaultState({}); }
}
export function saveState(_nodeId, s) {
  try {
    const SKIP = new Set(["inpaintMaskOverlay","inpaintMaskDataURL"]);
    const clean = {};
    for (const k in s) if (!SKIP.has(k)) clean[k] = s[k];
    localStorage.setItem(LS_KEY, JSON.stringify(clean));
  } catch(e) {}
}

export function defaultState(saved) {
  saved = saved || {};
  const DEFAULT_NEG = "low quality, deformed, blurry, watermark, ugly, bad anatomy, disfigured, mutated, extra limbs, poorly drawn face, bad proportions, gross proportions, jpeg artifacts, overexposed, underexposed";
  return {
    mode: saved.mode || "t2i",
    model:        saved.model        || "",
    textEncoder:  saved.textEncoder  || "",
    vae:          saved.vae          || "",
    kvCacheOverride: saved.kvCacheOverride || "auto",

    prompt:         saved.prompt         || "",
    promptsByMode:  saved.promptsByMode  || {},
    negativePrompt: saved.negativePrompt || DEFAULT_NEG,
    promptSuffix:   saved.promptSuffix   || "",

    width:  saved.width  || 1024,
    height: saved.height || 1536,

    steps:     saved.steps     || 4,
    cfg:       saved.cfg       !== undefined ? saved.cfg       : 1,
    sampler:   saved.sampler   || "euler",
    scheduler: saved.scheduler || "simple",
    seed:      saved.seed      ?? 0,
    seedMode:  saved.seedMode  || "randomize",

    loras: Array.isArray(saved.loras)
      ? saved.loras.map(l => ({
          name: l.name || "none", strength: l.strength ?? 1,
          triggerWord: l.triggerWord || "", enabled: l.enabled !== false,
        }))
      : [],

    i2iImage:   saved.i2iImage   || null,
    i2iDenoise: saved.i2iDenoise ?? 0.75,

    editImage1:     saved.editImage1     || null,
    editImage2:     saved.editImage2     || null,
    editRefImages:  Array.isArray(saved.editRefImages) ? saved.editRefImages : [],
    editSizeSource: saved.editSizeSource || "img1",

    inpaintImage:     saved.inpaintImage     || null,
    inpaintMaskImage: saved.inpaintMaskImage || null,
    inpaintDenoise:   saved.inpaintDenoise   ?? 0.85,

    faceswapTarget:  saved.faceswapTarget  || null,
    faceswapSource:  saved.faceswapSource  || null,
    faceswapDenoise: saved.faceswapDenoise ?? 1.0,

    // UPSCALE (SeedVR2)
    upscaleImage:            saved.upscaleImage            || null,
    upscaleDitModel:         saved.upscaleDitModel         || "none",
    upscaleVaeModel:         saved.upscaleVaeModel         || "none",
    upscaleResolution:       saved.upscaleResolution       ?? 2048,
    upscaleMaxResolution:    saved.upscaleMaxResolution    ?? 4096,
    upscaleBatchSize:        saved.upscaleBatchSize        ?? 1,
    upscaleBlocksToSwap:     saved.upscaleBlocksToSwap     ?? 0,
    upscaleColorCorrection:  saved.upscaleColorCorrection  || "lab",
    upscaleAttentionMode:     saved.upscaleAttentionMode     || "sdpa",
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

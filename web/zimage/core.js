// core.js — shared constants, colors, state persistence, tiny DOM helpers
export const LIME = "#7612DA";   // 브랜드 컬러 (버튼, 슬라이더, 액센트)
export const C = {
  lime: LIME, bg0: "#0b0b0b", bg1: "#111111", bg2: "#181818",
  bg3: "#222222", border: "#2a2a2a", borderH: "#3c3c3c",
  text: "#dedede", muted: "#565656", dim: "#2e2e2e",
  warn: "#ffb347", err: "#ff6767",
};

export const NODE_W       = 980;
export const PREVIEW_SIZE = 640;   // 출력 영역 고정 크기
export const LEFT_W       = 300;
export const PAD          = 12;
export const SUBFOLDER    = "z-image-one-tj";
export const API          = "/z_image_turbo";
export const LS_KEY       = "z_image_one_tj_state_v1";

export function loadState() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); }
  catch (e) { return {}; }
}
export function saveState(s) {
  try {
    // Exclude large binary data that would overflow localStorage
    const SKIP = new Set(["inpaintMaskOverlay","inpaintMaskDataURL"]);
    const clean = {};
    for (const k in s) if (!SKIP.has(k)) clean[k] = s[k];
    localStorage.setItem(LS_KEY, JSON.stringify(clean));
  } catch (e) {}
}

export function defaultState(saved) {
  saved = saved || {};
  return {
    mode: saved.mode || "t2i",
    model: saved.model || "",
    textEncoder: saved.textEncoder || "",
    vae: saved.vae || "",

    prompt: saved.prompt || "",          // legacy fallback
    promptsByMode: saved.promptsByMode || {}, // per-mode independent prompts
    negativePrompt: saved.negativePrompt || "",
    promptSuffix: saved.promptSuffix || "",

    // T2I size
    width: saved.width || 1024,
    height: saved.height || 1536,

    // Sampling — defaults to euler / simple
    steps: saved.steps || 8,
    cfg: saved.cfg || 1,
    shift: saved.shift || 3,
    sampler: saved.sampler || "euler",
    scheduler: saved.scheduler || "simple",
    seed: saved.seed ?? 0,
    seedMode: saved.seedMode || "randomize",

    // LoRAs — [{name, strength, triggerWord, enabled}] max 3
    loras: Array.isArray(saved.loras)
      ? saved.loras.map(l => ({
          name: l.name || "none",
          strength: l.strength ?? 1,
          triggerWord: l.triggerWord || "",
          enabled: l.enabled !== false,
        }))
      : [],

    // I2I
    i2iImage: saved.i2iImage || null,
    i2iDenoise: saved.i2iDenoise ?? 0.75,

    // PAINT
    paintSub: (saved.paintSub === "sketch" || !saved.paintSub) ? "inpaint" : saved.paintSub,
    inpaintImage: saved.inpaintImage || null,
    inpaintMaskImage: saved.inpaintMaskImage || null,
    inpaintEditW: saved.inpaintEditW || null,   // cap-resized mask edit dimensions
    inpaintEditH: saved.inpaintEditH || null,
    inpaintDenoise: saved.inpaintDenoise ?? 0.85,
    inpaintFeather: saved.inpaintFeather ?? 32,

    // OUTPAINT — pixel values
    outpaintImage: saved.outpaintImage || null,
    outpaintDenoise: saved.outpaintDenoise ?? 1,
    outpaintFeather: saved.outpaintFeather ?? 32,
    outpaintUp: saved.outpaintUp ?? 256,
    outpaintDown: saved.outpaintDown ?? 256,
    outpaintLeft: saved.outpaintLeft ?? 0,
    outpaintRight: saved.outpaintRight ?? 0,

    // CONTROLNET
    controlnetModel: saved.controlnetModel || "",
    controlnetImage: saved.controlnetImage || null,
    controlnetType: saved.controlnetType || "depth",
    controlnetStrength: saved.controlnetStrength ?? 1,
    controlnetResolution: saved.controlnetResolution ?? 1024,
    controlnetDenoise: saved.controlnetDenoise ?? 1,

    // FACE REDRAW
    faceImage: saved.faceImage || null,
    faceDetectorModel: saved.faceDetectorModel || "",
    faceThreshold: saved.faceThreshold ?? 0.5,
    faceDilation: saved.faceDilation ?? 4,
    faceFeather: saved.faceFeather ?? 32,
    faceDenoise: saved.faceDenoise ?? 0.55,
    faceControlStrength: saved.faceControlStrength ?? 1,

    // RE-BG (배경 확장 재생성 + RMBG 합성)
    rebgImage:    saved.rebgImage    || null,
    rebgBgModel:  saved.rebgBgModel  || "",
    rebgUp:       saved.rebgUp    ?? 0,
    rebgDown:     saved.rebgDown  ?? 0,
    rebgLeft:     saved.rebgLeft  ?? 0,
    rebgRight:    saved.rebgRight ?? 0,
    rebgFeather:  saved.rebgFeather  ?? 40,
    rebgDenoise:  saved.rebgDenoise  ?? 1,
    rebgOffset:   saved.rebgOffset   ?? 0,
    rebgBlur:     saved.rebgBlur     ?? 0,

    // OUTPUT
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

    outputMode: saved.outputMode || "save",
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

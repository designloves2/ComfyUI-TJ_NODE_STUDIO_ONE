// core_qwen21.js — Qwen Image 2.1 ONE (TJ)
export const BRAND = "#7612DA"; // unified brand color (same family as 2511)
export const C = {
  brand: BRAND,
  bg0: "#0b0b0b", bg1: "#111111", bg2: "#181818",
  bg3: "#222222", border: "#2a2a2a", borderH: "#3c3c3c",
  text: "#dedede", muted: "#565656", dim: "#2e2e2e",
  warn: "#ffb347", err: "#ff6767",
  lime: BRAND,  // alias used by shared Klein UI components
};

export const NODE_W       = 980; // match 2511's own width — user: "노드 높이 동일하나 노드의 가로폭이 다름."
                                  // The Ref-to-Image grid uses small (76px) MiniMax-style slots that wrap
                                  // within this width instead of needing a wider node.
export const PREVIEW_SIZE = 640;
export const LEFT_W       = 300;
export const PAD          = 12;
export const SUBFOLDER    = "qwen21-one-tj";
export const API          = "/qwenimage21_one";
export const LS_KEY       = "qwenimage21_one_tj_state_v1";

export const SAMPLERS   = ["euler","euler_ancestral","er_sde","dpm_2","dpm_2_ancestral","lms","dpm_fast","heun","dpm_pp_2m"];
export const SCHEDULERS = ["simple","normal","karras","exponential","sgm_uniform","beta"];

export const SEEDVR2_ATTN_MODES  = ["sdpa","flash_attn_2","flash_attn_3","sageattn_2","sageattn_3"];
export const SEEDVR2_COLOR_MODES = ["lab","wavelet","wavelet_adaptive","hsv","adain","none"];

export const MAX_REF_IMAGES = 10; // TextEncodeQwenImage21 exposes images.image_1..image_10

// POSE mode — VNCCS PoseStudio LoRA. Image 1 is a SAM3D-Body render of the pose image
// (extracted server-side before the main generation), Image 2 is the character.
export const POSE_SYSTEM_PROMPT_DEFAULT =
  "replace the pose of <image 2> with the pose of <image 1>. keep the character of <image 2>.";
export const POSE_SAM3D_MODEL_DEFAULT = "sam_3d_body_dinov3_bf16.safetensors";

export function loadState() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; }
}
export function saveState(s) {
  try {
    const SKIP = new Set(["inpaintMaskOverlay","inpaintMaskDataURL","editMaskDataURL"]);
    const clean = {};
    for (const k in s) if (!SKIP.has(k)) clean[k] = s[k];
    localStorage.setItem(LS_KEY, JSON.stringify(clean));
  } catch {}
}

export function defaultState(saved) {
  saved = saved || {};
  return {
    mode: saved.mode || "t2i",

    model:        saved.model        || "",
    textEncoder:  saved.textEncoder  || "",
    vae:          saved.vae          || "",

    prompt:        saved.prompt        || "",
    promptsByMode: saved.promptsByMode || {},
    negativePrompt: saved.negativePrompt || "",
    promptSuffix:  saved.promptSuffix  || "",

    width:  saved.width  || 1024,
    height: saved.height || 1024,
    resolution: saved.resolution || 1024, // TextEncodeQwenImage21's own `resolution` int input

    steps:     saved.steps     !== undefined ? saved.steps     : 20,
    cfg:       saved.cfg       !== undefined ? saved.cfg       : 1.0, // 2.1 wants CFG=1 by default, unlike 2511's 4.0
    sampler:   saved.sampler   || "euler",
    scheduler: saved.scheduler || "simple",
    seed:      saved.seed      ?? 0,
    seedMode:  saved.seedMode  || "randomize",

    maxShift:  saved.maxShift  ?? 0.69, // ModelSamplingFlux
    baseShift: saved.baseShift ?? 0.5,

    useCache:        saved.useCache        !== false, // QwenImage21Cache — default-on per reference workflow
    useSageAttention: saved.useSageAttention ?? false, // PathchSageAttentionKJ — off by default

    loras: Array.isArray(saved.loras)
      ? saved.loras.map(l => ({ name: l.name || "none", strength: l.strength ?? 1, triggerWord: l.triggerWord || "", enabled: l.enabled !== false }))
      : [],

    // I2I — plain
    i2iImage:     saved.i2iImage     || null,
    i2iWidth:     saved.i2iWidth     || null,
    i2iHeight:    saved.i2iHeight    || null,
    i2iLockRatio: saved.i2iLockRatio ?? true,
    i2iDenoise:   saved.i2iDenoise   ?? 0.75,

    // I2I — Ref to Image sub-mode (up to 10 reference images, own output size)
    i2iSubMode:   saved.i2iSubMode   || "i2i", // "i2i" | "ref2img"
    refImages: Array.isArray(saved.refImages) ? saved.refImages.slice(0, MAX_REF_IMAGES) : [],
    refWidth:  saved.refWidth  || 1024,
    refHeight: saved.refHeight || 1024,
    refDenoise: saved.refDenoise ?? 1.0,

    // Edit (single or dual base image, optional drawn annotation via ui_mask_draw.js).
    // Each annotation keeps BOTH the flattened uploaded image (sent to the graph) AND the
    // raw stroke list (so reopening the draw tool on the same source image restores the
    // marks, editable/erasable, instead of starting over) — user: "원본이미지와 드로잉
    // 레이어 두개를 전부 기억하고 있으면서 수정이 가능하게 되야 한다."
    editImage1:      saved.editImage1      || null,
    editImage2:      saved.editImage2      || null,
    editRefImages:   Array.isArray(saved.editRefImages) ? saved.editRefImages : [],
    editAnnotImage:  saved.editAnnotImage  || null, // drawn-on copy uploaded as an extra reference
    editAnnotStrokes: Array.isArray(saved.editAnnotStrokes) ? saved.editAnnotStrokes : [],
    editRefAnnotations: saved.editRefAnnotations && typeof saved.editRefAnnotations === "object" ? saved.editRefAnnotations : {},
    editRefAnnotationStrokes: saved.editRefAnnotationStrokes && typeof saved.editRefAnnotationStrokes === "object" ? saved.editRefAnnotationStrokes : {},

    // Inpaint / Outpaint — mask-free. Inpaint draws directly on the source image
    // (no LoadImage+ImageToMask+SetLatentNoiseMask chain); the annotated frame becomes
    // a second reference image fed into TextEncodeQwenImage21.
    paintSubMode:     saved.paintSubMode     || "inpaint",
    inpaintImage:     saved.inpaintImage     || null,
    inpaintAnnotImage: saved.inpaintAnnotImage || null,
    inpaintAnnotStrokes: Array.isArray(saved.inpaintAnnotStrokes) ? saved.inpaintAnnotStrokes : [],
    inpaintDenoise:   saved.inpaintDenoise   ?? 0.85,
    outpaintUp:       saved.outpaintUp       ?? 0,
    outpaintDown:     saved.outpaintDown     ?? 0,
    outpaintLeft:     saved.outpaintLeft     ?? 0,
    outpaintRight:    saved.outpaintRight    ?? 0,
    outpaintPadR:     saved.outpaintPadR     ?? 0,
    outpaintPadG:     saved.outpaintPadG     ?? 0,
    outpaintPadB:     saved.outpaintPadB     ?? 0,

    // Upscale (SeedVR2) — model-family-agnostic, mirrors 2511 verbatim
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

    // Pilot: auto-run Prompt Enhance on the current prompt right before Generate, updating
    // the PROMPT field in place. Ships on Qwen Image 2.1 first; if it works out this ports
    // to every other ONE STUDIO image node next.
    autoEnhance: saved.autoEnhance ?? false,

    outputMode:    saved.outputMode    || "save",
    saveSubfolder: saved.saveSubfolder || "",

    // Caps every reference image (Ref to Image + Edit) to this many megapixels before it's
    // vision-encoded — 0 = off, send as uploaded. User: a raw 4K reference times up to 10
    // images was slow to encode and heavy on VRAM for no quality benefit.
    refMaxMegapixels: saved.refMaxMegapixels ?? 0,

    // POSE mode (VNCCS PoseStudio LoRA) — Image 1 is a SAM3D-Body render of the pose
    // image (cropped/resized client-side, extracted server-side before generation),
    // Image 2 is the character. poseImage is the CROPPED/RESIZED file actually sent to
    // SAM3D; poseImageRaw is the original upload the crop tool re-opens on. poseRenderImage
    // is the SAM3D render result (becomes <image1>, and the Compare view's "before").
    poseImageRaw:     saved.poseImageRaw     || null,
    poseImage:        saved.poseImage        || null,
    poseCropBox:      saved.poseCropBox      || null, // {x,y,w,h} in poseImageRaw's native pixels
    poseCropRatioLabel: saved.poseCropRatioLabel || "", // e.g. "4:5" — "" when Free/unlocked
    poseOutW:         saved.poseOutW         || 1024,
    poseOutH:         saved.poseOutH         || 1024,
    poseLockRatio:    saved.poseLockRatio    ?? true,
    poseRenderImage:  saved.poseRenderImage  || null,
    poseCharacterImage: saved.poseCharacterImage || null,

    // Settings — VNCCS PoseStudio LoRA + SAM3D model file + editable/resettable system prompt.
    poseLoraModel:    saved.poseLoraModel    || "none",
    poseLoraStrength: saved.poseLoraStrength ?? 1,
    poseSamModel:     saved.poseSamModel     || POSE_SAM3D_MODEL_DEFAULT,
    poseSystemPrompt: saved.poseSystemPrompt ?? POSE_SYSTEM_PROMPT_DEFAULT,
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

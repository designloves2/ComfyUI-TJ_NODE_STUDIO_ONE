// core_sdxl.js — constants, colors, state persistence for SDXL ONE (TJ)
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
export const SUBFOLDER    = "sdxl-one-tj";
export const API          = "/sdxl_one";
export const LS_KEY       = "sdxl_one_tj_state_v1";

export function loadState() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); }
  catch(e) { return {}; }
}

export function saveState(s) {
  try {
    const SKIP = new Set(["inpaintMaskOverlay", "inpaintMaskDataURL"]);
    const clean = {};
    for (const k in s) if (!SKIP.has(k)) clean[k] = s[k];
    localStorage.setItem(LS_KEY, JSON.stringify(clean));
  } catch(e) {}
}

export function defaultState(saved) {
  saved = saved || {};
  const DEFAULT_NEG = "low quality, deformed, blurry, watermark, ugly, bad anatomy, disfigured, mutated, extra limbs, poorly drawn face, bad proportions, jpeg artifacts, overexposed, underexposed, nsfw";
  return {
    mode: saved.mode || "t2i",

    // Model loader mode: "checkpoint" | "separate"
    modelLoaderMode: saved.modelLoaderMode || "checkpoint",

    // Checkpoint mode
    checkpoint:        saved.checkpoint        || "",
    useRefiner:        saved.useRefiner        || false,
    refinerCheckpoint: saved.refinerCheckpoint || "",
    refinerStepFrac:   saved.refinerStepFrac   ?? 0.8,

    // Separate mode (UNet + DualCLIP + VAE)
    unet:  saved.unet  || "",
    clipL: saved.clipL || "",
    clipG: saved.clipG || "",
    vae:   saved.vae   || "",

    // Prompts
    prompt:         saved.prompt         || "",
    promptsByMode:  saved.promptsByMode  || {},
    negativePrompt: saved.negativePrompt || DEFAULT_NEG,
    promptSuffix:   saved.promptSuffix   || "",

    // T2I size — SDXL native: 1024×1024
    width:  saved.width  || 1024,
    height: saved.height || 1024,

    // Sampling
    steps:     saved.steps     || 20,
    cfg:       saved.cfg       !== undefined ? saved.cfg : 7,
    sampler:   saved.sampler   || "euler_ancestral",
    scheduler: saved.scheduler || "karras",
    seed:      saved.seed      ?? 0,
    seedMode:  saved.seedMode  || "randomize",

    // LoRA
    loras: Array.isArray(saved.loras)
      ? saved.loras.map(l => ({
          name: l.name || "none", strength: l.strength ?? 1,
          triggerWord: l.triggerWord || "", enabled: l.enabled !== false,
        }))
      : [],

    // I2I
    i2iImage:   saved.i2iImage   || null,
    i2iDenoise: saved.i2iDenoise ?? 0.75,

    // Inpaint
    inpaintImage:     saved.inpaintImage     || null,
    inpaintMaskImage: saved.inpaintMaskImage || null,
    inpaintDenoise:   saved.inpaintDenoise   ?? 0.85,
    inpaintMaskBlur:  saved.inpaintMaskBlur  ?? 0,
    inpaintGrowMask:  saved.inpaintGrowMask  ?? 6,

    // Outpaint
    outpaintImage:   saved.outpaintImage   || null,
    outpaintUp:      saved.outpaintUp      ?? 256,
    outpaintDown:    saved.outpaintDown    ?? 256,
    outpaintLeft:    saved.outpaintLeft    ?? 0,
    outpaintRight:   saved.outpaintRight   ?? 0,
    outpaintFeather: saved.outpaintFeather ?? 32,

    // Upscale
    upscaleMode:  saved.upscaleMode  || "esrgan",
    upscaleImage: saved.upscaleImage || null,

    // ESRGAN upscale
    esrganModel: saved.esrganModel || "",
    esrganScale: saved.esrganScale ?? 4,

    // Refiner upscale (I2I with refiner checkpoint)
    upscaleRefinerDenoise: saved.upscaleRefinerDenoise ?? 0.35,
    upscaleRefinerSteps:   saved.upscaleRefinerSteps   ?? 20,
    upscaleRefinerCfg:     saved.upscaleRefinerCfg     ?? 7,

    // SEEDVR2 upscale
    upscaleDitModel:        saved.upscaleDitModel        || "none",
    upscaleVaeModel:        saved.upscaleVaeModel        || "none",
    upscaleResolution:      saved.upscaleResolution      ?? 2048,
    upscaleMaxResolution:   saved.upscaleMaxResolution   ?? 4096,
    upscaleBatchSize:       saved.upscaleBatchSize       ?? 1,
    upscaleBlocksToSwap:    saved.upscaleBlocksToSwap    ?? 0,
    upscaleColorCorrection: saved.upscaleColorCorrection || "lab",
    upscaleAttentionMode:   saved.upscaleAttentionMode   || "sdpa",
    upscaleOffloadDevice:   (saved.upscaleOffloadDevice && saved.upscaleOffloadDevice !== "none")
                              ? saved.upscaleOffloadDevice : "cpu",
    upscaleInputNoiseScale:  saved.upscaleInputNoiseScale  ?? 0,
    upscaleLatentNoiseScale: saved.upscaleLatentNoiseScale ?? 0,

    // Output
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

/**
 * Reactive image slot that stays in sync with state[fieldName].
 * - setFilename(name): updates both state AND display (used by gallery send-to)
 * - clearSlot():       sets state[fieldName] = null and clears display
 * The state field is always the source of truth for generation.
 */
export function createInputImageSlot(state, fieldName, uploadFn, ctx, { label = "Image" } = {}) {
  const BOX = 192;
  const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "4px", alignItems: "center" } });

  const box = el("div", { style: {
    width: `${BOX}px`, height: `${BOX}px`,
    background: "#000", borderRadius: "10px",
    border: `1px solid ${C.border}`, position: "relative",
    cursor: "pointer", flexShrink: "0",
    display: "flex", alignItems: "center", justifyContent: "center",
    overflow: "hidden",
  }});

  const hint = el("div", { text: `${label}\nClick to upload`, style: {
    color: C.muted, fontSize: "12px", textAlign: "center",
    whiteSpace: "pre", pointerEvents: "none",
  }});

  const img = el("img", { style: {
    maxWidth: "100%", maxHeight: "100%",
    objectFit: "contain", display: "none", pointerEvents: "none",
  }});

  const expandBtn = el("button", { type: "button", text: "⤢", style: {
    position: "absolute", top: "4px", right: "4px",
    background: "rgba(0,0,0,0.65)", color: "#fff", border: "none",
    borderRadius: "4px", width: "22px", height: "22px",
    fontSize: "13px", cursor: "pointer", lineHeight: "22px", padding: "0",
    display: "none",
  }});
  expandBtn.addEventListener("click", e => {
    e.stopPropagation();
    if (!img.src) return;
    const ov = el("div", { style: {
      position: "fixed", inset: "0", background: "rgba(0,0,0,0.88)", zIndex: "10001",
      display: "flex", alignItems: "center", justifyContent: "center",
    }});
    ov.appendChild(el("img", { src: img.src, style: { maxWidth: "90vw", maxHeight: "90vh", borderRadius: "8px", objectFit: "contain" } }));
    ov.addEventListener("click", () => document.body.removeChild(ov));
    document.body.appendChild(ov);
  });

  box.appendChild(hint); box.appendChild(img); box.appendChild(expandBtn);

  function showImage(name) {
    if (name) {
      // Add cache-busting timestamp so browser doesn't serve stale preview
      img.src = `/view?filename=${encodeURIComponent(name)}&type=input&t=${Date.now()}`;
      img.style.display = "block";
      hint.style.display = "none";
      expandBtn.style.display = "block";
    } else {
      img.src = "";
      img.style.display = "none";
      hint.style.display = "block";
      expandBtn.style.display = "none";
    }
  }

  // Initialize from current state
  showImage(state[fieldName] || null);

  const fi = el("input", { type: "file", accept: "image/*", style: { display: "none" } });
  fi.addEventListener("change", async () => {
    const f = fi.files[0]; if (!f) return;
    try {
      const name = await uploadFn(f);
      state[fieldName] = name;
      showImage(name);
      ctx.persist();
    } catch(e) { console.error("[SDXL slot] upload error:", e); }
  });
  box.addEventListener("click", () => fi.click());
  wrap.appendChild(box); wrap.appendChild(fi);

  return {
    el: wrap,
    /** Call this from gallery send-to or any external state change */
    setFilename(name) {
      state[fieldName] = name || null;
      showImage(state[fieldName]);
      ctx.persist();
    },
    clearSlot() {
      state[fieldName] = null;
      showImage(null);
    },
    get value() { return state[fieldName]; },
  };
}

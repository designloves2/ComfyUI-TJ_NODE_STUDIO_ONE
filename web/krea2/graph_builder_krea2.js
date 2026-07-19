// graph_builder_krea2.js — Krea 2 ONE STUDIO workflow graph builders
import { SUBFOLDER, safeDepthCkpt } from "./core_krea2.js";

function unetNode(name) {
  if ((name || "").toLowerCase().endsWith(".gguf"))
    return { class_type: "UnetLoaderGGUF", inputs: { unet_name: name } };
  return { class_type: "UNETLoader", inputs: { unet_name: name, weight_dtype: "default" } };
}

function withLoraChain(modelLink, loras) {
  const graph = {};
  let out = modelLink;
  (loras || []).forEach((lora, i) => {
    if (!lora.name || lora.name === "none" || lora.enabled === false) return;
    const strength = parseFloat(lora.strength ?? 0.8);
    if (!(strength > 0)) return;
    const id = `K2:lora${i}`;
    graph[id] = {
      class_type: "LoraLoaderModelOnly",
      inputs: { model: out, lora_name: lora.name, strength_model: strength },
    };
    out = [id, 0];
  });
  return { graph, modelOut: out };
}

function buildPromptText(state, promptKey) {
  const key = promptKey || state.mode || "t2i";
  const modePrompt = (state.promptsByMode && key in state.promptsByMode)
    ? state.promptsByMode[key] : (state.prompt || "");
  const parts = [modePrompt];
  if (state.promptSuffix) parts.push(state.promptSuffix);
  return parts.filter(Boolean).join(", ");
}

function saveNode(link, state) {
  if (state?.outputMode === "preview")
    return { class_type: "PreviewImage", inputs: { images: link } };
  const folder = state?.saveSubfolder || SUBFOLDER;
  return { class_type: "SaveImage", inputs: { images: link, filename_prefix: `${folder}/K2` } };
}

function baseGraph(state, promptText) {
  const modelName = state.model       || "";
  const clipName  = state.textEncoder || "";
  const vaeName   = state.vae         || "";
  if (!modelName) throw new Error("No model selected. Please set a model in ⚙ Settings.");
  if (!clipName)  throw new Error("No text encoder selected. Please set one in ⚙ Settings.");
  if (!vaeName)   throw new Error("No VAE selected. Please set one in ⚙ Settings.");

  const g = {};
  g["K2:unet"] = unetNode(modelName);

  // Krea2 CLIP: Qwen3-VL type
  if ((clipName || "").toLowerCase().endsWith(".gguf")) {
    g["K2:clip"] = { class_type: "CLIPLoaderGGUF", inputs: { clip_name: clipName, type: "krea2" } };
  } else {
    g["K2:clip"] = { class_type: "CLIPLoader", inputs: { clip_name: clipName, type: "krea2", device: "default" } };
  }

  g["K2:vae"] = { class_type: "VAELoader", inputs: { vae_name: vaeName } };

  const { graph: lg, modelOut } = withLoraChain(["K2:unet", 0], state.loras || []);
  Object.assign(g, lg);

  // Krea2 negative = ConditioningZeroOut (zero out the positive)
  g["K2:positive"] = { class_type: "CLIPTextEncode", inputs: { clip: ["K2:clip", 0], text: promptText || "" } };
  g["K2:negative"] = { class_type: "ConditioningZeroOut", inputs: { conditioning: ["K2:positive", 0] } };

  return { g, modelOut };
}

// The active Control LoRA for the current type (depth / canny). Both are set once
// in ⚙ Settings; the side-menu toggles which type is used per generation.
export function controlLoraForType(state, type) {
  return (type || state.controlType || "depth") === "canny"
    ? state.controlLoraCanny : state.controlLoraDepth;
}

// When ControlNet is ON, the generation should match the CONTROL image's aspect
// ratio, sized so its long edge equals the long edge of the user's size setting.
// Returns { W, H } (snapped to /8) or null if unavailable / control off.
export function controlOutputSize(state, mode) {
  const enabled = mode === "t2i" ? state.t2iControlEnabled : state.i2iControlEnabled;
  if (!enabled) return null;
  const cw = mode === "t2i" ? state.t2iControlImageW : state.i2iControlImageW;
  const ch = mode === "t2i" ? state.t2iControlImageH : state.i2iControlImageH;
  if (!cw || !ch) return null;
  const setW = mode === "t2i" ? (state.width  || 1024) : (state.i2iWidth  || state.width  || 1024);
  const setH = mode === "t2i" ? (state.height || 1024) : (state.i2iHeight || state.height || 1024);
  const longEdge = Math.max(setW, setH);
  const ar = cw / ch;
  let W, H;
  if (cw >= ch) { W = longEdge; H = longEdge / ar; }
  else          { H = longEdge; W = longEdge * ar; }
  const snap = v => Math.max(64, Math.round(v / 8) * 8);
  return { W: snap(W), H: snap(H) };
}

// Insert the depth/canny preprocessor. `imgLink` = raw source photo link;
// returns the processed control-map image link ([node, 0]).
function addPreprocessor(g, prefix, imgLink, state, type) {
  if (type === "canny") {
    g[`${prefix}:pre`] = { class_type: "CannyEdgePreprocessor", inputs: {
      image:          imgLink,
      low_threshold:  state.cannyLow  ?? 100,
      high_threshold: state.cannyHigh ?? 200,
      resolution:     state.preprocResolution ?? 512,
    }};
  } else {
    g[`${prefix}:pre`] = { class_type: "DepthAnythingV2Preprocessor", inputs: {
      image:      imgLink,
      ckpt_name:  safeDepthCkpt(state.depthCkpt),
      resolution: state.preprocResolution ?? 512,
    }};
  }
  return [`${prefix}:pre`, 0];
}

// Build the ControlNet chain. Two distinct mechanisms by type:
//   • depth — Krea2 Control LoRA (comfyui-krea2-controlnet): the depth map is
//     encoded + applied on top of the mode's own latent, model gets Krea2ControlApply.
//   • canny — NK2E in-context edit (ComfyUI-NK2E): the canny map is scaled to ~1MP,
//     VAE-encoded, injected as the NK2E reference AND used as the KSampler latent
//     (denoise 1). LoRA = NK2E canny LoRA on LoraLoaderModelOnly.
// Returns { modelOut, latentOverride?, denoiseOverride? }.
function applyControlChain(g, state, mode, modelOut, latentRef) {
  const enabled  = mode === "t2i" ? state.t2iControlEnabled : state.i2iControlEnabled;
  const ctrlImg  = mode === "t2i" ? state.t2iControlImage   : state.i2iControlImage;
  const type     = state.controlType || "depth";
  const lora     = controlLoraForType(state, type);
  if (!(enabled && lora && lora !== "none" && ctrlImg)) return { modelOut };

  g["K2:ctrl_img"] = { class_type: "LoadImage", inputs: { image: ctrlImg } };
  const ctrlMap = addPreprocessor(g, "K2:ctrl", ["K2:ctrl_img", 0], state, type);

  if (type === "canny") {
    // NK2E in-context edit path. Scale the canny map to the control image's aspect
    // ratio at the set long edge (fallback: 1MP) so output matches the source AR.
    const fit = controlOutputSize(state, mode);
    if (fit) {
      g["K2:ctrl_scale"] = { class_type: "ImageScale", inputs: {
        image: ctrlMap, width: fit.W, height: fit.H, upscale_method: "lanczos", crop: "disabled",
      }};
    } else {
      g["K2:ctrl_scale"] = { class_type: "ImageScaleToTotalPixels", inputs: {
        image: ctrlMap, upscale_method: "lanczos", megapixels: 1, resolution_steps: 16,
      }};
    }
    g["K2:ctrl_enc"] = { class_type: "VAEEncode", inputs: {
      pixels: ["K2:ctrl_scale", 0], vae: ["K2:vae", 0],
    }};
    g["K2:ctrl_nk2e"] = { class_type: "NK2EInContextEditNode", inputs: {
      model: modelOut, reference: ["K2:ctrl_enc", 0],
    }};
    g["K2:ctrl_lora"] = { class_type: "LoraLoaderModelOnly", inputs: {
      model: ["K2:ctrl_nk2e", 0], lora_name: lora, strength_model: state.controlStrength ?? 0.7,
    }};
    // The canny latent is BOTH the reference and the KSampler base latent (denoise 1).
    return { modelOut: ["K2:ctrl_lora", 0], latentOverride: ["K2:ctrl_enc", 0], denoiseOverride: 1 };
  }

  // depth — Krea2 Control LoRA path. Encode options are user-configurable in Settings
  // (defaults match the reference depth workflow: rgb + per_image_minmax + bicubic).
  g["K2:ctrl_lora"] = { class_type: "Krea2ControlLoRALoader", inputs: {
    model: modelOut, lora_name: lora, strength: state.controlStrength ?? 1.0,
  }};
  g["K2:ctrl_enc"] = { class_type: "Krea2ControlImageEncode", inputs: {
    control_image:  ctrlMap,
    vae:            ["K2:vae", 0],
    latent:         latentRef,
    resize:         "match_latent_size",
    upscale_method: "bicubic",
    crop:           "center",
    channel_mode:   state.controlChannelMode || "rgb",
    normalize:      state.controlNormalize   || "per_image_minmax",
    invert:         state.controlInvert      ?? false,
    batch_mode:     "independent_images",
  }};
  g["K2:ctrl_apply"] = { class_type: "Krea2ControlApply", inputs: {
    model: ["K2:ctrl_lora", 0], control_latent: ["K2:ctrl_enc", 0],
  }};
  return { modelOut: ["K2:ctrl_apply", 0] };
}

// Preprocess-only graph for the "Preview depth/canny" button — runs the selected
// preprocessor on the uploaded control image and returns a preview image.
export function buildControlPreviewGraph(state, imageFilename, type) {
  if (!imageFilename) throw new Error("Upload a control image first.");
  const t = type || state.controlType || "depth";
  const g = {};
  g["PP:load"] = { class_type: "LoadImage", inputs: { image: imageFilename } };
  const map = addPreprocessor(g, "PP", ["PP:load", 0], state, t);
  g["PP:preview"] = { class_type: "PreviewImage", inputs: { images: map } };
  return g;
}

// ── T2I ──────────────────────────────────────────────────────────────────────
export function buildT2IGraph(state) {
  const { g, modelOut } = baseGraph(state, buildPromptText(state, "t2i"));

  // When ControlNet is ON, match the control image's aspect ratio (long edge = set size)
  // so the depth/canny map aligns with the generation instead of being center-cropped.
  const t2iFit = controlOutputSize(state, "t2i");
  g["K2:latent"]  = { class_type: "EmptyLatentImage", inputs: {
    width:  t2iFit ? t2iFit.W : (state.width  || 1024),
    height: t2iFit ? t2iFit.H : (state.height || 1024),
    batch_size: 1,
  }};

  // ControlNet — depth applies on top; canny (NK2E) overrides the latent.
  const cc = applyControlChain(g, state, "t2i", modelOut, ["K2:latent", 0]);
  const t2iLatent = cc.latentOverride || ["K2:latent", 0];

  g["K2:sampler"] = { class_type: "KSampler", inputs: {
    model: cc.modelOut,
    positive: ["K2:positive", 0],
    negative: ["K2:negative", 0],
    latent_image: t2iLatent,
    seed: state.seed ?? 0,
    steps: state.steps ?? 8,
    cfg: state.cfg ?? 1,
    sampler_name: state.sampler || "euler",
    scheduler: state.scheduler || "simple",
    denoise: 1,
  }};
  g["K2:decode"]  = { class_type: "VAEDecode",  inputs: { samples: ["K2:sampler", 0], vae: ["K2:vae", 0] } };
  g["K2:save"]    = saveNode(["K2:decode", 0], state);
  return g;
}

// ── I2I ──────────────────────────────────────────────────────────────────────
export function buildI2IGraph(state) {
  if (!state.i2iImage) throw new Error("No source image uploaded for I2I.");
  const { g, modelOut } = baseGraph(state, buildPromptText(state, "i2i"));

  g["K2:load"] = { class_type: "LoadImage", inputs: { image: state.i2iImage } };
  // Insert ImageScale when custom output size is set
  const k2PixSrc = (state.i2iWidth && state.i2iHeight)
    ? (g["K2:i2iScale"] = { class_type: "ImageScale", inputs: { image: ["K2:load", 0], width: state.i2iWidth, height: state.i2iHeight, upscale_method: "lanczos", crop: "disabled" } }, ["K2:i2iScale", 0])
    : ["K2:load", 0];
  g["K2:encode"] = { class_type: "VAEEncode", inputs: { pixels: k2PixSrc, vae: ["K2:vae", 0] } };

  // ControlNet — depth applies on top; canny (NK2E) overrides the latent + denoise.
  const cc = applyControlChain(g, state, "i2i", modelOut, ["K2:encode", 0]);
  const i2iLatent = cc.latentOverride || ["K2:encode", 0];

  g["K2:sampler"] = { class_type: "KSampler", inputs: {
    model:        cc.modelOut,
    positive:     ["K2:positive", 0],
    negative:     ["K2:negative", 0],
    latent_image: i2iLatent,
    seed:         state.seed ?? 0,
    steps:        state.steps ?? 8,
    cfg:          state.cfg ?? 1,
    sampler_name: state.sampler   || "euler",
    scheduler:    state.scheduler || "simple",
    denoise:      cc.denoiseOverride ?? (state.i2iDenoise ?? 0.75),
  }};
  g["K2:decode"] = { class_type: "VAEDecode", inputs: { samples: ["K2:sampler", 0], vae: ["K2:vae", 0] } };
  g["K2:save"]   = saveNode(["K2:decode", 0], state);
  return g;
}

// ── IDENTITY EDIT (comfyui-krea2edit + krea2 identity edit LoRA) ──────────────
// Wiring (from lbouaraba/comfyui-krea2edit README):
//   UNETLoader → LoraLoaderModelOnly(identity LoRA) → Krea2EditModelPatch.model
//   LoadImage ─┬─ VAEEncode → Krea2EditModelPatch.source_latent
//              └─ Krea2EditGroundedEncode.image  (+ instruction prompt)
//   Krea2EditModelPatch → KSampler.model
//   Krea2EditGroundedEncode → KSampler.positive
//   Krea2EditGroundedEncode(empty prompt, same image) → KSampler.negative (trained uncond)
//   EmptySD3LatentImage → KSampler.latent_image
export function buildIdentityGraph(state) {
  if (!state.identityImage) throw new Error("No source image uploaded for Identity Edit.");

  const idLora = state.identityLora;
  if (!idLora || idLora === "none")
    throw new Error("No Identity Edit LoRA configured. Open ⚙ Settings → Identity Edit and pick the krea2 identity edit LoRA (one-time setup).");

  const modelName = state.model       || "";
  const clipName  = state.textEncoder || "";
  const vaeName   = state.vae         || "";
  if (!modelName) throw new Error("No model selected. Please set a model in ⚙ Settings.");
  if (!clipName)  throw new Error("No text encoder selected. Please set one in ⚙ Settings.");
  if (!vaeName)   throw new Error("No VAE selected. Please set one in ⚙ Settings.");

  const instruction = (state.promptsByMode && "identity" in state.promptsByMode)
    ? state.promptsByMode.identity : (state.prompt || "");
  if (!instruction.trim())
    throw new Error("Enter an edit instruction (e.g. \"recolor the car to matte black\").");

  const g = {};
  g["K2:unet"] = unetNode(modelName);

  if ((clipName || "").toLowerCase().endsWith(".gguf"))
    g["K2:clip"] = { class_type: "CLIPLoaderGGUF", inputs: { clip_name: clipName, type: "krea2" } };
  else
    g["K2:clip"] = { class_type: "CLIPLoader", inputs: { clip_name: clipName, type: "krea2", device: "default" } };

  g["K2:vae"] = { class_type: "VAELoader", inputs: { vae_name: vaeName } };

  // Identity Edit LoRA (model-only), then any extra user LoRAs on top.
  g["ID:lora"] = { class_type: "LoraLoaderModelOnly", inputs: {
    model: ["K2:unet", 0], lora_name: idLora, strength_model: state.identityLoraStrength ?? 1.0,
  }};
  const { graph: lg, modelOut } = withLoraChain(["ID:lora", 0], state.loras || []);
  Object.assign(g, lg);

  // Source image → latent (source_latent, required) + pixel path (vae + source_image).
  g["ID:load"]   = { class_type: "LoadImage", inputs: { image: state.identityImage } };
  g["ID:encode"] = { class_type: "VAEEncode", inputs: { pixels: ["ID:load", 0], vae: ["K2:vae", 0] } };

  const hasB = !!state.identityImageB;
  if (hasB) {
    g["ID:loadB"]   = { class_type: "LoadImage", inputs: { image: state.identityImageB } };
    g["ID:encodeB"] = { class_type: "VAEEncode", inputs: { pixels: ["ID:loadB", 0], vae: ["K2:vae", 0] } };
  }

  const fitMode = state.identityFitMode || "fit";
  const patchInputs = {
    model:         modelOut,
    source_latent: ["ID:encode", 0],
    vae:           ["K2:vae", 0],
    source_image:  ["ID:load", 0],
    fit_mode:      fitMode,
    ref_boost:     state.identityRefBoost ?? 1.0,
  };
  if (hasB) {
    patchInputs.source_latent_b = ["ID:encodeB", 0];
    patchInputs.source_image_b  = ["ID:loadB", 0];
  }
  g["ID:patch"] = { class_type: "Krea2EditModelPatch", inputs: patchInputs };

  // Grounded encode — the instruction is read WHILE the model sees the source image.
  const groundingPx = state.identityGroundingPx ?? 768;
  const posEnc = { clip: ["K2:clip", 0], prompt: instruction, image: ["ID:load", 0], grounding_px: groundingPx };
  const negEnc = { clip: ["K2:clip", 0], prompt: "",          image: ["ID:load", 0], grounding_px: groundingPx };
  if (hasB) { posEnc.image_b = ["ID:loadB", 0]; negEnc.image_b = ["ID:loadB", 0]; }
  g["ID:positive"] = { class_type: "Krea2EditGroundedEncode", inputs: posEnc };
  g["ID:negative"] = { class_type: "Krea2EditGroundedEncode", inputs: negEnc };

  g["ID:latent"] = { class_type: "EmptySD3LatentImage", inputs: {
    width:  state.identityWidth  || 1024,
    height: state.identityHeight || 1024,
    batch_size: 1,
  }};

  g["ID:sampler"] = { class_type: "KSampler", inputs: {
    model:        ["ID:patch", 0],
    positive:     ["ID:positive", 0],
    negative:     ["ID:negative", 0],
    latent_image: ["ID:latent", 0],
    seed:         state.seed ?? 0,
    steps:        state.steps ?? 8,
    cfg:          state.cfg ?? 1,
    sampler_name: state.sampler   || "euler",
    scheduler:    state.scheduler || "simple",
    denoise:      1,
  }};
  g["ID:decode"] = { class_type: "VAEDecode", inputs: { samples: ["ID:sampler", 0], vae: ["K2:vae", 0] } };
  g["ID:save"]   = saveNode(["ID:decode", 0], state);
  return g;
}

// ── UPSCALE — SeedVR2 (same as Z-Image ONE STUDIO) ───────────────────────────
export function buildUpscaleGraph(state) {
  if (!state.upscaleImage)
    throw new Error("No source image uploaded for upscale.");
  if (!state.upscaleDitModel || state.upscaleDitModel === "none")
    throw new Error("Select a SeedVR2 DiT model in the UPSCALE panel.");
  if (!state.upscaleVaeModel || state.upscaleVaeModel === "none")
    throw new Error("Select a SeedVR2 VAE model in the UPSCALE panel.");

  const ditOffload = (state.upscaleOffloadDevice && state.upscaleOffloadDevice !== "none")
    ? state.upscaleOffloadDevice : "cpu";
  const folder = state.saveSubfolder || "krea2-one-tj";

  return {
    "UP:dit": { class_type: "SeedVR2LoadDiTModel", inputs: {
      model:              state.upscaleDitModel,
      device:             "cuda:0",
      blocks_to_swap:     state.upscaleBlocksToSwap     ?? 0,
      swap_io_components: false,
      offload_device:     ditOffload,
      cache_model:        ditOffload !== "none",
      attention_mode:     state.upscaleAttentionMode    || "sdpa",
    }},
    "UP:vae": { class_type: "SeedVR2LoadVAEModel", inputs: {
      model:               state.upscaleVaeModel,
      device:              "cuda:0",
      encode_tiled:        true,
      encode_tile_size:    1024,
      encode_tile_overlap: 128,
      decode_tiled:        true,
      decode_tile_size:    1024,
      decode_tile_overlap: 128,
      tile_debug:          "false",
      offload_device:      ditOffload,
      cache_model:         false,
    }},
    "UP:load": { class_type: "LoadImage", inputs: { image: state.upscaleImage } },
    "UP:run":  { class_type: "SeedVR2VideoUpscaler", inputs: {
      image:              ["UP:load", 0],
      dit:                ["UP:dit",  0],
      vae:                ["UP:vae",  0],
      seed:               (state.seed ?? 42) % 4294967295,
      resolution:         state.upscaleResolution       ?? 2048,
      max_resolution:     state.upscaleMaxResolution    ?? 4096,
      batch_size:         state.upscaleBatchSize        ?? 1,
      uniform_batch_size: false,
      color_correction:   state.upscaleColorCorrection  || "lab",
      temporal_overlap:   0,
      prepend_frames:     0,
      input_noise_scale:  state.upscaleInputNoiseScale  ?? 0,
      latent_noise_scale: state.upscaleLatentNoiseScale ?? 0,
      offload_device:     ditOffload,
      enable_debug:       false,
    }},
    "UP:save": { class_type: "SaveImage", inputs: {
      images:          ["UP:run", 0],
      filename_prefix: `${folder}/K2_up`,
    }},
  };
}

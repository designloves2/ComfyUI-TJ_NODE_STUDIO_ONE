// graph_builder_krea2.js — Krea 2 ONE STUDIO workflow graph builders
import { SUBFOLDER } from "./core_krea2.js";

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

// Build the Krea2 Control LoRA chain. Control LoRA + processing params come from
// the globally-configured Settings (state.controlLora / controlStrength / …).
// `latentRef` is the latent link used to match the control image size.
// Returns the model link to feed KSampler (unchanged if control is inactive).
function applyControlChain(g, state, mode, modelOut, latentRef) {
  const enabled  = mode === "t2i" ? state.t2iControlEnabled : state.i2iControlEnabled;
  const ctrlImg  = mode === "t2i" ? state.t2iControlImage   : state.i2iControlImage;
  const lora     = state.controlLora;
  if (!(enabled && lora && lora !== "none" && ctrlImg)) return modelOut;

  g["K2:ctrl_lora"] = { class_type: "Krea2ControlLoRALoader", inputs: {
    model: modelOut, lora_name: lora, strength: state.controlStrength ?? 1.0,
  }};
  g["K2:ctrl_img"] = { class_type: "LoadImage", inputs: { image: ctrlImg } };
  g["K2:ctrl_enc"] = { class_type: "Krea2ControlImageEncode", inputs: {
    control_image:  ["K2:ctrl_img", 0],
    vae:            ["K2:vae", 0],
    latent:         latentRef,
    resize:         "match_latent_size",
    upscale_method: "lanczos",
    crop:           "center",
    channel_mode:   state.controlChannelMode || "rgb",
    normalize:      state.controlNormalize   || "none",
    invert:         state.controlInvert      ?? false,
    batch_mode:     "independent_images",
  }};
  g["K2:ctrl_apply"] = { class_type: "Krea2ControlApply", inputs: {
    model: ["K2:ctrl_lora", 0], control_latent: ["K2:ctrl_enc", 0],
  }};
  return ["K2:ctrl_apply", 0];
}

// ── T2I ──────────────────────────────────────────────────────────────────────
export function buildT2IGraph(state) {
  const { g, modelOut } = baseGraph(state, buildPromptText(state, "t2i"));

  g["K2:latent"]  = { class_type: "EmptyLatentImage", inputs: {
    width: state.width || 1024, height: state.height || 1024, batch_size: 1,
  }};

  // ControlNet — control image matched to the empty latent size
  const t2iModel = applyControlChain(g, state, "t2i", modelOut, ["K2:latent", 0]);

  g["K2:sampler"] = { class_type: "KSampler", inputs: {
    model: t2iModel,
    positive: ["K2:positive", 0],
    negative: ["K2:negative", 0],
    latent_image: ["K2:latent", 0],
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

  // ControlNet — control image matched to the encoded source latent
  const finalModel = applyControlChain(g, state, "i2i", modelOut, ["K2:encode", 0]);

  g["K2:sampler"] = { class_type: "KSampler", inputs: {
    model:        finalModel,
    positive:     ["K2:positive", 0],
    negative:     ["K2:negative", 0],
    latent_image: ["K2:encode", 0],
    seed:         state.seed ?? 0,
    steps:        state.steps ?? 8,
    cfg:          state.cfg ?? 1,
    sampler_name: state.sampler   || "euler",
    scheduler:    state.scheduler || "simple",
    denoise:      state.i2iDenoise ?? 0.75,
  }};
  g["K2:decode"] = { class_type: "VAEDecode", inputs: { samples: ["K2:sampler", 0], vae: ["K2:vae", 0] } };
  g["K2:save"]   = saveNode(["K2:decode", 0], state);
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

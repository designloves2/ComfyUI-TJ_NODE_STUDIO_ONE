// graph_builder_sdxl.js — SDXL ONE (TJ) dynamic workflow builder
import { SUBFOLDER } from "./core_sdxl.js";

// ── Prompt helpers ────────────────────────────────────────────────────────────

function buildPromptText(state, mode) {
  const base = (state.promptsByMode && state.promptsByMode[mode]) || state.prompt || "";
  const parts = [base];
  (state.loras || []).forEach(l => {
    if (l.enabled !== false && l.name && l.name !== "none" && l.triggerWord) parts.push(l.triggerWord);
  });
  if (state.promptSuffix) parts.push(state.promptSuffix);
  return parts.filter(Boolean).join(", ");
}

// ── Model loading ─────────────────────────────────────────────────────────────

function buildModelNodes(state) {
  const g = {};
  if (state.modelLoaderMode === "separate") {
    const unetName = state.unet || "";
    if (unetName.toLowerCase().endsWith(".gguf")) {
      g["SX:unet"] = { class_type: "UnetLoaderGGUF", inputs: { unet_name: unetName } };
    } else {
      g["SX:unet"] = { class_type: "UNETLoader", inputs: { unet_name: unetName, weight_dtype: "default" } };
    }
    g["SX:te"] = {
      class_type: "DualCLIPLoader",
      inputs: { clip_name1: state.clipL || "", clip_name2: state.clipG || "", type: "sdxl" },
    };
    g["SX:vae"] = { class_type: "VAELoader", inputs: { vae_name: state.vae || "" } };
    return { g, modelRef: ["SX:unet", 0], clipRef: ["SX:te", 0], vaeRef: ["SX:vae", 0] };
  } else {
    // Checkpoint mode
    g["SX:ckpt"] = { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: state.checkpoint || "" } };
    return { g, modelRef: ["SX:ckpt", 0], clipRef: ["SX:ckpt", 1], vaeRef: ["SX:ckpt", 2] };
  }
}

// ── LoRA chain ────────────────────────────────────────────────────────────────

function applyLoraChain(g, state, modelRef, clipRef) {
  let mOut = modelRef;
  let cOut = clipRef;
  (state.loras || []).forEach((lora, i) => {
    if (!lora.name || lora.name === "none" || lora.enabled === false) return;
    const str = parseFloat(lora.strength ?? 1);
    if (!(str > 0)) return;
    const id = `SX:lora${i}`;
    g[id] = {
      class_type: "LoraLoader",
      inputs: { model: mOut, clip: cOut, lora_name: lora.name, strength_model: str, strength_clip: str },
    };
    mOut = [id, 0];
    cOut = [id, 1];
  });
  return { modelOut: mOut, clipOut: cOut };
}

// ── Common helpers ────────────────────────────────────────────────────────────

function saveNode(imagesRef, state) {
  if (state?.outputMode === "preview")
    return { class_type: "PreviewImage", inputs: { images: imagesRef } };
  const folder = state?.saveSubfolder || SUBFOLDER;
  return { class_type: "SaveImage", inputs: { images: imagesRef, filename_prefix: `${folder}/SX` } };
}

function ksampler(modelRef, posRef, negRef, latentRef, state, denoise) {
  return {
    class_type: "KSampler",
    inputs: {
      model: modelRef,
      positive: posRef, negative: negRef, latent_image: latentRef,
      seed: state.seed ?? 0,
      steps: state.steps ?? 20,
      cfg: state.cfg !== undefined ? state.cfg : 7,
      sampler_name: state.sampler || "euler_ancestral",
      scheduler: state.scheduler || "karras",
      denoise: denoise ?? 1,
    },
  };
}

// ── T2I ──────────────────────────────────────────────────────────────────────

export function buildT2IGraph(state) {
  const { g, modelRef, clipRef, vaeRef } = buildModelNodes(state);
  const { modelOut, clipOut } = applyLoraChain(g, state, modelRef, clipRef);

  g["SX:pos"]    = { class_type: "CLIPTextEncode", inputs: { text: buildPromptText(state, "t2i"), clip: clipOut } };
  g["SX:neg"]    = { class_type: "CLIPTextEncode", inputs: { text: state.negativePrompt || "", clip: clipOut } };
  g["SX:latent"] = { class_type: "EmptyLatentImage", inputs: { width: state.width || 1024, height: state.height || 1024, batch_size: 1 } };

  const totalSteps = state.steps || 20;

  if (state.useRefiner && state.refinerCheckpoint) {
    const baseSteps = Math.max(1, Math.round(totalSteps * (state.refinerStepFrac ?? 0.8)));

    g["SX:baseKS"] = {
      class_type: "KSamplerAdvanced",
      inputs: {
        model: modelOut, positive: ["SX:pos", 0], negative: ["SX:neg", 0],
        latent_image: ["SX:latent", 0],
        noise_seed: state.seed ?? 0, steps: totalSteps, cfg: state.cfg ?? 7,
        sampler_name: state.sampler || "euler_ancestral", scheduler: state.scheduler || "karras",
        start_at_step: 0, end_at_step: baseSteps,
        add_noise: "enable", return_with_leftover_noise: "enable",
      },
    };

    g["SX:refCkpt"] = { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: state.refinerCheckpoint } };
    g["SX:refPos"]  = { class_type: "CLIPTextEncode", inputs: { text: buildPromptText(state, "t2i"), clip: ["SX:refCkpt", 1] } };
    g["SX:refNeg"]  = { class_type: "CLIPTextEncode", inputs: { text: state.negativePrompt || "", clip: ["SX:refCkpt", 1] } };

    g["SX:refKS"] = {
      class_type: "KSamplerAdvanced",
      inputs: {
        model: ["SX:refCkpt", 0], positive: ["SX:refPos", 0], negative: ["SX:refNeg", 0],
        latent_image: ["SX:baseKS", 0],
        noise_seed: state.seed ?? 0, steps: totalSteps, cfg: state.cfg ?? 7,
        sampler_name: state.sampler || "euler_ancestral", scheduler: state.scheduler || "karras",
        start_at_step: baseSteps, end_at_step: totalSteps,
        add_noise: "disable", return_with_leftover_noise: "disable",
      },
    };

    g["SX:vaeDec"] = { class_type: "VAEDecode", inputs: { samples: ["SX:refKS", 0], vae: ["SX:refCkpt", 2] } };
  } else {
    g["SX:sampler"] = ksampler(modelOut, ["SX:pos", 0], ["SX:neg", 0], ["SX:latent", 0], state, 1);
    g["SX:vaeDec"]  = { class_type: "VAEDecode", inputs: { samples: ["SX:sampler", 0], vae: vaeRef } };
  }

  g["SX:save"] = saveNode(["SX:vaeDec", 0], state);
  return g;
}

// ── I2I ──────────────────────────────────────────────────────────────────────

export function buildI2IGraph(state) {
  if (!state.i2iImage) throw new Error("소스 이미지를 업로드하세요.");
  const { g, modelRef, clipRef, vaeRef } = buildModelNodes(state);
  const { modelOut, clipOut } = applyLoraChain(g, state, modelRef, clipRef);

  g["SX:pos"]    = { class_type: "CLIPTextEncode", inputs: { text: buildPromptText(state, "i2i"), clip: clipOut } };
  g["SX:neg"]    = { class_type: "CLIPTextEncode", inputs: { text: state.negativePrompt || "", clip: clipOut } };
  g["SX:load"]   = { class_type: "LoadImage",  inputs: { image: state.i2iImage } };
  g["SX:vaeEnc"] = { class_type: "VAEEncode",  inputs: { pixels: ["SX:load", 0], vae: vaeRef } };
  g["SX:sampler"] = ksampler(modelOut, ["SX:pos", 0], ["SX:neg", 0], ["SX:vaeEnc", 0], state, state.i2iDenoise ?? 0.75);
  g["SX:vaeDec"]  = { class_type: "VAEDecode", inputs: { samples: ["SX:sampler", 0], vae: vaeRef } };
  g["SX:save"]    = saveNode(["SX:vaeDec", 0], state);
  return g;
}

// ── INPAINT — DifferentialDiffusion + SetLatentNoiseMask ─────────────────────

export function buildInpaintGraph(state) {
  if (!state.inpaintImage)     throw new Error("소스 이미지를 업로드하세요.");
  if (!state.inpaintMaskImage) throw new Error("마스크 이미지를 업로드하세요.");

  const { g, modelRef, clipRef, vaeRef } = buildModelNodes(state);
  const { modelOut, clipOut } = applyLoraChain(g, state, modelRef, clipRef);

  const growMask = state.inpaintGrowMask ?? 6;

  g["SX:diffDiff"] = { class_type: "DifferentialDiffusion", inputs: { model: modelOut } };
  g["SX:pos"]    = { class_type: "CLIPTextEncode", inputs: { text: buildPromptText(state, "inpaint"), clip: clipOut } };
  g["SX:neg"]    = { class_type: "CLIPTextEncode", inputs: { text: state.negativePrompt || "", clip: clipOut } };
  g["SX:load"]   = { class_type: "LoadImage",   inputs: { image: state.inpaintImage } };
  g["SX:mask"]   = { class_type: "LoadImage",   inputs: { image: state.inpaintMaskImage } };
  g["SX:toMask"] = { class_type: "ImageToMask", inputs: { image: ["SX:mask", 0], channel: "red" } };

  // VAEEncodeForInpaint zeros out the masked area in latent space so the
  // original image cannot bleed through even at denoise=1
  g["SX:vaeEnc"] = {
    class_type: "VAEEncodeForInpaint",
    inputs: { pixels: ["SX:load", 0], vae: vaeRef, mask: ["SX:toMask", 0], grow_mask_by: growMask },
  };

  g["SX:sampler"] = {
    class_type: "KSampler",
    inputs: {
      model: ["SX:diffDiff", 0],
      positive: ["SX:pos", 0], negative: ["SX:neg", 0],
      latent_image: ["SX:vaeEnc", 0],
      seed: state.seed ?? 0, steps: state.steps ?? 20, cfg: state.cfg ?? 7,
      sampler_name: state.sampler || "euler_ancestral", scheduler: state.scheduler || "karras",
      denoise: state.inpaintDenoise ?? 0.85,
    },
  };
  g["SX:vaeDec"] = { class_type: "VAEDecode", inputs: { samples: ["SX:sampler", 0], vae: vaeRef } };
  g["SX:save"]   = saveNode(["SX:vaeDec", 0], state);
  return g;
}

// ── OUTPAINT — ImagePadForOutpaint + DifferentialDiffusion ───────────────────

export function buildOutpaintGraph(state) {
  if (!state.outpaintImage) throw new Error("소스 이미지를 업로드하세요.");
  const total = (state.outpaintUp || 0) + (state.outpaintDown || 0) + (state.outpaintLeft || 0) + (state.outpaintRight || 0);
  if (total <= 0) throw new Error("아웃페인트 확장 값을 1px 이상 설정하세요.");

  const { g, modelRef, clipRef, vaeRef } = buildModelNodes(state);
  const { modelOut, clipOut } = applyLoraChain(g, state, modelRef, clipRef);

  g["SX:diffDiff"] = { class_type: "DifferentialDiffusion", inputs: { model: modelOut } };
  g["SX:pos"]  = { class_type: "CLIPTextEncode", inputs: { text: buildPromptText(state, "outpaint"), clip: clipOut } };
  g["SX:neg"]  = { class_type: "CLIPTextEncode", inputs: { text: state.negativePrompt || "", clip: clipOut } };
  g["SX:load"] = { class_type: "LoadImage", inputs: { image: state.outpaintImage } };
  g["SX:pad"]  = {
    class_type: "ImagePadForOutpaint",
    inputs: {
      image: ["SX:load", 0],
      left:      Math.max(0, state.outpaintLeft  || 0),
      top:       Math.max(0, state.outpaintUp    || 0),
      right:     Math.max(0, state.outpaintRight || 0),
      bottom:    Math.max(0, state.outpaintDown  || 0),
      feathering: state.outpaintFeather ?? 32,
    },
  };
  g["SX:vaeEnc"]    = { class_type: "VAEEncode",           inputs: { pixels: ["SX:pad", 0],    vae: vaeRef } };
  g["SX:noiseMask"] = { class_type: "SetLatentNoiseMask",  inputs: { samples: ["SX:vaeEnc", 0], mask: ["SX:pad", 1] } };

  g["SX:sampler"] = {
    class_type: "KSampler",
    inputs: {
      model: ["SX:diffDiff", 0],
      positive: ["SX:pos", 0], negative: ["SX:neg", 0],
      latent_image: ["SX:noiseMask", 0],
      seed: state.seed ?? 0, steps: state.steps ?? 20, cfg: state.cfg ?? 7,
      sampler_name: state.sampler || "euler_ancestral", scheduler: state.scheduler || "karras",
      denoise: 1,
    },
  };
  g["SX:vaeDec"] = { class_type: "VAEDecode", inputs: { samples: ["SX:sampler", 0], vae: vaeRef } };
  g["SX:save"]   = saveNode(["SX:vaeDec", 0], state);
  return g;
}

// ── UPSCALE: ESRGAN ───────────────────────────────────────────────────────────

export function buildESRGANGraph(state) {
  if (!state.upscaleImage) throw new Error("업스케일할 이미지를 업로드하세요.");
  if (!state.esrganModel)  throw new Error("ESRGAN 모델을 선택하세요.");
  const g = {};
  g["UP:loader"] = { class_type: "UpscaleModelLoader", inputs: { model_name: state.esrganModel } };
  g["UP:load"]   = { class_type: "LoadImage", inputs: { image: state.upscaleImage } };
  g["UP:run"]    = { class_type: "ImageUpscaleWithModel", inputs: { upscale_model: ["UP:loader", 0], image: ["UP:load", 0] } };

  const scale = state.esrganScale ?? 4;
  if (scale !== 4) {
    g["UP:scale"] = {
      class_type: "ImageScale",
      inputs: {
        image: ["UP:run", 0], width: 0, height: 0,
        upscale_method: "lanczos", crop: "disabled",
      },
    };
    g["UP:save"] = saveNode(["UP:scale", 0], state);
  } else {
    g["UP:save"] = saveNode(["UP:run", 0], state);
  }
  return g;
}

// ── UPSCALE: SDXL Refiner (I2I with refiner checkpoint) ──────────────────────

export function buildRefinerUpscaleGraph(state) {
  if (!state.upscaleImage)      throw new Error("업스케일할 이미지를 업로드하세요.");
  if (!state.refinerCheckpoint) throw new Error("설정에서 Refiner Checkpoint를 선택하세요.");
  const g = {};
  g["UP:ckpt"]  = { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: state.refinerCheckpoint } };
  g["UP:pos"]   = { class_type: "CLIPTextEncode", inputs: { text: (state.promptsByMode?.upscale) || state.prompt || "", clip: ["UP:ckpt", 1] } };
  g["UP:neg"]   = { class_type: "CLIPTextEncode", inputs: { text: state.negativePrompt || "", clip: ["UP:ckpt", 1] } };
  g["UP:load"]  = { class_type: "LoadImage",  inputs: { image: state.upscaleImage } };
  g["UP:vaeEnc"] = { class_type: "VAEEncode", inputs: { pixels: ["UP:load", 0], vae: ["UP:ckpt", 2] } };
  g["UP:ks"] = {
    class_type: "KSampler",
    inputs: {
      model: ["UP:ckpt", 0], positive: ["UP:pos", 0], negative: ["UP:neg", 0],
      latent_image: ["UP:vaeEnc", 0],
      seed: state.seed ?? 0,
      steps: state.upscaleRefinerSteps ?? 20,
      cfg: state.upscaleRefinerCfg ?? 7,
      sampler_name: state.sampler || "euler_ancestral",
      scheduler: state.scheduler || "karras",
      denoise: state.upscaleRefinerDenoise ?? 0.35,
    },
  };
  g["UP:vaeDec"] = { class_type: "VAEDecode", inputs: { samples: ["UP:ks", 0], vae: ["UP:ckpt", 2] } };
  g["UP:save"]   = saveNode(["UP:vaeDec", 0], state);
  return g;
}

// ── UPSCALE: SEEDVR2 ──────────────────────────────────────────────────────────

export function buildSeedVR2Graph(state) {
  if (!state.upscaleImage)    throw new Error("업스케일할 이미지를 업로드하세요.");
  if (!state.upscaleDitModel || state.upscaleDitModel === "none") throw new Error("DiT 모델을 선택하세요.");
  if (!state.upscaleVaeModel || state.upscaleVaeModel === "none") throw new Error("VAE 모델을 선택하세요.");

  const s = state;
  const offload = (s.upscaleOffloadDevice && s.upscaleOffloadDevice !== "none") ? s.upscaleOffloadDevice : "cpu";
  const g = {};

  g["UP:dit"] = {
    class_type: "SeedVR2LoadDiTModel",
    inputs: {
      model: s.upscaleDitModel, device: "cuda:0",
      blocks_to_swap: s.upscaleBlocksToSwap ?? 0, swap_io_components: false,
      offload_device: offload, cache_model: offload !== "none",
      attention_mode: s.upscaleAttentionMode || "sdpa",
    },
  };
  g["UP:vae"] = {
    class_type: "SeedVR2LoadVAEModel",
    inputs: {
      model: s.upscaleVaeModel, device: "cuda:0",
      encode_tiled: true, encode_tile_size: 1024, encode_tile_overlap: 128,
      decode_tiled: true, decode_tile_size: 1024, decode_tile_overlap: 128,
      tile_debug: "false", offload_device: offload, cache_model: false,
    },
  };
  g["UP:load"] = { class_type: "LoadImage", inputs: { image: s.upscaleImage } };
  g["UP:run"]  = {
    class_type: "SeedVR2VideoUpscaler",
    inputs: {
      image: ["UP:load", 0], dit: ["UP:dit", 0], vae: ["UP:vae", 0],
      seed: (s.seed ?? 42) % 4294967295,
      resolution: s.upscaleResolution ?? 2048, max_resolution: s.upscaleMaxResolution ?? 4096,
      batch_size: s.upscaleBatchSize ?? 1, uniform_batch_size: false,
      color_correction: s.upscaleColorCorrection || "lab", temporal_overlap: 0, prepend_frames: 0,
      input_noise_scale: s.upscaleInputNoiseScale ?? 0, latent_noise_scale: s.upscaleLatentNoiseScale ?? 0,
      offload_device: offload, enable_debug: false,
    },
  };
  g["UP:save"] = saveNode(["UP:run", 0], state);
  return g;
}

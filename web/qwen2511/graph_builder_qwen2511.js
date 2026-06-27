// graph_builder_qwen2511.js — Qwen Image Edit 2511 ONE inline graph builders (TJ)
import { SUBFOLDER, buildAnglePrompt } from "./core_qwen2511.js";

const P = "QE"; // node ID prefix

function saveNode(link, state) {
  const folder = (state?.saveSubfolder || SUBFOLDER);
  if (state?.outputMode === "preview")
    return { class_type: "PreviewImage", inputs: { images: link } };
  return { class_type: "SaveImage", inputs: { images: link, filename_prefix: `${folder}/QE` } };
}

function buildPromptText(state, mode) {
  const base = (state.promptsByMode?.[mode] !== undefined) ? state.promptsByMode[mode] : (state.prompt || "");
  const parts = [base];
  (state.loras || []).forEach(l => {
    if (l.enabled !== false && l.name && l.name !== "none" && l.triggerWord) parts.push(l.triggerWord);
  });
  if (state.promptSuffix) parts.push(state.promptSuffix);
  return parts.filter(Boolean).join(", ");
}

function buildBaseGraph(state, extraLoraFn) {
  const model = state.model || "";
  const clip  = state.textEncoder || "";
  const vae   = state.vae || "";

  if (!model) throw new Error("No model selected. Configure in ⚙ Settings.");
  if (!clip)  throw new Error("No text encoder selected. Configure in ⚙ Settings.");
  if (!vae)   throw new Error("No VAE selected. Configure in ⚙ Settings.");

  const g = {};

  // Model loader (supports GGUF)
  if (model.toLowerCase().endsWith(".gguf")) {
    g[`${P}:unet`] = { class_type: "UnetLoaderGGUF", inputs: { unet_name: model } };
  } else {
    g[`${P}:unet`] = { class_type: "UNETLoader", inputs: { unet_name: model, weight_dtype: "default" } };
  }

  // CLIP (Qwen 2.5 VL)
  g[`${P}:clip`] = { class_type: "CLIPLoader", inputs: { clip_name: clip, type: "qwen_image", device: "default" } };

  // VAE
  g[`${P}:vae`] = { class_type: "VAELoader", inputs: { vae_name: vae } };

  let modelOut = [`${P}:unet`, 0];

  // Lightning LoRA (loaded twice per reference workflow pattern)
  const ll = state.lightningLora;
  if (ll && ll.name && ll.name !== "none" && ll.enabled !== false) {
    g[`${P}:ll_a`] = { class_type: "LoraLoaderModelOnly", inputs: { model: modelOut, lora_name: ll.name, strength_model: ll.strength ?? 1 } };
    g[`${P}:ll_b`] = { class_type: "LoraLoaderModelOnly", inputs: { model: [`${P}:ll_a`, 0], lora_name: ll.name, strength_model: ll.strength ?? 1 } };
    modelOut = [`${P}:ll_b`, 0];
  }

  // Extra LoRA injection (angle / BFS)
  if (extraLoraFn) modelOut = extraLoraFn(g, modelOut);

  // User LoRAs
  (state.loras || []).forEach((lora, i) => {
    if (!lora.name || lora.name === "none" || lora.enabled === false || !(+(lora.strength || 0) > 0)) return;
    const id = `${P}:lora${i}`;
    g[id] = { class_type: "LoraLoaderModelOnly", inputs: { model: modelOut, lora_name: lora.name, strength_model: +(lora.strength ?? 1) } };
    modelOut = [id, 0];
  });

  // ModelSamplingAuraFlow (shift=3.1 per reference workflow)
  g[`${P}:modelSamp`] = { class_type: "ModelSamplingAuraFlow", inputs: { model: modelOut, shift: 3.1 } };

  // CFGNorm
  g[`${P}:cfgNorm`] = { class_type: "CFGNorm", inputs: { model: [`${P}:modelSamp`, 0], strength: 1.0 } };

  return {
    g,
    modelLink: [`${P}:cfgNorm`, 0],
    clipLink:  [`${P}:clip`, 0],
    vaeLink:   [`${P}:vae`, 0],
  };
}

// Returns { posLink, negLink } for use by callers
function addEditConditioning(g, clipLink, vaeLink, positiveText, negativeText, imageLinks) {
  // Scale reference images
  if (imageLinks.length > 0) {
    g[`${P}:scale1`] = { class_type: "FluxKontextImageScale", inputs: { image: imageLinks[0] } };
    g[`${P}:vaeEnc`] = { class_type: "VAEEncode", inputs: { pixels: [`${P}:scale1`, 0], vae: vaeLink } };
  }
  if (imageLinks.length > 1) {
    g[`${P}:scale2`] = { class_type: "FluxKontextImageScale", inputs: { image: imageLinks[1] } };
  }
  if (imageLinks.length > 2) {
    g[`${P}:scale3`] = { class_type: "FluxKontextImageScale", inputs: { image: imageLinks[2] } };
  }

  // Positive: TextEncodeQwenImageEditPlus
  const posIn = { clip: clipLink, vae: vaeLink, prompt: positiveText || "" };
  if (imageLinks.length > 0) posIn.image1 = [`${P}:scale1`, 0];
  if (imageLinks.length > 1) posIn.image2 = [`${P}:scale2`, 0];
  if (imageLinks.length > 2) posIn.image3 = [`${P}:scale3`, 0];
  g[`${P}:encPos`] = { class_type: "TextEncodeQwenImageEditPlus", inputs: posIn };

  // Negative
  const negIn = { clip: clipLink, vae: vaeLink, prompt: negativeText || "" };
  if (imageLinks.length > 0) negIn.image1 = [`${P}:scale1`, 0];
  g[`${P}:encNeg`] = { class_type: "TextEncodeQwenImageEditPlus", inputs: negIn };

  if (imageLinks.length > 0) {
    // FluxKontextMultiReferenceLatentMethod:
    //   conditioning → CONDITIONING input
    //   reference_latents_method → COMBO widget string (NOT a node input/link)
    // vaeEnc latent goes to KSampler.latent_image (set by callers, not here)
    g[`${P}:refPos`] = { class_type: "FluxKontextMultiReferenceLatentMethod", inputs: { conditioning: [`${P}:encPos`, 0], reference_latents_method: "index_timestep_zero" } };
    g[`${P}:refNeg`] = { class_type: "FluxKontextMultiReferenceLatentMethod", inputs: { conditioning: [`${P}:encNeg`, 0], reference_latents_method: "index_timestep_zero" } };
    return { posLink: [`${P}:refPos`, 0], negLink: [`${P}:refNeg`, 0] };
  } else {
    // T2I: no reference images — use conditionings directly
    return { posLink: [`${P}:encPos`, 0], negLink: [`${P}:encNeg`, 0] };
  }
}

function addKSampler(g, modelLink, latentLink, state, denoise = 1.0, posLink, negLink) {
  posLink = posLink || [`${P}:refPos`, 0];
  negLink = negLink || [`${P}:refNeg`, 0];
  g[`${P}:sampler`] = {
    class_type: "KSampler",
    inputs: {
      model:        modelLink,
      positive:     posLink,
      negative:     negLink,
      latent_image: latentLink,
      seed:         state.seed ?? 0,
      steps:        state.steps ?? 20,
      cfg:          state.cfg   ?? 4.0,
      sampler_name: state.sampler   || "euler",
      scheduler:    state.scheduler || "simple",
      denoise,
    },
  };
}

function addDecodeAndSave(g, vaeLink, state) {
  g[`${P}:decode`] = { class_type: "VAEDecode", inputs: { samples: [`${P}:sampler`, 0], vae: vaeLink } };
  g[`${P}:save`]   = saveNode([`${P}:decode`, 0], state);
}

// ── T2I ──────────────────────────────────────────────────────────────────────
export function buildT2IGraph(state) {
  const { g, modelLink, clipLink, vaeLink } = buildBaseGraph(state);
  const promptText = buildPromptText(state, "t2i");

  g[`${P}:latent`] = { class_type: "EmptyLatentImage", inputs: { width: state.width || 1024, height: state.height || 1024, batch_size: 1 } };

  const { posLink, negLink } = addEditConditioning(g, clipLink, vaeLink, promptText, state.negativePrompt || "", []);
  addKSampler(g, modelLink, [`${P}:latent`, 0], state, 1.0, posLink, negLink);
  addDecodeAndSave(g, vaeLink, state);
  return g;
}

// ── I2I ──────────────────────────────────────────────────────────────────────
export function buildI2IGraph(state) {
  if (!state.i2iImage) throw new Error("No source image uploaded.");
  const { g, modelLink, clipLink, vaeLink } = buildBaseGraph(state);
  const promptText = buildPromptText(state, "i2i");

  g[`${P}:loadImg1`] = { class_type: "LoadImage", inputs: { image: state.i2iImage } };
  const { posLink: i2iPos, negLink: i2iNeg } = addEditConditioning(g, clipLink, vaeLink, promptText, state.negativePrompt || "", [[`${P}:loadImg1`, 0]]);
  addKSampler(g, modelLink, [`${P}:vaeEnc`, 0], state, state.i2iDenoise ?? 0.75, i2iPos, i2iNeg);
  addDecodeAndSave(g, vaeLink, state);
  return g;
}

// ── EDIT ─────────────────────────────────────────────────────────────────────
export function buildEditGraph(state) {
  if (!state.editImage1) throw new Error("No Image 1 uploaded for Edit mode.");
  const { g, modelLink, clipLink, vaeLink } = buildBaseGraph(state);
  const promptText = buildPromptText(state, "edit");

  g[`${P}:loadImg1`] = { class_type: "LoadImage", inputs: { image: state.editImage1 } };
  const imageLinks = [[`${P}:loadImg1`, 0]];

  const img2 = state.editImage2 || state.editRefImages?.[0]?.filename || null;
  if (img2) {
    g[`${P}:loadImg2`] = { class_type: "LoadImage", inputs: { image: img2 } };
    imageLinks.push([`${P}:loadImg2`, 0]);
  }
  const img3 = state.editRefImages?.[1]?.filename || null;
  if (img3) {
    g[`${P}:loadImg3`] = { class_type: "LoadImage", inputs: { image: img3 } };
    imageLinks.push([`${P}:loadImg3`, 0]);
  }

  const { posLink: editPos, negLink: editNeg } = addEditConditioning(g, clipLink, vaeLink, promptText, state.negativePrompt || "", imageLinks);
  addKSampler(g, modelLink, [`${P}:vaeEnc`, 0], state, 1.0, editPos, editNeg);
  addDecodeAndSave(g, vaeLink, state);
  return g;
}

// ── INPAINT ───────────────────────────────────────────────────────────────────
export function buildInpaintGraph(state) {
  if (!state.inpaintImage)     throw new Error("No source image for inpaint.");
  if (!state.inpaintMaskImage) throw new Error("No mask image — draw and save a mask first.");

  const { g, modelLink, clipLink, vaeLink } = buildBaseGraph(state);
  const promptText = buildPromptText(state, "inpaint");

  g[`${P}:loadImg1`] = { class_type: "LoadImage", inputs: { image: state.inpaintImage } };
  g[`${P}:loadMask`] = { class_type: "LoadImage", inputs: { image: state.inpaintMaskImage } };
  g[`${P}:toMask`]   = { class_type: "ImageToMask", inputs: { image: [`${P}:loadMask`, 0], channel: "red" } };

  const { posLink: inpPos, negLink: inpNeg } = addEditConditioning(g, clipLink, vaeLink, promptText, state.negativePrompt || "", [[`${P}:loadImg1`, 0]]);

  // Apply mask noise to latent (vaeEnc is created inside addEditConditioning from scale1)
  g[`${P}:maskLatent`] = { class_type: "SetLatentNoiseMask", inputs: {
    samples: [`${P}:vaeEnc`, 0],
    mask:    [`${P}:toMask`, 0],
  }};

  addKSampler(g, modelLink, [`${P}:maskLatent`, 0], state, state.inpaintDenoise ?? 0.85, inpPos, inpNeg);
  addDecodeAndSave(g, vaeLink, state);
  return g;
}

// ── OUTPAINT ──────────────────────────────────────────────────────────────────
export function buildOutpaintGraph(state) {
  if (!state.inpaintImage) throw new Error("No source image for outpaint.");
  const total = (state.outpaintUp||0)+(state.outpaintDown||0)+(state.outpaintLeft||0)+(state.outpaintRight||0);
  if (total <= 0) throw new Error("Set at least one expansion value (Up/Down/Left/Right).");

  const { g, modelLink, clipLink, vaeLink } = buildBaseGraph(state);
  const promptText = buildPromptText(state, "inpaint");

  // ImagePadKJ: 사용자 지정 색상으로 패딩 (기본 검정 0,0,0), 마스크 불필요
  const padR = state.outpaintPadR ?? 0;
  const padG = state.outpaintPadG ?? 0;
  const padB = state.outpaintPadB ?? 0;
  g[`${P}:loadImg1`] = { class_type: "LoadImage", inputs: { image: state.inpaintImage } };
  g[`${P}:padImg`]   = { class_type: "ImagePadKJ", inputs: {
    image:         [`${P}:loadImg1`, 0],
    left:          Math.max(0, state.outpaintLeft  || 0),
    top:           Math.max(0, state.outpaintUp    || 0),
    right:         Math.max(0, state.outpaintRight || 0),
    bottom:        Math.max(0, state.outpaintDown  || 0),
    extra_padding: 0,
    pad_mode:      "color",
    color:         `${padR}, ${padG}, ${padB}`,
  }};

  // 패딩된 이미지를 FluxKontext 참조 체인에 전달 → vaeEnc가 latent_image로 직접 사용
  const { posLink, negLink } = addEditConditioning(g, clipLink, vaeLink, promptText, state.negativePrompt || "", [[`${P}:padImg`, 0]]);

  // SetLatentNoiseMask 없음 — vaeEnc 출력을 KSampler latent_image로 직접 전달, denoise=1.0
  addKSampler(g, modelLink, [`${P}:vaeEnc`, 0], state, 1.0, posLink, negLink);
  addDecodeAndSave(g, vaeLink, state);
  return g;
}

// ── FACESWAP (BFS) ────────────────────────────────────────────────────────────
export function buildFaceswapGraph(state) {
  if (!state.faceswapTarget) throw new Error("No target image for faceswap.");
  if (!state.faceswapSource) throw new Error("No source face image.");

  const extraLoraFn = (g, prev) => {
    const bl = state.bfsLora;
    if (bl && bl.name && bl.name !== "none" && bl.enabled !== false) {
      g[`${P}:bfsLora`] = { class_type: "LoraLoaderModelOnly", inputs: { model: prev, lora_name: bl.name, strength_model: bl.strength ?? 1 } };
      return [`${P}:bfsLora`, 0];
    }
    return prev;
  };

  const { g, modelLink, clipLink, vaeLink } = buildBaseGraph(state, extraLoraFn);
  const promptText = buildPromptText(state, "faceswap") ||
    "Replace the head in image 1 with the head from image 2, adapting the facial features to match the artistic style, focus, and environmental lighting of the image 1.";

  g[`${P}:loadTarget`] = { class_type: "LoadImage", inputs: { image: state.faceswapTarget } };
  g[`${P}:loadSource`] = { class_type: "LoadImage", inputs: { image: state.faceswapSource } };

  const { posLink: fsPos, negLink: fsNeg } = addEditConditioning(g, clipLink, vaeLink, promptText, state.negativePrompt || "", [
    [`${P}:loadTarget`, 0],
    [`${P}:loadSource`, 0],
  ]);
  addKSampler(g, modelLink, [`${P}:vaeEnc`, 0], state, state.faceswapDenoise ?? 1.0, fsPos, fsNeg);
  addDecodeAndSave(g, vaeLink, state);
  return g;
}

// ── ANGLE CHANGE ──────────────────────────────────────────────────────────────
export function buildAngleGraph(state) {
  if (!state.angleCameraImage) throw new Error("No source image uploaded for Angle Change.");

  const extraLoraFn = (g, prev) => {
    const al = state.angleLora;
    if (al && al.name && al.name !== "none" && al.enabled !== false) {
      g[`${P}:angleLora`] = { class_type: "LoraLoaderModelOnly", inputs: { model: prev, lora_name: al.name, strength_model: al.strength ?? 1 } };
      return [`${P}:angleLora`, 0];
    }
    return prev;
  };

  const { g, modelLink, clipLink, vaeLink } = buildBaseGraph(state, extraLoraFn);

  const anglePrompt = buildAnglePrompt(state.angleHorizontal ?? 0, state.angleVertical ?? 0, state.angleZoom ?? 4);
  const userExtra   = buildPromptText(state, "angle");
  const fullPrompt  = [anglePrompt, userExtra].filter(Boolean).join(", ");

  g[`${P}:loadImg1`] = { class_type: "LoadImage", inputs: { image: state.angleCameraImage } };
  const { posLink: angPos, negLink: angNeg } = addEditConditioning(g, clipLink, vaeLink, fullPrompt, state.negativePrompt || "", [[`${P}:loadImg1`, 0]]);
  addKSampler(g, modelLink, [`${P}:vaeEnc`, 0], state, 1.0, angPos, angNeg);
  addDecodeAndSave(g, vaeLink, state);
  return g;
}

// ── UPSCALE (SeedVR2) ─────────────────────────────────────────────────────────
export function buildUpscaleGraph(state) {
  if (!state.upscaleImage)                                          throw new Error("No source image uploaded for upscale.");
  if (!state.upscaleDitModel || state.upscaleDitModel === "none") throw new Error("Select a SeedVR2 DiT model.");
  if (!state.upscaleVaeModel || state.upscaleVaeModel === "none") throw new Error("Select a SeedVR2 VAE model.");

  const ditOffload = (state.upscaleOffloadDevice && state.upscaleOffloadDevice !== "none") ? state.upscaleOffloadDevice : "cpu";
  const folder     = state.saveSubfolder || SUBFOLDER;

  return {
    "UP:dit":  { class_type: "SeedVR2LoadDiTModel",  inputs: { model: state.upscaleDitModel, device: "cuda:0", blocks_to_swap: state.upscaleBlocksToSwap ?? 0, swap_io_components: false, offload_device: ditOffload, cache_model: ditOffload !== "none", attention_mode: state.upscaleAttentionMode || "sdpa" } },
    "UP:vae":  { class_type: "SeedVR2LoadVAEModel",  inputs: { model: state.upscaleVaeModel, device: "cuda:0", encode_tiled: true, encode_tile_size: 1024, encode_tile_overlap: 128, decode_tiled: true, decode_tile_size: 1024, decode_tile_overlap: 128, tile_debug: "false", offload_device: ditOffload, cache_model: false } },
    "UP:load": { class_type: "LoadImage",            inputs: { image: state.upscaleImage } },
    "UP:run":  { class_type: "SeedVR2VideoUpscaler", inputs: { image: ["UP:load", 0], dit: ["UP:dit", 0], vae: ["UP:vae", 0], seed: (state.seed ?? 42) % 4294967295, resolution: state.upscaleResolution ?? 2048, max_resolution: state.upscaleMaxResolution ?? 4096, batch_size: state.upscaleBatchSize ?? 1, uniform_batch_size: false, color_correction: state.upscaleColorCorrection || "lab", temporal_overlap: 0, prepend_frames: 0, input_noise_scale: state.upscaleInputNoiseScale ?? 0, latent_noise_scale: state.upscaleLatentNoiseScale ?? 0, offload_device: ditOffload, enable_debug: false } },
    "UP:save": { class_type: "SaveImage",            inputs: { images: ["UP:run", 0], filename_prefix: `${folder}/QE_up` } },
  };
}

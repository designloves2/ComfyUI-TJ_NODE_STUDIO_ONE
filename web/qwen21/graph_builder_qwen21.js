// graph_builder_qwen21.js — Qwen Image 2.1 ONE inline graph builders (TJ)
//
// ASSUMPTION (could not reach a live ComfyUI /object_info/TextEncodeQwenImage21 from this
// worktree — no shared browser/session here): TextEncodeQwenImage21 takes
// clip, vae, prompt, negative_prompt, resolution, and up to ten optional image inputs named
// images.image_1 .. images.image_10, and returns (positive, negative, latent) — the node
// self-produces the conditioning latent for image-conditioned modes, unlike 2511's separate
// VAEEncode+FluxKontext chain. This matches the reference workflow JSON's wiring
// (TJ_BatchToMinimaxH3 → 10 image slots, sampler fed from output index 2). Verify against
// /object_info/TextEncodeQwenImage21 before shipping if this ever drifts.
import { SUBFOLDER, POSE_SYSTEM_PROMPT_DEFAULT, POSE_SAM3D_MODEL_DEFAULT } from "./core_qwen21.js";

const P = "Q21"; // node ID prefix

function saveNode(link, state) {
  const folder = (state?.saveSubfolder || SUBFOLDER);
  if (state?.outputMode === "preview")
    return { class_type: "PreviewImage", inputs: { images: link } };
  return { class_type: "SaveImage", inputs: { images: link, filename_prefix: `${folder}/Q21` } };
}

function buildPromptText(state, mode) {
  const base = (state.promptsByMode && mode in state.promptsByMode) ? state.promptsByMode[mode] : (state.prompt || "");
  const parts = [base];
  (state.loras || []).forEach(l => {
    if (l.enabled !== false && l.name && l.name !== "none" && l.triggerWord) parts.push(l.triggerWord);
  });
  if (state.promptSuffix) parts.push(state.promptSuffix);
  return parts.filter(Boolean).join(", ");
}

function buildBaseGraph(state) {
  const model = state.model || "";
  const clip  = state.textEncoder || "";
  const vae   = state.vae || "";

  if (!model) throw new Error("No model selected. Configure in ⚙ Settings.");
  if (!clip)  throw new Error("No text encoder selected. Configure in ⚙ Settings.");
  if (!vae)   throw new Error("No VAE selected. Configure in ⚙ Settings.");

  const g = {};

  if (model.toLowerCase().endsWith(".gguf")) {
    g[`${P}:unet`] = { class_type: "UnetLoaderGGUF", inputs: { unet_name: model } };
  } else {
    g[`${P}:unet`] = { class_type: "UNETLoader", inputs: { unet_name: model, weight_dtype: "default" } };
  }

  // CLIP — Qwen3-VL text encoder (2.1's own family, not 2511's Qwen2.5-VL)
  g[`${P}:clip`] = { class_type: "CLIPLoader", inputs: { clip_name: clip, type: "qwen_image", device: "default" } };

  g[`${P}:vae`] = { class_type: "VAELoader", inputs: { vae_name: vae } };

  let modelOut = [`${P}:unet`, 0];

  (state.loras || []).forEach((lora, i) => {
    if (!lora.name || lora.name === "none" || lora.enabled === false || !(+(lora.strength || 0) > 0)) return;
    const id = `${P}:lora${i}`;
    g[id] = { class_type: "LoraLoaderModelOnly", inputs: { model: modelOut, lora_name: lora.name, strength_model: +(lora.strength ?? 1) } };
    modelOut = [id, 0];
  });

  // ModelSamplingFlux — 2.1 uses max_shift/base_shift, not 2511's AuraFlow+CFGNorm pair
  g[`${P}:modelSamp`] = { class_type: "ModelSamplingFlux", inputs: {
    model: modelOut, max_shift: state.maxShift ?? 0.69, base_shift: state.baseShift ?? 0.5,
    width: state.width || 1024, height: state.height || 1024,
  }};
  modelOut = [`${P}:modelSamp`, 0];

  // Optional perf/caching wrapper — default-on per reference workflow placement.
  // device/dtype are REQUIRED inputs on this node (confirmed via a live
  // /object_info/QwenImage21Cache check) — omitting them failed prompt validation
  // ("Required input is missing: device/dtype") even though the node's own UI never
  // exposed either setting, so both are just hardcoded to their node-side defaults.
  if (state.useCache !== false) {
    g[`${P}:cache`] = { class_type: "QwenImage21Cache", inputs: { model: modelOut, device: "auto", dtype: "default" } };
    modelOut = [`${P}:cache`, 0];
  }

  // Optional Sage Attention patch — off by default
  if (state.useSageAttention) {
    g[`${P}:sage`] = { class_type: "PathchSageAttentionKJ", inputs: { model: modelOut, sage_attention: "auto" } };
    modelOut = [`${P}:sage`, 0];
  }

  return { g, modelLink: modelOut, clipLink: [`${P}:clip`, 0], vaeLink: [`${P}:vae`, 0] };
}

// Wires TextEncodeQwenImage21 with 0..10 reference images. Returns {posLink, negLink, latentLink}.
// latentLink is only meaningful (self-produced) when at least one image is supplied.
function addConditioning(g, clipLink, vaeLink, positiveText, negativeText, resolution, imageLinks) {
  const inputs = { clip: clipLink, vae: vaeLink, prompt: positiveText || "", negative_prompt: negativeText || "", resolution: resolution || 1024 };
  (imageLinks || []).slice(0, 10).forEach((link, i) => { inputs[`images.image_${i + 1}`] = link; });
  g[`${P}:enc`] = { class_type: "TextEncodeQwenImage21", inputs };
  return { posLink: [`${P}:enc`, 0], negLink: [`${P}:enc`, 1], latentLink: [`${P}:enc`, 2] };
}

function addKSampler(g, modelLink, latentLink, state, denoise, posLink, negLink) {
  g[`${P}:sampler`] = {
    class_type: "KSampler",
    inputs: {
      model: modelLink, positive: posLink, negative: negLink, latent_image: latentLink,
      seed: state.seed ?? 0, steps: state.steps ?? 20, cfg: state.cfg ?? 1.0,
      sampler_name: state.sampler || "euler", scheduler: state.scheduler || "simple", denoise,
    },
  };
}

function addDecodeAndSave(g, vaeLink, state) {
  g[`${P}:decode`] = { class_type: "VAEDecode", inputs: { samples: [`${P}:sampler`, 0], vae: vaeLink } };
  g[`${P}:save`]   = saveNode([`${P}:decode`, 0], state);
}

// Caps a reference image's pixel count before it's vision-encoded — a raw 4K reference
// times up to 10 images was slow to encode and heavy on VRAM for no quality benefit, since
// TextEncodeQwenImage21's own `resolution` only governs the generated OUTPUT, not how big
// the reference images it reads are. 0 (default) means "send as uploaded, unchanged" — same
// convention as MiniMax H3's own per-image `resizeToMp` (ImageScaleToTotalPixels is a
// ComfyUI core node, so this needs no availability gate).
function resizeToMp(g, key, imageLink, mp) {
  if (!(mp > 0)) return imageLink;
  g[key] = { class_type: "ImageScaleToTotalPixels", inputs: {
    image: imageLink, upscale_method: "lanczos", megapixels: mp, resolution_steps: 1,
  }};
  return [key, 0];
}

// ── T2I ──────────────────────────────────────────────────────────────────────
export function buildT2IGraph(state) {
  const { g, modelLink, clipLink, vaeLink } = buildBaseGraph(state);
  const promptText = buildPromptText(state, "t2i");

  g[`${P}:latent`] = { class_type: "EmptyLatentImage", inputs: { width: state.width || 1024, height: state.height || 1024, batch_size: 1 } };
  const { posLink, negLink } = addConditioning(g, clipLink, vaeLink, promptText, state.negativePrompt || "", state.resolution || state.width || 1024, []);
  addKSampler(g, modelLink, [`${P}:latent`, 0], state, 1.0, posLink, negLink);
  addDecodeAndSave(g, vaeLink, state);
  return g;
}

// ── I2I (plain) ────────────────────────────────────────────────────────────────
export function buildI2IGraph(state) {
  if (!state.i2iImage) throw new Error("No source image uploaded.");
  const { g, modelLink, clipLink, vaeLink } = buildBaseGraph(state);
  const promptText = buildPromptText(state, "i2i");

  g[`${P}:loadImg1`] = { class_type: "LoadImage", inputs: { image: state.i2iImage } };
  let imgLink = [`${P}:loadImg1`, 0];
  if (state.i2iWidth && state.i2iHeight) {
    g[`${P}:i2iScale`] = { class_type: "ImageScale", inputs: { image: imgLink, width: state.i2iWidth, height: state.i2iHeight, upscale_method: "lanczos", crop: "disabled" } };
    imgLink = [`${P}:i2iScale`, 0];
  }
  const { posLink, negLink, latentLink } = addConditioning(g, clipLink, vaeLink, promptText, state.negativePrompt || "", state.i2iWidth || state.width || 1024, [imgLink]);
  addKSampler(g, modelLink, latentLink, state, state.i2iDenoise ?? 0.75, posLink, negLink);
  addDecodeAndSave(g, vaeLink, state);
  return g;
}

// ── I2I (Ref to Image) — up to 10 reference images, own output size ────────────
export function buildRefToImageGraph(state) {
  const refs = (state.refImages || []).filter(r => r?.filename).slice(0, 10);
  if (!refs.length) throw new Error("Add at least one reference image.");
  const { g, modelLink, clipLink, vaeLink } = buildBaseGraph(state);
  const promptText = buildPromptText(state, "ref2img");

  const imageLinks = refs.map((r, i) => {
    const id = `${P}:refImg${i}`;
    g[id] = { class_type: "LoadImage", inputs: { image: r.filename } };
    return resizeToMp(g, `${P}:refImgMp${i}`, [id, 0], state.refMaxMegapixels);
  });

  g[`${P}:latent`] = { class_type: "EmptyLatentImage", inputs: { width: state.refWidth || 1024, height: state.refHeight || 1024, batch_size: 1 } };
  const { posLink, negLink } = addConditioning(g, clipLink, vaeLink, promptText, state.negativePrompt || "", state.refWidth || 1024, imageLinks);
  addKSampler(g, modelLink, [`${P}:latent`, 0], state, state.refDenoise ?? 1.0, posLink, negLink);
  addDecodeAndSave(g, vaeLink, state);
  return g;
}

// ── EDIT ─────────────────────────────────────────────────────────────────────
export function buildEditGraph(state) {
  if (!state.editImage1) throw new Error("No Image 1 uploaded for Edit mode.");
  const { g, modelLink, clipLink, vaeLink } = buildBaseGraph(state);
  const promptText = buildPromptText(state, "edit");

  // Image 1's own drawn annotation (ui_mask_draw.js) REPLACES it as <image1> — the
  // annotated frame is what image1 becomes once marked, not an extra reference, so
  // every image after it keeps its original <imageN> index.
  g[`${P}:loadImg1`] = { class_type: "LoadImage", inputs: { image: state.editAnnotImage || state.editImage1 } };
  const imageLinks = [resizeToMp(g, `${P}:img1Mp`, [`${P}:loadImg1`, 0], state.refMaxMegapixels)];

  if (state.editImage2) {
    g[`${P}:loadImg2`] = { class_type: "LoadImage", inputs: { image: state.editImage2 } };
    imageLinks.push(resizeToMp(g, `${P}:img2Mp`, [`${P}:loadImg2`, 0], state.refMaxMegapixels));
  }
  // Images 2–10 (compact ref grid) — a slot's own drawn annotation (state.editRefAnnotations[i])
  // REPLACES that slot's image the same way editAnnotImage replaces Image 1, so a marked-up
  // ref never shifts the <imageN> index of the slots after it.
  (state.editRefImages || []).forEach((r, i) => {
    if (!r?.filename) return;
    const id = `${P}:editRef${i}`;
    const annot = state.editRefAnnotations?.[i];
    g[id] = { class_type: "LoadImage", inputs: { image: annot || r.filename } };
    imageLinks.push(resizeToMp(g, `${P}:editRefMp${i}`, [id, 0], state.refMaxMegapixels));
  });

  const { posLink, negLink, latentLink } = addConditioning(g, clipLink, vaeLink, promptText, state.negativePrompt || "", state.width || 1024, imageLinks.slice(0, 10));
  addKSampler(g, modelLink, latentLink, state, 1.0, posLink, negLink);
  addDecodeAndSave(g, vaeLink, state);
  return g;
}

// ── INPAINT — mask-free: the drawn/annotated frame REPLACES the source as <image1> ────
export function buildInpaintGraph(state) {
  if (!state.inpaintImage)      throw new Error("No source image for inpaint.");
  if (!state.inpaintAnnotImage) throw new Error("Draw on the image and commit the annotation first.");

  const { g, modelLink, clipLink, vaeLink } = buildBaseGraph(state);
  const promptText = buildPromptText(state, "inpaint");

  // Same rule as EDIT's Image 1: the marked-up frame becomes <image1> itself, not a
  // second reference alongside the clean original — the pink-line region is meaningless
  // without the model treating it as the actual image1 it's editing.
  g[`${P}:loadImg1`] = { class_type: "LoadImage", inputs: { image: state.inpaintAnnotImage } };

  const { posLink, negLink, latentLink } = addConditioning(
    g, clipLink, vaeLink, promptText, state.negativePrompt || "", state.width || 1024,
    [[`${P}:loadImg1`, 0]]
  );
  // No SetLatentNoiseMask — full denoise from the node's own latent output, image-conditioned.
  addKSampler(g, modelLink, latentLink, state, state.inpaintDenoise ?? 0.85, posLink, negLink);
  addDecodeAndSave(g, vaeLink, state);
  return g;
}

// ── OUTPAINT — ImagePadKJ canvas expansion (2511's own approach, kept as-is) ───────────
export function buildOutpaintGraph(state) {
  if (!state.inpaintImage) throw new Error("No source image for outpaint.");
  const total = (state.outpaintUp||0)+(state.outpaintDown||0)+(state.outpaintLeft||0)+(state.outpaintRight||0);
  if (total <= 0) throw new Error("Set at least one expansion value (Up/Down/Left/Right).");

  const { g, modelLink, clipLink, vaeLink } = buildBaseGraph(state);

  const padR = state.outpaintPadR ?? 0;
  const padG = state.outpaintPadG ?? 0;
  const padB = state.outpaintPadB ?? 0;
  const _padColor = `rgb(${padR}, ${padG}, ${padB})`;
  const _sysPrompt = `Extend the composition of this image. Replace all black or ${_padColor} areas with a logical continuation of the background and foreground. Ensure the transition is invisible and the new elements perfectly match the perspective and color palette of the original image. Scene description: `;
  const promptText = _sysPrompt + buildPromptText(state, "outpaint");

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

  const { posLink, negLink, latentLink } = addConditioning(g, clipLink, vaeLink, promptText, state.negativePrompt || "", state.width || 1024, [[`${P}:padImg`, 0]]);
  addKSampler(g, modelLink, latentLink, state, 1.0, posLink, negLink);
  addDecodeAndSave(g, vaeLink, state);
  return g;
}

// ── UPSCALE (SeedVR2) — model-family-agnostic, mirrors 2511 verbatim ──────────
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
    "UP:save": { class_type: "SaveImage",            inputs: { images: ["UP:run", 0], filename_prefix: `${folder}/Q21_up` } },
  };
}

// ── POSE (VNCCS PoseStudio LoRA) ────────────────────────────────────────────────
// Phase 1: extract a SAM3D-Body render from the (already client-side cropped/resized)
// pose image. Queued and awaited BEFORE the main generation — its result becomes <image1>.
// Mirrors the user-supplied reference workflow's own node chain and parameter values
// (method="gaussian" for Smooth, mesh/default/full_body for Render) 1:1.
export function buildPoseExtractGraph(state) {
  if (!state.poseImage) throw new Error("Crop the pose image first (✂ Crop Pose Image).");
  const folder = state.saveSubfolder || SUBFOLDER;
  const g = {};
  g[`${P}:loadPose`]    = { class_type: "LoadImage", inputs: { image: state.poseImage } };
  g[`${P}:samLoader`]   = { class_type: "SAM3DBody_Loader", inputs: { model_file: state.poseSamModel || POSE_SAM3D_MODEL_DEFAULT } };
  g[`${P}:samPredict`]  = { class_type: "SAM3DBody_Predict", inputs: {
    sam3d_body_model: [`${P}:samLoader`, 0], image: [`${P}:loadPose`, 0],
    run_hand_refinement: true, fov: 0, batch_size: 64,
  }};
  g[`${P}:samSmooth`]   = { class_type: "SAM3DBody_Smooth", inputs: {
    mhr_pose_data: [`${P}:samPredict`, 0], strength: 1, method: "gaussian", window: 7, rotation_threshold_degrees: 15,
  }};
  g[`${P}:samRender`]   = { class_type: "SAM3DBody_Render", inputs: {
    pose_data: [`${P}:samSmooth`, 0], width: 0, height: 0,
    render_style: "mesh", "render_style.shader": "default", "render_style.opacity": 1,
    "render_style.person_palette_falloff": 0.6, "render_style.region": "full_body",
  }};
  g[`${P}:samSave`]     = { class_type: "SaveImage", inputs: { images: [`${P}:samRender`, 0], filename_prefix: `${folder}/Q21_pose_render` } };
  return g;
}

// Phase 2: main generation. modelLink comes from the pose LoRA, not the general LoRA list
// (Settings-configured, fixed) — the reference workflow has no ModelSamplingFlux for this
// path, so this builds its own minimal base graph instead of reusing buildBaseGraph.
function buildPoseBaseGraph(state) {
  const model = state.model || "";
  const clip  = state.textEncoder || "";
  const vae   = state.vae || "";
  if (!model) throw new Error("No model selected. Configure in ⚙ Settings.");
  if (!clip)  throw new Error("No text encoder selected. Configure in ⚙ Settings.");
  if (!vae)   throw new Error("No VAE selected. Configure in ⚙ Settings.");
  if (!state.poseLoraModel || state.poseLoraModel === "none") throw new Error("Select the VNCCS PoseStudio LoRA in ⚙ Settings.");

  const g = {};
  if (model.toLowerCase().endsWith(".gguf")) {
    g[`${P}:unet`] = { class_type: "UnetLoaderGGUF", inputs: { unet_name: model } };
  } else {
    g[`${P}:unet`] = { class_type: "UNETLoader", inputs: { unet_name: model, weight_dtype: "default" } };
  }
  g[`${P}:clip`] = { class_type: "CLIPLoader", inputs: { clip_name: clip, type: "qwen_image", device: "default" } };
  g[`${P}:vae`]  = { class_type: "VAELoader", inputs: { vae_name: vae } };

  g[`${P}:poseLora`] = { class_type: "LoraLoaderModelOnly", inputs: {
    model: [`${P}:unet`, 0], lora_name: state.poseLoraModel, strength_model: +(state.poseLoraStrength ?? 1),
  }};
  let modelOut = [`${P}:poseLora`, 0];

  if (state.useCache !== false) {
    g[`${P}:cache`] = { class_type: "QwenImage21Cache", inputs: { model: modelOut, device: "auto", dtype: "default" } };
    modelOut = [`${P}:cache`, 0];
  }
  if (state.useSageAttention) {
    g[`${P}:sage`] = { class_type: "PathchSageAttentionKJ", inputs: { model: modelOut, sage_attention: "auto" } };
    modelOut = [`${P}:sage`, 0];
  }
  return { g, modelLink: modelOut, clipLink: [`${P}:clip`, 0], vaeLink: [`${P}:vae`, 0] };
}

export function buildPoseGraph(state, poseRenderFilename) {
  if (!state.poseCharacterImage) throw new Error("Upload the character image (Image 2).");
  if (!poseRenderFilename) throw new Error("Pose extraction failed — no render produced.");
  const { g, modelLink, clipLink, vaeLink } = buildPoseBaseGraph(state);

  const sysPrompt = (state.poseSystemPrompt || POSE_SYSTEM_PROMPT_DEFAULT).trim();
  const userPrompt = buildPromptText(state, "pose");
  const promptText = [sysPrompt, userPrompt].filter(Boolean).join(" ");

  g[`${P}:loadPoseRender`] = { class_type: "LoadImage", inputs: { image: poseRenderFilename } };
  g[`${P}:loadCharacter`]  = { class_type: "LoadImage", inputs: { image: state.poseCharacterImage } };
  const imageLinks = [
    resizeToMp(g, `${P}:poseRenderMp`, [`${P}:loadPoseRender`, 0], state.refMaxMegapixels),
    resizeToMp(g, `${P}:characterMp`,  [`${P}:loadCharacter`, 0],  state.refMaxMegapixels),
  ];

  const { posLink, negLink, latentLink } = addConditioning(g, clipLink, vaeLink, promptText, state.negativePrompt || "", state.resolution || state.width || 1024, imageLinks);
  addKSampler(g, modelLink, latentLink, state, 1.0, posLink, negLink);
  addDecodeAndSave(g, vaeLink, state);
  return g;
}

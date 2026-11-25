// graph_builder_moss.js — Moss Image ONE STUDIO workflow graph builders
//
// Graphs follow ComfyUI's MOSS-Image templates (image_moss_image_t2i / image_moss_image_t2i_bboxes):
// UNETLoader -> (LoRAs) -> (SkipLayerGuidanceDiTSimple) -> KSampler, CLIPLoader type "moss_image",
// EmptyFlux2LatentImage, VAEDecode. R2I turns the drawn boxes into the model's layout prompt.
import { SUBFOLDER, DEFAULT_STEPS, DEFAULT_CFG, DEFAULT_NEGATIVE, snap16, workSize } from "./core_moss.js";

function withLoraChain(g, prefix, modelLink, loras) {
  let out = modelLink;
  (loras || []).forEach((lora, i) => {
    if (!lora.name || lora.name === "none" || lora.enabled === false) return;
    const strength = parseFloat(lora.strength ?? 0.8);
    if (!(strength > 0)) return;
    const id = `${prefix}${i}`;
    g[id] = { class_type: "LoraLoaderModelOnly", inputs: { model: out, lora_name: lora.name, strength_model: strength } };
    out = [id, 0];
  });
  return out;
}

function promptFor(state, modeKey) {
  return (state.promptsByMode && modeKey in state.promptsByMode) ? state.promptsByMode[modeKey] : (state.prompt || "");
}

function saveNode(link, state) {
  if (state?.outputMode === "preview")
    return { class_type: "PreviewImage", inputs: { images: link } };
  const folder = state?.saveSubfolder || SUBFOLDER;
  return { class_type: "SaveImage", inputs: { images: link, filename_prefix: `${folder}/Moss` } };
}

// Shared prelude: loaders, LoRAs, optional skip-layer guidance and the negative prompt. The positive prompt is added
// by each mode (R2I builds it from the layout nodes).
// opts.first: LoRAs chained right after the checkpoint (the mode's control / edit LoRA); opts.noSlg: skip the user's SLG
// switch (the mode applies its own); opts.noNegative: the mode encodes its own negative prompt.
function baseGraph(state, opts = {}) {
  const modelName = state.model || "";
  const clipName  = state.textEncoder || "";
  const vaeName   = state.vae || "";
  if (!modelName) throw new Error("No diffusion model selected. Please set one in ⚙ Settings.");
  if (!clipName)  throw new Error("No text encoder selected. Please set one in ⚙ Settings.");
  if (!vaeName)   throw new Error("No VAE selected. Please set one in ⚙ Settings.");

  const g = {};
  g["MS:unet"] = modelName.toLowerCase().endsWith(".gguf")
    ? { class_type: "UnetLoaderGGUF", inputs: { unet_name: modelName } }
    : { class_type: "UNETLoader", inputs: { unet_name: modelName, weight_dtype: "default" } };
  g["MS:clip"] = { class_type: "CLIPLoader", inputs: { clip_name: clipName, type: "moss_image", device: "default" } };
  g["MS:vae"]  = { class_type: "VAELoader", inputs: { vae_name: vaeName } };

  let modelOut = ["MS:unet", 0];
  if (opts.first?.length) modelOut = withLoraChain(g, "MS:first", modelOut, opts.first);
  modelOut = withLoraChain(g, "MS:lora", modelOut, state.loras || []);
  if (state.slgEnabled && !opts.noSlg) {
    g["MS:slg"] = { class_type: "SkipLayerGuidanceDiTSimple", inputs: {
      model: modelOut, double_layers: "", single_layers: state.slgLayers ?? "22",
      start_percent: state.slgStart ?? 0, end_percent: state.slgEnd ?? 0.5,
    }};
    modelOut = ["MS:slg", 0];
  }

  if (!opts.noNegative) g["MS:negative"] = { class_type: "CLIPTextEncode", inputs: {
    clip: ["MS:clip", 0], text: (state.negativePrompt || "").trim() || DEFAULT_NEGATIVE,
  }};
  return { g, modelOut };
}

const negativeText = state => (state.negativePrompt || "").trim() || DEFAULT_NEGATIVE;
const isSet = v => !!v && v !== "none";

function positive(g, textOrLink) {
  g["MS:positive"] = { class_type: "CLIPTextEncode", inputs: { clip: ["MS:clip", 0], text: textOrLink } };
  return ["MS:positive", 0];
}

// opts: model, positiveLink, negativeLink (default the shared negative), latent, denoise, and optional steps / cfg /
// sampler / scheduler overrides (EDIT uses its own official values).
function sample(g, state, { model, positiveLink, negativeLink, latent, denoise, steps, cfg, sampler, scheduler }) {
  g["MS:sampler"] = { class_type: "KSampler", inputs: {
    model, positive: positiveLink, negative: negativeLink || ["MS:negative", 0], latent_image: latent,
    seed: state.seed ?? 0, steps: steps ?? state.steps ?? DEFAULT_STEPS, cfg: cfg ?? state.cfg ?? DEFAULT_CFG,
    sampler_name: sampler || state.sampler || "er_sde", scheduler: scheduler || state.scheduler || "simple",
    denoise: denoise ?? 1,
  }};
  g["MS:decode"] = { class_type: "VAEDecode", inputs: { samples: ["MS:sampler", 0], vae: ["MS:vae", 0] } };
  g["MS:save"]   = saveNode(["MS:decode", 0], state);
  return g;
}

function emptyLatent(g, state) {
  const { w, h } = workSize(state);
  g["MS:latent"] = { class_type: "EmptyFlux2LatentImage", inputs: { width: w, height: h, batch_size: 1 } };
  return ["MS:latent", 0];
}

// ── T2I ──────────────────────────────────────────────────────────────────────
export function buildT2IGraph(state) {
  const { g, modelOut } = baseGraph(state);
  return sample(g, state, { model: modelOut, positiveLink: positive(g, promptFor(state, "t2i")), latent: emptyLatent(g, state) });
}

// ── I2I: the source goes through the VAE and is re-noised by `denoise` ───────────
export function buildI2IGraph(state) {
  if (!state.i2iImage) throw new Error("No source image uploaded for I2I.");
  if (state.i2iSubMode === "depth") return buildDepthGraph(state);
  const { g, modelOut } = baseGraph(state);
  g["MS:src"]    = { class_type: "LoadImage", inputs: { image: state.i2iImage } };
  g["MS:fit"]    = { class_type: "ImageScale", inputs: {
    image: ["MS:src", 0], upscale_method: "lanczos", width: snap16(state.i2iWidth || state.width || 1024), height: snap16(state.i2iHeight || state.height || 1024), crop: "center",
  }};
  g["MS:encode"] = { class_type: "VAEEncode", inputs: { pixels: ["MS:fit", 0], vae: ["MS:vae", 0] } };
  return sample(g, state, {
    model: modelOut, positiveLink: positive(g, promptFor(state, "i2i")), latent: ["MS:encode", 0],
    denoise: state.i2iDenoise ?? 0.6,
  });
}

// ── I2I > Depth: MoGe 3 geometry of the source -> MOSSImageControl (official image_moss_image_color_depth_control graph) ──
// UNET -> color/depth control LoRA -> (your LoRAs) -> TemporalScoreRescaling 0.95 -> ModelSamplingAuraFlow shift 5 -> SLG layer 24.
export function buildDepthGraph(state) {
  if (!state.i2iImage) throw new Error("No source image uploaded for I2I.");
  if (!isSet(state.depthLora)) throw new Error("Depth control LoRA is not set: pick moss_image_color_depth_control in the I2I > Depth panel.");
  if (!isSet(state.depthMoge)) throw new Error("No MoGe model selected: pick one (models/geometry_estimation) in the I2I > Depth panel.");
  const strength = parseFloat(state.depthLoraStrength ?? 1);
  const { g, modelOut } = baseGraph(state, { first: [{ name: state.depthLora, strength: strength > 0 ? strength : 1 }], noSlg: true });
  const w = snap16(state.i2iWidth || state.width || 1024), h = snap16(state.i2iHeight || state.height || 1024);

  g["MS:tsr"]  = { class_type: "TemporalScoreRescaling", inputs: { model: modelOut, tsr_k: 0.95, tsr_sigma: 1 } };
  g["MS:shift"] = { class_type: "ModelSamplingAuraFlow", inputs: { model: ["MS:tsr", 0], shift: 5, sampling: "flow" } };
  g["MS:slgd"] = { class_type: "SkipLayerGuidanceDiTSimple", inputs: {
    model: ["MS:shift", 0], double_layers: "", single_layers: "24", start_percent: 0, end_percent: 1,
  }};

  g["MS:src"] = { class_type: "LoadImage", inputs: { image: state.i2iImage } };
  g["MS:fit"] = { class_type: "ImageScale", inputs: { image: ["MS:src", 0], upscale_method: "lanczos", width: w, height: h, crop: "center" } };
  g["MS:mogeLoad"]   = { class_type: "LoadMoGeModel", inputs: { model_name: state.depthMoge } };
  g["MS:mogeInfer"]  = { class_type: "MoGeInference", inputs: {
    moge_model: ["MS:mogeLoad", 0], image: ["MS:fit", 0], resolution_level: 9, fov_x_degrees: 0, batch_size: 4,
    force_projection: true, apply_mask: true, refine_steps: 3,
  }};
  g["MS:mogeRender"] = { class_type: "MoGeRender", inputs: { moge_geometry: ["MS:mogeInfer", 0], output: state.depthOutput === "depth" ? "depth" : "mask" } };

  const pos = positive(g, promptFor(state, "i2i"));
  g["MS:control"] = { class_type: "MOSSImageControl", inputs: {
    positive: pos, negative: ["MS:negative", 0], vae: ["MS:vae", 0],
    strength: state.depthStrength ?? 1, start_percent: state.depthStart ?? 0, end_percent: state.depthEnd ?? 0.6,
    depth_map: ["MS:mogeRender", 0],
  }};
  g["MS:latent"] = { class_type: "EmptyFlux2LatentImage", inputs: { width: w, height: h, batch_size: 1 } };
  return sample(g, state, {
    model: ["MS:slgd", 0], positiveLink: ["MS:control", 0], negativeLink: ["MS:control", 1], latent: ["MS:latent", 0], denoise: 1,
  });
}

// ── EDIT: TextEncodeMOSSImageEdit (+ edit LoRA) on the source and up to 3 more references (official image_moss_image_edit graph) ──
export function buildEditGraph(state) {
  if (!state.editImage) throw new Error("No source image uploaded for EDIT.");
  if (!isSet(state.editLora)) throw new Error("Edit LoRA is not set: pick moss_image_edit_lora_rank_64_bf16 in the EDIT panel.");
  const strength = parseFloat(state.editLoraStrength ?? 1);
  const { g, modelOut } = baseGraph(state, { first: [{ name: state.editLora, strength: strength > 0 ? strength : 1 }], noSlg: true, noNegative: true });
  g["MS:slgd"] = { class_type: "SkipLayerGuidanceDiTSimple", inputs: {
    model: modelOut, double_layers: "", single_layers: "22", start_percent: 0, end_percent: 1,
  }};

  const mp = Math.max(0.1, parseFloat(state.editMp ?? 1) || 1);
  const scaled = (id, file) => {
    g[`MS:${id}Load`] = { class_type: "LoadImage", inputs: { image: file } };
    g[`MS:${id}`] = { class_type: "ImageScaleToTotalPixels", inputs: { image: [`MS:${id}Load`, 0], upscale_method: "lanczos", megapixels: mp, resolution_steps: 16 } };
    return [`MS:${id}`, 0];
  };
  const imgs = [scaled("ref0", state.editImage), ...(state.editRefs || []).filter(Boolean).slice(0, 3).map((f, i) => scaled(`ref${i + 1}`, f))];

  const encode = (id, text) => {
    const inputs = {
      clip: ["MS:clip", 0], prompt: text, edit_format: state.editFormat || "Moss-Image-Edit",
      image_strength: state.editImageStrength ?? 1, vae: ["MS:vae", 0],
    };
    imgs.forEach((link, i) => { inputs[`images.image_${i}`] = link; });
    g[id] = { class_type: "TextEncodeMOSSImageEdit", inputs };
    return [id, 0];
  };
  const pos = encode("MS:positive", promptFor(state, "edit"));
  const neg = encode("MS:negative", negativeText(state));

  g["MS:size"]   = { class_type: "GetImageSize", inputs: { image: imgs[0] } };
  g["MS:latent"] = { class_type: "EmptyFlux2LatentImage", inputs: { width: ["MS:size", 0], height: ["MS:size", 1], batch_size: 1 } };
  return sample(g, state, {
    model: ["MS:slgd", 0], positiveLink: pos, negativeLink: neg, latent: ["MS:latent", 0], denoise: 1,
    steps: state.editSteps ?? 30, cfg: state.editCfg ?? 4, sampler: state.editSampler || "euler", scheduler: state.editScheduler || "normal",
  });
}

// ── INPAINT: latent noise mask + DifferentialDiffusion (same route as Z-Image's inpaint) ──
export function buildInpaintGraph(state) {
  if (!state.inpaintImage) throw new Error("No source image uploaded for INPAINT.");
  if (!state.inpaintMask)  throw new Error("No mask: paint the area to repaint.");
  const { g, modelOut } = baseGraph(state);
  const w = snap16(state.inpaintWidth || state.width || 1024), h = snap16(state.inpaintHeight || state.height || 1024);
  g["MS:diff"]   = { class_type: "DifferentialDiffusion", inputs: { model: modelOut } };
  g["MS:src"]    = { class_type: "LoadImage", inputs: { image: state.inpaintImage } };
  g["MS:msrc"]   = { class_type: "LoadImage", inputs: { image: state.inpaintMask } };
  g["MS:fit"]    = { class_type: "ImageScale", inputs: { image: ["MS:src", 0], upscale_method: "lanczos", width: w, height: h, crop: "center" } };
  g["MS:mfit"]   = { class_type: "ImageScale", inputs: { image: ["MS:msrc", 0], upscale_method: "nearest-exact", width: w, height: h, crop: "center" } };
  g["MS:mask"]   = { class_type: "ImageToMask", inputs: { image: ["MS:mfit", 0], channel: "red" } };
  g["MS:encode"] = { class_type: "VAEEncode", inputs: { pixels: ["MS:fit", 0], vae: ["MS:vae", 0] } };
  g["MS:nmask"]  = { class_type: "SetLatentNoiseMask", inputs: { samples: ["MS:encode", 0], mask: ["MS:mask", 0] } };
  return sample(g, state, {
    model: ["MS:diff", 0], positiveLink: positive(g, promptFor(state, "inpaint")), latent: ["MS:nmask", 0],
    denoise: state.inpaintDenoise ?? 1,
  });
}

// ── R2I (bboxes): boxes + prompt -> MOSSImageLayoutPrompt -> CLIPTextEncode ──────
export function buildR2IGraph(state) {
  const boxes = (state.r2iBoxes || []).filter(b => b && b.width > 0 && b.height > 0);
  if (!boxes.length) throw new Error("Draw at least one box in R2I mode.");
  const { g, modelOut } = baseGraph(state);
  const { w: width, h: height } = workSize(state);
  g["MS:boxes"] = { class_type: "CreateBoundingBoxes", inputs: { width, height, editor_state: { __value__: boxes } } };   // a list of exactly two boxes would read as a [node, slot] link; ComfyUI unwraps __value__
  g["MS:layout"] = { class_type: "MOSSImageLayoutPrompt", inputs: {
    prompt: promptFor(state, "r2i"), element: ["MS:boxes", 2], width, height,
    character_boxes: state.r2iCharacters || "",
  }};
  return sample(g, state, { model: modelOut, positiveLink: positive(g, ["MS:layout", 0]), latent: emptyLatent(g, state) });
}

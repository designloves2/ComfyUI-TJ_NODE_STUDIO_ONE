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
function baseGraph(state) {
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

  let modelOut = withLoraChain(g, "MS:lora", ["MS:unet", 0], state.loras || []);
  if (state.slgEnabled) {
    g["MS:slg"] = { class_type: "SkipLayerGuidanceDiTSimple", inputs: {
      model: modelOut, double_layers: "", single_layers: state.slgLayers ?? "22",
      start_percent: state.slgStart ?? 0, end_percent: state.slgEnd ?? 0.5,
    }};
    modelOut = ["MS:slg", 0];
  }

  g["MS:negative"] = { class_type: "CLIPTextEncode", inputs: {
    clip: ["MS:clip", 0], text: (state.negativePrompt || "").trim() || DEFAULT_NEGATIVE,
  }};
  return { g, modelOut };
}

function positive(g, textOrLink) {
  g["MS:positive"] = { class_type: "CLIPTextEncode", inputs: { clip: ["MS:clip", 0], text: textOrLink } };
  return ["MS:positive", 0];
}

function sample(g, state, { model, positiveLink, latent, denoise }) {
  g["MS:sampler"] = { class_type: "KSampler", inputs: {
    model, positive: positiveLink, negative: ["MS:negative", 0], latent_image: latent,
    seed: state.seed ?? 0, steps: state.steps ?? DEFAULT_STEPS, cfg: state.cfg ?? DEFAULT_CFG,
    sampler_name: state.sampler || "er_sde", scheduler: state.scheduler || "simple",
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

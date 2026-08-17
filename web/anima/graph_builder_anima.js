// graph_builder_anima.js — Anima ONE STUDIO workflow graph builders
//
// Node graph confirmed by reading ComfyUI's official Anima templates directly
// (comfyui_workflow_templates_json): image_anima_base_v1.json,
// image_anima_lllite_image_inpainting.json, image_anima_lllite_any_control_to_image.json,
// image_anima_lllite_depth_control_to_image.json. See SPEC_ANIMA_ONE_STUDIO.md.
import { SUBFOLDER, LLLITE_PATCH, BASE_STEPS, BASE_CFG, TURBO_STEPS, TURBO_CFG } from "./core_anima.js";

function buildPromptText(state, modeKey) {
  const key = modeKey || state.mode || "t2i";
  return (state.promptsByMode && key in state.promptsByMode)
    ? state.promptsByMode[key] : (state.prompt || "");
}

function saveNode(link, state) {
  if (state?.outputMode === "preview")
    return { class_type: "PreviewImage", inputs: { images: link } };
  const folder = state?.saveSubfolder || SUBFOLDER;
  return { class_type: "SaveImage", inputs: { images: link, filename_prefix: `${folder}/Anima` } };
}

// Shared prelude: CLIP / VAE / UNet(+turbo LoRA) / positive+negative CLIPTextEncode.
// `unetName` lets T2I swap in the Preview3 checkpoint; all other modes always use Base 1.0.
function baseGraph(state, promptText, unetName) {
  const modelName = unetName        || state.model       || "";
  const clipName  = state.textEncoder || "";
  const vaeName   = state.vae         || "";
  if (!modelName) throw new Error("No diffusion model selected. Please set one in ⚙ Settings.");
  if (!clipName)  throw new Error("No text encoder selected. Please set one in ⚙ Settings.");
  if (!vaeName)   throw new Error("No VAE selected. Please set one in ⚙ Settings.");

  const g = {};
  g["AN:unet"] = { class_type: "UNETLoader", inputs: { unet_name: modelName, weight_dtype: "default" } };
  g["AN:clip"] = { class_type: "CLIPLoader", inputs: { clip_name: clipName, type: "stable_diffusion", device: "default" } };
  g["AN:vae"]  = { class_type: "VAELoader",  inputs: { vae_name: vaeName } };

  let modelOut = ["AN:unet", 0];
  const turboOn = !!state.turboMode;
  if (turboOn) {
    const loraName = state.turboLora || "";
    if (!loraName) throw new Error("Turbo mode is ON but no Turbo LoRA is selected. Set one in ⚙ Settings.");
    g["AN:turbo_lora"] = { class_type: "LoraLoaderModelOnly", inputs: {
      model: modelOut, lora_name: loraName, strength_model: 1,
    }};
    modelOut = ["AN:turbo_lora", 0];
  }

  g["AN:positive"] = { class_type: "CLIPTextEncode", inputs: { clip: ["AN:clip", 0], text: promptText || "" } };
  const negativeText = (state.negativePrompt || "").trim();
  g["AN:negative"] = negativeText
    ? { class_type: "CLIPTextEncode", inputs: { clip: ["AN:clip", 0], text: negativeText } }
    : { class_type: "ConditioningZeroOut", inputs: { conditioning: ["AN:positive", 0] } };

  const steps = turboOn ? TURBO_STEPS : (state.steps ?? BASE_STEPS);
  const cfg   = turboOn ? TURBO_CFG   : (state.cfg   ?? BASE_CFG);

  return { g, modelOut, steps, cfg };
}

function ksampler(g, id, { model, positive, negative, latent, seed, steps, cfg, sampler, scheduler, denoise }) {
  g[id] = { class_type: "KSampler", inputs: {
    model, positive, negative, latent_image: latent,
    seed: seed ?? 0, steps: steps ?? BASE_STEPS, cfg: cfg ?? BASE_CFG,
    sampler_name: sampler || "euler", scheduler: scheduler || "simple",
    denoise: denoise ?? 1,
  }};
  return [id, 0];
}

// ── T2I ──────────────────────────────────────────────────────────────────────
export function buildT2IGraph(state) {
  const useVariant = state.useBaseVariant === "preview3";
  const unetName = useVariant ? (state.previewModel || "") : (state.model || "");
  if (useVariant && !unetName) throw new Error("No Preview3 model selected. Set one in ⚙ Settings.");

  const { g, modelOut, steps, cfg } = baseGraph(state, buildPromptText(state, "t2i"), unetName);

  g["AN:latent"] = { class_type: "EmptyLatentImage", inputs: {
    width: state.width || 1024, height: state.height || 1024, batch_size: 1,
  }};

  const samplerOut = ksampler(g, "AN:sampler", {
    model: modelOut, positive: ["AN:positive", 0], negative: ["AN:negative", 0],
    latent: ["AN:latent", 0], seed: state.seed ?? 0, steps, cfg,
    sampler: state.sampler, scheduler: state.scheduler, denoise: 1,
  });

  g["AN:decode"] = { class_type: "VAEDecode", inputs: { samples: samplerOut, vae: ["AN:vae", 0] } };
  g["AN:save"]   = saveNode(["AN:decode", 0], state);
  return g;
}

// ── Shared LLLite control-mode builder ──────────────────────────────────────
// mode: "inpaint" | "anycontrol" | "depthcontrol"
function buildLLLiteGraph(state, mode, opts) {
  const { image, mask, strength, start, end, promptKey } = opts;
  if (!image) throw new Error("No source image uploaded for this mode.");

  const { g, modelOut, steps, cfg } = baseGraph(state, buildPromptText(state, promptKey));

  g["AN:src"] = { class_type: "LoadImage", inputs: { image } };
  let maskLink;
  if (mask) {
    g["AN:mask_src"] = { class_type: "LoadImage", inputs: { image: mask } };
    g["AN:mask"] = { class_type: "ImageToMask", inputs: { image: ["AN:mask_src", 0], channel: "red" } };
    maskLink = ["AN:mask", 0];
  } else {
    // No mask supplied — full-coverage mask so AnimaLLLiteApply gets a valid MASK input.
    g["AN:mask"] = { class_type: "SolidMask", inputs: { value: 1.0, width: state.width || 1024, height: state.height || 1024 } };
    maskLink = ["AN:mask", 0];
  }

  let controlImgLink = ["AN:src", 0];
  if (mode === "depthcontrol") {
    g["AN:depth_pre"] = { class_type: "DepthAnythingV2Preprocessor", inputs: {
      image: ["AN:src", 0],
      ckpt_name: state.depthCkpt || "depth_anything_v2_vitl.pth",
      resolution: state.preprocResolution ?? 512,
    }};
    controlImgLink = ["AN:depth_pre", 0];
  }

  g["AN:patch"] = { class_type: "ModelPatchLoader", inputs: { name: LLLITE_PATCH[mode] } };
  g["AN:lllite"] = { class_type: "AnimaLLLiteApply", inputs: {
    model: modelOut,
    model_patch: ["AN:patch", 0],
    image: controlImgLink,
    mask: maskLink,
    strength: strength ?? 1.0,
    start_percent: start ?? 0.0,
    end_percent: end ?? 1.0,
  }};

  g["AN:latent"] = { class_type: "EmptyLatentImage", inputs: {
    width: state.width || 1024, height: state.height || 1024, batch_size: 1,
  }};

  const samplerOut = ksampler(g, "AN:sampler", {
    model: ["AN:lllite", 0], positive: ["AN:positive", 0], negative: ["AN:negative", 0],
    latent: ["AN:latent", 0], seed: state.seed ?? 0, steps, cfg,
    sampler: state.sampler, scheduler: state.scheduler, denoise: 1,
  });

  g["AN:decode"] = { class_type: "VAEDecode", inputs: { samples: samplerOut, vae: ["AN:vae", 0] } };
  g["AN:save"]   = saveNode(["AN:decode", 0], state);
  return g;
}

// ── Inpainting ───────────────────────────────────────────────────────────────
export function buildInpaintGraph(state) {
  if (!state.inpaintMask) throw new Error("No mask uploaded for Inpainting. Paint/upload a mask first.");
  return buildLLLiteGraph(state, "inpaint", {
    image: state.inpaintImage, mask: state.inpaintMask,
    strength: state.inpaintStrength, start: state.inpaintStart, end: state.inpaintEnd,
    promptKey: "inpaint",
  });
}

// ── Any Control to Image ──────────────────────────────────────────────────────
export function buildAnyControlGraph(state) {
  return buildLLLiteGraph(state, "anycontrol", {
    image: state.anyControlImage, mask: state.anyControlMask,
    strength: state.anyControlStrength, start: state.anyControlStart, end: state.anyControlEnd,
    promptKey: "anycontrol",
  });
}

// ── Depth Control to Image ────────────────────────────────────────────────────
export function buildDepthControlGraph(state) {
  return buildLLLiteGraph(state, "depthcontrol", {
    image: state.depthControlImage, mask: null,
    strength: state.depthControlStrength, start: state.depthControlStart, end: state.depthControlEnd,
    promptKey: "depthcontrol",
  });
}

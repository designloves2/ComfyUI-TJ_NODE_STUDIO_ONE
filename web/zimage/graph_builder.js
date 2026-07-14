// graph_builder.js
import { SUBFOLDER } from "./core.js";

function buildPromptText(state) {
  const modePrompt = (state.promptsByMode && state.mode && state.mode in state.promptsByMode)
    ? state.promptsByMode[state.mode] : (state.prompt || "");
  // 외부 오버라이드가 있으면 맨 앞에 삽입
  const parts = state.promptOverride
    ? [state.promptOverride, modePrompt]
    : [modePrompt];
  (state.loras || []).forEach(l => {
    if (l.enabled !== false && l.name && l.name !== "none" && l.triggerWord) parts.push(l.triggerWord);
  });
  if (state.promptSuffix) parts.push(state.promptSuffix);
  return parts.filter(Boolean).join(", ");
}

function resolveModels(state) {
  return {
    modelName: (state.useModelOverride && state.modelOverride) || state.model,
    clipName:  (state.useModelOverride && state.clipOverride)  || state.textEncoder,
    vaeName:   (state.useModelOverride && state.vaeOverride)   || state.vae,
  };
}

function unetNode(name) {
  if (name.toLowerCase().endsWith(".gguf"))
    return { class_type: "UnetLoaderGGUF", inputs: { unet_name: name } };
  return { class_type: "UNETLoader", inputs: { unet_name: name, weight_dtype: "default" } };
}

function clipNode(name) {
  if (name.toLowerCase().endsWith(".gguf"))
    return { class_type: "CLIPLoaderGGUF", inputs: { clip_name: name, type: "lumina2" } };
  return { class_type: "CLIPLoader", inputs: { clip_name: name, type: "lumina2", device: "default" } };
}

function withLoraChain(modelLink, loras) {
  const graph = {};
  let out = modelLink;
  (loras || []).forEach((lora, i) => {
    if (!lora.name || lora.name === "none" || lora.enabled === false) return;
    const strength = parseFloat(lora.strength ?? 1);
    if (!(strength > 0)) return;
    const id = `ZIT:lora${i}`;
    graph[id] = { class_type:"LoraLoaderModelOnly", inputs:{ model:out, lora_name:lora.name, strength_model:strength } };
    out = [id, 0];
  });
  return { graph, modelOut: out };
}

function baseGraph(state) {
  const { modelName, clipName, vaeName } = resolveModels(state);
  const g = {};
  g["ZIT:unet"] = unetNode(modelName);
  g["ZIT:clip"] = clipNode(clipName);
  g["ZIT:vae"]  = { class_type:"VAELoader", inputs:{ vae_name:vaeName } };
  const { graph: lg, modelOut } = withLoraChain(["ZIT:unet",0], state.loras||[]);
  Object.assign(g, lg);
  g["ZIT:modelSampling"] = { class_type:"ModelSamplingAuraFlow", inputs:{ model:modelOut, shift:state.shift??3 } };
  g["ZIT:positive"] = { class_type:"CLIPTextEncode", inputs:{ clip:["ZIT:clip",0], text:buildPromptText(state) } };
  g["ZIT:negative"] = { class_type:"CLIPTextEncode", inputs:{ clip:["ZIT:clip",0], text:state.negativePrompt||"" } };
  return g;
}

function saveNode(link, state) {
  if (state?.outputMode === "preview")
    return { class_type:"PreviewImage", inputs:{ images:link } };
  const folder = state?.saveSubfolder || SUBFOLDER;
  return { class_type:"SaveImage", inputs:{ images:link, filename_prefix:`${folder}/ZIT` } };
}

function ksampler(state, latent, denoise) {
  return { class_type:"KSampler", inputs:{
    model:["ZIT:modelSampling",0],
    positive:["ZIT:positive",0], negative:["ZIT:negative",0],
    latent_image:latent,
    seed:state.seed??0, steps:state.steps??8, cfg:state.cfg??1,
    sampler_name:state.sampler||"euler", scheduler:state.scheduler||"simple",
    denoise:denoise??1,
  }};
}

// ── T2I ──────────────────────────────────────────────────────────────────
export function buildT2IGraph(state) {
  const g = baseGraph(state);
  g["ZIT:latent"]    = { class_type:"EmptySD3LatentImage", inputs:{ width:state.width||1024, height:state.height||1536, batch_size:1 } };
  g["ZIT:sampler"]   = ksampler(state, ["ZIT:latent",0], 1);
  g["ZIT:vaeDecode"] = { class_type:"VAEDecode", inputs:{ samples:["ZIT:sampler",0], vae:["ZIT:vae",0] } };
  g["ZIT:save"]      = saveNode(["ZIT:vaeDecode",0], state);
  return g;
}

// ── I2I ──────────────────────────────────────────────────────────────────
export function buildI2IGraph(state) {
  if (!state.i2iImage) throw new Error("No source image uploaded.");
  const g = baseGraph(state);
  g["ZIT:load"] = { class_type:"LoadImage", inputs:{ image:state.i2iImage } };
  // Insert ImageScale when custom output size is set
  const pixSrc = (state.i2iWidth && state.i2iHeight)
    ? (g["ZIT:scale"] = { class_type:"ImageScale", inputs:{ image:["ZIT:load",0], width:state.i2iWidth, height:state.i2iHeight, upscale_method:"lanczos", crop:"disabled" } }, ["ZIT:scale",0])
    : ["ZIT:load",0];
  g["ZIT:vaeEnc"]    = { class_type:"VAEEncode",  inputs:{ pixels:pixSrc, vae:["ZIT:vae",0] } };
  g["ZIT:sampler"]   = ksampler(state, ["ZIT:vaeEnc",0], state.i2iDenoise??0.75);
  g["ZIT:vaeDecode"] = { class_type:"VAEDecode", inputs:{ samples:["ZIT:sampler",0], vae:["ZIT:vae",0] } };
  g["ZIT:save"]      = saveNode(["ZIT:vaeDecode",0], state);
  return g;
}

// ── INPAINT — DifferentialDiffusion + SetLatentNoiseMask ─────────────────
// Flow 모델에서 EmptyLatent+composite 방식은 맥락을 무시한 완전히 다른 이미지를 생성.
// DifferentialDiffusion은 마스크 강도에 따라 노이즈 레벨을 픽셀별로 다르게 적용해
// 원본 맥락을 유지하면서 마스크 영역만 자연스럽게 재생성한다.
export function buildInpaintGraph(state) {
  if (!state.inpaintImage)     throw new Error("Upload a source image.");
  if (!state.inpaintMaskImage) throw new Error("Upload a mask image.");

  const { modelName, clipName, vaeName } = resolveModels(state);
  const g = {};
  g["ZIT:unet"] = unetNode(modelName);
  g["ZIT:clip"] = clipNode(clipName);
  g["ZIT:vae"]  = { class_type:"VAELoader", inputs:{ vae_name:vaeName } };
  const { graph: lg, modelOut } = withLoraChain(["ZIT:unet",0], state.loras||[]);
  Object.assign(g, lg);
  g["ZIT:modelSamp"] = { class_type:"ModelSamplingAuraFlow", inputs:{ model:modelOut,              shift:state.shift??3 } };
  g["ZIT:diffDiff"]  = { class_type:"DifferentialDiffusion", inputs:{ model:["ZIT:modelSamp",0] } };
  g["ZIT:positive"]  = { class_type:"CLIPTextEncode", inputs:{ clip:["ZIT:clip",0], text:buildPromptText(state) } };
  g["ZIT:negative"]  = { class_type:"CLIPTextEncode", inputs:{ clip:["ZIT:clip",0], text:state.negativePrompt||"" } };

  g["ZIT:load"]      = { class_type:"LoadImage",   inputs:{ image:state.inpaintImage } };
  g["ZIT:loadMask"]  = { class_type:"LoadImage",   inputs:{ image:state.inpaintMaskImage } };
  g["ZIT:toMask"]    = { class_type:"ImageToMask", inputs:{ image:["ZIT:loadMask",0], channel:"red" } };
  g["ZIT:vaeEnc"]    = { class_type:"VAEEncode",   inputs:{ pixels:["ZIT:load",0],   vae:["ZIT:vae",0] } };
  g["ZIT:noiseMask"] = { class_type:"SetLatentNoiseMask", inputs:{ samples:["ZIT:vaeEnc",0], mask:["ZIT:toMask",0] } };

  g["ZIT:sampler"] = { class_type:"KSampler", inputs:{
    model:["ZIT:diffDiff",0],
    positive:["ZIT:positive",0], negative:["ZIT:negative",0],
    latent_image:["ZIT:noiseMask",0],
    seed:state.seed??0, steps:state.steps??8, cfg:state.cfg??1,
    sampler_name:state.sampler||"euler", scheduler:state.scheduler||"simple",
    denoise:state.inpaintDenoise??0.85,
  }};
  g["ZIT:vaeDecode"] = { class_type:"VAEDecode", inputs:{ samples:["ZIT:sampler",0], vae:["ZIT:vae",0] } };
  g["ZIT:save"]      = saveNode(["ZIT:vaeDecode",0], state);
  return g;
}

// ── OUTPAINT — DifferentialDiffusion으로 확장 영역만 자연스럽게 생성 ──────
// 기존 방식: VAEEncode(검은 패딩) → SetLatentNoiseMask → 검은 이미지 출력
// (Flow 모델에서 검은 패딩 latent가 near-zero값이라 샘플러가 그대로 출력)
// 수정: DifferentialDiffusion이 마스크 기반으로 패딩 영역에만 full denoise 적용.
export function buildOutpaintGraph(state) {
  if (!state.outpaintImage) throw new Error("Upload a source image.");
  const t = (state.outpaintUp||0)+(state.outpaintDown||0)+(state.outpaintLeft||0)+(state.outpaintRight||0);
  if (t <= 0) throw new Error("Set at least one expansion value > 0 px.");

  const { modelName: mn2, clipName: cn2, vaeName: vn2 } = resolveModels(state);
  const g = {};
  g["ZIT:unet"] = unetNode(mn2);
  g["ZIT:clip"] = clipNode(cn2);
  g["ZIT:vae"]  = { class_type:"VAELoader", inputs:{ vae_name:vn2 } };
  const { graph: lg, modelOut } = withLoraChain(["ZIT:unet",0], state.loras||[]);
  Object.assign(g, lg);
  g["ZIT:modelSamp"] = { class_type:"ModelSamplingAuraFlow", inputs:{ model:modelOut,              shift:state.shift??3 } };
  g["ZIT:diffDiff"]  = { class_type:"DifferentialDiffusion", inputs:{ model:["ZIT:modelSamp",0] } };
  g["ZIT:positive"]  = { class_type:"CLIPTextEncode", inputs:{ clip:["ZIT:clip",0], text:buildPromptText(state) } };
  g["ZIT:negative"]  = { class_type:"CLIPTextEncode", inputs:{ clip:["ZIT:clip",0], text:state.negativePrompt||"" } };

  g["ZIT:load"] = { class_type:"LoadImage",           inputs:{ image:state.outpaintImage } };
  g["ZIT:pad"]  = { class_type:"ImagePadForOutpaint", inputs:{
    image:["ZIT:load",0],
    left:Math.max(0,state.outpaintLeft||0), top:Math.max(0,state.outpaintUp||0),
    right:Math.max(0,state.outpaintRight||0), bottom:Math.max(0,state.outpaintDown||0),
    feathering:state.outpaintFeather??32,
  }};
  g["ZIT:vaeEnc"]    = { class_type:"VAEEncode",          inputs:{ pixels:["ZIT:pad",0],    vae:["ZIT:vae",0] } };
  g["ZIT:noiseMask"] = { class_type:"SetLatentNoiseMask", inputs:{ samples:["ZIT:vaeEnc",0], mask:["ZIT:pad",1] } };

  g["ZIT:sampler"] = { class_type:"KSampler", inputs:{
    model:["ZIT:diffDiff",0],
    positive:["ZIT:positive",0], negative:["ZIT:negative",0],
    latent_image:["ZIT:noiseMask",0],
    seed:state.seed??0, steps:state.steps??8, cfg:state.cfg??1,
    sampler_name:state.sampler||"euler", scheduler:state.scheduler||"simple",
    denoise:1,
  }};
  g["ZIT:vaeDecode"] = { class_type:"VAEDecode", inputs:{ samples:["ZIT:sampler",0], vae:["ZIT:vae",0] } };
  g["ZIT:save"]      = saveNode(["ZIT:vaeDecode",0], state);
  return g;
}

// ── RE-BG — RMBG로 서브젝트 분리 후 배경 완전 재생성, 경계선 없는 확장 ────
// 기존 outpaint: 원본 픽셀 유지 → 경계선 발생
// RE-BG: 배경 전체를 새로 생성(denoise=1) → 경계선 없음, 서브젝트만 합성
export function buildReBGGraph(state) {
  if (!state.rebgImage)   throw new Error("Upload a source image.");
  if (!state.rebgBgModel) throw new Error("Select a background removal model.");

  const { modelName: mn3, clipName: cn3, vaeName: vn3 } = resolveModels(state);
  const g = {};
  g["ZIT:unet"] = unetNode(mn3);
  g["ZIT:clip"] = clipNode(cn3);
  g["ZIT:vae"]  = { class_type:"VAELoader", inputs:{ vae_name:vn3 } };
  const { graph: lg, modelOut } = withLoraChain(["ZIT:unet",0], state.loras||[]);
  Object.assign(g, lg);
  g["ZIT:modelSamp"] = { class_type:"ModelSamplingAuraFlow", inputs:{ model:modelOut, shift:state.shift??3 } };
  g["ZIT:positive"]  = { class_type:"CLIPTextEncode", inputs:{ clip:["ZIT:clip",0], text:buildPromptText(state) } };
  g["ZIT:negative"]  = { class_type:"CLIPTextEncode", inputs:{ clip:["ZIT:clip",0], text:state.negativePrompt||"" } };

  // 소스 로드 + RMBG → 서브젝트 마스크 추출
  g["ZIT:load"]    = { class_type:"LoadImage",                  inputs:{ image:state.rebgImage } };
  g["ZIT:bgModel"] = { class_type:"LoadBackgroundRemovalModel", inputs:{ bg_removal_name:state.rebgBgModel } };
  g["ZIT:rmbg"] = { class_type:"RemoveBackground", inputs:{ image:["ZIT:load",0], bg_removal_model:["ZIT:bgModel",0] } };
  // RemoveBackground 출력: subject 마스크 (흰=서브젝트, 검=배경) — 반전 불필요

  // 마스크 엣지 처리 체인 (offset + blur)
  // offset != 0 이면 GrowMask 로 마스크 경계를 확장(+) 또는 축소(-)
  // blur  >  0 이면 ImageBlur 로 마스크를 블러링 → 자연스러운 엣지
  let maskRef = ["ZIT:rmbg", 0]; // 현재 마스크 출력 참조

  const offset = Math.round(state.rebgOffset || 0);
  if (offset !== 0) {
    g["ZIT:maskGrow"] = { class_type:"GrowMask", inputs:{ mask:maskRef, expand:offset, tapered_corners:true } };
    maskRef = ["ZIT:maskGrow", 0];
  }

  const blur = Math.round(Math.max(0, state.rebgBlur || 0));
  if (blur > 0) {
    g["ZIT:maskToImg2"] = { class_type:"MaskToImage", inputs:{ mask:maskRef } };
    g["ZIT:maskBlur"]   = { class_type:"ImageBlur",   inputs:{ image:["ZIT:maskToImg2",0], blur_radius:blur, sigma:blur * 0.5 } };
    g["ZIT:maskFinal"]  = { class_type:"ImageToMask", inputs:{ image:["ZIT:maskBlur",0], channel:"red" } };
    maskRef = ["ZIT:maskFinal", 0];
  }

  g["ZIT:maskImg"] = { class_type:"MaskToImage", inputs:{ mask:maskRef } };

  // 확장 패딩 (0이면 원본 크기 유지 — 배경만 재생성)
  const padBase = {
    left:       Math.max(0, state.rebgLeft   || 0),
    top:        Math.max(0, state.rebgUp     || 0),
    right:      Math.max(0, state.rebgRight  || 0),
    bottom:     Math.max(0, state.rebgDown   || 0),
    feathering: state.rebgFeather ?? 40,
  };
  g["ZIT:padSrc"]     = { class_type:"ImagePadForOutpaint", inputs:{ ...padBase, image:["ZIT:load",0] } };
  // 마스크 패딩은 feathering=0 → 서브젝트 경계를 흐리지 않음
  g["ZIT:padMaskImg"] = { class_type:"ImagePadForOutpaint", inputs:{ ...padBase, feathering:0, image:["ZIT:maskImg",0] } };
  g["ZIT:padMask"]    = { class_type:"ImageToMask", inputs:{ image:["ZIT:padMaskImg",0], channel:"red" } };

  // 패딩된 캔버스 전체를 새 배경으로 완전 재생성 (denoise=1 → 경계선 없음)
  g["ZIT:vaeEnc"]    = { class_type:"VAEEncode", inputs:{ pixels:["ZIT:padSrc",0], vae:["ZIT:vae",0] } };
  g["ZIT:sampler"]   = { class_type:"KSampler", inputs:{
    model:["ZIT:modelSamp",0],
    positive:["ZIT:positive",0], negative:["ZIT:negative",0],
    latent_image:["ZIT:vaeEnc",0],
    seed:state.seed??0, steps:state.steps??8, cfg:state.cfg??1,
    sampler_name:state.sampler||"euler", scheduler:state.scheduler||"simple",
    denoise: state.rebgDenoise ?? 1,
  }};
  g["ZIT:vaeDecode"] = { class_type:"VAEDecode", inputs:{ samples:["ZIT:sampler",0], vae:["ZIT:vae",0] } };

  // 서브젝트를 새 배경 위에 합성
  // destination=새배경, source=패딩된원본(서브젝트영역), mask=서브젝트마스크(흰=서브젝트)
  g["ZIT:composite"] = {
    class_type:"ImageCompositeMasked",
    inputs:{
      destination:["ZIT:vaeDecode",0],
      source:["ZIT:padSrc",0],
      x:0, y:0, resize_source:false,
      mask:["ZIT:padMask",0],
    },
  };
  g["ZIT:save"] = saveNode(["ZIT:composite",0], state);
  return g;
}

// ── CONTROLNET ────────────────────────────────────────────────────────────
const PREPROCESSOR_MAP = { canny:"CannyEdgePreprocessor", depth:"DepthAnythingPreprocessor", pose:"DWPreprocessor", hed:"HEDPreprocessor", mlsd:"M-LSDPreprocessor" };

export function buildControlNetGraph(state) {
  if (!state.controlnetImage) throw new Error("Upload a reference image.");
  if (!state.controlnetModel)  throw new Error("Select a ControlNet Union model.");
  const { modelName: mn4, clipName: cn4, vaeName: vn4 } = resolveModels(state);
  const g = {};
  g["ZIT:unet"] = unetNode(mn4);
  g["ZIT:clip"] = clipNode(cn4);
  g["ZIT:vae"]  = { class_type:"VAELoader", inputs:{ vae_name:vn4 } };
  const { graph: lg, modelOut } = withLoraChain(["ZIT:unet",0], state.loras||[]);
  Object.assign(g, lg);
  g["ZIT:positive"] = { class_type:"CLIPTextEncode", inputs:{ clip:["ZIT:clip",0], text:buildPromptText(state) } };
  g["ZIT:negative"] = { class_type:"CLIPTextEncode", inputs:{ clip:["ZIT:clip",0], text:state.negativePrompt||"" } };
  g["ZIT:loadImg"]  = { class_type:"LoadImage", inputs:{ image:state.controlnetImage } };
  let ctrlLink = ["ZIT:loadImg",0];
  const prep = PREPROCESSOR_MAP[state.controlnetType??"depth"];
  if (prep) {
    g["ZIT:pre"] = { class_type:"AIO_Preprocessor", inputs:{ image:ctrlLink, preprocessor:prep, resolution:state.controlnetResolution??1024 } };
    ctrlLink = ["ZIT:pre",0];
  }
  g["ZIT:patch"]     = { class_type:"ModelPatchLoader",       inputs:{ name:state.controlnetModel } };
  g["ZIT:cnApply"]   = { class_type:"ZImageFunControlnet",    inputs:{ model:modelOut, model_patch:["ZIT:patch",0], vae:["ZIT:vae",0], strength:state.controlnetStrength??1, image:ctrlLink } };
  g["ZIT:modelSamp"] = { class_type:"ModelSamplingAuraFlow",  inputs:{ model:["ZIT:cnApply",0], shift:state.shift??3 } };
  g["ZIT:getSize"]   = { class_type:"GetImageSize",           inputs:{ image:ctrlLink } };
  g["ZIT:latent"]    = { class_type:"EmptySD3LatentImage",    inputs:{ width:["ZIT:getSize",0], height:["ZIT:getSize",1], batch_size:1 } };
  g["ZIT:sampler"]   = { class_type:"KSampler", inputs:{
    model:["ZIT:modelSamp",0], positive:["ZIT:positive",0], negative:["ZIT:negative",0],
    latent_image:["ZIT:latent",0], seed:state.seed??0, steps:state.steps??8, cfg:state.cfg??1,
    sampler_name:state.sampler||"euler", scheduler:state.scheduler||"simple", denoise:state.controlnetDenoise??1,
  }};
  g["ZIT:vaeDecode"] = { class_type:"VAEDecode", inputs:{ samples:["ZIT:sampler",0], vae:["ZIT:vae",0] } };
  g["ZIT:save"]      = saveNode(["ZIT:vaeDecode",0], state);
  return g;
}

// ── FACE REDRAW — uses FaceDetailer from Impact Pack ─────────────────────
// FaceDetailer handles detection → crop → diffusion → stitch internally.
export function buildFaceRedrawGraph(state) {
  if (!state.faceImage)          throw new Error("Upload a portrait image.");
  if (!state.faceDetectorModel || state.faceDetectorModel === "none") throw new Error("Select a face detector model.");

  const { modelName: mn5, clipName: cn5, vaeName: vn5 } = resolveModels(state);
  const g = {};
  g["ZIT:unet"] = unetNode(mn5);
  g["ZIT:clip"] = clipNode(cn5);
  g["ZIT:vae"]  = { class_type:"VAELoader", inputs:{ vae_name:vn5 } };
  const { graph: lg, modelOut } = withLoraChain(["ZIT:unet",0], state.loras||[]);
  Object.assign(g, lg);
  g["ZIT:modelSamp"] = { class_type:"ModelSamplingAuraFlow", inputs:{ model:modelOut, shift:state.shift??3 } };
  g["ZIT:positive"]  = { class_type:"CLIPTextEncode", inputs:{ clip:["ZIT:clip",0], text:buildPromptText(state) } };
  g["ZIT:negative"]  = { class_type:"CLIPTextEncode", inputs:{ clip:["ZIT:clip",0], text:state.negativePrompt||"" } };

  g["ZIT:loadImg"]   = { class_type:"LoadImage",                    inputs:{ image:state.faceImage } };
  g["ZIT:bboxProv"]  = { class_type:"UltralyticsDetectorProvider",  inputs:{ model_name:state.faceDetectorModel } };

  // FaceDetailer: auto-detect → crop → regenerate → stitch
  g["ZIT:faceDetail"] = {
    class_type:"FaceDetailer",
    inputs:{
      image:["ZIT:loadImg",0],
      model:["ZIT:modelSamp",0],
      clip:["ZIT:clip",0],
      vae:["ZIT:vae",0],
      positive:["ZIT:positive",0],
      negative:["ZIT:negative",0],
      bbox_detector:["ZIT:bboxProv",0],
      guide_size:512,
      guide_size_for:true,
      max_size:1024,
      seed:state.seed??0,
      steps:state.steps??8,
      cfg:state.cfg??1,
      sampler_name:state.sampler||"euler",
      scheduler:state.scheduler||"simple",
      denoise:state.faceDenoise??0.5,
      feather:state.faceFeather??5,
      noise_mask:true,
      force_inpaint:true,
      bbox_threshold:state.faceThreshold??0.5,
      bbox_dilation:state.faceDilation??4,
      bbox_crop_factor:3.0,
      sam_detection_hint:"center-1",
      sam_dilation:0,
      sam_threshold:0.93,
      sam_bbox_expansion:0,
      sam_mask_hint_threshold:0.7,
      sam_mask_hint_use_negative:"False",
      drop_size:10,
      refiner_ratio:0.2,
      inpaint_model:false,
      noise_mask_feather:20,
      wildcard:"",
      cycle:1,
    },
  };
  g["ZIT:save"] = saveNode(["ZIT:faceDetail",0], state);
  return g;
}

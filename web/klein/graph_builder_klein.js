// graph_builder_klein.js — async flux2 klein workflow loading + patching
import { api } from "../../../scripts/api.js";
import { SUBFOLDER } from "./core_klein.js";

function resolveModels(state) {
  return {
    modelName: (state.useModelOverride && state.modelOverride) || state.model       || "",
    clipName:  (state.useModelOverride && state.clipOverride)  || state.textEncoder || "",
    vaeName:   (state.useModelOverride && state.vaeOverride)   || state.vae         || "",
  };
}

function patchModelLoader(prompt, nodeId, modelName) {
  if (!prompt[nodeId]) return;
  if (modelName.toLowerCase().endsWith(".gguf")) {
    prompt[nodeId].class_type = "UnetLoaderGGUF";
    delete prompt[nodeId].inputs.weight_dtype;
  } else {
    prompt[nodeId].class_type = "UNETLoader";
    if (!prompt[nodeId].inputs.weight_dtype) prompt[nodeId].inputs.weight_dtype = "default";
  }
  prompt[nodeId].inputs.unet_name = modelName;
}

function patchClipLoader(prompt, nodeId, clipName) {
  if (!prompt[nodeId]) return;
  if (clipName.toLowerCase().endsWith(".gguf")) {
    prompt[nodeId].class_type = "CLIPLoaderGGUF";
  } else {
    prompt[nodeId].class_type = "CLIPLoader";
  }
  prompt[nodeId].inputs.clip_name = clipName;
}

// T2I / Edit shared node IDs
const WF = {
  model:     "FK:165",
  textEnc:   "FK:155",
  vae:       "FK:153",
  promptPos: "FK:166",
  promptNeg: "FK:156",
  sampling:  "FK:169",
  latent:    "FK:170",
  sampler:   "FK:171",
  saveImage: "FK:86",
  loadImage1:"FK:91",
  loadImage2:"FK:88",
  scaleImg1: "FK:163",
  scaleImg2: "FK:163b",
  getSize:   "FK:167",
  vaeEnc1:   "FK:132",
  vaeEnc2:   "FK:232",
  refPos1:   "FK:133",
  refNeg1:   "FK:131",
  refPos2:   "FK:233",
  refNeg2:   "FK:231",
};

async function loadWorkflow(name) {
  const r = await api.fetchApi(`/flux_klein/workflow_${name}`);
  if (!r.ok) throw new Error(`Cannot load ${name} workflow — HTTP ${r.status}. Try restarting ComfyUI.`);
  return r.json();
}

export function getUseKV(state) {
  if (state.kvCacheOverride === "on")  return true;
  if (state.kvCacheOverride === "off") return false;
  return (state.model || "").toLowerCase().includes("kv");
}

function buildPromptText(state, mode) {
  const base = (state.promptsByMode && state.promptsByMode[mode]) || state.prompt || "";
  const parts = [base];
  (state.loras || []).forEach(l => {
    if (l.enabled !== false && l.name && l.name !== "none" && l.triggerWord) parts.push(l.triggerWord);
  });
  if (state.promptSuffix) parts.push(state.promptSuffix);
  return parts.filter(Boolean).join(", ");
}

function applyLoraChain(prompt, state, chainSrc, idPrefix) {
  const toPrev = p => (typeof p === "string" ? [p, 0] : p);
  let prev = chainSrc;
  (state.loras || []).forEach((ul, i) => {
    if (!ul.name || ul.name === "none" || ul.enabled === false || !(+(ul.strength || 0) > 0)) return;
    const id = `${idPrefix}UL${i + 1}`;
    prompt[id] = {
      class_type: "LoraLoaderModelOnly",
      inputs: { lora_name: ul.name, strength_model: +(ul.strength ?? 1), model: toPrev(prev) },
    };
    prev = [id, 0];
  });
  return prev;
}

function set(prompt, id, key, val) {
  if (prompt[id]) prompt[id].inputs[key] = val;
}

function patchSave(prompt, saveId, state) {
  if (!prompt[saveId]) return;
  const folder = state.saveSubfolder || SUBFOLDER;
  if (state.outputMode === "preview") {
    prompt[saveId].class_type = "PreviewImage";
    delete prompt[saveId].inputs.filename_prefix;
  } else {
    prompt[saveId].inputs.filename_prefix = `${folder}/FK`;
  }
}

function patchT2IBase(prompt, state, samplerNodeId) {
  const useKV  = getUseKV(state);
  const isBase = (state.model || "").toLowerCase().includes("base");
  const { modelName, clipName, vaeName } = resolveModels(state);

  patchModelLoader(prompt, WF.model,   modelName);
  patchClipLoader (prompt, WF.textEnc, clipName);
  set(prompt, WF.vae, "vae_name", vaeName);

  let modelSrc = WF.model;
  if (useKV) {
    prompt["FK:KV"] = {
      class_type: "FluxKVCache",
      inputs: { model: [WF.model, 0] },
      _meta: { title: "Flux KV Cache" },
    };
    modelSrc = "FK:KV";
  }

  const finalRef = applyLoraChain(prompt, state, modelSrc, "FK:");
  set(prompt, WF.sampling, "model", typeof finalRef === "string" ? [finalRef, 0] : finalRef);

  const steps = state.steps || 4;
  const cfg   = state.cfg !== undefined ? state.cfg : (isBase ? 5 : 1);
  set(prompt, samplerNodeId, "steps",        steps);
  set(prompt, samplerNodeId, "cfg",          cfg);
  set(prompt, samplerNodeId, "sampler_name", state.sampler   || "euler");
  set(prompt, samplerNodeId, "scheduler",    state.scheduler || "simple");
  set(prompt, samplerNodeId, "seed",         state.seed ?? 0);
}

// ── T2I ──────────────────────────────────────────────────────────────────────
export async function buildT2IGraph(state) {
  const prompt = await loadWorkflow("t2i");
  patchT2IBase(prompt, state, WF.sampler);
  set(prompt, WF.promptPos, "text", buildPromptText(state, "t2i"));
  set(prompt, WF.promptNeg, "text", state.negativePrompt || "");
  set(prompt, WF.latent,    "width",  state.width  || 1024);
  set(prompt, WF.latent,    "height", state.height || 1024);
  set(prompt, WF.sampler,   "denoise", 1);
  patchSave(prompt, WF.saveImage, state);
  return prompt;
}

// ── I2I ──────────────────────────────────────────────────────────────────────
export async function buildI2IGraph(state) {
  if (!state.i2iImage) throw new Error("No source image uploaded.");
  const prompt = await loadWorkflow("i2i");
  const useKV  = getUseKV(state);

  const { modelName: i2iModel, clipName: i2iClip, vaeName: i2iVae } = resolveModels(state);
  patchModelLoader(prompt, "FK:165", i2iModel);
  patchClipLoader (prompt, "FK:155", i2iClip);
  set(prompt, "FK:153", "vae_name", i2iVae);
  set(prompt, "FK:166", "text", buildPromptText(state, "i2i"));
  set(prompt, "FKI2I:img", "image", state.i2iImage);

  let i2iModelSrc = "FK:165";
  if (useKV) {
    prompt["FK:KV"] = { class_type: "FluxKVCache", inputs: { model: ["FK:165", 0] }, _meta: { title: "Flux KV Cache" } };
    i2iModelSrc = "FK:KV";
  }
  const loraRef = applyLoraChain(prompt, state, i2iModelSrc, "FK:");
  set(prompt, "FK:169", "model", typeof loraRef === "string" ? [loraRef, 0] : loraRef);

  const isBase = (state.model || "").toLowerCase().includes("base");
  set(prompt, "FK:171", "seed",    state.seed ?? 0);
  set(prompt, "FK:171", "steps",   state.steps || 4);
  set(prompt, "FK:171", "cfg",     state.cfg !== undefined ? state.cfg : (isBase ? 5 : 1));
  set(prompt, "FK:171", "denoise", state.i2iDenoise ?? 0.75);
  set(prompt, "FK:171", "sampler_name", state.sampler   || "euler");
  set(prompt, "FK:171", "scheduler",    state.scheduler || "simple");

  patchSave(prompt, "FK:86", state);
  return prompt;
}

// ── Edit (dual image / reference) ────────────────────────────────────────────
export async function buildEditGraph(state) {
  if (!state.editImage1) throw new Error("No Image 1 uploaded for Edit mode.");
  const prompt = await loadWorkflow("edit");
  patchT2IBase(prompt, state, WF.sampler);
  set(prompt, WF.promptPos, "text", buildPromptText(state, "edit"));
  set(prompt, WF.promptNeg, "text", state.negativePrompt || "");
  set(prompt, WF.loadImage1, "image", state.editImage1);
  set(prompt, WF.sampler,   "denoise", 1);
  patchSave(prompt, WF.saveImage, state);

  const src = state.editSizeSource || "img1";
  // editRefImages[0] 가 있으면 Image2로 사용 (workflow는 최대 2개 이미지 지원)
  const img2 = state.editImage2 || state.editRefImages?.[0]?.filename || null;
  const hasImg2 = !!img2;

  if (src === "img1") {
    set(prompt, WF.vaeEnc1, "pixels", [WF.loadImage1, 0]);
  } else if (src === "img2" && hasImg2) {
    if (prompt[WF.getSize]) prompt[WF.getSize].inputs.image = [WF.loadImage2, 0];
    set(prompt, WF.vaeEnc1, "pixels", [WF.scaleImg1, 0]);
  } else {
    // manual size
    if (prompt[WF.latent]) {
      prompt[WF.latent].inputs.width  = state.width  || 1024;
      prompt[WF.latent].inputs.height = state.height || 1024;
    }
    set(prompt, WF.vaeEnc1, "pixels", [WF.scaleImg1, 0]);
  }

  if (hasImg2) {
    set(prompt, WF.loadImage2, "image", img2);
    set(prompt, WF.sampler, "positive", [WF.refPos2, 0]);
    set(prompt, WF.sampler, "negative", [WF.refNeg2, 0]);
  } else {
    [WF.loadImage2, WF.scaleImg2, WF.vaeEnc2, WF.refPos2, WF.refNeg2].forEach(id => delete prompt[id]);
    set(prompt, WF.sampler, "positive", [WF.refPos1, 0]);
    set(prompt, WF.sampler, "negative", [WF.refNeg1, 0]);
  }

  return prompt;
}

// ── Inpaint ───────────────────────────────────────────────────────────────────
export async function buildInpaintGraph(state) {
  if (!state.inpaintImage)     throw new Error("No source image for inpaint.");
  if (!state.inpaintMaskImage) throw new Error("No mask image — upload or draw a mask.");
  const prompt = await loadWorkflow("inpaint");

  const WFI = {
    model:"FKI:194", kv:"FKI:216", textEnc:"FKI:195", vae:"FKI:196",
    promptPos:"FKI:6", loadImg:"FKI:198", loadMask:"FKI:199",
    sampler:"FKI:163", save:"FKI:203",
  };

  const useKV  = getUseKV(state);
  const isBase = (state.model || "").toLowerCase().includes("base");

  const { modelName: inpModel, clipName: inpClip, vaeName: inpVae } = resolveModels(state);
  patchModelLoader(prompt, WFI.model,   inpModel);
  patchClipLoader (prompt, WFI.textEnc, inpClip);
  set(prompt, WFI.vae, "vae_name", inpVae);
  set(prompt, WFI.promptPos, "text",    buildPromptText(state, "inpaint"));
  set(prompt, WFI.loadImg,   "image",   state.inpaintImage);
  set(prompt, WFI.loadMask,  "image",   state.inpaintMaskImage);

  // 인페인트 워크플로우: KSampler가 KV 노드를 직접 참조하므로 삭제 시 재연결 필요
  const modelSrc = useKV ? WFI.kv : WFI.model;
  if (!useKV) {
    delete prompt[WFI.kv];
  }
  const loraRef    = applyLoraChain(prompt, state, modelSrc, "FKI:");
  // ModelSamplingAuraFlow가 있으면 거기에 연결, 없으면 KSampler에 직접 연결
  const samplingId = Object.keys(prompt).find(k => prompt[k].class_type === "ModelSamplingAuraFlow");
  const modelInput = typeof loraRef === "string" ? [loraRef, 0] : loraRef;
  if (samplingId) {
    set(prompt, samplingId, "model", modelInput);
  } else {
    set(prompt, WFI.sampler, "model", modelInput);
  }

  set(prompt, WFI.sampler, "seed",    state.seed ?? 0);
  set(prompt, WFI.sampler, "steps",   state.steps || 4);
  set(prompt, WFI.sampler, "cfg",     state.cfg !== undefined ? state.cfg : (isBase ? 5 : 1));
  set(prompt, WFI.sampler, "sampler_name", state.sampler   || "euler");
  set(prompt, WFI.sampler, "scheduler",    state.scheduler || "simple");
  set(prompt, WFI.sampler, "denoise",      state.inpaintDenoise ?? 0.85);

  patchSave(prompt, WFI.save, state);
  return prompt;
}

// ── Faceswap ──────────────────────────────────────────────────────────────────
export async function buildFaceswapGraph(state) {
  if (!state.faceswapTarget) throw new Error("No target image for faceswap.");
  if (!state.faceswapSource) throw new Error("No source face image.");
  const prompt = await loadWorkflow("faceswap");

  const WFF = {
    model:"FKF:225", lora:"FKF:226", textEnc:"FKF:223", vae:"FKF:235",
    target:"FKF:234", source:"FKF:236",
    sampling:"FKF:239", sampler:"FKF:228", save:"FKF:232",
  };

  const useKV  = getUseKV(state);
  const isBase = (state.model || "").toLowerCase().includes("base");
  // BFS LoRA는 state.bfsLora (별도 저장), 일반 state.loras 와 독립
  const bfsLora = state.bfsLora && state.bfsLora.name && state.bfsLora.name !== "none" && state.bfsLora.enabled !== false
    ? state.bfsLora : null;

  const { modelName: fsModel, clipName: fsClip, vaeName: fsVae } = resolveModels(state);
  patchModelLoader(prompt, WFF.model,   fsModel);
  patchClipLoader (prompt, WFF.textEnc, fsClip);
  set(prompt, WFF.vae, "vae_name", fsVae);
  set(prompt, WFF.target,  "image",     state.faceswapTarget);
  set(prompt, WFF.source,  "image",     state.faceswapSource);

  // KV → 전용 face LoRA (WFF.lora) → ModelSamplingAuraFlow
  const baseModelSrc = useKV
    ? (() => { prompt["FK:KV"] = { class_type:"FluxKVCache", inputs:{ model:[WFF.model,0] }, _meta:{title:"Flux KV Cache"} }; return "FK:KV"; })()
    : WFF.model;

  if (bfsLora) {
    set(prompt, WFF.lora, "lora_name", bfsLora.name);
    set(prompt, WFF.lora, "strength_model", bfsLora.strength ?? 1);
    prompt[WFF.lora].inputs.model = [baseModelSrc, 0];
    set(prompt, WFF.sampling, "model", [WFF.lora, 0]);
  } else {
    // no LoRA: remove dedicated face LoRA node, connect model directly
    delete prompt[WFF.lora];
    set(prompt, WFF.sampling, "model", [baseModelSrc, 0]);
  }

  const effectivePrompt = buildPromptText(state, "faceswap");
  if (effectivePrompt.trim()) set(prompt, "FKF:227", "text", effectivePrompt);

  set(prompt, WFF.sampler, "seed",    state.seed ?? 0);
  set(prompt, WFF.sampler, "steps",   state.steps || 4);
  set(prompt, WFF.sampler, "cfg",     state.cfg !== undefined ? state.cfg : (isBase ? 5 : 1));
  set(prompt, WFF.sampler, "sampler_name", state.sampler   || "euler");
  set(prompt, WFF.sampler, "scheduler",    state.scheduler || "simple");
  set(prompt, WFF.sampler, "denoise",      state.faceswapDenoise ?? 1.0);

  patchSave(prompt, WFF.save, state);
  return prompt;
}

// ── Outpaint ──────────────────────────────────────────────────────────────────
export async function buildOutpaintGraph(state) {
  if (!state.outpaintImage) throw new Error("No source image for outpaint.");
  const total = (state.outpaintUp||0)+(state.outpaintDown||0)+(state.outpaintLeft||0)+(state.outpaintRight||0);
  if (total <= 0) throw new Error("Set at least one expansion value > 0 px.");

  // Edit 워크플로우 기반: ImagePadKJ로 컬러 패딩 생성 후 FluxKontext 참조 체인에 전달
  // 생성 latent는 EmptyLatent(패딩 이미지 크기) — 마스크 불필요, 모델이 전체를 새로 생성
  const prompt = await loadWorkflow("edit");
  patchT2IBase(prompt, state, WF.sampler);

  // 아웃페인트 시스템 프롬프트 자동 주입 — 사용자는 장면 설명만 입력
  const padR = state.outpaintPadR ?? 0;
  const padG = state.outpaintPadG ?? 0;
  const padB = state.outpaintPadB ?? 0;
  const _padColor = `rgb(${padR}, ${padG}, ${padB})`;
  const _sysPrompt = `Extend the composition of this image. Replace all black or ${_padColor} areas with a logical continuation of the background and foreground. Ensure the transition is invisible and the new elements perfectly match the perspective and color palette of the original image. Scene description: `;
  set(prompt, WF.promptPos,  "text",  _sysPrompt + buildPromptText(state, "outpaint"));
  set(prompt, WF.promptNeg,  "text",  state.negativePrompt || "");
  set(prompt, WF.loadImage1, "image", state.outpaintImage);
  prompt["FKO:pad"] = { class_type:"ImagePadKJ", inputs:{
    image:         [WF.loadImage1, 0],
    left:          Math.max(0, state.outpaintLeft  || 0),
    top:           Math.max(0, state.outpaintUp    || 0),
    right:         Math.max(0, state.outpaintRight || 0),
    bottom:        Math.max(0, state.outpaintDown  || 0),
    extra_padding: 0,
    pad_mode:      "color",
    color:         `${padR}, ${padG}, ${padB}`,
  }};

  // 패딩된 이미지를 ImageScaleToTotalPixels(scaleImg1)에 전달
  set(prompt, WF.scaleImg1, "image", ["FKO:pad", 0]);

  // GetImageSize는 스케일된 패딩 이미지를 읽어야 EmptyLatent 크기 == VAEEncode 크기
  set(prompt, WF.getSize, "image", [WF.scaleImg1, 0]);
  // sampler.latent_image는 워크플로우 기본값(EmptyLatent, FK:170) 유지 — 마스크 없음

  // 단일 이미지 컨디셔닝 경로 (이미지2 관련 노드 제거)
  [WF.loadImage2, WF.scaleImg2, WF.vaeEnc2, WF.refPos2, WF.refNeg2].forEach(id => delete prompt[id]);
  set(prompt, WF.sampler, "positive", [WF.refPos1, 0]);
  set(prompt, WF.sampler, "negative", [WF.refNeg1, 0]);

  set(prompt, WF.sampler, "denoise", 1.0);
  patchSave(prompt, WF.saveImage, state);
  return prompt;
}

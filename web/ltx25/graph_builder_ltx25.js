// graph_builder_ltx25.js — LTX 2.5 ONE STUDIO (TJ) workflow graph builder
//
// Rebuilds the reference workflow's 37-node subgraph as a compact API graph.
// The helper nodes it used (ResolutionSelector / ComfyMathExpression / TJ_MultiSwitch ×5)
// are gone: their values are computed here in JS, so the submitted graph is ~20 nodes and
// every branch is an explicit `if` instead of a runtime switch.
//
// Optional third-party nodes are gated on `avail` (from /ltx25_one/node_availability):
// a missing pack disables that one feature rather than failing the whole prompt.
import { SUBFOLDER, FPS, DEFAULT_FRAMES, emptyTimeline, resolveResolution, computeRtxTarget } from "./core_ltx25.js";

// Builds the RTXVideoSuperResolution node (+ an optional ImageCrop node ahead of it for
// the "wh" size mode's forced crop, per computeRtxTarget) and returns the final image
// link plus the {method, ...} descriptor buildPreset()/gallery cards already display.
function buildRtxNode(g, ids, images, state, srcW, srcH) {
  const t = computeRtxTarget(state, srcW, srcH);
  if (t.crop) {
    g[ids.crop] = { class_type: "ImageCrop", inputs: {
      image: images, width: t.crop.width, height: t.crop.height, x: t.crop.x, y: t.crop.y,
    }};
    images = [ids.crop, 0];
  }
  g[ids.rtx] = t.resizeType === "scale by multiplier"
    ? { class_type: "RTXVideoSuperResolution", inputs: {
        images, resize_type: "scale by multiplier", "resize_type.scale": t.scale, quality: state.rtxQuality || "ULTRA",
      }}
    : { class_type: "RTXVideoSuperResolution", inputs: {
        images, resize_type: "target dimensions",
        "resize_type.width": t.width, "resize_type.height": t.height, quality: state.rtxQuality || "ULTRA",
      }};
  const upscaleUsed = t.resizeType === "scale by multiplier"
    ? { method: "rtx", scale: t.scale, quality: state.rtxQuality || "ULTRA" }
    : { method: "rtx", width: t.width, height: t.height, quality: state.rtxQuality || "ULTRA" };
  return { images: [ids.rtx, 0], upscaleUsed };
}

const N = {
  unet:   "MM:unet",
  clip:   "MM:clip",
  vaeV:   "MM:vae_video",
  vaeA:   "MM:vae_audio",
  sage:   "MM:sage",
  memSage:"MM:mem_sage",
  ckAttn: "MM:ck_attn",
  solSag: "MM:sol_sag",
  fusedMod: "MM:fused_mod",
  slaTurboLora: "MM:sla_turbo_lora",
  pdd:    "MM:pdd_acc",
  sla:    "MM:sla",
  freeClipVram: "MM:free_clip_vram",
  torch:  "MM:torch",
  shift:  "MM:sigma_shift",
  cache:  "MM:cache",
  fbcache:"MM:fbcache",
  sol:     "MM:solattn",
  h3mem:   "MM:h3_mem",
  h3sparse:"MM:h3_sparse",
  spectrum:"MM:spectrum",
  turbo:   "MM:turbo_lora",
  preview:"MM:preview",
  cond:   "MM:cond",
  noise:  "MM:noise",
  sampSel:"MM:sampler_sel",
  sched:  "MM:scheduler",
  guider: "MM:guider",
  sampler:"MM:sampler",
  decode: "MM:decode",
  decodeA:"MM:decode_audio",
  upModel:"MM:upscale_model",
  upApply:"MM:upscale",
  rtx:    "MM:rtx",
  rtxCrop:"MM:rtx_crop",
  fvsrPipe: "MM:flashvsr_pipe",
  fvsr:     "MM:flashvsr",
  deblurR:"MM:deblur",
  video:  "MM:video",
  save:   "MM:save_video",
  videoRaw: "MM:video_raw",
  saveRaw:  "MM:save_video_raw",
  lastF:  "MM:last_frame",
  saveLF: "MM:save_last_frame",
  tailF:  "MM:tail_frames",
  tailPrev: "MM:tail_preview",
  loadFirst: "MM:load_first",
  loadLast:  "MM:load_last",
  ref:      (i) => `MM:ref_${i}`,
  refResize:(i) => `MM:ref_resize_${i}`,
  loadFirstResize: "MM:load_first_resize",
  loadLastResize:  "MM:load_last_resize",
  refVid:   (i) => `MM:refvid_${i}`,
  refVidResize: (i) => `MM:refvid_resize_${i}`,
  refAud:   (i) => `MM:refaud_${i}`,
  refAudTrim: (i) => `MM:refaud_trim_${i}`,
  audioLock:  "MM:audio_lock",
  lockAud:    "MM:lock_audio",
  lockAudTrim:"MM:lock_audio_trim",
  chkLoad:    "MM:h3_chk_load",
  continuation: "MM:h3_continuation",
  chkSave:    "MM:h3_chk_save",
  hrSplit:    "MM:hr_split_sigmas",
  hrSep:      "MM:hr_separate",
  hrUp:       "MM:hr_latent_upscale",
  hrCat:      "MM:hr_concat",
  hrLock:     "MM:hr_audio_lock",
  hrShift:    "MM:hr_sigma_shift",
  hrPdd:      "MM:hr_turbo_lora",
  hrMem:      "MM:hr_h3_mem",
  hrSparse:   "MM:hr_block_sparse",
  hrGuider:   "MM:hr_guider",
  hrSampler:  "MM:hr_sampler",
  hrCond:     "MM:hr_cond",
  hrLora:     (i) => `MM:hr_lora${i}`,
  // LTX 2.5
  dLora: "LT:distilled_lora", ltxLora: (i) => `LT:lora${i}`, chunkFF: "LT:chunk_ff", dir: "LT:director",
  dirZero: "LT:zero_neg", freeClipVramNeg: "LT:free_clip_vram_neg",
  hrUpModel: "LT:up_model", hrStage1Guide: "LT:guide1", hrStage1Cat: "LT:concat1", hrCrop1: "LT:crop1",
  hrStage2Guide: "LT:guide2", hrSigmas: "LT:sigmas2", hrSep2: "LT:separate2", hrCrop2: "LT:crop2",
};

// How many trailing frames to keep as chain candidates. Enough to step over a short
// fade-out without reaching back into a materially different moment.
export const TAIL_CANDIDATES = 8;

const has = (avail, name) => !!(avail && avail[name]);

// Writes the final video-save step: VHS_VideoCombine's nvenc_h264-mp4 format (real
// NVIDIA GPU/NVENC hardware encoding) when the pack is installed, falling back to
// ComfyUI core's CreateVideo -> SaveVideo pair (CPU software encoding via PyAV/libx264)
// otherwise — same "missing pack disables the feature, not the whole prompt" policy as
// every other optional node here. VHS reports its saved file under a `gifs` key; both
// ui_gallery_ltx25.js and one_node_minimax_h3.js already read `.images || .gifs` for
// every save node, so nothing downstream needs to change either way.
function saveVideoNode(g, ids, images, audio, fps, filenamePrefix, avail, preview = false) {
  if (has(avail, "VHS_VideoCombine")) {
    g[ids.save] = { class_type: "VHS_VideoCombine", inputs: {
      images, audio, frame_rate: fps, loop_count: 0,
      filename_prefix: filenamePrefix, format: "video/nvenc_h264-mp4",
      pingpong: false, save_output: !preview,
    }};
  } else {
    g[ids.video] = { class_type: "CreateVideo", inputs: { images, fps, audio } };
    g[ids.save] = { class_type: "SaveVideo", inputs: {
      video: [ids.video, 0], filename_prefix: filenamePrefix, format: "auto", codec: "auto",
    }};
  }
}

// FlashVSR VSR (lihaoyun6/ComfyUI-FlashVSR-Ultra-Fast) — shared by the inline per-clip
// upscale (buildClipGraph) and the gallery's standalone post-process (buildUpscaleGraph).
// Only 8 fields are exposed in the UI (model/mode/scale/color fix/tile size/tile
// overlap/seed/seed control); everything else below is fixed at the values from the
// shipped API workflow ([TJ]FlashVSR-Upscale.json) and never surfaced.
function buildFlashVSR(g, pipeId, nodeId, p, images) {
  g[pipeId] = { class_type: "FlashVSRInitPipe", inputs: {
    model: p.model || "FlashVSR-v1.1",
    mode: p.mode || "tiny",
    alt_vae: "none",
    force_offload: true,
    precision: "bf16",
    device: "cuda:0",
    attention_mode: "sparse_sage_attention",
  }};
  g[nodeId] = { class_type: "FlashVSRNodeAdv", inputs: {
    pipe: [pipeId, 0],
    frames: images,
    // FlashVSRNodeAdv's own `scale` is an INT combo, 2-4 only (no 1x, no fractional).
    scale: Math.min(4, Math.max(2, Math.round(p.scale ?? 2))),
    color_fix: p.colorFix !== false,
    tiled_vae: true,
    tiled_dit: true,
    tile_size: p.tileSize ?? 384,
    tile_overlap: p.tileOverlap ?? 32,
    unload_dit: false,
    sparse_ratio: 2,
    kv_ratio: 3,
    local_range: 11,
    seed: p.seed ?? 42,
  }};
}
/** Normalizes a flashvsr params object (from state.* or an opts.flashvsr passthrough)
 *  into the shape saved as clip metadata's upscale.* field. */
export function flashvsrUsed(p) {
  return {
    method: "flashvsr",
    model: p.model || "FlashVSR-v1.1",
    mode: p.mode || "tiny",
    scale: p.scale ?? 2,
    colorFix: p.colorFix !== false,
    tileSize: p.tileSize ?? 384,
    tileOverlap: p.tileOverlap ?? 32,
    seed: p.seed ?? 42,
  };
}
/** state.flashvsr* -> the { model, mode, scale, colorFix, tileSize, tileOverlap, seed }
 *  shape buildFlashVSR/flashvsrUsed take, so buildClipGraph's inline path and the
 *  gallery's own opts.flashvsr passthrough share one params shape. */
function flashvsrParamsFromState(state) {
  return {
    model: state.flashvsrModel, mode: state.flashvsrMode, scale: state.flashvsrScale,
    colorFix: state.flashvsrColorFix, tileSize: state.flashvsrTileSize,
    tileOverlap: state.flashvsrTileOverlap, seed: state.flashvsrSeed,
  };
}

/**
 * Live sampling preview. ModelPreviewOverrideKJ wraps the model and streams decoded frames
 * to the frontend over the `kj_preview_override` socket event.
 *
 * The event is tagged with the KJ node's OWN id in the submitted graph (it reads
 * `hidden.unique_id`), not with anything we hand it — so we give that node a key derived
 * from this ONE STUDIO node's id and have the UI listen for exactly that key. Two MiniMax
 * nodes on the same canvas then never pick up each other's frames.
 */
// NOTE: no colon in this key. ComfyUI treats `parent:child` node ids as dynamic-expansion
// paths, so a colon-suffixed id comes back truncated in `hidden.unique_id` (MM:preview:7 →
// MM:preview) and the frames would land on the wrong node.
export function previewNodeKey(nodeId) { return `LTX25_preview_${nodeId}`; }

function applyPreview(g, state, avail, modelLink, nodeId) {
  if (!(state.ltxPreviewEnabled ?? true) || !has(avail, "ModelPreviewOverrideKJ") || nodeId == null) return modelLink;
  const key = previewNodeKey(nodeId);
  const inputs = {
    model: modelLink,
    max_resolution: state.ltxPreviewMaxRes ?? 512,
    jpeg_quality:   state.ltxPreviewQuality ?? 85,
    suppress_default_preview: true,
    preview_frames: Math.max(1, state.ltxPreviewFrames ?? 8),
    preview_fps:    state.ltxPreviewFps ?? 12,
  };
  if (state.ltxTinyVae && state.ltxTinyVae !== "none") inputs.tiny_vae = state.ltxTinyVae;
  g[key] = { class_type: "ModelPreviewOverrideKJ", inputs, _meta: { title: `LTX25 preview #${nodeId}` } };
  return [key, 0];
}

/**
 * Build one clip's graph.
 *
 * @param state      UI state
 * @param avail      node availability map
 * @param opts       { nodeId, promptText, seed, firstFrame, lastFrame, refImages,
 *                     clipIndex, filenamePrefix, saveLastFrame,
 *                     prevCheckpointName, checkpointName }
 */
export function buildClipGraph(state, avail, opts = {}) {
  const {
    nodeId, promptText, seed, clipIndex = 0, saveLastFrame = true, saveTailPreviews = true, dir = null,
    firstFrame = null, lastFrame = null,
  } = opts;

  const frames = state.clipFrames || DEFAULT_FRAMES;
  // Two stages: stage 1 at half the final size, a 2x latent upscale, then a short refine.
  const { width: outW, height: outH } = resolveResolution(state.aspect, state.megapixels);
  const hires = { start: { width: outW / 2, height: outH / 2 }, scale: 2 };
  const folder = (state.saveSubfolder || SUBFOLDER).replace(/\\/g, "/");
  const stem = state.filenamePrefix || "LTX25";
  const isGguf = (s) => String(s || "").toLowerCase().endsWith(".gguf");

  const g = {};

  // ── loaders ────────────────────────────────────────────────
  g[N.unet] = isGguf(state.ltxUnet)
    ? { class_type: "UnetLoaderGGUF", inputs: { unet_name: state.ltxUnet } }
    : { class_type: "UNETLoader", inputs: { unet_name: state.ltxUnet, weight_dtype: "default" } };
  let model = [N.unet, 0];
  g[N.clip] = isGguf(state.ltxClip)
    ? { class_type: "TJ_LTX25ClipLoaderGGUF", inputs: { clip_name: state.ltxClip } }
    : { class_type: "CLIPLoader", inputs: { clip_name: state.ltxClip, type: "ltxv", device: "default" } };
  g[N.vaeV] = { class_type: "VAELoader", inputs: { vae_name: state.ltxVaeVideo } };
  g[N.vaeA] = { class_type: "VAELoader", inputs: { vae_name: state.ltxVaeAudio } };
  g[N.hrUpModel] = { class_type: "LatentUpscaleModelLoader", inputs: { model_name: state.ltxLatentUpscaler } };

  // The distilled LoRA belongs to a non-distilled model only (Settings -> LTX Model); the user's own
  // LoRAs follow it.
  const addLora = (id, name, strength) => {
    g[id] = { class_type: "LoraLoaderModelOnly", inputs: { model, lora_name: name, strength_model: strength } };
    model = [id, 0];
  };
  if (state.distilledLoraOn && state.distilledLora && state.distilledLora !== "none") {
    addLora(N.dLora, state.distilledLora, parseFloat(state.distilledLoraStrength ?? 0.5));
  }
  (state.loras || []).forEach((l, i) => {
    const s = parseFloat(l?.strength ?? 1);
    if (l?.name && l.name !== "none" && l.enabled !== false && s > 0) addLora(N.ltxLora(i), l.name, s);
  });

  // ── model patches ──────────────────────────────────────────
  if (state.useMemEffSage !== false && has(avail, "LTX2MemoryEfficientSageAttentionPatch")) {
    g[N.memSage] = { class_type: "LTX2MemoryEfficientSageAttentionPatch", inputs: { model, triton_kernels: true } };
    model = [N.memSage, 0];
  }
  if (has(avail, "LTXVChunkFeedForward")) {
    g[N.chunkFF] = { class_type: "LTXVChunkFeedForward", inputs: { model, chunks: 2, dim_threshold: 4096 } };
    model = [N.chunkFF, 0];
  }
  model = applyPreview(g, state, avail, model, nodeId);

  // ── Director: prompt, empty latents, guides ────────────────
  const fullPrompt = String(promptText || "").trim();
  const secs = frames / FPS;
  // The clip's own segment timeline (edited in Prompt Edit). One made for another clip length is
  // refreshed by the caller before the graph is built.
  const tl = withAnchorFrames(dir && dir.frames === frames ? dir.widgets : {}, frames, firstFrame, lastFrame);
  g[N.dir] = { class_type: "LTXDirectorTJ25", inputs: {
    model, clip: [N.clip, 0], audio_vae: [N.vaeA, 0], vae: [N.vaeV, 0],
    start_second: 0, end_second: secs, duration_seconds: secs, start_frame: 0, end_frame: frames, duration_frames: frames,
    timeline_data: directorTimeline(fullPrompt, frames, tl.timeline_data),
    local_prompts: tl.local_prompts ?? "", segment_lengths: tl.segment_lengths ?? "", epsilon: tl.epsilon ?? 0.001,
    guide_strength: tl.guide_strength ?? "",
    global_prompt: fullPrompt, use_custom_audio: tl.use_custom_audio ?? false, use_custom_motion: tl.use_custom_motion ?? false,
    inpaint_audio: tl.inpaint_audio ?? true, frame_rate: FPS,
    display_mode: "seconds", custom_width: outW, custom_height: outH, resize_method: "stretch to fit",
    divisible_by: 32, img_compression: 18, override_audio: tl.override_audio ?? false, reference_strength: 1.0,
  }};
  g[N.dirZero] = { class_type: "ConditioningZeroOut", inputs: { conditioning: [N.dir, 2] } };
  g[N.cond] = { class_type: "LTXVConditioning", inputs: { positive: [N.dir, 1], negative: [N.dirZero, 0], frame_rate: [N.dir, 7] } };
  const guide = (positive, negative, latent, scale) => ({ class_type: "LTXDirectorGuideTJ25", inputs: {
    positive, negative, vae: [N.vaeV, 0], latent, guide_data: [N.dir, 5], motion_guide_data: [N.dir, 6], model: [N.dir, 0],
    ic_lora_name: "None", ic_lora_strength: 1, scale_by: scale, upscale_method: "bicubic", image_attention_strength: 1,
    crop: "center", auto_snap_ic_grid: true, use_tiled_encode: false, tile_size: 256, tile_overlap: 64,
    retake_mode: false, msr_strength: 0,
  }});
  // The text encoder is done once the conditioning exists - free it before the diffusion model samples.
  let condPos = [N.cond, 0], condNeg = [N.cond, 1];
  if (has(avail, "TJ_FreeTextEncoderVRAM")) {
    g[N.freeClipVram] = { class_type: "TJ_FreeTextEncoderVRAM", inputs: { clip: [N.clip, 0], trigger: condPos } };
    g[N.freeClipVramNeg] = { class_type: "TJ_FreeTextEncoderVRAM", inputs: { clip: [N.clip, 0], trigger: condNeg } };
    condPos = [N.freeClipVram, 0]; condNeg = [N.freeClipVramNeg, 0];
  }

  // ── stage 1: half size ─────────────────────────────────────
  const cfg = state.ltxCfg ?? 1;
  const steps = Math.max(1, Math.round(state.ltxGenSteps ?? 12));
  const samplerUsed = state.ltxGenSampler || "euler_ancestral";
  g[N.hrStage1Guide] = guide(condPos, condNeg, [N.dir, 3], 0.5);
  g[N.hrStage1Cat] = { class_type: "LTXVConcatAVLatent", inputs: { video_latent: [N.hrStage1Guide, 2], audio_latent: [N.dir, 4] } };
  g[N.guider] = { class_type: "CFGGuider", inputs: { model: [N.hrStage1Guide, 3], positive: [N.hrStage1Guide, 0], negative: [N.hrStage1Guide, 1], cfg } };
  g[N.sched] = { class_type: "BasicScheduler", inputs: {
    model: [N.hrStage1Guide, 3], scheduler: state.ltxGenScheduler || "linear_quadratic", steps, denoise: 1 } };
  g[N.noise] = { class_type: "RandomNoise", inputs: { noise_seed: seed ?? 0 } };
  g[N.sampSel] = { class_type: "KSamplerSelect", inputs: { sampler_name: samplerUsed } };
  g[N.sampler] = { class_type: "SamplerCustomAdvanced", inputs: {
    noise: [N.noise, 0], guider: [N.guider, 0], sampler: [N.sampSel, 0], sigmas: [N.sched, 0], latent_image: [N.hrStage1Cat, 0] } };
  g[N.hrSep] = { class_type: "LTXVSeparateAVLatent", inputs: { av_latent: [N.sampler, 0] } };
  g[N.hrCrop1] = { class_type: "LTXDirectorCropGuidesTJ25", inputs: { positive: [N.hrStage1Guide, 0], negative: [N.hrStage1Guide, 1], latent: [N.hrSep, 0] } };

  // ── stage 2: 2x latent upscale, short refine ───────────────
  g[N.hrUp] = { class_type: "LTXVLatentUpsampler", inputs: { samples: [N.hrCrop1, 2], upscale_model: [N.hrUpModel, 0], vae: [N.vaeV, 0] } };
  g[N.hrStage2Guide] = guide([N.dir, 1], [N.dir, 2], [N.hrUp, 0], 1);
  g[N.hrCat] = { class_type: "LTXVConcatAVLatent", inputs: { video_latent: [N.hrStage2Guide, 2], audio_latent: [N.hrSep, 1] } };
  g[N.hrGuider] = { class_type: "CFGGuider", inputs: { model: [N.hrStage2Guide, 3], positive: [N.hrStage2Guide, 0], negative: [N.hrStage2Guide, 1], cfg } };
  g[N.hrSigmas] = { class_type: "ManualSigmas", inputs: { sigmas: state.ltxStage2Sigmas || "0.85, 0.7250, 0.4219, 0.0" } };
  g[N.hrSampler] = { class_type: "SamplerCustomAdvanced", inputs: {
    noise: [N.noise, 0], guider: [N.hrGuider, 0], sampler: [N.sampSel, 0], sigmas: [N.hrSigmas, 0], latent_image: [N.hrCat, 0] } };
  g[N.hrSep2] = { class_type: "LTXVSeparateAVLatent", inputs: { av_latent: [N.hrSampler, 0] } };
  g[N.hrCrop2] = { class_type: "LTXDirectorCropGuidesTJ25", inputs: { positive: [N.hrStage2Guide, 0], negative: [N.hrStage2Guide, 1], latent: [N.hrSep2, 0] } };

  // ── decode ─────────────────────────────────────────────────
  g[N.decode]  = { class_type: "VAEDecode", inputs: { samples: [N.hrCrop2, 2], vae: [N.vaeV, 0] } };
  g[N.decodeA] = { class_type: "LTXVAudioVAEDecode", inputs: { samples: [N.hrSep, 1], audio_vae: [N.vaeA, 0] } };
  const lockAudio = null;

  let images = [N.decode, 0];
  // The decoded frames as they are, before any deblur/upscale — kept so the run loop can
  // also save the un-processed clip when the panel asks for it.
  const preProcImages = [N.decode, 0];
  const up = state.upscaleMode || "none";
  // What the frame pipeline actually did, for the clip's sidecar — resolveResolution()
  // below only knows the pre-decode size, so the gallery needs these to badge an
  // inline-deblurred / upscaled clip and to show its real dimensions.
  let deblurUsed = null;
  let upscaleUsed = null;
  // Deblur runs on the decoded frames before any upscale, at their own resolution. It is
  // independent of the upscale setting: Upscale = None still deblurs.
  if (state.deblurStrength && state.deblurStrength !== "none" && has(avail, "TJ_RTXDeblur")) {
    g[N.deblurR] = { class_type: "TJ_RTXDeblur", inputs: {
      images, strength: state.deblurStrength,
    }};
    images = [N.deblurR, 0];
    deblurUsed = state.deblurStrength;
  }

  if (up === "model" && state.upscaleModel && state.upscaleModel !== "none") {
    g[N.upModel] = { class_type: "UpscaleModelLoader", inputs: { model_name: state.upscaleModel } };
    g[N.upApply] = { class_type: "ImageUpscaleWithModel", inputs: {
      upscale_model: [N.upModel, 0], image: images,
    }};
    images = [N.upApply, 0];
    upscaleUsed = { method: "model", model: state.upscaleModel };
  } else if (up === "rtx" && has(avail, "RTXVideoSuperResolution")) {
    const r = buildRtxNode(g, { crop: N.rtxCrop, rtx: N.rtx }, images, state, outW, outH);
    images = r.images; upscaleUsed = r.upscaleUsed;
  } else if (up === "flashvsr" && has(avail, "FlashVSRNodeAdv")) {
    const fvsrParams = flashvsrParamsFromState(state);
    buildFlashVSR(g, N.fvsrPipe, N.fvsr, fvsrParams, images);
    images = [N.fvsr, 0];
    upscaleUsed = flashvsrUsed(fvsrParams);
  }

  // ── outputs ────────────────────────────────────────────────────────────────
  const clipTag = String(clipIndex + 1).padStart(3, "0");
  // The lock's own audio output passes the source through untouched. Decoding it back
  // out of the latent instead would cost a neural-codec round trip, which is audible
  // even though the lock held — so that path is only for when the lock is off.
  // When the pipeline happens to be exactly one of the named combinations, put its number
  // in the filename. The metadata sidecar already records it, but a benchmark produces
  // dozens of clips that differ only in settings, and reading them back one sidecar at a
  // time to find out which is which is the slow way. A run that matches nothing is left
  // untagged rather than labelled something misleading.
  saveVideoNode(g, { video: N.video, save: N.save }, images,
    lockAudio ? [N.audioLock, 1] : [N.decodeA, 0], FPS,
    `${folder}/${stem}_clip${clipTag}`, avail);

  // "Save the un-processed clip too" — a second file straight off the decode, before
  // deblur/upscale touched it. Only worth writing when something actually ran; the run
  // loop saves its sidecar and drops it into the gallery, but it never joins the stitch
  // or the last-frame chain — the processed clip stays the real one.
  const saveRawToo = !!state.saveUnprocessed && !!(deblurUsed || upscaleUsed);
  if (saveRawToo) {
    saveVideoNode(g, { video: N.videoRaw, save: N.saveRaw }, preProcImages,
      lockAudio ? [N.audioLock, 1] : [N.decodeA, 0], FPS,
      `${folder}/${stem}_clip${clipTag}_raw`, avail);
  }

  // Final frame is saved as a PNG so the next clip can continue from it (and so the node
  // has an IMAGE to hand downstream).
  if (saveLastFrame) {
    g[N.lastF] = { class_type: "ImageFromBatch", inputs: {
      image: images, batch_index: Math.max(0, frames - 1), length: 1,
    }};
    g[N.saveLF] = { class_type: "SaveImage", inputs: {
      images: [N.lastF, 0],
      filename_prefix: `${folder}/frames/${stem}_clip${clipTag}_last`,
    }};
    // A clip sometimes fades to black over its final frames, and handing that to the
    // next clip starts it from an empty screen. Keep a short tail as temp previews so
    // the relay can step back to the last frame that actually has a picture in it.
    // Only Last Frame Chain reads them, so the caller switches them off otherwise
    // rather than writing eight temp PNGs per clip for nothing.
    if (saveTailPreviews) {
      const tail = Math.min(TAIL_CANDIDATES, frames);
      g[N.tailF] = { class_type: "ImageFromBatch", inputs: {
        image: images, batch_index: Math.max(0, frames - tail), length: tail,
      }};
      g[N.tailPrev] = { class_type: "PreviewImage", inputs: { images: [N.tailF, 0] } };
    }
  }

  return { graph: g, meta: {
    width: outW, height: outH, frames, steps, seed,
    hires: { startW: hires.start.width, startH: hires.start.height, scale: hires.scale },
    samplerUsed,
    // null when the pipeline didn't run it; the save path re-probes the output only when
    // upscaleUsed is set (deblur alone never changes the size).
    deblur: deblurUsed,
    upscale: upscaleUsed,
    videoNode: N.save, lastFrameNode: N.saveLF,
    rawVideoNode: saveRawToo ? N.saveRaw : null,
  } };
}

const ANCHOR_LEN = 24;

/**
 * A first / last frame given to the clip (the panel's First/Last images, a library asset, or the previous
 * clip's last frame when Continuity chains) joins the clip's timeline as an image segment - unless the
 * timeline already pins an image there. The Director reads guide strengths in segment order, so a new
 * segment gets the default strength in the same place.
 */
function withAnchorFrames(widgets, frames, firstFrame, lastFrame) {
  if (!firstFrame && !lastFrame) return widgets;
  let tl;
  try { tl = JSON.parse(widgets.timeline_data || "{}"); } catch { tl = {}; }
  if (!tl || typeof tl !== "object") tl = {};
  const segs = Array.isArray(tl.segments) ? tl.segments.slice() : [];
  const isImg = (s) => (s.type || "image") === "image" || s.type === "video";
  const hasFirst = segs.some(s => isImg(s) && !s.isEndFrame && (s.start || 0) <= 0 && (s.imageFile || s.imageB64));
  const hasLast = segs.some(s => isImg(s) && s.isEndFrame && (s.imageFile || s.imageB64));
  const add = (file, key, last) => ({
    id: `tj-${key}-${clipKey++}`, start: last ? Math.max(0, frames - ANCHOR_LEN) : 0, length: ANCHOR_LEN, prompt: "",
    type: "image", isAnchor: false, imageFile: file, imageB64: "", isEndFrame: last,
  });
  const strengths = String(widgets.guide_strength || "").split(",").map(x => x.trim()).filter(Boolean);
  const order = () => segs.filter(s => isImg(s) && (s.imageFile || s.imageB64)).sort((a, b) => (a.start || 0) - (b.start || 0));
  const insertStrength = (seg) => {
    if (!strengths.length) return;
    const at = order().indexOf(seg);
    strengths.splice(Math.max(0, at), 0, "1.00");
  };
  if (firstFrame && !hasFirst) { const s = add(firstFrame, "first", false); segs.push(s); insertStrength(s); }
  if (lastFrame && !hasLast) { const s = add(lastFrame, "last", true); segs.push(s); insertStrength(s); }
  tl.segments = segs;
  return { ...widgets, timeline_data: JSON.stringify(tl), guide_strength: strengths.join(",") };
}
let clipKey = 0;

/** The Director's timeline JSON for a clip: its own segments when it has them, else just the prompt. */
function directorTimeline(prompt, frames, saved) {
  let tl = null;
  try { tl = saved ? JSON.parse(saved) : null; } catch { tl = null; }
  return JSON.stringify(tl && typeof tl === "object" ? { ...tl, global_prompt: prompt } : emptyTimeline(prompt, frames));
}

export const NODE_IDS = N;

// ── LTX 2.5 Upscale mode ─────────────────────────────────────────────────────
// A standalone 2x latent-upscale + light refine pass over a finished/uploaded clip.
// Nothing about an H3 render is involved — its own model set (Settings → LTX 2.5 Upscale),
// its own euler_ancestral / BasicScheduler(steps 3, denoise 0.15) refine, its own LTX
// video+audio VAEs. The source video is read with VHS_LoadVideo (audio passes straight
// through), its first frame anchors LTXVImgToVideoInplace so colour/identity don't drift.
// Built from the verified MiniMaxH3-LTX-2-5-Upscale.json (dead nodes dropped).
const L = {
  load: "LX:load", unet: "LX:unet", clip: "LX:clip", vaeV: "LX:vae_v", vaeA: "LX:vae_a",
  lora: (i) => `LX:lora${i}`,
  upmodel: "LX:up_model", ckAttn: "LX:ck_attn", sol: "LX:sol", preview: "LX:preview",
  txtPos: "LX:txt_pos", txtNeg: "LX:txt_neg", cond: "LX:cond", freePos: "LX:free_pos",
  freeNeg: "LX:free_neg", guider: "LX:guider", enc: "LX:vae_encode", upsamp: "LX:upsampler",
  firstF: "LX:first_frame", i2v: "LX:i2v_inplace", audEnc: "LX:aud_encode", concat: "LX:concat",
  noise: "LX:noise", sampSel: "LX:sampler_sel", sched: "LX:scheduler", sampler: "LX:sampler",
  sep: "LX:separate", decV: "LX:decode_v", decA: "LX:decode_a", deblur: "LX:deblur",
  upApply: "LX:up_apply", upLoad: "LX:up_load", rtx: "LX:rtx", rtxCrop: "LX:rtx_crop",
  video: "LX:video", save: "LX:save",
};

/**
 * @param state  UI snapshot
 * @param avail  node availability map
 * @param opts   { nodeId, sourceFile, fps }  sourceFile = filename in ComfyUI's input/
 */
export function buildLtxUpscaleGraph(state, avail, opts = {}) {
  const { nodeId, sourceFile, fps = FPS, window = null, saveSuffix = "", anchorImage = null } = opts;
  // window = { skip, cap } — one segment of the source when the clip is split for VRAM.
  if (!sourceFile) throw new Error("LTX Upscale: pick a source clip (gallery or upload).");
  const need = { ltxUnet: "LTX unet", ltxLatentUpscaler: "latent upscaler", ltxClip: "text encoder",
                 ltxVaeVideo: "video VAE", ltxVaeAudio: "audio VAE" };
  const missing = Object.keys(need).filter(k => !state[k] || state[k] === "none").map(k => need[k]);
  if (missing.length) throw new Error(`LTX Upscale: set these in ⚙ Settings → LTX 2.5 Upscale — ${missing.join(", ")}`);

  const g = {};
  const folder = (state.saveSubfolder || SUBFOLDER).replace(/\\/g, "/");
  const stem = state.filenamePrefix || "MMH3";
  const isGguf = (s) => String(s || "").toLowerCase().endsWith(".gguf");

  // ── source ─────────────────────────────────────────────────────────────────
  g[L.load] = { class_type: "VHS_LoadVideo", inputs: {
    video: sourceFile, force_rate: 0, custom_width: 0, custom_height: 0,
    frame_load_cap: window ? Math.max(1, window.cap | 0) : 0,
    skip_first_frames: window ? Math.max(0, window.skip | 0) : 0,
    select_every_nth: 1, format: "AnimateDiff",
  }};
  // IMAGE = [L.load, 0], frame_count = [L.load, 1], audio = [L.load, 2]

  // ── loaders ────────────────────────────────────────────────────────────────
  g[L.unet] = isGguf(state.ltxUnet)
    ? { class_type: "UnetLoaderGGUF", inputs: { unet_name: state.ltxUnet } }
    : { class_type: "UNETLoader", inputs: { unet_name: state.ltxUnet, weight_dtype: "default" } };
  let model = [L.unet, 0];

  g[L.clip] = isGguf(state.ltxClip)
    ? { class_type: "TJ_LTX25ClipLoaderGGUF", inputs: { clip_name: state.ltxClip } }
    : { class_type: "CLIPLoader", inputs: { clip_name: state.ltxClip, type: "ltxv", device: "default" } };
  const clip = [L.clip, 0];

  g[L.vaeV] = { class_type: "VAELoader", inputs: { vae_name: state.ltxVaeVideo } };
  g[L.vaeA] = { class_type: "VAELoader", inputs: { vae_name: state.ltxVaeAudio } };
  const vaeV = [L.vaeV, 0], vaeA = [L.vaeA, 0];

  g[L.upmodel] = { class_type: "LatentUpscaleModelLoader", inputs: { model_name: state.ltxLatentUpscaler } };

  // ── LTX LoRA chain (own list — a different model from H3, so never state.loras) ──
  (state.ltxLoras || []).forEach((lora, i) => {
    if (!lora?.name || lora.name === "none" || lora.enabled === false) return;
    const s = parseFloat(lora.strength ?? 1.0);
    if (!(s > 0)) return;
    g[L.lora(i)] = { class_type: "LoraLoaderModelOnly", inputs: { model, lora_name: lora.name, strength_model: s } };
    model = [L.lora(i), 0];
  });

  // ── model patches (verified combo: comfy-kitchen attention → Sol-Attn → preview) ──
  if (has(avail, "ModelAttentionBackend")) {
    g[L.ckAttn] = { class_type: "ModelAttentionBackend", inputs: { model, attention: "comfy kitchen attention" } };
    model = [L.ckAttn, 0];
  }
  if (has(avail, "SolAttnPatch")) {
    g[L.sol] = { class_type: "SolAttnPatch", inputs: {
      model, tau: 1.3, start_percent: 0.2, end_percent: 0.9, min_tokens: 4096,
      int8_qk: true, sink_conditioning: "exact_kv_and_rows", morton: false, morton_curve: "2d_frame",
      int8_pv: true, verbose: false, use_tma: false, dense_blocks: "",
    }};
    model = [L.sol, 0];
  }
  if ((state.ltxPreviewEnabled ?? true) && has(avail, "ModelPreviewOverrideKJ") && nodeId != null) {
    // Same key the JS live-preview listener matches on (previewNodeKey) — the inline
    // "LX:preview" id used here before had a colon, which ComfyUI truncates in
    // hidden.unique_id for dynamic-expansion paths, so the frames never reached the UI.
    const key = previewNodeKey(nodeId);
    const pin = {
      model, max_resolution: state.ltxPreviewMaxRes ?? 512, jpeg_quality: state.ltxPreviewQuality ?? 85,
      suppress_default_preview: true, preview_frames: Math.max(1, state.ltxPreviewFrames ?? 8),
      preview_fps: state.ltxPreviewFps ?? fps,
    };
    const tv = state.ltxTinyVae;
    if (tv && tv !== "none") pin.tiny_vae = tv;
    g[key] = { class_type: "ModelPreviewOverrideKJ", inputs: pin, _meta: { title: `MMH3 LTX preview #${nodeId}` } };
    model = [key, 0];
  }

  // ── conditioning ───────────────────────────────────────────────────────────
  g[L.txtPos] = { class_type: "CLIPTextEncode", inputs: { text: String(state.ltxPrompt || ""), clip } };
  g[L.txtNeg] = { class_type: "CLIPTextEncode", inputs: {
    text: String(state.ltxNegPrompt || "bad anatomy, inconsistent look, low resolution,"), clip,
  }};
  g[L.cond] = { class_type: "LTXVConditioning", inputs: {
    frame_rate: fps, positive: [L.txtPos, 0], negative: [L.txtNeg, 0],
  }};
  let condPos = [L.cond, 0], condNeg = [L.cond, 1];
  if (has(avail, "TJ_FreeTextEncoderVRAM")) {
    g[L.freePos] = { class_type: "TJ_FreeTextEncoderVRAM", inputs: { clip, trigger: [L.cond, 0] } };
    g[L.freeNeg] = { class_type: "TJ_FreeTextEncoderVRAM", inputs: { clip, trigger: [L.cond, 1] } };
    condPos = [L.freePos, 0]; condNeg = [L.freeNeg, 0];
  }
  g[L.guider] = { class_type: "LTXVDualCFGGuider", inputs: {
    video_cfg: 1, audio_cfg: 1, model, positive: condPos, negative: condNeg,
  }};

  // ── latent: encode → 2x latent upscale → first-frame anchor → concat with audio ──
  g[L.enc] = { class_type: "VAEEncode", inputs: { pixels: [L.load, 0], vae: vaeV } };
  g[L.upsamp] = { class_type: "LTXVLatentUpsampler", inputs: {
    samples: [L.enc, 0], upscale_model: [L.upmodel, 0], vae: vaeV,
  }};
  // Anchors this segment's img2video conditioning. Segment 1 (no anchorImage) uses its own
  // window's own frame 0 — the clip's true first frame. Every later segment must instead
  // anchor on the PREVIOUS segment's own (already-upscaled) LAST frame, not this window's
  // frame 0 pulled from the un-upscaled original - otherwise each segment quietly
  // re-anchors to the original source and the concatenated result can show a visible seam
  // at every segment boundary (reported: "지금은 원본에서 이미지를 추출해서 넣고 있음").
  if (anchorImage) {
    g[L.firstF] = { class_type: "LoadImage", inputs: { image: anchorImage } };
  } else {
    g[L.firstF] = { class_type: "ImageFromBatch", inputs: { image: [L.load, 0], batch_index: 0, length: 1 } };
  }
  g[L.i2v] = { class_type: "LTXVImgToVideoInplace", inputs: {
    strength: 1, bypass: false, vae: vaeV, image: [L.firstF, 0], latent: [L.upsamp, 0],
  }};
  g[L.audEnc] = { class_type: "LTXVAudioVAEEncode", inputs: { audio: [L.load, 2], audio_vae: vaeA } };
  g[L.concat] = { class_type: "LTXVConcatAVLatent", inputs: {
    video_latent: [L.i2v, 0], audio_latent: [L.audEnc, 0],
  }};

  // ── refine sample ──────────────────────────────────────────────────────────
  // Seed comes from the node's fixed bottom Seed / Mode row (state.seed), not a mode-local
  // field — one seed control for every mode.
  const seed = state.seedMode === "randomize" ? (Math.floor(Math.random() * 1e15)) : (state.seed ?? 0);
  g[L.noise] = { class_type: "RandomNoise", inputs: { noise_seed: seed } };
  g[L.sampSel] = { class_type: "KSamplerSelect", inputs: { sampler_name: state.ltxSampler || "euler_ancestral" } };
  g[L.sched] = { class_type: "BasicScheduler", inputs: {
    model, scheduler: state.ltxScheduler || "simple",
    steps: Math.max(1, Math.round(state.ltxSteps ?? 4)), denoise: state.ltxDenoise ?? 0.15,
  }};
  g[L.sampler] = { class_type: "SamplerCustomAdvanced", inputs: {
    noise: [L.noise, 0], guider: [L.guider, 0], sampler: [L.sampSel, 0],
    sigmas: [L.sched, 0], latent_image: [L.concat, 0],
  }};

  // ── decode ─────────────────────────────────────────────────────────────────
  g[L.sep] = { class_type: "LTXVSeparateAVLatent", inputs: { av_latent: [L.sampler, 0] } };
  g[L.decV] = { class_type: "VAEDecodeTiled", inputs: {
    tile_size: 512, overlap: 64, temporal_size: 4096, temporal_overlap: 32,
    samples: [L.sep, 0], vae: vaeV,
  }};
  g[L.decA] = { class_type: "LTXVAudioVAEDecode", inputs: { samples: [L.sep, 1], audio_vae: vaeA } };
  let images = [L.decV, 0];

  // ── optional RTX finisher (reuses the H3 node's deblur / RTX VSR settings) ──
  let deblurUsed = null, upscaleUsed = null;
  if (state.deblurStrength && state.deblurStrength !== "none" && has(avail, "TJ_RTXDeblur")) {
    g[L.deblur] = { class_type: "TJ_RTXDeblur", inputs: { images, strength: state.deblurStrength } };
    images = [L.deblur, 0]; deblurUsed = state.deblurStrength;
  }
  const up = state.upscaleMode || "none";
  if (up === "model" && state.upscaleModel && state.upscaleModel !== "none") {
    g[L.upLoad] = { class_type: "UpscaleModelLoader", inputs: { model_name: state.upscaleModel } };
    g[L.upApply] = { class_type: "ImageUpscaleWithModel", inputs: { upscale_model: [L.upLoad, 0], image: images } };
    images = [L.upApply, 0]; upscaleUsed = { method: "model", model: state.upscaleModel };
  } else if (up === "rtx" && has(avail, "RTXVideoSuperResolution")) {
    // Standalone RTX pass, not chained through LTX's own scale — sized off the original
    // source clip's own resolution (state.ltxSourceMeta), same as everywhere else RTX runs.
    const sm = state.ltxSourceMeta || {};
    const r = buildRtxNode(g, { crop: L.rtxCrop, rtx: L.rtx }, images, state, sm.w || 1280, sm.h || 720);
    images = r.images; upscaleUsed = r.upscaleUsed;
  }

  // ── output ─────────────────────────────────────────────────────────────────
  saveVideoNode(g, { video: L.video, save: L.save }, images, [L.decA, 0], fps,
    `${folder}/${stem}_LTXUP${saveSuffix}`, avail);

  const usedLoras = (state.ltxLoras || []).filter(l => l?.name && l.name !== "none" && l.enabled !== false)
    .map(l => ({ name: l.name, strength: l.strength ?? 1.0 }));
  return { graph: g, meta: {
    ltxUpscale: true, steps: Math.max(1, Math.round(state.ltxSteps ?? 4)),
    denoise: state.ltxDenoise ?? 0.15, sampler: state.ltxSampler || "euler_ancestral",
    scheduler: state.ltxScheduler || "simple", seed, source: sourceFile, fps,
    loras: usedLoras, deblur: deblurUsed, upscale: upscaleUsed,
    videoNode: L.save, lastFrameNode: null,
  } };
}

// ── post-processing an already-rendered clip ─────────────────────────────────
// Upscaling and frame interpolation both follow the same shape: read the finished mp4
// back in, run the frames through one node, and write a new mp4 beside it. They are
// separate from buildClipGraph because nothing about the original run is involved — no
// UNET, no sampler, no conditioning — so building them here keeps that graph from
// growing branches it would have to skip on every normal render.
//
// The source has to be copied into ComfyUI's input folder first (VHS_LoadVideo only
// lists input/), which the caller does with copyOutputToInput before calling this.
const P = {
  load:  "PP:load",
  model: "PP:upscale_model",
  apply: "PP:upscale",
  rtx:   "PP:rtx",
  rtxCrop: "PP:rtx_crop",
  fvsrPipe: "PP:flashvsr_pipe",
  fvsr:     "PP:flashvsr",
  rife:  "PP:rife",
  deblur:"PP:deblur",
  resize:"PP:resize",
  video: "PP:video",
  save:  "PP:save",
};

/**
 * Upscale every frame of a finished clip and re-encode it, audio intact.
 *
 * @param opts.inputFile   filename already in ComfyUI's input folder
 * @param opts.method      "model" | "rtx" | "flashvsr"
 * @param opts.modelName   upscale model file, for method "model"
 * @param opts.rtxScale    multiplier, for method "rtx"
 * @param opts.rtxQuality  LOW | MEDIUM | HIGH | ULTRA
 * @param opts.flashvsr    { model, mode, scale, colorFix, tileSize, tileOverlap, seed }, for method "flashvsr"
 * @param opts.folder      output subfolder
 * @param opts.stem        filename prefix
 */
export function buildUpscaleGraph(opts, avail) {
  const {
    inputFile, method, modelName, rtxScale, rtxQuality,
    // Same size-mode fields as the main/LTX Upscale RTX panels (see computeRtxTarget) —
    // srcW/srcH is this file's own probed resolution, from the gallery's metadata.
    rtxSizeMode, rtxShort, rtxLong, rtxW, rtxH, rtxCropAnchor, srcW, srcH,
    flashvsr, folder, stem,
    // Chunking: VHS_LoadVideo materializes every requested frame as a float32 array up
    // front, so a full stitched video (thousands of frames) loaded whole can exceed
    // available RAM. skipFirstFrames/frameLoadCap let the caller ask for one bounded
    // slice at a time; 0/0 (the defaults) keeps the old whole-file behaviour.
    skipFirstFrames = 0, frameLoadCap = 0,
    // Lets a chunked caller name each piece distinctly instead of always "_upscaled".
    saveSuffix = "_upscaled",
    deblur = "none",
  } = opts;
  const g = {};

  // force_rate 0 keeps the file's own timing; the frame count and audio come back
  // alongside the images so the re-encode can stay in sync with the original.
  g[P.load] = { class_type: "VHS_LoadVideo", inputs: {
    video: inputFile, force_rate: 0,
    custom_width: 0, custom_height: 0,
    frame_load_cap: frameLoadCap, skip_first_frames: skipFirstFrames, select_every_nth: 1,
  }};
  let images = [P.load, 0];

  // Deblur is a pre-pass, not part of upscaling: it sharpens at the input's own
  // resolution and runs whether or not an upscale follows. Keeping it as its own `if`
  // rather than nesting it inside the upscale branch is what lets the caller ask for
  // deblur alone — see method === "none" below.
  if (deblur && deblur !== "none") {
    if (!has(avail, "TJ_RTXDeblur"))
      throw new Error("TJ_RTXDeblur is not installed — restart ComfyUI after updating this pack.");
    g[P.deblur] = { class_type: "TJ_RTXDeblur", inputs: { images, strength: deblur } };
    images = [P.deblur, 0];
  }

  if (method === "none") {
    // deblur-only: nothing else touches the frames
    if (!g[P.deblur]) throw new Error("Nothing to do — pick deblur, an upscale, or both.");
  } else if (method === "rtx") {
    if (!has(avail, "RTXVideoSuperResolution"))
      throw new Error("RTXVideoSuperResolution is not installed.");
    const pseudoState = { rtxScale, rtxQuality, rtxSizeMode, rtxShort, rtxLong, rtxW, rtxH, rtxCropAnchor };
    const r = buildRtxNode(g, { crop: P.rtxCrop, rtx: P.rtx }, images, pseudoState, srcW || 1280, srcH || 720);
    images = r.images;
  } else if (method === "flashvsr") {
    if (!has(avail, "FlashVSRNodeAdv"))
      throw new Error("FlashVSRInitPipe/FlashVSRNodeAdv is not installed.");
    buildFlashVSR(g, P.fvsrPipe, P.fvsr, flashvsr || {}, images);
    images = [P.fvsr, 0];
  } else {
    if (!modelName || modelName === "none")
      throw new Error("No upscale model selected.");
    g[P.model] = { class_type: "UpscaleModelLoader", inputs: { model_name: modelName } };
    g[P.apply] = { class_type: "ImageUpscaleWithModel", inputs: {
      upscale_model: [P.model, 0], image: images,
    }};
    images = [P.apply, 0];
  }

  saveVideoNode(g, { video: P.video, save: P.save }, images, [P.load, 2], FPS,
    `${folder}/${stem}${saveSuffix}`, avail);
  return { graph: g, saveNode: P.save };
}

/**
 * Interpolate a finished clip to a higher frame rate with RIFE Frame Interpolation.
 *
 * This is `RIFEInterpolation` (image/animation), not ComfyUI-Frame-Interpolation's
 * `RIFE VFI` — they are different nodes with different interfaces, and this one is the
 * one the panel offers. It takes an explicit source/target fps pair rather than an
 * integer multiplier, so a 24 -> 60 conversion is expressible instead of being rounded
 * to the nearest whole multiple.
 *
 * The encode uses targetFps, so the clip keeps its original running time and simply
 * moves more smoothly. Encoding at the source rate instead would turn the extra frames
 * into slow motion — a real effect, but not what this is for, and the audio track would
 * no longer line up.
 */
export function buildInterpolateGraph(opts, avail) {
  const {
    inputFile, sourceFps, targetFps, scale, batchSize, useFp16, modelName, folder, stem,
    // Chunking — see buildUpscaleGraph's note; same bounded-slice mechanism.
    skipFirstFrames = 0, frameLoadCap = 0,
    saveSuffix = null,
  } = opts;
  if (!has(avail, "RIFEInterpolation")) throw new Error("RIFE Frame Interpolation is not installed.");
  const srcFps = Math.max(1, Number(sourceFps) || FPS);
  const dstFps = Math.max(srcFps, Number(targetFps) || srcFps * 2);
  const g = {};

  g[P.load] = { class_type: "VHS_LoadVideo", inputs: {
    video: inputFile, force_rate: 0,
    custom_width: 0, custom_height: 0,
    frame_load_cap: frameLoadCap, skip_first_frames: skipFirstFrames, select_every_nth: 1,
  }};

  g[P.rife] = { class_type: "RIFEInterpolation", inputs: {
    images: [P.load, 0],
    source_fps: srcFps,
    target_fps: dstFps,
    // Processing scale, not output scale — below 1.0 it estimates motion on a smaller
    // image, which is faster and lighter on VRAM at some cost in accuracy.
    scale: scale ?? 1.0,
    model_name: modelName || "flownet.pkl",
    batch_size: Math.max(1, Math.round(batchSize ?? 8)),
    use_fp16: useFp16 !== false,
  }};

  saveVideoNode(g, { video: P.video, save: P.save }, [P.rife, 0], [P.load, 2], dstFps,
    `${folder}/${stem}${saveSuffix ?? `_${Math.round(dstFps)}fps`}`, avail);
  return { graph: g, saveNode: P.save };
}

/**
 * Resize a finished clip with the node pack's own `TJ_VideoResize` ("Video Resize (TJ)") —
 * a single node covering all 5 sizing modes the left-panel RTX VSR controls don't (Ratio,
 * Mega Pixel, plain Long/Short side, or an exact Width x Height with crop/stretch), so this
 * is deliberately a separate tool from the Upscale bar's RTX/FlashVSR/model methods rather
 * than a 4th branch in buildUpscaleGraph.
 *
 * @param opts.mode "Long side" | "Short side" | "Ratio" | "Mega Pixel" | "Width x Height"
 * @param opts.upscaleMethod lanczos | bilinear | bicubic | area | nearest-exact
 * @param opts.targetPx      Long/Short side px, for those two modes
 * @param opts.ratioW/ratioH integers, for Ratio mode
 * @param opts.megapixels    float, for Mega Pixel mode
 * @param opts.targetWidth/targetHeight int, for Width x Height mode
 * @param opts.cropMode      "crop" | "stretch", for Width x Height mode
 */
export function buildResizeGraph(opts, avail) {
  const {
    inputFile, mode, upscaleMethod, targetPx, ratioW, ratioH, megapixels,
    targetWidth, targetHeight, cropMode, folder, stem,
    // Chunking — see buildUpscaleGraph's note; same bounded-slice mechanism.
    skipFirstFrames = 0, frameLoadCap = 0,
    saveSuffix = "_resized",
  } = opts;
  if (!has(avail, "TJ_VideoResize")) throw new Error("Video Resize (TJ) is not installed — restart ComfyUI after updating the TJ_NODE pack.");
  const g = {};

  g[P.load] = { class_type: "VHS_LoadVideo", inputs: {
    video: inputFile, force_rate: 0,
    custom_width: 0, custom_height: 0,
    frame_load_cap: frameLoadCap, skip_first_frames: skipFirstFrames, select_every_nth: 1,
  }};

  g[P.resize] = { class_type: "TJ_VideoResize", inputs: {
    images: [P.load, 0],
    mode: mode || "Long side",
    upscale_method: upscaleMethod || "lanczos",
    target_px: Math.max(8, Math.round(targetPx ?? 1920)),
    ratio_w: Math.max(1, Math.round(ratioW ?? 16)),
    ratio_h: Math.max(1, Math.round(ratioH ?? 9)),
    megapixels: Math.max(0.01, megapixels ?? 1.0),
    target_width: Math.max(8, Math.round(targetWidth ?? 1920)),
    target_height: Math.max(8, Math.round(targetHeight ?? 1080)),
    crop_mode: cropMode || "crop",
  }};

  saveVideoNode(g, { video: P.video, save: P.save }, [P.resize, 0], [P.load, 2], FPS,
    `${folder}/${stem}${saveSuffix}`, avail);
  return { graph: g, saveNode: P.save };
}

// ── Postprocess (chained) ───────────────────────────────────────────────────────────
//
// The Postprocess mode's own node-id map — separate from N/P above so a chain build never
// collides with the standalone single-effect graphs (buildUpscaleGraph etc. stay usable
// on their own from the gallery for a quick one-off pass).
const PPX = {
  load:   "PPX:load",
  deblur: "PPX:deblur",
  denoise:"PPX:denoise",
  rtxCrop:"PPX:rtx_crop",
  rtx:    "PPX:rtx",
  rtx2:   "PPX:rtx_pass2",
  fvsrPipe:"PPX:flashvsr_pipe",
  fvsr:    "PPX:flashvsr",
  upModel:"PPX:upscale_model",
  upApply:"PPX:upscale",
  skinRetouch: "PPX:skin_retouch",
  grain:  "PPX:grain",
  grainDealpha: "PPX:grain_dealpha",
  rife:   "PPX:rife",
  resize: "PPX:resize",
  video:  "PPX:video",
  save:   "PPX:save",
};

// Film-grain fragment shader for GLSLShader (ComfyUI core) — verbatim from the reference
// "Flim Grain.json" export the user supplied: pcg-hash based grain, smooth or grainy noise
// mode, luminance-weighted (less grain in highlights), optional per-channel color grain.
const GRAIN_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_image0;
uniform vec2 u_resolution;
uniform float u_float0; // grain amount      [0.0 – 1.0]   typical: 0.2–0.8
uniform float u_float1; // grain size        [0.3 – 3.0]   lower = finer grain
uniform float u_float2; // color amount      [0.0 – 1.0]   0 = monochrome, 1 = RGB grain
uniform float u_float3; // luminance bias    [0.0 – 1.0]   0 = uniform, 1 = shadows only
uniform int   u_int0;   // noise mode        [0 or 1]      0 = smooth, 1 = grainy

in vec2 v_texCoord;
layout(location = 0) out vec4 fragColor0;

uint pcg(uint v) {
    uint state = v * 747796405u + 2891336453u;
    uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

uint hash2d(uvec2 p) {
    return pcg(p.x + pcg(p.y));
}

float hashf(uvec2 p) {
    return float(hash2d(p)) / float(0xffffffffu);
}

float hashf(uvec2 p, uint offset) {
    return float(pcg(hash2d(p) + offset)) / float(0xffffffffu);
}

float toGaussian(uvec2 p) {
    float sum = hashf(p, 0u) + hashf(p, 1u) + hashf(p, 2u) + hashf(p, 3u);
    return (sum - 2.0) * 0.7;
}

float toGaussian(uvec2 p, uint offset) {
    float sum = hashf(p, offset) + hashf(p, offset + 1u)
              + hashf(p, offset + 2u) + hashf(p, offset + 3u);
    return (sum - 2.0) * 0.7;
}

float smoothNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    uvec2 ui = uvec2(i);
    float a = toGaussian(ui);
    float b = toGaussian(ui + uvec2(1u, 0u));
    float c = toGaussian(ui + uvec2(0u, 1u));
    float d = toGaussian(ui + uvec2(1u, 1u));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float smoothNoise(vec2 p, uint offset) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    uvec2 ui = uvec2(i);
    float a = toGaussian(ui, offset);
    float b = toGaussian(ui + uvec2(1u, 0u), offset);
    float c = toGaussian(ui + uvec2(0u, 1u), offset);
    float d = toGaussian(ui + uvec2(1u, 1u), offset);
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
    vec4 color = texture(u_image0, v_texCoord);
    float luma = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
    vec2 grainUV = v_texCoord * u_resolution / max(u_float1, 0.01);
    uvec2 grainPixel = uvec2(grainUV);
    float g;
    vec3 grainRGB;
    if (u_int0 == 1) {
        g = toGaussian(grainPixel);
        grainRGB = vec3(
            toGaussian(grainPixel, 100u),
            toGaussian(grainPixel, 200u),
            toGaussian(grainPixel, 300u)
        );
    } else {
        g = smoothNoise(grainUV);
        grainRGB = vec3(
            smoothNoise(grainUV, 100u),
            smoothNoise(grainUV, 200u),
            smoothNoise(grainUV, 300u)
        );
    }
    float lumWeight = mix(1.0, 1.0 - luma, clamp(u_float3, 0.0, 1.0));
    float strength = u_float0 * 0.15;
    vec3 grainColor = mix(vec3(g), grainRGB, clamp(u_float2, 0.0, 1.0));
    color.rgb += grainColor * strength * lumWeight;
    fragColor0 = vec4(clamp(color.rgb, 0.0, 1.0), color.a);
}
`;

/**
 * Postprocess mode's chained pipeline — Deblur -> Denoise -> Upscale(FlashVSR/RTX VSR/
 * model) -> Skin Retouch -> Grain -> Interpolate -> Resize, in that fixed order (Skin
 * Retouch's spot right after Upscale is an explicit user call, not derived from the
 * original A-F spec). Every step is independently optional (`opts.<step>.enabled`); a
 * disabled step is simply skipped, so any subset can chain. Each step reassigns
 * `images`/`fps` for the next one, mirroring buildUpscaleGraph's single mutable-link
 * pattern.
 *
 * @param opts.deblur     { enabled, strength }
 * @param opts.denoise    { enabled, strength }
 * @param opts.upscale    { enabled, method: "rtx"|"flashvsr"|"model", ...method params,
 *                          srcW, srcH, twoPass, pass2 }  — twoPass (flashvsr/model only) adds an
 *                          RTX VSR (TJ) pass after the first method; pass2 = { rtxSizeMode:
 *                          scale|short|long|wh, rtxScale, rtxShort, rtxLong, rtxW, rtxH,
 *                          rtxCropAnchor, rtxQuality } is its own, independent of the rtx* above  — same param shape as buildUpscaleGraph's method
 *                          branches (rtxScale/rtxQuality/rtxSizeMode/.../flashvsr/modelName)
 * @param opts.skinRetouch{ enabled, evenness, smoothing, redness, shine,
 *                          blemishMode: "off"|"subtle"|"strong", preserveMarks,
 *                          microtextureStrength }
 * @param opts.grain      { enabled, amount, size, color, lumBias, noiseMode: "smooth"|"grainy" }
 * @param opts.interpolate{ enabled, targetFps, scale, modelName, batchSize, useFp16 }
 * @param opts.resize     { enabled, mode, upscaleMethod, targetPx, ratioW, ratioH,
 *                          megapixels, targetWidth, targetHeight, cropMode }
 */
export function buildPostprocessGraph(opts, avail) {
  const {
    inputFile, folder, stem,
    deblur = {}, denoise = {}, upscale = {}, skinRetouch = {}, grain = {}, interpolate = {}, resize = {},
    skipFirstFrames = 0, frameLoadCap = 0,
    saveSuffix = "_post", preview = false,
  } = opts;
  const g = {};
  const usedSteps = [];

  g[PPX.load] = { class_type: "VHS_LoadVideo", inputs: {
    video: inputFile, force_rate: 0,
    custom_width: 0, custom_height: 0,
    frame_load_cap: frameLoadCap, skip_first_frames: skipFirstFrames, select_every_nth: 1,
  }};
  let images = [PPX.load, 0];
  let fps = FPS;

  // A. Deblur — TJ_RTXDeblur, the STUDIO_ONE-native key already wired into every other
  // deblur call site here (see buildUpscaleGraph's note — TJ_NODE's own pack registers
  // the same feature under the different key TJ_NODE_RTXDeblur, for pack coexistence).
  if (deblur.enabled && deblur.strength && deblur.strength !== "none") {
    if (!has(avail, "TJ_RTXDeblur")) throw new Error("RTX Deblur (TJ_RTXDeblur) is not installed.");
    g[PPX.deblur] = { class_type: "TJ_RTXDeblur", inputs: { images, strength: deblur.strength } };
    images = [PPX.deblur, 0];
    usedSteps.push("deblur");
  }

  // B. Denoise — TJ_NODE_RTXDenoise (ships with the separate TJ_NODE pack; no STUDIO_ONE-
  // native equivalent already exists, unlike Deblur/RTX VSR).
  if (denoise.enabled && denoise.strength && denoise.strength !== "none") {
    if (!has(avail, "TJ_NODE_RTXDenoise")) throw new Error("RTX Denoise (TJ_NODE_RTXDenoise) is not installed.");
    g[PPX.denoise] = { class_type: "TJ_NODE_RTXDenoise", inputs: { images, strength: denoise.strength } };
    images = [PPX.denoise, 0];
    usedSteps.push("denoise");
  }

  // C. Upscale — offered in the user's own numbered order (1. FlashVSR, 2. RTX VSR (TJ),
  // 3. Model). RTX VSR here is deliberately TJ_NODE's own "RTX VSR (TJ)" (TJ_NODE_RTXVSR),
  // not the third-party RTXVideoSuperResolution buildUpscaleGraph/buildRtxNode use
  // elsewhere — Postprocess's Deblur/Denoise already depend on TJ_NODE, so its VSR keeps
  // the whole chain to one dependency pack instead of also requiring the third-party one.
  let upscaleUsedInfo = null;
  if (upscale.enabled && upscale.method && upscale.method !== "none") {
    if (upscale.method === "flashvsr") {
      if (!has(avail, "FlashVSRNodeAdv")) throw new Error("FlashVSRInitPipe/FlashVSRNodeAdv is not installed.");
      buildFlashVSR(g, PPX.fvsrPipe, PPX.fvsr, upscale.flashvsr || {}, images);
      images = [PPX.fvsr, 0];
      upscaleUsedInfo = flashvsrUsed(upscale.flashvsr || {});
    } else if (upscale.method === "rtx") {
      if (!has(avail, "TJ_NODE_RTXVSR")) throw new Error("RTX VSR (TJ_NODE_RTXVSR) is not installed.");
      const t = computeRtxTarget({
        rtxSizeMode: upscale.rtxSizeMode, rtxScale: upscale.rtxScale, rtxShort: upscale.rtxShort,
        rtxLong: upscale.rtxLong, rtxW: upscale.rtxW, rtxH: upscale.rtxH, rtxCropAnchor: upscale.rtxCropAnchor,
      }, upscale.srcW || 1280, upscale.srcH || 720);
      if (t.crop) {
        g[PPX.rtxCrop] = { class_type: "ImageCrop", inputs: { image: images, ...t.crop } };
        images = [PPX.rtxCrop, 0];
      }
      g[PPX.rtx] = { class_type: "TJ_NODE_RTXVSR", inputs: {
        images,
        resize_type: t.resizeType,
        scale: t.scale ?? 2.0,
        width: t.width ?? 1920,
        height: t.height ?? 1080,
        quality: upscale.rtxQuality || "ULTRA",
      }};
      images = [PPX.rtx, 0];
      upscaleUsedInfo = t.resizeType === "scale by multiplier"
        ? { method: "rtx", scale: t.scale, quality: upscale.rtxQuality || "ULTRA" }
        : { method: "rtx", width: t.width, height: t.height, quality: upscale.rtxQuality || "ULTRA" };
    } else {
      if (!upscale.modelName || upscale.modelName === "none") throw new Error("No upscale model selected.");
      g[PPX.upModel] = { class_type: "UpscaleModelLoader", inputs: { model_name: upscale.modelName } };
      g[PPX.upApply] = { class_type: "ImageUpscaleWithModel", inputs: { upscale_model: [PPX.upModel, 0], image: images } };
      images = [PPX.upApply, 0];
      upscaleUsedInfo = { method: "model", model: upscale.modelName };
    }
    // Two-pass upscale: FlashVSR / Model first, then RTX VSR (TJ) on its result. Only those two
    // methods offer it — RTX as the first pass would just be RTX twice. The second pass has its
    // own settings (upscale.pass2), independent of the standalone RTX ones. The first pass's
    // output size is not known here, so the short / long edge and crop-to-fit sizing is done by
    // the node itself from the frames it receives (needs a TJ_NODE with those resize_type values).
    if (upscale.twoPass && upscale.method !== "rtx") {
      if (!has(avail, "TJ_NODE_RTXVSR")) throw new Error("2-pass Upscale needs RTX VSR (TJ_NODE_RTXVSR), which is not installed.");
      const p2 = upscale.pass2 || {};
      const mode2 = p2.rtxSizeMode || "scale";
      const inputs2 = { images, resize_type: "scale by multiplier", scale: 2.0, width: 1920, height: 1080,
                        quality: p2.rtxQuality || "ULTRA" };
      let info2;
      if (mode2 === "short" || mode2 === "long") {
        inputs2.resize_type = mode2 === "short" ? "short edge" : "long edge";
        inputs2.edge = Math.max(8, Math.round(mode2 === "short" ? (p2.rtxShort ?? 1080) : (p2.rtxLong ?? 1920)));
        info2 = { method: "rtx", [mode2]: inputs2.edge };
      } else if (mode2 === "wh") {
        inputs2.resize_type = "target dimensions (crop to fit)";
        inputs2.width = Math.max(8, Math.round(p2.rtxW ?? 1920));
        inputs2.height = Math.max(8, Math.round(p2.rtxH ?? 1080));
        inputs2.crop_anchor = p2.rtxCropAnchor || "center";
        info2 = { method: "rtx", width: inputs2.width, height: inputs2.height, crop: inputs2.crop_anchor };
      } else {
        inputs2.scale = Math.max(1, p2.rtxScale ?? 2.0);
        info2 = { method: "rtx", scale: inputs2.scale };
      }
      g[PPX.rtx2] = { class_type: "TJ_NODE_RTXVSR", inputs: inputs2 };
      images = [PPX.rtx2, 0];
      upscaleUsedInfo = { ...upscaleUsedInfo, secondPass: { ...info2, quality: inputs2.quality } };
    }
    usedSteps.push(upscale.twoPass && upscale.method !== "rtx" ? "upscale (2-pass)" : "upscale");
  }

  // D. Skin Retouch — TJ_SkinRetouch (TJ_NODE), placed right after Upscale per the user's
  // explicit call ("Skin Retouch의 위치는 업스케일 다음에"): pure-PyTorch, non-generative
  // (YCbCr skin-likelihood mask, no model/checkpoint) — ported from VRGDG-SeedVR2-
  // TensorRT-Studio's apply_skin_finishing()/apply_skin_microtexture().
  if (skinRetouch.enabled) {
    if (!has(avail, "TJ_SkinRetouch")) throw new Error("Skin Retouch (TJ_SkinRetouch) is not installed.");
    g[PPX.skinRetouch] = { class_type: "TJ_SkinRetouch", inputs: {
      images,
      evenness: skinRetouch.evenness ?? 0,
      smoothing: skinRetouch.smoothing ?? 0,
      redness: skinRetouch.redness ?? 0,
      shine: skinRetouch.shine ?? 0,
      blemish_mode: skinRetouch.blemishMode || "off",
      preserve_marks: skinRetouch.preserveMarks !== false,
      microtexture_strength: skinRetouch.microtextureStrength ?? 0,
    }};
    images = [PPX.skinRetouch, 0];
    usedSteps.push("skin retouch");
  }

  // E. Add Grain — GLSLShader (ComfyUI core), the fixed grain shader above. `amount`/
  // `size`/`color`/`lumBias` map straight to the shader's u_float0-3; `noiseMode` picks
  // u_int0 (0 = smooth/interpolated, 1 = grainy/pure hash noise).
  if (grain.enabled) {
    if (!has(avail, "GLSLShader")) throw new Error("GLSLShader is not installed (ComfyUI core is out of date).");
    // GLSLShader's images/floats/ints groups are COMFY_AUTOGROW_V3. A live /prompt
    // submission's own validation error is the actual ground truth here (two earlier
    // guesses both wrong): the rejected node's extra_info names the missing input as
    // literally "images.image0" — the AUTOGROW group name, a dot, then the prefixed
    // slot name — not a bare "image0" and not a nested {images:{image0:...}} object.
    // Applying the same dotted shape to the floats/ints groups too.
    g[PPX.grain] = { class_type: "GLSLShader", inputs: {
      fragment_shader: GRAIN_FRAGMENT_SHADER,
      size_mode: "from_input",
      "images.image0": images,
      "floats.u_float0": grain.amount ?? 0.25,
      "floats.u_float1": grain.size ?? 0.1,
      "floats.u_float2": grain.color ?? 0,
      "floats.u_float3": grain.lumBias ?? 0,
      "ints.u_int0": grain.noiseMode === "grainy" ? 1 : 0,
    }};
    // GLSLShader's IMAGE0 output is RGBA (4 channels) even though every input frame here
    // is plain RGB — every downstream node in this chain (RIFEInterpolation, TJ_VideoResize,
    // VHS_VideoCombine) expects [N,H,W,3] and throws otherwise (live error: "Expected image
    // tensor shape [N, H, W, 3], got torch.Size([12, 1472, 2688, 4])" out of ComfyUI-VFI's
    // RIFEInterpolation, the very next step after Grain). SplitImageWithAlpha (ComfyUI core)
    // strips it back down to RGB; its MASK output is discarded, nothing downstream wants it.
    if (!has(avail, "SplitImageWithAlpha")) throw new Error("SplitImageWithAlpha is not installed (ComfyUI core is out of date).");
    g[PPX.grainDealpha] = { class_type: "SplitImageWithAlpha", inputs: { image: [PPX.grain, 0] } };
    images = [PPX.grainDealpha, 0];
    usedSteps.push("grain");
  }

  // F. Interpolate — RIFEInterpolation, same shape as buildInterpolateGraph.
  if (interpolate.enabled) {
    if (!has(avail, "RIFEInterpolation")) throw new Error("RIFE Frame Interpolation is not installed.");
    const dstFps = Math.max(fps, Number(interpolate.targetFps) || fps * 2);
    g[PPX.rife] = { class_type: "RIFEInterpolation", inputs: {
      images, source_fps: fps, target_fps: dstFps,
      scale: interpolate.scale ?? 1.0,
      model_name: interpolate.modelName || "flownet.pkl",
      batch_size: Math.max(1, Math.round(interpolate.batchSize ?? 8)),
      use_fp16: interpolate.useFp16 !== false,
    }};
    images = [PPX.rife, 0];
    fps = dstFps;
    usedSteps.push("interpolate");
  }

  // G. Resize — TJ_VideoResize, same param shape as buildResizeGraph.
  if (resize.enabled) {
    if (!has(avail, "TJ_VideoResize")) throw new Error("Video Resize (TJ) is not installed.");
    g[PPX.resize] = { class_type: "TJ_VideoResize", inputs: {
      images,
      mode: resize.mode || "Long side",
      upscale_method: resize.upscaleMethod || "lanczos",
      target_px: Math.max(8, Math.round(resize.targetPx ?? 1920)),
      ratio_w: Math.max(1, Math.round(resize.ratioW ?? 16)),
      ratio_h: Math.max(1, Math.round(resize.ratioH ?? 9)),
      megapixels: Math.max(0.01, resize.megapixels ?? 1.0),
      target_width: Math.max(8, Math.round(resize.targetWidth ?? 1920)),
      target_height: Math.max(8, Math.round(resize.targetHeight ?? 1080)),
      crop_mode: resize.cropMode || "crop",
    }};
    images = [PPX.resize, 0];
    usedSteps.push("resize");
  }

  if (!usedSteps.length) throw new Error("Nothing to do — enable at least one Postprocess effect.");

  saveVideoNode(g, { video: PPX.video, save: PPX.save }, images, [PPX.load, 2], fps,
    `${folder}/${stem}${saveSuffix}`, avail, preview);
  return { graph: g, saveNode: PPX.save, usedSteps, upscaleUsedInfo };
}

// ── H3 image gallery post-process (Deblur + RTX VSR only) ───────────────────────────
//
// The dedicated H3 image gallery keeps only Deblur/RTX VSR from the video gallery's
// wider post-process set (no Interpolate/Resize/Stitch — those are video-only concepts,
// and the image gallery is its own separate module, not the video one modified in
// place). Same shape as buildUpscaleGraph but LoadImage/SaveImage instead of
// VHS_LoadVideo/VHS_VideoCombine — a still has no audio/fps/chunking to carry through.
const IMGPP = { load: "IMGPP:load", deblur: "IMGPP:deblur", rtxCrop: "IMGPP:rtx_crop", rtx: "IMGPP:rtx", save: "IMGPP:save" };

/**
 * @param opts.inputFile  filename already in ComfyUI's input folder
 * @param opts.deblur     "none" | "LOW" | "MEDIUM" | "HIGH" | "ULTRA"
 * @param opts.rtx        null, or { rtxSizeMode, rtxScale, rtxShort, rtxLong, rtxW, rtxH,
 *                         rtxCropAnchor, rtxQuality, srcW, srcH } to run RTX VSR
 * @param opts.folder, opts.stem, opts.saveSuffix
 */
export function buildImageUpscaleGraph(opts, avail) {
  const { inputFile, deblur = "none", rtx = null, folder, stem, saveSuffix = "_post" } = opts;
  const g = {};
  g[IMGPP.load] = { class_type: "LoadImage", inputs: { image: inputFile } };
  let image = [IMGPP.load, 0];
  let used = false;

  if (deblur && deblur !== "none") {
    if (!has(avail, "TJ_RTXDeblur")) throw new Error("RTX Deblur (TJ_RTXDeblur) is not installed.");
    g[IMGPP.deblur] = { class_type: "TJ_RTXDeblur", inputs: { images: image, strength: deblur } };
    image = [IMGPP.deblur, 0];
    used = true;
  }
  if (rtx) {
    if (!has(avail, "RTXVideoSuperResolution")) throw new Error("RTXVideoSuperResolution is not installed.");
    const r = buildRtxNode(g, { crop: IMGPP.rtxCrop, rtx: IMGPP.rtx }, image, rtx, rtx.srcW || 1024, rtx.srcH || 1024);
    image = r.images;
    used = true;
  }
  if (!used) throw new Error("Nothing to do — enable Deblur, RTX VSR, or both.");

  g[IMGPP.save] = { class_type: "SaveImage", inputs: { filename_prefix: `${folder}/${stem}${saveSuffix}`, images: image } };
  return { graph: g, saveNode: IMGPP.save };
}


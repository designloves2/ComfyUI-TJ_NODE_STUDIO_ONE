// graph_builder_minimax.js — MiniMax H3 ONE STUDIO (TJ) workflow graph builder
//
// Rebuilds the reference workflow's 37-node subgraph as a compact API graph.
// The helper nodes it used (ResolutionSelector / ComfyMathExpression / TJ_MultiSwitch ×5)
// are gone: their values are computed here in JS, so the submitted graph is ~20 nodes and
// every branch is an explicit `if` instead of a runtime switch.
//
// Optional third-party nodes are gated on `avail` (from /minimax_h3_one/node_availability):
// a missing pack disables that one feature rather than failing the whole prompt.
import { SUBFOLDER, FPS, resolveResolution, effectiveAccel, turboLoraForMode, framesToSeconds, ONE_TAKE_OVERLAP_FRAMES } from "./core_minimax.js";

const N = {
  unet:   "MM:unet",
  clip:   "MM:clip",
  vaeV:   "MM:vae_video",
  vaeA:   "MM:vae_audio",
  sage:   "MM:sage",
  memSage:"MM:mem_sage",
  ckAttn: "MM:ck_attn",
  sla:    "MM:sla",
  torch:  "MM:torch",
  shift:  "MM:sigma_shift",
  cache:  "MM:cache",
  fbcache:"MM:fbcache",
  sol:     "MM:solattn",
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
  video:  "MM:video",
  save:   "MM:save_video",
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
  refAud:   (i) => `MM:refaud_${i}`,
  refAudTrim: (i) => `MM:refaud_trim_${i}`,
  audioLock:  "MM:audio_lock",
  lockAud:    "MM:lock_audio",
  lockAudTrim:"MM:lock_audio_trim",
  chkLoad:    "MM:h3_chk_load",
  continuation: "MM:h3_continuation",
  chkSave:    "MM:h3_chk_save",
};

// How many trailing frames to keep as chain candidates. Enough to step over a short
// fade-out without reaching back into a materially different moment.
export const TAIL_CANDIDATES = 8;

const has = (avail, name) => !!(avail && avail[name]);

/**
 * Wire the lock, if it applies. Returns true when the sampler should read from it.
 *
 * The relay renders one clip per prompt, so each clip has to be handed *its own slice*
 * of the track — feeding the whole file to every clip would repeat the same seconds N
 * times in the stitched result. The slice is cut with TrimAudioDuration, the same node
 * the reference-audio inputs already use.
 */
function buildAudioLock(g, state, avail, clipIndex, frames) {
  if (!state.audioLock) return false;
  // Say what's wrong up front rather than silently rendering without the lock — a run
  // that quietly ignores it looks like the lock simply doesn't work.
  if (!has(avail, "TJ_H3_AudioLock"))
    throw new Error("Audio lock needs the TJ_H3_AudioLock node — install the TJ_NODE pack, or switch the lock off.");
  if (!state.lockAudioFile)
    throw new Error("Audio lock is on but no audio file is selected — pick one under Lock audio in the left panel.");

  const clipSeconds = framesToSeconds(frames);
  const startSec = clipIndex * clipSeconds;

  g[N.lockAud] = { class_type: "LoadAudio", inputs: { audio: state.lockAudioFile } };
  let audioLink = [N.lockAud, 0];

  // Without the trimmer every clip would lock onto the opening seconds of the track.
  if (has(avail, "TrimAudioDuration")) {
    g[N.lockAudTrim] = { class_type: "TrimAudioDuration", inputs: {
      audio: audioLink, start_index: startSec, duration: clipSeconds,
    }};
    audioLink = [N.lockAudTrim, 0];
  }

  g[N.audioLock] = { class_type: "TJ_H3_AudioLock", inputs: {
    av_latent: [N.cond, 1],
    audio:     audioLink,
    audio_vae: [N.vaeA, 0],
    mode:      state.audioLockMode || "lock",
    strength:  state.audioLockStrength ?? 0.5,
    fit:       state.audioLockFit || "pad_silence",
    // TJ_NODE's wireless Set/Get widgets are declared `required`, so an API graph that
    // omits them is rejected outright with required_input_missing.
    get_name_av_latent: "(none)",
    get_name_audio:     "(none)",
    get_name_audio_vae: "(none)",
    auto_set: false,
  }};
  return true;
}

/**
 * One-Take (latent continuation, TJ_NODE): the sampled latent from the previous clip's
 * SamplerCustomAdvanced feeds straight into this clip's head, no VAE round trip. The
 * relay submits one queue per clip (so the model can be unloaded between them), which
 * means ComfyUI holds no tensor state across submissions — the previous clip's latent
 * has to round-trip through a disk checkpoint (TJ_H3_SaveLatentCheckpoint /
 * TJ_H3_LoadLatentCheckpoint) rather than being wired directly.
 *
 * Returns the latent link the sampler should read from — either the continuation node's
 * output (clip 2+) or `defaultLatent` unchanged (clip 1, nothing to continue from yet).
 */
function buildOneTake(g, state, avail, clipIndex, prevCheckpointName, defaultLatent) {
  if (state.continuityMode !== "onetake") return defaultLatent;
  if (!has(avail, "TJ_H3_LatentContinuation"))
    throw new Error("One-Take needs the TJ_H3_LatentContinuation node — install/update the TJ_NODE pack, or switch Continuity to something else.");
  if (clipIndex === 0 || !prevCheckpointName) return defaultLatent;   // nothing to continue from yet
  if (!has(avail, "TJ_H3_LoadLatentCheckpoint"))
    throw new Error("One-Take needs the TJ_H3_LoadLatentCheckpoint node — install/update the TJ_NODE pack.");

  g[N.chkLoad] = { class_type: "TJ_H3_LoadLatentCheckpoint", inputs: {
    checkpoint_name: prevCheckpointName,
    // Required by TJ_NODE's node def even though it has a widget default — API-submitted
    // graphs must always spell out required inputs explicitly. We're past clipIndex 0 here,
    // so a missing checkpoint IS a real error and strict=true is the right value.
    strict: true,
  }};
  g[N.continuation] = { class_type: "TJ_H3_LatentContinuation", inputs: {
    overlap_frames: ONE_TAKE_OVERLAP_FRAMES,
    lock_audio: !!state.oneTakeLockAudio,
    prev_latent: [N.chkLoad, 0],
    target_latent: defaultLatent,
  }};
  return [N.continuation, 0];
}

/** Persist this clip's sampled (undecoded) latent so the next clip's queue submission
 * can load it back for One-Take — see buildOneTake above for why this round-trips
 * through disk instead of an in-memory link. */
function saveOneTakeCheckpoint(g, state, avail, checkpointName) {
  if (state.continuityMode !== "onetake" || !checkpointName) return;
  if (!has(avail, "TJ_H3_SaveLatentCheckpoint")) return;   // buildOneTake already threw if this run needed loading; saving is best-effort for the *next* clip
  g[N.chkSave] = { class_type: "TJ_H3_SaveLatentCheckpoint", inputs: {
    latent: [N.sampler, 0],
    checkpoint_name: checkpointName,
  }};
}

function requireModels(state) {
  const mode = state.generationMode || "t2v";
  const unet = mode === "reference" ? state.unetReference : state.unetFirstLast;
  if (!unet || unet === "none")
    throw new Error(`No ${mode === "reference" ? "Reference" : "First/Last"} UNET selected — open ⚙ Settings → Models.`);
  if (!state.clipName || state.clipName === "none")
    throw new Error("No text encoder selected — open ⚙ Settings → Models.");
  if (!state.vaeVideo || state.vaeVideo === "none")
    throw new Error("No video VAE selected — open ⚙ Settings → Models.");
  if (!state.vaeAudio || state.vaeAudio === "none")
    throw new Error("No audio VAE selected — open ⚙ Settings → Models.");
  return unet;
}

function unetNode(name) {
  if ((name || "").toLowerCase().endsWith(".gguf"))
    return { class_type: "UnetLoaderGGUF", inputs: { unet_name: name } };
  return { class_type: "UNETLoader", inputs: { unet_name: name, weight_dtype: "default" } };
}

/** Model patch chain, in the reference workflow's order. Returns the final MODEL link. */
function buildModelChain(g, state, avail) {
  const unet = requireModels(state);
  g[N.unet] = unetNode(unet);
  let m = [N.unet, 0];

  // SageAttention and CK-Attention are alternative attention backends — the Settings UI
  // enforces only one group being on, so these never stack.
  if (state.useCkAttention && has(avail, "ModelAttentionBackend")) {
    g[N.ckAttn] = { class_type: "ModelAttentionBackend", inputs: {
      model: m,
      attention: state.ckAttentionBackend === "pytorch" ? "pytorch attention" : "comfy kitchen attention",
    }};
    m = [N.ckAttn, 0];
  } else {
    if (state.useSageAttn && has(avail, "PathchSageAttentionKJ")) {
      g[N.sage] = { class_type: "PathchSageAttentionKJ", inputs: {
        model: m, sage_attention: state.sageAttnMode || "auto",
      }};
      m = [N.sage, 0];
    }
    if (state.useMemEffSage && has(avail, "MiniMaxH3MemoryEfficientSageAttentionPatch")) {
      g[N.memSage] = { class_type: "MiniMaxH3MemoryEfficientSageAttentionPatch", inputs: { model: m } };
      m = [N.memSage, 0];
    }
  }
  if (state.useTorchPatch && has(avail, "ModelPatchTorchSettings")) {
    g[N.torch] = { class_type: "ModelPatchTorchSettings", inputs: {
      model: m, enable_fp16_accumulation: state.fp16Accum !== false,
    }};
    m = [N.torch, 0];
  }

  g[N.shift] = { class_type: "MiniMaxH3SigmaShift", inputs: {
    model: m,
    shift_video: state.shiftVideo ?? 12,
    shift_audio: state.shiftAudio ?? 3,
  }};
  m = [N.shift, 0];

  // User LoRA chain (the reference workflow had LoraManager wired here, outside the
  // subgraph; keeping it inline avoids the model round-trip that would be a graph cycle).
  (state.loras || []).forEach((lora, i) => {
    if (!lora?.name || lora.name === "none" || lora.enabled === false) return;
    const strength = parseFloat(lora.strength ?? 1.0);
    if (!(strength > 0)) return;
    const id = `MM:lora${i}`;
    g[id] = { class_type: "LoraLoaderModelOnly", inputs: {
      model: m, lora_name: lora.name, strength_model: strength,
    }};
    m = [id, 0];
  });

  if (state.useCache && has(avail, "MiniMaxH3Cache")) {
    g[N.cache] = { class_type: "MiniMaxH3Cache", inputs: {
      model: m,
      resuse_threshold: state.cacheThreshold ?? 0.3,
      start_percent:    state.cacheStart ?? 0.15,
      end_percent:      state.cacheEnd ?? 0.9,
      max_steps:        state.cacheMaxSteps ?? 2,
      device: "auto", verbose: false,
    }};
    m = [N.cache, 0];
  }

  // Same reuse-cache idea as MiniMaxH3Cache above, just a different implementation — the
  // UI enforces only one of the two being on at once, so this never stacks with N.cache.
  if (state.useFirstBlockCache && has(avail, "ApplyMiniMaxH3FirstBlockCache")) {
    g[N.fbcache] = { class_type: "ApplyMiniMaxH3FirstBlockCache", inputs: {
      model: m,
      mode: "H3 Fast — 0.10 / max 2",
      threshold: 0.10, start_percent: 0.10, end_percent: 0.95,
      max_consecutive_hits: 2, temporal_guard: false,
    }};
    m = [N.fbcache, 0];
  }

  // Turbo only when a LoRA exists for THIS mode's base model — see effectiveAccel.
  const accel = effectiveAccel(state, avail).mode;
  if (accel === "turbo" && has(avail, "MiniMaxH3TurboLoRA")) {
    g[N.turbo] = { class_type: "MiniMaxH3TurboLoRA", inputs: {
      model: m, lora_name: turboLoraForMode(state),
      strength: state.turboLoraStrength ?? 1.0,
      low_vram: !!state.turboLoraLowVram,
    }};
    m = [N.turbo, 0];
  } else if (accel === "solattn" && has(avail, "SolAttnPatch")) {
    g[N.sol] = { class_type: "SolAttnPatch", inputs: {
      model: m,
      tau: state.solTau ?? 1.3,
      start_percent: state.solStart ?? 0.2,
      end_percent:   state.solEnd ?? 0.9,
      min_tokens:    state.solMinTokens ?? 4096,
      int8_qk: true, sink_conditioning: "exact_kv_and_rows",
      morton: false, morton_curve: "2d_frame",
      int8_pv: true, verbose: false, use_tma: false, dense_blocks: "",
    }};
    m = [N.sol, 0];
  } else if (accel === "spectrum" && has(avail, "SpectrumApplyMiniMaxH3")) {
    g[N.spectrum] = { class_type: "SpectrumApplyMiniMaxH3", inputs: {
      model: m,
      enabled: true,
      blend_weight:      state.specBlendWeight ?? 0.5,
      degree:            Math.round(state.specDegree ?? 1),
      ridge_lambda:      state.specRidgeLambda ?? 0.1,
      window_size:       state.specWindowSize ?? 2.0,
      flex_window:       state.specFlexWindow ?? 0.75,
      warmup_steps:      Math.round(state.specWarmupSteps ?? 1),
      tail_actual_steps: Math.round(state.specTailSteps ?? 1),
      max_history:       Math.round(state.specMaxHistory ?? 8),
      debug: false,
      history_storage: state.specHistoryStore || "system_ram",
      bootstrap_first_forecast: true,
    }};
    m = [N.spectrum, 0];
  }

  return m;
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
export function previewNodeKey(nodeId) { return `MMH3_preview_${nodeId}`; }

function applyPreview(g, state, avail, modelLink, nodeId) {
  if (!state.previewEnabled || !has(avail, "ModelPreviewOverrideKJ") || nodeId == null) return modelLink;
  const key = previewNodeKey(nodeId);
  const inputs = {
    model: modelLink,
    max_resolution: state.previewMaxRes ?? 512,
    jpeg_quality:   state.previewQuality ?? 85,
    suppress_default_preview: true,
    preview_frames: Math.max(1, state.previewFrames ?? 8),
    preview_fps:    state.previewFps ?? 12,
  };
  if (state.previewTinyVae && state.previewTinyVae !== "none") inputs.tiny_vae = state.previewTinyVae;
  g[key] = { class_type: "ModelPreviewOverrideKJ", inputs, _meta: { title: `MMH3 preview #${nodeId}` } };
  return [key, 0];
}

// H3 SLA Attention wants to be last before the sampler (its own README: "place it after
// your LoRA loader, last before the sampler"), so it goes after preview, not inside
// buildModelChain. Enabling it lives in Settings; the node's own `enabled` bypass is the
// left-panel per-run checkbox, so the node stays in the graph either way once turned on
// in Settings — flipping the left-panel box just toggles sparse vs dense passthrough.
function applySla(g, state, avail, modelLink) {
  if (!state.useSlaAttention || !has(avail, "H3SLAAttention")) return modelLink;
  g[N.sla] = { class_type: "H3SLAAttention", inputs: {
    model: modelLink,
    sparsity_ratio: state.slaSparsity ?? 0.90,
    block_size: state.slaBlockSize || "64",
    min_seq_len: state.slaMinSeqLen ?? 8192,
    dense_last_steps: state.slaDenseLastSteps ?? 0,
    protect_audio: state.slaProtectAudio !== false,
    enabled: state.slaRunEnabled !== false,
  }};
  return [N.sla, 0];
}

// Per-card megapixel override for a keyframe/reference image — 0 (or unset) means "send
// as uploaded, no resize". ImageScaleToTotalPixels is a ComfyUI core node, so this needs
// no availability gate.
function resizeToMp(g, key, imageLink, mp) {
  if (!(mp > 0)) return imageLink;
  g[key] = { class_type: "ImageScaleToTotalPixels", inputs: {
    image: imageLink, upscale_method: "lanczos", megapixels: mp, resolution_steps: 1,
  }};
  return [key, 0];
}

function buildConditioning(g, state, promptText, width, height, frames, opts, avail) {
  const mode = state.generationMode || "t2v";
  const { firstFrame, lastFrame, refImages } = opts || {};

  if (mode === "reference") {
    const inputs = {
      clip: [N.clip, 0], vae: [N.vaeV, 0], audio_vae: [N.vaeA, 0],
      prompt: promptText, width, height, length: frames,
      ref_image_size: state.refImageSize || "match",
    };
    // Ref2VA has no first_frame input. Feeding a previous clip's final frame in here as
    // an extra reference was measured and does nothing for continuity, so the relay
    // switches continued clips to FL2VA instead and never sends a frame this way.
    (refImages || []).slice(0, 9).forEach((name, i) => {
      if (!name) return;
      g[N.ref(i)] = { class_type: "LoadImage", inputs: { image: name } };
      let link = resizeToMp(g, N.refResize(i), [N.ref(i), 0], (state.refImagesMp || [])[i]);
      // Autogrow inputs are addressed with the dotted path the schema expands to.
      inputs[`ref_images.ref_image_${i}`] = link;
    });

    // Reference videos. VHS_LoadVideo does the whole job in one node: force_rate pins
    // the 24fps the model expects, and skip/cap are the in/out points in frames. Its
    // AUDIO output is the same clip's soundtrack, which the model pairs by index.
    if (has(avail, "VHS_LoadVideo")) {
      (state.refVideos || []).slice(0, 3).forEach((v, i) => {
        if (!v || !v.file) return;
        const start = Math.max(0, Number(v.start) || 0);
        const end   = Math.max(start, Number(v.end) || 0);
        const skip  = Math.round(start * FPS);
        const cap   = Math.max(0, Math.round((end - start) * FPS));   // 0 = to the end
        g[N.refVid(i)] = { class_type: "VHS_LoadVideo", inputs: {
          video: v.file,
          force_rate: FPS,
          custom_width: 0, custom_height: 0,
          frame_load_cap: cap,
          skip_first_frames: skip,
          select_every_nth: 1,
        }};
        inputs[`ref_videos.ref_video_${i}`] = [N.refVid(i), 0];
        if (v.withAudio !== false) {
          inputs[`ref_video_audios.ref_video_audio_${i}`] = [N.refVid(i), 2];
        }
      });
    }

    // Standalone reference audio, trimmed to the requested window.
    (state.refAudios || []).slice(0, 3).forEach((a, i) => {
      if (!a || !a.file) return;
      g[N.refAud(i)] = { class_type: "LoadAudio", inputs: { audio: a.file } };
      let link = [N.refAud(i), 0];
      const start = Math.max(0, Number(a.start) || 0);
      const end   = Math.max(start, Number(a.end) || 0);
      const dur   = end - start;
      if ((start > 0 || dur > 0) && has(avail, "TrimAudioDuration")) {
        g[N.refAudTrim(i)] = { class_type: "TrimAudioDuration", inputs: {
          audio: link, start_index: start, duration: dur > 0 ? dur : 60.0,
        }};
        link = [N.refAudTrim(i), 0];
      }
      inputs[`ref_audios.ref_audio_${i}`] = link;
    });

    g[N.cond] = { class_type: "MiniMaxH3ReferenceToVideo", inputs };
    return;
  }

  // t2v and firstlast share MiniMaxH3ImageToVideo; the keyframes are optional.
  const inputs = {
    clip: [N.clip, 0], vae: [N.vaeV, 0],
    prompt: promptText, width, height, length: frames,
  };
  if (mode === "firstlast") {
    if (firstFrame) {
      g[N.loadFirst] = { class_type: "LoadImage", inputs: { image: firstFrame } };
      inputs.first_frame = resizeToMp(g, N.loadFirstResize, [N.loadFirst, 0], state.firstFrameMp);
    }
    if (lastFrame) {
      g[N.loadLast] = { class_type: "LoadImage", inputs: { image: lastFrame } };
      inputs.last_frame = resizeToMp(g, N.loadLastResize, [N.loadLast, 0], state.lastFrameMp);
    }
  }
  g[N.cond] = { class_type: "MiniMaxH3ImageToVideo", inputs };
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
    nodeId, promptText, seed,
    firstFrame = null, lastFrame = null, refImages = null,
    clipIndex = 0, saveLastFrame = true,
    prevCheckpointName = null, checkpointName = null,
  } = opts;

  const frames = state.clipFrames || 192;
  const { width, height } = resolveResolution(state.aspect, state.megapixels);
  const folder = (state.saveSubfolder || SUBFOLDER).replace(/\\/g, "/");
  const stem = state.filenamePrefix || "MMH3";

  const g = {};

  // ── loaders ────────────────────────────────────────────────────────────────
  const modelLink0 = buildModelChain(g, state, avail);
  g[N.clip] = { class_type: "CLIPLoader", inputs: {
    clip_name: state.clipName, type: "minimax", device: "default",
  }};
  g[N.vaeV] = { class_type: "VAELoader", inputs: { vae_name: state.vaeVideo } };
  g[N.vaeA] = { class_type: "VAELoader", inputs: { vae_name: state.vaeAudio } };

  const modelLink1 = applyPreview(g, state, avail, modelLink0, nodeId);
  const modelLink = applySla(g, state, avail, modelLink1);

  // ── conditioning ───────────────────────────────────────────────────────────
  // `promptText` arrives fully composed (header + shots + footer + suffix) from
  // composeClipPrompt; the builder does not re-append anything.
  const fullPrompt = String(promptText || "").trim();
  buildConditioning(g, state, fullPrompt, width, height, frames,
    { firstFrame, lastFrame, refImages: refImages ?? state.refImages }, avail);

  // ── sampling ───────────────────────────────────────────────────────────────
  // The turbo sampler's 4-step schedule only makes sense with the turbo LoRA applied,
  // so it follows the same resolution rather than state.accelMode directly.
  const accel = effectiveAccel(state, avail).mode;
  const useTurboSampler = accel === "turbo" && has(avail, "MiniMaxH3TurboSampler");
  const steps = useTurboSampler ? (state.turboSteps ?? 4) : (state.steps ?? 20);

  g[N.noise] = { class_type: "RandomNoise", inputs: { noise_seed: seed ?? 0 } };
  if (useTurboSampler) {
    g[N.sampSel] = { class_type: "MiniMaxH3TurboSampler", inputs: {} };
  } else {
    g[N.sampSel] = { class_type: "KSamplerSelect", inputs: { sampler_name: state.sampler || "er_sde" } };
  }
  g[N.sched] = { class_type: "BasicScheduler", inputs: {
    model: modelLink, scheduler: state.scheduler || "simple",
    steps, denoise: state.denoise ?? 1.0,
  }};
  g[N.guider] = { class_type: "BasicGuider", inputs: {
    model: modelLink, conditioning: [N.cond, 0],
  }};
  // ── audio lock ─────────────────────────────────────────────────────────────
  // H3 treats ref_audio as a reference and regenerates the sound, which is no good for
  // lip-sync or a music video. TJ_H3_AudioLock encodes the real audio into the AV latent
  // and hands the sampler a nested denoise mask of video=1 / audio=0, so every step
  // restores the audio untouched while the video still generates.
  const lockAudio = buildAudioLock(g, state, avail, clipIndex, frames);
  const preOneTakeLatent = lockAudio ? [N.audioLock, 0] : [N.cond, 1];
  // One-Take (latent continuation): the previous clip's sampled latent tail becomes this
  // clip's head, so it goes on top of whatever Audio Lock already produced.
  const latentImage = buildOneTake(g, state, avail, clipIndex, prevCheckpointName, preOneTakeLatent);

  g[N.sampler] = { class_type: "SamplerCustomAdvanced", inputs: {
    noise: [N.noise, 0], guider: [N.guider, 0],
    sampler: [N.sampSel, 0], sigmas: [N.sched, 0],
    latent_image: latentImage,
  }};
  saveOneTakeCheckpoint(g, state, avail, checkpointName);

  // ── decode ─────────────────────────────────────────────────────────────────
  g[N.decode]  = { class_type: "VAEDecode",      inputs: { samples: [N.sampler, 0], vae: [N.vaeV, 0] } };
  g[N.decodeA] = { class_type: "VAEDecodeAudio", inputs: { samples: [N.sampler, 0], vae: [N.vaeA, 0] } };

  let images = [N.decode, 0];
  const up = state.upscaleMode || "none";
  if (up === "model" && state.upscaleModel && state.upscaleModel !== "none") {
    g[N.upModel] = { class_type: "UpscaleModelLoader", inputs: { model_name: state.upscaleModel } };
    g[N.upApply] = { class_type: "ImageUpscaleWithModel", inputs: {
      upscale_model: [N.upModel, 0], image: images,
    }};
    images = [N.upApply, 0];
  } else if (up === "rtx" && has(avail, "RTXVideoSuperResolution")) {
    g[N.rtx] = { class_type: "RTXVideoSuperResolution", inputs: {
      images,
      // dynamic combo: the selected key plus its sub-input, dot-addressed
      resize_type: "scale by multiplier",
      "resize_type.scale": state.rtxScale ?? 2.0,
      quality: state.rtxQuality || "ULTRA",
    }};
    images = [N.rtx, 0];
  }

  // ── outputs ────────────────────────────────────────────────────────────────
  const clipTag = String(clipIndex + 1).padStart(3, "0");
  // The lock's own audio output passes the source through untouched. Decoding it back
  // out of the latent instead would cost a neural-codec round trip, which is audible
  // even though the lock held — so that path is only for when the lock is off.
  g[N.video] = { class_type: "CreateVideo", inputs: {
    images, fps: FPS, audio: lockAudio ? [N.audioLock, 1] : [N.decodeA, 0],
  }};
  g[N.save] = { class_type: "SaveVideo", inputs: {
    video: [N.video, 0],
    filename_prefix: `${folder}/${stem}_clip${clipTag}`,
    format: "auto", codec: "auto",
  }};

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
    const tail = Math.min(TAIL_CANDIDATES, frames);
    g[N.tailF] = { class_type: "ImageFromBatch", inputs: {
      image: images, batch_index: Math.max(0, frames - tail), length: tail,
    }};
    g[N.tailPrev] = { class_type: "PreviewImage", inputs: { images: [N.tailF, 0] } };
  }

  return { graph: g, meta: { width, height, frames, steps, seed, videoNode: N.save, lastFrameNode: N.saveLF } };
}

export const NODE_IDS = N;

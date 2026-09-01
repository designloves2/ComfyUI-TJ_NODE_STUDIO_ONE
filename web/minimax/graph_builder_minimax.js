// graph_builder_minimax.js — MiniMax H3 ONE STUDIO (TJ) workflow graph builder
//
// Rebuilds the reference workflow's 37-node subgraph as a compact API graph.
// The helper nodes it used (ResolutionSelector / ComfyMathExpression / TJ_MultiSwitch ×5)
// are gone: their values are computed here in JS, so the submitted graph is ~20 nodes and
// every branch is an explicit `if` instead of a runtime switch.
//
// Optional third-party nodes are gated on `avail` (from /minimax_h3_one/node_availability):
// a missing pack disables that one feature rather than failing the whole prompt.
import { SUBFOLDER, FPS, resolveResolution, effectiveTurbo, effectiveSteps, turboLoraForMode, pddFileForMode, blockCacheBlockedReason, framesToSeconds, ONE_TAKE_OVERLAP_FRAMES } from "./core_minimax.js";
import { matchPreset } from "./presets_minimax.js";

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
  deblurR:"MM:deblur",
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

  // ── attention backend (transformer_options override slot) ─────────────────
  // Exactly one of these may be installed: they all write the same
  // `optimized_attention_override` key (CK writes the sibling `optimized_attention`),
  // and the last writer silently wins. The UI offers them as one dropdown for that
  // reason — stacking two used to look enabled while only one actually ran.
  //
  // SLA is deliberately NOT placed here even though it claims the same slot: it wants
  // to be the last patch before the sampler, so it is applied in applySla() further
  // down, after the preview wrapper.
  const attn = state.attnBackend || "none";
  if (attn === "ck" && has(avail, "ModelAttentionBackend")) {
    g[N.ckAttn] = { class_type: "ModelAttentionBackend", inputs: {
      model: m,
      attention: state.ckAttentionBackend === "pytorch" ? "pytorch attention" : "comfy kitchen attention",
    }};
    m = [N.ckAttn, 0];
  } else if (attn === "sage" && has(avail, "PathchSageAttentionKJ")) {
    g[N.sage] = { class_type: "PathchSageAttentionKJ", inputs: {
      model: m, sage_attention: state.sageAttnMode || "auto",
    }};
    m = [N.sage, 0];
  } else if (attn === "solattn_kijai" && has(avail, "SolAttnPatch")) {
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
  }

  // ── H3 attention forward (blocks[i].attn.forward object patch) ────────────
  // A different layer from the override above, so it combines with it. Order matters
  // for the Saganaki22 node specifically: it adopts whatever already patched
  // attn.forward as its own fallback for calls its kernel can't take, which is how
  // "MemEff Sage + Sol" ends up being a working stack rather than a collision — so
  // Sage has to be installed first.
  const attnFwd = state.attnForward || "none";
  if ((attnFwd === "memeff_sage" || attnFwd === "solattn_sag")
      && has(avail, "MiniMaxH3MemoryEfficientSageAttentionPatch")
      && (attnFwd === "memeff_sage" || state.solSagAdoptSage !== false)) {
    g[N.memSage] = { class_type: "MiniMaxH3MemoryEfficientSageAttentionPatch", inputs: { model: m } };
    m = [N.memSage, 0];
  }
  if (attnFwd === "solattn_sag" && has(avail, "MiniMaxH3ScheduledSolAttentionPatch")) {
    g[N.solSag] = { class_type: "MiniMaxH3ScheduledSolAttentionPatch", inputs: {
      model: m,
      enabled: true,
      tau_start:     state.solSagTauStart ?? 1.3,
      tau_end:       state.solSagTauEnd ?? 0.8,
      curve:         state.solSagCurve || "linear",
      min_tokens:    Math.round(state.solSagMinTokens ?? 4096),
      strict:        !!state.solSagStrict,
      dense_percent: state.solSagDensePercent ?? 0.0,
      thresh_type:   state.solSagThreshType || "diag",
      int8_qk:       !!state.solSagInt8Qk,
      int8_pv:       !!state.solSagInt8Pv,
      sink_conditioning: state.solSagSinkCond || "exact_kv",
      dense_blocks:  state.solSagDenseBlocks || "",
    }};
    m = [N.solSag, 0];
  }
  if (state.useTorchPatch && has(avail, "ModelPatchTorchSettings")) {
    g[N.torch] = { class_type: "ModelPatchTorchSettings", inputs: {
      model: m, enable_fp16_accumulation: state.fp16Accum !== false,
    }};
    m = [N.torch, 0];
  }

  // PDD's heads are trained against a 12/3 shift and its wrapper refuses anything else —
  // a hard error, but one that arrives minutes into sampling. The shift is part of the
  // same trained contract as the sigmas and the sampler, so pin it here rather than let a
  // changed slider turn into a failed render.
  const pddShift = effectiveTurbo(state, avail).mode === "pdd";
  g[N.shift] = { class_type: "MiniMaxH3SigmaShift", inputs: {
    model: m,
    shift_video: pddShift ? 12 : (state.shiftVideo ?? 12),
    shift_audio: pddShift ? 3  : (state.shiftAudio ?? 3),
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

  // ── turbo (weights) ───────────────────────────────────────────────────────
  // Goes after the user LoRA chain so a turbo LoRA sits closest to the sampler, and
  // before the caches for the same reason the caches sit before Spectrum: each layer
  // wraps the one above it.
  const turbo = effectiveTurbo(state, avail).mode;
  if (turbo === "larryvrh" && has(avail, "MiniMaxH3TurboLoRA")) {
    g[N.turbo] = { class_type: "MiniMaxH3TurboLoRA", inputs: {
      model: m, lora_name: turboLoraForMode(state),
      strength: state.turboLoraStrength ?? 1.0,
      low_vram: !!state.turboLoraLowVram,
    }};
    m = [N.turbo, 0];
  } else if (turbo === "lightx2v") {
    // An ordinary LoRA — the speedup comes from the SLA kernel it was distilled
    // against, which applySla() installs later.
    g[N.slaTurboLora] = { class_type: "LoraLoaderModelOnly", inputs: {
      model: m, lora_name: state.slaTurboLora,
      strength_model: state.slaTurboStrength ?? 1.0,
    }};
    m = [N.slaTurboLora, 0];
  } else if (turbo === "pdd") {
    // Not a LoRA load: the apply node swaps the model's final projection for the trained
    // 32-interval head bank and returns the sigmas sitting on that bank's block
    // boundaries. Those sigmas are the whole contract — evaluating the model anywhere
    // else is off the trained grid, which is why on_off_grid is left at "error" rather
    // than clamping a wrong schedule into something that renders as noise without saying
    // so. The sampler reads them instead of BasicScheduler; see the sigmas wiring below.
    g[N.pdd] = { class_type: "MiniMaxH3PDDAccApply", inputs: {
      model: m,
      pdd_file: pddFileForMode(state),
      nfe: String(state.pddNfe ?? "8"),
      lora_strength: state.pddLoraStrength ?? 1.0,
      head_strength: state.pddHeadStrength ?? 1.0,
      on_off_grid: "error",
    }};
    m = [N.pdd, 0];
  }

  // ── block-output cache ────────────────────────────────────────────────────
  // One or the other: both reuse block outputs across steps, so running them together
  // just compounds the same approximation twice. (They wouldn't error — H3 Cache takes
  // the whole block loop while FirstBlockCache replaces individual blocks — which is
  // exactly why the UI has to be the thing keeping them apart.)
  //
  // A turbo schedule rules the caches out entirely — a handful of steps never reaches the
  // threshold they reuse at, and PDD's own release says not to stack step caching on it at
  // all. The panel already refuses the combination and says so, but it can only do that
  // once it has rendered; a graph built from state that has not been through it would
  // otherwise carry a cache the run was never meant to have, and record it in the clip's
  // metadata as though it had been chosen. Enforce it where the graph is actually made.
  const cache = blockCacheBlockedReason(state.blockCache || "none", turbo)
    ? "none" : (state.blockCache || "none");
  if (cache === "h3cache" && has(avail, "MiniMaxH3Cache")) {
    g[N.cache] = { class_type: "MiniMaxH3Cache", inputs: {
      model: m,
      resuse_threshold: state.cacheThreshold ?? 0.3,
      start_percent:    state.cacheStart ?? 0.15,
      end_percent:      state.cacheEnd ?? 0.9,
      max_steps:        state.cacheMaxSteps ?? 2,
      device: "auto", verbose: false,
    }};
    m = [N.cache, 0];
  } else if (cache === "fbcache" && has(avail, "ApplyMiniMaxH3FirstBlockCache")) {
    g[N.fbcache] = { class_type: "ApplyMiniMaxH3FirstBlockCache", inputs: {
      model: m,
      mode: state.fbcMode || "H3 Fast — 0.10 / max 2",
      threshold: state.fbcThreshold ?? 0.10,
      start_percent: state.fbcStartPercent ?? 0.10,
      end_percent: state.fbcEndPercent ?? 0.95,
      max_consecutive_hits: state.fbcMaxHits ?? 2,
      temporal_guard: !!state.fbcTemporalGuard,
    }};
    m = [N.fbcache, 0];
  }

  // ── Spectrum (latent-level step forecasting) ──────────────────────────────
  // Independent of the caches above: those decide whether to recompute blocks *within*
  // a step, Spectrum decides whether to run the model for a step at all. Its wrapper
  // sits outside theirs, so the two compose instead of competing.
  if (state.useSpectrum && has(avail, "SpectrumApplyMiniMaxH3")) {
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
// Fuses H3's segmented AdaLN scale/shift and gated residual updates into Triton
// kernels. It patches blocks[i].forward, a layer nothing else here touches, and it
// still *calls* block.adaln_proj() rather than reading its weights — so a turbo LoRA's
// AdaLN injection survives it. That makes this safe to leave on with any combination
// of the axes above.
function applyFusedModulation(g, state, avail, modelLink) {
  if (!state.useFusedModulation || !has(avail, "MiniMaxH3FusedModulation")) return modelLink;
  g[N.fusedMod] = { class_type: "MiniMaxH3FusedModulation", inputs: {
    model: modelLink, enabled: true,
  }};
  return [N.fusedMod, 0];
}

function applySla(g, state, avail, modelLink) {
  // Selected either as the attention backend outright, or implied by the lightx2v
  // turbo LoRA, which is worthless without it.
  const wantSla = state.attnBackend === "sla" || state.turboMode === "lightx2v";
  if (!wantSla || !has(avail, "H3SLAAttention")) return modelLink;
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
    clipIndex = 0, saveLastFrame = true, saveTailPreviews = true,
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

  const modelLink1 = applyFusedModulation(g, state, avail, modelLink0);
  const modelLink2 = applyPreview(g, state, avail, modelLink1, nodeId);
  const modelLink = applySla(g, state, avail, modelLink2);

  // ── conditioning ───────────────────────────────────────────────────────────
  // `promptText` arrives fully composed (header + shots + footer + suffix) from
  // composeClipPrompt; the builder does not re-append anything.
  const fullPrompt = String(promptText || "").trim();
  buildConditioning(g, state, fullPrompt, width, height, frames,
    { firstFrame, lastFrame, refImages: refImages ?? state.refImages }, avail);

  // ── sampling ───────────────────────────────────────────────────────────────
  // The dedicated turbo sampler belongs to the larryvrh pack and only makes sense with
  // that LoRA applied. lightx2v is a plain LoRA distilled for the ordinary sampler, so
  // it keeps the normal sampler and only changes the step count.
  const turboMode = effectiveTurbo(state, avail).mode;
  const useTurboSampler = turboMode === "larryvrh" && has(avail, "MiniMaxH3TurboSampler");
  const steps = effectiveSteps(state, avail);

  g[N.noise] = { class_type: "RandomNoise", inputs: { noise_seed: seed ?? 0 } };
  // Reported back in `meta` so the clip records the sampler that ran rather than the one
  // the panel is showing. Turbo overrides both this and the step count, and a sidecar
  // that quietly keeps the panel's values makes runs look comparable when they are not.
  let samplerUsed = state.sampler || "er_sde";
  if (useTurboSampler) {
    g[N.sampSel] = { class_type: "MiniMaxH3TurboSampler", inputs: {} };
    samplerUsed = "MiniMaxH3TurboSampler";
  } else if (turboMode === "pdd") {
    samplerUsed = "euler";
    // PDD distils a mean velocity per block, which is what one Euler step over that
    // block's boundaries consumes. An ancestral or multistep sampler would evaluate
    // between boundaries — off the trained grid — so the sampler is not the user's to
    // pick here, the same way the sigmas are not.
    g[N.sampSel] = { class_type: "KSamplerSelect", inputs: { sampler_name: "euler" } };
  } else {
    g[N.sampSel] = { class_type: "KSamplerSelect", inputs: { sampler_name: state.sampler || "er_sde" } };
  }
  g[N.sched] = { class_type: "BasicScheduler", inputs: {
    model: modelLink, scheduler: state.scheduler || "simple",
    steps, denoise: state.denoise ?? 1.0,
  }};
  // Conditioning is fully computed by now and nothing downstream needs the text encoder
  // again this clip — free it before the diffusion model starts sampling instead of
  // leaving it to ComfyUI's own (not always fully clean) smart unload. TJ_NODE's node
  // just passes the conditioning straight through; freeing is its only side effect.
  let condLink = [N.cond, 0];
  if (has(avail, "TJ_FreeTextEncoderVRAM")) {
    g[N.freeClipVram] = { class_type: "TJ_FreeTextEncoderVRAM", inputs: {
      clip: [N.clip, 0], trigger: condLink,
    }};
    condLink = [N.freeClipVram, 0];
  }
  g[N.guider] = { class_type: "BasicGuider", inputs: {
    model: modelLink, conditioning: condLink,
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

  // PDD supplies its own sigmas — the block boundaries of the grid its head bank was
  // distilled on. BasicScheduler's curve would put the model on timesteps no head was
  // trained for, so for PDD it is left unwired (ComfyUI only runs what an output needs)
  // and the trained schedule goes straight to the sampler.
  g[N.sampler] = { class_type: "SamplerCustomAdvanced", inputs: {
    noise: [N.noise, 0], guider: [N.guider, 0],
    sampler: [N.sampSel, 0],
    sigmas: turboMode === "pdd" ? [N.pdd, 1] : [N.sched, 0],
    latent_image: latentImage,
  }};
  saveOneTakeCheckpoint(g, state, avail, checkpointName);

  // ── decode ─────────────────────────────────────────────────────────────────
  g[N.decode]  = { class_type: "VAEDecode",      inputs: { samples: [N.sampler, 0], vae: [N.vaeV, 0] } };
  g[N.decodeA] = { class_type: "VAEDecodeAudio", inputs: { samples: [N.sampler, 0], vae: [N.vaeA, 0] } };

  let images = [N.decode, 0];
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
    g[N.rtx] = { class_type: "RTXVideoSuperResolution", inputs: {
      images,
      // dynamic combo: the selected key plus its sub-input, dot-addressed
      resize_type: "scale by multiplier",
      "resize_type.scale": state.rtxScale ?? 2.0,
      quality: state.rtxQuality || "ULTRA",
    }};
    images = [N.rtx, 0];
    upscaleUsed = { method: "rtx", scale: state.rtxScale ?? 2.0, quality: state.rtxQuality || "ULTRA" };
  }

  // ── outputs ────────────────────────────────────────────────────────────────
  const clipTag = String(clipIndex + 1).padStart(3, "0");
  // The lock's own audio output passes the source through untouched. Decoding it back
  // out of the latent instead would cost a neural-codec round trip, which is audible
  // even though the lock held — so that path is only for when the lock is off.
  g[N.video] = { class_type: "CreateVideo", inputs: {
    images, fps: FPS, audio: lockAudio ? [N.audioLock, 1] : [N.decodeA, 0],
  }};
  // When the pipeline happens to be exactly one of the named combinations, put its number
  // in the filename. The metadata sidecar already records it, but a benchmark produces
  // dozens of clips that differ only in settings, and reading them back one sidecar at a
  // time to find out which is which is the slow way. A run that matches nothing is left
  // untagged rather than labelled something misleading.
  const presetTag = (matchPreset(state) || {}).id;
  g[N.save] = { class_type: "SaveVideo", inputs: {
    video: [N.video, 0],
    filename_prefix: `${folder}/${stem}_clip${clipTag}${presetTag ? `_preset${presetTag}` : ""}`,
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
    width, height, frames, steps, seed,
    // What actually ran, for the clip's sidecar: `steps` above is already the effective
    // count, and these two complete the picture a turbo run needs to be comparable.
    samplerUsed,
    turboUsed: turboMode,
    turboFile:
      turboMode === "larryvrh" ? (turboLoraForMode(state) || null)
      : turboMode === "lightx2v" ? (state.slaTurboLora || null)
      : turboMode === "pdd" ? (pddFileForMode(state) || null)
      : null,
    pddNfe: turboMode === "pdd" ? String(state.pddNfe ?? "8") : null,
    // null when the pipeline didn't run it; the save path re-probes the output only when
    // upscaleUsed is set (deblur alone never changes the size).
    deblur: deblurUsed,
    upscale: upscaleUsed,
    videoNode: N.save, lastFrameNode: N.saveLF,
  } };
}

export const NODE_IDS = N;

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
  rife:  "PP:rife",
  deblur:"PP:deblur",
  video: "PP:video",
  save:  "PP:save",
};

/**
 * Upscale every frame of a finished clip and re-encode it, audio intact.
 *
 * @param opts.inputFile   filename already in ComfyUI's input folder
 * @param opts.method      "model" | "rtx"
 * @param opts.modelName   upscale model file, for method "model"
 * @param opts.rtxScale    multiplier, for method "rtx"
 * @param opts.rtxQuality  LOW | MEDIUM | HIGH | ULTRA
 * @param opts.folder      output subfolder
 * @param opts.stem        filename prefix
 */
export function buildUpscaleGraph(opts, avail) {
  const {
    inputFile, method, modelName, rtxScale, rtxQuality, folder, stem,
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
    g[P.rtx] = { class_type: "RTXVideoSuperResolution", inputs: {
      images,
      // dynamic combo: the selected key plus its sub-input, dot-addressed
      resize_type: "scale by multiplier",
      "resize_type.scale": rtxScale ?? 2.0,
      quality: rtxQuality || "ULTRA",
    }};
    images = [P.rtx, 0];
  } else {
    if (!modelName || modelName === "none")
      throw new Error("No upscale model selected.");
    g[P.model] = { class_type: "UpscaleModelLoader", inputs: { model_name: modelName } };
    g[P.apply] = { class_type: "ImageUpscaleWithModel", inputs: {
      upscale_model: [P.model, 0], image: images,
    }};
    images = [P.apply, 0];
  }

  g[P.video] = { class_type: "CreateVideo", inputs: {
    images, fps: FPS, audio: [P.load, 2],
  }};
  g[P.save] = { class_type: "SaveVideo", inputs: {
    video: [P.video, 0],
    filename_prefix: `${folder}/${stem}${saveSuffix}`,
    format: "auto", codec: "auto",
  }};
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

  g[P.video] = { class_type: "CreateVideo", inputs: {
    images: [P.rife, 0], fps: dstFps, audio: [P.load, 2],
  }};
  g[P.save] = { class_type: "SaveVideo", inputs: {
    video: [P.video, 0],
    filename_prefix: `${folder}/${stem}${saveSuffix ?? `_${Math.round(dstFps)}fps`}`,
    format: "auto", codec: "auto",
  }};
  return { graph: g, saveNode: P.save };
}


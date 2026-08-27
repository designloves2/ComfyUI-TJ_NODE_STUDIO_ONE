// core_minimax.js — MiniMax H3 ONE STUDIO (TJ) constants, state, helpers
export const BRAND = "#7612DA";   // pack-wide TJ purple, same as every other ONE STUDIO node
export const C = {
  lime: BRAND, bg0: "#0b0b0b", bg1: "#111111", bg2: "#181818",
  bg3: "#222222", border: "#2a2a2a", borderH: "#3c3c3c",
  text: "#dedede", muted: "#565656", dim: "#2e2e2e",
  warn: "#ffb347", err: "#ff6767", ok: "#5fd38d",
};

export const NODE_W       = 1000;
export const PREVIEW_SIZE = 620;
export const LEFT_W       = 320;
export const PAD          = 12;
export const SUBFOLDER    = "one_minimax_h3";
export const API          = "/minimax_h3_one";
export const LS_KEY       = "minimax_h3_one_state_v1";
// Bump to re-run migrateLegacyAccel once on the next load, when a past revision of it
// left states wrong. v1 = original boolean flag; v2 = SLA no longer hijacks the backend.
export const PIPELINE_MIGRATION = 2;

export const FPS = 24;

// The model only accepts frame counts on the 17k+5 grid (comfy_extras/nodes_minimax_h3.py:
// `while n % 17 != 5: n += 1`). Free-form seconds would silently snap up, so the UI offers
// the exact ladder instead. Trained range is ~124-362 frames.
export const CLIP_LENGTHS = (() => {
  const out = [];
  for (let n = 124; n <= 362; n += 17) {
    const sec = n / FPS;
    out.push({ frames: n, seconds: sec, label: `${sec.toFixed(2)}s  (${n}f)` });
  }
  return out;
})();
export const DEFAULT_FRAMES = 192;   // 8.000s — the only exact-second option at 24fps

export function framesToSeconds(frames) { return frames / FPS; }

// Mirrors comfy_extras/nodes_minimax_h3.py's align_frame_count — the video latent grid
// only accepts 17k+5 frame counts, always rounding up. Used to compute the *actual*
// overlap TJ_H3_LatentContinuation applied, so a One-Take auto-stitch trims exactly
// that much.
export function alignFrameCount(n) {
  let f = Math.max(5, Math.round(n));
  while (f % 17 !== 5) f++;
  return f;
}

// One-Take's overlap window, in real (24fps) frames — fixed, not user-configurable.
// The stitch trim has to match exactly what TJ_H3_LatentContinuation used, and letting
// the two drift apart (e.g. changed mid-run) would silently mis-stitch a finished run,
// so this is one constant both the graph builder and the auto-stitch trim read from.
// 39 already sits on the video grid (align_frame_count is a no-op on it) and converts to
// an exact audio-latent step count (39/24*40 = 65, no rounding) — see
// SPEC_MINIMAX_H3_NEXT_ROUND.md §B2.
export const ONE_TAKE_OVERLAP_FRAMES = 39;

/**
 * The larryvrh turbo LoRA for the current mode.
 *
 * Reference mode has its own slot because a turbo LoRA is trained against one base
 * model, but it falls back to the main one when unset — that keeps a setup that only
 * ever filled the main slot working in Reference mode exactly as it did before.
 */
export function turboLoraForMode(state) {
  const isRef = (state.generationMode || "t2v") === "reference";
  const pick = (isRef && state.turboLoraReference && state.turboLoraReference !== "none")
    ? state.turboLoraReference
    : state.turboLora;
  return (pick && pick !== "none") ? pick : "";
}

/**
 * Whether the selected turbo actually runs, and why not when it doesn't.
 *
 * Both packs fail softly here rather than throwing mid-run: a missing LoRA or an
 * uninstalled pack just means the run falls back to the normal step count.
 */
export function effectiveTurbo(state, avail) {
  const want = state.turboMode || "none";
  if (want === "none") return { mode: "none", fellBack: false };

  const installed = (name) => !(avail && Object.keys(avail).length) || !!avail[name];

  if (want === "larryvrh") {
    if (!turboLoraForMode(state))
      return { mode: "none", fellBack: true, reason: "No turbo LoRA set — turbo skipped." };
    if (!installed("MiniMaxH3TurboLoRA"))
      return { mode: "none", fellBack: true, reason: "comfyui-minimax-h3-turbo is not installed — turbo skipped." };
    return { mode: "larryvrh", fellBack: false };
  }

  // lightx2v is a plain LoRA, but without the SLA kernel it was distilled against it
  // contributes nothing but its own load time, so treat a missing SLA pack as a
  // fallback rather than quietly running a LoRA that can't pay off.
  if (!state.slaTurboLora || state.slaTurboLora === "none")
    return { mode: "none", fellBack: true, reason: "No SLA turbo LoRA set — turbo skipped." };
  if (!installed("H3SLAAttention"))
    return { mode: "none", fellBack: true, reason: "H3 SLA Attention is not installed — the lightx2v LoRA gives no speedup without it." };
  return { mode: "lightx2v", fellBack: false };
}

/** Steps this run will actually sample at, given the turbo selection. */
export function effectiveSteps(state, avail) {
  const t = effectiveTurbo(state, avail).mode;
  if (t === "larryvrh") return Math.max(1, Math.round(state.turboSteps ?? 4));
  if (t === "lightx2v") return Math.max(1, Math.round(state.slaTurboSteps ?? 6));
  return Math.max(1, Math.round(state.steps ?? 20));
}

/**
 * Clips are driven by the prompts, not by a duration field: one prompt, one clip.
 *
 *     total clips   = prompts.length
 *     total seconds = total clips x clip length
 *
 * Total length is therefore a readout, never an input: change the clip length or add a
 * prompt and it follows.
 *
 * There used to be a per-prompt repeat count. It only ever resent the same text, so the
 * extra clips re-enacted the same beat with a different seed — to actually carry a scene
 * forward you write the next prompt, and Last Frame Chain continues the picture.
 */
/**
 * Seconds from what someone would actually type for a length: `3:20`, `200`, `200s`,
 * `3m20s`, `3분 20초`. Returns 0 when there is nothing usable, so callers can fall back.
 */
export function parseTargetSeconds(text) {
  const raw = String(text || "").trim().toLowerCase();
  if (!raw) return 0;

  const clock = raw.match(/^(\d+)\s*:\s*([0-5]?\d(?:\.\d+)?)$/);       // 3:20
  if (clock) return (+clock[1]) * 60 + (+clock[2]);

  // 3m20s / 3분 20초 / 3분 / 20초 — either script, both parts optional
  const min = raw.match(/(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes|분)/);
  const sec = raw.match(/(\d+(?:\.\d+)?)\s*(?:s|sec|secs|second|seconds|초)/);
  if (min || sec) return (min ? +min[1] * 60 : 0) + (sec ? +sec[1] : 0);

  const plain = raw.match(/^(\d+(?:\.\d+)?)$/);                         // bare number = seconds
  return plain ? +plain[1] : 0;
}

/** Image → Brief source modes: how many images, and what the brief writer does with them. */
export const IMAGE_BRIEF_MODES = [
  { key: "fl",  label: "First/Last (max 2)", max: 2,
    hint: "image 1 = the starting frame, image 2 = the ending frame — write the brief as a first/last-frame shot" },
  { key: "ref", label: "Reference (max 8)",  max: 8,
    hint: "each image is a <Picture N> reference, in upload order" },
];
export function imageBriefMax(mode) {
  return (IMAGE_BRIEF_MODES.find(m => m.key === mode) || IMAGE_BRIEF_MODES[1]).max;
}

/** { p, i } for every switched-on prompt, `i` = its original position (never renumbered). */
export function activePrompts(state) {
  const list = state.prompts || [{ text: "", firstFrame: "", enabled: true }];
  return list.map((p, i) => ({ p, i })).filter(({ p }) => promptEnabled(p));
}

export function clipPlan(state, clipFramesOverride, avgMinutesPerClip) {
  const frames  = clipFramesOverride ?? state.clipFrames ?? 192;
  const clipSec = framesToSeconds(frames);
  const total   = Math.max(1, (state.prompts || [""]).length);
  const count   = Math.max(0, activePrompts(state).length);
  const avg     = avgMinutesPerClip ?? state.avgMinutesPerClip ?? 13;
  const actualSeconds = count * clipSec;

  // One-Take + auto-stitch: the finished result isn't `count` clips end-to-end — each
  // clip after the first shares `overlap` seconds with the previous one (that's the whole
  // mechanism), and the auto-stitch step trims that overlap out. Same formula as the real
  // stitch in one_node_minimax_h3.js (`totalSeconds = ... - (n-1) * overlapSec`), kept here
  // too so the estimate shown before a run matches what actually gets saved.
  const isOneTakeStitched = state.continuityMode === "onetake" && state.oneTakeAutoStitch !== false;
  const overlapSec = framesToSeconds(alignFrameCount(ONE_TAKE_OVERLAP_FRAMES));
  const stitchedSeconds = count > 1 ? actualSeconds - (count - 1) * overlapSec : actualSeconds;

  return {
    count, clipSec,
    actualSeconds,
    isOneTakeStitched,
    stitchedSeconds,
    estimateMinutes: count * avg,
    promptCount: total,
  };
}

export function formatDuration(minutes) {
  if (!isFinite(minutes) || minutes <= 0) return "—";
  const h = Math.floor(minutes / 60), m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function formatClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

// Portrait (tallest first) → Square → Landscape (widest last), sorted by w/h within
// each group rather than however they were added.
export const ASPECTS = [
  { label: "9:16 Portrait",  w: 9,  h: 16 },
  { label: "2:3 Portrait",   w: 2,  h: 3  },
  { label: "3:4 Portrait",   w: 3,  h: 4  },
  { label: "4:5 Portrait",   w: 4,  h: 5  },
  { label: "1:1 Square",     w: 1,  h: 1  },
  { label: "5:4 Landscape",  w: 5,  h: 4  },
  { label: "4:3 Landscape",  w: 4,  h: 3  },
  { label: "3:2 Landscape",  w: 3,  h: 2  },
  { label: "16:9 Landscape", w: 16, h: 9  },
  { label: "21:9 Cinema",    w: 21, h: 9  },
];

// Mirrors the ResolutionSelector node the source workflow used: pick the WxH that hits
// `megapixels` at the chosen aspect, each axis rounded to a multiple of 32.
export function resolveResolution(aspectLabel, megapixels) {
  const a = ASPECTS.find(x => x.label === aspectLabel) || ASPECTS[0];
  const mp = Math.max(0.1, megapixels || 1.0);
  const target = mp * 1_000_000;
  const ratio = a.w / a.h;
  let h = Math.sqrt(target / ratio);
  let w = h * ratio;
  const snap = v => Math.max(32, Math.round(v / 32) * 32);
  return { width: snap(w), height: snap(h) };
}

export const SAMPLERS = [
  "euler", "euler_ancestral", "heun", "dpmpp_2m", "dpmpp_2m_sde", "dpmpp_3m_sde",
  "ddim", "uni_pc", "res_multistep", "er_sde", "lcm", "deis",
];
export const SCHEDULERS = ["simple", "normal", "karras", "exponential", "sgm_uniform", "beta", "ddim_uniform"];

export const GENERATION_MODES = [
  { key: "t2v",       label: "Text only",        hint: "prompt only (T2VA)" },
  { key: "firstlast", label: "First/Last Frame",  hint: "start + end keyframe (FL2VA)" },
  { key: "reference", label: "Reference",         hint: "up to 9 reference images (REF2VA)" },
];

/** Turn the tensor errors these packs throw into something actionable. */
export function explainGenerationError(message) {
  const m = String(message || "");
  if (/must match the size of tensor b \(2\)/.test(m) || /adaln/i.test(m)) {
    return "The turbo LoRA doesn't match this mode's base model — turbo LoRAs are fl2v-only. "
         + "Switch Acceleration to SolAttn, Spectrum or None.";
  }
  if (/failed to extract audio/i.test(m)) {
    return "A reference video has no audio track but its soundtrack was requested — untick "
         + "\"also use this clip's soundtrack\" for that video.";
  }
  if (/VAEDecodeAudio/i.test(m) && /must match the size of tensor/i.test(m)) {
    return "The audio VAE couldn't decode this latent. Check that the Audio VAE in ⚙ Settings is the "
         + "MiniMax audio VAE and that the mode's UNET matches (Reference needs the Ref2VA model).";
  }
  if (/shape mismatch/i.test(m) && /cannot be broadcast/i.test(m)) {
    return "The sampler rejected the reference tokens. Check the Reference UNET in ⚙ Settings is the "
         + "Ref2VA model, and that Acceleration isn't Turbo.";
  }
  return null;
}
export const ACCEL_MODES  = [
  { key: "turbo",    label: "Turbo LoRA(larryvrh)", node: "MiniMaxH3TurboLoRA", modes: ["t2v", "firstlast", "reference"] },
  { key: "solattn",  label: "SolAttn",    node: "SolAttnPatch" },
  { key: "spectrum", label: "Spectrum",   node: "SpectrumApplyMiniMaxH3" },
  { key: "none",     label: "None",       node: null },
];

/** Acceleration options valid for a generation mode. */
export function accelModesFor(generationMode) {
  return ACCEL_MODES.filter(m => !m.modes || m.modes.includes(generationMode || "t2v"));
}
export const UPSCALE_MODES = [
  { key: "none",  label: "None" },
  { key: "model", label: "Upscale Model" },
  { key: "rtx",   label: "RTX VSR" },
];

// ── pipeline axis options ─────────────────────────────────────────────────────
export const TURBO_MODES = [
  { key: "none",     label: "None" },
  { key: "larryvrh", label: "Turbo LoRA (larryvrh)", node: "MiniMaxH3TurboLoRA" },
  { key: "lightx2v", label: "SLA Turbo (lightx2v)",  node: "H3SLAAttention" },
];
export const ATTN_BACKENDS = [
  { key: "none",          label: "None",                   node: null,                   dense: true },
  { key: "sage",          label: "SageAttention (KJ)",     node: "PathchSageAttentionKJ", dense: true },
  { key: "ck",            label: "CK-Attention",           node: "ModelAttentionBackend", dense: true },
  { key: "solattn_kijai", label: "SolAttn (kijai)",        node: "SolAttnPatch",          dense: false },
  { key: "sla",           label: "H3 SLA Attention",       node: "H3SLAAttention",        dense: false },
];
export const ATTN_FORWARDS = [
  { key: "none",         label: "None",                        node: null,                                          dense: true },
  { key: "memeff_sage",  label: "H3 MemEff Sage (KJ)",         node: "MiniMaxH3MemoryEfficientSageAttentionPatch",  dense: true },
  { key: "solattn_sag",  label: "SolAttn (Saganaki22)",        node: "MiniMaxH3ScheduledSolAttentionPatch",         dense: false },
];
export const BLOCK_CACHES = [
  { key: "none",    label: "None",                   node: null },
  { key: "h3cache", label: "H3 Cache",               node: "MiniMaxH3Cache" },
  { key: "fbcache", label: "H3 FirstBlockCache",     node: "ApplyMiniMaxH3FirstBlockCache" },
];
export const FBC_MODES = [
  "H3 Safe — 0.08 / max 2", "H3 Fast — 0.10 / max 2",
  "H3 Aggressive — 0.12 / max 2", "Custom — manual values",
];

/**
 * Why a pipeline option can't be used right now, or "" when it's fine.
 *
 * The two turbo packs pull in opposite directions and this is the whole reason these
 * axes are gated rather than free-form:
 *
 *   larryvrh runs a 4-step schedule, so a sparse attention kernel's approximation
 *   error lands on a step that carries ~10x its usual weight and the clip falls
 *   apart — dense backends only.
 *
 *   lightx2v is the reverse: it ships an ordinary LoRA distilled *against* the SLA
 *   block-sparse kernel, and the pack's own docs say the LoRA "gives no speedup on
 *   its own" — it needs SLA to be the thing actually skipping work.
 */
export function attnBlockedReason(key, turboMode) {
  const b = ATTN_BACKENDS.find(x => x.key === key);
  if (!b) return "";
  if (turboMode === "larryvrh" && !b.dense)
    return "Turbo LoRA (larryvrh) runs 4 steps — sparse attention's error is too large to absorb there";
  if (turboMode === "lightx2v" && key !== "sla")
    return "SLA Turbo (lightx2v) is distilled against the SLA kernel and needs it to provide the speedup";
  return "";
}
export function attnForwardBlockedReason(key, turboMode, attnBackend) {
  const f = ATTN_FORWARDS.find(x => x.key === key);
  if (!f || key === "none") return "";
  if (turboMode === "larryvrh" && !f.dense)
    return "Turbo LoRA (larryvrh) runs 4 steps — sparse attention's error is too large to absorb there";
  return "";
}

/**
 * Not a block — a note. Replacing blocks[i].attn.forward removes the stock forward, and
 * the stock forward is the only thing that reads `optimized_attention_override`. So when
 * both are on, the override-based backend simply doesn't reach the transformer blocks;
 * it still covers the attention outside them (text refiner, cross-attention).
 *
 * This used to be modelled as the forward patch being illegal, which had it exactly
 * backwards: the forward patch is the faster of the two, and switching it off left the
 * inert one running. Both are legal, so the UI says what happens instead of choosing.
 */
export function attnForwardOverlapNote(key, attnBackend) {
  if (!key || key === "none") return "";
  if (attnBackend === "ck" || attnBackend === "solattn_kijai" || attnBackend === "sla") {
    const name = (ATTN_BACKENDS.find(b => b.key === attnBackend) || {}).label || attnBackend;
    return `${name} only applies outside the transformer blocks here — this forward patch replaces the blocks' own attention.`;
  }
  return "";
}
export function blockCacheBlockedReason(key, turboMode) {
  if (key === "none") return "";
  if (turboMode !== "none")
    return "A turbo schedule is only a handful of steps, which never reaches the threshold these caches reuse steps at";
  return "";
}

/**
 * Carry a workflow saved before the pipeline was split into separate axes.
 *
 * The old `accelMode` held one of turbo/solattn/spectrum/none, while attention and the
 * caches lived in unrelated booleans. Reading those once, on load, keeps an existing
 * workflow rendering the same pipeline it did before instead of silently resetting to
 * defaults. Runs once — `pipelineMigrated` marks it done.
 */
export function migrateLegacyAccel(state) {
  if (state.pipelineMigrated >= PIPELINE_MIGRATION) return false;
  state.pipelineMigrated = PIPELINE_MIGRATION;

  const accel = state.accelMode || "";
  if (accel === "turbo")         state.turboMode = "larryvrh";
  else if (accel === "spectrum") state.useSpectrum = true;
  else if (accel === "solattn")  state.attnBackend = "solattn_kijai";

  // The backend a run was actually configured with wins. SLA used to be its own
  // checkbox alongside these, so mapping it onto the backend dropdown here would take
  // the slot away from the backend the user had picked — and, through the old
  // attnForward gating, take the H3 forward patch down with it. SLA is only adopted
  // when nothing else claimed the slot.
  if (accel !== "solattn") {
    if (state.useCkAttention)      state.attnBackend = "ck";
    else if (state.useSageAttn)    state.attnBackend = "sage";
    else if (state.useSlaAttention) state.attnBackend = "sla";
    else                           state.attnBackend = "none";
  }
  state.attnForward = state.useMemEffSage ? "memeff_sage" : "none";

  if (state.useFirstBlockCache)  state.blockCache = "fbcache";
  else if (state.useCache)       state.blockCache = "h3cache";
  else                           state.blockCache = "none";

  return true;
}
/**
 * How a clip picks up from the one before it.
 *
 * Only FL2VA accepts a first frame, so a continued clip is always rendered by FL2VA
 * whatever the run started as. In Reference mode that means the reference images shape
 * the opening clip and the picture carries the rest. Across every option the common part
 * of the prompt goes to all clips, which is what holds the look together.
 */
export const CONTINUITY_MODES = [
  { key: "none", label: "None",
    hint: "nothing is handed between clips — each one is made from its prompt, on the run's own model; only the common prompt keeps them consistent" },
  // Default (see defaultState) — unlike Last Frame Chain this never forces FL2VA, the
  // run's own mode (Reference included) keeps going. Needs TJ_H3_LatentContinuation +
  // the checkpoint save/load pair from TJ_NODE; gated separately by node availability,
  // not modelAvailability.
  { key: "onetake", label: "One-Take (latent)",
    hint: "each clip's sampled latent tail feeds straight into the next clip's head — no VAE round trip, and the run's own mode (including Reference) carries on unchanged",
    refHint: "each clip's sampled latent tail feeds straight into the next clip's head — reference images keep conditioning every clip, unlike Last Frame Chain which drops them after the first" },
  // Only meaningful in Reference mode — a text-only run has nothing to reference — so
  // it stays in the list (not filtered out) but disabled with a reason otherwise, same
  // treatment as a continuity option whose UNET isn't set.
  { key: "reference", label: "Reference", refOnly: true,
    hint: "every clip re-uses the same reference images — the mode carries on unchanged" },
  { key: "lastframe", label: "Last Frame Chain",
    hint: "each clip starts from the previous clip's final frame",
    refHint: "clips after the first start from the previous clip's final frame (rendered by FL2VA, so the reference images shape the first clip only — the common prompt carries the rest)" },
];

const isSet = (v) => !!v && v !== "none";

/**
 * Which models the settings actually name.
 *
 * Everything downstream keys off this: a mode whose UNET is missing cannot be entered,
 * and a continuity option that would switch to a missing model cannot be chosen. Better
 * to grey the choice out with a reason than to let a run die on a validation error.
 */
export function modelAvailability(state) {
  return {
    fl:  isSet(state.unetFirstLast),
    ref: isSet(state.unetReference),
    clip: isSet(state.clipName),
    vaeVideo: isSet(state.vaeVideo),
    vaeAudio: isSet(state.vaeAudio),
  };
}

/** Everything the settings still need, in the words the Settings panel uses. */
export function configIssues(state) {
  const a = modelAvailability(state);
  const missing = [];
  if (!a.fl && !a.ref) missing.push("a UNET (First/Last or Reference)");
  if (!a.clip)     missing.push("the text encoder");
  if (!a.vaeVideo) missing.push("the video VAE");
  if (!a.vaeAudio) missing.push("the audio VAE");
  return missing;
}

/** Generation modes, with the ones whose model is missing marked unavailable. */
export function generationModesFor(state) {
  const a = modelAvailability(state);
  return GENERATION_MODES.map(m => {
    const ok = m.key === "reference" ? a.ref : a.fl;
    return { ...m, enabled: ok, reason: ok ? "" :
      `Set the ${m.key === "reference" ? "Reference" : "First/Last"} UNET in ⚙ Settings → Models` };
  });
}

/**
 * Continuity choices that make sense for the mode in play. Every option stays in the
 * list — one that doesn't apply right now (Reference-only outside Reference mode, or a
 * model the settings don't name) is shown disabled with a reason instead of vanishing,
 * so the menu order never shifts under the user and a greyed-out option still explains
 * itself. None never switches models, so it is always available — the safe fallback.
 */
export function continuityModesFor(generationMode, state) {
  const isRef = (generationMode || "t2v") === "reference";
  const a = state ? modelAvailability(state) : { fl: true, ref: true };
  const need = { lastframe: "fl", reference: "ref", none: null, onetake: null };
  return CONTINUITY_MODES.map(m => {
    if (m.refOnly && !isRef) {
      return {
        key: m.key, label: m.label, hint: m.hint,
        disabled: true, reason: "Only available in Reference mode",
      };
    }
    const k = need[m.key];
    const ok = !k || a[k];
    return {
      key: m.key,
      label: m.label,
      hint: (isRef && m.refHint) ? m.refHint : m.hint,
      disabled: !ok,
      reason: ok ? "" : `Needs the ${k === "ref" ? "Reference" : "First/Last"} UNET — set it in ⚙ Settings → Models`,
    };
  });
}

export function loadState() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; }
}

/**
 * Write "the settings I last used", stamped with when.
 *
 * The stamp is what lets a node tell a stale copy from a fresh one. A node dropped on the
 * canvas seeds from here, but a node loaded from a saved workflow also carries its own
 * copy from whenever that file was written — and without a way to compare them, opening
 * last week's workflow silently throws away everything configured since. Whichever side
 * is newer wins; see restoreNodeState.
 */
export function saveState(s) {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ ...s, savedAt: Date.now() })); } catch {}
}

/** When the panel was last changed in this browser. 0 when nothing has been saved yet. */
export function lastUsedAt() {
  const v = loadState().savedAt;
  return typeof v === "number" ? v : 0;
}

export function defaultState(saved) {
  saved = saved || {};
  return {
    // models
    unetFirstLast: saved.unetFirstLast || "",
    unetReference: saved.unetReference || "",
    clipName:      saved.clipName      || "",
    vaeVideo:      saved.vaeVideo      || "",
    vaeAudio:      saved.vaeAudio      || "",
    // Turbo LoRAs are trained per base model: an fl2v turbo LoRA on the Ref2VA UNET
    // crashes inside the turbo pack (adaln segment mismatch), so each mode keeps its own
    // slot exactly like the UNETs do.
    turboLora:          saved.turboLora          || "",   // first/last + text-only
    turboLoraReference: saved.turboLoraReference || "",   // reference mode
    turboLoraStrength: saved.turboLoraStrength ?? 1.0,
    turboLoraLowVram:  saved.turboLoraLowVram  ?? false,
    upscaleModel:  saved.upscaleModel  || "",
    // What to ask the LLM for, when you want a piece of a given length rather than
    // however many prompts happen to be in the editor. Briefing only — the run's real
    // length still comes from the prompts it produces.
    targetLength: saved.targetLength || "",

    // Audio Lock — pin the soundtrack instead of letting the model regenerate it
    audioLock:         saved.audioLock         ?? false,
    lockAudioFile:     saved.lockAudioFile     || "",
    audioLockMode:     saved.audioLockMode     || "lock",
    audioLockStrength: saved.audioLockStrength ?? 0.5,
    audioLockFit:      saved.audioLockFit      || "pad_silence",
    audioLockTrimStart: saved.audioLockTrimStart ?? 0,
    audioLockTrimEnd:   saved.audioLockTrimEnd   ?? 0,   // 0 = to the end of the file
    oneTakeAudioOverride: !!saved.oneTakeAudioOverride,

    // Frames the Gallery's manual stitch drops from the head of each clip after the
    // first. Defaults to the overlap plus a small guard, because the seam itself shows a
    // few frames of colour breakup — trimming the overlap exactly would leave it in.
    // The auto-stitch keeps using the bare overlap; this is the knob for re-stitching by
    // hand when the automatic result looks wrong.
    stitchTrimFrames: saved.stitchTrimFrames ?? (ONE_TAKE_OVERLAP_FRAMES + 4),

    loras: Array.isArray(saved.loras) ? saved.loras.map(l => ({
      name: l.name || "none", strength: l.strength ?? 1.0,
      triggerWord: l.triggerWord || "", enabled: l.enabled !== false,
    })) : [],

    // modes
    generationMode: saved.generationMode || "t2v",
    accelMode:      saved.accelMode      || "solattn",   // legacy — kept only so old
                                                         // workflows can be migrated below
    upscaleMode:    saved.upscaleMode    || "none",
    continuityMode: saved.continuityMode || "onetake",
    oneTakeLockAudio: saved.oneTakeLockAudio ?? false,
    oneTakeAutoStitch: saved.oneTakeAutoStitch ?? true,

    // canvas / length
    aspect:      saved.aspect      || "9:16 Portrait",
    megapixels:  saved.megapixels  ?? 1.0,
    clipFrames:  saved.clipFrames  ?? DEFAULT_FRAMES,
    clipLengthCustom:    !!saved.clipLengthCustom,
    clipLengthCustomSec: saved.clipLengthCustomSec ?? framesToSeconds(DEFAULT_FRAMES),
    totalSeconds: saved.totalSeconds ?? 8,
    trimLastClip: saved.trimLastClip ?? false,
    avgMinutesPerClip: saved.avgMinutesPerClip ?? 13,
    unloadBetweenClips: saved.unloadBetweenClips ?? true,

    // prompts — one entry per clip (blank entries reuse the last non-blank one).
    // header/footer are the parts every clip shares (style preamble, ambient/music tail);
    // they are stored apart so splitting into clips never throws them away.
    // Each entry is { text, firstFrame, enabled } — pre-v1.11 saves/workflows stored plain
    // strings, so a string entry is wrapped here on load (this is the one place that happens).
    prompts: (Array.isArray(saved.prompts) && saved.prompts.length ? saved.prompts : [""])
      .map(p => (typeof p === "string"
        ? { text: p, firstFrame: "", enabled: true }
        : { text: p?.text || "", firstFrame: p?.firstFrame || "", enabled: p?.enabled !== false })),
    // clips rendered per prompt (>1 continues the same description across chained clips)
    promptHeader: saved.promptHeader || "",
    promptFooter: saved.promptFooter || "",
    promptSuffix: saved.promptSuffix || "",

    // images
    firstFrameImage: saved.firstFrameImage || null,
    lastFrameImage:  saved.lastFrameImage  || null,
    // 0 = send as uploaded (no resize). Per-card override for the size sent to the model.
    firstFrameMp: saved.firstFrameMp ?? 1.0,
    lastFrameMp:  saved.lastFrameMp  ?? 1.0,
    refImages: Array.isArray(saved.refImages) ? saved.refImages.slice(0, 9) : [],
    refImagesMp: Array.isArray(saved.refImagesMp) ? saved.refImagesMp.slice(0, 9) : [],
    refImageSize: saved.refImageSize || "match",
    // Reference videos / audios (REF2VA). The model takes up to 3 of each; videos are
    // fed as 24fps frames plus, optionally, their own soundtrack. start/end are seconds
    // — the trained window for a reference video is ~2-15s, so clipping matters.
    refVideos: Array.isArray(saved.refVideos) ? saved.refVideos.slice(0, 3).map(v => ({
      file: v.file || "", start: v.start ?? 0, end: v.end ?? 5, withAudio: v.withAudio !== false,
    })) : [],
    refAudios: Array.isArray(saved.refAudios) ? saved.refAudios.slice(0, 3).map(a => ({
      file: a.file || "", start: a.start ?? 0, end: a.end ?? 5,
    })) : [],
    // which reference kinds are shown in the side panel (keeps it short by default)
    refTypes: {
      images: saved.refTypes?.images !== false,
      videos: saved.refTypes?.videos ?? false,
      audios: saved.refTypes?.audios ?? false,
    },

    // sampling
    steps:       saved.steps       ?? 20,
    turboSteps:  saved.turboSteps  ?? 4,
    sampler:     saved.sampler     || "res_multistep",
    scheduler:   saved.scheduler   || "simple",
    denoise:     saved.denoise     ?? 1.0,
    seed:        saved.seed        ?? 0,
    seedMode:    saved.seedMode    || "randomize",
    seedPerClip: saved.seedPerClip ?? true,
    shiftVideo:  saved.shiftVideo  ?? 12,
    shiftAudio:  saved.shiftAudio  ?? 3,

    // model patches (defaults lifted from the reference workflow)
    useSageAttn:   saved.useSageAttn   ?? true,
    sageAttnMode:  saved.sageAttnMode  || "auto",
    useCkAttention:    saved.useCkAttention    ?? false,
    ckAttentionBackend: saved.ckAttentionBackend || "comfy_kitchen",
    useSlaAttention:   saved.useSlaAttention   ?? false,
    slaSparsity:       saved.slaSparsity       ?? 0.90,
    slaBlockSize:      saved.slaBlockSize      || "64",
    slaMinSeqLen:      saved.slaMinSeqLen      ?? 8192,
    slaDenseLastSteps: saved.slaDenseLastSteps ?? 0,
    slaProtectAudio:   saved.slaProtectAudio   ?? true,
    slaRunEnabled:     saved.slaRunEnabled     ?? true,
    useMemEffSage: saved.useMemEffSage ?? true,
    useTorchPatch: saved.useTorchPatch ?? true,
    fp16Accum:     saved.fp16Accum     ?? true,
    useCache:            saved.useCache            ?? true,
    useFirstBlockCache:  saved.useFirstBlockCache   ?? false,
    // ApplyMiniMaxH3FirstBlockCache tuning — manual fields only apply when fbcMode is
    // the custom option; the three named presets ignore them (the node's own behavior).
    fbcMode:           saved.fbcMode           || "H3 Fast — 0.10 / max 2",
    fbcThreshold:      saved.fbcThreshold      ?? 0.10,
    fbcStartPercent:   saved.fbcStartPercent   ?? 0.10,
    fbcEndPercent:     saved.fbcEndPercent     ?? 0.95,
    fbcMaxHits:        saved.fbcMaxHits        ?? 2,
    fbcTemporalGuard:  !!saved.fbcTemporalGuard,

    // ── pipeline axes ────────────────────────────────────────────────────────
    // One control per patch layer, instead of the old single `accelMode` that mixed
    // weights (turbo), attention (solattn) and step-forecasting (spectrum) into one
    // dropdown — see migrateLegacyAccel() for how old workflows are carried over.
    //
    //   turboMode   none | larryvrh | lightx2v      weights + step count
    //   attnBackend none | sage | ck | solattn_kijai | sla
    //                                               transformer_options override slot
    //   attnForward none | memeff_sage | solattn_sag
    //                                               blocks[i].attn.forward object patch
    //   blockCache  none | h3cache | fbcache        block-output reuse across steps
    //   useSpectrum bool                            latent-level step forecasting
    //   useFusedModulation bool                     blocks[i].forward AdaLN fusion
    //
    // Every one of these except turboMode/useSpectrum is independent of the others;
    // the UI greys out the combinations that are known to break (see attnAllowedFor).
    // A brand-new node starts already migrated; only a `saved` blob from before the
    // split needs migrateLegacyAccel() to run over it.
    // When this state was last written. Kept through normalize so the value a node
    // serialises into a workflow can be compared against the browser's own.
    savedAt: typeof saved.savedAt === "number" ? saved.savedAt : 0,
    pipelineMigrated: saved.pipelineMigrated === true ? 1
                    : (saved.pipelineMigrated ?? (saved.accelMode == null ? PIPELINE_MIGRATION : 0)),
    turboMode:   saved.turboMode   || "none",
    attnBackend: saved.attnBackend || "sage",
    attnForward: saved.attnForward || "memeff_sage",
    blockCache:  saved.blockCache  || "none",
    useSpectrum: saved.useSpectrum ?? false,
    useFusedModulation: saved.useFusedModulation ?? false,

    // lightx2v SLA turbo: an ordinary LoRA, but it only pays off with the SLA
    // attention kernel it was distilled against ("the LoRA's job is to make the model
    // tolerate the sparsity, not to provide it"), so it lives with the turbo controls
    // rather than in the generic LoRA slots.
    slaTurboLora:     saved.slaTurboLora     || "none",
    slaTurboStrength: saved.slaTurboStrength ?? 1.0,
    slaTurboSteps:    saved.slaTurboSteps    ?? 6,

    // SolAttn (Saganaki22) — blocks[i].attn.forward, tau ramped across sampling
    solSagTauStart:    saved.solSagTauStart    ?? 1.3,
    solSagTauEnd:      saved.solSagTauEnd      ?? 0.8,
    solSagCurve:       saved.solSagCurve       || "linear",
    solSagMinTokens:   saved.solSagMinTokens   ?? 4096,
    solSagStrict:      !!saved.solSagStrict,
    solSagDensePercent: saved.solSagDensePercent ?? 0.0,
    solSagThreshType:  saved.solSagThreshType  || "diag",
    solSagInt8Qk:      !!saved.solSagInt8Qk,
    solSagInt8Pv:      !!saved.solSagInt8Pv,
    solSagSinkCond:    saved.solSagSinkCond    || "exact_kv",
    solSagDenseBlocks: saved.solSagDenseBlocks || "",

    // Which left-panel sections are expanded. Persisted so a reopened workflow looks
    // the way it was left instead of springing every section back open.
    accordion: Object.assign({
      turbo: false, attn: false, cache: false, spectrum: false, patches: false,
      upscale: false, continuity: false, audiolock: false, images: false, lora: false,
    }, saved.accordion || {}),

    cacheThreshold: saved.cacheThreshold ?? 0.3,
    cacheStart:     saved.cacheStart     ?? 0.15,
    cacheEnd:       saved.cacheEnd       ?? 0.9,
    cacheMaxSteps:  saved.cacheMaxSteps  ?? 2,
    solTau:        saved.solTau        ?? 1.3,
    solStart:      saved.solStart      ?? 0.2,
    solEnd:        saved.solEnd        ?? 0.9,
    solMinTokens:  saved.solMinTokens  ?? 4096,
    // Spectrum (SpectrumApplyMiniMaxH3) — node defaults
    specBlendWeight:  saved.specBlendWeight  ?? 0.5,
    specDegree:       saved.specDegree       ?? 1,
    specRidgeLambda:  saved.specRidgeLambda  ?? 0.1,
    specWindowSize:   saved.specWindowSize   ?? 2.0,
    specFlexWindow:   saved.specFlexWindow   ?? 0.75,
    specWarmupSteps:  saved.specWarmupSteps  ?? 1,
    specTailSteps:    saved.specTailSteps    ?? 1,
    specMaxHistory:   saved.specMaxHistory   ?? 8,
    specHistoryStore: saved.specHistoryStore || "system_ram",

    // upscale params
    rtxScale:   saved.rtxScale   ?? 2.0,
    rtxQuality: saved.rtxQuality || "ULTRA",

    // preview (ModelPreviewOverrideKJ)
    previewEnabled:  saved.previewEnabled  ?? true,
    previewFrames:   saved.previewFrames   ?? 8,
    previewFps:      saved.previewFps      ?? 12,
    previewMaxRes:   saved.previewMaxRes   ?? 512,
    previewQuality:  saved.previewQuality  ?? 85,
    previewTinyVae:  saved.previewTinyVae  || "none",

    // Ollama prompt enhance — ollamaModel writes the brief (text only, never sees an
    // image); ollamaVisionModel is the separate model that looks at uploaded images.
    // A vision-capable brief writer would work fine too, but keeping the roles apart
    // means any text model can write the brief, and a multi-image request never has to
    // rely on a model attending to more than one image at once (see PART C0 — tested,
    // that fails; images are analyzed one at a time and merged as text instead).
    ollamaUrl:         saved.ollamaUrl         || "http://127.0.0.1:11434",
    ollamaModel:       saved.ollamaModel       || "",
    ollamaVisionModel: saved.ollamaVisionModel || "",
    ollamaTemperature: saved.ollamaTemperature ?? 0.7,
    ollamaTopP:        saved.ollamaTopP        ?? 0.9,
    // Image → Brief source images. "fl" caps at 2 (first/last frame), "ref" at 8
    // (<Picture N> tags). Order is upload order and becomes the Image N numbering.
    ollamaImageMode:   saved.ollamaImageMode   || "ref",
    ollamaImages:      Array.isArray(saved.ollamaImages) ? saved.ollamaImages.slice()
                      : (saved.ollamaImage ? [saved.ollamaImage] : []),   // migrate the old single-image field

    // Where Image → Brief's two calls (vision analysis, brief writing) actually run.
    // "ollama" hits the external server, same as it always has. "native" batches the
    // images through TextGenerate on a CLIP already loaded in ComfyUI — proven to
    // attend to every image in the batch correctly, unlike Ollama's images[] array
    // (see SPEC_MINIMAX_H3_NEXT_ROUND.md §C0 vs §C5) — and needs no separate server.
    // Each role still gets its own model, same shape as the Ollama pair: a vision
    // checkpoint and a brief-writing checkpoint, picked independently.
    visionSource:    saved.visionSource    || "ollama",   // "ollama" | "native"
    nativeVisionClip: saved.nativeVisionClip || "Qwen3\\qwen_3vl_8b_nvfp4.safetensors",
    nativeBriefClip:  saved.nativeBriefClip  || "LTX\\gemma4_e2b_it_bf16.safetensors",

    // output
    saveSubfolder: saved.saveSubfolder || "",
    filenamePrefix: saved.filenamePrefix || "MMH3",
    stitchAtEnd:   saved.stitchAtEnd   ?? true,
  };
}

export function el(tag, props, children) {
  const node = document.createElement(tag);
  if (props) {
    for (const k in props) {
      if (k === "style") Object.assign(node.style, props.style);
      else if (k === "text") node.textContent = props.text;
      else if (k === "html") node.innerHTML = props.html;
      else if (k.startsWith("on") && typeof props[k] === "function") node.addEventListener(k.slice(2), props[k]);
      else node.setAttribute(k, props[k]);
    }
  }
  (children || []).forEach(c => { if (c) node.appendChild(c); });
  return node;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
export function randomSeed() { return Math.floor(Math.random() * 1e15); }

// A MiniMax brief is three parts, not just a list of shots: a preamble that sets the
// visual style and opening composition, the [Shot N] blocks, and trailing
// "Ambient sound:" / "Music:" paragraphs. The preamble and tail apply to every clip, so
// they are kept aside and re-attached at queue time instead of being split away.
const SHOT_LINE_RE = /^[ \t]*\[(?:Shot|SHOT|샷)[ \t]*\d+\][^\n]*$/gm;
const TAIL_RE = /^[ \t]*(?:Ambient sound|Ambience|Sound|Music|Soundtrack|배경음|음악|사운드)[ \t]*:/i;

/** Split a brief into { header, shots[], footer }. Never loses text. */
export function parseBrief(text) {
  const raw = String(text || "").trim();
  if (!raw) return { header: "", shots: [], footer: "" };

  SHOT_LINE_RE.lastIndex = 0;
  const starts = [];
  let m;
  while ((m = SHOT_LINE_RE.exec(raw)) !== null) starts.push(m.index);

  if (!starts.length) {
    // No shot markers — fall back to `---` groups, else treat the whole thing as one shot.
    const parts = raw.split(/^\s*-{3,}\s*$/m).map(s => s.trim()).filter(Boolean);
    return parts.length > 1
      ? { header: "", shots: parts, footer: "" }
      : { header: "", shots: [raw], footer: "" };
  }

  const header = raw.slice(0, starts[0]).trim();
  const blocks = starts.map((s, i) => raw.slice(s, i + 1 < starts.length ? starts[i + 1] : undefined).trim());

  // The tail lives inside the last block; cut it at the first "Ambient sound:"-style line.
  let footer = "";
  const last = blocks[blocks.length - 1];
  const lines = last.split("\n");
  let cut = -1;
  for (let i = 1; i < lines.length; i++) {
    if (TAIL_RE.test(lines[i])) { cut = i; break; }
  }
  if (cut > 0) {
    blocks[blocks.length - 1] = lines.slice(0, cut).join("\n").trim();
    footer = lines.slice(cut).join("\n").trim();
  }
  return { header, shots: blocks.filter(Boolean), footer };
}

/**
 * Group shots into `groups` clips. `breaks` is a set of shot indices that start a new
 * clip; when omitted the shots are spread as evenly as possible.
 */
export function groupShots(shots, groups, breaks) {
  if (!shots.length) return [];
  if (breaks && breaks.length) {
    const cuts = [...new Set(breaks)].filter(i => i > 0 && i < shots.length).sort((a, b) => a - b);
    const out = [];
    let prev = 0;
    for (const c of cuts) { out.push(shots.slice(prev, c)); prev = c; }
    out.push(shots.slice(prev));
    return out.map(g => g.join("\n\n"));
  }
  const n = Math.max(1, Math.min(groups || 1, shots.length));
  const per = Math.ceil(shots.length / n);
  const out = [];
  for (let i = 0; i < shots.length; i += per) out.push(shots.slice(i, i + per).join("\n\n"));
  return out;
}

/** Default break points that spread `count` shots over `groups` clips. */
export function evenBreaks(count, groups) {
  const n = Math.max(1, Math.min(groups || 1, count));
  const per = Math.ceil(count / n);
  const b = [];
  for (let i = per; i < count; i += per) b.push(i);
  return b;
}

/** Text of a prompt entry — entries may still be plain strings (pre-migration data in flight). */
export const promptText = (p) => (typeof p === "string" ? p : (p?.text || ""));
/** Per-clip first-frame override of a prompt entry, or "" if none set. */
export const promptFirstFrame = (p) => (typeof p === "string" ? "" : (p?.firstFrame || ""));
/** Whether a prompt entry is switched on (default true — plain-string/legacy entries are always on). */
export const promptEnabled = (p) => (typeof p === "string" ? true : p?.enabled !== false);

/** What actually gets sent for clip `i`: common header + that clip's shots + common tail. */
export function composeClipPrompt(state, i) {
  const list = state.prompts || [];
  let body = "";
  for (let k = Math.min(i, list.length - 1); k >= 0; k--) {
    const t = promptText(list[k]).trim();
    if (t) { body = t; break; }
  }
  return [state.promptHeader, body, state.promptFooter, loraTriggers(state), state.promptSuffix]
    .map(s => (s || "").trim()).filter(Boolean).join("\n\n");
}

/**
 * Trigger words of the LoRAs that are switched on, as one line.
 *
 * A LoRA that needs a trigger does nothing without it, so the words ride along with
 * every clip's prompt — the same arrangement the image nodes use. Switching a LoRA off
 * drops both its weights and its words.
 */
export function loraTriggers(state) {
  return (state.loras || [])
    .filter(l => l && l.enabled !== false && l.name && l.name !== "none" && l.triggerWord)
    .map(l => String(l.triggerWord).trim())
    .filter(Boolean)
    .join(", ");
}

// Kept for the plain "split this text" path (no header/footer awareness).
export function splitBrief(text, clipCount) {
  const { header, shots, footer } = parseBrief(text);
  if (!shots.length) return [];
  const groups = groupShots(shots, clipCount || shots.length);
  if (!header && !footer) return groups;
  return groups.map((g, i) => [i === 0 ? header : "", g, i === groups.length - 1 ? footer : ""]
    .filter(Boolean).join("\n\n"));
}

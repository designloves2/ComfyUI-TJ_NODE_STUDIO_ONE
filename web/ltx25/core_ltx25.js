// core_ltx25.js — LTX 2.5 ONE STUDIO (TJ) constants, state, helpers
import { bilingualSlots } from "../shared/bilingual.js";
export const BRAND = "#7612DA";   // pack-wide TJ purple, same as every other ONE STUDIO node
export const C = {
  lime: BRAND, bg0: "#0b0b0b", bg1: "#111111", bg2: "#181818",
  bg3: "#222222", border: "#2a2a2a", borderH: "#3c3c3c",
  text: "#dedede", muted: "#565656", dim: "#2e2e2e",
  warn: "#ffb347", err: "#ff6767", ok: "#5fd38d",
};

// LEFT_W / NODE_W move together (keeps the right column's own width unchanged) — user:
// 380 -> 330 -> 340.
export const NODE_W       = 1280;   // widened 25% from 1000, then adjusted alongside LEFT_W — the right column is flex:1, so the extra width goes to the preview
export const PREVIEW_SIZE = 620;
export const LEFT_W       = 340;
export const PAD          = 12;
export const SUBFOLDER    = "one_ltx25";
// Every preview run (Postprocess's, and any other mode's later) that opts out of the
// real output/ gallery writes here instead, under ComfyUI's own temp/ dir — one fixed
// folder so Settings → Output can report its total size and clear it in one shot.
export const TEMP_PREVIEW_SUBFOLDER = "one_ltx25_preview";
export const API          = "/ltx25_one";
export const LS_KEY       = "ltx25_one_state_v1";
// Bump to re-run migrateLegacyAccel once on the next load, when a past revision of it
// left states wrong. v1 = original boolean flag; v2 = SLA no longer hijacks the backend.
export const PIPELINE_MIGRATION = 2;

export const FPS = 24;

// The LTX video latent takes frame counts on the 8n+1 grid. The ladder offers whole
// seconds (24 s + 1 frames, which is on the grid) from 2 s to 20 s.
export const CLIP_LENGTHS = (() => {
  const out = [];
  for (let sec = 2; sec <= 20; sec++) {
    const n = sec * FPS + 1;
    out.push({ frames: n, seconds: sec, label: `${sec} s  (${n}f)` });
  }
  return out;
})();
export const DEFAULT_FRAMES = 121;   // 5 s

export function framesToSeconds(frames) { return frames / FPS; }

/** The nearest frame count on the 8n+1 grid (at least 9). */
export function alignFrameCount(n) {
  return Math.max(9, 8 * Math.round((n - 1) / 8) + 1);
}

// Per-clip time override (Prompt Edit): a clip with `timeOverride` on renders `timeSec` seconds
// (1 s up) instead of the global clip length. The model only takes 8n+1 frames, so the length
// snaps to the nearest such count; the top is the global list's longest clip.
export const CLIP_MAX_FRAMES = 481;
// Clip times are handled in half-second steps: a typed or computed value in between rounds to the
// nearest half second (a tie goes up), from 1 s to 20 s.
export const snapHalf = (sec) => Math.round(sec * 2) / 2;
export const snapClipSec = (sec) => Math.min(20, Math.max(1, snapHalf(sec)));
// A typed length is first turned into the frame count the model can really render (nearest 8n+1),
// and that real length - in half seconds - is what gets stored, so the box, the CLIPS list and the
// render always agree.
export function clipSecForTyped(sec) {
  return snapClipSec(alignFrameCount(sec * FPS) / FPS);
}
export function clipFramesFor(state, i) {
  const p = (state.prompts || [])[i];
  if (p && typeof p === "object" && p.timeOverride && p.timeSec > 0) {
    return Math.min(CLIP_MAX_FRAMES, alignFrameCount(snapClipSec(p.timeSec) * FPS));
  }
  return state.clipFrames ?? DEFAULT_FRAMES;
}
export function clipSecondsFor(state, i) { return framesToSeconds(clipFramesFor(state, i)); }

/** Running clock of the run, in half-second steps: { start, end, sec } per prompt; a switched-off clip has start/end null.
 *  `sec` is the planned length (what was typed, or the global length); the frames really rendered are clipFramesFor().
 *  With Continuity = One-Take each clip after the first shares 1.625 s (39 frames) with the one before it, so the finished
 *  video is shorter: fstart / fend are the clip's place in that stitched video (null otherwise). */
export const ONE_TAKE_OVERLAP_SEC = 39 / 24;
export function clipTimeline(state) {
  let t = 0, ft = 0, first = true;
  const oneTake = state.continuityMode === "onetake";
  return (state.prompts || []).map((p, i) => {
    const o = p && typeof p === "object" && p.timeOverride && p.timeSec > 0;
    const sec = o ? snapClipSec(p.timeSec) : snapHalf(framesToSeconds(state.clipFrames ?? DEFAULT_FRAMES));
    if (!promptEnabled(p)) return { start: null, end: null, sec, fstart: null, fend: null };
    const row = { start: t, end: t + sec, sec, fstart: null, fend: null };
    if (oneTake) {
      row.fstart = ft;
      row.fend = ft + (first ? sec : Math.max(0, sec - ONE_TAKE_OVERLAP_SEC));
      ft = row.fend; first = false;
    }
    t += sec;
    return row;
  });
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
 * 7+1 hi-res finish: the first 7 of the 8 turbo steps run at Start MP, the latent is scaled
 * up, and the last step refines it at Final MP. Only exists with Turbo LoRA (Basic).
 */
export function hiresActive() { return true; }

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
  const actualSeconds = activePrompts(state).reduce((sum, { i }) => sum + (clipFramesOverride != null ? clipSec : clipSecondsFor(state, i)), 0);

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
/**
 * RTX Video Super Resolution's own node has two native input shapes: a scale
 * multiplier, or an exact target width/height (which it resizes to directly — no crop,
 * so a mismatched aspect ratio stretches). This adds two more convenience input modes
 * on top of those two: "short"/"long" take one side's target pixel count and compute
 * the other from the source's own aspect ratio (so the result is always an exact
 * width/height pair with no distortion, no crop needed), while "wh" is the node's own
 * exact-size mode with a forced center/edge crop added first so an aspect mismatch
 * there never stretches either.
 *
 * `srcW`/`srcH` is whatever this RTX pass will actually receive - the H3 render's own
 * target resolution for the main pipeline, the original source clip for LTX Upscale
 * (treated as a standalone step, not chained through LTX's own scale), or a gallery
 * file's own probed size.
 */
export function computeRtxTarget(state, srcW, srcH) {
  const mode = state.rtxSizeMode || "scale";
  const round8 = v => Math.max(8, Math.round(v / 8) * 8);
  if (mode === "short" || mode === "long") {
    const short = Math.min(srcW, srcH), long = Math.max(srcW, srcH);
    const target = Math.max(8, Math.round(mode === "short" ? (state.rtxShort ?? 1080) : (state.rtxLong ?? 1920)));
    const otherTarget = mode === "short" ? target * (long / short) : target * (short / long);
    const isWSide = srcW <= srcH;   // portrait: W is the short side; landscape: W is the long side
    const width  = mode === "short" ? (isWSide ? target : round8(otherTarget)) : (isWSide ? round8(otherTarget) : target);
    const height = mode === "short" ? (isWSide ? round8(otherTarget) : target) : (isWSide ? target : round8(otherTarget));
    return { resizeType: "target dimensions", width: round8(width), height: round8(height), crop: null };
  }
  if (mode === "wh") {
    const width = round8(Math.max(8, Math.round(state.rtxW ?? 1920)));
    const height = round8(Math.max(8, Math.round(state.rtxH ?? 1080)));
    // Crop the source down to the target's aspect ratio first — center by default, or
    // pinned to one edge — so the node's own exact-size resize never has to stretch.
    const targetAspect = width / height, srcAspect = srcW / srcH;
    let cropW = srcW, cropH = srcH;
    if (srcAspect > targetAspect) cropW = Math.round(srcH * targetAspect);
    else if (srcAspect < targetAspect) cropH = Math.round(srcW / targetAspect);
    const anchor = state.rtxCropAnchor || "center";
    const x = anchor === "left" ? 0 : anchor === "right" ? srcW - cropW : Math.round((srcW - cropW) / 2);
    const y = anchor === "top" ? 0 : anchor === "bottom" ? srcH - cropH : Math.round((srcH - cropH) / 2);
    const crop = (cropW < srcW || cropH < srcH) ? { x, y, width: cropW, height: cropH } : null;
    return { resizeType: "target dimensions", width, height, crop };
  }
  // "scale" — the node's own multiplier mode, unchanged from before this feature.
  return { resizeType: "scale by multiplier", scale: state.rtxScale ?? 2.0, crop: null };
}

export function resolveResolution(aspectLabel, megapixels) {
  // "832:1216" is a shape taken from an image (Image to Video follows the frame it is given)
  const fromImage = /^(\d+):(\d+)$/.exec(String(aspectLabel));
  const a = ASPECTS.find(x => x.label === aspectLabel) || (fromImage ? { w: +fromImage[1], h: +fromImage[2] } : ASPECTS[0]);
  const mp = Math.max(0.1, megapixels || 1.0);
  const target = mp * 1_000_000;
  const ratio = a.w / a.h;
  let h = Math.sqrt(target / ratio);
  let w = h * ratio;
  const snap = v => Math.max(64, Math.round(v / 64) * 64);
  return { width: snap(w), height: snap(h) };
}

export const SAMPLERS = [
  "euler", "euler_ancestral", "heun", "dpmpp_2m", "dpmpp_2m_sde", "dpmpp_3m_sde",
  "ddim", "uni_pc", "res_multistep", "er_sde", "lcm", "deis",
];
export const SCHEDULERS = ["simple", "normal", "karras", "exponential", "sgm_uniform", "beta", "ddim_uniform"];

export const GENERATION_MODES = [
  { key: "t2v",         label: "Text To Video",       hint: "prompt only" },
  { key: "firstlast",   label: "Image to Video (F/L)", hint: "first and/or last frame image + prompt" },
  { key: "director",    label: "LTX Director",  hint: "segment timeline: a prompt per beat, images and audio placed in time" },
  { key: "postprocess", label: "Postprocess",   hint: "chain Deblur/Denoise/Upscale/Grain/Interpolate/Resize on an existing clip" },
];

// The ✨ button's default system prompt — a ready-to-use LTX-2.5 prompt author, written
// to the LTX-2.5 prompt guide (ltx.io/blog/ltx-2-5-prompt-guide): one detailed
// present-tense paragraph, action first, then details, then camera, then lighting/mood,
// natural language, no keyword lists or quality boosters. It is shown one still frame
// from the source clip and returns the prompt for a light refine pass, so it must
// describe the clip that already exists. Editable in Settings but works as-is — the
// user should not have to write it.
export const LTX_UPSCALE_LLM_PROMPT =
  "You write prompts for the LTX-2.5 video model, following the official LTX-2.5 prompt "
  + "guide. You are given SEVERAL still frames sampled across a short existing clip, in "
  + "chronological order (evenly spread from near the start to near the end) — use every "
  + "frame together to read the actual motion, action and camera movement across the shot, "
  + "not just the first one. The clip is about to go through a light 2x upscale + refine at "
  + "low denoise, so your prompt must describe the clip that ALREADY EXISTS — not a new "
  + "idea, no new cuts, no camera move that is not already visible across these frames, and "
  + "nothing that isn't shown or clearly implied by how the frames change.\n\n"
  + "Write ONE flowing present-tense paragraph, about 4-8 sentences (~60-120 words), that "
  + "covers these six elements in this order:\n"
  + "1. Establish the shot — shot scale and angle that match the framing shown (wide / "
  + "medium / medium close-up / close-up; low / high / eye-level / over-the-shoulder).\n"
  + "2. Set the scene — lighting condition and direction, colour palette, key textures, "
  + "atmosphere (haze, fog, rain, dust, bokeh). One coherent light logic across the frames.\n"
  + "3. Describe the action — the main action as one natural sequence, reading how it "
  + "actually progresses from the first sampled frame to the last.\n"
  + "4. Define the character(s) — age, hairstyle, clothing, distinguishing features, props. "
  + "Show emotion through physical cues (jaw tightens, shoulders drop, a slow exhale), "
  + "never abstract labels like 'sad' or 'angry'.\n"
  + "5. Camera movement — compare the framing across the frames to name how and when the "
  + "camera actually moves (static frame, slow push-in, pull back, pan across, tilt, "
  + "tracking, handheld, orbit) rather than guessing; describe how the subject ends up "
  + "framed by the last frame.\n"
  + "6. Audio — ambient sound, music, and any speech. Put spoken lines in quotation marks "
  + "and name the language/accent. If the frames give no basis for sound, use one short "
  + "plausible ambient sentence.\n\n"
  + "Natural cinematic language only. No bullet points, no keyword lists, no parenthetical "
  + "weights, no \"masterpiece / 4k / best quality\" boosters, no negative phrasing, and "
  + "never mention upscaling, resolution, the refine pass, or that you were given multiple "
  + "frames. Output only the paragraph.";

// The "H3 → LTX 2.5" button's default instruction. A gallery clip's saved prompt is in
// MiniMax H3's structured brief format (technical_settings / subject_definitions /
// <Subject N> tokens / summary / detailed_description / retention_analysis / audio
// sections). This converts that into a plain LTX-2.5 prompt. Text-only, no image needed.
export const LTX_CONVERT_LLM_PROMPT =
  "The text below is a MiniMax-H3 video brief: a structured document with sections like "
  + "technical_settings, subject_definitions, <Subject 1> / <Reference Image N> tokens, "
  + "summary, detailed_description, retention_analysis, and audio sections. Rewrite it as a "
  + "single prompt for the LTX-2.5 video model, following the official LTX-2.5 prompt guide.\n\n"
  + "Keep every subject and their exact appearance and wardrobe, their left-to-right order, "
  + "the setting, the lighting, the camera move, the shot progression and the sound. Resolve "
  + "the <Subject N> / <Reference Image N> tokens to plain descriptions. Drop the H3 "
  + "headings, the reference-image bookkeeping, the retention_analysis and the "
  + "technical_settings line; fold the structured audio block into one plain audio sentence.\n\n"
  + "Produce ONE flowing present-tense paragraph, about 4-8 sentences (~60-130 words), "
  + "covering the six LTX-2.5 elements in order: (1) establish the shot (scale + angle); "
  + "(2) set the scene (lighting, palette, textures, atmosphere, one light logic); (3) "
  + "describe the action as one natural sequence; (4) define the character(s) with emotion "
  + "shown through physical cues, not labels; (5) camera movement — how and when it moves, "
  + "and how the subject is framed afterward; (6) audio — ambient, music and any speech, "
  + "with spoken lines in quotation marks and the language/accent named. If the brief has "
  + "real cuts, write it as one chronological paragraph and name each transition in prose. "
  + "Natural cinematic language only — no bullet points, no keyword lists, no quality "
  + "boosters, no negative phrasing. Output only the paragraph.";

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
export const UPSCALE_MODES = [
  { key: "none",     label: "None" },
  { key: "model",    label: "Upscale Model" },
  { key: "rtx",      label: "RTX VSR" },
  { key: "flashvsr", label: "FlashVSR VSR" },
];
// FlashVSRInitPipe's own combo choices (lihaoyun6/ComfyUI-FlashVSR_Ultra_Fast) — read
// straight off /object_info/FlashVSRInitPipe, not guessed.
export const FLASHVSR_MODELS = ["FlashVSR", "FlashVSR-v1.1"];
export const FLASHVSR_MODES  = ["tiny", "tiny-long", "full"];

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

export function blockCacheBlockedReason(key, turboMode) {
  if (key === "none") return "";
  if (turboMode !== "none")
    return "A turbo schedule is only a handful of steps, which never reaches the threshold these caches reuse steps at";
  return "";
}

/**
 * H3-Optimizations axis.
 *
 * Plain Memory Opt is pure VRAM/execution and yields gracefully to anything that already
 * patched the attention (H3-Optimizations detects a foreign `blocks[i].attn.forward` and
 * skips that block — never overwrites, never errors), keeping its MLP / FinalLayer / embedding
 * savings. So it is never blocked.
 *
 * The Sparse stage IS the attention, so it can only work when it owns `attn.forward`:
 *  - out under any turbo schedule (too few steps to average its approximation away),
 *  - not stacked on a backend that is already sparse,
 *  - not stacked on an H3 forward patch — that patch keeps `attn.forward` and the sparse
 *    routing goes inert on every block. Fall back to plain Memory Opt.
 */
export function h3OptimizerBlockedReason(key, turboMode, attnBackend, attnForward) {
  if (!key || key === "none" || key === "memory") return "";
  if (key === "memory_sparse") {
    if (turboMode && turboMode !== "none")
      return "The Sparse stage approximates attention — a few-step turbo schedule can't absorb that. Use plain H3 Memory Opt.";
    if (attnBackend === "solattn_kijai" || attnBackend === "sla")
      return "The attention backend is already sparse — H3 Sparse on top double-sparsifies. Use plain H3 Memory Opt.";
    if (attnForward && attnForward !== "none")
      return "An H3 attention-forward patch keeps the blocks' attention — H3 Sparse can't route around it. Use plain H3 Memory Opt.";
  }
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

  // Legacy state.useCache mapped to the H3 Cache pack, which is gone (it global-patches
  // an older core forward and breaks H3 on ComfyUI 0.35+). FirstBlockCache is the survivor.
  if (state.useFirstBlockCache)  state.blockCache = "fbcache";
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
    hint: "nothing is handed between clips - each one is made from its prompt; only the common prompt keeps them consistent" },
  { key: "lastframe", label: "Last Frame Chain",
    hint: "each clip starts from the previous clip's final frame" },
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
    fl:  isSet(state.ltxUnet),
    ref: false,
    clip: isSet(state.ltxClip),
    vaeVideo: isSet(state.ltxVaeVideo),
    vaeAudio: isSet(state.ltxVaeAudio),
    upscaler: isSet(state.ltxLatentUpscaler),
  };
}

/** Everything the settings still need, in the words the Settings panel uses. */
export function configIssues(state) {
  const a = modelAvailability(state);
  const missing = [];
  if (!a.fl)       missing.push("the LTX model");
  if (!a.clip)     missing.push("the text encoder");
  if (!a.vaeVideo) missing.push("the video VAE");
  if (!a.vaeAudio) missing.push("the audio VAE");
  if (!a.upscaler) missing.push("the latent upscaler");
  return missing;
}

/** Generation modes, with the ones whose model is missing marked unavailable. */
export function generationModesFor(state) {
  const a = modelAvailability(state);
  const ready = a.fl && a.clip && a.vaeVideo && a.vaeAudio && a.upscaler;
  return GENERATION_MODES.map(m => {
    if (m.key === "postprocess") return { ...m, enabled: true, reason: "" };
    return { ...m, enabled: ready, reason: ready ? "" : `Set the LTX models in ⚙ Settings (missing: ${configIssues(state).join(", ")})` };
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
  return CONTINUITY_MODES.map(m => ({ key: m.key, label: m.label, hint: m.hint, disabled: false, reason: "" }));
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
    // A run that was in flight when the page went away: not listed in this whitelist, the record would be
    // dropped by the very reload that makes it necessary.
    _relay: saved._relay ?? null,
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
    refineIncludeImages: !!saved.refineIncludeImages,
    galleryPageSize: saved.galleryPageSize ?? 50,   // rows per "Load more" in the H3 galleries and the video picker

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

    // ── LTX 2.5 Upscale mode (generationMode "ltxupscale") ────────────────────
    // A standalone 2x latent-upscale + light refine pass over a finished/uploaded clip.
    // Does not touch the H3 conditioning/sampler chain — see buildLtxUpscaleGraph.
    ltxSource:      saved.ltxSource      || "",     // source video filename (gallery pick or upload)
    ltxSourceKind:  saved.ltxSourceKind  || "gallery",  // "gallery" | "upload"
    ltxSourceMeta:  saved.ltxSourceMeta  || null,   // { w, h, fps, frames, duration } from the clip's sidecar, for the info line
    ltxPrompt:      saved.ltxPrompt      || "",
    ltxNegPrompt:   saved.ltxNegPrompt   || "bad anatomy, inconsistent look, low resolution,",
    ltxSteps:       saved.ltxSteps       ?? 4,
    ltxDenoise:     saved.ltxDenoise     ?? 0.15,
    ltxSampler:     saved.ltxSampler     || "euler_ancestral",
    ltxScheduler:   saved.ltxScheduler   || "simple",
    // Split a long/large clip into fixed-length windows, upscale each on its own queue
    // turn (ComfyUI frees VRAM between turns), then ffmpeg-concat the parts. 0 = whole
    // clip in one pass. Each window is anchored to its own first frame + refined at low
    // denoise, so a plain concat has no visible seam.
    ltxSegmentSeconds: saved.ltxSegmentSeconds ?? 5,
    // "seconds" derives the piece count from a target size (rounds to whatever number of
    // pieces gets closest, never a stub piece a few frames long); "count" takes the piece
    // count directly — reaching for a target-seconds number just to land on a specific
    // count is a wasted model load/unload for whatever tiny piece the rounding produces.
    ltxSegmentMode:  saved.ltxSegmentMode  || "seconds",   // "seconds" | "count"
    ltxSegmentCount: saved.ltxSegmentCount ?? 2,
    // LTX Upscale runs on the LTX 2.5 unet — a different model from H3 — so its LoRAs
    // are their own list, never the H3 `loras`.
    ltxLoras: Array.isArray(saved.ltxLoras) ? saved.ltxLoras.map(l => ({
      name: l.name || "none", strength: l.strength ?? 1.0, enabled: l.enabled !== false,
    })) : [],
    // configured once in ⚙ Settings → LTX 2.5 Upscale (round-trip through the config route)
    ltxUnet:           saved.ltxUnet           || "",   // .gguf → TJ_LTX25ClipLoaderGGUF-companion UnetLoaderGGUF; .safetensors → UNETLoader
    ltxLatentUpscaler: saved.ltxLatentUpscaler || "",   // models/latent_upscale_models/
    ltxClip:           saved.ltxClip           || "",   // .gguf → TJ_LTX25ClipLoaderGGUF; else core CLIPLoader(type ltxv)
    ltxVaeVideo:       saved.ltxVaeVideo       || "",
    ltxVaeAudio:       saved.ltxVaeAudio       || "",
    ltxTinyVae:        saved.ltxTinyVae        || "",
    // generation sampling (left panel -> Sampling)
    ltxGenSteps:     saved.ltxGenSteps     ?? 12,
    ltxGenSampler:   saved.ltxGenSampler   || "euler_ancestral",
    ltxGenScheduler: saved.ltxGenScheduler || "linear_quadratic",
    ltxStage2Sigmas: saved.ltxStage2Sigmas || "0.85, 0.7250, 0.4219, 0.0",
    ltxCfg:          saved.ltxCfg          ?? 1,
    // the distilled LoRA is for a non-distilled model only - see Settings -> LTX Model
    distilledLoraOn:       saved.distilledLoraOn       ?? false,
    distilledLora:         saved.distilledLora         || "",
    distilledLoraStrength: saved.distilledLoraStrength ?? 0.5,   // preview TAE (taeltx2*) — falls back to the H3 preview tiny_vae if unset
    // LTX Upscale's own live-preview switch + values (Settings → Preview → "LTX 2.5
    // Upscale"), separate from the H3 preview above — it runs its own model, at its own
    // resolution, so H3's numbers rarely fit it.
    ltxPreviewEnabled: saved.ltxPreviewEnabled ?? true,
    ltxPreviewFrames:  saved.ltxPreviewFrames   ?? 8,
    ltxPreviewFps:     saved.ltxPreviewFps      ?? 12,
    ltxPreviewMaxRes:  saved.ltxPreviewMaxRes   ?? 512,
    ltxPreviewQuality: saved.ltxPreviewQuality  ?? 85,
    // The ✨ LLM in the upscale prompt area: analyses the source clip's first frame to
    // reconstruct a prompt that matches it. Its own backend + model (not shared with H3),
    // all configured in ⚙ Settings → LTX 2.5 Upscale and saved to the config.
    ltxVisionBackend: saved.ltxVisionBackend || "native",       // "native" | "openrouter"
    ltxVisionClip:    saved.ltxVisionClip    || "",             // native: the vision CLIP (text_encoders)
    ltxVisionOrModel: saved.ltxVisionOrModel || "",             // openrouter: model id
    ltxLlmPrompt:      saved.ltxLlmPrompt      || LTX_UPSCALE_LLM_PROMPT,
    ltxConvertPrompt:  saved.ltxConvertPrompt  || LTX_CONVERT_LLM_PROMPT,

    // ── H3 Face Refine mode (generationMode "facerefine") ─────────────────────
    // Also a post-process pass over a finished/uploaded clip — see
    // SPEC_MINIMAX_H3_FACE_REFINE.md. Runs H3's own unet/clip/vae (Settings → Models,
    // same as Reference mode), not a separate model set like LTX Upscale.
    frSource:     saved.frSource     || "",       // source video filename (gallery pick or upload)
    frSourceKind: saved.frSourceKind || "gallery", // "gallery" | "upload"
    frSourceMeta: saved.frSourceMeta || null,      // { w, h, fps, frames, duration }
    frPrompt:     saved.frPrompt     || "",        // conditioning prompt (MiniMaxH3ReferenceToVideo)
    // H3FaceTrackCrop / H3FaceSelect params
    frSelect:       saved.frSelect       || "largest_face",  // 9 ranking modes, or "manual"
    frSelectIndex:  saved.frSelectIndex  ?? 0,
    frConfidence:   saved.frConfidence   ?? 0.35,  // face detector score floor
    frConfirmedPick: saved.frConfirmedPick || "",  // "0,1,1" — one face index per shot, from Pick Faces
    // Multi-person chain (§12): an ORDERED list of face indices to refine one at a time,
    // each pass over the previous pass's own output — "5 people, only 3,5,7 in this
    // order" from Pick Faces. Single shot only (no per-shot picks per chain step yet).
    // Empty/1-length = the normal single-subject path (frConfirmedPick as-is).
    frChainPicks: Array.isArray(saved.frChainPicks) ? saved.frChainPicks.slice() : [],
    frCutDetection: saved.frCutDetection ?? false, // maps to "auto (pyscenedetect)" | "none"
    frCutThreshold: saved.frCutThreshold ?? 3.0,
    frIdentityTrack: saved.frIdentityTrack ?? true,
    // 0.28 (the pack's own stock default) is too low to ever reject a false match -
    // a real render logged same-person InsightFace scores around 0.57 while the
    // threshold sat at 0.28, so identity verification never intervened even once.
    // That let continuity tracking silently drift onto a different person when two
    // faces crossed paths mid-clip (reported: picked the right-side face, the
    // refined output showed the left face, then drifted to the center face by the
    // end) - see SPEC_MINIMAX_H3_FACE_REFINE.md sec 19. 0.45 sits below observed
    // same-person scores but above chance cross-person similarity.
    // Force-migrate the OLD stock default (0.28) forward: there is no UI control for this
    // field yet, so any browser holding exactly 0.28 got it from the old default, never from
    // a deliberate user choice - safe to bump it without asking (see sec 20 in the SPEC:
    // this bit the very fix meant to land it, because localStorage's saved 0.28 always wins
    // over a fresh code default per the take()-style "never overwrite a live value" rule).
    frIdentityThreshold: saved.frIdentityThreshold === 0.28 ? 0.45 : (saved.frIdentityThreshold ?? 0.45),
    frIdentityModel: saved.frIdentityModel || "insightface", // insightface | clip_vision | ccip
    // H3FaceTrackCrop crop/canvas params
    frCropFactor:   saved.frCropFactor   ?? 2.5,
    frCanvasMode:   saved.frCanvasMode   || "auto_capped_768", // manual | auto_no_downscale | auto_capped_768
    frCanvasWidth:  saved.frCanvasWidth  ?? 768,
    frCanvasHeight: saved.frCanvasHeight ?? 768,
    frSmoothWindow: saved.frSmoothWindow ?? 21,
    // H3PerFrameDenoise params — base denoise (BasicScheduler) is separate from the
    // small/large-face multipliers (see SPEC §4 "denoise 기본값 주의": these are tuned
    // as a set, do not change one without the other).
    frDenoise:            saved.frDenoise            ?? 0.40,
    frDenoiseMulSmall:    saved.frDenoiseMulSmall     ?? 1.0,
    frDenoiseMulLarge:    saved.frDenoiseMulLarge     ?? 0.35,
    frFacePxSmall:        saved.frFacePxSmall         ?? 30.0,
    frFacePxLarge:        saved.frFacePxLarge         ?? 120.0,
    frSteps:    saved.frSteps    ?? 8,   // H3's own turbo-friendly step count, not LTX's
    frSampler:  saved.frSampler  || "euler",
    frScheduler: saved.frScheduler || "simple",
    // H3FaceStitch params
    frPasteRegion: saved.frPasteRegion || "face_only",   // face_only | face_ellipse | full_crop
    frFeather:     saved.frFeather     ?? 6,
    frColourMatch: saved.frColourMatch ?? 1.0,
    frBlend:       saved.frBlend       ?? 1.0,
    frUndetected:  saved.frUndetected  || "fade_out",    // fade_out | skip | composite_anyway
    // configured once in ⚙ Settings → Models → "H3 Face Refine"
    faceDetector:        saved.faceDetector        || "",  // required — models/ultralytics/bbox/*.pt
    faceFallbackDetector: saved.faceFallbackDetector || "none", // optional — models/ultralytics/segm/*.pt
    faceSamModel:        saved.faceSamModel        || "none",   // optional — Impact Pack SAMLoader
    faceIdentityClipVision: saved.faceIdentityClipVision || "none", // optional — identity_model=clip_vision
    // Face Refine's OWN model set — off by default (shares H3's Reference unet/clip/vae,
    // the original design). Turn on to run the refine pass on a different file (e.g. a
    // lighter/faster GGUF quant just for this pass) — see SPEC_MINIMAX_H3_FACE_REFINE.md §15.
    frUseCustomModel: saved.frUseCustomModel ?? false,
    frUnet: saved.frUnet || "",   // .gguf → UnetLoaderGGUF; else UNETLoader
    frClip: saved.frClip || "",   // .gguf → CLIPLoaderGGUF; else CLIPLoader (both type=minimax)
    // Face Refine's OWN LoRA list (e.g. a face-detail LoRA) — never state.loras, which is
    // the main render's own list and stays applied via buildModelChain regardless.
    frLoras: Array.isArray(saved.frLoras) ? saved.frLoras.map(l => ({
      name: l.name || "none", strength: l.strength ?? 1.0, enabled: l.enabled !== false,
    })) : [],
    // Face Refine's OWN turbo switch — independent of the main render's turboMode (see
    // SPEC_MINIMAX_H3_FACE_REFINE.md §18). OFF (default): no turbo LoRA, frSteps is the
    // real step count. ON: applies the named saved preset's full accel recipe.
    frTurboMode: saved.frTurboMode || "none",
    // The same choices as the main Turbo section, kept apart so Face Refine never changes the main render's.
    frPddFile:         saved.frPddFile         || "none",
    frPddNfe:          String(saved.frPddNfe ?? "8"),
    frPddLoraStrength: saved.frPddLoraStrength ?? 1.0,
    frTurboLora:         saved.frTurboLora         || "none",
    frTurboLoraStrength: saved.frTurboLoraStrength ?? 1.0,
    frTurboSteps:        saved.frTurboSteps        ?? 4,
    frTurboLoraLowVram:  !!saved.frTurboLoraLowVram,
    frSlaTurboLora:     saved.frSlaTurboLora     || "none",
    frSlaTurboStrength: saved.frSlaTurboStrength ?? 1.0,
    frSlaTurboSteps:    saved.frSlaTurboSteps    ?? 6,

    accelMode:      saved.accelMode      || "solattn",   // legacy — kept only so old
                                                         // workflows can be migrated below
    upscaleMode:    saved.upscaleMode    || "none",
    continuityMode: saved.continuityMode === "lastframe" ? "lastframe" : "none",
    oneTakeLockAudio: saved.oneTakeLockAudio ?? false,
    oneTakeAutoStitch: saved.oneTakeAutoStitch ?? true,
    oneTakeLlm: saved.oneTakeLlm ?? false,   // Prompt Write / Refine follow the ONE_TAKE guide while Continuity is One-Take

    // canvas / length
    aspect:      saved.aspect      || "16:9 Landscape",
    megapixels:  saved.megapixels  ?? 0.5,
    hiresFinish:  !!saved.hiresFinish,
    autoPrompt:   !!saved.autoPrompt,   // write every clip's prompt with the LLM right before Generate
    hiresStartMp: saved.hiresStartMp ?? 0.5,
    hiresFinalMp: saved.hiresFinalMp ?? saved.megapixels ?? 1.0,
    hiresChunkRows: saved.hiresChunkRows ?? 2048,   // H3 Memory Optimization "Activation chunk rows" of the 7+1 last step
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
    // Each entry is { text, firstFrame, enabled, override, ... } — pre-v1.11 saves stored
    // plain strings, so a string entry is wrapped here (the one place that happens).
    //
    // `override` is the per-clip switch: off, the clip uses the panel's common references;
    // on, it uses only its own. It is all-or-nothing on purpose — a per-asset mixture
    // would leave no way to see, on screen, which set a clip is actually rendering with.
    prompts: (Array.isArray(saved.prompts) && saved.prompts.length ? saved.prompts : [""])
      .map(p => (typeof p === "string"
        ? { text: p, firstFrame: "", enabled: true, override: false,
            refImages: [], refImagesMp: [], lastFrame: "", refVideos: [], refAudios: [],
            assetRef: null, refSource: "files", header: "", footer: "", timeOverride: false, timeSec: 0, dir: null }
        : { text: p?.text || "", firstFrame: p?.firstFrame || "", enabled: p?.enabled !== false,
            override: !!p?.override,
            refImages:   Array.isArray(p?.refImages) ? p.refImages.slice(0, 9) : [],
            refImagesMp: Array.isArray(p?.refImagesMp) ? p.refImagesMp.slice(0, 9) : [],
            lastFrame:   p?.lastFrame || "",
            refVideos:   Array.isArray(p?.refVideos) ? p.refVideos.map(v => ({ ...v })) : [],
            refAudios:   Array.isArray(p?.refAudios) ? p.refAudios.map(a => ({ ...a })) : [],
            // the clip's own library assets / project (override on only) - see clipAssets()
            assetRef:    normalizeAssetRef(p?.assetRef),
            refSource:   p?.refSource === "library" ? "library" : "files",
            // header/tail follow the override too - see clipFraming()
            header:      p?.header || "",
            footer:      p?.footer || "",
            // this clip's own length (Prompt Edit "clip time override") - see clipFramesFor()
            timeOverride: !!p?.timeOverride,
            timeSec:     Number(p?.timeSec) > 0 ? Number(p.timeSec) : 0,
            // this clip's segment timeline: the Director's widget values + the clip length they were made for
            dir:         p?.dir && typeof p.dir === "object" ? p.dir : null,
            ...bilingualSlots(p, ["text", "header", "footer"]) })),
    // clips rendered per prompt (>1 continues the same description across chained clips)
    promptHeader: saved.promptHeader || "",
    promptFooter: saved.promptFooter || "",
    ...bilingualSlots(saved, ["promptHeader", "promptFooter"]),
    promptSuffix: saved.promptSuffix || "",
    enhCollapsed: !!saved.enhCollapsed,

    // images
    firstFrameImage: saved.firstFrameImage || null,
    lastFrameImage:  saved.lastFrameImage  || null,
    // 0 = send as uploaded (no resize). Per-card override for the size sent to the model.
    firstFrameMp: saved.firstFrameMp ?? 1.0,
    lastFrameMp:  saved.lastFrameMp  ?? 1.0,
    refImages: Array.isArray(saved.refImages) ? saved.refImages.slice(0, 9) : [],
    refImagesMp: Array.isArray(saved.refImagesMp) ? saved.refImagesMp.slice(0, 9) : [],
    refImageSize: saved.refImageSize || "match",
    // Library assets / project the whole node uses (Asset tab). When set for the current mode
    // they replace the file slots; empty = the file slots work as before.
    assetRef: normalizeAssetRef(saved.assetRef),
    refSource: saved.refSource === "library" || normalizeAssetRef(saved.assetRef) ? "library" : "files",
    // Reference videos / audios (REF2VA). The model takes up to 3 of each; videos are
    // fed as 24fps frames plus, optionally, their own soundtrack. start/end are seconds
    // — the trained window for a reference video is ~2-15s, so clipping matters.
    refVideos: Array.isArray(saved.refVideos) ? saved.refVideos.slice(0, 3).map(v => ({
      file: v.file || "", start: v.start ?? 0, end: v.end ?? 5, withAudio: v.withAudio !== false,
      // mp = downscale on queue; srcW/srcH = the probed size that stops it from upscaling a smaller clip
      mp: v.mp ?? 0, srcW: v.srcW ?? 0, srcH: v.srcH ?? 0,
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
    //   blockCache  none | fbcache                  block-output reuse across steps
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
    // RTX deblur pre-pass for the render path; "none" keeps the old behaviour exactly.
    deblurStrength: saved.deblurStrength || "none",
    turboMode:   saved.turboMode   || "none",
    // The user's own saved presets. Server-backed via the config route, but kept in
    // state so the dropdown can render before that round-trip finishes.
    userPresets: Array.isArray(saved.userPresets) ? saved.userPresets : [],
    // PDD Acc — per-variant ComfyUI-converted LoRA (core-native since v0.35.0), plus its
    // strength. nfe is a string because it is a choice from a fixed list, not a free number.
    pddFile:          saved.pddFile          || "none",
    pddFileReference: saved.pddFileReference || "none",
    pddNfe:           String(saved.pddNfe ?? "8"),
    pddLoraStrength:  saved.pddLoraStrength  ?? 1.0,
    attnBackend: saved.attnBackend || "sage",
    attnForward: saved.attnForward || "memeff_sage",
    blockCache:  (saved.blockCache && saved.blockCache !== "h3cache") ? saved.blockCache : "none",
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
    // RTX VSR size input mode — "scale" | "short" | "long" | "wh" (see computeRtxTarget)
    rtxSizeMode:   saved.rtxSizeMode   || "scale",
    rtxShort:      saved.rtxShort      ?? 1080,
    rtxLong:       saved.rtxLong       ?? 1920,
    rtxW:          saved.rtxW          ?? 1920,
    rtxH:          saved.rtxH          ?? 1080,
    rtxCropAnchor: saved.rtxCropAnchor || "center",
    // FlashVSR VSR — defaults match the shipped API workflow (16GB, 2x, 384 tile). The
    // rest of FlashVSRInitPipe/FlashVSRNodeAdv (alt_vae, force_offload, precision,
    // device, attention_mode, tiled_vae/tiled_dit, unload_dit, sparse_ratio, kv_ratio,
    // local_range) is fixed at that same API's values and not exposed in the UI.
    flashvsrModel:      saved.flashvsrModel      || "FlashVSR-v1.1",
    flashvsrMode:        saved.flashvsrMode        || "tiny",
    flashvsrScale:        saved.flashvsrScale        ?? 2,
    flashvsrColorFix:    saved.flashvsrColorFix    !== false,
    flashvsrTileSize:    saved.flashvsrTileSize    ?? 384,
    flashvsrTileOverlap: saved.flashvsrTileOverlap ?? 32,
    flashvsrSeed:         saved.flashvsrSeed         ?? 42,
    flashvsrSeedMode:    saved.flashvsrSeedMode    || "fixed",

    // preview (ModelPreviewOverrideKJ)
    previewEnabled:  saved.previewEnabled  ?? true,
    previewFrames:   saved.previewFrames   ?? 8,
    previewFps:      saved.previewFps      ?? 12,
    previewMaxRes:   saved.previewMaxRes   ?? 512,
    previewQuality:  saved.previewQuality  ?? 85,
    previewTinyVae:  saved.previewTinyVae  || "none",

    // Image -> Brief source images. "fl" caps at 2 (first/last frame), "ref" at 8
    // (<Picture N> tags). Order is upload order and becomes the Image N numbering.
    // Named for the mode, not the backend: the Ollama path was removed on 2026-08-31 and
    // the old key is still read so a saved state keeps the user's choice.
    briefImageMode:    saved.briefImageMode || saved.ollamaImageMode || "ref",

    // Image -> Brief runs natively: the images go through TextGenerate on a CLIP already
    // loaded in ComfyUI, which attends to every image in a batch correctly. The external
    // Ollama path was removed on 2026-08-31 — it needed a second server, and its
    // images[] array did not reliably see more than one image at a time (see
    // SPEC_MINIMAX_H3_NEXT_ROUND.md C0 vs C5). `visionSource` is kept, pinned to
    // "native", so a state saved while Ollama still existed does not select a backend
    // that is gone.
    visionSource:    "native",
    nativeVisionClip: saved.nativeVisionClip || "Qwen3\\qwen_3vl_8b_nvfp4.safetensors",
    nativeBriefClip:  saved.nativeBriefClip  || "LTX\\gemma4_e2b_it_bf16.safetensors",
    h3LlmBackend:     saved.h3LlmBackend     || "native",   // legacy single (migrates to the pair below)
    h3OrModel:        saved.h3OrModel        || "",
    // Brief (writes the prompt) and Vision (reads images) pick their backend + model independently
    // "Connect Custom" endpoints (Brief / Vision each): the URL, model id and context are
    // kept; the API key is deliberately not part of state — it lives in the server's memory.
    h3CustomBriefBase:   saved.h3CustomBriefBase   || "",
    h3CustomBriefModel:  saved.h3CustomBriefModel  || "",
    h3CustomBriefCtx:    saved.h3CustomBriefCtx    ?? 0,
    h3CustomVisionBase:  saved.h3CustomVisionBase  || "",
    h3CustomVisionModel: saved.h3CustomVisionModel || "",
    h3CustomVisionCtx:   saved.h3CustomVisionCtx   ?? 0,
    ltxCustomBase:       saved.ltxCustomBase       || "",   // LTX Upscale's own Connect Custom endpoint
    ltxCustomModel:      saved.ltxCustomModel      || "",
    ltxCustomCtx:        saved.ltxCustomCtx        ?? 0,
    h3BriefBackend:   saved.h3BriefBackend   || saved.h3LlmBackend || "native",   // "native" | "openrouter" | "llamagguf" | "custom"
    h3VisionBackend:  saved.h3VisionBackend  || saved.h3LlmBackend || "native",
    h3OrModelBrief:   saved.h3OrModelBrief   || saved.h3OrModel || "",
    h3OrModelVision:  saved.h3OrModelVision  || saved.h3OrModel || "",
    // Llama GGUF (local llama.cpp, via TJ_NODE's prompt_enhancer.py/image_to_prompt.py —
    // the same backend the image nodes' shared Enhance/Image→Prompt panel already uses).
    // Vision picks its own GGUF model independently of Brief, plus its own mmproj.
    h3LlamaVisionModel:  saved.h3LlamaVisionModel  || "",
    h3LlamaVisionMmproj: saved.h3LlamaVisionMmproj || "none",
    h3LlamaBriefModel:   saved.h3LlamaBriefModel   || "",
    // LTX Upscale has no paired "brief" row — standalone vision role, own model + mmproj.
    ltxLlamaModel:       saved.ltxLlamaModel       || "",
    ltxLlamaMmproj:      saved.ltxLlamaMmproj      || "none",
    // 16384, not llama.cpp's/the route's own 4096 default — H3's system prompt (guide +
    // few-shot examples) plus a real request measured 5436 tokens on its own in testing,
    // already over 4096 before generation even starts (observed failure: a silent empty
    // result, no error).
    h3LlamaNCtx:         saved.h3LlamaNCtx         ?? 16384,
    // 4096 — a real full brief (opening style + multiple [Shot N] + Ambient sound +
    // Music) got cut off mid-sentence at 2000 in testing; a truncated brief is exactly
    // as unusable as an empty one.
    h3LlamaMaxTokens:    saved.h3LlamaMaxTokens    ?? 4096,

    // output
    saveSubfolder: saved.saveSubfolder || "",
    filenamePrefix: saved.filenamePrefix || "MMH3",
    stitchAtEnd:   saved.stitchAtEnd   ?? true,

    // Image Generator (T2I/Ref2I/Character Sheet), Postprocess — this whole return
    // object is a WHITELIST (no `...saved` spread), so any field not listed here gets
    // silently dropped on every reload no matter how many times persist() saved it.
    // These three feature groups were built without ever being added here, so their
    // whole left panel reset itself every time despite the individual checkboxes/
    // numberFields all calling persist() correctly (2026-09-21 bug report: "포스트
    // 왼쪽 메뉴는 마지막 사용한 설정을 계속 그대로 유지하게 해달라고 했는데 계속
    // 초기화 되는데").
    imgPrompt: saved.imgPrompt || "",
    imgAspect: saved.imgAspect || "2:3 Portrait",
    imgPreviewMp: saved.imgPreviewMp ?? 0.2,
    imgFinalMp: saved.imgFinalMp ?? 1.0,
    imgLoras: Array.isArray(saved.imgLoras) ? saved.imgLoras : [],
    imgRefImages: Array.isArray(saved.imgRefImages) ? saved.imgRefImages : [],
    imgRefImagesMp: Array.isArray(saved.imgRefImagesMp) ? saved.imgRefImagesMp : [],
    imgRefImageSize: saved.imgRefImageSize || "max",
    imgPreviewSaveToGallery: saved.imgPreviewSaveToGallery ?? false,
    imgSteps: saved.imgSteps ?? 20,
    imgSecondPassSteps: saved.imgSecondPassSteps ?? 3,
    imgLatentMode: saved.imgLatentMode === "fizgig" ? "fizgig" : "basic",
    imgTurboOn: saved.imgTurboOn ?? false,
    imgTurboLoraT2i: saved.imgTurboLoraT2i || "none",
    imgTurboLoraRef2i: saved.imgTurboLoraRef2i || "none",
    imgTurboLoraStrength: saved.imgTurboLoraStrength ?? 1.0,

    charSheetPrompt: saved.charSheetPrompt || "",
    charSheetSystemPrompt: saved.charSheetSystemPrompt || "",
    charSheetSubjectName: saved.charSheetSubjectName || "Character",
    charSheetDeblur: saved.charSheetDeblur || "none",
    charSheetRtxVsr: saved.charSheetRtxVsr ?? false,
    charSheetRtxSupersample: saved.charSheetRtxSupersample ?? false,
    charSheetUseLatentUpscale: saved.charSheetUseLatentUpscale ?? false,
    charSheetFirstPassRatio: saved.charSheetFirstPassRatio ?? 0.36,
    charSheetSecondPassSteps: saved.charSheetSecondPassSteps ?? 3,
    charSheetSaveEachFrames: saved.charSheetSaveEachFrames ?? false,
    charSheetMaxSize: saved.charSheetMaxSize ?? 2048,
    charSheetFrameIndices: Array.isArray(saved.charSheetFrameIndices) ? saved.charSheetFrameIndices : null,
    charSheetVideoFile: saved.charSheetVideoFile || null,
    charSheetVideoOutput: saved.charSheetVideoOutput || null,
    charSheetRefImage: saved.charSheetRefImage || null,
    charSheetCellW: saved.charSheetCellW || 0,
    charSheetCellH: saved.charSheetCellH || 0,

    ppSource: saved.ppSource || "",
    ppSourceKind: saved.ppSourceKind || "gallery",
    ppSourceMeta: saved.ppSourceMeta || null,
    ppSourceFullMeta: saved.ppSourceFullMeta || null,
    ppPreviewStart: saved.ppPreviewStart ?? 0,
    ppPreviewEnd: saved.ppPreviewEnd ?? 0,
    ppDeblurOn: saved.ppDeblurOn ?? false,
    ppDeblurStrength: saved.ppDeblurStrength || "MEDIUM",
    ppDenoiseOn: saved.ppDenoiseOn ?? false,
    ppDenoiseStrength: saved.ppDenoiseStrength || "MEDIUM",
    ppUpscaleOn: saved.ppUpscaleOn ?? false,
    ppUpscale2On: saved.ppUpscale2On ?? false,   // 2-pass: FlashVSR / Model -> RTX VSR
    // The 2nd pass has its own RTX settings — independent of the standalone RTX VSR ones above.
    pp2RtxSizeMode: saved.pp2RtxSizeMode || "scale",
    pp2RtxScale:    saved.pp2RtxScale    ?? 2.0,
    pp2RtxShort:    saved.pp2RtxShort    ?? 1080,
    pp2RtxLong:     saved.pp2RtxLong     ?? 1920,
    pp2RtxW:        saved.pp2RtxW        ?? 1920,
    pp2RtxH:        saved.pp2RtxH        ?? 1080,
    pp2RtxCropAnchor: saved.pp2RtxCropAnchor || "center",
    pp2RtxQuality:  saved.pp2RtxQuality  || "ULTRA",
    ppSkinRetouchOn: saved.ppSkinRetouchOn ?? false,
    ppSkinEvenness: saved.ppSkinEvenness ?? 0,
    ppSkinSmoothing: saved.ppSkinSmoothing ?? 0,
    ppSkinRedness: saved.ppSkinRedness ?? 0,
    ppSkinShine: saved.ppSkinShine ?? 0,
    ppSkinBlemishMode: saved.ppSkinBlemishMode || "off",
    ppSkinMicrotexture: saved.ppSkinMicrotexture ?? 0,
    ppSkinPreserveMarks: saved.ppSkinPreserveMarks !== false,
    ppGrainOn: saved.ppGrainOn ?? false,
    ppGrainAmount: saved.ppGrainAmount ?? 0.25,
    ppGrainSize: saved.ppGrainSize ?? 0.1,
    ppGrainColor: saved.ppGrainColor ?? 0,
    ppGrainLumBias: saved.ppGrainLumBias ?? 0,
    ppGrainNoiseMode: saved.ppGrainNoiseMode || "smooth",
    ppInterpolateOn: saved.ppInterpolateOn ?? false,
    ppInterpolateTargetFps: saved.ppInterpolateTargetFps ?? null,
    ppInterpolateScale: saved.ppInterpolateScale ?? 1.0,
    ppResizeOn: saved.ppResizeOn ?? false,
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

/**
 * A saved asset reference, cleaned: { project, ids, first, last } with real numbers, or null when it
 * points at nothing. Reference mode uses project OR ids, First/Last mode uses first / last.
 */
export function normalizeAssetRef(r) {
  if (!r || typeof r !== "object") return null;
  const id = (v) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);
  const out = {
    project: id(r.project),
    ids: Array.isArray(r.ids) ? r.ids.map(id).filter(Boolean).slice(0, 15) : [],
    first: id(r.first),
    last: id(r.last),
  };
  return out.project || out.ids.length || out.first || out.last ? out : null;
}

/** Text of a prompt entry — entries may still be plain strings (pre-migration data in flight). */
export const promptText = (p) => (typeof p === "string" ? p : (p?.text || ""));
/** Per-clip first-frame override of a prompt entry, or "" if none set. */
export const promptFirstFrame = (p) => (typeof p === "string" ? "" : (p?.firstFrame || ""));
/** Whether a prompt entry is switched on (default true — plain-string/legacy entries are always on). */
export const promptEnabled = (p) => (typeof p === "string" ? true : p?.enabled !== false);

/** Whether this clip supplies its own references instead of the panel's common ones. */
export const promptOverrides = (p) => (typeof p === "string" ? false : !!p?.override);

/**
 * The reference set a clip actually renders with.
 *
 * One place decides this, so the render loop, the editor and the metadata can never
 * disagree about which images a clip used — that disagreement is exactly what makes a
 * wrong render expensive to notice.
 */
export function flLibrarySource(state) {
  return state.generationMode === "firstlast" && state.refSource === "library";
}

export function clipAssets(state, i) {
  const p = (state.prompts || [])[i];
  if (promptOverrides(p)) {
    return {
      own: true,
      assetRef:    p.assetRef || null,
      refImages:   (p.refImages || []).filter(Boolean),
      refImagesMp: p.refImagesMp || [],
      firstFrame:  p.firstFrame || "",
      lastFrame:   p.lastFrame || "",
      refVideos:   p.refVideos || [],
      refAudios:   p.refAudios || [],
    };
  }
  return {
    own: false,
    assetRef:    state.assetRef || null,
    refImages:   (state.refImages || []).filter(Boolean),
    refImagesMp: state.refImagesMp || [],
    // First/Last with the Asset Library as the source: the file frames are not used.
    firstFrame:  promptFirstFrame(p) || (flLibrarySource(state) ? "" : state.firstFrameImage || ""),
    lastFrame:   flLibrarySource(state) ? "" : state.lastFrameImage || "",
    refVideos:   state.refVideos || [],
    refAudios:   state.refAudios || [],
  };
}

/**
 * The header and sound/music tail a clip actually renders with.
 *
 * These follow the override for the same reason the images do: the header fixes the
 * visual style and opening composition, and the tail fixes the ambience and score — both
 * describe the scene the reference images establish. A clip that swapped its images to a
 * different set but kept the common pair gets the previous shot's setting and score
 * written over its new one, which is a silent wrong render, not a visible error.
 *
 * Same all-or-nothing rule as `clipAssets`: override on means the clip owns both fields,
 * with no per-field fallback to the common pair.
 */
export function clipFraming(state, i) {
  const p = (state.prompts || [])[i];
  if (promptOverrides(p)) {
    return { own: true, header: p.header || "", footer: p.footer || "" };
  }
  return { own: false, header: state.promptHeader || "", footer: state.promptFooter || "" };
}

/** What actually gets sent for clip `i`: header + that clip's shots + sound/music tail. */
/**
 * The one prompt that describes a stitched file.
 *
 * Each source clip was rendered from its own composed text — common header, that clip's
 * body, common footer — and that composed text is what its metadata already holds. So the
 * stitched prompt is those, in order, separated by a labelled divider: the divider is what
 * lets a reader (or a later Reuse) see where one shot ended and the next began, which a
 * bare blank line does not.
 */
export function composeStitchedPrompt(clipPrompts) {
  const parts = (clipPrompts || []).map(t => String(t || "").trim()).filter(Boolean);
  if (parts.length <= 1) return parts[0] || "";
  return parts.map((t, i) => `[Clip ${i + 1}]\n${t}`).join("\n\n");
}

export function composeClipPrompt(state, i) {
  const list = state.prompts || [];
  let body = "";
  for (let k = Math.min(i, list.length - 1); k >= 0; k--) {
    const t = promptText(list[k]).trim();
    if (t) { body = t; break; }
  }
  const { header, footer } = clipFraming(state, i);
  return [header, body, footer, loraTriggers(state), state.promptSuffix]
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

// ── Hermes agent job export ───────────────────────────────────────────────────
// One clip's inner `job` object for an h3-headless `{tool:"h3", job:{...}, target:""}`
// file. Mirrors the exact per-clip resolution the render loop does (clipAssets() for
// the §1 override, then the always-on per-clip first-frame override on top, which
// forces firstlast mode). refImages / firstFrame / lastFrame are rewritten to
// ~/.hermes/render-queue/inputs/<filename>. Mirrors the web twin's buildAgentJob().
const AGENT_INPUTS_DIR = "/Users/hermes/.hermes/render-queue/inputs/";
function agentInputPath(filename) {
  if (!filename) return null;
  const base = String(filename).split(/[/\\]/).pop() || filename;
  return AGENT_INPUTS_DIR + base;
}

export function buildAgentJob(state, i, presetName = null) {
  const isRef = state.generationMode === "reference";
  const assets = clipAssets(state, i);
  let firstFrame = isRef ? null : state.firstFrameImage || null;
  let refImages = assets.refImages;
  const override = promptFirstFrame((state.prompts || [])[i]);
  let overridden = false;
  if (override) { firstFrame = override; refImages = []; overridden = true; }
  const lastFrame = assets.lastFrame || state.lastFrameImage || null;
  const modeForClip = overridden ? "firstlast" : state.generationMode || "t2v";
  const mode = modeForClip === "reference" ? "ref2va" : modeForClip === "firstlast" ? "fl2va" : "t2va";
  const seed = state.seedPerClip ? ((state.seed ?? 0) + i) % Number.MAX_SAFE_INTEGER : state.seed ?? 0;

  const job = {
    mode,
    preset: presetName,
    durationSeconds: clipSecondsFor(state, i),
    megapixels: state.megapixels,
    aspect: state.aspect,
    seed: state.seedMode === "randomize" ? null : seed,
    prompt: composeClipPrompt(state, i),
  };
  if (mode === "ref2va") job.refImages = (refImages || []).map(f => agentInputPath(f)).filter(Boolean);
  if (mode === "fl2va") {
    job.firstFrame = agentInputPath(firstFrame);
    job.lastFrame = agentInputPath(lastFrame);
  }
  if (state.unetFirstLast) job.unetFirstLast = state.unetFirstLast;
  if (state.unetReference) job.unetReference = state.unetReference;
  const loras = (state.loras || [])
    .filter(l => l && l.enabled !== false && l.name && l.name !== "none")
    .map(l => ({ name: l.name, strength: l.strength ?? 1.0 }));
  if (loras.length) job.loras = loras;
  return job;
}

/** The Director's timeline for a clip that has only its prompt (no segments yet). */
export function emptyTimeline(prompt, frames) {
  return {
    mainTrackEnabled: true, audioTrackEnabled: true, motionTrackEnabled: true, propHeight: 90, globalPropHeight: 60,
    showFilenames: true, showPromptZones: true, overrideAudio: false, inpaint_audio: true, global_prompt: prompt,
    retake_global_prompt: "", retakeMode: false, retakeStart: 24, retakeLength: 48, retakePrompt: "", retakeStrength: 1,
    retakeVideo: null, normalStartFrame: 0, normalDurationFrames: frames, reference_mode: "OFF", disable_prompt_relay: true,
    msr_prefix_frames: 41, analyzeProvider: "ollama", analyzeBaseUrl: "", analyzeModel: "",
    characters: [{ images: [], description: "" }, { images: [], description: "" }, { images: [], description: "" }],
    segments: [], motionSegments: [], audioSegments: [],
  };
}

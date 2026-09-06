// graph_builder_music.js — Music ONE STUDIO (TJ) workflow graph builders
//
// One node, two engines:
//   engine "minimax" — ComfyUI's official `audio_minimax_music_3.json`:
//     CLIPLoader(minimax) + UNETLoader + VAELoader -> MiniMaxMusic3TextEncode
//     -> ConditioningZeroOut / EmptyMiniMaxMusic3LatentAudio -> KSampler
//     -> VAEDecodeAudio[Tiled] -> SaveAudioAdvanced
//   engine "acestep" — the user's `Ace-Step-1.5_3xSampler.json`:
//     UNETLoader + [LoRA] + ModelSamplingAuraFlow + DualCLIPLoader(ace) + VAELoader
//     -> TextEncodeAceStepAudio1.5 (tags/lyrics/bpm/key/timesig/language/...)
//     -> EmptyAceStep1.5LatentAudio -> KSamplerSelect
//     -> 3× SamplerCustom (progressive refine: 30@cfg0 -> 20@cfg1 -> 15@cfg1)
//     -> VAEDecodeAudio -> SaveAudioAdvanced
import { SUBFOLDER } from "./core_music.js";

// ── shared helpers ──────────────────────────────────────────────────────────
function unetNode(name) {
  if ((name || "").toLowerCase().endsWith(".gguf"))
    return { class_type: "UnetLoaderGGUF", inputs: { unet_name: name } };
  return { class_type: "UNETLoader", inputs: { unet_name: name, weight_dtype: "default" } };
}

// SaveAudioAdvanced: `format` is a V3 dynamic combo. In the /prompt graph API the
// sub-option is a dotted key: format="mp3" + "format.quality"="V0". flac has none.
// (No "wav" — the node doesn't support it.) Verified end-to-end 2026-09-06.
function saveAudioNode(audioLink, prefix, state) {
  const fmt = (["flac", "mp3", "opus"].includes(state.format) ? state.format : "flac");
  const inputs = { audio: audioLink, filename_prefix: prefix, format: fmt };
  if (fmt === "mp3")  inputs["format.quality"] = (["V0", "128k", "320k"].includes(state.audioQuality) ? state.audioQuality : "V0");
  if (fmt === "opus") inputs["format.quality"] = (["64k", "96k", "128k", "192k", "320k"].includes(state.audioQuality) ? state.audioQuality : "128k");
  return { class_type: "SaveAudioAdvanced", inputs };
}

function withLoraChain(prefix, modelLink, loras) {
  const graph = {};
  let out = modelLink;
  (loras || []).forEach((lora, i) => {
    if (!lora?.name || lora.name === "none" || lora.enabled === false) return;
    const strength = parseFloat(lora.strength ?? 1.0);
    if (!(strength > 0)) return;
    const id = `${prefix}:lora${i}`;
    graph[id] = { class_type: "LoraLoaderModelOnly", inputs: { model: out, lora_name: lora.name, strength_model: strength } };
    out = [id, 0];
  });
  return { graph, modelOut: out };
}

export function parseDurationHint(text) {
  if (!text) return null;
  const s = String(text);
  let m;
  if ((m = s.match(/\b(\d{1,2}):(\d{2})\b/))) return (+m[1]) * 60 + (+m[2]);
  if ((m = s.match(/(\d+(?:\.\d+)?)\s*(?:분|min(?:ute)?s?)\s*(?:(\d+)\s*(?:초|sec(?:ond)?s?))?/i)))
    return Math.round((+m[1]) * 60 + (m[2] ? +m[2] : 0));
  if ((m = s.match(/(\d+(?:\.\d+)?)\s*(?:초|sec(?:ond)?s?)\b/i))) return Math.round(+m[1]);
  return null;
}
export function clampDuration(seconds, { min = 1, max = 300 } = {}) {
  const n = Number(seconds);
  if (!Number.isFinite(n)) return 120;
  return Math.min(max, Math.max(min, n));
}

// The single source of truth for "how long is this song" — a duration typed into
// the lyrics brief or the style brief ("3:00", "3분") wins over the slider, so the
// lyric LLM and the sampler agree on the target length.
export function effectiveDuration(state) {
  const hint = parseDurationHint(state.lyricsInput) ?? parseDurationHint(state.captionBrief);
  return clampDuration(hint ?? state.duration ?? 120);
}

// The vocal / BPM / key / time-sig dropdowns must take effect even when the user
// typed their own caption and never hit ✨. MiniMax has no structured fields for
// any of it, so everything rides in the caption text; Ace-Step reads bpm/key/
// time-sig from its own inputs, so only the vocal words go into its tags.
function styleHintParts(state, includeMusical) {
  // each entry: [text to append, distinctive keyword for "already mentioned?" check]
  const parts = [];
  const g = (state.vocalGender || "auto"), d = (state.vocalStyle || "auto"), v = (state.voiceTone || "auto");
  const vocal = [];
  if (g !== "auto") vocal.push(/instrumental/i.test(g) ? "instrumental, no vocals" : g + " vocal");
  if (d !== "auto") vocal.push(d + " delivery");
  if (v !== "auto") vocal.push(v + " tone");
  if (vocal.length) parts.push([vocal.join(", "), g !== "auto" ? g.split(/[\s(]/)[0] : d]);
  if (includeMusical) {
    if (state.bpm)           parts.push(["around " + Math.round(state.bpm) + " BPM", String(Math.round(state.bpm))]);
    if (state.keyscale)      parts.push([state.keyscale + " key", (String(state.keyscale).match(/major|minor/i) || [state.keyscale])[0]]);
    if (state.timesignature) {
      const ts = String(state.timesignature);
      parts.push([(ts.includes("/") ? ts : ts + "/4") + " time", ts]);
    }
  }
  return parts;
}
function captionWithHints(caption, state, includeMusical) {
  const low = String(caption || "").toLowerCase();
  const keep = styleHintParts(state, includeMusical)
    .filter(([, kw]) => kw && !low.includes(String(kw).toLowerCase()))
    .map(([txt]) => txt);
  if (!keep.length) return caption;
  return String(caption).replace(/\s+$/, "") + "\n\n" + keep.join(", ") + ".";
}

function resolveCommon(state, opts) {
  const caption = String(state.caption || "").trim();
  const lyrics  = String(state.lyrics  || "").trim();
  if (!caption) throw new Error("Style (caption) is empty — hit ✨ in the Style section or type one in.");
  const seconds = effectiveDuration(state);
  const seed = Number.isFinite(opts.seed) ? Math.floor(opts.seed)
             : Number.isFinite(state.seed) ? Math.floor(state.seed)
             : Math.floor(Math.random() * 2 ** 48);
  const folder = (String(state.saveSubfolder || "").trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "") || SUBFOLDER);
  const stem   = state.filenamePrefix || (state.engine === "acestep" ? "ACE" : "MMM");
  return { caption, lyrics, seconds, seed, folder, stem };
}

function commonMeta(state, r) {
  return {
    engine: state.engine || "minimax",
    caption: r.caption, captionBrief: state.captionBrief || "", styleChips: state.styleChips || [],
    lyrics: r.lyrics, lyricsInput: state.lyricsInput || "", instrumental: !!state.instrumental || !r.lyrics,
    seconds: r.seconds, seed: r.seed, seedMode: state.seedMode || "random",
    loras: (state.loras || []).filter(l => l?.name && l.name !== "none" && l.enabled !== false),
    format: state.format || "flac", audioQuality: state.audioQuality || "",
    bpm: Math.round(state.bpm ?? 120), keyscale: state.keyscale || "A minor",
    timesignature: String(state.timesignature || "4"),
    vocalGender: state.vocalGender || "auto", vocalStyle: state.vocalStyle || "auto", voiceTone: state.voiceTone || "auto",
    coverBrief: state.coverBrief || "",
    llmBackend: state.llmBackend || "local",
    llmModel: (state.llmBackend === "openrouter" ? state.llmOrModel
             : state.llmBackend === "comfy"      ? state.llmClip
             : state.llmModel) || "",
    styleFamily: state.styleFamily || "", title: state.title || "",
  };
}

// ── engine: MiniMax Music 3 ─────────────────────────────────────────────────
function buildMiniMaxGraph(state, opts) {
  const unet = state.dit  || "";
  const clip = state.clip || "";
  const vae  = state.dav  || "";
  if (!unet || !clip || !vae) throw new Error("Pick the MiniMax Music models (DiT / Text encoder / Audio VAE) in Settings.");
  const r = resolveCommon(state, opts);
  const P = "MMM";
  const steps = Math.max(1, Math.round(state.steps ?? 30));
  const g = {};
  g[`${P}:clip`] = { class_type: "CLIPLoader", inputs: { clip_name: clip, type: "minimax", device: "default" } };
  g[`${P}:unet`] = unetNode(unet);
  g[`${P}:vae`]  = { class_type: "VAELoader", inputs: { vae_name: vae } };
  const { graph: lg, modelOut } = withLoraChain(P, [`${P}:unet`, 0], state.loras || []);
  Object.assign(g, lg);
  const mmCaption = captionWithHints(r.caption, state, true);
  g[`${P}:te`] = { class_type: "MiniMaxMusic3TextEncode", inputs: {
    clip: [`${P}:clip`, 0], caption: mmCaption, lyrics: r.lyrics, seed: r.seed,
    max_duration: r.seconds, cfg_scale: state.cfgScale ?? 1.7, top_k: Math.max(1, Math.round(state.topK ?? 50)),
  }};
  g[`${P}:zero`] = { class_type: "ConditioningZeroOut", inputs: { conditioning: [`${P}:te`, 0] } };
  g[`${P}:lat`]  = { class_type: "EmptyMiniMaxMusic3LatentAudio", inputs: { seconds: [`${P}:te`, 1], batch_size: 1 } };
  g[`${P}:samp`] = { class_type: "KSampler", inputs: {
    model: modelOut, positive: [`${P}:te`, 0], negative: [`${P}:zero`, 0], latent_image: [`${P}:lat`, 0],
    seed: r.seed, steps, cfg: state.cfg ?? 1.7, sampler_name: state.sampler || "euler",
    scheduler: state.scheduler || "simple", denoise: 1.0,
  }};
  g[`${P}:dec`] = state.tiledDecode
    ? { class_type: "VAEDecodeAudioTiled", inputs: { samples: [`${P}:samp`, 0], vae: [`${P}:vae`, 0], tile_size: 1536, overlap: 64 } }
    : { class_type: "VAEDecodeAudio",      inputs: { samples: [`${P}:samp`, 0], vae: [`${P}:vae`, 0] } };
  g[`${P}:save`] = saveAudioNode([`${P}:dec`, 0], `${r.folder}/${r.stem}`, state);
  const meta = { ...commonMeta(state, r), dit: unet, dav: vae, clip,
    steps, cfg: state.cfg ?? 1.7, cfgScale: state.cfgScale ?? 1.7, topK: Math.round(state.topK ?? 50),
    tiled: !!state.tiledDecode, sampler: state.sampler || "euler", scheduler: state.scheduler || "simple" };
  return { graph: g, meta, saveNode: `${P}:save`, seedUsed: r.seed };
}

// ── engine: Ace-Step 1.5 (user's 3× sampler workflow) ───────────────────────
function buildAceStepGraph(state, opts) {
  const unet  = state.aceUnet  || "";
  const clip1 = state.aceClip1 || "";
  const clip2 = state.aceClip2 || "";
  const vae   = state.aceVae   || "";
  if (!unet || !clip1 || !clip2 || !vae)
    throw new Error("Pick the Ace-Step models (Diffusion / CLIP ×2 / VAE) in Settings.");
  const r = resolveCommon(state, opts);
  const P = "ACE";
  const stages = (state.aceStages && state.aceStages.length ? state.aceStages
                  : [{ steps: 30, cfg: 0 }, { steps: 20, cfg: 1 }, { steps: 15, cfg: 1 }]);
  const sched  = state.aceScheduler || "sgm_uniform";
  const g = {};
  g[`${P}:unet`] = unetNode(unet);
  const { graph: lg, modelOut } = withLoraChain(P, [`${P}:unet`, 0], state.loras || []);
  Object.assign(g, lg);
  g[`${P}:shift`] = { class_type: "ModelSamplingAuraFlow", inputs: { model: modelOut, shift: state.aceShift ?? 3 } };
  const M = [`${P}:shift`, 0];
  g[`${P}:clip`] = { class_type: "DualCLIPLoader", inputs: { clip_name1: clip1, clip_name2: clip2, type: "ace", device: "default" } };
  g[`${P}:vae`]  = { class_type: "VAELoader", inputs: { vae_name: vae } };
  g[`${P}:pos`]  = { class_type: "TextEncodeAceStepAudio1.5", inputs: {
    clip: [`${P}:clip`, 0], tags: captionWithHints(r.caption, state, false), lyrics: r.lyrics, seed: r.seed,
    bpm: Math.round(state.bpm ?? 120), duration: r.seconds,
    timesignature: String(state.timesignature || "4"), language: state.language || "en",
    keyscale: state.keyscale || "A minor", generate_audio_codes: state.genAudioCodes !== false,
    cfg_scale: state.cfgScaleAce ?? 2.5, temperature: state.temperature ?? 0.75,
    top_p: state.topP ?? 0.9, top_k: Math.round(state.topKAce ?? 0), min_p: state.minP ?? 0,
  }};
  g[`${P}:neg`] = { class_type: "CLIPTextEncode", inputs: { clip: [`${P}:clip`, 0], text: "" } };
  g[`${P}:lat`] = { class_type: "EmptyAceStep1.5LatentAudio", inputs: { seconds: r.seconds, batch_size: 1 } };
  g[`${P}:sel`] = { class_type: "KSamplerSelect", inputs: { sampler_name: state.aceSamplerName || "jkass_quality" } };

  let latIn = [`${P}:lat`, 0];
  stages.forEach((st, i) => {
    g[`${P}:sched${i}`] = { class_type: "BasicScheduler", inputs: {
      model: M, scheduler: sched, steps: Math.max(1, Math.round(st.steps || 20)), denoise: 1.0,
    }};
    g[`${P}:s${i}`] = { class_type: "SamplerCustom", inputs: {
      model: M, add_noise: true, noise_seed: r.seed, cfg: st.cfg ?? (i === 0 ? 0 : 1),
      positive: [`${P}:pos`, 0], negative: [`${P}:neg`, 0], sampler: [`${P}:sel`, 0],
      sigmas: [`${P}:sched${i}`, 0], latent_image: latIn,
    }};
    latIn = [`${P}:s${i}`, 0];
  });

  g[`${P}:dec`]  = { class_type: "VAEDecodeAudio", inputs: { samples: latIn, vae: [`${P}:vae`, 0] } };
  g[`${P}:save`] = saveAudioNode([`${P}:dec`, 0], `${r.folder}/${r.stem}`, state);

  const meta = { ...commonMeta(state, r),
    aceUnet: unet, aceClip1: clip1, aceClip2: clip2, aceVae: vae,
    aceShift: state.aceShift ?? 3, aceSamplerName: state.aceSamplerName || "jkass_quality",
    aceScheduler: sched, aceStages: stages,
    bpm: Math.round(state.bpm ?? 120), keyscale: state.keyscale || "A minor",
    timesignature: String(state.timesignature || "4"), language: state.language || "en",
    cfgScaleAce: state.cfgScaleAce ?? 2.5, temperature: state.temperature ?? 0.75,
    topP: state.topP ?? 0.9, minP: state.minP ?? 0, topKAce: Math.round(state.topKAce ?? 0),
  };
  return { graph: g, meta, saveNode: `${P}:save`, seedUsed: r.seed };
}

// ── dispatcher ──────────────────────────────────────────────────────────────
export function buildMusicGraph(state, opts = {}) {
  return (state.engine === "acestep") ? buildAceStepGraph(state, opts) : buildMiniMaxGraph(state, opts);
}

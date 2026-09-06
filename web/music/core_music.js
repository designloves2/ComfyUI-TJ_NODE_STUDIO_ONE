// core_music.js — MiniMax Music ONE STUDIO (TJ) constants, state, helpers
// Design: SUNO layout, STUDIO_ONE identity. See SPEC_MINIMAX_MUSIC.md.
export const BRAND = "#7612DA";
export const C = {
  lime: BRAND, bg0: "#0b0b0b", bg1: "#111111", bg2: "#181818",
  bg3: "#222222", border: "#2a2a2a", borderH: "#3c3c3c",
  text: "#dedede", muted: "#565656", dim: "#2e2e2e",
  warn: "#ffb347", err: "#ff6767",
};

export const NODE_W    = 1180;          // wider — 2 columns (compose + playlist)
export const LEFT_W    = 380;
export const PLAYER_H  = 56;
export const PAD       = 12;
export const SUBFOLDER = "one_music";
export const API       = "/music_one";
export const LS_KEY    = "music_one_state_v1";

// ── engine axis ──────────────────────────────────────────────────────────────
// One node, two model families. The compose panel (lyrics + style) and the
// playlist/player are shared; loaders + text-encode + sampler chain + the extra
// musical params branch on this.
export const ENGINES = [
  { key: "acestep", label: "Ace-Step 1.5" },
  { key: "minimax", label: "MiniMax Music 3" },
];
export const ACE_LANGUAGES = ["en", "ko", "ja", "zh", "es", "fr", "de", "auto"];
export const ACE_KEYSCALES = [
  "C major", "A minor", "G major", "E minor", "D major", "B minor",
  "F major", "D minor", "A major", "F# minor", "Bb major", "G minor",
  "auto",
];
export const ACE_TIMESIGS = ["4", "3", "6", "2"];

// TextEncode cfg_scale + KSampler cfg both default 1.7 in the official template.
export const SAMPLERS   = ["euler", "euler_ancestral", "dpmpp_2m", "heun"];
export const SCHEDULERS = ["simple", "sgm_uniform", "normal", "karras"];
export const LORA_MAX   = 3;
export const AUDIO_FORMATS = ["flac", "mp3", "opus"];

// Model supports ~300 s (5 min). Slider range.
export const DURATION_MIN = 15;
export const DURATION_MAX = 300;
export const DURATION_DEFAULT = 120;

// Quick style chips (SUNO-style). Clicking appends to the style brief.
export const STYLE_CHIPS = [
  "upbeat pop", "emotional ballad", "lofi hip-hop", "cinematic orchestral",
  "synthwave", "acoustic", "K-ballad", "city pop", "jazz", "rock band",
  "anime rock", "EDM dance-pop", "choir", "instrumental (no vocals)",
];

// LLM roles → prompt template ids bundled under ./llm_prompts/
export const LLM_ROLES = [
  "lyrics_from_theme", "lyrics_from_title", "lyrics_enhance",
  "caption_rewrite", "title", "cover_prompt",
];
// State fields that belong to ONE engine — swapped when the engine switches so
// MiniMax and Ace-Step never share a field (their prompt formats differ).
export const ENGINE_FIELDS = [
  "lyricsInput", "lyrics", "caption", "captionBrief", "styleChips", "instrumental",
  "vocalGender", "vocalStyle", "voiceTone",
  "duration", "seed", "seedMode", "format", "audioQuality", "loras",
  "steps", "cfg", "cfgScale", "topK", "sampler", "scheduler", "tiledDecode",
  "bpm", "keyscale", "timesignature", "language",
  "cfgScaleAce", "temperature", "topP", "minP", "topKAce", "genAudioCodes",
  "aceStages", "aceShift", "aceScheduler", "aceSamplerName",
];

// Vocal preset dropdowns — LLM hints that ride into the style caption.
export const VOCAL_GENDER = ["auto", "female", "male", "duet (f + m)", "group / choir", "instrumental (no vocals)"];
export const VOCAL_STYLE  = ["auto", "smooth", "powerful belt", "breathy", "raspy", "whispered", "falsetto", "spoken word", "rap / flow", "operatic", "auto-tuned", "harmonized"];
export const VOICE_TONE   = ["auto", "warm", "bright", "dark", "airy", "gritty", "deep", "nasal", "youthful", "mature", "androgynous"];

export const LLM_BACKENDS = [
  { key: "local",      label: "Local (TJ_NODE GGUF)" },
  { key: "openrouter", label: "OpenRouter" },
  { key: "comfy",      label: "ComfyUI TextGenerate" },
];
// CLIP-loader types that carry a usable LLM for TextGenerate (ComfyUI native `type` list).
export const LLM_CLIP_TYPES = ["qwen_image", "lumina2", "ltxv", "pixart", "hidream", "wan", "hunyuan_image", "flux2", "sd3", "stable_diffusion"];

// Lyrics section tags the model understands (structural directives).
export const LYRIC_TAGS = [
  "[Intro]", "[Verse]", "[Pre-Chorus]", "[Chorus]", "[Post-Chorus]",
  "[Bridge]", "[Instrumental]", "[Break]", "[Outro]",
];

// ── lyrics-box intent router ─────────────────────────────────────────────────
// Decide what ✨ does with whatever is in the lyrics box.
//   "enhance"  — box already holds complete lyrics
//   "brief"    — box holds an instruction / description ("슬픈 이별 이야기 1분")
//   "hook"     — box holds a 1–2 line fragment / mood ("음~~ 너를 미워해~~")
//   "empty"    — nothing there → seed from the style caption
export function lyricsIntent(text) {
  const s = String(text || "").trim();
  if (!s) return "empty";
  const hasTags = /\[(intro|verse|chorus|bridge|outro|pre-chorus|instrumental|break)\]/i.test(s);
  const metaLang = /(가사|만들어|써\s?줘|작사|이야기로|느낌의|느낌으로|짜리|분\s*짜리|write.*lyrics|about|make.*song)/i.test(s);
  const lineCount = s.split(/\n/).filter(l => l.trim()).length;
  if (hasTags) return "enhance";
  if (metaLang) return "brief";
  if (lineCount >= 4) return "enhance";
  return "hook";
}

export function loadState() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; }
}
export function saveState(s) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch {}
}

export function defaultState(saved) {
  saved = saved || {};
  return {
    engine: saved.engine || "acestep",   // "acestep" | "minimax"

    // MiniMax Music 3 models — set once in ⚙ Settings
    dit:  saved.dit  || "",
    clip: saved.clip || "",
    dav:  saved.dav  || "",

    // Ace-Step 1.5 models
    aceUnet:  saved.aceUnet  || "",
    aceClip1: saved.aceClip1 || "",
    aceClip2: saved.aceClip2 || "",
    aceVae:   saved.aceVae   || "",
    aceShift:       saved.aceShift       ?? 3,
    aceSamplerName: saved.aceSamplerName || "jkass_quality",
    aceScheduler:   saved.aceScheduler   || "sgm_uniform",
    // stage 1 always runs; stages 2 & 3 are sequential opt-in (3 needs 2 on)
    // all three stages default to cfg 1; migrate the old stage-1 default of cfg 0
    aceStages:      Array.isArray(saved.aceStages)
                    ? saved.aceStages.map((s, i) => ({ steps: s.steps, cfg: (i === 0 && (s.cfg === 0 || s.cfg == null)) ? 1 : s.cfg, on: i === 0 ? true : s.on !== false }))
                    : [{ steps: 30, cfg: 1, on: true }, { steps: 20, cfg: 1, on: true }, { steps: 15, cfg: 1, on: true }],
    // Ace-Step TextEncodeAceStepAudio1.5 params
    bpm:          saved.bpm          ?? 120,
    keyscale:     saved.keyscale     || "A minor",
    timesignature: saved.timesignature || "4",
    language:     saved.language     || "en",
    cfgScaleAce:  saved.cfgScaleAce  ?? 2.5,
    temperature:  saved.temperature  ?? 0.75,
    topP:         saved.topP         ?? 0.9,
    minP:         saved.minP         ?? 0,
    topKAce:      saved.topKAce      ?? 0,
    genAudioCodes: saved.genAudioCodes ?? true,

    // compose
    lyricsInput:  saved.lyricsInput  || "",   // free text the user typed (brief / hook / full)
    lyrics:       saved.lyrics       || "",   // the resolved tagged lyrics that get sent
    captionBrief: saved.captionBrief || "",   // short style description the user typed
    caption:      saved.caption      || "",   // the structured 3-heading caption that gets sent
    styleChips:   Array.isArray(saved.styleChips) ? saved.styleChips : [],
    styleFamily:  saved.styleFamily  || "",
    title:        saved.title        || "",
    instrumental: saved.instrumental ?? false,   // explicit — no lyrics, no auto lyric-gen
    vocalGender:  saved.vocalGender  || "auto",
    vocalStyle:   saved.vocalStyle   || "auto",
    voiceTone:    saved.voiceTone    || "auto",

    // additional options
    duration:  saved.duration  ?? DURATION_DEFAULT,
    steps:     saved.steps     ?? 30,
    cfg:       saved.cfg       ?? 1.7,
    cfgScale:  saved.cfgScale  ?? 1.7,
    topK:      saved.topK      ?? 50,
    sampler:   saved.sampler   || "euler",
    scheduler: saved.scheduler || "simple",
    seed:      saved.seed      ?? 0,
    seedMode:  saved.seedMode  || "random",
    batch:     saved.batch     ?? 1,
    tiledDecode: saved.tiledDecode ?? false,
    format:      saved.format      || "flac",
    audioQuality: saved.audioQuality || "V0",

    // album cover (Krea2 cross-tool)
    makeCover:  saved.makeCover  ?? true,
    coverBrief: saved.coverBrief || "",   // user's plain description; LLM turns it into a Krea2 prompt

    // LoRA — starts empty; "+ Add LoRA" adds rows. Drop any leftover placeholder ("none") rows.
    loras: (Array.isArray(saved.loras) ? saved.loras : [])
      .filter(l => l && l.name && l.name !== "none")
      .slice(0, LORA_MAX)
      .map(l => ({ name: l.name, strength: l.strength ?? 1.0, enabled: l.enabled !== false })),

    // LLM
    llmBackend:   saved.llmBackend   || "local",
    llmModel:     saved.llmModel     || "",     // local backend: GGUF file
    llmOrModel:   saved.llmOrModel   || "",     // openrouter backend: model id
    llmClip:      saved.llmClip      || "",     // comfy backend: CLIP/GGUF file for TextGenerate
    llmClipType:  saved.llmClipType  || "qwen_image",

    // per-engine snapshots (the other engine's fields live here while it's not active)
    engineStash: (saved.engineStash && typeof saved.engineStash === "object") ? saved.engineStash : {},

    // UI
    advanced:   saved.advanced   ?? true,   // Simple | Advanced
    continuous: saved.continuous ?? true,   // player: auto-advance to next track
    leftW:      saved.leftW      ?? LEFT_W,  // compose panel width (drag to widen)
    lyricsH:    saved.lyricsH    ?? 160,    // resizable field heights
    styleH:     saved.styleH     ?? 160,

    saveSubfolder: saved.saveSubfolder || "",
    filenamePrefix: saved.filenamePrefix || "MMM",
  };
}

export function el(tag, props, children) {
  const node = document.createElement(tag);
  if (props) {
    for (const k in props) {
      if (k === "style") Object.assign(node.style, props.style);
      else if (k === "text") node.textContent = props.text;
      else if (k === "html") node.innerHTML = props.html;
      else if (k === "className" || k === "class") node.className = props[k];
      else if (k === "value") node.value = props[k];
      else if (k.startsWith("on") && typeof props[k] === "function") node.addEventListener(k.slice(2), props[k]);
      else node.setAttribute(k, props[k]);
    }
  }
  (children || []).forEach(c => { if (c) node.appendChild(c); });
  return node;
}
export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
export function randomSeed() { return Math.floor(Math.random() * 1e15); }

/** mm:ss from seconds */
export function fmtDur(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** A readable one-line summary of a track's render settings (playlist badge). */
export function settingsBadge(meta) {
  if (!meta) return "";
  const bits = [];
  if (meta.seconds) bits.push(fmtDur(meta.seconds));
  if (meta.steps) bits.push(`${meta.steps}st`);
  if (meta.sampler) bits.push(meta.sampler);
  if (meta.instrumental) bits.push("instrumental");
  return bits.join(" · ");
}

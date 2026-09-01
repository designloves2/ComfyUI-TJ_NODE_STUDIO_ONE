// api_minimax.js — Backend communication for MiniMax H3 ONE STUDIO (TJ)
import { api } from "../../../scripts/api.js";
import { API, SUBFOLDER } from "./core_minimax.js";

export async function getModels() {
  const r = await api.fetchApi(`${API}/models`);
  return r.json();
}

// ── prompt sets ──────────────────────────────────────────────────────────────
export async function listPromptSets() {
  const r = await api.fetchApi(`${API}/prompt_sets`);
  const d = await r.json();
  return d.sets || [];
}
export async function getPromptSet(name) {
  const r = await api.fetchApi(`${API}/prompt_sets/get?name=${encodeURIComponent(name)}`);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
  return r.json();
}
export async function savePromptSet(payload) {
  const r = await api.fetchApi(`${API}/prompt_sets/save`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  const d = await r.json();
  if (!d.ok) throw new Error(d.error || "save failed");
  return d;
}
export async function deletePromptSet(name) {
  const r = await api.fetchApi(`${API}/prompt_sets/delete`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
  });
  const d = await r.json();
  if (!d.ok) throw new Error(d.error || "delete failed");
  return d;
}

export const MMH3_CORE_NODES = [
  "MiniMaxH3ImageToVideo", "MiniMaxH3ReferenceToVideo", "MiniMaxH3SigmaShift",
  "SamplerCustomAdvanced", "CreateVideo", "SaveVideo",
];
export const MMH3_OPTIONAL_NODES = [
  "PathchSageAttentionKJ", "ModelPreviewOverrideKJ", "ModelPatchTorchSettings",
  "MiniMaxH3MemoryEfficientSageAttentionPatch", "MiniMaxH3Cache", "ApplyMiniMaxH3FirstBlockCache",
  "ModelAttentionBackend", "H3SLAAttention", "TJ_FreeTextEncoderVRAM",
  // Saganaki22/ComfyUI-sol-attn — H3-specific sparse attention + AdaLN fusion
  "MiniMaxH3ScheduledSolAttentionPatch", "MiniMaxH3FusedModulation",
  "MiniMaxH3TurboSampler", "MiniMaxH3TurboLoRA", "MiniMaxH3PDDAccApply", "SolAttnPatch",
  "SpectrumApplyMiniMaxH3", "RTXVideoSuperResolution", "TJ_RTXDeblur",
  // gallery post-processing — upscale / frame interpolation on a finished clip
  "UpscaleModelLoader", "ImageUpscaleWithModel", "RIFEInterpolation",
  // reference video / audio inputs
  "VHS_LoadVideo", "LoadAudio", "TrimAudioDuration",
  // Audio Lock — pins the real soundtrack into the AV latent (ships with TJ_NODE)
  "TJ_H3_AudioLock",
  // One-Take — latent-level continuation (Continuity: One-Take)
  "TJ_H3_LatentContinuation", "TJ_H3_SaveLatentCheckpoint", "TJ_H3_LoadLatentCheckpoint",
  // Native Image -> Brief vision pipeline (no Ollama needed)
  "TJ_MultiImageLoader", "TextGenerate", "TJStudioOneTextOutput",
];

/**
 * The file lists the loader nodes themselves accept, read straight from their COMBO
 * options — guaranteed to match what prompt validation will allow.
 */
export async function getMediaFiles() {
  const grab = async (node, field) => {
    try {
      const r = await api.fetchApi(`/object_info/${node}`);
      if (!r.ok) return [];
      const d = await r.json();
      const inp = d?.[node]?.input;
      const spec = (inp?.required || {})[field] || (inp?.optional || {})[field];
      const opts = Array.isArray(spec?.[0]) ? spec[0] : (spec?.[1]?.options || []);
      return Array.isArray(opts) ? opts.filter(x => typeof x === "string") : [];
    } catch { return []; }
  };
  const [videos, audios] = await Promise.all([
    grab("VHS_LoadVideo", "video"),
    grab("LoadAudio", "audio"),
  ]);
  return { videos, audios };
}

/** Duration / audio-track presence for an input file (see the media_info route). */
export async function getMediaInfo(file) {
  try {
    const r = await api.fetchApi(`${API}/media_info?file=${encodeURIComponent(file)}`);
    if (!r.ok) return { ok: false };
    return await r.json();
  } catch { return { ok: false }; }
}

/** Upload a non-image asset (video/audio) into ComfyUI's input folder. */
export async function uploadMedia(file) {
  const fd = new FormData();
  fd.append("image", file);          // ComfyUI's upload endpoint takes the "image" field
  fd.append("subfolder", "");
  fd.append("type", "input");
  const r = await api.fetchApi("/upload/image", { method: "POST", body: fd });
  if (!r.ok) throw new Error(`upload failed (${r.status}) — put the file in ComfyUI's input folder instead`);
  const d = await r.json();
  return d.name;
}

/** LiteGraph already knows every registered node type — no request needed. */
function registryAvailability(names) {
  const reg = (typeof LiteGraph !== "undefined" && LiteGraph.registered_node_types) || {};
  const out = {};
  for (const n of names) out[n] = !!reg[n];
  return out;
}

/**
 * Which pipeline nodes this install actually has, so the graph builder can skip the
 * optional ones instead of submitting a prompt that fails validation.
 *
 * The frontend registry is the primary source: it can't go stale against a backend that
 * hasn't been restarted since this pack was updated. The backend route is merged in as a
 * cross-check and for the core/missing summaries.
 */
export async function getNodeAvailability() {
  const all = [...MMH3_CORE_NODES, ...MMH3_OPTIONAL_NODES];
  const local = registryAvailability(all);
  let remote = {}, install = {};
  try {
    const r = await api.fetchApi(`${API}/node_availability`);
    const d = await r.json();
    remote = d.available || {};
    install = {
      install_dir: d.install_dir || "",
      install_script_win: d.install_script_win || "install_requirements.bat",
      install_script_nix: d.install_script_nix || "install_requirements.sh",
    };
  } catch { /* older backend or route missing — the registry still answers */ }

  const available = {};
  for (const n of all) available[n] = (n in remote) ? (remote[n] || local[n]) : local[n];
  const missingCore     = MMH3_CORE_NODES.filter(n => !available[n]);
  const missingOptional = MMH3_OPTIONAL_NODES.filter(n => !available[n]);
  return {
    ok: true, available,
    core_ok: missingCore.length === 0,
    missing_core: missingCore,
    missing_optional: missingOptional,
    ...install,
  };
}

export async function getConfig() {
  const r = await api.fetchApi(`${API}/config`);
  return r.json();
}

export async function saveConfig(patch) {
  return api.fetchApi(`${API}/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export async function uploadImage(file) {
  const fd = new FormData();
  fd.append("image", file);
  fd.append("subfolder", "");
  fd.append("type", "input");
  const r = await api.fetchApi("/upload/image", { method: "POST", body: fd });
  const d = await r.json();
  return d.name;
}

export async function getGallery({ offset = 0, limit = 20, subfolder = SUBFOLDER, favonly = false } = {}) {
  const r = await api.fetchApi(`${API}/gallery?offset=${offset}&limit=${limit}&subfolder=${encodeURIComponent(subfolder)}&favonly=${favonly ? 1 : 0}`);
  return r.json();
}

/** Clips written by this node, newest first (the shared gallery only lists PNGs). */
export async function listVideos(subfolder, { offset = 0, limit = 120 } = {}) {
  const r = await api.fetchApi(`${API}/videos?offset=${offset}&limit=${limit}&subfolder=${encodeURIComponent(subfolder || SUBFOLDER)}`);
  return r.json();
}

export async function revealOutputFolder(subfolder) {
  try {
    const r = await api.fetchApi(`${API}/reveal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subfolder: subfolder || SUBFOLDER }),
    });
    if (r.status === 404) return { ok: false, error: "restart ComfyUI to enable this" };
    return await r.json();
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function deleteImage(filename, subfolder) {
  const r = await api.fetchApi(`${API}/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, subfolder }),
  });
  return r.json();
}

export async function openImageFolder(filename, subfolder) {
  const r = await api.fetchApi(`${API}/open_folder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, subfolder }),
  });
  return r.json();
}

// Copy a generated frame back into ComfyUI's input/ so the next clip can LoadImage it.
export async function copyOutputToInput(filename, subfolder, type) {
  const r = await api.fetchApi(`${API}/copy_to_input`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, subfolder: subfolder || "", type: type || "output" }),
  });
  const d = await r.json();
  if (!d.ok) throw new Error(d.error || "copy failed");
  return d.filename;
}

// VRAM + system RAM right now. Sampled during a run so the extremes land in the clip's
// metadata: a render that spills to system RAM (and then to the pagefile) never errors,
// it just takes tens of times longer, and without these numbers that is indistinguishable
// from a hang after the fact.
export async function getVramStats() {
  try {
    const r = await api.fetchApi(`${API}/vram_stats`);
    return await r.json();
  } catch { return null; }
}

// fps / width / height / frame count — used to size chunked post-processing so a
// VHS_LoadVideo call never has to materialize more frames than memory allows.
export async function getVideoInfo(filename, subfolder, type) {
  const r = await api.fetchApi(`${API}/video_info`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, subfolder: subfolder || "", type: type || "input" }),
  });
  const d = await r.json();
  if (!d.ok) throw new Error(d.error || "video_info failed");
  return d;
}

// Take back a file copy_to_input made. Every call there mints a fresh uuid-named copy, so
// anything that copies a source in just to feed a one-off graph has to clean up after
// itself or the input folder grows forever.
export async function discardInputCopy(filename) {
  if (!filename) return;
  await api.fetchApi(`${API}/discard_input`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename }),
  }).catch(() => {});
}

export async function setLastResult(nodeId, { image, videoPath } = {}) {
  const body = { unique_id: String(nodeId) };
  if (image !== undefined)     body.image = image;
  if (videoPath !== undefined) body.video_path = videoPath;
  await api.fetchApi(`${API}/set_last_image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {});
}

// Concatenate the per-clip videos server-side (ffmpeg).
export async function stitchClips(clips, filenamePrefix, trimSeconds, overlapSeconds, overrideAudio) {
  const r = await api.fetchApi(`${API}/stitch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clips, filename_prefix: filenamePrefix, trim_seconds: trimSeconds ?? null,
      overlap_seconds: overlapSeconds ?? null, override_audio: overrideAudio || null,
    }),
  });
  const d = await r.json();
  if (!d.ok) throw new Error(d.error || "stitch failed");
  return d;
}

/** Copy a rendered clip's last frame into input/ (to seed a continuation). Returns the
 *  input-folder filename. */
export async function getClipLastFrame(filename, subfolder = "") {
  const r = await api.fetchApi(`${API}/clip_last_frame`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, subfolder }),
  });
  const d = await r.json();
  if (!d.ok || !d.filename) throw new Error(d.error || "could not read the last frame");
  return d.filename;
}

export async function getSystemPrompt(name = "minimax") {
  try {
    const r = await api.fetchApi(`${API}/llm/system_prompt?name=${encodeURIComponent(name)}`);
    if (r.status === 404) return { ok: false, instruction: "", needsRestart: true };
    return await r.json();
  } catch {
    return { ok: false, instruction: "" };
  }
}

export async function enhancePrompt(payload) {
  const r = await api.fetchApi(`${API}/llm/enhance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const d = await r.json();
  if (!d.ok) throw new Error(d.error || "enhance failed");
  return d;
}

// Trigger words baked into a LoRA's safetensors header, so a freshly picked LoRA can
// fill its own trigger field instead of the user hunting for it.
export async function getLoraTriggers(loraName) {
  const r = await api.fetchApi(`${API}/lora_triggers?name=${encodeURIComponent(loraName)}`);
  return await r.json();
}

export async function saveMeta(filename, subfolder, stateObj) {
  try {
    await api.fetchApi(`${API}/save_meta`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, subfolder: subfolder || "", meta: stateObj }),
    });
  } catch (e) { console.warn("[MMH3] saveMeta:", e); }
}

// Of a clip's trailing frames, the newest one that is not a fade-to-black. Returns null
// when nothing is usable, so the caller can fall back to the plain last frame.
export async function pickChainFrame(images) {
  try {
    const r = await api.fetchApi(`${API}/pick_chain_frame`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images }),
    });
    const d = await r.json();
    return d.ok ? d : null;
  } catch (e) { console.warn("[MMH3] pickChainFrame:", e); return null; }
}

// Free VRAM between clips. ComfyUI keeps models resident between prompts, so an explicit
// /free with `unload_models` is what actually drops them.
export async function freeMemory({ unloadModels = true, emptyCache = true } = {}) {
  try {
    await api.fetchApi("/free", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unload_models: unloadModels, free_memory: emptyCache }),
    });
  } catch {}
}

export async function interrupt() {
  try { await api.fetchApi("/interrupt", { method: "POST" }); } catch {}
}

/**
 * Submit one graph and resolve with its outputs.
 * Resolves with { images, videos, byNode } where `byNode` is the raw executed payload
 * keyed by node id — the relay loop needs specific nodes (clip video, last frame).
 */
export function queuePrompt(promptGraph, { onProgress, onNode, onQueued } = {}) {
  return new Promise(async (resolve, reject) => {
    let promptId = null, settled = false;
    const outputs = {};
    const finish = (fn, arg) => { if (settled) return; settled = true; cleanup(); fn(arg); };

    const onProgressEvt = (ev) => {
      if (!onProgress) return;
      try {
        const { value, max } = ev.detail || {};
        if (max) onProgress(value, max);
      } catch {}
    };
    const onExecutedEvt = (ev) => {
      const d = ev.detail || {};
      if (d.prompt_id && promptId && d.prompt_id !== promptId) return;
      if (d.node != null && d.output) {
        outputs[d.node] = d.output;
        try { onNode?.(d.node, d.output); } catch {}
      }
    };
    const onSuccess = (ev) => {
      const d = ev.detail || {};
      if (d.prompt_id && promptId && d.prompt_id !== promptId) return;
      finish(resolve, { byNode: outputs });
    };
    const onExecError = (ev) => {
      const d = ev.detail || {};
      if (d.prompt_id && promptId && d.prompt_id !== promptId) return;
      finish(reject, new Error(d.exception_message || "generation failed"));
    };
    const onCancelled = (ev) => {
      const d = ev.detail || {};
      if (d.prompt_id && promptId && d.prompt_id !== promptId) return;
      finish(reject, new Error("cancelled"));
    };
    // Safety net: on a flaky link (a backgrounded mobile tab over the tunnel) the
    // websocket can drop mid-run, so execution_success never arrives even though the
    // prompt finished. Poll /history for the same prompt and settle from there.
    async function pollHistory() {
      while (!settled) {
        await new Promise(r => setTimeout(r, 5000));
        if (settled || !promptId) continue;
        try {
          const r = await api.fetchApi(`/history/${promptId}`);
          const entry = (await r.json())[promptId];
          if (!entry || !entry.status) continue;
          if (entry.status.status_str === "error") {
            const msg = (entry.status.messages || [])
              .map(m => Array.isArray(m) ? m.join(" ") : String(m)).join("; ");
            finish(reject, new Error(msg || "generation failed"));
          } else if (entry.status.completed) {
            finish(resolve, { byNode: entry.outputs || outputs });
          }
        } catch { /* keep polling */ }
      }
    }
    function cleanup() {
      api.removeEventListener("progress",            onProgressEvt);
      api.removeEventListener("executed",            onExecutedEvt);
      api.removeEventListener("execution_success",   onSuccess);
      api.removeEventListener("execution_error",     onExecError);
      api.removeEventListener("execution_cancelled", onCancelled);
      api.removeEventListener("execution_interrupted", onCancelled);
    }
    api.addEventListener("progress",            onProgressEvt);
    api.addEventListener("executed",            onExecutedEvt);
    api.addEventListener("execution_success",   onSuccess);
    api.addEventListener("execution_error",     onExecError);
    api.addEventListener("execution_cancelled", onCancelled);
    api.addEventListener("execution_interrupted", onCancelled);

    try {
      const resp = await api.fetchApi("/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptGraph, client_id: api.clientId }),
      });
      const data = await resp.json();
      if (data.error) {
        cleanup();
        const detail = data.node_errors ? ` (${Object.keys(data.node_errors).join(", ")})` : "";
        reject(new Error((data.error.message || "queue failed") + detail));
        return;
      }
      promptId = data.prompt_id;
      try { onQueued?.(promptId); } catch {}
      pollHistory();
    } catch (e) { finish(reject, e); }
  });
}

/**
 * Waits on a prompt that's ALREADY queued (from before a page reload), instead of
 * submitting a new one. Polls `/history/{promptId}` rather than trusting websocket
 * `executed` events, since some of those may have already fired — and been missed —
 * before this listener existed. Once ComfyUI's history shows it done, returns the same
 * `{ byNode }` shape queuePrompt() resolves with, so callers don't need to care which one
 * actually ran.
 */
export async function waitForHistory(promptId, { onProgress, pollMs = 1500 } = {}) {
  const onProgressEvt = (ev) => {
    if (!onProgress) return;
    try {
      const d = ev.detail || {};
      if (d.prompt_id && d.prompt_id !== promptId) return;
      const { value, max } = d;
      if (max) onProgress(value, max);
    } catch {}
  };
  api.addEventListener("progress", onProgressEvt);
  try {
    while (true) {
      const r = await api.fetchApi(`/history/${promptId}`);
      const d = await r.json();
      const entry = d[promptId];
      if (entry && entry.status) {
        if (entry.status.status_str === "error") {
          const msg = (entry.status.messages || [])
            .map(m => Array.isArray(m) ? m.join(" ") : String(m)).join("; ");
          throw new Error(msg || "generation failed");
        }
        if (entry.status.completed) return { byNode: entry.outputs || {} };
      }
      await new Promise(res => setTimeout(res, pollMs));
    }
  } finally {
    api.removeEventListener("progress", onProgressEvt);
  }
}

/** Raw /history entry for a prompt, or null if ComfyUI has no record of it (never ran,
 *  or the history was cleared). Used to decide whether a stashed job is still resumable. */
export async function historyEntry(promptId) {
  try {
    const r = await api.fetchApi(`/history/${promptId}`);
    return (await r.json())[promptId] || null;
  } catch { return null; }
}

/**
 * Native Image → Brief analysis — no Ollama, no HTTP proxy. Batches the given images
 * through TJ_MultiImageLoader and hands the batch to TextGenerate on the given CLIP
 * checkpoint in one call, which was verified to attend to every image in the batch
 * correctly (SPEC_MINIMAX_H3_NEXT_ROUND.md §C5) — unlike Ollama's `images` array, which
 * was tested and only ever looked at one of them (§C0).
 *
 * `images` are filenames already in ComfyUI's input folder (as uploadImage() returns).
 * Runs as a small side graph through the normal /prompt queue, same as a generation —
 * it costs a real queue turn and whatever the CLIP takes to load, not an instant HTTP
 * round trip.
 */
export async function analyzeImagesNative(clipName, images, promptText) {
  const g = {
    clip:   { class_type: "CLIPLoader", inputs: { clip_name: clipName, type: "minimax", device: "default" } },
    batch:  { class_type: "TJ_MultiImageLoader", inputs: {
      image_paths_json: JSON.stringify(images),
      auto_set: true,
      match_mode: "Megapixel",
      resize_input: "none",
      edge_size: 1024,
      custom_width: 1024,
      custom_height: 1536,
      megapixel: 1.0,
      interpolation: "lanczos",
      scale_method: "Center Crop",
      batch_select: "",
    }},
    gen:    { class_type: "TextGenerate", inputs: {
      clip: ["clip", 0],
      prompt: promptText,
      image: ["batch", 0],
      max_length: 1024,
      sampling_mode: "on",
      "sampling_mode.temperature": 0.7,
      "sampling_mode.top_k": 64,
      "sampling_mode.top_p": 0.95,
      "sampling_mode.min_p": 0.05,
      "sampling_mode.repetition_penalty": 1.05,
      "sampling_mode.seed": 0,
      thinking: false,
      use_default_template: true,
    }},
    out:    { class_type: "TJStudioOneTextOutput", inputs: { text: ["gen", 0] } },
  };
  const res = await queuePrompt(g);
  const text = res.byNode?.out?.text?.[0];
  if (!text) throw new Error("native analysis produced no text");
  return text;
}

/**
 * Native brief writing — the text-only counterpart to analyzeImagesNative(), used when
 * visionSource is "native" so the whole Image → Brief pass stays off Ollama. Same
 * TextGenerate node, just no image input; the system + user prompt are concatenated
 * into TextGenerate's single `prompt` field since it has no separate system role.
 */
export async function writeBriefNative(clipName, systemPrompt, userPrompt) {
  const g = {
    clip: { class_type: "CLIPLoader", inputs: { clip_name: clipName, type: "minimax", device: "default" } },
    gen:  { class_type: "TextGenerate", inputs: {
      clip: ["clip", 0],
      prompt: `${systemPrompt}\n\n${userPrompt}`,
      max_length: 2048,
      sampling_mode: "on",
      "sampling_mode.temperature": 0.7,
      "sampling_mode.top_k": 64,
      "sampling_mode.top_p": 0.95,
      "sampling_mode.min_p": 0.05,
      "sampling_mode.repetition_penalty": 1.05,
      "sampling_mode.seed": 0,
      thinking: false,
      use_default_template: true,
    }},
    out:  { class_type: "TJStudioOneTextOutput", inputs: { text: ["gen", 0] } },
  };
  const res = await queuePrompt(g);
  const text = res.byNode?.out?.text?.[0];
  if (!text) throw new Error("native brief writer produced no text");
  return text;
}


/**
 * Which of these input-folder filenames are gone.
 *
 * Asked as one request rather than a HEAD per file: a prompt set can reference a dozen
 * assets across its clips, and a load should not cost a dozen round trips.
 */
export async function missingInputFiles(names) {
  const list = [...new Set((names || []).filter(Boolean))];
  if (!list.length) return [];
  try {
    const r = await api.fetchApi("/tj_shared/input_exists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ names: list }),
    });
    if (!r.ok) return [];
    return (await r.json()).missing || [];
  } catch { return []; }
}

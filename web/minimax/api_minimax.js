// api_minimax.js — Backend communication for MiniMax H3 ONE STUDIO (TJ)
import { api } from "../../../scripts/api.js";
import { API, SUBFOLDER } from "./core_minimax.js";

export async function getModels() {
  const r = await api.fetchApi(`${API}/models`);
  return r.json();
}

// Which pipeline nodes this install actually has. The graph builder skips optional
// ones instead of submitting a prompt that would fail validation.
export async function getNodeAvailability() {
  try {
    const r = await api.fetchApi(`${API}/node_availability`);
    return await r.json();
  } catch {
    return { ok: false, available: {}, core_ok: false, missing_core: [], missing_optional: [] };
  }
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
export async function stitchClips(clips, filenamePrefix, trimSeconds) {
  const r = await api.fetchApi(`${API}/stitch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clips, filename_prefix: filenamePrefix, trim_seconds: trimSeconds ?? null }),
  });
  const d = await r.json();
  if (!d.ok) throw new Error(d.error || "stitch failed");
  return d;
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

// Free VRAM between clips. ComfyUI already unloads between prompts, but an explicit
// /free also drops cached models when `unload_models` is set.
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
export function queuePrompt(promptGraph, { onProgress, onNode } = {}) {
  return new Promise(async (resolve, reject) => {
    let promptId = null;
    const outputs = {};

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
      cleanup();
      resolve({ byNode: outputs });
    };
    const onExecError = (ev) => {
      const d = ev.detail || {};
      if (d.prompt_id && promptId && d.prompt_id !== promptId) return;
      cleanup();
      reject(new Error(d.exception_message || "generation failed"));
    };
    const onCancelled = (ev) => {
      const d = ev.detail || {};
      if (d.prompt_id && promptId && d.prompt_id !== promptId) return;
      cleanup();
      reject(new Error("cancelled"));
    };
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
    } catch (e) { cleanup(); reject(e); }
  });
}

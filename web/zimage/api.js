// api.js — all communication with the Python backend and ComfyUI core API.
import { api } from "../../../scripts/api.js";
import { API, SUBFOLDER } from "./core.js";

export async function getModels() {
  const r = await api.fetchApi(`${API}/models`);
  return r.json();
}

export async function getSeedVR2Models() {
  const r = await api.fetchApi(`${API}/seedvr2_models`);
  return r.json();
}

export async function getLoraTriggers(loraName) {
  const r = await api.fetchApi(`${API}/lora_triggers?name=${encodeURIComponent(loraName)}`);
  return r.json();
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
  return d.name; // filename usable in a LoadImage node
}

// Upload a canvas-exported data: URL (e.g. from the sketch/mask tool) as an
// input image. Returns the filename usable in a LoadImage node.
export async function uploadDataURL(dataURL, filename = "canvas.png") {
  const res = await fetch(dataURL);
  const blob = await res.blob();
  const file = new File([blob], filename, { type: blob.type || "image/png" });
  return uploadImage(file);
}

export async function getGallery({ offset = 0, limit = 20, subfolder = SUBFOLDER, favonly = false } = {}) {
  const r = await api.fetchApi(`${API}/gallery?offset=${offset}&limit=${limit}&subfolder=${encodeURIComponent(subfolder)}&favonly=${favonly ? 1 : 0}`);
  return r.json();
}

export async function updateImageMeta(filename, subfolder, patch) {
  const r = await api.fetchApi(`${API}/update_meta`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, subfolder, patch }),
  });
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

// Copy an output image into the input directory so other modes can use it as a source.
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

// Notify Python backend of the last generated image (for the IMAGE output slot).
export async function setLastImage(nodeId, im) {
  await api.fetchApi(`${API}/set_last_image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ unique_id: String(nodeId), image: im }),
  }).catch(() => {});
}

// Queue a built prompt graph and resolve once it has produced an image
// (or reject on error / interruption). Calls onProgress(percent) along the way.
export function queuePrompt(promptGraph, { onProgress } = {}) {
  return new Promise(async (resolve, reject) => {
    let promptId = null;

    const onProgressEvt = (ev) => {
      if (!onProgress) return;
      try {
        const { value, max } = ev.detail || {};
        if (max) onProgress(Math.round((value / max) * 100));
      } catch (e) { /* ignore */ }
    };

    const onExecuted = (ev) => {
      try {
        if (ev.detail?.prompt_id && ev.detail.prompt_id !== promptId) return;
        cleanup();
        resolve(ev.detail);
      } catch (e) { cleanup(); reject(e); }
    };

    const onExecError = (ev) => {
      if (ev.detail?.prompt_id && ev.detail.prompt_id !== promptId) return;
      cleanup();
      reject(new Error(ev.detail?.exception_message || "generation failed"));
    };

    const onCancelled = (ev) => {
      if (ev.detail?.prompt_id && ev.detail.prompt_id !== promptId) return;
      cleanup();
      reject(new Error("cancelled"));
    };

    function cleanup() {
      api.removeEventListener("progress", onProgressEvt);
      api.removeEventListener("executed", onExecuted);
      api.removeEventListener("execution_error", onExecError);
      api.removeEventListener("execution_cancelled", onCancelled);
    }

    api.addEventListener("progress", onProgressEvt);
    api.addEventListener("executed", onExecuted);
    api.addEventListener("execution_error", onExecError);
    api.addEventListener("execution_cancelled", onCancelled);

    try {
      const resp = await api.fetchApi("/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptGraph, client_id: api.clientId }),
      });
      const data = await resp.json();
      if (data.error) {
        cleanup();
        reject(new Error(data.error.message || "queue failed"));
        return;
      }
      promptId = data.prompt_id;
    } catch (e) {
      cleanup();
      reject(e);
    }
  });
}

export async function interrupt() {
  try { await api.fetchApi("/interrupt", { method: "POST" }); } catch (e) { /* ignore */ }
}

// Get all valid sampler + scheduler options from ComfyUI
export async function getKSamplerOptions() {
  try {
    const r = await api.fetchApi("/object_info/KSampler");
    const d = await r.json();
    const inp = d?.KSampler?.input?.required;
    return {
      samplers: inp?.sampler_name?.[0] || ["euler"],
      schedulers: inp?.scheduler?.[0] || ["simple"],
    };
  } catch { return { samplers: ["euler"], schedulers: ["simple"] }; }
}

// Unload models from RAM/VRAM
export async function freeMemory() {
  try {
    const r = await api.fetchApi("/z_image_turbo/free_memory", { method: "POST", headers: {"Content-Type":"application/json"}, body: "{}" });
    return r.json();
  } catch { return {ok: false}; }
}

// Save generation state as metadata alongside the image
export async function saveMeta(filename, subfolder, stateObj) {
  // Strip large binary fields before saving
  const meta = Object.fromEntries(
    Object.entries(stateObj).filter(([k]) => !["inpaintMaskOverlay","inpaintMaskDataURL"].includes(k))
  );
  try {
    await api.fetchApi(`${API}/save_meta`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ filename, subfolder: subfolder||"", meta }),
    });
  } catch(e) { console.warn("[ZIT] saveMeta failed:", e); }
}

// Load metadata for an image
export async function loadMeta(filename, subfolder) {
  try {
    const r = await api.fetchApi(`${API}/meta?filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder||"")}`);
    const d = await r.json();
    return d.ok ? d.meta : null;
  } catch { return null; }
}

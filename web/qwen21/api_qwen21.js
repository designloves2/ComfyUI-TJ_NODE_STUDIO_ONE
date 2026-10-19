// api_qwen21.js — Backend communication for Qwen Image 2.1 ONE (TJ)
import { api } from "../../../scripts/api.js";
import { API, SUBFOLDER } from "./core_qwen21.js";

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
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
  });
}
export async function uploadImage(file) {
  // Lets a gallery-picked filename (already in input/, no upload needed) flow through the
  // same onUpload/state-set call sites every image-upload card already has.
  if (typeof file === "string") return file;
  const fd = new FormData();
  fd.append("image", file);
  fd.append("subfolder", "");
  fd.append("type", "input");
  const r = await api.fetchApi("/upload/image", { method: "POST", body: fd });
  const d = await r.json();
  return d.name;
}
// Uploads a canvas-drawn annotation (dataURL from ui_mask_draw.js's commit action) through
// the same /upload/image route as any other reference image — no separate route needed,
// the drawing tool just needs to turn its canvas into a File first (see ui_mask_draw.js).
// 3D pose files (GLB …) under output/<subfolder>/pose: list, and store one picked from disk.
export async function listPoseModels(subfolder) {
  const r = await api.fetchApi(`${API}/pose_models?subfolder=${encodeURIComponent(subfolder)}`);
  return (await r.json()).files || [];
}
export async function uploadPoseThumb(blob, subfolder, name) {
  const fd = new FormData();
  fd.append("file", blob, "thumb.png"); fd.append("subfolder", subfolder); fd.append("name", name);
  await api.fetchApi(`${API}/pose_thumb`, { method: "POST", body: fd });
}
export async function cleanupPoseInput(filename) {
  await api.fetchApi(`${API}/pose_input_cleanup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename }) });
}
export async function deletePoseModel(subfolder, name) {
  await api.fetchApi(`${API}/pose_delete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subfolder, name }) });
}
export async function uploadPoseModel(file, subfolder) {
  const fd = new FormData();
  fd.append("file", file); fd.append("subfolder", subfolder);
  const d = await (await api.fetchApi(`${API}/pose_upload`, { method: "POST", body: fd })).json();
  if (!d.ok) throw new Error(d.error || "upload failed");
  return d.name;
}
export async function uploadAnnotationBlob(blob, filenameHint) {
  const fd = new FormData();
  fd.append("image", blob, filenameHint || "annotation.png");
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
export async function updateImageMeta(filename, subfolder, patch) {
  const r = await api.fetchApi(`${API}/update_meta`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, subfolder, patch }),
  });
  return r.json();
}
export async function deleteImage(filename, subfolder) {
  const r = await api.fetchApi(`${API}/delete`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, subfolder }),
  });
  return r.json();
}
export async function openImageFolder(filename, subfolder) {
  const r = await api.fetchApi(`${API}/open_folder`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, subfolder }),
  });
  return r.json();
}
export async function copyOutputToInput(filename, subfolder, type) {
  const r = await api.fetchApi(`${API}/copy_to_input`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, subfolder: subfolder || "", type: type || "output" }),
  });
  const d = await r.json();
  if (!d.ok) throw new Error(d.error || "copy failed");
  return d.filename;
}
export async function setLastImage(nodeId, im, run) {
  await api.fetchApi(`${API}/set_last_image`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ unique_id: String(nodeId), image: im, run }),
  }).catch(() => {});
}
export function queuePrompt(promptGraph, { onProgress, outputKey = "images" } = {}) {
  return new Promise(async (resolve, reject) => {
    let promptId = null, poll = null;
    const onProg = ev => {
      if (!onProgress) return;
      try { const { value, max } = ev.detail || {}; if (max) onProgress(Math.round((value / max) * 100)); } catch {}
    };
    const onExec  = ev => { try { if (ev.detail?.prompt_id && ev.detail.prompt_id !== promptId) return; if (!ev.detail?.output?.[outputKey]?.length) return; cleanup(); resolve(ev.detail); } catch(e) { cleanup(); reject(e); } };
    const onErr   = ev => { if (ev.detail?.prompt_id && ev.detail.prompt_id !== promptId) return; cleanup(); reject(new Error(ev.detail?.exception_message || "generation failed")); };
    const onCanc  = ev => { if (ev.detail?.prompt_id && ev.detail.prompt_id !== promptId) return; cleanup(); reject(new Error("cancelled")); };
    function cleanup() {
      clearInterval(poll);
      api.removeEventListener("progress", onProg);
      api.removeEventListener("executed", onExec);
      api.removeEventListener("execution_error", onErr);
      api.removeEventListener("execution_cancelled", onCanc);
    }
    api.addEventListener("progress", onProg);
    api.addEventListener("executed", onExec);
    api.addEventListener("execution_error", onErr);
    api.addEventListener("execution_cancelled", onCanc);
    try {
      const resp = await api.fetchApi("/prompt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: promptGraph, client_id: api.clientId }) });
      const data = await resp.json();
      if (data.error) { cleanup(); reject(new Error(data.error.message || "queue failed")); return; }
      promptId = data.prompt_id;
      // The websocket 'executed' event can be missed (reload, reconnect); the history says the same thing.
      poll = setInterval(async () => {
        try {
          const e = (await (await api.fetchApi(`/history/${promptId}`)).json())[promptId];
          if (!e) return;
          if (e.status?.status_str === "error") { cleanup(); reject(new Error("generation failed")); return; }
          const out = Object.values(e.outputs || {}).find(o => o?.[outputKey]?.length);
          if (out) { cleanup(); resolve({ prompt_id: promptId, output: out }); }
        } catch { /* try again on the next tick */ }
      }, 2500);
    } catch(e) { cleanup(); reject(e); }
  });
}
export async function interrupt() {
  try { await api.fetchApi("/interrupt", { method: "POST" }); } catch {}
}
export async function loadMeta(filename, subfolder) {
  try {
    const r = await api.fetchApi(`${API}/meta?filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder || "")}`);
    const d = await r.json();
    return d.ok ? d.meta : null;
  } catch { return null; }
}
export async function saveMeta(filename, subfolder, stateObj) {
  try {
    const meta = Object.fromEntries(Object.entries(stateObj).filter(([k]) => !["upscaleImageData"].includes(k)));
    await api.fetchApi(`${API}/save_meta`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, subfolder: subfolder || "", meta }),
    });
  } catch(e) { console.warn("[QWEN21] saveMeta:", e); }
}

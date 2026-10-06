// reflib_api.js — client for ComfyUI-TJ_NODE's Reference Asset Library REST (/tj_node/reflib).
// The library itself lives in TJ_NODE; this pack only reads and edits it through these routes.
// Every call returns the route's JSON ({ ok, ... } or { ok:false, code, detail }).
import { api } from "../../../scripts/api.js";

const BASE = "/tj_node/reflib";

async function call(path, options) {
  try {
    const r = await api.fetchApi(BASE + path, options);
    return await r.json();
  } catch (e) {
    return { ok: false, code: "UNREACHABLE", detail: String(e?.message || e) };
  }
}

const post = (path, body) => call(path, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}),
});

export const CATEGORIES = ["character", "background", "prop", "music", "voice", "video", "etc"];

export const reflib = {
  info: () => call("/info"),
  list: (kind) => call(`/assets?limit=5000${kind ? `&kind=${encodeURIComponent(kind)}` : ""}`),
  detail: (id) => call(`/assets/${id}`),
  waveform: (id, bins = 600) => call(`/waveform/${id}?bins=${bins}`),
  update: (id, body) => post(`/assets/${id}/update`, body),
  remove: (id, force) => post(`/assets/${id}/delete`, { force: !!force }),
  upload(file, { category, subcategory = "", name = "" }) {
    const form = new FormData();
    form.append("file", file);
    form.append("category", category);
    if (subcategory) form.append("subcategory", subcategory);
    form.append("name", name || file.name.replace(/\.[^.]+$/, ""));
    return call("/assets", { method: "POST", body: form });
  },
  replace(id, file) {
    const form = new FormData();
    form.append("file", file);
    return call(`/assets/${id}/replace`, { method: "POST", body: form });
  },
  thumbUrl: (a) => api.apiURL(`${BASE}/thumb/${a.id}?v=${Math.round(a.updated || 0)}`),
  memberThumbUrl: (id) => api.apiURL(`${BASE}/thumb/${id}`),
  fileUrl: (a) => api.apiURL(`${BASE}/file/${a.id}?v=${Math.round(a.updated || 0)}`),
};

/** "CODE: detail" for a failed reply. */
export function reflibError(r) {
  return `${r?.code || "ERROR"}: ${r?.detail || "request failed"}`;
}

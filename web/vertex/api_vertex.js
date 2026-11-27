// api_vertex.js — server calls for Vertex Image ONE STUDIO (TJ)
import { api } from "../../../scripts/api.js";
import { API, SUBFOLDER } from "./core_vertex.js";

export async function call(path, body) {
  const r = await api.fetchApi(API + path, body === undefined ? {} :
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

export const viewUrl = (img, t = "") =>
  `/view?filename=${encodeURIComponent(img.file)}&subfolder=${encodeURIComponent(img.sub || "")}&type=output${t ? `&t=${t}` : ""}`;

export async function listImages(subfolder, { offset = 0, limit = 120 } = {}) {
  const r = await api.fetchApi(`${API}/images?offset=${offset}&limit=${limit}&subfolder=${encodeURIComponent(subfolder || SUBFOLDER)}`);
  return r.json();
}
export async function revealOutputFolder(subfolder) {
  try { return await call("/reveal", { subfolder: subfolder || SUBFOLDER }); }
  catch (e) { return { ok: false, error: String(e.message || e) }; }
}
export async function deleteImage(filename, subfolder) {
  const r = await api.fetchApi(`${API}/delete`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, subfolder }) });
  return r.json();
}
/** Gallery pick mode: copies the picked output image into input/ (reference slots hold input/ filenames, like H3). */
export async function copyOutputToInput(filename, subfolder) {
  const d = await call("/copy_to_input", { filename, subfolder: subfolder || "", type: "output" });
  if (!d.ok) throw new Error(d.error || "copy failed");
  return d.filename;
}

export async function urlToDataUri(url) {
  const b = await (await fetch(url)).blob();
  return await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
}

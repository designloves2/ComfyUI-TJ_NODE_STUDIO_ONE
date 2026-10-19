// live_preview.js — live sampling preview for ONE STUDIO image nodes.
//
// ModelPreviewOverrideKJ (KJNodes) is put in front of every sampler's model and streams the decoded latent to the
// frontend over the `kj_preview_override` socket event, tagged with the KJ node's own graph id. The id is derived
// from this node's id so two nodes on one canvas never pick up each other's frames. No colon in it: ComfyUI reads
// `parent:child` as a dynamic-expansion path and hands back a truncated hidden.unique_id.
import { api } from "../../../scripts/api.js";

export const previewKey = nodeId => `ONE_preview_${nodeId}`;

let available = null;
async function hasPreviewNode() {
  if (available === null) {
    try { available = (await api.fetchApi("/object_info/ModelPreviewOverrideKJ")).ok; } catch { available = false; }
  }
  return available;
}

/** Put the preview node in front of every sampler's model in the graph about to be queued. */
export async function addLivePreview(graph, nodeId) {
  if (!(await hasPreviewNode())) return;
  const key = previewKey(nodeId);
  const links = new Map();                                  // one preview node per distinct model link
  for (const node of Object.values(graph)) {
    const model = node?.inputs?.model;
    if (!/Sampler/.test(node?.class_type ?? "") || !Array.isArray(model)) continue;
    if (!links.has(model.join())) {
      const id = `${key}_${links.size}`;
      links.set(model.join(), id);
      graph[id] = { class_type: "ModelPreviewOverrideKJ", inputs: {
        model, max_resolution: 1024, jpeg_quality: 100, suppress_default_preview: true,
        preview_frames: 1, preview_fps: 1,
      } };
    }
    node.inputs.model = [links.get(model.join()), 0];
  }
}

/** Paint the frames of this node's run through onFrame(dataUrl); the node id is read per event (it is not set yet while the UI is built); returns the stop function. */
export function listenLivePreview(node, onFrame) {
  const handler = ev => {
    const d = ev.detail || {};
    if (!String(d.node_id).startsWith(previewKey(node.id) + "_") || !d.image) return;
    onFrame(`data:${d.mime || "image/jpeg"};base64,${d.image}`, d.step, d.total);
  };
  api.addEventListener("kj_preview_override", handler);
  return () => api.removeEventListener("kj_preview_override", handler);
}

const bars = new WeakMap();

/** "Preview [n/total]" strip along the bottom of the preview box: black 50% overlay with a step progress bar. */
export function showStepBar(box, step, total) {
  let bar = bars.get(box);
  if (!bar) {
    const el = (css, parent) => { const e = document.createElement("div"); e.style.cssText = css; parent?.appendChild(e); return e; };
    const root = el("position:absolute;left:0;right:0;bottom:0;height:22px;background:rgba(0,0,0,0.5);z-index:11;pointer-events:none;overflow:hidden");
    const fill = el("position:absolute;left:0;top:0;bottom:0;width:0;background:rgba(167,139,250,0.55);transition:width .2s", root);
    const text = el("position:absolute;right:8px;top:0;bottom:0;display:flex;align-items:center;color:#fff;font:600 11px/1 sans-serif", root);
    bars.set(box, bar = { root, fill, text });
  }
  if (bar.root.parentNode !== box) box.appendChild(bar.root);   // the box is rebuilt (innerHTML) when the result lands, which drops the strip
  bar.fill.style.width = `${Math.min(100, (step / total) * 100)}%`;
  bar.text.textContent = `Preview [${step}/${total}]`;
}

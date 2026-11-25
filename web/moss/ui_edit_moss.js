// ui_edit_moss.js — EDIT left panel for Moss Image ONE STUDIO (TJ)
//
// One instruction + the source image (and up to 3 more references) go through TextEncodeMOSSImageEdit; the edit LoRA
// redraws the same frame with only the described change (official image_moss_image_edit graph).
import { C, el, clear, SAMPLERS, SCHEDULERS } from "./core_moss.js";
import { panel, label, button, select, numberField, row, col } from "../klein/ui_common.js";
import { createImageUpload } from "../krea2/ui_image_upload.js";
import { uploadImage, getObjectOptions } from "./api_moss.js";
import { buildEditGraph } from "./graph_builder_moss.js";
import { mountLoraSectionMoss } from "./ui_t2i_moss.js";
import { mountModeLora } from "./ui_i2i_moss.js";

const FALLBACK_FORMATS = ["Moss-Image-Edit", "ai-toolkit", "ai-toolkit (kv_cache off)"];
const MAX_REFS = 3;

export function mountEditLeft(leftEl, state, ctx) {
  const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } });
  leftEl.appendChild(wrap);

  // ── source image ──────────────────────────────────────────────────────────
  const { el: uploadEl, setFilename } = createImageUpload("Source Image", state.editImage || null, async f => {
    const name = await uploadImage(f);
    state.editImage = name; ctx.persist();
    return name;
  }, { maxPixels: 4 * 1024 * 1024 });
  wrap.appendChild(panel([uploadEl,
    el("div", { text: "Describe only the change in the prompt: \"Change only the X to Y. Keep the face, pose, background and composition unchanged.\"", style: { fontSize: "10px", color: C.muted, lineHeight: "1.4" } })]));

  // ── extra references (a garment, a face, a prop …) ────────────────────────
  const refsHolder = el("div");
  wrap.appendChild(refsHolder);
  function renderRefs() {
    clear(refsHolder);
    if (!Array.isArray(state.editRefs)) state.editRefs = [];
    const items = state.editRefs.map((file, i) => {
      const { el: up } = createImageUpload(`Reference ${i + 2}`, file || null, async f => {
        const name = await uploadImage(f);
        state.editRefs[i] = name; ctx.persist();
        return name;
      }, { maxPixels: 4 * 1024 * 1024 });
      const del = button("✕", () => { state.editRefs.splice(i, 1); ctx.persist(); renderRefs(); }, "danger");
      return el("div", { style: { display: "flex", gap: "4px", alignItems: "flex-start" } }, [el("div", { style: { flex: "1", minWidth: "0" } }, [up]), del]);
    });
    const kids = [label(`More references (up to ${MAX_REFS}) — say in the prompt what each is for`), ...items];
    if (state.editRefs.length < MAX_REFS) kids.push(button("+ Add reference", () => { state.editRefs.push(null); ctx.persist(); renderRefs(); }));
    refsHolder.appendChild(panel(kids));
  }
  renderRefs();

  // ── edit LoRA ─────────────────────────────────────────────────────────────
  mountModeLora(wrap, state, ctx, {
    title: "Edit LoRA (strength)", nameKey: "editLora", strengthKey: "editLoraStrength", match: /moss_image_edit_lora/i,
    hint: "moss_image_edit_lora_rank_64_bf16 (models/loras): the edit layout is trained into this LoRA.",
  });

  // ── edit format / image strength / size ───────────────────────────────────
  const fmtHolder = el("div");
  const fmtSel = formats => {
    clear(fmtHolder);
    const opts = formats.includes(state.editFormat) ? formats : [state.editFormat, ...formats];
    fmtHolder.appendChild(select(opts.map(f => ({ value: f, label: f })), state.editFormat, v => { state.editFormat = v; ctx.persist(); }));
  };
  fmtSel(FALLBACK_FORMATS);
  getObjectOptions("TextEncodeMOSSImageEdit", "edit_format").then(list => { if (list.length) fmtSel(list); });
  wrap.appendChild(panel([
    label("Edit format (must match the LoRA)"), fmtHolder,
    row([
      col([label("Image strength"), numberField(state.editImageStrength ?? 1, v => { state.editImageStrength = Math.max(0, Math.min(2, v || 0)); ctx.persist(); }, 0.05)]),
      col([label("Size (MP)"), numberField(state.editMp ?? 1, v => { state.editMp = Math.max(0.25, Math.min(4, v || 1)); ctx.persist(); }, 0.25)]),
    ]),
    el("div", { text: "The source and the references are scaled to this many megapixels (16 px steps); the result keeps the source's aspect ratio. About 0.26 MP is cheaper but looser: the model starts re-framing the subject.", style: { fontSize: "10px", color: C.muted, lineHeight: "1.4" } }),
  ]));

  // ── sampling (the values the LoRA author ships: 30 / 4 / euler / normal, skip layer guidance layer 22) ──
  wrap.appendChild(panel([
    row([
      col([label("Steps"), numberField(state.editSteps ?? 30, v => { state.editSteps = Math.max(1, Math.min(100, Math.round(v) || 1)); ctx.persist(); }, 1)]),
      col([label("CFG"), numberField(state.editCfg ?? 4, v => { state.editCfg = Math.max(0, Math.min(20, v || 0)); ctx.persist(); }, 0.25)]),
    ]),
    row([
      col([label("Sampler"), select(SAMPLERS.map(s => ({ value: s, label: s })), state.editSampler, v => { state.editSampler = v; ctx.persist(); })]),
      col([label("Scheduler"), select(SCHEDULERS.map(s => ({ value: s, label: s })), state.editScheduler, v => { state.editScheduler = v; ctx.persist(); })]),
    ]),
    el("div", { text: "CFG 4 matters: the negative branch is what stops accessories appearing out of nowhere. Skip layer guidance (layer 22) is always on for EDIT.", style: { fontSize: "10px", color: C.muted, lineHeight: "1.4" } }),
  ]));

  mountLoraSectionMoss(wrap, state, ctx);

  return {
    getSourceURL: () => state.editImage ? `/view?filename=${encodeURIComponent(state.editImage)}&type=input` : null,
    async getGraph() { return buildEditGraph(state); },
    setImage(name) { state.editImage = name; setFilename(name); ctx.persist(); },
  };
}

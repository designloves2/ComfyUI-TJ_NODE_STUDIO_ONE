// ui_inpaint_moss.js — INPAINT left panel for Moss Image ONE STUDIO (TJ)
//
// Same route as Z-Image's INPAINT: the source is VAE-encoded, the painted mask becomes a latent noise mask, and
// DifferentialDiffusion re-noises only the masked area. Checked against MOSS-Image: the painted region follows the
// prompt, the rest of the picture is kept.
import { C, el, BRAND, LEFT_W, snap16 } from "./core_moss.js";
import { panel, label, slider } from "../klein/ui_common.js";
import { createImageUpload } from "../krea2/ui_image_upload.js";
import { createInlineMaskEditor } from "../shared/mask_paint.js";
import { uploadImage } from "./api_moss.js";
import { buildInpaintGraph } from "./graph_builder_moss.js";
import { mountSharedSettings, mountLoraSectionMoss } from "./ui_t2i_moss.js";

export function mountInpaintLeft(leftEl, state, ctx) {
  const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } });
  leftEl.appendChild(wrap);

  const maskEditor = createInlineMaskEditor({
    state, ctx, imageField: "inpaintImage", maskField: "inpaintMask",
    dispW: LEFT_W - 24, filenamePrefix: "moss_inpaint_mask", accentColor: BRAND,
  });
  const { el: uploadEl, setFilename } = createImageUpload("Source Image", state.inpaintImage || null, async f => {
    const name = await uploadImage(f);
    state.inpaintImage = name; state.inpaintMask = null; ctx.persist();
    maskEditor.loadSourceImage(name);
    return name;
  }, {
    maxPixels: 4 * 1024 * 1024,
    onLoad: (w, h) => { state.inpaintWidth = snap16(w); state.inpaintHeight = snap16(h); ctx.persist(); },
  });
  wrap.appendChild(panel([label("Inpaint"), uploadEl]));
  wrap.appendChild(maskEditor.editorPanel);
  if (state.inpaintImage) maskEditor.loadSourceImage(state.inpaintImage);

  wrap.appendChild(panel([
    label("Denoise (1.0 = repaint the masked area freely)"),
    slider(0, 1, 0.01, state.inpaintDenoise ?? 1, v => { state.inpaintDenoise = v; ctx.persist(); }, v => v.toFixed(2)),
  ]));

  mountSharedSettings(wrap, state, ctx, { resolution: false });
  mountLoraSectionMoss(wrap, state, ctx);

  return {
    getSourceURL: () => state.inpaintImage ? `/view?filename=${encodeURIComponent(state.inpaintImage)}&type=input` : null,
    async beforeGenerate() {
      if (!state.inpaintImage) return;
      if (!state.inpaintMask) {
        const saved = await maskEditor.autoSaveMask().catch(() => false);
        if (!saved) throw new Error("Paint the mask area with the brush first.");
      }
    },
    async getGraph() { return buildInpaintGraph(state); },
    setImage(name) { state.inpaintImage = name; state.inpaintMask = null; setFilename(name); maskEditor.loadSourceImage(name); ctx.persist(); },
  };
}

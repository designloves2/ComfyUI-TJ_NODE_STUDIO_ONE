// ui_inpaint.js — INPAINT mode (inline mask editor + popup large editor, shared
// implementation: web/shared/mask_paint.js)
import { C, el, LEFT_W } from "./core.js";
import { panel, label, slider } from "./ui_common.js";
import { uploadImage } from "./api.js";
import { buildInpaintGraph } from "./graph_builder.js";
import { mountLoraSection } from "./ui_lora_section.js";
import { t } from "../shared/i18n.js";
import { createImageUpload } from "./ui_image_upload.js";
import { createInlineMaskEditor } from "../shared/mask_paint.js";

const DISP_W = LEFT_W - 24; // 276px

export function mountInpaintLeft(leftEl, state, ctx) {
  const wrap = el("div", { style:{ display:"flex", flexDirection:"column", gap:"6px" } });
  leftEl.appendChild(wrap);

  const { editorPanel, loadSourceImage, autoSaveMask } = createInlineMaskEditor({
    state, ctx, imageField: "inpaintImage", maskField: "inpaintMaskImage",
    dispW: DISP_W, filenamePrefix: "zit_mask", accentColor: C.lime,
  });

  const srcUp = createImageUpload({
    label: "Source Image",
    initialFilename: state.inpaintImage,
    onUpload: async f => {
      const n = await uploadImage(f);
      state.inpaintImage     = n;
      state.inpaintMaskImage = null;
      ctx.persist();
      loadSourceImage(n);
      return n;
    },
  });
  wrap.appendChild(panel([label("Source Image"), srcUp.el]));
  wrap.appendChild(editorPanel);

  if (state.inpaintImage) loadSourceImage(state.inpaintImage);

  wrap.appendChild(panel([
    label("Denoise"),
    el("div", {
      text: t("inpaint_denoise_desc"),
      style:{ color:C.muted, fontSize:"10px", marginBottom:"4px" },
    }),
    slider(0.1, 1, 0.01, state.inpaintDenoise ?? 0.85,
      v => { state.inpaintDenoise = v; ctx.persist(); },
      v => v.toFixed(2)),
  ]));

  mountLoraSection(wrap, state, ctx);

  return {
    setImage(name) {
      state.inpaintImage = name; state.inpaintMaskImage = null;
      srcUp.setFilename(name); loadSourceImage(name);
      ctx.persist();
    },
    beforeGenerate: async () => {
      if (!state.inpaintImage) throw new Error("소스 이미지를 업로드하세요.");
      if (!state.inpaintMaskImage) {
        const saved = await autoSaveMask().catch(() => false);
        if (!saved) throw new Error(t("inpaint_no_mask"));
      }
    },
    getGraph() { return buildInpaintGraph(state); },
    getSourceURL() {
      return state.inpaintImage
        ? `/view?filename=${encodeURIComponent(state.inpaintImage)}&type=input`
        : null;
    },
  };
}

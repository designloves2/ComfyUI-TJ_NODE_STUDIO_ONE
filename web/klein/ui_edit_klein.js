// ui_edit_klein.js — Edit (multi-reference) left panel for flux2 klein One (TJ)
import { C, el, clear } from "./core_klein.js";
import { panel, label, button, select, numberField, slider, row, col } from "./ui_common.js";
import { buildEditGraph } from "./graph_builder_klein.js";
import { createImageUpload } from "./ui_image_upload.js";
import { uploadImage } from "./api_klein.js";
import { mountLoraSection } from "./ui_lora_section.js";

const SAMPLERS   = ["euler","euler_ancestral","er_sde","dpm_2","dpm_2_ancestral","lms","dpm_fast","heun","dpm_pp_2m"];
const SCHEDULERS = ["simple","normal","karras","exponential","sgm_uniform","beta"];
const MAX_REFS   = 5;

export function mountEditLeft(leftEl, state, ctx) {
  const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } });
  leftEl.appendChild(wrap);

  if (!Array.isArray(state.editRefImages)) state.editRefImages = [];

  // ── Image 1 (main reference, always present) ──────────────────────────────
  const { el: img1El, setFilename: setFn1 } = createImageUpload({
    label: "Image 1 (main reference)",
    initialFilename: state.editImage1 || null,
    onUpload: async f => {
      const name = await uploadImage(f);
      state.editImage1 = name; ctx.persist();
      return name;
    },
  });
  wrap.appendChild(panel([label("Ref Image 1"), img1El]));

  // ── Dynamic extra ref images 2-5 ─────────────────────────────────────────
  const extraWrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } });
  wrap.appendChild(extraWrap);

  function renderExtraImages() {
    clear(extraWrap);
    state.editRefImages.forEach((imgState, i) => {
      const { el: imgEl, setFilename } = createImageUpload({
        label: `Ref Image ${i + 2}`,
        initialFilename: imgState.filename || null,
        onUpload: async f => {
          const name = await uploadImage(f);
          imgState.filename = name; ctx.persist();
          return name;
        },
      });

      const cardWrap = el("div", { style: { position: "relative" } });
      const removeBtn = el("button", { type: "button", text: "✕", style: {
        position: "absolute", top: "4px", left: "4px", zIndex: "10",
        background: "rgba(180,0,0,0.85)", color: "#fff", border: "none",
        borderRadius: "50%", width: "20px", height: "20px",
        fontSize: "11px", cursor: "pointer", lineHeight: "20px", padding: "0",
        fontWeight: "700",
      }});
      removeBtn.addEventListener("click", () => {
        state.editRefImages.splice(i, 1); ctx.persist();
        renderExtraImages(); ctx.resizeNode?.();
      });
      cardWrap.appendChild(removeBtn);
      cardWrap.appendChild(panel([label(`Ref Image ${i + 2}`), imgEl]));
      extraWrap.appendChild(cardWrap);
    });

    // Add button (max 4 extras = total 5 with img1)
    if (state.editRefImages.length < MAX_REFS - 1) {
      const addBtn = button("+ Add Ref Image", () => {
        state.editRefImages.push({ filename: null }); ctx.persist();
        renderExtraImages(); ctx.resizeNode?.();
      });
      extraWrap.appendChild(addBtn);
    }
  }
  renderExtraImages();

  // ── Size source ───────────────────────────────────────────────────────────
  const sizeSrcSel = select(
    [
      { value: "img1",   label: "Match Image 1 size" },
      { value: "manual", label: "Manual" },
    ],
    state.editSizeSource || "img1",
    v => { state.editSizeSource = v; ctx.persist(); }
  );
  wrap.appendChild(panel([label("Output Size Source"), sizeSrcSel]));

  // ── Sampling ──────────────────────────────────────────────────────────────
  wrap.appendChild(panel([
    row([
      col([label("STEPS"),     numberField(state.steps ?? 4,  v => { state.steps = v; ctx.persist(); }, 1)]),
      col([label("CFG"),       numberField(state.cfg   ?? 1,  v => { state.cfg   = v; ctx.persist(); }, 0.1)]),
    ]),
    row([
      col([label("SAMPLER"),   select(SAMPLERS,   state.sampler   || "er_sde", v => { state.sampler   = v; ctx.persist(); })]),
      col([label("SCHEDULER"), select(SCHEDULERS, state.scheduler || "simple", v => { state.scheduler = v; ctx.persist(); })]),
    ]),
  ]));

  mountLoraSection(wrap, state, ctx);

  return {
    getSourceURL: () => state.editImage1 ? `/view?filename=${encodeURIComponent(state.editImage1)}&type=input` : null,
    async getGraph() { return buildEditGraph(state); },
    setImage(name)  { state.editImage1 = name; setFn1(name); ctx.persist(); },
  };
}

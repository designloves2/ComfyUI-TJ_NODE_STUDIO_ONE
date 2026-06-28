// ui_outpaint_sdxl.js — Outpaint left panel for SDXL ONE (TJ)
import { C, el, createInputImageSlot } from "./core_sdxl.js";
import { panel, label, select, numberField, row, col } from "../klein/ui_common.js";
import { uploadImage } from "./api_sdxl.js";
import { buildOutpaintGraph } from "./graph_builder_sdxl.js";
import { mountLoraSection } from "./ui_lora_sdxl.js";

const SAMPLERS   = ["euler","euler_ancestral","dpm_2","dpm_2_ancestral","dpm_pp_2m","dpm_pp_2m_sde","dpm_pp_sde","heun","lms","dpm_fast","ddim","uni_pc"];
const SCHEDULERS = ["normal","karras","exponential","sgm_uniform","simple","beta"];

function pxField(val, onChange) {
  const inp = el("input", { type: "number", min: "0", step: "64", style: {
    width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text,
    border: `1px solid ${C.border}`, borderRadius: "6px", padding: "6px",
    fontSize: "12px", fontFamily: "inherit", outline: "none",
  }});
  inp.value = val ?? 0;
  inp.addEventListener("input", () => onChange(Math.max(0, parseInt(inp.value) || 0)));
  return inp;
}

// Render padded preview on canvas so compare shows original+grey padding vs result
let _paddedDataURL = null;
function renderPaddedPreview(state) {
  _paddedDataURL = null;
  if (!state.outpaintImage) return;
  const img = new Image();
  img.onload = () => {
    const origW = img.naturalWidth, origH = img.naturalHeight;
    const top   = state.outpaintUp    || 0;
    const bot   = state.outpaintDown  || 0;
    const left  = state.outpaintLeft  || 0;
    const right = state.outpaintRight || 0;
    const totalW = origW + left + right;
    const totalH = origH + top  + bot;
    const cv = document.createElement("canvas");
    cv.width = totalW; cv.height = totalH;
    const c = cv.getContext("2d");
    c.fillStyle = "#808080";
    c.fillRect(0, 0, totalW, totalH);
    c.drawImage(img, left, top, origW, origH);
    _paddedDataURL = cv.toDataURL("image/jpeg", 0.9);
  };
  img.src = `/view?filename=${encodeURIComponent(state.outpaintImage)}&type=input&t=${Date.now()}`;
}

export function mountOutpaintLeft(leftEl, state, ctx) {
  const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } });
  leftEl.appendChild(wrap);

  // Reactive image slot — rebuild padded preview when image changes
  const imgSlot = createInputImageSlot(state, "outpaintImage", uploadImage, ctx, { label: "Source Image" });
  const _origSetFilename = imgSlot.setFilename.bind(imgSlot);
  imgSlot.setFilename = name => { _origSetFilename(name); renderPaddedPreview(state); };
  if (state.outpaintImage) renderPaddedPreview(state);
  wrap.appendChild(panel([label("Source Image"), imgSlot.el]));

  function onPadChange(field, v) { state[field] = v; ctx.persist(); renderPaddedPreview(state); }

  // Expansion
  wrap.appendChild(panel([
    label("Expand (pixels)"),
    el("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" } }, [
      col([label("Top"),    pxField(state.outpaintUp,    v => onPadChange("outpaintUp",    v))]),
      col([label("Bottom"), pxField(state.outpaintDown,  v => onPadChange("outpaintDown",  v))]),
      col([label("Left"),   pxField(state.outpaintLeft,  v => onPadChange("outpaintLeft",  v))]),
      col([label("Right"),  pxField(state.outpaintRight, v => onPadChange("outpaintRight", v))]),
    ]),
    col([label("Feathering (px)"), numberField(state.outpaintFeather ?? 32, v => { state.outpaintFeather = Math.max(0, Math.round(v)); ctx.persist(); }, 8)]),
  ]));

  // Sampling
  wrap.appendChild(panel([
    row([
      col([label("Steps"), numberField(state.steps, v => { state.steps = Math.max(1, Math.round(v)); ctx.persist(); }, 1)]),
      col([label("CFG"),   numberField(state.cfg,   v => { state.cfg   = v; ctx.persist(); }, 0.5)]),
    ]),
    row([
      col([label("Sampler"),   select(SAMPLERS,   state.sampler,   v => { state.sampler   = v; ctx.persist(); })]),
      col([label("Scheduler"), select(SCHEDULERS, state.scheduler, v => { state.scheduler = v; ctx.persist(); })]),
    ]),
  ]));

  mountLoraSection(wrap, state, ctx);

  return {
    getSourceURL: () => _paddedDataURL || (state.outpaintImage
      ? `/view?filename=${encodeURIComponent(state.outpaintImage)}&type=input`
      : null),

    setImageField(field, filename) {
      if (field === "outpaintImage") imgSlot.setFilename(filename);
    },

    beforeGenerate: async () => {
      if (!state.outpaintImage) throw new Error("소스 이미지를 업로드하세요.");
      const total = (state.outpaintUp || 0) + (state.outpaintDown || 0) + (state.outpaintLeft || 0) + (state.outpaintRight || 0);
      if (total <= 0) throw new Error("확장 방향 중 하나 이상에 0보다 큰 값을 입력하세요.");
    },

    async getGraph() { return buildOutpaintGraph(state); },
  };
}

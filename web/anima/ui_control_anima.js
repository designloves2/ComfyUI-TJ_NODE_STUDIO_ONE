// ui_control_anima.js — shared left panel for Inpainting / Any Control / Depth Control
import { C, el, BRAND, LEFT_W, RESOLUTIONS, SAMPLERS, SCHEDULERS, BASE_STEPS, BASE_CFG, TURBO_STEPS, TURBO_CFG } from "./core_anima.js";
import { panel, label, select, numberField, slider, row, col } from "../klein/ui_common.js";
import { uploadImage } from "./api_anima.js";
import { createInlineMaskEditor } from "../shared/mask_paint.js";
import { buildInpaintGraph, buildAnyControlGraph, buildDepthControlGraph } from "./graph_builder_anima.js";

const THUMB_BOX = 192; // matches Z-Image's source-image upload thumbnail
const DISP_W    = LEFT_W - 24; // mask-editor canvas — matches Z-Image's panel-width fit

function createImgUpload(labelText, initialFile, onUpload) {
  const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "4px", alignItems: "center" } });
  const box = el("div", { style: {
    width: `${THUMB_BOX}px`, height: `${THUMB_BOX}px`, background: "#000", borderRadius: "10px",
    border: `1px solid ${C.border}`, position: "relative", cursor: "pointer",
    flexShrink: "0", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
  }});
  const hint = el("div", { text: `${labelText}\nClick or drag to upload`, style: { color: C.muted, fontSize: "11px", textAlign: "center", whiteSpace: "pre", pointerEvents: "none" }});
  const img  = el("img", { style: { position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }});
  img.style.display = "none";
  function setFilename(name) {
    if (name) { img.src = `/view?filename=${encodeURIComponent(name)}&type=input&t=${Date.now()}`; img.style.display = "block"; hint.style.display = "none"; }
    else       { img.style.display = "none"; hint.style.display = ""; }
  }
  box.appendChild(hint); box.appendChild(img); wrap.appendChild(box);
  const inp = el("input", { type: "file", accept: "image/*", style: { display: "none" } });
  wrap.appendChild(inp);
  inp.addEventListener("change", async () => { if (inp.files[0]) { const n = await onUpload(inp.files[0]); setFilename(n); inp.value = ""; }});
  box.addEventListener("click", () => inp.click());
  box.addEventListener("dragover", e => { e.preventDefault(); box.style.borderColor = C.lime; });
  box.addEventListener("dragleave", () => { box.style.borderColor = C.border; });
  box.addEventListener("drop", async e => { e.preventDefault(); box.style.borderColor = C.border; const f = e.dataTransfer.files[0]; if (f) { const n = await onUpload(f); setFilename(n); }});
  setFilename(initialFile);
  return { el: wrap, setFilename };
}

// mode: { key, title, imageField, maskField|null, strengthField, startField, endField, graphFn }
const MODE_DEFS = {
  inpaint: {
    title: "Inpainting", imageField: "inpaintImage", maskField: "inpaintMask",
    strengthField: "inpaintStrength", startField: "inpaintStart", endField: "inpaintEnd",
    graphFn: buildInpaintGraph, filenamePrefix: "anima_inpaint_mask",
  },
  anycontrol: {
    title: "Any Control to Image", imageField: "anyControlImage", maskField: "anyControlMask",
    strengthField: "anyControlStrength", startField: "anyControlStart", endField: "anyControlEnd",
    graphFn: buildAnyControlGraph, filenamePrefix: "anima_anycontrol_mask",
  },
  depthcontrol: {
    title: "Depth Control to Image", imageField: "depthControlImage", maskField: null,
    strengthField: "depthControlStrength", startField: "depthControlStart", endField: "depthControlEnd",
    graphFn: buildDepthControlGraph,
  },
};

export function mountControlLeft(modeKey, leftEl, state, ctx) {
  const def = MODE_DEFS[modeKey];
  const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } });
  leftEl.appendChild(wrap);

  // ── Source image (+ inline mask editor for Inpainting / Any Control) ───────
  // Same component Z-Image's INPAINT mode uses — web/shared/mask_paint.js.
  let maskEditor = null;
  if (def.maskField) {
    maskEditor = createInlineMaskEditor({
      state, ctx, imageField: def.imageField, maskField: def.maskField,
      dispW: DISP_W, filenamePrefix: def.filenamePrefix, accentColor: BRAND,
    });
    const srcUp = createImgUpload("Source Image", state[def.imageField] || null, async f => {
      const n = await uploadImage(f);
      state[def.imageField] = n; state[def.maskField] = null;
      ctx.persist();
      maskEditor.loadSourceImage(n);
      return n;
    });
    wrap.appendChild(panel([label(def.title), srcUp.el]));
    wrap.appendChild(maskEditor.editorPanel);
    if (state[def.imageField]) maskEditor.loadSourceImage(state[def.imageField]);
  } else {
    const { el: srcUploadEl } = createImgUpload("Source Image", state[def.imageField] || null, async f => {
      const name = await uploadImage(f);
      state[def.imageField] = name; ctx.persist();
      return name;
    });
    wrap.appendChild(panel([label(def.title), srcUploadEl]));
    const hint = el("div", { style: { fontSize: "10px", color: C.muted } });
    hint.textContent = "Depth map is auto-extracted from the source image (DepthAnythingV2 preprocessor).";
    wrap.appendChild(panel([hint]));
  }

  // ── Resolution ──────────────────────────────────────────────────────────────
  const matched = RESOLUTIONS.find(r => r.w === state.width && r.h === state.height);
  const isCustom = !matched || matched.label === "Custom";
  const resDd = select(
    RESOLUTIONS.map(r => ({ value: r.label, label: r.label })),
    isCustom ? "Custom" : matched.label,
    v => {
      const p = RESOLUTIONS.find(r => r.label === v);
      if (p && p.w > 0) { state.width = p.w; state.height = p.h; ctx.persist(); customRow.style.display = "none"; }
      else customRow.style.display = "flex";
    }
  );
  const wInp = numberField(state.width,  v => { state.width  = Math.max(64, Math.round(v / 64) * 64) || 1024; ctx.persist(); }, 64);
  const hInp = numberField(state.height, v => { state.height = Math.max(64, Math.round(v / 64) * 64) || 1024; ctx.persist(); }, 64);
  const customRow = row([col([label("W"), wInp]), col([label("H"), hInp])]);
  customRow.style.display = isCustom ? "flex" : "none";
  wrap.appendChild(panel([label("Resolution"), resDd, customRow]));

  // ── LLLite strength / start / end ────────────────────────────────────────────
  wrap.appendChild(panel([
    label("Control Strength"),
    slider(0, 2, 0.05, state[def.strengthField] ?? 1.0, v => { state[def.strengthField] = v; ctx.persist(); }, v => v.toFixed(2)),
    row([
      col([label("Start %"), numberField(state[def.startField] ?? 0.0, v => { state[def.startField] = Math.max(0, Math.min(1, v)); ctx.persist(); }, 0.05)]),
      col([label("End %"),   numberField(state[def.endField]   ?? 1.0, v => { state[def.endField]   = Math.max(0, Math.min(1, v)); ctx.persist(); }, 0.05)]),
    ]),
  ]));

  // ── Turbo toggle + Steps/CFG ─────────────────────────────────────────────────
  const stepsF = numberField(state.steps, v => { state.steps = Math.max(1, Math.min(60, Math.round(v) || 1)); ctx.persist(); }, 1);
  const cfgF   = numberField(state.cfg,   v => { state.cfg   = Math.max(0, Math.min(20, v || 0)); ctx.persist(); }, 0.25);
  function syncStepsCfgEnabled() {
    const turbo = !!state.turboMode;
    stepsF.disabled = turbo; cfgF.disabled = turbo;
    stepsF.style.opacity = turbo ? "0.5" : "1"; cfgF.style.opacity = turbo ? "0.5" : "1";
  }
  const turboChk = el("input", { type: "checkbox" }); turboChk.checked = !!state.turboMode;
  const turboLbl = el("label", { style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: C.text, cursor: "pointer" } },
    [turboChk, el("span", { text: "TURBO (Base 1.0 + Turbo LoRA → 8 steps / CFG 1)" })]);
  turboChk.addEventListener("change", () => {
    state.turboMode = turboChk.checked;
    if (state.turboMode) { state.steps = TURBO_STEPS; state.cfg = TURBO_CFG; }
    else { state.steps = BASE_STEPS; state.cfg = BASE_CFG; }
    stepsF.value = state.steps; cfgF.value = state.cfg;
    syncStepsCfgEnabled(); ctx.persist();
  });
  syncStepsCfgEnabled();
  wrap.appendChild(panel([turboLbl, row([col([label("Steps"), stepsF]), col([label("CFG"), cfgF])])]));

  // ── Sampler / Scheduler ──────────────────────────────────────────────────────
  const sampSel  = select(SAMPLERS.map(s=>({value:s,label:s})),   state.sampler,   v=>{ state.sampler=v;   ctx.persist(); });
  const schedSel = select(SCHEDULERS.map(s=>({value:s,label:s})), state.scheduler, v=>{ state.scheduler=v; ctx.persist(); });
  wrap.appendChild(panel([row([col([label("Sampler"), sampSel]), col([label("Scheduler"), schedSel])])]));

  return {
    getSourceURL() {
      const f = state[def.imageField];
      return f ? `/view?filename=${encodeURIComponent(f)}&type=input` : null;
    },
    async beforeGenerate() {
      if (!def.maskField) return;
      if (!state[def.imageField]) return;
      if (!state[def.maskField]) {
        const saved = await maskEditor?.autoSaveMask().catch(() => false);
        if (!saved) throw new Error("Paint the mask area with brush (auto-save failed).");
      }
    },
    async getGraph() { return def.graphFn(state); },
  };
}

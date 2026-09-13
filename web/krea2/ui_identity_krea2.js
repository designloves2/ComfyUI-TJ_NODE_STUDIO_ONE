// ui_identity_krea2.js — Identity Edit left panel for Krea 2 ONE STUDIO (TJ)
// Instruction-based identity/appearance editing via comfyui-krea2edit
// (Krea2EditModelPatch + Krea2EditGroundedEncode) + the krea2 identity edit LoRA.
// The LoRA itself is configured ONCE in ⚙ Settings → Identity Edit.
import { C, el, SAMPLERS, SCHEDULERS } from "./core_krea2.js";
import { panel, label, slider, numberField, select, row, col } from "../klein/ui_common.js";
import { buildIdentityGraph } from "./graph_builder_krea2.js";
import { uploadImage } from "./api_krea2.js";
import { mountLoraSectionKrea2 } from "./ui_t2i_krea2.js";
import { createImageUpload as createImgUpload } from "./ui_image_upload.js";

function snap8(v) { return Math.max(8, Math.round(v / 8) * 8); }

function makeSizeFields(state, ctx) {
  const style = { width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "5px 7px", fontSize: "12px", fontFamily: "inherit", outline: "none" };
  const wIn = el("input", { type: "number", step: "8", min: "64", style: { ...style } });
  const hIn = el("input", { type: "number", step: "8", min: "64", style: { ...style } });
  if (state.identityWidth)  wIn.value = state.identityWidth;
  if (state.identityHeight) hIn.value = state.identityHeight;
  let aspect = (state.identityWidth && state.identityHeight) ? state.identityWidth / state.identityHeight : 1;
  const lockChk = el("input", { type: "checkbox" }); lockChk.checked = state.identityLockRatio ?? true;
  const lockLbl = el("label", { style: { display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: C.muted, cursor: "pointer", whiteSpace: "nowrap" } }, [lockChk, el("span", { text: "🔒 Lock ratio" })]);
  lockChk.addEventListener("change", () => { state.identityLockRatio = lockChk.checked; if (lockChk.checked && state.identityWidth && state.identityHeight) aspect = state.identityWidth / state.identityHeight; ctx.persist(); });
  wIn.addEventListener("change", () => { state.identityWidth = snap8(+wIn.value || 512); wIn.value = state.identityWidth; if (state.identityLockRatio && aspect > 0) { state.identityHeight = snap8(state.identityWidth / aspect); hIn.value = state.identityHeight; } else if (state.identityHeight) aspect = state.identityWidth / state.identityHeight; ctx.persist(); });
  hIn.addEventListener("change", () => { state.identityHeight = snap8(+hIn.value || 512); hIn.value = state.identityHeight; if (state.identityLockRatio && aspect > 0) { state.identityWidth = snap8(state.identityHeight * aspect); wIn.value = state.identityWidth; } else if (state.identityWidth) aspect = state.identityWidth / state.identityHeight; ctx.persist(); });
  return { wIn, hIn, setAspect: a => { aspect = a; }, el: col([row([col([label("W"), wIn]), col([label("H"), hIn])]), lockLbl]) };
}

export function mountIdentityLeft(leftEl, state, ctx) {
  const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } });
  leftEl.appendChild(wrap);

  const { wIn, hIn, setAspect, el: sizeEl } = makeSizeFields(state, ctx);

  // ① Source / Scene (frame 1)
  const { el: srcEl, setFilename } = createImgUpload("① Scene / Source", state.identityImage || null, async f => {
    const name = await uploadImage(f);
    state.identityImage = name; ctx.persist();
    return name;
  }, {
    box: 168,
    maxPixels: 2 * 1024 * 1024, // identity edit trained ≤2MP
    onLoad: (w, h) => { state.identityWidth = snap8(w); state.identityHeight = snap8(h); wIn.value = state.identityWidth; hIn.value = state.identityHeight; setAspect(w / h); ctx.persist(); },
  });

  // ② 2nd reference = subject / face (frame 2). Training order: scene first, subject second.
  const { el: refEl, setFilename: refSetFilename } = createImgUpload("② Subject / Face\n(optional)", state.identityImageB || null, async f => {
    const name = await uploadImage(f);
    state.identityImageB = name; ctx.persist();
    return name;
  }, { box: 168, onClear: () => { state.identityImageB = null; ctx.persist(); } });

  // ⇄ Swap the two images (scene ↔ subject)
  const swapBtn = el("button", { type: "button", text: "⇄ Swap ①↔②", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "11px", padding: "5px 12px",
    borderRadius: "6px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`, fontWeight: "600",
  }});
  swapBtn.addEventListener("click", () => {
    const a = state.identityImage, b = state.identityImageB;
    state.identityImage = b || null; state.identityImageB = a || null;
    ctx.persist();
    setFilename(state.identityImage);        // triggers source onLoad → recompute size
    refSetFilename(state.identityImageB);
  });

  wrap.appendChild(panel([
    el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center" } }, [srcEl, refEl]),
    el("div", { style: { display: "flex", justifyContent: "center" } }, [swapBtn]),
    sizeEl,
    el("div", { html: "PROMPT에 <b>지시문</b>으로 편집 → 예: \"recolor the car to matte black\", \"make him wear a suit\".<br>2장 사용 시 순서: <b>① 장면(scene)</b>, <b>② 인물/얼굴(subject)</b>. 사람을 장면에 합성합니다.", style: { fontSize: "10px", color: C.muted, lineHeight: "1.55" } }),
  ]));

  // Identity / grounding controls
  wrap.appendChild(panel([
    label("Reference fidelity (ref_boost)"),
    slider(0.5, 3, 0.05, state.identityRefBoost ?? 1.0, v => { state.identityRefBoost = v; ctx.persist(); }, v => v.toFixed(2)),
    el("div", { text: "1.0 = off · >1 pulls harder toward the reference's appearance (identity), <1 loosens.", style: { fontSize: "10px", color: C.muted } }),
    label("Grounding resolution (grounding_px)"),
    slider(0, 1536, 64, state.identityGroundingPx ?? 768, v => { state.identityGroundingPx = v; ctx.persist(); }, v => v === 0 ? "native" : `${v}px`),
    el("div", { text: "Higher = stronger identity/likeness (try 1024+ for people) · lower = stronger edit adherence (512 for stubborn scene changes) · 0 = native.", style: { fontSize: "10px", color: C.muted } }),
    row([col([
      label("Fit mode"),
      select(
        [{ value: "fit", label: "fit (v1.2, recommended)" }, { value: "crop (legacy)", label: "crop (legacy)" }],
        state.identityFitMode || "fit",
        v => { state.identityFitMode = v; ctx.persist(); }
      ),
    ])]),
  ]));

  // Sampling
  wrap.appendChild(panel([
    row([
      col([label("Steps"), numberField(state.steps ?? 8, v => { state.steps = v; ctx.persist(); }, 1)]),
      col([label("CFG"),   numberField(state.cfg   ?? 1, v => { state.cfg   = v; ctx.persist(); }, 0.1)]),
    ]),
    row([
      col([label("Sampler"),   select(SAMPLERS.map(s => ({ value: s, label: s })),   state.sampler   || "euler",  v => { state.sampler   = v; ctx.persist(); })]),
      col([label("Scheduler"), select(SCHEDULERS.map(s => ({ value: s, label: s })), state.scheduler || "simple", v => { state.scheduler = v; ctx.persist(); })]),
    ]),
    el("div", { text: "Turbo: 8 steps, CFG 1 (~1 min). Removals need the Raw model at CFG ~3, ~20 steps.", style: { fontSize: "10px", color: C.muted } }),
  ]));

  mountLoraSectionKrea2(wrap, state, ctx);

  return {
    getSourceURL: () => state.identityImage ? `/view?filename=${encodeURIComponent(state.identityImage)}&type=input` : null,
    async getGraph() { return buildIdentityGraph(state); },
    setImage(name) { state.identityImage = name; setFilename(name); ctx.persist(); },
  };
}

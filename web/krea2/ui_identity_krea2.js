// ui_identity_krea2.js — Identity Edit left panel for Krea 2 ONE STUDIO (TJ)
// Instruction-based identity/appearance editing via comfyui-krea2edit
// (Krea2EditModelPatch + Krea2EditGroundedEncode) + the krea2 identity edit LoRA.
// The LoRA itself is configured ONCE in ⚙ Settings → Identity Edit.
import { C, el, SAMPLERS, SCHEDULERS } from "./core_krea2.js";
import { panel, label, slider, numberField, select, row, col } from "../klein/ui_common.js";
import { buildIdentityGraph } from "./graph_builder_krea2.js";
import { uploadImage } from "./api_krea2.js";
import { mountLoraSectionKrea2 } from "./ui_t2i_krea2.js";

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

function createImgUpload(labelText, initialFile, onUpload, { maxPixels = null, onLoad = null, onClear = null } = {}) {
  const BOX = 168;
  const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "4px", alignItems: "center" } });
  const box = el("div", { style: {
    width: `${BOX}px`, height: `${BOX}px`, background: "#000", borderRadius: "10px",
    border: `1px solid ${C.border}`, position: "relative", cursor: "pointer",
    flexShrink: "0", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
  }});
  const hint = el("div", { text: `${labelText}\nClick or drag to upload`, style: { color: C.muted, fontSize: "12px", textAlign: "center", whiteSpace: "pre", pointerEvents: "none" }});
  const img  = el("img", { style: { position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }});
  const warnEl = maxPixels ? el("div", { style: { fontSize: "10px", color: C.warn || "#ffb347", textAlign: "center", display: "none", marginTop: "2px" } }) : null;
  img.addEventListener("load", () => {
    const w = img.naturalWidth, h = img.naturalHeight;
    if (onLoad && w > 0) onLoad(w, h);
    if (!maxPixels || !warnEl) return;
    const px = w * h;
    if (px > maxPixels) { const mp = (px / 1e6).toFixed(1), maxMp = (maxPixels / 1e6).toFixed(0); warnEl.textContent = `⚠ ${w}×${h} (${mp}MP) exceeds ~${maxMp}MP — keep ≤2MP for identity edit.`; warnEl.style.display = "block"; }
    else warnEl.style.display = "none";
  });
  img.style.display = "none";
  const clearBtn = onClear ? el("button", { type: "button", text: "✕", title: "Clear", style: { position: "absolute", top: "4px", right: "4px", zIndex: "3", background: "rgba(0,0,0,0.65)", color: "#fff", border: "none", borderRadius: "4px", width: "20px", height: "20px", cursor: "pointer", fontSize: "11px", padding: "0", display: "none" } }) : null;
  let currentFile = null;
  function setFilename(name) {
    currentFile = name;
    if (name) { img.src = `/view?filename=${encodeURIComponent(name)}&type=input&t=${Date.now()}`; img.style.display = "block"; hint.style.display = "none"; if (clearBtn) clearBtn.style.display = "block"; }
    else       { img.style.display = "none"; hint.style.display = ""; if (warnEl) warnEl.style.display = "none"; if (clearBtn) clearBtn.style.display = "none"; }
  }
  box.appendChild(hint); box.appendChild(img); if (clearBtn) box.appendChild(clearBtn); wrap.appendChild(box);
  if (warnEl) wrap.appendChild(warnEl);
  const inp = el("input", { type: "file", accept: "image/*", style: { display: "none" } });
  wrap.appendChild(inp);
  inp.addEventListener("change", async () => { if (inp.files[0]) { const n = await onUpload(inp.files[0]); setFilename(n); inp.value = ""; }});
  box.addEventListener("click", e => { if (clearBtn && e.target === clearBtn) return; inp.click(); });
  if (clearBtn) clearBtn.addEventListener("click", e => { e.stopPropagation(); setFilename(null); onClear(); });
  box.addEventListener("dragover", e => { e.preventDefault(); box.style.borderColor = C.lime; });
  box.addEventListener("dragleave", () => { box.style.borderColor = C.border; });
  box.addEventListener("drop", async e => { e.preventDefault(); box.style.borderColor = C.border; const f = e.dataTransfer.files[0]; if (f) { const n = await onUpload(f); setFilename(n); }});
  setFilename(initialFile);
  return { el: wrap, setFilename, getFilename: () => currentFile };
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
    maxPixels: 2 * 1024 * 1024, // identity edit trained ≤2MP
    onLoad: (w, h) => { state.identityWidth = snap8(w); state.identityHeight = snap8(h); wIn.value = state.identityWidth; hIn.value = state.identityHeight; setAspect(w / h); ctx.persist(); },
  });

  // ② 2nd reference = subject / face (frame 2). Training order: scene first, subject second.
  const { el: refEl, setFilename: refSetFilename } = createImgUpload("② Subject / Face\n(optional)", state.identityImageB || null, async f => {
    const name = await uploadImage(f);
    state.identityImageB = name; ctx.persist();
    return name;
  }, { onClear: () => { state.identityImageB = null; ctx.persist(); } });

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

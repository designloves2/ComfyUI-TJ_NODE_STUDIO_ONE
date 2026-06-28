// ui_upscale_sdxl.js — Upscale left panel for SDXL ONE (TJ)
// Three sub-modes: ESRGAN, Refiner (I2I with refiner ckpt), SEEDVR2
import { C, el, clear, BRAND, createInputImageSlot } from "./core_sdxl.js";
import { panel, label, button, select, numberField, slider, row, col } from "../klein/ui_common.js";
import { uploadImage, getESRGANModels, getSeedVR2Models } from "./api_sdxl.js";
import { buildESRGANGraph, buildRefinerUpscaleGraph, buildSeedVR2Graph } from "./graph_builder_sdxl.js";

const UPSCALE_MODES = [
  { key: "esrgan",  label: "ESRGAN"  },
  { key: "refiner", label: "Refiner" },
  { key: "seedvr2", label: "SEEDVR2" },
];

function searchableSelect(options, value, onChange) {
  const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "2px" } });
  const search = el("input", { type: "text", placeholder: "Search…", style: {
    width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text,
    border: `1px solid ${C.border}`, borderRadius: "6px 6px 0 0",
    padding: "4px 7px", fontSize: "11px", fontFamily: "inherit", outline: "none",
  }});
  const sel = el("select", { style: {
    width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text,
    border: `1px solid ${C.border}`, borderTopWidth: "0", borderRadius: "0 0 6px 6px",
    padding: "5px", fontSize: "11px", fontFamily: "inherit", outline: "none",
  }});
  let current = value;
  function build(filter) {
    const q = filter.toLowerCase();
    sel.replaceChildren(...options
      .filter(o => !q || o.toLowerCase().includes(q))
      .map(o => el("option", { value: o, text: o, ...(o === current ? { selected: "selected" } : {}) }))
    );
    if (options.includes(current)) sel.value = current;
    else if (options.length) sel.value = options[0];
  }
  build("");
  sel.addEventListener("change", e => { current = e.target.value; onChange(e.target.value); });
  search.addEventListener("input", () => {
    const prev = sel.value; build(search.value);
    if ([...sel.options].find(o => o.value === prev)) sel.value = prev;
  });
  wrap.appendChild(search); wrap.appendChild(sel);
  return { el: wrap, getValue() { return sel.value; }, setValue(v) { current = v; sel.value = v; } };
}

export function mountUpscaleLeft(leftEl, state, ctx) {
  const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } });
  leftEl.appendChild(wrap);

  // Reactive image slot (shared across all sub-modes)
  const imgSlot = createInputImageSlot(state, "upscaleImage", uploadImage, ctx, { label: "Source Image" });
  wrap.appendChild(panel([label("Source Image"), imgSlot.el]));

  // Sub-mode tabs
  const subModeBar = el("div", { style: { display: "flex", gap: "4px" } });
  UPSCALE_MODES.forEach(m => {
    const isActive = () => (state.upscaleMode || "esrgan") === m.key;
    const btn = el("button", { type: "button", text: m.label, style: {
      flex: "1", cursor: "pointer", fontFamily: "inherit", fontSize: "11px",
      padding: "5px", borderRadius: "6px",
      background: isActive() ? BRAND : C.bg2,
      color: isActive() ? "#fff" : C.text,
      border: `1px solid ${isActive() ? BRAND : C.border}`,
      fontWeight: isActive() ? "700" : "400",
    }, onclick: () => {
      state.upscaleMode = m.key; ctx.persist();
      refreshSubMode();
      [...subModeBar.children].forEach(b => {
        const me = b.textContent === m.label;
        b.style.background  = me ? BRAND : C.bg2;
        b.style.color       = me ? "#fff" : C.text;
        b.style.border      = `1px solid ${me ? BRAND : C.border}`;
        b.style.fontWeight  = me ? "700" : "400";
      });
    }});
    subModeBar.appendChild(btn);
  });
  wrap.appendChild(subModeBar);

  const modeSection = el("div");
  wrap.appendChild(modeSection);

  // ── ESRGAN ──────────────────────────────────────────────────────────────────
  function buildESRGANSection() {
    const modelWrap = el("div");
    let esrganSel;
    function buildSel(models) {
      clear(modelWrap);
      const opts = ["none", ...models.filter(m => m !== "none")];
      esrganSel = searchableSelect(opts, state.esrganModel || "none", v => { state.esrganModel = v; ctx.persist(); });
      modelWrap.appendChild(col([label("ESRGAN Model"), esrganSel.el]));
    }
    buildSel(["none"]);
    const refreshBtn = button("↻ Refresh", async () => {
      refreshBtn.textContent = "Loading…"; refreshBtn.disabled = true;
      try { const d = await getESRGANModels(); buildSel(d.models || ["none"]); }
      finally { refreshBtn.textContent = "↻ Refresh"; refreshBtn.disabled = false; }
    });
    modeSection.appendChild(panel([
      modelWrap, refreshBtn,
      el("div", { style: { fontSize: "10px", color: C.muted } }, [
        el("span", { html: "Models → <code>models/upscale_models/</code>" }),
      ]),
    ]));
    getESRGANModels().then(d => buildSel(d.models || ["none"])).catch(() => {});
  }

  // ── Refiner ─────────────────────────────────────────────────────────────────
  function buildRefinerSection() {
    const infoEl = el("div", { style: { fontSize: "11px", color: C.muted, lineHeight: "1.5" } });
    infoEl.innerHTML = "Refiner Checkpoint는 <b>Settings ⚙</b>에서 설정하세요.<br>소스 이미지에 Refiner 모델로 I2I를 적용합니다.";
    modeSection.appendChild(panel([
      infoEl,
      label("Denoise Strength"),
      slider(0.05, 1, 0.01, state.upscaleRefinerDenoise ?? 0.35,
        v => { state.upscaleRefinerDenoise = v; ctx.persist(); }, v => v.toFixed(2)),
      row([
        col([label("Steps"), numberField(state.upscaleRefinerSteps ?? 20, v => { state.upscaleRefinerSteps = Math.max(1, Math.round(v)); ctx.persist(); }, 1)]),
        col([label("CFG"),   numberField(state.upscaleRefinerCfg ?? 7,   v => { state.upscaleRefinerCfg   = v; ctx.persist(); }, 0.5)]),
      ]),
    ]));
  }

  // ── SEEDVR2 ─────────────────────────────────────────────────────────────────
  function buildSeedVR2Section() {
    const ditWrap = el("div"), vaeWrap = el("div");
    function buildModelSelects(models) {
      clear(ditWrap); clear(vaeWrap);
      const opts = ["none", ...models.filter(m => m !== "none")];
      const ditSel = searchableSelect(opts, state.upscaleDitModel || "none", v => { state.upscaleDitModel = v; ctx.persist(); });
      const vaeSel = searchableSelect(opts, state.upscaleVaeModel || "none", v => { state.upscaleVaeModel = v; ctx.persist(); });
      ditWrap.appendChild(col([label("DiT Model"), ditSel.el]));
      vaeWrap.appendChild(col([label("VAE Model"), vaeSel.el]));
    }
    buildModelSelects(["none"]);
    const refreshBtn = button("↻ Refresh", async () => {
      refreshBtn.textContent = "Loading…"; refreshBtn.disabled = true;
      try { const d = await getSeedVR2Models(); buildModelSelects(d.models || ["none"]); }
      finally { refreshBtn.textContent = "↻ Refresh"; refreshBtn.disabled = false; }
    });

    function numRow(lbl, key, min, max, step, def) {
      const inp = el("input", { type: "number", min, max, step, style: {
        width: "70px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
        borderRadius: "4px", padding: "4px 6px", fontSize: "12px", fontFamily: "inherit", outline: "none",
      }});
      inp.value = state[key] ?? def;
      inp.addEventListener("input", () => { state[key] = parseFloat(inp.value) || def; ctx.persist(); });
      return row([el("div", { text: lbl, style: { flex: "1", fontSize: "12px", color: C.text } }), inp], "8px");
    }
    function comboRow(lbl, key, options, def) {
      const sel = el("select", { style: {
        width: "70px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
        borderRadius: "4px", padding: "4px", fontSize: "11px", fontFamily: "inherit", outline: "none",
      }});
      options.forEach(o => {
        const opt = el("option", { value: o, text: o });
        if ((state[key] || def) === o) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener("change", e => { state[key] = e.target.value; ctx.persist(); });
      return row([el("div", { text: lbl, style: { flex: "1", fontSize: "12px", color: C.text } }), sel], "8px");
    }

    modeSection.appendChild(panel([
      ditWrap, vaeWrap, refreshBtn,
      el("div", { style: { fontSize: "10px", color: C.muted } }, [
        el("span", { html: "Models → <code>models/SEEDVR2/</code>" }),
      ]),
    ]));
    modeSection.appendChild(panel([
      label("SEEDVR2 Settings"),
      numRow("Resolution (short edge)", "upscaleResolution",    16, 16384, 2,   2048),
      numRow("Max Resolution",          "upscaleMaxResolution", 0,  16384, 2,   4096),
      numRow("Batch Size (4n+1)",       "upscaleBatchSize",     1,  64,    4,   1),
      numRow("Blocks to Swap",          "upscaleBlocksToSwap",  0,  36,    1,   0),
      comboRow("Attention Mode",   "upscaleAttentionMode",   ["sdpa","flash_attn_2","flash_attn_3","sageattn_2","sageattn_3"], "sdpa"),
      comboRow("Color Correction", "upscaleColorCorrection", ["lab","wavelet","wavelet_adaptive","hsv","adain","none"], "lab"),
      comboRow("Offload Device",   "upscaleOffloadDevice",   ["cpu","cuda:0"], "cpu"),
      numRow("Input Noise Scale",  "upscaleInputNoiseScale",  0, 1, 0.01, 0),
      numRow("Latent Noise Scale", "upscaleLatentNoiseScale", 0, 1, 0.01, 0),
    ]));

    getSeedVR2Models().then(d => buildModelSelects(d.models || ["none"])).catch(() => {});
  }

  function refreshSubMode() {
    clear(modeSection);
    const mode = state.upscaleMode || "esrgan";
    if (mode === "esrgan")  buildESRGANSection();
    if (mode === "refiner") buildRefinerSection();
    if (mode === "seedvr2") buildSeedVR2Section();
  }
  refreshSubMode();

  return {
    getSourceURL: () => state.upscaleImage
      ? `/view?filename=${encodeURIComponent(state.upscaleImage)}&type=input`
      : null,

    setImageField(field, filename) {
      if (field === "upscaleImage") imgSlot.setFilename(filename);
    },

    beforeGenerate: async () => {
      if (!state.upscaleImage) throw new Error("소스 이미지를 업로드하세요.");
      const mode = state.upscaleMode || "esrgan";
      if (mode === "esrgan" && (!state.esrganModel || state.esrganModel === "none"))
        throw new Error("ESRGAN 모델을 선택하세요.");
      if (mode === "refiner" && !state.refinerCheckpoint)
        throw new Error("Settings ⚙에서 Refiner Checkpoint를 설정하세요.");
      if (mode === "seedvr2") {
        if (!state.upscaleDitModel || state.upscaleDitModel === "none") throw new Error("DiT 모델을 선택하세요.");
        if (!state.upscaleVaeModel || state.upscaleVaeModel === "none") throw new Error("VAE 모델을 선택하세요.");
      }
    },

    getGraph() {
      const mode = state.upscaleMode || "esrgan";
      if (mode === "esrgan")  return buildESRGANGraph(state);
      if (mode === "refiner") return buildRefinerUpscaleGraph(state);
      return buildSeedVR2Graph(state);
    },
  };
}

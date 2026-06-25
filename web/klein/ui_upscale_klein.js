// ui_upscale_klein.js — SeedVR2 Upscale mode UI for Klein
import { C, el, clear } from "./core_klein.js";
import { panel, label, button, row, col, numberField } from "./ui_common.js";
import { uploadImage, copyOutputToInput } from "./api_klein.js";
import { getSeedVR2Models } from "./api_klein.js";
import { createImageUpload } from "./ui_image_upload.js";
import { t } from "../shared/i18n.js";

function searchableSelect(options, value, onChange) {
  const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "2px" } });
  const search = el("input", { type: "text", placeholder: "Search…", style: {
    width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text,
    border: `1px solid ${C.border}`, borderRadius: "6px 6px 0 0",
    padding: "4px 7px", fontSize: "11px", fontFamily: "inherit", outline: "none",
  }});
  const sel = el("select", { style: {
    width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text,
    border: `1px solid ${C.border}`, borderTopWidth: "0",
    borderRadius: "0 0 6px 6px", padding: "5px",
    fontSize: "11px", fontFamily: "inherit", outline: "none",
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

  // ── Image upload (다른 모드와 동일한 방식) ────────────────────────────────
  const imgUpload = createImageUpload({
    label: "Source Image",
    initialFilename: state.upscaleImage || null,
    onUpload: async (file) => {
      const name = await uploadImage(file);
      state.upscaleImage = name; ctx.persist();
      return name;
    },
  });
  wrap.appendChild(panel([label("Source Image"), imgUpload.el]));

  // ── Model selects ──────────────────────────────────────────────────────────
  const ditWrap = el("div");
  const vaeWrap = el("div");
  let ditSel, vaeSel;

  function buildModelSelects(models) {
    clear(ditWrap); clear(vaeWrap);
    const opts = ["none", ...models.filter(m => m !== "none")];
    ditSel = searchableSelect(opts, state.upscaleDitModel || "none", v => { state.upscaleDitModel = v; ctx.persist(); });
    vaeSel = searchableSelect(opts, state.upscaleVaeModel || "none", v => { state.upscaleVaeModel = v; ctx.persist(); });
    ditWrap.appendChild(col([label("DiT Model"), ditSel.el]));
    vaeWrap.appendChild(col([label("VAE Model"), vaeSel.el]));
  }
  buildModelSelects(["none"]);

  const refreshBtn = button("↻ Refresh", async () => {
    refreshBtn.textContent = "Loading…"; refreshBtn.disabled = true;
    try {
      const d = await getSeedVR2Models();
      buildModelSelects(d.models || ["none"]);
    } finally { refreshBtn.textContent = "↻ Refresh"; refreshBtn.disabled = false; }
  });

  wrap.appendChild(panel([
    el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } }, [
      ditWrap, vaeWrap, refreshBtn,
      el("div", { style: { fontSize: "10px", color: C.muted } },
        [el("span", { html: "Models → <code>models/SEEDVR2/</code>" })])
    ])
  ]));

  // ── Upscale settings ───────────────────────────────────────────────────────
  function numRow(lbl, key, min, max, step, def, tooltip) {
    const inp = el("input", { type: "number", min, max, step, style: {
      width: "70px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
      borderRadius: "4px", padding: "4px 6px", fontSize: "12px", fontFamily: "inherit", outline: "none",
    }});
    inp.value = state[key] ?? def;
    inp.addEventListener("input", () => { state[key] = parseFloat(inp.value) || def; ctx.persist(); });
    const lblEl = el("div", { text: lbl, style: { flex: "1", fontSize: "12px", color: C.text } });
    if (tooltip) {
      lblEl.title = tooltip;
      lblEl.style.cursor = "help";
      lblEl.style.borderBottom = `1px dotted ${C.muted}`;
      lblEl.style.display = "inline-block";
    }
    return row([lblEl, inp], "8px");
  }

  function comboRow(lbl, key, options, def) {
    const sel = el("select", { style: {
      width: "70px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
      borderRadius: "4px", padding: "4px 6px", fontSize: "11px", fontFamily: "inherit", outline: "none",
    }});
    options.forEach(o => {
      const opt = el("option", { value: o, text: o });
      if ((state[key] || def) === o) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", e => { state[key] = e.target.value; ctx.persist(); });
    return row([el("div", { text: lbl, style: { flex: "1", fontSize: "12px", color: C.text } }), sel], "8px");
  }

  wrap.appendChild(panel([
    label("Upscale Settings"),
    numRow("Resolution (short edge)", "upscaleResolution", 16, 16384, 2, 2048),
    numRow("Max Resolution", "upscaleMaxResolution", 0, 16384, 2, 4096),
    numRow("Batch Size (4n+1)", "upscaleBatchSize", 1, 64, 4, 1),
    numRow("Blocks to Swap", "upscaleBlocksToSwap", 0, 36, 1, 0,
      "0 = default / disabled\n3B model: 0~32 blocks\n7B model: 0~36 blocks"),
    comboRow("Attention Mode", "upscaleAttentionMode",
      ["sdpa", "flash_attn_2", "flash_attn_3", "sageattn_2", "sageattn_3"], "sdpa"),
    comboRow("Color Correction", "upscaleColorCorrection",
      ["lab", "wavelet", "wavelet_adaptive", "hsv", "adain", "none"], "lab"),
    comboRow("Offload Device", "upscaleOffloadDevice", ["cpu", "cuda:0"], "cpu"),
    numRow("Input Noise Scale", "upscaleInputNoiseScale", 0, 1, 0.01, 0),
    numRow("Latent Noise Scale", "upscaleLatentNoiseScale", 0, 1, 0.01, 0),
  ]));

  // 초기 모델 로드
  getSeedVR2Models().then(d => buildModelSelects(d.models || ["none"])).catch(() => {});

  return {
    beforeGenerate: async () => {
      if (!state.upscaleImage) throw new Error("소스 이미지를 업로드하세요.");
      if (!state.upscaleDitModel || state.upscaleDitModel === "none") throw new Error("DiT 모델을 선택하세요.");
      if (!state.upscaleVaeModel || state.upscaleVaeModel === "none") throw new Error("VAE 모델을 선택하세요.");
    },
    getGraph() {
      const s = state;
      const prompt = {};

      const ditOffload = (s.upscaleOffloadDevice && s.upscaleOffloadDevice !== "none") ? s.upscaleOffloadDevice : "cpu";
      prompt["UP:dit"] = { class_type: "SeedVR2LoadDiTModel", inputs: {
        model:              s.upscaleDitModel,
        device:             "cuda:0",
        blocks_to_swap:     s.upscaleBlocksToSwap ?? 0,
        swap_io_components: false,
        offload_device:     ditOffload,
        cache_model:        ditOffload !== "none",
        attention_mode:     s.upscaleAttentionMode || "sdpa",
      }};

      prompt["UP:vae"] = { class_type: "SeedVR2LoadVAEModel", inputs: {
        model:               s.upscaleVaeModel,
        device:              "cuda:0",
        encode_tiled:        true,
        encode_tile_size:    1024,
        encode_tile_overlap: 128,
        decode_tiled:        true,
        decode_tile_size:    1024,
        decode_tile_overlap: 128,
        tile_debug:          "false",
        offload_device:      ditOffload,
        cache_model:         false,
      }};

      prompt["UP:load"] = { class_type: "LoadImage", inputs: { image: s.upscaleImage } };

      prompt["UP:run"] = { class_type: "SeedVR2VideoUpscaler", inputs: {
        image:              ["UP:load", 0],
        dit:                ["UP:dit", 0],
        vae:                ["UP:vae", 0],
        seed:               (s.seed ?? 42) % 4294967295,
        resolution:         s.upscaleResolution    ?? 1080,
        max_resolution:     s.upscaleMaxResolution ?? 4096,
        batch_size:         s.upscaleBatchSize     ?? 5,
        uniform_batch_size: false,
        color_correction:   s.upscaleColorCorrection  || "lab",
        temporal_overlap:   0,
        prepend_frames:     0,
        input_noise_scale:  s.upscaleInputNoiseScale  ?? 0,
        latent_noise_scale: s.upscaleLatentNoiseScale ?? 0,
        offload_device:     ditOffload,
        enable_debug:       false,
      }};

      prompt["UP:save"] = { class_type: "SaveImage", inputs: {
        images: ["UP:run", 0],
        filename_prefix: s.saveSubfolder || "seedvr2",
      }};

      return prompt;
    },
    getSourceURL() { return state.upscaleImage ? `/view?filename=${encodeURIComponent(state.upscaleImage)}&type=input` : null; },
  };
}

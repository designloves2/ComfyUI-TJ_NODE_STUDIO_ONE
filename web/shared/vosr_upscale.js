// VOSR 2.0 (ComfyUI-VOSR2) as a second UPSCALE method next to SeedVR2, shared by the image nodes.
//
// state.upscaleMethod = "vosr" | "seedvr2" (default "vosr"). Each node's Upscale panel puts
// mountUpscaleMethodTabs() at the very top of its left menu and its existing SeedVR2 controls in the
// "seedvr2" body; mountVosrPanel() fills the "vosr" body. Each node's buildUpscaleGraph() hands off to
// buildVosrUpscaleGraph() when the method is "vosr".
//
// `ui` = the calling node's own { C, el, panel, label, row, col, accent } so the controls match its look.

export const VOSR_DEFAULTS = {
  upscaleMethod: "vosr",
  vosrModel: "VOSR2",
  vosrDtype: "default",
  vosrScale: 4,
  vosrColorAlignment: "wavelet",
  // VOSR 2.0 was trained at up to 512 px, so tile above that; the VAE decode needs its own tiles on big outputs.
  vosrTileSize: 512,
  vosrTileOverlap: 32,
  vosrVaeTileSize: 1024,
  vosrVaeTileOverlap: 32,
};

/** Copy the saved VOSR fields into a node's default-state object (call inside defaultState). */
export function vosrState(saved) {
  const out = {};
  for (const [k, d] of Object.entries(VOSR_DEFAULTS)) out[k] = saved[k] ?? d;
  return out;
}

let infoPromise = null;
/** ComfyUI's own description of the two VOSR nodes (installed? model / dtype / alignment choices). */
function vosrInfo() {
  if (!infoPromise) {
    infoPromise = Promise.all([
      fetch("/object_info/VOSR2ModelLoader").then(r => r.json()),
      fetch("/object_info/VOSR2Upscale").then(r => r.json()),
    ]).then(([loader, up]) => {
      const lin = loader.VOSR2ModelLoader.input.required, uin = up.VOSR2Upscale.input.required;
      return {
        installed: true,
        models: lin.model[1].options || lin.model[0],
        dtypes: lin.dtype[1].options || lin.dtype[0],
        alignments: uin.color_alignment[1].options || uin.color_alignment[0],
      };
    }).catch(() => ({ installed: false, models: ["VOSR2"], dtypes: ["default", "fp16", "bf16"], alignments: ["wavelet", "adain", "none"] }));
  }
  return infoPromise;
}

export function buildVosrUpscaleGraph(state, filenamePrefix) {
  if (!state.upscaleImage) throw new Error("No source image uploaded for upscale.");
  return {
    "UP:vosrModel": { class_type: "VOSR2ModelLoader", inputs: { model: state.vosrModel || "VOSR2", dtype: state.vosrDtype || "default" } },
    "UP:load": { class_type: "LoadImage", inputs: { image: state.upscaleImage } },
    "UP:run": { class_type: "VOSR2Upscale", inputs: {
      model: ["UP:vosrModel", 0], image: ["UP:load", 0],
      upscale: Math.max(1, Math.round(state.vosrScale ?? 4)),
      seed: (state.seed ?? 42) % 4294967295,
      color_alignment: state.vosrColorAlignment || "wavelet",
      tile_size: state.vosrTileSize ?? 512, tile_overlap: state.vosrTileOverlap ?? 32,
      vae_tile_size: state.vosrVaeTileSize ?? 1024, vae_tile_overlap: state.vosrVaeTileOverlap ?? 32,
    } },
    "UP:save": { class_type: "SaveImage", inputs: { images: ["UP:run", 0], filename_prefix: filenamePrefix } },
  };
}

/** Tabs for the method; `bodies` = { vosr: HTMLElement, seedvr2: HTMLElement } toggled by the choice. */
export function mountUpscaleMethodTabs(container, state, persist, bodies, ui) {
  const { C, el } = ui;
  const accent = ui.accent || C.lime || C.brand;
  const bar = el("div", { style: { display: "flex", gap: "6px", flexShrink: "0" } });
  const tabs = {};
  function show() {
    const m = state.upscaleMethod === "seedvr2" ? "seedvr2" : "vosr";
    for (const [k, b] of Object.entries(tabs)) {
      const on = k === m;
      Object.assign(b.style, { background: on ? accent : C.bg2, color: on ? "#fff" : C.text, border: `1px solid ${on ? accent : C.border}`, fontWeight: on ? "700" : "400" });
    }
    bodies.vosr.style.display = m === "vosr" ? "flex" : "none";
    bodies.seedvr2.style.display = m === "seedvr2" ? "flex" : "none";
  }
  for (const [key, text] of [["vosr", "VOSR"], ["seedvr2", "SEEDVR2"]]) {
    const b = el("button", { type: "button", text, style: { flex: "1", cursor: "pointer", fontFamily: "inherit", fontSize: "12px", padding: "7px 8px", borderRadius: "6px" } });
    b.addEventListener("click", () => { state.upscaleMethod = key; persist(); show(); });
    tabs[key] = b; bar.appendChild(b);
  }
  container.appendChild(bar);
  show();
}

/** The VOSR controls. Returns the body element to hand to mountUpscaleMethodTabs. */
export function mountVosrPanel(state, persist, ui) {
  const { C, el, panel, label, row } = ui;
  const body = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } });

  const inputStyle = { width: "70px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`, borderRadius: "4px", padding: "4px 6px", fontSize: "12px", fontFamily: "inherit", outline: "none" };
  const lbl = (text, tip) => {
    const d = el("div", { text, style: { flex: "1", fontSize: "12px", color: C.text } });
    if (tip) { d.title = tip; d.style.cursor = "help"; }
    return d;
  };
  function numRow(text, key, min, max, step, def, tip) {
    const inp = el("input", { type: "number", min, max, step, style: inputStyle });
    inp.value = state[key] ?? def;
    inp.addEventListener("input", () => { const v = parseFloat(inp.value); state[key] = Number.isFinite(v) ? v : def; persist(); });
    return row([lbl(text, tip), inp], "8px");
  }
  function comboRow(text, key, options, def) {
    const sel = el("select", { style: { ...inputStyle, fontSize: "11px", maxWidth: "110px" } });
    const cur = state[key] || def;
    const opts = options.includes(cur) ? options : [cur, ...options];   // a saved value stays visible
    opts.forEach(o => sel.appendChild(el("option", { value: o, text: o, ...(o === cur ? { selected: "selected" } : {}) })));
    sel.addEventListener("change", e => { state[key] = e.target.value; persist(); });
    return row([lbl(text), sel], "8px");
  }

  const note = el("div", { style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } });
  note.innerHTML = "VOSR 2.0 (one-step super-resolution). Model files live in <code>models/vosr2/</code> and download themselves on the first run (~7 GB).";
  const warn = el("div", { style: { fontSize: "10px", color: C.warn || "#ffb347", display: "none" }, text: "⚠ ComfyUI-VOSR2 is not installed — run install_requirements and restart ComfyUI." });
  const settings = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } });
  body.appendChild(panel([label("VOSR Settings"), settings, note, warn]));

  function build(info) {
    settings.replaceChildren(
      comboRow("Model", "vosrModel", info.models, "VOSR2"),
      comboRow("Precision (dtype)", "vosrDtype", info.dtypes, "default"),
      numRow("Upscale (×)", "vosrScale", 1, 16, 1, 4, "Exact output multiplier. Quality isn't guaranteed much above ~4×."),
      comboRow("Color Alignment", "vosrColorAlignment", info.alignments, "wavelet"),
      numRow("Tile Size", "vosrTileSize", 0, 4096, 64, 512, "0 = no tiling. VOSR 2.0 was trained at up to 512 px — tile whenever the upscaled output is larger."),
      numRow("Tile Overlap", "vosrTileOverlap", 0, 512, 8, 32),
      numRow("VAE Tile Size", "vosrVaeTileSize", 0, 8192, 64, 1024, "0 = decode in one pass. Set it for outputs past ~1024 px or the VAE decode may run out of memory."),
      numRow("VAE Tile Overlap", "vosrVaeTileOverlap", 0, 512, 8, 32),
    );
    warn.style.display = info.installed ? "none" : "block";
  }
  build({ installed: true, models: ["VOSR2"], dtypes: ["default", "fp16", "bf16"], alignments: ["wavelet", "adain", "none"] });
  vosrInfo().then(build);
  return body;
}

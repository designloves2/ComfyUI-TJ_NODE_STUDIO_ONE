// ui_i2i_moss.js — I2I left panel for Moss Image ONE STUDIO (TJ)
//
// Two tabs at the top: BASIC — MOSS has no reference-image input, so this is the classic latent route (the source is
// scaled to the working size, encoded by the VAE and re-noised by DENOISE); DEPTH — MoGe 3 estimates the geometry of the
// source and MOSSImageControl makes the new image keep that pose and framing (official color/depth control graph).
import { C, el, clear } from "./core_moss.js";
import { panel, label, slider, row, col, modeBar, select, numberField } from "../klein/ui_common.js";
import { createImageUpload } from "../krea2/ui_image_upload.js";
import { uploadImage, getObjectOptions } from "./api_moss.js";
import { buildI2IGraph } from "./graph_builder_moss.js";
import { mountSharedSettings, mountLoraSectionMoss } from "./ui_t2i_moss.js";

function snap16(v) { return Math.max(64, Math.round(v / 16) * 16); }

const SUBMODES = [
  { key: "basic", label: "Basic", enabled: true },
  { key: "depth", label: "Depth", enabled: true },
];

// One LoRA (name + strength) picked from the installed LoRAs; the file the mode needs is chosen when none is set yet.
export function mountModeLora(parent, state, ctx, { title, nameKey, strengthKey, match, hint }) {
  const holder = el("div");
  parent.appendChild(holder);
  const note = el("div", { style: { fontSize: "10px", color: C.muted, lineHeight: "1.4" } });
  async function build() {
    clear(holder);
    let names = (ctx.availableLoras || []).filter(n => n && n !== "none");
    if (!names.length) names = (await getObjectOptions("LoraLoaderModelOnly", "lora_name")).filter(n => n && n !== "none");
    if ((!state[nameKey] || state[nameKey] === "none") && names.length) {
      const pick = names.find(n => match.test(n));
      if (pick) { state[nameKey] = pick; ctx.persist(); }
    }
    const opts = ["none", ...names];
    if (state[nameKey] && !opts.includes(state[nameKey])) opts.push(state[nameKey]);
    const sel = select(opts.map(n => ({ value: n, label: n })), state[nameKey] || "none", v => { state[nameKey] = v; ctx.persist(); sync(); });
    const str = numberField(state[strengthKey] ?? 1, v => { state[strengthKey] = Math.max(0, Math.min(2, v || 0)); ctx.persist(); }, 0.05);
    str.style.width = "60px";
    holder.appendChild(panel([label(title), row([el("div", { style: { flex: "1", minWidth: "0" } }, [sel]), str], "4px"), note]));
    sync();
    function sync() {
      const ok = state[nameKey] && state[nameKey] !== "none";
      note.textContent = ok ? hint : `⚠ ${hint}`;
      note.style.color = ok ? C.muted : C.warn;
    }
  }
  build();
}

function mountDepthPanel(parent, state, ctx) {
  mountModeLora(parent, state, ctx, {
    title: "Control LoRA (strength)", nameKey: "depthLora", strengthKey: "depthLoraStrength", match: /color_depth_control/i,
    hint: "moss_image_color_depth_control (models/loras): without it the control map is ignored.",
  });

  const mogeHolder = el("div");
  parent.appendChild(mogeHolder);
  getObjectOptions("LoadMoGeModel", "model_name").then(names => {
    clear(mogeHolder);
    if (!names.length) {
      mogeHolder.appendChild(panel([label("MoGe model"), el("div", { text: "⚠ No MoGe model found: put moge_3_vitg_fp16.safetensors in models/geometry_estimation (Comfy-Org/MoGe) and update ComfyUI (0.43+) for the MoGe nodes.", style: { fontSize: "10px", color: C.warn, lineHeight: "1.4" } })]));
      return;
    }
    if (!state.depthMoge || !names.includes(state.depthMoge)) { state.depthMoge = names.find(n => /vitg/i.test(n)) || names[0]; ctx.persist(); }
    mogeHolder.appendChild(panel([label("MoGe model (geometry estimation)"), select(names.map(n => ({ value: n, label: n })), state.depthMoge, v => { state.depthMoge = v; ctx.persist(); })]));
  });

  parent.appendChild(panel([
    label("Geometry used as control"),
    select([{ value: "mask", label: "Silhouette (mask) — pose only, prompt has room" }, { value: "depth", label: "Depth — also face profile, shoulders, background falloff" }],
      state.depthOutput || "mask", v => { state.depthOutput = v; ctx.persist(); }),
    row([
      col([label("Strength"), numberField(state.depthStrength ?? 1, v => { state.depthStrength = Math.max(0, Math.min(2, v || 0)); ctx.persist(); }, 0.05)]),
      col([label("Start"), numberField(state.depthStart ?? 0, v => { state.depthStart = Math.max(0, Math.min(1, v || 0)); ctx.persist(); }, 0.05)]),
      col([label("End"), numberField(state.depthEnd ?? 0.6, v => { state.depthEnd = Math.max(0, Math.min(1, v || 0)); ctx.persist(); }, 0.05)]),
    ]),
    el("div", { text: "Strength 1.0 is the trained value. Start / End pick the part of the run that is controlled: 0 to 0.6 fixes the layout and lets the last steps render freely; End 1.0 pins the geometry to the last step. Sampling uses the official control preset (temporal score rescaling 0.95, shift 5, skip layer guidance layer 24); CFG 3 and 25 steps are recommended.", style: { fontSize: "10px", color: C.muted, lineHeight: "1.4" } }),
  ]));
}

export function mountI2ILeft(leftEl, state, ctx) {
  const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } });
  leftEl.appendChild(wrap);

  // ── tabs: Basic / Depth (top of the left menu) ────────────────────────────
  const tabsEl = el("div");
  wrap.appendChild(tabsEl);
  const dyn = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } });
  function renderTabs() {
    clear(tabsEl);
    tabsEl.appendChild(modeBar(SUBMODES, state.i2iSubMode === "depth" ? "depth" : "basic", key => {
      state.i2iSubMode = key; ctx.persist(); renderTabs(); renderDyn();
    }));
  }

  const fieldStyle = { width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "5px 7px", fontSize: "12px", fontFamily: "inherit", outline: "none" };
  const wIn = el("input", { type: "number", step: "16", min: "64", style: { ...fieldStyle } });
  const hIn = el("input", { type: "number", step: "16", min: "64", style: { ...fieldStyle } });
  if (state.i2iWidth)  wIn.value = state.i2iWidth;
  if (state.i2iHeight) hIn.value = state.i2iHeight;
  let aspect = (state.i2iWidth && state.i2iHeight) ? state.i2iWidth / state.i2iHeight : 1;
  const lockChk = el("input", { type: "checkbox" }); lockChk.checked = state.i2iLockRatio ?? true;
  const lockLbl = el("label", { style: { display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: C.muted, cursor: "pointer", whiteSpace: "nowrap" } }, [lockChk, el("span", { text: "Lock ratio" })]);
  lockChk.addEventListener("change", () => {
    state.i2iLockRatio = lockChk.checked;
    if (lockChk.checked && state.i2iWidth && state.i2iHeight) aspect = state.i2iWidth / state.i2iHeight;
    ctx.persist();
  });
  wIn.addEventListener("change", () => {
    state.i2iWidth = snap16(+wIn.value || 1024); wIn.value = state.i2iWidth;
    if (state.i2iLockRatio && aspect > 0) { state.i2iHeight = snap16(state.i2iWidth / aspect); hIn.value = state.i2iHeight; }
    ctx.persist();
  });
  hIn.addEventListener("change", () => {
    state.i2iHeight = snap16(+hIn.value || 1024); hIn.value = state.i2iHeight;
    if (state.i2iLockRatio && aspect > 0) { state.i2iWidth = snap16(state.i2iHeight * aspect); wIn.value = state.i2iWidth; }
    ctx.persist();
  });

  const { el: uploadEl, setFilename } = createImageUpload("Source Image", state.i2iImage || null, async f => {
    const name = await uploadImage(f);
    state.i2iImage = name; ctx.persist();
    return name;
  }, {
    maxPixels: 4 * 1024 * 1024,   // MOSS-Image works from 0.25M to 4M pixels
    onLoad: (w, h) => { state.i2iWidth = snap16(w); state.i2iHeight = snap16(h); wIn.value = state.i2iWidth; hIn.value = state.i2iHeight; aspect = w / h; ctx.persist(); },
  });
  wrap.appendChild(panel([uploadEl, col([row([col([label("W"), wIn]), col([label("H"), hIn])]), lockLbl])]));
  wrap.appendChild(dyn);

  function renderDyn() {
    clear(dyn);
    if (state.i2iSubMode === "depth") {
      mountDepthPanel(dyn, state, ctx);
    } else {
      dyn.appendChild(panel([
        label("Denoise"),
        slider(0, 1, 0.01, state.i2iDenoise ?? 0.6, v => { state.i2iDenoise = v; ctx.persist(); }, v => v.toFixed(2)),
      ]));
    }
    mountSharedSettings(dyn, state, ctx, { resolution: false });
    mountLoraSectionMoss(dyn, state, ctx);
  }
  renderTabs();
  renderDyn();

  return {
    getSourceURL: () => state.i2iImage ? `/view?filename=${encodeURIComponent(state.i2iImage)}&type=input` : null,
    async getGraph() { return buildI2IGraph(state); },
    setImage(name) { state.i2iImage = name; setFilename(name); ctx.persist(); },
  };
}

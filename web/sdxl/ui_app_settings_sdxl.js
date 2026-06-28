// ui_app_settings_sdxl.js — Settings overlay for SDXL ONE (TJ)
import { C, el, clear, SUBFOLDER, BRAND } from "./core_sdxl.js";
import { panel, label, button, row, col } from "../klein/ui_common.js";
import { getModels, getConfig, saveConfig } from "./api_sdxl.js";
import { t, getLang, setLang } from "../shared/i18n.js";

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
    else if (options.length) { sel.value = options[0]; current = options[0]; }
  }
  build("");
  sel.addEventListener("change", e => { current = e.target.value; onChange(e.target.value); });
  search.addEventListener("input", () => {
    const prev = sel.value; build(search.value);
    if ([...sel.options].find(o => o.value === prev)) sel.value = prev;
  });
  wrap.appendChild(search); wrap.appendChild(sel);
  return { el: wrap, getValue() { return sel.value; }, setValue(v) { current = v; if (options.includes(v)) sel.value = v; } };
}

export function createSettingsOverlay(state, ctx) {
  const ov = el("div", { style: {
    position: "absolute", inset: "0", zIndex: "9998",
    background: "rgba(11,11,11,0.97)", borderRadius: "inherit",
    display: "none", flexDirection: "column", padding: "12px", gap: "8px",
    boxSizing: "border-box", overflowY: "auto",
  }});

  // ── Header ────────────────────────────────────────────────────────────────
  const topRow = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" } });
  topRow.appendChild(el("div", { text: "⚙ Settings — SDXL ONE (TJ)", style: { color: "#ffffff", fontSize: "14px", fontWeight: "700", flex: "1" } }));
  const saveAllBtn = button("💾 Save All", () => saveAll(), "primary");
  const closeBtn   = button("✕", () => { ov.style.display = "none"; }, "danger");
  topRow.appendChild(saveAllBtn); topRow.appendChild(closeBtn);
  ov.appendChild(topRow);

  // ── Model Loader Mode ─────────────────────────────────────────────────────
  const modeRow = el("div", { style: { display: "flex", gap: "8px", flexShrink: "0" } });
  ["checkpoint", "separate"].forEach(mode => {
    const active = () => state.modelLoaderMode === mode;
    const lbl = mode === "checkpoint" ? "📦 Checkpoint" : "🔧 UNet + DualCLIP + VAE";
    const btn = el("button", { text: lbl, type: "button", style: {
      flex: "1", cursor: "pointer", fontFamily: "inherit", fontSize: "12px",
      padding: "8px 12px", borderRadius: "6px",
      background: active() ? BRAND : C.bg2, color: active() ? "#fff" : C.text,
      border: `1px solid ${active() ? BRAND : C.border}`, fontWeight: active() ? "700" : "400",
    }, onclick: () => {
      state.modelLoaderMode = mode; ctx.persist();
      ctx._refreshModeIndicator?.();
      rebuildModelSection();
      [...modeRow.children].forEach(b => {
        const isActive = b.textContent.includes(mode === "checkpoint" ? "Checkpoint" : "UNet");
        b.style.background = isActive ? BRAND : C.bg2;
        b.style.color      = isActive ? "#fff" : C.text;
        b.style.border     = `1px solid ${isActive ? BRAND : C.border}`;
        b.style.fontWeight = isActive ? "700" : "400";
      });
    }});
    modeRow.appendChild(btn);
  });
  ov.appendChild(panel([label("Model Loading Mode"), modeRow]));

  // ── Model section (dynamic) ───────────────────────────────────────────────
  const modelSection = el("div");
  ov.appendChild(modelSection);

  let ckptSel, refinerSel, unetSel, clipLSel, clipGSel, vaeSel2;
  let _modelData = null;

  function rebuildModelSection() {
    clear(modelSection);
    const data = _modelData || {};
    if (state.modelLoaderMode === "checkpoint") {
      buildCheckpointSection(data);
    } else {
      buildSeparateSection(data);
    }
  }

  function buildCheckpointSection(data) {
    const ckpts   = ["none", ...(data.checkpoints  || [])];
    const refiners = ["none", ...(data.checkpoints || [])];

    ckptSel   = searchableSelect(ckpts,   state.checkpoint        || "none", v => { state.checkpoint        = v; ctx.persist(); });
    refinerSel = searchableSelect(refiners, state.refinerCheckpoint || "none", v => { state.refinerCheckpoint = v; ctx.persist(); });

    const refTog = el("input", { type: "checkbox" });
    refTog.checked = !!state.useRefiner;
    refTog.addEventListener("change", () => { state.useRefiner = refTog.checked; ctx.persist(); });

    modelSection.appendChild(panel([
      col([label("Checkpoint"), ckptSel.el]),
      el("div", { style: { marginTop: "6px", display: "flex", alignItems: "center", gap: "6px" } }, [
        refTog,
        el("span", { text: "Use Refiner", style: { color: C.text, fontSize: "12px" } }),
      ]),
      el("div", { style: { marginTop: "4px" } }, [col([label("Refiner Checkpoint"), refinerSel.el])]),
      el("div", { style: { fontSize: "10px", color: C.muted, marginTop: "4px" } },
        [el("span", { html: "모델 → <code>models/checkpoints/</code>" })]),
    ]));
  }

  function buildSeparateSection(data) {
    const diff    = ["none", ...(data.diffusion_models || [])];
    const te      = ["none", ...(data.text_encoders    || [])];
    const vaes    = ["none", ...(data.vaes             || [])];
    const refiners = ["none", ...(data.checkpoints    || [])];

    unetSel  = searchableSelect(diff,  state.unet  || "none", v => { state.unet  = v; ctx.persist(); });
    clipLSel = searchableSelect(te,    state.clipL || "none", v => { state.clipL = v; ctx.persist(); });
    clipGSel = searchableSelect(te,    state.clipG || "none", v => { state.clipG = v; ctx.persist(); });
    vaeSel2  = searchableSelect(vaes,  state.vae   || "none", v => { state.vae   = v; ctx.persist(); });
    refinerSel = searchableSelect(refiners, state.refinerCheckpoint || "none", v => { state.refinerCheckpoint = v; ctx.persist(); });

    const refTog = el("input", { type: "checkbox" });
    refTog.checked = !!state.useRefiner;
    refTog.addEventListener("change", () => { state.useRefiner = refTog.checked; ctx.persist(); });

    modelSection.appendChild(panel([
      row([
        col([label("UNet (diffusion model)"), unetSel.el]),
        col([label("VAE"), vaeSel2.el]),
      ]),
      row([
        col([label("CLIP-L (text_encoder_1)"), clipLSel.el]),
        col([label("CLIP-G (text_encoder_2)"), clipGSel.el]),
      ]),
      el("div", { style: { fontSize: "10px", color: C.muted, marginTop: "4px" } },
        [el("span", { html: "UNet → <code>models/diffusion_models/</code> · CLIP → <code>models/text_encoders/</code> · VAE → <code>models/vae/</code>" })]),
      el("div", { style: { marginTop: "8px", display: "flex", alignItems: "center", gap: "6px" } }, [
        refTog,
        el("span", { text: "Use Refiner (Checkpoint)", style: { color: C.text, fontSize: "12px" } }),
      ]),
      el("div", { style: { marginTop: "4px" } }, [col([label("Refiner Checkpoint"), refinerSel.el])]),
      el("div", { style: { fontSize: "10px", color: C.muted, marginTop: "4px" } },
        [el("span", { html: "Refiner → <code>models/checkpoints/</code>" })]),
    ]));
  }

  // Refresh button
  const refreshBtn = button("↻ Refresh Models", async () => {
    refreshBtn.textContent = "Loading…"; refreshBtn.disabled = true;
    try {
      const d = await getModels();
      _modelData = d;
      ctx.availableLoras = d.loras || [];
      ctx._rerenderLoras?.();
      rebuildModelSection();
    } finally { refreshBtn.textContent = "↻ Refresh Models"; refreshBtn.disabled = false; }
  });
  ov.appendChild(refreshBtn);

  // ── Refiner settings (T2I split fraction) ────────────────────────────────
  const fracIn = el("input", { type: "number", min: "0.1", max: "0.99", step: "0.05", style: {
    width: "80px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
    borderRadius: "6px", padding: "6px", fontSize: "12px", fontFamily: "inherit",
  }});
  fracIn.value = state.refinerStepFrac ?? 0.8;
  fracIn.addEventListener("input", () => { state.refinerStepFrac = parseFloat(fracIn.value) || 0.8; ctx.persist(); });
  ov.appendChild(panel([
    label("Refiner Step Fraction (T2I — base uses this % of steps)"),
    el("div", { style: { display: "flex", alignItems: "center", gap: "6px" } }, [
      fracIn,
      el("span", { text: "e.g. 0.8 = first 80% base, last 20% refiner", style: { color: C.muted, fontSize: "11px" } }),
    ]),
  ]));

  // ── Language ──────────────────────────────────────────────────────────────
  const langSel = el("select", { style: {
    background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
    borderRadius: "6px", padding: "5px 8px", fontSize: "12px", fontFamily: "inherit", outline: "none",
  }, onchange: e => { setLang(e.target.value); window.location.reload(); }});
  ["ko", "en"].forEach(code => {
    const opt = el("option", { value: code, text: code === "ko" ? "한국어" : "English" });
    if (getLang() === code) opt.selected = true;
    langSel.appendChild(opt);
  });
  ov.appendChild(panel([label("Language"), langSel]));

  // ── Negative prompt ────────────────────────────────────────────────────────
  const negTA = el("textarea", { placeholder: "Negative prompt…", style: {
    width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text,
    border: `1px solid ${C.border}`, borderRadius: "6px", padding: "7px",
    fontSize: "12px", fontFamily: "inherit", resize: "vertical", outline: "none", minHeight: "60px",
  }});
  negTA.value = state.negativePrompt || "";
  negTA.addEventListener("input", () => { state.negativePrompt = negTA.value; });
  ov.appendChild(panel([label("Negative Prompt (global default)"), negTA]));

  // ── Prompt suffix ─────────────────────────────────────────────────────────
  const suffixIn = el("input", { type: "text", placeholder: "e.g. masterpiece, best quality, ultra detailed", style: {
    width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text,
    border: `1px solid ${C.border}`, borderRadius: "6px", padding: "7px",
    fontSize: "12px", fontFamily: "inherit",
  }});
  suffixIn.value = state.promptSuffix || "";
  suffixIn.addEventListener("input", () => { state.promptSuffix = suffixIn.value; });
  ov.appendChild(panel([label("Prompt Suffix (auto-appended)"), suffixIn]));

  // ── Save folder ────────────────────────────────────────────────────────────
  const pathIn = el("input", { type: "text", placeholder: SUBFOLDER, style: {
    width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text,
    border: `1px solid ${C.border}`, borderRadius: "6px", padding: "7px",
    fontSize: "12px", fontFamily: "inherit",
  }});
  pathIn.value = state.saveSubfolder || "";
  pathIn.addEventListener("input", () => { state.saveSubfolder = pathIn.value; });
  ov.appendChild(panel([label("Save Folder (inside ComfyUI/output/)"), pathIn]));

  // ── Save All ──────────────────────────────────────────────────────────────
  async function saveAll() {
    state.negativePrompt = negTA.value;
    state.promptSuffix   = suffixIn.value;
    state.saveSubfolder  = pathIn.value;
    ctx.persist();
    try {
      await saveConfig({
        selected_checkpoint:   state.checkpoint        || "",
        selected_refiner:      state.refinerCheckpoint || "",
        selected_unet:         state.unet              || "",
        selected_clip_l:       state.clipL             || "",
        selected_clip_g:       state.clipG             || "",
        selected_vae:          state.vae               || "",
        model_loader_mode:     state.modelLoaderMode   || "checkpoint",
        negative_prompt:       state.negativePrompt    || "",
        prompt_suffix:         state.promptSuffix      || "",
        save_subfolder:        state.saveSubfolder     || "",
      });
    } catch(e) { console.warn("[SDXL] saveConfig:", e); }
    ctx._refreshToggle?.();
    ov.style.display = "none";
  }

  // Init
  rebuildModelSection();

  // Load config on open
  getConfig().then(cfg => {
    if (!cfg) return;
    if (!state.checkpoint && cfg.selected_checkpoint) { state.checkpoint = cfg.selected_checkpoint; }
    if (!state.refinerCheckpoint && cfg.selected_refiner) { state.refinerCheckpoint = cfg.selected_refiner; }
    if (!state.unet  && cfg.selected_unet)   { state.unet  = cfg.selected_unet; }
    if (!state.clipL && cfg.selected_clip_l) { state.clipL = cfg.selected_clip_l; }
    if (!state.clipG && cfg.selected_clip_g) { state.clipG = cfg.selected_clip_g; }
    if (!state.vae   && cfg.selected_vae)    { state.vae   = cfg.selected_vae; }
    ctx.persist();
  }).catch(() => {});

  // Load models
  getModels().then(d => {
    _modelData = d;
    ctx.availableLoras = d.loras || [];
    rebuildModelSection();
  }).catch(() => {});

  return {
    el: ov,
    show() { ov.style.display = "flex"; },
    hide() { ov.style.display = "none"; },
  };
}

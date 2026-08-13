// ui_app_settings_minimax.js — Settings overlay for MiniMax H3 ONE STUDIO (TJ)
// Tabs: Models · Sampling · Preview · Output. Everything here is set once and reused
// by every clip; per-run choices live in the node's left panel instead.
import { C, BRAND, el, clear, SUBFOLDER, SAMPLERS, SCHEDULERS } from "./core_minimax.js";
import { panel, label, button, select, numberField, row, col } from "../klein/ui_common.js";
import { getModels, getConfig, saveConfig, getNodeAvailability } from "./api_minimax.js";

function searchableSelect(options, value, onChange) {
  const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "2px" } });
  const search = el("input", { type: "text", placeholder: "Search…", style: {
    width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text,
    border: `1px solid ${C.border}`, borderRadius: "6px", padding: "5px 7px",
    fontSize: "11px", fontFamily: "inherit", outline: "none",
  }});
  const sel = el("select", { style: {
    width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text,
    border: `1px solid ${C.border}`, borderRadius: "6px", padding: "6px",
    fontSize: "12px", fontFamily: "inherit", outline: "none",
  // A long folder path is cut off by the field's width, so the whole name lives in the
  // tooltip — on the closed select and on every entry in the open list.
  }, onchange: e => { sel.title = e.target.value; onChange(e.target.value); } }, options.map(opt => {
    const v = typeof opt === "string" ? opt : opt.value;
    const t = typeof opt === "string" ? opt : opt.label;
    return el("option", { value: v, text: t, title: v, ...(v === value ? { selected: "selected" } : {}) });
  }));
  sel.title = value || "";
  search.addEventListener("input", () => {
    const q = search.value.toLowerCase().trim();
    Array.from(sel.options).forEach(o => { o.hidden = q && !o.text.toLowerCase().includes(q); });
    const cur = Array.from(sel.options).find(o => o.value === sel.value);
    if (cur) cur.hidden = false;
  });
  wrap.appendChild(search); wrap.appendChild(sel);
  return { el: wrap, getValue: () => sel.value, setValue: v => { sel.value = v; sel.title = v || ""; } };
}

function numField(value, onChange, { step = "0.01", min = null, max = null } = {}) {
  const inp = el("input", { type: "number", step, style: {
    width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text,
    border: `1px solid ${C.border}`, borderRadius: "6px", padding: "6px",
    fontSize: "12px", fontFamily: "inherit", outline: "none",
  }});
  if (min != null) inp.min = min;
  if (max != null) inp.max = max;
  inp.value = value;
  inp.addEventListener("input", () => {
    const v = parseFloat(inp.value);
    onChange(isNaN(v) ? value : v);
  });
  return inp;
}

function checkbox(labelText, checked, onChange) {
  const chk = el("input", { type: "checkbox" });
  chk.checked = !!checked;
  chk.addEventListener("change", () => onChange(chk.checked));
  return el("label", { style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: C.text, cursor: "pointer" } },
    [chk, el("span", { text: labelText })]);
}

export function createSettingsOverlay(state, ctx) {
  const ov = el("div", { style: {
    position: "absolute", inset: "0", zIndex: "9998",
    background: "rgba(11,11,11,0.97)", borderRadius: "inherit",
    display: "none", flexDirection: "column", padding: "12px", gap: "8px",
    boxSizing: "border-box",
  }});

  const topRow = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" } });
  topRow.appendChild(el("div", { text: "⚙ Settings — MiniMax H3 ONE STUDIO (TJ)", style: { color: "#fff", fontSize: "14px", fontWeight: "700", flex: "1" } }));
  const saveAllBtn = button("💾 Save All", () => saveAll(), "primary");
  topRow.appendChild(saveAllBtn);
  topRow.appendChild(button("✕", () => { ov.style.display = "none"; }, "danger"));
  ov.appendChild(topRow);

  // ── tab bar ────────────────────────────────────────────────────────────────
  const TABS = ["Models", "Sampling", "Preview", "Output"];
  let activeTab = "Models";
  const tabBar = el("div", { style: { display: "flex", gap: "6px", flexShrink: "0" } });
  const bodyWrap = el("div", { style: { flex: "1", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px", paddingRight: "4px" } });
  bodyWrap.className = "mmh3-lp";
  ov.appendChild(tabBar); ov.appendChild(bodyWrap);

  function renderTabs() {
    clear(tabBar);
    TABS.forEach(t => {
      const active = t === activeTab;
      const b = el("button", { type: "button", text: t, style: {
        cursor: "pointer", fontFamily: "inherit", fontSize: "12px", padding: "6px 14px",
        borderRadius: "6px", fontWeight: active ? "700" : "400",
        background: active ? BRAND : C.bg2, color: "#fff",
        border: `1px solid ${active ? BRAND : C.border}`,
      }});
      b.addEventListener("click", () => { activeTab = t; renderTabs(); renderBody(); });
      tabBar.appendChild(b);
    });
  }

  // ── model dropdown state ───────────────────────────────────────────────────
  let modelData = { diffusion_models: [], text_encoders: [], vaes: [], loras: [], upscale_models: [] };
  let availability = { available: {}, missing_optional: [] };

  function modelsTab() {
    const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } });
    const diff = ["none", ...(modelData.diffusion_models || []).filter(x => x !== "none")];
    const te   = ["none", ...(modelData.text_encoders    || []).filter(x => x !== "none")];
    const vae  = ["none", ...(modelData.vaes             || []).filter(x => x !== "none")];
    const lor  = ["none", ...(modelData.loras            || []).filter(x => x !== "none")];
    const ups  = ["none", ...(modelData.upscale_models   || []).filter(x => x !== "none")];

    // the mode pills and the continuity list are gated on these, so re-render them
    const uFL = searchableSelect(diff, state.unetFirstLast || "none", v => { state.unetFirstLast = v; ctx.persist(); ctx.refreshModes?.(); });
    const uRF = searchableSelect(diff, state.unetReference || "none", v => { state.unetReference = v; ctx.persist(); ctx.refreshModes?.(); });
    wrap.appendChild(panel([
      label("Diffusion Models — the reference workflow keeps these separate on purpose"),
      row([
        col([label("UNET · First/Last (FL2VA)"), uFL.el]),
        col([label("UNET · Reference (REF2VA)"), uRF.el]),
      ]),
      el("div", { html: "Text-only and First/Last modes use the FL2VA model; Reference mode uses the REF2VA one. → <code>models/diffusion_models/</code>", style: { fontSize: "10px", color: C.muted } }),
    ]));

    const cl = searchableSelect(te,  state.clipName || "none", v => { state.clipName = v; ctx.persist(); });
    const vv = searchableSelect(vae, state.vaeVideo || "none", v => { state.vaeVideo = v; ctx.persist(); });
    const va = searchableSelect(vae, state.vaeAudio || "none", v => { state.vaeAudio = v; ctx.persist(); });
    wrap.appendChild(panel([
      label("Text Encoder & VAEs"),
      col([label("Text Encoder (CLIPLoader type=minimax)"), cl.el]),
      row([col([label("Video VAE"), vv.el]), col([label("Audio VAE"), va.el])]),
      el("div", { html: "→ <code>models/text_encoders/</code> · <code>models/vae/</code>", style: { fontSize: "10px", color: C.muted } }),
    ]));

    const tl = searchableSelect(lor, state.turboLora || "none", v => { state.turboLora = v; ctx.persist(); ctx.refreshPlan?.(); });
    const um = searchableSelect(ups, state.upscaleModel || "none", v => { state.upscaleModel = v; ctx.persist(); });
    wrap.appendChild(panel([
      label("Acceleration & Upscale"),
      col([label("Turbo LoRA (Text only / First-Last)"), tl.el]),
      el("div", { html: "Turbo LoRAs are trained against a specific base model and only <code>fl2v</code> ones "
        + "exist, so <b>Reference mode doesn't offer Turbo at all</b> — use SolAttn, Spectrum or None there.",
        style: { fontSize: "10px", color: C.muted, lineHeight: "1.55" } }),
      row([
        col([label("Turbo strength"), numField(state.turboLoraStrength ?? 1.0, v => { state.turboLoraStrength = v; ctx.persist(); })]),
        col([label(" "), checkbox("Low VRAM turbo load", state.turboLoraLowVram, v => { state.turboLoraLowVram = v; ctx.persist(); })]),
      ]),
      col([label("Upscale Model (used when Upscale = Upscale Model)"), um.el]),
    ]));

    // model patches
    wrap.appendChild(panel([
      label("Model Patches"),
      row([
        col([checkbox("SageAttention (KJ)", state.useSageAttn, v => { state.useSageAttn = v; ctx.persist(); })]),
        col([label("mode"), select(
          ["auto", "disabled", "sageattn3", "sageattn3_per_block_mean",
           "sageattn_qk_int8_pv_fp16_cuda", "sageattn_qk_int8_pv_fp8_cuda"].map(s => ({ value: s, label: s })),
          state.sageAttnMode || "auto", v => { state.sageAttnMode = v; ctx.persist(); })]),
      ]),
      checkbox("H3 memory-efficient SageAttention patch", state.useMemEffSage, v => { state.useMemEffSage = v; ctx.persist(); }),
      row([
        col([checkbox("Torch settings patch", state.useTorchPatch, v => { state.useTorchPatch = v; ctx.persist(); })]),
        col([checkbox("fp16 accumulation", state.fp16Accum, v => { state.fp16Accum = v; ctx.persist(); })]),
      ]),
      checkbox("H3 Cache (step reuse)", state.useCache, v => { state.useCache = v; ctx.persist(); renderBody(); }),
      ...(state.useCache ? [row([
        col([label("reuse threshold"), numField(state.cacheThreshold ?? 0.3, v => { state.cacheThreshold = v; ctx.persist(); })]),
        col([label("max steps"), numField(state.cacheMaxSteps ?? 2, v => { state.cacheMaxSteps = Math.round(v); ctx.persist(); }, { step: "1" })]),
      ]), row([
        col([label("start %"), numField(state.cacheStart ?? 0.15, v => { state.cacheStart = v; ctx.persist(); })]),
        col([label("end %"),   numField(state.cacheEnd ?? 0.9,   v => { state.cacheEnd = v; ctx.persist(); })]),
      ])] : []),
    ]));

    const missing = availability.missing_optional || [];
    const availNote = el("div", { style: { fontSize: "10px", lineHeight: "1.6", color: missing.length ? C.warn : C.ok } });
    availNote.innerHTML = missing.length
      ? `⚠ Not installed — the matching feature stays off: <code>${missing.join("</code>, <code>")}</code>`
      : "✓ All optional acceleration / preview / upscale packs are installed.";
    wrap.appendChild(panel([label("Third-party pack status"), availNote]));
    return wrap;
  }

  function samplingTab() {
    const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } });
    wrap.appendChild(panel([
      label("Steps & acceleration"),
      el("div", { html: "Step counts and each acceleration mode's tuning knobs now live in the node's "
        + "<b>left panel</b>, directly under the Acceleration dropdown — switching modes there doesn't "
        + "require coming back here.", style: { fontSize: "11px", color: C.muted, lineHeight: "1.6" } }),
    ]));
    wrap.appendChild(panel([
      label("Sampler"),
      row([
        col([label("Sampler (non-turbo)"), select(SAMPLERS.map(s => ({ value: s, label: s })), state.sampler || "er_sde", v => { state.sampler = v; ctx.persist(); })]),
        col([label("Scheduler"), select(SCHEDULERS.map(s => ({ value: s, label: s })), state.scheduler || "simple", v => { state.scheduler = v; ctx.persist(); })]),
      ]),
      col([label("Denoise"), numField(state.denoise ?? 1.0, v => { state.denoise = v; ctx.persist(); })]),
    ]));
    wrap.appendChild(panel([
      label("Sigma Shift (MiniMaxH3SigmaShift)"),
      row([
        col([label("shift_video"), numField(state.shiftVideo ?? 12, v => { state.shiftVideo = v; ctx.persist(); }, { step: "0.5" })]),
        col([label("shift_audio"), numField(state.shiftAudio ?? 3,  v => { state.shiftAudio = v; ctx.persist(); }, { step: "0.5" })]),
      ]),
    ]));
    wrap.appendChild(panel([
      label("Ollama (prompt enhance)"),
      col([label("Server URL"), (() => {
        const inp = el("input", { type: "text", placeholder: "http://127.0.0.1:11434", style: {
          width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text,
          border: `1px solid ${C.border}`, borderRadius: "6px", padding: "6px",
          fontSize: "12px", fontFamily: "inherit", outline: "none",
        }});
        inp.value = state.ollamaUrl || "http://127.0.0.1:11434";
        inp.addEventListener("input", () => { state.ollamaUrl = inp.value.trim(); ctx.persist(); });
        return inp;
      })()]),
      row([
        col([label("Temperature"), numField(state.ollamaTemperature ?? 0.7, v => { state.ollamaTemperature = v; ctx.persist(); })]),
        col([label("Top P"),       numField(state.ollamaTopP ?? 0.9,        v => { state.ollamaTopP = v; ctx.persist(); })]),
      ]),
      el("div", { text: "Used by the 📝 Prompt Edit popup's Enhance button. The MiniMax H3 brief instruction "
        + "is loaded from TJ_NODE automatically.", style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } }),
    ]));
    return wrap;
  }

  function previewTab() {
    const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } });
    const kjOk = !!availability.available?.ModelPreviewOverrideKJ;
    const note = el("div", { style: { fontSize: "10px", lineHeight: "1.6", color: kjOk ? C.muted : C.warn } });
    note.innerHTML = kjOk
      ? "Live sampling frames are decoded and streamed into this node's preview box while the clip renders. "
        + "More frames = an animated clip preview (mp4) instead of a still, at some extra cost per step."
      : "⚠ <code>ModelPreviewOverrideKJ</code> (comfyui-kjnodes) is not installed — generation still works, but the preview box only shows progress.";
    wrap.appendChild(panel([
      label("Live Preview (ModelPreviewOverrideKJ)"),
      checkbox("Show live frames while sampling", state.previewEnabled, v => { state.previewEnabled = v; ctx.persist(); }),
      row([
        col([label("Preview frames"), numField(state.previewFrames ?? 8, v => { state.previewFrames = Math.max(1, Math.round(v)); ctx.persist(); }, { step: "1" })]),
        col([label("Preview fps"),    numField(state.previewFps ?? 12,   v => { state.previewFps = Math.max(1, Math.round(v)); ctx.persist(); }, { step: "1" })]),
      ]),
      row([
        col([label("Max resolution"), numField(state.previewMaxRes ?? 512, v => { state.previewMaxRes = Math.round(v); ctx.persist(); }, { step: "64" })]),
        col([label("JPEG quality"),   numField(state.previewQuality ?? 85, v => { state.previewQuality = Math.round(v); ctx.persist(); }, { step: "1" })]),
      ]),
      note,
    ]));
    return wrap;
  }

  function outputTab() {
    const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } });
    const pathIn = el("input", { type: "text", placeholder: SUBFOLDER, style: {
      width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text,
      border: `1px solid ${C.border}`, borderRadius: "6px", padding: "7px",
      fontSize: "12px", fontFamily: "inherit",
    }});
    pathIn.value = state.saveSubfolder || "";
    pathIn.addEventListener("input", () => { state.saveSubfolder = pathIn.value.trim(); ctx.persist(); });

    const prefixIn = el("input", { type: "text", placeholder: "MMH3", style: {
      width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text,
      border: `1px solid ${C.border}`, borderRadius: "6px", padding: "7px",
      fontSize: "12px", fontFamily: "inherit",
    }});
    prefixIn.value = state.filenamePrefix || "MMH3";
    prefixIn.addEventListener("input", () => { state.filenamePrefix = prefixIn.value.trim(); ctx.persist(); });

    wrap.appendChild(panel([
      label("Save Folder (inside ComfyUI output/)"), pathIn,
      label("Filename Prefix"), prefixIn,
      el("div", { text: "Every clip is always written to disk as its own video; the stitched file is written alongside them.", style: { fontSize: "10px", color: C.muted } }),
    ]));

    wrap.appendChild(panel([
      label("Relay"),
      checkbox("Stitch all clips into one video when the run finishes", state.stitchAtEnd, v => { state.stitchAtEnd = v; ctx.persist(); }),
      checkbox("Trim the stitched video to the requested total length", state.trimLastClip, v => { state.trimLastClip = v; ctx.persist(); }),
      checkbox("Free VRAM between clips (slower reload, safer on 16GB)", state.unloadBetweenClips, v => { state.unloadBetweenClips = v; ctx.persist(); }),
      col([label("Avg minutes per clip (used for the time estimate)"),
        numField(state.avgMinutesPerClip ?? 13, v => { state.avgMinutesPerClip = v; ctx.persist(); ctx.refreshPlan?.(); }, { step: "0.5" })]),
    ]));

    const suffixIn = el("input", { type: "text", placeholder: "e.g. cinematic lighting, film grain", style: {
      width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text,
      border: `1px solid ${C.border}`, borderRadius: "6px", padding: "7px",
      fontSize: "12px", fontFamily: "inherit",
    }});
    suffixIn.value = state.promptSuffix || "";
    suffixIn.addEventListener("input", () => { state.promptSuffix = suffixIn.value; ctx.persist(); });
    wrap.appendChild(panel([label("Prompt Suffix (appended to every clip prompt)"), suffixIn]));
    return wrap;
  }

  function renderBody() {
    clear(bodyWrap);
    const fn = { Models: modelsTab, Sampling: samplingTab, Preview: previewTab, Output: outputTab }[activeTab];
    bodyWrap.appendChild(fn());
  }

  function saveAll() {
    ctx.persist();
    saveConfig({
      unet_first_last: state.unetFirstLast || "",
      unet_reference:  state.unetReference || "",
      clip_name:       state.clipName      || "",
      vae_video:       state.vaeVideo      || "",
      vae_audio:       state.vaeAudio      || "",
      turbo_lora:      state.turboLora     || "",
      turbo_lora_strength: state.turboLoraStrength ?? 1.0,
      upscale_model:   state.upscaleModel  || "",
      save_subfolder:  state.saveSubfolder || "",
      prompt_suffix:   state.promptSuffix  || "",
      avg_minutes_per_clip: state.avgMinutesPerClip ?? 13,
    });
    saveAllBtn.textContent = "✓ Saved!";
    setTimeout(() => { saveAllBtn.textContent = "💾 Save All"; }, 1500);
  }

  async function refreshModels() {
    try {
      modelData = await getModels();
      ctx.availableModels = modelData;
    } catch { /* keep whatever we had */ }
    try {
      availability = await getNodeAvailability();
      ctx.availability = availability.available || {};
      ctx.availabilityInfo = availability;
    } catch {}
    renderBody();
    ctx.onAvailability?.(availability);
  }

  // seed state from the saved config the first time (never clobbers a live choice)
  getConfig().then(cfg => {
    const take = (k, v) => { if ((!state[k] || state[k] === "none") && v && v !== "none") state[k] = v; };
    take("unetFirstLast", cfg.unet_first_last);
    take("unetReference", cfg.unet_reference);
    take("clipName",      cfg.clip_name);
    take("vaeVideo",      cfg.vae_video);
    take("vaeAudio",      cfg.vae_audio);
    take("turboLora",     cfg.turbo_lora);
    take("upscaleModel",  cfg.upscale_model);
    if (cfg.turbo_lora_strength != null && state.turboLoraStrength == null) state.turboLoraStrength = cfg.turbo_lora_strength;
    if (cfg.prompt_suffix && !state.promptSuffix) state.promptSuffix = cfg.prompt_suffix;
    if (cfg.avg_minutes_per_clip != null) state.avgMinutesPerClip = cfg.avg_minutes_per_clip;
    ctx.persist(); ctx.refreshPlan?.(); ctx.refreshModes?.();
  }).catch(() => {}).finally(refreshModels);

  renderTabs(); renderBody();

  return {
    el: ov,
    show() { ov.style.display = "flex"; refreshModels(); },
    hide() { ov.style.display = "none"; },
    refreshModels,
  };
}

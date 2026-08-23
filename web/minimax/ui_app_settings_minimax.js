// ui_app_settings_minimax.js — Settings overlay for MiniMax H3 ONE STUDIO (TJ)
// Tabs: Models · Sampling · Preview · Output. Everything here is set once and reused
// by every clip; per-run choices live in the node's left panel instead.
import { C, BRAND, el, clear, SUBFOLDER, SAMPLERS, SCHEDULERS } from "./core_minimax.js";
import { panel, label, button, select, numberField, row, col } from "../klein/ui_common.js";
import { getModels, getConfig, saveConfig, getNodeAvailability, getOllamaModels } from "./api_minimax.js";

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
  let modelData = { diffusion_models: [], text_encoders: [], vaes: [], loras: [], upscale_models: [], vae_approx: [] };
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
      col([label("Turbo LoRA(larryvrh)"), tl.el]),
      row([
        col([label("Turbo strength"), numField(state.turboLoraStrength ?? 1.0, v => { state.turboLoraStrength = v; ctx.persist(); })]),
        col([label(" "), checkbox("Low VRAM turbo load", state.turboLoraLowVram, v => { state.turboLoraLowVram = v; ctx.persist(); })]),
      ]),
      col([label("Upscale Model (used when Upscale = Upscale Model)"), um.el]),
    ]));

    // model patches — SageAttention and CK-Attention are two alternative attention
    // backends, so only one of the two groups can be active at a time. Picking Sage
    // turns its whole group (mode + the H3 mem-efficient patch) on together; picking
    // CK turns the Sage group off and leaves only CK's own setting editable.
    // Both checkboxes stay clickable at all times — picking one just turns the other off,
    // no separate "uncheck this first" step needed.
    const sageChk = checkbox("SageAttention (KJ)", state.useSageAttn, v => {
      state.useSageAttn = v;
      if (v) state.useCkAttention = false; else state.useMemEffSage = false;
      ctx.persist(); renderBody();
    });
    const sageModeSel = select(
      ["auto", "disabled", "sageattn3", "sageattn3_per_block_mean",
       "sageattn_qk_int8_pv_fp16_cuda", "sageattn_qk_int8_pv_fp8_cuda"].map(s => ({ value: s, label: s })),
      state.sageAttnMode || "auto", v => { state.sageAttnMode = v; ctx.persist(); });
    const memEffChk = checkbox("H3 memory-efficient SageAttention patch", state.useMemEffSage, v => {
      state.useMemEffSage = v; ctx.persist();
    });
    const ckChk = checkbox("CK-Attention (comfy kitchen)", state.useCkAttention, v => {
      state.useCkAttention = v;
      if (v) state.useSageAttn = false;
      ctx.persist(); renderBody();
    });
    const ckSel = select(
      [{ value: "comfy_kitchen", label: "comfy kitchen attention" }, { value: "pytorch", label: "pytorch attention" }],
      state.ckAttentionBackend || "comfy_kitchen", v => { state.ckAttentionBackend = v; ctx.persist(); });
    if (!state.useSageAttn) {
      sageModeSel.disabled = true; sageModeSel.style.opacity = "0.4";
      memEffChk.style.opacity = "0.4"; memEffChk.querySelector("input").disabled = true;
    }
    if (!state.useCkAttention) { ckSel.disabled = true; ckSel.style.opacity = "0.4"; }
    wrap.appendChild(panel([
      label("Model Patches"),
      el("div", { text: "SageAttention and CK-Attention are alternative backends — only one group is active at a time.",
        style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } }),
      row([col([sageChk]), col([label("mode"), sageModeSel])]),
      memEffChk,
      row([col([ckChk]), col([label("attention"), ckSel])]),
      row([
        col([checkbox("Torch settings patch", state.useTorchPatch, v => { state.useTorchPatch = v; ctx.persist(); })]),
        col([checkbox("fp16 accumulation", state.fp16Accum, v => { state.fp16Accum = v; ctx.persist(); })]),
      ]),
      // The on/off lives in the node's left panel — it gets flipped per run. These are
      // the tuning values behind it, which are set once.
      label(state.useCache ? "H3 Cache (step reuse) — ON in the node's left panel"
                           : "H3 Cache (step reuse) — OFF in the node's left panel"),
      ...(state.useCache ? [row([
        col([label("reuse threshold"), numField(state.cacheThreshold ?? 0.3, v => { state.cacheThreshold = v; ctx.persist(); })]),
        col([label("max steps"), numField(state.cacheMaxSteps ?? 2, v => { state.cacheMaxSteps = Math.round(v); ctx.persist(); }, { step: "1" })]),
      ]), row([
        col([label("start %"), numField(state.cacheStart ?? 0.15, v => { state.cacheStart = v; ctx.persist(); })]),
        col([label("end %"),   numField(state.cacheEnd ?? 0.9,   v => { state.cacheEnd = v; ctx.persist(); })]),
      ])] : []),
    ]));

    const slaOk = !!availability.available?.H3SLAAttention;
    wrap.appendChild(panel([
      checkbox("H3 SLA Attention (block-sparse, last before the sampler)", state.useSlaAttention, v => {
        state.useSlaAttention = v; ctx.persist(); renderBody(); ctx.refreshModes?.();
      }),
      ...(!slaOk ? [el("div", { html: "⚠ <code>H3SLAAttention</code> not installed — this stays off.",
        style: { fontSize: "10px", color: C.warn, lineHeight: "1.5" } })] : []),
      ...(state.useSlaAttention ? [
        row([
          col([label("sparsity ratio"), numField(state.slaSparsity ?? 0.90, v => { state.slaSparsity = v; ctx.persist(); }, { step: "0.05" })]),
          col([label("block size"), select(["64", "128"].map(s => ({ value: s, label: s })),
            state.slaBlockSize || "64", v => { state.slaBlockSize = v; ctx.persist(); })]),
        ]),
        row([
          col([label("min seq len"), numField(state.slaMinSeqLen ?? 8192, v => { state.slaMinSeqLen = Math.round(v); ctx.persist(); }, { step: "1024" })]),
          col([label("dense last steps"), numField(state.slaDenseLastSteps ?? 0, v => { state.slaDenseLastSteps = Math.round(v); ctx.persist(); }, { step: "1" })]),
        ]),
        checkbox("Protect audio (always attend text/cond/audio prefix)", state.slaProtectAudio !== false, v => { state.slaProtectAudio = v; ctx.persist(); }),
        el("div", { text: "Quick on/off per run (the node's own bypass) lives in the node's left panel, under H3 FirstBlockCache.",
          style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } }),
      ] : []),
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
      label("Ollama server"),
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
      el("div", { text: "Only read when Vision source below is set to Ollama.",
        style: { fontSize: "10px", color: C.muted } }),
    ]));

    // Prompt Edit's Enhance button needs two roles either way — something that reads an
    // image and something that writes the brief text — and now two ways to run them.
    // Ollama hits the external server, same as always. Native batches images through
    // TextGenerate on a ComfyUI-loaded CLIP: proven (SPEC §C5) to attend to every image
    // in a batch correctly, where Ollama's `images` array was tested and only ever
    // looked at one of them (§C0) — and it costs no separate server or model file, since
    // the same CLIPLoader(type=minimax) family MiniMax H3 already loads for text can do
    // vision too when it's a Qwen3-VL checkpoint.
    wrap.appendChild(panel([
      label("Image → Brief — vision source"),
      (() => {
        const srcRow = el("div", { style: { display: "flex", gap: "4px" } });
        const SOURCES = [
          { key: "ollama", label: "Ollama" },
          { key: "native", label: "Native (CLIP, no server)" },
        ];
        function renderSrc() {
          clear(srcRow);
          SOURCES.forEach(s => {
            const active = (state.visionSource || "ollama") === s.key;
            const b = el("button", { type: "button", text: s.label, style: {
              cursor: "pointer", fontFamily: "inherit", fontSize: "11px", padding: "5px 10px",
              borderRadius: "6px", fontWeight: active ? "700" : "400",
              background: active ? BRAND : C.bg2, color: "#fff",
              border: `1px solid ${active ? BRAND : C.border}`,
            }});
            b.addEventListener("click", () => { state.visionSource = s.key; ctx.persist(); renderModelPickers(); });
            srcRow.appendChild(b);
          });
        }
        renderSrc();
        return srcRow;
      })(),
      (() => {
        const pickWrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px", marginTop: "6px" } });
        renderModelPickersInto = pickWrap;
        return pickWrap;
      })(),
    ]));
    renderModelPickers();
    return wrap;
  }

  // Two model pickers, swapped out by source. Declared at module scope inside
  // ollamaTab() so the vision-source toggle above can trigger a re-render.
  let renderModelPickersInto = null;
  function renderModelPickers() {
    const wrap2 = renderModelPickersInto;
    if (!wrap2) return;
    clear(wrap2);
    const source = state.visionSource || "ollama";

    if (source === "ollama") {
      const briefWrap = el("div"), visionWrap = el("div");
      const statusRow = el("div", { style: { fontSize: "10px", color: C.muted } });
      let models = [];
      function renderPickers() {
        clear(briefWrap); clear(visionWrap);
        const opts = ["", ...models];
        const mk = (val, onChange) => select(
          opts.map(m => ({ value: m, label: m || "(none)" })),
          models.includes(val) ? val : "", onChange);
        briefWrap.appendChild(mk(state.ollamaModel, v => { state.ollamaModel = v; ctx.persist(); }));
        visionWrap.appendChild(mk(state.ollamaVisionModel, v => { state.ollamaVisionModel = v; ctx.persist(); }));
      }
      (async () => {
        statusRow.textContent = "connecting to Ollama…";
        const d = await getOllamaModels(state.ollamaUrl);
        models = d.models || [];
        statusRow.textContent = d.ok
          ? `${models.length} model${models.length === 1 ? "" : "s"} available`
          : `⚠ ${String(d.error || "unreachable").slice(0, 80)}`;
        statusRow.style.color = d.ok ? C.muted : C.warn;
        renderPickers();
      })().catch(() => { statusRow.textContent = "⚠ could not reach Ollama"; statusRow.style.color = C.warn; });
      wrap2.append(
        row([col([label("Brief model (writes the prompt)"), briefWrap]),
             col([label("Vision model (reads images)"), visionWrap])]),
        statusRow,
        el("div", { text: "The brief writer never sees an image, so any text model works there. A single Ollama "
          + "call with several images attached was tested and only one was ever attended to — images are analyzed "
          + "one at a time and merged as text before the brief model sees them.",
          style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } }),
      );
    } else {
      const missing = [];
      if (!availability.available?.TJ_MultiImageLoader)  missing.push("TJ_MultiImageLoader (TJ_NODE)");
      if (!availability.available?.TextGenerate)          missing.push("TextGenerate (ComfyUI core — update ComfyUI)");
      if (!availability.available?.TJStudioOneTextOutput) missing.push("TJStudioOneTextOutput (this package)");
      if (missing.length) {
        wrap2.appendChild(el("div", { text: `⚠ Native vision needs: ${missing.join(", ")}`,
          style: { fontSize: "10px", color: C.warn, lineHeight: "1.5" } }));
        return;
      }
      const clipList = ["none", ...(modelData.text_encoders || []).filter(x => x !== "none")];
      const briefPick  = searchableSelect(clipList, state.nativeBriefClip  || "none", v => { state.nativeBriefClip  = v === "none" ? "" : v; ctx.persist(); });
      const visionPick = searchableSelect(clipList, state.nativeVisionClip || "none", v => { state.nativeVisionClip = v === "none" ? "" : v; ctx.persist(); });
      wrap2.append(
        row([col([label("Brief CLIP (writes the prompt)"), briefPick.el]),
             col([label("Vision CLIP (reads images)"), visionPick.el])]),
        el("div", { text: "Both run through TextGenerate on ComfyUI's own model loading — no external server. "
          + "A Qwen3-VL checkpoint (the kind already used for MiniMax H3 text encoding) can be picked for either "
          + "or both roles; the same file works for both if you don't want two loaded at once.",
          style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } }),
      );
    }
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
      (() => {
        // Optional fast approx-decode VAE for the preview only (models/vae_approx/) — the
        // real render always uses the full VAEs in the Models tab. Left unset,
        // ModelPreviewOverrideKJ falls back to its own built-in approximation, not to any
        // file in vae_approx: this dropdown was previously wired into the graph builder but
        // never exposed here, so it always stayed unset.
        const vx = ["none", ...(modelData.vae_approx || []).filter(x => x !== "none")];
        const sel = searchableSelect(vx, state.previewTinyVae || "none", v => { state.previewTinyVae = v; ctx.persist(); });
        return col([label("Preview VAE (tiny/approx, optional — models/vae_approx/)"), sel.el]);
      })(),
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
      preview_tiny_vae: state.previewTinyVae || "",
      preview_enabled:  state.previewEnabled !== false,
      preview_frames:   state.previewFrames  ?? 8,
      preview_fps:      state.previewFps     ?? 12,
      preview_max_res:  state.previewMaxRes  ?? 512,
      preview_quality:  state.previewQuality ?? 85,
      turbo_lora_low_vram: state.turboLoraLowVram ?? false,
      sampler:          state.sampler     || "res_multistep",
      scheduler:        state.scheduler   || "simple",
      denoise:          state.denoise     ?? 1.0,
      shift_video:      state.shiftVideo  ?? 12,
      shift_audio:      state.shiftAudio  ?? 3,
      use_sage_attn:    state.useSageAttn   ?? true,
      sage_attn_mode:   state.sageAttnMode  || "auto",
      use_mem_eff_sage: state.useMemEffSage ?? true,
      use_torch_patch:  state.useTorchPatch ?? true,
      fp16_accum:       state.fp16Accum     ?? true,
      use_ck_attention:     state.useCkAttention     ?? false,
      ck_attention_backend: state.ckAttentionBackend || "comfy_kitchen",
      use_sla_attention:    state.useSlaAttention    ?? false,
      sla_sparsity:         state.slaSparsity        ?? 0.90,
      sla_block_size:       state.slaBlockSize       || "64",
      sla_min_seq_len:      state.slaMinSeqLen       ?? 8192,
      sla_dense_last_steps: state.slaDenseLastSteps  ?? 0,
      sla_protect_audio:    state.slaProtectAudio    ?? true,
      cache_threshold:  state.cacheThreshold ?? 0.3,
      cache_start:      state.cacheStart     ?? 0.15,
      cache_end:        state.cacheEnd       ?? 0.9,
      cache_max_steps:  state.cacheMaxSteps  ?? 2,
      ollama_url:            state.ollamaUrl         || "http://127.0.0.1:11434",
      ollama_model:          state.ollamaModel       || "",
      ollama_vision_model:   state.ollamaVisionModel || "",
      ollama_temperature:    state.ollamaTemperature ?? 0.7,
      ollama_top_p:          state.ollamaTopP        ?? 0.9,
      vision_source:         state.visionSource      || "ollama",
      native_vision_clip:    state.nativeVisionClip  || "",
      filename_prefix:       state.filenamePrefix    || "MMH3",
      stitch_at_end:         state.stitchAtEnd       ?? true,
      trim_last_clip:        state.trimLastClip      ?? false,
      unload_between_clips:  state.unloadBetweenClips ?? true,
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
    take("previewTinyVae", cfg.preview_tiny_vae);
    // These always have a value already (defaultState()'s `?? 8`/`?? true`/etc. fallback),
    // so the `take()`/`== null` guard used above can never fire for them — same situation
    // avg_minutes_per_clip already had, handled the same way: unconditional overwrite here
    // is safe because this whole block only runs once, before the user can have made a live
    // choice for THIS session.
    if (cfg.preview_enabled != null) state.previewEnabled = cfg.preview_enabled;
    if (cfg.preview_frames  != null) state.previewFrames  = cfg.preview_frames;
    if (cfg.preview_fps     != null) state.previewFps     = cfg.preview_fps;
    if (cfg.preview_max_res != null) state.previewMaxRes  = cfg.preview_max_res;
    if (cfg.preview_quality != null) state.previewQuality = cfg.preview_quality;
    if (cfg.turbo_lora_low_vram != null) state.turboLoraLowVram = cfg.turbo_lora_low_vram;
    if (cfg.sampler)             state.sampler        = cfg.sampler;
    if (cfg.scheduler)           state.scheduler      = cfg.scheduler;
    if (cfg.denoise != null)     state.denoise        = cfg.denoise;
    if (cfg.shift_video != null) state.shiftVideo     = cfg.shift_video;
    if (cfg.shift_audio != null) state.shiftAudio     = cfg.shift_audio;
    if (cfg.use_sage_attn != null)    state.useSageAttn   = cfg.use_sage_attn;
    if (cfg.sage_attn_mode)           state.sageAttnMode  = cfg.sage_attn_mode;
    if (cfg.use_mem_eff_sage != null) state.useMemEffSage = cfg.use_mem_eff_sage;
    if (cfg.use_torch_patch != null)  state.useTorchPatch = cfg.use_torch_patch;
    if (cfg.fp16_accum != null)       state.fp16Accum     = cfg.fp16_accum;
    if (cfg.use_ck_attention != null)     state.useCkAttention    = cfg.use_ck_attention;
    if (cfg.ck_attention_backend)         state.ckAttentionBackend = cfg.ck_attention_backend;
    if (cfg.use_sla_attention != null)    state.useSlaAttention   = cfg.use_sla_attention;
    if (cfg.sla_sparsity != null)         state.slaSparsity       = cfg.sla_sparsity;
    if (cfg.sla_block_size)               state.slaBlockSize      = cfg.sla_block_size;
    if (cfg.sla_min_seq_len != null)      state.slaMinSeqLen      = cfg.sla_min_seq_len;
    if (cfg.sla_dense_last_steps != null) state.slaDenseLastSteps = cfg.sla_dense_last_steps;
    if (cfg.sla_protect_audio != null)    state.slaProtectAudio   = cfg.sla_protect_audio;
    if (cfg.cache_threshold != null)  state.cacheThreshold = cfg.cache_threshold;
    if (cfg.cache_start != null)      state.cacheStart     = cfg.cache_start;
    if (cfg.cache_end != null)        state.cacheEnd       = cfg.cache_end;
    if (cfg.cache_max_steps != null)  state.cacheMaxSteps  = cfg.cache_max_steps;
    if (cfg.ollama_url)               state.ollamaUrl         = cfg.ollama_url;
    if (cfg.ollama_model)             state.ollamaModel       = cfg.ollama_model;
    if (cfg.ollama_vision_model)      state.ollamaVisionModel = cfg.ollama_vision_model;
    if (cfg.ollama_temperature != null) state.ollamaTemperature = cfg.ollama_temperature;
    if (cfg.ollama_top_p != null)       state.ollamaTopP        = cfg.ollama_top_p;
    if (cfg.vision_source)            state.visionSource     = cfg.vision_source;
    if (cfg.native_vision_clip)       state.nativeVisionClip = cfg.native_vision_clip;
    if (cfg.filename_prefix)          state.filenamePrefix   = cfg.filename_prefix;
    if (cfg.stitch_at_end != null)          state.stitchAtEnd        = cfg.stitch_at_end;
    if (cfg.trim_last_clip != null)         state.trimLastClip       = cfg.trim_last_clip;
    if (cfg.unload_between_clips != null)   state.unloadBetweenClips = cfg.unload_between_clips;
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

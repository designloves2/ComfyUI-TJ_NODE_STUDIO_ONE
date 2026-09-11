// ui_app_settings_minimax.js — Settings overlay for MiniMax H3 ONE STUDIO (TJ)
// Tabs: Models · Sampling · Preview · Output. Everything here is set once and reused
// by every clip; per-run choices live in the node's left panel instead.
import { C, BRAND, el, clear, SUBFOLDER } from "./core_minimax.js";
import { panel, label, button, select, numberField, row, col } from "../klein/ui_common.js";
import { getModels, getConfig, saveConfig, getNodeAvailability, listVideos } from "./api_minimax.js";

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
  const TABS = ["Models", "LLM Setting", "Preview", "Output"];
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

    const um = searchableSelect(ups, state.upscaleModel || "none", v => { state.upscaleModel = v; ctx.persist(); });
    wrap.appendChild(panel([
      label("Upscale"),
      col([label("Upscale Model (used when Upscale = Upscale Model)"), um.el]),
      el("div", { text: "Turbo LoRAs, attention, block cache, Spectrum and the model patches now live in "
        + "the node's left panel — they are per-run choices, so they sit next to the run.",
        style: { fontSize: "10px", color: C.muted, lineHeight: "1.55" } }),
    ]));

    // ── LTX 2.5 Upscale mode — its own model set (generationMode "ltxupscale") ──
    const lup  = ["none", ...(modelData.latent_upscale_models || []).filter(x => x !== "none")];
    const lte  = ["none", ...(modelData.text_encoders_all || modelData.text_encoders || []).filter(x => x !== "none")];
    const lxU  = searchableSelect(diff, state.ltxUnet           || "none", v => { state.ltxUnet = v === "none" ? "" : v;           ctx.persist(); ctx.refreshModes?.(); });
    const lxLU = searchableSelect(lup,  state.ltxLatentUpscaler || "none", v => { state.ltxLatentUpscaler = v === "none" ? "" : v; ctx.persist(); ctx.refreshModes?.(); });
    const lxC  = searchableSelect(lte,  state.ltxClip           || "none", v => { state.ltxClip = v === "none" ? "" : v;           ctx.persist(); ctx.refreshModes?.(); });
    const lxVV = searchableSelect(vae,  state.ltxVaeVideo       || "none", v => { state.ltxVaeVideo = v === "none" ? "" : v;       ctx.persist(); ctx.refreshModes?.(); });
    const lxVA = searchableSelect(vae,  state.ltxVaeAudio       || "none", v => { state.ltxVaeAudio = v === "none" ? "" : v;       ctx.persist(); ctx.refreshModes?.(); });
    wrap.appendChild(panel([
      label("LTX 2.5 Upscale — models for the LTX Upscale generation mode"),
      row([col([label("LTX unet (.gguf or .safetensors)"), lxU.el]),
           col([label("Latent spatial upscaler (x2)"), lxLU.el])]),
      col([label("Text encoder (.gguf → LTX25 CLIP GGUF LOADER (TJ); else CLIPLoader type ltxv)"), lxC.el]),
      row([col([label("LTX video VAE"), lxVV.el]), col([label("LTX audio VAE"), lxVA.el])]),
      el("div", { text: "The preview TAE (taeltx2*) lives in the Preview tab, next to LTX Upscale's live-preview switch.",
        style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } }),
      el("div", { html: "Files: LTX unet → <code>models/diffusion_models/</code> · latent upscaler → <code>models/latent_upscale_models/</code> · "
        + "text encoder → <code>models/text_encoders/</code> · VAEs → <code>models/vae/</code>. The gemma4 GGUF text encoder needs the "
        + "<code>ComfyUI-TJ_NODE</code> pack (<code>TJ_LTX25ClipLoaderGGUF</code>); the int8 safetensors works with core <code>CLIPLoader</code>.",
        style: { fontSize: "10px", color: C.muted, lineHeight: "1.6" } }),
    ]));

    // (the ✨ vision model + instruction for this mode live under the LLM Setting tab)

    const missing = availability.missing_optional || [];
    const missCore = availability.missing_core || [];
    const availNote = el("div", { style: { fontSize: "10px", lineHeight: "1.6", color: (missing.length || missCore.length) ? C.warn : C.ok } });
    availNote.innerHTML = (missing.length || missCore.length)
      ? (missCore.length ? `⛔ Required nodes missing — this node cannot render: <code>${missCore.join("</code>, <code>")}</code><br>` : "")
        + (missing.length ? `⚠ Not installed — the matching feature stays off: <code>${missing.join("</code>, <code>")}</code>` : "")
      : "✓ All optional acceleration / preview / upscale packs are installed.";
    const kids = [label("Third-party pack status"), availNote];
    if (missing.length || missCore.length) {
      const dir = availability.install_dir || "the package folder";
      const fix = el("div", { style: { fontSize: "10px", lineHeight: "1.6", color: C.muted, marginTop: "6px" } });
      fix.innerHTML =
        "ComfyUI-Manager installs this pack's Python requirements but <b>not</b> other node packs. "
        + "Run this once, then restart ComfyUI:";
      const cmd = el("div", { style: {
        fontFamily: "ui-monospace, Consolas, monospace", fontSize: "10px", marginTop: "4px",
        background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "6px",
        padding: "6px 8px", color: C.text, userSelect: "text", whiteSpace: "pre-wrap", wordBreak: "break-all",
      }});
      cmd.textContent =
        `Windows:      ${dir}\\${availability.install_script_win || "install_requirements.bat"}\n` +
        `Mac / Linux:  bash "${dir}/${availability.install_script_nix || "install_requirements.sh"}"`;
      kids.push(fix, cmd);
    }
    wrap.appendChild(panel(kids));
    return wrap;
  }

  function samplingTab() {
    const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } });
    // Sampler, scheduler, denoise and sigma shift now live in the node's left panel,
    // under Sampling — they are judged alongside Steps, so splitting them across a modal
    // meant going back and forth to change one thing. What is left here is the LLM config.
    // One backend: Image -> Brief runs natively through a ComfyUI-loaded CLIP. The
    // external Ollama server was removed on 2026-08-31 - it needed a second service, and
    // a single call with several images attached was only ever seen to attend to one of
    // them (SPEC_MINIMAX_H3_NEXT_ROUND.md C0), which the native batch path does correctly.
    wrap.appendChild(panel([
      label("Image -> Brief models"),
      (() => {
        const pickWrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } });
        renderModelPickersInto = pickWrap;
        return pickWrap;
      })(),
    ]));

    renderModelPickers();
    return wrap;
  }

  // Two model pickers, swapped out by source. Declared at module scope inside
  // the LLM tab so the model pickers can be re-rendered when availability arrives.
  let renderModelPickersInto = null;
  let _orModels = null;
  async function orModels() {
    if (_orModels) return _orModels;
    try { _orModels = (await (await fetch("/music_one/openrouter_models")).json()).models || []; }
    catch { _orModels = []; }
    return _orModels;
  }

  function _selEl(opts) {
    return el("select", { style: {
      width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text,
      border: `1px solid ${C.border}`, borderRadius: "6px", padding: "6px", fontSize: "12px", fontFamily: "inherit",
    }}, opts);
  }

  function renderModelPickers() {
    const wrap2 = renderModelPickersInto;
    if (!wrap2) return;
    clear(wrap2);

    // Brief (writes the prompt) and Vision (reads reference images) are chosen fully
    // independently — backend + model for each. e.g. brief on OpenRouter, vision on a
    // local CLIP, or vice versa. The OpenRouter key is the one shared with the image +
    // music nodes (server .env).
    const clipList = ["none", ...(modelData.text_encoders || []).filter(x => x !== "none")];
    const nativeMissing = [];
    if (!availability.available?.TJ_MultiImageLoader)   nativeMissing.push("TJ_MultiImageLoader");
    if (!availability.available?.TextGenerate)           nativeMissing.push("TextGenerate");
    if (!availability.available?.TJStudioOneTextOutput)  nativeMissing.push("TJStudioOneTextOutput");

    let anyOR = false;

    function roleRow(roleLabel, backendKey, clipKey, orModelKey, defaultBackend, extraRows) {
      // H3's Brief/Vision fall back to the legacy single H3 backend; the LTX row is fully
      // its own — never inherits an H3 value.
      const isLtx = backendKey.startsWith("ltx");
      if (!state[backendKey]) state[backendKey] = (isLtx ? null : state.h3LlmBackend) || defaultBackend || "native";
      if (!state[orModelKey] && !isLtx) state[orModelKey] = state.h3OrModel || "";
      const isOR = state[backendKey] === "openrouter";
      if (isOR) anyOR = true;

      const beSel = _selEl([
        el("option", { value: "native",     text: "Native (ComfyUI CLIP)", ...(!isOR ? { selected: "selected" } : {}) }),
        el("option", { value: "openrouter", text: "OpenRouter (cloud)",     ...(isOR ? { selected: "selected" } : {}) }),
      ]);
      beSel.addEventListener("change", () => {
        state[backendKey] = beSel.value; ctx.persist(); renderModelPickers();
      });

      let control;
      if (isOR) {
        // full OpenRouter model list, searchable — no vision-capability filter, the
        // user picks (qwen-vl flash, gemini, whatever). Default is a soft pre-select only.
        const cfgKey = orModelKey === "h3OrModelVision" ? "h3_or_model_vision"
          : orModelKey === "ltxVisionOrModel" ? "ltx_vision_or_model"
          : "h3_or_model_brief";
        const saveOr = (v) => {
          state[orModelKey] = v; ctx.persist();
          fetch("/minimax_h3_one/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [cfgKey]: v }) }).catch(() => {});
        };
        const holder = el("div");
        holder.appendChild(_selEl([el("option", { value: state[orModelKey] || "", text: state[orModelKey] || "loading models…" })]));
        orModels().then(ms => {
          if (!ms.length) return;
          if (!state[orModelKey]) { state[orModelKey] = (ms.find(m => /gemini-2\.5-flash/.test(m)) || ms[0]); ctx.persist(); }
          clear(holder);
          holder.appendChild(searchableSelect(ms, state[orModelKey], saveOr).el);
        });
        control = col([label(orModelKey === "h3OrModelVision" ? "OpenRouter model (vision)" : "OpenRouter model (brief)"), holder]);
      } else if (nativeMissing.length) {
        control = el("div", { text: `⚠ Native needs: ${nativeMissing.join(", ")} (TJ_NODE / update ComfyUI)`,
          style: { fontSize: "10px", color: C.warn, lineHeight: "1.5" } });
      } else {
        const pick = searchableSelect(clipList, state[clipKey] || "none", v => { state[clipKey] = v === "none" ? "" : v; ctx.persist(); });
        control = col([label("CLIP checkpoint"), pick.el]);
      }
      return col([
        el("div", { text: roleLabel, style: { fontSize: "11px", fontWeight: "700", color: BRAND } }),
        col([label("Backend"), beSel]),
        control,
        ...(extraRows || []),
      ]);
    }

    wrap2.append(
      roleRow("Brief — writes the prompt", "h3BriefBackend", "nativeBriefClip", "h3OrModelBrief", "native"),
      roleRow("Vision — reads reference images", "h3VisionBackend", "nativeVisionClip", "h3OrModelVision", "native"),
    );

    // ── LTX Upscale LLM — its own backend + model (not shared with H3) ──
    const mkTA = (val, on) => {
      const t = el("textarea", { value: val || "", style: {
        width: "100%", minHeight: "90px", boxSizing: "border-box", background: C.bg2, color: C.text,
        border: `1px solid ${C.border}`, borderRadius: "6px", padding: "7px", fontSize: "11px",
        fontFamily: "inherit", outline: "none", resize: "vertical" } });
      t.addEventListener("input", () => { on(t.value); ctx.persist(); });
      return t;
    };
    const ltxInstr = mkTA(state.ltxLlmPrompt, v => state.ltxLlmPrompt = v);
    const ltxConv  = mkTA(state.ltxConvertPrompt, v => state.ltxConvertPrompt = v);
    wrap2.append(el("div", { style: { borderTop: `1px solid ${C.border}`, margin: "4px 0 2px" } }));
    wrap2.append(roleRow("LTX Upscale — used by the ✨ and H3→LTX buttons", "ltxVisionBackend", "ltxVisionClip", "ltxVisionOrModel", "native", [
      col([label("✨ vision instruction — writes a prompt from the source clip's first frame"), ltxInstr]),
      col([label("H3 → LTX 2.5 instruction — converts a loaded H3 brief into an LTX prompt"), ltxConv]),
      el("div", { text: "Both instructions ship ready to use — you don't have to write them. The ✨ path needs a vision-capable model; H3→LTX is text-only. Saved with Save All.",
        style: { fontSize: "10px", color: C.muted, lineHeight: "1.55" } }),
    ]));

    if (anyOR) {
      const keyIn = el("input", { type: "password", placeholder: "sk-or-… (stored in .env, shared)", style: {
        width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text,
        border: `1px solid ${C.border}`, borderRadius: "6px", padding: "5px 7px", fontSize: "11px", fontFamily: "inherit",
      }});
      keyIn.addEventListener("blur", () => {
        const v = keyIn.value.trim();
        if (!v || v.includes("*")) return;
        fetch("/tj_studio_one/llm/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ openrouter_key: v }) })
          .then(() => { keyIn.value = ""; keyIn.placeholder = "✓ key saved to .env"; });
      });
      fetch("/tj_studio_one/llm/models").then(r => r.json()).then(d => { if (d.openrouter_key_hint) keyIn.placeholder = d.openrouter_key_hint + " — click to replace"; }).catch(() => {});
      wrap2.appendChild(col([label("OpenRouter API key (shared)"), keyIn]));
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

    // LTX 2.5 Upscale runs its own model at its own resolution, so it gets its own
    // switch + values here rather than inheriting H3's — the two are rarely a good fit
    // for each other. The graph-side bug where this never actually reached the preview
    // box (a colon in the KJ node's id truncated in ComfyUI's hidden.unique_id) is fixed
    // in the graph builder; this panel is what turns it on and tunes it.
    wrap.appendChild(panel([
      label("LTX 2.5 Upscale — Live Preview"),
      checkbox("Show live frames while sampling", state.ltxPreviewEnabled ?? true,
        v => { state.ltxPreviewEnabled = v; ctx.persist(); }),
      row([
        col([label("Preview frames"), numField(state.ltxPreviewFrames ?? 8,
          v => { state.ltxPreviewFrames = Math.max(1, Math.round(v)); ctx.persist(); }, { step: "1" })]),
        col([label("Preview fps"), numField(state.ltxPreviewFps ?? 12,
          v => { state.ltxPreviewFps = Math.max(1, Math.round(v)); ctx.persist(); }, { step: "1" })]),
      ]),
      row([
        col([label("Max resolution"), numField(state.ltxPreviewMaxRes ?? 512,
          v => { state.ltxPreviewMaxRes = Math.round(v); ctx.persist(); }, { step: "64" })]),
        col([label("JPEG quality"), numField(state.ltxPreviewQuality ?? 85,
          v => { state.ltxPreviewQuality = Math.round(v); ctx.persist(); }, { step: "1" })]),
      ]),
      (() => {
        // Preview-only fast decode VAE — moved here from the Models tab: it's a preview
        // knob, not a render model, so it belongs with the rest of this panel.
        const vx = ["none", ...(modelData.vae_approx || []).filter(x => x !== "none")];
        const sel = searchableSelect(vx, state.ltxTinyVae || "none",
          v => { state.ltxTinyVae = v === "none" ? "" : v; ctx.persist(); });
        return col([label("Preview VAE (tiny/TAE, taeltx2* — optional, models/vae_approx/)"), sel.el]);
      })(),
      el("div", {
        text: "Separate from the H3 preview above — LTX Upscale runs its own model at its own resolution.",
        style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" },
      }),
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

    const avgIn = numField(state.avgMinutesPerClip ?? 13, v => { state.avgMinutesPerClip = v; ctx.persist(); ctx.refreshPlan?.(); }, { step: "0.5" });
    const avgNote = el("div", { text: "Checking Gallery for past clips at the current settings…",
      style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } });
    // Past clips rendered at the exact same resolution/frames/acceleration/LoRA-usage as
    // right now are a better ETA than the hand-typed fallback, so this overwrites it when
    // there's a real sample — the field above stays editable either way.
    listVideos(state.saveSubfolder || SUBFOLDER, { limit: 300 }).then(d => {
      const wantLora = (state.loras || []).some(l => l.enabled !== false && l.name && l.name !== "none");
      // Timing only transfers between runs that accelerated the same way. A clip saved
      // after the pipeline split records each axis; one saved before it has only the old
      // single `accel` string, so match that against whichever axis it used to stand for
      // rather than against the retired accelMode field, which nothing updates any more.
      const sameAccel = (m) => {
        if (m.attnBackend || m.turboMode || m.blockCache) {
          return (m.turboMode   || "none") === (state.turboMode   || "none")
              && (m.attnBackend || "")     === (state.attnBackend || "")
              && (m.attnForward || "")     === (state.attnForward || "")
              && (m.blockCache  || "none") === (state.blockCache  || "none")
              && !!m.useSpectrum           === !!state.useSpectrum
              && !!m.useFusedModulation    === !!state.useFusedModulation;
        }
        const legacy = state.turboMode === "larryvrh" ? "turbo"
          : state.useSpectrum ? "spectrum"
          : state.attnBackend === "solattn_kijai" ? "solattn" : "none";
        return (m.accel || "") === legacy;
      };
      const matches = (d.videos || d.images || [])
        .map(v => v.meta).filter(Boolean)
        .filter(m => m.elapsedSec != null
          && m.aspect === state.aspect
          && Math.abs((m.megapixels ?? 1) - (state.megapixels ?? 1)) < 0.01
          && m.frames === state.clipFrames
          && sameAccel(m)
          && ((m.loras || []).some(l => l.enabled !== false && l.name && l.name !== "none")) === wantLora);
      if (!matches.length) { avgNote.textContent = "No past clips at the current settings yet — using the manual value above."; return; }
      const avgMin = matches.reduce((a, m) => a + m.elapsedSec, 0) / matches.length / 60;
      state.avgMinutesPerClip = +avgMin.toFixed(2);
      avgIn.value = state.avgMinutesPerClip;
      ctx.persist(); ctx.refreshPlan?.();
      avgNote.textContent = `Measured from ${matches.length} matching clip${matches.length === 1 ? "" : "s"} — value above updated automatically.`;
    }).catch(() => { avgNote.textContent = "Couldn't check past clips — using the manual value above."; });

    wrap.appendChild(panel([
      label("Relay"),
      checkbox("Stitch all clips into one video when the run finishes", state.stitchAtEnd, v => { state.stitchAtEnd = v; ctx.persist(); }),
      checkbox("Trim the stitched video to the requested total length", state.trimLastClip, v => { state.trimLastClip = v; ctx.persist(); }),
      checkbox("Free VRAM between clips (slower reload, safer on 16GB)", state.unloadBetweenClips, v => { state.unloadBetweenClips = v; ctx.persist(); }),
      col([label("Avg minutes per clip (used for the time estimate)"), avgIn]),
      avgNote,
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
    const fn = { Models: modelsTab, "LLM Setting": samplingTab, Preview: previewTab, Output: outputTab }[activeTab];
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
      // LTX 2.5 Upscale mode
      ltx_unet:            state.ltxUnet           || "",
      ltx_latent_upscaler: state.ltxLatentUpscaler || "",
      ltx_clip:            state.ltxClip           || "",
      ltx_vae_video:       state.ltxVaeVideo       || "",
      ltx_vae_audio:       state.ltxVaeAudio       || "",
      ltx_tiny_vae:        state.ltxTinyVae        || "",
      ltx_llm_prompt:      state.ltxLlmPrompt      || "",
      ltx_convert_prompt:  state.ltxConvertPrompt  || "",
      ltx_vision_backend:  state.ltxVisionBackend  || "native",
      ltx_vision_clip:     state.ltxVisionClip     || "",
      ltx_vision_or_model: state.ltxVisionOrModel  || "",
      ltx_preview_enabled: state.ltxPreviewEnabled  ?? true,
      ltx_preview_frames:  state.ltxPreviewFrames   ?? 8,
      ltx_preview_fps:     state.ltxPreviewFps      ?? 12,
      ltx_preview_max_res: state.ltxPreviewMaxRes   ?? 512,
      ltx_preview_quality: state.ltxPreviewQuality  ?? 85,
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
      fbc_mode:             state.fbcMode            || "H3 Fast — 0.10 / max 2",
      fbc_threshold:        state.fbcThreshold       ?? 0.10,
      fbc_start_percent:    state.fbcStartPercent    ?? 0.10,
      fbc_end_percent:      state.fbcEndPercent      ?? 0.95,
      fbc_max_hits:         state.fbcMaxHits         ?? 2,
      fbc_temporal_guard:   state.fbcTemporalGuard   ?? false,
      turbo_lora_reference: state.turboLoraReference || "",
      sla_turbo_lora:       state.slaTurboLora       || "",
      sla_turbo_strength:   state.slaTurboStrength   ?? 1.0,
      sla_turbo_steps:      state.slaTurboSteps      ?? 6,
      pdd_file:             state.pddFile            || "",
      pdd_file_reference:   state.pddFileReference   || "",
      pdd_nfe:              String(state.pddNfe ?? "8"),
      pdd_lora_strength:    state.pddLoraStrength    ?? 1.0,
      turbo_mode:           state.turboMode          || "none",
      attn_backend:         state.attnBackend        || "sage",
      attn_forward:         state.attnForward        || "memeff_sage",
      block_cache:          state.blockCache         || "none",
      use_spectrum:         state.useSpectrum        ?? false,
      use_fused_modulation: state.useFusedModulation ?? false,
      sol_sag_tau_start:    state.solSagTauStart     ?? 1.3,
      sol_sag_tau_end:      state.solSagTauEnd       ?? 0.8,
      sol_sag_curve:        state.solSagCurve        || "linear",
      sol_sag_min_tokens:   state.solSagMinTokens    ?? 4096,
      sol_sag_dense_percent: state.solSagDensePercent ?? 0.0,
      sol_sag_thresh_type:  state.solSagThreshType   || "diag",
      sol_sag_int8_qk:      state.solSagInt8Qk       ?? false,
      sol_sag_int8_pv:      state.solSagInt8Pv       ?? false,
      sol_sag_sink_cond:    state.solSagSinkCond     || "exact_kv",
      sol_sag_dense_blocks: state.solSagDenseBlocks  || "",
      vision_source:         "native",   // the Ollama backend was removed
      native_vision_clip:    state.nativeVisionClip  || "",
      h3_brief_backend:      state.h3BriefBackend    || state.h3LlmBackend || "native",
      h3_vision_backend:     state.h3VisionBackend   || state.h3LlmBackend || "native",
      h3_or_model_brief:     state.h3OrModelBrief    || state.h3OrModel || "",
      h3_or_model_vision:    state.h3OrModelVision   || state.h3OrModel || "",
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
    take("ltxUnet",           cfg.ltx_unet);
    take("ltxLatentUpscaler", cfg.ltx_latent_upscaler);
    take("ltxClip",           cfg.ltx_clip);
    take("ltxVaeVideo",       cfg.ltx_vae_video);
    take("ltxVaeAudio",       cfg.ltx_vae_audio);
    take("ltxTinyVae",        cfg.ltx_tiny_vae);
    if (cfg.ltx_llm_prompt && !String(state.ltxLlmPrompt || "").trim()) state.ltxLlmPrompt = cfg.ltx_llm_prompt;
    if (cfg.ltx_convert_prompt && !String(state.ltxConvertPrompt || "").trim()) state.ltxConvertPrompt = cfg.ltx_convert_prompt;
    if (cfg.ltx_vision_backend)  state.ltxVisionBackend = cfg.ltx_vision_backend;
    take("ltxVisionClip",    cfg.ltx_vision_clip);
    if (cfg.ltx_vision_or_model && !String(state.ltxVisionOrModel || "").trim()) state.ltxVisionOrModel = cfg.ltx_vision_or_model;
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
    if (cfg.ltx_preview_enabled != null) state.ltxPreviewEnabled = cfg.ltx_preview_enabled;
    if (cfg.ltx_preview_frames  != null) state.ltxPreviewFrames  = cfg.ltx_preview_frames;
    if (cfg.ltx_preview_fps     != null) state.ltxPreviewFps     = cfg.ltx_preview_fps;
    if (cfg.ltx_preview_max_res != null) state.ltxPreviewMaxRes  = cfg.ltx_preview_max_res;
    if (cfg.ltx_preview_quality != null) state.ltxPreviewQuality = cfg.ltx_preview_quality;
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
    if (cfg.fbc_mode)                     state.fbcMode           = cfg.fbc_mode;
    if (cfg.fbc_threshold != null)        state.fbcThreshold      = cfg.fbc_threshold;
    if (cfg.fbc_start_percent != null)    state.fbcStartPercent   = cfg.fbc_start_percent;
    if (cfg.fbc_end_percent != null)      state.fbcEndPercent     = cfg.fbc_end_percent;
    if (cfg.fbc_max_hits != null)         state.fbcMaxHits        = cfg.fbc_max_hits;
    if (cfg.fbc_temporal_guard != null)   state.fbcTemporalGuard  = cfg.fbc_temporal_guard;
    take("turboLoraReference", cfg.turbo_lora_reference);
    take("slaTurboLora",       cfg.sla_turbo_lora);
    if (cfg.sla_turbo_strength != null)   state.slaTurboStrength  = cfg.sla_turbo_strength;
    if (cfg.sla_turbo_steps != null)      state.slaTurboSteps     = cfg.sla_turbo_steps;
    if (Array.isArray(cfg.user_presets)) state.userPresets = cfg.user_presets;
    take("pddFile",            cfg.pdd_file);
    take("pddFileReference",   cfg.pdd_file_reference);
    if (cfg.pdd_nfe != null)              state.pddNfe            = String(cfg.pdd_nfe);
    if (cfg.pdd_lora_strength != null)    state.pddLoraStrength   = cfg.pdd_lora_strength;
    if (cfg.turbo_mode)                   state.turboMode         = cfg.turbo_mode;
    if (cfg.attn_backend)                 state.attnBackend       = cfg.attn_backend;
    if (cfg.attn_forward)                 state.attnForward       = cfg.attn_forward;
    if (cfg.block_cache)                  state.blockCache        = cfg.block_cache;
    if (cfg.use_spectrum != null)         state.useSpectrum       = cfg.use_spectrum;
    if (cfg.use_fused_modulation != null) state.useFusedModulation = cfg.use_fused_modulation;
    if (cfg.sol_sag_tau_start != null)    state.solSagTauStart    = cfg.sol_sag_tau_start;
    if (cfg.sol_sag_tau_end != null)      state.solSagTauEnd      = cfg.sol_sag_tau_end;
    if (cfg.sol_sag_curve)                state.solSagCurve       = cfg.sol_sag_curve;
    if (cfg.sol_sag_min_tokens != null)   state.solSagMinTokens   = cfg.sol_sag_min_tokens;
    if (cfg.sol_sag_dense_percent != null) state.solSagDensePercent = cfg.sol_sag_dense_percent;
    if (cfg.sol_sag_thresh_type)          state.solSagThreshType  = cfg.sol_sag_thresh_type;
    if (cfg.sol_sag_int8_qk != null)      state.solSagInt8Qk      = cfg.sol_sag_int8_qk;
    if (cfg.sol_sag_int8_pv != null)      state.solSagInt8Pv      = cfg.sol_sag_int8_pv;
    if (cfg.sol_sag_sink_cond)            state.solSagSinkCond    = cfg.sol_sag_sink_cond;
    if (cfg.sol_sag_dense_blocks)         state.solSagDenseBlocks = cfg.sol_sag_dense_blocks;
    if (cfg.native_vision_clip)       state.nativeVisionClip = cfg.native_vision_clip;
    if (cfg.h3_llm_backend)           state.h3LlmBackend     = cfg.h3_llm_backend;   // legacy
    if (cfg.h3_or_model)              state.h3OrModel        = cfg.h3_or_model;      // legacy
    if (cfg.h3_brief_backend)         state.h3BriefBackend   = cfg.h3_brief_backend;
    if (cfg.h3_vision_backend)        state.h3VisionBackend  = cfg.h3_vision_backend;
    if (cfg.h3_or_model_brief)        state.h3OrModelBrief   = cfg.h3_or_model_brief;
    if (cfg.h3_or_model_vision)       state.h3OrModelVision  = cfg.h3_or_model_vision;
    if (cfg.filename_prefix)          state.filenamePrefix   = cfg.filename_prefix;
    // save_subfolder was written on every Save All but never read back — the Output tab
    // (and the gallery, and every "From gallery" picker) always came back to the
    // hardcoded SUBFOLDER default until you retyped it, every single session.
    if (cfg.save_subfolder && !state.saveSubfolder) state.saveSubfolder = cfg.save_subfolder;
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

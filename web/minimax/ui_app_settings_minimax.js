// ui_app_settings_minimax.js — Settings overlay for MiniMax H3 ONE STUDIO (TJ)
// Tabs: Models · Sampling · Preview · Output. Everything here is set once and reused
// by every clip; per-run choices live in the node's left panel instead.
import { C, BRAND, el, clear, SUBFOLDER } from "./core_minimax.js";
import { panel, label, button, select, numberField, row, col } from "../klein/ui_common.js";
import { getModels, getConfig, saveConfig, getNodeAvailability, listVideos, getTempSize, clearTempFiles, connectCustom } from "./api_minimax.js";
import { mountLLMSettingsSection } from "../shared/llm_panel.js";

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
  const TABS = ["H3 Model", "UpScale Model", "FaceRefine Model", "LLM Setting", "Image LLM", "Preview", "Output"];
  let activeTab = "H3 Model";
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

  // Third-party pack status panel — shared by all three model tabs so whichever one is
  // open, missing-node warnings are still visible right there.
  function packStatusPanel() {
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
    return panel(kids);
  }

  // ── H3 Model — the base render's own unet/clip/vae only ──────────────────────
  function h3ModelTab() {
    const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } });
    const diff = ["none", ...(modelData.diffusion_models || []).filter(x => x !== "none")];
    const teAll = ["none", ...(modelData.text_encoders_all || modelData.text_encoders || []).filter(x => x !== "none")];
    const vae  = ["none", ...(modelData.vaes             || []).filter(x => x !== "none")];

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

    const cl = searchableSelect(teAll,  state.clipName || "none", v => { state.clipName = v; ctx.persist(); });
    const vv = searchableSelect(vae, state.vaeVideo || "none", v => { state.vaeVideo = v; ctx.persist(); });
    const va = searchableSelect(vae, state.vaeAudio || "none", v => { state.vaeAudio = v; ctx.persist(); });
    wrap.appendChild(panel([
      label("Text Encoder & VAEs"),
      col([label("Text Encoder (CLIPLoader type=minimax — .gguf listed too, unverified for H3's own truncated Qwen3-VL)"), cl.el]),
      row([col([label("Video VAE"), vv.el]), col([label("Audio VAE"), va.el])]),
      el("div", { html: "→ <code>models/text_encoders/</code> · <code>models/vae/</code>", style: { fontSize: "10px", color: C.muted } }),
    ]));

    const refreshBtn = button("↻ Refresh Models", async () => {
      refreshBtn.textContent = "Loading…";
      try { await refreshModels(); } finally { refreshBtn.textContent = "↻ Refresh Models"; }
    });
    wrap.appendChild(refreshBtn);

    wrap.appendChild(el("div", { text: "Turbo LoRAs, attention, block cache, Spectrum and the model patches now live in "
      + "the node's left panel — they are per-run choices, so they sit next to the run.",
      style: { fontSize: "10px", color: C.muted, lineHeight: "1.55" } }));
    wrap.appendChild(packStatusPanel());
    return wrap;
  }

  // ── UpScale Model — plain Upscale model + LTX 2.5 Upscale's own model set ────
  function upscaleModelTab() {
    const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } });
    const diff = ["none", ...(modelData.diffusion_models || []).filter(x => x !== "none")];
    const vae  = ["none", ...(modelData.vaes             || []).filter(x => x !== "none")];
    const ups  = ["none", ...(modelData.upscale_models   || []).filter(x => x !== "none")];

    const um = searchableSelect(ups, state.upscaleModel || "none", v => { state.upscaleModel = v; ctx.persist(); });
    wrap.appendChild(panel([
      label("Upscale"),
      col([label("Upscale Model (used when Upscale = Upscale Model)"), um.el]),
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
    const upscaleRefreshBtn = button("↻ Refresh Models", async () => {
      upscaleRefreshBtn.textContent = "Loading…";
      try { await refreshModels(); } finally { upscaleRefreshBtn.textContent = "↻ Refresh Models"; }
    });
    wrap.appendChild(upscaleRefreshBtn);
    wrap.appendChild(packStatusPanel());
    return wrap;
  }

  // ── FaceRefine Model — face detectors + optional separate unet/clip (§15) ───
  function faceRefineModelTab() {
    const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } });
    const diff = ["none", ...(modelData.diffusion_models || []).filter(x => x !== "none")];
    const teAll = ["none", ...(modelData.text_encoders_all || modelData.text_encoders || []).filter(x => x !== "none")];
    const fdList = ["none", ...(modelData.face_detectors || []).filter(x => x !== "none")];
    const ffList = ["none", ...(modelData.face_fallback_detectors || []).filter(x => x !== "none")];
    const samList = ["none", ...(modelData.sam_models || []).filter(x => x !== "none")];
    const cvList  = ["none", ...(modelData.clip_vision || []).filter(x => x !== "none")];

    const useCustomChk = checkbox("Use a separate model for Face Refine (unchecked = share H3's Reference unet/clip above)",
      state.frUseCustomModel, v => { state.frUseCustomModel = v; ctx.persist(); ctx.refreshModes?.(); renderBody(); });

    const kids = [
      label("H3 Face Refine — post-process pass on a finished clip (re-renders a small/distant face)"),
      useCustomChk,
    ];
    if (state.frUseCustomModel) {
      const fuSel = searchableSelect(diff, state.frUnet || "none",
        v => { state.frUnet = v === "none" ? "" : v; ctx.persist(); ctx.refreshModes?.(); });
      const fcSel = searchableSelect(teAll, state.frClip || "none",
        v => { state.frClip = v === "none" ? "" : v; ctx.persist(); ctx.refreshModes?.(); });
      kids.push(
        row([col([label("Face Refine UNET (.gguf or .safetensors)"), fuSel.el]),
             col([label("Face Refine text encoder (.gguf or .safetensors)"), fcSel.el])]),
        el("div", { text: "Runs on its OWN model instead of H3's Reference unet/clip — e.g. a lighter/faster "
          + "GGUF quant just for the refine pass. Video/audio VAE are always shared with H3 (above).",
          style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } }),
      );
    } else {
      kids.push(el("div", { text: "Runs H3's own unet/text-encoder/VAE from the H3 Model tab (Reference mode's UNET).",
        style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } }));
    }

    const fdSel = searchableSelect(fdList, state.faceDetector || "none",
      v => { state.faceDetector = v === "none" ? "" : v; ctx.persist(); ctx.refreshModes?.(); });
    const ffSel = searchableSelect(ffList, state.faceFallbackDetector || "none",
      v => { state.faceFallbackDetector = v; ctx.persist(); });
    const samSel = searchableSelect(samList, state.faceSamModel || "none",
      v => { state.faceSamModel = v; ctx.persist(); });
    const cvSel = searchableSelect(cvList, state.faceIdentityClipVision || "none",
      v => { state.faceIdentityClipVision = v; ctx.persist(); });
    kids.push(
      row([col([label("Face detector (required)"), fdSel.el]),
           col([label("Fallback detector (optional — body/person model)"), ffSel.el])]),
      row([col([label("SAM model (optional — face-shaped mask)"), samSel.el]),
           col([label("Identity CLIP Vision (optional — identity_model=clip_vision)"), cvSel.el])]),
      el("div", { html: "Files: face detector → <code>models/ultralytics/bbox/</code> (e.g. face_yolov8m.pt from "
        + "Bingsu/adetailer) · fallback → <code>models/ultralytics/segm/</code> · SAM → "
        + "<code>models/sams/</code> · CLIP Vision → <code>models/clip_vision/</code>. Manual Select "
        + "(Pick Faces) and Impact Pack are not required for the basic ranking-rule modes.",
        style: { fontSize: "10px", color: C.muted, lineHeight: "1.6" } }),
    );
    wrap.appendChild(panel(kids));
    const frRefreshBtn = button("↻ Refresh Models", async () => {
      frRefreshBtn.textContent = "Loading…";
      try { await refreshModels(); } finally { frRefreshBtn.textContent = "↻ Refresh Models"; }
    });
    wrap.appendChild(frRefreshBtn);
    wrap.appendChild(packStatusPanel());
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
  let quickChanged = null;   // set while the Prompt Edit LLM popup is open
  let _orModels = null;
  async function orModels() {
    if (_orModels) return _orModels;
    try { _orModels = (await (await fetch("/music_one/openrouter_models")).json()).models || []; }
    catch { _orModels = []; }
    return _orModels;
  }

  // Same local llama.cpp backend the image nodes' shared Enhance/Image→Prompt panel
  // already uses (web/shared/llm_panel.js) — /tj_studio_one/llm/* is served by this
  // pack's own nodes.py (_try_import_tj_llm dynamically loads TJ_NODE's prompt_enhancer.py
  // / image_to_prompt.py), not a separate route namespace, so H3 reuses it as-is.
  let _llamaModels = null;
  async function llamaModels() {
    if (_llamaModels) return _llamaModels;
    try {
      const d = await (await fetch("/tj_studio_one/llm/models")).json();
      _llamaModels = { gguf: d.gguf || [], mmproj: d.mmproj || [], available: !!d.local_available };
    } catch { _llamaModels = { gguf: [], mmproj: [], available: false }; }
    return _llamaModels;
  }

  function _selEl(opts) {
    return el("select", { style: {
      width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text,
      border: `1px solid ${C.border}`, borderRadius: "6px", padding: "6px", fontSize: "12px", fontFamily: "inherit",
    }}, opts);
  }

  // "Connect Custom" fields for one role: any OpenAI-style Chat Completions server.
  // URL / model id / context are kept in state (and the config); the API key is not — it is
  // sent once on Connect & test, held in the server's memory, and the field is cleared.
  function customEndpointControls(role, changed) {
    const K = role === "vision"
      ? { base: "h3CustomVisionBase", model: "h3CustomVisionModel", ctx: "h3CustomVisionCtx" }
      : { base: "h3CustomBriefBase",  model: "h3CustomBriefModel",  ctx: "h3CustomBriefCtx" };
    const field = (type, value, placeholder, onChange) => {
      const i = el("input", { type, placeholder, autocomplete: "off", style: {
        width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text,
        border: `1px solid ${C.border}`, borderRadius: "6px", padding: "6px", fontSize: "12px", fontFamily: "inherit",
      }});
      i.value = value;
      i.addEventListener("change", () => onChange(i.value));
      return i;
    };
    const note = (text) => el("div", { text, style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } });

    const baseIn = field("text", state[K.base] || "", "http://localhost:3000/v1",
      v => { state[K.base] = v.trim(); changed(); });
    const keyIn = field("password", "", "Paste key for this session", () => {});
    const modelIn = field("text", state[K.model] || "", "gemini-3.7-flash",
      v => { state[K.model] = v.trim(); changed(); });
    const models = el("datalist", { id: `h3-custom-models-${role}` });
    modelIn.setAttribute("list", models.id);
    const ctxIn = field("number", state[K.ctx] || "", "32768",
      v => { state[K.ctx] = Math.max(0, Math.round(Number(v)) || 0); changed(); });
    const status = el("div", { style: { fontSize: "11px", lineHeight: "1.5", color: C.muted, whiteSpace: "pre-wrap", overflowWrap: "anywhere" } });

    const connect = button("Connect & test", async () => {
      state[K.base] = baseIn.value.trim();
      state[K.model] = modelIn.value.trim();
      state[K.ctx] = Math.max(0, Math.round(Number(ctxIn.value)) || 0);
      changed();
      status.style.color = C.muted; status.textContent = "Connecting…";
      connect.disabled = true;
      try {
        const d = await connectCustom(role, { baseUrl: state[K.base], apiKey: keyIn.value, model: state[K.model] });
        if (!d.ok) { status.style.color = C.err; status.textContent = `✗ ${d.error || "connection failed"}`; return; }
        if (keyIn.value) { keyIn.value = ""; keyIn.placeholder = "✓ key held in server memory (this session)"; }
        clear(models);
        (d.models || []).forEach(m => models.appendChild(el("option", { value: m })));
        let msg = `✓ Connected in ${d.ms} ms` + (d.models?.length ? ` · ${d.models.length} models listed` : "") + (d.note ? ` · ${d.note}` : "");
        if (!state[K.model] && d.models?.length) {
          state[K.model] = d.models[0]; modelIn.value = d.models[0]; changed();
          msg += `\nModel ID was empty — set to the first listed: ${d.models[0]}`;
        } else if (state[K.model] && d.modelFound === false) {
          status.style.color = C.warn; status.textContent = `${msg}\n⚠ "${state[K.model]}" is not in the endpoint's model list.`;
          return;
        }
        status.style.color = C.ok; status.textContent = msg;
      } catch (e) {
        status.style.color = C.err; status.textContent = `✗ ${e?.message || e}`;
      } finally { connect.disabled = false; }
    }, "primary");

    return col([
      note("One shared Chat Completions backend."),
      col([label("API base URL"), baseIn,
        note("Public endpoints require HTTPS; loopback and private LAN addresses may use HTTP.")]),
      col([label("API key (optional)"), keyIn,
        note("The key is sent once to the local H3 backend, kept only in memory, and never saved in localStorage.")]),
      col([label("Model ID (optional before connect)"), modelIn, models]),
      col([label("Known context (optional)"), ctxIn]),
      connect, status,
    ]);
  }

  // h3Only renders just the Brief and Vision rows (what the Prompt Edit popup needs).
  function renderModelPickers(target = renderModelPickersInto, h3Only = false) {
    const wrap2 = target;
    if (!wrap2) return;
    clear(wrap2);
    // Every pick persists the state; in the popup it also saves to the config and lets the
    // Prompt Edit panel behind it refresh its Brief / Vision line.
    const changed = () => { ctx.persist(); if (h3Only) quickChanged?.(); };

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
      const isLlama = state[backendKey] === "llamagguf";
      // Connect Custom is for H3's Brief / Vision only — the LTX row has no route for it.
      const isCustom = !isLtx && state[backendKey] === "custom";
      if (isOR) anyOR = true;

      const beSel = _selEl([
        el("option", { value: "native",     text: "Native (ComfyUI CLIP)", ...((!isOR && !isLlama && !isCustom) ? { selected: "selected" } : {}) }),
        el("option", { value: "openrouter", text: "OpenRouter (cloud)",     ...(isOR ? { selected: "selected" } : {}) }),
        el("option", { value: "llamagguf",  text: "Llama GGUF (local llama.cpp)", ...(isLlama ? { selected: "selected" } : {}) }),
        ...(isLtx ? [] : [el("option", { value: "custom", text: "Connect Custom", ...(isCustom ? { selected: "selected" } : {}) })]),
      ]);
      beSel.addEventListener("change", () => {
        state[backendKey] = beSel.value; changed(); renderModelPickers(wrap2, h3Only);
      });

      let control;
      if (isLlama) {
        // clipKey tells vision role from brief role ("nativeVisionClip" vs "nativeBriefClip")
        // the same way the OpenRouter branch below reads orModelKey — reused here so this
        // stays one function instead of splitting vision/brief into separate ones.
        //
        // Every role picks its own GGUF model independently. Vision roles (H3 Vision,
        // LTX Upscale) ALSO get their own mmproj picker beside it — both selected
        // separately, nothing reused/inherited between roles (user: "이렇게 전부 개별로
        // 선택할 수 있게 하라고").
        const isVisionRole = clipKey === "nativeVisionClip";
        const isLtxRole = clipKey === "ltxVisionClip";
        const modelKey = isLtxRole ? "ltxLlamaModel" : isVisionRole ? "h3LlamaVisionModel" : "h3LlamaBriefModel";
        const mmprojKey = isLtxRole ? "ltxLlamaMmproj" : "h3LlamaVisionMmproj";
        const needsMmproj = isVisionRole || isLtxRole;
        const holder = el("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } });
        holder.appendChild(el("div", { text: "loading gguf models…", style: { fontSize: "11px", color: C.muted } }));
        llamaModels().then(d => {
          clear(holder);
          if (!d.available) {
            holder.appendChild(el("div", {
              html: "⚠ Local GGUF LLM not available — TJ_NODE not installed, or its llm files failed to load.",
              style: { fontSize: "10px", color: C.warn, lineHeight: "1.5" } }));
            return;
          }
          // Explicit client-side split rather than trusting the server's own gguf/mmproj
          // arrays not to overlap.
          const isMmprojName = (n) => /mmproj/i.test(String(n || ""));
          const ggufList = (d.gguf || []).filter(n => !isMmprojName(n));
          if (!ggufList.length) ggufList.push("(none found)");
          if (!state[modelKey] && ggufList[0] && ggufList[0] !== "(none found)") { state[modelKey] = ggufList[0]; changed(); }
          const ggufPick = searchableSelect(ggufList, state[modelKey] || ggufList[0],
            v => { state[modelKey] = v; changed(); });
          holder.appendChild(col([label("GGUF model"), ggufPick.el]));

          if (needsMmproj) {
            const mmList = ["none", ...(d.mmproj || []).filter(n => n !== "none" && isMmprojName(n))];
            if (!state[mmprojKey]) { state[mmprojKey] = "none"; changed(); }
            const mmPick = searchableSelect(mmList, state[mmprojKey] || "none",
              v => { state[mmprojKey] = v; changed(); });
            holder.appendChild(col([label("mmproj model"), mmPick.el]));
          }
          // Shared by both roles — one context window size for whichever GGUF loads.
          // Defaults to 8192, not llama.cpp's own 4096: H3's system prompt (guide + few-
          // shot examples) plus a real request measured 5436 tokens on its own in testing,
          // already over 4096 before generation even starts (silent empty result, no
          // error — the request simply had no room left to answer in).
          {
            const nCtxField = numberField(state.h3LlamaNCtx ?? 16384,
              v => { state.h3LlamaNCtx = Math.max(512, Math.round(v)); changed(); }, 512);
            holder.appendChild(col([label("Context length (n_ctx)"), nCtxField]));
            // A truncated brief is exactly as unusable as an empty one — this needs real
            // headroom (a full multi-shot brief measured well over 2000 tokens), not just
            // enough to dodge an error.
            const maxTokField = numberField(state.h3LlamaMaxTokens ?? 4096,
              v => { state.h3LlamaMaxTokens = Math.max(256, Math.round(v)); changed(); }, 256);
            holder.appendChild(col([label("Max output tokens"), maxTokField]));
          }
        });
        control = holder;
      } else if (isCustom) {
        control = customEndpointControls(backendKey === "h3VisionBackend" ? "vision" : "brief", changed);
      } else if (isOR) {
        // full OpenRouter model list, searchable — no vision-capability filter, the
        // user picks (qwen-vl flash, gemini, whatever). Default is a soft pre-select only.
        const cfgKey = orModelKey === "h3OrModelVision" ? "h3_or_model_vision"
          : orModelKey === "ltxVisionOrModel" ? "ltx_vision_or_model"
          : "h3_or_model_brief";
        const saveOr = (v) => {
          state[orModelKey] = v; changed();
          fetch("/minimax_h3_one/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [cfgKey]: v }) }).catch(() => {});
        };
        const holder = el("div");
        holder.appendChild(_selEl([el("option", { value: state[orModelKey] || "", text: state[orModelKey] || "loading models…" })]));
        orModels().then(ms => {
          if (!ms.length) return;
          if (!state[orModelKey]) { state[orModelKey] = (ms.find(m => /gemini-2\.5-flash/.test(m)) || ms[0]); changed(); }
          clear(holder);
          holder.appendChild(searchableSelect(ms, state[orModelKey], saveOr).el);
        });
        control = col([label(orModelKey === "h3OrModelVision" ? "OpenRouter model (vision)" : "OpenRouter model (brief)"), holder]);
      } else if (nativeMissing.length) {
        control = el("div", { text: `⚠ Native needs: ${nativeMissing.join(", ")} (TJ_NODE / update ComfyUI)`,
          style: { fontSize: "10px", color: C.warn, lineHeight: "1.5" } });
      } else {
        const pick = searchableSelect(clipList, state[clipKey] || "none", v => { state[clipKey] = v === "none" ? "" : v; changed(); });
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
    if (!h3Only) {
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
    }

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
      label("Gallery — items per load"),
      numField(state.galleryPageSize ?? 50, v => { state.galleryPageSize = Math.min(300, Math.max(10, Math.round(v))); ctx.persist(); }, { step: "10", min: 10, max: 300 }),
      el("div", { text: "How many clips/images the H3 galleries and the reference-video picker load first, and again with each \"Load more\" click. 10–300; smaller opens faster.",
        style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } }),
      label("Save Folder (inside ComfyUI output/)"), pathIn,
      label("Filename Prefix"), prefixIn,
      el("div", { text: "Every clip is always written to disk as its own video; the stitched file is written alongside them.", style: { fontSize: "10px", color: C.muted } }),
    ]));

    // Image Generator writes stills to its own folder, separate from the video path
    // above, so the dedicated H3 Image Gallery (which only ever lists this folder) and
    // the video gallery never mix each other's files just because they share a path.
    const imgPathIn = el("input", { type: "text", placeholder: SUBFOLDER, style: {
      width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text,
      border: `1px solid ${C.border}`, borderRadius: "6px", padding: "7px",
      fontSize: "12px", fontFamily: "inherit",
    }});
    imgPathIn.value = state.imgSaveSubfolder || "";
    imgPathIn.addEventListener("input", () => { state.imgSaveSubfolder = imgPathIn.value.trim(); ctx.persist(); });

    // Character Sheet saves the raw multi-shot render (the "set" a sheet frame can later
    // be re-extracted from) as a video, alongside the assembled sheet image — its own path
    // since it's neither an ordinary H3 clip nor an Image Generator still.
    const sheetVidPathIn = el("input", { type: "text", placeholder: SUBFOLDER + "/sheets", style: {
      width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text,
      border: `1px solid ${C.border}`, borderRadius: "6px", padding: "7px",
      fontSize: "12px", fontFamily: "inherit",
    }});
    sheetVidPathIn.value = state.sheetVideoSaveSubfolder || "";
    sheetVidPathIn.addEventListener("input", () => { state.sheetVideoSaveSubfolder = sheetVidPathIn.value.trim(); ctx.persist(); });

    wrap.appendChild(panel([
      label("Image Generator Save Folder (inside ComfyUI output/)"), imgPathIn,
      el("div", { text: "Empty = same as the Save Folder above. Read by the 🎨 H3 Image Gallery and by T2I/Reference to Image/Character Sheet's own saves.",
        style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } }),
      label("Character Sheet — paired video Save Folder"), sheetVidPathIn,
      el("div", { text: "Character Sheet saves the raw 8-shot render here (as a video) alongside the assembled sheet image, so any frame can be re-extracted later. Empty = same as the Image Generator folder above.",
        style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } }),
    ]));

    // Preview runs (Postprocess's, and any later mode's) never touch the real gallery —
    // they land in one shared scratch folder under ComfyUI's own temp/ dir instead, so
    // this is the one place to see how much they've grown and clear them out.
    const tempSizeEl = el("div", { text: "Checking temp preview usage…", style: { fontSize: "11px", color: C.muted } });
    const tempClearBtn = button("🗑 Clear Temp Preview Files", async () => {
      tempClearBtn.disabled = true; tempClearBtn.textContent = "Clearing…";
      try {
        const d = await clearTempFiles();
        tempSizeEl.textContent = `Cleared ${d.removed ?? 0} file(s).`;
      } catch (e) {
        tempSizeEl.textContent = "Clear failed — " + (e?.message || e);
      }
      tempClearBtn.disabled = false; tempClearBtn.textContent = "🗑 Clear Temp Preview Files";
    });
    tempClearBtn.style.width = "100%";
    wrap.appendChild(panel([
      label("Temp Preview Files"), tempSizeEl, tempClearBtn,
      el("div", { text: "Postprocess's 👁 Preview (and any other mode's future preview) never saves to the real gallery — it writes a short throwaway clip here instead. This never clears itself; check back and clear it occasionally.",
        style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } }),
    ]));
    getTempSize().then(d => {
      const mb = (d.size_bytes || 0) / (1024 * 1024);
      tempSizeEl.textContent = d.count
        ? `${mb.toFixed(1)} MB across ${d.count} file(s)`
        : "Empty — nothing to clear.";
    }).catch(() => { tempSizeEl.textContent = "Could not check temp preview usage."; });

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

  // Image Generator's "🔍 Prompt Edit" popup (T2I/Reference to Image, shared with Krea2/
  // Z-Image/Klein/Qwen2511/SDXL/Anima) reads its backend/model config from the SAME
  // cross-tool "tj_studio_one_llm_settings" store those 6 tools use — a separate system
  // from "LLM Setting" above, which is H3's own video-brief/vision backend
  // (h3_brief_backend etc.) and has nothing to do with the image prompt popup.
  function imageLlmTab() {
    const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } });
    const llmPanel = panel([]);
    wrap.appendChild(llmPanel);
    mountLLMSettingsSection(llmPanel, ctx);
    return wrap;
  }

  function renderBody() {
    clear(bodyWrap);
    const fn = {
      "H3 Model": h3ModelTab, "UpScale Model": upscaleModelTab, "FaceRefine Model": faceRefineModelTab,
      "LLM Setting": samplingTab, "Image LLM": imageLlmTab, Preview: previewTab, Output: outputTab,
    }[activeTab];
    bodyWrap.appendChild(fn());
  }
  // The Image Generator popup's own "⚙" shortcut jumps straight to this tab.
  ctx.openImageLlmSettings = () => { activeTab = "Image LLM"; renderTabs(); renderBody(); ov.style.display = "flex"; refreshModels(); };

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
      // H3 Face Refine mode
      face_detector:              state.faceDetector             || "",
      face_fallback_detector:     state.faceFallbackDetector     || "none",
      face_sam_model:             state.faceSamModel             || "none",
      face_identity_clip_vision:  state.faceIdentityClipVision   || "none",
      face_use_custom_model:      state.frUseCustomModel         ?? false,
      face_unet:                  state.frUnet                   || "",
      face_clip:                  state.frClip                   || "",
      turbo_lora:      state.turboLora     || "",
      turbo_lora_strength: state.turboLoraStrength ?? 1.0,
      upscale_model:   state.upscaleModel  || "",
      save_subfolder:  state.saveSubfolder || "",
      img_save_subfolder: state.imgSaveSubfolder || "",
      sheet_video_save_subfolder: state.sheetVideoSaveSubfolder || "",
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
      native_brief_clip:     state.nativeBriefClip   || "",
      h3_custom_brief_base:   state.h3CustomBriefBase   || "",
      h3_custom_brief_model:  state.h3CustomBriefModel  || "",
      h3_custom_brief_ctx:    state.h3CustomBriefCtx    ?? 0,
      h3_custom_vision_base:  state.h3CustomVisionBase  || "",
      h3_custom_vision_model: state.h3CustomVisionModel || "",
      h3_custom_vision_ctx:   state.h3CustomVisionCtx   ?? 0,
      h3_brief_backend:      state.h3BriefBackend    || state.h3LlmBackend || "native",
      h3_vision_backend:     state.h3VisionBackend   || state.h3LlmBackend || "native",
      h3_or_model_brief:     state.h3OrModelBrief    || state.h3OrModel || "",
      h3_or_model_vision:    state.h3OrModelVision   || state.h3OrModel || "",
      h3_llama_vision_model:  state.h3LlamaVisionModel  || "",
      h3_llama_vision_mmproj: state.h3LlamaVisionMmproj || "",
      h3_llama_brief_model:   state.h3LlamaBriefModel   || "",
      h3_llama_n_ctx:         state.h3LlamaNCtx         ?? 16384,
      h3_llama_max_tokens:    state.h3LlamaMaxTokens    ?? 4096,
      ltx_llama_model:        state.ltxLlamaModel       || "",
      ltx_llama_mmproj:       state.ltxLlamaMmproj      || "",
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
    // Image Generator's Turbo switch (T2I/Ref2I) — same "remember the last value used
    // anywhere" treatment as turboLora above, requested separately from per-image
    // Reuse Setting (2026-09-21).
    if (state.imgTurboOn == null && cfg.img_turbo_on != null) state.imgTurboOn = cfg.img_turbo_on;
    take("imgTurboLoraT2i",      cfg.img_turbo_lora_t2i);
    take("imgTurboLoraRef2i",    cfg.img_turbo_lora_ref2i);
    if (state.imgTurboLoraStrength == null && cfg.img_turbo_lora_strength != null) state.imgTurboLoraStrength = cfg.img_turbo_lora_strength;
    // Character Sheet's Post-finish panel — same treatment.
    take("charSheetDeblur", cfg.charsheet_deblur);
    if (state.charSheetRtxVsr == null && cfg.charsheet_rtx_vsr != null) state.charSheetRtxVsr = cfg.charsheet_rtx_vsr;
    if (state.charSheetRtxSupersample == null && cfg.charsheet_rtx_supersample != null) state.charSheetRtxSupersample = cfg.charsheet_rtx_supersample;
    if (state.charSheetUseLatentUpscale == null && cfg.charsheet_use_latent_upscale != null) state.charSheetUseLatentUpscale = cfg.charsheet_use_latent_upscale;
    if (state.charSheetFirstPassRatio == null && cfg.charsheet_first_pass_ratio != null) state.charSheetFirstPassRatio = cfg.charsheet_first_pass_ratio;
    if (state.charSheetSaveEachFrames == null && cfg.charsheet_save_each_frames != null) state.charSheetSaveEachFrames = cfg.charsheet_save_each_frames;
    if (state.charSheetMaxSize == null && cfg.charsheet_max_size != null) state.charSheetMaxSize = cfg.charsheet_max_size;
    if (state.charSheetSecondPassSteps == null && cfg.charsheet_second_pass_steps != null) state.charSheetSecondPassSteps = cfg.charsheet_second_pass_steps;
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
    take("faceDetector",            cfg.face_detector);
    take("faceFallbackDetector",    cfg.face_fallback_detector);
    take("faceSamModel",            cfg.face_sam_model);
    take("faceIdentityClipVision",  cfg.face_identity_clip_vision);
    if (cfg.face_use_custom_model != null) state.frUseCustomModel = cfg.face_use_custom_model;
    take("frUnet", cfg.face_unet);
    take("frClip", cfg.face_clip);
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
    if (cfg.native_brief_clip)        state.nativeBriefClip  = cfg.native_brief_clip;
    if (cfg.h3_custom_brief_base)     state.h3CustomBriefBase   = cfg.h3_custom_brief_base;
    if (cfg.h3_custom_brief_model)    state.h3CustomBriefModel  = cfg.h3_custom_brief_model;
    if (cfg.h3_custom_brief_ctx != null)  state.h3CustomBriefCtx = cfg.h3_custom_brief_ctx;
    if (cfg.h3_custom_vision_base)    state.h3CustomVisionBase  = cfg.h3_custom_vision_base;
    if (cfg.h3_custom_vision_model)   state.h3CustomVisionModel = cfg.h3_custom_vision_model;
    if (cfg.h3_custom_vision_ctx != null) state.h3CustomVisionCtx = cfg.h3_custom_vision_ctx;
    if (cfg.h3_llm_backend)           state.h3LlmBackend     = cfg.h3_llm_backend;   // legacy
    if (cfg.h3_or_model)              state.h3OrModel        = cfg.h3_or_model;      // legacy
    if (cfg.h3_brief_backend)         state.h3BriefBackend   = cfg.h3_brief_backend;
    if (cfg.h3_vision_backend)        state.h3VisionBackend  = cfg.h3_vision_backend;
    if (cfg.h3_or_model_brief)        state.h3OrModelBrief   = cfg.h3_or_model_brief;
    if (cfg.h3_or_model_vision)       state.h3OrModelVision  = cfg.h3_or_model_vision;
    if (cfg.h3_llama_vision_model)    state.h3LlamaVisionModel  = cfg.h3_llama_vision_model;
    if (cfg.h3_llama_vision_mmproj)   state.h3LlamaVisionMmproj = cfg.h3_llama_vision_mmproj;
    if (cfg.h3_llama_brief_model)     state.h3LlamaBriefModel   = cfg.h3_llama_brief_model;
    if (cfg.h3_llama_n_ctx != null)   state.h3LlamaNCtx         = cfg.h3_llama_n_ctx;
    if (cfg.h3_llama_max_tokens != null) state.h3LlamaMaxTokens = cfg.h3_llama_max_tokens;
    if (cfg.ltx_llama_model)          state.ltxLlamaModel       = cfg.ltx_llama_model;
    if (cfg.ltx_llama_mmproj)         state.ltxLlamaMmproj      = cfg.ltx_llama_mmproj;
    if (cfg.filename_prefix)          state.filenamePrefix   = cfg.filename_prefix;
    // save_subfolder was written on every Save All but never read back — the Output tab
    // (and the gallery, and every "From gallery" picker) always came back to the
    // hardcoded SUBFOLDER default until you retyped it, every single session.
    if (cfg.save_subfolder && !state.saveSubfolder) state.saveSubfolder = cfg.save_subfolder;
    if (cfg.img_save_subfolder && !state.imgSaveSubfolder) state.imgSaveSubfolder = cfg.img_save_subfolder;
    if (cfg.sheet_video_save_subfolder && !state.sheetVideoSaveSubfolder) state.sheetVideoSaveSubfolder = cfg.sheet_video_save_subfolder;
    if (cfg.charsheet_system_prompt && !state.charSheetSystemPrompt) state.charSheetSystemPrompt = cfg.charsheet_system_prompt;
    if (cfg.stitch_at_end != null)          state.stitchAtEnd        = cfg.stitch_at_end;
    if (cfg.trim_last_clip != null)         state.trimLastClip       = cfg.trim_last_clip;
    if (cfg.unload_between_clips != null)   state.unloadBetweenClips = cfg.unload_between_clips;
    if (cfg.turbo_lora_strength != null && state.turboLoraStrength == null) state.turboLoraStrength = cfg.turbo_lora_strength;
    if (cfg.prompt_suffix && !state.promptSuffix) state.promptSuffix = cfg.prompt_suffix;
    if (cfg.avg_minutes_per_clip != null) state.avgMinutesPerClip = cfg.avg_minutes_per_clip;
    ctx.persist(); ctx.refreshPlan?.(); ctx.refreshModes?.();
  }).catch(() => {}).finally(refreshModels);

  renderTabs(); renderBody();

  // The Brief / Vision part of Save All, written on its own — the Prompt Edit popup saves
  // each pick right away instead of waiting for Save All.
  function saveLlmConfig() {
    saveConfig({
      native_vision_clip:     state.nativeVisionClip  || "",
      native_brief_clip:      state.nativeBriefClip   || "",
      h3_custom_brief_base:   state.h3CustomBriefBase   || "",
      h3_custom_brief_model:  state.h3CustomBriefModel  || "",
      h3_custom_brief_ctx:    state.h3CustomBriefCtx    ?? 0,
      h3_custom_vision_base:  state.h3CustomVisionBase  || "",
      h3_custom_vision_model: state.h3CustomVisionModel || "",
      h3_custom_vision_ctx:   state.h3CustomVisionCtx   ?? 0,
      h3_brief_backend:       state.h3BriefBackend    || state.h3LlmBackend || "native",
      h3_vision_backend:      state.h3VisionBackend   || state.h3LlmBackend || "native",
      h3_or_model_brief:      state.h3OrModelBrief    || state.h3OrModel || "",
      h3_or_model_vision:     state.h3OrModelVision   || state.h3OrModel || "",
      h3_llama_vision_model:  state.h3LlamaVisionModel  || "",
      h3_llama_vision_mmproj: state.h3LlamaVisionMmproj || "",
      h3_llama_brief_model:   state.h3LlamaBriefModel   || "",
      h3_llama_n_ctx:         state.h3LlamaNCtx         ?? 16384,
      h3_llama_max_tokens:    state.h3LlamaMaxTokens    ?? 4096,
    }).catch(() => {});
  }

  // Popup with the same Brief / Vision pickers as Settings -> LLM Setting. `onChange` runs
  // after every pick and on close, so the caller can refresh what it shows.
  function openLlmQuick(onChange) {
    const dlg = el("div", { style: {
      position: "fixed", inset: "0", zIndex: "100000", background: "rgba(0,0,0,0.75)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }});
    const box = el("div", { style: {
      background: C.bg1, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "14px",
      width: "min(640px, 94vw)", maxHeight: "88vh", overflowY: "auto", boxSizing: "border-box",
      display: "flex", flexDirection: "column", gap: "10px", boxShadow: "0 10px 40px rgba(0,0,0,0.6)",
    }});
    const close = () => { quickChanged = null; dlg.remove(); onChange?.(); };
    const head = el("div", { style: { display: "flex", alignItems: "center", gap: "8px" } });
    head.appendChild(el("div", { text: "LLM Setting — Brief / Vision", style: { color: "#fff", fontSize: "14px", fontWeight: "700", flex: "1" } }));
    head.appendChild(button("✕", close, "danger"));
    const body = el("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } });
    box.append(head, body, el("div", {
      text: "Same settings as Settings → LLM Setting. Each change applies to Prompt Edit right away and is saved.",
      style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } }));
    dlg.appendChild(box);
    dlg.addEventListener("mousedown", e => { if (e.target === dlg) close(); });
    document.body.appendChild(dlg);
    quickChanged = () => { saveLlmConfig(); onChange?.(); };
    // The option lists are only loaded once Settings has been opened.
    refreshModels().finally(() => renderModelPickers(body, true));
  }

  return {
    el: ov,
    show() { ov.style.display = "flex"; refreshModels(); },
    hide() { ov.style.display = "none"; },
    refreshModels,
    openLlmQuick,
  };
}

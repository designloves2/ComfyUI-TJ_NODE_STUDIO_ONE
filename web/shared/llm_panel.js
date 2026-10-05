/**
 * Prompt Edit — shared "🔍 Prompt (Full Screen Edit)" popup across all image
 * ONE STUDIO nodes (Krea2, Anima, Z-Image, Klein, Qwen2511, SDXL).
 *
 * Single merged screen (no tabs): image drop/URL on top, a one-line current
 * backend/model summary + a Settings shortcut, the big prompt textarea, two
 * action buttons (Image → Prompt Write / Prompt Enhance), and an APPLY button
 * that pushes the text into the main prompt field without closing the popup.
 * The popup's own header ✓ button (defined by the caller) applies AND closes.
 *
 * Backend/model configuration lives in the node's own ⚙ Settings → LLM
 * section (mountLLMSettingsSection) — the popup only shows a read-only
 * summary of what's currently selected.
 */
import { t } from "./i18n.js";
import { openImageGalleryPicker } from "./ui_image_gallery_picker.js";
import { customLLMControls } from "./custom_llm_controls.js";

const LS_KEY = "tj_studio_one_llm_settings";

const CUSTOM_THEME = { bg: "#1a1a1a", text: "#ddd", border: "#444", muted: "#888", ok: "#7eff7e", warn: "#f0b429", err: "#ff6b6b", brand: "#7612DA" };
const backendName = (b) => b === "openrouter" ? "OpenRouter" : b === "comfy" ? "ComfyUI Native" : b === "custom" ? "Connect Custom" : "Local GGUF";

// The settings live on the server (/tj_shared/llm_settings), so a different browser — or the
// web twin on another origin — sees the same ones. localStorage is only a synchronous read
// cache of that copy: it is refreshed from the server before any panel is built (the await
// below), and every save is pushed back.
function loadLLMSettings() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; }
}
let _pushTimer = null;
function pushLLMSettings(s) {
  clearTimeout(_pushTimer);
  _pushTimer = setTimeout(() => {
    fetch("/tj_shared/llm_settings", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: s }),
    }).catch(() => {});
  }, 300);
}
function saveLLMSettings(patch) {
  const s = loadLLMSettings();
  Object.assign(s, patch);
  localStorage.setItem(LS_KEY, JSON.stringify(s));
  pushLLMSettings(s);
}
async function syncLLMSettingsFromServer() {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 3000);
    const d = await (await fetch("/tj_shared/llm_settings", { signal: ctl.signal })).json();
    clearTimeout(timer);
    const server = d.settings || {};
    const local = loadLLMSettings();
    if (Object.keys(server).length) localStorage.setItem(LS_KEY, JSON.stringify({ ...local, ...server }));
    else if (Object.keys(local).length) pushLLMSettings(local);   // first run: adopt what this browser had
  } catch { /* server unreachable: keep the local copy */ }
}
await syncLLMSettingsFromServer();

const TJ_NODE_GITHUB = "https://github.com/designloves2/ComfyUI-TJ_NODE";

// ── Fetch model lists from backend ──────────────────────────────────────────
let _modelCache = null;

async function fetchModels() {
  if (_modelCache) return _modelCache;
  try {
    const r = await fetch("/tj_studio_one/llm/models");
    const d = await r.json();
    if (d.ok) { _modelCache = d; return d; }
    // local backend unavailable — still hand back the OpenRouter fields so that path works
    return { gguf: [], mmproj: [], vision_tasks: [], _notInstalled: true,
             openrouter_key_hint: d.openrouter_key_hint || "",
             or_model_text: d.or_model_text || d.or_model || "",
             or_model_vision: d.or_model_vision || d.or_model || "" };
  } catch {}
  return { gguf: [], mmproj: [], vision_tasks: [], _notInstalled: true };
}

let _orModelsCache = null;
async function fetchOrModels() {
  if (_orModelsCache) return _orModelsCache;
  try {
    const r = await fetch("/music_one/openrouter_models");
    const d = await r.json();
    _orModelsCache = Array.isArray(d.models) ? d.models : [];
  } catch { _orModelsCache = []; }
  return _orModelsCache;
}

// ── Not-installed banner — points at the installer / Manager ─────────────────
function makeNotInstalledBanner() {
  const wrap = document.createElement("div");
  Object.assign(wrap.style, {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    gap: "10px", padding: "16px", textAlign: "center",
  });
  const icon = document.createElement("div");
  icon.textContent = "🧩";
  icon.style.fontSize = "26px";
  const desc = document.createElement("div");
  desc.textContent = t("llm_not_installed_desc");
  Object.assign(desc.style, { color: "#888", fontSize: "11px", lineHeight: "1.6", whiteSpace: "pre-line" });
  const cmd = document.createElement("code");
  cmd.textContent = "git clone " + TJ_NODE_GITHUB;
  Object.assign(cmd.style, {
    display: "block", background: "#111", color: "#9fe0a0", border: "1px solid #333",
    borderRadius: "6px", padding: "6px 10px", fontSize: "11px", fontFamily: "monospace",
    userSelect: "all", cursor: "text", maxWidth: "100%", overflowX: "auto",
  });
  wrap.appendChild(icon); wrap.appendChild(desc); wrap.appendChild(cmd);
  return wrap;
}

// ── Small form helpers (settings section) ────────────────────────────────────
function makeSelect(options, value, onChange, style = {}) {
  const s = document.createElement("select");
  Object.assign(s.style, {
    background: "#1a1a1a", color: "#ddd", border: "1px solid #444",
    borderRadius: "4px", padding: "3px 5px", fontSize: "11px", width: "100%",
    ...style,
  });
  for (const o of options) {
    const opt = document.createElement("option");
    opt.value = o; opt.textContent = o;
    if (o === value) opt.selected = true;
    s.appendChild(opt);
  }
  s.addEventListener("change", () => onChange(s.value));
  return s;
}

function makeNumberInput(value, min, max, step, onChange) {
  const inp = document.createElement("input");
  inp.type = "number"; inp.value = value; inp.min = min; inp.max = max; inp.step = step;
  Object.assign(inp.style, {
    background: "#1a1a1a", color: "#ddd", border: "1px solid #444",
    borderRadius: "4px", padding: "3px 5px", fontSize: "11px", width: "100%",
    boxSizing: "border-box",
  });
  inp.addEventListener("change", () => onChange(Number(inp.value)));
  return inp;
}

function labelRow(labelText, control) {
  const row = document.createElement("div");
  Object.assign(row.style, { display: "flex", flexDirection: "column", gap: "2px" });
  const lbl = document.createElement("div");
  lbl.textContent = labelText;
  Object.assign(lbl.style, { color: "#888", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.04em" });
  row.appendChild(lbl);
  row.appendChild(control);
  return row;
}

// ── Busy overlay (ring animation) ─────────────────────────────────────────────
let _llmStyleInjected = false;
function _injectLLMStyle() {
  if (_llmStyleInjected) return;
  _llmStyleInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    @keyframes tj-llm-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    .tj-llm-ring {
      width: 40px; height: 40px; border-radius: 50%;
      border: 4px solid rgba(255,255,255,0.15);
      border-top-color: #7eff7e;
      animation: tj-llm-spin 0.9s linear infinite;
    }
  `;
  document.head.appendChild(style);
}
function _makeBusyOverlay(label) {
  _injectLLMStyle();
  const ov = document.createElement("div");
  Object.assign(ov.style, {
    position: "absolute", inset: "0",
    background: "rgba(0,0,0,0.6)", display: "none",
    flexDirection: "column", alignItems: "center", justifyContent: "center",
    gap: "10px", zIndex: "10", pointerEvents: "all", backdropFilter: "blur(1px)",
  });
  const ring = document.createElement("div");
  ring.className = "tj-llm-ring";
  const lbl = document.createElement("div");
  lbl.textContent = label || "";
  Object.assign(lbl.style, { color: "#ccc", fontSize: "12px", letterSpacing: "0.03em" });
  ov.appendChild(ring); ov.appendChild(lbl);
  ov._setLabel = (s) => { lbl.textContent = s; };
  return ov;
}

function basename(p) { return String(p || "").split(/[\\/]/).pop(); }

// ══════════════════════════════════════════════════════════════════════════
// Settings section — backend + model configuration (mounted in ⚙ Settings)
// ══════════════════════════════════════════════════════════════════════════
export function mountLLMSettingsSection(ov, ctx) {
  const cfg = loadLLMSettings();
  const llm = {
    backend_text:       cfg.backend_text        || cfg.backend || "local",
    backend_vision:     cfg.backend_vision      || cfg.backend || "local",
    or_model_text:      cfg.or_model_text       || cfg.or_model || "",
    or_model_vision:    cfg.or_model_vision     || cfg.or_model || "",
    // "Connect Custom" endpoints, one per role (the API key is never kept here — it lives in
    // the server's memory).
    custom_base_text:   cfg.custom_base_text    || "",
    custom_model_text:  cfg.custom_model_text   || "",
    custom_ctx_text:    cfg.custom_ctx_text     ?? 0,
    custom_base_vision: cfg.custom_base_vision  || "",
    custom_model_vision: cfg.custom_model_vision || "",
    custom_ctx_vision:  cfg.custom_ctx_vision   ?? 0,
    gguf_model:         cfg.gguf_model          || "",
    mmproj_file:        cfg.mmproj_file         || "none",
    text_encoder_name:  cfg.text_encoder_name   || "",
    clip_loader_type:   cfg.clip_loader_type    || "Auto",
    // "Caption + Format" is the only vision task that actually applies
    // Model Format/Aesthetic (TJ_ImageToPrompt ignores model_format for every
    // other task type) — default to it so the dropdown isn't a silent no-op.
    vision_task:        cfg.vision_task         || "Caption + Format (apply model_format below)",
    model_format:       cfg.model_format        || "Universal Natural Language",
    aesthetic:          cfg.aesthetic           || "None (no aesthetic injection)",
    extra_instructions: cfg.extra_instructions  || "",
    n_gpu_layers:       cfg.n_gpu_layers        ?? -1,
    n_ctx:              cfg.n_ctx               ?? 4096,
    max_tokens:         cfg.max_tokens          ?? 1000,
    temperature:        cfg.temperature         ?? 0.7,
    seed:               cfg.seed                ?? 0,
  };
  function saveLLM() { saveLLMSettings(llm); }

  const wrap = document.createElement("div");
  Object.assign(wrap.style, { display: "flex", flexDirection: "column", gap: "10px" });

  const title = document.createElement("div");
  title.textContent = "LLM — Prompt Write / Prompt Enhance";
  Object.assign(title.style, { color: "#fff", fontSize: "13px", fontWeight: "700" });
  wrap.appendChild(title);

  const body = document.createElement("div");
  Object.assign(body.style, { display: "flex", flexDirection: "column", gap: "10px" });
  wrap.appendChild(body);

  const _backendBlocks = [];
  function pushOrModel(role) {
    const key = role === "vision" ? "or_model_vision" : "or_model_text";
    fetch("/tj_studio_one/llm/config", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: llm[key] }),
    }).catch(() => {});
  }
  function syncBackendBlocks() { for (const b of _backendBlocks) b._syncFromState(); }

  function makeBackendBlock(role, roleLabel) {
    const mkey = role === "vision" ? "or_model_vision" : "or_model_text";
    const bkey = role === "vision" ? "backend_vision" : "backend_text";
    const box = document.createElement("div");
    Object.assign(box.style, {
      display: "flex", flexDirection: "column", gap: "6px",
      border: "1px solid #333", borderRadius: "6px", padding: "8px", background: "#141414",
    });
    const hdr = document.createElement("div");
    hdr.textContent = roleLabel;
    Object.assign(hdr.style, { color: "#ddd", fontSize: "11px", fontWeight: "700" });
    box.appendChild(hdr);

    const BACKEND_LABELS = ["Local GGUF", "ComfyUI Native", "OpenRouter", "Connect Custom"];
    function backendLabel() { return backendName(llm[bkey]); }
    const beSel = makeSelect(BACKEND_LABELS, backendLabel(),
      (v) => { llm[bkey] = v === "OpenRouter" ? "openrouter" : v === "ComfyUI Native" ? "comfy" : v === "Connect Custom" ? "custom" : "local"; saveLLM(); syncBackendBlocks(); });
    box.appendChild(labelRow("Backend", beSel));

    const localGroup = document.createElement("div");
    Object.assign(localGroup.style, { display: "flex", flexDirection: "column", gap: "6px" });
    const ggufSel = makeSelect([llm.gguf_model || "Loading…"], llm.gguf_model, v => { llm.gguf_model = v; saveLLM(); });
    localGroup.appendChild(labelRow(t("llm_lbl_gguf"), ggufSel));
    let mmprojSel = null;
    if (role === "vision") {
      mmprojSel = makeSelect([llm.mmproj_file || "none"], llm.mmproj_file, v => { llm.mmproj_file = v; saveLLM(); });
      localGroup.appendChild(labelRow(t("llm_lbl_mmproj"), mmprojSel));
    }
    box.appendChild(localGroup);

    // ComfyUI Native — reuses whatever CLIP-type text-encoder checkpoint is
    // already installed for image generation; no extra file to download.
    const comfyGroup = document.createElement("div");
    Object.assign(comfyGroup.style, { display: "flex", flexDirection: "column", gap: "6px" });
    const teSel = makeSelect([llm.text_encoder_name || "Loading…"], llm.text_encoder_name, v => { llm.text_encoder_name = v; saveLLM(); });
    const clipTypeSel = makeSelect([llm.clip_loader_type || "Auto"], llm.clip_loader_type, v => { llm.clip_loader_type = v; saveLLM(); });
    comfyGroup.appendChild(labelRow("Text Encoder (CLIP)", teSel));
    comfyGroup.appendChild(labelRow("CLIP Loader Type", clipTypeSel));
    box.appendChild(comfyGroup);

    const orGroup = document.createElement("div");
    Object.assign(orGroup.style, { display: "flex", flexDirection: "column", gap: "6px" });
    const orSel = makeSelect([llm[mkey] || "Loading…"], llm[mkey],
      (v) => { llm[mkey] = v; saveLLM(); pushOrModel(role); });
    const orFilter = document.createElement("input");
    orFilter.type = "text"; orFilter.placeholder = "filter models…";
    Object.assign(orFilter.style, {
      background: "#1a1a1a", color: "#ddd", border: "1px solid #444",
      borderRadius: "4px", padding: "3px 5px", fontSize: "11px", width: "100%", boxSizing: "border-box",
    });
    orFilter.addEventListener("input", () => {
      const q = orFilter.value.toLowerCase().trim();
      for (const o of orSel.options) o.hidden = !!q && !o.value.toLowerCase().includes(q);
    });
    orGroup.appendChild(labelRow("OpenRouter model", orFilter));
    orGroup.appendChild(orSel);

    const keyInp = document.createElement("input");
    keyInp.type = "password"; keyInp.placeholder = "sk-or-… (stored in .env)";
    Object.assign(keyInp.style, {
      background: "#1a1a1a", color: "#ddd", border: "1px solid #444",
      borderRadius: "4px", padding: "3px 5px", fontSize: "11px", width: "100%", boxSizing: "border-box",
    });
    keyInp.addEventListener("blur", () => {
      const v = keyInp.value.trim();
      if (!v || v.includes("*")) return;
      fetch("/tj_studio_one/llm/config", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openrouter_key: v }),
      }).then(() => { keyInp.value = ""; keyInp.placeholder = "✓ key saved to .env"; });
    });
    orGroup.appendChild(labelRow("OpenRouter API key", keyInp));
    box.appendChild(orGroup);

    // Connect Custom — any OpenAI-style Chat Completions server, its own URL / model / key
    // for this role (Prompt Enhance and Image → Prompt Write do not share one).
    const ck = role === "vision"
      ? { base: "custom_base_vision", model: "custom_model_vision", ctx: "custom_ctx_vision" }
      : { base: "custom_base_text",   model: "custom_model_text",   ctx: "custom_ctx_text" };
    const customGroup = customLLMControls({
      role: role === "vision" ? "img_i2p" : "img_enhance",
      values: { base: llm[ck.base], model: llm[ck.model], ctx: llm[ck.ctx] },
      onChange: (p) => {
        if ("base" in p) llm[ck.base] = p.base;
        if ("model" in p) llm[ck.model] = p.model;
        if ("ctx" in p) llm[ck.ctx] = p.ctx;
        saveLLM();
      },
      theme: CUSTOM_THEME,
      noteKeyWhere: "the local ONE STUDIO backend",
    });
    box.appendChild(customGroup);

    box._syncFromState = () => {
      beSel.value = backendLabel();
      orSel.value = llm[mkey];
      teSel.value = llm.text_encoder_name;
      clipTypeSel.value = llm.clip_loader_type;
      const b = llm[bkey];
      orGroup.style.display = b === "openrouter" ? "flex" : "none";
      localGroup.style.display = (b === "comfy" || b === "openrouter" || b === "custom") ? "none" : "flex";
      comfyGroup.style.display = b === "comfy" ? "flex" : "none";
      customGroup.style.display = b === "custom" ? "flex" : "none";
    };
    box._fill = (orModels, keyHint) => {
      if (orModels && orModels.length) {
        orSel.innerHTML = "";
        for (const m of orModels) {
          const o = document.createElement("option");
          o.value = m; o.textContent = m;
          if (m === llm[mkey]) o.selected = true;
          orSel.appendChild(o);
        }
        if (!llm[mkey]) {
          llm[mkey] = orModels.find((m) => /gemini-2\.5-flash/.test(m)) || orModels[0];
          saveLLM(); orSel.value = llm[mkey];
        }
      }
      if (keyHint) keyInp.placeholder = keyHint + "  — click to replace";
    };
    box._ggufSel = ggufSel;
    box._mmprojSel = mmprojSel;
    box._teSel = teSel;
    box._clipTypeSel = clipTypeSel;
    _backendBlocks.push(box);
    return box;
  }

  const enhBlock = makeBackendBlock("text", "Prompt Enhance");
  const i2pBlock = makeBackendBlock("vision", "Image → Prompt Write");
  body.appendChild(enhBlock);
  body.appendChild(i2pBlock);

  const advRow = document.createElement("div");
  Object.assign(advRow.style, { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: "6px" });
  advRow.appendChild(labelRow(t("llm_lbl_gpu_layers"), makeNumberInput(llm.n_gpu_layers, -1, 999, 1, v => { llm.n_gpu_layers = v; saveLLM(); })));
  advRow.appendChild(labelRow(t("llm_lbl_ctx"), makeNumberInput(llm.n_ctx, 512, 32768, 512, v => { llm.n_ctx = v; saveLLM(); })));
  advRow.appendChild(labelRow(t("llm_lbl_max_tokens"), makeNumberInput(llm.max_tokens, 50, 4096, 50, v => { llm.max_tokens = v; saveLLM(); })));
  advRow.appendChild(labelRow(t("llm_lbl_temperature"), makeNumberInput(llm.temperature, 0, 2, 0.05, v => { llm.temperature = v; saveLLM(); })));
  advRow.appendChild(labelRow(t("llm_lbl_seed"), makeNumberInput(llm.seed, 0, 999999999, 1, v => { llm.seed = v; saveLLM(); })));
  body.appendChild(advRow);

  syncBackendBlocks();

  Promise.all([fetchModels(), fetchOrModels()]).then(([d, orModels]) => {
    if (!llm.or_model_text && (d.or_model_text || d.or_model)) llm.or_model_text = d.or_model_text || d.or_model;
    if (!llm.or_model_vision && (d.or_model_vision || d.or_model)) llm.or_model_vision = d.or_model_vision || d.or_model;
    if (d.or_model_text || d.or_model_vision) saveLLM();
    if (d._notInstalled) {
      llm.backend_text = "openrouter"; llm.backend_vision = "openrouter"; saveLLM();
      for (const b of _backendBlocks) { b._fill(orModels, d.openrouter_key_hint); b._syncFromState(); }
      body.insertBefore(makeNotInstalledBanner(), body.firstChild);
      return;
    }
    if (d.gguf?.length) {
      for (const b of _backendBlocks) {
        const sel = b._ggufSel;
        sel.innerHTML = "";
        for (const m of d.gguf) {
          const o = document.createElement("option");
          o.value = m; o.textContent = m;
          if (m === llm.gguf_model) o.selected = true;
          sel.appendChild(o);
        }
        if (!llm.gguf_model && d.gguf[0]) { llm.gguf_model = d.gguf[0]; saveLLM(); sel.value = llm.gguf_model; }
      }
    }
    if (d.mmproj?.length) {
      for (const b of _backendBlocks) {
        if (!b._mmprojSel) continue;
        b._mmprojSel.innerHTML = "";
        for (const m of d.mmproj) {
          const o = document.createElement("option");
          o.value = m; o.textContent = m;
          if (m === llm.mmproj_file) o.selected = true;
          b._mmprojSel.appendChild(o);
        }
      }
    }
    if (d.text_encoders?.length) {
      for (const b of _backendBlocks) {
        const sel = b._teSel;
        sel.innerHTML = "";
        for (const m of d.text_encoders) {
          const o = document.createElement("option");
          o.value = m; o.textContent = m;
          if (m === llm.text_encoder_name) o.selected = true;
          sel.appendChild(o);
        }
        if (!llm.text_encoder_name && d.text_encoders[0]) { llm.text_encoder_name = d.text_encoders[0]; saveLLM(); sel.value = llm.text_encoder_name; }
      }
    }
    if (d.clip_loader_types?.length) {
      for (const b of _backendBlocks) {
        const sel = b._clipTypeSel;
        sel.innerHTML = "";
        for (const m of d.clip_loader_types) {
          const o = document.createElement("option");
          o.value = m; o.textContent = m;
          if (m === llm.clip_loader_type) o.selected = true;
          sel.appendChild(o);
        }
      }
    }
    for (const b of _backendBlocks) { b._fill(orModels, d.openrouter_key_hint); b._syncFromState(); }
  });

  ov.appendChild(wrap);
  return { el: wrap };
}

// Read-only summary of the currently applied backend/model per role — used by
// the popup so it doesn't need to duplicate the Settings UI.
export function getLLMSummary() {
  const llm = loadLLMSettings();
  const line = (backend, orModel, customModel) => backend === "openrouter"
    ? `OpenRouter · ${orModel || "(model not set)"}`
    : backend === "comfy"
    ? `ComfyUI Native · ${basename(llm.text_encoder_name) || "(model not set)"}`
    : backend === "custom"
    ? `Connect Custom · ${customModel || "(model not set)"}`
    : `Local GGUF · ${basename(llm.gguf_model) || "(model not set)"}`;
  return {
    write: line(llm.backend_vision || llm.backend || "local", llm.or_model_vision || llm.or_model, llm.custom_model_vision),
    enhance: line(llm.backend_text || llm.backend || "local", llm.or_model_text || llm.or_model, llm.custom_model_text),
  };
}

// ══════════════════════════════════════════════════════════════════════════
// Popup — single merged screen
// ══════════════════════════════════════════════════════════════════════════
export function attachLLMPanel({ promptExpandEl, pxTA, getModePrompt, setModePrompt, state, persist, updateCount, getPromptTA, openSettings, defaultModelFormat }) {
  // Grab existing children (header row + textarea) — restructure the interior.
  const [, existingTA] = Array.from(promptExpandEl.children);
  promptExpandEl.removeChild(existingTA);

  const contentWrap = document.createElement("div");
  Object.assign(contentWrap.style, { flex: "1", display: "flex", flexDirection: "column", gap: "8px", minHeight: "0" });

  const PURPLE = "#7612DA";

  // ── Top row: image drop zone (left) + URL/model options (right) ─────────
  const topRow = document.createElement("div");
  Object.assign(topRow.style, { display: "flex", gap: "12px", flexShrink: "0", alignItems: "stretch" });

  const imgCol = document.createElement("div");
  Object.assign(imgCol.style, { display: "flex", flexDirection: "column", width: "220px", flexShrink: "0" });

  const imgDropZone = document.createElement("div");
  Object.assign(imgDropZone.style, {
    border: "none", borderRadius: "8px", padding: "6px",
    textAlign: "center", cursor: "pointer", color: "#888", fontSize: "13px",
    background: "#232323", flex: "1", display: "flex",
    alignItems: "center", justifyContent: "center", flexDirection: "column", position: "relative",
  });
  imgDropZone.textContent = t("llm_img_drop");
  const fileInput = document.createElement("input");
  fileInput.type = "file"; fileInput.accept = "image/*"; fileInput.style.display = "none";
  let _imageB64 = null;
  const imgPreview = document.createElement("img");
  Object.assign(imgPreview.style, {
    position: "absolute", inset: "0", width: "100%", height: "100%",
    objectFit: "contain", display: "none", borderRadius: "4px",
  });
  const imgClearBtn = document.createElement("button");
  imgClearBtn.type = "button"; imgClearBtn.textContent = "✕";
  Object.assign(imgClearBtn.style, {
    position: "absolute", top: "2px", right: "2px", zIndex: "2", display: "none",
    background: "rgba(0,0,0,0.7)", color: "#fff", border: "none", borderRadius: "3px",
    width: "16px", height: "16px", fontSize: "10px", cursor: "pointer", lineHeight: "1",
  });
  imgClearBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    _imageB64 = null; imgPreview.style.display = "none"; imgClearBtn.style.display = "none";
    syncButtons();
  });
  const imgGalleryBtn = document.createElement("button");
  imgGalleryBtn.type = "button"; imgGalleryBtn.textContent = "🖼"; imgGalleryBtn.title = "Load from gallery";
  Object.assign(imgGalleryBtn.style, {
    position: "absolute", bottom: "4px", left: "4px", zIndex: "2",
    background: "rgba(0,0,0,0.65)", color: "#fff", border: "none", borderRadius: "4px",
    width: "22px", height: "22px", fontSize: "12px", cursor: "pointer", padding: "0",
  });
  imgGalleryBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openImageGalleryPicker((filename) => {
      resizeAndSetImage(`/view?filename=${encodeURIComponent(filename)}&type=input`);
    });
  });
  imgDropZone.appendChild(fileInput);
  imgDropZone.appendChild(imgPreview);
  imgDropZone.appendChild(imgClearBtn);
  imgDropZone.appendChild(imgGalleryBtn);
  imgDropZone.addEventListener("click", (e) => { if (e.target !== imgClearBtn && e.target !== imgGalleryBtn) fileInput.click(); });
  imgDropZone.addEventListener("dragover", e => { e.preventDefault(); imgDropZone.style.outline = `2px dashed ${PURPLE}`; });
  imgDropZone.addEventListener("dragleave", () => { imgDropZone.style.outline = "none"; });
  imgDropZone.addEventListener("drop", e => {
    e.preventDefault(); imgDropZone.style.outline = "none";
    const file = e.dataTransfer?.files?.[0];
    if (file) loadImageFile(file);
  });
  fileInput.addEventListener("change", () => { if (fileInput.files[0]) loadImageFile(fileInput.files[0]); });

  const MAX_IMG_MP = 1_000_000; // 1 MP
  function resizeAndSetImage(src) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        let w = img.naturalWidth, h = img.naturalHeight;
        const mp = w * h;
        if (mp > MAX_IMG_MP) { const scale = Math.sqrt(MAX_IMG_MP / mp); w = Math.round(w * scale); h = Math.round(h * scale); }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        const resized = canvas.toDataURL("image/jpeg", 1.0);
        _imageB64 = resized;
        imgPreview.src = resized; imgPreview.style.display = "block";
        imgClearBtn.style.display = "block";
        syncButtons();
        resolve(resized);
      };
      img.src = src;
    });
  }
  function loadImageFile(file) {
    const reader = new FileReader();
    reader.onload = ev => resizeAndSetImage(ev.target.result);
    reader.readAsDataURL(file);
  }

  imgCol.appendChild(imgDropZone);

  // ── Right column: URL/Download, Vision Task + Back Setting, Model Format +
  //    Aesthetic, Extra Instructions — matches the reference layout. ────────
  const rightCol = document.createElement("div");
  Object.assign(rightCol.style, { flex: "1", display: "flex", flexDirection: "column", gap: "8px", minWidth: "0" });

  function selectStyle(sel) {
    Object.assign(sel.style, { background: "#2a2a2a", color: "#ddd", border: "none",
      borderRadius: "6px", padding: "8px", fontSize: "13px", width: "100%" });
    return sel;
  }
  function fieldLabel(text) {
    const l = document.createElement("div");
    l.textContent = text;
    Object.assign(l.style, { color: "#aaa", fontSize: "12px", marginBottom: "3px" });
    return l;
  }
  function fieldCol(label, control) {
    const col = document.createElement("div");
    Object.assign(col.style, { flex: "1", display: "flex", flexDirection: "column", minWidth: "0" });
    col.appendChild(fieldLabel(label));
    col.appendChild(control);
    return col;
  }
  function purpleBtn(text) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = text;
    Object.assign(b.style, {
      background: PURPLE, color: "#fff", border: "none", borderRadius: "6px",
      padding: "8px 14px", cursor: "pointer", fontSize: "13px", fontWeight: "700", whiteSpace: "nowrap",
    });
    return b;
  }

  const urlRow = document.createElement("div");
  Object.assign(urlRow.style, { display: "flex", gap: "8px" });
  const urlInput = document.createElement("input");
  urlInput.type = "text"; urlInput.placeholder = t("llm_url_placeholder");
  Object.assign(urlInput.style, {
    flex: "1", background: "#2a2a2a", color: "#ddd", border: "none",
    borderRadius: "6px", padding: "8px 10px", fontSize: "13px", minWidth: 0,
  });
  const btnDl = purpleBtn(t("llm_btn_download"));
  btnDl.addEventListener("click", async () => {
    const url = urlInput.value.trim();
    if (!url) { alert(t("llm_err_no_url")); return; }
    btnDl.textContent = t("llm_btn_downloading"); btnDl.disabled = true;
    try {
      const resp = await fetch("/tj_studio_one/llm/download_image", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }),
      });
      const d = await resp.json();
      if (!d.ok) throw new Error(d.error || "unknown error");
      await resizeAndSetImage(d.b64);
    } catch (e) { alert(t("llm_err_download") + e.message); }
    finally { btnDl.textContent = t("llm_btn_download"); btnDl.disabled = false; }
  });
  urlRow.appendChild(urlInput); urlRow.appendChild(btnDl);

  // ── Per-prompt options: Vision Task / Model Format / Aesthetic + Extra
  //    Instructions — these describe THIS prompt, not the LLM backend, so
  //    they live here rather than in ⚙ Settings. ───────────────────────────
  const llmForOptions = loadLLMSettings();
  function optSelect(key, current, placeholder) {
    const sel = selectStyle(makeSelect([current || placeholder], current,
      v => { const l = loadLLMSettings(); l[key] = v; saveLLMSettings(l); }));
    return sel;
  }
  const vtSel = optSelect("vision_task", llmForOptions.vision_task, "Caption + Format (apply model_format below)");
  const modelFmtSel = optSelect("model_format", llmForOptions.model_format, "Universal Natural Language");
  // Model Format is saved to a GLOBAL localStorage key shared by every ONE STUDIO tool, so
  // a value picked in, say, SDXL becomes the "current" value the next time ANY node's
  // Prompt Edit opens — comparing against the generic "Universal Natural Language" fallback
  // to decide whether to apply a node's own fixed default silently failed whenever the
  // global value happened to be some OTHER tool's format instead. Track "did the user touch
  // it in THIS panel instance" directly so each fresh node always gets its own default,
  // regardless of what an earlier session/tool left in the shared setting.
  let modelFormatTouched = false, suppressModelFormatTouch = false;
  modelFmtSel.addEventListener("change", () => { if (!suppressModelFormatTouch) modelFormatTouched = true; });
  const aestheticSel = optSelect("aesthetic", llmForOptions.aesthetic, "None (no aesthetic injection)");

  const settingsBtn = purpleBtn(t("llm_settings_btn"));
  settingsBtn.addEventListener("click", () => openSettings?.());

  const row2 = document.createElement("div");
  Object.assign(row2.style, { display: "flex", gap: "8px", alignItems: "flex-end" });
  row2.appendChild(fieldCol(t("llm_lbl_vision_task"), vtSel));
  row2.appendChild(settingsBtn);

  const row3 = document.createElement("div");
  Object.assign(row3.style, { display: "flex", gap: "8px" });
  row3.appendChild(fieldCol(t("llm_lbl_model_format"), modelFmtSel));
  row3.appendChild(fieldCol(t("llm_lbl_aesthetic"), aestheticSel));

  const extraInstrTA = document.createElement("textarea");
  extraInstrTA.value = llmForOptions.extra_instructions || "";
  extraInstrTA.rows = 2;
  Object.assign(extraInstrTA.style, {
    background: "#2a2a2a", color: "#ddd", border: "none",
    borderRadius: "6px", padding: "8px 10px", fontSize: "13px", width: "100%",
    boxSizing: "border-box", resize: "none", fontFamily: "inherit", flex: "1",
  });
  extraInstrTA.addEventListener("input", () => { const l = loadLLMSettings(); l.extra_instructions = extraInstrTA.value; saveLLMSettings(l); });
  const extraCol = document.createElement("div");
  Object.assign(extraCol.style, { display: "flex", flexDirection: "column", flex: "1", minHeight: "0" });
  extraCol.appendChild(fieldLabel(t("llm_lbl_extra_instructions")));
  extraCol.appendChild(extraInstrTA);

  // ── Seed + seed control — per-run, so it lives here (not in ⚙ Settings) ──
  const seedInput = document.createElement("input");
  seedInput.type = "number"; seedInput.min = "0"; seedInput.step = "1";
  seedInput.value = llmForOptions.seed ?? 0;
  Object.assign(seedInput.style, {
    background: "#2a2a2a", color: "#ddd", border: "none",
    borderRadius: "6px", padding: "8px 10px", fontSize: "13px", width: "100%", boxSizing: "border-box",
  });
  seedInput.addEventListener("input", () => {
    const l = loadLLMSettings(); l.seed = parseInt(seedInput.value, 10) || 0; saveLLMSettings(l);
  });
  const seedModeSel = selectStyle(makeSelect(
    ["Random", "Fixed", "+1", "-1"],
    { randomize: "Random", fixed: "Fixed", increment: "+1", decrement: "-1" }[llmForOptions.seed_mode || "randomize"],
    (label) => {
      const mode = { Random: "randomize", Fixed: "fixed", "+1": "increment", "-1": "decrement" }[label];
      const l = loadLLMSettings(); l.seed_mode = mode; saveLLMSettings(l);
    }
  ));
  function applySeedControl() {
    const l = loadLLMSettings();
    const mode = l.seed_mode || "randomize";
    if (mode === "randomize") l.seed = Math.floor(Math.random() * 1e15);
    else if (mode === "increment") l.seed = (l.seed || 0) + 1;
    else if (mode === "decrement") l.seed = Math.max(0, (l.seed || 0) - 1);
    saveLLMSettings(l);
    seedInput.value = l.seed;
    return l.seed;
  }
  const seedRow = document.createElement("div");
  Object.assign(seedRow.style, { display: "flex", gap: "8px", flexShrink: "0" });
  seedRow.appendChild(fieldCol(t("llm_lbl_seed"), seedInput));
  seedRow.appendChild(fieldCol(t("llm_lbl_seed_mode"), seedModeSel));

  rightCol.appendChild(urlRow);
  rightCol.appendChild(row2);
  rightCol.appendChild(row3);
  rightCol.appendChild(extraCol);
  rightCol.appendChild(seedRow);

  topRow.appendChild(imgCol);
  topRow.appendChild(rightCol);

  function fillOptionSelects(d) {
    const l = loadLLMSettings();
    const fill = (sel, list, key) => {
      if (!list?.length) return;
      sel.innerHTML = "";
      for (const v of list) {
        const o = document.createElement("option");
        o.value = v; o.textContent = v;
        if (v === l[key]) o.selected = true;
        sel.appendChild(o);
      }
    };
    fill(vtSel, d.vision_tasks, "vision_task");
    fill(modelFmtSel, d.model_formats, "model_format");
    fill(aestheticSel, d.aesthetics, "aesthetic");
    // Per-node fixed Model Format default (e.g. "Qwen Image 2.1 (T2I)") — applied here,
    // right after the real option list lands, instead of the caller guessing when the
    // async fetch above has resolved. Never overwrites a value the user touched in THIS
    // panel instance (see modelFormatTouched above for why that's not the same as
    // comparing against the shared/global current value).
    if (defaultModelFormat && !modelFormatTouched
        && [...modelFmtSel.options].some(o => o.value === defaultModelFormat)) {
      suppressModelFormatTouch = true;
      modelFmtSel.value = defaultModelFormat;
      modelFmtSel.dispatchEvent(new Event("change", { bubbles: true }));
      suppressModelFormatTouch = false;
    }
  }
  fetchModels().then(fillOptionSelects);

  // ── Prompt textarea (reused) + busy overlay ──────────────────────────────
  const taWrap = document.createElement("div");
  Object.assign(taWrap.style, { flex: "1", display: "flex", position: "relative", minHeight: "0" });
  existingTA.style.borderRadius = "6px";
  existingTA.style.flex = "1";
  const busyOv = _makeBusyOverlay("");
  taWrap.appendChild(existingTA);
  taWrap.appendChild(busyOv);
  function setBusy(on, label) {
    if (label) busyOv._setLabel(label);
    busyOv.style.display = on ? "flex" : "none";
    existingTA.disabled = on;
  }

  // ── Action buttons — one row: Image Write / Prompt Enhance / APPLY ────────
  const actionRow = document.createElement("div");
  Object.assign(actionRow.style, { display: "flex", gap: "10px", flexShrink: "0" });

  const btnWrite = purpleBtn("🖼 " + t("llm_btn_analyze_write"));
  btnWrite.style.flex = "1";
  const btnEnhance = purpleBtn(t("llm_btn_enhance"));
  btnEnhance.style.flex = "1";
  const applyBtn = purpleBtn(t("llm_btn_apply"));
  applyBtn.style.flex = "1";

  actionRow.appendChild(btnWrite); actionRow.appendChild(btnEnhance); actionRow.appendChild(applyBtn);

  function syncButtons() {
    btnWrite.disabled = !_imageB64;
    btnWrite.style.opacity = _imageB64 ? "1" : "0.45";
    const hasText = existingTA.value.trim().length > 0;
    btnEnhance.disabled = !hasText;
    btnEnhance.style.opacity = hasText ? "1" : "0.45";
  }
  existingTA.addEventListener("input", syncButtons);

  // APPLY pushes text into the main prompt WITHOUT closing — the popup
  // header's own ✓ (defined by the caller) applies AND closes together.
  function applyNow() {
    const text = existingTA.value;
    setModePrompt(state.mode, text);
    const pta = getPromptTA?.(); if (pta) pta.value = text;
    pxTA.value = text;
    if (persist) persist();
    if (updateCount) updateCount();
  }
  applyBtn.addEventListener("click", applyNow);

  // ── Footer: currently applied backend + Enhance/Vision model ─────────────
  const footerBar = document.createElement("div");
  Object.assign(footerBar.style, {
    display: "flex", gap: "16px", flexShrink: "0", flexWrap: "wrap",
    fontSize: "11px", color: "#888", padding: "2px 2px 0",
  });
  const footerBackend = document.createElement("span");
  const footerEnhance = document.createElement("span");
  const footerVision = document.createElement("span");
  footerBar.appendChild(footerBackend);
  footerBar.appendChild(footerEnhance);
  footerBar.appendChild(footerVision);

  function refreshFooter() {
    const l = loadLLMSettings();
    const backendLabel = backendName;
    const s = getLLMSummary();
    footerBackend.textContent = "적용 방식 — " + t("llm_tab_i2p") + ": " + backendLabel(l.backend_vision || l.backend || "local")
      + " · " + t("llm_lbl_enhance_backend") + ": " + backendLabel(l.backend_text || l.backend || "local");
    footerEnhance.textContent = t("llm_tab_enhance") + " " + t("llm_lbl_model") + ": " + s.enhance;
    footerVision.textContent = t("llm_tab_i2p") + " " + t("llm_lbl_model") + ": " + s.write;
  }

  // ── Debug log — shows exactly what was sent to the LLM (system/instruction
  //    text + raw output) so Model Format/Aesthetic/Vision Task can actually
  //    be confirmed, not just assumed. ───────────────────────────────────────
  const debugToggleBtn = document.createElement("button");
  debugToggleBtn.type = "button"; debugToggleBtn.textContent = t("llm_btn_show_log");
  Object.assign(debugToggleBtn.style, {
    alignSelf: "flex-start", background: "transparent", color: "#888", border: "none",
    fontSize: "11px", cursor: "pointer", textDecoration: "underline", padding: "0", flexShrink: "0",
  });
  const debugPre = document.createElement("pre");
  Object.assign(debugPre.style, {
    display: "none", background: "#111", color: "#9c9", border: "1px solid #333",
    borderRadius: "6px", padding: "8px", fontSize: "10px", lineHeight: "1.4",
    maxHeight: "160px", overflow: "auto", whiteSpace: "pre-wrap", flexShrink: "0", margin: "0",
  });
  let _lastDebug = "";
  debugToggleBtn.addEventListener("click", () => {
    const show = debugPre.style.display === "none";
    debugPre.style.display = show ? "block" : "none";
    debugPre.textContent = _lastDebug || t("llm_no_log_yet");
  });
  function setLastDebug(text) {
    _lastDebug = text || "";
    if (debugPre.style.display !== "none") debugPre.textContent = _lastDebug || t("llm_no_log_yet");
  }

  contentWrap.appendChild(topRow);
  contentWrap.appendChild(actionRow);
  contentWrap.appendChild(taWrap);
  contentWrap.appendChild(footerBar);
  contentWrap.appendChild(debugToggleBtn);
  contentWrap.appendChild(debugPre);
  promptExpandEl.appendChild(contentWrap);

  // ── Image → Prompt Write: sends the image + (if any) the text already in
  //    the box as context, and asks for ONE integrated rewrite — never a
  //    plain append. ──────────────────────────────────────────────────────
  async function doWrite() {
    if (!_imageB64) return;
    applySeedControl();
    const llm = loadLLMSettings();
    const existingText = existingTA.value.trim();
    let contextInstruction = existingText
      ? `The user has already written this description — use it as context and produce ONE integrated, polished prompt that incorporates it with what you see in the image. Rewrite it as a single cohesive prompt; do not simply append your description after it.\n\nExisting text:\n${existingText}`
      : "";
    if (llm.extra_instructions) contextInstruction += (contextInstruction ? "\n\n" : "") + llm.extra_instructions;
    btnWrite.disabled = true; setBusy(true, t("llm_busy_write"));
    try {
      const r = await fetch("/tj_studio_one/llm/image_to_prompt", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_b64: _imageB64,
          backend: llm.backend_vision || llm.backend || "local",
          or_model: llm.or_model_vision || llm.or_model,
          custom_base: llm.custom_base_vision,
          custom_model: llm.custom_model_vision,
          custom_ctx: llm.custom_ctx_vision,
          gguf_model: llm.gguf_model,
          mmproj_file: llm.mmproj_file,
          text_encoder_name: llm.text_encoder_name,
          clip_loader_type: llm.clip_loader_type,
          vision_task: llm.vision_task,
          model_format: llm.model_format,
          aesthetic: llm.aesthetic,
          custom_instruction: contextInstruction,
          n_gpu_layers: llm.n_gpu_layers,
          n_ctx: llm.n_ctx,
          max_tokens: llm.max_tokens,
          temperature: llm.temperature,
          seed: llm.seed,
        }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || "error");
      existingTA.value = d.result;
      setLastDebug(d.debug_thought);
      syncButtons();
    } catch (e) { alert(t("llm_err_prefix") + e.message); }
    finally { setBusy(false); syncButtons(); }
  }
  btnWrite.addEventListener("click", doWrite);

  // ── Prompt Enhance: dumbs the current text into a better prompt, in place ──
  async function doEnhance() {
    const prompt = existingTA.value.trim();
    if (!prompt) return;
    applySeedControl();
    const llm = loadLLMSettings();
    btnEnhance.disabled = true; setBusy(true, t("llm_busy_enhance"));
    try {
      const r = await fetch("/tj_studio_one/llm/enhance", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          backend: llm.backend_text || llm.backend || "local",
          or_model: llm.or_model_text || llm.or_model,
          custom_base: llm.custom_base_text,
          custom_model: llm.custom_model_text,
          custom_ctx: llm.custom_ctx_text,
          gguf_model: llm.gguf_model,
          text_encoder_name: llm.text_encoder_name,
          clip_loader_type: llm.clip_loader_type,
          n_gpu_layers: llm.n_gpu_layers,
          n_ctx: llm.n_ctx,
          max_tokens: llm.max_tokens,
          temperature: llm.temperature,
          seed: llm.seed,
          model_format: llm.model_format,
          aesthetic: llm.aesthetic,
          extra_instructions: llm.extra_instructions,
        }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || "error");
      existingTA.value = d.result;
      setLastDebug(d.debug_thought);
      syncButtons();
    } catch (e) { alert(t("llm_err_prefix") + e.message); }
    finally { setBusy(false); syncButtons(); }
  }
  btnEnhance.addEventListener("click", doEnhance);

  // ── Show hook ─────────────────────────────────────────────────────────────
  promptExpandEl._tj_llm_onshow = () => {
    existingTA.value = getModePrompt(state.mode);
    refreshFooter();
    syncButtons();
    const l = loadLLMSettings();
    extraInstrTA.value = l.extra_instructions || "";
    seedInput.value = l.seed ?? 0;
    debugPre.style.display = "none";
    setLastDebug("");
  };
  refreshFooter();

  // Exposes the same Prompt Enhance call `btnEnhance` triggers, for callers that want to
  // run it programmatically (e.g. an "Auto Enhance before Generate" checkbox) instead of
  // only from inside the expand overlay's own UI. Piloted on Qwen Image 2.1 first, meant
  // to be reused by every other ONE STUDIO image tool afterwards — additive return value,
  // existing callers that ignore it are unaffected.
  return { enhance: doEnhance };
}

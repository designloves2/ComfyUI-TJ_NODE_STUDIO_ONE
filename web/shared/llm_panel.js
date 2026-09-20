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

const LS_KEY = "tj_studio_one_llm_settings";

function loadLLMSettings() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; }
}
function saveLLMSettings(patch) {
  const s = loadLLMSettings();
  Object.assign(s, patch);
  localStorage.setItem(LS_KEY, JSON.stringify(s));
}

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
    gguf_model:         cfg.gguf_model          || "",
    mmproj_file:        cfg.mmproj_file         || "none",
    vision_task:        cfg.vision_task         || "Caption (plain description)",
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

    const beSel = makeSelect(["Local GGUF", "OpenRouter"],
      llm[bkey] === "openrouter" ? "OpenRouter" : "Local GGUF",
      (v) => { llm[bkey] = v === "OpenRouter" ? "openrouter" : "local"; saveLLM(); syncBackendBlocks(); });
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

    box._syncFromState = () => {
      beSel.value = llm[bkey] === "openrouter" ? "OpenRouter" : "Local GGUF";
      orSel.value = llm[mkey];
      const or = llm[bkey] === "openrouter";
      orGroup.style.display = or ? "flex" : "none";
      localGroup.style.display = or ? "none" : "flex";
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
    _backendBlocks.push(box);
    return box;
  }

  const enhBlock = makeBackendBlock("text", "Prompt Enhance");
  const i2pBlock = makeBackendBlock("vision", "Image → Prompt Write");
  body.appendChild(enhBlock);
  body.appendChild(i2pBlock);

  const vtSel = makeSelect(["Caption (plain description)"], llm.vision_task, v => { llm.vision_task = v; saveLLM(); });
  const modelFmtSel = makeSelect(["Universal Natural Language"], llm.model_format, v => { llm.model_format = v; saveLLM(); });
  const aestheticSel = makeSelect(["None (no aesthetic injection)"], llm.aesthetic, v => { llm.aesthetic = v; saveLLM(); });
  body.appendChild(labelRow(t("llm_lbl_vision_task"), vtSel));
  body.appendChild(labelRow(t("llm_lbl_model_format"), modelFmtSel));
  body.appendChild(labelRow(t("llm_lbl_aesthetic"), aestheticSel));

  const extraInstrTA = document.createElement("textarea");
  extraInstrTA.value = llm.extra_instructions;
  extraInstrTA.rows = 2;
  Object.assign(extraInstrTA.style, {
    background: "#1a1a1a", color: "#ddd", border: "1px solid #444",
    borderRadius: "4px", padding: "4px 5px", fontSize: "11px", width: "100%",
    boxSizing: "border-box", resize: "vertical", fontFamily: "inherit",
  });
  extraInstrTA.addEventListener("input", () => { llm.extra_instructions = extraInstrTA.value; saveLLM(); });
  body.appendChild(labelRow(t("llm_lbl_extra_instructions"), extraInstrTA));

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
    if (d.vision_tasks?.length) {
      vtSel.innerHTML = "";
      for (const v of d.vision_tasks) {
        const o = document.createElement("option");
        o.value = v; o.textContent = v;
        if (v === llm.vision_task) o.selected = true;
        vtSel.appendChild(o);
      }
    }
    if (d.model_formats?.length) {
      modelFmtSel.innerHTML = "";
      for (const v of d.model_formats) {
        const o = document.createElement("option");
        o.value = v; o.textContent = v;
        if (v === llm.model_format) o.selected = true;
        modelFmtSel.appendChild(o);
      }
    }
    if (d.aesthetics?.length) {
      aestheticSel.innerHTML = "";
      for (const v of d.aesthetics) {
        const o = document.createElement("option");
        o.value = v; o.textContent = v;
        if (v === llm.aesthetic) o.selected = true;
        aestheticSel.appendChild(o);
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
  const line = (backend, orModel) => backend === "openrouter"
    ? `OpenRouter · ${orModel || "(model not set)"}`
    : `Local GGUF · ${basename(llm.gguf_model) || "(model not set)"}`;
  return {
    write: line(llm.backend_vision || llm.backend || "local", llm.or_model_vision || llm.or_model),
    enhance: line(llm.backend_text || llm.backend || "local", llm.or_model_text || llm.or_model),
  };
}

// ══════════════════════════════════════════════════════════════════════════
// Popup — single merged screen
// ══════════════════════════════════════════════════════════════════════════
export function attachLLMPanel({ promptExpandEl, pxTA, getModePrompt, setModePrompt, state, persist, updateCount, getPromptTA, openSettings }) {
  // Grab existing children (header row + textarea) — restructure the interior.
  const [, existingTA] = Array.from(promptExpandEl.children);
  promptExpandEl.removeChild(existingTA);

  const contentWrap = document.createElement("div");
  Object.assign(contentWrap.style, { flex: "1", display: "flex", flexDirection: "column", gap: "8px", minHeight: "0" });

  // ── Top row: image drop/URL (left) + backend summary (right) ────────────
  const topRow = document.createElement("div");
  Object.assign(topRow.style, { display: "flex", gap: "10px", flexShrink: "0" });

  const imgCol = document.createElement("div");
  Object.assign(imgCol.style, { display: "flex", flexDirection: "column", gap: "4px", width: "220px", flexShrink: "0" });

  const imgDropZone = document.createElement("div");
  Object.assign(imgDropZone.style, {
    border: "2px dashed #555", borderRadius: "6px", padding: "6px",
    textAlign: "center", cursor: "pointer", color: "#777", fontSize: "10px",
    background: "#0d0d0d", height: "64px", display: "flex",
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
    imgDropZone.style.border = "2px dashed #555";
    syncButtons();
  });
  imgDropZone.appendChild(fileInput);
  imgDropZone.appendChild(imgPreview);
  imgDropZone.appendChild(imgClearBtn);
  imgDropZone.addEventListener("click", (e) => { if (e.target !== imgClearBtn) fileInput.click(); });
  imgDropZone.addEventListener("dragover", e => { e.preventDefault(); imgDropZone.style.borderColor = "#7eff7e"; });
  imgDropZone.addEventListener("dragleave", () => { imgDropZone.style.borderColor = "#555"; });
  imgDropZone.addEventListener("drop", e => {
    e.preventDefault(); imgDropZone.style.borderColor = "#555";
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
        imgDropZone.style.border = "2px solid #3a7a3a";
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

  const urlRow = document.createElement("div");
  Object.assign(urlRow.style, { display: "flex", gap: "4px" });
  const urlInput = document.createElement("input");
  urlInput.type = "text"; urlInput.placeholder = t("llm_url_placeholder");
  Object.assign(urlInput.style, {
    flex: "1", background: "#1a1a1a", color: "#ddd", border: "1px solid #444",
    borderRadius: "4px", padding: "3px 6px", fontSize: "10px", minWidth: 0,
  });
  const btnDl = document.createElement("button");
  btnDl.textContent = t("llm_btn_download");
  Object.assign(btnDl.style, {
    background: "#1a1e3a", color: "#7e9eff", border: "1px solid #3a4a7a",
    borderRadius: "4px", padding: "3px 8px", cursor: "pointer", fontSize: "10px", whiteSpace: "nowrap",
  });
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

  imgCol.appendChild(imgDropZone);
  imgCol.appendChild(urlRow);

  // ── Backend summary + settings shortcut ──────────────────────────────────
  const summaryCol = document.createElement("div");
  Object.assign(summaryCol.style, {
    flex: "1", display: "flex", flexDirection: "column", gap: "4px",
    border: "1px solid #333", borderRadius: "6px", padding: "8px", background: "#141414",
  });
  const sumWrite = document.createElement("div");
  const sumEnhance = document.createElement("div");
  for (const el of [sumWrite, sumEnhance]) Object.assign(el.style, { color: "#aaa", fontSize: "11px" });
  const settingsBtn = document.createElement("button");
  settingsBtn.type = "button";
  settingsBtn.textContent = "⚙ " + t("llm_settings_btn");
  Object.assign(settingsBtn.style, {
    marginTop: "auto", background: "#333", color: "#ddd", border: "1px solid #555",
    borderRadius: "5px", padding: "5px 8px", cursor: "pointer", fontSize: "11px", alignSelf: "flex-start",
  });
  settingsBtn.addEventListener("click", () => openSettings?.());
  summaryCol.appendChild(sumWrite);
  summaryCol.appendChild(sumEnhance);
  summaryCol.appendChild(settingsBtn);

  function refreshSummary() {
    const s = getLLMSummary();
    sumWrite.textContent = "🖼 " + t("llm_tab_i2p") + ": " + s.write;
    sumEnhance.textContent = "✨ " + t("llm_tab_enhance") + ": " + s.enhance;
  }

  topRow.appendChild(imgCol);
  topRow.appendChild(summaryCol);

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

  // ── Action buttons ────────────────────────────────────────────────────────
  const actionRow = document.createElement("div");
  Object.assign(actionRow.style, { display: "flex", gap: "8px", flexShrink: "0" });

  const btnWrite = document.createElement("button");
  btnWrite.type = "button"; btnWrite.textContent = "🖼 " + t("llm_btn_analyze_write");
  Object.assign(btnWrite.style, {
    flex: "1", background: "#1a1e4a", color: "#7e9eff", border: "1px solid #3a4a7a",
    borderRadius: "5px", padding: "8px", cursor: "pointer", fontSize: "12px", fontWeight: "700",
  });

  const btnEnhance = document.createElement("button");
  btnEnhance.type = "button"; btnEnhance.textContent = t("llm_btn_enhance");
  Object.assign(btnEnhance.style, {
    flex: "1", background: "#1e4a1e", color: "#7eff7e", border: "1px solid #3a7a3a",
    borderRadius: "5px", padding: "8px", cursor: "pointer", fontSize: "12px", fontWeight: "700",
  });

  actionRow.appendChild(btnWrite); actionRow.appendChild(btnEnhance);

  function syncButtons() {
    btnWrite.disabled = !_imageB64;
    btnWrite.style.opacity = _imageB64 ? "1" : "0.45";
    const hasText = existingTA.value.trim().length > 0;
    btnEnhance.disabled = !hasText;
    btnEnhance.style.opacity = hasText ? "1" : "0.45";
  }
  existingTA.addEventListener("input", syncButtons);

  // ── APPLY (applies WITHOUT closing — the popup header's own ✓ applies+closes) ──
  const applyBtn = document.createElement("button");
  applyBtn.type = "button"; applyBtn.textContent = t("llm_btn_apply");
  Object.assign(applyBtn.style, {
    flexShrink: "0", background: "#2a6", color: "#fff", border: "none",
    borderRadius: "5px", padding: "9px", cursor: "pointer", fontSize: "13px", fontWeight: "700",
  });
  function applyNow() {
    const text = existingTA.value;
    setModePrompt(state.mode, text);
    const pta = getPromptTA?.(); if (pta) pta.value = text;
    pxTA.value = text;
    if (persist) persist();
    if (updateCount) updateCount();
  }
  applyBtn.addEventListener("click", applyNow);

  contentWrap.appendChild(topRow);
  contentWrap.appendChild(taWrap);
  contentWrap.appendChild(actionRow);
  contentWrap.appendChild(applyBtn);
  promptExpandEl.appendChild(contentWrap);

  // ── Image → Prompt Write: sends the image + (if any) the text already in
  //    the box as context, and asks for ONE integrated rewrite — never a
  //    plain append. ──────────────────────────────────────────────────────
  async function doWrite() {
    if (!_imageB64) return;
    const llm = loadLLMSettings();
    const existingText = existingTA.value.trim();
    const contextInstruction = existingText
      ? `The user has already written this description — use it as context and produce ONE integrated, polished prompt that incorporates it with what you see in the image. Rewrite it as a single cohesive prompt; do not simply append your description after it.\n\nExisting text:\n${existingText}`
      : "";
    btnWrite.disabled = true; setBusy(true, t("llm_busy_write"));
    try {
      const r = await fetch("/tj_studio_one/llm/image_to_prompt", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_b64: _imageB64,
          backend: llm.backend_vision || llm.backend || "local",
          or_model: llm.or_model_vision || llm.or_model,
          gguf_model: llm.gguf_model,
          mmproj_file: llm.mmproj_file,
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
      syncButtons();
    } catch (e) { alert(t("llm_err_prefix") + e.message); }
    finally { setBusy(false); syncButtons(); }
  }
  btnWrite.addEventListener("click", doWrite);

  // ── Prompt Enhance: dumbs the current text into a better prompt, in place ──
  async function doEnhance() {
    const prompt = existingTA.value.trim();
    if (!prompt) return;
    const llm = loadLLMSettings();
    btnEnhance.disabled = true; setBusy(true, t("llm_busy_enhance"));
    try {
      const r = await fetch("/tj_studio_one/llm/enhance", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          backend: llm.backend_text || llm.backend || "local",
          or_model: llm.or_model_text || llm.or_model,
          gguf_model: llm.gguf_model,
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
      syncButtons();
    } catch (e) { alert(t("llm_err_prefix") + e.message); }
    finally { setBusy(false); syncButtons(); }
  }
  btnEnhance.addEventListener("click", doEnhance);

  // ── Show hook ─────────────────────────────────────────────────────────────
  promptExpandEl._tj_llm_onshow = () => {
    existingTA.value = getModePrompt(state.mode);
    refreshSummary();
    syncButtons();
  };
}

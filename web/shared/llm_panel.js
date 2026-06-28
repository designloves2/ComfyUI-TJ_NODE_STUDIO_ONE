/**
 * Prompt Studio LLM panel — shared across all 4 nodes.
 * Adds "✨ Enhance" and "🖼 Image → Prompt" tabs to the prompt expand overlay.
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
let _tjNodeAvailable = null; // null=unknown, true=installed, false=not installed

async function fetchModels() {
  if (_modelCache) return _modelCache;
  try {
    const r = await fetch("/tj_studio_one/llm/models");
    const d = await r.json();
    if (d.ok) { _tjNodeAvailable = true; _modelCache = d; return d; }
    _tjNodeAvailable = false;
  } catch { _tjNodeAvailable = false; }
  return { gguf: [], mmproj: [], vision_tasks: [], _notInstalled: true };
}

// ── Not-installed banner with install button ─────────────────────────────────
function makeNotInstalledBanner(onInstalled) {
  const wrap = document.createElement("div");
  Object.assign(wrap.style, {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    gap: "12px", padding: "24px", textAlign: "center", flex: "1",
  });

  const icon = document.createElement("div");
  icon.textContent = "🧩";
  icon.style.fontSize = "32px";

  const title = document.createElement("div");
  title.textContent = t("llm_not_installed_title");
  Object.assign(title.style, { color: "#ddd", fontSize: "14px", fontWeight: "700" });

  const desc = document.createElement("div");
  desc.textContent = t("llm_not_installed_desc");
  Object.assign(desc.style, { color: "#888", fontSize: "11px", lineHeight: "1.6", whiteSpace: "pre-line" });

  const link = document.createElement("a");
  link.href = TJ_NODE_GITHUB; link.target = "_blank"; link.rel = "noopener";
  link.textContent = t("llm_github_link");
  Object.assign(link.style, { color: "#7e9eff", fontSize: "11px", textDecoration: "underline" });

  const btnInstall = document.createElement("button");
  btnInstall.textContent = t("llm_btn_install");
  Object.assign(btnInstall.style, {
    background: "#1e4a1e", color: "#7eff7e", border: "1px solid #3a7a3a",
    borderRadius: "6px", padding: "10px 24px", cursor: "pointer",
    fontSize: "13px", fontWeight: "700", marginTop: "4px",
  });

  const statusEl = document.createElement("div");
  Object.assign(statusEl.style, { color: "#aaa", fontSize: "11px", minHeight: "18px" });

  btnInstall.onclick = async () => {
    btnInstall.disabled = true;
    btnInstall.textContent = t("llm_installing");
    statusEl.textContent = t("llm_install_progress");
    try {
      const r = await fetch("/tj_studio_one/llm/install_tj_node", { method: "POST" });
      const d = await r.json();
      if (d.ok) {
        statusEl.textContent = "✅ " + t("llm_install_done");
        btnInstall.textContent = t("llm_install_done");
        btnInstall.style.background = "#1a3a2a";
        _modelCache = null; _tjNodeAvailable = null;
        if (onInstalled) onInstalled();
      } else {
        statusEl.textContent = "❌ " + (d.error || "error");
        btnInstall.disabled = false;
        btnInstall.textContent = t("llm_btn_retry");
      }
    } catch (e) {
      statusEl.textContent = "❌ " + t("llm_err_network") + e.message;
      btnInstall.disabled = false;
      btnInstall.textContent = t("llm_btn_retry");
    }
  };

  wrap.appendChild(icon);
  wrap.appendChild(title);
  wrap.appendChild(desc);
  wrap.appendChild(link);
  wrap.appendChild(btnInstall);
  wrap.appendChild(statusEl);
  return wrap;
}

// ── Simple select helper ─────────────────────────────────────────────────────
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

// ── LLM loading overlay (ring animation over right panel) ────────────────────
let _llmStyleInjected = false;
function _injectLLMStyle() {
  if (_llmStyleInjected) return;
  _llmStyleInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    @keyframes tj-llm-spin {
      0%   { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .tj-llm-ring {
      width: 52px; height: 52px; border-radius: 50%;
      border: 5px solid rgba(255,255,255,0.15);
      border-top-color: #7eff7e;
      animation: tj-llm-spin 0.9s linear infinite;
    }
  `;
  document.head.appendChild(style);
}

function _makeLLMLoadingOverlay() {
  _injectLLMStyle();
  const ov = document.createElement("div");
  Object.assign(ov.style, {
    position: "absolute", inset: "0",
    background: "rgba(0,0,0,0.5)",
    display: "none",          // shown/hidden by caller
    flexDirection: "column",
    alignItems: "center", justifyContent: "center",
    gap: "14px", zIndex: "10",
    pointerEvents: "all",
    backdropFilter: "blur(1px)",
  });
  const ring = document.createElement("div");
  ring.className = "tj-llm-ring";
  const label = document.createElement("div");
  label.textContent = t("llm_analyzing_overlay");
  Object.assign(label.style, {
    color: "#ccc", fontSize: "12px", letterSpacing: "0.05em",
  });
  ov.appendChild(ring);
  ov.appendChild(label);
  return ov;
}

// ── Enhance result popup ─────────────────────────────────────────────────────
function showEnhanceResult({ resultText, onReplace, C }) {
  const overlay = document.createElement("div");
  Object.assign(overlay.style, {
    position: "fixed", inset: "0", zIndex: "2147483647",
    background: "rgba(0,0,0,0.85)", display: "flex",
    alignItems: "center", justifyContent: "center",
  });

  const box = document.createElement("div");
  Object.assign(box.style, {
    background: "#1a1a1a", border: "1px solid #555", borderRadius: "10px",
    padding: "16px", width: "520px", maxWidth: "90vw",
    display: "flex", flexDirection: "column", gap: "10px",
  });

  const title = document.createElement("div");
  title.textContent = t("llm_result_title");
  Object.assign(title.style, { color: "#fff", fontSize: "13px", fontWeight: "700" });

  const ta = document.createElement("textarea");
  ta.value = resultText;
  Object.assign(ta.style, {
    background: "#111", color: "#eee", border: "1px solid #444", borderRadius: "6px",
    padding: "8px", fontSize: "12px", resize: "vertical", minHeight: "140px",
    fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box",
  });

  const btns = document.createElement("div");
  Object.assign(btns.style, { display: "flex", gap: "8px", justifyContent: "flex-end" });

  const btnReplace = document.createElement("button");
  btnReplace.textContent = t("llm_btn_replace");
  Object.assign(btnReplace.style, {
    background: "#2a6", color: "#fff", border: "none", borderRadius: "5px",
    padding: "6px 14px", cursor: "pointer", fontSize: "12px", fontWeight: "600",
  });
  btnReplace.onclick = () => { onReplace(ta.value); document.body.removeChild(overlay); };

  const btnClose = document.createElement("button");
  btnClose.textContent = t("llm_btn_close");
  Object.assign(btnClose.style, {
    background: "#444", color: "#ddd", border: "none", borderRadius: "5px",
    padding: "6px 14px", cursor: "pointer", fontSize: "12px",
  });
  btnClose.onclick = () => document.body.removeChild(overlay);

  btns.appendChild(btnReplace); btns.appendChild(btnClose);
  box.appendChild(title); box.appendChild(ta); box.appendChild(btns);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

// ── Main export ──────────────────────────────────────────────────────────────
export function attachLLMPanel({ promptExpandEl, pxTA, getModePrompt, setModePrompt, state, persist, updateCount, C, getPromptTA }) {
  // ── Persist LLM settings across sessions ──────────────────────────────────
  const cfg = loadLLMSettings();
  const llm = {
    gguf_model:         cfg.gguf_model         || "",
    mmproj_file:        cfg.mmproj_file         || "none",
    vision_task:        cfg.vision_task         || "Caption (plain description)",
    model_format:       cfg.model_format        || "Universal Natural Language",
    aesthetic:          cfg.aesthetic           || "None (no aesthetic injection)",
    extra_instructions: cfg.extra_instructions  || "",
    custom_instruction: cfg.custom_instruction  || "",
    n_gpu_layers:       cfg.n_gpu_layers        ?? -1,
    n_ctx:              cfg.n_ctx               ?? 4096,
    max_tokens:         cfg.max_tokens          ?? 1000,
    temperature:        cfg.temperature         ?? 0.7,
    seed:               cfg.seed                ?? 0,
  };
  function saveLLM() { saveLLMSettings(llm); }

  // ── Restructure existing expand overlay ───────────────────────────────────
  // promptExpandEl currently: flex column, has pxHdr child + pxTA child
  // We'll replace the interior with: tabBar + content area

  // Grab existing children (header row with title + buttons, and the textarea)
  const [existingHdr, existingTA] = Array.from(promptExpandEl.children);

  // Remove the textarea from the overlay (we'll put it inside the new layout)
  promptExpandEl.removeChild(existingTA);

  // ── Tab bar ──────────────────────────────────────────────────────────────
  const tabBar = document.createElement("div");
  Object.assign(tabBar.style, {
    display: "flex", gap: "4px", flexShrink: "0", marginTop: "6px",
  });

  function makeTab(label) {
    const t = document.createElement("button");
    t.textContent = label; t.type = "button";
    Object.assign(t.style, {
      background: "#333", color: "#aaa", border: "1px solid #555",
      borderRadius: "5px 5px 0 0", padding: "5px 12px", fontSize: "11px",
      cursor: "pointer", fontWeight: "600",
    });
    return t;
  }

  const tabEdit = makeTab(t("llm_tab_edit"));
  const tabEnhance = makeTab(t("llm_tab_enhance"));
  const tabI2P = makeTab(t("llm_tab_i2p"));
  tabBar.appendChild(tabEdit);
  tabBar.appendChild(tabEnhance);
  tabBar.appendChild(tabI2P);

  function setActiveTab(btn) {
    for (const b of [tabEdit, tabEnhance, tabI2P]) {
      b.style.background = b === btn ? "#1e3a1e" : "#333";
      b.style.color = b === btn ? "#7eff7e" : "#aaa";
      b.style.borderBottomColor = b === btn ? "#1e3a1e" : "#555";
    }
  }

  // ── Content wrapper ──────────────────────────────────────────────────────
  const contentWrap = document.createElement("div");
  Object.assign(contentWrap.style, {
    flex: "1", display: "flex", minHeight: "0",
    border: "1px solid #555", borderRadius: "0 5px 5px 5px",
    overflow: "hidden",
  });

  // ── PANEL 1: Edit (existing textarea) ────────────────────────────────────
  existingTA.style.borderRadius = "0";
  existingTA.style.border = "none";
  existingTA.style.flex = "1";
  const panelEdit = document.createElement("div");
  Object.assign(panelEdit.style, { display: "flex", flex: "1" });
  panelEdit.appendChild(existingTA);

  // ── PANEL 2: Enhance ─────────────────────────────────────────────────────
  const panelEnhance = document.createElement("div");
  Object.assign(panelEnhance.style, {
    display: "none", flex: "1",
    flexDirection: "row", gap: "0",
  });

  // Left settings column
  const enhLeft = document.createElement("div");
  Object.assign(enhLeft.style, {
    width: "200px", flexShrink: "0", background: "#111", padding: "10px",
    display: "flex", flexDirection: "column", gap: "8px", overflowY: "auto",
    borderRight: "1px solid #333",
  });

  // GGUF model select (populated after fetch)
  const ggufSelE = makeSelect([llm.gguf_model || "Loading…"], llm.gguf_model, v => { llm.gguf_model = v; saveLLM(); });
  enhLeft.appendChild(labelRow(t("llm_lbl_gguf"), ggufSelE));

  const gpuLayersE = makeNumberInput(llm.n_gpu_layers, -1, 999, 1, v => { llm.n_gpu_layers = v; saveLLM(); });
  enhLeft.appendChild(labelRow(t("llm_lbl_gpu_layers"), gpuLayersE));

  const nCtxE = makeNumberInput(llm.n_ctx, 512, 32768, 512, v => { llm.n_ctx = v; saveLLM(); });
  enhLeft.appendChild(labelRow(t("llm_lbl_ctx"), nCtxE));

  const maxTokE = makeNumberInput(llm.max_tokens, 50, 4096, 50, v => { llm.max_tokens = v; saveLLM(); });
  enhLeft.appendChild(labelRow(t("llm_lbl_max_tokens"), maxTokE));

  const tempE = makeNumberInput(llm.temperature, 0, 2, 0.05, v => { llm.temperature = v; saveLLM(); });
  enhLeft.appendChild(labelRow(t("llm_lbl_temperature"), tempE));

  const seedE = makeNumberInput(llm.seed, 0, 999999999, 1, v => { llm.seed = v; saveLLM(); });
  enhLeft.appendChild(labelRow(t("llm_lbl_seed"), seedE));

  const modelFmtSelE = makeSelect(["Universal Natural Language"], llm.model_format, v => { llm.model_format = v; saveLLM(); });
  enhLeft.appendChild(labelRow(t("llm_lbl_model_format"), modelFmtSelE));

  const aestheticSelE = makeSelect(["None (no aesthetic injection)"], llm.aesthetic, v => { llm.aesthetic = v; saveLLM(); });
  enhLeft.appendChild(labelRow(t("llm_lbl_aesthetic"), aestheticSelE));

  const extraInstrTA = document.createElement("textarea");
  extraInstrTA.value = llm.extra_instructions;
  extraInstrTA.rows = 3;
  Object.assign(extraInstrTA.style, {
    background: "#1a1a1a", color: "#ddd", border: "1px solid #444",
    borderRadius: "4px", padding: "4px 5px", fontSize: "11px", width: "100%",
    boxSizing: "border-box", resize: "vertical", fontFamily: "inherit",
  });
  extraInstrTA.addEventListener("change", () => { llm.extra_instructions = extraInstrTA.value; saveLLM(); });
  extraInstrTA.addEventListener("input",  () => { llm.extra_instructions = extraInstrTA.value; });
  enhLeft.appendChild(labelRow(t("llm_lbl_extra_instructions"), extraInstrTA));

  // Spacer
  enhLeft.appendChild(document.createElement("div")).style.flex = "1";

  const btnEnhance = document.createElement("button");
  btnEnhance.textContent = t("llm_btn_enhance");
  Object.assign(btnEnhance.style, {
    background: "#1e4a1e", color: "#7eff7e", border: "1px solid #3a7a3a",
    borderRadius: "5px", padding: "8px", cursor: "pointer", fontSize: "12px", fontWeight: "700",
  });
  enhLeft.appendChild(btnEnhance);

  // Right: enhanced textarea preview (readonly — for live viewing while editing)
  const enhRight = document.createElement("div");
  Object.assign(enhRight.style, { flex: "1", display: "flex", flexDirection: "column", position: "relative" });
  const enhTA = document.createElement("textarea");
  enhTA.placeholder = t("llm_enhance_placeholder");
  Object.assign(enhTA.style, {
    flex: "1", background: "#111", color: "#eee", border: "none",
    padding: "10px", fontSize: "13px", fontFamily: "inherit",
    resize: "none", outline: "none",
  });
  const enhLoadingOverlay = _makeLLMLoadingOverlay();
  enhRight.appendChild(enhTA);
  enhRight.appendChild(enhLoadingOverlay);

  panelEnhance.appendChild(enhLeft);
  panelEnhance.appendChild(enhRight);

  btnEnhance.onclick = async () => {
    const prompt = enhTA.value.trim();
    if (!prompt) { alert(t("llm_err_no_prompt")); return; }
    btnEnhance.textContent = t("llm_btn_enhancing");
    btnEnhance.disabled = true;
    enhLoadingOverlay.style.display = "flex";
    try {
      const r = await fetch("/tj_studio_one/llm/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          gguf_model:         llm.gguf_model,
          n_gpu_layers:       llm.n_gpu_layers,
          n_ctx:              llm.n_ctx,
          max_tokens:         llm.max_tokens,
          temperature:        llm.temperature,
          seed:               llm.seed,
          model_format:       llm.model_format,
          aesthetic:          llm.aesthetic,
          extra_instructions: llm.extra_instructions,
        }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || "error");
      showEnhanceResult({
        resultText: d.result,
        onReplace: (text) => {
          setModePrompt(state.mode, text);
          const _pta = getPromptTA?.(); if (_pta) _pta.value = text;
          pxTA.value = text;
          enhTA.value = text;
          existingTA.value = text;
          if (persist) persist();
          if (updateCount) updateCount();
        },
      });
    } catch (e) {
      alert(t("llm_err_prefix") + e.message);
    } finally {
      enhLoadingOverlay.style.display = "none";
      btnEnhance.textContent = t("llm_btn_enhance");
      btnEnhance.disabled = false;
    }
  };

  // ── PANEL 3: Image → Prompt ───────────────────────────────────────────────
  const panelI2P = document.createElement("div");
  Object.assign(panelI2P.style, {
    display: "none", flex: "1", flexDirection: "row",
  });

  // Left settings
  const i2pLeft = document.createElement("div");
  Object.assign(i2pLeft.style, {
    width: "200px", flexShrink: "0", background: "#111", padding: "10px",
    display: "flex", flexDirection: "column", gap: "8px", overflowY: "auto",
    borderRight: "1px solid #333",
  });

  // Image drop zone
  const imgDropZone = document.createElement("div");
  Object.assign(imgDropZone.style, {
    border: "2px dashed #555", borderRadius: "6px", padding: "10px",
    textAlign: "center", cursor: "pointer", color: "#777", fontSize: "11px",
    background: "#0d0d0d", minHeight: "80px", display: "flex",
    alignItems: "center", justifyContent: "center", flexDirection: "column",
  });
  imgDropZone.textContent = t("llm_img_drop");
  const fileInput = document.createElement("input");
  fileInput.type = "file"; fileInput.accept = "image/*"; fileInput.style.display = "none";
  let _i2pImageB64 = null;
  const imgPreview = document.createElement("img");
  Object.assign(imgPreview.style, {
    maxWidth: "100%", maxHeight: "80px", display: "none",
    borderRadius: "4px", marginTop: "4px",
  });

  imgDropZone.appendChild(fileInput);
  imgDropZone.appendChild(imgPreview);
  imgDropZone.addEventListener("click", () => fileInput.click());
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
    // src: data URL string. Resize so total pixels ≤ 1MP, store as JPEG 100%.
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        let w = img.naturalWidth, h = img.naturalHeight;
        const mp = w * h;
        if (mp > MAX_IMG_MP) {
          const scale = Math.sqrt(MAX_IMG_MP / mp);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        const resized = canvas.toDataURL("image/jpeg", 1.0);
        _i2pImageB64 = resized;
        imgPreview.src = resized;
        imgPreview.style.display = "block";
        imgDropZone.style.border = "2px solid #3a7a3a";
        resolve(resized);
      };
      img.src = src;
    });
  }

  function loadImageFile(file) {
    const reader = new FileReader();
    reader.onload = ev => { resizeAndSetImage(ev.target.result); };
    reader.readAsDataURL(file);
  }

  // URL download row
  const urlRow = document.createElement("div");
  Object.assign(urlRow.style, { display: "flex", gap: "4px", alignItems: "center", width: "100%" });
  const urlInput = document.createElement("input");
  urlInput.type = "text";
  urlInput.placeholder = t("llm_url_placeholder");
  Object.assign(urlInput.style, {
    flex: "1", background: "#1a1a1a", color: "#ddd", border: "1px solid #444",
    borderRadius: "4px", padding: "4px 6px", fontSize: "11px", minWidth: 0,
  });
  const btnDl = document.createElement("button");
  btnDl.textContent = t("llm_btn_download");
  Object.assign(btnDl.style, {
    background: "#1a1e3a", color: "#7e9eff", border: "1px solid #3a4a7a",
    borderRadius: "4px", padding: "4px 8px", cursor: "pointer", fontSize: "11px",
    whiteSpace: "nowrap", flexShrink: "0",
  });
  btnDl.addEventListener("click", async () => {
    const url = urlInput.value.trim();
    if (!url) { alert(t("llm_err_no_url")); return; }
    btnDl.textContent = t("llm_btn_downloading");
    btnDl.disabled = true;
    try {
      const resp = await fetch("/tj_studio_one/llm/download_image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const d = await resp.json();
      if (!d.ok) throw new Error(d.error || "unknown error");
      await resizeAndSetImage(d.b64);
    } catch (e) {
      alert(t("llm_err_download") + e.message);
    } finally {
      btnDl.textContent = t("llm_btn_download");
      btnDl.disabled = false;
    }
  });
  urlRow.appendChild(urlInput);
  urlRow.appendChild(btnDl);

  const imgWrap = document.createElement("div");
  Object.assign(imgWrap.style, { display: "flex", flexDirection: "column", gap: "4px", width: "100%" });
  imgWrap.appendChild(urlRow);
  imgWrap.appendChild(imgDropZone);

  const sizeNote = document.createElement("div");
  sizeNote.textContent = t("llm_img_size_note");
  Object.assign(sizeNote.style, { fontSize: "10px", color: "#666", lineHeight: "1.3" });
  imgWrap.appendChild(sizeNote);

  i2pLeft.appendChild(labelRow(t("llm_lbl_image"), imgWrap));

  const ggufSelI = makeSelect([llm.gguf_model || "Loading…"], llm.gguf_model, v => { llm.gguf_model = v; saveLLM(); ggufSelE.value = v; });
  i2pLeft.appendChild(labelRow(t("llm_lbl_gguf"), ggufSelI));

  const mmprojSel = makeSelect([llm.mmproj_file || "none"], llm.mmproj_file, v => { llm.mmproj_file = v; saveLLM(); });
  i2pLeft.appendChild(labelRow(t("llm_lbl_mmproj"), mmprojSel));

  const vtSel = makeSelect(["Caption (plain description)"], llm.vision_task, v => { llm.vision_task = v; saveLLM(); });
  i2pLeft.appendChild(labelRow(t("llm_lbl_vision_task"), vtSel));

  const modelFmtSelI = makeSelect(["Universal Natural Language"], llm.model_format, v => { llm.model_format = v; saveLLM(); modelFmtSelE.value = v; });
  i2pLeft.appendChild(labelRow(t("llm_lbl_model_format"), modelFmtSelI));

  const aestheticSelI = makeSelect(["None (no aesthetic injection)"], llm.aesthetic, v => { llm.aesthetic = v; saveLLM(); aestheticSelE.value = v; });
  i2pLeft.appendChild(labelRow(t("llm_lbl_aesthetic"), aestheticSelI));

  const customInstrTA = document.createElement("textarea");
  customInstrTA.value = llm.custom_instruction;
  customInstrTA.rows = 3;
  Object.assign(customInstrTA.style, {
    background: "#1a1a1a", color: "#ddd", border: "1px solid #444",
    borderRadius: "4px", padding: "4px 5px", fontSize: "11px", width: "100%",
    boxSizing: "border-box", resize: "vertical", fontFamily: "inherit",
  });
  customInstrTA.addEventListener("change", () => { llm.custom_instruction = customInstrTA.value; saveLLM(); });
  customInstrTA.addEventListener("input",  () => { llm.custom_instruction = customInstrTA.value; });
  i2pLeft.appendChild(labelRow(t("llm_lbl_custom_instruction"), customInstrTA));

  const gpuLayersI = makeNumberInput(llm.n_gpu_layers, -1, 999, 1, v => { llm.n_gpu_layers = v; saveLLM(); gpuLayersE.value = v; });
  i2pLeft.appendChild(labelRow(t("llm_lbl_gpu_layers"), gpuLayersI));

  const maxTokI = makeNumberInput(llm.max_tokens, 50, 4096, 50, v => { llm.max_tokens = v; saveLLM(); maxTokE.value = v; });
  i2pLeft.appendChild(labelRow(t("llm_lbl_max_tokens"), maxTokI));

  const tempI = makeNumberInput(llm.temperature, 0, 2, 0.05, v => { llm.temperature = v; saveLLM(); tempE.value = v; });
  i2pLeft.appendChild(labelRow(t("llm_lbl_temperature"), tempI));

  i2pLeft.appendChild(document.createElement("div")).style.flex = "1";

  const btnI2P = document.createElement("button");
  btnI2P.textContent = t("llm_btn_analyze");
  Object.assign(btnI2P.style, {
    background: "#1a1e4a", color: "#7e9eff", border: "1px solid #3a4a7a",
    borderRadius: "5px", padding: "8px", cursor: "pointer", fontSize: "12px", fontWeight: "700",
  });
  i2pLeft.appendChild(btnI2P);

  // Right: result area
  const i2pRight = document.createElement("div");
  Object.assign(i2pRight.style, { flex: "1", display: "flex", flexDirection: "column", gap: "0", position: "relative" });

  const i2pResultTA = document.createElement("textarea");
  i2pResultTA.placeholder = t("llm_i2p_placeholder");
  Object.assign(i2pResultTA.style, {
    flex: "1", background: "#111", color: "#eee", border: "none",
    padding: "10px", fontSize: "13px", fontFamily: "inherit",
    resize: "none", outline: "none",
  });
  const i2pLoadingOverlay = _makeLLMLoadingOverlay();

  const i2pSendBar = document.createElement("div");
  Object.assign(i2pSendBar.style, {
    display: "flex", gap: "8px", padding: "8px", background: "#0d0d0d",
    borderTop: "1px solid #333", flexShrink: "0", alignItems: "center",
  });
  const i2pSendLabel = document.createElement("div");
  i2pSendLabel.textContent = t("llm_send_label");
  Object.assign(i2pSendLabel.style, { color: "#888", fontSize: "11px", flex: "1" });

  const btnI2PSend = document.createElement("button");
  btnI2PSend.textContent = t("llm_btn_send");
  Object.assign(btnI2PSend.style, {
    background: "#2a6", color: "#fff", border: "none", borderRadius: "5px",
    padding: "6px 14px", cursor: "pointer", fontSize: "12px", fontWeight: "600",
  });
  btnI2PSend.onclick = () => {
    const text = i2pResultTA.value.trim();
    if (!text) return;
    setModePrompt(state.mode, text);
    const _pta = getPromptTA?.(); if (_pta) _pta.value = text;
    pxTA.value = text;
    existingTA.value = text;
    if (persist) persist();
    if (updateCount) updateCount();
    promptExpandEl.style.display = "none";
  };

  i2pSendBar.appendChild(i2pSendLabel);
  i2pSendBar.appendChild(btnI2PSend);
  i2pRight.appendChild(i2pResultTA);
  i2pRight.appendChild(i2pLoadingOverlay);
  i2pRight.appendChild(i2pSendBar);
  panelI2P.appendChild(i2pLeft);
  panelI2P.appendChild(i2pRight);

  btnI2P.onclick = async () => {
    if (!_i2pImageB64) { alert(t("llm_err_no_image")); return; }
    btnI2P.textContent = t("llm_btn_analyzing");
    btnI2P.disabled = true;
    i2pLoadingOverlay.style.display = "flex";
    try {
      const r = await fetch("/tj_studio_one/llm/image_to_prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_b64:          _i2pImageB64,
          gguf_model:         llm.gguf_model,
          mmproj_file:        llm.mmproj_file,
          vision_task:        llm.vision_task,
          model_format:       llm.model_format,
          aesthetic:          llm.aesthetic,
          custom_instruction: llm.custom_instruction,
          n_gpu_layers:       llm.n_gpu_layers,
          n_ctx:              llm.n_ctx,
          max_tokens:         llm.max_tokens,
          temperature:        llm.temperature,
          seed:               llm.seed,
        }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || "error");
      i2pResultTA.value = d.result;
    } catch (e) {
      alert(t("llm_err_prefix") + e.message);
    } finally {
      i2pLoadingOverlay.style.display = "none";
      btnI2P.textContent = t("llm_btn_analyze");
      btnI2P.disabled = false;
    }
  };

  // ── Assemble layout ──────────────────────────────────────────────────────
  contentWrap.appendChild(panelEdit);
  contentWrap.appendChild(panelEnhance);
  contentWrap.appendChild(panelI2P);
  promptExpandEl.appendChild(tabBar);
  promptExpandEl.appendChild(contentWrap);

  // ── Tab switching ─────────────────────────────────────────────────────────
  function showPanel(tab) {
    setActiveTab(tab);
    panelEdit.style.display    = tab === tabEdit    ? "flex" : "none";
    panelEnhance.style.display = tab === tabEnhance ? "flex" : "none";
    panelI2P.style.display     = tab === tabI2P     ? "flex" : "none";
    // Sync enhance textarea with current prompt when switching to Enhance tab
    if (tab === tabEnhance) { enhTA.value = getModePrompt(state.mode); }
  }

  tabEdit.onclick    = () => showPanel(tabEdit);
  tabEnhance.onclick = () => showPanel(tabEnhance);
  tabI2P.onclick     = () => showPanel(tabI2P);
  showPanel(tabEdit);

  // ── Load model lists on first open ───────────────────────────────────────
  let _modelsLoaded = false;

  function _showNotInstalledInPanel(panel) {
    panel.innerHTML = "";
    panel.appendChild(makeNotInstalledBanner(() => {
      // After install button success, allow re-checking on next open
      _modelsLoaded = false;
    }));
  }

  function populateSelects(d) {
    if (d.gguf?.length) {
      for (const sel of [ggufSelE, ggufSelI]) {
        sel.innerHTML = "";
        for (const m of d.gguf) {
          const o = document.createElement("option");
          o.value = m; o.textContent = m;
          if (m === llm.gguf_model) o.selected = true;
          sel.appendChild(o);
        }
        if (!llm.gguf_model && d.gguf[0]) {
          llm.gguf_model = d.gguf[0]; saveLLM();
          ggufSelE.value = llm.gguf_model;
          ggufSelI.value = llm.gguf_model;
        }
      }
    }
    if (d.mmproj?.length) {
      mmprojSel.innerHTML = "";
      for (const m of d.mmproj) {
        const o = document.createElement("option");
        o.value = m; o.textContent = m;
        if (m === llm.mmproj_file) o.selected = true;
        mmprojSel.appendChild(o);
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
      for (const sel of [modelFmtSelE, modelFmtSelI]) {
        sel.innerHTML = "";
        for (const v of d.model_formats) {
          const o = document.createElement("option");
          o.value = v; o.textContent = v;
          if (v === llm.model_format) o.selected = true;
          sel.appendChild(o);
        }
      }
    }
    if (d.aesthetics?.length) {
      for (const sel of [aestheticSelE, aestheticSelI]) {
        sel.innerHTML = "";
        for (const v of d.aesthetics) {
          const o = document.createElement("option");
          o.value = v; o.textContent = v;
          if (v === llm.aesthetic) o.selected = true;
          sel.appendChild(o);
        }
      }
    }
  }

  function loadModelsOnce() {
    if (_modelsLoaded) return;
    _modelsLoaded = true;
    fetchModels().then(d => {
      if (d._notInstalled) {
        _showNotInstalledInPanel(panelEnhance);
        _showNotInstalledInPanel(panelI2P);
        return;
      }
      populateSelects(d);
    });
  }

  // Hook into the expand overlay's show — load models when first opened
  const _origShow = promptExpandEl._tj_show_hook;
  promptExpandEl._tj_llm_onshow = () => {
    loadModelsOnce();
    // Always sync edit tab textarea with current prompt
    existingTA.value = getModePrompt(state.mode);
    enhTA.value = getModePrompt(state.mode);
    showPanel(tabEdit);
  };
}

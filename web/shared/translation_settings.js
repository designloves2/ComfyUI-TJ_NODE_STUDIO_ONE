// The "Translation LLM" settings panel for the nodes whose Settings are not built by the H3 node: the same backend / model
// choices as the H3 Settings tab, read from and saved to the one server-side setting (translate_config.js), so a change here
// shows in every node and page at once (the panel re-draws when the server pushes it).
import { getTranslateConfig, loadTranslateConfig, onTranslateConfig, setTranslateConfig } from "./translate_config.js";
import { customLLMControls } from "./custom_llm_controls.js";

let _models = null;
async function localModels() {
  if (_models) return _models;
  try {
    const d = await (await fetch("/tj_studio_one/llm/models")).json();
    _models = { gguf: d.gguf || [], available: !!d.local_available, textEncoders: d.text_encoders || [] };
  } catch { _models = { gguf: [], available: false, textEncoders: [] }; }
  return _models;
}
let _orModels = null;
async function orModels() {
  if (_orModels) return _orModels;
  try { _orModels = (await (await fetch("/music_one/openrouter_models")).json()).models || []; }
  catch { _orModels = []; }
  return _orModels;
}

export function translationSettingsPanel(theme = {}) {
  const T = { bg: "#181818", text: "#dedede", border: "#2a2a2a", muted: "#8a8a8a", warn: "#ffb347", ok: "#7eff7e", err: "#ff6767", brand: "#c8ff3d", ...theme };
  const css = (el, s) => Object.assign(el.style, s);
  const div = (text, s = {}) => { const d = document.createElement("div"); if (text) d.textContent = text; css(d, s); return d; };
  const label = (text) => div(text, { fontSize: "10px", color: T.muted, textTransform: "uppercase", letterSpacing: "0.04em" });
  const col = (kids) => { const d = div("", { display: "flex", flexDirection: "column", gap: "4px" }); kids.forEach(k => d.appendChild(k)); return d; };
  const fieldStyle = { width: "100%", boxSizing: "border-box", background: T.bg, color: T.text, border: `1px solid ${T.border}`, borderRadius: "6px", padding: "6px", fontSize: "12px", fontFamily: "inherit", outline: "none" };
  function select(options, value, onChange) {
    const wrap = div("", { display: "flex", flexDirection: "column", gap: "2px" });
    const search = document.createElement("input");
    search.type = "text"; search.placeholder = "Search…"; css(search, fieldStyle);
    const sel = document.createElement("select"); css(sel, fieldStyle);
    for (const o of options) {
      const opt = document.createElement("option");
      opt.value = typeof o === "string" ? o : o.value; opt.textContent = typeof o === "string" ? o : o.label;
      if (opt.value === value) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener("change", () => onChange(sel.value));
    search.addEventListener("input", () => {
      const q = search.value.toLowerCase().trim();
      [...sel.options].forEach(o => { o.hidden = !!q && !o.text.toLowerCase().includes(q); });
      const cur = [...sel.options].find(o => o.value === sel.value);
      if (cur) cur.hidden = false;
    });
    wrap.append(search, sel);
    return wrap;
  }
  function number(value, onChange, min) {
    const i = document.createElement("input");
    i.type = "number"; i.value = value; i.min = String(min); css(i, fieldStyle);
    i.addEventListener("change", () => { const v = parseFloat(i.value); if (!isNaN(v)) onChange(v); });
    return i;
  }

  const save = (patch) => setTranslateConfig(patch);
  const holder = div("", { display: "flex", flexDirection: "column", gap: "8px" });
  const box = div("", { background: "rgba(255,255,255,0.03)", border: `1px solid ${T.border}`, borderRadius: "8px", padding: "10px" });
  box.appendChild(holder);

  function render() {
    holder.replaceChildren();
    const t = getTranslateConfig();
    const be = document.createElement("select"); css(be, fieldStyle);
    for (const [v, txt] of [["native", "Native (ComfyUI CLIP)"], ["openrouter", "OpenRouter (cloud)"], ["llamagguf", "Llama GGUF (local llama.cpp)"], ["custom", "Connect Custom"]]) {
      const o = document.createElement("option"); o.value = v; o.textContent = txt; if (t.backend === v) o.selected = true; be.appendChild(o);
    }
    be.addEventListener("change", () => save({ backend: be.value }));
    const control = div("");
    holder.append(
      div("Translate — Korean ↔ English (the same for every node)", { fontSize: "11px", fontWeight: "700", color: T.brand }),
      col([label("Backend"), be]),
      control,
      div("Used by the KO / EN button on every prompt field. Changing it here changes it in all nodes at once.", { fontSize: "10px", color: T.muted, lineHeight: "1.5" }),
    );
    if (t.backend === "llamagguf") {
      control.appendChild(div("loading gguf models…", { fontSize: "11px", color: T.muted }));
      localModels().then(d => {
        control.replaceChildren();
        if (!d.available) { control.appendChild(div("⚠ Local GGUF LLM not available — TJ_NODE not installed, or its llm files failed to load.", { fontSize: "10px", color: T.warn, lineHeight: "1.5" })); return; }
        const list = d.gguf.filter(n => !/mmproj/i.test(String(n || "")));
        if (!list.length) list.push("(none found)");
        control.append(
          col([label("GGUF model"), select(list, t.llama_model || list[0], v => save({ llama_model: v }))]),
          col([label("Context length (n_ctx)"), number(t.llama_n_ctx ?? 16384, v => save({ llama_n_ctx: Math.max(512, Math.round(v)) }), 512)]),
          col([label("Max output tokens"), number(t.llama_max_tokens ?? 4096, v => save({ llama_max_tokens: Math.max(256, Math.round(v)) }), 256)]),
        );
        control.style.display = "flex"; control.style.flexDirection = "column"; control.style.gap = "8px";
      });
    } else if (t.backend === "custom") {
      control.appendChild(customLLMControls({
        role: "translate",
        values: { base: t.custom_base, model: t.custom_model, ctx: t.custom_ctx },
        onChange: (p) => save({
          ...("base" in p ? { custom_base: p.base } : {}),
          ...("model" in p ? { custom_model: p.model } : {}),
          ...("ctx" in p ? { custom_ctx: p.ctx } : {}),
        }),
        theme: { bg: T.bg, text: T.text, border: T.border, muted: T.muted, ok: T.ok, warn: T.warn, err: T.err, brand: T.brand },
        noteKeyWhere: "the translate backend",
      }));
    } else if (t.backend === "openrouter") {
      const slot = div("");
      slot.appendChild(div(t.or_model || "loading models…", { fontSize: "12px", color: T.text }));
      orModels().then(ms => {
        if (!ms.length) return;
        slot.replaceChildren(select(["", ...ms].map(m => ({ value: m, label: m || "— choose a model —" })), t.or_model || "", v => save({ or_model: v })));
      });
      control.appendChild(col([label("OpenRouter model (translate)"), slot]));
    } else {
      control.appendChild(div("loading…", { fontSize: "11px", color: T.muted }));
      localModels().then(d => {
        control.replaceChildren(col([label("CLIP checkpoint"), select(["none", ...d.textEncoders.filter(x => x !== "none")], t.native_clip || "none", v => save({ native_clip: v === "none" ? "" : v }))]));
      });
    }
  }
  render();
  loadTranslateConfig();
  const off = onTranslateConfig(() => { if (!box.isConnected) { off(); return; } render(); });
  return box;
}

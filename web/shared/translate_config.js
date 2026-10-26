// translate_config.js — the one Korean <-> English model setting every node shares.
//
// It lives on the server (config_translate.json), not in a node: any node can change it and the server pushes the
// new value to every open page ("tj_translate_config"), so all nodes see the same setting at the same moment.
// Pages that are closed pick it up when they next load. translateLlm() is the `llm(system, user) => text` function
// bilingual.js needs.
import { api } from "../../../scripts/api.js";
import { writeBriefNative } from "../minimax/api_minimax.js";

const DEFAULTS = {
  backend: "native", native_clip: "", or_model: "", llama_model: "",
  llama_n_ctx: 16384, llama_max_tokens: 4096,
  custom_base: "", custom_model: "", custom_ctx: 0,
};

let cfg = { ...DEFAULTS };
let loaded = null;
const listeners = new Set();
const notify = () => listeners.forEach(fn => { try { fn(cfg); } catch (e) { console.warn("[translate] listener:", e); } });

// the server pushes this whenever any node saves the setting
api.addEventListener("tj_translate_config", (ev) => { cfg = { ...DEFAULTS, ...(ev.detail || {}) }; notify(); });

/** The current setting (what the last load or push said). */
export function getTranslateConfig() { return cfg; }

/** Load it from the server once (later calls reuse the first answer). */
export function loadTranslateConfig() {
  if (!loaded) {
    loaded = api.fetchApi("/tj_shared/translate_config").then(r => r.json())
      .then(d => { cfg = { ...DEFAULTS, ...d }; notify(); return cfg; })
      .catch(() => cfg);
  }
  return loaded;
}

/** Call `fn(cfg)` whenever the setting changes (from this node or any other). Returns an unsubscribe function. */
export function onTranslateConfig(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** Save a change: shown here at once, stored on the server, pushed to every other node. */
export async function setTranslateConfig(patch) {
  cfg = { ...cfg, ...patch };
  notify();
  try {
    const r = await api.fetchApi("/tj_shared/translate_config", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    });
    const d = await r.json();
    if (d?.config) { cfg = { ...DEFAULTS, ...d.config }; notify(); }
  } catch (e) { console.warn("[translate] save failed:", e); }
}

/** `(system, user) => text` for the shared translate backend. */
export function translateLlm() {
  return async (system, user) => {
    await loadTranslateConfig();
    const c = cfg;
    if (c.backend === "native") {
      if (!c.native_clip) throw new Error("No translate CLIP set - pick one in Settings -> Translate.");
      return writeBriefNative(c.native_clip, system, user);
    }
    const r = await api.fetchApi("/tj_shared/translate_llm", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ system, user }),
    });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || "Translate failed");
    return d.text;
  };
}

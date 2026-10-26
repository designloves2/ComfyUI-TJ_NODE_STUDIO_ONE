// bilingual_image.js — the KO / EN button for the single prompt box of an image node (one prompt per mode).
// The English text stays where the node keeps it (getModePrompt / setModePrompt); the Korean text, the newest mark
// and the view are kept per mode in state.promptSlots[mode], so a node only has to whitelist `promptSlots`.
import { attachBilingual } from "./bilingual_ui.js";
import { ensureEnglish, fieldSetBoth, fieldSetView } from "./bilingual.js";
import { translateLlm } from "./translate_config.js";

const KEY = "prompt";

export function createImagePromptBilingual({ state, getModePrompt, setModePrompt, persist, onError }) {
  const target = () => {
    const mode = state.mode;
    if (!state.promptSlots) state.promptSlots = {};
    const slots = state.promptSlots[mode] || (state.promptSlots[mode] = {});
    return new Proxy(slots, {
      get: (t, k) => (k === KEY ? getModePrompt(mode) : t[k]),
      set: (t, k, v) => { if (k === KEY) setModePrompt(mode, v); else t[k] = v; return true; },
    });
  };
  const protect = () => [];
  let main = null;
  return {
    // handed to attachLLMPanel({ bilingual }) — the panel is built before the main box exists
    panel: { target, key: KEY, protect, onError, getMainBil: () => main },
    // wraps the main prompt box; use the returned element where the textarea was
    attach(promptTA) {
      main = attachBilingual(promptTA, { target, key: KEY, persist, protect, onError });
      return main;
    },
    refresh: () => main?.refresh(),
    // a template / loaded preset replaces the prompt: English text, no Korean yet
    setEnglish(text) {
      const o = target();
      fieldSetBoth(o, KEY, text, "");
      fieldSetView(o, KEY, "en");
      persist(); main?.refresh();
    },
    // Generate guard: a Korean-only edit becomes English before the graph is built
    async ensure() {
      if (await ensureEnglish(target(), KEY, translateLlm(), { protect: protect() })) { persist(); main?.refresh(); }
    },
  };
}

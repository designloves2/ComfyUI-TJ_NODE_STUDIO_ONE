// Model / LLM / Translation tabs for the image nodes' settings overlay.
//
// The overlays were one long scroll: the model pickers and every other option first, then the LLM block
// (mountLLMSettingsSection). Call this once, after the overlay is fully built: everything except the header row goes
// into the "Model" tab, the LLM panel goes into the "LLM" tab, and the "Translation" tab is the shared Korean <-> English
// model setting (the same one every node uses). The first child of `ov` is the header row.
import { translationSettingsPanel } from "./translation_settings.js";

export function tabSettings(ov, llmPanel, { brand, bg, border, openLlm = false }) {
  const header = ov.firstElementChild;
  let llmTop = llmPanel;
  while (llmTop.parentElement && llmTop.parentElement !== ov) llmTop = llmTop.parentElement;

  const modelBox = document.createElement("div");
  const llmBox = document.createElement("div");
  const translationBox = document.createElement("div");
  for (const box of [modelBox, llmBox, translationBox]) Object.assign(box.style, { display: "flex", flexDirection: "column", gap: "8px", flexShrink: "0" });
  [...ov.children].filter(c => c !== header && c !== llmTop).forEach(c => modelBox.appendChild(c));
  llmBox.appendChild(llmTop);
  translationBox.appendChild(translationSettingsPanel({ brand, bg, border }));

  const bar = document.createElement("div");
  Object.assign(bar.style, { display: "flex", gap: "6px", flexShrink: "0" });
  const tabs = { Model: modelBox, LLM: llmBox, Translation: translationBox };
  const buttons = {};
  function show(name) {
    for (const [n, box] of Object.entries(tabs)) {
      const active = n === name;
      box.style.display = active ? "flex" : "none";
      Object.assign(buttons[n].style, { fontWeight: active ? "700" : "400", background: active ? brand : bg, borderColor: active ? brand : border });
    }
  }
  for (const name of Object.keys(tabs)) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = name;
    Object.assign(b.style, { cursor: "pointer", fontFamily: "inherit", fontSize: "12px", padding: "6px 14px", borderRadius: "6px", color: "#fff", border: "1px solid" });
    b.addEventListener("click", () => show(name));
    buttons[name] = b; bar.appendChild(b);
  }
  ov.append(bar, modelBox, llmBox, translationBox);
  show(openLlm ? "LLM" : "Model");
  return { show };
}

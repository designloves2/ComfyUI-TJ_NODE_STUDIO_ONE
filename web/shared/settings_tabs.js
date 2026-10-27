// Model / LLM tabs for the image nodes' settings overlay.
//
// The overlays were one long scroll: the model pickers and every other option first, then the LLM block
// (mountLLMSettingsSection). Call this once, after the overlay is fully built: everything except the header row goes
// into the "Model" tab and the LLM panel goes into the "LLM" tab. The first child of `ov` is the header row.
export function tabSettings(ov, llmPanel, { brand, bg, border, openLlm = false }) {
  const header = ov.firstElementChild;
  let llmTop = llmPanel;
  while (llmTop.parentElement && llmTop.parentElement !== ov) llmTop = llmTop.parentElement;

  const modelBox = document.createElement("div");
  const llmBox = document.createElement("div");
  for (const box of [modelBox, llmBox]) Object.assign(box.style, { display: "flex", flexDirection: "column", gap: "8px", flexShrink: "0" });
  [...ov.children].filter(c => c !== header && c !== llmTop).forEach(c => modelBox.appendChild(c));
  llmBox.appendChild(llmTop);

  const bar = document.createElement("div");
  Object.assign(bar.style, { display: "flex", gap: "6px", flexShrink: "0" });
  const tabs = { Model: modelBox, LLM: llmBox };
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
  ov.append(bar, modelBox, llmBox);
  show(openLlm ? "LLM" : "Model");
  return { show };
}

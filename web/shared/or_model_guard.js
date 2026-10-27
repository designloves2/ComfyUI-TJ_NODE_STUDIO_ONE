// OpenRouter is selected but no model is set: nothing is sent, a popup says where to pick one. There is no default model.
export const orModelMessage = (where = "LLM") => `OpenRouter 모델이 선택되지 않았습니다. 설정 > ${where} 에서 모델을 선택하세요.`;

/** A small modal popup (used where the node has no popup of its own). */
export function orModelPopup(message = orModelMessage()) {
  const ov = document.createElement("div");
  Object.assign(ov.style, {
    position: "fixed", inset: "0", zIndex: "100000", background: "rgba(0,0,0,0.72)",
    display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit",
  });
  const box = document.createElement("div");
  Object.assign(box.style, {
    background: "#1b1b1b", border: "1px solid #7612DA", borderRadius: "10px", padding: "18px", maxWidth: "min(460px, 92vw)",
    display: "flex", flexDirection: "column", gap: "14px", color: "#ddd", fontSize: "13px", lineHeight: "1.5",
  });
  const text = document.createElement("div");
  text.textContent = message;
  const ok = document.createElement("button");
  ok.type = "button"; ok.textContent = "OK";
  Object.assign(ok.style, { alignSelf: "flex-end", background: "#7612DA", color: "#fff", border: "none", borderRadius: "6px", padding: "8px 18px", cursor: "pointer", fontWeight: "700" });
  ok.addEventListener("click", () => ov.remove());
  ov.addEventListener("click", (e) => { if (e.target === ov) ov.remove(); });
  box.append(text, ok); ov.appendChild(box);
  document.body.appendChild(ov);
}

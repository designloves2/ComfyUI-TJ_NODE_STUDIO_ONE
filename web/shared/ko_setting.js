// "Use Korean translation" - one on / off choice per node type, kept in this browser. Off = English only: no EN / 한 button,
// no Korean views, no translation before Generate. The nodes mark their root element with data-tj-node="<key>" so shared
// code (the KO / EN button, the Prompt Edit panel) can find which node it is in.
const KEY = (node) => `tj_use_ko_${node}`;

export function getUseKo(node) {
  try { return localStorage.getItem(KEY(node)) !== "0"; } catch { return true; }
}

export function setUseKo(node, on) {
  try { localStorage.setItem(KEY(node), on ? "1" : "0"); } catch { /* private window: the choice just isn't remembered */ }
  window.dispatchEvent(new Event("tj-use-ko"));
}

export const nodeKeyOf = (el) => el?.closest?.("[data-tj-node]")?.dataset.tjNode || "";

/** Is Korean on for the node that contains `el`? (true when `el` is not inside a marked node) */
export function useKoFor(el) {
  const node = nodeKeyOf(el);
  return node ? getUseKo(node) : true;
}

/** The settings checkbox. */
export function useKoCheckbox(node, { text = "#dedede", muted = "#8a8a8a" } = {}) {
  const label = document.createElement("label");
  Object.assign(label.style, { display: "flex", alignItems: "center", gap: "6px", color: text, fontSize: "12px", cursor: "pointer" });
  const chk = document.createElement("input");
  chk.type = "checkbox"; chk.checked = getUseKo(node);
  chk.addEventListener("change", () => setUseKo(node, chk.checked));
  const note = document.createElement("span");
  note.textContent = "한글 번역 사용";
  const hint = document.createElement("span");
  hint.textContent = "— 끄면 영어만 사용합니다 (EN/한 버튼, 한국어 보기, 생성 전 번역이 모두 꺼집니다). 이 노드에만 적용됩니다.";
  Object.assign(hint.style, { color: muted, fontSize: "10px" });
  label.append(chk, note, hint);
  return label;
}

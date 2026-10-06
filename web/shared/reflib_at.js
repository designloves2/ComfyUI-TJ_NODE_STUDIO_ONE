// reflib_at.js — type "@" in a prompt box and pick one of the clip's library references.
// The list is the tokens the clip's assets / project provide (@alias, else @<id>); choosing one
// writes the token at the caret. Nothing opens for a clip that has no library references.
import { C } from "../minimax/core_minimax.js";
import { el } from "./reflib_dom.js";

/**
 * @param textarea  the prompt box
 * @param getItems  async () => [{ token, name, kind, label }] for the clip being edited ([] = none)
 */
export function attachAtComplete(textarea, getItems) {
  let menu = null, items = [], index = 0, anchor = -1, loading = 0;

  const close = () => { menu?.remove(); menu = null; items = []; anchor = -1; };

  function place() {
    const r = textarea.getBoundingClientRect();
    Object.assign(menu.style, { left: `${r.left + 12}px`, top: `${Math.min(r.bottom - 4, window.innerHeight - 220)}px` });
  }

  function draw() {
    if (!items.length) { close(); return; }
    if (!menu) {
      menu = el("div", { style: { position: "fixed", zIndex: "100001", minWidth: "260px", maxWidth: "420px", maxHeight: "210px",
        overflowY: "auto", background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "8px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.6)", fontSize: "12px", color: C.text } });
      document.body.append(menu);
    }
    place();
    menu.replaceChildren(...items.map((it, i) => {
      const row = el("div", { style: { padding: "4px 10px", cursor: "pointer", display: "flex", gap: "8px", alignItems: "center",
        background: i === index ? C.lime : "transparent", color: i === index ? "#fff" : C.text } },
        it.thumb ? el("img", { src: it.thumb, style: { width: "30px", height: "30px", objectFit: "contain", background: "#000",
          borderRadius: "4px", flexShrink: "0" } }) : null,
        el("b", { text: it.token }),
        el("span", { text: `${it.name} · ${it.kind}`, style: { opacity: "0.75", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }));
      row.addEventListener("mousedown", (e) => { e.preventDefault(); choose(i); });
      return row;
    }));
    menu.children[index]?.scrollIntoView({ block: "nearest" });
  }

  function choose(i) {
    const it = items[i];
    if (!it || anchor < 0) { close(); return; }
    const caret = textarea.selectionStart;
    textarea.setRangeText(`${it.token} `, anchor, caret, "end");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    close();
  }

  async function refresh() {
    const caret = textarea.selectionStart;
    const before = textarea.value.slice(0, caret);
    const m = /(^|[\s(\[,.;:!?"'])@([\w\-]*)$/.exec(before);
    if (!m) { close(); return; }
    const typed = m[2].toLowerCase();
    const ticket = ++loading;
    const all = await getItems();
    if (ticket !== loading) return;                 // a newer keystroke is already being handled
    anchor = caret - typed.length - 1;
    items = (all || []).filter(it => it.token.slice(1).toLowerCase().startsWith(typed) || String(it.name).toLowerCase().startsWith(typed));
    index = 0;
    draw();
  }

  textarea.addEventListener("input", refresh);
  textarea.addEventListener("click", () => { if (menu) refresh(); });
  textarea.addEventListener("blur", () => setTimeout(close, 120));
  textarea.addEventListener("keydown", (e) => {
    if (!menu) return;
    if (e.key === "ArrowDown") { index = (index + 1) % items.length; draw(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { index = (index - 1 + items.length) % items.length; draw(); e.preventDefault(); }
    else if (e.key === "Enter" || e.key === "Tab") { choose(index); e.preventDefault(); }
    else if (e.key === "Escape") { close(); e.stopPropagation(); e.preventDefault(); }
  });
  return { close };
}

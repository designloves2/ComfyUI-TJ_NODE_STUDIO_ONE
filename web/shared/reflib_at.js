// reflib_at.js — type "@" in a prompt box and pick one of the clip's library references.
// Same list as ComfyUI-TJ_NODE's TJ_H3Reference prompt box: the tokens the clip's assets / project
// provide (@alias, else @<id>), each with a small thumbnail, "#id name · kind · category", filtered
// as you type. Up / Down move, Enter or Tab inserts, Esc closes. Nothing opens for a clip that has
// no library references.
import { el } from "./reflib_dom.js";

/**
 * @param textarea  the prompt box
 * @param getItems  async () => [{ token: "@alias" | "@<id>", id, name, kind, category, thumb }] ([] = none)
 */
export function attachAtComplete(textarea, getItems) {
  let box = null, items = [], index = 0, start = -1, seq = 0;

  const hide = () => { if (box) box.style.display = "none"; items = []; };

  function ensureBox() {
    if (box) return box;
    box = el("div", { style: { position: "fixed", zIndex: "100001", display: "none", minWidth: "240px", maxHeight: "260px",
      overflow: "auto", background: "#1d1d1d", border: "1px solid #4a6a8a", borderRadius: "6px",
      boxShadow: "0 4px 14px #000a", font: "12px sans-serif", color: "#ddd" } });
    document.body.append(box);
    return box;
  }

  function draw() {
    const b = ensureBox();
    b.replaceChildren(...items.map((c, i) => {
      const row = el("div", { style: { display: "flex", gap: "8px", alignItems: "center", padding: "3px 8px", cursor: "pointer",
        background: i === index ? "#2f4a66" : "" } },
        el("img", { src: c.thumb, style: { width: "28px", height: "28px", objectFit: "cover", borderRadius: "3px", background: "#000" } }),
        el("div", { text: `${c.token}   #${c.id} ${c.name} · ${c.kind} · ${c.category}` }));
      row.addEventListener("mousedown", (e) => { e.preventDefault(); insert(i); });
      return row;
    }));
    b.children[index]?.scrollIntoView({ block: "nearest" });
  }

  function insert(i) {
    const c = items[i];
    if (!c || start < 0) return;
    const end = textarea.selectionStart;
    textarea.value = textarea.value.slice(0, start) + `${c.token} ` + textarea.value.slice(end);
    textarea.selectionStart = textarea.selectionEnd = start + c.token.length + 1;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    hide();
  }

  async function update() {
    const before = textarea.value.slice(0, textarea.selectionStart);
    const m = /(?:^|[^\p{L}\p{N}_@])@([\p{L}\p{N}_]*)$/u.exec(before);
    if (!m) { hide(); return; }
    const mine = ++seq;
    const query = m[1].toLowerCase();
    const all = await getItems().catch(() => []);
    if (mine !== seq) return;
    items = (all || []).filter(c => !query || c.token.slice(1).toLowerCase().startsWith(query)
      || String(c.name).toLowerCase().includes(query) || String(c.id).startsWith(query));
    start = textarea.selectionStart - m[1].length - 1;
    index = 0;
    if (!items.length) { hide(); return; }
    const r = textarea.getBoundingClientRect();
    const b = ensureBox();
    b.style.left = `${Math.max(4, r.left)}px`;
    b.style.top = `${r.bottom + 2}px`;
    b.style.display = "block";
    draw();
  }

  textarea.addEventListener("input", update);
  textarea.addEventListener("click", update);
  textarea.addEventListener("blur", () => setTimeout(hide, 120));
  textarea.addEventListener("keydown", (e) => {
    if (!box || box.style.display === "none" || !items.length) return;
    const stop = () => { e.preventDefault(); e.stopPropagation(); };
    if (e.key === "ArrowDown") { stop(); index = (index + 1) % items.length; draw(); }
    else if (e.key === "ArrowUp") { stop(); index = (index - 1 + items.length) % items.length; draw(); }
    else if (e.key === "Enter" || e.key === "Tab") { stop(); insert(index); }
    else if (e.key === "Escape") { stop(); hide(); }
  }, true);
  return { close: hide };
}

// ui_common_prompt_minimax.js — the shared header / sound-music tail, edited on their own
//
// These two blocks go into every clip, so they deserve room of their own rather than two
// cramped strips above the clip editor. Prompt Edit reads the same state, so whatever is
// written here shows up there (and vice versa).
import { C, BRAND, el, composeClipPrompt } from "./core_minimax.js";
import { button } from "../klein/ui_common.js";

export function createCommonPromptOverlay(state, ctx, onApply) {
  const ov = el("div", { style: {
    position: "absolute", inset: "0", zIndex: "9999",
    background: "rgba(11,11,11,0.985)", borderRadius: "inherit",
    display: "none", flexDirection: "column", padding: "12px", gap: "8px", boxSizing: "border-box",
  }});

  const hdr = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" } });
  hdr.appendChild(el("div", { text: "🧩 Common Prompt", style: { color: "#fff", fontSize: "14px", fontWeight: "700" } }));
  hdr.appendChild(el("div", { text: "sent with every clip", style: { fontSize: "10.5px", color: C.muted, flex: "1" } }));
  hdr.appendChild(button("✕ Close", () => hide(), "danger"));

  function field(titleText, hintHTML, get, set) {
    const wrap = el("div", { style: { flex: "1", display: "flex", flexDirection: "column", gap: "4px", minHeight: "0" } });
    const head = el("div", { style: { display: "flex", alignItems: "center", gap: "6px" } });
    head.append(
      el("div", { text: titleText, style: { color: BRAND, fontSize: "11px", fontWeight: "700", letterSpacing: "0.04em" } }),
      el("div", { html: hintHTML, style: { fontSize: "10px", color: C.muted, flex: "1" } }),
    );
    const ta = el("textarea", { style: {
      flex: "1", minHeight: "0", boxSizing: "border-box", background: C.bg1, color: C.text,
      border: `1px solid ${C.border}`, borderRadius: "8px", padding: "11px",
      fontSize: "12.5px", lineHeight: "1.6", fontFamily: "inherit", outline: "none", resize: "none",
    }});
    ta.value = get() || "";
    ta.addEventListener("input", () => { set(ta.value); ctx.persist(); refreshTag(); });
    ta.addEventListener("focus", () => ta.style.borderColor = BRAND);
    ta.addEventListener("blur",  () => ta.style.borderColor = C.border);
    wrap.append(head, ta);
    return { wrap, ta };
  }

  const headerF = field("HEADER — style & opening",
    "visual style, grade, lens, opening composition",
    () => state.promptHeader, v => state.promptHeader = v);
  const footerF = field("TAIL — sound & music",
    "<code>Ambient sound:</code> … / <code>Music:</code> …",
    () => state.promptFooter, v => state.promptFooter = v);

  const body = el("div", { style: { flex: "1", display: "flex", gap: "10px", minHeight: "0" } });
  body.append(headerF.wrap, footerF.wrap);

  const foot = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" } });
  const tag = el("div", { style: { fontSize: "10.5px", color: C.muted, flex: "1" } });
  const clearBtn = el("button", { type: "button", text: "Clear both", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "11px", padding: "6px 12px",
    borderRadius: "6px", background: C.bg2, color: C.muted, border: `1px solid ${C.border}`,
  }});
  clearBtn.addEventListener("click", () => {
    state.promptHeader = ""; state.promptFooter = "";
    headerF.ta.value = ""; footerF.ta.value = "";
    ctx.persist(); refreshTag(); onApply?.();
  });
  foot.append(clearBtn, tag, button("✓ Done", () => hide(), "primary"));

  function refreshTag() {
    const h = (state.promptHeader || "").length, f = (state.promptFooter || "").length;
    const full = composeClipPrompt(state, 0).length;
    tag.textContent = `header ${h} + tail ${f} chars · clip 1 sends ${full} chars in total`;
  }

  function hide() { ov.style.display = "none"; onApply?.(); }

  ov.append(hdr, body, foot);
  return {
    el: ov,
    show() {
      headerF.ta.value = state.promptHeader || "";
      footerF.ta.value = state.promptFooter || "";
      refreshTag();
      ov.style.display = "flex";
      setTimeout(() => headerF.ta.focus(), 50);
    },
    hide,
    isOpen: () => ov.style.display !== "none",
  };
}

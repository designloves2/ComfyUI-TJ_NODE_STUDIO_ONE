// ui_common_prompt_minimax.js — the shared header / sound-music tail, edited on their own
//
// These two blocks go into every clip, so they deserve room of their own rather than two
// cramped strips above the clip editor. Prompt Edit reads the same state, so whatever is
// written here shows up there (and vice versa).
import { C, BRAND, el, composeClipPrompt } from "./core_minimax.js";
import { button } from "../klein/ui_common.js";
import { attachBilingual } from "../shared/bilingual_ui.js";
import { fieldSetBoth } from "../shared/bilingual.js";
import { h3ProtectWords } from "./translate_minimax.js";

export function createCommonPromptOverlay(state, ctx, onApply) {
  // A popup over a dimmed backdrop, not the whole node.
  const ov = el("div", { style: {
    position: "absolute", inset: "0", zIndex: "9999",
    background: "rgba(0,0,0,0.6)", borderRadius: "inherit",
    display: "none", alignItems: "center", justifyContent: "center", boxSizing: "border-box",
  }});
  const panel = el("div", { style: {
    width: "min(900px, 94%)", height: "min(430px, 80%)", display: "flex", flexDirection: "column", gap: "8px",
    padding: "12px", boxSizing: "border-box", background: "rgba(11,11,11,0.985)",
    border: `1px solid ${BRAND}`, borderRadius: "10px", boxShadow: "0 8px 30px rgba(0,0,0,0.6)",
  }});

  const hdr = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" } });
  hdr.appendChild(el("div", { text: "🧩 Common Prompt", style: { color: "#fff", fontSize: "14px", fontWeight: "700" } }));
  hdr.appendChild(el("div", { text: "sent with every clip", style: { fontSize: "10.5px", color: C.muted, flex: "1" } }));
  hdr.appendChild(button("✕ Close", () => hide(), "danger"));

  function field(titleText, hintHTML, get, set, key) {
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
    // KO / EN button: the English text is what the model gets, the Korean one is its view
    const bil = attachBilingual(ta, { target: () => state, key, persist: () => ctx.persist(), protect: () => h3ProtectWords(state), onError: (m) => ctx.showPopup?.(m, true) });
    wrap.append(head, bil.el);
    return { wrap, ta, bil };
  }

  const headerF = field("HEADER — style & opening",
    "visual style, grade, lens, opening composition",
    () => state.promptHeader, v => state.promptHeader = v, "promptHeader");
  const footerF = field("TAIL — sound & music",
    "<code>Ambient sound:</code> … / <code>Music:</code> …",
    () => state.promptFooter, v => state.promptFooter = v, "promptFooter");

  const body = el("div", { style: { flex: "1", display: "flex", gap: "10px", minHeight: "0" } });
  body.append(headerF.wrap, footerF.wrap);

  const foot = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" } });
  const tag = el("div", { style: { fontSize: "10.5px", color: C.muted, flex: "1" } });
  const clearBtn = el("button", { type: "button", text: "Clear both", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "11px", padding: "6px 12px",
    borderRadius: "6px", background: C.bg2, color: C.muted, border: `1px solid ${C.border}`,
  }});
  clearBtn.addEventListener("click", () => {
    fieldSetBoth(state, "promptHeader", "", ""); fieldSetBoth(state, "promptFooter", "", "");
    headerF.bil.refresh(); footerF.bil.refresh();
    ctx.persist(); refreshTag(); onApply?.();
  });
  foot.append(clearBtn, tag, button("✓ Done", () => hide(), "primary"));

  function refreshTag() {
    const h = (state.promptHeader || "").length, f = (state.promptFooter || "").length;
    const full = composeClipPrompt(state, 0).length;
    tag.textContent = `header ${h} + tail ${f} chars · clip 1 sends ${full} chars in total`;
  }

  function hide() { ov.style.display = "none"; onApply?.(); }

  panel.append(hdr, body, foot);
  ov.append(panel);
  return {
    el: ov,
    show() {
      headerF.bil.refresh(); footerF.bil.refresh();
      refreshTag();
      ov.style.display = "flex";
      setTimeout(() => headerF.ta.focus(), 50);
    },
    hide,
    isOpen: () => ov.style.display !== "none",
  };
}

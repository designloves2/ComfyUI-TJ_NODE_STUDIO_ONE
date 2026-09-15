// ui_ask.js — in-page replacements for window.prompt / confirm.
//
// ComfyUI's frontend suppresses the browser's own dialogs, so any handler that waits on
// `window.prompt` or `confirm` stops there and never reaches its own code. From the
// outside that is indistinguishable from a dead button, which is exactly how it was found
// twice — once on the pipeline presets, once on the prompt-set Save.
//
// These render inside the page like every other panel in the pack, so they are subject to
// nothing but our own z-index.
import { C, BRAND, el } from "../minimax/core_minimax.js";

/**
 * Ask for a value ("text") or a yes/no ("confirm").
 *
 * @param parent  element to mount into — normally the node's root, so the dialog is
 *                clipped to the node rather than floating over the whole canvas
 * @returns the trimmed string, `null` if cancelled; `true`/`false` for confirm
 */
export function ask(parent, { title, message, initial = "", kind = "text", okLabel = "OK", danger = false, tags = null }) {
  return new Promise((resolve) => {
    const isTextarea = kind === "textarea";
    const input = (kind === "text" || isTextarea) ? el(isTextarea ? "textarea" : "input", {
      ...(isTextarea ? {} : { type: "text" }), style: {
      width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text,
      border: `1px solid ${C.border}`, borderRadius: "6px", padding: "8px", fontSize: "13px",
      fontFamily: "inherit", outline: "none",
      ...(isTextarea ? { minHeight: "90px", resize: "vertical", lineHeight: "1.5" } : {}),
    }}) : null;
    if (input) input.value = initial;

    // Optional insert-at-cursor tag buttons (Picture/Subject/Shot) — `N` is inserted
    // literally, the user replaces it with the actual number themselves.
    const tagRow = (tags && tags.length && input) ? el("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
      tags.map(tag => {
        const b = el("button", { type: "button", text: tag, style: {
          cursor: "pointer", fontFamily: "inherit", fontSize: "10.5px", padding: "3px 9px",
          borderRadius: "5px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
        }});
        // mousedown on a button steals focus from the textarea before click fires,
        // which collapses its selection to the end — preventDefault here keeps the
        // textarea focused throughout so selectionStart/End still point at the cursor.
        b.addEventListener("mousedown", (e) => e.preventDefault());
        b.addEventListener("click", () => {
          const s = input.selectionStart ?? input.value.length;
          const e = input.selectionEnd ?? input.value.length;
          const token = `<${tag} N>`;
          input.value = input.value.slice(0, s) + token + input.value.slice(e);
          input.focus();
          input.setSelectionRange(s + token.length, s + token.length);
        });
        return b;
      })) : null;

    const btn = (text, on, kindName) => {
      const b = el("button", { type: "button", text, style: {
        cursor: "pointer", fontFamily: "inherit", fontSize: "12px", padding: "6px 14px",
        borderRadius: "6px", fontWeight: kindName ? "700" : "400",
        background: kindName === "danger" ? "#7a1f1f" : kindName === "primary" ? BRAND : C.bg2,
        color: kindName ? "#fff" : C.text,
        border: `1px solid ${kindName ? "transparent" : C.border}`,
      }});
      b.addEventListener("click", on);
      return b;
    };

    const box = el("div", { style: {
      background: "#141414", border: `1px solid ${C.border}`, borderRadius: "10px",
      boxShadow: "0 12px 40px rgba(0,0,0,0.6)", width: isTextarea ? "420px" : "340px", maxWidth: "92%",
      padding: "14px", display: "flex", flexDirection: "column", gap: "10px",
    }});
    const ov = el("div", { style: {
      position: "absolute", inset: "0", zIndex: "10050", display: "flex",
      alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)",
      borderRadius: "inherit",
    }}, [box]);

    const done = (v) => { ov.remove(); resolve(v); };
    const cancelValue = kind === "confirm" ? false : null;

    box.append(
      el("div", { text: title, style: { color: "#fff", fontSize: "13px", fontWeight: "700" } }),
      ...(message ? [el("div", { text: message, style: {
        fontSize: "11.5px", color: C.muted, lineHeight: "1.6", whiteSpace: "pre-line" } })] : []),
      ...(input ? [input] : []),
      ...(tagRow ? [tagRow] : []),
      el("div", { style: { display: "flex", gap: "8px", justifyContent: "flex-end" } }, [
        btn("Cancel", () => done(cancelValue)),
        btn(okLabel, () => done(kind === "confirm" ? true : (input.value.trim() || null)),
          danger ? "danger" : "primary"),
      ]),
    );

    ov.addEventListener("mousedown", (e) => { if (e.target === ov) done(cancelValue); });
    if (input) input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !isTextarea) { e.preventDefault(); done(input.value.trim() || null); }
      if (e.key === "Escape") { e.preventDefault(); done(null); }
    });

    parent.appendChild(ov);
    setTimeout(() => input?.focus(), 0);
  });
}

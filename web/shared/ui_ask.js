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
export function ask(parent, { title, message, initial = "", kind = "text", okLabel = "OK", danger = false }) {
  return new Promise((resolve) => {
    const input = kind === "text" ? el("input", { type: "text", style: {
      width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text,
      border: `1px solid ${C.border}`, borderRadius: "6px", padding: "8px", fontSize: "13px",
      fontFamily: "inherit", outline: "none",
    }}) : null;
    if (input) input.value = initial;

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
      boxShadow: "0 12px 40px rgba(0,0,0,0.6)", width: "340px", maxWidth: "92%",
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
      el("div", { style: { display: "flex", gap: "8px", justifyContent: "flex-end" } }, [
        btn("Cancel", () => done(cancelValue)),
        btn(okLabel, () => done(kind === "confirm" ? true : (input.value.trim() || null)),
          danger ? "danger" : "primary"),
      ]),
    );

    ov.addEventListener("mousedown", (e) => { if (e.target === ov) done(cancelValue); });
    if (input) input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); done(input.value.trim() || null); }
      if (e.key === "Escape") { e.preventDefault(); done(null); }
    });

    parent.appendChild(ov);
    setTimeout(() => input?.focus(), 0);
  });
}

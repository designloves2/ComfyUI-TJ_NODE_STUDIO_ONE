// ui_common_qe.js — reusable UI building blocks for Qwen 2511 ONE (wraps Klein's + overrides lime)
import { panel, label, button, select, slider, numberField, row, col, modeBar, iconBtn, loraSelect } from "../klein/ui_common.js";
export { panel, label, button, select, slider, numberField, row, col, modeBar, iconBtn, loraSelect };

// QE-specific: single LoRA picker that uses the QE API
import { C, el, clear } from "./core_qwen2511.js";
import { getLoraTriggers } from "./api_qwen2511.js";

export function mountLoraSectionQE(leftEl, state, ctx) {
  const wrap = el("div");
  leftEl.appendChild(wrap);
  const avail = () => ctx.availableLoras || ["none"];

  function render() {
    clear(wrap);
    if (!state.loras) state.loras = [];
    const loras = state.loras;
    const items = loras.map((lora, i) => {
      const nameOpts = ["none", ...avail().filter(n => n !== "none")];
      const twIn = el("input", { type: "text", placeholder: "Trigger word…", style: {
        width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text,
        border: `1px solid ${C.border}`, borderRadius: "4px", padding: "4px 6px",
        fontSize: "11px", fontFamily: "inherit", outline: "none",
      }});
      twIn.value = lora.triggerWord || "";
      twIn.addEventListener("input", () => { lora.triggerWord = twIn.value; ctx.persist(); });

      const loraSel = loraSelect(nameOpts, lora.name || "none", async v => {
        lora.name = v; ctx.persist();
        if (v && v !== "none" && !lora.triggerWord) {
          twIn.placeholder = "Loading…";
          try {
            const d = await getLoraTriggers(v);
            if (d.ok && d.triggers?.length) { lora.triggerWord = d.triggers.join(", "); twIn.value = lora.triggerWord; ctx.persist(); }
          } catch {}
          twIn.placeholder = "Trigger word…";
        }
      });

      const strIn = el("input", { type: "number", step: "0.05", min: "0", max: "2", style: {
        width: "50px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
        borderRadius: "4px", padding: "4px", fontSize: "12px", fontFamily: "inherit", outline: "none", boxSizing: "border-box",
      }});
      strIn.value = lora.strength ?? 1;
      strIn.addEventListener("input", () => { lora.strength = parseFloat(strIn.value) || 1; ctx.persist(); });

      const tog = el("button", { type: "button", text: lora.enabled !== false ? "ON" : "OFF", style: {
        cursor: "pointer", fontFamily: "inherit", fontSize: "10px", padding: "3px 6px",
        borderRadius: "10px", border: "none",
        background: lora.enabled !== false ? C.lime : "#444", color: "#fff", fontWeight: "700",
      }, onclick: () => { lora.enabled = lora.enabled === false; ctx.persist(); render(); }});

      const del = el("button", { type: "button", text: "✕", style: {
        cursor: "pointer", fontFamily: "inherit", fontSize: "11px",
        background: "transparent", color: C.err, border: "none", padding: "2px 4px",
      }, onclick: () => { state.loras.splice(i, 1); ctx.persist(); render(); ctx.resizeNode?.(); }});

      return el("div", { style: { display: "flex", flexDirection: "column", gap: "3px", padding: "5px", background: C.bg2, borderRadius: "6px", border: `1px solid ${C.border}` } }, [
        el("div", { style: { display: "flex", gap: "4px", alignItems: "center" } }, [el("div", { style: { flex: "1" } }, [loraSel.el]), strIn, tog, del]),
        twIn,
      ]);
    });

    const addBtn = loras.length < 3
      ? el("button", { type: "button", text: "+ Add LoRA", style: {
          cursor: "pointer", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
          borderRadius: "6px", padding: "6px 12px", fontSize: "12px", fontFamily: "inherit",
        }, onclick: () => { state.loras.push({ name: "none", strength: 1, triggerWord: "", enabled: true }); ctx.persist(); render(); ctx.resizeNode?.(); }})
      : null;

    const children = [
      el("div", { text: "LoRA (max 3)", style: { color: C.muted, fontSize: "11px", marginBottom: "3px", textTransform: "uppercase", letterSpacing: "0.04em" } }),
      ...items,
    ];
    if (addBtn) children.push(addBtn);

    const p = el("div", { style: { background: C.bg1, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "10px", marginBottom: "6px" } }, children);
    wrap.appendChild(p);
    ctx.resizeNode?.();
  }

  render();
  ctx._rerenderLoras = render;
}

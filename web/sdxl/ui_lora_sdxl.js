// ui_lora_sdxl.js — LoRA section for SDXL ONE (TJ)
import { C, el, clear, BRAND } from "./core_sdxl.js";
import { panel, label, button, row } from "../klein/ui_common.js";
import { getLoraTriggers } from "./api_sdxl.js";

export function mountLoraSection(leftEl, state, ctx) {
  const wrap = el("div");
  leftEl.appendChild(wrap);
  const avail = () => ctx.availableLoras || [];

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

      // Searchable LoRA select
      const selWrap = el("div", { style: { flex: "1", display: "flex", flexDirection: "column", gap: "2px" } });
      const searchIn = el("input", { type: "text", placeholder: "Search LoRA…", style: {
        width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text,
        border: `1px solid ${C.border}`, borderRadius: "4px 4px 0 0",
        padding: "3px 6px", fontSize: "10px", fontFamily: "inherit", outline: "none",
      }});
      const loraSel = el("select", { style: {
        width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text,
        border: `1px solid ${C.border}`, borderTopWidth: "0", borderRadius: "0 0 4px 4px",
        padding: "3px", fontSize: "11px", fontFamily: "inherit", outline: "none",
      }});
      function buildLoraOpts(filter) {
        const q = filter.toLowerCase();
        loraSel.replaceChildren(...nameOpts
          .filter(o => !q || o.toLowerCase().includes(q))
          .map(o => el("option", { value: o, text: o, ...(o === lora.name ? { selected: "selected" } : {}) }))
        );
        if (nameOpts.includes(lora.name)) loraSel.value = lora.name;
      }
      buildLoraOpts("");
      searchIn.addEventListener("input", () => buildLoraOpts(searchIn.value));
      loraSel.addEventListener("change", async e => {
        const prev = lora.name;
        lora.name = e.target.value; ctx.persist();
        if (lora.name && lora.name !== "none") {
          if (lora.name !== prev) { lora.triggerWord = ""; twIn.value = ""; }
          if (!lora.triggerWord) {
            twIn.placeholder = "Loading…";
            try {
              const d = await getLoraTriggers(lora.name);
              if (d.ok && d.triggers?.length) {
                lora.triggerWord = d.triggers.join(", ");
                twIn.value = lora.triggerWord;
                ctx.persist();
              }
            } catch(e) {}
            twIn.placeholder = "Trigger word…";
          }
        } else {
          lora.triggerWord = ""; twIn.value = "";
        }
      });
      selWrap.appendChild(searchIn); selWrap.appendChild(loraSel);

      const strIn = el("input", { type: "number", step: "0.05", min: "0", max: "2", style: {
        width: "52px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
        borderRadius: "4px", padding: "4px", fontSize: "12px", fontFamily: "inherit", outline: "none",
      }});
      strIn.value = lora.strength ?? 1;
      strIn.addEventListener("input", () => { const v = parseFloat(strIn.value); lora.strength = isNaN(v) ? 1 : v; ctx.persist(); });

      const tog = el("button", { type: "button", text: lora.enabled !== false ? "ON" : "OFF", style: {
        cursor: "pointer", fontFamily: "inherit", fontSize: "10px", padding: "3px 6px",
        borderRadius: "10px", border: "none",
        background: lora.enabled !== false ? BRAND : "#444", color: "#ffffff", fontWeight: "700",
      }, onclick: () => { lora.enabled = lora.enabled === false; ctx.persist(); render(); }});

      const del = el("button", { type: "button", text: "✕", style: {
        cursor: "pointer", fontFamily: "inherit", fontSize: "11px",
        background: "transparent", color: C.err, border: "none", padding: "2px 4px",
      }, onclick: () => { state.loras.splice(i, 1); ctx.persist(); render(); ctx.resizeNode?.(); }});

      return el("div", { style: {
        display: "flex", flexDirection: "column", gap: "3px", padding: "5px",
        background: C.bg2, borderRadius: "6px", border: `1px solid ${C.border}`,
      }}, [
        row([selWrap, strIn, tog, del], "4px"),
        twIn,
      ]);
    });

    const addBtn = loras.length < 5
      ? button("+ Add LoRA", () => { state.loras.push({ name: "none", strength: 1, triggerWord: "", enabled: true }); ctx.persist(); render(); ctx.resizeNode?.(); })
      : null;

    const panelChildren = [label("LoRA (max 5)"), ...items];
    if (addBtn) panelChildren.push(addBtn);
    wrap.appendChild(panel(panelChildren));
    ctx.resizeNode?.();
  }

  render();
  ctx._rerenderLoras = render;
}

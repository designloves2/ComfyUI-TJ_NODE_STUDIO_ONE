// ui_app_settings_vertex.js — ⚙ Settings overlay for Vertex Image ONE STUDIO (TJ)
// Same overlay + tabs as the other ONE STUDIO nodes (tabSettings: Model / LLM / Translation / Node Skin). The "Model"
// tab holds the Vertex proxy connection, the chat model used by Compact, and the system prompt.
import { C, el, MANUAL_TEXT, PROXY_APP_URL } from "./core_vertex.js";
import { panel, label, button, select, numberField } from "../klein/ui_common.js";
import { mountLLMSettingsSection } from "../shared/llm_panel.js";
import { tabSettings } from "../shared/settings_tabs.js";

const inputStyle = { width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
  borderRadius: "6px", padding: "6px", fontSize: "12px", fontFamily: "inherit", outline: "none" };

export function createSettingsOverlay(state, ctx) {
  const ov = el("div", { style: {
    position: "absolute", inset: "0", zIndex: "9998", background: "rgba(11,11,11,0.97)", borderRadius: "inherit",
    display: "none", flexDirection: "column", padding: "12px", gap: "8px", boxSizing: "border-box", overflowY: "auto",
  }});
  const topRow = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" } });
  topRow.appendChild(el("div", { text: "Settings — Vertex Image ONE STUDIO (TJ)", style: { color: "#fff", fontSize: "14px", fontWeight: "700", flex: "1" } }));
  topRow.appendChild(button("✕", () => { ov.style.display = "none"; }, "danger"));
  ov.appendChild(topRow);

  const body = el("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } });
  ov.appendChild(body);

  const text = (key, ph = "") => {
    const i = el("input", { type: "text", placeholder: ph, style: inputStyle });
    i.value = ctx.cfg[key] ?? "";
    i.addEventListener("change", () => ctx.saveCfg({ [key]: i.value.trim() }));
    i.addEventListener("keydown", e => e.stopPropagation());
    return i;
  };
  const num = (key, min, max) => {
    const n = numberField(ctx.cfg[key], () => {});
    n.addEventListener("change", () => ctx.saveCfg({ [key]: Math.max(min, Math.min(max, parseInt(n.value) || min)) }));
    return n;
  };
  const hint = t => el("div", { text: t, style: { color: C.muted, fontSize: "10.5px", lineHeight: "1.5" } });

  function render() {
    while (body.firstChild) body.removeChild(body.firstChild);
    const cfg = ctx.cfg;
    const testOut = hint("");
    const testBtn = button("Test connection", async () => {
      testOut.textContent = "Checking…";
      try { const m = await ctx.loadModels(true); testOut.textContent = `✓ Connected — ${m.image.length} image models, ${m.chat.length} chat models.`; testOut.style.color = C.lime; }
      catch (e) { testOut.textContent = "✕ " + e.message; testOut.style.color = C.err; }
    });
    body.appendChild(panel([label("Vertex OpenAI Proxy"), text("proxyUrl", "http://127.0.0.1:3000"),
      hint("The proxy app has to be running. The node calls it from the ComfyUI server."),
      el("div", { style: { fontSize: "11px", lineHeight: "1.5" } }, [
        el("span", { text: "Install it from ", style: { color: C.muted } }),
        el("a", { href: PROXY_APP_URL, target: "_blank", rel: "noopener noreferrer", text: PROXY_APP_URL, style: { color: C.lime, fontWeight: "700" } }),
        el("span", { text: " (Releases → download → run).", style: { color: C.muted } })]),
      label("Timeout (seconds)"), num("timeout", 30, 1800), el("div", { style: { display: "flex", gap: "8px", alignItems: "center", marginTop: "6px" } }, [testBtn, testOut])]));

    const chat = ["", ...ctx.models.chat];
    if (cfg.compactModel && !chat.includes(cfg.compactModel)) chat.push(cfg.compactModel);
    const compactSel = select(chat.map(v => ({ value: v, label: v || "— select a chat model —" })), cfg.compactModel || "", v => ctx.saveCfg({ compactModel: v }));
    body.appendChild(panel([label("Compact model (chat model that writes chat summaries)"), compactSel,
      hint("Used by Compact and Auto compact. Nothing is pre-selected; Compact asks you to pick one.")]));

    const sys = el("textarea", { style: { ...inputStyle, height: "90px", resize: "vertical" } });
    sys.value = cfg.systemPrompt || "";
    sys.addEventListener("change", () => ctx.saveCfg({ systemPrompt: sys.value }));
    sys.addEventListener("keydown", e => e.stopPropagation());
    body.appendChild(panel([label("System prompt (sent first in every request)"), sys]));

    const send = select([{ value: "enter", label: "Enter" }, { value: "ctrl_enter", label: "Ctrl+Enter" }], cfg.sendKey, v => ctx.saveCfg({ sendKey: v }));
    body.appendChild(panel([label("Send key (Generate from the prompt field)"), send, hint("Shift+Enter always makes a new line.")]));

    const manual = el("div", { text: MANUAL_TEXT, style: { fontSize: "11px", lineHeight: "1.6", color: C.text, whiteSpace: "pre-wrap" } });
    body.appendChild(panel([label("Manual"), manual]));
  }

  // "Vertex" as one more entry in the LLM and Translation Backend lists — this node only. Picking it is stored in
  // config_vertex.json; the shared backend (Connect Custom for Ollama / LM Studio etc.) stays as it is for every node.
  const ON = { text: "llmVertex", vision: "llmVisionVertex", translate: "trVertex" };
  const MODEL = { text: "llmModel", vision: "llmVisionModel", translate: "trModel" };
  ctx.extraBackend = {
    label: "Vertex",
    isOn: role => !!ctx.cfg[ON[role]],
    set: (role, on) => { if (!!ctx.cfg[ON[role]] !== on) ctx.saveCfg({ [ON[role]]: on }); },
    controls(role) {
      const box = el("div", { style: { display: "flex", flexDirection: "column", gap: "4px" } });
      const draw = () => {
        while (box.firstChild) box.removeChild(box.firstChild);
        const list = ["", ...ctx.models.chat]; const cur = ctx.cfg[MODEL[role]] || "";
        if (cur && !list.includes(cur)) list.push(cur);
        box.append(label("Vertex model"), select(list.map(v => ({ value: v, label: v || "— select a model —" })), cur, v => ctx.saveCfg({ [MODEL[role]]: v })));
        if (!ctx.models.chat.length) box.appendChild(hint("No chat models — is the Vertex OpenAI Proxy running? (Model tab → Test connection)"));
      };
      draw();
      ctx.loadModels?.().then(draw).catch(() => {});
      return box;
    },
  };

  const llmPanel = panel([]);
  ov.appendChild(llmPanel);
  mountLLMSettingsSection(llmPanel, ctx);

  // tabSettings moves everything except the header and the LLM panel into the Model tab
  const tabs = tabSettings(ov, llmPanel, { brand: C.lime, bg: C.bg2, border: C.border, nodeKey: "vertex", extraBackend: ctx.extraBackend });
  return {
    el: ov, render,
    show() { render(); ov.style.display = "flex"; },
    showTab(name) { render(); tabs.show(name); ov.style.display = "flex"; },
    hide() { ov.style.display = "none"; },
  };
}

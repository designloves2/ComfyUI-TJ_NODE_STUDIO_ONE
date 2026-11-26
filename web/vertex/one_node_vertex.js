// one_node_vertex.js — Vertex Image ONE STUDIO (TJ)
// Chat-style generation through the local Vertex OpenAI Proxy (port of the Vertex AI Studio app), laid out like the other
// ONE STUDIO nodes and structured after H3: a mode bar (IMAGE now; VIDEO / MUSIC slots for later), a left menu of
// accordions per mode, a big preview, the prompt area with the shared LLM tools, ⚙ Settings (Model / LLM / Translation /
// Node Skin), 🖼 Gallery (H3's image gallery) and ? Manual. Server side: vertex_studio_backend.py.
import { app } from "../../../scripts/app.js";
import { C, BRAND, PREVIEW_SIZE, LEFT_W, PAD, ASPECTS, el, clear, loadState, saveState, defaultState, MANUAL_TEXT } from "./core_vertex.js";
import { panel, label, button, row, col, modeBar, iconBtn, select, numberField } from "../klein/ui_common.js";
import { call, viewUrl, urlToDataUri } from "./api_vertex.js";
import { createSettingsOverlay } from "./ui_app_settings_vertex.js";
import { createImageGalleryOverlay } from "./ui_gallery_vertex.js";
import { attachLLMPanel } from "../shared/llm_panel.js";
import { attachNodeState, restoreNodeState } from "../shared/node_state.js";
import { OUTER_W, OUTER_H } from "../shared/node_size.js";
import { attachPanZoom } from "../shared/pan_zoom.js";
import { createImagePromptBilingual } from "../shared/bilingual_image.js";

// ── Layout ───────────────────────────────────────────────────────────────────
const TOPBAR_H   = 40;
const BOTTOM_PAD = 20;
const STRIP_H    = 78;
const PROMPT_LBL = 18;
const UI_W       = OUTER_W - 30;
const UI_H       = OUTER_H - 40 - 2 * 20;            // two output slots (image, prompt)
const RIGHT_H    = UI_H - PAD - TOPBAR_H - PAD - BOTTOM_PAD;
const PREV_H     = Math.min(PREVIEW_SIZE, RIGHT_H - STRIP_H - PAD - PAD - 190);
const PROMPT_H   = RIGHT_H - PREV_H - PAD - STRIP_H - PAD;

// H3-style mode bar. Only IMAGE exists in the source app so far; VIDEO and MUSIC are reserved slots.
const MODES = [
  { key: "chat",  label: "IMAGE",  enabled: true },
  { key: "video", label: "VIDEO",  enabled: false, reason: "Coming later" },
  { key: "music", label: "MUSIC",  enabled: false, reason: "Coming later" },
];

const ENHANCE_SYSTEM = `You rewrite image-generation requests into a single, vivid, production-ready prompt for Google's Gemini image model (Nano Banana).
- Keep every concrete instruction from the user (subject, text to render, colors, layout, edits to the previous image).
- If the request edits a previous result, phrase it as an edit ("Keep the composition, change ...").
- Add lighting, composition, lens/style and material detail only where it helps; never contradict the user.
- Text that must appear in the image stays in its original language, in quotes.
- Reply with the prompt only. No preface, no markdown, no quotes around the whole prompt.`;

app.registerExtension({
  name: "TJ.VertexImageONE.v1",

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "VertexImageOneTJNode") return;

    nodeType.prototype.onNodeCreated = function () {
      this.color = BRAND; this.bgcolor = C.bg0; this.title_color = "#ffffff";
      this.resizable = false; this.size = [OUTER_W, OUTER_H];
      this._buildUI();
    };
    nodeType.prototype.onConfigure = function () { this.size = [OUTER_W, OUTER_H]; restoreNodeState(this); };
    nodeType.prototype.onResize = function () { this.size = [OUTER_W, OUTER_H]; };
    nodeType.prototype.getSlotMenuOptions = function () { return []; };

    nodeType.prototype._buildUI = function () {
      const self = this;
      const state = defaultState(loadState());
      const persist = attachNodeState(self, { state, save: saveState, normalize: defaultState, rerender: () => self._tjRepaint?.() });

      if (!document.getElementById("vertex-v1-styles")) {
        const s = document.createElement("style"); s.id = "vertex-v1-styles";
        s.textContent = `@keyframes vertexv1-spin{to{transform:rotate(360deg)}}.vertexv1-lp::-webkit-scrollbar{width:4px;height:4px}.vertexv1-lp::-webkit-scrollbar-track{background:transparent}.vertexv1-lp::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px}`;
        document.head.appendChild(s);
      }

      // ctx: what the shared panels (LLM settings, gallery, settings overlay) read
      const ctx = { persist, cfg: {}, models: { image: [], chat: [] }, rootEl: null, showPopup: null };
      let conv = null, convs = [], attachments = [], continueFrom = "", busy = false, viewing = null;

      // ── Root ──────────────────────────────────────────────────────────────
      const root = el("div", { style: {
        width: `${UI_W}px`, height: `${UI_H}px`, boxSizing: "border-box", position: "relative", overflow: "hidden",
        background: C.bg0, borderRadius: "8px", padding: `${PAD}px ${PAD}px ${BOTTOM_PAD}px ${PAD}px`,
        color: C.text, fontFamily: "'Segoe UI',sans-serif",
      }});
      root.dataset.tjNode = "vertex";
      ctx.rootEl = root;

      let popTimer;
      function showPopup(msg, isError = true) {
        let pop = root.querySelector(".vertexv1-pop");
        if (!pop) {
          pop = el("div", { style: { position: "absolute", bottom: "30px", left: "50%", transform: "translateX(-50%)", background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "6px 14px", fontSize: "11px", color: C.text, zIndex: "10001", maxWidth: "80%", textAlign: "center", pointerEvents: "none", whiteSpace: "pre-wrap" } });
          pop.className = "vertexv1-pop"; root.appendChild(pop);
        }
        pop.textContent = msg; pop.style.color = isError ? C.err : BRAND; pop.style.opacity = "1";
        clearTimeout(popTimer); popTimer = setTimeout(() => pop.style.opacity = "0", isError ? 5000 : 3000);
      }
      ctx.showPopup = showPopup;

      // ── server config (generation settings live on the server, shared by every chat) ──
      ctx.saveCfg = async patch => {
        Object.assign(ctx.cfg, patch);
        try { ctx.cfg = await call("/config", patch); } catch (e) { showPopup(e.message); }
        renderLeft(); renderMeter();
      };
      ctx.loadModels = async (refresh = false) => {
        const q = refresh ? "&refresh=1" : "";
        const [i, c] = await Promise.all([call(`/models?type=image${q}`), call(`/models?type=chat${q}`)]);
        ctx.models = { image: i.models, chat: c.models };
        renderLeft();
        return ctx.models;
      };

      // ── Topbar ────────────────────────────────────────────────────────────
      const topBar = el("div", { style: { display: "flex", alignItems: "center", gap: "6px", height: `${TOPBAR_H}px`, marginBottom: `${PAD}px`, flexShrink: "0" } });
      const pillsWrap = el("div", { style: { flex: "1" } });
      function renderPills() { clear(pillsWrap); pillsWrap.appendChild(modeBar(MODES, state.mode, k => { state.mode = k; persist(); renderPills(); renderLeft(); })); }
      const resetBtn = iconBtn("↺", "Reset the node's prompt and panels (chats and settings are kept)", () => {
        if (!confirm("Reset the prompt and the panel layout? Chats, images and settings are kept.")) return;
        const keep = { convId: state.convId, selected: state.selected };
        Object.assign(state, defaultState({}), keep); persist(); imgBil.refresh(); updateCount(); renderLeft(); showPopup("Reset done.", false);
      });
      resetBtn.style.cssText += `background:#ffffff;color:${BRAND};border:2px solid ${BRAND};border-radius:6px;padding:4px 8px;font-weight:700;`;
      let settingsOv, galleryOv, helpOv;
      topBar.append(pillsWrap, resetBtn,
        iconBtn("⚙", "Settings", () => settingsOv?.show()),
        iconBtn("🖼", "Gallery", () => galleryOv?.show()),
        iconBtn("?", "Manual", () => helpOv?.show()));
      root.appendChild(topBar);

      // ── Main row ──────────────────────────────────────────────────────────
      const mainRow = el("div", { style: { display: "flex", gap: `${PAD}px`, height: `${RIGHT_H}px`, flexShrink: "0" } });
      const leftOuter = el("div", { style: { width: `${LEFT_W}px`, flexShrink: "0", height: `${RIGHT_H}px`, display: "flex", flexDirection: "column" } });
      const leftPanel = el("div", { style: { flex: "1", overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column", gap: "6px" } });
      leftPanel.className = "vertexv1-lp";
      leftOuter.appendChild(leftPanel);
      const rightPanel = el("div", { style: { flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: `${PAD}px`, height: `${RIGHT_H}px` } });

      // ── Preview ───────────────────────────────────────────────────────────
      const previewBox = el("div", { style: { width: "100%", height: `${PREV_H}px`, flexShrink: "0", background: "#000", borderRadius: "8px", border: `1px solid ${C.border}`, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" } });
      const placeholder = el("div", { text: "Generate to see result", style: { color: C.muted, fontSize: "12px", textAlign: "center", whiteSpace: "pre-wrap" } });
      const finalImg = el("img", { style: { width: "100%", height: "100%", objectFit: "contain", display: "none" } });
      const loadingOv = el("div", { style: { position: "absolute", inset: "0", background: "rgba(0,0,0,0.55)", display: "none", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px", zIndex: "10" } });
      const spinner = el("div", { style: { width: "44px", height: "44px", border: `3px solid ${C.border}`, borderTop: `3px solid ${BRAND}`, borderRadius: "50%", animation: "vertexv1-spin 0.8s linear infinite" } });
      const loadingText = el("div", { text: "Generating…", style: { color: C.text, fontSize: "12px" } });
      loadingOv.append(spinner, loadingText);
      const caption = el("div", { style: { position: "absolute", left: "0", right: "0", bottom: "0", zIndex: "4", padding: "8px 10px", background: "linear-gradient(transparent, rgba(0,0,0,0.85))", fontSize: "11px", color: "#ddd", display: "none", maxHeight: "40%", overflowY: "auto", whiteSpace: "pre-wrap" } });
      caption.className = "vertexv1-lp";
      const actBar = el("div", { style: { position: "absolute", top: "6px", left: "6px", zIndex: "5", display: "none", gap: "4px" } });
      const smallBtn = (t, tip, fn) => el("button", { type: "button", text: t, title: tip, style: { background: "rgba(0,0,0,0.7)", color: "#fff", border: "none", borderRadius: "4px", padding: "3px 8px", cursor: "pointer", fontSize: "11px", fontFamily: "inherit" }, onclick: e => { e.stopPropagation(); fn(); } });
      const contBtn = smallBtn("↪ Continue from this", "The next message edits this image", () => { if (viewing) { continueFrom = viewing.id; renderChips(); promptTA.focus(); } });
      const outBtn = smallBtn("Use as node output", "The node's IMAGE output gives this image", () => viewing && pickOutput(viewing));
      const fullBtn = smallBtn("⛶", "Full screen", () => viewing && openFullscreen(viewUrl(viewing)));
      // Sends this image's message again as a NEW paid request (skips the same-request reuse).
      const varBtn = smallBtn("↻ New variation", "Send this image's message again as a new (paid) request — an identical request otherwise reuses the earlier result for free", () => {
        const { user } = turnOf(viewing);
        if (!user || busy) return;
        if (!confirm("Send this message again as a new request?\nThis is a new paid call to Vertex.")) return;
        generate({ prompt: user.text, continueFrom: user.continueFrom || "", bypass: true });
      });
      actBar.append(contBtn, outBtn, varBtn, fullBtn);
      let zoomEnabled = true;
      const zoomLockBtn = el("button", { type: "button", text: "🔓", title: "Scroll zoom on/off", style: { position: "absolute", top: "6px", right: "6px", zIndex: "5", background: "rgba(0,0,0,0.65)", color: "#fff", border: "none", borderRadius: "4px", width: "22px", height: "22px", cursor: "pointer", fontSize: "11px", padding: "0", display: "none" } });
      zoomLockBtn.addEventListener("click", () => { zoomEnabled = !zoomEnabled; zoomLockBtn.textContent = zoomEnabled ? "🔓" : "🔒"; if (!zoomEnabled) pz.reset(); });
      previewBox.append(placeholder, finalImg, caption, actBar, zoomLockBtn, loadingOv);
      const pz = attachPanZoom(previewBox, () => [finalImg], { enabled: () => zoomEnabled && !!viewing });

      function openFullscreen(url) {
        const ov = el("div", { style: { position: "fixed", inset: "0", zIndex: "100050", background: "rgba(0,0,0,0.95)", display: "flex", alignItems: "center", justifyContent: "center" } });
        const host = el("div", { style: { width: "96vw", height: "94vh", overflow: "hidden", position: "relative" } });
        const im = el("img", { src: url, style: { width: "100%", height: "100%", objectFit: "contain" } });
        host.appendChild(im); ov.appendChild(host);
        const close = () => { document.removeEventListener("keydown", onKey, true); ov.remove(); };
        const onKey = e => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
        ov.addEventListener("mousedown", e => { if (e.target === ov) close(); });
        document.addEventListener("keydown", onKey, true);
        document.body.appendChild(ov);
        attachPanZoom(host, [im]);
      }

      function showImage(img) {
        viewing = img;
        pz.reset();
        if (!img) {
          finalImg.style.display = "none"; placeholder.style.display = "block"; actBar.style.display = "none"; zoomLockBtn.style.display = "none";
          placeholder.textContent = !ctx.cfg.model ? "Select an image model in the left menu (MODEL) first." : conv?.messages?.length ? "Pick an image in the strip below." : "Describe an image below and press Generate.\nEvery next message edits the latest result.";
          renderCaption(null); return;
        }
        placeholder.style.display = "none"; finalImg.src = viewUrl(img); finalImg.style.display = "block";
        actBar.style.display = img.kind === "attached" ? "none" : "flex"; zoomLockBtn.style.display = "block";
        const isOut = state.selected?.file === img.file;
        outBtn.textContent = isOut ? "✓ Node output" : "Use as node output";
        outBtn.style.background = isOut ? BRAND : "rgba(0,0,0,0.7)";
        renderCaption(img);
      }

      function turnOf(img) {
        const ms = conv?.messages || [];
        const i = ms.findIndex(m => (m.images || []).some(x => x.id === img?.id));
        if (i < 0) return {};
        const user = ms[i].role === "user" ? ms[i] : [...ms.slice(0, i)].reverse().find(m => m.role === "user");
        return { user, reply: ms[i].role === "assistant" ? ms[i] : null, summary: ms[i].role === "summary" ? ms[i] : null };
      }
      function renderCaption(img) {
        clear(caption);
        const last = conv?.messages?.[conv.messages.length - 1];
        if (!img && last?.role === "assistant" && last.status === "error") {
          caption.style.display = "block";
          caption.appendChild(el("div", { text: "✕ " + (last.error || "Error"), style: { color: C.err } }));
          return;
        }
        if (!img) { caption.style.display = "none"; return; }
        const { user, reply, summary } = turnOf(img);
        caption.style.display = "block";
        if (summary) caption.appendChild(el("div", { text: "Summary: " + summary.text, style: { color: "#9fd8b0" } }));
        if (user) caption.appendChild(el("div", { text: "▸ " + user.text, style: { color: "#fff" } }));
        if (user?.enhanced) caption.appendChild(el("div", { text: "enhanced: " + user.enhanced, style: { color: C.muted } }));
        if (reply?.text) caption.appendChild(el("div", { text: reply.text, style: { color: "#ccc", marginTop: "2px" } }));
        const u = reply?.usage;
        const cost = reply?.cached ? "♻ reused earlier result (no new call)"
          : u && (u.prompt || u.completion) ? `tokens in ${u.prompt.toLocaleString()}${u.cached ? ` (cached ${u.cached.toLocaleString()})` : ""} · out ${u.completion.toLocaleString()}` : "";
        const meta = [reply?.model, reply?.label, reply?.ms ? (reply.ms / 1000).toFixed(1) + "s" : "", img.w ? `${img.w}×${img.h}` : "", cost, reply?.notes ? "not applied: " + reply.notes : ""].filter(Boolean);
        if (meta.length) caption.appendChild(el("div", { text: meta.join(" · "), style: { color: C.muted, fontSize: "10px", marginTop: "2px" } }));
      }

      // ── Chat strip (every image in the chat, in order) ─────────────────────
      const strip = el("div", { style: { height: `${STRIP_H}px`, flexShrink: "0", display: "flex", gap: "6px", alignItems: "center", overflowX: "auto", overflowY: "hidden", background: C.bg1, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "0 8px", boxSizing: "border-box" } });
      strip.className = "vertexv1-lp";
      strip.addEventListener("wheel", e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { strip.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
      function renderStrip() {
        clear(strip);
        const ms = conv?.messages || [];
        if (!ms.length) { strip.appendChild(el("div", { text: "This chat's images appear here.", style: { color: C.muted, fontSize: "11px" } })); return; }
        let turn = 0;
        for (const m of ms) {
          if (m.role === "user") { turn++; strip.appendChild(el("div", { text: String(turn), title: m.text, style: { color: C.muted, fontSize: "10px", fontWeight: "700", flexShrink: "0", padding: "0 2px" } })); }
          if (m.role === "summary") strip.appendChild(el("div", { text: "≡", title: "Summary: " + m.text, style: { color: "#9fd8b0", fontSize: "14px", flexShrink: "0" } }));
          if (m.role === "assistant" && m.status === "pending") strip.appendChild(el("div", { style: { width: "40px", height: "40px", flexShrink: "0", border: `3px solid ${C.border}`, borderTop: `3px solid ${BRAND}`, borderRadius: "50%", animation: "vertexv1-spin 0.8s linear infinite" } }));
          if (m.role === "assistant" && m.status === "error") strip.appendChild(el("div", { text: "✕", title: m.error, style: { color: C.err, fontSize: "14px", flexShrink: "0", cursor: "help" } }));
          for (const img of m.images || []) {
            const ref = img.kind === "attached";
            const sz = ref ? 40 : 60;
            const isView = viewing?.id === img.id, isOut = state.selected?.file === img.file, isCont = continueFrom === img.id;
            const t = el("div", { title: ref ? "Attached reference" : (m.role === "summary" ? "Kept by the summary" : "Click to view"), style: { position: "relative", flexShrink: "0", width: `${sz}px`, height: `${sz}px`, borderRadius: "5px", overflow: "hidden", cursor: "pointer", border: `2px solid ${isView ? BRAND : isCont ? "#ffb347" : "transparent"}`, background: "#000" } });
            t.appendChild(el("img", { src: viewUrl(img), loading: "lazy", style: { width: "100%", height: "100%", objectFit: "cover", display: "block" } }));
            if (ref) t.appendChild(el("div", { text: "📎", style: { position: "absolute", bottom: "0", right: "1px", fontSize: "10px" } }));
            if (isOut) t.appendChild(el("div", { text: "✓", title: "Node output", style: { position: "absolute", top: "1px", right: "2px", fontSize: "11px", fontWeight: "700", color: "#fff", background: BRAND, borderRadius: "3px", padding: "0 3px" } }));
            t.addEventListener("click", () => { showImage(img); renderStrip(); });
            t.addEventListener("dblclick", () => openFullscreen(viewUrl(img)));
            strip.appendChild(t);
          }
        }
        requestAnimationFrame(() => { strip.scrollLeft = strip.scrollWidth; });
      }

      // ── Prompt expand overlay (shared LLM panel lives in it) ─────────────────
      const promptExpandEl = el("div", { style: { position: "absolute", inset: "0", zIndex: "9997", background: "rgba(11,11,11,0.97)", borderRadius: "inherit", display: "none", flexDirection: "column", padding: "14px", gap: "8px", boxSizing: "border-box" } });
      const pxHdr = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" } });
      pxHdr.appendChild(el("div", { text: "🔍 Prompt — Full Screen Edit", style: { color: "#fff", fontSize: "13px", fontWeight: "700", flex: "1" } }));
      const pxTA = el("textarea", { style: { flex: "1", background: C.bg2, color: C.text, border: `1px solid ${BRAND}`, borderRadius: "6px", padding: "10px", fontSize: "13px", fontFamily: "inherit", resize: "none", outline: "none" } });
      pxHdr.append(button("✓ Apply", () => { imgBil.refresh(); persist(); updateCount(); promptExpandEl.style.display = "none"; }, "primary"),
                   button("✕ Close", () => { promptExpandEl.style.display = "none"; }, "danger"));
      promptExpandEl.append(pxHdr, pxTA);
      const promptExpandOv = { show() { promptExpandEl._tj_llm_onshow?.(); promptExpandEl.style.display = "flex"; setTimeout(() => pxTA.focus(), 50); } };

      function getModePrompt(mode) { if (!state.promptsByMode) state.promptsByMode = {}; if (!(mode in state.promptsByMode)) state.promptsByMode[mode] = ""; return state.promptsByMode[mode]; }
      function setModePrompt(mode, v) { if (!state.promptsByMode) state.promptsByMode = {}; state.promptsByMode[mode] = v; state.prompt = v; }
      // This node's own LLM / translation route through the Vertex proxy (⚙ Settings → LLM / Translation, "Vertex").
      // Off = the shared settings every node uses. On without a model = the call fails with "pick a model" (no fallback).
      const proxyBase = () => String(ctx.cfg.proxyUrl || "http://127.0.0.1:3000").replace(/\/+$/, "") + "/v1";
      const vertexTranslate = async (system, user) => {
        if (!ctx.cfg.trModel) throw new Error("Translation is set to Vertex but no model is selected (⚙ Settings → Translation).");
        return (await call("/chat", { model: ctx.cfg.trModel, system, user })).text;
      };
      const route = {
        text:   () => ctx.cfg.llmVertex ? { backend: "custom", custom_base: proxyBase(), custom_model: ctx.cfg.llmModel || "", custom_ctx: 0 } : null,
        vision: () => ctx.cfg.llmVisionVertex ? { backend: "custom", custom_base: proxyBase(), custom_model: ctx.cfg.llmVisionModel || "", custom_ctx: 0 } : null,
        translate: () => ctx.cfg.trVertex ? vertexTranslate : null,
      };
      const imgBil = createImagePromptBilingual({ state, getModePrompt, setModePrompt, persist, onError: m => showPopup(m), llm: route.translate });
      const llmApi = attachLLMPanel({ bilingual: imgBil.panel, promptExpandEl, pxTA, getModePrompt, setModePrompt, state, persist, updateCount,
        getPromptTA: () => promptTA, openSettings: () => settingsOv?.showTab("LLM"), defaultModelFormat: "Universal Natural Language",
        systemPrompt: () => ENHANCE_SYSTEM, route });

      // ── Prompt area ────────────────────────────────────────────────────────
      const promptWrap = el("div", { style: { height: `${PROMPT_H}px`, flexShrink: "0", display: "flex", flexDirection: "column", gap: "4px" } });
      const charCount = el("span", { style: { color: C.muted, fontSize: "10px", marginLeft: "6px" } });
      const promptHdr = el("div", { style: { display: "flex", alignItems: "center", height: `${PROMPT_LBL}px` } });
      promptHdr.append(el("div", { text: "PROMPT", style: { color: C.muted, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.04em" } }), charCount);
      const autoEnhanceChk = el("input", { type: "checkbox", style: { cursor: "pointer" } });
      autoEnhanceChk.checked = !!state.autoEnhance;
      autoEnhanceChk.addEventListener("change", () => { state.autoEnhance = autoEnhanceChk.checked; persist(); });
      promptHdr.appendChild(el("label", { title: "Run Prompt Enhance on the prompt right before Generate (⚙ Settings → LLM).", style: { display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: C.muted, cursor: "pointer", marginLeft: "auto" } }, [autoEnhanceChk, el("span", { text: "Auto Enhance" })]));
      const hdrBtn = (t, tip, fn) => el("button", { type: "button", text: t, title: tip, style: { cursor: "pointer", background: BRAND, border: "none", borderRadius: "4px", fontSize: "11px", fontWeight: "700", color: "#fff", padding: "3px 8px", marginLeft: "6px" }, onclick: fn });
      promptHdr.append(
        hdrBtn("🔧 Refine", "Revise the current prompt from an instruction", () => llmApi.refine()),
        hdrBtn("🔍 Prompt Edit", "Expand edit", () => promptExpandOv.show()));
      const tplBtn = hdrBtn("📋 Prompt Preset", "Load Template", () => {});
      promptHdr.appendChild(tplBtn);

      const chips = el("div", { style: { display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap", flexShrink: "0" } });
      const promptTA = el("textarea", { placeholder: "Describe an image, or how to change the last one…  (Ctrl+V / drop to attach images · /compact to summarize)", style: { flex: "1", width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "7px", fontSize: "13px", fontFamily: "inherit", outline: "none", resize: "none", overflowY: "auto" } });
      function updateCount() { const n = getModePrompt(state.mode).trim().length; charCount.textContent = ` (${n} chars)`; }
      promptTA.addEventListener("input", () => { setModePrompt(state.mode, promptTA.value); persist(); updateCount(); });
      promptTA.addEventListener("focus", () => promptTA.style.borderColor = BRAND);
      promptTA.addEventListener("blur", () => promptTA.style.borderColor = C.border);
      promptTA.addEventListener("keydown", e => {
        if (e.key !== "Enter" || e.shiftKey) return;
        const ctrlMode = ctx.cfg.sendKey === "ctrl_enter";
        if (ctrlMode === (e.ctrlKey || e.metaKey)) { e.preventDefault(); generate(); }
      });
      promptTA.addEventListener("paste", e => {
        const files = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith("image/"));
        if (files.length) { e.preventDefault(); addFiles(files); }
      });
      imgBil.refresh(); updateCount();
      promptWrap.append(promptHdr, chips, imgBil.attach(promptTA).el);
      for (const t of [previewBox, promptWrap]) {
        t.addEventListener("dragover", e => { e.preventDefault(); e.stopPropagation(); });
        t.addEventListener("drop", e => { e.preventDefault(); e.stopPropagation(); addFiles([...(e.dataTransfer?.files || [])].filter(f => f.type.startsWith("image/"))); });
      }

      // attachments
      const fileIn = el("input", { type: "file", accept: "image/*", multiple: "multiple", style: { display: "none" } });
      fileIn.addEventListener("change", () => { addFiles([...fileIn.files]); fileIn.value = ""; });
      root.appendChild(fileIn);
      async function addFiles(files) {
        for (const f of files) attachments.push(await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); }));
        renderChips();
      }
      function chipBtn(t, tip, fn) { return el("button", { type: "button", text: t, title: tip, style: { cursor: "pointer", fontFamily: "inherit", fontSize: "11px", padding: "3px 8px", borderRadius: "12px", background: C.bg2, color: C.text, border: `1px solid ${C.border}` }, onclick: fn }); }
      function renderChips() {
        clear(chips);
        chips.append(chipBtn("📎 Attach", "Add reference images (or paste / drop them)", () => fileIn.click()),
          chipBtn("🖼 From gallery", "Use a gallery image as a reference", () => galleryOv.showPicker(async (_n, v) => {
            try { attachments.push(await urlToDataUri(`/view?filename=${encodeURIComponent(v.filename)}&subfolder=${encodeURIComponent(v.subfolder || "")}&type=output`)); renderChips(); }
            catch (e) { showPopup(e.message); }
          })));
        if (continueFrom) {
          const img = (conv?.messages || []).flatMap(m => m.images || []).find(i => i.id === continueFrom);
          const c = el("div", { style: { display: "flex", alignItems: "center", gap: "4px", background: "#2a1d0a", border: "1px solid #ffb347", borderRadius: "12px", padding: "1px 6px", fontSize: "10.5px" } });
          if (img) c.appendChild(el("img", { src: viewUrl(img), style: { width: "18px", height: "18px", objectFit: "cover", borderRadius: "3px" } }));
          c.append(el("span", { text: "Continue from this" }), el("span", { text: "✕", style: { cursor: "pointer" }, onclick: () => { continueFrom = ""; renderChips(); renderStrip(); } }));
          chips.appendChild(c);
        }
        attachments.forEach((uri, i) => {
          const c = el("div", { style: { position: "relative" } });
          c.append(el("img", { src: uri, style: { width: "26px", height: "26px", objectFit: "cover", borderRadius: "4px", border: `1px solid ${C.border}`, display: "block" } }),
            el("span", { text: "✕", style: { position: "absolute", top: "-6px", right: "-6px", cursor: "pointer", background: C.err, color: "#fff", borderRadius: "50%", width: "13px", height: "13px", fontSize: "8px", lineHeight: "13px", textAlign: "center" }, onclick: () => { attachments.splice(i, 1); renderChips(); } }));
          chips.appendChild(c);
        });
        renderStrip();
      }

      rightPanel.append(previewBox, strip, promptWrap);
      mainRow.append(leftOuter, rightPanel);
      root.appendChild(mainRow);

      // ── Generate / Stop (bottom of the left menu, like every ONE STUDIO node) ─
      const genWrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "4px", paddingTop: "6px", flexShrink: "0", borderTop: `1px solid ${C.border}` } });
      const meter = el("div", { style: { fontSize: "10.5px", color: C.muted, display: "flex", alignItems: "center", gap: "6px" } });
      const genBtn = button("▶ Generate", () => generate(), "primary");
      genBtn.style.cssText += "width:100%;padding:11px;font-size:13px;";
      let aborter = null;
      const stopBtn = button("■ Stop", () => { aborter?.abort(); });
      stopBtn.style.flexShrink = "0";
      genWrap.append(meter, row([genBtn, stopBtn]));
      leftOuter.appendChild(genWrap);

      function renderMeter() {
        clear(meter);
        if (!conv) return;
        const limit = ctx.cfg.contextLimit || 65536, used = conv.tokens || 0, pct = Math.min(100, Math.round(used / limit * 100));
        const bar = el("div", { style: { flex: "1", height: "5px", background: C.bg3, borderRadius: "3px", overflow: "hidden" } },
          [el("div", { style: { width: `${pct}%`, height: "100%", background: pct >= (ctx.cfg.autoCompact || 101) ? C.warn : BRAND } })]);
        meter.append(el("span", { text: "Context" }), bar, el("span", { text: `~${used.toLocaleString()} / ${limit.toLocaleString()}` }));
        // what this chat has used so far, as the proxy reported it (reused results count 0)
        const tot = (conv.messages || []).reduce((a, m) => { const u = m.usage; if (u) { a.i += u.prompt || 0; a.o += u.completion || 0; a.n += m.cached ? 0 : 1; } return a; }, { i: 0, o: 0, n: 0 });
        meter.title = `This chat so far: ${tot.n} paid image call(s) · tokens in ${tot.i.toLocaleString()} · out ${tot.o.toLocaleString()}`;
      }

      // ── Left menu: H3-style accordions per mode ─────────────────────────────
      function accordion(key, title, summary, body) {
        const open = !!state.accordion?.[key];
        const head = el("div", { style: { display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", userSelect: "none", padding: "1px 0" } });
        head.append(
          el("div", { text: open ? "▼" : "▶", style: { fontSize: "9px", color: C.muted, width: "10px", flexShrink: "0" } }),
          el("div", { text: title, style: { fontSize: "10px", fontWeight: "700", letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted, flexShrink: "0" } }),
          el("div", { text: summary || "", title: summary || "", style: { flex: "1", textAlign: "right", fontSize: "10px", color: summary && summary !== "OFF" ? BRAND : C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }));
        head.addEventListener("click", () => { state.accordion = { ...(state.accordion || {}), [key]: !open }; persist(); renderLeft(); });
        return panel([head, ...(open ? body().filter(Boolean) : [])], { marginBottom: "0" });
      }
      const field = (t, input) => el("div", { style: { display: "flex", flexDirection: "column", marginTop: "6px" } }, [label(t), input]);
      const cfgSelect = (key, opts) => select(opts.map(o => typeof o === "string" ? { value: o, label: o } : o), ctx.cfg[key], v => ctx.saveCfg({ [key]: v }));
      const cfgCheck = (key, text, tip = "") => {
        const c = el("input", { type: "checkbox", style: { cursor: "pointer", accentColor: BRAND } }); c.checked = !!ctx.cfg[key];
        c.addEventListener("change", () => ctx.saveCfg({ [key]: c.checked }));
        return el("label", { title: tip, style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "11.5px", color: C.text, cursor: "pointer", marginTop: "6px" } }, [c, el("span", { text })]);
      };
      const cfgNum = (key, min, max) => { const n = numberField(ctx.cfg[key] ?? 0, () => {}); n.min = min; n.max = max; n.addEventListener("change", () => ctx.saveCfg({ [key]: Math.max(min, Math.min(max, parseInt(n.value) || 0)) })); return n; };
      const cfgText = key => { const i = el("input", { type: "text", style: { width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "6px", fontSize: "12px", fontFamily: "inherit", outline: "none" } }); i.value = ctx.cfg[key] ?? ""; i.addEventListener("change", () => ctx.saveCfg({ [key]: i.value.trim() })); i.addEventListener("keydown", e => e.stopPropagation()); return i; };

      function chatsSection() {
        const list = el("div", { style: { display: "flex", flexDirection: "column", gap: "2px", maxHeight: "220px", overflowY: "auto", marginTop: "6px" } });
        list.className = "vertexv1-lp";
        for (const c of convs) {
          const on = conv?.id === c.id;
          const it = el("div", { style: { display: "flex", gap: "8px", alignItems: "center", padding: "4px 6px", borderRadius: "6px", cursor: "pointer", background: on ? C.bg3 : "transparent", borderLeft: `3px solid ${on ? BRAND : "transparent"}` } });
          const th = el("div", { style: { width: "30px", height: "30px", borderRadius: "4px", background: C.bg2, flexShrink: "0", overflow: "hidden" } });
          if (c.thumb) th.appendChild(el("img", { src: viewUrl(c.thumb), loading: "lazy", style: { width: "100%", height: "100%", objectFit: "cover" } }));
          it.append(th, el("div", { style: { minWidth: "0", flex: "1" } }, [
            el("div", { text: c.title, title: c.title, style: { fontSize: "11.5px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: on ? "#fff" : C.text } }),
            el("div", { text: new Date(c.updatedAt).toLocaleString(), style: { fontSize: "9.5px", color: C.muted } })]));
          it.addEventListener("click", () => openConv(c.id));
          list.appendChild(it);
        }
        if (!convs.length) list.appendChild(el("div", { text: "No chats yet — press Generate to start one.", style: { color: C.muted, fontSize: "11px" } }));
        const small = (t, tip, fn, variant) => { const b = button(t, fn, variant); b.title = tip; b.style.cssText += "padding:4px 8px;font-size:11px;flex:1;"; return b; };
        return [el("div", { style: { display: "flex", gap: "4px", marginTop: "6px" } }, [
          small("+ New", "Start a new chat", () => newConv(), "primary"),
          small("Rename", "Rename this chat", () => rename()),
          small("Compact", "Summarize this chat so it continues with a short history", () => compact()),
          small("Delete", "Move this chat to the gallery trash (its images stay in the gallery)", () => removeConv(), "danger")]), list];
      }

      function renderLeft() {
        clear(leftPanel);
        if (state.mode !== "chat") { leftPanel.appendChild(panel([label(state.mode.toUpperCase()), el("div", { text: "Coming later.", style: { color: C.muted, fontSize: "11px" } })])); return; }
        const c = ctx.cfg;
        leftPanel.appendChild(accordion("chats", "Chats", conv ? conv.title : "", chatsSection));
        leftPanel.appendChild(accordion("model", "Model", c.model || "not selected", () => {
          const opts = ["", ...ctx.models.image]; if (c.model && !opts.includes(c.model)) opts.push(c.model);
          const refresh = button("⟳", async () => { try { await ctx.loadModels(true); showPopup("Model list refreshed.", false); } catch (e) { showPopup(e.message); } });
          refresh.title = "Reload the model list from the proxy"; refresh.style.cssText += "padding:4px 9px;";
          return [el("div", { style: { display: "flex", gap: "4px", marginTop: "6px", alignItems: "center" } }, [
              el("div", { style: { flex: "1" } }, [select(opts.map(v => ({ value: v, label: v || "— select a model —" })), c.model, v => ctx.saveCfg({ model: v }))]), refresh]),
            ctx.models.image.length ? null : el("div", { text: "Proxy not reachable — start the Vertex OpenAI Proxy (⚙ Settings to change the address).", style: { color: C.warn, fontSize: "10.5px", marginTop: "4px" } })];
        }));
        leftPanel.appendChild(accordion("image", "Image", `${c.aspect === "auto" ? "auto (2:3)" : c.aspect} · ${c.size} · ${c.format}`, () => [
          field("Aspect ratio", cfgSelect("aspect", ASPECTS.map(a => ({ value: a, label: a === "auto" ? "auto (2:3)" : a })))),
          field("Resolution", cfgSelect("size", ["1K", "2K", "4K"])),
          field("Format", cfgSelect("format", [{ value: "png", label: "PNG" }, { value: "jpeg", label: "JPEG" }])),
          field("Output", cfgSelect("output", [{ value: "image_text", label: "Image + text" }, { value: "image_only", label: "Image only" }])),
        ]));
        leftPanel.appendChild(accordion("generation", "Generation", `thinking ${c.thinking}`, () => [
          field("Thinking level", cfgSelect("thinking", ["low", "medium", "high"])),
          field("Person generation", cfgSelect("person", [{ value: "allow_all", label: "Allow all" }, { value: "allow_adult", label: "Adults only" }, { value: "dont_allow", label: "Don't allow" }])),
          cfgCheck("celebrities", "Allow celebrities", "Vertex has no field for this yet: the proxy reports it as not applied."),
          field("Media resolution (input images)", cfgSelect("mediaResolution", ["default", "low", "medium", "high"])),
          field("Max output tokens", cfgNum("maxTokens", 256, 65536)),
        ]));
        leftPanel.appendChild(accordion("grounding", "Grounding", c.googleSearch || c.partner ? [c.googleSearch && "Google", c.partner && "Partner"].filter(Boolean).join(" + ") : "OFF", () => [
          cfgCheck("googleSearch", "Google Search grounding"),
          cfgCheck("googleSearchServices", "   + web & image search types"),
          cfgCheck("partner", "Partner grounding"),
          cfgCheck("partnerResults", "   + include partner results"),
          field("Region", cfgText("region")),
        ]));
        leftPanel.appendChild(accordion("history", "History", `${c.historyImages} images · auto ${c.autoCompact ? c.autoCompact + "%" : "OFF"}`, () => [
          field("Images kept in the request", cfgNum("historyImages", 0, 10)),
          field("Context limit (tokens)", cfgNum("contextLimit", 4096, 1048576)),
          field("Auto compact at % (0 = off)", cfgNum("autoCompact", 0, 100)),
        ]));
      }

      // ── chats ──────────────────────────────────────────────────────────────
      async function loadList() { try { convs = (await call("/conversations")).conversations; } catch { convs = []; } }
      async function openConv(id, focusImage = null) {
        try { conv = id ? await call(`/conversation?id=${id}`) : null; } catch { conv = null; }
        state.convId = conv?.id || ""; persist();
        continueFrom = "";
        const imgs = (conv?.messages || []).flatMap(m => m.images || []);
        showImage(focusImage ? imgs.find(i => i.file === focusImage) || null : imgs.filter(i => i.kind !== "attached").pop() || null);
        renderLeft(); renderChips(); renderMeter();
      }
      async function newConv() {
        const c = await call("/conversations", {});
        await loadList(); await openConv(c.id); promptTA.focus();
      }
      async function rename() {
        if (!conv) return;
        const t = prompt("Chat title", conv.title);
        if (!t) return;
        await call("/conversation/rename", { id: conv.id, title: t });
        conv.title = t.trim(); await loadList(); renderLeft();
      }
      async function removeConv() {
        if (!conv || !confirm(`Move the chat "${conv.title}" to the gallery trash?\nIts generated images stay in the gallery.`)) return;
        await call("/conversation/delete", { id: conv.id });
        await loadList(); await openConv(convs[0]?.id || "");
      }
      function setBusy(on, msg = "Generating…") {
        busy = on; genBtn.disabled = on; genBtn.textContent = on ? "⏳ " + msg : "▶ Generate";
        loadingText.textContent = msg; loadingOv.style.display = on ? "flex" : "none";
      }
      async function compact() {
        if (!conv || busy) return;
        if (!ctx.cfg.compactModel) { showPopup("Select a Compact model in ⚙ Settings first."); settingsOv.show(); return; }
        setBusy(true, "Compacting…");
        try { conv = await call("/compact", { conv: conv.id }); renderStrip(); renderMeter(); showPopup("Chat compacted.", false); }
        catch (e) { showPopup(e.message); }
        setBusy(false);
      }
      function pickOutput(img) {
        state.selected = { file: img.file, sub: img.sub }; persist();
        call("/select", { node: String(self.id), conv: conv?.id || "", file: img.file, sub: img.sub }).catch(() => {});
        showImage(img); renderStrip();
      }

      // ── Generate ───────────────────────────────────────────────────────────
      // again: { prompt, continueFrom, bypass } re-sends an earlier message as a new paid call (↻ New variation); the
      // prompt field, attachments and Auto Enhance are left alone then.
      async function generate(again = null) {
        if (busy || state.mode !== "chat") return;
        if (!again && getModePrompt(state.mode).trim() === "/compact") { setModePrompt(state.mode, ""); imgBil.refresh(); updateCount(); return compact(); }
        if (!ctx.cfg.model) { showPopup("Select an image model in the left menu (MODEL) first."); state.accordion.model = true; renderLeft(); return; }
        if (!again && !getModePrompt(state.mode).trim() && !attachments.length) { showPopup("Write a prompt first."); return; }
        if (!again) {
          setBusy(true, state.autoEnhance ? "Enhancing…" : "Translating…");
          try {
            if (state.autoEnhance && getModePrompt(state.mode).trim()) { pxTA.value = getModePrompt(state.mode); await llmApi.enhance(); imgBil.refresh(); persist(); updateCount(); }
            await imgBil.ensure();
          } catch (e) { setBusy(false); showPopup(e.message); return; }
        }
        if (!conv) { try { await newConv(); } catch (e) { setBusy(false); showPopup(e.message); return; } }
        const text = again ? again.prompt : getModePrompt(state.mode).trim();
        const body = again ? { conv: conv.id, prompt: text, attachments: [], continueFrom: again.continueFrom, bypassCache: true }
                           : { conv: conv.id, prompt: text, attachments, continueFrom };
        // optimistic turn: the strip shows the spinner right away
        conv.messages.push({ id: "tmp-u", role: "user", text, images: [] }, { id: "tmp-a", role: "assistant", status: "pending", images: [] });
        renderStrip();
        setBusy(true, "Generating…");
        const t0 = Date.now(); const tick = setInterval(() => { loadingText.textContent = `Generating… ${Math.round((Date.now() - t0) / 1000)}s`; }, 1000);
        aborter = new AbortController();
        try {
          const done = call("/send", body);
          await Promise.race([done, new Promise((_, rej) => aborter.signal.addEventListener("abort", () => rej(new Error("stopped"))))]);
          conv = await done;
          if (!again) { setModePrompt(state.mode, ""); imgBil.refresh(); updateCount(); attachments = []; continueFrom = ""; }
          const last = conv.messages[conv.messages.length - 1];
          const gen = (last?.images || []).filter(i => i.kind === "generated");
          if (gen.length) { pickOutput(gen[gen.length - 1]); if (last.cached) showPopup("Same request as before — reused that result, no new call was made.\n↻ New variation on the image asks for a fresh one.", false); }
          else { showImage(null); if (last?.status === "error") showPopup(last.error || "Error"); }
          const pct = ctx.cfg.autoCompact || 0;
          if (pct > 0 && ctx.cfg.compactModel && (conv.tokens || 0) >= (ctx.cfg.contextLimit || 65536) * pct / 100) { clearInterval(tick); setBusy(false); await compact(); }
        } catch (e) {
          // Stop only lets go of the wait: the proxy call finishes on the server and lands in the chat.
          showPopup(e.message === "stopped" ? "Stopped waiting. The request was already sent to Vertex, so it is still processed and billed; the result lands in this chat when it arrives." : e.message);
          await openConv(body.conv);
        } finally {
          clearInterval(tick); aborter = null; setBusy(false);
          await loadList(); renderLeft(); renderChips(); renderMeter();
        }
      }

      // ── Manual overlay ───────────────────────────────────────────────────────
      const helpEl = el("div", { style: { position: "absolute", inset: "0", zIndex: "9998", background: "rgba(11,11,11,0.98)", borderRadius: "inherit", display: "none", flexDirection: "column", padding: "14px", boxSizing: "border-box" } });
      helpEl.appendChild(el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0", marginBottom: "10px" } }, [
        el("div", { text: "Manual — Vertex Image ONE STUDIO", style: { color: "#fff", fontSize: "14px", fontWeight: "700", flex: "1" } }),
        button("✕", () => helpEl.style.display = "none", "danger")]));
      const helpBody = el("div", { text: MANUAL_TEXT, style: { flex: "1", overflowY: "auto", fontSize: "11.5px", lineHeight: "1.7", color: C.text, whiteSpace: "pre-wrap" } });
      helpBody.className = "vertexv1-lp";
      helpEl.appendChild(helpBody);
      helpOv = { el: helpEl, show() { helpEl.style.display = "flex"; } };

      // ── Overlays ─────────────────────────────────────────────────────────────
      settingsOv = createSettingsOverlay(state, ctx);
      root.appendChild(settingsOv.el);
      // Gallery ↩ Reuse Setting: open the image's chat and make the next message continue from that exact image.
      ctx.reuseImageSettings = (meta, v) => {
        if (!meta?.conv || !convs.some(c => c.id === meta.conv)) return false;
        openConv(meta.conv, v?.filename).then(() => {
          const img = (conv?.messages || []).flatMap(m => m.images || []).find(i => i.file === v?.filename);
          if (img) { continueFrom = img.id; renderChips(); }
        });
        return true;
      };
      galleryOv = createImageGalleryOverlay(state, ctx);
      root.appendChild(galleryOv.el);
      import("../klein/ui_prompt_templates.js").then(mod => {
        if (!mod.createTemplateOverlay) return;
        const tOv = mod.createTemplateOverlay(state, ctx, txt => { imgBil.setEnglish(txt); persist(); updateCount(); }, "vertex");
        root.appendChild(tOv.el);
        tplBtn.onclick = () => tOv.show();
      }).catch(() => {});
      root.append(promptExpandEl, helpEl);

      // ── ESC ────────────────────────────────────────────────────────────────
      document.addEventListener("keydown", e => {
        if (e.key !== "Escape") return;
        if (promptExpandEl.style.display !== "none") { promptExpandEl.style.display = "none"; return; }
        if (helpEl.style.display !== "none") { helpEl.style.display = "none"; return; }
        if (settingsOv?.el.style.display !== "none") { settingsOv.hide(); return; }
        if (galleryOv?.isOpen()) { galleryOv.hide(); return; }
      });

      self.addDOMWidget("vertexv1_ui", "div", root, { serialize: false, computeSize: () => [UI_W, UI_H] });
      self._tjRepaint = () => { imgBil.refresh(); updateCount(); autoEnhanceChk.checked = !!state.autoEnhance; renderPills(); renderLeft(); };
      renderPills(); renderLeft(); renderChips(); showImage(null);

      // ── boot ───────────────────────────────────────────────────────────────
      (async () => {
        try { ctx.cfg = await call("/config"); } catch (e) { showPopup("Vertex: " + e.message); }
        renderLeft(); showImage(null);
        ctx.loadModels(false).catch(() => renderLeft());
        if (state.selected?.file) call("/select", { node: String(self.id), conv: state.convId, file: state.selected.file, sub: state.selected.sub }).catch(() => {});
        await loadList();
        await openConv(convs.some(c => c.id === state.convId) ? state.convId : (convs[0]?.id || ""), state.selected?.file);
      })();
    };
  },
});

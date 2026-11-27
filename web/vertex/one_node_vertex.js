// one_node_vertex.js — Vertex Image ONE STUDIO (TJ)
// Chat-style generation through the local Vertex OpenAI Proxy (port of the Vertex AI Studio app), laid out like the other
// ONE STUDIO nodes and structured after H3: a mode bar (IMAGE now; VIDEO / MUSIC slots for later), a left menu of
// accordions per mode, a big preview, the prompt area with the shared LLM tools, ⚙ Settings (Model / LLM / Translation /
// Node Skin), 🖼 Gallery (H3's image gallery) and ? Manual. Server side: vertex_studio_backend.py.
import { app } from "../../../scripts/app.js";
import { C, BRAND, PREVIEW_SIZE, LEFT_W, PAD, ASPECTS, PROXY_APP_URL, modelName, el, clear, loadState, saveState, defaultState, MANUAL_TEXT } from "./core_vertex.js";
import { panel, label, button, row, col, modeBar, iconBtn, select, numberField } from "../klein/ui_common.js";
import { call, viewUrl, urlToDataUri } from "./api_vertex.js";
import { createSettingsOverlay } from "./ui_app_settings_vertex.js";
import { createImageGalleryOverlay } from "./ui_gallery_vertex.js";
import { attachLLMPanel } from "../shared/llm_panel.js";
import { attachNodeState, restoreNodeState } from "../shared/node_state.js";
import { OUTER_W, OUTER_H } from "../shared/node_size.js";
import { attachPanZoom } from "../shared/pan_zoom.js";
import { createImagePromptBilingual } from "../shared/bilingual_image.js";
// H3's own reference-image slot (upload / 🖼 any gallery / ✕ / drop) and its upload to input/
import { imageSlot } from "../minimax/ui_images_minimax.js";
import { openImageGalleryPicker } from "../shared/ui_image_gallery_picker.js";
import { uploadImage } from "../minimax/api_minimax.js";

// ── Layout ───────────────────────────────────────────────────────────────────
const TOPBAR_H   = 40;
const BOTTOM_PAD = 20;
const SEND_TO_H  = 0;      // the "Send to:" row sits inside the preview (bottom left), so it takes no height
const STRIP_H    = 70;
const HIST_H     = 80;     // prompt history field above the prompt
const PROMPT_LBL = 18;
const UI_W       = OUTER_W - 30;
const UI_H       = OUTER_H - 40 - 2 * 20;            // two output slots (image, prompt)
const RIGHT_H    = UI_H - PAD - TOPBAR_H - PAD - BOTTOM_PAD;
// prompt area kept at ~113 px (two thirds of the old 170) so the preview gets the height back
const PREV_H     = Math.min(PREVIEW_SIZE, RIGHT_H - SEND_TO_H - STRIP_H - HIST_H - 3 * PAD - 113);
const PROMPT_H   = RIGHT_H - PREV_H - SEND_TO_H - STRIP_H - HIST_H - 3 * PAD;

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
      let conv = null, convs = [], continueFrom = "", busy = false, viewing = null;

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

      // In-node confirm / text dialogs (H3 gallery's delete-confirm look). The browser's own confirm() / prompt() can
      // return "cancel" at once without showing anything in some embedded browsers, so Delete / Rename did nothing.
      function dialog({ title, message = "", input = null, ok = "OK", danger = false }) {
        return new Promise(resolve => {
          const ov = el("div", { style: { position: "fixed", inset: "0", zIndex: "100080", background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center" } });
          const box = el("div", { style: { background: C.bg1, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "18px 20px", width: "360px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "10px", boxShadow: "0 8px 30px rgba(0,0,0,0.5)", fontFamily: "'Segoe UI',sans-serif" } });
          box.appendChild(el("div", { text: title, style: { color: "#fff", fontSize: "13px", fontWeight: "700" } }));
          if (message) box.appendChild(el("div", { text: message, style: { color: C.muted, fontSize: "11.5px", lineHeight: "1.5", whiteSpace: "pre-wrap" } }));
          let field = null;
          if (input !== null) {
            field = el("input", { type: "text", style: { width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text, border: `1px solid ${BRAND}`, borderRadius: "6px", padding: "7px", fontSize: "12px", fontFamily: "inherit", outline: "none" } });
            field.value = input; box.appendChild(field);
          }
          const cancelValue = field ? null : false;
          const done = v => { document.removeEventListener("keydown", onKey, true); ov.remove(); resolve(v); };
          const accept = () => done(field ? field.value.trim() : true);
          const onKey = e => {
            if (e.key === "Escape") { e.stopPropagation(); done(cancelValue); }
            else if (e.key === "Enter") { e.stopPropagation(); e.preventDefault(); accept(); }
          };
          const cancelBtn = el("button", { type: "button", text: "Cancel", style: { cursor: "pointer", fontFamily: "inherit", fontSize: "11.5px", padding: "6px 14px", borderRadius: "6px", background: C.bg2, color: C.text, border: `1px solid ${C.border}` } });
          cancelBtn.addEventListener("click", () => done(cancelValue));
          const okBtn = button(ok, accept, danger ? "danger" : "primary");
          box.appendChild(el("div", { style: { display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "4px" } }, [cancelBtn, okBtn]));
          ov.appendChild(box);
          ov.addEventListener("mousedown", e => { if (e.target === ov) done(cancelValue); });
          document.addEventListener("keydown", onKey, true);
          document.body.appendChild(ov);
          setTimeout(() => (field || okBtn).focus(), 30);
        });
      }

      ctx.dialog = dialog;

      // ── server config (generation settings live on the server, shared by every chat) ──
      ctx.saveCfg = async patch => {
        Object.assign(ctx.cfg, patch);
        try { ctx.cfg = await call("/config", patch); } catch (e) { showPopup(e.message); }
        renderLeft(); renderMeter();
        if ("proxyUrl" in patch) checkProxy();
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
        dialog({ title: "Reset?", message: "Resets the prompt and the panel layout. Chats, images and settings are kept.", ok: "Reset" }).then(yes => {
          if (!yes) return;
          const keep = { convId: state.convId, selected: state.selected };
          Object.assign(state, defaultState({}), keep); persist(); imgBil.refresh(); updateCount(); renderLeft(); showPopup("Reset done.", false);
        });
      });
      resetBtn.style.cssText += `background:#ffffff;color:${BRAND};border:2px solid ${BRAND};border-radius:6px;padding:4px 8px;font-weight:700;`;
      // iconBtn's own hover would turn it dark; keep the white button like Moss / the other nodes
      resetBtn.addEventListener("mouseenter", () => resetBtn.style.background = "#f5f5ff");
      resetBtn.addEventListener("mouseleave", () => resetBtn.style.background = "#ffffff");
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
      // top-right of the preview: ⛶ full screen, then the zoom lock (nothing else over the picture)
      const fullBtn = el("button", { type: "button", text: "⛶", title: "Full screen", style: { position: "absolute", top: "6px", right: "32px", zIndex: "5", background: "rgba(0,0,0,0.65)", color: "#fff", border: "none", borderRadius: "4px", width: "22px", height: "22px", cursor: "pointer", fontSize: "12px", padding: "0", display: "none" },
        onclick: e => { e.stopPropagation(); if (viewing) openFullscreen(viewUrl(viewing)); } });
      let zoomEnabled = true;
      const zoomLockBtn = el("button", { type: "button", text: "🔓", title: "Scroll zoom on/off", style: { position: "absolute", top: "6px", right: "6px", zIndex: "5", background: "rgba(0,0,0,0.65)", color: "#fff", border: "none", borderRadius: "4px", width: "22px", height: "22px", cursor: "pointer", fontSize: "11px", padding: "0", display: "none" } });
      zoomLockBtn.addEventListener("click", () => { zoomEnabled = !zoomEnabled; zoomLockBtn.textContent = zoomEnabled ? "🔓" : "🔒"; if (!zoomEnabled) pz.reset(); });
      previewBox.append(placeholder, finalImg, fullBtn, zoomLockBtn, loadingOv);

      // ── Send to row: bottom left inside the preview (keeps the picture's height) ──
      const sendRow = el("div", { style: { position: "absolute", left: "6px", bottom: "6px", zIndex: "5", display: "flex", alignItems: "center", gap: "8px",
        background: "rgba(0,0,0,0.6)", borderRadius: "14px", padding: "3px 4px 3px 10px" } });
      sendRow.addEventListener("pointerdown", e => e.stopPropagation());   // no pan / zoom from here
      const pill = (t, tip, fn) => {
        const b = el("button", { type: "button", text: t, title: tip, style: { cursor: "pointer", fontFamily: "inherit", fontSize: "11px", padding: "3px 10px", borderRadius: "12px", background: C.bg2, color: C.text, border: `1px solid ${C.border}` } });
        b.addEventListener("mouseenter", () => { if (!b.disabled) b.style.background = C.bg3; });
        b.addEventListener("mouseleave", () => { b.style.background = C.bg2; });
        b.addEventListener("click", fn);
        return b;
      };
      const contBtn = pill("↪ Continue from this", "The next message edits this image (even an older one)", () => { if (viewing) { continueFrom = viewing.id; renderChips(); promptTA.focus(); } });
      sendRow.append(el("div", { text: "Send to:", style: { color: C.muted, fontSize: "11px" } }), contBtn);
      function syncSendRow() {
        const ok = !!viewing && viewing.kind !== "attached";
        sendRow.style.display = viewing ? "flex" : "none";   // nothing over the empty preview
        contBtn.disabled = !ok; contBtn.style.opacity = ok ? "1" : "0.45"; contBtn.style.cursor = ok ? "pointer" : "not-allowed";
      }

      // ── Prompt history of this chat: its own field above the prompt. The turn of the image on screen is highlighted;
      // clicking a turn shows its image. ──
      const historyBox = el("div", { style: { height: `${HIST_H}px`, flexShrink: "0", overflowY: "auto", background: C.bg1, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "4px 8px", boxSizing: "border-box", fontSize: "11px", lineHeight: "1.45" } });
      historyBox.className = "vertexv1-lp";
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
          finalImg.style.display = "none"; placeholder.style.display = "block"; fullBtn.style.display = "none"; zoomLockBtn.style.display = "none";
          placeholder.textContent = !ctx.cfg.model ? "Select an image model in the left menu (MODEL) first." : conv?.messages?.length ? "Pick an image in the strip below." : "Describe an image below and press Generate.\nEvery next message edits the latest result.";
        } else {
          placeholder.style.display = "none"; finalImg.src = viewUrl(img); finalImg.style.display = "block";
          fullBtn.style.display = "block"; zoomLockBtn.style.display = "block";
        }
        syncSendRow(); syncVariation(); renderHistory();
      }

      function turnOf(img) {
        const ms = conv?.messages || [];
        const i = ms.findIndex(m => (m.images || []).some(x => x.id === img?.id));
        if (i < 0) return {};
        const user = ms[i].role === "user" ? ms[i] : [...ms.slice(0, i)].reverse().find(m => m.role === "user");
        return { user, reply: ms[i].role === "assistant" ? ms[i] : null, summary: ms[i].role === "summary" ? ms[i] : null };
      }
      function renderHistory() {
        clear(historyBox);
        const ms = conv?.messages || [];
        if (!ms.length) { historyBox.appendChild(el("div", { text: "This chat's prompts appear here.", style: { color: C.muted } })); return; }
        const cur = viewing ? turnOf(viewing) : {};
        let turn = 0, curLine = null;
        for (let i = 0; i < ms.length; i++) {
          const m = ms[i];
          if (m.role === "summary") {
            historyBox.appendChild(el("div", { text: "≡ Summary: " + m.text, title: m.text, style: { color: "#9fd8b0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }));
            continue;
          }
          if (m.role !== "user") continue;
          turn++;
          const reply = ms[i + 1]?.role === "assistant" ? ms[i + 1] : null;
          const gen = (reply?.images || []).filter(x => x.kind === "generated");
          const on = cur.user?.id === m.id;
          const u = reply?.usage;
          const meta = [reply?.model ? modelName(reply.model) : "", reply?.label, reply?.ms ? (reply.ms / 1000).toFixed(1) + "s" : "",
            reply?.cached ? "♻ reused earlier result (no new call)" : u && (u.prompt || u.completion) ? `tokens in ${u.prompt.toLocaleString()} · out ${u.completion.toLocaleString()}` : "",
            reply?.notes ? "not applied: " + reply.notes : ""].filter(Boolean).join(" · ");
          const line = el("div", { title: [m.text, m.enhanced ? "enhanced: " + m.enhanced : "", reply?.text || "", meta].filter(Boolean).join("\n"),
            style: { padding: "2px 4px", borderRadius: "4px", cursor: gen.length ? "pointer" : "default", background: on ? C.bg3 : "transparent", borderLeft: `2px solid ${on ? BRAND : "transparent"}` } });
          line.append(el("span", { text: `${turn} ▸ `, style: { color: on ? BRAND : C.muted, fontWeight: "700" } }),
            el("span", { text: m.text || "(images only)", style: { color: on ? "#fff" : C.text } }));
          if (reply?.status === "error") line.appendChild(el("div", { text: "✕ " + (reply.error || "Error"), style: { color: C.err, fontSize: "10px" } }));
          else if (reply?.status === "pending") line.appendChild(el("div", { text: "Generating…", style: { color: C.muted, fontSize: "10px" } }));
          else if (on && (reply?.text || meta)) line.appendChild(el("div", { text: [reply?.text, meta].filter(Boolean).join(" — "), style: { color: C.muted, fontSize: "10px" } }));
          if (gen.length) line.addEventListener("click", () => { pickOutput(gen[gen.length - 1]); });
          historyBox.appendChild(line);
          if (on) curLine = line;
        }
        // scroll only this box (scrollIntoView would also move the canvas page)
        requestAnimationFrame(() => {
          if (!curLine) { historyBox.scrollTop = historyBox.scrollHeight; return; }
          const top = curLine.offsetTop - historyBox.offsetTop, bottom = top + curLine.offsetHeight;
          if (top < historyBox.scrollTop) historyBox.scrollTop = top;
          else if (bottom > historyBox.scrollTop + historyBox.clientHeight) historyBox.scrollTop = bottom - historyBox.clientHeight;
        });
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
            const t = el("div", { title: ref ? "Attached reference" : isOut ? "Node output (this image leaves the IMAGE slot)" : "Click: show it and make it the node's IMAGE output", style: { position: "relative", flexShrink: "0", width: `${sz}px`, height: `${sz}px`, borderRadius: "5px", overflow: "hidden", cursor: "pointer", border: `2px solid ${isView ? BRAND : isCont ? "#ffb347" : "transparent"}`, background: "#000" } });
            t.appendChild(el("img", { src: viewUrl(img), loading: "lazy", style: { width: "100%", height: "100%", objectFit: "cover", display: "block" } }));
            if (ref) t.appendChild(el("div", { text: "📎", style: { position: "absolute", bottom: "0", right: "1px", fontSize: "10px" } }));
            if (isOut) t.appendChild(el("div", { text: "✓", title: "Node output", style: { position: "absolute", top: "1px", right: "2px", fontSize: "11px", fontWeight: "700", color: "#fff", background: BRAND, borderRadius: "3px", padding: "0 3px" } }));
            // the image picked here is what the node outputs (attached references are only shown)
            t.addEventListener("click", () => { if (ref) { showImage(img); renderStrip(); } else pickOutput(img); });
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
      // Sends the shown image's message again as a NEW paid request (an identical request otherwise reuses the old result).
      const varBtn = hdrBtn("↻ New variation", "Send the shown image's message again as a new (paid) request — an identical request otherwise reuses the earlier result for free", () => {
        const { user } = viewing ? turnOf(viewing) : {};
        if (!user || busy) return;
        dialog({ title: "Send it again as a new request?", message: "This is a new paid call to Vertex.", ok: "Send" }).then(yes => { if (yes) generate({ prompt: user.text, continueFrom: user.continueFrom || "", bypass: true }); });
      });
      promptHdr.appendChild(varBtn);
      function syncVariation() {
        const ok = !!viewing && viewing.kind === "generated" && !!turnOf(viewing).user;
        varBtn.disabled = !ok; varBtn.style.opacity = ok ? "1" : "0.4"; varBtn.style.cursor = ok ? "pointer" : "not-allowed";
      }

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

      // Pasted / dropped images go into the left menu's Reference Images slots (uploaded to input/, like H3's slots).
      async function addFiles(files) {
        for (const f of files) {
          if ((state.refImages || []).length >= MAX_REFS) { showPopup(`${MAX_REFS} reference images max.`); break; }
          try { state.refImages = [...(state.refImages || []), await uploadImage(f)]; }
          catch (e) { showPopup(e.message || "Upload failed"); }
        }
        state.accordion = { ...(state.accordion || {}), refs: true };
        persist(); renderLeft();
      }
      function renderChips() {
        clear(chips);
        chips.style.display = continueFrom ? "flex" : "none";
        if (continueFrom) {
          const img = (conv?.messages || []).flatMap(m => m.images || []).find(i => i.id === continueFrom);
          const c = el("div", { style: { display: "flex", alignItems: "center", gap: "4px", background: "#2a1d0a", border: "1px solid #ffb347", borderRadius: "12px", padding: "1px 6px", fontSize: "10.5px" } });
          if (img) c.appendChild(el("img", { src: viewUrl(img), style: { width: "18px", height: "18px", objectFit: "cover", borderRadius: "3px" } }));
          c.append(el("span", { text: "Continue from this" }), el("span", { text: "✕", style: { cursor: "pointer" }, onclick: () => { continueFrom = ""; renderChips(); renderStrip(); } }));
          chips.appendChild(c);
        }
        renderStrip();
      }

      // ── Reference Images (left menu) — H3 Image Generator's slots: click = upload, 🖼 = any gallery, ✕ = remove,
      // drag = reorder (the order is the order the model gets them in). Sent with the next message, then cleared. ──
      const MAX_REFS = 14;   // Gemini image models take up to 14 reference images
      function setRefs(list) { state.refImages = list.filter(Boolean).slice(0, MAX_REFS); persist(); renderLeft(); }
      function refsSection() {
        const refs = (state.refImages || []).slice(0, MAX_REFS);
        const grid = el("div", { style: { display: "flex", flexWrap: "wrap", gap: "5px", justifyContent: "center", marginTop: "6px" } });
        for (let i = 0; i < Math.min(MAX_REFS, refs.length + 1); i++) {
          const slot = imageSlot(refs[i] ? `Image ${i + 1}` : "+ add\nreference", refs[i] || null, name => {
            const list = (state.refImages || []).slice();
            if (name) list[i] = name; else list.splice(i, 1);
            setRefs(list);
          }, { box: 84 });
          const cell = el("div", { style: { display: "flex", flexDirection: "column", alignItems: "center" } }, [slot.el]);
          if (refs[i]) {
            cell.draggable = true;
            cell.addEventListener("dragstart", e => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(i)); cell.style.opacity = "0.4"; });
            cell.addEventListener("dragend", () => { cell.style.opacity = "1"; });
            cell.addEventListener("dragover", e => { e.preventDefault(); slot.el.style.outline = `2px solid ${BRAND}`; });
            cell.addEventListener("dragleave", () => { slot.el.style.outline = "none"; });
            cell.addEventListener("drop", e => {
              e.preventDefault(); e.stopPropagation(); slot.el.style.outline = "none";
              const from = Number(e.dataTransfer.getData("text/plain"));
              if (Number.isNaN(from) || from === i) return;
              const list = (state.refImages || []).slice();
              const [moved] = list.splice(from, 1); list.splice(i, 0, moved);
              setRefs(list);
            });
          }
          grid.appendChild(cell);
        }
        // the shared picker (every gallery), opened on the Vertex Image tab
        const addVertex = button("🖼 Add from gallery", () => openImageGalleryPicker(name => {
          if ((state.refImages || []).length >= MAX_REFS) { showPopup(`${MAX_REFS} reference images max.`); return; }
          setRefs([...(state.refImages || []), name]);
        }, "vertex"));
        addVertex.style.cssText += "width:100%;margin-top:6px;";
        return [grid, addVertex];
      }

      previewBox.appendChild(sendRow);
      rightPanel.append(previewBox, strip, historyBox, promptWrap);
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
      // Proxy connection (between the left menu and Generate). Checked with the proxy's model list — free, no generation.
      const proxyRow = el("div", { title: "Click to check again", style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "10.5px", color: C.muted, cursor: "pointer" } });
      const proxyDot = el("span", { text: "●", style: { fontSize: "11px", color: C.muted } });
      const proxyText = el("span", { text: "Proxy: checking…", style: { flex: "1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } });
      // shown only while the proxy is not reachable: where to get the proxy app
      const proxyLink = el("a", { href: PROXY_APP_URL, target: "_blank", rel: "noopener noreferrer", text: "Install proxy app ↗",
        title: PROXY_APP_URL, style: { color: BRAND, fontWeight: "700", textDecoration: "none", whiteSpace: "nowrap", display: "none" } });
      proxyLink.addEventListener("click", e => e.stopPropagation());
      proxyRow.append(proxyDot, proxyText, proxyLink);
      let proxyChecking = false;
      async function checkProxy() {
        if (proxyChecking) return;
        proxyChecking = true;
        const url = ctx.cfg.proxyUrl || "http://127.0.0.1:3000";
        try {
          const m = await call("/models?type=image");
          proxyDot.style.color = "#4cd964";
          proxyText.textContent = `Proxy connected · ${url} · ${m.models.length} image models`;
          proxyRow.title = "Checked every 20 s. Click to check again.";
          proxyLink.style.display = "none";
        } catch (e) {
          proxyDot.style.color = C.err;
          proxyText.textContent = `Proxy not connected · ${url}`;
          proxyLink.style.display = "";
          proxyRow.title = (e.message || "") + "\nStart the Vertex OpenAI Proxy app. Click to check again.";
        }
        proxyChecking = false;
      }
      proxyRow.addEventListener("click", checkProxy);
      const proxyTimer = setInterval(() => { if (root.isConnected) checkProxy(); }, 20000);
      const prevRemoved = self.onRemoved;
      self.onRemoved = function () { clearInterval(proxyTimer); prevRemoved?.apply(this, arguments); };
      genWrap.append(proxyRow, meter, row([genBtn, stopBtn]));
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
      // H3's small circled "?" that carries a long explanation as a hover tooltip
      function helpDot(text) {
        const d = el("span", { text: "?", title: text, style: {
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: "13px", height: "13px", borderRadius: "50%", flexShrink: "0",
          background: C.border, color: C.muted, fontSize: "9px", fontWeight: "700",
          cursor: "help", marginLeft: "5px" } });
        d.addEventListener("click", e => e.stopPropagation());   // hovering / clicking it doesn't fold the section
        return d;
      }
      function accordion(key, title, summary, body, help = "") {
        const open = !!state.accordion?.[key];
        const head = el("div", { style: { display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", userSelect: "none", padding: "1px 0" } });
        head.append(
          el("div", { text: open ? "▼" : "▶", style: { fontSize: "9px", color: C.muted, width: "10px", flexShrink: "0" } }),
          el("div", { text: title, style: { fontSize: "10px", fontWeight: "700", letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted, flexShrink: "0" } }),
          ...(help ? [helpDot(help)] : []),
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
        const nRefs = (state.refImages || []).length;
        leftPanel.appendChild(accordion("refs", `Reference Images (${nRefs}/${MAX_REFS})`, nRefs ? `${nRefs} for the next message` : "None", refsSection,
          "Sent with the next message, then cleared. Drag to reorder. 🖼 on a slot picks from any gallery. You can also paste (Ctrl+V) or drop images onto the prompt."));
        leftPanel.appendChild(accordion("model", "Model", c.model ? modelName(c.model) : "not selected", () => {
          const opts = ["", ...ctx.models.image]; if (c.model && !opts.includes(c.model)) opts.push(c.model);
          const refresh = button("⟳", async () => { try { await ctx.loadModels(true); showPopup("Model list refreshed.", false); } catch (e) { showPopup(e.message); } });
          refresh.title = "Reload the model list from the proxy"; refresh.style.cssText += "padding:4px 9px;";
          return [el("div", { style: { display: "flex", gap: "4px", marginTop: "6px", alignItems: "center" } }, [
              el("div", { style: { flex: "1" } }, [select(opts.map(v => ({ value: v, label: v ? modelName(v) : "— select a model —", title: v })), c.model, v => ctx.saveCfg({ model: v }))]), refresh]),
            ctx.models.image.length ? null : el("div", { style: { color: C.warn, fontSize: "10.5px", marginTop: "4px", lineHeight: "1.5" } }, [
              el("span", { text: "Proxy not reachable — start the Vertex OpenAI Proxy (⚙ Settings to change the address). Not installed? " }),
              el("a", { href: PROXY_APP_URL, target: "_blank", rel: "noopener noreferrer", text: "Get the proxy app ↗", style: { color: BRAND, fontWeight: "700" } })])];
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
          // same dropdown style as Person generation (the setting itself stays a true / false)
          field("Celebrities", select([{ value: "deny", label: "Deny" }, { value: "allow", label: "Allow" }],
            c.celebrities ? "allow" : "deny", v => ctx.saveCfg({ celebrities: v === "allow" }))),
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
        const t = await dialog({ title: "Rename chat", input: conv.title, ok: "Rename" });
        if (!t) return;
        try { await call("/conversation/rename", { id: conv.id, title: t }); }
        catch (e) { showPopup("Rename failed: " + e.message); return; }
        conv.title = t; await loadList(); renderLeft();
      }
      async function removeConv() {
        if (!conv) return;
        if (!await dialog({ title: "Delete this chat?", message: `"${conv.title}" moves to the gallery trash (it can be restored there).\nIts generated images stay in the gallery.`, ok: "Delete", danger: true })) return;
        try { await call("/conversation/delete", { id: conv.id }); }
        catch (e) { showPopup("Delete failed: " + e.message); return; }
        await loadList(); await openConv(convs[0]?.id || "");
        showPopup("Chat moved to the gallery trash.", false);
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
        if (!again && !getModePrompt(state.mode).trim() && !(state.refImages || []).length) { showPopup("Write a prompt first."); return; }
        if (!again) {
          setBusy(true, state.autoEnhance ? "Enhancing…" : "Translating…");
          try {
            if (state.autoEnhance && getModePrompt(state.mode).trim()) { pxTA.value = getModePrompt(state.mode); await llmApi.enhance(); imgBil.refresh(); persist(); updateCount(); }
            await imgBil.ensure();
          } catch (e) { setBusy(false); showPopup(e.message); return; }
        }
        if (!conv) { try { await newConv(); } catch (e) { setBusy(false); showPopup(e.message); return; } }
        const text = again ? again.prompt : getModePrompt(state.mode).trim();
        let attachments = [];
        if (!again) {
          try { for (const n of state.refImages || []) attachments.push(await urlToDataUri(`/view?filename=${encodeURIComponent(n)}&type=input`)); }
          catch (e) { setBusy(false); showPopup("Could not read a reference image: " + (e.message || e)); return; }
        }
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
          if (!again) { setModePrompt(state.mode, ""); imgBil.refresh(); updateCount(); state.refImages = []; persist(); continueFrom = ""; }
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
        renderLeft(); showImage(null); checkProxy();
        ctx.loadModels(false).catch(() => renderLeft());
        if (state.selected?.file) call("/select", { node: String(self.id), conv: state.convId, file: state.selected.file, sub: state.selected.sub }).catch(() => {});
        await loadList();
        await openConv(convs.some(c => c.id === state.convId) ? state.convId : (convs[0]?.id || ""), state.selected?.file);
      })();
    };
  },
});

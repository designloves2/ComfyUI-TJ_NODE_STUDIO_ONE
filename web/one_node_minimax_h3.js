// one_node_minimax_h3.js — MiniMax H3 ONE STUDIO (TJ)
//
// Video + audio in one node, with a clip relay loop: a long prompt is rendered as N
// short clips (the model's frame grid caps clip length), each clip is saved on its own,
// and the run ends with a stitched file.
//
// The relay runs here in the frontend, one `queuePrompt` per clip — the same pattern the
// other ONE STUDIO nodes use. ComfyUI keeps models resident between prompts, so the clip
// boundary is only a VRAM reset because we ask for one: `unloadBetweenClips` frees between
// clips, and the run always frees once it finishes.
//
// While a clip samples, ModelPreviewOverrideKJ streams decoded frames over the
// `kj_preview_override` socket event tagged with this node's id — they are painted into
// the preview box below, so the user watches the video form instead of a spinner.
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import {
  C, BRAND, NODE_W, PREVIEW_SIZE, LEFT_W, PAD, SUBFOLDER,
  el, clear, loadState, saveState, lastUsedAt, defaultState, randomSeed,
  CLIP_LENGTHS, ASPECTS, UPSCALE_MODES,
  TURBO_MODES, ATTN_BACKENDS, ATTN_FORWARDS, BLOCK_CACHES, FBC_MODES,
  attnBlockedReason, attnForwardBlockedReason, attnForwardOverlapNote, blockCacheBlockedReason,
  effectiveTurbo, effectiveSteps, migrateLegacyAccel,
  continuityModesFor, generationModesFor, configIssues,
  clipPlan, formatDuration, formatClock, framesToSeconds, alignFrameCount, FPS, ONE_TAKE_OVERLAP_FRAMES, resolveResolution,
  parseBrief, groupShots, composeClipPrompt,
  turboLoraForMode, explainGenerationError,
  promptText, promptFirstFrame, promptEnabled, activePrompts,
} from "./minimax/core_minimax.js";
import { panel, label, button, select, loraSelect, numberField, slider, row, col, modeBar, iconBtn, openVideoFullscreen }
  from "./klein/ui_common.js";
import {
  queuePrompt, waitForHistory, interrupt, freeMemory, setLastResult, stitchClips,
  copyOutputToInput, getNodeAvailability, getModels, saveMeta, pickChainFrame, getLoraTriggers,
  getMediaFiles, uploadMedia, getVramStats,
} from "./minimax/api_minimax.js";
import { buildClipGraph, NODE_IDS, previewNodeKey } from "./minimax/graph_builder_minimax.js";
import { createSettingsOverlay } from "./minimax/ui_app_settings_minimax.js";
import { mountImagePanel } from "./minimax/ui_images_minimax.js";
import { createPromptEditOverlay } from "./minimax/ui_prompt_edit_minimax.js";
import { createCommonPromptOverlay } from "./minimax/ui_common_prompt_minimax.js";
import { createGalleryOverlay } from "./minimax/ui_gallery_minimax.js";
import { resolvePipeOverrides, applyOverridesTemp } from "./shared/promptdb_pipe.js";
import { attachNodeState, restoreNodeState } from "./shared/node_state.js";

// ── Layout ────────────────────────────────────────────────────────────────────
const TOPBAR_H   = 40;
const BOTTOM_PAD = 20;
const STATUS_H   = 46;
const PROMPT_H   = 150;   // the strip scrolls; the fields inside it are the tall part
const RIGHT_H    = PREVIEW_SIZE + PAD + STATUS_H + PAD + PROMPT_H;
const ROOT_H     = PAD + TOPBAR_H + PAD + RIGHT_H + BOTTOM_PAD;
const NODE_H     = ROOT_H + 30;
const NODE_MW    = NODE_W + 30;
const NODE_MH    = NODE_H + 40;

app.registerExtension({
  name: "TJ.MiniMaxH3ONE.v1",

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "MiniMaxH3OneTJNode") return;

    nodeType.prototype.onNodeCreated = function () {
      this.color       = BRAND;
      this.bgcolor     = C.bg0;
      this.title_color = "#ffffff";
      this.resizable   = false;
      this.size        = [NODE_MW, NODE_MH];
      this._buildUI();
    };
    // Runs after the workflow's widgets_values have been applied, which is the first
    // moment the stored state is readable. A node dropped fresh has none, and keeps the
    // values it inherited from the browser.
    nodeType.prototype.onConfigure = function () {
      this.size = [NODE_MW, NODE_MH];
      // The node was already seeded with the settings last used in this browser.
      // Only let the workflow's own copy replace them if it is the newer of the two,
      // so reopening an older file does not undo everything configured since.
      restoreNodeState(this, { preferNewerThan: lastUsedAt() });
    };
    nodeType.prototype.onResize    = function () { this.size = [NODE_MW, NODE_MH]; };
    nodeType.prototype.getSlotMenuOptions = function () { return []; };

    nodeType.prototype._buildUI = function () {
      const self  = this;
      // Seeded from the last settings used in this browser, so a freshly dropped node
      // starts where the user left off. A node loaded from a saved workflow overwrites
      // this from its own stored copy in onConfigure.
      const state = defaultState(loadState());
      // A node saved before the pipeline was split into separate axes still carries the
      // old single `accelMode`; fold it into the new fields before anything renders.
      migrateLegacyAccel(state);

      // The settings ride along in the workflow — see web/shared/node_state.js.
      const persist = attachNodeState(self, {
        state, save: saveState,
        normalize: (raw) => { const s = defaultState(raw); migrateLegacyAccel(s); return s; },
        rerender: () => self._mmh3Repaint?.(),
      });

      if (!document.getElementById("mmh3-styles")) {
        const s = document.createElement("style"); s.id = "mmh3-styles";
        s.textContent = `@keyframes mmh3-spin{to{transform:rotate(360deg)}}`
          + `.mmh3-lp::-webkit-scrollbar{width:5px}.mmh3-lp::-webkit-scrollbar-track{background:transparent}`
          + `.mmh3-lp::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px}`
          // Plain accent-color on a range input renders a large native thumb in this
          // Chromium build — fine at web-app width, but it swallows the whole track in the
          // node's ~276px panel. Pin it to a small circle instead.
          + `.mmh3-seek{-webkit-appearance:none;appearance:none;height:4px;background:${C.border};border-radius:2px;}`
          + `.mmh3-seek::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;border-radius:50%;background:${BRAND};cursor:pointer;}`
          + `.mmh3-seek::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:${BRAND};border:none;cursor:pointer;}`;
        document.head.appendChild(s);
      }

      const ctx = {
        persist, rootEl: null, showPopup: null, availability: {}, availableModels: null,
        refreshPlan: null, _rerenderImages: null,
        // the prompt editor sizes its brief to the run's real shape
        currentPlan: () => currentPlan(),
        // gallery → editor: put a saved clip's prompt back the way it was written
        reusePrompt: null,
        // Settings changed a model — the mode pills and continuity list gate on it
        refreshModes: null,
      };

      // ── root ────────────────────────────────────────────────────────────────
      const root = el("div", { style: {
        width: `${NODE_W}px`, height: `${ROOT_H}px`, boxSizing: "border-box",
        position: "relative", overflow: "hidden",
        background: C.bg0, borderRadius: "8px",
        padding: `${PAD}px ${PAD}px ${BOTTOM_PAD}px ${PAD}px`,
        color: C.text, fontFamily: "'Segoe UI',sans-serif",
      }});
      ctx.rootEl = root;

      let popTimer;
      function showPopup(msg, isError = true) {
        let pop = root.querySelector(".mmh3-pop");
        if (!pop) {
          pop = el("div", { style: {
            position: "absolute", bottom: "30px", left: "50%", transform: "translateX(-50%)",
            background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "6px",
            padding: "6px 14px", fontSize: "11px", color: C.text, zIndex: "10001",
            maxWidth: "80%", textAlign: "center", pointerEvents: "none", transition: "opacity .3s",
          }});
          pop.className = "mmh3-pop"; root.appendChild(pop);
        }
        pop.textContent = msg;
        pop.style.color = isError ? C.err : BRAND;
        pop.style.opacity = "1";
        clearTimeout(popTimer);
        popTimer = setTimeout(() => { pop.style.opacity = "0"; }, 4000);
      }
      ctx.showPopup = showPopup;

      // ── topbar ──────────────────────────────────────────────────────────────
      const topBar = el("div", { style: { display: "flex", alignItems: "center", gap: "6px", height: `${TOPBAR_H}px`, marginBottom: `${PAD}px`, flexShrink: "0" } });
      const pillsWrap = el("div", { style: { flex: "1" } });
      // Sits between the mode pills and the icon buttons: what Settings still needs
      // before a run can work. Clicking it opens Settings at the problem.
      const warnTag = el("div", { style: {
        display: "none", alignItems: "center", gap: "5px", cursor: "pointer",
        fontSize: "11px", color: C.warn, background: "rgba(255,179,71,0.12)",
        border: `1px solid ${C.warn}`, borderRadius: "6px", padding: "4px 9px",
        maxWidth: "360px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }});
      warnTag.addEventListener("click", () => settingsOv?.show());

      function renderPills() {
        clear(pillsWrap);
        const modes = generationModesFor(state);
        // Never sit on a mode whose model is missing — move to one that works.
        if (!modes.find(m => m.key === state.generationMode)?.enabled) {
          const first = modes.find(m => m.enabled);
          if (first) { state.generationMode = first.key; persist(); }
        }
        pillsWrap.appendChild(modeBar(modes, state.generationMode, key => {
          state.generationMode = key;
          // Turbo isn't offered in Reference mode, so don't leave it selected there.
          persist(); renderPills(); renderLeft();
        }));

        const issues = configIssues(state);
        const off = modes.filter(m => !m.enabled).map(m => m.label);
        const parts = [];
        if (issues.length) parts.push(`Settings needs ${issues.join(", ")}`);
        else if (off.length) parts.push(`${off.join(" / ")} unavailable — UNET not set`);
        if (parts.length) {
          clear(warnTag);
          warnTag.append(el("span", { text: "⚠" }), el("span", { text: parts.join(" · ") }));
          warnTag.title = `${parts.join("\n")}\n\nClick to open Settings.`;
          warnTag.style.display = "flex";
        } else {
          warnTag.style.display = "none";
        }
      }
      let settingsOv, helpOv, promptEditOv, galleryOv, commonOv;
      topBar.appendChild(pillsWrap);
      topBar.appendChild(warnTag);
      topBar.appendChild(iconBtn("🗑", "Unload models / free VRAM", async () => {
        await freeMemory(); showPopup("VRAM freed.", false);
      }));
      topBar.appendChild(iconBtn("⚙", "Settings", () => settingsOv?.show()));
      topBar.appendChild(iconBtn("🖼", "Gallery — clips and stitched videos", () => galleryOv?.show()));
      topBar.appendChild(iconBtn("?", "Help", () => helpOv?.show()));
      root.appendChild(topBar);

      // ── main row ────────────────────────────────────────────────────────────
      const mainRow   = el("div", { style: { display: "flex", gap: `${PAD}px`, height: `${RIGHT_H}px`, flexShrink: "0" } });
      const leftOuter = el("div", { style: { width: `${LEFT_W}px`, flexShrink: "0", height: `${RIGHT_H}px`, display: "flex", flexDirection: "column" } });
      const leftPanel = el("div", { style: { flex: "1", overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column", gap: "6px" } });
      leftPanel.className = "mmh3-lp";
      leftOuter.appendChild(leftPanel);
      const rightPanel = el("div", { style: { flex: "1", minWidth: `${PREVIEW_SIZE}px`, display: "flex", flexDirection: "column", gap: `${PAD}px`, height: `${RIGHT_H}px` } });

      // ══ LIVE PREVIEW ════════════════════════════════════════════════════════
      // Frames arrive as base64 over `kj_preview_override`; mp4 when preview_frames > 1.
      const previewBox = el("div", { style: {
        width: "100%", height: `${PREVIEW_SIZE}px`, flexShrink: "0", background: "#000",
        borderRadius: "8px", border: `1px solid ${C.border}`, position: "relative",
        display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
      }});
      const placeholder = el("div", { style: { color: C.muted, fontSize: "12px", textAlign: "center", lineHeight: "1.7" } });
      placeholder.innerHTML = "▶ Generate to render the first clip<br><span style='font-size:10px'>live sampling frames appear here</span>";
      // width/height 100% (not max-*) so a small latent preview is scaled UP to fill the
      // box on its long edge; object-fit keeps the aspect ratio.
      const FIT = { width: "100%", height: "100%", objectFit: "contain", display: "none" };
      const previewImg = el("img", { style: { ...FIT, imageRendering: "auto" } });
      const previewVid = el("video", { autoplay: "", loop: "", muted: "", playsinline: "", style: { ...FIT } });
      previewVid.muted = true;
      const resultVid  = el("video", { controls: "", loop: "", playsinline: "", style: { ...FIT } });

      // corner badge: LIVE while sampling, CLIP n/N when showing a finished clip
      const badge = el("div", { style: {
        position: "absolute", top: "8px", left: "8px", zIndex: "6",
        background: "rgba(0,0,0,0.7)", color: "#fff", borderRadius: "10px",
        padding: "3px 10px", fontSize: "10px", fontWeight: "700", letterSpacing: "0.05em", display: "none",
      }});
      const fsBtn = el("button", { type: "button", text: "⛶", title: "Fullscreen", style: {
        position: "absolute", top: "6px", right: "6px", zIndex: "6", background: "rgba(0,0,0,0.65)",
        color: "#fff", border: "none", borderRadius: "4px", width: "22px", height: "22px",
        cursor: "pointer", fontSize: "12px", padding: "0", display: "none",
      }});
      previewBox.append(placeholder, previewImg, previewVid, resultVid, badge, fsBtn);

      let lastResultURL = null;
      // openFullscreen() (shared/klein/ui_common.js) renders the target inside an <img> —
      // fine for the image tools it was written for, but a no-op here since lastResultURL
      // is a video file: an <img src="*.mp4"> shows nothing. Double-click on resultVid
      // already triggers the browser's own native Fullscreen API (it's a <video controls>
      // element) — using that same API here would make this button do nothing double-click
      // doesn't already do. openVideoFullscreen() is the in-page overlay instead: tab
      // chrome/address bar stay visible, closes with ✕/ESC/outside-click.
      fsBtn.addEventListener("click", () => { if (lastResultURL) openVideoFullscreen(lastResultURL, { startAt: resultVid.currentTime || 0 }); });

      // KJ encodes preview frames on a background thread, so the last few can land
      // after execution_success — and after the run has already put its final video in
      // this box. Without a lock those late frames hide the result behind a looping
      // preview clip that never stops, which reads as "the run never finished".
      let previewLocked = false;

      function showPreviewFrame(dataURL, mime) {
        if (previewLocked) return;
        placeholder.style.display = "none";
        // Same bug as resetPreview originally had, other direction: hiding resultVid
        // here doesn't stop it. If the user pressed play on clip N's finished result and
        // the next clip's live preview then takes over this box, clip N kept playing in
        // the background underneath it.
        try { resultVid.pause(); } catch {}
        resultVid.style.display = "none";
        if (mime === "video/mp4") {
          previewImg.style.display = "none";
          previewVid.src = dataURL;
          previewVid.style.display = "block";
          previewVid.play?.().catch(() => {});
        } else {
          try { previewVid.pause(); } catch {}
          previewVid.style.display = "none";
          previewImg.src = dataURL;
          previewImg.style.display = "block";
        }
        badge.style.display = "block";
      }
      function showResultVideo(url, { final = false } = {}) {
        lastResultURL = url;
        if (final) previewLocked = true;
        placeholder.style.display = "none";
        previewImg.style.display = "none";
        try { previewVid.pause(); } catch {}
        previewVid.style.display = "none";
        resultVid.src = url;
        resultVid.style.display = "block";
        // Loaded and ready, but left paused — a clip finishing mid-run should not start
        // making noise on its own. The user presses play.
        try { resultVid.pause(); resultVid.currentTime = 0; } catch {}
        fsBtn.style.display = "block";
      }
      function resetPreview() {
        previewLocked = false;
        placeholder.style.display = "block";
        previewImg.style.display = "none";
        previewVid.style.display = "none";
        // Hiding a playing <video> does not stop it — previewVid has autoplay+loop for the
        // live KJ preview stream, so a run left mid-preview (or a stray click on it) kept
        // looping silently in the background even after this box moved on to something else.
        try { previewVid.pause(); previewVid.removeAttribute("src"); previewVid.load(); } catch {}
        try { resultVid.pause(); } catch {}
        resultVid.style.display = "none";
        badge.style.display = "none";
        fsBtn.style.display = "none";
      }

      // Socket listener. ModelPreviewOverrideKJ stamps the event with its own graph key,
      // which we mint per node instance — so match on that, not on this node's canvas id.
      const onKJPreview = (ev) => {
        try {
          const d = ev.detail || {};
          if (String(d.node_id) !== previewNodeKey(self.id)) return;
          if (d.image) showPreviewFrame(`data:${d.mime || "image/jpeg"};base64,${d.image}`, d.mime);
          if (d.step != null && d.total) setStepProgress(d.step, d.total);
        } catch {}
      };
      api.addEventListener("kj_preview_override", onKJPreview);
      const origOnRemoved = nodeType.prototype.onRemoved;
      self.onRemoved = function () {
        api.removeEventListener("kj_preview_override", onKJPreview);
        stopWakeAudio();
        stopQueueWatch();
        window.removeEventListener("beforeunload", onBeforeUnload);
        origOnRemoved?.apply(this, arguments);
      };

      // ══ STATUS STRIP ════════════════════════════════════════════════════════
      const statusWrap = el("div", { style: { height: `${STATUS_H}px`, flexShrink: "0", display: "flex", flexDirection: "column", gap: "4px", justifyContent: "center" } });
      const statusLine = el("div", { style: { display: "flex", alignItems: "center", gap: "10px", fontSize: "11px", color: C.text } });
      const statusText = el("div", { text: "Idle", style: { flex: "1", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } });
      const clockText  = el("div", { text: "00:00:00", style: { color: C.muted, fontVariantNumeric: "tabular-nums" } });
      statusLine.append(statusText, clockText);
      const barOuter = el("div", { style: { height: "6px", background: C.bg2, borderRadius: "3px", overflow: "hidden", border: `1px solid ${C.border}` } });
      const barInner = el("div", { style: { height: "100%", width: "0%", background: BRAND, transition: "width .15s linear" } });
      barOuter.appendChild(barInner);
      // Same warning the web version shows: something ELSE besides this screen's own
      // in-flight clip is sitting in ComfyUI's queue, which usually means another node/tab
      // is competing for the GPU and this run's steps will be slower/stalled than the ETA
      // assumes.
      const queueWarn = el("div", { style: {
        display: "none", marginTop: "3px", fontSize: "10px", padding: "4px 8px",
        borderRadius: "5px", background: "rgba(230,160,20,0.15)", color: "#e6a014",
        border: "1px solid rgba(230,160,20,0.4)",
      }});
      statusWrap.append(statusLine, barOuter, queueWarn);

      let queuePollTimer = null;
      async function checkOtherQueue() {
        try {
          const r = await api.fetchApi("/queue");
          const d = await r.json();
          const total = (d.queue_running || []).length + (d.queue_pending || []).length;
          const extra = Math.max(0, total - 1);   // 1 = this screen's own in-flight clip
          queueWarn.style.display = extra > 0 ? "block" : "none";
          queueWarn.textContent = extra > 0
            ? `⚠ ComfyUI queue: ${extra} more pending besides this screen's generation.` : "";
        } catch {}
      }
      function startQueueWatch() {
        if (queuePollTimer) return;
        checkOtherQueue();
        queuePollTimer = setInterval(checkOtherQueue, 4000);
      }
      function stopQueueWatch() {
        if (queuePollTimer) clearInterval(queuePollTimer);
        queuePollTimer = null;
        queueWarn.style.display = "none";
      }

      let runStart = 0, clockTimer = null;
      let curClip = 0, totClip = 0;
      function setStatus(msg) { statusText.textContent = msg; }
      function setStepProgress(step, total) {
        const clipFrac = total ? step / total : 0;
        const overall = totClip ? ((curClip - 1) + clipFrac) / totClip : clipFrac;
        barInner.style.width = `${Math.max(0, Math.min(100, overall * 100)).toFixed(1)}%`;
        badge.textContent = totClip > 1 ? `● LIVE  CLIP ${curClip}/${totClip}  ·  step ${step}/${total}`
                                        : `● LIVE  step ${step}/${total}`;
        setStatus(totClip > 1 ? `Clip ${curClip}/${totClip} · step ${step}/${total}`
                              : `Sampling · step ${step}/${total}`);
      }
      function startClock() {
        runStart = Date.now();
        clearInterval(clockTimer);
        clockTimer = setInterval(() => { clockText.textContent = formatClock(Date.now() - runStart); }, 1000);
      }
      function stopClock() { clearInterval(clockTimer); clockTimer = null; }

      // ══ PROMPTS ═════════════════════════════════════════════════════════════
      const promptWrap = el("div", { style: { height: `${PROMPT_H}px`, flexShrink: "0", display: "flex", flexDirection: "column", gap: "4px" } });
      const promptHdr  = el("div", { style: { display: "flex", alignItems: "center", gap: "6px", height: "18px" } });
      const promptTitle = el("div", { text: "PROMPTS", style: { color: C.muted, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.04em" } });
      const promptCount = el("span", { style: { color: C.muted, fontSize: "10px" } });
      promptHdr.append(promptTitle, promptCount);
      const commonBtn = el("button", { type: "button", text: "🧩 Common", title: "Edit the header / sound-music text shared by every clip", style: {
        marginLeft: "auto", cursor: "pointer", fontFamily: "inherit", fontSize: "10px",
        padding: "3px 9px", borderRadius: "5px", background: C.bg2, color: C.text,
        border: `1px solid ${C.border}`,
      }});
      commonBtn.addEventListener("click", () => commonOv?.show());
      promptHdr.appendChild(commonBtn);

      const editBtn = el("button", { type: "button", text: "📝 Prompt Edit", title: "Open the full prompt editor (with Ollama enhance)", style: {
        cursor: "pointer", fontFamily: "inherit", fontSize: "10px",
        padding: "3px 9px", borderRadius: "5px", background: C.bg2, color: C.text,
        border: `1px solid ${BRAND}`, fontWeight: "600",
      }});
      editBtn.addEventListener("click", () => promptEditOv?.show());
      promptHdr.appendChild(editBtn);

      const splitBtn = el("button", { type: "button", text: "✂ Split into clips", title: "Split this brief into one prompt per clip", style: {
        cursor: "pointer", fontFamily: "inherit", fontSize: "10px",
        padding: "3px 9px", borderRadius: "5px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
      }});
      const addBtn = el("button", { type: "button", text: "+", title: "Add a clip prompt", style: {
        cursor: "pointer", fontFamily: "inherit", fontSize: "11px", padding: "3px 9px",
        borderRadius: "5px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
      }});
      promptHdr.append(splitBtn, addBtn);

      const promptList = el("div", { style: { flex: "1", overflowY: "auto", display: "flex", flexDirection: "column", gap: "4px" } });
      promptList.className = "mmh3-lp";
      promptWrap.append(promptHdr, promptList);

      function normPrompt(p) {
        return typeof p === "string" ? { text: p, firstFrame: "", enabled: true } : p;
      }
      function renderPrompts() {
        clear(promptList);
        const plan = currentPlan();
        const onCount = state.prompts.filter(p => promptEnabled(p)).length;
        promptCount.textContent = `(${plan.promptCount} prompt${plan.promptCount > 1 ? "s" : ""} · ${onCount} on → ${plan.count} clip${plan.count > 1 ? "s" : ""} · ${plan.actualSeconds.toFixed(2)}s)`;
        state.prompts.forEach((raw, i) => {
          const p = normPrompt(raw);
          const on = promptEnabled(p);
          const line = el("div", { style: { display: "flex", gap: "4px", alignItems: "flex-start", opacity: on ? "1" : "0.5" } });
          const sideCol = el("div", { style: { width: "28px", flexShrink: "0", display: "flex", flexDirection: "column", gap: "2px", alignItems: "center", paddingTop: "5px" } });
          sideCol.appendChild(el("div", {
            text: `C${i + 1}`,
            style: { fontSize: "9px", fontWeight: "700", color: BRAND, whiteSpace: "nowrap" } }));
          const cb = el("input", { type: "checkbox" });
          cb.checked = on;
          cb.title = on ? "On — included in the run" : "Off — skipped when running";
          cb.style.cursor = "pointer";
          cb.addEventListener("change", () => {
            state.prompts[i] = normPrompt(state.prompts[i]);
            state.prompts[i].enabled = cb.checked;
            persist(); refreshPlan();
          });
          sideCol.appendChild(cb);

          const ta = el("textarea", { placeholder: i === 0 ? "Describe the shot…" : "(blank = reuse the previous prompt)", style: {
            flex: "1", minHeight: "120px", boxSizing: "border-box", background: C.bg2, color: C.text,
            border: `1px solid ${C.border}`, borderRadius: "6px", padding: "6px",
            fontSize: "12px", fontFamily: "inherit", outline: "none", resize: "vertical",
          }});
          ta.value = promptText(p);
          ta.addEventListener("input", () => {
            state.prompts[i] = normPrompt(state.prompts[i]);
            state.prompts[i].text = ta.value;
            persist();
          });
          ta.addEventListener("focus", () => ta.style.borderColor = BRAND);
          ta.addEventListener("blur",  () => ta.style.borderColor = C.border);

          const del = el("button", { type: "button", text: "✕", title: "Remove", style: {
            flexShrink: "0", cursor: "pointer", background: "transparent", color: C.muted,
            border: "none", fontSize: "11px", padding: "6px 2px",
          }});
          del.addEventListener("click", () => {
            if (state.prompts.length <= 1) state.prompts = [{ text: "", firstFrame: "", enabled: true }];
            else state.prompts.splice(i, 1);
            persist(); refreshPlan();
          });
          line.append(sideCol, ta, del);
          promptList.appendChild(line);
        });
      }
      addBtn.addEventListener("click", () => {
        state.prompts.push({ text: "", firstFrame: "", enabled: true });
        persist(); refreshPlan();
      });
      splitBtn.addEventListener("click", () => {
        const joined = state.prompts.map(promptText).filter(t => t && t.trim()).join("\n\n");
        if (!joined.trim()) { showPopup("Nothing to split — write the brief in the first box.", true); return; }
        // The style preamble and the sound/music tail are what every clip needs to look
        // and sound like the same piece. Splitting used to glue them onto the first and
        // last clip, leaving everything in between without them, so lift them out as the
        // common header/footer instead — composeClipPrompt then gives them to each clip.
        const { header, shots, footer } = parseBrief(joined);
        if (shots.length <= 1) { showPopup("Could not find clip boundaries ([Shot N], --- or blank lines).", true); return; }
        const parts = groupShots(shots, shots.length);
        if (header) state.promptHeader = header;
        if (footer) state.promptFooter = footer;
        state.prompts = parts.map(t => ({ text: t, firstFrame: "", enabled: true }));
        persist(); refreshPlan();
        const carried = [header && "header", footer && "tail"].filter(Boolean).join(" + ");
        showPopup(`Split into ${parts.length} clips${carried ? ` — shared ${carried} kept on every clip` : ""}.`, false);
      });

      rightPanel.append(previewBox, statusWrap, promptWrap);
      mainRow.append(leftOuter, rightPanel);
      root.appendChild(mainRow);

      // ══ LEFT PANEL ══════════════════════════════════════════════════════════
      function currentPlan() { return clipPlan(state); }

      let planLine = null, totalLine = null;
      function refreshPlan() {
        const p = currentPlan();
        const { width, height } = resolveResolution(state.aspect, state.megapixels);
        if (totalLine) {
          // Total length is derived, never typed: prompts x their repeat x clip length.
          // One-Take + auto-stitch trims `overlap` seconds off every clip after the first,
          // so the naive sum ("single") and what actually gets saved ("onetake") diverge —
          // show both rather than silently picking one.
          if (p.isOneTakeStitched && p.count > 1) {
            totalLine.innerHTML =
              `<span style="font-size:13px;color:${C.muted}">single: </span>`
              + `<span style="font-size:15px;font-weight:700;color:${C.muted}">${p.actualSeconds.toFixed(2)}s</span>`
              + `<span style="font-size:13px;color:${C.muted}"> / </span>`
              + `<span style="font-size:13px;color:${C.muted}">onetake: </span>`
              + `<span style="font-size:20px;font-weight:700;color:${BRAND}">${p.stitchedSeconds.toFixed(2)}s</span>`
              + `<span style="font-size:11px;color:${C.muted}"> total</span>`;
          } else {
            totalLine.innerHTML =
              `<span style="font-size:20px;font-weight:700;color:${BRAND}">${p.actualSeconds.toFixed(2)}s</span>`
              + `<span style="font-size:11px;color:${C.muted}"> total</span>`;
          }
        }
        if (planLine) {
          planLine.innerHTML =
            `<b>${p.count}</b> clip${p.count > 1 ? "s" : ""} from <b>${p.promptCount}</b> prompt${p.promptCount > 1 ? "s" : ""}`
            + ` · est. <b>${formatDuration(p.estimateMinutes)}</b>`
            + `<br><span style="color:${C.muted}">${width}×${height} · ${p.clipSec.toFixed(2)}s/clip · ${state.clipFrames} frames</span>`;
        }
        renderPrompts();
      }
      ctx.refreshPlan = refreshPlan;
      ctx.refreshModes = () => { renderPills(); renderLeft(); };

      // Audio for the lock: pick something already in ComfyUI's input folder, or
      // upload one. Same two-control shape the reference-audio rows use.
      function audioFilePicker() {
        const files = ctx.audioFiles || [];
        const opts = ['', ...files].map(f => ({ value: f, label: f || (ctx.audioFiles ? '— pick a file —' : 'loading…') }));
        const sel = select(opts, state.lockAudioFile || '', v => { state.lockAudioFile = v; persist(); renderLeft(); });
        const up = el('button', { type: 'button', text: '⬆', title: 'Upload', style: {
          cursor: 'pointer', fontFamily: 'inherit', fontSize: '10px', padding: '4px', width: '26px',
          borderRadius: '5px', background: C.bg3, color: C.text, border: `1px solid ${C.border}`, flexShrink: '0',
        }});
        const inp = el('input', { type: 'file', accept: 'audio/*', style: { display: 'none' } });
        up.addEventListener('click', () => inp.click());
        inp.addEventListener('change', async () => {
          const f = inp.files[0]; inp.value = '';
          if (!f) return;
          up.textContent = '…';
          try {
            state.lockAudioFile = await uploadMedia(f);
            ctx.audioFiles = null;                 // force a refetch so it lists
            persist(); loadAudioFiles(); renderLeft();
          } catch (e) { showPopup(e.message, true); up.textContent = '⬆'; }
        });
        return col([row([col([sel]), up, inp]), state.lockAudioFile ? audioPreviewPlayer(state.lockAudioFile) : null]);
      }

      // Playback + trim controls for the locked audio file. Playback/seek stay confined to
      // the trimmed range ([effStart, effEnd]) — content outside it never reaches Audio Lock
      // either, so previewing it would be misleading.
      function audioPreviewPlayer(filename) {
        const audio = el("audio", { preload: "metadata", src: `/view?filename=${encodeURIComponent(filename)}&type=input`, style: { display: "none" } });
        const playBtn = el("button", { type: "button", text: "▶", style: {
          cursor: "pointer", fontFamily: "inherit", fontSize: "11px", width: "26px", height: "26px",
          borderRadius: "5px", background: C.bg3, color: C.text, border: `1px solid ${C.border}`, flexShrink: "0",
        }});
        const timeLbl = el("span", { text: "0:00 / 0:00", style: { fontSize: "10px", color: C.muted, minWidth: "72px", textAlign: "center", flexShrink: "0" } });
        const seek = el("input", { type: "range", min: "0", max: "1000", value: "0", class: "mmh3-seek", style: { flex: "1", minWidth: "0" } });
        let seeking = false, loopOn = false;
        const loopBtn = el("button", { type: "button", text: "🔁", title: "Loop the trimmed range", style: {
          cursor: "pointer", fontFamily: "inherit", fontSize: "11px", width: "26px", height: "26px",
          borderRadius: "5px", background: C.bg3, color: C.muted, border: `1px solid ${C.border}`, flexShrink: "0",
        }});
        loopBtn.addEventListener("click", () => {
          loopOn = !loopOn;
          loopBtn.style.background = loopOn ? BRAND : C.bg3;
          loopBtn.style.color = loopOn ? "#fff" : C.muted;
        });

        const fmt = s => {
          if (!isFinite(s) || s < 0) return "0:00";
          const m = Math.floor(s / 60), ss = Math.floor(s % 60).toString().padStart(2, "0");
          return `${m}:${ss}`;
        };
        const effStart = () => Math.max(0, state.audioLockTrimStart || 0);
        const effEnd = () => {
          const dur = audio.duration || 0;
          const e = state.audioLockTrimEnd || 0;
          return e > 0 ? Math.min(e, dur || e) : dur;
        };

        playBtn.addEventListener("click", () => {
          if (audio.paused) {
            const s = effStart(), e = effEnd();
            if (audio.currentTime < s || (e > s && audio.currentTime >= e)) audio.currentTime = s;
            audio.play().catch(() => {});
          } else audio.pause();
        });
        audio.addEventListener("play",  () => { playBtn.textContent = "⏸"; });
        audio.addEventListener("pause", () => { playBtn.textContent = "▶"; });
        audio.addEventListener("ended", () => { playBtn.textContent = "▶"; });
        audio.addEventListener("timeupdate", () => {
          if (seeking) return;
          const s = effStart(), e = effEnd();
          if (e > s && audio.currentTime >= e) {
            if (loopOn) { audio.currentTime = s; audio.play().catch(() => {}); }
            else { audio.pause(); audio.currentTime = e; }
          }
          const span = Math.max(0.001, e - s);
          const pos = Math.min(1, Math.max(0, (audio.currentTime - s) / span));
          seek.value = String(pos * 1000);
          timeLbl.textContent = `${fmt(Math.max(0, audio.currentTime - s))} / ${fmt(span)}`;
        });
        audio.addEventListener("loadedmetadata", () => {
          audio.currentTime = effStart();
          timeLbl.textContent = `0:00 / ${fmt(effEnd() - effStart())}`;
          updateTrimHint();
        });
        seek.addEventListener("input", () => {
          seeking = true;
          const s = effStart(), e = effEnd(), span = Math.max(0.001, e - s);
          audio.currentTime = s + (parseFloat(seek.value) / 1000) * span;
          timeLbl.textContent = `${fmt(audio.currentTime - s)} / ${fmt(span)}`;
        });
        seek.addEventListener("change", () => { seeking = false; });

        const trimHint = el("div", { text: "", style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } });
        function updateTrimHint() {
          const dur = audio.duration || 0;
          const s = effStart(), e = effEnd(), len = Math.max(0, e - s);
          trimHint.textContent = dur
            ? `Usable range: ${fmt(s)} – ${fmt(e)} (${len.toFixed(1)}s) — preview is confined to this range too`
            : "";
          if (audio.currentTime < s || (e > s && audio.currentTime > e)) audio.currentTime = s;
          const span = Math.max(0.001, e - s);
          const pos = Math.min(1, Math.max(0, (audio.currentTime - s) / span));
          seek.value = String(pos * 1000);
          timeLbl.textContent = `${fmt(Math.max(0, audio.currentTime - s))} / ${fmt(span)}`;
        }
        // Fixed width, not flex-grow — the buttons next to these fields already claim a
        // known amount of space in the node's ~276px panel, and a plain flex-item with
        // width:100% (numberField's own style) collapsed to 0 here instead of filling the
        // remainder, so give it something concrete to size against instead.
        const startField = numberField(state.audioLockTrimStart || 0, v => { state.audioLockTrimStart = Math.max(0, v); persist(); updateTrimHint(); }, 0.1);
        const endField   = numberField(state.audioLockTrimEnd   || 0, v => { state.audioLockTrimEnd   = Math.max(0, v); persist(); updateTrimHint(); }, 0.1);
        startField.style.width = "64px"; startField.style.flexShrink = "0";
        endField.style.width   = "64px"; endField.style.flexShrink   = "0";
        // Short labels on purpose — the node's ~276px panel is much narrower than the web
        // app's, and "At playhead"/"Full length" alongside a number field wouldn't fit
        // (the field would get crushed to a sliver, which is exactly what happened before).
        const setBtnStyle = { cursor: "pointer", fontFamily: "inherit", fontSize: "10px", padding: "4px 6px", borderRadius: "5px", background: C.bg3, color: C.text, border: `1px solid ${C.border}`, flexShrink: "0" };
        const setStartBtn   = el("button", { type: "button", text: "Now",  title: "Set to current playhead position", style: setBtnStyle });
        const setEndBtn      = el("button", { type: "button", text: "Now",  title: "Set to current playhead position", style: setBtnStyle });
        const setEndFullBtn = el("button", { type: "button", text: "Full", title: "Set to the full length of the file", style: setBtnStyle });
        setStartBtn.addEventListener("click", () => {
          state.audioLockTrimStart = Math.round((audio.currentTime || 0) * 100) / 100;
          startField.value = String(state.audioLockTrimStart); persist(); updateTrimHint();
        });
        setEndBtn.addEventListener("click", () => {
          state.audioLockTrimEnd = Math.round((audio.currentTime || 0) * 100) / 100;
          endField.value = String(state.audioLockTrimEnd); persist(); updateTrimHint();
        });
        setEndFullBtn.addEventListener("click", () => {
          state.audioLockTrimEnd = Math.round((audio.duration || 0) * 100) / 100;
          endField.value = String(state.audioLockTrimEnd); persist(); updateTrimHint();
        });
        updateTrimHint();

        // Stacked full-width, not side-by-side — at half the ~276px panel width there's no
        // room left for a usable number field once a couple of buttons sit next to it.
        const trimRow = row([
          col([label("Trim start (s)"), row([startField, setStartBtn])]),
          col([label("Trim End (s)"), row([col([endField]), setEndBtn, setEndFullBtn])]),
        ]);

        return col([row([playBtn, loopBtn, seek, timeLbl, audio], "6px"), trimRow, trimHint]);
      }

      function checkboxRow(text, checked, onChange, opts) {
        const { disabled = false, title = "" } = opts || {};
        const chk = el("input", { type: "checkbox" });
        chk.checked = !!checked;
        chk.disabled = disabled;
        chk.addEventListener("change", () => onChange(chk.checked));
        const label = el("label", { style: { display: "flex", alignItems: "center", gap: "6px",
          fontSize: "11px", color: disabled ? C.muted : C.text, cursor: disabled ? "default" : "pointer" } },
          [chk, el("span", { text })]);
        if (title) label.title = title;
        return label;
      }

      /**
       * A collapsible left-panel section.
       *
       * The panel is narrow and the pipeline now has enough knobs that showing them all
       * at once buries the ones being used. Collapsed sections still carry a summary of
       * what they're set to, so the column reads as a status list without expanding
       * anything; `state.accordion` remembers what was open, so a reopened workflow
       * looks the way it was left.
       *
       * `body` is a thunk — a collapsed section never builds its contents at all.
       */
      function accordion(key, title, summary, body) {
        const open = !!state.accordion?.[key];
        const head = el("div", { style: {
          display: "flex", alignItems: "center", gap: "6px", cursor: "pointer",
          userSelect: "none", padding: "1px 0",
        }});
        head.append(
          el("div", { text: open ? "▼" : "▶", style: { fontSize: "9px", color: C.muted, width: "10px", flexShrink: "0" } }),
          el("div", { text: title, style: {
            fontSize: "10px", fontWeight: "700", letterSpacing: "0.06em",
            textTransform: "uppercase", color: C.muted, flexShrink: "0" } }),
          el("div", { text: summary || "", title: summary || "", style: {
            flex: "1", textAlign: "right", fontSize: "10px",
            color: summary && summary !== "OFF" && summary !== "None" ? BRAND : C.muted,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }),
        );
        head.addEventListener("click", () => {
          state.accordion = { ...(state.accordion || {}), [key]: !open };
          persist(); renderLeft();
        });
        return panel([head, ...(open ? body().filter(Boolean) : [])]);
      }

      function renderLeft() {
        // Every control in this column re-runs renderLeft(), which rebuilds the whole
        // panel — and a rebuilt scroll container starts back at the top. Ticking one
        // checkbox halfway down therefore threw you back to Canvas and you had to scroll
        // down again for the next one. Remember where the column was and put it back
        // after the rebuild; the browser clamps for us if the new content is shorter.
        const prevScroll = leftPanel.scrollTop;
        const contModes = continuityModesFor(state.generationMode, state);
        const lockAvailable = !!ctx.availability?.TJ_H3_AudioLock;
        const hasTrim       = !!ctx.availability?.TrimAudioDuration;
        // A continuity option that this mode does not offer, or whose model is
        // missing, must not stay selected. None is always available.
        const cur = contModes.find(m => m.key === state.continuityMode);
        if (!cur || cur.disabled) { state.continuityMode = "none"; persist(); }
        clear(leftPanel);

        // A saved state can hold a combination the current turbo selection forbids —
        // carried over from before, or left behind when turbo was switched on. Normalise
        // here rather than only on change, so a reloaded node can never sit on an option
        // that its own dropdown greys out.
        //
        // Every change here is announced. These used to be silent, and a silently
        // rewritten accelerator is invisible until a render takes hours: the panel shows
        // the value it just wrote, so it agrees with itself and looks like what you
        // chose. If this code is going to overrule a selection, saying so is the whole
        // job — the render is long enough that a wrong stack costs an evening.
        const forced = [];
        const force = (what, from, to, why) => {
          if (from === to) return;
          forced.push(`${what}: ${from} → ${to} (${why})`);
        };
        let reason;
        if ((reason = attnBlockedReason(state.attnBackend, state.turboMode))) {
          const next = state.turboMode === "lightx2v" ? "sla" : "sage";
          force("Attention backend", state.attnBackend, next, reason);
          state.attnBackend = next;
          persist();
        }
        if ((reason = attnForwardBlockedReason(state.attnForward, state.turboMode, state.attnBackend))) {
          const next =
            attnForwardBlockedReason("memeff_sage", state.turboMode, state.attnBackend) ? "none" : "memeff_sage";
          force("H3 attention forward", state.attnForward, next, reason);
          state.attnForward = next;
          persist();
        }
        if ((reason = blockCacheBlockedReason(state.blockCache, state.turboMode))) {
          force("Block cache", state.blockCache, "none", reason);
          state.blockCache = "none";
          persist();
        }
        if (forced.length) {
          console.warn("[MMH3] pipeline selections overruled:\n  " + forced.join("\n  "));
          showPopup("Pipeline changed automatically — " + forced.join(" · "), true);
        }

        // resolution
        leftPanel.appendChild(panel([
          label("Canvas"),
          row([
            col([label("Aspect"), select(ASPECTS.map(a => ({ value: a.label, label: a.label })), state.aspect,
              v => { state.aspect = v; persist(); refreshPlan(); })]),
            col([label("Megapixels"), numberField(state.megapixels ?? 1.0,
              v => { state.megapixels = Math.max(0.1, v); persist(); refreshPlan(); }, 0.1)]),
          ]),
        ]));

        // length — total is computed from the prompts, so there is nothing to type here
        planLine  = el("div", { style: { fontSize: "11px", lineHeight: "1.65", color: C.text } });
        totalLine = el("div", { style: {
          textAlign: "center", padding: "6px 0 2px", lineHeight: "1.1",
          borderBottom: `1px solid ${C.border}`, marginBottom: "5px",
        }});
        leftPanel.appendChild(panel([
          label("Clip length"),
          select(
            [...CLIP_LENGTHS.map(c => ({ value: String(c.frames), label: c.label })), { value: "custom", label: "Custom (seconds)…" }],
            state.clipLengthCustom ? "custom" : String(state.clipFrames),
            v => {
              if (v === "custom") {
                state.clipLengthCustom = true;
                state.clipFrames = alignFrameCount(state.clipLengthCustomSec * FPS);
              } else {
                state.clipLengthCustom = false;
                state.clipFrames = parseInt(v, 10);
              }
              persist(); renderLeft();
            }),
          ...(state.clipLengthCustom ? [row([
            numberField(state.clipLengthCustomSec, v => {
              state.clipLengthCustomSec = Math.max(0.1, v);
              state.clipFrames = alignFrameCount(state.clipLengthCustomSec * FPS);
              persist(); refreshPlan();
            }, 0.1),
          ])] : []),
          totalLine,
          planLine,
          el("div", { text: "Length follows the prompts: one prompt is one clip. Add a prompt "
            + "(or split the brief into shots) to make the piece longer. Each clip is saved "
            + "on its own; combine them afterwards from 🖼 Gallery → 🔗 Stitch.",
            style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } }),
        ]));
        refreshPlan();

        // pipeline options — each accel mode's knobs render right under the dropdown so
        // switching modes never means a round-trip through the Settings modal.
        // ── pipeline ──────────────────────────────────────────────────────────
        // One accordion per patch layer. The layers are genuinely independent (see the
        // graph builder), so the only thing keeping combinations apart is the turbo
        // selection, which is why it sits first.
        const availKnown = ctx.availability && Object.keys(ctx.availability).length;
        const missingNode = (node) => node && availKnown && !ctx.availability[node];
        const warn = (node) => missingNode(node) ? el("div", {
          html: `⚠ <code>${node}</code> not installed — this option is skipped at run time.`,
          style: { fontSize: "10px", color: C.warn, lineHeight: "1.5" } }) : null;
        // Same shape as warn(), muted rather than amber: this describes how two legal
        // options interact, it is not something to fix.
        const hint = (text) => text ? el("div", {
          text,
          style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } }) : null;
        // A dropdown whose blocked entries stay visible, greyed, with the reason inline —
        // an option that vanishes just reads as a bug.
        const gatedSelect = (opts, value, reasonFor, onChange) => select(
          opts.map(o => {
            const why = reasonFor(o.key);
            return { value: o.key, disabled: !!why, label: why ? `${o.label} — ${why}` : o.label };
          }), value, onChange);
        const loraOpts = ["none", ...((ctx.availableModels?.loras) || []).filter(x => x !== "none")];
        // Turbo LoRA choices are install-level, not per-run, so they round-trip through
        // the server config the way the model pickers do — picked once, remembered.
        const rememberLora = (patch) => { persist(); saveConfig(patch).catch(() => {}); };
        const shortLabel = (s) => String(s || "").replace(/ \(.*\)/, "");

        const turboMode = state.turboMode || "none";
        const turboLabel = (TURBO_MODES.find(t => t.key === turboMode) || {}).label || "None";
        leftPanel.appendChild(accordion("turbo", "Turbo",
          turboMode === "none" ? "None"
            : (effectiveTurbo(state, ctx.availability).mode === "none"
                ? `${shortLabel(turboLabel)} · inactive`
                : `${shortLabel(turboLabel)} · ${effectiveSteps(state, ctx.availability)} steps`),
          () => {
            const rows = [
              col([label("Turbo"), select(TURBO_MODES.map(t => ({ value: t.key, label: t.label })),
                turboMode, v => { state.turboMode = v; persist(); renderLeft(); })]),
              warn((TURBO_MODES.find(t => t.key === turboMode) || {}).node),
              (() => {
                const eff = effectiveTurbo(state, ctx.availability);
                return eff.fellBack ? el("div", { text: `⚠ ${eff.reason}`,
                  style: { fontSize: "10px", color: C.warn, lineHeight: "1.5" } }) : null;
              })(),
            ];
            if (turboMode === "larryvrh") {
              const isRef = state.generationMode === "reference";
              rows.push(
                col([label(`Turbo LoRA (Text / First-Last)${isRef ? "" : " ●"}`),
                  loraSelect(loraOpts, state.turboLora || "none",
                    v => { state.turboLora = v; rememberLora({ turbo_lora: v }); }).el]),
                col([label(`Turbo LoRA (Reference)${isRef ? " ●" : ""}`),
                  loraSelect(loraOpts, state.turboLoraReference || "none",
                    v => { state.turboLoraReference = v; rememberLora({ turbo_lora_reference: v }); }).el]),
                el("div", { text: isRef
                    ? "● Reference mode uses the Reference slot; it falls back to the first one when that is unset."
                    : "● This mode uses the first slot.",
                  style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } }),
                row([
                  col([label("strength"), numberField(state.turboLoraStrength ?? 1.0,
                    v => { state.turboLoraStrength = v; rememberLora({ turbo_lora_strength: v }); }, 0.05)]),
                  col([label("turbo steps"), numberField(state.turboSteps ?? 4,
                    v => { state.turboSteps = Math.max(1, Math.round(v)); persist(); renderLeft(); }, 1)]),
                ]),
                checkboxRow("Low VRAM turbo load", !!state.turboLoraLowVram,
                  v => { state.turboLoraLowVram = v; rememberLora({ turbo_lora_low_vram: v }); }),
                el("div", { text: "Runs a 4-step schedule, so sparse attention and the step caches are unavailable — their error has nowhere to average out.",
                  style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } }),
              );
            } else if (turboMode === "lightx2v") {
              rows.push(
                col([label("SLA turbo LoRA"), loraSelect(loraOpts, state.slaTurboLora || "none",
                  v => { state.slaTurboLora = v; rememberLora({ sla_turbo_lora: v }); }).el]),
                row([
                  col([label("strength"), numberField(state.slaTurboStrength ?? 1.0,
                    v => { state.slaTurboStrength = v; rememberLora({ sla_turbo_strength: v }); }, 0.05)]),
                  col([label("steps"), numberField(state.slaTurboSteps ?? 6,
                    v => { state.slaTurboSteps = Math.max(1, Math.round(v)); persist(); renderLeft(); }, 1)]),
                ]),
                el("div", { text: "An ordinary LoRA distilled against the SLA kernel — it gives no speedup on its own, so H3 SLA Attention is selected and locked below. 6 steps is what its authors recommend.",
                  style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } }),
              );
            }
            return rows;
          }));

        const attnLabel = (ATTN_BACKENDS.find(a => a.key === state.attnBackend) || {}).label || "None";
        const fwdLabel  = (ATTN_FORWARDS.find(a => a.key === state.attnForward) || {}).label || "None";
        leftPanel.appendChild(accordion("attn", "Attention",
          state.attnForward === "none" ? attnLabel
            : `${shortLabel(attnLabel)} + ${shortLabel(fwdLabel).replace("H3 ", "")}`,
          () => {
            const rows = [
              col([label("Attention backend"), gatedSelect(ATTN_BACKENDS, state.attnBackend,
                k => attnBlockedReason(k, turboMode),
                v => { state.attnBackend = v; persist(); renderLeft(); })]),
              warn((ATTN_BACKENDS.find(a => a.key === state.attnBackend) || {}).node),
            ];
            if (state.attnBackend === "sage") {
              rows.push(col([label("mode"), select(
                ["auto", "disabled", "sageattn3", "sageattn3_per_block_mean",
                 "sageattn_qk_int8_pv_fp16_cuda", "sageattn_qk_int8_pv_fp8_cuda"].map(x => ({ value: x, label: x })),
                state.sageAttnMode || "auto", v => { state.sageAttnMode = v; persist(); })]));
            } else if (state.attnBackend === "ck") {
              rows.push(col([label("attention"), select(
                [{ value: "comfy_kitchen", label: "comfy kitchen attention" }, { value: "pytorch", label: "pytorch attention" }],
                state.ckAttentionBackend || "comfy_kitchen", v => { state.ckAttentionBackend = v; persist(); })]));
            } else if (state.attnBackend === "solattn_kijai") {
              rows.push(
                row([
                  col([label("tau"), numberField(state.solTau ?? 1.3, v => { state.solTau = v; persist(); }, 0.05)]),
                  col([label("min tokens"), numberField(state.solMinTokens ?? 4096, v => { state.solMinTokens = Math.round(v); persist(); }, 512)]),
                ]),
                row([
                  col([label("start %"), numberField(state.solStart ?? 0.2, v => { state.solStart = v; persist(); }, 0.05)]),
                  col([label("end %"),   numberField(state.solEnd ?? 0.9,   v => { state.solEnd = v; persist(); }, 0.05)]),
                ]));
            } else if (state.attnBackend === "sla") {
              rows.push(
                row([
                  col([label("sparsity"), numberField(state.slaSparsity ?? 0.90, v => { state.slaSparsity = v; persist(); }, 0.05)]),
                  col([label("block size"), select(["64", "128"].map(x => ({ value: x, label: x })),
                    state.slaBlockSize || "64", v => { state.slaBlockSize = v; persist(); })]),
                ]),
                row([
                  col([label("min seq len"), numberField(state.slaMinSeqLen ?? 8192, v => { state.slaMinSeqLen = Math.round(v); persist(); }, 1024)]),
                  col([label("dense last steps"), numberField(state.slaDenseLastSteps ?? 0, v => { state.slaDenseLastSteps = Math.round(v); persist(); }, 1)]),
                ]),
                checkboxRow("Protect audio (always attend text/cond/audio prefix)", state.slaProtectAudio !== false,
                  v => { state.slaProtectAudio = v; persist(); }),
                checkboxRow("Enabled (node bypass)", state.slaRunEnabled !== false,
                  v => { state.slaRunEnabled = v; persist(); },
                  { title: "Off runs dense attention without removing the node — for a like-for-like baseline." }));
            }

            rows.push(
              col([label("H3 attention forward"), gatedSelect(ATTN_FORWARDS, state.attnForward,
                k => attnForwardBlockedReason(k, turboMode, state.attnBackend),
                v => { state.attnForward = v; persist(); renderLeft(); })]),
              warn((ATTN_FORWARDS.find(a => a.key === state.attnForward) || {}).node));
            const overlap = attnForwardOverlapNote(state.attnForward, state.attnBackend);
            if (overlap) rows.push(hint(overlap));

            if (state.attnForward === "solattn_sag") {
              rows.push(
                row([
                  col([label("tau start"), numberField(state.solSagTauStart ?? 1.3, v => { state.solSagTauStart = v; persist(); }, 0.05)]),
                  col([label("tau end"),   numberField(state.solSagTauEnd ?? 0.8,   v => { state.solSagTauEnd = v; persist(); }, 0.05)]),
                ]),
                row([
                  col([label("curve"), select(["linear", "cosine", "sqrt", "smoothstep"].map(x => ({ value: x, label: x })),
                    state.solSagCurve || "linear", v => { state.solSagCurve = v; persist(); })]),
                  col([label("dense %"), numberField(state.solSagDensePercent ?? 0, v => { state.solSagDensePercent = v; persist(); }, 0.05)]),
                ]),
                row([
                  col([label("min tokens"), numberField(state.solSagMinTokens ?? 4096, v => { state.solSagMinTokens = Math.round(v); persist(); }, 256)]),
                  col([label("thresh"), select(["diag", "exact"].map(x => ({ value: x, label: x })),
                    state.solSagThreshType || "diag", v => { state.solSagThreshType = v; persist(); })]),
                ]),
                col([label("sink conditioning"), select(
                  ["exact_kv", "exact_kv_and_rows", "off"].map(x => ({ value: x, label: x })),
                  state.solSagSinkCond || "exact_kv", v => { state.solSagSinkCond = v; persist(); })]),
                col([label("dense blocks (e.g. 0-2,-1)"), (() => {
                  const i = el("input", { type: "text", style: {
                    width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text,
                    border: `1px solid ${C.border}`, borderRadius: "6px", padding: "6px",
                    fontSize: "12px", fontFamily: "inherit", outline: "none" } });
                  i.value = state.solSagDenseBlocks || "";
                  i.addEventListener("input", () => { state.solSagDenseBlocks = i.value; persist(); });
                  return i;
                })()]),
                row([
                  col([checkboxRow("int8 qk", !!state.solSagInt8Qk, v => { state.solSagInt8Qk = v; persist(); })]),
                  col([checkboxRow("int8 pv", !!state.solSagInt8Pv, v => { state.solSagInt8Pv = v; persist(); })]),
                ]),
                el("div", { text: ctx.availability?.MiniMaxH3MemoryEfficientSageAttentionPatch
                    ? "Runs on strided views of the fused qkv projection — no q/k/v copies. MemEff Sage is installed ahead of it and adopted as the fallback for calls the sparse kernel can't take."
                    : "Runs on strided views of the fused qkv projection — no q/k/v copies.",
                  style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } }),
              );
            }
            return rows;
          }));

        const cacheLabel = (BLOCK_CACHES.find(c => c.key === state.blockCache) || {}).label || "None";
        leftPanel.appendChild(accordion("cache", "Block cache",
          state.blockCache === "fbcache"
            ? `${cacheLabel.replace("H3 ", "")} · ${String(state.fbcMode || "").split(" — ")[0].replace("H3 ", "")}`
            : cacheLabel,
          () => {
            const rows = [
              col([label("Block cache"), gatedSelect(BLOCK_CACHES, state.blockCache,
                k => blockCacheBlockedReason(k, turboMode),
                v => { state.blockCache = v; persist(); renderLeft(); })]),
              warn((BLOCK_CACHES.find(c => c.key === state.blockCache) || {}).node),
            ];
            if (state.blockCache === "h3cache") {
              rows.push(
                row([
                  col([label("reuse threshold"), numberField(state.cacheThreshold ?? 0.3, v => { state.cacheThreshold = v; persist(); }, 0.05)]),
                  col([label("max steps"), numberField(state.cacheMaxSteps ?? 2, v => { state.cacheMaxSteps = Math.round(v); persist(); }, 1)]),
                ]),
                row([
                  col([label("start %"), numberField(state.cacheStart ?? 0.15, v => { state.cacheStart = v; persist(); }, 0.05)]),
                  col([label("end %"),   numberField(state.cacheEnd ?? 0.9,   v => { state.cacheEnd = v; persist(); }, 0.05)]),
                ]));
            } else if (state.blockCache === "fbcache") {
              const custom = (state.fbcMode || FBC_MODES[1]) === FBC_MODES[3];
              const dim = (f) => { if (!custom) { f.disabled = true; f.style.opacity = "0.4"; } return f; };
              // Same treatment for a row that wraps its input. The node reads NONE of the
              // manual values outside Custom mode — it swaps in the preset's own config
              // wholesale — so anything still live here is the panel telling you it did
              // something it didn't.
              const dimRow = (rowEl) => {
                if (!custom) {
                  rowEl.style.opacity = "0.4";
                  rowEl.querySelectorAll("input, select").forEach(i => { i.disabled = true; });
                }
                return rowEl;
              };
              rows.push(
                col([label("mode"), select(FBC_MODES.map(m => ({ value: m, label: m })),
                  state.fbcMode || FBC_MODES[1], v => { state.fbcMode = v; persist(); renderLeft(); })]),
                row([
                  col([label("threshold"), dim(numberField(state.fbcThreshold ?? 0.10, v => { state.fbcThreshold = v; persist(); }, 0.005))]),
                  col([label("max hits"),  dim(numberField(state.fbcMaxHits ?? 2, v => { state.fbcMaxHits = Math.round(v); persist(); }, 1))]),
                ]),
                row([
                  col([label("start %"), dim(numberField(state.fbcStartPercent ?? 0.10, v => { state.fbcStartPercent = v; persist(); }, 0.01))]),
                  col([label("end %"),   dim(numberField(state.fbcEndPercent ?? 0.95, v => { state.fbcEndPercent = v; persist(); }, 0.01))]),
                ]),
                dimRow(checkboxRow("Temporal guard", !!state.fbcTemporalGuard, v => { state.fbcTemporalGuard = v; persist(); })),
                custom ? null : el("div", { text: "The three named presets carry their own calibration — every value above, Temporal guard included, applies only in Custom mode.",
                  style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } }),
              );
            }
            return rows;
          }));

        leftPanel.appendChild(accordion("spectrum", "Spectrum", state.useSpectrum ? "ON" : "OFF", () => {
          const rows = [
            checkboxRow("Spectrum (forecast whole steps)", !!state.useSpectrum,
              v => { state.useSpectrum = v; persist(); renderLeft(); }),
            warn(state.useSpectrum ? "SpectrumApplyMiniMaxH3" : null),
          ];
          if (state.useSpectrum) {
            const n = (v, set, step = 0.05) => numberField(v, x => { set(x); persist(); }, step);
            rows.push(
              row([
                col([label("blend weight"), n(state.specBlendWeight ?? 0.5, v => state.specBlendWeight = v)]),
                col([label("degree"),       n(state.specDegree ?? 1, v => state.specDegree = Math.round(v), 1)]),
              ]),
              row([
                col([label("ridge lambda"), n(state.specRidgeLambda ?? 0.1, v => state.specRidgeLambda = v)]),
                col([label("window size"),  n(state.specWindowSize ?? 2.0, v => state.specWindowSize = v, 0.25)]),
              ]),
              row([
                col([label("flex window"),  n(state.specFlexWindow ?? 0.75, v => state.specFlexWindow = v)]),
                col([label("max history"),  n(state.specMaxHistory ?? 8, v => state.specMaxHistory = Math.round(v), 1)]),
              ]),
              row([
                col([label("warmup steps"), n(state.specWarmupSteps ?? 1, v => state.specWarmupSteps = Math.round(v), 1)]),
                col([label("tail steps"),   n(state.specTailSteps ?? 1, v => state.specTailSteps = Math.round(v), 1)]),
              ]),
              col([label("history storage"), select(
                [{ value: "system_ram", label: "system_ram" }, { value: "vram", label: "vram" }],
                state.specHistoryStore || "system_ram", v => { state.specHistoryStore = v; persist(); })]),
              el("div", { text: "Skips whole sampling steps by extrapolating the latent — a different axis from the block cache above, so the two combine.",
                style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } }),
            );
          }
          return rows;
        }));

        leftPanel.appendChild(accordion("patches", "Model patches",
          [state.useFusedModulation && "Fused Mod", state.useTorchPatch !== false && "Torch"].filter(Boolean).join(" + ") || "OFF",
          () => [
            checkboxRow("Fused Modulation (AdaLN + gated residual)", !!state.useFusedModulation,
              v => { state.useFusedModulation = v; persist(); renderLeft(); },
              { title: "Patches blocks[i].forward — a layer nothing else here uses, so it stacks with every option above." }),
            warn(state.useFusedModulation ? "MiniMaxH3FusedModulation" : null),
            checkboxRow("Torch settings patch", state.useTorchPatch !== false,
              v => { state.useTorchPatch = v; persist(); renderLeft(); }),
            state.useTorchPatch !== false
              ? checkboxRow("fp16 accumulation", state.fp16Accum !== false, v => { state.fp16Accum = v; persist(); })
              : null,
          ]));

        leftPanel.appendChild(accordion("upscale", "Upscale",
          (UPSCALE_MODES.find(m => m.key === state.upscaleMode) || {}).label || "None",
          () => [
            col([label("Upscale"), select(UPSCALE_MODES.map(m => ({ value: m.key, label: m.label })),
              state.upscaleMode, v => { state.upscaleMode = v; persist(); renderLeft(); })]),
            state.upscaleMode === "rtx" ? row([
              col([label("RTX scale"), numberField(state.rtxScale ?? 2, v => { state.rtxScale = v; persist(); }, 0.5)]),
              col([label("Quality"), select(["LOW","MEDIUM","HIGH","ULTRA"].map(q => ({ value: q, label: q })),
                state.rtxQuality || "ULTRA", v => { state.rtxQuality = v; persist(); })]),
            ]) : null,
          ]));

        leftPanel.appendChild(accordion("continuity", "Continuity",
          (contModes.find(m => m.key === state.continuityMode) || {}).label || "None",
          () => {
            const rows = [
              col([label("Continuity between clips"), select(
                contModes.map(m => ({ value: m.key, disabled: m.disabled,
                  label: m.disabled ? `${m.label} — ${m.reason}` : m.label })),
                state.continuityMode, v => { state.continuityMode = v; persist(); renderLeft(); })]),
              el("div", { text: (contModes.find(m => m.key === state.continuityMode) || {}).hint || "",
                style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } }),
              el("div", { text: "One prompt renders one clip. To make a longer piece that holds together, split the brief into shots — each shot becomes a clip and continuity carries the look forward.",
                style: { fontSize: "10px", color: C.muted, lineHeight: "1.5", marginTop: "2px" } }),
            ];
            if (state.continuityMode === "onetake") {
              if (!ctx.availability?.TJ_H3_LatentContinuation) rows.push(el("div", {
                html: "⚠ <code>TJ_H3_LatentContinuation</code> not installed — update the TJ_NODE pack, or switch Continuity to something else.",
                style: { fontSize: "10px", color: C.warn, lineHeight: "1.5", marginTop: "4px" } }));
              rows.push(
                checkboxRow("Lock the whole audio stream (with Latent Continuation)", !!state.oneTakeLockAudio,
                  v => { state.oneTakeLockAudio = v; persist(); }),
                checkboxRow("Auto-stitch into one clip when the run finishes (overlap trimmed)",
                  state.oneTakeAutoStitch !== false, v => { state.oneTakeAutoStitch = v; persist(); renderLeft(); }),
                el("div", { text: state.oneTakeAutoStitch !== false
                    ? "The stitched result (overlap trimmed) is what lands in the Gallery. Per-clip files and checkpoints stay on disk too, for resuming a stopped run."
                    : "Off — clips stay separate, same as any other run; nothing gets auto-combined.",
                  style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } }),
              );
              if (state.oneTakeAutoStitch !== false) rows.push(
                checkboxRow("Replace with Audio Lock source (skip generated audio)",
                  !!state.oneTakeAudioOverride, v => { state.oneTakeAudioOverride = v; persist(); },
                  { disabled: !state.audioLock || !state.lockAudioFile }),
                el("div", { text: state.audioLock && state.lockAudioFile
                    ? "The stitched result's audio track is swapped for the locked source file itself (trimmed to match), instead of the model's generated audio."
                    : "Needs Audio Lock on with a file selected.",
                  style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } }),
              );
            }
            return rows;
          }));

        // H3 treats a reference track as a reference and writes new audio over it.
        // Locking pins the real thing into the latent instead, which is what lip-sync
        // and music videos need.
        leftPanel.appendChild(accordion("audiolock", "Audio lock",
          state.audioLock
            ? (state.lockAudioFile ? String(state.lockAudioFile).split(/[\\/]/).pop() : "ON")
            : "OFF",
          () => {
            if (!lockAvailable) return [el("div", {
              html: "⚠ <code>TJ_H3_AudioLock</code> not installed — audio lock unavailable. It ships with <b>TJ_NODE</b>.",
              style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } })];
            const rows = [
              checkboxRow("Lock audio (keep the source track)", !!state.audioLock,
                v => { state.audioLock = v; persist(); renderLeft(); }),
            ];
            if (!state.audioLock) return rows;
            rows.push(col([label("Audio file"), audioFilePicker()]));
            if (!hasTrim) rows.push(el("div", {
              html: "⚠ <code>TrimAudioDuration</code> missing — every clip would lock onto the start of the track. Install it, or keep this to a single clip.",
              style: { fontSize: "10px", color: C.warn, lineHeight: "1.5" } }));
            rows.push(
              row([
                col([label("Mode"), select([
                  { value: "lock",  label: "Lock — source as-is" },
                  { value: "remix", label: "Remix — partly kept" },
                ], state.audioLockMode || "lock", v => { state.audioLockMode = v; persist(); renderLeft(); })]),
                ...(state.audioLockMode === "remix" ? [
                  col([label("Strength"), numberField(state.audioLockStrength ?? 0.5,
                    v => { state.audioLockStrength = Math.min(1, Math.max(0, v)); persist(); }, 0.05)]),
                ] : []),
              ]),
              col([label("Fit"), select([
                { value: "pad_silence",  label: "Pad silence" },
                { value: "loop",         label: "Loop" },
                { value: "stretch_none", label: "None (pad + warn)" },
              ], state.audioLockFit || "pad_silence", v => { state.audioLockFit = v; persist(); })]),
              el("div", { text: "The saved video uses the source audio directly — no codec round trip.",
                style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } }),
            );
            return rows;
          }));

        // No Output panel here: "Free VRAM between clips" is the same setting as the one
        // in Settings → Output → Relay, which also round-trips through the server config
        // so a new node inherits it. Two checkboxes for one value is just a way to end up
        // wondering which one won.

        // images (mode-specific)
        const imgPanel = mountImagePanel(state, ctx);
        const imgCount = state.generationMode === "reference"
          ? (state.refImages || []).filter(Boolean).length
          : [state.firstFrameImage, state.lastFrameImage].filter(Boolean).length;
        leftPanel.appendChild(accordion("images", "Images",
          state.generationMode === "t2v" ? "Text only" : (imgCount ? `${imgCount} set` : "None"),
          () => [imgPanel.el]));

        const loraOn = (state.loras || []).filter(l => l && l.enabled !== false && l.name && l.name !== "none").length;
        leftPanel.appendChild(accordion("lora", "LoRA", loraOn ? `${loraOn} active` : "None",
          () => [mountLoraPanel()]));

        // Last in the scrolling column, directly above the pinned Seed/Generate block:
        // steps change per run far more often than the rest of the sampler config, which
        // stays in Settings, so this sits where the eye lands right before pressing
        // Generate. A turbo schedule supplies its own count, so the field goes read-only
        // rather than sitting there looking editable while something else decides.
        const turboNow = effectiveTurbo(state, ctx.availability).mode;
        leftPanel.appendChild(panel([
          label("Steps"),
          (() => {
            const f = numberField(state.steps ?? 20,
              v => { state.steps = Math.max(1, Math.round(v)); persist(); }, 1);
            if (turboNow !== "none") { f.disabled = true; f.style.opacity = "0.4"; }
            return f;
          })(),
          el("div", { text: turboNow === "none"
              ? "Used as-is."
              : `Turbo is on — ${effectiveSteps(state, ctx.availability)} steps from the Turbo section are used instead.`,
            style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } }),
        ]));

        leftOuter.appendChild(seedGenWrap);
        leftPanel.scrollTop = prevScroll;
      }

      function mountLoraPanel() {
        const wrap = el("div");
        function render() {
          clear(wrap);
          const loras = state.loras || [];
          // Live count, updated in place — picking a file must not tear the panel down
          // and wipe what the user typed into the search box.
          const countEl = label("");
          const refreshCount = () => {
            const on = loras.filter(l => l.enabled !== false && l.name && l.name !== "none").length;
            countEl.textContent = `LoRA (${on}/${loras.length} on)`;
          };
          refreshCount();

          // LoRAs dropped into the folder after the page loaded are invisible until the
          // list is asked for again, so offer that here rather than making it a reload.
          const reload = el("button", { type: "button", text: "⟳", title: "Rescan the LoRA folder", style: {
            flexShrink: "0", cursor: "pointer", fontFamily: "inherit", fontSize: "11px",
            padding: "1px 7px", borderRadius: "5px",
            background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
          }});
          reload.addEventListener("click", async () => {
            reload.disabled = true; reload.textContent = "…";
            try {
              const before = (ctx.availableModels?.loras || []).length;
              ctx.availableModels = await getModels();
              const after = (ctx.availableModels?.loras || []).length;
              showPopup(after === before ? `LoRA list refreshed — ${after} found.`
                                         : `LoRA list refreshed — ${after} found (${after - before > 0 ? "+" : ""}${after - before}).`, false);
            } catch { showPopup("Could not refresh the model list.", true); }
            reload.disabled = false; reload.textContent = "⟳";
            render();
          });

          const head0 = el("div", { style: { display: "flex", alignItems: "center", gap: "6px" } });
          head0.append(countEl, el("div", { style: { flex: "1" } }), reload);
          const kids = [head0];
          const all = ["none", ...((ctx.availableModels?.loras) || []).filter(x => x !== "none")];
          loras.forEach((l, i) => {
            const off = l.enabled === false;
            const card = el("div", { style: {
              border: `1px solid ${off ? C.dim : C.border}`, borderRadius: "6px",
              padding: "6px", display: "flex", flexDirection: "column", gap: "5px",
              opacity: off ? "0.55" : "1",
            }});

            // ON/OFF, then the file, then what it needs typed into the prompt.
            const head = el("div", { style: { display: "flex", alignItems: "center", gap: "5px" } });
            const tog = el("button", { type: "button", text: off ? "OFF" : "ON", style: {
              flexShrink: "0", cursor: "pointer", fontFamily: "inherit", fontSize: "10px",
              padding: "3px 9px", borderRadius: "10px", border: "none", fontWeight: "700",
              background: off ? "#444" : BRAND, color: "#fff",
            }});
            tog.title = off ? "Switched off — neither the weights nor its trigger words are used"
                            : "Switched on";
            tog.addEventListener("click", () => { l.enabled = off; persist(); render(); });

            const del = el("button", { type: "button", text: "✕", title: "Remove", style: {
              flexShrink: "0", cursor: "pointer", fontFamily: "inherit", fontSize: "11px",
              background: "transparent", color: C.err, border: "none", padding: "2px 4px",
            }});
            del.addEventListener("click", () => { state.loras.splice(i, 1); persist(); render(); });

            const strWrap = el("div", { style: { flexShrink: "0", width: "62px" } });
            strWrap.appendChild(numberField(l.strength ?? 1.0,
              v => { l.strength = v; persist(); }, 0.05));

            head.append(tog, el("div", { style: { flex: "1" } }), strWrap, del);

            const tw = el("input", { type: "text", placeholder: "Trigger word…", style: {
              width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text,
              border: `1px solid ${C.border}`, borderRadius: "4px", padding: "4px 6px",
              fontSize: "11px", fontFamily: "inherit", outline: "none",
            }});
            tw.value = l.triggerWord || "";
            tw.title = "Added to every clip's prompt while this LoRA is on";
            tw.addEventListener("input", () => { l.triggerWord = tw.value; persist(); });

            // Searchable — a LoRA folder is far too long to scroll through.
            const sel = loraSelect(all, l.name || "none", async v => {
              const prev = l.name;
              l.name = v; persist();
              if (v && v !== "none") {
                // a different file means different words — never keep the old ones
                if (v !== prev) { l.triggerWord = ""; tw.value = ""; }
                if (!l.triggerWord) {
                  tw.placeholder = "Loading…";
                  try {
                    const d = await getLoraTriggers(v);
                    if (d.ok && d.triggers?.length) {
                      l.triggerWord = d.triggers.join(", "); tw.value = l.triggerWord; persist();
                    }
                  } catch {}
                  tw.placeholder = "Trigger word…";
                }
              } else { l.triggerWord = ""; tw.value = ""; persist(); }
              refreshCount();   // in place — rebuilding here would wipe the search box
            });

            card.append(head, sel.el, tw);
            kids.push(card);
          });
          const add = el("button", { type: "button", text: "+ Add LoRA", style: {
            width: "100%", cursor: "pointer", fontFamily: "inherit", fontSize: "11px",
            padding: "6px", borderRadius: "6px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
          }});
          add.addEventListener("click", () => {
            if (!state.loras) state.loras = [];
            if (state.loras.length >= 4) { showPopup("4 LoRAs max.", true); return; }
            state.loras.push({ name: "none", strength: 1.0, triggerWord: "", enabled: true });
            persist(); render();
          });
          kids.push(add);
          wrap.appendChild(panel(kids));
        }
        render();
        return wrap;
      }

      // ══ SEED + GENERATE ═════════════════════════════════════════════════════
      const seedInput = numberField(state.seed, v => { state.seed = v; persist(); }, 1);
      const seedModeDD = select(
        [{ value: "randomize", label: "Random" }, { value: "fixed", label: "Fixed" },
         { value: "increment", label: "+1" }, { value: "decrement", label: "-1" }],
        state.seedMode, v => { state.seedMode = v; persist(); });
      const seedGenWrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "4px", paddingTop: "6px", flexShrink: "0", borderTop: `1px solid ${C.border}` } });
      seedGenWrap.appendChild(panel([row([col([label("SEED"), seedInput]), col([label("MODE"), seedModeDD])])]));

      const genBtn = button("▶ Generate", null, "primary");
      genBtn.style.cssText += "width:100%;padding:11px;font-size:13px;";
      // /interrupt is global — it kills whatever ComfyUI is CURRENTLY executing, with no
      // idea which session queued it. If something else cut in line (see the queue-watch
      // warning above), this node's own clip might not even be the thing running yet, and
      // Stop would silently interrupt someone else's generation instead. Check before
      // firing it, and only bother the user with a confirm when it actually looks like
      // that's about to happen.
      async function isOurClipCurrentlyRunning() {
        try {
          const r = await api.fetchApi("/queue");
          const d = await r.json();
          const running = d.queue_running || [];
          if (!running.length) return true;   // nothing running — Stop is a no-op either way
          const key = previewNodeKey(self.id);
          return running.some(item => item[2] && Object.prototype.hasOwnProperty.call(item[2], key));
        } catch { return true; }   // couldn't check — don't block the user over that
      }
      const stopBtn = button("■ Stop", async () => {
        if (!(await isOurClipCurrentlyRunning())) {
          const proceed = window.confirm(
            "What's currently running on the ComfyUI server doesn't look like this node's own clip "
            + "— it looks like something else got queued ahead of it.\n\n"
            + "Stop will interrupt whatever IS running right now, which may belong to a different "
            + "generation. Continue anyway?");
          if (!proceed) return;
        }
        stopRequested = true;
        await interrupt();
        setStatus("Stopping after the current clip…");
      });
      stopBtn.style.flexShrink = "0";
      // Offered for any run, any clip count: runGeneration() freezes the whole panel into
      // its own snapshot (`rs`) the moment it starts, so editing the live panel afterward
      // — to prep this queue entry, or just because a run takes a while — can never leak
      // into a clip the running snapshot hasn't rendered yet, no matter how many clips are
      // still ahead of it.
      //
      // Like ComfyUI's own queue: every click snapshots the whole panel as-is and appends
      // it as one more entry. When the current run finishes cleanly, entry #1 takes over
      // the panel and restarts; when THAT one finishes, #2 takes over, and so on — a plain
      // FIFO, not a single toggle.
      const nextGenBtn = button("⏭ Next Gen", null);
      nextGenBtn.style.cssText += "flexShrink:0;";
      nextGenBtn.style.display = "none";
      nextGenBtn.title = "Snapshot this exact panel and append it to the queue — takes over once everything ahead of it finishes.";
      // Small badge button next to it opens the full list — same idea as ComfyUI's own
      // queue button, just scoped to this node's Next Gen entries.
      const queueListBtn = el("button", { type: "button", text: "📋", title: "View queued runs", style: {
        cursor: "pointer", fontFamily: "inherit", fontSize: "12px", padding: "0 8px",
        borderRadius: "6px", background: C.bg3, color: C.text, border: `1px solid ${C.border}`,
        display: "none", flexShrink: "0", position: "relative",
      }});
      const queueCountDot = el("div", { style: {
        position: "absolute", top: "-5px", right: "-5px", minWidth: "14px", height: "14px",
        borderRadius: "7px", background: BRAND, color: "#fff", fontSize: "9px", fontWeight: "700",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "0 2px",
      }});
      queueListBtn.appendChild(queueCountDot);
      let nextQueue = [];
      function summarizeQueued(snap) {
        const active = (snap.prompts || []).filter(p => p && p.enabled !== false && (p.text || "").trim());
        const first = active[0]?.text || "(no prompt text)";
        return `${active.length} clip${active.length === 1 ? "" : "s"} · ${String(first).slice(0, 40)}${first.length > 40 ? "…" : ""}`;
      }
      function renderNextQueue() {
        nextGenBtn.textContent = nextQueue.length ? `⏭ Next Gen (${nextQueue.length})` : "⏭ Next Gen";
        nextGenBtn.style.background = nextQueue.length ? BRAND : "";
        queueListBtn.style.display = nextQueue.length ? "flex" : "none";
        queueCountDot.textContent = String(nextQueue.length);
        if (queueListOv.el.style.display !== "none") renderQueueListPopup();
      }
      nextGenBtn.onclick = () => {
        nextQueue.push(JSON.parse(JSON.stringify(state)));
        renderNextQueue();
      };
      queueListBtn.addEventListener("click", () => {
        renderQueueListPopup();
        queueListOv.el.style.display = "flex";
      });
      seedGenWrap.appendChild(row([genBtn, stopBtn, nextGenBtn, queueListBtn]));

      // ── Queued-runs popup ──────────────────────────────────────────────────
      const queueListOv = { el: el("div", { style: {
        position: "absolute", inset: "0", zIndex: "9998", background: "rgba(11,11,11,0.97)",
        borderRadius: "inherit", display: "none", flexDirection: "column", padding: "14px", boxSizing: "border-box",
      }})};
      const queueListTop = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0", marginBottom: "10px" } });
      queueListTop.appendChild(el("div", { text: "Next Gen queue", style: { color: "#fff", fontSize: "14px", fontWeight: "700", flex: "1" } }));
      const queueListClose = el("button", { type: "button", text: "✕", style: {
        cursor: "pointer", fontFamily: "inherit", fontSize: "12px", padding: "5px 10px",
        borderRadius: "6px", border: "none", background: "#c0392b", color: "#fff",
      }});
      queueListClose.addEventListener("click", () => { queueListOv.el.style.display = "none"; });
      queueListTop.appendChild(queueListClose);
      const queueListBody = el("div", { style: { flex: "1", overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px" } });
      queueListOv.el.append(queueListTop, queueListBody);
      function renderQueueListPopup() {
        clear(queueListBody);
        if (!nextQueue.length) {
          queueListBody.appendChild(el("div", { text: "Nothing queued.", style: { color: C.muted, fontSize: "11px" } }));
          return;
        }
        nextQueue.forEach((snap, idx) => {
          const row_ = el("div", { style: {
            display: "flex", alignItems: "center", gap: "8px", background: C.bg1,
            border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 10px",
          }});
          row_.appendChild(el("div", { text: `#${idx + 1}`, style: { color: BRAND, fontSize: "12px", fontWeight: "700", flexShrink: "0" } }));
          row_.appendChild(el("div", { text: summarizeQueued(snap), style: { flex: "1", fontSize: "11px", color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }));
          const cancelBtn = el("button", { type: "button", text: "✕ Cancel", style: {
            cursor: "pointer", fontFamily: "inherit", fontSize: "10px", padding: "4px 8px",
            borderRadius: "5px", background: "#c0392b", color: "#fff", border: "none", flexShrink: "0",
          }});
          cancelBtn.addEventListener("click", () => {
            nextQueue.splice(idx, 1);
            renderNextQueue(); renderQueueListPopup();
          });
          row_.appendChild(cancelBtn);
          queueListBody.appendChild(row_);
        });
      }

      // ══ RELAY LOOP ══════════════════════════════════════════════════════════
      let running = false, stopRequested = false;

      // Keeps a near-silent tone playing for the whole run (across Next Gen chaining too),
      // same trick the web version uses. A backgrounded/minimized tab gets throttled by the
      // browser and the OS is free to sleep, either of which stops the relay from queuing
      // its next clip the same way closing the tab does — active audio playback is what
      // most browsers/OSes treat as "still doing something," so it heads that off. The
      // Screen Wake Lock API was considered instead, but it's released the moment the tab
      // loses visibility (minimized or switched away from), which is exactly the case this
      // needs to survive. Volume is near-zero but NOT muted — a muted/zero-gain element is
      // exactly what a browser's power-saving heuristics look for to deprioritize a tab, so
      // this defeats its own purpose if actually silent.
      let wakeCtx = null, wakeSource = null;
      function startWakeAudio() {
        if (wakeCtx) return;
        try {
          wakeCtx = new (window.AudioContext || window.webkitAudioContext)();
          const buffer = wakeCtx.createBuffer(1, wakeCtx.sampleRate, wakeCtx.sampleRate);
          wakeSource = wakeCtx.createBufferSource();
          wakeSource.buffer = buffer;
          wakeSource.loop = true;
          const gain = wakeCtx.createGain();
          gain.gain.value = 0.0005;
          wakeSource.connect(gain).connect(wakeCtx.destination);
          wakeSource.start(0);
          wakeCtx.resume?.().catch(() => {});
        } catch { wakeCtx = null; wakeSource = null; }   // autoplay policy on a non-gesture resume, or unsupported — best-effort only
      }
      function stopWakeAudio() {
        try { wakeSource?.stop(); } catch {}
        try { wakeCtx?.close(); } catch {}
        wakeCtx = null; wakeSource = null;
      }

      // Warn before an accidental tab close only while THIS node's own relay/Next Gen
      // queue is actually active — other tabs, other tools, and this node sitting idle
      // never trigger it. Each MiniMax H3 node on the canvas registers its own listener
      // scoped to its own `running`/`nextQueue`, so one busy node warns without implicating
      // any other node or queue.
      const onBeforeUnload = (e) => {
        if (!running && !nextQueue.length) return;
        e.preventDefault();
        e.returnValue = "";
      };
      window.addEventListener("beforeunload", onBeforeUnload);

      // Header + this clip's shots + footer, assembled only now — the parts stay
      // separate in the editor so a split never eats the shared style/sound text.
      // A clip index maps back through the per-prompt repeat counts.
      function promptForClip(clipIdx, st = state) {
        return composeClipPrompt(st, clipIdx);
      }

      function seedForClip(i, st = state) {
        if (!st.seedPerClip) return st.seed ?? 0;
        return ((st.seed ?? 0) + i) % Number.MAX_SAFE_INTEGER;
      }

      // What the gallery needs to show a clip and to put its prompt back into the
      // editor. Kept flat and small — this is written next to every video file.
      function metaForVideo(promptText, extra = {}, st = state) {
        const { width, height } = resolveResolution(st.aspect, st.megapixels);
        return {
          v: 1,
          prompt: String(promptText || ""),
          promptHeader: st.promptHeader || "",
          promptFooter: st.promptFooter || "",
          w: width, h: height,
          mode: st.generationMode || "t2v",
          aspect: st.aspect,
          megapixels: st.megapixels,
          frames: st.clipFrames,
          steps: st.steps,
          sampler: st.sampler,
          // The pipeline is one field per patch layer now. `accel` stays only so a clip
          // written today still says something to a reader that predates the split.
          accel: st.attnBackend,
          turboMode:   st.turboMode,
          attnBackend: st.attnBackend,
          attnForward: st.attnForward,
          blockCache:  st.blockCache,
          useSpectrum: !!st.useSpectrum,
          useFusedModulation: !!st.useFusedModulation,
          seed: st.seed,
          node: "minimax_h3",
          created: Date.now(),
          ...extra,
        };
      }

      // SaveVideo / SaveImage report through `ui.PreviewVideo` / images — both land in
      // output.images, so one extractor covers them.
      function firstOutput(byNode, nodeKey) {
        const out = byNode?.[nodeKey];
        const arr = out?.images || out?.gifs || [];
        return arr.length ? arr[0] : null;
      }
      function allOutputs(byNode, nodeKey) {
        const out = byNode?.[nodeKey];
        return out?.images || out?.gifs || [];
      }

      // resume: { pos, activeIdx, chainFrame, prevCheckpointName, clipRecords, runState,
      // inFlightPromptId } — set only by checkResumeRunning() below, after a page reload
      // finds this node's own state._relay progress left over from a run that was still
      // going when it refreshed. Everything else (a plain Generate click, or a queued Next
      // Gen restart) calls this with no argument, same as before.
      /**
       * Poll VRAM / system RAM for as long as a clip is running and keep the extremes.
       *
       * Cheap on purpose — a few reads a minute, no logging, and it never throws: if the
       * route is missing (an older backend that has not been restarted) it simply records
       * nothing rather than taking the run down with it.
       */
      function watchMemory(everyMs = 10000) {
        let vramFreeMin = Infinity, vramUsedMax = 0, ramFreeMin = Infinity, samples = 0;
        const tick = async () => {
          const d = await getVramStats();
          if (!d || !d.ok) return;
          samples++;
          if (typeof d.vramFreeMiB === "number") vramFreeMin = Math.min(vramFreeMin, d.vramFreeMiB);
          if (typeof d.vramUsedMiB === "number") vramUsedMax = Math.max(vramUsedMax, d.vramUsedMiB);
          if (typeof d.ramFreeMiB === "number")  ramFreeMin  = Math.min(ramFreeMin, d.ramFreeMiB);
        };
        tick();
        const id = setInterval(tick, everyMs);
        return {
          stop() { clearInterval(id); },
          peak() {
            if (!samples) return null;
            return {
              vramFreeMinMiB: Number.isFinite(vramFreeMin) ? vramFreeMin : null,
              vramUsedMaxMiB: vramUsedMax || null,
              ramFreeMinMiB:  Number.isFinite(ramFreeMin) ? ramFreeMin : null,
            };
          },
        };
      }

      async function runGeneration(resume = null) {
        if (running) return;
        running = true; stopRequested = false;
        startWakeAudio();
        startQueueWatch();
        genBtn.disabled = true; genBtn.textContent = "⏳ Preparing…";
        nextGenBtn.style.display = "none";
        resetPreview(); barInner.style.width = "0%"; startClock();

        try {
          if (!ctx.availability || !Object.keys(ctx.availability).length) {
            const av = await getNodeAvailability();
            ctx.availability = av.available || {};
            ctx.availabilityInfo = av;
          }
          if (ctx.availabilityInfo && ctx.availabilityInfo.core_ok === false) {
            throw new Error(`Missing core nodes: ${(ctx.availabilityInfo.missing_core || []).join(", ")}`);
          }

          // PromptDB pipe — present fields override node settings for this run only.
          let pipeOv = null;
          try {
            pipeOv = await resolvePipeOverrides(self, state);
            if (pipeOv) showPopup(pipeOv.summary, false);
          } catch {}

          // Resuming continues the same seed sequence it already started with — reroll
          // only on a genuinely fresh run.
          if (!resume) {
            if (state.seedMode === "randomize")      { state.seed = randomSeed(); seedInput.value = state.seed; }
            else if (state.seedMode === "increment") { state.seed = (state.seed || 0) + 1; seedInput.value = state.seed; }
            else if (state.seedMode === "decrement") { state.seed = Math.max(0, (state.seed || 0) - 1); seedInput.value = state.seed; }
            persist();
          }

          // Queueing is the moment the panel becomes "the settings I last used" — more so
          // than any individual edit, since this is the configuration that actually
          // produced something. Stamp it now so a node dropped later, or the same node
          // after a workflow reload, comes back to exactly this.
          persist();

          // Same idea as ComfyUI's own queue: clicking Generate (or Next Gen) freezes the
          // whole panel into one snapshot right here, and everything below reads only that
          // snapshot (`rs`) — never live `state` — for the rest of the run. Editing the
          // panel afterward (to prep a Next Gen entry, or just because a run takes a while)
          // can never leak into clips this run hasn't rendered yet. Resuming after a reload
          // reuses the exact snapshot the interrupted run was already using.
          // Falls back to live state if resuming from a _relay saved before this node's
          // last update (no runState field yet) — better than crashing on a stale resume.
          const rs = resume ? (resume.runState || state) : JSON.parse(JSON.stringify(state));

          const plan = currentPlan();
          // Resuming reconstructs the exact same clip list the interrupted run had, from
          // the frozen snapshot — not a fresh activePrompts(state) read, which could
          // disagree with it if prompts were toggled while nothing was watching, and that
          // would desync every saved index (clipRecords, pos, checkpoint names) from what
          // they actually mean.
          const active = resume ? (resume.activeIdx || []).map(i => ({ i })) : activePrompts(rs);
          if (!active.length) throw new Error("No prompts are switched on.");
          totClip = active.length;
          nextGenBtn.style.display = "";
          const clipRecords = resume ? resume.clipRecords.slice() : [];
          let chainFrame = resume ? resume.chainFrame
            : (rs.generationMode === "reference" ? null : (rs.firstFrameImage || null));
          let prevCheckpointName = resume ? resume.prevCheckpointName : null;   // One-Take: previous clip's saved latent, loaded fresh each queue submission
          const clipTimes = [];
          const startPos = resume ? resume.pos : 0;

          // Snapshot enough to continue this exact run from `pos` after a reload. Cleared
          // on a clean finish, a manual Stop, or an error — resuming is only for "the page
          // reloaded while this was still actively running," never for restarting a run
          // the user (or an error) already ended on purpose.
          function saveRelay(pos) {
            state._relay = {
              pos, totClip, activeIdx: active.map(a => a.i),
              chainFrame, prevCheckpointName, clipRecords: clipRecords.slice(), runState: rs,
            };
            persist();
          }
          if (!resume) saveRelay(0);

          for (let pos = startPos; pos < active.length; pos++) {
            if (stopRequested) { setStatus(`Stopped after ${pos - startPos} clip(s).`); break; }
            const i = active[pos].i;   // original prompt index — drives seed, filenames, audio-lock offset
            curClip = pos + 1;
            const clipStart = Date.now();
            setStatus(`Clip ${curClip}/${totClip} (prompt ${i + 1}) · building graph…`);
            badge.style.display = "block";
            badge.textContent = `● CLIP ${curClip}/${totClip}`;

            // Continuity decides what a clip after the first inherits. The first *active*
            // clip is always rendered by whatever mode the run is in — "first" here means
            // first in the on/off filtered sequence, not prompt index 0, so resuming a run
            // from clip 11 renders clip 11 in the run's base mode rather than FL2VA.
            //
            //   Last Frame Chain — the previous clip's ending becomes this clip's first
            //     frame. Only FL2VA takes a first frame (Ref2VA has none, and measuring a
            //     run showed that passing the frame as a reference image does nothing),
            //     so a chained clip is rendered by FL2VA whatever the run started as.
            //   Reference — offered in Reference mode only, since a text-only run has
            //     nothing to reference. The mode carries on unchanged, every clip
            //     re-using the same reference images.
            //   None — nothing is handed between clips: no frame, and each clip is made
            //     from its prompt on the run's own model.
            //
            // Across all three the shared part of the prompt still reaches every clip,
            // which is what keeps a run looking like one piece.
            const isRef = rs.generationMode === "reference";
            let firstFrame = isRef ? null : (rs.firstFrameImage || null);
            let refImages  = rs.refImages || [];
            const continued = pos > 0 && rs.continuityMode === "lastframe" && !!chainFrame;
            if (pos > 0) firstFrame = continued ? chainFrame : null;
            if (continued) refImages = [];   // FL2VA takes no reference images

            // Per-prompt first-image override (A3) beats the continuity default outright.
            // Like Last Frame Chain, only FL2VA accepts a first frame, so a clip with an
            // override is forced to FL2VA even in Reference mode — the reference images
            // drop out for that clip, same rule as the chained case above.
            const override = promptFirstFrame(rs.prompts[i]);
            let overridden = false;
            if (override) { firstFrame = override; refImages = []; overridden = true; }

            const modeForClip = (continued || overridden) ? "firstlast" : rs.generationMode;

            const clipState = { ...rs, generationMode: modeForClip };
            const restore = pipeOv ? applyOverridesTemp(clipState, pipeOv.overrides) : null;
            // One-Take: a checkpoint name unique to this node instance + prompt index, so
            // two MiniMax H3 nodes on the same canvas (or a re-run over old prompt indices)
            // never collide on the same checkpoint file.
            const isOneTake = rs.continuityMode === "onetake";
            const checkpointName = isOneTake ? `${self.id}_${i}` : null;

            let res;
            let mem = null;   // memory watcher for this clip; see watchMemory()
            if (resume && pos === startPos && resume.inFlightPromptId) {
              // This exact clip was already queued before the reload — reconnect to it
              // instead of building and submitting a second copy.
              restore?.();
              setStatus(`Clip ${curClip}/${totClip} · reconnecting to in-flight render…`);
              res = await waitForHistory(resume.inFlightPromptId, {
                onProgress: (v, m) => setStepProgress(v, m),
              });
            } else {
              let built;
              try {
                built = buildClipGraph(clipState, ctx.availability, {
                  nodeId: self.id,
                  promptText: promptForClip(i, rs),
                  seed: seedForClip(i, rs),
                  firstFrame,
                  lastFrame: (pos === active.length - 1) ? (rs.lastFrameImage || null) : null,
                  refImages,
                  clipIndex: i,
                  saveLastFrame: true,
                  // Tail previews exist only so the relay can step back past a fade to
                  // black when picking a chain frame — dead weight (and eight temp PNGs
                  // per clip) in every other continuity mode.
                  saveTailPreviews: rs.continuityMode === "lastframe",
                  prevCheckpointName: isOneTake ? prevCheckpointName : null,
                  checkpointName,
                });
              } finally { restore?.(); }

              setStatus(`Clip ${curClip}/${totClip} · queued`);
              // Watch memory for the length of the clip. A render that runs out of VRAM
              // does not fail on Windows — the driver spills to system RAM, then to the
              // pagefile, and the only symptom is steps taking tens of times longer. That
              // is indistinguishable from a hang once it is over, so the extremes are
              // recorded while it happens and saved with the clip.
              mem = watchMemory();
              try {
                res = await queuePrompt(built.graph, {
                  onProgress: (v, m) => setStepProgress(v, m),
                });
              } finally { mem.stop(); }
            }
            if (isOneTake) prevCheckpointName = checkpointName;

            // Captured once, right after the clip actually finishes — reused for both the
            // saved meta (so the Gallery can show/average real per-clip time) and the
            // running ETA estimate below, instead of taking two slightly different
            // Date.now() readings for the same clip.
            const elapsedSec = (Date.now() - clipStart) / 1000;
            const memPeak = mem ? mem.peak() : null;

            const vid = firstOutput(res.byNode, NODE_IDS.save);
            const lastImg = firstOutput(res.byNode, NODE_IDS.saveLF);
            if (vid) {
              clipRecords.push(vid);
              // every clip carries the prompt it was actually rendered from, so the
              // gallery can put that exact text back into the editor
              saveMeta(vid.filename, vid.subfolder || "", metaForVideo(promptForClip(i, rs), {
                clip: curClip, clips: plan.count, seed: seedForClip(i, rs), mode: modeForClip,
                // the editable source text, so "reuse" restores the editor exactly
                prompts: [promptText(rs.prompts?.[i])],
                // lets the Gallery's manual stitch auto-detect that adjacent clips share
                // an overlap and offer to trim it, instead of the user having to remember
                onetake: isOneTake,
                // everything a full Reuse needs to reproduce this exact clip, plus the
                // measured time it actually took (see refreshAvgFromHistory)
                elapsedSec,
                // Memory extremes over this clip. vramFreeMinMiB near zero is the
                // signature of a spill: the step times balloon and nothing errors.
                ...(memPeak || {}),
                turboLora: rs.turboLora || "", turboLoraReference: rs.turboLoraReference || "",
                turboLoraStrength: rs.turboLoraStrength ?? 1.0, turboLoraLowVram: !!rs.turboLoraLowVram,
                loras: (rs.loras || []).map(l => ({
                  name: l.name || "none", strength: l.strength ?? 1.0,
                  triggerWord: l.triggerWord || "", enabled: l.enabled !== false,
                })),
              }, rs));
              showResultVideo(`/view?filename=${encodeURIComponent(vid.filename)}&subfolder=${encodeURIComponent(vid.subfolder || "")}&type=${vid.type || "output"}&t=${Date.now()}`);
              badge.textContent = `CLIP ${curClip}/${totClip} done`;
            }
            if (lastImg) {
              await setLastResult(self.id, { image: lastImg });
              // The chain frame is only ever read by Last Frame Chain. Building it in the
              // other modes copied a PNG into the input folder for every clip that nothing
              // then looked at — they just accumulated there (89 of them before this was
              // noticed). Continuity is fixed for the whole run, so this decides once.
              if (rs.continuityMode === "lastframe") {
                // Prefer the newest trailing frame that is not a fade-to-black; the plain
                // last frame is the fallback when the tail is unreadable or all dark.
                let carry = lastImg;
                const tail = allOutputs(res.byNode, NODE_IDS.tailPrev);
                if (tail.length) {
                  const pick = await pickChainFrame(tail.map(t => ({
                    filename: t.filename, subfolder: t.subfolder || "", type: t.type || "temp",
                  })));
                  if (pick?.picked) {
                    carry = pick.picked;
                    if (pick.steppedBack) console.info("[MMH3] chain frame stepped back past a black tail:", pick.checked);
                  }
                }
                try { chainFrame = await copyOutputToInput(carry.filename, carry.subfolder || "", carry.type || "output"); }
                catch { chainFrame = null; }
              }
            }

            clipTimes.push((Date.now() - clipStart) / 60000);
            // keep the estimate honest using measured clip times
            state.avgMinutesPerClip = +(clipTimes.reduce((a, b) => a + b, 0) / clipTimes.length).toFixed(2);
            saveRelay(pos + 1); refreshPlan();

            if (rs.unloadBetweenClips && pos < active.length - 1) {
              setStatus(`Clip ${curClip}/${totClip} done · freeing VRAM…`);
              await freeMemory();
            }
          }

          // Stitching moved to the Gallery's 🔗 스티치 mode (SPEC A6) — clips are always
          // kept separate here so a stopped/resumed run never has a half-built combined file.
          // One-Take is the one exception: the whole point of the mode is a single
          // continuous take, and consecutive clips share `overlap` seconds by construction
          // (TJ_H3_LatentContinuation handed each clip's head the previous clip's tail), so
          // a plain concat would visibly repeat that stretch. Auto-stitch with that overlap
          // trimmed on a completed run — a stopped run still leaves the per-clip files and
          // checkpoints alone so resuming from A3's override still works.
          if (rs.continuityMode === "onetake" && rs.oneTakeAutoStitch !== false
              && !stopRequested && clipRecords.length > 1) {
            const overlapSec = framesToSeconds(alignFrameCount(ONE_TAKE_OVERLAP_FRAMES));
            setStatus(`Stitching ${clipRecords.length} clips (One-Take, ${overlapSec.toFixed(3)}s overlap trimmed)…`);
            try {
              const folder = (rs.saveSubfolder || SUBFOLDER).replace(/\\/g, "/");
              const audioOverride = rs.oneTakeAudioOverride && rs.audioLock && rs.lockAudioFile
                ? { filename: rs.lockAudioFile, start: Math.max(0, rs.audioLockTrimStart || 0) }
                : null;
              const out = await stitchClips(
                clipRecords, `${folder}/${rs.filenamePrefix || "MMH3"}_full`, null, overlapSec, audioOverride,
              );
              const url = `/view?filename=${encodeURIComponent(out.filename)}&subfolder=${encodeURIComponent(out.subfolder || "")}&type=output&t=${Date.now()}`;
              // metaForVideo's `frames` is per-clip (rs.clipFrames) — left as-is here it
              // would make the Gallery show this combined file's length as one clip's
              // length. durationSeconds carries the real total; frames:null stops the
              // per-clip value from being misread as this file's own.
              const totalSeconds = clipRecords.length * framesToSeconds(rs.clipFrames || 192)
                - (clipRecords.length - 1) * overlapSec;
              saveMeta(out.filename, out.subfolder || "", metaForVideo(
                active.map(({ i }) => promptForClip(i, rs)).join("\n\n"),
                { clips: clipRecords.length, stitched: true, onetake: true, overlapSeconds: overlapSec,
                  frames: null, durationSeconds: totalSeconds,
                  prompts: (rs.prompts || []).map(promptText) },
                rs,
              ));
              showResultVideo(url, { final: true });
              badge.textContent = `FULL · ${clipRecords.length} clips (One-Take)`;
              await setLastResult(self.id, { videoPath: out.path });
              setStatus(`Done — ${clipRecords.length} clips stitched (One-Take) → ${out.filename}`);
              showPopup(`One-Take stitched: ${out.filename}`, false);
            } catch (e) {
              setStatus(`Clips saved, One-Take stitch failed: ${e.message}`);
              showPopup(`One-Take stitch failed: ${e.message} — per-clip files are still on disk.`, true);
            }
          } else if (clipRecords.length) {
            setStatus(stopRequested ? `Stopped — ${clipRecords.length} clip(s) saved.`
                                    : `Done — ${clipRecords.length} clip(s) saved.`);
          }

          // Nothing left to resume — a fresh Generate click should never think it's
          // continuing a run that actually finished (or that the user deliberately stopped).
          delete state._relay; persist();
          barInner.style.width = "100%";
        } catch (e) {
          delete state._relay; persist();
          if (e.message === "cancelled") { setStatus("Cancelled."); }
          else {
            const why = explainGenerationError(e.message);
            setStatus(why ? `Error: ${why}` : `Error: ${e.message}`);
            showPopup(why || e.message, true);
            if (why) console.warn("[MMH3] underlying error:", e.message);
          }
        } finally {
          // ComfyUI keeps the models resident after a prompt, so a finished run would
          // otherwise sit on the whole card until the next one. The run is over here —
          // nothing in this node still needs the weights.
          try { await freeMemory(); } catch {}
          // Entry #1 of the Next Gen queue takes over the live panel and restarts, but
          // only on a clean finish — a stopped or errored run shouldn't silently barrel
          // into whatever's queued, so Stop drops the whole queue, not just this run.
          const queued = (!stopRequested && nextQueue.length) ? nextQueue.shift() : null;
          if (stopRequested) nextQueue = [];
          if (!queued && lastResultURL) showResultVideo(lastResultURL, { final: true });
          if (!queued) { stopWakeAudio(); stopQueueWatch(); }   // truly idle now — anything queued keeps these going across the handoff
          running = false; stopRequested = false;
          genBtn.disabled = false; genBtn.textContent = "▶ Generate";
          renderNextQueue();
          badge.textContent = badge.textContent.replace("● LIVE", "").trim() || badge.textContent;
          stopClock();
          if (queued) {
            Object.assign(state, queued);
            persist(); renderPills(); renderLeft();
            setTimeout(() => runGeneration(), 50);
          }
        }
      }
      // Not `genBtn.onclick = runGeneration` — onclick hands the handler the click Event
      // as its first argument, which would land in `resume` (any truthy value there is
      // treated as a real resume descriptor, not the default `null`) and send every normal
      // click down the resume path with none of the fields it needs.
      genBtn.onclick = () => runGeneration();

      // ══ HELP ════════════════════════════════════════════════════════════════
      const helpEl = el("div", { style: {
        position: "absolute", inset: "0", zIndex: "9998", background: "rgba(11,11,11,0.98)",
        borderRadius: "inherit", display: "none", flexDirection: "column", padding: "14px", boxSizing: "border-box",
      }});
      const helpTop = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0", marginBottom: "10px" } });
      helpTop.appendChild(el("div", { text: "MiniMax H3 ONE STUDIO — Help", style: { color: "#fff", fontSize: "14px", fontWeight: "700", flex: "1" } }));
      helpTop.appendChild(button("✕", () => helpEl.style.display = "none", "danger"));
      helpEl.appendChild(helpTop);
      const helpBody = el("div", { style: { flex: "1", overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px" } });
      helpBody.className = "mmh3-lp";
      [
        ["How the relay works",
         "A clip's length is capped by the model's frame grid, so a long video is rendered as several clips, "
         + "one queue submission each. Every clip is saved on its own, and when the run finishes they're "
         + "concatenated into one file. ComfyUI unloads models between submissions, which is what keeps a 16GB "
         + "card from spilling into system memory on a long run."],
        ["Clip length",
         "MiniMax H3 only accepts frame counts on a 17k+5 grid, so the dropdown lists the exact legal lengths "
         + "instead of letting you type seconds that would silently snap. 8.00s (192 frames) is the only option "
         + "that lands on a whole second at 24fps."],
        ["Modes",
         "Text only — prompt alone. First/Last Frame — supply a start (and optionally end) keyframe. "
         + "Reference — up to 9 reference images, addressed in the prompt as <Picture 1>, <Picture 2>…  "
         + "Reference mode uses its own UNET, set separately in Settings."],
        ["Continuity",
         "Last Frame Chain feeds each clip's final frame in as the next clip's first frame — motion continues, "
         + "but colour and detail drift a little every hop, which usually shows past 6-8 clips. Reference keeps a "
         + "face consistent but does not carry motion across the cut. Neither is perfect; that's the model, not the node."],
        ["Live preview",
         "While a clip samples, decoded frames are streamed into the preview box. Raise Preview frames in Settings "
         + "for a moving preview (mp4) rather than a still; it costs a little time per step. Needs comfyui-kjnodes."],
        ["Audio",
         "H3 generates a soundtrack per clip, so a stitched video has an audible seam at each clip boundary. "
         + "For music, lay a separate track over the result instead of relying on the per-clip audio."],
      ].forEach(([title, body]) => {
        const block = el("div", { style: { background: C.bg1, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "10px 12px" } });
        block.appendChild(el("div", { text: title, style: { color: BRAND, fontSize: "12px", fontWeight: "700", marginBottom: "6px" } }));
        block.appendChild(el("div", { text: body, style: { fontSize: "11.5px", lineHeight: "1.65", color: C.text } }));
        helpBody.appendChild(block);
      });
      helpEl.appendChild(helpBody);
      helpOv = { el: helpEl, show() { helpEl.style.display = "flex"; } };

      // ══ MOUNT ═══════════════════════════════════════════════════════════════
      settingsOv = createSettingsOverlay(state, ctx);
      root.appendChild(settingsOv.el);

      promptEditOv = createPromptEditOverlay(state, ctx, () => { refreshPlan(); });
      root.appendChild(promptEditOv.el);

      commonOv = createCommonPromptOverlay(state, ctx, () => { refreshPlan(); promptEditOv?.syncCommon?.(); });
      root.appendChild(commonOv.el);

      // Restores the editor from a saved clip's sidecar. Older files only carry the
      // composed `prompt`; treat that as a single clip body so nothing is lost.
      ctx.reusePrompt = (meta) => {
        if (!meta) return false;
        const parts = Array.isArray(meta.prompts) && meta.prompts.length
          ? meta.prompts.slice()
          : [String(meta.prompt || "")];
        if (!parts.some(p => String(p || "").trim())) return false;
        state.prompts = parts.map(t => ({ text: String(t || ""), firstFrame: "", enabled: true }));
        if (Array.isArray(meta.prompts)) {
          state.promptHeader = meta.promptHeader || "";
          state.promptFooter = meta.promptFooter || "";
        }
        persist();
        refreshPlan();
        promptEditOv?.syncCommon?.();
        renderPrompts();
        return true;
      };

      // Full "make this exact clip again" restore — everything reusePrompt does, plus
      // every render setting saveMeta captured (resolution, sampling, acceleration, both
      // LoRA slots). Same seed on purpose — reproducing the clip exactly is the point;
      // switch Seed mode afterward if a variation is wanted instead. Missing fields (older
      // clips saved before this existed) are skipped rather than clobbering the current
      // panel value with something that was never actually recorded.
      ctx.reuseAll = (meta) => {
        if (!ctx.reusePrompt(meta)) return false;
        if (meta.aspect) state.aspect = meta.aspect;
        if (meta.megapixels != null) state.megapixels = meta.megapixels;
        if (meta.frames) { state.clipFrames = meta.frames; state.clipLengthCustom = false; }
        if (meta.steps != null) state.steps = meta.steps;
        if (meta.sampler) state.sampler = meta.sampler;
        // A clip saved after the pipeline split carries each axis; one saved before it
        // has only `accel`, holding turbo/solattn/spectrum/none — values that are not
        // valid on any of the new axes, so they get translated the same way
        // migrateLegacyAccel() translates a stored workflow.
        if (meta.attnBackend || meta.turboMode || meta.blockCache) {
          if (meta.turboMode)   state.turboMode   = meta.turboMode;
          if (meta.attnBackend) state.attnBackend = meta.attnBackend;
          if (meta.attnForward) state.attnForward = meta.attnForward;
          if (meta.blockCache)  state.blockCache  = meta.blockCache;
          if (meta.useSpectrum != null)        state.useSpectrum        = !!meta.useSpectrum;
          if (meta.useFusedModulation != null) state.useFusedModulation = !!meta.useFusedModulation;
        } else if (meta.accel) {
          if (meta.accel === "turbo")         state.turboMode   = "larryvrh";
          else if (meta.accel === "spectrum") state.useSpectrum = true;
          else if (meta.accel === "solattn")  state.attnBackend = "solattn_kijai";
        }
        if (meta.seed != null) {
          state.seed = meta.seed; state.seedMode = "fixed";
          seedInput.value = meta.seed; seedModeDD.value = "fixed";
        }
        if (meta.turboLora) state.turboLora = meta.turboLora;
        if (meta.turboLoraReference) state.turboLoraReference = meta.turboLoraReference;
        if (meta.turboLoraStrength != null) state.turboLoraStrength = meta.turboLoraStrength;
        if (meta.turboLoraLowVram != null) state.turboLoraLowVram = meta.turboLoraLowVram;
        if (Array.isArray(meta.loras)) state.loras = meta.loras.map(l => ({
          name: l.name || "none", strength: l.strength ?? 1.0,
          triggerWord: l.triggerWord || "", enabled: l.enabled !== false,
        }));
        persist();
        refreshPlan();
        renderLeft();
        return true;
      };

      galleryOv = createGalleryOverlay(state, ctx);
      root.appendChild(galleryOv.el);
      document.body.appendChild(galleryOv.playerEl);   // fullscreen player lives above everything

      root.appendChild(helpEl);
      root.appendChild(queueListOv.el);

      document.addEventListener("keydown", e => {
        if (e.key !== "Escape") return;
        if (galleryOv?.isPlaying()) return;            // the player handles its own Esc
        if (commonOv?.isOpen())    { commonOv.hide(); return; }
        if (promptEditOv?.isOpen()) { promptEditOv.hide(); return; }
        if (galleryOv?.isOpen())   { galleryOv.hide(); return; }
        if (helpEl.style.display !== "none") { helpEl.style.display = "none"; return; }
        if (queueListOv.el.style.display !== "none") { queueListOv.el.style.display = "none"; return; }
        if (settingsOv?.el.style.display !== "none") { settingsOv.hide(); return; }
      });

      self.addDOMWidget("mmh3_ui", "div", root, { serialize: false, computeSize: () => [NODE_MW, NODE_MH] });

      // Every panel, repainted from `state` — used after a workflow restores settings.
      self._mmh3Repaint = () => {
        seedInput.value = state.seed ?? 0;
        renderPills();
        renderLeft();
        renderPrompts();
        refreshPlan();
        ctx._rerenderImages?.();
        promptEditOv?.syncCommon?.();
      };

      renderPills();
      renderLeft();
      renderPrompts();

      // model list drives the LoRA dropdown; fetch once in the background
      getModels().then(d => { ctx.availableModels = d; renderLeft(); }).catch(() => {});
      function loadAudioFiles() {
        getMediaFiles().then(d => { ctx.audioFiles = d.audios || []; renderLeft(); })
                      .catch(() => { ctx.audioFiles = []; });
      }
      loadAudioFiles();
      getNodeAvailability().then(av => {
        ctx.availability = av.available || {};
        ctx.availabilityInfo = av;
        // The panel gates options on this and rendered before it arrived, so redraw.
        renderLeft();
        if (av.core_ok === false) {
          showPopup(`Missing core nodes: ${(av.missing_core || []).join(", ")}`, true);
        } else if ((av.missing_optional || []).length) {
          setStatus(`Idle · optional packs missing: ${(av.missing_optional || []).join(", ")}`);
        }
      }).catch(() => {});

      // ══ RESUME AFTER REFRESH ═══════════════════════════════════════════════
      // A reload wipes this node's JS-side relay loop, but state._relay (persisted via the
      // node's own state, same as everything else on this panel) survives it — saveRelay()
      // inside runGeneration() writes it after every clip. So on load: if it's still there,
      // the run was still going when the page reloaded (a clean finish/stop/error always
      // clears it), and we can rebuild the loop from where it left off. If the clip that
      // was in flight is still in ComfyUI's queue, reconnect to that exact prompt_id
      // instead of submitting a second copy of it (see waitForHistory in runGeneration);
      // if it already finished (or the server restarted) while nobody was watching, the
      // loop just builds that clip fresh, same as any other clip.
      (async function checkResumeRunning() {
        const saved = state._relay;
        // Guards against a stale/older-shaped leftover (e.g. saved before activeIdx or
        // runState existed) driving a broken resume instead of just being dropped.
        if (!saved || !Array.isArray(saved.activeIdx) || !saved.activeIdx.length
            || !(saved.pos < saved.totClip)) {
          if (saved) { delete state._relay; persist(); }
          return;
        }
        let inFlightPromptId = null;
        try {
          const r = await api.fetchApi("/queue");
          const d = await r.json();
          const key = previewNodeKey(self.id);
          const hit = [...(d.queue_running || []), ...(d.queue_pending || [])]
            .find(item => item[2] && Object.prototype.hasOwnProperty.call(item[2], key));
          if (hit) inFlightPromptId = hit[1];
        } catch {}
        setStatus(`Resuming clip ${saved.pos + 1}/${saved.totClip} after reload…`);
        runGeneration({
          pos: saved.pos, activeIdx: saved.activeIdx, chainFrame: saved.chainFrame,
          prevCheckpointName: saved.prevCheckpointName, clipRecords: saved.clipRecords,
          runState: saved.runState, inFlightPromptId,
        });
      })();
    };
  },
});

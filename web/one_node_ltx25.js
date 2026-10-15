// one_node_minimax_h3.js — LTX 2.5 ONE STUDIO (TJ)
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
  C, BRAND, NODE_W, PREVIEW_SIZE, LEFT_W, PAD, SUBFOLDER, TEMP_PREVIEW_SUBFOLDER, el, clear, loadState, saveState, lastUsedAt, defaultState,
  randomSeed, CLIP_LENGTHS, ASPECTS, UPSCALE_MODES, FLASHVSR_MODELS, FLASHVSR_MODES, attnBlockedReason, attnForwardBlockedReason,
  blockCacheBlockedReason, h3OptimizerBlockedReason, hiresActive, migrateLegacyAccel, continuityModesFor, generationModesFor, configIssues,
  clipPlan, formatDuration, formatClock, alignFrameCount, FPS, resolveResolution, composeClipPrompt, composeStitchedPrompt, clipAssets,
  flLibrarySource, clipFramesFor, clipSecondsFor, normalizeAssetRef, explainGenerationError, promptText, promptFirstFrame, promptEnabled,
  activePrompts
} from "./ltx25/core_ltx25.js";
import { panel, label, button, select, loraSelect, numberField, row, col, modeBar, iconBtn, openVideoFullscreen } from "./klein/ui_common.js";
import {
  queuePrompt, waitForHistory, interrupt, freeMemory, setLastResult, stitchClips, getVideoInfo, copyOutputToInput, getNodeAvailability,
  getModels, saveMeta, pickChainFrame, getLoraTriggers, getMediaFiles, uploadMedia, getVramStats, getMediaInfo, uploadImage
} from "./ltx25/api_ltx25.js";
import { buildClipGraph, buildPostprocessGraph, NODE_IDS, previewNodeKey } from "./ltx25/graph_builder_ltx25.js";
import { createSettingsOverlay } from "./ltx25/ui_app_settings_ltx25.js";
import { mountImagePanel } from "./ltx25/ui_images_ltx25.js";
import { mountAssetBrowser } from "./shared/reflib_browser.js";
import { assetRefActive } from "./shared/reflib_refpanel.js";
import { libraryRefFor, libraryContextCached } from "./shared/reflib_llm.js";
import { attachAtComplete } from "./shared/reflib_at.js";
import { reflib } from "./shared/reflib_api.js";
import { createPromptEditOverlay } from "./ltx25/ui_prompt_edit_ltx25.js";
import { createCommonPromptOverlay } from "./ltx25/ui_common_prompt_ltx25.js";
import { createGalleryOverlay } from "./ltx25/ui_gallery_ltx25.js";
import { resolvePipeOverrides, applyOverridesTemp } from "./shared/promptdb_pipe.js";
import { attachNodeState, restoreNodeState } from "./shared/node_state.js";
import { createNodeFullscreen } from "./shared/node_fullscreen.js";

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
  name: "TJ.LTX25ONE.v1",

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "LTX25OneTJNode") return;

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
        rerender: () => self._ltx25Repaint?.(),
      });
      if (!document.getElementById("ltx25-styles")) {
        const s = document.createElement("style"); s.id = "ltx25-styles";
        s.textContent = `@keyframes ltx25-spin{to{transform:rotate(360deg)}}`
          + `.ltx25-lp::-webkit-scrollbar{width:5px}.ltx25-lp::-webkit-scrollbar-track{background:transparent}`
          + `.ltx25-lp::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px}`
          // Plain accent-color on a range input renders a large native thumb in this
          // Chromium build — fine at web-app width, but it swallows the whole track in the
          // node's ~276px panel. Pin it to a small circle instead.
          + `.ltx25-seek{-webkit-appearance:none;appearance:none;height:4px;background:${C.border};border-radius:2px;}`
          + `.ltx25-seek::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;border-radius:50%;background:${BRAND};cursor:pointer;}`
          + `.ltx25-seek::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:${BRAND};border:none;cursor:pointer;}`;
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
        let pop = root.querySelector(".ltx25-pop");
        if (!pop) {
          pop = el("div", { style: {
            position: "absolute", bottom: "30px", left: "50%", transform: "translateX(-50%)",
            background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "6px",
            padding: "6px 14px", fontSize: "11px", color: C.text, zIndex: "10001",
            maxWidth: "80%", textAlign: "center", pointerEvents: "none", transition: "opacity .3s",
          }});
          pop.className = "ltx25-pop"; root.appendChild(pop);
        }
        pop.textContent = msg;
        pop.style.color = isError ? C.err : BRAND;
        pop.style.opacity = "1";
        clearTimeout(popTimer);
        popTimer = setTimeout(() => { pop.style.opacity = "0"; }, 4000);
      }
      ctx.showPopup = showPopup;

      // A First / Last frame picked from the Asset Library is a library asset; the Director reads files from the
      // input folder, so each one is copied there once (and remembered by id).
      const assetFiles = new Map();
      ctx.assetFrameFiles = async (ref) => {
        const toFile = async (id) => {
          if (!id) return null;
          if (assetFiles.has(id)) return assetFiles.get(id);
          const d = await reflib.detail(id);
          if (!d.ok) throw new Error(`Library asset #${id} was not found.`);
          const blob = await (await fetch(reflib.fileUrl(d.asset))).blob();
          const name = await uploadImage(new File([blob], `asset_${id}_${d.asset.name || "image"}.png`.replace(/[^\w.\-]+/g, "_"), { type: blob.type || "image/png" }));
          assetFiles.set(id, name);
          return name;
        };
        return { first: await toFile(ref.first), last: await toFile(ref.last) };
      };

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

      let assetView = false;        // Asset tab showing instead of the generation screen
      function renderPills() {
        clear(pillsWrap);
        const modes = generationModesFor(state);
        // Never sit on a mode whose model is missing — move to one that works.
        // (not before the saved model settings have arrived - the modes would all read as unavailable)
        if (ctx.configLoaded && !modes.find(m => m.key === state.generationMode)?.enabled) {
          const first = modes.find(m => m.enabled);
          if (first) { state.generationMode = first.key; persist(); }
        }
        // The Asset tab is a view, not a generation mode: state.generationMode keeps the mode
        // the node will run, so leaving the tab returns to it unchanged.
        const assetTab = { key: "assets", label: "Asset", enabled: true, hint: "Reference asset library" };
        pillsWrap.appendChild(modeBar([assetTab, ...modes], assetView ? "assets" : state.generationMode, key => {
          if (key === "assets") { setAssetView(true); renderPills(); return; }
          setAssetView(false);
          state.generationMode = key;
          // Turbo isn't offered in Reference mode, so don't leave it selected there.
          persist(); renderPills(); renderLeft(); renderPrompts();
          restoreModeResult();
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
      // Fills the monitor with this node alone, scaled but proportional. The button is the
      // only way back out, and it inverts to white-on-black while the view is open so the
      // mode is obvious at a glance.
      // `fsBtn` further down is the preview player's own fullscreen control — this one is
      // the node's, so it needs its own name.
      const nodeFsBtn = iconBtn("⛶", "Fullscreen this node", () => fullscreen.toggle());
      const nodeFsIdle = { fg: nodeFsBtn.style.color, bd: nodeFsBtn.style.border };
      const paintFsBtn = (open) => {
        nodeFsBtn.style.background = open ? "#ffffff" : "";
        nodeFsBtn.style.color      = open ? "#000000" : nodeFsIdle.fg;
        nodeFsBtn.style.border     = open ? "1px solid #ffffff" : nodeFsIdle.bd;
      };
      const fullscreen = createNodeFullscreen(root, NODE_W, ROOT_H, (open) => {
        paintFsBtn(open);
        nodeFsBtn.title = open ? "Exit fullscreen" : "Fullscreen this node";
      });
      // iconBtn assigns `style.background` directly on hover in and out, and a later
      // inline assignment beats an earlier one whatever its priority — so the white had to
      // be re-applied after those handlers rather than declared harder than them. These
      // run second because they are registered second.
      nodeFsBtn.addEventListener("mouseenter", () => { if (fullscreen.isOpen()) paintFsBtn(true); });
      nodeFsBtn.addEventListener("mouseleave", () => { if (fullscreen.isOpen()) paintFsBtn(true); });
      topBar.appendChild(nodeFsBtn);
      topBar.appendChild(iconBtn("?", "Help", () => helpOv?.show()));
      root.appendChild(topBar);

      // ── dependency banner ───────────────────────────────────────────────────
      // ComfyUI-Manager installs this pack's Python requirements but not the other
      // node packs it depends on. When some are missing the node still loads, so a
      // startup console line is easy to miss — this strip stays on the node face
      // until the user runs the installer (or dismisses it for the session).
      let depDismissed = false;
      const depBanner = el("div", { style: {
        display: "none", flexDirection: "column", gap: "4px", flexShrink: "0",
        marginBottom: `${PAD}px`, padding: "8px 10px", borderRadius: "8px",
        fontSize: "11px", lineHeight: "1.5",
      }});
      function renderDepBanner(av) {
        const mc = (av?.missing_core || []), mo = (av?.missing_optional || []);
        if (depDismissed || (!mc.length && !mo.length)) { depBanner.style.display = "none"; return; }
        const dir = av.install_dir || "the package folder";
        const isCore = mc.length > 0;
        depBanner.style.background = isCore ? "rgba(255,90,90,0.12)" : "rgba(255,179,71,0.12)";
        depBanner.style.border = `1px solid ${isCore ? "#ff5a5a" : C.warn}`;
        depBanner.style.color = isCore ? "#ff8a8a" : C.warn;
        clear(depBanner);

        const head = el("div", { style: { display: "flex", alignItems: "center", gap: "6px" } });
        head.appendChild(el("span", { text: isCore
          ? `⚠ Required node packs missing — this node cannot render (${mc.length}).`
          : `⚠ ${mo.length} optional node pack${mo.length > 1 ? "s" : ""} not installed — the matching features stay off.` ,
          style: { flex: "1", fontWeight: "700" } }));
        const x = el("span", { text: "✕", title: "Dismiss until reload", style: { cursor: "pointer", padding: "0 4px" } });
        x.addEventListener("click", () => { depDismissed = true; depBanner.style.display = "none"; });
        head.appendChild(x);
        depBanner.appendChild(head);

        if (isCore) depBanner.appendChild(el("div", {
          text: mc.join(", "),
          style: { opacity: "0.9", wordBreak: "break-word" } }));

        depBanner.appendChild(el("div", {
          html: "Fix — run one of these once, then restart ComfyUI:",
          style: { marginTop: "2px", color: C.text } }));

        const winCmd = `${dir}\\${av.install_script_win || "install_requirements.bat"}`;
        const nixCmd = `${dir}/${av.install_script_nix || "install_requirements.sh"}`;
        for (const [os, line] of [["Windows", winCmd], ["Mac / Linux", nixCmd]]) {
          const rowEl = el("div", { style: { display: "flex", alignItems: "stretch", gap: "5px", marginTop: "3px" } });
          rowEl.appendChild(el("code", { text: line, style: {
            flex: "1", fontFamily: "ui-monospace, Consolas, monospace", fontSize: "10.5px",
            background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "6px",
            padding: "5px 8px", color: C.text, userSelect: "text", whiteSpace: "pre-wrap", wordBreak: "break-all",
          }}));
          const copyBtn = el("button", { type: "button", text: "⧉ Copy", title: `Copy the ${os} path`, style: {
            flexShrink: "0", cursor: "pointer", fontFamily: "inherit", fontSize: "10px", fontWeight: "700",
            border: `1px solid ${C.border}`, borderRadius: "6px", background: C.bg2, color: C.text, padding: "0 9px",
          }});
          copyBtn.addEventListener("click", async () => {
            try { await navigator.clipboard.writeText(line); }
            catch { const t = el("textarea"); t.value = line; document.body.appendChild(t); t.select();
              try { document.execCommand("copy"); } catch {} t.remove(); }
            copyBtn.textContent = "✓ Copied";
            setTimeout(() => { copyBtn.textContent = "⧉ Copy"; }, 1500);
            showPopup("Path copied. Run this script from a terminal, then restart ComfyUI.", false);
          });
          rowEl.appendChild(copyBtn);
          depBanner.appendChild(rowEl);
        }

        depBanner.appendChild(el("div", {
          text: "Run the script for your OS from a terminal, then restart ComfyUI. "
            + "Details: Settings ⚙ → Third-party pack status.",
          style: { color: C.muted, fontSize: "10px", marginTop: "3px" } }));

        depBanner.style.display = "flex";
      }
      root.appendChild(depBanner);

      // ── main row ────────────────────────────────────────────────────────────
      const mainRow   = el("div", { style: { display: "flex", gap: `${PAD}px`, height: `${RIGHT_H}px`, flexShrink: "0" } });
      const leftOuter = el("div", { style: { width: `${LEFT_W}px`, flexShrink: "0", height: `${RIGHT_H}px`, display: "flex", flexDirection: "column" } });
      const leftPanel = el("div", { style: { flex: "1", overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column", gap: "6px" } });
      leftPanel.className = "ltx25-lp";
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
      // FlashVSR runs no live sampling preview of its own either — it's a tiled
      // post-process pass over the already-sampled frames, minutes long, with the same
      // "is it doing anything?" problem frDetectBanner solves for Face Refine's
      // detection stretch. Same pattern, own color/text/glyph so the two aren't confused.
      const fvsrBanner = el("div", { text: "◮ FlashVSR upscaling… please wait — no live preview for this pass", style: {
        display: "none", position: "absolute", inset: "0", zIndex: "5",
        alignItems: "center", justifyContent: "center", textAlign: "center",
        background: "rgba(0,0,0,0.6)", padding: "0 16px",
        color: "#e0a530", fontSize: "16px", fontWeight: "700",
        textShadow: "0 0 12px rgba(224,165,48,0.5)",
      }});
      // 7+1: the last step runs on a second sampler with no live preview of its own, so the
      // preview freezes on the 7th step's frame — this says why, same layer as the banners above.
      const hiresBanner = el("div", { text: "Upscaling & refining detail…", style: {
        display: "none", position: "absolute", inset: "0", zIndex: "5",
        alignItems: "center", justifyContent: "center", textAlign: "center",
        background: "rgba(0,0,0,0.6)", padding: "0 16px",
        color: "#ff9ec7", fontSize: "18px", fontWeight: "700",
        textShadow: "0 0 12px rgba(255,158,199,0.5)",
      }});
      // Postprocess and Image Generator have no live per-step sampling preview of their
      // own either (Postprocess is a fixed video-effects chain; Image Generator's H3
      // sampling is too short at 8 frames to bother streaming) — same "is it doing
      // anything?" gap frDetectBanner/fvsrBanner solve above, generic enough for both
      // (busyBanner.textContent is set per call instead of a fixed string per mode).
      const busyBanner = el("div", { style: {
        display: "none", position: "absolute", inset: "0", zIndex: "5",
        alignItems: "center", justifyContent: "center", textAlign: "center",
        background: "rgba(0,0,0,0.6)", padding: "0 16px",
        color: "#b57bff", fontSize: "16px", fontWeight: "700",
        textShadow: "0 0 12px rgba(181,123,255,0.5)",
      }});
      function showBusyBanner(text) { busyBanner.textContent = text; busyBanner.style.display = "flex"; }
      function hideBusyBanner() { busyBanner.style.display = "none"; }
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
      // Only meaningful for a post-process mode (Face Refine today) — there is an "Original"
      // to compare against. Sits left of fsBtn, same show/hide lifecycle.
      const compareBtn = el("button", { type: "button", text: "◐", title: "Compare with original", style: {
        position: "absolute", top: "6px", right: "6px", zIndex: "6", background: "rgba(0,0,0,0.65)",
        color: "#fff", border: "none", borderRadius: "4px", width: "22px", height: "22px",
        cursor: "pointer", fontSize: "12px", padding: "0", display: "none",
      }});
      previewBox.append(placeholder, fvsrBanner, hiresBanner, busyBanner, previewImg, previewVid, resultVid, badge, fsBtn, compareBtn);

      let lastResultURL = null;
      // Captured in showResultVideo() at the moment a result becomes the shown preview —
      // NOT read live from state at click time. Switching the mode pill (t2v <-> facerefine
      // <-> ltxupscale) never resets the preview box on its own, so a Face Refine result can
      // still be sitting there with fsBtn/compareBtn visible after the user has switched to
      // a different mode; reading state.frSource/ltxSource live at click time would then
      // pair the OLD result with whatever source the NEW mode currently has — wrong
      // original, wrong comparison. (Found via the web mirror's own audit of this same
      // pattern; confirmed the same bug shape exists here by reading this file directly.)
      let lastCompareSource = null;
      // Set alongside lastCompareSource when the shown result came from a TRIMMED run
      // (Postprocess Preview's Start(s)/End(s)) — { start, end } in seconds into the
      // ORIGINAL clip. Without this the Compare viewer played the full untrimmed original
      // against a 1-second preview result, drifting apart immediately (reported: "풀영상
      // 8초면 원본은 8초 / 미리보기는 1초 이러면 안된다고... 원본도 미리보기 시간이랑
      // 맞춰야되지"). null means "compare the whole original" (a real/final Generate run).
      let lastCompareRange = null;
      // openFullscreen() (shared/klein/ui_common.js) renders the target inside an <img> —
      // fine for the image tools it was written for, but a no-op here since lastResultURL
      // is a video file: an <img src="*.mp4"> shows nothing. Double-click on resultVid
      // already triggers the browser's own native Fullscreen API (it's a <video controls>
      // element) — using that same API here would make this button do nothing double-click
      // doesn't already do. openVideoFullscreen() is the in-page overlay instead: tab
      // chrome/address bar stay visible, closes with ✕/ESC/outside-click.
      fsBtn.addEventListener("click", () => { if (lastResultURL) openVideoFullscreen(lastResultURL, { startAt: resultVid.currentTime || 0 }); });
      compareBtn.addEventListener("click", () => {
        if (!lastResultURL || !lastCompareSource) return;
        openCompareViewer(`/view?filename=${encodeURIComponent(lastCompareSource)}&type=input`, lastResultURL, lastCompareRange);
      });

      // Original / Restored / Compare (wipe) / Side-by-side viewer for a finished
      // post-process result (Face Refine today) against the clip it started from. Wheel to
      // zoom, drag to pan, double-click to reset — same gestures on Original/Restored/Compare;
      // Side-by-side keeps both clips at 1:1 so a direct pixel comparison isn't distorted by
      // an unsynced zoom on only one side.
      function openCompareViewer(originalUrl, restoredUrl, range = null) {
        let mode = "compare";      // original | restored | compare | side
        let wipe = 50;             // percent, compare mode only
        let zoom = 1, panX = 0, panY = 0;
        const FPS = 24;            // this app's clips are constant-framerate 24fps throughout
        let kh = null;
        // range = { start, end } seconds into originalUrl — set when restoredUrl came from
        // a TRIMMED run (Postprocess Preview). origVid is clamped/looped to that window
        // instead of its own full native duration, so it always matches restVid's length
        // (reported: "풀영상 8초면 원본은 8초 / 미리보기는 1초 이러면 안된다고... 원본도
        // 미리보기 시간이랑 맞춰야되지"). null means "compare the whole original".
        const rangeStart = range ? Math.max(0, range.start || 0) : 0;
        let rangeEnd = range ? Math.max(rangeStart, range.end || 0) : 0;

        const ov = el("div", { style: {
          position: "fixed", inset: "0", background: "rgba(10,10,14,0.97)", zIndex: "100060",
          display: "flex", flexDirection: "column",
        }});

        const tabsWrap = el("div", { style: {
          display: "flex", alignItems: "center", gap: "6px", padding: "10px 14px",
          borderBottom: `1px solid ${C.border}`, background: "#14141a", flexShrink: "0",
        }});
        const closeBtn = el("button", { type: "button", text: "✕ Close", style: {
          marginLeft: "auto", cursor: "pointer", fontFamily: "inherit", fontSize: "12px",
          padding: "6px 12px", borderRadius: "6px", background: "transparent", color: C.err,
          border: `1px solid ${C.border}`,
        }});
        function tabBtn(label, key) {
          const on = mode === key;
          const b = el("button", { type: "button", text: label, style: {
            cursor: "pointer", fontFamily: "inherit", fontSize: "12px", fontWeight: "600",
            padding: "6px 12px", borderRadius: "6px",
            border: `1px solid ${on ? BRAND : C.border}`, background: on ? BRAND : "transparent",
            color: on ? "#fff" : C.text,
          }});
          b.addEventListener("click", () => { mode = key; zoom = 1; panX = 0; panY = 0; renderTabs(); renderStage(); });
          return b;
        }
        function renderTabs() {
          clear(tabsWrap);
          tabsWrap.append(
            tabBtn("Original", "original"), tabBtn("Restored", "restored"),
            tabBtn("◐ Compare", "compare"), tabBtn("▦ Side by side", "side"), closeBtn,
          );
        }

        const stage = el("div", { style: {
          flex: "1", position: "relative", overflow: "hidden", background: "#000",
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "grab",
        }});
        const stageInner = el("div", { style: {
          position: "relative", width: "100%", height: "100%",
          display: "flex", alignItems: "center", justifyContent: "center",
        }});
        stage.appendChild(stageInner);

        // Geometry (left/top/width/height) is set explicitly by layoutVideos() below, from
        // origVid's own aspect ratio only - NOT objectFit:"contain" on each video
        // independently. An upscale changes resolution, not framing, but letting each
        // <video> auto-fit against its OWN native size independently still visibly
        // mismatched the two pictures (reported with a screenshot: the upscaled side showed
        // noticeably larger/closer subjects than the original side). objectFit:"fill" here
        // is deliberate: it forces restVid's pixels to exactly match origVid's on-screen
        // rectangle rather than trusting the file's own reported aspect ratio.
        // No native `loop` on ANY video here — origVid is the master clock and looping is
        // handled manually (below) between rangeStart/rangeEnd, so a Postprocess Preview's
        // TRIMMED restoredUrl (shorter than the full source) compares against only the
        // matching WINDOW of the original, not its full length (reported: "풀영상 8초면
        // 원본은 8초 / 미리보기는 1초 이러면 안된다고... 원본도 미리보기 시간이랑
        // 맞춰야되지"). restVid/side clips are then kept glued to origVid's clock every
        // timeupdate tick (see syncTo below) rather than looping on their own native
        // duration, which used to drift them apart mid-playback.
        const origVid = el("video", { src: originalUrl, muted: "", playsinline: "",
          style: { position: "absolute", objectFit: "fill" } });
        const restVid = el("video", { src: restoredUrl, muted: "", playsinline: "",
          style: { position: "absolute", objectFit: "fill" } });
        origVid.muted = true; restVid.muted = true;

        const label = (text, side) => el("div", { text, style: {
          position: "absolute", top: "10px", [side]: "10px", zIndex: "2",
          color: "#fff", fontSize: "12px", fontWeight: "700", textShadow: "0 1px 4px rgba(0,0,0,0.8)",
        }});
        const origLabel = label("Original", "left");
        const restLabel = label("Restored", "right");
        // Divider lives directly on `stage`, NOT inside a transformed container - it must
        // stay pinned at a fixed screen position while zoom/pan moves the footage
        // underneath it, or comparing while zoomed in is pointless (reported: "컴패어 바가
        // 같이 커지고 움직이면 어떻게 비교하니"). Same reasoning for restMask below.
        const divider = el("div", { style: {
          position: "absolute", top: "0", bottom: "0", width: "2px", background: "#fff",
          left: "50%", zIndex: "3", cursor: "ew-resize", touchAction: "none", display: "none",
        }});
        const divHandle = el("div", { text: "↔", style: {
          position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
          width: "34px", height: "34px", borderRadius: "50%", background: "#fff", color: "#111",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.5)", cursor: "ew-resize", touchAction: "none",
        }});
        divider.appendChild(divHandle);

        // restVid's own wrapper: `restMask` is screen-fixed (same as `stage`, never
        // transformed) and does the wipe clipping in real screen pixels; `restInner` inside
        // it gets the exact same pan/zoom transform as `stageInner` so the restored footage
        // still zooms/pans in lock-step with the original - only the CUT LINE stays put.
        const restMask = el("div", { style: { position: "absolute", inset: "0", overflow: "hidden" } });
        const restInner = el("div", { style: {
          position: "relative", width: "100%", height: "100%",
          display: "flex", alignItems: "center", justifyContent: "center",
        }});
        restMask.appendChild(restInner);

        // Side-by-side pane (built once, plain 1:1 — no zoom/pan, so left vs right stays a
        // true pixel comparison rather than two independently-panned crops).
        const sideWrap = el("div", { style: {
          position: "absolute", inset: "0", display: "none", gap: "2px",
        }});
        // flex:1 belongs on the WRAPPER (the actual flex child of sideWrap) - putting it on
        // the <video> itself did nothing (its parent isn't a flex container), and left
        // width:0 as the only surviving rule, collapsing both videos to zero width (reported:
        // "사이드 바이 사이드는 영상이 안나와").
        const sideOrig = el("video", { src: originalUrl, muted: "", playsinline: "",
          style: { width: "100%", height: "100%", objectFit: "contain", background: "#000" } });
        const sideRest = el("video", { src: restoredUrl, muted: "", playsinline: "",
          style: { width: "100%", height: "100%", objectFit: "contain", background: "#000" } });
        sideOrig.muted = true; sideRest.muted = true;
        const sideOrigWrap = el("div", { style: { position: "relative", flex: "1", height: "100%" } }, [sideOrig, label("Original", "left")]);
        const sideRestWrap = el("div", { style: { position: "relative", flex: "1", height: "100%" } }, [sideRest, label("Restored", "left")]);
        sideWrap.append(sideOrigWrap, sideRestWrap);

        stageInner.append(origVid);
        restInner.append(restVid);
        // Labels are fixed UI chrome, same reasoning as the divider - not appended inside
        // stageInner/restInner, or they'd zoom/pan along with the footage too.
        stage.append(restMask, divider, origLabel, restLabel, sideWrap);

        function applyTransform() {
          const t = `translate(${panX}px, ${panY}px) scale(${zoom})`;
          stageInner.style.transform = t;
          restInner.style.transform = t;
        }
        // A "contain" fit inside `stage` can letterbox/pillarbox when the video's aspect
        // ratio doesn't match the stage's - a wipe % of the whole STAGE width then lands
        // somewhere other than that same % across the actual picture (reported: "컴패어 바가
        // 두 영상의 경계랑 어긋나는 것도 확인했어?" / a screenshot showing the divider off the
        // true centre of the frame). Computed from origVid's aspect ratio ONLY, and BOTH
        // videos are explicitly sized/positioned to this exact rect (objectFit:"fill" on
        // both, see their creation above) - an upscale changes resolution, not framing, but
        // letting restVid auto-fit against its own (higher) native resolution independently
        // still visibly mismatched the two pictures' apparent scale (reported with a
        // screenshot: the upscaled side showed noticeably larger/closer subjects). Forcing
        // one shared rect guarantees they always register at identical scale/position.
        function contentRect() {
          const cw = stage.clientWidth || 1, ch = stage.clientHeight || 1;
          const vw = origVid.videoWidth || cw, vh = origVid.videoHeight || ch;
          const fit = Math.min(cw / vw, ch / vh);
          const dispW = vw * fit, dispH = vh * fit;
          return { left: (cw - dispW) / 2, top: (ch - dispH) / 2, width: dispW, height: dispH };
        }
        function layoutVideos() {
          const r = contentRect();
          for (const v of [origVid, restVid]) {
            v.style.left = `${r.left}px`; v.style.top = `${r.top}px`;
            v.style.width = `${r.width}px`; v.style.height = `${r.height}px`;
          }
          return r;
        }
        function wipePx() {
          const r = layoutVideos();
          return r.left + (wipe / 100) * r.width;
        }
        function renderStage() {
          const isSide = mode === "side";
          stageInner.style.display = isSide ? "none" : "flex";
          restMask.style.display = isSide ? "none" : "block";
          sideWrap.style.display = isSide ? "flex" : "none";
          origVid.style.display = mode === "original" || mode === "compare" ? "block" : "none";
          restVid.style.display = mode === "restored" || mode === "compare" ? "block" : "none";
          origLabel.style.display = mode === "compare" ? "block" : "none";
          restLabel.style.display = mode === "compare" ? "block" : "none";
          divider.style.display = mode === "compare" ? "block" : "none";
          if (!isSide) layoutVideos();
          if (mode === "compare") {
            const px = wipePx();
            divider.style.left = `${px}px`;
            restMask.style.clipPath = `inset(0 0 0 ${px}px)`;
          } else {
            restMask.style.clipPath = "none";
          }
          wipeRow.style.display = mode === "compare" ? "flex" : "none";
          applyTransform();
        }
        // videoWidth/videoHeight are 0 until metadata loads, and the modal's own size can
        // change (window resize) - recompute the content rect whenever either happens.
        let rangeInited = false;
        origVid.addEventListener("loadedmetadata", () => {
          if (!rangeInited) {
            rangeInited = true;
            if (!rangeEnd) rangeEnd = origVid.duration || 0;
            try { origVid.currentTime = rangeStart; } catch {}
          }
          renderStage();
        });
        const onWinResize = () => renderStage();
        window.addEventListener("resize", onWinResize);

        // ── wheel-zoom (cursor-anchored) + drag-to-pan + double-click reset ──
        stage.addEventListener("wheel", (e) => {
          if (mode === "side") return;
          e.preventDefault();
          const rect = stage.getBoundingClientRect();
          const mx = e.clientX - rect.left - rect.width / 2;
          const my = e.clientY - rect.top - rect.height / 2;
          const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
          const nextZoom = Math.min(6, Math.max(1, zoom * factor));
          panX = mx - (mx - panX) * (nextZoom / zoom);
          panY = my - (my - panY) * (nextZoom / zoom);
          zoom = nextZoom;
          if (zoom === 1) { panX = 0; panY = 0; }
          applyTransform();
        }, { passive: false });
        stage.addEventListener("pointerdown", (e) => {
          if (mode === "side" || e.target === divider || e.target === divHandle) return;
          stage.setPointerCapture(e.pointerId);
          stage.style.cursor = "grabbing";
          const startX = e.clientX, startY = e.clientY, baseX = panX, baseY = panY;
          const onMove = (ev) => { panX = baseX + (ev.clientX - startX); panY = baseY + (ev.clientY - startY); applyTransform(); };
          const onUp = (ev) => {
            stage.releasePointerCapture(ev.pointerId);
            stage.style.cursor = "grab";
            stage.removeEventListener("pointermove", onMove);
            stage.removeEventListener("pointerup", onUp);
            stage.removeEventListener("pointercancel", onUp);
          };
          stage.addEventListener("pointermove", onMove);
          stage.addEventListener("pointerup", onUp);
          stage.addEventListener("pointercancel", onUp);
        });
        stage.addEventListener("dblclick", () => { zoom = 1; panX = 0; panY = 0; applyTransform(); });

        // ── compare divider drag ──
        const onDividerDown = (e) => {
          e.stopPropagation();
          divider.setPointerCapture(e.pointerId);
          const onMove = (ev) => {
            const rect = stage.getBoundingClientRect();
            const r = contentRect();
            const px = ev.clientX - rect.left;
            wipe = Math.min(100, Math.max(0, ((px - r.left) / r.width) * 100));
            const clampedPx = wipePx();
            divider.style.left = `${clampedPx}px`;
            restMask.style.clipPath = `inset(0 0 0 ${clampedPx}px)`;
            wipeSlider.value = String(Math.round(wipe));
            wipeLabel.textContent = `${Math.round(wipe)}%`;
          };
          const onUp = (ev) => {
            divider.releasePointerCapture(ev.pointerId);
            divider.removeEventListener("pointermove", onMove);
            divider.removeEventListener("pointerup", onUp);
          };
          divider.addEventListener("pointermove", onMove);
          divider.addEventListener("pointerup", onUp);
        };
        divider.addEventListener("pointerdown", onDividerDown);
        divHandle.addEventListener("pointerdown", onDividerDown);

        // ── footer: sync play/pause + scrub across whichever videos are active ──
        const footer = el("div", { style: {
          display: "flex", flexDirection: "column", gap: "8px", padding: "10px 14px",
          borderTop: `1px solid ${C.border}`, background: "#14141a", flexShrink: "0",
        }});
        const scrub = el("input", { type: "range", min: "0", max: "1000", value: "0", style: { width: "100%" } });
        const timeRow = el("div", { style: { display: "flex", justifyContent: "space-between", fontSize: "11px", color: C.muted } });
        const timeText = el("div", { text: "00:00.000 / 00:00.000" });
        timeRow.append(timeText);
        const ctrlRow = el("div", { style: { display: "flex", alignItems: "center", gap: "10px" } });
        const playBtn = el("button", { type: "button", text: "▶", style: {
          cursor: "pointer", fontFamily: "inherit", fontSize: "13px", width: "34px", height: "28px",
          borderRadius: "6px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
        }});
        const prevBtn = el("button", { type: "button", text: "◀|", style: {
          cursor: "pointer", fontFamily: "inherit", fontSize: "11px", width: "34px", height: "28px",
          borderRadius: "6px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
        }});
        const nextBtn = el("button", { type: "button", text: "|▶", style: {
          cursor: "pointer", fontFamily: "inherit", fontSize: "11px", width: "34px", height: "28px",
          borderRadius: "6px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
        }});
        const frameText = el("div", { text: "Frame 0 / 0", style: { fontSize: "11px", color: C.muted } });
        const wipeRow = el("div", { style: { display: "none", alignItems: "center", gap: "8px", marginLeft: "auto" } });
        const wipeSlider = el("input", { type: "range", min: "0", max: "100", value: "50", style: { width: "140px" } });
        const wipeLabel = el("div", { text: "50%", style: { fontSize: "11px", color: C.muted, minWidth: "32px" } });
        wipeRow.append(el("div", { text: "Wipe", style: { fontSize: "11px", color: C.muted } }), wipeSlider, wipeLabel);
        ctrlRow.append(playBtn, prevBtn, nextBtn, frameText, wipeRow);
        footer.append(scrub, timeRow, ctrlRow);

        wipeSlider.addEventListener("input", () => {
          wipe = parseFloat(wipeSlider.value);
          const px = wipePx();
          divider.style.left = `${px}px`;
          restMask.style.clipPath = `inset(0 0 0 ${px}px)`;
          wipeLabel.textContent = `${Math.round(wipe)}%`;
        });

        function fmtT(s) {
          s = Math.max(0, s || 0);
          const m = Math.floor(s / 60), sec = s - m * 60;
          return `${String(m).padStart(2, "0")}:${sec.toFixed(3).padStart(6, "0")}`;
        }
        // The "master" clock is always origVid — restVid (and the two side clips) are kept
        // in lock-step with it. origVid's own clock runs in ABSOLUTE source-clip time
        // (rangeStart..rangeEnd); restVid/side clips run in RELATIVE time from their own
        // start (0..rangeEnd-rangeStart), since a trimmed Postprocess Preview result's file
        // only ever contains that window, not the full original.
        function allVids() { return [origVid, restVid, sideOrig, sideRest]; }
        function syncTo(origT) {
          const relT = Math.max(0, origT - rangeStart);
          for (const v of allVids()) {
            const target = v === origVid ? origT : relT;
            if (Math.abs(v.currentTime - target) > 0.03) { try { v.currentTime = target; } catch {} }
            // A clip can pause itself on `ended` (e.g. restVid reaching ITS OWN short end
            // while origVid still has more of its window left) - once the loop below wraps
            // everything back to rangeStart it needs an explicit play() to resume, or it
            // just sits on its last frame forever.
            if (playing && v.paused) { try { v.play().catch(() => {}); } catch {} }
          }
        }
        let playing = false;
        function setPlaying(p) {
          playing = p;
          playBtn.textContent = playing ? "⏸" : "▶";
          for (const v of allVids()) { try { playing ? v.play().catch(() => {}) : v.pause(); } catch {} }
        }
        playBtn.addEventListener("click", () => setPlaying(!playing));
        prevBtn.addEventListener("click", () => { setPlaying(false); syncTo(Math.max(rangeStart, origVid.currentTime - 1 / FPS)); });
        nextBtn.addEventListener("click", () => { setPlaying(false); syncTo(Math.min(rangeEnd || origVid.duration || 0, origVid.currentTime + 1 / FPS)); });
        scrub.addEventListener("input", () => {
          setPlaying(false);
          const dur = (rangeEnd || origVid.duration || 0) - rangeStart;
          syncTo(rangeStart + (parseFloat(scrub.value) / 1000) * dur);
        });
        origVid.addEventListener("timeupdate", () => {
          const dur = (rangeEnd || origVid.duration || 0) - rangeStart;
          const t = Math.max(0, origVid.currentTime - rangeStart);
          if (dur > 0) scrub.value = String(Math.round((t / dur) * 1000));
          timeText.textContent = `${fmtT(t)} / ${fmtT(dur)}`;
          frameText.textContent = `Frame ${Math.round(t * FPS)} / ${Math.round(dur * FPS)}`;
          if (playing) {
            // No native `loop` on origVid any more (see its own comment above) - once its
            // clock reaches rangeEnd, wrap everything back to rangeStart by hand instead.
            if (rangeEnd && origVid.currentTime >= rangeEnd - 0.02) syncTo(rangeStart);
            else syncTo(origVid.currentTime);
          }
        });

        function close() {
          document.removeEventListener("keydown", kh);
          window.removeEventListener("resize", onWinResize);
          for (const v of allVids()) { try { v.pause(); v.removeAttribute("src"); v.load(); } catch {} }
          document.body.removeChild(ov);
        }
        kh = (e) => { if (e.key === "Escape") close(); };
        document.addEventListener("keydown", kh);
        closeBtn.addEventListener("click", close);

        ov.append(tabsWrap, stage, footer);
        document.body.appendChild(ov);
        // Must attach to the document first - renderStage()/layoutVideos() read
        // stage.clientWidth/Height, which are 0 on a detached element.
        renderTabs(); renderStage();
      }

      // KJ encodes preview frames on a background thread, so the last few can land
      // after execution_success — and after the run has already put its final video in
      // this box. Without a lock those late frames hide the result behind a looping
      // preview clip that never stops, which reads as "the run never finished".
      let previewLocked = false;

      function showPreviewFrame(dataURL, mime) {
        if (previewLocked) return;
        placeholder.style.display = "none";
        // A live preview frame arrives over its own websocket message, independent of the
        // numeric step-progress callback that normally hides this banner (prog() in
        // runFaceRefine) - so if a preview frame lands first, the banner and the live image
        // showed at once, squeezing each other sideways. Any preview frame means sampling
        // has visibly started, so always clear it here too.
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
      // Every mode/sub-mode shared ONE preview box with no memory of its own — switching
      // from, say, Postprocess to Image Generator kept showing Postprocess's last result,
      // since lastResultURL is a single variable and nothing ever repainted the box on a
      // mode switch (user: "프리뷰창의 결과물이 왜 모든 메뉴 프리뷰창에 동일하게
      // 적용되지???? 전부 독립적으로 동작되야하는데"). This cache keys the last shown
      // result by mode (Image Generator further by its own t2i/ref2i/charsheet sub-mode,
      // since those are just as independent as the top-level pills), and
      // restoreModeResult() repaints the box to match whenever the mode/sub-mode changes.
      const modeResultCache = {};
      function resultModeKey() {
        return state.generationMode === "imagegen"
          ? `imagegen:${state.imageGenMode || "t2i"}` : state.generationMode;
      }
      function restoreModeResult() {
        const cached = modeResultCache[resultModeKey()];
        if (!cached) { resetPreview(); return; }
        if (cached.kind === "image") showResultImage(cached.url, { final: cached.final });
        else showResultVideo(cached.url, { final: cached.final, compareRange: cached.compareRange });
      }
      function showResultImage(url, { final = false } = {}) {
        lastResultURL = url;
        modeResultCache[resultModeKey()] = { kind: "image", url, final };
        if (final) previewLocked = true;
        placeholder.style.display = "none"; fvsrBanner.style.display = "none"; hiresBanner.style.display = "none";
        hideBusyBanner();
        try { previewVid.pause(); } catch {}
        previewVid.style.display = "none";
        try { resultVid.pause(); } catch {}
        resultVid.style.display = "none";
        previewImg.src = url; previewImg.style.display = "block";
        badge.style.display = "block"; fsBtn.style.display = "none"; compareBtn.style.display = "none";
      }
      function showResultVideo(url, { final = false, compareRange = null } = {}) {
        lastResultURL = url;
        modeResultCache[resultModeKey()] = { kind: "video", url, final, compareRange };
        if (final) previewLocked = true;
        placeholder.style.display = "none";
        fvsrBanner.style.display = "none"; hiresBanner.style.display = "none";
        hideBusyBanner();
        previewImg.style.display = "none";
        try { previewVid.pause(); } catch {}
        previewVid.style.display = "none";
        resultVid.src = url;
        try { resultVid.load(); } catch {}
        resultVid.style.display = "block";
        // Loaded and ready, but left paused — a clip finishing mid-run should not start
        // making noise on its own. The user presses play.
        try { resultVid.pause(); resultVid.currentTime = 0; } catch {}
        // Captured NOW, not read live later at compareBtn's click time — see
        // lastCompareSource's own comment above.
        lastCompareSource = state.generationMode === "facerefine" ? (state.frSource || null)
                          : state.generationMode === "ltxupscale" ? (state.ltxSource || null)
                          : state.generationMode === "postprocess" ? (state.ppSource || null) : null;
        lastCompareRange = compareRange;
        const hasOriginal = !!lastCompareSource;
        // The compare viewer already covers fullscreen viewing (its own overlay, zoom/pan)
        // for these two modes, so a separate fullscreen button is redundant there.
        fsBtn.style.display = hasOriginal ? "none" : "block";
        compareBtn.style.display = hasOriginal ? "block" : "none";
      }
      function resetPreview() {
        previewLocked = false;
        lastCompareSource = null;
        lastCompareRange = null;
        placeholder.style.display = "block";
        hideBusyBanner();
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
        compareBtn.style.display = "none";
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
      // A gallery post-process job (Upscale/Deblur, FlashVSR especially — 7-18 minutes
      // with its own popup that the user can hide or close) shows here regardless of
      // whether the gallery itself is open, so closing either one never reads as "did it
      // stop?" (user: "팝업창을 닫거나 갤러리를 닫아도 메인 화면에서도 진행중이면
      // 진행상황 표시되게 해줘."). Wired via ctx.reportGalleryJob/clearGalleryJob, called
      // by ui_gallery_ltx25.js's runPost() on every progress tick.
      const galleryJobPill = el("div", { style: {
        display: "none", marginTop: "3px", fontSize: "10px", padding: "4px 8px",
        borderRadius: "5px", background: "rgba(224,165,48,0.15)", color: "#e0a530",
        border: "1px solid rgba(224,165,48,0.4)",
      }});
      statusWrap.append(statusLine, barOuter, queueWarn, galleryJobPill);
      ctx.reportGalleryJob = (label, pct, text) => {
        galleryJobPill.style.display = "block";
        galleryJobPill.textContent = `◮ ${label} (gallery)${text ? ` — ${text}` : pct != null ? ` — ${Math.round(pct)}%` : "…"}`;
      };
      ctx.clearGalleryJob = () => { galleryJobPill.style.display = "none"; };

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
      // FlashVSR runs as a second node in the SAME graph submission, right after the
      // sampler — its own tile-by-tile progress arrives on the same websocket event,
      // distinguished only by node id (see the onProgress(v, m, nodeId) callbacks below).
      // Sampling's own bar fraction (0..1 of this clip) is already spent by the time this
      // fires, so the overall bar just continues past it rather than restarting.
      function setFlashVSRProgress(tile, total) {
        placeholder.style.display = "none";
        fvsrBanner.style.display = "flex";
        const clipFrac = total ? tile / total : 0;
        const overall = totClip ? ((curClip - 1) + clipFrac) / totClip : clipFrac;
        barInner.style.width = `${Math.max(0, Math.min(100, overall * 100)).toFixed(1)}%`;
        badge.textContent = totClip > 1 ? `● LIVE  CLIP ${curClip}/${totClip}  ·  FlashVSR tile ${tile}/${total}`
                                        : `● LIVE  FlashVSR tile ${tile}/${total}`;
        setStatus(totClip > 1 ? `Clip ${curClip}/${totClip} · FlashVSR upscaling · tile ${tile}/${total}`
                              : `FlashVSR upscaling · tile ${tile}/${total}`);
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
      let lastFocusedPromptTA = null;

      const commonBtn = el("button", { type: "button", text: "🌐 Global", title: "Edit the global prompt shared by every clip", style: {
        cursor: "pointer", fontFamily: "inherit", fontSize: "10px",
        padding: "3px 9px", borderRadius: "5px", background: C.bg2, color: C.text,
        border: `1px solid ${C.border}`,
      }});
      commonBtn.addEventListener("click", () => commonOv?.show());
      promptHdr.appendChild(commonBtn);

      const refineBtn = el("button", { type: "button", text: "🔧 Refine", title: "Revise the current clip's prompt from a typed instruction — same result review as Prompt Write", style: {
        cursor: "pointer", fontFamily: "inherit", fontSize: "10px",
        padding: "3px 9px", borderRadius: "5px", background: C.bg2, color: C.text,
        border: `1px solid ${BRAND}`, fontWeight: "600",
      }});
      // Whichever clip's textarea was last focused, so Refine/Prompt Write from the main
      // screen act on the clip the user was actually just looking at — same tracking the
      // tag-insert buttons above use.
      const lastFocusedClipIndex = () => {
        const idx = Number(lastFocusedPromptTA?.dataset.clipIndex);
        return Number.isFinite(idx) ? idx : null;
      };
      refineBtn.addEventListener("click", () => promptEditOv?.openRefine?.(lastFocusedClipIndex()));
      promptHdr.appendChild(refineBtn);

      const writeBtn = el("button", { type: "button", text: "✨ Prompt Write", title: "Write a fresh prompt for the current clip — same result review as inside Prompt Edit", style: {
        cursor: "pointer", fontFamily: "inherit", fontSize: "10px",
        padding: "3px 9px", borderRadius: "5px", background: C.bg2, color: C.text,
        border: `1px solid ${BRAND}`, fontWeight: "600",
      }});
      writeBtn.addEventListener("click", () => promptEditOv?.openWrite?.(lastFocusedClipIndex()));
      promptHdr.appendChild(writeBtn);

      const editBtn = el("button", { type: "button", text: "📝 Prompt Edit", title: "Open the full prompt editor (with local enhance)", style: {
        cursor: "pointer", fontFamily: "inherit", fontSize: "10px",
        padding: "3px 9px", borderRadius: "5px", background: C.bg2, color: C.text,
        border: `1px solid ${BRAND}`, fontWeight: "600", marginLeft: "auto",
      }});
      editBtn.addEventListener("click", () => promptEditOv?.show());
      promptHdr.appendChild(editBtn);

      const addBtn = el("button", { type: "button", text: "+", title: "Add a clip prompt", style: {
        cursor: "pointer", fontFamily: "inherit", fontSize: "11px", padding: "3px 9px",
        borderRadius: "5px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
      }});
      const resetTAHBtn = el("button", { type: "button", text: "↕", title: "Reset text field size (not the prompt text itself) back to the default", style: {
        cursor: "pointer", fontFamily: "inherit", fontSize: "11px", padding: "3px 9px",
        borderRadius: "5px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
      }});
      resetTAHBtn.addEventListener("click", () => resetPromptTAHeights());
      promptHdr.append(addBtn, resetTAHBtn);

      const promptList = el("div", { style: { flex: "1", minHeight: "0", overflowY: "auto", display: "flex", flexDirection: "column", gap: "4px" } });
      promptList.className = "ltx25-lp";
      // ComfyUI hands wheel turns to the graph canvas (zoom); this list scrolls instead, except over a text box that has text to scroll.
      promptList.addEventListener("wheel", (e) => {
        const box = e.target.closest?.("textarea");
        if (box && box.scrollHeight > box.clientHeight + 1) return;
        if (promptList.scrollHeight <= promptList.clientHeight + 1) return;
        promptList.scrollTop += e.deltaY;
        e.preventDefault();
        e.stopPropagation();
      }, { capture: true, passive: false });
      // Sibling wrapper, not a child of promptList itself — promptList gets clear()'d and
      // fully rebuilt by renderPrompts(), which would wipe an overlay appended inside it.
      const promptListWrap = el("div", { style: { flex: "1", position: "relative", minHeight: "0", display: "flex", flexDirection: "column" } });
      // Same visual language as the live-preview's own "busy, no per-step feedback"
      // banners (frDetectBanner/fvsrBanner above) — dim cover + centered glowing text —
      // so a Refine/Prompt Write run reads as "busy" the same way a render does, instead
      // of looking like the fields just silently stopped responding to clicks.
      const promptBusyOv = el("div", { text: "✨ Writing the prompt…", style: {
        display: "none", position: "absolute", inset: "0", zIndex: "5",
        alignItems: "center", justifyContent: "center", textAlign: "center",
        background: "rgba(0,0,0,0.75)", padding: "0 16px", borderRadius: "6px",
        color: "#b57bff", fontSize: "18px", fontWeight: "700",
        textShadow: "0 0 12px rgba(181,123,255,0.5)",
      }});
      promptListWrap.append(promptList, promptBusyOv);
      promptWrap.append(promptHdr, promptListWrap);
      // Shared by the main-screen Refine/Prompt Write buttons AND the Prompt Edit popup —
      // whichever one is running an LLM call locks every clip's prompt field here too,
      // since they all edit the same underlying state.prompts.
      ctx.setPromptBusy = (busy, label) => {
        promptBusyOv.textContent = label || "✨ Writing the prompt…";
        promptBusyOv.style.display = busy ? "flex" : "none";
        promptList.querySelectorAll("textarea").forEach(t => { t.disabled = busy; });
      };

      // ══ PREVIEW RESIZE ══════════════════════════════════════════════════════
      // The current preview height is the max the user can go back up to — dragging the
      // handle only shrinks it, and whatever height it gives up goes straight to the
      // prompt list below. RIGHT_H (and so the node's overall size) never changes; only
      // the split between the two boxes does.
      const PREVIEW_MIN_H = 220;
      const PREVIEW_H_KEY = "ltx25_preview_h";
      let previewH = Number(localStorage.getItem(PREVIEW_H_KEY)) || PREVIEW_SIZE;
      function applyPreviewH(h) {
        previewH = Math.min(PREVIEW_SIZE, Math.max(PREVIEW_MIN_H, h));
        previewBox.style.height = `${previewH}px`;
        promptWrap.style.height = `${PROMPT_H + (PREVIEW_SIZE - previewH)}px`;
      }
      applyPreviewH(previewH);

      const previewResizeHandle = el("div", { title: "Drag to resize the preview", style: {
        position: "absolute", left: "0", right: "0", bottom: "0", height: "8px",
        cursor: "ns-resize", zIndex: "7", display: "flex", alignItems: "center", justifyContent: "center",
      }});
      const previewResizeGrip = el("div", { style: {
        width: "40px", height: "3px", borderRadius: "2px", background: "rgba(255,255,255,0.35)",
        pointerEvents: "none",
      }});
      previewResizeHandle.appendChild(previewResizeGrip);
      previewResizeHandle.addEventListener("mouseenter", () => { previewResizeGrip.style.background = BRAND; });
      previewResizeHandle.addEventListener("mouseleave", () => { previewResizeGrip.style.background = "rgba(255,255,255,0.35)"; });
      // Pointer Capture, not window mousemove/mouseup: dragging this handle up crosses
      // over previewVid's native <video> controls, and the browser's own control layer can
      // swallow the mouseup there before it ever reaches a window-level listener - leaving
      // the drag "stuck" engaged forever (reported: resize bar stays grabbed after the
      // cursor passes over the playback toolbar). setPointerCapture pins ALL subsequent
      // pointer events to the handle itself regardless of what's under the cursor,
      // including native video controls, so pointerup always fires here.
      previewResizeHandle.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        previewResizeHandle.setPointerCapture(e.pointerId);
        const startY = e.clientY, startH = previewH;
        const onMove = (ev) => applyPreviewH(startH + (ev.clientY - startY));
        const onUp = (ev) => {
          previewResizeHandle.releasePointerCapture(ev.pointerId);
          previewResizeHandle.removeEventListener("pointermove", onMove);
          previewResizeHandle.removeEventListener("pointerup", onUp);
          previewResizeHandle.removeEventListener("pointercancel", onUp);
          localStorage.setItem(PREVIEW_H_KEY, String(previewH));
        };
        previewResizeHandle.addEventListener("pointermove", onMove);
        previewResizeHandle.addEventListener("pointerup", onUp);
        previewResizeHandle.addEventListener("pointercancel", onUp);
      });
      previewBox.appendChild(previewResizeHandle);

      function normPrompt(p) {
        return typeof p === "string" ? { text: p, firstFrame: "", enabled: true } : p;
      }
      // Per-clip prompt textareas (H3's shot list, one per clip): remembers a user's own
      // resize (native resize:vertical drag) across reloads, same pattern as the preview
      // box's own PREVIEW_H_KEY, and keeps every clip's field the same height as whichever
      // one was just resized (user: "h3하단 프롬포트 필드도 사용자가 사이즈 조절했으면
      // 기억하기. 그리고 추가된 어떤 클립이든 높이 사이즈를 조절하면 추가되어 있는 클립의
      // 프롬포트 필드 높이도 전부 동기화 시키기.").
      const PROMPT_TA_H_KEY = "mmh3_prompt_ta_h";
      // 1.5x the original 120px default (user: "지금보다 초기 사이즈를 1.5배 늘려서
      // 기본값으로 잡아줘"), plus a sane floor/ceiling so a bad reading (see below)
      // can't runaway in either direction.
      const PROMPT_TA_DEFAULT_H = 180;
      const PROMPT_TA_MIN_H = 80;
      const PROMPT_TA_MAX_H = 600;
      const clampPromptTAH = (h) => Math.min(PROMPT_TA_MAX_H, Math.max(PROMPT_TA_MIN_H, h));
      let promptTaH = clampPromptTAH(Number(localStorage.getItem(PROMPT_TA_H_KEY)) || PROMPT_TA_DEFAULT_H);
      let promptTAs = [];          // this render's textareas, for cross-syncing
      let promptTAObservers = [];  // disconnected before every re-render
      let syncingPromptTAHeights = false;
      // Bug (user: "사용자가 조절하면 기억한다고 했는데... 늘리지도 않았는데 늘어나서
      // 줄어들지 않아"): the ResizeObserver fired — and was trusted — for ANY size
      // change, including ones the browser itself causes (a fractional/DPI-rounded
      // layout pass, a re-render's first paint before fonts/scrollbars settle), not
      // just an actual drag on the native resize handle. Each stray tick got saved as
      // the new "user" height and pushed onto every clip's textarea, so it could only
      // ever ratchet up over a session, never back down. Gated behind an actual
      // mousedown-drag on one of the watched textareas now, so a layout-driven size
      // change is measured but ignored instead of adopted.
      let promptTAResizing = false;
      document.addEventListener("mousedown", (e) => {
        if (e.target && promptTAs.includes(e.target)) promptTAResizing = true;
      }, true);
      document.addEventListener("mouseup", () => { promptTAResizing = false; }, true);
      function watchPromptTA(ta) {
        promptTAs.push(ta);
        ta.style.height = `${promptTaH}px`;
        const ro = new ResizeObserver(() => {
          if (syncingPromptTAHeights || !promptTAResizing) return;
          const h = clampPromptTAH(Math.round(ta.getBoundingClientRect().height));
          if (!h || h === promptTaH) return;
          promptTaH = h;
          localStorage.setItem(PROMPT_TA_H_KEY, String(promptTaH));
          syncingPromptTAHeights = true;
          promptTAs.forEach(other => { if (other !== ta) other.style.height = `${promptTaH}px`; });
          syncingPromptTAHeights = false;
        });
        ro.observe(ta);
        promptTAObservers.push(ro);
      }
      // ↺ Reset — puts every clip's textarea back to the shared default height.
      function resetPromptTAHeights() {
        promptTaH = PROMPT_TA_DEFAULT_H;
        localStorage.setItem(PROMPT_TA_H_KEY, String(promptTaH));
        syncingPromptTAHeights = true;
        promptTAs.forEach(ta => { ta.style.height = `${promptTaH}px`; });
        syncingPromptTAHeights = false;
      }
      // A thin, read-only view of the clip's segment timeline; the segments are edited in Prompt Edit.
      function miniBar(p, i) {
        const frames = clipFramesFor(state, i);
        let tl = {};
        try { tl = JSON.parse(p.dir?.widgets?.timeline_data || "{}"); } catch { tl = {}; }
        const bar = el("div", { title: "Segment timeline — click to edit it in Prompt Edit", style: {
          position: "relative", height: "14px", background: C.bg1, border: `1px solid ${C.border}`,
          borderRadius: "4px", overflow: "hidden", cursor: "pointer" } });
        const place = (seg, style) => {
          const left = Math.max(0, seg.start || 0) / frames * 100;
          const width = Math.max(0.8, Math.min(frames - (seg.start || 0), seg.length || 0) / frames * 100);
          bar.appendChild(el("div", { title: `${seg.type || "audio"} · frames ${Math.round(seg.start || 0)}–${Math.round((seg.start || 0) + (seg.length || 0))}`,
            style: { position: "absolute", left: `${left}%`, width: `${width}%`, ...style } }));
        };
        const kind = { image: BRAND, text: "#4aa3ff", video: "#e0a530" };
        (tl.segments || []).forEach(s => place(s, { top: "0", height: "9px", background: kind[s.type] || BRAND, opacity: "0.85", borderRadius: "2px" }));
        (tl.audioSegments || []).forEach(s => place(s, { bottom: "0", height: "4px", background: C.ok, borderRadius: "2px" }));
        bar.addEventListener("click", () => promptEditOv?.show(i));
        return bar;
      }
      function renderPrompts() {
        promptTAObservers.forEach(ro => ro.disconnect());
        promptTAObservers = []; promptTAs = [];
        clear(promptList);
        // Postprocess needs no prompt at all - every control lives in the left panel's accordion, so this area
        // just says so instead of showing an empty box.
        const isPostprocess = state.generationMode === "postprocess";
        commonBtn.style.display = refineBtn.style.display = writeBtn.style.display = editBtn.style.display = isPostprocess ? "none" : "";
        addBtn.style.display = resetTAHBtn.style.display = isPostprocess ? "none" : "";
        promptTitle.textContent = isPostprocess ? "POSTPROCESS" : "PROMPTS";
        promptList.style.gap = "4px";
        if (isPostprocess) {
          promptList.appendChild(el("div", {
            text: "No prompt needed — pick a source clip and the effects to chain in the left panel, then hit Preview.",
            style: { fontSize: "12px", color: C.muted, lineHeight: "1.6", padding: "8px 2px" },
          }));
          return;
        }
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
          const ta = el("textarea", { placeholder: i === 0
            ? (state.generationMode === "director" ? "Global prompt of this clip — its segments are written in Prompt Edit" : "Clip prompt — the shot, the action, the camera and the sound (shared text goes in 🌐 Global)")
            : "(blank = reuse the previous prompt)", style: {
            flex: "1", minHeight: "86px", boxSizing: "border-box", background: C.bg2, color: C.text,
            border: `1px solid ${C.border}`, borderRadius: "6px", padding: "6px",
            fontSize: "12px", fontFamily: "inherit", outline: "none", resize: "vertical",
          }});
          ta.value = promptText(p);
          watchPromptTA(ta);
          ta.addEventListener("input", () => {
            state.prompts[i] = normPrompt(state.prompts[i]);
            state.prompts[i].text = ta.value;
            persist();
          });
          ta.dataset.clipIndex = String(i);
          // Same "@" list as Prompt Edit: this clip's library references (nothing for a file clip).
          attachAtComplete(ta, async () => (await libraryContextCached(libraryRefFor(clipAssets(state, i), state.generationMode)))?.items || []);
          ta.addEventListener("focus", () => { ta.style.borderColor = BRAND; lastFocusedPromptTA = ta; });
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
          line.append(sideCol, el("div", { style: { flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "3px" } }, [ta, ...(state.generationMode === "director" ? [miniBar(p, i)] : [])]), del);
          promptList.appendChild(line);
        });
      }
      addBtn.addEventListener("click", () => {
        state.prompts.push({ text: "", firstFrame: "", enabled: true });
        persist(); refreshPlan();
      });
      rightPanel.append(previewBox, statusWrap, promptWrap);
      mainRow.append(leftOuter, rightPanel);
      root.appendChild(mainRow);

      // Asset tab: the reference asset library, same height as the generation screen.
      const assetBrowser = mountAssetBrowser({ height: RIGHT_H });
      const assetRow = el("div", { style: { display: "none" } }, [assetBrowser.el]);
      root.appendChild(assetRow);
      function setAssetView(on) {
        assetView = on;
        mainRow.style.display = on ? "none" : "flex";
        assetRow.style.display = on ? "block" : "none";
        if (on) assetBrowser.reload(); else assetBrowser.stop();
      }

      // ══ LEFT PANEL ══════════════════════════════════════════════════════════
      function currentPlan() { return clipPlan(state); }

      let planLine = null, totalLine = null;
      let canvasAcc = null, clipLenAcc = null;   // accordions whose summary line refreshPlan() keeps current
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
        const setSummary = (acc, text) => { if (acc?._summary) { acc._summary.textContent = text; acc._summary.title = text; } };
        setSummary(canvasAcc, `${state.aspect} · ${state.megapixels ?? 1.0} MP`);
        setSummary(clipLenAcc, `${p.clipSec.toFixed(2)}s × ${p.count} · ${(p.isOneTakeStitched && p.count > 1 ? p.stitchedSeconds : p.actualSeconds).toFixed(2)}s total`);
        renderPrompts();
      }
      ctx.refreshPlan = refreshPlan;
      ctx.refreshModes = () => { renderPills(); renderLeft(); renderPrompts(); };

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
      function accordion(key, title, summary, body, help = "") {
        const open = !!state.accordion?.[key];
        const head = el("div", { style: {
          display: "flex", alignItems: "center", gap: "6px", cursor: "pointer",
          userSelect: "none", padding: "1px 0",
        }});
        const summaryEl = el("div", { text: summary || "", title: summary || "", style: {
          flex: "1", textAlign: "right", fontSize: "10px",
          color: summary && summary !== "OFF" && summary !== "None" ? BRAND : C.muted,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } });
        head.append(
          el("div", { text: open ? "▼" : "▶", style: { fontSize: "9px", color: C.muted, width: "10px", flexShrink: "0" } }),
          el("div", { text: title, style: {
            fontSize: "10px", fontWeight: "700", letterSpacing: "0.06em",
            textTransform: "uppercase", color: C.muted, flexShrink: "0" } }),
          ...(help ? [helpDot(help)] : []),
          summaryEl,
        );
        head.addEventListener("click", () => {
          state.accordion = { ...(state.accordion || {}), [key]: !open };
          persist(); renderLeft();
        });
        const acc = panel([head, ...(open ? body().filter(Boolean) : [])]);
        acc._summary = summaryEl;   // refreshPlan() keeps the Canvas / Clip length summaries current
        return acc;
      }

      // A small circled "?" that carries the long explanation as a native title tooltip —
      // for text that was pushing the left panel's height up without being read every time.
      function helpDot(text) {
        return el("span", { text: "?", title: text, style: {
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: "13px", height: "13px", borderRadius: "50%", flexShrink: "0",
          background: C.border, color: C.muted, fontSize: "9px", fontWeight: "700",
          cursor: "help", marginLeft: "5px" } });
      }
      function labelHelp(text, helpText) {
        const l = label(text);
        l.style.display = "flex"; l.style.alignItems = "center";
        l.appendChild(helpDot(helpText));
        return l;
      }

      // ── LTX 2.5 Upscale mode left panel ─────────────────────────────────────
      // A standalone refine pass on the LTX 2.5 model — nothing to do with the H3
      // pipeline. Its prompt + LLM live in the bottom prompt area (renderPrompts), its
      // seed on the fixed bottom row. Only the source, the refine params, its own LoRA
      // list and the RTX finisher are here.
      const LTX_SAMPLERS   = ["euler_ancestral", "euler", "dpmpp_2m", "dpmpp_sde", "res_multistep", "lcm"];
      const LTX_SCHEDULERS = ["simple", "normal", "sgm_uniform", "beta", "linear_quadratic", "karras"];

      // Gallery pick / upload for Postprocess — mirrors setLtxSource/setFrSource, but no
      // prompt to load (Postprocess has none): just the source file + its probed meta.
      function setPpSource(inputFilename, kind, item) {
        state.ppSource = inputFilename; state.ppSourceKind = kind;
        let m = (item && item.meta) || {};
        if (typeof m === "string") { try { m = JSON.parse(m); } catch { m = {}; } }
        const durM = m.durationSeconds || m.seconds || (m.frames && m.fps ? m.frames / m.fps : 0) || 0;
        state.ppSourceMeta = (m.w || m.h || m.fps || m.frames || durM)
          ? { w: m.w || 0, h: m.h || 0, fps: m.fps || 0, frames: m.frames || 0, duration: durM }
          : null;
        // The full source meta (prompt, seed, loras, everything) — kept separately from
        // the numeric subset above so the panel's own display logic is unaffected;
        // runPostprocess spreads this onto the output's own meta (same "carry the
        // source's own info forward" shape the gallery's own post-process tools use —
        // writePostMeta in ui_gallery_ltx25.js), which is what feeds the bottom-left
        // info strip and Reuse Setting for a Postprocess output.
        state.ppSourceFullMeta = (m && Object.keys(m).length) ? m : null;
        // A different source invalidates any preview range picked against the old clip's
        // length — 0/0 (whole clip) is always safe regardless of the new duration.
        state.ppPreviewStart = 0; state.ppPreviewEnd = 0;
        _ppSrcInfo = null;
        persist(); renderLeft(); renderPrompts();
        loadPpSrcInfo();
      }
      let _ppSrcInfo = null;
      async function loadPpSrcInfo() {
        _ppSrcInfo = null;
        if (!state.ppSource) { renderLeft(); return; }
        try {
          const d = await getMediaInfo(state.ppSource);
          if (d && d.ok) _ppSrcInfo = d;
        } catch {}
        renderLeft();
      }

      // Shared source-card sizing for LTX Upscale / Face Refine's left-panel source clip
      // cards. Landscape-through-square clips get a card that shrinks to their own aspect
      // ratio (no letterbox); portrait clips are capped at a 1:1 square (pillarboxed) so a
      // tall clip doesn't blow out the left panel's height — this is the behaviour LTX
      // Upscale's card already had. Face Refine's card used a fixed 16:9 box instead, so the
      // two cards visibly differed in size for the same clip (reported: "face refine과
      // upscale by LTX 2.5의 비디오 인풋 카드 사이즈가 다릅니다").
      function applySourceCardAspect(card, vid) {
        const w = vid.videoWidth, h = vid.videoHeight;
        if (!w || !h) return;
        card.style.aspectRatio = (w / h) >= 1 ? `${w} / ${h}` : "1 / 1";
      }

      // ── Postprocess mode left panel ──────────────────────────────────────────
      // Chains Deblur -> Denoise -> Upscale -> Skin Retouch -> Add Grain -> Interpolate ->
      // Resize on an existing clip. Fixed order (A-G), each step independently toggled. No
      // prompt, no Seed/Mode — the fixed bottom row is replaced with a preview-range +
      // Preview/Generate/Stop (see ppPreviewWrap below), and any step needing a seed
      // (FlashVSR) just randomizes.
      function renderPostprocessLeft() {
        const prevScroll = leftPanel.scrollTop;
        clear(leftPanel);

        // ── source clip ──────────────────────────────────────────────────────
        const srcKids = [label("Source clip")];
        const hasSrc = !!state.ppSource;
        const card = el("div", { style: {
          position: "relative", width: "100%", aspectRatio: "16 / 9", background: "#000",
          borderRadius: "8px", overflow: "hidden",
          border: `1px solid ${hasSrc ? BRAND : C.border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }});
        if (hasSrc) {
          const vid = el("video", { src: `/view?filename=${encodeURIComponent(state.ppSource)}&type=input`,
            muted: true, loop: true, playsInline: true, preload: "metadata",
            style: { width: "100%", height: "100%", objectFit: "contain", background: "#000", display: "block", cursor: "pointer" } });
          vid.addEventListener("click", () => { vid.paused ? vid.play() : vid.pause(); });
          vid.addEventListener("loadedmetadata", () => applySourceCardAspect(card, vid));
          card.appendChild(vid);
          card.appendChild(el("button", { type: "button", text: "✕", title: "Clear source", style: {
            position: "absolute", top: "6px", right: "6px", zIndex: "3", width: "24px", height: "24px",
            border: "none", borderRadius: "6px", background: "rgba(0,0,0,0.7)", color: "#fff", cursor: "pointer", fontSize: "12px",
          }, onclick: () => { state.ppSource = ""; state.ppSourceKind = "gallery"; state.ppSourceMeta = null; _ppSrcInfo = null; persist(); renderLeft(); renderPrompts(); } }));
          srcKids.push(card);
          const info = _ppSrcInfo, sm = state.ppSourceMeta || {};
          const dur = (info && info.duration) || sm.duration || 0;
          const w = (info && info.width) || sm.w || 0, h = (info && info.height) || sm.h || 0;
          let fpsV = (info && info.fps) || sm.fps || 0;
          if (!fpsV && sm.frames && dur) fpsV = sm.frames / dur;
          const fmtT = (s) => { s = Math.max(0, s || 0); const m = Math.floor(s / 60); const ss = Math.floor(s % 60); return `${m}:${String(ss).padStart(2, "0")}`; };
          srcKids.push(el("div", { style: {
            display: "flex", alignItems: "center", gap: "16px", padding: "4px 2px",
            fontSize: "11px", color: C.text, fontVariantNumeric: "tabular-nums",
          }}, [
            el("span", { text: `${fmtT(dur)}` }),
            el("span", { text: fpsV ? `${Math.round(fpsV)}fps` : "—", style: { color: fpsV ? C.text : C.muted } }),
            el("span", { text: (w && h) ? `${w}x${h}` : "—", style: { color: (w && h) ? C.text : C.muted } }),
          ]));
        } else {
          card.appendChild(el("div", { text: "no source clip", style: { color: C.muted, fontSize: "12px" } }));
          srcKids.push(card);
        }
        const ppFileInp = el("input", { type: "file", accept: "video/*", style: { display: "none" } });
        ppFileInp.addEventListener("change", async () => {
          const f = ppFileInp.files[0]; ppFileInp.value = "";
          if (!f) return;
          try { showPopup("Uploading…", false); const name = await uploadMedia(f); setPpSource(name, "upload"); }
          catch (e) { showPopup(e.message, true); }
        });
        const ppGalBtn = button("🖼 From gallery", () => galleryOv?.showPicker((inputFilename, item) =>
          setPpSource(inputFilename, "gallery", item)));
        const ppUpBtn = button("⬆ Upload", () => ppFileInp.click(), "default");
        ppGalBtn.style.flex = "1"; ppUpBtn.style.flex = "1";
        srcKids.push(el("div", { style: { display: "flex", gap: "8px" } }, [ppGalBtn, ppUpBtn]));
        srcKids.push(ppFileInp);
        leftPanel.appendChild(panel(srcKids));

        // ── A. Deblur ────────────────────────────────────────────────────────
        leftPanel.appendChild(accordion("ppDeblur", "A. Deblur",
          state.ppDeblurOn ? (state.ppDeblurStrength || "MEDIUM") : "OFF", () => [
            checkboxRow("Enable Deblur (RTX Deblur)", state.ppDeblurOn, v => { state.ppDeblurOn = v; persist(); renderLeft(); }),
            state.ppDeblurOn ? row([col([label("Strength"), select(
              ["LOW", "MEDIUM", "HIGH", "ULTRA"].map(s => ({ value: s, label: s })),
              state.ppDeblurStrength || "MEDIUM", v => { state.ppDeblurStrength = v; persist(); })])]) : null,
          ]));

        // ── B. Denoise ───────────────────────────────────────────────────────
        leftPanel.appendChild(accordion("ppDenoise", "B. Denoise",
          state.ppDenoiseOn ? (state.ppDenoiseStrength || "MEDIUM") : "OFF", () => [
            checkboxRow("Enable Denoise (RTX Denoise)", state.ppDenoiseOn, v => { state.ppDenoiseOn = v; persist(); renderLeft(); }),
            state.ppDenoiseOn ? row([col([label("Strength"), select(
              ["LOW", "MEDIUM", "HIGH", "ULTRA"].map(s => ({ value: s, label: s })),
              state.ppDenoiseStrength || "MEDIUM", v => { state.ppDenoiseStrength = v; persist(); })])]) : null,
          ]));

        // ── C. Upscale ───────────────────────────────────────────────────────
        // Order and labels per the user's own numbered spec: 1. FlashVSR, 2. RTX VSR (TJ)
        // — TJ_NODE's own node, not the third-party RTXVideoSuperResolution the main
        // Upscale accordion/gallery use, so the chain depends on one pack — 3. Model.
        // Still reuses the shared rtx*/flashvsr*/upscaleModel state fields those other
        // accordions read/write, per the established "one setting, offered everywhere"
        // convention — only the menu's order/labels are Postprocess-specific.
        // RTX VSR (TJ) size controls — Scale (×) / Short / Long / W×H (+ crop anchor for W×H).
        // `k` names the state fields, so the standalone RTX method and the 2nd pass of a 2-pass
        // upscale each keep their own values.
        const rtxSizeControls = (k) => {
          const MODES = [["scale", "Scale (×)"], ["short", "Short"], ["long", "Long"], ["wh", "W×H"]];
          const mode = state[k.mode] || "scale";
          const out = [col([label("Quality"), select(["LOW", "MEDIUM", "HIGH", "ULTRA"].map(q => ({ value: q, label: q })),
            state[k.quality] || "ULTRA", v => { state[k.quality] = v; persist(); })])];
          out.push(col([label("Size"), el("div", { style: { display: "flex", gap: "4px" } }, MODES.map(([key, lbl]) => {
            const active = key === mode;
            const b = el("button", { type: "button", text: lbl, style: {
              cursor: "pointer", fontFamily: "inherit", fontSize: "10px", padding: "4px 9px",
              borderRadius: "5px", fontWeight: active ? "700" : "400",
              background: active ? BRAND : C.bg2, color: "#fff",
              border: `1px solid ${active ? BRAND : C.border}`,
            }});
            b.addEventListener("click", () => { state[k.mode] = key; persist(); renderLeft(); });
            return b;
          }))]));
          if (mode === "scale") {
            out.push(col([label("Scale (×)"), numberField(state[k.scale] ?? 2,
              v => { state[k.scale] = Math.max(1, v); persist(); }, 0.25)]));
          } else if (mode === "short" || mode === "long") {
            const f = mode === "short" ? k.short : k.long;
            out.push(col([label(`${mode === "short" ? "Short" : "Long"} side (px)`),
              numberField(state[f] ?? (mode === "short" ? 1080 : 1920),
                v => { state[f] = Math.max(8, Math.round(v)); persist(); }, 8)]));
          } else {
            out.push(row([
              col([label("Width"), numberField(state[k.w] ?? 1920, v => { state[k.w] = Math.max(8, Math.round(v)); persist(); }, 8)]),
              col([label("Height"), numberField(state[k.h] ?? 1080, v => { state[k.h] = Math.max(8, Math.round(v)); persist(); }, 8)]),
            ]));
            out.push(col([label("Crop anchor"), select(
              ["center", "left", "right", "top", "bottom"].map(a => ({ value: a, label: a[0].toUpperCase() + a.slice(1) })),
              state[k.anchor] || "center", v => { state[k.anchor] = v; persist(); })]));
          }
          return out;
        };
        const RTX_KEYS_SOLO = { mode: "rtxSizeMode", quality: "rtxQuality", scale: "rtxScale", short: "rtxShort", long: "rtxLong", w: "rtxW", h: "rtxH", anchor: "rtxCropAnchor" };
        const RTX_KEYS_PASS2 = { mode: "pp2RtxSizeMode", quality: "pp2RtxQuality", scale: "pp2RtxScale", short: "pp2RtxShort", long: "pp2RtxLong", w: "pp2RtxW", h: "pp2RtxH", anchor: "pp2RtxCropAnchor" };
        const PP_UPSCALE_METHODS = [
          { value: "flashvsr", label: "FlashVSR" },
          { value: "rtx",      label: "RTX VSR (TJ)" },
          { value: "model",    label: "Model" },
        ];
        leftPanel.appendChild(accordion("ppUpscale", "C. Upscale",
          state.ppUpscaleOn ? ((state.upscaleMode && state.upscaleMode !== "none" ? state.upscaleMode : "model")
            + (state.ppUpscale2On && state.upscaleMode !== "rtx" ? " → rtx" : "")) : "OFF", () => {
            const kids = [checkboxRow("Enable Upscale", state.ppUpscaleOn, v => { state.ppUpscaleOn = v; persist(); renderLeft(); })];
            if (!state.ppUpscaleOn) return kids;
            const method = (state.upscaleMode && state.upscaleMode !== "none") ? state.upscaleMode : "flashvsr";
            kids.push(row([col([label("Method"), select(
              PP_UPSCALE_METHODS, method, v => { state.upscaleMode = v; persist(); renderLeft(); })])]));
            if (method === "flashvsr") {
              kids.push(row([
                col([label("Model"), select(FLASHVSR_MODELS.map(m => ({ value: m, label: m })),
                  state.flashvsrModel || "FlashVSR-v1.1", v => { state.flashvsrModel = v; persist(); })]),
                col([label("Mode"), select(FLASHVSR_MODES.map(m => ({ value: m, label: m })),
                  state.flashvsrMode || "tiny", v => { state.flashvsrMode = v; persist(); })]),
              ]));
              kids.push(row([
                col([label("Scale"), numberField(state.flashvsrScale ?? 2, v => { state.flashvsrScale = Math.min(4, Math.max(2, Math.round(v))); persist(); }, 1)]),
                col([label("Tile"), numberField(state.flashvsrTileSize ?? 384, v => { state.flashvsrTileSize = Math.max(32, Math.round(v)); persist(); }, 32)]),
              ]));
            } else if (method === "rtx") {
              kids.push(...rtxSizeControls(RTX_KEYS_SOLO));
            } else {
              kids.push(row([col([label("Model"), select(
                (ctx.availableModels?.upscale_models || ["none"]).map(m => ({ value: m, label: m })),
                state.upscaleModel || "none", v => { state.upscaleModel = v; persist(); })])]));
            }
            // 2-pass: only FlashVSR / Model can be followed by an RTX VSR pass (RTX itself
            // would just be run twice), and the second pass is always RTX VSR (TJ).
            if (method !== "rtx") {
              kids.push(checkboxRow("2-pass: run RTX VSR (TJ) on the result", !!state.ppUpscale2On,
                v => { state.ppUpscale2On = v; persist(); renderLeft(); }));
              if (state.ppUpscale2On) {
                kids.push(el("div", { text: "2nd pass — RTX VSR (TJ)", style: { fontSize: "11px", fontWeight: "700", color: BRAND } }));
                kids.push(...rtxSizeControls(RTX_KEYS_PASS2));
                kids.push(el("div", {
                  text: `${method === "flashvsr" ? "FlashVSR" : "Model"} → RTX VSR → next effect. These RTX settings belong to the 2nd pass only; the standalone RTX VSR method keeps its own. Scale multiplies the first pass's output (2× then 2× = 4×); Short / Long / W×H size the final frames, and W×H crops to the aspect first.`,
                  style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } }));
              }
            }
            return kids;
          }));

        // ── D. Skin Retouch ──────────────────────────────────────────────────
        // Right after Upscale per the user's explicit call. Pure-PyTorch, non-generative
        // (YCbCr skin mask, no model file) — TJ_SkinRetouch, ported from VRGDG-SeedVR2-
        // TensorRT-Studio's apply_skin_finishing()/apply_skin_microtexture().
        leftPanel.appendChild(accordion("ppSkinRetouch", "D. Skin Retouch",
          state.ppSkinRetouchOn ? "on" : "OFF", () => [
            checkboxRow("Enable Skin Retouch (TJ)", state.ppSkinRetouchOn, v => { state.ppSkinRetouchOn = v; persist(); renderLeft(); }),
            !state.ppSkinRetouchOn ? null : row([
              col([label("Evenness"), numberField(state.ppSkinEvenness ?? 0, v => { state.ppSkinEvenness = Math.max(0, Math.min(1, v)); persist(); }, 0.1)]),
              col([label("Smoothing"), numberField(state.ppSkinSmoothing ?? 0, v => { state.ppSkinSmoothing = Math.max(0, Math.min(1, v)); persist(); }, 0.1)]),
            ]),
            !state.ppSkinRetouchOn ? null : row([
              col([label("Redness"), numberField(state.ppSkinRedness ?? 0, v => { state.ppSkinRedness = Math.max(0, Math.min(1, v)); persist(); }, 0.1)]),
              col([label("Shine"), numberField(state.ppSkinShine ?? 0, v => { state.ppSkinShine = Math.max(0, Math.min(1, v)); persist(); }, 0.1)]),
            ]),
            !state.ppSkinRetouchOn ? null : row([
              col([label("Blemish"), select(
                [{ value: "off", label: "Off" }, { value: "subtle", label: "Subtle" }, { value: "strong", label: "Strong" }],
                state.ppSkinBlemishMode || "off", v => { state.ppSkinBlemishMode = v; persist(); })]),
              col([label("Microtexture"), numberField(state.ppSkinMicrotexture ?? 0, v => { state.ppSkinMicrotexture = Math.max(0, Math.min(3, v)); persist(); }, 0.1)]),
            ]),
            !state.ppSkinRetouchOn ? null : checkboxRow("Preserve marks (moles/scars)", state.ppSkinPreserveMarks !== false,
              v => { state.ppSkinPreserveMarks = v; persist(); }),
          ]));

        // ── E. Add Grain ─────────────────────────────────────────────────────
        leftPanel.appendChild(accordion("ppGrain", "E. Add Grain",
          state.ppGrainOn ? "on" : "OFF", () => [
            checkboxRow("Enable Add Grain (GLSL film grain)", state.ppGrainOn, v => { state.ppGrainOn = v; persist(); renderLeft(); }),
            !state.ppGrainOn ? null : row([
              col([label("Amount"), numberField(state.ppGrainAmount ?? 0.25, v => { state.ppGrainAmount = Math.max(0, Math.min(1, v)); persist(); }, 0.05)]),
              col([label("Size"), numberField(state.ppGrainSize ?? 0.1, v => { state.ppGrainSize = Math.max(0.01, v); persist(); }, 0.05)]),
            ]),
            !state.ppGrainOn ? null : row([
              col([label("Color"), numberField(state.ppGrainColor ?? 0, v => { state.ppGrainColor = Math.max(0, Math.min(1, v)); persist(); }, 0.1)]),
              col([label("Lum bias"), numberField(state.ppGrainLumBias ?? 0, v => { state.ppGrainLumBias = Math.max(0, Math.min(1, v)); persist(); }, 0.1)]),
            ]),
            !state.ppGrainOn ? null : row([col([label("Noise"), select(
              [{ value: "smooth", label: "Smooth" }, { value: "grainy", label: "Grainy" }],
              state.ppGrainNoiseMode || "smooth", v => { state.ppGrainNoiseMode = v; persist(); })])]),
          ]));

        // ── F. Interpolate ───────────────────────────────────────────────────
        leftPanel.appendChild(accordion("ppInterpolate", "F. Interpolate",
          state.ppInterpolateOn ? `${FPS} → ${state.ppInterpolateTargetFps ?? FPS * 2}fps` : "OFF", () => [
            checkboxRow("Enable Interpolate (RIFE)", state.ppInterpolateOn, v => { state.ppInterpolateOn = v; persist(); renderLeft(); }),
            !state.ppInterpolateOn ? null : row([
              col([label(`${FPS} fps →`), numberField(state.ppInterpolateTargetFps ?? FPS * 2, v => { state.ppInterpolateTargetFps = Math.max(FPS + 1, Math.round(v)); persist(); }, 1)]),
              col([label("Scale"), select(["0.25", "0.5", "1.0", "2.0", "4.0"].map(v => ({ value: v, label: v })),
                String(state.ppInterpolateScale ?? 1.0), v => { state.ppInterpolateScale = parseFloat(v); persist(); })]),
            ]),
          ]));

        // ── G. Resize ────────────────────────────────────────────────────────
        // Reuses the same state.resize* fields the gallery's own "↔ Resize" bar uses.
        leftPanel.appendChild(accordion("ppResize", "G. Resize",
          state.ppResizeOn ? (state.resizeMode || "Long side") : "OFF", () => {
            const kids = [checkboxRow("Enable Resize (Video Resize (TJ))", state.ppResizeOn, v => { state.ppResizeOn = v; persist(); renderLeft(); })];
            if (!state.ppResizeOn) return kids;
            const RESIZE_MODES = ["Long side", "Short side", "Ratio", "Mega Pixel", "Width x Height"];
            const mode = state.resizeMode || "Long side";
            kids.push(row([col([label("Mode"), select(RESIZE_MODES.map(m => ({ value: m, label: m })),
              mode, v => { state.resizeMode = v; persist(); renderLeft(); })])]));
            if (mode === "Long side" || mode === "Short side") {
              kids.push(row([col([label("Target px"), numberField(state.resizeTargetPx ?? 1920, v => { state.resizeTargetPx = Math.max(8, Math.round(v)); persist(); }, 8)])]));
            } else if (mode === "Ratio") {
              kids.push(row([
                col([label("Ratio W"), numberField(state.resizeRatioW ?? 16, v => { state.resizeRatioW = Math.max(1, Math.round(v)); persist(); }, 1)]),
                col([label("Ratio H"), numberField(state.resizeRatioH ?? 9, v => { state.resizeRatioH = Math.max(1, Math.round(v)); persist(); }, 1)]),
              ]));
            } else if (mode === "Mega Pixel") {
              kids.push(row([col([label("Megapixels"), numberField(state.resizeMegapixels ?? 1.0, v => { state.resizeMegapixels = Math.max(0.01, v); persist(); }, 0.1)])]));
            } else {
              kids.push(row([
                col([label("Width"), numberField(state.resizeTargetWidth ?? 1920, v => { state.resizeTargetWidth = Math.max(8, Math.round(v)); persist(); }, 8)]),
                col([label("Height"), numberField(state.resizeTargetHeight ?? 1080, v => { state.resizeTargetHeight = Math.max(8, Math.round(v)); persist(); }, 8)]),
              ]));
              kids.push(row([col([label("Crop mode"), select(
                [{ value: "crop", label: "Crop" }, { value: "stretch", label: "Stretch" }],
                state.resizeCropMode || "crop", v => { state.resizeCropMode = v; persist(); })])]));
            }
            kids.push(row([col([label("Upscale method"), select(
              ["lanczos", "bilinear", "bicubic", "area", "nearest-exact"].map(m => ({ value: m, label: m })),
              state.resizeUpscaleMethod || "lanczos", v => { state.resizeUpscaleMethod = v; persist(); })])]));
            return kids;
          }));

        useBottomWrap(ppPreviewWrap);
        leftPanel.scrollTop = prevScroll;
      }

      // Replaces the fixed Seed/Mode row for Postprocess mode: a preview-range (start/end
      // seconds) with its own light-purple "Preview" button — a quick, NOT-saved look at
      // a short slice — plus the usual ▶ Generate / ■ Stop pair underneath, which always
      // runs (and saves) the FULL clip regardless of the range fields. Preview is an
      // optional check, not a gate: Generate works with nothing previewed at all.
      // Built once at node mount (not per-render, unlike most fields here), so its
      // initial value must be read from state directly — a literal 0 here would show
      // 0:00 forever regardless of what was actually restored/typed, even right after
      // defaultState() correctly restored ppPreviewStart/End from a saved session.
      const ppPreviewStartIn = numberField(state.ppPreviewStart ?? 0, v => { state.ppPreviewStart = Math.max(0, v); persist(); }, 0.1);
      const ppPreviewEndIn = numberField(state.ppPreviewEnd ?? 0, v => { state.ppPreviewEnd = Math.max(0, v); persist(); }, 0.1);
      const ppPreviewBtn = el("button", { type: "button", text: "Preview", style: {
        cursor: "pointer", width: "100%", padding: "10px", fontSize: "13px", fontWeight: "700",
        borderRadius: "6px", border: "none", background: "#e4d4fb", color: BRAND,
      }});
      ppPreviewBtn.addEventListener("click", () => runPostprocess({ full: false }));
      const ppGenBtn = button("▶ Generate", null, "primary");
      ppGenBtn.style.cssText += "width:100%;padding:11px;font-size:13px;";
      ppGenBtn.addEventListener("click", () => runPostprocess({ full: true }));
      const ppStopBtn = button("■ Stop", async () => {
        await interrupt();
        setStatus("Stopping…");
      });
      ppStopBtn.style.flexShrink = "0";
      const ppPreviewWrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px",
        paddingTop: "6px", flexShrink: "0", borderTop: `1px solid ${C.border}` } });
      ppPreviewWrap.appendChild(panel([row([
        col([label("Start (s)"), ppPreviewStartIn]),
        col([label("End (s) — 0 = full"), ppPreviewEndIn]),
      ])]));
      ppPreviewWrap.appendChild(ppPreviewBtn);
      ppPreviewWrap.appendChild(row([ppGenBtn, ppStopBtn]));

      let ppRunning = false;
      async function runPostprocess({ full = true } = {}) {
        if (ppRunning) return;
        if (!state.ppSource) { showPopup("Pick a source clip first.", true); return; }
        const steps = ["ppDeblurOn", "ppDenoiseOn", "ppUpscaleOn", "ppSkinRetouchOn", "ppGrainOn", "ppInterpolateOn", "ppResizeOn"];
        if (!steps.some(k => state[k])) { showPopup("Enable at least one effect (A-F) first.", true); return; }
        ppRunning = true;
        const busyBtn = full ? ppGenBtn : ppPreviewBtn;
        ppGenBtn.disabled = true; ppPreviewBtn.disabled = true;
        busyBtn.textContent = "⏳ Running…"; busyBtn.style.opacity = "0.6";
        setStatus("Postprocess running…");
        showBusyBanner(full ? "후보정을 반영하여 처리중입니다. 잠시 기다려주세요."
          : "미리보기 처리중입니다. 잠시 기다려주세요.");
        try {
          if (!ctx.availability || !Object.keys(ctx.availability).length) {
            const av = await getNodeAvailability();
            ctx.availability = av.available || {}; ctx.availabilityInfo = av;
          }
          // Generate always runs the whole clip — the range fields only ever apply to
          // Preview's own short-look run, never to a real/final one.
          const startS = full ? 0 : Math.max(0, state.ppPreviewStart || 0);
          const endS = full ? 0 : Math.max(0, state.ppPreviewEnd || 0);
          const srcMeta = state.ppSourceMeta || (_ppSrcInfo ? { fps: _ppSrcInfo.fps, w: _ppSrcInfo.width, h: _ppSrcInfo.height } : {});
          const srcFps = srcMeta.fps || FPS;
          const skipFirstFrames = Math.round(startS * srcFps);
          const frameLoadCap = endS > startS ? Math.round((endS - startS) * srcFps) : 0;

          // A preview writes into ComfyUI's own temp/ dir (save_output:false below), under
          // one fixed subfolder shared by every tool's preview runs — so Settings → Output
          // can report its total size and clear it in one shot without touching anything
          // in the real output/ gallery.
          const built = buildPostprocessGraph({
            inputFile: state.ppSource,
            folder: full ? (state.saveSubfolder || SUBFOLDER) : TEMP_PREVIEW_SUBFOLDER,
            stem: state.ppSource.replace(/\.[^.]+$/, ""),
            skipFirstFrames, frameLoadCap,
            saveSuffix: frameLoadCap ? "_post_preview" : "_post",
            preview: !full,
            deblur: { enabled: state.ppDeblurOn, strength: state.ppDeblurStrength || "MEDIUM" },
            denoise: { enabled: state.ppDenoiseOn, strength: state.ppDenoiseStrength || "MEDIUM" },
            upscale: {
              enabled: state.ppUpscaleOn,
              method: (state.upscaleMode && state.upscaleMode !== "none") ? state.upscaleMode : "flashvsr",
              twoPass: !!state.ppUpscale2On,
              pass2: {
                rtxSizeMode: state.pp2RtxSizeMode || "scale", rtxScale: state.pp2RtxScale, rtxShort: state.pp2RtxShort,
                rtxLong: state.pp2RtxLong, rtxW: state.pp2RtxW, rtxH: state.pp2RtxH,
                rtxCropAnchor: state.pp2RtxCropAnchor, rtxQuality: state.pp2RtxQuality,
              },
              modelName: state.upscaleModel,
              rtxScale: state.rtxScale, rtxQuality: state.rtxQuality, rtxSizeMode: state.rtxSizeMode || "scale",
              rtxShort: state.rtxShort, rtxLong: state.rtxLong, rtxW: state.rtxW, rtxH: state.rtxH,
              rtxCropAnchor: state.rtxCropAnchor, srcW: srcMeta.w, srcH: srcMeta.h,
              flashvsr: {
                model: state.flashvsrModel, mode: state.flashvsrMode, scale: state.flashvsrScale,
                colorFix: state.flashvsrColorFix, tileSize: state.flashvsrTileSize,
                tileOverlap: state.flashvsrTileOverlap, seed: randomSeed(),
              },
            },
            skinRetouch: {
              enabled: state.ppSkinRetouchOn, evenness: state.ppSkinEvenness, smoothing: state.ppSkinSmoothing,
              redness: state.ppSkinRedness, shine: state.ppSkinShine, blemishMode: state.ppSkinBlemishMode,
              preserveMarks: state.ppSkinPreserveMarks, microtextureStrength: state.ppSkinMicrotexture,
            },
            grain: {
              enabled: state.ppGrainOn, amount: state.ppGrainAmount, size: state.ppGrainSize,
              color: state.ppGrainColor, lumBias: state.ppGrainLumBias, noiseMode: state.ppGrainNoiseMode,
            },
            interpolate: {
              enabled: state.ppInterpolateOn, targetFps: state.ppInterpolateTargetFps,
              scale: state.ppInterpolateScale, batchSize: 8, useFp16: true,
            },
            resize: {
              enabled: state.ppResizeOn, mode: state.resizeMode, upscaleMethod: state.resizeUpscaleMethod,
              targetPx: state.resizeTargetPx, ratioW: state.resizeRatioW, ratioH: state.resizeRatioH,
              megapixels: state.resizeMegapixels, targetWidth: state.resizeTargetWidth,
              targetHeight: state.resizeTargetHeight, cropMode: state.resizeCropMode,
            },
          }, ctx.availability || {});

          setStatus(`Postprocess: ${built.usedSteps.join(" + ")}…`);
          const res = await queuePrompt(built.graph, {
            onProgress: (v, m) => setStatus(`Postprocess: ${built.usedSteps.join(" + ")} — ${Math.round((v / (m || 1)) * 100)}%`),
          });
          const o = res.byNode[built.saveNode]?.images?.[0] || res.byNode[built.saveNode]?.gifs?.[0];
          if (!o) throw new Error("No output produced.");
          // A Preview run's VHS_VideoCombine has save_output:false, so ComfyUI reports it
          // back with type "temp", not "output" — a hardcoded type=output 404s for it.
          // &t=Date.now() busts the browser's HTTP cache: a preview's counter resets
          // every backend restart (and VHS's own numbering can repeat), so two different
          // preview runs can share the exact same filename/subfolder/type — without this,
          // the SECOND (and every later) preview click just re-shows the FIRST run's
          // cached response, no matter what Start/End/effects actually changed.
          const url = `/view?filename=${encodeURIComponent(o.filename)}&subfolder=${encodeURIComponent(o.subfolder || "")}&type=${encodeURIComponent(o.type || "output")}&t=${Date.now()}`;
          // A Preview run's result file only covers [startS, endS) of the source clip — the
          // Compare viewer needs that same window on the ORIGINAL side too, or it plays the
          // whole untrimmed source against a few trimmed seconds (see openCompareViewer's
          // own range comment). A real/final Generate run covers the whole clip, same as
          // the original, so no range restriction there.
          showResultVideo(url, { final: true, compareRange: (!full && endS > startS) ? { start: startS, end: endS } : null });
          if (full) {
            // A full-range run (not a short preview) writes real metadata — spreads the
            // SOURCE clip's own full meta (prompt, seed, loras, everything) forward first,
            // same shape the gallery's own post-process tools use (writePostMeta in
            // ui_gallery_ltx25.js), so Reuse/the bottom-left info strip pick it up; only
            // then overwrite created/postProcess/postSource and recompute geometry/fps for
            // whatever the job actually produced (an upscale/resize step changes those).
            try {
              const patched = {
                ...(state.ppSourceFullMeta || {}),
                created: Date.now(), postProcess: built.usedSteps.join(" + "), postSource: state.ppSource,
              };
              delete patched.elapsedSec;
              delete patched.sourceW; delete patched.sourceH;
              try {
                const oi = await getVideoInfo(o.filename, o.subfolder || "", "output");
                if (oi?.width || oi?.height) {
                  const srcW = state.ppSourceMeta?.w, srcH = state.ppSourceMeta?.h;
                  if ((oi.width && oi.width !== srcW) || (oi.height && oi.height !== srcH)) {
                    patched.sourceW = srcW; patched.sourceH = srcH;
                  }
                  if (oi.width)  patched.w = oi.width;
                  if (oi.height) patched.h = oi.height;
                }
                if (oi?.frames) { patched.frames = oi.frames; patched.durationSeconds = oi.frames / (oi.fps || FPS); }
                if (oi?.fps)    patched.fps = oi.fps;
              } catch { /* keep the source geometry rather than fail */ }
              await saveMeta(o.filename, o.subfolder || (state.saveSubfolder || SUBFOLDER), patched);
            } catch {}
          }
          setStatus(`✓ Postprocess done (${built.usedSteps.join(" + ")})${full ? "" : " — preview only, not saved to the gallery"}.`);
          showPopup(full ? "Postprocess finished — the new file is in the gallery."
            : "Preview ready — compare it, then hit ▶ Generate to produce and save the full clip.", false);
        } catch (e) {
          setStatus(`Error: ${e?.message || e}`);
          showPopup(e?.message || String(e), true);
        } finally {
          hideBusyBanner();
          ppRunning = false;
          ppGenBtn.disabled = false; ppGenBtn.textContent = "▶ Generate"; ppGenBtn.style.opacity = "1";
          ppPreviewBtn.disabled = false; ppPreviewBtn.textContent = "Preview"; ppPreviewBtn.style.opacity = "1";
          try { await freeMemory(); } catch {}
        }
      }

      function renderLeft() {
        // Every control in this column re-runs renderLeft(), which rebuilds the whole
        // panel — and a rebuilt scroll container starts back at the top. Ticking one
        // checkbox halfway down therefore threw you back to Canvas and you had to scroll
        // down again for the next one. Remember where the column was and put it back
        // after the rebuild; the browser clamps for us if the new content is shorter.
        if (state.generationMode === "postprocess") { renderPostprocessLeft(); return; }
        const prevScroll = leftPanel.scrollTop;
        const contModes = continuityModesFor(state.generationMode, state);
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
        if ((reason = h3OptimizerBlockedReason(state.h3Optimizer, state.turboMode, state.attnBackend, state.attnForward))) {
          // Only the sparse stage is ever blocked — fall back to plain Memory Opt, not off.
          force("H3 optimizer", state.h3Optimizer, "memory", reason);
          state.h3Optimizer = "memory";
          persist();
        }
        if (forced.length) {
          console.warn("[MMH3] pipeline selections overruled:\n  " + forced.join("\n  "));
          showPopup("Pipeline changed automatically — " + forced.join(" · "), true);
        }

        // resolution
        canvasAcc = accordion("canvas", "Canvas", `${state.aspect} · ${state.megapixels ?? 1.0} MP`, () => [
          row([
            col([label("Aspect"), select(ASPECTS.map(a => ({ value: a.label, label: a.label })), state.aspect,
              v => { state.aspect = v; persist(); refreshPlan(); })]),
            col([label("Megapixels"), (() => {
              const f = numberField(state.megapixels ?? 1.0,
                v => { state.megapixels = Math.max(0.1, v); persist(); refreshPlan(); }, 0.1);
              return f;
            })()]),
          ]),
        ]);
        leftPanel.appendChild(canvasAcc);

        // length — total is computed from the prompts, so there is nothing to type here
        planLine  = el("div", { style: { fontSize: "11px", lineHeight: "1.65", color: C.text } });
        totalLine = el("div", { style: {
          textAlign: "center", padding: "6px 0 2px", lineHeight: "1.1",
          borderBottom: `1px solid ${C.border}`, marginBottom: "5px",
        }});
        const planNow = currentPlan();
        clipLenAcc = accordion("cliplen", "Clip length",
          `${planNow.clipSec.toFixed(2)}s × ${planNow.count} · ${(planNow.isOneTakeStitched && planNow.count > 1 ? planNow.stitchedSeconds : planNow.actualSeconds).toFixed(2)}s total`,
          () => [
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
        ], "Length follows the prompts: one prompt is one clip. Add a "
          + "prompt (or split the brief into shots) to make the piece longer. Each clip is "
          + "saved on its own; combine them afterwards from 🖼 Gallery → 🔗 Stitch.");
        leftPanel.appendChild(clipLenAcc);
        refreshPlan();

        // images (mode-specific) — right after Preset, since picking a preset and
        // then supplying the images it needs is the natural next step.
        const imgPanel = mountImagePanel(state, ctx);
        const imgCount = state.generationMode === "reference"
          ? (state.refImages || []).filter(Boolean).length
          : [state.firstFrameImage, state.lastFrameImage].filter(Boolean).length;
        const libOn = assetRefActive(state.assetRef, state.generationMode);
        leftPanel.appendChild(accordion("images", "Images",
          state.generationMode === "t2v" ? "Text only" : (libOn ? "Asset Library" : imgCount ? `${imgCount} set` : "None"),
          () => [imgPanel.el]));

        const loraOn = (state.loras || []).filter(l => l && l.enabled !== false && l.name && l.name !== "none").length;
        leftPanel.appendChild(accordion("lora", "LoRA", loraOn ? `${loraOn} active` : "None",
          () => [mountLoraPanel()]));

        // Deblur and Upscale share one accordion because they run back to back on the same
        // frames, but they are independent settings: either can be None. Deblur is listed
        // first because that is the order they execute in.
        const deblurNow = state.deblurStrength || "none";
        const upNow = (UPSCALE_MODES.find(m => m.key === state.upscaleMode) || {}).label || "None";
        leftPanel.appendChild(accordion("upscale", "Upscale",
          deblurNow === "none" ? upNow : `Deblur ${deblurNow} → ${upNow}`,
          () => [
            col([labelHelp("Deblur (before upscale)", "Sharpens soft or motion-blurred frames at "
              + "the clip's own resolution — it never changes the size. Runs before whichever "
              + "upscale is set below, and works with Upscale set to None."), select(
              [{ value: "none", label: "None" }, { value: "LOW", label: "Low" },
               { value: "MEDIUM", label: "Medium" }, { value: "HIGH", label: "High" },
               { value: "ULTRA", label: "Ultra" }],
              deblurNow, v => { state.deblurStrength = v; persist(); renderLeft(); })]),
            deblurNow !== "none" && !ctx.availability?.TJ_RTXDeblur
              ? el("div", { html: "⚠ <code>TJ_RTXDeblur</code> not installed — restart ComfyUI after updating this pack.",
                  style: { fontSize: "10px", color: C.warn, lineHeight: "1.5" } })
              : null,
            col([label("Upscale"), select(UPSCALE_MODES.map(m => ({ value: m.key, label: m.label })),
              state.upscaleMode, v => { state.upscaleMode = v; persist(); renderLeft(); })]),
            state.upscaleMode === "rtx" ? col([
              col([label("Quality"), select(["LOW","MEDIUM","HIGH","ULTRA"].map(q => ({ value: q, label: q })),
                state.rtxQuality || "ULTRA", v => { state.rtxQuality = v; persist(); })]),
              ...(() => {
                // Same 4 size-input modes as LTX Upscale's own RTX VSR panel — see
                // computeRtxTarget in core_ltx25.js for what each one does.
                const MODES = [["scale", "Scale (×)"], ["short", "Short"], ["long", "Long"], ["wh", "W×H"]];
                const modeNow = state.rtxSizeMode || "scale";
                const modeRow = el("div", { style: { display: "flex", gap: "4px" } },
                  MODES.map(([k, lbl]) => {
                    const active = k === modeNow;
                    const b = el("button", { type: "button", text: lbl, style: {
                      cursor: "pointer", fontFamily: "inherit", fontSize: "10px", padding: "4px 9px",
                      borderRadius: "5px", fontWeight: active ? "700" : "400",
                      background: active ? BRAND : C.bg2, color: "#fff",
                      border: `1px solid ${active ? BRAND : C.border}`,
                    }});
                    b.addEventListener("click", () => { state.rtxSizeMode = k; persist(); renderLeft(); });
                    return b;
                  }));
                const out = [col([label("Size"), modeRow])];
                if (modeNow === "scale") {
                  out.push(col([label("Scale (×)"), numberField(state.rtxScale ?? 2,
                    v => { state.rtxScale = Math.max(1, v); persist(); }, 0.5)]));
                } else if (modeNow === "short" || modeNow === "long") {
                  const key = modeNow === "short" ? "rtxShort" : "rtxLong";
                  out.push(col([label(`${modeNow === "short" ? "Short" : "Long"} side (px)`),
                    numberField(state[key] ?? (modeNow === "short" ? 1080 : 1920),
                      v => { state[key] = Math.max(8, Math.round(v)); persist(); }, 8)]));
                } else {
                  out.push(row([
                    col([label("Width"), numberField(state.rtxW ?? 1920,
                      v => { state.rtxW = Math.max(8, Math.round(v)); persist(); }, 8)]),
                    col([label("Height"), numberField(state.rtxH ?? 1080,
                      v => { state.rtxH = Math.max(8, Math.round(v)); persist(); }, 8)]),
                  ]));
                  out.push(col([label("Crop anchor"), select(
                    ["center", "left", "right", "top", "bottom"].map(a => ({ value: a, label: a[0].toUpperCase() + a.slice(1) })),
                    state.rtxCropAnchor || "center", v => { state.rtxCropAnchor = v; persist(); })]));
                }
                return out;
              })(),
            ]) : null,
            // FlashVSR (lihaoyun6/ComfyUI-FlashVSR-Ultra-Fast) — only 8 fields are exposed;
            // the rest of FlashVSRInitPipe/FlashVSRNodeAdv is fixed at the shipped API
            // workflow's own values (see buildFlashVSR in graph_builder_ltx25.js).
            state.upscaleMode === "flashvsr" ? col([
              row([
                col([label("Model"), select(FLASHVSR_MODELS.map(m => ({ value: m, label: m })),
                  state.flashvsrModel || "FlashVSR-v1.1", v => { state.flashvsrModel = v; persist(); })]),
                col([label("Mode"), select(FLASHVSR_MODES.map(m => ({ value: m, label: m })),
                  state.flashvsrMode || "tiny", v => { state.flashvsrMode = v; persist(); })]),
              ]),
              row([
                col([label("Scale (×)"), numberField(state.flashvsrScale ?? 2,
                  // FlashVSRNodeAdv's own `scale` is an INT combo, 2-4 only.
                  v => { state.flashvsrScale = Math.min(4, Math.max(2, Math.round(v))); persist(); }, 1)]),
                col([labelHelp("Tile size", "Set for a 16GB card at 2× — 384px tiles measured "
                  + "~7m30s per clip. 3× is possible by dropping this to 256px, measured ~18min "
                  + "per clip. A larger tile uses more VRAM; a smaller one trades VRAM for time."),
                  numberField(state.flashvsrTileSize ?? 384,
                    // FlashVSRNodeAdv's own range: 32-1024, step 32.
                    v => { state.flashvsrTileSize = Math.min(1024, Math.max(32, Math.round(v))); persist(); }, 32)]),
              ]),
              row([
                col([label("Tile overlap"), numberField(state.flashvsrTileOverlap ?? 32,
                  // FlashVSRNodeAdv's own range: 8-512, step 8.
                  v => { state.flashvsrTileOverlap = Math.min(512, Math.max(8, Math.round(v))); persist(); }, 8)]),
                col([label("Seed"), numberField(state.flashvsrSeed ?? 42,
                  v => { state.flashvsrSeed = v; persist(); }, 1)]),
              ]),
              row([
                col([label("Seed control"), select(
                  [{ value: "randomize", label: "Random" }, { value: "fixed", label: "Fixed" },
                   { value: "increment", label: "+1" }, { value: "decrement", label: "-1" }],
                  state.flashvsrSeedMode || "fixed", v => { state.flashvsrSeedMode = v; persist(); })]),
              ]),
              checkboxRow("Color fix", state.flashvsrColorFix !== false,
                v => { state.flashvsrColorFix = v; persist(); }),
              el("div", { text: `Currently set for a 16GB card at ${state.flashvsrScale ?? 2}× / `
                  + `${state.flashvsrTileSize ?? 384}px tiles — the shipped default (2× / 384px) `
                  + `measured ~7m30s per clip; 3× (tile 256px) measured ~18min. No live preview `
                  + `during this pass — the preview box shows a waiting banner instead.`,
                style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } }),
              !ctx.availability?.FlashVSRNodeAdv ? el("div", {
                html: "⚠ <code>FlashVSRInitPipe</code>/<code>FlashVSRNodeAdv</code> not installed "
                  + "— install ComfyUI-FlashVSR-Ultra-Fast and restart ComfyUI.",
                style: { fontSize: "10px", color: C.warn, lineHeight: "1.5" } }) : null,
            ]) : null,
            // Only meaningful once deblur or upscale is actually doing something — off it
            // just saves the final clip, on it saves the raw decode as a second file too.
            (deblurNow !== "none" || state.upscaleMode !== "none")
              ? checkboxRow("Also save the clip before deblur / upscale",
                  !!state.saveUnprocessed,
                  v => { state.saveUnprocessed = v; persist(); },
                  { title: "Keeps the un-processed clip as a separate `_raw` file in the gallery. It never joins a stitch or the last-frame chain." })
              : null,
          ]));

        leftPanel.appendChild(accordion("continuity", "Continuity",
          (contModes.find(m => m.key === state.continuityMode) || {}).label || "None",
          () => {
            const contHint = (contModes.find(m => m.key === state.continuityMode) || {}).hint || "";
            const rows = [
              col([labelHelp("Continuity between clips",
                  [contHint, "One prompt renders one clip. To make a longer piece that holds together, split the brief into shots — each shot becomes a clip and continuity carries the look forward."]
                    .filter(Boolean).join("\n\n")),
                select(
                contModes.map(m => ({ value: m.key, disabled: m.disabled,
                  label: m.disabled ? `${m.label} — ${m.reason}` : m.label })),
                state.continuityMode, v => { state.continuityMode = v; persist(); renderLeft(); })]),
            ];
            return rows;
          }));

        leftPanel.appendChild(accordion("sampling", "Sampling",
          `${state.ltxGenSampler || "euler_ancestral"} · ${state.ltxGenSteps ?? 12} steps`,
          () => [
            row([
              col([label("Sampler"), select(LTX_SAMPLERS.map(x => ({ value: x, label: x })),
                state.ltxGenSampler || "euler_ancestral", v => { state.ltxGenSampler = v; persist(); renderLeft(); })]),
              col([label("Scheduler (stage 1)"), select(LTX_SCHEDULERS.map(x => ({ value: x, label: x })),
                state.ltxGenScheduler || "linear_quadratic", v => { state.ltxGenScheduler = v; persist(); })]),
            ]),
            row([
              col([label("Stage 1 steps"), numberField(state.ltxGenSteps ?? 12,
                v => { state.ltxGenSteps = Math.max(1, Math.round(v)); persist(); renderLeft(); }, 1)]),
              col([label("CFG"), numberField(state.ltxCfg ?? 1, v => { state.ltxCfg = v; persist(); }, 0.1)]),
            ]),
            col([label("Stage 2 sigmas"), (() => {
              const i = el("input", { type: "text", style: {
                width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text,
                border: `1px solid ${C.border}`, borderRadius: "6px", padding: "6px",
                fontSize: "12px", fontFamily: "inherit", outline: "none" } });
              i.value = state.ltxStage2Sigmas || "";
              i.addEventListener("input", () => { state.ltxStage2Sigmas = i.value; persist(); });
              return i;
            })()]),
            el("div", { text: "Stage 1 renders at half size; the latent upscaler doubles it and stage 2 refines it with the sigmas above.",
              style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } }),
          ]));

        useBottomWrap(seedGenWrap);
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

      // Every mode shares one fixed bottom slot in leftOuter — normally seedGenWrap
      // (Seed/Mode + Generate/Stop), but Postprocess swaps in ppPreviewWrap instead (no
      // seed/mode, a preview-range + Preview button in their place). Whichever wrap isn't
      // wanted this render has to be explicitly detached first, since appendChild alone
      // only guarantees the WANTED one ends up attached — the other stays put if it was
      // never removed, and both would show at once.
      function useBottomWrap(wrap) {
        if (seedGenWrap.parentNode && seedGenWrap !== wrap) seedGenWrap.parentNode.removeChild(seedGenWrap);
        if (ppPreviewWrap.parentNode && ppPreviewWrap !== wrap) ppPreviewWrap.parentNode.removeChild(ppPreviewWrap);
        leftOuter.appendChild(wrap);
      }

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
          v: 2,
          node: "ltx25",
          prompt: String(promptText || ""),
          promptHeader: st.promptHeader || "",
          w: width, h: height,
          mode: st.generationMode || "t2v",
          aspect: st.aspect,
          megapixels: st.megapixels,
          frames: st.clipFrames,
          steps: st.ltxGenSteps,
          sampler: st.ltxGenSampler,
          scheduler: st.ltxGenScheduler,
          stage2Sigmas: st.ltxStage2Sigmas,
          cfg: st.ltxCfg,
          distilledLora: st.distilledLoraOn && st.distilledLora ? { name: st.distilledLora, strength: st.distilledLoraStrength ?? 0.5 } : null,
          // The pictures the clip was built from: without them Reuse brings back the prompt and the settings but not the clip.
          firstFrameImage: st.firstFrameImage || null,
          lastFrameImage:  st.lastFrameImage  || null,
          // Library assets / project the clip used (Asset tab). null = the clip used the file slots.
          assetRef: st.assetRef ? { ...st.assetRef, ids: [...(st.assetRef.ids || [])] } : null,
          seed: st.seed,
          created: Date.now(),
          ...extra,
        };
      }

      // metaForVideo()'s w/h come from resolveResolution() — the pre-decode size. An inline
      // deblur/upscale (or a stitch re-encode) makes the real file differ, so probe what
      // actually landed and correct w/h/fps in place. On a size change the pre-op size is
      // kept as sourceW/H — the same shape the gallery post-process (writePostMeta) writes,
      // so the ⓘ tooltip and Reuse read one field set either way. `keepFrames` is for the
      // One-Take path, whose durationSeconds is computed with the overlap trim already.
      async function reconcileGeometry(meta, file, { keepFrames = false, noSource = false } = {}) {
        try {
          const oi = await getVideoInfo(file.filename, file.subfolder || "", file.type || "output");
          if (!oi || (!oi.width && !oi.height && !oi.frames)) return meta;
          // noSource: the file IS the original (the "_raw" un-processed clip) — record its
          // real dimensions, never treat a difference from meta.w as a pre-op size.
          if (!noSource && ((oi.width && oi.width !== meta.w) || (oi.height && oi.height !== meta.h))) {
            meta.sourceW = meta.w;
            meta.sourceH = meta.h;
          }
          if (oi.width)  meta.w = oi.width;
          if (oi.height) meta.h = oi.height;
          if (oi.fps)    meta.fps = oi.fps;
          if (!keepFrames && oi.frames) {
            meta.frames = oi.frames;
            meta.durationSeconds = oi.frames / (oi.fps || FPS);
          }
        } catch { /* keep the computed geometry rather than fail the run */ }
        return meta;
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
        // Temperature separates "this configuration is genuinely slow" from "this run was
        // spilling the whole time", which elapsed seconds alone cannot. Measured on this
        // card: idle sits at ~52C, real sampling runs 58-80C. So 58 is the floor of doing
        // work, not 60 — a run held at 58-59C is computing, and calling that a spill would
        // throw away a valid row.
        const WORKING_C = 58;
        let tempMax = 0, powerMax = 0, tempSamples = 0, tempIdle = 0;
        const tick = async () => {
          const d = await getVramStats();
          if (!d || !d.ok) return;
          samples++;
          if (typeof d.vramFreeMiB === "number") vramFreeMin = Math.min(vramFreeMin, d.vramFreeMiB);
          if (typeof d.vramUsedMiB === "number") vramUsedMax = Math.max(vramUsedMax, d.vramUsedMiB);
          if (typeof d.ramFreeMiB === "number")  ramFreeMin  = Math.min(ramFreeMin, d.ramFreeMiB);
          if (typeof d.gpuTempC === "number") {
            tempSamples++;
            tempMax = Math.max(tempMax, d.gpuTempC);
            if (d.gpuTempC < WORKING_C) tempIdle++;
          }
          if (typeof d.gpuPowerW === "number") powerMax = Math.max(powerMax, d.gpuPowerW);
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
              gpuTempMaxC:    tempMax || null,
              gpuPowerMaxW:   powerMax || null,
              // Share of the run spent below the temperature that means real compute.
              // High here on a clip that still finished is the signature of a slow spill
              // rather than a configuration that is simply expensive.
              gpuIdlePct:     tempSamples ? Math.round((tempIdle / tempSamples) * 100) : null,
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
          // Only Image to Video takes the panel's frames; Director places its images on the timeline.
          const framesFromPanel = rs.generationMode === "firstlast";
          let chainFrame = resume ? resume.chainFrame : (framesFromPanel ? (rs.firstFrameImage || null) : null);
          const clipTimes = [];
          const startPos = resume ? resume.pos : 0;

          // Snapshot enough to continue this exact run from `pos` after a reload. Cleared
          // on a clean finish, a manual Stop, or an error — resuming is only for "the page
          // reloaded while this was still actively running," never for restarting a run
          // the user (or an error) already ended on purpose.
          function saveRelay(pos) {
            state._relay = {
              pos, totClip, activeIdx: active.map(a => a.i),
              chainFrame, clipRecords: clipRecords.slice(), runState: rs,
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
            const libFrames = flLibrarySource(rs);   // First/Last from the Asset Library: file frames stay out
            let firstFrame = (!framesFromPanel || libFrames) ? null : (rs.firstFrameImage || null);
            let refImages  = rs.refImages || [];
            const continued = pos > 0 && rs.continuityMode === "lastframe" && !!chainFrame;
            if (pos > 0) firstFrame = continued ? chainFrame : null;

            // Per-prompt first-image override (A3) beats the continuity default outright.
            // Like Last Frame Chain, only FL2VA accepts a first frame, so a clip with an
            // override is forced to FL2VA even in Reference mode — the reference images
            // drop out for that clip, same rule as the chained case above.
            const override = promptFirstFrame(rs.prompts[i]);
            let overridden = false;
            if (override) { firstFrame = override; refImages = []; overridden = true; }

            // Per-clip reference override. One resolver decides which set a clip renders
            // with (clipAssets), and its answer is written straight into the snapshot the
            // graph builder reads — so the builder, the editor and the saved metadata can
            // never disagree about which images a clip actually used.
            const assets = clipAssets(rs, i);
            if (assets.own && !continued) {
              refImages = assets.refImages;
              if (assets.firstFrame) { firstFrame = assets.firstFrame; overridden = true; }
            }

            const modeForClip = (continued || overridden) ? "firstlast" : rs.generationMode;

            const clipState = { ...rs, generationMode: modeForClip, clipFrames: clipFramesFor(rs, i) };
            // Library assets / project of this clip (its own when overriding, else the node's). A
            // chained clip starts from the previous clip's last frame, so a library First frame
            // does not apply to it.
            clipState.assetRef = (framesFromPanel || assets.own) && assets.assetRef
              ? { ...assets.assetRef, first: continued ? null : assets.assetRef.first }
              : null;
            if (assets.own) {
              clipState.refImages      = assets.refImages;
              clipState.refImagesMp    = assets.refImagesMp;
              clipState.firstFrameImage = assets.firstFrame || null;
              clipState.lastFrameImage  = assets.lastFrame || null;
              clipState.refVideos      = assets.refVideos;
              clipState.refAudios      = assets.refAudios;
            }
            // First / Last frames picked from the Asset Library become files in the input folder.
            let libLast = null;
            if (clipState.assetRef && (clipState.assetRef.first || clipState.assetRef.last)) {
              const files = await ctx.assetFrameFiles(clipState.assetRef);
              if (files.first && !continued) firstFrame = files.first;
              libLast = files.last || null;
            }
            const restore = pipeOv ? applyOverridesTemp(clipState, pipeOv.overrides) : null;
            const fvsrOn = clipState.upscaleMode === "flashvsr";
            const hiresOn = hiresActive(clipState, ctx.availability);
            const progressNodes = [NODE_IDS.sampler, ...(hiresOn ? [NODE_IDS.hrSampler] : []), ...(fvsrOn ? [NODE_IDS.fvsr] : [])];
            const onClipProgress = (v, m, nodeId) => {
              if (nodeId === NODE_IDS.hrSampler) hiresBanner.style.display = "flex";
              else if (nodeId === NODE_IDS.fvsr) setFlashVSRProgress(v, m);
              else { fvsrBanner.style.display = "none"; hiresBanner.style.display = "none"; setStepProgress(v, m); }
            };
            let res;
            let mem = null;   // memory watcher for this clip; see watchMemory()
            // What the graph builder actually wired — sampler, effective step count and the
            // turbo weights. Turbo overrides the panel's sampler and steps, so recording the
            // panel's copies makes two runs look like the same work when they were not. Left
            // null on the resume path, where this clip's graph was built before the reload.
            let ran = null;
            if (resume && pos === startPos && resume.inFlightPromptId) {
              // This exact clip was already queued before the reload — reconnect to it
              // instead of building and submitting a second copy.
              restore?.();
              setStatus(`Clip ${curClip}/${totClip} · reconnecting to in-flight render…`);
              res = await waitForHistory(resume.inFlightPromptId, {
                onProgress: onClipProgress,
                samplerNode: progressNodes,
              });
            } else {
              let built;
              try {
                const useDir = rs.generationMode === "director";
                if (useDir) await ctx.syncClipDir?.(i, clipState.clipFrames);
                built = buildClipGraph(clipState, ctx.availability, {
                  dir: (useDir && typeof rs.prompts[i] === "object" ? rs.prompts[i].dir : null) || null,
                  nodeId: self.id,
                  promptText: promptForClip(i, rs),
                  seed: seedForClip(i, rs),
                  firstFrame,
                  lastFrame: libLast || ((framesFromPanel && pos === active.length - 1 && !libFrames) ? (rs.lastFrameImage || null) : null),
                  refImages,
                  clipIndex: i,
                  saveLastFrame: true,
                  // Tail previews exist only so the relay can step back past a fade to
                  // black when picking a chain frame — dead weight (and eight temp PNGs
                  // per clip) in every other continuity mode.
                  saveTailPreviews: rs.continuityMode === "lastframe",
                });
              } finally { restore?.(); }
              ran = built.meta;

              setStatus(`Clip ${curClip}/${totClip} · queued`);
              // Watch memory for the length of the clip. A render that runs out of VRAM
              // does not fail on Windows — the driver spills to system RAM, then to the
              // pagefile, and the only symptom is steps taking tens of times longer. That
              // is indistinguishable from a hang once it is over, so the extremes are
              // recorded while it happens and saved with the clip.
              mem = watchMemory();
              try {
                res = await queuePrompt(built.graph, {
                  onProgress: onClipProgress,
                  samplerNode: progressNodes,
                });
              } finally { mem.stop(); }
            }
            fvsrBanner.style.display = "none"; hiresBanner.style.display = "none";

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
              const clipMeta = metaForVideo(promptForClip(i, rs), {
                clip: curClip, clips: plan.count, seed: seedForClip(i, rs), mode: modeForClip,
                // the editable source text and the clip's segment timeline, so "reuse" restores the editor exactly
                prompts: [promptText(rs.prompts?.[i])],
                dir: (typeof rs.prompts?.[i] === "object" ? rs.prompts[i].dir : null) || null,
                chained: continued,
                // the measured time it took (see refreshAvgFromHistory)
                elapsedSec,
                // What the graph actually ran, as opposed to what the panel was showing.
                ...(ran ? {
                  stepsEffective: ran.steps,
                  samplerUsed:    ran.samplerUsed,
                  // Post-decode frame ops wired into this clip's graph (null when not run).
                  deblur:  ran.deblur  || null,
                  upscale: ran.upscale || null,
                  hires:   ran.hires   || null,
                } : {}),
                // Memory extremes over this clip. vramFreeMinMiB near zero is the signature of a spill:
                // the step times balloon and nothing errors.
                ...(memPeak || {}),
                loras: (rs.loras || []).map(l => ({
                  name: l.name || "none", strength: l.strength ?? 1.0,
                  triggerWord: l.triggerWord || "", enabled: l.enabled !== false,
                })),
              }, rs);
              // The library set this clip actually rendered with (its own when overriding), not
              // the node's common one metaForVideo() reads from `rs`.
              clipMeta.assetRef = clipState.assetRef ? { ...clipState.assetRef, ids: [...(clipState.assetRef.ids || [])] } : null;
              clipMeta.frames = clipState.clipFrames;   // this clip's own length, not the global one
              // An inline upscale changes the frame size metaForVideo() can't predict, so
              // re-probe the file. Deblur alone never resizes — skip the round trip for it.
              if (ran?.upscale || ran?.hires) await reconcileGeometry(clipMeta, vid);
              saveMeta(vid.filename, vid.subfolder || "", clipMeta);

              // "Save the un-processed clip too" — the second file the graph wrote straight
              // off the decode. Its own sidecar (no deblur/upscale marker, its own real
              // size), shown in the gallery like any clip, but it never joins the stitch or
              // the last-frame chain — the processed clip above stays the real one.
              const rawVid = ran?.rawVideoNode ? firstOutput(res.byNode, ran.rawVideoNode) : null;
              if (rawVid) {
                const rawMeta = { ...clipMeta,
                  deblur: null, upscale: null, unprocessed: true,
                  processedSibling: vid.filename,
                };
                // clipMeta was reconciled to the UPSCALED size — the raw clip is the
                // decode's own resolution, no pre-op size.
                delete rawMeta.sourceW; delete rawMeta.sourceH;
                const rr = resolveResolution(rs.aspect, rs.megapixels);
                rawMeta.w = rr.width; rawMeta.h = rr.height;
                await reconcileGeometry(rawMeta, rawVid, { noSource: true });
                saveMeta(rawVid.filename, rawVid.subfolder || "", rawMeta);
              }
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

          // Clips are kept separate so a stopped run never leaves a half-built file. The exception is Last Frame
          // Chain: every clip after the first opens on the previous clip's last frame, so a completed run is joined
          // with that one repeated frame trimmed.
          if (rs.continuityMode === "lastframe" && !stopRequested && clipRecords.length > 1) {
            const trimSec = 1 / FPS;
            setStatus(`Stitching ${clipRecords.length} clips…`);
            try {
              const folder = (rs.saveSubfolder || SUBFOLDER).replace(/\\/g, "/");
              const out = await stitchClips(clipRecords, `${folder}/${rs.filenamePrefix || "LTX25"}_full`, null, trimSec, null);
              const url = `/view?filename=${encodeURIComponent(out.filename)}&subfolder=${encodeURIComponent(out.subfolder || "")}&type=output&t=${Date.now()}`;
              // `frames` of metaForVideo is per clip; durationSeconds carries this file's real length
              const totalSeconds = active.slice(0, clipRecords.length).reduce((sum, { i }) => sum + clipSecondsFor(rs, i), 0)
                - (clipRecords.length - 1) * trimSec;
              const fullMeta = metaForVideo(
                active.map(({ i }) => promptForClip(i, rs)).join("\n\n"),
                { clips: clipRecords.length, stitched: true, chained: true, frames: null, durationSeconds: totalSeconds,
                  prompts: (rs.prompts || []).map(promptText), dirs: (rs.prompts || []).map(q => (typeof q === "object" ? q.dir : null) || null) },
                rs,
              );
              await reconcileGeometry(fullMeta, out, { keepFrames: true });
              saveMeta(out.filename, out.subfolder || "", fullMeta);
              showResultVideo(url, { final: true });
              badge.textContent = `FULL · ${clipRecords.length} clips`;
              await setLastResult(self.id, { videoPath: out.path });
              setStatus(`Done — ${clipRecords.length} clips stitched → ${out.filename}`);
              showPopup(`Stitched: ${out.filename}`, false);
            } catch (e) {
              setStatus(`Clips saved, stitch failed: ${e.message}`);
              showPopup(`Stitch failed: ${e.message} — per-clip files are still on disk.`, true);
            }
          } else if (rs._extendFrom && clipRecords.length === 1 && !stopRequested) {
            // Gallery Extend: one continuation clip was rendered from the source's last
            // frame — concat [source, continuation] into the extended video, trimming the
            // one duplicated seed frame off the continuation's head. Read from the frozen
            // snapshot: the live state is repainted back to the panel during the run.
            const ext = rs._extendFrom;
            setStatus("Stitching the extended clip…");
            try {
              const folder = (rs.saveSubfolder || SUBFOLDER).replace(/\\/g, "/");
              const trimSec = 1 / FPS;   // the one repeated seed frame
              const out = await stitchClips(
                [ext.clip, clipRecords[0]], `${folder}/${rs.filenamePrefix || "LTX25"}_full`, null, trimSec, null,
              );
              const url = `/view?filename=${encodeURIComponent(out.filename)}&subfolder=${encodeURIComponent(out.subfolder || "")}&type=output&t=${Date.now()}`;
              const clipPrompts = [ext.sourcePrompt || "", promptForClip(0, rs)];
              const extendMeta = metaForVideo(
                composeStitchedPrompt(clipPrompts),
                { clips: 2, stitched: true, extended: true, frames: null, prompts: clipPrompts },
                rs,
              );
              await reconcileGeometry(extendMeta, out);
              saveMeta(out.filename, out.subfolder || "", extendMeta);
              showResultVideo(url, { final: true });
              badge.textContent = "EXTENDED";
              await setLastResult(self.id, { videoPath: out.path });
              setStatus(`Done — extended → ${out.filename}`);
              showPopup(`Extended: ${out.filename}`, false);
            } catch (e) {
              setStatus(`Continuation saved, stitch failed: ${e.message}`);
              showPopup(`Extend stitch failed: ${e.message} — the new clip is on disk.`, true);
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
          fvsrBanner.style.display = "none"; hiresBanner.style.display = "none";
          delete state._extendFrom;   // one-shot: never let a stale flag stitch a later run
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
          // Truly idle now (nothing queued to hand off to) — Next Gen only makes sense
          // while a run is live to append behind, so hide it instead of leaving it sitting
          // there forever after the first Generate of the session.
          if (!queued) { stopWakeAudio(); stopQueueWatch(); nextGenBtn.style.display = "none"; }
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
      helpTop.appendChild(el("div", { text: "LTX 2.5 ONE STUDIO — Help", style: { color: "#fff", fontSize: "14px", fontWeight: "700", flex: "1" } }));
      helpTop.appendChild(button("✕", () => helpEl.style.display = "none", "danger"));
      helpEl.appendChild(helpTop);
      const helpBody = el("div", { style: { flex: "1", overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px" } });
      helpBody.className = "ltx25-lp";
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
      // Prompt Edit's Brief / Vision line opens the LLM pickers in a popup.
      ctx.openLlmQuickSettings = (onChange) => settingsOv.openLlmQuick(onChange);

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
        // each clip comes back with its own segment timeline
        const dirs = Array.isArray(meta.dirs) ? meta.dirs : [meta.dir];
        state.prompts = parts.map((t, k) => ({ text: String(t || ""), firstFrame: "", enabled: true, dir: dirs[k] || null }));
        if (Array.isArray(meta.prompts)) state.promptHeader = meta.promptHeader || "";
        persist();
        refreshPlan();
        promptEditOv?.syncCommon?.();
        renderPrompts();
        return true;
      };

      // Full "make this exact clip again" restore: the prompt and timeline plus every render setting saved with the
      // clip. Same seed on purpose - reproducing the clip is the point; switch Seed mode afterward for a variation.
      // A field an older clip never recorded is skipped rather than overwritten with a default.
      ctx.reuseAll = (meta) => {
        if (!ctx.reusePrompt(meta)) return false;
        if (meta.firstFrameImage !== undefined) state.firstFrameImage = meta.firstFrameImage || null;
        if (meta.lastFrameImage  !== undefined) state.lastFrameImage  = meta.lastFrameImage  || null;
        // the library choice comes back with the clip; a clip saved without one restores to the file slots
        state.assetRef = normalizeAssetRef(meta.assetRef);
        state.refSource = state.assetRef ? "library" : "files";
        if (meta.aspect) state.aspect = meta.aspect;
        if (meta.megapixels != null) state.megapixels = meta.megapixels;
        if (meta.frames) { state.clipFrames = meta.frames; state.clipLengthCustom = false; }
        if (meta.steps != null) state.ltxGenSteps = meta.steps;
        if (meta.sampler) state.ltxGenSampler = meta.sampler;
        if (meta.scheduler) state.ltxGenScheduler = meta.scheduler;
        if (meta.stage2Sigmas) state.ltxStage2Sigmas = meta.stage2Sigmas;
        if (meta.cfg != null) state.ltxCfg = meta.cfg;
        if (meta.distilledLora !== undefined) {
          state.distilledLoraOn = !!meta.distilledLora;
          if (meta.distilledLora) { state.distilledLora = meta.distilledLora.name; state.distilledLoraStrength = meta.distilledLora.strength; }
        }
        if (meta.seed != null) {
          state.seed = meta.seed; state.seedMode = "fixed";
          seedInput.value = meta.seed; seedModeDD.value = "fixed";
        }
        // Inline deblur / upscale the clip was made with. A gallery post-processed file (meta.postProcess) carries the
        // SOURCE's meta, and Reuse rebuilds that un-processed original, not the upscale-again.
        if (!meta.postProcess) {
          if (meta.deblur !== undefined) state.deblurStrength = meta.deblur || "none";
          if (meta.upscale === null) {
            state.upscaleMode = "none";
          } else if (meta.upscale && meta.upscale.method === "rtx") {
            state.upscaleMode = "rtx";
            if (meta.upscale.scale != null)   state.rtxScale   = meta.upscale.scale;
            if (meta.upscale.quality)         state.rtxQuality = meta.upscale.quality;
          } else if (meta.upscale && meta.upscale.method === "model") {
            state.upscaleMode = "model";
            if (meta.upscale.model)           state.upscaleModel = meta.upscale.model;
          }
        }
        if (Array.isArray(meta.loras)) state.loras = meta.loras.map(l => ({
          name: l.name || "none", strength: l.strength ?? 1.0,
          triggerWord: l.triggerWord || "", enabled: l.enabled !== false,
        }));
        persist();
        refreshPlan();
        renderLeft();
        return true;
      };

      // Gallery Extend — render one continuation clip from a finished clip's last frame,
      // then auto-stitch [source, continuation] into one longer video. All render settings
      // come from the source via reuseAll; the caller supplies only the new prompt + seed.
      ctx.runExtend = async ({ sourceClip, seedFrame, prompt, sourcePrompt }) => {
        if (running) { showPopup("A render is already running.", true); return; }
        if (!sourceClip || !seedFrame || !String(prompt || "").trim()) {
          showPopup("Extend needs a clip, a seed frame and a prompt.", true); return;
        }
        ctx.reuseAll(sourceClip.meta || sourceClip);   // best-effort; missing meta just leaves panel defaults
        // The continuation must match the source's real size or the stitch concat fails.
        // reuseAll covers it when the clip has meta; probe the file itself when it doesn't.
        try {
          const info = await getVideoInfo(sourceClip.filename, sourceClip.subfolder || "", "output");
          if (info?.width && info?.height) {
            state.megapixels = Math.max(0.1, Math.round(info.width * info.height / 1e4) / 100);
            const r = info.width / info.height;
            state.aspect = ASPECTS.reduce((best, a) =>
              Math.abs(a.w / a.h - r) < Math.abs(best.w / best.h - r) ? a : best).label;
          }
        } catch {}
        state.prompts = [{ text: String(prompt), firstFrame: seedFrame, enabled: true, override: false }];
        state.promptHeader = ""; state.promptFooter = "";
        state.generationMode = "firstlast";
        state.continuityMode = "none";
        // Extend always renders First/Last. If the source ran in Reference mode its turbo
        // files sit in the *reference* slots, which firstlast never reads — carry them over
        // so the continuation keeps the same accelerator instead of silently dropping it.
        if (!state.pddFile || state.pddFile === "none") state.pddFile = state.pddFileReference || state.pddFile;
        if (!state.turboLora || state.turboLora === "none") state.turboLora = state.turboLoraReference || state.turboLora;
        if (!generationModesFor(state).find(m => m.key === "firstlast")?.enabled) {
          showPopup("Set the First/Last UNET in ⚙ Settings → Models to use Extend.", true);
          return;
        }
        state._extendFrom = {
          clip: { filename: sourceClip.filename, subfolder: sourceClip.subfolder || "" },
          sourcePrompt: sourcePrompt || "",
        };
        persist(); renderPills(); renderLeft(); renderPrompts();
        runGeneration();
      };

      galleryOv = createGalleryOverlay(state, ctx);
      root.appendChild(galleryOv.el);
      document.body.appendChild(galleryOv.playerEl);   // fullscreen player lives above everything

      // Any reference-video picker (left panel media slots, Prompt Edit's per-clip slots)
      // opens this same gallery instead of a separate, badge-less grid of its own.
      ctx.pickVideoFromGallery = (onPick, opts) => galleryOv.showPicker(onPick, opts);

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

      self.addDOMWidget("ltx25_ui", "div", root, { serialize: false, computeSize: () => [NODE_MW, NODE_MH] });

      // Every panel, repainted from `state` — used after a workflow restores settings.
      self._ltx25Repaint = () => {
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
        renderDepBanner(av);
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
          clipRecords: saved.clipRecords,
          runState: saved.runState, inFlightPromptId,
        });
      })();

    };
  },
});

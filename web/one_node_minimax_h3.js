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
  el, clear, loadState, saveState, defaultState, randomSeed,
  CLIP_LENGTHS, ASPECTS, ACCEL_MODES, accelModesFor, UPSCALE_MODES,
  continuityModesFor, generationModesFor, configIssues,
  clipPlan, formatDuration, formatClock, framesToSeconds, resolveResolution,
  parseBrief, groupShots, composeClipPrompt,
  effectiveAccel, turboLoraForMode, explainGenerationError,
} from "./minimax/core_minimax.js";
import { panel, label, button, select, numberField, slider, row, col, modeBar, iconBtn, openFullscreen }
  from "./klein/ui_common.js";
import {
  queuePrompt, interrupt, freeMemory, setLastResult, stitchClips,
  copyOutputToInput, getNodeAvailability, getModels, saveMeta, pickChainFrame,
} from "./minimax/api_minimax.js";
import { buildClipGraph, NODE_IDS, previewNodeKey } from "./minimax/graph_builder_minimax.js";
import { createSettingsOverlay } from "./minimax/ui_app_settings_minimax.js";
import { mountImagePanel } from "./minimax/ui_images_minimax.js";
import { createPromptEditOverlay } from "./minimax/ui_prompt_edit_minimax.js";
import { createCommonPromptOverlay } from "./minimax/ui_common_prompt_minimax.js";
import { createGalleryOverlay } from "./minimax/ui_gallery_minimax.js";
import { resolvePipeOverrides, applyOverridesTemp } from "./shared/promptdb_pipe.js";

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
    nodeType.prototype.onConfigure = function () { this.size = [NODE_MW, NODE_MH]; };
    nodeType.prototype.onResize    = function () { this.size = [NODE_MW, NODE_MH]; };
    nodeType.prototype.getSlotMenuOptions = function () { return []; };

    nodeType.prototype._buildUI = function () {
      const self  = this;
      const state = defaultState(loadState());
      const persist = () => saveState(state);

      if (!document.getElementById("mmh3-styles")) {
        const s = document.createElement("style"); s.id = "mmh3-styles";
        s.textContent = `@keyframes mmh3-spin{to{transform:rotate(360deg)}}`
          + `.mmh3-lp::-webkit-scrollbar{width:5px}.mmh3-lp::-webkit-scrollbar-track{background:transparent}`
          + `.mmh3-lp::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px}`;
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
          if (!accelModesFor(key).some(m => m.key === state.accelMode)) state.accelMode = "solattn";
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
      fsBtn.addEventListener("click", () => { if (lastResultURL) openFullscreen(lastResultURL); });

      function showPreviewFrame(dataURL, mime) {
        placeholder.style.display = "none";
        resultVid.style.display = "none";
        if (mime === "video/mp4") {
          previewImg.style.display = "none";
          previewVid.src = dataURL;
          previewVid.style.display = "block";
          previewVid.play?.().catch(() => {});
        } else {
          previewVid.style.display = "none";
          previewImg.src = dataURL;
          previewImg.style.display = "block";
        }
        badge.style.display = "block";
      }
      function showResultVideo(url) {
        lastResultURL = url;
        placeholder.style.display = "none";
        previewImg.style.display = "none";
        previewVid.style.display = "none";
        resultVid.src = url;
        resultVid.style.display = "block";
        // Loaded and ready, but left paused — a clip finishing mid-run should not start
        // making noise on its own. The user presses play.
        try { resultVid.pause(); resultVid.currentTime = 0; } catch {}
        fsBtn.style.display = "block";
      }
      function resetPreview() {
        placeholder.style.display = "block";
        previewImg.style.display = "none";
        previewVid.style.display = "none";
        // hiding a playing <video> does not stop it
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
      statusWrap.append(statusLine, barOuter);

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

      function renderPrompts() {
        clear(promptList);
        const plan = currentPlan();
        promptCount.textContent = `(${plan.promptCount} prompt${plan.promptCount > 1 ? "s" : ""} → ${plan.count} clip${plan.count > 1 ? "s" : ""} · ${plan.actualSeconds.toFixed(2)}s)`;
        state.prompts.forEach((text, i) => {
          const line = el("div", { style: { display: "flex", gap: "4px", alignItems: "flex-start" } });
          const sideCol = el("div", { style: { width: "28px", flexShrink: "0", display: "flex", flexDirection: "column", gap: "2px", alignItems: "center", paddingTop: "5px" } });
          sideCol.appendChild(el("div", {
            text: `C${i + 1}`,
            style: { fontSize: "9px", fontWeight: "700", color: BRAND, whiteSpace: "nowrap" } }));

          const ta = el("textarea", { placeholder: i === 0 ? "Describe the shot…" : "(blank = reuse the previous prompt)", style: {
            flex: "1", minHeight: "120px", boxSizing: "border-box", background: C.bg2, color: C.text,
            border: `1px solid ${C.border}`, borderRadius: "6px", padding: "6px",
            fontSize: "12px", fontFamily: "inherit", outline: "none", resize: "vertical",
          }});
          ta.value = text || "";
          ta.addEventListener("input", () => { state.prompts[i] = ta.value; persist(); });
          ta.addEventListener("focus", () => ta.style.borderColor = BRAND);
          ta.addEventListener("blur",  () => ta.style.borderColor = C.border);

          const del = el("button", { type: "button", text: "✕", title: "Remove", style: {
            flexShrink: "0", cursor: "pointer", background: "transparent", color: C.muted,
            border: "none", fontSize: "11px", padding: "6px 2px",
          }});
          del.addEventListener("click", () => {
            if (state.prompts.length <= 1) state.prompts = [""];
            else state.prompts.splice(i, 1);
            persist(); refreshPlan();
          });
          line.append(sideCol, ta, del);
          promptList.appendChild(line);
        });
      }
      addBtn.addEventListener("click", () => {
        state.prompts.push("");
        persist(); refreshPlan();
      });
      splitBtn.addEventListener("click", () => {
        const joined = state.prompts.filter(p => p && p.trim()).join("\n\n");
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
        state.prompts = parts;
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
          totalLine.innerHTML =
            `<span style="font-size:20px;font-weight:700;color:${BRAND}">${p.actualSeconds.toFixed(2)}s</span>`
            + `<span style="font-size:11px;color:${C.muted}"> total</span>`;
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

      function checkboxRow(text, checked, onChange) {
        const chk = el("input", { type: "checkbox" });
        chk.checked = !!checked;
        chk.addEventListener("change", () => onChange(chk.checked));
        return el("label", { style: { display: "flex", alignItems: "center", gap: "6px",
          fontSize: "11px", color: C.text, cursor: "pointer" } }, [chk, el("span", { text })]);
      }

      function renderLeft() {
        const contModes = continuityModesFor(state.generationMode, state);
        // A continuity option that this mode does not offer, or whose model is
        // missing, must not stay selected. None is always available.
        const cur = contModes.find(m => m.key === state.continuityMode);
        if (!cur || cur.disabled) { state.continuityMode = "none"; persist(); }
        clear(leftPanel);

        // A saved state can hold an acceleration this mode doesn't offer (e.g. Turbo
        // carried over into Reference). Normalise here, not only on mode switch, so a
        // reloaded node can never sit on an option that isn't in its own dropdown.
        if (!accelModesFor(state.generationMode).some(m => m.key === state.accelMode)) {
          state.accelMode = "solattn";
          persist();
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
          select(CLIP_LENGTHS.map(c => ({ value: String(c.frames), label: c.label })),
            String(state.clipFrames), v => { state.clipFrames = parseInt(v, 10); persist(); refreshPlan(); }),
          totalLine,
          planLine,
          el("div", { text: "Length follows the prompts: one prompt is one clip. Add a prompt "
            + "(or split the brief into shots) to make the piece longer.",
            style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } }),
        ]));
        refreshPlan();

        // pipeline options — each accel mode's knobs render right under the dropdown so
        // switching modes never means a round-trip through the Settings modal.
        const accelNode = (ACCEL_MODES.find(m => m.key === state.accelMode) || {}).node;
        const accelMissing = accelNode && ctx.availability && Object.keys(ctx.availability).length
          && !ctx.availability[accelNode];
        leftPanel.appendChild(panel([
          label("Pipeline"),
          col([label("Acceleration"), select(accelModesFor(state.generationMode).map(m => ({ value: m.key, label: m.label })),
            state.accelMode, v => { state.accelMode = v; persist(); renderLeft(); })]),
          ...(accelMissing ? [el("div", {
            html: `⚠ <code>${accelNode}</code> not installed — this run will fall back to no acceleration.`,
            style: { fontSize: "10px", color: C.warn, lineHeight: "1.5" } })] : []),
          ...accelSettings(),
          col([label("Upscale"), select(UPSCALE_MODES.map(m => ({ value: m.key, label: m.label })),
            state.upscaleMode, v => { state.upscaleMode = v; persist(); renderLeft(); })]),
          ...(state.upscaleMode === "rtx" ? [row([
            col([label("RTX scale"), numberField(state.rtxScale ?? 2, v => { state.rtxScale = v; persist(); }, 0.5)]),
            col([label("Quality"), select(["LOW","MEDIUM","HIGH","ULTRA"].map(q => ({ value: q, label: q })),
              state.rtxQuality || "ULTRA", v => { state.rtxQuality = v; persist(); })]),
          ])] : []),
          col([label("Continuity between clips"), select(
            contModes.map(m => ({ value: m.key, disabled: m.disabled,
              label: m.disabled ? `${m.label} — UNET not set` : m.label })),
            state.continuityMode, v => { state.continuityMode = v; persist(); renderLeft(); })]),
          el("div", { text: (contModes.find(m => m.key === state.continuityMode) || {}).hint || "",
            style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } }),
          el("div", { text: "One prompt renders one clip. To make a longer piece that holds together, split the brief into shots — each shot becomes a clip and continuity carries the look forward.",
            style: { fontSize: "10px", color: C.muted, lineHeight: "1.5", marginTop: "2px" } }),
        ]));

        // Stitching is a per-run choice: sometimes you want the single assembled file,
        // sometimes you want the clips left alone to cut yourself.
        leftPanel.appendChild(panel([
          label("Output"),
          checkboxRow("Stitch clips into one file", state.stitchAtEnd !== false, v => {
            state.stitchAtEnd = v; persist(); renderLeft();
          }),
          ...(state.stitchAtEnd !== false ? [
            checkboxRow("Trim the tail to the planned length", !!state.trimLastClip, v => {
              state.trimLastClip = v; persist();
            }),
          ] : []),
          checkboxRow("Free VRAM between clips", state.unloadBetweenClips !== false, v => {
            state.unloadBetweenClips = v; persist();
          }),
          el("div", { text: state.stitchAtEnd !== false
              ? "Individual clips are always kept as well."
              : "Clips are saved separately — nothing is assembled.",
            style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } }),
        ]));

        // sampling steps live here too — they change per run far more often than the
        // rest of the sampler config, which stays in Settings.
        const turbo = state.accelMode === "turbo";
        leftPanel.appendChild(panel([
          label("Steps"),
          row([
            col([label(turbo ? "Turbo steps ●" : "Turbo steps"),
              numberField(state.turboSteps ?? 4, v => { state.turboSteps = Math.max(1, Math.round(v)); persist(); }, 1)]),
            col([label(turbo ? "Normal steps" : "Normal steps ●"),
              numberField(state.steps ?? 20, v => { state.steps = Math.max(1, Math.round(v)); persist(); }, 1)]),
          ]),
          el("div", { text: turbo ? "● Turbo steps are in use (Accel = Turbo LoRA)."
                                  : "● Normal steps are in use.",
            style: { fontSize: "10px", color: C.muted } }),
        ]));

        // images (mode-specific)
        const imgPanel = mountImagePanel(state, ctx);
        leftPanel.appendChild(imgPanel.el);

        // LoRA
        leftPanel.appendChild(mountLoraPanel());

        leftOuter.appendChild(seedGenWrap);
      }

      /** Tuning widgets for whichever acceleration mode is selected. */
      function accelSettings() {
        const n = (v, set, step = 0.05) => numberField(v, x => { set(x); persist(); }, step);
        switch (state.accelMode) {
          case "turbo": {
            const eff = effectiveAccel(state, ctx.availability);
            return [
              ...(eff.fellBack ? [el("div", { text: `⚠ ${eff.reason}`,
                style: { fontSize: "10px", color: C.warn, lineHeight: "1.5" } })] : []),
              row([
                col([label("Turbo strength"), n(state.turboLoraStrength ?? 1.0, v => state.turboLoraStrength = v)]),
                col([label("Low VRAM"), (() => {
                  const c = el("input", { type: "checkbox" });
                  c.checked = !!state.turboLoraLowVram;
                  c.addEventListener("change", () => { state.turboLoraLowVram = c.checked; persist(); });
                  return el("label", { style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: C.text, cursor: "pointer", paddingTop: "6px" } },
                    [c, el("span", { text: "low_vram" })]);
                })()]),
              ]),
              el("div", { html: `LoRA: <code>${(state.turboLora || "none").split(/[\\/]/).pop()}</code> — pick the file in ⚙ Settings.`,
                style: { fontSize: "10px", color: C.muted, wordBreak: "break-all" } }),
            ];
          }
          case "solattn":
            return [
              row([
                col([label("tau"), n(state.solTau ?? 1.3, v => state.solTau = v)]),
                col([label("min tokens"), n(state.solMinTokens ?? 4096, v => state.solMinTokens = Math.round(v), 512)]),
              ]),
              row([
                col([label("start %"), n(state.solStart ?? 0.2, v => state.solStart = v)]),
                col([label("end %"),   n(state.solEnd ?? 0.9,   v => state.solEnd = v)]),
              ]),
            ];
          case "spectrum":
            return [
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
            ];
          default:
            return [el("div", { text: "No acceleration patch — slowest, but the most faithful baseline.",
              style: { fontSize: "10px", color: C.muted } })];
        }
      }

      function mountLoraPanel() {
        const wrap = el("div");
        function render() {
          clear(wrap);
          const loras = state.loras || [];
          const kids = [label(`LoRA (${loras.length})`)];
          const all = ["none", ...((ctx.availableModels?.loras) || []).filter(x => x !== "none")];
          loras.forEach((l, i) => {
            kids.push(row([
              col([select(all.map(n => ({ value: n, label: n })), l.name || "none",
                v => { state.loras[i].name = v; persist(); })]),
            ]));
            kids.push(row([
              col([numberField(l.strength ?? 1.0, v => { state.loras[i].strength = v; persist(); }, 0.05)]),
              col([(() => {
                const b = el("button", { type: "button", text: "✕ remove", style: {
                  width: "100%", cursor: "pointer", fontFamily: "inherit", fontSize: "10px",
                  padding: "5px", borderRadius: "5px", background: C.bg2, color: C.muted, border: `1px solid ${C.border}`,
                }});
                b.addEventListener("click", () => { state.loras.splice(i, 1); persist(); render(); });
                return b;
              })()]),
            ]));
          });
          const add = el("button", { type: "button", text: "+ Add LoRA", style: {
            width: "100%", cursor: "pointer", fontFamily: "inherit", fontSize: "11px",
            padding: "6px", borderRadius: "6px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
          }});
          add.addEventListener("click", () => {
            if (!state.loras) state.loras = [];
            if (state.loras.length >= 4) { showPopup("4 LoRAs max.", true); return; }
            state.loras.push({ name: "none", strength: 1.0, enabled: true });
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
      const stopBtn = button("■ Stop", async () => {
        stopRequested = true;
        await interrupt();
        setStatus("Stopping after the current clip…");
      });
      stopBtn.style.flexShrink = "0";
      seedGenWrap.appendChild(row([genBtn, stopBtn]));

      // ══ RELAY LOOP ══════════════════════════════════════════════════════════
      let running = false, stopRequested = false;

      // Header + this clip's shots + footer, assembled only now — the parts stay
      // separate in the editor so a split never eats the shared style/sound text.
      // A clip index maps back through the per-prompt repeat counts.
      function promptForClip(clipIdx) {
        return composeClipPrompt(state, clipIdx);
      }

      function seedForClip(i) {
        if (!state.seedPerClip) return state.seed ?? 0;
        return ((state.seed ?? 0) + i) % Number.MAX_SAFE_INTEGER;
      }

      // What the gallery needs to show a clip and to put its prompt back into the
      // editor. Kept flat and small — this is written next to every video file.
      function metaForVideo(promptText, extra = {}) {
        const { width, height } = resolveResolution(state.aspect, state.megapixels);
        return {
          v: 1,
          prompt: String(promptText || ""),
          promptHeader: state.promptHeader || "",
          promptFooter: state.promptFooter || "",
          w: width, h: height,
          mode: state.generationMode || "t2v",
          aspect: state.aspect,
          megapixels: state.megapixels,
          frames: state.clipFrames,
          steps: state.steps,
          sampler: state.sampler,
          accel: state.accelMode,
          seed: state.seed,
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

      genBtn.onclick = async () => {
        if (running) return;
        running = true; stopRequested = false;
        genBtn.disabled = true; genBtn.textContent = "⏳ Preparing…";
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

          if (state.seedMode === "randomize")      { state.seed = randomSeed(); seedInput.value = state.seed; }
          else if (state.seedMode === "increment") { state.seed = (state.seed || 0) + 1; seedInput.value = state.seed; }
          else if (state.seedMode === "decrement") { state.seed = Math.max(0, (state.seed || 0) - 1); seedInput.value = state.seed; }
          persist();

          const plan = currentPlan();
          totClip = plan.count;
          const clipRecords = [];
          let chainFrame = state.generationMode === "reference" ? null : (state.firstFrameImage || null);
          const clipTimes = [];

          for (let i = 0; i < plan.count; i++) {
            if (stopRequested) { setStatus(`Stopped after ${i} clip(s).`); break; }
            curClip = i + 1;
            const clipStart = Date.now();
            setStatus(`Clip ${curClip}/${totClip} · building graph…`);
            badge.style.display = "block";
            badge.textContent = `● CLIP ${curClip}/${totClip}`;

            // Continuity decides what a clip after the first inherits. The first clip is
            // always rendered by whatever mode the run is in.
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
            const isRef = state.generationMode === "reference";
            let firstFrame = isRef ? null : (state.firstFrameImage || null);
            let refImages  = state.refImages || [];
            const continued = i > 0 && state.continuityMode === "lastframe" && !!chainFrame;
            if (i > 0) firstFrame = continued ? chainFrame : null;
            if (continued) refImages = [];   // FL2VA takes no reference images
            const modeForClip = continued ? "firstlast" : state.generationMode;

            const clipState = { ...state, generationMode: modeForClip };
            const restore = pipeOv ? applyOverridesTemp(clipState, pipeOv.overrides) : null;
            let built;
            try {
              built = buildClipGraph(clipState, ctx.availability, {
                nodeId: self.id,
                promptText: promptForClip(i),
                seed: seedForClip(i),
                firstFrame,
                lastFrame: (i === plan.count - 1) ? (state.lastFrameImage || null) : null,
                refImages,
                clipIndex: i,
                saveLastFrame: true,
              });
            } finally { restore?.(); }

            setStatus(`Clip ${curClip}/${totClip} · queued`);
            const res = await queuePrompt(built.graph, {
              onProgress: (v, m) => setStepProgress(v, m),
            });

            const vid = firstOutput(res.byNode, NODE_IDS.save);
            const lastImg = firstOutput(res.byNode, NODE_IDS.saveLF);
            if (vid) {
              clipRecords.push(vid);
              // every clip carries the prompt it was actually rendered from, so the
              // gallery can put that exact text back into the editor
              saveMeta(vid.filename, vid.subfolder || "", metaForVideo(promptForClip(i), {
                clip: curClip, clips: plan.count, seed: seedForClip(i), mode: modeForClip,
                // the editable source text, so "reuse" restores the editor exactly
                prompts: [state.prompts?.[i] || ""],
              }));
              showResultVideo(`/view?filename=${encodeURIComponent(vid.filename)}&subfolder=${encodeURIComponent(vid.subfolder || "")}&type=${vid.type || "output"}&t=${Date.now()}`);
              badge.textContent = `CLIP ${curClip}/${totClip} done`;
            }
            if (lastImg) {
              await setLastResult(self.id, { image: lastImg });
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

            clipTimes.push((Date.now() - clipStart) / 60000);
            // keep the estimate honest using measured clip times
            state.avgMinutesPerClip = +(clipTimes.reduce((a, b) => a + b, 0) / clipTimes.length).toFixed(2);
            persist(); refreshPlan();

            if (state.unloadBetweenClips && i < plan.count - 1) {
              setStatus(`Clip ${curClip}/${totClip} done · freeing VRAM…`);
              await freeMemory();
            }
          }

          // ── stitch ──────────────────────────────────────────────────────────
          if (clipRecords.length > 1 && state.stitchAtEnd && !stopRequested) {
            setStatus(`Stitching ${clipRecords.length} clips…`);
            try {
              const folder = (state.saveSubfolder || SUBFOLDER).replace(/\\/g, "/");
              // clips are whole by construction now, so there is nothing to trim
              // unless the user explicitly asked for a hard cut at the planned length
              const trim = state.trimLastClip ? currentPlan().actualSeconds : null;
              const out = await stitchClips(clipRecords, `${folder}/${state.filenamePrefix || "MMH3"}_full`, trim);
              const url = `/view?filename=${encodeURIComponent(out.filename)}&subfolder=${encodeURIComponent(out.subfolder || "")}&type=output&t=${Date.now()}`;
              // the stitched file gets every clip's prompt, in order
              saveMeta(out.filename, out.subfolder || "", metaForVideo(
                Array.from({ length: plan.count }, (_, i) => promptForClip(i)).join("\n\n"),
                { clips: clipRecords.length, stitched: true, prompts: (state.prompts || []).slice() },
              ));
              showResultVideo(url);
              badge.textContent = `FULL · ${clipRecords.length} clips`;
              await setLastResult(self.id, { videoPath: out.path });
              setStatus(`Done — ${clipRecords.length} clips stitched → ${out.filename}`);
              showPopup(`Stitched ${clipRecords.length} clips → ${out.filename}`, false);
            } catch (e) {
              setStatus(`Clips saved, stitch failed: ${e.message}`);
              showPopup(`Stitch failed: ${e.message}`, true);
            }
          } else if (clipRecords.length) {
            setStatus(stopRequested ? `Stopped — ${clipRecords.length} clip(s) saved.`
                                    : `Done — ${clipRecords.length} clip(s) saved.`);
          }

          barInner.style.width = "100%";
        } catch (e) {
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
          running = false; stopRequested = false;
          genBtn.disabled = false; genBtn.textContent = "▶ Generate";
          badge.textContent = badge.textContent.replace("● LIVE", "").trim() || badge.textContent;
          stopClock();
        }
      };

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
        state.prompts = parts;
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

      galleryOv = createGalleryOverlay(state, ctx);
      root.appendChild(galleryOv.el);
      document.body.appendChild(galleryOv.playerEl);   // fullscreen player lives above everything

      root.appendChild(helpEl);

      document.addEventListener("keydown", e => {
        if (e.key !== "Escape") return;
        if (galleryOv?.isPlaying()) return;            // the player handles its own Esc
        if (commonOv?.isOpen())    { commonOv.hide(); return; }
        if (promptEditOv?.isOpen()) { promptEditOv.hide(); return; }
        if (galleryOv?.isOpen())   { galleryOv.hide(); return; }
        if (helpEl.style.display !== "none") { helpEl.style.display = "none"; return; }
        if (settingsOv?.el.style.display !== "none") { settingsOv.hide(); return; }
      });

      self.addDOMWidget("mmh3_ui", "div", root, { serialize: false, computeSize: () => [NODE_MW, NODE_MH] });

      renderPills();
      renderLeft();
      renderPrompts();

      // model list drives the LoRA dropdown; fetch once in the background
      getModels().then(d => { ctx.availableModels = d; renderLeft(); }).catch(() => {});
      getNodeAvailability().then(av => {
        ctx.availability = av.available || {};
        ctx.availabilityInfo = av;
        if (av.core_ok === false) {
          showPopup(`Missing core nodes: ${(av.missing_core || []).join(", ")}`, true);
        } else if ((av.missing_optional || []).length) {
          setStatus(`Idle · optional packs missing: ${(av.missing_optional || []).join(", ")}`);
        }
      }).catch(() => {});
    };
  },
});

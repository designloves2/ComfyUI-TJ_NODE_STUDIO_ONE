// one_node_minimax_h3.js — MiniMax H3 ONE STUDIO (TJ)
//
// Video + audio in one node, with a clip relay loop: a long prompt is rendered as N
// short clips (the model's frame grid caps clip length), each clip is saved on its own,
// and the run ends with a stitched file.
//
// The relay runs here in the frontend, one `queuePrompt` per clip — the same pattern the
// other ONE STUDIO nodes use. ComfyUI already unloads models between prompts, so each clip
// boundary is a natural VRAM reset without reimplementing memory management.
//
// While a clip samples, ModelPreviewOverrideKJ streams decoded frames over the
// `kj_preview_override` socket event tagged with this node's id — they are painted into
// the preview box below, so the user watches the video form instead of a spinner.
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import {
  C, BRAND, NODE_W, PREVIEW_SIZE, LEFT_W, PAD, SUBFOLDER,
  el, clear, loadState, saveState, defaultState, randomSeed,
  CLIP_LENGTHS, ASPECTS, GENERATION_MODES, ACCEL_MODES, UPSCALE_MODES, CONTINUITY_MODES,
  clipPlan, formatDuration, formatClock, framesToSeconds, resolveResolution, splitBrief,
} from "./minimax/core_minimax.js";
import { panel, label, button, select, numberField, slider, row, col, modeBar, iconBtn, openFullscreen }
  from "./klein/ui_common.js";
import {
  queuePrompt, interrupt, freeMemory, setLastResult, stitchClips,
  copyOutputToInput, getNodeAvailability, getModels, saveMeta,
} from "./minimax/api_minimax.js";
import { buildClipGraph, NODE_IDS, previewNodeKey } from "./minimax/graph_builder_minimax.js";
import { createSettingsOverlay } from "./minimax/ui_app_settings_minimax.js";
import { mountImagePanel } from "./minimax/ui_images_minimax.js";
import { resolvePipeOverrides, applyOverridesTemp } from "./shared/promptdb_pipe.js";

// ── Layout ────────────────────────────────────────────────────────────────────
const TOPBAR_H   = 40;
const BOTTOM_PAD = 20;
const STATUS_H   = 46;
const PROMPT_H   = 150;
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
      function renderPills() {
        clear(pillsWrap);
        pillsWrap.appendChild(modeBar(
          GENERATION_MODES.map(m => ({ key: m.key, label: m.label, enabled: true })),
          state.generationMode,
          key => { state.generationMode = key; persist(); renderPills(); renderLeft(); }
        ));
      }
      let settingsOv, helpOv;
      topBar.appendChild(pillsWrap);
      topBar.appendChild(iconBtn("🗑", "Unload models / free VRAM", async () => {
        await freeMemory(); showPopup("VRAM freed.", false);
      }));
      topBar.appendChild(iconBtn("⚙", "Settings", () => settingsOv?.show()));
      topBar.appendChild(iconBtn("📂", "Open output folder", () => {
        window.open(`/view?filename=&subfolder=${encodeURIComponent(state.saveSubfolder || SUBFOLDER)}&type=output`, "_blank");
      }));
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
      const previewImg = el("img", { style: { maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "none" } });
      const previewVid = el("video", { autoplay: "", loop: "", muted: "", playsinline: "", style: { maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "none" } });
      previewVid.muted = true;
      const resultVid  = el("video", { controls: "", loop: "", playsinline: "", style: { maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "none" } });

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
        resultVid.play?.().catch(() => {});
        fsBtn.style.display = "block";
      }
      function resetPreview() {
        placeholder.style.display = "block";
        previewImg.style.display = "none";
        previewVid.style.display = "none";
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
      const splitBtn = el("button", { type: "button", text: "✂ Split into clips", title: "Split this brief into one prompt per clip", style: {
        marginLeft: "auto", cursor: "pointer", fontFamily: "inherit", fontSize: "10px",
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
        promptCount.textContent = `(${state.prompts.length} for ${plan.count} clip${plan.count > 1 ? "s" : ""})`;
        state.prompts.forEach((text, i) => {
          const line = el("div", { style: { display: "flex", gap: "4px", alignItems: "flex-start" } });
          const tag = el("div", { text: `${i + 1}`, style: {
            width: "20px", flexShrink: "0", textAlign: "center", fontSize: "10px",
            color: i < plan.count ? BRAND : C.muted, paddingTop: "7px", fontWeight: "700",
          }});
          const ta = el("textarea", { placeholder: i === 0 ? "Describe the shot…" : "(blank = reuse the previous clip's prompt)", style: {
            flex: "1", minHeight: "44px", boxSizing: "border-box", background: C.bg2, color: C.text,
            border: `1px solid ${i < plan.count ? C.border : C.dim}`, borderRadius: "6px", padding: "6px",
            fontSize: "12px", fontFamily: "inherit", outline: "none", resize: "vertical",
          }});
          ta.value = text || "";
          ta.addEventListener("input", () => { state.prompts[i] = ta.value; persist(); });
          ta.addEventListener("focus", () => ta.style.borderColor = BRAND);
          ta.addEventListener("blur",  () => ta.style.borderColor = i < plan.count ? C.border : C.dim);
          const del = el("button", { type: "button", text: "✕", title: "Remove", style: {
            flexShrink: "0", cursor: "pointer", background: "transparent", color: C.muted,
            border: "none", fontSize: "11px", padding: "6px 2px",
          }});
          del.addEventListener("click", () => {
            if (state.prompts.length <= 1) { state.prompts = [""]; }
            else state.prompts.splice(i, 1);
            persist(); renderPrompts();
          });
          line.append(tag, ta, del);
          promptList.appendChild(line);
        });
      }
      addBtn.addEventListener("click", () => { state.prompts.push(""); persist(); renderPrompts(); });
      splitBtn.addEventListener("click", () => {
        const joined = state.prompts.filter(p => p && p.trim()).join("\n\n");
        if (!joined.trim()) { showPopup("Nothing to split — write the brief in the first box.", true); return; }
        const parts = splitBrief(joined, currentPlan().count);
        if (parts.length <= 1) { showPopup("Could not find clip boundaries ([Shot N], --- or blank lines).", true); return; }
        state.prompts = parts; persist(); renderPrompts();
        showPopup(`Split into ${parts.length} clip prompts.`, false);
      });

      rightPanel.append(previewBox, statusWrap, promptWrap);
      mainRow.append(leftOuter, rightPanel);
      root.appendChild(mainRow);

      // ══ LEFT PANEL ══════════════════════════════════════════════════════════
      function currentPlan() {
        return clipPlan(state.totalSeconds, state.clipFrames, state.avgMinutesPerClip);
      }

      let planLine = null;
      function refreshPlan() {
        if (!planLine) return;
        const p = currentPlan();
        const { width, height } = resolveResolution(state.aspect, state.megapixels);
        planLine.innerHTML =
          `<b style="color:${BRAND}">${p.count} clip${p.count > 1 ? "s" : ""}</b> · `
          + `actual <b>${p.actualSeconds.toFixed(2)}s</b> · est. <b>${formatDuration(p.estimateMinutes)}</b>`
          + `<br><span style="color:${C.muted}">${width}×${height} · ${framesToSeconds(state.clipFrames).toFixed(2)}s/clip · ${state.clipFrames} frames</span>`;
        renderPrompts();
      }
      ctx.refreshPlan = refreshPlan;

      function renderLeft() {
        clear(leftPanel);

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

        // length / relay
        const p = currentPlan();
        planLine = el("div", { style: { fontSize: "11px", lineHeight: "1.65", color: C.text } });
        leftPanel.appendChild(panel([
          label("Clip length & total"),
          col([label("Clip length (model frame grid)"), select(
            CLIP_LENGTHS.map(c => ({ value: String(c.frames), label: c.label })),
            String(state.clipFrames), v => { state.clipFrames = parseInt(v, 10); persist(); refreshPlan(); })]),
          row([
            col([label("Total seconds"), numberField(state.totalSeconds ?? 8,
              v => { state.totalSeconds = Math.max(1, v); persist(); refreshPlan(); }, 1)]),
            col([label(" "), (() => {
              const b = el("button", { type: "button", text: "= 1 clip", title: "Set total to exactly one clip", style: {
                width: "100%", cursor: "pointer", fontFamily: "inherit", fontSize: "11px",
                padding: "6px", borderRadius: "6px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
              }});
              b.addEventListener("click", () => {
                state.totalSeconds = +framesToSeconds(state.clipFrames).toFixed(2);
                persist(); renderLeft();
              });
              return b;
            })()]),
          ]),
          planLine,
        ]));
        refreshPlan();

        // pipeline options
        leftPanel.appendChild(panel([
          label("Pipeline"),
          col([label("Acceleration"), select(ACCEL_MODES.map(m => ({ value: m.key, label: m.label })),
            state.accelMode, v => { state.accelMode = v; persist(); })]),
          col([label("Upscale"), select(UPSCALE_MODES.map(m => ({ value: m.key, label: m.label })),
            state.upscaleMode, v => { state.upscaleMode = v; persist(); renderLeft(); })]),
          ...(state.upscaleMode === "rtx" ? [row([
            col([label("RTX scale"), numberField(state.rtxScale ?? 2, v => { state.rtxScale = v; persist(); }, 0.5)]),
            col([label("Quality"), select(["LOW","MEDIUM","HIGH","ULTRA"].map(q => ({ value: q, label: q })),
              state.rtxQuality || "ULTRA", v => { state.rtxQuality = v; persist(); })]),
          ])] : []),
          col([label("Continuity between clips"), select(CONTINUITY_MODES.map(m => ({ value: m.key, label: m.label })),
            state.continuityMode, v => { state.continuityMode = v; persist(); renderLeft(); })]),
          el("div", { text: (CONTINUITY_MODES.find(m => m.key === state.continuityMode) || {}).hint || "",
            style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } }),
        ]));

        // images (mode-specific)
        const imgPanel = mountImagePanel(state, ctx);
        leftPanel.appendChild(imgPanel.el);

        // LoRA
        leftPanel.appendChild(mountLoraPanel());

        leftOuter.appendChild(seedGenWrap);
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

      function promptForClip(i) {
        const list = state.prompts || [];
        for (let k = Math.min(i, list.length - 1); k >= 0; k--) {
          if (list[k] && list[k].trim()) return list[k].trim();
        }
        return "";
      }

      function seedForClip(i) {
        if (!state.seedPerClip) return state.seed ?? 0;
        return ((state.seed ?? 0) + i) % Number.MAX_SAFE_INTEGER;
      }

      // SaveVideo / SaveImage report through `ui.PreviewVideo` / images — both land in
      // output.images, so one extractor covers them.
      function firstOutput(byNode, nodeKey) {
        const out = byNode?.[nodeKey];
        const arr = out?.images || out?.gifs || [];
        return arr.length ? arr[0] : null;
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
          let chainFrame = state.firstFrameImage || null;
          const clipTimes = [];

          for (let i = 0; i < plan.count; i++) {
            if (stopRequested) { setStatus(`Stopped after ${i} clip(s).`); break; }
            curClip = i + 1;
            const clipStart = Date.now();
            setStatus(`Clip ${curClip}/${totClip} · building graph…`);
            badge.style.display = "block";
            badge.textContent = `● CLIP ${curClip}/${totClip}`;

            // continuity: chain from the previous clip's final frame
            let firstFrame = state.firstFrameImage || null;
            let refImages  = state.refImages || [];
            if (i > 0) {
              if (state.continuityMode === "lastframe" && chainFrame) firstFrame = chainFrame;
              else if (state.continuityMode === "none") firstFrame = null;
            }
            // Last-frame chaining only means anything on a mode that accepts a first frame.
            const modeForClip = (i > 0 && state.continuityMode === "lastframe" && state.generationMode === "t2v")
              ? "firstlast" : state.generationMode;

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
              showResultVideo(`/view?filename=${encodeURIComponent(vid.filename)}&subfolder=${encodeURIComponent(vid.subfolder || "")}&type=${vid.type || "output"}&t=${Date.now()}`);
              badge.textContent = `CLIP ${curClip}/${totClip} done`;
            }
            if (lastImg) {
              await setLastResult(self.id, { image: lastImg });
              try { chainFrame = await copyOutputToInput(lastImg.filename, lastImg.subfolder || "", lastImg.type || "output"); }
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
              const trim = state.trimLastClip ? state.totalSeconds : null;
              const out = await stitchClips(clipRecords, `${folder}/${state.filenamePrefix || "MMH3"}_full`, trim);
              const url = `/view?filename=${encodeURIComponent(out.filename)}&subfolder=${encodeURIComponent(out.subfolder || "")}&type=output&t=${Date.now()}`;
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

          if (clipRecords.length) {
            const first = clipRecords[0];
            saveMeta(first.filename, first.subfolder || "", { ...state, clips: clipRecords.length });
          }
          barInner.style.width = "100%";
        } catch (e) {
          if (e.message === "cancelled") { setStatus("Cancelled."); }
          else { setStatus(`Error: ${e.message}`); showPopup(e.message, true); }
        } finally {
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
      root.appendChild(helpEl);

      document.addEventListener("keydown", e => {
        if (e.key !== "Escape") return;
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

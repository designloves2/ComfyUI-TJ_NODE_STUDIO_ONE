// one_node_flux_2_klein.js — flux2 klein One (TJ)
import { app } from "../../../scripts/app.js";
import { C, el, clear, NODE_W, PREVIEW_SIZE, LEFT_W, PAD, LIME, LS_KEY,
         randomSeed, loadState, saveState, defaultState } from "./core_klein.js";
import { panel, label, button, select, numberField, row, col,
         modeBar, iconBtn, outputModeToggle, openFullscreen } from "./ui_common.js";
import { queuePrompt, interrupt, freeMemory, setLastImage, saveMeta,
         copyOutputToInput } from "./api_klein.js";
import { createSettingsOverlay }  from "./ui_app_settings_klein.js";
import { t } from "../shared/i18n.js";
import { createGalleryOverlay }   from "./ui_gallery_klein.js";
import { mountT2ILeft }           from "./ui_t2i_klein.js";
import { mountI2ILeft }           from "./ui_i2i_klein.js";
import { mountEditLeft }          from "./ui_edit_klein.js";
import { mountInpaintLeft }       from "./ui_inpaint_klein.js";
import { mountFaceswapLeft }      from "./ui_faceswap_klein.js";
import { mountUpscaleLeft }       from "./ui_upscale_klein.js";

// ── Layout constants ──────────────────────────────────────────────────────────
const TOPBAR_H    = 40;
const BOTTOM_PAD  = 20;
const SEND_TO_H   = 32;
const PROMPT_TA_H = 96;
const PROMPT_LBL  = 18;
const PROMPT_H    = PROMPT_LBL + 4 + PROMPT_TA_H;
const RIGHT_H     = PREVIEW_SIZE + PAD + SEND_TO_H + PAD + PROMPT_H;
const ROOT_H      = PAD + TOPBAR_H + PAD + RIGHT_H + BOTTOM_PAD;
const NODE_H      = ROOT_H + 30;

const MODES = [
  { key: "t2i",      label: "T2I",      enabled: true },
  { key: "i2i",      label: "I2I",      enabled: true },
  { key: "edit",     label: "EDIT",     enabled: true },
  { key: "inpaint",  label: "PAINT",    enabled: true },
  { key: "faceswap", label: "FACESWAP", enabled: true },
  { key: "upscale",  label: "UPSCALE",  enabled: true },
];

const SEND_TO = {
  t2i:      [{ mode:"i2i",      label:"→ I2I",      field:"i2iImage" },
              { mode:"edit",     label:"→ Edit",     field:"editImage1" },
              { mode:"inpaint",  label:"→ Paint",    field:"inpaintImage" },
              { mode:"faceswap", label:"→ Faceswap", field:"faceswapTarget" },
              { mode:"upscale",  label:"→ Upscale",  field:"upscaleImage" }],
  i2i:      [{ mode:"edit",     label:"→ Edit",     field:"editImage1" },
              { mode:"inpaint",  label:"→ Paint",    field:"inpaintImage" },
              { mode:"faceswap", label:"→ Faceswap", field:"faceswapTarget" },
              { mode:"upscale",  label:"→ Upscale",  field:"upscaleImage" }],
  edit:     [{ mode:"i2i",      label:"→ I2I",      field:"i2iImage" },
              { mode:"inpaint",  label:"→ Paint",    field:"inpaintImage" },
              { mode:"upscale",  label:"→ Upscale",  field:"upscaleImage" }],
  inpaint:  [{ mode:"i2i",      label:"→ I2I",      field:"i2iImage" },
              { mode:"edit",     label:"→ Edit",     field:"editImage1" },
              { mode:"upscale",  label:"→ Upscale",  field:"upscaleImage" }],
  faceswap: [{ mode:"i2i",      label:"→ I2I",      field:"i2iImage" },
              { mode:"edit",     label:"→ Edit",     field:"editImage1" },
              { mode:"upscale",  label:"→ Upscale",  field:"upscaleImage" }],
  upscale:  [{ mode:"i2i",      label:"→ I2I",      field:"i2iImage" },
              { mode:"inpaint",  label:"→ Paint",    field:"inpaintImage" }],
};

const HELP_SECTIONS = [
  { title: t("khelp_s0_title"), body: t("khelp_s0_body") },
  { title: t("khelp_s1_title"), body: t("khelp_s1_body") },
  { title: t("khelp_s2_title"), body: t("khelp_s2_body") },
  { title: t("khelp_s3_title"), body: t("khelp_s3_body") },
  { title: t("khelp_s4_title"), body: t("khelp_s4_body") },
  { title: t("khelp_s5_title"), body: t("khelp_s5_body") },
  { title: t("khelp_s6_title"), body: t("khelp_s6_body") },
];

// ── Compare view (Z_Image_One 방식과 동일) ────────────────────────────────────
function createCompareView(originalURL, resultURL) {
  const container = el("div", { style: { position:"relative", width:"100%", height:"100%", overflow:"hidden", borderRadius:"8px" }});
  const resultImg = el("img", { src: resultURL,  style: { position:"absolute", inset:"0", width:"100%", height:"100%", objectFit:"contain" }});
  const origWrap  = el("div", { style: { position:"absolute", inset:"0 auto 0 0", width:"100%", overflow:"hidden" }});
  const origImg   = el("img", { src: originalURL, style: { position:"absolute", inset:"0", width:`${PREVIEW_SIZE}px`, height:"100%", objectFit:"contain" }});
  origWrap.appendChild(origImg);
  const divider = el("div", { style: {
    position:"absolute", top:"0", bottom:"0", left:"100%",
    width:"3px", background:"rgba(255,255,255,0.85)", cursor:"ew-resize", zIndex:"10",
  }});
  const handle = el("div", { style: {
    position:"absolute", top:"50%", left:"-10px", transform:"translateY(-50%)",
    width:"20px", height:"40px", borderRadius:"10px",
    background: LIME, display:"flex", alignItems:"center", justifyContent:"center",
    color:"#fff", fontSize:"11px", userSelect:"none",
  }, text: "⟺" });
  divider.appendChild(handle);
  let pos = 50;
  function update(p) {
    pos = Math.max(0, Math.min(100, p));
    origWrap.style.width = pos + "%";
    divider.style.left   = pos + "%";
  }
  update(0);
  divider.addEventListener("pointerdown", e => {
    divider.setPointerCapture(e.pointerId);
    const mv = e2 => { const r = container.getBoundingClientRect(); update((e2.clientX - r.left) / r.width * 100); };
    const up = () => { divider.removeEventListener("pointermove", mv); divider.removeEventListener("pointerup", up); };
    divider.addEventListener("pointermove", mv); divider.addEventListener("pointerup", up);
  });
  container.appendChild(resultImg); container.appendChild(origWrap); container.appendChild(divider);
  return container;
}

app.registerExtension({
  name: "Flux2KleinOneTJ.v1",

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "Flux2KleinOneTJNode") return;

    nodeType.prototype.onNodeCreated = function () {
      this.color        = LIME;
      this.bgcolor      = C.bg0;
      this.title_color  = "#ffffff";
      this.resizable    = false;
      this.size         = [NODE_W, NODE_H];
      this._buildUI();
    };
    nodeType.prototype.onConfigure = function () { this.size = [NODE_W, NODE_H + (this._extraH || 0)]; };
    nodeType.prototype.onResize    = function () { this.size = [NODE_W, NODE_H + (this._extraH || 0)]; };

    nodeType.prototype._buildUI = function () {
      const self   = this;
      self._extraH = 0;
      const state  = defaultState(loadState());
      state.useModelOverride = false; // 오버라이드는 항상 비활성으로 시작 (저장 무시)
      const persist = () => saveState(null, state);
      const appConfig = { output_mode_visible: true };
      const modeResults = {};

      // 전역 스타일 (한 번만)
      if (!document.getElementById("fk-styles")) {
        const s = document.createElement("style");
        s.id = "fk-styles";
        s.textContent = `
          @keyframes fk-spin{to{transform:rotate(360deg)}}
          .fk-lp::-webkit-scrollbar{width:4px}
          .fk-lp::-webkit-scrollbar-track{background:transparent}
          .fk-lp::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px}
        `;
        document.head.appendChild(s);
      }

      // 입력 슬롯에 연결된 Primitive/String 노드의 값 읽기
      function getOverrideSlot(slotName) {
        try {
          const slotIdx = self.inputs?.findIndex(i => i.name === slotName);
          if (slotIdx == null || slotIdx < 0) return "";
          const linkId = self.inputs[slotIdx]?.link;
          if (linkId == null) return "";
          const link = app.graph.links[linkId];
          if (!link) return "";
          const srcNode = app.graph.getNodeById(link.origin_id);
          if (!srcNode) return "";
          return srcNode.widgets?.[link.origin_slot]?.value
              ?? srcNode.widgets?.[0]?.value
              ?? "";
        } catch(e) { return ""; }
      }
      const getPromptOverride = () => getOverrideSlot("prompt_override");

      // ── Root ──────────────────────────────────────────────────────────────
      const root = el("div", { style: {
        width: "100%", height: `${ROOT_H}px`, boxSizing: "border-box",
        position: "relative", overflow: "hidden",
        background: C.bg0, borderRadius: "8px",
        padding: `${PAD}px ${PAD}px ${BOTTOM_PAD}px ${PAD}px`,
        color: C.text, fontFamily: "'Segoe UI', sans-serif",
      }});

      // 팝업 알림
      let popTimer;
      function showPopup(msg, isError = true) {
        let pop = root.querySelector(".fk-pop");
        if (!pop) {
          pop = el("div", { style: {
            position: "absolute", bottom: "30px", left: "50%", transform: "translateX(-50%)",
            background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "6px",
            padding: "6px 14px", fontSize: "11px", color: C.text, zIndex: "10001",
            maxWidth: "80%", textAlign: "center", pointerEvents: "none",
          }});
          pop.className = "fk-pop";
          root.appendChild(pop);
        }
        pop.textContent = msg;
        pop.style.color = isError ? C.err : LIME;
        pop.style.opacity = "1";
        clearTimeout(popTimer);
        popTimer = setTimeout(() => { pop.style.opacity = "0"; }, 3000);
      }

      const OVERRIDE_SLOTS = [
        { name: "model_override", type: "MODEL" },
        { name: "clip_override",  type: "CLIP" },
        { name: "vae_override",   type: "VAE" },
      ];
      const OVERRIDE_SLOT_NAMES = OVERRIDE_SLOTS.map(s => s.name);
      function syncOverrideSlots(enabled) {
        if (enabled) {
          for (const { name, type } of OVERRIDE_SLOTS) {
            if (!self.inputs?.find(i => i.name === name))
              self.addInput(name, type);
          }
        } else {
          for (let i = (self.inputs?.length ?? 0) - 1; i >= 0; i--) {
            if (OVERRIDE_SLOT_NAMES.includes(self.inputs[i]?.name))
              self.removeInput(i);
          }
        }
        self._extraH = enabled ? OVERRIDE_SLOTS.length * 20 : 0;
        const newH = NODE_H + self._extraH;
        self.size = [NODE_W, newH];
        self.setSize?.([NODE_W, newH]);
        self.graph?.setDirtyCanvas?.(true, true);
      }

      const ctx = {
        persist, appConfig, availableLoras: [], rootEl: root,
        _rerenderLoras: null,
        renderToggle: null, _refreshToggle: null,
        showPopup,
        syncOverrideSlots,
        resizeNode: () => {},
      };

      // 초기 슬롯 동기화
      syncOverrideSlots(state.useModelOverride || false);

      // ── Top bar ────────────────────────────────────────────────────────────
      const topBar = el("div", { style: {
        display: "flex", alignItems: "center", gap: "6px",
        height: `${TOPBAR_H}px`, marginBottom: `${PAD}px`, flexShrink: "0",
      }});

      // Mode pills (flex:1)
      const pillsWrap = el("div", { style: { flex: "1" } });

      function renderPills() {
        clear(pillsWrap);
        pillsWrap.appendChild(modeBar(MODES, state.mode, key => {
          state.mode = key; persist();
          renderPills(); renderMode();
        }));
      }

      // KV Cache 토글 버튼
      const kvBtn = iconBtn("KV", t("kv_btn_title"), () => {
        const next = state.kvCacheOverride === "off" ? "auto"
                   : state.kvCacheOverride === "auto" ? "on"
                   : "off";
        state.kvCacheOverride = next; persist(); updateKVBtn();
      });
      kvBtn.style.cssText += "font-size:9px;font-weight:700;min-width:34px;border-radius:6px;padding:4px 8px;";
      function applyKVBtnStyle(isOn) {
        if (isOn) {
          kvBtn.style.background = "#ffffff";
          kvBtn.style.color      = "#7612DA";
          kvBtn.style.border     = "2px solid #7612DA";
          kvBtn.onmouseenter = () => { kvBtn.style.background = "#f0e0ff"; };
          kvBtn.onmouseleave = () => { kvBtn.style.background = "#ffffff"; };
        } else {
          kvBtn.style.background = C.bg2;
          kvBtn.style.color      = C.muted;
          kvBtn.style.border     = `1px solid ${C.border}`;
          kvBtn.onmouseenter = () => { kvBtn.style.background = C.bg3 || C.bg2; };
          kvBtn.onmouseleave = () => { kvBtn.style.background = C.bg2; };
        }
      }
      function updateKVBtn() {
        const ov = state.kvCacheOverride;
        const autoOn = (state.model || "").toLowerCase().includes("kv");
        const isOn   = ov === "on" || (ov === "auto" && autoOn);
        const label  = ov === "auto" ? "KV A" : ov === "on" ? "KV ✓" : "KV ✗";
        kvBtn.textContent = label;
        kvBtn.title       = t("kv_state_label", ov, isOn);
        applyKVBtnStyle(isOn);
      }
      ctx._refreshKVBtn = updateKVBtn;

      // Reset 버튼
      const resetBtn = iconBtn("↺", t("reset_tooltip"), () => {
        if (!confirm(t("reset_confirm"))) return;
        const { model, textEncoder, vae } = state;
        Object.assign(state, defaultState({}));
        if (model)       state.model       = model;
        if (textEncoder) state.textEncoder = textEncoder;
        if (vae)         state.vae         = vae;
        persist();
        renderPills(); renderMode();
        showPopup(t("reset_done"), false);
      });
      resetBtn.style.cssText += `background:#ffffff;color:#7612DA;border:2px solid #7612DA;border-radius:6px;padding:4px 8px;font-weight:700;`;
      resetBtn.onmouseenter = () => { resetBtn.style.background = "#f0e0ff"; };
      resetBtn.onmouseleave = () => { resetBtn.style.background = "#ffffff"; };

      // Compare 버튼 (항상 표시, T2I에서는 ON이어도 작동하지 않음)
      let compareEnabled = true;
      function applyCompareBtnStyle() {
        const on = compareEnabled && state.mode !== "t2i";
        if (on) {
          compareBtn.style.background = "#ffffff";
          compareBtn.style.color      = "#7612DA";
          compareBtn.style.border     = "2px solid #7612DA";
          compareBtn.onmouseenter = () => { compareBtn.style.background = "#f0e0ff"; };
          compareBtn.onmouseleave = () => { compareBtn.style.background = "#ffffff"; };
        } else if (compareEnabled) {
          // T2I에서 ON 상태: 색은 켜진 상태지만 dimmed
          compareBtn.style.background = C.bg2;
          compareBtn.style.color      = "#7612DA";
          compareBtn.style.border     = `1px solid #7612DA`;
          compareBtn.style.opacity    = "0.45";
          compareBtn.onmouseenter = () => {};
          compareBtn.onmouseleave = () => {};
        } else {
          compareBtn.style.background = C.bg2;
          compareBtn.style.color      = C.muted;
          compareBtn.style.border     = `1px solid ${C.border}`;
          compareBtn.style.opacity    = "1";
          compareBtn.onmouseenter = () => { compareBtn.style.background = C.bg3; };
          compareBtn.onmouseleave = () => { compareBtn.style.background = C.bg2; };
        }
      }
      const compareBtn = iconBtn("⇌", "이미지 비교 ON/OFF (T2I에서는 비활성)", () => {
        compareEnabled = !compareEnabled;
        applyCompareBtnStyle();
        if (!compareEnabled) { restorePreview(); } else { tryShowCompare(); }
      });
      compareBtn.style.cssText += "border-radius:6px;padding:4px 8px;font-weight:700;font-size:13px;";
      function syncCompareBtn() {
        applyCompareBtnStyle();
      }

      // Unload 버튼
      const unloadBtn = iconBtn("🗑", "Unload RAM/VRAM", async () => {
        unloadBtn.style.opacity = "0.5";
        try { await freeMemory(); } catch(e) {}
        setTimeout(() => { unloadBtn.style.opacity = "1"; }, 2000);
      });

      // Settings/Gallery/Help 버튼 (나중에 추가)
      let settingsOv, galleryOv, helpOv;

      // TopBar 순서: pillsWrap → KV → reset → compare → unload → settings → gallery → help
      topBar.appendChild(pillsWrap);
      topBar.appendChild(kvBtn);
      topBar.appendChild(resetBtn);
      topBar.appendChild(compareBtn);
      topBar.appendChild(unloadBtn);
      topBar.appendChild(iconBtn("⚙", "Settings", () => settingsOv?.show()));
      topBar.appendChild(iconBtn("🖼", "Gallery",  () => galleryOv?.show()));
      const helpBtnEl = iconBtn("?", t("help_tooltip"), () => helpOv?.show());
      topBar.appendChild(helpBtnEl);
      root.appendChild(topBar);

      // ── Main row ───────────────────────────────────────────────────────────
      const mainRow = el("div", { style: {
        display: "flex", gap: `${PAD}px`,
        height: `${RIGHT_H}px`, flexShrink: "0",
      }});

      // Left panel
      const leftOuter = el("div", { style: {
        width: `${LEFT_W}px`, flexShrink: "0", height: `${RIGHT_H}px`,
        display: "flex", flexDirection: "column",
      }});
      const leftPanel = el("div", { style: {
        flex: "1", overflowY: "auto", overflowX: "hidden",
        display: "flex", flexDirection: "column", gap: "6px",
      }});
      leftPanel.className = "fk-lp";
      leftOuter.appendChild(leftPanel);

      // Right panel
      const rightPanel = el("div", { style: {
        flex: "1", minWidth: "0", display: "flex", flexDirection: "column",
        gap: `${PAD}px`, height: `${RIGHT_H}px`,
      }});

      // Preview box
      const previewBox = el("div", { style: {
        width: `${PREVIEW_SIZE}px`, height: `${PREVIEW_SIZE}px`, flexShrink: "0",
        background: "#000", borderRadius: "8px", border: `1px solid ${C.border}`,
        position: "relative", display: "flex",
        alignItems: "center", justifyContent: "center",
        overflow: "hidden", alignSelf: "flex-start",
      }});
      const placeholder = el("div", { text: "Generate to see result",
        style: { color: C.muted, fontSize: "12px" } });
      const finalImg = el("img", { style: {
        maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "none",
      }});
      const loadingOv = el("div", { style: {
        position: "absolute", inset: "0", background: "rgba(0,0,0,0.5)",
        display: "none", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: "12px",
        zIndex: "10",
      }});
      const spinner = el("div", { style: {
        width: "44px", height: "44px",
        border: `3px solid ${C.border}`, borderTop: `3px solid ${LIME}`,
        borderRadius: "50%", animation: "fk-spin 0.8s linear infinite",
      }});
      loadingOv.appendChild(spinner);
      loadingOv.appendChild(el("div", { text: "Generating…", style: { color: C.text, fontSize: "12px" } }));

      const clearBtn = el("button", { text: "✕", type: "button", title: "Clear result", style: {
        position: "absolute", top: "6px", right: "6px", zIndex: "5",
        background: "rgba(0,0,0,0.65)", color: "#fff", border: "none",
        borderRadius: "4px", width: "22px", height: "22px",
        cursor: "pointer", fontSize: "12px", padding: "0", display: "none",
      }});
      clearBtn.addEventListener("click", () => {
        delete modeResults[state.mode]; resetZoom(); resetPreview(); renderSendTo();
      });

      // ── Zoom / Pan ────────────────────────────────────────────────────────
      let zoomEnabled = true, zoomScale = 1, panX = 0, panY = 0;
      let isPanning = false, panStartX = 0, panStartY = 0, panStartTX = 0, panStartTY = 0;

      function applyZoom() {
        finalImg.style.transform = `scale(${zoomScale}) translate(${panX}px, ${panY}px)`;
        finalImg.style.transformOrigin = "center center";
        finalImg.style.cursor = zoomScale > 1 ? "grab" : "default";
      }
      function resetZoom() {
        zoomScale = 1; panX = 0; panY = 0; applyZoom();
      }

      // 자물쇠 버튼 (zoom on/off)
      const zoomLockBtn = el("button", { text: "🔓", type: "button", title: "Scroll zoom on/off", style: {
        position: "absolute", top: "6px", right: "32px", zIndex: "5",
        background: "rgba(0,0,0,0.65)", color: "#fff", border: "none",
        borderRadius: "4px", width: "22px", height: "22px",
        cursor: "pointer", fontSize: "11px", padding: "0", display: "none",
      }});
      zoomLockBtn.addEventListener("click", () => {
        zoomEnabled = !zoomEnabled;
        zoomLockBtn.textContent = zoomEnabled ? "🔓" : "🔒";
        if (!zoomEnabled) resetZoom();
      });

      // 스크롤 줌
      previewBox.addEventListener("wheel", e => {
        if (!zoomEnabled || !modeResults[state.mode]) return;
        e.preventDefault();
        zoomScale = Math.max(1, Math.min(8, zoomScale * (e.deltaY < 0 ? 1.12 : 0.9)));
        if (zoomScale === 1) { panX = 0; panY = 0; }
        applyZoom();
      }, { passive: false });

      // 패닝 (확대 시 드래그)
      previewBox.addEventListener("mousedown", e => {
        if (!zoomEnabled || zoomScale <= 1 || e.button !== 0) return;
        isPanning = true;
        panStartX = e.clientX; panStartY = e.clientY;
        panStartTX = panX; panStartTY = panY;
        finalImg.style.cursor = "grabbing";
        e.preventDefault();
      });
      document.addEventListener("mousemove", e => {
        if (!isPanning) return;
        panX = panStartTX + (e.clientX - panStartX) / zoomScale;
        panY = panStartTY + (e.clientY - panStartY) / zoomScale;
        applyZoom();
      });
      document.addEventListener("mouseup", () => {
        if (isPanning) { isPanning = false; finalImg.style.cursor = zoomScale > 1 ? "grab" : "default"; }
      });

      // 더블클릭 전체화면
      previewBox.addEventListener("dblclick", () => {
        const mr = modeResults[state.mode];
        if (mr) openFullscreen(mr.url);
      });

      function resetPreview() {
        previewBox.innerHTML = "";
        previewBox.appendChild(placeholder);
        previewBox.appendChild(finalImg);
        previewBox.appendChild(loadingOv);
        previewBox.appendChild(zoomLockBtn);
        previewBox.appendChild(clearBtn);
        placeholder.style.display = "block";
        finalImg.style.display    = "none";
        loadingOv.style.display   = "none";
        zoomLockBtn.style.display = "none";
        clearBtn.style.display    = "none";
        resetZoom();
      }
      resetPreview();

      function tryShowCompare() {
        const mr  = modeResults[state.mode];
        if (!mr) return;
        const src = modeHandle?.getSourceURL?.();
        previewBox.innerHTML = "";
        clearBtn.style.display    = "block";
        zoomLockBtn.style.display = "block";
        if (compareEnabled && state.mode !== "t2i" && src) {
          previewBox.appendChild(createCompareView(src, mr.url));
          resetZoom();
        } else {
          placeholder.style.display = "none";
          finalImg.src = mr.url; finalImg.style.display = "block";
          previewBox.appendChild(placeholder);
          previewBox.appendChild(finalImg);
        }
        loadingOv.style.display = "none";
        previewBox.appendChild(loadingOv);
        previewBox.appendChild(zoomLockBtn);
        previewBox.appendChild(clearBtn);
      }

      function restorePreview() {
        const mr = modeResults[state.mode];
        if (!mr) { resetPreview(); return; }
        loadingOv.style.display = "none";
        tryShowCompare();
      }

      ctx.showResult = (im) => {
        const url = `/view?filename=${encodeURIComponent(im.filename)}&subfolder=${encodeURIComponent(im.subfolder||"")}&type=${im.type||"output"}&t=${Date.now()}`;
        modeResults[state.mode] = { im, url };
        loadingOv.style.display = "none";
        tryShowCompare();
        renderSendTo();
        // image output 슬롯에 마지막 이미지 등록
        setLastImage(self.id, im).catch(() => {});
      };

      // ── Send-to strip + Output toggle ──────────────────────────────────────
      const sendToWrap = el("div", { style: {
        height: `${SEND_TO_H}px`, flexShrink: "0",
        display: "flex", alignItems: "center", gap: "8px", overflow: "hidden",
      }});
      const sendLeft  = el("div", { style: { flex: "1", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px" } });
      const sendRight = el("div", { style: { display: "flex", alignItems: "center", gap: "4px", flexShrink: "0" } });
      sendToWrap.appendChild(sendLeft);
      sendToWrap.appendChild(sendRight);

      function renderSendTo() {
        clear(sendLeft);
        const targets = SEND_TO[state.mode] || [];
        if (!targets.length) return;
        sendLeft.appendChild(el("div", { text: "Send to:", style: { color: C.muted, fontSize: "11px", flexShrink: "0" } }));
        targets.forEach(t => {
          const btn = el("button", { text: t.label, type: "button", style: {
            cursor: "pointer", fontFamily: "inherit", fontSize: "11px",
            padding: "3px 8px", borderRadius: "12px",
            background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
          }});
          btn.addEventListener("mouseenter", () => btn.style.background = C.bg3);
          btn.addEventListener("mouseleave", () => btn.style.background = C.bg2);
          btn.addEventListener("click", async () => {
            const mr = modeResults[state.mode];
            if (!mr) return;
            btn.disabled = true; btn.textContent = "Copying…";
            try {
              const n = await copyOutputToInput(mr.im.filename, mr.im.subfolder || "", mr.im.type || "output");
              state[t.field] = n; state.mode = t.mode; persist();
              renderPills(); renderMode();
            } catch(e) { btn.disabled = false; btn.textContent = t.label; }
          });
          sendLeft.appendChild(btn);
        });
      }

      function renderToggle() {
        clear(sendRight);
        if (appConfig.output_mode_visible === false) return;
        sendRight.appendChild(el("div", { text: "Output:", style: { color: C.muted, fontSize: "11px" } }));
        ["preview", "save"].forEach(key => {
          const active = state.outputMode === key;
          const text   = key === "save" ? "💾 Save" : "👁 Preview";
          const btn    = el("button", { text, type: "button", style: {
            cursor: "pointer", fontFamily: "inherit", fontSize: "11px",
            padding: "4px 10px", borderRadius: "20px",
            background: active ? LIME : C.bg2, color: "#ffffff",
            border: `1px solid ${active ? LIME : C.border}`, fontWeight: active ? "700" : "400",
          }, onclick: () => { state.outputMode = key; persist(); renderToggle(); }});
          sendRight.appendChild(btn);
        });
      }
      renderToggle();
      ctx.renderToggle = renderToggle;
      ctx._refreshToggle = renderToggle;

      // ── Prompt expand overlay ──────────────────────────────────────────────
      const promptExpandEl = el("div", { style: {
        position: "absolute", inset: "0", zIndex: "9997",
        background: "rgba(11,11,11,0.97)", borderRadius: "inherit",
        display: "none", flexDirection: "column", padding: "14px", gap: "8px",
        boxSizing: "border-box",
      }});
      const pxHdr = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" }});
      pxHdr.appendChild(el("div", { text: "🔍 Prompt (전체 화면 편집)", style: { color: "#fff", fontSize: "13px", fontWeight: "700", flex: "1" }}));
      const pxTA = el("textarea", { style: {
        flex: "1", background: C.bg2, color: C.text,
        border: `1px solid ${LIME}`, borderRadius: "6px",
        padding: "10px", fontSize: "13px", fontFamily: "inherit",
        resize: "none", outline: "none",
      }});
      const pxApply = button("✓ 적용", () => {
        setModePrompt(state.mode, pxTA.value);
        promptTA.value = pxTA.value; persist(); updateCount();
        promptExpandEl.style.display = "none";
      }, "primary");
      const pxClose = button("✕ 닫기", () => {
        promptExpandEl.style.display = "none";
      }, "danger");
      pxHdr.appendChild(pxApply); pxHdr.appendChild(pxClose);
      promptExpandEl.appendChild(pxHdr); promptExpandEl.appendChild(pxTA);
      const promptExpandOv = {
        show() {
          pxTA.value = getModePrompt(state.mode);
          promptExpandEl.style.display = "flex";
          setTimeout(() => pxTA.focus(), 50);
        },
        hide() { promptExpandEl.style.display = "none"; },
      };

      // ── Prompt area ────────────────────────────────────────────────────────
      const promptWrap = el("div", { style: {
        height: `${PROMPT_H}px`, flexShrink: "0",
        display: "flex", flexDirection: "column", gap: "4px",
      }});
      const charCount = el("span", { style: { color: C.muted, fontSize: "10px", marginLeft: "6px" } });
      const promptHdr = el("div", { style: { display: "flex", alignItems: "center", height: `${PROMPT_LBL}px` } });
      promptHdr.appendChild(el("div", { text: "PROMPT", style: { color: C.muted, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.04em" } }));
      promptHdr.appendChild(charCount);

      const expandBtn = el("button", { type: "button", text: "🔍", title: "확장 편집", style: {
        cursor: "pointer", background: "transparent", border: "none", fontSize: "12px",
        color: C.muted, padding: "0 3px", marginLeft: "auto",
      }, onclick: () => promptExpandOv.show() });
      promptHdr.appendChild(expandBtn);

      const tplBtn = button("📋", null, "default");
      tplBtn.title = "Load Template";
      tplBtn.style.cssText += "padding:2px 6px;font-size:11px;margin-left:4px;";
      promptHdr.appendChild(tplBtn);

      const promptTA = el("textarea", {
        placeholder: "Describe the image…",
        style: {
          flex: "1", width: "100%", boxSizing: "border-box",
          background: C.bg2, color: C.text,
          border: `1px solid ${C.border}`, borderRadius: "6px",
          padding: "7px", fontSize: "13px", fontFamily: "inherit",
          outline: "none", resize: "none", overflowY: "auto",
        },
      });

      function getModePrompt(mode)    { return state.promptsByMode?.[mode] || ""; }
      function setModePrompt(mode, v) {
        if (!state.promptsByMode) state.promptsByMode = {};
        state.promptsByMode[mode] = v; state.prompt = v;
      }
      promptTA.value = getModePrompt(state.mode);
      function updateCount() {
        const n = getModePrompt(state.mode).trim().length;
        charCount.textContent = ` (${n} chars${n < 30 ? " ⚠" : ""})`;
        charCount.style.color = n < 30 ? C.warn : C.muted;
      }
      updateCount();
      promptTA.addEventListener("input", () => { setModePrompt(state.mode, promptTA.value); persist(); updateCount(); });
      promptTA.addEventListener("focus", () => promptTA.style.borderColor = LIME);
      promptTA.addEventListener("blur",  () => promptTA.style.borderColor = C.border);

      promptWrap.appendChild(promptHdr);
      promptWrap.appendChild(promptTA);

      rightPanel.appendChild(previewBox);
      rightPanel.appendChild(sendToWrap);
      rightPanel.appendChild(promptWrap);
      mainRow.appendChild(leftOuter);
      mainRow.appendChild(rightPanel);
      root.appendChild(mainRow);

      // ── Seed + Generate ────────────────────────────────────────────────────
      const seedInput = numberField(state.seed, v => { state.seed = v; persist(); }, 1);
      const seedModeDD = select(
        [{ value: "randomize", label: "Random" }, { value: "fixed", label: "Fixed" },
         { value: "increment", label: "+1" },     { value: "decrement", label: "-1" }],
        state.seedMode, v => { state.seedMode = v; persist(); }
      );
      const seedGenWrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "4px", paddingTop: "6px", flexShrink: "0", borderTop: `1px solid ${C.border}` } });
      seedGenWrap.appendChild(panel([row([col([label("SEED"), seedInput]), col([label("MODE"), seedModeDD])])]));

      const genBtn  = button("▶ Generate", null, "primary");
      genBtn.style.cssText  += "width:100%;padding:11px;font-size:13px;";
      const stopBtn = button("■ Stop", async () => {
        running = false;
        await interrupt();
        genBtn.disabled = false; genBtn.textContent = "▶ Generate";
        loadingOv.style.display = "none";
        if (!modeResults[state.mode]) resetPreview();
      });
      stopBtn.style.flexShrink = "0";
      seedGenWrap.appendChild(row([genBtn, stopBtn]));

      // ── Mode rendering ─────────────────────────────────────────────────────
      let modeHandle = null;

      function renderMode() {
        const mode = state.mode;
        clear(leftPanel);
        modeHandle = null;

        switch (mode) {
          case "t2i":      modeHandle = mountT2ILeft(leftPanel, state, ctx);      break;
          case "i2i":      modeHandle = mountI2ILeft(leftPanel, state, ctx);      break;
          case "edit":     modeHandle = mountEditLeft(leftPanel, state, ctx);     break;
          case "inpaint":  modeHandle = mountInpaintLeft(leftPanel, state, ctx);  break;
          case "faceswap": modeHandle = mountFaceswapLeft(leftPanel, state, ctx); break;
          case "upscale":  modeHandle = mountUpscaleLeft(leftPanel, state, ctx);  break;
        }

        leftOuter.appendChild(seedGenWrap);
        // 페이스스왑 모드 기본 프롬프트
        if (mode === "faceswap" && !getModePrompt("faceswap").trim()) {
          const fsDefault = "Replace the head in image 1 with the head from image 2, adapting the facial features to match the artistic style, focus, and environmental lighting of the image 1.";
          setModePrompt("faceswap", fsDefault); persist();
        }
        promptTA.value = getModePrompt(mode);
        updateCount();
        restorePreview();
        renderSendTo();
        updateKVBtn();

        syncCompareBtn();
      }

      // ── Generate ───────────────────────────────────────────────────────────
      let running = false;
      genBtn.onclick = async () => {
        if (running || !modeHandle) return;
        running = true;
        genBtn.disabled = true; genBtn.textContent = "⏳ Queuing…";
        // 이전 이미지 위에 반투명 오버레이 (이전 결과가 뒤로 비침)
        previewBox.appendChild(loadingOv);
        loadingOv.style.display = "flex";

        // Seed
        if (state.seedMode === "randomize") { state.seed = randomSeed(); seedInput.value = state.seed; }
        else if (state.seedMode === "increment") { state.seed = (state.seed || 0) + 1; seedInput.value = state.seed; }
        else if (state.seedMode === "decrement") { state.seed = Math.max(0, (state.seed || 0) - 1); seedInput.value = state.seed; }
        persist();

        // 모델 override 읽기
        if (state.useModelOverride) {
          state.modelOverride = getOverrideSlot("model_override");
          state.clipOverride  = getOverrideSlot("clip_override");
          state.vaeOverride   = getOverrideSlot("vae_override");
        } else {
          state.modelOverride = ""; state.clipOverride = ""; state.vaeOverride = "";
        }

        // 모델 미설정 경고
        const mOk = state.modelOverride || (state.model && state.model !== "none");
        if (!mOk) {
          alert(t("klein_err_no_model"));
          running = false; genBtn.disabled = false; genBtn.textContent = "▶ Generate";
          loadingOv.style.display = "none"; if (!modeResults[state.mode]) resetPreview();
          return;
        }

        // beforeGenerate 검증
        try { await modeHandle.beforeGenerate?.(); } catch(err) {
          alert(err.message); running = false;
          genBtn.disabled = false; genBtn.textContent = "▶ Generate";
          loadingOv.style.display = "none"; if (!modeResults[state.mode]) resetPreview();
          return;
        }

        let prompt;
        try {
          prompt = await modeHandle.getGraph();
          // prompt_override 주입
          const po = getPromptOverride();
          if (po) {
            for (const n of Object.values(prompt)) {
              if (n.class_type === "CLIPTextEncode" && n.inputs?.text) {
                n.inputs.text = po + " " + n.inputs.text;
              }
            }
          }
        } catch(err) {
          alert(`Build error: ${err.message}`);
          running = false; genBtn.disabled = false; genBtn.textContent = "▶ Generate";
          loadingOv.style.display = "none"; if (!modeResults[state.mode]) resetPreview();
          return;
        }

        try {
          genBtn.textContent = "⏳ Running…";
          const result = await queuePrompt(prompt);
          const im = result?.output?.images?.[0];
          if (im) {
            ctx.showResult(im);
            if (state.outputMode !== "preview") {
              await saveMeta(im.filename, im.subfolder || "", { ...state, mode: state.mode });
            }
          }
        } catch(err) {
          if (err.message !== "cancelled") {
            alert(`Generation error: ${err.message}`);
          }
          loadingOv.style.display = "none";
          if (!modeResults[state.mode]) resetPreview();
        } finally {
          running = false; genBtn.disabled = false; genBtn.textContent = "▶ Generate";
          loadingOv.style.display = "none";
          state.modelOverride = ""; state.clipOverride = ""; state.vaeOverride = "";
        }
      };

      // ── Help overlay ───────────────────────────────────────────────────────
      const helpEl = el("div", { style: {
        position: "absolute", inset: "0", zIndex: "9998",
        background: "rgba(11,11,11,0.98)", borderRadius: "inherit",
        display: "none", flexDirection: "column",
        padding: "14px", gap: "0", boxSizing: "border-box",
      }});
      const helpTop = el("div", { style: { display:"flex", alignItems:"center", gap:"8px", flexShrink:"0", marginBottom:"10px" }});
      helpTop.appendChild(el("div", { text: t("help_title_klein"), style: { color:"#ffffff", fontSize:"14px", fontWeight:"700", flex:"1" }}));
      const helpClose = button("✕", () => { helpEl.style.display = "none"; }, "danger");
      helpTop.appendChild(helpClose);
      helpEl.appendChild(helpTop);

      const helpBody = el("div", { style: { flex:"1", overflowY:"auto", display:"flex", flexDirection:"column", gap:"12px", paddingRight:"4px" }});
      helpBody.className = "fk-lp";
      const URL_RE = /https?:\/\/[^\s]+/g;
      function renderHelpLine(line, block) {
        const isIndent = line.startsWith("•") || line.startsWith(" ");
        const color = line.startsWith("•") ? "#c8c8c8" : isIndent ? "#a0a0a0" : C.text;
        const div = el("div", { style: { fontSize:"11.5px", lineHeight:"1.65", paddingLeft: isIndent ? "8px" : "0", color }});
        const urls = [...line.matchAll(URL_RE)];
        if (urls.length === 0) { div.textContent = line || " "; }
        else {
          let last = 0;
          urls.forEach(m => {
            if (m.index > last) div.appendChild(document.createTextNode(line.slice(last, m.index)));
            const a = el("a", { href: m[0], target:"_blank", rel:"noopener", text: m[0], style: { color: LIME, wordBreak:"break-all", fontSize:"11px" }});
            div.appendChild(a); last = m.index + m[0].length;
          });
          if (last < line.length) div.appendChild(document.createTextNode(line.slice(last)));
        }
        block.appendChild(div);
      }
      HELP_SECTIONS.forEach(sec => {
        const block = el("div", { style: { background:C.bg1, border:`1px solid ${C.border}`, borderRadius:"8px", padding:"10px 12px" }});
        block.appendChild(el("div", { text: sec.title, style: { color:LIME, fontSize:"12px", fontWeight:"700", marginBottom:"6px", letterSpacing:"0.04em" }}));
        sec.body.split("\n").forEach(line => renderHelpLine(line, block));
        helpBody.appendChild(block);
      });
      helpEl.appendChild(helpBody);
      helpOv = { el: helpEl, show() { helpEl.style.display = "flex"; } };

      // ── Overlays ───────────────────────────────────────────────────────────
      settingsOv = createSettingsOverlay(state, ctx);
      root.appendChild(settingsOv.el);

      galleryOv = createGalleryOverlay(
        state, ctx,
        meta => { Object.assign(state, meta); persist(); renderPills(); renderMode(); },
        (mode, field, _extra, filename) => {
          state[field] = filename; state.mode = mode; persist();
          renderPills(); renderMode();
        }
      );
      root.appendChild(galleryOv.el);

      // Templates overlay
      import("./ui_prompt_templates.js").then(mod => {
        if (!mod.createTemplateOverlay) return;
        const tOv = mod.createTemplateOverlay(state, ctx, txt => {
          setModePrompt(state.mode, txt); promptTA.value = txt; persist(); updateCount();
        });
        root.appendChild(tOv.el);
        tplBtn.onclick = () => tOv.show();
      }).catch(() => {});

      root.appendChild(promptExpandEl);
      root.appendChild(helpEl);

      // ── ESC key: close topmost overlay ────────────────────────────────────
      document.addEventListener("keydown", e => {
        if (e.key !== "Escape") return;
        if (promptExpandEl.style.display !== "none") { promptExpandEl.style.display = "none"; return; }
        if (helpEl.style.display !== "none") { helpEl.style.display = "none"; return; }
        if (settingsOv?.el.style.display !== "none") { settingsOv.hide(); return; }
        if (galleryOv?.el.style.display !== "none") { galleryOv.el.style.display = "none"; return; }
      });

      // ── Register DOM widget ────────────────────────────────────────────────
      self.addDOMWidget("ui", "div", root, {
        serialize: false,
        computeSize: () => [NODE_W, NODE_H],
      });

      // Initial render
      renderPills();
      renderMode();
      updateKVBtn();
      syncCompareBtn();
    };
  },
});

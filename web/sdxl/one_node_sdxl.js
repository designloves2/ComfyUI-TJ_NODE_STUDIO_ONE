// one_node_sdxl.js — SDXL ONE STUDIO (TJ)
import { app } from "../../../scripts/app.js";
import { C, el, clear, NODE_W, PREVIEW_SIZE, LEFT_W, PAD, BRAND,
         randomSeed, loadState, saveState, defaultState } from "./core_sdxl.js";
import { panel, label, button, select, numberField, row, col,
         modeBar, iconBtn, openFullscreen } from "../klein/ui_common.js";
import { queuePrompt, interrupt, setLastImage, saveMeta, copyOutputToInput } from "./api_sdxl.js";
import { createSettingsOverlay }  from "./ui_app_settings_sdxl.js";
import { createGalleryOverlay }   from "./ui_gallery_sdxl.js";
import { mountT2ILeft }           from "./ui_t2i_sdxl.js";
import { mountI2ILeft }           from "./ui_i2i_sdxl.js";
import { mountInpaintLeft }       from "./ui_inpaint_sdxl.js";
import { mountOutpaintLeft }      from "./ui_outpaint_sdxl.js";
import { mountUpscaleLeft }       from "./ui_upscale_sdxl.js";
import { attachLLMPanel }         from "../shared/llm_panel.js";

// ── Layout ─────────────────────────────────────────────────────────────────────
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
  { key: "inpaint",  label: "INPAINT",  enabled: true },
  { key: "outpaint", label: "OUTPAINT", enabled: true },
  { key: "upscale",  label: "UPSCALE",  enabled: true },
];

const SEND_TO = {
  t2i:      [{ mode:"i2i",      label:"→ I2I",      field:"i2iImage"      },
              { mode:"inpaint",  label:"→ Inpaint",  field:"inpaintImage"  },
              { mode:"outpaint", label:"→ Outpaint", field:"outpaintImage" },
              { mode:"upscale",  label:"→ Upscale",  field:"upscaleImage"  }],
  i2i:      [{ mode:"inpaint",  label:"→ Inpaint",  field:"inpaintImage"  },
              { mode:"outpaint", label:"→ Outpaint", field:"outpaintImage" },
              { mode:"upscale",  label:"→ Upscale",  field:"upscaleImage"  }],
  inpaint:  [{ mode:"i2i",      label:"→ I2I",      field:"i2iImage"      },
              { mode:"outpaint", label:"→ Outpaint", field:"outpaintImage" },
              { mode:"upscale",  label:"→ Upscale",  field:"upscaleImage"  }],
  outpaint: [{ mode:"i2i",      label:"→ I2I",      field:"i2iImage"      },
              { mode:"inpaint",  label:"→ Inpaint",  field:"inpaintImage"  },
              { mode:"upscale",  label:"→ Upscale",  field:"upscaleImage"  }],
  upscale:  [{ mode:"i2i",      label:"→ I2I",      field:"i2iImage"      },
              { mode:"inpaint",  label:"→ Inpaint",  field:"inpaintImage"  },
              { mode:"outpaint", label:"→ Outpaint", field:"outpaintImage" }],
};

// ── Compare view ───────────────────────────────────────────────────────────────
function createCompareView(originalURL, resultURL) {
  const container = el("div", { style: { position:"relative", width:"100%", height:"100%", overflow:"hidden", borderRadius:"8px" }});
  const resultImg = el("img", { src: resultURL,   style: { position:"absolute", inset:"0", width:"100%", height:"100%", objectFit:"contain" }});
  const origWrap  = el("div", { style: { position:"absolute", inset:"0 auto 0 0", width:"100%", overflow:"hidden" }});
  const origImg   = el("img", { src: originalURL, style: { position:"absolute", inset:"0", width:`${PREVIEW_SIZE}px`, height:"100%", objectFit:"contain" }});
  origWrap.appendChild(origImg);
  const divider = el("div", { style: { position:"absolute", top:"0", bottom:"0", left:"100%", width:"3px", background:"rgba(255,255,255,0.85)", cursor:"ew-resize", zIndex:"10" }});
  const handle  = el("div", { style: { position:"absolute", top:"50%", left:"-10px", transform:"translateY(-50%)", width:"20px", height:"40px", borderRadius:"10px", background:BRAND, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:"11px", userSelect:"none" }, text:"⟺" });
  divider.appendChild(handle);
  let pos = 50;
  function update(p) { pos = Math.max(0,Math.min(100,p)); origWrap.style.width=pos+"%"; divider.style.left=pos+"%"; }
  update(0);
  divider.addEventListener("pointerdown", e => {
    divider.setPointerCapture(e.pointerId);
    const mv = e2 => { const r=container.getBoundingClientRect(); update((e2.clientX-r.left)/r.width*100); };
    const up = () => { divider.removeEventListener("pointermove",mv); divider.removeEventListener("pointerup",up); };
    divider.addEventListener("pointermove",mv); divider.addEventListener("pointerup",up);
  });
  container.appendChild(resultImg); container.appendChild(origWrap); container.appendChild(divider);
  return container;
}

// ── Extension ──────────────────────────────────────────────────────────────────
app.registerExtension({
  name: "TJ.SDXLONE.v1",

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "SDXLOneTJNode") return;

    nodeType.prototype.onNodeCreated = function () {
      this.color       = BRAND;
      this.bgcolor     = C.bg0;
      this.title_color = "#ffffff";
      this.resizable   = false;
      this.size        = [NODE_W, NODE_H];
      this._buildUI();
    };
    nodeType.prototype.onConfigure = function () { this.size = [NODE_W, NODE_H + (this._extraH || 0)]; };
    nodeType.prototype.onResize    = function () { this.size = [NODE_W, NODE_H + (this._extraH || 0)]; };
    nodeType.prototype.getSlotMenuOptions = function () { return []; };

    nodeType.prototype._buildUI = function () {
      const self   = this;
      self._extraH = 0;
      const state  = defaultState(loadState());
      const persist = () => saveState(state);
      const appConfig = { output_mode_visible: true };
      const modeResults = {};

      if (!document.getElementById("sx-styles")) {
        const s = document.createElement("style");
        s.id = "sx-styles";
        s.textContent = `
          @keyframes sx-spin{to{transform:rotate(360deg)}}
          .sx-lp::-webkit-scrollbar{width:4px}
          .sx-lp::-webkit-scrollbar-track{background:transparent}
          .sx-lp::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px}
        `;
        document.head.appendChild(s);
      }

      // prompt override slot helper
      function getOverrideSlot(slotName) {
        try {
          const idx = self.inputs?.findIndex(i => i.name === slotName);
          if (idx == null || idx < 0) return "";
          const linkId = self.inputs[idx]?.link;
          if (linkId == null) return "";
          const link = app.graph.links[linkId];
          if (!link) return "";
          const srcNode = app.graph.getNodeById(link.origin_id);
          if (!srcNode) return "";
          return srcNode.widgets?.[link.origin_slot]?.value ?? srcNode.widgets?.[0]?.value ?? "";
        } catch(e) { return ""; }
      }
      const getPromptOverride = () => getOverrideSlot("prompt_override");

      // ── Root ────────────────────────────────────────────────────────────────
      const root = el("div", { style: {
        width: `${NODE_W}px`, height: `${ROOT_H}px`, boxSizing: "border-box",
        position: "relative", overflow: "hidden",
        background: C.bg0, borderRadius: "8px",
        padding: `${PAD}px ${PAD}px ${BOTTOM_PAD}px ${PAD}px`,
        color: C.text, fontFamily: "'Segoe UI', sans-serif",
      }});

      let popTimer;
      function showPopup(msg, isError = true) {
        let pop = root.querySelector(".sx-pop");
        if (!pop) {
          pop = el("div", { style: {
            position: "absolute", bottom: "30px", left: "50%", transform: "translateX(-50%)",
            background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "6px",
            padding: "6px 14px", fontSize: "11px", color: C.text, zIndex: "10001",
            maxWidth: "80%", textAlign: "center", pointerEvents: "none",
          }});
          pop.className = "sx-pop";
          root.appendChild(pop);
        }
        pop.textContent = msg;
        pop.style.color = isError ? C.err : BRAND;
        pop.style.opacity = "1";
        clearTimeout(popTimer);
        popTimer = setTimeout(() => { pop.style.opacity = "0"; }, 3500);
      }

      const ctx = {
        persist, appConfig, availableLoras: [], rootEl: root,
        _rerenderLoras: null, renderToggle: null, _refreshToggle: null,
        showPopup, resizeNode: () => {},
      };

      // ── Top bar ──────────────────────────────────────────────────────────────
      const topBar = el("div", { style: {
        display: "flex", alignItems: "center", gap: "6px",
        height: `${TOPBAR_H}px`, marginBottom: `${PAD}px`, flexShrink: "0",
      }});

      const pillsWrap = el("div", { style: { flex: "1" } });

      function renderPills() {
        clear(pillsWrap);
        pillsWrap.appendChild(modeBar(MODES, state.mode, key => {
          state.mode = key; persist();
          renderPills(); renderMode();
        }));
      }

      // Model mode indicator
      const modeIndicator = el("div", { style: {
        fontSize: "11px", fontWeight: "700", color: "#ffffff",
        height: "30px", padding: "0 8px", borderRadius: "7px",
        border: `1px solid ${C.border}`, background: C.bg2,
        flexShrink: "0", display: "flex", alignItems: "center",
        boxSizing: "border-box",
      }});
      function updateModeIndicator() {
        modeIndicator.textContent = state.modelLoaderMode === "separate" ? "UNET" : "CKPT";
      }
      updateModeIndicator();
      ctx._refreshModeIndicator = updateModeIndicator;

      // Reset button
      const resetBtn = iconBtn("↺", "Reset state (keeps model selection)", () => {
        if (!confirm("Reset all settings? (Model selection is preserved)")) return;
        const preserve = {
          checkpoint: state.checkpoint, refinerCheckpoint: state.refinerCheckpoint,
          unet: state.unet, clipL: state.clipL, clipG: state.clipG, vae: state.vae,
          modelLoaderMode: state.modelLoaderMode, useRefiner: state.useRefiner,
        };
        Object.assign(state, defaultState({}), preserve);
        // Explicitly null out all image fields so slots re-render empty
        state.i2iImage = null; state.inpaintImage = null; state.inpaintMaskImage = null;
        state.outpaintImage = null; state.upscaleImage = null;
        persist();
        renderPills();
        renderMode();   // recreates panels with initialFilename=null → empty slots
        showPopup("Reset complete", false);
      });
      resetBtn.style.cssText += `background:#ffffff;color:${BRAND};border:2px solid ${BRAND};border-radius:6px;padding:4px 8px;font-weight:700;`;
      resetBtn.onmouseenter = () => { resetBtn.style.background = "#fff5ee"; };
      resetBtn.onmouseleave = () => { resetBtn.style.background = "#ffffff"; };

      // Compare button
      let compareEnabled = true;
      const compareBtn = iconBtn("⇌", "Image compare ON/OFF", () => {
        compareEnabled = !compareEnabled;
        applyCompareBtnStyle();
        if (!compareEnabled) restorePreview(); else tryShowCompare();
      });
      compareBtn.style.cssText += "border-radius:6px;padding:4px 8px;font-weight:700;font-size:13px;";
      function applyCompareBtnStyle() {
        const on = compareEnabled && state.mode !== "t2i";
        if (on) {
          compareBtn.style.background = "#ffffff";
          compareBtn.style.color      = BRAND;
          compareBtn.style.border     = `2px solid ${BRAND}`;
          compareBtn.onmouseenter = () => { compareBtn.style.background = "#fff5ee"; };
          compareBtn.onmouseleave = () => { compareBtn.style.background = "#ffffff"; };
        } else {
          compareBtn.style.background = C.bg2;
          compareBtn.style.color      = C.muted;
          compareBtn.style.border     = `1px solid ${C.border}`;
          compareBtn.style.opacity    = "1";
          compareBtn.onmouseenter = () => { compareBtn.style.background = C.bg3; };
          compareBtn.onmouseleave = () => { compareBtn.style.background = C.bg2; };
        }
      }
      applyCompareBtnStyle();

      let settingsOv, galleryOv;

      topBar.appendChild(pillsWrap);
      topBar.appendChild(modeIndicator);
      topBar.appendChild(resetBtn);
      topBar.appendChild(compareBtn);
      topBar.appendChild(iconBtn("⚙", "Settings", () => settingsOv?.show()));
      topBar.appendChild(iconBtn("🖼", "Gallery",  () => galleryOv?.show()));
      root.appendChild(topBar);

      // ── Main row ─────────────────────────────────────────────────────────────
      const mainRow = el("div", { style: { display: "flex", gap: `${PAD}px`, height: `${RIGHT_H}px`, flexShrink: "0" } });

      const leftOuter = el("div", { style: { width: `${LEFT_W}px`, flexShrink: "0", height: `${RIGHT_H}px`, display: "flex", flexDirection: "column" } });
      const leftPanel = el("div", { style: { flex: "1", overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column", gap: "6px" } });
      leftPanel.className = "sx-lp";
      leftOuter.appendChild(leftPanel);

      const rightPanel = el("div", { style: { flex: "1", minWidth: `${PREVIEW_SIZE}px`, display: "flex", flexDirection: "column", gap: `${PAD}px`, height: `${RIGHT_H}px` } });

      // Preview
      const previewBox = el("div", { style: {
        width: `${PREVIEW_SIZE}px`, height: `${PREVIEW_SIZE}px`, flexShrink: "0",
        background: "#000", borderRadius: "8px", border: `1px solid ${C.border}`,
        position: "relative", display: "flex", alignItems: "center", justifyContent: "center",
        overflow: "hidden", alignSelf: "flex-start",
      }});
      const placeholder = el("div", { text: "Generate to see result", style: { color: C.muted, fontSize: "12px" } });
      const finalImg    = el("img", { style: { maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "none" } });
      const loadingOv   = el("div", { style: { position: "absolute", inset: "0", background: "rgba(0,0,0,0.5)", display: "none", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px", zIndex: "10" } });
      const spinner     = el("div", { style: { width: "44px", height: "44px", border: `3px solid ${C.border}`, borderTop: `3px solid ${BRAND}`, borderRadius: "50%", animation: "sx-spin 0.8s linear infinite" } });
      loadingOv.appendChild(spinner);
      loadingOv.appendChild(el("div", { text: "Generating…", style: { color: C.text, fontSize: "12px" } }));

      const clearBtn = el("button", { text: "✕", type: "button", title: "Clear result", style: {
        position: "absolute", top: "6px", right: "6px", zIndex: "5",
        background: "rgba(0,0,0,0.65)", color: "#fff", border: "none",
        borderRadius: "4px", width: "22px", height: "22px",
        cursor: "pointer", fontSize: "12px", padding: "0", display: "none",
      }, onclick: () => { delete modeResults[state.mode]; resetZoom(); resetPreview(); renderSendTo(); }});

      const zoomLockBtn = el("button", { text: "🔓", type: "button", title: "Scroll zoom on/off", style: {
        position: "absolute", top: "6px", right: "32px", zIndex: "5",
        background: "rgba(0,0,0,0.65)", color: "#fff", border: "none",
        borderRadius: "4px", width: "22px", height: "22px",
        cursor: "pointer", fontSize: "11px", padding: "0", display: "none",
      }});

      let zoomEnabled = true, zoomScale = 1, panX = 0, panY = 0;
      let isPanning = false, panStartX = 0, panStartY = 0, panStartTX = 0, panStartTY = 0;
      function applyZoom() { finalImg.style.transform = `scale(${zoomScale}) translate(${panX}px, ${panY}px)`; finalImg.style.transformOrigin = "center center"; finalImg.style.cursor = zoomScale > 1 ? "grab" : "default"; }
      function resetZoom()  { zoomScale = 1; panX = 0; panY = 0; applyZoom(); }
      zoomLockBtn.addEventListener("click", () => { zoomEnabled = !zoomEnabled; zoomLockBtn.textContent = zoomEnabled ? "🔓" : "🔒"; if (!zoomEnabled) resetZoom(); });
      previewBox.addEventListener("wheel", e => {
        if (!zoomEnabled || !modeResults[state.mode]) return;
        e.preventDefault();
        zoomScale = Math.max(1, Math.min(8, zoomScale * (e.deltaY < 0 ? 1.12 : 0.9)));
        if (zoomScale === 1) { panX = 0; panY = 0; }
        applyZoom();
      }, { passive: false });
      previewBox.addEventListener("mousedown", e => {
        if (!zoomEnabled || zoomScale <= 1 || e.button !== 0) return;
        isPanning = true; panStartX = e.clientX; panStartY = e.clientY; panStartTX = panX; panStartTY = panY;
        finalImg.style.cursor = "grabbing"; e.preventDefault();
      });
      document.addEventListener("mousemove", e => { if (!isPanning) return; panX = panStartTX + (e.clientX-panStartX)/zoomScale; panY = panStartTY + (e.clientY-panStartY)/zoomScale; applyZoom(); });
      document.addEventListener("mouseup", () => { if (isPanning) { isPanning = false; finalImg.style.cursor = zoomScale > 1 ? "grab" : "default"; } });
      previewBox.addEventListener("dblclick", () => { const mr = modeResults[state.mode]; if (mr) openFullscreen(mr.url); });

      function resetPreview() {
        previewBox.innerHTML = "";
        previewBox.appendChild(placeholder); previewBox.appendChild(finalImg);
        previewBox.appendChild(loadingOv);   previewBox.appendChild(zoomLockBtn); previewBox.appendChild(clearBtn);
        placeholder.style.display = "block"; finalImg.style.display = "none";
        loadingOv.style.display = "none";    zoomLockBtn.style.display = "none"; clearBtn.style.display = "none";
        resetZoom();
      }
      resetPreview();

      let modeHandle = null;

      function tryShowCompare() {
        const mr = modeResults[state.mode];
        if (!mr) return;
        const src = modeHandle?.getSourceURL?.();
        previewBox.innerHTML = "";
        clearBtn.style.display = "block"; zoomLockBtn.style.display = "block";
        if (compareEnabled && state.mode !== "t2i" && src) {
          previewBox.appendChild(createCompareView(src, mr.url));
          resetZoom();
        } else {
          placeholder.style.display = "none";
          finalImg.src = mr.url; finalImg.style.display = "block";
          previewBox.appendChild(placeholder); previewBox.appendChild(finalImg);
        }
        loadingOv.style.display = "none";
        previewBox.appendChild(loadingOv); previewBox.appendChild(zoomLockBtn); previewBox.appendChild(clearBtn);
      }

      function restorePreview() { const mr = modeResults[state.mode]; if (!mr) { resetPreview(); return; } tryShowCompare(); }

      ctx.showResult = (im) => {
        const url = `/view?filename=${encodeURIComponent(im.filename)}&subfolder=${encodeURIComponent(im.subfolder||"")}&type=${im.type||"output"}&t=${Date.now()}`;
        modeResults[state.mode] = { im, url };
        loadingOv.style.display = "none";
        tryShowCompare(); renderSendTo();
        setLastImage(self.id, im).catch(() => {});
      };

      // ── Send-to strip ─────────────────────────────────────────────────────────
      const sendToWrap = el("div", { style: { height: `${SEND_TO_H}px`, flexShrink: "0", display: "flex", alignItems: "center", gap: "8px", overflow: "hidden" } });
      const sendLeft  = el("div", { style: { flex: "1", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px" } });
      const sendRight = el("div", { style: { display: "flex", alignItems: "center", gap: "4px", flexShrink: "0" } });
      sendToWrap.appendChild(sendLeft); sendToWrap.appendChild(sendRight);

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
              const n = await copyOutputToInput(mr.im.filename, mr.im.subfolder||"", mr.im.type||"output");
              // Always update state first
              state[t.field] = n;
              persist();
              if (t.mode === state.mode && modeHandle?.setImageField) {
                modeHandle.setImageField(t.field, n);
                btn.disabled = false; btn.textContent = t.label;
              } else {
                state.mode = t.mode; renderPills(); renderMode();
              }
            } catch(e) { btn.disabled = false; btn.textContent = t.label; }
          });
          sendLeft.appendChild(btn);
        });
      }

      function renderOutputToggle() {
        clear(sendRight);
        if (appConfig.output_mode_visible === false) return;
        sendRight.appendChild(el("div", { text: "Output:", style: { color: C.muted, fontSize: "11px" } }));
        ["preview", "save"].forEach(key => {
          const active = state.outputMode === key;
          const b = el("button", { text: key === "save" ? "💾 Save" : "👁 Preview", type: "button", style: {
            cursor: "pointer", fontFamily: "inherit", fontSize: "11px",
            padding: "4px 10px", borderRadius: "20px",
            background: active ? BRAND : C.bg2, color: "#ffffff",
            border: `1px solid ${active ? BRAND : C.border}`, fontWeight: active ? "700" : "400",
          }, onclick: () => { state.outputMode = key; persist(); renderOutputToggle(); }});
          sendRight.appendChild(b);
        });
      }
      renderOutputToggle();
      ctx.renderToggle = renderOutputToggle;
      ctx._refreshToggle = renderOutputToggle;

      // ── Prompt expand overlay ─────────────────────────────────────────────────
      const promptExpandEl = el("div", { style: {
        position: "absolute", inset: "0", zIndex: "9997",
        background: "rgba(11,11,11,0.97)", borderRadius: "inherit",
        display: "none", flexDirection: "column", padding: "14px", gap: "8px", boxSizing: "border-box",
      }});
      const pxHdr = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" }});
      pxHdr.appendChild(el("div", { text: "🔍 Prompt (Full Screen Edit)", style: { color: "#fff", fontSize: "13px", fontWeight: "700", flex: "1" }}));
      const pxTA = el("textarea", { style: {
        flex: "1", background: C.bg2, color: C.text,
        border: `1px solid ${BRAND}`, borderRadius: "6px",
        padding: "10px", fontSize: "13px", fontFamily: "inherit",
        resize: "none", outline: "none",
      }});
      const pxApply = button("✓ Apply", () => {
        setModePrompt(state.mode, pxTA.value);
        promptTA.value = pxTA.value; persist(); updateCount();
        promptExpandEl.style.display = "none";
      }, "primary");
      const pxClose = button("✕ Close", () => { promptExpandEl.style.display = "none"; }, "danger");
      pxHdr.appendChild(pxApply); pxHdr.appendChild(pxClose);
      promptExpandEl.appendChild(pxHdr); promptExpandEl.appendChild(pxTA);
      const promptExpandOv = {
        show() { promptExpandEl._tj_llm_onshow?.(); promptExpandEl.style.display = "flex"; setTimeout(() => pxTA.focus(), 50); },
        hide() { promptExpandEl.style.display = "none"; },
      };

      // ── Prompt area ───────────────────────────────────────────────────────────
      const promptWrap = el("div", { style: { height: `${PROMPT_H}px`, flexShrink: "0", display: "flex", flexDirection: "column", gap: "4px" } });
      const charCount  = el("span", { style: { color: C.muted, fontSize: "10px", marginLeft: "6px" } });
      const promptHdr  = el("div", { style: { display: "flex", alignItems: "center", height: `${PROMPT_LBL}px` } });
      promptHdr.appendChild(el("div", { text: "PROMPT", style: { color: C.muted, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.04em" } }));
      promptHdr.appendChild(charCount);
      const expandBtn = el("button", { type: "button", text: "🔍", title: "Full-screen edit", style: {
        cursor: "pointer", background: "transparent", border: "none", fontSize: "12px",
        color: C.muted, padding: "0 3px", marginLeft: "auto",
      }, onclick: () => promptExpandOv.show() });
      promptHdr.appendChild(expandBtn);

      const tplBtn = el("button", { type: "button", text: "📋", title: "Load Template", style: {
        cursor: "pointer", background: "transparent", border: "none", fontSize: "12px",
        color: C.muted, padding: "0 3px",
      }});
      promptHdr.appendChild(tplBtn);

      const promptTA = el("textarea", { placeholder: "Describe the image…", style: {
        flex: "1", width: "100%", boxSizing: "border-box",
        background: C.bg2, color: C.text, border: `1px solid ${C.border}`, borderRadius: "6px",
        padding: "7px", fontSize: "13px", fontFamily: "inherit", outline: "none", resize: "none", overflowY: "auto",
      }});

      function getModePrompt(mode)    { return state.promptsByMode?.[mode] || ""; }
      function setModePrompt(mode, v) { if (!state.promptsByMode) state.promptsByMode = {}; state.promptsByMode[mode] = v; state.prompt = v; }

      promptTA.value = getModePrompt(state.mode);
      function updateCount() {
        const n = getModePrompt(state.mode).trim().length;
        charCount.textContent = ` (${n} chars${n < 20 ? " ⚠" : ""})`;
        charCount.style.color = n < 20 ? C.warn : C.muted;
      }
      updateCount();
      promptTA.addEventListener("input", () => { setModePrompt(state.mode, promptTA.value); persist(); updateCount(); });
      promptTA.addEventListener("focus", () => promptTA.style.borderColor = BRAND);
      promptTA.addEventListener("blur",  () => promptTA.style.borderColor = C.border);
      ctx.updatePromptTA = () => { promptTA.value = getModePrompt(state.mode); updateCount(); };
      attachLLMPanel({ promptExpandEl, pxTA, getModePrompt, setModePrompt, state, persist, updateCount, getPromptTA: () => promptTA });

      promptWrap.appendChild(promptHdr); promptWrap.appendChild(promptTA);
      rightPanel.appendChild(previewBox); rightPanel.appendChild(sendToWrap); rightPanel.appendChild(promptWrap);
      mainRow.appendChild(leftOuter); mainRow.appendChild(rightPanel);
      root.appendChild(mainRow);

      // ── Seed + Generate ───────────────────────────────────────────────────────
      const seedInput   = numberField(state.seed, v => { state.seed = v; persist(); }, 1);
      const seedModeDD  = select(
        [{ value: "randomize", label: "Random" }, { value: "fixed", label: "Fixed" },
         { value: "increment", label: "+1" },     { value: "decrement", label: "-1" }],
        state.seedMode, v => { state.seedMode = v; persist(); }
      );
      const seedGenWrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "4px", paddingTop: "6px", flexShrink: "0", borderTop: `1px solid ${C.border}` } });
      seedGenWrap.appendChild(panel([row([col([label("SEED"), seedInput]), col([label("MODE"), seedModeDD])])]));

      const genBtn  = button("▶ Generate", null, "primary");
      genBtn.style.cssText += "width:100%;padding:11px;font-size:13px;";
      const stopBtn = button("■ Stop", async () => {
        running = false;
        await interrupt();
        genBtn.disabled = false; genBtn.textContent = "▶ Generate";
        loadingOv.style.display = "none";
        if (!modeResults[state.mode]) resetPreview();
      });
      stopBtn.style.flexShrink = "0";
      seedGenWrap.appendChild(row([genBtn, stopBtn]));

      // ── Mode rendering ────────────────────────────────────────────────────────
      function renderMode() {
        const mode = state.mode;
        clear(leftPanel); modeHandle = null;
        switch (mode) {
          case "t2i":      modeHandle = mountT2ILeft(leftPanel,     state, ctx); break;
          case "i2i":      modeHandle = mountI2ILeft(leftPanel,     state, ctx); break;
          case "inpaint":  modeHandle = mountInpaintLeft(leftPanel,  state, ctx); break;
          case "outpaint": modeHandle = mountOutpaintLeft(leftPanel, state, ctx); break;
          case "upscale":  modeHandle = mountUpscaleLeft(leftPanel,  state, ctx); break;
        }
        leftOuter.appendChild(seedGenWrap);
        promptTA.value = getModePrompt(mode);
        promptTA.placeholder = "Describe what you want to generate…";
        updateCount();
        restorePreview(); renderSendTo(); applyCompareBtnStyle();
        updateModeIndicator();
      }

      // ── Generate ──────────────────────────────────────────────────────────────
      let running = false;
      genBtn.onclick = async () => {
        if (running || !modeHandle) return;

        // Check model is set
        const mode = state.modelLoaderMode || "checkpoint";
        const modelOk = mode === "checkpoint"
          ? (state.checkpoint && state.checkpoint !== "none")
          : (state.unet && state.unet !== "none");
        if (!modelOk) {
          showPopup("Settings ⚙에서 모델을 선택하세요.");
          return;
        }

        running = true;
        genBtn.disabled = true; genBtn.textContent = "⏳ Queuing…";
        previewBox.appendChild(loadingOv);
        loadingOv.style.display = "flex";

        // Seed
        if (state.seedMode === "randomize")  { state.seed = randomSeed();               seedInput.value = state.seed; }
        else if (state.seedMode === "increment") { state.seed = (state.seed||0) + 1;    seedInput.value = state.seed; }
        else if (state.seedMode === "decrement") { state.seed = Math.max(0,(state.seed||0)-1); seedInput.value = state.seed; }
        persist();

        // beforeGenerate
        try { await modeHandle.beforeGenerate?.(); } catch(err) {
          showPopup(err.message);
          running = false; genBtn.disabled = false; genBtn.textContent = "▶ Generate";
          loadingOv.style.display = "none";
          if (!modeResults[state.mode]) resetPreview();
          return;
        }

        let prompt;
        try {
          prompt = modeHandle.getGraph();
          if (prompt instanceof Promise) prompt = await prompt;
          // prompt_override injection (positive CLIPTextEncode nodes)
          const po = getPromptOverride();
          if (po) {
            for (const n of Object.values(prompt)) {
              if (n.class_type === "CLIPTextEncode" && n.inputs?.text && !n._meta?.title?.toLowerCase().includes("neg")) {
                n.inputs.text = po + " " + n.inputs.text;
              }
            }
          }
        } catch(err) {
          showPopup(`Build error: ${err.message}`);
          running = false; genBtn.disabled = false; genBtn.textContent = "▶ Generate";
          loadingOv.style.display = "none";
          if (!modeResults[state.mode]) resetPreview();
          return;
        }

        try {
          genBtn.textContent = "⏳ Running…";
          const result = await queuePrompt(prompt);
          const im = result?.output?.images?.[0];
          if (im) {
            ctx.showResult(im);
            if (state.outputMode !== "preview") {
              await saveMeta(im.filename, im.subfolder||"", { ...state, mode: state.mode });
            }
          }
        } catch(err) {
          if (err.message !== "cancelled") showPopup(`Error: ${err.message}`);
          loadingOv.style.display = "none";
          if (!modeResults[state.mode]) resetPreview();
        } finally {
          running = false; genBtn.disabled = false; genBtn.textContent = "▶ Generate";
          loadingOv.style.display = "none";
        }
      };

      // ── Overlays ───────────────────────────────────────────────────────────────
      settingsOv = createSettingsOverlay(state, ctx);
      root.appendChild(settingsOv.el);

      galleryOv = createGalleryOverlay(
        state, ctx,
        // onReuse: load full saved meta and re-render
        meta => { Object.assign(state, meta); persist(); renderPills(); renderMode(); },
        // onSendTo: update image field reactively
        (mode, field, filename) => {
          // State must always be updated first so getGraph/beforeGenerate see the new file
          state[field] = filename;
          persist();
          if (mode === state.mode && modeHandle?.setImageField) {
            // Same mode: update the slot in-place — no full re-render needed
            modeHandle.setImageField(field, filename);
          } else {
            // Different mode: full re-render (new panel reads state.field correctly)
            state.mode = mode;
            renderPills();
            renderMode();
          }
        }
      );
      root.appendChild(galleryOv.el);

      // Template overlay
      import("../klein/ui_prompt_templates.js").then(mod => {
        if (!mod.createTemplateOverlay) return;
        const tOv = mod.createTemplateOverlay(state, ctx, txt => {
          setModePrompt(state.mode, txt); promptTA.value = txt; persist(); updateCount();
        });
        root.appendChild(tOv.el);
        tplBtn.onclick = () => tOv.show();
      }).catch(() => {});

      root.appendChild(promptExpandEl);

      // ESC closes topmost overlay
      document.addEventListener("keydown", e => {
        if (e.key !== "Escape") return;
        if (promptExpandEl.style.display !== "none") { promptExpandEl.style.display = "none"; return; }
        if (settingsOv?.el.style.display !== "none") { settingsOv.hide(); return; }
        if (galleryOv?.el.style.display  !== "none") { galleryOv.el.style.display = "none"; return; }
      });

      // Register DOM widget
      self.addDOMWidget("ui", "div", root, {
        serialize: false,
        computeSize: () => [NODE_W, NODE_H + (self._extraH || 0)],
      });

      renderPills();
      renderMode();
    };
  },
});

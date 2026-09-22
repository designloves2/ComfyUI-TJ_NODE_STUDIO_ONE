// one_node_itda_studio.js — ITDA STUDIO (TJ)
//
// Mounts ITDA's REAL editor — index.html's own markup (dom_build.js, id-for-id) and
// app.js's own logic (itda_app_ported.js, mechanically unchanged except `$` reading
// from a per-instance id map instead of document.getElementById, and the /itda/api/
// route prefix -> /itda_studio_one/api/) — as plain DOM inside this node, not a
// separate embedded document. style.css is ITDA's own stylesheet, wrapped in a native
// CSS @scope block so it can be injected unmodified without leaking into the rest of
// ComfyUI's page. Everything (split/group/stitch/snap/box-select/copy-paste/preview
// modes/waveforms/Auto Stitch/Scene+Beat Detect/Versions/Pre-render) is the same code
// that already worked, not a reimplementation.
//
// Two deliberate differences from the original, both per explicit direction:
// - Media Bin: local files are video/audio only (no image/text) and gains a gallery
//   import path (H3 video gallery, MusicMaker playlist) alongside local upload.
// - Clip Properties is a collapsible slide-out (propsToggle) instead of a fixed-width
//   column — this node is far narrower than the full-page editor's original layout.
import { app } from "../../scripts/app.js";
import { BRAND, NODE_W, NODE_H, loadState, saveState, defaultState } from "./itda_studio/core_itda_studio.js";
import { buildItdaDom } from "./itda_studio/dom_build.js";
import { mountItdaApp } from "./itda_studio/itda_app_ported.js";
import { openVideoGalleryPicker } from "./minimax/ui_video_picker_minimax.js";
import { openAudioGalleryPicker } from "./shared/ui_audio_gallery_picker.js";
import { createNodeFullscreen } from "./shared/node_fullscreen.js";

const API = "/itda_studio_one";

// ComfyUI's own file-agnostic upload route isn't used here — local upload goes through
// ITDA's own /itda_studio_one/api/media/upload (ported verbatim, itda_studio_backend/).
// Gallery import is the one new path: copy the picked file into the SAME per-project
// media folder that upload already uses, then let the ported app.js's own scanMedia()
// pick it up — see nodes.py's /itda_studio_one/media/from_gallery.
async function importFromGallery(kind, project, filename, subfolder, type) {
  const r = await fetch(`${API}/media/from_gallery`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project, filename, subfolder: subfolder || "", type: type || "output" }),
  });
  const d = await r.json();
  if (!d.ok) throw new Error(d.error || "import failed");
  return d.path;
}

let stylesInjected = false;
function injectScopedStyles(css) {
  if (stylesInjected) return;
  stylesInjected = true;
  const s = document.createElement("style");
  s.id = "itda-studio-scoped-styles";
  // @scope keeps ITDA's own stylesheet (button{}/input{}/*{} and everything else,
  // completely unmodified) from ever touching anything outside .itda-studio-root —
  // no Shadow DOM, still plain light DOM, just scoped at the CSS level.
  s.textContent = `@scope (.itda-studio-root) {\n${css}\n}\n` +
    // Our own small addition, not part of ITDA's original: the collapsible
    // Properties slide-out (see propsToggle wiring below).
    `@scope (.itda-studio-root) {
      .itda-props-slide{width:0;min-width:0;transition:width 160ms ease;overflow:hidden;border:none!important}
      .itda-props-slide.open{width:280px;min-width:280px;border-left:1px solid var(--flat-line,#2b2f38)!important}
      .upper{grid-template-columns:26% 1fr 0!important}
      .upper:has(.itda-props-slide.open){grid-template-columns:24% 1fr 280px!important}
    }`;
  document.head.appendChild(s);
}

app.registerExtension({
  name: "TJ.ItdaStudioONE",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "ItdaStudioOneTJNode") return;

    nodeType.prototype.onNodeCreated = function () {
      this.color = BRAND; this.bgcolor = "#0b0b0b"; this.title_color = "#fff";
      this.resizable = false; this.size = [NODE_W, NODE_H];
      this._buildUI();
    };
    nodeType.prototype.onResize = function () { this.size = [NODE_W, NODE_H]; };
    nodeType.prototype.getSlotMenuOptions = function () { return []; };
    const _origRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      try { this._itdaStop?.(); } catch {}
      return _origRemoved?.apply(this, arguments);
    };

    nodeType.prototype._buildUI = async function () {
      const self = this;
      const ui = defaultState(loadState());

      const cssResp = await fetch("/extensions/ComfyUI-TJ_NODE_STUDIO_ONE/itda_studio/itda_style.css");
      const css = await cssResp.text();
      injectScopedStyles(css);

      const { root, IDS } = buildItdaDom();
      root.style.width = `${NODE_W}px`;
      root.style.height = `${NODE_H}px`;

      const nodeFsBtn = IDS.nodeFsBtn;
      const fullscreen = createNodeFullscreen(root, NODE_W, NODE_H, (open) => {
        nodeFsBtn.style.background = open ? "#fff" : "";
        nodeFsBtn.style.color = open ? "#000" : "";
        nodeFsBtn.title = open ? "Exit fullscreen" : "Fullscreen this node";
      });
      nodeFsBtn.addEventListener("click", () => fullscreen.toggle());

      // Collapsible Clip Properties (our own addition — see injectScopedStyles).
      IDS.propsToggle.addEventListener("click", () => {
        IDS.propsPanel.classList.toggle("open");
      });

      const HOOKS = {
        projectName: ui.projectName || "untitled",
        pickVideoFromGallery: (onDone) => {
          openVideoGalleryPicker(async (inputFilename) => {
            try {
              await importFromGallery("video", api.state?.project?.name || ui.projectName, inputFilename, "", "input");
              onDone(inputFilename);
            } catch (e) { console.error("[ITDA STUDIO] gallery video import failed", e); }
          });
        },
        pickAudioFromGallery: (onDone) => {
          openAudioGalleryPicker(async (inputFilename) => {
            try {
              await importFromGallery("audio", api.state?.project?.name || ui.projectName, inputFilename, "", "input");
              onDone(inputFilename);
            } catch (e) { console.error("[ITDA STUDIO] gallery audio import failed", e); }
          });
        },
      };

      self.addDOMWidget("itda_ui", "div", root, { serialize: false, computeSize: () => [NODE_W, NODE_H] });

      const api = mountItdaApp(root, IDS, HOOKS);
      self._itdaStop = () => { try { api.state.playing = false; } catch {} try { fullscreen.exit(); } catch {} };

      // Persist the project name per node instance (localStorage), same convention
      // every other tool in this app uses.
      const projInput = IDS.projectName;
      projInput?.addEventListener("change", () => {
        ui.projectName = projInput.value.trim() || "untitled";
        saveState(ui);
      });
    };
  },
});

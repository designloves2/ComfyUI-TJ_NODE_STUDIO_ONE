// dom_build.js — constructs ITDA's own index.html markup via el(), id-for-id, so the
// verbatim-ported app.js (itda_app_ported.js, whose only change is `$` reading from an
// id map instead of document.getElementById) works completely unmodified against it.
// Media-pool scope cut (video/audio only, gallery + local upload — no image/text) is the
// only structural difference from the original markup; the Clip Properties panel is a
// collapsible slide-out instead of a fixed 25%-width column, since this node is far
// narrower than the full-page editor ITDA's markup was designed for.
// NOT klein/core_klein.js's el() — it never special-cases className/value (setAttribute
// silently no-ops on those), the exact bug already found and fixed once this session in
// core_itda_studio.js's own el(). Reuse that fixed one instead of hitting it again here.
import { el } from "./core_itda_studio.js";

function mk(tag, id, props, children) {
  const p = { ...(props || {}) };
  if (id) p.id = id;
  return el(tag, p, children);
}

export function buildItdaDom() {
  const IDS = {};
  const reg = (elm) => { if (elm && elm.id) IDS[elm.id] = elm; return elm; };
  const R = (tag, id, props, children) => reg(mk(tag, id, props, children));

  // ── topbar — decluttered: this node's own purple title bar already reads
  // "ITDA STUDIO (TJ)", so the original's redundant in-panel brand text is dropped, and
  // Settings/Project/Save/Export/Send-to-ComfyUI (all real, all still wired to the exact
  // same ids/handlers) live inside one "☰ Menu" dropdown instead of five separate
  // top-level buttons — this node is nowhere near ITDA's original full-page width.
  const menuDropdown = R("div", "itdaMenuDropdown", { className: "itda-menu-dropdown" }, [
    R("button", "settingsTop", { text: "⚙ Project Settings" }),
    R("button", "projectMenu", { text: "📁 Project…" }),
    R("button", "saveProject", { text: "💾 Save" }),
    R("button", "exportProject", { text: "⇩ Export" }),
    R("button", "sendComfy", { text: "➤ Send To ComfyUI" }),
  ]);
  const menuBtn = R("button", "itdaMenuBtn", { className: "top-menu", title: "Menu", text: "☰ Menu" });
  const topbar = R("header", null, { className: "topbar" }, [
    mk("div", null, { className: "itda-menu-wrap", style: { position: "relative" } }, [menuBtn, menuDropdown]),
    R("input", "projectName", { value: "itda-project-1", spellcheck: "false" }),
    mk("div", null, { className: "spacer" }),
    R("button", "nodeFsBtn", { className: "top-menu", title: "Fullscreen this node", text: "⛶" }),
  ]);

  // ── media bin (video/audio only — gallery + local upload) ──
  const mediaList = R("div", "mediaList", { className: "media-list" });
  const mediaBin = mk("aside", null, { className: "panel media-bin" }, [
    mk("div", null, { className: "panel-title", text: "Media Bin" }),
    mk("div", null, { className: "import-row" }, [
      R("button", "addVideo", { text: "+ Video (Upload)" }),
      R("button", "addAudio", { text: "+ Audio (Upload)" }),
      R("button", "galleryVideo", { text: "🎞 Video (Gallery)" }),
      R("button", "galleryAudio", { text: "🎵 Audio (Gallery)" }),
    ]),
    mk("div", null, { className: "bin-view-row" }, [
      R("button", "gridView", { className: "active", title: "Thumbnail View", text: "▦" }),
      R("button", "listView", { title: "List View", text: "☰" }),
      R("button", "clearMedia", { text: "Clear" }),
    ]),
    mediaList,
    mk("div", null, { className: "bin-footer" }, [
      R("span", "mediaCount", { text: "0 items" }),
      mk("label", null, { className: "thumb-scale" }, [
        mk("span", null, { text: "▣ " }), R("input", "thumbScale", { type: "range", min: "72", max: "160", value: "104" }), mk("span", null, { text: " ⌕" }),
      ]),
    ]),
  ]);

  // ── preview panel ──
  const previewPanel = mk("section", null, { className: "panel preview-panel" }, [
    mk("div", null, { className: "preview-toolbar" }, [
      mk("div", null, { className: "mode-tabs" }, [
        R("button", "previewMode", { className: "active", text: "Single" }),
        R("button", "compareTop", { disabled: "", text: "Compare" }),
        R("button", "overlayTop", { disabled: "", text: "Overlay" }),
        R("button", "wipeTop", { disabled: "", text: "Wipe" }),
      ]),
      mk("div", null, { className: "preview-tools" }, [
        R("button", "snapshotTop", { title: "Snapshot", text: "▣" }),
        R("button", "fullscreenTop", { title: "Full Screen", text: "⛶" }),
      ]),
    ]),
    R("div", "previewStage", { className: "preview-stage", title: "Click to Play/Pause" }, [
      R("video", "previewVideo", { playsinline: "" }),
      R("video", "previewVideoB", { playsinline: "", muted: "" }),
      R("img", "previewImage", { alt: "" }),
      R("img", "previewImageB", { alt: "" }),
      R("div", "textOverlay", { className: "text-overlay" }),
      R("div", "textOverlayB", { className: "text-overlay compare-text" }),
      R("div", "previewPlaceholder", { text: "Preview" }),
      R("div", "snapshotToast", { className: "toast hidden", text: "Snapshot saved" }),
      R("div", "wipeHandle", { className: "wipe-handle" }, [mk("div", null, { className: "wipe-grip", text: "↔" })]),
    ]),
    mk("div", null, { className: "preview-transport" }, [
      mk("div", null, { className: "transport-controls" }, [
        R("button", "gotoClipStart", { title: "Selected Clip Start", text: "◀|" }),
        mk("button", null, { "data-step": "-5", title: "Step Back 5 Frames", text: "◀◀" }),
        mk("button", null, { "data-step": "-1", title: "Step Back 1 Frame", text: "◀" }),
        R("button", "playPause", { className: "main-play", title: "Play / Pause", text: "▶" }),
        mk("button", null, { "data-step": "1", title: "Step Forward 1 Frame", text: "▶" }),
        mk("button", null, { "data-step": "5", title: "Step Forward 5 Frames", text: "▶▶" }),
        R("button", "gotoClipEnd", { title: "Selected Clip End", text: "|▶" }),
        R("button", "loopToggle", { text: "Loop" }),
        R("button", "muteToggle", { title: "Mute (M)", text: "Mute" }),
        R("button", "scrubAudioToggle", { className: "active", title: "Scrub Audio Toggle (A)", text: "Scrub" }),
        mk("label", null, { className: "volume-control", title: "Monitor Volume" }, [
          mk("span", null, { text: "Vol" }), R("input", "monitorVolume", { type: "range", min: "0", max: "100", value: "100" }), R("b", "volumeLabel", { text: "100%" }),
        ]),
      ]),
      mk("div", null, { className: "transport-readout" }, [
        mk("div", null, { className: "center-readout" }, [R("b", "frameLabel", { text: "Frame 0" }), R("b", "timeLabel", { text: "00:00.000" })]),
        R("div", "projectFpsStatus", { className: "project-fps-status", text: "FPS 24.000 · Total 360f" }),
      ]),
    ]),
  ]);

  // ── clip properties — collapsible slide-out (node is far narrower than ITDA's
  // original full-page 25% column), toggled from the timeline action row ──
  const propsToggle = R("button", "propsToggle", { className: "top-menu", title: "Clip Properties", text: "▤ Properties" });
  const clipProps = R("div", "clipProps", { className: "props-body", text: "No clip selected." });
  const propsPanel = R("aside", "propsPanel", { className: "panel props-panel itda-props-slide" }, [
    mk("div", null, { className: "panel-title", text: "Clip Properties" }),
    clipProps,
  ]);

  const upperPane = R("section", "upperPane", { className: "upper" }, [mediaBin, previewPanel, propsPanel]);

  // ── timeline action row — icon buttons + tooltip (title carries the tool name,
  // same title text always shown as a native tooltip; ids/handlers unchanged) ──
  const actionRow = mk("div", null, { className: "timeline-action-row itda-icon-row" }, [
    R("button", "markIn", { title: "Mark In (I)", text: "⏮" }),
    R("button", "markOut", { title: "Mark Out (O)", text: "⏭" }),
    R("button", "clearRange", { title: "Clear Range", text: "⊘" }),
    R("button", "snapToggle", { className: "active", title: "Snap", text: "🧲" }),
    R("button", "peakSnapToggle", { title: "Peak Match — also snap clip edges to audio waveform peaks (beats/transients)", text: "〜" }),
    R("button", "splitClip", { title: "Split", text: "✂" }),
    R("button", "stitchClip", { title: "Stitch", text: "🧵" }),
    R("button", "unstitchClip", { title: "UnStitch", text: "🪢" }),
    R("button", "autoStitchClip", { disabled: "", title: "Auto Stitch — select 2 video clips (in time order) to analyze the best overlap cut point", text: "🪄" }),
    R("button", "addTransition", { disabled: "", title: "Transition — select 2 adjacent video clips to insert a transition at the join", text: "🎞" }),
    R("button", "aiDetect", { disabled: "", title: "AI Detect — Scene / Beat detection for the selected clip", text: "✨" }),
    R("button", "groupClip", { title: "Group", text: "🔗" }),
    R("button", "ungroupClip", { title: "Ungroup", text: "⛓️‍💥" }),
    R("button", "detachAudio", { title: "Detach Audio", text: "🔈⊘" }),
    R("button", "mergeAudio", { title: "Merge Audio", text: "🔈+" }),
    R("button", "prerender", { title: "Pre-render", text: "⏩" }),
    R("button", "deleteClip", { title: "Clip Delete", text: "🗑" }),
    propsToggle,
  ]);
  // Zoom gets its own row — squeezed into the icon row's flex-wrap tail it was easy to
  // miss entirely ("타임라인 가로확대/세로확대 기능도 누락된것 같은데").
  const zoomRow = mk("div", null, { className: "itda-zoom-row" }, [
    mk("label", null, { title: "Horizontal Zoom" }, [mk("span", null, { text: "↔ Zoom" }), R("input", "hZoom", { type: "range", min: "0.5", max: "20", step: "0.5", value: "4" })]),
    mk("label", null, { title: "Vertical Track Zoom" }, [mk("span", null, { text: "↕ Track" }), R("input", "vZoom", { type: "range", min: "44", max: "140", value: "74" })]),
  ]);

  const timeline = R("div", "timeline", { className: "timeline", tabindex: "0" }, [
    R("div", "ruler", { className: "ruler" }),
    R("div", "rangeLayer", { className: "range-layer" }),
    R("div", "playhead", { className: "playhead" }, [mk("div", null, { className: "playhead-head" })]),
    R("div", "lanes", { className: "lanes" }),
    R("div", "boxSelect", { className: "box-select", style: { display: "none" } }),
  ]);

  const statusbar = mk("div", null, { className: "statusbar" }, [
    R("span", "statusbarFps", { text: "Project FPS: 24.000" }),
    mk("span", null, {}, [mk("span", null, { text: "Snap: " }), R("b", "snapStatus", { text: "ON" })]),
    R("span", "totalStatus", { text: "Total: 360f / 00:15.000" }),
    R("span", "status", { text: "Ready" }),
  ]);

  const lowerPane = mk("section", null, { className: "lower timeline-panel" }, [actionRow, zoomRow, timeline, statusbar]);

  const resizeHandle = R("div", "resizeHandle", { className: "resize-handle" });
  const app = R("div", "app", {}, [topbar, mk("main", null, { className: "workspace" }, [upperPane, resizeHandle, lowerPane])]);

  // ── modal ──
  const modal = R("div", "modal", { className: "modal hidden" }, [
    mk("div", null, { className: "modal-card" }, [
      mk("div", null, { className: "modal-head" }, [R("b", "modalTitle", { text: "ITDA" }), R("button", "modalClose", { text: "×" })]),
      R("div", "modalBody", { className: "modal-body" }),
      R("div", "modalFooter", { className: "modal-footer" }),
    ]),
  ]);

  const filePicker = R("input", "filePicker", { type: "file", multiple: "", style: { display: "none" } });

  const root = mk("div", null, { className: "itda-studio-root", style: { position: "relative", width: "100%", height: "100%", overflow: "hidden" } }, [app, modal, filePicker]);
  return { root, IDS };
}

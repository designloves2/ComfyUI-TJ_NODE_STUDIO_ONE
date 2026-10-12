// one_node_itda_studio.js — ITDA ONE STUDIO (TJ)
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
import { openVideoGalleryPickerAll } from "./shared/ui_video_gallery_picker.js";
import { openAudioGalleryPicker } from "./shared/ui_audio_gallery_picker.js";
import { createNodeFullscreen } from "./shared/node_fullscreen.js";
import { createItdaGalleryOverlay } from "./shared/ui_gallery_itda.js";

const API = "/itda_studio_one";

// The node's own outer size was set to the exact same [NODE_W, NODE_H] as the DOM
// widget/root itself — with no margin between them, the widget's real edge sat flush
// against (and, once LiteGraph's own border/corner-resize decoration is counted, slightly
// past) the node's own boundary, poking out to the right and bottom. User: "돔사이즈가
// 노드 오른쪽과 아래쪽으로 노드 밖으로 살짝 돌출되있어." MiniMax H3 (one_node_minimax_h3.js)
// already established the fix for this exact class of node: give the node's outer size a
// small margin over the widget's own [NODE_W, NODE_H] (there: ROOT_H+30 wide, +40 tall).
const NODE_MW = NODE_W + 30;
const NODE_MH = NODE_H + 40;

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
    // ITDA's own stylesheet defines every CSS custom property (colors, sizes) under two
    // top-level `:root{...}` blocks — but inside `@scope(.itda-studio-root)`, a `:root`
    // selector can never match anything (the document root is never a *descendant* of
    // the scope root), so those variables are never actually defined anywhere reachable
    // here. Most rules hardcode literal hex colors and were unaffected, but anything
    // using var(--flat-*) etc. with no fallback silently computed to its CSS-initial
    // value instead — e.g. .modal-card{background:var(--flat-surface)} rendered fully
    // transparent (not the intended dark card), only visible at all because the modal's
    // own translucent black backdrop sits behind it. User noticed exactly this: "delete
    // media popup의 배경은 투명이야?" Re-declaring both :root blocks' variables directly
    // on .itda-studio-root fixes every var() consumer at once instead of patching each
    // one with an individual fallback.
    //
    // NOT wrapped in @scope — live-verified (same as the earlier blanket font-size rule)
    // that Chromium's @scope can silently fail to apply even a plain `.itda-studio-root{
    // --x:y}` custom-property rule targeting the scope root's own class: getComputedStyle
    // kept returning an empty string for --flat-surface with this wrapped in @scope, and
    // started resolving correctly the moment it was moved to a plain top-level rule. The
    // selector is still fully self-limited by the concrete `.itda-studio-root` class, so
    // dropping @scope changes nothing about where it can apply.
    `.itda-studio-root{
      --bg:#0d0e10;--panel:#17191c;--panel2:#1d2024;--panel3:#22252a;--line:#30343b;--line2:#24282e;
      --text:#f4f4f7;--muted:#a9adb7;--dim:#737986;--accent:#7612da;--accent2:#9b5cff;
      --video:#6b2ec9;--audio:#178b63;--image:#c87519;--textclip:#1b9bd7;--red:#ff4242;--shadow:0 10px 30px rgba(0,0,0,.28);
      --btn-h:clamp(26px,1.65vw,34px);--icon:clamp(13px,.9vw,17px);--thumb:104px;
      --flat-accent:#6a5cff;--flat-accent2:#8f7bff;--flat-surface:#1c1e24;--flat-surface2:#20232a;
      --flat-line:#2b2f38;--flat-radius:10px;--font:12px;
    }` +
    // Our own small addition, not part of ITDA's original: the collapsible
    // Properties slide-out (see propsToggle wiring below).
    `@scope (.itda-studio-root) {
      .itda-props-slide{width:0;min-width:0;transition:width 160ms ease;overflow:hidden;border:none!important}
      .itda-props-slide.open{width:280px;min-width:280px;border-left:1px solid var(--flat-line,#2b2f38)!important}
      .upper{grid-template-columns:26% 1fr 0!important}
      .upper:has(.itda-props-slide.open){grid-template-columns:24% 1fr 280px!important}
    }` +
    // Font pass: ITDA's own --font var + per-element font-weight overrides read as
    // oversized/too-bold once squeezed into this node's much narrower panels — an
    // override layer (not an edit to the original stylesheet text above) rather than
    // hand-patching every individual rule.
    `@scope (.itda-studio-root) {
      :root, .itda-studio-root{--font:12px}
      button{font-weight:500}
      .panel-title{font-weight:600;font-size:12px}
      .clip-title{font-weight:600}
      .media-name{font-weight:600}
      .brand b{font-weight:700}
      button.active,.top-menu.active{font-weight:600}
      .lane-label{font-weight:600}
      .transport-readout{font-weight:600}
    }` +
    // ☰ Menu dropdown (Settings/Project/Save/Export/Send-to-ComfyUI) — declutters the
    // topbar down to just the menu button, project name, and fullscreen.
    `@scope (.itda-studio-root) {
      .itda-menu-dropdown{display:none;position:absolute;top:calc(100% + 4px);left:0;z-index:50;
        flex-direction:column;min-width:180px;background:var(--flat-surface,#1c1e24);
        border:1px solid var(--flat-line,#2b2f38);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.4);
        padding:4px;gap:2px}
      .itda-menu-dropdown.open{display:flex}
      .itda-menu-dropdown button{width:100%;text-align:left;height:auto;padding:7px 10px}
      .itda-menu-sep{height:1px;margin:3px 2px;background:var(--flat-line,#2b2f38)}
    }` +
    // Timeline action row — square icon buttons instead of wide text buttons, tool
    // name moved to the native title tooltip (dom_build.js).
    `@scope (.itda-studio-root) {
      /* Original .timeline-action-row{overflow:hidden} strips flexbox's automatic
         min-content protection, so when the resize handle (or a taller .upper) shrinks
         .lower's total height, this row could get squeezed toward 0 instead of only the
         timeline shrinking. User: "상단 영역의 높이를 늘리면 툴 아이콘 영역이 사라짐."
         flex:0 0 auto (never shrink) + an explicit min-height pins it to its real content
         size regardless of how much room .lower actually has. */
      .itda-icon-row{flex-wrap:wrap;flex:0 0 auto!important;height:auto!important;min-height:40px!important;padding:6px 8px!important;gap:4px}
      .statusbar{flex:0 0 auto!important}
      .timeline{min-height:0!important}
      /* #prerender and #addTransition are excluded — updateControls() (real original
         logic in itda_app_ported.js) overwrites their own textContent every render to
         show live state ("Pre-rendered 30-90f" / "🎞 Remove Transition" vs "🎞
         Transition") - that's meaningful info a static tooltip can't carry, not
         decorative label text, so these two stay small readable text buttons instead
         of being squeezed into the icon grid. User: "프리랜더는 왜 글씨가 트레지션도
         글씨가 있고" - this is exactly why, and it's staying that way on purpose. */
      .itda-icon-row button:not(#propsToggle):not(#prerender):not(#addTransition){
        width:28px;min-width:28px;height:28px;padding:0!important;
        display:inline-flex;align-items:center;justify-content:center;font-size:12px}
      #prerender, #addTransition{font-size:12px!important;height:28px!important}
      /* Zoom controls live inline in actionRow now (dom_build.js), pinned to the
         row's far right instead of their own separate row. User: "트랙줌의 위치는
         툴아이콘 버튼과 동일한 위치의 오른쪽끝으로 정렬해서 위치 이동." */
      .itda-zoom-inline{display:flex;align-items:center;gap:14px;margin-left:auto;padding:0 4px}
      .itda-zoom-inline label{display:flex;align-items:center;gap:6px;color:var(--muted,#a9adb7);font-size:12px}
      .itda-zoom-inline input[type=range]{width:80px;height:14px;padding:0}
      /* ITDA's own stylesheet reserves height for its native 5 lanes
         (min-height: calc(5 * var(--lane-h))) — narrowed to 3 lanes here, so that
         same rule left dead empty space below T3. User: "타임라인 3개인데 하단에
         여백은 그냥 이전에 있던거 2트랙 지우기만 했네." Two parts to the actual gap:
         (1) .lanes itself still reserved 5-lane height; (2) #timeline had flex:1
         inside .lower, so it stretched to fill whatever vertical room .lower had
         regardless of how tall 3 lanes' worth of content actually is, leaving a
         blank strip below the lanes before the statusbar. Capped #timeline to its
         own real content height instead, and let .upper (media/preview/props)
         absorb that reclaimed space by flex-growing there instead — more room for
         the actually-useful preview, not a dead gap in the timeline. */
      .lanes{min-height:calc(3 * var(--lane-h, 74px))!important}
      /* NOT !important on .upper/.lower height/flex: the resize handle (real original
         logic, itda_app_ported.js) sets upperPane/.lower's height via inline style on
         drag, and an !important stylesheet rule beats even inline style, so every drag
         was getting silently overridden back to these flex defaults on the next paint.
         User: "상단 영역 높이 조절 자꾸 기본 높이로 회귀됨." Plain (non-!important) rules
         only apply the flex-grow/shrink default when no inline height has been set yet —
         inline style always outranks a plain external rule, so a drag now sticks. */
      .upper{flex:1;height:auto}
      .lower{flex:0 0 auto;min-height:0}
      .timeline{flex:0 0 auto!important;max-height:calc(48px + 3 * var(--lane-h, 74px) + 24px)!important}
    }` +
    // Clip Properties panel — user: "글자들 전부 글씨 크기 축소". Explicit + !important
    // rather than relying on the --font var cascading down into this panel's own
    // dynamically-injected innerHTML (updateProps() in itda_app_ported.js) — that markup
    // has no font-size of its own either way, this just makes the override unambiguous.
    `@scope (.itda-studio-root) {
      .props-body, .props-body *{font-size:12px!important}
      .props-section{font-size:12px!important;font-weight:700!important}
      .props-grid input, .props-grid select{height:22px!important;font-size:12px!important}
      .version-name{font-size:12px!important}
    }` +
    // Design-unification pass: every panel's text now reads at the SAME baseline size —
    // the statusbar's own original 12px ("Project FPS: 24.000 / Snap: ON / Total: 360f").
    // User: "글씨 크기를 전부 하단의 Project FPS: 24.000 Snap: ON Total: 360f / 00:15.000
    // 이거 정도로 사이즈를 기본으로 한다. 전부 변경." Previously every panel had its own
    // one-off size (9/10/11/13px) from being tuned in isolation across several requests —
    // this single pass makes 12px the one shared default everywhere, buttons/icons included.
    `@scope (.itda-studio-root) {
      .mode-tabs button{font-size:12px!important;height:26px!important;padding:0 8px!important}
      .transport-controls button{font-size:12px!important;height:26px!important;min-width:26px!important;padding:0 6px!important}
      .transport-controls .main-play{font-size:14px!important;height:26px!important;min-width:26px!important}
      .transport-controls .volume-control{font-size:12px!important}
      .transport-controls .volume-control input[type=range]{height:14px}
      .transport-readout, .transport-readout *{font-size:12px!important}
      .frameLabel, #frameLabel, #timeLabel{font-size:12px!important}
      .project-fps-status{font-size:12px!important}
      .preview-tools button{width:24px!important;min-width:24px!important;height:24px!important;font-size:12px!important}
      .panel-title{font-size:12px!important}
    }` +
    // User: "모든 글자야??? 타임라인 빼고" — confirming scope: the 12px unification above
    // is for surrounding panels only (Properties/mode-tabs/transport/toolbar/menu). The
    // timeline itself (lane labels, clip titles, ruler ticks, clip-trim text) keeps ITDA's
    // own original sizing untouched — everything in there already has its own explicit
    // font-size in the unmodified stylesheet above except .lane-label, which inherits the
    // shared --font var; pinned back to ITDA's own original clamp so it can never drift
    // when --font changes for the rest of the UI.
    `@scope (.itda-studio-root) {
      .lane-label{font-size:clamp(11px,.72vw,13px)!important}
    }` +
    // User: "왼쪽 상단 메뉴부터 프로퍼티브 미디어풀 미디어 컨트롤 등등 전부 모든 글자에
    // 적용이야... 타임라인의 글자만 제외하고 나머지 모든 글자에 적용되는거야." — not just
    // the panels touched above: EVERY piece of text anywhere in this node (topbar/brand,
    // ☰ Menu dropdown, Media Pool item names/meta/footer, preview toolbar, Properties,
    // transport, toolbar) gets the same 12px, with only .timeline and everything inside it
    // (lane labels, clip titles, ruler, clip-trim) excluded. One blanket rule instead of
    // hunting down every remaining one-off selector (media-name, media-meta, brand, modal,
    // thumb-scale, etc. all still had their own original sizes until now). Appended last so
    // it's the final word for every element it matches.
    //
    // NOT wrapped in @scope like every other block here — live-verified in the actual
    // running node (propsToggle/"▤ Properties" stayed at the browser's 16px default no
    // matter what) that Chromium's @scope silently fails to apply this exact
    // ":not(X):not(X *)" blanket pattern to some elements even though el.matches(...)
    // confirms the selector logically matches and no other rule competes for them —
    // a real @scope engine quirk, not a specificity/ordering mistake. The selector
    // already starts with the concrete `.itda-studio-root` class, which alone fully
    // constrains it to this node (that's exactly what @scope would have added), so the
    // @scope wrapper was redundant here anyway — dropping it fixed the button instantly
    // when tested live.
    `.itda-studio-root *:not(.timeline):not(.timeline *){font-size:12px!important}` +
    // User: "웨이브폼의 웨이브 막대는 표현되지 안고 거의 선으로 보이고 있어" and later
    // "너 이거 원본에서 어떻게 했었는지 확인 안해봤어?" — checked properly this time:
    // itda_style.css's OWN "v0.2.8 waveform/trim/audio hotfix" section (further down than
    // the earlier narrower greps ever looked) already sizes .clip-bars to
    // clamp(30px,58%,58px)!important, edge-to-edge, with .clip-title compacted to make
    // room — a complete, already-correct design. My earlier override here was redundant
    // (and had a real bug: `//` isn't a valid CSS comment inside a template string — that
    // whole "explanation" was literally being sent to the browser as malformed CSS text,
    // silently dropped by the parser instead of erroring). Removed entirely; the
    // remaining real fix lives in drawClipWaveform's own peak-normalization
    // (itda_app_ported.js), for source audio quiet enough that even a full-height track
    // wouldn't show it under the original's un-boosted 1:1 plot.
    // Properties panel range sliders (Gain %, X/Y, Size, Opacity, ...) — user: "슬라이드
    // 조절 도트는 있는데 슬라이더 라인이 안보여 선 색상과 배경색상이 동일 할것 같은데."
    // ITDA's own track color (var(--flat-line), a dark blue-gray) reads as basically
    // invisible against this panel's own dark background once embedded here — an
    // explicit, higher-contrast track color instead of relying on that var. Thumb
    // also shrunk to half its original 15px per "슬라이저 조절 도트는 지금보다 절반
    // 사이즈로 수정해줘."
    `@scope (.itda-studio-root) {
      .slider-field input[type="range"]{background:#4a5062!important;border:1px solid #5a6175!important}
      .slider-field input[type="range"]::-webkit-slider-thumb{width:8px!important;height:8px!important}
      .slider-field input[type="range"]::-moz-range-thumb{width:8px!important;height:8px!important}
    }` +
    // Media Bin grid — column count now follows the thumbnail-size slider (set as
    // --media-cols by renderMedia in itda_app_ported.js) instead of a fixed 3 columns
    // that just got squeezed as the slider grew. User: "가로 3개로 고정이잖아... 최소
    // 사이즈에서는 3개 최대사이즈에서는 2개가 보이게."
    `@scope (.itda-studio-root) {
      .media-list{grid-template-columns:repeat(var(--media-cols,3),minmax(0,1fr))!important}
    }` +
    // Clip thumbnail (itda_app_ported.js's own renderLanes) — a small <img> using the
    // Media Bin's own thumb_url instead of the flat ▣ glyph, so a clip is identifiable
    // at a glance instead of only by its (often truncated) filename. .clip-title-left/
    // -right are the two fixed groups renderLanes now wraps thumb+name and icon+trim in —
    // see the comment there for why (space-between used to separate all four as
    // individual items, so name drifted away from its own thumbnail on zoom).
    `@scope (.itda-studio-root) {
      .clip-title{display:flex!important;align-items:center!important;justify-content:space-between!important}
      .clip-title-left,.clip-title-right{display:flex;align-items:center;gap:5px;min-width:0}
      .clip-thumb{width:20px;height:20px;min-width:20px;object-fit:cover;border-radius:3px;border:1px solid rgba(255,255,255,.25)}
      .clip-icon{min-width:14px;text-align:center}
      /* User: "글씨 사이즈는 맞는것 같은데 볼드체여서 그런가봐 볼드체 아닌 일반체로
         변경해줘." Original CSS bolds this text heavily (base .clip-title font-weight:900,
         clip-trim font-weight:700) — normal weight instead, name text still ellipsized. */
      .clip-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:400!important}
      .clip-trim{font-weight:400!important}
    }` +
    // Media Bin filename — same bold-by-default issue (original: font-weight:850, our
    // earlier font pass: 600), same fix. User: "미디어풀에 파일명도 일반체로 변경."
    `@scope (.itda-studio-root) {
      .media-name{font-weight:400!important}
    }` +
    // NOTE: the "🖼 Gallery" overlay's own CSS now lives with its module
    // (web/shared/ui_gallery_itda.js), which is a port of MiniMax H3's own video
    // gallery card design (web/minimax/ui_gallery_minimax.js), built as plain inline
    // styles the same way that module is — not injected through this stylesheet.
    `@scope (.itda-studio-root) {
      #renderMode{height:30px;padding:0 6px;border-radius:6px;background:var(--flat-surface2,#20232a);
        border:1px solid var(--flat-line,#2b2f38);color:#ddd;font-size:11px}
    }` +
    // Total-length END marker — a real 2px line is nearly impossible to grab precisely
    // with a mouse; a wider transparent hit-target (::before, doesn't affect the visible
    // line's own width/position) plus a resize cursor makes it actually draggable. User:
    // "총프레임 길이도 타임라인에서 총프레임 표시바를 직접 잡고 이동해서 조절 가능하게."
    `@scope (.itda-studio-root) {
      .total-frame-marker{cursor:ew-resize!important}
      .total-frame-marker::before{content:'';position:absolute;top:0;bottom:0;left:-6px;width:14px;cursor:ew-resize}
    }`;
  document.head.appendChild(s);
}

app.registerExtension({
  name: "TJ.ItdaStudioONE",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "ItdaStudioOneTJNode") return;

    nodeType.prototype.onNodeCreated = function () {
      this.color = BRAND; this.bgcolor = "#0b0b0b"; this.title_color = "#fff";
      this.resizable = false; this.size = [NODE_MW, NODE_MH];
      this._buildUI();
    };
    nodeType.prototype.onResize = function () { this.size = [NODE_MW, NODE_MH]; };
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

      // ☰ Menu dropdown — click the button to toggle, click anywhere else to close.
      IDS.itdaMenuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        IDS.itdaMenuDropdown.classList.toggle("open");
      });
      IDS.itdaMenuDropdown.addEventListener("click", (e) => {
        // Let the actual menu item's own onclick (Save/Export/...) run, then close.
        if (e.target.tagName === "BUTTON") setTimeout(() => IDS.itdaMenuDropdown.classList.remove("open"), 0);
      });
      document.addEventListener("click", (e) => {
        if (!IDS.itdaMenuDropdown.contains(e.target) && e.target !== IDS.itdaMenuBtn) {
          IDS.itdaMenuDropdown.classList.remove("open");
        }
      });

      const HOOKS = {
        projectName: ui.projectName || "untitled",
        // 4-source picker (Input/Output/MiniMax H3/ITDA Studio) instead of the H3-only
        // one — user: "갤러리에서 불러오기에는 Input / Ouput / 미니맥스 h3 / ITDA Studio
        // 이렇게 4개가 있어야 됨." Picker itself already copies to ComfyUI's input/
        // folder before calling back, so this only needs the SAME project-media copy
        // step every other gallery import here already does.
        pickVideoFromGallery: (onDone) => {
          openVideoGalleryPickerAll(async (inputFilename) => {
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

      // ── App Settings (system-wide, not per-project) — Gallery Path only.
      // Reuses ITDA's own modal chrome (api.showModal/closeModal) instead of a second,
      // visually-inconsistent overlay. Originally also mounted mountLLMSettingsSection
      // (the shared Local GGUF/ComfyUI Native/OpenRouter picker other ONE STUDIO tools'
      // Prompt Edit popups read) here, but ITDA has no LLM-assisted feature anywhere in
      // its own code (Auto Stitch/Scene+Beat Detect are backend signal processing, not
      // LLM calls) — confirmed by grep, no backend_text/backend_vision/gguf_model field
      // is ever read. User: "LLM기능 설정은 빼야지... 여기서는 그냥 갤러리 경로 설정만
      // 있으면 되는거 아니야?" Removed; keep this modal to Gallery Path only.
      async function openAppSettingsModal() {
        let settings = { gallery_dir: "" };
        try {
          const r = await fetch(`${API}/api/app_settings`);
          const d = await r.json();
          if (d.ok) settings = d.settings;
        } catch (e) { console.error("[ITDA STUDIO] app settings load failed", e); }
        api.showModal(
          "App Settings",
          `<div class="modal-grid">
            <label>Gallery Path</label>
            <input id="appSettingsGalleryDir" type="text" placeholder="output/[Enter folder name]" value="${(settings.gallery_dir || "").replace(/"/g, "&quot;")}">
          </div>
          <p class="muted">Where "⏺ Render" and "🖼 Gallery" store/read rendered timelines. Leave blank for the default location.</p>`,
          `<button id="appSettingsApply">Apply</button><button id="modalOk">Close</button>`
        );
        const applyBtn = root.querySelector("#appSettingsApply");
        if (applyBtn) applyBtn.onclick = async () => {
          const v = root.querySelector("#appSettingsGalleryDir")?.value?.trim() || "";
          try {
            await fetch(`${API}/api/app_settings`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ gallery_dir: v }),
            });
          } catch (e) { console.error("[ITDA STUDIO] app settings save failed", e); }
          api.closeModal();
        };
      }
      IDS.appSettingsTop?.addEventListener("click", () => { IDS.itdaMenuDropdown?.classList.remove("open"); openAppSettingsModal(); });

      // ── Gallery — everything "⏺ Render" has produced (now shared with MiniMax H3's
      // own gallery folder — see paths.py's gallery_dir()), across all projects. A
      // faithful port of H3's own video gallery card design (web/shared/ui_gallery_itda.js)
      // instead of a separate simplified overlay. User: "미니맥스 영상 갤러리 그대로
      // 가져오는데 하단에 프롬포트 대신 사용 파일 정보로 대체..."
      const itdaGallery = createItdaGalleryOverlay(root, {
        getProject: () => api.state?.project?.name || ui.projectName,
        onImported: () => api.refreshMedia?.(),
        showStatus: (msg) => api.status?.(msg),
      });
      IDS.galleryTop?.addEventListener("click", () => itdaGallery.show());

      // ── Render — whole timeline → Gallery. User: "랜더링 버튼을 상단 우측끝에 만들고
      // 누르면 타임라인를 랜더링해서 갤러리에 등록하는 걸로 해줘야됨." Reuses the exact
      // same compositing path as the (now-removed) Export button, just pointed at the
      // gallery folder and registered in its manifest instead of the project's own
      // output folder.
      IDS.renderTop?.addEventListener("click", async () => {
        const btn = IDS.renderTop;
        const label = btn.textContent;
        btn.disabled = true; btn.textContent = "⏺ Rendering…";
        // Overlapping progress modal + a real completion message, same pattern
        // Pre-render already uses — a disabled button label alone was too easy to miss.
        // User: "랜더링 할때 화면에 오버랩해서 랜더링 중입니다. 잠시만 기다려주세요.
        // 끝나면 랜더링이 완료되었습니다. 갤러리에서 확인하세요. 라고 팝업이 나와야
        // 되지 않을까???"
        const started = Date.now();
        api.showModal?.("Render", `<div class="export-progress"><div class="spinner"></div><p>렌더링 중입니다. 잠시만 기다려주세요.</p><p class="muted" id="renderTimer">0.0s</p></div>`, "");
        const timer = setInterval(() => {
          const el = root.querySelector("#renderTimer");
          if (el) el.textContent = `${((Date.now() - started) / 1000).toFixed(1)}s`;
        }, 100);
        try {
          const project = api.state?.project?.name || ui.projectName;
          // render_to_gallery loads the project fresh from disk server-side — without
          // this, an un-saved timeline edit would render nothing (or a stale version),
          // same bug Pre-render had. See saveProjectSilent's comment in itda_app_ported.js.
          await api.saveProjectSilent?.();
          const mode = IDS.renderMode?.value || "video_audio";
          const r = await fetch(`${API}/api/render_to_gallery`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ project, mode }),
          });
          const d = await r.json();
          if (!d.ok) throw new Error(d.error || "render failed");
          clearInterval(timer);
          api.status?.("Rendered to Gallery: " + d.item.filename);
          api.showModal?.("Render", `<p>렌더링이 완료되었습니다. 갤러리에서 확인하세요.</p><p class="muted">${d.item.filename} — ${((Date.now() - started) / 1000).toFixed(1)}s</p>`, `<button id="renderOpenGallery">🖼 Gallery</button><button id="modalOk">Close</button>`);
          root.querySelector("#renderOpenGallery")?.addEventListener("click", () => { api.closeModal?.(); itdaGallery.show(); });
        } catch (e) {
          clearInterval(timer);
          console.error("[ITDA STUDIO] render_to_gallery failed", e);
          api.status?.("Render failed: " + e.message);
          api.showModal?.("Render", `<p>렌더링 실패: ${e.message}</p>`);
        } finally {
          btn.disabled = false; btn.textContent = label;
        }
      });

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

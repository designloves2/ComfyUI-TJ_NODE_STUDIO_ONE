// core_itda_studio.js — ITDA STUDIO (TJ) constants, state, DOM helpers
//
// Absorbed from the standalone ComfyUI-ITDA custom node's web/app.js — same project
// JSON shape (media[]/clips[]/lanes[]) and frame-math the original used, narrowed from
// 5 lanes / video+audio+image+text down to 3 lanes / video+audio only (this node's own
// scope cut), and rebuilt as an in-graph DOM widget instead of ITDA's window.open()
// popup editor, matching every other ONE STUDIO tool in this app.
export const BRAND = "#7612DA";
export const C = {
  lime: BRAND, bg0: "#0b0b0b", bg1: "#111111", bg2: "#181818",
  bg3: "#222222", border: "#2a2a2a", borderH: "#3c3c3c",
  text: "#dedede", muted: "#565656", dim: "#2e2e2e",
  warn: "#ffb347", err: "#ff6767",
};

export const NODE_W = 1280;
export const NODE_H = 900;
export const LEFT_W = 300;
export const PAD = 10;
export const API = "/itda_studio_one";
export const LS_KEY = "itda_studio_one_state_v1";

// Narrowed from ITDA's 5 — user: "잇다는 5행의 타임라인인데 우리는 3행 정도면 될 것
// 같고... 영상과 사운드만 미디어롤에 불러와서 작업하면 될것 같은데."
export const LANE_COUNT = 3;
export const DEFAULT_LANE_H = 74;
export const LEFT_PAD = 150;
export const SNAP_STEP = 8;
export const DEFAULT_FPS = 24;
export const DEFAULT_TOTAL_FRAMES = 360;

export function el(tag, props, children) {
  const n = document.createElement(tag);
  if (props) {
    for (const k in props) {
      if (k === "style") Object.assign(n.style, props[k]);
      else if (k === "text") n.textContent = props[k];
      else if (k === "html") n.innerHTML = props[k];
      else if (k === "className" || k === "class") n.className = props[k];
      else if (k === "value") n.value = props[k];
      else if (k.startsWith("on") && typeof props[k] === "function") n.addEventListener(k.slice(2).toLowerCase(), props[k]);
      else if (props[k] === false || props[k] == null) {}
      else n.setAttribute(k, props[k] === true ? "" : props[k]);
    }
  }
  if (children) for (const c of children) if (c) n.appendChild(c);
  return n;
}
export function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }

export function loadState() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; }
}
export function saveState(s) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch {}
}

// Only the last-used PROJECT NAME + a few view prefs live in localStorage — the actual
// project data (media/clips/lanes) is server-authoritative, loaded fresh from
// /itda_studio_one/project/{name} every time a project opens, same as ITDA's own split
// between browser state and its .itda.json file on disk.
export function defaultState(saved) {
  saved = saved || {};
  return {
    projectName: saved.projectName || "untitled",
    pxPerFrame: saved.pxPerFrame ?? 4,
    snap: saved.snap ?? true,
    laneHeight: saved.laneHeight ?? DEFAULT_LANE_H,
    lockedLanes: saved.lockedLanes || {},
    hiddenLanes: saved.hiddenLanes || {},
    // Kept modest on purpose — user: "미디어롤에 불러오는 영상의 썸네일 사이즈는
    // 크지 안아도 되" (a media-bin row thumbnail, not a preview). 52px matches the
    // other tools' own list-row thumbnails (MusicMaker's mmm-cover, the audio
    // gallery picker's cov box).
    mediaThumb: saved.mediaThumb ?? 52,
    // User-resizable preview stage height — a bottom-edge drag grip on the preview
    // box, same pattern as MusicMaker's lyrics/style textarea resize (resizableBox
    // in one_node_music.js), persisted the same way (this file's own ui state).
    previewH: saved.previewH ?? 320,
  };
}

export function defaultProject(name) {
  const now = Date.now();
  return {
    schema: "itda_studio.project", version: "1.0.0", name: name || "untitled",
    created_at: now, updated_at: now,
    settings: { fps: DEFAULT_FPS, total_frames: DEFAULT_TOTAL_FRAMES, snap: true, loop: false, mute: false },
    range: { start: null, end: null },
    media: [], clips: [], lanes: [],
  };
}

export function fmtTime(frame, fps) {
  const sec = Math.max(0, frame / (fps || DEFAULT_FPS));
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60), ms = Math.round((sec - Math.floor(sec)) * 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

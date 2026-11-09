// ONE STUDIO Node Skin: the three the user can change per node (Title, Node, HighLight), kept per node kind in the browser and
// in config_theme.json.
//
// The nodes paint themselves with fixed colors (BRAND "#7612DA" for every key color, a fixed dark gray set for the panels).
// Instead of threading a variable through ~500 call sites, this module rewrites those colors on the page: the inline styles,
// SVG color attributes and <style> rules of what a node draws, once now and again for everything drawn later. Every node kind
// has its own theme, so the rewrite is done per node: an element takes the theme of the node it sits in (the element marked
// data-tj-theme="<node kind>"). With the default theme nothing is observed and nothing changes.
//
//   Title Color     the node's title bar (LiteGraph node.color)
//   Node Color      the node body (LiteGraph node.bgcolor) and, from it, the gray panels inside the node
//   HighLight Color the key color: active tabs, buttons, sliders, pointers
//
// Pure logic only (no ComfyUI imports), so it can be tested on its own.

export const STORE_KEY = "tj_studio_theme_v2";
export const DEFAULT_THEME = Object.freeze({ title: "#7612DA", node: "#0B0B0B", highlight: "#7612DA" });
export const MAX_SAVED = 24;
export const SAVE_KEYS = ["colors", "title", "node", "highlight"];   // "colors" is the one list the editor uses; the other three are older lists, still shown

/** ComfyUI node class -> the key its theme is stored under. */
export const NODE_KEYS = Object.freeze({
  Flux2KleinOneTJNode: "klein", ZImageTurboOneNode: "zimage", Krea2OneTJNode: "krea2", QwenImageEdit2511OneTJNode: "qwen2511",
  QwenImage21OneTJNode: "qwen21", SDXLOneTJNode: "sdxl", MiniMaxH3OneTJNode: "minimax_h3", MusicMakerOneTJNode: "music",
  AnimaOneTJNode: "anima", MossImageOneTJNode: "moss", ItdaStudioOneTJNode: "itda", LTX25OneTJNode: "ltx25",
});
export const NODE_LABELS = Object.freeze({
  klein: "Flux.2 Klein", zimage: "Z-Image", krea2: "Krea 2", qwen2511: "Qwen Image Edit 2511", qwen21: "Qwen Image 2.1", sdxl: "SDXL",
  minimax_h3: "MiniMax H3", music: "MusicMaker", anima: "Anima", moss: "Moss Image", itda: "ITDA", ltx25: "LTX 2.5",
});
export const keyOfClass = (cls) => NODE_KEYS[String(cls || "")] || "";

// ── color math ───────────────────────────────────────────────────────────────────────────────────────────────────────
export function parseHex(s) {
  let h = String(s ?? "").trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split("").map(c => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}
const clamp255 = (n) => Math.max(0, Math.min(255, Math.round(Number(n) || 0)));
export function toHex({ r, g, b }) {
  return "#" + [r, g, b].map(v => clamp255(v).toString(16).padStart(2, "0")).join("").toUpperCase();
}
export function normHex(s, fallback = null) {
  const c = parseHex(s);
  return c ? toHex(c) : fallback;
}
export function rgbToHsv({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}
export function hsvToRgb({ h, s, v }) {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0]; else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c]; else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
  return { r: clamp255((r + m) * 255), g: clamp255((g + m) * 255), b: clamp255((b + m) * 255) };
}
/** Relative luminance 0..1 (sRGB). */
export function luminance({ r, g, b }) {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
/** White or near-black, whichever reads better on `bgHex`. */
export function contrastText(bgHex) {
  const c = parseHex(bgHex) || { r: 0, g: 0, b: 0 };
  return luminance(c) > 0.36 ? "#111111" : "#FFFFFF";
}

// ── the colors the nodes use, derived from Node Color ──────────────────────────────────────────────────────────────────────
// The values every node draws with by default (core_*.js `C`, and the grays and whites written into the panels), and the steps
// of the surfaces above bg0.
export const DEFAULT_PALETTE = Object.freeze({
  bg0: "#0b0b0b", bg1: "#111111", bg2: "#181818", bg3: "#222222", border: "#2a2a2a", borderH: "#3c3c3c",
  text: "#dedede", tWhite: "#ffffff", tLight: "#c8c8c8", tGray1: "#aaaaaa", tGray2: "#888888", muted: "#565656", tBrand: "#7612da",
  ok: "#5fd38d", warn: "#ffb347", err: "#ff6767",
});
const STEPS = { bg1: 6, bg2: 13, bg3: 23, border: 31, borderH: 49 };
// on a light node the text steps run the other way, darkest first
const LIGHT_TEXT = { text: "#1b1b1b", tLight: "#333333", tGray1: "#4d4d4d", tGray2: "#666666", muted: "#7d7d7d" };

/** What a skin can set one by one, on top of the three main colors. Until one is set it follows the main colors.
 *  `canvas` roles are the real (LiteGraph) node, drawn on the canvas; the others are what is inside the node. */
export const ROLE_DEFS = Object.freeze([
  { key: "frame", canvas: true, group: "The node itself", label: "Node frame", hint: "the node's own body and edge on the canvas (around the inside)" },
  { key: "titleText", canvas: true, group: "The node itself", label: "Title text", hint: "the name in the title bar" },
  { key: "titleDot", canvas: true, group: "The node itself", label: "Title dot", hint: "the small dot at the left of the title" },
  { key: "text", group: "Text", label: "Text", hint: "main text (light gray)" },
  { key: "tWhite", group: "Text", label: "White text", hint: "text on buttons and headers" },
  { key: "tLight", group: "Text", label: "Light gray text", hint: "secondary text" },
  { key: "tGray1", group: "Text", label: "Gray text", hint: "labels and captions" },
  { key: "tGray2", group: "Text", label: "Mid gray text", hint: "weaker labels" },
  { key: "muted", group: "Text", label: "Dim text", hint: "hints and placeholders (darkest gray)" },
  { key: "tBrand", group: "Text", label: "Brand text", hint: "text drawn in the key color (follows HighLight until set)" },
  { key: "bg1", group: "Surfaces", label: "Panel", hint: "panels and cards" },
  { key: "bg2", group: "Surfaces", label: "Text field", hint: "text fields, dropdowns, buttons at rest" },
  { key: "bg3", group: "Surfaces", label: "Raised / hover", hint: "hovered and raised surfaces" },
  { key: "border", group: "Surfaces", label: "Border", hint: "lines and outlines" },
  { key: "borderH", group: "Surfaces", label: "Border (hover)", hint: "hovered outlines" },
  { key: "ok", group: "Status", label: "Success", hint: "ready, done" },
  { key: "warn", group: "Status", label: "Warning", hint: "caution notes" },
  { key: "err", group: "Status", label: "Error", hint: "problems and failures" },
]);
export const ROLE_KEYS = ROLE_DEFS.map(r => r.key);

/** The colors for a Node Color: the surfaces step up from it on a dark node and down on a light one. `roles` are the colors the
 *  user set one by one; they win over the derived ones. `highlight` is what Brand text follows until it is set. */
export function paletteFor(nodeHex, roles = {}, highlight = DEFAULT_THEME.highlight) {
  const base = parseHex(nodeHex) || parseHex(DEFAULT_THEME.node);
  const light = luminance(base) > 0.4;
  const out = { bg0: toHex(base).toLowerCase() };
  for (const [k, d] of Object.entries(STEPS)) {
    const s = light ? -d : d;
    out[k] = toHex({ r: base.r + s, g: base.g + s, b: base.b + s }).toLowerCase();
  }
  for (const k of ["text", "tWhite", "tLight", "tGray1", "tGray2", "muted", "ok", "warn", "err"]) out[k] = (light && LIGHT_TEXT[k]) || DEFAULT_PALETTE[k];
  out.tBrand = (normHex(highlight) || DEFAULT_THEME.highlight).toLowerCase();
  for (const k of Object.keys(out)) { const o = roles && k !== "bg0" ? normHex(roles[k]) : null; if (o) out[k] = o.toLowerCase(); }
  return out;
}

/** The color a role has while the user has not set it (what the editor shows as "auto"). */
export function autoRoleColor(key, theme) {
  const t = theme || DEFAULT_THEME;
  if (key === "frame") return normHex(t.node, DEFAULT_THEME.node);
  if (key === "titleText") return contrastText(t.title);
  if (key === "titleDot") { const c = parseHex(t.title) || parseHex(DEFAULT_THEME.title); const m = (v) => v + (255 - v) * 0.4; return toHex({ r: m(c.r), g: m(c.g), b: m(c.b) }); }
  return (paletteFor(t.node, {}, t.highlight)[key] || DEFAULT_PALETTE[key] || "#000000").toUpperCase();
}

// ── storage ──────────────────────────────────────────────────────────────────────────────────────────────────────────
export function normalizeTheme(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const saved = {};
  for (const k of SAVE_KEYS) {
    const list = Array.isArray(r.saved?.[k]) ? r.saved[k] : [];
    const seen = new Set(), out = [];
    for (const v of list) { const h = normHex(v); if (h && !seen.has(h)) { seen.add(h); out.push(h); } }
    saved[k] = out.slice(0, MAX_SAVED);
  }
  return {
    title: normHex(r.title, DEFAULT_THEME.title),
    node: normHex(r.node, DEFAULT_THEME.node),
    highlight: normHex(r.highlight, DEFAULT_THEME.highlight),
    roles: normalizeRoles(r.roles),
    saved,
    updated: Number(r.updated) || 0,
  };
}
/** { role: "#RRGGBB" } for the roles that are set; the rest follow the main colors. */
export function normalizeRoles(raw) {
  const out = {};
  if (raw && typeof raw === "object") for (const k of ROLE_KEYS) { const h = normHex(raw[k]); if (h) out[k] = h; }
  return out;
}
/** All stored themes: { <node key>: theme }, the default for every node kind that has none yet. */
export function loadLocalThemes() {
  let raw = {};
  try { raw = JSON.parse(localStorage.getItem(STORE_KEY) || "{}")?.nodes || {}; } catch (_) { raw = {}; }
  const out = {};
  for (const k of Object.values(NODE_KEYS)) out[k] = normalizeTheme(raw[k]);
  return out;
}
export function saveLocalThemes(map) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ nodes: map })); } catch (_) { /* private mode etc. */ }
}
export const sameColors = (a, b) => a.title === b.title && a.node === b.node && a.highlight === b.highlight
  && JSON.stringify(a.roles || {}) === JSON.stringify(b.roles || {});
export const isDefault = (t) => sameColors(t, { ...DEFAULT_THEME, roles: {} });

// ── skins: a named set of colors, shared by every node ─────────────────────────────────────────────────────────────────
export const SKINS_KEY = "tj_studio_skins_v1";
export const MAX_SKINS = 40;
export function normalizeSkin(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const name = String(r.name ?? "").trim().slice(0, 40);
  if (!name) return null;
  return {
    name,
    title: normHex(r.title, DEFAULT_THEME.title), node: normHex(r.node, DEFAULT_THEME.node), highlight: normHex(r.highlight, DEFAULT_THEME.highlight),
    roles: normalizeRoles(r.roles), updated: Number(r.updated) || 0,
  };
}
/** The skin list with one entry per name (newest wins), newest first. */
export function normalizeSkins(list) {
  const byName = new Map();
  for (const raw of Array.isArray(list) ? list : []) {
    const s = normalizeSkin(raw); if (!s) continue;
    const k = s.name.toLowerCase(), prev = byName.get(k);
    if (!prev || s.updated >= prev.updated) byName.set(k, s);
  }
  return [...byName.values()].sort((a, b) => b.updated - a.updated).slice(0, MAX_SKINS);
}
export function loadLocalSkins() {
  try { return normalizeSkins(JSON.parse(localStorage.getItem(SKINS_KEY) || "[]")); } catch (_) { return []; }
}
export function saveLocalSkins(list) {
  try { localStorage.setItem(SKINS_KEY, JSON.stringify(list)); } catch (_) { /* private mode etc. */ }
}
export const skinFromTheme = (theme, name) => normalizeSkin({ name, title: theme.title, node: theme.node, highlight: theme.highlight, roles: theme.roles, updated: Date.now() });
/** `theme` with the colors of `skin` (the node's own saved swatches stay). */
export const themeWithSkin = (theme, skin) => normalizeTheme({ ...theme, title: skin.title, node: skin.node, highlight: skin.highlight, roles: skin.roles, updated: Date.now() });

// ── what is painted, and the rewrite plan ───────────────────────────────────────────────────────────────────────────
// The nodes always draw with their default colors. A color is rewritten by what it is used for: text (the CSS `color` property)
// has its own set of roles, so the same gray or purple can be one color as text and another as a background or border. Some
// roles stand for a few nearly equal defaults (the light grays #dedede / #dddddd / #e8e8e8, say); they become one color.
// `painted` is what the page shows now for each role, so a second Apply can turn that into the next theme. A target equal to a
// color about to be replaced would be rewritten twice, so such a target is moved a step (+1 blue) until it is free.
// With every role at its default nothing is rewritten at all.
const GENERAL_SOURCES = {
  highlight: ["#7612da"], bg0: ["#0b0b0b"], bg1: ["#111111"], bg2: ["#181818"], bg3: ["#222222"], border: ["#2a2a2a"], borderH: ["#3c3c3c"],
  ok: ["#5fd38d"], warn: ["#ffb347", "#ffb454"], err: ["#ff6767"],
};
const TEXT_SOURCES = {
  text: ["#dedede", "#dddddd", "#e8e8e8"], tWhite: ["#ffffff"], tLight: ["#c8c8c8", "#cccccc"], tGray1: ["#aaaaaa", "#a0a0a0"],
  tGray2: ["#888888", "#8a8a8a"], muted: ["#565656"], tBrand: ["#7612da"],
  ok: ["#5fd38d"], warn: ["#ffb347", "#ffb454"], err: ["#ff6767"],
};

// Grays that are not one of the standard steps are folded into the nearest step, so a skin changes every gray the nodes draw, not
// only the six exact defaults. Surfaces (dark grays) join the Panel / Field / Raised / Border steps; light grays join the text
// steps (as backgrounds too, e.g. a switch knob). Pure black and white are left alone (shadows, overlays).
const EXTRA_SURFACE = {"bg0": ["#060606", "#080808", "#08090b", "#0a0a0a", "#0a0a0e", "#0b0c0e", "#0c0c0c", "#0d0d0d", "#0e0e0e"], "bg1": ["#0c0e14", "#0d0e10", "#0e0f13", "#0f1115", "#101010", "#101217", "#101218", "#111318", "#141414", "#160b0b", "#1a1206"], "bg2": ["#11141a", "#121418", "#12151a", "#141418", "#14141a", "#14141c", "#14161a", "#14161b", "#151515", "#15171b", "#15171c", "#15171d", "#15181d", "#15181e", "#161616", "#161a20", "#17191c", "#181a20", "#181a22", "#181b20", "#191b21", "#1a1722", "#1a1a1a", "#1b1b1b", "#1c1c1c", "#1d1d1d", "#241417", "#241e12", "#241f14", "#2a1418"], "bg3": ["#16281f", "#1b1f27", "#1b2028", "#1c1e24", "#1c1e25", "#1d2024", "#1d2025", "#20222a", "#20232a", "#20242b", "#22252a", "#232323"], "border": ["#22262c", "#22262e", "#242730", "#24282e", "#242936", "#252932", "#272a30", "#282828", "#282c34", "#2a2a3a", "#2a2e38", "#2b2b2b", "#2b2d31", "#2b2f38", "#2c2c2c", "#2d323a", "#2e2e2e", "#333333"], "borderH": ["#2e333b", "#2f3540", "#30343b", "#303744", "#34373d", "#343946", "#3a3a3a", "#3a3f49", "#3a3f4b", "#3c4250", "#3e4552", "#444444", "#444455", "#444a55", "#4a4a4a", "#4a4d54"]};
const EXTRA_GENERAL_TEXT = {"muted": ["#4a5060", "#4a5062", "#555555", "#555b66", "#575b64", "#5f6672", "#6a6a6a"], "tGray2": ["#737986", "#7a7a7a", "#808080", "#818895", "#8c929f"], "tGray1": ["#9a9a9a", "#9aa0a9", "#a9adb7"], "tLight": ["#bbbbbb", "#c4c8d0", "#c5c9d3", "#ccd1dc", "#cfcfcf"], "text": ["#cdd1dc", "#cfd5df", "#d1d4da", "#d4d8e2", "#d6dae4", "#d9dce5", "#d9dde7", "#e4e4e4", "#e6e6e6", "#e6e6f0", "#eeeeee"], "tWhite": ["#f0f9ff", "#f2f3f6", "#f4f4f7", "#f5f5ff", "#fff5ee"]};
const EXTRA_TEXT = {"muted": ["#5f6672", "#6a6a6a"], "tGray2": ["#737986", "#7a7a7a", "#808080", "#818895", "#8c929f"], "tGray1": ["#9a9a9a", "#9aa0a9", "#a9adb7"], "tLight": ["#bbbbbb", "#c4c8d0", "#c5c9d3", "#ccd1dc", "#cfcfcf"], "text": ["#cdd1dc", "#cfd5df", "#d1d4da", "#d4d8e2", "#d6dae4", "#d9dce5", "#d9dde7", "#e4e4e4", "#e6e6e6", "#e6e6f0", "#eeeeee"], "tWhite": ["#f0f9ff", "#f2f3f6", "#f4f4f7", "#f5f5ff", "#fff5ee"]};
for (const [k, list] of Object.entries(EXTRA_SURFACE)) GENERAL_SOURCES[k] = [...new Set([...GENERAL_SOURCES[k], ...list])];
for (const [k, list] of Object.entries(EXTRA_TEXT)) TEXT_SOURCES[k] = [...new Set([...TEXT_SOURCES[k], ...list])];
const GENERAL_ALIAS = EXTRA_GENERAL_TEXT;       // text steps used as backgrounds / borders: only the extra grays, never the step's own color
// Purples made from the key color (lighter, darker, bluer): they follow HighLight with the same hue shift / saturation / brightness
// they have against the default key color.
const AUX_TINTS = ["#2a2550", "#43206c", "#4d238d", "#5b3fd6", "#6a5cff", "#6b2ec9", "#6f44cf", "#7c3aed", "#7d40df", "#8f7bff", "#9b5cff", "#a78bfa", "#b57bff", "#b57cf5"];
const GENERAL_KEYS = Object.keys(GENERAL_SOURCES), TEXT_KEYS = Object.keys(TEXT_SOURCES);
const KEYS = [...new Set([...GENERAL_KEYS, ...TEXT_KEYS])];
const lc = (h) => String(h).toLowerCase();
const rgbKey = ({ r, g, b }) => `${r},${g},${b}`;
const DEFAULT_REP = Object.freeze({ highlight: lc(DEFAULT_THEME.highlight), ...Object.fromEntries(Object.entries(DEFAULT_PALETTE).map(([k, v]) => [k, lc(v)])) });
function deriveTint(tint, target) {
  const d = rgbToHsv(parseHex(DEFAULT_THEME.highlight)), c = rgbToHsv(parseHex(tint)), t = rgbToHsv(parseHex(target) || parseHex(DEFAULT_THEME.highlight));
  let dh = c.h - d.h; if (dh > 180) dh -= 360; if (dh < -180) dh += 360;
  return toHex(hsvToRgb({ h: (t.h + dh + 360) % 360, s: Math.min(1, t.s * (c.s / d.s)), v: Math.min(1, t.v * (c.v / d.v)) })).toLowerCase();
}
const AUX_DOMAINS = [["general", "highlight", "g"], ["text", "tBrand", "t"]];
const desiredFor = (theme) => ({ highlight: lc(theme.highlight), ...paletteFor(theme.node, theme.roles, theme.highlight) });

function bump(hex) {
  const c = parseHex(hex);
  return toHex(c.b < 255 ? { ...c, b: c.b + 1 } : { ...c, b: c.b - 1 }).toLowerCase();
}

/** Plan the rewrite from what is painted to `target`. Returns { global, scoped, text, painted }: Maps from → to (hex, lowercase);
 *  `global` and `scoped` are for backgrounds, borders and shapes, `text` for the CSS `color` property. */
export function planRemap(painted, target) {
  const want = desiredFor(target);
  const pairs = [];                                       // { domain, key, from }
  const add = (domain, sources, k, withCur = true) => {
    const cur = lc(painted[k] ?? DEFAULT_REP[k]);
    const froms = new Set(withCur ? [cur] : []);
    if (want[k] !== DEFAULT_REP[k]) for (const f of sources[k]) froms.add(f);      // a role left at its default never touches the originals
    for (const f of froms) if (f !== want[k]) pairs.push({ domain, key: k, from: f });
  };
  for (const k of GENERAL_KEYS) add("general", GENERAL_SOURCES, k);
  for (const k of TEXT_KEYS) add("text", TEXT_SOURCES, k);
  for (const k of Object.keys(GENERAL_ALIAS)) add("general", GENERAL_ALIAS, k, false);
  const auxTo = {};
  for (const [domain, base, tag] of AUX_DOMAINS) for (const a of AUX_TINTS) {
    const id = `aux:${tag}:${a}`, to = deriveTint(a, want[base]), cur = lc(painted[id] ?? a);
    const froms = new Set([cur]); if (to !== a) froms.add(a);
    auxTo[id] = to;
    for (const f of froms) if (f !== to) pairs.push({ domain, key: id, from: f });
  }
  const sources = new Set(pairs.map(p => p.from));
  const finalTo = {};
  for (const k of KEYS) {
    let t = want[k], guard = 0;
    while (sources.has(t) && guard++ < 6) t = bump(t);
    finalTo[k] = t;
  }
  for (const [id, to0] of Object.entries(auxTo)) { let t = to0, guard = 0; while (sources.has(t) && guard++ < 6) t = bump(t); finalTo[id] = t; }
  const out = { global: new Map(), scoped: new Map(), text: new Map(), painted: {} };
  for (const k of KEYS) out.painted[k] = finalTo[k];
  for (const id of Object.keys(auxTo)) out.painted[id] = finalTo[id];
  for (const p of pairs) {
    const to = finalTo[p.key];
    if (p.from === to) continue;
    (p.domain === "text" ? out.text : (p.key === "highlight" || p.key.startsWith("aux:")) ? out.global : out.scoped).set(p.from, to);
  }
  return out;
}
export const defaultPainted = () => ({ ...DEFAULT_REP });

export function buildMaps(plan) {
  const conv = (m) => {
    const hex = new Map(), rgb = new Map();
    for (const [f, t] of m || []) {
      const fc = parseHex(f), tc = parseHex(t);
      if (!fc || !tc) continue;
      hex.set(f.replace("#", ""), t);
      rgb.set(rgbKey(fc), tc);
    }
    return { hex, rgb };
  };
  return { global: conv(plan.global), scoped: conv(plan.scoped), text: conv(plan.text) };
}

const HEX_RE = /#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?(?![0-9a-fA-F])/g;
const RGB_RE = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)/g;

/** Replace the mapped colors in `text`; one pass, so a color is never rewritten twice.
 *  `domain` "general" uses the background / border / shape pairs, "text" the text pairs. */
export function remapText(text, maps, domain = "general") {
  if (!text || (text.indexOf("#") < 0 && text.indexOf("rgb") < 0)) return text;
  const pick = (kind, key) => domain === "text" ? maps.text[kind].get(key) : (maps.global[kind].get(key) ?? maps.scoped[kind].get(key));
  let out = text.replace(HEX_RE, (all, six, alpha) => {
    const to = pick("hex", six.toLowerCase());
    return to === undefined ? all : to + (alpha || "");
  });
  out = out.replace(RGB_RE, (all, r, g, b, a) => {
    const to = pick("rgb", `${r},${g},${b}`);
    if (!to) return all;
    return a === undefined ? `rgb(${to.r}, ${to.g}, ${to.b})` : `rgba(${to.r}, ${to.g}, ${to.b}, ${a})`;
  });
  return out;
}

/** An inline style: the value of `color` is text, every other value (background, border, shadow ...) is not. */
export function remapStyleAttr(str, maps) {
  if (!str || (str.indexOf("#") < 0 && str.indexOf("rgb") < 0)) return str;
  let out = "", start = 0, depth = 0, quote = "";
  const flush = (end) => {
    const seg = str.slice(start, end), c = seg.indexOf(":");
    if (c < 0) { out += seg; return; }
    const prop = seg.slice(0, c).trim().toLowerCase();
    out += seg.slice(0, c + 1) + remapText(seg.slice(c + 1), maps, prop === "color" ? "text" : "general");
  };
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (quote) { if (ch === quote) quote = ""; }
    else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === ";" && depth === 0) { flush(i); out += ";"; start = i + 1; }
  }
  flush(str.length);
  return out;
}
/** The same for the text of a <style> element: the `color: ...` declarations are text. */
export function remapCss(css, maps) {
  if (!css) return css;
  return css.split(/((?<![-\w])color\s*:\s*[^;}]+)/gi).map((part, i) => remapText(part, maps, i % 2 ? "text" : "general")).join("");
}

// ── the live rewriter (per node kind) ──────────────────────────────────────────────────────────────────────────────────
const SHAPE_ATTRS = ["fill", "stroke", "stop-color", "flood-color"];
const COLOR_ATTRS = ["style", ...SHAPE_ATTRS];
// <style> rules the nodes add to the page, and the node kind each belongs to
const STYLE_KEY = {
  "anima-v1-styles": "anima", "fk-styles": "klein", "moss-v1-styles": "moss", "pr-styles": "music", "mmm-styles": "music",
  "itda-studio-scoped-styles": "itda", "k2v3-styles": "krea2", "ltx25-styles": "ltx25", "mmh3-styles": "minimax_h3",
  "mmh3-clip-slots-styles": "minimax_h3", "tj-clip-media-slider": "minimax_h3", "q21v1-styles": "qwen21", "qe2511v3-styles": "qwen2511",
};

const states = new Map();      // node key -> { painted, maps }: what that node's DOM shows now, and what still has to be rewritten
let observer = null;
let lastActiveKey = "";        // the node the user touched last: panels added to <body> (galleries, pickers) take its theme

const stateOf = (key) => { let st = states.get(key); if (!st) { st = { painted: defaultPainted(), maps: null }; states.set(key, st); } return st; };
const hasMaps = (st) => !!st?.maps && (st.maps.global.hex.size || st.maps.scoped.hex.size || st.maps.text.hex.size) > 0;

function processElement(el) {
  if (!el || el.nodeType !== 1) return;
  if (el.closest("[data-tj-theme-exempt]")) return;
  if (el.tagName === "STYLE") {
    const st = states.get(STYLE_KEY[el.id]);
    if (!hasMaps(st)) return;
    const css = el.textContent, next = remapCss(css, st.maps);
    if (next !== css) el.textContent = next;
    return;
  }
  const st = states.get(el.closest("[data-tj-theme]")?.dataset.tjTheme);
  if (!st?.maps) return;
  const style = el.getAttribute("style");
  if (style) { const next = remapStyleAttr(style, st.maps); if (next !== style) el.setAttribute("style", next); }
  for (const a of SHAPE_ATTRS) {
    const v = el.getAttribute(a);
    if (!v) continue;
    const next = remapText(v, st.maps, "general");
    if (next !== v) el.setAttribute(a, next);
  }
}
function processTree(root) {
  if (!root || root.nodeType !== 1) return;
  processElement(root);
  root.querySelectorAll("[style],style,svg *").forEach(processElement);
}
/** A panel added straight to <body> belongs to no node: give it the theme of the node the user touched last. */
function adoptBodyPanel(el) {
  if (el.parentNode !== document.body || el.dataset?.tjTheme || el.closest?.("[data-tj-theme-exempt]")) return;
  if (lastActiveKey && hasMaps(states.get(lastActiveKey))) el.dataset.tjTheme = lastActiveKey;
}
function onMutations(list) {
  for (const m of list) {
    if (m.type === "attributes") { adoptBodyPanel(m.target); processElement(m.target); }
    else if (m.target?.tagName === "STYLE") processElement(m.target);
    else for (const n of m.addedNodes) if (n.nodeType === 1) { adoptBodyPanel(n); processTree(n); }
  }
  observer?.takeRecords();     // what we just wrote is already right: do not look at our own edits again
}
function syncObserver() {
  const any = [...states.values()].some(hasMaps);
  if (!any) { if (observer) { observer.disconnect(); observer = null; } return; }
  if (!observer && document.documentElement) {
    observer = new MutationObserver(onMutations);
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: COLOR_ATTRS });
  }
}
const noteActive = (e) => { const k = e.target?.closest?.("[data-tj-theme]")?.dataset.tjTheme; if (k) lastActiveKey = k; };
if (typeof document !== "undefined") {
  document.addEventListener("pointerdown", noteActive, true);
  document.addEventListener("focusin", noteActive, true);
}

/** What still has to be rewritten once the page shows `p`: the nodes keep drawing with the default colors. */
export function steadyPlan(p) {
  const out = { global: new Map(), scoped: new Map(), text: new Map() };
  const add = (sources, k, map) => { const to = lc(p[k] ?? DEFAULT_REP[k]); if (to === DEFAULT_REP[k]) return; for (const f of sources[k]) if (f !== to) map.set(f, to); };
  for (const k of GENERAL_KEYS) add(GENERAL_SOURCES, k, k === "highlight" ? out.global : out.scoped);
  for (const k of TEXT_KEYS) add(TEXT_SOURCES, k, out.text);
  for (const k of Object.keys(GENERAL_ALIAS)) add(GENERAL_ALIAS, k, out.scoped);
  for (const [domain, , tag] of AUX_DOMAINS) for (const a of AUX_TINTS) {
    const to = p[`aux:${tag}:${a}`]; if (to && lc(to) !== a) (domain === "text" ? out.text : out.global).set(a, lc(to));
  }
  return out;
}

/** Make the nodes of one kind show `target`: rewrite what they draw now, then keep rewriting what they draw later. */
export function applyThemeKey(key, target) {
  const st = stateOf(key);
  const plan = planRemap(st.painted, target);
  st.maps = buildMaps(plan);
  if (plan.global.size || plan.scoped.size || plan.text.size) {
    document.querySelectorAll(`[data-tj-theme="${key}"]`).forEach(processTree);
    document.querySelectorAll("style[id]").forEach(s => { if (STYLE_KEY[s.id] === key) processElement(s); });
  }
  st.painted = plan.painted;
  st.maps = buildMaps(steadyPlan(st.painted));
  syncObserver();
  observer?.takeRecords();
}
export const paintedColors = (key) => ({ ...stateOf(key).painted });

/** Run the rewrite again over one element (a node's panel that was just marked as belonging to a node). */
export function rescan(el) {
  if (el) processTree(el);
  observer?.takeRecords();
}

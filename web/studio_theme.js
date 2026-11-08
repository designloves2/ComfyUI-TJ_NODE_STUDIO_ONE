// ONE STUDIO Node Skin — the glue between the stored themes / color editor (shared/studio_theme.js, shared/ui_theme_dialog.js)
// and ComfyUI. Every ONE STUDIO node kind has its own Title / Node / HighLight colors, kept in this browser and in
// config_theme.json; the editor is the "Node Skin" tab of each node's own ⚙ Settings (and "🎨 ONE STUDIO Node Skin…" in the node's
// right-click menu). This file paints the nodes: their title bar and body, the DOM panel inside them, and nodes created or
// loaded later. It affects the ONE STUDIO nodes only, and each kind only with its own colors.
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import {
  loadLocalThemes, saveLocalThemes, normalizeTheme, applyThemeKey, contrastText, rescan, keyOfClass,
  loadLocalSkins, saveLocalSkins, normalizeSkins, skinFromTheme, themeWithSkin, NODE_KEYS,
} from "./shared/studio_theme.js";
import { openThemeDialog } from "./shared/ui_theme_dialog.js";

let themes = loadLocalThemes();              // node key -> theme
let skins = loadLocalSkins();                // the skin library, shared by every node
for (const [key, t] of Object.entries(themes)) applyThemeKey(key, t);     // before the first node is drawn, so nothing flashes the old colors

const keyOf = (node) => keyOfClass(node?.comfyClass || node?.type);

function paintNode(node) {
  const key = keyOf(node);
  if (!key) return;
  const t = themes[key], roles = t.roles || {};
  // the real node, drawn on the canvas: title bar, body / edge, title text, title dot (the last only while one is set)
  node.color = t.title;
  node.bgcolor = roles.frame || t.node;
  node.title_color = roles.titleText || contrastText(t.title);
  if (roles.titleDot) { node.boxcolor = roles.titleDot; node._tjDot = true; }
  else if (node._tjDot) { node.boxcolor = undefined; node._tjDot = false; }
  markPanel(node, key);
}
// The DOM panel inside the node is marked with its node kind: that is what the page rewrite uses to pick the theme of
// everything inside it. The panel can appear a moment after the node, so this is tried again a few times; the first time it is
// marked, what is already drawn in it is rewritten.
function markPanel(node, key = keyOf(node)) {
  for (const w of node.widgets || []) {
    const el = w?.element;
    if (el?.dataset && el.dataset.tjTheme !== key) { el.dataset.tjTheme = key; rescan(el); }
  }
}
function paintNodeSoon(node) {
  paintNode(node);
  if (!keyOf(node)) return;
  // The node sets its own colors while it is being built, which can be after this runs; and it reads its saved colors back
  // whenever it is configured again (undo, tab switch, paste). So the theme goes on again when the node is added to the graph, when
  // it is configured, and a few times just after it was made.
  if (!node._tjThemeHooked) {
    node._tjThemeHooked = true;
    const onConfigure = node.onConfigure, onAdded = node.onAdded;
    node.onConfigure = function () { const r = onConfigure?.apply(this, arguments); paintNode(this); return r; };
    node.onAdded = function () { const r = onAdded?.apply(this, arguments); paintNode(this); return r; };
  }
  for (const ms of [0, 120, 600, 2000]) setTimeout(() => { paintNode(node); app.canvas?.setDirty?.(true, true); }, ms);
}
function graphNodes() {
  const out = [];
  const walk = (g) => { for (const n of g?._nodes || []) { out.push(n); if (n.subgraph) walk(n.subgraph); } };
  walk(app.graph);
  return out;
}

function showTheme(key) {
  const paintKind = () => { for (const n of graphNodes()) if (keyOf(n) === key) paintNode(n); app.canvas?.setDirty?.(true, true); };
  paintKind();                                                          // mark the panels first, so the rewrite knows what is inside a node
  applyThemeKey(key, themes[key]);
  setTimeout(paintKind, 800);                                           // a workflow that is still being restored brings its nodes a moment later
  window.dispatchEvent(new CustomEvent("tj-studio-theme", { detail: { key, theme: themes[key] } }));
}

const pushTimers = {};
function pushToServer(key) {
  clearTimeout(pushTimers[key]);
  pushTimers[key] = setTimeout(() => {
    api.fetchApi("/tj_studio_one/theme", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, theme: themes[key] }) }).catch(() => {});
  }, 250);
}

/** Apply a theme to one node kind and keep it. */
function apply(key, theme) {
  if (!(key in themes)) return;
  themes[key] = normalizeTheme({ ...theme, saved: theme.saved ?? themes[key].saved });
  saveLocalThemes(themes);
  showTheme(key);
  pushToServer(key);
}
/** Keep the saved-color lists (Save buttons) without changing the colors on screen. */
function saveSaved(key, saved) {
  if (!(key in themes)) return;
  themes[key] = normalizeTheme({ ...themes[key], saved, updated: Date.now() });
  saveLocalThemes(themes);
  pushToServer(key);
}

// ── the skin library ─────────────────────────────────────────────────────────────────────────────────────────────────────
const announceSkins = () => window.dispatchEvent(new CustomEvent("tj-studio-skins", { detail: skins }));
function postServer(body) {
  return api.fetchApi("/tj_studio_one/theme", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});
}
const pushSkin = (skin) => postServer({ skin });

/** Keep the colors of a node kind under a name, for every node to load. Returns the skin, or null for an empty name. */
function saveSkin(name, theme) {
  const skin = skinFromTheme(theme, name);
  if (!skin) return null;
  skins = normalizeSkins([skin, ...skins]);
  saveLocalSkins(skins);
  pushSkin(skin);
  announceSkins();
  return skin;
}
function deleteSkin(name) {
  skins = skins.filter(x => x.name.toLowerCase() !== String(name).toLowerCase());
  saveLocalSkins(skins);
  postServer({ delete_skin: name });
  announceSkins();
}
const findSkin = (name) => skins.find(x => x.name.toLowerCase() === String(name).toLowerCase());
/** Put a skin on one node kind (its own saved swatches stay). */
function useSkin(key, name) {
  const skin = findSkin(name);
  if (skin && key in themes) apply(key, themeWithSkin(themes[key], skin));
}
/** Put a skin on every ONE STUDIO node kind. */
function useSkinEverywhere(name) {
  for (const key of Object.values(NODE_KEYS)) useSkin(key, name);
}

async function syncFromServer() {
  try {
    const r = await api.fetchApi("/tj_studio_one/theme");
    const data = await r.json();
    const remote = data?.nodes || {};
    for (const key of Object.keys(themes)) {
      const rt = remote[key] ? normalizeTheme(remote[key]) : null;
      if (rt && rt.updated > themes[key].updated) { themes[key] = rt; saveLocalThemes(themes); showTheme(key); }
      else if (!rt && themes[key].updated) pushToServer(key);        // this browser has a theme the server does not know yet
    }
    // skins: keep the newest of each name from both sides, and send the server what only this browser has
    const remoteSkins = normalizeSkins(data?.skins);
    const merged = normalizeSkins([...remoteSkins, ...skins]);
    const known = new Map(remoteSkins.map(x => [x.name.toLowerCase(), x.updated]));
    for (const x of merged) if ((known.get(x.name.toLowerCase()) ?? -1) < x.updated) pushSkin(x);
    if (JSON.stringify(merged) !== JSON.stringify(skins)) { skins = merged; saveLocalSkins(skins); announceSkins(); }
  } catch (_) { /* server not reachable: the local copy is enough */ }
}

// Start asking the server for the saved skin as soon as this file loads, not when ComfyUI finishes starting: a browser that
// has nothing saved locally (a new one) then shows it as early as it can. Once only.
let syncing = null;
const syncOnce = () => (syncing ||= syncFromServer().then(() => setTimeout(() => { for (const n of graphNodes()) paintNode(n); app.canvas?.setDirty?.(true, true); }, 1500)));
syncOnce();

app.registerExtension({
  name: "TJ.StudioOne.Colors",
  async setup() {
    for (const n of graphNodes()) paintNode(n);
    syncOnce();
  },
  beforeRegisterNodeDef(nodeType, nodeData) {
    if (!keyOfClass(nodeData?.name)) return;
    const original = nodeType.prototype.getExtraMenuOptions;
    nodeType.prototype.getExtraMenuOptions = function (canvas, options) {
      const r = original?.apply(this, arguments);
      const key = keyOf(this);
      options.unshift({ content: "🎨 ONE STUDIO Node Skin…", callback: () => openThemeDialog(key) }, null);
      return r;
    };
  },
  nodeCreated(node) { paintNodeSoon(node); },
  loadedGraphNode(node) { paintNodeSoon(node); },
});

window.tjStudioTheme = {
  get: (key) => themes[key],
  apply, saveSaved,
  skins: () => skins, saveSkin, deleteSkin, useSkin, useSkinEverywhere,
  open: (key) => openThemeDialog(key),
};

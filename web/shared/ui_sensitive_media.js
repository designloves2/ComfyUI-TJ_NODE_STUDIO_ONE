// ui_sensitive_media.js — per-item "hide this" (눈가리기) for gallery thumbnails,
// shared by every node's gallery.
//
// Click the 👁 on a tile to blur it. The hidden set lives ONCE, server-side, behind
// /tj_shared/sensitive_media — the node galleries and the web twin read and write the
// same list, so hiding a picture in one place hides it everywhere. Keyed by
// "<subfolder>/<filename>".

const GET_URL = "/tj_shared/sensitive_media";

let cache = new Set();
let loaded = false;
let loadingPromise = null;
let revealAll = false;                       // session-only "peek", never persisted
const painters = new Set();                  // render() of every live tile, for repaint-on-load

function repaintAll() {
  for (const p of painters) { try { p(); } catch {} }
}

export function ensureLoaded() {
  if (loaded) return Promise.resolve();
  if (loadingPromise) return loadingPromise;
  loadingPromise = fetch(GET_URL)
    .then((r) => r.json())
    .then((d) => { if (d && d.ok && Array.isArray(d.items)) cache = new Set(d.items); })
    .catch(() => {})
    .finally(() => { loaded = true; loadingPromise = null; repaintAll(); });
  return loadingPromise;
}

/** Force a re-fetch from the server (e.g. after the web twin changed the set). */
export function refreshSensitive() {
  loaded = false;
  return ensureLoaded();
}

export function mediaKey(filename, subfolder) {
  return `${subfolder || ""}/${filename}`;
}

export function isSensitive(key) {
  return cache.has(key);
}

/** Blurred right now = in the hidden set AND not peeking. */
export function isBlurred(key) {
  return !revealAll && cache.has(key);
}

export function isRevealAll() {
  return revealAll;
}
export function setRevealAll(on) {
  revealAll = !!on;
  repaintAll();
}

export function setSensitive(key, on) {
  // optimistic: flip locally + repaint now, then persist; revert on failure
  if (on) cache.add(key); else cache.delete(key);
  repaintAll();
  fetch(GET_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, on: !!on }),
  })
    .then((r) => r.json())
    .then((d) => { if (d && d.ok && Array.isArray(d.items)) { cache = new Set(d.items); repaintAll(); } })
    .catch(() => { if (on) cache.delete(key); else cache.add(key); repaintAll(); });
}

const EYE_CSS =
  "width:18px;height:18px;padding:0;border:none;line-height:1;" +
  "display:flex;align-items:center;justify-content:center;flex:none;" +
  "background:transparent;color:#fff;font-size:11px;cursor:pointer;" +
  "text-shadow:0 0 3px rgba(0,0,0,0.95)";

const CORNER_CSS = {
  tl: "top:2px;left:2px",
  tr: "top:2px;right:2px",
  bl: "bottom:2px;left:2px",
  br: "bottom:2px;right:2px",
};

/**
 * Build the 👁 toggle + blur scrim for one gallery tile, without positioning them.
 * Returns { eye, shade, render } — the caller places them.
 * `afterRender` runs on every render (e.g. an H3 tile re-blurring its hover <video>).
 */
export function makeSensitiveControl(media, key, afterRender) {
  ensureLoaded();

  const shade = document.createElement("div");
  // Plain dark scrim, NO backdrop-filter — over an animating backdrop (a hover-preview
  // <video>) it forces the GPU to re-tile every frame. The blur is a normal `filter` on
  // the media element instead.
  shade.style.cssText =
    "position:absolute;inset:0;z-index:2;background:rgba(12,14,20,0.55);" +
    "border-radius:inherit;transition:opacity .15s;cursor:pointer";

  const eye = document.createElement("button");
  eye.type = "button";
  eye.style.cssText = EYE_CSS;

  function render() {
    const marked = isSensitive(key);
    const blurred = isBlurred(key);
    shade.style.opacity = blurred ? "1" : "0";
    shade.style.pointerEvents = blurred ? "auto" : "none";
    media.style.filter = blurred ? "blur(14px)" : "";
    eye.textContent = marked ? "⊘" : "\u{1F441}︎";   // ⊘ hidden / 👁 visible
    eye.title = marked ? "Reveal this item" : "Hide this item";
    if (afterRender) { try { afterRender(); } catch {} }
  }

  eye.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    setSensitive(key, !isSensitive(key));
    render();
    void (media.offsetWidth, shade.offsetWidth);   // force a synchronous repaint
  });
  shade.addEventListener("click", (e) => e.stopPropagation());   // swallow, don't reveal

  painters.add(render);
  render();
  return { eye, shade, render };
}

/**
 * Attach the 👁 toggle to a gallery tile at a corner, keeping `media` blurred while its
 * key is in the hidden set. `cell` must be position:relative. Call once per tile.
 */
export function attachSensitiveToggle(cell, media, key, corner = "br", afterRender) {
  const { eye, shade } = makeSensitiveControl(media, key, afterRender);
  eye.style.cssText += `;position:absolute;${CORNER_CSS[corner] || CORNER_CSS.br};z-index:3`;
  cell.appendChild(shade);
  cell.appendChild(eye);
  return eye;
}

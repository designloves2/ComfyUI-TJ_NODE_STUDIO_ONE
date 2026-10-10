// Grid / Masonry switch for the image galleries and the image gallery picker.
//
// Grid keeps the gallery's own CSS grid untouched. Masonry turns the same element into a 1px-row
// grid: every tile is measured at its real height (so original aspect ratios and any caption are
// kept) and given a row span of that height, which makes the grid's auto-placement drop each tile
// into the shortest column. The column count follows the width (auto-fill, minmax(colMin, 1fr)).
// Tiles added, removed or finished loading, and width changes, re-measure on the next frame.
const KEY = "tj_gallery_layout";
const EVENT = "tj-gallery-layout";

export function getGalleryLayout() {
  try { return localStorage.getItem(KEY) === "masonry" ? "masonry" : "grid"; } catch { return "grid"; }
}

function setGalleryLayout(mode) {
  try { localStorage.setItem(KEY, mode); } catch { /* private window: the choice just isn't remembered */ }
  window.dispatchEvent(new Event(EVENT));
}

/**
 * grid: the gallery's tile container. topRow: where the toggle button goes (before `before`, else last).
 * colMin: minimum tile width in masonry. like: a sibling button whose look the toggle copies.
 */
export function mountGalleryLayout(grid, topRow, { colMin = 120, before = null, like = null } = {}) {
  const original = {
    cols: grid.style.gridTemplateColumns, rows: grid.style.gridAutoRows,
    colGap: grid.style.columnGap, rowGap: grid.style.rowGap, gap: grid.style.gap,
  };
  const gap = parseFloat(grid.style.gap) || 6;
  let mode = getGalleryLayout();
  let frame = 0;

  const btn = document.createElement("button");
  btn.type = "button";
  if (like) btn.style.cssText = like.style.cssText;
  else btn.style.cssText = "cursor:pointer;font-family:inherit;font-size:12px;padding:5px 10px;border-radius:6px;border:none;background:#2a2a3a;color:#fff;";
  btn.addEventListener("click", () => setGalleryLayout(mode === "grid" ? "masonry" : "grid"));
  if (before && before.parentNode === topRow) topRow.insertBefore(btn, before); else topRow.appendChild(btn);

  function relayout() {
    frame = 0;
    if (mode !== "masonry" || !grid.clientWidth) return;
    const tiles = [...grid.children];
    tiles.forEach(t => { t.style.alignSelf = "start"; t.style.gridRowEnd = "span 1"; });
    const heights = tiles.map(t => t.offsetHeight);
    tiles.forEach((t, i) => { t.style.gridRowEnd = `span ${Math.max(1, Math.ceil(heights[i])) + gap}`; });
  }
  const schedule = () => { if (mode === "masonry" && !frame) frame = requestAnimationFrame(relayout); };

  function apply() {
    mode = getGalleryLayout();
    btn.textContent = mode === "masonry" ? "▦ Grid" : "▤ Masonry";
    btn.title = mode === "masonry" ? "Switch to the regular grid" : "Switch to masonry (original ratios, no gaps)";
    if (mode === "masonry") {
      grid.style.gridTemplateColumns = `repeat(auto-fill, minmax(${colMin}px, 1fr))`;
      grid.style.gridAutoRows = "1px";
      grid.style.columnGap = `${gap}px`;
      grid.style.rowGap = "0";
      schedule();
    } else {
      grid.style.gridTemplateColumns = original.cols;
      grid.style.gridAutoRows = original.rows;
      grid.style.columnGap = original.colGap;
      grid.style.rowGap = original.rowGap;
      grid.style.gap = original.gap;
      [...grid.children].forEach(t => { t.style.alignSelf = ""; t.style.gridRowEnd = ""; });
    }
  }

  new ResizeObserver(schedule).observe(grid);
  new MutationObserver(schedule).observe(grid, { childList: true });
  grid.addEventListener("load", schedule, true);
  window.addEventListener(EVENT, apply);
  apply();
}

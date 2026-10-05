// gallery_more.js — "Load more" paging for the H3 galleries and the video picker: the first
// page, then one more page per click, so a 400-clip gallery does not have to load all at once.
// The page size is the user's own setting (Settings > Output > Gallery — items per load).
import { C, el } from "../minimax/core_minimax.js";

const ROUTE_CAP = 300;     // the list routes refuse more than this in one request

/** Rows per page: state.galleryPageSize, 10–300, default 50. */
export function galleryPageSize(state) {
  const n = Math.round(Number(state?.galleryPageSize));
  return Number.isFinite(n) ? Math.min(ROUTE_CAP, Math.max(10, n)) : 50;
}

/**
 * The first `want` rows of a list route.
 * @param fetchPage  (offset, limit) => Promise<{ [key]: row[], total }>
 * @returns { rows, total }
 */
export async function fetchFirst(fetchPage, key, want) {
  const rows = [];
  let total = 0;
  while (rows.length < want) {
    const d = await fetchPage(rows.length, Math.min(ROUTE_CAP, want - rows.length));
    const page = d[key] || [];
    total = Number(d.total) || 0;
    rows.push(...page);
    if (!page.length || rows.length >= total) break;
  }
  return { rows, total };
}

/** `list` plus the rows of `more` it does not already hold (same subfolder + filename). */
export function mergeUnique(list, more) {
  const keyOf = (v) => `${v.subfolder || ""}|${v.filename}`;
  const seen = new Set(list.map(keyOf));
  return list.concat(more.filter(v => !seen.has(keyOf(v))));
}

/** The centered "Load more" button that sits at the end of a gallery grid. */
export function loadMoreButton(onClick) {
  const b = el("button", { type: "button", text: "Load more", style: {
    gridColumn: "1 / -1", justifySelf: "center", margin: "8px 0", cursor: "pointer",
    fontFamily: "inherit", fontSize: "12px", padding: "8px 28px", borderRadius: "6px",
    background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
  }});
  b.addEventListener("click", async () => {
    b.disabled = true; b.textContent = "Loading…";
    try { await onClick(); } finally { b.disabled = false; b.textContent = "Load more"; }
  });
  return b;
}

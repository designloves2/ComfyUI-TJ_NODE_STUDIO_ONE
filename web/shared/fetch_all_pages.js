// fetch_all_pages.js — the list routes cap one request at 300 rows, so a gallery that asks
// once silently stops at 300. This walks the pages until the route's own `total`.

const PAGE_SIZE = 300;
const HARD_CAP = 50000;

/**
 * @param fetchPage  (offset, limit) => Promise<{ [key]: row[], total }>
 * @param key        name of the row array in the response ("videos", "images", "tracks")
 * @returns the first response with `key` holding every row and `total` unchanged
 */
export async function fetchAllPages(fetchPage, key) {
  const first = await fetchPage(0, PAGE_SIZE);
  const rows = [...(first[key] || [])];
  const total = Math.min(Number(first.total) || rows.length, HARD_CAP);
  let last = first;
  while (rows.length < total && (last[key] || []).length) {
    last = await fetchPage(rows.length, PAGE_SIZE);
    rows.push(...(last[key] || []));
  }
  return { ...first, [key]: rows };
}

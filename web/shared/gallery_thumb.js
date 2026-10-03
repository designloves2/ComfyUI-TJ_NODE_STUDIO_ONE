// Gallery cards load a server-cached thumbnail; the full-size /view is only the fallback.
// Cards created in the same tick are fetched together: through a tunnel each request costs
// a full round trip, so sixty cards as sixty requests is the bottleneck, not their size.
const CHUNK = 30;
let queue = [];

function singleUrl(img, root) {
  const q = `filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || "")}`;
  return { thumb: `/tj_shared/thumb?${q}&root=${root}&t=${img.mtime || ""}`, full: `/view?${q}&type=${root}` };
}

function loadSingle(job) {
  const { thumb, full } = singleUrl(job.img, job.root);
  job.im.onerror = () => { job.im.onerror = null; job.im.src = full; };
  job.im.src = thumb;
}

async function flush() {
  const jobs = queue;
  queue = [];
  for (let i = 0; i < jobs.length; i += CHUNK) {
    const chunk = jobs.slice(i, i + CHUNK);
    let thumbs = [];
    try {
      const r = await fetch("/tj_shared/thumbs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: chunk.map(j => ({ root: j.root, filename: j.img.filename, subfolder: j.img.subfolder || "" })) }),
      });
      thumbs = (await r.json()).thumbs || [];
    } catch (e) { /* every card in the chunk falls back to its own request */ }
    chunk.forEach((job, k) => { if (thumbs[k]) job.im.src = thumbs[k]; else loadSingle(job); });
  }
}

export function setThumb(im, img, root = "output") {
  im.decoding = "async";
  if (!queue.length) queueMicrotask(() => setTimeout(flush, 0));
  queue.push({ im, img, root });
}

// "Cache" button: builds the thumbnails the gallery scope is still missing (or that are
// stale) in one go. getScope() -> { root, subfolder, recursive }, read at click time.
export function wireCacheButton(button, getScope) {
  const label = button.textContent;
  button.title = "Build the missing thumbnails for this gallery";
  button.addEventListener("click", async () => {
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = "⏳ Caching…";
    try {
      const r = await fetch("/tj_shared/build_thumbs", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(getScope()),
      });
      const d = await r.json();
      button.textContent = d.ok
        ? `✓ ${d.built} built · ${d.skipped} cached${d.failed ? ` · ${d.failed} failed` : ""}`
        : `⚠ ${d.error || "failed"}`;
    } catch (e) {
      button.textContent = "⚠ failed";
    }
    setTimeout(() => { button.textContent = label; button.disabled = false; }, 4000);
  });
}

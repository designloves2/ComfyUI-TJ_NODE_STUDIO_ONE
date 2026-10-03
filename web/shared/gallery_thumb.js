// Gallery cards load a server-cached thumbnail; the full-size /view is only the fallback.
export function setThumb(im, img, root = "output") {
  const q = `filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || "")}`;
  im.loading = "lazy";
  im.decoding = "async";
  im.onerror = () => { im.onerror = null; im.src = `/view?${q}&type=${root}`; };
  im.src = `/tj_shared/thumb?${q}&root=${root}&t=${img.mtime || ""}`;
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

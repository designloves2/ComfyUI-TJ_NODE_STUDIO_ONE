// ui_gallery_qwen21.js — Gallery overlay for Qwen Image 2.1 ONE (TJ)
// Ported 1:1 from qwen2511's ui_gallery_qe2511.js (pagination, lightbox viewer,
// favorite/delete/multi-select, sensitive-media blur) — the node's own bespoke
// "simple grid" gallery only fetched the first page and had no viewer at all.
import { C, el, clear, SUBFOLDER, BRAND } from "./core_qwen21.js";
import { getGallery, updateImageMeta, deleteImage, openImageFolder, loadMeta, copyOutputToInput } from "./api_qwen21.js";
import { attachSensitiveToggle, mediaKey, isBlurred, isSensitive, setSensitive } from "../shared/ui_sensitive_media.js";

const SEND_TARGETS = [
  { mode: "i2i",     field: "i2iImage",     label: "→ I2I" },
  { mode: "edit",    field: "editImage1",   label: "→ Edit (Img1)" },
  { mode: "inpaint", field: "inpaintImage", label: "→ Inpaint",  subMode: "inpaint" },
  { mode: "inpaint", field: "inpaintImage", label: "→ Outpaint", subMode: "outpaint" },
  { mode: "upscale", field: "upscaleImage", label: "→ Upscale" },
];

function btn(text, onClick, variant) {
  const b = el("button", { type: "button", text, style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "12px",
    padding: "5px 10px", borderRadius: "6px", border: "none",
    background: variant === "primary" ? BRAND : variant === "danger" ? "#c0392b" : "#2a2a3a",
    color: "#fff", fontWeight: variant === "primary" ? "700" : "400",
  }});
  b.addEventListener("click", onClick);
  return b;
}

export function createGalleryOverlay(state, ctx, onReuse, onSendTo) {
  const ov = el("div", { style: {
    position: "absolute", inset: "0", zIndex: "9997",
    background: "rgba(11,11,11,0.97)", borderRadius: "inherit",
    display: "none", flexDirection: "column",
    padding: "12px", gap: "8px", boxSizing: "border-box",
  }});

  const topRow = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" } });
  topRow.appendChild(el("div", { text: "🖼 Gallery — Qwen 2.1", style: { color: "#fff", fontSize: "14px", fontWeight: "700", flex: "1" } }));

  let favOnly = false, offset = 0, total = 0, loading = false;
  let loadedImages = [];
  const LIMIT = 48;

  // ── Multi-select ─────────────────────────────────────────────────────────
  let selectMode = false;
  const selected = new Set();   // keys from mediaKey(filename, subfolder)
  let cellRefs = [];            // { key, img, del, checkbox }

  const bulkDeleteBtn = btn("", async () => {
    if (!selected.size) return;
    if (!confirm(`Delete ${selected.size} image(s)? This cannot be undone.`)) return;
    const toDelete = cellRefs.filter(r => selected.has(r.key)).map(r => r.img);
    for (const img of toDelete) {
      await deleteImage(img.filename, img.subfolder || "");
    }
    setSelectMode(false);
    reset();
  }, "danger");
  bulkDeleteBtn.style.display = "none";

  function updateSelectionUI() {
    selectBtn.textContent = selected.size > 0 ? `${selected.size} Select` : "Select";
    if (selected.size > 0) {
      bulkDeleteBtn.textContent = `Delete ${selected.size} Image${selected.size > 1 ? "s" : ""}`;
      bulkDeleteBtn.style.display = "";
    } else {
      bulkDeleteBtn.style.display = "none";
    }
  }

  function setSelectMode(on) {
    selectMode = on;
    if (!on) selected.clear();
    cellRefs.forEach(ref => {
      ref.del.style.display = selectMode ? "none" : "";
      ref.checkbox.style.display = selectMode ? "block" : "none";
      ref.checkbox.checked = selected.has(ref.key);
    });
    updateSelectionUI();
  }

  const selectBtn  = btn("Select", () => setSelectMode(!selectMode));
  const favBtn     = btn("☆ Favs", () => { favOnly = !favOnly; favBtn.textContent = favOnly ? "★ Favs (ON)" : "☆ Favs"; reset(); });
  const refreshBtn = btn("↻ Reload", () => reset());
  const closeBtn   = btn("✕ Close", () => { ov.style.display = "none"; }, "danger");
  topRow.appendChild(bulkDeleteBtn);
  topRow.appendChild(selectBtn);
  topRow.appendChild(favBtn);
  topRow.appendChild(refreshBtn);
  topRow.appendChild(closeBtn);
  ov.appendChild(topRow);

  const grid = el("div", { style: {
    display: "grid", gridTemplateColumns: "repeat(8,1fr)",
    gap: "6px", overflowY: "auto", flex: "1", minHeight: "0", alignContent: "start",
  }});
  const statusEl = el("div", { style: { color: C.muted, fontSize: "11px", flexShrink: "0" } });
  // Scrolling the grid itself triggers the next page — user: "Load more를 누르는게
  // 아니고 그냥 스크롤이 되야함." No button to click; near the bottom, load silently.
  grid.addEventListener("scroll", () => {
    if (grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 200) loadMore();
  });

  // ── Full-size viewer ────────────────────────────────────────────────────────
  let viewerEl = null, keyHandler = null;

  function closeViewer() {
    if (keyHandler) { document.removeEventListener("keydown", keyHandler); keyHandler = null; }
    if (viewerEl)   { document.body.removeChild(viewerEl); viewerEl = null; }
  }

  function openViewer(img, imgIdx) {
    closeViewer();
    const url = `/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || "")}&type=output&t=${img.mtime || ""}`;

    const ov2 = el("div", { style: {
      position: "fixed", inset: "0", background: "rgba(0,0,0,0.92)", zIndex: "10000",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "10px",
    }});
    ov2.addEventListener("click", e => { if (e.target === ov2) closeViewer(); });

    function nav(d) { closeViewer(); const ni = Math.max(0, Math.min(loadedImages.length - 1, imgIdx + d)); openViewer(loadedImages[ni], ni); }

    const prevBtn = el("button", { text: "‹", type: "button", style: {
      position: "fixed", left: "24px", top: "50%", transform: "translateY(-50%)",
      background: "rgba(40,40,40,0.9)", color: "#fff", border: "none",
      borderRadius: "50%", width: "48px", height: "48px", fontSize: "24px", cursor: "pointer",
      display: imgIdx > 0 ? "block" : "none",
    }});
    const nextBtn = el("button", { text: "›", type: "button", style: {
      position: "fixed", right: "24px", top: "50%", transform: "translateY(-50%)",
      background: "rgba(40,40,40,0.9)", color: "#fff", border: "none",
      borderRadius: "50%", width: "48px", height: "48px", fontSize: "24px", cursor: "pointer",
      display: imgIdx < loadedImages.length - 1 ? "block" : "none",
    }});
    prevBtn.onclick = e => { e.stopPropagation(); nav(-1); };
    nextBtn.onclick = e => { e.stopPropagation(); nav(+1); };

    const sensKey = mediaKey(img.filename, img.subfolder || "");
    const bigBox = el("div", { style: {
      position: "relative", maxWidth: "90vw", maxHeight: "68vh",
      display: "flex", alignItems: "center", justifyContent: "center",
    }});
    function renderBig() {
      clear(bigBox);
      if (isBlurred(sensKey)) {
        const shade = el("div", { text: "🔒 Hidden — click to reveal", style: {
          width: "360px", height: "360px", maxWidth: "80vw", maxHeight: "60vh", borderRadius: "8px",
          background: "rgba(20,20,24,0.92)", display: "flex", alignItems: "center", justifyContent: "center",
          color: "#cfcfcf", fontSize: "13px", fontFamily: "inherit", cursor: "pointer", textAlign: "center", padding: "20px",
        }});
        shade.addEventListener("click", () => { setSensitive(sensKey, false); renderBig(); });
        bigBox.appendChild(shade);
      } else {
        bigBox.appendChild(el("img", { src: url, style: { maxWidth: "90vw", maxHeight: "68vh", borderRadius: "8px", objectFit: "contain" } }));
      }
    }
    renderBig();
    const eyeBtn = el("button", { type: "button", text: isSensitive(sensKey) ? "⊘" : "\u{1F441}︎", title: "Hide / reveal this image", style: {
      position: "absolute", top: "-2px", right: "-2px", zIndex: "3", width: "32px", height: "32px",
      borderRadius: "8px", background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", fontSize: "15px", cursor: "pointer",
    }});
    eyeBtn.addEventListener("click", e => {
      e.stopPropagation();
      setSensitive(sensKey, !isSensitive(sensKey));
      eyeBtn.textContent = isSensitive(sensKey) ? "⊘" : "\u{1F441}︎";
      renderBig();
    });
    bigBox.appendChild(eyeBtn);
    const counter = el("div", { text: `${imgIdx + 1} / ${loadedImages.length}`, style: { color: C.muted, fontSize: "11px" } });

    const closeB  = btn("Close", () => closeViewer());
    const folderB = btn("📂 Open Folder", () => openImageFolder(img.filename, img.subfolder || ""));
    const deleteB = btn("🗑 Delete", async () => {
      if (!confirm("Delete this image?")) return;
      await deleteImage(img.filename, img.subfolder || "");
      closeViewer(); reset();
    }, "danger");
    const reuseB = btn("♻ Reuse", async () => {
      reuseB.textContent = "Loading…"; reuseB.disabled = true;
      const meta = await loadMeta(img.filename, img.subfolder || "");
      if (!meta || !meta.mode) { reuseB.textContent = "No meta"; reuseB.disabled = false; return; }
      closeViewer(); ov.style.display = "none";
      if (typeof onReuse === "function") onReuse(meta);
    }, "primary");

    const actionRow = el("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "center" } });
    [closeB, reuseB, folderB, deleteB].forEach(b => actionRow.appendChild(b));

    const sendRow = el("div", { style: { display: "flex", flexWrap: "wrap", gap: "6px", justifyContent: "center" } });
    sendRow.appendChild(el("div", { text: "Send to:", style: { color: C.muted, fontSize: "12px", alignSelf: "center" } }));
    SEND_TARGETS.forEach(t => {
      const b = btn(t.label, async () => {
        b.disabled = true; b.textContent = "Copying…";
        try {
          const n = await copyOutputToInput(img.filename, img.subfolder || "", "output");
          closeViewer(); ov.style.display = "none";
          if (typeof onSendTo === "function") onSendTo(t.mode, t.field, t.subMode, n);
        } catch { b.textContent = "Error"; setTimeout(() => { b.disabled = false; b.textContent = t.label; }, 2000); }
      });
      b.style.fontSize = "11px";
      sendRow.appendChild(b);
    });

    ov2.appendChild(prevBtn); ov2.appendChild(nextBtn);
    ov2.appendChild(bigBox); ov2.appendChild(counter);
    ov2.appendChild(actionRow); ov2.appendChild(sendRow);
    document.body.appendChild(ov2);
    viewerEl = ov2;

    keyHandler = e => {
      if (e.key === "ArrowLeft")  nav(-1);
      if (e.key === "ArrowRight") nav(+1);
      if (e.key === "Escape")     closeViewer();
    };
    document.addEventListener("keydown", keyHandler);
  }

  // ── Thumbnail ──────────────────────────────────────────────────────────────
  function thumb(img, idx) {
    const url = `/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || "")}&type=output&t=${img.mtime || ""}`;
    const cell = el("div", { style: {
      position: "relative", borderRadius: "4px", overflow: "hidden",
      border: `1px solid ${C.border}`, background: C.bg2, cursor: "pointer",
    }});
    const im = el("img", { src: url, style: { width: "100%", height: "auto", display: "block" } });
    const key = mediaKey(img.filename, img.subfolder || "");
    im.addEventListener("click", () => {
      if (selectMode) { checkbox.checked = !checkbox.checked; checkbox.dispatchEvent(new Event("change")); return; }
      openViewer(img, idx);
    });

    const star = el("button", { text: img.favorite ? "★" : "☆", type: "button", style: {
      position: "absolute", top: "2px", right: "2px",
      background: "rgba(0,0,0,0.65)", color: img.favorite ? BRAND : "#fff",
      border: "none", borderRadius: "8px", width: "18px", height: "18px",
      fontSize: "10px", cursor: "pointer", lineHeight: "18px", padding: "0",
    }});
    star.addEventListener("click", async e => {
      e.stopPropagation();
      const nv = !img.favorite; img.favorite = nv;
      star.textContent = nv ? "★" : "☆"; star.style.color = nv ? BRAND : "#fff";
      await updateImageMeta(img.filename, img.subfolder || "", { favorite: nv });
    });

    const del = el("button", { text: "✕", type: "button", style: {
      position: "absolute", top: "2px", left: "2px",
      background: "rgba(180,0,0,0.7)", color: "#fff",
      border: "none", borderRadius: "8px", width: "18px", height: "18px",
      fontSize: "10px", cursor: "pointer", lineHeight: "18px", padding: "0",
    }});
    del.addEventListener("click", async e => {
      e.stopPropagation();
      if (!confirm("Delete?")) return;
      await deleteImage(img.filename, img.subfolder || ""); reset();
    });
    del.style.display = selectMode ? "none" : "";

    const checkbox = el("input", { type: "checkbox", style: {
      position: "absolute", top: "2px", left: "2px", zIndex: "2",
      width: "18px", height: "18px", margin: "0", cursor: "pointer",
      display: selectMode ? "block" : "none", accentColor: BRAND,
    }});
    checkbox.checked = selected.has(key);
    checkbox.addEventListener("click", e => e.stopPropagation());
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) selected.add(key); else selected.delete(key);
      updateSelectionUI();
    });

    cell.appendChild(im); cell.appendChild(star); cell.appendChild(del); cell.appendChild(checkbox);
    attachSensitiveToggle(cell, im, key);
    cellRefs.push({ key, img, del, checkbox });
    return cell;
  }

  // ── Load ───────────────────────────────────────────────────────────────────
  let hasMore = true;
  async function loadMore() {
    if (loading || !hasMore) return;
    loading = true;
    try {
      const data = await getGallery({ offset, limit: LIMIT, subfolder: state.saveSubfolder || SUBFOLDER, favonly: favOnly });
      const imgs = data.images || []; total = data.total || 0;
      imgs.forEach((img, i) => grid.appendChild(thumb(img, offset + i)));
      loadedImages = loadedImages.concat(imgs); offset += imgs.length;
      hasMore = offset < total;
      statusEl.textContent = loadedImages.length ? `${loadedImages.length} / ${total}` : "No images found.";
      // A fresh page may not fill/overflow the grid enough to ever trigger a scroll
      // event — pull in the next page right away until scrolling is actually needed.
      if (hasMore && grid.scrollHeight <= grid.clientHeight + 200) await loadMore();
    } catch(e) { statusEl.textContent = `Error: ${e.message || e}`; }
    finally { loading = false; }
  }

  function reset() { clear(grid); offset = 0; total = 0; hasMore = true; loadedImages = []; cellRefs = []; loadMore(); }

  ov.appendChild(grid);
  ov.appendChild(statusEl);

  return {
    el: ov,
    show() { ov.style.display = "flex"; setSelectMode(false); reset(); },
    hide() { ov.style.display = "none"; },
  };
}

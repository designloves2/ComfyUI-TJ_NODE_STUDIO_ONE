// ui_gallery_sdxl.js — Gallery overlay for SDXL ONE (TJ)
import { C, el, clear, SUBFOLDER } from "./core_sdxl.js";
import { button, row } from "../klein/ui_common.js";
import { getGallery, updateImageMeta, deleteImage, openImageFolder, loadMeta, copyOutputToInput } from "./api_sdxl.js";

const SEND_TARGETS = [
  { mode: "i2i",      field: "i2iImage",      label: "→ I2I"      },
  { mode: "inpaint",  field: "inpaintImage",  label: "→ Inpaint"  },
  { mode: "outpaint", field: "outpaintImage", label: "→ Outpaint" },
  { mode: "upscale",  field: "upscaleImage",  label: "→ Upscale"  },
];

export function createGalleryOverlay(state, ctx, onReuse, onSendTo) {
  const ov = el("div", { style: {
    position: "absolute", inset: "0", zIndex: "9997",
    background: "rgba(11,11,11,0.97)", borderRadius: "inherit",
    display: "none", flexDirection: "column",
    padding: "12px", gap: "8px", boxSizing: "border-box",
  }});

  const topRow = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" } });
  topRow.appendChild(el("div", { text: "🖼 Gallery — SDXL ONE", style: { color: "#ffffff", fontSize: "14px", fontWeight: "700", flex: "1" } }));
  const refreshBtn = button("↻", () => reset());
  const closeBtn   = button("✕", () => { ov.style.display = "none"; }, "danger");
  topRow.appendChild(refreshBtn); topRow.appendChild(closeBtn);

  let favOnly = false;
  const favBtn = button("☆ Favs", () => {
    favOnly = !favOnly;
    favBtn.textContent = favOnly ? "★ Favs (ON)" : "☆ Favs";
    reset();
  });
  topRow.appendChild(favBtn);
  ov.appendChild(topRow);

  const grid = el("div", { style: {
    display: "grid", gridTemplateColumns: "repeat(8,1fr)",
    gap: "6px", overflowY: "auto", flex: "1", alignContent: "start",
  }});
  const statusEl = el("div", { style: { color: C.muted, fontSize: "11px", flexShrink: "0" } });
  const moreBtn  = button("Load more", () => loadMore());
  moreBtn.style.display = "none";

  let offset = 0, total = 0, loading = false, loadedImages = [];
  const LIMIT = 48;

  let viewerEl = null, keyHandler = null;

  function closeViewer() {
    if (keyHandler) { document.removeEventListener("keydown", keyHandler); keyHandler = null; }
    if (viewerEl)   { document.body.removeChild(viewerEl); viewerEl = null; }
  }

  function openViewer(img, imgIdx) {
    closeViewer();
    const url = `/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder||"")}&type=output&t=${img.mtime||""}`;
    const ov2 = el("div", { style: {
      position: "fixed", inset: "0", background: "rgba(0,0,0,0.92)", zIndex: "10000",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "10px",
    }});
    ov2.addEventListener("click", e => { if (e.target === ov2) closeViewer(); });

    function nav(d) { closeViewer(); const ni = Math.max(0, Math.min(loadedImages.length-1, imgIdx+d)); openViewer(loadedImages[ni], ni); }

    const prevBtn = el("button", { text: "‹", type: "button", style: {
      position: "fixed", left: "24px", top: "50%", transform: "translateY(-50%)",
      background: "rgba(40,40,40,0.9)", color: "#fff", border: "none",
      borderRadius: "50%", width: "48px", height: "48px", fontSize: "24px", cursor: "pointer",
      display: imgIdx > 0 ? "block" : "none",
    }, onclick: e => { e.stopPropagation(); nav(-1); }});
    const nextBtn = el("button", { text: "›", type: "button", style: {
      position: "fixed", right: "24px", top: "50%", transform: "translateY(-50%)",
      background: "rgba(40,40,40,0.9)", color: "#fff", border: "none",
      borderRadius: "50%", width: "48px", height: "48px", fontSize: "24px", cursor: "pointer",
      display: imgIdx < loadedImages.length-1 ? "block" : "none",
    }, onclick: e => { e.stopPropagation(); nav(+1); }});

    const big     = el("img", { src: url, style: { maxWidth: "90vw", maxHeight: "68vh", borderRadius: "8px", objectFit: "contain" } });
    const counter = el("div", { text: `${imgIdx+1} / ${loadedImages.length}`, style: { color: C.muted, fontSize: "11px" } });
    const closeB  = button("Close", () => closeViewer());
    const folderB = button("📂 Folder", () => openImageFolder(img.filename, img.subfolder||""));
    const deleteB = button("🗑 Delete", async () => {
      if (!confirm("Delete this image?")) return;
      await deleteImage(img.filename, img.subfolder||"");
      closeViewer(); reset();
    }, "danger");
    const reuseB = button("♻ Reuse", async () => {
      reuseB.textContent = "Loading…"; reuseB.disabled = true;
      const meta = await loadMeta(img.filename, img.subfolder||"");
      if (!meta || !meta.mode) { reuseB.textContent = "No meta"; reuseB.disabled = false; return; }
      closeViewer(); ov.style.display = "none";
      if (typeof onReuse === "function") onReuse(meta);
    }, "primary");

    // Favorite
    let isFav = img.favorite || false;
    const favB = button(isFav ? "★ Fav" : "☆ Fav", async () => {
      isFav = !isFav;
      favB.textContent = isFav ? "★ Fav" : "☆ Fav";
      await updateImageMeta(img.filename, img.subfolder||"", { favorite: isFav });
    });

    const sendRow = el("div", { style: { display: "flex", flexWrap: "wrap", gap: "6px", justifyContent: "center" } });
    sendRow.appendChild(el("div", { text: "Send to:", style: { color: C.muted, fontSize: "12px", alignSelf: "center" } }));
    SEND_TARGETS.forEach(t => {
      const b = button(t.label, async () => {
        b.disabled = true; b.textContent = "Copying…";
        try {
          const n = await copyOutputToInput(img.filename, img.subfolder||"", "output");
          if (!n) throw new Error("copy returned empty filename");
          closeViewer(); ov.style.display = "none";
          if (typeof onSendTo === "function") onSendTo(t.mode, t.field, n);
        } catch(err) {
          console.error("[SDXL Gallery] send-to error:", err);
          b.textContent = "Error";
          setTimeout(() => { b.disabled = false; b.textContent = t.label; }, 2500);
        }
      });
      b.style.fontSize = "11px";
      sendRow.appendChild(b);
    });

    ov2.appendChild(prevBtn); ov2.appendChild(nextBtn);
    ov2.appendChild(big); ov2.appendChild(counter);
    ov2.appendChild(row([closeB, reuseB, favB, folderB, deleteB], "8px"));
    ov2.appendChild(sendRow);
    document.body.appendChild(ov2);
    viewerEl = ov2;
    keyHandler = e => {
      if (e.key === "ArrowLeft")  nav(-1);
      if (e.key === "ArrowRight") nav(+1);
      if (e.key === "Escape")     closeViewer();
    };
    document.addEventListener("keydown", keyHandler);
  }

  async function reset() {
    offset = 0; total = 0; loadedImages = [];
    clear(grid);
    statusEl.textContent = "Loading…";
    await loadMore();
  }

  async function loadMore() {
    if (loading) return;
    loading = true;
    try {
      const data = await getGallery({ offset, limit: LIMIT, subfolder: state.saveSubfolder || SUBFOLDER, favonly: favOnly });
      total = data.total || 0;
      const imgs = data.images || [];
      loadedImages.push(...imgs);
      imgs.forEach((img, i) => {
        const idx = loadedImages.length - imgs.length + i;
        const url = `/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder||"")}&type=output&t=${img.mtime||""}`;
        const cell = el("div", { style: { cursor: "pointer", borderRadius: "6px", overflow: "hidden", aspectRatio: "1/1", background: C.bg2, position: "relative" } });
        const im = el("img", { src: url, style: { width: "100%", height: "100%", objectFit: "cover" } });
        if (img.favorite) {
          const star = el("div", { text: "★", style: { position: "absolute", top: "2px", right: "4px", color: "#ffcc00", fontSize: "12px", textShadow: "0 0 3px #000" } });
          cell.appendChild(star);
        }
        cell.appendChild(im);
        cell.addEventListener("click", () => openViewer(img, idx));
        grid.appendChild(cell);
      });
      offset += imgs.length;
      statusEl.textContent = `${loadedImages.length} / ${total}`;
      moreBtn.style.display = loadedImages.length < total ? "block" : "none";
    } catch(e) {
      statusEl.textContent = "Load error";
    } finally { loading = false; }
  }

  ov.appendChild(grid);
  ov.appendChild(statusEl);
  ov.appendChild(moreBtn);

  return {
    el: ov,
    show() { ov.style.display = "flex"; reset(); },
    hide() { ov.style.display = "none"; },
  };
}

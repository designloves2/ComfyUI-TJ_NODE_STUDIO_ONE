// ui_gallery_qe2511.js — Gallery overlay for Qwen Image Edit 2511 ONE (TJ)
import { C, el, clear, SUBFOLDER, BRAND } from "./core_qwen2511.js";
import { getGallery, updateImageMeta, deleteImage, openImageFolder, loadMeta, copyOutputToInput } from "./api_qwen2511.js";

const SEND_TARGETS = [
  { mode: "i2i",      field: "i2iImage",        label: "→ I2I" },
  { mode: "edit",     field: "editImage1",       label: "→ Edit (Img1)" },
  { mode: "inpaint",  field: "inpaintImage",     label: "→ Inpaint",  subMode: "inpaint" },
  { mode: "inpaint",  field: "outpaintImage",    label: "→ Outpaint", subMode: "outpaint" },
  { mode: "faceswap", field: "faceswapTarget",   label: "→ Faceswap" },
  { mode: "angle",    field: "angleCameraImage",  label: "→ Angle" },
  { mode: "upscale",  field: "upscaleImage",     label: "→ Upscale" },
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
  topRow.appendChild(el("div", { text: "🖼 Gallery — Qwen2511", style: { color: "#fff", fontSize: "14px", fontWeight: "700", flex: "1" } }));
  const refreshBtn = btn("↻", () => reset());
  const closeBtn   = btn("✕", () => { ov.style.display = "none"; }, "danger");
  topRow.appendChild(refreshBtn); topRow.appendChild(closeBtn);
  ov.appendChild(topRow);

  let favOnly = false, offset = 0, total = 0, loading = false;
  let loadedImages = [];
  const LIMIT = 48;

  const favBtn = btn("☆ Favs", () => { favOnly = !favOnly; favBtn.textContent = favOnly ? "★ Favs (ON)" : "☆ Favs"; reset(); });
  topRow.appendChild(favBtn);

  const grid = el("div", { style: {
    display: "grid", gridTemplateColumns: "repeat(8,1fr)",
    gap: "6px", overflowY: "auto", flex: "1", alignContent: "start",
  }});
  const statusEl = el("div", { style: { color: C.muted, fontSize: "11px", flexShrink: "0" } });
  const moreBtn  = btn("Load more", () => loadMore());
  moreBtn.style.display = "none";

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

    const big = el("img", { src: url, style: { maxWidth: "90vw", maxHeight: "68vh", borderRadius: "8px", objectFit: "contain" } });
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
    ov2.appendChild(big); ov2.appendChild(counter);
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
    im.addEventListener("click", () => openViewer(img, idx));

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

    cell.appendChild(im); cell.appendChild(star); cell.appendChild(del);
    return cell;
  }

  // ── Load ───────────────────────────────────────────────────────────────────
  async function loadMore() {
    if (loading) return;
    loading = true; moreBtn.textContent = "Loading…";
    try {
      const data = await getGallery({ offset, limit: LIMIT, subfolder: state.saveSubfolder || SUBFOLDER, favonly: favOnly });
      const imgs = data.images || []; total = data.total || 0;
      imgs.forEach((img, i) => grid.appendChild(thumb(img, offset + i)));
      loadedImages = loadedImages.concat(imgs); offset += imgs.length;
      statusEl.textContent = `${loadedImages.length} / ${total}`;
      moreBtn.style.display = offset < total ? "block" : "none";
      if (!loadedImages.length) statusEl.textContent = "No images found.";
    } catch(e) { statusEl.textContent = `Error: ${e.message || e}`; }
    finally { loading = false; moreBtn.textContent = "Load more"; }
  }

  function reset() { clear(grid); offset = 0; loadedImages = []; loadMore(); }

  ov.appendChild(grid);
  ov.appendChild(el("div", { style: { display: "flex", gap: "8px", alignItems: "center", flexShrink: "0" } }, [statusEl, moreBtn]));

  return {
    el: ov,
    show() { ov.style.display = "flex"; reset(); },
    hide() { ov.style.display = "none"; },
  };
}

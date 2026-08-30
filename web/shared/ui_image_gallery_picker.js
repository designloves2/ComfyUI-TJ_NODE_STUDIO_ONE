// ui_image_gallery_picker.js — cross-tool gallery picker for image-upload cards. Lets a card
// (e.g. MiniMax H3's reference/first-frame slots) pick an image from any of the 5 image
// tools' own galleries instead of only local file upload. Picking copies the file into
// ComfyUI's input folder (via that tool's own copy_to_input route, filename comes back
// unique) and hands the filename to the caller — same mechanism each tool's own gallery
// "Send to" already uses, just exposed as a standalone overlay any tool can open.
import { el, clear } from "../klein/core_klein.js";

export const IMAGE_GALLERY_TOOLS = [
  // INPUT first and default: it is where a picture the user brought themselves already
  // lives, and where every previous pick was copied to — so it is the most likely place
  // to find the image being looked for, and it needs no copy step at all.
  { id: "input",    label: "INPUT folder",    api: "/tj_shared",     subfolder: "", input: true },
  { id: "krea2",    label: "Krea2",           api: "/krea2_one",     subfolder: "one_krea2" },
  { id: "zimage",   label: "Z-Image",         api: "/z_image_turbo", subfolder: "one_z-image" },
  { id: "klein",    label: "Flux2 Klein",     api: "/flux_klein",    subfolder: "one_flux2-klein" },
  { id: "qwen2511", label: "Qwen Image 2511", api: "/qwen2511_one",  subfolder: "one_qwen2511" },
  { id: "sdxl",     label: "SDXL",            api: "/sdxl_one",      subfolder: "one_sdxl" },
];

const BRAND = "#7612DA";
const C = { bg1: "#111111", bg2: "#181818", border: "#2a2a2a", text: "#dedede", muted: "#565656" };

async function fetchGallery(tool, offset, limit) {
  try {
    const url = tool.input
      ? `${tool.api}/input_gallery?offset=${offset}&limit=${limit}`
      : `${tool.api}/gallery?offset=${offset}&limit=${limit}&subfolder=${encodeURIComponent(tool.subfolder)}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  } catch { return { images: [], total: 0 }; }
}

async function copyToInput(tool, img) {
  // Already in input/ — copying it onto itself would only make a duplicate under a new
  // unique name, so the existing filename is handed straight back.
  if (tool.input) return img.filename;
  const r = await fetch(`${tool.api}/copy_to_input`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: img.filename, subfolder: img.subfolder || "", type: "output" }),
  });
  const d = await r.json();
  if (!d.ok) throw new Error(d.error || "copy failed");
  return d.filename;
}

function viewUrl(img, tool) {
  const type = tool && tool.input ? "input" : "output";
  return `/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || "")}&type=${type}&t=${img.mtime || ""}`;
}

export function openImageGalleryPicker(onPick, initialToolId) {
  let activeTool = IMAGE_GALLERY_TOOLS.find(t => t.id === initialToolId) || IMAGE_GALLERY_TOOLS[0];
  let offset = 0, total = 0, loading = false, picking = false;

  const ov = el("div", { style: { position: "fixed", inset: "0", background: "rgba(0,0,0,0.75)", zIndex: "100000", display: "flex", alignItems: "center", justifyContent: "center" } });
  const box = el("div", { style: { background: C.bg1, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "12px", width: "min(1056px, 96vw)", height: "min(840px, 92vh)", minHeight: "0", boxShadow: "0 10px 40px rgba(0,0,0,0.6)", display: "flex", flexDirection: "column", gap: "10px" } });

  const topRow = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" } });
  topRow.appendChild(el("div", { text: "🖼 Pick an image from a gallery", style: { color: "#fff", fontSize: "14px", fontWeight: "700", flex: "1" } }));
  const closeBtn = el("button", { type: "button", text: "✕", style: { cursor: "pointer", fontFamily: "inherit", fontSize: "12px", padding: "5px 10px", borderRadius: "6px", border: "none", background: "#c0392b", color: "#fff" } });
  closeBtn.addEventListener("click", () => close());
  topRow.appendChild(closeBtn);

  const toolBar = el("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap", flexShrink: "0" } });
  function renderToolBar() {
    clear(toolBar);
    IMAGE_GALLERY_TOOLS.forEach(t => {
      const active = t.id === activeTool.id;
      const b = el("button", { type: "button", text: t.label, style: {
        cursor: "pointer", fontFamily: "inherit", fontSize: "11px", padding: "5px 10px", borderRadius: "14px",
        background: active ? BRAND : C.bg2, color: active ? "#fff" : C.text,
        border: `1px solid ${active ? BRAND : C.border}`, fontWeight: active ? "700" : "400",
      }});
      b.addEventListener("click", () => { if (activeTool.id !== t.id) { activeTool = t; reset(); } });
      toolBar.appendChild(b);
    });
  }
  renderToolBar();

  const grid = el("div", { style: { display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gridAutoRows: "min-content", gap: "6px", overflowY: "auto", flex: "1", minHeight: "0", alignContent: "start" } });
  const statusEl = el("div", { style: { color: C.muted, fontSize: "11px", flexShrink: "0" } });
  const moreBtn = el("button", { type: "button", text: "Load more", style: { cursor: "pointer", fontFamily: "inherit", fontSize: "12px", padding: "6px 10px", borderRadius: "6px", border: `1px solid ${C.border}`, background: C.bg2, color: C.text, flexShrink: "0" } });
  moreBtn.style.display = "none";
  moreBtn.addEventListener("click", () => loadMore());

  box.append(topRow, toolBar, grid, statusEl, moreBtn);
  ov.appendChild(box);

  function close() {
    document.removeEventListener("keydown", onKey);
    document.body.removeChild(ov);
  }
  const onKey = e => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  ov.addEventListener("click", e => { if (e.target === ov) close(); });

  function reset() {
    offset = 0; total = 0;
    clear(grid);
    renderToolBar();
    statusEl.textContent = "Loading…";
    loadMore();
  }

  async function loadMore() {
    if (loading) return;
    loading = true;
    const tool = activeTool;
    const data = await fetchGallery(tool, offset, 60);
    if (tool.id !== activeTool.id) { loading = false; return; }
    total = data.total || 0;
    const imgs = data.images || [];
    imgs.forEach(img => {
      const cell = el("div", { style: { position: "relative", borderRadius: "4px", overflow: "hidden", border: `1px solid ${C.border}`, background: C.bg2, cursor: "pointer" } });
      const im = el("img", { src: viewUrl(img, activeTool), style: { width: "100%", height: "auto", display: "block" } });
      cell.appendChild(im);
      cell.addEventListener("click", async () => {
        if (picking) return;
        picking = true;
        const prevOpacity = cell.style.opacity;
        cell.style.opacity = "0.5";
        try {
          const filename = await copyToInput(tool, img);
          onPick(filename);
          close();
        } catch {
          cell.style.opacity = prevOpacity;
          picking = false;
        }
      });
      grid.appendChild(cell);
    });
    offset += imgs.length;
    statusEl.textContent = imgs.length || total ? `${offset} / ${total}` : "No images saved in this tool's gallery yet.";
    moreBtn.style.display = offset < total ? "block" : "none";
    loading = false;
  }

  reset();
  document.body.appendChild(ov);
}

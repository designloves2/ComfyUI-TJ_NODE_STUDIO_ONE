// ui_image_gallery_picker.js — cross-tool gallery picker for image-upload cards. Lets a card
// (e.g. MiniMax H3's reference/first-frame slots) pick an image from any of the 5 image
// tools' own galleries instead of only local file upload. Picking copies the file into
// ComfyUI's input folder (via that tool's own copy_to_input route, filename comes back
// unique) and hands the filename to the caller — same mechanism each tool's own gallery
// "Send to" already uses, just exposed as a standalone overlay any tool can open.
import { el, clear } from "../klein/core_klein.js";
import { attachSensitiveToggle, mediaKey, isBlurred } from "./ui_sensitive_media.js";

export const IMAGE_GALLERY_TOOLS = [
  // INPUT first and default: it is where a picture the user brought themselves already
  // lives, and where every previous pick was copied to — so it is the most likely place
  // to find the image being looked for, and it needs no copy step at all.
  { id: "input",    label: "INPUT folder",    api: "/tj_shared",     subfolder: "", input: true },
  // OUTPUT right next to it (user: "위치는 INPUT 옆에 추가") — the whole output/ tree
  // recursively, for a picture from a tool with no tab of its own here, or saved
  // somewhere none of the per-tool tabs below would find it.
  { id: "output",   label: "OUTPUT folder",   api: "/tj_shared",     subfolder: "", output: true },
  { id: "krea2",    label: "Krea2",           api: "/krea2_one",     subfolder: "one_krea2" },
  { id: "zimage",   label: "Z-Image",         api: "/z_image_turbo", subfolder: "one_z-image" },
  { id: "klein",    label: "Flux2 Klein",     api: "/flux_klein",    subfolder: "one_flux2-klein" },
  { id: "qwen2511", label: "Qwen Image 2511", api: "/qwen2511_one",  subfolder: "one_qwen2511" },
  { id: "sdxl",     label: "SDXL",            api: "/sdxl_one",      subfolder: "one_sdxl" },
];

const BRAND = "#7612DA";
const C = { bg1: "#111111", bg2: "#181818", border: "#2a2a2a", text: "#dedede", muted: "#565656" };

async function fetchGallery(tool, offset, limit, folderSubfolder = "") {
  try {
    const url = tool.input
      ? `${tool.api}/input_gallery?offset=${offset}&limit=${limit}&subfolder=${encodeURIComponent(folderSubfolder)}`
      : tool.output
      ? `${tool.api}/output_gallery?offset=${offset}&limit=${limit}&subfolder=${encodeURIComponent(folderSubfolder)}`
      : `${tool.api}/gallery?offset=${offset}&limit=${limit}&subfolder=${encodeURIComponent(tool.subfolder)}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  } catch { return { images: [], total: 0 }; }
}

// Folder tree (2 levels) for the INPUT/OUTPUT tabs' own navigation dropdown — these two
// can otherwise be a huge flat pile of every image anywhere in that tree, pushing the
// actual thumbnails off screen (user: "폴더가 너무 많으면 이미지가 다 밀려 보이니 불편").
async function fetchFolders(root) {
  try {
    const r = await fetch(`/tj_shared/gallery_folders?root=${root}`);
    if (!r.ok) throw new Error(String(r.status));
    const d = await r.json();
    return d.folders || [];
  } catch { return []; }
}

async function copyToInput(tool, img) {
  // Already in input/ — copying it onto itself would only make a duplicate under a new
  // unique name, so the existing filename is handed straight back.
  if (tool.input) return img.filename;
  // The generic OUTPUT tab isn't one specific tool's own copy_to_input route (it browses
  // every tool's output at once) — /tj_shared has its own for exactly this.
  const api = tool.output ? "/tj_shared" : tool.api;
  const r = await fetch(`${api}/copy_to_input`, {
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
  let activeFolder = "";   // INPUT/OUTPUT only — "" = every image under the whole tree

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
      b.addEventListener("click", () => { if (activeTool.id !== t.id) { activeTool = t; activeFolder = ""; reset(); } });
      toolBar.appendChild(b);
    });
  }
  renderToolBar();

  // Folder dropdown — only for INPUT/OUTPUT (the per-tool tabs already have one fixed
  // subfolder each, nothing to navigate). One flat <select>, 2 levels deep, options
  // indented with real spaces for the sub-level so the tree reads at a glance:
  //   (All)
  //   3D
  //   Sheets
  //     CharactersImage
  //   video
  const folderSel = el("select", { style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "11px", padding: "5px 8px",
    borderRadius: "6px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
    display: "none", flexShrink: "0",
  }});
  folderSel.addEventListener("change", () => { activeFolder = folderSel.value; reset(); });
  // Real folders on disk can change any time (another tool saves into a new subfolder,
  // the user makes one manually) — re-fetch the list every time the dropdown is about to
  // open instead of only on tab-switch, so it never goes stale while the picker sits open
  // (user: "실제 하위 폴더 목록을 만들어야 되고 실시간 갱신도 되야해"). Only refreshes
  // the option list, not the grid — refreshFolderSel() already restores the current
  // selection afterward.
  folderSel.addEventListener("mousedown", () => { refreshFolderSel(); });

  async function refreshFolderSel() {
    if (!activeTool.input && !activeTool.output) {
      folderSel.style.display = "none";
      return;
    }
    folderSel.style.display = "block";
    clear(folderSel);
    // Root entry is labelled after the tool itself, not "(All)" — there is no "show
    // everything at once" option any more (user: "ALL은 필요없어"). It shows only the
    // images directly inside input/ or output/ itself, same as every other entry shows
    // only what's directly inside that one folder — a real folder browser, not a merged
    // dump of the whole tree.
    folderSel.appendChild(el("option", { value: "", text: activeTool.label }));
    const folders = await fetchFolders(activeTool.input ? "input" : "output");
    const addOpt = (f, depth) => {
      const prefix = depth > 0 ? "  ".repeat(depth) : "";
      folderSel.appendChild(el("option", { value: f.path, text: `${prefix}${f.name}` }));
      (f.children || []).forEach(c => addOpt(c, depth + 1));
    };
    folders.forEach(f => addOpt(f, 0));
    folderSel.value = activeFolder;
  }

  const grid = el("div", { style: { display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gridAutoRows: "min-content", gap: "6px", overflowY: "auto", flex: "1", minHeight: "0", alignContent: "start" } });
  const statusEl = el("div", { style: { color: C.muted, fontSize: "11px", flexShrink: "0" } });
  const moreBtn = el("button", { type: "button", text: "Load more", style: { cursor: "pointer", fontFamily: "inherit", fontSize: "12px", padding: "6px 10px", borderRadius: "6px", border: `1px solid ${C.border}`, background: C.bg2, color: C.text, flexShrink: "0" } });
  moreBtn.style.display = "none";
  moreBtn.addEventListener("click", () => loadMore());

  box.append(topRow, toolBar, folderSel, grid, statusEl, moreBtn);
  ov.appendChild(box);

  // Background refresh of the folder list while the picker sits open, on top of the
  // refresh-on-click above — real folders can appear mid-session (another tool saving
  // into a brand new subfolder), and "실시간 갱신" means the list should catch up on its
  // own, not only when something happens to touch the dropdown.
  const folderPollTimer = setInterval(() => { refreshFolderSel(); }, 5000);

  function close() {
    document.removeEventListener("keydown", onKey);
    clearInterval(folderPollTimer);
    document.body.removeChild(ov);
  }
  const onKey = e => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  ov.addEventListener("click", e => { if (e.target === ov) close(); });

  function reset() {
    offset = 0; total = 0;
    clear(grid);
    renderToolBar();
    refreshFolderSel();
    statusEl.textContent = "Loading…";
    loadMore();
  }

  async function loadMore() {
    if (loading) return;
    loading = true;
    const tool = activeTool;
    const folder = activeFolder;
    const data = await fetchGallery(tool, offset, 60, folder);
    if (tool.id !== activeTool.id || folder !== activeFolder) { loading = false; return; }
    total = data.total || 0;
    const imgs = data.images || [];
    imgs.forEach(img => {
      const cell = el("div", { style: { position: "relative", borderRadius: "4px", overflow: "hidden", border: `1px solid ${C.border}`, background: C.bg2, cursor: "pointer" } });
      const im = el("img", { src: viewUrl(img, activeTool), style: { width: "100%", height: "auto", display: "block" } });
      cell.appendChild(im);
      // 눈가리기 — same hidden-image set every gallery in the app reads/writes, keyed by
      // subfolder+filename regardless of which tool's gallery this came from.
      const sensKey = mediaKey(img.filename, img.subfolder || "");
      attachSensitiveToggle(cell, im, sensKey, "br");
      cell.addEventListener("click", async () => {
        if (picking) return;
        // Hidden stays hidden even here — reveal it (👁 on the tile) before it can be
        // handed to whatever asked for a picture, never silently.
        if (isBlurred(sensKey)) {
          statusEl.textContent = "Hidden — click 👁 on the tile to reveal it first.";
          setTimeout(() => { statusEl.textContent = imgs.length || total ? `${offset} / ${total}` : ""; }, 2200);
          return;
        }
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

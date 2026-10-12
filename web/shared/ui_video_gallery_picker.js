// ui_video_gallery_picker.js — cross-tool gallery picker for VIDEO imports, same
// structure as ui_image_gallery_picker.js (tab bar + INPUT/OUTPUT 2-level folder
// navigation, ported over unchanged) but filtered to video files and sourced from the
// video-producing tools instead of the image ones. Built for ITDA STUDIO's "Video
// (Gallery)" import — user: "갤러리에서 불러오기에는 Input / Ouput / 미니맥스 h3 /
// ITDA Studio 이렇게 4개가 있어야 됨. (이미지 갤러리에서 불러오기와 같는 원리, 이미지가
// 아닌 영상만 보이게 필터 그리고 서브 폴더 이동 계념도 그대로 이식)"
import { el, clear } from "../klein/core_klein.js";
import { attachSensitiveToggle, mediaKey, isBlurred, wireRevealButton } from "./ui_sensitive_media.js";

export const VIDEO_GALLERY_TOOLS = [
  // INPUT first and default — same reasoning as the image picker: it needs no copy
  // step, and is where every previous pick already landed.
  { id: "input",  label: "INPUT folder",  kind: "shared", root: "input" },
  { id: "output", label: "OUTPUT folder", kind: "shared", root: "output" },
  { id: "minimaxh3", label: "H3 Video", kind: "tool", api: "/minimax_h3_one", subfolder: "one_minimax_h3" },
  { id: "itdastudio", label: "ITDA Studio", kind: "itda" },
];

const BRAND = "#7612DA";
const C = { bg1: "#111111", bg2: "#181818", border: "#2a2a2a", text: "#dedede", muted: "#565656" };

async function fetchVideos(tool, offset, limit, folderSubfolder = "") {
  try {
    if (tool.kind === "shared") {
      const url = `/tj_shared/${tool.root}_gallery_video?offset=${offset}&limit=${limit}&subfolder=${encodeURIComponent(folderSubfolder)}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      return { rows: d.images || [], total: d.total || 0 };
    }
    if (tool.kind === "tool") {
      const r = await fetch(`${tool.api}/videos?offset=${offset}&limit=${limit}&subfolder=${encodeURIComponent(tool.subfolder)}`);
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      return { rows: d.videos || [], total: d.total || (d.videos || []).length };
    }
    // ITDA Studio's own render gallery — a flat list (no subfolder concept), reused
    // as-is rather than duplicating its listing logic here.
    const r = await fetch(`/itda_studio_one/api/gallery/list`);
    if (!r.ok) throw new Error(String(r.status));
    const d = await r.json();
    const rows = (d.items || [])
      .filter(it => it.has_video !== false)
      .map(it => ({ filename: it.filename, subfolder: "one_itda_studio_gallery", mtime: it.created_at, thumb_url: it.thumb_url }));
    return { rows: rows.slice(offset, offset + limit), total: rows.length };
  } catch { return { rows: [], total: 0 }; }
}

async function fetchFolders(root) {
  try {
    const r = await fetch(`/tj_shared/gallery_folders?root=${root}`);
    if (!r.ok) throw new Error(String(r.status));
    const d = await r.json();
    return d.folders || [];
  } catch { return []; }
}

async function copyToInput(tool, item) {
  if (tool.kind === "shared" && tool.root === "input") return item.filename;
  const api = tool.kind === "tool" ? tool.api : "/tj_shared";
  const r = await fetch(`${api}/copy_to_input`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: item.filename, subfolder: item.subfolder || "", type: "output" }),
  });
  const d = await r.json();
  if (!d.ok) throw new Error(d.error || "copy failed");
  return d.filename;
}

function viewUrl(item, tool) {
  const type = tool.kind === "shared" && tool.root === "input" ? "input" : "output";
  return item.thumb_url || `/view?filename=${encodeURIComponent(item.filename)}&subfolder=${encodeURIComponent(item.subfolder || "")}&type=${type}&t=${item.mtime || ""}`;
}

export function openVideoGalleryPickerAll(onPick, initialToolId) {
  let activeTool = VIDEO_GALLERY_TOOLS.find(t => t.id === initialToolId) || VIDEO_GALLERY_TOOLS[0];
  let offset = 0, total = 0, loading = false, picking = false;
  let activeFolder = ""; // INPUT/OUTPUT only

  const ov = el("div", { style: { position: "fixed", inset: "0", background: "rgba(0,0,0,0.75)", zIndex: "100000", display: "flex", alignItems: "center", justifyContent: "center" } });
  const box = el("div", { style: { background: C.bg1, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "12px", width: "min(1056px, 96vw)", height: "min(840px, 92vh)", minHeight: "0", boxShadow: "0 10px 40px rgba(0,0,0,0.6)", display: "flex", flexDirection: "column", gap: "10px" } });

  const topRow = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" } });
  topRow.appendChild(el("div", { text: "🎞 Pick a video from a gallery", style: { color: "#fff", fontSize: "14px", fontWeight: "700", flex: "1" } }));
  const closeBtn = el("button", { type: "button", text: "✕", style: { cursor: "pointer", fontFamily: "inherit", fontSize: "12px", padding: "5px 10px", borderRadius: "6px", border: "none", background: "#c0392b", color: "#fff" } });
  closeBtn.addEventListener("click", () => close());
  const revealBtn = el("button", { type: "button", style: { cursor: "pointer", fontFamily: "inherit", fontSize: "12px", padding: "5px 10px", borderRadius: "6px", border: `1px solid ${C.border}`, background: C.bg2, color: C.text } });
  wireRevealButton(revealBtn);
  topRow.append(revealBtn, closeBtn);

  const toolBar = el("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap", flexShrink: "0" } });
  function renderToolBar() {
    clear(toolBar);
    VIDEO_GALLERY_TOOLS.forEach(t => {
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

  const folderSel = el("select", { style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "11px", padding: "5px 8px",
    borderRadius: "6px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
    display: "none", flexShrink: "0",
  }});
  folderSel.addEventListener("change", () => { activeFolder = folderSel.value; reset(); });

  async function refreshFolderSel() {
    if (activeTool.kind !== "shared") { folderSel.style.display = "none"; return; }
    folderSel.style.display = "block";
    clear(folderSel);
    folderSel.appendChild(el("option", { value: "", text: activeTool.label }));
    const folders = await fetchFolders(activeTool.root);
    const addOpt = (f, depth) => {
      const prefix = depth > 0 ? "  ".repeat(depth) : "";
      folderSel.appendChild(el("option", { value: f.path, text: `${prefix}${f.name}` }));
      (f.children || []).forEach(c => addOpt(c, depth + 1));
    };
    folders.forEach(f => addOpt(f, 0));
    folderSel.value = activeFolder;
  }

  const grid = el("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gridAutoRows: "min-content", gap: "8px", overflowY: "auto", flex: "1", minHeight: "0", alignContent: "start" } });
  const statusEl = el("div", { style: { color: C.muted, fontSize: "11px", flexShrink: "0" } });
  const moreBtn = el("button", { type: "button", text: "Load more", style: { cursor: "pointer", fontFamily: "inherit", fontSize: "12px", padding: "6px 10px", borderRadius: "6px", border: `1px solid ${C.border}`, background: C.bg2, color: C.text, flexShrink: "0" } });
  moreBtn.style.display = "none";
  moreBtn.addEventListener("click", () => loadMore());

  box.append(topRow, toolBar, folderSel, grid, statusEl, moreBtn);
  ov.appendChild(box);

  const folderPollTimer = setInterval(() => {
    if (document.activeElement === folderSel) return;
    refreshFolderSel();
  }, 5000);

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
    const { rows, total: t } = await fetchVideos(tool, offset, 60, folder);
    if (tool.id !== activeTool.id || folder !== activeFolder) { loading = false; return; }
    total = t;
    rows.forEach(item => {
      const cell = el("div", { style: { position: "relative", borderRadius: "6px", overflow: "hidden", border: `1px solid ${C.border}`, background: "#000", cursor: "pointer", height: "108px" } });
      const vid = el("video", { src: viewUrl(item, tool), muted: "", playsInline: "", preload: "metadata",
        style: { width: "100%", height: "100%", objectFit: "cover", display: "block", background: "#000" } });
      vid.muted = true;
      cell.addEventListener("mouseenter", () => { try { vid.currentTime = 0; vid.play().catch(() => {}); } catch {} cell.style.borderColor = BRAND; });
      cell.addEventListener("mouseleave", () => { vid.pause(); cell.style.borderColor = C.border; });
      cell.appendChild(vid);
      const nameTag = el("div", { text: item.filename, style: { position: "absolute", left: "0", right: "0", bottom: "0", padding: "2px 5px", fontSize: "10px", color: "#eee", background: "rgba(0,0,0,0.6)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } });
      cell.appendChild(nameTag);
      // 눈가리기 — same hidden-video set every gallery in the app reads/writes.
      const sensKey = mediaKey(item.filename, item.subfolder || "");
      attachSensitiveToggle(cell, vid, sensKey, "br");
      cell.addEventListener("click", async () => {
        if (picking) return;
        if (isBlurred(sensKey)) {
          statusEl.textContent = "Hidden — click 👁 on the tile to reveal it first.";
          setTimeout(() => { statusEl.textContent = rows.length || total ? `${offset} / ${total}` : ""; }, 2200);
          return;
        }
        picking = true;
        const prevOpacity = cell.style.opacity;
        cell.style.opacity = "0.5";
        try {
          const filename = await copyToInput(tool, item);
          onPick(filename, item);
          close();
        } catch {
          cell.style.opacity = prevOpacity;
          picking = false;
        }
      });
      grid.appendChild(cell);
    });
    offset += rows.length;
    statusEl.textContent = rows.length || total ? `${offset} / ${total}` : "No videos in this tab yet.";
    moreBtn.style.display = offset < total ? "block" : "none";
    loading = false;
  }

  reset();
  document.body.appendChild(ov);
}

// ui_video_picker_minimax.js — pick a rendered clip as a reference video.
//
// A reference video is almost always something this node made a moment ago, so browsing
// the output folder beats hunting for the file on disk and re-uploading a copy of it.
// The chosen clip is copied into ComfyUI's input folder, because that is the only place
// the loader nodes can read from.
import { C, BRAND, el, API } from "./core_minimax.js";
import { api } from "../../../scripts/api.js";

/**
 * Open the picker. `onPick(inputFilename)` receives the name of the copy in input/.
 *
 * Hover plays the clip muted — with a wall of near-identical takes, a still first frame
 * is not enough to tell them apart.
 */
export function openVideoGalleryPicker(onPick) {
  const box = el("div", { style: {
    background: "#0e0e0e", border: `1px solid ${C.border}`, borderRadius: "10px",
    width: "860px", maxWidth: "94%", height: "80vh",
    display: "flex", flexDirection: "column", overflow: "hidden",
    boxShadow: "0 16px 50px rgba(0,0,0,0.65)",
  }});
  const head = el("div", { style: {
    display: "flex", alignItems: "center", gap: "8px", padding: "10px 12px",
    borderBottom: `1px solid ${C.border}`, flexShrink: "0",
  }}, [el("div", { text: "🎞 Pick a reference video", style: {
    color: "#fff", fontSize: "13px", fontWeight: "700", flex: "1" } })]);
  const grid = el("div", { style: {
    padding: "12px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
    gap: "10px", overflowY: "auto", flex: "1 1 auto", minHeight: "0",
  }});
  const status = el("div", { text: "loading…", style: {
    padding: "8px 12px", fontSize: "11px", color: C.muted, flexShrink: "0",
    borderTop: `1px solid ${C.border}` } });
  box.append(head, grid, status);

  const ov = el("div", { style: {
    position: "fixed", inset: "0", zIndex: "100050", display: "flex",
    alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.72)",
  }}, [box]);
  const close = () => ov.remove();
  ov.addEventListener("mousedown", (e) => { if (e.target === ov) close(); });
  head.appendChild(el("button", { type: "button", text: "✕ Close", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "11px", padding: "4px 10px",
    borderRadius: "6px", background: "transparent", color: C.err,
    border: `1px solid ${C.border}`,
  }, onclick: close }));
  document.body.appendChild(ov);

  (async () => {
    let items = [];
    try {
      const r = await api.fetchApi(`${API}/videos?limit=120`);
      items = (await r.json()).videos || [];
    } catch (e) {
      status.textContent = `Could not read the gallery: ${e?.message || e}`;
      return;
    }
    if (!items.length) { status.textContent = "No rendered clips yet."; return; }
    status.textContent = `${items.length} clips · hover to preview`;

    items.forEach(it => {
      const url = `/view?filename=${encodeURIComponent(it.filename)}` +
                  `&subfolder=${encodeURIComponent(it.subfolder || "")}&type=output`;
      const cell = el("div", { style: {
        border: `1px solid ${C.border}`, borderRadius: "8px", overflow: "hidden",
        cursor: "pointer", background: "#000", display: "flex", flexDirection: "column",
        height: "134px",
      }});
      // An explicit height, not aspect-ratio: a <video> whose metadata has not loaded has
      // no intrinsic size, so the ratio resolved to nothing and every row collapsed to a
      // 21px sliver — which also meant 120 clips fitted the page and it never scrolled.
      const vid = el("video", { src: url, muted: "", playsInline: "", preload: "metadata",
        style: { width: "100%", height: "108px", objectFit: "cover", display: "block",
                 background: "#000", flexShrink: "0" } });
      vid.muted = true;
      cell.addEventListener("mouseenter", () => { vid.currentTime = 0; vid.play().catch(() => {}); cell.style.borderColor = BRAND; });
      cell.addEventListener("mouseleave", () => { vid.pause(); vid.currentTime = 0; cell.style.borderColor = C.border; });
      cell.append(vid, el("div", { text: it.filename, title: it.filename, style: {
        fontSize: "9.5px", color: C.muted, padding: "4px 5px",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }));

      cell.addEventListener("click", async () => {
        status.textContent = "copying to input…";
        try {
          const r = await api.fetchApi(`${API}/copy_to_input`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename: it.filename, subfolder: it.subfolder || "", type: "output" }),
          });
          const d = await r.json();
          if (!r.ok || !d.filename) throw new Error(d.error || "copy failed");
          close();
          onPick(d.filename);
        } catch (e) {
          status.textContent = `Could not use that clip: ${e?.message || e}`;
        }
      });
      grid.appendChild(cell);
    });
  })();
}

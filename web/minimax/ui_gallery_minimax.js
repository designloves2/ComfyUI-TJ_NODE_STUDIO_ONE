// ui_gallery_minimax.js — clip gallery + fullscreen player for MiniMax H3 ONE STUDIO (TJ)
//
// The node's results are videos, so the shared PNG gallery doesn't apply: this lists the
// mp4s written into the output subfolder and plays them full screen with the keyboard
// shortcuts you'd expect from a review pass.
import { C, BRAND, el, clear, SUBFOLDER } from "./core_minimax.js";
import { button } from "../klein/ui_common.js";
import { listVideos, revealOutputFolder } from "./api_minimax.js";

function viewURL(v) {
  return `/view?filename=${encodeURIComponent(v.filename)}`
    + `&subfolder=${encodeURIComponent(v.subfolder || "")}&type=output`;
}

function fmtSize(bytes) {
  if (!bytes) return "";
  const mb = bytes / 1048576;
  return mb >= 1 ? `${mb.toFixed(1)}MB` : `${Math.round(bytes / 1024)}KB`;
}

function fmtWhen(mtime) {
  try { return new Date(mtime * 1000).toLocaleString(); } catch { return ""; }
}

export function createGalleryOverlay(state, ctx) {
  const ov = el("div", { style: {
    position: "absolute", inset: "0", zIndex: "9998",
    background: "rgba(11,11,11,0.985)", borderRadius: "inherit",
    display: "none", flexDirection: "column", padding: "12px", gap: "8px", boxSizing: "border-box",
  }});

  let videos = [];
  let filterFull = false;

  const hdr = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" } });
  hdr.appendChild(el("div", { text: "🖼 Gallery", style: { color: "#fff", fontSize: "14px", fontWeight: "700" } }));
  const countTag = el("div", { style: { fontSize: "10.5px", color: C.muted, flex: "1" } });
  hdr.appendChild(countTag);

  const fullBtn = el("button", { type: "button", text: "★ stitched only", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "10.5px", padding: "5px 11px",
    borderRadius: "6px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
  }});
  fullBtn.addEventListener("click", () => {
    filterFull = !filterFull;
    fullBtn.style.background = filterFull ? BRAND : C.bg2;
    fullBtn.style.borderColor = filterFull ? BRAND : C.border;
    renderGrid();
  });
  const refreshBtn = el("button", { type: "button", text: "↻", title: "Refresh", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "12px", padding: "5px 11px",
    borderRadius: "6px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
  }});
  refreshBtn.addEventListener("click", () => refresh());
  const folderBtn = el("button", { type: "button", text: "📂 Open folder", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "10.5px", padding: "5px 11px",
    borderRadius: "6px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
  }});
  folderBtn.addEventListener("click", async () => {
    const r = await revealOutputFolder(state.saveSubfolder || SUBFOLDER);
    if (!r.ok) ctx.showPopup?.(`Could not open the folder: ${r.error || "unknown"}`, true);
  });
  hdr.append(fullBtn, refreshBtn, folderBtn, button("✕ Close", () => hide(), "danger"));

  const grid = el("div", { style: {
    flex: "1", overflowY: "auto", display: "grid", gap: "8px",
    gridTemplateColumns: "repeat(auto-fill, minmax(168px, 1fr))", alignContent: "start", paddingRight: "4px",
  }});
  grid.className = "mmh3-lp";

  const hint = el("div", { style: { flexShrink: "0", fontSize: "10px", color: C.muted, textAlign: "center" } });
  hint.innerHTML = "double-click a clip to play it full screen · "
    + "<b>space</b> play/pause · <b>← →</b> seek · <b>[ ]</b> previous / next · <b>Esc</b> close";

  ov.append(hdr, grid, hint);

  // ── fullscreen player ──────────────────────────────────────────────────────
  const player = el("div", { style: {
    display: "none", position: "fixed", inset: "0", zIndex: "100000",
    background: "rgba(0,0,0,0.97)", flexDirection: "column",
  }});
  const pTop = el("div", { style: {
    flexShrink: "0", display: "flex", alignItems: "center", gap: "10px",
    padding: "10px 14px", color: "#fff", fontFamily: "'Segoe UI',sans-serif",
  }});
  const pTitle = el("div", { style: { fontSize: "13px", fontWeight: "600", flex: "1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } });
  const pPos = el("div", { style: { fontSize: "11px", color: "#9a9a9a" } });
  const pClose = el("button", { type: "button", text: "✕", title: "Close (Esc)", style: {
    cursor: "pointer", background: "rgba(255,255,255,0.1)", color: "#fff", border: "none",
    borderRadius: "6px", width: "30px", height: "30px", fontSize: "14px",
  }});
  pTop.append(pTitle, pPos, pClose);

  const pVideo = el("video", { controls: "", playsinline: "", style: {
    flex: "1", minHeight: "0", width: "100%", objectFit: "contain", background: "#000",
  }});
  const pFoot = el("div", { style: {
    flexShrink: "0", padding: "8px 14px 14px", color: "#7a7a7a", fontSize: "11px",
    textAlign: "center", fontFamily: "'Segoe UI',sans-serif",
  }});
  pFoot.innerHTML = "<b>space</b> play/pause · <b>← →</b> ±5s · <b>Shift+← →</b> ±1s · "
    + "<b>[ ]</b> previous / next clip · <b>f</b> browser fullscreen · <b>Esc</b> close";
  player.append(pTop, pVideo, pFoot);

  let playIndex = -1;
  function shown() { return filterFull ? videos.filter(v => v.is_full) : videos; }

  function openPlayer(i) {
    const list = shown();
    if (!list.length) return;
    playIndex = Math.max(0, Math.min(i, list.length - 1));
    const v = list[playIndex];
    pVideo.src = viewURL(v);
    pTitle.textContent = v.filename;
    pPos.textContent = `${playIndex + 1} / ${list.length}`;
    player.style.display = "flex";
    pVideo.play?.().catch(() => {});
    setTimeout(() => pVideo.focus(), 30);
  }
  function closePlayer() {
    player.style.display = "none";
    try { pVideo.pause(); } catch {}
    pVideo.removeAttribute("src");
    pVideo.load?.();
  }
  function step(delta) {
    const list = shown();
    if (!list.length) return;
    openPlayer((playIndex + delta + list.length) % list.length);
  }
  pClose.addEventListener("click", closePlayer);

  // Player keys are captured while it's open so they never reach the canvas.
  const onKey = (e) => {
    if (player.style.display === "none") return;
    const k = e.key;
    if (k === "Escape")      { e.preventDefault(); e.stopPropagation(); closePlayer(); return; }
    if (k === " ")           { e.preventDefault(); e.stopPropagation(); pVideo.paused ? pVideo.play() : pVideo.pause(); return; }
    if (k === "ArrowRight")  { e.preventDefault(); e.stopPropagation(); pVideo.currentTime += e.shiftKey ? 1 : 5; return; }
    if (k === "ArrowLeft")   { e.preventDefault(); e.stopPropagation(); pVideo.currentTime -= e.shiftKey ? 1 : 5; return; }
    if (k === "]")           { e.preventDefault(); e.stopPropagation(); step(1); return; }
    if (k === "[")           { e.preventDefault(); e.stopPropagation(); step(-1); return; }
    if (k === "f" || k === "F") {
      e.preventDefault(); e.stopPropagation();
      if (document.fullscreenElement) document.exitFullscreen?.();
      else player.requestFullscreen?.();
    }
  };
  document.addEventListener("keydown", onKey, true);

  // ── grid ───────────────────────────────────────────────────────────────────
  function renderGrid() {
    clear(grid);
    const list = shown();
    countTag.textContent = `${list.length} clip${list.length === 1 ? "" : "s"}`
      + (filterFull ? " (stitched)" : "") + ` · ${state.saveSubfolder || SUBFOLDER}`;
    if (!list.length) {
      grid.appendChild(el("div", {
        text: filterFull ? "No stitched videos yet." : "No clips yet — generate something first.",
        style: { color: C.muted, fontSize: "12px", gridColumn: "1 / -1", textAlign: "center", padding: "30px 0" } }));
      return;
    }
    list.forEach((v, i) => {
      const card = el("div", { style: {
        background: C.bg1, border: `1px solid ${v.is_full ? BRAND : C.border}`,
        borderRadius: "8px", overflow: "hidden", cursor: "pointer",
        display: "flex", flexDirection: "column",
      }});
      // A muted <video> is its own thumbnail — hovering scrubs a short preview.
      const vid = el("video", { src: viewURL(v), muted: "", playsinline: "", preload: "metadata", style: {
        width: "100%", height: "112px", objectFit: "cover", background: "#000", display: "block",
      }});
      vid.muted = true;
      card.addEventListener("mouseenter", () => { vid.currentTime = 0; vid.play?.().catch(() => {}); });
      card.addEventListener("mouseleave", () => { try { vid.pause(); vid.currentTime = 0; } catch {} });
      card.addEventListener("dblclick", () => openPlayer(i));

      const meta = el("div", { style: { padding: "5px 7px", display: "flex", flexDirection: "column", gap: "1px" } });
      meta.append(
        el("div", { text: v.filename, style: {
          fontSize: "10px", color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }),
        el("div", { text: `${fmtSize(v.size)} · ${fmtWhen(v.mtime)}`, style: { fontSize: "9px", color: C.muted } }),
      );
      if (v.is_full) {
        meta.appendChild(el("div", { text: "★ stitched", style: { fontSize: "9px", color: BRAND, fontWeight: "700" } }));
      }

      // The prompt the clip was rendered from, plus a one-click way back into the editor.
      const promptText = String(v.prompt || v.meta?.prompt || "").trim();
      if (promptText) {
        const p = el("div", { text: promptText, style: {
          fontSize: "9px", color: C.muted, lineHeight: "1.35", marginTop: "2px",
          display: "-webkit-box", WebkitLineClamp: "3", WebkitBoxOrient: "vertical",
          overflow: "hidden", cursor: "text",
        }});
        p.title = promptText;
        meta.appendChild(p);

        const bar = el("div", { style: { display: "flex", gap: "4px", marginTop: "4px" } });
        const mini = (txt, tip, fn) => {
          const b = el("button", { text: txt, style: {
            flex: "1", fontSize: "9px", padding: "3px 0", cursor: "pointer",
            background: C.bg2, color: C.text, border: `1px solid ${C.border}`, borderRadius: "4px",
          }});
          b.title = tip;
          b.addEventListener("click", e => { e.stopPropagation(); fn(); });
          return b;
        };
        bar.append(
          mini("↩ Reuse", "Load this prompt back into the editor", () => {
            const ok = ctx.reusePrompt?.(v.meta || { prompt: promptText });
            ctx.showPopup?.(ok ? "Prompt loaded into the editor." : "No prompt stored for this clip.", !ok);
            if (ok) hide();
          }),
          mini("⧉ Copy", "Copy the prompt to the clipboard", () => {
            navigator.clipboard?.writeText(promptText)
              .then(() => ctx.showPopup?.("Prompt copied.", false))
              .catch(() => ctx.showPopup?.("Copy failed.", true));
          }),
        );
        meta.appendChild(bar);
      }
      card.append(vid, meta);
      grid.appendChild(card);
    });
  }

  async function refresh() {
    countTag.textContent = "loading…";
    try {
      const d = await listVideos(state.saveSubfolder || SUBFOLDER);
      videos = d.videos || [];
    } catch { videos = []; }
    renderGrid();
  }

  function hide() { closePlayer(); ov.style.display = "none"; }

  return {
    el: ov,
    playerEl: player,
    show() { ov.style.display = "flex"; refresh(); },
    hide,
    isOpen: () => ov.style.display !== "none",
    isPlaying: () => player.style.display !== "none",
    destroy() { document.removeEventListener("keydown", onKey, true); },
  };
}

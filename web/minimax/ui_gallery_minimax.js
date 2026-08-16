// ui_gallery_minimax.js — clip gallery + fullscreen player for MiniMax H3 ONE STUDIO (TJ)
//
// The node's results are videos, so the shared PNG gallery doesn't apply: this lists the
// mp4s written into the output subfolder and plays them full screen with the keyboard
// shortcuts you'd expect from a review pass.
import { C, BRAND, el, clear, SUBFOLDER, framesToSeconds } from "./core_minimax.js";
import { button } from "../klein/ui_common.js";
import { listVideos, revealOutputFolder, stitchClips, saveMeta } from "./api_minimax.js";

const STITCH_MAX = 10;

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
  // ── stitch mode (A6) — pick clips in click order, then concat server-side ──────────
  let stitchMode = false;
  let stitchOrder = [];   // array of video keys (filename|subfolder), in pick order
  const vKey = v => `${v.subfolder || ""}|${v.filename}`;

  const stitchBtn = el("button", { type: "button", text: "🔗 스티치", title: "Pick clips in order, then combine into one file", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "10.5px", padding: "5px 11px",
    borderRadius: "6px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
  }});
  stitchBtn.addEventListener("click", () => {
    stitchMode = !stitchMode;
    stitchOrder = [];
    stitchBtn.style.background = stitchMode ? BRAND : C.bg2;
    stitchBtn.style.borderColor = stitchMode ? BRAND : C.border;
    stitchBar.style.display = stitchMode ? "flex" : "none";
    renderGrid();
  });
  hdr.append(fullBtn, stitchBtn, refreshBtn, folderBtn, button("✕ Close", () => hide(), "danger"));

  const stitchBar = el("div", { style: {
    display: "none", flexShrink: "0", alignItems: "center", gap: "8px",
    background: C.bg1, border: `1px solid ${BRAND}`, borderRadius: "8px", padding: "7px 10px",
  }});
  const stitchInfo = el("div", { style: { flex: "1", fontSize: "10.5px", color: C.text } });
  const stitchClearBtn = el("button", { type: "button", text: "✕ Clear", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "10.5px", padding: "5px 10px",
    borderRadius: "6px", background: C.bg2, color: C.muted, border: `1px solid ${C.border}`,
  }});
  stitchClearBtn.addEventListener("click", () => { stitchOrder = []; renderGrid(); });
  const stitchGoBtn = button("🔗 Combine", () => runStitch(), "primary");
  stitchBar.append(stitchInfo, stitchClearBtn, stitchGoBtn);

  function refreshStitchBar() {
    const picked = stitchOrder.map(k => videos.find(v => vKey(v) === k)).filter(Boolean);
    const known = picked.map(v => v.meta?.frames ? framesToSeconds(v.meta.frames) : null);
    const total = known.every(s => s != null) ? known.reduce((a, b) => a + b, 0) : null;
    const sizes = new Set(picked.map(v => `${v.meta?.w || "?"}x${v.meta?.h || "?"}`));
    let text = `${picked.length} / ${STITCH_MAX} selected`;
    if (picked.length >= STITCH_MAX) text += " · 더 긴 편집은 영상 편집기를 쓰세요";
    if (total != null) text += ` · ≈${total.toFixed(2)}s`;
    if (sizes.size > 1) text += ` · ⚠ mixed resolution (${[...sizes].join(", ")}) — stitch may fail or look off`;
    stitchInfo.textContent = text;
    stitchGoBtn.disabled = picked.length < 2;
    stitchGoBtn.style.opacity = picked.length < 2 ? "0.5" : "1";
  }

  async function runStitch() {
    const picked = stitchOrder.map(k => videos.find(v => vKey(v) === k)).filter(Boolean);
    if (picked.length < 2) return;
    stitchGoBtn.disabled = true;
    stitchInfo.textContent = `Stitching ${picked.length} clips…`;
    try {
      const folder = (state.saveSubfolder || SUBFOLDER).replace(/\\/g, "/");
      const out = await stitchClips(
        picked.map(v => ({ filename: v.filename, subfolder: v.subfolder || "" })),
        `${folder}/${state.filenamePrefix || "MMH3"}_full`, null,
      );
      await saveMeta(out.filename, out.subfolder || "", {
        v: 1, prompt: picked.map(v => v.prompt || "").filter(Boolean).join("\n\n"),
        clips: picked.length, stitched: true, node: "minimax_h3", created: Date.now(),
        prompts: picked.map(v => v.prompt || ""),
      });
      ctx.showPopup?.(`Stitched ${picked.length} clips → ${out.filename}`, false);
      stitchOrder = [];
      await refresh();
    } catch (e) {
      ctx.showPopup?.(`Stitch failed: ${e.message || e}`, true);
      refreshStitchBar();
    }
  }

  const grid = el("div", { style: {
    flex: "1", overflowY: "auto", display: "grid", gap: "8px",
    gridTemplateColumns: "repeat(auto-fill, minmax(168px, 1fr))", alignContent: "start", paddingRight: "4px",
  }});
  grid.className = "mmh3-lp";

  const hint = el("div", { style: { flexShrink: "0", fontSize: "10px", color: C.muted, textAlign: "center" } });
  hint.innerHTML = "double-click a clip to play it full screen · "
    + "<b>space</b> play/pause · <b>← →</b> seek · <b>[ ]</b> previous / next · <b>Esc</b> close";

  ov.append(hdr, stitchBar, grid, hint);

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
    stopGridVideos();   // the card under the player must not keep looping behind it
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

  // A <video> that gets detached from the document keeps playing — it just stops
  // being visible, and it never sees another mouseleave. Every path that hides or
  // rebuilds the grid has to stop the cards itself.
  function stopGridVideos() {
    for (const v of grid.querySelectorAll("video")) {
      try { v.pause(); v.currentTime = 0; } catch {}
    }
  }

  // ── grid ───────────────────────────────────────────────────────────────────
  // A live <video src> per card is expensive — a gallery of 100+ clips mounting them all
  // at once was enough to exhaust the renderer's video-decoder memory and crash the tab
  // (blank/black cards right before the crash were the same symptom, not a sizing bug).
  // Only cards actually near the viewport get a real src; scrolling past unloads it again.
  //
  // IntersectionObserver was tried first but never fired here — ComfyUI's DOM widgets sit
  // inside a CSS-transformed ancestor (the canvas' zoom/pan transform), which is a known
  // source of IO false-negatives in Chromium. A manual rect check on scroll is what
  // actually works regardless of that transform. requestAnimationFrame was tried for the
  // throttle too, but rAF is paused for backgrounded/inactive tabs — setTimeout isn't, so
  // that's what schedules the check.
  let lazyVideos = [];
  let lazyTimer = 0;
  function updateLazyVideos() {
    lazyTimer = 0;
    const gr = grid.getBoundingClientRect();
    const margin = 400;
    const top = gr.top - margin, bottom = gr.bottom + margin;
    for (const v of lazyVideos) {
      if (!v.isConnected) continue;
      const r = v.getBoundingClientRect();
      const visible = r.bottom >= top && r.top <= bottom && r.height > 0;
      if (visible) {
        // "none" (the resting state) never paints a frame at all, even once src is set —
        // it has to flip to "metadata" for the browser to actually decode and show one.
        if (!v.src && v.dataset.src) { v.preload = "metadata"; v.src = v.dataset.src; }
      } else if (v.src) {
        try { v.pause(); } catch {}
        v.removeAttribute("src");
        v.preload = "none";
        v.load();
      }
    }
  }
  function scheduleLazyUpdate() {
    if (lazyTimer) return;
    lazyTimer = setTimeout(updateLazyVideos, 50);
  }
  grid.addEventListener("scroll", scheduleLazyUpdate);

  function renderGrid() {
    stopGridVideos();
    lazyVideos = [];
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
      const pickIdx = stitchMode ? stitchOrder.indexOf(vKey(v)) : -1;
      const picked = pickIdx !== -1;
      const card = el("div", { style: {
        position: "relative",
        background: C.bg1, border: `1px solid ${picked ? BRAND : (v.is_full ? BRAND : C.border)}`,
        borderRadius: "8px", overflow: "hidden", cursor: "pointer",
        display: "flex", flexDirection: "column",
        opacity: (stitchMode && !picked && stitchOrder.length >= STITCH_MAX) ? "0.4" : "1",
      }});
      // A muted <video> is its own thumbnail — hovering scrubs a short preview. `src` is
      // only attached once the card is actually near the viewport (see ensureGridObserver).
      const vid = el("video", { muted: "", playsinline: "", preload: "none", style: {
        width: "100%", height: "112px", objectFit: "cover", background: "#000", display: "block",
      }});
      vid.muted = true;
      vid.dataset.src = viewURL(v);
      lazyVideos.push(vid);
      card.addEventListener("mouseenter", () => {
        stopGridVideos();               // only ever one card previewing at a time
        if (!vid.src && vid.dataset.src) vid.src = vid.dataset.src;
        vid.currentTime = 0; vid.play?.().catch(() => {});
      });
      card.addEventListener("mouseleave", () => { try { vid.pause(); vid.currentTime = 0; } catch {} });
      if (stitchMode) {
        card.addEventListener("click", () => {
          const key = vKey(v);
          const idx = stitchOrder.indexOf(key);
          if (idx !== -1) stitchOrder.splice(idx, 1);
          else if (stitchOrder.length < STITCH_MAX) stitchOrder.push(key);
          else { ctx.showPopup?.(`${STITCH_MAX} / ${STITCH_MAX} · 더 긴 편집은 영상 편집기를 쓰세요`, true); return; }
          renderGrid();
        });
        if (picked) {
          card.appendChild(el("div", { text: String(pickIdx + 1), style: {
            position: "absolute", top: "5px", left: "5px", zIndex: "2",
            width: "20px", height: "20px", borderRadius: "50%", background: BRAND, color: "#fff",
            fontSize: "11px", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center",
          }}));
        }
      } else {
        card.addEventListener("dblclick", () => openPlayer(i));
      }

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
    if (stitchMode) refreshStitchBar();
    scheduleLazyUpdate();
  }

  async function refresh() {
    countTag.textContent = "loading…";
    try {
      const d = await listVideos(state.saveSubfolder || SUBFOLDER);
      videos = d.videos || [];
    } catch { videos = []; }
    renderGrid();
  }

  function hide() {
    closePlayer(); stopGridVideos(); ov.style.display = "none";
    if (lazyTimer) { clearTimeout(lazyTimer); lazyTimer = 0; }
    lazyVideos = [];
    clear(grid);   // drop every card's <video> so a closed gallery holds no decoder memory
    stitchMode = false; stitchOrder = [];
    stitchBtn.style.background = C.bg2; stitchBtn.style.borderColor = C.border;
    stitchBar.style.display = "none";
  }

  return {
    el: ov,
    playerEl: player,
    show() { ov.style.display = "flex"; refresh(); },
    hide,
    isOpen: () => ov.style.display !== "none",
    isPlaying: () => player.style.display !== "none",
    destroy() {
      document.removeEventListener("keydown", onKey, true);
      grid.removeEventListener("scroll", scheduleLazyUpdate);
      if (lazyTimer) clearTimeout(lazyTimer);
    },
  };
}

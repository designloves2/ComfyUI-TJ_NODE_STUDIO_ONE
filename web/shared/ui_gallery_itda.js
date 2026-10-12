// ui_gallery_itda.js — ITDA STUDIO's render gallery, ported from MiniMax H3's own
// video gallery card design (web/minimax/ui_gallery_minimax.js) rather than being its
// own simplified thing. User: "미니맥스 영상 갤러리 그대로 가져오는데 하단에 프롬포트
// 대신 사용 파일 정보로 대체 그리고 하단 4개 버튼은 미구현 나머지는 모두 동일하게.
// 스티치 마크도 동일 이게 만약에 미니맥스 갤러리 경로에 보내도 인식되도록~"
//
// What's ported 1:1 from H3's card: the square contain-fit thumbnail, the ⓘ hover info
// popup, the hover-preview <video>, the bottom-left post-process/stitch mark row style,
// the [WxH / MP  ratio] white-text line above the filename, the "★ stitched" mark's
// exact color/weight, and the 2x2 bottom button grid's layout/CSS.
//
// What's adapted: ITDA renders have no single "prompt" (a composited multi-clip
// timeline isn't built from one text prompt) — gallery.py's own meta.media_used (the
// media-pool filenames the render drew from) fills that slot instead, per the user's
// own instruction and gallery.py's comment ("프롬포트 부분에 사용한 미디어풀 파일명
// 리스트를 대신 기입"). The 2x2 button grid is present but every button is disabled/
// no-op ("4개 버튼은 미구현") — ITDA gallery items carry no render settings to "Reuse",
// no source clip to "Extend", and no single prompt to "View"/"Copy", so wiring any of
// them for real has no ITDA-side equivalent to wire to.
//
// What's adapted for the "stitch mark": ITDA has no generation-pipeline "stitched" flag
// the way an H3 multi-clip concat does, but a composited render built from MORE THAN ONE
// media-pool file is the direct ITDA equivalent of "this file is the result of combining
// several clips" — so meta.media_used.length > 1 drives the same "★ stitched" mark, same
// color, same place on the card.
import { el, clear } from "../klein/core_klein.js";
import { attachSensitiveToggle, mediaKey, isBlurred } from "./ui_sensitive_media.js";

const BRAND = "#7612DA";
const C = { bg1: "#111111", bg2: "#181818", border: "#2a2a2a", text: "#dedede", muted: "#565656" };
// Same non-BRAND amber H3 uses for its stitched mark and border, so "stitched" and
// "picked/selected" never read as the same color (H3's own reasoning, ui_gallery_minimax.js).
const STITCH_COLOR = "#e0a530";

const API = "/itda_studio_one";

function fmtWhen(ts) {
  try { return new Date(ts * 1000).toLocaleString(); } catch { return ""; }
}

export function createItdaGalleryOverlay(root, { getProject, onImported, showStatus } = {}) {
  const ov = el("div", { className: "itda-gallery-overlay", style: {
    position: "absolute", inset: "0", zIndex: "9998",
    background: "rgba(11,11,11,0.985)", borderRadius: "inherit",
    display: "none", flexDirection: "column", padding: "12px", gap: "8px", boxSizing: "border-box",
  }});

  const hdr = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" } });
  hdr.appendChild(el("div", { text: "🖼 Gallery", style: { color: "#fff", fontSize: "14px", fontWeight: "700" } }));
  const countTag = el("div", { style: { fontSize: "10.5px", color: C.muted, flex: "1" } });
  hdr.appendChild(countTag);
  const refreshBtn = el("button", { type: "button", text: "↻", title: "Refresh", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "12px", padding: "5px 11px",
    borderRadius: "6px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
  }});
  refreshBtn.addEventListener("click", () => refresh());
  const closeBtn = el("button", { type: "button", text: "✕ Close", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "10.5px", padding: "5px 11px",
    borderRadius: "6px", background: C.bg2, color: "#ff6767", border: `1px solid ${C.border}`,
  }});
  closeBtn.addEventListener("click", () => hide());
  hdr.append(refreshBtn, closeBtn);

  const grid = el("div", { style: {
    flex: "1", overflow: "auto", display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: "10px", alignContent: "start",
  }});

  ov.append(hdr, grid);

  // ── delete confirm — same viewport-centered pattern H3's gallery uses ──────────────
  const deleteConfirmOv = el("div", { style: {
    display: "none", position: "fixed", inset: "0", zIndex: "99999",
    background: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center",
  }});
  const deleteConfirmBox = el("div", { style: {
    background: C.bg1, border: `1px solid ${C.border}`, borderRadius: "10px",
    padding: "18px 20px", width: "320px", boxSizing: "border-box",
    display: "flex", flexDirection: "column", gap: "10px", boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
  }});
  deleteConfirmBox.append(
    el("div", { text: "Delete this render?", style: { color: "#fff", fontSize: "13px", fontWeight: "700" } }),
  );
  const deleteConfirmName = el("div", { style: { color: C.muted, fontSize: "11px", lineHeight: "1.5", wordBreak: "break-all" } });
  deleteConfirmBox.appendChild(deleteConfirmName);
  deleteConfirmBox.appendChild(el("div", { text: "This can't be undone.", style: { color: C.muted, fontSize: "11.5px" } }));
  const deleteBtnRow = el("div", { style: { display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "4px" } });
  const deleteCancelBtn = el("button", { type: "button", text: "Cancel", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "11.5px", padding: "6px 14px",
    borderRadius: "6px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
  }});
  const deleteConfirmBtn = el("button", { type: "button", text: "Delete", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "11.5px", padding: "6px 14px",
    borderRadius: "6px", background: C.bg2, color: "#ff6767", border: `1px solid ${C.border}`,
  }});
  let pendingDelete = null;
  function cancelDelete() { deleteConfirmOv.style.display = "none"; pendingDelete = null; }
  deleteCancelBtn.addEventListener("click", cancelDelete);
  async function runDelete() {
    if (!pendingDelete) return;
    deleteConfirmBtn.disabled = true;
    try {
      await fetch(`${API}/api/gallery/delete`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: pendingDelete.id }),
      });
      deleteConfirmOv.style.display = "none";
      pendingDelete = null;
      await refresh();
    } catch (e) { showStatus?.(`Delete failed: ${e.message || e}`); }
    finally { deleteConfirmBtn.disabled = false; }
  }
  deleteConfirmBtn.addEventListener("click", runDelete);
  deleteBtnRow.append(deleteCancelBtn, deleteConfirmBtn);
  deleteConfirmBox.appendChild(deleteBtnRow);
  deleteConfirmOv.appendChild(deleteConfirmBox);
  deleteConfirmOv.addEventListener("click", e => { if (e.target === deleteConfirmOv) cancelDelete(); });
  function askDelete(it) {
    pendingDelete = it;
    deleteConfirmName.textContent = it.filename;
    deleteConfirmOv.style.display = "flex";
  }

  // ── one shared hover-preview <video>, moved between cards, exactly like H3's ──────
  const hoverVideo = el("video", { muted: "", playsInline: "", preload: "metadata", style: {
    position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "contain",
    background: "#000", pointerEvents: "none",
  }});
  hoverVideo.muted = true;
  function stopGridVideos() {
    hoverVideo.pause();
    hoverVideo.removeAttribute("src");
    if (hoverVideo.parentNode) hoverVideo.parentNode.removeChild(hoverVideo);
  }

  // ── fullscreen player — double-click a card, same as H3's openPlayer ──────────────
  const fsVideo = el("video", { controls: "", style: {
    display: "none", position: "fixed", inset: "0", width: "100%", height: "100%",
    background: "#000", zIndex: "99999",
  }});
  document.body.appendChild(fsVideo);
  fsVideo.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) { fsVideo.pause(); fsVideo.style.display = "none"; fsVideo.removeAttribute("src"); }
  });
  async function openPlayer(it) {
    fsVideo.src = it.video_url;
    fsVideo.style.display = "block";
    try { await fsVideo.requestFullscreen?.(); } catch { /* needs a direct user gesture on some browsers */ }
    fsVideo.play().catch(() => {});
  }

  let items = [];

  function renderGrid() {
    stopGridVideos();
    clear(grid);
    countTag.textContent = `${items.length} render${items.length === 1 ? "" : "s"}`;
    if (!items.length) {
      grid.appendChild(el("div", {
        text: 'Nothing rendered yet — use "⏺ Render" to add the first one.',
        style: { color: C.muted, fontSize: "12px", gridColumn: "1 / -1", textAlign: "center", padding: "30px 0" } }));
      return;
    }
    items.forEach(it => {
      const m = it.meta || {};
      const isAudioOnly = it.mode === "audio_only" || it.has_video === false;
      const isStitched = Array.isArray(m.media_used) && m.media_used.length > 1;

      const card = el("div", { style: {
        position: "relative",
        background: C.bg1, border: `1px solid ${isStitched ? STITCH_COLOR : C.border}`,
        borderRadius: "8px", cursor: "pointer",
        display: "flex", flexDirection: "column",
      }});

      const thumbWrap = el("div", { style: { position: "relative", width: "100%" } });
      const thumbInner = isAudioOnly
        ? el("div", { style: {
            width: "100%", aspectRatio: "1 / 1", background: "#000", display: "flex",
            flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: "4px", color: "#8f7bff", fontSize: "26px", borderRadius: "7px 7px 0 0",
          }}, [
            el("span", { text: "🎵" }),
            el("span", { text: "Audio", style: { fontSize: "11px", color: "#aaa", fontWeight: "600" } }),
          ])
        : el("img", { loading: "lazy", src: it.thumb_url || "", style: {
            width: "100%", aspectRatio: "1 / 1", objectFit: "contain", background: "#000", display: "block",
            borderRadius: "7px 7px 0 0",
          }});
      thumbWrap.appendChild(thumbInner);

      const deleteBtn = el("button", { type: "button", text: "✕", title: "Delete this render", style: {
        position: "absolute", top: "4px", right: "4px", zIndex: "3",
        width: "18px", height: "18px", lineHeight: "16px", padding: "0",
        cursor: "pointer", fontSize: "11px", fontFamily: "inherit",
        background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", borderRadius: "4px",
      }});
      deleteBtn.addEventListener("click", e => { e.stopPropagation(); askDelete(it); });
      thumbWrap.appendChild(deleteBtn);

      // Explicit import button — NOT click-to-import. Regression fixed before this port
      // existed (user: "완료하고 나서 갤러리에서 확인을 하잖아 그럼 확인했던게
      // 미디어풀에 들어온다고"): a plain click/look must never silently add project
      // media. That fix carries over unchanged here.
      // User: "임폴트 미디어빈 버튼은 왼쪽 하단. i는 왼쪽 상단" — import at bottom-left, ⓘ at top-left.
      const importBtn = el("button", { type: "button", text: "⬇", title: "Import into Media Bin", style: {
        position: "absolute", bottom: "4px", left: "4px", zIndex: "3",
        width: "18px", height: "18px", lineHeight: "16px", padding: "0",
        cursor: "pointer", fontSize: "11px", fontFamily: "inherit",
        background: BRAND, color: "#fff", border: "none", borderRadius: "4px",
      }});
      const sensKey = mediaKey(it.filename, `itda_gallery/${it.project}`);
      importBtn.addEventListener("click", async e => {
        e.stopPropagation();
        if (isBlurred(sensKey)) { showStatus?.("Hidden — click 👁 to reveal it first."); return; }
        try {
          const project = getProject?.() || it.project;
          const r = await fetch(`${API}/api/gallery/import`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: it.id, project }),
          });
          const d = await r.json();
          if (!d.ok) throw new Error(d.error || "import failed");
          await onImported?.();
          showStatus?.("Imported into Media Bin: " + it.filename);
        } catch (e2) { showStatus?.("Import failed: " + (e2.message || e2)); }
      });
      thumbWrap.appendChild(importBtn);

      // ⓘ hover info — H3's per-card read-out, but built from what an ITDA render
      // actually carries (no steps/sampler/seed here) instead of buildInfoLines' full
      // generation-param set.
      const infoBtn = el("button", { type: "button", text: "ⓘ", style: {
        position: "absolute", top: "4px", left: "4px", zIndex: "3",
        width: "18px", height: "18px", lineHeight: "16px", padding: "0",
        cursor: "default", fontSize: "11px", fontFamily: "inherit",
        background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", borderRadius: "4px",
      }});
      infoBtn.addEventListener("click", e => e.stopPropagation());
      let infoPopup = null;
      infoBtn.addEventListener("mouseenter", () => {
        const lines = [];
        if (m.w && m.h) lines.push(`${m.w}×${m.h}`);
        if (m.fps) lines.push(`${m.frames || 0} frames @ ${Math.round(m.fps)}fps`);
        lines.push(`mode: ${it.mode || "video_audio"}`);
        lines.push(`project: ${it.project}`);
        infoPopup = el("div", { style: {
          position: "fixed", zIndex: "10001", background: "rgba(10,10,10,0.97)",
          border: `1px solid ${C.border}`, borderRadius: "6px", padding: "6px 8px",
          fontSize: "10px", color: C.text, lineHeight: "1.6",
          whiteSpace: "pre-wrap", wordBreak: "break-all",
          pointerEvents: "none", maxWidth: "220px", boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
        }});
        infoPopup.textContent = lines.join("\n");
        // root, not document.body — the app-wide "everything 12px except the timeline"
        // rule (one_node_itda_studio.js's injectScopedStyles) is scoped to descendants of
        // .itda-studio-root; anything appended to document.body sits outside that and kept
        // H3's own original mixed sizes (9-14px) instead of matching the rest of ITDA
        // STUDIO's UI. User: "폰트 사이즈? 이거 뭐지?"
        root.appendChild(infoPopup);
        const r = infoBtn.getBoundingClientRect();
        infoPopup.style.left = `${r.right - 226}px`;
        infoPopup.style.bottom = `${window.innerHeight - r.top + 6}px`;
      });
      infoBtn.addEventListener("mouseleave", () => { infoPopup?.remove(); infoPopup = null; });
      thumbWrap.appendChild(infoBtn);

      // 눈가리기 — same shared hide/reveal every ONE STUDIO gallery uses.
      attachSensitiveToggle(thumbWrap, thumbInner.tagName === "IMG" ? thumbInner : thumbWrap, sensKey, "br", () => {
        if (hoverVideo.parentNode === thumbWrap) hoverVideo.style.filter = isBlurred(sensKey) ? "blur(14px)" : "";
      });

      if (!isAudioOnly) {
        thumbWrap.addEventListener("mouseenter", () => {
          stopGridVideos();
          hoverVideo.src = it.video_url;
          hoverVideo.style.filter = isBlurred(sensKey) ? "blur(14px)" : "";
          thumbWrap.appendChild(hoverVideo);
          hoverVideo.currentTime = 0; hoverVideo.play?.().catch(() => {});
        });
        thumbWrap.addEventListener("mouseleave", stopGridVideos);
      }
      card.addEventListener("dblclick", () => {
        if (isBlurred(sensKey)) { showStatus?.("Hidden — click 👁 to reveal it first."); return; }
        openPlayer(it);
      });

      const meta = el("div", { style: { padding: "5px 7px", display: "flex", flexDirection: "column", gap: "1px" } });
      if (m.w && m.h) {
        const mp = ((m.w * m.h) / 1_000_000).toFixed(1);
        meta.appendChild(el("div", {
          text: `[${m.w}x${m.h}px / ${mp}MP]`,
          style: { fontSize: "9px", color: "#fff", fontWeight: "600" },
        }));
      }
      meta.append(
        el("div", { text: it.filename, title: it.filename, style: {
          fontSize: "10px", color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }),
        el("div", { text: `${Math.round(it.duration_sec || 0)}s · ${it.project} · ${fmtWhen(it.created_at)}`,
          style: { fontSize: "9px", color: C.muted } }),
      );
      if (isStitched) {
        meta.appendChild(el("div", { text: "★ stitched", style: { fontSize: "9px", color: STITCH_COLOR, fontWeight: "700" } }));
      }

      // Bottom info area — "사용 파일 정보" (files used) replaces H3's prompt text,
      // same card slot, same 3-line clamp/ellipsis styling.
      const mediaUsed = Array.isArray(m.media_used) ? m.media_used : [];
      if (mediaUsed.length) {
        const filesText = mediaUsed.join(", ");
        const p = el("div", { text: filesText, style: {
          fontSize: "9px", color: C.muted, lineHeight: "1.35", marginTop: "2px",
          display: "-webkit-box", WebkitLineClamp: "3", WebkitBoxOrient: "vertical",
          overflow: "hidden", cursor: "text",
        }});
        p.title = filesText;
        meta.appendChild(p);

        // H3's 2x2 Reuse/Extend/View/Copy row is left out entirely, not shown disabled —
        // user: "하단에 버튼 비활성화 아니고 잇다 갤러리에서는 안보여야지." None of the
        // four have an ITDA-side equivalent (no single render setting to Reuse, no source
        // clip to Extend, no single prompt to View/Copy — media_used already covers that
        // slot above), so there's nothing worth taking up card space for.
      }

      card.append(thumbWrap, meta);
      grid.appendChild(card);
    });
  }

  async function refresh() {
    countTag.textContent = "loading…";
    try {
      const r = await fetch(`${API}/api/gallery/list`);
      const d = await r.json();
      items = d.ok ? (d.items || []) : [];
    } catch { items = []; }
    renderGrid();
  }

  function show() { ov.style.display = "flex"; refresh(); }
  function hide() { ov.style.display = "none"; stopGridVideos(); }

  root.appendChild(ov);
  root.appendChild(deleteConfirmOv); // same reason as infoPopup above — stay inside .itda-studio-root for the 12px rule to reach it

  return { el: ov, show, hide, refresh };
}

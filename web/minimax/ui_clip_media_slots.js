// ui_clip_media_slots.js — compact per-clip reference video / audio slots.
//
// The left panel's media rows are a full form each: dropdown, upload button, in/out
// spinners, source facts, soundtrack checkbox. That is fine in a 320px column with one
// list, but Prompt Edit shows a clip's own video *and* audio beside nine image tiles, and
// three of those forms each turned the block into the tallest thing on the panel.
//
// So these are built like the image tiles instead: a small square you click to fill, with
// the controls stacked underneath one per line at the smallest readable size.
import { C, BRAND, el, clear } from "./core_minimax.js";
import { uploadMedia, getMediaInfo } from "./api_minimax.js";

const TILE = 54;                    // tile height, matching the image slots
// Both media tiles are landscape rather than square: a video frame is 16:9, so a square
// crop threw away the sides of every thumbnail, and audio needs the extra width to show
// a filename instead of breaking it every few characters.
const MEDIA_TILE_W = 72;
const TINY = "9.5px";               // the "source 59.40s · 30fps" size the user asked for

// The range thumb can only be sized from a stylesheet, not from an inline style.
const SLIDER_CSS_ID = "tj-clip-media-slider";
function ensureSliderCss() {
  if (document.getElementById(SLIDER_CSS_ID)) return;
  const st = document.createElement("style");
  st.id = SLIDER_CSS_ID;
  st.textContent = `
    .tj-clip-scrub { -webkit-appearance: none; appearance: none; background: transparent; }
    .tj-clip-scrub::-webkit-slider-runnable-track { height: 3px; background: ${C.border}; border-radius: 2px; }
    .tj-clip-scrub::-webkit-slider-thumb {
      -webkit-appearance: none; appearance: none;
      width: 6px; height: 6px; border-radius: 50%;
      background: ${BRAND}; border: none; margin-top: -1.5px;
    }
    .tj-clip-scrub::-moz-range-track { height: 3px; background: ${C.border}; border-radius: 2px; }
    .tj-clip-scrub::-moz-range-thumb {
      width: 6px; height: 6px; border-radius: 50%; background: ${BRAND}; border: none;
    }`;
  document.head.appendChild(st);
}

const viewUrl = (f) => `/view?filename=${encodeURIComponent(f)}&type=input`;

/** m:ss, the form both the player and the length readout use. */
function clock(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** A one-line labelled number field, as small as it can be and still be clickable. */
function tinyNum(labelText, value, onChange, clamp) {
  const inp = el("input", { type: "number", step: "0.5", style: {
    width: "44px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
    borderRadius: "4px", padding: "1px 3px", fontSize: TINY, fontFamily: "inherit",
    outline: "none",
  }});
  inp.value = String(value ?? 0);
  inp.addEventListener("change", () => {
    // Correcting the stored number but leaving the box showing the rejected one reads as
    // the edit having been accepted, so the field is written back too.
    const v = (clamp || (x => Math.max(0, x)))(Number(inp.value) || 0);
    inp.value = String(v);
    onChange(v);
  });
  const row = el("div", { style: {
    display: "flex", alignItems: "center", justifyContent: "center", gap: "4px",
    fontSize: TINY, color: C.muted } },
    [el("span", { text: labelText }), inp]);
  row._input = inp;
  return row;
}

/**
 * One slot. `kind` is "video" or "audio".
 *
 * Video shows a frame of the file and previews muted on hover, the way the gallery does —
 * a still frame alone does not tell you which take you grabbed. Audio has no frame to
 * show, so the tile carries the filename instead, wrapped, with the full name on hover.
 */
function slot(kind, list, idx, ctx, onRefresh, onPickFromGallery, missing) {
  const isVideo = kind === "video";
  const entry = list[idx] || {};
  const isGone = !!entry.file && (missing || []).includes(entry.file);
  const tileW = MEDIA_TILE_W;
  // Everything under the tile is centred on it, so a column reads as one object rather
  // than a tile with a ragged list hanging off its left edge.
  const wrap = el("div", { style: {
    display: "flex", flexDirection: "column", gap: "2px", width: `${tileW}px`,
    flexShrink: "0", alignItems: "center",
  }});

  // ── the tile ───────────────────────────────────────────────────────────────
  const tile = el("div", { style: {
    width: `${tileW}px`, height: `${TILE}px`, borderRadius: "6px",
    border: `1px solid ${C.border}`, background: "#000", position: "relative",
    overflow: "hidden", cursor: "pointer", display: "flex",
    alignItems: "center", justifyContent: "center", flexShrink: "0",
  }});

  let media = null;
  if (isGone) {
    // The file this slot was saved with is no longer in input/. Say which one, rather than
    // showing an empty tile that looks like nothing was ever attached.
    tile.style.border = `1px dashed ${C.warn}`;
    tile.style.background = "#1a1206";
    tile.appendChild(el("div", { title: `Missing from the input folder:
${entry.file}`, style: {
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: "1px", width: "100%", height: "100%", padding: "2px", boxSizing: "border-box",
    }}, [
      el("div", { text: "⚠", style: { fontSize: "13px", color: C.warn, lineHeight: "1" } }),
      el("div", { text: entry.file, style: {
        fontSize: "6.5px", color: C.warn, lineHeight: "1.1", textAlign: "center",
        overflow: "hidden", wordBreak: "break-all", maxHeight: "22px" } }),
    ]));
    const gx = el("button", { type: "button", text: "✕", title: "Remove this missing entry", style: {
      position: "absolute", top: "0", right: "0", cursor: "pointer", fontSize: "10px",
      background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", padding: "1px 4px", zIndex: "3",
    }});
    gx.addEventListener("click", (e) => { e.stopPropagation(); list.splice(idx, 1); ctx.persist(); onRefresh(); });
    tile.appendChild(gx);
  } else if (entry.file) {
    if (isVideo) {
      media = el("video", { src: viewUrl(entry.file), muted: "", playsInline: "", preload: "metadata",
        style: { width: "100%", height: "100%", objectFit: "cover" } });
      media.muted = true;
      // Hover-scrub, same affordance as the gallery: it costs nothing until pointed at.
      tile.addEventListener("mouseenter", () => {
        media.currentTime = Math.max(0, Number(entry.start) || 0);
        media.play().catch(() => {});
      });
      tile.addEventListener("mouseleave", () => {
        media.pause();
        media.currentTime = Math.max(0, Number(entry.start) || 0);
      });
      tile.appendChild(media);
    } else {
      media = el("audio", { src: viewUrl(entry.file), preload: "metadata" });
      wrap.appendChild(media);
      tile.appendChild(el("div", { text: entry.file, title: entry.file, style: {
        fontSize: "8px", lineHeight: "1.25", color: C.text, padding: "3px",
        overflow: "hidden", wordBreak: "break-all", textAlign: "center",
      }}));
    }
    tile.appendChild(el("div", { text: String(idx + 1), style: {
      position: "absolute", top: "1px", left: "3px", fontSize: "9px", fontWeight: "700",
      color: "#fff", textShadow: "0 0 3px #000", pointerEvents: "none" } }));
    const x = el("button", { type: "button", text: "✕", title: "Remove", style: {
      position: "absolute", top: "0", right: "0", cursor: "pointer", fontSize: "10px",
      background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", padding: "1px 4px", zIndex: "3",
    }});
    x.addEventListener("click", (e) => { e.stopPropagation(); list.splice(idx, 1); ctx.persist(); onRefresh(); });
    tile.appendChild(x);

    // Drag to reorder — dropping onto another filled tile swaps this entry into its slot.
    tile.draggable = true;
    tile.addEventListener("dragstart", (e) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(idx));
      tile.style.opacity = "0.4";
    });
    tile.addEventListener("dragend", () => { tile.style.opacity = "1"; });
    tile.addEventListener("dragover", (e) => {
      e.preventDefault(); e.dataTransfer.dropEffect = "move";
      tile.style.outline = `2px solid ${BRAND}`;
    });
    tile.addEventListener("dragleave", () => { tile.style.outline = "none"; });
    tile.addEventListener("drop", (e) => {
      e.preventDefault();
      tile.style.outline = "none";
      const from = Number(e.dataTransfer.getData("text/plain"));
      if (Number.isNaN(from) || from === idx || !list[from]) return;
      const [moved] = list.splice(from, 1);
      list.splice(idx, 0, moved);
      ctx.persist(); onRefresh();
    });
  } else {
    tile.appendChild(el("div", { text: isVideo ? "+vid" : "+aud", style: {
      color: C.muted, fontSize: "10px", pointerEvents: "none" } }));
  }

  // Writing past the end of the array would leave holes that persist as nulls, so an
  // empty tile appends instead of assigning at its own index.
  const setFile = (name) => {
    const base = { file: name, start: 0, end: 0, ...(isVideo ? { withAudio: true } : {}) };
    if (idx < list.length) list[idx] = { ...(list[idx] || {}), ...base };
    else list.push(base);
  };

  // Click to upload; the gallery button only exists for video, which is what the MiniMax
  // gallery holds — there is no audio gallery to pick from.
  const fileInp = el("input", { type: "file", accept: isVideo ? "video/*" : "audio/*",
    style: { display: "none" } });
  fileInp.addEventListener("change", async () => {
    const f = fileInp.files[0]; fileInp.value = "";
    if (!f) return;
    try {
      const name = await uploadMedia(f);
      setFile(name);
      ctx.persist(); onRefresh();
    } catch (e) { ctx.showPopup?.(e.message, true); }
  });
  tile.addEventListener("click", () => fileInp.click());
  wrap.append(tile, fileInp);

  if (isVideo && onPickFromGallery) {
    const gal = el("button", { type: "button", text: "🖼", title: "Pick from the gallery", style: {
      position: "absolute", bottom: "1px", left: "1px", zIndex: "3",
      background: "rgba(0,0,0,0.7)", color: "#fff", border: "none", borderRadius: "3px",
      width: "16px", height: "16px", cursor: "pointer", fontSize: "9px", padding: "0",
    }});
    gal.addEventListener("click", (e) => {
      e.stopPropagation();
      onPickFromGallery((name) => { setFile(name); ctx.persist(); onRefresh(); });
    });
    tile.appendChild(gal);
  }

  // Clicking a ghost re-opens the file picker, which is the repair the warning asks for.
  if (isGone || !entry.file) return wrap;   // nothing to transport or trim

  // ── transport: play/stop toggle + restart ──────────────────────────────────
  const btnCss = {
    cursor: "pointer", fontFamily: "inherit", fontSize: TINY, lineHeight: "1",
    padding: "2px 4px", borderRadius: "4px", background: C.bg2, color: C.text,
    border: `1px solid ${C.border}`,
  };
  const playBtn = el("button", { type: "button", text: "▶", title: "Play / stop", style: btnCss });
  const restartBtn = el("button", { type: "button", text: "⏮", title: "Play from the start", style: btnCss });
  const timeTag = el("div", { text: "0:00", style: { fontSize: TINY, color: C.muted } });

  // in/out are not just numbers sent to the render — they are what this tile plays. The
  // point of setting them is hearing or seeing the window you picked, so the transport,
  // the clock and the scrub bar all work inside [in, out] and follow an edit immediately.
  const winStart = () => Math.max(0, Number(entry.start) || 0);
  const winEnd = () => {
    const e = Number(entry.end) || 0;
    const dur = Number.isFinite(media.duration) ? media.duration : Infinity;
    return e > winStart() ? Math.min(e, dur) : dur;
  };
  const winLen = () => Math.max(0, winEnd() - winStart());

  const stop = () => { media.pause(); playBtn.textContent = "▶"; };
  const playFromStart = () => {
    media.currentTime = winStart();
    media.play().catch(() => {});
    playBtn.textContent = "■";
  };
  playBtn.addEventListener("click", () => {
    if (!media.paused) { stop(); return; }
    // Outside the window (or sitting on its end) means "start this window again".
    if (media.currentTime < winStart() || media.currentTime >= winEnd() - 0.02) playFromStart();
    else { media.play().catch(() => {}); playBtn.textContent = "■"; }
  });
  restartBtn.addEventListener("click", playFromStart);
  media.addEventListener("ended", stop);
  media.addEventListener("pause", () => { playBtn.textContent = "▶"; });

  // Two lines: the buttons, then the clock under them. Side by side, the clock's width
  // changes as it counts and shoved the buttons around.
  wrap.appendChild(el("div", { style: {
    display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" } },
    [playBtn, restartBtn]));
  timeTag.style.textAlign = "center";
  timeTag.style.width = "100%";
  wrap.appendChild(timeTag);

  // Audio gets a scrub bar; a video already shows its position in the tile itself.
  let bar = null;
  if (!isVideo) {
    ensureSliderCss();
    bar = el("input", { type: "range", min: "0", max: "100", value: "0",
      class: "tj-clip-scrub", style: {
      width: `${tileW}px`, height: "6px", cursor: "pointer", margin: "0",
    }});
    bar.addEventListener("input", () => {
      if (winLen() > 0) media.currentTime = winStart() + (Number(bar.value) / 100) * winLen();
    });
    wrap.appendChild(bar);
  }
  function paintTime() {
    const pos = Math.min(Math.max(media.currentTime - winStart(), 0), winLen());
    timeTag.textContent = `${clock(pos)} / ${clock(winLen())}`;
    if (bar && winLen() > 0) bar.value = String((pos / winLen()) * 100);
  }
  media.addEventListener("timeupdate", () => {
    if (media.currentTime >= winEnd() - 0.02 && !media.paused) { stop(); media.currentTime = winEnd(); }
    paintTime();
  });
  media.addEventListener("loadedmetadata", paintTime);

  // ── trim window ────────────────────────────────────────────────────────────
  const onWindowEdit = () => {
    if (media.currentTime < winStart() || media.currentTime > winEnd()) media.currentTime = winStart();
    paintTime();
    ctx.persist();
  };
  // A trim window cannot run past the end of the file — asking for frames that are not
  // there fails the render, and the number gives no hint that it was the problem.
  const srcLen = () => (Number.isFinite(media.duration) && media.duration > 0)
    ? media.duration
    : (Number(entry._srcLen) || Infinity);
  const inRow = tinyNum("in", entry.start ?? 0,
    v => { entry.start = v; onWindowEdit(); },
    v => {
      const cap = srcLen();
      // "in" has to leave room for at least a moment of clip after it.
      const top = Number.isFinite(cap) ? Math.max(0, cap - 0.1) : Infinity;
      return Math.min(Math.max(0, v), top);
    });
  const outRow = tinyNum("out", entry.end ?? 0,
    v => { entry.end = v; onWindowEdit(); },
    v => Math.min(Math.max(0, v), srcLen()));
  wrap.append(inRow, outRow);

  // Source facts, at the same size — a silent video cannot lend its soundtrack, and that
  // is worth saying here rather than failing the prompt later.
  const info = el("div", { style: {
    fontSize: TINY, color: C.muted, lineHeight: "1.3", textAlign: "center", width: "100%" } });
  wrap.appendChild(info);
  getMediaInfo(entry.file).then(d => {
    if (!d.ok) return;
    const bits = [`${(d.duration || 0).toFixed(2)}s`];
    if (isVideo && d.fps) bits.push(`${d.fps}fps→24`);
    if (isVideo) bits.push(d.has_audio ? "has audio" : "silent");
    // One fact per line: dot-separated, this wrapped at arbitrary points in a 72px column.
    clear(info);
    bits.forEach(b => info.appendChild(el("div", { text: b })));
    // A freshly added file should read "the whole thing" — in 0, out the full length —
    // rather than an arbitrary window the user has to notice and correct. Only fills a
    // slot that has never been set, so an edited trim is never overwritten.
    if (d.duration > 0) {
      entry._srcLen = +d.duration.toFixed(2);
      // A max on the input stops the spinner arrows walking past the end as well.
      outRow._input.max = String(entry._srcLen);
      inRow._input.max = String(entry._srcLen);
      if (!(Number(entry.end) > 0)) {
        entry.end = entry._srcLen;
        outRow._input.value = String(entry.end);
      } else if (Number(entry.end) > entry._srcLen) {
        // A window saved against a different file, or typed before the length was known.
        entry.end = entry._srcLen;
        outRow._input.value = String(entry.end);
      }
      ctx.persist();
    }
    paintTime();
    if (isVideo && !d.has_audio && entry.withAudio !== false) { entry.withAudio = false; ctx.persist(); }
  });

  return wrap;
}

/**
 * The three slots for one clip's own media list, as a row.
 *
 * Always three columns wide whether or not they are filled, so the block beside it does
 * not shift every time a file is added or cleared.
 */
export function buildClipMediaSlots(kind, list, ctx, onRefresh, onPickFromGallery, missing) {
  const rowEl = el("div", { style: { display: "flex", gap: "24px", flexWrap: "nowrap" } });
  for (let i = 0; i < 3; i++) {
    rowEl.appendChild(slot(kind, list, i, ctx, onRefresh, onPickFromGallery, missing));
  }
  return rowEl;
}

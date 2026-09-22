// one_node_itda_studio.js — ITDA STUDIO (TJ)
//
// A 3-lane video/audio stitch timeline, absorbed from the standalone ComfyUI-ITDA node
// (Korean "잇다" = "to stitch/connect" — the project's own name, kept on purpose) and
// rebuilt as an in-graph DOM widget like every other ONE STUDIO tool, instead of ITDA's
// window.open() popup editor. Same project JSON shape (media[]/clips[]/lanes[]) and the
// same frame-accurate trim/snap math and real ffmpeg peak-waveform cache the original
// had — narrowed to 3 lanes / video+audio only (user's explicit scope cut: no image, no
// text, no 5th lane) and importing from THIS app's own galleries (H3 video, MusicMaker
// playlist) + local upload, instead of ITDA's local-input-folder-only media bin.
//
// v1 scope: import (gallery + upload) -> place on timeline -> move/trim/snap -> per-lane
// lock/visibility -> waveform -> scrub/preview playback -> save/load project by name.
// NOT yet ported: real ffmpeg Export (stubbed — see exportProject()), beat detection,
// multi-select group drag, the crossfade stitch-bridge tool, compare/overlay preview
// modes. Flagged here rather than silently left out.
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import {
  C, BRAND, NODE_W, NODE_H, LEFT_W, PAD, API, LS_KEY,
  LANE_COUNT, DEFAULT_LANE_H, LEFT_PAD, SNAP_STEP, DEFAULT_FPS, DEFAULT_TOTAL_FRAMES,
  el, clear, loadState, saveState, defaultState, defaultProject, fmtTime,
} from "./itda_studio/core_itda_studio.js";
import { openVideoGalleryPicker } from "./minimax/ui_video_picker_minimax.js";
import { openAudioGalleryPicker } from "./shared/ui_audio_gallery_picker.js";

const jget  = (p)    => api.fetchApi(p).then(r => r.json());
const jpost = (p, b) => api.fetchApi(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then(r => r.json());

// ComfyUI's own file-agnostic upload route (see one_node_music.js's uploadCoverAudio —
// same trick, "image" field name is just what the endpoint expects, any file works).
async function uploadLocalFile(file) {
  const fd = new FormData();
  fd.append("image", file);
  fd.append("subfolder", "");
  fd.append("type", "input");
  const r = await api.fetchApi("/upload/image", { method: "POST", body: fd });
  if (!r.ok) throw new Error(`upload failed (${r.status})`);
  const d = await r.json();
  return d.name;
}

function fileUrl(name) { return `/view?filename=${encodeURIComponent(name)}&type=input`; }

app.registerExtension({
  name: "TJ.ItdaStudioONE",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "ItdaStudioOneTJNode") return;

    nodeType.prototype.onNodeCreated = function () {
      this.color = BRAND; this.bgcolor = C.bg0; this.title_color = "#fff";
      this.resizable = false; this.size = [NODE_W, NODE_H];
      this._buildUI();
    };
    nodeType.prototype.onResize = function () { this.size = [NODE_W, NODE_H]; };
    nodeType.prototype.getSlotMenuOptions = function () { return []; };
    const _origRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      try { this._itdaStop?.(); } catch {}
      return _origRemoved?.apply(this, arguments);
    };

    nodeType.prototype._buildUI = function () {
      const self = this;
      const ui = defaultState(loadState());
      const persistUi = () => saveState(ui);
      let project = defaultProject(ui.projectName);
      let media = []; // client-side mirror of project.media, plus in-flight local items

      if (!document.getElementById("itda-styles")) {
        const s = document.createElement("style"); s.id = "itda-styles";
        s.textContent = `
          .itda-media-item{display:flex;align-items:center;gap:8px;padding:6px;border-radius:8px;cursor:grab;border:1px solid ${C.border}}
          .itda-media-item:hover{background:${C.bg2}}
          .itda-media-thumb{width:${ui.mediaThumb}px;height:${Math.round(ui.mediaThumb * 0.56)}px;flex-shrink:0;border-radius:5px;background:#000;overflow:hidden;display:flex;align-items:center;justify-content:center;color:${C.muted};font-size:16px}
          .itda-media-thumb video,.itda-media-thumb img{width:100%;height:100%;object-fit:cover}
          .itda-lane{position:relative;border-bottom:1px solid ${C.border};background:${C.bg1}}
          .itda-lane.locked{background:${C.dim}}
          .itda-lane.hidden-lane{opacity:.45}
          .itda-clip{position:absolute;top:3px;bottom:3px;border-radius:6px;overflow:hidden;cursor:grab;
            border:1px solid ${C.border};display:flex;flex-direction:column;justify-content:flex-end}
          .itda-clip.video{background:linear-gradient(180deg,#3a2a5c,#241a3c)}
          .itda-clip.audio{background:linear-gradient(180deg,#1a4a3c,#123028)}
          .itda-clip.selected{outline:2px solid ${BRAND}}
          .itda-clip .itda-clip-title{font-size:10px;color:#fff;padding:2px 5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:rgba(0,0,0,.4)}
          .itda-clip-handle{position:absolute;top:0;bottom:0;width:7px;cursor:ew-resize;z-index:2}
          .itda-clip-handle.left{left:0} .itda-clip-handle.right{right:0}
          .itda-lane-label{position:absolute;left:0;top:0;bottom:0;width:${LEFT_PAD}px;display:flex;align-items:center;gap:6px;padding:0 8px;
            background:${C.bg0};border-right:1px solid ${C.border};z-index:3;font-size:11px;color:${C.muted}}
          .itda-btn{cursor:pointer;font-family:inherit;font-size:11px;padding:5px 9px;border-radius:6px;background:${C.bg2};color:${C.text};border:1px solid ${C.border}}
          .itda-btn:hover{border-color:${BRAND}}
        `;
        document.head.appendChild(s);
      }

      const root = el("div", { style: {
        width: `${NODE_W}px`, height: `${NODE_H}px`, display: "flex", flexDirection: "column",
        background: C.bg0, color: C.text, fontFamily: "inherit", overflow: "hidden",
      }});

      // ── top bar: project name + save/load + status ──
      const statusEl = el("div", { text: "", style: { fontSize: "11px", color: C.muted, marginLeft: "auto" } });
      const projectNameIn = el("input", { type: "text", value: ui.projectName, style: {
        background: C.bg1, border: `1px solid ${C.border}`, borderRadius: "6px", color: C.text,
        fontFamily: "inherit", fontSize: "12px", padding: "5px 8px", width: "180px",
      }});
      const saveBtn = el("button", { className: "itda-btn", text: "💾 Save Project" });
      const exportBtn = el("button", { className: "itda-btn", text: "⇩ Export (coming soon)" });
      exportBtn.title = "Real ffmpeg export — not ported yet, coming in the next pass.";
      exportBtn.disabled = true; exportBtn.style.opacity = "0.5"; exportBtn.style.cursor = "default";
      const topBar = el("div", { style: {
        display: "flex", alignItems: "center", gap: "8px", padding: `${PAD}px`,
        borderBottom: `1px solid ${C.border}`, flexShrink: "0",
      }}, [
        el("div", { text: "🧵 ITDA STUDIO", style: { fontWeight: "700", fontSize: "13px", color: BRAND } }),
        projectNameIn, saveBtn, exportBtn, statusEl,
      ]);

      // ── body: left media bin + right timeline/preview ──
      const body = el("div", { style: { flex: "1", display: "flex", minHeight: "0" } });

      // -- media bin --
      const mediaList = el("div", { style: { flex: "1", overflowY: "auto", display: "flex", flexDirection: "column", gap: "4px", padding: "8px" } });
      const addVideoBtn = el("button", { className: "itda-btn", text: "🎞 Video from Gallery" });
      const addAudioBtn = el("button", { className: "itda-btn", text: "🎵 Audio from Gallery" });
      const uploadInput = el("input", { type: "file", accept: "video/*,audio/*", multiple: "", style: { display: "none" } });
      const uploadBtn = el("button", { className: "itda-btn", text: "⬆ Upload" });
      uploadBtn.addEventListener("click", () => uploadInput.click());
      const mediaBin = el("div", { style: {
        width: `${LEFT_W}px`, flexShrink: "0", display: "flex", flexDirection: "column",
        borderRight: `1px solid ${C.border}`, minHeight: "0",
      }}, [
        el("div", { style: { display: "flex", gap: "6px", padding: "8px", flexWrap: "wrap", borderBottom: `1px solid ${C.border}` } },
          [addVideoBtn, addAudioBtn, uploadBtn, uploadInput]),
        mediaList,
      ]);

      // -- preview --
      const previewVid = el("video", { muted: "", playsinline: "", style: { width: "100%", height: "100%", objectFit: "contain", background: "#000", display: "none" } });
      const previewAudio = el("audio", { style: { display: "none" } });
      const previewPlaceholder = el("div", { text: "타임라인에 클립을 올려주세요", style: {
        color: C.muted, fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%",
      }});
      const previewStage = el("div", { style: { flex: "1", background: "#000", position: "relative", minHeight: "0", display: "flex" } }, [previewVid, previewAudio, previewPlaceholder]);

      // -- transport --
      const playBtn = el("button", { className: "itda-btn", text: "▶" });
      const timeLabel = el("div", { text: "00:00.000", style: { fontSize: "11px", color: C.muted, fontVariantNumeric: "tabular-nums" } });
      const snapChk = el("input", { type: "checkbox" }); snapChk.checked = ui.snap;
      const transport = el("div", { style: { display: "flex", alignItems: "center", gap: "10px", padding: "6px 10px", borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` } },
        [playBtn, timeLabel, el("label", { style: { fontSize: "11px", color: C.muted, marginLeft: "auto", display: "flex", alignItems: "center", gap: "4px" } }, [snapChk, el("span", { text: "Snap" })])]);

      // -- timeline --
      const ruler = el("div", { style: { position: "relative", height: "22px", background: C.bg1 } });
      const lanesWrap = el("div", { style: { position: "relative" } });
      const playhead = el("div", { style: { position: "absolute", top: "0", bottom: "0", width: "1px", background: BRAND, zIndex: "5", pointerEvents: "none" } });
      const timelineInner = el("div", { style: { position: "relative", minWidth: "100%" } }, [ruler, lanesWrap, playhead]);
      const timeline = el("div", { style: { flex: "1", overflow: "auto", position: "relative", minHeight: "0" } }, [timelineInner]);

      const rightCol = el("div", { style: { flex: "1", display: "flex", flexDirection: "column", minWidth: "0" } },
        [previewStage, transport, timeline]);

      body.append(mediaBin, rightCol);
      root.append(topBar, body);
      self.addDOMWidget("itda_ui", "div", root, { serialize: false, computeSize: () => [NODE_W, NODE_H] });

      // ══════════════════════════ state / frame math (ported from ITDA app.js) ══════════════════════════
      let pxPerFrame = ui.pxPerFrame;
      let currentFrame = 0, playing = false, playRAF = null;
      let selectedClipId = null;
      let drag = null;

      const fps = () => Number(project.settings?.fps || DEFAULT_FPS) || DEFAULT_FPS;
      const totalFrames = () => Math.max(1, Number(project.settings?.total_frames || DEFAULT_TOTAL_FRAMES));
      const maxFrame = () => Math.max(totalFrames(), ...(project.clips || []).map(c => c.start + c.length), Math.round(fps() * 10));
      const findClip = (id) => (project.clips || []).find(c => c.id === id);
      const mediaFor = (clip) => clip ? media.find(m => m.id === clip.media_id) : null;
      const laneH = () => ui.laneHeight;
      const snapFrame = (f) => ui.snap ? Math.round(f / SNAP_STEP) * SNAP_STEP : Math.round(f);
      const trimFrame = (f) => Math.round(f);
      const clipEnd = (c) => c.start + c.length;
      function sourceTotalFrames(c) {
        const m = mediaFor(c);
        return Math.max(1, Math.round(Number(m?.total_frames || c.source_total_frames || c.length || 1)));
      }
      function maxClipLength(c, srcIn = null) {
        const total = sourceTotalFrames(c);
        const input = srcIn == null ? Number(c.source_in || 0) : Number(srcIn || 0);
        return Math.max(1, total - Math.max(0, Math.min(total - 1, input)));
      }
      function normalizeClipBounds(c) {
        const total = sourceTotalFrames(c);
        c.source_total_frames = total;
        c.source_in = Math.max(0, Math.min(total - 1, Math.round(Number(c.source_in || 0))));
        c.length = Math.max(1, Math.min(Math.round(Number(c.length || 1)), total - c.source_in));
        c.source_out = Math.max(c.source_in + 1, Math.min(total, c.source_in + c.length));
        return c;
      }
      function wouldOverlap(id, lane, start, length) {
        const end = start + length;
        return (project.clips || []).some(o => o.id !== id && o.lane === lane && start < clipEnd(o) && end > o.start);
      }
      function clampLane(l) { return Math.max(0, Math.min(LANE_COUNT - 1, l)); }
      function fitSingleMove(c, proposedStart, proposedLane) {
        let ns = Math.max(0, proposedStart), lane = clampLane(proposedLane);
        if (!wouldOverlap(c.id, lane, ns, c.length)) return { start: ns, lane };
        const others = (project.clips || []).filter(o => o.id !== c.id && o.lane === lane).sort((a, b) => a.start - b.start);
        for (const o of others) { if (ns < clipEnd(o) && ns + c.length > o.start) ns = clipEnd(o); }
        ns = Math.max(0, ns);
        return wouldOverlap(c.id, lane, ns, c.length) ? { start: c.start, lane: c.lane } : { start: ns, lane };
      }
      function snapMoveStart(rawStart, length, excludeId) {
        if (!ui.snap) return Math.round(rawStart);
        const threshold = Math.max(4, 14 / pxPerFrame);
        let best = null, bestD = Infinity;
        for (const o of (project.clips || [])) {
          if (o.id === excludeId) continue;
          for (const cand of [o.start, clipEnd(o), o.start - length, clipEnd(o) - length]) {
            const d = Math.abs(cand - rawStart);
            if (d <= threshold && d < bestD) { best = cand; bestD = d; }
          }
        }
        return best != null ? Math.max(0, Math.round(best)) : Math.max(0, Math.round(rawStart));
      }

      // ══════════════════════════ media bin ══════════════════════════
      function addMediaItem(item) {
        media.push(item);
        renderMedia();
      }
      async function probeVideo(name) {
        try {
          const d = await jget(`/minimax_h3_one/media_info?file=${encodeURIComponent(name)}`);
          return { fps: d.fps || fps(), total_frames: d.frames || Math.round((d.duration || 5) * fps()), duration: d.duration || 5, width: d.width, height: d.height };
        } catch { return { fps: fps(), total_frames: Math.round(fps() * 5), duration: 5 }; }
      }
      function probeAudioEl(name) {
        return new Promise((resolve) => {
          const a = new Audio(); a.preload = "metadata"; a.src = fileUrl(name);
          a.onloadedmetadata = () => resolve({ duration: a.duration || 5, total_frames: Math.round((a.duration || 5) * fps()), fps: fps() });
          a.onerror = () => resolve({ duration: 5, total_frames: Math.round(fps() * 5), fps: fps() });
        });
      }
      addVideoBtn.addEventListener("click", () => {
        openVideoGalleryPicker(async (inputFilename) => {
          statusEl.textContent = "video added";
          const meta = await probeVideo(inputFilename);
          addMediaItem({ id: `m_${Date.now()}`, kind: "video", name: inputFilename, path: inputFilename, ...meta });
        });
      });
      addAudioBtn.addEventListener("click", () => {
        openAudioGalleryPicker(async (inputFilename) => {
          statusEl.textContent = "audio added";
          const meta = await probeAudioEl(inputFilename);
          addMediaItem({ id: `m_${Date.now()}`, kind: "audio", name: inputFilename, path: inputFilename, ...meta });
        }, API);
      });
      uploadInput.addEventListener("change", async () => {
        const files = [...uploadInput.files]; uploadInput.value = "";
        for (const f of files) {
          const kind = f.type.startsWith("video/") ? "video" : f.type.startsWith("audio/") ? "audio" : null;
          if (!kind) continue;
          statusEl.textContent = `uploading ${f.name}…`;
          try {
            const name = await uploadLocalFile(f);
            const meta = kind === "video" ? await probeVideo(name) : await probeAudioEl(name);
            addMediaItem({ id: `m_${Date.now()}_${Math.random().toString(16).slice(2)}`, kind, name: f.name, path: name, ...meta });
            statusEl.textContent = `added ${f.name}`;
          } catch (e) { statusEl.textContent = `upload failed: ${e?.message || e}`; }
        }
      });
      function renderMedia() {
        clear(mediaList);
        if (!media.length) { mediaList.appendChild(el("div", { text: "미디어를 추가해주세요 (갤러리 또는 업로드)", style: { color: C.muted, fontSize: "11px", padding: "10px" } })); return; }
        for (const item of media) {
          const thumb = el("div", { className: "itda-media-thumb" });
          if (item.kind === "video") thumb.appendChild(el("video", { src: fileUrl(item.path), muted: "" }));
          else thumb.appendChild(el("div", { text: "♪" }));
          const row = el("div", { className: "itda-media-item" }, [
            thumb,
            el("div", { style: { minWidth: "0", flex: "1" } }, [
              el("div", { text: item.name, style: { fontSize: "11px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }),
              el("div", { text: `${item.kind} · ${(item.duration || 0).toFixed(1)}s`, style: { fontSize: "10px", color: C.muted } }),
            ]),
          ]);
          row.draggable = true;
          row.addEventListener("dragstart", (e) => e.dataTransfer.setData("application/itda-media", JSON.stringify(item)));
          row.addEventListener("dblclick", () => addClipFromMedia(item, currentFrame, 0));
          mediaList.appendChild(row);
        }
      }

      // ══════════════════════════ clips / timeline render ══════════════════════════
      function addClipFromMedia(m, startFrame, lane) {
        const length = m.total_frames || Math.round((m.duration || 5) * fps()) || 120;
        const clip = {
          id: `clip_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          media_id: m.id, name: m.name, kind: m.kind, path: m.path,
          start: Math.max(0, snapFrame(startFrame)), length, source_in: 0, source_out: length,
          source_total_frames: m.total_frames || length, lane: clampLane(lane), audio_enabled: true,
        };
        normalizeClipBounds(clip);
        const fit = fitSingleMove(clip, clip.start, clip.lane);
        clip.start = fit.start; clip.lane = fit.lane;
        project.clips.push(clip);
        selectedClipId = clip.id;
        renderTimeline();
      }
      function renderRuler() {
        clear(ruler);
        const total = maxFrame();
        ruler.style.width = `${LEFT_PAD + total * pxPerFrame + 300}px`;
        const major = Math.max(1, Math.round(fps()));
        for (let f = 0; f <= total; f += major) {
          ruler.appendChild(el("div", { text: fmtTime(f, fps()).slice(0, 5), style: {
            position: "absolute", left: `${LEFT_PAD + f * pxPerFrame}px`, top: "0", fontSize: "9px", color: C.muted,
            borderLeft: `1px solid ${C.border}`, height: "100%", paddingLeft: "3px", boxSizing: "border-box",
          }}));
        }
      }
      function laneRow(index) {
        return lanesWrap.children[index];
      }
      function renderLanes() {
        clear(lanesWrap);
        lanesWrap.style.width = ruler.style.width;
        lanesWrap.style.height = `${LANE_COUNT * laneH()}px`;
        for (let i = 0; i < LANE_COUNT; i++) {
          const locked = !!ui.lockedLanes[i], hidden = !!ui.hiddenLanes[i];
          const row = el("div", { className: `itda-lane ${locked ? "locked" : ""} ${hidden ? "hidden-lane" : ""}`, style: { height: `${laneH()}px` } });
          const lockBtn = el("button", { text: locked ? "🔒" : "🔓", style: { cursor: "pointer", background: "transparent", border: "none", color: C.text, fontSize: "11px" } });
          const visBtn = el("button", { text: hidden ? "◌" : "👁", style: { cursor: "pointer", background: "transparent", border: "none", color: C.text, fontSize: "11px" } });
          lockBtn.addEventListener("click", () => { ui.lockedLanes[i] = !ui.lockedLanes[i]; persistUi(); renderTimeline(); });
          visBtn.addEventListener("click", () => { ui.hiddenLanes[i] = !ui.hiddenLanes[i]; persistUi(); renderTimeline(); updatePreview(); });
          row.appendChild(el("div", { className: "itda-lane-label" }, [el("span", { text: `T${i + 1}` }), lockBtn, visBtn]));
          row.addEventListener("dragover", (e) => e.preventDefault());
          row.addEventListener("drop", (e) => {
            e.preventDefault();
            const raw = e.dataTransfer.getData("application/itda-media"); if (!raw) return;
            const m = JSON.parse(raw);
            const rect = timeline.getBoundingClientRect();
            const frame = Math.max(0, Math.round((e.clientX - rect.left + timeline.scrollLeft - LEFT_PAD) / pxPerFrame));
            addClipFromMedia(m, frame, i);
          });
          lanesWrap.appendChild(row);
        }
        for (const c of project.clips || []) {
          normalizeClipBounds(c);
          const row = laneRow(c.lane); if (!row) continue;
          const clipEl = el("div", { className: `itda-clip ${c.kind} ${c.id === selectedClipId ? "selected" : ""}`, style: {
            left: `${LEFT_PAD + c.start * pxPerFrame}px`, width: `${Math.max(24, c.length * pxPerFrame)}px`,
          }});
          clipEl.dataset.clipId = c.id;
          clipEl.title = `${c.name}\n${c.source_in}f–${c.source_out}f · timeline ${c.start}f–${c.start + c.length}f`;
          clipEl.appendChild(el("div", { className: "itda-clip-title", text: `${c.kind === "audio" ? "♫" : "▣"} ${c.name}` }));
          if (c.kind === "audio") {
            const canvas = el("canvas", { style: { position: "absolute", inset: "0", top: "18px" } });
            clipEl.appendChild(canvas);
            drawWaveformFor(c, canvas);
          }
          clipEl.appendChild(el("div", { className: "itda-clip-handle left" }));
          clipEl.appendChild(el("div", { className: "itda-clip-handle right" }));
          clipEl.addEventListener("pointerdown", startClipPointer);
          row.appendChild(clipEl);
        }
      }
      function renderTimeline() {
        renderRuler(); renderLanes(); updatePlayhead(); renderMedia(); updatePreview();
      }

      // ── waveform (ported verbatim from ITDA — the piece the user specifically cared about) ──
      const waveformCache = new Map(); // path -> peaks[]
      async function ensureWaveform(path) {
        if (waveformCache.has(path)) return waveformCache.get(path);
        waveformCache.set(path, null); // in-flight guard
        try {
          const d = await jpost(`${API}/waveform`, { filename: path, bars: 400 });
          const peaks = (d && d.ok && Array.isArray(d.peaks)) ? d.peaks : [];
          waveformCache.set(path, peaks);
          renderTimeline();
          return peaks;
        } catch { waveformCache.set(path, []); return []; }
      }
      function drawWaveformFor(c, canvas) {
        const path = c.path;
        const peaks = waveformCache.get(path);
        if (peaks === undefined) { ensureWaveform(path); return; }
        if (!peaks || !peaks.length) return;
        const cssW = Math.max(1, Math.round(c.length * pxPerFrame)), cssH = Math.max(1, laneH() - 22);
        canvas.style.width = `${cssW}px`; canvas.style.height = `${cssH}px`;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
        const ctx = canvas.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = "rgba(205,255,235,.9)";
        const sourceTotal = c.source_total_frames || peaks.length;
        const mid = cssH / 2;
        for (let x = 0; x < cssW; x++) {
          const frameA = c.source_in + (x / cssW) * c.length;
          const a = Math.max(0, Math.min(peaks.length - 1, Math.floor((frameA / sourceTotal) * peaks.length)));
          const v = Math.abs(Number(peaks[a]) || 0);
          const h = Math.max(1, v * mid);
          ctx.fillRect(x, mid - h, 1, h * 2);
        }
      }

      // ── drag: move / trim (ported from ITDA's startClipPointer/onClipPointer) ──
      function startClipPointer(e) {
        e.preventDefault(); e.stopPropagation();
        const clipEl = e.currentTarget;
        const c = findClip(clipEl.dataset.clipId); if (!c || ui.lockedLanes[c.lane]) return;
        selectedClipId = c.id;
        const trim = e.target?.classList?.contains("itda-clip-handle") ? (e.target.classList.contains("left") ? "left" : "right") : null;
        drag = { clipId: c.id, startX: e.clientX, startY: e.clientY, origStart: c.start, origLen: c.length, origSourceIn: c.source_in || 0, origLane: c.lane, trim };
        renderTimeline();
        document.addEventListener("pointermove", onClipPointer, { passive: false });
        document.addEventListener("pointerup", endClipPointer, { once: true });
      }
      function laneFromClientY(y) {
        const rect = lanesWrap.getBoundingClientRect();
        return clampLane(Math.floor((y - rect.top) / laneH()));
      }
      function onClipPointer(e) {
        if (!drag) return; e.preventDefault();
        const c = findClip(drag.clipId); if (!c) return;
        const dxFrames = Math.round((e.clientX - drag.startX) / pxPerFrame);
        if (drag.trim === "left") {
          const oldEnd = drag.origStart + drag.origLen;
          let ns = Math.max(0, Math.min(oldEnd - 1, trimFrame(drag.origStart + dxFrames)));
          let diff = ns - drag.origStart;
          let srcIn = Math.max(0, Math.round(drag.origSourceIn + diff));
          let newLen = Math.max(1, oldEnd - ns);
          const maxLen = maxClipLength(c, srcIn);
          if (newLen > maxLen) { newLen = maxLen; ns = oldEnd - newLen; }
          if (!wouldOverlap(c.id, c.lane, ns, newLen)) { c.start = ns; c.length = newLen; c.source_in = srcIn; c.source_out = c.source_in + c.length; normalizeClipBounds(c); }
        } else if (drag.trim === "right") {
          let newLen = Math.max(1, trimFrame(drag.origLen + dxFrames));
          newLen = Math.min(newLen, maxClipLength(c, c.source_in || 0));
          if (!wouldOverlap(c.id, c.lane, c.start, newLen)) { c.length = newLen; c.source_out = (c.source_in || 0) + c.length; normalizeClipBounds(c); }
        } else {
          const targetLane = laneFromClientY(e.clientY);
          const target = snapMoveStart(drag.origStart + dxFrames, c.length, c.id);
          const fitted = fitSingleMove(c, target, targetLane);
          c.start = fitted.start; c.lane = fitted.lane;
        }
        renderTimeline();
      }
      function endClipPointer() { document.removeEventListener("pointermove", onClipPointer); drag = null; renderTimeline(); }

      // ══════════════════════════ playhead / preview ══════════════════════════
      function updatePlayhead() {
        playhead.style.left = `${LEFT_PAD + currentFrame * pxPerFrame}px`;
        playhead.style.height = `${lanesWrap.style.height}`;
        timeLabel.textContent = fmtTime(currentFrame, fps());
      }
      function topClipAt(frame, kinds) {
        return (project.clips || []).filter(c => frame >= c.start && frame < clipEnd(c) && !ui.hiddenLanes[c.lane] && kinds.includes(c.kind)).sort((a, b) => a.lane - b.lane)[0] || null;
      }
      function updatePreview() {
        const vClip = topClipAt(currentFrame, ["video"]);
        const aClip = !vClip ? topClipAt(currentFrame, ["audio"]) : null;
        if (vClip) {
          previewPlaceholder.style.display = "none"; previewAudio.style.display = "none"; previewVid.style.display = "block";
          const src = fileUrl(vClip.path);
          if (previewVid.dataset.src !== src) { previewVid.src = src; previewVid.dataset.src = src; }
          previewVid.currentTime = Math.max(0, (currentFrame - vClip.start + vClip.source_in) / fps());
        } else if (aClip) {
          previewPlaceholder.style.display = "none"; previewVid.style.display = "none"; previewAudio.style.display = "block";
          const src = fileUrl(aClip.path);
          if (previewAudio.dataset.src !== src) { previewAudio.src = src; previewAudio.dataset.src = src; }
          previewAudio.currentTime = Math.max(0, (currentFrame - aClip.start + aClip.source_in) / fps());
        } else {
          previewVid.style.display = "none"; previewAudio.style.display = "none"; previewPlaceholder.style.display = "flex";
        }
      }
      function setPlaying(p) {
        playing = p; playBtn.textContent = playing ? "⏸" : "▶";
        if (playing) {
          let last = performance.now();
          const tick = (t) => {
            const dt = (t - last) / 1000; last = t;
            currentFrame = Math.min(maxFrame(), currentFrame + dt * fps());
            updatePlayhead(); updatePreview();
            if (currentFrame >= maxFrame()) { setPlaying(false); return; }
            playRAF = requestAnimationFrame(tick);
          };
          playRAF = requestAnimationFrame(tick);
        } else if (playRAF) { cancelAnimationFrame(playRAF); playRAF = null; }
      }
      playBtn.addEventListener("click", () => setPlaying(!playing));
      timeline.addEventListener("click", (e) => {
        if (e.target !== ruler && e.target.parentElement !== ruler) return;
        const rect = timeline.getBoundingClientRect();
        currentFrame = Math.max(0, Math.round((e.clientX - rect.left + timeline.scrollLeft - LEFT_PAD) / pxPerFrame));
        updatePlayhead(); updatePreview();
      });
      ruler.addEventListener("pointerdown", (e) => {
        const rect = timeline.getBoundingClientRect();
        currentFrame = Math.max(0, Math.round((e.clientX - rect.left + timeline.scrollLeft - LEFT_PAD) / pxPerFrame));
        updatePlayhead(); updatePreview();
      });
      snapChk.addEventListener("change", () => { ui.snap = snapChk.checked; persistUi(); });
      self._itdaStop = () => { setPlaying(false); try { previewVid.pause(); previewAudio.pause(); } catch {} };

      // ══════════════════════════ project save/load ══════════════════════════
      async function loadProject(name) {
        statusEl.textContent = "loading…";
        try {
          const d = await jget(`${API}/project/${encodeURIComponent(name)}`);
          project = d.project || defaultProject(name);
          media = []; // media bin is session-local (picked fresh from galleries/upload each session)
          selectedClipId = null; currentFrame = 0;
          ui.projectName = name; persistUi();
          renderTimeline(); updatePreview();
          statusEl.textContent = `loaded "${name}"`;
        } catch (e) { statusEl.textContent = `load failed: ${e?.message || e}`; }
      }
      async function saveProject() {
        project.name = projectNameIn.value.trim() || "untitled";
        try {
          await jpost(`${API}/project/${encodeURIComponent(project.name)}`, project);
          ui.projectName = project.name; persistUi();
          statusEl.textContent = `saved "${project.name}"`;
        } catch (e) { statusEl.textContent = `save failed: ${e?.message || e}`; }
      }
      saveBtn.addEventListener("click", saveProject);
      projectNameIn.addEventListener("change", () => loadProject(projectNameIn.value.trim() || "untitled"));

      loadProject(ui.projectName);
    };
  },
});

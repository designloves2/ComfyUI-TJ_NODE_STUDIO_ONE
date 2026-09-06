// ui_audio_gallery_picker.js — cross-tool audio picker for audio-upload slots.
//
// The image slots can pick from any image tool's gallery; audio had no equivalent, so a
// reference track or an Audio Lock source could only come from a manual file upload. This
// overlay lists the MusicMaker playlist (the one audio "gallery" this pack has) and, on
// pick, copies the chosen track into ComfyUI's input folder via the caller tool's own
// copy_to_input route — the same mechanism the image picker uses — then hands back the
// unique input-folder filename.
import { el, clear } from "../klein/core_klein.js";

const BRAND = "#7612DA";
const C = { bg1: "#111111", bg2: "#181818", border: "#2a2a2a", text: "#dedede", muted: "#565656" };

const viewUrl = (t) =>
  `/view?filename=${encodeURIComponent(t.filename)}&subfolder=${encodeURIComponent(t.subfolder || "")}&type=output`;
const coverUrl = (t) =>
  t.cover
    ? `/view?filename=${encodeURIComponent(t.cover)}&subfolder=${encodeURIComponent((t.subfolder || "") + "/covers")}&type=output&t=${t.mtime || ""}`
    : "";

function clock(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * @param onPick   fn(inputFilename) — called once with the copied file's name in input/
 * @param copyApi  the caller tool's route prefix for copy_to_input, e.g. "/minimax_h3_one"
 */
export function openAudioGalleryPicker(onPick, copyApi = "/minimax_h3_one") {
  let loading = false, picking = false, saveSub = "one_music";
  let previewing = null;   // the <audio> currently playing, so a second pick stops it

  const ov = el("div", { style: { position: "fixed", inset: "0", background: "rgba(0,0,0,0.75)", zIndex: "100000", display: "flex", alignItems: "center", justifyContent: "center" } });
  const box = el("div", { style: { background: C.bg1, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "12px", width: "min(720px, 96vw)", height: "min(760px, 92vh)", minHeight: "0", boxShadow: "0 10px 40px rgba(0,0,0,0.6)", display: "flex", flexDirection: "column", gap: "10px" } });

  const topRow = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" } });
  topRow.appendChild(el("div", { text: "🎵 Pick a track from the MusicMaker playlist", style: { color: "#fff", fontSize: "14px", fontWeight: "700", flex: "1" } }));
  const closeBtn = el("button", { type: "button", text: "✕", style: { cursor: "pointer", fontFamily: "inherit", fontSize: "12px", padding: "5px 10px", borderRadius: "6px", border: "none", background: "#c0392b", color: "#fff" } });
  closeBtn.addEventListener("click", () => close());
  topRow.appendChild(closeBtn);

  const list = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px", overflowY: "auto", flex: "1", minHeight: "0" } });
  const statusEl = el("div", { style: { color: C.muted, fontSize: "11px", flexShrink: "0" } });

  box.append(topRow, list, statusEl);
  ov.appendChild(box);

  function stopPreview() {
    if (previewing) { try { previewing.pause(); } catch {} previewing = null; }
  }
  function close() {
    stopPreview();
    document.removeEventListener("keydown", onKey);
    if (ov.parentNode) document.body.removeChild(ov);
  }
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });

  async function pick(track, rowEl) {
    if (picking) return;
    picking = true;
    stopPreview();
    rowEl.style.opacity = "0.5";
    try {
      const r = await fetch(`${copyApi}/copy_to_input`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: track.filename, subfolder: track.subfolder || saveSub, type: "output" }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || "copy failed");
      onPick(d.filename);
      close();
    } catch (e) {
      rowEl.style.opacity = "1";
      picking = false;
      statusEl.textContent = "Import failed: " + (e.message || e);
    }
  }

  function rowFor(track) {
    const row = el("div", { style: {
      display: "flex", alignItems: "center", gap: "10px", padding: "6px",
      background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "8px", cursor: "pointer",
    }});
    row.addEventListener("mouseenter", () => { row.style.borderColor = BRAND; });
    row.addEventListener("mouseleave", () => { row.style.borderColor = C.border; });

    const cov = el("div", { style: {
      width: "44px", height: "44px", flexShrink: "0", borderRadius: "6px", background: "#000",
      backgroundSize: "cover", backgroundPosition: "center", display: "flex",
      alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: "700", color: C.muted,
    }});
    if (track.cover) cov.style.backgroundImage = `url("${coverUrl(track)}")`;
    else cov.textContent = track.engine === "acestep" ? "ACE" : "MM";

    const mid = el("div", { style: { flex: "1", minWidth: "0" }});
    mid.appendChild(el("div", { text: track.title || track.filename, style: {
      fontSize: "12px", color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
    }}));
    const sub = [track.engine === "acestep" ? "Ace-Step" : track.engine === "minimax" ? "MiniMax" : "",
                 track.seconds ? clock(track.seconds) : "",
                 track.instrumental ? "instrumental" : ""].filter(Boolean).join("  ·  ");
    mid.appendChild(el("div", { text: sub, style: { fontSize: "10px", color: C.muted, marginTop: "2px" }}));

    const audio = el("audio", { preload: "none", src: viewUrl(track) });
    const play = el("button", { type: "button", text: "▶", title: "Preview", style: {
      flexShrink: "0", cursor: "pointer", fontFamily: "inherit", fontSize: "11px", width: "26px", height: "26px",
      borderRadius: "50%", border: `1px solid ${C.border}`, background: C.bg1, color: C.text,
    }});
    play.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!audio.paused) { audio.pause(); return; }
      stopPreview();
      audio.currentTime = 0;
      audio.play().then(() => { previewing = audio; }).catch(() => {});
    });
    audio.addEventListener("play", () => { play.textContent = "⏸"; });
    audio.addEventListener("pause", () => { play.textContent = "▶"; });
    audio.addEventListener("ended", () => { play.textContent = "▶"; if (previewing === audio) previewing = null; });

    const use = el("button", { type: "button", text: "Import →", style: {
      flexShrink: "0", cursor: "pointer", fontFamily: "inherit", fontSize: "11px", padding: "5px 10px",
      borderRadius: "6px", border: "none", background: BRAND, color: "#fff", fontWeight: "700",
    }});
    use.addEventListener("click", (e) => { e.stopPropagation(); pick(track, row); });
    row.addEventListener("click", () => pick(track, row));

    row.append(cov, mid, audio, play, use);
    return row;
  }

  async function load() {
    if (loading) return;
    loading = true;
    statusEl.textContent = "Loading…";
    try {
      const cfg = await fetch("/music_one/config").then((r) => r.json()).catch(() => ({}));
      saveSub = (cfg.save_subfolder || "one_music").trim() || "one_music";
      const d = await fetch(`/music_one/playlist?limit=300&sort=newest&subfolder=${encodeURIComponent(saveSub)}`).then((r) => r.json());
      const tracks = d.tracks || [];
      clear(list);
      tracks.forEach((t) => list.appendChild(rowFor(t)));
      statusEl.textContent = tracks.length
        ? `${tracks.length} track${tracks.length === 1 ? "" : "s"} in ${saveSub}`
        : "No tracks in the MusicMaker playlist yet — make one in the MusicMaker node first.";
    } catch (e) {
      statusEl.textContent = "Could not load the playlist: " + (e.message || e);
    }
    loading = false;
  }

  document.body.appendChild(ov);
  load();
}

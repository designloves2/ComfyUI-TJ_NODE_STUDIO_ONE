# SPDX-License-Identifier: GPL-3.0-only
# Derived from LTX-2.5-Director by CGlide (https://github.com/CGlide/LTX-2.5-Director, GPL-3.0),
# itself a fork of WhatDreamsCost's LTX Director (https://github.com/WhatDreamsCost/WhatDreamsCost-ComfyUI, GPL-3.0).
# Modified for TJ NODE STUDIO ONE: node keys CS25 -> TJ25, routes /ltx_director* -> /ltx25_one/director/*, upload folder renamed.
# GPL-3.0 only: do NOT copy this file into the web project (see PORT_LEDGER).
# --- START OF FILE ltx_chunk_writer.py ---

import logging
import math
import os
import shutil

import numpy as np
from PIL import Image

import folder_paths

try:
    import av
    from fractions import Fraction
except Exception:  # PyAV missing - PNG output still works, video is skipped.
    av = None

log = logging.getLogger(__name__)

# The audio join lives in its own module so it can be tested without ComfyUI
# running. If it is missing the node still works, it just writes no audio.
try:
    from . import ltx_chunk_audio as chunk_audio
except Exception:
    try:
        import ltx_chunk_audio as chunk_audio
    except Exception:
        chunk_audio = None
        log.warning("[LTXChunkWriter] ltx_chunk_audio.py not found - audio will be skipped.")

HANDOFF_ROOT = "ltx25_one_handoff"
CHUNK_AUDIO_NAME = "audio.wav"
FRAME_EXTS = (".png", ".jpg", ".jpeg")
EARLY_BLEND_FRAMES = 3
# Steepness of the S-curve seam blend. Soft at both ends - which is where a change
# of velocity reads as a jerk - but crosses the middle quickly, so it spends little
# time at 50/50 where any remaining difference between the chunks would show.
SEAM_SCURVE_K = 4.0


def _seam_weight(k, n_blend, curve):
    """Blend weight for frame k of an n_blend-frame seam. 0 = previous chunk."""
    t = (k + 1.0) / (n_blend + 1.0)
    if curve != "scurve":
        return t
    z = math.tanh(SEAM_SCURVE_K * (t - 0.5)) / math.tanh(SEAM_SCURVE_K * 0.5)
    return 0.5 + 0.5 * z
# 4:4:4 always. Measured through the full chain to the assembled mp4: q95 4:4:4 lands
# within 0.2dB of lossless PNG because h264 at crf 18 introduces roughly ten times more
# error than the JPEG does. 4:2:0 does NOT - it nearly doubles the worst-case error on
# saturated chroma edges, so it is not offered.
JPEG_SUBSAMPLING = 0
TEMPORAL_STRIDE = 8


def _to_float(frame):
    """[H, W, C] float32 0..1 (or a torch tensor) -> float32 RGB numpy array."""
    if hasattr(frame, "detach"):
        frame = frame.detach().cpu().numpy()
    arr = np.asarray(frame, dtype=np.float32)
    if arr.ndim == 2:
        arr = np.stack([arr] * 3, axis=-1)
    if arr.shape[-1] > 3:
        arr = arr[..., :3]
    elif arr.shape[-1] == 1:
        arr = np.repeat(arr, 3, axis=-1)
    return arr


def _to_uint8(frame_float):
    """float32 RGB 0..1 -> uint8."""
    return np.clip(frame_float * 255.0 + 0.5, 0, 255).astype(np.uint8)


def _match_coeffs(src, ref):
    """Per-channel linear correction mapping `src` onto `ref`.

    Returns (scale, offset) as [3] arrays such that src * scale + offset has ref's
    per-channel mean and standard deviation. Both frames are the SAME moment — one is
    the previous chunk's last frame, the other this chunk's regeneration of it — so a
    simple linear match is well determined and doesn't need histogram matching.
    """
    scale = np.ones(3, dtype=np.float32)
    offset = np.zeros(3, dtype=np.float32)
    for c in range(3):
        s = src[..., c]
        r = ref[..., c]
        s_std = float(s.std())
        r_std = float(r.std())
        if s_std < 1e-5:
            continue
        k = r_std / s_std
        # Clamp: a wild scale means the frames aren't really the same shot.
        k = float(np.clip(k, 0.5, 2.0))
        scale[c] = k
        offset[c] = float(r.mean()) - k * float(s.mean())
    return scale, offset


def _save_frame(img, folder, stem, fmt, quality):
    """Write one frame as JPEG or PNG. Returns the path written."""
    if str(fmt).lower() in ("jpeg", "jpg"):
        path = os.path.join(folder, stem + ".jpg")
        img.save(path, "JPEG", quality=int(quality), subsampling=JPEG_SUBSAMPLING)
    else:
        path = os.path.join(folder, stem + ".png")
        img.save(path, compress_level=4)
    return path


def _list_frames(folder):
    """Frame files in a chunk folder, one format only.

    If a folder somehow holds both (format changed without clearing the chunk), the
    larger set wins rather than silently returning every frame twice.
    """
    try:
        names = os.listdir(folder)
    except OSError:
        return []
    groups = {}
    for f in names:
        low = f.lower()
        for ext in FRAME_EXTS:
            if low.endswith(ext):
                groups.setdefault(".jpg" if ext in (".jpg", ".jpeg") else ext, []).append(f)
                break
    if not groups:
        return []
    if len(groups) > 1:
        log.warning("[LTXChunkAssembler] %s holds mixed frame formats %s - using the larger set.",
                    folder, sorted(groups))
    best = max(groups.values(), key=len)
    return sorted(best)


def _safe_name(name, fallback):
    """Strip anything that could escape the intended folder."""
    cleaned = "".join(c for c in str(name) if c.isalnum() or c in ("-", "_", " ")).strip()
    cleaned = cleaned.replace(" ", "_")
    return cleaned or fallback


class _Mp4Writer:
    """Streaming h264 encoder. Opened lazily so it can take its size from frame 1."""

    def __init__(self, path, fps, crf):
        self.path = path
        self.fps = float(fps) if float(fps) > 0 else 25.0
        self.crf = int(crf)
        self.container = None
        self.stream = None
        self.w = self.h = 0

    def _open(self, h, w):
        # yuv420p needs even dimensions.
        self.h = (h // 2) * 2
        self.w = (w // 2) * 2
        self.container = av.open(self.path, mode="w")
        self.stream = self.container.add_stream("libx264", rate=Fraction(round(self.fps * 1000), 1000))
        self.stream.width = self.w
        self.stream.height = self.h
        self.stream.pix_fmt = "yuv420p"
        self.stream.options = {"crf": str(self.crf), "preset": "medium"}

    def add(self, rgb_uint8):
        if self.container is None:
            self._open(rgb_uint8.shape[0], rgb_uint8.shape[1])
        frame = av.VideoFrame.from_ndarray(
            np.ascontiguousarray(rgb_uint8[:self.h, :self.w, :]), format="rgb24")
        for packet in self.stream.encode(frame):
            self.container.mux(packet)

    def close(self):
        if self.container is None:
            return
        try:
            for packet in self.stream.encode():
                self.container.mux(packet)
        finally:
            self.container.close()


def _mux_audio_into_mp4(video_path, wav_path, out_path):
    """Put the joined audio into the assembled mp4.

    The picture is remuxed, not re-encoded - _Mp4Writer already encoded it once
    and a second pass would only cost quality. Audio becomes AAC, which adds a
    few ms of encoder padding at the tail; the wav next to it stays sample exact
    and is the one to use in an editor.
    """
    if av is None:
        raise RuntimeError("PyAV not available")

    in_v = av.open(video_path)
    in_a = av.open(wav_path)
    out = av.open(out_path, mode="w")
    try:
        v_stream = in_v.streams.video[0]
        a_stream = in_a.streams.audio[0]

        try:
            out_v = out.add_stream(template=v_stream)
        except TypeError:  # older PyAV
            out_v = out.add_stream_from_template(v_stream)

        try:
            channels = int(a_stream.layout.nb_channels)
        except Exception:
            channels = int(getattr(a_stream, "channels", 2) or 2)
        layout = "mono" if channels == 1 else "stereo"
        rate = int(a_stream.rate)

        try:
            out_a = out.add_stream("aac", rate=rate, layout=layout)
        except TypeError:
            out_a = out.add_stream("aac", rate=rate)
            try:
                out_a.layout = layout
            except Exception:
                pass

        resampler = av.audio.resampler.AudioResampler(
            format="fltp", layout=layout, rate=rate)

        for packet in in_v.demux(v_stream):
            if packet.dts is None:  # flush packets carry no timestamp
                continue
            packet.stream = out_v
            out.mux(packet)

        for frame in in_a.decode(a_stream):
            frame.pts = None  # let the resampler rebuild the timeline
            resampled = resampler.resample(frame)
            if resampled is None:
                continue
            if not isinstance(resampled, (list, tuple)):
                resampled = [resampled]
            for rframe in resampled:
                for packet in out_a.encode(rframe):
                    out.mux(packet)
        for packet in out_a.encode():
            out.mux(packet)
    finally:
        try:
            out.close()
        except Exception:
            pass
        in_v.close()
        in_a.close()
    return out_path


class LTXChunkWriter:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "images": ("IMAGE",),
                "run_name": ("STRING", {
                    "default": "run01",
                    "tooltip": "Folder name for this whole long-video run. Keep it the same across every chunk of the same video.",
                }),
                "chunk_index": ("INT", {
                    "default": 1, "min": 1, "max": 999, "step": 1,
                    "tooltip": "Which chunk this is. 1 for the first, 2 for the next, and so on.",
                }),
                "handoff_frames": ("INT", {
                    "default": 8, "min": 0, "max": 64, "step": 8,
                    "tooltip": "How many frames from the END of this chunk to copy into the input folder, ready to guide the next chunk. Snapped to a multiple of 8 because the LTX VAE packs 8 pixel frames into 1 latent frame — an unaligned handoff lands mid-latent and causes a hitch. 0 disables the handoff.",
                }),
                "runs_folder": ("STRING", {
                    "default": "ltx25_one_runs",
                    "tooltip": "Subfolder of ComfyUI's output directory where full chunk frames are written.",
                }),
                "save_all_frames": ("BOOLEAN", {
                    "default": True,
                    "tooltip": "Off = only write the handoff frames. Useful for testing the seam without filling a disk.",
                }),
                "clear_chunk_first": ("BOOLEAN", {
                    "default": True,
                    "tooltip": "Wipe this chunk's folder before writing, so re-running a chunk doesn't leave stale frames behind. Only ever touches this one chunk folder.",
                }),
                "total_chunks": ("INT", {
                    "default": 1, "min": 1, "max": 999, "step": 1,
                    "tooltip": "How many chunks this run has in total. Set automatically by Render All. When chunk_index reaches this number the run is assembled.",
                }),
                "auto_assemble": ("BOOLEAN", {
                    "default": True,
                    "tooltip": "After writing the final chunk, join every chunk into <run>/final/ with a cross-dissolve across the overlap. Uses handoff_frames as the overlap width.",
                }),
                "write_video": ("BOOLEAN", {
                    "default": True,
                    "tooltip": "After assembling the final chunk, also encode <run>_final.mp4 next to the final/ folder. The PNGs are written either way - the video is a convenience copy, not the master.",
                }),
                "video_fps": ("FLOAT", {
                    "default": 25.0, "min": 1.0, "max": 240.0, "step": 0.01,
                    "tooltip": "Frame rate for the assembled video. Render All sets this from the timeline automatically; only set it by hand if you're queueing chunks yourself.",
                }),
                "video_crf": ("INT", {
                    "default": 18, "min": 0, "max": 51, "step": 1,
                    "tooltip": "h264 quality. Lower is better and bigger; 18 is visually near-lossless.",
                }),
                "match_to_previous": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "Level-match this chunk to the previous one. Compares this chunk's first frame against the previous chunk's last handoff frame - the same moment, regenerated - and applies that per-channel correction to every frame. Off for chunk 1, or when you'd rather grade in your editor.",
                }),
                "frame_format": (["jpeg", "png"], {
                    "default": "jpeg",
                    "tooltip": "Format for the chunk frames, which are intermediates on their way to the mp4. JPEG is about 30x faster to write and several times smaller; measured end to end, q95 4:4:4 lands within 0.2dB of lossless PNG because the h264 encode that follows loses far more than the JPEG does. Handoff frames are ALWAYS PNG regardless - those go back into LTX as guides and must stay clean.",
                }),
                "jpeg_quality": ("INT", {
                    "default": 95, "min": 70, "max": 100, "step": 1,
                    "tooltip": "Only used when frame_format is jpeg. 95 is visually identical to PNG once the video is encoded. 100 is near-lossless but roughly PNG-sized, so it buys speed rather than space. Chroma is never subsampled.",
                }),
                "write_final_frames": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "Also write the assembled sequence as stills in <run>/final/. Off by default because the mp4 is the deliverable. Forced on if write_video is off, so an assembly always produces something.",
                }),
                "seam_mode": (["early_cut", "early_scurve", "early_blend", "dissolve", "hard_cut"], {
                    "default": "early_cut",
                    "tooltip": "Used by auto_assemble. Where to join two chunks: early_cut switches at the frame the two chunks share (the handoff guide, reproduced), so there is nothing to ghost. early_scurve ramps across seam_blend_frames with an S-curve, which smooths a velocity difference between chunks; early_blend is the straight-line version. dissolve and hard_cut are the old behaviour.",
                }),
                "seam_blend_frames": ("INT", {
                    "default": 3, "min": 1, "max": 32, "step": 1,
                    "tooltip": "How many frames the early_scurve / early_blend seam covers. Clamped to handoff_frames. Short is usually right: the chunks only agree near the start of the overlap, so a long blend reaches into frames that have already diverged.",
                }),
                "assemble_match_levels": ("BOOLEAN", {
                    "default": True,
                    "tooltip": "Used by auto_assemble. Corrects each chunk's brightness to the one before it, carried forward so chunk 3 matches corrected chunk 2. With early_cut the correction is measured from the single frame the two chunks share, which makes it exact. Unrelated to match_to_previous above, which is per-frame and unreliable.",
                }),
            },
            "optional": {
                "audio": ("AUDIO", {
                    "tooltip": "Optional. Wire this chunk's audio in - normally the LTXV Audio VAE Decode hanging off the FIRST pass. Saved next to the chunk's frames and crossfaded into one continuous track when the run is assembled. Leave unconnected for a silent run.",
                }),
            },
        }

    RETURN_TYPES = ("IMAGE", "STRING", "STRING")
    RETURN_NAMES = ("images", "handoff_folder", "info")
    FUNCTION = "write_chunk"
    CATEGORY = "WhatDreamsCost CS 2.5"
    OUTPUT_NODE = True
    DESCRIPTION = (
        "Writes a chunk of a long video out as PNG frames instead of encoding video, and copies the "
        "last N frames into ComfyUI's input folder so they can be dropped straight onto the timeline "
        "as guides for the next chunk. Passes images through unchanged, so it can sit in front of "
        "Video Combine rather than replacing it."
    )

    @classmethod
    def IS_CHANGED(s, **kwargs):
        return float("nan")

    def write_chunk(self, images, run_name, chunk_index, handoff_frames,
                    runs_folder, save_all_frames, clear_chunk_first,
                    total_chunks=1, auto_assemble=True, match_to_previous=False,
                    write_video=True, video_fps=25.0, video_crf=18,
                    frame_format="jpeg", jpeg_quality=95, write_final_frames=False,
                    seam_mode="early_cut", seam_blend_frames=3,
                    assemble_match_levels=True, audio=None):
        run = _safe_name(run_name, "run01")
        runs_sub = _safe_name(runs_folder, "ltx25_one_runs")
        chunk_tag = "chunk_%03d" % int(chunk_index)

        total = int(images.shape[0]) if hasattr(images, "shape") else len(images)
        if total <= 0:
            return (images, "", "[LTXChunkWriter] No frames received — nothing written.")

        # Snap the handoff to the VAE's temporal stride.
        requested = max(0, int(handoff_frames))
        n_handoff = (requested // TEMPORAL_STRIDE) * TEMPORAL_STRIDE
        if requested > 0 and n_handoff == 0:
            n_handoff = TEMPORAL_STRIDE
        if n_handoff > total:
            n_handoff = (total // TEMPORAL_STRIDE) * TEMPORAL_STRIDE
        if n_handoff != requested:
            log.info("[LTXChunkWriter] handoff_frames %d -> %d (multiple of %d).",
                     requested, n_handoff, TEMPORAL_STRIDE)

        chunk_dir = os.path.join(folder_paths.get_output_directory(), runs_sub, run, chunk_tag)
        handoff_dir = os.path.join(folder_paths.get_input_directory(), HANDOFF_ROOT, run)
        handoff_rel = "%s/%s" % (HANDOFF_ROOT, run)

        if clear_chunk_first and os.path.isdir(chunk_dir):
            try:
                shutil.rmtree(chunk_dir)
            except Exception as e:
                log.warning("[LTXChunkWriter] Could not clear %s: %s", chunk_dir, e)

        os.makedirs(chunk_dir, exist_ok=True)
        if n_handoff > 0:
            os.makedirs(handoff_dir, exist_ok=True)

        pbar = None
        try:
            import comfy.utils
            pbar = comfy.utils.ProgressBar(total)
        except Exception:
            pass

        handoff_start = total - n_handoff if n_handoff > 0 else total
        written = 0
        handoff_written = []

        # Level-match against the previous chunk, if asked and if there is one.
        scale, offset, match_note = None, None, "off"
        if match_to_previous and int(chunk_index) > 1:
            prev_tag = "chunk_%03d" % (int(chunk_index) - 1)
            prev_files = []
            if os.path.isdir(handoff_dir):
                prev_files = sorted(
                    f for f in os.listdir(handoff_dir)
                    if f.startswith(prev_tag + "_h") and f.lower().endswith(".png")
                )
            if prev_files:
                ref_path = os.path.join(handoff_dir, prev_files[-1])
                try:
                    ref = np.asarray(Image.open(ref_path).convert("RGB"), dtype=np.float32) / 255.0
                    cur = _to_float(images[0])
                    if ref.shape == cur.shape:
                        scale, offset = _match_coeffs(cur, ref)
                        match_note = "matched to %s (scale %s)" % (
                            prev_files[-1], np.round(scale, 4).tolist())
                    else:
                        match_note = "skipped - size mismatch %s vs %s" % (ref.shape, cur.shape)
                except Exception as e:
                    match_note = "failed: %s" % e
            else:
                match_note = "skipped - no %s handoff frame found" % prev_tag
            log.info("[LTXChunkWriter] Level match: %s", match_note)

        for i in range(total):
            is_handoff = i >= handoff_start
            if not save_all_frames and not is_handoff:
                if pbar is not None:
                    pbar.update(1)
                continue

            frame = _to_float(images[i])
            if scale is not None:
                frame = frame * scale + offset
                np.clip(frame, 0.0, 1.0, out=frame)
            img = Image.fromarray(_to_uint8(frame), mode="RGB")

            if save_all_frames:
                _save_frame(img, chunk_dir, "frame_%05d" % i, frame_format, jpeg_quality)
                written += 1

            if is_handoff:
                # Flat, sortable names — easy to find in the Add Image browser.
                # ALWAYS PNG: these are fed back to LTX as guides, and _compress_image is
                # already skipped for them for exactly this reason. Recompressing them
                # would reintroduce the artifact through a different door.
                name = "%s_h%02d.png" % (chunk_tag, i - handoff_start)
                img.save(os.path.join(handoff_dir, name), compress_level=4)
                handoff_written.append("%s/%s" % (handoff_rel, name))

            if pbar is not None:
                pbar.update(1)

        # Audio for this chunk, fitted to exactly this window. The fit is the point:
        # if the decode hands back a slightly different length than the window implies,
        # that error compounds and the sound walks off the picture a few chunks later.
        audio_note = "none"
        if audio is not None and chunk_audio is not None:
            try:
                wav_path = os.path.join(chunk_dir, CHUNK_AUDIO_NAME)
                saved, sr = chunk_audio.save_chunk_audio(
                    audio, wav_path, window_frames=total, fps=video_fps, label=chunk_tag)
                audio_note = ("%s @ %dHz" % (CHUNK_AUDIO_NAME, sr)) if saved else "empty"
            except Exception as e:
                audio_note = "failed: %s" % e
                log.exception("[LTXChunkWriter] Could not write chunk audio")
        elif audio is not None:
            audio_note = "skipped - ltx_chunk_audio.py missing"

        assembled = ""
        if auto_assemble and int(chunk_index) >= int(total_chunks) and int(total_chunks) > 1:
            try:
                final_dir, asm_info = _assemble_run(
                    run, runs_sub, n_handoff, True, bool(assemble_match_levels),
                    write_video=bool(write_video), video_fps=video_fps, video_crf=video_crf,
                    write_final_frames=bool(write_final_frames),
                    frame_format=frame_format, jpeg_quality=jpeg_quality,
                    seam_mode=seam_mode, seam_blend_frames=int(seam_blend_frames))
                assembled = " | ASSEMBLED -> %s" % final_dir
                log.info(asm_info)
            except Exception as e:
                assembled = " | assemble failed: %s" % e
                log.exception("[LTXChunkWriter] Auto-assemble failed")

        info = (
            "[LTXChunkWriter] run '%s' %s: %d frames in, %d %s written to %s. "
            "Handoff: %d PNG(s) -> input/%s. Level match: %s. Audio: %s%s"
            % (run, chunk_tag, total, written, str(frame_format).upper(), chunk_dir,
               len(handoff_written), handoff_rel, match_note, audio_note, assembled)
        )
        log.info(info)

        return (images, handoff_rel, info)


# ---------------------------------------------------------------------------
# Listing endpoint for the timeline UI.
# The "Continue From" row in the settings menu calls this to find handoff sets
# written by the node above. Kept in this file so the feature is self-contained.
# ---------------------------------------------------------------------------
try:
    from server import PromptServer
    from aiohttp import web

    @PromptServer.instance.routes.get("/ltx25_one/director/handoff_sets")
    async def _ltx_handoff_sets(request):
        root = os.path.join(folder_paths.get_input_directory(), HANDOFF_ROOT)
        sets = {}
        if os.path.isdir(root):
            for run in os.listdir(root):
                run_dir = os.path.join(root, run)
                if not os.path.isdir(run_dir):
                    continue
                for fname in os.listdir(run_dir):
                    if not fname.lower().endswith(".png") or "_h" not in fname:
                        continue
                    chunk = fname.rsplit("_h", 1)[0]
                    key = (run, chunk)
                    entry = sets.setdefault(key, {
                        "run": run, "chunk": chunk, "files": [], "mtime": 0.0,
                    })
                    entry["files"].append("%s/%s/%s" % (HANDOFF_ROOT, run, fname))
                    try:
                        entry["mtime"] = max(entry["mtime"],
                                             os.path.getmtime(os.path.join(run_dir, fname)))
                    except OSError:
                        pass

        out = []
        for entry in sets.values():
            entry["files"].sort()
            entry["count"] = len(entry["files"])
            out.append(entry)
        # Newest first, so the set you just rendered is the default choice.
        out.sort(key=lambda e: e["mtime"], reverse=True)
        return web.json_response({"sets": out})

except Exception as _e:  # pragma: no cover - server not present (e.g. unit tests)
    log.debug("[LTXChunkWriter] handoff_sets route not registered: %s", _e)


class LTXChunkAssembler:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "run_name": ("STRING", {
                    "default": "run01",
                    "tooltip": "The run to assemble. Must match what the Chunk Writer used.",
                }),
                "runs_folder": ("STRING", {
                    "default": "ltx25_one_runs",
                    "tooltip": "Subfolder of ComfyUI's output directory holding the run.",
                }),
                "overlap_frames": ("INT", {
                    "default": 8, "min": 0, "max": 64, "step": 1,
                    "tooltip": "How many frames each chunk shares with the next. Must match the handoff_frames you rendered with, and you must have started each window that many frames before the previous chunk ended.",
                }),
                "crossfade": ("BOOLEAN", {
                    "default": True,
                    "tooltip": "Blend across the overlap instead of cutting. Off = hard cut, overlap frames taken from the earlier chunk.",
                }),
                "write_video": ("BOOLEAN", {
                    "default": True,
                    "tooltip": "Also encode <run>_final.mp4 alongside the final/ PNG sequence.",
                }),
                "video_fps": ("FLOAT", {
                    "default": 25.0, "min": 1.0, "max": 240.0, "step": 0.01,
                    "tooltip": "Frame rate for the assembled video. Match your timeline.",
                }),
                "video_crf": ("INT", {
                    "default": 18, "min": 0, "max": 51, "step": 1,
                    "tooltip": "h264 quality. Lower is better and bigger; 18 is visually near-lossless.",
                }),
                "match_levels": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "Offset each chunk's brightness to match the one before it. This averages the MEAN over every overlap frame and never touches contrast - unlike the writer's per-frame match, which was unreliable. Still off by default: try the crossfade alone first.",
                }),
                "audio_crossfade": (["auto", "linear", "equal_power", "short", "off"], {
                    "default": "auto",
                    "tooltip": "How to blend audio across the overlap. Auto measures each seam and picks: identical material (an inpainted song) passes through untouched with a linear fade; independent generated sound gets equal_power so the level holds; music the model rendered slightly differently in each chunk gets a short 15ms splice, because a long blend of near-but-not-identical audio flanges. Short forces that splice everywhere, off is a hard cut. Every setting consumes the same overlap, so the audio never drifts out of sync with the picture.",
                }),
                "write_final_frames": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "Also write the assembled sequence as stills in <run>/final/. Off by default because the mp4 is the deliverable. Forced on if write_video is off.",
                }),
                "frame_format": (["jpeg", "png"], {
                    "default": "jpeg",
                    "tooltip": "Format for the final/ stills, when they are written at all. Chunk frames are read in whichever format the writer produced.",
                }),
                "jpeg_quality": ("INT", {
                    "default": 95, "min": 70, "max": 100, "step": 1,
                    "tooltip": "Only used when frame_format is jpeg. Chroma is never subsampled.",
                }),
                "seam_mode": (["early_cut", "early_scurve", "early_blend", "dissolve", "hard_cut"], {
                    "default": "early_cut",
                    "tooltip": "Where to join two chunks. The next chunk's FIRST frame is the handoff guide reproduced, so it is pixel-identical to the previous chunk's frame at (end - handoff_frames). early_cut switches exactly there - identical content, nothing mixed, no ghost. early_scurve blends over seam_blend_frames with an S-curve - soft at both ends, so a difference in camera velocity between the chunks is ramped rather than stepped. early_blend is the same length with a straight fade. dissolve and hard_cut are the old behaviour, which joined at the END of the overlap after the chunks had already diverged. This setting supersedes the crossfade toggle above.",
                }),
                "seam_blend_frames": ("INT", {
                    "default": 3, "min": 1, "max": 32, "step": 1,
                    "tooltip": "How many frames the early_scurve / early_blend seam covers. Clamped to handoff_frames. Short is usually right: the chunks only agree near the start of the overlap, so a long blend reaches into frames that have already diverged.",
                }),
            }
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("final_folder", "info")
    FUNCTION = "assemble"
    CATEGORY = "WhatDreamsCost CS 2.5"
    OUTPUT_NODE = True
    DESCRIPTION = (
        "Joins the chunks of a run into one continuous PNG sequence, cross-dissolving the "
        "overlapping frames. Writes to <run>/final/ rather than returning an IMAGE batch: "
        "a 16s 1920x1088 sequence is about 10GB as float32, which is not something to hold "
        "in memory just to hand to a video encoder."
    )

    @classmethod
    def IS_CHANGED(s, **kwargs):
        return float("nan")

    def assemble(self, run_name, runs_folder, overlap_frames, crossfade, match_levels,
                 write_video=True, video_fps=25.0, video_crf=18,
                 audio_crossfade="auto", write_final_frames=False,
                 frame_format="jpeg", jpeg_quality=95, seam_mode="early_cut",
                 seam_blend_frames=3):
        return _assemble_run(_safe_name(run_name, "run01"),
                             _safe_name(runs_folder, "ltx25_one_runs"),
                             int(overlap_frames), bool(crossfade), bool(match_levels),
                             write_video=bool(write_video), video_fps=video_fps,
                             video_crf=video_crf, audio_crossfade=audio_crossfade,
                             write_final_frames=bool(write_final_frames),
                             frame_format=frame_format, jpeg_quality=jpeg_quality,
                             seam_mode=seam_mode,
                             seam_blend_frames=int(seam_blend_frames))


def _assemble_run(run, runs_sub, overlap_frames, crossfade, match_levels,
                  write_video=False, video_fps=25.0, video_crf=18,
                  audio_crossfade="auto", write_final_frames=True,
                  frame_format="jpeg", jpeg_quality=95, seam_mode="early_cut",
                  seam_blend_frames=EARLY_BLEND_FRAMES):
        run_dir = os.path.join(folder_paths.get_output_directory(), runs_sub, run)

        if not os.path.isdir(run_dir):
            return ("", "[LTXChunkAssembler] No such run folder: %s" % run_dir)

        chunk_dirs = sorted(
            os.path.join(run_dir, d) for d in os.listdir(run_dir)
            if d.startswith("chunk_") and os.path.isdir(os.path.join(run_dir, d))
        )
        if not chunk_dirs:
            return ("", "[LTXChunkAssembler] No chunk folders in %s" % run_dir)

        chunks = []
        for cd in chunk_dirs:
            files = _list_frames(cd)
            if files:
                chunks.append((cd, files))
        if not chunks:
            return ("", "[LTXChunkAssembler] Chunk folders contain no frames (png or jpg).")

        n_ov = max(0, int(overlap_frames))

        # An assembly that writes neither stills nor video would do all the work and
        # leave nothing behind, so the stills come back on.
        keep_frames = bool(write_final_frames)
        if not keep_frames and not write_video:
            keep_frames = True
            log.warning("[LTXChunkAssembler] write_video is off, so final frames are written anyway.")

        final_dir = os.path.join(run_dir, "final")
        if keep_frames:
            if os.path.isdir(final_dir):
                try:
                    shutil.rmtree(final_dir)
                except Exception as e:
                    log.warning("[LTXChunkAssembler] Could not clear %s: %s", final_dir, e)
            os.makedirs(final_dir, exist_ok=True)

        def load(cd, fname):
            return np.asarray(Image.open(os.path.join(cd, fname)).convert("RGB"),
                              dtype=np.float32) / 255.0

        mp4 = None
        mp4_path = os.path.join(run_dir, "%s_final.mp4" % run)
        if write_video:
            if av is None:
                log.warning("[LTXChunkAssembler] PyAV not available - skipping video.")
            else:
                mp4 = _Mp4Writer(mp4_path, video_fps, video_crf)

        def save(idx, arr):
            np.clip(arr, 0.0, 1.0, out=arr)
            rgb = _to_uint8(arr)
            if keep_frames:
                _save_frame(Image.fromarray(rgb, mode="RGB"), final_dir,
                            "frame_%05d" % idx, frame_format, jpeg_quality)
            if mp4 is not None:
                mp4.add(rgb)

        total_est = sum(len(f) for _, f in chunks) - n_ov * (len(chunks) - 1)
        pbar = None
        try:
            import comfy.utils
            pbar = comfy.utils.ProgressBar(max(1, total_est))
        except Exception:
            pass

        seam = str(seam_mode or "early_cut").lower()
        if seam not in ("early_cut", "early_blend", "early_scurve", "dissolve", "hard_cut"):
            seam = "early_cut"
        early = seam.startswith("early")
        if not early:
            crossfade = (seam == "dissolve")

        out_idx = 0
        # Cumulative per-chunk brightness offset, so chunk 3 matches corrected chunk 2.
        offset = np.zeros(3, dtype=np.float32)
        prev_offset = np.zeros(3, dtype=np.float32)
        notes = []

        for ci, (cd, files) in enumerate(chunks):
            n = len(files)
            ov = min(n_ov, n) if ci > 0 else 0
            prev_offset = offset.copy()

            if ci > 0 and match_levels and ov > 0:
                prev_cd, prev_files = chunks[ci - 1]
                if early:
                    # ONE pair is the same moment: the handoff frame, reproduced by the
                    # next chunk as its frame 0. The difference between those two IS the
                    # colour error, exactly - no averaging needed, and no contamination
                    # from later frames that have already drifted apart.
                    prev_mean = load(prev_cd, prev_files[-ov]).reshape(-1, 3).mean(axis=0)
                    cur_mean = load(cd, files[0]).reshape(-1, 3).mean(axis=0)
                else:
                    prev_tail = prev_files[-ov:]
                    cur_head = files[:ov]
                    prev_mean = np.mean([load(prev_cd, f).reshape(-1, 3).mean(axis=0) for f in prev_tail], axis=0)
                    cur_mean = np.mean([load(cd, f).reshape(-1, 3).mean(axis=0) for f in cur_head], axis=0)
                # prev_offset is what the previous chunk was already shifted by, so the
                # target is its CORRECTED brightness, not its raw brightness. Without this
                # the corrections stop accumulating and chunk 3 drifts back.
                offset = (prev_mean + prev_offset) - cur_mean
                notes.append("chunk %d offset %s" % (ci + 1, np.round(offset, 4).tolist()))

            head_start = 0
            if ci > 0 and ov > 0:
                prev_cd, prev_files = chunks[ci - 1]
                prev_tail = prev_files[-ov:]

                if early:
                    # Switch at the START of the overlap, where the two chunks are the
                    # SAME frame, instead of at the end after 8 frames of divergence.
                    # That is what made the old hard cut look rough: it cut at the one
                    # place the chunks disagreed most. The previous chunk's tail is
                    # simply dropped - its content is present in this chunk's head.
                    n_soft = 0 if seam == "early_cut" else min(max(1, int(seam_blend_frames)), ov)
                    curve = "scurve" if seam == "early_scurve" else "linear"
                    for k in range(ov):
                        b = load(cd, files[k]) + offset
                        if k < n_soft:
                            # Early frames follow the previous chunk's motion, later ones
                            # the new chunk's - so a velocity change is ramped rather than
                            # stepped. There is almost nothing to ghost here because the
                            # two chunks agree at the start of the overlap.
                            a = load(prev_cd, prev_tail[k]) + prev_offset
                            w = _seam_weight(k, n_soft, curve)
                            b = a * (1.0 - w) + b * w
                        save(out_idx, b)
                        out_idx += 1
                        if pbar is not None:
                            pbar.update(1)
                else:
                    for k in range(ov):
                        a = load(prev_cd, prev_tail[k]) + prev_offset
                        b = load(cd, files[k]) + offset
                        if crossfade:
                            w = (k + 1.0) / (ov + 1.0)
                            blended = a * (1.0 - w) + b * w
                        else:
                            blended = a
                        save(out_idx, blended)
                        out_idx += 1
                        if pbar is not None:
                            pbar.update(1)
                head_start = ov

            # Body of this chunk, minus the tail that the NEXT chunk will blend.
            tail_reserved = min(n_ov, n) if ci < len(chunks) - 1 else 0
            for k in range(head_start, n - tail_reserved):
                save(out_idx, load(cd, files[k]) + offset)
                out_idx += 1
                if pbar is not None:
                    pbar.update(1)

        vid_note = ""
        video_ok = False
        if mp4 is not None:
            try:
                mp4.close()
                video_ok = True
                vid_note = " | video: %s (%.3g fps)" % (mp4_path, float(video_fps))
            except Exception as e:
                vid_note = " | video failed: %s" % e
                log.exception("[LTXChunkAssembler] Video encode failed")

        # Audio: same chunks, same overlap, same geometry as the picture above.
        aud_note = ""
        wav_path = os.path.join(run_dir, "%s_final.wav" % run)
        audio_specs = []
        for cd, files in chunks:
            candidate = os.path.join(cd, "audio.wav")
            audio_specs.append((candidate if os.path.isfile(candidate) else None, len(files)))

        if chunk_audio is None:
            if any(p for p, _ in audio_specs):
                aud_note = " | audio skipped: ltx_chunk_audio.py missing"
        elif not any(p for p, _ in audio_specs):
            pass  # silent run, nothing to say
        else:
            try:
                # n_ov is passed for every mode - "off" is a hard cut INSIDE the
                # overlap, not a skipped overlap, or the audio ends up longer
                # than the picture by n_ov * (chunks - 1).
                joined, sr, n_samples = chunk_audio.join_run_audio(
                    audio_specs, n_ov, float(video_fps), wav_path,
                    crossfade_mode=str(audio_crossfade))
                if joined:
                    chunk_audio.peak_normalise_if_clipping(joined)
                    aud_note = " | audio: %s (%d samples @ %dHz)" % (joined, n_samples, sr)
                    if video_ok and av is not None:
                        tmp_path = mp4_path + ".withaudio.mp4"
                        try:
                            _mux_audio_into_mp4(mp4_path, joined, tmp_path)
                            os.replace(tmp_path, mp4_path)
                            aud_note += " | muxed into video"
                        except Exception as e:
                            try:
                                os.remove(tmp_path)
                            except OSError:
                                pass
                            aud_note += " | mux failed (%s), video is silent - use the wav" % e
                            log.exception("[LTXChunkAssembler] Audio mux failed")
            except Exception as e:
                aud_note = " | audio join failed: %s" % e
                log.exception("[LTXChunkAssembler] Audio join failed")

        where = final_dir if keep_frames else ("%s (video only, no stills)" % run_dir)
        seam_desc = seam if seam.startswith("early_") and seam != "early_cut" \
            else seam
        if seam in ("early_blend", "early_scurve"):
            seam_desc = "%s over %d frame(s)" % (seam, min(int(seam_blend_frames), n_ov))
        info = ("[LTXChunkAssembler] %d chunk(s), overlap %d, seam '%s' -> %d frames in %s%s%s%s"
                % (len(chunks), n_ov, seam_desc,
                   out_idx, where, vid_note, aud_note,
                   (" | " + "; ".join(notes)) if notes else ""))
        log.info(info)
        return ((final_dir if keep_frames else run_dir), info)


NODE_CLASS_MAPPINGS = {
    "LTXChunkWriterTJ25": LTXChunkWriter,
    "LTXChunkAssemblerTJ25": LTXChunkAssembler,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "LTXChunkWriterTJ25": "LTX Chunk Writer CS (2.5)",
    "LTXChunkAssemblerTJ25": "LTX Chunk Assembler CS (2.5)",
}

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS']

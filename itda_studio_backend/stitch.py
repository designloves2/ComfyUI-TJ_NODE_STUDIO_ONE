from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path
from typing import Any

import numpy as np


def _extract_gray_frames(path: Path, start_sec: float, count: int, w: int = 64, h: int = 36) -> list:
    """Decode `count` frames starting at start_sec as small grayscale arrays,
    downscaled enough that a full all-pairs comparison across two ~2-5s
    windows is cheap (a few thousand 64x36 diffs, not full-resolution video)."""
    if count <= 0:
        return []
    cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "error",
        "-ss", f"{max(0.0, start_sec):.6f}", "-i", str(path),
        "-frames:v", str(count), "-vf", f"scale={w}:{h}:flags=area,format=gray",
        "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1",
    ]
    raw = subprocess.check_output(cmd, stderr=subprocess.STDOUT, timeout=30)
    frame_bytes = w * h
    n = len(raw) // frame_bytes
    # .copy() because frombuffer views are read-only, and OpenCV (used for
    # motion matching below) wants writable arrays.
    return [np.frombuffer(raw[i * frame_bytes:(i + 1) * frame_bytes], dtype=np.uint8).reshape(h, w).copy() for i in range(n)]


def _motion_vectors(frames: list) -> list[tuple[float, float]] | None:
    """Average optical-flow vector between each consecutive frame pair, i.e.
    "which way and how fast is this shot moving right now."

    Returns None (rather than raising) when OpenCV is missing or flow fails,
    so motion is simply dropped from scoring instead of failing the analysis.
    """
    if len(frames) < 2:
        return None
    try:
        import cv2
    except Exception:
        return None
    vecs: list[tuple[float, float]] = []
    try:
        for i in range(len(frames) - 1):
            flow = cv2.calcOpticalFlowFarneback(frames[i], frames[i + 1], None, 0.5, 3, 9, 3, 5, 1.2, 0)
            vecs.append((float(flow[..., 0].mean()), float(flow[..., 1].mean())))
    except Exception:
        return None
    return vecs


def _motion_match_score(v_a: tuple[float, float], v_b: tuple[float, float]) -> float:
    """How well the motion leaving A continues into B - a cut where the
    camera is panning right at 2px/frame into a shot that starts panning
    right at 2px/frame reads as continuous; the same cut into a static or
    opposite-panning shot visibly jerks even when both frames look alike.
    """
    ax, ay = v_a
    bx, by = v_b
    mag_a = float(np.hypot(ax, ay))
    mag_b = float(np.hypot(bx, by))
    if mag_a < 0.05 and mag_b < 0.05:
        return 1.0  # both essentially still: trivially continuous
    diff = float(np.hypot(ax - bx, ay - by))
    denom = 2.0 * max(mag_a, mag_b, 1e-6)
    return max(0.0, min(1.0, 1.0 - diff / denom))


def _combine_scores(parts: list[tuple[float, float]]) -> float:
    """Weighted mean that renormalizes over whatever components are actually
    available, so a clip with no audio isn't scored as if its audio matched
    perfectly (or not at all)."""
    total_w = sum(w for _, w in parts)
    if total_w <= 0:
        return 0.0
    return sum(s * w for s, w in parts) / total_w


def _extract_pcm(path: Path, start_sec: float, dur_sec: float, sr: int = 8000):
    """Mono 16-bit PCM samples for a short window, or None if there's no
    audio stream / the window is out of range - callers must treat a None
    return as "skip audio scoring for this candidate", not an error."""
    if dur_sec <= 0:
        return None
    cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "error",
        "-ss", f"{max(0.0, start_sec):.6f}", "-t", f"{dur_sec:.6f}", "-i", str(path),
        "-vn", "-ac", "1", "-ar", str(sr), "-f", "s16le", "pipe:1",
    ]
    try:
        raw = subprocess.check_output(cmd, stderr=subprocess.STDOUT, timeout=30)
    except Exception:
        return None
    if not raw:
        return None
    return np.frombuffer(raw, dtype=np.int16)


def _audio_level_continuity(path_a: Path, frame_a: int, path_b: Path, frame_b: int, fps: float, sr: int = 8000, win_sec: float = 0.06) -> float | None:
    """How closely the audio level right before the cut matches right after -
    reported for information only, NOT used to rank candidates.

    Audio was measured against known-correct and known-wrong cut points on
    real generated footage and could not separate them: the score ranges for
    continuous and discontinuous cuts overlap completely (a deliberate jump
    to unrelated footage scored *higher* than a genuinely continuous cut).
    Two causes, both inherent rather than fixable by a better formula:
    generated clips tend to have spectrally uniform audio, so "is this the
    same material" is always yes; and level naturally swings as much inside
    one continuous passage as it does between distant points. Ranking on it
    actively demoted the objectively perfect cut to last place, so it is
    excluded from scoring. Frame and motion do discriminate and carry the
    decision instead.
    """
    a_pcm = _extract_pcm(path_a, max(0.0, frame_a / fps - win_sec), win_sec, sr)
    b_pcm = _extract_pcm(path_b, frame_b / fps, win_sec, sr)
    if a_pcm is None or b_pcm is None or len(a_pcm) < 10 or len(b_pcm) < 10:
        return None
    rms_a = float(np.sqrt(np.mean(a_pcm.astype(np.float64) ** 2)))
    rms_b = float(np.sqrt(np.mean(b_pcm.astype(np.float64) ** 2)))
    return max(0.0, min(1.0, 1.0 - abs(rms_a - rms_b) / max(rms_a, rms_b, 1.0)))


def analyze_stitch(path_a: Path, source_out_a: int, path_b: Path, source_in_b: int, fps: float, window_sec: float = 2.0, top_n: int = 5) -> dict[str, Any]:
    """Recommends where to cut A and where to start B so the two clips read
    as continuous, by finding the most visually (and, secondarily, audibly)
    similar frame near each clip's edge of the given analysis window -
    i.e. "these two frames show nearly the same moment, so drop everything
    after frame_a in A and everything before frame_b in B."

    Each candidate is scored on three independent axes - frame similarity
    (do these two frames show the same moment), motion continuity (is the
    camera moving the same way through the cut), and audio continuity (does
    the sound carry across without a pop) - because they fail independently:
    two frames can look nearly identical while the motion through them jerks,
    and motion can match while the audio level jumps.
    """
    fps = float(fps or 24)
    window_frames = max(4, min(240, round(window_sec * fps)))
    start_a = max(0, int(source_out_a) - window_frames)
    count_a = int(source_out_a) - start_a
    start_b = int(source_in_b)
    count_b = window_frames

    try:
        frames_a = _extract_gray_frames(path_a, start_a / fps, count_a)
        frames_b = _extract_gray_frames(path_b, start_b / fps, count_b)
    except Exception as e:
        return {"ok": False, "error": f"frame extraction failed: {e}"}
    if len(frames_a) < 2 or len(frames_b) < 2:
        return {"ok": False, "error": "not enough frames near the boundary to analyze - try a larger window"}

    n_a, n_b = len(frames_a), len(frames_b)
    a = np.stack(frames_a).astype(np.float32).reshape(n_a, -1)
    b = np.stack(frames_b).astype(np.float32).reshape(n_b, -1)
    diff2 = np.mean((a[:, None, :] - b[None, :, :]) ** 2, axis=2)
    frame_score = 1.0 - np.sqrt(diff2) / 255.0

    # Motion is per-frame-pair, so it costs one pass over each window (O(n)),
    # not one per candidate pair (O(n^2)) - computed up front and indexed.
    vecs_a = _motion_vectors(frames_a)
    vecs_b = _motion_vectors(frames_b)

    order = np.argsort(frame_score, axis=None)[::-1]
    candidates: list[dict[str, Any]] = []
    for flat in order:
        i, j = divmod(int(flat), n_b)
        frame_a_idx = start_a + i
        frame_b_idx = start_b + j
        # Spacing-based dedup: skip anything too close (in either clip) to a
        # candidate already kept, so the top-5 aren't all the same instant.
        if any(abs(frame_a_idx - c["frame_a"]) < 2 and abs(frame_b_idx - c["frame_b"]) < 2 for c in candidates):
            continue
        f_score = float(frame_score[i, j])
        a_score = _audio_level_continuity(path_a, frame_a_idx, path_b, frame_b_idx, fps)
        m_score = None
        if vecs_a and vecs_b:
            # Motion *into* the cut on A (the pair ending at i), and motion
            # *out of* it on B (the pair starting at j); clamped at the window
            # edges where one side of the pair doesn't exist.
            m_score = _motion_match_score(
                vecs_a[i - 1] if i >= 1 else vecs_a[0],
                vecs_b[j] if j < len(vecs_b) else vecs_b[-1],
            )
        # a_score is intentionally absent here - see _audio_level_continuity.
        parts = [(f_score, 0.65)]
        if m_score is not None:
            parts.append((m_score, 0.35))
        combined = _combine_scores(parts)
        candidates.append({
            "frame_a": frame_a_idx, "frame_b": frame_b_idx,
            "frame_score": round(f_score, 4),
            "audio_score": round(a_score, 4) if a_score is not None else None,
            "motion_score": round(m_score, 4) if m_score is not None else None,
            "combined_score": round(float(combined), 4),
        })
        if len(candidates) >= top_n:
            break

    candidates.sort(key=lambda c: c["combined_score"], reverse=True)
    return {"ok": True, "candidates": candidates, "best": candidates[0] if candidates else None, "window_frames": window_frames}


def _extract_bgr_frame(path: Path, frame_idx: int, fps: float):
    """Full-resolution BGR frame at `frame_idx`, decoded via ffmpeg -> rawvideo
    piped straight into a numpy array (no temp file, no cv2.VideoCapture seek
    drift)."""
    probe = subprocess.check_output([
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", str(path),
    ], timeout=15).decode().strip()
    w, h = (int(x) for x in probe.split("x"))
    cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "error",
        "-ss", f"{max(0.0, frame_idx / fps):.6f}", "-i", str(path),
        "-frames:v", "1", "-vf", "format=bgr24", "-f", "rawvideo", "pipe:1",
    ]
    raw = subprocess.check_output(cmd, timeout=30)
    return np.frombuffer(raw, dtype=np.uint8).reshape(h, w, 3).copy(), w, h


def render_bridge(
    path_a: Path, frame_a: int, path_b: Path, frame_b: int, fps: float,
    out_path: Path, mode: str = "interpolate", num_frames: int = 6,
) -> dict[str, Any]:
    """Synthesize `num_frames` bridge frames between A's cut frame and B's
    start frame and encode them (with a matching audio crossfade) as a short
    clip to insert between the two on the timeline.

    "crossfade" is a plain alpha dissolve. "interpolate" additionally warps
    each source frame along the optical-flow field toward the other before
    blending, so moving content shifts into place instead of just fading -
    the same end-frame/start-frame bridging idea as ComfyUI first-last-frame
    video generation, done here with classical flow instead of a diffusion
    model so it costs milliseconds, not a queued generation.
    """
    num_frames = max(1, min(30, int(num_frames)))
    fps = float(fps or 24)
    try:
        img_a, w, h = _extract_bgr_frame(path_a, max(0, frame_a - 1), fps)
        img_b, _, _ = _extract_bgr_frame(path_b, frame_b, fps)
    except Exception as e:
        return {"ok": False, "error": f"frame extraction failed: {e}"}
    if img_b.shape != img_a.shape:
        import cv2
        img_b = cv2.resize(img_b, (img_a.shape[1], img_a.shape[0]))

    flow_ab = flow_ba = None
    if mode == "interpolate":
        try:
            import cv2
            gray_a = cv2.cvtColor(img_a, cv2.COLOR_BGR2GRAY)
            gray_b = cv2.cvtColor(img_b, cv2.COLOR_BGR2GRAY)
            flow_ab = cv2.calcOpticalFlowFarneback(gray_a, gray_b, None, 0.5, 3, 15, 3, 5, 1.2, 0)
            flow_ba = cv2.calcOpticalFlowFarneback(gray_b, gray_a, None, 0.5, 3, 15, 3, 5, 1.2, 0)
        except Exception:
            flow_ab = flow_ba = None  # fall back to a plain dissolve below

    grid_x, grid_y = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))

    def _warp(img, flow, t):
        import cv2
        map_x = grid_x + flow[..., 0] * t
        map_y = grid_y + flow[..., 1] * t
        return cv2.remap(img, map_x, map_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        for i in range(num_frames):
            t = (i + 1) / (num_frames + 1)
            if flow_ab is not None:
                warped_a = _warp(img_a, flow_ab, t)
                warped_b = _warp(img_b, flow_ba, 1.0 - t)
                frame = (warped_a.astype(np.float32) * (1 - t) + warped_b.astype(np.float32) * t).astype(np.uint8)
            else:
                frame = (img_a.astype(np.float32) * (1 - t) + img_b.astype(np.float32) * t).astype(np.uint8)
            import cv2
            cv2.imwrite(str(tmp_path / f"f{i:03d}.png"), frame)

        out_path.parent.mkdir(parents=True, exist_ok=True)
        dur = num_frames / fps
        video_in = ["-framerate", f"{fps}", "-i", str(tmp_path / "f%03d.png")]

        has_audio_a = _extract_pcm(path_a, max(0.0, frame_a / fps - dur), dur, sr=44100) is not None
        has_audio_b = _extract_pcm(path_b, frame_b / fps, dur, sr=44100) is not None
        if has_audio_a and has_audio_b:
            audio_in = [
                "-ss", f"{max(0.0, frame_a / fps - dur):.6f}", "-t", f"{dur:.6f}", "-i", str(path_a),
                "-ss", f"{frame_b / fps:.6f}", "-t", f"{dur:.6f}", "-i", str(path_b),
            ]
            filter_complex = f"[1:a][2:a]acrossfade=d={dur:.6f}:c1=tri:c2=tri[aout]"
            cmd = [
                "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                *video_in, *audio_in,
                "-filter_complex", filter_complex, "-map", "0:v", "-map", "[aout]",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(out_path),
            ]
        else:
            cmd = [
                "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                *video_in, "-c:v", "libx264", "-pix_fmt", "yuv420p", str(out_path),
            ]
        try:
            subprocess.check_output(cmd, stderr=subprocess.STDOUT, timeout=60)
        except subprocess.CalledProcessError as e:
            return {"ok": False, "error": f"bridge encode failed: {e.output.decode(errors='replace')[-500:]}"}

    return {"ok": True, "path": str(out_path), "frames": num_frames, "fps": fps, "width": w, "height": h, "has_audio": has_audio_a and has_audio_b}

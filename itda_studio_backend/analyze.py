from __future__ import annotations

import re
import subprocess
from pathlib import Path
from typing import Any

import numpy as np

_PTS_TIME_RE = re.compile(r"pts_time:([0-9.]+)")


def detect_scenes(path: Path, fps: float, threshold: float = 0.3) -> dict[str, Any]:
    """Frame numbers where the picture changes enough to read as a new shot.

    Uses ffmpeg's own `scene` score (select='gt(scene,T)') rather than
    decoding every frame here - ffmpeg does the comparison inside the decode
    loop, so a multi-minute clip stays a single fast pass instead of a large
    Python-side frame diff.
    """
    fps = float(fps or 24)
    threshold = max(0.05, min(0.95, float(threshold or 0.3)))
    cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "info",
        "-i", str(path),
        "-vf", f"select='gt(scene,{threshold})',metadata=print:file=-",
        "-an", "-f", "null", "-",
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, timeout=300)
    except Exception as e:
        return {"ok": False, "error": f"scene detection failed: {e}"}

    # metadata=print:file=- writes to stdout; ffmpeg's own log goes to stderr.
    text = proc.stdout.decode("utf-8", errors="ignore")
    frames: list[int] = []
    for m in _PTS_TIME_RE.finditer(text):
        try:
            t = float(m.group(1))
        except Exception:
            continue
        f = int(round(t * fps))
        # pts_time 0 is the first frame, not a cut *into* a new shot.
        if f > 0 and (not frames or f - frames[-1] >= 2):
            frames.append(f)
    return {"ok": True, "frames": frames, "threshold": threshold}


def _decode_mono_f32(path: Path, sr: int = 22050) -> np.ndarray | None:
    cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "error",
        "-i", str(path), "-vn", "-ac", "1", "-ar", str(sr),
        "-f", "f32le", "pipe:1",
    ]
    try:
        raw = subprocess.check_output(cmd, stderr=subprocess.STDOUT, timeout=180)
    except Exception:
        return None
    if not raw:
        return None
    return np.frombuffer(raw, dtype=np.float32).copy()


def detect_beats(path: Path, fps: float) -> dict[str, Any]:
    """Beat positions (as timeline frame numbers) and estimated tempo.

    Audio is decoded through ffmpeg and handed to librosa as a raw array
    rather than letting librosa open the file itself - librosa's own loader
    would need audioread/soundfile to handle a video container's audio
    stream, and this install already relies on ffmpeg everywhere else.
    """
    fps = float(fps or 24)
    sr = 22050
    y = _decode_mono_f32(path, sr)
    if y is None or y.size < sr // 2:
        return {"ok": False, "error": "no usable audio stream for beat detection"}
    try:
        import librosa
    except Exception as e:
        return {"ok": False, "error": f"librosa unavailable: {e}"}
    try:
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        beat_times = librosa.frames_to_time(beat_frames, sr=sr)
    except Exception as e:
        return {"ok": False, "error": f"beat tracking failed: {e}"}

    frames = sorted({int(round(float(t) * fps)) for t in beat_times if float(t) >= 0})
    bpm = float(np.atleast_1d(tempo)[0]) if tempo is not None else 0.0
    return {"ok": True, "frames": frames, "bpm": round(bpm, 2)}

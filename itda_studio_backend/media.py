from __future__ import annotations

import json
import mimetypes
import re
import subprocess
import hashlib
import shutil
import time
import wave
from pathlib import Path
from typing import Any

from .paths import ensure_dirs, itda_root, input_dir, output_dir, resolve_under, safe_name

VIDEO_EXT = {".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"}
AUDIO_EXT = {".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg"}
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}


def media_roots(project_name: str) -> list[Path]:
    safe = safe_name(project_name)
    ensure_dirs(safe)
    return [
        itda_root() / "media" / safe,
        itda_root() / "cache" / safe,
        input_dir() / "ITDA_STUDIO-SNAPSHOT",
        output_dir() / "one_itda_studio",
    ]


def classify(path: Path) -> str | None:
    ext = path.suffix.lower()
    if ext in VIDEO_EXT:
        return "video"
    if ext in AUDIO_EXT:
        return "audio"
    if ext in IMAGE_EXT:
        return "image"
    return None


def ffprobe(path: Path) -> dict[str, Any]:
    result: dict[str, Any] = {"fps": None, "duration": None, "total_frames": None, "width": None, "height": None}
    try:
        cmd = [
            "ffprobe", "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=width,height,r_frame_rate,avg_frame_rate,nb_frames,duration",
            "-of", "json", str(path)
        ]
        out = subprocess.check_output(cmd, stderr=subprocess.STDOUT, timeout=10)
        data = json.loads(out.decode("utf-8", errors="ignore"))
        streams = data.get("streams") or []
        if streams:
            s = streams[0]
            result["width"] = s.get("width")
            result["height"] = s.get("height")
            result["duration"] = _float(s.get("duration"))
            fps = _fps(s.get("avg_frame_rate")) or _fps(s.get("r_frame_rate"))
            result["fps"] = fps
            nb = s.get("nb_frames")
            if nb and str(nb).isdigit():
                result["total_frames"] = int(nb)
            elif fps and result["duration"]:
                result["total_frames"] = round(fps * result["duration"])
    except Exception as e:
        result["probe_error"] = str(e)
    return result


def probe_audio_duration(path: Path) -> float | None:
    """Duration in seconds for audio-only files.

    ffprobe(path) above selects stream "v:0" (video), so it finds nothing for
    an audio-only file - duration/total_frames stayed None and the frontend
    silently fell back to a hardcoded 5-second clip length. Container-level
    "format=duration" works for both audio and video files.
    """
    try:
        cmd = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)]
        out = subprocess.check_output(cmd, stderr=subprocess.STDOUT, timeout=10)
        data = json.loads(out.decode("utf-8", errors="ignore"))
        return _float((data.get("format") or {}).get("duration"))
    except Exception:
        return None


def _float(v: Any) -> float | None:
    try:
        return float(v)
    except Exception:
        return None


def _fps(rate: Any) -> float | None:
    try:
        if not rate or rate == "0/0":
            return None
        if "/" in str(rate):
            a, b = str(rate).split("/", 1)
            return float(a) / float(b)
        return float(rate)
    except Exception:
        return None



def make_video_thumbnail(path: Path, project_name: str) -> str | None:
    """Extract frame 0 thumbnail into ComfyUI/input/ITDA/cache/<project>/thumbnails."""
    try:
        safe = safe_name(project_name)
        thumb_dir = itda_root() / "cache" / safe / "thumbnails"
        thumb_dir.mkdir(parents=True, exist_ok=True)
        digest = hashlib.md5(str(path.resolve()).encode("utf-8", errors="ignore")).hexdigest()[:16]
        target = thumb_dir / f"{digest}.jpg"
        if target.exists() and target.stat().st_mtime >= path.stat().st_mtime:
            return str(target)
        cmd = [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", str(path), "-frames:v", "1", "-q:v", "3", str(target)
        ]
        subprocess.check_call(cmd, timeout=15)
        return str(target) if target.exists() else None
    except Exception:
        return None

def scan_media(project_name: str) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    # Media Bin displays only the project media library.
    # Snapshot/cache/output roots are serve-only and must not repopulate Media Bin.
    roots = [itda_root() / "media" / safe_name(project_name)]
    for root in roots:
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if not path.is_file():
                continue
            kind = classify(path)
            if not kind:
                continue
            rel = path.relative_to(root).as_posix()
            item = {
                "id": f"{root.name}:{rel}",
                "name": path.name,
                "kind": kind,
                "path": str(path),
                "root": str(root),
                "relative": rel,
                "size": path.stat().st_size,
                "mime": mimetypes.guess_type(path.name)[0],
            }
            if kind == "video":
                item.update(ffprobe(path))
                thumb = make_video_thumbnail(path, project_name)
                if thumb:
                    item["thumb_path"] = thumb
                    item["thumb_url"] = f"/itda/api/file?path={thumb}&project={safe_name(project_name)}"
            elif kind == "audio":
                item["duration"] = probe_audio_duration(path)
            items.append(item)
    return items



def _waveform_cache_path(path: Path, project_name: str, bars: int) -> Path:
    safe = safe_name(project_name)
    wave_dir = itda_root() / "cache" / safe / "waveforms"
    wave_dir.mkdir(parents=True, exist_ok=True)
    digest = hashlib.md5(str(path.resolve()).encode("utf-8", errors="ignore")).hexdigest()[:16]
    return wave_dir / f"{digest}_{int(bars)}.wave.json"


def make_audio_waveform(path: Path, project_name: str, bars: int = 240) -> dict[str, Any] | None:
    """Create a real peak waveform cache from the media audio stream.

    Uses ffmpeg to decode the first audio stream to mono signed 16-bit PCM.
    The returned peaks are normalized 0..1 values. No random/fake data is generated.
    """
    try:
        bars = max(24, min(1200, int(bars or 240)))
        cache = _waveform_cache_path(path, project_name, bars)
        if cache.exists() and cache.stat().st_mtime >= path.stat().st_mtime:
            try:
                return json.loads(cache.read_text(encoding="utf-8"))
            except Exception:
                pass

        cmd = [
            "ffmpeg", "-hide_banner", "-loglevel", "error",
            "-i", str(path),
            "-vn", "-ac", "1", "-ar", "8000", "-f", "s16le", "pipe:1",
        ]
        raw = subprocess.check_output(cmd, stderr=subprocess.STDOUT, timeout=45)
        if not raw:
            return None

        sample_count = len(raw) // 2
        if sample_count <= 0:
            return None

        # Convert bytes to signed 16-bit integers without external dependencies.
        import array
        samples = array.array("h")
        samples.frombytes(raw[:sample_count * 2])
        if hasattr(samples, "byteswap") and __import__('sys').byteorder != 'little':
            samples.byteswap()

        window = max(1, sample_count // bars)
        peaks: list[float] = []
        for i in range(bars):
            start = i * window
            end = sample_count if i == bars - 1 else min(sample_count, start + window)
            if start >= sample_count:
                peaks.append(0.0)
                continue
            peak = 0
            # Sample every point for accuracy at this reduced 8kHz stream.
            for v in samples[start:end]:
                av = abs(int(v))
                if av > peak:
                    peak = av
            peaks.append(round(min(1.0, peak / 32768.0), 4))

        meta = ffprobe(path)
        data = {
            "ok": True,
            "path": str(path),
            "bars": bars,
            "sample_rate": 8000,
            "duration": meta.get("duration"),
            "peaks": peaks,
            "cache_path": str(cache),
            "source_mtime": path.stat().st_mtime,
        }
        cache.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        return data
    except Exception as e:
        return {"ok": False, "error": str(e), "peaks": []}


def extract_video_frame(path: Path, project_name: str, source_frame: int, fps: float | None = None) -> str | None:
    """Extract an original video frame for ITDA snapshot.

    source_frame is the clip source-frame index, already calculated by the frontend:
    timeline_frame - clip.start + clip.source_in.
    """
    try:
        safe = safe_name(project_name)
        snap_dir = input_dir() / "ITDA_STUDIO-SNAPSHOT"
        snap_dir.mkdir(parents=True, exist_ok=True)
        stem = f"snapshot_{safe}_{path.stem}_f{max(0, int(source_frame)):06d}"
        target = snap_dir / f"{stem}.png"
        i = 1
        while target.exists():
            target = snap_dir / f"{stem}_{i}.png"
            i += 1
        # Prefer frame-accurate frame selection over viewport capture.
        n = max(0, int(source_frame))
        cmd = [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", str(path),
            "-vf", f"select=eq(n\\,{n})",
            "-vsync", "0", "-frames:v", "1", str(target)
        ]
        try:
            subprocess.check_call(cmd, timeout=30)
        except Exception:
            # Fallback by timestamp for codecs where select frame extraction fails.
            meta = ffprobe(path)
            use_fps = fps or meta.get("fps") or 24
            sec = n / float(use_fps)
            cmd = [
                "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                "-ss", f"{sec:.6f}", "-i", str(path),
                "-frames:v", "1", str(target)
            ]
            subprocess.check_call(cmd, timeout=30)
        return str(target) if target.exists() else None
    except Exception:
        return None


def _render_send_clip(
    path: Path, kind: str, source_in: int, source_out: int, fps: float | None,
    dest_dir: Path, stem: str,
) -> Path:
    """Trims `path` to the given source range (or grabs one frame, for
    images) into `dest_dir/{stem}.<ext>` - the rendering step shared by both
    ways of getting a clip to ComfyUI: writing straight into its input folder
    (same-process custom-node mode) or handing the file to its /upload/image
    endpoint (standalone mode, no shared filesystem)."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    if kind == "image":
        target = dest_dir / f"{stem}.png"
        try:
            subprocess.check_call(
                ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(path), "-frames:v", "1", str(target)],
                timeout=20,
            )
        except Exception:
            shutil.copy2(path, target)
    elif kind in ("video", "audio"):
        use_fps = float(fps) if fps else (ffprobe(path).get("fps") or 24)
        start_sec = max(0.0, float(source_in or 0) / use_fps)
        dur_sec = max(1.0 / use_fps, (float(source_out or 0) - float(source_in or 0)) / use_fps)
        if kind == "video":
            target = dest_dir / f"{stem}.mp4"
            cmd = [
                "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                "-ss", f"{start_sec:.6f}", "-i", str(path), "-t", f"{dur_sec:.6f}",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
                "-c:a", "aac", str(target),
            ]
        else:
            target = dest_dir / f"{stem}.wav"
            cmd = [
                "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                "-ss", f"{start_sec:.6f}", "-i", str(path), "-t", f"{dur_sec:.6f}", str(target),
            ]
        subprocess.check_call(cmd, timeout=120)
    else:
        raise ValueError(f"unsupported kind: {kind}")
    if not target.exists():
        raise RuntimeError("export produced no file")
    return target


def export_clip_for_comfy(
    path: Path,
    project_name: str,
    kind: str,
    source_in: int,
    source_out: int,
    fps: float | None,
    name: str,
) -> dict[str, Any]:
    """Export a trimmed clip/frame into ComfyUI/input/ITDA/send for core LoadImage/LoadVideo nodes.

    Same-process path only - this writes directly into ComfyUI's own input
    directory, which only means something when ITDA is running inside
    ComfyUI (folder_paths pointed at the real thing). A standalone instance
    has no such shared folder; use send_clip_to_comfy_http for that case.

    Returns a dict with "relative" (path relative to the ComfyUI input dir, in
    "subfolder/filename" form accepted by folder_paths.get_annotated_filepath)
    on success, or an "error" key on failure.
    """
    try:
        safe = safe_name(project_name)
        send_dir = input_dir() / "ITDA_STUDIO" / "send" / safe
        stem = f"{safe_name(name or path.stem)}_{time.strftime('%Y%m%d_%H%M%S')}"
        target = _render_send_clip(path, kind, source_in, source_out, fps, send_dir, stem)
        rel = target.relative_to(input_dir()).as_posix()
        return {"path": str(target), "relative": rel, "kind": kind}
    except Exception as e:
        return {"error": str(e)}


_ALLOWED_COMFY_UPLOAD_TYPES = {"input", "output", "temp"}


def _post_multipart_file(url: str, file_path: Path, fields: dict[str, str], timeout: float = 120.0) -> dict[str, Any]:
    """Minimal multipart/form-data POST with no extra dependency - the repo
    already needs aiohttp for the server side, but aiohttp's client isn't a
    natural fit for a plain blocking function called through the same
    _offload() executor pattern every other ffmpeg-shelling call here uses."""
    import urllib.error
    import urllib.request
    import uuid

    boundary = uuid.uuid4().hex
    parts: list[bytes] = []
    for key, value in fields.items():
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode("utf-8"))
    content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
    parts.append(
        f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="{file_path.name}"\r\n'
        f'Content-Type: {content_type}\r\n\r\n'.encode("utf-8")
    )
    parts.append(file_path.read_bytes())
    parts.append(f'\r\n--{boundary}--\r\n'.encode("utf-8"))
    body = b"".join(parts)

    req = urllib.request.Request(url, data=body, method="POST", headers={
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "Content-Length": str(len(body)),
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"ComfyUI rejected the upload ({e.code}): {e.read().decode('utf-8', errors='replace')[:300]}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"could not reach ComfyUI at {url}: {e.reason}") from e


def send_clip_to_comfy_http(
    path: Path,
    comfy_url: str,
    project_name: str,
    kind: str,
    source_in: int,
    source_out: int,
    fps: float | None,
    name: str,
    target_type: str = "output",
) -> dict[str, Any]:
    """Standalone-mode counterpart to export_clip_for_comfy: renders the same
    trimmed clip/frame, but into ITDA's own cache (there is no shared input
    folder to write into), then hands it to a running ComfyUI instance over
    its own POST /upload/image endpoint - the same endpoint ComfyUI's web UI
    and nodes like VideoHelperSuite already use to upload files, and which
    accepts any file despite the "image" name.

    `target_type` selects which of ComfyUI's own managed folders receives it
    (input/output/temp - see ComfyUI's server.py get_dir_by_type); anything
    else is rejected before it ever reaches the network call, rather than
    forwarding an arbitrary value into a request that controls where another
    process writes a file.

    Every path ITDA touches here is one it rendered itself into its own
    cache dir; the project name only ever contributes a sanitized subfolder
    string (safe_name already strips traversal characters), and the actual
    save-path containment check happens again, independently, on ComfyUI's
    side (image_upload rejects anything that resolves outside its own
    upload_dir) - so a compromised or hand-edited project file can't turn
    this into writing outside ComfyUI's own folders even if this sanitizing
    were somehow bypassed.
    """
    if not isinstance(comfy_url, str) or not re.match(r"^https?://[^\s/]+", comfy_url):
        return {"error": "comfy_url must be a valid http:// or https:// address"}
    if target_type not in _ALLOWED_COMFY_UPLOAD_TYPES:
        target_type = "output"

    safe = safe_name(project_name)
    try:
        stage_dir = itda_root() / "cache" / safe / "send_staging"
        stem = f"{safe_name(name or path.stem)}_{time.strftime('%Y%m%d_%H%M%S')}"
        target = _render_send_clip(path, kind, source_in, source_out, fps, stage_dir, stem)
    except Exception as e:
        return {"error": str(e)}

    subfolder = f"ITDA/send/{safe}"
    try:
        result = _post_multipart_file(
            comfy_url.rstrip("/") + "/upload/image", target,
            {"subfolder": subfolder, "type": target_type, "overwrite": "true"},
        )
    except Exception as e:
        return {"error": str(e)}

    return {
        "path": str(target), "kind": kind,
        "comfy_name": result.get("name"),
        "comfy_subfolder": result.get("subfolder", subfolder),
        "comfy_type": result.get("type", target_type),
    }


def extract_image_snapshot(path: Path, project_name: str) -> str | None:
    try:
        safe = safe_name(project_name)
        snap_dir = input_dir() / "ITDA_STUDIO-SNAPSHOT"
        snap_dir.mkdir(parents=True, exist_ok=True)
        stem = f"snapshot_{safe}_{path.stem}"
        target = snap_dir / f"{stem}.png"
        i = 1
        while target.exists():
            target = snap_dir / f"{stem}_{i}.png"
            i += 1
        # Normalize to PNG with ffmpeg when possible; fallback to copy.
        try:
            subprocess.check_call(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(path), "-frames:v", "1", str(target)], timeout=20)
        except Exception:
            shutil.copy2(path, target)
        return str(target) if target.exists() else None
    except Exception:
        return None

from __future__ import annotations

import json
import subprocess
import time
from pathlib import Path
from typing import Any

from .paths import gallery_dir, safe_name
from .project import load_project
from .export import export_timeline


def _manifest_file() -> Path:
    return gallery_dir() / "gallery_manifest.json"


def _load_manifest() -> list[dict[str, Any]]:
    p = _manifest_file()
    if not p.exists():
        return []
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _save_manifest(items: list[dict[str, Any]]) -> None:
    p = _manifest_file()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(items, indent=2), encoding="utf-8")


def _make_thumbnail(video_path: Path) -> str | None:
    try:
        thumb_dir = gallery_dir() / "thumbnails"
        thumb_dir.mkdir(parents=True, exist_ok=True)
        target = thumb_dir / f"{video_path.stem}.jpg"
        cmd = [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", str(video_path), "-frames:v", "1", "-q:v", "3", str(target),
        ]
        subprocess.check_call(cmd, timeout=15)
        return str(target) if target.exists() else None
    except Exception:
        return None


def _media_filenames_used(project: dict[str, Any]) -> list[str]:
    """Every distinct media-pool file this render actually drew from, by basename,
    in first-use order. A composited multi-clip render has no single "prompt" the
    way an H3/generation node does, so this list stands in for it in the meta
    sidecar — same slot, same purpose (a reader ID's what a clip was built from).
    """
    names: list[str] = []
    seen: set[str] = set()

    def visit(c: dict[str, Any]) -> None:
        path = c.get("path")
        if path:
            base = Path(str(path)).name
            if base not in seen:
                seen.add(base)
                names.append(base)
        for ch in (c.get("children") or []):
            if isinstance(ch, dict):
                visit(ch)

    for c in (project.get("clips") or []):
        if isinstance(c, dict):
            visit(c)
    return names


def render_project_to_gallery(project_name: str, mode: str = "video_audio") -> dict[str, Any]:
    """Renders the WHOLE current timeline (same compositing path as Export)
    into the gallery folder instead of the project's own output folder, and
    registers it in gallery_manifest.json so it shows up in the Gallery
    picker — reusing a rendered timeline as a media source, the same way an
    H3/MusicMaker render can already be pulled back in via the gallery
    pickers. User: "랜더링 버튼을 상단 우측끝에 만들고 누르면 타임라인를
    랜더링해서 갤러리에 등록하는 걸로 해줘야됨."

    mode: "video_audio" | "video_only" | "audio_only" — user: "랜더는 3가지 타입으로
    만들어줘." An audio_only render has no video stream at all, so it gets no frame
    thumbnail either; the gallery shows a generic "Audio" placeholder for those instead.
    User: "갤러리에 오디오만 내보내기 한거는 영상대신 Audio라고 썸네일 이미지만 보이고
    재생되게 하면 되고."
    """
    safe = safe_name(project_name)
    project = load_project(safe)
    stem = f"{safe}_{time.strftime('%Y%m%d_%H%M%S')}"
    manifest = export_timeline(safe, project, fmt="mp4", out_dir=gallery_dir(), stem=stem, write_manifest=False, mode=mode)
    video_path = Path(manifest["path"])
    thumb = _make_thumbnail(video_path) if manifest.get("has_video") else None
    fps = manifest.get("fps") or 24
    total_frames = manifest.get("total_frames") or 0
    media_used = _media_filenames_used(project)

    # Meta sidecar in the SAME shape/location every other ONE STUDIO gallery already reads
    # (metaForVideo() in one_node_minimax_h3.js, _write_json_meta/_read_json_meta/
    # _meta_path in nodes.py) — so this gallery can later share that same gallery UI
    # component instead of staying a separate implementation. User: "이거 영상 랜더링해서
    # 저장될때 메타 저장되야되... 미니맥스와 동일하게 단 프롬포트는 여러개라 안되니까 프롬포트
    # 부분에 사용한 미디어풀 파일명 리스트를 대신 기입하는걸로... 나중에 우리 이거 미니맥스에
    # 심을수 있어." No single "prompt" exists for a composited multi-clip timeline, so the
    # `prompt` field carries the media filenames used instead — same slot, same "what was
    # this built from" purpose. H3-only generation params (steps/sampler/seed/...) are
    # simply absent rather than null-filled, since they never applied here; a shared
    # gallery reader should treat their absence as "not an H3 clip".
    #
    # The sidecar path itself must match nodes.py's real convention exactly, not just look
    # similar — _meta_path() in nodes.py writes to a sibling "metadata/" folder as
    # "<stem>.json" (NOT "<video>.meta.json" next to the file, which was this file's
    # original, non-matching guess). Matching it exactly is what makes "만약에 미니맥스
    # 갤러리 경로에 보내도 인식되도록" true: a gallery file copied into H3's own output
    # folder is picked up by H3's _read_json_meta the same way an H3-rendered clip's own
    # sidecar is.
    meta = {
        "v": 1,
        "node": "itda_studio",
        "prompt": ", ".join(media_used),
        "media_used": media_used,
        "w": manifest.get("width"),
        "h": manifest.get("height"),
        "frames": total_frames,
        "fps": fps,
        "has_audio": manifest.get("has_audio", False),
        "has_video": manifest.get("has_video", True),
        "mode": mode,
        "project": safe,
        "created": int(time.time() * 1000),
    }
    try:
        meta_dir = video_path.parent / "metadata"
        meta_dir.mkdir(parents=True, exist_ok=True)
        (meta_dir / f"{video_path.stem}.json").write_text(
            json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    except Exception:
        pass

    entry = {
        "id": stem,
        "project": safe,
        "filename": video_path.name,
        "path": str(video_path),
        "thumb": thumb,
        "mode": mode,
        "has_video": manifest.get("has_video", True),
        "has_audio": manifest.get("has_audio", False),
        "created_at": time.time(),
        "fps": fps,
        "total_frames": total_frames,
        "duration_sec": (total_frames / fps) if fps else 0,
        "meta": meta,
    }
    items = _load_manifest()
    items.insert(0, entry)
    _save_manifest(items)
    return entry


def _read_meta_sidecar(video_path: Path) -> dict[str, Any]:
    """Same lookup nodes.py's _read_json_meta/_meta_path use for a video: a sibling
    "metadata/<stem>.json" sidecar, falling back to the legacy flat "<stem>.json"
    beside the file. Kept as a tiny standalone reader here (rather than importing
    nodes.py, a much heavier module) since ITDA's own writer (render_project_to_gallery
    above) now targets that exact same path."""
    stem = video_path.stem
    for mp in (video_path.parent / "metadata" / f"{stem}.json", video_path.parent / f"{stem}.json"):
        if mp.is_file():
            try:
                data = json.loads(mp.read_text(encoding="utf-8"))
                if isinstance(data, dict):
                    return data
            except Exception:
                pass
    return {}


def _scan_shared_folder_videos() -> list[dict[str, Any]]:
    """Video files sitting directly in the (now-shared) gallery folder that ITDA's
    OWN manifest doesn't know about — i.e. clips MiniMax H3 itself rendered into this
    folder. User: "서로 영상을 저장하는 패밀리 노드 이기 때문에 갤러리와 메타 정보는
    서로 공유가 되야 맞는것 같아." Same extension set nodes.py's own
    `/minimax_h3_one/videos` route globs (mp4/webm/mkv/mov), so nothing that node's own
    gallery would show gets missed here. A file with no readable meta sidecar is
    skipped rather than surfaced with blank info — this only started sharing H3's
    default output folder as of this change, so an untagged stray video is more likely
    leftover scratch output than a real family-node render.
    """
    d = gallery_dir()
    found: list[Path] = []
    for ext in ("*.mp4", "*.webm", "*.mkv", "*.mov"):
        found += d.glob(f"**/{ext}")
    out = []
    for vp in found:
        # Skip this gallery's own thumbnail cache and any nested "metadata" sidecar dir.
        if "thumbnails" in vp.parts or "metadata" in vp.parts:
            continue
        meta = _read_meta_sidecar(vp)
        if not meta:
            continue
        out.append({"path": vp, "meta": meta})
    return out


def list_gallery() -> list[dict[str, Any]]:
    # Drop entries whose file was deleted out-of-band instead of surfacing a
    # dead thumbnail the user can click but never actually play.
    items = _load_manifest()
    alive = [it for it in items if Path(it.get("path", "")).is_file()]
    if len(alive) != len(items):
        _save_manifest(alive)

    known = {str(Path(it["path"]).resolve()) for it in alive if it.get("path")}
    extra: list[dict[str, Any]] = []
    for row in _scan_shared_folder_videos():
        vp: Path = row["path"]
        if str(vp.resolve()) in known:
            continue
        meta = row["meta"]
        try:
            stat = vp.stat()
        except OSError:
            continue
        fps = meta.get("fps") or 24
        frames = meta.get("frames") or 0
        thumb = None
        try:
            cand = gallery_dir() / "thumbnails" / f"{vp.stem}.jpg"
            thumb = str(cand) if cand.is_file() else _make_thumbnail(vp)
        except Exception:
            thumb = None
        extra.append({
            "id": f"h3_{vp.stem}",
            "project": meta.get("project") or "minimax_h3",
            "filename": vp.name,
            "path": str(vp),
            "thumb": thumb,
            "mode": meta.get("mode") or "video_audio",
            "has_video": True,
            "has_audio": bool(meta.get("has_audio", True)),
            "created_at": stat.st_mtime,
            "fps": fps,
            "total_frames": frames,
            "duration_sec": (frames / fps) if fps else 0,
            "meta": meta,
        })

    combined = alive + extra
    combined.sort(key=lambda it: it.get("created_at", 0), reverse=True)
    return combined


def import_gallery_item(item_id: str, project_name: str) -> str:
    """Copies a gallery render into a project's own media folder, same as picking a clip
    from the H3/MusicMaker gallery pickers — reusing a rendered timeline as a media
    source. Gallery files aren't necessarily under ComfyUI's standard output dir (the
    gallery path is user-configurable), so this can't reuse the folder_paths-based
    /itda_studio_one/media/from_gallery route; it copies straight from the manifest's own
    absolute path instead.
    """
    import shutil
    from .paths import ensure_dirs, itda_root
    from .media import classify, make_video_thumbnail

    items = _load_manifest()
    entry = next((it for it in items if it.get("id") == item_id), None)
    if not entry:
        # Not an ITDA-written manifest entry — try the shared-folder scan (an H3-native
        # clip, id "h3_<stem>"; see _scan_shared_folder_videos / list_gallery above).
        entry = next((it for it in list_gallery() if it.get("id") == item_id), None)
    if not entry:
        raise FileNotFoundError(f"gallery item not found: {item_id}")
    src = Path(entry["path"])
    if not src.is_file():
        raise FileNotFoundError(f"gallery file missing on disk: {src}")

    safe = safe_name(project_name)
    ensure_dirs(safe)
    dest_dir = itda_root() / "media" / safe
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / src.name
    i = 1
    while dest.exists():
        dest = dest_dir / f"{src.stem}_{i}{src.suffix}"
        i += 1
    shutil.copy2(src, dest)
    if classify(dest) == "video":
        try:
            make_video_thumbnail(dest, safe)
        except Exception:
            pass
    return str(dest)


def delete_gallery_item(item_id: str) -> bool:
    items = _load_manifest()
    keep = []
    removed = False
    for it in items:
        if it.get("id") == item_id:
            removed = True
            try:
                Path(it["path"]).unlink(missing_ok=True)
                if it.get("thumb"):
                    Path(it["thumb"]).unlink(missing_ok=True)
            except Exception:
                pass
        else:
            keep.append(it)
    if removed:
        _save_manifest(keep)
        return True

    # An H3-native clip (id "h3_<stem>", not in ITDA's own manifest) — the gallery is
    # shared now, so deleting it from ITDA's gallery UI deletes the real family-node
    # file too, same as deleting it from H3's own gallery would. No manifest entry to
    # remove; just the file (+ its meta sidecar and any cached thumbnail).
    entry = next((it for it in list_gallery() if it.get("id") == item_id), None)
    if not entry:
        return False
    try:
        src = Path(entry["path"])
        src.unlink(missing_ok=True)
        (src.parent / "metadata" / f"{src.stem}.json").unlink(missing_ok=True)
        if entry.get("thumb"):
            Path(entry["thumb"]).unlink(missing_ok=True)
    except Exception:
        pass
    return True

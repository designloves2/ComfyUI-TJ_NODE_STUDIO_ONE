from __future__ import annotations

import asyncio
import functools
from pathlib import Path
import time
import shutil
from aiohttp import web

from .media import scan_media, ffprobe, media_roots, classify, make_video_thumbnail, make_audio_waveform, extract_video_frame, extract_image_snapshot, export_clip_for_comfy, send_clip_to_comfy_http
from .paths import ensure_dirs, is_contained, web_root, safe_name, itda_root, input_dir, project_file
from .project import load_project, save_project, default_project
from .export import export_timeline, prerender_range, ExportError
from .stitch import analyze_stitch, render_bridge
from .analyze import detect_scenes, detect_beats

ITDA_VERSION = "1.0.0"

_REGISTERED = False


async def _offload(fn, *args, **kwargs):
    """Run a blocking ffmpeg/analysis call off the event loop.

    These handlers shell out to ffmpeg for anything from a few seconds
    (waveform) to half an hour (a long export). Called directly from an async
    handler that stalls the whole aiohttp loop for the duration - which is
    ComfyUI's loop, not just ITDA's, so an export would freeze the entire UI,
    queue included.
    """
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, functools.partial(fn, *args, **kwargs))


def _is_allowed_media_path(path: Path, project: str = "project") -> bool:
    return is_contained(path, media_roots(project))



def fonts_root() -> Path:
    root = Path(__file__).resolve().parents[1] / "Fonts"
    root.mkdir(parents=True, exist_ok=True)
    return root


_FONT_EXTS = {".ttf", ".otf", ".woff", ".woff2"}


def _font_format(path: Path) -> str:
    ext = path.suffix.lower()
    if ext == ".otf":
        return "opentype"
    if ext == ".woff":
        return "woff"
    if ext == ".woff2":
        return "woff2"
    return "truetype"


def project_file_exists(name: str) -> bool:
    from .paths import project_file
    return project_file(name).exists()

def register_itda_studio_routes(routes=None) -> None:
    """Registers every /itda_studio_one/* route onto `routes`.

    `routes` defaults to ComfyUI's shared PromptServer route table (the
    custom-node entrypoint); a standalone entrypoint can instead pass its own
    aiohttp.web.RouteTableDef() so this same ~450-line route body serves both
    without duplication - the ComfyUI coupling was always just this one
    lookup, not anything below it.
    """
    global _REGISTERED
    if _REGISTERED:
        return
    if routes is None:
        try:
            from server import PromptServer
        except Exception as e:
            print(f"[ITDA_STUDIO] PromptServer unavailable: {e}")
            return
        routes = PromptServer.instance.routes

    # ITDA's HTML/JS/CSS are under active development and served with no
    # explicit cache headers by default, so browsers were free to reuse old
    # cached copies indefinitely (heuristic caching) - most visibly inside
    # the ComfyUI in-graph preview node's <iframe>, which has no user-facing
    # "hard refresh" gesture the way a normal browser tab does. Force
    # revalidation on every request so edits always show up.
    _NO_CACHE_HEADERS = {"Cache-Control": "no-cache, must-revalidate"}

    @routes.get("/itda_studio_one/editor")
    async def editor(request):
        return web.FileResponse(web_root() / "index.html", headers=_NO_CACHE_HEADERS)

    @routes.get("/itda_studio_one/web/{filename:.*}")
    async def web_file(request):
        filename = request.match_info.get("filename", "")
        target = (web_root() / filename).resolve()
        root = web_root().resolve()
        if target != root and root not in target.parents:
            raise web.HTTPForbidden(text="Path traversal blocked")
        if not target.exists() or not target.is_file():
            raise web.HTTPNotFound()
        return web.FileResponse(target, headers=_NO_CACHE_HEADERS)


    @routes.get("/itda_studio_one/api/fonts")
    async def list_fonts(request):
        root = fonts_root().resolve()
        items = []
        for path in sorted(root.iterdir()):
            if path.is_file() and path.suffix.lower() in _FONT_EXTS:
                family = path.stem.replace("_", " ").replace("-", " ")
                items.append({
                    "name": path.name,
                    "family": family,
                    "format": _font_format(path),
                    "url": f"/itda_studio_one/fonts/{path.name}",
                })
        return web.json_response({"ok": True, "items": items})

    @routes.get("/itda_studio_one/fonts/{filename:.*}")
    async def font_file(request):
        filename = request.match_info.get("filename", "")
        target = (fonts_root() / filename).resolve()
        root = fonts_root().resolve()
        if target != root and root not in target.parents:
            raise web.HTTPForbidden(text="Path traversal blocked")
        if not target.exists() or not target.is_file() or target.suffix.lower() not in _FONT_EXTS:
            raise web.HTTPNotFound()
        return web.FileResponse(target)

    @routes.get("/itda_studio_one/api/file")
    async def media_file(request):
        raw = request.query.get("path", "")
        project = safe_name(request.query.get("project", "project"))
        if not raw:
            raise web.HTTPBadRequest(text="path required")
        target = Path(raw).resolve()
        if not _is_allowed_media_path(target, project):
            # fallback allows files scanned under the default project roots
            if not _is_allowed_media_path(target, "project"):
                raise web.HTTPForbidden(text="Media path not allowed")
        if not target.exists() or not target.is_file():
            raise web.HTTPNotFound()
        return web.FileResponse(target)

    @routes.get("/itda_studio_one/api/health")
    async def health(request):
        return web.json_response({"ok": True, "name": "ITDA", "version": ITDA_VERSION})

    @routes.post("/itda_studio_one/api/init")
    async def init_project(request):
        body = await request.json()
        name = safe_name(body.get("project") or "project")
        ensure_dirs(name)
        data = load_project(name)
        return web.json_response({"ok": True, "project": data})

    @routes.get("/itda_studio_one/api/project/{name}")
    async def get_project(request):
        data = load_project(request.match_info["name"])
        return web.json_response({"ok": True, "project": data})

    @routes.post("/itda_studio_one/api/project/{name}")
    async def post_project(request):
        body = await request.json()
        result = save_project(request.match_info["name"], body)
        return web.json_response(result)

    @routes.get("/itda_studio_one/api/media/{project}")
    async def get_media(request):
        project = safe_name(request.match_info["project"])
        return web.json_response({"ok": True, "items": scan_media(project)})


    @routes.post("/itda_studio_one/api/waveform")
    async def waveform(request):
        body = await request.json()
        project = safe_name(body.get("project", "project"))
        raw = body.get("path", "")
        bars = int(body.get("bars", 240) or 240)
        if not raw:
            raise web.HTTPBadRequest(text="path required")
        target = Path(raw).resolve()
        if not _is_allowed_media_path(target, project):
            raise web.HTTPForbidden(text="Media path not allowed")
        if not target.exists() or not target.is_file():
            raise web.HTTPNotFound()
        kind = classify(target)
        if kind not in {"video", "audio"}:
            raise web.HTTPBadRequest(text="waveform requires video or audio media")
        data = await _offload(make_audio_waveform, target, project, bars)
        if not data or not data.get("ok"):
            return web.json_response(data or {"ok": False, "peaks": []}, status=200)
        return web.json_response(data)

    @routes.post("/itda_studio_one/api/stitch_analyze")
    async def stitch_analyze(request):
        body = await request.json()
        project = safe_name(body.get("project", "project"))
        path_a = Path(body.get("path_a", "")).resolve()
        path_b = Path(body.get("path_b", "")).resolve()
        if not str(path_a) or not str(path_b):
            raise web.HTTPBadRequest(text="path_a and path_b required")
        if not _is_allowed_media_path(path_a, project) or not _is_allowed_media_path(path_b, project):
            raise web.HTTPForbidden(text="Media path not allowed")
        if not path_a.exists() or not path_b.exists():
            raise web.HTTPNotFound()
        source_out_a = int(body.get("source_out_a", 0) or 0)
        source_in_b = int(body.get("source_in_b", 0) or 0)
        fps = float(body.get("fps", 24) or 24)
        window_sec = float(body.get("window_sec", 2.0) or 2.0)
        data = await _offload(analyze_stitch, path_a, source_out_a, path_b, source_in_b, fps, window_sec)
        return web.json_response(data)

    @routes.post("/itda_studio_one/api/stitch_bridge")
    async def stitch_bridge(request):
        body = await request.json()
        project = safe_name(body.get("project", "project"))
        path_a = Path(body.get("path_a", "")).resolve()
        path_b = Path(body.get("path_b", "")).resolve()
        if not str(path_a) or not str(path_b):
            raise web.HTTPBadRequest(text="path_a and path_b required")
        if not _is_allowed_media_path(path_a, project) or not _is_allowed_media_path(path_b, project):
            raise web.HTTPForbidden(text="Media path not allowed")
        if not path_a.exists() or not path_b.exists():
            raise web.HTTPNotFound()
        frame_a = int(body.get("frame_a", 0) or 0)
        frame_b = int(body.get("frame_b", 0) or 0)
        fps = float(body.get("fps", 24) or 24)
        mode = body.get("mode", "interpolate")
        if mode not in ("interpolate", "crossfade"):
            raise web.HTTPBadRequest(text="mode must be interpolate or crossfade")
        num_frames = int(body.get("num_frames", 6) or 6)
        dirs = ensure_dirs(project)
        out_path = Path(dirs["cache"]) / f"bridge_{int(time.time() * 1000)}.mp4"
        data = await _offload(render_bridge, path_a, frame_a, path_b, frame_b, fps, out_path, mode, num_frames)
        return web.json_response(data)

    def _resolve_media_arg(body, project, key="path", kinds=None):
        raw = body.get(key, "")
        if not raw:
            raise web.HTTPBadRequest(text=f"{key} required")
        target = Path(raw).resolve()
        if not _is_allowed_media_path(target, project):
            raise web.HTTPForbidden(text="Media path not allowed")
        if not target.exists() or not target.is_file():
            raise web.HTTPNotFound()
        if kinds and classify(target) not in kinds:
            raise web.HTTPBadRequest(text=f"requires {'/'.join(sorted(kinds))} media")
        return target

    @routes.post("/itda_studio_one/api/scene_detect")
    async def scene_detect(request):
        body = await request.json()
        project = safe_name(body.get("project", "project"))
        target = _resolve_media_arg(body, project, kinds={"video"})
        fps = float(body.get("fps", 24) or 24)
        threshold = float(body.get("threshold", 0.3) or 0.3)
        return web.json_response(await _offload(detect_scenes, target, fps, threshold))

    @routes.post("/itda_studio_one/api/beat_detect")
    async def beat_detect(request):
        body = await request.json()
        project = safe_name(body.get("project", "project"))
        target = _resolve_media_arg(body, project, kinds={"video", "audio"})
        fps = float(body.get("fps", 24) or 24)
        return web.json_response(await _offload(detect_beats, target, fps))

    @routes.post("/itda_studio_one/api/probe")
    async def probe(request):
        body = await request.json()
        path = Path(body.get("path", "")).resolve()
        project = safe_name(body.get("project", "project"))
        if not _is_allowed_media_path(path, project):
            raise web.HTTPForbidden(text="Media path not allowed")
        return web.json_response({"ok": True, "meta": await _offload(ffprobe, path)})


    @routes.post("/itda_studio_one/api/media/upload")
    async def upload_media(request):
        reader = await request.multipart()
        project = "itda-project-1"
        files = []
        async for part in reader:
            if part.name == "project":
                project = safe_name((await part.text()) or project)
                continue
            if part.name != "files" or not part.filename:
                continue
            ensure_dirs(project)
            dest_dir = itda_root() / "media" / project
            dest_dir.mkdir(parents=True, exist_ok=True)
            raw_name = Path(part.filename).name
            base = safe_name(Path(raw_name).stem)
            ext = Path(raw_name).suffix.lower()
            if not ext:
                ext = ".bin"
            dest = dest_dir / f"{base}{ext}"
            i = 1
            while dest.exists():
                dest = dest_dir / f"{base}_{i}{ext}"
                i += 1
            with dest.open("wb") as f:
                while True:
                    chunk = await part.read_chunk()
                    if not chunk:
                        break
                    f.write(chunk)
            kind = classify(dest)
            if not kind:
                dest.unlink(missing_ok=True)
                continue
            if kind == "video":
                make_video_thumbnail(dest, project)
            files.append(str(dest))
        return web.json_response({"ok": True, "items": files})

    @routes.post("/itda_studio_one/api/media/delete")
    async def delete_media(request):
        body = await request.json()
        project = safe_name(body.get("project", "project"))
        raw = body.get("path", "")
        if not raw:
            raise web.HTTPBadRequest(text="path required")
        target = Path(raw).resolve()
        media_root = (itda_root() / "media" / project).resolve()
        if target != media_root and media_root not in target.parents:
            raise web.HTTPForbidden(text="Only input/ITDA/media/<project> files can be deleted")
        if target.exists() and target.is_file():
            target.unlink()
        # Best-effort thumbnail cleanup is handled by cache refresh on next scan.
        return web.json_response({"ok": True})



    @routes.post("/itda_studio_one/api/snapshot_frame")
    async def save_snapshot_frame(request):
        body = await request.json()
        project = safe_name(body.get("project", "itda-project-1"))
        raw = body.get("path", "")
        kind = body.get("kind", "video")
        source_frame = int(body.get("source_frame", 0) or 0)
        source_fps = body.get("source_fps")
        try:
            source_fps = float(source_fps) if source_fps is not None else None
        except Exception:
            source_fps = None
        if not raw:
            raise web.HTTPBadRequest(text="path required")
        target = Path(raw).resolve()
        if not _is_allowed_media_path(target, project):
            raise web.HTTPForbidden(text="Media path not allowed")
        if not target.exists() or not target.is_file():
            raise web.HTTPNotFound()
        if kind == "image":
            saved = await _offload(extract_image_snapshot, target, project)
        else:
            saved = await _offload(extract_video_frame, target, project, source_frame, source_fps)
        if not saved:
            raise web.HTTPInternalServerError(text="snapshot extraction failed")
        return web.json_response({"ok": True, "path": saved, "source_frame": source_frame})

    @routes.post("/itda_studio_one/api/snapshot")
    async def save_snapshot(request):
        reader = await request.multipart()
        project = "itda-project-1"
        image_part = None
        async for part in reader:
            if part.name == "project":
                project = safe_name((await part.text()) or project)
            elif part.name == "image":
                image_part = part
                break
        if image_part is None:
            raise web.HTTPBadRequest(text="image required")
        snap_dir = input_dir() / "ITDA-SNAPSHOT"
        snap_dir.mkdir(parents=True, exist_ok=True)
        stem = f"snapshot_{project}_{time.strftime('%Y%m%d_%H%M%S')}"
        dest = snap_dir / f"{stem}.png"
        i = 1
        while dest.exists():
            dest = snap_dir / f"{stem}_{i}.png"
            i += 1
        with dest.open("wb") as f:
            while True:
                chunk = await image_part.read_chunk()
                if not chunk:
                    break
                f.write(chunk)
        return web.json_response({"ok": True, "path": str(dest)})


    @routes.get("/itda_studio_one/api/projects")
    async def list_projects(request):
        ensure_dirs()
        root = itda_root() / "projects"
        items = []
        for path in sorted(root.glob("*.itda.json")):
            name = path.name[:-len(".itda.json")]
            items.append({"name": name, "path": str(path), "updated_at": int(path.stat().st_mtime)})
        return web.json_response({"ok": True, "items": items})

    @routes.post("/itda_studio_one/api/project/new")
    async def new_project(request):
        body = await request.json()
        base = safe_name(body.get("name") or "itda-project-1")
        name = base
        i = 1
        while project_file_exists(name):
            i += 1
            name = f"{base}-{i}"
        data = default_project(name)
        save_project(name, data)
        ensure_dirs(name)
        return web.json_response({"ok": True, "project": data})

    @routes.post("/itda_studio_one/api/project/duplicate")
    async def duplicate_project(request):
        body = await request.json()
        src = safe_name(body.get("source") or "")
        if not src:
            raise web.HTTPBadRequest(text="source required")
        src_file = project_file(src)
        if not src_file.exists():
            raise web.HTTPNotFound(text="source project not found")
        base = safe_name(body.get("target") or f"{src}-copy")
        target = base
        i = 1
        while project_file_exists(target):
            i += 1
            target = f"{base}-{i}"
        data = load_project(src)
        data["name"] = target
        save_project(target, data)
        src_media = itda_root() / "media" / src
        dst_media = itda_root() / "media" / target
        if src_media.exists() and not dst_media.exists():
            shutil.copytree(src_media, dst_media)
        ensure_dirs(target)
        return web.json_response({"ok": True, "project": target})

    @routes.post("/itda_studio_one/api/project/rename")
    async def rename_project(request):
        body = await request.json()
        src = safe_name(body.get("source") or "")
        target = safe_name(body.get("target") or "")
        if not src or not target:
            raise web.HTTPBadRequest(text="source and target required")
        src_file = project_file(src)
        if not src_file.exists():
            raise web.HTTPNotFound(text="source project not found")
        if src != target and project_file_exists(target):
            raise web.HTTPConflict(text="target project already exists")
        data = load_project(src)
        data["name"] = target
        save_project(target, data)
        if src != target:
            src_file.unlink(missing_ok=True)
            for folder in ("media", "cache"):
                a = itda_root() / folder / src
                b = itda_root() / folder / target
                if a.exists() and not b.exists():
                    a.rename(b)
        ensure_dirs(target)
        return web.json_response({"ok": True, "project": target})

    @routes.post("/itda_studio_one/api/project/delete")
    async def delete_project(request):
        body = await request.json()
        name = safe_name(body.get("project") or "")
        if not name:
            raise web.HTTPBadRequest(text="project required")
        project_file(name).unlink(missing_ok=True)
        for folder in ("media", "cache"):
            target = itda_root() / folder / name
            if target.exists():
                shutil.rmtree(target)
        return web.json_response({"ok": True})

    @routes.post("/itda_studio_one/api/send_to_comfy")
    async def send_to_comfy(request):
        body = await request.json()
        project = safe_name(body.get("project") or "itda-project-1")
        raw = body.get("path", "")
        kind = body.get("kind", "video")
        if not raw:
            raise web.HTTPBadRequest(text="path required")
        target = Path(raw).resolve()
        if not _is_allowed_media_path(target, project):
            raise web.HTTPForbidden(text="Media path not allowed")
        if not target.exists() or not target.is_file():
            raise web.HTTPNotFound()
        comfy_url = (body.get("comfy_url") or "").strip()
        if comfy_url:
            # Standalone mode: no folder shared with ComfyUI, so this goes
            # over ComfyUI's own upload API instead of a local file write.
            result = await _offload(
                send_clip_to_comfy_http,
                target, comfy_url, project, kind,
                int(body.get("source_in", 0) or 0),
                int(body.get("source_out", 0) or 0),
                body.get("fps"),
                body.get("name") or target.stem,
                body.get("comfy_type") or "output",
            )
        else:
            result = await _offload(
                export_clip_for_comfy,
                target, project, kind,
                int(body.get("source_in", 0) or 0),
                int(body.get("source_out", 0) or 0),
                body.get("fps"),
                body.get("name") or target.stem,
            )
        if result.get("error"):
            raise web.HTTPInternalServerError(text=result["error"])
        return web.json_response({"ok": True, **result})

    @routes.post("/itda_studio_one/api/export")
    async def export_project_route(request):
        body = await request.json()
        project = safe_name(body.get("project") or "itda-project-1")
        fmt = body.get("format") or "mp4"
        data = load_project(project)
        try:
            manifest = await _offload(export_timeline, project, data, fmt=fmt)
        except ExportError as e:
            raise web.HTTPInternalServerError(text=str(e))
        return web.json_response(manifest)

    @routes.post("/itda_studio_one/api/prerender")
    async def prerender(request):
        body = await request.json()
        project = safe_name(body.get("project") or "itda-project-1")
        rng = body.get("range") or {}
        start, end = rng.get("start"), rng.get("end")
        if start is None or end is None:
            raise web.HTTPBadRequest(text="Mark an In (I) and Out (O) point first.")
        start, end = int(start), int(end)
        data = load_project(project)
        try:
            manifest = await _offload(prerender_range, project, data, min(start, end), max(start, end))
        except ExportError as e:
            raise web.HTTPInternalServerError(text=str(e))
        return web.json_response(manifest)

    fonts_root()
    _REGISTERED = True
    print("[ITDA_STUDIO] routes registered: /itda_studio_one/*")

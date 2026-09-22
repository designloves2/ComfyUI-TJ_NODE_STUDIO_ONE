from __future__ import annotations

import json
import time
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any

from .paths import project_file, ensure_dirs, safe_name, itda_root

# Written into new project files as their "version" field. Existing projects
# keep whatever version they were saved with (load_project only fills it in
# when absent), so bumping this never rewrites older files.
PROJECT_VERSION = "1.0.0"


def default_project(name: str = "untitled") -> dict[str, Any]:
    now = int(time.time())
    safe = safe_name(name)
    return {
        "schema": "itda.project",
        "version": PROJECT_VERSION,
        "name": safe,
        "created_at": now,
        "updated_at": now,
        "settings": {
            "fps": 24,
            "total_frames": 360,
            "snap": True,
            "preview_mode": "single",
            "loop": False,
            "mute": False,
        },
        "range": {"start": None, "end": None},
        "media": [],
        "clips": [],
        "lanes": [],
    }


def _repair_media_paths(data: dict[str, Any]) -> bool:
    """Rewrite clip/media "path" fields that point at a since-relocated input
    directory (e.g. the --input-directory launch flag changed after the
    project was last saved) so they resolve under the current media root.
    Returns True if anything was rewritten.
    """
    changed = False
    safe = safe_name(data.get("name") or "project")
    media_dir = itda_root() / "media" / safe
    for bucket in (data.get("clips") or [], data.get("media") or []):
        for item in bucket:
            raw = item.get("path")
            if not raw or Path(raw).exists():
                continue
            candidate = media_dir / Path(raw).name
            if candidate.exists():
                item["path"] = str(candidate)
                changed = True
    return changed


def load_project(name: str) -> dict[str, Any]:
    path = project_file(name)
    if not path.exists():
        project = default_project(name)
        save_project(name, project)
        return project
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if _repair_media_paths(data):
        save_project(name, data)
    return data


def save_project(name: str, data: dict[str, Any]) -> dict[str, Any]:
    safe = safe_name(data.get("name") or name)
    data["name"] = safe
    data["version"] = data.get("version") or PROJECT_VERSION
    data["updated_at"] = int(time.time())
    ensure_dirs(safe)
    path = project_file(safe)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.replace(path)
    return {"ok": True, "project": safe, "path": str(path)}

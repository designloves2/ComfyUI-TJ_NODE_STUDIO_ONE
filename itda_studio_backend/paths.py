from __future__ import annotations

import json
import os
from pathlib import Path

try:
    import folder_paths
except Exception:
    folder_paths = None

PACKAGE_ROOT = Path(__file__).resolve().parents[1]


def comfy_base_dir() -> Path:
    if folder_paths is not None:
        return Path(folder_paths.base_path).resolve()
    return PACKAGE_ROOT.resolve()


def _standalone_config_dir(key: str) -> Path | None:
    """Only consulted when folder_paths isn't available (i.e. not running
    inside ComfyUI) - lets a standalone entrypoint point input/output
    elsewhere via env var or itda_config.json, without this fallback ever
    engaging (or mattering) in the ComfyUI-hosted custom-node mode."""
    env = os.environ.get(key)
    if env:
        return Path(env)
    cfg_path = PACKAGE_ROOT / "itda_config.json"
    if cfg_path.exists():
        try:
            val = json.loads(cfg_path.read_text(encoding="utf-8")).get(key)
        except Exception:
            val = None
        if val:
            return Path(val)
    return None


def input_dir() -> Path:
    if folder_paths is not None:
        return Path(folder_paths.get_input_directory()).resolve()
    return (_standalone_config_dir("ITDA_INPUT_DIR") or (comfy_base_dir() / "input")).resolve()


def output_dir() -> Path:
    if folder_paths is not None:
        return Path(folder_paths.get_output_directory()).resolve()
    return (_standalone_config_dir("ITDA_OUTPUT_DIR") or (comfy_base_dir() / "output")).resolve()


def itda_root() -> Path:
    # ITDA_STUDIO, not ITDA — this is our own copy (absorbed, not a dependency on the
    # separate ComfyUI-ITDA node that may also be installed), own storage, own identity.
    return (input_dir() / "ITDA_STUDIO").resolve()


def web_root() -> Path:
    # Unused — this package's frontend is served by ComfyUI-TJ_NODE_STUDIO_ONE's own
    # WEB_DIRECTORY (web/), not a dedicated /itda_studio_one/web/* route.
    return (PACKAGE_ROOT / "web").resolve()


def ensure_dirs(project_name: str | None = None) -> dict[str, str]:
    roots = {
        "input_itda": input_dir() / "ITDA",
        "snapshot": input_dir() / "ITDA_STUDIO-SNAPSHOT",
        "output_itda": output_dir() / "one_itda_studio",
        "projects": itda_root() / "projects",
    }
    if project_name:
        safe = safe_name(project_name)
        roots["media"] = itda_root() / "media" / safe
        roots["cache"] = itda_root() / "cache" / safe
    for p in roots.values():
        p.mkdir(parents=True, exist_ok=True)
    return {k: str(v) for k, v in roots.items()}


def safe_name(name: str) -> str:
    cleaned = "".join(c for c in name.strip() if c.isalnum() or c in "._- ").strip()
    # Stripping separators alone is not enough: "." and ".." contain no
    # separator, so they survive the filter and still mean "this directory"
    # and "the parent directory" once joined onto a root. A project named
    # ".." collapsed the per-project sandbox a level up - media/<project>
    # resolved to the whole ITDA root - which let any project-scoped route
    # (notably media/delete) reach every other project's files.
    if not cleaned or set(cleaned) <= {".", " "}:
        return "untitled"
    return cleaned


def is_contained(target: Path, roots: list[Path]) -> bool:
    """True only if `target` really sits inside one of `roots`.

    .resolve() first, so "..", symlinks and short/long name forms all collapse
    to one canonical path before comparison - the same job os.path.realpath
    does. Containment is then tested against .parents rather than a string
    prefix: "/a/bc" starts with "/a/b" as text but is not inside it, and that
    prefix confusion is the classic way these checks are defeated.
    """
    try:
        resolved = target.resolve()
    except (OSError, ValueError):
        return False
    for root in roots:
        try:
            rroot = root.resolve()
        except (OSError, ValueError):
            continue
        if resolved == rroot or rroot in resolved.parents:
            return True
    return False


def itda_media_roots() -> list[Path]:
    """Every directory ITDA is allowed to read media out of.

    Deliberately not scoped to a single project: a duplicated or hand-edited
    project can legitimately reference another project's media folder. The
    security boundary is "inside the directories ITDA manages", which still
    excludes the entire rest of the disk.
    """
    return [
        itda_root() / "media",
        itda_root() / "cache",
        input_dir() / "ITDA_STUDIO-SNAPSHOT",
        output_dir() / "one_itda_studio",
    ]


def resolve_under(base: Path, *parts: str) -> Path:
    base = base.resolve()
    target = (base / Path(*parts)).resolve()
    if target != base and base not in target.parents:
        raise ValueError("Path traversal blocked")
    return target


def project_file(project_name: str) -> Path:
    ensure_dirs()
    filename = safe_name(project_name)
    if not filename.endswith(".itda.json"):
        filename += ".itda.json"
    return resolve_under(itda_root() / "projects", filename)

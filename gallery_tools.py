# -*- coding: utf-8 -*-
"""Gallery cleanup / folder merge / trash, shared by every ONE STUDIO gallery.

Standalone on purpose (stdlib + optional Pillow / ffmpeg, no ComfyUI imports) so it can be
exercised against a throwaway folder before it is wired to a real gallery.

Layout it understands (same as nodes.py):
  <dir>/<name>.<ext>                       the media
  <dir>/metadata/<stem>.json               its metadata (+ PNGs carry a copy in a tEXt "Comment" chunk)
  <dir>/<stem>.json                        legacy metadata position
  <dir>/metadata/thumbs/<name>.webp        image thumbnail
  <dir>/_thumbs/<name>.jpg                 video thumbnail
  <dir>/covers/<cover>                     music cover art, named by meta["coverImage"]
Everything that is removed goes to the trash folder (restorable); only caches and empty
folders are deleted outright.
"""
import json
import os
import shutil
import struct
import subprocess
import threading
import time
import zlib

IMG_EXTS = (".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp")
VID_EXTS = (".mp4", ".webm", ".mov", ".mkv", ".m4v")
AUD_EXTS = (".mp3", ".wav", ".flac", ".ogg", ".opus", ".m4a")
MEDIA_EXTS = IMG_EXTS + VID_EXTS + AUD_EXTS
# Folders the galleries never list, so cleanup / merge never touch what is inside them.
SKIP_DIRS = {"metadata", "_thumbs", "thumbs", "assets", "pose", "._post_chunks", "covers", "_gallery_trash"}
TMP_SUFFIXES = (".tmp", ".part", ".tjmeta.tmp", ".tagtmp")
THUMB_SIZE = 384
RECENT_SECONDS = 60          # files younger than this may still be being written: left alone
LOCK = threading.RLock()


# ── small path helpers ──────────────────────────────────────────────────────────────

def norm(rel):
    return (rel or "").replace("\\", "/").strip("/")


def is_img(name): return name.lower().endswith(IMG_EXTS)
def is_vid(name): return name.lower().endswith(VID_EXTS)
def is_media(name): return name.lower().endswith(MEDIA_EXTS)


def safe_join(base, rel):
    base_abs = os.path.realpath(base)
    target = os.path.realpath(os.path.join(base_abs, *norm(rel).split("/"))) if norm(rel) else base_abs
    if target != base_abs and not target.startswith(base_abs + os.sep):
        raise ValueError("invalid path")
    return target


def meta_path(media):
    return os.path.join(os.path.dirname(media), "metadata", os.path.splitext(os.path.basename(media))[0] + ".json")


def meta_path_legacy(media):
    return os.path.splitext(media)[0] + ".json"


def thumb_path(media):
    """Where the gallery keeps this media's thumbnail (None for audio)."""
    d, n = os.path.split(media)
    if is_img(n):
        return os.path.join(d, "metadata", "thumbs", n + ".webp")
    if is_vid(n):
        return os.path.join(d, "_thumbs", n + ".jpg")
    return None


def thumb_fresh(src, dst):
    try:
        return os.path.isfile(dst) and os.path.getmtime(dst) >= os.path.getmtime(src)
    except OSError:
        return False


def iter_media(root):
    """Every gallery media file under `root`, skipping the folders galleries never list."""
    for dirpath, dirnames, names in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
        for n in sorted(names):
            if is_media(n):
                yield os.path.join(dirpath, n)


def _size(p):
    try:
        return os.path.getsize(p)
    except OSError:
        return 0


def _recent(p):
    try:
        return time.time() - os.path.getmtime(p) < RECENT_SECONDS
    except OSError:
        return False


# ── PNG metadata chunk (same format as nodes.py) ────────────────────────────────────

def png_read_meta(path):
    try:
        with open(path, "rb") as f:
            data = f.read()
        if data[:8] != b"\x89PNG\r\n\x1a\n":
            return None
        i = 8
        while i < len(data) - 4:
            clen = struct.unpack(">I", data[i:i + 4])[0]
            ctype = data[i + 4:i + 8]
            if ctype == b"tEXt":
                chunk = data[i + 8:i + 8 + clen]
                if chunk.startswith(b"Comment\x00"):
                    parsed = json.loads(chunk[8:].decode("utf-8", errors="replace"))
                    if isinstance(parsed, dict):
                        return parsed
            if ctype == b"IEND":
                break
            i += 12 + clen
    except Exception:
        pass
    return None


def png_write_meta(path, meta):
    """Replace the PNG's Comment chunk, keeping the file's mtime. True on success."""
    try:
        orig = os.path.getmtime(path)
        with open(path, "rb") as f:
            data = f.read()
        if data[:8] != b"\x89PNG\r\n\x1a\n":
            return False
        payload = b"Comment\x00" + json.dumps(meta, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        chunk = struct.pack(">I", len(payload)) + b"tEXt" + payload + struct.pack(">I", zlib.crc32(b"tEXt" + payload) & 0xFFFFFFFF)
        out = bytearray(data[:8])
        i, inserted = 8, False
        while i < len(data):
            clen = struct.unpack(">I", data[i:i + 4])[0]
            ctype = data[i + 4:i + 8]
            body = data[i:i + 12 + clen]
            i += 12 + clen
            if ctype == b"tEXt" and data[i - clen - 4:i - 4].startswith(b"Comment\x00"):
                continue
            out += body
            if ctype == b"IHDR" and not inserted:
                out += chunk
                inserted = True
            if ctype == b"IEND":
                break
        tmp = path + ".tjmeta.tmp"
        with open(tmp, "wb") as f:
            f.write(out)
        os.replace(tmp, path)
        os.utime(path, (orig, orig))
        return True
    except Exception:
        return False


def read_meta(media):
    """(meta dict or None, where) — sidecar first, then the legacy sidecar, then the PNG chunk."""
    for p, where in ((meta_path(media), "sidecar"), (meta_path_legacy(media), "legacy")):
        if os.path.isfile(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    d = json.load(f)
                if isinstance(d, dict):
                    return d, where
            except Exception:
                pass
    if media.lower().endswith(".png"):
        d = png_read_meta(media)
        if d:
            return d, "png"
    return None, ""


# ── thumbnails ──────────────────────────────────────────────────────────────────────

def make_thumb(media, ffmpeg=None):
    """Write the thumbnail for `media` (atomic). True when written, False when not needed/possible."""
    dst = thumb_path(media)
    if not dst:
        return False
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    tmp = f"{dst}.{threading.get_ident()}.tmp"
    try:
        if is_img(media):
            from PIL import Image
            with Image.open(media) as im:
                im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P", "PA") else "RGB")
                im.thumbnail((THUMB_SIZE, THUMB_SIZE))
                im.save(tmp, "WEBP", quality=75, method=4)
        else:
            if not ffmpeg:
                return False
            r = subprocess.run([ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", media, "-frames:v", "1",
                                "-vf", "scale=320:-2", "-f", "image2", "-update", "1", tmp],
                               capture_output=True, timeout=60, stdin=subprocess.DEVNULL)
            if r.returncode != 0 or not os.path.isfile(tmp):
                return False
        os.replace(tmp, dst)
        return True
    except Exception:
        return False
    finally:
        if os.path.exists(tmp):
            try:
                os.remove(tmp)
            except OSError:
                pass


# ── trash ───────────────────────────────────────────────────────────────────────────

class Trash:
    """<root>/<batch>/<path relative to base> + manifest.json, so a batch can be put back."""

    def __init__(self, root, base, label=""):
        self.root, self.base, self.label = root, os.path.realpath(base), label
        self.batch = time.strftime("%Y%m%d-%H%M%S") + f"-{int((time.time() % 1) * 1000):03d}"
        self.items = []

    def put(self, path, reason=""):
        rel = os.path.relpath(os.path.realpath(path), self.base)
        dst = os.path.join(self.root, self.batch, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        size = _size(path)
        shutil.move(path, dst)
        self.items.append({"rel": rel.replace("\\", "/"), "reason": reason, "size": size})

    def close(self):
        if not self.items:
            return None
        with open(os.path.join(self.root, self.batch, "manifest.json"), "w", encoding="utf-8") as f:
            json.dump({"label": self.label, "created": time.time(), "base": self.base, "items": self.items}, f,
                      ensure_ascii=False, indent=1)
        return self.batch


def trash_list(root):
    out = []
    if not os.path.isdir(root):
        return out
    for b in sorted(os.listdir(root), reverse=True):
        mp = os.path.join(root, b, "manifest.json")
        if not os.path.isfile(mp):
            continue
        try:
            with open(mp, "r", encoding="utf-8") as f:
                m = json.load(f)
        except Exception:
            continue
        items = m.get("items", [])
        out.append({"batch": b, "label": m.get("label", ""), "created": m.get("created", 0),
                    "count": len(items), "size": sum(i.get("size", 0) for i in items)})
    return out


def trash_restore(root, base, batch):
    mp = os.path.join(root, batch, "manifest.json")
    with open(mp, "r", encoding="utf-8") as f:
        m = json.load(f)
    restored, skipped = 0, []
    base_abs = os.path.realpath(base)
    for it in m.get("items", []):
        src = os.path.join(root, batch, *it["rel"].split("/"))
        if not os.path.exists(src):
            continue
        dst = safe_join(base_abs, it["rel"])
        if os.path.exists(dst):
            skipped.append(it["rel"])
            continue
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.move(src, dst)
        restored += 1
    if not skipped:
        shutil.rmtree(os.path.join(root, batch), ignore_errors=True)
    return {"restored": restored, "skipped": skipped}


def trash_empty(root, batch=None):
    if not os.path.isdir(root):
        return 0
    n = 0
    for b in ([batch] if batch else os.listdir(root)):
        p = os.path.join(root, b)
        if os.path.isdir(p) and os.path.dirname(os.path.realpath(p)) == os.path.realpath(root):
            shutil.rmtree(p, ignore_errors=True)
            n += 1
    return n


# ── scan ────────────────────────────────────────────────────────────────────────────

def _walk_dirs(root):
    """Every directory under root that galleries read (skip-dirs excluded), root first."""
    for dirpath, dirnames, _ in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
        yield dirpath


def scan(base, folder, favorites=None, fav_root=None):
    """Read-only report of what a cleanup would touch.

    favorites: set of favourite filenames of the node, fav_root: folder (relative to base) that
    holds all of that node's media — a favourite is dead when no media of that name is under it."""
    root = safe_join(base, folder)
    rep = {"folder": norm(folder), "media": 0, "orphan_meta": [], "orphan_thumbs": [], "stale_thumbs": [],
           "missing_thumbs": [], "no_meta": [], "dead_favorites": [], "empty_dirs": [], "tmp_files": [],
           "bytes": {}}
    if not os.path.isdir(root):
        return rep

    def rel(p): return os.path.relpath(p, os.path.realpath(base)).replace("\\", "/")

    for d in _walk_dirs(root):
        names = set(os.listdir(d))
        media_here = {n for n in names if os.path.isfile(os.path.join(d, n)) and is_media(n)}
        stems = {os.path.splitext(n)[0] for n in media_here}
        for n in media_here:
            p = os.path.join(d, n)
            rep["media"] += 1
            tp = thumb_path(p)
            if tp:
                if not os.path.isfile(tp):
                    rep["missing_thumbs"].append(rel(p))
                elif not thumb_fresh(p, tp):
                    rep["stale_thumbs"].append(rel(p))
            if os.path.basename(d) != "frames":      # extracted frames never carry metadata
                if not os.path.isfile(meta_path(p)) and not os.path.isfile(meta_path_legacy(p)):
                    if not (n.lower().endswith(".png") and png_read_meta(p)):
                        rep["no_meta"].append(rel(p))
        md = os.path.join(d, "metadata")
        if os.path.isdir(md):
            for n in os.listdir(md):
                fp = os.path.join(md, n)
                if os.path.isfile(fp) and n.lower().endswith(".json") and os.path.splitext(n)[0] not in stems:
                    rep["orphan_meta"].append(rel(fp))
            td = os.path.join(md, "thumbs")
            if os.path.isdir(td):
                for n in os.listdir(td):
                    if n.lower().endswith(".webp") and n[:-5] not in media_here:
                        rep["orphan_thumbs"].append(rel(os.path.join(td, n)))
        vd = os.path.join(d, "_thumbs")
        if os.path.isdir(vd):
            for n in os.listdir(vd):
                if n.lower().endswith(".jpg") and n[:-4] not in media_here:
                    rep["orphan_thumbs"].append(rel(os.path.join(vd, n)))
        for n in names:
            fp = os.path.join(d, n)
            if os.path.isfile(fp) and (n.lower().endswith(TMP_SUFFIXES) or ".tagtmp." in n):
                rep["tmp_files"].append(rel(fp))

    # empty folders: no files anywhere below, ignoring the cache folders that hold nothing but caches
    def has_content(d):
        for dp, dn, fn in os.walk(d):
            if any(f for f in fn):
                return True
        return False
    for d in sorted(_walk_dirs(root), reverse=True):
        if d == root:
            continue
        if not has_content(d):
            rep["empty_dirs"].append(rel(d))

    if favorites is not None:
        have = set()
        fr = safe_join(base, fav_root if fav_root is not None else folder)
        if os.path.isdir(fr):
            for p in iter_media(fr):
                have.add(os.path.basename(p))
        rep["dead_favorites"] = sorted(n for n in favorites if n not in have)

    base_abs = os.path.realpath(base)
    for k in ("orphan_meta", "orphan_thumbs", "tmp_files"):
        rep["bytes"][k] = sum(_size(os.path.join(base_abs, *p.split("/"))) for p in rep[k])
    return rep


# ── clean ───────────────────────────────────────────────────────────────────────────

def clean(base, folder, trash_root, actions, favorites=None, fav_root=None, save_favorites=None, ffmpeg=None, label=""):
    """Apply the chosen actions. actions: orphans, tmp, thumbs, force_thumbs, empty_dirs, favorites (bools)."""
    with LOCK:
        rep = scan(base, folder, favorites, fav_root)
        base_abs = os.path.realpath(base)
        res = {"trashed": 0, "thumbs_built": 0, "thumbs_failed": 0, "dirs_removed": 0, "favorites_pruned": 0,
               "skipped_recent": 0, "batch": None}
        trash = Trash(trash_root, base, label or "cleanup")

        def full(rel): return os.path.join(base_abs, *rel.split("/"))

        if actions.get("orphans"):
            for rel in rep["orphan_meta"] + rep["orphan_thumbs"]:
                p = full(rel)
                if _recent(p):
                    res["skipped_recent"] += 1
                    continue
                if os.path.isfile(p):
                    if "/thumbs/" in "/" + rel or "/_thumbs/" in "/" + rel:
                        os.remove(p)          # a cache: nothing to restore
                    else:
                        trash.put(p, "orphan metadata")
                    res["trashed"] += 1
        if actions.get("tmp"):
            for rel in rep["tmp_files"]:
                p = full(rel)
                if _recent(p):
                    res["skipped_recent"] += 1
                    continue
                if os.path.isfile(p):
                    trash.put(p, "leftover temp file")
                    res["trashed"] += 1
        if actions.get("thumbs") or actions.get("force_thumbs"):
            if actions.get("force_thumbs"):
                todo = [os.path.relpath(p, base_abs).replace("\\", "/") for p in iter_media(safe_join(base, folder))
                        if thumb_path(p)]
            else:
                todo = rep["missing_thumbs"] + rep["stale_thumbs"]
            for rel in todo:
                p = full(rel)
                if not os.path.isfile(p):
                    continue
                tp = thumb_path(p)
                if actions.get("force_thumbs") and tp and os.path.isfile(tp):
                    try:
                        os.remove(tp)
                    except OSError:
                        pass
                if make_thumb(p, ffmpeg):
                    res["thumbs_built"] += 1
                else:
                    res["thumbs_failed"] += 1
        if actions.get("favorites") and favorites is not None and save_favorites:
            dead = set(rep["dead_favorites"])
            if dead:
                save_favorites(set(favorites) - dead)
                res["favorites_pruned"] = len(dead)
        res["batch"] = trash.close()
        if actions.get("empty_dirs"):
            for rel in scan(base, folder)["empty_dirs"]:      # re-scan: the steps above may have emptied more
                p = full(rel)
                try:
                    if os.path.isdir(p) and not any(f for _, _, fs in os.walk(p) for f in fs):
                        shutil.rmtree(p)
                        res["dirs_removed"] += 1
                except OSError:
                    pass
        return res


# ── path rewriting (metadata) ───────────────────────────────────────────────────────

def make_rewriter(src_rel, dest_rel, renames):
    """Return f(obj)->(new_obj, changed). Strings equal to / under src_rel move to dest_rel;
    strings naming a renamed file get the new name; {filename, subfolder} pairs are handled as a unit.
    renames: {"<src_rel>/<sub>/<old name>": "<dest_rel>/<sub>/<new name>"}"""
    src_rel, dest_rel = norm(src_rel), norm(dest_rel)

    def conv_str(s):
        n = s.replace("\\", "/")
        back = "\\" in s
        out = None
        if n in renames:
            out = renames[n]
        elif n == src_rel:
            out = dest_rel
        elif n.startswith(src_rel + "/"):
            out = dest_rel + n[len(src_rel):]
        if out is None:
            return s
        return out.replace("/", "\\") if back else out

    def walk(o):
        if isinstance(o, dict):
            new, changed = {}, False
            fn, sub = o.get("filename"), o.get("subfolder")
            pair = None
            if isinstance(fn, str) and isinstance(sub, str):
                key = (norm(sub) + "/" + fn) if norm(sub) else fn
                if key in renames:
                    nk = renames[key]
                    nsub, _, nfn = nk.rpartition("/")
                    pair = (nfn, nsub)
                elif norm(sub) == src_rel or norm(sub).startswith(src_rel + "/"):
                    pair = (fn, dest_rel + norm(sub)[len(src_rel):])
            for k, v in o.items():
                if pair and k == "filename":
                    nv = pair[0]
                elif pair and k == "subfolder":
                    nv = pair[1].replace("/", "\\") if "\\" in v else pair[1]
                else:
                    nv, c = walk(v)
                    if c:
                        changed = True
                if nv != v:
                    changed = True
                new[k] = nv
            return new, changed
        if isinstance(o, list):
            out, changed = [], False
            for v in o:
                nv, c = walk(v)
                out.append(nv)
                changed = changed or c or nv != v
            return out, changed
        if isinstance(o, str):
            ns = conv_str(o)
            return ns, ns != o
        return o, False

    return lambda obj: walk(obj)


def _write_sidecar(media, meta):
    mp = meta_path(media)
    os.makedirs(os.path.dirname(mp), exist_ok=True)
    tmp = mp + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    os.replace(tmp, mp)


# ── merge ───────────────────────────────────────────────────────────────────────────

def _unique_name(dest_dir, name, suffix, also=()):
    """name -> name_<suffix> -> name_<suffix>_2 ... until neither it nor its sidecar exists in dest_dir."""
    stem, ext = os.path.splitext(name)
    cand, i = name, 0
    while os.path.exists(os.path.join(dest_dir, cand)) or any(
            os.path.exists(os.path.join(dest_dir, *a(cand))) for a in also):
        i += 1
        cand = f"{stem}_{suffix}{ext}" if i == 1 else f"{stem}_{suffix}_{i}{ext}"
    return cand


def validate_merge(base, dest_rel, src_rel):
    d, s = norm(dest_rel), norm(src_rel)
    if not d or not s:
        raise ValueError("choose a folder inside the output folder")
    if d == s:
        raise ValueError("source and target are the same folder")
    if d.startswith(s + "/"):
        raise ValueError("the target folder is inside the folder being merged")
    for part in s.split("/") + d.split("/"):
        if part in SKIP_DIRS:
            raise ValueError(f"'{part}' is a reserved folder")
    sa, da = safe_join(base, s), safe_join(base, d)
    if not os.path.isdir(sa):
        raise ValueError(f"folder to merge not found: {s}")
    return sa, da          # the target may not exist yet (an empty gallery folder): merge() creates it


def merge(base, dest_rel, src_rel, trash_root, refs_root=None, favorites=None, save_favorites=None,
          ffmpeg=None, dry_run=False, make_thumbs=True, on_moved=None):
    """Import every file of `src_rel` into `dest_rel`, rewrite every path in the metadata that pointed at
    the old location, then remove the (now empty) source folder.

    A file whose name is taken in the target is renamed `<stem>_<source folder name><ext>`.
    refs_root: folder whose other metadata sidecars may reference the moved files (rewritten too)."""
    with LOCK:
        sa, da = validate_merge(base, dest_rel, src_rel)
        base_abs = os.path.realpath(base)
        s_rel, d_rel = norm(src_rel), norm(dest_rel)
        suffix = os.path.basename(s_rel)
        plan = {"moves": [], "renames": {}, "covers": [], "leftover": [], "metas_rewritten": 0, "refs_rewritten": 0,
                "thumbs_built": 0, "removed_source": False, "dry_run": dry_run, "batch": None, "favorites_renamed": 0}
        rename_map = {}        # "<src rel>/<sub>/<old>" -> "<dest rel>/<sub>/<new>"
        fav_ren = {}           # old filename -> new filename
        cover_ren = {}         # old cover name -> new cover name
        taken = {}             # dest dir -> names already claimed by this plan (dry-run + real alike)

        def claim(dest_dir, name, extra):
            """First free name: `name`, `<stem>_<src>`, `<stem>_<src>_2` ... free on disk AND in this plan."""
            used = taken.setdefault(dest_dir, set())
            stem, ext = os.path.splitext(name)
            i = 0
            while True:
                cand = name if i == 0 else (f"{stem}_{suffix}{ext}" if i == 1 else f"{stem}_{suffix}_{i}{ext}")
                busy = os.path.exists(os.path.join(dest_dir, cand)) or any(
                    os.path.exists(os.path.join(dest_dir, *a(cand))) for a in extra)
                sidecar_used = os.path.splitext(cand)[0].lower() in {os.path.splitext(u)[0] for u in used}
                if not busy and cand.lower() not in used and not (extra and sidecar_used):
                    used.add(cand.lower())
                    return cand
                i += 1

        media = list(iter_media(sa))
        for p in media:
            sub = os.path.relpath(os.path.dirname(p), sa)
            sub = "" if sub == "." else sub.replace("\\", "/")
            dest_dir = os.path.join(da, *sub.split("/")) if sub else da
            name = os.path.basename(p)
            stem = os.path.splitext(name)[0]
            new = claim(dest_dir, name, [lambda c: ("metadata", os.path.splitext(c)[0] + ".json")])
            entry = {"from": (s_rel + "/" + (sub + "/" if sub else "") + name),
                     "to": (d_rel + "/" + (sub + "/" if sub else "") + new), "renamed": new != name}
            plan["moves"].append(entry)
            rename_map[entry["from"]] = entry["to"]
            if new != name:
                plan["renames"][entry["from"]] = entry["to"]
                fav_ren[name] = new
        rewriter = make_rewriter(s_rel, d_rel, rename_map)

        # music covers named by a moved track's meta, then any other cover
        cov_src = os.path.join(sa, "covers")
        cov_dest = os.path.join(da, "covers")
        cover_names = sorted(os.listdir(cov_src)) if os.path.isdir(cov_src) else []
        cover_claims = {}
        for cn in cover_names:
            if os.path.isfile(os.path.join(cov_src, cn)):
                new = claim(cov_dest, cn, [])
                cover_claims[cn] = new
                plan["covers"].append({"from": s_rel + "/covers/" + cn, "to": d_rel + "/covers/" + new})
                if new != cn:
                    cover_ren[cn] = new

        # what stays behind (unknown files): reported, and the source folder is kept
        known = {os.path.join(sa, *e["from"][len(s_rel) + 1:].split("/")) for e in plan["moves"]}
        for dp, dn, fn in os.walk(sa):
            dn[:] = [d for d in dn if d not in ("metadata", "_thumbs", "covers")]
            for f in fn:
                fp = os.path.join(dp, f)
                if fp not in known:
                    plan["leftover"].append(os.path.relpath(fp, base_abs).replace("\\", "/"))
        if dry_run:
            return plan

        os.makedirs(da, exist_ok=True)
        trash = Trash(trash_root, base, f"merge {s_rel} -> {d_rel}")
        for e, p in zip(plan["moves"], media):
            dst = os.path.join(base_abs, *e["to"].split("/"))
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            meta, where = read_meta(p)
            old_side, old_leg = meta_path(p), meta_path_legacy(p)
            shutil.move(p, dst)
            if meta is not None:
                new_meta, changed = rewriter(meta)
                if isinstance(new_meta, dict) and new_meta.get("coverImage") in cover_ren:
                    new_meta["coverImage"] = cover_ren[new_meta["coverImage"]]
                    changed = True
                _write_sidecar(dst, new_meta)
                if dst.lower().endswith(".png") and png_read_meta(dst) is not None:
                    png_write_meta(dst, new_meta)
                if changed:
                    plan["metas_rewritten"] += 1
            for old in (old_side, old_leg):
                if os.path.isfile(old):
                    os.remove(old)
            tp = thumb_path(p)
            if tp and os.path.isfile(tp):
                os.remove(tp)                  # cache of the old location
            if make_thumbs and make_thumb(dst, ffmpeg):
                plan["thumbs_built"] += 1
        for cn, new in cover_claims.items():
            os.makedirs(cov_dest, exist_ok=True)
            shutil.move(os.path.join(cov_src, cn), os.path.join(cov_dest, new))

        # other metadata that pointed at the moved files (e.g. a stitched video listing its clips)
        if refs_root:
            rr = safe_join(base, refs_root)
            moved_to = {os.path.join(base_abs, *e["to"].split("/")) for e in plan["moves"]}
            for p in iter_media(rr):
                if p in moved_to:
                    continue
                side = meta_path(p)
                if not os.path.isfile(side):
                    continue
                try:
                    with open(side, "r", encoding="utf-8") as f:
                        m = json.load(f)
                except Exception:
                    continue
                nm, changed = rewriter(m)
                if changed:
                    _write_sidecar(p, nm)
                    if p.lower().endswith(".png") and png_read_meta(p) is not None:
                        png_write_meta(p, nm)
                    plan["refs_rewritten"] += 1

        if favorites is not None and save_favorites and fav_ren:
            favs = set(favorites)
            changed = False
            for old, new in fav_ren.items():
                if old in favs:
                    favs.discard(old)
                    favs.add(new)
                    plan["favorites_renamed"] += 1
                    changed = True
            if changed:
                save_favorites(favs)

        if on_moved:                      # other stores keyed by "<folder>/<file>" (e.g. the blurred-media list)
            on_moved(dict(rename_map))

        # remove the source: leftover orphan sidecars go to the trash, caches are deleted
        if not plan["leftover"]:
            for dp, dn, fn in os.walk(sa):
                if os.path.basename(dp) == "metadata":
                    for f in fn:
                        if f.lower().endswith(".json"):
                            trash.put(os.path.join(dp, f), "orphan metadata left in merged folder")
            plan["batch"] = trash.close()
            shutil.rmtree(sa, ignore_errors=True)
            plan["removed_source"] = not os.path.exists(sa)
        else:
            plan["batch"] = trash.close()
        return plan

"""
TJ Node ONE — Combined package for flux2 klein One (TJ) + Z-Image ONE (TJ)
"""
import os
import sys
import json
import glob
import time
import subprocess
import shutil
from pathlib import Path
import numpy as np
import torch
from PIL import Image
import folder_paths
from aiohttp import web
from server import PromptServer

NODE_DIR = os.path.dirname(os.path.abspath(__file__))

# ── Per-node config paths ─────────────────────────────────────────────────────
FK_CONFIG_PATH  = os.path.join(NODE_DIR, 'config_klein.json')
ZIT_CONFIG_PATH = os.path.join(NODE_DIR, 'config_zimage.json')
K2_CONFIG_PATH  = os.path.join(NODE_DIR, 'config_krea2.json')
QE_CONFIG_PATH  = os.path.join(NODE_DIR, 'config_qwen2511.json')
SDXL_CONFIG_PATH = os.path.join(NODE_DIR, 'config_sdxl_one.json')
MMH3_CONFIG_PATH = os.path.join(NODE_DIR, 'config_minimax_h3.json')

FK_SUBFOLDER  = "one_flux2-klein"
ZIT_SUBFOLDER = "one_z-image"
K2_SUBFOLDER  = "one_krea2"
QE_SUBFOLDER  = "one_qwen2511"
SDXL_SUBFOLDER = "one_sdxl"
MMH3_SUBFOLDER = "one_minimax_h3"


# ════════════════════════════════════════════════════════════════════════════════
# Shared utilities
# ════════════════════════════════════════════════════════════════════════════════

def _get_output_dir():
    try:
        return str(Path(folder_paths.get_output_directory()).resolve())
    except Exception:
        return str(Path(os.path.join(os.path.dirname(NODE_DIR), "output")).resolve())


def _safe_resolve_path(base_dir, subfolder="", filename=""):
    base = Path(base_dir).resolve()
    target = base
    if subfolder:
        target = target / subfolder
    if filename:
        target = target / filename
    target = target.resolve()
    if not (target == base or base in target.parents):
        raise ValueError("invalid path")
    return str(target)


def _safe_resolve_output_path(output_dir, subfolder="", filename=""):
    return _safe_resolve_path(output_dir, subfolder, filename)


def _open_in_file_manager(args):
    """Launch a fixed, allow-listed OS file-manager command with a resolved
    absolute executable path. Never takes shell input or user-controlled
    argv[0]; only the trailing path argument may vary."""
    exe = shutil.which(args[0])
    if not exe:
        raise FileNotFoundError(f"{args[0]} not found on PATH")
    subprocess.Popen([exe, *args[1:]], shell=False)


def _file_key(filename, subfolder=""):
    return f"{subfolder}/{filename}" if subfolder else filename


def _meta_dir(image_path):
    return os.path.join(os.path.dirname(image_path), "metadata")


def _meta_path(image_path):
    fname = os.path.splitext(os.path.basename(image_path))[0] + ".json"
    return os.path.join(_meta_dir(image_path), fname)


def _meta_path_legacy(image_path):
    base, _ = os.path.splitext(image_path)
    return base + ".json"


def _png_embed_meta(png_path, meta_dict):
    import struct, zlib
    try:
        with open(png_path, "rb") as f:
            data = f.read()
        if data[:8] != b'\x89PNG\r\n\x1a\n':
            return False
        meta_json = json.dumps(meta_dict, ensure_ascii=False, separators=(',', ':'))
        keyword = b'Comment'
        text_data = keyword + b'\x00' + meta_json.encode('utf-8')
        crc = zlib.crc32(b'tEXt' + text_data) & 0xFFFFFFFF
        chunk = struct.pack('>I', len(text_data)) + b'tEXt' + text_data + struct.pack('>I', crc)
        new_body = bytearray()
        i = 8
        while i < len(data) - 4:
            try:
                clen = struct.unpack('>I', data[i:i+4])[0]
                ctype = data[i+4:i+8]
                if ctype == b'tEXt':
                    chunk_data = data[i+8:i+8+clen]
                    if chunk_data.startswith(b'Comment\x00'):
                        i += 12 + clen
                        continue
                new_body += data[i:i+12+clen]
                if ctype == b'IEND':
                    break
                i += 12 + clen
            except Exception:
                new_body += data[i:]
                break
        sig = data[:8]
        final = bytearray(sig)
        j = 0
        inserted = False
        while j < len(new_body):
            try:
                clen = struct.unpack('>I', bytes(new_body[j:j+4]))[0]
                ctype = new_body[j+4:j+8]
                final += new_body[j:j+12+clen]
                j += 12 + clen
                if not inserted and ctype == b'IHDR':
                    final += chunk
                    inserted = True
            except Exception:
                final += new_body[j:]
                break
        if not inserted:
            final += chunk
        tmp = png_path + ".tjmeta.tmp"
        try:
            with open(tmp, "wb") as f:
                f.write(final)
            for attempt in range(5):
                try:
                    os.replace(tmp, png_path)
                    break
                except OSError:
                    if attempt == 4:
                        raise
                    time.sleep(0.3)
        except Exception:
            try:
                os.remove(tmp)
            except OSError:
                pass
            raise
        return True
    except Exception as e:
        print(f"[TJ_NODE_ONE] png_embed_meta error: {e}")
        return False


def _png_read_meta(png_path):
    import struct
    try:
        with open(png_path, "rb") as f:
            data = f.read()
        if data[:8] != b'\x89PNG\r\n\x1a\n':
            return None
        i = 8
        while i < len(data) - 4:
            try:
                clen = struct.unpack('>I', data[i:i+4])[0]
                ctype = data[i+4:i+8]
                if ctype == b'tEXt':
                    chunk_data = data[i+8:i+8+clen]
                    if chunk_data.startswith(b'Comment\x00'):
                        raw = chunk_data[8:].decode('utf-8', errors='replace')
                        parsed = json.loads(raw)
                        if isinstance(parsed, dict):
                            return parsed
                if ctype == b'IEND':
                    break
                i += 12 + clen
            except Exception:
                break
        return None
    except Exception:
        return None


def _read_json_meta(image_path):
    _VALID = ("v", "prompt", "w", "h", "mode", "favorite", "favourite")
    if image_path.lower().endswith('.png') and os.path.exists(image_path):
        meta = _png_read_meta(image_path)
        if meta and isinstance(meta, dict) and any(k in meta for k in _VALID):
            return meta
    for mp in (_meta_path(image_path), _meta_path_legacy(image_path)):
        if not os.path.exists(mp):
            continue
        try:
            with open(mp, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict) and any(k in data for k in _VALID):
                return data
        except Exception as e:
            print(f"[TJ_NODE_ONE] read_json_meta error: {e}")
    return None


def _write_json_meta(image_path, meta_dict):
    ok_png = False
    if image_path.lower().endswith('.png') and os.path.exists(image_path):
        orig_mtime = os.path.getmtime(image_path)
        ok_png = _png_embed_meta(image_path, meta_dict)
        if ok_png:
            try:
                os.utime(image_path, (orig_mtime, orig_mtime))
            except Exception:
                pass
    mp = _meta_path(image_path)
    tmp = mp + ".tmp"
    try:
        os.makedirs(os.path.dirname(mp), exist_ok=True)
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(meta_dict, f, ensure_ascii=False, indent=2)
        os.replace(tmp, mp)
        return True
    except Exception as e:
        print(f"[TJ_NODE_ONE] write_json_meta error: {e}")
        if os.path.exists(tmp):
            try:
                os.remove(tmp)
            except Exception:
                pass
        return ok_png


def _scan(folder_key, extensions=None):
    exts = extensions or [".safetensors", ".ckpt", ".pt", ".pth"]
    try:
        bases = folder_paths.get_folder_paths(folder_key)
    except Exception:
        return ["none"]
    found = []
    for base in bases:
        if not os.path.isdir(base):
            continue
        for root, _, files in os.walk(base):
            for fn in files:
                if any(fn.lower().endswith(e) for e in exts):
                    found.append(os.path.relpath(os.path.join(root, fn), base))
    return sorted(found) if found else ["none"]


def _scan_path(path, extensions=None):
    exts = extensions or [".safetensors", ".ckpt", ".pt", ".pth"]
    if not os.path.isdir(path):
        return ["none"]
    found = []
    for root, _, files in os.walk(path):
        for fn in files:
            if any(fn.lower().endswith(e) for e in exts):
                found.append(os.path.relpath(os.path.join(root, fn), path))
    return sorted(found) if found else ["none"]


def _read_safetensors_header(path):
    try:
        with open(path, "rb") as f:
            length_bytes = f.read(8)
            if len(length_bytes) < 8:
                return None
            import struct
            header_len = struct.unpack("<Q", length_bytes)[0]
            if header_len > 100 * 1024 * 1024:
                return None
            header_bytes = f.read(header_len)
        return json.loads(header_bytes.decode("utf-8"))
    except Exception:
        return None


def _extract_trigger_words(header):
    if not header:
        return []
    meta = header.get("__metadata__", {})
    if not isinstance(meta, dict):
        return []
    triggers = []
    v = meta.get("modelspec.trigger_phrase") or meta.get("trigger_phrase") or meta.get("trigger_word")
    if v and isinstance(v, str) and v.strip():
        triggers.extend([t.strip() for t in v.split(",") if t.strip()])
    raw = meta.get("ss_trigger_words")
    if raw:
        if isinstance(raw, str):
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, list):
                    triggers.extend([str(t).strip() for t in parsed if str(t).strip()])
                elif isinstance(parsed, str) and parsed.strip():
                    triggers.extend([t.strip() for t in parsed.split(",") if t.strip()])
            except Exception:
                triggers.extend([t.strip() for t in raw.split(",") if t.strip()])
        elif isinstance(raw, list):
            triggers.extend([str(t).strip() for t in raw if str(t).strip()])
    tag_freq_raw = meta.get("ss_tag_frequency")
    if tag_freq_raw and not triggers:
        try:
            tag_freq = json.loads(tag_freq_raw) if isinstance(tag_freq_raw, str) else tag_freq_raw
            if isinstance(tag_freq, dict):
                all_tags = {}
                for ds_tags in tag_freq.values():
                    if isinstance(ds_tags, dict):
                        for tag, count in ds_tags.items():
                            all_tags[tag] = all_tags.get(tag, 0) + (count if isinstance(count, int) else 0)
                if all_tags:
                    top = sorted(all_tags.items(), key=lambda x: x[1], reverse=True)[:5]
                    triggers.extend([t for t, _ in top])
        except Exception:
            pass
    seen = set()
    result = []
    for t in triggers:
        if t.lower() not in seen:
            seen.add(t.lower())
            result.append(t)
    return result


# ════════════════════════════════════════════════════════════════════════════════
# Per-node config helpers
# ════════════════════════════════════════════════════════════════════════════════

def _load_config(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _save_config(path, cfg):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)


# ── Favorites (per node) ──────────────────────────────────────────────────────

def _fav_path(node_key):
    return os.path.join(NODE_DIR, f"favorites_{node_key}.json")


def _load_favorites(node_key):
    path = _fav_path(node_key)
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return set(data) if isinstance(data, list) else set()
        except Exception:
            return set()
    return set()


def _save_favorites(node_key, favset):
    path = _fav_path(node_key)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(sorted(favset), f, ensure_ascii=False, indent=2)


def _favorites_add(node_key, filename):
    favs = _load_favorites(node_key)
    favs.add(filename)
    _save_favorites(node_key, favs)


def _favorites_remove(node_key, filename):
    favs = _load_favorites(node_key)
    favs.discard(filename)
    _save_favorites(node_key, favs)


# ════════════════════════════════════════════════════════════════════════════════
# Gallery helper (shared, parameterised by prefix/subfolder/node_key)
# ════════════════════════════════════════════════════════════════════════════════

def _make_gallery_handler(subfolder_default, node_key):
    async def handler(request):
        output_dir = _get_output_dir()
        try:
            offset = max(0, int(request.query.get("offset", 0)))
        except Exception:
            offset = 0
        try:
            limit = min(max(1, int(request.query.get("limit", 20))), 200)
        except Exception:
            limit = 20
        subf = request.query.get("subfolder", "")
        favonly = request.query.get("favonly", "0") == "1"
        try:
            search = _safe_resolve_output_path(output_dir, subf) if subf else output_dir
        except ValueError:
            return web.json_response({"images": [], "total": 0, "offset": offset, "limit": limit, "error": "invalid subfolder"}, status=400)
        assets_dir = os.path.normpath(_safe_resolve_output_path(output_dir, os.path.join(subfolder_default, "assets")))
        fav_names = _load_favorites(node_key)
        if favonly:
            subf_dir = os.path.normpath(_safe_resolve_output_path(output_dir, subfolder_default))
            unique = []
            missing = set()
            for name in fav_names:
                p = os.path.join(subf_dir, name)
                if os.path.isfile(p):
                    unique.append(p)
                else:
                    missing.add(name)
            if missing:
                _save_favorites(node_key, fav_names - missing)
            unique.sort(key=os.path.getmtime, reverse=True)
        else:
            search_norm = os.path.normpath(search)
            exclude_assets = not search_norm.startswith(assets_dir + os.sep) and search_norm != assets_dir
            unique = []
            if os.path.isdir(search):
                pngs = glob.glob(os.path.join(search, "**", "*.png"), recursive=True)
                filtered = [p for p in pngs if not exclude_assets or not os.path.normpath(p).startswith(assets_dir + os.sep)]
                unique = sorted(set(filtered), key=os.path.getmtime, reverse=True)
        images = []
        for f in unique[offset:offset + limit]:
            rel = os.path.relpath(os.path.dirname(f), output_dir)
            fname = os.path.basename(f)
            images.append({
                "filename": fname,
                "subfolder": "" if rel == "." else rel,
                "mtime": os.path.getmtime(f),
                "key": _file_key(fname, "" if rel == "." else rel),
                "has_meta": os.path.exists(_meta_path(f)) or os.path.exists(_meta_path_legacy(f)),
                "favorite": fname in fav_names,
            })
        return web.json_response({"images": images, "total": len(unique), "offset": offset, "limit": limit})
    return handler


def _make_save_meta_handler(prefix):
    async def handler(request):
        try:
            data = await request.json()
            filename = data.get("filename", "")
            subfolder = data.get("subfolder", "")
            meta = data.get("meta", {})
            if not filename:
                return web.json_response({"ok": False, "error": "no filename"})
            output_dir = _get_output_dir()
            try:
                vpath = _safe_resolve_output_path(output_dir, subfolder, filename)
            except ValueError:
                return web.json_response({"ok": False, "error": "invalid path"}, status=400)
            if not os.path.exists(vpath):
                return web.json_response({"ok": False, "error": f"not found: {vpath}"})
            ok = _write_json_meta(vpath, meta)
            return web.json_response({"ok": ok, "filename": filename})
        except Exception as e:
            print(f"[TJ_NODE_ONE/{prefix}] save_meta error: {e}")
            return web.json_response({"ok": False, "error": str(e)})
    return handler


def _make_update_meta_handler(node_key):
    async def handler(request):
        try:
            data = await request.json()
            filename = data.get("filename", "")
            subfolder = data.get("subfolder", "")
            patch = data.get("patch", {})
            if not filename or not isinstance(patch, dict):
                return web.json_response({"ok": False, "error": "bad request"})
            output_dir = _get_output_dir()
            try:
                vpath = _safe_resolve_output_path(output_dir, subfolder, filename)
            except ValueError:
                return web.json_response({"ok": False, "error": "invalid path"}, status=400)
            existing = _read_json_meta(vpath) or {}
            existing.update(patch)
            ok = _write_json_meta(vpath, existing)
            if "favorite" in patch:
                if patch["favorite"] is True:
                    _favorites_add(node_key, filename)
                else:
                    _favorites_remove(node_key, filename)
            return web.json_response({"ok": ok})
        except Exception as e:
            print(f"[TJ_NODE_ONE] update_meta error: {e}")
            return web.json_response({"ok": False, "error": str(e)})
    return handler


def _make_meta_get_handler():
    async def handler(request):
        filename = request.query.get("filename", "")
        subfolder = request.query.get("subfolder", "")
        if not filename:
            return web.json_response({"ok": False, "error": "no filename"})
        output_dir = _get_output_dir()
        try:
            vpath = _safe_resolve_output_path(output_dir, subfolder, filename)
        except ValueError:
            return web.json_response({"ok": False, "error": "invalid path"}, status=400)
        if not os.path.exists(vpath):
            return web.json_response({"ok": False, "error": "image not found"})
        meta = _read_json_meta(vpath)
        if meta is None:
            return web.json_response({"ok": False, "error": "no metadata"})
        return web.json_response({"ok": True, "meta": meta})
    return handler


def _make_open_folder_handler():
    async def handler(request):
        try:
            data = await request.json()
            filename = data.get("filename", "")
            subfolder = data.get("subfolder", "")
            if not filename:
                return web.json_response({"ok": False, "error": "no filename"})
            output_dir = _get_output_dir()
            try:
                vpath = _safe_resolve_output_path(output_dir, subfolder, filename)
            except ValueError:
                return web.json_response({"ok": False, "error": "invalid path"}, status=400)
            if not os.path.exists(vpath):
                return web.json_response({"ok": False, "error": "file not found"})
            import platform
            system = platform.system()
            if system == "Windows":
                _open_in_file_manager(["explorer", "/select,", vpath.replace("/", "\\")])
            elif system == "Darwin":
                _open_in_file_manager(["open", "-R", vpath])
            else:
                _open_in_file_manager(["xdg-open", os.path.dirname(vpath)])
            return web.json_response({"ok": True})
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e)})
    return handler


def _make_delete_handler(node_key):
    async def handler(request):
        try:
            data = await request.json()
            filename = data.get("filename", "")
            subfolder = data.get("subfolder", "")
            if not filename:
                return web.json_response({"ok": False, "error": "filename required"}, status=400)
            output_dir = _get_output_dir()
            try:
                img_path = _safe_resolve_output_path(output_dir, subfolder, filename)
            except ValueError:
                return web.json_response({"ok": False, "error": "invalid path"}, status=400)
            if not os.path.exists(img_path):
                return web.json_response({"ok": False, "error": "file not found"}, status=404)
            os.remove(img_path)
            for json_path in (_meta_path(img_path), _meta_path_legacy(img_path)):
                if os.path.exists(json_path):
                    try:
                        os.remove(json_path)
                    except Exception:
                        pass
            _favorites_remove(node_key, filename)
            return web.json_response({"ok": True})
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e)})
    return handler


def _make_copy_to_input_handler(prefix):
    async def handler(request):
        import uuid as _uuid
        data = await request.json()
        filename = data.get("filename", "")
        subfolder = data.get("subfolder", "") or ""
        img_type = data.get("type", "output")
        if img_type == "output":
            base = folder_paths.get_output_directory()
        elif img_type == "temp":
            base = folder_paths.get_temp_directory()
        else:
            base = folder_paths.get_input_directory()
        try:
            src = _safe_resolve_path(base, subfolder, filename)
        except ValueError:
            return web.json_response({"ok": False, "error": "invalid path"}, status=400)
        if not os.path.isfile(src):
            return web.json_response({"ok": False, "error": "source not found"}, status=404)
        new_name = f"{prefix}_{_uuid.uuid4().hex[:8]}_{os.path.basename(filename)}"
        dst = os.path.join(folder_paths.get_input_directory(), new_name)
        shutil.copy2(src, dst)
        return web.json_response({"ok": True, "filename": new_name})
    return handler


def _make_lora_triggers_handler():
    async def handler(request):
        lora_name = request.query.get("name", "")
        if not lora_name:
            return web.json_response({"ok": False, "error": "no name"}, status=400)
        try:
            bases = folder_paths.get_folder_paths("loras")
        except Exception:
            return web.json_response({"ok": False, "error": "cannot resolve loras folder"}, status=500)
        for base in bases:
            candidate = os.path.normpath(os.path.join(base, lora_name))
            try:
                Path(candidate).resolve().relative_to(Path(base).resolve())
            except Exception:
                continue
            if os.path.isfile(candidate) and candidate.lower().endswith(".safetensors"):
                header = _read_safetensors_header(candidate)
                triggers = _extract_trigger_words(header)
                return web.json_response({"ok": True, "triggers": triggers, "name": lora_name})
        return web.json_response({"ok": False, "error": "file not found", "triggers": []})
    return handler


def _make_bgremoval_handler():
    async def handler(request):
        try:
            models_dir = folder_paths.models_dir
        except Exception:
            models_dir = os.path.join(os.path.dirname(os.path.dirname(NODE_DIR)), "models")
        bg_dir = os.path.join(models_dir, "background_removal")
        found = []
        exts = [".safetensors", ".onnx", ".pt", ".pth"]
        if os.path.isdir(bg_dir):
            for fn in os.listdir(bg_dir):
                if any(fn.lower().endswith(e) for e in exts):
                    found.append(fn)
        return web.json_response({"models": sorted(found)})
    return handler


def _serve_workflow(rel_path):
    async def handler(request):
        path = os.path.join(NODE_DIR, rel_path)
        if not os.path.exists(path):
            return web.Response(status=404, text=f"{rel_path} not found")
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return web.json_response(data)
    return handler


# ════════════════════════════════════════════════════════════════════════════════
# Route registration — flux_klein
# ════════════════════════════════════════════════════════════════════════════════

# Workflows
PromptServer.instance.routes.get("/flux_klein/workflow_t2i")(_serve_workflow("workflows/klein/t2i_workflow.json"))
PromptServer.instance.routes.get("/flux_klein/workflow_i2i")(_serve_workflow("workflows/klein/i2i_workflow.json"))
PromptServer.instance.routes.get("/flux_klein/workflow_edit")(_serve_workflow("workflows/klein/edit_workflow.json"))
PromptServer.instance.routes.get("/flux_klein/workflow_inpaint")(_serve_workflow("workflows/klein/inpaint_workflow.json"))
PromptServer.instance.routes.get("/flux_klein/workflow_outpaint")(_serve_workflow("workflows/klein/outpaint_workflow.json"))
PromptServer.instance.routes.get("/flux_klein/workflow_faceswap")(_serve_workflow("workflows/klein/faceswap_workflow.json"))
PromptServer.instance.routes.get("/flux_klein/workflow_remove_bg")(_serve_workflow("workflows/klein/remove_bg_workflow.json"))

PromptServer.instance.routes.get("/flux_klein/bgremoval_models")(_make_bgremoval_handler())
PromptServer.instance.routes.get("/flux_klein/gallery")(_make_gallery_handler(FK_SUBFOLDER, "klein"))
PromptServer.instance.routes.post("/flux_klein/save_meta")(_make_save_meta_handler("klein"))
PromptServer.instance.routes.post("/flux_klein/update_meta")(_make_update_meta_handler("klein"))
PromptServer.instance.routes.get("/flux_klein/meta")(_make_meta_get_handler())
PromptServer.instance.routes.post("/flux_klein/open_folder")(_make_open_folder_handler())
PromptServer.instance.routes.post("/flux_klein/delete")(_make_delete_handler("klein"))
PromptServer.instance.routes.post("/flux_klein/copy_to_input")(_make_copy_to_input_handler("fk"))
PromptServer.instance.routes.get("/flux_klein/lora_triggers")(_make_lora_triggers_handler())


@PromptServer.instance.routes.get("/flux_klein/config")
async def fk_get_config(request):
    cfg = _load_config(FK_CONFIG_PATH)
    return web.json_response({
        "dummy": cfg.get("dummy", ""),
        "lora_triggers_custom": cfg.get("lora_triggers_custom", {}),
        "t2i_templates": cfg.get("t2i_templates", []),
        "discover_prompts": cfg.get("discover_prompts", {}),
        "autofill_prompts": cfg.get("autofill_prompts", {}),
        "save_subfolder": cfg.get("save_subfolder") or FK_SUBFOLDER,
        "output_mode_visible": cfg.get("output_mode_visible", True),
        "selected_model":        cfg.get("selected_model", ""),
        "selected_text_encoder": cfg.get("selected_text_encoder", ""),
        "selected_vae":          cfg.get("selected_vae", ""),
        "negative_prompt":       cfg.get("negative_prompt", ""),
        "prompt_suffix":         cfg.get("prompt_suffix", ""),
    })


@PromptServer.instance.routes.post("/flux_klein/config")
async def fk_save_config(request):
    try:
        patch = await request.json()
        if not isinstance(patch, dict):
            return web.json_response({"ok": False, "error": "invalid payload"}, status=400)
        cfg = _load_config(FK_CONFIG_PATH)
        cfg.update(patch)
        _save_config(FK_CONFIG_PATH, cfg)
        return web.json_response({"ok": True})
    except Exception as e:
        return web.json_response({"ok": False, "error": str(e)}, status=500)


@PromptServer.instance.routes.get("/flux_klein/seedvr2_models")
async def fk_get_seedvr2_models(request):
    seedvr2_dir = os.path.join(folder_paths.models_dir, "SEEDVR2")
    models = _scan_path(seedvr2_dir)
    return web.json_response({"models": models})


@PromptServer.instance.routes.get("/flux_klein/models")
async def fk_get_models(request):
    try:
        diff = _scan("diffusion_models")
    except Exception:
        diff = ["none"]
    try:
        te = _scan("text_encoders")
    except Exception:
        te = ["none"]
    try:
        vaes = _scan("vae")
    except Exception:
        vaes = ["none"]
    loras = _scan("loras")
    return web.json_response({"diffusion_models": diff, "text_encoders": te, "vaes": vaes, "loras": loras})


_fk_last_images: dict = {}


@PromptServer.instance.routes.post("/flux_klein/set_last_image")
async def fk_set_last_image(request):
    data = await request.json()
    uid = str(data.get("unique_id", ""))
    if uid:
        _fk_last_images[uid] = data.get("image", {})
    return web.json_response({"ok": True})


# ════════════════════════════════════════════════════════════════════════════════
# Route registration — z_image_turbo
# ════════════════════════════════════════════════════════════════════════════════

# Workflows
PromptServer.instance.routes.get("/z_image_turbo/workflow_t2i")(_serve_workflow("workflows/zimage/t2i_workflow.json"))
PromptServer.instance.routes.get("/z_image_turbo/workflow_i2i")(_serve_workflow("workflows/zimage/i2i_workflow.json"))
PromptServer.instance.routes.get("/z_image_turbo/workflow_inpaint")(_serve_workflow("workflows/zimage/inpaint_workflow.json"))
PromptServer.instance.routes.get("/z_image_turbo/workflow_outpaint")(_serve_workflow("workflows/zimage/outpaint_workflow.json"))
PromptServer.instance.routes.get("/z_image_turbo/workflow_controlnet")(_serve_workflow("workflows/zimage/controlnet_workflow.json"))
PromptServer.instance.routes.get("/z_image_turbo/workflow_face_redraw")(_serve_workflow("workflows/zimage/face_redraw_workflow.json"))
PromptServer.instance.routes.get("/z_image_turbo/workflow_remove_bg")(_serve_workflow("workflows/zimage/remove_bg_workflow.json"))

PromptServer.instance.routes.get("/z_image_turbo/bgremoval_models")(_make_bgremoval_handler())
PromptServer.instance.routes.get("/z_image_turbo/gallery")(_make_gallery_handler(ZIT_SUBFOLDER, "zimage"))
PromptServer.instance.routes.post("/z_image_turbo/save_meta")(_make_save_meta_handler("zimage"))
PromptServer.instance.routes.post("/z_image_turbo/update_meta")(_make_update_meta_handler("zimage"))
PromptServer.instance.routes.get("/z_image_turbo/meta")(_make_meta_get_handler())
PromptServer.instance.routes.post("/z_image_turbo/open_folder")(_make_open_folder_handler())
PromptServer.instance.routes.post("/z_image_turbo/delete")(_make_delete_handler("zimage"))
PromptServer.instance.routes.post("/z_image_turbo/copy_to_input")(_make_copy_to_input_handler("zit"))
PromptServer.instance.routes.get("/z_image_turbo/lora_triggers")(_make_lora_triggers_handler())


@PromptServer.instance.routes.get("/z_image_turbo/config")
async def zit_get_config(request):
    cfg = _load_config(ZIT_CONFIG_PATH)
    return web.json_response({
        "dummy": cfg.get("dummy", ""),
        "lora_triggers_custom": cfg.get("lora_triggers_custom", {}),
        "t2i_templates": cfg.get("t2i_templates", []),
        "discover_prompts": cfg.get("discover_prompts", {}),
        "autofill_prompts": cfg.get("autofill_prompts", {}),
        "save_subfolder": cfg.get("save_subfolder") or ZIT_SUBFOLDER,
        "output_mode_visible": cfg.get("output_mode_visible", True),
        "selected_model":        cfg.get("selected_model", ""),
        "selected_text_encoder": cfg.get("selected_text_encoder", ""),
        "selected_vae":          cfg.get("selected_vae", ""),
        "negative_prompt":       cfg.get("negative_prompt", ""),
        "prompt_suffix":         cfg.get("prompt_suffix", ""),
    })


@PromptServer.instance.routes.post("/z_image_turbo/config")
async def zit_save_config(request):
    try:
        patch = await request.json()
        if not isinstance(patch, dict):
            return web.json_response({"ok": False, "error": "invalid payload"}, status=400)
        cfg = _load_config(ZIT_CONFIG_PATH)
        cfg.update(patch)
        _save_config(ZIT_CONFIG_PATH, cfg)
        return web.json_response({"ok": True})
    except Exception as e:
        return web.json_response({"ok": False, "error": str(e)}, status=500)


@PromptServer.instance.routes.get("/z_image_turbo/seedvr2_models")
async def zit_get_seedvr2_models(request):
    seedvr2_dir = os.path.join(folder_paths.models_dir, "SEEDVR2")
    models = _scan_path(seedvr2_dir)
    return web.json_response({"models": models})


@PromptServer.instance.routes.get("/z_image_turbo/models")
async def zit_get_models(request):
    try:
        diff = _scan("diffusion_models")
    except Exception:
        diff = ["none"]
    try:
        te = _scan("text_encoders")
    except Exception:
        te = ["none"]
    try:
        vaes = _scan("vae")
    except Exception:
        vaes = ["none"]
    loras = _scan("loras")
    try:
        patches = _scan("model_patches", extensions=[".safetensors"])
    except Exception:
        patches = ["none"]
    try:
        import folder_paths as fp
        ultra_paths = fp.get_folder_paths("ultralytics")
        face_detectors = []
        if ultra_paths:
            for subdir in ("bbox", "segm"):
                subdir_path = os.path.join(ultra_paths[0], subdir)
                if os.path.isdir(subdir_path):
                    for fname in sorted(os.listdir(subdir_path)):
                        if fname.endswith(".pt"):
                            face_detectors.append(f"{subdir}/{fname}")
        if not face_detectors:
            face_detectors = ["none"]
    except Exception:
        face_detectors = ["none"]
    return web.json_response({
        "diffusion_models": diff, "text_encoders": te, "vaes": vaes,
        "loras": loras, "model_patches": patches, "face_detectors": face_detectors,
    })


_zit_last_images: dict = {}


@PromptServer.instance.routes.post("/z_image_turbo/set_last_image")
async def zit_set_last_image(request):
    data = await request.json()
    uid = str(data.get("unique_id", ""))
    _zit_last_images[uid] = data.get("image", {})
    return web.json_response({"ok": True})


@PromptServer.instance.routes.post("/z_image_turbo/free_memory")
async def zit_free_memory(request):
    import aiohttp
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                "http://127.0.0.1:8188/free",
                json={"unload_models": True, "free_memory": True},
                timeout=aiohttp.ClientTimeout(total=30),
            ) as resp:
                return web.json_response({"ok": resp.status == 200})
    except Exception as e:
        return web.json_response({"ok": False, "error": str(e)})


# ════════════════════════════════════════════════════════════════════════════════
# Route registration — krea2_one
# ════════════════════════════════════════════════════════════════════════════════

PromptServer.instance.routes.get("/krea2_one/gallery")(_make_gallery_handler(K2_SUBFOLDER, "krea2"))
PromptServer.instance.routes.post("/krea2_one/save_meta")(_make_save_meta_handler("krea2"))
PromptServer.instance.routes.post("/krea2_one/update_meta")(_make_update_meta_handler("krea2"))
PromptServer.instance.routes.get("/krea2_one/meta")(_make_meta_get_handler())
PromptServer.instance.routes.post("/krea2_one/open_folder")(_make_open_folder_handler())
PromptServer.instance.routes.post("/krea2_one/delete")(_make_delete_handler("krea2"))
PromptServer.instance.routes.post("/krea2_one/copy_to_input")(_make_copy_to_input_handler("k2"))
PromptServer.instance.routes.get("/krea2_one/lora_triggers")(_make_lora_triggers_handler())


@PromptServer.instance.routes.get("/krea2_one/config")
async def k2_get_config(request):
    cfg = _load_config(K2_CONFIG_PATH)
    return web.json_response({
        "selected_model":        cfg.get("selected_model",        "krea2_turbo_fp8_scaled.safetensors"),
        "selected_text_encoder": cfg.get("selected_text_encoder", "qwen3vl_4b_fp8_scaled.safetensors"),
        "selected_vae":          cfg.get("selected_vae",          "qwen_image_vae.safetensors"),
        "save_subfolder":        cfg.get("save_subfolder")        or K2_SUBFOLDER,
        "negative_prompt":       cfg.get("negative_prompt",       ""),
        "prompt_suffix":         cfg.get("prompt_suffix",         ""),
        "control_lora":          cfg.get("control_lora",          "none"),
        "control_lora_depth":    cfg.get("control_lora_depth",    cfg.get("control_lora", "none")),
        "control_lora_canny":    cfg.get("control_lora_canny",    "none"),
        "control_strength":      cfg.get("control_strength",      1.0),
        "control_channel_mode":  cfg.get("control_channel_mode",  "rgb"),
        "control_normalize":     cfg.get("control_normalize",     "per_image_minmax"),
        "control_invert":        cfg.get("control_invert",        False),
        "depth_ckpt":            cfg.get("depth_ckpt",            "depth_anything_v2_vitl.pth"),
        "preproc_resolution":    cfg.get("preproc_resolution",    512),
        "identity_lora":          cfg.get("identity_lora",          "none"),
        "identity_lora_strength": cfg.get("identity_lora_strength", 1.0),
    })


@PromptServer.instance.routes.post("/krea2_one/config")
async def k2_save_config(request):
    try:
        patch = await request.json()
        if not isinstance(patch, dict):
            return web.json_response({"ok": False, "error": "invalid payload"}, status=400)
        cfg = _load_config(K2_CONFIG_PATH)
        cfg.update(patch)
        _save_config(K2_CONFIG_PATH, cfg)
        return web.json_response({"ok": True})
    except Exception as e:
        return web.json_response({"ok": False, "error": str(e)}, status=500)


@PromptServer.instance.routes.get("/krea2_one/seedvr2_models")
async def k2_get_seedvr2_models(request):
    seedvr2_dir = os.path.join(folder_paths.models_dir, "SEEDVR2")
    models = _scan_path(seedvr2_dir)
    return web.json_response({"models": models})


@PromptServer.instance.routes.get("/krea2_one/models")
async def k2_get_models(request):
    try:
        diff = _scan("diffusion_models")
    except Exception:
        diff = ["none"]
    try:
        gguf_list = _scan("gguf", extensions=[".gguf"])
    except Exception:
        gguf_list = []
    try:
        te = _scan("text_encoders")
    except Exception:
        te = ["none"]
    try:
        vaes = _scan("vae")
    except Exception:
        vaes = ["none"]
    loras = _scan("loras")
    # Merge gguf into diffusion_models list for model selector
    all_models = list(dict.fromkeys([m for m in diff + gguf_list if m != "none"])) or ["none"]
    return web.json_response({
        "diffusion_models": all_models,
        "gguf": gguf_list if gguf_list else [],
        "text_encoders": te,
        "vaes": vaes,
        "loras": loras,
    })


_k2_last_images: dict = {}


@PromptServer.instance.routes.post("/krea2_one/set_last_image")
async def k2_set_last_image(request):
    data = await request.json()
    uid = str(data.get("unique_id", ""))
    if uid:
        _k2_last_images[uid] = data.get("image", {})
    return web.json_response({"ok": True})


# ════════════════════════════════════════════════════════════════════════════════
# Route registration — sdxl_one
# ════════════════════════════════════════════════════════════════════════════════

PromptServer.instance.routes.get("/sdxl_one/gallery")(_make_gallery_handler(SDXL_SUBFOLDER, "sdxl_one"))
PromptServer.instance.routes.post("/sdxl_one/save_meta")(_make_save_meta_handler("sdxl_one"))
PromptServer.instance.routes.post("/sdxl_one/update_meta")(_make_update_meta_handler("sdxl_one"))
PromptServer.instance.routes.get("/sdxl_one/meta")(_make_meta_get_handler())
PromptServer.instance.routes.post("/sdxl_one/open_folder")(_make_open_folder_handler())
PromptServer.instance.routes.post("/sdxl_one/delete")(_make_delete_handler("sdxl_one"))
PromptServer.instance.routes.post("/sdxl_one/copy_to_input")(_make_copy_to_input_handler("sdxl"))
PromptServer.instance.routes.get("/sdxl_one/lora_triggers")(_make_lora_triggers_handler())


@PromptServer.instance.routes.get("/sdxl_one/config")
async def sdxl_get_config(request):
    cfg = _load_config(SDXL_CONFIG_PATH)
    return web.json_response({
        "model_loader_mode":    cfg.get("model_loader_mode",    "checkpoint"),
        "checkpoint":           cfg.get("checkpoint",           "none"),
        "refiner_checkpoint":   cfg.get("refiner_checkpoint",   "none"),
        "use_refiner":          cfg.get("use_refiner",          False),
        "refiner_step_frac":    cfg.get("refiner_step_frac",    0.8),
        "unet":                 cfg.get("unet",                 "none"),
        "clip_l":               cfg.get("clip_l",               "none"),
        "clip_g":               cfg.get("clip_g",               "none"),
        "vae":                  cfg.get("vae",                  "none"),
        "negative_prompt":      cfg.get("negative_prompt",      ""),
        "prompt_suffix":        cfg.get("prompt_suffix",        ""),
        "save_subfolder":       cfg.get("save_subfolder")       or SDXL_SUBFOLDER,
        "language":             cfg.get("language",             "en"),
    })


@PromptServer.instance.routes.post("/sdxl_one/config")
async def sdxl_save_config(request):
    try:
        patch = await request.json()
        if not isinstance(patch, dict):
            return web.json_response({"ok": False, "error": "invalid payload"}, status=400)
        cfg = _load_config(SDXL_CONFIG_PATH)
        cfg.update(patch)
        _save_config(SDXL_CONFIG_PATH, cfg)
        return web.json_response({"ok": True})
    except Exception as e:
        return web.json_response({"ok": False, "error": str(e)}, status=500)


@PromptServer.instance.routes.get("/sdxl_one/models")
async def sdxl_get_models(request):
    try:
        checkpoints = _scan("checkpoints")
    except Exception:
        checkpoints = ["none"]
    try:
        unets = _scan("unet") if hasattr(folder_paths, "get_folder_paths") else ["none"]
    except Exception:
        unets = ["none"]
    try:
        diff = _scan("diffusion_models")
    except Exception:
        diff = ["none"]
    all_unets = list(dict.fromkeys([m for m in unets + diff if m != "none"])) or ["none"]
    try:
        te = _scan("text_encoders")
    except Exception:
        te = ["none"]
    try:
        vaes = _scan("vae")
    except Exception:
        vaes = ["none"]
    loras = _scan("loras")
    return web.json_response({
        "checkpoints":    checkpoints,
        "unets":          all_unets,
        "text_encoders":  te,
        "vaes":           vaes,
        "loras":          loras,
    })


@PromptServer.instance.routes.get("/sdxl_one/esrgan_models")
async def sdxl_get_esrgan_models(request):
    upscale_dir = os.path.join(folder_paths.models_dir, "upscale_models")
    models = _scan_path(upscale_dir, extensions=[".pt", ".pth", ".safetensors", ".bin"])
    return web.json_response({"models": models})


@PromptServer.instance.routes.get("/sdxl_one/seedvr2_models")
async def sdxl_get_seedvr2_models(request):
    seedvr2_dir = os.path.join(folder_paths.models_dir, "SEEDVR2")
    models = _scan_path(seedvr2_dir)
    return web.json_response({"models": models})


_sdxl_last_images: dict = {}


@PromptServer.instance.routes.post("/sdxl_one/set_last_image")
async def sdxl_set_last_image(request):
    data = await request.json()
    uid = str(data.get("unique_id", ""))
    if uid:
        _sdxl_last_images[uid] = data.get("image", {})
    return web.json_response({"ok": True})


# ════════════════════════════════════════════════════════════════════════════════
# Qwen Image Edit 2511 ONE — routes
# ════════════════════════════════════════════════════════════════════════════════

PromptServer.instance.routes.get("/qwen2511_one/gallery")(_make_gallery_handler(QE_SUBFOLDER, "qwen2511"))


@PromptServer.instance.routes.post("/qwen2511_one/save_meta")
async def qe_save_meta(request):
    data = await request.json()
    output_dir = _get_output_dir()
    try:
        path = _safe_resolve_output_path(output_dir, data.get("subfolder",""), data.get("filename",""))
        _write_meta(path, data.get("meta", {}))
    except Exception as e:
        return web.json_response({"ok": False, "error": str(e)})
    return web.json_response({"ok": True})


@PromptServer.instance.routes.post("/qwen2511_one/update_meta")
async def qe_update_meta(request):
    data = await request.json()
    output_dir = _get_output_dir()
    try:
        path = _safe_resolve_output_path(output_dir, data.get("subfolder",""), data.get("filename",""))
        meta = _read_meta(path)
        meta.update(data.get("patch", {}))
        _write_meta(path, meta)
    except Exception as e:
        return web.json_response({"ok": False, "error": str(e)})
    return web.json_response({"ok": True})


@PromptServer.instance.routes.get("/qwen2511_one/meta")
async def qe_meta(request):
    output_dir = _get_output_dir()
    filename  = request.rel_url.query.get("filename","")
    subfolder = request.rel_url.query.get("subfolder","")
    try:
        path = _safe_resolve_output_path(output_dir, subfolder, filename)
        return web.json_response(_read_meta(path))
    except Exception as e:
        return web.json_response({"error": str(e)})


@PromptServer.instance.routes.post("/qwen2511_one/open_folder")
async def qe_open_folder(request):
    data = await request.json()
    output_dir = _get_output_dir()
    try:
        path = _safe_resolve_output_path(output_dir, data.get("subfolder",""), data.get("filename",""))
        folder = str(Path(path).parent)
        if os.name == "nt":
            _open_in_file_manager(["explorer", folder])
        elif os.uname().sysname == "Darwin":
            _open_in_file_manager(["open", folder])
        else:
            _open_in_file_manager(["xdg-open", folder])
    except Exception as e:
        return web.json_response({"ok": False, "error": str(e)})
    return web.json_response({"ok": True})


@PromptServer.instance.routes.post("/qwen2511_one/delete")
async def qe_delete(request):
    data = await request.json()
    output_dir = _get_output_dir()
    try:
        path = _safe_resolve_output_path(output_dir, data.get("subfolder",""), data.get("filename",""))
        if os.path.exists(path):
            os.remove(path)
        meta = path + ".meta.json"
        if os.path.exists(meta):
            os.remove(meta)
    except Exception as e:
        return web.json_response({"ok": False, "error": str(e)})
    return web.json_response({"ok": True})


@PromptServer.instance.routes.post("/qwen2511_one/copy_to_input")
async def qe_copy_to_input(request):
    data      = await request.json()
    filename  = data.get("filename","")
    subfolder = data.get("subfolder","") or ""
    img_type  = data.get("type","output")
    try:
        if img_type == "output":
            base = _get_output_dir()
        elif img_type == "temp":
            base = folder_paths.get_temp_directory()
        else:
            base = folder_paths.get_input_directory()
        src = _safe_resolve_path(base, subfolder, filename)
        dst_dir  = folder_paths.get_input_directory()
        dst_name = f"qe2511_{int(time.time()*1000)}_{os.path.basename(filename)}"
        dst_path = os.path.join(dst_dir, dst_name)
        shutil.copy2(src, dst_path)
        return web.json_response({"ok": True, "filename": dst_name})
    except Exception as e:
        return web.json_response({"ok": False, "error": str(e)})


@PromptServer.instance.routes.get("/qwen2511_one/lora_triggers")
async def qe_lora_triggers(request):
    name = request.rel_url.query.get("name","")
    triggers = _get_lora_triggers(name)
    return web.json_response({"ok": bool(triggers), "triggers": triggers})


@PromptServer.instance.routes.get("/qwen2511_one/seedvr2_models")
async def qe_seedvr2_models(request):
    seedvr2_dir = os.path.join(folder_paths.models_dir, "SEEDVR2")
    models = _scan_path(seedvr2_dir) if os.path.isdir(seedvr2_dir) else []
    return web.json_response({"models": models or ["none"]})


@PromptServer.instance.routes.get("/qwen2511_one/config")
async def qe_get_config(request):
    try:
        with open(QE_CONFIG_PATH, "r", encoding="utf-8") as f:
            return web.json_response(json.load(f))
    except Exception:
        return web.json_response({})


@PromptServer.instance.routes.post("/qwen2511_one/config")
async def qe_post_config(request):
    data = await request.json()
    try:
        try:
            with open(QE_CONFIG_PATH, "r", encoding="utf-8") as f:
                cfg = json.load(f)
        except Exception:
            cfg = {}
        cfg.update(data)
        with open(QE_CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2)
    except Exception as e:
        return web.json_response({"ok": False, "error": str(e)})
    return web.json_response({"ok": True})


@PromptServer.instance.routes.get("/qwen2511_one/models")
async def qe_get_models(request):
    try:
        diff = _scan("diffusion_models")
    except Exception:
        diff = ["none"]
    try:
        gguf_list = _scan("gguf", extensions=[".gguf"])
    except Exception:
        gguf_list = []
    try:
        te = _scan("text_encoders")
    except Exception:
        te = ["none"]
    try:
        vaes = _scan("vae")
    except Exception:
        vaes = ["none"]
    loras = _scan("loras")
    all_models = list(dict.fromkeys([m for m in diff + gguf_list if m != "none"])) or ["none"]
    return web.json_response({
        "diffusion_models": all_models,
        "gguf": gguf_list if gguf_list else [],
        "text_encoders": te,
        "vaes": vaes,
        "loras": loras,
    })


_qe_last_images: dict = {}


@PromptServer.instance.routes.post("/qwen2511_one/set_last_image")
async def qe_set_last_image(request):
    data = await request.json()
    uid = str(data.get("unique_id", ""))
    if uid:
        _qe_last_images[uid] = data.get("image", {})
    return web.json_response({"ok": True})


# ════════════════════════════════════════════════════════════════════════════════
# Prompt Studio (LLM) API — delegates to TJ_NODE2 if installed
# ════════════════════════════════════════════════════════════════════════════════

_tj_llm_cache = None  # cached (PromptEnhancer, ImageToPrompt, utils) or (None, None, None)

def _try_import_tj_llm():
    """Load TJ_NODE LLM classes.
    Registers the llm package under a unique alias to avoid colliding with ComfyUI's own 'nodes' module."""
    global _tj_llm_cache
    if _tj_llm_cache is not None:
        return _tj_llm_cache

    import importlib, importlib.util, sys, types
    custom_nodes_dir = os.path.dirname(NODE_DIR)
    candidates = ["ComfyUI-TJ_NODE", "ComfyUI-TJ_NODE2", "TJ_NODE"]

    for folder in candidates:
        tj_root = os.path.join(custom_nodes_dir, folder)
        llm_dir = os.path.join(tj_root, "nodes", "llm")
        if not os.path.isdir(llm_dir):
            continue
        try:
            # Register fake parent packages so relative imports inside llm/*.py resolve correctly.
            # We use alias prefix "_tjnode_" to avoid clashing with the real "nodes" package.
            pkg_root  = "_tjnode_nodes"
            pkg_llm   = "_tjnode_nodes.llm"

            if pkg_root not in sys.modules:
                root_pkg = types.ModuleType(pkg_root)
                root_pkg.__path__ = [os.path.join(tj_root, "nodes")]
                root_pkg.__package__ = pkg_root
                sys.modules[pkg_root] = root_pkg

            if pkg_llm not in sys.modules:
                llm_pkg = types.ModuleType(pkg_llm)
                llm_pkg.__path__ = [llm_dir]
                llm_pkg.__package__ = pkg_llm
                llm_pkg.__file__ = os.path.join(llm_dir, "__init__.py")
                sys.modules[pkg_llm] = llm_pkg

            def _load(mod_name):
                full_key = f"{pkg_llm}.{mod_name}"
                if full_key in sys.modules:
                    return sys.modules[full_key]
                filepath = os.path.join(llm_dir, f"{mod_name}.py")
                spec = importlib.util.spec_from_file_location(full_key, filepath,
                    submodule_search_locations=[])
                mod = importlib.util.module_from_spec(spec)
                mod.__package__ = pkg_llm
                sys.modules[full_key] = mod
                spec.loader.exec_module(mod)
                return mod

            utils = _load("_llm_utils")
            pe    = _load("prompt_enhancer")
            i2p   = _load("image_to_prompt")
            result = (pe.TJ_PromptEnhancer, i2p.TJ_ImageToPrompt, utils)
            _tj_llm_cache = result
            print(f"[TJ_STUDIO_ONE] TJ_NODE LLM loaded from '{folder}'")
            return result
        except Exception as e:
            print(f"[TJ_STUDIO_ONE] TJ_NODE load from '{folder}' failed: {e}")
            for key in list(sys.modules.keys()):
                if key.startswith("_tjnode_nodes.llm."):
                    sys.modules.pop(key, None)

    print("[TJ_STUDIO_ONE] TJ_NODE not found. Install ComfyUI-TJ_NODE to enable LLM features.")
    _tj_llm_cache = (None, None, None)
    return None, None, None


TJ_NODE_REPO = "https://github.com/designloves2/ComfyUI-TJ_NODE"
TJ_NODE_FOLDER = "ComfyUI-TJ_NODE"


@PromptServer.instance.routes.post("/tj_studio_one/llm/download_image")
async def studio_llm_download_image(request):
    """Download an image from a URL, save to input/download/, return base64 preview."""
    import asyncio, base64, urllib.request, urllib.error
    from io import BytesIO
    data = await request.json()
    url = (data.get("url") or "").strip()
    if not url:
        return web.json_response({"ok": False, "error": "No URL provided"})
    try:
        download_dir = os.path.join(folder_paths.get_input_directory(), "download")
        os.makedirs(download_dir, exist_ok=True)

        # Sanitise filename from URL
        raw_name = os.path.basename(url.split("?")[0]) or "image"
        if not any(raw_name.lower().endswith(ext) for ext in (".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp")):
            raw_name += ".jpg"
        safe_name = "".join(c if c.isalnum() or c in "._-" else "_" for c in raw_name)
        dest_path = os.path.join(download_dir, safe_name)

        def _fetch():
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.read()

        loop = asyncio.get_event_loop()
        img_bytes = await loop.run_in_executor(None, _fetch)

        # Validate it's actually an image and save
        pil_img = Image.open(BytesIO(img_bytes)).convert("RGB")
        pil_img.save(dest_path)

        # Return base64 for frontend preview (resize to ≤1024 to keep payload small)
        MAX_PREVIEW = 1024
        if max(pil_img.size) > MAX_PREVIEW:
            pil_img.thumbnail((MAX_PREVIEW, MAX_PREVIEW), Image.LANCZOS)
        buf = BytesIO()
        pil_img.save(buf, format="JPEG", quality=85)
        b64 = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()

        return web.json_response({"ok": True, "filename": safe_name, "b64": b64})
    except urllib.error.URLError as e:
        return web.json_response({"ok": False, "error": f"Download failed: {e.reason}"})
    except Exception as e:
        return web.json_response({"ok": False, "error": str(e)})


@PromptServer.instance.routes.post("/tj_studio_one/llm/install_tj_node")
async def studio_llm_install(request):
    import asyncio
    custom_nodes_dir = os.path.dirname(NODE_DIR)
    target = os.path.join(custom_nodes_dir, TJ_NODE_FOLDER)
    if os.path.isdir(target):
        return web.json_response({"ok": True, "msg": "Already installed"})
    try:
        proc = await asyncio.create_subprocess_exec(
            "git", "clone", "--depth=1", TJ_NODE_REPO, target,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=120)
        if proc.returncode == 0:
            # Run pip install if requirements.txt exists
            req = os.path.join(target, "requirements.txt")
            if os.path.isfile(req):
                import sys
                pip_proc = await asyncio.create_subprocess_exec(
                    sys.executable, "-m", "pip", "install", "-r", req, "--quiet",
                    stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
                )
                await asyncio.wait_for(pip_proc.communicate(), timeout=180)
            return web.json_response({"ok": True, "msg": "Installed. Please restart ComfyUI."})
        else:
            return web.json_response({"ok": False, "error": stderr.decode("utf-8", errors="replace")})
    except asyncio.TimeoutError:
        return web.json_response({"ok": False, "error": "Timeout during installation"})
    except Exception as e:
        return web.json_response({"ok": False, "error": str(e)})


@PromptServer.instance.routes.get("/tj_studio_one/llm/models")
async def studio_llm_models(request):
    _, _, utils = _try_import_tj_llm()
    if utils is None:
        return web.json_response({"ok": False, "error": "TJ_NODE2 not installed", "gguf": [], "mmproj": []})
    try:
        gguf_list = utils._text_encoder_ggufs(exclude_mmproj=True)
        mmproj_list = utils._text_encoder_mmproj_options()
        vision_tasks = utils._load_json_data("vision_tasks.json", [])
        vision_task_names = [t["name"] for t in vision_tasks] if vision_tasks else [
            "Caption (plain description)", "Caption + Format (apply model_format below)",
            "SD/Booru Tags", "Pose & Anatomy Focus", "Custom Instruction",
        ]
        model_formats = getattr(utils, "MODEL_FORMAT_OPTIONS", ["Universal Natural Language"])
        aesthetics    = getattr(utils, "AESTHETIC_OPTIONS",    ["None (no aesthetic injection)"])
        purposes      = getattr(utils, "PURPOSE_OPTIONS",      ["Image", "Video", "Edit (Inpainting/I2V)"])
        return web.json_response({
            "ok": True,
            "gguf": gguf_list, "mmproj": mmproj_list,
            "vision_tasks": vision_task_names,
            "model_formats": model_formats,
            "aesthetics": aesthetics,
            "purposes": purposes,
        })
    except Exception as e:
        return web.json_response({"ok": False, "error": str(e), "gguf": [], "mmproj": []})


@PromptServer.instance.routes.post("/tj_studio_one/llm/enhance")
async def studio_llm_enhance(request):
    import asyncio
    data = await request.json()
    TJ_PromptEnhancer, _, _ = _try_import_tj_llm()
    if TJ_PromptEnhancer is None:
        return web.json_response({"ok": False, "error": "TJ_NODE2 not installed"})
    try:
        loop = asyncio.get_event_loop()
        def _run():
            result = TJ_PromptEnhancer().enhance(
                get_name="(none)", set_name="studio_one_enhance",
                raw_prompt=data.get("prompt", ""),
                model_backend="GGUF / llama.cpp",
                gguf_model=data.get("gguf_model", ""),
                mmproj_file="none",
                text_encoder_name="",
                clip_loader_type="Auto",
                purpose=data.get("purpose", "Image"),
                model_format=data.get("model_format", "Universal Natural Language"),
                aesthetic=data.get("aesthetic", "None (no aesthetic injection)"),
                extra_instructions=data.get("extra_instructions", ""),
                system_prompt_override="",
                append_no_think=True,
                n_gpu_layers=int(data.get("n_gpu_layers", -1)),
                n_ctx=int(data.get("n_ctx", 4096)),
                max_tokens=int(data.get("max_tokens", 1000)),
                temperature=float(data.get("temperature", 0.7)),
                top_p=0.9,
                repeat_penalty=1.15,
                seed=int(data.get("seed", 0)),
                lock_in=False,
                raw_prompt_input=None,
                clip=None,
            )
            return result
        out = await loop.run_in_executor(None, _run)
        return web.json_response({"ok": True, "result": out[0] if isinstance(out, (list, tuple)) else str(out)})
    except Exception as e:
        return web.json_response({"ok": False, "error": str(e)})


@PromptServer.instance.routes.post("/tj_studio_one/llm/image_to_prompt")
async def studio_llm_image_to_prompt(request):
    import asyncio, base64
    from io import BytesIO
    data = await request.json()
    _, TJ_ImageToPrompt, _ = _try_import_tj_llm()
    if TJ_ImageToPrompt is None:
        return web.json_response({"ok": False, "error": "TJ_NODE2 not installed"})
    try:
        # Decode base64 image → numpy tensor [1, H, W, 3] float32
        img_b64 = data.get("image_b64", "")
        if not img_b64:
            return web.json_response({"ok": False, "error": "No image data"})
        img_bytes = base64.b64decode(img_b64.split(",")[-1])
        pil_img = Image.open(BytesIO(img_bytes)).convert("RGB")
        arr = np.array(pil_img).astype(np.float32) / 255.0
        image_tensor = torch.from_numpy(arr)[None,]

        loop = asyncio.get_event_loop()
        def _run():
            return TJ_ImageToPrompt().describe(
                get_name="(none)", set_name="studio_one_i2p",
                image=image_tensor,
                model_backend="GGUF / llama.cpp",
                gguf_model=data.get("gguf_model", ""),
                mmproj_file=data.get("mmproj_file", "none"),
                chat_handler=data.get("chat_handler", "Auto-detect"),
                text_encoder_name="",
                clip_loader_type="Auto",
                vision_task=data.get("vision_task", "Caption (plain description)"),
                model_format=data.get("model_format", "Universal Natural Language"),
                aesthetic=data.get("aesthetic", "None (no aesthetic injection)"),
                custom_instruction=data.get("custom_instruction", ""),
                n_gpu_layers=int(data.get("n_gpu_layers", -1)),
                n_ctx=int(data.get("n_ctx", 4096)),
                max_tokens=int(data.get("max_tokens", 1000)),
                temperature=float(data.get("temperature", 0.7)),
                seed=int(data.get("seed", 0)),
                lock_in=False,
                clip=None,
            )
        out = await loop.run_in_executor(None, _run)
        return web.json_response({"ok": True, "result": out[0] if isinstance(out, (list, tuple)) else str(out)})
    except Exception as e:
        return web.json_response({"ok": False, "error": str(e)})


# ════════════════════════════════════════════════════════════════════════════════
# Route registration — minimax_h3_one
# ════════════════════════════════════════════════════════════════════════════════

PromptServer.instance.routes.get("/minimax_h3_one/gallery")(_make_gallery_handler(MMH3_SUBFOLDER, "minimax_h3"))
PromptServer.instance.routes.post("/minimax_h3_one/save_meta")(_make_save_meta_handler("minimax_h3"))
PromptServer.instance.routes.post("/minimax_h3_one/update_meta")(_make_update_meta_handler("minimax_h3"))
PromptServer.instance.routes.get("/minimax_h3_one/meta")(_make_meta_get_handler())
PromptServer.instance.routes.post("/minimax_h3_one/open_folder")(_make_open_folder_handler())
PromptServer.instance.routes.post("/minimax_h3_one/delete")(_make_delete_handler("minimax_h3"))
PromptServer.instance.routes.post("/minimax_h3_one/copy_to_input")(_make_copy_to_input_handler("mmh3"))
PromptServer.instance.routes.get("/minimax_h3_one/lora_triggers")(_make_lora_triggers_handler())


@PromptServer.instance.routes.get("/minimax_h3_one/videos")
async def mmh3_list_videos(request):
    """Clips and stitched files in the node's output folder, newest first.

    The shared gallery handler only globs PNGs; this node's results are videos.
    """
    output_dir = _get_output_dir()
    try:
        offset = max(0, int(request.query.get("offset", 0)))
    except Exception:
        offset = 0
    try:
        limit = min(max(1, int(request.query.get("limit", 60))), 300)
    except Exception:
        limit = 60
    subf = request.query.get("subfolder", "") or MMH3_SUBFOLDER
    try:
        search = _safe_resolve_output_path(output_dir, subf)
    except ValueError:
        return web.json_response({"videos": [], "total": 0, "error": "invalid subfolder"}, status=400)

    found = []
    if search and os.path.isdir(search):
        for ext in ("*.mp4", "*.webm", "*.mkv", "*.mov"):
            found += glob.glob(os.path.join(search, "**", ext), recursive=True)
    found = sorted(set(found), key=os.path.getmtime, reverse=True)

    videos = []
    for f in found[offset:offset + limit]:
        rel = os.path.relpath(os.path.dirname(f), output_dir)
        name = os.path.basename(f)
        videos.append({
            "filename": name,
            "subfolder": "" if rel == "." else rel.replace("\\", "/"),
            "mtime": os.path.getmtime(f),
            "size": os.path.getsize(f),
            # the stitched result is the interesting one, so flag it for the UI
            "is_full": "_full" in name.lower(),
        })
    return web.json_response({"videos": videos, "total": len(found), "offset": offset, "limit": limit})


@PromptServer.instance.routes.get("/minimax_h3_one/media_info")
async def mmh3_media_info(request):
    """Duration / audio-track presence for a file in ComfyUI's input folder.

    Asking VHS_LoadVideo for the AUDIO output of a silent clip aborts the whole prompt,
    so the UI needs to know up front whether a reference video actually has sound (and
    how long it is, to keep the in/out fields inside the file).
    """
    name = request.query.get("file", "") or ""
    if not name:
        return web.json_response({"ok": False, "error": "no file"}, status=400)
    try:
        base = folder_paths.get_input_directory()
        path = _safe_resolve_path(base, os.path.dirname(name), os.path.basename(name))
    except ValueError:
        return web.json_response({"ok": False, "error": "invalid path"}, status=400)
    if not path or not os.path.isfile(path):
        return web.json_response({"ok": False, "error": "file not found"}, status=404)

    ffmpeg = _ffmpeg_exe()
    if not ffmpeg:
        return web.json_response({"ok": False, "error": "ffmpeg not found"}, status=500)
    try:
        # `ffmpeg -i` with no output prints the stream table to stderr and exits non-zero.
        proc = subprocess.run([ffmpeg, "-hide_banner", "-i", path],
                              capture_output=True, text=True, timeout=60)
        info = proc.stderr or ""
    except subprocess.TimeoutExpired:
        return web.json_response({"ok": False, "error": "ffmpeg timed out"}, status=500)
    except Exception as e:
        return web.json_response({"ok": False, "error": str(e)}, status=500)

    duration = 0.0
    for line in info.splitlines():
        s = line.strip()
        if s.startswith("Duration:"):
            try:
                hh, mm, ss = s.split(",")[0].replace("Duration:", "").strip().split(":")
                duration = int(hh) * 3600 + int(mm) * 60 + float(ss)
            except Exception:
                pass
            break
    fps = 0.0
    for line in info.splitlines():
        if "Video:" in line:
            for part in line.split(","):
                p = part.strip()
                if p.endswith("fps"):
                    try:
                        fps = float(p[:-3].strip())
                    except Exception:
                        pass
            break
    return web.json_response({
        "ok": True, "file": name,
        "duration": round(duration, 3),
        "has_audio": "Audio:" in info,
        "has_video": "Video:" in info,
        "fps": fps,
    })


@PromptServer.instance.routes.post("/minimax_h3_one/reveal")
async def mmh3_reveal(request):
    """Open the output folder in the OS file manager (no filename needed)."""
    try:
        data = await request.json()
    except Exception:
        data = {}
    output_dir = _get_output_dir()
    subf = (data.get("subfolder") or MMH3_SUBFOLDER)
    try:
        target = _safe_resolve_output_path(output_dir, subf)
    except ValueError:
        return web.json_response({"ok": False, "error": "invalid subfolder"}, status=400)
    if not target or not os.path.isdir(target):
        target = output_dir
    try:
        if os.name == "nt":
            _open_in_file_manager(["explorer", os.path.normpath(target)])
        elif sys.platform == "darwin":
            _open_in_file_manager(["open", target])
        else:
            _open_in_file_manager(["xdg-open", target])
        return web.json_response({"ok": True, "path": target})
    except Exception as e:
        return web.json_response({"ok": False, "error": str(e)}, status=500)


@PromptServer.instance.routes.get("/minimax_h3_one/config")
async def mmh3_get_config(request):
    cfg = _load_config(MMH3_CONFIG_PATH)
    return web.json_response({
        "unet_first_last":  cfg.get("unet_first_last",  ""),
        "unet_reference":   cfg.get("unet_reference",   ""),
        "clip_name":        cfg.get("clip_name",        ""),
        "vae_video":        cfg.get("vae_video",        ""),
        "vae_audio":        cfg.get("vae_audio",        ""),
        "turbo_lora":       cfg.get("turbo_lora",       ""),
        "turbo_lora_strength": cfg.get("turbo_lora_strength", 1.0),
        "upscale_model":    cfg.get("upscale_model",    ""),
        "save_subfolder":   cfg.get("save_subfolder")   or MMH3_SUBFOLDER,
        "negative_prompt":  cfg.get("negative_prompt",  ""),
        "prompt_suffix":    cfg.get("prompt_suffix",    ""),
        "avg_minutes_per_clip": cfg.get("avg_minutes_per_clip", 13.0),
        "output_mode_visible": cfg.get("output_mode_visible", True),
    })


@PromptServer.instance.routes.post("/minimax_h3_one/config")
async def mmh3_save_config(request):
    try:
        patch = await request.json()
        if not isinstance(patch, dict):
            return web.json_response({"ok": False, "error": "invalid payload"}, status=400)
        cfg = _load_config(MMH3_CONFIG_PATH)
        cfg.update(patch)
        _save_config(MMH3_CONFIG_PATH, cfg)
        return web.json_response({"ok": True})
    except Exception as e:
        return web.json_response({"ok": False, "error": str(e)}, status=500)


@PromptServer.instance.routes.get("/minimax_h3_one/models")
async def mmh3_get_models(request):
    def scan(key, ext=None):
        try:
            return _scan(key, extensions=ext)
        except Exception:
            return ["none"]
    try:
        gguf_list = _scan("gguf", extensions=[".gguf"])
    except Exception:
        gguf_list = []
    diff = scan("diffusion_models")
    all_unets = list(dict.fromkeys([m for m in diff + gguf_list if m != "none"])) or ["none"]
    return web.json_response({
        "diffusion_models": all_unets,
        "text_encoders":    scan("text_encoders"),
        "vaes":             scan("vae"),
        "loras":            scan("loras"),
        "upscale_models":   scan("upscale_models"),
    })


# Third-party nodes the pipeline can use. The UI disables the matching feature when
# a pack is missing instead of failing the whole graph (see SPEC_MINIMAX_H3_RELAY §4-3).
MMH3_OPTIONAL_NODES = [
    "PathchSageAttentionKJ",
    "ModelPreviewOverrideKJ",
    "ModelPatchTorchSettings",
    "MiniMaxH3MemoryEfficientSageAttentionPatch",
    "MiniMaxH3Cache",
    "MiniMaxH3TurboSampler",
    "MiniMaxH3TurboLoRA",
    "SolAttnPatch",
    "SpectrumApplyMiniMaxH3",
    "RTXVideoSuperResolution",
    # reference video / audio inputs
    "VHS_LoadVideo",
    "LoadAudio",
    "TrimAudioDuration",
]
MMH3_CORE_NODES = [
    "MiniMaxH3ImageToVideo",
    "MiniMaxH3ReferenceToVideo",
    "MiniMaxH3SigmaShift",
    "SamplerCustomAdvanced",
    "CreateVideo",
    "SaveVideo",
]


@PromptServer.instance.routes.get("/minimax_h3_one/node_availability")
async def mmh3_node_availability(request):
    """Which pipeline nodes are registered on this install (never imports them)."""
    try:
        import nodes as comfy_nodes
        registered = comfy_nodes.NODE_CLASS_MAPPINGS
    except Exception:
        registered = {}
    avail = {n: (n in registered) for n in (MMH3_CORE_NODES + MMH3_OPTIONAL_NODES)}
    return web.json_response({
        "ok": True,
        "available": avail,
        "core_ok": all(avail.get(n, False) for n in MMH3_CORE_NODES),
        "missing_core": [n for n in MMH3_CORE_NODES if not avail.get(n, False)],
        "missing_optional": [n for n in MMH3_OPTIONAL_NODES if not avail.get(n, False)],
    })


def _ffmpeg_exe():
    """Prefer imageio-ffmpeg's bundled binary; fall back to one on PATH."""
    try:
        import imageio_ffmpeg
        exe = imageio_ffmpeg.get_ffmpeg_exe()
        if exe and os.path.isfile(exe):
            return exe
    except Exception:
        pass
    return shutil.which("ffmpeg")


@PromptServer.instance.routes.post("/minimax_h3_one/stitch")
async def mmh3_stitch(request):
    """Concatenate the per-clip video files into one file (stream copy, no re-encode).

    Body: {clips: [{filename, subfolder}], filename_prefix, trim_seconds (optional)}
    """
    try:
        data = await request.json()
        clips = data.get("clips") or []
        if not isinstance(clips, list) or not clips:
            return web.json_response({"ok": False, "error": "no clips supplied"}, status=400)

        ffmpeg = _ffmpeg_exe()
        if not ffmpeg:
            return web.json_response({"ok": False, "error": "ffmpeg not found (install imageio-ffmpeg)"}, status=500)

        out_dir = _get_output_dir()
        paths = []
        for c in clips:
            if not isinstance(c, dict):
                continue
            p = _safe_resolve_output_path(out_dir, c.get("subfolder", "") or "", c.get("filename", "") or "")
            if p and os.path.isfile(p):
                paths.append(p)
        if not paths:
            return web.json_response({"ok": False, "error": "none of the clip files were found"}, status=400)

        prefix = (data.get("filename_prefix") or f"{MMH3_SUBFOLDER}/MMH3_full").replace("\\", "/")
        sub = os.path.dirname(prefix) or MMH3_SUBFOLDER
        stem = os.path.basename(prefix) or "MMH3_full"
        dest_dir = _safe_resolve_output_path(out_dir, sub, "")
        if not dest_dir:
            return web.json_response({"ok": False, "error": "invalid filename_prefix"}, status=400)
        os.makedirs(dest_dir, exist_ok=True)

        ts = time.strftime("%Y%m%d-%H%M%S")
        out_name = f"{stem}_{ts}.mp4"
        out_path = os.path.join(dest_dir, out_name)

        # concat demuxer needs a list file; quote-escape per ffmpeg's rules
        list_path = os.path.join(dest_dir, f".concat_{ts}.txt")
        with open(list_path, "w", encoding="utf-8") as fh:
            for p in paths:
                fh.write("file '%s'\n" % p.replace("\\", "/").replace("'", "'\\''"))

        cmd = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
               "-f", "concat", "-safe", "0", "-i", list_path]
        trim = data.get("trim_seconds")
        try:
            trim = float(trim) if trim is not None else None
        except (TypeError, ValueError):
            trim = None
        if trim and trim > 0:
            # re-encode when trimming so the cut lands on an exact timestamp
            cmd += ["-t", f"{trim:.3f}", "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-c:a", "aac"]
        else:
            cmd += ["-c", "copy"]
        cmd.append(out_path)

        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
        try:
            os.remove(list_path)
        except OSError:
            pass

        if proc.returncode != 0 or not os.path.isfile(out_path):
            # stream copy fails on mismatched clip params — retry with a re-encode
            cmd_re = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
                      "-f", "concat", "-safe", "0", "-i", list_path]
            with open(list_path, "w", encoding="utf-8") as fh:
                for p in paths:
                    fh.write("file '%s'\n" % p.replace("\\", "/").replace("'", "'\\''"))
            cmd_re += ["-c:v", "libx264", "-crf", "18", "-preset", "medium", "-c:a", "aac"]
            if trim and trim > 0:
                cmd_re += ["-t", f"{trim:.3f}"]
            cmd_re.append(out_path)
            proc = subprocess.run(cmd_re, capture_output=True, text=True, timeout=3600)
            try:
                os.remove(list_path)
            except OSError:
                pass
            if proc.returncode != 0 or not os.path.isfile(out_path):
                return web.json_response(
                    {"ok": False, "error": (proc.stderr or "ffmpeg failed")[:800]}, status=500)

        return web.json_response({
            "ok": True, "filename": out_name, "subfolder": sub,
            "path": out_path, "clip_count": len(paths),
        })
    except subprocess.TimeoutExpired:
        return web.json_response({"ok": False, "error": "ffmpeg timed out"}, status=500)
    except Exception as e:
        return web.json_response({"ok": False, "error": str(e)}, status=500)


# ── Ollama prompt enhance ─────────────────────────────────────────────────────
# Proxied server-side so the browser isn't blocked by CORS and the Ollama host stays
# configurable. Nothing here is imported at module scope, so a missing Ollama install
# just means the Enhance button reports "unreachable".

MMH3_OLLAMA_DEFAULT = "http://127.0.0.1:11434"

# Used when TJ_NODE isn't installed. The full brief-writing instruction lives in
# ComfyUI-TJ_NODE/nodes/llm/data/model_formats.json as "Minimax H3 (Video)".
MMH3_FALLBACK_SYSTEM_PROMPT = (
    "You are a prompt-enrichment engine for a generative video+audio model. "
    "Convert the user's request into ONE detailed production brief. Output only the brief.\n"
    "Rules: refer to media as <Picture 1>/<Video 1>/<Audio 1> in input order; [Shot 1] has no "
    "timestamp and every later shot starts with \"[Shot N] At MM:SS.mmm, the camera cuts to ...\"; "
    "spoken words go inside <d>[Language] exact words</d>; on-screen text is quoted exactly; "
    "the shots must add up to the target duration. End with short \"Ambient sound:\" and \"Music:\" lines."
)


def _mmh3_tj_node_dir():
    base = os.path.dirname(NODE_DIR)
    for folder in ("ComfyUI-TJ_NODE", "ComfyUI-TJ_NODE2", "TJ_NODE"):
        p = os.path.join(base, folder, "nodes", "llm", "data", "model_formats.json")
        if os.path.isfile(p):
            return p
    return None


@PromptServer.instance.routes.get("/minimax_h3_one/llm/system_prompt")
async def mmh3_llm_system_prompt(request):
    """The MiniMax H3 brief-writing instruction, reused from TJ_NODE when present."""
    wanted = (request.query.get("name") or "minimax").lower()
    path = _mmh3_tj_node_dir()
    if path:
        try:
            with open(path, "r", encoding="utf-8") as fh:
                formats = json.load(fh)
            for entry in formats if isinstance(formats, list) else []:
                if not isinstance(entry, dict):
                    continue
                if wanted in str(entry.get("name", "")).lower():
                    return web.json_response({
                        "ok": True, "source": "TJ_NODE",
                        "name": entry.get("name"),
                        "instruction": entry.get("instruction", ""),
                    })
        except Exception as e:
            print(f"[MMH3] system_prompt read failed: {e}")
    return web.json_response({
        "ok": True, "source": "builtin",
        "name": "Minimax H3 (Video)",
        "instruction": MMH3_FALLBACK_SYSTEM_PROMPT,
    })


@PromptServer.instance.routes.get("/minimax_h3_one/llm/ollama_models")
async def mmh3_ollama_models(request):
    import aiohttp
    base = (request.query.get("server_url") or MMH3_OLLAMA_DEFAULT).rstrip("/")
    try:
        timeout = aiohttp.ClientTimeout(total=10)
        async with aiohttp.ClientSession(timeout=timeout) as s:
            async with s.get(f"{base}/api/tags") as r:
                data = await r.json()
        models = [m.get("name") for m in (data.get("models") or []) if m.get("name")]
        return web.json_response({"ok": True, "models": models, "server_url": base})
    except Exception as e:
        return web.json_response({"ok": False, "models": [], "error": str(e), "server_url": base})


@PromptServer.instance.routes.post("/minimax_h3_one/llm/enhance")
async def mmh3_llm_enhance(request):
    """Run one Ollama chat turn. `image_b64` (optional) switches the model to vision mode."""
    import aiohttp
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"ok": False, "error": "invalid payload"}, status=400)

    base = (body.get("server_url") or MMH3_OLLAMA_DEFAULT).rstrip("/")
    model = body.get("model") or ""
    if not model:
        return web.json_response({"ok": False, "error": "no model selected"}, status=400)

    system_prompt = body.get("system_prompt") or MMH3_FALLBACK_SYSTEM_PROMPT
    user_prompt = body.get("user_prompt") or ""
    image_b64 = body.get("image_b64") or ""
    if image_b64 and "," in image_b64[:64]:
        image_b64 = image_b64.split(",", 1)[1]      # strip a data: URI prefix
    if image_b64:
        # Ollama refuses some PNG variants outright ("Failed to load image or audio
        # file"), so normalize whatever we were handed to a plain RGB JPEG and cap the
        # long edge — vision encoders downscale anyway.
        try:
            import base64 as _b64
            from io import BytesIO as _BytesIO
            img = Image.open(_BytesIO(_b64.b64decode(image_b64))).convert("RGB")
            max_edge = int(body.get("image_max_edge", 1280) or 1280)
            if max(img.size) > max_edge:
                scale = max_edge / max(img.size)
                img = img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.LANCZOS)
            buf = _BytesIO()
            img.save(buf, format="JPEG", quality=90)
            image_b64 = _b64.b64encode(buf.getvalue()).decode("ascii")
        except Exception as e:
            return web.json_response({"ok": False, "error": f"could not read the image: {e}"}, status=400)

    user_msg = {"role": "user", "content": user_prompt}
    if image_b64:
        user_msg["images"] = [image_b64]

    payload = {
        "model": model,
        "messages": [{"role": "system", "content": system_prompt}, user_msg],
        "stream": False,
        "options": {
            "temperature": float(body.get("temperature", 0.7) or 0.7),
            "top_p": float(body.get("top_p", 0.9) or 0.9),
        },
    }
    seed = body.get("seed")
    if seed not in (None, ""):
        try:
            payload["options"]["seed"] = int(seed)
        except (TypeError, ValueError):
            pass
    if body.get("think") is False:
        payload["think"] = False

    try:
        timeout = aiohttp.ClientTimeout(total=float(body.get("timeout", 600) or 600))
        async with aiohttp.ClientSession(timeout=timeout) as s:
            async with s.post(f"{base}/api/chat", json=payload) as r:
                if r.status != 200:
                    return web.json_response(
                        {"ok": False, "error": f"ollama HTTP {r.status}: {(await r.text())[:300]}"}, status=502)
                data = await r.json()
        msg = (data.get("message") or {})
        text = (msg.get("content") or "").strip()
        if not text:
            return web.json_response({"ok": False, "error": "empty response from Ollama"}, status=502)
        return web.json_response({"ok": True, "response": text, "thinking": (msg.get("thinking") or "")})
    except Exception as e:
        return web.json_response({"ok": False, "error": str(e)}, status=502)


_mmh3_last: dict = {}


@PromptServer.instance.routes.post("/minimax_h3_one/set_last_image")
async def mmh3_set_last_image(request):
    data = await request.json()
    uid = str(data.get("unique_id", ""))
    if uid:
        rec = _mmh3_last.setdefault(uid, {})
        if "image" in data:
            rec["image"] = data.get("image", {})
        if "video_path" in data:
            rec["video_path"] = data.get("video_path", "")
    return web.json_response({"ok": True})


# ════════════════════════════════════════════════════════════════════════════════
# Node classes
# ════════════════════════════════════════════════════════════════════════════════

class Flux2KleinOneTJNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "prompt_override": ("STRING", {
                    "default": "",
                    "multiline": True,
                    "forceInput": True,
                    "tooltip": "External prompt override — prepended before the internal prompt.",
                }),
                "pipe": ("TJ_PROMPT_PIPE", {
                    "tooltip": "PromptDB pipe (TJ_NODE). At generation, fields present in the pipe override this node's settings; missing fields keep the node's own values. The node's UI is never changed.",
                }),
            },
            "hidden": {"unique_id": "UNIQUE_ID"},
        }
    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "get_output_image"
    CATEGORY = " ✨ TJ_Node/Generator"
    OUTPUT_NODE = True

    def get_output_image(self, unique_id=None, prompt_override="", model_override="", clip_override="", vae_override="", **kwargs):
        uid = str(unique_id) if unique_id else ""
        info = _fk_last_images.get(uid, {})
        try:
            filename = info.get("filename")
            if filename:
                img_type = info.get("type", "output")
                subfolder = info.get("subfolder", "") or ""
                base = folder_paths.get_output_directory() if img_type == "output" else folder_paths.get_input_directory()
                path = os.path.join(base, subfolder, filename) if subfolder else os.path.join(base, filename)
                img = Image.open(path).convert("RGB")
                arr = np.array(img).astype(np.float32) / 255.0
                return (torch.from_numpy(arr)[None,],)
        except Exception as e:
            print(f"[FK] output slot error: {e}")
        return (torch.zeros((1, 64, 64, 3), dtype=torch.float32),)

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")


class Krea2OneTJNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "prompt_override": ("STRING", {
                    "default": "",
                    "multiline": True,
                    "forceInput": True,
                    "tooltip": "External prompt override — prepended before the internal prompt.",
                }),
                "pipe": ("TJ_PROMPT_PIPE", {
                    "tooltip": "PromptDB pipe (TJ_NODE). At generation, fields present in the pipe override this node's settings; missing fields keep the node's own values. The node's UI is never changed.",
                }),
            },
            "hidden": {"unique_id": "UNIQUE_ID"},
        }
    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "get_output_image"
    CATEGORY = " ✨ TJ_Node/Generator"
    OUTPUT_NODE = True

    def get_output_image(self, unique_id=None, prompt_override="", **kwargs):
        uid = str(unique_id) if unique_id else ""
        info = _k2_last_images.get(uid, {})
        try:
            filename = info.get("filename")
            if filename:
                img_type = info.get("type", "output")
                subfolder = info.get("subfolder", "") or ""
                base = folder_paths.get_output_directory() if img_type == "output" else folder_paths.get_input_directory()
                path = os.path.join(base, subfolder, filename) if subfolder else os.path.join(base, filename)
                img = Image.open(path).convert("RGB")
                arr = np.array(img).astype(np.float32) / 255.0
                return (torch.from_numpy(arr)[None,],)
        except Exception as e:
            print(f"[K2] output slot error: {e}")
        return (torch.zeros((1, 64, 64, 3), dtype=torch.float32),)

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")


class ZImageTurboOneNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "prompt_override": ("STRING", {
                    "default": "",
                    "multiline": True,
                    "forceInput": True,
                    "tooltip": "External prompt override — prepended before the internal prompt.",
                }),
                "pipe": ("TJ_PROMPT_PIPE", {
                    "tooltip": "PromptDB pipe (TJ_NODE). At generation, fields present in the pipe override this node's settings; missing fields keep the node's own values. The node's UI is never changed.",
                }),
            },
            "hidden": {"unique_id": "UNIQUE_ID"},
        }
    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "get_output_image"
    CATEGORY = " ✨ TJ_Node/Generator"
    OUTPUT_NODE = True

    def get_output_image(self, unique_id=None, prompt_override="", model_override="", clip_override="", vae_override="", **kwargs):
        uid = str(unique_id) if unique_id else ""
        info = _zit_last_images.get(uid, {})
        try:
            filename = info.get("filename")
            if filename:
                img_type = info.get("type", "output")
                subfolder = info.get("subfolder", "") or ""
                base = folder_paths.get_output_directory() if img_type == "output" else folder_paths.get_input_directory()
                path = os.path.join(base, subfolder, filename) if subfolder else os.path.join(base, filename)
                img = Image.open(path).convert("RGB")
                arr = np.array(img).astype(np.float32) / 255.0
                return (torch.from_numpy(arr)[None,],)
        except Exception as e:
            print(f"[ZIT] output slot error: {e}")
        return (torch.zeros((1, 64, 64, 3), dtype=torch.float32),)

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")


class QwenImageEdit2511OneTJNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "prompt_override": ("STRING", {
                    "default": "",
                    "multiline": True,
                    "forceInput": True,
                    "tooltip": "External prompt override appended before the internal prompt.",
                }),
                "pipe": ("TJ_PROMPT_PIPE", {
                    "tooltip": "PromptDB pipe (TJ_NODE). At generation, fields present in the pipe override this node's settings; missing fields keep the node's own values. The node's UI is never changed.",
                }),
            },
            "hidden": {"unique_id": "UNIQUE_ID"},
        }
    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "get_output_image"
    CATEGORY = " ✨ TJ_Node/Generator"
    OUTPUT_NODE = True

    def get_output_image(self, unique_id=None, prompt_override="", **kwargs):
        uid = str(unique_id) if unique_id else ""
        info = _qe_last_images.get(uid, {})
        try:
            filename = info.get("filename")
            if filename:
                img_type  = info.get("type", "output")
                subfolder = info.get("subfolder", "") or ""
                base = folder_paths.get_output_directory() if img_type == "output" else folder_paths.get_input_directory()
                path = os.path.join(base, subfolder, filename) if subfolder else os.path.join(base, filename)
                img = Image.open(path).convert("RGB")
                arr = np.array(img).astype(np.float32) / 255.0
                return (torch.from_numpy(arr)[None,],)
        except Exception as e:
            print(f"[QE2511] output slot error: {e}")
        return (torch.zeros((1, 64, 64, 3), dtype=torch.float32),)

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")


class SDXLOneTJNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "prompt_override": ("STRING", {
                    "default": "",
                    "multiline": True,
                    "forceInput": True,
                    "tooltip": "External prompt override — prepended before the internal prompt.",
                }),
                "pipe": ("TJ_PROMPT_PIPE", {
                    "tooltip": "PromptDB pipe (TJ_NODE). At generation, fields present in the pipe override this node's settings; missing fields keep the node's own values. The node's UI is never changed.",
                }),
            },
            "hidden": {"unique_id": "UNIQUE_ID"},
        }
    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "get_output_image"
    CATEGORY = " ✨ TJ_Node/Generator"
    OUTPUT_NODE = True

    def get_output_image(self, unique_id=None, prompt_override="", **kwargs):
        uid = str(unique_id) if unique_id else ""
        info = _sdxl_last_images.get(uid, {})
        try:
            filename = info.get("filename")
            if filename:
                img_type  = info.get("type", "output")
                subfolder = info.get("subfolder", "") or ""
                base = folder_paths.get_output_directory() if img_type == "output" else folder_paths.get_input_directory()
                path = os.path.join(base, subfolder, filename) if subfolder else os.path.join(base, filename)
                img = Image.open(path).convert("RGB")
                arr = np.array(img).astype(np.float32) / 255.0
                return (torch.from_numpy(arr)[None,],)
        except Exception as e:
            print(f"[SDXL ONE] output slot error: {e}")
        return (torch.zeros((1, 64, 64, 3), dtype=torch.float32),)

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")


class MiniMaxH3OneTJNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "prompt_override": ("STRING", {
                    "default": "",
                    "multiline": True,
                    "forceInput": True,
                    "tooltip": "External prompt override — prepended before the internal prompt.",
                }),
                "pipe": ("TJ_PROMPT_PIPE", {
                    "tooltip": "PromptDB pipe (TJ_NODE). At generation, fields present in the pipe override this node's settings; missing fields keep the node's own values. The node's UI is never changed.",
                }),
            },
            "hidden": {"unique_id": "UNIQUE_ID"},
        }
    RETURN_TYPES = ("IMAGE", "STRING")
    RETURN_NAMES = ("last_frame", "video_path")
    FUNCTION = "get_output"
    CATEGORY = " ✨ TJ_Node/Generator"
    OUTPUT_NODE = True

    def get_output(self, unique_id=None, prompt_override="", **kwargs):
        uid = str(unique_id) if unique_id else ""
        rec = _mmh3_last.get(uid, {})
        video_path = rec.get("video_path", "") or ""
        info = rec.get("image", {}) or {}
        try:
            filename = info.get("filename")
            if filename:
                img_type = info.get("type", "output")
                subfolder = info.get("subfolder", "") or ""
                base = folder_paths.get_output_directory() if img_type == "output" else folder_paths.get_input_directory()
                path = os.path.join(base, subfolder, filename) if subfolder else os.path.join(base, filename)
                img = Image.open(path).convert("RGB")
                arr = np.array(img).astype(np.float32) / 255.0
                return (torch.from_numpy(arr)[None,], video_path)
        except Exception as e:
            print(f"[MMH3] output slot error: {e}")
        return (torch.zeros((1, 64, 64, 3), dtype=torch.float32), video_path)

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")


NODE_CLASS_MAPPINGS = {
    "Flux2KleinOneTJNode":         Flux2KleinOneTJNode,
    "ZImageTurboOneNode":          ZImageTurboOneNode,
    "Krea2OneTJNode":              Krea2OneTJNode,
    "QwenImageEdit2511OneTJNode":  QwenImageEdit2511OneTJNode,
    "SDXLOneTJNode":               SDXLOneTJNode,
    "MiniMaxH3OneTJNode":          MiniMaxH3OneTJNode,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "Flux2KleinOneTJNode":         "Flux.2 Klein ONE STUDIO (TJ)",
    "ZImageTurboOneNode":          "Z-Image ONE STUDIO (TJ)",
    "Krea2OneTJNode":              "Krea 2 ONE STUDIO (TJ)",
    "QwenImageEdit2511OneTJNode":  "Qwen Image Edit 2511 ONE STUDIO (TJ)",
    "SDXLOneTJNode":               "SDXL ONE STUDIO (TJ)",
    "MiniMaxH3OneTJNode":          "MiniMax H3 ONE STUDIO (TJ)",
}

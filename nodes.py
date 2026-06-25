"""
TJ Node ONE — Combined package for flux2 klein One (TJ) + Z-Image ONE (TJ)
"""
import os
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

FK_SUBFOLDER  = "flux2-klein-one-tj"
ZIT_SUBFOLDER = "one-node-z-image-turbo"


# ════════════════════════════════════════════════════════════════════════════════
# Shared utilities
# ════════════════════════════════════════════════════════════════════════════════

def _get_output_dir():
    try:
        return str(Path(folder_paths.get_output_directory()).resolve())
    except Exception:
        return str(Path(os.path.join(os.path.dirname(NODE_DIR), "output")).resolve())


def _safe_resolve_output_path(output_dir, subfolder="", filename=""):
    base = Path(output_dir).resolve()
    target = base
    if subfolder:
        target = target / subfolder
    if filename:
        target = target / filename
    target = target.resolve()
    try:
        target.relative_to(base)
    except Exception:
        raise ValueError("invalid path")
    return str(target)


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
            import subprocess as _sp
            system = platform.system()
            if system == "Windows":
                _sp.Popen(["explorer", "/select,", vpath.replace("/", "\\")])
            elif system == "Darwin":
                _sp.Popen(["open", "-R", vpath])
            else:
                _sp.Popen(["xdg-open", os.path.dirname(vpath)])
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
        base = folder_paths.get_output_directory() if img_type == "output" else folder_paths.get_input_directory()
        src = os.path.join(base, subfolder, filename) if subfolder else os.path.join(base, filename)
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
                    "tooltip": "외부 프롬프트 오버라이드 — 내부 프롬프트 앞에 추가됩니다.",
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
                    "tooltip": "외부 프롬프트 오버라이드 — 내부 프롬프트 앞에 추가됩니다.",
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


NODE_CLASS_MAPPINGS = {
    "Flux2KleinOneTJNode": Flux2KleinOneTJNode,
    "ZImageTurboOneNode":  ZImageTurboOneNode,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "Flux2KleinOneTJNode": "Flux.2 Klein ONE STUDIO (TJ)",
    "ZImageTurboOneNode":  "Z-Image ONE STUDIO (TJ)",
}

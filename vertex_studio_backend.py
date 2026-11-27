"""Vertex Image ONE STUDIO (TJ) - server side.

Port of the Vertex AI Studio (Image) Windows app (github.com/designloves2/Vertex-AI-Studio) as a ONE STUDIO node:
chat-style image generation and step-by-step editing through the local Vertex OpenAI Proxy (default
http://127.0.0.1:3000). The proxy is called from here, not from the browser.

Storage: every conversation is a folder output/vertex_studio/<conv_id>/ with conv.json (turns) and the original
image bytes exactly as the model returned them (never re-encoded, so the proxy's thought-signature cache keeps
matching the base64 we send back). Settings: config_vertex.json next to this file (user data, not committed).
"""
import base64
import hashlib
import json
import os
import re
import shutil
import time
import uuid

import aiohttp
import numpy as np
import torch
from aiohttp import web
from PIL import Image

import folder_paths
from server import PromptServer

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(HERE, "config_vertex.json")
# Generated images go to output/<SUBFOLDER>/ (the node's gallery, like every ONE STUDIO node). Conversations and the
# reference images people attach live under output/<SUBFOLDER>/assets/chats/<id>/, which the gallery never lists.
SUBFOLDER = "vertex-image-one-tj"
CHATS = os.path.join(SUBFOLDER, "assets", "chats")

ASPECTS = ["auto", "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"]
AUTO_ASPECT = "2:3"

# Same defaults as the app's Settings.cs, except the models: those stay empty until the user picks one
# (pack rule: no hidden default model).
DEFAULT_CONFIG = {
    "proxyUrl": "http://127.0.0.1:3000",
    "timeout": 300,
    "model": "",
    "output": "image_text",        # image_text | image_only
    "thinking": "medium",          # low | medium | high
    "mediaResolution": "default",  # default | low | medium | high
    "aspect": "auto",
    "size": "2K",                  # 1K | 2K | 4K
    "format": "png",               # png | jpeg
    "person": "allow_adult",       # allow_all | allow_adult | dont_allow
    "celebrities": False,
    "googleSearch": False,
    "googleSearchServices": False,
    "partner": False,
    "partnerResults": False,
    "region": "global",
    "maxTokens": 32768,
    "systemPrompt": "",
    "enhance": False,
    "enhanceModel": "",
    "compactModel": "",
    "historyImages": 3,
    "contextLimit": 65536,
    "autoCompact": 80,
    "sendKey": "enter",            # enter | ctrl_enter
    # This node only: its Prompt Enhance / Refine / Write and its KO<->EN translation can go through the Vertex proxy
    # instead of the shared LLM / Translation setting (which stays as it is for every other node).
    "llmVertex": False,
    "llmModel": "",
    "llmVisionVertex": False,
    "llmVisionModel": "",
    "trVertex": False,
    "trModel": "",
}

MAX_BODY_BYTES = 40 * 1024 * 1024
_last_images = {}   # node unique_id -> {"conv": id, "file": name}


# ───────────────────────── config / storage ─────────────────────────

def load_config():
    cfg = dict(DEFAULT_CONFIG)
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            saved = json.load(f)
        cfg.update({k: v for k, v in saved.items() if k in DEFAULT_CONFIG})
    except Exception:
        pass
    return cfg


def save_config(cfg):
    tmp = CONFIG_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
    os.replace(tmp, CONFIG_PATH)


def root_dir():
    d = os.path.join(folder_paths.get_output_directory(), CHATS)
    os.makedirs(d, exist_ok=True)
    return d


def img_path(img):
    return os.path.join(folder_paths.get_output_directory(), img["sub"], img["file"])


_ID_RE = re.compile(r"^[0-9a-f]{32}$")
_FILE_RE = re.compile(r"^[\w.\-]+$")


def conv_dir(cid):
    if not _ID_RE.match(cid or ""):
        raise ValueError("bad conversation id")
    return os.path.join(root_dir(), cid)


def now_ms():
    return int(time.time() * 1000)


def load_conv(cid):
    with open(os.path.join(conv_dir(cid), "conv.json"), "r", encoding="utf-8") as f:
        return json.load(f)


def save_conv(conv):
    d = conv_dir(conv["id"])
    os.makedirs(d, exist_ok=True)
    conv["updatedAt"] = now_ms()
    tmp = os.path.join(d, "conv.json.tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(conv, f, ensure_ascii=False, indent=1)
    os.replace(tmp, os.path.join(d, "conv.json"))


def new_conv():
    return {"id": uuid.uuid4().hex, "title": "New chat", "createdAt": now_ms(), "updatedAt": now_ms(), "messages": []}


def sniff_mime(b):
    if b[:2] == b"\x89P":
        return "image/png"
    if b[:2] == b"\xff\xd8":
        return "image/jpeg"
    if b[:4] == b"RIFF" and b[8:12] == b"WEBP":
        return "image/webp"
    return "image/png"


EXT = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}


def save_image(cid, data, mime, kind, meta=None):
    """Writes the bytes exactly as received. Generated images go to the gallery folder with a sidecar json only:
    the PNG itself is never rewritten (no embedded tEXt), so the base64 sent back stays the one the proxy cached
    the thought signature for."""
    mime = mime if mime in EXT else sniff_mime(data)
    sha = hashlib.sha1(base64.b64encode(data)).hexdigest()
    sub = SUBFOLDER if kind == "generated" else os.path.join(CHATS, cid)
    prefix = "Vertex" if kind == "generated" else "ref"
    name = f"{prefix}_{time.strftime('%Y%m%d_%H%M%S')}_{sha[:8]}{EXT[mime]}"
    img = {"id": uuid.uuid4().hex, "file": name, "sub": sub, "mime": mime, "w": 0, "h": 0, "kind": kind}
    path = img_path(img)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)
    try:
        with Image.open(path) as im:
            img["w"], img["h"] = im.size
    except Exception:
        pass
    if meta is not None:
        try:
            from .nodes import _meta_path
            mp = _meta_path(path)
            os.makedirs(os.path.dirname(mp), exist_ok=True)
            with open(mp, "w", encoding="utf-8") as f:
                json.dump(dict(meta, width=img["w"], height=img["h"]), f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[Vertex] meta write error: {e}")
    return img


def data_uri(cid, img):
    """None when the file is gone (deleted from the gallery): the turn then carries a text placeholder."""
    try:
        with open(img_path(img), "rb") as f:
            return f"data:{img['mime']};base64,{base64.b64encode(f.read()).decode('ascii')}"
    except OSError:
        return None


# ───────────────────────── history (HistoryBuilder.cs) ─────────────────────────

def active_turns(msgs):
    """Messages after the latest summary; failed turns and orphan user turns dropped."""
    s = -1
    for i in range(len(msgs) - 1, -1, -1):
        if msgs[i]["role"] == "summary" and msgs[i].get("status", "ok") == "ok":
            s = i
            break
    summary = msgs[s] if s >= 0 else None
    rest = [m for m in msgs[s + 1:] if m["role"] in ("user", "assistant")]
    turns, i = [], 0
    while i < len(rest):
        m = rest[i]
        if m["role"] == "user":
            reply = rest[i + 1] if i + 1 < len(rest) and rest[i + 1]["role"] == "assistant" else None
            last = i == len(rest) - 1
            if reply is None and not last:
                i += 1
                continue
            if reply is not None and reply.get("status") != "ok":
                i += 2
                continue
            turns.append(m)
            if reply is not None:
                turns.append(reply)
                i += 1
        i += 1
    return summary, turns


def prompt_of(m):
    return (m.get("enhanced") or "").strip() or m.get("text", "")


def _short(s):
    s = " ".join(s.split())
    return s if len(s) <= 60 else s[:60] + "…"


def build_history(cid, msgs, max_images, system_prompt, pinned):
    n = max(0, int(max_images))
    while True:
        out, size = _build_once(cid, msgs, n, system_prompt, pinned)
        if size <= MAX_BODY_BYTES or n == 0:
            return out
        n = n // 2 if n > 1 else 0


def _build_once(cid, msgs, max_images, system_prompt, pinned):
    summary, turns = active_turns(msgs)
    ordered = list(summary["images"]) if summary else []
    for t in turns:
        ordered += t.get("images", [])
    inline = {i["id"] for i in (ordered[-max_images:] if max_images > 0 else [])}
    if pinned and any(i["id"] == pinned for i in ordered):
        inline.add(pinned)
    size = 0
    out = []
    if (system_prompt or "").strip():
        out.append({"role": "system", "content": system_prompt})

    def assistant(images, text, prompt):
        nonlocal size
        parts = [text.strip()] if (text or "").strip() else []
        for k, img in enumerate(images, 1):
            uri = data_uri(cid, img) if img["id"] in inline else None
            if uri:
                size += len(uri)
                parts.append(f"![image {k}]({uri})")
            else:
                parts.append(f"[previous image: {_short(prompt)}]")
        return "\n\n".join(parts) if parts else "(no image)"

    if summary:
        out.append({"role": "user", "content": "[Summary of the earlier conversation]\n" + summary["text"]})
        out.append({"role": "assistant", "content": assistant(summary.get("images", []), "Reference images of the summarized conversation.", "")})
    last_prompt = ""
    for m in turns:
        if m["role"] == "user":
            last_prompt = prompt_of(m)
            text, parts = last_prompt, []
            for img in m.get("images", []):
                uri = data_uri(cid, img) if img["id"] in inline else None
                if uri:
                    size += len(uri)
                    parts.append({"type": "image_url", "image_url": {"url": uri}})
                else:
                    text += "\n[previously attached image]"
            content = text if not parts else [{"type": "text", "text": text}] + parts
            out.append({"role": "user", "content": content})
        else:
            out.append({"role": "assistant", "content": assistant(m.get("images", []), m.get("text", ""), last_prompt)})
    return out, size


def estimate_tokens(msgs, max_images):
    summary, turns = active_turns(msgs)
    ms = ([summary] if summary else []) + turns
    text = sum(len(prompt_of(m) if m["role"] == "user" else m.get("text", "")) for m in ms) // 3
    imgs = [i for m in ms for i in m.get("images", [])]
    keep = imgs[-max_images:] if max_images > 0 else []
    cost = sum(2000 if max(i["w"], i["h"]) > 3000 else 1500 if max(i["w"], i["h"]) > 1500 else 1120 for i in keep)
    return text + cost + (len(imgs) - len(keep)) * 12


# ───────────────────────── request body (ImageRequest.Build) ─────────────────────────

def image_body(cfg, messages):
    aspect = AUTO_ASPECT if cfg["aspect"] == "auto" else cfg["aspect"]
    image_config = {
        "aspectRatio": aspect,
        "imageSize": cfg["size"],
        "imageOutputOptions": {"mimeType": "image/jpeg" if cfg["format"] == "jpeg" else "image/png"},
        "personGeneration": {"allow_all": "ALLOW_ALL", "dont_allow": "ALLOW_NONE"}.get(cfg["person"], "ALLOW_ADULT"),
    }
    gen = {
        "responseModalities": ["IMAGE"] if cfg["output"] == "image_only" else ["TEXT", "IMAGE"],
        "maxOutputTokens": int(cfg["maxTokens"]),
        "thinkingConfig": {"thinkingLevel": cfg["thinking"].upper(), "includeThoughts": True},
        "imageConfig": image_config,
    }
    if cfg["mediaResolution"] != "default":
        gen["mediaResolution"] = "MEDIA_RESOLUTION_" + cfg["mediaResolution"].upper()
    tools = []
    if cfg["googleSearch"]:
        search = {}
        if cfg["googleSearchServices"]:
            search["searchTypes"] = {"webSearch": {}, "imageSearch": {}}
        tools.append({"googleSearch": search})
    if cfg["partner"]:
        tools.append({"partnerGrounding": {"includePartnerResults": bool(cfg["partnerResults"])}})
    vertex = {"location": cfg["region"], "generationConfig": gen,
              "celebrityGeneration": "ALLOW" if cfg["celebrities"] else "BLOCK"}
    if tools:
        vertex["tools"] = tools
    return {"model": cfg["model"], "aspect_ratio": aspect, "n": 1, "max_tokens": int(cfg["maxTokens"]),
            "messages": messages, "vertex": vertex, "stream": False}


def settings_label(cfg):
    aspect = AUTO_ASPECT if cfg["aspect"] == "auto" else cfg["aspect"]
    return f"{aspect} · {cfg['size']} · {cfg['format']}"


_MD_IMG = re.compile(r"!\[[^\]]*\]\((data:([^;]+);base64,([A-Za-z0-9+/=]+))\)")


# ───────────────────────── same-request cache (ImageRequest.CacheKey + Store.CacheLookup) ─────────────────────────

CACHE_MAX = 300


def _cache_path():
    return os.path.join(folder_paths.get_output_directory(), SUBFOLDER, "assets", "request_cache.json")


def _cache_load():
    try:
        with open(_cache_path(), "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def cache_key(body):
    return hashlib.sha1(json.dumps({k: v for k, v in body.items() if k != "stream"}, sort_keys=True,
                                   ensure_ascii=False).encode("utf-8")).hexdigest()


def cache_lookup(key):
    """The earlier result for this exact request, only while all its image files still exist."""
    hit = _cache_load().get(key)
    if not hit or not hit.get("images"):
        return None
    if not all(os.path.isfile(img_path(i)) for i in hit["images"]):
        return None
    return hit


def cache_put(key, asst):
    data = _cache_load()
    data[key] = {"text": asst.get("text", ""), "thoughts": asst.get("thoughts", ""), "notes": asst.get("notes", ""),
                 "images": [{k: v for k, v in i.items() if k != "id"} for i in asst["images"]], "at": now_ms()}
    if len(data) > CACHE_MAX:
        for k in sorted(data, key=lambda k: data[k].get("at", 0))[:len(data) - CACHE_MAX]:
            data.pop(k, None)
    try:
        os.makedirs(os.path.dirname(_cache_path()), exist_ok=True)
        tmp = _cache_path() + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        os.replace(tmp, _cache_path())
    except Exception as e:
        print(f"[Vertex] cache write error: {e}")


def strip_think(s):
    i = s.lower().rfind("</think>")
    return s[i + 8:] if i >= 0 else s


# ───────────────────────── proxy client ─────────────────────────

class ProxyError(Exception):
    def __init__(self, msg, status=0, down=False):
        super().__init__(msg)
        self.status, self.down = status, down

    def user_message(self):
        if self.down:
            return "Cannot reach the Vertex OpenAI Proxy. Start the proxy app first."
        if self.status == 429:
            return "Quota exceeded (429). Try again in a moment."
        if self.status in (403, 404):
            return f"No permission for this model or it was not found ({self.status}): {self}"
        return str(self)


async def proxy(cfg, method, path, body=None):
    url = cfg["proxyUrl"].rstrip("/") + "/" + path
    try:
        timeout = aiohttp.ClientTimeout(total=float(cfg.get("timeout") or 300))
        async with aiohttp.ClientSession(timeout=timeout) as s:
            async with s.request(method, url, json=body, headers={"Authorization": "Bearer local"}) as r:
                text = await r.text()
                if r.status >= 400:
                    msg = text
                    try:
                        msg = json.loads(text).get("error", {}).get("message") or text
                    except Exception:
                        pass
                    raise ProxyError(msg or r.reason, r.status)
                return json.loads(text)
    except ProxyError:
        raise
    except aiohttp.ClientConnectorError as e:
        raise ProxyError(str(e), 0, down=True)
    except TimeoutError:
        raise ProxyError(f"Request timed out ({cfg.get('timeout')}s)", 408)


async def chat_text(cfg, model, system, user, temperature):
    if not model:
        raise ProxyError("Select a model in Settings first.", 400)
    root = await proxy(cfg, "POST", "v1/chat/completions", {
        "model": model, "temperature": temperature, "stream": False,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]})
    return strip_think(((root.get("choices") or [{}])[0].get("message") or {}).get("content") or "").strip()


ENHANCE_SYSTEM = """You rewrite image-generation requests into a single, vivid, production-ready prompt for Google's Gemini image model.
- Keep every concrete instruction from the user (subject, text to render, colors, layout, edits to the previous image).
- If the request edits a previous result, phrase it as an edit ("Keep the composition, change ...").
- Add lighting, composition, lens/style and material detail only where it helps; never contradict the user.
- Text that must appear in the image stays in its original language, in quotes.
- Reply with the prompt only. No preface, no markdown, no quotes around the whole prompt."""

COMPACT_SYSTEM = """You compress an image-generation chat so it can continue with a much shorter history.
Write a concise summary (Korean, max ~15 lines) that preserves:
- the overall goal and style decisions that are still in effect
- exact text that must appear in images, brand names, colors, sizes, aspect ratio choices
- what the latest image looks like and which edits were already applied
- rejected ideas the user explicitly does not want
Reply with the summary only."""


# ───────────────────────── routes ─────────────────────────

R = PromptServer.instance.routes


def _err(e, status=400):
    return web.json_response({"error": e.user_message() if isinstance(e, ProxyError) else str(e)}, status=status)


def _summary_row(c):
    imgs = [i for m in c["messages"] for i in m.get("images", []) if i["kind"] == "generated"]
    return {"id": c["id"], "title": c["title"], "updatedAt": c["updatedAt"], "count": len(c["messages"]),
            "thumb": imgs[-1] if imgs else None}


@R.get("/tj_vertex/config")
async def _cfg_get(request):
    return web.json_response(load_config())


@R.post("/tj_vertex/config")
async def _cfg_set(request):
    data = await request.json()
    cfg = load_config()
    for k, v in data.items():
        if k in DEFAULT_CONFIG:
            cfg[k] = v
    save_config(cfg)
    return web.json_response(cfg)


@R.get("/tj_vertex/models")
async def _models(request):
    cfg = load_config()
    kind = request.query.get("type", "image")
    try:
        root = await proxy(cfg, "GET", f"v1/models?type={kind}" + ("&refresh=1" if request.query.get("refresh") else ""))
        return web.json_response({"models": [m["id"] for m in root.get("data", [])]})
    except Exception as e:
        return _err(e, 502)


@R.post("/tj_vertex/chat")
async def _chat(request):
    """One system + user call to a Vertex chat model (this node's translation)."""
    d = await request.json()
    cfg = load_config()
    try:
        text = await chat_text(cfg, (d.get("model") or "").strip(), d.get("system") or "", d.get("user") or "",
                               float(d.get("temperature", 0.2)))
        return web.json_response({"ok": True, "text": text})
    except Exception as e:
        return _err(e, 502)


@R.get("/tj_vertex/conversations")
async def _list(request):
    rows = []
    for name in os.listdir(root_dir()):
        try:
            rows.append(_summary_row(load_conv(name)))
        except Exception:
            continue
    rows.sort(key=lambda r: r["updatedAt"], reverse=True)
    return web.json_response({"conversations": rows})


@R.post("/tj_vertex/conversations")
async def _create(request):
    c = new_conv()
    os.makedirs(conv_dir(c["id"]), exist_ok=True)
    save_conv(c)
    return web.json_response(c)


@R.get("/tj_vertex/conversation")
async def _get(request):
    try:
        c = load_conv(request.query.get("id", ""))
        c["tokens"] = estimate_tokens(c["messages"], load_config()["historyImages"])
        return web.json_response(c)
    except Exception as e:
        return _err(e, 404)


@R.post("/tj_vertex/conversation/rename")
async def _rename(request):
    d = await request.json()
    try:
        c = load_conv(d.get("id", ""))
        c["title"] = (d.get("title") or "").strip()[:80] or c["title"]
        save_conv(c)
        return web.json_response(_summary_row(c))
    except Exception as e:
        return _err(e)


@R.post("/tj_vertex/conversation/delete")
async def _delete(request):
    """Moves the folder to the shared gallery trash instead of deleting it."""
    d = await request.json()
    try:
        src = conv_dir(d.get("id", ""))
        trash = os.path.join(os.path.dirname(folder_paths.get_output_directory()), "user", "tj_gallery_trash",
                             f"vertex_{time.strftime('%Y%m%d_%H%M%S')}_{os.path.basename(src)}")
        os.makedirs(os.path.dirname(trash), exist_ok=True)
        shutil.move(src, trash)
        return web.json_response({"ok": True})
    except Exception as e:
        return _err(e)


@R.post("/tj_vertex/message/delete")
async def _msg_delete(request):
    """Removes one turn (user message + its reply); image files stay on disk."""
    d = await request.json()
    try:
        c = load_conv(d.get("conv", ""))
        mid = d.get("id")
        idx = next(i for i, m in enumerate(c["messages"]) if m["id"] == mid)
        m = c["messages"][idx]
        if m["role"] == "user" and idx + 1 < len(c["messages"]) and c["messages"][idx + 1]["role"] == "assistant":
            del c["messages"][idx:idx + 2]
        elif m["role"] == "assistant" and idx > 0 and c["messages"][idx - 1]["role"] == "user":
            del c["messages"][idx - 1:idx + 1]
        else:
            del c["messages"][idx]
        save_conv(c)
        return web.json_response(c)
    except Exception as e:
        return _err(e)


@R.post("/tj_vertex/send")
async def _send(request):
    d = await request.json()
    cfg = load_config()
    if not cfg["model"]:
        return _err(ProxyError("Select an image model in Settings first.", 400))
    try:
        c = load_conv(d.get("conv", ""))
    except Exception as e:
        return _err(e, 404)
    prompt = (d.get("prompt") or "").strip()
    if not c["messages"] and prompt:
        t = " ".join(prompt.split())
        c["title"] = t[:40]
    user = {"id": uuid.uuid4().hex, "role": "user", "text": prompt, "enhanced": "", "images": [],
            "continueFrom": d.get("continueFrom") or "", "createdAt": now_ms()}
    for a in d.get("attachments") or []:
        try:
            m = re.match(r"^data:([^;]+);base64,(.*)$", a, re.S)
            raw = base64.b64decode(m.group(2))
            user["images"].append(save_image(c["id"], raw, m.group(1), "attached"))
        except Exception:
            continue
    asst = {"id": uuid.uuid4().hex, "role": "assistant", "text": "", "images": [], "status": "pending",
            "model": cfg["model"], "label": settings_label(cfg), "createdAt": now_ms()}
    c["messages"] += [user, asst]
    save_conv(c)
    t0 = time.time()
    try:
        # Prompt Enhance runs in the page (the shared LLM tools, before this call), never here: one paid call per Generate.
        messages = build_history(c["id"], c["messages"][:-1], cfg["historyImages"], cfg["systemPrompt"], user["continueFrom"])
        body = image_body(cfg, messages)
        # Same request as before (same model, history, images and options) -> reuse that result instead of paying again,
        # like the app's cache. "↻ New variation" in the page sends bypassCache to ask for a fresh image.
        key = cache_key(body)
        hit = None if d.get("bypassCache") else cache_lookup(key)
        if hit:
            asst.update(text=hit.get("text", ""), thoughts=hit.get("thoughts", ""), notes=hit.get("notes", ""),
                        images=[dict(i, id=uuid.uuid4().hex) for i in hit["images"]], status="ok", cached=True,
                        usage={"prompt": 0, "cached": 0, "completion": 0})
            asst["ms"] = 0
            save_conv(c)
            c["tokens"] = estimate_tokens(c["messages"], cfg["historyImages"])
            return web.json_response(c)
        root = await proxy(cfg, "POST", "v1/chat/completions", body)
        msg = (root.get("choices") or [{}])[0].get("message") or {}
        content = msg.get("content") or ""
        found = _MD_IMG.findall(content)
        text = _MD_IMG.sub("", content).strip()
        if not found:
            raise ProxyError(text or "The model returned no image.", 400)
        meta = {"mode": "chat", "node": "vertex", "prompt": prompt, "enhanced": user["enhanced"], "model": cfg["model"],
                "conv": c["id"], "title": c["title"], "aspect": cfg["aspect"], "size": cfg["size"], "format": cfg["format"],
                "thinking": cfg["thinking"], "person": cfg["person"], "text": _MD_IMG.sub("", content).strip(),
                "turn": sum(1 for m in c["messages"] if m["role"] == "user")}
        for _, mime, b64 in found:
            asst["images"].append(save_image(c["id"], base64.b64decode(b64), mime, "generated", meta))
        asst["text"] = text
        asst["thoughts"] = msg.get("reasoning_content") or ""
        dropped = [x for x in (root.get("vertex_dropped") or []) if not str(x).startswith("celebrityGeneration")]
        asst["notes"] = ", ".join(map(str, dropped))
        u = root.get("usage") or {}
        asst["usage"] = {"prompt": int(u.get("prompt_tokens") or 0),
                         "cached": int((u.get("prompt_tokens_details") or {}).get("cached_tokens") or 0),
                         "completion": int(u.get("completion_tokens") or 0)}
        asst["status"] = "ok"
        cache_put(key, asst)
    except Exception as e:
        asst["status"] = "error"
        asst["error"] = e.user_message() if isinstance(e, ProxyError) else str(e)
    asst["ms"] = int((time.time() - t0) * 1000)
    save_conv(c)
    c["tokens"] = estimate_tokens(c["messages"], cfg["historyImages"])
    return web.json_response(c)


@R.post("/tj_vertex/compact")
async def _compact(request):
    d = await request.json()
    cfg = load_config()
    try:
        c = load_conv(d.get("conv", ""))
        summary, turns = active_turns(c["messages"])
        if len(turns) < 2:
            raise ValueError("Not enough conversation to compact.")
        lines = (["[Previous summary]\n" + summary["text"]] if summary else [])
        for m in turns:
            if m["role"] == "user":
                n = len(m.get("images", []))
                lines.append(f"User: {prompt_of(m)}" + (f" ({n} reference images)" if n else ""))
            else:
                lines.append(f"Model: {m.get('text') or '(no text)'} [{len(m.get('images', []))} images]")
        model = cfg["compactModel"]
        text = await chat_text(cfg, model, COMPACT_SYSTEM, "\n".join(lines), 0.2)
        if not text:
            raise ProxyError("The summary came back empty.")
        pool = (list(summary["images"]) if summary else []) + [i for m in turns for i in m.get("images", [])]
        keep = [i for i in pool if i["kind"] != "attached"][-2:] or pool[-2:]
        c["messages"].append({"id": uuid.uuid4().hex, "role": "summary", "text": text, "status": "ok", "model": model,
                              "images": [dict(i, id=uuid.uuid4().hex, kind="kept") for i in keep],
                              "label": f"{sum(1 for t in turns if t['role'] == 'user')} turns summarized · {len(keep)} images kept",
                              "createdAt": now_ms()})
        save_conv(c)
        c["tokens"] = estimate_tokens(c["messages"], cfg["historyImages"])
        return web.json_response(c)
    except Exception as e:
        return _err(e)


@R.post("/tj_vertex/select")
async def _select(request):
    d = await request.json()
    _last_images[str(d.get("node", ""))] = {"conv": d.get("conv", ""), "file": d.get("file", ""), "sub": d.get("sub", SUBFOLDER)}
    return web.json_response({"ok": True})


def _register_gallery():
    """The same gallery routes every ONE STUDIO image node has (nodes.py helpers), on this node's folder."""
    from . import nodes as N
    R.get("/tj_vertex/gallery")(N._make_gallery_handler(SUBFOLDER, "vertex"))
    R.get("/tj_vertex/meta")(N._make_meta_get_handler())
    R.post("/tj_vertex/update_meta")(N._make_update_meta_handler("vertex"))
    R.post("/tj_vertex/open_folder")(N._make_open_folder_handler())
    R.post("/tj_vertex/delete")(N._make_delete_handler("vertex"))
    R.post("/tj_vertex/copy_to_input")(N._make_copy_to_input_handler("vertex"))   # the shared image picker's Vertex tab

    @R.get("/tj_vertex/images")
    async def _images(request):
        """H3-style listing (meta inline) of the generated images: PNG and JPEG, chats/attachments excluded."""
        out = folder_paths.get_output_directory()
        try:
            offset = max(0, int(request.query.get("offset", 0)))
            limit = min(max(1, int(request.query.get("limit", 60))), 300)
        except Exception:
            offset, limit = 0, 60
        try:
            search = N._safe_resolve_output_path(out, request.query.get("subfolder", "") or SUBFOLDER)
        except ValueError:
            return web.json_response({"images": [], "total": 0, "error": "invalid subfolder"}, status=400)
        found = []
        if os.path.isdir(search):
            for ext in ("png", "jpg", "jpeg", "webp"):
                found += __import__("glob").glob(os.path.join(search, "**", "*." + ext), recursive=True)
            skip = {"assets", "_thumbs", "metadata"}
            found = [f for f in found if not skip & set(os.path.relpath(f, search).split(os.sep)[:-1])]
        found = sorted(set(found), key=os.path.getmtime, reverse=True)
        images = []
        for f in found[offset:offset + limit]:
            rel = os.path.relpath(os.path.dirname(f), out)
            meta = N._read_json_meta(f) or {}
            meta.setdefault("w", meta.get("width")); meta.setdefault("h", meta.get("height"))
            images.append({"filename": os.path.basename(f), "subfolder": "" if rel == "." else rel.replace("\\", "/"),
                           "mtime": os.path.getmtime(f), "size": os.path.getsize(f), "meta": meta,
                           "prompt": meta.get("prompt", ""), "favorite": bool(meta.get("favorite"))})
        return web.json_response({"images": images, "total": len(found), "offset": offset, "limit": limit})

    @R.post("/tj_vertex/reveal")
    async def _reveal(request):
        d = await request.json()
        try:
            path = N._safe_resolve_output_path(folder_paths.get_output_directory(), d.get("subfolder") or SUBFOLDER)
            os.makedirs(path, exist_ok=True)
            os.startfile(path)
            return web.json_response({"ok": True})
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e)})


_register_gallery()


# ───────────────────────── node ─────────────────────────

class VertexImageOneTJNode:
    """Chat-style Nano Banana image studio. The UI does the work; at queue time the node outputs the image
    picked in the chat (the latest result unless another one was clicked)."""

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}, "hidden": {"unique_id": "UNIQUE_ID"}}

    RETURN_TYPES = ("IMAGE", "STRING")
    RETURN_NAMES = ("image", "prompt")
    FUNCTION = "run"
    CATEGORY = " ✨ TJ_Node/Generator"
    OUTPUT_NODE = True

    def run(self, unique_id=None):
        info = _last_images.get(str(unique_id), {})
        prompt = ""
        try:
            try:
                c = load_conv(info.get("conv", ""))
                for i, m in enumerate(c["messages"]):
                    if any(img["file"] == info.get("file") for img in m.get("images", [])):
                        prev = next((p for p in reversed(c["messages"][:i]) if p["role"] == "user"), None)
                        prompt = prompt_of(prev) if prev else ""
            except Exception:
                pass
            img = Image.open(img_path({"sub": info.get("sub", SUBFOLDER), "file": info["file"]})).convert("RGB")
            arr = np.array(img).astype(np.float32) / 255.0
            return (torch.from_numpy(arr)[None,], prompt)
        except Exception as e:
            if info:
                print(f"[Vertex] output slot error: {e}")
        return (torch.zeros((1, 64, 64, 3), dtype=torch.float32), prompt)

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")


NODE_CLASS_MAPPINGS = {"VertexImageOneTJNode": VertexImageOneTJNode}
NODE_DISPLAY_NAME_MAPPINGS = {"VertexImageOneTJNode": "Vertex Image ONE STUDIO (TJ)"}

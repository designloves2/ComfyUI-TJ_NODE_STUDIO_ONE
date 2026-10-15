# SPDX-License-Identifier: GPL-3.0-only
# Derived from LTX-2.5-Director by CGlide (https://github.com/CGlide/LTX-2.5-Director, GPL-3.0),
# itself a fork of WhatDreamsCost's LTX Director (https://github.com/WhatDreamsCost/WhatDreamsCost-ComfyUI, GPL-3.0).
# Modified for TJ NODE STUDIO ONE: node keys CS25 -> TJ25, routes /ltx_director* -> /ltx25_one/director/*, upload folder renamed.
# GPL-3.0 only: do NOT copy this file into the web project (see PORT_LEDGER).
import logging
import asyncio
import json
import base64
import io as _io
import math

import numpy as np
import torch
import torch.nn.functional as F
import av
from PIL import Image

import os
import platform
import subprocess
import folder_paths
import comfy.model_management
from server import PromptServer
from aiohttp import web

from comfy_api.latest import io

# Where NEW timeline assets are written, under ComfyUI's input folder. Must match
# ASSET_SUBFOLDER in ltx_director.js. Older timelines were written under the legacy
# names below and still resolve, so nothing saved before the rename breaks - as long
# as the old folder is left on disk.
# Must match REFERENCE_FEATURES in ltx_director.js. The reference features (Ghost Mask,
# Licon MSR, the @ref sheets) are trained behaviours of LTX 2.3 and corrupt the render on
# 2.5. Nothing is deleted - flip this to True and it all comes back. The guard lives here,
# where the feature is APPLIED, and not only in the UI: a timeline saved on 2.3 still
# arrives carrying reference_mode, and hiding a button does not stop that.
REFERENCE_FEATURES = False

ASSET_SUBFOLDER = "ltx25_one"
LEGACY_ASSET_SUBFOLDERS = ("whatdreamscost",)
ASSET_SUBFOLDERS = (ASSET_SUBFOLDER,) + LEGACY_ASSET_SUBFOLDERS


def _asset_dir(sub=None):
    return os.path.join(folder_paths.get_input_directory(), sub or ASSET_SUBFOLDER)


def _resolve_asset(ref):
    """Find an asset on disk, trying the reference as given, then each asset folder
    by basename, then the input root. Returns a path or None.

    A saved timeline stores whatever relative path it was written with, so a file
    packed under the old folder still resolves after the rename.
    """
    if not ref:
        return None
    root = folder_paths.get_input_directory()
    direct = os.path.join(root, str(ref).replace("\\", "/"))
    if os.path.isfile(direct):
        return direct
    basename = os.path.basename(str(ref).replace("\\", "/"))
    for sub in ASSET_SUBFOLDERS:
        p = os.path.join(root, sub, basename)
        if os.path.isfile(p):
            return p
    p = os.path.join(root, basename)
    return p if os.path.isfile(p) else None

from .prompt_relay import (
    get_raw_tokenizer,
    map_token_indices,
    build_segments,
    create_mask_fn,
    distribute_segment_lengths,
)

from .patches import detect_model_type, apply_patches

log = logging.getLogger(__name__)

# Setup global event loop exception handler to silence ConnectionResetError (WinError 10054/10053) on Windows
try:
    loop = None
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        try:
            loop = asyncio.get_event_loop_policy().get_event_loop()
        except Exception:
            pass

    if loop is not None:
        old_handler = loop.get_exception_handler()
        
        def silence_connection_reset_handler(loop, context):
            exception = context.get('exception')
            if (isinstance(exception, (ConnectionResetError, ConnectionAbortedError)) or 
                (isinstance(exception, OSError) and getattr(exception, 'winerror', None) in (10054, 10053))):
                # Suppress WinError 10054 and WinError 10053 tracebacks in logging
                return
            if old_handler:
                old_handler(loop, context)
            else:
                loop.default_exception_handler(context)
                
        loop.set_exception_handler(silence_connection_reset_handler)
except Exception:
    pass

# Custom socket type shared with LTXSequencer
GuideData = io.Custom("GUIDE_DATA")
MotionGuideData = io.Custom("MOTION_GUIDE_DATA")

# --- Licon MSR engine fixed parameters (were node widgets; hardcoded for a clean UI) ---
# Slideshow length. 41 is the Licon training default (valid: 17 / 25 / 33 / 41).
MSR_PREFIX_FRAMES = 41
# latent_downscale_factor for the IC-LoRA reference frames. Tied to how the MSR LoRA was
# trained; Licon MSR V1 uses full-resolution references (1.0). This is INDEPENDENT of any
# multi-stage scale_by / x2 upscaling, which LTXDirectorGuide handles downstream.
MSR_LATENT_DOWNSCALE = 1.0


def _preprocess_prompts_with_characters(global_prompt, local_prompts, char1="", char2="", char3="", skip_empty=False):
    """Invisibly swaps out @ref1 (and legacy @character1/@char1) tags with their slot descriptions.

    skip_empty=True leaves a tag untouched when its slot description is empty. Licon MSR
    uses this so an unfilled slot behaves exactly as it did before short labels existed,
    instead of silently deleting the tag from the prompt.
    """
    gp = global_prompt or ""
    _vals = [char1 or "", char2 or "", char3 or ""]
    _tag_sets = [
        ["@character1", "@char1", "@ref1"],
        ["@character2", "@char2", "@ref2"],
        ["@character3", "@char3", "@ref3"],
    ]

    def _sub(text):
        for tags, val in zip(_tag_sets, _vals):
            if skip_empty and not val:
                continue
            for tag in tags:
                if tag in text:
                    text = text.replace(tag, val)
        return text

    gp = _sub(gp)
    locals_list = [p.strip() for p in local_prompts.split("|")] if local_prompts else []
    processed_locals = [_sub(lp) for lp in locals_list]

    return gp, " | ".join(processed_locals)


def _load_image_source(b64_or_url: str, filename: str = None) -> torch.Tensor:
    """Load a reference image from a base64 string, a Comfy /view URL, or an input filename."""
    if not b64_or_url and not filename:
        return torch.zeros((1, 512, 512, 3), dtype=torch.float32)

    if b64_or_url and "view?" in b64_or_url:
        try:
            from urllib.parse import urlparse, parse_qs
            parsed = urlparse(b64_or_url)
            q = parse_qs(parsed.query)
            fname = q.get("filename", [None])[0]
            subfolder = q.get("subfolder", [""])[0]
            if fname:
                file_path = os.path.join(folder_paths.get_input_directory(), subfolder, fname)
                if os.path.exists(file_path):
                    img = Image.open(file_path).convert("RGB")
                    arr = np.array(img, dtype=np.float32) / 255.0
                    return torch.from_numpy(arr).unsqueeze(0)
        except Exception as e:
            log.debug(f"[PromptRelay] URL parsing failed for {b64_or_url}: {e}")

    if filename:
        file_path = os.path.join(folder_paths.get_input_directory(), filename)
        if os.path.exists(file_path):
            img = Image.open(file_path).convert("RGB")
            arr = np.array(img, dtype=np.float32) / 255.0
            return torch.from_numpy(arr).unsqueeze(0)

    if b64_or_url:
        try:
            b64_str = b64_or_url
            if "," in b64_str:
                b64_str = b64_str.split(",", 1)[1]
            img_bytes = base64.b64decode(b64_str)
            img = Image.open(_io.BytesIO(img_bytes)).convert("RGB")
            arr = np.array(img, dtype=np.float32) / 255.0
            return torch.from_numpy(arr).unsqueeze(0)
        except Exception as e:
            log.debug(f"[PromptRelay] Base64 decoding failed: {e}")

    return torch.zeros((1, 512, 512, 3), dtype=torch.float32)


def _execute_comfy_node(node_class, **kwargs):
    """Invoke a ComfyUI node's main entrypoint, whether it is a comfy_api io.ComfyNode
    (classmethod 'execute') or a legacy node (instance method named by FUNCTION)."""
    if hasattr(node_class, "execute"):
        return node_class.execute(**kwargs)
    fn_name = getattr(node_class, "FUNCTION", None)
    instance = node_class()
    if fn_name and hasattr(instance, fn_name):
        return getattr(instance, fn_name)(**kwargs)
    raise RuntimeError(f"Could not determine how to execute node {node_class!r}")


def _unpack(out):
    """Normalise a node return (io.NodeOutput, tuple, list or dict) into a tuple of outputs."""
    if out is None:
        return ()
    for attr in ("result", "args", "values", "outputs"):
        if hasattr(out, attr):
            val = getattr(out, attr)
            if callable(val):
                try:
                    val = val()
                except Exception:
                    continue
            if isinstance(val, (tuple, list)):
                return tuple(val)
    if isinstance(out, (tuple, list)):
        return tuple(out)
    if isinstance(out, dict) and isinstance(out.get("result"), (tuple, list)):
        return tuple(out["result"])
    return (out,)

# --- File Check Endpoint for Deduplication ---
@PromptServer.instance.routes.get("/ltx25_one/director/check_file")
async def ltx_director_check_file(request):
    filename = request.query.get("filename", "")
    file_size = request.query.get("size", "")
    if not filename:
        return web.json_response({"exists": False})

    upload_dir = folder_paths.get_input_directory()
    temp_dir = folder_paths.get_temp_directory()

    # 1. Check every asset folder (current first, then legacy) and the input root
    possible_paths = [os.path.join(upload_dir, sub, filename) for sub in ASSET_SUBFOLDERS]
    possible_paths.append(os.path.join(upload_dir, filename))
    
    found_path = None
    for p in possible_paths:
        if os.path.exists(p) and os.path.isfile(p):
            if file_size:
                try:
                    if os.path.getsize(p) == int(file_size):
                        found_path = p
                        break
                except ValueError:
                    found_path = p
                    break
            else:
                found_path = p
                break
                
    if found_path:
        rel_name = os.path.relpath(found_path, upload_dir).replace('\\', '/')
        return web.json_response({"exists": True, "name": rel_name})

    # 2. Suffix search if exact match not found
    base_name = os.path.basename(filename)
    suffix = f"_{base_name}"
    try:
        for search_dir in [temp_dir, upload_dir]:
            if os.path.exists(search_dir):
                for f_name in os.listdir(search_dir):
                    if f_name.endswith(suffix) or f_name == base_name:
                        pot_path = os.path.join(search_dir, f_name)
                        if os.path.isfile(pot_path):
                            if file_size:
                                try:
                                    if os.path.getsize(pot_path) == int(file_size):
                                        rel_name = os.path.relpath(pot_path, upload_dir).replace('\\', '/')
                                        return web.json_response({"exists": True, "name": rel_name})
                                except ValueError:
                                    pass
                            else:
                                rel_name = os.path.relpath(pot_path, upload_dir).replace('\\', '/')
                                return web.json_response({"exists": True, "name": rel_name})
    except Exception as e:
        log.warning(f"[LTXDirector] Error listing input directory: {e}")

    return web.json_response({"exists": False})


# --- Provider defaults shared by the analyze + unload endpoints ---
_PROVIDER_DEFAULTS = {
    "ollama": {"url": "http://127.0.0.1:11434", "model": "huihui_ai/qwen3.5-abliterated:2b"},
    "lmstudio": {"url": "http://127.0.0.1:1234", "model": ""},
    "custom": {"url": "", "model": ""},
}

_ANALYZE_PROMPT = (
    "Look at the image and decide whether the main subject is a person/character "
    "or an object/prop/creature/vehicle. "
    "If it is a character: describe their physical appearance in two concise sentences - "
    "hair color/style, face details, and clothing type/color. "
    "If it is an object: describe it in two concise sentences - what it is, then its "
    "shape, color, material, and distinctive details. "
    "Do not mention the background or setting. Do not state which category you chose. "
    "Keep the entire response very brief."
)


def _resolve_provider(data):
    provider = (data.get("provider") or "ollama").lower()
    defs = _PROVIDER_DEFAULTS.get(provider, _PROVIDER_DEFAULTS["ollama"])
    base_url = (data.get("base_url") or defs["url"]).rstrip("/")
    model = data.get("model") or defs["model"]
    return provider, base_url, model


# --- Character reference analysis endpoint (Ollama / LM Studio / Custom OpenAI-compatible) ---
# Licon MSR wants a short anchor phrase, not a full description: the reference image
# carries identity, and a long description competes with it.
_ANALYZE_PROMPT_SHORT = (
    "Look at the image and identify the main subject. "
    "Reply with ONE short noun phrase of 3 to 5 words naming it plus its single most "
    "distinctive visual trait. Examples: man in yellow jacket / black custom harley "
    "motorcycle / woman with neon visor. "
    "Do not write a sentence, do not add punctuation, quotes or any explanation."
)


@PromptServer.instance.routes.post("/ltx25_one/director/analyze_character")
async def analyze_character_endpoint(request):
    try:
        import aiohttp
        data = await request.json()
        image_b64 = data.get("image_b64", "")
        char_index = int(data.get("char_index", 0))
        provider, base_url, model_name = _resolve_provider(data)
        # "short" is sent by the UI while Licon MSR is the active reference mode.
        analyze_prompt = _ANALYZE_PROMPT_SHORT if data.get("short") else _ANALYZE_PROMPT

        if provider == "off":
            return web.json_response({"status": "error", "message": "Analyze is set to Off / Manual."})
        if not image_b64:
            return web.json_response({"status": "error", "message": "No image provided for analysis."})

        b64_list = image_b64 if isinstance(image_b64, list) else [image_b64]
        cleaned_b64_list = []
        for b64 in b64_list:
            if "," in b64:
                b64 = b64.split(",", 1)[1]
            cleaned_b64_list.append(b64)
        if not cleaned_b64_list:
            return web.json_response({"status": "error", "message": "No valid base64 images decoded."})

        if provider in ("lmstudio", "custom") and not model_name:
            return web.json_response({
                "status": "error",
                "message": f"No model name set for {provider}. Open the gear menu and enter your loaded model's name.",
            })

        log.info("[LTXDirector] Analyzing Character %d via %s (%s, model '%s')...",
                 char_index + 1, provider, base_url, model_name)

        try:
            async with aiohttp.ClientSession() as session:
                if provider == "ollama":
                    payload = {
                        "model": model_name, "prompt": analyze_prompt,
                        "images": cleaned_b64_list, "stream": False, "keep_alive": 0,
                    }
                    async with session.post(f"{base_url}/api/generate", json=payload, timeout=120) as response:
                        if response.status != 200:
                            err_txt = await response.text()
                            return web.json_response({"status": "error", "message": f"Ollama HTTP {response.status}: {err_txt}"})
                        resp_json = await response.json()
                        generated_text = (resp_json.get("response") or "").strip()
                else:
                    # OpenAI-compatible vision chat (LM Studio / Custom).
                    content = [{"type": "text", "text": analyze_prompt}]
                    for b64 in cleaned_b64_list:
                        content.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}})
                    payload = {
                        "model": model_name,
                        "messages": [{"role": "user", "content": content}],
                        "max_tokens": 2048, "stream": False,
                    }
                    async with session.post(f"{base_url}/v1/chat/completions", json=payload, timeout=120) as response:
                        if response.status != 200:
                            err_txt = await response.text()
                            return web.json_response({"status": "error", "message": f"{provider} HTTP {response.status}: {err_txt}"})
                        resp_json = await response.json()
                        try:
                            msg = resp_json["choices"][0]["message"]
                            generated_text = (msg.get("content") or "").strip()
                            # Reasoning/"thinking" models (Gemma, Qwen-thinking, etc.) may leave
                            # content empty and put their output in reasoning_content instead.
                            if not generated_text:
                                generated_text = (msg.get("reasoning_content") or "").strip()
                        except (KeyError, IndexError, TypeError):
                            return web.json_response({"status": "error", "message": f"Unexpected response shape from {provider}."})
        except aiohttp.ClientConnectorError:
            return web.json_response({
                "status": "error",
                "message": f"Could not connect to {provider} at {base_url}. Make sure the server is running and reachable.",
            })

        if "<think>" in generated_text:
            generated_text = generated_text.split("</think>")[-1].strip()

        log.info("[LTXDirector] Analysis complete: %s", generated_text)
        return web.json_response({"status": "success", "description": generated_text})

    except Exception as e:
        log.error(f"[LTXDirector] Failed to analyze character: {e}")
        return web.json_response({"status": "error", "message": str(e)}, status=500)



@PromptServer.instance.routes.post("/ltx25_one/director/unload_ollama")
async def unload_ollama_endpoint(request):
    """Evict the analysis model from VRAM right before a generation run, so the VLM doesn't
    compete with LTX for VRAM (the cause of intermittent CUDA offload crashes).

    Ollama supports a clean instant unload (keep_alive=0). LM Studio / Custom have no reliable
    cross-version HTTP unload, so for those this is a graceful no-op — users should set a short
    JIT / auto-unload TTL in their server instead. Fully tolerant: never raises into the run.
    """
    try:
        import aiohttp
        try:
            data = await request.json()
        except Exception:
            data = {}
        provider, base_url, model_name = _resolve_provider(data)

        if provider == "ollama":
            payload = {"model": model_name, "keep_alive": 0}
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.post(f"{base_url}/api/generate", json=payload, timeout=8) as response:
                        await response.text()
                log.info("[LTXDirector] Asked Ollama to release '%s' from VRAM before the run.", model_name)
            except Exception:
                pass  # Ollama not running / unreachable -> nothing to free.
            return web.json_response({"status": "ok", "provider": provider})

        # LM Studio / Custom: no reliable HTTP unload across versions -> graceful no-op.
        return web.json_response({"status": "ok", "provider": provider, "note": "no-op (set a JIT/TTL unload in your server)"})
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)})


def read_wav_peaks(wav_path):
    import wave
    peaks = []
    with wave.open(wav_path, 'rb') as w:
        n_frames = w.getnframes()
        if n_frames > 0:
            frames_bytes = w.readframes(n_frames)
            samples = np.frombuffer(frames_bytes, dtype=np.int16)
            num_peaks = 200
            step = max(1, len(samples) // num_peaks)
            for i in range(num_peaks):
                chunk = samples[i * step : (i + 1) * step]
                if len(chunk) > 0:
                    max_val = np.max(np.abs(chunk)) / 32767.0
                    peaks.append(float(max_val))
                else:
                    peaks.append(0.0)
        else:
            peaks = [0.0] * 200
    return peaks


def extract_audio_from_video(video_path):
    import wave
    try:
        base, _ = os.path.splitext(video_path)
        output_wav = base + "_extracted_audio.wav"
        
        # Check if already exists, is not empty, and has the correct 44100Hz sample rate
        if os.path.exists(output_wav) and os.path.getsize(output_wav) > 44:
            try:
                with wave.open(output_wav, 'rb') as w_check:
                    if w_check.getframerate() == 44100:
                        peaks = read_wav_peaks(output_wav)
                        input_dir = folder_paths.get_input_directory()
                        rel_output = os.path.relpath(output_wav, input_dir).replace('\\', '/')
                        return rel_output, peaks
            except Exception:
                pass

        # Decode the video using PyAV
        with av.open(video_path) as container:
            if not container.streams.audio:
                return None, None
            stream = container.streams.audio[0]
            
            # Setup resampler to 44100Hz, Mono, signed 16-bit integer (s16)
            resampler = av.AudioResampler(
                format='s16',
                layout='mono',
                rate=44100,
            )
            
            audio_bytes = bytearray()
            
            for frame in container.decode(stream):
                for resampled_frame in resampler.resample(frame):
                    arr = resampled_frame.to_ndarray()
                    audio_bytes.extend(arr.tobytes())
                    
            # Flush resampler
            for resampled_frame in resampler.resample(None):
                arr = resampled_frame.to_ndarray()
                audio_bytes.extend(arr.tobytes())
                
            if not audio_bytes:
                return None, None
                
            # Write WAV file
            with wave.open(output_wav, 'wb') as w:
                w.setnchannels(1)
                w.setsampwidth(2) # 16-bit
                w.setframerate(44100)
                w.writeframes(audio_bytes)
                
        # Calculate peaks
        peaks = []
        samples = np.frombuffer(audio_bytes, dtype=np.int16)
        num_peaks = 200
        step = max(1, len(samples) // num_peaks)
        for i in range(num_peaks):
            chunk = samples[i * step : (i + 1) * step]
            if len(chunk) > 0:
                max_val = np.max(np.abs(chunk)) / 32767.0
                peaks.append(float(max_val))
            else:
                peaks.append(0.0)
                
        input_dir = folder_paths.get_input_directory()
        rel_output = os.path.relpath(output_wav, input_dir).replace('\\', '/')
        return rel_output, peaks
    except Exception as e:
        print(f"[LTXDirector] Server audio extraction failed: {e}")
        return None, None


def get_audio_peaks(audio_path):
    import wave
    # If it is already a WAV file, read peaks directly
    _, ext = os.path.splitext(audio_path)
    if ext.lower() == ".wav":
        try:
            return read_wav_peaks(audio_path)
        except Exception:
            pass # fallback to PyAV
            
    # Use PyAV to decode and resample the audio file
    try:
        with av.open(audio_path) as container:
            if not container.streams.audio:
                return None
            stream = container.streams.audio[0]
            resampler = av.AudioResampler(
                format='s16',
                layout='mono',
                rate=8000,
            )
            audio_bytes = bytearray()
            for frame in container.decode(stream):
                for resampled_frame in resampler.resample(frame):
                    arr = resampled_frame.to_ndarray()
                    audio_bytes.extend(arr.tobytes())
            for resampled_frame in resampler.resample(None):
                arr = resampled_frame.to_ndarray()
                audio_bytes.extend(arr.tobytes())
                
            if not audio_bytes:
                return None
                
            peaks = []
            samples = np.frombuffer(audio_bytes, dtype=np.int16)
            num_peaks = 200
            step = max(1, len(samples) // num_peaks)
            for i in range(num_peaks):
                chunk = samples[i * step : (i + 1) * step]
                if len(chunk) > 0:
                    max_val = np.max(np.abs(chunk)) / 32767.0
                    peaks.append(float(max_val))
                else:
                    peaks.append(0.0)
            return peaks
    except Exception as e:
        print(f"[LTXDirector] Failed to get audio peaks via PyAV: {e}")
        return None


@PromptServer.instance.routes.get("/ltx25_one/director/get_audio")
async def ltx_director_get_audio(request):
    filename = request.query.get("filename")
    if not filename:
        return web.json_response({"error": "Missing filename"}, status=400)

    upload_dir = folder_paths.get_input_directory()
    
    clean_filename = filename.replace('\\', '/')
    file_path = _resolve_asset(clean_filename) or os.path.join(
        upload_dir, os.path.basename(clean_filename))
        
    if not os.path.exists(file_path) or not os.path.isfile(file_path):
        return web.json_response({"error": "File not found"}, status=404)

    _, ext = os.path.splitext(file_path)
    is_audio = ext.lower() in [".wav", ".mp3", ".ogg", ".flac", ".m4a"]
    
    if is_audio:
        peaks = None
        try:
            peaks = get_audio_peaks(file_path)
        except Exception as e:
            print(f"[LTXDirector] Failed to get audio peaks for audio file: {e}")
            
        rel_path = os.path.relpath(file_path, upload_dir).replace('\\', '/')
        return web.json_response({
            "audio_file": rel_path,
            "peaks": peaks
        })

    audio_file, peaks = None, None
    try:
        loop = asyncio.get_event_loop()
        audio_file, peaks = await loop.run_in_executor(None, extract_audio_from_video, file_path)
    except Exception as e:
        print(f"[LTXDirector] Error extracting audio: {e}")

    return web.json_response({
        "audio_file": audio_file,
        "peaks": peaks
    })


@PromptServer.instance.routes.get("/ltx25_one/director/open_folder")
async def ltx_director_open_folder(request):
    upload_dir = _asset_dir()
    os.makedirs(upload_dir, exist_ok=True)
    try:
        current_os = platform.system()
        if current_os == "Windows":
            subprocess.Popen(["explorer", os.path.normpath(upload_dir)])
        elif current_os == "Darwin":
            subprocess.Popen(["open", upload_dir])
        else:
            subprocess.Popen(["xdg-open", upload_dir])
        return web.json_response({"success": True})
    except Exception as e:
        print(f"[LTXDirector] Failed to open workspace folder: {e}")
        return web.json_response({"success": False, "error": str(e)}, status=500)


def _read_and_write_file_chunk(file, file_path, mode):
    chunk_bytes = file.file.read()
    with open(file_path, mode) as f:
        f.write(chunk_bytes)


# --- LTX Director Chunked Video Upload Endpoint ---
# Bypasses the 413 Payload Too Large error for large video files.
# This endpoint is self-contained and independent of any other node.
@PromptServer.instance.routes.post("/ltx25_one/director/upload_chunk")
async def ltx_director_upload_chunk(request):
    post = await request.post()
    file = post.get("file")
    filename = post.get("filename")
    chunk_index = int(post.get("chunk_index"))
    total_chunks = int(post.get("total_chunks"))

    upload_dir = _asset_dir()
    os.makedirs(upload_dir, exist_ok=True)

    # Sanitize filename to prevent path traversal attacks (e.g. ../../etc/passwd)
    filename = os.path.basename(filename)
    file_path = os.path.join(upload_dir, filename)

    # Belt-and-suspenders: confirm the resolved path is still inside the upload directory
    if not os.path.realpath(file_path).startswith(os.path.realpath(upload_dir)):
        return web.json_response({"error": "Invalid filename"}, status=400)

    # Append chunk to file (write fresh on first chunk, append on subsequent)
    mode = "ab" if chunk_index > 0 else "wb"
    
    # Offload the blocking read/write disk I/O to a thread executor
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _read_and_write_file_chunk, file, file_path, mode)

    if chunk_index == total_chunks - 1:
        audio_file, peaks = None, None
        try:
            audio_file, peaks = await loop.run_in_executor(None, extract_audio_from_video, file_path)
        except Exception as e:
            print(f"[LTXDirector] Error in final chunk audio extraction: {e}")
            
        return web.json_response({
            "name": f"{ASSET_SUBFOLDER}/{filename}",
            "audio_file": audio_file,
            "peaks": peaks
        })
    return web.json_response({"status": "ok"})



def _load_image_tensor(seg: dict) -> torch.Tensor:
    """Decode an image from the ComfyUI input folder (if imageFile provided) or fallback to base64
    to a ComfyUI-style image tensor of shape [1, H, W, 3], float32 in [0, 1]."""
    if seg.get("imageFile"):
        file_path = os.path.join(folder_paths.get_input_directory(), seg["imageFile"])
        if os.path.exists(file_path):
            img = Image.open(file_path).convert("RGB")
            arr = np.array(img, dtype=np.float32) / 255.0
            return torch.from_numpy(arr).unsqueeze(0)

    b64_str = seg.get("imageB64", "")
    if not b64_str or b64_str.startswith("/view?"):
        return torch.zeros((1, 512, 512, 3), dtype=torch.float32)

    if "," in b64_str:
        b64_str = b64_str.split(",", 1)[1]
    
    try:
        img_bytes = base64.b64decode(b64_str)
        img = Image.open(_io.BytesIO(img_bytes)).convert("RGB")
        arr = np.array(img, dtype=np.float32) / 255.0
        return torch.from_numpy(arr).unsqueeze(0)
    except:
        return torch.zeros((1, 512, 512, 3), dtype=torch.float32)

def _load_image_sequence_tensor(seg: dict) -> torch.Tensor:
    """Load a segment's `imageFiles` list into a SINGLE [N, H, W, 3] float32 tensor.

    Used by the chunked long-video handoff. Handing LTX N separate one-frame guides is
    not the same as one N-frame guide: the VAE is temporal (8 pixel frames per latent
    frame), so single-frame guides encode as N static latents that all fight over the
    same latent slot, and no motion is carried across the seam. Stacking them here means
    the VAE sees an actual sequence — the same path a video segment already takes, but
    from lossless PNGs instead of a re-decoded h264 clip.
    """
    files = seg.get("imageFiles") or []
    frames = []
    base = folder_paths.get_input_directory()

    for rel in files:
        file_path = os.path.join(base, str(rel))
        if not os.path.exists(file_path):
            log.warning("[LTXDirector] Handoff frame missing: %s", file_path)
            continue
        try:
            img = Image.open(file_path).convert("RGB")
            frames.append(np.array(img, dtype=np.float32) / 255.0)
        except Exception as e:
            log.warning("[LTXDirector] Could not read handoff frame %s: %s", file_path, e)

    if not frames:
        return _load_image_tensor(seg)

    # Mismatched sizes would break the stack; fall back to the first frame's shape.
    h, w = frames[0].shape[0], frames[0].shape[1]
    frames = [f for f in frames if f.shape[0] == h and f.shape[1] == w]

    log.info("[LTXDirector] Image sequence guide: %d frame(s) stacked into one guide.", len(frames))
    return torch.from_numpy(np.stack(frames, axis=0))

def _load_video_tensor(seg: dict, frame_rate: float) -> torch.Tensor:
    """Extracts a sequence of frames from a video file based on the segment's trim parameters,
    and returns them as an [N, H, W, 3] float32 tensor."""
    file_path = os.path.join(folder_paths.get_input_directory(), seg.get("imageFile", ""))
    
    if not os.path.exists(file_path):
        return torch.zeros((1, 512, 512, 3), dtype=torch.float32)

    trim_start_frames = float(seg.get("trimStart", 0))
    length_frames = float(seg.get("length", 1))
    start_sec = trim_start_frames / frame_rate
    
    frames = []
    try:
        with av.open(file_path) as container:
            stream = container.streams.video[0]
            stream.thread_type = "AUTO"
            
            # Seek slightly before target to hit a keyframe
            if stream.time_base:
                seek_pts = int((max(0, start_sec - 0.5)) / float(stream.time_base))
            else:
                seek_pts = int((max(0, start_sec - 0.5)) * av.time_base)
            
            container.seek(seek_pts, stream=stream, backward=True)
            
            for frame in container.decode(stream):
                frame_time = frame.time
                if frame_time is None and frame.pts is not None and stream.time_base:
                    frame_time = float(frame.pts * stream.time_base)
                    
                if frame_time is None:
                    frame_time = 0.0
                    
                if frame_time < start_sec - 0.01:
                    continue
                    
                frames.append(frame.to_ndarray(format='rgb24'))
                
                if len(frames) >= int(length_frames):
                    break
    except Exception as e:
        log.warning(f"[PromptRelay] Video extract error: {e}")
        
    if not frames:
        return torch.zeros((1, 512, 512, 3), dtype=torch.float32)
        
    frames_np = np.array(frames, dtype=np.float32) / 255.0
    return torch.from_numpy(frames_np)

def _resize_image(tensor: torch.Tensor, target_w: int, target_h: int, method: str, divisible_by: int) -> torch.Tensor:
    """Resize an [N, H, W, 3] float32 tensor to target dimensions using the given method,
    then snap the final dimensions to be divisible by `divisible_by`."""
    
    def snap(val, div):
        return max(div, (val // div) * div)

    tw = snap(target_w, divisible_by)
    th = snap(target_h, divisible_by)

    N, H, W, C = tensor.shape
    if H == th and W == tw:
        return tensor

    t_nchw = tensor.permute(0, 3, 1, 2)
    
    if method == "stretch to fit":
        resized = F.interpolate(t_nchw, size=(th, tw), mode="bilinear", align_corners=False)
        
    elif method == "maintain aspect ratio":
        ratio = min(tw / W, th / H)
        new_w = snap(int(W * ratio), divisible_by)
        new_h = snap(int(H * ratio), divisible_by)
        resized = F.interpolate(t_nchw, size=(new_h, new_w), mode="bilinear", align_corners=False)
        
    elif method == "pad" or method == "pad green":
        ratio = min(tw / W, th / H)
        new_w = snap(int(W * ratio), divisible_by)
        new_h = snap(int(H * ratio), divisible_by)
        inner = F.interpolate(t_nchw, size=(new_h, new_w), mode="bilinear", align_corners=False)
        
        pad_l = (tw - new_w) // 2
        pad_t = (th - new_h) // 2
        
        if method == "pad green":
            resized = torch.zeros((N, C, th, tw), dtype=t_nchw.dtype, device=t_nchw.device)
            # #66FF00 is roughly R: 102/255, G: 255/255, B: 0
            resized[:, 0, :, :] = 102 / 255.0
            resized[:, 1, :, :] = 1.0
            resized[:, 2, :, :] = 0.0
            resized[:, :, pad_t:pad_t+new_h, pad_l:pad_l+new_w] = inner
        else:
            resized = F.pad(inner, (pad_l, tw - new_w - pad_l, pad_t, th - new_h - pad_t), mode="constant", value=0)
        
    elif method == "crop":
        ratio = max(tw / W, th / H)
        new_w = int(W * ratio)
        new_h = int(H * ratio)
        inner = F.interpolate(t_nchw, size=(new_h, new_w), mode="bilinear", align_corners=False)
        
        left = (new_w - tw) // 2
        top = (new_h - th) // 2
        resized = inner[:, :, top:top+th, left:left+tw]
        
    else:
        resized = F.interpolate(t_nchw, size=(th, tw), mode="bilinear", align_corners=False)

    return resized.permute(0, 2, 3, 1)


def _compress_image(tensor: torch.Tensor, crf: int) -> torch.Tensor:
    """Apply H.264 compression artefacts to an [N, H, W, 3] float32 tensor (ComfyUI image format).
    crf=0 means no compression. Uses PyAV to encode/decode frames in-memory."""
    if crf == 0:
        return tensor
        
    N, H, W, C = tensor.shape
    
    # Dimensions must be even for H.264
    h = (H // 2) * 2
    w = (W // 2) * 2
    
    # uint8 [N, H, W, 3]
    tensor_bytes = (tensor[:, :h, :w, :] * 255.0).byte().cpu().numpy()
    
    try:
        buf = _io.BytesIO()
        container = av.open(buf, mode="w", format="mp4")
        stream = container.add_stream("libx264", rate=24)
        stream.width = w
        stream.height = h
        stream.pix_fmt = "yuv420p"
        stream.options = {"crf": str(crf), "preset": "ultrafast"}
        
        for i in range(N):
            frame = av.VideoFrame.from_ndarray(tensor_bytes[i], format="rgb24")
            for pkt in stream.encode(frame):
                container.mux(pkt)
                
        for pkt in stream.encode(None):
            container.mux(pkt)
            
        container.close()
        
        buf.seek(0)
        container_r = av.open(buf, mode="r")
        decoded = [frame_r.to_ndarray(format="rgb24") for frame_r in container_r.decode(video=0)]
        container_r.close()
        
        if not decoded:
            return tensor
            
        decoded_np = np.stack(decoded).astype(np.float32) / 255.0
        
        # Re-embed into original tensor shape (may have been cropped by even-rounding)
        out = tensor.clone()
        dec_N = min(N, len(decoded))
        out[:dec_N, :h, :w] = torch.from_numpy(decoded_np[:dec_N]).to(tensor.device, tensor.dtype)
        
        return out
        
    except Exception as e:
        log.warning("[PromptRelay] img_compression encode/decode failed: %s", e)
        return tensor


def _build_combined_audio(timeline_data_str: str, start_frame: int, duration_frames: int, frame_rate: float, override_audio: bool = False) -> dict:
    """Parses timeline JSON, loads/trims audio directly from memory using PyAV, 
    and aligns to a global timeline yielding ComfyUI's format.
    Output length explicitly mimics the timeline's duration_frames length."""
    target_sr = 44100
    total_samples = max(1, int(math.ceil(duration_frames / frame_rate * target_sr)))
    empty_audio = {"waveform": torch.zeros((1, 2, total_samples), dtype=torch.float32), "sample_rate": target_sr}

    if not timeline_data_str:
        return empty_audio

    try:
        data = json.loads(timeline_data_str)
        is_retake = data.get("retakeMode", False)
        if is_retake and data.get("retakeVideo"):
            retake_vid = data.get("retakeVideo")
            audio_segs = [{
                "videoFile": retake_vid.get("imageFile") or retake_vid.get("fileName"),
                "audioFile": retake_vid.get("imageFile") or retake_vid.get("fileName"),
                "start": 0,
                "length": retake_vid.get("videoDurationFrames", duration_frames),
                "trimStart": 0
            }]
            override_audio = True
        elif override_audio:
            audio_segs = data.get("motionSegments", [])
        else:
            audio_segs = data.get("audioSegments", [])
    except Exception:
        return empty_audio

    if not audio_segs:
        return empty_audio

    out_waveform = torch.zeros((2, total_samples), dtype=torch.float32)

    for seg in audio_segs:
        buffer = None
        file_key = "videoFile" if override_audio else "audioFile"
        if seg.get(file_key):
            file_path = _resolve_asset(seg[file_key]) or os.path.join(
                folder_paths.get_input_directory(), seg[file_key])

            if os.path.exists(file_path):
                with open(file_path, "rb") as f:
                    buffer = _io.BytesIO(f.read())
        
        if not override_audio and not buffer and seg.get("audioB64"):
            b64 = seg.get("audioB64")
            if "," in b64:
                b64 = b64.split(",", 1)[1]
            try:
                audio_bytes = base64.b64decode(b64)
                buffer = _io.BytesIO(audio_bytes)
            except:
                pass
                
        if not buffer:
            continue

        try:
            clip_frames = []
            
            # Use PyAV to decode directly from memory buffer
            with av.open(buffer) as container:
                if not container.streams.audio:
                    continue
                stream = container.streams.audio[0]
                
                # Setup resampler to ensure output is 44.1kHz, Stereo, Float32 Planar
                resampler = av.AudioResampler(
                    format='fltp',
                    layout='stereo',
                    rate=target_sr,
                )
                
                for frame in container.decode(stream):
                    for resampled_frame in resampler.resample(frame):
                        # to_ndarray() on fltp gives shape (channels, samples)
                        arr = resampled_frame.to_ndarray()
                        clip_frames.append(torch.from_numpy(arr))
                
                # Flush the resampler to get any remaining samples
                for resampled_frame in resampler.resample(None):
                    arr = resampled_frame.to_ndarray()
                    clip_frames.append(torch.from_numpy(arr))

            if not clip_frames:
                continue

            # Concatenate all frame blocks along the samples dimension (dim 1)
            waveform = torch.cat(clip_frames, dim=1) # Shape: [2, total_clip_samples]

            # Calculate interactive trim boundaries
            trim_start_frames = float(seg.get("trimStart", 0))
            length_frames = float(seg.get("length", 1))
            start_frames = float(seg.get("start", 0))
            
            if start_frames + length_frames <= start_frame:
                continue
                
            offset = max(0, start_frame - start_frames)
            trim_start_frames += offset
            length_frames = max(1, length_frames - offset)
            start_frames = max(0, start_frames - start_frame)

            start_sample_src = int(trim_start_frames / frame_rate * target_sr)
            length_samples = int(length_frames / frame_rate * target_sr)
            end_sample_src = start_sample_src + length_samples

            if start_sample_src < 0: start_sample_src = 0
            if end_sample_src > waveform.shape[1]:
                end_sample_src = waveform.shape[1]

            actual_length = end_sample_src - start_sample_src
            if actual_length <= 0: continue

            # Extract the correct segment of the audio
            clip_waveform = waveform[:, start_sample_src:end_sample_src]

            # Position onto the timeline
            start_sample_dst = int(start_frames / frame_rate * target_sr)
            
            if start_sample_dst >= out_waveform.shape[1]:
                continue
                
            end_sample_dst = start_sample_dst + actual_length

            # Clip any trailing overflow so we don't index past the timeline bounds
            if end_sample_dst > out_waveform.shape[1]:
                actual_length = out_waveform.shape[1] - start_sample_dst
                clip_waveform = clip_waveform[:, :actual_length]
                end_sample_dst = start_sample_dst + actual_length
                
            if actual_length <= 0:
                continue

            # Additive composite (allows clips overlapping to sum together naturally)
            out_waveform[:, start_sample_dst:end_sample_dst] += clip_waveform

        except Exception as e:
            log.warning("[PromptRelay] Audio process error for segment %s: %s", seg.get("fileName"), e)
            continue

    return {"waveform": out_waveform.unsqueeze(0), "sample_rate": target_sr}


def _convert_to_latent_lengths(pixel_lengths, temporal_stride, latent_frames):
    """Convert pixel-space segment lengths to integer latent-space lengths using the
    largest-remainder method. Targets the full `latent_frames` when the pixel sum looks
    like full coverage (within one stride of latent_frames * stride). Otherwise targets
    round(total_pixel / temporal_stride) so partial-coverage timelines stay partial.
    """
    if not pixel_lengths:
        return []
    total_pixel = sum(pixel_lengths)
    if total_pixel <= 0:
        return [1] * len(pixel_lengths)

    naive_total = max(1, round(total_pixel / temporal_stride))
    target_total = min(latent_frames, naive_total)
    # Within one frame of full → user clearly intended full coverage; pin to latent_frames.
    if target_total >= latent_frames - 1:
        target_total = latent_frames

    exact = [p * target_total / total_pixel for p in pixel_lengths]
    result = [int(e) for e in exact]
    diff = target_total - sum(result)
    if diff > 0:
        order = sorted(range(len(exact)), key=lambda i: -(exact[i] - int(exact[i])))
        for k in range(diff):
            result[order[k % len(order)]] += 1

    # Ensure every segment has ≥ 1 latent frame (steal from the largest if needed).
    for i in range(len(result)):
        if result[i] < 1:
            max_idx = max(range(len(result)), key=lambda j: result[j])
            if result[max_idx] > 1:
                result[max_idx] -= 1
                result[i] = 1

    return result


def _encode_relay(model, clip, latent, global_prompt, local_prompts, segment_lengths, epsilon, disable_relay=False):
    # disable_relay: skip all temporal masking. Encode the global prompt once and hand back
    # an UNPATCHED model clone - no segment chunking, no mask_fn, no attention wrapping. The
    # whole clip is driven by the global prompt (image guides / anchors still work, since
    # those live in the guide node, not here). Faster, and the intended path for timelines
    # that only place images at times with no per-segment prompts.
    if disable_relay:
        gp = global_prompt if (global_prompt and global_prompt.strip()) else "video"
        log.info("[PromptRelay] DISABLED - global-prompt-only encode, attention left unpatched.")
        conditioning = clip.encode_from_tokens_scheduled(clip.tokenize(gp))
        return model.clone(), conditioning

    for name, val in (("global_prompt", global_prompt),
                      ("local_prompts", local_prompts),
                      ("segment_lengths", segment_lengths)):
        if val is None:
            raise ValueError(
                f"PromptRelay: '{name}' arrived as None. "
                "Likely causes: a stale workflow JSON saved with null, the timeline "
                "editor's web extension failing to load, or an upstream node returning None. "
                "Set the field to an empty string or fix the upstream connection."
            )

    # Split prompts but do NOT filter out empty ones yet, so we can detect them
    locals_list = [p.strip() for p in local_prompts.split("|")]
    
    # If there are no visual segments on the timeline (e.g., only using IC-LoRA motion track),
    # bypass the local prompt chunking entirely and just use the global prompt.
    if not locals_list or (len(locals_list) == 1 and not locals_list[0]):
        log.info("[PromptRelay] No local segments found. Using global prompt exclusively.")
        conditioning = clip.encode_from_tokens_scheduled(clip.tokenize(global_prompt))
        return model.clone(), conditioning

    # Check if any specific segment is empty and apply fallbacks
    for i, p in enumerate(locals_list):
        if not p:
            fallback = global_prompt.strip() if global_prompt else "video"
            if not fallback:
                fallback = "video"
            locals_list[i] = fallback

    arch, patch_size, temporal_stride = detect_model_type(model)

    samples = latent["samples"]
    latent_frames = samples.shape[2]
    tokens_per_frame = (samples.shape[3] // patch_size[1]) * (samples.shape[4] // patch_size[2])

    parsed_lengths = None
    if segment_lengths.strip():
        pixel_lengths = [int(float(x.strip())) for x in segment_lengths.split(",") if x.strip()]
        parsed_lengths = _convert_to_latent_lengths(pixel_lengths, temporal_stride, latent_frames)

    raw_tokenizer = get_raw_tokenizer(clip)
    full_prompt, token_ranges = map_token_indices(raw_tokenizer, global_prompt, locals_list)

    log.info("[PromptRelay] Global: tokens [0:%d] (%d tokens)", token_ranges[0][0], token_ranges[0][0])
    for i, (s, e) in enumerate(token_ranges):
        log.info("[PromptRelay] Segment %d: tokens [%d:%d] (%d tokens)", i, s, e, e - s)

    conditioning = clip.encode_from_tokens_scheduled(clip.tokenize(full_prompt))

    effective_lengths = distribute_segment_lengths(len(locals_list), latent_frames, parsed_lengths)

    log.info(
        "[PromptRelay] Latent: %d frames, %d tokens/frame, segments: %s",
        latent_frames, tokens_per_frame, effective_lengths,
    )

    q_token_idx = build_segments(token_ranges, effective_lengths, epsilon, None)
    mask_fn = create_mask_fn(q_token_idx, tokens_per_frame, latent_frames)

    patched = model.clone()
    apply_patches(patched, arch, mask_fn)

    return patched, conditioning


class LTXDirector(io.ComfyNode):
    """WYSIWYG timeline variant — segments and lengths come from a visual editor in the node UI."""

    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="LTXDirectorTJ25",
            display_name="LTX Director (TJ 2.5)",
            category="WhatDreamsCost CS 2.5",
            description=(
                "Same as Prompt Relay Encode, but local prompts and segment lengths are edited "
                "visually as draggable blocks on a timeline. The duration_frames input only sets the "
                "timeline scale (pixel space) — actual frame count is still read from the latent."
            ),
            inputs=[
                io.Model.Input("model"),
                io.Clip.Input("clip"),
                io.Vae.Input("audio_vae", optional=True, tooltip="Optional. Connect an Audio VAE to generate audio latents."),
                io.Latent.Input("optional_latent", optional=True, tooltip="Optional. Connect a latent to override the auto-generated one."),
                io.String.Input(
                    "global_prompt", multiline=True, default="", force_input=True, optional=True,
                    tooltip="Conditions the entire video. Anchors persistent characters, objects, and scene context.",
                ),
                io.Float.Input(
                    "start_second", default=0.0, min=0.0, max=1000.0, step=0.01,
                    tooltip="Start time in seconds of the timeline generation.",
                ),
                io.Float.Input(
                    "end_second", default=5.0, min=0.0, max=1000.0, step=0.01,
                    tooltip="End time in seconds of the timeline generation.",
                ),
                io.Float.Input(
                    "duration_seconds", default=5.0, min=0.1, max=1000.0, step=0.01,
                    tooltip="Total timeline duration in seconds (computed/synced from frames).",
                ),
                io.Int.Input(
                    "start_frame", default=0, min=0, max=10000, step=1,
                    tooltip="Start frame of the timeline generation.",
                ),
                io.Int.Input(
                    "end_frame", default=120, min=1, max=10000, step=1,
                    tooltip="End frame of the timeline generation.",
                ),
                io.Int.Input(
                    "duration_frames", default=120, min=1, max=10000, step=1,
                    tooltip="Total timeline length in pixel-space frames. Used by the editor for visual scale only.",
                ),
                io.String.Input(
                    "timeline_data", default="",
                    tooltip="JSON state of the timeline editor (auto-managed; do not edit by hand).",
                ),
                io.Boolean.Input(
                    "use_custom_audio", default=False, optional=True,
                    tooltip="Toggle between using timeline audio (ON) and generating audio from scratch (OFF).",
                ),
                io.Boolean.Input(
                    "use_custom_motion", default=True, optional=True,
                    tooltip="Toggle between using timeline motion guidance (ON) and ignoring motion video segments (OFF).",
                ),
                io.Boolean.Input(
                    "inpaint_audio", default=True, optional=True,
                    tooltip="Toggle whether empty gaps in the audio track are inpainted with generated audio.",
                ),
                io.String.Input(
                    "local_prompts", multiline=True, default="",
                    tooltip="Auto-populated from the timeline editor.",
                ),
                io.String.Input(
                    "segment_lengths", default="",
                    tooltip="Auto-populated from the timeline editor (pixel-space frame counts).",
                ),
                io.Float.Input(
                    "epsilon", default=0.001, min=0.0001, max=0.99, step=0.0001,
                    tooltip="Penalty decay parameter. Values below ~0.1 all produce sharp boundaries (paper default 0.001). For softer transitions, try 0.5 or higher.",
                ),
                io.Float.Input(
                    "frame_rate", default=24, min=1, max=240, step=1, optional=True,
                    tooltip="Frames per second — only affects how time is displayed in the timeline editor when time_units is set to 'seconds'.",
                ),
                io.Combo.Input(
                    "display_mode", options=["frames", "seconds"], default="seconds", optional=True,
                    tooltip="Display the ruler, segment ranges, length input, and total in frames or seconds. Internal storage is always pixel-space frames.",
                ),
                io.String.Input(
                    "guide_strength", default="",
                    tooltip="Auto-populated from the timeline editor (comma-separated guide strengths for image segments).",
                ),
                io.Int.Input(
                    "custom_width", default=0, min=0, max=8192, step=1, optional=True,
                    tooltip="Target output width for all image segments. Set to 0 to use the original image width.",
                ),
                io.Int.Input(
                    "custom_height", default=0, min=0, max=8192, step=1, optional=True,
                    tooltip="Target output height for all image segments. Set to 0 to use the original image height.",
                ),
                io.Combo.Input(
                    "resize_method",
                    options=["maintain aspect ratio", "stretch to fit", "pad", "pad green", "crop"],
                    default="maintain aspect ratio",
                    optional=True,
                    tooltip="How to resize image segments to fit the target dimensions.",
                ),
                io.Int.Input(
                    "divisible_by", default=32, min=1, max=256, step=1, optional=True,
                    tooltip="Snap the final output image dimensions to be divisible by this number (e.g. 32 for LTX).",
                ),
                io.Int.Input(
                    "img_compression", default=18, min=0, max=100, step=1, optional=True,
                    tooltip="H.264 CRF compression to apply to each guide image. 0 = no compression, higher = more artefacts.",
                ),
                io.Boolean.Input(
                    "override_audio", default=False, optional=True,
                    tooltip="Use the audio from the IC-LoRA video instead of using the audio track.",
                ),
                io.Vae.Input(
                    "vae", optional=True,
                    tooltip="Optional. Connect the LTX Autoencoder/VAE here to natively encode the MSR visual reference slideshow into the latent prefix. Required for the 'Licon MSR' ref option.",
                ),
                io.Float.Input(
                    "reference_strength", default=1.0, min=0.0, max=5.0, step=0.05, optional=True,
                    tooltip="Guide strength applied to the character reference images (Ghost Mask / Licon MSR ref options).",
                ),
                io.Image.Input(
                    "ref_images", optional=True,
                    tooltip="Ghost Mask only. Extra reference image(s) (e.g. an object) — a single image or a batch. Appended as their own block of hidden reference frames AFTER the @ref references, for any number of reference slots loaded (0-3). Ignored in MSR / OFF modes.",
                ),
                io.Float.Input(
                    "start", force_input=True, optional=True, default=0.0,
                    tooltip="Automation (connection-only). Start time in SECONDS. Overrides the panel Start when connected.",
                ),
                io.Float.Input(
                    "end", force_input=True, optional=True, default=0.0,
                    tooltip="Automation (connection-only). End time in SECONDS. When connected (and duration is not), the render length is derived from start..end.",
                ),
                io.Float.Input(
                    "duration", force_input=True, optional=True, default=0.0,
                    tooltip="Automation (connection-only). Duration in SECONDS. Overrides the panel Duration and sets the render length when connected.",
                ),
            ],
            outputs=[
                io.Model.Output(display_name="model"),
                io.Conditioning.Output(display_name="positive"),
                io.Conditioning.Output(display_name="negative", tooltip="Negative conditioning emitted by the Director (neutral/empty). Wire to LTX Director Guide's 'negative' input."),
                io.Latent.Output(display_name="video_latent", tooltip="Auto-generated LTXV empty latent (only populated when no latent is connected)."),
                io.Latent.Output(display_name="audio_latent", tooltip="Auto-generated audio latent (uses custom audio if enabled)."),
                GuideData.Output(display_name="guide_data"),
                MotionGuideData.Output(display_name="motion_guide_data"),
                io.Float.Output(display_name="frame_rate", tooltip="The frame rate used for the timeline."),
                io.Audio.Output(display_name="combined_audio", tooltip="Combined timeline audio layout."),
                # clean_latent_frames / clean_pixel_frames only ever mattered because the
                # reference modes appended hidden reference latents past the visible video,
                # which a downstream Clean Latent Slice had to trim off. With those modes
                # disabled nothing is ever appended, so the outputs would always report the
                # full length and the slice would be a no-op. They come back with the flag.
            ] + ([
                io.Int.Output(display_name="clean_latent_frames", tooltip="Number of clean (visible) latent frames. Plug into Clean Latent Slice 'length'."),
                io.Int.Output(display_name="clean_pixel_frames", tooltip="Number of clean (visible) pixel frames = (clean_latent_frames - 1) * 8 + 1."),
            ] if REFERENCE_FEATURES else []),
        )

    @classmethod
    def execute(cls, model, clip, start_second, end_second, duration_seconds, start_frame, end_frame, duration_frames,
                timeline_data, local_prompts, segment_lengths, global_prompt="", guide_strength="", epsilon=1e-3,
                frame_rate=24, display_mode="seconds",
                custom_width=768, custom_height=512, resize_method="maintain aspect ratio",
                divisible_by=32, img_compression=0, audio_vae=None, optional_latent=None,
                use_custom_audio=False, inpaint_audio=True, use_custom_motion=True, override_audio=False,
                vae=None, reference_strength=1.0, ref_images=None,
                start=None, end=None, duration=None) -> io.NodeOutput:

        # Parse timeline data
        try:
            tdata = json.loads(timeline_data) if timeline_data else {}
        except Exception as e:
            log.error(f"[LTXDirector] execute timeline_data parse error: {e}")
            tdata = {}

        # --- Automation overrides (connection-only inputs, in SECONDS) ---
        # When wired, these take precedence over the panel/timeline values.
        _auto_fps = float(frame_rate) if frame_rate else 24.0
        if start is not None:
            start_second = float(start)
            start_frame = int(round(start_second * _auto_fps))
        if end is not None:
            end_second = float(end)
            end_frame = int(round(end_second * _auto_fps))
        if duration is not None:
            duration_seconds = float(duration)
            duration_frames = max(1, int(round(duration_seconds * _auto_fps)))
        elif end is not None:
            # Derive the window length from start..end when duration is not explicitly wired.
            duration_frames = max(1, end_frame - start_frame)
            duration_seconds = duration_frames / _auto_fps

        is_retake_mode = tdata.get("retakeMode", False)
        is_retake_active = is_retake_mode and tdata.get("retakeVideo") is not None

        # Extract global_prompt from timeline_data if not connected/empty
        if not global_prompt:
            if is_retake_mode:
                global_prompt = tdata.get("retake_global_prompt", "")
            else:
                global_prompt = tdata.get("global_prompt", "")

        log.info(f"[LTXDirector] execute RECEIVED global_prompt: {repr(global_prompt)}")

        # --- Reference option (set by the toolbar "Ref Option" dropdown, stored in timeline JSON) ---
        # One of: "Ghost Mask (End)", "Licon MSR (Prefix)", "OFF".
        reference_mode = tdata.get("reference_mode", "OFF")
        if not REFERENCE_FEATURES and reference_mode != "OFF":
            log.warning(
                "[LTXDirector] Timeline requests reference mode %r, but reference features are "
                "disabled in this build (LTX 2.5). Rendering without it.", reference_mode)
            reference_mode = "OFF"
        disable_relay = bool(tdata.get("disable_prompt_relay", False))

        # --- Load character reference slots from the timeline JSON ---
        # characters = [{ "images": [{"b64":..., "name":...}], "description": "..." }, ...]
        char_images = []          # flat list of every reference image tensor
        char_slot_images = []     # per-slot tensors, for @char tag filtering in MSR mode
        char1_val, char2_val, char3_val = "", "", ""
        try:
            characters = tdata.get("characters", [])
            if len(characters) > 0:
                char1_val = characters[0].get("description", "")
            if len(characters) > 1:
                char2_val = characters[1].get("description", "")
            if len(characters) > 2:
                char3_val = characters[2].get("description", "")

            for char_info in characters:
                images_list = char_info.get("images", [])
                legacy_b64 = char_info.get("imageB64", "")
                if legacy_b64 and not images_list:
                    images_list = [{"b64": legacy_b64, "name": char_info.get("fileName", "")}]

                slot_tensors = []
                for img_info in images_list:
                    image_b64 = img_info.get("b64", "")
                    file_name = img_info.get("name", "")
                    tensor = _load_image_source(image_b64, file_name)
                    char_images.append(tensor)
                    slot_tensors.append(tensor)
                char_slot_images.append(slot_tensors)
        except Exception as e:
            log.warning("[LTXDirector] Could not process character slot inputs: %s", e)

        # --- @charN substitution ---
        # Ghost Mask / OFF: swap @char tags for their VLM descriptions in the prompt text.
        # Licon MSR: leave the tags raw — there the reference IMAGE drives identity, and the
        #            tags are used only to pick which character slots feed the slideshow.
        # The MSR slot scan further down looks for @refN tags to pick which sheets feed
        # the slideshow - substitution removes them, so capture the raw text first.
        _raw_tag_text = (global_prompt or "") + " " + (
            local_prompts if isinstance(local_prompts, str) else " ".join(local_prompts or [])
        )
        # Ghost Mask / OFF: swap tags for the full VLM description.
        # Licon MSR: swap for the slot's SHORT label so the encoder reads clean text
        #            instead of a literal "@ref1" token; identity still comes from the
        #            reference image. Empty slot -> tag left as-is (pre-existing behaviour).
        ref_global, ref_local = _preprocess_prompts_with_characters(
            global_prompt, local_prompts, char1_val, char2_val, char3_val,
            skip_empty=(reference_mode == "Licon MSR (Prefix)"),
        )
        global_prompt, local_prompts = ref_global, ref_local

        # --- Build guide_data from image segments FIRST (to derive output dimensions) ---
        guide_data = {"images": [], "insert_frames": [], "strengths": [], "frame_rate": frame_rate}
        derived_w, derived_h = custom_width, custom_height
        try:
            img_segs = [
                s for s in tdata.get("segments", [])
                if s.get("type", "image") in ("image", "video")
                and (s.get("imageFile") or s.get("imageB64"))
                and int(s.get("start", 0)) < start_frame + duration_frames
                and int(s.get("start", 0)) + int(s.get("length", 1)) > start_frame
            ]
            img_segs.sort(key=lambda s: s["start"])

            strengths = []
            if guide_strength.strip():
                strengths = [float(x.strip()) for x in guide_strength.split(",") if x.strip()]

            for idx, seg in enumerate(img_segs):
                seg_start = int(seg.get("start", 0))
                offset = max(0, start_frame - seg_start)

                if seg.get("type") == "video":
                    if offset > 0:
                        seg["trimStart"] = float(seg.get("trimStart", 0)) + offset
                        seg["length"] = max(1, int(seg.get("length", 1)) - offset)
                    tensor = _load_video_tensor(seg, float(frame_rate))
                elif seg.get("imageFiles"):
                    tensor = _load_image_sequence_tensor(seg)
                else:
                    tensor = _load_image_tensor(seg)

                # Apply resize
                src_h, src_w = tensor.shape[1], tensor.shape[2]

                def snap(val, div):
                    return max(div, (val // div) * div)

                if custom_width > 0 and custom_height > 0:
                    # Both dimensions set — apply selected resize_method (pad, crop, stretch, maintain AR)
                    tensor = _resize_image(tensor, custom_width, custom_height, resize_method, divisible_by)
                elif custom_width > 0:
                    # Width only — scale height from AR, snap both, then resize to exact dimensions
                    tgt_w = snap(custom_width, divisible_by)
                    tgt_h = snap(int(src_h * tgt_w / src_w), divisible_by)
                    tensor = _resize_image(tensor, tgt_w, tgt_h, "stretch to fit", divisible_by)
                elif custom_height > 0:
                    # Height only — scale width from AR, snap both, then resize to exact dimensions
                    tgt_h = snap(custom_height, divisible_by)
                    tgt_w = snap(int(src_w * tgt_h / src_h), divisible_by)
                    tensor = _resize_image(tensor, tgt_w, tgt_h, "stretch to fit", divisible_by)
                else:
                    # Both zero — keep original dimensions, just snap to divisible_by
                    tensor = _resize_image(tensor, src_w, src_h, "maintain aspect ratio", divisible_by)


                # Apply compression. Skipped for the chunk handoff strip: those frames are
                # the previous chunk's own output and must stay pixel-exact, and _compress_image
                # round-trips through h264/yuv420p which shifts levels.
                if img_compression > 0 and not seg.get("isHandoff"):
                    tensor = _compress_image(tensor, img_compression)

                # Record dimensions of the first processed image for latent generation
                if idx == 0:
                    derived_h = tensor.shape[1]
                    derived_w = tensor.shape[2]

                if seg.get("isEndFrame"):
                    insert_frame = max(0, seg_start + int(seg.get("length", 1)) - 1 - start_frame)
                else:
                    insert_frame = max(0, seg_start - start_frame)
                strength = strengths[idx] if idx < len(strengths) else 1.0
                guide_data["images"].append(tensor)
                guide_data["insert_frames"].append(insert_frame)
                guide_data["strengths"].append(float(strength))
            
            # If no images were loaded from the timeline, create a dummy image at strength 0
            # to prevent artifacts in text-to-video mode.
            if not guide_data["images"] and optional_latent is None:
                src_w = derived_w if derived_w > 0 else 768
                src_h = derived_h if derived_h > 0 else 512
                
                # If there's an IC-LoRA video or retake base video on the timeline, extract its dimensions for accurate aspect ratio scaling
                tdata_motion = json.loads(timeline_data) if timeline_data else {}
                found_dims = False
                
                # Check for retake base video first
                is_retake = tdata_motion.get("retakeMode", False)
                retake_vid = tdata_motion.get("retakeVideo") or {}
                retake_file = retake_vid.get("imageFile", "") if isinstance(retake_vid, dict) else ""
                if is_retake and retake_file:
                    r_path = _resolve_asset(retake_file) or os.path.join(
                        folder_paths.get_input_directory(), retake_file)
                    if os.path.exists(r_path):
                        try:
                            with av.open(r_path) as container:
                                stream = container.streams.video[0]
                                src_w = stream.width or stream.codec_context.width
                                src_h = stream.height or stream.codec_context.height
                                found_dims = True
                        except:
                            pass
                
                # Fallback to normal motion segments
                if not found_dims:
                    for mseg in tdata_motion.get("motionSegments", []):
                        v_file = mseg.get("videoFile")
                        if v_file:
                            v_path = _resolve_asset(v_file) or os.path.join(
                                folder_paths.get_input_directory(), v_file)
                            if os.path.exists(v_path):
                                try:
                                    with av.open(v_path) as container:
                                        stream = container.streams.video[0]
                                        src_w = stream.width or stream.codec_context.width
                                        src_h = stream.height or stream.codec_context.height
                                        found_dims = True
                                        break
                                except:
                                    pass

                # Create a dummy tensor of the exact source dimensions
                tensor = torch.zeros((1, src_h, src_w, 3), dtype=torch.float32)

                def snap(val, div):
                    return max(div, (val // div) * div)

                # Route the dummy tensor through the exact same resizing pipeline
                if custom_width > 0 and custom_height > 0:
                    tensor = _resize_image(tensor, custom_width, custom_height, resize_method, divisible_by)
                elif custom_width > 0:
                    tgt_w = snap(custom_width, divisible_by)
                    tgt_h = snap(int(src_h * tgt_w / src_w), divisible_by)
                    tensor = _resize_image(tensor, tgt_w, tgt_h, "stretch to fit", divisible_by)
                elif custom_height > 0:
                    tgt_h = snap(custom_height, divisible_by)
                    tgt_w = snap(int(src_w * tgt_h / src_h), divisible_by)
                    tensor = _resize_image(tensor, tgt_w, tgt_h, "stretch to fit", divisible_by)
                else:
                    tensor = _resize_image(tensor, src_w, src_h, "maintain aspect ratio", divisible_by)
                
                guide_data["images"].append(tensor)
                guide_data["insert_frames"].append(0)
                guide_data["strengths"].append(0.0)
                
                derived_w = tensor.shape[2]
                derived_h = tensor.shape[1]

        except Exception as e:
            log.warning("[PromptRelay] Could not build guide_data: %s", e)

        # --- Auto-generate LTXV latent if none was provided ---
        # Apply the community 8n+1 rule directly to the timeline's duration_frames:
        # int(ceil(((duration_frames) - 1) / 8) * 8) + 1
        # This ensures we get AT LEAST the requested frames, snapped to LTXV's requirements.
        ltxv_length = int(math.ceil((duration_frames - 1) / 8.0) * 8) + 1

        latent_w = max(32, (derived_w // 32) * 32)
        latent_h = max(32, (derived_h // 32) * 32)
        # Clean (visible) region: latent frames and the matching pixel frames.
        clean_latent_frames = ((ltxv_length - 1) // 8) + 1
        clean_pixel_frames = int(ltxv_length)

        # Negative conditioning emitted on the "negative" output (slot 2, right under positive).
        # The Director no longer takes a negative input; it emits a neutral EMPTY negative so the
        # downstream guide always has a valid required input. Wire your own Negative Prompt node
        # straight into the guide if you want custom negative text.
        neg_tokens = clip.tokenize("")
        conditioning_neg = clip.encode_from_tokens_scheduled(neg_tokens)

        # Fall back to the first local prompt as the global anchor if no global prompt was given.
        if not (global_prompt or "").strip() and local_prompts:
            global_prompt = local_prompts.split("|")[0].strip()

        _dev = comfy.model_management.intermediate_device()

        if reference_mode == "Licon MSR (Prefix)":
            # ============ LICON MSR DIRECTOR ENGINE ============
            # Character slots drive identity via an IC-LoRA reference slideshow + per-character
            # keyframes, handed to the downstream LTXDirectorGuide through guide_data["msr"].
            if vae is None:
                raise ValueError("Licon MSR (Prefix) ref option requires connecting the VAE to LTX Director!")

            # Honour @refN (and legacy @charN) tags: select only the slots the prompt references; else all filled slots.
            _prompt_text = _raw_tag_text
            _tag_pairs = [("@character1", "@char1", "@ref1"), ("@character2", "@char2", "@ref2"), ("@character3", "@char3", "@ref3")]
            _referenced_slots = [i for i, tags in enumerate(_tag_pairs) if any(t in _prompt_text for t in tags)]
            _selected = []
            for _slot in _referenced_slots:
                if _slot < len(char_slot_images):
                    _selected.extend(char_slot_images[_slot])
            if not _selected:
                _selected = char_images
            log.info("[LTXDirector] MSR slideshow subjects: referenced slots=%s, images=%d", _referenced_slots, len(_selected))

            identity_images = [
                _resize_image(c, latent_w, latent_h, resize_method, divisible_by) for c in _selected
            ]

            # Scene background = first timeline image (already in guide_data), else black.
            scene_images = list(guide_data["images"])
            if scene_images:
                bg_slide = scene_images[0]
                if bg_slide.shape[1] != latent_h or bg_slide.shape[2] != latent_w:
                    bg_slide = _resize_image(bg_slide, latent_w, latent_h, resize_method, divisible_by)
            else:
                bg_slide = torch.zeros((1, latent_h, latent_w, 3), dtype=torch.float32)

            # Build the slideshow: characters then background, distributed across MSR_PREFIX_FRAMES.
            slideshow_sources = identity_images + [bg_slide]
            base_count = MSR_PREFIX_FRAMES // len(slideshow_sources)
            remainder = MSR_PREFIX_FRAMES % len(slideshow_sources)
            slideshow_tensors = []
            for index, src_img in enumerate(slideshow_sources):
                repeats = base_count + (1 if index < remainder else 0)
                slideshow_tensors.extend([src_img[0]] * repeats)
            slideshow_video = torch.stack(slideshow_tensors)

            keyframe_images = slideshow_sources
            # Prefix length is user-selectable (Licon V1: 17/25/33/41; V2 adds 49/57/65).
            # Read from the timeline, validate against the allowed 8n+1 set, else default.
            _msr_frames = int(tdata.get("msr_prefix_frames", MSR_PREFIX_FRAMES) or MSR_PREFIX_FRAMES)
            if _msr_frames not in (17, 25, 33, 41, 49, 57, 65):
                log.warning("[LTXDirector] Invalid msr_prefix_frames=%s, using %d.", _msr_frames, MSR_PREFIX_FRAMES)
                _msr_frames = MSR_PREFIX_FRAMES
            prefix_latents = ((_msr_frames - 1) // 8) + 1
            tail_latents = prefix_latents
            total_latent_frames = clean_latent_frames + tail_latents
            tail_pixels = tail_latents * 8

            # Relay conditioning over the runtime length: clean -> locals, tail -> global.
            local_part = local_prompts.strip() if local_prompts.strip() else global_prompt
            clean_lengths = segment_lengths.strip() if segment_lengths.strip() else str(duration_frames)
            injected_local = f"{local_part} | {global_prompt}"
            injected_lengths = f"{clean_lengths},{tail_pixels}"

            dummy_full = {"samples": torch.zeros(
                [1, 128, total_latent_frames, latent_h // 32, latent_w // 32], device=_dev,
            )}
            patched, conditioning = _encode_relay(
                model, clip, dummy_full, global_prompt, injected_local, injected_lengths, epsilon, disable_relay,
            )

            # Clean base latent (the true visible region); the guide node pads + appends keyframes per stage.
            if optional_latent is None:
                latent = {
                    "samples": torch.zeros([1, 128, clean_latent_frames, latent_h // 32, latent_w // 32], device=_dev),
                    "noise_mask": torch.ones((1, 1, clean_latent_frames, latent_h // 32, latent_w // 32), dtype=torch.float32, device=_dev),
                }
            else:
                latent = optional_latent

            # Hand the RAW full-res references to the guide node via guide_data["msr"].
            guide_data = {
                "images": [], "insert_frames": [], "strengths": [], "frame_rate": float(frame_rate),
                "msr": {
                    "slideshow": slideshow_video,
                    "keyframes": keyframe_images,
                    "prefix_latents": int(prefix_latents),
                    "strength": float(reference_strength),
                    "downscale": float(MSR_LATENT_DOWNSCALE),
                    "clean_latent_frames": int(clean_latent_frames),
                    "negative": conditioning_neg,
                },
            }
            log.info(
                "[LTXDirector] Licon MSR Engine: clean=%d, tail=%d (prefix), %d keyframes for the guide node.",
                clean_latent_frames, tail_latents, len(keyframe_images),
            )

        else:
            # ============ OFF / Ghost Mask (End) ============
            # OFF runs over the clean latent. Ghost Mask hides one reference per character in a
            # tail PAST the clean region, each in its own frame so identities never blend. To stay
            # consistent with the audio latent (which is sized to the CLEAN length), the Director —
            # exactly like Licon MSR — outputs a CLEAN video latent and lets the GUIDE pre-extend
            # it. This keeps video and audio matched at the AV-concat stage; extending the video
            # inside the Director instead would desync them and crash the joint LTX2 sampler.
            # Extra Ghost reference images (e.g. an object) from the optional "ref_images" input.
            # Split a (possibly batched) IMAGE into single frames and append them AFTER the @char
            # references as their own block — independent of how many characters are loaded.
            extra_refs = []
            if reference_mode == "Ghost Mask (End)" and ref_images is not None:
                try:
                    for _bi in range(ref_images.shape[0]):
                        extra_refs.append(ref_images[_bi:_bi + 1])
                except Exception as _e:
                    log.warning("[LTXDirector] Could not process ref_images input: %s", _e)

            ghost_refs = char_images + extra_refs
            is_ghost = (reference_mode == "Ghost Mask (End)" and bool(ghost_refs))
            n_refs = len(ghost_refs) if is_ghost else 0

            if is_ghost:
                # Build the reference list now (so the guide can encode + anchor them), but keep
                # the emitted latent clean. Each reference anchors at (clean_latent_frames + i).
                for i, single_ref in enumerate(ghost_refs):
                    ref_tensor = _resize_image(single_ref, latent_w, latent_h, resize_method, divisible_by)
                    if img_compression > 0:
                        ref_tensor = _compress_image(ref_tensor, img_compression)
                    guide_data["images"].append(ref_tensor)
                    guide_data["insert_frames"].append((clean_latent_frames + i) * 8)
                    guide_data["strengths"].append(float(reference_strength))
                # Tell the guide to pre-extend the (clean) latent by this many frames before it
                # processes the references, so the tail anchors land in-range. The guide pads;
                # the Director does not — keeping video/audio lengths matched downstream.
                guide_data["ghost_pre_extend"] = int(n_refs)

                # Relay conditioning over the EXTENDED length (clean + tail), to match the latent
                # length the guide will hand the sampler. Clean region -> locals, tail -> global.
                total_latent_frames = clean_latent_frames + n_refs
                tail_pixels = n_refs * 8
                local_part = local_prompts.strip() if local_prompts.strip() else global_prompt
                clean_lengths = segment_lengths.strip() if segment_lengths.strip() else str(duration_frames)
                injected_local = f"{local_part} | {global_prompt}"
                injected_lengths = f"{clean_lengths},{tail_pixels}"
                dummy_full = {"samples": torch.zeros(
                    [1, 128, total_latent_frames, latent_h // 32, latent_w // 32], device=_dev,
                )}
                patched, conditioning = _encode_relay(
                    model, clip, dummy_full, global_prompt, injected_local, injected_lengths, epsilon, disable_relay,
                )

                if optional_latent is None:
                    latent = {
                        "samples": torch.zeros([1, 128, clean_latent_frames, latent_h // 32, latent_w // 32], device=_dev),
                        "noise_mask": torch.ones((1, 1, clean_latent_frames, latent_h // 32, latent_w // 32), dtype=torch.float32, device=_dev),
                    }
                else:
                    latent = optional_latent

                log.info(
                    "[LTXDirector] Ghost Mask: %d references; guide will hide them in a tail past "
                    "frame %d (clean_latent_frames=%d). Enable Clean Latent Slice (length=%d) downstream.",
                    n_refs, clean_latent_frames, clean_latent_frames, clean_latent_frames,
                )

            else:
                # OFF: plain clean latent + relay.
                if optional_latent is None:
                    samples = torch.zeros(
                        [1, 128, clean_latent_frames, latent_h // 32, latent_w // 32], device=_dev,
                    )
                    latent = {"samples": samples}
                    log.info(
                        "[PromptRelay] Auto-generated LTXV latent: %dx%d, %d pixel frames (%d latent frames)",
                        latent_w, latent_h, ltxv_length, clean_latent_frames,
                    )
                else:
                    latent = optional_latent

                patched, conditioning = _encode_relay(
                    model, clip, latent, global_prompt, local_prompts, segment_lengths, epsilon, disable_relay,
                )

        # --- Build Audio Output ---
        audio_out = _build_combined_audio(timeline_data, start_frame, ltxv_length, float(frame_rate), override_audio=override_audio)

        # --- Audio Latent Generation ---
        audio_latent = {}
        
        if audio_vae is not None:
            # Helper to generate empty latent
            def get_empty_latent():
                # Support both raw AudioVAE objects and ComfyUI VAE wrappers.
                inner = getattr(audio_vae, "first_stage_model", audio_vae)
                z_channels = audio_vae.latent_channels
                audio_freq = inner.latent_frequency_bins
                num_audio_latents = inner.num_of_latents_from_frames(ltxv_length, float(frame_rate))
                audio_latents = torch.zeros(
                    (1, z_channels, num_audio_latents, audio_freq),
                    device=comfy.model_management.intermediate_device(),
                )
                return {"samples": audio_latents, "type": "audio"}

            if use_custom_audio or override_audio or is_retake_active:
                try:
                    if audio_out is not None:
                        # 1. Encode audio waveform into latent space
                        waveform = audio_out["waveform"]
                        if waveform.ndim == 2:
                            waveform = waveform.unsqueeze(0)
                        if waveform.ndim != 3:
                            raise ValueError(
                                f"Expected custom audio waveform with 2 or 3 dims, got shape {tuple(waveform.shape)}"
                            )

                        # Wrapped ComfyUI VAE expects (batch, samples, channels);
                        # raw AudioVAE expects a dict with waveform in (batch, channels, samples).
                        if hasattr(audio_vae, "first_stage_model"):
                            latent_samples = audio_vae.encode(waveform.movedim(1, -1))
                        else:
                            latent_samples = audio_vae.encode({
                                "waveform": waveform,
                                "sample_rate": audio_out["sample_rate"],
                            })
                        
                        if latent_samples.numel() == 0:
                            raise ValueError("Encoded audio latent is empty (0 elements).")
                        
                        # 2. Create a 3D gap mask [B, F, H] to avoid accidental broadcasting to the 5D video latent 
                        # which also has 128 channels. A 4D audio mask [1, 128, F, H] confuses ComfyUI's KSampler 
                        # into masking the video latent as well, causing black frames.
                        B, C, F_len, H_len = latent_samples.shape
                        
                        if is_retake_active:
                            gap_mask = torch.zeros((B, F_len, H_len), dtype=torch.float32, device=latent_samples.device)
                            
                            retake_start = float(tdata.get("retakeStart", 0))
                            retake_len = float(tdata.get("retakeLength", 0))
                            
                            overlap_start = max(start_frame, retake_start)
                            overlap_end = min(start_frame + ltxv_length, retake_start + retake_len)
                            
                            if overlap_end > overlap_start:
                                rel_start = overlap_start - start_frame
                                rel_len = overlap_end - overlap_start
                                
                                start_sec = rel_start / float(frame_rate)
                                len_sec = rel_len / float(frame_rate)
                                total_sec = ltxv_length / float(frame_rate)
                                
                                start_idx = int((start_sec / total_sec) * F_len)
                                end_idx = int(((start_sec + len_sec) / total_sec) * F_len)
                                
                                start_idx = max(0, min(F_len, start_idx))
                                end_idx = max(0, min(F_len, end_idx))
                                
                                gap_mask[:, start_idx:end_idx, :] = 1.0
                        else:
                            gap_mask = torch.ones((B, F_len, H_len), dtype=torch.float32, device=latent_samples.device)
                            
                            audio_segs_key = "motionSegments" if override_audio else "audioSegments"
                            file_key = "videoFile" if override_audio else "audioFile"
                            for seg in tdata.get(audio_segs_key, []):
                                if not seg.get(file_key):
                                    continue
                                
                                seg_start = float(seg.get("start", 0))
                                seg_len = float(seg.get("length", 1))
                                
                                if seg_start + seg_len <= start_frame or seg_start >= start_frame + ltxv_length:
                                    continue
                                    
                                offset = max(0, start_frame - seg_start)
                                seg_len = max(1.0, seg_len - offset)
                                seg_start = max(0, seg_start - start_frame)

                                start_sec = seg_start / float(frame_rate)
                                len_sec = seg_len / float(frame_rate)
                                total_sec = ltxv_length / float(frame_rate)

                                start_idx = int((start_sec / total_sec) * F_len)
                                end_idx = int(((start_sec + len_sec) / total_sec) * F_len)
                                gap_mask[:, start_idx:end_idx, :] = 0.0
                                
                        if inpaint_audio:
                            # Generate new audio in the gaps, preserve custom audio segments
                            mask = gap_mask
                        else:
                            # Preserve the entire audio latent (no generation). 
                            # We use a 3D zeros mask to prevent video blackouts.
                            mask = torch.zeros((B, F_len, H_len), dtype=torch.float32, device=latent_samples.device)
                        
                        audio_latent = {
                            "samples": latent_samples,
                            "type": "audio",
                            "noise_mask": mask
                        }
                        log.info("[PromptRelay] Generated custom audio latent with dynamic noise mask.")
                    else:
                        raise ValueError("No audio waveform to encode.")
                except Exception as e:
                    log.error("[PromptRelay] Failed to generate custom audio latent: %s", e)
                    raise e
            else:
                # Generate empty latent
                try:
                    audio_latent = get_empty_latent()
                    log.info("[PromptRelay] Auto-generated empty audio latent.")
                except Exception as e:
                    log.error("[PromptRelay] Could not generate empty audio latent: %s", e)
                    raise e

        # --- Motion guide output from timeline video segments ---
        motion_guide_data = {"segments": [], "frame_rate": float(frame_rate), "duration_frames": int(duration_frames), "resize_method": resize_method}
        try:
            tdata = json.loads(timeline_data) if timeline_data else {}
            if use_custom_motion:
                motion_segments = tdata.get("motionSegments", [])
            else:
                motion_segments = []
            for seg in motion_segments:
                seg_start = int(seg.get("start", 0))
                length = int(seg.get("length", 1))
                if seg_start >= start_frame + duration_frames or seg_start + length <= start_frame:
                    continue
                if not seg.get("videoFile"):
                    continue
                    
                offset = max(0, start_frame - seg_start)
                new_start = max(0, seg_start - start_frame)
                
                # Trim length so it doesn't extend beyond duration_frames
                clipped_len = min(length - offset, duration_frames - new_start)
                if clipped_len <= 0:
                    continue
                    
                clean = dict(seg)
                clean["start"] = new_start
                clean["length"] = clipped_len
                clean["trimStart"] = float(seg.get("trimStart", 0)) + offset
                motion_guide_data["segments"].append(clean)
        except Exception as e:
            log.warning("[LTXDirector] Could not build motion_guide_data: %s", e)

        # Inject raw timeline details for downstream masking in Retake Mode
        guide_data["timeline_data"] = timeline_data
        guide_data["start_frame"] = start_frame
        guide_data["duration_frames"] = duration_frames
        guide_data["resize_method"] = resize_method

        _outs = [patched, conditioning, conditioning_neg, latent, audio_latent,
                 guide_data, motion_guide_data, float(frame_rate), audio_out]
        if REFERENCE_FEATURES:
            _outs += [int(clean_latent_frames), int(clean_pixel_frames)]
        return io.NodeOutput(*_outs)


NODE_CLASS_MAPPINGS = {
    "LTXDirectorTJ25": LTXDirector,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "PromptRelayEncodeTimeline": "Prompt Relay Encode (Timeline)",
}
# SPDX-License-Identifier: GPL-3.0-only
# Derived from LTX-2.5-Director by CGlide (https://github.com/CGlide/LTX-2.5-Director, GPL-3.0),
# itself a fork of WhatDreamsCost's LTX Director (https://github.com/WhatDreamsCost/WhatDreamsCost-ComfyUI, GPL-3.0).
# Modified for TJ NODE STUDIO ONE: node keys CS25 -> TJ25, routes /ltx_director* -> /ltx25_one/director/*, upload folder renamed.
# GPL-3.0 only: do NOT copy this file into the web project (see PORT_LEDGER).
"""
ltx_chunk_audio.py — audio handling for LTX Director CS chunked renders.

Standalone on purpose: no ComfyUI imports, no torch requirement at import time.
Everything here works on plain numpy arrays shaped (channels, samples), float32,
nominally in [-1, 1].

Two jobs:

  1. save_chunk_audio()  — write one chunk's pass-1 audio to <chunk>.wav
  2. join_run_audio()    — concatenate the chunk wavs, crossfading across the
                           same overlap the picture dissolve uses

Sample-drift is the thing that bites: each chunk's audio must land at exactly
window_frames / fps seconds or the error compounds and the sound walks off the
picture by chunk 4. Every fit is logged with expected vs actual.
"""

import math
import os
import struct
import sys
import wave

import numpy as np

LOG_PREFIX = "[LTXChunkAudio]"

# WAVE format tags
_WAVE_FORMAT_PCM = 1
_WAVE_FORMAT_IEEE_FLOAT = 3
_WAVE_FORMAT_EXTENSIBLE = 0xFFFE


def _log(msg):
    print(f"{LOG_PREFIX} {msg}", flush=True)


# ---------------------------------------------------------------------------
# WAV I/O (float32, written by hand — the stdlib wave module is PCM-only)
# ---------------------------------------------------------------------------

def write_wav_float32(path, data, sample_rate):
    """Write (channels, samples) float32 as a 32-bit IEEE float WAV.

    Float rather than PCM16 because these are intermediates that get read back,
    crossfaded and re-written; quantising at every hop is pointless loss.
    """
    data = np.asarray(data, dtype=np.float32)
    if data.ndim == 1:
        data = data[None, :]
    channels, n_samples = data.shape

    # interleave
    interleaved = data.T.reshape(-1).astype("<f4", copy=False)
    payload = interleaved.tobytes()

    bits = 32
    block_align = channels * bits // 8
    byte_rate = sample_rate * block_align

    fmt_chunk = struct.pack(
        "<HHIIHH",
        _WAVE_FORMAT_IEEE_FLOAT,
        channels,
        int(sample_rate),
        byte_rate,
        block_align,
        bits,
    )

    os.makedirs(os.path.dirname(os.path.abspath(path)) or ".", exist_ok=True)
    with open(path, "wb") as fh:
        fh.write(b"RIFF")
        fh.write(struct.pack("<I", 4 + (8 + len(fmt_chunk)) + (8 + len(payload))))
        fh.write(b"WAVE")
        fh.write(b"fmt ")
        fh.write(struct.pack("<I", len(fmt_chunk)))
        fh.write(fmt_chunk)
        fh.write(b"data")
        fh.write(struct.pack("<I", len(payload)))
        fh.write(payload)

    return path


def read_wav(path):
    """Read a WAV into ((channels, samples) float32, sample_rate).

    Handles the float32 files we write plus PCM 8/16/24/32 in case something
    upstream hands us one.
    """
    with open(path, "rb") as fh:
        raw = fh.read()

    if raw[:4] != b"RIFF" or raw[8:12] != b"WAVE":
        raise ValueError(f"not a RIFF/WAVE file: {path}")

    pos = 12
    fmt = None
    data = None
    while pos + 8 <= len(raw):
        cid = raw[pos:pos + 4]
        csize = struct.unpack("<I", raw[pos + 4:pos + 8])[0]
        body = raw[pos + 8:pos + 8 + csize]
        if cid == b"fmt ":
            fmt = body
        elif cid == b"data":
            data = body
        pos += 8 + csize + (csize & 1)  # chunks are word-aligned

    if fmt is None or data is None:
        raise ValueError(f"missing fmt or data chunk: {path}")

    tag, channels, sample_rate, _byte_rate, _align, bits = struct.unpack("<HHIIHH", fmt[:16])
    if tag == _WAVE_FORMAT_EXTENSIBLE and len(fmt) >= 40:
        tag = struct.unpack("<H", fmt[24:26])[0]

    if tag == _WAVE_FORMAT_IEEE_FLOAT and bits == 32:
        arr = np.frombuffer(data, dtype="<f4")
    elif tag == _WAVE_FORMAT_IEEE_FLOAT and bits == 64:
        arr = np.frombuffer(data, dtype="<f8").astype(np.float32)
    elif tag == _WAVE_FORMAT_PCM and bits == 16:
        arr = np.frombuffer(data, dtype="<i2").astype(np.float32) / 32768.0
    elif tag == _WAVE_FORMAT_PCM and bits == 32:
        arr = np.frombuffer(data, dtype="<i4").astype(np.float32) / 2147483648.0
    elif tag == _WAVE_FORMAT_PCM and bits == 8:
        arr = (np.frombuffer(data, dtype=np.uint8).astype(np.float32) - 128.0) / 128.0
    elif tag == _WAVE_FORMAT_PCM and bits == 24:
        b = np.frombuffer(data, dtype=np.uint8).reshape(-1, 3).astype(np.int32)
        packed = (b[:, 0] | (b[:, 1] << 8) | (b[:, 2] << 16))
        packed = np.where(packed & 0x800000, packed - 0x1000000, packed)
        arr = packed.astype(np.float32) / 8388608.0
    else:
        raise ValueError(f"unsupported WAV format tag={tag} bits={bits}: {path}")

    usable = (arr.size // channels) * channels
    arr = arr[:usable].reshape(-1, channels).T.copy()
    return arr.astype(np.float32, copy=False), int(sample_rate)


# ---------------------------------------------------------------------------
# ComfyUI AUDIO -> disk
# ---------------------------------------------------------------------------

def audio_dict_to_numpy(audio):
    """ComfyUI AUDIO is {"waveform": tensor [B, C, N], "sample_rate": int}.

    Returns ((channels, samples) float32, sample_rate). Batch 0 only — the
    chunked path never batches.
    """
    if audio is None:
        return None, None
    waveform = audio.get("waveform")
    sample_rate = int(audio.get("sample_rate") or 0)
    if waveform is None or not sample_rate:
        return None, None

    if hasattr(waveform, "detach"):  # torch tensor
        waveform = waveform.detach().cpu().float().numpy()
    arr = np.asarray(waveform, dtype=np.float32)

    if arr.ndim == 3:
        arr = arr[0]
    elif arr.ndim == 1:
        arr = arr[None, :]
    return arr, sample_rate


def expected_samples(window_frames, fps, sample_rate):
    """Samples a chunk *should* contain for its render window."""
    return int(round(float(window_frames) / float(fps) * float(sample_rate)))


def fit_to_window(arr, window_frames, fps, sample_rate, label="chunk", warn_ratio=0.02):
    """Trim or pad so the chunk is exactly window_frames long.

    Logs expected vs actual every time. Anything past warn_ratio is shouted
    about — that is the drift that walks the audio off the picture.
    """
    want = expected_samples(window_frames, fps, sample_rate)
    have = int(arr.shape[1])
    delta = have - want

    if have == 0:
        _log(f"{label}: no audio, substituting {want} samples of silence")
        return np.zeros((max(1, arr.shape[0]), want), dtype=np.float32)

    ratio = abs(delta) / max(1, want)
    msg = (f"{label}: window={window_frames}f @ {fps}fps -> expected {want} samples, "
           f"got {have} ({delta:+d})")
    if ratio > warn_ratio:
        _log(f"WARNING {msg} — {ratio * 100:.2f}% off, check the audio decode")
    else:
        _log(msg)

    if delta > 0:
        return arr[:, :want].copy()
    if delta < 0:
        pad = np.zeros((arr.shape[0], -delta), dtype=np.float32)
        return np.concatenate([arr, pad], axis=1)
    return arr


def save_chunk_audio(audio, path, window_frames=None, fps=None, label=None):
    """Write one chunk's AUDIO to a float32 WAV, fitted to its window.

    Returns (path, sample_rate) or (None, None) if there was no audio.
    """
    arr, sample_rate = audio_dict_to_numpy(audio)
    if arr is None:
        _log(f"no audio input, skipping {os.path.basename(path)}")
        return None, None

    if window_frames and fps:
        arr = fit_to_window(arr, window_frames, fps, sample_rate,
                            label=label or os.path.basename(path))

    write_wav_float32(path, arr, sample_rate)
    _log(f"wrote {os.path.basename(path)} — {arr.shape[0]}ch, "
         f"{arr.shape[1]} samples @ {sample_rate}Hz")
    return path, sample_rate


# ---------------------------------------------------------------------------
# Crossfade
# ---------------------------------------------------------------------------

def _correlation(a, b):
    """Normalised correlation of two overlap regions, mono-summed."""
    x = a.mean(axis=0).astype(np.float64)
    y = b.mean(axis=0).astype(np.float64)
    n = min(x.size, y.size)
    if n == 0:
        return 0.0
    x, y = x[:n], y[:n]
    x = x - x.mean()
    y = y - y.mean()
    denom = math.sqrt(float((x * x).sum()) * float((y * y).sum()))
    if denom <= 1e-12:
        return 0.0
    return float((x * y).sum() / denom)


# Correlation bands used by "auto".
#   >= CORR_IDENTICAL  same material (inpainted song, custom track) -> linear
#   <= CORR_UNRELATED  independent generated sound                  -> equal_power
#   in between         similar but not phase aligned                -> short splice
CORR_IDENTICAL = 0.70
CORR_UNRELATED = 0.15
SHORT_FADE_MS = 15.0


def resolve_mode(mode, correlation):
    """Pick a crossfade behaviour from the measured overlap correlation."""
    if mode != "auto":
        return mode
    c = 0.0 if correlation is None else correlation
    if c >= CORR_IDENTICAL:
        return "linear"
    if c <= CORR_UNRELATED:
        return "equal_power"
    # The awkward middle: the two chunks rendered the same music slightly
    # differently. A long blend of near-but-not-quite material combs, and no
    # curve fixes that - only a short fade does.
    return "short"


def crossfade_curves(n, mode="auto", correlation=None, corr_threshold=0.7):
    """Return (fade_out, fade_in, resolved_name) of length n.

    linear      — correct when the two sides carry the SAME content. Identical
                  material passes through untouched.
    equal_power — correct when they are uncorrelated. On identical material it
                  produces a +3dB bump in the middle of the fade.

    "short" and "off" are handled by the caller, which decides how much of the
    overlap to fade over; the curve itself is still linear.
    """
    if n <= 0:
        empty = np.zeros(0, dtype=np.float32)
        return empty, empty, "none"

    t = np.linspace(0.0, 1.0, n, endpoint=False, dtype=np.float64)

    resolved = resolve_mode(mode, correlation)
    if resolved in ("short", "off"):
        resolved = "linear"

    if resolved == "linear":
        fade_out = 1.0 - t
        fade_in = t
    elif resolved == "equal_power":
        fade_out = np.cos(t * math.pi / 2.0)
        fade_in = np.sin(t * math.pi / 2.0)
    else:
        raise ValueError(f"unknown crossfade mode: {mode}")

    return fade_out.astype(np.float32), fade_in.astype(np.float32), resolved


def crossfade(tail, head, mode="auto", corr_threshold=0.7):
    """Blend two equal-length (channels, n) regions. Returns (blended, resolved)."""
    n = min(tail.shape[1], head.shape[1])
    if n == 0:
        return tail[:, :0].copy(), "none"
    tail = tail[:, :n]
    head = head[:, :n]

    corr = _correlation(tail, head) if mode == "auto" else None
    resolved = resolve_mode(mode, corr)
    fade_out, fade_in, _ = crossfade_curves(n, mode=resolved, correlation=corr)
    return (tail * fade_out[None, :] + head * fade_in[None, :]).astype(np.float32), resolved


# ---------------------------------------------------------------------------
# Join
# ---------------------------------------------------------------------------

def _join_pair(out, arr, overlap_samples, mode, short_samples):
    """Splice `arr` onto `out`, consuming exactly `overlap_samples` either way.

    EVERY mode eats the whole overlap - that is what keeps the audio the same
    length as the picture. The mode only decides how much of it is faded:

      linear / equal_power  fade across the entire overlap
      short                 hold the earlier chunk, fade only the last ~15ms
      off                   hold the earlier chunk for the whole overlap, hard cut
    """
    n = min(overlap_samples, out.shape[1], arr.shape[1])
    if n <= 0:
        return np.concatenate([out, arr], axis=1), "concat"

    head = out[:, -n:]
    corr = _correlation(head, arr[:, :n]) if mode == "auto" else None
    resolved = resolve_mode(mode, corr)

    if resolved == "off":
        fade_n = 0
    elif resolved == "short":
        fade_n = int(min(n, max(1, short_samples)))
    else:
        fade_n = n
    keep_n = n - fade_n

    if corr is not None:
        _log(f"overlap correlation {corr:+.3f} -> {resolved}, "
             f"fading {fade_n} of {n} overlap samples")
    else:
        _log(f"{resolved}, fading {fade_n} of {n} overlap samples")

    pieces = [out[:, :-n], head[:, :keep_n]]
    if fade_n > 0:
        blended, _ = crossfade(head[:, keep_n:], arr[:, keep_n:n],
                               mode=("auto" if mode == "auto" else resolved))
        pieces.append(blended)
    pieces.append(arr[:, n:])
    return np.concatenate([p for p in pieces if p.shape[1] > 0], axis=1), resolved


def join_run_audio(chunks, overlap_frames, fps, out_path,
                   crossfade_mode="auto", corr_threshold=0.7):
    """Join chunk wavs into one continuous track.

    chunks: list of (wav_path_or_None, window_frames). A None path becomes
            silence of the right length, so one failed chunk does not desync
            everything after it.

    Geometry matches the picture and does NOT depend on crossfade_mode:
    total = sum(window_frames) - overlap_frames * (n - 1). Even "off" consumes
    the overlap - a hard cut that skipped it would leave the audio longer than
    the video by overlap x (chunks - 1).

    Returns (out_path, sample_rate, total_samples) or (None, None, 0).
    """
    if not chunks:
        _log("nothing to join")
        return None, None, 0

    # Establish sample rate and channel count from the first real file.
    sample_rate = None
    channels = 1
    for path, _ in chunks:
        if path and os.path.exists(path):
            probe, sample_rate = read_wav(path)
            channels = probe.shape[0]
            break
    if sample_rate is None:
        _log("no chunk audio found on disk, nothing to join")
        return None, None, 0

    overlap_samples = expected_samples(overlap_frames, fps, sample_rate)
    short_samples = int(round(SHORT_FADE_MS / 1000.0 * sample_rate))
    total_frames = sum(int(w) for _, w in chunks) - int(overlap_frames) * (len(chunks) - 1)
    _log(f"joining {len(chunks)} chunks, overlap {overlap_frames}f "
         f"({overlap_samples} samples), mode '{crossfade_mode}', "
         f"expecting {total_frames}f total")

    out = None
    for idx, (path, window_frames) in enumerate(chunks):
        if path and os.path.exists(path):
            arr, sr = read_wav(path)
            if sr != sample_rate:
                _log(f"WARNING chunk {idx}: sample rate {sr} != {sample_rate}, "
                     f"joining anyway — resample upstream")
            if arr.shape[0] != channels:
                arr = (np.repeat(arr, channels, axis=0) if arr.shape[0] == 1
                       else arr[:channels])
        else:
            _log(f"chunk {idx}: missing audio, substituting silence")
            arr = np.zeros((channels, 0), dtype=np.float32)

        arr = fit_to_window(arr, window_frames, fps, sample_rate, label=f"chunk {idx:03d}")

        if out is None:
            out = arr
            continue

        out, _ = _join_pair(out, arr, overlap_samples, crossfade_mode, short_samples)

    expected_total = expected_samples(total_frames, fps, sample_rate)
    drift = int(out.shape[1]) - expected_total
    if abs(drift) > max(2, expected_total // 1000):
        _log(f"WARNING total {out.shape[1]} samples vs expected {expected_total} ({drift:+d})")
    else:
        _log(f"total {out.shape[1]} samples vs expected {expected_total} ({drift:+d}) — ok")

    write_wav_float32(out_path, out, sample_rate)
    _log(f"wrote {out_path}")
    return out_path, sample_rate, int(out.shape[1])


def peak_normalise_if_clipping(path, ceiling=0.99):
    """Only touches the file if the join actually pushed something over 1.0.

    Crossfades can nudge correlated material above full scale. Silent no-op
    when it did not happen — no level changes behind your back.
    """
    arr, sample_rate = read_wav(path)
    peak = float(np.abs(arr).max()) if arr.size else 0.0
    if peak <= 1.0:
        _log(f"peak {peak:.3f} — no normalisation needed")
        return path, peak, False
    arr = arr * (ceiling / peak)
    write_wav_float32(path, arr, sample_rate)
    _log(f"peak was {peak:.3f}, scaled down to {ceiling:.2f}")
    return path, peak, True


if __name__ == "__main__":
    _log("this module is a library; run the test script instead")
    sys.exit(0)

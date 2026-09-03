"""Startup check for the custom-node packs the ONE STUDIO nodes depend on.

ComfyUI-Manager installs this package's Python requirements automatically, but it does
NOT install other custom-node packs when you install a node from the git / nightly path.
Those have to be pulled in by running `install_requirements.bat` / `.sh` once. People hit
this as "the node shows up but half its modes fail to load" with nothing telling them why.

This module prints one console banner at import time listing what is missing and how to
fix it. It only reads directory *names* under `custom_nodes/` - no file contents, no
writes, no network, no subprocess - and never raises into the import that calls it.
"""

import os

_HERE = os.path.dirname(os.path.abspath(__file__))
_CUSTOM_NODES = os.path.dirname(_HERE)

# display name -> (accepted folder names lowercased, what stops working without it)
# folder names cover both the GitHub repo name and the Comfy Registry id where they differ.
_CORE = [
    ("ComfyUI-Impact-Pack",           (("comfyui-impact-pack",),                                  "Z-Image Face Redraw")),
    ("ComfyUI-Impact-Subpack",        (("comfyui-impact-subpack",),                               "Z-Image Face Redraw")),
    ("ComfyUI-KJNodes",               (("comfyui-kjnodes",),                                      "Klein / Qwen 2511 (KV cache, ImagePad, FluxKontext)")),
    ("ComfyUI_FaceAnalysis",          (("comfyui_faceanalysis",),                                 "Klein / Qwen 2511 Faceswap")),
    ("ComfyUI-RMBG",                  (("comfyui-rmbg",),                                         "Z-Image RE-BG")),
    ("comfyui_controlnet_aux",        (("comfyui_controlnet_aux",),                               "Z-Image ControlNet")),
    ("ComfyUI-SeedVR2_VideoUpscaler", (("comfyui-seedvr2_videoupscaler", "seedvr2_videoupscaler"), "Upscale mode (every ONE STUDIO node)")),
    ("ComfyUI-VideoHelperSuite",      (("comfyui-videohelpersuite",),                             "MiniMax H3 reference-video inputs")),
    ("ComfyUI-TJ_NODE",               (("comfyui-tj_node", "comfyui-tj-node"),                    "LLM brief / vision, Free Text Encoder VRAM, RTX Deblur, H3 Audio Lock, One-Take")),
]

# only needed for specific optional modes - listed, not shouted about
_OPTIONAL = [
    ("ComfyUI-GGUF",                      ("comfyui-gguf",)),
    ("ComfyUI-MiniMax-H3-Turbo",          ("comfyui-minimax-h3-turbo",)),
    ("ComfyUI-SolAttn_triton",            ("comfyui-solattn_triton",)),
    ("ComfyUI-Spectrum-MiniMax-H3",       ("comfyui-spectrum-minimax-h3",)),
    ("ComfyUI-MiniMaxH3-Cache",           ("comfyui-minimaxh3-cache",)),
    ("ComfyUI-MiniMaxH3-FirstBlockCache", ("comfyui-minimaxh3-firstblockcache", "minimax-h3-firstblockcache")),
    ("ComfyUI-PlagueKind-Nodes",          ("comfyui-plaguekind-nodes",)),
    ("ComfyUI-sol-attn",                  ("comfyui-sol-attn",)),
    ("ComfyUI-VFI",                       ("comfyui-vfi", "rife_comfyui_wrapper")),
    ("Nvidia_RTX_Nodes_ComfyUI",          ("nvidia_rtx_nodes_comfyui", "comfyui_nvidia_rtx_nodes")),
    ("comfyui-krea2-controlnet",          ("comfyui-krea2-controlnet",)),
    ("comfyui-krea2edit",                 ("comfyui-krea2edit",)),
    ("ComfyUI-NK2E",                      ("comfyui-nk2e",)),
]

_LINE = "=" * 74


def _installed():
    try:
        return {d.lower() for d in os.listdir(_CUSTOM_NODES)
                if os.path.isdir(os.path.join(_CUSTOM_NODES, d))}
    except Exception:
        return None


def check_dependencies():
    installed = _installed()
    if installed is None:
        return

    core_missing = [(n, meta[1]) for (n, meta) in _CORE
                    if not any(x in installed for x in meta[0])]
    opt_missing = [n for (n, names) in _OPTIONAL
                   if not any(x in installed for x in names)]

    if not core_missing and not opt_missing:
        return

    lines = ["", _LINE, " TJ NODE STUDIO ONE - missing dependency node packs", _LINE]

    if core_missing:
        lines.append(" Required (some ONE STUDIO modes will fail to load):")
        for name, needed_for in core_missing:
            lines.append("   - %-32s %s" % (name, needed_for))
        lines.append("")

    if opt_missing:
        lines.append(" Optional (only for specific modes): "
                     + ", ".join(opt_missing))
        lines.append("")

    lines.append(" Fix - run this once from the package folder, then restart ComfyUI:")
    lines.append("   Windows:      install_requirements.bat")
    lines.append("   Mac / Linux:  bash install_requirements.sh")
    lines.append("")
    lines.append(" ComfyUI-Manager installs this pack's Python requirements but not other")
    lines.append(" node packs - the script above pulls those in.")
    lines.append(_LINE)
    lines.append("")

    text = "\n".join(lines)
    try:
        print(text)
    except Exception:
        # console in a codepage that can't encode something - fall back to ASCII
        print(text.encode("ascii", "replace").decode("ascii"))

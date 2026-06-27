# I Made a Single ComfyUI Node That Does Everything — T2I, I2I, Inpaint, Outpaint, Faceswap, Camera Angle, BG Removal, AND AI Upscale. No Wiring. Ever.

> **Free · Open Source · GitHub**  
> Four all-in-one nodes: **Z-Image Turbo** · **Flux.2 Klein 9B** · **Qwen Image Edit 2511** · **Krea 2**  
> Korean / English UI — switch language in Settings

---

## The Problem With ComfyUI Workflows

You download a workflow. It works — until you want to inpaint the result. So you load *another* workflow. Then you want to upscale that. *Another* workflow. Then redo the background. *Another* one.

You end up with 8 browser tabs, 6 workflow files, and you're manually copy-pasting filenames between them like it's 2019.

**This node fixes that.**

---

## What Is This

**TJ NODE STUDIO ONE** is a ComfyUI UI extension built around one idea: **you shouldn't need to be a node graph engineer just to generate and iterate on images.**

One node on the canvas. Every mode lives inside its panel. No wiring, no routing, no "wait which output goes into which input again."

```
T2I → I2I → INPAINT → OUTPAINT → EDIT → FACESWAP → ANGLE → UPSCALE
```

The entire pipeline — generation, editing, background removal, upscaling — in a single self-contained panel. Hit **Send to** on any result to pass it to the next mode instantly. That's it.

> **This node is about workflow convenience, not magic.**  
> It handles all the node wiring and parameter routing so you don't have to.

---

## Four Nodes, Four Powerhouse Models

### Z-Image ONE STUDIO (TJ)
> **Z-Image Turbo** — Alibaba's flow-matching model (fast, high quality)

| Mode | What it does |
|---|---|
| **T2I** | Text → image, LoRA stack (up to 3), resolution presets |
| **I2I** | Denoise-controlled image transformation |
| **INPAINT** | Draw mask directly in the node, regenerate region (DifferentialDiffusion) |
| **OUTPAINT** | Expand canvas in any direction (Up/Down/Left/Right px) |
| **RE-BG** | BiRefNet cuts the subject, you write a new background — no seams |
| **CONTROLNET** | Union ControlNet — Depth / Canny / Pose / etc in one model |
| **FACE REDRAW** | YOLO detects faces → crop → regenerate → seamlessly blend back |
| **UPSCALE** | SeedVR2 AI upscale (3B / 7B DiT model) |

### Flux.2 Klein ONE STUDIO (TJ)
> **FLUX.2 Klein 9B** (Black Forest Labs) — multi-reference editing beast

| Mode | What it does |
|---|---|
| **T2I** | Flux.2 Klein generation, LoRA stack |
| **I2I** | Image-to-image with Flux.2 |
| **EDIT** | Multi-reference editing — feed up to 5 reference images |
| **PAINT** | Inpaint + Outpaint in one mode |
| **FACESWAP** | Face transfer via BFS LoRA (Best Face Swap) |
| **UPSCALE** | SeedVR2 AI upscale (same models, shared) |

### Qwen Image Edit 2511 ONE STUDIO (TJ)
> **Qwen2.5-VL 7B** — image editing with multi-image context and camera angle control

| Mode | What it does |
|---|---|
| **T2I** | Text to image with Qwen2.5-VL architecture |
| **I2I** | Image transformation with denoise control |
| **EDIT** | Edit images with text + up to 3 reference images (FluxKontext workflow) |
| **PAINT** | Inpaint + Outpaint — mask editor + canvas expansion |
| **FACESWAP** | BFS LoRA face swap with auto prompt |
| **ANGLE** | Drag H/V/Z controls to rotate camera angle in 3D scene |
| **UPSCALE** | SeedVR2 AI upscale |

### Krea 2 ONE STUDIO (TJ)
> **Krea AI** generation model

| Mode | What it does |
|---|---|
| **T2I** | Text to image |
| **I2I** | Image-to-image transformation |
| **UPSCALE** | SeedVR2 AI upscale |

---

## Features That Actually Matter

**No wiring required** — the node builds the ComfyUI graph internally. Set parameters, click Generate, done.

**Send to** — one button passes your result to any other mode as source image. T2I → Inpaint → Upscale in 3 clicks.

**Language support** — switch between 한국어 and English in Settings. All UI text, help docs, and error messages update on reload.

**Gallery** — every generated image is saved and browsable inside the node. Star favorites, delete failures, send any past result to any mode.

**Compare slider** — drag to compare source vs result side by side.

**Scroll zoom** — mouse wheel to zoom into any result.

**Model Override Slots** — expose input slots to wire in Primitive nodes for model filenames. `.gguf` filenames auto-switch to GGUF loaders.

**LoRA stack** — up to 3 LoRAs per generation. Trigger word auto-detection from file metadata.

**Lightning LoRA** — 4-step fast generation LoRA support for Klein, QE2511, and Krea2. Auto-sets Steps=4, CFG=1.

**Camera Angle LoRA** — QE2511 ANGLE mode: configure once in Settings, applies automatically.

**Prompt Templates** — save and recall prompt presets per node.

**Settings persist** — model selection, prompt suffix, save folder, everything saves and survives restarts.

---

## SeedVR2 Upscale — Built In to All Nodes

All four nodes include a full **SeedVR2 AI upscale** mode sharing the same model folder.

- DiT model: 3B (FP16 / FP8) or 7B FP8
- Resolution up to 4096px
- Attention mode: sdpa / flash_attn_2 / flash_attn_3 / sageattn
- Color correction (LAB space)

---

## Bug Fixes (v1.2)

- **Outpaint color param crash** — `ImagePadKJ` color was sent as `[R,G,B]` array which ComfyUI interpreted as a node link → "Bad linked input" error. Fixed to `"R, G, B"` string format.
- **Klein outpaint generating new images** — `GetImageSize` was reading the unscaled padded image, causing `EmptyFlux2LatentImage` and `VAEEncode` dimensions to mismatch → model ignored reference conditioning and drew entirely new content. Fixed to read from `ImageScaleToTotalPixels` output.
- **Help overlay links** — URLs in all help docs are now clickable hyperlinks.
- **Language selector position** — Language selector now appears right after Refresh Models (consistent across all 4 nodes).

---

## Install

### 1. Install the node

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/designloves2/ComfyUI-TJ_NODE_STUDIO_ONE.git
```

Or search `ComfyUI-TJ_NODE_STUDIO_ONE` in **ComfyUI Manager**.

### 2. Install required custom nodes

**Windows — just double-click:**
```
install_requirements.bat
```

**Mac / Linux:**
```bash
chmod +x install_requirements.sh
./install_requirements.sh
```

This installs all 8 required nodes in one shot, skips anything already installed, and runs `pip install -r requirements.txt` for each. Restart ComfyUI when done.

---

**Or install manually via ComfyUI Manager:**

| Node | Required for |
|---|---|
| [ComfyUI-Impact-Pack](https://github.com/ltdrdata/ComfyUI-Impact-Pack) | Face Redraw mode (Z-Image) |
| [ComfyUI-Impact-Subpack](https://github.com/ltdrdata/ComfyUI-Impact-Subpack) | Required alongside Impact Pack |
| [ComfyUI-KJNodes](https://github.com/kijai/ComfyUI-KJNodes) | Klein KV Cache · ImagePadKJ · QE2511 FluxKontext nodes |
| [ComfyUI-SeedVR2](https://github.com/kijai/ComfyUI-SeedVR2) | UPSCALE mode (all nodes) |
| [ComfyUI_FaceAnalysis](https://github.com/cubiq/ComfyUI_FaceAnalysis) | Faceswap mode (Klein · QE2511) |
| [ComfyUI-RMBG](https://github.com/1038lab/ComfyUI-RMBG) | RE-BG mode (Z-Image) |
| [comfyui_controlnet_aux](https://github.com/Fannovel16/comfyui_controlnet_aux) | ControlNet preprocessors (Z-Image) |
| [ComfyUI-GGUF](https://github.com/city96/ComfyUI-GGUF) | GGUF quantized models (optional) |

### 3. Download models

**Z-Image Turbo:**
- Diffusion: [z_image_turbo_bf16.safetensors](https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/diffusion_models/z_image_turbo_bf16.safetensors) → `models/diffusion_models/`
- Text Encoder: [qwen_3_4b.safetensors](https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/text_encoders/qwen_3_4b.safetensors) → `models/text_encoders/`
- VAE: [ae.safetensors](https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/vae/ae.safetensors) → `models/vae/`

**Flux.2 Klein 9B:**
- Diffusion: [Black Forest Labs HF Collection](https://huggingface.co/collections/black-forest-labs/flux2) → `models/diffusion_models/`
- Text Encoder + VAE: [Comfy-Org 9B pack](https://huggingface.co/Comfy-Org/vae-text-encorder-for-flux-klein-9b/tree/main/split_files) → `models/text_encoders/` + `models/vae/`

**Qwen Image Edit 2511:**
- All model files: [Comfy-Org QE2511](https://huggingface.co/Comfy-Org/Qwen2.5-VL-7B-Image-Edit) → `models/diffusion_models/` + `models/text_encoders/` + `models/vae/`

**Krea 2:**
- All model files: [Comfy-Org Krea2](https://huggingface.co/Comfy-Org/Krea2) → `models/diffusion_models/` + `models/text_encoders/` + `models/vae/`

**SeedVR2 (UPSCALE mode — all nodes):**
- [kijai/SeedVR2-models](https://huggingface.co/kijai/SeedVR2-models/tree/main) → `models/SEEDVR2/`
- You need: DiT file (`seedvr2_ema_3b_fp16` or `_fp8` or `7b_fp8`) + `ema_vae_fp16.safetensors`

---

## The Other Half: TJ_NODE — Wireless Workflow Architecture Toolkit

> **[ComfyUI-TJ_NODE](https://github.com/designloves2/ComfyUI-TJ_NODE)** — the node package this studio was built to work with.

If TJ NODE STUDIO ONE is the cockpit, **TJ_NODE is the engine room.**

| Node | What it does |
|---|---|
| **Prompt Studio (TJ)** | Unified LLM prompt workflow — Auto / Enhancer / Image-to-Prompt modes |
| **Scene Maker (TJ)** | Visual Beat-based prompt architecture — KO/EN/JP/CN auto-translate |
| **Wireless Architecture** | Multi Router, Embedded Get/Set, Batch Workflow, Save Pipeline |

**→ [github.com/designloves2/ComfyUI-TJ_NODE](https://github.com/designloves2/ComfyUI-TJ_NODE)**

---

## FAQ

**Q: Which models does each node support?**  
A: Z-Image ONE → Z-Image Turbo. Klein ONE → Flux.2 Klein 9B/4B. QE2511 ONE → Qwen2.5-VL 7B Image Edit. Krea2 ONE → Krea AI model. Each node is architecture-specific.

**Q: Do I need all the custom nodes?**  
A: Only the ones for modes you use. SeedVR2 for upscale, FaceAnalysis for faceswap, RMBG for RE-BG, KJNodes for Klein/QE2511 outpaint. Core T2I/I2I works without most of them.

**Q: VRAM requirements?**  
A: Flux.2 Klein 9B ~18–24GB; use CPU offload for lower VRAM. Z-Image Turbo is lighter. QE2511 7B ~16–20GB. Krea2 varies by model. SeedVR2 3B FP8 ~12GB.

**Q: My results don't look great. Is something broken?**  
A: Probably not. Output quality is determined by the model, prompts, and LoRA choices — not the node. The node is just a UI shell.

**Q: Can I wire this into a normal ComfyUI workflow?**  
A: The node internally generates its own graph. You can connect `prompt_override` or model override input slots, but the node is self-contained by design.

**Q: Why is there no separate workflow file for each mode?**  
A: That's literally the whole point.

---

## GitHub

**TJ NODE STUDIO ONE (this):** https://github.com/designloves2/ComfyUI-TJ_NODE_STUDIO_ONE

**TJ NODE — Wireless Workflow Architecture Toolkit:** https://github.com/designloves2/ComfyUI-TJ_NODE

---

## Acknowledgements

The core idea and architecture of this node family originated from **[yanokusnir-ai](https://github.com/yanokusnir-ai)**'s open-source work:

> **[one-node-flux-2-klein](https://github.com/yanokusnir-ai/one-node-flux-2-klein)**  
> — The original single-node, all-in-one concept for Flux.2 Klein

TJ NODE STUDIO ONE (Z-Image · Klein · QE2511 · Krea2) grew out of that idea — expanding it to multiple models and modes.  
Deep thanks to the original author for the inspiration and for keeping it open source. 🙏

---

*MIT License. Free forever. PRs welcome.*

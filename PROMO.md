# Single ComfyUI Node That Does Everything — T2I, I2I, Inpaint, Outpaint, Faceswap, Camera Angle, BG Removal, AND AI Upscale. No Wiring. Ever.

> **Free · Open Source · GitHub**  
> Five all-in-one nodes: **Z-Image Turbo** · **Flux.2 Klein 9B** · **Qwen Image Edit 2511** · **Krea 2** · **SDXL** 🧪  
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

## Five Nodes, Five Models

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

### SDXL ONE STUDIO (TJ) 🧪
> **SDXL** — Checkpoint or Separate UNET loading, Refiner support, full mask editor  
> 🧪 **Test / Beta version** — core features work but options may change

| Mode | What it does |
|---|---|
| **T2I** | Text → image. CKPT mode (single .safetensors) or Separate mode (UNET + CLIP-L/G + VAE). Optional Refiner. |
| **I2I** | Image-to-image with denoise control |
| **INPAINT** | Full-screen popup mask editor — zoom 1x–32x, pan, brush/eraser, size slider. VAEEncodeForInpaint prevents bleed-through at any denoise level. |
| **OUTPAINT** | Expand canvas in any direction. Compare slider shows padded original vs. result. |
| **UPSCALE** | ESRGAN AI upscale → Refiner KSampler refinement pass |

> The Refiner Checkpoint is always configurable regardless of whether you're in CKPT or Separate model mode — no need to switch back to CKPT just to change the Refiner.

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

**In-node LLM Integration (v1.4+, requires TJ_NODE)** — the `🔍` prompt expand button grows three tabs:
- `✏️ Edit` — full-screen text editor (unchanged)
- `✨ Enhance` — send the current prompt to a local GGUF LLM to expand and refine it. Supports Model Format, Aesthetic, and Extra Instructions settings.
- `🖼 Image→Prompt` — drop an image or paste a URL to download it, run a vision LLM on it, and push the generated caption directly into the current mode's prompt field.

All LLM settings (model, GPU layers, temperature, etc.) are remembered in localStorage — no re-selecting every session. Images are auto-resized to ≤1MP before sending to avoid context overflow. A ring spinner overlay shows while the model is running. Install TJ_NODE via the in-panel button or: `git clone https://github.com/designloves2/ComfyUI-TJ_NODE`

**LLM models must be GGUF format.** Not all GGUF models are compatible — if one doesn't work, try a different one.

- **Enhance** (text LLM): [huihui-ai GGUF collection](https://huggingface.co/collections/noctrex/huihui-ai) — Qwen / Llama / Mistral variants
- **Image→Prompt** (vision LLM, VLM): **Qwen3-VL recommended** — [Qwen3-VL-8B-NSFW-Caption-V4.5 GGUF](https://huggingface.co/mradermacher/Qwen3-VL-8B-NSFW-Caption-V4.5-GGUF) · [huihui-ai collection](https://huggingface.co/collections/noctrex/huihui-ai). Requires both the model `.gguf` file and a matching mmproj file.

---

## SeedVR2 Upscale — Built In to All Nodes (except SDXL)

All nodes except SDXL include a full **SeedVR2 AI upscale** mode sharing the same model folder.  
SDXL ONE STUDIO uses ESRGAN + Refiner for upscaling instead.

- DiT model: 3B (FP16 / FP8) or 7B FP8
- Resolution up to 4096px
- Attention mode: sdpa / flash_attn_2 / flash_attn_3 / sageattn
- Color correction (LAB space)

---

## Recent Changes

### v1.5 (SDXL ONE STUDIO — Test Version) 🧪

- **SDXL ONE STUDIO** — new node added to the package. Supports SDXL Checkpoint and Separate UNET loading modes.
- **CKPT / Separate indicator** — top badge updates instantly when switching model loading mode.
- **Inpaint mask editor** — same full-screen popup editor as Z-Image: zoom 1x–32x, pan, brush/eraser, size slider. `VAEEncodeForInpaint` prevents pixel bleed-through at denoise=1.
- **Outpaint padded compare** — compare slider now shows the grey-padded original as the "before" side so the extension boundary is clearly visible.
- **Refiner always accessible** — Refiner Checkpoint selector stays visible in both CKPT and Separate modes; no need to switch modes to update the Refiner.
- **Prompt Template button (📋)** — added to prompt header, shares Klein's template database.
- **Send to Inpaint / Outpaint** (Klein · QE2511) — gallery and result strip now have separate → Inpaint and → Outpaint buttons; clicking switches the sub-mode and loads the image automatically.
- **Outpaint sub-mode switching** — `switchSubMode()` exposed on Klein/QE2511 inpaint handle so external send-to buttons can switch between inpaint and outpaint without user navigation.

### v1.4
- **In-node LLM integration** — ✨ Enhance and 🖼 Image→Prompt tabs in the prompt expand overlay. Requires [TJ_NODE](https://github.com/designloves2/ComfyUI-TJ_NODE); one-click install if not present.
- **Model Format / Aesthetic / Extra Instructions** fields in Enhance tab; **Custom Instruction** in Image→Prompt tab.
- **URL image download** — paste a URL, hit download, image is saved to `input/download/` and loaded for vision analysis.
- **1MP auto-resize** — images are scaled down to ≤1,000,000 pixels (JPEG 100%) before sending to the vision LLM, preventing context overflow errors.
- **Ring spinner overlay** — semi-transparent loading overlay with animated ring on the result panel while the LLM is running.
- **Settings auto-remembered** — all LLM settings persist in localStorage, shared across all 4 nodes.

### v1.4.1
- **LoRA trigger word reset bug fix** — `loraSelect` search filter was using the display value (`s.value`) instead of the internal `currentValue` to restore selection after filtering, causing the selected LoRA to visually reset to "none" during search and corrupting the trigger word state.
- **LoRA swap now clears and reloads trigger words** — switching to a different LoRA clears the previous trigger word and auto-fetches the new one. Re-selecting the same LoRA keeps the existing trigger word.
- **strength=0 no longer resets to 1** — fixed `parseFloat(v) || 1` (treats 0 as falsy) to `isNaN(v) ? 1 : v` across all 4 nodes.

### v1.3
- **Send to — Preview mode fix** — images generated in `outputMode: "preview"` now work correctly with Send to buttons (all 4 nodes).
- **Krea2 custom size / Steps / CFG crash** — `numberField()` argument order was wrong, causing "is not a function" errors. Fixed + range clamping added.
- **Outpaint auto system prompt** — Klein · QE2511 Outpaint mode now auto-injects a continuation prompt; users write only the scene description.
- **Panel layout fixed** — node panels no longer collapse when clicking textareas.

### v1.2
- **Outpaint color param crash** — `ImagePadKJ` color was sent as `[R,G,B]` array which ComfyUI interpreted as a node link → "Bad linked input" error. Fixed to `"R, G, B"` string format.
- **Klein outpaint generating new images** — `GetImageSize` was reading the unscaled padded image, causing dimension mismatch → model ignored reference conditioning. Fixed to read from `ImageScaleToTotalPixels` output.
- **Help overlay links** — URLs in all help docs are now clickable hyperlinks.
- **Language selector position** — consistent placement across all 4 nodes.

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
| [ComfyUI-SeedVR2](https://github.com/numz/ComfyUI-SeedVR2_VideoUpscaler) | UPSCALE mode (all nodes) |
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
- All model files: [Comfy-Org QE2511](https://huggingface.co/Comfy-Org/Qwen-Image-Edit_ComfyUI/tree/main/split_files) → `models/diffusion_models/` + `models/text_encoders/` + `models/vae/`

**Krea 2:**

- All model files: [Comfy-Org Krea2](https://huggingface.co/Comfy-Org/Krea2) → `models/diffusion_models/` + `models/text_encoders/` + `models/vae/`

**SDXL ONE STUDIO 🧪** *(CKPT mode — simplest)*:
- Checkpoint: any SDXL `.safetensors` → `models/checkpoints/`
- Refiner (optional): `sd_xl_refiner_1.0.safetensors` or similar → `models/checkpoints/`
- ESRGAN (Upscale mode): e.g. `4x-UltraSharp.pth` → `models/upscale_models/`

**SDXL ONE STUDIO 🧪** *(Separate mode — GGUF / FP8 lightweight)*:
- UNET: SDXL UNET file → `models/diffusion_models/`
- CLIP-L: `clip_l.safetensors` → `models/text_encoders/`
- CLIP-G: `clip_g.safetensors` → `models/text_encoders/`
- VAE: `sdxl_vae.safetensors` → `models/vae/`

**SeedVR2 (UPSCALE mode — Z-Image · Klein · QE2511 · Krea2):**
- [SeedVR2-models](https://huggingface.co/numz/SeedVR2_comfyUI/tree/main) → `models/SEEDVR2/`
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

## GitHub

**TJ NODE STUDIO ONE (this):** https://github.com/designloves2/ComfyUI-TJ_NODE_STUDIO_ONE

**TJ NODE — Wireless Workflow Architecture Toolkit:** https://github.com/designloves2/ComfyUI-TJ_NODE

---

## Acknowledgements

The core idea and architecture of this node family originated from **[yanokusnir-ai](https://github.com/yanokusnir-ai)**'s open-source work:

> **[one-node-flux-2-klein](https://github.com/yanokusnir-ai/one-node-flux-2-klein)**  
> — The original single-node, all-in-one concept for Flux.2 Klein

TJ NODE STUDIO ONE (Z-Image · Klein · QE2511 · Krea2 · SDXL) grew out of that idea — expanding it to multiple models and modes.  
Deep thanks to the original author for the inspiration and for keeping it open source. 🙏

---

*MIT License. Free forever. PRs welcome.*

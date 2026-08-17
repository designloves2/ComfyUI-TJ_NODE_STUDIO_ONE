# Anima ONE Studio — Model & Manual Reference

Research notes gathered by reading ComfyUI's official Anima workflow templates
directly (`comfyui_workflow_templates_json` pip package, 5 templates). This is
the manual/reference content to ship in-app before writing any Anima ONE
Studio code.

Source templates read:
- `image_anima_base_v1.json` — Text to Image (Anima Base v1.0)
- `image_anima_preview.json` — Text to Image (Anima Preview3)
- `image_anima_lllite_image_inpainting.json` — Inpainting
- `image_anima_lllite_any_control_to_image.json` — Any Control to Image
- `image_anima_lllite_depth_control_to_image.json` — Depth Control to Image

## What Anima is

Anima (circlestone-labs / Comfy Org, 2B params) is a **native** ComfyUI model
— architecture lives in `comfy/ldm/anima`, text encoder in
`comfy/text_encoders/anima.py`. Same tier as MiniMax H3: no custom node pack
required for the base pipeline. It's an anime/non-photorealistic
text-to-image model — official note: "poor realism (intentional), weak
high-res/text, plain style."

## The three variants — confirmed, not guesswork

| Variant | What it actually is | Steps/CFG default | Used in |
|---|---|---|---|
| **base 1.0** | `anima-base-v1.0.safetensors` — the full-quality diffusion checkpoint | 30 steps / CFG 4 | T2I, Inpainting, Any-Control, Depth-Control (all 4 official modes) |
| **turbo 1.0** | *Not a separate checkpoint.* It's a LoRA, `anima-turbo-lora-v0.2.safetensors`, applied on top of **base 1.0** via `LoraLoaderModelOnly`. A boolean switch (`turbo_mode`) reroutes steps 30→8 and CFG 4→1 when enabled. | 8 steps / CFG 1 | Optional toggle in every template |
| **preview3-base** | `anima-preview3-base.safetensors` — a separate, earlier/experimental checkpoint. Official description: "Preview version trained on anime; final version to improve details." | Same sampler defaults as base | T2I only (`image_anima_preview.json`), standalone template, no control modes |

So: **base and turbo are the same checkpoint** — turbo is base+LoRA+fewer
steps. Preview3 is a genuinely different, older checkpoint offered as its own
T2I template.

## Required model files

| File | Purpose | Directory | Source |
|---|---|---|---|
| `qwen_3_06b_base.safetensors` | Text encoder (all modes) | `models/text_encoders/` | `circlestone-labs/Anima` |
| `qwen_image_vae.safetensors` | VAE (all modes) | `models/vae/` | `circlestone-labs/Anima` |
| `anima-base-v1.0.safetensors` | Base diffusion checkpoint | `models/diffusion_models/` | `circlestone-labs/Anima` |
| `anima-preview3-base.safetensors` | Preview diffusion checkpoint (T2I-only alt) | `models/diffusion_models/` | `circlestone-labs/Anima` |
| `anima-turbo-lora-v0.2.safetensors` | Turbo LoRA (optional, all modes) | `models/loras/` | `circlestone-labs/Anima-Official-LoRAs` |
| `anima-lllite-inpainting-v2.safetensors` | LLLite control patch — Inpainting mode | `models/model_patches/` | `Comfy-Org/Anima-LLLite` |
| `anima-lllite-any-test-like-v2.safetensors` | LLLite control patch — Any Control to Image mode | `models/model_patches/` | `Comfy-Org/Anima-LLLite` |
| `anima-lllite-depth-1.safetensors` | LLLite control patch — Depth Control to Image mode | `models/model_patches/` | `Comfy-Org/Anima-LLLite` |
| `depth_anything_3_mono_large.safetensors` | Depth-map extraction for Depth-Control mode only (`DA3Inference`/`LoadDA3Model`) | `models/geometry_estimation/` | `Comfy-Org/Depth-Anything-3` |

All HF download URLs are in the templates; full URLs can be pulled again
if needed when writing the in-app manual panel.

## Control mechanism — confirmed

The three non-T2I modes are **not standard ControlNet**. They use ComfyUI's
native `ModelPatchLoader` → `AnimaLLLiteApply` pair: a LLLite-style model
patch loaded as a `MODEL_PATCH` and applied directly onto the diffusion
`MODEL`, parameterized by `image`, `mask` (inpainting/any-control), `strength`,
`start_percent`, `end_percent`. This confirms the LLLite/ControlLoRA
hypothesis from earlier recon — it is lighter-weight than a full ControlNet
graph (no separate ControlNet conditioning node chain).

- **Inpainting**: image + mask → `AnimaLLLiteApply` (mask = painted region)
- **Any Control to Image**: image (as edge/reference-like guide) + optional mask → same apply node, different patch file
- **Depth Control to Image**: input image → `DA3Inference` (Depth-Anything-3) generates a depth map first → depth map feeds `AnimaLLLiteApply`

## Per-mode graph skeleton (common to all 4)

```
CLIPLoader(qwen_3_06b_base) ──┬─→ CLIPTextEncode(positive)
                               └─→ CLIPTextEncode(negative)
VAELoader(qwen_image_vae) ────────────────────────────┐
UNETLoader(anima-base-v1.0 or preview3-base)           │
   └─(optional)→ LoraLoaderModelOnly(turbo-lora) ─┐    │
        [ComfySwitchNode: turbo_mode bool] ───────┴─→ MODEL
   [non-T2I only] ModelPatchLoader(lllite-*) → AnimaLLLiteApply(MODEL, image, mask, strength, start%, end%)
EmptyLatentImage(width, height) ──────────────────────┐
KSampler(MODEL, positive, negative, latent, seed,      │
         steps[switched 30/8], cfg[switched 4/1]) ←────┘
   → VAEDecode(latent, vae) → SaveImage
```

Default resolution: 1024×1024 (1MP), selected via `ResolutionSelector` node
(T2I template) offering standard aspect presets.

## Manual/help text to surface in-app (draft)

> **Anima** is ComfyUI's native anime/illustration text-to-image model (2B
> params, non-photorealistic by design). Two usable base checkpoints —
> **Base 1.0** (highest quality, 30 steps) and **Preview3** (earlier
> checkpoint, T2I only). Optionally apply the **Turbo LoRA** on top of Base
> 1.0 to cut sampling to 8 steps / CFG 1. Three additional modes — Inpainting,
> Any Control to Image, and Depth Control to Image — use lightweight LLLite
> model patches (not full ControlNet) to guide generation from an image/mask.
> All required files are open-weight and listed below with direct download
> links.

## Next step

Implementation of the 4 UI modes (T2I / Inpainting / Any Control to Image /
Depth Control to Image) following the established `core_*` / `api_*` /
`graph_builder_*` / `ui_*` / `one_node_*` pattern, with this manual content
surfaced in the tool's settings/help panel. Not started — awaiting go-ahead.

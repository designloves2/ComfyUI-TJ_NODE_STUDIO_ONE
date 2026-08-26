# Civitai 등록 문구 — MiniMax H3 ONE STUDIO

붙여넣기용 원고입니다. 섹션 제목 = Civitai 입력란.

---

## Title

```
MiniMax H3 ONE STUDIO — All-in-One Video+Audio Node (Clip Relay, Live Preview)
```

짧은 안:

```
MiniMax H3 ONE STUDIO — one node, long video with sound
```

---

## Short description

```
One node. Text, first/last frame, or reference — MiniMax H3 video with synced audio, rendered as chained clips and stitched automatically. Live preview while it samples.
```

---

## Description

### MiniMax H3, wired for you.

MiniMax H3 makes video **and** audio at once — but a working graph needs two different UNETs, a text encoder, two VAEs, a sigma-shift node, an advanced sampler, and a video muxer. Then you find out a single pass can't be long enough, so you start chaining clips by hand.

**This is that whole graph, collapsed into one node.**

Drop it on the canvas, point Settings at your models once, type a prompt, press Generate.

---

### What you get

| | |
|---|---|
| 🎬 **Three modes in one node** | **Text only** · **First/Last Frame** · **Reference** (up to 9 images + 3 videos + 3 audio, with in/out points) |
| 🔗 **Clip relay** | MiniMax H3 only accepts frame counts on a 17k+5 grid and one pass is VRAM-limited. Write more prompts, get more clips — each saved on its own, then stitched into one file |
| 🎞️ **Continuity that actually continues** | *Last Frame Chain* hands the previous clip's final frame over as the next clip's real first frame. Measured across the cut: **3.48** mean pixel delta, against **45.43** for unrelated frames |
| 👀 **Live preview** | Decoded frames stream into the node while it samples. You watch the shot form — not a spinner |
| 🖼️ **Gallery** | Every clip and stitched file in one place, each card keeping **the prompt it was rendered from** — one click to reuse or copy. Fullscreen player with Space / ← → / `[` `]` / Esc |
| ✍️ **Prompt workshop** | Split a long brief into per-shot clips; the shared style preamble and sound tail are lifted into a common header/footer so **every** clip carries them. Optional Ollama LLM expansion, with the result shown for review before it lands |
| ⚡ **Acceleration** | SolAttn · Spectrum · Turbo LoRA (FL2VA) · H3 Cache · SageAttention — all selectable inline, all degrading gracefully when the pack isn't installed |
| 🛡️ **Guards, not crashes** | A mode whose UNET isn't set can't be entered, and the top bar says what's missing. VRAM is freed when the run ends |

---

### Continuity, in one table

| Option | What happens to clip 2 and onward |
|---|---|
| **Last Frame Chain** | Starts from the previous clip's final frame. Only FL2VA takes a first frame, so a continued clip renders on FL2VA whatever the run started as |
| **Reference** *(Reference mode only)* | Keeps rendering on Ref2VA with the same reference images — the look holds, the cut doesn't join |
| **None** | Nothing handed across; the run stays on its own model |

Across all three, the **common part of your prompt reaches every clip** — that's what keeps a long piece looking like one piece.

---

### Install

**1 — The node**

ComfyUI Manager → Install Custom Nodes → search **`TJ_NODE_STUDIO_ONE`**

or

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/designloves2/ComfyUI-TJ_NODE_STUDIO_ONE.git
```

**2 — Dependencies (one script, included in the package)**

```
install_requirements.bat      ← Windows, double-click
./install_requirements.sh     ← Mac / Linux
```

Every MiniMax pack is **optional** — a missing one only switches its own feature off:

| Pack | Gives you |
|---|---|
| [ComfyUI-KJNodes](https://github.com/kijai/ComfyUI-KJNodes) | live preview |
| [ComfyUI-SolAttn_triton](https://github.com/kijai/ComfyUI-SolAttn_triton) | SolAttn (the default accel) |
| [ComfyUI-Spectrum-MiniMax-H3](https://github.com/xmarre/ComfyUI-Spectrum-MiniMax-H3) | Spectrum accel |
| [ComfyUI-MiniMaxH3-Cache](https://github.com/lihaoyun6/ComfyUI-MiniMaxH3-Cache) | step-reuse cache |
| [ComfyUI-MiniMaxH3-FirstBlockCache](https://github.com/duckyshell/ComfyUI-MiniMaxH3-FirstBlockCache) | step-reuse cache (alt) |
| [ComfyUI-PlagueKind-Nodes](https://github.com/PlagueKind/ComfyUI-PlagueKind-Nodes) | H3 SLA Attention (block-sparse) |
| [ComfyUI-sol-attn](https://github.com/Saganaki22/ComfyUI-sol-attn) | H3 Sol attention + Fused Modulation |
| [ComfyUI-MiniMax-H3-Turbo](https://github.com/Larryvrh/ComfyUI-MiniMax-H3-Turbo) | 4-step turbo (FL2VA only) |
| [ComfyUI-VideoHelperSuite](https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite) | reference **video** inputs |
| [Nvidia RTX Nodes](https://github.com/Comfy-Org/Nvidia_RTX_Nodes_ComfyUI) | RTX Video Super Resolution |

```bash
pip install imageio-ffmpeg   # clip stitching needs ffmpeg
```

**3 — Models** — all from [Comfy-Org/MiniMax-H3](https://huggingface.co/Comfy-Org/MiniMax-H3)

| → folder | file | note |
|---|---|---|
| `models/diffusion_models/` | `minimax_h3_fl2va_*` | Text only · First/Last · every chained clip |
| `models/diffusion_models/` | `minimax_h3_ref2va_*` | Reference mode |
| `models/text_encoders/` | `qwen3vl_*_minimax_h3_*` | loaded as `type=minimax` |
| `models/vae/` | `minimax_h3_video_vae_*` | video VAE |
| `models/vae/` | `minimax_h3_audio_vae_*` | audio VAE — **must** be the MiniMax one |
| `models/loras/` | `minimax_h3*turbo*` | optional, FL2VA only |

**4 — Restart ComfyUI**, open the node's ⚙ Settings, point each slot at your files, press 💾 Save All. Done once, not per workflow.

Model licensing follows the upstream Comfy-Org / MiniMax repository — check there before commercial use.

---

### Using this workflow

1. Load the `.json`
2. ⚙ Settings → pick your models → 💾 Save All
3. Pick a mode at the top of the node
4. Type a prompt. **One prompt = one clip.** Add prompts (or press ✂ Split into clips on a long brief) to make it longer
5. Set **Continuity → Last Frame Chain** if you want the clips to join
6. ▶ Generate

> Node settings are saved **inside the workflow** as of v1.10.0 — this file opens the same way on someone else's machine.

---

### 🎁 And five more nodes come with it

Installing this gives you the whole **ONE STUDIO** family — the same one-node, no-wiring idea applied to images:

| Node | Model | Modes |
|---|---|---|
| **Z-Image ONE STUDIO** | Z-Image Turbo | T2I · I2I · Inpaint · Outpaint · ControlNet · Face Redraw · RE-BG · Upscale |
| **Flux.2 Klein ONE STUDIO** | FLUX.2 Klein 9B / 4B | T2I · I2I · Edit · Paint · Faceswap · Upscale |
| **Qwen Image Edit 2511 ONE STUDIO** | Qwen Image Edit 2511 | T2I · I2I · Edit · Inpaint · Angle · Faceswap · Upscale |
| **Krea 2 ONE STUDIO** | Krea 2 | T2I · I2I · IDENTITY 🧪 · ControlNet 🧪 · Upscale |
| **SDXL ONE STUDIO** 🧪 | SDXL | T2I · I2I · Inpaint · Outpaint · Upscale |

Same Settings panel, same gallery, same LoRA workflow, Korean / English UI. One install, six nodes.

📦 **GitHub:** https://github.com/designloves2/ComfyUI-TJ_NODE_STUDIO_ONE

---

### Notes

- 🧪 The video node is **experimental**. Long pieces are assembled from chained clips, so they are not seamless.
- Generation time scales with clip count. The node measures your actual clip times and corrects its own ETA.
- Korean / English UI — switch in Settings.

---

## Version name

```
v1.10.0
```

## Version description

```
Continuity now genuinely continues: a chained clip renders on FL2VA with the previous clip's final frame as its real first frame (measured 3.48 across the cut vs 45.43 for unrelated frames). Splitting a brief keeps the shared style and sound text on every clip. Node settings are saved inside the workflow, so this file opens the same way on any machine. Gallery keeps each clip's prompt. VRAM is freed when a run ends.
```

---

## Tags

```
workflow comfyui video minimax minimax-h3 text-to-video image-to-video audio all-in-one custom-node tool utility animation
```

---

## 첫 댓글 (업로드 후 고정용)

```
Quick notes —

• One prompt = one clip. Add prompts (or use ✂ Split into clips) to make a longer piece.
• Want the clips to actually join? Continuity → Last Frame Chain.
• Reference mode needs the ref2va UNET; Text/First-Last need fl2va. Both go in Settings once.
• The audio VAE slot must hold the MiniMax audio VAE — another one fails at decode.
• Every accelerator pack is optional; missing ones just switch their own option off.

Bug reports and feature requests are very welcome on GitHub:
https://github.com/designloves2/ComfyUI-TJ_NODE_STUDIO_ONE/issues
```

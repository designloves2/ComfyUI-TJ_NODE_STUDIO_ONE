# job.json schemas (per tool)

Condensed from each `<tool>-headless/README.md` — those READMEs are authoritative;
read them if a field is unclear. Fields marked **req** are required for that mode.
Everything else has a default (usually from the studio's ComfyUI config) and should be
**omitted** unless the user pins it. `seed: null` → random.

---

## h3 — MiniMax H3 video (`h3-headless/`)

```json
{
  "mode": "t2va",                 // t2va | fl2va | ref2va | l2va
  "preset": null,                 // studio preset name, or built-in alias (stock|dense|turbo-4step|everyday|sla-turbo|pdd-spectrum); null = config defaults
  "prompt": "…",                  // req — a string, OR the 3 H3 fields:
  "prompt": {
    "integrated_multimodal_description": "[Shot 1] …",
    "overall_soundscape": "…",
    "non_diegetic_music": "…"
  },
  "durationSeconds": 10,           // → frames on the 17k+5 grid
  "megapixels": 1.0,
  "aspect": "16:9 Landscape",
  "seed": null,
  "refImages": ["~/.hermes/render-queue/inputs/a.png"],   // ref2va only, <Picture 1>.. order
  "firstFrame": null, "lastFrame": null,                  // fl2va only
  "model": null                   // shorthand: sets both UNETs; omit for mode-aware config default
}
```

- `t2va` needs only `prompt`. `ref2va` needs `refImages`. `fl2va` needs `firstFrame`
  (+ optional `lastFrame`).
- For a **story sequence**: one clip per shot, `mode: "t2va"` for clip 1, `"fl2va"`
  for 2..N with `firstFrame: null` (worker fills it from the previous clip's last
  frame — see SKILL.md "Sequence notes"). Shared style + sound text repeated in each
  clip's prompt.

## krea2 — Krea2 image (`krea2-headless/`)

```json
{
  "mode": "t2i",                  // t2i | i2i | identity
  "prompt": "…",                  // req — string or { "positive": "…", "negative": "…" }
  "negativePrompt": "blurry, text",
  "width": 1024, "height": 1024,  // t2i
  "steps": 8, "cfg": 1, "sampler": "euler", "scheduler": "simple",
  "seed": null,
  "loras": [{ "name": "x.safetensors", "strength": 0.8, "enabled": true }],
  "saveSubfolder": "one_krea2",
  // i2i:
  "i2iImage": "~/.hermes/render-queue/inputs/src.png", "i2iDenoise": 0.75,
  // ControlNet (t2i or i2i):
  "control": { "enabled": true, "type": "depth"|"canny", "image": "~/.hermes/render-queue/inputs/ctrl.png", "strength": 1.0 },
  // identity (needs comfyui-krea2edit + the identity LoRA on the server):
  "identityImage": "~/.hermes/render-queue/inputs/portrait.png",   // req for identity
  "identityImageB": null,
  "identityLora": null,           // omit → identity_lora from config
  "identityFitMode": "fit", "identityRefBoost": 1.0, "identityGroundingPx": 768,
  "identityWidth": 1024, "identityHeight": 1024
}
```

- identity mode: `prompt` is the **edit instruction** ("give her a red jacket");
  `negativePrompt` is ignored.

## zimage — Z-Image Turbo image (`zimage-headless/`)

Same as krea2 t2i/i2i, minus ControlNet/identity, plus:

```json
{ "mode": "t2i", "prompt": "…", "width": 1024, "height": 1024,
  "steps": 8, "cfg": 1, "shift": 3, "seed": null,
  "i2iImage": "~/.hermes/render-queue/inputs/src.png", "i2iDenoise": 0.75 }
```

## klein — Flux2 Klein image (`klein-headless/`)

Fetches a pre-made workflow per mode from the server, so a reachable ComfyUI with the
`flux_klein` pack is required even for `--dry-run`.

```json
{ "mode": "t2i", "prompt": "…", "width": 1024, "height": 1536, "steps": 4, "cfg": 1, "seed": null }
{ "mode": "i2i", "prompt": "…", "i2iImage": "~/…/src.png", "i2iDenoise": 0.75 }
{ "mode": "edit", "prompt": "put her in a red jacket", "editImage1": "~/…/a.png", "editImage2": null }
{ "mode": "inpaint", "prompt": "a vase of flowers", "inpaintImage": "~/…/src.png", "inpaintMaskImage": "~/…/mask.png", "inpaintDenoise": 0.85 }
{ "mode": "outpaint", "prompt": "the rest of the room", "outpaintImage": "~/…/src.png", "outpaintUp": 256, "outpaintLeft": 256 }
{ "mode": "faceswap", "faceswapTarget": "~/…/scene.png", "faceswapSource": "~/…/face.png", "bfsLora": { "name": "bfs.safetensors", "strength": 1.0, "enabled": true } }
```

- `cfg` defaults to `5` for a `*base*` model, `1` otherwise. `kvCacheOverride`:
  `"auto"` | `"on"` | `"off"`.

## music — MusicMaker song / instrumental (`music-headless/`)

`caption` and `lyrics` are **finished text** — there is no LLM step in the headless
package. Album cover / queue / tagged-MP3 export are out of scope.

```json
{
  "engine": "acestep",            // acestep (48 kHz, default) | minimax
  "caption": "warm K-ballad, piano and strings, female vocal, emotional build",   // req
  "lyrics": "[Verse]\n…\n[Chorus]\n…",   // omit for instrumental
  "instrumental": false,
  "duration": 210,                // seconds 15–300; a "3:00"/"3분" in the caption wins
  "title": "Leaving at Dawn",
  "bpm": 72, "keyscale": "D minor", "timesignature": "4", "language": "ko",
  "vocalGender": "female", "vocalStyle": "auto", "voiceTone": "auto",
  "aceStages": [ {"steps":30,"cfg":1}, {"steps":20,"cfg":1,"on":true}, {"steps":15,"cfg":1,"on":true} ],
  "format": "flac",               // flac | mp3 | opus
  "seed": null
}
```

- Ace-Step reads `bpm`/`keyscale`/`timesignature` as structured inputs; MiniMax folds
  them into the caption text.
- Model files come from `GET /music_one/config` — omit `dit`/`aceUnet`/etc.

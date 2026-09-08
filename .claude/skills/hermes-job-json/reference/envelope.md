# Envelope + render-queue layout

## The envelope

Every file the Hermes queue consumes wraps the headless `job` object:

```json
{
  "tool": "h3" | "krea2" | "zimage" | "klein" | "music",
  "job":  { ... },     // exactly the shape that <tool>-headless/index.mjs takes
  "target": ""          // reserved for Hermes; leave empty unless the user says otherwise
}
```

- `tool` maps to a headless package: `h3` → `h3-headless/`, `krea2` → `krea2-headless/`,
  `zimage` → `zimage-headless/`, `klein` → `klein-headless/`, `music` → `music-headless/`.
- `job` is passed straight to that package's `generate(job, comfyConfig)` — no
  transformation. So it must validate against `<tool>-headless/README.md`.
- `target` is a Hermes routing hint the web/skill side can't know. Empty string.

## File naming

`<tool>_<mode>_NNN.json`, `NNN` zero-padded to at least 3 (`krea2_t2i_001.json`,
`h3_t2va_010.json`). A single music job is `music_<engine>_001.json`. Keep the batch
in one folder with a `manifest.json` alongside.

## Render-queue folder layout (Hermes side, macOS)

```
~/.hermes/render-queue/
  ├── inputs/     ← reference / first-frame / i2i / identity images. The USER puts them here.
  ├── outputs/    ← the worker writes finished renders here
  └── archive/{images,videos,music}/
```

- Any image path in a job (`refImages`, `firstFrame`, `lastFrame`, `i2iImage`,
  `identityImage`, `identityImageB`, `editImage1`, `editImage2`, `inpaintImage`,
  `inpaintMaskImage`, `outpaintImage`, `faceswapTarget`, `faceswapSource`, ControlNet
  `control.image`) → **`~/.hermes/render-queue/inputs/<filename>`**.
  The headless `abspath()` expands a leading `~`. Absolute paths also work.
- Never invent an input file. If the job needs one the user hasn't supplied, leave it
  `null` and flag it in the manifest / to the user.

## comfy.json (the worker supplies this, not the skill)

```json
{ "baseUrl": "https://comfy.tjtj.cloud",
  "headers": { "CF-Access-Client-Id": "…", "CF-Access-Client-Secret": "…" },
  "timeoutMs": 1800000 }
```

The skill never writes `comfy.json` — it only produces job files. Music renders are
long; if the batch is music, note in the manifest that the worker should raise
`timeoutMs` to ~40 min.

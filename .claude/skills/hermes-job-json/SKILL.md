---
name: hermes-job-json
description: >-
  Turn a batch or story render request into ready-to-run Hermes job.json files for
  the AI-ONE-STUDIO headless generators (MiniMax H3 video, Krea2 / Z-Image / Flux2
  Klein images, MusicMaker audio). Use when the user asks for "N images/videos as
  Hermes JSON", "에르메스용 JSON 파일로 줘", a batch of prompts to feed the render
  queue, or a multi-clip story broken into per-clip job files. Writes each job wrapped
  in the {tool, job, target} envelope plus a manifest, into a folder the user can drop
  into ~/.hermes/render-queue/.
---

# hermes-job-json

The AI-ONE-STUDIO **headless generators** (`h3-headless/`, `krea2-headless/`,
`zimage-headless/`, `klein-headless/`, `music-headless/`) each run one job from a
`job.json`. The **Hermes agent** picks those files out of `~/.hermes/render-queue/`
and runs them. This skill produces those files from a plain-language request.

## When to use

- "크레아로 자유 주제 이미지 200장 만들어서 에르메스용 JSON으로 줘"
- "T2VA 자유 영상 200개, Hermes JSON 파일로"
- "10초 10편으로 이어지는 100초 스토리 영상 — 에르메스용 job.json으로"
- "이 프롬프트 목록을 h3 job 파일로 만들어줘"

Do **not** use this to actually render — it only writes the job files. The user (or
Hermes) runs them.

## Workflow

### 1. Pin the parameters

Ask only for what you can't infer:

| param | notes |
|---|---|
| **tool** | `h3` (video) · `krea2` / `zimage` / `klein` (image) · `music` (audio) |
| **mode** | h3: `t2va` \| `fl2va` \| `ref2va` \| `l2va`. images: `t2i` \| `i2i` \| (klein also `edit`/`inpaint`/`outpaint`/`faceswap`; krea2 also `identity`). music: engine `acestep` \| `minimax` |
| **count** | how many job files |
| **shape** | **batch** (N independent items) or **sequence** (N shots of one story/song) |
| **theme** | a subject/style, or "free" (→ you invent diverse subjects) |
| **fixed overrides** | resolution, duration, steps, seed policy, preset, engine, save subfolder — anything the user states once for the whole batch |

Sensible defaults (state them, don't ask): h3 `t2va` `durationSeconds:10` `aspect:"16:9 Landscape"` `preset:null`; images `t2i` 1024×1024 (portrait 1024×1536 if the subject wants it); music `acestep`. `seed:null` (random) unless the user wants repeatability.

### 2. Write the prompts

- **h3 video** — load the `minimax-h3-prompt` skill and use it for every clip. Batch → each clip is its own short brief. Sequence → one story as a shot list, one clip per shot, carrying a shared style header + sound footer.
- **images** (krea2 / zimage / klein / sdxl / anima / qwen2511) — load the
  `studio-image-prompt` skill. It holds the per-model dialect (Krea2 prose, SDXL
  tags+weights, Anima anime prose, …) and the batch-diversity method; hand it the
  tool + count + theme and it returns a JSON array of prompt strings.
- **music** — `caption` (finished style text) + `lyrics` (`[Verse]`/`[Chorus]` tags) or `instrumental:true`. Sequence = one song; there is only ever one music job unless the user wants variations.

Generate in groups if the count is large — a compact JSON array that `write_jobs.mjs`
expands into files, rather than writing 200 files by hand.

### 3. Build the jobs

Each job object matches its headless package's `job.json` schema — see
`reference/schemas.md`. Wrap every one in the envelope (`reference/envelope.md`):

```json
{ "tool": "krea2", "job": { "mode": "t2i", "prompt": "…", "width": 1024, "height": 1024, "seed": null }, "target": "" }
```

Image/frame paths (`refImages`, `firstFrame`, `lastFrame`, `i2iImage`,
`identityImage`, `editImage1`, …) → `~/.hermes/render-queue/inputs/<filename>`
(the headless `abspath()` expands the tilde). Only reference files the user actually
put there.

### 4. Emit the files

Run `write_jobs.mjs` (Node 20+, zero deps):

```bash
node .claude/skills/hermes-job-json/write_jobs.mjs \
  --tool krea2 --mode t2i --out ./hermes-jobs/krea2-free-200 \
  --prompts ./prompts.json          # or --prompts - to read a JSON array on stdin
```

`--prompts` is a JSON array. Each element is either a **string** (the prompt) or an
**object** — a full/partial `job` (its fields override the mode defaults; a `prompt`
key is required). `--base '{"width":1024,"height":1536,"steps":8}'` applies to every
job. `--seq` numbers a sequence and (h3) chains `fl2va` frames as a TODO note.

It writes `<tool>_<mode>_001.json` … `_NNN.json` (each enveloped) + `manifest.json`
(count, tool, mode, prompts, created-at) into `--out`, then prints the folder path.

### 5. Hand off

Tell the user the folder path and the count. If they asked for a zip or Drive
delivery, `SendUserFile` the folder's files (or a zip you make with `zip`/tar). The
Hermes side copies the folder into `~/.hermes/render-queue/` (or its inbox); the
worker runs each file and writes results to `~/.hermes/render-queue/outputs/`.

## Sequence (story) notes

- **h3 frame-exact continuity** (`fl2va`, last→first frame) can't be fully baked into
  the files — the frames don't exist until each clip renders. Emit the N `fl2va` (or
  `t2va` for clip 1) jobs with `firstFrame` left `null` and a `_relay` note in the
  manifest; the Hermes worker (or a wrapper script) extracts each clip's last frame
  and injects it as the next `firstFrame`. If the worker can't relay, fall back to N
  `t2va` clips with a strong shared style header — narrative continuity, not
  frame-exact.
- Pin `seed` across a sequence only if the user wants the same look every run.
- Keep a shot's prompt to its own beat; the story arc lives across the shot list, not
  inside one clip.

## Reference

- `reference/schemas.md` — per-tool `job.json` fields (condensed from each
  `*-headless/README.md`; those READMEs are the source of truth).
- `reference/envelope.md` — the `{tool, job, target}` wrapper, the render-queue
  folder layout, and the input-path convention.

---
name: studio-image-prompt
description: >-
  Write text-to-image prompts in the exact house style of the AI-ONE-STUDIO image
  models — Krea2, Z-Image, Flux2 Klein, SDXL, Anima, Qwen Image Edit. Use when asked
  to write, enhance, or batch prompts for any of those models, when the user says
  "크레아/z-image/klein 프롬프트로 써줘", or as the image-side prompt author for the
  hermes-job-json skill. Routes to the correct per-model format (natural-language prose
  for the Flux-family, tags+weights for SDXL, anime prose for Anima) and, for batches,
  spreads the set so no two prompts read alike.
---

# studio-image-prompt

The ONE STUDIO image tools split into three prompt dialects. Pick by target model,
then follow that dialect's rules from `reference/model_formats.md` (the studio's own
`model_formats.json`, verbatim).

| model | dialect | one-line rule |
|---|---|---|
| **Krea2** | `KREA2 (Prompt Enhance)` | one cohesive prose paragraph; faithful to the source, grounded phrasing, style chosen silently |
| **Z-Image** | `Z-Image & Lumina-2` | long richly-descriptive prose, complex sentences, vivid concrete detail |
| **Flux2 Klein** | `Flux & Chroma (natural language)` | flowing prose, no tag syntax, no weights, no quality boosters |
| **SDXL** | `SDXL (tags + weights)` | comma tags, lead with quality tags, `(x:1.2)` weights, order subject→action→env→light→camera→style→quality |
| **Anima** | `Anima (anime illustration prose)` | anime prose — cel/soft shading, palette, line quality, screentone; **no** DSLR/lens/bokeh terms |
| **Qwen Image Edit** | `Universal Natural Language` + an edit instruction | plain natural language; the "prompt" is the edit ("recolor the car matte black") |

Krea2 identity-edit mode is a special case: the prompt is the **edit instruction**, not
a scene description ("give her a red leather jacket").

## Craft (applies to every dialect)

- **Order**: subject + its own attributes/action → other subjects → setting → lighting →
  lens / medium / style → mood. Group each subject with its attributes so the model
  binds them.
- **Concrete over adjective**: not "beautiful lighting" — "late-afternoon sun raking
  across the wall, long hard shadows".
- **One core idea per prompt.** Don't stack three unrelated visual concepts.
- **Faithfulness (Krea2 rule 1)**: keep every subject, action, colour, and spatial
  relationship the user gave. Don't add props, characters, or animals not implied.
  If the source is already detailed, polish — don't rewrite.
- **Photographic vocab** (`35mm`, `shallow depth of field`, `backlit`, `anamorphic`,
  `overcast`, `golden hour`) works for Krea2 / Z-Image / Klein / SDXL. **Not** for
  Anima — use illustration vocab there.
- **Negatives**: minimal (`blurry, text, watermark`). The Flux-family barely uses them;
  SDXL uses a short one.
- **No** `masterpiece / 8k / trending on artstation` magic words for the Flux-family
  (SDXL/SD1.5/Pony are the exception — those *lead* with quality tags).
- **Text in image**: put the exact wording in quotes.
- **Human form**: depict people with dignity; assume clothing covers intimate anatomy.
- **Medium lock**: if the source says photo / painting / sketch / 3D, keep it.

## Output

- **Single prompt** → the finished prompt only. No preamble, no "here's your prompt:",
  no markdown, no labels. Prose dialects = one paragraph. SDXL = one comma line.
- **A pair** (positive + negative) only when the model wants one — return as
  `{ "positive": "...", "negative": "..." }`.

## Batches ("N free-topic prompts", "200 images")

The point of a batch is variety. Before writing, sketch axes and rotate them so the set
doesn't collapse to one look:

- **subject domain** — people, architecture, landscape, still life, animals, objects,
  abstract, interiors, street, food, machinery, nature detail…
- **time / light** — dawn, harsh noon, overcast, golden hour, blue hour, night,
  interior artificial, candlelit
- **lens / framing** — wide establishing, portrait 85mm, macro, top-down, low angle,
  Dutch tilt, over-the-shoulder
- **palette / mood** — warm, cool, monochrome, high-key, muted, saturated, moody
- **medium / style** (if the user allows) — photo, oil, watercolour, 3D render, ink,
  risograph, film stock

Aim for no two adjacent prompts sharing subject domain **and** light **and** framing.
For a themed batch ("200 cafés"), vary everything *except* the theme.

Emit the set as a **JSON array of strings** (or `{positive,negative}` objects) so
`hermes-job-json/write_jobs.mjs` can expand it into job files. Generate in groups of
~20–40 and concatenate rather than writing one 200-element message.

## Reference

`reference/model_formats.md` — the per-model instruction text, straight from the
studio's `ComfyUI-TJ_NODE/nodes/llm/data/model_formats.json`. That file is the source
of truth; if the two disagree, it wins.

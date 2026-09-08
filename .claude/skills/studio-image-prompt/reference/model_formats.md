# model_formats — verbatim

From `ComfyUI-TJ_NODE/nodes/llm/data/model_formats.json` (the studio's LLM panel
`model_format` options). Reproduced here so the skill is self-contained; that file is
authoritative.

## KREA2 (Prompt Enhance)  — use for **Krea2**

> Expand the source into a single, highly effective text-to-image prompt. The source
> may be the user's written prompt or an image you have just analyzed — work from
> whichever is provided.
>
> 1. **Faithfulness first:** preserve all subjects, actions, colors, and spatial
>    relationships from the source. Do not add objects, props, characters, or animals
>    that are not present or clearly implied.
> 2. **Practical T2I structure:** write so a text-to-image model can parse it cleanly —
>    group each subject with its own attributes and actions, and use grounded phrasing
>    for poses, interactions, and spatial layout.
> 3. **Style planning stays internal:** choose style, medium, framing, and lighting
>    silently. Never show planning, reasoning, alternatives, or labels.
> 4. **Text rendering:** if visible text, labels, or typography are requested or
>    present, state the exact wording in quotes.
> 5. **Avoid over-specification:** do not invent highly specific clothing, colors, or
>    materials that the source does not support.
> 6. **Respect existing detail:** if the source is already detailed, lightly polish
>    rather than heavily expand — keep its phrasing and direction.
> 7. **Respect the human form:** depict people with dignity; assume clothing covers
>    genitals and intimate anatomy.
> 8. **Preserve the medium:** if a medium is stated or evident (photo, illustration,
>    painting, sketch, 3D render), keep it — do not pivot to another.
>
> Output one cohesive paragraph of prose. No bullets, no markdown, no JSON.

## Flux & Chroma (natural language)  — use for **Flux2 Klein**

> Format the output as flowing natural language in long descriptive sentences suitable
> for Flux or Chroma. No tag syntax. No parenthesis weights. No 'masterpiece' or
> quality boosters. Describe the scene as prose.

## Z-Image & Lumina-2 (LLM text encoder)  — use for **Z-Image**

> Format the output as long, richly descriptive natural-language prose suitable for
> LLM-based text encoders (Z-Image, Lumina-2). Use complex sentences and vivid concrete
> detail. No tag syntax, no weights.

## SDXL (tags + weights)  — use for **SDXL**

> Format the output as a comma-separated list of descriptive tags for SDXL. Start with
> quality tags (masterpiece, best quality, highly detailed). Use parenthesis weight
> syntax for emphasis like (cinematic lighting:1.2). Order: subject, action,
> environment, lighting, camera, style, quality.

## Anima (anime illustration prose)  — use for **Anima**

> Format the output as a single flowing natural-language paragraph suitable for Anima's
> Qwen3 text encoder — long descriptive prose, not tags. Anima is a non-photorealistic
> anime/illustration model: lean into anime-style visual vocabulary (line art quality,
> cel shading vs. soft shading, palette and mood, screentone/halftone texture,
> character design cues) rather than photographic camera language (no DSLR/lens/bokeh
> terms). Cover subject, pose/expression, outfit and distinguishing details, setting,
> lighting and color palette, and overall art style/mood in that order. No tag syntax,
> no weights, no bullet points.

## Universal Natural Language  — use for **Qwen Image Edit** (+ the edit instruction)

> Format the output as a flowing natural language paragraph describing the scene in
> concrete visual detail. No tags, no weights.

---

Other entries in the file (`HiDream`, `SD 1.5`, `Pony & Illustrious`, `LTX Video`,
`Hunyuan & Wan Video`, `Ideogram4`, `Minimax H3 (Video)`, `Json Checker`,
`Custom Instruction`) are not ONE STUDIO image tools — MiniMax H3 video goes through
the `minimax-h3-prompt` skill instead.

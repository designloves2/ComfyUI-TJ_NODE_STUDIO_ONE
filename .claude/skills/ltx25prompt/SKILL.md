---
name: ltx25prompt
description: >-
  Write LTX-2.5 (Lightricks LTX Video) prompts — a single flowing cinematic paragraph
  for a continuous take, a chronological multi-shot paragraph with named cuts (2-4
  shots), or a screenplay-style scene for dialogue. Use when the user asks for an
  LTX-2.5 / LTX Video prompt, wants a short idea expanded into a shot description, is
  writing a prompt for the ONE STUDIO "LTX Upscale" mode, or wants a MiniMax-H3 brief
  rewritten into an LTX-2.5 prompt. Follows the official LTX-2.5 prompt guide
  (ltx.io/blog/ltx-2-5-prompt-guide).
---

# LTX-2.5 Prompt Skill

LTX-2.5 wants a **complete picture of the shot that flows from beginning to end** —
written as natural cinematic prose, not tags or keyword lists. Match the structure to
what is being described; do not force every request into one shape.

Output **only** the finished prompt — no preamble, no notes, no "here's your prompt:",
no quotes around the whole thing. One paragraph unless the request is screenplay-style.

## Pick the shape

| shape | when | form |
|---|---|---|
| **Single-shot** (default) | one continuous camera take; image-to-video from a first frame; intimate performance; lip-synced dialogue in one framing | one flowing paragraph, ~4-8 sentences |
| **Multi-shot** | 2-4 distinct shots joined by cuts in one generation | one chronological paragraph; each cut named in prose |
| **Screenplay-style** | dialogue-heavy scene, multiple beats, precise timing | scene header + character cues + quoted dialogue; same fundamentals |

When unsure, write **single-shot**. For image-to-video / upscale-refine, always
single-shot unless the user explicitly asks for a cut away from the opening image.

## The six elements (cover all of them, in this order)

1. **Establish the shot** — cinematography terms matching the genre: shot scale (wide
   establishing / medium / medium close-up / close-up / macro), angle (low / high /
   eye-level / overhead / over-the-shoulder / Dutch), lens feel.
2. **Set the scene** — lighting conditions, colour palette, surface textures,
   atmosphere (fog / rain / dust / smoke / haze). Establish mood through what is
   visible, not adjectives.
3. **Describe the action** — the core action as one natural sequence, present tense,
   flowing clearly from start to finish.
4. **Define the character(s)** — age, hairstyle, clothing, distinguishing features.
   **Express emotion through physical cues** ("her jaw tightens", "he exhales
   slowly") — never abstract labels like "sad" or "angry".
5. **Camera movement** — how and *when* the camera moves (follows / tracks / pans
   across / circles / tilts up / pushes in / pulls back / handheld / static). Say how
   the subject appears *after* the move so the model can complete the motion.
6. **Audio** — ambient sound, music, speech, singing. Spoken dialogue in **quotation
   marks**; give language and accent if it matters ("a woman says in French, ...").

## Rules that apply to every prompt

- **Present tense** verbs for all action and movement.
- **Physical emotion cues, not labels.**
- **One coherent light logic per shot** — mixed light sources confuse the result.
- **Keep the scene focused** — a few clear characters and actions beat a crowded frame.
- **Camera movement relative to the subject.**
- **Match detail to shot scale** — close-ups need more facial/texture detail than wide
  shots.
- **Concrete visual/audio language only** — every sentence adds something the model can
  render or play. No "masterpiece / 4k / best quality" boosters, no parenthetical
  weights, no negative phrasing.
- **On-screen text**: keep it short and prominent, put the exact words in quotes,
  expect spelling to drift — add critical titles/logos in post.
- **Physics**: prefer simple, plausible motion; highly chaotic motion still artifacts.
- **Length**: match to complexity. A simple single shot is ~4-8 sentences; a longer
  screenplay scene runs longer *only if every sentence adds concrete detail*.

## Multi-shot specifics (2-4 cuts)

Write the whole scene as **one chronological paragraph**. No shot list, no numbered
beats, no sluglines unless you also describe the cut in prose. At every cut:

1. **Name the transition** in natural language — "A hard cut transitions to…", "The
   view cuts to a close-up of…", "A match cut connects…", "The image dissolves into…".
2. **Re-establish the new shot** — shot scale, angle, who/what is in frame, lighting if
   it changed.
3. **Keep identity consistent** — reuse the same visual identifiers for recurring
   people/objects ("the woman in the yellow raincoat, earlier at the table, now…").
4. **State audio continuity** — "the synth score continues across the cut" / "the
   dialogue drops; only wind remains".

Give each shot a job (establish → detail → reaction, or wide → medium → close-up).
Keep action chronological ("Initially…", "A moment later…", "Simultaneously…"). Avoid
conflicting geography or unexplained costume changes between cuts unless the cut is
meant to jump time/place and you say so.

See `references/ltx25-terms.md` for the camera / lighting / texture / atmosphere /
style / audio vocabulary to draw on.

## Converting a MiniMax-H3 brief → LTX-2.5

The ONE STUDIO "LTX Upscale" mode loads a clip whose saved prompt is a **MiniMax-H3
structured brief** (`technical_settings`, `subject_definitions`, `<Subject N>` /
`<Reference Image N>` tokens, `summary`, `detailed_description`, `retention_analysis`,
audio sections). To rewrite it as an LTX-2.5 prompt:

- **Keep**: every subject and their exact appearance and wardrobe, their left-to-right
  order, the setting, the lighting, the camera move, the shot progression, the sound.
- **Resolve** `<Subject 1>` / `<Reference Image 2>` tokens to plain descriptions.
- **Drop**: the H3 headings, the reference-image bookkeeping, `retention_analysis`, the
  `technical_settings` line, the structured audio block (fold the sound into one audio
  sentence instead).
- **Produce** a single single-shot LTX paragraph (unless the H3 brief has real cuts —
  then multi-shot), following the six elements and the rules above. Roughly 60-130
  words.

## Refine / upscale prompt from one still frame

When given a single frame from an existing clip (LTX Upscale ✨): describe **the clip
that already exists**, not a new idea. Open with the action in one present-tense
sentence, then subject detail, setting, camera (matching the framing shown), lighting,
overall look. Never invent anything not visible or clearly implied. Never mention
upscaling, resolution, or the refine pass.

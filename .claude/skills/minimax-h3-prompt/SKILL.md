---
name: minimax-h3-prompt
description: Write MiniMax H3 / Hailuo video prompts — either a storyboard-style production brief from a user's request and attached images, or a copy-ready structured reference prompt (Image1/Video1/Audio1 tokens, [REFERENCE USE], [SHOT LIST], etc.) for Omni Reference, First/Last Frame, motion transfer, voice transfer, or targeted video edits. Use when the user asks for a MiniMax H3 / Hailuo video prompt, a video storyboard, to "enrich"/"expand" a short video idea into a shot-by-shot brief, or to format/audit a reference-based H3 prompt.
---

# MiniMax H3 Prompt Skill

This skill covers two related but distinct output styles for MiniMax H3. Pick ONE per request — never mix them in a single output.

- **Mode A — Production brief (narrative storyboard)**: default mode. Produces one flowing "brief" text (shots, dialogue in `<d>` tags, ambient sound / music paragraphs). Best for creative/MV-style requests, or when the user just describes an idea and/or attaches images loosely.
- **Mode B — Structured reference prompt (technical)**: produces a copy-ready prompt using bracketed sections (`[REFERENCE USE]`, `[SHOT LIST]`, etc.) and exact `Image1`/`Video1`/`Audio1` tokens. Best when the user explicitly wants a "reference prompt", mentions Omni Reference / First-Last Frame / motion transfer / voice transfer / targeted edit, or asks you to "format"/"audit" a prompt.

If it's ambiguous which mode fits, default to **Mode A** for casual/creative requests and ask only if the request is genuinely reference-engineering in nature (multiple typed references with explicit roles, editing a source video, voice cloning, etc.).

Output ONLY the requested artifact — no preamble, no meta-commentary about which mode you picked — unless the user explicitly asks for your reasoning too.

---

## Mode A — Production brief (narrative storyboard)

You are acting as a prompt-enrichment engine for MiniMax H3. Convert the user's request (plus any images they attach) into ONE detailed "production brief".

MiniMax H3 accepts a **whole number of seconds** for total duration (commonly 4–15s, see `references/minimax-h3-spec.md` for the current provider snapshot — but always defer to any runtime/tool-reported limit over this file). Always confirm/derive an integer target duration before writing shot timings.

### Always-true rules (never break these)

1. Refer to media only by fixed name: `<Picture 1>`, `<Video 1>`, `<Audio 1>` — counted separately, in input order.
2. Every shot — including `[Shot 1]` — starts with a `S.S~S.Ss` time range in seconds, one decimal place: `"[Shot N] S.S~S.Ss, ..."`. Shot 1 always starts at `0.0s`. Each shot's start time equals the previous shot's end time (no gaps, no overlaps). The final shot's end time equals the target duration exactly. **Never leave the `S.S~S.Ss` pattern un-filled — always substitute real numbers.**
3. All spoken words go inside `<d>[Language] exact words here.</d>` — never translate, paraphrase, or summarize.
4. On-screen text (signs, subtitles) is always quoted exactly: `reading "TEXT HERE"`.
5. Total video length must equal the target duration. Never invent shots that push past it.

### Scenario detection (pick exactly one)

- No media provided → **SCENARIO: text-only**
- An image is marked by the user as a first-frame and/or last-frame anchor → **SCENARIO: frame-anchored**
- Any media is marked as a general reference (character/style/voice/etc.) → **SCENARIO: full-reference**

Never mix frame-anchored and full-reference in the same output. If the user doesn't say which case applies and just attaches image(s) with a request, default to **full-reference** (treat the image(s) as general/style/character references) unless they clearly describe it as "the first frame" / "the last frame" / "start and end", in which case use frame-anchored.

#### SCENARIO: text-only

Just write the brief directly — no alignment line, no labels section.

Structure: state visual style + opening composition first, then `[Shot 1] 0.0~S.Ss, ...` / `[Shot 2] S.S~S.Ss, ...` per rule 2, then two short paragraphs at the end: `Ambient sound:` and `Music:`.

#### SCENARIO: frame-anchored

Start with exactly one alignment line, then a blank line, then the brief.

**When the user's text is short or vague, rely primarily on the image(s).** Inspect the anchor image(s) closely and infer: subject appearance and clothing, environment, lighting, color grade, mood, and a plausible camera move — then invent a concrete, coherent action that connects the anchor(s), consistent with whatever short text the user gave. Do not leave things generic ("a person in a scene") — commit to specific, visible details you can actually see in the image. If both a first and last frame are given, invent the most natural physical action that could plausibly move the subject from frame 1 to frame 2 in the target duration.

Alignment line — pick the matching case:
- first-frame only: `"At 0.00 seconds into the target video, <Picture 1> is fully referenced."`
- last-frame only: `"<Picture 1> aligns with the S.SS-second mark of the target video (the final frame)."`
- both: `"<Picture 1> aligns with the 0.00-second mark; <Picture 2> aligns with the S.SS-second mark of the target video."`
(`S.SS` = target duration in seconds, two decimals — this alignment line is the one place that still uses two-decimal notation; shot timings elsewhere use one decimal per rule 2.)

Then write the brief: describe the path from the first anchor to the last anchor (or from/to the single anchor), keeping people/objects/colors consistent with the image(s). End with `Ambient sound:` and `Music:` paragraphs.

**EXAMPLE (frame-anchored, single anchor):**

```
At 0.00 seconds into the target video, <Picture 1> is fully referenced.

[Shot 1] 0.0~3.0s, a cinematic, live-action shot. A woman with short black hair sits at a wooden desk by a rain-streaked window, warm lamplight on her face, soft shallow depth of field. She looks down at a letter in her hands. The camera pushes in with small amplitude at slow speed toward her hands.
(S1) — woman, mid-30s, low warm voice, calm pace, no accent — reads the letter aloud: <d>[English] I never thought I'd hear from you again.</d>

[Shot 2] 3.0~5.0s, the camera cuts to a close-up of her eyes welling with tears. She sets the letter down and looks up toward the window.

Ambient sound: Rain taps steadily against the glass; a clock ticks faintly in the background; her chair creaks once as she shifts.
Music: A slow solo piano melody plays softly underneath, minor key, tempo around 60 BPM, growing very slightly louder toward the end.
```

**EXAMPLE (frame-anchored, sparse user text + first & last frame images):**

User text was only: "a woman turns to look back, cinematic". `<Picture 1>` shows her facing away in a rain-lit alley; `<Picture 2>` shows her facing the camera, same alley, closer.

```
<Picture 1> aligns with the 0.00-second mark; <Picture 2> aligns with the 3.00-second mark of the target video.

[Shot 1] 0.0~1.0s, a cinematic, night shot, desaturated teal-and-orange grade, shallow depth of field, light rain falling. <Picture 1>: a woman in a long dark coat stands facing away from camera in a narrow alley, neon signage reflecting faintly on wet pavement. She hears something behind her and slows her steps, shoulders tensing. The camera holds a static shot as she begins to turn.
[Shot 2] 1.0~3.0s, she pivots on her heel, coat swirling slightly, and finishes turning to face the camera directly, her expression guarded — matching <Picture 2> exactly at the 3.00-second mark.

Ambient sound: Light rain patters on pavement and puddles; distant traffic hums low in the background; her boots scrape softly on wet concrete as she turns.
Music: A tense, sparse string drone builds slowly underneath, swelling slightly as she completes the turn.
```

#### SCENARIO: full-reference

Write these six sections, in this order, with these exact headers:

```
subject_definitions:
summary:
retention_analysis:
detailed_description:
overall_soundscape:
non_diegetic_music:
```

- **subject_definitions**: one line per reused item. Use `<Subject N>` for people/objects/style that will appear, `<Picture N>`/`<Video N>` for structural anchors, `<Audio N>` for reused sound. State what it is + what to preserve.
- **summary**: one sentence, starts with a bracketed tag like `[reference generation]` or `[video editing + audio reuse]`. Combine tags with `" + "` only if genuinely both apply.
- **retention_analysis**: one line per label. Visual labels use: `fully_preserved` / `partially_preserved` / `attribute_transfer` / `weak_reference`. Audio labels use: `fully_copy` / `partially_copy` / `reference` / `weak_reference`. Add a 5-10 word reason each.
- **detailed_description**: the shot-by-shot brief (same `[Shot N]` / `<d>` / camera rules as above), **300-450 words**, inserting `<Subject N>` / `<Picture N>` / `<Video N>` labels wherever that content appears. This is the section people notice most if it's too short — do not compress it into one or two shots; aim for enough shots (often 4-9 for a 5-15s video) to feel like a real storyboard, each with concrete, specific visual detail grounded in what's actually in the attached image(s).
- **overall_soundscape**: 1-4 sentences, ambient + physical sounds only (no dialogue, no music). Do not write "N/A" here — only `non_diegetic_music` may be "N/A".
- **non_diegetic_music**: 1-3 sentences, audience-only score (instruments, tempo, dynamics). Write "N/A" if none.

**EXAMPLE (full-reference):**

```
subject_definitions:
<Subject 1> - the woman from <Picture 1>: short black hair, red coat, calm expression. Keep face and outfit identical.
<Audio 1> - voice-timbre reference for <Subject 1> (S1): warm, low-pitched, unhurried.

summary:
[reference generation + audio reference] A short video of <Subject 1> walking through a rainy city street at night while narrating a memory, using <Audio 1> for her voice.

retention_analysis:
<Subject 1> (appears in [Shot 1], [Shot 2]): fully_preserved - hair, coat, and facial features kept identical to <Picture 1>.
<Audio 1>: reference - pitch and pacing matched, but wording is new.

detailed_description:
The target video is a moody, cinematic night scene, desaturated colors, neon reflections on wet pavement.
[Shot 1] 0.0~4.0s, <Subject 1> (S1) walks slowly toward camera under a streetlight, rain falling steadily. She says in an off-screen voiceover: <d>[English] Some nights, the city feels like it remembers me.</d>
[Shot 2] 4.0~6.0s, the camera cuts to a wide shot as she turns down an alley, neon signs reflecting in puddles around her feet.

overall_soundscape:
Steady rain falls throughout, with occasional distant traffic hum and her footsteps splashing lightly on wet pavement.

non_diegetic_music:
A slow ambient synth pad plays underneath, with a faint reverberant piano motif entering in the second half, tempo unhurried.
```

### Mode A working notes

- If the user gives a specific target duration, use it exactly and make the last shot's end time match it. If they don't, ask, or pick a sensible default (5s for a single quick scene, more for a story with multiple beats) and state your assumption in one line before the brief.
- If they attach images, actually look at them and describe concrete, specific details (hair, clothing, pose, environment, lighting, color grade) — don't write generic placeholders like "a person in a scene".
- If they give explicit content restrictions (e.g. "no jump scares", "no threatening behavior"), treat those as hard constraints on every shot, not just a note.
- Prefer more, shorter shots over one giant shot when the user wants an eventful/lively video — a 10s "storyboard" reads much better as 6-9 short beats than as 1-2 long ones.

---

## Mode B — Structured reference prompt (technical)

Turn a scene brief and ordered media into one copy-ready MiniMax H3 prompt using bracketed sections and exact `Image1`/`Video1`/`Audio1` tokens (no `@`, no space before the number). Treat every reference as a bounded source of authority, place stable truths before action, and make every timed shot describe framing, screen geography, performance, dialogue, and visible end state.

### Load the exact rules

- Read `references/minimax-h3-spec.md` before formatting or auditing any prompt with references. Use it for input modes, media limits, role syntax, prompt order, timing, audio, and validation.
- Read `references/prompt-patterns.md` when the request uses multiple subjects, multiple reference types, dialogue, motion or camera transfer, voice cloning, First/Last Frame, or video editing.

### Runtime contract takes precedence

When the generation interface or an MCP tool supplies a capability contract, treat its exact endpoint, ordered reference tokens, media limits, duration choices, formats, and prompt-length ceiling as authoritative. Those runtime values override conflicting static guidance in `references/minimax-h3-spec.md`. Never loosen a runtime limit or renumber its reference bindings. Use the bundled specification only as fallback guidance for values the active interface does not provide, and call out a material conflict instead of guessing.

### 1. Classify the task

Choose the smallest contract that fits:

- **Text-to-video**: no media references.
- **First/Last Frame**: one or two images define boundary frames.
- **Omni Reference**: one or more image, video, or audio assets define the result.
- **Performance transfer**: a video supplies motion, expression, action order, singing, or camera behavior while other media supply identity or voice.
- **Voice transfer**: audio supplies timbre, accent, cadence, singing, or delivery for a named target.
- **Targeted edit**: a source video remains the master while named visual or audio elements change.

Infer harmless production details when the user's intent is clear. Ask only when a missing answer would change reference order, identity ownership, source-master selection, exact dialogue, or story outcome.

### 2. Build an internal authority map

For every asset, record:

1. Exact compact reference token, normally `Image1`, `Video1`, or `Audio1`.
2. Named subject or production role.
3. Attributes it controls.
4. Incidental attributes it must not impose.

Assign narrow, truthful roles such as identity, wardrobe, prop, scene, style, motion, performance timing, camera, edit rhythm, voice, music, or sound effect. Never let "use the references" stand in for a map.

Use compact H3 labels with no `@` prefix and no space before the number: `Image1`, `Image2`, `Video1`, `Audio1`. When an interface provides an ordered binding map, preserve every token and its attachment order exactly; do not infer tokens from visible library labels, filenames, symbols, or UUIDs. Use an interface-provided token when it visibly supplies a different exact label. Do not renumber references silently. Map each character and voice individually; never rely on "respectively."

### 3. Establish stable truth first

Put these sections before the shot list when relevant:

```text
[REFERENCE USE]
[IDENTITY / CONTINUITY LOCKS]
[SCENE]
[DIALOGUE]
[SCREEN GEOGRAPHY]
```

Lock subject count, face, hair, body, wardrobe, prop ownership, voice ownership, left/right relationships, look room, and screen direction only when they matter to continuity.

Give actors an objective and listening behavior. Prefer observable direction — breath, gaze, posture, interrupted movement, hesitation, or attention — over generic emotion labels.

### 4. Stage the shot list

For a multi-beat clip, use consecutive time ranges within the requested output duration and the active interface's runtime bounds. When no runtime duration contract is available, use the bundled specification's fallback range. Give every range:

```text
<time> — <framing and lens>; <camera behavior>; <visible action>; <speaker and exact dialogue>; <transition or end state>.
```

- Use one primary event per range.
- Reserve time for reactions and audible scene tails.
- Keep screen geography and eyelines consistent across coverage.
- Treat time ranges as pacing budgets, not frame-accurate edit commands.
- Use natural prose instead of timestamps for one simple continuous action.

### 5. Separate finishing direction

After the shot list, use only the sections that constrain the result:

```text
[ACTING]
[LIGHT AND IMAGE]
[CAMERA]
[PRODUCTION SOUND]
[NEGATIVES]
```

State dialogue as exact quoted lines bound to one speaker. Name language, accent, delivery, and timing when important. Keep dialogue separate from the reference-audio role and the final audio mix.

Keep negatives short and specific to likely failures: extra subjects, identity drift, wardrobe swaps, voice swaps, broken eyelines, duplicate props, incorrect screen direction, unmotivated cuts, subtitles, or unwanted music.

### 6. Apply the mode contract

- **Performance transfer**: State that the source video controls only named motion, performance, timing, or camera traits. Explicitly reject its actors, clothing, location, and identity unless needed.
- **Voice transfer**: Bind the audio to one named character and exact line. Preserve lip sync, voice ownership, and native stereo ambience.
- **First/Last Frame**: Declare which image is the first frame and which is the last. Describe the single causal motion that connects them without inventing extra subjects or cuts.
- **Targeted edit**: Name one source video as the sole editing master. List exact changes, reference roles, and everything that must remain unchanged.
- **Environment or VFX replacement**: Preserve foreground identity, edges, performance, occlusion, timing, camera, and duration. Require coherent relighting, parallax, shadow, and interaction with the new scene.
- **Complex motion path**: Write the ordered position changes explicitly and lock subject count, camera, and final arrangement.

### 7. Validate before returning

Check that:

- Every reference has one named job and a clear boundary.
- Every identity, voice, prop, and edit target has one owner.
- Reference tokens match upload order and are used consistently.
- The final prompt and requested media stay within the active interface's runtime limits.
- Incidental backgrounds, people, poses, or styles are excluded when leakage is plausible.
- Subject count, wardrobe, voice ownership, geography, and screen direction cannot swap.
- Timed ranges are consecutive, non-overlapping, and realistic for the dialogue and action.
- Every range contains one primary visible beat and a usable end state.
- Camera, lighting, acting, dialogue, production sound, and negatives do not contradict the references.
- Edits name the sole master, exact targets, and preserved content.
- The prompt does not invent unsupported facts about an unseen reference.

### Mode B output contract

Return:

1. A short `Reference map` when two or more references are used.
2. One final prompt in a single plain-text code block, ready to paste.
3. A short `Assumptions` or `Watch-outs` note only when it helps execution.

Do not return competing variants unless requested. Do not submit a generation unless separately authorized.

# MiniMax H3 reference prompting specification

## Capability snapshot

This is fallback guidance, not a live capability response. If the active generation interface or an MCP tool provides endpoint-specific limits, supported values, or ordered reference tokens, that runtime contract is authoritative. In particular, a client may enforce a prompt ceiling stricter than the provider-site snapshot below. Never expand a runtime limit to match this file.

- Provider-site duration snapshot: 4–15 seconds.
- Frame rate: 24 FPS.
- Audio: native stereo audio on every generation.
- Provider-site prompt snapshot: up to 7,000 characters when the active interface does not report a stricter ceiling.
- Text-to-video aspect ratios: 21:9, 16:9, 4:3, 1:1, 3:4, and 9:16.
- Omni Reference aspect ratios: the same selectable ratios plus Auto.
- First/Last Frame aspect ratio: follows the uploaded image.
- 2K mode: 1440px short edge from 16:9 through 9:16; wider output is about 3.7 megapixels.

## Input modes and limits

### First/Last Frame

- Accept 0, 1, or 2 images.
- Image dimensions: 256–5760px.
- Image aspect ratio: 5:2 through 2:5.
- With no image, the request behaves as text-to-video.

### Omni Reference

- Images: up to 9.
- Videos: up to 3 clips, 2–15 seconds each, 15 seconds total.
- Audio: up to 3 clips, 2–15 seconds each, 15 seconds total.
- Mixed inputs: up to 12 files total.
- Audio cannot be used alone; pair it with at least one image or video.

### Formats and file limits

- Images: JPG, JPEG, PNG, WEBP, HEIC, HEIF; up to 30 MB per file.
- Video: H.264/AVC or H.265/HEVC; embedded AAC or MP3 audio; up to 50 MB per file.
- Audio: WAV or MP3; up to 15 MB per file.
- API request body: 64 MB. Prefer URL-based media for API workflows.

## Canonical reference syntax

Use numbered tokens in upload order. When the active interface supplies an ordered binding map, that map is the source of truth:

```text
Image1
Image2
Video1
Audio1
```

Do not add an `@` prefix and do not insert a space before the number. If the interface visibly supplies a different exact token, preserve it. Never guess reference contents. When attachments are unavailable, write role placeholders or explicitly state assumptions.

For every reference, name:

```text
<token> defines <subject or production role>'s <attributes> only.
Do not inherit <incidental people, background, pose, framing, clothing, sound, or style>.
```

Useful authority roles:

- **Image**: identity, wardrobe, prop appearance, product geometry, location, layout, material, lighting, graphic style.
- **Video**: motion path, body mechanics, performance timing, expression order, camera movement, framing, edit rhythm, transition language, soundscape.
- **Audio**: voice timbre, accent, cadence, emotional delivery, singing, music, or a sound effect.

Do not let one reference control unrelated categories unless the user explicitly wants the whole reference reproduced.

## Recommended prompt order

Use the smallest useful subset:

```text
[REFERENCE USE]
[IDENTITY / CONTINUITY LOCKS]
[SCENE]
[DIALOGUE]
[SCREEN GEOGRAPHY]
[SHOT LIST]
[ACTING]
[LIGHT AND IMAGE]
[CAMERA]
[PRODUCTION SOUND]
[NEGATIVES]
```

Stable truth precedes action. Finishing direction follows the timed scene.

## Timing and coverage

- Use natural prose for one simple continuous shot.
- Use time ranges for two or more beats, dialogue turns, reaction shots, entrances, exits, or transitions.
- Keep ranges consecutive and non-overlapping inside 4–15 seconds.
- Give each range one primary action and a visible end state.
- Include framing, screen geography, action, dialogue window, and transition when relevant.
- Reserve enough time for speech at a natural pace and for silent reactions.

## Dialogue and audio

Write dialogue as an exact quote with speaker, language, delivery, and timing when needed:

```text
<Character A> says in natural conversational American English, quietly but firmly: "Exact line."
```

Separate four ideas:

1. Who speaks.
2. What is said.
3. Which reference supplies the voice or delivery.
4. How the final audio mix behaves.

For production sound, specify ambience, action effects, dialogue clarity, stereo behavior, and music policy. Do not request "no audio" when native ambience would help unless silence is intentional.

## Editing contract

Use this structure:

```text
[SOURCE MASTER]
Video1 is the sole editing master for subjects, scene, timeline, camera, occlusions, dialogue, ambience, and event order.

[REFERENCE USE]
<Replacement references and their bounded roles.>

[EDIT]
<Exact target, change, region, or time range.>

[PRESERVE]
<Identity, performance, motion, occlusion, lighting, camera, dialogue, ambience, timing, and untouched objects as needed.>
```

For replacement, keep the source object's motion path, visibility, contacts, occlusions, scale changes, and timing unless the user asks to change them.

## Validation checklist

- Reference order and tokens are exact.
- Every reference has one named authority and an exclusion boundary.
- Subject, prop, and voice ownership are explicit.
- Actor count, identity, wardrobe, and screen geography remain stable.
- Dialogue fits the time budget and has one speaker per line.
- Camera and edit language do not fight the reference motion.
- Production sound names dialogue, ambience, effects, and music separately.
- Editing protects all untargeted content.
- Negatives are observable and limited to likely failure modes.

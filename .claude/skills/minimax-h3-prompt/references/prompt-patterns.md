# MiniMax H3 prompt patterns

Use these as structural starting points. Replace placeholders with facts from the user's references and brief. Adapt all sample time ranges and prompt detail to the active interface's runtime capability contract; never copy a sample beyond its reported duration or prompt-length limits.

## Omni reference scene

```text
[REFERENCE USE]
Image1 defines <Character A>'s face, hair, body, and wardrobe only. Ignore its background and pose.
Image2 defines <Character B>'s face, hair, body, and wardrobe only. Ignore its background and pose.
Image3 defines the location, layout, materials, and lighting only. Ignore its people.

[IDENTITY / CONTINUITY LOCKS]
Keep exactly two characters. Preserve identity, wardrobe, body proportions, and voice ownership. No face, clothing, or position swaps.

[SCENE]
<Location and time>. <Character A> wants <objective>; <Character B> resists because <conflict>. The scene moves from <starting emotion> to <ending emotion>.

[DIALOGUE]
<Character A> says: "<Exact line.>"
<Character B> replies: "<Exact line.>"

[SCREEN GEOGRAPHY]
<Character A> begins frame left. <Character B> begins frame right. Maintain the axis and matching eyelines.

[SHOT LIST]
0–4s — <framing>; <camera>; <action and first line>; end on <visible state>.
4–9s — <framing>; <reaction or escalation>; <second line>; transition by <motivated cut or move>.
9–15s — <framing>; <resolution>; end with <stable final tableau and audible tail>.

[ACTING]
<Posture, breath, gaze, gesture, listening behavior, and emotional progression.>

[LIGHT AND IMAGE]
<Lighting, palette, texture, lens character, and depth of field.>

[CAMERA]
<Allowed movement, shot sizes, axis, and transition language.>

[PRODUCTION SOUND]
Native stereo <ambience>. Dialogue remains clear. Include <motivated effects>. <Music rule>.

[NEGATIVES]
No extra people, face drift, wardrobe changes, voice swaps, broken eyelines, duplicate props, subtitles, or unmotivated cuts.
```

## Motion and camera transfer

```text
[REFERENCE USE]
Image1 defines <Character A>'s identity and wardrobe only.
Image2 defines <Character B>'s identity and wardrobe only.
Video1 defines body motion, expression timing, interaction rhythm, and camera movement only. Do not inherit its actors, clothing, location, or identities.

[TRANSFER]
Recreate the complete action order and camera behavior from Video1 with <Character A> and <Character B>. Preserve every handoff, pause, direction change, contact, occlusion, and final position.

[CONTINUITY]
Keep exactly two people. Preserve identity, wardrobe, screen direction, and left/right geography. Make weight, contact, hair, fabric, lighting, and shadows physically believable in <target scene>.

[SOUND]
Use native stereo ambience and synchronized action effects. <Dialogue or music rule.>

[NEGATIVES]
No actor leakage from Video1, identity swaps, missing action beats, extra cuts, or position reversals.
```

## Voice transfer with exact dialogue

```text
[REFERENCE USE]
Video1 defines the target character, visible performance, scene, camera, and duration.
Audio1 defines only <Character A>'s voice timbre, accent, cadence, and emotional delivery.

[DIALOGUE]
<Character A> says exactly in <language and accent>: "<Exact line.>"
Delivery: <pace, volume, breath, emotional restraint, and timing>.

[SYNC AND MIX]
Preserve accurate lip sync and the same character identity. Keep native stereo room tone and motivated effects under clear dialogue. No extra speech, subtitles, voice drift, or background music unless requested.
```

## First and last frame bridge

```text
[BOUNDARY FRAMES]
Image1 is the exact first frame. Preserve its subject count, identity, wardrobe, composition, lighting, and object positions at the start.
Image2 is the exact last frame. The shot must arrive naturally at its composition, lighting, and object positions by the end.

[ACTION]
In one continuous causal motion, <describe the smallest plausible action that connects the frames>. Maintain the same subjects and continuous objects throughout.

[CAMERA AND SOUND]
<Camera rule>. Native stereo <ambience and effects>.

[NEGATIVES]
No hard cut, teleportation, duplicate subject, identity change, prop swap, or discontinuous lighting.
```

## Targeted object or character edit

```text
[SOURCE MASTER]
Video1 is the sole editing master for subjects, performance, scene, timeline, camera, occlusions, dialogue, ambience, and event order.

[REFERENCE USE]
Image1 defines only <replacement target>'s appearance, structure, material, and color. Ignore its background and pose.

[EDIT]
Replace only <source target> with <replacement target>. Keep exactly one instance. The replacement inherits every motion path, contact, occlusion, rotation, scale change, speed change, and visibility event from the source target.

[PRESERVE]
Do not change any other subject, object, action, background, light, camera move, cut, dialogue, sound effect, ambience, or duration.
```

## Environment or VFX replacement

```text
[SOURCE MASTER]
Video1 defines the foreground subjects, performance, motion, timing, camera, and duration.
Video2 defines only the target environment, atmosphere, and lighting style.

[EDIT]
Replace <bounded background or effect> in Video1 with <target from Video2>. Make parallax, background motion, shadows, reflections, transmitted light, and interaction respond correctly to the foreground performance.

[PRESERVE]
Keep identity, hair and fabric edges, foreground objects, gesture timing, scale, occlusions, camera, and duration unchanged. No spill, halos, altered performance, or unrelated scene changes.
```

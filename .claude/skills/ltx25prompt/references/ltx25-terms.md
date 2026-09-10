# LTX-2.5 vocabulary & worked examples

Drawn from the official LTX-2.5 prompt guide (ltx.io/blog/ltx-2-5-prompt-guide).

## Camera movement terms

| term | meaning |
|---|---|
| Follows / Tracks | camera moves with the subject, keeping it framed |
| Pans across | camera pivots horizontally over the scene |
| Tilts upward / downward | camera pivots vertically |
| Circles around / Orbits | camera arcs around the subject |
| Pushes in / Dollies in | camera moves toward the subject |
| Pulls back / Dollies out | camera retreats, revealing more of the scene |
| Cranes up / Booms down | camera rises or lowers on a vertical axis |
| Handheld | subtle organic shake, documentary feel |
| Static frame / Locked off | camera does not move |
| Over-the-shoulder | framed from behind one subject onto another |
| Overhead / Top-down | camera looks straight down |
| Wide establishing | opens on the full location |
| Whip pan | fast blur pan, often used as a transition |

Always say how the subject is framed **after** the move so the model can finish the motion:
"...the camera pushes in until her face fills the frame."

## Shot scale

macro · extreme close-up · close-up · medium close-up · medium shot · medium wide ·
wide shot · wide establishing · extreme wide / vista

## Angle & lens

low angle · high angle · eye-level · Dutch/canted angle · bird's-eye ·
worm's-eye · shallow depth of field · deep focus · wide-angle lens · telephoto
compression · anamorphic flare

## Lighting

golden-hour backlight · overcast soft light · hard midday sun · blue-hour dusk ·
practical lamps · neon signage · candlelight · firelight · moonlight · single key
light · rim light · silhouette · volumetric shafts · bounced fill · harsh top light ·
flickering fluorescent

Keep **one** dominant light logic per shot.

## Texture & atmosphere

wet asphalt · peeling paint · brushed steel · rough linen · condensation on glass ·
frost · drifting dust motes · ground fog · rain streaks · falling snow · heat haze ·
smoke · sea spray · lens rain

## Style / look

photorealistic · 16mm film grain · 35mm · Super 8 · VHS artifacts · documentary ·
cinematic anamorphic · animation cel · stop-motion · claymation · 3D render ·
hand-drawn 2D · watercolor · noir high-contrast · pastel · desaturated ·
teal-and-orange grade

## Audio

Ambient: room tone, wind, traffic hum, rain on a roof, crackling fire, ocean, birdsong,
crowd murmur, machinery.
Music: describe instrumentation, tempo, mood ("a slow solo piano", "driving synth
arpeggio", "sparse taiko drums").
Speech / singing: put the words in quotes and name the language/accent:
`a man says in a low London accent, "We were never here."`
State continuity across cuts: "the score carries over the cut" / "the music stops
dead on the cut, leaving only breath."

## Worked example — single-shot

> A wide establishing shot on a rain-slicked Tokyo side street at blue hour, neon
> signage reflecting in the puddles and a faint ground fog drifting between the
> buildings. A woman in her late twenties, close-cropped black hair and a wet olive
> trench coat, walks slowly toward the camera with her hands buried in her pockets,
> her shoulders drawn up against the cold. She stops under a flickering red sign and
> tilts her head back, breathing out a visible plume. The camera pushes in steadily
> from the wide until it settles on a medium close-up of her face, catching the neon
> moving across her skin. Rain hisses on the pavement, a distant train rumbles past,
> and a low synth drone builds underneath.

## Worked example — multi-shot (3 cuts)

> A static wide shot of a farmhouse kitchen at dawn, cold grey light through gauze
> curtains, flour dust hanging in the air. An old man in a wool cardigan kneads dough
> at a scarred wooden table, his knuckles swollen, his jaw set. A hard cut pushes to a
> close-up of his hands folding and pressing the dough, dusted white, the table
> creaking under each push. The view then cuts to a medium shot from the doorway as a
> young girl in pajamas pads in, rubs one eye, and climbs onto a stool beside him; he
> glances over and the corner of his mouth lifts. Room tone and the tick of a wall
> clock run under every shot; a soft radio hymn fades up on the final cut.

## Screenplay-style pattern

Use a light scene header, character cues, and quoted dialogue — but keep the same
fundamentals (present tense, physical emotion, one light logic, camera relative to
subject, audio named).

> INT. DINER — NIGHT. A two-shot across a Formica table, hard overhead fluorescent
> light, rain on the window behind them. MARA (30s, red hair pulled back, chipped
> nail polish) turns her coffee cup a quarter turn without drinking. DANIEL (40s,
> unshaven, coat still on) watches her hands.
> MARA: "You said you'd stopped."
> DANIEL, quietly, not looking up: "I did stop. Twice."
> Her jaw tightens; she pushes the cup away. The camera drifts a few inches to the
> left, dropping Daniel out of focus. Rain, the hum of the lights, a jukebox two
> booths over playing something slow.

## Dub-It / video-editing IC-LoRA note

For the ONE STUDIO LTX Upscale refine pass the workflow is a low-denoise (~0.15) pass
over an existing clip. The prompt should describe the clip that already exists — do
not introduce new action, new cuts, or a new camera move that is not already in the
footage.

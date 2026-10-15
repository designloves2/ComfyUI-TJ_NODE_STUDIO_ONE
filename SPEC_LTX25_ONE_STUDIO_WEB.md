# LTX 2.5 ONE STUDIO — what the web twin needs (rule W1)

**Do not open or copy** `ltx25_studio_backend/director/` or `web/ltx25/director/` (GPL-3.0, derived from the LTX Director). The web project talks to the
`*TJ25` nodes through ComfyUI's API and writes its own timeline editor from the data format below. Everything else under `web/ltx25/` and
`web/one_node_ltx25.js` is this project's own shell code and may be ported exactly (graph builder, state, Prompt Write / Refine, gallery, settings).
Add a PORT_LEDGER row per ported piece.

## Nodes (public API: `/object_info`)
`LTXDirectorTJ25` (model, clip, audio_vae, vae, start/end/duration seconds+frames, `timeline_data`, `local_prompts`, `segment_lengths`, `epsilon`,
`guide_strength`, `global_prompt`, `use_custom_audio`, `use_custom_motion`, `inpaint_audio`, `frame_rate`, `custom_width/height`, `resize_method`,
`divisible_by`, `img_compression`, `override_audio`, `reference_strength`) → outputs model, positive, negative, video_latent, audio_latent, guide_data,
motion_guide_data, frame_rate, combined_audio. `LTXDirectorGuideTJ25`, `LTXDirectorCropGuidesTJ25`, `CleanLatentSliceTJ25`, `LTXChunkWriterTJ25`, `LTXChunkAssemblerTJ25`.
The exact two-stage wiring is `buildClipGraph` in `web/ltx25/graph_builder_ltx25.js` (port it as is).

## Timeline data (`timeline_data` JSON + the two derived strings)
`{ mainTrackEnabled, audioTrackEnabled, motionTrackEnabled, global_prompt, disable_prompt_relay, normalStartFrame, normalDurationFrames,
segments: [...], motionSegments: [], audioSegments: [], ...}` — see `emptyTimeline()` in `web/ltx25/core_ltx25.js` for every key.
- text segment: `{ id, start, length, prompt, type: "text" }` (frames at 24 fps)
- image segment: `{ id, start, length, prompt, type: "image", imageFile: "<path under ComfyUI input/>", imageB64: "", isAnchor, isEndFrame }`
  (`isEndFrame` pins the image to the segment's last frame; otherwise to `start`)
- `local_prompts` = the text segments' prompts joined with `" | "`; `segment_lengths` = comma-separated frame lengths where the last segment runs to the
  end of the clip (e.g. clip 121 frames, beats 0–48 / 48–96 / 96–121 → `"48,48,25"`); `guide_strength` = comma-separated, one per image segment in start order
  (`""` = all 1.0). Prompt relay needs `disable_prompt_relay: false`.
- `withAnchorFrames()` in the graph builder adds the first / last / Continue frame as image segments.

## Clip data
`state.prompts[i] = { text, enabled, firstFrame, dir: { widgets: { timeline_data, local_prompts, segment_lengths, guide_strength, epsilon, use_custom_audio,
use_custom_motion, inpaint_audio, override_audio }, frames } , header, footer, timeOverride, timeSec, assetRef, ... }`. A `dir` made for another length is
rebuilt before rendering (the web editor needs its own equivalent: re-time the segments to the new length).

## Frame grid, size
Frames are 8n+1 (`alignFrameCount`), 24 fps; final size snaps to multiples of 64 (stage 1 is half size) — `resolveResolution` in core.

## LLM
`web/ltx25/prompts_ltx25.js` (system prompts) and the Write / Refine logic in `ui_prompt_edit_ltx25.js` (`buildWriteRequest`, `parsePlan`, `applyPlan`, `doRefine`):
Write returns JSON `{global, clips:[{prompt, segments:[{end, prompt}]}]}`, Apply turns each clip into text segments; Refine rewrites one segment.

## Server routes used (`/ltx25_one/*`, same as `/minimax_h3_one/*` for the generic ones)
config, models, node_availability, videos/gallery/meta/save_meta/delete/rename/copy_to_input, prompt_sets (own folder `prompt_sets_ltx25`), llm/write_brief,
llm/custom_write_brief, `/tj_studio_one/llm/enhance` (accepts `system_override`), stitch, thumb, media_info, video_info, pick_chain_frame.

## Continue
Last Frame Chain: clip N+1's first frame = clip N's last frame (an image segment at 0); a finished chained run is stitched with 1 frame (1/24 s) trimmed.

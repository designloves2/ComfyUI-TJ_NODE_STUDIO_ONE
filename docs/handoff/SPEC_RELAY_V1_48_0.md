# SPEC v1.48.0 — for the web twin and Canvers (node repo ComfyUI-TJ_NODE_STUDIO_ONE, tag v1.48.0)

Source of truth: this file + the node code it names. Grep the node, do not guess. Port exactly (labels, keys, order, texts).
Change since v1.47.0: commit 289780c and the release commit after it.

## 1. Postprocess -> C. Upscale -> "Latent Upscale (Use H3)": Split mode (long clips)

A long clip is cut into pieces, each piece is upscaled on its own queue turn (VRAM is freed between turns), then the pieces are joined into one clip. It works for both upscalers (H3 Latent Upscaler and H3 Kimchy Up Scaler).

### UI (node: `web/one_node_minimax_h3.js`, `ppH3SplitControls`, `ltxSplitControls`, the h3lat panel under "Activation chunk rows")
- Checkbox **"Split mode (long clips)"**, tooltip: `Cut a long clip into pieces of the length you set, upscale each piece on its own queue turn, then join them with ffmpeg into one clip.` The controls below it only show / hide with the checkbox (no panel rebuild, the scroll position must not move).
- Controls (the same widget the LTX 2.5 Upscale Split mode uses, with its own state keys):
  - label **"Split mode"** + a `❔` with the title `Splitting a long clip into pieces: each piece is upscaled on its own queue turn (VRAM freed between turns), then ffmpeg joins them. The pieces tile the source exactly, so no frames are repeated; the sound is cut from the source the same way.`
  - select **By seconds** / **By count**
  - number field: By seconds = "Seconds per piece (0 = whole clip)" (integer, default 5, min 0); By count = "Piece count (1 = whole clip)" (integer, default 2, min 1)
  - hint line (bold, brand colour): by count `N piece(s) → ~X.Xs each      Total : Y.Ys clip` (`1 = whole clip, one pass` when N <= 1, `N piece(s) — pick a source to see the length` without a source); by seconds `Ss per piece → K piece(s)      Total : Y.Ys clip` (`0 = whole clip, one pass`, `Ss per piece — pick a source to see the piece count`); K = max(1, round(duration / S)).
- State keys (must be in the saved-state whitelist, or they are dropped on reload): `ppH3Split` (bool, false), `ppH3SegMode` ("seconds"|"count", "seconds"), `ppH3SegSeconds` (5), `ppH3SegCount` (2). They are separate from the LTX keys `ltxSegmentMode / ltxSegmentSeconds / ltxSegmentCount`.
- Only for a full run (Generate), never for Preview.

### Piece plan (node: `h3SegmentPasses(rs, total, fps)` — copy the algorithm exactly)
`total` = the source's frame count, `fps` = its rate. An H3 piece is 17k+5 frames long, which rarely divides a clip, so each piece starts `overlap` frames before the previous one ends and the join trims that stretch off the later piece (as One-Take does). No frame of the clip is lost.
```
segMode = rs.ppH3SegMode === "count" ? "count" : "seconds"
sSec = max(0, Number(rs.ppH3SegSeconds) || 0);  segCount = max(1, round(Number(rs.ppH3SegCount) || 1))
maxPieces = max(1, floor((total - 5) / 22))          // every piece needs one 17-frame block + 5
nPieces = 1
if count:  nPieces = min(segCount, maxPieces)
else if sSec > 0:  nPieces = min(maxPieces, max(1, round(total / max(22, sSec * fps))))
if nPieces < 2 -> one normal run (no split)
blocks = max(nPieces, ceil((total - 5*nPieces) / 17))
while ((17*blocks + 5*nPieces - total) % (nPieces - 1)) blocks++
overlap = (17*blocks + 5*nPieces - total) / (nPieces - 1)        // frames, a whole number
skip = 0; for k in 0..nPieces-1:
    cap = 17 * (floor(blocks / nPieces) + (k < blocks % nPieces ? 1 : 0)) + 5
    pass k = { window: { skip, cap }, suffix: "_seg" + two-digit k };  skip += cap - overlap
```
Checked for totals 124..1000 and 2..7 pieces: pieces cover the clip exactly, every cap is 17k+5, overlap is 0..40 frames. Example: 124 frames, 2 pieces -> windows [0,73] and [68,56], overlap 5.

### Run (node: `runPostprocess`, `ppRunSegments`, `resolveInFlightSegment`)
- The prompt is written once for the whole clip and used for every piece. The seed is chosen once and used for every piece.
- Per piece: the same Latent Upscale graph as a single run, with the source loaded with `skip_first_frames = window.skip` and `frame_load_cap = window.cap`, and the H3 `frames` input = `window.cap`; the output prefix gets the piece suffix. Kimchy piece progress and the H3 last step both read the sampler node `MM:hr_sampler`.
- Status text: `Postprocess: H3 segment i/N (frames a–b)`, then `… — P%`; reconnect text `Postprocess: reconnecting to segment i/N after the reload…`; joining text `Postprocess: joining N segments with ffmpeg…`. Bar: `barBase + (100 - barBase) * (i + v/m) / N`.
- Recovery after a reload: the run record `_ppRelay = { v: 2, seg: true, kind: "h3", overlapSec: overlap / fps, args, passes, parts: [], curPromptId, info, startedAt }` is saved after every piece; on reload the finished pieces are kept, the piece that was in flight is reattached (or re-queued when ComfyUI has no record of it). `kind` is "ltx" for the LTX split.
- Join: `stitch(parts, prefix, trim_seconds = null, overlap_seconds = overlapSec, override_audio = { filename: <source file>, subfolder: "", type: "input", start: skipFirstFrames / fps })`. **The sound of the joined clip is the source's own sound** (not the pieces' sound): joining the pieces' sound leaves a few ms of AAC padding at every join (measured: 22 ms after 1 join, 30 ms after 2). Then delete the pieces, then finish like a single run (show the result, write the meta: `postProcess`, `postSource`, `postUpscale`, `postPrompt`, `hires {startW, startH, scale}`; never `hiresFinish`).
- LTX Split mode is unchanged (its pieces continue from the previous piece's last frame; `kind: "ltx"`).

### Node test (real run, H3 Kimchy Up Scaler, Final MP 2.0, source 736x1344, 294 frames, 12.2 s)
| run | time | frames | sound vs source |
|---|---|---|---|
| no split | 14 min | 294 | identical |
| 2 pieces (skip, cap) = (0,158) (154,141), overlap 4 (the source reported 295 frames) | ~12 min | 295 (before the sound fix) | 22 ms late after the join |
| 3 pieces | ~17 min | 295 | 15 ms more per join |
| 2 pieces, with the source sound | - | **294** | **identical everywhere** |
Join frames looked clean in all runs (frame-to-frame difference at the joins inside the normal range).

## 2. Joined clips must play on an iPhone (the stitch re-encode)
Joined clips made by a re-encode were H.264 **High level 6.2 at 24.08 fps** and did not play on an iPhone (the gallery showed a play triangle with a slash); clips that are stream-copied (Main, level 3.2) and single clips played fine. Cause: ffmpeg concat/trim output with odd timestamps; libx264 then wrote level 6.2, which iOS refuses.
Node fix (`nodes.py`, `_X264_IOS`, the stitch handler): every re-encode now uses
`-fps_mode cfr -r <the first clip's r_frame_rate> -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -profile:v high -level 5.1 -c:a aac -movflags +faststart` (the plain stream-copy concat is unchanged). Result checked with ffprobe: High, level 5.1, 24/1.
Web / Canvers: if you call the node's stitch route you already get it. If you cut, trim or join video with your own ffmpeg (web has `libx264` in `src/tools/minimax_h3/graphBuilder.ts` and `src/tools/ltx25/graphBuilder.ts`; check every place that re-encodes, and VHS_VideoCombine formats), make sure the output is yuv420p, constant frame rate, H.264 profile high / main with level <= 5.1, and keeps `+faststart`. Report what you found; do not skip silently.

## 3. Already done on the web: the Final MP scroll jump in the Postprocess H3 panel (v0.14.2). Canvers: not applicable (cards).

## Rules
Do NOT edit the node repo. Test in a real browser run (short, the 16 GB GPU is shared; never reboot ComfyUI while a job runs; delete throwaway outputs). Send the control tower ONE report: per item ported / not applicable / not verified, files changed, anything to look at. If this spec and the node code disagree, ask first.

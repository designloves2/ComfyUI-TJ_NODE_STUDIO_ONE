# H3 "7+1 hi-res finish" — web port spec (node commit `7d258f8`)

Port exactly. The node source is the truth: `git show 7d258f8` in
`C:\AI\ComfyUI-Easy-Install\ComfyUI\custom_nodes\ComfyUI-TJ_NODE_STUDIO_ONE` (7 files, +~200 lines).
No server/route change. No new setting file. Web needs the same 7 files' changes.

## What it is
Only with Turbo = "Turbo LoRA (Basic)" (turboMode `pdd`). 8-step turbo schedule is cut in two:
stage 1 = first 7 steps at **Start MP**; the video latent is upscaled; stage 2 = the last 1 step at **Final MP**.
Works for Text, First/Last, Reference (files and library), Audio Lock, One-Take, Last Frame Chain, FlashVSR/RTX/model upscale.

## 1. core_minimax.js
- `hiresActive(state, avail)` = `!!state.hiresFinish && effectiveTurbo(state, avail).mode === "pdd"`.
- `hiresSizes(state)` -> `{ start, final, scale }`:
  `start = resolveResolution(state.aspect, state.hiresStartMp ?? 0.5)`,
  `final = resolveResolution(state.aspect, state.hiresFinalMp ?? state.megapixels)`,
  `scale = round(final.width / start.width * 1000) / 1000` (display only).
- `effectiveSteps`: first line after `const t = ...`: `if (t === "pdd" && hiresActive(state, avail)) return 8;`
- state defaults (next to `megapixels`): `hiresFinish: !!saved.hiresFinish`, `hiresStartMp: saved.hiresStartMp ?? 0.5`,
  `hiresFinalMp: saved.hiresFinalMp ?? saved.megapixels ?? 1.0`.

## 2. presets_minimax.js
Append to `RECIPE_KEYS`: `"hiresFinish", "hiresStartMp", "hiresFinalMp"` (saved user presets carry them;
NOT a matching axis — `axesOf`/`matchPreset`/built-ins untouched).

## 3. graph_builder_minimax.js
- Import `hiresActive, hiresSizes` from core.
- New ids in `N`: `hrSplit "MM:hr_split_sigmas"`, `hrSep "MM:hr_separate"`, `hrUp "MM:hr_latent_upscale"`,
  `hrCat "MM:hr_concat"`, `hrLock "MM:hr_audio_lock"`, `hrShift "MM:hr_sigma_shift"`, `hrPdd "MM:hr_turbo_lora"`,
  `hrMem "MM:hr_h3_mem"`, `hrSparse "MM:hr_block_sparse"`, `hrGuider "MM:hr_guider"`, `hrSampler "MM:hr_sampler"`,
  `hrCond "MM:hr_cond"`, `hrLora(i) => "MM:hr_lora"+i`.
- `buildConditioning(..., avail, key = N.cond)`: the three `g[N.cond] =` writes become `g[key] =`.
- `saveOneTakeCheckpoint(g, state, avail, checkpointName, latent = [N.sampler, 0])` (the `latent` input uses the param).
- New `buildHiresStage(g, state, avail, hires, condLink, lowSigmas, lockAudio)` (read it in the node file, copy verbatim):
  throws `7+1 hi-res finish needs <node> — install it, or switch 7+1 off.` if any of
  `MinimaxH3LatentUpscaler3D`, `H3MemoryOptimization`, `BlockSparseAttention` is missing from `avail`.
  Stage 2 = `LTXVSeparateAVLatent(av_latent=[N.sampler,1])` -> `MinimaxH3LatentUpscaler3D`
  (`mode:"target dimensions"`, `mode.width/height` = final size, `align:32`, `enable_temporal_chunking:true`,
  `force_unload:true`, `device:"cuda"`, `precision:"fp16"`, model `minimax_h3_latent_upscaler_3d_bf16.safetensors`)
  -> `LTXVConcatAVLatent` -> (Audio Lock: a second `TJ_H3_AudioLock` = copy of `g[N.audioLock].inputs` with `av_latent` replaced)
  -> model chain from `[N.unet,0]`: user LoRAs (`hrLora`) -> `LoraLoaderModelOnly` turbo (`pddFileForMode`, `pddLoraStrength`)
  -> `MiniMaxH3SigmaShift(12,3)` -> `H3MemoryOptimization` (fused_qkv auto, preserve_precision true, embedding_memory_mode Auto,
  mlp_memory auto, chunk_rows 2048, precision_mode "Preserve native", qkv_streaming_mode Forced,
  kitchen_v_memory_mode "Lower VRAM (slower)") -> `BlockSparseAttention` (selection "sol-attn", selection.tau 1.3,
  start_percent 0.2, end_percent 1, dense_blocks "", min_tokens 12288, extra_tokens 256,
  sink_conditioning "exact_kv_and_rows", verbose false) -> `BasicGuider(model, condLink)`
  -> `SamplerCustomAdvanced(noise=[N.noise,0], sampler=[N.sampSel,0], sigmas=lowSigmas, latent_image=...)`. Returns `[N.hrSampler,0]`.
- `buildClipGraph`:
  `const hires = hiresActive(state, avail) ? hiresSizes(state) : null;`
  `const { width, height } = hires ? hires.start : resolveResolution(...)`; `outW/outH` = final (or same as width/height).
  After `buildConditioning(...)`: `condOpts` object; `hrCond = hires && (mode==="reference" || (mode==="firstlast" && (firstFrame||lastFrame||state.assetRef?.first||state.assetRef?.last)))`;
  if `hrCond`, call `buildConditioning(g, state, fullPrompt, outW, outH, frames, condOpts, avail, N.hrCond)`
  (keyframe/reference images are encoded at canvas size inside the conditioning; without this stage 2 fails with
  "shape mismatch [780,96] vs [1932,96]" in H3MemoryOptimization).
  `TJ_FreeTextEncoderVRAM` trigger = `hrCond ? [N.hrCond,0] : cond`; `hrCondLink` = free output when `hrCond`, and the
  stage-1 guider keeps the plain cond; without `hrCond` both links are the free output (unchanged behaviour).
  Sigmas: `SplitSigmas(sigmas=[N.sched,0], step:7)` -> stage-1 sampler uses output 0, stage 2 uses output 1.
  `saveOneTakeCheckpoint(..., hires ? [N.sampler,1] : [N.sampler,0])`  (One-Take continues from the stage-1 x0, low-res).
  `finalSamples = hires ? buildHiresStage(...) : [N.sampler,0]`; both decodes read `finalSamples`.
  RTX target uses `outW, outH`. Returned meta: `width: outW, height: outH`, plus `hires: hires ? {startW, startH, scale} : null`.
  With 7+1 OFF the graph is byte-identical to before (verified by diffing JSON).

## 4. api_minimax.js + nodes.py (the availability list exists TWICE)
Add `"BlockSparseAttention"` right after `"MinimaxH3LatentUpscaler3D"` in both lists, else the UI says "not installed".
Web: add it to whatever the equivalent list is (proxy/availability route) and restart.

## 5. one_node_minimax_h3.js (UI)
- Import `hiresActive, hiresSizes`.
- Canvas "Megapixels" field: `disabled`, opacity 0.4, title `7+1 hi-res finish is on — set Start / Final MP in the Turbo section.` while `hiresActive`.
- Turbo LoRA (Basic) block (`turboMode === "pdd"`): `const hiresOn = hiresActive(state, ctx.availability)`;
  the "steps" field shows 8 and is disabled while on. After the steps/strength row add:
  checkbox `7+1 hi-res finish` (title "Run 7 of the 8 steps small, scale the latent up, then run the last step at full size."),
  on change: `state.hiresFinish = v; if (v) state.hiresFinalMp = state.megapixels ?? 1.0; persist(); renderLeft(); refreshPlan();`;
  note text `Needs the 8-step turbo LoRA above. Steps are fixed at 8 (7 small + 1 large).` (10px muted);
  when on: row of two number fields `Start MP` (default 0.5) and `Final MP` (default 1.0), step 0.1, min 0.1, and a size line
  `${start.w}×${start.h} → ${final.w}×${final.h} (×${scale})`.
  The two MP fields must NOT call `renderLeft()` (a rebuild resets the scroll to the top): they only `persist()`,
  update the size line's `textContent`, and `refreshPlan()`.
- `metaForVideo`: `w/h` = `hiresSizes(st).final` when `hiresActive`; add `hiresFinish`, `hiresStartMp`, `hiresFinalMp`.
- Run loop: `ran` spread adds `hires: ran.hires || null`; `if (ran?.upscale || ran?.hires) await reconcileGeometry(...)`.
- Progress: `progressNodes = [NODE_IDS.sampler, ...(hiresOn ? [NODE_IDS.hrSampler] : []), ...(fvsrOn ? [NODE_IDS.fvsr] : [])]`
  (now always an array); in `onClipProgress` first branch: `if (nodeId === NODE_IDS.hrSampler) hiresBanner.style.display = "flex";`.
- `hiresBanner`: same layer/pattern as `fvsrBanner`, text **`Upscaling & refining detail…`**, color `#ff9ec7`,
  18px bold, glow `rgba(255,158,199,0.5)`; appended to `previewBox` after `fvsrBanner`; every place that hides `fvsrBanner`
  also hides `hiresBanner` (5 places). Live preview frames come from stage 1 only (7 steps); stage 2 has no preview node.
- Reuse Setting: `state.hiresFinish = !!meta.hiresFinish; hiresStartMp/hiresFinalMp restored when present` (next to megapixels).

## 6. ui_gallery_minimax.js
`const HIRES_COLOR = "#ffb3d1"`; clip card border: `2px` solid HIRES_COLOR when `v.meta?.hires` and not picked and not `is_full`
(order: picked → BRAND, is_full → STITCH_COLOR, hires → HIRES_COLOR, else C.border).

## Addendum: Activation chunk rows (stage 2)
Third field under Start MP / Final MP: **Activation chunk rows** (number, step 256, min 256, default 2048) = the stage-2
`H3MemoryOptimization.chunk_rows` (was fixed 2048).
- core: state default `hiresChunkRows: saved.hiresChunkRows ?? 2048`.
- presets: `"hiresChunkRows"` appended to `RECIPE_KEYS` (after `"hiresFinalMp"`).
- graph: `chunk_rows: Math.round(state.hiresChunkRows ?? 2048)` in the `N.hrMem` node.
- UI (shown only while 7+1 is on): `col([label("Activation chunk rows"), numberField(state.hiresChunkRows ?? 2048, v => { state.hiresChunkRows = Math.max(256, Math.round(v)); persist(); }, 256)])`
  placed right after the Start MP / Final MP row and before the size line. No `renderLeft()` (same scroll rule).
- meta: `hiresChunkRows: st.hiresChunkRows` next to `hiresStartMp/hiresFinalMp` in `metaForVideo`; Reuse Setting:
  `if (meta.hiresChunkRows != null) state.hiresChunkRows = meta.hiresChunkRows;`.

## Verified on the node (real renders, 124 frames, Start 0.4 / Final 1.0 -> 736×1344)
Text, First/Last (real first+last images), Reference (2 images), One-Take 2 clips (seam clean), meta recorded, pink border shown.
NOT verified: overlay text visually during a run, Audio Lock, Last Frame Chain, FlashVSR/RTX with 7+1, library (TJ_H3Reference) clips with 7+1.

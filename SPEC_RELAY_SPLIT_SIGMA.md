# SPEC — H3 "7+1 hi-res finish" -> "Split Sigma" + editable split step + upscale banner

Relayed with the user's approval ("사용자가 승인했습니다."). Read the node code named below; grep it, do not guess. Port exactly (labels, keys, order, texts). Node files: `web/minimax/core_minimax.js`, `graph_builder_minimax.js`, `presets_minimax.js`, `ui_app_settings_minimax.js`, `web/one_node_minimax_h3.js`.

## 1. Rename (visible texts only; the state key `hiresFinish` stays, saved files keep working)
- Checkbox `7+1 hi-res finish` -> `Split Sigma`; its title -> `Run the first steps small, scale the latent up, then run the remaining steps at full size.`
- Note under it -> `Needs an 8-step turbo: the Turbo LoRA above, or Turbo None with an 8-step checkpoint. Steps are fixed at 8: the Split Sigma step runs small, the rest at full size (7 is recommended).`
- Megapixels field title while on -> `Split Sigma is on — set Start / Final MP in the Turbo section.`
- `Settings → Models → 7+1 last step` -> `Settings → Models → Split Sigma last step` (two places in the node UI); Settings label `UNET · 7+1 last step (used when Turbo → 7+1 → Last step model is Fixed)` -> `UNET · Split Sigma last step (used when Turbo → Split Sigma → Last step model is Fixed)`.
- Errors: `7+1 hi-res finish needs ${n} — install it, or switch 7+1 off.` -> `Split Sigma needs ${n} — install it, or switch Split Sigma off.`; `7+1 H3 Kimchy Up Scaler needs…` -> `Split Sigma H3 Kimchy Up Scaler needs…`; `7+1 last step is set to a fixed model…` -> `Split Sigma last step is set to a fixed model…`; the broadcast-shape hint in `core_minimax.js`: `…last step of Split Sigma, …` and `under Turbo → Split Sigma and run again.`

## 2. Editable split step (H3 Latent Upscaler only)
- State default `hiresSplitStep: saved.hiresSplitStep ?? 7` (next to `hiresChunkRows`).
- `core_minimax.js` `hiresSplitStep(state)`: `hiresUpscaler === "kimchy"` -> 7; else `Math.min(7, Math.max(1, Math.round(Number(state.hiresSplitStep ?? 7))))` (non-finite -> 7).
- Graph (`graph_builder_minimax.js`, clip graph): `SplitSigmas.inputs.step = hiresSplitStep(state)` instead of 7. Stage 1 = the first N steps at Start MP, stage 2 = the other 8-N steps at Final MP (it already reads the second half of the split). **Postprocess -> Latent Upscale (Use H3) keeps `step: 7`** (its own `SplitSigmas`, left unchanged).
- `presets_minimax.js`: `"hiresSplitStep"` appended to `RECIPE_KEYS` after `"hiresChunkRows"`.
- UI (only while Split Sigma is on and the upscaler is not Kimchy): number field label `Split Sigma step (1–7, 7 recommended)`, value `hiresSplitStep(state)`, step 1, on change `state.hiresSplitStep = Math.min(7, Math.max(1, Math.round(v))); persist(); hiresLine.textContent = hiresText(); refreshPlan();` (no `renderLeft()`: a rebuild resets the scroll). Placed after the Upscaler switch and before the `Bypass H3 Memory Optimization on the last step` checkbox.
- Size line: `${startW}×${startH} → ${finalW}×${finalH} (×${scale}) · ${k} small + ${8 - k} full step${8 - k > 1 ? "s" : ""}` with `k = hiresSplitStep(state)`.
- Clip metadata (`metaForVideo`): `hiresSplitStep: st.hiresSplitStep` next to `hiresChunkRows`; Reuse Setting: `if (meta.hiresSplitStep != null) state.hiresSplitStep = meta.hiresSplitStep;`.

## 3. "Upscaling in progress..." banner
- The banner already existed (`hiresBanner`, shown only when the last-step sampler `NODE_IDS.hrSampler` reported progress), so the latent upscale before it showed nothing.
- Text `Upscaling in progress...`, colour `#ffd84a`, `fontSize: "24px"`, bold, glow `rgba(255,216,74,0.5)`, same layer as before (absolute, inset 0, centred, `background: rgba(0,0,0,0.6)`).
- `onClipProgress` (per clip, in the run loop): in the branch for the first-stage sampler (any node that is neither `hrSampler` nor the FlashVSR node) set `hiresBanner.style.display = hiresOn && m > 0 && v >= m ? "flex" : "none"` (before `setStepProgress`). So it appears the moment stage 1 finishes its last step and stays through the latent upscale and the last step (the `hrSampler` branch keeps it on); it is hidden at clip end by the existing places.

## Rules
Do NOT edit the node repo. One short report per session: ported / not applicable / not verified, files changed.

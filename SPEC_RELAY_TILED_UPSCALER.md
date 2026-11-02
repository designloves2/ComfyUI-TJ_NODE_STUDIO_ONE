# SPEC — Kimchy upscaler -> "H3 Latent Upscale Tiled (TJ)" (own fork)

Status: node repo done (commits 26a1b6f, 59f0607 and the rename commit after them). Relay only with the user's approval ("사용자가 승인했습니다."). Read the node code named below; grep it, do not guess. Port exactly.

## 1. Server pack (ComfyUI side)
- New pack: https://github.com/designloves2/H3-Latent-Upscale-Tiled-TJ- (modified copy of ComfyUI-Kimchy-Minimax-H3-Suite, Apache-2.0, original author credited in its README/NOTICE). It replaces the AI-KIMCHY pack for this feature; fixes `Expected all tensors to be on the same device, but got mat1 is on cpu` above about 2.5 MP.
- Node id `KimchyH3ZeroSplitMP` -> `TJLatentUpscaleTiledMP` (inputs unchanged). Availability list entry in the web equivalent of `nodes.py:3476` / `web/minimax/api_minimax.js:61`.

## 2. Texts (grep `Kimchy` in your H3 code and replace)
- Label `H3 Kimchy Up Scaler` -> `H3 Latent Upscale Tiled (TJ)` (capsule B, warn line, Final MP errors, `7+1 ... needs` errors).
- `Neural (Kimchy's trained upscaler)` -> `Neural (trained upscaler)`.
- Missing-pack error: `... needs the H3-Latent-Upscale-Tiled-TJ- pack — install it (github.com/designloves2/H3-Latent-Upscale-Tiled-TJ-), or pick H3 Latent Upscaler.`
- Hint `Kimchy runs the upscale and the last step in one node ...` -> `The Tiled node runs the upscale and the last step in one node (Sol-Attn is not used). Final MP must be 1.0 – 8.5.`
- Progress text `Postprocess: Kimchy tile i/n` -> `Postprocess: Tiled upscale tile i/n`.
- Installer REPOS entry: `https://github.com/designloves2/H3-Latent-Upscale-Tiled-TJ-`.

## 3. State / identifiers renamed (word-for-word in the node: `core_minimax.js`, `graph_builder_minimax.js`, `one_node_minimax_h3.js`, `presets_minimax.js`)
- Value `"kimchy"` -> `"tiled"` for `hiresUpscaler` and `ppH3Upscaler`.
- Keys `hiresKimStartMp`, `hiresKimFinalMp`, `ppH3KimFinalMp` -> `hiresTiledStartMp`, `hiresTiledFinalMp`, `ppH3TiledFinalMp` (also in presets RECIPE_KEYS and clip metadata).
- `kimchyTileCount` -> `tiledTileCount`; node id `MM:hr_kimchy_upscale` -> `MM:hr_tiled_upscale`; `N.hrKim` -> `N.hrTiled`; locals `kim*` -> `tiled*`.
- **Migration (keep old saved data working):** state load accepts `"kimchy"` OR `"tiled"` and maps to `"tiled"`; old keys are read as fallback (`saved.hiresTiledStartMp ?? saved.hiresKimStartMp ?? 0.5`, same for Final and `ppH3KimFinalMp`); Reuse Setting reads `meta.hiresTiledStartMp ?? meta.hiresKimStartMp` and maps `meta.hiresUpscaler`; preset apply (`presets_minimax.js` end of apply function) maps old value and old keys.

## Rules
Do NOT edit the node repo. One short report per session: ported / not applicable / not verified, files changed.

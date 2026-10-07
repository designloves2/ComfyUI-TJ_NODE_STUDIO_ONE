# H3 Asset Library — web port spec (node commits `5e0197a^..281f78d`)

**Rule from the user: copy the node UI as closely as possible. The ONLY allowed change on web is the layout
(sizes/columns/heights) so it fits a 16:9 monitor. Same labels, same order, same behavior, same strings.**
No redesign, no extra features, no omissions.

Source of truth (read it, do not rewrite from this summary):
`cd C:\AI\ComfyUI-Easy-Install\ComfyUI\custom_nodes\ComfyUI-TJ_NODE_STUDIO_ONE && git diff 5e0197a^ 281f78d -- web nodes.py`
(16 files, +1579/-27). Contract with the library server: `SPEC_MINIMAX_H3_ASSET_DB.md` (same repo).
7+1 (`7d258f8`) is already ported; this port touches the same files, so re-grep before editing.

## 0. Server side (no new web server code)
- The library lives in **ComfyUI-TJ_NODE** (REST `/tj_node/reflib/*`, root `ComfyUI-TJ_NODE/assetDB`). STUDIO_ONE and web
  never touch that folder on disk, only the REST.
- Web must reach it: add the `/tj_node` prefix to `vite.config.ts` dev-proxy list (next to `/tj_shared`, `/minimax_h3_one` …)
  and to whatever the tunnel/prod routing uses. (Missing proxy entry was the root of an earlier "models none" bug.)
- Nodes `TJ_H3Reference`, `TJ_H3ImageToVideo` ship with TJ_NODE: add to the optional-node availability list
  (node did it in `api_minimax.js` AND `nodes.py`; web: `api.ts` list). Without it the graph builder must not emit them.

## 1. Shared modules — port each file 1:1 (`web/shared/`, 9 files)
`reflib_api.js` (REST client: info, list, detail, projects, project, saveProject, deleteProject, resolve, waveform, update,
remove, upload, replace, thumbUrl, fileUrl, memberThumbUrl, `reflibError`, `CATEGORIES`),
`reflib_dom.js` (el/btn/fieldStyle), `reflib_browser.js` (`mountAssetBrowser({height})` -> `{el, reload, stop}`; Assets and
Projects sub-tabs, LEFT_W 190, card slider 4/3/2 per row, audio trim editor, cut overlay, Register menu),
`reflib_gallery_import.js` (`openGalleryImport`: tabs INPUT/OUTPUT/Krea2/…/MinimaxH3, H3 Videos, MusicMaker playlist),
`reflib_picker.js` (`openAssetPicker`, `openProjectPicker`, order badges, limit check),
`reflib_refpanel.js` (`mountLibraryRefs`, `sourceToggle`, `emptyAssetRef`, `assetRefActive`, `formatReport`),
`reflib_llm.js` (`libraryRefFor`, `libraryContext`; token = `@${a.mention || a.alias || a.id}`),
`reflib_at.js` (`attachAtComplete`: `@` autocomplete with small thumbnail per row, identical to the TJ_NODE list),
`reflib_limits.js` (`loadLimits`, `currentLimits`, `countKinds`, `limitWarning`: 9 images / 3 videos / 3 audio, limits from
`/info`; a set counts as 1 video or N images).
Web equivalents of node helpers: node `C` colors/`el` from core -> web's own; gallery image URLs on the tunnel need the
existing blob/`sameOriginSrc` pattern (canvas) — only where a canvas is used.

## 2. State (core)
- `normalizeAssetRef(r)` -> `{project, ids[max 15], first, last}` or null (copy exactly).
- global state: `assetRef: normalizeAssetRef(saved.assetRef)`, `refSource: saved.refSource === "library" ? "library" : "files"`.
- per prompt: `assetRef: normalizeAssetRef(p?.assetRef)`, `refSource: p?.refSource === "library" ? "library" : "files"`;
  new prompt defaults `assetRef: null, refSource: "files"`.
- `clipAssets(state, i)` returns `assetRef` too (clip's own when override on, else the node's) — the single resolver.
- render loop: `clipState.assetRef = assets.assetRef ? { ...assets.assetRef, first: continued ? null : assets.assetRef.first } : null`.
- clip meta (`metaForVideo`): `assetRef: st.assetRef ? {...st.assetRef, ids: [...]} : null`;
  Reuse Setting: `state.assetRef = normalizeAssetRef(meta.assetRef); state.refSource = state.assetRef ? "library" : "files"`.

## 3. Graph builder (`buildConditioning`)
- Reference with `assetRef.project` or `ids`: node `TJ_H3Reference` (same 4 outputs usage as before): inputs clip, vae, audio_vae,
  prompt, width, height, length, `ref_image_size: state.refImageSize || "match"`, `match_check: "warn"`;
  project -> `mode:"project", project:String(id)`; ids -> `mode:"assets", asset_count:n, asset_1..asset_n` (max 15, strings).
  Writes `g[N.cond]` and returns (file slots unused).
- First/Last: `first_asset` / `last_asset` (string ids) replace the file frame; class `TJ_H3ImageToVideo` when either exists,
  else `MiniMaxH3ImageToVideo`. With 7+1: the existing `hrCond` branch already covers `assetRef.first/last` and Reference —
  the library Reference case must also build the stage-2 cond via the same `key` argument (node does: same
  `buildConditioning(... N.hrCond)` call, so `TJ_H3Reference` is emitted at the final size too).

## 4. UI (copy; only 16:9 layout tuning)
- `one_node_minimax_h3.js`: **Asset** tab = FIRST pill, before "Text to Video" (`{key:"assets", label:"Asset", enabled:true,
  hint:"Reference asset library"}`); it is a view (`assetView`), not a generation mode; `state.generationMode` is untouched;
  `mountAssetBrowser({height: RIGHT_H})` in `assetRow` hidden while generating; `setAssetView(on)` toggles `mainRow`/`assetRow`,
  calls `reload()` / `stop()`. Images accordion summary shows `Asset Library` when `assetRefActive(state.assetRef, mode)`.
- `ui_images_minimax.js`: `libraryBlock(libMode, note)`; First/Last: `libraryBlock("firstlast", "A library frame replaces that file slot.")`;
  Reference: `sourceToggle` (labels **Files / Gallery** | **Asset Library**), `types = useLib ? {} : (state.refTypes || {images:true})`,
  library note `Assets or a project from the Asset tab; their order is the <Picture i> / <Video k> / <Audio j> order.`;
  switching to Files sets `state.assetRef = null`.
- `ui_prompt_edit_minimax.js`: per-clip override block with the same source switch (own `p.refSource/p.assetRef` when override is on,
  else the node's; the switch is ALWAYS shown), notes `This clip only: assets or a project from the Asset tab.` /
  `Common: assets or a project from the Asset tab.`, `getPrompt: () => editor.value`, Load check button; media row only when
  `own && !useLib`; enabling override copies the node's `refSource/assetRef` into the prompt;
  `libraryContextForClip()` (4 s memo) feeds `attachAtComplete(editor, …)`; `buildUserPrompt(base, imageSummary, lib)` and
  `buildRefineUserPrompt(..., lib)` replace the numbered-tag manifest with the `@token` list (exact rule strings are in the diff);
  `attachedImages()` returns [] for library clips (no vision pass); errors `Library references: <error>`;
  Include Images with only library refs is allowed.

## 5. Known limits (same as node; do not "fix" on web)
Library assets get no vision pass (described by name/category/tags/note); Asset tab has audio trim only (no video trim, no
with-audio); First/Last has no `@` tokens (TJ_H3ImageToVideo passes the prompt through).

## 6. Verified on the node
Browse/register/replace/save/delete/trim/projects/gallery import, library refs per node and per clip, builder output, one real
render (0.2 MP, 124 f) with a library Reference clip, `@` list + Load check, limits (logic tested, not by real clicks).
NOT rendered: project clips and First/Last asset clips.

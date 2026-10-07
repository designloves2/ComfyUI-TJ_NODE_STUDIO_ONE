# SPEC — MiniMax H3 Asset DB (reference library)

> **Status: DRAFT v2 — the working reference for both sessions (TJ_NODE and STUDIO_ONE).**
> Joint effort of two repos: ComfyUI-TJ_NODE (library + REST + canvas nodes) and
> ComfyUI-TJ_NODE_STUDIO_ONE (all screens, graph builder, migration). The web twin
> (AI_One_Studio) mirrors the finished UI afterwards.
> v2 replaces v1 (REF_ASSET / `TJ_RefAsset` / `ref_1…ref_15` link slots) and v0 (loaders first);
> see section 7. Nothing is committed. TJ_NODE implements from this file; **STUDIO_ONE writes no
> code in this repo before the user says so.**

## 0. Why

Reference images / videos / audio are stored today as **bare filenames in ComfyUI's input
folder** (node state, `prompt_sets/*.json`, output sidecars). If a file is deleted or renamed the
reference is gone ("ghost" tiles) and old queue settings cannot be reused. The goal is
**reference-asset management, not speed**: register an asset once into a managed library and
reference it by a stable ID everywhere.

## 1. User decisions

- Categories: character / background / prop / music / voice / video / etc., one level of
  sub-category.
- Registering **copies** the file into a library folder split by category (never one flat
  folder). The DB (SQLite) stores the path **relative to the library root**. No link mode.
- A **project** = a saved set of reference assets; choosing a project loads all of them at once.
- The core `MiniMaxH3ReferenceToVideo` split slots (images 1–9 / videos 1–3 / audio 1–3) are **not
  used**: "references → prompt → reference/prompt matching check → H3 encoding" happens in **one
  node**, and assets are recognised automatically regardless of kind.
- UI is a DOM widget inside the H3 node (ONE STUDIO style), not a separate window; the user
  delivers the UI design themselves.
- TJ_NODE = library + SQLite + REST + canvas nodes with plain widgets (no screens); everything must
  be composable in ordinary workflows without any UI. STUDIO_ONE = every screen + graph builder.
- Contract between the repos = REST API + node interface only (no internal imports).

## 2. Contract (owned by TJ_NODE — v2 as last received, may change; they will tell us)

### 2.1 Library
Root folder = a setting (default outside both git repos, `input/`, `output/`; exact default is the
user's call). Layout `<root>/<category>/<sub>/<ID>_<name>.<ext>`, `_thumbs/<category>/<ID>.jpg`,
`index.sqlite`. Same-file detection by sha256.

Data: **asset** {id, kind image|video|audio (auto-detected), category, subcategory, name, rel_path,
sha256, size, width/height, duration, sample_rate, tags, note, created/updated, **default
settings**: mp, start, end, with_audio, set_mode, frames_per_image, fit}; **set**: an ordered group
of images of one person / place from several angles (video mode: `frames_per_image` default 12 per
image, sent as one `<Video k>`; images mode: each its own `<Picture i>`; frame size unified by
`fit` pad | crop); **project** {id, name, note} with **project_item** {asset_id, alias (unique in
the project; a name made only of digits is forbidden), order}. References are always IDs; renaming
an alias never breaks stored projects or clip metadata. A project cannot be saved above the core
limits (images 9, videos 3, video sounds 3, standalone audio 3).

### 2.2 REST `/tj_node/reflib/…`
Local-access guard, JSON, failures `{ok:false, code, detail}`: category / tag lists + filtered
listing; register (upload + server-local import) / edit (incl. default settings) / move between
categories (file moves, atomic) / delete (shows projects using it); thumbnails (image, video poster,
audio icon / waveform); media streaming (hover preview); `GET …/preview/<id>?max_mp=1&fmt=jpeg`
(image ≤ 1 MP JPEG, video poster, audio waveform image); project CRUD; set create / order edit;
**resolve** (project or asset list → asset ids, aliases, kinds, final `<Picture i>/<Video k>/<Audio j>`
labels, and the same match-check result as node output [3]); missing / hash-mismatch check; bundle
export/import. The exact list is fixed after the UI design arrives.

### 2.3 Canvas nodes (class_type proposals — final after user approval)
1. **`TJ_RefAssetRegister`** — IMAGE (batch ok) / AUDIO + category / subcategory / name → asset id
   (STRING). With `as_set=true` every batch frame is registered as an image asset and a set is made.
2. **`TJ_H3Reference`** — all-in-one; calls the core `MiniMaxH3ReferenceToVideo` internally.
   Inputs: clip, vae?, audio_vae?, prompt, width, height, length, ref_image_size, `mode`
   (project | assets), `project` (combo), `asset_count` (INT 1–15), `asset_1 … asset_15` (combos;
   only `asset_count` of them are shown), `overrides` (STRING JSON, optional / hidden),
   `match_check` (off | warn | strict), + TJ wireless Set/Get. Outputs **[0] positive CONDITIONING,
   [1] LATENT** (same order/types as the core node), **[2] snapshot STRING** (JSON: project id,
   asset ids with in/out/mp, final label mapping), **[3] report STRING** (match-check result).
3. **`TJ_RefProjectSave`** — create a project without any UI (asset ids + aliases → project id); the
   UI uses REST instead.
Removed: `TJ_RefAsset`, the `REF_ASSET` type, the `ref_1…ref_15` link slots, `TJ_RefProject`, and
the individual loaders (later, low priority, for other models).

### 2.4 Modes and widget value convention
- **project mode:** pick a project in `project` → all of its assets are loaded. The node's **Load**
  button shows the project's properties (asset id, alias, kind, final labels) in a read-only info
  box inside the node (resolve REST), so the user can write the prompt against it.
- **assets mode:** like a LoRA loader — set `asset_count` and that many `asset_N` combos appear,
  each chosen from the library list.
- The two modes are never mixed. "Use only some of a project's assets" = use that clip in assets
  mode (a per-clip override clip = assets mode).
- `project` and `asset_N` are combos but `VALIDATE_INPUTS(**kwargs)` accepts any string (the same
  pattern TJ nodes already use for `get_name`). Value format: `"<id>"` or `"<id>: <name>
  [category]"`; only the leading numeric id is read, so **the builder sets just `"12"`**. All
  `asset_1…15` are declared in `INPUT_TYPES`, so setting any count through the API prompt is never
  rejected (showing/hiding is front-end only).

### 2.5 Prompt tokens and rules
- `@12` (= `@id:12`) points at an asset by id; `@alias` is allowed; `@@` is the escape. An alias
  must not be digits only (no clash with ids). Text without `@` passes through unchanged
  (idempotent).
- Tokens become the final `<Picture i>/<Video k>/<Audio j>` following the core order: images →
  videos (a video's `<Audio j>` directly before its `<Video k>`) → standalone audio, numbered per
  kind from 1, regardless of token order. A literal `<Picture N>` typed by the user is left alone;
  the match check reports it when out of range. Only assets that are attached go to the core.
- **Match check** (`match_check` off | warn | strict): unknown alias / over the limit / out-of-range
  literal label = error; an attached asset the prompt never mentions = warning (still sent). Result in
  output [3] and in the resolve REST so the UI shows the same.
- Per-asset settings (mp, start/end, with_audio, set_mode, frames_per_image, fit) are **stored as the
  asset's defaults in the library** (set at register / edit time). A per-clip change is the
  `overrides` JSON: `{"items": {"<id>": {"mp":1.0,"start":0,"end":5,"with_audio":true,
  "set_mode":"video","frames_per_image":12,"fit":"pad"}}}` (seconds; `end` 0 = to the end; `mp` 0 = no
  resize). Precedence: `overrides.items` → library defaults. *(Whether the canvas needs per-slot
  settings is being asked of the user; a settings field per slot may be added.)*
- Sets in video mode use the core's sampling (video references are sampled at 2 fps = every 12
  frames, cut to the generation length, n % 17 == 5 rule); quality is checked first with a real-model
  A/B (images vs video bundle).
- Errors are raised with the code in front of the message (`ASSET_MISSING: asset_id=12 …`,
  `HASH_MISMATCH`, `UNKNOWN_ALIAS`, `LIMIT_EXCEEDED`, kind mismatch); nothing silently loads empty.
  Asset hashes and widget values are part of `IS_CHANGED`. Project + assets above the limits →
  `LIMIT_EXCEEDED`; duplicate alias → error.

### 2.6 Confirmed details (TJ_NODE, after v2)
- **`overrides`** apply by asset id in both modes. Precedence: library default → project-item
  default → `overrides.items`. An id in `overrides` that is not actually attached → **warning**
  (`OVERRIDE_NOT_ATTACHED`), not an error.
- **Report** (node output [3] and the resolve REST) is a JSON string:
  `{ "ok": bool, "errors": [{"code","asset_id"|null,"token"|null,"message"}], "warnings":
  [{"code","asset_id","message"}] (codes e.g. UNUSED_ASSET, OVERRIDE_NOT_ATTACHED), "attached":
  [{"id","alias","kind":"image|video|audio|set","name","label":"<Picture 1>","source":"project|slot",
  "settings":{…resolved…}}], "limits": {"image":{"used","max"},"video":{…},"video_audio":{…},
  "audio":{…}}, "resolved_prompt": "…" }`. Error codes: UNKNOWN_ALIAS, ASSET_MISSING,
  HASH_MISMATCH, LIMIT_EXCEEDED, …
- **`match_check`:** `off` — errors/warnings are still filled but never block; `warn` — warnings
  logged/reported, run continues; `strict` — any error stops the run (exception, code in front of
  the message).
- **Resolve REST:** `POST /tj_node/reflib/resolve`, request `{ "mode": "project|assets",
  "project": "12", "assets": ["5","8"], "prompt": "…", "overrides": {…} }` (project mode ignores
  `assets`, assets mode ignores `project`); response `{ "ok": true, …same fields as the report
  (errors, warnings, attached, limits, resolved_prompt) }`. It calls the same function as the node,
  so results always match. HTTP error bodies `{ok:false, code, detail}` are only for server /
  permission failures; matching problems are HTTP 200 with the errors inside the report. Both the
  node's Load-button info box and the STUDIO_ONE prompt check use this one endpoint.
- The rest of the REST list is fixed after the UI design arrives. TJ_NODE starts phase 1 after the
  user compresses their session and will tell us when it starts and when any name changes.

### 2.7 Phase-1 status and deviations from v2 (TJ_NODE; code written, NOT yet run on the live server)
Package `nodes/reflib` in ComfyUI-TJ_NODE (library.py SQLite, resolve.py, routes.py, nodes.py) +
`web/reflib_tj.js`; nodes `TJ_RefAssetRegister`, `TJ_RefProjectSave`, `TJ_H3Reference` (category
"Reference"). Differences from the text above:
1. **Projects are in phase 1, for IMAGES** (REST, project mode, Load button, ProjectSave) because the
   user must see project mode. Audio / video / sets stay in later phases; attaching a non-image
   raises `UNSUPPORTED_KIND`.
2. **Extra codes.** Errors: `NOT_ATTACHED` (an `@id` that is not attached), `LABEL_OUT_OF_RANGE`,
   `OVERRIDES_INVALID`, `BAD_MODE`, `PROJECT_NOT_FOUND`, `UNSUPPORTED_KIND`. Warning:
   `DUPLICATE_ASSET`. With `match_check=off`, `ASSET_MISSING` / `HASH_MISMATCH` /
   `PROJECT_NOT_FOUND` / `BAD_MODE` still block (the asset cannot load); everything else obeys
   `match_check`.
3. The **Load button / info box works in both modes** (shows the resolve result for the current
   slots or project) and refreshes after each run from the node's report.
4. `TJ_RefAssetRegister` has outputs `(asset_ids, items)`; `items` = lines `12=alias` that feed
   `TJ_RefProjectSave` directly. **An alias must not start with a digit** (stricter than "digits
   only") so `@2nd` never clashes with ids. `@` tokens match the longest known alias prefix, so
   `@hero가` works.
5. `mp` only scales **down** (never up). Combo values stay `"<id>"` or `"<id>: name [category]"`;
   `VALIDATE_INPUTS` accepts any string.
6. The report has extra fields: `mode`, `project {id,name}`, and per attached asset `category`,
   `audio_label`.
7. REST built so far, all under `/tj_node/reflib`: GET `info`; POST `settings`; GET `assets`; GET
   `assets/{id}`; POST `assets` (multipart: file + category, subcategory, name, tags, note); POST
   `assets/{id}/update`; POST `assets/{id}/delete`; GET `thumb|file|preview/{id}`; GET/POST
   `projects`; GET `projects/{id}`; POST `projects/{id}/delete`; POST `resolve`; GET `check`. Local
   guard = same as PromptDB (loopback + same-origin) — **not verified behind the Cloudflare
   tunnel**; STUDIO_ONE's web twin must be tested through it (see 3.6).
8. **Library root:** superseded, see 2.9 item 4 (`ComfyUI-TJ_NODE/assetDB`).

### 2.8 Final phase-1 status (TJ_NODE, 2026-10-06; VERIFIED on the live server with real H3 models, uncommitted)
Verified: register image/audio/video via nodes → project → `TJ_H3Reference` (project + assets mode;
image, video-with-soundtrack, standalone audio) → 8-step render; example workflow also run from the
real canvas. Examples in the user's Workflows panel: `TJ_RefLib_01_Register_assets`,
`02_Project_save`, `03_H3Reference_project_mode`, `04_H3Reference_assets_mode`. Guide:
`REFERENCE_LIBRARY.md` (TJ_NODE repo). Changes vs 2.7 (2.7 items 1 and 7 are superseded):
1. **Sets are done**: kind `set` (ordered image members). `set_mode` "video" = ONE `<Video k>`
   (`frames_per_image` each, padded with the last image to n%17==5 so no image is cut); "images" =
   separate `<Picture i>`. Token `@<set id>` → `<Video k>` or `<Picture a> <Picture b>`. Report
   `attached[]` has `members` for sets. A/B with a descriptive prompt: both keep identity/scene;
   video packing ~14% slower.
2. `TJ_RefAssetRegister` has optional inputs `image`/`audio`/`video` (+ `as_set`, `set_mode`);
   video/audio assets keep their soundtrack per `with_audio` (the video file's own audio track).
3. `TJ_H3Reference` widget `encode_cache` (BOOLEAN, default true): VAE encodes cached under
   `<root>/_cache`; report `encode_cache:{hits,misses}`. Measured 25.9 s → 12.1 s (image+video+audio).
   Qwen path not cached.
4. Extra REST: POST `sets` {name,category,subcategory,image_ids,settings}; POST `assets/import`
   {path,category,subcategory,name} (only files inside ComfyUI input/output/temp); GET
   `bundle/export?project=<id>&assets=1,2` (zip); POST `bundle/import` (multipart file → `{assets:{old:new},
   projects, duplicates}`); POST `cache/clear`; GET `check`. Thumb/preview work for image, video
   poster, audio waveform, set (first member).
5. **REST guard**: loopback with no Origin, or Origin host == Host header → accepted (tunnel hostname
   as both Host and Origin → 200; cloudflared connects from 127.0.0.1). A different Origin (e.g.
   `https://studio.tjtj.cloud` with Host 127.0.0.1:8188) → **403**. Opt-in allow-list in
   `<ComfyUI user dir>/tj_reflib.json` `{"allowed_origins":[...]}`, default EMPTY. The server already
   runs `--enable-cors-header https://studio.tjtj.cloud`, but it was NOT added to the allow-list —
   user's security decision. The loopback check does not protect against tunnel users (they look
   local), same as PromptDB; the user decides whether write/delete routes need more.
   **Web twin consequence:** if the web app calls the API cross-origin it needs that allow-list
   entry; same-origin through the tunnel works.
6. (superseded) default library root: see 2.9 item 4.
Nothing for STUDIO_ONE to code until the user sends the UI design.

### 2.9 Later changes (TJ_NODE, 2026-10-07) — supersede §2.4 combo values and 2.8 item 6
1. **Combo value format changed.** Asset = `"<category>/<subcategory>/<name> [id:<n>]"` (subcategory
   omitted when empty), e.g. `character/demo/Hero [id:1]`; project = `"<name> [id:<n>]"`. The `/` lets
   rgthree-style menus nest by folder. Reader `library.parse_id` takes a trailing `[id:N]`, else the
   leading digits — so our builder may still write just `"12"`, and old `"12: Hero [character]"` works.
   No change needed on our side.
2. `TJ_RefProjectSave` picks already-registered assets via `asset_count` + `asset_1..15` combos +
   `alias_1..15` (plus old `items` text and Register's `prev_items` chaining); its output `project_id`
   can link into `TJ_H3Reference.project_id` (overrides the project combo, orders execution after save).
3. `TJ_H3Reference` new switches: `compress_refs` (default off; halves width/height of image/video
   reference latents = 1/4 tokens; 241 s → 131 s at 512x320, length 73) and `encode_cache` (default on).
   Report adds `ref_tokens:{before,after}` when compress is on.
4. **Library root: `custom_nodes/ComfyUI-TJ_NODE/assetDB`** (fixed by TJ_NODE 2bb638b; user decision: STUDIO_ONE is
   installed by `git clone`, so it must not hold an `assetDB` folder, and it cannot run without TJ_NODE). STUDIO_ONE never
   reads or writes the library on disk, only through `/tj_node/reflib/*`; if a path is ever needed, use `root` from
   `GET /tj_node/reflib/info`.
5. JS widgets "category filter" (not serialized) and Load/Refresh buttons exist only for the plain-widget
   front end.

### 2.10 Asset Browser node + REST additions (TJ_NODE, 2026-10-07)
1. New plain-DOM node `TJ_RefAssetBrowser` ("Reference Asset Browser (TJ)", `web/reflib_browser_tj.js`):
   categories | asset thumbnails | viewer (image/video/audio preview; edit name/category/subcategory/
   tags/note/mp) with Replace / Save / Delete, search, "+ register" upload. Our final UI may reuse the endpoints.
2. POST `assets/{id}/replace` (multipart file): keeps id, name, category, settings, project links;
   errors `KIND_MISMATCH` / `BAD_MEDIA` / `DUPLICATE_FILE`; recomputes set hashes, drops the thumbnail.
3. GET `assets/{id}` returns `{asset, projects}` (projects using it).
4. POST `assets/{id}/delete {force}`: `ASSET_IN_USE` if a project or set uses it, unless `force`
   (removes it from projects; set members are never force-deleted).
5. Register node: `as_set`/`set_mode` apply only to the image input (widgets hidden otherwise).
Nothing to change on our side.

### 2.11 FL2VA node `TJ_H3ImageToVideo` (TJ_NODE, committed 595cd82)
Display "MiniMax H3 Image to Video (TJ)", category " ✨ TJ_Node/Reference"; wraps core
`MiniMaxH3ImageToVideo` (t2va / fl2va). Deliberately simpler than `TJ_H3Reference`: **no project/assets
mode, no match_check, no @alias tokens, no report/snapshot output**; the prompt passes through unchanged.
- Required: `clip`, `vae`, `prompt`, `width`, `height`, `length` (same ranges/defaults as core).
- Optional: `first_asset` / `last_asset` (combos of IMAGE assets only, default "(none)", value
  `<category>/<sub>/<name> [id:N]`; any string accepted so the builder may write just `"12"`);
  `first_frame` / `last_frame` (IMAGE links; a linked image wins over the asset); `encode_cache`
  (default true); TJ wireless `get_name` / `auto_set` / `setnode_name` (auto names: positive, latent).
- Outputs: `[0]` positive CONDITIONING, `[1]` latent LATENT (same as core).
- Errors (plain "CODE: message"): `UNSUPPORTED_KIND` (not an image), `ASSET_MISSING`, `HASH_MISMATCH`.
  Library default `mp` applies. `IS_CHANGED` folds both assets' sha256. Geometry as core: first = stretch
  to canvas, last = cover-crop. No new REST (uses `GET assets?kind=image`, `thumb/{id}`).
- Verified live (512x320, length 73, fl2va + dmd 8-step LoRA).
- **Builder plan:** emit `TJ_H3ImageToVideo` with `first_asset`/`last_asset = "<id>"` and the same
  clip/vae/prompt/width/height/length wiring as the core node. @ tokens/report for first/last would need a
  thin resolve wrapper from TJ_NODE — ask only if the user wants it.
- Separate: TJ_NODE is building `TJ_CustomLLM` ("LLM (TJ)": GGUF / TextGenerate / OpenRouter / Connect
  Custom + system-prompt presets), local, uncommitted.

### 2.12 Audio/video trim in the Asset Browser (TJ_NODE, 2026-10-07; local, uncommitted)
Trim = the asset's default `settings.start` / `settings.end` (seconds, end 0 = to the end); already in
§2.5 and applied by the H3 nodes (audio `load_audio(start,end)`, video `load_video(start,end)` + its
soundtrack over the same range). Per-clip override stays `overrides {"items":{"<id>":{"start":1.2,"end":4.5}}}`.
No node/contract change. New REST: GET `waveform/{id}?bins=600` (audio only) → `{ok, duration, peaks:[0..1]}`
(`BAD_KIND` otherwise). Save via POST `assets/{id}/update` `{"settings":{"start","end"}}` (video also
`mp`, `with_audio`). TJ_NODE UI (reference for our screen, `web/reflib_browser_tj.js`): waveform canvas
with in/out handles (drag, drag the lit range, click to jump nearest handle, double-click reset), in/out
number fields synced both ways, "▶ range" playback with playhead, compact audio player, video in/out +
"with audio" checkbox; cards of trimmed assets show a range bar and "✂ in–out s" tag. Asset JSON carries
`duration`, `sample_rate`, `has_audio`, `settings.start/end`.
**STUDIO_ONE TODO (not started):** the Asset tab viewer should get the same trim controls for audio/video.
Also pending at TJ_NODE: `TJ_CustomLLM` ("LLM (TJ)") node, routes `/tj_node/custom_llm/connect|status|presets`.

### 2.13 Name mentions (TJ_NODE, 2026-10-07; local, uncommitted)
In assets mode (and for project items without an alias) an asset can be written by its library NAME,
case-insensitive (`@Hero`, `@room`), when the name is a valid alias (letters/digits/underscore, not
starting with a digit), unique among the attached assets and not equal to an explicit alias; else
`@<id>`. Explicit project aliases keep priority; `@12`, `@id:12`, `@@` unchanged; unknown tokens give
`UNKNOWN_ALIAS`. `resolve` report `attached[].mention` = the token to write (alias, else usable name,
else null = use the id). Verified by TJ_NODE: tokens vs hand-typed `<Picture i>` labels vs hand-wired
core node give pixel-identical frames. **STUDIO_ONE:** the `@` list and the LLM token list use
`attached[].mention` (`web/shared/reflib_llm.js`).

## 3. STUDIO_ONE side

### 3.0 Decision (user, 2026-10-07): plan B + shared module
Asset DB is **integrated into H3 One Studio** (no separate Asset One Studio node). The asset library
screen (list / thumbnails / categories / register / projects) is built as a **shared module under
`web/shared/`** (like `custom_llm_controls.js`) so a standalone node (plan A) can reuse it later and
the web twin can mirror it 1:1. Backend = TJ_NODE's REST + `TJ_H3Reference` as is.
**Status: preparation only. UI is waiting for the user's design; no code yet.**
Integration points found (prep survey, nothing changed): Reference-mode state/UI live in
`web/minimax/core_minimax.js` (~26 refs), `ui_images_minimax.js` (18), `ui_prompt_edit_minimax.js` (22),
`one_node_minimax_h3.js` (34), graph wiring in `graph_builder_minimax.js` (28, `buildConditioning`).
Planned module split (proposal): `web/shared/reflib_api.js` (REST client + error-code mapping),
`web/shared/reflib_picker.js` (browse/select UI), later `reflib_manage.js` (register/edit/replace/delete,
mirrors TJ_NODE's Asset Browser). Web mirror after the node is verified.

### 3.0b User's UI direction (2026-10-07) and implementation plan (DRAFT, no code yet)
Direction: (1) new **Asset tab** in the H3 One Studio tab menu showing the asset-browser UI; (2) FL2VA
and REF2VA can load assets via "Load from Asset" or by **Project**; (3) prompts use the **@ syntax**;
(4) LLM Write/Refine produce @-style prompts when the references come from assets/project.
Stages (each ends with a node-side check and a commit; web mirror after stage 5):
- **S0 contract freeze**: confirm with TJ_NODE the final REST + error codes + `TJ_H3Reference` widget
  names (done in 2.7–2.10); add CORS/origin allow-list decision.
- **S1 shared client** `web/shared/reflib_api.js`: list/detail/thumb/file/preview URLs, resolve, projects,
  errors → readable text. No UI.
- **S2 Asset tab (browse only)** `web/shared/reflib_browser.js` + tab registration in the H3 shell
  (tab menu location to be located in `one_node_minimax_h3.js`): categories | thumbnails (hover play,
  Load more with `galleryPageSize`) | viewer; then manage (register/edit/replace/delete/sets/projects)
  mirroring TJ_NODE's Asset Browser. Reuse `gallery_more.js`.
  **Register menu (the "+ Add ▾" button in the Asset tab, same five entries as TJ_NODE's Asset Browser):**
  1. *Single Image* — one image file (`.png,.jpg,.jpeg,.webp,.bmp,.gif,.tif,.tiff`);
  2. *Images as a set (2-10)* — 2..10 images registered one by one, then one set via `POST /tj_node/reflib/sets`
     `{name:"<first file>_set", category, image_ids:[…]}`; fewer than 2 or more than 10 registers nothing
     (`A set needs 2-10 images (N selected)`), and if any image fails no set is made;
  3. *Video* — `.mp4,.webm,.mov,.mkv,.avi,.m4v`; 4. *Audio* — `.wav,.mp3,.flac,.ogg,.m4a,.aac,.opus`;
  5. *From Gallery* — `openGalleryImport(onDone, { maxImages: 10, singleVideoAudio: true })`
     (`web/shared/reflib_gallery_import.js`: the image / video / audio gallery pickers' own features — per-tile hide
     toggle, 👁 Show, ⚡ Cache, INPUT/OUTPUT video tabs, audio ▶ preview, folder refresh — and *Register as set*).
  A file with the wrong extension is refused (`x.png: not a video file`). TJ_NODE's Asset Browser calls the same
  `openGalleryImport` through `/extensions/ComfyUI-TJ_NODE_STUDIO_ONE/shared/reflib_gallery_import.js`.
- **S3 pick-from-asset**: shared picker `reflib_picker.js` (single/multi, kind filter) opened from the
  FL2VA first/last slots and REF2VA image/video/audio slots (`ui_clip_media_slots.js`, `ui_images_minimax.js`)
  via a new "From Asset" button next to the existing file/gallery pickers; project picker sets
  `assetProjectId` for the clip/global. State: slot item becomes `{asset:<id>}` instead of a filename.
  Prompt-Edit per-clip override (`ui_prompt_edit_minimax.js`) gets the same.
- **S4 graph builder**: when a clip uses assets/project, emit only `TJ_H3Reference` (3.2); FL2VA needs a
  decision (TJ_H3Reference is the Reference node — FL keeps LoadImage until TJ_NODE offers an FL
  equivalent or the user wants assets resolved to input files). Meta: `assetProjectId`, `assetSnapshot`;
  Reuse Setting restores them.
- **S5 @ prompts + LLM**: `@alias` / `@<set id>` autocomplete in the prompt box (typing `@` opens a
  list from the attached slots / project); client resolve via REST before sending to the LLM;
  Write/Refine/Include Images system prompts get the alias→label list and keep `@` tokens in the output.
- **S6 migration + web mirror + docs/version** (§4).
User answers (2026-10-07): (a) FL2VA uses `TJ_H3ImageToVideo` (2.11), so S4 FL clips emit it with
`first_asset`/`last_asset`; (b) **filename-based and asset-based references both stay supported**;
(c) **Asset tab goes FIRST in the tab menu, before Text to Video**; (d) project/asset loading is added
to the **existing per-clip "load images for this clip only" feature** (the per-clip override in
`ui_prompt_edit_minimax.js` / `ui_clip_media_slots.js`): each clip can pick assets or a project there.
No separate node-wide project selector is planned unless the user asks (the node-wide reference slots
keep the same "From Asset" button from S3). FL2VA @ tokens: not wanted yet (ask TJ_NODE only if the
user says so).

### 3.1 UI
A DOM widget inside the H3 node; **waiting for the user's design** (this section is filled in from
it). The user will design the UI **after seeing TJ_NODE's phase-1 implementation** (the way the
nodes really behave decides how the screen can be drawn), so the design will take a while and the
STUDIO_ONE UI / graph-builder work starts only after that. From the API it needs: category/tag listing, thumbnails, hover-preview streaming, pick-an-asset
data, project CRUD, set creation + order editing, resolve (with the match-check report), missing
check. Reuse the pattern of the existing gallery pickers (hover play, Load more with the user's page
size). The in-node "project properties" box of 2.4 is the same data the UI shows via resolve.

### 3.2 Graph builder (`web/minimax/graph_builder_minimax.js`, `buildConditioning`, Reference mode)
Today (L604-667): `LoadImage` → optional `ImageScaleToTotalPixels` → `ref_images.ref_image_<i>`;
`VHS_LoadVideo` (24 fps, start/end → `skip_first_frames` / `frame_load_cap`) →
`ref_videos.ref_video_<i>` and its AUDIO → `ref_video_audios.ref_video_audio_<i>` unless
`withAudio === false`; `LoadAudio` (+ `TrimAudioDuration`) → `ref_audios.ref_audio_<i>`; the core node
is `N.cond`; downstream only uses `[N.cond,0]` (positive) and `[N.cond,1]` (av latent).

Proposed, when the node uses the library: emit **only `TJ_H3Reference`** — no core node, loaders,
resize or `TJ_RefAsset` — wired with `clip [N.clip,0]`, `vae [N.vaeV,0]`, `audio_vae [N.vaeA,0]`,
`prompt`, `width`, `height`, `length`, `ref_image_size`, `match_check`, plus:
- **project clip:** `mode = "project"`, `project = "<id>"`;
- **per-clip override clip:** `mode = "assets"`, `asset_count = N`, `asset_1 … asset_N = "<id>"` (+
  `overrides` JSON when a value differs from the library default).
`N.cond` is re-pointed to `TJ_H3Reference`; `[0]`/`[1]` keep the core order, so downstream wires are
unchanged. `[2]` → clip meta `assetSnapshot`; `[3]` → shown in the UI. Without the library the
current wiring is untouched.

### 3.3 State and metadata (names are proposals)
`assetProjectId` (state) and, per prompt, an asset id list (assets mode) with optional per-clip
settings. Clip meta: `assetProjectId`, `assetSnapshot`. **Reuse Setting** restores the project /
asset ids + snapshot; an asset that no longer exists is shown as missing and the rest is kept.

### 3.4 LLM flows
Prompt Write / Refine / Include Images: the client resolves `@` tokens **first** (resolve REST) and
sends the resolved prompt + an alias→label name list to the LLM. Vision for library assets: the
client fetches `…/preview/<id>?max_mp=1&fmt=jpeg` and sends base64 to the existing vision routes.

### 3.5 Other places that hold references today
Image Generator / Character Sheet (`imgRef*`), First/Last frames, Audio Lock file, LTX Upscale
source, Face Refine. Out of scope for v1 unless the user says otherwise (they keep `input/`
filenames).

### 3.6 Web twin
The library routes live on the shared server; the web app mirrors the finished node UI one to one
(layout proportions and the top menu bar may differ). **Risk to test before the web mirror:** the
PromptDB-style local guard (loopback + same-origin) may reject the web app's calls when they
arrive through the Cloudflare tunnel / from the web app's own origin; the web twin needs these
routes (thumbnails, file streaming, resolve) to work there.

## 4. Migration (filename → library → ID)

1. **Scan** (read-only dry run): collect every referenced filename from node state and
   `prompt_sets/*.json` (global + per-prompt override fields: `refImages`, `firstFrame`,
   `lastFrame`, `refVideos[].file`, `refAudios[].file`) and report which exist in `input/`.
2. **Register**: existing files are copied into the library (user picks category / sub-category,
   default `etc`; per-asset settings such as mp, start/end become the asset's defaults); sha256
   de-duplicates; nothing is moved or deleted in `input/`.
3. **Replace**: fields get the asset ID, the old filename stays as a fallback until the user
   confirms; before rewriting a prompt-set file a copy goes to `prompt_sets/_backup_<date>/`.
   Idempotent.
4. **Ghosts** (referenced but missing in `input/`): listed in the report, kept as "missing"
   placeholder assets (original filename + where used) that can be re-linked by registering a file;
   they never block loading a set.
5. Output sidecars (`metadata/*.json`) are history and are not rewritten.

## 5. Phases (TJ_NODE, after the user's go-ahead; none started)

1) library + Register (image) + `TJ_H3Reference` (images + match check), real-model end to end;
2) audio; 3) video + sets + A/B quality check; 4) projects (REST, `project` widget, ProjectSave);
5) bundle / missing check / migration. STUDIO_ONE's graph-builder and UI work follow the user's
UI design and are separate from these phases.

## 6. Open decisions / test plan

Open (user): (library root RESOLVED in 2.9: ComfyUI-TJ_NODE/assetDB); sharing the library with the image nodes' reference pickers; v1
scope beyond Reference mode; STUDIO_ONE implementation go-ahead; whether per-slot settings are
needed on the canvas; whether this file is committed. Open (between sessions): none for the node
contract right now (overrides semantics, report [3] format and the resolve REST are settled in 2.6).

**Acceptance:** an example workflow JSON (Register → `TJ_H3Reference` in project mode and in assets
mode → sampler → output), provided by TJ_NODE after approval, is actually loaded and run to the end
with the real model, and A/B compared with the same references wired by hand to the core node (same
seed / resolution). Also: resolve vs the core label order with mixed kinds and out-of-order tokens;
limits (10th image, 4th video, project + assets); match check (unknown alias, out-of-range literal,
unused attached asset → warning only); missing / hash-mismatch reach the UI; replacing an asset
invalidates the ComfyUI cache; the builder's output (project clip and per-clip assets clip) renders
like the hand-wired graph; Reuse restores project / ids + snapshot, also with a deleted asset;
migration idempotent and prompt sets restorable from backup; sets: images vs 12-frames-per-image
video bundle.

## 7. History

- v0: loaders first (`TJ_RefAssetImage/Audio/Video` feeding the unchanged core node) — withdrawn.
- v1: `TJ_RefAsset` + `REF_ASSET` + 15 link slots `ref_1…ref_15`, project attaches all of its assets,
  `project_mode` question — withdrawn by the user in favour of v2's two modes (project | assets)
  and combo widgets with `asset_count`.

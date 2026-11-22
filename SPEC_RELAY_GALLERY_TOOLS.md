# SPEC RELAY — Gallery tools (🧹 Tools): cleanup / folder merge / trash (node v1.56.0)

For the web twin (AI-ONE-STUDIO). Canvers: not applicable (user decision). **Server side is already done** in the node pack (`nodes.py` + `gallery_tools.py`, routes below) — the web app talks to the same ComfyUI, so it only needs the UI and a ComfyUI restart with node pack >= v1.56.0. Do not port `gallery_tools.py`.
Node verification: logic tested on throwaway folders (50 unit checks, live routes, popup in a browser); real galleries were not exercised.

## Server routes (all under `/tj_shared/gallery_tools/`)
All bodies JSON. `node_key` = the gallery's favorites key: `klein, zimage, krea2, qwen2511, qwen21, sdxl_one, anima, moss, minimax_h3, ltx25, music`. `folder` = the gallery's current output sub-folder (e.g. `one_minimax_h3`; never empty / output root). Errors: `{ok:false,error}`.
- `POST scan {node_key, folder}` → `{ok, report:{media, orphan_meta[], orphan_thumbs[], stale_thumbs[], missing_thumbs[], no_meta[], dead_favorites[], empty_dirs[], tmp_files[], bytes:{orphan_meta,orphan_thumbs,tmp_files}}}` (read only)
- `POST clean {node_key, folder, actions:{orphans,tmp,thumbs,force_thumbs,empty_dirs,favorites}}` → `{ok, result:{trashed, thumbs_built, thumbs_failed, dirs_removed, favorites_pruned, skipped_recent, batch}}`
- `GET folders?node_key=&folder=` → `{ok, folders:[{path, files}]}` — EVERY folder of output/ (depth <= 6, reserved folders excluded), `files` counts media below it.
- `POST merge_plan {node_key, dest, source}` (dry run) / `POST merge {node_key, dest, source}` → `{ok, plan:{moves[{from,to,renamed}], renames{from:to}, covers[], leftover[], metas_rewritten, refs_rewritten, thumbs_built, removed_source, favorites_renamed, batch}}`. `dest` = current gallery folder (kept, created if missing), `source` = any output folder merged INTO it; a clashing name becomes `<stem>_<source folder name><ext>`; every path in the metadata (sidecar, PNG chunk, other clips' metadata, favorites, blurred-media list) is rewritten; the emptied source folder is removed (kept if non-gallery files remain).
- `POST trash {action:"list"}` → `{batches:[{batch,label,created,count,size}]}`; `{action:"restore",batch}` → `{result:{restored,skipped[]}}`; `{action:"empty", batch?}` → `{removed}`. Trash lives in `<user dir>/tj_gallery_trash` (not under output/).

## UI to port (source: node `web/shared/gallery_tools.js`, plain DOM; copy structure, text and behaviour)
A `🧹 Tools` button in every gallery header, next to the existing `⚡ Cache` button (image galleries: Klein, Z-Image, Krea2, SDXL, Qwen 2511, Qwen 2.1, Anima, Moss, H3 image) or next to "Show" (H3 video, LTX video); Music: a `🧹` icon button next to the playlist refresh. Click → popup `Gallery tools — <folder>` with tabs:
1. **🧹 Cleanup** — auto `scan`; checkboxes (orphans / tmp / thumbs / empty_dirs / favorites, each disabled at 0, default on when > 0) + "Rebuild ALL thumbnails" (force_thumbs); `Run cleanup`, `↻ Rescan`; result line `✓ N moved to trash · N thumbnails built · N empty folders removed · N favorites pruned`. Shows a note when `no_meta` > 0 (kept, listed only).
2. **📁 Merge folder** — `📂 Choose folder…` opens a SEPARATE tree popup (output folder tree built from `folders`, ▸/▾ toggle, `N files` per row, filter box, current folder and its ancestors greyed out, double click = choose), then `Preview` (merge_plan: N files move, renames list (first 8), warning when `leftover`) and `Merge` (confirm, then merge; result line with counts, "source folder removed/kept").
3. **🗑 Trash** — batches with Restore / Delete, `Empty the whole trash`.
After any change call the gallery's own reload (`onChanged`). A tab that loads asynchronously must not paint over the tab now showing (token check).
Texts are English, same as the node.

## Release (web)
Web app, Windows desktop app (Tauri) and the Mac app are all built from the web repo: release the web + Windows builds as usual. For the Mac build write a handoff document committed to the web repo (what changed, the exact build/release steps the Mac session must run, version number, files to touch) so a Mac session can build and publish the Mac app immediately after the commit lands.

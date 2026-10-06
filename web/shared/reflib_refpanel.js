// reflib_refpanel.js — the "Library" block of the reference panels (node-wide, and per clip in
// Prompt Edit): shows which library assets / project this level uses and lets you change it.
//
// The value it edits is one small object, kept wherever the caller keeps it:
//   { project: id | null, ids: [asset ids], first: id | null, last: id | null }
//   Reference mode uses project OR ids; First/Last mode uses first / last.
// Empty = this level uses no library asset, and the file slots next to it work as before.
import { C } from "../minimax/core_minimax.js";
import { reflib } from "./reflib_api.js";
import { el, btn } from "./reflib_dom.js";
import { openAssetPicker, openProjectPicker } from "./reflib_picker.js";

export const emptyAssetRef = () => ({ project: null, ids: [], first: null, last: null });

/** Whether an assetRef actually points at something for this generation mode. */
export function assetRefActive(ref, mode) {
  if (!ref) return false;
  if (mode === "reference") return !!ref.project || (ref.ids || []).length > 0;
  if (mode === "firstlast") return !!ref.first || !!ref.last;
  return false;
}

// One shared list per second keeps several panels (node-wide + Prompt Edit) from each
// asking the server for the whole library.
let cache = { at: 0, promise: null };
function libraryIndex() {
  if (!cache.promise || Date.now() - cache.at > 3000) {
    cache = { at: Date.now(), promise: reflib.list().then(r => new Map((r.assets || []).map(a => [a.id, a]))) };
  }
  return cache.promise;
}

const small = { padding: "3px 8px", fontSize: "11px" };

/**
 * "Source: Files | Library" switch above a reference area. Exactly one of the two is shown, so
 * the file slots and the library block never sit on top of each other.
 * @param source   "files" | "library"
 * @param onChange (source) => void
 */
export function sourceToggle(source, onChange) {
  const pill = (key, text) => {
    const on = source === key;
    return btn(text, () => { if (!on) onChange(key); }, { ...small, borderRadius: "14px",
      background: on ? C.lime : C.bg2, color: on ? "#fff" : C.text, border: `1px solid ${on ? C.lime : C.border}`,
      fontWeight: on ? "700" : "400" });
  };
  return el("div", { style: { display: "flex", alignItems: "center", gap: "6px" } },
    el("span", { text: "Source", style: { fontSize: "10.5px", color: C.muted } }),
    pill("files", "Files"), pill("library", "Library"));
}

/**
 * @param mode     "reference" | "firstlast"
 * @param getRef   () => assetRef object (the caller's own, created if missing)
 * @param onChange (ref) => void   persist + refresh whatever depends on it
 */
export function mountLibraryRefs({ mode, getRef, onChange, note = "" }) {
  const root = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px", padding: "6px",
    border: `1px solid ${C.border}`, borderRadius: "8px", background: C.bg2 } });

  const thumb = (a, size) => el("img", { src: a ? reflib.thumbUrl(a) : "", style: { width: `${size}px`, height: `${size}px`,
    objectFit: "contain", background: "#000", borderRadius: "4px", flexShrink: "0" } });

  async function render() {
    const ref = getRef();
    const index = await libraryIndex();
    root.replaceChildren();
    root.append(el("div", { text: "Library (assets / project)", style: { fontWeight: "700", fontSize: "11px", color: C.text } }));
    if (note) root.append(el("div", { text: note, style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } }));

    const apply = (patch) => { Object.assign(ref, patch); onChange(ref); render(); };

    if (mode === "firstlast") {
      const slot = (label, key) => {
        const id = ref[key];
        const a = id ? index.get(id) : null;
        return el("div", { style: { display: "flex", alignItems: "center", gap: "6px" } },
          el("span", { text: label, style: { width: "40px", color: C.muted, fontSize: "11px" } }),
          id ? thumb(a, 36) : null,
          el("span", { text: id ? (a ? `#${a.id} ${a.name}` : `#${id} (missing asset)`) : "none", style: {
            flex: "1", minWidth: "0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "11px",
            color: id && !a ? C.err : C.text } }),
          btn("From Asset…", () => openAssetPicker({ title: `Pick the ${label.toLowerCase()} frame`, kinds: ["image"], multi: false,
            onPick: ids => apply({ [key]: ids[0] }) }), small),
          id ? btn("✕", () => apply({ [key]: null }), small) : null);
      };
      root.append(slot("First", "first"), slot("Last", "last"));
      return;
    }

    // Reference mode: a project, or an ordered list of assets
    let shown = [];
    let summary = "No library assets — the file slots below are used.";
    if (ref.project) {
      const pr = await reflib.project(ref.project);
      if (pr.ok) {
        shown = pr.project.items.map(i => ({ id: i.asset_id, alias: i.alias }));
        summary = `Project: ${pr.project.name} — ${shown.length} asset${shown.length === 1 ? "" : "s"}`;
      } else summary = `Project #${ref.project} not found`;
    } else if ((ref.ids || []).length) {
      shown = ref.ids.map(id => ({ id }));
      summary = `${shown.length} asset${shown.length === 1 ? "" : "s"} picked — the file slots below are ignored`;
    }
    root.append(el("div", { text: summary, style: { fontSize: "11px", color: shown.length ? C.ok : C.muted } }));
    if (shown.length) {
      root.append(el("div", { style: { display: "flex", flexWrap: "wrap", gap: "5px" } }, ...shown.map((it, i) => {
        const a = index.get(it.id);
        const cell = el("div", { title: a ? `#${a.id} ${a.name}${it.alias ? `  @${it.alias}` : ""}` : `#${it.id} (missing asset)`, style: {
          position: "relative", width: "58px", borderRadius: "6px", overflow: "hidden", border: `1px solid ${a ? C.border : C.err}`, background: "#000" } },
          thumb(a, 58),
          el("div", { text: it.alias ? `@${it.alias}` : `${i + 1}`, style: { position: "absolute", left: "2px", bottom: "2px", background: "rgba(0,0,0,0.7)",
            color: "#fff", borderRadius: "3px", padding: "0 4px", fontSize: "10px", maxWidth: "52px", overflow: "hidden", textOverflow: "ellipsis" } }));
        if (!ref.project) {
          const x = el("div", { text: "✕", style: { position: "absolute", top: "1px", right: "1px", background: "rgba(0,0,0,0.75)", color: "#fff",
            borderRadius: "3px", width: "14px", textAlign: "center", fontSize: "10px", cursor: "pointer" } });
          x.addEventListener("click", () => apply({ ids: ref.ids.filter(id => id !== it.id) }));
          cell.append(x);
        }
        return cell;
      })));
    }
    root.append(el("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
      btn("From Asset…", () => openAssetPicker({ title: "Pick reference assets", kinds: ["image", "video", "audio", "set"],
        multi: true, initial: ref.project ? [] : ref.ids || [], onPick: ids => apply({ ids, project: null }) }), small),
      btn("Project…", () => openProjectPicker({ onPick: (id) => apply({ project: id, ids: [] }) }), small),
      shown.length ? btn("Clear", () => apply({ project: null, ids: [] }), small) : null));
  }

  render();
  return { el: root, render };
}

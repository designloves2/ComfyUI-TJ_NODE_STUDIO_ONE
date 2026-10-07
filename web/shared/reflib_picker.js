// reflib_picker.js — pick reference assets (or a project) from the asset library for a clip or
// for the whole node. Same card look as the Asset tab; selection order is kept, because for
// Reference mode the order is the <Picture i> / <Video k> / <Audio j> numbering.
import { C } from "../minimax/core_minimax.js";
import { reflib, reflibError, CATEGORIES } from "./reflib_api.js";
import { el, btn, fieldStyle } from "./reflib_dom.js";
import { loadLimits, limitWarning } from "./reflib_limits.js";

function overlay(title, width) {
  const ov = el("div", { style: { position: "fixed", inset: "0", background: "rgba(0,0,0,0.75)", zIndex: "100000",
    display: "flex", alignItems: "center", justifyContent: "center" } });
  const box = el("div", { style: { background: C.bg1, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "12px",
    width: `min(${width}px, 96vw)`, height: "min(760px, 92vh)", minHeight: "0", boxShadow: "0 10px 40px rgba(0,0,0,0.6)",
    display: "flex", flexDirection: "column", gap: "10px", color: C.text, fontSize: "12px" } });
  const close = () => { document.removeEventListener("keydown", onKey); ov.remove(); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  ov.addEventListener("mousedown", (e) => { if (e.target === ov) close(); });
  box.append(el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" } },
    el("div", { text: title, style: { color: "#fff", fontSize: "14px", fontWeight: "700", flex: "1" } }),
    btn("✕", close, { background: "#c0392b", color: "#fff", border: "none", padding: "5px 10px" })));
  ov.append(box);
  document.body.append(ov);
  return { box, close };
}

const chip = (text, on, onClick) => btn(text, onClick, {
  fontSize: "11px", padding: "4px 10px", borderRadius: "14px",
  background: on ? C.lime : C.bg2, color: on ? "#fff" : C.text, border: `1px solid ${on ? C.lime : C.border}`,
  fontWeight: on ? "700" : "400" });

/**
 * Asset picker.
 * @param kinds    allowed asset kinds, e.g. ["image"] (First/Last) or ["image","video","audio","set"]
 * @param multi    several assets (ordered) or just one
 * @param initial  ids already chosen, shown pre-selected in their order
 * @param onPick   (ids: number[]) => void
 */
export function openAssetPicker({ title = "Pick from the asset library", kinds = null, multi = true, initial = [], onPick }) {
  const { box, close } = overlay(title, 1000);
  const S = { assets: [], category: "all", query: "", picked: [...initial] };

  const search = el("input", { type: "text", placeholder: "Search name / tag / ID", style: { ...fieldStyle, flex: "1" } });
  const chips = el("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap", flexShrink: "0" } });
  const grid = el("div", { style: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gridAutoRows: "min-content", gap: "8px",
    overflowY: "auto", flex: "1", minHeight: "0", alignContent: "start" } });
  const status = el("div", { style: { color: C.muted, fontSize: "11px", flexShrink: "0" } });
  const useBtn = btn("Use selected", () => { onPick(S.picked); close(); }, { background: C.lime, color: "#fff", border: "none", fontWeight: "700" });
  const clearBtn = btn("Clear", () => { S.picked = []; draw(); });
  const footer = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0",
    paddingTop: "8px", borderTop: `1px solid ${C.border}` } }, status, el("span", { style: { flex: "1" } }),
    ...(multi ? [clearBtn, useBtn] : []));
  box.append(el("div", { style: { display: "flex", gap: "6px", flexShrink: "0" } }, search), chips, grid, footer);

  const allowed = (a) => !kinds || kinds.includes(a.kind);
  // Reference clips take at most 9 images / 3 videos / 3 audio files (the same rule as the library node)
  const limited = multi && !!kinds && kinds.includes("video");
  loadLimits();

  function drawChips() {
    const cats = ["all", ...CATEGORIES];
    chips.replaceChildren(...cats.map(c => {
      const n = S.assets.filter(a => allowed(a) && (c === "all" || a.category === c)).length;
      return chip(`${c === "all" ? "All" : c} ${n}`, S.category === c, () => { S.category = c; draw(); });
    }));
  }

  function draw() {
    drawChips();
    grid.replaceChildren();
    for (const a of S.assets) {
      if (!allowed(a)) continue;
      if (S.category !== "all" && a.category !== S.category) continue;
      if (S.query && !`${a.name} ${(a.tags || []).join(" ")} ${a.id}`.toLowerCase().includes(S.query)) continue;
      const pos = S.picked.indexOf(a.id);
      const on = pos >= 0;
      const card = el("div", { title: `#${a.id} ${a.name}`, style: { position: "relative", cursor: "pointer", borderRadius: "8px",
        overflow: "hidden", background: C.bg2, border: `1px solid ${on ? C.lime : C.border}`, boxShadow: on ? `0 0 0 1px ${C.lime}` : "none" } },
        el("img", { src: reflib.thumbUrl(a), loading: "lazy", style: { width: "100%", aspectRatio: "1 / 1", objectFit: "contain", display: "block", background: "#000" } }),
        el("div", { text: a.kind, style: { position: "absolute", top: "3px", left: "3px", background: "rgba(0,0,0,0.65)", color: "#fff",
          borderRadius: "4px", padding: "0 5px", fontSize: "10px" } }),
        on && multi ? el("div", { text: String(pos + 1), style: { position: "absolute", top: "3px", right: "3px", background: C.lime, color: "#fff",
          borderRadius: "50%", width: "18px", height: "18px", textAlign: "center", lineHeight: "18px", fontSize: "11px", fontWeight: "700" } }) : null,
        el("div", { text: `#${a.id} ${a.name}`, style: { padding: "3px 6px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: "11px" } }));
      card.addEventListener("click", () => {
        if (!multi) { onPick([a.id]); close(); return; }
        if (!on && limited) {
          const warn = limitWarning(S.picked.map(id => S.assets.find(x => x.id === id)).filter(Boolean), a);
          if (warn) { draw(); status.textContent = warn; status.style.color = C.err; return; }
        }
        S.picked = on ? S.picked.filter(id => id !== a.id) : [...S.picked, a.id];
        draw();
      });
      grid.append(card);
    }
    if (!grid.children.length) grid.append(el("div", { text: "Nothing here. Register files in the Asset tab first.", style: { color: C.muted, padding: "6px" } }));
    status.style.color = C.muted;
    status.textContent = multi ? (S.picked.length ? `${S.picked.length} selected — the order you click is the <Picture i> / <Video k> / <Audio j> order` : "Click cards to select") : "Click a card to use it";
    useBtn.disabled = !S.picked.length; useBtn.style.opacity = S.picked.length ? "1" : "0.5";
  }

  search.addEventListener("input", () => { S.query = search.value.toLowerCase(); draw(); });
  reflib.list().then(r => {
    if (!r.ok) { status.textContent = `Asset library unavailable — ${reflibError(r)}`; return; }
    S.assets = r.assets || [];
    draw();
  });
}

/** Project picker: onPick(projectId, { id, name, items }) */
export function openProjectPicker({ title = "Pick a project", onPick }) {
  const { box, close } = overlay(title, 560);
  const list = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px", overflowY: "auto", flex: "1", minHeight: "0" } });
  const status = el("div", { style: { color: C.muted, fontSize: "11px", flexShrink: "0" } });
  box.append(list, status);
  reflib.projects().then(async (r) => {
    if (!r.ok) { status.textContent = `Asset library unavailable — ${reflibError(r)}`; return; }
    if (!r.projects.length) { status.textContent = "No projects yet. Make one in the Asset tab → Projects."; return; }
    for (const p of r.projects) {
      const row = el("div", { title: p.note || p.name, style: { display: "flex", justifyContent: "space-between", gap: "8px", padding: "9px 12px",
        background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "8px", cursor: "pointer" } },
        el("span", { text: p.name, style: { fontWeight: "700" } }),
        el("span", { text: `${p.item_count} asset${p.item_count === 1 ? "" : "s"}`, style: { color: C.muted } }));
      row.addEventListener("mouseenter", () => { row.style.borderColor = C.lime; });
      row.addEventListener("mouseleave", () => { row.style.borderColor = C.border; });
      row.addEventListener("click", () => { onPick(p.id, p); close(); });
      list.append(row);
    }
    status.textContent = "Click a project to attach every asset in it.";
  });
}

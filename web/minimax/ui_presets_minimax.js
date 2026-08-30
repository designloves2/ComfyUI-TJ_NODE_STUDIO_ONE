// ui_presets_minimax.js — save / rename / reorder / delete the user's own presets
//
// The six built-in presets stay read-only: they are the benchmark's conclusions and a
// user preset that shadowed one would quietly change what a shared preset number means.
// User entries sit above them in the dropdown and are stored server-side under
// `user_presets` in the node config, so they survive a browser reset.
//
// Two dialogs, both small and centred rather than full-screen overlays: naming a preset
// and managing the list are quick actions, and taking the whole node over for them would
// hide the settings the user is about to save.
import { C, BRAND, el } from "./core_minimax.js";
import { button } from "../klein/ui_common.js";

/** A centred panel over the node, sized to its content. Returns { el, open, close }. */
function dialog(title, width = "340px") {
  const box = el("div", { style: {
    background: "#141414", border: `1px solid ${C.border}`, borderRadius: "10px",
    boxShadow: "0 12px 40px rgba(0,0,0,0.6)", width, maxWidth: "92%",
    maxHeight: "80%", display: "flex", flexDirection: "column", overflow: "hidden",
  }});
  const head = el("div", { style: {
    display: "flex", alignItems: "center", gap: "8px", padding: "10px 12px",
    borderBottom: `1px solid ${C.border}`, flexShrink: "0",
  }}, [el("div", { text: title, style: { color: "#fff", fontSize: "13px", fontWeight: "700", flex: "1" } })]);
  const body = el("div", { style: { padding: "12px", display: "flex", flexDirection: "column", gap: "10px", overflowY: "auto" } });
  box.append(head, body);

  const ov = el("div", { style: {
    position: "absolute", inset: "0", zIndex: "10000", display: "none",
    alignItems: "center", justifyContent: "center", borderRadius: "inherit",
    background: "rgba(0,0,0,0.55)",
  }}, [box]);
  // Clicking the backdrop closes; clicking inside must not.
  ov.addEventListener("mousedown", (e) => { if (e.target === ov) close(); });
  box.addEventListener("mousedown", (e) => e.stopPropagation());

  function open() { ov.style.display = "flex"; }
  function close() { ov.style.display = "none"; }
  head.appendChild(button("✕", () => close(), "danger"));
  return { el: ov, body, open, close };
}

/**
 * A small ask-the-user dialog, drawn in the page.
 *
 * `window.prompt` and `window.confirm` are suppressed in ComfyUI's frontend, so clicking
 * Rename or Delete silently did nothing: the handler ran, waited on a dialog that never
 * appeared, and gave up. These render inside the node like every other panel here.
 *
 * @param kind "text" for a named value, "confirm" for yes/no
 */
function ask(parent, { title, message, initial = "", kind = "text", okLabel = "OK", danger = false }) {
  return new Promise((resolve) => {
    const input = kind === "text" ? el("input", { type: "text", style: {
      width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text,
      border: `1px solid ${C.border}`, borderRadius: "6px", padding: "8px", fontSize: "13px",
    }}) : null;
    if (input) input.value = initial;
    const box = el("div", { style: {
      background: "#141414", border: `1px solid ${C.border}`, borderRadius: "10px",
      boxShadow: "0 12px 40px rgba(0,0,0,0.6)", width: "320px", maxWidth: "92%",
      padding: "14px", display: "flex", flexDirection: "column", gap: "10px",
    }});
    const ov = el("div", { style: {
      position: "absolute", inset: "0", zIndex: "10002", display: "flex",
      alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)",
      borderRadius: "inherit",
    }}, [box]);
    const done = (v) => { ov.remove(); resolve(v); };
    box.append(
      el("div", { text: title, style: { color: "#fff", fontSize: "13px", fontWeight: "700" } }),
      ...(message ? [el("div", { text: message, style: { fontSize: "11.5px", color: C.muted, lineHeight: "1.6", whiteSpace: "pre-line" } })] : []),
      ...(input ? [input] : []),
      el("div", { style: { display: "flex", gap: "8px", justifyContent: "flex-end" } }, [
        button("Cancel", () => done(kind === "confirm" ? false : null)),
        button(okLabel, () => done(kind === "confirm" ? true : (input.value.trim() || null)),
          danger ? "danger" : "primary"),
      ]),
    );
    ov.addEventListener("mousedown", (e) => { if (e.target === ov) done(kind === "confirm" ? false : null); });
    if (input) input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); done(input.value.trim() || null); }
      if (e.key === "Escape") done(null);
    });
    parent.appendChild(ov);
    setTimeout(() => input?.focus(), 0);
  });
}

/**
 * Mount the preset save/manage dialogs onto `rootEl`.
 *
 * @param ctx.getUserPresets  () => array of saved presets
 * @param ctx.setUserPresets  (arr) => persist and re-render
 * @param ctx.captureAxes     () => the axes object to store for a new preset
 */
export function createPresetDialogs(rootEl, ctx) {
  // ── save ────────────────────────────────────────────────────────────────────
  const saveDlg = dialog("Save preset");
  const nameIn = el("input", { type: "text", placeholder: "preset name", style: {
    width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text,
    border: `1px solid ${C.border}`, borderRadius: "6px", padding: "8px", fontSize: "13px",
  }});
  const saveWarn = el("div", { style: { fontSize: "10.5px", color: C.warn, minHeight: "14px" } });
  const saveRow = el("div", { style: { display: "flex", gap: "8px", justifyContent: "flex-end" } });

  async function doSave() {
    const name = nameIn.value.trim();
    if (!name) { saveWarn.textContent = "Give it a name first."; return; }
    const list = ctx.getUserPresets();
    const i = list.findIndex(p => p.name.toLowerCase() === name.toLowerCase());
    // Overwriting is offered rather than silently making a second entry with the same
    // name, which would be indistinguishable in the dropdown.
    if (i >= 0 && !(await ask(rootEl, { title: "Overwrite preset?",
        message: `"${name}" already exists.`, kind: "confirm", okLabel: "Overwrite", danger: true }))) return;
    const entry = { name, ...ctx.captureAxes() };
    if (i >= 0) list[i] = entry; else list.push(entry);
    // A failure in here used to leave the dialog sitting open with no explanation, which
    // reads exactly like the button not working. Say what went wrong instead.
    try {
      ctx.setUserPresets(list);
    } catch (e) {
      console.error("[MMH3] preset save failed:", e);
      saveWarn.textContent = `Could not save: ${e?.message || e}`;
      return;
    }
    saveDlg.close();
  }
  nameIn.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); doSave(); }
    if (e.key === "Escape") saveDlg.close();
  });
  saveRow.append(button("Cancel", () => saveDlg.close()), button("Save", doSave, "primary"));
  saveDlg.body.append(
    el("div", { text: "Stores the current pipeline settings under a name of your own.",
      style: { fontSize: "11px", color: C.muted, lineHeight: "1.5" } }),
    nameIn, saveWarn, saveRow,
  );

  // ── manage ──────────────────────────────────────────────────────────────────
  const mgDlg = dialog("Preset settings", "420px");
  const listEl = el("div", { style: { display: "flex", flexDirection: "column", gap: "4px" } });
  let dragFrom = -1;

  function renderList() {
    const list = ctx.getUserPresets();
    listEl.replaceChildren();
    if (!list.length) {
      listEl.appendChild(el("div", { text: "No saved presets yet. Use Save to add one.",
        style: { fontSize: "11px", color: C.muted, padding: "10px 2px" } }));
      return;
    }
    list.forEach((p, idx) => {
      const row = el("div", { draggable: "true", style: {
        display: "flex", alignItems: "center", gap: "6px", padding: "7px 8px",
        background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "6px", cursor: "grab",
      }});
      row.append(
        el("span", { text: "⠿", style: { color: C.muted, fontSize: "12px", flexShrink: "0" } }),
        el("div", { text: p.name, style: { flex: "1", fontSize: "12px", color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }),
        button("Rename", async () => {
          const name = await ask(rootEl, { title: "Rename preset", initial: p.name, okLabel: "Rename" });
          if (!name) return;
          const l = ctx.getUserPresets();
          if (l.some((q, j) => j !== idx && q.name.toLowerCase() === name.toLowerCase())) {
            await ask(rootEl, { title: "Name already used",
              message: `"${name}" belongs to another preset.`, kind: "confirm", okLabel: "OK" });
            return;
          }
          l[idx] = { ...l[idx], name };
          ctx.setUserPresets(l); renderList();
        }),
        button("Delete", async () => {
          // Deleting is the one irreversible action here, so it always asks.
          const yes = await ask(rootEl, { title: "Delete preset",
            message: `"${p.name}" will be removed.
This cannot be undone.`,
            kind: "confirm", okLabel: "Delete", danger: true });
          if (!yes) return;
          const l = ctx.getUserPresets(); l.splice(idx, 1);
          ctx.setUserPresets(l); renderList();
        }, "danger"),
      );
      row.addEventListener("dragstart", () => { dragFrom = idx; row.style.opacity = "0.4"; });
      row.addEventListener("dragend", () => { dragFrom = -1; row.style.opacity = "1"; });
      row.addEventListener("dragover", (e) => { e.preventDefault(); row.style.borderColor = BRAND; });
      row.addEventListener("dragleave", () => { row.style.borderColor = C.border; });
      row.addEventListener("drop", (e) => {
        e.preventDefault(); row.style.borderColor = C.border;
        if (dragFrom < 0 || dragFrom === idx) return;
        const l = ctx.getUserPresets();
        l.splice(idx, 0, l.splice(dragFrom, 1)[0]);
        ctx.setUserPresets(l); renderList();
      });
      listEl.appendChild(row);
    });
  }

  mgDlg.body.append(
    el("div", { text: "Drag to reorder. The built-in presets below your own cannot be changed.",
      style: { fontSize: "11px", color: C.muted, lineHeight: "1.5" } }),
    listEl,
  );

  rootEl.append(saveDlg.el, mgDlg.el);
  return {
    openSave() { nameIn.value = ""; saveWarn.textContent = ""; saveDlg.open(); setTimeout(() => nameIn.focus(), 0); },
    openManage() { renderList(); mgDlg.open(); },
  };
}

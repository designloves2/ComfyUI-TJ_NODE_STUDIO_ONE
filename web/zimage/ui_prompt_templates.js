// ui_prompt_templates.js — prompt template picker + editor overlay
import { C, el, clear } from "./core.js";
import { panel, label, button, row } from "./ui_common.js";
import { getConfig, saveConfig } from "./api.js";

// Small "Load Template" button shown in each mode's left panel
export function createTemplateBtn(onSelect) {
  return button("📋 Templates", () => onSelect(), "default");
}

// Full-screen overlay for picking / editing templates
export function createTemplateOverlay(state, ctx, onApply) {
  const ov = el("div", { style: {
    position: "absolute", inset: "0", zIndex: "9996",
    background: "rgba(11,11,11,0.97)", borderRadius: "inherit",
    display: "none", flexDirection: "column",
    padding: "12px", gap: "8px", boxSizing: "border-box", overflowY: "auto",
  }});

  let templates = [];

  // ── Header ──────────────────────────────────────────────────────────────
  const topRow = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" } });
  topRow.appendChild(el("div", { text: "📋 Prompt Templates", style: { color: "#fff", fontSize: "14px", fontWeight: "700", flex: "1" } }));
  const addBtn   = button("+ New", () => startEdit(null));
  const closeBtn = button("✕", () => { ov.style.display = "none"; }, "danger");
  topRow.appendChild(addBtn);
  topRow.appendChild(closeBtn);
  ov.appendChild(topRow);

  // ── Template list ────────────────────────────────────────────────────────
  const listEl = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } });
  ov.appendChild(listEl);

  function renderList() {
    clear(listEl);
    if (!templates.length) {
      listEl.appendChild(el("div", { text: "No templates yet. Click + New to add one.", style: { color: C.muted, fontSize: "12px", padding: "16px 0" } }));
      return;
    }
    templates.forEach((t, i) => {
      const card = el("div", { style: {
        background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "8px",
        padding: "8px 10px", display: "flex", alignItems: "flex-start", gap: "8px",
      }});
      const info = el("div", { style: { flex: "1", minWidth: "0" } });
      info.appendChild(el("div", { text: t.name, style: { color: C.text, fontSize: "12px", fontWeight: "600", marginBottom: "3px" } }));
      info.appendChild(el("div", { text: t.prompt.slice(0, 100) + (t.prompt.length > 100 ? "…" : ""), style: { color: C.muted, fontSize: "11px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }));
      const applyBtn = button("Apply", () => {
        onApply(t.prompt);
        ov.style.display = "none";
      }, "primary");
      const editBtn = button("Edit", () => startEdit(i));
      const delBtn  = button("✕", () => {
        if (!confirm(`Delete "${t.name}"?`)) return;
        templates.splice(i, 1);
        saveTemplates();
        renderList();
      }, "danger");
      card.appendChild(info);
      card.appendChild(applyBtn);
      card.appendChild(editBtn);
      card.appendChild(delBtn);
      listEl.appendChild(card);
    });
  }

  // ── Edit form ────────────────────────────────────────────────────────────
  const editForm = el("div", { style: { display: "none", flexDirection: "column", gap: "6px", padding: "10px", background: C.bg1, borderRadius: "8px", border: `1px solid ${C.border}` } });
  const nameIn = el("input", { type: "text", placeholder: "Template name…", style: {
    width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text,
    border: `1px solid ${C.border}`, borderRadius: "6px", padding: "6px", fontSize: "12px", fontFamily: "inherit",
  }});
  const promptTA = el("textarea", { placeholder: "Prompt text…", style: {
    width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text,
    border: `1px solid ${C.border}`, borderRadius: "6px", padding: "7px",
    fontSize: "12px", fontFamily: "inherit", resize: "vertical", minHeight: "80px", outline: "none",
  }});
  editForm.appendChild(label("Name")); editForm.appendChild(nameIn);
  editForm.appendChild(label("Prompt")); editForm.appendChild(promptTA);

  let editIdx = null;
  const saveEditBtn = button("💾 Save", () => {
    const n = nameIn.value.trim(); const p = promptTA.value.trim();
    if (!n || !p) { alert("Please fill in both name and prompt."); return; }
    if (editIdx === null) templates.push({ name: n, prompt: p });
    else templates[editIdx] = { name: n, prompt: p };
    saveTemplates();
    editForm.style.display = "none";
    renderList();
  }, "primary");
  const cancelEditBtn = button("Cancel", () => { editForm.style.display = "none"; });
  editForm.appendChild(row([saveEditBtn, cancelEditBtn]));
  ov.appendChild(editForm);

  function startEdit(idx) {
    editIdx = idx;
    nameIn.value   = idx !== null ? templates[idx].name   : "";
    promptTA.value = idx !== null ? templates[idx].prompt : "";
    editForm.style.display = "flex";
  }

  function saveTemplates() {
    saveConfig({ t2i_templates: templates }).catch(() => {});
  }

  // Load from backend on first show
  let loaded = false;
  return {
    el: ov,
    show() {
      ov.style.display = "flex";
      if (!loaded) {
        loaded = true;
        getConfig().then(cfg => {
          templates = Array.isArray(cfg.t2i_templates) ? cfg.t2i_templates : [];
          renderList();
        }).catch(() => renderList());
      }
    },
    hide() { ov.style.display = "none"; },
  };
}

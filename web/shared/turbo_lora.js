// turbo_lora.js — one Turbo LoRA per image node: picked in ⚙ Settings (Model tab), switched on / off with a capsule
// toggle above SEED in the left menu. While it is on, the LoRA is put in front of the node's own LoRA list for the
// time the graph is built (the list itself is restored right after, so nothing is saved into the LoRA slots).
//
// State keys (every image node's defaultState): turboLora ("" = none), turboStrength (1), turboMode (false).
// Anima already had turboLora / turboMode with its own graph handling (8 steps / CFG 1), so it keeps that and only
// shares the settings field and the toggle.
const BRAND = "#7612DA";
const T = { bg2: "#181818", border: "#2a2a2a", text: "#dedede", muted: "#8a8a8a", warn: "#ffb347" };

export const hasTurbo = s => !!s && !!s.turboLora && s.turboLora !== "none";

export function turboEntry(s) {
  if (!s || !s.turboMode || !hasTurbo(s)) return null;
  const strength = parseFloat(s.turboStrength ?? 1);
  return { name: s.turboLora, strength: strength > 0 ? strength : 1, triggerWord: "", enabled: true };
}

// Puts the Turbo LoRA first in state.loras; returns the function that puts the list back (null when Turbo is off).
export function applyTurboTemp(state) {
  const t = turboEntry(state);
  if (!t) return null;
  const prev = state.loras;
  state.loras = [t, ...(Array.isArray(prev) ? prev : [])];
  return () => { state.loras = prev; };
}

// Several restore functions (some may be null) as one, run last-in first-out.
export function chainRestore(...fns) {
  const list = fns.filter(Boolean);
  return list.length ? () => { for (const f of list.slice().reverse()) f(); } : null;
}

function h(tag, props = {}, kids = []) {
  const e = document.createElement(tag);
  const { style, text, ...rest } = props;
  if (style) Object.assign(e.style, style);
  if (text != null) e.textContent = text;
  for (const [k, v] of Object.entries(rest)) e[k] = v;
  for (const c of kids) if (c) e.appendChild(c);
  return e;
}

// ── capsule toggle (left menu, above SEED) ───────────────────────────────────
// onChange(on) runs after the state changed; refresh() re-reads the state (call it when the Settings change the LoRA).
export function createTurboToggle(state, ctx, { onChange } = {}) {
  const wrap = h("div", { style: { display: "flex", alignItems: "center", gap: "8px", padding: "2px 2px" } });
  const lab = h("div", { text: "Turbo Mode", style: { fontSize: "11px", color: T.text, fontWeight: "600", flex: "1" } });
  const stat = h("div", { style: { fontSize: "10px", color: T.muted } });
  const cap = h("button", { type: "button", style: {
    position: "relative", width: "46px", height: "22px", borderRadius: "11px", border: "none", padding: "0",
    flexShrink: "0", transition: "background .15s", fontFamily: "inherit",
  } });
  const knob = h("div", { style: { position: "absolute", top: "3px", width: "16px", height: "16px", borderRadius: "50%", background: "#fff", transition: "left .15s" } });
  cap.appendChild(knob);
  wrap.append(lab, stat, cap);

  function refresh() {
    const usable = hasTurbo(state);
    if (!usable && state.turboMode) state.turboMode = false;   // the LoRA was removed in Settings
    const on = !!state.turboMode && usable;
    cap.disabled = !usable;
    cap.style.background = on ? BRAND : "#3a3a3a";
    cap.style.opacity = usable ? "1" : "0.45";
    cap.style.cursor = usable ? "pointer" : "not-allowed";
    knob.style.left = on ? "27px" : "3px";
    stat.textContent = usable ? (on ? "ON" : "OFF") : "no Turbo LoRA";
    stat.style.color = on ? BRAND : T.muted;
    wrap.title = usable
      ? `Turbo LoRA: ${state.turboLora}`
      : "Pick a Turbo LoRA in ⚙ Settings (Model tab) to enable this switch.";
  }
  cap.addEventListener("click", () => {
    if (!hasTurbo(state)) return;
    state.turboMode = !state.turboMode;
    refresh();
    ctx.persist?.();
    try { onChange?.(state.turboMode); } catch {}
  });
  refresh();
  ctx.refreshTurbo = refresh;     // Settings call this after changing the LoRA
  return { el: wrap, refresh };
}

// ── Settings: Turbo LoRA + strength (Model tab) ──────────────────────────────
async function loraNames() {
  try {
    const d = await (await fetch("/object_info/LoraLoaderModelOnly")).json();
    const spec = d?.LoraLoaderModelOnly?.input?.required?.lora_name;
    if (Array.isArray(spec?.[0])) return spec[0];
    if (Array.isArray(spec?.[1]?.options)) return spec[1].options;
  } catch {}
  return [];
}

export function mountTurboSettings(ov, state, ctx, { title = "Turbo LoRA" } = {}) {
  const box = h("div", { style: {
    display: "flex", flexDirection: "column", gap: "6px", padding: "8px", background: "#141414",
    border: `1px solid ${T.border}`, borderRadius: "8px",
  } });
  const sel = h("select", { style: {
    width: "100%", boxSizing: "border-box", background: T.bg2, color: T.text, border: `1px solid ${T.border}`,
    borderRadius: "6px", padding: "6px", fontSize: "12px", fontFamily: "inherit", outline: "none",
  } });
  const search = h("input", { type: "text", placeholder: "Search…", style: {
    width: "100%", boxSizing: "border-box", background: T.bg2, color: T.text, border: `1px solid ${T.border}`,
    borderRadius: "6px", padding: "5px 7px", fontSize: "11px", fontFamily: "inherit", outline: "none",
  } });
  const strength = h("input", { type: "number", step: "0.05", min: "0", max: "2", style: {
    width: "64px", boxSizing: "border-box", background: T.bg2, color: T.text, border: `1px solid ${T.border}`,
    borderRadius: "6px", padding: "6px", fontSize: "12px", fontFamily: "inherit", outline: "none",
  } });
  strength.value = state.turboStrength ?? 1;
  const note = h("div", { style: { fontSize: "10px", color: T.muted, lineHeight: "1.5" } });
  note.textContent = "Used by the Turbo Mode switch above SEED in the left menu: while it is ON this LoRA is added in front of your LoRA slots. Leave it on none to disable the switch. Turbo LoRAs usually want few steps and a low CFG — set those in the panel yourself.";

  function fill(names) {
    const list = ["none", ...names.filter(n => n && n !== "none")];
    if (state.turboLora && !list.includes(state.turboLora)) list.push(state.turboLora);
    sel.replaceChildren(...list.map(n => h("option", { value: n, text: n, selected: n === (state.turboLora || "none") })));
  }
  fill([]);
  loraNames().then(fill);

  search.addEventListener("input", () => {
    const q = search.value.toLowerCase().trim();
    for (const o of sel.options) o.hidden = !!q && !o.text.toLowerCase().includes(q) && o.value !== sel.value;
  });
  sel.addEventListener("change", () => {
    state.turboLora = sel.value === "none" ? "" : sel.value;
    if (!state.turboLora) state.turboMode = false;
    ctx.persist?.(); ctx.refreshTurbo?.();
  });
  strength.addEventListener("input", () => {
    const v = parseFloat(strength.value);
    state.turboStrength = isNaN(v) ? 1 : Math.max(0, Math.min(2, v));
    ctx.persist?.();
  });

  box.append(
    h("div", { text: title, style: { fontSize: "12px", fontWeight: "700", color: "#fff" } }),
    search,
    h("div", { style: { display: "flex", gap: "6px", alignItems: "center" } }, [h("div", { style: { flex: "1", minWidth: "0" } }, [sel]), strength]),
    note,
  );
  // right after the first panel under the header row (the model pickers), which lands in the Model tab
  const ref = ov.children[2] || null;
  ov.insertBefore(box, ref);
  return box;
}

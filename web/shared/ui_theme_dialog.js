// The ONE STUDIO Node Skin editor.
//
//   · every color is a small box: click it and a spectrum popup opens (spectrum, HEX / RGB, eyedropper, before / after,
//     the colors you saved); the main three (Title / Node / HighLight) and every other part use the same boxes
//   · fine tuning: the real node (frame, title text, title dot), every text color, text fields / panels / borders, status colors;
//     a part you did not set follows the main colors ("auto"), the ↺ button gives it back
//   · a live sample node stays in view while you edit
//   · skins: named sets of colors shared by every node, with a thumbnail; Use / Edit / All nodes
//
// The editor, the popup and the sample are marked data-tj-theme-exempt, so the page-wide color rewriting (studio_theme.js) leaves
// them alone: they must show exactly the colors being picked.
import {
  DEFAULT_THEME, MAX_SAVED, NODE_LABELS, ROLE_DEFS, normalizeTheme, normHex, parseHex, toHex, rgbToHsv, hsvToRgb, paletteFor, contrastText,
  autoRoleColor,
} from "./studio_theme.js";

const CH = { bg: "#1b1c20", panel: "#24262c", line: "#3b3e47", text: "#eceef3", muted: "#9096a3", accent: "#4c8dff", ok: "#43c477" };

function h(tag, props = {}, kids = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "style") Object.assign(e.style, v);
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2).toLowerCase(), v);
    else e.setAttribute(k, v);
  }
  for (const c of [].concat(kids)) if (c) e.append(c);
  return e;
}
const clone = (o) => JSON.parse(JSON.stringify(o));
const unique = (list) => [...new Set(list)];

// ── the color popup ──────────────────────────────────────────────────────────────────────────────────────────────────────
const PW = 268, SW = 244, SH = 150, HH = 14;
let pop = null;

export function closeColorPopover() {
  if (!pop) return;
  pop.el.remove();
  document.removeEventListener("pointerdown", pop.onDoc, true);
  document.removeEventListener("keydown", pop.onKey, true);
  window.removeEventListener("resize", pop.onResize);
  pop = null;
}

/** Open the spectrum popup next to `anchor`. `onChange(hex)` is called while the color is being picked.
 *  @param saved () => string[]; @param onSave(hex); @param onRemove(hex); @param onAuto optional: gives the part back to the main colors */
function openColorPopover({ anchor, label, value, saved, onChange, onSave, onRemove, onAuto }) {
  if (pop?.anchor === anchor) { closeColorPopover(); return; }
  closeColorPopover();
  const start = normHex(value) || "#000000";
  let hsv = rgbToHsv(parseHex(start));
  const cur = () => hsvToRgb(hsv);

  const sv = h("canvas", { width: SW, height: SH, style: { width: SW + "px", height: SH + "px", display: "block", borderRadius: "6px", cursor: "crosshair", touchAction: "none" } });
  const svKnob = h("div", { style: { position: "absolute", width: "14px", height: "14px", marginLeft: "-7px", marginTop: "-7px", borderRadius: "50%", border: "2px solid #fff", boxShadow: "0 0 0 1px #000, inset 0 0 0 1px #000", pointerEvents: "none" } });
  const svWrap = h("div", { style: { position: "relative", width: SW + "px", height: SH + "px" } }, [sv, svKnob]);
  const hue = h("canvas", { width: SW, height: HH, style: { width: SW + "px", height: HH + "px", display: "block", borderRadius: "7px", cursor: "ew-resize", touchAction: "none" } });
  const hueKnob = h("div", { style: { position: "absolute", top: "-2px", width: "6px", height: HH + 4 + "px", marginLeft: "-3px", borderRadius: "3px", border: "2px solid #fff", boxShadow: "0 0 0 1px #000", pointerEvents: "none", boxSizing: "border-box" } });
  const hueWrap = h("div", { style: { position: "relative", width: SW + "px", height: HH + "px", margin: "10px 0 8px" } }, [hue, hueKnob]);
  { const c = hue.getContext("2d"), g = c.createLinearGradient(0, 0, SW, 0); for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, toHex(hsvToRgb({ h: (i % 6) * 60, s: 1, v: 1 }))); c.fillStyle = g; c.fillRect(0, 0, SW, HH); }

  const chip = (t) => h("div", { style: { flex: "1", height: "26px", borderRadius: "5px", border: `1px solid ${CH.line}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10.5px", fontWeight: "600" }, text: t });
  const beforeChip = chip("Before"), nowChip = chip("Now");
  const paintChip = (el, hex) => { el.style.background = hex; el.style.color = contrastText(hex); };
  paintChip(beforeChip, start);
  beforeChip.style.cursor = "pointer"; beforeChip.title = "Back to this color";
  const compare = h("div", { style: { display: "flex", gap: "6px", marginBottom: "8px" } }, [beforeChip, nowChip]);

  const inStyle = { background: CH.bg, color: CH.text, border: `1px solid ${CH.line}`, borderRadius: "5px", padding: "5px 6px", fontSize: "12px", fontFamily: "ui-monospace, Consolas, monospace", boxSizing: "border-box", outline: "none" };
  const hexIn = h("input", { type: "text", spellcheck: "false", maxlength: "7", style: { ...inStyle, width: "76px" } });
  const rgbIn = [0, 1, 2].map(() => h("input", { type: "number", min: "0", max: "255", step: "1", style: { ...inStyle, width: "46px" } }));
  const eye = window.EyeDropper ? h("button", { type: "button", title: "Pick a color from anywhere on the screen", text: "💧", style: { ...inStyle, cursor: "pointer", padding: "4px 7px" } }) : null;
  const fields = h("div", { style: { display: "flex", alignItems: "center", gap: "5px", marginBottom: "10px" } }, [hexIn, ...rgbIn, eye]);

  const savedBox = h("div", { style: { display: "flex", flexWrap: "wrap", gap: "6px", minHeight: "24px" } });
  const saveBtn = h("button", { type: "button", text: "＋ Save this color", style: { ...inStyle, cursor: "pointer", fontFamily: "inherit", padding: "3px 9px", fontSize: "11px" } });
  const title = h("div", { style: { display: "flex", alignItems: "center", marginBottom: "9px" } }, [
    h("div", { text: label, style: { fontWeight: "700", fontSize: "13px", flex: "1" } }),
    h("span", { text: "✕", title: "Close (Esc)", style: { cursor: "pointer", color: CH.muted, fontSize: "14px", padding: "0 2px" }, onclick: closeColorPopover }),
  ]);
  const foot = h("div", { style: { display: "flex", gap: "8px", marginTop: "10px", justifyContent: "flex-end" } });
  if (onAuto) foot.append(h("button", { type: "button", text: "↺ Auto", title: "Follow the main colors again", style: { ...inStyle, cursor: "pointer", fontFamily: "inherit" }, onclick: () => { onAuto(); closeColorPopover(); } }));
  foot.append(h("button", { type: "button", text: "Done", style: { ...inStyle, cursor: "pointer", fontFamily: "inherit", background: CH.accent, borderColor: CH.accent, color: "#fff", fontWeight: "600", padding: "5px 16px" }, onclick: closeColorPopover }));

  const el = h("div", { "data-tj-theme-exempt": "1", "data-tj-color-popover": "1", role: "dialog", "aria-label": label, style: { position: "fixed", zIndex: "2147483200", width: PW + "px", background: CH.panel, color: CH.text, border: `1px solid ${CH.line}`, borderRadius: "12px", boxShadow: "0 14px 44px rgba(0,0,0,.6)", padding: "12px", boxSizing: "border-box", fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif", pointerEvents: "auto" } }, [
    title, svWrap, hueWrap, compare, fields,
    h("div", { style: { display: "flex", alignItems: "center", margin: "2px 0 6px" } }, [h("div", { text: "Saved colors", style: { fontSize: "11px", color: CH.muted, flex: "1" } }), saveBtn]),
    savedBox, foot,
  ]);

  function drawSV() {
    const c = sv.getContext("2d");
    c.fillStyle = toHex(hsvToRgb({ h: hsv.h, s: 1, v: 1 })); c.fillRect(0, 0, SW, SH);
    let g = c.createLinearGradient(0, 0, SW, 0); g.addColorStop(0, "#fff"); g.addColorStop(1, "rgba(255,255,255,0)"); c.fillStyle = g; c.fillRect(0, 0, SW, SH);
    g = c.createLinearGradient(0, 0, 0, SH); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "#000"); c.fillStyle = g; c.fillRect(0, 0, SW, SH);
  }
  function paint(skip) {
    const rgb = cur(), hex = toHex(rgb);
    svKnob.style.left = hsv.s * SW + "px"; svKnob.style.top = (1 - hsv.v) * SH + "px"; svKnob.style.background = hex;
    hueKnob.style.left = (hsv.h / 360) * SW + "px";
    if (skip !== "hex") hexIn.value = hex;
    if (skip !== "rgb") { rgbIn[0].value = rgb.r; rgbIn[1].value = rgb.g; rgbIn[2].value = rgb.b; }
    paintChip(nowChip, hex);
    drawSV();
    return hex;
  }
  const emit = (skip) => onChange(paint(skip));
  function setRgb(rgb, skip) {          // typed values: keep the hue when the color has none (grey, black)
    const n = rgbToHsv(rgb);
    hsv = { h: n.s === 0 || n.v === 0 ? hsv.h : n.h, s: n.v === 0 ? hsv.s : n.s, v: n.v };
    emit(skip);
  }
  function drag(node, move) {
    node.addEventListener("pointerdown", (e) => { node.setPointerCapture(e.pointerId); move(e); });
    node.addEventListener("pointermove", (e) => { if (node.hasPointerCapture(e.pointerId)) move(e); });
  }
  drag(sv, (e) => { const r = sv.getBoundingClientRect(); hsv = { ...hsv, s: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), v: 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }; emit(); });
  drag(hue, (e) => { const r = hue.getBoundingClientRect(); hsv = { ...hsv, h: Math.min(359.999, Math.max(0, ((e.clientX - r.left) / r.width) * 360)) }; emit(); });
  hexIn.addEventListener("input", () => { const c = parseHex(hexIn.value); if (c && hexIn.value.replace("#", "").length === 6) setRgb(c, "hex"); });
  hexIn.addEventListener("blur", () => { hexIn.value = toHex(cur()); });
  rgbIn.forEach((inp, i) => {
    inp.addEventListener("input", () => { if (inp.value === "") return; const c = cur(); setRgb({ ...c, [["r", "g", "b"][i]]: Math.max(0, Math.min(255, Math.round(Number(inp.value) || 0))) }, "rgb"); });
    inp.addEventListener("blur", () => { const c = cur(); rgbIn[0].value = c.r; rgbIn[1].value = c.g; rgbIn[2].value = c.b; });
  });
  function setHex(hex) {
    const c = parseHex(hex); if (!c) return;
    const n = rgbToHsv(c);
    hsv = { h: n.s === 0 || n.v === 0 ? hsv.h : n.h, s: n.s, v: n.v };
    emit();
  }
  beforeChip.addEventListener("click", () => setHex(start));
  eye?.addEventListener("click", async () => { try { const r = await new window.EyeDropper().open(); setHex(r.sRGBHex); } catch (_) { /* cancelled */ } });

  function renderSaved() {
    const list = saved();
    savedBox.replaceChildren(...(list.length ? list.map((hex) => {
      const x = h("span", { text: "×", title: "Remove", style: { position: "absolute", top: "-6px", right: "-6px", width: "14px", height: "14px", lineHeight: "13px", textAlign: "center", fontSize: "11px", background: "#000", color: "#fff", borderRadius: "50%", display: "none", cursor: "pointer" } });
      const sw = h("div", { title: hex, style: { position: "relative", width: "24px", height: "24px", borderRadius: "5px", background: hex, border: `1px solid ${CH.line}`, cursor: "pointer", boxSizing: "border-box" } }, [x]);
      sw.addEventListener("click", () => setHex(hex));
      sw.addEventListener("mouseenter", () => { x.style.display = "block"; });
      sw.addEventListener("mouseleave", () => { x.style.display = "none"; });
      x.addEventListener("click", (e) => { e.stopPropagation(); onRemove(hex); renderSaved(); });
      return sw;
    }) : [h("span", { text: "None yet — press “Save this color”", style: { color: CH.muted, fontSize: "11px", alignSelf: "center" } })]));
  }
  saveBtn.addEventListener("click", () => { onSave(toHex(cur())); renderSaved(); });

  document.body.append(el);
  renderSaved(); paint();
  paintChip(nowChip, start);
  const place = () => {
    const r = anchor.getBoundingClientRect(), ph = el.offsetHeight;
    let top = r.bottom + 8;
    if (top + ph > innerHeight - 8) top = Math.max(8, r.top - ph - 8);
    el.style.top = Math.min(Math.max(8, top), Math.max(8, innerHeight - ph - 8)) + "px";
    el.style.left = Math.min(Math.max(8, r.left), Math.max(8, innerWidth - PW - 8)) + "px";
  };
  place();
  const onDoc = (e) => { if (!el.contains(e.target) && !anchor.contains(e.target)) closeColorPopover(); };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); closeColorPopover(); } };
  const onResize = () => place();
  document.addEventListener("pointerdown", onDoc, true);
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("resize", onResize);
  pop = { el, anchor, onDoc, onKey, onResize };
}

// ── the sample node ──────────────────────────────────────────────────────────────────────────────────────────────────────
function renderPreview(box, t, label = "") {
  const roles = t.roles || {};
  const p = paletteFor(t.node, roles, t.highlight), hi = t.highlight, onHi = p.tWhite;
  const frame = roles.frame || t.node, titleText = roles.titleText || contrastText(t.title);
  const dot = roles.titleDot || autoRoleColor("titleDot", t);
  const tab = (text, active) => h("div", { text, style: { padding: "5px 12px", borderRadius: "14px", fontSize: "11px", background: active ? hi : p.bg2, color: active ? onHi : p.text, border: `1px solid ${active ? hi : p.border}` } });
  const row = (a, b) => h("div", { style: { display: "flex", alignItems: "center", gap: "10px" } }, [a, b]);
  const slider = h("div", { style: { position: "relative", height: "6px", flex: "1", borderRadius: "3px", background: p.bg3 } }, [
    h("div", { style: { width: "62%", height: "6px", borderRadius: "3px", background: hi } }),
    h("div", { style: { position: "absolute", left: "62%", top: "-4px", width: "14px", height: "14px", marginLeft: "-7px", borderRadius: "50%", background: hi, border: `2px solid ${p.bg0}` } }),
  ]);
  const toggle = h("div", { style: { width: "34px", height: "18px", borderRadius: "9px", background: hi, position: "relative" } }, [
    h("div", { style: { position: "absolute", right: "2px", top: "2px", width: "14px", height: "14px", borderRadius: "50%", background: onHi } })]);
  const pointer = h("span", { style: { display: "inline-flex" } });
  pointer.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24"><path d="M4 2l16 9-7 2-3 7z" fill="${hi}" stroke="${p.bg0}" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
  const input = h("div", { text: "a quiet street at dawn…", style: { padding: "7px 9px", borderRadius: "6px", background: p.bg2, color: p.text, border: `1px solid ${hi}`, fontSize: "12px" } });
  const hoverRow = h("div", { text: "hovered item", style: { padding: "5px 9px", borderRadius: "6px", background: p.bg3, color: p.tLight, border: `1px solid ${p.borderH}`, fontSize: "11px" } });
  const prog = h("div", { style: { height: "5px", borderRadius: "3px", background: p.bg3, overflow: "hidden" } }, [h("div", { style: { width: "48%", height: "5px", background: hi } })]);
  const chip = (text, color) => h("span", { text, style: { color, fontSize: "11px", border: `1px solid ${color}`, borderRadius: "10px", padding: "1px 8px" } });
  const panel = h("div", { style: { background: p.bg1, border: `1px solid ${p.border}`, borderRadius: "8px", padding: "10px", display: "flex", flexDirection: "column", gap: "8px" } }, [
    h("div", { text: "PROMPT", style: { color: p.muted, fontSize: "10px", letterSpacing: ".08em" } }),
    input, hoverRow,
    h("div", { style: { display: "flex", gap: "10px", fontSize: "11px", flexWrap: "wrap" } }, [
      h("span", { text: "Text", style: { color: p.text } }), h("span", { text: "Light", style: { color: p.tLight } }), h("span", { text: "Gray", style: { color: p.tGray1 } }),
      h("span", { text: "Mid gray", style: { color: p.tGray2 } }), h("span", { text: "Dim", style: { color: p.muted } }), h("span", { text: "Brand", style: { color: p.tBrand } })]),
    row(h("span", { text: "Steps", style: { color: p.tLight, fontSize: "11px", width: "44px" } }), slider),
    row(h("span", { text: "Audio", style: { color: p.tLight, fontSize: "11px", width: "44px" } }), toggle),
    prog,
    h("div", { style: { display: "flex", gap: "6px", alignItems: "center" } }, [chip("ready", p.ok), chip("check", p.warn), chip("failed", p.err)]),
    h("div", { style: { display: "flex", gap: "8px", alignItems: "center" } }, [
      h("div", { text: "Generate", style: { background: hi, color: onHi, padding: "6px 16px", borderRadius: "6px", fontSize: "12px", fontWeight: "600" } }),
      h("div", { text: "Cancel", style: { background: p.bg2, color: p.text, padding: "6px 14px", borderRadius: "6px", fontSize: "12px", border: `1px solid ${p.border}` } }),
      h("div", { style: { marginLeft: "auto", display: "flex", alignItems: "center", gap: "4px", color: p.muted, fontSize: "10px" } }, [pointer, "pointer"]),
    ]),
  ]);
  const titleBar = h("div", { style: { background: t.title, color: titleText, padding: "7px 12px", fontSize: "12px", fontWeight: "600", display: "flex", alignItems: "center", gap: "8px" } }, [
    h("span", { style: { width: "9px", height: "9px", borderRadius: "50%", background: dot, flexShrink: "0" } }),
    `${label || "MiniMax H3"} ONE STUDIO (TJ)`,
  ]);
  // like the real node: the frame is the visible edge around the inside, whose own base color is the Node Color
  const inside = h("div", { style: { background: p.bg0, borderRadius: "6px", padding: "10px", display: "flex", flexDirection: "column", gap: "10px" } }, [
    h("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap" } }, [tab("Text To Video", true), tab("Image to Video", false), tab("Reference", false)]),
    panel,
  ]);
  const node = h("div", { style: { width: "100%", maxWidth: "460px", borderRadius: "10px", overflow: "hidden", background: frame, border: `1px solid ${t.title}`, boxShadow: "0 8px 28px rgba(0,0,0,.45)" } }, [
    titleBar, h("div", { style: { padding: "6px" } }, [inside]),
  ]);
  box.replaceChildren(node);
}

/** A tiny node for a skin card: title bar, body, the key color. */
function skinThumb(sk) {
  const p = paletteFor(sk.node, sk.roles, sk.highlight);
  return h("div", { style: { width: "58px", height: "40px", borderRadius: "5px", overflow: "hidden", background: sk.roles.frame || sk.node, border: `1px solid ${sk.title}`, flexShrink: "0", display: "flex", flexDirection: "column", boxSizing: "border-box" } }, [
    h("div", { style: { height: "9px", background: sk.title } }),
    h("div", { style: { flex: "1", margin: "3px", borderRadius: "3px", background: p.bg0, padding: "3px", display: "flex", flexDirection: "column", gap: "3px" } }, [
      h("div", { style: { height: "5px", width: "70%", borderRadius: "2px", background: sk.highlight } }),
      h("div", { style: { height: "4px", width: "90%", borderRadius: "2px", background: p.bg2, border: `1px solid ${p.border}`, boxSizing: "border-box" } }),
    ]),
  ]);
}

// ── the panel ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const MAIN_ROWS = [
  { id: "title", label: "Title Color", hint: "the node's title bar" },
  { id: "node", label: "Node Color", hint: "the node body; panels and fields are derived from it" },
  { id: "highlight", label: "HighLight Color", hint: "tabs, buttons, sliders, pointers" },
];

/** The whole skin editor for one node kind, as an element: it goes into a node's Settings tab or into a popup.
 *  @param key node kind; @param theme its current theme; @param onApply (theme) => void; @param onSaved (saved lists) => void
 *  @param skins { list, save(name, theme), remove(name), use(skin), useAll(skin) } the shared skin library, or null
 *  @param onClose when given, a Close button is shown */
export function createThemePanel({ key, theme, onApply, onSaved, skins, onClose }) {
  const draft = normalizeTheme(theme);
  let appliedNow = normalizeTheme(theme);           // what the node shows: "Revert" goes back to it

  // ── saved colors: one list for the whole node ───────────────────────────────────────────────────────────────────────
  const allSaved = () => unique([...draft.saved.colors, ...draft.saved.title, ...draft.saved.node, ...draft.saved.highlight]);
  const saveColor = (hex) => { draft.saved.colors = [hex, ...draft.saved.colors.filter(x => x !== hex)].slice(0, MAX_SAVED); onSaved?.(clone(draft.saved)); };
  const removeColor = (hex) => { for (const k of Object.keys(draft.saved)) draft.saved[k] = draft.saved[k].filter(x => x !== hex); onSaved?.(clone(draft.saved)); };

  // ── the sample ──────────────────────────────────────────────────────────────────────────────────────────────────────
  const previewBox = h("div", { style: { display: "flex", justifyContent: "center" } });
  const redraw = () => renderPreview(previewBox, draft, NODE_LABELS[key] || "");

  // ── one row per color ───────────────────────────────────────────────────────────────────────────────────────────────
  const rows = [];
  const inStyle = { background: CH.bg, color: CH.text, border: `1px solid ${CH.line}`, borderRadius: "5px", padding: "4px 6px", fontSize: "12px", fontFamily: "ui-monospace, Consolas, monospace", boxSizing: "border-box", outline: "none" };
  const changed = () => { for (const r of rows) r.sync(); redraw(); };
  function colorRow({ id, label, hint, main }) {
    const get = () => (main ? draft[id] : (draft.roles[id] || autoRoleColor(id, draft)));
    const isSet = () => main || !!draft.roles[id];
    const set = (hex) => { if (main) draft[id] = hex; else draft.roles[id] = hex; changed(); };
    const swatch = h("button", { type: "button", title: `${label} — click to pick`, "data-color-box": id, style: { width: main ? "46px" : "36px", height: main ? "30px" : "24px", borderRadius: "6px", border: `2px solid ${CH.line}`, cursor: "pointer", padding: "0", flexShrink: "0", boxSizing: "border-box" } });
    const hex = h("input", { type: "text", maxlength: "7", spellcheck: "false", style: { ...inStyle, width: "76px", flexShrink: "0" } });
    const reset = main ? null : h("button", { type: "button", text: "↺", title: "Auto — follow the main colors again", style: { ...inStyle, cursor: "pointer", padding: "3px 8px", flexShrink: "0" } });
    const name = h("div", { style: { flex: "1", minWidth: "0" } }, [
      h("div", { text: label, style: { fontSize: main ? "13px" : "12px", fontWeight: main ? "600" : "400", color: CH.text } }),
      h("div", { text: hint, style: { fontSize: "10.5px", color: CH.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }),
    ]);
    swatch.addEventListener("click", () => openColorPopover({
      anchor: swatch, label, value: get(), saved: allSaved, onChange: (c) => set(c), onSave: saveColor, onRemove: removeColor,
      onAuto: main ? null : () => { delete draft.roles[id]; changed(); },
    }));
    hex.addEventListener("input", () => { const c = parseHex(hex.value); if (c && hex.value.replace("#", "").length === 6) set(toHex(c)); });
    hex.addEventListener("blur", () => sync());
    reset?.addEventListener("click", () => { delete draft.roles[id]; changed(); });
    const el = h("div", { style: { display: "flex", alignItems: "center", gap: "9px", padding: main ? "5px 0" : "2px 0" } }, [swatch, name, hex, reset]);
    function sync() {
      const c = get();
      swatch.style.background = c;
      if (document.activeElement !== hex) hex.value = c.toUpperCase();
      hex.style.opacity = isSet() ? "1" : ".55";
      if (reset) { reset.style.opacity = isSet() ? "1" : ".3"; reset.disabled = !isSet(); }
    }
    rows.push({ sync });
    sync();
    return el;
  }

  const sectionTitle = (name, first) => h("div", { text: name, style: { fontSize: "10.5px", letterSpacing: ".1em", textTransform: "uppercase", color: CH.muted, margin: first ? "0" : "12px 0 4px", paddingBottom: "3px", borderBottom: `1px solid ${CH.line}` } });
  const groups = [];
  for (const def of ROLE_DEFS) {
    let g = groups.find(x => x.name === def.group);
    if (!g) groups.push(g = { name: def.group, rows: [] });
    g.rows.push(colorRow({ id: def.key, label: def.label, hint: def.hint, main: false }));
  }
  const editor = h("div", { style: { background: CH.panel, border: `1px solid ${CH.line}`, borderRadius: "10px", padding: "12px 14px" } }, [
    sectionTitle("Main colors", true), ...MAIN_ROWS.map(r => colorRow({ ...r, main: true })),
    ...groups.flatMap(g => [sectionTitle(g.name), ...g.rows]),
  ]);
  redraw();

  // ── buttons ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  const btn = (text, primary, title) => h("button", { type: "button", text, title: title || "", style: { padding: "8px 20px", borderRadius: "6px", fontSize: "13px", cursor: "pointer", fontWeight: primary ? "700" : "500", border: `1px solid ${primary ? CH.accent : CH.line}`, background: primary ? CH.accent : CH.panel, color: primary ? "#fff" : CH.text } });
  const apply = btn("Apply", true, "Put these colors on the node"), reset = btn("Reset to default", false, "The original purple look"), revert = btn("Revert", false, "Back to what the node shows now"), close = onClose ? btn("Close") : null;
  const note = h("span", { style: { color: CH.ok, fontSize: "12px", opacity: "0", transition: "opacity .2s" } });
  const flash = (text) => { note.textContent = text; note.style.opacity = "1"; clearTimeout(apply._t); apply._t = setTimeout(() => { note.style.opacity = "0"; }, 2200); };

  /** The editor shows `skin` (main colors and every set role). */
  function load(skin) {
    draft.title = skin.title; draft.node = skin.node; draft.highlight = skin.highlight;
    for (const k of Object.keys(draft.roles)) delete draft.roles[k];
    Object.assign(draft.roles, skin.roles || {});
    changed();
  }
  reset.addEventListener("click", () => load({ ...DEFAULT_THEME, roles: {} }));
  revert.addEventListener("click", () => load(appliedNow));
  apply.addEventListener("click", () => { const next = normalizeTheme({ ...draft, updated: Date.now() }); onApply(next); appliedNow = next; flash("Applied ✓"); });
  close?.addEventListener("click", onClose);

  // ── skins ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  let skinsEl = null, renderSkins = () => {};
  if (skins) {
    const small = { background: CH.bg, color: CH.text, border: `1px solid ${CH.line}`, borderRadius: "5px", padding: "5px 9px", fontSize: "12px", boxSizing: "border-box", outline: "none", fontFamily: "inherit" };
    const nameIn = h("input", { type: "text", maxlength: "40", placeholder: "Name this skin…", spellcheck: "false", style: { ...small, width: "190px" } });
    const saveBtn = h("button", { type: "button", text: "Save skin", title: "Keep the colors below under this name, for every node", style: { ...small, cursor: "pointer", fontWeight: "600" } });
    const msg = h("span", { style: { color: CH.muted, fontSize: "11px" } });
    const list = h("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(236px, 1fr))", gap: "8px", marginTop: "10px" } });
    renderSkins = () => {
      const all = skins.list();
      list.replaceChildren(...(all.length ? all.map((sk) => {
        const b = (text, title, fn) => { const x = h("button", { type: "button", text, title, style: { ...small, cursor: "pointer", padding: "3px 9px", fontSize: "11px" } }); x.addEventListener("click", fn); return x; };
        const del = h("span", { text: "×", title: "Delete this skin", style: { cursor: "pointer", color: CH.muted, fontSize: "16px", padding: "0 4px", lineHeight: "1" } });
        del.addEventListener("click", () => { if (confirm(`Delete the skin "${sk.name}"?`)) skins.remove(sk.name); });
        const fine = Object.keys(sk.roles).length;
        return h("div", { "data-skin": sk.name, style: { background: CH.bg, border: `1px solid ${CH.line}`, borderRadius: "9px", padding: "8px 10px", display: "flex", gap: "10px", alignItems: "center" } }, [
          skinThumb(sk),
          h("div", { style: { flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "6px" } }, [
            h("div", { style: { display: "flex", alignItems: "center", gap: "4px" } }, [
              h("div", { text: sk.name, title: fine ? `${fine} parts fine-tuned` : "", style: { fontSize: "13px", fontWeight: "600", flex: "1", minWidth: "0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }), del]),
            h("div", { style: { display: "flex", gap: "5px", flexWrap: "wrap" } }, [
              b("Use", "Apply this skin to this node now", () => { load(sk); skins.use(sk); appliedNow = normalizeTheme(draft); flash(`“${sk.name}” applied ✓`); }),
              b("Edit", "Load it into the editor without applying", () => { load(sk); flash(`“${sk.name}” loaded — press Apply`); }),
              b("All nodes", "Apply this skin to every ONE STUDIO node", () => { if (confirm(`Apply "${sk.name}" to every ONE STUDIO node?`)) { skins.useAll(sk); load(sk); appliedNow = normalizeTheme(draft); flash(`“${sk.name}” applied to all nodes ✓`); } }),
            ]),
          ]),
        ]);
      }) : [h("div", { text: "No skins yet. Set the colors, name them and press Save skin — every node can then load it.", style: { color: CH.muted, fontSize: "12px" } })]));
    };
    saveBtn.addEventListener("click", () => {
      const name = nameIn.value.trim();
      if (!name) { msg.textContent = "Type a name first."; nameIn.focus(); return; }
      if (skins.list().some(x => x.name.toLowerCase() === name.toLowerCase()) && !confirm(`A skin named "${name}" exists. Replace it?`)) return;
      skins.save(name, normalizeTheme(draft));
      msg.textContent = `Saved “${name}”. Every node can load it.`; nameIn.value = "";
    });
    nameIn.addEventListener("keydown", (e) => { if (e.key === "Enter") saveBtn.click(); });
    renderSkins();
    skinsEl = h("div", { style: { background: CH.panel, border: `1px solid ${CH.line}`, borderRadius: "10px", padding: "12px 14px", marginBottom: "12px" } }, [
      h("div", { style: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" } }, [
        h("div", { text: "Skins", style: { fontSize: "13px", fontWeight: "700", marginRight: "4px" } }),
        h("div", { text: "shared by every node", style: { color: CH.muted, fontSize: "11px", marginRight: "auto" } }),
        nameIn, saveBtn, msg]),
      list,
    ]);
  }
  const onSkins = () => renderSkins();
  window.addEventListener("tj-studio-skins", onSkins);

  const el = h("div", { "data-tj-theme-exempt": "1", style: { background: CH.bg, color: CH.text, borderRadius: "12px", border: `1px solid ${CH.line}`, padding: "16px 18px 14px", fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif", pointerEvents: "auto", boxSizing: "border-box", width: "100%" } }, [
    h("div", { style: { display: "flex", alignItems: "baseline", gap: "12px", marginBottom: "12px", flexWrap: "wrap" } }, [
      h("div", { text: `ONE STUDIO Node Skin${NODE_LABELS[key] ? " — " + NODE_LABELS[key] : ""}`, style: { fontSize: "15px", fontWeight: "700" } }),
      h("div", { text: "Click a color box to change it. Saved for this node only.", style: { color: CH.muted, fontSize: "12px" } }),
    ]),
    skinsEl,
    h("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))", gap: "14px", alignItems: "start" } }, [
      editor,
      h("div", { style: { position: "sticky", top: "0", alignSelf: "start", background: "#0d0e10", border: `1px solid ${CH.line}`, borderRadius: "10px", padding: "12px" } }, [
        h("div", { text: "Preview", style: { textAlign: "center", color: CH.muted, fontSize: "11.5px", letterSpacing: ".12em", textTransform: "uppercase", marginBottom: "8px" } }), previewBox]),
    ]),
    h("div", { style: { display: "flex", alignItems: "center", gap: "10px", marginTop: "14px", flexWrap: "wrap" } }, [reset, revert, note, h("span", { style: { flex: "1" } }), close, apply]),
  ]);
  return { el, draft, load, destroy: () => { window.removeEventListener("tj-studio-skins", onSkins); closeColorPopover(); } };
}

// ── hooking the panel to the stored themes (window.tjStudioTheme, set by web/studio_theme.js) ───────────────────────────
const store = () => window.tjStudioTheme;
const skinApi = (t, key) => ({ list: () => t.skins(), save: (name, theme) => t.saveSkin(name, theme), remove: (name) => t.deleteSkin(name), use: (sk) => t.useSkin(key, sk.name), useAll: (sk) => t.useSkinEverywhere(sk.name) });

/** The editor for one node kind, wired to its stored theme: for a node's Settings tab. */
export function mountColorsPanel(container, key) {
  const t = store();
  if (!t) { container.append(h("div", { text: "Node Skin is not available (the skin extension is not loaded).", style: { color: CH.muted, fontSize: "12px" } })); return null; }
  const panel = createThemePanel({
    key, theme: t.get(key), skins: skinApi(t, key),
    onApply: (next) => t.apply(key, next),
    onSaved: (saved) => t.saveSaved(key, saved),
  });
  container.append(panel.el);
  return panel;
}

/** The same editor as a popup (the node's right-click menu). */
export function openThemeDialog(key) {
  const t = store(); if (!t) return null;
  document.getElementById("tj-theme-dialog")?.remove();
  const overlay = h("div", { id: "tj-theme-dialog", "data-tj-theme-exempt": "1", style: { position: "fixed", inset: "0", zIndex: "2147483000", background: "rgba(0,0,0,.62)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "12px", pointerEvents: "auto", overflow: "auto" } });
  const onKey = (e) => { if (e.key === "Escape" && !document.querySelector("[data-tj-color-popover]")) { e.stopPropagation(); shut(); } };
  const shut = () => { panel.destroy(); overlay.remove(); document.removeEventListener("keydown", onKey, true); };
  const panel = createThemePanel({
    key, theme: t.get(key), skins: skinApi(t, key), onClose: shut,
    onApply: (next) => t.apply(key, next),
    onSaved: (saved) => t.saveSaved(key, saved),
  });
  panel.el.style.width = "min(1060px, 96vw)";
  overlay.append(panel.el);
  document.addEventListener("keydown", onKey, true);
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) shut(); });
  document.body.append(overlay);
  return { close: shut, panel };
}

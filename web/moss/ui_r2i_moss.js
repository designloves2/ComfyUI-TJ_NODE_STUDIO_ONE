// ui_r2i_moss.js — R2I (bboxes) left panel for Moss Image ONE STUDIO (TJ)
//
// Draw boxes on a canvas of the working size. A box is an OBJECT (a described thing) or a TEXT block (exact words to
// render); boxes keep drawing order (background first, foreground last) and are numbered 1..n, which is also how
// the "characters" field refers to them. state.r2iBoxes holds ComfyUI's CreateBoundingBoxes editor_state:
//   { x, y, width, height, metadata: { type: "obj" | "text", text, desc, palette: [] } }  — canvas pixels.
import { C, el, clear, BRAND, workSize } from "./core_moss.js";
import { panel, label, button, select, row, col } from "../klein/ui_common.js";
import { buildR2IGraph } from "./graph_builder_moss.js";
import { mountSharedSettings, mountLoraSectionMoss } from "./ui_t2i_moss.js";

const CANVAS_W = 262;
const MAX_CANVAS_H = 360;
const MIN_BOX = 16;          // pixels of the working size
const HANDLE = 12;           // bottom-right resize corner, canvas px
const COLORS = { obj: "#4cc2ff", text: "#ffb347" };

function newBox(x, y, width, height) {
  return { x, y, width, height, metadata: { type: "obj", text: "", desc: "", palette: [] } };
}

export function mountR2ILeft(leftEl, state, ctx) {
  const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } });
  leftEl.appendChild(wrap);
  if (!Array.isArray(state.r2iBoxes)) state.r2iBoxes = [];
  let selected = state.r2iBoxes.length ? state.r2iBoxes.length - 1 : -1;

  // changing the working size keeps the layout: boxes scale with the canvas
  let { w: lastW, h: lastH } = workSize(state);
  function onSize() {
    const { w, h } = workSize(state);
    if (w !== lastW || h !== lastH) {
      const fx = w / lastW, fy = h / lastH;
      state.r2iBoxes.forEach(b => { b.x = Math.round(b.x * fx); b.width = Math.round(b.width * fx); b.y = Math.round(b.y * fy); b.height = Math.round(b.height * fy); });
      lastW = w; lastH = h; ctx.persist();
    }
    sizeCanvas(); draw();
  }
  mountSharedSettings(wrap, state, ctx, { onSize });

  // ── Canvas ───────────────────────────────────────────────────────────────
  const canvas = el("canvas", { style: { display: "block", background: "#0d0d0d", outline: `1px solid ${C.border}`, cursor: "crosshair", touchAction: "none" } });
  const g2d = canvas.getContext("2d");
  let scale = 1;
  function sizeCanvas() {
    const { w, h } = workSize(state);
    scale = Math.min(CANVAS_W / w, MAX_CANVAS_H / h);
    canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
    canvas.style.width = `${canvas.width}px`; canvas.style.height = `${canvas.height}px`;
  }
  function draw() {
    g2d.clearRect(0, 0, canvas.width, canvas.height);
    g2d.fillStyle = "#0d0d0d"; g2d.fillRect(0, 0, canvas.width, canvas.height);
    state.r2iBoxes.forEach((b, i) => {
      const color = COLORS[b.metadata?.type === "text" ? "text" : "obj"];
      const x = b.x * scale, y = b.y * scale, w = b.width * scale, h = b.height * scale;
      g2d.fillStyle = color + (i === selected ? "30" : "18"); g2d.fillRect(x, y, w, h);
      g2d.lineWidth = i === selected ? 2 : 1; g2d.strokeStyle = color; g2d.strokeRect(x + 0.5, y + 0.5, w, h);
      const tag = String(i + 1);
      g2d.font = "bold 10px sans-serif";
      const tw = g2d.measureText(tag).width + 6;
      g2d.fillStyle = color; g2d.fillRect(x, y, tw, 13);
      g2d.fillStyle = "#000"; g2d.fillText(tag, x + 3, y + 10);
      if (i === selected) { g2d.fillStyle = color; g2d.fillRect(x + w - HANDLE / 2, y + h - HANDLE / 2, HANDLE / 2, HANDLE / 2); }
    });
  }

  function pos(ev) {
    // the node sits inside ComfyUI's zoomed canvas, so the on-screen rect is not the canvas's own pixel size
    const r = canvas.getBoundingClientRect();
    return { x: (ev.clientX - r.left) * (canvas.width / r.width) / scale, y: (ev.clientY - r.top) * (canvas.height / r.height) / scale };
  }
  function hit(p) {
    for (let i = state.r2iBoxes.length - 1; i >= 0; i--) {
      const b = state.r2iBoxes[i];
      if (p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height) return i;
    }
    return -1;
  }
  const clampBox = b => {
    const { w: W, h: H } = workSize(state);
    b.width = Math.max(MIN_BOX, Math.min(W, Math.round(b.width))); b.height = Math.max(MIN_BOX, Math.min(H, Math.round(b.height)));
    b.x = Math.max(0, Math.min(W - b.width, Math.round(b.x))); b.y = Math.max(0, Math.min(H - b.height, Math.round(b.y)));
  };

  let drag = null;
  canvas.addEventListener("pointerdown", ev => {
    const p = pos(ev);
    const sel = state.r2iBoxes[selected];
    const onHandle = sel && p.x >= sel.x + sel.width - HANDLE / scale && p.x <= sel.x + sel.width + 2 && p.y >= sel.y + sel.height - HANDLE / scale && p.y <= sel.y + sel.height + 2;
    const i = onHandle ? selected : hit(p);
    canvas.setPointerCapture(ev.pointerId);
    if (i >= 0) {
      selected = i; const b = state.r2iBoxes[i];
      drag = { kind: onHandle ? "resize" : "move", ox: p.x - b.x, oy: p.y - b.y, i };
      renderList();
    } else {
      drag = { kind: "new", sx: p.x, sy: p.y };
      state.r2iBoxes.push(newBox(Math.round(p.x), Math.round(p.y), 0, 0));
      selected = state.r2iBoxes.length - 1; drag.i = selected;
    }
    draw();
  });
  canvas.addEventListener("pointermove", ev => {
    if (!drag) return;
    const p = pos(ev), b = state.r2iBoxes[drag.i]; if (!b) return;
    if (drag.kind === "move") { b.x = p.x - drag.ox; b.y = p.y - drag.oy; clampBox(b); }
    else if (drag.kind === "resize") { b.width = p.x - b.x; b.height = p.y - b.y; clampBox(b); }
    else {
      b.x = Math.min(drag.sx, p.x); b.y = Math.min(drag.sy, p.y); b.width = Math.abs(p.x - drag.sx); b.height = Math.abs(p.y - drag.sy);
      b.x = Math.max(0, b.x); b.y = Math.max(0, b.y);
    }
    draw();
  });
  const endDrag = () => {
    if (!drag) return;
    const b = state.r2iBoxes[drag.i];
    if (drag.kind === "new" && b) {
      if (b.width < MIN_BOX || b.height < MIN_BOX) { state.r2iBoxes.splice(drag.i, 1); selected = state.r2iBoxes.length - 1; }
      else clampBox(b);
    }
    drag = null; ctx.persist(); draw(); renderList();
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  const hint = el("div", { text: "Drag on empty space to draw a box · drag a box to move · drag the corner square to resize. Draw the background first.", style: { fontSize: "10px", color: C.muted, lineHeight: "1.4" } });
  wrap.appendChild(panel([label("Boxes"), el("div", { style: { display: "flex", justifyContent: "center" } }, [canvas]), hint]));

  // ── Selected box + list ──────────────────────────────────────────────────
  const listWrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "4px" } });
  const fieldStyle = { width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "5px 7px", fontSize: "11px", fontFamily: "inherit", outline: "none" };

  function renderList() {
    clear(listWrap);
    state.r2iBoxes.forEach((b, i) => {
      const type = b.metadata?.type === "text" ? "text" : "obj";
      const active = i === selected;
      const head = el("div", { style: { display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }, onclick: () => { selected = i; draw(); renderList(); } }, [
        el("span", { text: String(i + 1), style: { background: COLORS[type], color: "#000", fontSize: "10px", fontWeight: "700", borderRadius: "3px", padding: "1px 5px" } }),
        el("span", { text: type === "text" ? (b.metadata.text || "(text)") : (b.metadata.desc || "(object)"), style: { flex: "1", fontSize: "11px", color: active ? C.text : C.muted, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" } }),
      ]);
      const mini = (text, title, fn) => el("button", { type: "button", text, title, style: { cursor: "pointer", background: "transparent", color: C.muted, border: "none", fontSize: "12px", padding: "0 3px" }, onclick: e => { e.stopPropagation(); fn(); } });
      head.appendChild(mini("↑", "Move back (drawn earlier)", () => { if (i > 0) { [state.r2iBoxes[i - 1], state.r2iBoxes[i]] = [state.r2iBoxes[i], state.r2iBoxes[i - 1]]; selected = i - 1; ctx.persist(); draw(); renderList(); } }));
      head.appendChild(mini("↓", "Move forward (drawn later)", () => { if (i < state.r2iBoxes.length - 1) { [state.r2iBoxes[i + 1], state.r2iBoxes[i]] = [state.r2iBoxes[i], state.r2iBoxes[i + 1]]; selected = i + 1; ctx.persist(); draw(); renderList(); } }));
      head.appendChild(mini("✕", "Delete box", () => { state.r2iBoxes.splice(i, 1); selected = Math.min(selected, state.r2iBoxes.length - 1); ctx.persist(); draw(); renderList(); }));
      const card = el("div", { style: { display: "flex", flexDirection: "column", gap: "4px", padding: "5px", background: active ? C.bg3 : C.bg2, borderRadius: "6px", border: `1px solid ${active ? BRAND : C.border}` } }, [head]);
      if (active) {
        const typeSel = select([{ value: "obj", label: "OBJECT" }, { value: "text", label: "TEXT" }], type, v => { b.metadata.type = v; ctx.persist(); draw(); renderList(); });
        card.appendChild(typeSel);
        if (type === "text") {
          const t = el("input", { type: "text", placeholder: "Exact text to render…", style: { ...fieldStyle } });
          t.value = b.metadata.text || "";
          t.addEventListener("input", () => { b.metadata.text = t.value; ctx.persist(); });
          card.appendChild(t);
        }
        const d = el("textarea", { placeholder: type === "text" ? "Typeface, colour, carrier, legibility…" : "What is inside this box…", style: { ...fieldStyle, minHeight: "54px", resize: "vertical" } });
        d.value = b.metadata.desc || "";
        d.addEventListener("input", () => { b.metadata.desc = d.value; ctx.persist(); });
        card.appendChild(d);
        card.appendChild(el("div", { text: `x ${b.x} · y ${b.y} · ${b.width} × ${b.height}`, style: { fontSize: "10px", color: C.muted } }));
      }
      listWrap.appendChild(card);
    });
    if (!state.r2iBoxes.length) listWrap.appendChild(el("div", { text: "No boxes yet.", style: { fontSize: "11px", color: C.muted } }));
  }
  const clearBtn = button("Clear all boxes", () => {
    if (!state.r2iBoxes.length || !confirm("Delete all boxes?")) return;
    state.r2iBoxes = []; selected = -1; ctx.persist(); draw(); renderList();
  });
  wrap.appendChild(panel([label("Box list (drawing order)"), listWrap, clearBtn]));

  // ── Characters ───────────────────────────────────────────────────────────
  const chars = el("input", { type: "text", placeholder: "e.g. 1, 3", style: { ...fieldStyle, fontSize: "12px" } });
  chars.value = state.r2iCharacters || "";
  chars.addEventListener("input", () => { state.r2iCharacters = chars.value; ctx.persist(); });
  wrap.appendChild(panel([label("Characters (object box numbers)"), chars]));

  mountLoraSectionMoss(wrap, state, ctx);

  sizeCanvas(); draw(); renderList();
  return {
    getSourceURL() { return null; },
    async getGraph() { return buildR2IGraph(state); },
  };
}

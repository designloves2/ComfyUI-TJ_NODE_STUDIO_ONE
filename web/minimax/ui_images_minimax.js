// ui_images_minimax.js — image inputs for MiniMax H3 ONE STUDIO (TJ)
//
// Per SPEC §2-1 this node never generates images: first/last keyframes and reference
// images are picked from files that already exist (upload or drag-drop from disk, or
// handed over from another ONE STUDIO node's gallery).
import { C, BRAND, el, clear } from "./core_minimax.js";
import { panel, label, select, row, col } from "../klein/ui_common.js";
import { uploadImage } from "./api_minimax.js";

export function imageSlot(labelText, initialFile, onSet, { box = 132 } = {}) {
  const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "3px", alignItems: "center" } });
  const frame = el("div", { style: {
    width: `${box}px`, height: `${box}px`, background: "#000", borderRadius: "8px",
    border: `1px solid ${C.border}`, position: "relative", cursor: "pointer",
    flexShrink: "0", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
  }});
  const hint = el("div", { text: labelText, style: {
    color: C.muted, fontSize: "10px", textAlign: "center", padding: "0 6px",
    whiteSpace: "pre-line", pointerEvents: "none",
  }});
  const img = el("img", { style: {
    position: "absolute", inset: "0", width: "100%", height: "100%",
    objectFit: "contain", pointerEvents: "none", display: "none",
  }});
  const clearBtn = el("button", { type: "button", text: "✕", title: "Clear", style: {
    position: "absolute", top: "3px", right: "3px", zIndex: "3",
    background: "rgba(0,0,0,0.7)", color: "#fff", border: "none", borderRadius: "4px",
    width: "18px", height: "18px", cursor: "pointer", fontSize: "10px", padding: "0", display: "none",
  }});
  let current = null;
  function setFilename(name) {
    current = name || null;
    if (current) {
      img.src = `/view?filename=${encodeURIComponent(current)}&type=input&t=${Date.now()}`;
      img.style.display = "block"; hint.style.display = "none"; clearBtn.style.display = "block";
    } else {
      img.style.display = "none"; hint.style.display = ""; clearBtn.style.display = "none";
    }
  }
  frame.append(hint, img, clearBtn);
  wrap.appendChild(frame);

  const inp = el("input", { type: "file", accept: "image/*", style: { display: "none" } });
  wrap.appendChild(inp);
  async function take(file) {
    if (!file) return;
    const name = await uploadImage(file);
    setFilename(name); onSet(name);
  }
  inp.addEventListener("change", async () => { await take(inp.files[0]); inp.value = ""; });
  frame.addEventListener("click", e => { if (e.target === clearBtn) return; inp.click(); });
  clearBtn.addEventListener("click", e => { e.stopPropagation(); setFilename(null); onSet(null); });
  frame.addEventListener("dragover",  e => { e.preventDefault(); frame.style.borderColor = BRAND; });
  frame.addEventListener("dragleave", () => { frame.style.borderColor = C.border; });
  frame.addEventListener("drop", async e => {
    e.preventDefault(); frame.style.borderColor = C.border;
    await take(e.dataTransfer.files[0]);
  });

  setFilename(initialFile);
  return { el: wrap, setFilename, getFilename: () => current };
}

/** Mode-specific image inputs. Returns { el } and writes straight into `state`. */
export function mountImagePanel(state, ctx) {
  const wrap = el("div");

  function render() {
    clear(wrap);
    const mode = state.generationMode || "t2v";

    if (mode === "t2v") {
      wrap.appendChild(panel([
        label("Images"),
        el("div", { text: "Text-only mode uses no images — the whole clip comes from the prompt.",
          style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } }),
      ]));
      return;
    }

    if (mode === "firstlast") {
      const first = imageSlot("① First frame\n(click / drop)", state.firstFrameImage,
        n => { state.firstFrameImage = n; ctx.persist(); });
      const last = imageSlot("② Last frame\n(optional)", state.lastFrameImage,
        n => { state.lastFrameImage = n; ctx.persist(); });
      wrap.appendChild(panel([
        label("First / Last Keyframes"),
        el("div", { style: { display: "flex", gap: "6px", justifyContent: "center" } }, [first.el, last.el]),
        el("div", { html: "Both are optional. With neither, this is the same as Text only. In a relay run the "
          + "<b>Last Frame Chain</b> continuity mode overwrites ① for every clip after the first.",
          style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } }),
      ]));
      return;
    }

    // reference — up to 9
    const grid = el("div", { style: { display: "flex", flexWrap: "wrap", gap: "5px", justifyContent: "center" } });
    const refs = (state.refImages || []).slice(0, 9);
    for (let i = 0; i < Math.min(9, refs.length + 1); i++) {
      const slot = imageSlot(refs[i] ? `<Picture ${i + 1}>` : "+ add\nreference", refs[i] || null,
        name => {
          const list = (state.refImages || []).slice();
          if (name) list[i] = name; else list.splice(i, 1);
          state.refImages = list.filter(Boolean).slice(0, 9);
          ctx.persist(); render();
        }, { box: 92 });
      grid.appendChild(slot.el);
    }
    wrap.appendChild(panel([
      label(`Reference Images (${refs.length}/9)`),
      grid,
      row([col([label("Reference size"), select(
        [{ value: "match", label: "match — scale to output area (faster)" },
         { value: "max",   label: "max — 2048px short edge (best identity, slower)" }],
        state.refImageSize || "match", v => { state.refImageSize = v; ctx.persist(); })])]),
      el("div", { html: "Refer to them in the prompt as <code>&lt;Picture 1&gt;</code>, <code>&lt;Picture 2&gt;</code>… "
        + "Reference tokens ride through every sampling step, so 'max' can be several times slower.",
        style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } }),
    ]));
  }

  ctx._rerenderImages = render;
  render();
  return { el: wrap, render };
}

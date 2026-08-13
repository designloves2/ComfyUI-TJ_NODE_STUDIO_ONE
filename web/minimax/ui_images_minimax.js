// ui_images_minimax.js — image inputs for MiniMax H3 ONE STUDIO (TJ)
//
// Per SPEC §2-1 this node never generates images: first/last keyframes and reference
// images are picked from files that already exist (upload or drag-drop from disk, or
// handed over from another ONE STUDIO node's gallery).
import { C, BRAND, el, clear } from "./core_minimax.js";
import { panel, label, select, numberField, row, col } from "../klein/ui_common.js";
import { uploadImage, getMediaFiles, uploadMedia } from "./api_minimax.js";

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

// ── reference type picker ─────────────────────────────────────────────────────
// The model takes 9 images + 3 videos + 3 audios; showing all of that at once makes
// the side panel unusable, so the kinds are opt-in from a small checkbox dropdown.
const REF_KINDS = [
  { key: "images", label: "Images", max: 9 },
  { key: "videos", label: "Videos", max: 3 },
  { key: "audios", label: "Audios", max: 3 },
];

function refTypeDropdown(state, ctx, onChange) {
  const wrap = el("div", { style: { position: "relative" } });
  const counts = () => ({
    images: (state.refImages || []).filter(Boolean).length,
    videos: (state.refVideos || []).filter(v => v && v.file).length,
    audios: (state.refAudios || []).filter(a => a && a.file).length,
  });
  const btn = el("button", { type: "button", style: {
    width: "100%", cursor: "pointer", fontFamily: "inherit", fontSize: "11px",
    padding: "6px 8px", borderRadius: "6px", background: C.bg2, color: C.text,
    border: `1px solid ${C.border}`, textAlign: "left",
    display: "flex", alignItems: "center", gap: "6px",
  }});
  const btnText = el("span", { style: { flex: "1" } });
  btn.append(btnText, el("span", { text: "▾", style: { color: C.muted } }));

  const menu = el("div", { style: {
    display: "none", position: "absolute", top: "calc(100% + 3px)", left: "0", right: "0",
    zIndex: "50", background: C.bg2, border: `1px solid ${BRAND}`, borderRadius: "6px",
    padding: "5px", flexDirection: "column", gap: "2px",
    boxShadow: "0 6px 18px rgba(0,0,0,0.55)",
  }});

  function refreshLabel() {
    const c = counts();
    const on = REF_KINDS.filter(k => state.refTypes?.[k.key]);
    btnText.textContent = on.length
      ? on.map(k => `${k.label} ${c[k.key]}/${k.max}`).join(" · ")
      : "no reference types selected";
    btnText.style.color = on.length ? C.text : C.warn;
  }

  function buildMenu() {
    clear(menu);
    const c = counts();
    REF_KINDS.forEach(k => {
      const chk = el("input", { type: "checkbox" });
      chk.checked = !!state.refTypes?.[k.key];
      chk.addEventListener("change", () => {
        state.refTypes = { ...(state.refTypes || {}), [k.key]: chk.checked };
        ctx.persist(); refreshLabel(); onChange?.();
      });
      const line = el("label", { style: {
        display: "flex", alignItems: "center", gap: "7px", fontSize: "11px",
        color: C.text, cursor: "pointer", padding: "4px 5px", borderRadius: "4px",
      }}, [chk, el("span", { text: k.label, style: { flex: "1" } }),
           el("span", { text: `${c[k.key]}/${k.max}`, style: { color: C.muted, fontSize: "10px" } })]);
      line.addEventListener("mouseenter", () => line.style.background = C.bg3);
      line.addEventListener("mouseleave", () => line.style.background = "transparent");
      menu.appendChild(line);
    });
  }

  btn.addEventListener("click", e => {
    e.stopPropagation();
    const open = menu.style.display !== "none";
    if (open) { menu.style.display = "none"; return; }
    buildMenu(); menu.style.display = "flex";
    const close = ev => {
      if (wrap.contains(ev.target)) return;
      menu.style.display = "none";
      document.removeEventListener("mousedown", close);
    };
    setTimeout(() => document.addEventListener("mousedown", close), 0);
  });

  refreshLabel();
  wrap.append(btn, menu);
  return { el: wrap, refreshLabel };
}

// A single reference video / audio row: file picker + in/out seconds.
function mediaRow(kind, entry, idx, files, ctx, state, onRefresh) {
  const isVideo = kind === "video";
  const box = el("div", { style: {
    background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "6px",
    padding: "6px", display: "flex", flexDirection: "column", gap: "4px",
  }});

  const hdr = el("div", { style: { display: "flex", alignItems: "center", gap: "5px" } });
  hdr.appendChild(el("div", { text: `<${isVideo ? "Video" : "Audio"} ${idx + 1}>`, style: {
    fontSize: "10px", fontWeight: "700", color: BRAND, flex: "1" } }));
  const del = el("button", { type: "button", text: "✕", title: "Remove", style: {
    cursor: "pointer", background: "transparent", color: C.muted, border: "none", fontSize: "10px" } });
  del.addEventListener("click", () => {
    const list = isVideo ? state.refVideos : state.refAudios;
    list.splice(idx, 1); ctx.persist(); onRefresh();
  });
  hdr.appendChild(del);

  const opts = ["", ...files];
  const sel = select(opts.map(f => ({ value: f, label: f || "— pick a file —" })), entry.file || "",
    v => { entry.file = v; ctx.persist(); onRefresh(); });

  const up = el("button", { type: "button", text: "⬆ upload", style: {
    cursor: "pointer", fontFamily: "inherit", fontSize: "10px", padding: "4px 8px",
    borderRadius: "5px", background: C.bg3, color: C.text, border: `1px solid ${C.border}`,
  }});
  const inp = el("input", { type: "file", accept: isVideo ? "video/*" : "audio/*", style: { display: "none" } });
  up.addEventListener("click", () => inp.click());
  inp.addEventListener("change", async () => {
    const f = inp.files[0]; inp.value = "";
    if (!f) return;
    up.textContent = "…";
    try { entry.file = await uploadMedia(f); ctx.persist(); onRefresh(); }
    catch (e) { ctx.showPopup?.(e.message, true); up.textContent = "⬆ upload"; }
  });

  const dur = Math.max(0, (Number(entry.end) || 0) - (Number(entry.start) || 0));
  const durTag = el("div", { text: `${dur.toFixed(2)}s`, style: {
    fontSize: "10px", color: dur > 0 ? C.muted : C.warn, textAlign: "center", paddingTop: "6px" } });

  box.append(hdr, row([col([sel]), col([up])]));
  box.appendChild(row([
    col([label("in (s)"),  numberField(entry.start ?? 0, v => { entry.start = Math.max(0, v); ctx.persist(); onRefresh(); }, 0.5)]),
    col([label("out (s)"), numberField(entry.end ?? 5,   v => { entry.end   = Math.max(0, v); ctx.persist(); onRefresh(); }, 0.5)]),
    col([durTag]),
  ]));
  if (isVideo) {
    const chk = el("input", { type: "checkbox" });
    chk.checked = entry.withAudio !== false;
    chk.addEventListener("change", () => { entry.withAudio = chk.checked; ctx.persist(); });
    box.appendChild(el("label", { style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "10px", color: C.text, cursor: "pointer" } },
      [chk, el("span", { text: "also use this clip's soundtrack" })]));
  }
  box.appendChild(inp);
  return box;
}

/** Mode-specific image inputs. Returns { el } and writes straight into `state`. */
export function mountImagePanel(state, ctx) {
  const wrap = el("div");
  let mediaFiles = { videos: [], audios: [] };
  let mediaLoaded = false;

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

    // ── reference mode: images (9) + videos (3) + audios (3), opt-in per kind ──
    const types = state.refTypes || { images: true };
    const picker = refTypeDropdown(state, ctx, render);
    const kids = [label("Reference"), picker.el];

    if (types.images) {
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
      kids.push(label(`Images (${refs.length}/9)`), grid);
      kids.push(row([col([label("Reference size"), select(
        [{ value: "match", label: "match — scale to output area (faster)" },
         { value: "max",   label: "max — 2048px short edge (best identity, slower)" }],
        state.refImageSize || "match", v => { state.refImageSize = v; ctx.persist(); })])]));
    }

    if (types.videos) {
      const vids = state.refVideos || (state.refVideos = []);
      kids.push(label(`Videos (${vids.filter(v => v.file).length}/3)`));
      if (ctx.availability && Object.keys(ctx.availability).length && !ctx.availability.VHS_LoadVideo) {
        kids.push(el("div", { html: "⚠ <code>VHS_LoadVideo</code> (VideoHelperSuite) is not installed — reference videos are skipped.",
          style: { fontSize: "10px", color: C.warn, lineHeight: "1.5" } }));
      }
      vids.slice(0, 3).forEach((v, i) => kids.push(mediaRow("video", v, i, mediaFiles.videos, ctx, state, render)));
      if (vids.length < 3) {
        const add = el("button", { type: "button", text: "+ Add reference video", style: {
          width: "100%", cursor: "pointer", fontFamily: "inherit", fontSize: "11px", padding: "6px",
          borderRadius: "6px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
        }});
        add.addEventListener("click", () => { vids.push({ file: "", start: 0, end: 5, withAudio: true }); ctx.persist(); render(); });
        kids.push(add);
      }
      kids.push(el("div", { html: "Frames are pulled at 24fps between <b>in</b> and <b>out</b>; the model was trained on ~2-15s references.",
        style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } }));
    }

    if (types.audios) {
      const auds = state.refAudios || (state.refAudios = []);
      kids.push(label(`Audios (${auds.filter(a => a.file).length}/3)`));
      if (ctx.availability && Object.keys(ctx.availability).length && !ctx.availability.TrimAudioDuration) {
        kids.push(el("div", { html: "⚠ <code>TrimAudioDuration</code> missing — audio is used whole, in/out is ignored.",
          style: { fontSize: "10px", color: C.warn, lineHeight: "1.5" } }));
      }
      auds.slice(0, 3).forEach((a, i) => kids.push(mediaRow("audio", a, i, mediaFiles.audios, ctx, state, render)));
      if (auds.length < 3) {
        const add = el("button", { type: "button", text: "+ Add reference audio", style: {
          width: "100%", cursor: "pointer", fontFamily: "inherit", fontSize: "11px", padding: "6px",
          borderRadius: "6px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
        }});
        add.addEventListener("click", () => { auds.push({ file: "", start: 0, end: 5 }); ctx.persist(); render(); });
        kids.push(add);
      }
    }

    kids.push(el("div", { html: "Prompt tags follow input order per type: <code>&lt;Picture i&gt;</code> · "
      + "<code>&lt;Video k&gt;</code> · <code>&lt;Audio j&gt;</code>.",
      style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } }));
    wrap.appendChild(panel(kids));

    // file lists come from the loader nodes' own combos — fetch once, then re-render
    if (!mediaLoaded && (types.videos || types.audios)) {
      mediaLoaded = true;
      getMediaFiles().then(f => { mediaFiles = f; render(); }).catch(() => {});
    }
  }

  ctx._rerenderImages = render;
  render();
  return { el: wrap, render };
}

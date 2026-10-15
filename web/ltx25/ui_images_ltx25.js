// ui_images_ltx25.js — image inputs for LTX 2.5 ONE STUDIO (TJ)
//
// Per SPEC §2-1 this node never generates images: first/last keyframes and reference
// images are picked from files that already exist (upload or drag-drop from disk, or
// handed over from another ONE STUDIO node's gallery).
import { C, BRAND, el, clear, normalizeAssetRef } from "./core_ltx25.js";
import { mountLibraryRefs, emptyAssetRef, sourceToggle } from "../shared/reflib_refpanel.js";
import { panel, label } from "../klein/ui_common.js";
import { uploadImage } from "./api_ltx25.js";
import { openImageGalleryPicker } from "../shared/ui_image_gallery_picker.js";

// box default 132 -> 92: fits 3 reference-image slots per row instead of 2 (user: "미니맥스
// 이미지 업로드 카드가 지금 한줄에 2개인데... 3개로 나오게"), sized to still fit 3 per row
// after LEFT_W was brought back down to 330 in core_ltx25.js (92*3 + 2 gaps of 5 = 286,
// fits inside a 330px panel with its own padding/scrollbar reserve).
export function imageSlot(labelText, initialFile, onSet, { box = 92 } = {}) {
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
  // Local upload (click/drag the box) isn't the only way in — this also picks straight from
  // any of the 5 image tools' own galleries (copies into ComfyUI's input folder first).
  const galleryBtn = el("button", { type: "button", text: "🖼", title: "Pick from a gallery", style: {
    position: "absolute", bottom: "3px", left: "3px", zIndex: "3",
    background: "rgba(0,0,0,0.7)", color: "#fff", border: "none", borderRadius: "4px",
    width: "20px", height: "20px", cursor: "pointer", fontSize: "11px", padding: "0",
  }});
  galleryBtn.addEventListener("click", e => {
    e.stopPropagation();
    openImageGalleryPicker(filename => { setFilename(filename); onSet(filename); });
  });
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
  frame.append(hint, img, clearBtn, galleryBtn);
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
  // The node-wide library assets / project (Asset tab); a clip's own override lives in Prompt Edit.
  const libraryBlock = (libMode, note) => mountLibraryRefs({
    mode: libMode, note,
    getRef: () => state.assetRef || emptyAssetRef(),
    onChange: (ref) => { state.assetRef = normalizeAssetRef(ref); ctx.persist(); ctx.refreshModes?.(); },
  }).el;
 

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
      const useLib = state.refSource === "library";
      const kids = [
        label("First / Last Keyframes"),
        sourceToggle(useLib ? "library" : "files", (src) => {
          state.refSource = src;
          if (src === "files") state.assetRef = null;
          ctx.persist(); render(); ctx.refreshModes?.();
        }),
      ];
      if (useLib) {
        // Library source: only the library block - the file slots are not shown (and not used).
        kids.push(libraryBlock("firstlast", "First / Last frames picked from the Asset tab; the file slots are not used."));
      } else {
        const first = imageSlot("① First frame\n(click / drop)", state.firstFrameImage,
          n => { state.firstFrameImage = n; ctx.persist(); });
        const last = imageSlot("② Last frame\n(optional)", state.lastFrameImage,
          n => { state.lastFrameImage = n; ctx.persist(); });
        kids.push(el("div", { style: { display: "flex", gap: "6px", justifyContent: "center" } }, [first.el, last.el]));
      }
      kids.push(el("div", { html: "One image is used as the first frame (or, if only ② is set, the last frame); two images are first + last. "
        + "The canvas takes the shape of the image given (the Aspect setting is ignored), at the same megapixels. "
        + "With neither, this is the same as Text only. <b>Last Frame Chain</b> continuity replaces ① for every clip after the first, "
        + "and a clip can swap its own images in Prompt Edit.",
        style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } }));
      wrap.appendChild(panel(kids));
      return;
    }

    wrap.appendChild(panel([
      label("Images"),
      el("div", { text: "Images are placed on each clip's timeline in Prompt Edit. Last Frame Chain continuity still starts every clip after the first from the previous clip's last frame.",
        style: { fontSize: "10px", color: C.muted, lineHeight: "1.5" } }),
    ]));

  }

  ctx._rerenderImages = render;
  render();
  return { el: wrap, render };
}

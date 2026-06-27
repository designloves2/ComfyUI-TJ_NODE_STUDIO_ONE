// ui_edit_qe.js — Edit (multi-reference) left panel for Qwen Image Edit 2511 ONE (TJ)
import { C, el, clear } from "./core_qwen2511.js";
import { panel, label, button, select, numberField, row, col } from "./ui_common_qe.js";
import { buildEditGraph } from "./graph_builder_qwen2511.js";
import { mountLoraSectionQE } from "./ui_common_qe.js";
import { uploadImage } from "./api_qwen2511.js";

const MAX_REFS = 5;

function createImgUpload(labelText, initialFile, onUpload) {
  const BOX = 192;
  const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "4px", alignItems: "center" } });
  const box  = el("div", { style: { width: `${BOX}px`, height: `${BOX}px`, background: "#000", borderRadius: "10px", border: `1px solid ${C.border}`, position: "relative", cursor: "pointer", flexShrink: "0", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }});
  const hint = el("div", { text: `${labelText}\nClick to upload`, style: { color: C.muted, fontSize: "12px", textAlign: "center", whiteSpace: "pre", pointerEvents: "none" }});
  const img  = el("img", { style: { position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none", display: "none" }});
  function setFilename(name) {
    if (name) { img.src = `/view?filename=${encodeURIComponent(name)}&type=input&t=${Date.now()}`; img.style.display = "block"; hint.style.display = "none"; }
    else       { img.style.display = "none"; hint.style.display = ""; }
  }
  box.appendChild(hint); box.appendChild(img); wrap.appendChild(box);
  const inp = el("input", { type: "file", accept: "image/*", style: { display: "none" } });
  wrap.appendChild(inp);
  inp.addEventListener("change", async () => { if (inp.files[0]) { const n = await onUpload(inp.files[0]); setFilename(n); inp.value = ""; }});
  box.addEventListener("click", () => inp.click());
  box.addEventListener("dragover", e => { e.preventDefault(); box.style.borderColor = C.brand; });
  box.addEventListener("dragleave", () => { box.style.borderColor = C.border; });
  box.addEventListener("drop", async e => { e.preventDefault(); box.style.borderColor = C.border; const f = e.dataTransfer.files[0]; if (f) { const n = await onUpload(f); setFilename(n); }});
  setFilename(initialFile);
  return { el: wrap, setFilename };
}

export function mountEditLeft(leftEl, state, ctx) {
  const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } });
  leftEl.appendChild(wrap);
  if (!Array.isArray(state.editRefImages)) state.editRefImages = [];

  const { el: img1El, setFilename: setFn1 } = createImgUpload("Image 1 (main reference)", state.editImage1 || null, async f => {
    const name = await uploadImage(f); state.editImage1 = name; ctx.persist(); return name;
  });
  wrap.appendChild(panel([label("Ref Image 1"), img1El]));

  const extraWrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } });
  wrap.appendChild(extraWrap);

  function renderExtraImages() {
    clear(extraWrap);
    state.editRefImages.forEach((imgState, i) => {
      const { el: imgEl } = createImgUpload(`Ref Image ${i + 2}`, imgState.filename || null, async f => {
        const name = await uploadImage(f); imgState.filename = name; ctx.persist(); return name;
      });
      const cardWrap  = el("div", { style: { position: "relative" } });
      const removeBtn = el("button", { type: "button", text: "✕", style: {
        position: "absolute", top: "4px", left: "4px", zIndex: "10",
        background: "rgba(180,0,0,0.85)", color: "#fff", border: "none",
        borderRadius: "50%", width: "20px", height: "20px",
        fontSize: "11px", cursor: "pointer", lineHeight: "20px", padding: "0", fontWeight: "700",
      }});
      removeBtn.addEventListener("click", () => { state.editRefImages.splice(i, 1); ctx.persist(); renderExtraImages(); ctx.resizeNode?.(); });
      cardWrap.appendChild(removeBtn);
      cardWrap.appendChild(panel([label(`Ref Image ${i + 2}`), imgEl]));
      extraWrap.appendChild(cardWrap);
    });
    if (state.editRefImages.length < MAX_REFS - 1) {
      const addBtn = button("+ Add Ref Image", () => { state.editRefImages.push({ filename: null }); ctx.persist(); renderExtraImages(); ctx.resizeNode?.(); });
      extraWrap.appendChild(addBtn);
    }
  }
  renderExtraImages();

  wrap.appendChild(panel([
    label("Output Size Source"),
    select(
      [{ value: "img1", label: "Match Image 1 size" }, { value: "manual", label: "Manual" }],
      state.editSizeSource || "img1",
      v => { state.editSizeSource = v; ctx.persist(); }
    ),
  ]));

  wrap.appendChild(panel([
    row([
      col([label("Steps"), numberField(state.steps ?? 20, v => { state.steps = v; ctx.persist(); }, 1)]),
      col([label("CFG"),   numberField(state.cfg   ?? 4,  v => { state.cfg   = v; ctx.persist(); }, 0.1)]),
    ]),
    row([
      col([label("Sampler"),   select(["euler","euler_ancestral","er_sde","heun","dpm_pp_2m"], state.sampler   || "euler", v => { state.sampler   = v; ctx.persist(); })]),
      col([label("Scheduler"), select(["simple","normal","karras","exponential","sgm_uniform","beta"],        state.scheduler || "simple", v => { state.scheduler = v; ctx.persist(); })]),
    ]),
  ]));

  mountLoraSectionQE(wrap, state, ctx);

  return {
    getSourceURL: () => state.editImage1 ? `/view?filename=${encodeURIComponent(state.editImage1)}&type=input` : null,
    async getGraph() { return buildEditGraph(state); },
    setImage(name) { state.editImage1 = name; setFn1(name); ctx.persist(); },
  };
}

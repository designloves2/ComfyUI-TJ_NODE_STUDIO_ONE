// ui_rebg.js — RE-BG mode (RMBG 서브젝트 분리 + 배경 확장 재생성)
import { C, el } from "./core.js";
import { panel, label, slider, numberField, row, col } from "./ui_common.js";
import { t } from "../shared/i18n.js";
import { getModels, uploadImage } from "./api.js";
import { buildReBGGraph } from "./graph_builder.js";
import { mountLoraSection } from "./ui_lora_section.js";
import { createImageUpload } from "./ui_image_upload.js";

export function mountReBGLeft(leftEl, state, ctx) {
  const wrap = el("div", { style:{ display:"flex", flexDirection:"column", gap:"6px" } });
  leftEl.appendChild(wrap);

  // ── BG 제거 모델 선택 ──────────────────────────────────────────────────
  const modelWrap = el("div");
  function renderModelPicker(data) {
    const models = data?.bgremoval_models?.length ? data.bgremoval_models : ["none"];
    if (!state.rebgBgModel || !models.includes(state.rebgBgModel)) {
      state.rebgBgModel = models[0];
      ctx.persist();
    }
    modelWrap.innerHTML = "";
    const sel = el("select", { style:{
      width:"100%", boxSizing:"border-box", background:C.bg2, color:C.text,
      border:`1px solid ${C.border}`, borderRadius:"6px", padding:"6px",
      fontSize:"12px", fontFamily:"inherit", outline:"none",
    }});
    models.forEach(m => {
      const opt = el("option", { value:m, text:m });
      if (m === state.rebgBgModel) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", e => { state.rebgBgModel = e.target.value; ctx.persist(); });
    modelWrap.appendChild(panel([label("BG Removal Model"), sel]));
  }
  renderModelPicker({});
  fetch("/z_image_turbo/bgremoval_models")
    .then(r => r.json())
    .then(d => renderModelPicker({ bgremoval_models: d.models || [] }))
    .catch(() => {});
  wrap.appendChild(modelWrap);

  // ── 소스 이미지 ────────────────────────────────────────────────────────
  const srcUp = createImageUpload({
    label: "Source Image",
    initialFilename: state.rebgImage,
    onUpload: async f => {
      const n = await uploadImage(f);
      state.rebgImage = n;
      ctx.persist();
      return n;
    },
  });
  wrap.appendChild(panel([label("Source Image"), srcUp.el]));

  // ── 서브젝트 마스크 엣지 ───────────────────────────────────────────────
  wrap.appendChild(panel([
    label("Subject Edge"),
    el("div", {
      text: t("rebg_edge_offset"),
      style:{ color:C.muted, fontSize:"10px", marginBottom:"2px" },
    }),
    slider(-30, 30, 1, state.rebgOffset ?? 0,
      v => { state.rebgOffset = v; ctx.persist(); },
      v => (v >= 0 ? `+${v}` : String(v)) + "px"),
    el("div", {
      text: t("rebg_edge_blur"),
      style:{ color:C.muted, fontSize:"10px", marginTop:"6px", marginBottom:"2px" },
    }),
    slider(0, 40, 1, state.rebgBlur ?? 0,
      v => { state.rebgBlur = v; ctx.persist(); },
      v => v + "px"),
  ]));

  // ── 확장 크기 (선택사항 — 0이면 배경만 재생성) ─────────────────────────
  function padField(lbl, key) {
    const f = numberField(state[key] ?? 0, v => { state[key] = Math.max(0, v); ctx.persist(); }, 64);
    return col([label(lbl), f]);
  }
  wrap.appendChild(panel([
    label(t("rebg_expansion")),
    el("div", { style: { color: "#FFD700", fontSize: "11px", padding: "4px 6px", background: "rgba(255,215,0,0.07)", border: "1px solid rgba(255,215,0,0.25)", borderRadius: "5px", marginBottom: "6px" },
      text: t("rebg_expansion_note") }),
    row([padField("Up",    "rebgUp"),    padField("Down",  "rebgDown")]),
    row([padField("Left",  "rebgLeft"),  padField("Right", "rebgRight")]),
  ]));

  // ── Feathering (패딩 확장 경계 페더링) ────────────────────────────────
  wrap.appendChild(panel([
    label("Expansion Edge Feathering px"),
    el("div", {
      text: t("rebg_feather_note"),
      style:{ color:C.muted, fontSize:"10px", marginBottom:"4px" },
    }),
    slider(0, 128, 4, state.rebgFeather ?? 40,
      v => { state.rebgFeather = v; ctx.persist(); }, v => String(v)),
  ]));

  // ── BG Denoise ─────────────────────────────────────────────────────────
  wrap.appendChild(panel([
    label("Background Denoise"),
    el("div", {
      text: t("rebg_denoise_desc"),
      style:{ color:C.muted, fontSize:"10px", marginBottom:"4px" },
    }),
    slider(0.5, 1, 0.01, state.rebgDenoise ?? 1,
      v => { state.rebgDenoise = v; ctx.persist(); }, v => v.toFixed(2)),
  ]));

  mountLoraSection(wrap, state, ctx);

  return {
    beforeGenerate: async () => {
      if (!state.rebgImage)   throw new Error("소스 이미지를 업로드하세요.");
      if (!state.rebgBgModel || state.rebgBgModel === "none")
        throw new Error("BG Removal 모델을 선택하세요.");
    },
    getGraph() { return buildReBGGraph(state); },
    getSourceURL() {
      return state.rebgImage
        ? `/view?filename=${encodeURIComponent(state.rebgImage)}&type=input`
        : null;
    },
  };
}

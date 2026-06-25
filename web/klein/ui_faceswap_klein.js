// ui_faceswap_klein.js — Faceswap left panel for flux2 klein One (TJ)
import { C, el } from "./core_klein.js";
import { panel, label, slider, numberField, select, loraSelect, row, col, button } from "./ui_common.js";
import { buildFaceswapGraph } from "./graph_builder_klein.js";
import { createImageUpload } from "./ui_image_upload.js";
import { uploadImage } from "./api_klein.js";
import { t } from "../shared/i18n.js";

const SAMPLERS   = ["euler","euler_ancestral","er_sde","dpm_2","dpm_2_ancestral","lms","dpm_fast","heun","dpm_pp_2m"];
const SCHEDULERS = ["simple","normal","karras","exponential","sgm_uniform","beta"];

function mountFaceswapLoraSection(leftEl, state, ctx) {
  const wrap = el("div");
  leftEl.appendChild(wrap);
  const avail = () => ctx.availableLoras || ["none"];

  // BFS LoRA는 state.bfsLora 에 별도 저장 (일반 LoRA state.loras 와 독립)
  function getBfs() { return state.bfsLora || null; }
  function setBfs(v) { state.bfsLora = v; ctx.persist(); }

  function render() {
    wrap.replaceChildren();
    const lora = getBfs();

    const nameOpts = ["none", ...avail().filter(n => n !== "none")];

    const items = lora ? (() => {
      const { el: loraSelEl, setValue: setLoraVal } = loraSelect(nameOpts, lora.name || "none", v => {
        lora.name = v; setBfs(lora);
      });
      const strIn = el("input", { type: "number", step: "0.05", min: "0", max: "2", style: {
        width: "50px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
        borderRadius: "4px", padding: "4px", fontSize: "12px", fontFamily: "inherit", outline: "none", boxSizing: "border-box",
      }});
      strIn.value = lora.strength ?? 1;
      strIn.addEventListener("input", () => { lora.strength = parseFloat(strIn.value) || 1; setBfs(lora); });
      const tog = el("button", { type: "button", text: lora.enabled !== false ? "ON" : "OFF", style: {
        cursor: "pointer", fontFamily: "inherit", fontSize: "10px", padding: "3px 6px",
        borderRadius: "10px", border: "none",
        background: lora.enabled !== false ? C.lime : "#444", color: "#fff", fontWeight: "700",
      }, onclick: () => { lora.enabled = lora.enabled === false; setBfs(lora); render(); }});
      const del = el("button", { type: "button", text: "✕", style: {
        cursor: "pointer", fontFamily: "inherit", fontSize: "11px",
        background: "transparent", color: C.err, border: "none", padding: "2px 4px",
      }, onclick: () => { state.bfsLora = null; ctx.persist(); render(); ctx.resizeNode?.(); }});
      return el("div", { style: { display: "flex", flexDirection: "column", gap: "3px", padding: "5px", background: C.bg2, borderRadius: "6px", border: `1px solid ${C.border}` } }, [
        row([el("div", { style: { flex: "1" } }, [loraSelEl]), strIn, tog, del], "4px"),
      ]);
    })() : null;

    const addBtn = !lora
      ? button(t("bfs_lora_add"), () => { setBfs({ name: "none", strength: 1, enabled: true }); render(); ctx.resizeNode?.(); })
      : null;

    const children = [label(t("bfs_lora_label")), ...(items ? [items] : [])];
    if (addBtn) children.push(addBtn);
    wrap.appendChild(panel(children));
    ctx.resizeNode?.();
  }

  render();
}

export function mountFaceswapLeft(leftEl, state, ctx) {
  const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } });
  leftEl.appendChild(wrap);

  const { el: targetEl, setFilename: setTargetFn } = createImageUpload({
    label: "Target Image (scene)",
    initialFilename: state.faceswapTarget || null,
    onUpload: async f => {
      const name = await uploadImage(f);
      state.faceswapTarget = name; ctx.persist();
      return name;
    },
  });
  wrap.appendChild(panel([label("Target Image (scene)"), targetEl]));

  const { el: sourceEl, setFilename: setSourceFn } = createImageUpload({
    label: "Source Face",
    initialFilename: state.faceswapSource || null,
    onUpload: async f => {
      const name = await uploadImage(f);
      state.faceswapSource = name; ctx.persist();
      return name;
    },
  });
  wrap.appendChild(panel([label("Source Face"), sourceEl]));

  wrap.appendChild(panel([
    label("Denoise"),
    slider(0, 1, 0.01, state.faceswapDenoise ?? 1.0, v => { state.faceswapDenoise = v; ctx.persist(); }, v => v.toFixed(2)),
  ]));

  wrap.appendChild(panel([
    row([
      col([label("STEPS"),     numberField(state.steps ?? 4,  v => { state.steps = v; ctx.persist(); }, 1)]),
      col([label("CFG"),       numberField(state.cfg   ?? 1,  v => { state.cfg   = v; ctx.persist(); }, 0.1)]),
    ]),
    row([
      col([label("SAMPLER"),   select(SAMPLERS,   state.sampler   || "er_sde", v => { state.sampler   = v; ctx.persist(); })]),
      col([label("SCHEDULER"), select(SCHEDULERS, state.scheduler || "simple", v => { state.scheduler = v; ctx.persist(); })]),
    ]),
  ]));

  // BFS LORA 안내 메시지
  wrap.appendChild(el("div", { style: {
    color: "#FFD700", fontSize: "11px", fontWeight: "600", padding: "6px 8px",
    background: "rgba(255,215,0,0.08)", border: "1px solid rgba(255,215,0,0.3)",
    borderRadius: "6px",
  }, text: t("bfs_lora_warn") }));

  // Faceswap용 단일 LoRA 섹션 (최대 1개)
  mountFaceswapLoraSection(wrap, state, ctx);

  return {
    getSourceURL: () => state.faceswapTarget ? `/view?filename=${encodeURIComponent(state.faceswapTarget)}&type=input` : null,
    async getGraph() { return buildFaceswapGraph(state); },
    setImage(name)  { state.faceswapTarget = name; setTargetFn(name); ctx.persist(); },
    setImage2(name) { state.faceswapSource = name; setSourceFn(name); ctx.persist(); },
  };
}

// ui_controlnet_krea2.js — shared ControlNet panel for Krea 2 ONE STUDIO (TJ)
// The depth / canny Control LoRAs are configured once in ⚙ Settings. Each mode
// (T2I / I2I) toggles ON/OFF, picks depth or canny, supplies a source image, and
// can preview the depth/canny map before generating.
import { C, BRAND, el, clear, DEPTH_CKPTS, safeDepthCkpt } from "./core_krea2.js";
import { panel, label, slider, select, numberField, row, col } from "../klein/ui_common.js";
import { uploadImage, queuePrompt } from "./api_krea2.js";
import { buildControlPreviewGraph, controlLoraForType, controlOutputSize } from "./graph_builder_krea2.js";

function ctrlImgUpload(labelText, initialFile, onUpload, onLoad) {
  const BOX = 192;
  const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "4px", alignItems: "center" } });
  const box = el("div", { style: {
    width: `${BOX}px`, height: `${BOX}px`, background: "#000", borderRadius: "10px",
    border: `1px solid ${C.border}`, position: "relative", cursor: "pointer",
    flexShrink: "0", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
  }});
  const hint = el("div", { text: `${labelText}\nClick or drag to upload`, style: { color: C.muted, fontSize: "12px", textAlign: "center", whiteSpace: "pre", pointerEvents: "none" }});
  const img  = el("img", { style: { position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none", display: "none" }});
  img.addEventListener("load", () => { if (onLoad && img.naturalWidth > 0) onLoad(img.naturalWidth, img.naturalHeight); });
  let currentFile = null;
  function setFilename(name) {
    currentFile = name;
    if (name) { img.src = `/view?filename=${encodeURIComponent(name)}&type=input&t=${Date.now()}`; img.style.display = "block"; hint.style.display = "none"; }
    else       { img.style.display = "none"; hint.style.display = ""; }
  }
  box.appendChild(hint); box.appendChild(img); wrap.appendChild(box);
  const inp = el("input", { type: "file", accept: "image/*", style: { display: "none" } });
  wrap.appendChild(inp);
  inp.addEventListener("change", async () => { if (inp.files[0]) { const n = await onUpload(inp.files[0]); setFilename(n); inp.value = ""; }});
  box.addEventListener("click", () => inp.click());
  box.addEventListener("dragover", e => { e.preventDefault(); box.style.borderColor = C.lime; });
  box.addEventListener("dragleave", () => { box.style.borderColor = C.border; });
  box.addEventListener("drop", async e => { e.preventDefault(); box.style.borderColor = C.border; const f = e.dataTransfer.files[0]; if (f) { const n = await onUpload(f); setFilename(n); }});
  setFilename(initialFile);
  return { el: wrap, setFilename, getFilename: () => currentFile };
}

// mode: "t2i" | "i2i" — picks the enabled flag + control image state keys
export function mountControlNetSection(wrapEl, state, ctx, mode) {
  const enabledKey = mode === "t2i" ? "t2iControlEnabled" : "i2iControlEnabled";
  const imageKey   = mode === "t2i" ? "t2iControlImage"   : "i2iControlImage";
  const wKey       = mode === "t2i" ? "t2iControlImageW"  : "i2iControlImageW";
  const hKey       = mode === "t2i" ? "t2iControlImageH"  : "i2iControlImageH";

  const wrap = el("div");
  wrapEl.appendChild(wrap);
  let getCtrlFile = () => state[imageKey] || null;

  function render() {
    clear(wrap);
    const enabled = state[enabledKey] ?? false;

    const toggleBtn = el("button", { type: "button", text: enabled ? "ON" : "OFF", style: {
      cursor: "pointer", fontFamily: "inherit", fontSize: "10px", padding: "3px 10px",
      borderRadius: "10px", border: "none",
      background: enabled ? C.lime : "#444", color: "#fff", fontWeight: "700",
    }});
    toggleBtn.addEventListener("click", () => { state[enabledKey] = !enabled; ctx.persist(); render(); });

    const header = row([
      el("div", { text: "ControlNet (Krea2 Control LoRA)", style: { color: C.muted, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.04em", flex: "1" } }),
      toggleBtn,
    ]);

    if (!enabled) { wrap.appendChild(panel([header])); return; }

    // ── Type selector: depth / canny ─────────────────────────────────────────
    const type = state.controlType || "depth";
    function typeBtn(key, text) {
      const active = type === key;
      const b = el("button", { type: "button", text, style: {
        flex: "1", cursor: "pointer", fontFamily: "inherit", fontSize: "11px", padding: "5px 0",
        borderRadius: "6px", fontWeight: active ? "700" : "400",
        background: active ? BRAND : C.bg2, color: "#fff",
        border: `1px solid ${active ? BRAND : C.border}`,
      }});
      b.addEventListener("click", () => { state.controlType = key; ctx.persist(); render(); });
      return b;
    }
    const typeRow = el("div", { style: { display: "flex", gap: "6px" } }, [
      typeBtn("canny", "✏️ Canny"), typeBtn("depth", "🌊 Depth"),
    ]);

    // Tip: what each type is good for (canny = exact pose, depth = composition).
    const tip = el("div", { style: {
      fontSize: "10px", color: C.text, lineHeight: "1.55", background: C.bg2,
      border: `1px solid ${C.border}`, borderRadius: "6px", padding: "7px 9px",
    }});
    tip.innerHTML = type === "canny"
      ? "💡 <b>Canny</b> — 윤곽선을 정확히 고정해 <b>포즈·얼굴 방향·실루엣</b>을 충실히 재현합니다. 특정 포즈(고개 각도 등)를 그대로 살릴 때 권장."
        + "<br>※ LoRA 기반이라 100% 픽셀 정밀은 아닙니다. 강한 대비의 엣지가 잘 잡힙니다."
      : "💡 <b>Depth</b> — <b>전체 구도·프레이밍·스케일</b>(몸 위치·거리감)을 잡습니다. 머리 기울기 같은 세밀한 포즈는 느슨 → 정확한 포즈엔 Canny를 쓰세요."
        + "<br>※ LoRA 기반이라 세부는 완벽하지 않습니다. 사진체 유지: 프롬프트에 <code>photo, realistic</code> 등 명시 + strength 1.0 부근.";

    // Active LoRA for this type (the LoRA FILE is registered in ⚙ Settings;
    // all tuning values are adjusted right here in the side menu).
    const loraInfo = el("div", { style: { fontSize: "11px", padding: "6px 8px", background: C.bg2, borderRadius: "6px", border: `1px solid ${C.border}` } });
    function refreshLoraInfo() {
      const lora = controlLoraForType(state, type) || "none";
      loraInfo.style.color = lora === "none" ? C.warn : C.text;
      loraInfo.textContent = lora === "none"
        ? `⚠ No ${type} Control LoRA set. Open ⚙ Settings and register the ${type} LoRA file.`
        : `${type} LoRA: ${lora}`;
    }
    refreshLoraInfo();
    let strengthLbl;
    function refreshStrengthLabel(v) { if (strengthLbl) strengthLbl.textContent = `STRENGTH (${(+v).toFixed(2)})`; }

    const sizeHint = el("div", { style: { fontSize: "10px", color: C.muted, textAlign: "center" } });
    function refreshSizeHint() {
      const fit = controlOutputSize(state, mode);
      sizeHint.textContent = fit
        ? `Output ${fit.W} × ${fit.H} (matched to control image ratio, long edge ${Math.max(state.width || 1024, state.height || 1024)})`
        : "Output size will match the control image ratio once loaded.";
    }
    const { el: ctrlImgEl, getFilename } = ctrlImgUpload("Control Image (source photo)", state[imageKey] || null, async f => {
      const name = await uploadImage(f); state[imageKey] = name; ctx.persist(); return name;
    }, (w, h) => { state[wKey] = w; state[hKey] = h; ctx.persist(); refreshSizeHint(); });
    getCtrlFile = getFilename;
    refreshSizeHint();

    // ── Adjustable params (live in the side menu, NOT Settings) ──────────────
    const paramCtrls = [];

    // Strength (shared): live label update.
    const strDefault = state.controlStrength ?? (type === "canny" ? 0.7 : 1.0);
    strengthLbl = label(`STRENGTH (${strDefault.toFixed(2)})`);
    paramCtrls.push(
      strengthLbl,
      slider(0, 3, 0.05, strDefault,
        v => { state.controlStrength = v; ctx.persist(); refreshStrengthLabel(v); },
        v => v.toFixed(2)),
    );

    if (type === "canny") {
      paramCtrls.push(
        label("Canny thresholds (low / high)"),
        slider(0, 255, 1, state.cannyLow  ?? 100, v => { state.cannyLow  = v; ctx.persist(); }, v => `low ${v}`),
        slider(0, 255, 1, state.cannyHigh ?? 200, v => { state.cannyHigh = v; ctx.persist(); }, v => `high ${v}`),
        row([col([label("Preprocessor Resolution"),
          numberField(state.preprocResolution ?? 512, v => { state.preprocResolution = v; ctx.persist(); }, 64)])]),
      );
    } else {
      // Depth encode options (moved here from Settings)
      state.depthCkpt = safeDepthCkpt(state.depthCkpt);
      paramCtrls.push(
        row([
          col([label("Depth Model"), select(
            DEPTH_CKPTS.map(n => ({ value: n, label: n.replace("depth_anything_v2_", "").replace(".pth", "") })),
            state.depthCkpt, v => { state.depthCkpt = v; ctx.persist(); })]),
          col([label("Resolution"),
            numberField(state.preprocResolution ?? 512, v => { state.preprocResolution = v; ctx.persist(); }, 64)]),
        ]),
        row([
          col([label("Channel Mode"), select(
            [{ value: "rgb", label: "RGB" }, { value: "grayscale", label: "Grayscale" }],
            state.controlChannelMode || "rgb", v => { state.controlChannelMode = v; ctx.persist(); })]),
          col([label("Normalize"), select(
            [{ value: "per_image_minmax", label: "Per-image MinMax" }, { value: "none", label: "None" }],
            state.controlNormalize || "per_image_minmax", v => { state.controlNormalize = v; ctx.persist(); })]),
        ]),
      );
      const invChk = el("input", { type: "checkbox" });
      invChk.checked = state.controlInvert ?? false;
      invChk.addEventListener("change", () => { state.controlInvert = invChk.checked; ctx.persist(); });
      paramCtrls.push(el("label", { style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: C.text, cursor: "pointer" } },
        [invChk, el("span", { text: "Invert depth (near=dark ↔ near=white)" })]));
    }

    // ── Preview box + button ─────────────────────────────────────────────────
    const previewImg = el("img", { style: { maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "none" } });
    const previewHint = el("div", { text: "Preview to see the depth/canny map", style: { color: C.muted, fontSize: "11px", textAlign: "center", padding: "0 8px" } });
    const previewBox = el("div", { style: {
      width: "100%", height: "160px", background: "#000", borderRadius: "8px",
      border: `1px solid ${C.border}`, display: "flex", alignItems: "center",
      justifyContent: "center", overflow: "hidden",
    }}, [previewHint, previewImg]);

    const previewBtn = el("button", { type: "button", text: `👁 Preview ${type}`, style: {
      width: "100%", cursor: "pointer", fontFamily: "inherit", fontSize: "12px", padding: "8px",
      borderRadius: "6px", background: C.bg2, color: C.text, border: `1px solid ${BRAND}`, fontWeight: "600",
    }});
    previewBtn.addEventListener("click", async () => {
      const file = getCtrlFile();
      if (!file) { ctx.showPopup?.("Upload a control image first.", true); return; }
      previewBtn.disabled = true; previewBtn.textContent = "⏳ Preprocessing…";
      previewHint.textContent = "Running preprocessor…"; previewHint.style.display = "block"; previewImg.style.display = "none";
      try {
        const g = buildControlPreviewGraph(state, file, type);
        const res = await queuePrompt(g);
        const im = res?.output?.images?.[0];
        if (im) {
          previewImg.src = `/view?filename=${encodeURIComponent(im.filename)}&subfolder=${encodeURIComponent(im.subfolder || "")}&type=${im.type || "temp"}&t=${Date.now()}`;
          previewImg.style.display = "block"; previewHint.style.display = "none";
        } else { previewHint.textContent = "No preview produced."; }
      } catch (e) {
        previewHint.textContent = `Preview failed: ${e.message}`;
        ctx.showPopup?.(`Preview failed: ${e.message}`, true);
      } finally { previewBtn.disabled = false; previewBtn.textContent = `👁 Preview ${type}`; }
    });

    wrap.appendChild(panel([
      header,
      typeRow,
      tip,
      label("Active Control LoRA"), loraInfo,
      label("Control Image"), ctrlImgEl, sizeHint,
      ...paramCtrls,
      previewBtn, previewBox,
      el("div", { style: { fontSize: "10px", color: C.muted, marginTop: "2px" },
        text: "Upload a normal photo — the depth/canny map is generated automatically. Only the LoRA files are registered in ⚙ Settings; all values above are adjusted here." }),
    ]));
  }

  // Only the active mode's panel is mounted at a time, so a single hook is enough.
  // Settings refresh calls ctx._rerenderControlNet() to refresh the LoRA info line.
  ctx._rerenderControlNet = render;
  render();
}

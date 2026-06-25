// ui_model_settings.js — shared "⚙ 모델 설정" panel (diffusion model / text
// encoder / VAE / LoRA list). Used by every mode screen so the model only
// has to be picked once. Returns a DOM node to insert into a panel.
import { el, clear } from "./core.js";
import { panel, label, button, select, numberField, row, col } from "./ui_common.js";
import { getModels } from "./api.js";
import { t } from "../shared/i18n.js";

export function mountModelSettings(state, ctx) {
  const settingsBody = el("div", { style: { display: state.settingsOpen ? "flex" : "none", flexDirection: "column", gap: "8px", marginTop: "8px" } });
  const settingsToggle = button(`⚙ ${t("model_settings_toggle")} ${state.settingsOpen ? "▾" : "▸"}`, () => {
    state.settingsOpen = !state.settingsOpen;
    settingsBody.style.display = state.settingsOpen ? "flex" : "none";
    settingsToggle.textContent = `⚙ ${t("model_settings_toggle")} ${state.settingsOpen ? "▾" : "▸"}`;
    ctx.persist();
  });
  settingsToggle.style.alignSelf = "flex-start";

  const modelSelectWrap = el("div");
  const teSelectWrap = el("div");
  const vaeSelectWrap = el("div");

  function rebuildModelDropdowns(data) {
    clear(modelSelectWrap);
    clear(teSelectWrap);
    clear(vaeSelectWrap);
    const diff = (data.diffusion_models || ["none"]);
    const te = (data.text_encoders || ["none"]);
    const vaes = (data.vaes || ["none"]);
    if (!state.model || !diff.includes(state.model)) state.model = diff[0];
    if (!state.textEncoder || !te.includes(state.textEncoder)) state.textEncoder = te[0];
    if (!state.vae || !vaes.includes(state.vae)) state.vae = vaes[0];

    modelSelectWrap.appendChild(col([
      label(t("diffusion_model_label")),
      select(diff, state.model, v => { state.model = v; ctx.persist(); }),
    ]));
    teSelectWrap.appendChild(col([
      label(t("text_encoder_label")),
      select(te, state.textEncoder, v => { state.textEncoder = v; ctx.persist(); }),
    ]));
    vaeSelectWrap.appendChild(col([
      label("VAE"),
      select(vaes, state.vae, v => { state.vae = v; ctx.persist(); }),
    ]));
  }

  const refreshBtn = button(t("refresh_models"), async () => {
    refreshBtn.textContent = "불러오는 중…";
    try { rebuildModelDropdowns(await getModels()); renderLoras(); }
    finally { refreshBtn.textContent = "↻ 모델 새로고침"; }
  });

  settingsBody.appendChild(row([modelSelectWrap, teSelectWrap, vaeSelectWrap]));
  settingsBody.appendChild(refreshBtn);

  // LoRA list ------------------------------------------------------------
  const loraListEl = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px", marginTop: "4px" } });
  let availableLoras = ["none"];
  function renderLoras() {
    clear(loraListEl);
    state.loras.forEach((lora, i) => {
      const nameSel = select(["none", ...availableLoras.filter(n => n !== "none")], lora.name || "none", v => { lora.name = v; ctx.persist(); });
      const strengthInput = numberField(lora.strength ?? 1, v => { lora.strength = v; ctx.persist(); }, 0.05);
      strengthInput.style.width = "70px";
      const removeBtn = button("✕", () => { state.loras.splice(i, 1); ctx.persist(); renderLoras(); }, "danger");
      loraListEl.appendChild(row([
        el("div", { style: { flex: "1" } }, [nameSel]),
        strengthInput,
        removeBtn,
      ]));
    });
    const addBtn = button("+ LoRA 추가", () => { state.loras.push({ name: availableLoras[0] || "none", strength: 1 }); ctx.persist(); renderLoras(); });
    loraListEl.appendChild(addBtn);
  }
  renderLoras();
  settingsBody.appendChild(col([label("LoRA"), loraListEl]));

  // Kick off initial model fetch
  getModels().then(data => { availableLoras = data.loras || ["none"]; rebuildModelDropdowns(data); renderLoras(); }).catch(() => {});

  return panel([settingsToggle, settingsBody]);
}

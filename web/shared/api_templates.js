// api_templates.js — custom prompt template pools, independent of any one tool's
// own config file. Two pools split by prompt style (see SPEC_ZIMAGE_TEMPLATE_SHARING.md):
//   "nl"  (natural language) — Klein, Krea2, Z-Image, Qwen2511, Anima
//   "tag" (tag/weight syntax) — SDXL
import { api } from "../../../scripts/api.js";

export async function getTemplates(pool) {
  const r = await api.fetchApi(`/shared/prompt_templates?pool=${encodeURIComponent(pool)}`);
  return r.json();
}

export async function saveTemplates(pool, templates) {
  return api.fetchApi(`/shared/prompt_templates?pool=${encodeURIComponent(pool)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ templates }),
  });
}

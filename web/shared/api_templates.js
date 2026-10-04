// api_templates.js — custom prompt templates and tag presets, one pool per tool
// (klein, zimage, krea2, qwen2511, qwen21, anima, sdxl), independent of any tool's own
// config file. The old shared pools "nl" / "tag" are still served for older clients.
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

// Tag presets: {mode: [{cat, items: [{label, prompt, dual?}]}]}; a mode that is not in
// the result has never been customised.
export async function getCategories(pool) {
  const r = await api.fetchApi(`/shared/prompt_categories?pool=${encodeURIComponent(pool)}`);
  return r.json();
}

// categories === null drops the mode's customisation, back to the built-in defaults.
export async function saveCategories(pool, mode, categories) {
  return api.fetchApi(`/shared/prompt_categories?pool=${encodeURIComponent(pool)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, categories }),
  });
}

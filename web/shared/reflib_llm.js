// reflib_llm.js — what the prompt writer needs to know about a clip whose references come from
// the asset library: the @tokens it may use and a short description of each asset.
//
// The library node (TJ_H3Reference) turns @alias / @<id> into the model's <Picture i> / <Video k> /
// <Audio j> tags itself, so the LLM must write @tokens, never numbered tags. The assets are described
// from their library record (name, category, tags, note) — the vision pass works on files in the
// input folder, which library assets are not.
import { reflib } from "./reflib_api.js";
import { assetRefActive } from "./reflib_refpanel.js";

/** The reference set a Reference-mode clip uses, or null when it uses file slots. */
export function libraryRefFor(assets, generationMode) {
  const ref = assets?.assetRef;
  return generationMode === "reference" && assetRefActive(ref, "reference") ? ref : null;
}

/**
 * @returns null (not a library clip), { error }, or { items, text } where
 *   items = [{ token, id, kind, name, label }]  (token is "@alias" or "@<id>")
 *   text  = the block to put in the LLM request
 */
export async function libraryContext(ref) {
  if (!ref) return null;
  const body = ref.project ? { mode: "project", project: ref.project, prompt: "" }
    : { mode: "assets", assets: ref.ids || [], prompt: "" };
  const [rep, listing] = await Promise.all([reflib.resolve(body), reflib.list()]);
  if (!rep.ok) return { error: `${rep.code || "ERROR"}: ${rep.detail || "could not resolve the library references"}` };
  const blocking = (rep.errors || []).find(e => e.code !== "NOT_ATTACHED");
  if (blocking) return { error: `${blocking.code}: ${blocking.message}` };
  const meta = new Map((listing.assets || []).map(a => [a.id, a]));
  const items = (rep.attached || []).map(a => {
    const m = meta.get(a.id) || {};
    // `mention` is the token the library accepts for this asset (alias, else a usable unique name, else null = use the id)
    return { token: `@${a.mention || a.alias || a.id}`, id: a.id, kind: a.kind, name: a.name, label: a.label,
      thumb: reflib.thumbUrl({ id: a.id, updated: m.updated }),
      category: a.category, tags: m.tags || [], note: m.note || "" };
  });
  if (!items.length) return { error: "The library references are empty." };
  const lines = items.map(it => {
    const bits = [`${it.token} — ${it.name} (${it.kind}${it.category ? `, ${it.category}` : ""})`];
    if (it.tags.length) bits.push(`tags: ${it.tags.join(", ")}`);
    if (it.note) bits.push(`note: ${it.note}`);
    return bits.join(" · ");
  });
  const text = "Reference assets attached to this clip. Refer to each one in the prompt ONLY by its @token, "
    + "written exactly as below (for example @" + (items[0].token.slice(1)) + "). Never write <Picture N>, <Video N> or "
    + "<Audio N> for them: the @tokens are replaced with the right tags afterwards. Use only the tokens listed here.\n"
    + lines.join("\n");
  return { items, text };
}

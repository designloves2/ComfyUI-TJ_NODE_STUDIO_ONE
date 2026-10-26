// Korean <-> English for every prompt field.
//
// A field keeps two texts: the English one is what a model gets (every generator here is prompted in English),
// the Korean one is a view of it. Typing in either view writes that slot and marks the other one as older; the
// Generate step turns a Korean-only edit into English first (ensureEnglish). Nothing here talks to a model by
// itself: translateText() takes an `llm(system, user) => text` function from the caller.
//
// Parts that must never be translated are swapped for ⟦n⟧ markers before the model sees the text and put back
// afterwards: <d>…</d> dialogue (any language), <Picture N> style tags, [Shot N] / "At MM:SS", @tokens, quoted
// text, (tag:1.2) weights and any extra words the caller lists (LoRA triggers). A translation that lost or
// doubled a marker is rejected instead of being used.

const HANGUL_RE = /[ㄱ-ㆎ가-힣]/g;
const MARK = (n) => `⟦${n}⟧`;
const MARK_RE = /⟦\s*(\d+)\s*⟧/g;

const PROTECT_PATTERNS = [
  /<d>[\s\S]*?<\/d>/g,                                   // dialogue / lyrics, any language
  /<\/?[A-Za-z][^<>\n]{0,40}>/g,                          // <Picture 1> <Video 2> <Audio 1> <Subject 1> …
  /\[Shot\s*\d+\](?:[ \t]*At\s+\d{1,2}:\d{2}(?:[.:]\d+)?[ \t]*[,:]?)?/gi,   // [Shot 2] / [Shot 2] At 00:03.500,
  /\bAt\s+\d{1,2}:\d{2}(?:[.:]\d+)?/g,                    // At 00:03.500
  /@[\w-]+/g,                                              // @tokens from the reference library (a Korean particle after it stays outside)
  /@[ㄱ-ㆎ가-힣][\wㄱ-ㆎ가-힣-]*/g,   // a token named in Korean
  /"[^"\n]{1,400}"/g,                                     // quoted speech / on-screen text
  /“[^”\n]{1,400}”/g,                      // curly quotes
  /\([^()\n]{1,80}:\s*-?\d*\.?\d+\)/g,                    // (tag:1.2)
  /https?:\/\/\S+/g,
];

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

/** Swap the protected parts for ⟦n⟧ markers. Returns { masked, tokens }. */
export function maskProtected(text, extra = []) {
  const tokens = [];
  let masked = String(text || "");
  const patterns = [...PROTECT_PATTERNS];
  const words = (extra || []).map(w => String(w || "").trim()).filter(w => w.length >= 2);
  if (words.length) patterns.push(new RegExp(words.sort((a, b) => b.length - a.length).map(escapeRe).join("|"), "g"));
  for (const re of patterns) {
    masked = masked.replace(re, (m) => { tokens.push(m); return MARK(tokens.length - 1); });
  }
  return { masked, tokens };
}

/** Put the protected parts back. Returns null when a marker is missing or appears more than once. */
export function unmaskProtected(translated, tokens) {
  const seen = new Set();
  let ok = true;
  const out = String(translated || "").replace(MARK_RE, (_, n) => {
    const i = Number(n);
    if (!(i in tokens)) return "";   // a marker the model made up
    if (seen.has(i)) { ok = false; return ""; }
    seen.add(i);
    return tokens[i];
  });
  return ok && seen.size === tokens.length ? out : null;
}

/** Hangul count outside the protected parts. */
export function hangulCount(text) {
  const { masked } = maskProtected(text);
  return (masked.match(HANGUL_RE) || []).length;
}
export function hasHangul(text) { return hangulCount(text) > 0; }

/** "ko" when the writing outside the protected parts is mostly Korean, else "en". */
export function detectLang(text) {
  const { masked } = maskProtected(text);
  const letters = (masked.match(/[A-Za-zㄱ-ㆎ가-힣]/g) || []).length;
  if (!letters) return "en";
  return (masked.match(HANGUL_RE) || []).length / letters >= 0.3 ? "ko" : "en";
}

const LANG_NAME = { en: "English", ko: "Korean" };

export const TRANSLATE_SYSTEM = (to, withMarkers = true) => [
  `You translate text between Korean and English for AI image and video prompts. Translate the user's text into ${LANG_NAME[to]}.`,
  "Rules:",
  "- Output only the translation: no preamble, no notes, no quotes around it, no markdown.",
  ...(withMarkers ? [
    "- The text contains markers like ⟦0⟧ ⟦1⟧. Copy every marker exactly as written, once each, in a sensible place. Never translate, remove, renumber or merge them.",
    "- A marker at the start of a line stays at the start of that line.",
  ] : []),
  "- Keep the structure: line breaks, blank lines, headings, labels such as Opening / Tail / Ambient sound / Music, and the order of the sentences.",
  "- Translate faithfully: do not add, drop or change any action, object, person or sound.",
  "- Keep proper names, numbers, units and technical words (camera, lens, grade, fps) as they are or in their usual form.",
  `- Write natural ${LANG_NAME[to]}, concrete and visual, in the same register as the original.`,
].join("\n");

function cleanLlmText(s) {
  let t = String(s || "").trim();
  t = t.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/, "").trim();
  return t;
}

/**
 * A marker that opens a line ([Shot 2] At 00:03.5, ...) is not sent to the model: small models drop it as noise.
 * It is kept here and put back at the start of the same line of the translation.
 */
function splitLineLeads(masked) {
  const leads = [];
  const body = String(masked).split("\n").map(line => {
    const m = line.match(/^\s*⟦(\d+)⟧[ \t]*/);
    if (!m) { leads.push(null); return line; }
    leads.push(Number(m[1]));
    return line.slice(m[0].length);
  });
  return { lines: body, leads };
}

/** The model's lines laid over the source's lines (blank lines stay where they were); null when the counts differ. */
function alignLines(outText, srcLines) {
  const out = String(outText).split("\n").filter(l => l.trim());
  const at = srcLines.map((l, i) => (l.trim() ? i : -1)).filter(i => i >= 0);
  if (out.length !== at.length) return null;
  const res = srcLines.map(() => "");
  at.forEach((i, k) => { res[i] = out[k]; });
  return res;
}

const joinLeads = (lines, leads) => lines.map((l, i) => (leads[i] == null ? l : `${MARK(leads[i])} ${l.trimStart()}`.trimEnd())).join("\n");
const HAS_LETTERS = /[A-Za-zㄱ-ㆎ가-힣]/;

/**
 * Translate `text` into `to` ("en" | "ko") with `llm(system, user)`.
 * `opts.protect`: extra words to keep (LoRA triggers). The whole text goes in one call; when the model changes the
 * number of lines or loses a protected part it is asked again, then line by line.
 */
export async function translateText(text, to, llm, opts = {}) {
  const src = String(text || "");
  if (!src.trim()) return "";
  const { masked, tokens } = maskProtected(src, opts.protect);
  // nothing left to translate (only protected parts / no letters)
  if (!HAS_LETTERS.test(masked.replace(MARK_RE, ""))) return src;
  const { lines, leads } = splitLineLeads(masked);
  const ask = async (t) => cleanLlmText(await llm(TRANSLATE_SYSTEM(to, tokens.length > 0), t));
  const finish = (outLines) => {
    const back = unmaskProtected(joinLeads(outLines, leads), tokens);
    return back == null ? null : back.trim();
  };
  let last = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await ask(lines.join("\n"));
    if (!raw) { last = "the model returned nothing"; continue; }
    const aligned = alignLines(raw, lines);
    const done = aligned ? finish(aligned) : null;
    if (done != null) return done;
    last = aligned ? "the translation lost or repeated a protected part" : "the translation changed the number of lines";
  }
  // line by line: slower, but a line cannot be merged or moved
  const out = [];
  for (const line of lines) {
    if (!HAS_LETTERS.test(line.replace(MARK_RE, ""))) { out.push(line); continue; }
    const raw = await ask(line);
    if (!raw) throw new Error("Translate failed: the model returned nothing.");
    out.push(raw.replace(/\s*\n+\s*/g, " "));
  }
  const done = finish(out);
  if (done != null) return done;
  throw new Error(`Translate failed: ${last}.`);
}

// ── Field state ─────────────────────────────────────────────────────────────
// A field is `obj[key]` (English, what the model gets) plus `obj[key + "Ko"]` (Korean), `obj[key + "Newest"]`
// ("en" | "ko" | "": which slot was written last, so the other one is older) and `obj[key + "View"]`.

export const koKey = (key) => `${key}Ko`;
export const newestKey = (key) => `${key}Newest`;
export const viewKey = (key) => `${key}View`;

/** The Korean slot, newest mark and view of `keys` in a saved object — for loaders that copy keys one by one. */
export function bilingualSlots(src, keys) {
  const out = {};
  for (const k of keys) {
    if (src?.[koKey(k)]) out[koKey(k)] = String(src[koKey(k)]);
    if (src?.[newestKey(k)]) out[newestKey(k)] = src[newestKey(k)] === "ko" ? "ko" : "en";
    if (src?.[viewKey(k)] === "ko") out[viewKey(k)] = "ko";
  }
  return out;
}

export function fieldView(obj, key) { return obj?.[viewKey(key)] === "ko" ? "ko" : "en"; }

/** The text the field shows right now. */
export function fieldText(obj, key) {
  return fieldView(obj, key) === "ko" ? String(obj?.[koKey(key)] || "") : String(obj?.[key] || "");
}

/** The user typed `text` in the field's current view. */
export function fieldEdit(obj, key, text) {
  const view = fieldView(obj, key);
  if (view === "ko") obj[koKey(key)] = text; else obj[key] = text;
  obj[newestKey(key)] = view;
}

/** Both languages from a model result (Write / Refine): the two are in step. */
export function fieldSetBoth(obj, key, en, ko) {
  obj[key] = en;
  obj[koKey(key)] = ko || "";
  obj[newestKey(key)] = "";
}

export function fieldSetView(obj, key, view) { obj[viewKey(key)] = view === "ko" ? "ko" : "en"; }

/** True when `view`'s slot is older than the other one (or missing while the other has text). */
export function fieldStale(obj, key, view) {
  const other = view === "ko" ? "en" : "ko";
  const mine = view === "ko" ? obj?.[koKey(key)] : obj?.[key];
  const theirs = other === "ko" ? obj?.[koKey(key)] : obj?.[key];
  if (!String(theirs || "").trim()) return false;
  return !String(mine || "").trim() || obj?.[newestKey(key)] === other;
}

/** Bring the slot of `view` up to date from the other one (an LLM call). */
export async function fieldFill(obj, key, view, llm, opts = {}) {
  const other = view === "ko" ? "en" : "ko";
  const from = other === "ko" ? obj[koKey(key)] : obj[key];
  const out = await translateText(from, view, llm, opts);
  if (view === "ko") obj[koKey(key)] = out; else obj[key] = out;
  obj[newestKey(key)] = "";
  return out;
}

/** Does the field need English before it can be generated from? */
export function fieldNeedsEnglish(obj, key) {
  const en = String(obj?.[key] || ""), ko = String(obj?.[koKey(key)] || "");
  if (obj?.[newestKey(key)] === "ko" && ko.trim()) return true;       // Korean was edited after the English
  return hasHangul(en);                                              // Korean typed straight into the English field
}

/**
 * Generation guard: make the English slot real. A Korean-only edit is translated into English; Korean typed
 * into the English field moves to the Korean slot and its English is written. Returns true when it changed.
 */
export async function ensureEnglish(obj, key, llm, opts = {}) {
  if (!fieldNeedsEnglish(obj, key)) return false;
  const ko = String(obj[koKey(key)] || "");
  const en = String(obj[key] || "");
  const koIsSource = obj[newestKey(key)] === "ko" && ko.trim();
  const source = koIsSource ? ko : en;
  const english = await translateText(source, "en", llm, opts);
  if (!koIsSource) obj[koKey(key)] = en;   // the Korean the user typed becomes the Korean view
  obj[key] = english;
  obj[newestKey(key)] = "";
  return true;
}

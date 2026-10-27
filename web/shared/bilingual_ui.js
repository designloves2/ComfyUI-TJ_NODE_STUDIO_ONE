// bilingual_ui.js — the KO / EN button on a prompt field. See bilingual.js for what a bilingual field stores.
//
// attachBilingual(textarea, opts) wraps the textarea, puts a small "EN | 한" button on it and returns the wrapper
// (use it where the textarea was). Typing in the Korean view writes the Korean slot only — the field's own input
// handler is kept from running, so it can never overwrite the English text with Korean. Typing in the English view
// goes through the field's own handler as before; this file only marks the English slot as the newest one.
import { fieldView, fieldText, fieldEdit, fieldSetView, fieldStale, fieldFill, koKey, newestKey, translatingTo, onTranslating } from "./bilingual.js";
import { translateLlm } from "./translate_config.js";
import { useKoFor } from "./ko_setting.js";

const BTN = {
  cursor: "pointer", fontFamily: "inherit", fontSize: "10px", fontWeight: "700", lineHeight: "1",
  padding: "3px 6px", borderRadius: "5px", border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(20,20,20,0.82)", color: "#e8e8e8",
};

/**
 * @param ta       the field's <textarea> (its own input handler stays in charge of the English view)
 * @param target   () => the object that holds the field's slots (a getter, because clip lists get re-indexed)
 * @param key      name of the English slot on that object ("text", "promptHeader", ...), or a function that returns it
 * @param persist  () => save the node state
 * @param protect  () => extra words a translation must keep (LoRA triggers)
 * @param onView   (view) => called after the view changed (a field that shows two things can redraw)
 * @param onError  (message) => show a failed translation
 * @param onInput  () => called after text was typed in the Korean view (the field's own input handler does not run there)
 */
export function attachBilingual(ta, { target, key: keyOrFn, persist = () => {}, protect = () => [], onView = null, onError = null, onInput = null }) {
  const wrap = document.createElement("div");
  Object.assign(wrap.style, { position: "relative", display: "flex", flexDirection: "column", minWidth: "0", minHeight: "0" });
  if (ta.style.flex) wrap.style.flex = ta.style.flex;
  if (ta.style.width) wrap.style.width = ta.style.width;
  ta.parentNode?.insertBefore(wrap, ta);
  wrap.appendChild(ta);
  // keeps the textarea's own height (a field with a set height) and still fills a fixed-height column
  ta.style.flex = "1 1 auto";
  ta.style.width = "100%";

  const bar = document.createElement("div");
  Object.assign(bar.style, { position: "absolute", top: "3px", right: "3px", display: "flex", gap: "3px", zIndex: "2", opacity: "0.9" });
  const toggle = document.createElement("button");
  toggle.type = "button";
  Object.assign(toggle.style, BTN);
  const refresh = document.createElement("button");
  refresh.type = "button"; refresh.textContent = "↻";
  Object.assign(refresh.style, BTN, { display: "none", color: "#ffb454", borderColor: "#ffb454" });
  bar.append(refresh, toggle);
  wrap.appendChild(bar);

  // the buttons sit left of the textarea's scrollbar, which only exists while the text overflows
  const place = () => {
    const cs = getComputedStyle(ta);
    const border = parseFloat(cs.borderRightWidth) || 0;
    const scrollbar = Math.max(0, ta.offsetWidth - ta.clientWidth - border - (parseFloat(cs.borderLeftWidth) || 0));
    bar.style.right = `${3 + border + scrollbar}px`;
  };
  new ResizeObserver(place).observe(ta);
  ta.addEventListener("input", place);
  wrap.addEventListener("mouseenter", place);

  // dark layer over the field while it is being translated (any translation: the buttons, the Generate step, Write / Refine)
  const veil = document.createElement("div");
  Object.assign(veil.style, {
    position: "absolute", inset: "0", display: "none", alignItems: "center", justifyContent: "center", zIndex: "4",
    background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: "12px", fontWeight: "600", pointerEvents: "all", cursor: "progress",
  });
  wrap.appendChild(veil);
  let wasConnected = false;
  const unsubscribe = onTranslating(() => {
    if (wrap.isConnected) wasConnected = true;
    else if (wasConnected) { unsubscribe(); return; }
    const o = obj();
    const to = o ? translatingTo(o, K()) : "";
    veil.style.display = to ? "flex" : "none";
    if (to) {
      veil.style.borderRadius = getComputedStyle(ta).borderRadius;
      veil.textContent = `⏳ 번역중 (${to === "ko" ? "한국어로" : "영어로"})…`;
    }
  });

  // "Use Korean translation" is off for this node: no button, always the English text
  let koWasOn = true;
  function syncKo() {
    const on = useKoFor(wrap);
    bar.style.display = on ? "flex" : "none";
    const o = obj();
    if (!on && o && fieldView(o, K()) === "ko") { fieldSetView(o, K(), "en"); paint(); }
    if (on !== koWasOn) { koWasOn = on; paint(); }
  }
  window.addEventListener("tj-use-ko", () => { if (wrap.isConnected) syncKo(); });
  wrap.addEventListener("mouseenter", syncKo);

  const K = () => (typeof keyOrFn === "function" ? keyOrFn() : keyOrFn);   // a field whose slot name changes (own / common header)
  const obj = () => target();
  const fail = (e) => (onError || ((m) => console.warn("[bilingual]", m)))(String(e?.message || e));

  function paint() {
    const o = obj();
    if (!o) return;
    const view = fieldView(o, K());
    ta.value = fieldText(o, K());
    toggle.textContent = view === "ko" ? "한" : "EN";
    toggle.title = view === "ko" ? "Showing Korean — click for English" : "Showing English — click for Korean";
    const stale = fieldStale(o, K(), view);
    refresh.style.display = stale ? "" : "none";
    refresh.title = `This ${view === "ko" ? "Korean" : "English"} text is older than the ${view === "ko" ? "English" : "Korean"} one — click to translate it again`;
    place();
    if (!useKoFor(wrap)) syncKo();
  }

  // Korean view: the field's own handler must not see this input (it would write the Korean into the English slot).
  const typed = (e) => {
    const o = obj();
    if (!o) return;
    if (fieldView(o, K()) === "ko") {
      e.stopImmediatePropagation();
      fieldEdit(o, K(), ta.value);
      persist();
      onInput?.();
    } else if (e.type === "input") {
      o[K()] = ta.value;   // a popup box has no handler of its own: the English slot follows what is typed
      o[newestKey(K())] = "en";
      persist();
    }
    refresh.style.display = fieldStale(o, K(), fieldView(o, K())) ? "" : "none";
  };
  ta.addEventListener("input", typed, true);
  ta.addEventListener("change", (e) => { if (fieldView(obj(), K()) === "ko") e.stopImmediatePropagation(); }, true);

  let busy = false;
  async function run(view) {
    if (busy) return;
    busy = true;
    const label = toggle.textContent;
    toggle.textContent = "…"; toggle.disabled = true; refresh.disabled = true;
    try {
      await fieldFill(obj(), K(), view, translateLlm(), { protect: protect() });
      persist();
    } catch (e) { fail(e); }
    finally { toggle.disabled = false; refresh.disabled = false; busy = false; toggle.textContent = label; paint(); }
  }

  toggle.addEventListener("click", async () => {
    const o = obj();
    const next = fieldView(o, K()) === "ko" ? "en" : "ko";
    const slot = next === "ko" ? o[koKey(K())] : o[K()];
    const other = next === "ko" ? o[K()] : o[koKey(K())];
    // the other language is not written yet: translate it, then show it
    if (!String(slot || "").trim() && String(other || "").trim()) await run(next);
    fieldSetView(o, K(), next);
    persist();
    paint();
    onView?.(next);
  });
  refresh.addEventListener("click", () => run(fieldView(obj(), K())));

  paint();
  return { el: wrap, refresh: paint };
}

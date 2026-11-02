/**
 * LLM live monitor — a small line at the bottom-left of the ComfyUI page for every running LLM call, fed by the
 * `tj_llm_progress` websocket event (core LLM (TJ) node and the studio /tj_studio_one/llm/* routes).
 *
 *   thinking · 210 tok · 17 tok/s · 12 s      (with the backend and model in front when several calls run at once)
 *
 * The local GGUF enhance route streams (real counts, the line moves every ~0.7 s); the other routes send only a start and an
 * end event, so for them the line shows the elapsed seconds (ticking here) and `~` counts at the end. If nothing arrives for
 * 30 s the line says so, which is the "is it working?" answer the 5-minute rule used to stand in for.
 * Loaded by every node file that imports it; the guard keeps it to one listener.
 */
import { api } from "../../../scripts/api.js";
import { t } from "./i18n.js";

const calls = new Map();   // call_id -> { ev, seen (ms when the last event came), start (ms), hideAt }
let box = null;

function ensureBox() {
  if (box) return box;
  box = document.createElement("div");
  Object.assign(box.style, {
    position: "fixed", left: "12px", bottom: "12px", zIndex: "10001", display: "none", flexDirection: "column", gap: "4px",
    maxWidth: "min(720px, 90vw)", pointerEvents: "none", fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: "11px",
  });
  document.body.appendChild(box);
  return box;
}

function shortModel(m) {
  const s = String(m || "").split(/[\\/]/).pop();
  return s.length > 42 ? s.slice(0, 40) + "…" : s;
}

function lineText(c, now, withName) {
  const ev = c.ev;
  const approx = ev.estimated ? "~" : "";
  const secs = Math.max(Math.round((ev.elapsed_ms || 0) / 1000), Math.round((now - c.start) / 1000));
  const phase = { prompt: t("llm_live_prompt"), thinking: t("llm_live_thinking"), answer: t("llm_live_answer"),
    done: t("llm_live_done"), error: t("llm_live_error") }[ev.phase] || ev.phase;
  const parts = withName ? [`${ev.backend}${ev.model ? " · " + shortModel(ev.model) : ""}`, phase] : [phase];
  if (ev.output_tokens) parts.push(`${approx}${ev.output_tokens} tok`);
  if (ev.tok_per_sec) parts.push(`${approx}${ev.tok_per_sec >= 10 ? Math.round(ev.tok_per_sec) : ev.tok_per_sec} tok/s`);
  parts.push(`${secs}${t("llm_live_sec")}`);
  if (ev.finish_reason === "length") parts.push(t("llm_live_cut"));
  if (ev.phase !== "done" && ev.phase !== "error" && now - c.seen > 30000 && ev.estimated === false) parts.push(t("llm_live_quiet"));
  return parts.join(" · ");
}

function render() {
  const now = Date.now();
  for (const [id, c] of calls) if (c.hideAt && now > c.hideAt) calls.delete(id);
  const b = ensureBox();
  if (!calls.size) { b.style.display = "none"; return; }
  b.style.display = "flex";
  const shown = [...calls.values()].slice(-3);
  b.replaceChildren(...shown.map(c => {
    const row = document.createElement("div");
    const bad = c.ev.phase === "error" || c.ev.finish_reason === "length";
    Object.assign(row.style, {
      background: "rgba(20,20,28,0.92)", color: bad ? "#ff9a9a" : (c.ev.phase === "done" ? "#9be8a6" : "#e6e6f0"),
      border: "1px solid " + (bad ? "#8a3a3a" : "#3a3a55"), borderRadius: "6px", padding: "4px 9px", whiteSpace: "nowrap",
      overflow: "hidden", textOverflow: "ellipsis",
    });
    row.textContent = "🧠 " + lineText(c, now, shown.length > 1);
    return row;
  }));
}

function onEvent(e) {
  const ev = e?.detail;
  if (!ev || !ev.call_id) return;
  const now = Date.now();
  const prev = calls.get(ev.call_id);
  const ended = ev.phase === "done" || ev.phase === "error";
  calls.set(ev.call_id, { ev, seen: now, start: prev ? prev.start : now - (ev.elapsed_ms || 0),
    hideAt: ended ? now + (ev.phase === "error" ? 8000 : 5000) : 0 });
  render();
}

if (!window.__tjLlmLive) {
  window.__tjLlmLive = true;
  try { api.addEventListener("tj_llm_progress", onEvent); } catch (_) { /* old frontend without addEventListener */ }
  setInterval(() => { if (calls.size) render(); }, 1000);
}

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

// ── ComfyUI TextGenerate run through the queue (native translate, native brief / image analysis, MusicMaker) ──────────────
// Those graphs are posted to /prompt from the page. Watch the post, remember the prompt id and its TextGenerate nodes, and
// turn ComfyUI's own `progress` events (one step per generated token) into the same live line.
const natives = new Map();   // prompt_id -> { nodes: { nodeId: max_length }, model, start }

function noteQueuedGraph(graph, promptId) {
  if (!graph || typeof graph !== "object" || !promptId) return;
  const nodes = {};
  let model = "";
  for (const [id, n] of Object.entries(graph)) {
    if (n?.class_type !== "TextGenerate") continue;
    nodes[id] = Number(n.inputs?.max_length) || 0;
    const link = n.inputs?.clip;
    const loader = Array.isArray(link) ? graph[String(link[0])] : null;
    model = model || String(loader?.inputs?.clip_name || "");
  }
  if (Object.keys(nodes).length) natives.set(String(promptId), { nodes, model, start: Date.now() });
}

function nativeEvent(promptId, phase, value, max, extra = {}) {
  const info = natives.get(String(promptId));
  if (!info) return;
  const elapsed = Date.now() - info.start;
  onEvent({ detail: { call_id: "native-" + promptId, backend: "ComfyUI TextGenerate", model: info.model, phase,
    input_tokens: null, output_tokens: value, chars: 0, estimated: false, delta: "",
    tok_per_sec: elapsed > 0 && value ? Math.round(value / (elapsed / 1000) * 10) / 10 : 0, elapsed_ms: elapsed,
    ...(max && value >= max ? { finish_reason: "length" } : {}), ...extra } });
}

function wireNative() {
  const original = api.fetchApi?.bind(api);
  if (original) {
    api.fetchApi = async function (route, options) {
      const resp = await original(route, options);
      try {
        if (route === "/prompt" && options?.method === "POST" && typeof options.body === "string") {
          const graph = JSON.parse(options.body)?.prompt;
          if (graph && Object.values(graph).some(n => n?.class_type === "TextGenerate")) {
            resp.clone().json().then(d => { if (d?.prompt_id) { noteQueuedGraph(graph, d.prompt_id); nativeEvent(d.prompt_id, "prompt", 0, 0); } }).catch(() => {});
          }
        }
      } catch (_) { /* never break a queue request */ }
      return resp;
    };
  }
  api.addEventListener("progress", e => {
    const d = e?.detail || {};
    const info = natives.get(String(d.prompt_id));
    if (info && info.nodes[String(d.node)] !== undefined) nativeEvent(d.prompt_id, "answer", d.value, d.max);
  });
  const end = (phase, e) => {
    const pid = String(e?.detail?.prompt_id || "");
    const info = natives.get(pid);
    if (!info) return;
    const prev = calls.get("native-" + pid);
    nativeEvent(pid, phase, prev?.ev?.output_tokens || 0, Math.max(...Object.values(info.nodes)), { finish_reason: prev?.ev?.finish_reason || (phase === "error" ? "error" : "stop") });
    natives.delete(pid);
  };
  api.addEventListener("execution_success", e => end("done", e));
  api.addEventListener("execution_error", e => end("error", e));
  api.addEventListener("execution_interrupted", e => end("error", e));
}

if (!window.__tjLlmLive) {
  window.__tjLlmLive = true;
  try { api.addEventListener("tj_llm_progress", onEvent); wireNative(); } catch (_) { /* old frontend without addEventListener */ }
  setInterval(() => { if (calls.size) render(); }, 1000);
}

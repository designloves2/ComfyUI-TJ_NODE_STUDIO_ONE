// agent_job.js — shared helpers for the "⬇ job.json" export buttons on the ONE STUDIO
// nodes. Mirrors the web twin's per-tool buildAgentJob() + the {tool, job, target}
// envelope the Hermes render-queue agent (h3-headless / krea2-headless / zimage-headless /
// klein-headless / music-headless) consumes. The per-tool job builders live in each
// tool's core_*.js, same as the web; this file only holds what they all share.

// Where the Hermes agent looks for input images — NOT this studio's own path. The user
// drops a matching local copy of each referenced image here before running the job.
export const AGENT_INPUTS_DIR = "/Users/hermes/.hermes/render-queue/inputs/";

export function agentInputPath(filename) {
  const base = String(filename || "").split(/[/\\]/).pop() || "";
  return base ? AGENT_INPUTS_DIR + base : "";
}

// Local-time YYYYMMDDHHmm stamp for job.json filenames.
export function agentStamp(d = new Date()) {
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}`;
}

// Wrap a job object in the envelope and download it as <filename>. `target` (agent-side
// delivery routing, e.g. "telegram:<chat id>") is left blank for the user to fill in.
export function downloadAgentJob(tool, job, filename) {
  const envelope = { tool, job, target: "" };
  const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

#!/usr/bin/env node
// write_jobs.mjs — expand a prompt list into enveloped Hermes job.json files.
// Zero deps, Node 20+.
//
//   node write_jobs.mjs --tool krea2 --mode t2i --out ./jobs/krea2-200 --prompts ./prompts.json
//   node write_jobs.mjs --tool h3 --mode t2va --out ./jobs/story --prompts - --seq   (JSON array on stdin)
//   node write_jobs.mjs --tool music --mode acestep --out ./jobs/song --prompts ./song.json
//
// --prompts : a JSON array. Each element is a STRING (the prompt) or an OBJECT (a
//             full/partial `job`; must carry a `prompt` key unless the mode doesn't
//             need one, e.g. klein faceswap / music instrumental).
// --base    : JSON object merged into every job (e.g. '{"width":1024,"height":1536}').
// --seq     : number as a sequence; for h3 fl2va, leave firstFrame null + note relay.
// --target  : the envelope `target` value (default "").
//
// Writes <tool>_<mode>_NNN.json (enveloped) + manifest.json into --out, prints the dir.

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";

const TOOLS = new Set(["h3", "krea2", "zimage", "klein", "music"]);
const H3_MODES = new Set(["t2va", "fl2va", "ref2va", "l2va"]);

function parseArgs(argv) {
  const a = { seq: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--seq") a.seq = true;
    else if (t === "--tool") a.tool = argv[++i];
    else if (t === "--mode") a.mode = argv[++i];
    else if (t === "--out") a.out = argv[++i];
    else if (t === "--prompts") a.prompts = argv[++i];
    else if (t === "--base") a.base = argv[++i];
    else if (t === "--target") a.target = argv[++i];
    else if (t === "--help" || t === "-h") a.help = true;
    else throw new Error(`unknown arg: ${t}`);
  }
  return a;
}

const HELP = `write_jobs.mjs — prompt list -> enveloped Hermes job.json files

  --tool     h3 | krea2 | zimage | klein | music        (required)
  --mode     h3: t2va|fl2va|ref2va|l2va ; images: t2i|i2i|edit|inpaint|outpaint|faceswap|identity ;
             music: acestep|minimax                     (required)
  --out      output directory                           (required)
  --prompts  path to a JSON array, or "-" for stdin     (required)
  --base     JSON object merged into every job
  --seq      treat as an ordered sequence
  --target   envelope "target" value (default "")
`;

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

function baseJob(tool, mode) {
  if (tool === "music") return { engine: mode === "minimax" ? "minimax" : "acestep", seed: null };
  if (tool === "h3") return { mode, preset: null, durationSeconds: 10, seed: null };
  return { mode, width: 1024, height: 1024, steps: 8, cfg: 1, seed: null };
}

function normalizeElement(el, tool, mode) {
  const job = typeof el === "string" ? { prompt: el } : { ...el };
  const needsPrompt = !(tool === "klein" && mode === "faceswap") && !(job.instrumental === true && !job.caption);
  if (tool === "music") {
    // music uses `caption` (+ optional `lyrics`), not `prompt`
    if (typeof el === "string") { job.caption = el; delete job.prompt; }
  }
  if (needsPrompt && tool !== "music" && !String(job.prompt || "").trim() && typeof job.prompt !== "object") {
    throw new Error("each prompt element needs a non-empty `prompt` (or be an object with one)");
  }
  if (tool === "music" && !String(job.caption || "").trim() && !job.instrumental) {
    throw new Error("each music element needs a `caption` (or instrumental:true)");
  }
  return job;
}

async function main() {
  const a = (() => { try { return parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(2); } })();
  if (a.help || (!a.tool && !a.mode)) { process.stdout.write(HELP); process.exit(a.help ? 0 : 2); }
  if (!TOOLS.has(a.tool)) { console.error(`--tool must be one of ${[...TOOLS].join(", ")}`); process.exit(2); }
  if (!a.mode) { console.error("--mode is required"); process.exit(2); }
  if (!a.out) { console.error("--out is required"); process.exit(2); }
  if (!a.prompts) { console.error("--prompts is required"); process.exit(2); }
  if (a.tool === "h3" && !H3_MODES.has(a.mode)) { console.error(`h3 --mode must be one of ${[...H3_MODES].join(", ")}`); process.exit(2); }

  const raw = a.prompts === "-" ? await readStdin() : await readFile(resolve(a.prompts), "utf8");
  let list;
  try { list = JSON.parse(raw); } catch (e) { console.error(`--prompts is not valid JSON: ${e.message}`); process.exit(1); }
  if (!Array.isArray(list) || !list.length) { console.error("--prompts must be a non-empty JSON array"); process.exit(1); }

  let base = {};
  if (a.base) { try { base = JSON.parse(a.base); } catch (e) { console.error(`--base is not valid JSON: ${e.message}`); process.exit(1); } }

  const outDir = resolve(a.out);
  await mkdir(outDir, { recursive: true });
  const existing = (await readdir(outDir).catch(() => [])).filter((f) => /\.json$/.test(f) && f !== "manifest.json");
  if (existing.length) { console.error(`refusing to write — ${outDir} already has ${existing.length} .json file(s). Use a fresh --out.`); process.exit(1); }

  const pad = String(Math.max(3, String(list.length).length));
  const files = [];
  const relay = a.seq && a.tool === "h3" && (a.mode === "fl2va" || a.mode === "t2va");

  for (let i = 0; i < list.length; i++) {
    const n = String(i + 1).padStart(Number(pad), "0");
    let job = { ...baseJob(a.tool, a.mode), ...base, ...normalizeElement(list[i], a.tool, a.mode) };
    if (relay) {
      // clip 1 stays as given (t2va or whatever); clips 2..N become fl2va with a
      // firstFrame the worker injects from the previous clip's last frame.
      if (i === 0) job.mode = job.mode || "t2va";
      else { job.mode = "fl2va"; if (job.firstFrame == null) job.firstFrame = null; }
    }
    const envelope = { tool: a.tool, job, target: a.target || "" };
    const name = `${a.tool}_${a.mode}_${n}.json`;
    await writeFile(join(outDir, name), JSON.stringify(envelope, null, 2) + "\n");
    files.push(name);
  }

  const manifest = {
    tool: a.tool, mode: a.mode, count: files.length, sequence: !!a.seq,
    created: new Date().toISOString(),
    files,
    base: Object.keys(base).length ? base : undefined,
    _relay: relay
      ? "sequence: clip 1 is standalone; clips 2..N are fl2va with firstFrame=null — the Hermes worker must extract each clip's last frame and set it as the next clip's firstFrame before running it."
      : undefined,
    _note: a.tool === "music" ? "music renders are long — the worker should set comfy.json timeoutMs to ~2400000." : undefined,
  };
  await writeFile(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

  process.stdout.write(`${files.length} job file(s) + manifest.json written to:\n${outDir}\n`);
}

main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });

// melody_audio.js — Melody Editor sound + input: Web Audio synth / user sample instrument,
// metronome, IndexedDB sample library, and the Web MIDI input manager. No dependencies.

let _ctx = null;
export function getCtx() {
  if (!_ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    _ctx = new AC({ latencyHint: "interactive" });
  }
  return _ctx;
}
export async function resumeCtx() {
  const c = getCtx();
  if (c.state === "suspended") { try { await c.resume(); } catch {} }
  return c;
}

const LS_VOL = "music_melody_volume";
const LS_INSTR = "music_melody_instrument";
const LS_MIDI = "music_melody_midi_device";
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
export const savedInstrumentId = () => lsGet(LS_INSTR, "synth");
export const saveInstrumentId = (id) => lsSet(LS_INSTR, id);
export const savedVolume = () => { const v = parseFloat(lsGet(LS_VOL, "0.8")); return isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.8; };

const MAX_VOICES = 40;
const freqOf = (p) => 440 * Math.pow(2, (p - 69) / 12);

// ── instrument ──────────────────────────────────────────────────────────────
// A voice is { stop(t), kill() }: stop(t) releases at ctx time t (may be in the future),
// kill() silences it right now.
export function createInstrument() {
  const ctx = getCtx();
  const master = ctx.createGain();
  master.gain.value = savedVolume();
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp); comp.connect(ctx.destination);
  const clickGain = ctx.createGain(); clickGain.gain.value = 0.5; clickGain.connect(comp);
  let sample = null;                 // { id, name, buffer, root, loop, oneShot, release }
  const voices = new Set();

  function register(v) {
    voices.add(v);
    while (voices.size > MAX_VOICES) { const first = voices.values().next().value; first.kill(); }
    return v;
  }

  function synthVoice(p, vel, t) {
    const f = freqOf(p), peak = 0.12 + 0.38 * (vel / 127);
    const g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = Math.min(9000, f * 9); lp.Q.value = 0.4;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.004);
    g.gain.setTargetAtTime(peak * 0.42, t + 0.004, 0.28);
    const oscs = [];
    [["triangle", 1, 1], ["sine", 2, 0.28], ["sine", 3, 0.09], ["sine", 0.5, 0.18]].forEach(([type, mul, amp]) => {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = type; o.frequency.value = f * mul; og.gain.value = amp;
      o.connect(og); og.connect(lp); o.start(t); oscs.push(o);
    });
    lp.connect(g); g.connect(master);
    const v = {
      stop(t2) {
        const at = Math.max(t2, ctx.currentTime);
        g.gain.setTargetAtTime(0, at, 0.07);
        oscs.forEach((o) => { try { o.stop(at + 0.6); } catch {} });
        setTimeout(() => voices.delete(v), Math.max(0, (at - ctx.currentTime) * 1000) + 800);
      },
      kill() {
        try { g.gain.cancelScheduledValues(0); g.gain.value = 0; } catch {}
        oscs.forEach((o) => { try { o.stop(); } catch {} });
        voices.delete(v);
      },
    };
    return v;
  }

  function sampleVoice(p, vel, t) {
    const s = sample;
    const src = ctx.createBufferSource();
    src.buffer = s.buffer;
    src.playbackRate.value = Math.pow(2, (p - s.root) / 12);
    src.loop = !!s.loop;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.25 + 0.75 * (vel / 127), t + 0.003);
    src.connect(g); g.connect(master); src.start(t);
    const rel = Math.max(0.01, (s.release ?? 120) / 1000);
    const v = {
      stop(t2) {
        if (s.oneShot && !s.loop) return;             // one-shot: let the whole sample ring out
        const at = Math.max(t2, ctx.currentTime);
        g.gain.setTargetAtTime(0, at, rel / 3);
        try { src.stop(at + rel + 0.05); } catch {}
      },
      kill() { try { g.gain.cancelScheduledValues(0); g.gain.value = 0; src.stop(); } catch {} voices.delete(v); },
    };
    src.onended = () => voices.delete(v);
    return v;
  }

  const api = {
    ctx,
    now: () => ctx.currentTime,
    setVolume(v) { master.gain.value = v; lsSet(LS_VOL, String(v)); },
    getVolume: () => master.gain.value,
    setSample(s) { sample = s || null; },
    getSample: () => sample,
    noteOn(p, vel = 90, t = ctx.currentTime) {
      return register(sample ? sampleVoice(p, vel, t) : synthVoice(p, vel, t));
    },
    noteOff(voice, t = ctx.currentTime) { if (voice) voice.stop(t); },
    scheduleNote(p, vel, t0, t1) { const v = api.noteOn(p, vel, t0); v.stop(t1); return v; },
    click(t, accent) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "square"; o.frequency.value = accent ? 1760 : 1175;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(accent ? 0.5 : 0.32, t + 0.001);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
      o.connect(g); g.connect(clickGain); o.start(t); o.stop(t + 0.06);
    },
    panic() { [...voices].forEach((v) => v.kill()); },
    dispose() {
      api.panic();
      try { master.disconnect(); clickGain.disconnect(); comp.disconnect(); } catch {}
    },
  };
  return api;
}

// ── sample library (IndexedDB, with an in-memory fallback) ──────────────────
const DB = "tj_melody_samples_v1", STORE = "samples";
const memStore = new Map();
let dbPromise = null;
function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error("no IndexedDB"));
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id" });
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  return dbPromise;
}
const tx = async (mode, fn) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
};
export let sampleStorePersistent = true;
export async function listSamples() {
  try { return (await tx("readonly", (s) => s.getAll())) || []; }
  catch { sampleStorePersistent = false; return [...memStore.values()]; }
}
export async function putSample(rec) {
  try { await tx("readwrite", (s) => s.put(rec)); }
  catch { sampleStorePersistent = false; memStore.set(rec.id, rec); }
}
export async function deleteSample(id) {
  memStore.delete(id);
  try { await tx("readwrite", (s) => s.delete(id)); } catch {}
}
export async function decodeSample(rec) {
  const buffer = await getCtx().decodeAudioData(rec.data.slice(0));
  return { id: rec.id, name: rec.name, buffer, root: rec.root, loop: !!rec.loop, oneShot: !!rec.oneShot, release: rec.release ?? 120 };
}

// "Piano_C#3.wav" -> 49, "a4" -> 69, no match -> null
export function rootFromFilename(name) {
  const m = String(name).replace(/\.[^.]+$/, "").match(/(?:^|[^a-z])([A-Ga-g])([#sb]?)(-?\d)(?![0-9])/);
  if (!m) return null;
  const base = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1].toLowerCase()];
  const acc = m[2] === "#" || m[2] === "s" ? 1 : m[2] === "b" ? -1 : 0;
  const p = 12 * (parseInt(m[3], 10) + 1) + base + acc;
  return p >= 12 && p <= 120 ? p : null;
}

// YIN-style pitch estimate of a decoded sample; null when it is too noisy to trust
export function detectRootNote(buffer) {
  const sr = buffer.sampleRate, x = buffer.getChannelData(0);
  const W = 2048, maxLag = Math.floor(sr / 45), minLag = Math.max(2, Math.floor(sr / 2100));
  if (x.length < W + maxLag + 8) return null;
  let bestStart = 0, bestE = -1;                      // analyse the loudest stretch, skipping the very attack
  const hop = Math.floor(sr * 0.05);
  for (let s = Math.floor(sr * 0.04); s + W + maxLag < x.length && s < sr * 3; s += hop) {
    let e = 0; for (let i = 0; i < W; i += 4) e += x[s + i] * x[s + i];
    if (e > bestE) { bestE = e; bestStart = s; }
  }
  if (bestE < 1e-6) return null;
  const d = new Float32Array(maxLag + 1);
  for (let tau = minLag; tau <= maxLag; tau++) {
    let sum = 0;
    for (let i = 0; i < W; i++) { const df = x[bestStart + i] - x[bestStart + i + tau]; sum += df * df; }
    d[tau] = sum;
  }
  let run = 0, pick = -1, best = 1e9, bestTau = -1;
  const cm = new Float32Array(maxLag + 1);
  for (let tau = minLag; tau <= maxLag; tau++) {
    run += d[tau];
    cm[tau] = run > 0 ? d[tau] * (tau - minLag + 1) / run : 1;
    if (cm[tau] < best) { best = cm[tau]; bestTau = tau; }
  }
  for (let tau = minLag + 1; tau < maxLag; tau++) {
    if (cm[tau] < 0.15 && cm[tau] <= cm[tau - 1] && cm[tau] <= cm[tau + 1]) { pick = tau; break; }
  }
  if (pick < 0) { if (best > 0.4) return null; pick = bestTau; }
  const f = sr / pick;
  return Math.round(69 + 12 * Math.log2(f / 440));
}

// ── Web MIDI input ──────────────────────────────────────────────────────────
// status: unsupported | insecure | idle | denied | ready | error
export function createMidiInput({ onNote, onChange, onActivity, onPanic }) {
  let access = null, status = "idle", error = "", selected = "all";
  const savedRaw = lsGet(LS_MIDI, "");
  let saved = null; try { saved = savedRaw ? JSON.parse(savedRaw) : null; } catch {}
  if (saved?.id) selected = saved.id;

  const supported = () => typeof navigator !== "undefined" && typeof navigator.requestMIDIAccess === "function";
  const inputs = () => (access ? [...access.inputs.values()] : []);
  const devices = () => inputs().map((i) => ({ id: i.id, name: i.name || "MIDI input", manufacturer: i.manufacturer || "", state: i.state, connection: i.connection }));

  function handle(e) {
    const d = e.data; if (!d || d.length < 1) return;
    const st = d[0], kind = st & 0xf0, ch = st & 0x0f, a = d[1] ?? 0, b = d[2] ?? 0;
    onActivity?.();
    if (kind === 0x90 && b > 0) onNote(true, a, b, ch);
    else if (kind === 0x80 || kind === 0x90) onNote(false, a, 0, ch);
    else if (kind === 0xb0 && (a === 123 || a === 120)) onPanic?.();
  }

  // a remembered device that isn't plugged in must not silence every other keyboard
  const eff = () => (selected !== "all" && inputs().some((i) => i.id === selected)) ? selected : "all";
  function attach() {
    const sel = eff();
    for (const i of inputs()) {
      const on = i.state === "connected" && (sel === "all" || sel === i.id);
      try { i.onmidimessage = on ? handle : null; } catch {}
    }
  }
  function refresh() {
    if (!access) return;
    // a remembered device that is gone: fall back to "all" but keep remembering it
    if (selected !== "all" && !inputs().some((i) => i.id === selected)) {
      const byName = saved?.name && inputs().find((i) => i.name === saved.name);
      if (byName) selected = byName.id;
    }
    attach();
    onChange?.();
  }

  const api = {
    supported,
    get status() { return status; },
    get error() { return error; },
    get selected() { return eff(); },
    devices,
    activeNames() {
      const sel = eff();
      return inputs().filter((i) => i.state === "connected" && (sel === "all" || sel === i.id)).map((i) => i.name || "MIDI input");
    },
    async connect() {
      if (!supported()) { status = "unsupported"; onChange?.(); return status; }
      if (typeof window !== "undefined" && window.isSecureContext === false) { status = "insecure"; onChange?.(); return status; }
      try {
        access = await navigator.requestMIDIAccess({ sysex: false });
        access.onstatechange = () => refresh();
        status = "ready"; error = "";
        refresh();
      } catch (e) {
        const n = e?.name || "";
        status = (n === "SecurityError" || n === "NotAllowedError") ? "denied" : "error";
        error = e?.message || String(e);
        onChange?.();
      }
      return status;
    },
    // silently reconnect only when the browser already holds a grant (no surprise prompt)
    async autoConnect() {
      if (!supported()) return;
      try {
        const q = await navigator.permissions?.query({ name: "midi" });
        if (q?.state === "granted") await api.connect();
      } catch {}
    },
    rescan() { if (access) refresh(); else return api.connect(); },
    select(id) {
      selected = id || "all";
      const d = devices().find((x) => x.id === selected);
      lsSet(LS_MIDI, JSON.stringify(selected === "all" ? {} : { id: selected, name: d?.name || saved?.name || "" }));
      saved = selected === "all" ? null : { id: selected, name: d?.name || "" };
      attach(); onChange?.();
    },
    dispose() {
      for (const i of inputs()) { try { i.onmidimessage = null; } catch {} }
      if (access) { try { access.onstatechange = null; } catch {} }
      access = null;
    },
  };
  return api;
}

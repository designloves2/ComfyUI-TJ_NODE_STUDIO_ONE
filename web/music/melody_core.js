// melody_core.js — Melody Editor data model: ABC export (YuE2 `abc` input) and Standard
// MIDI File read/write. Pure functions, no DOM, no dependencies.
//
// A note is { id, p, s, l, v }: p = MIDI pitch, s = start and l = length in 16th-note
// steps (floats allowed while editing), v = velocity 1..127.

export const STEPS_PER_QUARTER = 4;
export const MAX_BARS = 128;
export const PITCH_MIN = 24;    // C1
export const PITCH_MAX = 108;   // C8
export const METERS = ["4/4", "3/4", "2/4", "6/8", "12/8", "5/4", "2/2"];
export const KEYS = [
  "C", "G", "D", "A", "E", "B", "F#", "C#", "F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb",
  "Am", "Em", "Bm", "F#m", "C#m", "G#m", "D#m", "A#m", "Dm", "Gm", "Cm", "Fm", "Bbm", "Ebm", "Abm",
];

let _id = 1;
export const newId = () => _id++;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mod12 = (x) => ((x % 12) + 12) % 12;

export function parseMeter(m) {
  const [n, d] = String(m || "4/4").split("/").map(Number);
  if (!(n > 0) || ![1, 2, 4, 8, 16].includes(d)) return { n: 4, d: 4 };
  return { n, d };
}
export function stepsPerBar(m) { const { n, d } = parseMeter(m); return Math.round(n * 16 / d); }
// one metronome click: dotted quarter in compound meters (6/8, 12/8), else the meter's own beat
export function beatSteps(m) { const { n, d } = parseMeter(m); return (d === 8 && n % 3 === 0) ? 6 : 16 / d; }
// Q:1/4=bpm is always quarter notes per minute, whatever the meter
export const stepSeconds = (bpm) => 60 / bpm / STEPS_PER_QUARTER;

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const noteName = (p) => NOTE_NAMES[mod12(p)] + (Math.floor(p / 12) - 1);
export const isBlackKey = (p) => [1, 3, 6, 8, 10].includes(mod12(p));

// ── key signature + pitch spelling ──────────────────────────────────────────
const SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"];
const FLAT_ORDER = ["B", "E", "A", "D", "G", "C", "F"];
const KEY_SIG = {
  C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, "F#": 6, "C#": 7, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7,
  Am: 0, Em: 1, Bm: 2, "F#m": 3, "C#m": 4, "G#m": 5, "D#m": 6, "A#m": 7,
  Dm: -1, Gm: -2, Cm: -3, Fm: -4, Bbm: -5, Ebm: -6, Abm: -7,
};
export function keySignature(key) {
  const n = KEY_SIG[key] ?? 0;
  const ks = { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 };
  if (n > 0) SHARP_ORDER.slice(0, n).forEach((L) => { ks[L] = 1; });
  else if (n < 0) FLAT_ORDER.slice(0, -n).forEach((L) => { ks[L] = -1; });
  return { ks, sharps: n >= 0 };
}

const BASE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const WHITE_PC = { 0: "C", 2: "D", 4: "E", 5: "F", 7: "G", 9: "A", 11: "B" };

// letter + accidental (relative to the natural letter) for a MIDI pitch in a key:
// diatonic spelling first, then the plain natural, then a sharp/flat by key preference
export function spellPitch(p, ks, preferSharps) {
  const pc = mod12(p);
  for (const L of LETTERS) if (mod12(BASE[L] + ks[L]) === pc) return { L, acc: ks[L] };
  if (WHITE_PC[pc]) return { L: WHITE_PC[pc], acc: 0 };
  for (const acc of (preferSharps ? [1, -1] : [-1, 1])) {
    const L = WHITE_PC[mod12(pc - acc)];
    if (L) return { L, acc };
  }
  return { L: "C", acc: 0 };
}

function abcLetter(p, sp) {
  const natural = p - sp.acc;                       // a white key by construction
  const oct = Math.floor(natural / 12) - 1;         // C4 (60) -> 4
  return oct >= 5 ? sp.L.toLowerCase() + "'".repeat(oct - 5) : sp.L + ",".repeat(Math.max(0, 4 - oct));
}

// ── monophonic reduction (YuE2's melody ABC is a single line) ───────────────
export function toMonophonic(notes, pick = "high") {
  const q = notes.map((n) => ({
    p: n.p, v: n.v || 90,
    s: Math.max(0, Math.round(n.s)),
    l: Math.max(1, Math.round(n.l)),
  }));
  q.sort((a, b) => a.s - b.s || (pick === "low" ? a.p - b.p : b.p - a.p));
  const out = [];
  for (const n of q) {
    if (out.length && out[out.length - 1].s === n.s) continue;   // same start: keep the first (highest/lowest)
    out.push(n);
  }
  for (let i = 0; i < out.length - 1; i++) {
    if (out[i].s + out[i].l > out[i + 1].s) out[i].l = out[i + 1].s - out[i].s;
  }
  return { mono: out, dropped: notes.length - out.length };
}

export function melodyBars(notes, bars, meter) {
  const spb = stepsPerBar(meter);
  let end = 0;
  for (const n of notes) end = Math.max(end, Math.ceil(n.s + n.l));
  return clamp(Math.max(bars || 1, Math.ceil(end / spb)), 1, MAX_BARS);
}
export function melodySeconds(bars, meter, bpm) { return bars * stepsPerBar(meter) * stepSeconds(bpm); }

// ── ABC export — mirrors the shape YuE2GenerateABC itself writes ────────────
export function buildAbc({ notes, bpm = 100, meter = "4/4", key = "C", bars = 8, title = "", pick = "high" }) {
  const spb = stepsPerBar(meter);
  const { mono, dropped } = toMonophonic(notes, pick);
  // the score ends in the bar of the last note — empty bars after it would only read as silence
  const lastEnd = mono.length ? mono[mono.length - 1].s + mono[mono.length - 1].l : 0;
  const totalBars = mono.length ? clamp(Math.ceil(lastEnd / spb), 1, MAX_BARS) : melodyBars(notes, bars, meter);
  const total = totalBars * spb;
  const { ks, sharps } = keySignature(key);

  const bar = [];            // tokens of the bar being built
  const lines = [];
  let cur = "";
  let barIdx = 0;
  let altered = {};
  const flushBar = () => {
    cur += bar.join("") + "|";
    bar.length = 0; altered = {}; barIdx++;
    if (barIdx % 4 === 0) { lines.push(cur); cur = ""; }
  };
  const dur = (n) => (n === 1 ? "" : String(n));
  let pos = 0;
  const emit = (note, len) => {
    while (len > 0) {
      const room = spb - (pos % spb);
      const chunk = Math.min(len, room);
      const more = len - chunk > 0;
      if (note) {
        const sp = spellPitch(note.p, ks, sharps);
        const explicit = sp.acc !== ks[sp.L] || altered[sp.L];
        let acc = "";
        if (explicit) {
          acc = sp.acc === 1 ? "^" : sp.acc === -1 ? "_" : "=";
          if (sp.acc !== ks[sp.L]) altered[sp.L] = true;
        }
        bar.push(acc + abcLetter(note.p, sp) + dur(chunk) + (more ? "-" : ""));
      } else {
        bar.push(chunk === spb ? "Z" : "z" + dur(chunk));
      }
      pos += chunk; len -= chunk;
      if (pos % spb === 0) flushBar();
    }
  };
  for (const n of mono) {
    if (n.s > pos) emit(null, n.s - pos);
    emit(n, n.l);
  }
  if (pos < total) emit(null, total - pos);
  if (cur) lines.push(cur);
  if (lines.length) lines[lines.length - 1] = lines[lines.length - 1].replace(/\|$/, "|]");

  const head = [
    "X:1", `T:${String(title || "").replace(/[\r\n]+/g, " ")}`, `M:${meter}`, "L:1/16", `Q:1/4=${Math.round(bpm)}`,
    'V: Vocal clef=treble name="Vocal Melody" snm="Vocal"', `K:${key}`, "V: Vocal",
  ];
  const abc = head.concat(lines).join("\n") + "\n";
  return { abc, dropped, bars: totalBars, noteCount: mono.length, seconds: melodySeconds(totalBars, meter, bpm), chars: abc.length };
}

// ── Standard MIDI File ──────────────────────────────────────────────────────
const vlq = (n) => {
  const out = [n & 0x7f];
  while ((n >>= 7) > 0) out.unshift((n & 0x7f) | 0x80);
  return out;
};

export function writeMidi(notes, { bpm = 120, meter = "4/4", ppq = 480, name = "Melody" } = {}) {
  const { n, d } = parseMeter(meter);
  const ev = [];   // [tick, order, bytes]
  const tick = (step) => Math.round(step * ppq / STEPS_PER_QUARTER);
  for (const nt of notes) {
    const on = tick(nt.s);
    const off = Math.max(on + 1, tick(nt.s + nt.l));
    const p = clamp(Math.round(nt.p), 0, 127), v = clamp(Math.round(nt.v || 90), 1, 127);
    ev.push([on, 1, [0x90, p, v]], [off, 0, [0x80, p, 0]]);
  }
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const trk = [];
  const nameBytes = [...new TextEncoder().encode(name)];
  trk.push(0x00, 0xff, 0x03, ...vlq(nameBytes.length), ...nameBytes);
  const mpq = Math.round(60000000 / bpm);
  trk.push(0x00, 0xff, 0x51, 0x03, (mpq >> 16) & 0xff, (mpq >> 8) & 0xff, mpq & 0xff);
  trk.push(0x00, 0xff, 0x58, 0x04, n, Math.log2(d), 24, 8);
  let last = 0;
  for (const [t, , bytes] of ev) { trk.push(...vlq(t - last), ...bytes); last = t; }
  trk.push(0x00, 0xff, 0x2f, 0x00);
  const u32 = (x) => [(x >>> 24) & 255, (x >>> 16) & 255, (x >>> 8) & 255, x & 255];
  const out = [
    0x4d, 0x54, 0x68, 0x64, ...u32(6), 0, 0, 0, 1, (ppq >> 8) & 255, ppq & 255,
    0x4d, 0x54, 0x72, 0x6b, ...u32(trk.length), ...trk,
  ];
  return new Uint8Array(out);
}

export function parseMidi(input) {
  const d = input instanceof Uint8Array ? input : new Uint8Array(input);
  let p = 0;
  const need = (k) => { if (p + k > d.length) throw new Error("Unexpected end of MIDI file"); };
  const u8 = () => { need(1); return d[p++]; };
  const u16 = () => { need(2); const v = (d[p] << 8) | d[p + 1]; p += 2; return v; };
  const u32 = () => { need(4); const v = ((d[p] << 24) | (d[p + 1] << 16) | (d[p + 2] << 8) | d[p + 3]) >>> 0; p += 4; return v; };
  const tag = () => { need(4); const s = String.fromCharCode(d[p], d[p + 1], d[p + 2], d[p + 3]); p += 4; return s; };
  const readVlq = () => { let v = 0, b, i = 0; do { b = u8(); v = (v << 7) | (b & 0x7f); } while ((b & 0x80) && ++i < 4); return v; };

  if (tag() !== "MThd") throw new Error("Not a MIDI file (missing MThd)");
  const hlen = u32(); const format = u16(); const ntrks = u16(); const division = u16();
  p += Math.max(0, hlen - 6);
  if (division & 0x8000) throw new Error("SMPTE-timed MIDI files are not supported");
  const ppq = division || 480;

  const tempos = [], timeSigs = [], tracks = [];
  for (let ti = 0; ti < ntrks && p < d.length; ti++) {
    const id = tag(); const len = u32(); const end = Math.min(d.length, p + len);
    if (id !== "MTrk") { p = end; ti--; continue; }
    let tickPos = 0, running = 0, name = "";
    const open = new Map(), notes = [], chans = new Set();
    while (p < end) {
      tickPos += readVlq();
      let st = u8();
      if (st < 0x80) { p--; st = running; if (!st) throw new Error("Bad running status"); }
      if (st === 0xff) {
        const type = u8(); const mlen = readVlq(); need(mlen);
        if (type === 0x51 && mlen === 3) tempos.push({ tick: tickPos, bpm: 60000000 / ((d[p] << 16) | (d[p + 1] << 8) | d[p + 2]) });
        else if (type === 0x58 && mlen >= 2) timeSigs.push({ tick: tickPos, n: d[p], d: 2 ** d[p + 1] });
        else if (type === 0x03) name = new TextDecoder().decode(d.subarray(p, p + mlen));
        p += mlen;
        if (type === 0x2f) break;
      } else if (st === 0xf0 || st === 0xf7) {
        const slen = readVlq(); need(slen); p += slen;
      } else {
        running = st;
        const kind = st & 0xf0, ch = st & 0x0f;
        const a = u8(); const b = (kind === 0xc0 || kind === 0xd0) ? 0 : u8();
        if (kind === 0x90 && b > 0) {
          const key = ch * 128 + a;
          if (open.has(key)) { const o = open.get(key); notes.push({ p: a, s: o.t, e: tickPos, ch, v: o.v }); }
          open.set(key, { t: tickPos, v: b }); chans.add(ch);
        } else if (kind === 0x80 || kind === 0x90) {
          const key = ch * 128 + a;
          if (open.has(key)) { const o = open.get(key); notes.push({ p: a, s: o.t, e: tickPos, ch, v: o.v }); open.delete(key); }
        }
      }
    }
    for (const [key, o] of open) notes.push({ p: key % 128, s: o.t, e: Math.max(tickPos, o.t + 1), ch: Math.floor(key / 128), v: o.v });
    p = end;
    notes.sort((x, y) => x.s - y.s || x.p - y.p);
    tracks.push({ index: tracks.length, name, notes, channels: [...chans].sort((x, y) => x - y), drum: chans.size === 1 && chans.has(9) });
  }
  tempos.sort((a, b) => a.tick - b.tick); timeSigs.sort((a, b) => a.tick - b.tick);
  return { format, ppq, tempos, timeSigs, tracks };
}

// parsed MIDI file + chosen track indexes -> melody editor data
export function midiToMelody(parsed, trackIdxs, { grid = 0.25 } = {}) {
  const k = STEPS_PER_QUARTER / parsed.ppq;
  const meter = (() => {
    const t = parsed.timeSigs[0];
    return t && [2, 4, 8, 16].includes(t.d) ? `${t.n}/${t.d}` : "4/4";
  })();
  const bpm = clamp(Math.round(parsed.tempos[0]?.bpm || 120), 20, 300);
  const spb = stepsPerBar(meter);
  const limit = MAX_BARS * spb;
  const notes = [];
  let truncated = false;
  for (const ti of trackIdxs) {
    for (const n of parsed.tracks[ti]?.notes || []) {
      const s = Math.round(n.s * k / grid) * grid;
      const l = Math.max(grid, Math.round((n.e - n.s) * k / grid) * grid);
      if (s >= limit) { truncated = true; continue; }
      let pitch = n.p;
      while (pitch < PITCH_MIN) pitch += 12;
      while (pitch > PITCH_MAX) pitch -= 12;
      notes.push({ id: newId(), p: pitch, s, l: Math.min(l, limit - s), v: n.v || 90 });
    }
  }
  return {
    notes, bpm, meter, bars: melodyBars(notes, 1, meter),
    truncated, tempoChanges: new Set(parsed.tempos.map((t) => Math.round(t.bpm))).size > 1,
  };
}

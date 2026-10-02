// ui_piano_roll.js — Melody Editor (piano roll) for YuE2's melody ABC input.
// Draw notes with the pen, or press ● and play a real MIDI keyboard / the computer keyboard
// in time with the metronome. Plays back through a built-in synth or a user sample.
import { C, BRAND, el } from "./core_music.js";
import * as M from "./melody_core.js";
import * as A from "./melody_audio.js";

const ROW_H = 16, KEY_W = 66, RULER_H = 26;
const TOP = M.PITCH_MAX, BOT = M.PITCH_MIN, ROWS = TOP - BOT + 1;
const MIN_LEN = 0.25;
const SNAPS = [["1/32", 0.5], ["1/16", 1], ["1/8", 2], ["1/4", 4], ["1/2", 8], ["Free", 0]];
const NOTE_OPTS = (() => { const o = []; for (let p = 24; p <= 108; p++) o.push([p, M.noteName(p)]); return o; })();

// computer-keyboard piano (by physical key, so it works under any layout / IME)
const KEYMAP = {
  KeyZ: 0, KeyS: 1, KeyX: 2, KeyD: 3, KeyC: 4, KeyV: 5, KeyG: 6, KeyB: 7, KeyH: 8, KeyN: 9, KeyJ: 10, KeyM: 11,
  Comma: 12, KeyL: 13, Period: 14, Semicolon: 15, Slash: 16,
  KeyQ: 12, Digit2: 13, KeyW: 14, Digit3: 15, KeyE: 16, KeyR: 17, Digit5: 18, KeyT: 19, Digit6: 20,
  KeyY: 21, Digit7: 22, KeyU: 23, KeyI: 24, Digit9: 25, KeyO: 26, Digit0: 27, KeyP: 28,
};

let stylesDone = false;
function injectStyles() {
  if (stylesDone || document.getElementById("pr-styles")) { stylesDone = true; return; }
  stylesDone = true;
  const s = document.createElement("style"); s.id = "pr-styles";
  s.textContent = `
    .pr-ov{outline:none;position:absolute;inset:0;z-index:10002;background:rgba(8,8,8,.99);border-radius:inherit;display:flex;
           flex-direction:column;padding:14px;gap:8px;box-sizing:border-box;color:${C.text};font-size:12px;user-select:none}
    .pr-hd{display:flex;align-items:center;gap:8px;flex-shrink:0}
    .pr-hd .t{font-size:14px;font-weight:700;color:#fff}
    .pr-hd .info{flex:1;font-size:11px;color:${C.muted};padding-left:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .pr-bar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;flex-shrink:0;padding:6px 8px;background:${C.bg1};
            border:1px solid ${C.border};border-radius:10px}
    .pr-grp{display:flex;align-items:center;gap:5px}
    .pr-grp>label{font-size:10.5px;color:${C.muted};font-weight:600}
    .pr-sep{width:1px;align-self:stretch;background:${C.border};margin:0 3px}
    .pr-b{background:${C.bg2};border:1px solid ${C.border};color:${C.text};cursor:pointer;border-radius:8px;padding:5px 10px;
          font-size:11.5px;font-family:inherit;white-space:nowrap;transition:border-color .1s,background .1s,filter .1s}
    .pr-b:hover{border-color:${BRAND}}
    .pr-b:disabled{opacity:.4;cursor:default;border-color:${C.border}}
    .pr-b.on{background:${BRAND};border-color:${BRAND};color:#fff;font-weight:600}
    .pr-b.pri{background:${BRAND};border-color:${BRAND};color:#fff;font-weight:700}
    .pr-b.pri:hover{filter:brightness(1.12)}
    .pr-b.rec{color:#ff5d5d;font-weight:700}
    .pr-b.rec.on{background:#d92b2b;border-color:#d92b2b;color:#fff;animation:pr-blink 1s ease-in-out infinite}
    @keyframes pr-blink{0%,100%{filter:brightness(1)}50%{filter:brightness(1.4)}}
    .pr-b.sq{width:30px;padding:5px 0;text-align:center;font-size:13px}
    .pr-in,.pr-sel{background:${C.bg2};color:${C.text};border:1px solid ${C.border};border-radius:7px;padding:4px 6px;
                   font-size:11.5px;font-family:inherit;outline:none}
    .pr-in:focus,.pr-sel:focus{border-color:${BRAND}}
    .pr-in.num{width:54px}
    .pr-sel{cursor:pointer;max-width:210px}
    .pr-chk{display:flex;align-items:center;gap:4px;font-size:11.5px;cursor:pointer;color:${C.text}}
    .pr-chk input{accent-color:${BRAND};width:13px;height:13px;margin:0}
    .pr-led{width:9px;height:9px;border-radius:50%;background:${C.dim};flex-shrink:0;transition:background .08s}
    .pr-led.flash{background:#46e08a;box-shadow:0 0 6px #46e08a}
    .pr-stat{font-size:11px;color:${C.muted};max-width:330px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .pr-stat.ok{color:#7fe0a8}.pr-stat.warn{color:${C.warn}}.pr-stat.err{color:${C.err}}
    .pr-roll{flex:1;min-height:0;display:grid;grid-template-columns:${KEY_W}px 1fr;grid-template-rows:${RULER_H}px 1fr;
             border:1px solid ${C.border};border-radius:10px;overflow:hidden;background:#0d0d0d}
    .pr-roll canvas{display:block}
    .pr-scroll{position:relative;overflow:auto;min-width:0;min-height:0;scrollbar-width:thin;scrollbar-color:${C.borderH} transparent}
    .pr-scroll::-webkit-scrollbar{width:9px;height:9px}
    .pr-scroll::-webkit-scrollbar-thumb{background:${C.borderH};border-radius:5px}
    .pr-scroll::-webkit-scrollbar-corner{background:transparent}
    .pr-foot{display:flex;flex-direction:column;gap:6px;flex-shrink:0}
    .pr-foot .row{display:flex;align-items:center;gap:8px}
    .pr-hint{flex:1;font-size:10.5px;color:${C.muted};line-height:1.5}
    .pr-abc{background:${C.bg1};border:1px solid ${C.border};border-radius:10px;padding:6px 10px}
    .pr-abc summary{cursor:pointer;font-size:11px;color:${C.text};font-weight:600;outline:none}
    .pr-abc pre{margin:6px 0 2px;max-height:130px;overflow:auto;font-size:10.5px;line-height:1.5;color:${C.text};
                white-space:pre-wrap;word-break:break-all;user-select:text}
    .pr-pop{position:absolute;inset:0;z-index:10;background:rgba(6,6,6,.78);display:flex;align-items:center;justify-content:center;border-radius:inherit}
    .pr-pop .box{width:min(460px,88%);max-height:86%;overflow:auto;background:${C.bg1};border:1px solid ${C.borderH};border-radius:14px;
                 padding:16px;display:flex;flex-direction:column;gap:10px;box-shadow:0 12px 40px rgba(0,0,0,.6)}
    .pr-pop h4{margin:0;font-size:13px;color:#fff}
    .pr-pop p{margin:0;font-size:11px;color:${C.muted};line-height:1.5}
    .pr-pop .f{display:flex;align-items:center;gap:8px}
    .pr-pop .f>label{width:92px;font-size:11px;color:${C.muted};flex-shrink:0}
    .pr-pop .f .pr-in,.pr-pop .f .pr-sel{flex:1;min-width:0}
    .pr-pop .btns{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap}
    .pr-trk{display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid ${C.border};border-radius:8px;cursor:pointer}
    .pr-trk:hover{border-color:${BRAND}}
    .pr-trk input{accent-color:${BRAND}}
  `;
  document.head.appendChild(s);
}

const deepNotes = (arr) => (arr || []).map((n) => ({ id: n.id ?? M.newId(), p: n.p, s: n.s, l: n.l, v: n.v || 90 }));

export function openPianoRoll({ root, initial = {}, title = "", onApply }) {
  injectStyles();

  // ── state ────────────────────────────────────────────────────────────────
  const S = {
    notes: deepNotes(initial.notes),
    bpm: M.clamp(Math.round(initial.bpm || 100), 20, 300),
    meter: initial.meter || "4/4",
    key: initial.key || "C",
    bars: M.clamp(Math.round(initial.bars || 8), 1, M.MAX_BARS),
    snap: 1, tool: "pen", stepW: 22,
    sel: new Set(), cursor: 0,
    playing: false, recording: false,
    loop: false, metro: true, countIn: 1,
    kbd: true, base: 60, qIn: true, follow: true, pick: "high",
    penLen: 4, dirty: false, lastNote: null,
  };
  S.bars = M.melodyBars(S.notes, S.bars, S.meter);
  const spb = () => M.stepsPerBar(S.meter);
  const totalSteps = () => S.bars * spb();
  const sps = () => S.bpm * M.STEPS_PER_QUARTER / 60;          // steps per second
  const grid = () => S.snap || MIN_LEN;
  const snapR = (v) => Math.round(v / grid()) * grid();
  const snapF = (v) => Math.floor(v / grid() + 1e-9) * grid();

  // ── undo / redo ──────────────────────────────────────────────────────────
  const hist = { undo: [], redo: [] };
  const snapshot = () => JSON.stringify({ notes: S.notes.map(({ id, p, s, l, v }) => ({ id, p, s, l, v })), bpm: S.bpm, meter: S.meter, key: S.key, bars: S.bars });
  function pushUndo() {
    hist.undo.push(snapshot()); if (hist.undo.length > 120) hist.undo.shift();
    hist.redo.length = 0; S.dirty = true; syncButtons();
  }
  function restore(json) {
    const d = JSON.parse(json);
    S.notes = deepNotes(d.notes); S.bpm = d.bpm; S.meter = d.meter; S.key = d.key; S.bars = d.bars;
    S.sel = new Set([...S.sel].filter((id) => S.notes.some((n) => n.id === id)));
    syncFields(); layout(); abcSoon(); draw(); syncButtons();
  }
  function undo() { if (!hist.undo.length) return; hist.redo.push(snapshot()); restore(hist.undo.pop()); S.dirty = true; }
  function redo() { if (!hist.redo.length) return; hist.undo.push(snapshot()); restore(hist.redo.pop()); }

  // ── DOM ──────────────────────────────────────────────────────────────────
  const ov = el("div", { className: "pr-ov", tabindex: "-1" });
  const btn = (text, onclick, cls = "", titleTxt = "") => el("button", { className: "pr-b " + cls, text, title: titleTxt, type: "button", onclick });
  const grp = (label, ...kids) => { const g = el("div", { className: "pr-grp" }); if (label) g.appendChild(el("label", { text: label })); kids.forEach((k) => k && g.appendChild(k)); return g; };
  const selEl = (opts, cur, onchange, cls = "") => {
    const e = el("select", { className: "pr-sel " + cls });
    opts.forEach(([v, l]) => { const o = el("option", { text: l }); o.value = String(v); e.appendChild(o); });
    e.value = String(cur);
    e.addEventListener("change", () => { onchange(e.value); e.blur(); });
    return e;
  };
  const numEl = (val, min, max, onchange) => {
    const e = el("input", { className: "pr-in num", type: "number", min, max, step: 1 });
    e.value = val;
    e.addEventListener("change", () => { onchange(e.value); });
    e.addEventListener("keydown", (ev) => { if (ev.key === "Enter") e.blur(); });
    return e;
  };
  const chk = (label, checked, onchange, titleTxt = "") => {
    const w = el("label", { className: "pr-chk", title: titleTxt });
    const c = el("input", { type: "checkbox" }); c.checked = checked;
    c.addEventListener("change", () => { onchange(c.checked); c.blur(); });
    w.append(c, el("span", { text: label })); w._cb = c;
    return w;
  };

  // header
  const infoEl = el("div", { className: "info" });
  const fileMidi = el("input", { type: "file", accept: ".mid,.midi,audio/midi,audio/x-midi", style: { display: "none" } });
  const hd = el("div", { className: "pr-hd" }, [
    el("div", { className: "t", text: "🎹 Melody Editor" }), infoEl,
    btn("Import MIDI…", () => fileMidi.click(), "", "Load a .mid file into the editor"),
    btn("Export MIDI", () => exportMidi(), "", "Save the melody as a .mid file"),
    btn("Clear", () => clearAll(), "", "Remove every note"),
    btn("Cancel", () => cancel()),
    btn("✓ Apply Melody", () => apply(), "pri", "Use this melody for YuE2"),
  ]);
  ov.append(hd, fileMidi);

  // transport + musical settings
  const bStop = btn("■", () => stopTransport(), "sq", "Stop (Space)");
  const bPlay = btn("▶", () => (S.playing ? stopTransport() : startTransport(false)), "sq", "Play / stop (Space)");
  const bRec = btn("●", () => toggleRecord(), "sq rec", "Record from MIDI keyboard / computer keys");
  const lblPos = el("div", { className: "pr-stat", style: { minWidth: "72px", color: C.text, fontVariantNumeric: "tabular-nums" } });
  const inBpm = numEl(S.bpm, 20, 300, (v) => {
    pushUndo();
    const u = S.playing ? unwrappedNow() : 0;          // keep the playhead where it is while the tempo changes
    S.bpm = M.clamp(Math.round(+v || 100), 20, 300);
    if (S.playing) { T.origin = u; T.t0 = inst.now(); T.schedStep = u; inst.panic(); }
    syncFields(); abcSoon();
  });
  const selMeter = selEl(M.METERS.map((m) => [m, m]), S.meter, (v) => { stopTransport(); pushUndo(); S.meter = v; S.bars = M.melodyBars(S.notes, S.bars, S.meter); syncFields(); layout(); abcSoon(); draw(); });
  const selKey = selEl(M.KEYS.map((k) => [k, k.replace(/m$/, " min").replace(/^([A-G][#b]?)$/, "$1 maj")]), S.key, (v) => { pushUndo(); S.key = v; abcSoon(); });
  const inBars = numEl(S.bars, 1, M.MAX_BARS, (v) => { pushUndo(); S.bars = M.melodyBars(S.notes, M.clamp(Math.round(+v || 1), 1, M.MAX_BARS), S.meter); syncFields(); layout(); abcSoon(); draw(); });
  const selSnap = selEl(SNAPS.map(([l, v]) => [v, l]), S.snap, (v) => { S.snap = +v; });
  const selCount = selEl([[0, "Off"], [1, "1 bar"], [2, "2 bars"]], S.countIn, (v) => { S.countIn = +v; });
  const bPen = btn("✎ Pen", () => setTool("pen"), "on", "Click / drag to draw notes");
  const bSelT = btn("⬚ Select", () => setTool("select"), "", "Drag a box to select notes");
  const bUndo = btn("↶", () => undo(), "sq", "Undo (Ctrl+Z)");
  const bRedo = btn("↷", () => redo(), "sq", "Redo (Ctrl+Y)");
  const bQuant = btn("Quantize", () => quantizeNotes(), "", "Snap start + length of the selected notes (or all) to the grid");
  const bZoomOut = btn("−", () => zoom(1 / 1.25), "sq", "Zoom out (Ctrl+wheel)");
  const bZoomIn = btn("+", () => zoom(1.25), "sq", "Zoom in (Ctrl+wheel)");
  const tChkLoop = chk("Loop", S.loop, (v) => { S.loop = v; if (S.playing) T.schedStep = Math.max(T.schedStep, 0); });
  const tChkMetro = chk("Metronome", S.metro, (v) => { S.metro = v; });
  const transport = el("div", { className: "pr-bar" }, [
    grp("", bStop, bPlay, bRec), lblPos, el("div", { className: "pr-sep" }),
    grp("BPM", inBpm), grp("Meter", selMeter), grp("Key", selKey), grp("Bars", inBars), el("div", { className: "pr-sep" }),
    grp("", tChkLoop, tChkMetro), grp("Count-in", selCount), el("div", { className: "pr-sep" }),
    grp("", bPen, bSelT), grp("Snap", selSnap), bQuant, el("div", { className: "pr-sep" }),
    grp("", bUndo, bRedo), grp("", bZoomOut, bZoomIn),
  ]);
  ov.appendChild(transport);

  // input row: MIDI device menu, computer keys, sound
  const led = el("div", { className: "pr-led", title: "MIDI activity" });
  const midiStat = el("div", { className: "pr-stat" });
  const lastNoteEl = el("div", { className: "pr-stat", style: { minWidth: "38px", color: C.text } });
  const bConnect = btn("🎛 Connect MIDI", () => midi.connect(), "", "Ask the browser for access to your MIDI devices");
  const devSel = el("select", { className: "pr-sel", title: "MIDI input device" });
  devSel.addEventListener("change", () => { midi.select(devSel.value); devSel.blur(); });
  const bRescan = btn("↻", () => midi.rescan(), "sq", "Rescan MIDI devices");
  const bOctDn = btn("◄", () => setBase(S.base - 12), "sq", "Octave down ( [ )");
  const bOctUp = btn("►", () => setBase(S.base + 12), "sq", "Octave up ( ] )");
  const octLbl = el("div", { className: "pr-stat", style: { minWidth: "34px", textAlign: "center", color: C.text } });
  const cKbd = chk("⌨ Computer keys", S.kbd, (v) => { S.kbd = v; }, "Z-M / Q-P play notes. [ ] change octave.");
  const cQin = chk("Quantize input", S.qIn, (v) => { S.qIn = v; }, "Snap recorded notes to the grid");
  const cFollow = chk("Follow", S.follow, (v) => { S.follow = v; });
  const inputBar = el("div", { className: "pr-bar" }, [
    grp("MIDI", led, bConnect, devSel, bRescan), midiStat, lastNoteEl, el("div", { className: "pr-sep" }),
    grp("", cKbd), grp("", bOctDn, octLbl, bOctUp), grp("", cQin, cFollow),
  ]);
  const instSel = el("select", { className: "pr-sel", title: "Keyboard sound" });
  instSel.addEventListener("change", () => { onInstrumentPicked(instSel.value); instSel.blur(); });
  const bInstEdit = btn("⚙", () => openSampleEditor(currentRec()), "sq", "Sample settings");
  const vol = el("input", { type: "range", min: "0", max: "1", step: "0.01", style: { width: "90px", accentColor: BRAND } });
  vol.value = A.savedVolume();
  vol.addEventListener("input", () => { inst?.setVolume(+vol.value); });
  const fileSample = el("input", { type: "file", accept: "audio/*,.wav,.mp3,.ogg,.flac,.m4a,.aiff", style: { display: "none" } });
  const soundBar = el("div", { className: "pr-bar" }, [
    grp("Sound", instSel, bInstEdit, el("div", { style: { fontSize: "13px" }, text: "🔊" }), vol),
    el("div", { className: "pr-stat", text: "Load a .wav (or any audio file) as an instrument — played pitch-shifted from its root note.", style: { maxWidth: "none", flex: "1" } }),
  ]);
  inputBar.appendChild(el("div", { style: { flex: "1" } }));
  ov.append(inputBar, soundBar, fileSample);

  // roll: ruler | keys | grid
  const rulerC = el("canvas", { style: { gridColumn: "2", gridRow: "1", cursor: "pointer" } });
  const keysC = el("canvas", { style: { gridColumn: "1", gridRow: "2", cursor: "pointer" } });
  const corner = el("div", { style: { gridColumn: "1", gridRow: "1", background: C.bg1 } });
  const scroller = el("div", { className: "pr-scroll", style: { gridColumn: "2", gridRow: "2" } });
  const content = el("div", { style: { position: "relative" } });
  const gridC = el("canvas", { style: { position: "sticky", top: "0", left: "0", touchAction: "none" } });
  content.appendChild(gridC); scroller.appendChild(content);
  const roll = el("div", { className: "pr-roll" }, [corner, rulerC, keysC, scroller]);
  ov.appendChild(roll);

  // footer: hint + ABC preview + status
  const statusEl = el("div", { className: "pr-stat", style: { maxWidth: "60%", textAlign: "right" } });
  const abcPre = el("pre");
  const abcSum = el("summary", { text: "ABC preview" });
  const abcBox = el("details", { className: "pr-abc" }, [abcSum, abcPre]);
  const bCopy = btn("Copy ABC", () => { try { navigator.clipboard.writeText(abcPre.textContent); setStatus("ABC copied", "ok"); } catch { setStatus("Copy failed", "err"); } });
  const pickSel = selEl([["high", "Chords → highest note"], ["low", "Chords → lowest note"]], S.pick, (v) => { S.pick = v; abcSoon(); });
  const foot = el("div", { className: "pr-foot" }, [
    el("div", { className: "row" }, [
      el("div", { className: "pr-hint", text: "Pen: click or drag to draw · drag a note to move · drag its right edge to resize · right-click / double-click / Del to delete · Space plays · ● records MIDI keyboard or computer keys (Z–M, Q–P)." }),
      pickSel, bCopy, statusEl,
    ]),
    abcBox,
  ]);
  ov.appendChild(foot);
  root.appendChild(ov);

  // ── canvas sizing / coordinates ──────────────────────────────────────────
  let viewW = 800, viewH = 400, dpr = Math.max(1, window.devicePixelRatio || 1);
  const g2 = gridC.getContext("2d"), r2 = rulerC.getContext("2d"), k2 = keysC.getContext("2d");
  const sx = () => scroller.scrollLeft, sy = () => scroller.scrollTop;
  const stepToX = (st) => st * S.stepW - sx();
  const pitchToY = (p) => (TOP - p) * ROW_H - sy();
  function sizeCanvas(c, ctx2, w, h) {
    c.style.width = w + "px"; c.style.height = h + "px";
    const bw = Math.max(1, Math.round(w * dpr)), bh = Math.max(1, Math.round(h * dpr));
    if (c.width !== bw || c.height !== bh) { c.width = bw; c.height = bh; }
    ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function layout() {
    viewW = Math.max(50, scroller.clientWidth); viewH = Math.max(50, scroller.clientHeight);
    content.style.width = Math.ceil(totalSteps() * S.stepW + 80) + "px";
    content.style.height = ROWS * ROW_H + "px";
    sizeCanvas(gridC, g2, viewW, viewH); sizeCanvas(rulerC, r2, viewW, RULER_H); sizeCanvas(keysC, k2, KEY_W, viewH);
  }
  // pointer position in canvas CSS pixels, robust to LiteGraph's CSS scale on the node
  function localXY(e, c) {
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.clientWidth / (r.width || 1)), y: (e.clientY - r.top) * (c.clientHeight / (r.height || 1)) };
  }
  const xToStep = (x) => (x + sx()) / S.stepW;
  const yToPitch = (y) => TOP - Math.floor((y + sy()) / ROW_H);

  // ── drawing ──────────────────────────────────────────────────────────────
  let drawQueued = false;
  function draw() { if (drawQueued) return; drawQueued = true; requestAnimationFrame(() => { drawQueued = false; paint(); }); }
  const live = new Map();     // source key -> { p, voice, note, u0 }
  const heldPitches = () => new Set([...live.values()].map((h) => h.p));

  function paint() {
    const W = viewW, H = viewH, ox = sx(), oy = sy();
    // grid
    g2.fillStyle = "#0d0d0d"; g2.fillRect(0, 0, W, H);
    const pHi = Math.min(TOP, TOP - Math.floor(oy / ROW_H)), pLo = Math.max(BOT, TOP - Math.ceil((oy + H) / ROW_H));
    for (let p = pHi; p >= pLo; p--) {
      const y = pitchToY(p);
      g2.fillStyle = M.isBlackKey(p) ? "#101010" : "#151515"; g2.fillRect(0, y, W, ROW_H);
      g2.fillStyle = p % 12 === 0 ? "#2c2c2c" : "#1c1c1c"; g2.fillRect(0, y + ROW_H - 1, W, 1);
    }
    const total = totalSteps(), beat = M.beatSteps(S.meter), bar = spb();
    const s0 = Math.max(0, Math.floor(ox / S.stepW)), s1 = Math.min(total, Math.ceil((ox + W) / S.stepW));
    for (let st = s0; st <= s1; st++) {
      const x = Math.round(stepToX(st)) + 0.5;
      const isBar = st % bar === 0, isBeat = !isBar && Math.abs(st / beat - Math.round(st / beat)) < 1e-9;
      if (!isBar && !isBeat && S.stepW < 14) continue;
      g2.fillStyle = isBar ? "#4a4a4a" : isBeat ? "#2e2e2e" : "#1b1b1b";
      g2.fillRect(x, 0, 1, H);
    }
    const endX = stepToX(total);
    if (endX < W) { g2.fillStyle = "rgba(0,0,0,.45)"; g2.fillRect(Math.max(0, endX), 0, W - Math.max(0, endX), H); }
    // notes
    const sel = S.sel;
    for (const n of S.notes) {
      const x = stepToX(n.s), w = Math.max(3, n.l * S.stepW - 1);
      if (x + w < 0 || x > W) continue;
      const y = pitchToY(n.p) + 1;
      if (y + ROW_H < 0 || y > H) continue;
      const isSel = sel.has(n.id);
      g2.globalAlpha = 0.55 + 0.45 * ((n.v || 90) / 127);
      g2.fillStyle = n.live ? "#ff6b6b" : isSel ? "#b57cf5" : BRAND;
      g2.fillRect(x, y, w, ROW_H - 2);
      g2.globalAlpha = 1;
      g2.strokeStyle = isSel ? "#ffffff" : "rgba(255,255,255,.22)"; g2.lineWidth = isSel ? 1.5 : 1;
      g2.strokeRect(x + 0.5, y + 0.5, w - 1, ROW_H - 3);
      if (w > 30) { g2.fillStyle = "rgba(255,255,255,.88)"; g2.font = "10px sans-serif"; g2.textBaseline = "middle"; g2.fillText(M.noteName(n.p), x + 4, y + ROW_H / 2 - 1); }
    }
    // rubber band
    if (drag?.mode === "band") {
      const b = drag.rect;
      g2.fillStyle = "rgba(118,18,218,.18)"; g2.strokeStyle = BRAND; g2.lineWidth = 1;
      g2.fillRect(b.x, b.y, b.w, b.h); g2.strokeRect(b.x + 0.5, b.y + 0.5, b.w, b.h);
    }
    // playhead
    const ph = displayStep(), phx = stepToX(ph);
    if (phx >= -2 && phx <= W + 2) { g2.fillStyle = "#ffcf3f"; g2.fillRect(Math.round(phx), 0, 2, H); }

    // ruler
    r2.fillStyle = C.bg1; r2.fillRect(0, 0, W, RULER_H);
    r2.font = "10.5px sans-serif"; r2.textBaseline = "middle";
    for (let st = s0; st <= s1; st++) {
      const x = Math.round(stepToX(st)) + 0.5;
      const isBar = st % bar === 0, isBeat = !isBar && Math.abs(st / beat - Math.round(st / beat)) < 1e-9;
      if (isBar) {
        r2.fillStyle = "#6a6a6a"; r2.fillRect(x, 4, 1, RULER_H - 4);
        r2.fillStyle = C.text; r2.fillText(String(st / bar + 1), x + 4, 9);
      } else if (isBeat) { r2.fillStyle = "#3a3a3a"; r2.fillRect(x, RULER_H - 9, 1, 9); }
    }
    r2.fillStyle = C.border; r2.fillRect(0, RULER_H - 1, W, 1);
    if (phx >= -6 && phx <= W + 6) {
      r2.fillStyle = "#ffcf3f"; r2.beginPath();
      r2.moveTo(phx - 6, RULER_H - 11); r2.lineTo(phx + 6, RULER_H - 11); r2.lineTo(phx, RULER_H - 1); r2.closePath(); r2.fill();
    }

    // keys
    const held = heldPitches();
    k2.fillStyle = "#0d0d0d"; k2.fillRect(0, 0, KEY_W, H);
    k2.font = "10px sans-serif"; k2.textBaseline = "middle";
    for (let p = pHi; p >= pLo; p--) {
      const y = pitchToY(p), black = M.isBlackKey(p), on = held.has(p);
      k2.fillStyle = on ? BRAND : "#e4e4e4"; k2.fillRect(0, y, KEY_W, ROW_H - 1);
      if (black) { k2.fillStyle = on ? BRAND : "#1a1a1a"; k2.fillRect(0, y, KEY_W * 0.62, ROW_H - 1); }
      if (p % 12 === 0) { k2.fillStyle = on ? "#fff" : "#555"; k2.fillText(M.noteName(p), KEY_W - 28, y + ROW_H / 2); }
    }
    k2.fillStyle = C.border; k2.fillRect(KEY_W - 1, 0, 1, H);
  }

  // ── transport ────────────────────────────────────────────────────────────
  let inst = null;
  const T = { t0: 0, origin: 0, schedStep: 0, timer: null, raf: 0, from: 0 };
  const stepAt = (ct) => T.origin + (ct - T.t0) * sps();
  const ctAt = (st) => T.t0 + (st - T.origin) / sps();
  function unwrappedNow() { return inst ? stepAt(inst.now()) : 0; }
  // what the player is hearing right now: the click reaches the ears outputLatency after it was scheduled,
  // and a note played "on the beat" arrives that much late — recording corrects for it
  const heardLatency = () => (inst ? Math.min(0.25, inst.ctx.outputLatency || inst.ctx.baseLatency || 0) : 0);
  const recStep = () => (inst ? stepAt(inst.now() - heardLatency()) : 0);
  function wrapStep(u) { const L = totalSteps(); return S.loop && u >= 0 ? u % L : u; }
  function displayStep() {
    if (!S.playing) return S.cursor;
    const u = unwrappedNow();
    return u < 0 ? T.from : Math.min(wrapStep(u), totalSteps());
  }

  function ensureBars(endStep) {
    let grew = false;
    while (S.bars * spb() < Math.ceil(endStep) && S.bars < M.MAX_BARS) { S.bars++; grew = true; }
    if (grew) { syncFields(); layout(); }
    return grew;
  }

  function startTransport(rec) {
    if (S.playing) return;
    A.resumeCtx();
    ensureInst();
    const ci = rec && S.countIn > 0 ? S.countIn * spb() : 0;
    const from = S.cursor >= totalSteps() ? 0 : S.cursor;
    T.from = from; T.origin = from - ci; T.t0 = inst.now() + 0.08; T.schedStep = T.origin;
    S.playing = true; S.recording = !!rec;
    if (rec) pushUndo();
    T.timer = setInterval(tick, 25);
    const frame = () => { if (!S.playing) return; animate(); T.raf = requestAnimationFrame(frame); };
    T.raf = requestAnimationFrame(frame);
    syncButtons();
  }
  function stopTransport() {
    if (!S.playing) { S.recording = false; syncButtons(); return; }
    finalizeAllLive();
    clearInterval(T.timer); cancelAnimationFrame(T.raf); T.timer = 0;
    S.playing = false; S.recording = false; S.cursor = T.from;
    inst?.panic();
    syncButtons(); abcSoon(); draw();
  }
  function toggleRecord() {
    if (!S.playing) { startTransport(true); return; }
    if (!S.recording) pushUndo();
    if (S.recording) finalizeAllLive();
    S.recording = !S.recording; syncButtons();
  }
  function seek(step) {
    const st = M.clamp(step, 0, totalSteps());
    if (S.playing) {
      finalizeAllLive(); inst.panic();
      T.origin = st; T.t0 = inst.now() + 0.02; T.schedStep = st;
    } else S.cursor = st;
    draw();
  }

  function tick() {
    if (!S.playing) return;
    const now = inst.now();
    let hi = stepAt(now + 0.16);
    if (!S.loop && S.recording && hi > totalSteps()) { ensureBars(hi + 1); }
    const L = totalSteps();
    if (!S.loop) hi = Math.min(hi, L);
    const lo = T.schedStep;
    if (hi > lo) {
      if (S.metro) {
        const beat = M.beatSteps(S.meter), bar = spb();
        for (let b = Math.ceil(lo / beat - 1e-9) * beat; b < hi; b += beat) {
          const ba = ((b % bar) + bar) % bar;
          if (!S.loop && b >= L) break;
          if (b >= T.origin - 1e-6) inst.click(Math.max(ctAt(b), now), ba < 1e-6);
        }
      }
      const kLo = S.loop ? Math.floor(Math.max(lo, 0) / L) : 0, kHi = S.loop ? Math.floor(hi / L) : 0;
      for (let k = kLo; k <= kHi; k++) {
        for (const n of S.notes) {
          if (n.live) continue;
          const a = n.s + k * L;
          if (a < Math.max(lo, 0) - 1e-9 || a >= hi) continue;
          const end = Math.min(a + n.l, S.loop ? (k + 1) * L : Infinity);
          inst.scheduleNote(n.p, n.v || 90, Math.max(ctAt(a), now), Math.max(ctAt(end), now + 0.02));
        }
      }
      T.schedStep = hi;
    }
    if (!S.loop && !S.recording && stepAt(now) >= L + 0.4) stopTransport();
    else if (!S.loop && S.recording && stepAt(now) >= M.MAX_BARS * spb()) stopTransport();
  }

  function animate() {
    const u = unwrappedNow(), ur = recStep();
    for (const h of live.values()) {
      if (!h.note) continue;
      let len = ur - h.u0;
      if (len < 0) len += totalSteps();
      h.note.l = Math.max(MIN_LEN, S.loop ? Math.min(len, totalSteps() - h.note.s) : len);
      if (!S.loop) ensureBars(h.note.s + h.note.l + 1);
    }
    if (S.follow) {
      const x = displayStep() * S.stepW;
      if (x < sx() + viewW * 0.05 || x > sx() + viewW * 0.88) scroller.scrollLeft = Math.max(0, x - viewW * 0.2);
    }
    lblPos.textContent = posLabel(u);
    paint();
  }
  function posLabel(u) {
    if (u < 0) { const b = Math.ceil(-u / M.beatSteps(S.meter)); return "Count-in " + b; }
    const w = Math.min(Math.max(0, wrapStep(u)), totalSteps()), bar = spb();
    return `${Math.floor(w / bar) + 1}.${Math.floor((w % bar) / M.beatSteps(S.meter)) + 1}`;
  }

  // ── live input: MIDI keyboard / computer keys / on-screen keys ──────────────
  function inputNoteOn(src, p, vel = 90) {
    p = M.clamp(Math.round(p), 0, 127);
    if (live.has(src)) inputNoteOff(src);
    if (!inst) { A.resumeCtx(); ensureInst(); }
    const voice = inst.noteOn(p, vel);
    S.lastNote = p; lastNoteEl.textContent = "♪ " + M.noteName(p);
    let note = null, u0 = 0;
    if (S.playing && S.recording) {
      u0 = recStep();
      if (u0 >= -1) {                      // a note landing just before the downbeat still counts (clamped to step 0)
        const w = wrapStep(u0);
        const start = S.qIn ? Math.min(snapR(w), S.loop ? totalSteps() - grid() : Infinity) : w;
        if (!S.loop) ensureBars(start + 2);
        note = { id: M.newId(), p: M.clamp(p, M.PITCH_MIN, M.PITCH_MAX), s: Math.max(0, start), l: MIN_LEN, v: vel, live: true };
        S.notes.push(note); S.dirty = true;
      }
    }
    live.set(src, { p, voice, note, u0 });
    draw();
  }
  function inputNoteOff(src) {
    const h = live.get(src); if (!h) return;
    live.delete(src);
    inst?.noteOff(h.voice);
    if (h.note) finalizeNote(h);
    draw();
  }
  function finalizeNote(h) {
    let raw = recStep() - h.u0;
    if (raw < 0) raw += totalSteps();
    let len = S.qIn ? Math.max(grid(), Math.round(raw / grid()) * grid()) : Math.max(MIN_LEN, raw);
    if (S.loop) len = Math.min(len, totalSteps() - h.note.s);
    else ensureBars(h.note.s + len);
    h.note.l = Math.max(MIN_LEN, len); delete h.note.live;
    abcSoon();
  }
  function finalizeAllLive() {
    for (const [src, h] of [...live]) { live.delete(src); inst?.noteOff(h.voice); if (h.note) finalizeNote(h); }
    S.notes.forEach((n) => { delete n.live; });
  }

  const midi = A.createMidiInput({
    onNote: (on, p, v) => (on ? inputNoteOn("m" + p, p, v) : inputNoteOff("m" + p)),
    onChange: () => syncMidi(),
    onActivity: () => { led.classList.add("flash"); clearTimeout(led._t); led._t = setTimeout(() => led.classList.remove("flash"), 110); },
    onPanic: () => { for (const k of [...live.keys()]) if (k[0] === "m") inputNoteOff(k); },
  });
  function syncMidi() {
    const st = midi.status, devs = midi.devices();
    const ready = st === "ready";
    bConnect.style.display = ready ? "none" : "";
    devSel.style.display = ready ? "" : "none"; bRescan.style.display = ready ? "" : "none";
    let txt = "", cls = "";
    if (st === "unsupported") { txt = "Web MIDI isn't available in this browser — use Chrome or Edge."; cls = "err"; }
    else if (st === "insecure") { txt = "Web MIDI needs https:// or localhost."; cls = "err"; }
    else if (st === "denied") { txt = "MIDI access was blocked — allow it in the site settings, then Connect again."; cls = "err"; }
    else if (st === "error") { txt = "MIDI error: " + midi.error; cls = "err"; }
    else if (st === "idle") { txt = "Not connected — plug in your keyboard, then Connect MIDI."; }
    else if (!devs.length) { txt = "No MIDI device found — plug one in, then press ↻."; cls = "warn"; }
    else {
      const names = midi.activeNames();
      txt = names.length ? "Listening: " + names.join(", ") : "Selected device is not connected."; cls = names.length ? "ok" : "warn";
    }
    midiStat.textContent = txt; midiStat.className = "pr-stat " + cls; midiStat.title = txt;
    if (ready) {
      devSel.replaceChildren();
      const add = (v, l) => { const o = el("option", { text: l }); o.value = v; devSel.appendChild(o); };
      add("all", `All devices (${devs.filter((d) => d.state === "connected").length})`);
      devs.forEach((d) => add(d.id, d.name + (d.state === "connected" ? "" : " (disconnected)")));
      devSel.value = [...devSel.options].some((o) => o.value === midi.selected) ? midi.selected : "all";
    }
  }

  // computer keyboard + shortcuts
  const downKeys = new Map();   // e.code -> pitch
  const NUM_EDIT_KEYS = new Set(["Backspace", "Delete", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Tab", "Enter", "Home", "End"]);
  function typingTarget(t, e) {
    if (!t) return false;
    if (t.tagName === "TEXTAREA" || t.isContentEditable || t.tagName === "SELECT") return true;
    if (t.tagName !== "INPUT") return false;
    if (["checkbox", "range", "file", "button"].includes(t.type)) return false;
    // a number box only owns the keys that edit a number — Space / letters still drive the roll
    if (t.type === "number") return /^[0-9.+\-eE]$/.test(e.key) || NUM_EDIT_KEYS.has(e.key) || e.ctrlKey || e.metaKey;
    return true;
  }
  function onKeyDown(e) {
    if (!ov.isConnected) { close(); return; }      // the node was removed while the editor was open
    if (ov.querySelector(".pr-pop") && !typingTarget(e.target, e)) {
      if (e.key === "Escape") { e.stopImmediatePropagation(); [...ov.querySelectorAll(".pr-pop .btns button")].find((b) => b.textContent === "Cancel")?.click(); }
      return;
    }
    if (typingTarget(e.target, e)) return;
    if (e.target?.tagName === "INPUT" && e.target.type === "number") e.target.blur();
    const mod = e.ctrlKey || e.metaKey;
    let handled = true;
    if (mod && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === "z") (e.shiftKey ? redo() : undo());
      else if (k === "y") redo();
      else if (k === "a") { S.sel = new Set(S.notes.map((n) => n.id)); draw(); }
      else if (k === "c") copySel();
      else if (k === "v") pasteSel();
      else if (k === "x") { copySel(); deleteSel(); }
      else handled = false;
    } else if (e.code === "Space") { S.playing ? stopTransport() : startTransport(false); }
    else if (e.code === "Delete" || e.code === "Backspace") deleteSel();
    else if (e.code === "Home") seek(0);
    else if (e.code === "BracketLeft") setBase(S.base - 12);
    else if (e.code === "BracketRight") setBase(S.base + 12);
    else if (e.key.startsWith("Arrow") && S.sel.size) nudge(e);
    else if (S.kbd && !e.altKey && KEYMAP[e.code] !== undefined) {
      if (!e.repeat && !downKeys.has(e.code)) { const p = S.base + KEYMAP[e.code]; downKeys.set(e.code, p); inputNoteOn("k" + e.code, p, 96); }
    } else handled = false;
    if (handled) { e.preventDefault(); e.stopImmediatePropagation(); }
  }
  function onKeyUp(e) {
    if (downKeys.has(e.code)) { downKeys.delete(e.code); inputNoteOff("k" + e.code); e.preventDefault(); e.stopImmediatePropagation(); }
  }
  function onBlur() { for (const k of [...live.keys()]) if (k[0] === "k") inputNoteOff(k); downKeys.clear(); }
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("keyup", onKeyUp, true);
  window.addEventListener("blur", onBlur);

  function setBase(p) { S.base = M.clamp(p, 24, 96); octLbl.textContent = M.noteName(S.base); }

  // ── editing helpers ──────────────────────────────────────────────────────
  const noteById = (id) => S.notes.find((n) => n.id === id);
  function deleteSel() {
    if (!S.sel.size) return;
    pushUndo(); S.notes = S.notes.filter((n) => !S.sel.has(n.id)); S.sel.clear(); abcSoon(); draw();
  }
  function nudge(e) {
    pushUndo();
    const big = e.shiftKey;
    for (const id of S.sel) {
      const n = noteById(id); if (!n) continue;
      if (e.key === "ArrowUp") n.p = M.clamp(n.p + (big ? 12 : 1), BOT, TOP);
      else if (e.key === "ArrowDown") n.p = M.clamp(n.p - (big ? 12 : 1), BOT, TOP);
      else if (e.key === "ArrowLeft") n.s = Math.max(0, n.s - grid());
      else if (e.key === "ArrowRight") n.s += grid();
    }
    ensureBars(Math.max(...[...S.sel].map((id) => { const n = noteById(id); return n ? n.s + n.l : 0; })));
    abcSoon(); draw();
  }
  let clip = [];
  function copySel() {
    const ns = S.notes.filter((n) => S.sel.has(n.id));
    if (!ns.length) return;
    const m = Math.min(...ns.map((n) => n.s));
    clip = ns.map((n) => ({ p: n.p, s: n.s - m, l: n.l, v: n.v }));
    setStatus(`Copied ${clip.length} note${clip.length > 1 ? "s" : ""}`, "ok");
  }
  function pasteSel() {
    if (!clip.length) return;
    pushUndo();
    const at = S.playing ? snapR(displayStep()) : S.cursor;
    S.sel.clear();
    clip.forEach((c) => { const n = { id: M.newId(), p: c.p, s: at + c.s, l: c.l, v: c.v }; S.notes.push(n); S.sel.add(n.id); });
    ensureBars(Math.max(...S.notes.map((n) => n.s + n.l)));
    abcSoon(); draw();
  }
  function quantizeNotes() {
    const target = S.sel.size ? S.notes.filter((n) => S.sel.has(n.id)) : S.notes;
    if (!target.length) return;
    pushUndo();
    const g = S.snap || 1;
    target.forEach((n) => { n.s = Math.max(0, Math.round(n.s / g) * g); n.l = Math.max(g, Math.round(n.l / g) * g); });
    ensureBars(Math.max(...S.notes.map((n) => n.s + n.l)));
    abcSoon(); draw(); setStatus(`Quantized ${target.length} note${target.length > 1 ? "s" : ""} to ${SNAPS.find((x) => x[1] === (S.snap || 1))?.[0] || "1/16"}`, "ok");
  }
  function clearAll() {
    if (!S.notes.length) return;
    if (!confirm("Remove every note from the Melody Editor?")) return;
    pushUndo(); S.notes = []; S.sel.clear(); abcSoon(); draw();
  }
  function setTool(t) { S.tool = t; bPen.classList.toggle("on", t === "pen"); bSelT.classList.toggle("on", t === "select"); }
  function zoom(f, anchorX) {
    const ax = anchorX ?? viewW / 2, stepAtAnchor = xToStep(ax);
    S.stepW = M.clamp(S.stepW * f, 6, 80);
    layout();
    scroller.scrollLeft = Math.max(0, stepAtAnchor * S.stepW - ax);
    draw();
  }

  // ── pointer interaction on the grid ──────────────────────────────────────
  // capturing keeps a drag alive outside the canvas; a stale pointer id must not abort the gesture
  const capture = (c, e) => { try { c.setPointerCapture(e.pointerId); } catch {} };
  let drag = null;
  function hitNote(x, y) {
    for (let i = S.notes.length - 1; i >= 0; i--) {
      const n = S.notes[i];
      const nx = stepToX(n.s), nw = Math.max(3, n.l * S.stepW - 1), ny = pitchToY(n.p);
      if (x >= nx && x <= nx + nw && y >= ny && y <= ny + ROW_H) return { n, edge: x > nx + nw - Math.min(7, nw * 0.4) && nw > 8 };
    }
    return null;
  }
  gridC.addEventListener("pointerdown", (e) => {
    if (e.button === 2) return;     // handled by contextmenu
    capture(gridC, e);
    ov.focus({ preventScroll: true });
    const { x, y } = localXY(e, gridC);
    const hit = hitNote(x, y);
    const p = M.clamp(yToPitch(y), BOT, TOP);
    if (hit) {
      const { n, edge } = hit;
      if (e.shiftKey) { S.sel.has(n.id) ? S.sel.delete(n.id) : S.sel.add(n.id); }
      else if (!S.sel.has(n.id)) { S.sel = new Set([n.id]); }
      const ids = [...S.sel];
      drag = {
        mode: edge ? "resize" : "move", id: n.id, x0: x, y0: y, pushed: false,
        orig: ids.map((id) => { const m = noteById(id); return { id, s: m.s, p: m.p, l: m.l }; }),
        pitch0: n.p,
      };
      if (!edge) previewPitch(n.p);
    } else if (S.tool === "pen") {
      pushUndo();
      const s = Math.max(0, snapF(xToStep(x)));
      const n = { id: M.newId(), p, s, l: Math.max(grid(), S.penLen), v: 96 };
      S.notes.push(n); S.sel = new Set([n.id]);
      ensureBars(n.s + n.l);
      drag = { mode: "draw", id: n.id, s0: s, pushed: true };
      previewPitch(p); abcSoon();
    } else {
      if (!e.shiftKey) S.sel.clear();
      drag = { mode: "band", x0: x, y0: y, rect: { x, y, w: 0, h: 0 }, base: new Set(S.sel) };
    }
    draw();
  });
  gridC.addEventListener("pointermove", (e) => {
    const { x, y } = localXY(e, gridC);
    if (!drag) {
      const hit = hitNote(x, y);
      gridC.style.cursor = hit ? (hit.edge ? "ew-resize" : "grab") : S.tool === "pen" ? "crosshair" : "default";
      return;
    }
    if (drag.mode === "draw") {
      const n = noteById(drag.id); if (!n) return;
      n.l = Math.max(grid(), snapR(xToStep(x) - n.s));
      ensureBars(n.s + n.l); abcSoon();
    } else if (drag.mode === "move" || drag.mode === "resize") {
      const dxStepsRaw = (x - drag.x0) / S.stepW;
      if (!drag.pushed && (Math.abs(x - drag.x0) > 2 || Math.abs(y - drag.y0) > 2)) { pushUndo(); drag.pushed = true; }
      if (!drag.pushed) return;
      const prim = drag.orig.find((o) => o.id === drag.id);
      if (drag.mode === "resize") {
        const newL = Math.max(grid(), snapR(prim.l + dxStepsRaw));
        const dl = newL - prim.l;
        drag.orig.forEach((o) => { const n = noteById(o.id); if (n) n.l = Math.max(grid(), o.l + dl); });
        S.penLen = newL;
      } else {
        const newS = Math.max(0, snapR(prim.s + dxStepsRaw));
        const ds = newS - prim.s;
        const dp = Math.round(-(y - drag.y0) / ROW_H);
        const lo = Math.min(...drag.orig.map((o) => o.p)), hi = Math.max(...drag.orig.map((o) => o.p));
        const dpc = M.clamp(dp, BOT - lo, TOP - hi);
        const dsc = Math.max(ds, -Math.min(...drag.orig.map((o) => o.s)));
        drag.orig.forEach((o) => { const n = noteById(o.id); if (n) { n.s = o.s + dsc; n.p = o.p + dpc; } });
        const np = prim.p + dpc;
        if (np !== drag.pitch0) { previewPitch(np); drag.pitch0 = np; }
      }
      ensureBars(Math.max(...drag.orig.map((o) => { const n = noteById(o.id); return n ? n.s + n.l : 0; })));
      abcSoon();
    } else if (drag.mode === "band") {
      const r = { x: Math.min(x, drag.x0), y: Math.min(y, drag.y0), w: Math.abs(x - drag.x0), h: Math.abs(y - drag.y0) };
      drag.rect = r;
      S.sel = new Set(drag.base);
      for (const n of S.notes) {
        const nx = stepToX(n.s), nw = Math.max(3, n.l * S.stepW), ny = pitchToY(n.p);
        if (nx < r.x + r.w && nx + nw > r.x && ny < r.y + r.h && ny + ROW_H > r.y) S.sel.add(n.id);
      }
    }
    draw();
  });
  const endDrag = (e) => {
    if (!drag) return;
    if (drag.mode === "draw") { const n = noteById(drag.id); if (n) S.penLen = n.l; }
    stopPreview(); drag = null; draw();
    try { gridC.releasePointerCapture(e.pointerId); } catch {}
  };
  gridC.addEventListener("pointerup", endDrag);
  gridC.addEventListener("pointercancel", endDrag);
  gridC.addEventListener("dblclick", (e) => {
    const { x, y } = localXY(e, gridC); const hit = hitNote(x, y);
    if (hit) { pushUndo(); S.notes = S.notes.filter((n) => n.id !== hit.n.id); S.sel.delete(hit.n.id); abcSoon(); draw(); }
  });
  gridC.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const { x, y } = localXY(e, gridC); const hit = hitNote(x, y);
    if (hit) { pushUndo(); S.notes = S.notes.filter((n) => n.id !== hit.n.id); S.sel.delete(hit.n.id); abcSoon(); draw(); }
  });
  scroller.addEventListener("wheel", (e) => {
    e.stopPropagation();
    if (e.ctrlKey) { e.preventDefault(); zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, localXY(e, gridC).x); }
  }, { passive: false });
  scroller.addEventListener("scroll", () => draw());

  // audition while drawing / moving
  let previewSrc = null;
  function previewPitch(p) { stopPreview(); if (!inst) { A.resumeCtx(); ensureInst(); } previewSrc = "pv"; const v = inst.noteOn(p, 90); live.set("pv", { p, voice: v, note: null, u0: 0 }); setTimeout(() => { if (live.get("pv")?.voice === v) { inst.noteOff(v); live.delete("pv"); draw(); } }, 600); }
  function stopPreview() { if (previewSrc && live.has(previewSrc)) { inst.noteOff(live.get(previewSrc).voice); live.delete(previewSrc); } previewSrc = null; }

  // ruler: seek / scrub
  let rulerDrag = false;
  const rulerSeek = (e) => { const { x } = localXY(e, rulerC); seek(Math.max(0, snapF(xToStep(x)))); };
  rulerC.addEventListener("pointerdown", (e) => { rulerDrag = true; capture(rulerC, e); rulerSeek(e); });
  rulerC.addEventListener("pointermove", (e) => { if (rulerDrag) rulerSeek(e); });
  rulerC.addEventListener("pointerup", () => { rulerDrag = false; });

  // on-screen piano keys
  let keyDrag = null;
  const keyPitch = (e) => M.clamp(yToPitch(localXY(e, keysC).y), BOT, TOP);
  keysC.addEventListener("pointerdown", (e) => { capture(keysC, e); const p = keyPitch(e); keyDrag = p; inputNoteOn("x", p, 90); });
  keysC.addEventListener("pointermove", (e) => { if (keyDrag == null) return; const p = keyPitch(e); if (p !== keyDrag) { inputNoteOff("x"); keyDrag = p; inputNoteOn("x", p, 90); } });
  const keyUp = () => { if (keyDrag != null) { inputNoteOff("x"); keyDrag = null; } };
  keysC.addEventListener("pointerup", keyUp); keysC.addEventListener("pointercancel", keyUp);

  // ── instrument / sample library ──────────────────────────────────────────
  const decoded = new Map();     // id -> decoded sample
  let samples = [];              // records from IndexedDB
  const currentRec = () => samples.find((s) => s.id === A.savedInstrumentId()) || null;
  function ensureInst() {
    if (!inst) {
      inst = A.createInstrument();
      applyInstrument();
    }
    return inst;
  }
  async function applyInstrument() {
    const id = A.savedInstrumentId();
    const rec = samples.find((s) => s.id === id);
    if (!rec) { inst?.setSample(null); return; }
    try {
      let d = decoded.get(id);
      if (!d) { d = await A.decodeSample(rec); decoded.set(id, d); }
      inst?.setSample({ ...d, root: rec.root, loop: rec.loop, oneShot: rec.oneShot, release: rec.release });
    } catch { inst?.setSample(null); setStatus("Could not decode that sample — using the built-in synth", "err"); }
  }
  function renderInstrumentList() {
    instSel.replaceChildren();
    const add = (v, l) => { const o = el("option", { text: l }); o.value = v; instSel.appendChild(o); };
    add("synth", "Built-in synth");
    samples.forEach((s) => add(s.id, "🎵 " + s.name));
    add("__load", "＋ Load sample file…");
    const cur = A.savedInstrumentId();
    instSel.value = samples.some((s) => s.id === cur) ? cur : "synth";
    bInstEdit.disabled = !currentRec();
  }
  async function onInstrumentPicked(v) {
    if (v === "__load") { renderInstrumentList(); fileSample.click(); return; }
    A.saveInstrumentId(v); await applyInstrument(); renderInstrumentList();
    if (v !== "synth") setStatus("Sound: " + (currentRec()?.name || ""), "ok");
  }
  fileSample.addEventListener("change", async () => {
    const f = fileSample.files?.[0]; fileSample.value = "";
    if (!f) return;
    try {
      A.resumeCtx();
      const data = await f.arrayBuffer();
      const rec = { id: "s" + Date.now().toString(36), name: f.name.replace(/\.[^.]+$/, ""), root: 60, loop: false, oneShot: false, release: 150, mime: f.type, data, created: Date.now() };
      const d = await A.decodeSample(rec);                       // throws when the file isn't decodable audio
      rec.root = A.rootFromFilename(f.name) ?? A.detectRootNote(d.buffer) ?? 60;
      decoded.set(rec.id, d);
      openSampleEditor(rec, true);
    } catch { setStatus("Could not read that file as audio (try .wav / .mp3 / .ogg)", "err"); }
  });

  function popup(build) {
    const pop = el("div", { className: "pr-pop" });
    const box = el("div", { className: "box" });
    pop.appendChild(box); ov.appendChild(pop);
    build(box, () => pop.remove());
    return pop;
  }
  function openSampleEditor(rec, isNew = false) {
    if (!rec) return;
    const work = { ...rec };
    popup((box, close) => {
      box.appendChild(el("h4", { text: isNew ? "New sample instrument" : "Sample settings" }));
      box.appendChild(el("p", { text: "The keyboard plays this sound, pitch-shifted from its root note. Set the root to the note the recording actually sings (e.g. a C4 piano sample → C4)." }));
      const nameIn = el("input", { className: "pr-in", value: work.name });
      nameIn.addEventListener("input", () => { work.name = nameIn.value; });
      const rootSel = selEl(NOTE_OPTS, work.root, (v) => { work.root = +v; });
      const detectBtn = btn("Detect pitch", () => {
        const d = decoded.get(work.id) || null;
        const p = d ? A.detectRootNote(d.buffer) : null;
        if (p != null) { work.root = p; rootSel.value = String(p); setStatus("Detected " + M.noteName(p), "ok"); }
        else setStatus("Couldn't detect a clear pitch — set the root note manually", "warn");
      });
      const loopC = chk("Loop while the key is held", work.loop, (v) => { work.loop = v; });
      const shotC = chk("One-shot (play the whole sample, ignore note length)", work.oneShot, (v) => { work.oneShot = v; });
      const relIn = el("input", { className: "pr-in", type: "number", min: "10", max: "3000", value: work.release });
      relIn.addEventListener("input", () => { work.release = M.clamp(+relIn.value || 150, 10, 3000); });
      const f = (label, ...k) => el("div", { className: "f" }, [el("label", { text: label }), ...k]);
      box.append(f("Name", nameIn), f("Root note", rootSel, detectBtn), f("Release (ms)", relIn), loopC, shotC);
      let testV = null;
      const testBtn = btn("▶ Test (C4)", () => {
        ensureInst();
        const d = decoded.get(work.id); if (!d) return;
        const prev = inst.getSample();
        inst.setSample({ ...d, root: work.root, loop: work.loop, oneShot: work.oneShot, release: work.release });
        testV = inst.noteOn(60, 100); inst.noteOff(testV, inst.now() + 1.0);
        setTimeout(() => inst.setSample(prev), 1500);
      });
      const btns = el("div", { className: "btns" });
      if (!isNew) btns.appendChild(btn("Delete", async () => {
        if (!confirm(`Delete sample "${work.name}"?`)) return;
        await A.deleteSample(work.id); decoded.delete(work.id);
        samples = samples.filter((s) => s.id !== work.id);
        if (A.savedInstrumentId() === work.id) { A.saveInstrumentId("synth"); inst?.setSample(null); }
        renderInstrumentList(); close();
      }));
      btns.append(testBtn, btn("Cancel", () => { if (isNew) decoded.delete(work.id); close(); }), btn(isNew ? "Save & use" : "Save", async () => {
        const out = { ...work, name: (work.name || "Sample").trim() || "Sample" };
        await A.putSample(out);
        const i = samples.findIndex((s) => s.id === out.id);
        if (i >= 0) samples[i] = out; else samples.push(out);
        decoded.set(out.id, { ...(decoded.get(out.id) || {}), id: out.id, name: out.name });
        A.saveInstrumentId(out.id);
        if (!A.sampleStorePersistent) setStatus("Saved for this session only (browser storage unavailable)", "warn");
        await applyInstrument(); renderInstrumentList(); close();
      }, "pri"));
      box.appendChild(btns);
    });
  }

  // ── MIDI file import / export ────────────────────────────────────────────
  function exportMidi() {
    if (!S.notes.length) { setStatus("Nothing to export — the editor is empty", "warn"); return; }
    const bytes = M.writeMidi(S.notes, { bpm: S.bpm, meter: S.meter, name: title || "Melody" });
    const blob = new Blob([bytes], { type: "audio/midi" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = ((title || "melody").replace(/[\\/:*?"<>|]/g, "_").trim() || "melody") + ".mid";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    setStatus(`Exported ${S.notes.length} notes`, "ok");
  }
  fileMidi.addEventListener("change", async () => {
    const f = fileMidi.files?.[0]; fileMidi.value = "";
    if (!f) return;
    try {
      const parsed = M.parseMidi(await f.arrayBuffer());
      const withNotes = parsed.tracks.filter((t) => t.notes.length);
      if (!withNotes.length) { setStatus("That MIDI file has no notes", "warn"); return; }
      if (withNotes.length === 1) { importTracks(parsed, [withNotes[0].index], f.name); return; }
      const best = withNotes.filter((t) => !t.drum).sort((a, b) => b.notes.length - a.notes.length)[0] || withNotes[0];
      popup((box, close) => {
        box.appendChild(el("h4", { text: "Choose track(s) to import" }));
        box.appendChild(el("p", { text: "Pick the melody track. Several tracks are merged into one line; chords are reduced to a single note when the ABC is built." }));
        const checks = [];
        withNotes.forEach((t) => {
          const lo = Math.min(...t.notes.map((n) => n.p)), hi = Math.max(...t.notes.map((n) => n.p));
          const cb = el("input", { type: "checkbox" }); cb.checked = t === best;
          const row = el("label", { className: "pr-trk" }, [cb, el("div", { style: { flex: "1", minWidth: 0 } }, [
            el("div", { text: t.name || `Track ${t.index + 1}`, style: { color: "#fff", fontWeight: "600" } }),
            el("div", { text: `${t.notes.length} notes · ${M.noteName(lo)}–${M.noteName(hi)}${t.drum ? " · drums" : ""}`, style: { color: C.muted, fontSize: "10.5px" } }),
          ])]);
          checks.push([t, cb]); box.appendChild(row);
        });
        box.appendChild(el("div", { className: "btns" }, [
          btn("Cancel", close),
          btn("Import", () => { const idx = checks.filter(([, c]) => c.checked).map(([t]) => t.index); if (!idx.length) return; close(); importTracks(parsed, idx, f.name); }, "pri"),
        ]));
      });
    } catch (err) { setStatus("Import failed: " + (err?.message || err), "err"); }
  });
  function importTracks(parsed, idx, fname) {
    const r = M.midiToMelody(parsed, idx);
    if (!r.notes.length) { setStatus("No usable notes in that track", "warn"); return; }
    pushUndo();
    S.notes = r.notes; S.bpm = r.bpm; S.meter = r.meter; S.bars = r.bars; S.sel.clear(); S.cursor = 0;
    syncFields(); layout(); scroller.scrollLeft = 0; abcSoon(); draw();
    const warn = [r.tempoChanges ? "tempo changes ignored" : "", r.truncated ? `cut at ${M.MAX_BARS} bars` : ""].filter(Boolean).join(", ");
    setStatus(`Imported ${r.notes.length} notes from ${fname}${warn ? " (" + warn + ")" : ""}`, warn ? "warn" : "ok");
  }

  // ── ABC preview, info, status ────────────────────────────────────────────
  let abcTimer = 0, lastAbc = null;
  function abcSoon() { clearTimeout(abcTimer); abcTimer = setTimeout(refreshAbc, 120); }
  function refreshAbc() {
    const r = M.buildAbc({ notes: S.notes, bpm: S.bpm, meter: S.meter, key: S.key, bars: S.bars, title, pick: S.pick });
    lastAbc = r;
    abcPre.textContent = r.abc;
    const notesTxt = S.notes.length ? `${r.noteCount} notes` : "no notes";
    abcSum.textContent = `ABC preview — ${r.chars} chars` + (r.dropped ? ` · ${r.dropped} overlapping note${r.dropped > 1 ? "s" : ""} dropped (single melody line)` : "");
    abcSum.style.color = r.chars > 4000 ? C.warn : "";
    infoEl.textContent = `${S.bars} bar${S.bars > 1 ? "s" : ""} · ${notesTxt}` + (S.notes.length ? ` · melody ${r.bars} bar${r.bars > 1 ? "s" : ""} / ${r.seconds.toFixed(1)} s` : "") + ` · ${S.key} · ${S.bpm} BPM · ${S.meter}` + (r.chars > 4000 ? " · long melody — generation may be slow" : "");
  }
  let statusT = 0;
  function setStatus(msg, kind = "") {
    statusEl.textContent = msg; statusEl.className = "pr-stat " + kind;
    clearTimeout(statusT); statusT = setTimeout(() => { statusEl.textContent = ""; }, 6000);
  }

  function syncFields() {
    inBpm.value = S.bpm; selMeter.value = S.meter; selKey.value = S.key; inBars.value = S.bars;
    inBars.min = M.melodyBars(S.notes, 1, S.meter);
  }
  function syncButtons() {
    bPlay.textContent = S.playing ? "⏸" : "▶"; bPlay.classList.toggle("on", S.playing);
    bRec.classList.toggle("on", S.recording);
    bUndo.disabled = !hist.undo.length; bRedo.disabled = !hist.redo.length;
    lblPos.textContent = S.playing ? lblPos.textContent : posLabel(S.cursor);
  }

  // ── close / apply ────────────────────────────────────────────────────────
  let closed = false;
  function close() {
    if (closed) return; closed = true;
    try { stopTransport(); } catch {}
    finalizeAllLive(); inst?.dispose();
    midi.dispose(); resizeObs.disconnect();
    clearTimeout(abcTimer); clearTimeout(statusT);
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("keyup", onKeyUp, true);
    window.removeEventListener("blur", onBlur);
    clearInterval(T.timer); cancelAnimationFrame(T.raf);
    ov.remove();
  }
  function cancel() {
    if (S.dirty && !confirm("Discard your changes to the melody?")) return;
    close();
  }
  function apply() {
    finalizeAllLive(); stopTransport();
    refreshAbc();
    const out = {
      notes: S.notes.map(({ id, p, s, l, v }) => ({ id, p, s, l, v })),
      bpm: S.bpm, meter: S.meter, key: S.key, bars: S.bars,
      abc: S.notes.length ? lastAbc.abc : "", abcBars: lastAbc.bars, dropped: lastAbc.dropped, seconds: lastAbc.seconds,
    };
    onApply?.(out);
    close();
  }

  // ── boot ─────────────────────────────────────────────────────────────────
  const resizeObs = new ResizeObserver(() => { layout(); draw(); });
  resizeObs.observe(scroller);
  setBase(S.base); syncFields(); layout(); syncMidi(); syncButtons(); refreshAbc(); renderInstrumentList();
  // open on the notes (or around middle C / C5 for an empty roll)
  requestAnimationFrame(() => {
    layout();
    const mid = S.notes.length ? Math.round(S.notes.reduce((a, n) => a + n.p, 0) / S.notes.length) : 67;
    scroller.scrollTop = Math.max(0, pitchToY(mid) + sy() - viewH / 2);
    draw();
  });
  A.resumeCtx();
  ensureInst();
  A.listSamples().then((list) => {
    samples = list.sort((a, b) => (a.created || 0) - (b.created || 0));
    renderInstrumentList();
    if (A.savedInstrumentId() !== "synth") applyInstrument();
  });
  midi.autoConnect();
  // a focused button would also react to Space / Enter — hand the keyboard back to the roll
  ov.addEventListener("click", (e) => { const b = e.target.closest?.("button"); if (b) { b.blur(); ov.focus({ preventScroll: true }); } });
  ov.focus({ preventScroll: true });

  // handle for tests / callers
  const api = { S, close, apply, cancel, undo, redo, inputNoteOn, inputNoteOff, startTransport, stopTransport, toggleRecord, seek, midi, refreshAbc, importTracks, exportMidi, layout, paint, get inst() { return inst; }, get samples() { return samples; }, el: ov, localXY, stepToX, pitchToY, gridC, rulerC, keysC, scroller, hist, live };
  ov.__pr = api;
  return api;
}

// one_node_music.js — MusicMaker ONE STUDIO (TJ)
// 3rd family axis: music. One node, two engines (MiniMax Music 3 / Ace-Step 1.5).
// SUNO layout + STUDIO_ONE identity. See SPEC_MUSICMAKER.md
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import {
  C, BRAND, LEFT_W, PLAYER_H, PAD, API, SUBFOLDER,
  el, clear, loadState, saveState, defaultState, randomSeed,
  SAMPLERS, SCHEDULERS, LORA_MAX, AUDIO_FORMATS, STYLE_CHIPS, LYRIC_TAGS,
  DURATION_MIN, DURATION_MAX, LLM_BACKENDS, LLM_CLIP_TYPES, lyricsIntent, fmtDur, settingsBadge,
  ENGINES, ENGINE_FIELDS, ACE_LANGUAGES, ACE_KEYSCALES, ACE_TIMESIGS,
  VOCAL_GENDER, VOCAL_STYLE, VOICE_TONE,
} from "./music/core_music.js";
import { buildMusicGraph, effectiveDuration } from "./music/graph_builder_music.js";
import { attachSensitiveToggle, mediaKey } from "./shared/ui_sensitive_media.js";

// Match MiniMax H3's outer node size exactly (see one_node_minimax_h3.js NODE_MW/NODE_MH).
const NODE_MW = 1280;
const NODE_MH = 994;

const jget  = (p)    => api.fetchApi(API + p).then(r => r.json());
const jpost = (p, b) => api.fetchApi(API + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then(r => r.json());
const viewURL = (t)  => `/view?filename=${encodeURIComponent(t.filename)}&subfolder=${encodeURIComponent(t.subfolder || "")}&type=output&t=${t.mtime || Date.now()}`;

// iOS Safari can't decode FLAC in <audio> (canPlayType('audio/flac') === ""). When the
// browser can't play the raw file, fall back to /music_one/download — the same ffmpeg
// MP3 transcode the Download button uses (ID3-tagged, cached under .export/).
const _MIME = { flac: "audio/flac", mp3: "audio/mpeg", opus: "audio/ogg", ogg: "audio/ogg", wav: "audio/wav", m4a: "audio/mp4" };
function playableAudioUrl(t) {
  const ext = String(t.filename || "").split(".").pop().toLowerCase();
  const mime = _MIME[ext];
  try {
    if (mime && new Audio().canPlayType(mime)) return viewURL(t);
  } catch {}
  return `/music_one/download?filename=${encodeURIComponent(t.filename)}&subfolder=${encodeURIComponent(t.subfolder || "")}`;
}

app.registerExtension({
  name: "TJ.MusicMakerONE",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "MusicMakerOneTJNode") return;

    nodeType.prototype.onNodeCreated = function () {
      this.color = BRAND; this.bgcolor = C.bg0; this.title_color = "#fff";
      this.resizable = false; this.size = [NODE_MW, NODE_MH];
      this._buildUI();
    };
    nodeType.prototype.onResize = function () { this.size = [NODE_MW, NODE_MH]; };
    nodeType.prototype.getSlotMenuOptions = function () { return []; };
    // stop playback when the node goes away (deleted, workflow cleared/replaced) —
    // the player is a detached `new Audio()` that would otherwise keep playing.
    const _origRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      try { this._mmmStop?.(); } catch {}
      return _origRemoved?.apply(this, arguments);
    };

    nodeType.prototype._buildUI = function () {
      const self = this;
      const state = defaultState(loadState());
      const persist = () => saveState(state);
      const ctx = { availability: {}, models: {}, prompts: {} };
      const CAPTION_ROLE = () => (state.engine === "acestep" ? "caption_acestep" : "caption_minimax");
      // the output subfolder — user-configurable in Settings; falls back to the default.
      const SUB = () => (state.saveSubfolder || "").trim().replace(/^[\/\\]+|[\/\\]+$/g, "") || SUBFOLDER;

      // Swap all per-engine fields so the two engines never share input.
      function switchEngine(next) {
        if (next === state.engine) return;
        const cur = {};
        ENGINE_FIELDS.forEach(k => { cur[k] = state[k]; });
        state.engineStash[state.engine] = cur;
        const restore = state.engineStash[next] || {};
        const fresh = defaultState({});
        ENGINE_FIELDS.forEach(k => { state[k] = (k in restore) ? restore[k] : fresh[k]; });
        state.engine = next;
        persist();
      }

      if (!document.getElementById("mmm-styles")) {
        const s = document.createElement("style"); s.id = "mmm-styles";
        s.textContent = `
          .mmm-lp{scrollbar-width:thin;scrollbar-color:${C.border} transparent}
          .mmm-lp::-webkit-scrollbar{width:6px}
          .mmm-lp::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px}
          .mmm-lp::-webkit-scrollbar-track{background:transparent}

          /* playlist card row — no dividers, hover lifts */
          .mmm-row{display:flex;align-items:center;gap:11px;padding:8px 10px;border-radius:12px;
                   transition:background .13s ease;cursor:default}
          .mmm-row:hover{background:${C.bg2}}
          .mmm-row.on{background:${C.bg3}}
          .mmm-cover{width:52px;height:52px;border-radius:10px;flex-shrink:0;background:${C.bg3};
                     background-size:cover;background-position:center;box-shadow:0 2px 8px rgba(0,0,0,.45);
                     display:flex;align-items:center;justify-content:center;font-size:18px;color:${C.muted};
                     cursor:pointer;position:relative;overflow:hidden}
          .mmm-engtxt{font-weight:800;letter-spacing:.5px;color:${C.text};font-family:inherit}
          .mmm-cover::after{content:"⤢";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
                     font-size:15px;color:#fff;background:rgba(0,0,0,.42);opacity:0;transition:opacity .13s}
          .mmm-row:hover .mmm-cover::after{opacity:1}
          .mmm-dur{position:absolute;right:3px;bottom:3px;background:rgba(0,0,0,.72);color:#fff;font-size:9px;
                   line-height:1;padding:2px 4px;border-radius:4px;letter-spacing:.2px}
          .mmm-tt{font-size:13.5px;color:${C.text};font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;flex:0 1 auto;min-width:0}
          .mmm-tt:hover{color:#fff}
          .mmm-row.on .mmm-tt{color:${BRAND}}
          .mmm-trow{display:flex;align-items:center;gap:6px;min-width:0}
          .mmm-trow .mmm-acts{margin-left:auto}
          .mmm-eng{flex-shrink:0;font-size:9px;font-weight:600;letter-spacing:.2px;color:${C.muted};
                   border:1px solid ${C.border};border-radius:5px;padding:1px 5px;line-height:1.4;text-transform:uppercase}
          .mmm-sub{font-size:11px;color:${C.muted};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px}

          /* icon buttons — transparent, hover = soft circle */
          .mmm-ib{background:transparent;border:0;color:${C.muted};cursor:pointer;width:28px;height:28px;
                  border-radius:50%;font-size:13px;display:flex;align-items:center;justify-content:center;
                  transition:background .12s,color .12s;flex-shrink:0}
          .mmm-ib:hover{background:${C.bg3};color:${C.text}}
          .mmm-ib.act{color:${BRAND}}
          .mmm-acts{display:flex;gap:1px;flex-shrink:0;opacity:.55;transition:opacity .13s}
          .mmm-row:hover .mmm-acts,.mmm-row.on .mmm-acts{opacity:1}
          .mmm-lcol{display:flex;flex-direction:column;align-items:center;gap:5px;flex-shrink:0;width:16px}
          .mmm-cb{opacity:0;transition:opacity .12s;accent-color:${BRAND};width:14px;height:14px;flex-shrink:0;cursor:pointer}
          .mmm-row:hover .mmm-cb,.mmm-cb:checked,.mmm-selmode .mmm-cb{opacity:1}
          .mmm-fav{background:transparent;border:0;color:${C.text};cursor:pointer;font-size:14px;line-height:1;
                   padding:0;width:16px;height:16px;opacity:0;transition:opacity .12s,color .12s}
          .mmm-row:hover .mmm-fav{opacity:1}
          .mmm-fav:hover{color:${BRAND}}
          .mmm-fav.act{opacity:1;color:${BRAND}}
          @media(pointer:coarse){.mmm-acts,.mmm-cb,.mmm-fav{opacity:1}}

          /* ✨ spark — filled brand circle */
          .mmm-spark{background:${BRAND};border:0;color:#fff;cursor:pointer;width:30px;height:30px;
                     border-radius:50%;font-size:14px;display:flex;align-items:center;justify-content:center;
                     box-shadow:0 2px 8px ${BRAND}55;transition:transform .1s,filter .1s;flex-shrink:0}
          .mmm-spark:hover{filter:brightness(1.12)}
          .mmm-spark:active{transform:scale(.92)}
          .mmm-spark:disabled{background:${C.bg3};box-shadow:none;color:${C.muted}}

          /* style chips */
          .mmm-chip{background:${C.bg2};border:1px solid ${C.border};color:${C.text};border-radius:999px;
                    padding:4px 11px;font-size:11px;cursor:pointer;transition:border-color .12s,background .12s}
          .mmm-chip:hover{border-color:${BRAND};background:${C.bg3}}

          /* section headers */
          .mmm-sh{display:flex;align-items:center;gap:5px}
          .mmm-sh .t{flex:1;font-weight:700;font-size:12.5px;color:${C.text}}
          .mmm-tb{background:transparent;border:0;color:${C.muted};cursor:pointer;font-family:inherit;
                  font-size:10.5px;padding:4px 7px;border-radius:6px;white-space:nowrap;transition:background .12s,color .12s}
          .mmm-tb:hover{background:${C.bg2};color:${C.text}}
          .mmm-cinfo{background:${BRAND};border:0;color:#fff;cursor:pointer;font-family:inherit;
                     font-size:11px;padding:8px 12px;border-radius:8px;white-space:nowrap;flex-shrink:0;
                     line-height:1.15;transition:filter .12s}
          .mmm-cinfo:hover{filter:brightness(1.12)}

          /* player bar */
          .mmm-bar{flex-shrink:0;display:flex;align-items:center;gap:12px;padding:0 12px;
                   border-top:1px solid ${C.border};background:rgba(20,20,20,.72);
                   backdrop-filter:blur(6px);border-radius:10px}
          .mmm-pp{background:${BRAND};border:0;color:#fff;width:38px;height:34px;border-radius:9px;
                  display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;
                  box-shadow:0 2px 10px ${BRAND}55;transition:filter .1s,transform .08s;flex-shrink:0}
          .mmm-pp svg{display:block;fill:#fff}
          .mmm-pp:hover{filter:brightness(1.12)} .mmm-pp:active{transform:scale(.95)}
          .mmm-seek{flex:1;accent-color:${BRAND};height:4px}
          .mmm-vol{width:74px;accent-color:${BRAND};height:4px}

          /* topbar */
          .mmm-top{display:flex;align-items:center;gap:10px;flex-shrink:0}
          .mmm-brand{color:${BRAND};font-weight:800;font-size:12px;letter-spacing:.5px}
          .mmm-brand .m{color:${C.muted};font-weight:600;margin-left:6px;letter-spacing:0}

          /* segmented toggle (Simple/Advanced, engine) */
          .mmm-seg{display:flex;background:${C.bg1};border:1px solid ${C.border};border-radius:9px;padding:2px;gap:2px}
          .mmm-seg button{flex:1;border:0;background:transparent;color:${C.muted};cursor:pointer;
                          padding:5px 12px;font-size:11px;border-radius:7px;white-space:nowrap;
                          transition:background .12s,color .12s}
          .mmm-seg button:hover{color:${C.text}}
          .mmm-seg button.on{background:${BRAND};color:#fff;font-weight:600}

          /* form fields */
          .mmm-lbl{font-size:10.5px;color:${C.muted};font-weight:600;margin-bottom:3px;display:block}
          .mmm-fld,.mmm-sel{width:100%;box-sizing:border-box;background:${C.bg2};color:${C.text};
                            border:1px solid ${C.border};border-radius:8px;padding:7px 9px;font-size:12px;
                            font-family:inherit;outline:none;transition:border-color .12s}
          .mmm-fld:focus,.mmm-sel:focus{border-color:${BRAND}}
          .mmm-sel{cursor:pointer;appearance:none;
                   background-image:linear-gradient(45deg,transparent 50%,${C.muted} 50%),linear-gradient(135deg,${C.muted} 50%,transparent 50%);
                   background-position:calc(100% - 15px) 52%,calc(100% - 10px) 52%;background-size:5px 5px,5px 5px;background-repeat:no-repeat}
          .mmm-range{width:100%;accent-color:${BRAND};height:4px;margin:6px 0}

          /* advanced accordion */
          .mmm-acc{display:flex;flex-direction:column;gap:9px;padding:11px;background:${C.bg1};
                   border:1px solid ${C.border};border-radius:10px}
          .mmm-acc .hd{font-size:10.5px;color:${C.muted};font-weight:700;letter-spacing:.3px;text-transform:uppercase}
          .mmm-grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
          .mmm-grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}

          /* generate button + status */
          .mmm-go{flex:1;background:${BRAND};border:0;color:#fff;font-weight:700;font-size:13px;cursor:pointer;
                  padding:11px;border-radius:10px;box-shadow:0 3px 12px ${BRAND}55;transition:filter .1s,transform .08s}
          .mmm-go:hover{filter:brightness(1.12)} .mmm-go:active{transform:scale(.98)}
          .mmm-go:disabled{background:${C.bg3};color:${C.muted};box-shadow:none;cursor:default}
          .mmm-stop{background:${C.bg2};border:1px solid ${C.border};color:${C.text};cursor:pointer;
                    padding:11px 16px;border-radius:10px;font-size:12px;flex-shrink:0;font-family:inherit}
          .mmm-stop:hover{border-color:${C.err};color:${C.err}}
          .mmm-status{font-size:11px;color:#ffcf3f;font-weight:600;min-height:15px;text-align:center;
                      text-shadow:0 1px 2px rgba(0,0,0,.5)}

          /* dropdown menu (⋯, presets) */
          .mmm-menu{position:fixed;z-index:10001;background:${C.bg1};border:1px solid ${C.border};
                    border-radius:10px;padding:4px;min-width:150px;box-shadow:0 8px 28px rgba(0,0,0,.55)}
          .mmm-menu .it{padding:8px 11px;font-size:12px;cursor:pointer;border-radius:7px;color:${C.text};
                        display:flex;align-items:center;gap:8px;white-space:nowrap}
          .mmm-menu .it:hover{background:${C.bg3}}
          .mmm-menu .it.danger:hover{background:${C.err}22;color:${C.err}}
          .mmm-menu .sep{height:1px;background:${C.border};margin:4px 6px}

          /* overlays (settings, big edit, info) */
          .mmm-ov{position:absolute;inset:0;z-index:9999;background:rgba(8,8,8,.985);border-radius:inherit;
                  display:flex;flex-direction:column;padding:18px;gap:12px;box-sizing:border-box}
          .mmm-ov-hd{display:flex;align-items:center;gap:10px;flex-shrink:0}
          .mmm-ov-hd .t{flex:1;font-size:14px;font-weight:700;color:#fff}
          .mmm-x{background:${C.bg2};border:1px solid ${C.border};color:${C.text};cursor:pointer;
                 padding:6px 12px;border-radius:8px;font-size:12px}
          .mmm-x:hover{border-color:${C.err};color:${C.err}}
          .mmm-tabs{display:flex;gap:2px;background:${C.bg1};border:1px solid ${C.border};border-radius:9px;padding:2px;flex-shrink:0}
          .mmm-tabs button{flex:1;border:0;background:transparent;color:${C.muted};cursor:pointer;padding:7px;
                           font-size:11.5px;border-radius:7px;transition:background .12s,color .12s}
          .mmm-tabs button.on{background:${BRAND};color:#fff;font-weight:600}
          .mmm-tabs button:hover:not(.on){color:${C.text}}
          .mmm-save{background:${BRAND};border:0;color:#fff;font-weight:700;font-size:12.5px;cursor:pointer;
                    padding:10px;border-radius:9px;box-shadow:0 3px 12px ${BRAND}55}
          .mmm-save:hover{filter:brightness(1.12)}
          .mmm-ov-body{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:10px}
          .mmm-ov-body pre{white-space:pre-wrap;font-size:11px;color:${C.text};margin:2px 0;
                           background:${C.bg1};border:1px solid ${C.border};border-radius:8px;padding:9px}
          .mmm-k{color:${BRAND};font-size:10.5px;font-weight:700;margin-top:8px;text-transform:uppercase;letter-spacing:.3px}

          /* searchable select (filter input + native select) */
          .mmm-ss{width:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:4px}
          .mmm-ss .f{width:100%;box-sizing:border-box;background:${C.bg2};color:${C.text};border:1px solid ${C.border};
                     border-radius:8px;padding:5px 9px;font-size:11px;font-family:inherit;outline:none;display:block}
          .mmm-ss .f:focus{border-color:${BRAND}}
          .mmm-ss select{width:100%;box-sizing:border-box;background:${C.bg2};color:${C.text};border:1px solid ${C.border};
                         border-radius:8px;padding:7px 9px;font-size:12px;font-family:inherit;outline:none;cursor:pointer}
          .mmm-ss select:focus{border-color:${BRAND}}

          /* lora rows */
          .mmm-lora{display:flex;gap:6px;align-items:flex-start}
          .mmm-lora .mmm-ss{flex:1;min-width:0}
          .mmm-add{background:${C.bg2};border:1px dashed ${C.borderH};color:${C.text};cursor:pointer;
                   padding:7px;border-radius:8px;font-size:11.5px;width:100%;transition:border-color .12s}
          .mmm-add:hover{border-color:${BRAND};color:${BRAND}}
          .mmm-del{background:transparent;border:1px solid ${C.border};color:${C.muted};cursor:pointer;
                   flex-shrink:0;border-radius:8px;font-size:11px;padding:5px 0}
          .mmm-del:hover{border-color:${C.err};color:${C.err}}
          .mmm-hint{font-size:10px;color:${C.muted};text-align:center;padding:2px;line-height:1.5}

          /* small centered popup (Cover Info) */
          .mmm-pop{position:absolute;inset:0;z-index:10000;background:rgba(6,6,6,.75);display:flex;
                   align-items:center;justify-content:center;border-radius:inherit}
          .mmm-pop .box{width:min(440px,84%);background:${C.bg1};border:1px solid ${C.borderH};border-radius:14px;
                        padding:16px;display:flex;flex-direction:column;gap:10px;box-shadow:0 12px 40px rgba(0,0,0,.6)}
          .mmm-pop .box h4{margin:0;font-size:13px;color:#fff;font-weight:700}
          .mmm-pop .box p{margin:0;font-size:10.5px;color:${C.muted};line-height:1.5}
          .mmm-pop textarea{min-height:96px;resize:vertical}
          .mmm-pop .btns{display:flex;gap:6px;justify-content:flex-end}

          /* LLM-busy overlay on a field */
          @keyframes mmm-pulse{0%,100%{opacity:.55}50%{opacity:1}}
          .mmm-llmbusy{position:absolute;inset:0;z-index:5;border-radius:8px;
                       background:rgba(12,12,12,.45);backdrop-filter:blur(3px);
                       display:flex;align-items:center;justify-content:center;gap:7px;
                       font-size:11.5px;font-weight:600;color:${BRAND}}
          .mmm-llmbusy .dot{width:7px;height:7px;border-radius:50%;background:${BRAND};animation:mmm-pulse 1s ease-in-out infinite}

          /* pending / generating card */
          .mmm-row.gen{background:${C.bg2};cursor:default}
          .mmm-row.gen .mmm-cover{color:${C.muted}}
          .mmm-row.gen .mmm-cover::after{content:none}
          @keyframes mmm-sheen{0%{background-position:-140px 0}100%{background-position:220px 0}}
          .mmm-row.gen .mmm-cover.busy{background-image:linear-gradient(100deg,transparent 20%,${BRAND}44 50%,transparent 80%);
                     background-size:200px 100%;background-repeat:no-repeat;animation:mmm-sheen 1.1s linear infinite}
          /* per-track cover regeneration */
          @keyframes mmm-spin{to{transform:rotate(360deg)}}
          .mmm-cover.regen::before{content:"";position:absolute;inset:0;z-index:1;
                     background:linear-gradient(100deg,transparent 15%,${BRAND}66 50%,transparent 85%);
                     background-size:200px 100%;background-repeat:no-repeat;animation:mmm-sheen 1.1s linear infinite}
          .mmm-cover.regen::after{content:"↻";opacity:1;z-index:2;background:rgba(0,0,0,.55);
                     animation:mmm-spin .9s linear infinite}
          .mmm-prog{height:4px;border-radius:3px;background:${C.bg3};overflow:hidden;margin-top:6px}
          .mmm-prog i{display:block;height:100%;background:${BRAND};border-radius:3px;transition:width .25s ease}
          .mmm-stage{font-size:10.5px;color:${BRAND};margin-top:3px;display:flex;justify-content:space-between;gap:8px}
          .mmm-stage .p{color:${C.muted}}
          .mmm-row.gen.err .mmm-stage{color:${C.err}}
          .mmm-row.gen.err .mmm-prog i{background:${C.err}}
        `;
        document.head.appendChild(s);
      }

      // ── styled form helpers (SUNO tone, no gray primitives) ─────────────────
      function fld(value, oninput, { ph = "", ta = false, num = false } = {}) {
        const e = el(ta ? "textarea" : "input", { className: "mmm-fld", placeholder: ph });
        if (num) e.type = "number";
        e.value = value ?? "";
        e.addEventListener("input", () => oninput(num ? (e.value === "" ? 0 : +e.value) : e.value));
        return e;
      }
      function sel(opts, cur, onchange) {
        const e = el("select", { className: "mmm-sel" });
        opts.forEach(o => {
          const v = typeof o === "string" ? o : o.value;
          const l = typeof o === "string" ? o : o.label;
          const op = el("option", { text: l }); op.value = v; e.appendChild(op);
        });
        e.value = cur;
        e.addEventListener("change", () => onchange(e.value));
        return e;
      }
      function fieldCol(lblText, node) {
        const c = el("div");
        c.appendChild(el("label", { className: "mmm-lbl", text: lblText }));
        c.appendChild(node);
        return c;
      }
      // searchable select — filter box + native <select>, mirrors klein/ui_common loraSelect
      function searchSel(options, value, onChange, { placeholder = "filter…" } = {}) {
        const wrap = el("div", { className: "mmm-ss" });
        const opts = ["none", ...options.filter(o => o && o !== "none")];
        let cur = value && opts.includes(value) ? value : "none";
        const f = el("input", { className: "f", type: "text", placeholder });
        const s = el("select");
        const shortName = (o) => o === "none" ? "— none —" : o.split(/[\\/]/).pop();
        function build(q) {
          const ql = (q || "").toLowerCase();
          s.replaceChildren(...opts
            .filter(o => o === "none" || o === cur || !ql || o.toLowerCase().includes(ql))
            .map(o => { const op = el("option", { text: shortName(o), title: o }); op.value = o; if (o === cur) op.selected = true; return op; }));
          s.value = [...s.options].some(o => o.value === cur) ? cur : "none";
          s.title = cur;
        }
        build("");
        f.addEventListener("input", () => build(f.value));
        s.addEventListener("change", () => { cur = s.value; s.title = cur; onChange(cur); });
        wrap.append(f, s);
        return wrap;
      }
      function seg(items, curVal, onpick) {
        const w = el("div", { className: "mmm-seg" });
        const map = new Map();
        items.forEach(([lbl, val]) => {
          const b = el("button", { text: lbl, className: val === curVal ? "on" : "" });
          b.onclick = () => { w._sync(val); onpick(val); };
          map.set(val, b); w.appendChild(b);
        });
        w._sync = (val) => map.forEach((b, k) => b.classList.toggle("on", k === val));
        return w;
      }
      function insertAtCursor(ta, text) {
        const s = ta.selectionStart ?? ta.value.length, e = ta.selectionEnd ?? ta.value.length;
        const keepScroll = ta.scrollTop;
        ta.value = ta.value.slice(0, s) + text + ta.value.slice(e);
        const pos = s + text.length;
        ta.dispatchEvent(new Event("input"));
        ta.focus({ preventScroll: true });    // caret sits right after the inserted text
        ta.setSelectionRange(pos, pos);
        ta.scrollTop = keepScroll;            // don't jump to the bottom
      }
      function rangeRow(lblText, min, max, step, val, oninput, fmt) {
        const c = el("div");
        const lb = el("label", { className: "mmm-lbl", text: `${lblText} — ${fmt ? fmt(val) : val}` });
        const r = el("input", { className: "mmm-range", type: "range", min, max, step, value: val });
        r.addEventListener("input", () => { lb.textContent = `${lblText} — ${fmt ? fmt(+r.value) : r.value}`; oninput(+r.value); });
        c.append(lb, r);
        return c;
      }
      function sectionHead(text, ...btns) {
        const h = el("div", { className: "mmm-sh" });
        h.appendChild(el("div", { className: "t", text }));
        btns.forEach(b => b && h.appendChild(b));
        return h;
      }
      function popMenu(ev, entries) {
        document.querySelectorAll(".mmm-menu").forEach(n => n.remove());
        const m = el("div", { className: "mmm-menu" });
        const vw = window.innerWidth, vh = window.innerHeight;
        entries.forEach(e => {
          if (e === "-") { m.appendChild(el("div", { className: "sep" })); return; }
          if (e.el) { e.el._closeMenu = () => m.remove(); m.appendChild(e.el); return; }
          const it = el("div", { className: "it" + (e.danger ? " danger" : ""), text: (e.icon ? e.icon + "  " : "") + e.label });
          it.onclick = () => { m.remove(); e.fn(); };
          m.appendChild(it);
        });
        m.style.visibility = "hidden";
        document.body.appendChild(m);
        const r = m.getBoundingClientRect();
        m.style.left = Math.min(ev.clientX, vw - r.width - 8) + "px";
        m.style.top  = Math.min(ev.clientY, vh - r.height - 8) + "px";
        m.style.visibility = "visible";
        const close = (e2) => { if (!m.contains(e2.target)) { m.remove(); document.removeEventListener("mousedown", close); } };
        setTimeout(() => document.addEventListener("mousedown", close), 0);
      }

      const root = el("div", { style: {
        position: "relative", width: "100%", height: "100%", padding: `${PAD}px`,
        display: "flex", flexDirection: "column", gap: `${PAD}px`,
        boxSizing: "border-box", color: C.text, fontSize: "12px", overflow: "hidden",
      }});

      // ── topbar ─────────────────────────────────────────────────────────────
      const top = el("div", { className: "mmm-top" });
      const brand = el("div", { className: "mmm-brand", text: "AI ONE STUDIO" });
      brand.appendChild(el("span", { className: "m", text: "MusicMaker" }));
      top.appendChild(brand);
      const engSel = seg(ENGINES.map(e => [e.label, e.key]), state.engine, (v) => {
        switchEngine(v); renderCompose(); loadPlaylist();
      });
      engSel.style.flex = "0 0 auto";
      top.appendChild(engSel);
      top.appendChild(el("div", { style: { flex: "1" }}));
      top.appendChild(el("button", { className: "mmm-tb", text: "Settings", title: "Models / LLM", onclick: () => settingsOv.show() }));
      root.appendChild(top);

      // ── main split: compose | playlist ─────────────────────────────────────
      const LEFT_MIN = LEFT_W, LEFT_MAX = 760;
      const main = el("div", { style: { flex: "1", display: "flex", gap: "0", minHeight: 0 }});
      const clampLeft = (w) => Math.max(LEFT_MIN, Math.min(LEFT_MAX, w));
      state.leftW = clampLeft(state.leftW || LEFT_W);
      const composeWrap = el("div", { style: {
        width: `${state.leftW}px`, flexShrink: 0, display: "flex", flexDirection: "column", minHeight: 0,
      }});
      const compose = el("div", { className: "mmm-lp", style: {
        flex: "1", overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px", paddingRight: "6px",
      }});
      const composeFixed = el("div", { style: {
        flexShrink: 0, display: "flex", flexDirection: "column", gap: "7px",
        paddingTop: "9px", marginTop: "2px", borderTop: `1px solid ${C.border}`,
      }});
      composeWrap.append(compose, composeFixed);
      const dragH = el("div", { title: "Drag to resize", style: {
        width: `${PAD}px`, flexShrink: 0, cursor: "col-resize", display: "flex",
        alignItems: "center", justifyContent: "center",
      }});
      dragH.appendChild(el("div", { style: { width: "3px", height: "34px", borderRadius: "2px", background: C.border }}));
      dragH.addEventListener("mouseenter", () => dragH.firstChild.style.background = BRAND);
      dragH.addEventListener("mouseleave", () => dragH.firstChild.style.background = C.border);
      dragH.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const x0 = e.clientX, w0 = composeWrap.offsetWidth;
        const mv = (ev) => { state.leftW = clampLeft(w0 + ev.clientX - x0); composeWrap.style.width = state.leftW + "px"; };
        const up = () => { persist(); document.removeEventListener("mousemove", mv); document.removeEventListener("mouseup", up); };
        document.addEventListener("mousemove", mv); document.addEventListener("mouseup", up);
      });
      const playlistWrap = el("div", { style: { flex: "1", display: "flex", flexDirection: "column", minWidth: 0, gap: "6px" }});
      main.append(composeWrap, dragH, playlistWrap);
      root.appendChild(main);

      // ── bottom player bar ──────────────────────────────────────────────────
      const audioEl = new Audio(); audioEl.preload = "metadata";
      self._mmmStop = () => { try { audioEl.pause(); audioEl.removeAttribute("src"); audioEl.load(); } catch {} };
      const bar = el("div", { className: "mmm-bar", style: { height: `${PLAYER_H}px` }});
      const miniCover = el("div", { style: { width: "40px", height: "40px", borderRadius: "8px", background: C.bg3, flexShrink: 0, backgroundSize: "cover", backgroundPosition: "center", boxShadow: "0 1px 6px rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "800", fontSize: "12px", letterSpacing: ".5px", color: C.muted }});
      const nowWrap = el("div", { style: { width: "150px", flexShrink: 0, overflow: "hidden" }});
      const nowTitle = el("div", { style: { fontSize: "11.5px", color: C.text, fontWeight: "600", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, text: "Pick a track to play" });
      const nowSub   = el("div", { style: { fontSize: "10px", color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, text: "" });
      nowWrap.append(nowTitle, nowSub);
      const SVG_PLAY  = `<svg width="13" height="14" viewBox="0 0 13 14"><path d="M1 1.2c0-.7.8-1.1 1.4-.7l9 5.6c.5.3.5 1.1 0 1.4l-9 5.6c-.6.4-1.4 0-1.4-.7z"/></svg>`;
      const SVG_PAUSE = `<svg width="12" height="14" viewBox="0 0 12 14"><rect x="1" y="1" width="3.5" height="12" rx="1"/><rect x="7.5" y="1" width="3.5" height="12" rx="1"/></svg>`;
      const prevBtn = el("button", { className: "mmm-ib", text: "◄◄", title: "Previous", onclick: () => playIndex(curIdx - 1) });
      const playBtn = el("button", { className: "mmm-pp", title: "Play / pause", onclick: () => { audioEl.paused ? audioEl.play() : audioEl.pause(); }});
      playBtn.innerHTML = SVG_PLAY;
      const nextBtn = el("button", { className: "mmm-ib", text: "►►", title: "Next", onclick: () => playIndex(curIdx + 1) });
      const contBtn = el("button", { className: "mmm-ib" + (state.continuous !== false ? " act" : ""), text: "⟳" });
      const paintCont = () => { const on = state.continuous !== false; contBtn.classList.toggle("act", on); contBtn.title = on ? "Continuous play (click for single track)" : "Single track (click for continuous)"; };
      paintCont();
      contBtn.onclick = () => { state.continuous = state.continuous === false; persist(); paintCont(); };
      const curT = el("span", { style: { fontSize: "10px", color: C.muted, width: "34px", textAlign: "right", flexShrink: 0 }, text: "0:00" });
      const durT = el("span", { style: { fontSize: "10px", color: C.muted, width: "34px", flexShrink: 0 }, text: "0:00" });
      const seek = el("input", { className: "mmm-seek", type: "range", min: "0", max: "1000", value: "0" });
      seek.addEventListener("input", () => { if (audioEl.duration) audioEl.currentTime = (seek.value / 1000) * audioEl.duration; });
      const vol = el("input", { className: "mmm-vol", type: "range", min: "0", max: "1", step: "0.02", value: "1", title: "Volume" });
      vol.addEventListener("input", () => { audioEl.volume = +vol.value; });
      bar.append(miniCover, nowWrap, prevBtn, playBtn, nextBtn, curT, seek, durT, contBtn, vol);
      root.appendChild(bar);

      audioEl.addEventListener("timeupdate", () => {
        curT.textContent = fmtDur(audioEl.currentTime);
        if (audioEl.duration) seek.value = String((audioEl.currentTime / audioEl.duration) * 1000);
      });
      audioEl.addEventListener("loadedmetadata", () => { durT.textContent = fmtDur(audioEl.duration); });
      audioEl.addEventListener("play",  () => playBtn.innerHTML = SVG_PAUSE);
      audioEl.addEventListener("pause", () => playBtn.innerHTML = SVG_PLAY);
      audioEl.addEventListener("ended", () => { if (state.continuous !== false) playIndex(curIdx + 1); });

      // ── playlist ───────────────────────────────────────────────────────────
      let tracks = [], curIdx = -1;
      let genQueue = [];   // [{ id, snap, title, engine, stage, pct, err, done, cover, started, pid }]
      let regenCoverFn = null; // filename whose cover is currently regenerating
      const selected = new Set();
      const plHead = el("div", { style: { display: "flex", alignItems: "center", gap: "7px", flexShrink: 0 }});
      plHead.appendChild(el("div", { text: "Playlist", style: { fontWeight: "700", fontSize: "12.5px", color: C.text, flexShrink: 0 }}));
      const searchIn = el("input", { type: "text", placeholder: "Search", className: "mmm-fld", style: { flex: "1", padding: "5px 9px", fontSize: "11px" }});
      const sortSel = sel([["newest", "Newest"], ["oldest", "Oldest"], ["title", "Title"]].map(([v, l]) => ({ value: v, label: l })), "newest", () => loadPlaylist());
      sortSel.style.width = "auto"; sortSel.style.fontSize = "11px"; sortSel.style.padding = "5px 26px 5px 9px";
      let favOnly = false;
      const favTgl = el("button", { className: "mmm-ib", text: "★", title: "Favorites only" });
      favTgl.onclick = () => { favOnly = !favOnly; favTgl.classList.toggle("act", favOnly); loadPlaylist(); };
      const selBar = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", fontSize: "11.5px", color: C.text, padding: "4px 2px", flexShrink: 0 }});
      plHead.append(searchIn, favTgl, sortSel);
      const plBody = el("div", { className: "mmm-lp", style: { flex: "1", overflowY: "auto", display: "flex", flexDirection: "column", gap: "4px" }});
      playlistWrap.append(selBar, plHead, plBody);

      function renderSelBar() {
        clear(selBar);
        const n = selected.size;
        selBar.appendChild(el("span", { text: `${n} selected`, style: { flex: "1", color: n ? C.text : C.muted }}));
        const delBtn = el("button", { className: "mmm-x", text: "Delete", style: n ? { borderColor: C.err, color: C.err } : { opacity: ".4", cursor: "default" }, onclick: async () => {
          if (!n) return;
          if (!confirm(`Delete ${n} track(s)?`)) return;
          await jpost("/delete", { filenames: [...selected], subfolder: SUB()});
          selected.clear(); loadPlaylist();
        }});
        const clrBtn = el("button", { className: "mmm-x", text: "Clear", style: n ? {} : { opacity: ".4", cursor: "default" }, onclick: () => { if (!n) return; selected.clear(); renderPlaylist(); renderSelBar(); }});
        delBtn.disabled = !n; clrBtn.disabled = !n;
        selBar.append(delBtn, clrBtn);
      }

      function coverURL(fn) { return `url("/view?filename=${encodeURIComponent(fn)}&subfolder=${encodeURIComponent(SUB() + "/covers")}&type=output")`; }
      const engLabel = (x) => (x && x.engine === "acestep") ? "ACE" : "MM";
      function coverPlaceholder(x, fontSize) {
        return el("span", { className: "mmm-engtxt", text: engLabel(x), style: fontSize ? { fontSize } : {} });
      }

      function playIndex(i) {
        if (i < 0 || i >= tracks.length) return;
        curIdx = i;
        const t = tracks[i];
        audioEl.src = playableAudioUrl(t);
        audioEl.play().catch(() => {});
        nowTitle.textContent = t.title || t.filename;
        nowSub.textContent = settingsBadge(t) || (t.engine === "acestep" ? "Ace-Step 1.5" : "MiniMax Music 3");
        if (t.cover) { miniCover.style.backgroundImage = coverURL(t.cover); miniCover.textContent = ""; }
        else { miniCover.style.backgroundImage = "none"; miniCover.textContent = engLabel(t); }
        renderPlaylist();
      }
      function togglePlay(i) {
        if (i === curIdx && audioEl.src) { audioEl.paused ? audioEl.play().catch(() => {}) : audioEl.pause(); }
        else playIndex(i);
      }
      function restartPlay(i) {
        if (i !== curIdx || !audioEl.src) { playIndex(i); return; }
        audioEl.currentTime = 0; audioEl.play().catch(() => {});
      }

      function trackRow(t, i) {
        const r = el("div", { className: "mmm-row" + (i === curIdx ? " on" : "") });
        const lcol = el("div", { className: "mmm-lcol" });
        const cb = el("input", { type: "checkbox", className: "mmm-cb" });
        cb.checked = selected.has(t.filename);
        cb.onclick = (e) => { e.stopPropagation(); cb.checked ? selected.add(t.filename) : selected.delete(t.filename); renderSelBar(); };
        const favBtn = el("button", { className: "mmm-fav" + (t.favorite ? " act" : ""), text: t.favorite ? "★" : "☆", title: "Favorite",
          onclick: async (e) => { e.stopPropagation(); await jpost("/update_meta", { filename: t.filename, subfolder: SUB(), patch: { favorite: !t.favorite } }); loadPlaylist(); }});
        lcol.append(cb, favBtn);
        const cover = el("div", { className: "mmm-cover" + (t.filename === regenCoverFn ? " regen" : ""), title: "Track info", onclick: (e) => { e.stopPropagation(); showInfo(t); }});
        if (t.cover) cover.style.backgroundImage = coverURL(t.cover);
        else cover.appendChild(coverPlaceholder(t));
        if (t.seconds) cover.appendChild(el("div", { className: "mmm-dur", text: fmtDur(t.seconds) }));
        attachSensitiveToggle(cover, cover, mediaKey(t.filename, t.subfolder || SUB()), "tl");
        const mid = el("div", { style: { flex: "1", minWidth: 0 }});
        let clickT = null;
        const title = el("div", { className: "mmm-tt", text: t.title || t.filename, title: "Click to play/pause · double-click to restart" });
        title.onclick = () => { clearTimeout(clickT); clickT = setTimeout(() => togglePlay(i), 200); };
        title.ondblclick = () => { clearTimeout(clickT); restartPlay(i); };
        const trow = el("div", { className: "mmm-trow" });
        const acts = el("div", { className: "mmm-acts" });
        acts.appendChild(el("button", { className: "mmm-ib", title: "Reuse settings", text: "↺", onclick: (e) => { e.stopPropagation(); reuse(t); }}));
        acts.appendChild(el("button", { className: "mmm-ib", title: "Info", text: "ⓘ", onclick: (e) => { e.stopPropagation(); showInfo(t); }}));
        acts.appendChild(el("button", { className: "mmm-ib", title: "Download tagged MP3", text: "↓", onclick: async (e) => {
          e.stopPropagation();
          const btn = e.currentTarget; const old = btn.textContent; btn.textContent = "…"; btn.disabled = true;
          try {
            const url = `${API}/download?filename=${encodeURIComponent(t.filename)}&subfolder=${encodeURIComponent(t.subfolder || SUB())}`;
            const r = await api.fetchApi(url);
            if (!r.ok) throw new Error(await r.text());
            const blob = await r.blob();
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = (t.title || t.filename).replace(/[\\/:*?"<>|]/g, "_") + ".mp3";
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 4000);
          } catch (err) { statusEl.textContent = "Download failed: " + String(err).slice(0, 80); }
          finally { btn.textContent = old; btn.disabled = false; }
        }}));
        acts.appendChild(el("button", { className: "mmm-ib", title: "More", text: "⋯", onclick: (e) => { e.stopPropagation(); moreMenu(t, e); }}));

        trow.append(title, el("span", { className: "mmm-eng", text: t.engine === "acestep" ? "Ace-Step" : "MiniMax" }), el("div", { style: { flex: "1" }}), acts);
        mid.appendChild(trow);
        const subText = (t.caption || "").replace(/\s*\n\s*/g, " ").trim() || (t.instrumental ? "instrumental" : settingsBadge(t));
        mid.appendChild(el("div", { className: "mmm-sub", text: subText }));
        r.append(lcol, cover, mid);
        return r;
      }

      function pendingCard(p) {
        const r = el("div", { className: "mmm-row gen" + (p.err ? " err" : "") });
        r.dataset.jobId = p.id;
        r.append(el("div", { className: "mmm-lcol" }));
        const cover = el("div", { className: "mmm-cover" + (p.cover || p.err ? "" : " busy") });
        if (p.cover) cover.style.backgroundImage = coverURL(p.cover);
        else cover.appendChild(p.err ? el("span", { className: "mmm-engtxt", text: "!" }) : coverPlaceholder(p));
        r.appendChild(cover);
        const mid = el("div", { style: { flex: "1", minWidth: 0 }});
        const trow = el("div", { className: "mmm-trow" });
        trow.append(el("div", { className: "mmm-tt", text: p.title || "New track", style: { cursor: "default" }}),
                    el("span", { className: "mmm-eng", text: p.engine === "acestep" ? "Ace-Step" : "MiniMax" }));
        mid.appendChild(trow);
        const stage = el("div", { className: "mmm-stage" });
        stage.append(el("span", { text: p.stage || "Queued…" }), el("span", { className: "p", text: p.pct ? p.pct + "%" : "" }));
        mid.appendChild(stage);
        const prog = el("div", { className: "mmm-prog" }); prog.appendChild(el("i", { style: { width: (p.pct || (p.err ? 100 : 4)) + "%" }}));
        mid.appendChild(prog);
        r.appendChild(mid);
        const acts = el("div", { className: "mmm-acts", style: { opacity: 1 }});
        acts.appendChild(el("button", { className: "mmm-ib", style: { color: C.err },
          title: p.err ? "Dismiss" : (p.started ? "Cancel this run" : "Remove from queue"), text: "✕",
          onclick: () => { p.err ? (genQueue = genQueue.filter(j => j.id !== p.id), renderPlaylist()) : cancelJob(p.id); }}));
        r.appendChild(acts);
        return r;
      }
      function paintJob(p) {
        const c = plBody.querySelector(`.mmm-row.gen[data-job-id="${p.id}"]`);
        if (!c) { renderPlaylist(); return; }
        c.classList.toggle("err", !!p.err);
        const cov = c.querySelector(".mmm-cover");
        cov.classList.toggle("busy", !p.cover && !p.err);
        if (p.cover && !cov.style.backgroundImage) { cov.style.backgroundImage = coverURL(p.cover); cov.textContent = ""; }
        c.querySelector(".mmm-stage span:first-child").textContent = p.stage || "Queued…";
        c.querySelector(".mmm-stage .p").textContent = p.pct ? p.pct + "%" : "";
        c.querySelector(".mmm-prog i").style.width = (p.pct || (p.err ? 100 : 4)) + "%";
      }

      function renderPlaylist() {
        clear(plBody);
        genQueue.forEach(j => plBody.appendChild(pendingCard(j)));
        const q = searchIn.value.trim().toLowerCase();
        const shown = tracks.filter(t => !q || (t.title || t.filename).toLowerCase().includes(q));
        shown.forEach(t => plBody.appendChild(trackRow(t, tracks.indexOf(t))));
        if (!tracks.length && !genQueue.length) plBody.appendChild(el("div", { style: { color: C.muted, padding: "40px 20px", textAlign: "center", fontSize: "12px", lineHeight: "1.7" }, html: "No tracks yet.<br>Write lyrics &amp; style on the left, then hit <b>Generate</b>." }));
        renderSelBar();
      }
      searchIn.addEventListener("input", renderPlaylist);

      async function loadPlaylist() {
        try {
          const playingFn = curIdx >= 0 ? tracks[curIdx]?.filename : null;
          const d = await jget(`/playlist?limit=200&sort=${sortSel.value}${favOnly ? "&favonly=1" : ""}&subfolder=${encodeURIComponent(SUB())}`);
          tracks = d.tracks || [];
          curIdx = playingFn ? tracks.findIndex(t => t.filename === playingFn) : -1;
          renderPlaylist();
        } catch (e) { console.warn("[MMM] playlist", e); }
      }

      function moreMenu(t, ev) {
        popMenu(ev, [
          { label: "Rename", fn: async () => { const nn = prompt("New title", t.title || ""); if (nn != null) { await jpost("/update_meta", { filename: t.filename, subfolder: SUB(), patch: { title: nn } }); loadPlaylist(); }}},
          { label: "Regenerate cover", fn: () => regenCoverPopup(t) },
          { label: "Open folder", fn: () => jpost("/open_folder", { filename: t.filename, subfolder: SUB()}) },
          "-",
          { label: "Delete", danger: true, fn: async () => { if (confirm("Delete this track?")) { await jpost("/delete", { filename: t.filename, subfolder: SUB()}); loadPlaylist(); }}},
        ]);
      }

      async function showInfo(t) {
        const d = await jget(`/meta?filename=${encodeURIComponent(t.filename)}&subfolder=${encodeURIComponent(t.subfolder || SUB())}`);
        const meta = d.ok ? d.meta : null;
        const ov = el("div", { className: "mmm-ov" });
        const hd = el("div", { className: "mmm-ov-hd" });
        hd.appendChild(el("div", { className: "t", text: t.title || t.filename }));
        hd.appendChild(el("button", { className: "mmm-x", text: "Close", onclick: () => ov.remove() }));
        ov.appendChild(hd);
        const body = el("div", { className: "mmm-ov-body" });

        const top = el("div", { style: { display: "flex", gap: "14px", flexShrink: 0 }});
        const big = el("div", { style: { width: "168px", height: "168px", flexShrink: 0, borderRadius: "12px", background: C.bg2,
          backgroundSize: "cover", backgroundPosition: "center", boxShadow: "0 4px 18px rgba(0,0,0,.5)",
          display: "flex", alignItems: "center", justifyContent: "center" }});
        if (t.cover) big.style.backgroundImage = coverURL(t.cover);
        else big.appendChild(coverPlaceholder(t, "44px"));
        const metaCol = el("div", { style: { display: "flex", flexDirection: "column", gap: "5px", minWidth: 0, alignSelf: "center" }});
        const line = (k, v) => metaCol.append(el("div", { style: { fontSize: "11px", color: C.muted }, text: k }), el("div", { style: { fontSize: "12.5px", color: C.text, marginBottom: "3px" }, text: v }));
        line("Engine", (meta || t).engine === "acestep" ? "Ace-Step 1.5" : "MiniMax Music 3");
        if (meta?.seconds) line("Length", fmtDur(meta.seconds));
        if (meta?.seed != null) line("Seed", String(meta.seed));
        if (meta?.llmBackend) {
          const bk = { local: "Local GGUF", openrouter: "OpenRouter", comfy: "ComfyUI TextGenerate" }[meta.llmBackend] || meta.llmBackend;
          line("LLM", meta.llmModel ? `${bk} · ${meta.llmModel}` : bk);
        }
        top.append(big, metaCol);
        body.appendChild(top);

        if (!meta) body.appendChild(el("div", { text: "No metadata for this track.", style: { color: C.muted, marginTop: "10px" }}));
        else {
          const blk = (k, v) => { body.appendChild(el("div", { className: "mmm-k", text: k })); body.appendChild(el("pre", { text: typeof v === "string" ? v : JSON.stringify(v, null, 1) })); };
          blk("Style / tags", meta.caption || "—");
          blk("Lyrics", meta.lyrics || "(instrumental)");
          blk("Parameters", meta.engine === "acestep"
            ? { bpm: meta.bpm, key: meta.keyscale, timesig: meta.timesignature, language: meta.language, cfg_scale: meta.cfgScaleAce, stages: meta.aceStages }
            : { steps: meta.steps, cfg: meta.cfg, cfg_scale: meta.cfgScale, top_k: meta.topK, sampler: meta.sampler });
        }
        ov.appendChild(body);
        root.appendChild(ov);
      }

      function reuse(t) {
        jget(`/meta?filename=${encodeURIComponent(t.filename)}&subfolder=${encodeURIComponent(t.subfolder || SUB())}`).then(d => {
          if (!d.ok || !d.meta) return;
          const m = d.meta;
          const eng = m.engine === "acestep" ? "acestep" : "minimax";
          if (eng !== state.engine) switchEngine(eng);   // jump to the track's engine first
          ENGINE_FIELDS.forEach(k => { if (m[k] !== undefined) state[k] = m[k]; });
          state.lyricsInput = m.lyricsInput ?? m.lyrics ?? "";
          state.lyrics      = m.lyrics ?? "";
          state.caption     = m.caption ?? "";
          state.captionBrief = m.captionBrief ?? "";
          state.styleChips  = Array.isArray(m.styleChips) ? m.styleChips : [];
          state.title       = m.title || "";
          state.coverBrief  = m.coverBrief || "";
          if (m.seconds != null) state.duration = m.seconds;
          state.seedMode = "fixed";
          if (m.seed != null) state.seed = m.seed;
          persist(); renderCompose(); loadPlaylist();
          statusEl.textContent = `Reused — ${m.engine === "acestep" ? "Ace-Step" : "MiniMax"}`;
        });
      }

      // ── compose panel ──────────────────────────────────────────────────────
      const genBtn = el("button", { className: "mmm-go", text: "▶ Generate", onclick: () => enqueueGen() });
      const stopBtn = el("button", { className: "mmm-stop", text: "■ Stop", title: "Stop the current run and clear the queue", onclick: () => stopQueue() });
      const statusEl = el("div", { className: "mmm-status" });
      let lyricsTA, styleTA, lyricsWrap, styleWrap;

      function resizableBox(getV, setV, hKey) {
        const wrap = el("div", { style: { position: "relative" }});
        const ta = el("textarea", { className: "mmm-fld", style: {
          height: `${state[hKey]}px`, minHeight: "96px", resize: "none", lineHeight: "1.55", display: "block",
        }});
        ta.value = getV() || "";
        ta.addEventListener("input", () => { setV(ta.value); persist(); });
        const grip = el("div", { style: { position: "absolute", left: "8px", right: "8px", bottom: "3px", height: "10px", cursor: "ns-resize", display: "flex", alignItems: "center", justifyContent: "center" }});
        grip.appendChild(el("div", { style: { width: "24px", height: "3px", borderRadius: "2px", background: C.borderH }}));
        grip.addEventListener("mousedown", (e) => {
          e.preventDefault(); const y0 = e.clientY, h0 = ta.offsetHeight;
          const mv = (ev) => { const nh = Math.max(96, Math.min(520, h0 + ev.clientY - y0)); ta.style.height = nh + "px"; state[hKey] = nh; };
          const up = () => { persist(); document.removeEventListener("mousemove", mv); document.removeEventListener("mouseup", up); };
          document.addEventListener("mousemove", mv); document.addEventListener("mouseup", up);
        });
        wrap.append(ta, grip);
        return { wrap, ta };
      }

      function llmBusy(wrap, label) {
        if (!wrap) return () => {};
        const ov = el("div", { className: "mmm-llmbusy" });
        ov.append(el("span", { className: "dot" }), el("span", { text: (label || "LLM writing…") }));
        wrap.appendChild(ov);
        return () => ov.remove();
      }
      let _llmPrompts = null;
      async function comfyTextGen(role, input, context) {
        // ComfyUI native: CLIPLoader(GGUF) → TextGenerate → PreviewAny, run through the queue.
        if (!state.llmClip) throw new Error("Set a CLIP/GGUF model for ComfyUI TextGenerate in Settings.");
        if (!_llmPrompts) _llmPrompts = (await jget("/llm/prompts")).prompts || {};
        const sys = _llmPrompts[role];
        if (!sys) throw new Error("unknown role: " + role);
        const ctxLines = Object.entries(context || {}).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n");
        const composed = `${sys.trim()}\n\n---\n\n${ctxLines ? ctxLines + "\n\n" : ""}${input || ""}`.trim();
        const loader = state.llmClip.toLowerCase().endsWith(".gguf")
          ? { class_type: "CLIPLoaderGGUF", inputs: { clip_name: state.llmClip, type: state.llmClipType || "qwen_image" } }
          : { class_type: "CLIPLoader",     inputs: { clip_name: state.llmClip, type: state.llmClipType || "qwen_image" } };
        const graph = {
          "tg:c": loader,
          "tg:t": { class_type: "TextGenerate", inputs: { clip: ["tg:c", 0], prompt: composed, max_length: 2048, sampling_mode: "off", thinking: false, use_default_template: true } },
          "tg:p": { class_type: "PreviewAny", inputs: { source: ["tg:t", 0] } },
        };
        const res = await submitPrompt(graph, `MusicMaker · LLM (${role})`);
        if (res.error || (res.node_errors && Object.keys(res.node_errors).length)) throw new Error(res.error?.message || JSON.stringify(res.node_errors));
        const pid = res.prompt_id;
        for (let i = 0; i < 90; i++) {
          await new Promise(r => setTimeout(r, 1500));
          const h = await api.fetchApi(`/history/${pid}`).then(r => r.json()).catch(() => ({}));
          const e = h[pid]; if (!e) continue;
          if (e.status?.status_str === "error") throw new Error("TextGenerate execution error — check Console");
          if (e.status?.completed) {
            for (const nid of Object.keys(e.outputs || {})) {
              const t = e.outputs[nid].text;
              if (Array.isArray(t) && t.length) return String(t[0]);
            }
            throw new Error("TextGenerate produced no text");
          }
        }
        throw new Error("TextGenerate timed out");
      }

      function stripThinking(text) {
        let t = String(text || "");
        // 1) always drop explicit <think> blocks
        t = t.replace(/<think(ing)?>[\s\S]*?<\/think(ing)?>/gi, "");
        t = t.replace(/^<think(ing)?>[\s\S]*/i, "");
        t = t.trim();
        // 2) only rescue a monologue that OPENS with an unmistakable reasoning tell
        const head = t.slice(0, 60).toLowerCase();
        const opensReasoned = /^(let me |okay,? (let|i'?ll|so)|first,? i|i'?ll (analyze|start|think)|i need to|let'?s (break|think)|looking at the (input|brief)|analysis:)/.test(head);
        if (opensReasoned) {
          const q = [...t.matchAll(/["“]([^"“”]{60,})["”]/gs)].map((m) => m[1]);
          if (q.length) return q[q.length - 1].trim();
          const m = t.match(/\n\s*(?:final (?:caption|title|answer|version)|here'?s? the (?:final|caption|title))\s*[:\-]?\s*\n+([\s\S]+?)(?:\n\n\*\*|$)/i);
          if (m && m[1].trim().length > 20) return m[1].trim().replace(/^["“”*]+|["“”*]+$/g, "").trim();
        }
        return t;
      }

      async function runLLM(role, input, context, apply, busyWrap, busyLabel, throwOnFail) {
        statusEl.textContent = `LLM · ${role} …`;
        const done = llmBusy(busyWrap, busyLabel);
        try {
          let text;
          if (state.llmBackend === "comfy") {
            text = stripThinking(await comfyTextGen(role, input, context));
          } else {
            const model = state.llmBackend === "openrouter" ? state.llmOrModel : state.llmModel;
            const d = await jpost("/llm/run", { role, input, context, backend: state.llmBackend, model });
            if (!d.ok) throw new Error(d.error || "empty response");
            text = stripThinking(d.text);
          }
          if (text) { apply(text); statusEl.textContent = "LLM ✓"; }
          else if (throwOnFail) throw new Error("empty response");
          else statusEl.textContent = "LLM: empty response";
        } catch (e) {
          statusEl.textContent = "LLM: " + e.message;
          if (throwOnFail) throw e;
        }
        finally { done(); }
      }

      function checkRow(lblText, checked, onchange) {
        const w = el("label", { style: { display: "flex", gap: "8px", alignItems: "center", fontSize: "11.5px", cursor: "pointer", color: C.text, padding: "2px 0" }});
        const cb = el("input", { type: "checkbox", style: { accentColor: BRAND, width: "14px", height: "14px" }});
        cb.checked = checked;
        cb.onchange = () => onchange(cb.checked);
        w.append(cb, el("span", { text: lblText }));
        return w;
      }

      async function presetMenu(kind, ev, getPayload, applyPayload) {
        let sets = [];
        try { sets = (await jget(`/${kind}_presets`)).sets || []; } catch {}
        const nice = kind === "lyrics" ? "lyrics" : "style";
        const entries = [
          { label: "Save current…", fn: async () => {
            const name = prompt(`${nice} preset name`);
            if (!name) return;
            await jpost(`/${kind}_presets/save`, { name, ...getPayload() });
            statusEl.textContent = `Saved — ${name}`;
          }},
        ];
        if (sets.length) {
          entries.push("-");
          sets.forEach(s => {
            const row = el("div", { className: "it", style: { display: "flex", alignItems: "center", gap: "6px" }});
            const nm = el("span", { text: s.name, style: { flex: "1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }});
            nm.onclick = async () => {
              row._closeMenu?.();
              try { applyPayload(await jget(`/${kind}_presets/get?name=${encodeURIComponent(s.name)}`)); persist(); statusEl.textContent = `Loaded — ${s.name}`; }
              catch { statusEl.textContent = "Load failed"; }
            };
            const mini = (txt, title, fn) => el("button", { className: "mmm-x", text: txt, title,
              style: { padding: "2px 6px", fontSize: "12px", lineHeight: "1", flexShrink: 0 },
              onclick: (e) => { e.stopPropagation(); fn(); }});
            const renameBtn = mini("↺", "Rename", async () => {
              const nn = prompt("Rename preset", s.name);
              if (!nn || nn.trim() === s.name) return;
              row._closeMenu?.();
              const p = await jget(`/${kind}_presets/get?name=${encodeURIComponent(s.name)}`);
              await jpost(`/${kind}_presets/save`, { ...p, name: nn.trim() });
              await jpost(`/${kind}_presets/delete`, { name: s.name });
              statusEl.textContent = `Renamed — ${nn.trim()}`;
            });
            const delBtn = mini("✕", "Delete", async () => {
              if (!confirm(`Delete preset "${s.name}"?`)) return;
              row._closeMenu?.();
              await jpost(`/${kind}_presets/delete`, { name: s.name });
              statusEl.textContent = `Deleted — ${s.name}`;
            });
            row.append(nm, renameBtn, delBtn);
            entries.push({ el: row });
          });
        }
        popMenu(ev, entries);
      }

      function coverInfoPopup() {
        const ov = el("div", { className: "mmm-pop" });
        const box = el("div", { className: "box" });
        box.appendChild(el("h4", { text: "Album cover description" }));
        box.appendChild(el("p", { text: "Write what you want the cover to look like, in plain words. The LLM rewrites it into a Krea2 image prompt. Leave empty to let the LLM work from the title + lyrics." }));
        const ta = el("textarea", { className: "mmm-fld", style: { fontSize: "12px", lineHeight: "1.5" }});
        ta.value = state.coverBrief || "";
        box.appendChild(ta);
        const btns = el("div", { className: "btns" });
        btns.append(
          el("button", { className: "mmm-x", text: "Clear", onclick: () => { ta.value = ""; }}),
          el("button", { className: "mmm-x", text: "Cancel", onclick: () => ov.remove() }),
          el("button", { className: "mmm-save", style: { padding: "8px 16px", boxShadow: "none" }, text: "Save", onclick: () => {
            state.coverBrief = ta.value.trim(); persist(); renderCompose(); ov.remove();
          }}),
        );
        box.appendChild(btns);
        ov.appendChild(box);
        ov.addEventListener("mousedown", (e) => { if (e.target === ov) ov.remove(); });
        root.appendChild(ov);
        ta.focus();
      }

      function bigEdit(title, getV, setV) {
        const ov = el("div", { className: "mmm-ov" });
        const hd = el("div", { className: "mmm-ov-hd" });
        hd.appendChild(el("div", { className: "t", text: title }));
        const done = el("button", { className: "mmm-x", text: "Done", style: { borderColor: BRAND, color: BRAND }});
        hd.appendChild(done);
        ov.appendChild(hd);
        const ta = el("textarea", { className: "mmm-fld", style: { flex: "1", resize: "none", lineHeight: "1.6", fontSize: "13px" }});
        ta.value = getV() || "";
        ta.addEventListener("input", () => setV(ta.value));
        done.onclick = () => { setV(ta.value); persist(); renderCompose(); ov.remove(); };
        ov.appendChild(ta);
        root.appendChild(ov);
        ta.focus();
      }

      const vocalHints = () => {
        if (state.instrumental) return { vocal_gender: "instrumental (no vocals)" };
        const o = {};
        if (state.vocalGender && state.vocalGender !== "auto") o.vocal_gender = state.vocalGender;
        if (state.vocalStyle  && state.vocalStyle  !== "auto") o.vocal_delivery = state.vocalStyle;
        if (state.voiceTone   && state.voiceTone   !== "auto") o.voice_tone = state.voiceTone;
        if (state.bpm)         o.bpm = state.bpm;
        if (state.keyscale)    o.scale = state.keyscale;
        if (state.timesignature) o.time_sig = state.timesignature;
        return o;
      };

      function headBtns(kind) {
        const isLyr = kind === "lyrics";
        const tb = (label, title, onclick) => el("button", { className: "mmm-tb", text: label, title, onclick });
        const resetBtn = tb("Reset", "Clear this field", () => {
          const ta = isLyr ? lyricsTA : styleTA;
          if ((ta?.value || "").trim() && !confirm("Clear this field?")) return;
          if (isLyr) { state.lyrics = ""; state.lyricsInput = ""; }
          else { state.caption = ""; state.captionBrief = ""; state.styleChips = []; }
          persist(); renderCompose();
        });
        const presetBtn = tb("Preset", "Save / load presets", (e) => isLyr
          ? presetMenu("lyrics", e, () => ({ lyricsInput: state.lyricsInput, lyrics: state.lyrics }),
              (p) => { state.lyricsInput = p.lyricsInput ?? p.lyrics ?? ""; state.lyrics = state.lyricsInput; renderCompose(); })
          : presetMenu("style", e, () => ({ captionBrief: state.captionBrief, caption: state.caption, styleChips: state.styleChips }),
              (p) => { state.captionBrief = p.captionBrief ?? ""; state.caption = p.caption ?? ""; state.styleChips = p.styleChips ?? []; renderCompose(); }));
        const varBtn = isLyr ? null : tb("Reroll", "Rewrite the prompt a different way", () =>
          runLLM(CAPTION_ROLE(), state.captionBrief || styleTA.value,
            { lyrics: state.lyrics, chips: (state.styleChips || []).join(", "), ...vocalHints(), variation: Date.now() },
            (txt) => { state.caption = txt; styleTA.value = txt; persist(); }, styleWrap));
        const expandBtn = tb("Expand", "Full-screen editor", () => isLyr
          ? bigEdit("Lyrics", () => state.lyricsInput || state.lyrics, (v) => { state.lyricsInput = v; state.lyrics = v; })
          : bigEdit(state.engine === "acestep" ? "Style tags" : "Style", () => state.caption || state.captionBrief, (v) => { if (state.engine === "acestep" || !/###\s/.test(v)) state.captionBrief = v; state.caption = v; }));
        const spark = el("button", { className: "mmm-spark", title: isLyr ? "Write / enhance lyrics (uses Title when empty)" : "Write music prompt", text: "✨", onclick: () => {
          if (isLyr) {
            const cur = lyricsTA.value.trim();
            const intent = lyricsIntent(cur);
            let role = intent === "enhance" ? "lyrics_enhance" : "lyrics_from_theme";
            let input = cur;
            if (intent === "empty" && (state.title || "").trim()) { role = "lyrics_from_title"; input = state.title.trim(); }
            else if (intent === "empty") { statusEl.textContent = "Write a brief, or fill in the Title"; return; }
            const durSec = effectiveDuration({ ...state, lyricsInput: cur });
            runLLM(role, input, { engine: state.engine, language: state.language, duration_seconds: durSec, style_caption: state.caption, title: state.title || "" }, (txt) => {
              state.lyrics = txt; state.lyricsInput = cur; lyricsTA.value = txt; persist();
            }, lyricsWrap, "Writing lyrics…");
          } else {
            const brief = (state.captionBrief || styleTA.value || "").trim();
            if (!brief) { statusEl.textContent = "Write a few words of style first"; return; }
            state.captionBrief = brief;
            runLLM(CAPTION_ROLE(), brief, { lyrics: state.lyrics, chips: (state.styleChips || []).join(", "), ...vocalHints() }, (txt) => { state.caption = txt; styleTA.value = txt; persist(); }, styleWrap, "Writing prompt…");
          }
        }});
        return [resetBtn, presetBtn, varBtn, expandBtn, spark].filter(Boolean);
      }

      function renderCompose() {
        const keepScroll = compose.scrollTop;   // a toggle/add/remove rebuilds the panel — don't jump to the top
        clear(compose);
        engSel?._sync?.(state.engine);   // keep the topbar engine pill in sync (reuse can change it)

        compose.appendChild(seg([["Simple", false], ["Advanced", true]], state.advanced, (v) => { state.advanced = v; persist(); renderCompose(); }));

        // ── Title + Cover Info ──
        const titleIn = fld(state.title || "", (v) => { state.title = v; state.titleTouched = !!v.trim(); persist(); }, { ph: "Song title (optional — ✨ can turn it into lyrics)" });
        const tRow = el("div", { style: { display: "flex", gap: "6px", alignItems: "flex-end" }});
        tRow.append(
          el("div", { style: { flex: "1" }}, [el("label", { className: "mmm-lbl", text: "Title" }), titleIn]),
          el("button", { className: "mmm-cinfo", text: state.coverBrief ? "Cover Info ●" : "Cover Info",
            title: "Describe the album cover — the LLM turns it into a Krea2 prompt",
            onclick: () => coverInfoPopup() }),
        );
        compose.appendChild(tRow);

        // ── Lyrics / Instrumental ──
        const modeSeg = seg([["Song", false], ["Instrumental", true]], !!state.instrumental, (v) => {
          state.instrumental = v;
          if (v) state.vocalGender = "instrumental (no vocals)";
          else if (state.vocalGender === "instrumental (no vocals)") state.vocalGender = "auto";
          persist(); renderCompose();
        });
        compose.appendChild(el("div", { style: { display: "flex", marginTop: "6px" }}, [modeSeg]));
        modeSeg.style.flex = "1";
        compose.appendChild(sectionHead("Lyrics", ...(state.instrumental ? [] : headBtns("lyrics"))));
        if (state.instrumental) {
          compose.appendChild(el("div", { style: { fontSize: "11px", color: C.muted, padding: "8px 10px", background: C.bg1,
            border: `1px solid ${C.border}`, borderRadius: "8px", lineHeight: "1.5" },
            text: "Instrumental — no lyrics, no vocals. The style prompt drives everything. Switch to Song to write or generate lyrics." }));
        } else {
          const lb = resizableBox(() => state.lyricsInput || state.lyrics, (v) => { state.lyricsInput = v; state.lyrics = v; }, "lyricsH");
          lyricsTA = lb.ta; lyricsWrap = lb.wrap;
          lyricsTA.placeholder = "Write lyrics, or just describe them.\ne.g. \"a one-minute sad breakup story\"  /  \"mmm mmm I hate you, that vibe, 1 min\"\nLeave empty and hit ✨ to generate.";
          compose.appendChild(lb.wrap);
          const tagRow = el("div", { style: { display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "5px" }});
          LYRIC_TAGS.forEach(tag => tagRow.appendChild(el("button", { text: tag.replace(/[\[\]]/g, ""), className: "mmm-chip", style: { fontSize: "10px", padding: "3px 9px" }, onmousedown: (e) => e.preventDefault(), onclick: () => {
            const before = lyricsTA.value.slice(0, lyricsTA.selectionStart ?? lyricsTA.value.length);
            const pre = (before && !before.endsWith("\n")) ? "\n" : "";
            insertAtCursor(lyricsTA, pre + tag + "\n");
          }})));
          compose.appendChild(tagRow);
        }

        // ── Style ──
        const stLbl = state.engine === "acestep" ? "Style tags" : "Style";
        compose.appendChild(sectionHead(stLbl, ...headBtns("style")));
        const sb = resizableBox(() => state.caption || state.captionBrief, (v) => {
          if (state.engine === "acestep") { state.caption = v; state.captionBrief = v; }
          else if (/###\s/.test(v)) state.caption = v; else state.captionBrief = v;
        }, "styleH");
        styleTA = sb.ta; styleWrap = sb.wrap;
        styleTA.placeholder = state.engine === "acestep"
          ? "cinematic melodic house, Alan Walker vibe, plucky synth, airy pads, breathy vocals …\n✨ turns it into finished tags"
          : "warm acoustic pop, female vocal, fingerpicked guitar …\n✨ turns it into a structured caption";
        compose.appendChild(sb.wrap);
        const chipRow = el("div", { style: { display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "5px" }});
        STYLE_CHIPS.forEach(chip => chipRow.appendChild(el("button", { text: chip, className: "mmm-chip", onmousedown: (e) => e.preventDefault(), onclick: () => {
          state.styleChips = [...new Set([...(state.styleChips || []), chip])];
          const caret = styleTA.selectionStart ?? styleTA.value.length;
          const before = styleTA.value.slice(0, caret), after = styleTA.value.slice(caret);
          const pre  = (before.trim() && !/[\s,]$/.test(before)) ? ", " : "";
          const post = (after && !/^[\s,\n]/.test(after)) ? ", " : "";
          insertAtCursor(styleTA, pre + chip + post);
        }})));
        compose.appendChild(chipRow);

        // ── Vocals (LLM hints) — only when the track has vocals ──
        if (!state.instrumental) {
          compose.appendChild(el("div", { className: "mmm-sh", style: { marginTop: "8px" }}, [el("div", { className: "t", text: "Vocals" })]));
          const vg = el("div", { className: "mmm-grid3" });
          vg.append(
            fieldCol("gender", sel(VOCAL_GENDER, state.vocalGender || "auto", (v) => { state.vocalGender = v; persist(); })),
            fieldCol("delivery", sel(VOCAL_STYLE, state.vocalStyle || "auto", (v) => { state.vocalStyle = v; persist(); })),
            fieldCol("tone", sel(VOICE_TONE, state.voiceTone || "auto", (v) => { state.voiceTone = v; persist(); })),
          );
          compose.appendChild(vg);
        }

        // ── musical params (always) ──
        const basics = el("div", { style: { display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px" }});
        const g2 = el("div", { className: "mmm-grid2" });
        g2.append(
          fieldCol(state.engine === "acestep" ? "key / scale" : "scale (LLM hint)", sel(ACE_KEYSCALES, state.keyscale || "A minor", (v) => { state.keyscale = v; persist(); })),
          fieldCol(state.engine === "acestep" ? "time sig" : "time sig (LLM hint)", sel(ACE_TIMESIGS.map(s => ({ value: s, label: s + "/4" })), String(state.timesignature || "4"), (v) => { state.timesignature = v; persist(); })),
        );
        basics.appendChild(g2);
        basics.appendChild(rangeRow("BPM", 40, 220, 1, Math.round(state.bpm || 120), (v) => { state.bpm = Math.round(v); persist(); }));
        basics.appendChild(rangeRow("Length", DURATION_MIN, DURATION_MAX, 5, state.duration, (v) => { state.duration = v; persist(); }, fmtDur));
        basics.appendChild(checkRow("Auto-generate album cover (Krea2)", state.makeCover, (v) => { state.makeCover = v; persist(); }));
        compose.appendChild(basics);

        // ── advanced ──
        if (state.advanced) {
          const acc = el("div", { className: "mmm-acc" });
          acc.appendChild(el("div", { className: "hd", text: state.engine === "acestep" ? "Ace-Step 1.5" : "MiniMax Music 3" }));

          const fmtSel = fieldCol("format", sel(AUDIO_FORMATS, state.format || "flac", (v) => { state.format = v; persist(); renderCompose(); }));
          const qualSel = (state.format === "mp3" || state.format === "opus")
            ? fieldCol("quality", sel(state.format === "opus" ? ["64k", "96k", "128k", "192k", "320k"] : ["V0", "128k", "320k"], state.audioQuality || (state.format === "opus" ? "128k" : "V0"), (v) => { state.audioQuality = v; persist(); }))
            : null;

          if (state.engine === "acestep") {
            const g2 = el("div", { className: "mmm-grid2" });
            g2.append(
              fieldCol("language", sel(ACE_LANGUAGES, state.language || "en", (v) => { state.language = v; persist(); })),
              fieldCol("cfg_scale", fld(state.cfgScaleAce, (v) => { state.cfgScaleAce = v; persist(); }, { num: true })),
              fieldCol("temperature", fld(state.temperature, (v) => { state.temperature = v; persist(); }, { num: true })),
              fieldCol("top_p", fld(state.topP, (v) => { state.topP = v; persist(); }, { num: true })),
            );
            acc.appendChild(g2);
            const g3 = el("div", { className: "mmm-grid3" });
            g3.append(
              fieldCol("top_k", fld(state.topKAce, (v) => { state.topKAce = Math.round(v); persist(); }, { num: true })),
              fieldCol("min_p", fld(state.minP, (v) => { state.minP = v; persist(); }, { num: true })),
              el("div"),
            );
            acc.appendChild(g3);
            acc.appendChild(el("div", { className: "hd", text: "Sampling stages — steps / cfg (stage 1 always; 2→3 sequential)" }));
            const stg = el("div", { className: "mmm-grid3" });
            state.aceStages.forEach((s, i) => {
              if (i === 0) s.on = true;
              const prevOn = i === 0 ? true : state.aceStages[i - 1].on !== false;
              const active = s.on !== false && prevOn;
              const c = el("div", { style: { opacity: active || i === 0 ? "1" : ".4" }});
              const lblRow = el("label", { className: "mmm-lbl", style: { display: "flex", alignItems: "center", gap: "5px", cursor: i === 0 ? "default" : "pointer" }});
              if (i > 0) {
                const cb = el("input", { type: "checkbox", style: { accentColor: BRAND, width: "13px", height: "13px", margin: "0" }});
                cb.checked = active;
                cb.disabled = !prevOn;
                cb.onchange = () => {
                  s.on = cb.checked;
                  // turning a stage off cascades to every later stage
                  if (!cb.checked) for (let k = i + 1; k < state.aceStages.length; k++) state.aceStages[k].on = false;
                  persist(); renderCompose();
                };
                lblRow.appendChild(cb);
              }
              lblRow.appendChild(el("span", { text: `stage ${i + 1}` }));
              c.appendChild(lblRow);
              const rr = el("div", { style: { display: "flex", gap: "4px" }});
              const st = fld(s.steps, (v) => { s.steps = Math.round(v); persist(); }, { num: true });
              const cf = fld(s.cfg, (v) => { s.cfg = v; persist(); }, { num: true });
              if (!active && i !== 0) { st.disabled = true; cf.disabled = true; }
              rr.append(st, cf);
              c.appendChild(rr); stg.appendChild(c);
            });
            acc.appendChild(stg);
          } else {
            const g3 = el("div", { className: "mmm-grid3" });
            g3.append(
              fieldCol("steps", fld(state.steps, (v) => { state.steps = Math.round(v); persist(); }, { num: true })),
              fieldCol("sampler cfg", fld(state.cfg, (v) => { state.cfg = v; persist(); }, { num: true })),
              fieldCol("top_k", fld(state.topK, (v) => { state.topK = Math.round(v); persist(); }, { num: true })),
            );
            acc.appendChild(g3);
            const g2c = el("div", { className: "mmm-grid2" });
            g2c.append(
              fieldCol("guidance (cfg_scale)", fld(state.cfgScale ?? 1.7, (v) => { state.cfgScale = v; persist(); }, { num: true })),
              el("div", { style: { fontSize: "10px", color: C.muted, alignSelf: "center", lineHeight: "1.4" }, text: "cfg_scale = prompt-adherence in the MiniMax text encoder. sampler cfg = KSampler guidance. Different knobs." }),
            );
            acc.appendChild(g2c);
            const sf = el("div", { className: "mmm-grid2" });
            sf.append(fieldCol("sampler", sel(SAMPLERS, state.sampler || "euler", (v) => { state.sampler = v; persist(); })), fmtSel);
            acc.appendChild(sf);
            if (qualSel) acc.appendChild(qualSel);
            acc.appendChild(checkRow("Lower VRAM (tiled decode)", state.tiledDecode, (v) => { state.tiledDecode = v; persist(); }));
          }
          if (state.engine === "acestep") {
            const af = el("div", { className: "mmm-grid2" });
            af.append(fmtSel, qualSel || el("div"));
            acc.appendChild(af);
          }
          compose.appendChild(acc);

          // LoRA — add / remove list (searchable, matches the image nodes)
          const lr = el("div", { className: "mmm-acc" });
          const lrHd = el("div", { style: { display: "flex", alignItems: "center" }});
          lrHd.append(el("div", { className: "hd", text: `LoRA${state.loras.length ? ` (${state.loras.length})` : ""}`, style: { flex: "1" }}));
          lr.appendChild(lrHd);
          const loraOpts = ctx.models.loras || [];
          state.loras.forEach((lo, i) => {
            const rowEl = el("div", { className: "mmm-lora" });
            rowEl.appendChild(searchSel(loraOpts, lo.name, (v) => { lo.name = v; persist(); }, { placeholder: "search LoRA…" }));
            const str = fld(lo.strength ?? 1, (v) => { lo.strength = v; persist(); }, { num: true });
            str.title = "strength"; str.style.textAlign = "center";
            const rc = el("div", { style: { display: "flex", flexDirection: "column", gap: "4px", width: "58px", flexShrink: 0 }});
            rc.append(
              el("button", { className: "mmm-del", text: "✕", title: "remove", style: { width: "100%" }, onclick: () => { state.loras.splice(i, 1); persist(); renderCompose(); }}),
              str,
            );
            rowEl.appendChild(rc);
            lr.appendChild(rowEl);
          });
          lr.appendChild(el("button", { className: "mmm-add", text: "+ Add LoRA", onclick: () => { state.loras.push({ name: "none", strength: 1.0 }); persist(); renderCompose(); }}));
          compose.appendChild(lr);

          compose.appendChild(el("div", { className: "mmm-hint",
            text: (() => {
              const b = state.llmBackend;
              const label = b === "openrouter" ? "OpenRouter" : b === "comfy" ? "ComfyUI TextGenerate" : "Local GGUF";
              const mdl = b === "openrouter" ? state.llmOrModel : b === "comfy" ? state.llmClip : state.llmModel;
              return `LLM · ${label}${mdl ? " · " + String(mdl).split(/[\\/]/).pop() : ""} — change in Settings`;
            })(),
          }));
        }

        renderFixed();
        compose.scrollTop = keepScroll;
        requestAnimationFrame(() => { compose.scrollTop = keepScroll; });
      }

      // Pinned bottom block: LLM/status text · seed · Generate/Stop (never scrolls).
      function renderFixed() {
        clear(composeFixed);
        composeFixed.appendChild(statusEl);
        const seedRow = el("div", { className: "mmm-grid2" });
        seedRow.append(
          fieldCol("seed", fld(state.seed, (v) => { state.seed = Math.round(v); persist(); }, { num: true })),
          fieldCol("seed mode", sel([["random", "random"], ["fixed", "fixed"]].map(([v, l]) => ({ value: v, label: l })), state.seedMode || "random", (v) => { state.seedMode = v; persist(); })),
        );
        composeFixed.appendChild(seedRow);
        const genRow = el("div", { style: { display: "flex", gap: "6px" }});
        genRow.append(genBtn, stopBtn);
        composeFixed.appendChild(genRow);
      }

      // Submit to the ComfyUI queue with a label so it shows in the queue sidebar / server log.
      async function submitPrompt(graph, label) {
        const body = { prompt: graph, client_id: api.clientId,
          extra_data: { extra_pnginfo: { workflow: { nodes: [], links: [], extra: { tj_music: label } } } } };
        return api.fetchApi("/prompt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json());
      }

      // Pull a usable song title out of an LLM reply (handles thinking-model preambles,
      // markdown, quotes, "Title: X" prefixes).
      function cleanTitle(raw) {
        let lines = String(raw || "").split("\n").map(s => s.trim())
          .filter(s => s && !/^(let me|okay|here('s| is)|sure|i('ll| will)|analy|think|the (song|track|user)|based on|first)/i.test(s));
        // prefer the last short line (models put the answer last after reasoning)
        const cands = lines.filter(s => s.length <= 60);
        let t = (cands.length ? cands[cands.length - 1] : (lines[lines.length - 1] || "")) || "";
        t = t.replace(/^\s*(title|song title|name)\s*[:：-]\s*/i, "")
             .replace(/^[#>*\-\d.)\]\s]+/, "").replace(/["'“”‘’*`]/g, "").trim();
        return t.slice(0, 60) || "Untitled";
      }

      // ── generation queue ───────────────────────────────────────────────────
      // Every ▶ Generate click snapshots the whole panel and appends one job.
      // A single worker drains the queue FIFO; ComfyUI serialises the actual runs.
      // Each job shows its own card in the playlist. Queued (not-yet-started) jobs
      // can be cancelled; the running one is cancelled via ■ Stop (which drops the
      // whole queue). Editing the panel after clicking never leaks into a job that
      // already snapshotted.
      let queueBusy = false;

      async function llmOnce(role, input, context) {
        let out = "";
        await runLLM(role, input, context, (t) => { out = String(t || ""); }, null, null, true);
        return out.trim();
      }

      function enqueueGen() {
        if (!state.caption && !state.captionBrief) { statusEl.textContent = "Enter a style first"; return; }
        persist();
        const snap = JSON.parse(JSON.stringify(state));
        genQueue.push({
          id: Date.now() + "_" + Math.random().toString(36).slice(2, 6),
          snap, title: (snap.title || "").trim() || "New track", engine: snap.engine,
          stage: "Queued…", pct: 0, err: false, done: false, cover: null, started: false,
        });
        renderPlaylist();
        statusEl.textContent = genQueue.filter(j => !j.done && !j.err).length + " in queue";
        runQueue();
      }

      function cancelJob(id) {
        const j = genQueue.find(x => x.id === id);
        if (!j) return;
        if (j.started && !j.err) {
          // it's the one ComfyUI is running — interrupt just this run; the poll loop
          // in processJob sees the job leave genQueue and bails, then the worker
          // moves on to whatever is next.
          j.cancelled = true;
          api.fetchApi("/interrupt", { method: "POST" }).catch(() => {});
        }
        genQueue = genQueue.filter(x => x.id !== id);
        const n = genQueue.filter(x => !x.done && !x.err).length;
        statusEl.textContent = n ? n + " in queue" : (queueBusy ? "" : "Cancelled");
        renderPlaylist();
      }

      let queueStopped = false;
      function stopQueue() {
        queueStopped = true;
        api.fetchApi("/interrupt", { method: "POST" }).catch(() => {});
        genQueue = [];
        statusEl.textContent = "Stopped";
        renderPlaylist();
      }

      async function runQueue() {
        if (queueBusy) return;
        queueBusy = true;
        queueStopped = false;
        try {
          let job;
          while ((job = genQueue.find(j => !j.done && !j.err))) {
            job.started = true;
            await processJob(job).catch((e) => {
              job.err = true; job.stage = "Failed — " + String(e.message || e).slice(0, 60);
              paintJob(job);
            });
          }
        } finally {
          queueBusy = false;
          genQueue = genQueue.filter(j => j.err);   // keep failed cards; drop the finished
          if (!genQueue.length && !queueStopped) statusEl.textContent = "Done ✓";
          renderPlaylist();
        }
      }

      const STAGE_OF = (ct) => {
        if (/TextEncode|CLIPTextEncode/.test(ct)) return "Encoding prompt";
        if (/Sampler|KSampler/.test(ct)) return "Sampling";
        if (/VAEDecode/.test(ct)) return "Decoding audio";
        if (/SaveAudio/.test(ct)) return "Saving";
        return null;
      };

      async function processJob(job) {
        const st = job.snap;
        // 1) resolve caption + lyrics from this job's own snapshot
        if (!st.caption && st.captionBrief) {
          job.stage = "Writing prompt…"; paintJob(job);
          const role = st.engine === "acestep" ? "caption_acestep" : "caption_minimax";
          const c = await llmOnce(role, st.captionBrief, { lyrics: st.lyrics, ...vocalHintsOf(st) });
          if (c) st.caption = c;
        }
        if (!st.caption) throw new Error("Caption failed — check LLM settings");
        if (st.instrumental) {
          st.lyrics = "";
        } else {
          const li = lyricsIntent(st.lyricsInput);
          if ((li === "brief" || li === "hook") && st.lyricsInput) {
            job.stage = "Writing lyrics…"; paintJob(job);
            // LLM failure must stop the job, not silently fall through to the raw
            // brief — llmOnce throws on empty, processJob's catch paints it red.
            st.lyrics = await llmOnce("lyrics_from_theme", st.lyricsInput,
              { engine: st.engine, language: st.language, duration_seconds: effectiveDuration(st), style_caption: st.caption });
          } else {
            st.lyrics = st.lyricsInput;
          }
        }

        const seed = st.seedMode === "fixed" ? st.seed : randomSeed();
        const { graph, meta, seedUsed } = buildMusicGraph({ ...st, seed }, {});
        job.title = meta.title || job.title;

        // 2) cover first — gives the card a face
        job.stage = "Making cover…"; paintJob(job);
        if (st.makeCover) {
          const cfn = await coverImage(meta, { brief: st.coverBrief || "" }).catch(() => null);
          if (cfn) { meta.coverImage = cfn; job.cover = cfn; }
        }

        // 3) submit the music graph
        job.stage = "Queued…"; job.pct = 0; paintJob(job);
        const res = await submitPrompt(graph, `MusicMaker · ${job.title}`);
        if (res.error || (res.node_errors && Object.keys(res.node_errors).length)) {
          throw new Error(res.error?.message || JSON.stringify(res.node_errors || res.error));
        }
        const pid = res.prompt_id;
        job.pid = pid;
        console.info(`[MusicMaker] queued music prompt ${pid} — "${job.title}"`);

        const setStage = (nid) => {
          const s = nid ? STAGE_OF(graph[nid]?.class_type || "") : null;
          if (s && s !== job.stage) { job.stage = s; return true; }
          return false;
        };
        const onProg = (ev) => {
          const d = ev.detail || {};
          if (d.prompt_id && d.prompt_id !== pid) return;
          setStage(d.node);
          if (d.max) job.pct = Math.min(99, Math.round((d.value / d.max) * 100));
          paintJob(job);
        };
        const onExec = (ev) => {
          const d = ev.detail;
          const nid = (d && typeof d === "object") ? d.node : d;
          if ((d && d.prompt_id && d.prompt_id !== pid) || !nid) return;
          if (setStage(nid)) { job.pct = 0; paintJob(job); }
        };
        api.addEventListener("progress", onProg);
        api.addEventListener("executing", onExec);
        try {
          let outputs = null;
          for (let i = 0; i < 1200 && !outputs; i++) {
            await new Promise(r => setTimeout(r, 2500));
            if (!genQueue.includes(job)) return;   // cancelled via Stop
            const h = await api.fetchApi(`/history/${pid}`).then(r => r.json()).catch(() => ({}));
            const e = h[pid];
            if (!e) continue;
            const s = e.status || {};
            if (s.status_str === "error" || (s.messages || []).some(m => m[0] === "execution_error")) throw new Error("Execution error — check Console");
            if (s.completed || s.status_str === "success") outputs = e.outputs;
          }
          if (!outputs) throw new Error("Timed out");
          let audio = null;
          for (const nid of Object.keys(outputs)) { const a = outputs[nid].audio || outputs[nid].audios; if (Array.isArray(a) && a.length) { audio = a[0]; break; } }
          if (!audio) throw new Error("No audio output");

          job.stage = "Finishing…"; job.pct = 100; paintJob(job);
          if (!st.titleTouched || !meta.title) {
            meta.title = "";
            // the audio already exists — a title-LLM failure must not fail the job
            let tt = "";
            try { tt = await llmOnce("title", st.caption || st.captionBrief || "", { lyrics: st.lyrics || "" }); } catch {}
            const c = cleanTitle(tt);
            meta.title = (c && c !== "Untitled") ? c : (cleanTitle(st.lyrics || st.caption || "") || "Untitled");
          }
          meta.seed = seedUsed;
          await jpost("/save_meta", { filename: audio.filename, subfolder: audio.subfolder || SUB(), meta });
          await jpost("/set_last_audio", { unique_id: String(self.id), audio });
          job.done = true;
          genQueue = genQueue.filter(j => j !== job);
          const stillPending = genQueue.filter(j => !j.done && !j.err).length;
          statusEl.textContent = stillPending ? stillPending + " in queue" : "Done ✓";
          const wasIdle = audioEl.paused || !audioEl.src;
          await loadPlaylist();
          if (wasIdle && !stillPending) playIndex(0);
        } finally {
          api.removeEventListener("progress", onProg);
          api.removeEventListener("executing", onExec);
        }
      }

      function vocalHintsOf(st) {
        if (st.instrumental) return { vocal_gender: "instrumental (no vocals)" };
        const o = {};
        if (st.vocalGender && st.vocalGender !== "auto") o.vocal_gender = st.vocalGender;
        if (st.vocalStyle  && st.vocalStyle  !== "auto") o.vocal_delivery = st.vocalStyle;
        if (st.voiceTone   && st.voiceTone   !== "auto") o.voice_tone = st.voiceTone;
        if (st.bpm)          o.bpm = st.bpm;
        if (st.keyscale)     o.scale = st.keyscale;
        if (st.timesignature) o.time_sig = st.timesignature;
        return o;
      }

      function regenCoverPopup(t) {
        const ov = el("div", { className: "mmm-pop" });
        const box = el("div", { className: "box" });
        box.appendChild(el("h4", { text: "Regenerate cover" }));
        let mode = "auto";
        const ta = el("textarea", { className: "mmm-fld", style: { fontSize: "12px", lineHeight: "1.5", opacity: ".4" },
          placeholder: "Describe the cover in plain words — the LLM turns it into a Krea2 prompt." });
        ta.disabled = true;
        const segw = seg([["Auto ReGen", "auto"], ["Prompt ReGen", "prompt"]], mode, (v) => {
          mode = v; ta.disabled = (v === "auto"); ta.style.opacity = v === "auto" ? ".4" : "1";
          if (v === "prompt") ta.focus();
        });
        box.appendChild(segw);
        box.appendChild(el("p", { text: "Auto: the LLM works from the title + lyrics. Prompt: your description goes through the LLM into a Krea2 prompt." }));
        box.appendChild(ta);
        const btns = el("div", { className: "btns" });
        btns.append(
          el("button", { className: "mmm-x", text: "Cancel", onclick: () => ov.remove() }),
          el("button", { className: "mmm-save", style: { padding: "8px 16px", boxShadow: "none" }, text: "ReGenerate", onclick: () => {
            const brief = mode === "prompt" ? ta.value.trim() : "";
            ov.remove();
            regenCover(t, brief);
          }}),
        );
        box.appendChild(btns);
        ov.appendChild(box);
        ov.addEventListener("mousedown", (e) => { if (e.target === ov) ov.remove(); });
        root.appendChild(ov);
      }

      async function regenCover(t, brief) {
        statusEl.textContent = "Regenerating cover…";
        regenCoverFn = t.filename;
        renderPlaylist();
        try {
          const d = await jget(`/meta?filename=${encodeURIComponent(t.filename)}&subfolder=${encodeURIComponent(t.subfolder || SUB())}`);
          const meta = d.ok ? d.meta : null;
          if (!meta) { statusEl.textContent = "No metadata — can't make a cover"; return; }
          meta.seed = randomSeed();   // new look each time
          const fn = await coverImage(meta, { brief: brief || "" });
          if (!fn) { statusEl.textContent = "Cover failed — check Krea2 in Settings"; return; }
          await jpost("/update_meta", { filename: t.filename, subfolder: t.subfolder || SUB(), patch: { coverImage: fn } });
          statusEl.textContent = "Cover done ✓";
        } catch (e) { statusEl.textContent = "Cover error: " + e.message; }
        finally { regenCoverFn = null; loadPlaylist(); }
      }

      // Generate one album-cover image via Krea2, return its filename (no meta patch).
      // opts.brief: undefined → use the compose-panel Cover Info; "" → auto (title+lyrics only);
      // non-empty string → that description (per-track regen).
      async function coverImage(meta, opts) {
        const kb = await import("./krea2/graph_builder_krea2.js");
        const kcfg = await api.fetchApi("/krea2_one/config").then(r => r.json());
        // Cover art ALWAYS goes through the LLM. Input: the given/compose brief if any,
        // otherwise the title + lyrics. No hard-coded fallback prompt.
        const briefSrc = (opts && "brief" in opts) ? opts.brief : state.coverBrief;
        const brief = (briefSrc || "").trim();
        const llmInput = brief || [meta.title && `Title: ${meta.title}`, meta.lyrics && `Lyrics:\n${meta.lyrics}`].filter(Boolean).join("\n\n");
        if (!llmInput) return null;
        let coverPrompt = "";
        await runLLM("cover_prompt", llmInput, {
          user_brief: brief, title: meta.title || "", style: meta.caption || meta.captionBrief || "",
          has_lyrics: meta.lyrics ? "yes" : "no",
        }, (tt) => coverPrompt = tt.trim());
        if (!coverPrompt) return null;   // LLM unavailable → no cover (thumbnail shows MM / ACE)
        const kstate = {
          mode: "t2i", model: kcfg.selected_model, textEncoder: kcfg.selected_text_encoder, vae: kcfg.selected_vae,
          prompt: coverPrompt, promptsByMode: { t2i: coverPrompt }, width: 640, height: 640,
          steps: 8, cfg: 1, sampler: "euler", scheduler: "simple", seed: meta.seed || 1, loras: [],
          outputMode: "save", saveSubfolder: SUB() + "/covers",
        };
        const g = kb.buildT2IGraph ? kb.buildT2IGraph(kstate) : (kb.default ? kb.default(kstate) : null);
        if (!g) return null;
        const r = await submitPrompt(g.graph || g, "MusicMaker · cover art");
        const pid = r.prompt_id;
        console.info(`[MusicMaker] queued cover prompt ${pid}`);
        for (let i = 0; i < 150; i++) {
          await new Promise(res => setTimeout(res, 2000));
          const h = await api.fetchApi(`/history/${pid}`).then(r => r.json()).catch(() => ({}));
          const e = h[pid];
          if (e && (e.status?.completed || e.status?.status_str === "success")) {
            for (const nid of Object.keys(e.outputs || {})) {
              const im = e.outputs[nid].images;
              if (Array.isArray(im) && im.length) return im[0].filename;
            }
            return null;
          }
        }
        return null;
      }

      // ── settings overlay — 3 tabs, batch "Save All" ────────────────────────
      const settingsEl = el("div", { className: "mmm-ov", style: { display: "none" }});
      const settingsOv = { el: settingsEl, show() { settingsEl.style.display = "flex"; renderSettings(); }, hide() { settingsEl.style.display = "none"; }};
      let setTab = "minimax";
      let pending = {};        // staged form values, flushed by Save All
      let orModels = null;

      function setSelectRow(lbl, key, opts, cur) {
        return fieldCol(lbl, searchSel(opts || [], pending[key] ?? cur ?? "none", (v) => { pending[key] = v; }, { placeholder: "filter models…" }));
      }
      function setTextRow(lbl, key, cur, placeholder) {
        const i = el("input", { className: "mmm-fld", type: (key === "openrouter_key" ? "password" : "text"), placeholder: placeholder || "", value: pending[key] ?? cur ?? "" });
        i.oninput = () => { pending[key] = i.value; };
        return fieldCol(lbl, i);
      }
      const setNote = (t) => el("div", { text: t, style: { fontSize: "10.5px", color: C.muted, lineHeight: "1.6" }});

      async function flushSettings() {
        if (!pending || !Object.keys(pending).length) return true;
        try {
          await jpost("/config", pending);
          const map = { dit: "dit", clip: "clip", dav: "dav", ace_unet: "aceUnet", ace_clip1: "aceClip1", ace_clip2: "aceClip2", ace_vae: "aceVae", ace_sampler_name: "aceSamplerName", ace_scheduler: "aceScheduler", ace_shift: "aceShift", llm_backend: "llmBackend", llm_model: "llmModel", llm_or_model: "llmOrModel", llm_clip: "llmClip", llm_clip_type: "llmClipType", save_subfolder: "saveSubfolder" };
          const folderChanged = ("save_subfolder" in pending) && (pending.save_subfolder || "") !== (state.saveSubfolder || "");
          for (const k in pending) if (map[k]) state[map[k]] = pending[k];
          persist(); pending = {}; renderCompose();
          if (folderChanged) loadPlaylist();
          return true;
        } catch (e) { statusEl.textContent = "Settings save failed: " + e.message; return false; }
      }

      async function renderSettings() {
        clear(settingsEl);
        pending = {};
        // always re-scan on open — a model added on disk must show up without a page reload
        const m = ctx.models = await jget("/models").catch(() => ctx.models || {});
        ctx.llmModels = null;
        const cfg = await jget("/config");

        const hd = el("div", { className: "mmm-ov-hd" });
        hd.appendChild(el("div", { className: "t", text: "MusicMaker Settings" }));
        const hdBtns = el("div", { style: { display: "flex", gap: "6px" }});
        hdBtns.appendChild(el("button", { className: "mmm-tb", text: "↻ Refresh models", title: "Re-scan the model folders",
          onclick: async (e) => {
            e.currentTarget.textContent = "↻ Scanning…"; e.currentTarget.disabled = true;
            ctx.models = null; ctx.llmModels = null; orModels = null;
            await renderSettings();   // re-scans /models on entry
          }}));
        hdBtns.appendChild(el("button", { className: "mmm-x", text: "Close", title: "Save & close", onclick: async () => { await flushSettings(); settingsOv.hide(); }}));
        hd.appendChild(hdBtns);
        settingsEl.appendChild(hd);

        const tabs = el("div", { className: "mmm-tabs" });
        [["minimax", "MiniMax Music 3"], ["acestep", "Ace-Step 1.5"], ["llm", "LLM"]].forEach(([k, lbl]) => {
          tabs.appendChild(el("button", { text: lbl, className: setTab === k ? "on" : "", onclick: () => { setTab = k; renderTab(cfg, m); [...tabs.children].forEach((c, i) => c.classList.toggle("on", ["minimax", "acestep", "llm"][i] === k)); }}));
        });
        settingsEl.appendChild(tabs);

        // save folder — engine-agnostic, drives both the SaveAudio path and the playlist scan
        const sfIn = el("input", { className: "mmm-fld", type: "text", spellcheck: false,
          placeholder: SUBFOLDER, value: pending.save_subfolder ?? cfg.save_subfolder ?? state.saveSubfolder ?? "" });
        sfIn.oninput = () => { pending.save_subfolder = sfIn.value.trim(); };
        const sfRow = fieldCol("Save folder (under ComfyUI output/)", sfIn);
        sfRow.style.margin = "10px 0 2px";
        settingsEl.appendChild(sfRow);
        settingsEl.appendChild(el("div", { text: "Where tracks are saved and where the playlist reads from. Blank = " + SUBFOLDER + ". Covers go in <folder>/covers.",
          style: { fontSize: "10px", color: C.muted, lineHeight: "1.5", marginBottom: "4px" }}));

        const bodyEl = el("div", { className: "mmm-ov-body" });
        settingsEl.appendChild(bodyEl);
        settingsEl._body = bodyEl;
        renderTab(cfg, m);

        settingsEl.appendChild(el("div", { className: "mmm-hint", text: "Changes are saved on Close or Save all — stored on the server, kept after restart." }));
        const saveBtn = el("button", { className: "mmm-save", text: "Save all", onclick: async () => {
          saveBtn.disabled = true; saveBtn.textContent = "Saving…";
          const ok = await flushSettings();
          saveBtn.textContent = ok ? "✓ Saved" : "Error — retry";
          setTimeout(() => { saveBtn.textContent = "Save all"; saveBtn.disabled = false; }, 1200);
        }});
        settingsEl.appendChild(saveBtn);
      }

      async function renderTab(cfg, m) {
        const b = settingsEl._body; clear(b);
        if (setTab === "minimax") {
          b.appendChild(setNote("MiniMax Music 3 — ComfyUI native. Pick the 3 models."));
          b.appendChild(setSelectRow("DiT (diffusion model)", "dit", m.diffusion_models, cfg.dit));
          b.appendChild(setSelectRow("Text encoder", "clip", m.text_encoders, cfg.clip));
          b.appendChild(setSelectRow("Audio VAE (DAV)", "dav", m.vaes, cfg.dav));
        } else if (setTab === "acestep") {
          b.appendChild(setNote("Ace-Step 1.5 — DualCLIP + AuraFlow + 3-stage SamplerCustom chain."));
          b.appendChild(setSelectRow("Diffusion model", "ace_unet", m.diffusion_models, cfg.ace_unet));
          b.appendChild(setSelectRow("CLIP 1 (qwen 0.6b)", "ace_clip1", m.text_encoders, cfg.ace_clip1));
          b.appendChild(setSelectRow("CLIP 2 (qwen 4b)", "ace_clip2", m.text_encoders, cfg.ace_clip2));
          b.appendChild(setSelectRow("VAE (ace_1.5)", "ace_vae", m.vaes, cfg.ace_vae));
          let names = ["jkass_quality"];
          try { const so = await api.fetchApi("/object_info/KSamplerSelect").then(r => r.json()); names = so.KSamplerSelect?.input?.required?.sampler_name?.[0] || names; } catch {}
          b.appendChild(fieldCol("sampler_name", sel(names, pending.ace_sampler_name ?? cfg.ace_sampler_name, (v) => { pending.ace_sampler_name = v; })));
          const g = el("div", { className: "mmm-grid2" });
          g.append(
            fieldCol("scheduler", sel(SCHEDULERS, pending.ace_scheduler ?? cfg.ace_scheduler, (v) => { pending.ace_scheduler = v; })),
            fieldCol("shift (AuraFlow)", fld(pending.ace_shift ?? cfg.ace_shift ?? 3, (v) => { pending.ace_shift = v; }, { num: true })),
          );
          b.appendChild(g);
        } else {
          b.appendChild(setNote("LLM — writes the lyrics, style caption and cover-art prompts. Captions need strong instruction-following, so OpenRouter is recommended."));
          b.appendChild(fieldCol("Backend", sel(LLM_BACKENDS.map(x => ({ value: x.key, label: x.label })), pending.llm_backend ?? cfg.llm_backend, (v) => { pending.llm_backend = v; renderTab(cfg, m); })));
          const backend = pending.llm_backend ?? cfg.llm_backend;
          if (backend === "openrouter") {
            if (!orModels) { try { orModels = (await jget("/openrouter_models")).models || []; } catch { orModels = []; } }
            b.appendChild(fieldCol(`Model (${orModels.length} available)`, searchSel(orModels, pending.llm_or_model ?? cfg.llm_or_model, (v) => { pending.llm_or_model = v; }, { placeholder: "search e.g. anthropic/claude" })));
            const keyHint = cfg.openrouter_key_hint || "";
            const keyInput = el("input", { className: "mmm-fld", type: "text", autocomplete: "off", spellcheck: false,
              placeholder: keyHint ? "" : "sk-or-v1-…", value: keyHint });
            keyInput.dataset.masked = keyHint ? "1" : "";
            keyInput.onfocus = () => { if (keyInput.dataset.masked === "1") { keyInput.value = ""; keyInput.dataset.masked = ""; keyInput.type = "password"; } };
            keyInput.oninput = () => { pending.openrouter_key = keyInput.value; };
            keyInput.onblur = () => {
              if (!keyInput.value.trim() && keyHint) { keyInput.value = keyHint; keyInput.dataset.masked = "1"; keyInput.type = "text"; delete pending.openrouter_key; }
            };
            b.appendChild(fieldCol("OpenRouter API key", keyInput));
            b.appendChild(el("div", { text: cfg.openrouter_key_set ? "✓ key stored in .env — click the field to replace it" : "⚠ API key required — openrouter.ai/keys", style: { fontSize: "10.5px", color: cfg.openrouter_key_set ? "#7eff7e" : C.warn }}));
          } else if (backend === "comfy") {
            b.appendChild(setNote("Runs ComfyUI's native TextGenerate node — a GGUF/safetensors LLM loaded through a CLIP loader. No extra packages."));
            const clipOpts = [...(m.text_encoders || []), ...(ctx.llmModels || [])];
            b.appendChild(fieldCol(`CLIP / GGUF model (${clipOpts.length})`, searchSel(clipOpts, pending.llm_clip ?? cfg.llm_clip, (v) => { pending.llm_clip = v; }, { placeholder: "search text encoders…" })));
            b.appendChild(fieldCol("CLIP loader type", sel(LLM_CLIP_TYPES, pending.llm_clip_type ?? cfg.llm_clip_type ?? "qwen_image", (v) => { pending.llm_clip_type = v; })));
          } else {
            if (!ctx.llmModels) { try { ctx.llmModels = (await api.fetchApi("/tj_studio_one/llm/models").then(r => r.json()).catch(() => ({}))).gguf || []; } catch { ctx.llmModels = []; } }
            if (ctx.llmModels.length) {
              b.appendChild(fieldCol(`GGUF model (${ctx.llmModels.length})`, searchSel(ctx.llmModels, pending.llm_model ?? cfg.llm_model, (v) => { pending.llm_model = v; }, { placeholder: "search GGUF models…" })));
            } else {
              b.appendChild(setTextRow("GGUF model (TJ_NODE)", "llm_model", cfg.llm_model, "no GGUF found — ComfyUI-TJ_NODE required"));
            }
            b.appendChild(setNote("Local LLM needs ComfyUI-TJ_NODE installed. OpenRouter gives better caption quality."));
          }
        }
      }
      root.appendChild(settingsEl);

      // ── mount ──────────────────────────────────────────────────────────────
      self.addDOMWidget("mmm_ui", "div", root, { serialize: false, computeSize: () => [NODE_MW, NODE_MH] });

      jget("/models").then(d => { ctx.models = d; renderCompose(); }).catch(() => {});
      jget("/node_availability").then(d => { ctx.availability = d.available || {}; }).catch(() => {});
      jget("/config").then(d => {
        state.dit = state.dit || d.dit; state.clip = state.clip || d.clip; state.dav = state.dav || d.dav;
        state.aceUnet = state.aceUnet || d.ace_unet; state.aceClip1 = state.aceClip1 || d.ace_clip1;
        state.aceClip2 = state.aceClip2 || d.ace_clip2; state.aceVae = state.aceVae || d.ace_vae;
        state.aceSamplerName = state.aceSamplerName || d.ace_sampler_name;
        if (!state.saveSubfolder && d.save_subfolder && d.save_subfolder !== SUBFOLDER) state.saveSubfolder = d.save_subfolder;
        // server config is the source of truth for the LLM setup
        if (d.llm_backend)    state.llmBackend  = d.llm_backend;
        if (d.llm_model != null)    state.llmModel   = d.llm_model;
        if (d.llm_or_model != null) state.llmOrModel = d.llm_or_model;
        if (d.llm_clip != null)     state.llmClip    = d.llm_clip;
        if (d.llm_clip_type)  state.llmClipType = d.llm_clip_type;
        persist(); renderCompose();
      }).catch(() => {});
      renderCompose();
      loadPlaylist();
    };
  },
});

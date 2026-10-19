// override_toggle.js — the "Prompt/pipe Override" on/off switch in the top bar of the image nodes.
//
// Off makes the node ignore whatever is wired into `prompt_override` and `pipe` (see resolvePipeOverrides), so one
// PromptDBLoader can stay connected to every node and be switched in or out per node without touching the wires.
export function createOverrideToggle(state, persist) {
  const css = (e, text) => { e.style.cssText = text; return e; };
  const wrap = css(document.createElement("div"), "display:flex;align-items:center;gap:8px;flex-shrink:0;margin-right:4px;padding-right:12px;border-right:1px solid #3a3a3a;cursor:pointer;user-select:none");
  wrap.title = "On: a connected prompt_override / pipe is used.\nOff: both are ignored, even while connected.";
  const label = css(document.createElement("span"), "color:#cfcfcf;font-size:12px;white-space:nowrap");
  label.textContent = "Prompt/pipe Override";
  const track = css(document.createElement("div"), "position:relative;width:38px;height:20px;border-radius:10px;transition:background .15s;flex-shrink:0");
  const knob = css(document.createElement("div"), "position:absolute;top:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left .15s");
  track.appendChild(knob);
  wrap.append(label, track);
  const paint = () => {
    const on = state.promptOverride !== false;
    track.style.background = on ? "#7c3aed" : "#4a4a4a";
    knob.style.left = on ? "20px" : "2px";
  };
  wrap.addEventListener("click", () => { state.promptOverride = state.promptOverride === false; persist(); paint(); });
  paint();
  return wrap;
}

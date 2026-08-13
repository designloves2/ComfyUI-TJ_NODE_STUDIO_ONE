// node_state.js — keep a ONE STUDIO node's settings inside the workflow.
//
// These nodes render their whole UI into a DOM widget registered with `serialize: false`,
// and keep their settings in one localStorage key per node type. That means a saved
// workflow carries none of them: it only looks persistent while the same browser still
// holds the key. Open the file on another machine and everything is back to defaults,
// hand it to someone else and they get nothing, and two nodes of the same type in one
// graph overwrite each other through that single shared blob.
//
// So each node also gets a hidden serialised widget holding its state. It is written on
// every persist, and read back in onConfigure — the first moment ComfyUI has applied the
// workflow's `widgets_values` — so the file's own values win over whatever the browser
// happens to hold. localStorage stays as the seed for a freshly dropped node, which is
// what makes a new node start from the settings you last used.

const WIDGET_NAME = "tj_state";

/**
 * Add the hidden state widget and return the `persist` the node should call.
 *
 * @param node       the LiteGraph node
 * @param state      the live state object (mutated in place, never replaced)
 * @param save       (state) => void — the node's existing localStorage writer
 * @param normalize  (obj) => state — the node's `defaultState`, to fill gaps in old files
 * @param rerender   () => void — repaint every panel from `state`
 */
export function attachNodeState(node, { state, save, normalize, rerender }) {
  const w = node.addWidget("text", WIDGET_NAME, "", () => {});
  w.computeSize = () => [0, -4];   // takes no room; the DOM widget is the real UI
  w.draw = () => {};
  w.hidden = true;

  // Repainting a restored node runs the panel builders, and those call persist as they
  // wire their fields up — some of them only after an await, so a synchronous flag round
  // the repaint would not cover it. Those writes must not reach localStorage, or opening
  // someone else's workflow would quietly replace the settings your next new node
  // inherits. So the seed is held back until the user actually touches something, which
  // is the only moment "the settings I last used" genuinely changed.
  let restoring = false;
  let releaseRestore = null;

  const persist = () => {
    if (!restoring) { try { save(state); } catch {} }
    try { w.value = JSON.stringify(state); } catch {}
  };

  node._tjApplyState = (obj) => {
    if (!obj || typeof obj !== "object") return false;
    const next = normalize(obj);
    // mutate in place — panels and overlays captured this object by reference
    for (const k of Object.keys(state)) delete state[k];
    Object.assign(state, next);

    releaseRestore?.();
    restoring = true;
    const release = () => {
      restoring = false;
      releaseRestore = null;
      for (const ev of ["pointerdown", "keydown"]) document.removeEventListener(ev, release, true);
    };
    releaseRestore = release;
    for (const ev of ["pointerdown", "keydown"]) document.addEventListener(ev, release, true);

    try { rerender(); } catch (e) { console.warn("[TJ] repaint after restore failed:", e); }
    return true;
  };

  persist();
  return persist;
}

/** Call from onConfigure: put the workflow's stored settings back on screen. */
export function restoreNodeState(node) {
  const w = node.widgets?.find(x => x.name === WIDGET_NAME);
  if (!w || !w.value) return false;               // fresh node — keep what it inherited
  try {
    return !!node._tjApplyState?.(JSON.parse(w.value));
  } catch (e) {
    console.warn("[TJ] stored node state unreadable, keeping current settings:", e);
    return false;
  }
}

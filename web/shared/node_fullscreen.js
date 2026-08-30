// node_fullscreen.js — blow one ONE STUDIO node up to fill the monitor, in place.
//
// Not the browser's fullscreen API and not a second page: the node's own DOM is lifted
// out of the canvas, centred on a backdrop, and scaled up uniformly so it keeps its exact
// proportions. Everything inside keeps working because it is the same element — the
// gallery, settings and dialogs all live under it and come along.
//
// The one thing that makes this delicate: ComfyUI's DOM-widget layer rewrites the mounted
// element's inline `left/top/width/height/transform` on every canvas draw, so anything we
// merely assign is undone within a frame. The fix is to write our layout with `important`
// priority — a plain assignment from the widget layer cannot override that — and to drop
// those properties again on exit so the widget layer resumes control cleanly.
const FS_PROPS = ["position", "left", "top", "width", "height", "margin",
                  "transform", "transform-origin", "z-index", "max-width", "max-height"];

/**
 * Leaving is deliberately the toggle button and nothing else — no Escape, no click on the
 * black margin. Both of those fire by accident while working inside the node (a stray
 * click past a panel edge, Escape meant for a dropdown), and losing the blown-up view
 * mid-edit is worse than having to aim for the button.
 *
 * @param el      the node's root element (the one passed to addDOMWidget)
 * @param w,h     its natural CSS size, used to keep the aspect ratio when scaling
 * @param onChange called with true/false whenever the view opens or closes
 * @returns {{ toggle, exit, isOpen }}
 */
export function createNodeFullscreen(el, w, h, onChange) {
  let open = false;
  let backdrop = null;
  let savedCss = "";
  // Where the element sat in the canvas DOM, so it can be put back exactly.
  let homeParent = null, homeNext = null;

  function layout() {
    if (!open) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    // Uniform scale, never upscaled past what fits — the node keeps its proportions and
    // simply fills as much of the monitor as it can.
    const scale = Math.min(vw / w, vh / h);
    const s = el.style;
    s.setProperty("position", "fixed", "important");
    s.setProperty("left", "50%", "important");
    s.setProperty("top", "50%", "important");
    s.setProperty("width", `${w}px`, "important");
    s.setProperty("height", `${h}px`, "important");
    s.setProperty("margin", "0", "important");
    s.setProperty("max-width", "none", "important");
    s.setProperty("max-height", "none", "important");
    s.setProperty("transform-origin", "center center", "important");
    s.setProperty("transform", `translate(-50%, -50%) scale(${scale})`, "important");
    s.setProperty("z-index", "100001", "important");
  }

  function enter() {
    if (open) return;
    open = true;
    savedCss = el.style.cssText;

    backdrop = document.createElement("div");
    Object.assign(backdrop.style, {
      position: "fixed", inset: "0", background: "rgba(0,0,0,0.92)",
      zIndex: "100000",
    });
    // The margin swallows clicks rather than acting on them: it is there to black out the
    // canvas behind, not to be a second exit.
    backdrop.addEventListener("mousedown", (e) => { if (e.target === backdrop) e.stopPropagation(); });
    document.body.appendChild(backdrop);

    // `position: fixed` is measured against a transformed ancestor rather than the
    // viewport, and the canvas container is transformed on every zoom — so staying inside
    // it would cap the node at the container's box no matter what we set. Moving the
    // element under the backdrop (a direct child of body) is what actually frees it.
    homeParent = el.parentNode;
    homeNext = el.nextSibling;
    backdrop.appendChild(el);

    layout();
    // The widget layer recomputes on canvas draws, which do not fire while nothing is
    // moving; re-asserting on resize covers the case that actually changes our maths.
    window.addEventListener("resize", layout);
    // Reassert once per frame for a moment: a draw can land right after we lay out, and
    // `important` wins the property fight but only for properties we have already set.
    let n = 0;
    const tick = () => { if (!open || n++ > 30) return; layout(); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    onChange?.(true);
  }

  function exit() {
    if (!open) return;
    open = false;
    window.removeEventListener("resize", layout);
    // Drop our declarations rather than overwriting them, so the widget layer's own
    // values apply again on the next draw instead of fighting a leftover !important.
    // Put it back before restoring styles, so the widget layer's next draw finds it where
    // it expects and re-applies its own geometry.
    if (homeParent) homeParent.insertBefore(el, homeNext);
    homeParent = homeNext = null;
    FS_PROPS.forEach(p => el.style.removeProperty(p));
    el.style.cssText = savedCss;
    backdrop?.remove();
    backdrop = null;
    onChange?.(false);
  }

  return {
    toggle() { open ? exit() : enter(); },
    exit,
    isOpen: () => open,
  };
}

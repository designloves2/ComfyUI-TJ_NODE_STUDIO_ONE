// SPDX-License-Identifier: GPL-3.0-only
// Part of the LTX 2.5 Director code in this package (derived from CGlide's LTX-2.5-Director, GPL-3.0).
// GPL-3.0 only: do NOT copy this file into the web project (see PORT_LEDGER).
//
// Hosts the Director's timeline editor outside the workflow: a LTXDirectorTJ25 node that is created
// but never added to the graph, so its editor can sit inside Prompt Edit while the clip's timeline
// lives in the studio's own state. A clip's timeline is the set of that node's widget values.

// The widgets that make up a timeline. Everything the Director takes from the graph instead
// (model / clip / vae / the size and frame rate of the render) is set by the graph builder.
const TIMELINE_WIDGETS = [
  "timeline_data", "local_prompts", "segment_lengths", "guide_strength", "epsilon",
  "use_custom_audio", "use_custom_motion", "inpaint_audio", "override_audio",
];
const FPS = 24;

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

/**
 * @param onChange  () => void — the editor committed a change (read it back with snapshot())
 */
export function createDirectorHost({ onChange } = {}) {
  const node = window.LiteGraph.createNode("LTXDirectorTJ25");
  const ui = node.widgets.find(w => w.name === "timeline_ui");
  const el = document.createElement("div");
  el.style.cssText = "flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;scrollbar-gutter:stable;position:relative";
  el.appendChild(ui.element);

  let suppress = false;
  let hooked = null;

  async function editor() {
    for (let i = 0; i < 60 && !node._timelineEditor; i++) await tick(25);
    const ed = node._timelineEditor;
    if (ed && hooked !== ed) {
      hooked = ed;
      const commit = ed.commitChanges.bind(ed);
      ed.commitChanges = (...args) => {
        const out = commit(...args);
        if (!suppress) onChange?.();
        return out;
      };
      // The clip's global prompt is the studio's own prompt field; the segment prompts stay here.
      const gp = ed.globalPromptInput;
      const block = gp && gp.closest(".prcs-prop-container");
      if (block) block.style.display = "none";
      fit(ed);
      resizer.observe(ed.wrapper);
    }
    return ed;
  }

  // The editor sizes itself from the node's width, so the node is kept as wide as the space it sits in.
  function fit(ed) {
    const w = Math.floor(el.clientWidth);
    if (!ed || w < 200) return;
    node.size = [w + 30, node.size[1]];
    ed.syncLayoutToNode();
    fitHeight(ed);
  }

  // The tracks (ruler / main / audio / IC-LoRA video) share whatever height is left once the toolbar, the
  // transport bar and the segment prompt have their own, so the whole timeline shows without scrolling.
  function fitHeight(ed) {
    const avail = el.clientHeight;
    if (!ed || avail < 220) return;
    const room = Math.max(190, avail - (ed.wrapper.offsetHeight - ed.canvasHeight) - 6);
    const ruler = 20, rest = room - ruler;
    const main = Math.max(60, Math.round(rest * 0.4));
    const audio = Math.max(54, Math.round(rest * 0.3));
    const motion = Math.max(54, rest - main - audio);
    if (ed.blockHeight === main && ed.audioTrackHeight === audio && ed.motionTrackHeight === motion) return;
    ed.rulerHeight = ruler; ed.blockHeight = main; ed.audioTrackHeight = audio; ed.motionTrackHeight = motion;
    ed.canvasHeight = ruler + main + audio + motion;
    ed.canvas.style.height = `${ed.canvasHeight}px`;
    ed.viewport.style.height = ed.viewport.style.minHeight = `${ed.canvasHeight}px`;
    ed.resizeCanvas(ed.canvas.offsetWidth);
    ed.updateSidebarHeights();
    ed.render();
  }
  const resizer = new ResizeObserver(() => { if (hooked) fit(hooked); });
  resizer.observe(el);

  // The editor hands every wheel turn to the graph canvas (zoom) unless something inside it can scroll. This box can,
  // so the wheel scrolls it - except over the timeline itself, which keeps its own wheel (zoom / pan), and over a text
  // box that has text to scroll.
  el.addEventListener("wheel", (e) => {
    const ed = node._timelineEditor;
    if (ed?.canvas?.contains(e.target)) return;
    const box = e.target.closest?.("textarea");
    if (box && box.scrollHeight > box.clientHeight + 1) return;
    if (el.scrollHeight <= el.clientHeight + 1) return;
    el.scrollTop += e.deltaY;
    e.preventDefault();
    e.stopPropagation();
  }, { capture: true, passive: false });

  /** Widget values of the current timeline, as stored on the clip. */
  function snapshot() {
    const widgets = {};
    for (const w of node.widgets) {
      if (TIMELINE_WIDGETS.includes(w.name) && w.value !== undefined) widgets[w.name] = w.value;
    }
    return { widgets };
  }

  /**
   * Show `snap` (a clip's saved timeline, or null for an empty one) with the clip's length and
   * global prompt.
   */
  async function load(snap, { frames, text }) {
    suppress = true;
    try {
      const props = { ...(snap?.widgets || {}), has_serialized_properties: true, global_prompt: text || "" };
      node.configure({ id: node.id, type: node.type, pos: [0, 0], size: node.size, properties: props, widgets_values: [] });
      await tick(40);
      await setLength(frames);
      await setText(text);
    } finally { suppress = false; }
  }

  /** Make the timeline as long as the clip. */
  async function setLength(frames) {
    const ed = await editor();
    if (!ed || !(frames > 0)) return;
    const was = suppress; suppress = true;
    try {
      ed.syncWidgetsToRetakeDuration(frames);
      ed.updateZoomSliderMax();
      ed.syncWidgetsAndUI();
      ed.syncLayoutToNode();
      fitHeight(ed);
      ed.render();
    } finally { suppress = was; }
  }

  /** Put the clip's global prompt into the timeline (it is stored in timeline_data too). */
  async function setText(text) {
    const ed = await editor();
    if (!ed) return;
    const was = suppress; suppress = true;
    try {
      ed.timeline.global_prompt = text || "";
      node.properties.global_prompt = text || "";
      if (ed.globalPromptInput) ed.globalPromptInput.value = text || "";
      ed.commitChanges(true);
    } finally { suppress = was; }
  }

  /** The segment selected on the main track (its prompt and time window) with every segment's prompt, or null. */
  async function selectedSegment() {
    const ed = await editor();
    if (!ed || ed.selectionType !== "image") return null;
    const segs = ed.timeline.segments || [];
    const index = ed.selectedIndex;
    const seg = segs[index];
    if (!seg || seg.isAnchor) return null;
    const rate = ed.getFrameRate();
    return { index, type: seg.type || "image", prompt: seg.prompt || "",
      start: (seg.start || 0) / rate, end: ((seg.start || 0) + (seg.length || 0)) / rate,
      prompts: segs.map(s => s.prompt || "") };
  }

  /** Set a segment's prompt, as typing it in the editor's own prompt box does. */
  async function setSegmentPrompt(index, text) {
    const ed = await editor();
    const seg = ed?.timeline.segments[index];
    if (!seg) return;
    seg.prompt = text;
    if (ed.promptInput && ed.selectedIndex === index) ed.promptInput.value = text;
    ed.commitChanges();
    ed.render();
  }

  /** Add an image (a File) to the timeline at the playhead, as the editor's own "Add Image" does. */
  async function addImageFile(file) {
    const ed = await editor();
    if (ed) await ed.handleImageUpload([file]);
  }

  /** The editor's toolbar button the studio's own buttons are placed after. */
  async function addImageButton() {
    const ed = await editor();
    return ed?.uploadBtn || null;
  }

  function destroy() {
    try { node.onRemoved?.(); } catch { /* the editor may already be gone */ }
  }

  editor();
  return { el, load, setLength, setText, snapshot, selectedSegment, setSegmentPrompt, addImageFile, addImageButton, destroy, FPS };
}

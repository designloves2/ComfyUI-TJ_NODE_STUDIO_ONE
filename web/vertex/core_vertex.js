// core_vertex.js — Vertex Image ONE STUDIO constants, state, helpers (same shape as the other ONE STUDIO nodes)
export const BRAND = "#7612DA";
export const C = {
  lime: BRAND, bg0: "#0b0b0b", bg1: "#111111", bg2: "#181818",
  bg3: "#222222", border: "#2a2a2a", borderH: "#3c3c3c",
  text: "#dedede", muted: "#565656", dim: "#2e2e2e",
  warn: "#ffb347", err: "#ff6767",
};

export const PREVIEW_SIZE = 640;
export const LEFT_W       = 300;
export const PAD          = 12;
export const SUBFOLDER    = "vertex-image-one-tj";
export const API          = "/tj_vertex";
export const LS_KEY       = "vertex_image_one_state_v1";

// The Vertex OpenAI Proxy app this node talks to (install it, sign in to Google Cloud there, keep it running).
export const PROXY_APP_URL = "https://github.com/designloves2/vertex-openai-proxy";

// Display names for the proxy's image model ids (the id is still what is saved and sent). Unknown ids show as they are.
export const MODEL_NAMES = {
  "gemini-2.5-flash-image":         "Nano Banana 1",
  "gemini-3-pro-image":             "Nano Banana Pro",
  "gemini-3.1-flash-image":         "Nano Banana 2",
  "gemini-3.1-flash-image-preview": "Nano Banana 2 Preview",
  "gemini-3.1-flash-lite-image":    "Nano Banana 2 Lite",
  "gemini-nano-banana-2.1":         "Nano Banana 2.1",
};
export const modelName = id => MODEL_NAMES[id] || id;

export const ASPECTS = ["auto", "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];

export function el(tag, props, children) {
  const node = document.createElement(tag);
  if (props) {
    for (const k in props) {
      if (k === "style") Object.assign(node.style, props.style);
      else if (k === "text") node.textContent = props.text;
      else if (k === "html") node.innerHTML = props.html;
      else if (k.startsWith("on") && typeof props[k] === "function") node.addEventListener(k.slice(2), props[k]);
      else node.setAttribute(k, props[k]);
    }
  }
  if (children) for (const c of children) if (c) node.appendChild(c);
  return node;
}
export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

export function loadState() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; }
}
export function saveState(s) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch {}
}

/** Node (UI) state. Generation settings themselves live on the server (config_vertex.json), shared with the chats. */
export function defaultState(saved) {
  saved = saved || {};
  return {
    mode: "chat",
    prompt:        saved.prompt        || "",
    promptsByMode: saved.promptsByMode || {},
    promptSlots:   saved.promptSlots   || {},
    autoEnhance:   saved.autoEnhance   ?? false,
    outputMode:    saved.outputMode    || "save",
    convId:        saved.convId        || "",     // chat open in this node
    selected:      saved.selected      || null,   // {file, sub} — what the node's IMAGE output gives
    // reference images for the NEXT message (input/ filenames, H3-style slots in the left menu); cleared once sent
    refImages:     Array.isArray(saved.refImages) ? saved.refImages.filter(Boolean).slice(0, 14) : [],
    accordion: Object.assign({ chats: true, refs: true, model: true, image: true, generation: false, grounding: false, history: false },
      saved.accordion || {}),
  };
}

export const MANUAL_TEXT = `Vertex Image ONE STUDIO — chat-style image generation and step-by-step editing with Google's Gemini image models
(Nano Banana family) through the local Vertex OpenAI Proxy (default http://127.0.0.1:3000). Port of the Vertex AI Studio app.

BEFORE YOU START
• Install and run the Vertex OpenAI Proxy app: https://github.com/designloves2/vertex-openai-proxy
  (Releases → download → run). The node talks to it from the ComfyUI server; no GPU work happens in ComfyUI.
  The line above Generate shows whether the proxy is connected (green) or not (red, with the install link).
• Pick an image model in the left menu (MODEL). Nothing is pre-selected.

HOW IT WORKS
• Every chat is a conversation: the first message makes an image, every next message edits the latest result
  ("make the apple green", "add a title in the top left"). The model sees the recent turns and images.
• ↪ Continue from this (on a result in the chat strip): the next message edits that image, even an older one.
• 📎 Attach / paste (Ctrl+V) / drag images onto the prompt: reference images for the next message.
• Compact: summarizes a long chat so it keeps going with a short history (needs a chat model in ⚙ Settings).
  Auto compact runs when the estimated context reaches the % set in HISTORY.
• The node's IMAGE output is the picked result (the latest one unless you click another, ✓ marks it).
  Queue the workflow to pass it on to other nodes.

PROMPT
• Auto Enhance / Refine / Prompt Edit / Prompt Preset / EN·한: same as the other ONE STUDIO nodes (⚙ Settings → LLM).
• Korean prompts work as they are (Gemini reads Korean); the per-node "한글 번역 사용" switch controls auto translation.

GALLERY (🖼)
• Every generated image, with the H3 gallery's tools: ⓘ info, blur/reveal, Select + delete, ←/→/Esc viewer, wheel zoom,
  ↩ Reuse Setting (opens the image's chat and continues from it), Prompt View / Copy, Cache, Tools, Open folder.
• Deleting a gallery image does not break its chat: that turn is sent as a text note instead of the image.

KEYS
• Enter = Generate (or Ctrl+Enter, see HISTORY → Send key). Shift+Enter = new line. Esc closes overlays.

FILES
• Images: output/vertex-image-one-tj/ (original bytes from the model, never re-encoded).
• Chats + attached references: output/vertex-image-one-tj/assets/chats/<id>/ (deleting a chat moves it to the gallery trash).
• Settings: config_vertex.json in the node folder.`;

// H3 side of the Korean <-> English toggle. The model is the shared Translate setting (shared/translate_config.js),
// not the Brief backend; this file only knows what the H3 prompt fields must keep as they are.

/** LoRA trigger words of the node, kept as they are when a prompt is translated. */
export function h3ProtectWords(state) {
  const words = [];
  for (const l of state.loras || []) if (l?.triggerWord) words.push(...String(l.triggerWord).split(/[,\n]/));
  return words.map(w => w.trim()).filter(Boolean);
}

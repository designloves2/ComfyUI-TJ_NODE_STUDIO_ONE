// reflib_limits.js — the attachment limits of a Reference clip (images 9, videos 3, audio 3), read
// from the library's /info so nothing is hard-coded here. An image set counts as one video when its
// set_mode is "video" (the default) and as one image per member when it is "images".
import { reflib } from "./reflib_api.js";

const FALLBACK = { image: 9, video: 3, audio: 3 };
let limits = FALLBACK;
let loading = null;

/** Load (once) and return the limits; callers that cannot await can read `currentLimits()`. */
export function loadLimits() {
  if (!loading) loading = reflib.info().then(r => { if (r?.ok && r.limits) limits = { ...FALLBACK, ...r.limits }; return limits; });
  return loading;
}
export const currentLimits = () => limits;

function weight(a) {
  if (a.kind === "image") return { image: 1 };
  if (a.kind === "video") return { video: 1 };
  if (a.kind === "audio") return { audio: 1 };
  if (a.kind === "set") return a.settings?.set_mode === "images" ? { image: (a.members || []).length } : { video: 1 };
  return {};
}

export function countKinds(assets) {
  const c = { image: 0, video: 0, audio: 0 };
  for (const a of assets) for (const [k, n] of Object.entries(weight(a))) c[k] += n;
  return c;
}

const PLURAL = { image: "images", video: "videos", audio: "audio files" };

/**
 * null when `candidate` can join `current` (asset records), else the English warning the node shows.
 */
export function limitWarning(current, candidate) {
  const have = countKinds(current);
  const add = weight(candidate);
  for (const [k, n] of Object.entries(add)) {
    if (have[k] + n > limits[k]) {
      const noun = PLURAL[k];
      return have[k] >= limits[k]
        ? `${have[k]} ${noun} are already added. To add another one, replace an added asset.`
        : `Adding this would make ${have[k] + n} ${noun}; at most ${limits[k]} are allowed. Remove one first.`;
    }
  }
  return null;
}

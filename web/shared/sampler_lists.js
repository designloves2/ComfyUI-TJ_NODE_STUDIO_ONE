// Sampler / scheduler choices for the image nodes: ComfyUI's own full lists, read once from the
// KSampler node definition (new samplers added to ComfyUI show up without touching this pack).
// The short lists are only a fallback for when /object_info can't be read.
const FALLBACK_SAMPLERS = ["euler", "euler_ancestral", "heun", "dpm_2", "dpm_2_ancestral", "lms", "dpm_fast", "dpm_adaptive",
  "dpmpp_2m", "dpmpp_2m_sde", "dpmpp_sde", "er_sde", "uni_pc", "ddim"];
const FALLBACK_SCHEDULERS = ["simple", "normal", "karras", "exponential", "sgm_uniform", "beta", "ddim_uniform"];

async function readLists() {
  try {
    const r = await fetch("/object_info/KSampler");
    const req = (await r.json()).KSampler.input.required;
    const samplers = req.sampler_name[0], schedulers = req.scheduler[0];
    if (samplers.length && schedulers.length) return { samplers, schedulers };
  } catch { /* use the fallback lists */ }
  return { samplers: FALLBACK_SAMPLERS, schedulers: FALLBACK_SCHEDULERS };
}

const lists = await readLists();
export const SAMPLERS = lists.samplers;
export const SCHEDULERS = lists.schedulers;

# SPEC — studio LLM routes: `tj_llm_progress` events, `call_id`, `usage`, closing-`</think>` rule

Status: node repo `nodes.py` done (needs a ComfyUI restart). Relay with the user's approval ("사용자가 승인했습니다."). Core spec: `C:/AI/AI-One-Studio-Canvers/docs/NODE_SPEC_LLM_LIVE_LOG.md`; core commit `ComfyUI-TJ_NODE 6bba17e` (field names are the core's, unchanged here).

## What the routes do now (`/tj_studio_one/llm/enhance`, `/tj_studio_one/llm/image_to_prompt`, also the server translate route that calls enhance)
- Request: optional `call_id` (string). If missing the server makes `llm-<ms>`. It is echoed in the JSON answer (`call_id`) and in every event.
- **These routes do not stream.** The websocket event `tj_llm_progress` is sent twice per call: `phase: "prompt"` when the call starts, then `phase: "done"` (or `"error"`). Fields as the core: `call_id, backend, model, phase, input_tokens, output_tokens, chars, tok_per_sec, elapsed_ms, delta ("" always), finish_reason (done/error)`, plus **`estimated: true`**.
- `backend` values are the core's names: `"GGUF / llama.cpp"` (route backend `local`), `"ComfyUI TextGenerate"` (`comfy`), `"Open Router"` (`openrouter`), `"Connect Custom"` (`custom`). `model` = the gguf / text-encoder / OpenRouter / custom model the request named (empty if none sent).
- **Token counts are estimates** (~3.5 chars per token Latin, ~1.2 for Hangul/CJK). The real counts stay inside the backends. `input_tokens` is `null` for `image_to_prompt`. Only the core LLM (TJ) node streams real progress; the studio local route still goes through `TJ_PromptEnhancer`, which does not.
- Final JSON gets `usage`: `{ input_tokens, output_tokens, tok_per_sec, elapsed_ms, finish_reason: "stop"|"error", thinking_chars: null, answer_chars, estimated: true }` and `call_id`. `finish_reason: "length"` is not detected here.
- Console: `[TJ_LLM] backend=… model=… in~Ntok out~Ntok time=…s speed~…tok/s finish=…`.
- `</think>` rule: if the reply has `</think>` or `</thinking>` and no opening tag, only the text after the last closing tag is the answer (if nothing follows, the text is left as it was and the old reject rules apply). Applied in `_clean_llm_output` and `_strip_thinking` (`nodes.py`, helper `_after_closing_think`).

## Web / Canvers
- Send `call_id` in the request body; listen for `tj_llm_progress` (match on `call_id`); read `usage` from the answer. Treat `estimated: true` counts as approximate and show them that way (e.g. `~`). No streaming means no `delta`, no live token count between `prompt` and `done`: show "running" and elapsed time.
- Fields are all additions; old clients keep working.

## Rules
Do NOT edit the node repo. One short report per session: ported / not applicable / not verified, files changed.

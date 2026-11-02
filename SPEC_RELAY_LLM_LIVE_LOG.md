# SPEC — studio LLM routes: `tj_llm_progress` events, `call_id`, `usage`, closing-`</think>` rule

Status: node repo `nodes.py` done (needs a ComfyUI restart). Relay with the user's approval ("사용자가 승인했습니다."). Core spec: `C:/AI/AI-One-Studio-Canvers/docs/NODE_SPEC_LLM_LIVE_LOG.md`; core commit `ComfyUI-TJ_NODE 6bba17e` (field names are the core's, unchanged here).

## What the routes do now (`/tj_studio_one/llm/enhance`, `/tj_studio_one/llm/image_to_prompt`, also the server translate route that calls enhance)
- Request: optional `call_id` (string). If missing the server makes `llm-<ms>`. It is echoed in the JSON answer (`call_id`) and in every event.
- **Local GGUF (`backend: local`) `/enhance` and `/image_to_prompt` (text and vision) stream** (same behaviour as the core LLM (TJ) node; a thread-local patch of `Llama.create_chat_completion` in `nodes.py` streams the call and the original answer dict is handed back, so TJ_PromptEnhancer / TJ_ImageToPrompt run unchanged): `tj_llm_progress` about every 0.7 s with `phase` `prompt` -> `thinking`/`answer` -> `done`, a `delta` text piece, real `output_tokens` (one per chunk), real `input_tokens`, `tok_per_sec`, real `finish_reason` (`stop`/`length`), `thinking_chars`, and `estimated: false`. The model, sampling and clean-up are the same as before.
- **Every other route** (OpenRouter, Custom, ComfyUI TextGenerate) does not stream (remote APIs are fast; ComfyUI's native TextGenerate has no streaming hook): `tj_llm_progress` is sent twice per call: `phase: "prompt"` when the call starts, then `phase: "done"` (or `"error"`). Fields as the core: `call_id, backend, model, phase, input_tokens, output_tokens, chars, tok_per_sec, elapsed_ms, delta ("" always), finish_reason (done/error)`, plus **`estimated: true`**.
- `backend` values are the core's names: `"GGUF / llama.cpp"` (route backend `local`), `"ComfyUI TextGenerate"` (`comfy`), `"Open Router"` (`openrouter`), `"Connect Custom"` (`custom`). `model` = the gguf / text-encoder / OpenRouter / custom model the request named (empty if none sent).
- **Token counts of the non-streaming routes are estimates** (~3.5 chars per token Latin, ~1.2 for Hangul/CJK). The real counts stay inside the backends. `input_tokens` is `null` for `image_to_prompt`. Only the core LLM (TJ) node and the local GGUF routes stream real progress.
- Final JSON gets `usage`: `{ input_tokens, output_tokens, tok_per_sec, elapsed_ms, finish_reason: "stop"|"error", thinking_chars: null, answer_chars, estimated: true }` and `call_id`. `finish_reason: "length"` is not detected here.
- Console: `[TJ_LLM] backend=… model=… in~Ntok out~Ntok time=…s speed~…tok/s finish=…`.
- `</think>` rule: if the reply has `</think>` or `</thinking>` and no opening tag, only the text after the last closing tag is the answer (if nothing follows, the text is left as it was and the old reject rules apply). Applied in `_clean_llm_output` and `_strip_thinking` (`nodes.py`, helper `_after_closing_think`).

## Studio node UI (node repo only, web may mirror)
- `web/shared/llm_live.js`: a fixed line at the bottom-left of the page for every `tj_llm_progress` call (any `call_id`): `<phase> · N tok · X tok/s · S초` (backend and model in front only when several calls run at once); phases reading input / thinking / writing / done / error; `~` before estimated numbers; seconds keep ticking locally; `cut off (max tokens)` when `finish_reason` is `length`; `no change for 30 s` for a streaming call that went quiet; done stays 5 s, error 8 s; at most 3 lines. Mirror it in the web if wanted (the web has no such UI).

## Web / Canvers
- Send `call_id` in the request body; listen for `tj_llm_progress` (match on `call_id`); read `usage` from the answer. Treat `estimated: true` counts as approximate and show them that way (e.g. `~`). No streaming means no `delta`, no live token count between `prompt` and `done`: show "running" and elapsed time.
- Fields are all additions; old clients keep working.

## Rules
Do NOT edit the node repo. One short report per session: ported / not applicable / not verified, files changed.

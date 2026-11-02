# SPEC — studio LLM routes: `tj_llm_progress` events, `call_id`, `usage`, closing-`</think>` rule

Status: node repo `nodes.py` done (needs a ComfyUI restart). Relay with the user's approval ("사용자가 승인했습니다."). Core spec: `C:/AI/AI-One-Studio-Canvers/docs/NODE_SPEC_LLM_LIVE_LOG.md`; core commit `ComfyUI-TJ_NODE 6bba17e` (field names are the core's, unchanged here).

## What the routes do now (`/tj_studio_one/llm/enhance`, `/tj_studio_one/llm/image_to_prompt`, also the server translate route that calls enhance)
- Request: optional `call_id` (string). If missing the server makes `llm-<ms>`. It is echoed in the JSON answer (`call_id`) and in every event.
- **Local GGUF (`backend: local`) `/enhance` and `/image_to_prompt` (text and vision) stream** (same behaviour as the core LLM (TJ) node; a thread-local patch of `Llama.create_chat_completion` in `nodes.py` streams the call and the original answer dict is handed back, so TJ_PromptEnhancer / TJ_ImageToPrompt run unchanged): `tj_llm_progress` about every 0.7 s with `phase` `prompt` -> `thinking`/`answer` -> `done`, a `delta` text piece, real `output_tokens` (one per chunk), real `input_tokens`, `tok_per_sec`, real `finish_reason` (`stop`/`length`), `thinking_chars`, and `estimated: false`. The model, sampling and clean-up are the same as before.
- **ComfyUI TextGenerate (`backend: comfy`)** reports the generated token count live (read from ComfyUI's `comfy.utils.ProgressBar` while the route runs): events about every 0.7 s with `phase: "answer"`, real `output_tokens`, `tok_per_sec`, `estimated: false`, no `delta` text, `input_tokens` null, `finish_reason: "length"` when the count reached `max_tokens`. (The native translator that runs in the page through the queue uses ComfyUI's own progress bar.)
- **Every other route** (OpenRouter, Custom; remote APIs are fast) does not stream: `tj_llm_progress` is sent twice per call: `phase: "prompt"` when the call starts, then `phase: "done"` (or `"error"`). Fields as the core: `call_id, backend, model, phase, input_tokens, output_tokens, chars, tok_per_sec, elapsed_ms, delta ("" always), finish_reason (done/error)`, plus **`estimated: true`**.
- `backend` values are the core's names: `"GGUF / llama.cpp"` (route backend `local`), `"ComfyUI TextGenerate"` (`comfy`), `"Open Router"` (`openrouter`), `"Connect Custom"` (`custom`). `model` = the gguf / text-encoder / OpenRouter / custom model the request named (empty if none sent).
- **Token counts of the non-streaming routes are estimates** (~3.5 chars per token Latin, ~1.2 for Hangul/CJK). The real counts stay inside the backends. `input_tokens` is `null` for `image_to_prompt`. Only the core LLM (TJ) node and the local GGUF routes stream real progress.
- Final JSON gets `usage`: `{ input_tokens, output_tokens, tok_per_sec, elapsed_ms, finish_reason: "stop"|"error", thinking_chars: null, answer_chars, estimated: true }` and `call_id`. `finish_reason: "length"` is not detected here.
- Console: `[TJ_LLM] backend=… model=… in~Ntok out~Ntok time=…s speed~…tok/s finish=…`.
- `</think>` rule: if the reply has `</think>` or `</thinking>` and no opening tag, only the text after the last closing tag is the answer (if nothing follows, the text is left as it was and the old reject rules apply). Applied in `_clean_llm_output` and `_strip_thinking` (`nodes.py`, helper `_after_closing_think`).

## Studio node UI (node repo only, web may mirror)
- `web/shared/llm_live.js`: a fixed line at the bottom-left of the page for every `tj_llm_progress` call (any `call_id`): `<phase> · N tok · X tok/s · S초` (backend and model in front only when several calls run at once); phases reading input / thinking / writing / done / error; `~` before estimated numbers; seconds keep ticking locally; `cut off (max tokens)` when `finish_reason` is `length`; `no change for 30 s` for a streaming call that went quiet; done stays 5 s, error 8 s; at most 3 lines. Mirror it in the web if wanted (the web has no such UI).

## Native (ComfyUI TextGenerate) graphs queued by the page — same live line
- These do not use the studio routes: the page posts a graph (CLIPLoader -> TextGenerate -> ...) to `/prompt` (native translate, native brief / image analysis, MusicMaker). ComfyUI sends the standard `progress` event ({value, max, prompt_id, node}) once per generated token.
- `web/shared/llm_live.js` (`wireNative`): wraps `api.fetchApi`; on a POST to `/prompt` whose graph has a `TextGenerate` node it reads the answer's `prompt_id`, remembers `{ TextGenerate node id -> max_length, model = the CLIPLoader's clip_name }`, shows a line `reading input` at once, then on each `progress` event with that prompt_id and node shows `writing · N tok · X tok/s · S초` (X = N / elapsed, computed in the page). `execution_success` -> `done`, `execution_error` / `execution_interrupted` -> `error`. `finish_reason: length` (shown as cut off) when value reached max_length. Backend label `ComfyUI TextGenerate`; call id `native-<prompt_id>`.
- A web app that queues its own TextGenerate graphs does the same on its own `/prompt` calls and its websocket `progress` events.

## Web / Canvers
- Send `call_id` in the request body; listen for `tj_llm_progress` (match on `call_id`); read `usage` from the answer. Treat `estimated: true` counts as approximate and show them that way (e.g. `~`). No streaming means no `delta`, no live token count between `prompt` and `done`: show "running" and elapsed time.
- Fields are all additions; old clients keep working.

## Rules
Do NOT edit the node repo. One short report per session: ported / not applicable / not verified, files changed.

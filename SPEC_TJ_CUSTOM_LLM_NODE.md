# SPEC — TJ Custom LLM node (for ComfyUI-TJ_NODE)

Status: DRAFT v1, written by the STUDIO_ONE session at the user's request. TJ_NODE owns the
implementation. Nothing here has been built yet.

## 1. Goal
One standalone ComfyUI node in ComfyUI-TJ_NODE that talks to **any OpenAI-compatible Chat
Completions server** (LM Studio, Ollama, llama.cpp, a gateway/proxy such as the user's
`http://localhost:3000/v1`). It is the canvas-graph twin of the "Connect Custom" backend that
STUDIO_ONE already has in every LLM picker, so a plain workflow can use the same server.

## 2. Reference implementation (STUDIO_ONE `nodes.py`, ~L5116-5240; copy the behaviour)
- `_h3_custom_base(role, base_url)`: strips a trailing `/chat/completions` or `/chat`; scheme must be
  http/https; **public hosts require HTTPS, plain HTTP only for loopback / private / link-local**
  (resolved with getaddrinfo; ALL resolved addresses must qualify). Errors are plain `ValueError` text.
- `_h3_custom_request(...)`: `Authorization: Bearer <key>` only when a key is set; JSON; errors map to
  `HTTP <code>: <message>` / `cannot reach <base>: <reason>`.
- `_h3_custom_chat(...)`: POST `<base>/chat/completions` with `{model, messages:[system,user],
  temperature, max_tokens}`; `max_tokens = max(256, min(max_tokens, context//2))` when a context size is
  known; accepts string or list-of-parts `content`; strips thinking blocks (`_strip_thinking`); empty
  reply = error.
- Connect test: GET `<base>/models` → ids (first 200); if no `/models` route and a model is set, a tiny
  `ping` chat (max_tokens 8) proves URL+key+model.
- Vision: user content = `[{"type":"text",...},{"type":"image_url","image_url":{"url":"data:image/jpeg;base64,..."}}]`.

## 3. Node (proposal; TJ_NODE may rename)
`TJ_CustomLLM`, category "TJ/LLM", output node = no.

Inputs
| name | type | default | note |
|---|---|---|---|
| `api_base` | STRING | `http://localhost:3000/v1` | validated as above |
| `model` | STRING | `gemini-3.7-flash` | free text; a "Connect & test" button fills a datalist/combo from `/models` |
| `api_key` | STRING | empty | **never saved into the workflow JSON** (see §4); a proxy that injects the key accepts empty or `0000` |
| `system_prompt` | STRING multiline | empty | |
| `prompt` | STRING multiline (also linkable) | | link-capable: declare `("*",{...})`/not `forceInput` STRING to avoid the widgets_values shift you found |
| `images` | IMAGE (optional) | | batch → one `image_url` part per image, JPEG, long edge capped by `max_image_px` |
| `context` | INT | 0 | known context window; 0 = unknown |
| `max_tokens` | INT | 2000 | |
| `temperature` | FLOAT | 0.7 | |
| `max_image_px` | INT | 1024 | downscale only |
| `strip_thinking` | BOOLEAN | true | |
| `seed`/`cache` | | | do NOT cache by default (LLM output is non-deterministic): `IS_CHANGED` returns NaN unless an optional `cache_same_input` BOOLEAN (default false) is on |

Outputs: `text` (STRING), `info` (STRING: model used, ms, tokens if the server reports usage).

## 4. API key handling (follow STUDIO_ONE's rule)
Keep the key **in server memory only, never written to disk, never in workflow JSON, never echoed
back to the page**. Widget value for `api_key` must be excluded from serialisation (non-serialised
DOM widget) or replaced by a "stored" flag. A route like `POST /tj_node/custom_llm/connect
{role?, base_url, api_key?, model?}` stores it per node id/role and returns
`{ok, models, modelFound, ms, keyStored}`. If TJ_NODE already shares a key store with PromptDB/other
nodes, reuse it. After a ComfyUI restart the key is gone — the node must say "press Connect & test"
rather than failing with a bare 401.

## 5. Settings sync with STUDIO_ONE (optional, ask the user)
STUDIO_ONE stores image-node LLM settings on the server (`GET/POST /tj_shared/llm_settings`,
`studio_llm_settings.json`, flat str/num/bool, no keys). The node could offer a "use shared defaults"
button that reads `custom_base_*`/`custom_model_*`/`custom_ctx_*` from there so the user does not
retype URL/model. Not required for v1.

## 6. Errors and UX
Plain-text errors, one line, actionable: unknown host, HTTPS required, 401 (key), 404 (wrong path or
model), timeout (180 s chat / 15 s models), empty reply. Long calls must not block the event loop
(run in an executor like the reference code).

## 7. Acceptance
1. Empty key against `http://localhost:3000/v1` + `gemini-3.7-flash` returns text.
2. Public `http://` host is refused; `https://` public host allowed.
3. Image batch of 1, 2, 3+ produces matching `image_url` parts; reply references them.
4. Saved workflow JSON contains no key.
5. Linked `prompt` input survives save/load without shifting widget values.
6. Thinking blocks stripped; empty reply surfaces an error.

## 8. Not in scope
Streaming, tool calling, embeddings, non-OpenAI-shaped APIs, per-model presets.

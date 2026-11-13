# SPEC RELAY — H3 Image Generator (공식 노드) · 네이티브 LLM 옵션 (웹 / Canvers 전달용)

상태: 노드(이 저장소)에 구현 완료, **릴리즈 전**(`## Unreleased`). Node Skin 변경은 포함하지 않음(전달 제외). 이전 명세 `SPEC_RELAY_VSR_UPSCALERS.md`(ReCaVSR/RelayVSR)도 같이 전달 대상.
서버(`nodes.py`) 변경은 같은 ComfyUI 서버라 포팅 불필요, **ComfyUI 재시작만** 필요(설정 키, `h3_image_formats.json`, 가용성 목록).
검증: T2I·R2I 그래프를 이 PC에서 직접 큐에 넣어 오류 없이 이미지 생성 확인. 화면(UI) 시험은 안 함.

## 1. H3 Image Generator — T2I / R2I만 공식 노드로 교체 (Character Sheet 변경 금지)
`web/minimax/graph_builder_minimax.js` `buildOfficialImageGraph(state, avail, opts)` (기존 `buildImageGenGraph`는 Character Sheet용으로 그대로 둠).
노드 id 접두 `IMGO:`. 그래프:
1. `UNETLoader` `{unet_name, weight_dtype:"default"}` → (사용자 LoRA 체인 `buildImageLoraChain`, 기존 그대로) → model
2. `CLIPLoader` `{clip_name, type:"minimax", device:"default"}`, `VAELoader` `{vae_name}`
3. (R2I) 참조 이미지 i(최대 9): `LoadImage` → (MP>0이면) `ResizeImageMaskNode` `{input, resize_type:"scale total pixels", "resize_type.megapixels":MP, scale_method:"area"}` → `ResizeImageMaskNode` `{resize_type:"scale to multiple", "resize_type.multiple":32, scale_method:"area"}` → 조건 노드의 `images.image_<i>` (i는 0부터)
4. `MiniMaxH3ImageConditioning` `{clip, vae, prompt, width, height, "images.image_0":…}` → 출력0 positive, 출력1 latent
5. `ConditioningZeroOut` `{conditioning:[cond,0]}` → negative
6. `KSampler` `{model, positive, negative, latent_image:[cond,1], seed, steps(기본 6), cfg:1, sampler_name:"euler", scheduler:"simple", denoise:1}`
7. `VAEDecode` → `SaveImage` (미리보기 없음: 한 번에 한 패스)
- 모델: T2I `imgUnetT2i`(없으면 `unetFirstLast`), R2I `imgUnetRef2i`(없으면 `unetReference`), CLIP `imgClip`(없으면 `clipName`), VAE `imgVae`(없으면 `vaeVideo`). 비어 있으면 오류 문구를 던짐.
- 가용성 목록(**두 곳 모두**: `nodes.py` `MMH3_OPTIONAL_NODES`, `web/minimax/api_minimax.js` `MMH3_OPTIONAL_NODES`)에 `MiniMaxH3ImageConditioning`, `ConditioningZeroOut`, `ResizeImageMaskNode` 추가.
- UI(`renderImageGenLeft`): T2I/R2I에서 Latent(Basic/Fizgig)·Turbo·2nd Pass·Preview MP·Save Preview·👁 Preview 버튼을 숨기거나 제거. 해상도는 `Aspect` + 단일 `MP`(= `imgFinalMp`), 아래에 계산된 해상도 표시 `→ W × H px (x.xx MP, multiples of 32)`(`resolveResolution` 결과). `Steps` 칸(`imgOfficialSteps`, 기본 6) 추가. 참조 이미지별 MP(`imgRefImagesMp`, 0 = 원본 그대로) 유지.
- 상태 키(`core_minimax.js` defaultState): `imgOfficialSteps`(6), `imgUnetT2i`, `imgUnetRef2i`, `imgClip`, `imgVae`, `imgAutoEnhance`(false). `imageGenSubModeReady`는 이미지 전용 모델을 우선 확인.
- 설정(⚙ Settings → H3 Model, 패널 "Image Generator models — Text to Image / Reference to Image only"): MODEL·Text to Image, MODEL·Reference to Image, CLIP (type=minimax), VAE. 안내문: "Used only by the Image Generator's Text to Image and Reference to Image (the official MiniMax H3 Image nodes). Leave a field at none to use the video model set above. Character Sheet always uses the video models."
- 설정 파일 키(`/minimax_h3_one/config` 저장·읽기, `_mmh3_config_response`에 추가): `img_unet_t2i`, `img_unet_ref2i`, `img_clip`, `img_vae`.
- 이미지 메타(재사용)에 `imgOfficialSteps` 저장·복원.
- **Auto Enhance** 체크박스 + **🔧 Refine** 버튼을 T2I/R2I 프롬프트 머리줄에 복원(Character Sheet 제외). Auto Enhance: Generate 직전 Prompt Enhance 실행 후 프롬프트 칸을 결과로 교체(모델 포맷은 모드에 맞게 자동 선택).

## 2. 시스템 프롬프트 = Model Format (모드 따라 자동 선택)
- 파일 `h3_image_formats.json`(저장소 루트): 키 `"MiniMax H3 Image (T2I)"`, `"MiniMax H3 Image (R2I)"` → 값은 ComfyUI 템플릿 `image_minimax_h3_image_t2i/_r2i`의 시스템 프롬프트 + 긴 규칙 본문(끝의 `input_text: {input text}` 줄 제외). 원본 워크플로: `C:\Users\desig\Downloads\image_minimax_h3_image_*.json`.
- `nodes.py`: `_local_model_formats()`, `_extract_expanded_caption()`, `/tj_studio_one/llm/enhance`에서 위 포맷이면 `system_override`로 처리하고 결과 JSON의 `expanded_caption`만 반환. `/tj_studio_one/llm/models`의 `model_formats`에 두 이름 추가. `/tj_studio_one/llm/image_to_prompt`는 이 포맷이 오면 `"Universal Natural Language"`로 바꿈.
- `web/shared/llm_panel.js` `attachLLMPanel`의 `defaultModelFormat`이 문자열 또는 함수 허용, 반환값에 `syncFormat()`(모드 전환 시 강제 적용) 추가. H3: `defaultModelFormat: () => imageGenMode==="ref2i" ? "MiniMax H3 Image (R2I)" : imageGenMode==="t2i" ? "MiniMax H3 Image (T2I)" : ""`, 모드 버튼 클릭 때 `syncFormat()` 호출.

## 3. ComfyUI 네이티브 "Generate Text" 상세 옵션 (모든 노드의 LLM 설정)
- 신규 `web/shared/native_llm_opts.js`: 저장(localStorage `tj_native_llm_opts_v1`, 모든 노드 공유) 기본값 `max_length 2048, sampling on, temperature 0.7, top_k 64, top_p 0.95, min_p 0.05, repetition_penalty 1.05, presence_penalty 0, seed 0, thinking false, use_default_template true, mtp "auto"`. `nativeGenNode(clipRef, prompt, {images, maxLength, system})`(비동기): `/object_info/TextGenerateV2`가 있으면 `TextGenerateV2`(이미지 `images.image1`, `sampling_mode.presence_penalty` 포함), 없으면 `TextGenerate`. `mountNativeLLMOptions(parent, {skip})`: 설정 블록(제목 "ComfyUI native — Generate Text details").
- 사용처: `api_minimax.js`/`api_ltx25.js`의 `analyzeImagesNative`·`writeBriefNative`(max_length 1024/2048은 저장값과 큰 쪽), `one_node_music.js` ComfyUI 백엔드, 번역 native(`translation_settings.js` → `writeBriefNative`). `llm_live.js`는 `TextGenerateV2`도 인식.
- 표시 규칙: 이미지 노드 LLM 탭(`llm_panel.js` `mountLLMSettingsSection`)은 **GGUF(로컬) 역할이 있으면 GPU Layers/n_ctx/최대 토큰/Temperature/Seed 한 줄**, **Comfy native 역할이 있으면 위 블록(Seed 포함, 서로 별개)**, OpenRouter/Custom만이면 둘 다 숨김(`updateAdvVisibility`). native일 때 Enhance·Write·Refine 요청의 `max_tokens`/`temperature`/`seed`는 블록 값(`nativeNums`). H3/LTX "LLM Setting" 탭은 Brief/Vision 중 하나라도 Native일 때만 블록 표시(`refreshNativeOpts`).
- 한계: 이미지 노드 Enhance는 서버가 TJ_NODE의 Prompt Enhancer를 호출하므로 top_k·top_p·min_p·repetition/presence_penalty·thinking·mtp는 거기 적용되지 않음(TJ_NODE 쪽 요청 필요).
- 알려진 문제(미수정): `nodes.py` MusicMaker 서버 native 경로(약 6270행)가 `sampling_mode`를 문자열로 넘김.

## 4. 포스트프로세스/LTX Preview 버튼 색 (노드 전용, 웹 영향 없음)
Node Skin 관련이므로 전달하지 않음.

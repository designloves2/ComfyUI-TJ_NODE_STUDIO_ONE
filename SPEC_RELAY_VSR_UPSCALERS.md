# SPEC RELAY — H3 Upscale: ReCaVSR · RelayVSR (웹 / Canvers 전달용)

상태: 노드(이 저장소)에 구현·시험 완료, **릴리즈 전**(`## Unreleased`). 웹/Canvers에는 **아직 전달하지 않음** — 사용자 승인 후 전달.
서버 라우트(`nodes.py`)는 같은 ComfyUI 서버라 포팅이 필요 없고 **ComfyUI 재시작만** 필요하다(설정 키·가용성 목록 추가).

## 1. 무엇이 추가됐나
MiniMax H3의 Upscale 방식 2개: **ReCaVSR**(커스텀 팩 `ComfyUI-ReCaVSR`), **RelayVSR**(ComfyUI 코어 노드).
쓰이는 곳: ① 왼쪽 패널 **Upscale** 섹션(클립마다 인라인), ② **Postprocess → C. Upscale**(2-pass의 1단계로도 가능).
갤러리의 ⬆ Upscale 막대는 **바꾸지 않았다**.

## 2. 그래프 (정확한 노드/입력)
**ReCaVSR** — `web/minimax/graph_builder_minimax.js` `buildReCaVSR(g, ids, p, images, fps, avail)`
1. `ReCaVSRLoader` `{ transformer }` (예: `transformer_int8_convrot.safetensors`, 폴더 `models/recavsr`)
2. (디코더 `vae`일 때만) `VAELoader` `{ vae_name }` → `vae` 입력
3. `ReCaVSRUpscale` `{ model:[load,0], images, scale, color_fix, seed, decoder, kernels, kv_offload, encoder, fps[, vae] }` → **VIDEO**
4. `GetVideoComponents` `{ video:[upscale,0] }` → `images`(출력 0)를 이후 단계로 넘김(소리는 원래 클립 것을 그대로 씀)
- 값 범위: `scale` 0.5~8(0.25 단위, 기본 2) · `color_fix` none|adain|wavelet(기본 wavelet) · `decoder` flashdecoder|vae · `kernels` fast|exact · `kv_offload` bool(기본 false) · `encoder` auto|hevc nvenc|h264 nvenc|h264 · `seed` 정수(기본 42) · `fps` 24.
- 필요한 가용성 노드: `ReCaVSRLoader`, `ReCaVSRUpscale`, `GetVideoComponents`. 없으면 그래프 빌드에서 오류를 던진다(조용히 건너뛰지 않음).

**RelayVSR** — `buildRelayVSR(g, ids, p, images, avail)`
1. `UNETLoader` `{ unet_name, weight_dtype:"default" }` (예: `Upscale\relayvsr_x2_lightx2v_int8_convrot.safetensors`)
2. `RelayVSRConditioning` `{ model:[unet,0], images }` → positive(0), latent(1)
3. `KSampler` `{ model:[unet,0], positive:[cond,0], negative:[cond,0], latent_image:[cond,1], seed:랜덤, steps:1, cfg:1, sampler_name:"euler", scheduler:"simple", denoise:1 }`
4. `VAELoader` `{ vae_name }` (예: `relayvsr_flash_vae_x2_fp32.safetensors`)
5. `VSRDecode` `{ vae, samples:[sampler,0], images, detail:1 }` → IMAGE
- 옵션 없음(배율은 모델이 정함: x2 파일 2배, x4 파일 4배). **16GB VRAM에서는 x2 쌍만 실용적, x4는 어려움** → UI에서 x4 UNET을 고르면 경고.
- 가용성 노드: `RelayVSRConditioning`, `VSRDecode`.

연결 위치: 인라인은 `buildClipGraph`의 upscale 분기(`up === "recavsr" | "relayvsr"`), Postprocess는 `buildPostprocessGraph`의 C. Upscale 분기. 노드 id는 `MM:recavsr_*` / `MM:relayvsr_*`(인라인), `PPX:…`(Postprocess). 클립 메타 `upscale`에는 `{method:"recavsr", scale, colorFix, decoder, kernels, kvOffload, encoder, seed, transformer}` / `{method:"relayvsr", model, vae}`를 기록.

## 3. 상태 키 (`web/minimax/core_minimax.js` `defaultState`)
`upscaleMode`에 `"recavsr"`, `"relayvsr"` 값 추가(`UPSCALE_MODES`).
`recavsrScale`(2) · `recavsrColorFix`("wavelet") · `recavsrSeed`(42) · `recavsrDecoder`("flashdecoder") · `recavsrKernels`("fast") · `recavsrKvOffload`(false) · `recavsrEncoder`("auto")
모델: `recavsrTransformer` · `recavsrVae` · `relayvsrUnet` · `relayvsrVae`(모두 기본 "").
상수: `RECAVSR_COLOR_FIX`, `RECAVSR_DECODERS`, `RECAVSR_KERNELS`, `RECAVSR_ENCODERS`.

## 4. 서버 (`nodes.py`)
- `GET/POST /minimax_h3_one/config`: 키 `recavsr_transformer`, `recavsr_vae`, `relayvsr_unet`, `relayvsr_vae` 추가(`_mmh3_config_response`). POST는 기존처럼 dict 병합.
- `GET /minimax_h3_one/models`: `recavsr_models`(폴더 `recavsr`, 없으면 `models/recavsr`) 추가. UI는 `transformer`가 이름에 든 파일만 보여 준다. RelayVSR UNET/VAE는 기존 `diffusion_models` / `vaes` 목록에서 이름에 `relayvsr`가 든 것만 보여 준다.
- `MMH3_OPTIONAL_NODES`(와 `web/minimax/api_minimax.js`의 같은 목록 — **두 곳 모두**)에 `ReCaVSRLoader`, `ReCaVSRUpscale`, `RelayVSRConditioning`, `VSRDecode`, `GetVideoComponents` 추가.

## 5. UI (영어 문구 그대로)
**Settings → UpScale Model**(`ui_app_settings_minimax.js`, `upscaleModelTab`) — 두 패널:
- `Video upscalers — RelayVSR`: `RelayVSR UNET`, `RelayVSR VAE` + 안내(“Pick the matching pair: x2 UNET with x2 VAE. On a 16GB VRAM card only the x2 model is practical — the x4 model is hard to run there.”) + 다운로드 경로.
- `Video upscalers — ReCaVSR`: `ReCaVSR transformer`, `Wan 2.2 VAE (only for Decoder = vae)` + 다운로드 경로.
다운로드: RelayVSR = HF `Comfy-Org/RelayVSR`(`diffusion_models/relayvsr_x2_lightx2v_int8_convrot.safetensors` → `models/diffusion_models/`, `vae/relayvsr_flash_vae_x2_fp32.safetensors` → `models/vae/`, x4 쌍 `relayvsr_x4_int8_convrot.safetensors` + `relayvsr_flash_vae_x4_fp32.safetensors`). ReCaVSR = `models/recavsr/`에 transformer(`transformer_int8_convrot.safetensors` 6.27GB: `PedroMarinhoDev/ReCaVSR-ComfyUI`의 `recavsr/` 폴더, 또는 bf16 `transformer.safetensors` 10.6GB: `kopper/ReCaVSR`) + `prompt.safetensors` + `flashdecoder.safetensors`(kopper/ReCaVSR). 디코더 `vae`는 `models/vae/wan2.2_vae.safetensors`.

**옵션 패널**(`one_node_minimax_h3.js` `vsrOptionRows(kind)` — 왼쪽 Upscale과 Postprocess C. Upscale이 공유): ReCaVSR = `Scale (×)`, `Color fix`, `Decoder`, `Kernels`, `Encoder`, `Seed`, `KV offload`(체크박스) + 선택된 모델 표시 + 팩 미설치 경고. RelayVSR = 선택된 UNET/VAE 표시 + x4 경고 + 설명.
Postprocess 방식 드롭다운 순서: Latent Upscale (Use H3) · FlashVSR · **ReCaVSR** · **RelayVSR** · LTX 2.5 Upscale · RTX VSR(TJ) · Model.

## 6. 설치 / 문서
`install_requirements.bat`(REPOS[30], ALT[30]=comfyui-recavsr, COUNT=31) / `.sh`, `dependency_check.py`(선택 팩 목록)에 `https://github.com/PedroMarinhoDev/ComfyUI-ReCaVSR` 추가. 모델 가중치는 스크립트가 받지 않는다(README/매뉴얼에 경로 안내).

## 7. 시험 결과 (이 PC, 2026-11-13)
Postprocess → C. Upscale, 소스 1440×832 24fps 클립의 1초 미리보기: ReCaVSR(int8, scale 2, wavelet, flashdecoder, fast, auto) → 2880×1664 오류 없음 · RelayVSR(x2 쌍) → 2880×1664, 24프레임 오류 없음. 인라인(왼쪽 패널) 경로는 UI 표시까지만 확인했고 클립 전체 생성 실행은 하지 않았다.

# CHANGELOG — ComfyUI-TJ_NODE_STUDIO_ONE

---

## v1.7.0 (2026-07-19)

### 🧪 Krea 2 ONE STUDIO — 실험적 기능 추가 (Experimental features)

> ⚠️ **아래 기능은 실험적이며 오류가 발생할 수 있습니다. 외부 커스텀 노드 + 별도 LoRA가 필요합니다.**  
> **These features are experimental and may produce errors. They require external custom nodes + separate LoRAs.**

**IDENTITY 탭 추가 (instruction-based identity edit)**
- `comfyui-krea2edit`(`Krea2EditModelPatch` · `Krea2EditGroundedEncode`) + `krea2_identity_edit_v1_2` LoRA 사용
- 소스 이미지 + 선택적 2번째 레퍼런스(인물→장면), `ref_boost`(정체성 강도) · `grounding_px` · `fit_mode` 조절
- IDENTITY LoRA는 ⚙ Settings에서 **한 번만 등록**

**ControlNet — Depth / Canny 추가**
- **Depth**: `comfyui-krea2-controlnet`(Krea2 Control LoRA) + `DepthAnythingV2Preprocessor`. 구도·프레이밍·스케일 위주(세밀한 포즈는 느슨)
- **Canny**: `ComfyUI-NK2E`(in-context) + `CannyEdgePreprocessor`. 윤곽선 정밀 — 포즈·얼굴 방향·실루엣 재현
- 사이드 메뉴에서 **Depth/Canny 선택**, 업로드 사진을 자동 전처리, **생성 전 depth/canny 맵 미리보기** 버튼
- 컨트롤 이미지 비율에 맞춰 **롱엣지 기준 출력 크기 자동 정렬**(center-crop 왜곡 방지)
- ⚙ Settings에는 **LoRA 파일만 등록**, strength·임계값·depth 모델·해상도·channel/normalize/invert 등 **모든 조절값은 사이드 메뉴에서** 직접 제어
- depth 전처리 모델은 첫 사용 시 `depth_anything_v2_vitl.pth` 자동 다운로드 (vitg/Giant는 저장소 비공개로 미지원)

> ⚠️ depth·canny는 **LoRA 기반**이라 픽셀 단위로 정확하지 않습니다. 정확한 포즈엔 Canny, 대략적 구도엔 Depth를 권장합니다.

### 설치 / Install
- `install_requirements` 스크립트에 `comfyui-krea2edit`, `ComfyUI-NK2E` 추가 및 LoRA 다운로드 안내 출력
- README에 실험적 기능·필수 노드·모델 다운로드 위치 문서화

---

## v1.6.0 (2026-07-14)

### Bug Fixes & Improvements

**Drag-and-drop image upload — 전체 노드 적용**
- Klein, Z-Image의 `createImageUpload` 컴포넌트에 드래그앤드롭 지원 추가
- I2I, Inpaint, Upscale, Edit, Faceswap, ControlNet, Face Redraw, Outpaint, RE-BG 등 모든 이미지 업로드 영역에 동시 적용
- 드롭 시 보더 하이라이트(브랜드 컬러) 시각 피드백 포함
- (QE2511, Krea2 I2I는 기존에 지원 중이었음)

**I2I 출력 사이즈 입력 + 비율 잠금 (전체 노드)**
- I2I 소스 이미지 아래 W / H 출력 사이즈 입력 필드 추가 (8px 스냅)
- 이미지 업로드/드롭 시 원본 해상도가 W / H에 자동 입력
- 🔒 Lock ratio 체크박스 (기본 ON): 한쪽 값 변경 시 비율 유지하며 다른 쪽 자동 조정
- 사용자가 사이즈 지정 시 그래프에 `ImageScale (lanczos)` 노드를 삽입해 리사이즈 처리
- Klein / Z-Image / QE2511 / Krea2 모두 적용

**I2I 해상도 경고**
- I2I 소스 이미지 업로드 후 모델 권장 최대 해상도 초과 시 경고 표시
  - Klein (Flux.2 Klein): ~2MP 초과 시 경고
  - Z-Image Turbo: ~1MP 초과 시 경고
  - QE2511 (Qwen2.5): ~1.6MP 초과 시 경고
  - Krea2: ~4MP 초과 시 경고
- 프리셋 방식 아님 — 경고만 표시, 생성 차단 없음

**Inpaint → I2I 프롬프트 캐리오버 수정**
- Inpaint 모드에서 작성한 프롬프트가 I2I / 다른 모드로 전환 시 그대로 사용되는 버그 수정
- `getModePrompt`가 처음 방문하는 모드의 키를 `""` 로 초기화하도록 수정
- 모든 노드(Klein, Z-Image, QE2511, Krea2) 적용

**Krea2 ControlNet — T2I 추가 + 전용 LoRA를 Settings에서 사전 설정**
- 기존 I2I에만 있던 ControlNet을 T2I에도 추가 (동일 파이프라인)
- ControlNet 전용 Control LoRA + 처리 파라미터(strength / channel_mode / normalize / invert)를 ⚙ Settings에서 미리 설정·저장 → T2I·I2I가 공유
  - LoRA 종류에 따라 파라미터가 정해지므로 전역 설정이 편리 (Depth: Grayscale+MinMax / Canny·Pose: RGB+None)
  - `config_krea2.json`에 영속 저장되어 재시작 후에도 유지
- T2I/I2I 패널에는 ON/OFF 토글 + 컨트롤 이미지 업로드만 표시 (LoRA는 Settings 값 사용)
- T2I는 `EmptyLatentImage` 크기에 맞춰 컨트롤 이미지를 인코딩

**Krea2 ControlNet 감사의 말 추가**
- README.md · PROMO.md Acknowledgements 섹션에 아래 크레딧 추가:
  - Krea-2-controlnet (Tanmaypatil123) — 파이프라인 문서화
  - Patil/Krea-2-depth-controlnet — 공개 Depth Control LoRA 가중치
  - facok/comfyui-krea2-controlnet — ComfyUI 구현

---

## v1.5 (2026-06-29) 🧪

### New Features

**SDXL ONE STUDIO — 신규 노드 추가 (테스트 버전)**

SDXL 전용 올인원 노드가 패키지에 추가되었습니다. 현재 테스트 단계이며 핵심 기능은 동작합니다.

**모델 로딩 방식 선택 (CKPT / Separate)**
- Settings에서 CKPT(단일 Checkpoint 파일) 또는 Separate(UNET + CLIP-L + CLIP-G + VAE) 방식 선택 가능
- Separate 방식은 GGUF · FP8 경량 UNET 파일 지원
- 상단 뱃지가 현재 방식(CKPT / UNET)을 표시하며 전환 즉시 업데이트

**Refiner 항상 표시**
- Settings → Separate(UNET) 선택 시에도 Refiner Checkpoint 선택 항목이 사라지지 않음
- CKPT ↔ Separate 전환과 무관하게 항상 Refiner를 설정 가능
- Refiner는 `CheckpointLoaderSimple`로 독립 로딩

**Inpaint — 풀스크린 마스크 에디터**
- Z-Image와 동일한 팝업 풀스크린 마스크 에디터 내장
  - 줌 1x–32x (마우스 휠), 팬 (중클릭·우클릭 드래그)
  - 브러시 / 지우개 / 전체 지우기, 크기 슬라이더
  - Fit / 줌인 / 줌아웃 버튼
- `VAEEncodeForInpaint` 방식으로 마스크 영역 latent를 완전히 0으로 처리 → denoise=1에서도 원본 픽셀 블리드 없음
  - 기존 `VAEEncode + SetLatentNoiseMask` 방식 대비 개선

**Outpaint — 패딩 원본 비교**
- 비교 슬라이더(⇌ Compare)의 "A" 면에 회색 패딩이 포함된 원본 미리보기를 렌더링
- 캔버스 확장 방향과 크기를 시각적으로 확인 가능
- 패딩값 변경 시 미리보기 자동 업데이트

**프롬프트 템플릿 버튼 (📋)**
- 프롬프트 입력 헤더 우측에 `📋` 버튼 추가
- Klein의 템플릿 오버레이(`ui_prompt_templates.js`)를 공유 사용

**Send to Inpaint / Outpaint (Klein · QE2511)**
- 갤러리(🖼 Gallery)와 결과 스트립의 Send to에 `→ Inpaint` · `→ Outpaint` 항목 각각 추가
- 클릭 시 Paint 모드로 전환 후 Inpaint / Outpaint 서브모드로 자동 스위칭 + 이미지 자동 로드
- `switchSubMode()` 함수를 Klein / QE2511의 inpaint 핸들에 노출하여 외부에서 서브모드 전환 가능

### Bug Fixes

**[SDXL Inpaint] VAEEncode → VAEEncodeForInpaint 교체**
- 기존 `VAEEncode + GrowMask + SetLatentNoiseMask` 그래프에서 `VAEEncodeForInpaint`로 전환
- denoise=1일 때 마스크 영역에 원본 이미지가 refine되어 나오는 현상(블리드) 수정
- 영향 파일: `web/sdxl/graph_builder_sdxl.js`

**[SDXL] setTool 변수 섀도잉 버그**
- `createDrawingEngine` 반환 객체에서 `setTool: tool => { tool = tool; }` — 파라미터명이 외부 변수를 섀도잉하여 setter가 no-op으로 동작하는 버그
- `setTool: v => { tool = v; }` 로 수정
- 영향 파일: `web/sdxl/ui_inpaint_sdxl.js`

**[QE2511 Gallery] onSendTo 시그니처 불일치**
- 기존: `onSendTo(mode, field, filename)` 3인자
- 수정: `onSendTo(mode, field, subMode, filename)` 4인자로 변경 — Outpaint 서브모드 정보 전달 가능
- 영향 파일: `web/qwen2511/ui_gallery_qe2511.js` · `web/one_node_qwen2511.js`

---

## v1.5.0 (2026-07-14)

### New Features

**Krea2 I2I — ControlNet 지원 추가**

[comfyui-krea2-controlnet](https://github.com/facok/comfyui-krea2-controlnet) 패키지를 통해 Krea2 노드의 I2I 모드에 ControlNet 기능을 내장.

**ControlNet 패널 (I2I 탭 하단):**
- **ON/OFF 토글** — 비활성 시 기존 I2I 그래프와 완전히 동일하게 동작
- **Control LoRA 선택** — `models/loras/`의 Krea2 Control LoRA 파일 선택 (검색 필터 포함)
- **Strength** — Control LoRA 강도 (0~2)
- **Channel Mode** — RGB / Grayscale (Depth LoRA는 Grayscale 권장)
- **Normalize** — None / Per-image MinMax (Depth LoRA는 Per-image MinMax 권장)
- **Invert** — 컨트롤 이미지 반전
- **Control Image** 업로드 — 소스 이미지와 별개의 컨트롤 이미지 (Depth맵, Canny맵 등)

**그래프 연결 순서 (비하인드):**
```
VAEEncode(소스이미지) → Krea2ControlImageEncode(컨트롤이미지, latent) → control_latent
Model → Krea2ControlLoRALoader → Krea2ControlApply(control_latent) → KSampler
```

**설치 스크립트 업데이트:**
- `install_requirements.bat` / `install_requirements.sh`에 `comfyui-krea2-controlnet` 추가 (9번째 항목)

**공개 Depth Control LoRA:**
- [Patil/Krea-2-depth-controlnet](https://huggingface.co/Patil/Krea-2-depth-controlnet) — `models/loras/`에 배치

---

## v1.4.1 (2026-06-28)

### Bug Fixes

**[Critical] LoRA 트리거 워드가 자꾸 지워지는 버그 수정 — 전체 4개 노드**

- **`loraSelect` 검색 필터 입력 시 currentValue 오염 버그** (Klein · Z-Image `ui_common.js`)
  - 기존: `filterIn` "input" 이벤트에서 `const cur = s.value`로 표시값을 저장 → `availableLoras`가 아직 빈 배열일 때 `s.value`는 "none"으로 표시됨 → 검색 타이핑 후 `"none"` 기준으로 select 복원 → 실제 선택한 LoRA가 "none"으로 시각적으로 재표시됨
  - 수정: `s.value`(표시값) 대신 `currentValue` 변수(JS에서 관리하는 실제 선택값)를 기준으로 필터링 후 복원 — JS로 `s.value`를 변경해도 `change` 이벤트가 발생하지 않으므로 `currentValue`는 항상 사용자가 실제 선택한 값으로 유지됨

- **LoRA 변경 시 트리거 워드 처리 개선** (Klein · Z-Image · Krea2 · QE2511 전체)
  - 기존: `!lora.triggerWord` 조건만 체크 → 이미 트리거 워드가 있으면 다른 LoRA로 교체해도 fetch 안 함 → 교체 후 이전 LoRA의 트리거 워드가 그대로 남아 잘못된 값 유지
  - 수정: `v !== prev` (다른 LoRA로 교체)이면 트리거 워드를 초기화 후 새로 fetch; 같은 LoRA를 다시 선택하면 기존 트리거 워드 유지; "none" 선택 시 트리거 워드 초기화

- **strength `||1` 연산자 버그** (전체 6개 파일)
  - 기존: `parseFloat(strIn.value) || 1` — strength를 `0`으로 설정하면 `0 || 1 = 1`로 리셋되는 버그
  - 수정: `isNaN(v) ? 1 : v` — 입력이 유효하지 않을 때만 1로 대체, `0` 값은 정상 저장
  - 영향 파일: `web/klein/ui_lora_section.js` · `web/zimage/ui_lora_section.js` · `web/krea2/ui_t2i_krea2.js` (×2) · `web/qwen2511/ui_common_qe.js` · `web/qwen2511/ui_app_settings_qe.js` (×2) · `web/qwen2511/ui_faceswap_qe.js`

---

## v1.4 (2026-06-28)

### New Features

**Prompt Studio (LLM) 통합 — 프롬프트 확대창에 AI 강화 기능 추가**

TJ_NODE의 Prompt Studio를 4개 노드(Klein · QE2511 · Z-Image · Krea2) 프롬프트 확대창(`🔍`)에 직접 내장.
TJ_NODE가 설치된 경우에만 활성화되며, 미설치 시 기존 편집 기능은 그대로 동작.

**새 탭 구조:**
- `✏️ Edit` — 기존 전체화면 텍스트 편집 (변경 없음)
- `✨ Enhance` — 현재 프롬프트를 GGUF LLM으로 강화 → 결과 팝업에서 [교체하기] / [닫기] 선택
- `🖼 Image→Prompt` — 이미지 업로드 또는 URL 다운로드 → 비전 LLM으로 프롬프트 생성 → 현재 모드 프롬프트로 전송

**설정 자동 기억 (localStorage):**
- 마지막 선택한 GGUF 모델, mmproj 파일, Vision Task, Model Format, Aesthetic, GPU Layers, n_ctx, Max Tokens, Temperature, Seed를 브라우저에 저장
- 4개 노드가 동일한 설정을 공유 — 한 번 설정하면 모든 노드에서 재사용

**Enhance 탭 추가 필드:**
- `Model Format` 선택 (TJ_NODE model_formats 목록에서 자동 로드)
- `Aesthetic` 선택 (TJ_NODE aesthetics 목록에서 자동 로드)
- `Extra Instructions` 텍스트 입력

**Image→Prompt 탭 추가 필드:**
- `Model Format` / `Aesthetic` 선택 (Enhance 탭과 공유·동기화)
- `Custom Instruction` 텍스트 입력
- **URL 다운로드**: 이미지 URL 입력 + ⬇ 다운로드 버튼 → `ComfyUI/input/download/` 저장 후 자동 미리보기
- 이미지 전송 전 **1MP 이하 자동 리사이즈** (JPEG 100% 품질) — Context Overflow 방지

**AI 처리 중 로딩 오버레이:**
- Enhance / Image→Prompt 분석 중 오른쪽 결과 영역에 반투명(50%) 오버레이 + 초록 링 스피너 표시
- 분석 완료 또는 오류 시 자동 해제

**한/영 i18n 완전 지원:**
- LLM 패널 UI 전체 텍스트(탭명, 버튼, 레이블, 오류 메시지, 설치 배너 등)를 `i18n.js`로 처리
- `web/shared/i18n.js`에 `llm_*` 키군 KO/EN 추가

**TJ_NODE 미설치 시 설치 배너:**
- 미설치 상태에서 Enhance / Image→Prompt 탭 진입 시 설치 안내 UI 표시
- GitHub 링크(`designloves2/ComfyUI-TJ_NODE`) 클릭 가능
- `⬇ 지금 설치하기` 버튼 → 서버에서 `git clone` + `pip install -r requirements.txt` 자동 실행
- 설치 완료 후 ComfyUI 재시작 안내

**TJ_NODE 폴더명 자동 탐색:**
- `ComfyUI-TJ_NODE` (공식) → `ComfyUI-TJ_NODE2` (개발용) → `TJ_NODE` 순서로 자동 탐색
- 폴더명과 무관하게 동작

**신규 파일:**
- `web/shared/llm_panel.js` — 4개 노드 공용 LLM 패널 컴포넌트
- `nodes.py` 엔드포인트 5개 추가:
  - `GET /tj_studio_one/llm/models` — 설치된 GGUF/mmproj 모델 목록 + model_formats/aesthetics 반환
  - `POST /tj_studio_one/llm/enhance` — 프롬프트 텍스트 강화 (model_format · aesthetic · extra_instructions 포함)
  - `POST /tj_studio_one/llm/image_to_prompt` — 이미지 → 프롬프트 변환 (model_format · aesthetic · custom_instruction 포함)
  - `POST /tj_studio_one/llm/download_image` — URL 이미지 다운로드 → `input/download/` 저장 + base64 반환
  - `POST /tj_studio_one/llm/install_tj_node` — TJ_NODE 자동 설치 (git clone + pip)

---

## v1.3 (2026-06-28)

### Bug Fixes

**[Critical] Send to — Preview 모드에서 동작 불가**
- `nodes.py` `_make_copy_to_input_handler` 및 `qe_copy_to_input`: `type="temp"` (PreviewImage 출력) 처리 누락으로 파일을 찾지 못하는 버그 수정
- `outputMode = "preview"` 설정 시 생성된 이미지에 Send to 버튼이 동작하지 않던 문제 해결
- 영향 노드: Klein · QE2511 · Z-Image · Krea2 전체

**[Critical] Krea2 커스텀 사이즈 / Steps / CFG 입력 시 TypeError 충돌**
- `web/krea2/ui_t2i_krea2.js`: `numberField(value, min, max, step, callback)` 잘못된 인자 순서로 호출 → `callback` 위치에 숫자가 전달되어 "is not a function" 오류 발생
- 올바른 signature `numberField(value, callback, step)`으로 수정
- W · H · Steps · CFG 입력 모두 수정, 범위 검증(clamp) 추가

**Z-Image Upscale → Send to 목적지 누락**
- `web/zimage/one_node_z_image_turbo.js`: Upscale 결과의 Send to에 RE-BG · ControlNet · Face Redraw 버튼 누락
- 3개 목적지 추가 (다른 모드들과 동일하게 맞춤)

**Klein Paint → Send to 시 Outpaint 이미지 미설정**
- `web/klein/one_node_flux_2_klein.js`: Send to Paint 클릭 시 `inpaintImage`만 설정되고 `outpaintImage`는 설정되지 않아 Outpaint 서브모드에서 이미지가 없는 상태로 전환되는 버그 수정
- `inpaintImage` 설정 시 `outpaintImage`도 동시 설정

**커스텀 사이즈 입력 — 0 저장 및 8 배수 미준수**
- Klein · QE2511 · Z-Image T2I 커스텀 사이즈 입력: 필드를 지울 경우 `state.width = 0` 저장 → graph_builder가 silently 1024로 대체하는 혼란 동작 수정
- 입력값이 0이면 64로 대체, 8 배수로 자동 반올림 처리

**Textarea 클릭 시 노드 내부 패널 찌그러짐**
- 전체 4개 노드(Klein · QE2511 · Z-Image · Krea2) 동일하게 수정:
  - `root.width`: `"100%"` → `"980px"` 고정 (컨테이너 reflow 차단)
  - `rightPanel.minWidth`: `"0"` → `"640px"` (flex 레이아웃이 preview 패널을 압축 불가)
  - `computeSize`: `[NODE_W, NODE_H]` → `[NODE_W, NODE_H + _extraH]` (Override Slots 활성 시 높이 정확도)

### New Features

**Outpaint 자동 시스템 프롬프트 주입 (Klein · QE2511)**
- Outpaint 서브모드 진입 시 프롬프트 textarea placeholder가 "Scene description only — system prompt is auto-added"로 변경
- 사용자는 장면 설명만 입력, 시스템 프롬프트는 생성 시 자동으로 앞에 붙어 전송:
  ```
  Extend the composition of this image. Replace all black or rgb(R,G,B) areas
  with a logical continuation of the background and foreground. Ensure the
  transition is invisible and the new elements perfectly match the perspective
  and color palette of the original image. Scene description: [사용자 입력]
  ```
- PAD 색상(RGB)은 사용자가 설정한 값에서 자동으로 치환
- Inpaint 프롬프트와 Outpaint 프롬프트 키 분리 (`promptsByMode["inpaint"]` / `promptsByMode["outpaint"]`) — 서브모드 전환 시 각각의 프롬프트 유지

**i18n — 마스크 편집 버튼 영어 번역 누락**
- Klein · Z-Image Inpaint 모드의 "💾 마스크 저장", "⤢ 크게 편집" 버튼 텍스트가 영어 모드에서도 한글로 출력되던 문제 수정
- 저장 중 / 저장 완료 / 저장 실패 / 마스크 미칠 에러 메시지도 함께 i18n 처리
- `web/shared/i18n.js`에 `inpaint_save_btn` · `inpaint_large_edit` · `inpaint_no_mask` KO/EN 키 추가
- 영향 파일: `web/klein/ui_inpaint_klein.js` · `web/zimage/ui_inpaint.js`

### Documentation

**패키지 명칭 통일**
- README.md · PROMO.md · SETUP_GUIDE.md: `ComfyUI-TJ_NODE_ONE` / `TJ NODE ONE` 잔여 표기를 `ComfyUI-TJ_NODE_STUDIO_ONE` / `TJ NODE STUDIO ONE`으로 전부 교체

**감사의 말 추가**
- README.md (한국어) · PROMO.md (영어): 핵심 아이디어 원작자 [yanokusnir-ai](https://github.com/yanokusnir-ai) / [one-node-flux-2-klein](https://github.com/yanokusnir-ai/one-node-flux-2-klein) 크레딧 추가

**깨진 링크 수정**
- README.md: `https://huggingface.co/Comfy-Org/Qwen2.5-VL-7B-Image-Edit` (404) → `https://huggingface.co/Comfy-Org/Qwen-Image-Edit_ComfyUI/tree/main/split_files` 로 교체

---

## v1.2

- **Outpaint color param crash** — `ImagePadKJ` color가 `[R,G,B]` 배열로 전송되어 ComfyUI가 node link로 해석 → "Bad linked input" 오류. `"R, G, B"` 문자열 포맷으로 수정
- **Klein Outpaint 새 이미지 생성 버그** — `GetImageSize`가 스케일 전 패딩 이미지를 읽어 `EmptyFlux2LatentImage`와 `VAEEncode` 크기 불일치 → 참조 컨디셔닝 무시 후 완전히 새 이미지 생성. `ImageScaleToTotalPixels` 출력에서 읽도록 수정
- **Help overlay 링크** — 모든 Help 문서 URL을 클릭 가능한 하이퍼링크로 변경
- **Language selector 위치** — Refresh Models 바로 다음에 일관되게 배치

---

## v1.1

- 패밀리 노드 확장: Z-Image Turbo · Flux.2 Klein · QE2511 · Krea2 4개 노드 체계 확립
- SeedVR2 AI Upscale 전 노드 통합
- LoRA 스택 (최대 3개) · Lightning LoRA · Camera Angle LoRA 지원
- 갤러리 · 비교 슬라이더 · 스크롤 줌 · 프롬프트 템플릿 기능 추가
- 한국어 / 영어 UI 언어 전환 지원

---

## v1.0

- 최초 릴리스
- Flux.2 Klein 9B 기반 All-in-One 단일 노드 (T2I · I2I · Edit · Paint · Faceswap · Upscale)
- [yanokusnir-ai/one-node-flux-2-klein](https://github.com/yanokusnir-ai/one-node-flux-2-klein) 아이디어에서 출발하여 다중 모델·다중 모드로 확장

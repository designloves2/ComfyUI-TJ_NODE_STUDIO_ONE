# CHANGELOG — ComfyUI-TJ_NODE_STUDIO_ONE

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

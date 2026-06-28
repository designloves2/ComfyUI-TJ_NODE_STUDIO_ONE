# CHANGELOG — ComfyUI-TJ_NODE_STUDIO_ONE

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

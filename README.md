# TJ NODE ONE (통합 패키지)

> **ComfyUI 올인원 이미지 생성 UI 패키지** — Z-Image ONE STUDIO, Flux.2 Klein ONE STUDIO, Qwen Image Edit 2511 ONE STUDIO, Krea 2 ONE STUDIO 네 가지 노드를 단일 패키지로 제공합니다.  
> 워크플로우 배선 없이 노드 하나에서 T2I · I2I · Inpaint · Outpaint · ControlNet · Edit · Faceswap · ANGLE · Upscale(SeedVR2) 등 다양한 모드를 전환합니다.
>
> ⚠️ **생성 방식**: 모든 노드의 생성은 ComfyUI 상단 **RUN**이 아닌 노드 내부의 **▶ Generate** 버튼으로 실행합니다. RUN 실행 시 마지막으로 생성된 이미지가 OUTPUT image 슬롯으로 출력됩니다.

---
<img width="1201" height="916" alt="Screen Shot 2026-06-27 at 05 58 39 907 AM" src="https://github.com/user-attachments/assets/aaf0686e-e09b-43b4-8aff-c6d369e5f06c" />

## 목차

1. [포함 노드](#포함-노드)
2. [설치 방법](#설치-방법)
3. [필수 커스텀 노드](#필수-커스텀-노드)
4. [Z-Image ONE STUDIO — 기능 상세](#z-image-one-studio--기능-상세)
5. [Flux.2 Klein ONE STUDIO — 기능 상세](#flux2-klein-one-studio--기능-상세)
6. [Qwen Image Edit 2511 ONE STUDIO — 기능 상세](#qwen-image-edit-2511-one-studio--기능-상세)
7. [Krea 2 ONE STUDIO — 기능 상세](#krea-2-one-studio--기능-상세)
8. [공통 기능](#공통-기능)
9. [버그 수정 이력](#버그-수정-이력)
10. [라이선스](#라이선스)

---

## 포함 노드

| 노드 이름                                | 대상 모델                       | 지원 모드                                                    |
| ---------------------------------------- | ------------------------------- | ------------------------------------------------------------ |
| **Z-Image ONE STUDIO (TJ)**              | Z-Image Turbo (flow-matching)   | T2I · I2I · Inpaint · Outpaint · RE-BG · ControlNet · Face Redraw · **Upscale** |
| **Flux.2 Klein ONE STUDIO (TJ)**         | Flux.2-Klein (9B / 4B)          | T2I · I2I · Edit · **Inpaint · Outpaint** · Faceswap · **Upscale** |
| **Qwen Image Edit 2511 ONE STUDIO (TJ)** | Qwen2.5-VL 기반 Image Edit 모델 | T2I · I2I · Edit(최대 3장) · Inpaint · **Outpaint** · Faceswap · **Angle** · **Upscale** |
| **Krea 2 ONE STUDIO (TJ)**               | Krea.ai 이미지 생성 모델        | T2I · I2I · **Upscale**                                      |

> **언어 지원**: 모든 노드의 Settings에서 한국어 / English 전환 가능

---

## 설치 방법

### ComfyUI Manager (권장)

ComfyUI Manager → Install Custom Nodes → `ComfyUI-TJ_NODE_STUDIO_ONE` 검색 후 설치

### 수동 설치

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/designloves2/ComfyUI-TJ_NODE_STUDIO_ONE.git
```

ComfyUI를 재시작하면 Add Node 메뉴에서 모든 노드를 찾을 수 있습니다.

---

## 필수 커스텀 노드

> **아래 노드들을 수동으로 설치하기 번거롭다면 자동 설치 스크립트를 사용하세요.**

### ⚡ 자동 설치 (권장)

이 패키지 폴더 안에 포함된 스크립트를 실행하면 필수 노드를 한 번에 설치합니다.

**Windows:**

```
install_requirements.bat  ← 더블클릭으로 실행
```

**Mac / Linux:**

```bash
chmod +x install_requirements.sh
./install_requirements.sh
```

- 이미 설치된 노드는 자동으로 건너뜁니다
- `requirements.txt`가 있는 노드는 pip install까지 자동 처리
- 완료 후 ComfyUI를 재시작하면 모든 노드가 로드됩니다

### 수동 설치 목록

| 노드                                                         | 용도                                             | 필수 대상               |
| ------------------------------------------------------------ | ------------------------------------------------ | ----------------------- |
| [ComfyUI-Impact-Pack](https://github.com/ltdrdata/ComfyUI-Impact-Pack) | FaceDetailer — 얼굴 감지·재생성·블렌드 핵심 엔진 | Z-Image Face Redraw     |
| [ComfyUI-Impact-Subpack](https://github.com/ltdrdata/ComfyUI-Impact-Subpack) | Impact Pack 필수 서브팩 (함께 설치 필요)         | Z-Image Face Redraw     |
| [ComfyUI-KJNodes](https://github.com/kijai/ComfyUI-KJNodes)  | FluxKVCache · ImagePadKJ · FluxKontext 관련 노드 | Klein · QE2511          |
| [ComfyUI-GGUF](https://github.com/city96/ComfyUI-GGUF)       | GGUF 형식 모델 로딩                              | 선택 (GGUF 사용 시)     |
| [ComfyUI_FaceAnalysis](https://github.com/cubiq/ComfyUI_FaceAnalysis) | Faceswap 모드 얼굴 감지                          | Klein · QE2511 Faceswap |
| [ComfyUI-RMBG](https://github.com/1038lab/ComfyUI-RMBG)      | 배경 제거                                        | Z-Image RE-BG           |
| [comfyui_controlnet_aux](https://github.com/Fannovel16/comfyui_controlnet_aux) | ControlNet 전처리기                              | Z-Image ControlNet      |
| [ComfyUI-SeedVR2](https://github.com/kijai/ComfyUI-SeedVR2)  | SeedVR2 AI 업스케일 노드                         | 전체 노드 Upscale 모드  |

---

## Z-Image ONE STUDIO — 기능 상세

### 지원 모드

| 모드            | 설명                                                         |
| --------------- | ------------------------------------------------------------ |
| **T2I**         | 텍스트 → 이미지 기본 생성                                    |
| **I2I**         | 소스 이미지 기반 변형 생성                                   |
| **INPAINT**     | 내장 마스크 에디터로 특정 영역만 재생성 (DifferentialDiffusion) |
| **OUTPAINT**    | 이미지 캔버스 확장 후 빈 영역 인페인트                       |
| **RE-BG**       | RMBG로 서브젝트 분리 → 배경 완전 재생성 (경계선 없음)        |
| **CONTROLNET**  | Depth / Canny / Pose / HED / MLSD 레퍼런스 가이드 생성       |
| **FACE REDRAW** | 얼굴 자동 감지 → 크롭 → LoRA 재생성 → 원본에 블렌드          |
| **UPSCALE**     | SeedVR2 AI 업스케일 — DiT 모델 기반 초고해상도 변환          |

### 필수 모델

| 종류              | 경로                       | 다운로드                                                     |
| ----------------- | -------------------------- | ------------------------------------------------------------ |
| Diffusion Model   | `models/diffusion_models/` | [z_image_turbo_bf16](https://huggingface.co/Comfy-Org/z_image_turbo) |
| Text Encoder      | `models/text_encoders/`    | [qwen_3_4b](https://huggingface.co/Comfy-Org/z_image_turbo)  |
| VAE               | `models/vae/`              | [ae.safetensors](https://huggingface.co/Comfy-Org/z_image_turbo) |
| ControlNet (선택) | `models/controlnet/`       | [Z-Image-Turbo-Fun-Controlnet-Union](https://huggingface.co/alibaba-pai/Z-Image-Turbo-Fun-Controlnet-Union) |

---

## Flux.2 Klein ONE STUDIO — 기능 상세

### 지원 모드

| 모드         | 설명                                                  |
| ------------ | ----------------------------------------------------- |
| **T2I**      | 텍스트 → 이미지 기본 생성                             |
| **I2I**      | 소스 이미지 기반 변형 생성                            |
| **EDIT**     | 레퍼런스 이미지 1~5장 기반 멀티 레퍼런스 편집         |
| **PAINT**    | 내장 마스크 에디터로 특정 영역 재생성 + Outpaint 지원 |
| **FACESWAP** | BFS 얼굴 LoRA를 사용한 얼굴 교체·재생성               |
| **UPSCALE**  | SeedVR2 AI 업스케일 — DiT 모델 기반 초고해상도 변환   |

### 필수 모델

| 종류                | 경로                       | 다운로드                                                     |
| ------------------- | -------------------------- | ------------------------------------------------------------ |
| Diffusion Model     | `models/diffusion_models/` | [BFL FLUX.2 Collection](https://huggingface.co/collections/black-forest-labs/flux2) |
| Text Encoder (9B)   | `models/text_encoders/`    | [Comfy-Org 9B pack](https://huggingface.co/Comfy-Org/vae-text-encorder-for-flux-klein-9b) |
| Text Encoder (4B)   | `models/text_encoders/`    | [Comfy-Org 4B pack](https://huggingface.co/Comfy-Org/vae-text-encorder-for-flux-klein-4b) |
| VAE                 | `models/vae/`              | [Comfy-Org 9B pack](https://huggingface.co/Comfy-Org/vae-text-encorder-for-flux-klein-9b) |
| BFS LoRA (Faceswap) | `models/loras/`            | [BFS-Best-Face-Swap](https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap) |

> **KV Cache**: 파일명에 `kv`가 포함된 모델은 자동으로 FluxKVCache 노드를 활성화합니다.

---

## Qwen Image Edit 2511 ONE STUDIO — 기능 상세

### 지원 모드

| 모드         | 설명                                                         |
| ------------ | ------------------------------------------------------------ |
| **T2I**      | 텍스트로 이미지 생성                                         |
| **I2I**      | 소스 이미지 기반 변형 생성                                   |
| **EDIT**     | 텍스트 프롬프트로 이미지 편집. 원본 + 참조 이미지 최대 3장 지원 |
| **PAINT**    | 마스크 영역 인페인트. Outpaint(캔버스 확장) 포함             |
| **FACESWAP** | BFS LoRA를 활용한 얼굴 교체. 자동 기본 프롬프트 제공         |
| **ANGLE**    | 3D 씬에서 카메라 앵글(H/V/Z) 드래그 조절. Camera Angle LoRA는 ⚙ Settings에서 설정 |
| **UPSCALE**  | SeedVR2 AI 업스케일                                          |

### 필수 모델

| 종류                     | 경로                       | 다운로드                                                     |
| ------------------------ | -------------------------- | ------------------------------------------------------------ |
| Diffusion Model          | `models/diffusion_models/` | [Comfy-Org QE2511](https://huggingface.co/Comfy-Org/Qwen2.5-VL-7B-Image-Edit) |
| Text Encoder             | `models/text_encoders/`    | [Comfy-Org QE2511](https://huggingface.co/Comfy-Org/Qwen2.5-VL-7B-Image-Edit) |
| VAE                      | `models/vae/`              | [Comfy-Org QE2511](https://huggingface.co/Comfy-Org/Qwen2.5-VL-7B-Image-Edit) |
| Lightning LoRA (선택)    | `models/loras/`            | [Qwen-Image-Edit-2511-Lightning](https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning/tree/main) |
| Camera Angle LoRA (선택) | `models/loras/`            | [Multi Angle LoRa](https://huggingface.co/fal/Qwen-Image-Edit-2511-Multiple-Angles-LoRA) |
| BFS LoRA (Faceswap 필수) | `models/loras/`            | [BFS-Best-Face-Swap](https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap) |

> **내부 의존 노드**: `FluxKontextImageScale` · `TextEncodeQwenImageEditPlus` · `FluxKontextMultiReferenceLatentMethod` — ComfyUI-KJNodes에 포함

---

## Krea 2 ONE STUDIO — 기능 상세

### 지원 모드

| 모드        | 설명                       |
| ----------- | -------------------------- |
| **T2I**     | 텍스트로 이미지 생성       |
| **I2I**     | 소스 이미지 기반 변형 생성 |
| **UPSCALE** | SeedVR2 AI 업스케일        |

### 필수 모델

| 종류                  | 경로                       | 다운로드                                                  |
| --------------------- | -------------------------- | --------------------------------------------------------- |
| Diffusion Model       | `models/diffusion_models/` | [Comfy-Org Krea2](https://huggingface.co/Comfy-Org/Krea2) |
| Text Encoder          | `models/text_encoders/`    | [Comfy-Org Krea2](https://huggingface.co/Comfy-Org/Krea2) |
| VAE                   | `models/vae/`              | [Comfy-Org Krea2](https://huggingface.co/Comfy-Org/Krea2) |
| Lightning LoRA (선택) | `models/loras/`            | [Comfy-Org Krea2](https://huggingface.co/Comfy-Org/Krea2) |

---

## 공통 기능

### 설정 패널 (⚙ Settings)

- **Diffusion Model / Text Encoder / VAE** 드롭다운 선택
- **↻ Refresh Models** — 모델 폴더 재스캔 (ComfyUI 재시작 없이 새 파일 인식)
- **언어 / Language** — 한국어 / English 전환 (페이지 새로고침 적용)
- **Negative Prompt** — 전체 모드 공통 적용
- **Prompt Suffix** — 프롬프트 뒤에 자동 추가
- **Save Folder** — `ComfyUI/output/` 내부 하위 저장 폴더 지정
- **모델 오버라이드 슬롯** — Primitive(String) 노드 연결로 설정 드롭다운 우선 적용

### SeedVR2 Upscale 모델 (전체 노드 공용)

| 경로              | 파일           | 다운로드                                                     |
| ----------------- | -------------- | ------------------------------------------------------------ |
| `models/SEEDVR2/` | DiT + VAE 모델 | [kijai/SeedVR2-models](https://huggingface.co/kijai/SeedVR2-models) |

### LoRA

- 최대 3개 LoRA 체인 (Faceswap 모드는 1개)
- `.safetensors` 헤더에서 트리거 워드 자동 추출 및 표시
- ON/OFF 토글로 개별 활성화
- Strength 0~2 조절

### 갤러리 (🖼 Gallery)

- 저장된 이미지 타일 보기 (무한 스크롤, 정사각형 그리드)
- 즐겨찾기(★) / 삭제 / 폴더 열기 / Send to(모드에 이미지 전달)
- ESC 키로 닫기

### 비교 슬라이더 (⇌ Compare)

- 생성 전 원본과 생성 후 결과를 드래그로 나란히 비교

### 단축키

| 키    | 동작                               |
| ----- | ---------------------------------- |
| `ESC` | 열린 팝업 / 갤러리 / 오버레이 닫기 |

---

## 버그 수정 이력

### v1.2 (현재)

- **[전체] 언어 지원 추가**: QE2511 · Krea2 Settings에 한국어/English 언어 선택기 추가
- **[전체] 도움말 개선**: QE2511 · Krea2 도움말을 Z-Image 스타일로 전면 재작성 (모델 다운로드 URL 포함, 클릭 가능 링크)
- **[Klein · QE2511] Outpaint 색상 버그 수정**: `ImagePadKJ`의 color 파라미터를 `[R,G,B]` 배열(ComfyUI가 노드 링크로 오해 → "Bad linked input" 오류)에서 `"R, G, B"` 문자열 형식으로 수정
- **[Klein] Outpaint 레퍼런스 불인식 버그 수정**: `GetImageSize`가 패딩 전 원본 이미지를 읽어 `EmptyFlux2LatentImage`와 `VAEEncode`의 해상도가 불일치 → 모델이 레퍼런스 컨디셔닝을 무시하고 완전히 새 이미지를 생성하던 문제 수정. `GetImageSize`가 `ImageScaleToTotalPixels` 출력(스케일된 패딩 이미지)을 읽도록 변경

### v1.1

- **[QE2511]** `FluxKontextMakeReferenceLatent` 노드 제거 (미설치 오류 수정) → `FluxKontextMultiReferenceLatentMethod`에 vaeEnc 직접 연결
- **[QE2511]** Camera Angle LoRA를 ⚙ Settings 패널로 이동 (영구 저장)
- **[QE2511]** ANGLE 모드 카메라 바디 핑크 블롭 → 작은 점으로 교체
- **[QE2511]** ANGLE 모드 Send To 대상 추가 (→ Edit, → I2I, → Paint, → Upscale)
- **[QE2511]** Send To Edit 모드 필드명 버그 수정 (`editImage` → `editImage1`)
- **[QE2511]** FACESWAP 모드 진입 시 기본 프롬프트 자동 설정
- **[QE2511 · Krea2]** 갤러리 그리드 `gridAutoRows: 120px` 추가로 정사각형 타일 수정

---

## 함께 쓰면 더 강력한 — TJ_NODE

> **[ComfyUI-TJ_NODE](https://github.com/designloves2/ComfyUI-TJ_NODE)** — Wireless Workflow Architecture Toolkit

| TJ_NODE 주요 노드         | 기능                                                  |
| ------------------------- | ----------------------------------------------------- |
| **Prompt Studio (TJ)**    | LLM 기반 프롬프트 생성 · 강화 · 이미지→프롬프트 변환  |
| **Scene Maker (TJ)**      | Visual Beat 프롬프트 구조 노드. KO/EN/JP/CN 자동 번역 |
| **Wireless Architecture** | Fake-Wire 무선 라우팅 · Multi Router · Batch Workflow |

**→ [github.com/designloves2/ComfyUI-TJ_NODE](https://github.com/designloves2/ComfyUI-TJ_NODE)**

---
# TJ NODE STUDIO ONE — 설치 및 설정 가이드

> **Z-Image ONE STUDIO · Flux.2 Klein ONE STUDIO · Qwen Image Edit 2511 ONE STUDIO · Krea 2 ONE STUDIO**  
> ComfyUI 올인원 이미지 생성 UI — 워크플로우 배선 없이 노드 하나에서 T2I · I2I · Inpaint · Outpaint · Edit · Faceswap · Upscale 등 모든 모드를 전환합니다.

---

## 목차

1. [TJ NODE 패키지](#1-tj-node-패키지)
2. [필수 커스텀 노드](#2-필수-커스텀-노드)
3. [모델 다운로드](#3-모델-다운로드)
4. [초기 설정](#4-초기-설정)
5. [모드별 간략 설명](#5-모드별-간략-설명)
6. [문제 해결](#6-문제-해결)

---

## 1. TJ NODE 패키지

### 이 패키지 (통합 설치)

| 패키지          | 설명                                             | GitHub                                                       |
| --------------- | ------------------------------------------------ | ------------------------------------------------------------ |
| **TJ_NODE_ONE** | Z-Image · Klein · QE2511 · Krea2 ONE STUDIO 통합 | [ComfyUI-TJ_NODE_STUDIO_ONE](https://github.com/designloves2/ComfyUI-TJ_NODE_STUDIO_ONE) |

> **설치**: ComfyUI Manager → Install Custom Nodes → `ComfyUI-TJ_NODE_STUDIO_ONE` 검색  
> 또는 수동: `cd ComfyUI/custom_nodes && git clone https://github.com/designloves2/ComfyUI-TJ_NODE_STUDIO_ONE.git`

### 함께 쓰면 더 강력한 — TJ_NODE

| 패키지      | 설명                                                         | GitHub                                                       |
| ----------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| **TJ_NODE** | Wireless Workflow Architecture Toolkit — LLM 프롬프트 생성 · Fake-Wire 무선 라우팅 · 대규모 워크플로우 구조화 | [ComfyUI-TJ_NODE](https://github.com/designloves2/ComfyUI-TJ_NODE) |

---

## 2. 필수 커스텀 노드

### ⚡ 자동 설치 스크립트 (권장)

이 패키지 폴더(`ComfyUI-TJ_NODE_ONE/`) 안에 설치 스크립트가 포함되어 있습니다.  
필수 노드 **8개를 한 번에** 설치하고 pip requirements까지 처리합니다.

**Windows** — 파일 탐색기에서 더블클릭:

```
install_requirements.bat
```

**Mac / Linux** — 터미널에서 실행:

```bash
chmod +x install_requirements.sh
./install_requirements.sh
```

> 이미 설치된 노드는 자동으로 건너뜁니다. 완료 후 ComfyUI를 재시작하세요.

---

### 수동 설치 목록

| 커스텀 노드                | 용도                                             | 필요 노드               | GitHub                                                       |
| -------------------------- | ------------------------------------------------ | ----------------------- | ------------------------------------------------------------ |
| **ComfyUI-Impact-Pack**    | FaceDetailer — 얼굴 감지·재생성·블렌드 핵심 엔진 | Z-Image · Face Redraw   | [ltdrdata/ComfyUI-Impact-Pack](https://github.com/ltdrdata/ComfyUI-Impact-Pack) |
| **ComfyUI-Impact-Subpack** | Impact Pack 의존 서브팩                          | Z-Image · Face Redraw   | [ltdrdata/ComfyUI-Impact-Subpack](https://github.com/ltdrdata/ComfyUI-Impact-Subpack) |
| **ComfyUI-KJNodes**        | FluxKVCache · ImagePadKJ · FluxKontext 노드 포함 | Klein · QE2511          | [kijai/ComfyUI-KJNodes](https://github.com/kijai/ComfyUI-KJNodes) |
| **ComfyUI-GGUF**           | GGUF 양자화 모델 로딩                            | 선택 (GGUF 사용 시)     | [city96/ComfyUI-GGUF](https://github.com/city96/ComfyUI-GGUF) |
| **ComfyUI_FaceAnalysis**   | Faceswap 얼굴 임베딩 분석                        | Klein · QE2511 Faceswap | [cubiq/ComfyUI_FaceAnalysis](https://github.com/cubiq/ComfyUI_FaceAnalysis) |
| **ComfyUI-RMBG**           | 배경 제거 (RE-BG 모드)                           | Z-Image · RE-BG         | [1038lab/ComfyUI-RMBG](https://github.com/1038lab/ComfyUI-RMBG) |
| **comfyui_controlnet_aux** | ControlNet 전처리기 (Depth · Canny · Pose 등)    | Z-Image · ControlNet    | [Fannovel16/comfyui_controlnet_aux](https://github.com/Fannovel16/comfyui_controlnet_aux) |
| **ComfyUI-SeedVR2**        | SeedVR2 AI 업스케일 (UPSCALE 모드)               | 전체 노드               | [kijai/ComfyUI-SeedVR2](https://github.com/kijai/ComfyUI-SeedVR2) |

---

## 3. 모델 다운로드

### 3-1. Z-Image ONE STUDIO 모델

#### Diffusion Model → `models/diffusion_models/`

| 파일명                           | 설명                        | 다운로드                                                     |
| -------------------------------- | --------------------------- | ------------------------------------------------------------ |
| `z_image_turbo_bf16.safetensors` | Z-Image Turbo BF16 **권장** | [다운로드](https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/diffusion_models/z_image_turbo_bf16.safetensors) |

> 전체 모델 목록: https://huggingface.co/Comfy-Org/z_image_turbo

#### Text Encoder → `models/text_encoders/`

| 파일명                  | 다운로드                                                     |
| ----------------------- | ------------------------------------------------------------ |
| `qwen_3_4b.safetensors` | [다운로드](https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/text_encoders/qwen_3_4b.safetensors) |

#### VAE → `models/vae/`

| 파일명           | 다운로드                                                     |
| ---------------- | ------------------------------------------------------------ |
| `ae.safetensors` | [다운로드](https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/vae/ae.safetensors) |

#### ControlNet → `models/controlnet/`  *(ControlNet 모드 사용 시)*

| 파일명                                           | 다운로드                                                     |
| ------------------------------------------------ | ------------------------------------------------------------ |
| `Z-Image-Turbo-Fun-Controlnet-Union.safetensors` | [다운로드](https://huggingface.co/alibaba-pai/Z-Image-Turbo-Fun-Controlnet-Union/resolve/main/Z-Image-Turbo-Fun-Controlnet-Union.safetensors) |

#### Face Detector → `models/ultralytics/bbox/`  *(Face Redraw 모드 사용 시)*

| 파일명                     | 다운로드                                                     |
| -------------------------- | ------------------------------------------------------------ |
| `face_yolov8m.pt` **권장** | [다운로드](https://huggingface.co/Bingsu/adetailer/resolve/main/face_yolov8m.pt) |
| `face_yolov9c.pt`          | [다운로드](https://huggingface.co/Bingsu/adetailer/resolve/main/face_yolov9c.pt) |

#### BG Removal → `models/background_removal/`  *(RE-BG 모드 사용 시)*

| 파일명                          | 다운로드                                                     |
| ------------------------------- | ------------------------------------------------------------ |
| `BiRefNet-general.pth` **권장** | [다운로드](https://huggingface.co/ZhengPeng7/BiRefNet/resolve/main/BiRefNet-general.pth) |
| `BiRefNet-portrait.pth`         | [다운로드](https://huggingface.co/ZhengPeng7/BiRefNet-portrait/resolve/main/BiRefNet-portrait.pth) |

---

### 3-2. Flux.2 Klein ONE STUDIO 모델

#### Diffusion Model → `models/diffusion_models/`

| 모델                         | 설명                   | 다운로드                                                     |
| ---------------------------- | ---------------------- | ------------------------------------------------------------ |
| `flux2-klein-9b.safetensors` | FLUX.2 Klein 9B (메인) | [Black Forest Labs Collection](https://huggingface.co/collections/black-forest-labs/flux2) |
| `flux2-klein-4b.safetensors` | FLUX.2 Klein 4B (경량) | [Black Forest Labs Collection](https://huggingface.co/collections/black-forest-labs/flux2) |

> ⚠ **9B 모델**은 HuggingFace 로그인 후 Non-Commercial License 동의 필요

#### Text Encoder → `models/text_encoders/`

| 대상      | 다운로드                                                     |
| --------- | ------------------------------------------------------------ |
| 9B 모델용 | [Comfy-Org 9B — split_files/text_encoders](https://huggingface.co/Comfy-Org/vae-text-encorder-for-flux-klein-9b/tree/main/split_files/text_encoders) |
| 4B 모델용 | [Comfy-Org 4B — split_files/text_encoders](https://huggingface.co/Comfy-Org/vae-text-encorder-for-flux-klein-4b/tree/main/split_files/text_encoders) |

#### VAE → `models/vae/`

| 다운로드                                                     |
| ------------------------------------------------------------ |
| [Comfy-Org 9B — split_files/vae](https://huggingface.co/Comfy-Org/vae-text-encorder-for-flux-klein-9b/tree/main/split_files/vae) |

#### Faceswap LoRA → `models/loras/`  *(Faceswap 모드 사용 시)*

| 파일명                                                   | 다운로드                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------ |
| `bfs_head_v1_flux-klein_9b_step3500_rank128.safetensors` | [다운로드](https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap/blob/main/bfs_head_v1_flux-klein_9b_step3500_rank128.safetensors) |
| `bfs_head_v1_flux-klein_4b.safetensors`                  | [다운로드](https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap/blob/main/bfs_head_v1_flux-klein_4b.safetensors) |

#### BG Removal → `models/background_removal/`  *(Edit·Paint 마스크 사용 시)*

| 다운로드                                                     |
| ------------------------------------------------------------ |
| [Comfy-Org/BiRefNet — background_removal](https://huggingface.co/Comfy-Org/BiRefNet/tree/main/background_removal) |

---

### 3-3. Qwen Image Edit 2511 ONE STUDIO 모델

> 전체 모델 목록: https://huggingface.co/Comfy-Org/Qwen2.5-VL-7B-Image-Edit

#### Diffusion Model → `models/diffusion_models/`

| 파일명                                      | 설명                    | 다운로드                                                     |
| ------------------------------------------- | ----------------------- | ------------------------------------------------------------ |
| `Qwen2.5-VL-7B-Image-Edit-bf16.safetensors` | 메인 모델 BF16 **권장** | [HF 목록](https://huggingface.co/Comfy-Org/Qwen2.5-VL-7B-Image-Edit/tree/main/split_files/diffusion_models) |
| GGUF 경량 버전                              | 저VRAM 환경             | [HF 목록](https://huggingface.co/Comfy-Org/Qwen2.5-VL-7B-Image-Edit/tree/main/split_files/diffusion_models) |

#### Text Encoder (CLIPLoader qwen_image) → `models/text_encoders/`

| 파일명                                 | 다운로드                                                     |
| -------------------------------------- | ------------------------------------------------------------ |
| `qwen2.5vl-7b-vis-encoder.safetensors` | [HF 목록](https://huggingface.co/Comfy-Org/Qwen2.5-VL-7B-Image-Edit/tree/main/split_files/text_encoders) |

#### VAE → `models/vae/`

| 파일명           | 다운로드                                                     |
| ---------------- | ------------------------------------------------------------ |
| `ae.safetensors` | [HF 목록](https://huggingface.co/Comfy-Org/Qwen2.5-VL-7B-Image-Edit/tree/main/split_files/vae) |

#### Lightning LoRA → `models/loras/`  *(4스텝 고속 생성, 선택사항)*

| 파일명                                                       | 다운로드                                                     |
| ------------------------------------------------------------ | ------------------------------------------------------------ |
| `Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors` | [HF 목록](https://huggingface.co/Comfy-Org/Qwen2.5-VL-7B-Image-Edit/tree/main/split_files/loras) |

#### Multi Angle LoRA → `models/loras/`  *(Angle 모드 필수)*

| 파일명                                                  | 다운로드                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------ |
| `qwen-image-edit-2511-multiple-angles-lora.safetensors` | [HF 목록](https://huggingface.co/fal/Qwen-Image-Edit-2511-Multiple-Angles-LoRA) |

#### BFS LoRA → `models/loras/`  *(Faceswap 모드 필수)*

| 다운로드                                                     |
| ------------------------------------------------------------ |
| [Alissonerdx/BFS-Best-Face-Swap](https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap) |

---

### 3-4. Krea 2 ONE STUDIO 모델

> 전체 모델 목록: https://huggingface.co/Comfy-Org/Krea2

#### Diffusion Model → `models/diffusion_models/`

| 설명                   | 다운로드                                                     |
| ---------------------- | ------------------------------------------------------------ |
| Krea2 UNet (GGUF 포함) | [HF 목록](https://huggingface.co/Comfy-Org/Krea2/tree/main/split_files/diffusion_models) |

#### Text Encoder (CLIP krea2) → `models/text_encoders/`

| 다운로드                                                     |
| ------------------------------------------------------------ |
| [HF 목록](https://huggingface.co/Comfy-Org/Krea2/tree/main/split_files/text_encoders) |

#### VAE → `models/vae/`

| 다운로드                                                     |
| ------------------------------------------------------------ |
| [HF 목록](https://huggingface.co/Comfy-Org/Krea2/tree/main/split_files/vae) |

#### Lightning LoRA → `models/loras/`  *(4스텝 고속 생성, 선택사항)*

| 다운로드                                                     |
| ------------------------------------------------------------ |
| [HF 목록](https://huggingface.co/Comfy-Org/Krea2/tree/main/split_files/loras) |

---

### 3-5. SeedVR2 Upscale 모델 (전체 노드 공용)

모든 노드의 **UPSCALE 모드**에서 동일한 폴더를 사용합니다.

#### → `models/SEEDVR2/`

| 파일명                                  | 설명                | 다운로드                                                     |
| --------------------------------------- | ------------------- | ------------------------------------------------------------ |
| `seedvr2_ema_3b_fp16.safetensors`       | DiT 3B FP16         | [kijai/SeedVR2-models](https://huggingface.co/kijai/SeedVR2-models/tree/main) |
| `seedvr2_ema_3b_fp8_e4m3fn.safetensors` | DiT 3B FP8 (저VRAM) | [kijai/SeedVR2-models](https://huggingface.co/kijai/SeedVR2-models/tree/main) |
| `seedvr2_ema_7b_fp8_e4m3fn.safetensors` | DiT 7B FP8 (고품질) | [kijai/SeedVR2-models](https://huggingface.co/kijai/SeedVR2-models/tree/main) |
| `ema_vae_fp16.safetensors`              | VAE FP16            | [kijai/SeedVR2-models](https://huggingface.co/kijai/SeedVR2-models/tree/main) |

> DiT 모델과 VAE 모델 **둘 다** 필요합니다.  
> Upscale 모드 → **↻ Refresh** 버튼으로 모델 목록을 새로 고칩니다.

---

## 4. 초기 설정

ComfyUI 캔버스에서 노드 우상단 **⚙** 버튼을 눌러 Settings를 엽니다.

| 항목                 | 설명                                          |
| -------------------- | --------------------------------------------- |
| **Diffusion Model**  | 다운로드한 UNet/DiT 파일 선택                 |
| **Text Encoder**     | 텍스트 인코더 파일 선택                       |
| **VAE**              | VAE 파일 선택                                 |
| **↻ Refresh Models** | ComfyUI 재시작 없이 새 모델 파일 인식         |
| **언어 / Language**  | 한국어 / English 전환 (선택 후 자동 새로고침) |
| **Negative Prompt**  | 전 모드 공통 부정 프롬프트                    |
| **Prompt Suffix**    | 모든 프롬프트 끝에 자동 추가 키워드           |
| **Save Subfolder**   | `ComfyUI/output/` 하위 저장 폴더명            |
| **💾 Save All**       | 서버에 설정 영구 저장                         |

설정은 **브라우저 로컬스토리지에 자동 저장**되어 재시작 후에도 유지됩니다.

### 모델 오버라이드 슬롯 (고급)

Settings → **Model Override** 체크박스를 켜면 노드에 입력 슬롯이 노출됩니다.  
`Primitive (String)` 노드를 연결해 파일명을 입력하면 드롭다운보다 우선 적용됩니다.  
`.gguf` 파일명 입력 시 자동으로 GGUF 로더를 사용합니다.

---

## 5. 모드별 간략 설명

### Z-Image ONE STUDIO (TJ)

| 모드            | 설명                     | 주요 설정                                                    |
| --------------- | ------------------------ | ------------------------------------------------------------ |
| **T2I**         | 텍스트 → 이미지          | 해상도 프리셋, Steps, CFG, Shift, Sampler, LoRA (최대 3개)   |
| **I2I**         | 이미지 → 이미지 변형     | 소스 이미지 업로드, Denoise (0.5~1.0)                        |
| **INPAINT**     | 특정 영역 재생성         | 소스 이미지 → 캔버스에서 마스크 드로잉 (DifferentialDiffusion) |
| **OUTPAINT**    | 캔버스 확장              | Up/Down/Left/Right 픽셀 설정 → 빈 영역 자동 생성             |
| **RE-BG**       | 배경 완전 재생성         | BiRefNet으로 피사체 분리 → 새 배경 생성 후 합성              |
| **CONTROLNET**  | 레퍼런스 기반 생성       | 레퍼런스 이미지 → Preprocessor 선택 → Strength 조절          |
| **FACE REDRAW** | 얼굴 자동 감지 후 재생성 | YOLOv8/v9 감지 → LoRA 적용 재생성 → 원본에 자연 블렌드       |
| **UPSCALE**     | SeedVR2 AI 업스케일      | DiT 모델 + VAE 선택 → Resolution / Attention Mode 설정       |

### Flux.2 Klein ONE STUDIO (TJ)

| 모드         | 설명                        | 주요 설정                                                    |
| ------------ | --------------------------- | ------------------------------------------------------------ |
| **T2I**      | 텍스트 → 이미지             | 해상도, Steps(권장 4), CFG(권장 1), Sampler(euler_sde), LoRA (최대 3개) |
| **I2I**      | 이미지 → 이미지 변형        | Denoise 0.5~0.75(형태 유지) / 0.8~1.0(대폭 변형)             |
| **EDIT**     | 멀티 레퍼런스 편집          | 참조 이미지 1~5장, Size Source (이미지1 기준 출력 크기)      |
| **PAINT**    | 특정 영역 재생성 + Outpaint | 캔버스 마스크 드로잉, 아웃페인트 방향/크기 설정              |
| **FACESWAP** | 얼굴 교체 재생성            | Source(얼굴 공여자) + Target(원본) 업로드, BFS LoRA 강도 조절 |
| **UPSCALE**  | SeedVR2 AI 업스케일         | DiT 모델 + VAE 선택                                          |

### Qwen Image Edit 2511 ONE STUDIO (TJ)

| 모드         | 설명                      | 주요 설정                                                    |
| ------------ | ------------------------- | ------------------------------------------------------------ |
| **T2I**      | 텍스트 → 이미지           | 해상도, Steps, CFG, Sampler, LoRA (최대 3개), Lightning LoRA (⚙ Settings) |
| **I2I**      | 이미지 → 이미지 변형      | 소스 이미지, Denoise 조절                                    |
| **EDIT**     | 멀티 레퍼런스 텍스트 편집 | 참조 이미지 최대 3장, Outpaint 포함                          |
| **PAINT**    | 특정 영역 재생성          | ComfyUI 내장 마스크 에디터, Denoise 0.7~0.9 권장             |
| **FACESWAP** | 얼굴 교체                 | Target + Source 이미지, BFS LoRA 필수                        |
| **ANGLE**    | 카메라 앵글 3D 조절       | H(방위각) · V(고도각) · Z(줌) 드래그 조절, Camera Angle LoRA (⚙ Settings) |
| **UPSCALE**  | SeedVR2 AI 업스케일       | DiT 모델 + VAE 선택                                          |

### Krea 2 ONE STUDIO (TJ)

| 모드        | 설명                 | 주요 설정                                                    |
| ----------- | -------------------- | ------------------------------------------------------------ |
| **T2I**     | 텍스트 → 이미지      | 해상도, Steps, CFG, Sampler, LoRA (최대 3개), Lightning LoRA (⚙ Settings) |
| **I2I**     | 이미지 → 이미지 변형 | 소스 이미지, Denoise 조절                                    |
| **UPSCALE** | SeedVR2 AI 업스케일  | DiT 모델 + VAE 선택                                          |

---

## 공통 기능

| 기능              | 설명                                                         |
| ----------------- | ------------------------------------------------------------ |
| **⇌ Compare**     | 드래그 슬라이더로 원본 / 결과 나란히 비교                    |
| **🖼 Gallery**     | 저장된 이미지 정사각형 그리드 보기. 즐겨찾기(★) · 삭제 · Send to |
| **📋 Templates**   | 자주 쓰는 프롬프트 저장 · 불러오기                           |
| **🔍 Prompt Edit** | 확장 편집 팝업 (긴 프롬프트 편집)                            |
| **Scroll Zoom**   | 결과 이미지 위 마우스 스크롤 확대/축소                       |
| **Double Click**  | 결과 이미지 더블클릭 → 전체화면 뷰어                         |
| **Send to**       | 결과를 다른 모드의 소스로 즉시 전달                          |
| **Language**      | Settings에서 한국어 / English 전환                           |
| **ESC**           | 열린 팝업 / 갤러리 / 전체화면 닫기                           |

---

## 6. 문제 해결

| 증상                                   | 해결 방법                                                    |
| -------------------------------------- | ------------------------------------------------------------ |
| 모델이 드롭다운에 안 보임              | Settings → ↻ **Refresh Models** 클릭                         |
| SEEDVR2 모델 목록 안 나옴              | Upscale 모드 → **↻ Refresh** 클릭 · `models/SEEDVR2/` 폴더 확인 |
| Outpaint 생성 시 완전히 새 이미지 생성 | ComfyUI-KJNodes 최신 버전 설치 확인 (`ImagePadKJ` 노드 필요) |
| Face Redraw 오류                       | ComfyUI-Impact-Pack + ComfyUI-Impact-Subpack 설치 확인       |
| KV Cache 오류 (Klein)                  | 파일명에 `kv` 미포함 시 자동 비활성화 — KV 모델 파일명 확인  |
| GGUF 모델 안 로딩                      | ComfyUI-GGUF 커스텀 노드 설치 확인                           |
| Faceswap 얼굴 미감지                   | ComfyUI_FaceAnalysis 설치 + `insightface` pip 설치 확인      |
| RE-BG 오류                             | ComfyUI-RMBG 설치 + `models/background_removal/` 모델 확인   |
| QE2511 FluxKontext 노드 미발견 오류    | ComfyUI-KJNodes 최신 버전으로 업데이트                       |
| 언어 전환 후 반영 안 됨                | Settings에서 언어 선택 후 자동 새로고침 대기                 |

---

## 폴더 구조

```
ComfyUI/
├── custom_nodes/
│   └── ComfyUI-TJ_NODE_ONE/     ← 이 패키지
│
└── models/
    ├── diffusion_models/         ← UNet / DiT 메인 모델 (전체 노드)
    ├── text_encoders/            ← CLIP / Qwen / Gemma / Krea2 인코더
    ├── vae/                      ← VAE (전체 노드)
    ├── loras/                    ← LoRA (Faceswap BFS, Lightning, Angle 포함)
    ├── controlnet/               ← ControlNet Union (Z-Image)
    ├── ultralytics/
    │   └── bbox/                 ← face_yolov8m.pt 등 (Z-Image Face Redraw)
    ├── background_removal/       ← BiRefNet 모델 (Z-Image RE-BG)
    └── SEEDVR2/                  ← SeedVR2 DiT + VAE (전체 노드 Upscale)
```

---

*MIT License · [TJ NODE ONE](https://github.com/designloves2/ComfyUI-TJ_NODE_STUDIO_ONE)*

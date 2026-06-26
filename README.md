# TJ NODE STUDIO ONE (통합 패키지)

> **ComfyUI 올인원 이미지 생성 UI 패키지** — Z-Image ONE STUDIO와 Flux.2 Klein ONE STUDIO 두 가지 노드를 단일 패키지로 제공합니다.  
> 워크플로우 배선 없이 노드 하나에서 T2I · I2I · Inpaint · ControlNet · Faceswap · Upscale(SeedVR2) 등 다양한 모드를 전환합니다.

---<img width="1463" height="639" alt="Screen Shot 2026-06-26 at 01 17 08 831 AM" src="https://github.com/user-attachments/assets/c48aad26-00a0-4fc2-8f39-e916cc9e831e" />


## 목차

1. [포함 노드](#포함-노드)
2. [설치 방법](#설치-방법)
3. [필수 커스텀 노드](#필수-커스텀-노드)
4. [Z-Image ONE STUDIO — 기능 상세](#z-image-one--기능-상세)
5. [Flux.2 Klein ONE STUDIO — 기능 상세](#flux2-klein-one--기능-상세)
6. [공통 기능](#공통-기능)
7. [라이선스](#라이선스)

---

## 포함 노드

| 노드 이름                        | 대상 모델                             | 지원 모드                                                    |
| -------------------------------- | ------------------------------------- | ------------------------------------------------------------ |
| **Z-Image ONE STUDIO (TJ)**      | Lumina2 / AuraFlow 계열 flow-matching | T2I · I2I · Inpaint · Outpaint · RE-BG · ControlNet · Face Redraw · **Upscale** |
| **Flux.2 Klein ONE STUDIO (TJ)** | Flux.2-Klein (9B)                     | T2I · I2I · Edit · Inpaint · Faceswap · **Upscale**          |

---

## 설치 방법

### ComfyUI Manager (권장)

ComfyUI Manager → Install Custom Nodes → `ComfyUI-TJ_NODE_ONE` 검색 후 설치

### 수동 설치

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/your-repo/ComfyUI-TJ_NODE_ONE.git
```

ComfyUI를 재시작하면 Add Node 메뉴에서 두 노드를 모두 찾을 수 있습니다.

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
| [ComfyUI-KJNodes](https://github.com/kijai/ComfyUI-KJNodes)  | FluxKVCache 등 보조 노드                         | Klein                   |
| [ComfyUI-GGUF](https://github.com/city96/ComfyUI-GGUF)       | GGUF 형식 모델 로딩                              | 선택 (GGUF 사용 시)     |
| [ComfyUI_FaceAnalysis](https://github.com/cubiq/ComfyUI_FaceAnalysis) | Faceswap 모드 얼굴 감지                          | Klein Faceswap          |
| [ComfyUI-RMBG](https://github.com/1038lab/ComfyUI-RMBG)      | 배경 제거                                        | Z-Image RE-BG           |
| [comfyui_controlnet_aux](https://github.com/Fannovel16/comfyui_controlnet_aux) | ControlNet 전처리기                              | Z-Image ControlNet      |
| [ComfyUI-SeedVR2](https://github.com/kijai/ComfyUI-SeedVR2)  | SeedVR2 AI 업스케일 노드                         | Klein & Z-Image Upscale |
---

## Z-Image ONE STUDIO — 기능 상세

### 지원 모드

| 모드            | 설명                                                   |
| --------------- | ------------------------------------------------------ |
| **T2I**         | 텍스트 → 이미지 기본 생성                              |
| **I2I**         | 소스 이미지 기반 변형 생성                             |
| **INPAINT**     | 내장 마스크 에디터로 특정 영역만 재생성                |
| **OUTPAINT**    | 이미지 캔버스 확장 후 빈 영역 인페인트                 |
| **RE-BG**       | RMBG로 서브젝트 분리 → 배경 완전 재생성                |
| **CONTROLNET**  | Depth / Canny / Pose / HED / MLSD 레퍼런스 가이드 생성 |
| **FACE REDRAW** | 얼굴 자동 감지 → 크롭 → LoRA 재생성 → 원본에 블렌드    |
| **UPSCALE**     | SeedVR2 AI 업스케일 — DiT 모델 기반 초고해상도 변환    |

### 필수 모델

| 종류            | 경로                       | 예시 파일명                 |
| --------------- | -------------------------- | --------------------------- |
| Diffusion Model | `models/diffusion_models/` | `lumina2-2b.safetensors`    |
| Text Encoder    | `models/text_encoders/`    | `gemma-2-2b-it.safetensors` |
| VAE             | `models/vae/`              | `ae.safetensors`            |
| ControlNet      | `models/controlnet/`       | 모드별 별도                 |

---

## Flux.2 Klein ONE STUDIO — 기능 상세

### 지원 모드

| 모드         | 설명                                                |
| ------------ | --------------------------------------------------- |
| **T2I**      | 텍스트 → 이미지 기본 생성                           |
| **I2I**      | 소스 이미지 기반 변형 생성                          |
| **EDIT**     | 레퍼런스 이미지 1~2장 기반 스타일/구도 편집         |
| **INPAINT**  | 내장 마스크 에디터로 특정 영역만 재생성             |
| **FACESWAP** | BFS 얼굴 LoRA를 사용한 얼굴 교체·재생성             |
| **UPSCALE**  | SeedVR2 AI 업스케일 — DiT 모델 기반 초고해상도 변환 |

### 필수 모델

| 종류            | 경로                       | 예시 파일명                      |
| --------------- | -------------------------- | -------------------------------- |
| Diffusion Model | `models/diffusion_models/` | `flux-2-klein-9b.safetensors`    |
| Text Encoder    | `models/text_encoders/`    | `qwen_3_8b_fp8mixed.safetensors` |
| VAE             | `models/vae/`              | `flux2-vae.safetensors`          |

> **KV Cache**: 파일명에 `kv`가 포함된 모델은 자동으로 FluxKVCache 노드를 활성화합니다.

### SeedVR2 Upscale 모델

| 종류     | 경로              |
| -------- | ----------------- |
| DiT 모델 | `models/SEEDVR2/` |
| VAE 모델 | `models/SEEDVR2/` |

Upscale 모드에서 **↻ Refresh** 버튼으로 모델 목록을 불러옵니다. 두 노드(Z-Image / Klein) 모두 동일한 `models/SEEDVR2/` 폴더를 공유합니다.

---

## 공통 기능

### 설정 패널 (⚙ Settings)

- **Diffusion Model / Text Encoder / VAE** 드롭다운 선택
- **↻ Refresh Models** — 모델 폴더 재스캔 (ComfyUI 재시작 없이 새 파일 인식)
- **Negative Prompt** — 전체 모드 공통 적용
- **Prompt Suffix** — 프롬프트 뒤에 자동 추가
- **Save Folder** — `ComfyUI/output/` 내부 하위 저장 폴더 지정
- **모델 오버라이드 슬롯** — Primitive(String) 노드 연결로 설정 드롭다운 우선 적용

### 모델 오버라이드 슬롯

Settings → 모델 오버라이드 슬롯 체크박스를 활성화하면 노드에 입력 슬롯이 노출됩니다.  
Primitive 텍스트 노드에 파일명을 입력하여 연결하면 해당 파일명이 우선 사용됩니다.

| 슬롯             | 설명                   |
| ---------------- | ---------------------- |
| `model_override` | Diffusion Model 파일명 |
| `clip_override`  | Text Encoder 파일명    |
| `vae_override`   | VAE 파일명             |

`.gguf` 파일을 입력하면 자동으로 GGUF 로더(`UnetLoaderGGUF` / `CLIPLoaderGGUF`)를 사용합니다.  
저 VRAM 환경에서 GGUF 양자화 모델을 사용할 때 유용합니다.

### 입력 슬롯 (전체)

| 슬롯              | 타입   | 설명                                 |
| ----------------- | ------ | ------------------------------------ |
| `prompt_override` | STRING | 프롬프트 앞에 추가할 텍스트 (일회성) |
| `model_override`  | STRING | 모델 파일명 오버라이드               |
| `clip_override`   | STRING | CLIP 파일명 오버라이드               |
| `vae_override`    | STRING | VAE 파일명 오버라이드                |

### LoRA

- 최대 3개 LoRA 체인 (Faceswap 모드는 1개)
- `.safetensors` 헤더에서 트리거 워드 자동 추출 및 표시
- ON/OFF 토글로 개별 활성화
- Strength 0~2 조절

### 갤러리 (🖼 Gallery)

- 저장된 이미지 타일 보기 (무한 스크롤)
- 즐겨찾기(★) / 삭제 / 폴더 열기 / Send to(모드에 이미지 전달)
- ESC 키로 닫기

### 비교 슬라이더 (⇌ Compare)

- 생성 전 원본과 생성 후 결과를 드래그로 나란히 비교

### 프롬프트 확장 편집 (🔍)

- 프롬프트 헤더의 🔍 버튼으로 확장 편집 모드 열기
- 큰 텍스트 에디터에서 긴 프롬프트 편집

### 템플릿 (📋)

- 자주 쓰는 프롬프트를 템플릿으로 저장·불러오기

### 단축키

| 키    | 동작                               |
| ----- | ---------------------------------- |
| `ESC` | 열린 팝업 / 갤러리 / 오버레이 닫기 |

---

## 

---
# TJ NODE STUDIO ONE — 설치 및 설정 가이드

> **Z-Image ONE STUDIO (TJ)** · **Flux.2 Klein ONE STUDIO (TJ)**  
> ComfyUI 올인원 이미지 생성 UI — 워크플로우 배선 없이 노드 하나에서 T2I · I2I · Inpaint · Upscale 등 모든 모드를 전환합니다.

---

## 목차

1. [TJ NODE 패키지](#1-tj-node-패키지)
2. [필수 커스텀 노드](#2-필수-커스텀-노드)
3. [모델 다운로드](#3-모델-다운로드)
4. [초기 설정](#4-초기-설정)
5. [모드별 간략 설명](#5-모드별-간략-설명)

---

## 1. TJ NODE 패키지

### 이 패키지 (통합 설치)

| 패키지                 | 설명                                              | GitHub                                                       |
| ---------------------- | ------------------------------------------------- | ------------------------------------------------------------ |
| **TJ_NODE_STUDIO_ONE** | Z-Image ONE STUDIO + Flux.2 Klein ONE STUDIO 통합 | [ComfyUI-TJ_NODE_STUDIO_ONE](https://github.com/designloves2/ComfyUI-TJ_NODE_STUDIO_ONE) |

### 관련 TJ 패키지

| 패키지                          | 설명                                      | GitHub                                                       |
| ------------------------------- | ----------------------------------------- | ------------------------------------------------------------ |
| **TJ_NODE — LLM PROMPT STUDIO** | LLM 기반 프롬프트 생성 · 번역 · 보조 노드 | [ComfyUI-TJ_NODE](https://github.com/designloves2/ComfyUI-TJ_NODE) |

> **설치**: ComfyUI Manager → Install Custom Nodes → `ComfyUI-TJ_NODE_STUDIO_ONE` 검색  
> 또는 수동: `cd ComfyUI/custom_nodes && git clone https://github.com/designloves2/ComfyUI-TJ_NODE_STUDIO_ONE.git`

---

## 2. 필수 커스텀 노드

아래 노드들은 ComfyUI Manager에서 검색하여 설치하거나 GitHub에서 직접 clone합니다.

| 커스텀 노드                | 용도                                                    | 필요 노드                  | GitHub                                                       |
| -------------------------- | ------------------------------------------------------- | -------------------------- | ------------------------------------------------------------ |
| **ComfyUI-Impact-Pack**    | FaceDetailer — 얼굴 감지·재생성·블렌드 핵심 엔진        | Z-Image · Face Redraw 모드 | [ltdrdata/ComfyUI-Impact-Pack](https://github.com/ltdrdata/ComfyUI-Impact-Pack) |
| **ComfyUI-Impact-Subpack** | Impact Pack 의존 서브팩 (Impact Pack 설치 시 함께 필요) | Z-Image · Face Redraw 모드 | [ltdrdata/ComfyUI-Impact-Subpack](https://github.com/ltdrdata/ComfyUI-Impact-Subpack) |
| **ComfyUI-KJNodes**        | FluxKVCache · 보조 유틸 노드                            | Flux.2 Klein               | [kijai/ComfyUI-KJNodes](https://github.com/kijai/ComfyUI-KJNodes) |
| **ComfyUI-GGUF**           | GGUF 양자화 모델 로딩                                   | 선택 (GGUF 사용 시)        | [city96/ComfyUI-GGUF](https://github.com/city96/ComfyUI-GGUF) |
| **ComfyUI_FaceAnalysis**   | Faceswap 얼굴 임베딩 분석                               | Klein · Faceswap 모드      | [cubiq/ComfyUI_FaceAnalysis](https://github.com/cubiq/ComfyUI_FaceAnalysis) |
| **ComfyUI-RMBG**           | 배경 제거 (RE-BG 모드)                                  | Z-Image · RE-BG 모드       | [1038lab/ComfyUI-RMBG](https://github.com/1038lab/ComfyUI-RMBG) |
| **comfyui_controlnet_aux** | ControlNet 전처리기 (Depth · Canny · Pose 등)           | Z-Image · ControlNet 모드  | [Fannovel16/comfyui_controlnet_aux](https://github.com/Fannovel16/comfyui_controlnet_aux) |
| **ComfyUI-SeedVR2**        | SeedVR2 AI 업스케일 (UPSCALE 모드)                      | 양쪽 노드 · Upscale 모드   | [kijai/ComfyUI-SeedVR2](https://github.com/kijai/ComfyUI-SeedVR2) |

---

## 3. 모델 다운로드

### 3-1. Z-Image ONE STUDIO 모델

#### Diffusion Model → `models/diffusion_models/`

| 파일명                           | 설명                        | 다운로드                                                     |
| -------------------------------- | --------------------------- | ------------------------------------------------------------ |
| `z_image_turbo_bf16.safetensors` | Z-Image Turbo BF16 **권장** | [다운로드](https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/diffusion_models/z_image_turbo_bf16.safetensors) |

> 전체 모델 목록: https://huggingface.co/Comfy-Org/z_image_turbo

#### Text Encoder → `models/text_encoders/`

| 파일명                  | 설명                   | 다운로드                                                     |
| ----------------------- | ---------------------- | ------------------------------------------------------------ |
| `qwen_3_4b.safetensors` | Qwen3-4B 텍스트 인코더 | [다운로드](https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/text_encoders/qwen_3_4b.safetensors) |

#### VAE → `models/vae/`

| 파일명           | 설명        | 다운로드                                                     |
| ---------------- | ----------- | ------------------------------------------------------------ |
| `ae.safetensors` | Z-Image VAE | [다운로드](https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/vae/ae.safetensors) |

#### ControlNet → `models/controlnet/`  *(ControlNet 모드 사용 시)*

| 파일명                                           | 설명                                            | 다운로드                                                     |
| ------------------------------------------------ | ----------------------------------------------- | ------------------------------------------------------------ |
| `Z-Image-Turbo-Fun-Controlnet-Union.safetensors` | Union ControlNet (Depth · Canny · Pose 등 통합) | [다운로드](https://huggingface.co/alibaba-pai/Z-Image-Turbo-Fun-Controlnet-Union/resolve/main/Z-Image-Turbo-Fun-Controlnet-Union.safetensors) |

#### Face Detector → `models/ultralytics/bbox/`  *(Face Redraw 모드 사용 시)*

| 파일명            | 설명                      | 다운로드                                                     |
| ----------------- | ------------------------- | ------------------------------------------------------------ |
| `face_yolov8m.pt` | YOLOv8 얼굴 감지 **권장** | [다운로드](https://huggingface.co/Bingsu/adetailer/resolve/main/face_yolov8m.pt) |
| `face_yolov9c.pt` | YOLOv9 얼굴 감지          | [다운로드](https://huggingface.co/Bingsu/adetailer/resolve/main/face_yolov9c.pt) |

#### BG Removal → `models/background_removal/`  *(RE-BG 모드 사용 시)*

| 파일명                  | 설명                             | 다운로드                                                     |
| ----------------------- | -------------------------------- | ------------------------------------------------------------ |
| `BiRefNet-general.pth`  | BiRefNet 범용 배경 제거 **권장** | [다운로드](https://huggingface.co/ZhengPeng7/BiRefNet/resolve/main/BiRefNet-general.pth) |
| `BiRefNet-portrait.pth` | BiRefNet 인물 특화               | [다운로드](https://huggingface.co/ZhengPeng7/BiRefNet-portrait/resolve/main/BiRefNet-portrait.pth) |

---

### 3-2. Flux.2 Klein ONE STUDIO 모델

#### Diffusion Model → `models/diffusion_models/`

| 파일명                       | 설명                        | 다운로드                                                     |
| ---------------------------- | --------------------------- | ------------------------------------------------------------ |
| `flux2-klein-9b.safetensors` | FLUX.2 Klein 9B (메인 모델) | [Black Forest Labs HF Collection](https://huggingface.co/collections/black-forest-labs/flux2) |
| `flux2-klein-4b.safetensors` | FLUX.2 Klein 4B (경량)      | [Black Forest Labs HF Collection](https://huggingface.co/collections/black-forest-labs/flux2) |

> ⚠ **9B 모델**은 HuggingFace 로그인 후 Non-Commercial License 동의 필요

#### Text Encoder → `models/text_encoders/`

**9B 모델용:**

| 설명                          | 다운로드                                                     |
| ----------------------------- | ------------------------------------------------------------ |
| Qwen3 8B 텍스트 인코더 (9B용) | [HuggingFace — split_files/text_encoders](https://huggingface.co/Comfy-Org/vae-text-encorder-for-flux-klein-9b/tree/main/split_files/text_encoders) |

**4B 모델용:**

| 설명                 | 다운로드                                                     |
| -------------------- | ------------------------------------------------------------ |
| 텍스트 인코더 (4B용) | [HuggingFace — split_files/text_encoders](https://huggingface.co/Comfy-Org/vae-text-encorder-for-flux-klein-4b/tree/main/split_files/text_encoders) |

#### VAE → `models/vae/`

| 설명             | 다운로드                                                     |
| ---------------- | ------------------------------------------------------------ |
| Flux.2 Klein VAE | [HuggingFace — split_files/vae](https://huggingface.co/Comfy-Org/vae-text-encorder-for-flux-klein-9b/tree/main/split_files/vae) |

#### Faceswap LoRA → `models/loras/`  *(Faceswap 모드 사용 시)*

| 파일명                                                   | 설명                    | 다운로드                                                     |
| -------------------------------------------------------- | ----------------------- | ------------------------------------------------------------ |
| `bfs_head_v1_flux-klein_9b_step3500_rank128.safetensors` | BFS Head Swap v1 (9B용) | [다운로드](https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap/blob/main/bfs_head_v1_flux-klein_9b_step3500_rank128.safetensors) |
| `bfs_head_v1_flux-klein_4b.safetensors`                  | BFS Head Swap v1 (4B용) | [다운로드](https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap/blob/main/bfs_head_v1_flux-klein_4b.safetensors) |

#### BG Removal → `models/background_removal/`  *(Edit 모드 마스크 사용 시)*

| 설명                             | 다운로드                                                     |
| -------------------------------- | ------------------------------------------------------------ |
| BiRefNet background_removal 모음 | [HuggingFace — Comfy-Org/BiRefNet](https://huggingface.co/Comfy-Org/BiRefNet/tree/main/background_removal) |

---

### 3-3. SeedVR2 Upscale 모델 (공용)

두 노드 모두 **UPSCALE 모드**에서 동일한 모델 폴더를 사용합니다.

#### → `models/SEEDVR2/`

| 파일명                                  | 설명                        | 다운로드                                                     |
| --------------------------------------- | --------------------------- | ------------------------------------------------------------ |
| `seedvr2_ema_3b_fp16.safetensors`       | SeedVR2 DiT 3B FP16         | [kijai/SeedVR2-models](https://huggingface.co/kijai/SeedVR2-models/tree/main) |
| `seedvr2_ema_3b_fp8_e4m3fn.safetensors` | SeedVR2 DiT 3B FP8 (저VRAM) | [kijai/SeedVR2-models](https://huggingface.co/kijai/SeedVR2-models/tree/main) |
| `seedvr2_ema_7b_fp8_e4m3fn.safetensors` | SeedVR2 DiT 7B FP8 (고품질) | [kijai/SeedVR2-models](https://huggingface.co/kijai/SeedVR2-models/tree/main) |
| `ema_vae_fp16.safetensors`              | SeedVR2 VAE FP16            | [kijai/SeedVR2-models](https://huggingface.co/kijai/SeedVR2-models/tree/main) |

> DiT 모델과 VAE 모델 **둘 다** 필요합니다.  
> Upscale 모드 → **↻ Refresh** 버튼으로 모델 목록을 새로 고칩니다.

---

## 4. 초기 설정

### 공통 (첫 실행 시 필수)

ComfyUI 캔버스에서 노드를 더블클릭하거나 우상단 **⚙** 버튼을 눌러 Settings를 엽니다.

| 항목                 | 설명                                  |
| -------------------- | ------------------------------------- |
| **Diffusion Model**  | 다운로드한 UNet/DiT 파일 선택         |
| **Text Encoder**     | 텍스트 인코더 파일 선택               |
| **VAE**              | VAE 파일 선택                         |
| **Negative Prompt**  | 전 모드 공통 부정 프롬프트            |
| **Prompt Suffix**    | 모든 프롬프트 끝에 자동 추가 키워드   |
| **Save Subfolder**   | `ComfyUI/output/` 하위 저장 폴더명    |
| **↻ Refresh Models** | ComfyUI 재시작 없이 새 모델 파일 인식 |

설정은 **브라우저 로컬스토리지에 자동 저장**되어 재시작 후에도 유지됩니다.

### 모델 오버라이드 슬롯 (고급)

Settings → **Model Override Slot** 체크박스를 켜면 노드에 입력 슬롯이 노출됩니다.  
`Primitive (String)` 노드를 연결해 파일명을 입력하면 드롭다운보다 우선 적용됩니다.  
`.gguf` 파일명 입력 시 자동으로 GGUF 로더(`UnetLoaderGGUF` / `CLIPLoaderGGUF`)를 사용합니다.

---

## 5. 모드별 간략 설명

### Z-Image ONE STUDIO (TJ)

| 모드            | 설명                     | 주요 설정                                                    |
| --------------- | ------------------------ | ------------------------------------------------------------ |
| **T2I**         | 텍스트 → 이미지          | 해상도 프리셋, Steps, CFG, Shift, Sampler, LoRA (최대 3개)   |
| **I2I**         | 이미지 → 이미지 변형     | 소스 이미지 업로드, Denoise (0.5~1.0)                        |
| **INPAINT**     | 특정 영역 재생성         | 소스 이미지 업로드 → 캔버스에서 마스크 직접 드로잉           |
| **OUTPAINT**    | 캔버스 확장              | 이미지 업로드 → Up/Down/Left/Right 픽셀 설정 → 빈 영역 자동 생성 |
| **RE-BG**       | 배경 완전 재생성         | BiRefNet으로 피사체 분리 → 새 배경 생성 후 합성              |
| **CONTROLNET**  | 레퍼런스 기반 생성       | 레퍼런스 이미지 업로드 → Preprocessor 선택 (Depth/Canny/Pose 등) → Strength 조절 |
| **FACE REDRAW** | 얼굴 자동 감지 후 재생성 | YOLOv8/v9 감지 → 크롭 → LoRA 적용 재생성 → 원본에 자연 블렌드 |
| **UPSCALE**     | SeedVR2 AI 업스케일      | DiT 모델 + VAE 선택 → Resolution / Batch Size / Attention Mode 설정 |

### Flux.2 Klein ONE STUDIO (TJ)

| 모드         | 설명                 | 주요 설정                                                    |
| ------------ | -------------------- | ------------------------------------------------------------ |
| **T2I**      | 텍스트 → 이미지      | 해상도, Steps(권장 4), CFG(권장 1), Sampler(euler_sde), LoRA (최대 3개) |
| **I2I**      | 이미지 → 이미지 변형 | 소스 이미지, Denoise 0.5~0.75(형태 유지) / 0.8~1.0(대폭 변형) |
| **EDIT**     | 멀티 레퍼런스 편집   | 참조 이미지 1~5장, Size Source (이미지1 기준 출력 크기)      |
| **PAINT**    | 특정 영역 재생성     | 소스 이미지 업로드 → 캔버스 마스크 드로잉, Outpaint 지원     |
| **FACESWAP** | 얼굴 교체 재생성     | Source(얼굴 공여자) + Target(원본) 업로드, BFS LoRA 강도 조절 |
| **UPSCALE**  | SeedVR2 AI 업스케일  | DiT 모델 + VAE 선택 → Resolution / Batch Size / Attention Mode 설정 |

---

## 공통 기능

| 기능                | 설명                                                         |
| ------------------- | ------------------------------------------------------------ |
| **⇌ Compare**       | 드래그 슬라이더로 원본 / 결과 나란히 비교. 모드 전환 후에도 상태 유지 |
| **🖼 Gallery**       | 저장된 이미지 타일 보기. 즐겨찾기(★) · 삭제 · Send to(다른 모드로 전달) |
| **📋 Templates**     | 자주 쓰는 프롬프트 저장 · 불러오기                           |
| **🔍 Prompt Edit**   | 프롬프트 헤더 🔍 클릭 → 확장 편집 팝업                        |
| **Scroll Zoom**     | 결과 이미지 위 마우스 스크롤 확대/축소. 🔓/🔒 버튼으로 ON/OFF  |
| **Double Click**    | 결과 이미지 더블클릭 → 전체화면 뷰어                         |
| **Send to**         | 결과를 다른 모드의 소스로 즉시 전달 (→ I2I / → Inpaint / → Upscale 등) |
| **prompt_override** | 노드 입력 슬롯에 Primitive(String) 연결 → 프롬프트 앞에 일회성 추가 |
| **ESC**             | 열린 팝업 / 갤러리 / 전체화면 닫기                           |

---

## 폴더 구조

```
ComfyUI/
├── custom_nodes/
│   └── ComfyUI-TJ_NODE_STUDIO_ONE/     ← 이 패키지
│
└── models/
    ├── diffusion_models/               ← UNet / DiT 메인 모델
    ├── text_encoders/                  ← CLIP / Qwen / Gemma
    ├── vae/                            ← VAE
    ├── loras/                          ← LoRA (Faceswap BFS 포함)
    ├── controlnet/                     ← ControlNet (Z-Image)
    ├── ultralytics/
    │   └── bbox/                       ← face_yolov8m.pt 등
    ├── background_removal/             ← BiRefNet 모델
    └── SEEDVR2/                        ← SeedVR2 DiT + VAE
```

---

## 문제 해결

| 증상                      | 해결 방법                                                    |
| ------------------------- | ------------------------------------------------------------ |
| 모델이 드롭다운에 안 보임 | Settings → ↻ **Refresh Models** 클릭                         |
| SEEDVR2 모델 목록 안 나옴 | Upscale 모드 → **↻ Refresh** 클릭 · `models/SEEDVR2/` 폴더 확인 |
| Face Redraw 오류          | ComfyUI-Impact-Pack + ComfyUI-Impact-Subpack 설치 확인       |
| KV Cache 오류 (Klein)     | 파일명에 `kv` 미포함 시 자동 비활성화 — KV 모델 파일명 확인  |
| GGUF 모델 안 로딩         | ComfyUI-GGUF 커스텀 노드 설치 여부 확인                      |
| Faceswap 얼굴 미감지      | ComfyUI_FaceAnalysis 설치 + `insightface` pip 설치 확인      |
| RE-BG 오류                | ComfyUI-RMBG 설치 + `models/background_removal/` 모델 확인   |

---

*MIT License · [TJ NODE STUDIO ONE](https://github.com/designloves2/ComfyUI-TJ_NODE_STUDIO_ONE)*

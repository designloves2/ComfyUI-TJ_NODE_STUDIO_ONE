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

| 패키지 | 설명 | GitHub |
|---|---|---|
| **TJ_NODE_STUDIO_ONE** | Z-Image ONE STUDIO + Flux.2 Klein ONE STUDIO 통합 | [ComfyUI-TJ_NODE_STUDIO_ONE](https://github.com/designloves2/ComfyUI-TJ_NODE_STUDIO_ONE) |

### 함께 쓰면 더 강력한 — TJ_NODE

| 패키지 | 설명 | GitHub |
|---|---|---|
| **TJ_NODE** | Wireless Workflow Architecture Toolkit — LLM 프롬프트 생성 · Fake-Wire 무선 라우팅 · 대규모 워크플로우 구조화 | [ComfyUI-TJ_NODE](https://github.com/designloves2/ComfyUI-TJ_NODE) |

TJ NODE STUDIO ONE이 **배선 없는 올인원 생성 UI**라면, TJ_NODE는 **대규모 워크플로우를 유지 가능한 구조로 만드는 Architecture Toolkit**입니다.  
두 패키지를 함께 사용하면 LLM 프롬프트 생성 → 이미지 생성 · 편집 · 업스케일 → 저장까지 전체 파이프라인을 깔끔하게 구성할 수 있습니다.

| TJ_NODE 주요 노드 | 기능 |
|---|---|
| **Prompt Studio (TJ)** | LLM 기반 프롬프트 생성 · 강화 · 이미지→프롬프트. GGUF / llama.cpp / TextGenerate 지원 |
| **Scene Maker (TJ)** | Visual Beat 프롬프트 구조 노드. KO/EN/JP/CN 자동 번역 |
| **Wireless Architecture** | Fake-Wire 무선 라우팅 · Multi Router · Batch Workflow · Save Pipeline |

> **설치**: ComfyUI Manager → Install Custom Nodes → `ComfyUI-TJ_NODE_STUDIO_ONE` 검색  
> 또는 수동: `cd ComfyUI/custom_nodes && git clone https://github.com/designloves2/ComfyUI-TJ_NODE_STUDIO_ONE.git`

---

## 2. 필수 커스텀 노드

### ⚡ 자동 설치 스크립트 (권장)

이 패키지 폴더(`ComfyUI-TJ_NODE_STUDIO_ONE/`) 안에 설치 스크립트가 포함되어 있습니다.  
아래 필수 노드 **8개를 한 번에** 설치하고 pip requirements까지 처리합니다.

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

아래 노드들은 ComfyUI Manager에서 검색하여 설치하거나 GitHub에서 직접 clone합니다.

| 커스텀 노드 | 용도 | 필요 노드 | GitHub |
|---|---|---|---|
| **ComfyUI-Impact-Pack** | FaceDetailer — 얼굴 감지·재생성·블렌드 핵심 엔진 | Z-Image · Face Redraw 모드 | [ltdrdata/ComfyUI-Impact-Pack](https://github.com/ltdrdata/ComfyUI-Impact-Pack) |
| **ComfyUI-Impact-Subpack** | Impact Pack 의존 서브팩 (Impact Pack 설치 시 함께 필요) | Z-Image · Face Redraw 모드 | [ltdrdata/ComfyUI-Impact-Subpack](https://github.com/ltdrdata/ComfyUI-Impact-Subpack) |
| **ComfyUI-KJNodes** | FluxKVCache · 보조 유틸 노드 | Flux.2 Klein | [kijai/ComfyUI-KJNodes](https://github.com/kijai/ComfyUI-KJNodes) |
| **ComfyUI-GGUF** | GGUF 양자화 모델 로딩 | 선택 (GGUF 사용 시) | [city96/ComfyUI-GGUF](https://github.com/city96/ComfyUI-GGUF) |
| **ComfyUI_FaceAnalysis** | Faceswap 얼굴 임베딩 분석 | Klein · Faceswap 모드 | [cubiq/ComfyUI_FaceAnalysis](https://github.com/cubiq/ComfyUI_FaceAnalysis) |
| **ComfyUI-RMBG** | 배경 제거 (RE-BG 모드) | Z-Image · RE-BG 모드 | [1038lab/ComfyUI-RMBG](https://github.com/1038lab/ComfyUI-RMBG) |
| **comfyui_controlnet_aux** | ControlNet 전처리기 (Depth · Canny · Pose 등) | Z-Image · ControlNet 모드 | [Fannovel16/comfyui_controlnet_aux](https://github.com/Fannovel16/comfyui_controlnet_aux) |
| **ComfyUI-SeedVR2** | SeedVR2 AI 업스케일 (UPSCALE 모드) | 양쪽 노드 · Upscale 모드 | [kijai/ComfyUI-SeedVR2](https://github.com/kijai/ComfyUI-SeedVR2) |

---

## 3. 모델 다운로드

### 3-1. Z-Image ONE STUDIO 모델

#### Diffusion Model → `models/diffusion_models/`

| 파일명 | 설명 | 다운로드 |
|---|---|---|
| `z_image_turbo_bf16.safetensors` | Z-Image Turbo BF16 **권장** | [다운로드](https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/diffusion_models/z_image_turbo_bf16.safetensors) |

> 전체 모델 목록: https://huggingface.co/Comfy-Org/z_image_turbo

#### Text Encoder → `models/text_encoders/`

| 파일명 | 설명 | 다운로드 |
|---|---|---|
| `qwen_3_4b.safetensors` | Qwen3-4B 텍스트 인코더 | [다운로드](https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/text_encoders/qwen_3_4b.safetensors) |

#### VAE → `models/vae/`

| 파일명 | 설명 | 다운로드 |
|---|---|---|
| `ae.safetensors` | Z-Image VAE | [다운로드](https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/vae/ae.safetensors) |

#### ControlNet → `models/controlnet/`  *(ControlNet 모드 사용 시)*

| 파일명 | 설명 | 다운로드 |
|---|---|---|
| `Z-Image-Turbo-Fun-Controlnet-Union.safetensors` | Union ControlNet (Depth · Canny · Pose 등 통합) | [다운로드](https://huggingface.co/alibaba-pai/Z-Image-Turbo-Fun-Controlnet-Union/resolve/main/Z-Image-Turbo-Fun-Controlnet-Union.safetensors) |

#### Face Detector → `models/ultralytics/bbox/`  *(Face Redraw 모드 사용 시)*

| 파일명 | 설명 | 다운로드 |
|---|---|---|
| `face_yolov8m.pt` | YOLOv8 얼굴 감지 **권장** | [다운로드](https://huggingface.co/Bingsu/adetailer/resolve/main/face_yolov8m.pt) |
| `face_yolov9c.pt` | YOLOv9 얼굴 감지 | [다운로드](https://huggingface.co/Bingsu/adetailer/resolve/main/face_yolov9c.pt) |

#### BG Removal → `models/background_removal/`  *(RE-BG 모드 사용 시)*

| 파일명 | 설명 | 다운로드 |
|---|---|---|
| `BiRefNet-general.pth` | BiRefNet 범용 배경 제거 **권장** | [다운로드](https://huggingface.co/ZhengPeng7/BiRefNet/resolve/main/BiRefNet-general.pth) |
| `BiRefNet-portrait.pth` | BiRefNet 인물 특화 | [다운로드](https://huggingface.co/ZhengPeng7/BiRefNet-portrait/resolve/main/BiRefNet-portrait.pth) |

---

### 3-2. Flux.2 Klein ONE STUDIO 모델

#### Diffusion Model → `models/diffusion_models/`

| 파일명 | 설명 | 다운로드 |
|---|---|---|
| `flux2-klein-9b.safetensors` | FLUX.2 Klein 9B (메인 모델) | [Black Forest Labs HF Collection](https://huggingface.co/collections/black-forest-labs/flux2) |
| `flux2-klein-4b.safetensors` | FLUX.2 Klein 4B (경량) | [Black Forest Labs HF Collection](https://huggingface.co/collections/black-forest-labs/flux2) |

> ⚠ **9B 모델**은 HuggingFace 로그인 후 Non-Commercial License 동의 필요

#### Text Encoder → `models/text_encoders/`

**9B 모델용:**

| 설명 | 다운로드 |
|---|---|
| Qwen3 8B 텍스트 인코더 (9B용) | [HuggingFace — split_files/text_encoders](https://huggingface.co/Comfy-Org/vae-text-encorder-for-flux-klein-9b/tree/main/split_files/text_encoders) |

**4B 모델용:**

| 설명 | 다운로드 |
|---|---|
| 텍스트 인코더 (4B용) | [HuggingFace — split_files/text_encoders](https://huggingface.co/Comfy-Org/vae-text-encorder-for-flux-klein-4b/tree/main/split_files/text_encoders) |

#### VAE → `models/vae/`

| 설명 | 다운로드 |
|---|---|
| Flux.2 Klein VAE | [HuggingFace — split_files/vae](https://huggingface.co/Comfy-Org/vae-text-encorder-for-flux-klein-9b/tree/main/split_files/vae) |

#### Faceswap LoRA → `models/loras/`  *(Faceswap 모드 사용 시)*

| 파일명 | 설명 | 다운로드 |
|---|---|---|
| `bfs_head_v1_flux-klein_9b_step3500_rank128.safetensors` | BFS Head Swap v1 (9B용) | [다운로드](https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap/blob/main/bfs_head_v1_flux-klein_9b_step3500_rank128.safetensors) |
| `bfs_head_v1_flux-klein_4b.safetensors` | BFS Head Swap v1 (4B용) | [다운로드](https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap/blob/main/bfs_head_v1_flux-klein_4b.safetensors) |

#### BG Removal → `models/background_removal/`  *(Edit 모드 마스크 사용 시)*

| 설명 | 다운로드 |
|---|---|
| BiRefNet background_removal 모음 | [HuggingFace — Comfy-Org/BiRefNet](https://huggingface.co/Comfy-Org/BiRefNet/tree/main/background_removal) |

---

### 3-3. SeedVR2 Upscale 모델 (공용)

두 노드 모두 **UPSCALE 모드**에서 동일한 모델 폴더를 사용합니다.

#### → `models/SEEDVR2/`

| 파일명 | 설명 | 다운로드 |
|---|---|---|
| `seedvr2_ema_3b_fp16.safetensors` | SeedVR2 DiT 3B FP16 | [kijai/SeedVR2-models](https://huggingface.co/kijai/SeedVR2-models/tree/main) |
| `seedvr2_ema_3b_fp8_e4m3fn.safetensors` | SeedVR2 DiT 3B FP8 (저VRAM) | [kijai/SeedVR2-models](https://huggingface.co/kijai/SeedVR2-models/tree/main) |
| `seedvr2_ema_7b_fp8_e4m3fn.safetensors` | SeedVR2 DiT 7B FP8 (고품질) | [kijai/SeedVR2-models](https://huggingface.co/kijai/SeedVR2-models/tree/main) |
| `ema_vae_fp16.safetensors` | SeedVR2 VAE FP16 | [kijai/SeedVR2-models](https://huggingface.co/kijai/SeedVR2-models/tree/main) |

> DiT 모델과 VAE 모델 **둘 다** 필요합니다.  
> Upscale 모드 → **↻ Refresh** 버튼으로 모델 목록을 새로 고칩니다.

---

## 4. 초기 설정

### 공통 (첫 실행 시 필수)

ComfyUI 캔버스에서 노드를 더블클릭하거나 우상단 **⚙** 버튼을 눌러 Settings를 엽니다.

| 항목 | 설명 |
|---|---|
| **Diffusion Model** | 다운로드한 UNet/DiT 파일 선택 |
| **Text Encoder** | 텍스트 인코더 파일 선택 |
| **VAE** | VAE 파일 선택 |
| **Negative Prompt** | 전 모드 공통 부정 프롬프트 |
| **Prompt Suffix** | 모든 프롬프트 끝에 자동 추가 키워드 |
| **Save Subfolder** | `ComfyUI/output/` 하위 저장 폴더명 |
| **↻ Refresh Models** | ComfyUI 재시작 없이 새 모델 파일 인식 |

설정은 **브라우저 로컬스토리지에 자동 저장**되어 재시작 후에도 유지됩니다.

### 모델 오버라이드 슬롯 (고급)

Settings → **Model Override Slot** 체크박스를 켜면 노드에 입력 슬롯이 노출됩니다.  
`Primitive (String)` 노드를 연결해 파일명을 입력하면 드롭다운보다 우선 적용됩니다.  
`.gguf` 파일명 입력 시 자동으로 GGUF 로더(`UnetLoaderGGUF` / `CLIPLoaderGGUF`)를 사용합니다.

---

## 5. 모드별 간략 설명

### Z-Image ONE STUDIO (TJ)

| 모드 | 설명 | 주요 설정 |
|---|---|---|
| **T2I** | 텍스트 → 이미지 | 해상도 프리셋, Steps, CFG, Shift, Sampler, LoRA (최대 3개) |
| **I2I** | 이미지 → 이미지 변형 | 소스 이미지 업로드, Denoise (0.5~1.0) |
| **INPAINT** | 특정 영역 재생성 | 소스 이미지 업로드 → 캔버스에서 마스크 직접 드로잉 |
| **OUTPAINT** | 캔버스 확장 | 이미지 업로드 → Up/Down/Left/Right 픽셀 설정 → 빈 영역 자동 생성 |
| **RE-BG** | 배경 완전 재생성 | BiRefNet으로 피사체 분리 → 새 배경 생성 후 합성 |
| **CONTROLNET** | 레퍼런스 기반 생성 | 레퍼런스 이미지 업로드 → Preprocessor 선택 (Depth/Canny/Pose 등) → Strength 조절 |
| **FACE REDRAW** | 얼굴 자동 감지 후 재생성 | YOLOv8/v9 감지 → 크롭 → LoRA 적용 재생성 → 원본에 자연 블렌드 |
| **UPSCALE** | SeedVR2 AI 업스케일 | DiT 모델 + VAE 선택 → Resolution / Batch Size / Attention Mode 설정 |

### Flux.2 Klein ONE STUDIO (TJ)

| 모드 | 설명 | 주요 설정 |
|---|---|---|
| **T2I** | 텍스트 → 이미지 | 해상도, Steps(권장 4), CFG(권장 1), Sampler(euler_sde), LoRA (최대 3개) |
| **I2I** | 이미지 → 이미지 변형 | 소스 이미지, Denoise 0.5~0.75(형태 유지) / 0.8~1.0(대폭 변형) |
| **EDIT** | 멀티 레퍼런스 편집 | 참조 이미지 1~5장, Size Source (이미지1 기준 출력 크기) |
| **PAINT** | 특정 영역 재생성 | 소스 이미지 업로드 → 캔버스 마스크 드로잉, Outpaint 지원 |
| **FACESWAP** | 얼굴 교체 재생성 | Source(얼굴 공여자) + Target(원본) 업로드, BFS LoRA 강도 조절 |
| **UPSCALE** | SeedVR2 AI 업스케일 | DiT 모델 + VAE 선택 → Resolution / Batch Size / Attention Mode 설정 |

---

## 공통 기능

| 기능 | 설명 |
|---|---|
| **⇌ Compare** | 드래그 슬라이더로 원본 / 결과 나란히 비교. 모드 전환 후에도 상태 유지 |
| **🖼 Gallery** | 저장된 이미지 타일 보기. 즐겨찾기(★) · 삭제 · Send to(다른 모드로 전달) |
| **📋 Templates** | 자주 쓰는 프롬프트 저장 · 불러오기 |
| **🔍 Prompt Edit** | 프롬프트 헤더 🔍 클릭 → 확장 편집 팝업 |
| **Scroll Zoom** | 결과 이미지 위 마우스 스크롤 확대/축소. 🔓/🔒 버튼으로 ON/OFF |
| **Double Click** | 결과 이미지 더블클릭 → 전체화면 뷰어 |
| **Send to** | 결과를 다른 모드의 소스로 즉시 전달 (→ I2I / → Inpaint / → Upscale 등) |
| **prompt_override** | 노드 입력 슬롯에 Primitive(String) 연결 → 프롬프트 앞에 일회성 추가 |
| **ESC** | 열린 팝업 / 갤러리 / 전체화면 닫기 |

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

| 증상 | 해결 방법 |
|---|---|
| 모델이 드롭다운에 안 보임 | Settings → ↻ **Refresh Models** 클릭 |
| SEEDVR2 모델 목록 안 나옴 | Upscale 모드 → **↻ Refresh** 클릭 · `models/SEEDVR2/` 폴더 확인 |
| Face Redraw 오류 | ComfyUI-Impact-Pack + ComfyUI-Impact-Subpack 설치 확인 |
| KV Cache 오류 (Klein) | 파일명에 `kv` 미포함 시 자동 비활성화 — KV 모델 파일명 확인 |
| GGUF 모델 안 로딩 | ComfyUI-GGUF 커스텀 노드 설치 여부 확인 |
| Faceswap 얼굴 미감지 | ComfyUI_FaceAnalysis 설치 + `insightface` pip 설치 확인 |
| RE-BG 오류 | ComfyUI-RMBG 설치 + `models/background_removal/` 모델 확인 |

---

*MIT License · [TJ NODE STUDIO ONE](https://github.com/designloves2/ComfyUI-TJ_NODE_STUDIO_ONE)*

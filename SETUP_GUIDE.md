# TJ NODE ONE — 설치 및 설정 가이드

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

| 패키지 | 설명 | GitHub |
|---|---|---|
| **TJ_NODE_STUDIO_ONE** | Z-Image · Klein · QE2511 · Krea2 ONE STUDIO 통합 | [ComfyUI-TJ_NODE_STUDIO_ONE](https://github.com/designloves2/ComfyUI-TJ_NODE_STUDIO_ONE) |

> **설치**: ComfyUI Manager → Install Custom Nodes → `ComfyUI-TJ_NODE_STUDIO_ONE` 검색  
> 또는 수동: `cd ComfyUI/custom_nodes && git clone https://github.com/designloves2/ComfyUI-TJ_NODE_STUDIO_ONE.git`

### 함께 쓰면 더 강력한 — TJ_NODE

| 패키지 | 설명 | GitHub |
|---|---|---|
| **TJ_NODE** | Wireless Workflow Architecture Toolkit — LLM 프롬프트 생성 · Fake-Wire 무선 라우팅 · 대규모 워크플로우 구조화 | [ComfyUI-TJ_NODE](https://github.com/designloves2/ComfyUI-TJ_NODE) |

---

## 2. 필수 커스텀 노드

### ⚡ 자동 설치 스크립트 (권장)

이 패키지 폴더(`ComfyUI-TJ_NODE_STUDIO_ONE/`) 안에 설치 스크립트가 포함되어 있습니다.  
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

| 커스텀 노드 | 용도 | 필요 노드 | GitHub |
|---|---|---|---|
| **ComfyUI-Impact-Pack** | FaceDetailer — 얼굴 감지·재생성·블렌드 핵심 엔진 | Z-Image · Face Redraw | [ltdrdata/ComfyUI-Impact-Pack](https://github.com/ltdrdata/ComfyUI-Impact-Pack) |
| **ComfyUI-Impact-Subpack** | Impact Pack 의존 서브팩 | Z-Image · Face Redraw | [ltdrdata/ComfyUI-Impact-Subpack](https://github.com/ltdrdata/ComfyUI-Impact-Subpack) |
| **ComfyUI-KJNodes** | FluxKVCache · ImagePadKJ · FluxKontext 노드 포함 | Klein · QE2511 | [kijai/ComfyUI-KJNodes](https://github.com/kijai/ComfyUI-KJNodes) |
| **ComfyUI-GGUF** | GGUF 양자화 모델 로딩 | 선택 (GGUF 사용 시) | [city96/ComfyUI-GGUF](https://github.com/city96/ComfyUI-GGUF) |
| **ComfyUI_FaceAnalysis** | Faceswap 얼굴 임베딩 분석 | Klein · QE2511 Faceswap | [cubiq/ComfyUI_FaceAnalysis](https://github.com/cubiq/ComfyUI_FaceAnalysis) |
| **ComfyUI-RMBG** | 배경 제거 (RE-BG 모드) | Z-Image · RE-BG | [1038lab/ComfyUI-RMBG](https://github.com/1038lab/ComfyUI-RMBG) |
| **comfyui_controlnet_aux** | ControlNet 전처리기 (Depth · Canny · Pose 등) | Z-Image · ControlNet | [Fannovel16/comfyui_controlnet_aux](https://github.com/Fannovel16/comfyui_controlnet_aux) |
| **ComfyUI-SeedVR2** | SeedVR2 AI 업스케일 (UPSCALE 모드) | 전체 노드 | [kijai/ComfyUI-SeedVR2](https://github.com/kijai/ComfyUI-SeedVR2) |

---

## 3. 모델 다운로드

### 3-1. Z-Image ONE STUDIO 모델

#### Diffusion Model → `models/diffusion_models/`

| 파일명 | 설명 | 다운로드 |
|---|---|---|
| `z_image_turbo_bf16.safetensors` | Z-Image Turbo BF16 **권장** | [다운로드](https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/diffusion_models/z_image_turbo_bf16.safetensors) |

> 전체 모델 목록: https://huggingface.co/Comfy-Org/z_image_turbo

#### Text Encoder → `models/text_encoders/`

| 파일명 | 다운로드 |
|---|---|
| `qwen_3_4b.safetensors` | [다운로드](https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/text_encoders/qwen_3_4b.safetensors) |

#### VAE → `models/vae/`

| 파일명 | 다운로드 |
|---|---|
| `ae.safetensors` | [다운로드](https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/vae/ae.safetensors) |

#### ControlNet → `models/controlnet/`  *(ControlNet 모드 사용 시)*

| 파일명 | 다운로드 |
|---|---|
| `Z-Image-Turbo-Fun-Controlnet-Union.safetensors` | [다운로드](https://huggingface.co/alibaba-pai/Z-Image-Turbo-Fun-Controlnet-Union/resolve/main/Z-Image-Turbo-Fun-Controlnet-Union.safetensors) |

#### Face Detector → `models/ultralytics/bbox/`  *(Face Redraw 모드 사용 시)*

| 파일명 | 다운로드 |
|---|---|
| `face_yolov8m.pt` **권장** | [다운로드](https://huggingface.co/Bingsu/adetailer/resolve/main/face_yolov8m.pt) |
| `face_yolov9c.pt` | [다운로드](https://huggingface.co/Bingsu/adetailer/resolve/main/face_yolov9c.pt) |

#### BG Removal → `models/background_removal/`  *(RE-BG 모드 사용 시)*

| 파일명 | 다운로드 |
|---|---|
| `BiRefNet-general.pth` **권장** | [다운로드](https://huggingface.co/ZhengPeng7/BiRefNet/resolve/main/BiRefNet-general.pth) |
| `BiRefNet-portrait.pth` | [다운로드](https://huggingface.co/ZhengPeng7/BiRefNet-portrait/resolve/main/BiRefNet-portrait.pth) |

---

### 3-2. Flux.2 Klein ONE STUDIO 모델

#### Diffusion Model → `models/diffusion_models/`

| 모델 | 설명 | 다운로드 |
|---|---|---|
| `flux2-klein-9b.safetensors` | FLUX.2 Klein 9B (메인) | [Black Forest Labs Collection](https://huggingface.co/collections/black-forest-labs/flux2) |
| `flux2-klein-4b.safetensors` | FLUX.2 Klein 4B (경량) | [Black Forest Labs Collection](https://huggingface.co/collections/black-forest-labs/flux2) |

> ⚠ **9B 모델**은 HuggingFace 로그인 후 Non-Commercial License 동의 필요

#### Text Encoder → `models/text_encoders/`

| 대상 | 다운로드 |
|---|---|
| 9B 모델용 | [Comfy-Org 9B — split_files/text_encoders](https://huggingface.co/Comfy-Org/vae-text-encorder-for-flux-klein-9b/tree/main/split_files/text_encoders) |
| 4B 모델용 | [Comfy-Org 4B — split_files/text_encoders](https://huggingface.co/Comfy-Org/vae-text-encorder-for-flux-klein-4b/tree/main/split_files/text_encoders) |

#### VAE → `models/vae/`

| 다운로드 |
|---|
| [Comfy-Org 9B — split_files/vae](https://huggingface.co/Comfy-Org/vae-text-encorder-for-flux-klein-9b/tree/main/split_files/vae) |

#### Faceswap LoRA → `models/loras/`  *(Faceswap 모드 사용 시)*

| 파일명 | 다운로드 |
|---|---|
| `bfs_head_v1_flux-klein_9b_step3500_rank128.safetensors` | [다운로드](https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap/blob/main/bfs_head_v1_flux-klein_9b_step3500_rank128.safetensors) |
| `bfs_head_v1_flux-klein_4b.safetensors` | [다운로드](https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap/blob/main/bfs_head_v1_flux-klein_4b.safetensors) |

#### BG Removal → `models/background_removal/`  *(Edit·Paint 마스크 사용 시)*

| 다운로드 |
|---|
| [Comfy-Org/BiRefNet — background_removal](https://huggingface.co/Comfy-Org/BiRefNet/tree/main/background_removal) |

---

### 3-3. Qwen Image Edit 2511 ONE STUDIO 모델

> 전체 모델 목록: https://huggingface.co/Comfy-Org/Qwen2.5-VL-7B-Image-Edit

#### Diffusion Model → `models/diffusion_models/`

| 파일명 | 설명 | 다운로드 |
|---|---|---|
| `Qwen2.5-VL-7B-Image-Edit-bf16.safetensors` | 메인 모델 BF16 **권장** | [HF 목록](https://huggingface.co/Comfy-Org/Qwen2.5-VL-7B-Image-Edit/tree/main/split_files/diffusion_models) |
| GGUF 경량 버전 | 저VRAM 환경 | [HF 목록](https://huggingface.co/Comfy-Org/Qwen2.5-VL-7B-Image-Edit/tree/main/split_files/diffusion_models) |

#### Text Encoder (CLIPLoader qwen_image) → `models/text_encoders/`

| 파일명 | 다운로드 |
|---|---|
| `qwen2.5vl-7b-vis-encoder.safetensors` | [HF 목록](https://huggingface.co/Comfy-Org/Qwen2.5-VL-7B-Image-Edit/tree/main/split_files/text_encoders) |

#### VAE → `models/vae/`

| 파일명 | 다운로드 |
|---|---|
| `ae.safetensors` | [HF 목록](https://huggingface.co/Comfy-Org/Qwen2.5-VL-7B-Image-Edit/tree/main/split_files/vae) |

#### Lightning LoRA → `models/loras/`  *(4스텝 고속 생성, 선택사항)*

| 파일명 | 다운로드 |
|---|---|
| `Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors` | [HF 목록](https://huggingface.co/Comfy-Org/Qwen2.5-VL-7B-Image-Edit/tree/main/split_files/loras) |

#### BFS LoRA → `models/loras/`  *(Faceswap 모드 필수)*

| 다운로드 |
|---|
| [Alissonerdx/BFS-Best-Face-Swap](https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap) |

---

### 3-4. Krea 2 ONE STUDIO 모델

> 전체 모델 목록: https://huggingface.co/Comfy-Org/Krea2

#### Diffusion Model → `models/diffusion_models/`

| 설명 | 다운로드 |
|---|---|
| Krea2 UNet (GGUF 포함) | [HF 목록](https://huggingface.co/Comfy-Org/Krea2/tree/main/split_files/diffusion_models) |

#### Text Encoder (CLIP krea2) → `models/text_encoders/`

| 다운로드 |
|---|
| [HF 목록](https://huggingface.co/Comfy-Org/Krea2/tree/main/split_files/text_encoders) |

#### VAE → `models/vae/`

| 다운로드 |
|---|
| [HF 목록](https://huggingface.co/Comfy-Org/Krea2/tree/main/split_files/vae) |

#### Lightning LoRA → `models/loras/`  *(4스텝 고속 생성, 선택사항)*

| 다운로드 |
|---|
| [HF 목록](https://huggingface.co/Comfy-Org/Krea2/tree/main/split_files/loras) |

---

### 3-5. SeedVR2 Upscale 모델 (전체 노드 공용)

모든 노드의 **UPSCALE 모드**에서 동일한 폴더를 사용합니다.

#### → `models/SEEDVR2/`

| 파일명 | 설명 | 다운로드 |
|---|---|---|
| `seedvr2_ema_3b_fp16.safetensors` | DiT 3B FP16 | [kijai/SeedVR2-models](https://huggingface.co/kijai/SeedVR2-models/tree/main) |
| `seedvr2_ema_3b_fp8_e4m3fn.safetensors` | DiT 3B FP8 (저VRAM) | [kijai/SeedVR2-models](https://huggingface.co/kijai/SeedVR2-models/tree/main) |
| `seedvr2_ema_7b_fp8_e4m3fn.safetensors` | DiT 7B FP8 (고품질) | [kijai/SeedVR2-models](https://huggingface.co/kijai/SeedVR2-models/tree/main) |
| `ema_vae_fp16.safetensors` | VAE FP16 | [kijai/SeedVR2-models](https://huggingface.co/kijai/SeedVR2-models/tree/main) |

> DiT 모델과 VAE 모델 **둘 다** 필요합니다.  
> Upscale 모드 → **↻ Refresh** 버튼으로 모델 목록을 새로 고칩니다.

---

## 4. 초기 설정

ComfyUI 캔버스에서 노드 우상단 **⚙** 버튼을 눌러 Settings를 엽니다.

| 항목 | 설명 |
|---|---|
| **Diffusion Model** | 다운로드한 UNet/DiT 파일 선택 |
| **Text Encoder** | 텍스트 인코더 파일 선택 |
| **VAE** | VAE 파일 선택 |
| **↻ Refresh Models** | ComfyUI 재시작 없이 새 모델 파일 인식 |
| **언어 / Language** | 한국어 / English 전환 (선택 후 자동 새로고침) |
| **Negative Prompt** | 전 모드 공통 부정 프롬프트 |
| **Prompt Suffix** | 모든 프롬프트 끝에 자동 추가 키워드 |
| **Save Subfolder** | `ComfyUI/output/` 하위 저장 폴더명 |
| **💾 Save All** | 서버에 설정 영구 저장 |

설정은 **브라우저 로컬스토리지에 자동 저장**되어 재시작 후에도 유지됩니다.

### 모델 오버라이드 슬롯 (고급)

Settings → **Model Override** 체크박스를 켜면 노드에 입력 슬롯이 노출됩니다.  
`Primitive (String)` 노드를 연결해 파일명을 입력하면 드롭다운보다 우선 적용됩니다.  
`.gguf` 파일명 입력 시 자동으로 GGUF 로더를 사용합니다.

---

## 5. 모드별 간략 설명

### Z-Image ONE STUDIO (TJ)

| 모드 | 설명 | 주요 설정 |
|---|---|---|
| **T2I** | 텍스트 → 이미지 | 해상도 프리셋, Steps, CFG, Shift, Sampler, LoRA (최대 3개) |
| **I2I** | 이미지 → 이미지 변형 | 소스 이미지 업로드, Denoise (0.5~1.0) |
| **INPAINT** | 특정 영역 재생성 | 소스 이미지 → 캔버스에서 마스크 드로잉 (DifferentialDiffusion) |
| **OUTPAINT** | 캔버스 확장 | Up/Down/Left/Right 픽셀 설정 → 빈 영역 자동 생성 |
| **RE-BG** | 배경 완전 재생성 | BiRefNet으로 피사체 분리 → 새 배경 생성 후 합성 |
| **CONTROLNET** | 레퍼런스 기반 생성 | 레퍼런스 이미지 → Preprocessor 선택 → Strength 조절 |
| **FACE REDRAW** | 얼굴 자동 감지 후 재생성 | YOLOv8/v9 감지 → LoRA 적용 재생성 → 원본에 자연 블렌드 |
| **UPSCALE** | SeedVR2 AI 업스케일 | DiT 모델 + VAE 선택 → Resolution / Attention Mode 설정 |

### Flux.2 Klein ONE STUDIO (TJ)

| 모드 | 설명 | 주요 설정 |
|---|---|---|
| **T2I** | 텍스트 → 이미지 | 해상도, Steps(권장 4), CFG(권장 1), Sampler(euler_sde), LoRA (최대 3개) |
| **I2I** | 이미지 → 이미지 변형 | Denoise 0.5~0.75(형태 유지) / 0.8~1.0(대폭 변형) |
| **EDIT** | 멀티 레퍼런스 편집 | 참조 이미지 1~5장, Size Source (이미지1 기준 출력 크기) |
| **PAINT** | 특정 영역 재생성 + Outpaint | 캔버스 마스크 드로잉, 아웃페인트 방향/크기 설정 |
| **FACESWAP** | 얼굴 교체 재생성 | Source(얼굴 공여자) + Target(원본) 업로드, BFS LoRA 강도 조절 |
| **UPSCALE** | SeedVR2 AI 업스케일 | DiT 모델 + VAE 선택 |

### Qwen Image Edit 2511 ONE STUDIO (TJ)

| 모드 | 설명 | 주요 설정 |
|---|---|---|
| **T2I** | 텍스트 → 이미지 | 해상도, Steps, CFG, Sampler, LoRA (최대 3개), Lightning LoRA (⚙ Settings) |
| **I2I** | 이미지 → 이미지 변형 | 소스 이미지, Denoise 조절 |
| **EDIT** | 멀티 레퍼런스 텍스트 편집 | 참조 이미지 최대 3장, Outpaint 포함 |
| **PAINT** | 특정 영역 재생성 | ComfyUI 내장 마스크 에디터, Denoise 0.7~0.9 권장 |
| **FACESWAP** | 얼굴 교체 | Target + Source 이미지, BFS LoRA 필수 |
| **ANGLE** | 카메라 앵글 3D 조절 | H(방위각) · V(고도각) · Z(줌) 드래그 조절, Camera Angle LoRA (⚙ Settings) |
| **UPSCALE** | SeedVR2 AI 업스케일 | DiT 모델 + VAE 선택 |

### Krea 2 ONE STUDIO (TJ)

| 모드 | 설명 | 주요 설정 |
|---|---|---|
| **T2I** | 텍스트 → 이미지 | 해상도, Steps, CFG, Sampler, LoRA (최대 3개), Lightning LoRA (⚙ Settings) |
| **I2I** | 이미지 → 이미지 변형 | 소스 이미지, Denoise 조절 |
| **UPSCALE** | SeedVR2 AI 업스케일 | DiT 모델 + VAE 선택 |

---

## 공통 기능

| 기능 | 설명 |
|---|---|
| **⇌ Compare** | 드래그 슬라이더로 원본 / 결과 나란히 비교 |
| **🖼 Gallery** | 저장된 이미지 정사각형 그리드 보기. 즐겨찾기(★) · 삭제 · Send to |
| **📋 Templates** | 자주 쓰는 프롬프트 저장 · 불러오기 |
| **🔍 Prompt Edit** | 확장 편집 팝업 (긴 프롬프트 편집) |
| **Scroll Zoom** | 결과 이미지 위 마우스 스크롤 확대/축소 |
| **Double Click** | 결과 이미지 더블클릭 → 전체화면 뷰어 |
| **Send to** | 결과를 다른 모드의 소스로 즉시 전달 |
| **Language** | Settings에서 한국어 / English 전환 |
| **ESC** | 열린 팝업 / 갤러리 / 전체화면 닫기 |

---

## 6. 문제 해결

| 증상 | 해결 방법 |
|---|---|
| 모델이 드롭다운에 안 보임 | Settings → ↻ **Refresh Models** 클릭 |
| SEEDVR2 모델 목록 안 나옴 | Upscale 모드 → **↻ Refresh** 클릭 · `models/SEEDVR2/` 폴더 확인 |
| Outpaint 생성 시 완전히 새 이미지 생성 | ComfyUI-KJNodes 최신 버전 설치 확인 (`ImagePadKJ` 노드 필요) |
| Face Redraw 오류 | ComfyUI-Impact-Pack + ComfyUI-Impact-Subpack 설치 확인 |
| KV Cache 오류 (Klein) | 파일명에 `kv` 미포함 시 자동 비활성화 — KV 모델 파일명 확인 |
| GGUF 모델 안 로딩 | ComfyUI-GGUF 커스텀 노드 설치 확인 |
| Faceswap 얼굴 미감지 | ComfyUI_FaceAnalysis 설치 + `insightface` pip 설치 확인 |
| RE-BG 오류 | ComfyUI-RMBG 설치 + `models/background_removal/` 모델 확인 |
| QE2511 FluxKontext 노드 미발견 오류 | ComfyUI-KJNodes 최신 버전으로 업데이트 |
| 언어 전환 후 반영 안 됨 | Settings에서 언어 선택 후 자동 새로고침 대기 |

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

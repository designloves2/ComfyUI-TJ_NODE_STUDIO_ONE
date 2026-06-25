# TJ NODE ONE (통합 패키지)

> **ComfyUI 올인원 이미지 생성 UI 패키지** — Z-Image ONE STUDIO와 Flux.2 Klein ONE STUDIO 두 가지 노드를 단일 패키지로 제공합니다.  
> 워크플로우 배선 없이 노드 하나에서 T2I · I2I · Inpaint · ControlNet · Faceswap · Upscale(SeedVR2) 등 다양한 모드를 전환합니다.

---

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

| 노드 이름 | 대상 모델 | 지원 모드 |
|---|---|---|
| **Z-Image ONE STUDIO (TJ)** | Lumina2 / AuraFlow 계열 flow-matching | T2I · I2I · Inpaint · Outpaint · RE-BG · ControlNet · Face Redraw · **Upscale** |
| **Flux.2 Klein ONE STUDIO (TJ)** | Flux.2-Klein (9B) | T2I · I2I · Edit · Inpaint · Faceswap · **Upscale** |

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

| 노드 | 용도 | 필수 대상 |
|---|---|---|
| [ComfyUI-KJNodes](https://github.com/kijai/ComfyUI-KJNodes) | FluxKVCache 등 보조 노드 | Klein |
| [ComfyUI-GGUF](https://github.com/city96/ComfyUI-GGUF) | GGUF 형식 모델 로딩 | 선택 (GGUF 사용 시) |
| [ComfyUI_FaceAnalysis](https://github.com/cubiq/ComfyUI_FaceAnalysis) | Faceswap 모드 얼굴 감지 | Klein Faceswap |
| [ComfyUI-RMBG](https://github.com/1038lab/ComfyUI-RMBG) | 배경 제거 | Z-Image RE-BG |
| [comfyui_controlnet_aux](https://github.com/Fannovel16/comfyui_controlnet_aux) | ControlNet 전처리기 | Z-Image ControlNet |
| [ComfyUI-SeedVR2](https://github.com/kijai/ComfyUI-SeedVR2) | SeedVR2 AI 업스케일 노드 | Klein & Z-Image Upscale |

---

## Z-Image ONE STUDIO — 기능 상세

### 지원 모드

| 모드 | 설명 |
|---|---|
| **T2I** | 텍스트 → 이미지 기본 생성 |
| **I2I** | 소스 이미지 기반 변형 생성 |
| **INPAINT** | 내장 마스크 에디터로 특정 영역만 재생성 |
| **OUTPAINT** | 이미지 캔버스 확장 후 빈 영역 인페인트 |
| **RE-BG** | RMBG로 서브젝트 분리 → 배경 완전 재생성 |
| **CONTROLNET** | Depth / Canny / Pose / HED / MLSD 레퍼런스 가이드 생성 |
| **FACE REDRAW** | 얼굴 자동 감지 → 크롭 → LoRA 재생성 → 원본에 블렌드 |
| **UPSCALE** | SeedVR2 AI 업스케일 — DiT 모델 기반 초고해상도 변환 |

### 필수 모델

| 종류 | 경로 | 예시 파일명 |
|---|---|---|
| Diffusion Model | `models/diffusion_models/` | `lumina2-2b.safetensors` |
| Text Encoder | `models/text_encoders/` | `gemma-2-2b-it.safetensors` |
| VAE | `models/vae/` | `ae.safetensors` |
| ControlNet | `models/controlnet/` | 모드별 별도 |

---

## Flux.2 Klein ONE STUDIO — 기능 상세

### 지원 모드

| 모드 | 설명 |
|---|---|
| **T2I** | 텍스트 → 이미지 기본 생성 |
| **I2I** | 소스 이미지 기반 변형 생성 |
| **EDIT** | 레퍼런스 이미지 1~2장 기반 스타일/구도 편집 |
| **INPAINT** | 내장 마스크 에디터로 특정 영역만 재생성 |
| **FACESWAP** | BFS 얼굴 LoRA를 사용한 얼굴 교체·재생성 |
| **UPSCALE** | SeedVR2 AI 업스케일 — DiT 모델 기반 초고해상도 변환 |

### 필수 모델

| 종류 | 경로 | 예시 파일명 |
|---|---|---|
| Diffusion Model | `models/diffusion_models/` | `flux-2-klein-9b.safetensors` |
| Text Encoder | `models/text_encoders/` | `qwen_3_8b_fp8mixed.safetensors` |
| VAE | `models/vae/` | `flux2-vae.safetensors` |

> **KV Cache**: 파일명에 `kv`가 포함된 모델은 자동으로 FluxKVCache 노드를 활성화합니다.

### SeedVR2 Upscale 모델

| 종류 | 경로 |
|---|---|
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

| 슬롯 | 설명 |
|---|---|
| `model_override` | Diffusion Model 파일명 |
| `clip_override` | Text Encoder 파일명 |
| `vae_override` | VAE 파일명 |

`.gguf` 파일을 입력하면 자동으로 GGUF 로더(`UnetLoaderGGUF` / `CLIPLoaderGGUF`)를 사용합니다.  
저 VRAM 환경에서 GGUF 양자화 모델을 사용할 때 유용합니다.

### 입력 슬롯 (전체)

| 슬롯 | 타입 | 설명 |
|---|---|---|
| `prompt_override` | STRING | 프롬프트 앞에 추가할 텍스트 (일회성) |
| `model_override` | STRING | 모델 파일명 오버라이드 |
| `clip_override` | STRING | CLIP 파일명 오버라이드 |
| `vae_override` | STRING | VAE 파일명 오버라이드 |

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

| 키 | 동작 |
|---|---|
| `ESC` | 열린 팝업 / 갤러리 / 오버레이 닫기 |

---

## 라이선스

MIT License

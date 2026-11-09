MANUAL.add({
 "id": "sdxl",
 "title": {
  "ko": "SDXL ONE STUDIO",
  "en": "SDXL ONE STUDIO"
 },
 "lead": {
  "ko": "SDXL 체크포인트 / 분리 UNET 전용 노드(테스트 버전). 생성, 변형, 인페인트, 아웃페인트, 업스케일.",
  "en": "Node for SDXL checkpoints / separate UNETs (test version): generate, transform, inpaint, outpaint and upscale."
 },
 "sections": [
  {
   "h": {
    "ko": "화면 구성",
    "en": "The screen"
   },
   "body": {
    "ko": "**1. 모드 버튼** (맨 위 왼쪽) — T2I · I2I · INPAINT · OUTPAINT · UPSCALE. 모드마다 왼쪽 패널의 입력칸이 바뀝니다.\n**2. Prompt/pipe Override 스위치** — 켜면 연결된 `prompt_override`·`pipe`를 사용하고, 끄면 연결돼 있어도 둘 다 무시합니다. 스위치 왼쪽의 **CKPT / UNET 배지**는 지금 모델 로딩 방식을 보여 줍니다.\n**3. 오른쪽 위 아이콘** — ↺ 노드 초기화 · ⇌ 비교 슬라이더(Inpaint / Outpaint에서 사용, T2I에서는 흐리게 비활성) · ⚙ 설정 · 🖼 갤러리.\n**4. 왼쪽 패널** — 해상도, STEPS / CFG, SAMPLER / SCHEDULER, 그 아래 한 줄짜리 Refiner 상태 표시(“Refiner OFF — enable in Settings”, ⚙ 설정에서 켭니다), LoRA(최대 5개), SEED와 그 모드.\n**5. 가운데 큰 영역** — 결과 프리뷰. 생성 전에는 “Generate to see result”가 보입니다.\n**6. 프리뷰 아래** — Send to(→ I2I, → Inpaint, → Outpaint, → Upscale) 버튼으로 결과를 다른 모드로 보내고, Output의 Preview / Save로 저장 방식을 고릅니다.\n**7. 프롬프트 줄** — 글자 수, Auto Enhance, Refine, Prompt Edit, Prompt Preset, EN/한 번역 버튼.\n**8. Generate / Stop** — 생성 시작과 중지. 그 위에 SEED와 시드 모드(Random 등)가 있습니다.",
    "en": "**1. Mode buttons** (top left) — T2I · I2I · INPAINT · OUTPAINT · UPSCALE. The inputs in the left panel change with the mode.\n**2. Prompt/pipe Override switch** — On: a connected `prompt_override` / `pipe` is used. Off: both are ignored even while connected. The **CKPT / UNET badge** to the left of the switch shows the current model loading mode.\n**3. Icons at the top right** — ↺ reset the node · ⇌ compare slider (used in Inpaint / Outpaint, greyed out in T2I) · ⚙ settings · 🖼 gallery.\n**4. Left panel** — resolution, STEPS / CFG, SAMPLER / SCHEDULER, a one-line Refiner status (“Refiner OFF — enable in Settings”; turn it on in ⚙ Settings), LoRA (up to 5), SEED and its mode.\n**5. Large middle area** — the result preview. Before a run it says “Generate to see result”.\n**6. Under the preview** — the Send to buttons (→ I2I, → Inpaint, → Outpaint, → Upscale) hand the result to another mode; Output Preview / Save chooses whether results are saved.\n**7. Prompt row** — character count, Auto Enhance, Refine, Prompt Edit, Prompt Preset and the EN / 한 translation button.\n**8. Generate / Stop** — start and stop a run. Above them are SEED and the seed mode (Random, …)."
   },
   "img": {
    "src": "img/sdxl-main.png",
    "cap": {
     "ko": "SDXL ONE STUDIO",
     "en": "SDXL ONE STUDIO"
    }
   }
  },
  {
   "h": {
    "ko": "⚙ 설정 (Settings)",
    "en": "⚙ Settings"
   },
   "body": {
    "ko": "설정 창에는 **Model**, **LLM**, **Translation**, **Node Skin** 탭이 있습니다.\n**Model** — 이 노드가 쓰는 모델 파일(아래 “필요한 모델” 참고)을 고릅니다. 각 칸 위의 검색창으로 찾을 수 있고, **↻ Refresh Models**는 ComfyUI를 다시 켜지 않고 모델 폴더를 다시 읽습니다. 언어(한국어/English)를 바꾸면 페이지를 새로고침합니다. Negative Prompt는 모든 모드에 적용되고, Prompt Suffix는 프롬프트 뒤에 자동으로 붙으며, Save Folder는 `ComfyUI/output/` 안의 저장 폴더 이름이고, 그 아래 “Show Save / Preview toggle in main view”를 체크하면 메인 화면 프리뷰 아래에 Output Preview / Save 토글이 나타납니다. “모델 오버라이드 슬롯”을 켜면 Primitive(String) 노드로 모델 파일명을 연결해 설정 칸보다 우선 적용할 수 있습니다(.gguf는 자동으로 GGUF 로더 사용).\n**LLM / Translation** — 프롬프트 보강(Refine·Auto Enhance)과 한↔영 번역에 쓸 모델을 정합니다. 번역 설정은 모든 노드가 같이 씁니다.\n**Node Skin** — 이 노드의 색을 바꿉니다.\n위쪽 **Save All**로 저장하고 ✕로 닫습니다.",
    "en": "The settings window has the tabs **Model**, **LLM**, **Translation** and **Node Skin**.\n**Model** — pick the model files this node uses (see “Required models” below). Each field has a search box above it, and **↻ Refresh Models** rescans the model folders without restarting ComfyUI. Changing the language (한국어 / English) reloads the page. The Negative Prompt applies to every mode, the Prompt Suffix is appended to the prompt automatically, and Save Folder is the folder name inside `ComfyUI/output/` (tick “Show Save / Preview toggle in main view” below it to show the Output Preview / Save toggle under the preview). Turning on “Model Override Slots” lets a Primitive(String) node supply the model file name, which wins over the Settings dropdown (.gguf files use the GGUF loader automatically).\n**LLM / Translation** — choose the models used for prompt help (Refine, Auto Enhance) and for KO↔EN translation. The translation setting is shared by every node.\n**Node Skin** — change this node's colors.\nUse **Save All** at the top to save and ✕ to close."
   },
   "img": {
    "src": "img/sdxl-settings.png",
    "cap": {
     "ko": "⚙ 설정 창",
     "en": "The ⚙ settings window"
    }
   }
  },
  {
   "h": {
    "ko": "지원 모드 한눈에",
    "en": "Modes at a glance"
   },
   "body": {
    "ko": "| 모드 | 설명 |\n|---|---|\n| **T2I** | 텍스트 → 이미지 기본 생성 |\n| **I2I** | 소스 이미지 기반 변형 생성 |\n| **INPAINT** | 내장 풀스크린 마스크 에디터 (줌 1x–32x · 팬 · 브러시/지우개) — VAEEncodeForInpaint로 완전 마스킹 |\n| **OUTPAINT** | 이미지 캔버스 확장 후 빈 영역 인페인트. 비교 슬라이더에서 패딩된 원본 미리보기 제공 |\n| **UPSCALE** | ESRGAN AI 업스케일 (latent 확대 → Refiner KSampler 정제) |",
    "en": "| Mode | Description |\n|---|---|\n| **T2I** | basic text-to-image generation |\n| **I2I** | source image-based transformation |\n| **INPAINT** | built-in full-screen mask editor (zoom 1x–32x · pan · brush/eraser) — fully masked with VAEEncodeForInpaint |\n| **OUTPAINT** | extend the image canvas and inpaint empty areas. padded original preview in compare slider |\n| **UPSCALE** | ESRGAN AI upscale (latent upscale → Refiner KSampler refinement) |"
   }
  },
  {
   "h": {
    "ko": "모델 로딩 방식",
    "en": "Model loading mode"
   },
   "body": {
    "ko": "Settings에서 두 가지 로딩 방식을 고를 수 있습니다.\n| 방식 | 설명 |\n|---|---|\n| **CKPT** | 단일 Checkpoint 파일 (`models/checkpoints/`) — 가장 간단한 방식 |\n| **Separate (UNET)** | UNET + DualCLIP(L/G) + VAE 분리 로딩 — GGUF·FP8 경량 모델 지원 |\n\n**Refiner**: CKPT / Separate 방식 모두 별도 Refiner Checkpoint를 항상 설정할 수 있습니다. Refiner는 `CheckpointLoaderSimple`로 독립 로딩됩니다.  ",
    "en": "Settings offers two model loading modes.\n| Mode | Description |\n|---|---|\n| **CKPT** | single Checkpoint file (`models/checkpoints/`) — simplest setup |\n| **Separate (UNET)** | separate UNET + DualCLIP(L/G) + VAE loading — supports GGUF·FP8 lightweight models |\n\n**Refiner**: In both CKPT and Separate modes, a separate Refiner Checkpoint can always be configured. The Refiner is loaded independently via `CheckpointLoaderSimple`."
   }
  },
  {
   "h": {
    "ko": "주요 기능",
    "en": "Key features"
   },
   "body": {
    "ko": "| 기능 | 설명 |\n|---|---|\n| **📋 프롬프트 템플릿** | 자주 쓰는 프롬프트 저장·불러오기 (Klein 공유 템플릿 DB 사용) |\n| **🔍 프롬프트 확대 편집** | 전체화면 편집 팝업. TJ_NODE 설치 시 ✨ Enhance · 🖼 Image→Prompt 자동 활성화 |\n| **CKPT ↔ UNET 표시기** | 현재 로딩 방식을 상단 배지로 표시. 방식 전환 시 즉시 업데이트 |\n| **⇌ 비교 슬라이더** | Outpaint: 패딩된 원본 vs 결과 / Inpaint: 원본 vs 마스킹 결과 |\n| **마스크 에디터** | 팝업 풀스크린 에디터 — 줌·팬·브러시/지우개·크기 슬라이더 내장 |",
    "en": "| Feature | Description |\n|---|---|\n| 📋 Prompt Template | save and load frequently used prompts (shared template DB with Klein) |\n| 🔍 Prompt Expand Edit | fullscreen edit popup. TJ_NODE install enables ✨ Enhance · 🖼 Image→Prompt |\n| CKPT ↔ UNET Indicator | display current loading mode as a top badge. Updates instantly on mode change |\n| ⇌ Compare Slider | Outpaint: padded original vs result / Inpaint: original vs masked result |\n| Mask Editor | popup fullscreen editor — zoom · pan · brush/eraser · size slider built-in |"
   }
  },
  {
   "h": {
    "ko": "필요한 모델",
    "en": "Required models"
   },
   "body": {
    "ko": "| 종류 | 경로 | 비고 |\n|---|---|---|\n| **SDXL Checkpoint** (CKPT 방식) | `models/checkpoints/` | 일반 SDXL .safetensors 파일 |\n| **SDXL UNET** (Separate 방식) | `models/diffusion_models/` | GGUF / FP8 경량 파일도 지원 |\n| **CLIP-L** (Separate 방식) | `models/text_encoders/` | SDXL dual-encoder: clip_l |\n| **CLIP-G** (Separate 방식) | `models/text_encoders/` | SDXL dual-encoder: clip_g |\n| **VAE** (Separate 방식) | `models/vae/` | sdxl_vae.safetensors 등 |\n| **Refiner Checkpoint** (선택) | `models/checkpoints/` | SDXL-Refiner 계열 모델 |\n| **ESRGAN Upscale** (Upscale 시 필수) | `models/upscale_models/` | 4x-UltraSharp 등 |",
    "en": "| Type | Path | Notes |\n|---|---|---|\n| **SDXL Checkpoint** | `models/checkpoints/` | standard SDXL .safetensors file |\n| **SDXL UNET** | `models/diffusion_models/` | GGUF / FP8 lightweight files also supported |\n| **CLIP-L** | `models/text_encoders/` | SDXL dual-encoder: clip_l |\n| **CLIP-G** | `models/text_encoders/` | SDXL dual-encoder: clip_g |\n| **VAE** | `models/vae/` | sdxl_vae.safetensors etc. |\n| Refiner Checkpoint (optional) | `models/checkpoints/` | SDXL-Refiner series model |\n| ESRGAN Upscale (required for Upscale) | `models/upscale_models/` | 4x-UltraSharp etc. |"
   }
  }
 ]
});

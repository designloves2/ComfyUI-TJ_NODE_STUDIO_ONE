MANUAL.add({
 "id": "krea2",
 "title": {
  "ko": "Krea 2 ONE STUDIO",
  "en": "Krea 2 ONE STUDIO"
 },
 "lead": {
  "ko": "Krea 2 전용 노드. 생성, 변형, 인물 정체성 편집(실험), ControlNet(실험), 업스케일.",
  "en": "Node for Krea 2: generate, transform, identity editing (experimental), ControlNet (experimental) and upscale."
 },
 "sections": [
  {
   "h": {
    "ko": "화면 구성",
    "en": "The screen"
   },
   "body": {
    "ko": "**1. 모드 버튼** (맨 위 왼쪽) — T2I · I2I · IDENTITY 🧪 · UPSCALE. 모드마다 왼쪽 패널의 입력칸이 바뀝니다.\n**2. Prompt/pipe Override 스위치** — 켜면 연결된 `prompt_override`·`pipe`를 사용하고, 끄면 연결돼 있어도 둘 다 무시합니다.\n**3. 오른쪽 위 아이콘** — ↺ 노드 초기화(저장값 삭제 후 기본값 복원) · ⇌ 비교 슬라이더(켜면 원본과 결과를 드래그로 비교) · 🗑 RAM/VRAM 비우기(모델 언로드) · ⚙ 설정 · 🖼 갤러리 · ? 사용 설명서.\n**4. 왼쪽 패널** — 해상도, STEPS / CFG, SAMPLER / SCHEDULER, LoRA(최대 3개). 그 아래에 **ENHANCE (KREA2)** 버튼(Enhance OFF/ON. 켜면 Strength와 Text scale 입력칸이 나타납니다. TJ_NODE의 Enhanced KSampler(TJ)가 필요하고, 끄면 일반 KSampler를 씁니다)과 **CONTROLNET (KREA2 CONTROL LORA)** 스위치(OFF/ON)가 있고, 맨 아래에 SEED와 그 모드가 있습니다.\n**5. 가운데 큰 영역** — 결과 프리뷰. 생성 전에는 “Generate to see result”가 보입니다.\n**6. 프리뷰 아래** — Send to(→ I2I, → Identity, → Upscale) 버튼으로 결과를 다른 모드로 보내고, Output의 Preview / Save로 저장 방식을 고릅니다.\n**7. 프롬프트 줄** — 글자 수, Auto Enhance, Refine, Prompt Edit, Prompt Preset, EN/한 번역 버튼, job.json Download(현재 설정을 job.json 파일로 내려받기).\n**8. Generate / Stop** — 생성 시작과 중지. 그 위에 SEED와 시드 모드(Random 등)가 있습니다.",
    "en": "**1. Mode buttons** (top left) — T2I · I2I · IDENTITY 🧪 · UPSCALE. The inputs in the left panel change with the mode.\n**2. Prompt/pipe Override switch** — On: a connected `prompt_override` / `pipe` is used. Off: both are ignored even while connected.\n**3. Icons at the top right** — ↺ reset the node (deletes saved values, restores defaults) · ⇌ compare slider (drag to compare the source and the result) · 🗑 free RAM/VRAM (unload models) · ⚙ settings · 🖼 gallery · ? built-in help.\n**4. Left panel** — resolution, STEPS / CFG, SAMPLER / SCHEDULER and LoRA (up to 3). Below them are the **ENHANCE (KREA2)** button (Enhance OFF/ON; when on, Strength and Text scale fields appear. It needs TJ_NODE's Enhanced KSampler (TJ); when off a plain KSampler is used) and the **CONTROLNET (KREA2 CONTROL LORA)** switch (OFF/ON). SEED and its mode are at the bottom.\n**5. Large middle area** — the result preview. Before a run it says “Generate to see result”.\n**6. Under the preview** — the Send to buttons (→ I2I, → Identity, → Upscale) hand the result to another mode; Output Preview / Save chooses whether results are saved.\n**7. Prompt row** — character count, Auto Enhance, Refine, Prompt Edit, Prompt Preset and the EN / 한 translation button, job.json Download (saves the current setup as a job.json file).\n**8. Generate / Stop** — start and stop a run. Above them are SEED and the seed mode (Random, …)."
   },
   "img": {
    "src": "img/krea2-main.png",
    "cap": {
     "ko": "Krea 2 ONE STUDIO",
     "en": "Krea 2 ONE STUDIO"
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
    "src": "img/krea2-settings.png",
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
    "ko": "| 모드 | 설명 |\n|---|---|\n| **T2I** | 텍스트로 이미지 생성 (+ ControlNet depth/canny 🧪) |\n| **I2I** | 소스 이미지 기반 변형 생성 (+ ControlNet depth/canny 🧪) |\n| **IDENTITY** 🧪 | 지시문 기반 인물 정체성/외형 편집 |\n| **UPSCALE** | SeedVR2 AI 업스케일 |",
    "en": "| Mode | Description |\n|---|---|\n| **T2I** | generate an image from text (+ ControlNet depth/canny 🧪) |\n| **I2I** | source image-based transformation (+ ControlNet depth/canny 🧪) |\n| **IDENTITY** 🧪 | instruction-based identity / appearance editing |\n| **UPSCALE** | SeedVR2 AI |"
   }
  },
  {
   "h": {
    "ko": "필요한 모델",
    "en": "Required models"
   },
   "body": {
    "ko": "| 종류 | 경로 | 다운로드 |\n|---|---|---|\n| Diffusion Model | `models/diffusion_models/` | [Comfy-Org Krea2](https://huggingface.co/Comfy-Org/Krea-2/tree/main/diffusion_models) |\n| Text Encoder | `models/text_encoders/` | [Comfy-Org Krea2](https://huggingface.co/Comfy-Org/Krea-2/tree/main/text_encoders) |\n| VAE | `models/vae/` | [Comfy-Org Krea2](https://huggingface.co/Comfy-Org/Krea-2/tree/main/vae) |",
    "en": "| Type | Path | Download |\n|---|---|---|\n| Diffusion Model | `models/diffusion_models/` | [Comfy-Org Krea2](https://huggingface.co/Comfy-Org/Krea-2/tree/main/diffusion_models) |\n| Text Encoder | `models/text_encoders/` | [Comfy-Org Krea2](https://huggingface.co/Comfy-Org/Krea-2/tree/main/text_encoders) |\n| VAE | `models/vae/` | [Comfy-Org Krea2](https://huggingface.co/Comfy-Org/Krea-2/tree/main/vae) |"
   }
  },
  {
   "h": {
    "ko": "🧪 IDENTITY · ControlNet (depth / canny) — 실험 기능",
    "en": "🧪 IDENTITY · ControlNet (depth / canny) — experimental"
   },
   "body": {
    "ko": "IDENTITY 탭과 ControlNet(depth/canny)은 외부 커스텀 노드와 별도 LoRA에 의존하는 **실험 기능**입니다. 결과 품질이 일정하지 않을 수 있고, 노드나 모델이 없으면 생성이 실패합니다. depth와 canny는 LoRA 기반이라 픽셀 단위로 정확하지 않습니다.\n• **Depth** — 전체 구도, 프레이밍, 스케일을 잡습니다(세밀한 포즈는 느슨).\n• **Canny** — 윤곽선을 정확히 고정해 포즈, 얼굴 방향, 실루엣을 재현합니다.\n\n**필요한 커스텀 노드**\n| 노드 | 용도 |\n|---|---|\n| [comfyui-krea2edit](https://github.com/lbouaraba/comfyui-krea2edit) | IDENTITY |\n| [comfyui-krea2-controlnet](https://github.com/facok/comfyui-krea2-controlnet) | ControlNet Depth |\n| [ComfyUI-NK2E](https://github.com/Nynxz/ComfyUI-NK2E) | ControlNet Canny |\n| [comfyui_controlnet_aux](https://github.com/Fannovel16/comfyui_controlnet_aux) | depth/canny 전처리기 |\n\n**필요한 LoRA** (`models/loras/`)\n| 기능 | 파일 |\n|---|---|\n| IDENTITY | `krea2_identity_edit_v1_2.safetensors` ([conradlocke/krea2-identity-edit](https://huggingface.co/conradlocke/krea2-identity-edit)) |\n| Depth | depth control LoRA ([Patil/Krea-2-depth-controlnet](https://huggingface.co/Patil/Krea-2-depth-controlnet)) |\n| Canny | NK2E canny LoRA ([nynxz/NK2E](https://huggingface.co/nynxz/NK2E)) |\n\nDepth를 처음 쓰면 `depth_anything_v2_vitl.pth`(Large, 권장)가 `comfyui_controlnet_aux/ckpts/depth-anything/…`로 자동 다운로드됩니다. vitg(Giant)는 저장소가 비공개라 지원하지 않습니다.\n\n**설정 순서**\n1. 위 커스텀 노드를 설치하고 ComfyUI를 재시작합니다.\n2. LoRA 파일을 `models/loras/`에 넣습니다.\n3. ⚙ Settings에서 IDENTITY LoRA와 Depth/Canny Control LoRA **파일만 등록**합니다.\n4. 강도, 임계값, depth 모델, 해상도 같은 조절값은 **사이드 메뉴의 CONTROLNET 패널**에서 직접 조절합니다.",
    "en": "The IDENTITY tab and ControlNet (depth / canny) are **experimental** and depend on external custom nodes and separate LoRAs. Output quality can be inconsistent, and generation fails if the required nodes or models are missing. Depth and canny are LoRA-based, so they are not pixel-accurate.\n• **Depth** — captures the overall composition, framing and scale (loose on fine pose).\n• **Canny** — locks contours for faithful pose, face direction and silhouette.\n\n**Required custom nodes**\n| Node | Used for |\n|---|---|\n| [comfyui-krea2edit](https://github.com/lbouaraba/comfyui-krea2edit) | IDENTITY |\n| [comfyui-krea2-controlnet](https://github.com/facok/comfyui-krea2-controlnet) | ControlNet Depth |\n| [ComfyUI-NK2E](https://github.com/Nynxz/ComfyUI-NK2E) | ControlNet Canny |\n| [comfyui_controlnet_aux](https://github.com/Fannovel16/comfyui_controlnet_aux) | depth / canny preprocessors |\n\n**Required LoRAs** (`models/loras/`)\n| Feature | File |\n|---|---|\n| IDENTITY | `krea2_identity_edit_v1_2.safetensors` ([conradlocke/krea2-identity-edit](https://huggingface.co/conradlocke/krea2-identity-edit)) |\n| Depth | depth control LoRA ([Patil/Krea-2-depth-controlnet](https://huggingface.co/Patil/Krea-2-depth-controlnet)) |\n| Canny | NK2E canny LoRA ([nynxz/NK2E](https://huggingface.co/nynxz/NK2E)) |\n\nOn first use of Depth, `depth_anything_v2_vitl.pth` (Large, recommended) is downloaded automatically to `comfyui_controlnet_aux/ckpts/depth-anything/…`. vitg (Giant) is not supported — its repo is gated.\n\n**Setup**\n1. Install the nodes above and restart ComfyUI.\n2. Put the LoRA files in `models/loras/`.\n3. In ⚙ Settings, register only the **files** of the IDENTITY LoRA and the Depth / Canny Control LoRA.\n4. Adjust the tuning values (strength, thresholds, depth model, resolution, …) in the **side-menu CONTROLNET panel**."
   }
  },
  {
   "h": {
    "ko": "개요",
    "en": "Overview"
   },
   "body": {
    "ko": "Krea 2 ONE STUDIO (TJ)는 Krea AI의 이미지 생성 모델 전용 올인원 노드입니다.\n상단 모드 버튼으로 T2I / I2I / UPSCALE을 전환하며,\n오른쪽 프리뷰에서 결과를 확인하고 하단 Send to 버튼으로 다음 작업으로 전달합니다.\n⚠ 생성은 ComfyUI 상단 RUN이 아닌 노드 내 ▶ Generate 버튼으로 실행해야 합니다.",
    "en": "Krea 2 ONE STUDIO (TJ) is an all-in-one generation node for Krea AI's image generation model.\nSwitch between T2I / I2I / UPSCALE using the top mode buttons.\nView results in the right preview and pass them to the next step via Send to buttons.\n⚠ Always use the ▶ Generate button inside the node — NOT the ComfyUI RUN button at the top."
   }
  },
  {
   "h": {
    "ko": "⚙ 초기 설정 (Settings)",
    "en": "⚙ Initial Setup (Settings)"
   },
   "body": {
    "ko": "우상단 ⚙ 버튼 → Settings 오버레이에서 아래를 반드시 설정하세요.\n• Diffusion Model  — Krea2 UNet 모델 선택 (models/diffusion_models/)\n• Text Encoder     — CLIP krea2 인코더 선택 (models/text_encoders/)\n• VAE              — VAE 모델 선택 (models/vae/)\n• Lightning LoRA   — 4스텝 고속 생성 LoRA (선택사항, Steps=4, CFG=1 자동 설정)\n• Negative Prompt  — 전 모드에 공통 적용할 부정 프롬프트\n• Prompt Suffix    — 전 모드 프롬프트 끝에 자동 추가할 키워드\n• Save Subfolder   — 저장 폴더 이름\n💾 Save All로 서버에 저장되며 재시작 후에도 유지됩니다.",
    "en": "Click ⚙ (top-right) → Settings overlay and configure the following:\n• Diffusion Model  — Krea2 UNet model (models/diffusion_models/)\n• Text Encoder     — CLIP krea2 encoder (models/text_encoders/)\n• VAE              — VAE model (models/vae/)\n• Lightning LoRA   — 4-step fast LoRA (optional, auto-sets Steps=4, CFG=1)\n• Negative Prompt  — Applied globally to all modes\n• Prompt Suffix    — Keywords auto-appended to every prompt\n• Save Subfolder   — Output folder name\nClick 💾 Save All to persist settings across ComfyUI restarts."
   }
  },
  {
   "h": {
    "ko": "T2I — 텍스트→이미지",
    "en": "T2I — Text to Image"
   },
   "body": {
    "ko": "텍스트 프롬프트로 이미지를 새로 생성합니다.\n• Resolution — 해상도 프리셋 또는 Custom으로 직접 입력\n• Steps / CFG / Sampler / Scheduler — 샘플링 파라미터\n  Lightning LoRA 활성화 시 Steps=4, CFG=1 자동 적용\n• LoRA — 최대 3개 추가, Strength와 Trigger Word 설정 가능\n• Seed — Fixed(고정), Random(매번 랜덤), +1/-1(증감)\n생성 후 Send to → I2I / Upscale로 전달 가능.",
    "en": "Generate a new image from a text prompt.\n• Resolution — preset options or Custom for manual dimensions\n• Steps / CFG / Sampler / Scheduler — sampling parameters\n  Lightning LoRA active: Steps=4, CFG=1 auto-applied\n• LoRA — up to 3, configure Strength and Trigger Word per LoRA\n• Seed — Fixed, Random, +1/-1 increment\nAfter generation, use Send to → I2I / Upscale."
   }
  },
  {
   "h": {
    "ko": "I2I — 이미지→이미지",
    "en": "I2I — Image to Image"
   },
   "body": {
    "ko": "소스 이미지를 기반으로 변형 생성합니다.\n• Source Image 업로드 또는 다른 모드에서 Send to → I2I로 전달\n• Denoise — 낮을수록 원본 유지(0.3~0.6), 높을수록 자유 변형(0.8~1.0)\n• Compare 버튼(⇌) — ON 시 결과와 원본을 슬라이더로 비교 가능\n생성 후 Send to → Upscale로 전달 가능.",
    "en": "Generate a variation from a reference image.\n• Upload Source Image or receive via Send to → I2I\n• Denoise — lower values preserve original (0.3~0.6), higher values allow free variation (0.8~1.0)\n• Compare button (⇌) — when ON, compare result and source with a slider\nAfter generation, use Send to → Upscale."
   }
  },
  {
   "h": {
    "ko": "UPSCALE — 고해상도 업스케일",
    "en": "UPSCALE — High-Resolution Upscaling"
   },
   "body": {
    "ko": "SeedVR2로 이미지를 고해상도로 업스케일합니다.\n• Source Image 업로드 또는 다른 모드에서 Send to → Upscale로 전달\n• DiT 모델 선택 (SeedVR2 관련 모델)\n• VAE 모델 선택\n• 최대 4096px까지 지원\nComfyUI Manager를 통해 SeedVR2 관련 커스텀 노드를 먼저 설치하세요.",
    "en": "Upscale images to high resolution using SeedVR2.\n• Upload Source Image or receive via Send to → Upscale\n• Select DiT model (SeedVR2 related)\n• Select VAE model\n• Supports up to 4096px\nInstall SeedVR2-related custom nodes via ComfyUI Manager first."
   }
  },
  {
   "h": {
    "ko": "공통 기능 및 주의사항",
    "en": "Common Features & Notes"
   },
   "body": {
    "ko": "⇌ Compare  — ON 시 보라색 강조. 생성 결과와 소스를 슬라이더로 비교.\n             T2I 제외 전 모드에서 활성화 가능.\n🗑 Unload   — 현재 로드된 모델을 VRAM/RAM에서 해제.\n⚙ Settings — 모델 선택, Lightning LoRA, 네거티브/접미사 프롬프트, 저장 설정.\n🖼 Gallery  — 저장된 이미지 갤러리. 즐겨찾기, 메타데이터 재사용, 삭제,\n             폴더 열기, 다른 모드로 Send to 기능 포함.\n📋 Template — 저장된 프롬프트 템플릿 불러오기.\n🔍 Expand   — 프롬프트를 전체 화면 에디터로 확장 편집.\nSend to     — 생성 결과를 다른 모드의 소스 이미지로 바로 전달.\nOutput      — 👁 Preview(임시 저장) / 💾 Save(영구 저장) 전환.\nModel Override — ⚙ Settings에서 활성화 시 외부 모델/CLIP/VAE 노드 연결 가능.\n⚠ 생성은 ComfyUI 상단 RUN이 아닌 노드 내 ▶ Generate 버튼으로 실행해야 합니다.\n  RUN 실행 시 마지막 생성 이미지가 OUTPUT image 슬롯으로 출력됩니다.",
    "en": "⇌ Compare  — When ON (purple highlight), compare result and source with a slider.\n             Available in all modes except T2I.\n🗑 Unload   — Release currently loaded models from VRAM/RAM.\n⚙ Settings — Model selection, Lightning LoRA, negative/suffix prompts, save settings.\n🖼 Gallery  — Image gallery with favorites, metadata reuse, delete,\n             open folder, and Send to other modes.\n📋 Template — Load saved prompt templates.\n🔍 Expand   — Open full-screen prompt editor.\nSend to     — Pass generation result directly to another mode as source.\nOutput      — 👁 Preview (temp) / 💾 Save (permanent) toggle.\nModel Override — Enable in ⚙ Settings to connect external model/CLIP/VAE nodes.\n⚠ Always use ▶ Generate inside the node — NOT the ComfyUI RUN button.\n  Running via RUN outputs the last generated image to the OUTPUT image slot."
   }
  },
  {
   "h": {
    "ko": "📦 모델 다운로드 가이드",
    "en": "📦 Model Download Guide"
   },
   "body": {
    "ko": "◆ Diffusion Model → models/diffusion_models/\n • Krea 2 UNet 모델 (GGUF 포함)\n   https://huggingface.co/Comfy-Org/Krea2/tree/main/split_files/diffusion_models\n   전체 목록: https://huggingface.co/Comfy-Org/Krea2\n\n◆ Text Encoder (CLIP krea2) → models/text_encoders/\n • krea2_clip_encoder.safetensors\n   https://huggingface.co/Comfy-Org/Krea2/tree/main/split_files/text_encoders\n\n◆ VAE → models/vae/\n • ae.safetensors\n   https://huggingface.co/Comfy-Org/Krea2/tree/main/split_files/vae\n\n◆ Lightning LoRA (4스텝 고속 생성, 선택사항) → models/loras/\n • Krea2 Lightning LoRA\n   https://huggingface.co/Comfy-Org/Krea2/tree/main/split_files/loras\n\n◆ SeedVR2 (UPSCALE 모드) → models/diffusion_models/\n • SeedVR2 모델 필요 — ComfyUI Manager를 통해 설치 권장",
    "en": "◆ Diffusion Model → models/diffusion_models/\n • Krea 2 UNet model (GGUF also supported)\n   https://huggingface.co/Comfy-Org/Krea2/tree/main/split_files/diffusion_models\n   Full model list: https://huggingface.co/Comfy-Org/Krea2\n\n◆ Text Encoder (CLIP krea2) → models/text_encoders/\n • krea2_clip_encoder.safetensors\n   https://huggingface.co/Comfy-Org/Krea2/tree/main/split_files/text_encoders\n\n◆ VAE → models/vae/\n • ae.safetensors\n   https://huggingface.co/Comfy-Org/Krea2/tree/main/split_files/vae\n\n◆ Lightning LoRA (4-step fast generation, optional) → models/loras/\n • Krea2 Lightning LoRA\n   https://huggingface.co/Comfy-Org/Krea2/tree/main/split_files/loras\n\n◆ SeedVR2 (UPSCALE mode) → models/diffusion_models/\n • Install via ComfyUI Manager (SeedVR2 custom nodes required)"
   }
  }
 ]
});

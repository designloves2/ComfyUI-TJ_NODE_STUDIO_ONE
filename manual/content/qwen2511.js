MANUAL.add({
 "id": "qwen2511",
 "title": {
  "ko": "Qwen Image Edit 2511 ONE STUDIO",
  "en": "Qwen Image Edit 2511 ONE STUDIO"
 },
 "lead": {
  "ko": "Qwen2.5-VL 기반 이미지 편집 모델 전용 노드. 편집, 인페인트, 얼굴 교체, 카메라 앵글, 업스케일.",
  "en": "Node for the Qwen2.5-VL based image-edit model: editing, inpaint, face swap, camera angle and upscale."
 },
 "sections": [
  {
   "h": {
    "ko": "화면 구성",
    "en": "The screen"
   },
   "body": {
    "ko": "**1. 모드 버튼** (맨 위 왼쪽) — T2I · I2I · EDIT · PAINT · FACESWAP · ANGLE · UPSCALE. 모드마다 왼쪽 패널의 입력칸이 바뀝니다.\n**2. Prompt/pipe Override 스위치** — 켜면 연결된 `prompt_override`·`pipe`를 사용하고, 끄면 연결돼 있어도 둘 다 무시합니다.\n**3. 오른쪽 위 아이콘** — ↺ 노드 초기화(저장값 삭제 후 기본값 복원) · ⇌ 비교 슬라이더(켜면 원본과 결과를 드래그로 비교) · 🗑 RAM/VRAM 비우기(모델 언로드) · ⚙ 설정 · 🖼 갤러리 · ? 사용 설명서.\n**4. 왼쪽 패널** — 모드별 입력칸입니다. 스크린샷의 EDIT 모드에는 REF IMAGE 1(주 레퍼런스, 클릭하거나 끌어 놓기), + Add Ref Image(레퍼런스 추가), OUTPUT SIZE SOURCE(출력 크기 기준, 예: Match Image 1 size), STEPS / CFG, SAMPLER / SCHEDULER, LoRA(최대 3개)가 있습니다. 맨 아래에 SEED와 그 모드.\n**5. 가운데 큰 영역** — 결과 프리뷰. 생성 전에는 “Generate to see result”가 보입니다.\n**6. 프리뷰 아래** — Send to(→ I2I, → Inpaint, → Outpaint, → Face, → Angle, → Upscale) 버튼으로 결과를 다른 모드로 보내고, Output의 Preview / Save로 저장 방식을 고릅니다.\n**7. 프롬프트 줄** — 글자 수, Auto Enhance, Refine, Prompt Edit, Prompt Preset, EN/한 번역 버튼.\n**8. Generate / Stop** — 생성 시작과 중지. 그 위에 SEED와 시드 모드(Random 등)가 있습니다.",
    "en": "**1. Mode buttons** (top left) — T2I · I2I · EDIT · PAINT · FACESWAP · ANGLE · UPSCALE. The inputs in the left panel change with the mode.\n**2. Prompt/pipe Override switch** — On: a connected `prompt_override` / `pipe` is used. Off: both are ignored even while connected.\n**3. Icons at the top right** — ↺ reset the node (deletes saved values, restores defaults) · ⇌ compare slider (drag to compare the source and the result) · 🗑 free RAM/VRAM (unload models) · ⚙ settings · 🖼 gallery · ? built-in help.\n**4. Left panel** — the inputs of the current mode. In the EDIT mode shown there are REF IMAGE 1 (main reference — click or drag a file in), + Add Ref Image (add a reference), OUTPUT SIZE SOURCE (what the output size follows, e.g. Match Image 1 size), STEPS / CFG, SAMPLER / SCHEDULER and LoRA (up to 3). SEED and its mode are at the bottom.\n**5. Large middle area** — the result preview. Before a run it says “Generate to see result”.\n**6. Under the preview** — the Send to buttons (→ I2I, → Inpaint, → Outpaint, → Face, → Angle, → Upscale) hand the result to another mode; Output Preview / Save chooses whether results are saved.\n**7. Prompt row** — character count, Auto Enhance, Refine, Prompt Edit, Prompt Preset and the EN / 한 translation button.\n**8. Generate / Stop** — start and stop a run. Above them are SEED and the seed mode (Random, …)."
   },
   "img": {
    "src": "img/qwen2511-main.png",
    "cap": {
     "ko": "Qwen Image Edit 2511 ONE STUDIO (EDIT 모드로 열린 모습)",
     "en": "Qwen Image Edit 2511 ONE STUDIO (shown in EDIT mode)"
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
    "src": "img/qwen2511-settings.png",
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
    "ko": "| 모드 | 설명 |\n|---|---|\n| **T2I** | 텍스트로 이미지 생성 |\n| **I2I** | 소스 이미지 기반 변형 생성 |\n| **EDIT** | 텍스트 프롬프트로 이미지 편집. 원본 + 참조 이미지 최대 3장 지원 |\n| **PAINT** | 마스크 영역 인페인트. Outpaint(캔버스 확장) 포함 |\n| **FACESWAP** | BFS LoRA를 활용한 얼굴 교체. 자동 기본 프롬프트 제공 |\n| **ANGLE** | 3D 씬에서 카메라 앵글(H/V/Z) 드래그 조절. Camera Angle LoRA는 ⚙ Settings에서 설정 |\n| **UPSCALE** | SeedVR2 AI 업스케일 |",
    "en": "| Mode | Description |\n|---|---|\n| **T2I** | generate an image from text |\n| **I2I** | source image-based transformation |\n| **EDIT** | edit images using a text prompt. supports the original plus up to three reference images |\n| **PAINT** | inpaint masked areas. Outpaint(canvas expansion) included |\n| **FACESWAP** | BFS LoRAface replacement using BFS LoRA. provides an automatic default prompt |\n| **ANGLE** | 3D scene camera angle(H/V/Z) drag control. Camera Angle LoRAis configured in ⚙ Settings |\n| **UPSCALE** | SeedVR2 AI |"
   }
  },
  {
   "h": {
    "ko": "필요한 모델",
    "en": "Required models"
   },
   "body": {
    "ko": "| 종류 | 경로 | 다운로드 |\n|---|---|---|\n| Diffusion Model | `models/diffusion_models/` | [Comfy-Org QE2511](https://huggingface.co/Comfy-Org/Qwen-Image-Edit_ComfyUI/tree/main/split_files/diffusion_models) |\n| Text Encoder | `models/text_encoders/` | [Comfy-Org QE2511](https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/tree/main/split_files/text_encoders) |\n| VAE | `models/vae/` | [Comfy-Org QE2511](https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/tree/main/split_files/vae) |\n| Lightning LoRA (선택) | `models/loras/` | [Qwen-Image-Edit-2511-Lightning](https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning/tree/main) |\n| Camera Angle LoRA (선택) | `models/loras/` | [Multi Angle LoRa](https://huggingface.co/fal/Qwen-Image-Edit-2511-Multiple-Angles-LoRA) |\n| BFS LoRA (Faceswap 필수) | `models/loras/` | [BFS-Best-Face-Swap](https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap) |\n\n**내부 의존 노드**: `FluxKontextImageScale` · `TextEncodeQwenImageEditPlus` · `FluxKontextMultiReferenceLatentMethod` — ComfyUI-KJNodes에 포함",
    "en": "| Type | Path | Download |\n|---|---|---|\n| Diffusion Model | `models/diffusion_models/` | [Comfy-Org QE2511](https://huggingface.co/Comfy-Org/Qwen-Image-Edit_ComfyUI/tree/main/split_files/diffusion_models) |\n| Text Encoder | `models/text_encoders/` | [Comfy-Org QE2511](https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/tree/main/split_files/text_encoders) |\n| VAE | `models/vae/` | [Comfy-Org QE2511](https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/tree/main/split_files/vae) |\n| Lightning LoRA (selection) | `models/loras/` | [Qwen-Image-Edit-2511-Lightning](https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning/tree/main) |\n| Camera Angle LoRA (selection) | `models/loras/` | [Multi Angle LoRa](https://huggingface.co/fal/Qwen-Image-Edit-2511-Multiple-Angles-LoRA) |\n| BFS LoRA (Faceswap required) | `models/loras/` | [BFS-Best-Face-Swap](https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap) |\n\n**Internal Dependency Nodes**: `FluxKontextImageScale` · `TextEncodeQwenImageEditPlus` · `FluxKontextMultiReferenceLatentMethod` — ComfyUI-KJNodesincluded in"
   }
  },
  {
   "h": {
    "ko": "개요",
    "en": "Overview"
   },
   "body": {
    "ko": "Qwen Image Edit 2511 ONE STUDIO (TJ)는 Qwen2.5-VL 기반 이미지 편집 모델 전용\n올인원 생성 노드입니다.\n상단 모드 버튼으로 T2I / I2I / EDIT / PAINT / FACESWAP / ANGLE / UPSCALE을 전환하며,\n오른쪽 프리뷰에서 결과를 확인하고 하단 Send to 버튼으로 다음 작업으로 바로 넘길 수 있습니다.\n⚠ 생성은 ComfyUI 상단 RUN이 아닌 노드 내 ▶ Generate 버튼으로 실행해야 합니다.",
    "en": "Qwen Image Edit 2511 ONE STUDIO (TJ) is an all-in-one generation node\nfor the Qwen2.5-VL image editing model.\nSwitch between T2I / I2I / EDIT / PAINT / FACESWAP / ANGLE / UPSCALE using the top mode buttons.\nView results in the right preview and pass them to the next step via Send to buttons.\n⚠ Always use the ▶ Generate button inside the node — NOT the ComfyUI RUN button at the top."
   }
  },
  {
   "h": {
    "ko": "⚙ 초기 설정 (Settings)",
    "en": "⚙ Initial Setup (Settings)"
   },
   "body": {
    "ko": "우상단 ⚙ 버튼 → Settings 오버레이에서 아래를 반드시 설정하세요.\n• Diffusion Model  — Qwen2.5-VL UNet 모델 선택 (models/diffusion_models/)\n• Text Encoder     — CLIPLoader qwen_image 방식 인코더 (models/text_encoders/)\n• VAE              — VAE 모델 선택 (models/vae/)\n• Lightning LoRA   — 4스텝 고속 생성 LoRA (선택사항, Steps=4, CFG=1 자동 설정)\n• Camera Angle LoRA — ANGLE 모드 전용 LoRA (선택사항)\n• Negative Prompt  — 전 모드에 공통 적용할 부정 프롬프트\n• Prompt Suffix    — 전 모드 프롬프트 끝에 자동 추가할 키워드\n• Save Subfolder   — 저장 폴더 이름\n💾 Save All로 서버에 저장되며 재시작 후에도 유지됩니다.",
    "en": "Click ⚙ (top-right) → Settings overlay and configure the following:\n• Diffusion Model  — Qwen2.5-VL UNet model (models/diffusion_models/)\n• Text Encoder     — CLIPLoader qwen_image encoder (models/text_encoders/)\n• VAE              — VAE model (models/vae/)\n• Lightning LoRA   — 4-step fast LoRA (optional, auto-sets Steps=4, CFG=1)\n• Camera Angle LoRA — For ANGLE mode only (optional)\n• Negative Prompt  — Applied globally to all modes\n• Prompt Suffix    — Keywords auto-appended to every prompt\n• Save Subfolder   — Output folder name\nClick 💾 Save All to persist settings across ComfyUI restarts."
   }
  },
  {
   "h": {
    "ko": "T2I — 텍스트→이미지",
    "en": "T2I — Text to Image"
   },
   "body": {
    "ko": "텍스트 프롬프트로 이미지를 새로 생성합니다.\n• Resolution — 해상도 프리셋 또는 Custom으로 직접 입력\n• Steps / CFG / Sampler / Scheduler — 샘플링 파라미터\n  Lightning LoRA 활성화 시 Steps=4, CFG=1 자동 적용\n• LoRA — 최대 3개 추가, Strength와 Trigger Word 설정 가능\n• Seed — Fixed(고정), Random(매번 랜덤), +1/-1(증감)\n생성 후 Send to 버튼으로 → Edit / I2I / Paint / Upscale로 전달 가능.",
    "en": "Generate a new image from a text prompt.\n• Resolution — preset options or Custom for manual dimensions\n• Steps / CFG / Sampler / Scheduler — sampling parameters\n  Lightning LoRA active: Steps=4, CFG=1 auto-applied\n• LoRA — up to 3, configure Strength and Trigger Word per LoRA\n• Seed — Fixed, Random, +1/-1 increment\nAfter generation, use Send to → Edit / I2I / Paint / Upscale."
   }
  },
  {
   "h": {
    "ko": "I2I — 이미지→이미지",
    "en": "I2I — Image to Image"
   },
   "body": {
    "ko": "소스 이미지를 참고해 변형 생성합니다.\n• Source Image 업로드 또는 다른 모드에서 Send to → I2I로 전달\n• Denoise — 낮을수록 원본 유지(0.3~0.6), 높을수록 자유 변형(0.8~1.0)\n• Compare 버튼(⇌) — ON 시 결과와 원본을 슬라이더로 비교 가능",
    "en": "Generate a variation from a reference image.\n• Upload Source Image or receive via Send to → I2I\n• Denoise — lower values preserve original (0.3~0.6), higher values allow free variation (0.8~1.0)\n• Compare button (⇌) — when ON, compare result and source with a slider"
   }
  },
  {
   "h": {
    "ko": "EDIT — 멀티 레퍼런스 편집",
    "en": "EDIT — Multi-Reference Editing"
   },
   "body": {
    "ko": "텍스트 프롬프트로 이미지를 편집합니다. 최대 3장의 참조 이미지를 사용할 수 있습니다.\n• Image 1 (필수) — 주 참조 이미지 업로드\n• Add Ref Image 버튼 — 추가 참조 이미지 2~3번 업로드 (최대 총 3장)\n내부 구조: TextEncodeQwenImageEditPlus + FluxKontextImageScale +\nFluxKontextMultiReferenceLatentMethod 공식 워크플로우 사용.\n• 아웃페인트(확장) 기능도 이 모드에서 지원됩니다:\n  패딩 방향/크기 설정 후 ▶ Generate로 캔버스를 확장합니다.",
    "en": "Edit images using text prompts with up to 3 reference images.\n• Image 1 (required) — upload primary reference image\n• Add Ref Image button — add extra reference images 2–3 (up to 3 total)\nUses: TextEncodeQwenImageEditPlus + FluxKontextImageScale +\nFluxKontextMultiReferenceLatentMethod official workflow internally.\n• Outpaint (canvas expansion) is also supported in this mode:\n  Set padding direction/size and click ▶ Generate to expand the canvas."
   }
  },
  {
   "h": {
    "ko": "PAINT — 인페인트",
    "en": "PAINT — Inpaint"
   },
   "body": {
    "ko": "이미지의 특정 영역만 프롬프트로 재생성합니다.\n• Source Image 업로드\n• ✏ 마스크 수정하기 — ComfyUI 기본 마스크 에디터 오픈\n  흰색(White) = 재생성할 영역 / 검은색(Black) = 유지할 영역\n• Denoise — 0.7~0.9 권장. 낮을수록 원본 맥락 강하게 유지.\n• 직접 업로드 — 외부 툴로 만든 마스크 PNG를 업로드하는 대안 방법\n생성 후 Send to 버튼으로 다른 모드로 전달 가능.",
    "en": "Regenerate only the masked region of an image using a prompt.\n• Upload Source Image\n• ✏ Edit Mask — opens ComfyUI's built-in mask editor\n  White = area to regenerate / Black = area to preserve\n• Denoise — 0.7~0.9 recommended. Lower values keep original context stronger.\n• Direct Upload — alternative: upload a mask PNG from an external tool\nAfter generation, use Send to buttons to pass to another mode."
   }
  },
  {
   "h": {
    "ko": "FACESWAP — 얼굴 교체",
    "en": "FACESWAP — Face Replacement"
   },
   "body": {
    "ko": "Target 이미지의 얼굴을 Source 얼굴로 교체합니다.\n• Target Image — 배경/장면 이미지 업로드\n• Source Face  — 얼굴 원본 이미지 업로드\n• BFS LoRA 필수 — ⚙ Settings에서 BFS Face Swap LoRA를 먼저 선택하세요\n• 기본 프롬프트가 자동으로 설정되지만 수정도 가능합니다\n• Denoise 1.0 권장 (완전 재생성)",
    "en": "Replace the face in a Target image with a Source face.\n• Target Image — upload the background/scene image\n• Source Face  — upload the face reference image\n• BFS LoRA required — select a BFS Face Swap LoRA in ⚙ Settings first\n• Default prompt is auto-filled but can be edited\n• Denoise 1.0 recommended (full regeneration)"
   }
  },
  {
   "h": {
    "ko": "ANGLE — 카메라 앵글 조절",
    "en": "ANGLE — Camera Angle Control"
   },
   "body": {
    "ko": "원본 이미지의 카메라 앵글을 3D 씬에서 직관적으로 조절합니다.\n• Source Image 업로드\n• H (수평/방위각) — 좌우 카메라 회전\n• V (수직/고도각) — 상하 카메라 각도\n• Z (줌)          — 카메라 거리/확대\n컨트롤 조작: 선 위에서 클릭 후 홀드하여 드래그합니다.\n• Camera Angle LoRA — ⚙ Settings에서 선택 (ANGLE 모드에서만 자동 적용)\n생성 후 Send to → Edit / I2I / Paint / Upscale로 전달 가능.",
    "en": "Intuitively control the camera angle of a scene in 3D space.\n• Upload Source Image\n• H (Horizontal / Azimuth) — rotate camera left/right\n• V (Vertical / Elevation) — tilt camera up/down\n• Z (Zoom)                 — camera distance / zoom level\nControl operation: click and hold on the control line, then drag.\n• Camera Angle LoRA — select in ⚙ Settings (auto-applied only in ANGLE mode)\nAfter generation, use Send to → Edit / I2I / Paint / Upscale."
   }
  },
  {
   "h": {
    "ko": "UPSCALE — 고해상도 업스케일",
    "en": "UPSCALE — High-Resolution Upscaling"
   },
   "body": {
    "ko": "SeedVR2로 이미지를 고해상도로 업스케일합니다.\n• Source Image 업로드 또는 다른 모드에서 Send to → Upscale로 전달\n• DiT 모델 선택 (SeedVR2 관련 모델)\n• VAE 모델 선택\n• 최대 4096px까지 지원\n• Tile 크기와 Overlap 설정 가능\nComfyUI Manager를 통해 SeedVR2 관련 커스텀 노드를 먼저 설치하세요.",
    "en": "Upscale images to high resolution using SeedVR2.\n• Upload Source Image or receive via Send to → Upscale\n• Select DiT model (SeedVR2 related)\n• Select VAE model\n• Supports up to 4096px\n• Tile size and Overlap settings available\nInstall SeedVR2-related custom nodes via ComfyUI Manager first."
   }
  },
  {
   "h": {
    "ko": "공통 기능 및 주의사항",
    "en": "Common Features & Notes"
   },
   "body": {
    "ko": "⇌ Compare  — ON 시 보라색 강조. 생성 결과와 소스를 슬라이더로 비교.\n             T2I 제외 전 모드에서 활성화 가능.\n🗑 Unload   — 현재 로드된 모델을 VRAM/RAM에서 해제.\n⚙ Settings — 모델 선택, Lightning/Angle LoRA, 네거티브/접미사 프롬프트, 저장 설정.\n🖼 Gallery  — 저장된 이미지 갤러리. 즐겨찾기, 메타데이터 재사용, 삭제,\n             폴더 열기, 다른 모드로 Send to 기능 포함.\n📋 Template — 저장된 프롬프트 템플릿 불러오기.\n🔍 Expand   — 프롬프트를 전체 화면 에디터로 확장 편집.\nSend to     — 생성 결과를 다른 모드의 소스 이미지로 바로 전달.\nOutput      — 👁 Preview(임시 저장) / 💾 Save(영구 저장) 전환.\nModel Override — ⚙ Settings에서 활성화 시 외부 모델/CLIP/VAE 노드 연결 가능.\n⚠ 생성은 ComfyUI 상단 RUN이 아닌 노드 내 ▶ Generate 버튼으로 실행해야 합니다.\n  RUN 실행 시 마지막 생성 이미지가 OUTPUT image 슬롯으로 출력됩니다.",
    "en": "⇌ Compare  — When ON (purple highlight), compare result and source with a slider.\n             Available in all modes except T2I.\n🗑 Unload   — Release currently loaded models from VRAM/RAM.\n⚙ Settings — Model selection, Lightning/Angle LoRA, negative/suffix prompts, save settings.\n🖼 Gallery  — Image gallery with favorites, metadata reuse, delete,\n             open folder, and Send to other modes.\n📋 Template — Load saved prompt templates.\n🔍 Expand   — Open full-screen prompt editor.\nSend to     — Pass generation result directly to another mode as source.\nOutput      — 👁 Preview (temp) / 💾 Save (permanent) toggle.\nModel Override — Enable in ⚙ Settings to connect external model/CLIP/VAE nodes.\n⚠ Always use ▶ Generate inside the node — NOT the ComfyUI RUN button.\n  Running via RUN outputs the last generated image to the OUTPUT image slot."
   }
  },
  {
   "h": {
    "ko": "📦 모델 다운로드 가이드",
    "en": "📦 Model Download Guide"
   },
   "body": {
    "ko": "◆ Diffusion Model → models/diffusion_models/\n • Qwen2.5-VL-7B-Image-Edit-bf16.safetensors (권장)\n   https://huggingface.co/Comfy-Org/Qwen2.5-VL-7B-Image-Edit/tree/main/split_files/diffusion_models\n • GGUF 경량 버전도 지원합니다 (models/diffusion_models/)\n   https://huggingface.co/Comfy-Org/Qwen2.5-VL-7B-Image-Edit/tree/main/split_files/diffusion_models\n\n◆ Text Encoder (CLIPLoader qwen_image) → models/text_encoders/\n • qwen2.5vl-7b-vis-encoder.safetensors\n   https://huggingface.co/Comfy-Org/Qwen2.5-VL-7B-Image-Edit/tree/main/split_files/text_encoders\n\n◆ VAE → models/vae/\n • ae.safetensors\n   https://huggingface.co/Comfy-Org/Qwen2.5-VL-7B-Image-Edit/tree/main/split_files/vae\n\n◆ Lightning LoRA (4스텝 고속 생성, 선택사항) → models/loras/\n • Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors\n   https://huggingface.co/Comfy-Org/Qwen2.5-VL-7B-Image-Edit/tree/main/split_files/loras\n\n◆ BFS LoRA (Faceswap 필수) → models/loras/\n • BFS Face Swap LoRA for Qwen Image Edit 2511\n   https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap\n\n◆ Camera Angle LoRA (ANGLE 모드, 선택사항) → models/loras/\n • 카메라 앵글 제어용 LoRA (⚙ Settings에서 설정)\n\n◆ SeedVR2 (UPSCALE 모드) → models/diffusion_models/\n • SeedVR2 모델 필요 — ComfyUI Manager를 통해 설치 권장",
    "en": "◆ Diffusion Model → models/diffusion_models/\n • Qwen2.5-VL-7B-Image-Edit-bf16.safetensors (recommended)\n   https://huggingface.co/Comfy-Org/Qwen2.5-VL-7B-Image-Edit/tree/main/split_files/diffusion_models\n • GGUF quantized versions also supported (models/diffusion_models/)\n   https://huggingface.co/Comfy-Org/Qwen2.5-VL-7B-Image-Edit/tree/main/split_files/diffusion_models\n\n◆ Text Encoder (CLIPLoader qwen_image) → models/text_encoders/\n • qwen2.5vl-7b-vis-encoder.safetensors\n   https://huggingface.co/Comfy-Org/Qwen2.5-VL-7B-Image-Edit/tree/main/split_files/text_encoders\n\n◆ VAE → models/vae/\n • ae.safetensors\n   https://huggingface.co/Comfy-Org/Qwen2.5-VL-7B-Image-Edit/tree/main/split_files/vae\n\n◆ Lightning LoRA (4-step fast generation, optional) → models/loras/\n • Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors\n   https://huggingface.co/Comfy-Org/Qwen2.5-VL-7B-Image-Edit/tree/main/split_files/loras\n\n◆ BFS LoRA (required for Faceswap) → models/loras/\n • BFS Face Swap LoRA for Qwen Image Edit 2511\n   https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap\n\n◆ Camera Angle LoRA (ANGLE mode, optional) → models/loras/\n • Select in ⚙ Settings under Camera Angle LoRA\n\n◆ SeedVR2 (UPSCALE mode) → models/diffusion_models/\n • Install via ComfyUI Manager (SeedVR2 custom nodes required)"
   }
  }
 ]
});

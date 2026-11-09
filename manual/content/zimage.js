MANUAL.add({
 "id": "zimage",
 "title": {
  "ko": "Z-Image ONE STUDIO",
  "en": "Z-Image ONE STUDIO"
 },
 "lead": {
  "ko": "Z-Image Turbo 전용 올인원 이미지 노드. 모드를 버튼으로 바꿔 씁니다.",
  "en": "All-in-one image node for Z-Image Turbo. Switch modes with the buttons at the top."
 },
 "sections": [
  {
   "h": {
    "ko": "화면 구성",
    "en": "The screen"
   },
   "body": {
    "ko": "**1. 모드 버튼** (맨 위 왼쪽) — T2I · I2I · INPAINT · RE-BG · CONTROLNET · FACE REDRAW · UPSCALE. 모드마다 왼쪽 패널의 입력칸이 바뀝니다.\n**2. Prompt/pipe Override 스위치** — 켜면 연결된 `prompt_override`·`pipe`를 사용하고, 끄면 연결돼 있어도 둘 다 무시합니다. PromptDBLoader를 모든 노드에 연결해 두고 노드별로 켜고 끌 때 씁니다.\n**3. 오른쪽 위 아이콘** — ↺ 노드 초기화(저장값 삭제 후 기본값 복원) · ⇌ 비교 슬라이더(켜면 원본과 결과를 드래그로 비교) · 🗑 RAM/VRAM 비우기(모델 언로드) · ⚙ 설정 · 🖼 갤러리 · ? 사용 설명서.\n**4. 왼쪽 패널** — 해상도, STEPS / CFG / SHIFT, SAMPLER / SCHEDULER, LoRA(최대 3개), SEED와 그 모드(Random 등).\n**5. 가운데 큰 영역** — 결과 프리뷰. 생성 전에는 “Generate to see result”가 보입니다.\n**6. 프리뷰 아래** — Send to(결과를 다른 모드로 보내기), Output의 Preview / Save.\n**7. 프롬프트 줄** — 글자 수, job.json Download, Auto Enhance, Refine, Prompt Edit, Prompt Preset, EN/한 번역 버튼.\n**8. Generate / Stop** — 생성 시작과 중지.",
    "en": "**1. Mode buttons** (top left) — T2I · I2I · INPAINT · RE-BG · CONTROLNET · FACE REDRAW · UPSCALE. The inputs in the left panel change with the mode.\n**2. Prompt/pipe Override switch** — On: a connected `prompt_override` / `pipe` is used. Off: both are ignored even while connected. Handy when one PromptDBLoader stays wired to every node and you switch it in or out per node.\n**3. Icons at the top right** — ↺ reset the node (deletes saved values, restores defaults) · ⇌ compare slider (drag to compare the source and the result) · 🗑 free RAM/VRAM (unload models) · ⚙ settings · 🖼 gallery · ? built-in help.\n**4. Left panel** — resolution, STEPS / CFG / SHIFT, SAMPLER / SCHEDULER, LoRA (up to 3), SEED and its mode (Random, …).\n**5. Large middle area** — the result preview. Before a run it says “Generate to see result”.\n**6. Under the preview** — Send to (hand the result to another mode), Output Preview / Save.\n**7. Prompt row** — character count, job.json Download, Auto Enhance, Refine, Prompt Edit, Prompt Preset and the EN / 한 translation button.\n**8. Generate / Stop** — start and stop a run."
   },
   "img": {
    "src": "img/zimage-main.png",
    "cap": {
     "ko": "Z-Image ONE STUDIO, T2I 모드(기본 화면)",
     "en": "Z-Image ONE STUDIO, T2I mode (default view)"
    }
   }
  },
  {
   "h": {
    "ko": "⚙ 설정 (Settings)",
    "en": "⚙ Settings"
   },
   "body": {
    "ko": "설정 창에는 탭이 4개 있습니다: **Model**, **LLM**, **Translation**, **Node Skin**.\n**Model** — Diffusion Model / Text Encoder / VAE를 고릅니다(각 칸 위에 검색창이 있습니다). **↻ Refresh Models**는 ComfyUI를 다시 켜지 않고 모델 폴더를 다시 읽습니다. 언어(한국어/English)를 바꾸면 페이지를 새로고침합니다. Negative Prompt는 모든 모드에 적용되고, Prompt Suffix는 프롬프트 뒤에 자동으로 붙습니다. Save Folder는 `ComfyUI/output/` 안의 저장 폴더 이름입니다. “모델 오버라이드 슬롯”을 켜면 Primitive(String) 노드로 모델 파일명을 연결해 설정 칸보다 우선 적용할 수 있습니다(.gguf는 자동으로 GGUF 로더 사용).\n**LLM / Translation** — 프롬프트 보강(Refine·Auto Enhance)과 한↔영 번역에 쓸 모델을 정합니다. 번역 설정은 모든 노드가 같이 씁니다.\n**Node Skin** — 이 노드의 색을 바꿉니다(공통 기능 페이지 참고).\n위쪽 **Save All**로 저장하고 ✕로 닫습니다.",
    "en": "The settings window has four tabs: **Model**, **LLM**, **Translation**, **Node Skin**.\n**Model** — pick the Diffusion Model / Text Encoder / VAE (each has a search box above it). **↻ Refresh Models** rescans the model folders without restarting ComfyUI. Changing the language (한국어 / English) reloads the page. The Negative Prompt applies to every mode and the Prompt Suffix is appended to the prompt automatically. Save Folder is the folder name inside `ComfyUI/output/`. Turning on “Model Override Slots” lets a Primitive(String) node supply the model file name, which wins over the Settings dropdown (.gguf files use the GGUF loader automatically).\n**LLM / Translation** — choose the models used for prompt help (Refine, Auto Enhance) and for KO↔EN translation. The translation setting is shared by every node.\n**Node Skin** — change this node's colors (see the Common Features page).\nUse **Save All** at the top to save and ✕ to close."
   },
   "img": {
    "src": "img/zimage-settings.png",
    "cap": {
     "ko": "⚙ 설정 창의 Model 탭",
     "en": "The Model tab of the ⚙ settings window"
    }
   }
  },
  {
   "h": {
    "ko": "INPAINT 모드 화면",
    "en": "INPAINT mode screen"
   },
   "body": {
    "ko": "INPAINT를 누르면 왼쪽에 **SOURCE IMAGE**(클릭하거나 끌어 놓아 올리기)와 **DENOISE** 슬라이더가 나타납니다. 낮을수록 원본 맥락을 유지합니다(권장 0.7~0.9). 올린 이미지에 내장 마스크 에디터로 칠한 영역만 다시 그립니다. 자세한 순서는 아래 “INPAINT” 항목을 보세요.",
    "en": "Pressing INPAINT shows **SOURCE IMAGE** (click or drag a file in) and a **DENOISE** slider on the left. A lower value keeps more of the original (0.7–0.9 recommended). Only the area you paint with the built-in mask editor is redrawn. The exact steps are in the “INPAINT” item below."
   },
   "img": {
    "src": "img/zimage-inpaint.png",
    "cap": {
     "ko": "INPAINT 모드",
     "en": "INPAINT mode"
    }
   }
  },
  {
   "h": {
    "ko": "지원 모드 한눈에",
    "en": "Modes at a glance"
   },
   "body": {
    "ko": "| 모드 | 하는 일 |\n|---|---|\n| T2I | 글 → 이미지 |\n| I2I | 소스 이미지를 바탕으로 변형 |\n| INPAINT | 마스크로 칠한 영역만 재생성 |\n| OUTPAINT | 캔버스를 넓히고 빈 곳을 채움 |\n| RE-BG | 피사체를 분리하고 배경을 새로 생성 |\n| CONTROLNET | Depth / Canny / Pose / HED / MLSD 참조로 생성 |\n| FACE REDRAW | 얼굴을 찾아 잘라 LoRA로 다시 그린 뒤 원본에 합성 |\n| UPSCALE | SeedVR2 AI 업스케일 |",
    "en": "| Mode | What it does |\n|---|---|\n| T2I | text → image |\n| I2I | transform a source image |\n| INPAINT | regenerate only the masked area |\n| OUTPAINT | extend the canvas and fill the new area |\n| RE-BG | separate the subject and regenerate the background |\n| CONTROLNET | generate from a Depth / Canny / Pose / HED / MLSD reference |\n| FACE REDRAW | find the face, crop it, redraw with a LoRA, blend it back |\n| UPSCALE | SeedVR2 AI upscale |"
   }
  },
  {
   "h": {
    "ko": "필요한 모델",
    "en": "Required models"
   },
   "body": {
    "ko": "| 종류 | 폴더 | 파일 |\n|---|---|---|\n| Diffusion Model | `models/diffusion_models/` | z_image_turbo_bf16 |\n| Text Encoder | `models/text_encoders/` | qwen_3_4b |\n| VAE | `models/vae/` | ae.safetensors |\n| ControlNet (선택) | `models/controlnet/` | Z-Image-Turbo-Fun-Controlnet-Union |\n| 업스케일 (선택) | `models/SEEDVR2/` | SeedVR2 DiT + VAE |",
    "en": "| Type | Folder | File |\n|---|---|---|\n| Diffusion Model | `models/diffusion_models/` | z_image_turbo_bf16 |\n| Text Encoder | `models/text_encoders/` | qwen_3_4b |\n| VAE | `models/vae/` | ae.safetensors |\n| ControlNet (optional) | `models/controlnet/` | Z-Image-Turbo-Fun-Controlnet-Union |\n| Upscale (optional) | `models/SEEDVR2/` | SeedVR2 DiT + VAE |"
   }
  },
  {
   "h": {
    "ko": "개요",
    "en": "Overview"
   },
   "body": {
    "ko": "Z-Image ONE STUDIO (TJ)은 Z-Image Turbo (Flow-matching 모델) 전용 올인원 생성 노드입니다.\n상단 모드 버튼으로 T2I / I2I / INPAINT / RE-BG / CONTROLNET / FACE REDRAW 를 전환하며,\n오른쪽 프리뷰에서 결과를 확인하고 하단 Send to 버튼으로 다음 작업으로 바로 넘길 수 있습니다.",
    "en": "Z-Image ONE STUDIO (TJ) is an all-in-one generation node for Z-Image Turbo (flow-matching model).\nSwitch between T2I / I2I / INPAINT / RE-BG / CONTROLNET / FACE REDRAW using the mode buttons at the top.\nView results in the right preview and pass them to the next workflow step via Send to buttons."
   }
  },
  {
   "h": {
    "ko": "⚙ 초기 설정 (Settings)",
    "en": "⚙ Initial Setup (Settings)"
   },
   "body": {
    "ko": "우상단 ⚙ 버튼 → Settings 오버레이에서 아래를 반드시 설정하세요.\n• Diffusion Model  — UNet 모델 선택 (models/diffusion_models/)\n• Text Encoder     — CLIP 텍스트 인코더 선택 (models/text_encoders/)\n• VAE              — VAE 모델 선택 (models/vae/)\n• Negative Prompt  — 전 모드에 공통 적용할 부정 프롬프트\n• Prompt Suffix    — 전 모드 프롬프트 끝에 자동 추가할 키워드\n• Save Subfolder   — 저장 폴더 이름 (기본: z-image-one-tj)\n설정은 자동 저장되며 ComfyUI 재시작 후에도 유지됩니다.",
    "en": "Click ⚙ (top-right) → Settings overlay and configure the following:\n• Diffusion Model  — UNet model selection (models/diffusion_models/)\n• Text Encoder     — CLIP text encoder (models/text_encoders/)\n• VAE              — VAE model (models/vae/)\n• Negative Prompt  — applied to all modes globally\n• Prompt Suffix    — keywords appended to every prompt automatically\n• Save Subfolder   — output folder name (default: z-image-one-tj)\nSettings are saved automatically and persist across ComfyUI restarts."
   }
  },
  {
   "h": {
    "ko": "T2I — 텍스트→이미지",
    "en": "T2I — Text to Image"
   },
   "body": {
    "ko": "프롬프트로 이미지를 새로 생성합니다.\n• Resolution Preset — 자주 쓰는 해상도 프리셋 또는 Custom으로 직접 입력\n• Steps / CFG / Shift / Sampler / Scheduler — 샘플링 파라미터\n• LoRA (최대 3개) — LoRA 파일 선택, 강도 조절, 트리거 워드 자동 감지\n• Seed / Mode — Fixed(고정), Random(매번 랜덤), +1/-1(증감)\n생성 후 Send to 버튼으로 → I2I / INPAINT / RE-BG / CONTROLNET / FACE REDRAW 로 전달 가능.",
    "en": "Generate a new image from a text prompt.\n• Resolution Preset — common presets or Custom for manual dimensions\n• Steps / CFG / Shift / Sampler / Scheduler — sampling parameters\n• LoRA (up to 3) — select LoRA files, adjust strength, auto-detect trigger words\n• Seed / Mode — Fixed, Random, +1/-1 increment\nAfter generation, use Send to → I2I / INPAINT / RE-BG / CONTROLNET / FACE REDRAW."
   }
  },
  {
   "h": {
    "ko": "I2I — 이미지→이미지",
    "en": "I2I — Image to Image"
   },
   "body": {
    "ko": "소스 이미지를 참고해 변형 생성합니다.\n• Source Image 업로드 또는 다른 모드에서 Send to → I2I 로 전달\n• Denoise — 낮을수록 원본 유지(0.3~0.6), 높을수록 자유 변형(0.8~1.0)\n• Compare 버튼(⇌) — ON 시 결과와 원본을 슬라이더로 비교 가능",
    "en": "Generate a variation from a reference image.\n• Upload Source Image or receive via Send to → I2I\n• Denoise — lower values preserve original (0.3~0.6), higher values allow free variation (0.8~1.0)\n• Compare button (⇌) — when ON, compare result and source with a slider"
   }
  },
  {
   "h": {
    "ko": "INPAINT — 마스크 영역 재생성",
    "en": "INPAINT — Masked Area Regeneration"
   },
   "body": {
    "ko": "이미지의 특정 영역만 프롬프트로 재생성합니다. DifferentialDiffusion 방식 사용.\n• Source Image 업로드\n• ✏ 마스크 수정하기 — 클릭 시 ComfyUI 기본 마스크 에디터 오픈.\n  흰색(White) = 재생성할 영역 / 검은색(Black) = 유지할 영역\n  저장 시 자동으로 마스크 이미지에 반영됩니다.\n• 직접 업로드 — 외부 툴로 만든 마스크 PNG를 업로드하는 대안 방법\n• Denoise — 0.7~0.9 권장. 낮을수록 원본 맥락 강하게 유지.\n핵심: DifferentialDiffusion이 마스크 경계를 부드럽게 처리해 자연스러운 합성.",
    "en": "Regenerate only the masked region using a prompt. Uses DifferentialDiffusion.\n• Upload Source Image\n• ✏ Edit Mask — opens ComfyUI's built-in mask editor.\n  White = area to regenerate / Black = area to preserve\n  Saved mask is automatically applied.\n• Direct Upload — alternative: upload a mask PNG from an external tool\n• Denoise — 0.7~0.9 recommended. Lower values keep original context stronger.\nKey: DifferentialDiffusion smoothly handles mask edges for natural compositing."
   }
  },
  {
   "h": {
    "ko": "RE-BG — 배경 재생성 + 확장",
    "en": "RE-BG — Background Regeneration + Expansion"
   },
   "body": {
    "ko": "RMBG로 서브젝트를 분리 후 배경만 완전 재생성합니다. 경계선 없음.\n기존 Outpaint의 경계선 문제를 해결한 방식입니다.\n• BG Removal Model — birefnet 등 설치된 배경제거 모델 선택\n• Source Image 업로드\n• Expansion px — Up/Down/Left/Right 각 방향으로 캔버스 확장 픽셀 지정.\n  모두 0이면 배경만 재생성(크기 유지), 값 입력 시 해당 방향으로 확장 후 재생성.\n• Edge Feathering — 확장 경계 블렌딩 강도 (px)\n• Background Denoise — 1.0=완전히 새 배경(권장), 낮추면 원본 색감 참조\n동작 원리:\n  1. RMBG → 서브젝트 마스크 추출\n  2. 확장된 캔버스 전체를 새 배경으로 재생성 (denoise=1)\n  3. 서브젝트를 새 배경 위에 합성 → 경계선 없는 완성 이미지",
    "en": "Separates subject with RMBG then fully regenerates the background. No edge artifacts.\nThis solves the border artifacts common in traditional Outpaint.\n• BG Removal Model — select an installed background removal model (BiRefNet etc.)\n• Upload Source Image\n• Expansion px — specify canvas expansion per direction (Up/Down/Left/Right).\n  All 0 = regenerate background only (same canvas size). Non-zero values expand then regenerate.\n• Edge Feathering — blending strength at the expanded boundary (px)\n• Background Denoise — 1.0 = fully new background (recommended), lower preserves original colors\nHow it works:\n  1. RMBG → extract subject mask\n  2. Regenerate entire expanded canvas as new background (denoise=1)\n  3. Composite subject onto new background → seamless final image"
   }
  },
  {
   "h": {
    "ko": "CONTROLNET — 구조/자세 참조 생성",
    "en": "CONTROLNET — Structure / Pose Reference"
   },
   "body": {
    "ko": "레퍼런스 이미지의 구조/자세/윤곽을 참고해 생성합니다.\n• ControlNet Union Model — models/model_patches/ 의 모델 선택\n• Reference Image 업로드\n• Control Type — Depth(깊이), Canny(윤곽선), Pose(자세), HED, MLSD, None\n• Strength — ControlNet 적용 강도 (0~1)\n• Resolution — 전처리 해상도 (512~1024)\nGetImageSize 노드로 레퍼런스 이미지 크기를 자동 감지해 latent 크기를 맞춥니다.",
    "en": "Generate using the structure, pose, or outlines of a reference image.\n• ControlNet Union Model — select model from models/model_patches/\n• Upload Reference Image\n• Control Type — Depth, Canny, Pose, HED, MLSD, None\n• Strength — ControlNet influence strength (0~1)\n• Resolution — preprocessor resolution (512~1024)\nGetImageSize node auto-detects reference image size to match latent dimensions."
   }
  },
  {
   "h": {
    "ko": "FACE REDRAW — 얼굴 재생성",
    "en": "FACE REDRAW — Face Regeneration"
   },
   "body": {
    "ko": "Impact Pack의 FaceDetailer를 사용해 얼굴 영역만 정밀 재생성합니다.\n• Face Detector — UltralyticsDetectorProvider용 모델 선택 (ultralytics/bbox/*.pt)\n• Source Portrait — 대상 인물 이미지 업로드\n• Threshold — 얼굴 감지 민감도 (낮을수록 더 많이 감지)\n• Dilation px — 감지 마스크 팽창 픽셀\n• Denoise — 얼굴 재생성 강도 (0.4~0.6 권장, 너무 높으면 원본과 달라짐)\n• Feather px — 마스크 경계 블렌딩\n사전 요구: ComfyUI Impact Pack 설치, ultralytics/bbox/ 에 감지 모델 필요.",
    "en": "Uses Impact Pack's FaceDetailer to precisely regenerate the face region only.\n• Face Detector — select model for UltralyticsDetectorProvider (ultralytics/bbox/*.pt)\n• Source Portrait — upload the portrait image\n• Threshold — face detection sensitivity (lower = more detections)\n• Dilation px — expand detection mask by this many pixels\n• Denoise — face regeneration strength (0.4~0.6 recommended; too high diverges from original)\n• Feather px — mask edge blending\nPrerequisites: ComfyUI Impact Pack installed, detection model in ultralytics/bbox/."
   }
  },
  {
   "h": {
    "ko": "공통 기능",
    "en": "Common Features"
   },
   "body": {
    "ko": "⇌ Compare  — ON 시 보라색 강조. 생성 결과와 소스 이미지를 슬라이더로 비교.\n             T2I 제외 전 모드에서 활성화 가능.\n🗑 Unload   — 현재 로드된 모델을 VRAM/RAM에서 해제.\n⚙ Settings — 모델 선택, 네거티브/접미사 프롬프트, 저장 설정.\n🖼 Gallery  — 저장된 이미지 갤러리. 즐겨찾기, 메타데이터 재사용, 삭제,\n             폴더 열기, 다른 모드로 Send to 기능 포함.\n📋 Template — 저장된 프롬프트 템플릿 불러오기.\n🔍 Expand   — 프롬프트를 전체 화면 에디터로 확장 편집.\nSend to     — 생성 결과를 다른 모드의 소스 이미지로 바로 전달.\nOutput      — 👁 Preview(임시 저장) / 💾 Save(영구 저장) 전환.",
    "en": "⇌ Compare  — When ON (purple highlight), compare result and source with a slider.\n             Available in all modes except T2I.\n🗑 Unload   — Release currently loaded models from VRAM/RAM.\n⚙ Settings — Model selection, negative/suffix prompts, save settings.\n🖼 Gallery  — Image gallery with favorites, metadata reuse, delete,\n             open folder, and Send to other modes.\n📋 Template — Load saved prompt templates.\n🔍 Expand   — Open full-screen prompt editor.\nSend to     — Pass generation result directly to another mode as source.\nOutput      — 👁 Preview (temp) / 💾 Save (permanent) toggle."
   }
  },
  {
   "h": {
    "ko": "📦 모델 다운로드 가이드",
    "en": "📦 Model Download Guide"
   },
   "body": {
    "ko": "◆ Diffusion Model → models/diffusion_models/\n • z_image_turbo_bf16.safetensors (권장)\n   https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/diffusion_models/z_image_turbo_bf16.safetensors\n 전체 모델 목록: https://huggingface.co/Comfy-Org/z_image_turbo\n\n◆ Text Encoder → models/text_encoders/\n • qwen_3_4b.safetensors\n   https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/text_encoders/qwen_3_4b.safetensors\n\n◆ VAE → models/vae/\n • ae.safetensors\n   https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/vae/ae.safetensors\n\n◆ ControlNet → models/controlnet/\n • Z-Image-Turbo-Fun-Controlnet-Union.safetensors\n   https://huggingface.co/alibaba-pai/Z-Image-Turbo-Fun-Controlnet-Union/resolve/main/Z-Image-Turbo-Fun-Controlnet-Union.safetensors\n\n◆ Face Detector (Face Redraw용) → models/ultralytics/bbox/\n • face_yolov8m.pt\n   https://huggingface.co/Bingsu/adetailer/resolve/main/face_yolov8m.pt\n • face_yolov9c.pt\n   https://huggingface.co/Bingsu/adetailer/resolve/main/face_yolov9c.pt\n\n◆ BG Removal → models/background_removal/\n • BiRefNet-general.pth (권장)\n   https://huggingface.co/ZhengPeng7/BiRefNet/resolve/main/BiRefNet-general.pth\n • BiRefNet-portrait.pth\n   https://huggingface.co/ZhengPeng7/BiRefNet-portrait/resolve/main/BiRefNet-portrait.pth",
    "en": "◆ Diffusion Model → models/diffusion_models/\n • z_image_turbo_bf16.safetensors (recommended)\n   https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/diffusion_models/z_image_turbo_bf16.safetensors\n Full model list: https://huggingface.co/Comfy-Org/z_image_turbo\n\n◆ Text Encoder → models/text_encoders/\n • qwen_3_4b.safetensors\n   https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/text_encoders/qwen_3_4b.safetensors\n\n◆ VAE → models/vae/\n • ae.safetensors\n   https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/vae/ae.safetensors\n\n◆ ControlNet → models/controlnet/\n • Z-Image-Turbo-Fun-Controlnet-Union.safetensors\n   https://huggingface.co/alibaba-pai/Z-Image-Turbo-Fun-Controlnet-Union/resolve/main/Z-Image-Turbo-Fun-Controlnet-Union.safetensors\n\n◆ Face Detector (for Face Redraw) → models/ultralytics/bbox/\n • face_yolov8m.pt\n   https://huggingface.co/Bingsu/adetailer/resolve/main/face_yolov8m.pt\n • face_yolov9c.pt\n   https://huggingface.co/Bingsu/adetailer/resolve/main/face_yolov9c.pt\n\n◆ BG Removal → models/background_removal/\n • BiRefNet-general.pth (recommended)\n   https://huggingface.co/ZhengPeng7/BiRefNet/resolve/main/BiRefNet-general.pth\n • BiRefNet-portrait.pth\n   https://huggingface.co/ZhengPeng7/BiRefNet-portrait/resolve/main/BiRefNet-portrait.pth"
   }
  }
 ]
});

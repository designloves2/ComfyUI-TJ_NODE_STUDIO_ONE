MANUAL.add({
 "id": "klein",
 "title": {
  "ko": "Flux.2 Klein ONE STUDIO",
  "en": "Flux.2 Klein ONE STUDIO"
 },
 "lead": {
  "ko": "Flux.2 Klein(9B / 4B) 전용 올인원 이미지 노드. 생성, 편집, 인페인트, 얼굴 교체, 업스케일.",
  "en": "All-in-one image node for Flux.2 Klein (9B / 4B): generate, edit, inpaint, face swap and upscale."
 },
 "sections": [
  {
   "h": {
    "ko": "화면 구성",
    "en": "The screen"
   },
   "body": {
    "ko": "**1. 모드 버튼** (맨 위 왼쪽) — T2I · I2I · EDIT · PAINT · FACESWAP · UPSCALE. 모드마다 왼쪽 패널의 입력칸이 바뀝니다.\n**2. Prompt/pipe Override 스위치** — 켜면 연결된 `prompt_override`·`pipe`를 사용하고, 끄면 연결돼 있어도 둘 다 무시합니다.\n**3. 오른쪽 위 아이콘** — KV 배지(모델 이름에 `kv`가 있으면 KV Cache가 자동으로 켜졌다는 표시) · ↺ 노드 초기화(저장값 삭제 후 기본값 복원) · ⇌ 비교 슬라이더(켜면 원본과 결과를 드래그로 비교) · 🗑 RAM/VRAM 비우기(모델 언로드) · ⚙ 설정 · 🖼 갤러리 · ? 사용 설명서.\n**4. 왼쪽 패널** — 해상도, STEPS / CFG, SAMPLER / SCHEDULER, LoRA(최대 3개, Faceswap은 1개), SEED와 그 모드.\n**5. 가운데 큰 영역** — 결과 프리뷰. 생성 전에는 “Generate to see result”가 보입니다.\n**6. 프리뷰 아래** — Send to(→ I2I, → Edit, → Inpaint, → Outpaint, → Faceswap, → Upscale) 버튼으로 결과를 다른 모드로 보내고, Output의 Preview / Save로 저장 방식을 고릅니다.\n**7. 프롬프트 줄** — 글자 수, Auto Enhance, Refine, Prompt Edit, Prompt Preset, EN/한 번역 버튼.\n**8. Generate / Stop** — 생성 시작과 중지. 그 위에 SEED와 시드 모드(Random 등)가 있습니다.",
    "en": "**1. Mode buttons** (top left) — T2I · I2I · EDIT · PAINT · FACESWAP · UPSCALE. The inputs in the left panel change with the mode.\n**2. Prompt/pipe Override switch** — On: a connected `prompt_override` / `pipe` is used. Off: both are ignored even while connected.\n**3. Icons at the top right** — the KV badge (shows that KV Cache is on automatically when the model file name contains `kv`) · ↺ reset the node (deletes saved values, restores defaults) · ⇌ compare slider (drag to compare the source and the result) · 🗑 free RAM/VRAM (unload models) · ⚙ settings · 🖼 gallery · ? built-in help.\n**4. Left panel** — resolution, STEPS / CFG, SAMPLER / SCHEDULER, LoRA (up to 3, one in Faceswap), SEED and its mode.\n**5. Large middle area** — the result preview. Before a run it says “Generate to see result”.\n**6. Under the preview** — the Send to buttons (→ I2I, → Edit, → Inpaint, → Outpaint, → Faceswap, → Upscale) hand the result to another mode; Output Preview / Save chooses whether results are saved.\n**7. Prompt row** — character count, Auto Enhance, Refine, Prompt Edit, Prompt Preset and the EN / 한 translation button.\n**8. Generate / Stop** — start and stop a run. Above them are SEED and the seed mode (Random, …)."
   },
   "img": {
    "src": "img/klein-main.png",
    "cap": {
     "ko": "Flux.2 Klein ONE STUDIO, T2I 모드",
     "en": "Flux.2 Klein ONE STUDIO in T2I mode"
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
    "src": "img/klein-settings.png",
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
    "ko": "| 모드 | 설명 |\n|---|---|\n| **T2I** | 텍스트 → 이미지 기본 생성 |\n| **I2I** | 소스 이미지 기반 변형 생성 |\n| **EDIT** | 레퍼런스 이미지 1~5장 기반 멀티 레퍼런스 편집 |\n| **PAINT** | 내장 마스크 에디터로 특정 영역 재생성 + Outpaint 지원 |\n| **FACESWAP** | BFS 얼굴 LoRA를 사용한 얼굴 교체·재생성 |\n| **UPSCALE** | SeedVR2 AI 업스케일 — DiT 모델 기반 초고해상도 변환 |",
    "en": "| Mode | Description |\n|---|---|\n| **T2I** | basic text-to-image generation |\n| **I2I** | source image-based transformation |\n| **EDIT** | multi-reference editing based on 1–5 reference images |\n| **PAINT** | built-in mask editor regenerate selected areas with Outpaint support |\n| **FACESWAP** | BFS face replacement and regeneration using a BFS face LoRA |\n| **UPSCALE** | SeedVR2 AI — DiT ultra-high-resolution conversion using a DiT model |"
   }
  },
  {
   "h": {
    "ko": "필요한 모델",
    "en": "Required models"
   },
   "body": {
    "ko": "| 종류 | 경로 | 다운로드 |\n|---|---|---|\n| Diffusion Model | `models/diffusion_models/` | [BFL FLUX.2 Collection](https://huggingface.co/collections/black-forest-labs/flux2) |\n| Text Encoder (9B) | `models/text_encoders/` | [Comfy-Org 9B pack](https://huggingface.co/Comfy-Org/vae-text-encorder-for-flux-klein-9b) |\n| Text Encoder (4B) | `models/text_encoders/` | [Comfy-Org 4B pack](https://huggingface.co/Comfy-Org/vae-text-encorder-for-flux-klein-4b) |\n| VAE | `models/vae/` | [Comfy-Org 9B pack](https://huggingface.co/Comfy-Org/vae-text-encorder-for-flux-klein-9b) |\n| BFS LoRA (Faceswap) | `models/loras/` | [BFS-Best-Face-Swap](https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap) |\n\n**KV Cache**: 파일명에 `kv`가 포함된 모델은 자동으로 FluxKVCache 노드를 활성화합니다.",
    "en": "| Type | Path | Download |\n|---|---|---|\n| Diffusion Model | `models/diffusion_models/` | [BFL FLUX.2 Collection](https://huggingface.co/collections/black-forest-labs/flux2) |\n| Text Encoder (9B) | `models/text_encoders/` | [Comfy-Org 9B pack](https://huggingface.co/Comfy-Org/vae-text-encorder-for-flux-klein-9b) |\n| Text Encoder (4B) | `models/text_encoders/` | [Comfy-Org 4B pack](https://huggingface.co/Comfy-Org/vae-text-encorder-for-flux-klein-4b) |\n| VAE | `models/vae/` | [Comfy-Org 9B pack](https://huggingface.co/Comfy-Org/vae-text-encorder-for-flux-klein-9b) |\n| BFS LoRA (Faceswap) | `models/loras/` | [BFS-Best-Face-Swap](https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap) |\n\n**KV Cache**: Models whose filenames contain `kv` automatically FluxKVCache enable the node."
   }
  },
  {
   "h": {
    "ko": "T2I — 텍스트→이미지",
    "en": "T2I — Text to Image"
   },
   "body": {
    "ko": "텍스트 프롬프트로 이미지를 생성합니다.\n• 해상도: 1024×1536 (세로) 기본 설정\n• Steps/CFG/Sampler/Scheduler: 4/1/er_sde/simple 권장\n• LoRA: 최대 3개 — Strength, Trigger Word 설정 가능",
    "en": "Generate an image from a text prompt.\n• Resolution: 1024×1536 (portrait) by default\n• Steps/CFG/Sampler/Scheduler: 4/1/er_sde/simple recommended\n• LoRA: up to 3 — configure Strength and Trigger Word"
   }
  },
  {
   "h": {
    "ko": "I2I — 이미지→이미지",
    "en": "I2I — Image to Image"
   },
   "body": {
    "ko": "소스 이미지를 기반으로 변형합니다.\n• Denoise 0.5~0.75: 원본 형태 유지하며 스타일 변경\n• Denoise 0.8~1.0: 대폭 변형",
    "en": "Transform an image based on a source reference.\n• Denoise 0.5~0.75: style change while preserving original structure\n• Denoise 0.8~1.0: significant transformation"
   }
  },
  {
   "h": {
    "ko": "EDIT — 멀티 레퍼런스 편집",
    "en": "EDIT — Multi-Reference Editing"
   },
   "body": {
    "ko": "참조 이미지 1~5장으로 이미지를 생성합니다.\n• Image 1: 주 참조 (필수)\n• Add Ref Image 버튼으로 2~5번 참조 이미지 추가\n• Size Source: 출력 크기를 Image 1 기준으로 맞춤",
    "en": "Generate an image using 1~5 reference images.\n• Image 1: primary reference (required)\n• Add additional references (2~5) via Add Ref Image button\n• Size Source: match output size to Image 1"
   }
  },
  {
   "h": {
    "ko": "PAINT — 인페인트",
    "en": "PAINT — Inpaint"
   },
   "body": {
    "ko": "이미지의 특정 영역을 재생성합니다.\n• 소스 이미지 업로드 후 캔버스에서 마스크 직접 드로잉\n• 보라색 = 재생성 영역 / 검정 = 유지 영역\n• 브러시/지우개 전환, 크기 조절, 줌/팬 지원\n• ⤢ 크게 편집: 전체 화면 팝업 에디터\n• 💾 마스크 저장 후 Generate",
    "en": "Regenerate a specific region of an image.\n• Upload source image then draw mask directly on the canvas\n• Purple = area to regenerate / Black = area to preserve\n• Brush/eraser toggle, size control, zoom/pan supported\n• ⤢ Large Edit: full-screen popup editor\n• 💾 Save mask then Generate"
   }
  },
  {
   "h": {
    "ko": "FACESWAP — 얼굴 교체",
    "en": "FACESWAP — Face Replacement"
   },
   "body": {
    "ko": "Target(배경)의 얼굴을 Source 얼굴로 교체합니다.\n• Faceswap 전용 LoRA를 설정에 구성하세요\n• Denoise 1.0 권장 (완전 재생성)",
    "en": "Replace the face in Target (scene) with the Source face.\n• Configure Faceswap-dedicated LoRA in settings\n• Denoise 1.0 recommended (full regeneration)"
   }
  },
  {
   "h": {
    "ko": "공통 기능",
    "en": "Common Features"
   },
   "body": {
    "ko": "⇌ Compare  — ON 시 보라색 강조. 생성 결과와 소스를 슬라이더로 비교.\n             T2I 제외 전 모드에서 활성화 가능. 기본값 ON.\nKV         — KV Cache 토글. 모델명에 'kv' 포함 시 Auto ON.\n↺ Reset    — 노드 상태 초기화 (모든 설정 리셋).\n🗑 Unload   — 현재 로드된 모델을 VRAM/RAM에서 해제.\n⚙ Settings — 모델 선택, 네거티브/접미사 프롬프트, 저장 설정.\n🖼 Gallery  — 저장된 이미지 갤러리. 즐겨찾기, 메타데이터, Send to 기능.\n📋 Template — 저장된 프롬프트 템플릿 불러오기.\n🔍 Expand   — 프롬프트를 전체 화면 에디터로 확장 편집.\nSend to     — 생성 결과를 다른 모드의 소스 이미지로 전달.\nOutput      — 👁 Preview(임시) / 💾 Save(영구) 전환.",
    "en": "⇌ Compare  — When ON (purple highlight), compare result and source with a slider.\n             Available in all modes except T2I. Default ON.\nKV         — KV Cache toggle. Auto-ON when model name contains 'kv'.\n↺ Reset    — Reset node state (all settings cleared).\n🗑 Unload   — Release currently loaded models from VRAM/RAM.\n⚙ Settings — Model selection, negative/suffix prompts, save settings.\n🖼 Gallery  — Image gallery with favorites, metadata, Send to support.\n📋 Template — Load saved prompt templates.\n🔍 Expand   — Open full-screen prompt editor.\nSend to     — Pass generation result to another mode as source.\nOutput      — 👁 Preview (temp) / 💾 Save (permanent) toggle."
   }
  },
  {
   "h": {
    "ko": "📦 모델 다운로드 가이드",
    "en": "📦 Model Download Guide"
   },
   "body": {
    "ko": "◆ Diffusion Model → models/diffusion_models/\n FLUX.2 [klein] 모델 (Black Forest Labs)\n https://huggingface.co/collections/black-forest-labs/flux2\n ⚠ 9B 모델은 HuggingFace 로그인 후 Non-Commercial License 동의 필요\n\n◆ Text Encoder (9B 모델용) → models/text_encoders/\n https://huggingface.co/Comfy-Org/vae-text-encorder-for-flux-klein-9b/tree/main/split_files/text_encoders\n\n◆ Text Encoder (4B 모델용) → models/text_encoders/\n https://huggingface.co/Comfy-Org/vae-text-encorder-for-flux-klein-4b/tree/main/split_files/text_encoders\n\n◆ VAE → models/vae/\n https://huggingface.co/Comfy-Org/vae-text-encorder-for-flux-klein-9b/tree/main/split_files/vae\n\n◆ Faceswap LoRA → models/loras/\n • BFS Head Swap v1 (9b)\n   https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap/blob/main/bfs_head_v1_flux-klein_9b_step3500_rank128.safetensors\n • BFS Head Swap v1 (4b)\n   https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap/blob/main/bfs_head_v1_flux-klein_4b.safetensors\n\n◆ BG Removal → models/background_removal/\n https://huggingface.co/Comfy-Org/BiRefNet/tree/main/background_removal",
    "en": "◆ Diffusion Model → models/diffusion_models/\n FLUX.2 [klein] models (Black Forest Labs)\n https://huggingface.co/collections/black-forest-labs/flux2\n ⚠ 9B model requires HuggingFace login and Non-Commercial License agreement\n\n◆ Text Encoder (for 9B model) → models/text_encoders/\n https://huggingface.co/Comfy-Org/vae-text-encorder-for-flux-klein-9b/tree/main/split_files/text_encoders\n\n◆ Text Encoder (for 4B model) → models/text_encoders/\n https://huggingface.co/Comfy-Org/vae-text-encorder-for-flux-klein-4b/tree/main/split_files/text_encoders\n\n◆ VAE → models/vae/\n https://huggingface.co/Comfy-Org/vae-text-encorder-for-flux-klein-9b/tree/main/split_files/vae\n\n◆ Faceswap LoRA → models/loras/\n • BFS Head Swap v1 (9b)\n   https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap/blob/main/bfs_head_v1_flux-klein_9b_step3500_rank128.safetensors\n • BFS Head Swap v1 (4b)\n   https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap/blob/main/bfs_head_v1_flux-klein_4b.safetensors\n\n◆ BG Removal → models/background_removal/\n https://huggingface.co/Comfy-Org/BiRefNet/tree/main/background_removal"
   }
  }
 ]
});

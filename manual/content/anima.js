MANUAL.add({
 "id": "anima",
 "title": {
  "ko": "Anima ONE STUDIO",
  "en": "Anima ONE STUDIO"
 },
 "lead": {
  "ko": "Anima(ComfyUI 기본 애니메풍 이미지 모델) 전용 노드. T2I, 인페인트, Any Control, Depth Control, Turbo LoRA, 인라인 마스크 페인터.",
  "en": "Node for Anima, ComfyUI's native anime-style image model: T2I, inpainting, Any Control, Depth Control, Turbo LoRA and an inline mask painter."
 },
 "sections": [
  {
   "h": {
    "ko": "화면 구성",
    "en": "The screen"
   },
   "body": {
    "ko": "**1. 모드 버튼** (맨 위 왼쪽) — T2I · INPAINTING · ANY CONTROL · DEPTH CONTROL · UPSCALE. 모드마다 왼쪽 패널의 입력칸이 바뀝니다.\n**2. Prompt/pipe Override 스위치** — 켜면 연결된 `prompt_override`·`pipe`를 사용하고, 끄면 연결돼 있어도 둘 다 무시합니다.\n**3. 오른쪽 위 아이콘** — ↺ 노드 초기화(저장값 삭제 후 기본값 복원) · ⇌ 비교 슬라이더(켜면 원본과 결과를 드래그로 비교) · 🗑 RAM/VRAM 비우기(모델 언로드) · ⚙ 설정 · 🖼 갤러리 · ? 사용 설명서.\n**4. 왼쪽 패널** — **CHECKPOINT** 드롭다운(Base 1.0 / Preview3 등), 해상도, **TURBO 체크박스**(켜면 Base 1.0 + Turbo LoRA, 8 steps / CFG 1), STEPS / CFG, SAMPLER / SCHEDULER, LoRA(최대 3개), SEED와 그 모드. 컨트롤 모드에서는 이미지(와 마스크) 입력칸이 추가됩니다.\n**5. 가운데 큰 영역** — 결과 프리뷰. 생성 전에는 “Generate to see result”가 보입니다.\n**6. 프리뷰 아래** — Send to(→ Inpainting, → Any Control, → Depth Control, → Upscale) 버튼으로 결과를 다른 모드로 보내고, Output의 Preview / Save로 저장 방식을 고릅니다.\n**7. 프롬프트 줄** — 글자 수, Auto Enhance, Refine, Prompt Edit, Prompt Preset, EN/한 번역 버튼.\n**8. Generate / Stop** — 생성 시작과 중지. 그 위에 SEED와 시드 모드(Random 등)가 있습니다.",
    "en": "**1. Mode buttons** (top left) — T2I · INPAINTING · ANY CONTROL · DEPTH CONTROL · UPSCALE. The inputs in the left panel change with the mode.\n**2. Prompt/pipe Override switch** — On: a connected `prompt_override` / `pipe` is used. Off: both are ignored even while connected.\n**3. Icons at the top right** — ↺ reset the node (deletes saved values, restores defaults) · ⇌ compare slider (drag to compare the source and the result) · 🗑 free RAM/VRAM (unload models) · ⚙ settings · 🖼 gallery · ? built-in help.\n**4. Left panel** — the **CHECKPOINT** dropdown (Base 1.0 / Preview3, …), resolution, the **TURBO checkbox** (on = Base 1.0 + Turbo LoRA, 8 steps / CFG 1), STEPS / CFG, SAMPLER / SCHEDULER, LoRA (up to 3), SEED and its mode. The control modes add an image (and mask) input.\n**5. Large middle area** — the result preview. Before a run it says “Generate to see result”.\n**6. Under the preview** — the Send to buttons (→ Inpainting, → Any Control, → Depth Control, → Upscale) hand the result to another mode; Output Preview / Save chooses whether results are saved.\n**7. Prompt row** — character count, Auto Enhance, Refine, Prompt Edit, Prompt Preset and the EN / 한 translation button.\n**8. Generate / Stop** — start and stop a run. Above them are SEED and the seed mode (Random, …)."
   },
   "img": {
    "src": "img/anima-main.png",
    "cap": {
     "ko": "Anima ONE STUDIO",
     "en": "Anima ONE STUDIO"
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
    "src": "img/anima-settings.png",
    "cap": {
     "ko": "⚙ 설정 창",
     "en": "The ⚙ settings window"
    }
   }
  },
  {
   "h": {
    "ko": "소개",
    "en": "Overview"
   },
   "body": {
    "ko": "Anima는 ComfyUI 기본 제공 애니메/일러스트 텍스트→이미지 모델입니다(2B 파라미터, 설계상 실사 모델이 아닙니다).",
    "en": "Anima is ComfyUI's native anime/illustration text-to-image model (2B params, non-photorealistic by design)."
   }
  },
  {
   "h": {
    "ko": "모델 종류 (Base / Turbo / Preview3)",
    "en": "Model variants (Base / Turbo / Preview3)"
   },
   "body": {
    "ko": "• **Base 1.0** (`anima-base-v1.0.safetensors`) — 최고 품질 체크포인트. 30 steps / CFG 4. 4개 모드 모두에서 사용합니다.\n• **Turbo 1.0** — 별도 체크포인트가 아닙니다. Base 1.0 위에 Turbo LoRA(`anima-turbo-lora-v0.2.safetensors`)를 얹은 것이고 샘플링이 8 steps / CFG 1로 바뀝니다. 왼쪽 패널의 TURBO 스위치로 켭니다.\n• **Preview3-base** (`anima-preview3-base.safetensors`) — 이전/실험용 체크포인트. T2I 모드에서만 쓰고, Base 1.0보다 품질이 낮습니다. 비교하고 싶을 때만 Settings에서 고르세요.",
    "en": "• **Base 1.0** (`anima-base-v1.0.safetensors`) — full-quality checkpoint, 30 steps / CFG 4. Used by all 4 modes.\n• **Turbo 1.0** — NOT a separate checkpoint. It is the Turbo LoRA (`anima-turbo-lora-v0.2.safetensors`) applied on top of Base 1.0, which also switches sampling to 8 steps / CFG 1. Toggle it with the TURBO switch in the left panel.\n• **Preview3-base** (`anima-preview3-base.safetensors`) — an earlier/experimental checkpoint. T2I mode only. Lower quality than Base 1.0; select it in Settings only if you specifically want to compare."
   }
  },
  {
   "h": {
    "ko": "필요한 파일",
    "en": "Required files"
   },
   "body": {
    "ko": "| 파일 | 폴더 |\n|---|---|\n| qwen_3_06b_base.safetensors | `models/text_encoders/` |\n| qwen_image_vae.safetensors | `models/vae/` |\n| anima-base-v1.0.safetensors | `models/diffusion_models/` |\n| anima-preview3-base.safetensors (선택, T2I 전용) | `models/diffusion_models/` |\n| anima-turbo-lora-v0.2.safetensors (선택) | `models/loras/` |\n| anima-lllite-inpainting-v2.safetensors (Inpainting 모드) | `models/model_patches/` |\n| anima-lllite-any-test-like-v2.safetensors (Any Control 모드) | `models/model_patches/` |\n| anima-lllite-depth-1.safetensors (Depth Control 모드) | `models/model_patches/` |\n\n모든 파일은 HuggingFace의 circlestone-labs/Anima, circlestone-labs/Anima-Official-LoRAs, Comfy-Org/Anima-LLLite 저장소에서 받습니다.",
    "en": "| File | Folder |\n|---|---|\n| qwen_3_06b_base.safetensors | `models/text_encoders/` |\n| qwen_image_vae.safetensors | `models/vae/` |\n| anima-base-v1.0.safetensors | `models/diffusion_models/` |\n| anima-preview3-base.safetensors (optional, T2I only) | `models/diffusion_models/` |\n| anima-turbo-lora-v0.2.safetensors (optional) | `models/loras/` |\n| anima-lllite-inpainting-v2.safetensors (Inpainting mode) | `models/model_patches/` |\n| anima-lllite-any-test-like-v2.safetensors (Any Control mode) | `models/model_patches/` |\n| anima-lllite-depth-1.safetensors (Depth Control mode) | `models/model_patches/` |\n\nAll files download from the HuggingFace repos circlestone-labs/Anima, circlestone-labs/Anima-Official-LoRAs and Comfy-Org/Anima-LLLite."
   }
  },
  {
   "h": {
    "ko": "컨트롤 방식 (LLLite 패치)",
    "en": "Control mechanism (LLLite patch)"
   },
   "body": {
    "ko": "Inpainting / Any Control / Depth Control은 일반 ControlNet이 아니라 가벼운 **LLLite 모델 패치**(ModelPatchLoader → AnimaLLLiteApply)를 디퓨전 모델에 직접 적용하고, 이미지(Inpainting은 마스크도 함께)로 유도하는 방식입니다.\n\nDepth Control은 공식 템플릿의 Depth-Anything-3 파이프라인 대신 이 팩의 다른 도구가 이미 쓰는 DepthAnythingV2 전처리기를 재사용하므로, Krea2의 ControlNet 설정에서 이미 받은 것 외에 추가 다운로드가 필요 없습니다.",
    "en": "Inpainting / Any Control / Depth Control do NOT use a standard ControlNet — they use a lightweight **LLLite model patch** (ModelPatchLoader → AnimaLLLiteApply) applied directly onto the diffusion model, guided by an image (+ mask for Inpainting).\n\nDepth Control in this app reuses the DepthAnythingV2 preprocessor already installed for other tools in this pack (instead of the official template's Depth-Anything-3 pipeline), so no extra model download is required beyond what Krea2's ControlNet setup already uses."
   }
  }
 ]
});

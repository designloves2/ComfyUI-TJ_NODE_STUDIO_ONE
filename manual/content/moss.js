MANUAL.add({
 "id": "moss",
 "title": {
  "ko": "Moss Image ONE STUDIO",
  "en": "Moss Image ONE STUDIO"
 },
 "lead": {
  "ko": "MOSS-Image(약 5B) 전용 노드. 글자 렌더링과 박스 레이아웃(R2I)이 특징입니다.",
  "en": "Node for MOSS-Image (~5B). Known for text rendering and box layout (R2I)."
 },
 "sections": [
  {
   "h": {
    "ko": "화면 구성",
    "en": "The screen"
   },
   "body": {
    "ko": "**1. 모드 버튼** (맨 위 왼쪽) — T2I · I2I · R2I (bboxes) · INPAINT. 모드마다 왼쪽 패널의 입력칸이 바뀝니다.\n**2. Prompt/pipe Override 스위치** — 켜면 연결된 `prompt_override`·`pipe`를 사용하고, 끄면 연결돼 있어도 둘 다 무시합니다.\n**3. 오른쪽 위 아이콘** — ↺ 노드 초기화(저장값 삭제 후 기본값 복원) · ⇌ 비교 슬라이더(켜면 원본과 결과를 드래그로 비교) · 🗑 RAM/VRAM 비우기(모델 언로드) · ⚙ 설정 · 🖼 갤러리 · ? 사용 설명서.\n**4. 왼쪽 패널** — 해상도, STEPS / CFG(기본 25 / 2.5), SAMPLER / SCHEDULER(기본 er_sde / simple), **SLG — skip layer guidance** 체크박스, LoRA(최대 3개), SEED와 그 모드. I2I·INPAINT에는 소스 이미지와 DENOISE가, R2I에는 박스를 그리는 캔버스가 추가됩니다.\n**5. 가운데 큰 영역** — 결과 프리뷰. 생성 전에는 “Generate to see result”가 보입니다.\n**6. 프리뷰 아래** — Send to(→ I2I, → Inpaint) 버튼으로 결과를 다른 모드로 보내고, Output의 Preview / Save로 저장 방식을 고릅니다.\n**7. 프롬프트 줄** — 글자 수, Auto Enhance, Refine, Prompt Edit, Prompt Preset, EN/한 번역 버튼.\n**8. Generate / Stop** — 생성 시작과 중지. 그 위에 SEED와 시드 모드(Random 등)가 있습니다.",
    "en": "**1. Mode buttons** (top left) — T2I · I2I · R2I (bboxes) · INPAINT. The inputs in the left panel change with the mode.\n**2. Prompt/pipe Override switch** — On: a connected `prompt_override` / `pipe` is used. Off: both are ignored even while connected.\n**3. Icons at the top right** — ↺ reset the node (deletes saved values, restores defaults) · ⇌ compare slider (drag to compare the source and the result) · 🗑 free RAM/VRAM (unload models) · ⚙ settings · 🖼 gallery · ? built-in help.\n**4. Left panel** — resolution, STEPS / CFG (default 25 / 2.5), SAMPLER / SCHEDULER (default er_sde / simple), the **SLG — skip layer guidance** checkbox, LoRA (up to 3), SEED and its mode. I2I and INPAINT add a source image and DENOISE; R2I adds the box-drawing canvas.\n**5. Large middle area** — the result preview. Before a run it says “Generate to see result”.\n**6. Under the preview** — the Send to buttons (→ I2I, → Inpaint) hand the result to another mode; Output Preview / Save chooses whether results are saved.\n**7. Prompt row** — character count, Auto Enhance, Refine, Prompt Edit, Prompt Preset and the EN / 한 translation button.\n**8. Generate / Stop** — start and stop a run. Above them are SEED and the seed mode (Random, …)."
   },
   "img": {
    "src": "img/moss-main.png",
    "cap": {
     "ko": "Moss Image ONE STUDIO",
     "en": "Moss Image ONE STUDIO"
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
    "src": "img/moss-settings.png",
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
    "ko": "MOSS-Image는 공개된 약 5B 텍스트→이미지 모델입니다(single-stream DiT, FLUX.2 small VAE, Qwen3.5 텍스트 인코더). 영어/중국어 글자 렌더링과 레이아웃 제어에 강하고 Apache 2.0 라이선스입니다.",
    "en": "MOSS-Image is an open ~5B text-to-image model (single-stream DiT, FLUX.2 small VAE, Qwen3.5 text encoder). Strong at English / Chinese text rendering and layout control. Apache 2.0."
   }
  },
  {
   "h": {
    "ko": "모드",
    "en": "Modes"
   },
   "body": {
    "ko": "• **T2I** — 프롬프트로 이미지를 만듭니다.\n• **I2I** — 소스 이미지를 latent로 인코딩해 다시 노이즈를 입힌 뒤 그립니다. DENOISE가 변화 폭을 정합니다. (MOSS 자체에는 레퍼런스 이미지 입력이 없습니다.)\n• **R2I (bboxes)** — 캔버스에 박스를 그립니다. 박스 하나는 **OBJECT**(설명한 사물) 또는 **TEXT**(그대로 그릴 글자)입니다. 박스들은 MOSSImageLayoutPrompt를 거쳐, 이미지 전체 설명인 PROMPT와 함께 모델이 학습한 레이아웃 프롬프트로 바뀝니다. 배경 요소를 먼저, 전경을 나중에 그리세요. “Characters”에는 인물로 표시할 OBJECT 박스 번호를 `1, 3`처럼 적습니다.",
    "en": "• **T2I** — prompt to image.\n• **I2I** — the source image is encoded to a latent and re-noised; DENOISE sets how far it may change. (MOSS itself has no reference-image input.)\n• **R2I (bboxes)** — draw boxes on the canvas. Each box is an **OBJECT** (a described thing) or a **TEXT** block (exact words to render). Boxes go through MOSSImageLayoutPrompt, which turns them plus your PROMPT (description of the whole image) into the layout prompt the model was trained on. Draw the background element first and foreground last. “Characters” = numbers of the object boxes to label as characters, e.g. `1, 3`."
   }
  },
  {
   "h": {
    "ko": "크기",
    "en": "Size"
   },
   "body": {
    "ko": "총 픽셀 수 1M, 1.5M, 2M를 권장합니다(0.25M~4M도 동작). 가로와 세로는 16의 배수여야 합니다.",
    "en": "Total pixels of 1M, 1.5M or 2M are recommended (0.25M to 4M works). Width and height must be multiples of 16."
   }
  },
  {
   "h": {
    "ko": "샘플링",
    "en": "Sampling"
   },
   "body": {
    "ko": "ComfyUI 템플릿 기본값은 25 steps / CFG 2.5 / er_sde / simple 입니다(공식 기본값은 50 steps / CFG 3 / Euler). SFT 체크포인트는 글자 레이아웃이 더 선명하고, Base는 후처리 학습이 없어 LoRA에 더 적합합니다.\nSLG(skip layer guidance, layer 22)는 선택 사항입니다. 끄면 더 사실적이고, 켜면 디테일이 유지되지만 애니풍은 과하게 날릴 수 있습니다.\n권장 네거티브: `nsfw, worst quality, bad anatomy, watermark, jpeg artifact`",
    "en": "ComfyUI template defaults: 25 steps / CFG 2.5 / er_sde / simple. The official defaults are 50 steps / CFG 3 / Euler. SFT checkpoints give clearer text layouts; Base has no post-training (better for LoRAs).\nSLG (skip layer guidance, layer 22) is optional: off looks more realistic, on keeps detail but can overblow anime styles.\nRecommended negative prompt: `nsfw, worst quality, bad anatomy, watermark, jpeg artifact`"
   }
  },
  {
   "h": {
    "ko": "필요한 파일",
    "en": "Required files"
   },
   "body": {
    "ko": "| 파일 | 폴더 |\n|---|---|\n| moss_image_sft_int8_convrot.safetensors (또는 moss_image_sft_bf16 / moss_image_base_*) | `models/diffusion_models/` |\n| qwen3.5_9b_w4a8_gptq.safetensors (CLIP 타입 moss_image로 로드) | `models/text_encoders/` |\n| flux2-vae.safetensors (flux2-vae_small.safetensors) | `models/vae/` |\n\nHugging Face의 Comfy-Org/MOSS-Image에서 받습니다. MOSS-Image 노드(EmptyFlux2LatentImage, MOSSImageLayoutPrompt, CreateBoundingBoxes)가 들어 있는 최신 ComfyUI가 필요합니다.",
    "en": "| File | Folder |\n|---|---|\n| moss_image_sft_int8_convrot.safetensors (or moss_image_sft_bf16 / moss_image_base_*) | `models/diffusion_models/` |\n| qwen3.5_9b_w4a8_gptq.safetensors (loaded as CLIP type moss_image) | `models/text_encoders/` |\n| flux2-vae.safetensors (flux2-vae_small.safetensors) | `models/vae/` |\n\nDownload from Hugging Face: Comfy-Org/MOSS-Image. You need a ComfyUI recent enough to have the MOSS-Image nodes (EmptyFlux2LatentImage, MOSSImageLayoutPrompt, CreateBoundingBoxes)."
   }
  }
 ]
});

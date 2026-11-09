MANUAL.add({
 "id": "qwen21",
 "title": {
  "ko": "Qwen Image 2.1 ONE STUDIO",
  "en": "Qwen Image 2.1 ONE STUDIO"
 },
 "lead": {
  "ko": "Qwen Image 2.1 계열 전용 노드. 레퍼런스 최대 10장, 편집, 인페인트/아웃페인트, 업스케일, 포즈 복사.",
  "en": "Node for the Qwen Image 2.1 family: up to 10 references, editing, inpaint / outpaint, upscale and pose copy."
 },
 "sections": [
  {
   "h": {
    "ko": "화면 구성",
    "en": "The screen"
   },
   "body": {
    "ko": "**1. 모드 버튼** (맨 위 왼쪽) — T2I · I2I(I2I / Ref to Image 하위 탭) · EDIT · PAINT(Inpaint / Outpaint 하위 탭) · POSE · UPSCALE. 모드마다 왼쪽 패널의 입력칸이 바뀝니다.\n**2. Prompt/pipe Override 스위치** — 켜면 연결된 `prompt_override`·`pipe`를 사용하고, 끄면 연결돼 있어도 둘 다 무시합니다.\n**3. 오른쪽 위 아이콘** — ↺ 노드 초기화(저장값 삭제 후 기본값 복원) · 🗑 RAM/VRAM 비우기(모델 언로드) · ⚙ 설정 · 🖼 갤러리 · ? 사용 설명서 (이 노드에는 ⇌ 비교 슬라이더가 없습니다).\n**4. 왼쪽 패널** — 모드별 입력칸(T2I는 해상도 프리셋, I2I/EDIT/PAINT/POSE는 Source Image 또는 레퍼런스 격자와 Denoise 등), STEPS / CFG, SAMPLER / SCHEDULER, LoRA(최대 3개), SEED와 그 모드.\n**5. 가운데 큰 영역** — 결과 프리뷰. 생성 전에는 “Generate to see result”가 보입니다.\n**6. 프리뷰 아래** — Send to(→ I2I, → Edit, → Inpaint, → Outpaint, → Upscale, → Pose (Character)) 버튼으로 결과를 다른 모드로 보내고, Output의 Preview / Save로 저장 방식을 고릅니다.\n**7. 프롬프트 줄** — 글자 수, Auto Enhance, Refine, Prompt Edit, Prompt Preset, EN/한 번역 버튼.\n**8. Generate / Stop** — 생성 시작과 중지. 그 위에 SEED와 시드 모드(Random 등)가 있습니다.",
    "en": "**1. Mode buttons** (top left) — T2I · I2I(I2I / Ref to Image 하위 탭) · EDIT · PAINT(Inpaint / Outpaint 하위 탭) · POSE · UPSCALE. The inputs in the left panel change with the mode.\n**2. Prompt/pipe Override switch** — On: a connected `prompt_override` / `pipe` is used. Off: both are ignored even while connected.\n**3. Icons at the top right** — ↺ reset the node (deletes saved values, restores defaults) · 🗑 free RAM/VRAM (unload models) · ⚙ settings · 🖼 gallery · ? built-in help (this node has no ⇌ compare slider).\n**4. Left panel** — the inputs of the current mode (a resolution preset in T2I; the Source Image or the reference grid, Denoise, … in I2I / EDIT / PAINT / POSE), STEPS / CFG, SAMPLER / SCHEDULER, LoRA (up to 3), SEED and its mode.\n**5. Large middle area** — the result preview. Before a run it says “Generate to see result”.\n**6. Under the preview** — the Send to buttons (→ I2I, → Edit, → Inpaint, → Outpaint, → Upscale, → Pose (Character)) hand the result to another mode; Output Preview / Save chooses whether results are saved.\n**7. Prompt row** — character count, Auto Enhance, Refine, Prompt Edit, Prompt Preset and the EN / 한 translation button.\n**8. Generate / Stop** — start and stop a run. Above them are SEED and the seed mode (Random, …)."
   },
   "img": {
    "src": "img/qwen21-main.png",
    "cap": {
     "ko": "Qwen Image 2.1 ONE STUDIO",
     "en": "Qwen Image 2.1 ONE STUDIO"
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
    "src": "img/qwen21-settings.png",
    "cap": {
     "ko": "⚙ 설정 창",
     "en": "The ⚙ settings window"
    }
   }
  },
  {
   "h": {
    "ko": "T2I",
    "en": "T2I"
   },
   "body": {
    "ko": "글로 이미지를 만듭니다. 해상도 프리셋(또는 Custom 가로/세로)을 고르고 프롬프트를 쓴 뒤 Generate를 누릅니다.",
    "en": "Text-to-image. Pick a resolution preset (or Custom W/H), write a prompt, Generate."
   }
  },
  {
   "h": {
    "ko": "I2I",
    "en": "I2I"
   },
   "body": {
    "ko": "Source Image 한 장과 Denoise 슬라이더로 변형합니다. 낮을수록 원본을 많이 유지하고 1.0이면 완전히 다시 그립니다. 🔒 Lock ratio 토글로 비율을 잠그고 출력 크기를 직접 정할 수도 있습니다.",
    "en": "Image-to-image with a single Source Image and a Denoise slider — lower keeps more of the original, 1.0 rewrites it fully. Optional custom output size with a 🔒 Lock ratio toggle."
   }
  },
  {
   "h": {
    "ko": "I2I — Ref to Image",
    "en": "I2I — Ref to Image"
   },
   "body": {
    "ko": "레퍼런스 이미지를 최대 10장까지 넣고 프롬프트로 새 이미지를 만듭니다. 출력 해상도는 따로 정하며, ‘원본’ 한 장이 없고 모든 레퍼런스가 같은 비중의 입력입니다.",
    "en": "Up to 10 reference images composed into a new image from your prompt, at its own output resolution — no single 'source' image, all references are equal inputs."
   }
  },
  {
   "h": {
    "ko": "EDIT",
    "en": "EDIT"
   },
   "body": {
    "ko": "Image 1이 메인 레퍼런스이고 Image 2~10은 작은 격자의 추가 레퍼런스입니다(끌어서 순서 변경). 이미지마다 바꿀 곳을 가리키는 ✏ 손그림 표시를 넣을 수 있고, 이 표시는 마스크가 아니라 추가 레퍼런스로 전달됩니다.",
    "en": "Image 1 is the main reference; Images 2–10 are extra references in a compact grid (drag to reorder). Each image can get its own hand-drawn ✏ annotation pointing at what to change — the annotation is sent as an extra reference, not a mask."
   }
  },
  {
   "h": {
    "ko": "PAINT — Inpaint",
    "en": "PAINT — Inpaint"
   },
   "body": {
    "ko": "Source Image 위에 직접 그려서(✏ Draw mask) 바꿀 영역을 표시합니다. 별도 마스크 파일은 없고, 표시한 이미지가 원본과 함께 두 번째 레퍼런스로 전달됩니다.",
    "en": "Draw directly on the Source Image to mark the area to change (✏ Draw mask). No separate mask file — the marked-up image is sent as a second reference alongside the original."
   }
  },
  {
   "h": {
    "ko": "PAINT — Outpaint",
    "en": "PAINT — Outpaint"
   },
   "body": {
    "ko": "캔버스를 위/아래/왼쪽/오른쪽으로 넓히고, 새 테두리를 Pad Color로 채운 뒤 모델이 그 부분까지 장면을 이어 그리게 합니다.",
    "en": "Expands the canvas (Up/Down/Left/Right) and fills the new border with Pad Color before asking the model to extend the scene into it."
   }
  },
  {
   "h": {
    "ko": "POSE",
    "en": "POSE"
   },
   "body": {
    "ko": "Image 1의 포즈를 Image 2의 캐릭터에 복사합니다. VNCCS PoseStudio LoRA를 사용하며, 먼저 ⚙ Settings에서 선택해야 합니다. 🧊 Preview & Angle을 누르면 Image 1 영역에 실시간 3D 보기가 열려 포즈를 먼저 만들 수 있습니다(드래그로 회전, 휠로 확대, 오른쪽 드래그로 이동). Generate 시점에 보이는 화면이 포즈 이미지로 쓰입니다. 이 단계를 쓰지 않으면 예전처럼 이미지에서 자동으로 포즈를 만듭니다. 시스템 프롬프트(Settings에서 수정·초기화 가능)가 PROMPT 칸에 쓴 내용 앞에 자동으로 붙습니다.",
    "en": "Copies the pose from Image 1 onto the character in Image 2, using the VNCCS PoseStudio LoRA (select it in ⚙ Settings first). Click 🧊 Preview & Angle to build the 3D pose first: it opens a live 3D view in the Image 1 area (drag to rotate, wheel to zoom, right-drag to pan) and the view as shown at Generate is used as the pose image. Without it the pose is rendered automatically from the image as before. The system prompt (editable/resettable in Settings) is automatically prepended to whatever you write in the PROMPT field."
   }
  },
  {
   "h": {
    "ko": "UPSCALE",
    "en": "UPSCALE"
   },
   "body": {
    "ko": "SeedVR2 업스케일러입니다. `models/SEEDVR2/`에서 DiT와 VAE 모델 한 쌍을 고르며, 위쪽 Qwen 모델과는 별개입니다.",
    "en": "SeedVR2 upscaler — pick a DiT + VAE model pair from models/SEEDVR2/, independent of the Qwen model above."
   }
  },
  {
   "h": {
    "ko": "Model Override",
    "en": "Model Override"
   },
   "body": {
    "ko": "Settings에서 켜면 노드 자체에 model/clip/vae 입력 소켓이 생겨, 외부 로더가 생성하는 순간에만 이 노드의 Settings 선택을 덮어쓸 수 있습니다.",
    "en": "Enable in Settings to expose model/clip/vae input sockets on the node itself, so an external loader can override this node's own Settings selection at generation time only."
   }
  },
  {
   "h": {
    "ko": "Send to / Gallery",
    "en": "Send to / Gallery"
   },
   "body": {
    "ko": "현재 결과를 다음 모드의 Source / Image 1 칸으로 복사하거나, 🖼 Gallery에서 이 노드의 생성 기록을 둘러봅니다.",
    "en": "Copies the current result into the next mode's Source/Image 1 slot, or browse this node's own render history in 🖼 Gallery."
   }
  },
  {
   "h": {
    "ko": "POSE — LoRA와 모델",
    "en": "POSE — LoRA and model"
   },
   "body": {
    "ko": "`VNCCS_QI2_PoseStudioV1.1.safetensors`를 받아 `models/loras/`에 넣고, ⚙ Settings → POSE — Pose Copy Settings에서 선택합니다. (huggingface.co/MIUProject/VNCCS_PoseStudio_QI2.1)\nPOSE의 포즈 추출과 3D 미리보기에는 SAM3D Body 모델 파일 하나가 `ComfyUI/models/detection/`에 필요합니다. 다운로드 링크는 노드 안 ? 도움말에 있습니다.",
    "en": "Download `VNCCS_QI2_PoseStudioV1.1.safetensors`, place it in `models/loras/`, then select it under ⚙ Settings → POSE — Pose Copy Settings. (huggingface.co/MIUProject/VNCCS_PoseStudio_QI2.1)\nThe POSE pose-extraction / 3D preview step needs one SAM3D Body model file under `ComfyUI/models/detection/`. The download link is in the node's ? help."
   }
  }
 ]
});

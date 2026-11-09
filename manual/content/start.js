MANUAL.add({
 "id": "start",
 "title": {
  "ko": "시작하기",
  "en": "Getting started"
 },
 "lead": {
  "ko": "ONE STUDIO는 노드 하나에서 모드를 바꿔 쓰는 ComfyUI 커스텀 노드 팩입니다.",
  "en": "ONE STUDIO is a ComfyUI custom node pack where one node switches between modes."
 },
 "sections": [
  {
   "h": {
    "ko": "포함된 노드",
    "en": "Included nodes"
   },
   "body": {
    "ko": "노드는 12개입니다. 이미지 8개(Z-Image, Klein, Qwen Image Edit 2511, Qwen Image 2.1, Krea 2, SDXL, Anima, Moss), 영상 2개(MiniMax H3, LTX 2.5), 음악 1개(MusicMaker), 편집 1개(ITDA). 노드를 추가하면 화면 전체가 하나의 앱처럼 열리고, 모드는 맨 위 버튼으로 바꿉니다.\n\n| **Z-Image ONE STUDIO (TJ)** | Z-Image Turbo (flow-matching) | T2I · I2I · Inpaint · Outpaint · RE-BG · ControlNet · Face Redraw · **Upscale** |\n| **Flux.2 Klein ONE STUDIO (TJ)** | Flux.2-Klein (9B / 4B) | T2I · I2I · Edit · **Inpaint · Outpaint** · Faceswap · **Upscale** |\n| **Qwen Image Edit 2511 ONE STUDIO (TJ)** | Qwen2.5-VL 기반 Image Edit 모델 | T2I · I2I · Edit(최대 3장) · Inpaint · **Outpaint** · Faceswap · **Angle** · **Upscale** |\n| **Qwen Image 2.1 ONE STUDIO (TJ)** 🆕 | Qwen Image 2.1 모델 계열 | T2I · I2I · Ref to Image(최대 10장) · Edit(최대 10장) · Inpaint · Outpaint · Upscale · **POSE(VNCCS PoseStudio LoRA)** |\n| **Krea 2 ONE STUDIO (TJ)** | Krea.ai 이미지 생성 모델 | T2I · I2I · **ControlNet(depth/canny 🧪)** · **IDENTITY 🧪** · **Upscale** |\n| **SDXL ONE STUDIO (TJ)** | SDXL Checkpoint / Separate UNET 모델 | T2I · I2I · Inpaint · Outpaint · Upscale *(테스트 버전 / Test Version)* |\n| **MiniMax H3 ONE STUDIO (TJ)** | MiniMax H3 영상+오디오 생성 모델 | Text / First-Last / Reference · **클립 릴레이 + 자동 합본** · 라이브 프리뷰 · **Postprocess** · **Image Generator** · **Character Sheet** *(실험적 / Experimental)* |\n| **Anima ONE STUDIO (TJ)** 🆕 | Anima (ComfyUI 네이티브 애니메이션풍 이미지 모델) | T2I · Inpainting · Any Control to Image · Depth Control to Image · **Turbo LoRA** · **인라인 마스크 페인터** |\n| **Moss Image ONE STUDIO (TJ)** 🆕 | MOSS-Image (오픈 ~5B 텍스트→이미지 모델, 영·중 문자 렌더링과 레이아웃 제어) | T2I · I2I · INPAINT · R2I (bboxes) |\n| **MusicMaker ONE STUDIO (TJ)** 🆕 | Ace-Step 1.5 · MiniMax Music 3 · YuE2 (음악 생성) | 노래 / 연주곡 · 3 엔진 · **Melody Editor(피아노롤 + MIDI 건반)** · **앨범 커버 복사/붙여넣기/업로드/갤러리** · **대기 큐** · 캡션·가사 LLM (로컬 / OpenRouter / TextGenerate / Connect Custom) · 태그가 박힌 파일 |\n| **ITDA ONE STUDIO (TJ)** 🆕 | 영상·오디오 스티치 타임라인 (ffmpeg) | 3-레인 타임라인 · 분할 / 그룹 / 스티치 / 스냅 · 웨이브폼 · Auto Stitch · 장면/비트 감지 · 내보내기 · H3 영상 갤러리·MusicMaker 플레이리스트에서 불러오기 |",
    "en": "There are 12 nodes: 8 image nodes (Z-Image, Klein, Qwen Image Edit 2511, Qwen Image 2.1, Krea 2, SDXL, Anima, Moss), 2 video nodes (MiniMax H3, LTX 2.5), 1 music node (MusicMaker) and 1 editing node (ITDA). Add a node and it opens as a small app inside the node; modes are switched with the buttons at the top.\n\n| **Z-Image ONE STUDIO (TJ)** | Z-Image Turbo (flow-matching) | T2I · I2I · Inpaint · Outpaint · RE-BG · ControlNet · Face Redraw · **Upscale** |\n| **Flux.2 Klein ONE STUDIO (TJ)** | Flux.2-Klein (9B / 4B) | T2I · I2I · Edit · **Inpaint · Outpaint** · Faceswap · **Upscale** |\n| **Qwen Image Edit 2511 ONE STUDIO (TJ)** | Qwen2.5-VL based Image Edit model | T2I · I2I · Edit(up to 3 images) · Inpaint · **Outpaint** · Faceswap · **Angle** · **Upscale** |\n| **Qwen Image 2.1 ONE STUDIO (TJ)** 🆕 | Qwen Image 2.1 model family | T2I · I2I · Ref to Image(up to 10 images) · Edit(up to 10 images) · Inpaint · Outpaint · Upscale · **POSE (VNCCS PoseStudio LoRA)** |\n| **Krea 2 ONE STUDIO (TJ)** | Krea.ai image generation model | T2I · I2I · **ControlNet(depth/canny 🧪)** · **IDENTITY 🧪** · **Upscale** |\n| **SDXL ONE STUDIO (TJ)** | SDXL Checkpoint / Separate UNET model | T2I · I2I · Inpaint · Outpaint · Upscale ** |\n| **MiniMax H3 ONE STUDIO (TJ)** | MiniMax H3 video + audio model | Text / First-Last / Reference · **클립 릴레이 + 자동 합본** · 라이브 프리뷰 · **Postprocess** · **Image Generator** · **Character Sheet** ** |\n| **Anima ONE STUDIO (TJ)** 🆕 | Anima (ComfyUI-native anime-style image model) | T2I · Inpainting · Any Control to Image · Depth Control to Image · **Turbo LoRA** · **inline mask painter** |\n| **Moss Image ONE STUDIO (TJ)** 🆕 | MOSS-Image (open ~5B text-to-image model, strong English / Chinese text rendering and layout control) | R2I = 박스를 그려 오브젝트·텍스트 위치 지정 / draw boxes for objects and exact text |\n| **MusicMaker ONE STUDIO (TJ)** 🆕 | Ace-Step 1.5 / MiniMax Music 3 / YuE2 music model | song / instrumental · 3 engines · **Melody Editor (piano roll + MIDI keyboard)** · **album cover copy / paste / upload / gallery** · **generation queue** · caption+lyric LLM (local / OpenRouter / TextGenerate / Connect Custom) · tags embedded in the file |\n| **ITDA ONE STUDIO (TJ)** 🆕 | video / audio stitch timeline (ffmpeg) | 3-lane timeline · split / group / stitch / snap · waveforms · Auto Stitch · scene/beat detect · export · import from the H3 video gallery and MusicMaker playlist |"
   }
  },
  {
   "h": {
    "ko": "설치",
    "en": "Installation"
   },
   "body": {
    "ko": "**ComfyUI Manager(권장)** — Manager → Install Custom Nodes에서 `ComfyUI-TJ_NODE_STUDIO_ONE`를 검색해 설치합니다.\n**수동 설치** — `ComfyUI/custom_nodes` 폴더에서 `git clone https://github.com/designloves2/ComfyUI-TJ_NODE_STUDIO_ONE.git`를 실행합니다.\nComfyUI를 재시작하면 Add Node 메뉴에서 모든 노드를 찾을 수 있습니다.",
    "en": "**ComfyUI Manager (recommended)** — in Manager → Install Custom Nodes, search for `ComfyUI-TJ_NODE_STUDIO_ONE` and install it.\n**Manual install** — run `git clone https://github.com/designloves2/ComfyUI-TJ_NODE_STUDIO_ONE.git` inside `ComfyUI/custom_nodes`.\nAfter restarting ComfyUI, all the nodes are in the Add Node menu."
   }
  },
  {
   "h": {
    "ko": "⚠ 설치 뒤 꼭 해야 할 일",
    "en": "⚠ Required step after install"
   },
   "body": {
    "ko": "**ComfyUI-Manager로 이 패키지를 설치하면 Python 패키지는 자동으로 설치되지만, 이 노드가 의존하는 다른 커스텀 노드 팩은 자동으로 설치되지 않습니다.** (Manager의 nightly/git 설치 경로에는 노드 팩을 자동 설치하는 기능이 없습니다.) 설치 직후 아래 스크립트를 **한 번** 실행한 뒤 ComfyUI를 재시작하세요. 실행하지 않으면 노드는 뜨지만 Face Redraw · Faceswap · ControlNet · RE-BG · Upscale · MiniMax H3 Reference 등 여러 모드가 로드에 실패합니다. 어떤 팩이 빠졌는지는 ComfyUI 시작 시 콘솔에 배너로 표시됩니다.\n\n**Windows:** 패키지 폴더의 `install_requirements.bat`을 더블클릭\n**Mac / Linux:** `bash install_requirements.sh`",
    "en": "\n\n**Windows:** double-click `install_requirements.bat` in the package folder\n**Mac / Linux:** `bash install_requirements.sh`"
   }
  },
  {
   "h": {
    "ko": "언어",
    "en": "Language"
   },
   "body": {
    "ko": "모든 노드의 ⚙ Settings에서 한국어 / English를 고를 수 있습니다. 바꾸면 페이지를 새로고침합니다.",
    "en": "Every node's ⚙ Settings lets you choose Korean or English. Changing it reloads the page."
   }
  },
  {
   "h": {
    "ko": "PromptDB 연동 (pipe)",
    "en": "PromptDB hookup (pipe)"
   },
   "body": {
    "ko": "모든 ONE STUDIO 노드에는 `pipe` 입력이 있어, [ComfyUI-TJ_NODE](https://github.com/designloves2/ComfyUI-TJ_NODE)의 **PromptDBLoader(TJ)**에서 고른 기록을 소켓 하나로 받아 **생성하는 순간에 적용**합니다. 적용되는 값은 프롬프트(pos/neg) · seed · steps · cfg · sampler · scheduler입니다. **모델은 pipe로 바뀌지 않고** 각 노드가 자기 설정의 모델을 씁니다. pipe에 있는 값만 덮어쓰고 나머지는 노드 값 그대로이며, 노드 화면은 바뀌지 않습니다. TJ_NODE가 없으면 그 소켓만 비활성이고 노드는 정상 동작합니다.\n\n이미지 노드에는 이 밖에 두 가지가 더 있습니다.\n• **`prompt_override`** — 연결하면 노드의 프롬프트를 **통째로 대체**하고, pipe의 프롬프트보다 우선합니다(PromptDBLoader, 일반 텍스트 노드, Reroute를 거친 연결 모두 읽습니다).\n• **출력 `prompt`와 `settings`** — 생성 뒤 실제로 쓰인 프롬프트(문자열)와 설정(JSON: model, seed, steps, cfg, sampler, scheduler, positive_prompt, negative_prompt)을 내보냅니다. `settings`를 `PromptDBSave(TJ)`의 `json_input`에 연결하면 DB에 저장됩니다.\n\n맨 위 **Prompt/pipe Override** 스위치를 끄면 연결된 `prompt_override`와 `pipe`를 둘 다 무시합니다.",
    "en": "Every ONE STUDIO node has a `pipe` input. It receives a record picked in **PromptDBLoader(TJ)** from [ComfyUI-TJ_NODE](https://github.com/designloves2/ComfyUI-TJ_NODE) through a single socket and **applies it at generation time**: prompt (pos/neg), seed, steps, cfg, sampler and scheduler. **The model is not taken from the pipe** — each node keeps its own configured model. Only the fields present in the pipe override the node's values, the rest stay as set, and the node's screen never changes. Without TJ_NODE only that socket is inactive; the node works normally.\n\nThe image nodes have two more:\n• **`prompt_override`** — when connected it **replaces the node's prompt outright** and wins over the pipe's prompt (it reads a PromptDBLoader, any text node, or either through a Reroute).\n• **Outputs `prompt` and `settings`** — after a run they give the prompt that was really used (string) and the settings (JSON: model, seed, steps, cfg, sampler, scheduler, positive_prompt, negative_prompt). Wire `settings` into `PromptDBSave(TJ)`'s `json_input` to store it in the DB.\n\nThe **Prompt/pipe Override** switch at the top ignores both the connected `prompt_override` and `pipe` when turned off."
   }
  }
 ]
});
